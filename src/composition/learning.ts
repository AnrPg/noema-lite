/**
 * The learning log in the roots: its registration (an EventStore adapter + the application's LearningLog, stamped by the
 * sync's device clock), the seams it fills for the other features (the read models' STUDY_EVENTS, the sync's
 * SYNC_EVENT_LOG and LEGACY_PROGRESS, the Roadmaps' ROADMAP_EVENTS) and its name on the phase bridge, NoemaCore.learning, which speaks the old code's language (plain values, promises, exceptions turned
 * into reports). Surface (keep docs/ARCHITECTURE.md §6 in step):
 *
 *   NoemaCore.learning.open(account) → Promise<{ account, events, migrated, unknown, fromSnapshot }>   (before any screen)
 *   NoemaCore.learning.account() → the account the log is open for, or null
 *   NoemaCore.learning.record({ type, subject?, item?, data, origin?, id?, day? }) → the event | null (reported when refused)
 *   NoemaCore.learning.recordOnce([draft with its id]) → Promise<the events recorded> (those never seen) · idFor(prefix, parts)
 *   NoemaCore.learning.cardRating(grade 0|1|2) · playbookRating(grade 0|1|2, ticked 0–1) → the FSRS rating (1–4) of the old buttons
 *   NoemaCore.learning.progress(subject) → the subject's progress (xp, read, res, fc, pb, boss, last, att, act, flags, …:
 *                                         the same object while events fold in; read only) · hasProgress(subject)
 *   NoemaCore.learning.progressOf(account, subject) → the same, or null (no progress, or the log is open for another account)
 *   NoemaCore.learning.stats() → { xp, xpDay, streak, lastDay, bySubject }
 *   NoemaCore.learning.settings(subject?) → the settings in force · settingsWritten(value) → changes recorded
 *   NoemaCore.learning.setSubjectSetting(subject, key, value) · onSettings(fn) → unsubscribe
 *   NoemaCore.learning.onChange(fn(events, why)) → unsubscribe        (why: local | tab | append | refold)
 *   NoemaCore.learning.events() · eventsOf(account) · exportLog() · xapi(subject) · archive() → Promise
 *   NoemaCore.learning.append(events) → Promise<added> · restore(events, { mode, madeAt, account? }) → Promise<{ added }>
 *   NoemaCore.learning.backupStamp(events, madeAt) · flush() → Promise<boolean> · pending() · migrate() · compact() · clear(account)
 */
import { browserEventStore } from '../adapters/browser/event-store.ts';
import { memoryEventStore } from '../adapters/memory/event-store.ts';
import type { RoadmapEventLog } from '../features/roadmaps/application/ports.ts';
import type { RoadmapEvent } from '../features/roadmaps/domain/events.ts';
import { LearningLog } from '../features/study/application/learning-log.ts';
import {
  cardRating,
  contentId,
  feedContext,
  feedEvents,
  playbookRating,
  wallOf,
  type EventDraft,
  type FeedEvent,
  type LearningEvent,
} from '../features/study/domain/events/index.ts';
import { deviceClock } from '../features/sync/application/device.ts';
import { SYNC_COLLECTION, type Outbox } from '../features/sync/application/outbox.ts';
import type { LegacyProgress, SyncEventLog } from '../features/sync/application/ports.ts';
import { NoemaError } from '../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../kernel/result.ts';
import type { Unsubscribe } from '../ports/common.ts';
import type { EventOutbox } from '../ports/event-store.ts';
import type { BridgeExtension } from './bridge.ts';
import type { Registration, Resolver } from './container.ts';
import { ROADMAP_EVENTS } from './roadmaps.ts';
import { STUDY_EVENTS } from './study.ts';
import { DEVICE_CLOCK, LEGACY_PROGRESS, OUTBOX, randomId, SYNC_EVENT_LOG } from './sync.ts';
import { CLOCK, ERRORS, EVENT_STORE, I18N, LEARNING, NOTIFIER, STORAGE } from './tokens.ts';

