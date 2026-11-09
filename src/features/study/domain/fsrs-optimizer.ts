/**
 * The FSRS-6 parameter optimiser: fits w0…w20 to the learner's own review log (the "card reviewed" events).
 *
 * The model predicts, before every review that comes at least a day after the one before, the probability that the card
 * is recalled (FSRS's forgetting curve R(t, S)); the loss is the log loss of those predictions against what happened
 * (again = forgotten, hard / good / easy = recalled), as the FSRS optimiser defines it. Same-day reviews are not
 * predicted but still move the memory (the short-term formula). Minimised by Adam on numerical gradients (central
 * differences), each parameter kept within the bounds of FSRS-6, starting from the parameters in use. A gentle pull
 * towards the starting point (weight 1 / the number of predictions) keeps a small log from swinging the parameters far;
 * with more reviews the data decides.
 *
 * Pure and deterministic: the same log gives the same parameters on every device. It runs as the Compute job
 * `study.fsrs.optimize` (src/features/study/application/jobs.ts), off the main thread.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, type Result } from '../../../kernel/result.ts';
import {
  AGAIN,
  DAY_MS,
  FSRS6_DEFAULT_PARAMETERS,
  FSRS6_LOWER_BOUNDS,
  FSRS6_UPPER_BOUNDS,
  checkParameters,
  isRating,
  memoryModel,
  type FsrsParameters,
  type Rating,
} from './fsrs.ts';

/** One review of the log. */
export interface ReviewRecord {
  readonly card: string;
  readonly rating: Rating;
  /** epoch ms */
  readonly at: number;
}

export interface OptimizeOptions {
  /** Where to start (and what to keep when the log is too small): the parameters in use. Default: FSRS-6's. */
  readonly parameters?: FsrsParameters;
  /** Adam steps (default 120). */
  readonly iterations?: number;
  readonly learningRate?: number;
  /** The fewest predictions (reviews a day or more after the one before) worth fitting (default 64). */
  readonly minPredictions?: number;
  /** Told after every step (the job's progress). */
  readonly onStep?: (done: number, total: number) => void;
}

export interface OptimizeResult {
  readonly parameters: FsrsParameters;
  /** Log loss of the result and of the starting parameters on the same log. */
  readonly loss: number;
  readonly baseline: number;
  readonly predictions: number;
  /** false: the log was too small (or nothing better was found) and the starting parameters are returned. */
  readonly optimized: boolean;
}

/** The log as one sequence per card: [days since the previous review (−1 for the first), rating]. */
type Sequence = readonly (readonly [number, Rating])[];

export function sequencesOf(reviews: readonly ReviewRecord[]): Sequence[] {
  const byCard = new Map<string, ReviewRecord[]>();
  for (const r of reviews) {
    if (!isRating(r.rating) || !Number.isFinite(r.at)) continue;
    const l = byCard.get(r.card) ?? [];
    l.push(r);
    byCard.set(r.card, l);
  }
  const out: Sequence[] = [];
  for (const key of [...byCard.keys()].sort()) {
    const l = (byCard.get(key) ?? []).slice().sort((a, b) => a.at - b.at);
    out.push(l.map((r, i): readonly [number, Rating] => [i === 0 ? -1 : Math.floor((r.at - (l[i - 1]?.at ?? r.at)) / DAY_MS), r.rating]));
  }
  return out;
}

const predictionsIn = (seqs: readonly Sequence[]): number => seqs.reduce((n, s) => n + s.filter(([t]) => t >= 1).length, 0);

/** The mean log loss of the parameters' predictions over the sequences (NaN-free: probabilities are clamped). */
export function logLoss(w: FsrsParameters, seqs: readonly Sequence[]): number {
  const m = memoryModel(w);
  let sum = 0,
    n = 0;
  for (const seq of seqs) {
    let s = 0,
      d = 0;
    seq.forEach(([t, rating], i) => {
      if (i === 0) {
        s = m.initialStability(rating);
        d = m.initialDifficulty(rating, true);
        return;
      }
      if (t >= 1) {
        const p = Math.min(Math.max(m.recall(t, s), 1e-6), 1 - 1e-6);
        sum -= rating === AGAIN ? Math.log(1 - p) : Math.log(p);
        n++;
        s = m.nextStability(d, s, p, rating);
      } else s = m.shortTermStability(s, rating);
      d = m.nextDifficulty(d, rating);
    });
  }
  return n ? sum / n : 0;
}

