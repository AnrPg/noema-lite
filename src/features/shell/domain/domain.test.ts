/* The shell's rules: the character catalogue and its change rule, how much game, the treasures. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHARACTER_EMOJI,
  CHARACTER_GROUPS,
  CHARACTER_ORDER,
  DAY_MS,
  canChange,
  choosePatch,
  freeUntil,
  gameOf,
  livePreview,
  nextChangeAt,
  ownedCharacter,
  worldOf,
} from './characters.ts';
import { medals } from './progress.ts';

test('29 characters in three groups, each with a face', () => {
  assert.equal(CHARACTER_ORDER.length, 29);
  assert.equal(CHARACTER_GROUPS.animals.length + CHARACTER_GROUPS.tales.length + CHARACTER_GROUPS.grown.length, 29);
  assert.deepEqual(CHARACTER_GROUPS.tales, ['hood', 'piglet', 'candy', 'jack', 'frog', 'puss']);
  for (const k of CHARACTER_ORDER) assert.ok(CHARACTER_EMOJI[k]);
});

test('the own character: fixed, chosen, the deployment’s, the default', () => {
  assert.equal(ownedCharacter({}, {}), 'hedge');
  assert.equal(ownedCharacter({}, { character: 'owl' }), 'owl');
  assert.equal(ownedCharacter({ character: 'robot' }, { character: 'owl' }), 'robot');
  assert.equal(ownedCharacter({ character: 'robot' }, { character: 'prism', lockCharacter: true }), 'prism');
  assert.equal(ownedCharacter({ character: 'nobody' }, {}), 'hedge');
});

test('free for 15 days after the first choice, then once every 5 days; a try runs for its minutes', () => {
  const t0 = 1_000 * DAY_MS;
  assert.equal(nextChangeAt({}, t0), 0, 'nothing chosen: now');
  const first = choosePatch('owl', {}, {}, t0);
  assert.deepEqual(first, { character: 'owl', characterAt: t0, characterSince: t0 });
  const s1 = { ...first };
  assert.equal(freeUntil(s1), t0 + 15 * DAY_MS);
  const s2 = { ...s1, ...choosePatch('robot', s1, {}, t0 + 3 * DAY_MS) };
  assert.equal(s2.character, 'robot', 'free days: any change');
  const late = t0 + 20 * DAY_MS;
  assert.ok(canChange(s2, {}, late), 'past the free days, 17 days after the last change');
  const s3 = { ...s2, ...choosePatch('owl', s2, {}, late) };
  assert.equal(nextChangeAt(s3, late + DAY_MS), late + 5 * DAY_MS);
  assert.equal(choosePatch('bear', s3, {}, late + DAY_MS), null, 'too soon');
  assert.ok(choosePatch('bear', s3, {}, late + DAY_MS, true), 'forced');
  assert.equal(choosePatch('owl', {}, { character: 'prism', lockCharacter: true }, late), null, 'fixed');
  assert.deepEqual(livePreview({ m: 'owl', until: 10 }, 5, {}), { m: 'owl', until: 10 });
  assert.equal(livePreview({ m: 'owl', until: 10 }, 11, {}), null);
  assert.equal(livePreview({ m: 'owl', until: 10 }, 5, { character: 'prism', lockCharacter: true }), null);
});

test('what to learn and how much game', () => {
  assert.equal(worldOf({}), 'know');
  assert.equal(worldOf({ world: 'both' }), 'both');
  assert.equal(gameOf({}, {}, 'hedge'), 'playful');
  assert.equal(gameOf({}, {}, 'prism'), 'calm');
  assert.equal(gameOf({ game: 'playful' }, { character: 'prism', lockCharacter: true }, 'prism'), 'calm');
  assert.equal(gameOf({ game: 'off' }, { character: 'prism', lockCharacter: true }, 'prism'), 'off');
});

test('treasures', () => {
  const m = medals({ fcN: 120, sn: 8, xp: 50 });
  assert.deepEqual(
    m.filter(x => x.found).map(x => x.id),
    ['cards', 'week'],
  );
  assert.deepEqual(
    medals({ mastered: 1, boss: 2, xp: 1000, sn: 30 })
      .filter(x => x.found)
      .map(x => x.id),
    ['step', 'week', 'boss', 'xp', 'month'],
  );
});
