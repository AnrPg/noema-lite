/**
 * The ErrorReporter: a bounded local journal (kept across reloads in the device's key-value store, never synced or sent),
 * the console, local telemetry, and — when asked — a notice to the learner in their language.
 *
 * The notice's words: NOTICE_KEYS maps an internal code to its catalog key (storage.quota → loader.storage.full, the
 * storage-full warning); a contract code shows its own "err." text (i18n.err). An error or a fatal error is an alert
 * (a long toast + the assertive live region), a warning a toast. The same code tells the learner at most once a minute.
 */
import { NoemaError, SEVERITIES, type ErrorCode, type Severity } from '../../kernel/errors.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { ErrorReporter, JournalEntry, ReportOptions } from '../../ports/error-reporter.ts';
import type { I18n } from '../../ports/i18n.ts';
import type { Notifier } from '../../ports/notifier.ts';
import type { KeyValueStore } from '../../ports/storage.ts';
import type { Telemetry } from '../../ports/telemetry.ts';

/** Internal codes the learner may be told about, and the catalog key of the words. */
export const NOTICE_KEYS: Partial<Record<ErrorCode, string>> = Object.freeze({
  'storage.quota': 'loader.storage.full',
});

export const JOURNAL_KEY = 'noema-device:errors';

type ConsoleLike = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export interface ErrorReporterDeps {
  readonly now?: () => number;
  readonly notifier?: Notifier;
  readonly i18n?: I18n;
  /** Where the journal is kept across reloads (left out: in memory only). */
  readonly journalStore?: KeyValueStore;
  readonly journalKey?: string;
  readonly maxEntries?: number;
  readonly noticeEveryMs?: number;
  readonly console?: ConsoleLike;
  readonly telemetry?: Telemetry;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

function cleanContext(c: ReportOptions['context']): JournalEntry['context'] {
  if (!c) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(c)) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
  return out;
}

export function createErrorReporter(deps: ErrorReporterDeps = {}): ErrorReporter {
  const now = deps.now ?? Date.now;
  const max = deps.maxEntries ?? 200;
  const key = deps.journalKey ?? JOURNAL_KEY;
  const out = deps.console ?? globalThis.console;
  const listeners = new Set<(e: JournalEntry) => void>();
  const lastNotice = new Map<ErrorCode, number>();
  let entries: JournalEntry[] = [];
  let busy = false;

  if (deps.journalStore) {
    const raw = deps.journalStore.get(key);
    if (raw.ok && raw.value) {
      try {
        const parsed: unknown = JSON.parse(raw.value);
        if (Array.isArray(parsed)) entries = (parsed as JournalEntry[]).slice(-max);
      } catch (e) {
        entries = [entry(new NoemaError('storage.corrupt', 'the error journal was not readable and starts again', { cause: e }), { where: 'errors.journal', severity: 'warning' })];
      }
    }
  }

  function entry(e: NoemaError, o: ReportOptions): JournalEntry {
    return Object.freeze({
      at: now(),
      code: e.code,
      message: e.message.slice(0, 1000),
      params: e.params,
      severity: o.severity ?? 'error',
      where: o.where ?? null,
      context: cleanContext(o.context),
      stack: typeof e.stack === 'string' ? e.stack.split('\n').slice(0, 6).join('\n') : null,
    });
  }

  const save = (): void => {
    if (!deps.journalStore) return;
    // Best effort: a journal that cannot be written (the storage is full) must not report itself again — the full
    // storage already raised its own signal, which is reported once. The entries stay in memory for this page.
    deps.journalStore.set(key, JSON.stringify(entries));
  };

  function tell(e: NoemaError, severity: Severity): void {
    const { notifier, i18n } = deps;
    if (!notifier) return;
    const at = now(), last = lastNotice.get(e.code);
    if (last !== undefined && at - last < (deps.noticeEveryMs ?? 60_000)) return;
    lastNotice.set(e.code, at);
    const k = NOTICE_KEYS[e.code];
    const text = i18n ? (k ? i18n.t(k) : i18n.err(e)) : e.message;
    if (rank(severity) >= rank('error')) notifier.alert('⚠️ ' + text);
    else notifier.toast(text);
  }

  const reporter: ErrorReporter = {
    report(thrown, o = {}) {
      const e = NoemaError.from(thrown);
      const severity = o.severity ?? 'error';
      const x = entry(e, o);
      entries.push(x);
      if (entries.length > max) entries = entries.slice(-max);
      if (busy) return x; // reported while reporting (the journal's own write failed): kept in memory, nothing more
      busy = true;
      try {
        save();
        const line = `[noema] ${x.where ?? 'error'}: ${e.code}: ${e.message}`;
        if (severity === 'debug') out.debug(line);
        else if (severity === 'info') out.info(line);
        else if (severity === 'warning') out.warn(line, thrown);
        else out.error(line, thrown);
        deps.telemetry?.count('error.' + e.code);
        if (o.notify) tell(e, severity);
        for (const l of [...listeners]) {
          // a listener that fails must not turn one report into a crash of the caller, nor into a report loop: console only
          try { l(x); } catch (le) { out.error('[noema] an error-journal listener failed', le); }
        }
      } finally {
        busy = false;
      }
      return x;
    },
    catcher(where, o = {}) {
      return (thrown: unknown) => { reporter.report(thrown, { ...o, where }); return undefined; };
    },
    journal: () => [...entries],
    clearJournal() { entries = []; save(); },
    onReport(listener): Unsubscribe { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return reporter;
}
