/**
 * FSRS-6, the card scheduler (Free Spaced Repetition Scheduler, open-spaced-repetition; the reference implementation
 * is py-fsrs 6, whose published test values src/features/study/domain/fsrs.test.ts checks bit for bit).
 *
 * A card's memory is two numbers: stability S (days until recall drops to 90 %) and difficulty D (1–10). A review with
 * a rating (1 again · 2 hard · 3 good · 4 easy) updates them, and the next interval is the time at which the predicted
 * recall falls to the desired retention (default 0.9). New and forgotten cards pass short learning steps (minutes)
 * first. The 21 parameters w0…w20 are the learner's own once the optimiser (fsrs-optimizer.ts) has fitted them to their
 * review log; until then the published defaults.
 *
 * Pure: times are epoch milliseconds given by the caller (the Clock port), the random fuzz comes from a caller's
 * source (or none), nothing is mutated. Days are whole days of elapsed time (as py-fsrs counts them); the learner's
 * calendar day of a due time is `dueDay` (LocalDay).
 */
import { dayOf, noonOf, parseDay, type LocalDay } from '../../../kernel/day.ts';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, type Result } from '../../../kernel/result.ts';

export type Rating = 1 | 2 | 3 | 4;
export const AGAIN: Rating = 1;
export const HARD: Rating = 2;
export const GOOD: Rating = 3;
export const EASY: Rating = 4;
export const isRating = (x: unknown): x is Rating => x === 1 || x === 2 || x === 3 || x === 4;

/** w0…w20. */
export type FsrsParameters = readonly number[];

export const FSRS6_DEFAULT_PARAMETERS: FsrsParameters = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
  0.5425, 0.0912, 0.0658, 0.1542,
]);
export const STABILITY_MIN = 0.001;
export const FSRS6_LOWER_BOUNDS: FsrsParameters = Object.freeze([
  STABILITY_MIN,
  STABILITY_MIN,
  STABILITY_MIN,
  STABILITY_MIN,
  1.0,
  0.001,
  0.001,
  0.001,
  0.0,
  0.0,
  0.001,
  0.001,
  0.001,
  0.001,
  0.0,
  0.0,
  1.0,
  0.0,
  0.0,
  0.0,
  0.1,
]);
export const FSRS6_UPPER_BOUNDS: FsrsParameters = Object.freeze([
  100, 100, 100, 100, 10.0, 4.0, 4.0, 0.75, 4.5, 0.8, 3.5, 5.0, 0.25, 0.9, 4.0, 1.0, 6.0, 2.0, 2.0, 0.8, 0.8,
]);
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export type CardPhase = 'learning' | 'review' | 'relearning';

/** What the scheduler knows of one card (a new card: learning, step 0, no memory yet, due at once). */
export interface CardMemory {
  readonly phase: CardPhase;
  /** The learning / relearning step (null in review). */
  readonly step: number | null;
  /** Stability in days (null before the first review). */
  readonly s: number | null;
  /** Difficulty 1–10 (null before the first review). */
  readonly d: number | null;
  /** When it is due (epoch ms). */
  readonly dueAt: number;
  /** The last review (epoch ms), null for a new card. */
  readonly last: number | null;
  readonly reps: number;
  readonly lapses: number;
}

export interface SchedulerOptions {
  readonly parameters?: FsrsParameters;
  /** The recall probability at which a card comes back (0.7–0.97; default 0.9). */
  readonly retention?: number;
  /** Learning steps in ms (default 1 min, 10 min). */
  readonly learningSteps?: readonly number[];
  /** Relearning steps in ms (default 10 min). */
  readonly relearningSteps?: readonly number[];
  /** The longest interval in days (default 36500). */
  readonly maxInterval?: number;
  /** A uniform random number in [0, 1) for the interval fuzz; left out: no fuzz (the same review always gives the same day). */
  readonly random?: () => number;
}

