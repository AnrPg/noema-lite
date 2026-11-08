/**
 * A practice round as a statechart (src/kernel/statechart.ts; docs/ARCHITECTURE.md §6.4): a round of exercises, a boss
 * battle (three lives), the Mistakes gym, a round made from search results. Every screen that runs exercises one after
 * the other drives this machine and draws its snapshot, so a round can never be "between" two exercises or count an
 * answer twice.
 *
 *   asking ──ANSWER──▶ answered ──NEXT──▶ asking … ──▶ summary (final)
 *
 * ANSWER is taken once per exercise; a wrong answer outside a boss battle brings one sibling of the same learnable back a
 * little later (queries.ts siblingOf, through `deps.sibling`), and in a boss battle costs a life. After NEXT the round ends
 * when no exercise is left, or when the last life is gone.
 */
import { createActor, type Actor, type MachineDef, type Scheduler, type Snapshot } from '../../../kernel/statechart.ts';

export interface RoundExercise {
  readonly id: string;
}

export interface RoundContext<E extends RoundExercise> {
  readonly list: readonly E[];
  /** the exercise on screen */
  readonly i: number;
  readonly ok: number;
  readonly wrong: readonly E[];
  /** ids of the siblings brought in after a wrong answer (the "↻ another angle" pill) */
  readonly siblings: readonly string[];
  /** a boss battle's lives left (0 and `boss` null: a round without lives) */
  readonly lives: number;
  readonly boss: string | null;
  /** the verdict of the exercise on screen, once answered */
  readonly last: boolean | null;
}

export type RoundEvent = { readonly type: 'ANSWER'; readonly ok: boolean } | { readonly type: 'NEXT' };
export type RoundState = 'asking' | 'answered' | 'summary';
export type RoundSnapshot<E extends RoundExercise> = Snapshot<RoundState, RoundContext<E>>;
/** A round has no effects: the screen draws its snapshot. */
export type RoundMachine<E extends RoundExercise> = MachineDef<RoundState, RoundContext<E>, RoundEvent, never>;
export type RoundActor<E extends RoundExercise> = Actor<RoundState, RoundContext<E>, RoundEvent, never>;

export interface RoundDeps<E extends RoundExercise> {
  /** a sibling to bring back after a wrong answer (null: none) */
  readonly sibling?: (ex: E, round: readonly E[]) => E | null;
}

/** How far after the exercise a sibling comes back. */
export const SIBLING_GAP = 3;
/** A boss battle's lives. */
export const BOSS_LIVES = 3;
/** The share of right answers a boss battle needs. */
export const BOSS_PASS = 0.7;

const over = <E extends RoundExercise>(c: RoundContext<E>): boolean => c.i >= c.list.length || (c.boss !== null && c.lives <= 0);

/** A round of these exercises (already ordered and cut to the round's size), a boss battle or not. */
export function roundMachine<E extends RoundExercise>(
  list: readonly E[],
  o: { readonly boss?: string | null } = {},
  deps: RoundDeps<E> = {},
): RoundMachine<E> {
  const boss = o.boss ?? null;
  const context: RoundContext<E> = { list, i: 0, ok: 0, wrong: [], siblings: [], lives: boss !== null ? BOSS_LIVES : 0, boss, last: null };
  const step = (c: RoundContext<E>): RoundContext<E> => ({ ...c, i: c.i + 1, last: null });
  return {
    id: 'study.round',
    initial: over(context) ? 'summary' : 'asking',
    context,
    states: {
      asking: {
        on: {
          ANSWER: {
            target: 'answered',
            assign: (c, e) => {
              const ex = c.list[c.i];
              if (!ex) return c;
              if (e.ok) return { ...c, ok: c.ok + 1, last: true };
              let next = c.list,
                siblings = c.siblings;
              const sib = c.boss === null ? (deps.sibling?.(ex, c.list) ?? null) : null;
              if (sib && !c.list.some(x => x.id === sib.id)) {
                const at = Math.min(c.i + SIBLING_GAP, c.list.length);
                next = [...c.list.slice(0, at), sib, ...c.list.slice(at)];
                siblings = [...siblings, sib.id];
              }
              return { ...c, list: next, siblings, wrong: [...c.wrong, ex], lives: c.boss !== null ? c.lives - 1 : c.lives, last: false };
            },
          },
        },
      },
      answered: {
        on: {
          NEXT: [
            { target: 'summary', guard: c => over(step(c)), assign: step },
            { target: 'asking', assign: step },
          ],
        },
      },
      summary: {},
    },
  };
}

/** A round running: one event at a time (it has no timers). */
export function startRound<E extends RoundExercise>(m: RoundMachine<E>, now: () => number): RoundActor<E> {
  const scheduler: Scheduler<number> = { now, setTimeout: () => 0, clearTimeout: () => undefined };
  return createActor(m, { scheduler, run: () => undefined, onError: () => undefined });
}

export interface RoundResult {
  /** exercises answered */
  readonly answered: number;
  readonly ok: number;
  /** ok / answered (0 when none) */
  readonly share: number;
  /** a boss battle: won? (null for any other round) */
  readonly bossWon: boolean | null;
}

/** What a finished (or abandoned) round comes to. */
export function roundResult<E extends RoundExercise>(c: RoundContext<E>): RoundResult {
  const answered = c.last === null ? c.i : c.i + 1;
  const share = answered ? c.ok / answered : 0;
  return {
    answered,
    ok: c.ok,
    share,
    bossWon: c.boss === null ? null : c.lives > 0 && c.i >= c.list.length && share >= BOSS_PASS,
  };
}
