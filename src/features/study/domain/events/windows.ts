/**
 * Which events count. The log only grows, so "undo" is itself an event:
 *  • log.restored {upTo} — a backup or restore point brought back: the events stamped after upTo and before the restore
 *    no longer count. A later restore that reaches back over an earlier one cancels it (the earlier restore sits inside
 *    the later one's window), so restores nest the way the learner meant them.
 *  • subject.reset — the subject's events before it no longer count for that subject's progress (only the latest reset
 *    that itself counts matters). XP across subjects is not reset, as before the log.
 */
import { compareEvents, type LearningEvent } from './types.ts';

export interface Window {
  /** Events stamped after this … */
  readonly from: string;
  /** … and before this (the restore's own stamp) do not count. */
  readonly to: string;
}

export interface Exclusions {
  readonly windows: readonly Window[];
  /** Per subject: the stamp of the reset in force (its earlier events do not count for it). */
  readonly resets: Readonly<Record<string, string>>;
}

export const NO_EXCLUSIONS: Exclusions = Object.freeze({ windows: Object.freeze([]), resets: Object.freeze({}) });

const inside = (at: string, w: Window): boolean => at > w.from && at < w.to;

export function counts(at: string, x: Exclusions): boolean {
  for (const w of x.windows) if (inside(at, w)) return false;
  return true;
}

/** Whether an event counts for its subject's progress (not in a restore window, not before the subject's reset). */
export function countsForSubject(e: LearningEvent, x: Exclusions): boolean {
  if (!counts(e.hlc, x)) return false;
  const r = e.subject === undefined ? undefined : x.resets[e.subject];
  return r === undefined || e.hlc >= r;
}

/** The windows and resets in force, from every restore and reset of the log (in any order). */
export function exclusionsOf(events: Iterable<LearningEvent>): Exclusions {
  const restores: Array<LearningEvent<'log.restored'>> = [],
    resets: Array<LearningEvent<'subject.reset'>> = [];
  for (const e of events) {
    if (e.type === 'log.restored') restores.push(e);
    else if (e.type === 'subject.reset') resets.push(e);
  }
  if (!restores.length && !resets.length) return NO_EXCLUSIONS;
  restores.sort((a, b) => compareEvents(b, a)); // the latest first: it decides whether the earlier ones still count
  const windows: Window[] = [];
  for (const r of restores) {
    if (windows.some(w => inside(r.hlc, w))) continue;
    if (r.data.upTo < r.hlc) windows.push({ from: r.data.upTo, to: r.hlc });
  }
  const x: Exclusions = { windows, resets: {} };
  const out: Record<string, string> = {};
  for (const r of resets) {
    if (r.subject === undefined || !counts(r.hlc, x)) continue;
    const had = out[r.subject];
    if (had === undefined || r.hlc > had) out[r.subject] = r.hlc;
  }
  return { windows, resets: out };
}

/** Whether adding `e` to a log whose exclusions are `x` changes which of the OTHER events count (a full refold then). */
export function changesExclusions(e: LearningEvent): boolean {
  return e.type === 'log.restored';
}
