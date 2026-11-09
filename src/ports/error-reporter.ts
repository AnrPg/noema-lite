/**
 * ErrorReporter port: where every failure goes (docs/ARCHITECTURE.md §4, docs/adr/004). There is no empty catch in the
 * code base: a caught error is handled, returned as a Result, or reported here — or the catch carries a comment that says
 * why ignoring it is right.
 *
 *  • `report(error, { where, severity, context, notify })` → a journal entry. `where` is a stable site name
 *    ("loader.translation.cache"), so the journal says which line failed; `severity` (default "error") decides the console
 *    level; `notify: true` also tells the learner (a notice in their language, at most once a minute per code).
 *  • `catcher(where, options)` — the same as a function for `.catch(...)` and callbacks; it returns undefined.
 *  • The journal is local (this device only, never sent): the last entries, kept across reloads, for problem reports.
 */
import type { ErrorCode, ErrorParams, Severity } from '../kernel/errors.ts';
import type { Unsubscribe } from './common.ts';

export interface ReportOptions {
  /** The site that failed: a stable dotted name. */
  readonly where?: string;
  /** Default: "error". debug and info reach only the journal. */
  readonly severity?: Severity;
  /** What was being done (keys, ids — never secrets or personal text). */
  readonly context?: { readonly [key: string]: string | number | boolean | null };
  /** Tell the learner (a translated notice). */
  readonly notify?: boolean;
}

export interface JournalEntry {
  readonly at: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly params: ErrorParams;
  readonly severity: Severity;
  readonly where: string | null;
  readonly context: ReportOptions['context'] | null;
  /** The first lines of the stack, when there is one. */
  readonly stack: string | null;
}

export interface ErrorReporter {
  report(error: unknown, options?: ReportOptions): JournalEntry;
  catcher(where: string, options?: Omit<ReportOptions, 'where'>): (error: unknown) => undefined;
  /** The journal, oldest first. */
  journal(): readonly JournalEntry[];
  clearJournal(): void;
  onReport(listener: (entry: JournalEntry) => void): Unsubscribe;
}
