/**
 * The learning log in the roots: its registration (an EventStore adapter + the application's LearningLog) and its name on
 * the phase bridge, NoemaCore.learning, which speaks the old code's language (plain values, promises, exceptions turned
 * into reports). Surface (keep docs/ARCHITECTURE.md §6 in step):
 *
 *   NoemaCore.learning.open(account) → Promise<{ account, events, migrated, unknown, fromSnapshot }>   (before any screen)
 *   NoemaCore.learning.account() → the account the log is open for, or null
 *   NoemaCore.learning.record({ type, subject?, item?, data, origin?, id?, day? }) → the event | null (reported when refused)
 *   NoemaCore.learning.recordOnce([draft with its id]) → Promise<the events recorded> (those never seen) · idFor(prefix, parts)
 *   NoemaCore.learning.cardRating(grade 0|1|2) · playbookRating(grade 0|1|2) → the FSRS rating (1–4) of the old buttons
 *   NoemaCore.learning.progress(subject) → the subject's progress (xp, read, res, fc, pb, boss, last, att, act, flags, …:
 *                                         the same object while events fold in; read only) · hasProgress(subject)
 *   NoemaCore.learning.progressOf(account, subject) → the same, or null (no progress, or the log is open for another account)
 *   NoemaCore.learning.stats() → { xp, xpDay, streak, lastDay, bySubject } · streakNow() · todayXP()
 *   NoemaCore.learning.settings(subject?) → the settings in force · settingsWritten(value) → changes recorded
 *   NoemaCore.learning.setSubjectSetting(subject, key, value) · onSettings(fn) → unsubscribe · levels()
 *   NoemaCore.learning.onChange(fn(events, why)) → unsubscribe        (why: local | tab | append | refold)
 *   NoemaCore.learning.events() · eventsOf(account) · exportLog() · xapi(subject) · archive() → Promise
 *   NoemaCore.learning.append(events) → Promise<added> · restore(events, { mode, madeAt, account? }) → Promise<{ added }>
 *   NoemaCore.learning.backupStamp(events, madeAt) · flush() → Promise<boolean> · pending() · migrate() · compact() · clear(account)
 */
import { browserEventStore } from '../adapters/browser/event-store.ts';
import { memoryEventStore } from '../adapters/memory/event-store.ts';
import { LearningLog } from '../features/study/application/learning-log.ts';
import {
  CARD_RATING_OF_GRADE,
  contentId,
  feedEvents,
  PLAYBOOK_RATING_OF_GRADE,
  type EventDraft,
  type FeedEvent,
} from '../features/study/domain/events/index.ts';
import { ok, type AsyncResult } from '../kernel/result.ts';
import type { Unsubscribe } from '../ports/common.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { Result } from '../kernel/result.ts';
import type { KeyValueStore } from '../ports/storage.ts';
import type { BridgeExtension } from './bridge.ts';
import type { Registration, Resolver } from './container.ts';
import { CLOCK, ERRORS, EVENT_STORE, I18N, LEARNING, NOTIFIER, STORAGE } from './tokens.ts';

/** This device's id, kept as a device preference (never synced). */
export const DEVICE_KEY = 'noema-device:id';

/** The device's id from the key-value store, made once (random, 16 hex digits). */
export function deviceIdFrom(kv: KeyValueStore, random: () => string): string {
  const had = kv.get(DEVICE_KEY);
  if (had.ok && had.value && /^[A-Za-z0-9_-]{1,64}$/.test(had.value)) return had.value;
  const id =
    'd' +
    random()
      .replace(/[^0-9a-f]/gi, '')
      .slice(0, 16);
  kv.set(DEVICE_KEY, id);
  return id;
}

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
  const storage = r.get(STORAGE),
    errors = r.get(ERRORS);
  const store = r.get(EVENT_STORE);
  // the log's own storage-full signal: the same warning as the rest of the site's storage
  store.onFull(e => {
    errors.report(new NoemaError('storage.quota', 'the browser storage for this site is full', { params: { key: e.key } }), {
      where: 'storage.learning',
      severity: 'error',
      notify: true,
      context: { key: e.key },
    });
  });
  return new LearningLog({
    store,
    clock: r.get(CLOCK),
    kv: storage.kv,
    device: () => deviceIdFrom(storage.kv, uuid),
    newId: uuid,
    errors,
    notifier: r.get(NOTIFIER),
    i18n: r.get(I18N),
    quota: { estimate: () => storage.estimate(), persist: () => storage.persist() },
  });
}

/** The browser's: IndexedDB "noema-learning". */
export const browserLearning: Registration = c => {
  c.register(EVENT_STORE, () => browserEventStore());
  c.register(LEARNING, logOf);
};
/** Node tools and tests: in memory. */
export const memoryLearning: Registration = c => {
  c.register(EVENT_STORE, () => memoryEventStore());
  c.register(LEARNING, logOf);
};

/**
 * The log as the study read models read it (their EventFeed, src/composition/study.ts STUDY_EVENTS): every event that
 * counts, flat (domain/events/feed.ts), and the new ones as they are recorded, come from another tab or are appended.
 * When what counts changed backwards (a restore, an event older than the latest from another device: the log folds
 * again) the feed calls onRebuild: the read models build again from all().
 */
export interface LearningEventFeed {
  all(): AsyncResult<readonly FeedEvent[]>;
  subscribe(listener: (events: readonly FeedEvent[]) => void): Unsubscribe;
  onRebuild(listener: () => void): Unsubscribe;
}
export function learningEventFeed(r: Resolver): LearningEventFeed {
  const log = r.get(LEARNING),
    errors = r.get(ERRORS);
  const safely = (f: () => void, where: string): void => {
    try {
      f();
    } catch (e) {
      errors.report(e, { where, severity: 'error' });
    }
  };
  return {
    async all() {
      const x = await log.events();
      return x.ok ? ok(feedEvents(x.value)) : x;
    },
    subscribe: f =>
      log.onChange((evs, why) => {
        if (why === 'refold' || evs.some(e => e.type === 'log.restored')) return;
        const list = feedEvents(evs);
        if (list.length)
          safely(() => {
            f(list);
          }, 'learning.feed.listener');
      }),
    onRebuild: f =>
      log.onChange((evs, why) => {
        if (why === 'refold' || evs.some(e => e.type === 'log.restored')) safely(f, 'learning.feed.rebuild');
      }),
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
      cardRating: (grade: number) => CARD_RATING_OF_GRADE[grade === 2 ? 2 : grade === 0 ? 0 : 1],
      playbookRating: (grade: number) => PLAYBOOK_RATING_OF_GRADE[grade === 2 ? 2 : grade === 0 ? 0 : 1],
      progress: (subject: string) => L().progress(subject),
      hasProgress: (subject: string) => L().hasProgress(subject),
      progressOf: (account: string, subject: string) =>
        L().account === account && L().hasProgress(subject) ? L().progress(subject) : null,
      stats: () => L().stats(),
      streakNow: () => L().streakNow(),
      todayXP: () => L().todayXP(),
      settings: (subject?: string) => L().settings(subject),
      settingsWritten: (value: unknown) => L().settingsWritten(value),
      setSubjectSetting(subject: string, key: string, value: unknown) {
        const x = L().setSubjectSetting(subject, key, value);
        if (!x.ok) errors.report(x.error, { where: 'learning.setting', severity: 'error' });
        return x.ok;
      },
      onSettings: (f: (s: Readonly<Record<string, unknown>>) => void) => L().onSettings(f),
      levels: () => L().levels(),
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
