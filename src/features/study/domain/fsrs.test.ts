/// <reference types="node" />
/* FSRS-6 against the published reference values of py-fsrs 6 (tests/test_basic.py of open-spaced-repetition/py-fsrs:
   test_review_card, test_memo_state, test_repeated_correct_reviews, the learning / relearning steps, the bounds). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGAIN,
  DAY_MS,
  EASY,
  FSRS6_DEFAULT_PARAMETERS,
  GOOD,
  HARD,
  MINUTE_MS,
  STABILITY_MIN,
  cardMemoryOf,
  checkParameters,
  dueDay,
  fromLeitner,
  isDueOn,
  laterReview,
  newCard,
  roundHalfEven,
  scheduler,
  type CardMemory,
  type Rating,
} from './fsrs.ts';
import { parseDay, type LocalDay } from '../../../kernel/day.ts';

const T0 = Date.UTC(2022, 10, 29, 12, 30, 0, 0);
const day = (s: string): LocalDay => {
  const r = parseDay(s);
  if (!r.ok) throw r.error;
  return r.value;
};
const G = GOOD,
  A = AGAIN;

test('py-fsrs test_review_card: the intervals of G G G G G G A A G G G G G without fuzz', () => {
  const f = scheduler();
  let card = newCard(T0),
    now = T0;
  const ivl: number[] = [];
  for (const r of [G, G, G, G, G, G, A, A, G, G, G, G, G] as Rating[]) {
    card = f.review(card, r, now);
    ivl.push(Math.floor((card.dueAt - (card.last ?? 0)) / DAY_MS));
    now = card.dueAt;
  }
  assert.deepEqual(ivl, [0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21]);
});

test('py-fsrs test_memo_state: S = 53.62691, D = 6.3574867 after A G G G G G', () => {
  const f = scheduler();
  let card = newCard(T0),
    now = T0;
  const ratings: Rating[] = [A, G, G, G, G, G],
    gaps = [0, 0, 1, 3, 8, 21];
  ratings.forEach((r, i) => {
    now += (gaps[i] ?? 0) * DAY_MS;
    card = f.review(card, r, now);
  });
  assert.ok(Math.abs((card.s ?? 0) - 53.62691) < 1e-4, `S = ${card.s}`);
  assert.ok(Math.abs((card.d ?? 0) - 6.3574867) < 1e-4, `D = ${card.d}`);
});

test('py-fsrs test_repeated_correct_reviews: ten Easy in a row → difficulty 1', () => {
  const f = scheduler();
  let card = newCard(T0);
  for (let i = 0; i < 10; i++) card = f.review(card, EASY, T0 + i);
  assert.equal(card.d, 1);
});

test('the learning steps: good → 10 min, again → 1 min, hard → 5.5 min, easy → a day or more; then review', () => {
  const f = scheduler();
  const g = f.review(newCard(T0), GOOD, T0);
  assert.equal(g.phase, 'learning');
  assert.equal(g.step, 1);
  assert.equal(g.dueAt - T0, 10 * MINUTE_MS);
  const g2 = f.review(g, GOOD, g.dueAt);
  assert.equal(g2.phase, 'review');
  assert.equal(g2.step, null);
  assert.ok(g2.dueAt - T0 >= DAY_MS);
  assert.equal(f.review(newCard(T0), AGAIN, T0).dueAt - T0, MINUTE_MS);
  const h = f.review(newCard(T0), HARD, T0);
  assert.equal(h.step, 0);
  assert.equal(h.dueAt - T0, 5.5 * MINUTE_MS);
  const e = f.review(newCard(T0), EASY, T0);
  assert.equal(e.phase, 'review');
  assert.ok(e.dueAt - T0 >= DAY_MS);
});

test('relearning: again in review → 10 min relearning (a lapse), again stays, good → review', () => {
  const f = scheduler();
  let c = f.review(newCard(T0), GOOD, T0);
  c = f.review(c, GOOD, c.dueAt);
  c = f.review(c, GOOD, c.dueAt);
  const due = c.dueAt;
  c = f.review(c, AGAIN, due);
  assert.equal(c.phase, 'relearning');
  assert.equal(c.step, 0);
  assert.equal(c.dueAt - due, 10 * MINUTE_MS);
  assert.equal(c.lapses, 1);
  const d2 = c.dueAt;
  c = f.review(c, AGAIN, d2);
  assert.equal(c.phase, 'relearning');
  assert.equal(c.dueAt - d2, 10 * MINUTE_MS);
  c = f.review(c, GOOD, c.dueAt);
  assert.equal(c.phase, 'review');
  assert.equal(c.reps, 6);
});

test('no learning steps: the first review graduates; no relearning steps: again stays in review', () => {
  const f = scheduler({ learningSteps: [], relearningSteps: [] });
  const c = f.review(newCard(T0), AGAIN, T0);
  assert.equal(c.phase, 'review');
  const c2 = f.review(c, AGAIN, c.dueAt);
  assert.equal(c2.phase, 'review');
});

test('py-fsrs: a same-day hard review does not lower stability; stability never drops below its minimum', () => {
  const f = scheduler({ learningSteps: [] });
  const c = f.review(newCard(T0), GOOD, T0);
  assert.equal(f.review(c, HARD, T0 + MINUTE_MS).s, c.s);
  let x: CardMemory = newCard(T0);
  for (let i = 0; i < 1000; i++) {
    x = f.review(x, AGAIN, x.dueAt + DAY_MS);
    assert.ok((x.s ?? 0) >= STABILITY_MIN);
  }
});

test('the maximum interval holds, and the fuzz stays inside its range (py-fsrs: [lo, hi + 1] after rounding)', () => {
  const f = scheduler({ maxInterval: 100 });
  let c = newCard(T0);
  for (const r of [EASY, GOOD, EASY, GOOD] as Rating[]) {
    c = f.review(c, r, c.dueAt);
    assert.ok((c.dueAt - (c.last ?? 0)) / DAY_MS <= 100);
  }
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const plain = scheduler(),
    fuzzy = scheduler({ random: rnd });
  let p = newCard(T0);
  p = plain.review(p, GOOD, T0);
  p = plain.review(p, GOOD, p.dueAt);
  const base = Math.round((plain.review(p, GOOD, p.dueAt).dueAt - p.dueAt) / DAY_MS);
  for (let i = 0; i < 50; i++) {
    const days = (fuzzy.review(p, GOOD, p.dueAt).dueAt - p.dueAt) / DAY_MS;
    assert.ok(Number.isInteger(days) && days >= base - 2 && days <= base + 3, `${days} vs ${base}`);
  }
});

test('retrievability: 0 when new, 0.9 after one stability, falls with time', () => {
  const f = scheduler();
  assert.equal(f.retrievability(newCard(T0), T0), 0);
  const c = f.review(newCard(T0), EASY, T0);
  const s = c.s ?? 0;
  assert.ok(Math.abs(f.retrievability(c, T0 + Math.round(s) * DAY_MS) - 0.9) < 0.01);
  assert.ok(f.retrievability(c, T0 + 30 * DAY_MS) < f.retrievability(c, T0 + 3 * DAY_MS));
});

test('the parameters: 21 numbers within the bounds of FSRS-6', () => {
  assert.ok(checkParameters(FSRS6_DEFAULT_PARAMETERS).ok);
  assert.ok(!checkParameters([1, 2]).ok);
  const bad = [...FSRS6_DEFAULT_PARAMETERS];
  bad[20] = 0.9;
  const r = checkParameters(bad);
  assert.ok(!r.ok && r.error.code === 'study.invalid');
});

test("Python's round: half to even", () => {
  assert.deepEqual([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(roundHalfEven), [0, 2, 2, 4, 2, 3]);
});

test('an old Leitner entry becomes an FSRS memory due on the same day; FSRS states pass as they are', () => {
  const m = fromLeitner(3, '2026-03-10');
  assert.equal(m.phase, 'review');
  assert.equal(m.s, 7);
  assert.equal(dueDay(m), '2026-03-10');
  assert.ok(isDueOn(m, day('2026-03-10')) && !isDueOn(m, day('2026-03-09')));
  assert.equal(fromLeitner(0, '2026-03-10').phase, 'learning');
  assert.deepEqual(cardMemoryOf({ box: 3, due: '2026-03-10' }), m);
  const f = scheduler().review(m, GOOD, m.dueAt);
  assert.deepEqual(cardMemoryOf(JSON.parse(JSON.stringify(f))), f);
  assert.equal(cardMemoryOf(null), null);
  assert.equal(cardMemoryOf({ phase: 'review' }), null);
});

test('laterReview: the copy reviewed last wins, old and new shapes alike', () => {
  const f = scheduler();
  const a = f.review(newCard(T0), GOOD, T0),
    b = f.review(a, GOOD, a.dueAt);
  assert.equal(laterReview(a, b), b);
  assert.equal(laterReview(b, a), b);
  assert.equal(laterReview<unknown>({ box: 2, due: '2020-01-01' }, b), b);
  assert.equal(laterReview(null, b), b);
});
