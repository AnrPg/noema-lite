/// <reference types="node" />
/* The study queries: the card queue (FSRS memories and old Leitner entries alike), the Mistakes gym and a round's
   order, chapter and level progress, XP per day, the streak (with a run carried over) and the XP level. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDay, type LocalDay } from '../../../kernel/day.ts';
import { GOOD, newCard, scheduler } from './fsrs.ts';
import {
  cardQueue,
  chapterProgress,
  chaptersDone,
  countDue,
  countMistakes,
  goalReached,
  isDue,
  levelProgress,
  mistakes,
  roundOrder,
  shuffled,
  siblingOf,
  spreadFacades,
  streak,
  xpLevel,
  xpOn,
} from './queries.ts';

const D = (s: string): LocalDay => {
  const r = parseDay(s);
  if (!r.ok) throw r.error;
  return r.value;
};
const seq = (): (() => number) => {
  let s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

test('due cards: Leitner entries by their day, FSRS memories by theirs; new cards are not due', () => {
  const f = scheduler(),
    at = new Date(2026, 2, 10, 9).getTime();
  const fsrs = f.review(f.review(newCard(at), GOOD, at), GOOD, at + 600_000);
  const states = { a: { box: 2, due: '2026-03-09' }, b: { box: 1, due: '2026-03-11' }, c: fsrs, d: null };
  assert.ok(isDue(states.a, D('2026-03-10')) && !isDue(states.b, D('2026-03-10')));
  assert.ok(!isDue(states.c, D('2026-03-10')));
  assert.equal(countDue(states, D('2026-03-10')), 1);
  assert.equal(countDue(states, D('2026-03-30')), 3);
  assert.equal(countDue(states, D('2026-03-30'), ['a', 'x']), 1);
  assert.equal(countDue(null, D('2026-03-30')), 0);
});

test("today's deck: the due first (most overdue first), then at most N new; 'all': every card", () => {
  const cards = ['a', 'b', 'c', 'n1', 'n2', 'n3'].map(key => ({ key }));
  const states = { a: { box: 2, due: '2026-03-09' }, b: { box: 2, due: '2026-03-01' }, c: { box: 4, due: '2026-04-01' } };
  const q = cardQueue(cards, states, D('2026-03-10'), { random: seq(), newPerDay: 2 });
  assert.deepEqual(
    q.queue.slice(0, 2).map(c => c.key),
    ['b', 'a'],
  );
  assert.equal(q.queue.length, 4);
  assert.ok(q.queue.slice(2).every(c => c.key.startsWith('n')));
  assert.deepEqual([q.due, q.fresh, q.resting], [2, 3, 1]);
  assert.equal(cardQueue(cards, states, D('2026-03-10'), { random: seq(), all: true }).queue.length, 6);
});

test('the Mistakes gym and a round: confident mistakes first, facades of one learnable apart, a sibling', () => {
  const ex = [
    { id: 'e1', type: 'mcq', lr: 'L1', chapter: 'c1' },
    { id: 'e2', type: 'tf', lr: 'L1', chapter: 'c1' },
    { id: 'e3', type: 'mcq', lr: 'L2', chapter: 'c1' },
    { id: 'e4', type: 'order', lr: 'L1', chapter: 'c1' },
    { id: 'e5', type: 'mcq', chapter: 'c1' },
  ];
  const answers = {
    e1: { n: 1, ok: 0, last: false },
    e2: { n: 2, ok: 1, last: false, conf: 'sure' as const },
    e3: { n: 1, ok: 1, last: true },
  };
  assert.deepEqual(
    mistakes(ex, answers).map(e => e.id),
    ['e1', 'e2'],
  );
  assert.equal(countMistakes(answers), 2);
  const r = roundOrder(ex, answers, seq());
  assert.equal(r[0]?.id, 'e2', 'the confident mistake first');
  assert.equal(r.length, 5);
  for (let i = 1; i < r.length; i++)
    if (r[i]?.lr) assert.notEqual(r[i]?.lr, r[i - 1]?.lr, 'no two facades in a row where it can be helped');
  assert.deepEqual(
    spreadFacades([{ lr: 'a' }, { lr: 'a' }, { lr: 'b' }]).map(x => x.lr),
    ['a', 'b', 'a'],
  );
  assert.equal(siblingOf(ex[0] as (typeof ex)[number], [ex[0] as (typeof ex)[number]], ex, seq())?.lr, 'L1');
  assert.equal(siblingOf(ex[4] as (typeof ex)[number], [], ex, seq()), null);
  assert.deepEqual(shuffled([1, 2, 3], seq()).sort(), [1, 2, 3]);
});

test('progress: per chapter, chapters done, per level (own, section, chapter, pack level)', () => {
  const ch = {
    id: 'ch01',
    level: 'A',
    sections: [{ id: 'ch01-s01' }, { id: 'ch01-s02', level: 'B' }],
    exercises: [{ id: 'x1', section: 'ch01-s01' }, { id: 'x2', section: 'ch01-s02' }, { id: 'x3', level: 'B' }, { id: 'x4' }],
  };
  const read = { 'ch01-s01': 1 },
    answers = { x1: { ok: 1 }, x3: { ok: 0, last: false } };
  assert.deepEqual(chapterProgress(ch, read, answers), { sr: 0.5, ex: 0.25 });
  assert.equal(
    chaptersDone(
      [
        { id: 'ch01', sections: 2 },
        { num: 2, sections: [1] },
      ],
      { 'ch01-s01': 1, 'ch01-s02': 1, 'ch02-s01': 1 },
    ),
    2,
  );
  assert.equal(chaptersDone([], {}, { ch01: true, ch02: false }), 1);
  assert.deepEqual(levelProgress([ch], read, answers, { ladder: ['B', 'A'] }), [
    { level: 'B', sections: 1, read: 0, exercises: 2, solved: 0 },
    { level: 'A', sections: 1, read: 1, exercises: 2, solved: 1 },
  ]);
  const noLevel = { ...ch, level: undefined };
  assert.deepEqual(
    levelProgress([noLevel], read, answers, { packLevels: ['P'] }).map(x => x.level),
    ['B', 'P'],
  );
});

test('XP: per day, the goal, the streak (today or up to yesterday; a carried run joins), the XP level', () => {
  const byDay = { '2026-03-08': 5, '2026-03-09': 10, '2026-03-10': 3 };
  assert.equal(xpOn(byDay, D('2026-03-10')), 3);
  assert.ok(goalReached(byDay, D('2026-03-09'), 10) && !goalReached(byDay, D('2026-03-10'), 10));
  assert.equal(streak(byDay, D('2026-03-10')), 3);
  assert.equal(streak(byDay, D('2026-03-11')), 3, 'today has no XP yet: not broken');
  assert.equal(streak(byDay, D('2026-03-12')), 0);
  assert.equal(streak(byDay, D('2026-03-10'), { days: 4, through: D('2026-03-07') }), 7);
  assert.equal(streak(byDay, D('2026-03-10'), { days: 4, through: D('2026-03-05') }), 3, 'a gap breaks the carried run');
  assert.equal(streak({}, D('2026-03-10'), { days: 4, through: D('2026-03-09') }), 4);
  assert.deepEqual(xpLevel(0), { lv: 1, into: 0, need: 100 });
  assert.deepEqual(xpLevel(100), { lv: 2, into: 0, need: 120 });
  assert.deepEqual(xpLevel(250), { lv: 3, into: 30, need: 140 });
});
