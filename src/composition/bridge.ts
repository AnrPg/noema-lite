/**
 * THE PHASE BRIDGE: window.NoemaCore, the one way the old UI (build/ui.js, engine/app/*.js, engine/src/*.js,
 * engine/lang/*, engine/*.js) reaches the new core in phases 1 and 2. Phase 3 moves the last old screens into
 * src/features/ and deletes this file, the global and every `NoemaCore.` in engine/ (docs/ARCHITECTURE.md §6).
 *
 * The bridge speaks the old code's language: plain values and exceptions instead of Results (a failed write is `false`,
 * a bad day throws NoemaError('day.invalid')), and every failure it swallows is reported to the ErrorReporter.
 *
 * Surface (version 1) — keep docs/ARCHITECTURE.md §6 in step:
 *   NoemaCore.version                       1
 *   NoemaCore.day.of(moment?)               "YYYY-MM-DD": the learner's local day of a Date / epoch ms / date text (now when left out)
 *   NoemaCore.day.add(day, n)               the day n calendar days later (n < 0: earlier), DST-safe
 *   NoemaCore.day.between(a, b)             whole days from a to b
 *   NoemaCore.day.weekStart(day, first=1)   the Monday (first = 0: Sunday) of day's week
 *   NoemaCore.day.compare(a, b)             -1 | 0 | 1
 *   NoemaCore.day.is(x)                     a real "YYYY-MM-DD" day?
 *   NoemaCore.clock.now() · today() · timeZone() · onDayChange(fn) → unsubscribe
 *   NoemaCore.errors.report(error, { where, severity, context, notify }) → journal entry
 *   NoemaCore.errors.catcher(where, { severity, context, notify }) → (error) => undefined   (for .catch and callbacks)
 *   NoemaCore.errors.journal() · clearJournal() · onReport(fn) → unsubscribe
 *   NoemaCore.storage.kv.get(key) → text | null · set(key, text) → boolean · delete(key) · keys(prefix) → string[]
 *   NoemaCore.storage.estimate() → Promise<{ usage, quota, persisted } | null> · persist() → Promise<boolean>
 *   NoemaCore.notify.toast(text, { ms }) · notice(text, { ms }) · alert(text, { ms }) · onOverflow(fn) → unsubscribe
 *   NoemaCore.i18n.t(key, params) · has(key) · err(e) · plural(n) · locale() · dir() · format.{number,percent,date,time,relative,list,compare} · onChange(fn)
 *   NoemaCore.telemetry.count(name, by) · event(name, data) · snapshot() · reset()
 *   NoemaCore.compute.run(job, input, { timeoutMs, signal, onProgress }) → Promise<value> (rejects with a NoemaError)
 *   NoemaCore.NoemaError                    the error class (instanceof checks, coded errors)
 *   NoemaCore.<extension>                   what helpers add with BRIDGE_EXTENSIONS (src/composition/browser.ts)
 * A full storage needs no call: every write that hits it raises the storage-full signal, which the root reports
 * (the learner's "storage is full" warning, i18n key loader.storage.full, in the assertive live region).
 */
import { addDays, compareDays, dayOf, daysBetween, isLocalDay, parseDay, weekStart, type LocalDay } from '../kernel/day.ts';
import { NoemaError, type ErrorCode } from '../kernel/errors.ts';
import { textOf } from '../kernel/text.ts';
import type { Clock } from '../ports/clock.ts';
import type { Unsubscribe } from '../ports/common.ts';
import type { RunOptions } from '../ports/compute.ts';
import type { ErrorReporter } from '../ports/error-reporter.ts';
import type { I18n } from '../ports/i18n.ts';
import type { Notifier } from '../ports/notifier.ts';
import type { QuotaEstimate } from '../ports/storage.ts';
import type { Telemetry } from '../ports/telemetry.ts';
import type { Resolver } from './container.ts';
import { CLOCK, COMPUTE, ERRORS, I18N, NOTIFIER, STORAGE, TELEMETRY } from './tokens.ts';

export interface DayBridge {
  of(moment?: Date | number | string): string;
  add(day: string, n: number): string;
  between(a: string, b: string): number;
  weekStart(day: string, firstDay?: number): string;
  compare(a: string, b: string): -1 | 0 | 1;
  is(x: unknown): boolean;
}
export interface ClockBridge {
  now(): number;
  today(): string;
  timeZone(): string;
  onDayChange(listener: (today: string) => void): Unsubscribe;
}
export interface StorageBridge {
  readonly kv: {
    get(key: string): string | null;
    /** The old engine's callers may pass any value: it is kept as its text, as localStorage keeps it. */
    set(key: string, value: unknown): boolean;
    delete(key: string): void;
    keys(prefix?: string): string[];
  };
  estimate(): Promise<QuotaEstimate | null>;
  persist(): Promise<boolean>;
}
export interface ComputeBridge {
  run<O = unknown>(job: string, input: unknown, options?: RunOptions): Promise<O>;
}

