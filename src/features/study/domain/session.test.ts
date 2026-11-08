/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpret } from '../../../kernel/statechart.ts';
import { BOSS_LIVES, roundMachine, roundResult, startRound, SIBLING_GAP } from './session.ts';
import { atLevel, currentLevel, levelOf, offersLevelFilter } from './my-level.ts';

const ex = (id: string, lr?: string) => ({ id, ...(lr ? { lr } : {}) });

test('a round: one answer per exercise, NEXT moves on, the end is the summary', () => {
  const m = roundMachine<{ id: string }>();
  const s = interpret(m, startRound(m, [ex('a'), ex('b')]));
  assert.equal(s.state.value, 'asking');
  assert.equal(s.send({ type: 'NEXT' }), false, 'NEXT before an answer does nothing');
  s.send({ type: 'ANSWER', ok: true });
  assert.equal(s.send({ type: 'ANSWER', ok: false }), false, 'a second answer to the same exercise does nothing');
  assert.deepEqual([s.state.value, s.state.context.last, s.state.context.ok], ['answered', true, 1]);
  s.send({ type: 'NEXT' });
  s.send({ type: 'ANSWER', ok: false });
  s.send({ type: 'NEXT' });
  assert.equal(s.state.value, 'summary');
  assert.equal(s.state.done, true);
  assert.deepEqual(roundResult(s.state.context), { answered: 2, ok: 1, share: 0.5, bossWon: null });
  assert.deepEqual(
    s.state.context.wrong.map(e => e.id),
    ['b'],
  );
});

test('an empty round is the summary at once', () => {
  const m = roundMachine();
  assert.equal(startRound(m, []).value, 'summary');
});

test('a wrong answer brings a sibling back a few exercises later, once', () => {
  const all = [ex('a', 'L1'), ex('b'), ex('c'), ex('d'), ex('e'), ex('s', 'L1')];
  const m = roundMachine<{ id: string; lr?: string }>({
    sibling: (e, round) => all.find(x => x.lr === e.lr && x.id !== e.id && !round.includes(x)) ?? null,
  });
  const s = interpret(m, startRound(m, all.slice(0, 5)));
  s.send({ type: 'ANSWER', ok: false });
  assert.deepEqual(
    s.state.context.list.map(e => e.id),
    ['a', 'b', 'c', 's', 'd', 'e'],
  );
  assert.equal(s.state.context.list[SIBLING_GAP]?.id, 's');
  assert.deepEqual(s.state.context.siblings, ['s']);
});

test('a boss battle: lives, the end when the last is gone, won only with 70 %', () => {
  const m = roundMachine<{ id: string }>({ sibling: () => ex('never') });
  const list = Array.from({ length: 6 }, (_, i) => ex(`x${String(i)}`));
  const s = interpret(m, startRound(m, list, { boss: 'ch1' }));
  assert.equal(s.state.context.lives, BOSS_LIVES);
  for (let i = 0; i < 3; i++) {
    s.send({ type: 'ANSWER', ok: false });
    assert.equal(s.state.context.list.length, 6, 'no sibling in a boss battle');
    s.send({ type: 'NEXT' });
  }
  assert.equal(s.state.value, 'summary');
  assert.deepEqual(roundResult(s.state.context), { answered: 3, ok: 0, share: 0, bossWon: false });
  const w = interpret(m, startRound(m, list.slice(0, 4), { boss: 'ch1' }));
  for (const ok of [true, false, true, true]) {
    w.send({ type: 'ANSWER', ok });
    w.send({ type: 'NEXT' });
  }
  assert.equal(roundResult(w.state.context).bossWon, true);
});

test('my level: an item at its own, its section, chapter or pack level; the filter keeps the unlevelled', () => {
  const ch = { id: 'c', level: 'B', sections: [{ id: 's1', level: 'A' }, { id: 's2' }] };
  assert.equal(levelOf({ level: 'C', section: 's1' }, ch), 'C');
  assert.equal(levelOf({ section: 's1' }, ch), 'A');
  assert.equal(levelOf({ section: 's2' }, ch), 'B');
  assert.equal(levelOf({}, { id: 'd', sections: [] }, ['P']), 'P');
  assert.equal(levelOf({}, { id: 'd', sections: [] }, ['P', 'Q']), null);
  const ladder = [
    { id: 'B', order: 2 },
    { id: 'A', order: 1 },
  ];
  assert.equal(currentLevel(ladder, null), 'A');
  assert.equal(currentLevel(ladder, 'B'), 'B');
  assert.equal(currentLevel(ladder, 'Z'), 'A');
  assert.equal(currentLevel([], 'B'), null);
  assert.equal(offersLevelFilter(ladder, ['A', 'B', null]), true);
  assert.equal(offersLevelFilter(ladder, ['A', null]), false);
  assert.equal(offersLevelFilter([{ id: 'A', order: 1 }], ['A', 'B']), false);
  const items = [{ l: 'A' }, { l: 'B' }, { l: null }];
  assert.deepEqual(
    atLevel(items, 'A', x => x.l),
    [{ l: 'A' }, { l: null }],
  );
  assert.equal(atLevel(items, null, x => x.l).length, 3);
});
