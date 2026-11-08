/**
 * The log as the study read models read it (src/features/study/domain/projections/input.ts, "the consumer's view of the
 * event contract"): one flat record per event — the envelope (id, type, hlc = the event's stamp, device, at = its moment
 * in ms, day, subject?, item?, origin?) and the fields of its data — with the few kinds the read models name differently
 * mapped:
 *   card.reviewed / playbook.reviewed → card.reviewed { kind: 'card' | 'drill', rating } (a drill also keeps its score)
 *   card.imported / playbook.imported → card.imported { kind, state } (a moved card also keeps `from`)
 *   subject.reset → progress.reset
 *   stats.imported → streak.imported { days, through } and xp.earned { amount }: the XP from before the log that no
 *                    subject's own import holds (the old a:stats total minus its per-subject part)
 * Every other kind passes through flat (the read models pass over what they do not know).
 *
 * The read models add up what they are given, while the log merges what came from before it (two devices' old copies of
 * the same progress, src/features/study/domain/events/projection.ts). So the feed hands on, of the imports, only what
 * the ones before did not hold (a FeedContext follows them): a subject's imported XP and the stats' own beyond the most
 * seen, a streak only when it reaches later, a card's schedule only for a card the feed has not given yet (or moved).
 * Only the events that count are given: a restore's window is left out here (the read models know no log.restored), so
 * a restore means "build again from all()".
 */
import type { LocalDay } from '../../../../kernel/day.ts';
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
  /** The learner's day (checked by the event's schema). */
  readonly day: LocalDay;
};

/** What the feed has handed on of the imports so far. */
export interface FeedContext {
  /** Per subject, the most XP an import of it held. */
  readonly subjectXp: Map<string, number>;
  /** The stats' imports merged (the largest total and per-subject part). */
  readonly stats: { xp: number; bySubject: Map<string, number> };
  /** The stats' own XP given (beyond their subjects'). */
  extra: number;
  streak: { days: number; through: string } | null;
  /** The cards and drills given (subject|kind|item). */
  readonly cards: Set<string>;
}
export const feedContext = (): FeedContext => ({
  subjectXp: new Map(),
  stats: { xp: 0, bySubject: new Map() },
  extra: 0,
  streak: null,
  cards: new Set(),
});

/** One event of the log in the feed's shape → 0, 1 or 2 records (a log.restored, or an import already given: none). */
export function feedEventsOf(e: LearningEvent, ctx: FeedContext): FeedEvent[] {
  const base: Record<string, unknown> = { id: e.id, type: e.type, hlc: e.hlc, device: e.device, at: wallOf(e.hlc), day: e.day };
  if (e.subject !== undefined) base['subject'] = e.subject;
  if (e.item !== undefined) base['item'] = e.item;
  if (e.origin !== undefined) base['origin'] = e.origin;
  const rec = (x: Record<string, unknown>): FeedEvent => ({ ...base, ...x }) as FeedEvent;
  const one = (x: Record<string, unknown>): FeedEvent[] => [rec(x)];
  const card = (kind: 'card' | 'drill'): string => `${e.subject ?? ''}|${kind}|${e.item ?? ''}`;
  switch (e.type) {
    case 'log.restored':
      return [];
    case 'card.reviewed':
      ctx.cards.add(card('card'));
      return one({ kind: 'card', rating: e.data.rating });
    case 'playbook.reviewed':
      ctx.cards.add(card('drill'));
      return one({ type: 'card.reviewed', kind: 'drill', rating: e.data.rating, score: e.data.score });
    case 'card.imported': {
      const { from, state } = e.data;
      if (ctx.cards.has(card('card')) && from === undefined) return [];
      ctx.cards.add(card('card'));
      return one({ kind: 'card', state, ...(from !== undefined ? { from } : {}) });
    }
    case 'playbook.imported':
      if (ctx.cards.has(card('drill'))) return [];
      ctx.cards.add(card('drill'));
      return one({ type: 'card.imported', kind: 'drill', state: e.data.state });
    case 'subject.reset': {
      const s = e.subject ?? '';
      for (const k of [...ctx.cards]) if (k.startsWith(s + '|')) ctx.cards.delete(k);
      ctx.subjectXp.delete(s);
      return one({ type: 'progress.reset' });
    }
    case 'xp.earned': {
      if (e.origin !== 'migration' || e.subject === undefined) return one({ ...e.data });
      const had = ctx.subjectXp.get(e.subject) ?? 0;
      ctx.subjectXp.set(e.subject, Math.max(had, e.data.amount));
      return e.data.amount > had ? one({ ...e.data, amount: e.data.amount - had }) : [];
    }
    case 'stats.imported': {
      const d = e.data,
        m = ctx.stats,
        out: FeedEvent[] = [];
      m.xp = Math.max(m.xp, d.xp);
      for (const [s, n] of Object.entries(d.bySubject)) m.bySubject.set(s, Math.max(m.bySubject.get(s) ?? 0, n ?? 0));
      const own = [...m.bySubject.values()].reduce((a, n) => a + n, 0),
        extra = Math.max(0, m.xp - own);
      const s = ctx.streak;
      if (d.lastDay !== undefined && d.streak > 0 && (!s || d.lastDay > s.through || (d.lastDay === s.through && d.streak > s.days))) {
        ctx.streak = { days: d.streak, through: d.lastDay };
        out.push(rec({ type: 'streak.imported', days: d.streak, through: d.lastDay }));
      }
      if (extra > ctx.extra) out.push(rec({ id: e.id + ':xp', type: 'xp.earned', amount: extra - ctx.extra }));
      ctx.extra = Math.max(ctx.extra, extra);
      return out;
    }
    default:
      return one({ ...(e.data as Record<string, unknown>) });
  }
}

/** The whole log in the feed's shape, only what counts (no event inside a restore's window), in log order. */
export function feedEvents(events: readonly LearningEvent[], ctx: FeedContext = feedContext()): FeedEvent[] {
  const x = exclusionsOf(events);
  const out: FeedEvent[] = [];
  for (const e of events) if (counts(e.hlc, x)) out.push(...feedEventsOf(e, ctx));
  return out;
}
