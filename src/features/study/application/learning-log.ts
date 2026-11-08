/**
 * The learning log of the account in use (event sourcing): every write of progress is an event appended here, and every
 * read is the fold of the log (src/features/study/domain/events). The use cases:
 *
 *  • open(account) — reads the log (the saved fold and the events after it, or every event), converts the old progress
 *    of this device once (the KV state blobs, a:stats, a:settings: idempotent, the old values archived in the log's meta
 *    before they leave the KV), asks the browser to keep the data (persist), warns when the space runs out.
 *  • record(draft) — stamps an event (id, HLC, the learner's day, device, account), folds it at once (the screens read
 *    the change synchronously) and appends it to the store in the background, in order. A write that fails (a full
 *    storage) stays pending and is tried again with the next one and by flush().
 *  • append(events) — events from outside (another device, a backup): checked, appended (duplicates ignored), folded.
 *  • settingsWritten(value) — the old screens still write the account's settings as one value (KV a:settings): each key
 *    that changed becomes a setting.changed. settings() is the fold; onSettings tells whoever keeps that old copy.
 *  • restore(events, upTo) — a backup or restore point brought back as an event (log.restored), never by deleting.
 *  • events() / exportLog() — the whole log (the xAPI export, backups, the card scheduler's optimiser).
 *  • compact() — forgets superseded "latest" events; ids stay known.
 * The application talks only to ports: EventStore, Clock, the key-value store of the old values, ErrorReporter,
 * Notifier and I18n (the warnings), Storage's estimate/persist.
 */
import { addDays } from '../../../kernel/day.ts';
import { decodeHlc, encodeHlc, HybridClock } from '../../../kernel/hlc.ts';
import { deviceId as parseDeviceId } from '../../../kernel/ids.ts';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { EventStore, StoredEvent } from '../../../ports/event-store.ts';
import type { I18n } from '../../../ports/i18n.ts';
import type { Notifier } from '../../../ports/notifier.ts';
import type { KeyValueStore, QuotaEstimate } from '../../../ports/storage.ts';
import {
  compactable,
  compareEvents,
  contentId,
  makeEvent,
  parseEvent,
  Projection,
  settingsEvents,
  statsEvents,
  subjectEvents,
  xapiInput,
  type AccountStats,
  type EventDraft,
  type EventType,
  type LearningEvent,
  type LegacyStamp,
  type SubjectProgress,
  type XapiInput,
} from '../domain/events/index.ts';

export interface LearningLogDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  /** The key-value store the old progress is in (localStorage: noema1:<account>:…). */
  readonly kv: KeyValueStore;
  /** This device's id (the HLC's node). */
  readonly device: () => string;
  /** A new unique event id (a UUID). */
  readonly newId: () => string;
  readonly errors: ErrorReporter;
  readonly notifier?: Notifier;
  readonly i18n?: I18n;
  readonly quota?: { estimate(): AsyncResult<QuotaEstimate>; persist(): AsyncResult<boolean> };
}

export interface OpenReport {
  readonly account: string;
  readonly events: number;
  /** Events the migration of the old values added this time (0 once done). */
  readonly migrated: number;
  /** Fields of the old values that had no event (kept in the archive only). */
  readonly unknown: readonly string[];
  readonly fromSnapshot: boolean;
}

export type ChangeListener = (events: readonly LearningEvent[], why: 'local' | 'tab' | 'append' | 'refold') => void;

/** The old KV keys of an account (the loader's namespacing). */
export const legacyKeys = (account: string) => ({
  prefix: `noema1:${account}:`,
  stats: `noema1:${account}:a:stats`,
  settings: `noema1:${account}:a:settings`,
  state: /^s:(.+):state$/,
});

/** A snapshot is written once this many events were folded after the last one. */
export const SNAPSHOT_EVERY = 200;
/** Compaction runs at open when at least this many events could go. */
export const COMPACT_AT = 100;
/** The share of the quota from which the learner is warned that space is running out. */
export const LOW_SPACE = 0.9;

const META = { migrated: 'migrated.v1', archive: 'legacy.archive', persist: 'persist.asked', hlc: 'hlc.last' } as const;