export function optimize(reviews: readonly ReviewRecord[], o: OptimizeOptions = {}): Result<OptimizeResult> {
  const start = checkParameters(o.parameters ?? FSRS6_DEFAULT_PARAMETERS);
  if (!start.ok) return start;
  const w0 = start.value,
    seqs = sequencesOf(reviews),
    predictions = predictionsIn(seqs),
    baseline = logLoss(w0, seqs);
  if (predictions < (o.minPredictions ?? 64)) return ok({ parameters: w0, loss: baseline, baseline, predictions, optimized: false });
  const steps = o.iterations ?? 120,
    lr = o.learningRate ?? 0.04,
    k = w0.length,
    range = w0.map((_, i) => (FSRS6_UPPER_BOUNDS[i] ?? 1) - (FSRS6_LOWER_BOUNDS[i] ?? 0));
  const prior = 1 / predictions;
  const objective = (w: readonly number[]): number =>
    logLoss(w, seqs) + prior * w.reduce((a, x, i) => a + ((x - (w0[i] ?? 0)) / (range[i] ?? 1)) ** 2, 0);
  const clamp = (x: number, i: number): number =>
    Math.min(Math.max(x, FSRS6_LOWER_BOUNDS[i] ?? -Infinity), FSRS6_UPPER_BOUNDS[i] ?? Infinity);
  const w = w0.slice(),
    mom = new Array<number>(k).fill(0),
    vel = new Array<number>(k).fill(0);
  let best = w.slice(),
    bestLoss = objective(w);
  for (let step = 1; step <= steps; step++) {
    const grad = w.map((x, i) => {
      const h = Math.max(1e-6, 1e-5 * (range[i] ?? 1));
      const up = w.slice(),
        down = w.slice();
      up[i] = clamp(x + h, i);
      down[i] = clamp(x - h, i);
      const span = (up[i] ?? 0) - (down[i] ?? 0);
      return span > 0 ? (objective(up) - objective(down)) / span : 0;
    });
    for (let i = 0; i < k; i++) {
      const g = grad[i] ?? 0;
      mom[i] = 0.9 * (mom[i] ?? 0) + 0.1 * g;
      vel[i] = 0.999 * (vel[i] ?? 0) + 0.001 * g * g;
      const mh = (mom[i] ?? 0) / (1 - 0.9 ** step),
        vh = (vel[i] ?? 0) / (1 - 0.999 ** step);
      // the step is scaled to the parameter's own range (w3 spans 0–100 days, w7 0–0.75)
      w[i] = clamp((w[i] ?? 0) - ((lr * (range[i] ?? 1)) / 10) * (mh / (Math.sqrt(vh) + 1e-8)), i);
    }
    const l = objective(w);
    if (Number.isFinite(l) && l < bestLoss) {
      bestLoss = l;
      best = w.slice();
    }
    o.onStep?.(step, steps);
  }
  const fitted = checkParameters(best);
  if (!fitted.ok) return err(new NoemaError('study.invalid', 'the optimiser left the bounds of FSRS-6', { cause: fitted.error }));
  const loss = logLoss(fitted.value, seqs);
  return loss < baseline
    ? ok({ parameters: fitted.value, loss, baseline, predictions, optimized: true })
    : ok({ parameters: w0, loss: baseline, baseline, predictions, optimized: false });
}

/** Whether a fit is worth running again: the log has grown by a quarter (and at least 100 reviews) since the last fit
    (`reviewsThen`: the reviews the last fit saw, 0 for none). */
export const shouldRefit = (reviewsNow: number, reviewsThen: number): boolean => reviewsNow - reviewsThen >= Math.max(100, reviewsThen / 4);
