/**
 * The log as the study read models read it (src/features/study/domain/projections/input.ts, "the consumer's view of the
 * event contract"): one flat record per event — the envelope (id, type, hlc = the event's stamp, device, at = its moment
 * in ms, day, subject?, item?) and the fields of its data — with the few kinds the read models name differently mapped:
 *   card.reviewed / playbook.reviewed → card.reviewed { kind: 'card' | 'drill', rating } (a drill also keeps its score)
 *   card.imported / playbook.imported → card.imported { kind, state: { box, due? } } (a moved card also keeps `from`)
 *   subject.reset → progress.reset
 *   stats.imported → streak.imported { days, through } and xp.earned { amount }: the XP from before the log that no
 *                    subject's own import holds (the old a:stats total minus its per-subject part)
 * Only the events that count are given: a restore's window is left out here (the read models know no log.restored), so
 * a restore means "build again from all()". Every other kind passes through flat (the read models pass over what they
 * do not know).
 */
import type { LearningEvent } from './types.ts';
import { wallOf } from './projection.ts';
import { counts, exclusionsOf } from './windows.ts';

/** One event of the feed (flat, read only). */
export type FeedEvent = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly type: string;
  readonly hlc: string;
  readonly device: string;
  readonly at: number;
  readonly day: string;
};

/** One event of the log in the feed's shape → 0, 1 or 2 records (a log.restored: none). */
export function feedEventsOf(e: LearningEvent): FeedEvent[] {
  const base: Record<string, unknown> = { id: e.id, type: e.type, hlc: e.hlc, device: e.device, at: wallOf(e.hlc), day: e.day };
  if (e.subject !== undefined) base['subject'] = e.subject;
  if (e.item !== undefined) base['item'] = e.item;
  if (e.origin !== undefined) base['origin'] = e.origin;
  const rec = (x: Record<string, unknown>): FeedEvent => ({ ...base, ...x }) as FeedEvent;
  const one = (x: Record<string, unknown>): FeedEvent[] => [rec(x)];
  switch (e.type) {
    case 'log.restored':
      return [];
    case 'card.reviewed':
      return one({ kind: 'card', rating: e.data.rating });
    case 'playbook.reviewed':
      return one({ type: 'card.reviewed', kind: 'drill', rating: e.data.rating, score: e.data.score });
    case 'card.imported': {
      const { from, ...state } = e.data;
      return one({ kind: 'card', state, ...(from !== undefined ? { from } : {}) });
    }
    case 'playbook.imported':
      return one({ type: 'card.imported', kind: 'drill', state: { ...e.data } });
    case 'subject.reset':
      return one({ type: 'progress.reset' });
    case 'stats.imported': {
      const d = e.data,
        own = Object.values(d.bySubject).reduce<number>((a, n) => a + (n ?? 0), 0),
        out: FeedEvent[] = [];
      if (d.lastDay !== undefined && d.streak > 0) out.push(rec({ type: 'streak.imported', days: d.streak, through: d.lastDay }));
      if (d.xp > own) out.push(rec({ id: e.id + ':xp', type: 'xp.earned', amount: d.xp - own }));
      return out;
    }
    default:
      return one({ ...(e.data as Record<string, unknown>) });
  }
}

/** The whole log in the feed's shape, only what counts (no event inside a restore's window). */
export function feedEvents(events: readonly LearningEvent[]): FeedEvent[] {
  const x = exclusionsOf(events);
  const out: FeedEvent[] = [];
  for (const e of events) if (counts(e.hlc, x)) out.push(...feedEventsOf(e));
  return out;
}