export interface NoemaCoreBridge {
  readonly version: 1;
  readonly day: DayBridge;
  readonly clock: ClockBridge;
  readonly errors: ErrorReporter;
  readonly storage: StorageBridge;
  readonly notify: Notifier;
  readonly i18n: I18n;
  readonly telemetry: Telemetry;
  readonly compute: ComputeBridge;
  readonly NoemaError: typeof NoemaError;
  readonly [extension: string]: unknown;
}

/** What a helper adds to the bridge: a name and how to build it from the root. */
export interface BridgeExtension {
  readonly name: string;
  build(r: Resolver): unknown;
}

const CORE_NAMES = new Set(['version', 'day', 'clock', 'errors', 'storage', 'notify', 'i18n', 'telemetry', 'compute', 'NoemaError']);

/** A day given by old code: a LocalDay, or day.invalid. */
function day(x: string): LocalDay {
  const r = parseDay(x);
  if (!r.ok) throw r.error;
  return r.value;
}

export function buildBridge(r: Resolver, extensions: readonly BridgeExtension[] = []): NoemaCoreBridge {
  const clock: Clock = r.get(CLOCK),
    errors = r.get(ERRORS),
    storage = r.get(STORAGE);
  const told = new Set<ErrorCode>();
  /** A storage failure the old code only sees as false / null: journaled once per code and page (a full storage is the signal's). */
  const failed = (e: NoemaError, where: string): void => {
    if (e.code === 'storage.quota' || told.has(e.code)) return;
    told.add(e.code);
    errors.report(e, { where, severity: e.code === 'storage.unavailable' ? 'info' : 'warning' });
  };

  const bridge: Record<string, unknown> = {
    version: 1,
    day: Object.freeze({
      of: (moment?: Date | number | string) =>
        moment === undefined ? clock.today() : dayOf(moment instanceof Date || typeof moment === 'number' ? moment : new Date(moment)),
      add: (d: string, n: number) => addDays(day(d), n),
      between: (a: string, b: string) => daysBetween(day(a), day(b)),
      weekStart: (d: string, firstDay = 1) => weekStart(day(d), firstDay),
      compare: (a: string, b: string) => compareDays(day(a), day(b)),
      is: isLocalDay,
    } satisfies DayBridge),
    clock: Object.freeze({
      now: () => clock.now(),
      today: () => clock.today(),
      timeZone: () => clock.timeZone(),
      onDayChange: (f: (d: string) => void) => clock.onDayChange(f),
    } satisfies ClockBridge),
    errors,
    storage: Object.freeze({
      kv: Object.freeze({
        get(key: string) {
          const x = storage.kv.get(key);
          if (x.ok) return x.value;
          failed(x.error, 'storage.kv.get');
          return null;
        },
        set(key: string, value: unknown) {
          const x = storage.kv.set(key, textOf(value));
          if (!x.ok) failed(x.error, 'storage.kv.set');
          return x.ok;
        },
        delete(key: string) {
          const x = storage.kv.delete(key);
          if (!x.ok) failed(x.error, 'storage.kv.delete');
        },
        keys(prefix = '') {
          const x = storage.kv.keys(prefix);
          if (x.ok) return x.value;
          failed(x.error, 'storage.kv.keys');
          return [];
        },
      }),
      async estimate() {
        const x = await storage.estimate();
        if (x.ok) return x.value;
        failed(x.error, 'storage.estimate');
        return null;
      },
      async persist() {
        const x = await storage.persist();
        if (x.ok) return x.value;
        failed(x.error, 'storage.persist');
        return false;
      },
    } satisfies StorageBridge),
    notify: r.get(NOTIFIER),
    i18n: r.get(I18N),
    telemetry: r.get(TELEMETRY),
    compute: Object.freeze({
      async run<O>(job: string, input: unknown, options?: RunOptions): Promise<O> {
        const x = await r.get(COMPUTE).run<O>(job, input, options);
        if (x.ok) return x.value;
        throw x.error;
      },
    } satisfies ComputeBridge),
    NoemaError,
  };
  for (const ext of extensions) {
    if (CORE_NAMES.has(ext.name) || ext.name in bridge)
      throw new NoemaError('invariant.failed', `invariant failed: the bridge already has ${ext.name}`);
    bridge[ext.name] = ext.build(r);
  }
  return Object.freeze(bridge) as NoemaCoreBridge;
}