export class LearningLog {
  readonly #d: LearningLogDeps;
  #account: string | null = null;
  #projection = new Projection();
  #hlc: HybridClock | null = null;
  #device = '';
  #queue: LearningEvent[] = [];
  #writing: Promise<void> = Promise.resolve();
  #sinceSnapshot = 0;
  #refolding: Promise<void> | null = null;
  readonly #listeners = new Set<ChangeListener>();
  readonly #settingsListeners = new Set<(settings: Readonly<Record<string, unknown>>) => void>();
  #unwatch: Unsubscribe | null = null;

  constructor(deps: LearningLogDeps) {
    this.#d = deps;
  }

  get account(): string | null {
    return this.#account;
  }
  /** Events recorded but not yet in the store. */
  get pending(): number {
    return this.#queue.length;
  }

  /* ---------------- open ---------------- */
  async open(account: string): AsyncResult<OpenReport> {
    if (this.#account === account) return ok({ account, events: this.#projection.count, migrated: 0, unknown: [], fromSnapshot: false });
    await this.flush();
    this.#unwatch?.();
    this.#account = account;
    this.#queue = [];
    const dev = parseDeviceId(this.#d.device());
    this.#device = dev.ok ? dev.value : 'device';
    const node = parseDeviceId(this.#device);
    if (!node.ok) return node;
    const last = await this.#d.store.getMeta<string>(account, META.hlc);
    const lastStamp = last.ok && last.value ? decodeHlc(last.value) : null;
    this.#hlc = new HybridClock(
      node.value,
      () => this.#d.clock.now(),
      lastStamp?.ok && lastStamp.value.node === node.value ? { last: lastStamp.value } : {},
    );

    let fromSnapshot = false;
    const snap = await this.#d.store.getSnapshot(account);
    const fromSnap = snap.ok && snap.value ? Projection.fromSnapshot(snap.value.value) : null;
    if (fromSnap && snap.ok && snap.value) {
      const tail = await this.#read(account, snap.value.upTo.hlc);
      if (!tail.ok) return tail;
      const p = fromSnap;
      let whole = true;
      for (const e of tail.value) if (!p.apply(e)) whole = false;
      if (whole) {
        this.#projection = p;
        fromSnapshot = true;
        this.#sinceSnapshot = tail.value.length;
      }
    }
    if (!fromSnapshot) {
      const all = await this.#read(account);
      if (!all.ok) return all;
      this.#projection = Projection.fold(all.value);
      this.#sinceSnapshot = SNAPSHOT_EVERY; // write one now
      await this.#compact(all.value);
    }
    this.#seeStamp(this.#projection.lastAt);
    this.#unwatch = this.#d.store.watch((acc, evs) => {
      if (acc !== this.#account) return;
      const list: LearningEvent[] = [],
        mine = new Set(this.#queue.map(e => e.id));
      for (const x of evs) {
        const e = parseEvent(x);
        if (e.ok && !mine.has(e.value.id)) list.push(e.value); // one recorded here too (an inbox row both tabs read): folded already
      }
      if (list.length) this.#ingest(list, 'tab');
    });
    const mig = await this.#migrate(account);
    await this.#snapshotMaybe();
    void this.#space(account);
    return ok({ account, events: this.#projection.count, migrated: mig.added, unknown: mig.unknown, fromSnapshot });
  }

  async #read(account: string, after?: string): AsyncResult<LearningEvent[]> {
    const r = await this.#d.store.read(account, after === undefined ? {} : { after });
    if (!r.ok) return r;
    const out: LearningEvent[] = [];
    let bad = 0;
    for (const x of r.value) {
      const e = parseEvent(x);
      if (e.ok) out.push(e.value);
      else bad++;
    }
    if (bad)
      this.#d.errors.report(
        new NoemaError('storage.corrupt', `${bad} stored learning events are not valid events (left out of the fold)`),
        {
          where: 'learning.read',
          severity: 'warning',
        },
      );
    return ok(out);
  }

  #seeStamp(at: string): void {
    if (!at || !this.#hlc) return;
    const s = decodeHlc(at);
    if (s.ok) {
      const r = this.#hlc.receive(s.value);
      if (!r.ok) this.#d.errors.report(r.error, { where: 'learning.hlc', severity: 'info' });
    }
  }

  /* ---------------- reading ---------------- */
  /** A subject's progress (the same object while events fold in place; an empty one when it has none). */
  progress(subject: string): SubjectProgress {
    return this.#projection.subjectProgress(subject);
  }
  hasProgress(subject: string): boolean {
    return this.#projection.hasSubject(subject);
  }
  stats(): AccountStats {
    return this.#projection.stats;
  }
  /** Days in a row with study up to today (0 when the last one was before yesterday). */
  streakNow(): number {
    const s = this.#projection.stats;
    if (!s.lastDay) return 0;
    const today = this.#d.clock.today();
    return s.lastDay >= addDays(today, -1) ? s.streak : 0;
  }
  todayXP(): number {
    return this.#projection.stats.xpDay[this.#d.clock.today()] ?? 0;
  }
  settings(subject?: string): Readonly<Record<string, unknown>> {
    return this.#projection.settings(subject ?? '');
  }
  levels(): Readonly<Record<string, { level: string; at: number }>> {
    return this.#projection.levels;
  }

  /** The whole log of the account, in order (recorded events included once stored). */
  async events(): AsyncResult<LearningEvent[]> {
    const acc = this.#account;
    if (!acc) return err(closed());
    await this.flush();
    const r = await this.#read(acc);
    if (!r.ok) return r;
    // events still pending (a full storage) are part of the log too
    const have = new Set(r.value.map(e => e.id));
    return ok([...r.value, ...this.#queue.filter(e => !have.has(e.id))].sort(compareEvents));
  }
  async exportLog(): AsyncResult<{ format: 'noema.events/v1'; account: string; events: LearningEvent[] }> {
    const r = await this.events();
    return r.ok ? ok({ format: 'noema.events/v1', account: this.#account ?? '', events: r.value }) : r;
  }
  /** What the xAPI export of a subject reads. */
  async xapi(subject: string): AsyncResult<XapiInput> {
    const r = await this.events();
    return r.ok ? ok(xapiInput(subject, r.value)) : r;
  }

  /* ---------------- writing ---------------- */
  /** An event the learner caused: stamped, folded at once, stored in the background (in order). */
  record<T extends EventType>(draft: EventDraft<T>): Result<LearningEvent<T>> {
    const acc = this.#account,
      hlc = this.#hlc;
    if (!acc || !hlc) return err(closed());
    const at = hlc.now();
    if (!at.ok) return at;
    const e = makeEvent(draft, {
      id: this.#d.newId(),
      hlc: encodeHlc(at.value),
      day: this.#d.clock.today(),
      device: this.#device,
      account: acc,
    });
    if (!e.ok) return e;
    this.#fold([e.value as LearningEvent]);
    this.#queue.push(e.value as LearningEvent);
    this.#write();
    this.#emit([e.value as LearningEvent], 'local');
    if (e.value.type === 'setting.changed' && e.value.subject === undefined) this.#emitSettings();
    return e;
  }

  /**
   * Events whose id the caller made from their content (an inbox row of another app, read again by another tab or after a
   * failed delete): only those the log has never seen are recorded; the others are left out → what was recorded.
   */
  async recordOnce(drafts: readonly EventDraft[]): AsyncResult<LearningEvent[]> {
    const acc = this.#account;
    if (!acc) return err(closed());
    const ids: string[] = [];
    for (const d of drafts) {
      if (d.id === undefined) return err(new NoemaError('events.invalid', `recordOnce: a ${d.type} without its own id`));
      ids.push(d.id);
    }
    const known = await this.#d.store.known(acc, ids);
    if (!known.ok) return known;
    if (this.#account !== acc) return err(closed());
    const seen = new Set([...known.value, ...this.#queue.map(e => e.id)]);
    const out: LearningEvent[] = [];
    for (const d of drafts) {
      if (d.id === undefined || seen.has(d.id)) continue;
      seen.add(d.id);
      const r = this.record(d);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  }

  /** Events from outside (another device, a backup, an import): checked, the new ones stored and folded. */
  async append(events: readonly unknown[]): AsyncResult<LearningEvent[]> {
    const acc = this.#account;
    if (!acc) return err(closed());
    const list: LearningEvent[] = [];
    for (const x of events) {
      const e = parseEvent(x);
      if (!e.ok) return e;
      if (e.value.account !== acc) return err(new NoemaError('events.invalid', `an event of another account (${e.value.account})`));
      list.push(e.value);
    }
    await this.flush();
    const r = await this.#d.store.append(acc, list as StoredEvent[]);
    if (!r.ok) return r;
    const added = r.value as LearningEvent[];
    if (added.length) this.#ingest(added, 'append');
    return ok(added);
  }

  /** Waits until every recorded event is stored (or the store refused: they stay pending). */
  async flush(): AsyncResult<void> {
    this.#write();
    await this.#writing;
    await this.#refolding;
    return this.#queue.length
      ? err(new NoemaError('storage.failed', `${this.#queue.length} learning events are not stored yet`, { retryable: true }))
      : OK_VOID;
  }

  #write(): void {
    this.#writing = this.#writing.then(async () => {
      const acc = this.#account;
      if (!acc || !this.#queue.length) return;
      const batch = this.#queue.slice();
      const r = await this.#d.store.append(acc, batch as StoredEvent[]);
      if (!r.ok) {
        // a full storage raised the learner's warning already (the storage-full signal); the events wait in memory
        if (r.error.code !== 'storage.quota') this.#d.errors.report(r.error, { where: 'learning.append', severity: 'error' });
        return;
      }
      if (this.#account !== acc) return;
      const sent = new Set(batch.map(e => e.id));
      this.#queue = this.#queue.filter(e => !sent.has(e.id));
      // one was there already (the same inbox row recorded by another tab at the same time): it was folded twice here
      if (r.value.length < batch.length) this.#refold();
      this.#sinceSnapshot += batch.length;
      const lastAt = batch[batch.length - 1]?.hlc;
      if (lastAt) void this.#d.store.putMeta(acc, META.hlc, lastAt);
      await this.#snapshotMaybe();
    });
  }

  /** Fold events in place, or the whole log again when one lands before the latest (or is a restore). */
  #fold(events: readonly LearningEvent[]): void {
    let whole = true;
    for (const e of events) if (!this.#projection.apply(e)) whole = false;
    if (!whole) this.#refold();
  }

  #ingest(events: readonly LearningEvent[], why: 'tab' | 'append'): void {
    for (const e of events) this.#seeStamp(e.hlc);
    this.#fold(events);
    this.#emit(events, why);
    if (events.some(e => e.type === 'setting.changed' && e.subject === undefined) || events.some(e => e.type === 'log.restored'))
      this.#emitSettings();
  }

  /** Fold the whole log again (async: it reads the store), then tell the listeners. */
  #refold(): void {
    const acc = this.#account;
    if (!acc) return;
    const run = (async () => {
      await this.#writing;
      const all = await this.#read(acc);
      if (!all.ok || this.#account !== acc) {
        if (!all.ok) this.#d.errors.report(all.error, { where: 'learning.refold', severity: 'error' });
        return;
      }
      const have = new Set(all.value.map(e => e.id));
      const next = Projection.fold([...all.value, ...this.#queue.filter(e => !have.has(e.id))]);
      this.#adopt(next);
      this.#sinceSnapshot = SNAPSHOT_EVERY;
      await this.#snapshotMaybe();
      this.#emit([], 'refold');
      this.#emitSettings();
    })();
    const tracked: Promise<void> = run.finally(() => {
      if (this.#refolding === tracked) this.#refolding = null;
    });
    this.#refolding = tracked;
  }

  /** Take over a new fold while keeping the objects the screens hold (a subject's progress, the stats, the settings). */
  #adopt(next: Projection): void {
    const old = this.#projection;
    for (const s of new Set([...old.subjects(), ...next.subjects()])) {
      const held = old.subjectProgress(s),
        fresh = next.subjectProgress(s);
      for (const k of Object.keys(held)) Reflect.deleteProperty(held, k);
      Object.assign(held, fresh);
      next.replaceProgress(s, held);
    }
    const hs = old.stats;
    Object.assign(hs, next.stats);
    next.replaceStats(hs);
    for (const scope of new Set([...old.settingScopes(), ...next.settingScopes()])) {
      const held = old.settings(scope);
      for (const k of Object.keys(held)) Reflect.deleteProperty(held, k);
      Object.assign(held, next.settings(scope));
      next.replaceSettings(scope, held);
    }
    this.#projection = next;
  }

  async #snapshotMaybe(): Promise<void> {
    const acc = this.#account;
    if (!acc || this.#sinceSnapshot < SNAPSHOT_EVERY || this.#queue.length || this.#refolding) return;
    const s = this.#projection.snapshot();
    if (!s.lastAt) return;
    const r = await this.#d.store.putSnapshot(acc, { upTo: { hlc: s.lastAt, id: s.lastId }, value: s });
    if (r.ok) this.#sinceSnapshot = 0;
    else if (r.error.code !== 'storage.quota') this.#d.errors.report(r.error, { where: 'learning.snapshot', severity: 'warning' });
  }

  /* ---------------- settings: the old screens' copy (KV a:settings) ---------------- */
  /** The old screens wrote the whole settings value: a setting.changed for each key that changed (or went). */
  settingsWritten(value: unknown): number {
    const acc = this.#account;
    if (!acc || !this.#hlc) return 0;
    const r = settingsEvents(value, this.#projection.settings(), k => this.#projection.settingStamp(k), this.#legacyStamp(acc), 'app');
    let n = 0;
    for (const e of r.events) {
      const x = this.record({ type: 'setting.changed', data: e.data as LearningEvent<'setting.changed'>['data'], id: e.id });
      if (x.ok) n++;
    }
    return n;
  }
  /** A subject's own setting (e.g. the sources it shows). */
  setSubjectSetting(subject: string, key: string, value: unknown): Result<LearningEvent<'setting.changed'>> {
    return this.record({
      type: 'setting.changed',
      subject,
      data: value === undefined || value === null ? { key, removed: true } : { key, value },
    });
  }
  onSettings(listener: (settings: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    this.#settingsListeners.add(listener);
    return () => {
      this.#settingsListeners.delete(listener);
    };
  }
  #emitSettings(): void {
    const s = this.#projection.settings();
    for (const l of [...this.#settingsListeners]) {
      try {
        l(s);
      } catch (e) {
        this.#d.errors.report(e, { where: 'learning.settings.listener', severity: 'error' });
      }
    }
  }

  onChange(listener: ChangeListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #emit(events: readonly LearningEvent[], why: Parameters<ChangeListener>[1]): void {
    for (const l of [...this.#listeners]) {
      try {
        l(events, why);
      } catch (e) {
        this.#d.errors.report(e, { where: 'learning.listener', severity: 'error' });
      }
    }
  }

  /* ---------------- restore ---------------- */
  /** The stamp a backup holds up to: its latest event's, else the stamp of when it was made. */
  backupStamp(events: readonly { hlc?: unknown }[], madeAt: number): string {
    let max = '';
    for (const e of events) if (typeof e.hlc === 'string' && e.hlc > max) max = e.hlc;
    return max || `${String(Math.max(0, Math.floor(madeAt))).padStart(15, '0')}-00000-${this.#device || 'device'}`;
  }

  /**
   * A backup or restore point brought back. mode "replace": what happened after it no longer counts (one log.restored
   * event); "merge": nothing is undone. Either way the backup's events this log lacks are added — those of another
   * account get ids of their own for this one (the same backup restored twice adds them once).
   */
  async restore(
    events: readonly unknown[],
    o: { mode: 'replace' | 'merge'; madeAt: number; account?: string },
  ): AsyncResult<{ added: number }> {
    const acc = o.account ?? this.#account;
    if (!acc) return err(closed());
    const mine: LearningEvent[] = [];
    for (const x of events) {
      const e = parseEvent(x);
      if (!e.ok) continue; // a backup's damaged entry: the rest is restored (the file itself is kept by the learner)
      const v = e.value;
      const moved = v.account === acc ? v : { ...v, account: acc, id: contentId('rst', [acc, v.account, v.id]) };
      mine.push(moved.origin === undefined || moved.origin === 'app' ? { ...moved, origin: 'restore' } : moved);
    }
    const upTo = this.backupStamp(mine, o.madeAt);
    if (acc !== this.#account) {
      // a profile that is not open here (a copy into another account): straight into its log
      const r = await this.#d.store.append(acc, mine as StoredEvent[]);
      if (!r.ok) return r;
      if (o.mode === 'replace') {
        const id = this.#d.newId(),
          m = makeEvent({ type: 'log.restored', data: { upTo } }, { ...this.#legacyStamp(acc), id });
        if (!m.ok) return m;
        const w = await this.#d.store.append(acc, [m.value] as LearningEvent[] as StoredEvent[]);
        if (!w.ok) return w;
      }
      return ok({ added: r.value.length });
    }
    const added = await this.append(mine);
    if (!added.ok) return added;
    if (o.mode === 'replace') {
      const r = this.record({ type: 'log.restored', data: { upTo } });
      if (!r.ok) return r;
      await this.flush();
      await this.#refolding;
    }
    return ok({ added: added.value.length });
  }

  /** The log of any account of this device (the open one's includes what is still pending). */
  async eventsOf(account: string): AsyncResult<LearningEvent[]> {
    if (account === this.#account) return this.events();
    return this.#read(account);
  }

  /** Removes the account's log from this device (the profile is deleted here). */
  async clear(account: string): AsyncResult<void> {
    if (this.#account === account) {
      this.#queue = [];
      this.#adopt(new Projection());
    }
    return this.#d.store.clear(account);
  }

  /* ---------------- compaction ---------------- */
  async compact(): AsyncResult<number> {
    const r = await this.events();
    if (!r.ok) return r;
    return ok(await this.#compact(r.value, 1));
  }
  async #compact(all: readonly LearningEvent[], at = COMPACT_AT): Promise<number> {
    const acc = this.#account;
    if (!acc) return 0;
    const pending = new Set(this.#queue.map(e => e.id));
    const ids = compactable(all, e => pending.has(e.id));
    if (ids.length < at) return 0;
    const r = await this.#d.store.forget(acc, ids);
    if (!r.ok) {
      this.#d.errors.report(r.error, { where: 'learning.compact', severity: 'warning' });
      return 0;
    }
    return r.value;
  }

  /* ---------------- the migration of the old values ---------------- */
  #legacyStamp(account: string): LegacyStamp {
    const at = this.#hlc?.now();
    const stamp = at?.ok ? encodeHlc(at.value) : `${String(Math.floor(this.#d.clock.now())).padStart(15, '0')}-00000-${this.#device}`;
    return { hlc: stamp, day: this.#d.clock.today(), device: this.#device, account };
  }

  /** Converts what this device still keeps in the old places; run at every open and whenever old values arrive (no-op once done). */
  async migrateLegacy(): AsyncResult<{ added: number; unknown: string[] }> {
    const acc = this.#account;
    if (!acc) return err(closed());
    return ok(await this.#migrate(acc));
  }

  async #migrate(account: string): Promise<{ added: number; unknown: string[] }> {
    const K = legacyKeys(account),
      kv = this.#d.kv;
    const keys = kv.keys(K.prefix);
    if (!keys.ok) return { added: 0, unknown: [] };
    const blobs: Array<{ key: string; text: string; subject: string }> = [];
    for (const k of keys.value) {
      const m = K.state.exec(k.slice(K.prefix.length));
      const subject = m?.[1];
      if (!subject || subject.startsWith('lang:')) continue; // the language courses keep their own progress (docs/LANGUAGE_RULES.md)
      const t = kv.get(k);
      if (t.ok && t.value !== null) blobs.push({ key: k, text: t.value, subject });
    }
    const statsText = kv.get(K.stats);
    const st = statsText.ok ? statsText.value : null;
    const marker = await this.#d.store.getMeta<{ at: number }>(account, META.migrated);
    const firstTime = marker.ok && marker.value === undefined;
    const settingsText = firstTime ? kv.get(K.settings) : null;
    if (!blobs.length && st === null && !(settingsText?.ok && settingsText.value)) {
      if (firstTime) await this.#d.store.putMeta(account, META.migrated, { at: this.#d.clock.now() });
      return { added: 0, unknown: [] };
    }
    const stamp = this.#legacyStamp(account);
    const events: LearningEvent[] = [],
      unknown: string[] = [];
    const subjectXp: Record<string, number> = {};
    for (const b of blobs) {
      const blob = parseJson(b.text);
      const r = subjectEvents(b.subject, blob, stamp);
      events.push(...r.events);
      unknown.push(...r.unknown.map(f => `s:${b.subject}:state.${f}`));
      const xp = blob && typeof blob === 'object' ? (blob as { xp?: unknown }).xp : 0;
      if (typeof xp === 'number' && xp > 0) subjectXp[b.subject] = xp;
    }
    if (st !== null || Object.keys(subjectXp).length) {
      const hasStats = this.#projection.stats.xp > 0 || this.#projection.stats.streak > 0;
      // without a:stats, the subjects' XP stands for it, unless the log already has the account's stats
      if (st !== null || !hasStats) {
        const r = statsEvents(st === null ? undefined : parseJson(st), subjectXp, stamp);
        events.push(...r.events);
        unknown.push(...r.unknown.map(f => 'a:stats.' + f));
      }
    }
    if (settingsText?.ok && settingsText.value) {
      const r = settingsEvents(parseJson(settingsText.value), {}, () => '', stamp, 'migration');
      events.push(...r.events);
    }
    // the old values are kept in the log's archive first: nothing leaves the KV before it is safe elsewhere
    const arch = await this.#d.store.getMeta<Record<string, string[]>>(account, META.archive);
    const archive: Record<string, string[]> = arch.ok && arch.value ? arch.value : {};
    const keep = (k: string, text: string): void => {
      const list = (archive[k] ??= []);
      if (!list.includes(text)) list.push(text);
    };
    for (const b of blobs) keep(b.key.slice(K.prefix.length), b.text);
    if (st !== null) keep('a:stats', st);
    if (settingsText?.ok && settingsText.value) keep('a:settings', settingsText.value);
    const saved = await this.#d.store.putMeta(account, META.archive, archive);
    if (!saved.ok) {
      this.#d.errors.report(saved.error, { where: 'learning.migrate.archive', severity: 'error' });
      return { added: 0, unknown };
    }
    const r = await this.#d.store.append(account, events as StoredEvent[]);
    if (!r.ok) {
      this.#d.errors.report(r.error, { where: 'learning.migrate', severity: 'error' });
      return { added: 0, unknown };
    }
    this.#ingest(r.value as LearningEvent[], 'append');
    // in the log now: the old copies leave the KV (silently: a removal here is not a change to send anywhere)
    for (const b of blobs) kv.delete(b.key);
    if (st !== null) kv.delete(K.stats);
    if (firstTime) await this.#d.store.putMeta(account, META.migrated, { at: this.#d.clock.now() });
    if (unknown.length)
      this.#d.errors.report(
        new NoemaError('storage.corrupt', 'old progress fields without an event (kept in the archive): ' + unknown.slice(0, 10).join(', ')),
        {
          where: 'learning.migrate.unknown',
          severity: 'info',
        },
      );
    return { added: r.value.length, unknown };
  }

  /** The old values the migration took in (KV suffix → every distinct text seen), for support and for the learner's backup. */
  async archive(): AsyncResult<Readonly<Record<string, readonly string[]>>> {
    const acc = this.#account;
    if (!acc) return err(closed());
    const r = await this.#d.store.getMeta<Record<string, string[]>>(acc, META.archive);
    return r.ok ? ok(r.value ?? {}) : r;
  }

  /* ---------------- space ---------------- */
  async #space(account: string): Promise<void> {
    const q = this.#d.quota;
    if (!q) return;
    const asked = await this.#d.store.getMeta<boolean>(account, META.persist);
    if (asked.ok && !asked.value) {
      const p = await q.persist();
      if (p.ok) await this.#d.store.putMeta(account, META.persist, true);
    }
    const e = await q.estimate();
    if (!e.ok || e.value.usage === null || !e.value.quota) return;
    if (e.value.usage / e.value.quota >= LOW_SPACE && this.#d.notifier && this.#d.i18n)
      this.#d.notifier.alert('⚠️ ' + this.#d.i18n.t('loader.storage.low', { pct: Math.round((100 * e.value.usage) / e.value.quota) }), {
        ms: 8000,
      });
  }
}

const closed = (): NoemaError => new NoemaError('events.closed', 'the learning log is not open');
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // not JSON: the migration reads it as nothing (the text itself is kept in the archive)
    return undefined;
  }
}