export interface Scheduler {
  readonly parameters: FsrsParameters;
  readonly retention: number;
  /** The card after a review with `rating` at `at` (ms). */
  review(card: CardMemory, rating: Rating, at: number): CardMemory;
  /** The predicted probability of recall at `at` (0 for a card never reviewed). */
  retrievability(card: CardMemory, at: number): number;
  /** The next review interval in whole days for a stability. */
  interval(stability: number): number;
}

/** A card never reviewed, due at `at`. */
export const newCard = (at: number): CardMemory =>
  Object.freeze({ phase: 'learning', step: 0, s: null, d: null, dueAt: at, last: null, reps: 0, lapses: 0 });

/** The parameters, checked against the bounds of FSRS-6 (21 numbers, each within its bounds). */
export function checkParameters(w: readonly unknown[]): Result<FsrsParameters> {
  if (w.length !== FSRS6_DEFAULT_PARAMETERS.length)
    return err(new NoemaError('study.invalid', `FSRS-6 has 21 parameters, got ${w.length}`, { params: { n: w.length } }));
  const bad = w.findIndex(
    (x, i) => typeof x !== 'number' || !Number.isFinite(x) || x < at(FSRS6_LOWER_BOUNDS, i) || x > at(FSRS6_UPPER_BOUNDS, i),
  );
  if (bad >= 0) return err(new NoemaError('study.invalid', `FSRS-6 parameter w${bad} is out of bounds`, { params: { index: bad } }));
  return ok(Object.freeze(w.slice() as number[]));
}

/** Python's round(): half to even (py-fsrs rounds intervals so; 2.5 → 2, 3.5 → 4). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x),
    diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const at = (w: FsrsParameters, i: number): number => w[i] ?? 0;
const clampD = (d: number): number => Math.min(Math.max(d, MIN_DIFFICULTY), MAX_DIFFICULTY);
const clampS = (s: number): number => Math.max(s, STABILITY_MIN);

/** The memory formulas of FSRS-6 for one parameter vector (also used by the optimiser). */
export interface MemoryModel {
  readonly decay: number;
  readonly factor: number;
  initialStability(rating: Rating): number;
  initialDifficulty(rating: Rating, clamp: boolean): number;
  nextDifficulty(d: number, rating: Rating): number;
  /** Long-term update (at least a day since the last review). */
  nextStability(d: number, s: number, r: number, rating: Rating): number;
  /** Same-day update. */
  shortTermStability(s: number, rating: Rating): number;
  /** Recall probability after `days` with stability `s`. */
  recall(days: number, s: number): number;
}

export function memoryModel(w: FsrsParameters): MemoryModel {
  const decay = -at(w, 20),
    factor = 0.9 ** (1 / decay) - 1;
  const initialDifficulty = (rating: Rating, clamp: boolean): number => {
    const d = at(w, 4) - Math.E ** (at(w, 5) * (rating - 1)) + 1;
    return clamp ? clampD(d) : d;
  };
  return {
    decay,
    factor,
    initialStability: rating => clampS(at(w, rating - 1)),
    initialDifficulty,
    nextDifficulty(d, rating) {
      const delta = -(at(w, 6) * (rating - 3));
      const damped = d + ((10 - d) * delta) / 9;
      return clampD(at(w, 7) * initialDifficulty(EASY, false) + (1 - at(w, 7)) * damped);
    },
    nextStability(d, s, r, rating) {
      if (rating === AGAIN) {
        const long = at(w, 11) * d ** -at(w, 12) * ((s + 1) ** at(w, 13) - 1) * Math.E ** ((1 - r) * at(w, 14));
        const short = s / Math.E ** (at(w, 17) * at(w, 18));
        return clampS(Math.min(long, short));
      }
      const hard = rating === HARD ? at(w, 15) : 1,
        easy = rating === EASY ? at(w, 16) : 1;
      return clampS(s * (1 + Math.E ** at(w, 8) * (11 - d) * s ** -at(w, 9) * (Math.E ** ((1 - r) * at(w, 10)) - 1) * hard * easy));
    },
    shortTermStability(s, rating) {
      let inc = Math.E ** (at(w, 17) * (rating - 3 + at(w, 18))) * s ** -at(w, 19);
      if (rating !== AGAIN) inc = Math.max(inc, 1);
      return clampS(s * inc);
    },
    recall: (days, s) => (1 + (factor * days) / s) ** decay,
  };
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Infinity, factor: 0.05 },
] as const;

