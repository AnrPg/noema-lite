/**
 * Compaction: what the log may forget. Only events whose type keeps "latest" (EVENT_INFO.retention) and that a later
 * event of the same key supersedes: an older saved state of an activity, an older "section opened", a setting changed
 * again. Answers, reviews, XP, attempts, restores and every other "history" event are kept for ever (the card
 * scheduler's optimiser and the xAPI export read them). The ids of forgotten events stay known to the store, so the
 * same event arriving again (another device) is still a duplicate.
 */
import { compareEvents, EVENT_INFO, keyOf, type LearningEvent } from './types.ts';

/** The ids `events` (any order) can forget; `keep(e)` may hold one back (e.g. an event not yet sent). */
export function compactable(events: readonly LearningEvent[], keep: (e: LearningEvent) => boolean = () => false): string[] {
  const latest = new Map<string, LearningEvent>();
  for (const e of events) {
    if (EVENT_INFO[e.type].retention !== 'latest') continue;
    const k = keyOf(e),
      had = latest.get(k);
    if (!had || compareEvents(had, e) < 0) latest.set(k, e);
  }
  const out: string[] = [];
  for (const e of events) {
    if (EVENT_INFO[e.type].retention !== 'latest') continue;
    if (latest.get(keyOf(e)) !== e && !keep(e)) out.push(e.id);
  }
  return out;
}
