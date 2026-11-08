/* noema-lite — the levels model's rules: a prerequisite never sits above the step that needs it; the difficulty mix
   holds within each level of a pack; every level named is on its ladder (src/contracts/rules/levels.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prerequisiteLevel,
  roadmapLevels,
  knownStepLevels,
  ladder,
  difficultyMixPerLevel,
  packLevels,
  exerciseLevels,
  span,
  languageNodeLevel,
  LANGUAGE_LADDER,
  type Level,
  type RoadmapLike,
  type PackLike,
  type ExerciseLike,
} from './levels.ts';
import { satisfied } from './spec.ts';

const SEM: Level[] = [1, 2, 3, 4].map(n => ({ id: `s${n}`, kind: 'semester', order: n, names: { en: `Semester ${n}` } }));
const map = (nodes: RoadmapLike['nodes'], edges: RoadmapLike['edges']): RoadmapLike => ({ levels: SEM, nodes, edges });

test('a prerequisite never sits above the step that needs it', () => {
  assert.ok(satisfied(prerequisiteLevel, map({ a: { level: 's1' }, b: { level: 's2' } }, [{ from: 'a', to: 'b' }])), 'lower → higher');
  assert.ok(satisfied(prerequisiteLevel, map({ a: { level: 's2' }, b: { level: 's2' } }, [{ from: 'a', to: 'b' }])), 'the same level');
  const up = prerequisiteLevel.issues(map({ a: { level: 's3' }, b: { level: 's2' } }, [{ from: 'a', to: 'b' }]));
  assert.equal(up.length, 1);
  assert.equal(up[0]?.rule, 'levels.prerequisite');
  assert.match(up[0].message, /"b" \(Semester 2\) needs "a", which starts at a higher level \(Semester 3\)/);
  // ranges: compared by where they start
  assert.ok(satisfied(prerequisiteLevel, map({ a: { level: { from: 's1', to: 's3' } }, b: { level: 's2' } }, [{ from: 'a', to: 'b' }])));
  assert.ok(
    !satisfied(
      prerequisiteLevel,
      map({ a: { level: { from: 's3', to: 's4' } }, b: { level: { from: 's2', to: 's4' } } }, [{ from: 'a', to: 'b' }]),
    ),
  );
  // steps without a level are not compared; levels are optional
  assert.ok(satisfied(prerequisiteLevel, map({ a: { level: 's4' }, b: {} }, [{ from: 'a', to: 'b' }])));
  assert.ok(satisfied(roadmapLevels, { nodes: { a: {}, b: {} }, edges: [{ from: 'a', to: 'b' }] }));
});

test("every step's level is on the ladder, and a ladder is well formed", () => {
  assert.deepEqual(
    knownStepLevels.issues(map({ a: { level: 's9' } }, [])).map(i => i.at),
    ['a'],
  );
  assert.equal(span(SEM, { from: 's3', to: 's1' })?.from, 1);
  assert.equal(span(SEM, 'nope'), null);
  const twice = ladder.issues([...SEM, { id: 's1', kind: 'grade', order: 1, names: { en: 'x' } }]);
  assert.deepEqual(
    twice.map(i => i.message.split(' ')[0]),
    ['level', 'levels', 'one'],
  );
});

const ex = (id: string, difficulty: number, extra: Partial<ExerciseLike> = {}): ExerciseLike => ({
  id,
  section: 'ch01-s01',
  difficulty,
  ...extra,
});
/** n exercises at difficulty 1, 2 and 3 (in the 20 / 25 / 55 mix: 4 / 5 / 11 of 20) */
const mixed = (prefix: string, d1: number, d2: number, d3: number, level?: string): ExerciseLike[] =>
  [...Array<number>(d1).fill(1), ...Array<number>(d2).fill(2), ...Array<number>(d3).fill(3)].map((d: number, i) =>
    ex(`${prefix}-e${i}`, d, level ? { level } : {}),
  );

test('the difficulty mix holds within each level of a pack', () => {
  const two: Level[] = [
    { id: 'easy', kind: 'difficulty', order: 1, names: { en: 'Easy' } },
    { id: 'hard', kind: 'difficulty', order: 2, names: { en: 'Hard' } },
  ];
  const pack = (a: ExerciseLike[], b: ExerciseLike[]): PackLike => ({
    subject: { levels: two },
    chapters: [
      { id: 'ch01', level: 'easy', exercises: a },
      { id: 'ch02', level: 'hard', exercises: b },
    ],
  });
  assert.ok(satisfied(difficultyMixPerLevel(), pack(mixed('a', 4, 5, 11), mixed('b', 4, 5, 11))), 'both levels in the mix');
  // the whole pack is in the mix (8 / 10 / 22 of 40), each level is not
  const off = difficultyMixPerLevel().issues(pack(mixed('a', 8, 5, 7), mixed('b', 0, 5, 15)));
  assert.ok(off.length > 0 && off.every(i => i.rule === 'levels.difficultyMix'));
  assert.deepEqual([...new Set(off.map(i => i.at))].sort(), ['easy', 'hard']);
  // an exercise's own level wins over its chapter's; a pack without levels is not checked by level
  const moved = pack(mixed('a', 4, 5, 11).concat(mixed('x', 0, 0, 3, 'hard')), mixed('b', 4, 5, 8));
  assert.equal(exerciseLevels(moved).get('hard')?.length, 20);
  assert.ok(satisfied(difficultyMixPerLevel(), moved));
  assert.ok(satisfied(difficultyMixPerLevel(), { subject: {}, chapters: [{ id: 'ch01', exercises: mixed('a', 20, 0, 0) }] }));
  // a level the pack does not teach
  assert.deepEqual(
    packLevels()
      .issues({ subject: { levels: ['g7'] }, chapters: [{ id: 'ch01', level: 'g8', exercises: [] }] })
      .map(i => i.rule),
    ['levels.known'],
  );
  // one level for the whole pack: every exercise is at it
  assert.equal(
    exerciseLevels({ subject: { levels: ['g7'] }, chapters: [{ id: 'ch01', exercises: mixed('a', 4, 5, 11) }] }).get('g7')?.length,
    20,
  );
});

test('language courses keep their stages: the common model only maps them', () => {
  assert.deepEqual(
    LANGUAGE_LADDER.map(l => l.id),
    ['foundations', 'core', 'advanced'],
  );
  assert.ok(satisfied(ladder, LANGUAGE_LADDER));
  assert.equal(languageNodeLevel({ stage: 'core' }), 'core');
  assert.equal(languageNodeLevel({}), null);
});