export function scheduler(o: SchedulerOptions = {}): Scheduler {
  const w = o.parameters ?? FSRS6_DEFAULT_PARAMETERS,
    retention = o.retention ?? 0.9,
    learning = o.learningSteps ?? [MINUTE_MS, 10 * MINUTE_MS],
    relearning = o.relearningSteps ?? [10 * MINUTE_MS],
    maxInterval = o.maxInterval ?? 36500,
    rnd = o.random;
  const m = memoryModel(w);
  const interval = (s: number): number =>
    Math.min(Math.max(roundHalfEven((s / m.factor) * (retention ** (1 / m.decay) - 1)), 1), maxInterval);
  const elapsedDays = (card: CardMemory, now: number): number | null =>
    card.last === null ? null : Math.floor((now - card.last) / DAY_MS);
  const retrievability = (card: CardMemory, now: number): number => {
    if (card.last === null || card.s === null) return 0;
    return m.recall(Math.max(0, elapsedDays(card, now) ?? 0), card.s);
  };
  const fuzz = (days: number): number => {
    if (!rnd || days < 2.5) return days;
    let delta = 1;
    for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(days, r.end) - r.start, 0);
    let lo = roundHalfEven(days - delta);
    const hi = Math.min(roundHalfEven(days + delta), maxInterval);
    lo = Math.min(Math.max(2, lo), hi);
    return Math.min(roundHalfEven(rnd() * (hi - lo + 1) + lo), maxInterval);
  };
  /** The steps of a learning or relearning phase after a rating: the next phase, step and wait (ms), or null = graduate. */
  const stepAfter = (steps: readonly number[], step: number, rating: Rating): { step: number; wait: number } | null => {
    if (steps.length === 0 || (step >= steps.length && rating !== AGAIN)) return null;
    switch (rating) {
      case AGAIN:
        return { step: 0, wait: steps[0] ?? 0 };
      case HARD:
        if (step === 0 && steps.length === 1) return { step, wait: (steps[0] ?? 0) * 1.5 };
        if (step === 0) return { step, wait: ((steps[0] ?? 0) + (steps[1] ?? 0)) / 2 };
        return { step, wait: steps[step] ?? 0 };
      case GOOD:
        return step + 1 === steps.length ? null : { step: step + 1, wait: steps[step + 1] ?? 0 };
      default: // EASY
        return null;
    }
  };
  function review(card: CardMemory, rating: Rating, now: number): CardMemory {
    const days = elapsedDays(card, now),
      sameDay = days !== null && days < 1;
    let s: number, d: number;
    if (card.s === null || card.d === null) {
      s = m.initialStability(rating);
      d = m.initialDifficulty(rating, true);
    } else {
      s = sameDay ? m.shortTermStability(card.s, rating) : m.nextStability(card.d, card.s, retrievability(card, now), rating);
      d = m.nextDifficulty(card.d, rating);
    }
    let phase: CardPhase, step: number | null, wait: number;
    const graduate = (): void => {
      phase = 'review';
      step = null;
      wait = fuzz(interval(s)) * DAY_MS;
    };
    phase = card.phase;
    step = card.step;
    wait = 0;
    if (card.phase === 'review') {
      if (rating === AGAIN && relearning.length > 0) {
        phase = 'relearning';
        step = 0;
        wait = relearning[0] ?? 0;
      } else graduate();
    } else {
      const next = stepAfter(card.phase === 'learning' ? learning : relearning, card.step ?? 0, rating);
      if (next === null) graduate();
      else {
        step = next.step;
        wait = next.wait;
      }
    }
    const lapse = card.phase === 'review' && rating === AGAIN ? 1 : 0;
    return Object.freeze({ phase, step, s, d, dueAt: now + wait, last: now, reps: card.reps + 1, lapses: card.lapses + lapse });
  }
  return { parameters: w, retention, review, retrievability, interval };
}

