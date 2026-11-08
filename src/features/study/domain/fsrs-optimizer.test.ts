/// <reference types="node" />
/* The FSRS-6 optimiser on a review log simulated from known parameters: it lowers the log loss towards that of the true
   parameters, stays within the bounds, is deterministic, and keeps the parameters in use when the log is too small. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGAIN,
  DAY_MS,
  EASY,
  FSRS6_DEFAULT_PARAMETERS,
  FSRS6_LOWER_BOUNDS,
  FSRS6_UPPER_BOUNDS,
  GOOD,
  HARD,
  memoryModel,
  type Rating,
} from './fsrs.ts';
import { logLoss, optimize, sequencesOf, type ReviewRecord } from './fsrs-optimizer.ts';

/** A deterministic uniform source (Park–Miller). */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Reviews of `cards` cards by a learner whose memory follows `truth`: each card is reviewed when the scheduler of the
    true model says, give or take, and recalled with the true model's probability. */
function simulate(truth: readonly number[], cards: number, perCard: number, seed: number): ReviewRecord[] {
  const m = memoryModel(truth),
    rnd = rng(seed),
    out: ReviewRecord[] = [];
  for (let c = 0; c < cards; c++) {
    let at = Date.UTC(2026, 0, 1) + c * 3_600_000,
      s = 0,
      d = 0;
    for (let i = 0; i < perCard; i++) {
      let rating: Rating;
      if (i === 0) {
        rating = rnd() < 0.3 ? AGAIN : GOOD;
        s = m.initialStability(rating);
        d = m.initialDifficulty(rating, true);
      } else {
        const t = Math.max(1, Math.round(s * (0.5 + rnd() * 2.5)));
        at += t * DAY_MS;
        const p = m.recall(t, s);
        rating = rnd() < p ? (rnd() < 0.15 ? HARD : rnd() < 0.15 ? EASY : GOOD) : AGAIN;
        s = m.nextStability(d, s, p, rating);
        d = m.nextDifficulty(d, rating);
      }
      out.push({ card: 'c' + String(c), rating, at });
    }
  }
  return out;
}

const TRUE = FSRS6_DEFAULT_PARAMETERS.map((w, i) => (i === 8 ? 1.3 : i === 11 ? 2.2 : i === 20 ? 0.35 : i === 4 ? 7.2 : w));

test('fits the log: lower loss than the defaults, near the true parameters, within the bounds, deterministic', () => {
  const log = simulate(TRUE, 160, 7, 11);
  const seqs = sequencesOf(log);
  const r = optimize(log, { iterations: 60 });
  assert.ok(r.ok);
  const { parameters, loss, baseline, predictions, optimized } = r.value;
  assert.ok(optimized, 'optimized');
  assert.equal(predictions, 160 * 6);
  assert.ok(loss < baseline, `${loss} < ${baseline}`);
  const truth = logLoss(TRUE, seqs);
  assert.ok(loss - truth < (baseline - truth) * 0.6, `gap ${loss - truth} vs ${baseline - truth}`);
  parameters.forEach((w, i) => {
    assert.ok(w >= (FSRS6_LOWER_BOUNDS[i] ?? 0) && w <= (FSRS6_UPPER_BOUNDS[i] ?? 0), `w${i} = ${w}`);
  });
  const again = optimize(log, { iterations: 60 });
  assert.ok(again.ok);
  assert.deepEqual(again.value.parameters, parameters);
});

test('a log too small to fit keeps the parameters in use', () => {
  const r = optimize(simulate(TRUE, 5, 3, 3));
  assert.ok(r.ok);
  assert.equal(r.value.optimized, false);
  assert.deepEqual(r.value.parameters, FSRS6_DEFAULT_PARAMETERS);
});

test('the order of the log does not matter; bad parameters are refused', () => {
  const log = simulate(TRUE, 20, 4, 5);
  assert.equal(logLoss(FSRS6_DEFAULT_PARAMETERS, sequencesOf([...log].reverse())), logLoss(FSRS6_DEFAULT_PARAMETERS, sequencesOf(log)));
  const r = optimize(log, { parameters: [1, 2, 3] });
  assert.ok(!r.ok && r.error.code === 'study.invalid');
});