const cryptoOf = (): { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } | undefined =>
  (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;

/** A UUID v4 (crypto.randomUUID, else from getRandomValues). */
export function uuid(): string {
  const c = cryptoOf();
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function logOf(r: Resolver): LearningLog {
  const storage = r.get(STORAGE);
  // a full storage: the store's writes raise the storage's own full signal (the learner's warning, src/composition/browser.ts)
  return new LearningLog({
    store: r.get(EVENT_STORE),
    clock: r.get(CLOCK),
    kv: storage.kv,
    stamps: r.get(DEVICE_CLOCK),
    newId: uuid,
    errors: r.get(ERRORS),
    notifier: r.get(NOTIFIER),
    i18n: r.get(I18N),
    quota: { estimate: () => storage.estimate(), persist: () => storage.persist() },
  });
}

/** The sync's outbox as the event store writes into it (in the append's own transaction, collection `sync`). */
const outboxOf = (o: Outbox): EventOutbox => ({
  collections: [SYNC_COLLECTION],
  enqueueIn: (tx, account, events) => o.enqueueIn(tx, account, events),
  notify: account => {
    o.notify(account);
  },
});

/** The sync's event log (SYNC_EVENT_LOG): the events of the account's other devices go into the learning log. */
export function learningSyncLog(r: Resolver): SyncEventLog {
  return { receive: (account, events) => r.get(LEARNING).receive(account, events) };
}

/** The cloud's progress rows from before the log (LEGACY_PROGRESS): converted to events once, like this device's own. */
export function learningLegacyProgress(r: Resolver): LegacyProgress {
  return {
    async accept(account, key, value) {
      const x = await r.get(LEARNING).importLegacy(account, key, value);
      return x.ok ? OK_VOID : x;
    },
  };
}

/** The Roadmap events (ROADMAP_EVENTS) as events of the learning log: appended once each by id, read back in log order. */
export function learningRoadmapEvents(r: Resolver): RoadmapEventLog {
  const log = (): LearningLog => r.get(LEARNING);
  return {
    async append(account, events) {
      const drafts: EventDraft[] = [];
      for (const e of events) {
        const d = roadmapDraft(e);
        if (!d.ok) return d;
        drafts.push(d.value);
      }
      return log().recordIn(account, drafts);
    },
    async list(account, roadmap) {
      const all = await log().eventsOf(account);
      if (!all.ok) return all;
      const out: RoadmapEvent[] = [];
      for (const e of all.value) {
        const x = roadmapEventOf(e);
        if (x && (roadmap === undefined || x.roadmap === roadmap)) out.push(x);
      }
      return ok(out);
    },
  };
}

const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
/** A Roadmap event as a draft of the log: its own id when the log can keep it as it is (lvl:<roadmap>:<level>), else one made from it. */
function roadmapDraft(e: RoadmapEvent): Result<EventDraft> {
  const id = EVENT_ID.test(e.id) ? e.id : contentId('rdm', [e.id]);
  switch (e.type) {
    case 'roadmap.level.reached':
      return ok({ id, type: e.type, data: { roadmap: e.roadmap, level: e.level, from: e.from, how: e.how } });
    case 'roadmap.level.tested':
      return ok({ id, type: e.type, data: { roadmap: e.roadmap, level: e.level, score: e.score, passed: e.passed } });
    case 'roadmap.restructured':
      return ok({ id, type: e.type, data: { roadmap: e.roadmap, proposal: e.proposal, moves: e.moves.map(m => ({ ...m })) } });
    default:
      return err(new NoemaError('events.invalid', 'not a Roadmap event: ' + String((e as { type?: unknown }).type)));
  }
}
/** An event of the log as the Roadmaps feature reads it (null: not one of theirs). */
function roadmapEventOf(e: LearningEvent): RoadmapEvent | null {
  const at = wallOf(e.hlc);
  switch (e.type) {
    case 'roadmap.level.reached':
      return { id: e.id, type: e.type, at, ...e.data };
    case 'roadmap.level.tested':
      return { id: e.id, type: e.type, at, ...e.data };
    case 'roadmap.restructured':
      return { id: e.id, type: e.type, at, ...e.data };
    default:
      return null;
  }
}

/** The seams the learning log fills for the other features: the read models' feed, the sync's event log and old progress,
    the Roadmap events. */
export const learningSeams: Registration = c => {
  c.register(STUDY_EVENTS, learningEventFeed);
  c.register(SYNC_EVENT_LOG, learningSyncLog);
  c.register(LEGACY_PROGRESS, learningLegacyProgress);
  c.register(ROADMAP_EVENTS, learningRoadmapEvents);
};

/** The browser's: the app's IndexedDB "noema-lite" (with the sync's outbox), the device clock of the sync, and the seams. */
export const browserLearning: Registration = c => {
  c.register(EVENT_STORE, r => browserEventStore({ storage: r.get(STORAGE), outbox: outboxOf(r.get(OUTBOX)) }));
  c.register(LEARNING, logOf);
  learningSeams(c);
};
/** Node tools and tests: in memory, with a device clock of its own when no sync is registered. */
export const memoryLearning: Registration = c => {
  if (!c.has(DEVICE_CLOCK)) c.register(DEVICE_CLOCK, r => deviceClock(r.get(STORAGE).kv, () => r.get(CLOCK).now(), randomId));
  c.register(EVENT_STORE, () => memoryEventStore());
  c.register(LEARNING, logOf);
};

/**
 * The log as the study read models read it (their EventFeed, src/composition/study.ts STUDY_EVENTS): every event that
 * counts, flat (domain/events/feed.ts), and the new ones as they are recorded, come from another tab or another device,
 * or are appended. When what counts changed backwards (a restore, an event older than the latest from another device:
 * the log folds again) the feed calls onRebuild: the read models build again from all(). One FeedContext follows what
 * was handed on (all() starts it again), so the listeners all get the same records.
 */
export interface LearningEventFeed {
  all(): AsyncResult<readonly FeedEvent[]>;
  subscribe(listener: (events: readonly FeedEvent[]) => void): Unsubscribe;
  onRebuild(listener: () => void): Unsubscribe;
}
export function learningEventFeed(r: Resolver): LearningEventFeed {
  const log = r.get(LEARNING),
    errors = r.get(ERRORS);
  let ctx = feedContext();
  const listeners = new Set<(events: readonly FeedEvent[]) => void>(),
    rebuilds = new Set<() => void>();
  const safely = (f: () => void, where: string): void => {
    try {
      f();
    } catch (e) {
      errors.report(e, { where, severity: 'error' });
    }
  };
  log.onChange((evs, why) => {
    if (why === 'refold' || evs.some(e => e.type === 'log.restored')) {
      for (const f of [...rebuilds]) safely(f, 'learning.feed.rebuild');
      return;
    }
    if (!listeners.size) return;
    const list = feedEvents(evs, ctx);
    if (list.length)
      for (const f of [...listeners])
        safely(() => {
          f(list);
        }, 'learning.feed.listener');
  });
  const add = <F>(set: Set<F>, f: F): Unsubscribe => {
    set.add(f);
    return () => {
      set.delete(f);
    };
  };
  return {
    async all() {
      const x = await log.events();
      if (!x.ok) return x;
      ctx = feedContext();
      return ok(feedEvents(x.value, ctx));
    },
    subscribe: f => add(listeners, f),
    onRebuild: f => add(rebuilds, f),
  };
}

/** NoemaCore.learning: the log for the old screens. */
export const learningBridge: BridgeExtension = {
  name: 'learning',
  build(r) {
    const errors = r.get(ERRORS);
    let log: LearningLog | null = null;
    const L = (): LearningLog => (log ??= r.get(LEARNING));
    const plain = async <T>(p: Promise<Result<T>>, where: string, fallback: T): Promise<T> => {
      const x = await p;
      if (x.ok) return x.value;
      errors.report(x.error, { where, severity: 'error' });
      return fallback;
    };
    const thrown = async <T>(p: Promise<Result<T>>): Promise<T> => {
      const x = await p;
      if (x.ok) return x.value;
      throw x.error;
    };
    return Object.freeze({
      open: (account: string) => thrown(L().open(account)),
      account: () => L().account,
      record(draft: EventDraft) {
        const x = L().record(draft);
        if (x.ok) return x.value;
        errors.report(x.error, { where: 'learning.record.' + String((draft as { type?: unknown }).type), severity: 'error' });
        return null;
      },
      recordOnce: (drafts: readonly EventDraft[]) => plain(L().recordOnce(drafts), 'learning.recordOnce', []),
      idFor: (prefix: string, parts: readonly string[]) => contentId(prefix, parts),
      cardRating: (grade: number) => cardRating(grade),
      playbookRating: (grade: number, ticked = 0) => playbookRating(grade, ticked),
      progress: (subject: string) => L().progress(subject),
      hasProgress: (subject: string) => L().hasProgress(subject),
      progressOf: (account: string, subject: string) =>
        L().account === account && L().hasProgress(subject) ? L().progress(subject) : null,
      stats: () => L().stats(),
      settings: (subject?: string) => L().settings(subject),
      settingsWritten: (value: unknown) => L().settingsWritten(value),
      setSubjectSetting(subject: string, key: string, value: unknown) {
        const x = L().setSubjectSetting(subject, key, value);
        if (!x.ok) errors.report(x.error, { where: 'learning.setting', severity: 'error' });
        return x.ok;
      },
      onSettings: (f: (s: Readonly<Record<string, unknown>>) => void) => L().onSettings(f),
      onChange: (f: Parameters<LearningLog['onChange']>[0]) => L().onChange(f),
      events: () => plain(L().events(), 'learning.events', []),
      exportLog: () => thrown(L().exportLog()),
      xapi: (subject: string) => thrown(L().xapi(subject)),
      archive: () => plain(L().archive(), 'learning.archive', {}),
      append: (events: readonly unknown[]) => thrown(L().append(events)),
      restore: (events: readonly unknown[], o: { mode: 'replace' | 'merge'; madeAt: number; account?: string }) =>
        thrown(L().restore(events, o)),
      eventsOf: (account: string) => plain(L().eventsOf(account), 'learning.events', []),
      backupStamp: (events: readonly { hlc?: unknown }[], madeAt: number) => L().backupStamp(events, madeAt),
      async flush() {
        return (await L().flush()).ok;
      },
      pending: () => L().pending,
      migrate: () => plain(L().migrateLegacy(), 'learning.migrate', { added: 0, unknown: [] }),
      compact: () => plain(L().compact(), 'learning.compact', 0),
      clear: (account: string) => plain(L().clear(account), 'learning.clear', undefined),
    });
  },
};