/** The learner's calendar day on which the card is due. */
export const dueDay = (card: CardMemory): LocalDay => dayOf(card.dueAt);

/** Due on (or before) the day `today`? */
export const isDueOn = (card: CardMemory, today: LocalDay): boolean => dueDay(card) <= today;

/** The days of the old Leitner boxes 0–5 (the scheduler before FSRS): a box's interval. */
export const LEITNER_BOX_DAYS: readonly number[] = Object.freeze([0, 1, 3, 7, 16, 35]);

/** A memory's mastery on the old boxes' scale 0–5 (for a five-dot meter): how many of the boxes' intervals its stability
    has reached; 0 for a card never reviewed (null) or still in its first steps. */
export function masteryBox(card: CardMemory | null): number {
  if (!card || card.reps === 0 || card.s === null) return 0;
  let b = 0;
  for (let i = 1; i < LEITNER_BOX_DAYS.length; i++) if (card.s >= (LEITNER_BOX_DAYS[i] ?? Infinity)) b = i;
  return b;
}

/**
 * A card scheduled by the old Leitner boxes ({box, due: "YYYY-MM-DD"}), as an FSRS memory: in review, its stability the
 * box's interval (the time it was trusted to be remembered), a middle difficulty, due at the noon of the same day as
 * before, last reviewed one interval before that. Nothing the learner did is lost: the card keeps its place in the queue
 * and FSRS takes over at its next review. Box 0 (or none) is a new card.
 */
export function fromLeitner(box: unknown, due: unknown): CardMemory {
  const n = typeof box === 'number' && Number.isFinite(box) ? box : 0,
    b = Math.min(5, Math.max(0, Math.round(n)));
  const day = parseDay(due),
    dueAt = day.ok ? noonOf(day.value).getTime() : 0;
  if (b === 0) return newCard(dueAt);
  const days = LEITNER_BOX_DAYS[b] ?? 1;
  return Object.freeze({ phase: 'review', step: null, s: days, d: 5, dueAt, last: dueAt - days * DAY_MS, reps: b, lapses: 0 });
}

const PHASES: ReadonlySet<unknown> = new Set(['learning', 'review', 'relearning']);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * A stored card state as the scheduler's memory: an FSRS memory as it is, an old Leitner entry converted (fromLeitner),
 * null for anything else (no state: the card is new).
 */
export function cardMemoryOf(raw: unknown): CardMemory | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (PHASES.has(r.phase)) {
    const dueAt = num(r.dueAt);
    if (dueAt === null) return null;
    const s = num(r.s),
      d = num(r.d),
      step = num(r.step);
    return Object.freeze({
      phase: r.phase as CardPhase,
      step: r.phase === 'review' ? null : (step ?? 0),
      s: s === null ? null : clampS(s),
      d: d === null ? null : clampD(d),
      dueAt,
      last: num(r.last),
      reps: num(r.reps) ?? 0,
      lapses: num(r.lapses) ?? 0,
    });
  }
  if ('box' in r || 'due' in r) return fromLeitner(r.box, r.due);
  return null;
}

/** Of two copies of one card's state (two devices), the one reviewed last (ties: the one due later). */
export function laterReview<T>(x: T, y: T): T {
  const a = cardMemoryOf(x),
    b = cardMemoryOf(y);
  if (!a) return y;
  if (!b) return x;
  const la = a.last ?? -Infinity,
    lb = b.last ?? -Infinity;
  if (la !== lb) return la > lb ? x : y;
  return a.dueAt >= b.dueAt ? x : y;
}
