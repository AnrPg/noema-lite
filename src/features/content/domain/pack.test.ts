/* noema-lite — the pack check: its exercise types and blocks are the contract's, the contract is checked first, and what a
   contract cannot say (ids, sections, pictures, the quantity rules, the languages) is checked after it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBalance } from './balance.ts';
import { checkExercise } from './exercise.ts';
import { BLOCKS, checkPack, TYPES } from './pack.ts';
import { QUALITY } from './rules.ts';
import { DIFFICULTY_MIX } from './levels.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const chapterSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/contracts/schemas/noema.chapter.v1.schema.json'), 'utf8')) as {
  $defs: { exerciseType: { enum: string[] }; block: { properties: { t: { enum: string[] } } } };
};
const noActivities = () => ({ errors: [], warnings: [] });

test("the exercise types and blocks are the contract's", () => {
  assert.deepEqual([...TYPES].sort(), [...chapterSchema.$defs.exerciseType.enum].sort());
  assert.deepEqual([...BLOCKS].sort(), [...chapterSchema.$defs.block.properties.t.enum].sort());
  assert.deepEqual([...TYPES].sort(), [...QUALITY.vocab.types].sort(), 'the quality vocabulary knows every type');
});

test('checkExercise: the contract first, then what it cannot say', () => {
  assert.deepEqual(checkExercise({ id: 'ch01-e001', type: 'tf', section: 'ch01-s01', q: 'Q?', answer: 'yes' }, {}), [
    'ch01-e001: answer: must be true or false',
  ]);
  const mcq = { id: 'ch01-e002', type: 'mcq', section: 'ch01-s01', q: 'Q?', options: ['a', 'b'], answer: 3, explain: 'x' };
  assert.deepEqual(checkExercise(mcq, {}), ['ch01-e002: "answer" must be the index of an option']);
  const tree = {
    id: 'ch01-e003',
    type: 'tree',
    section: 'ch01-s01',
    q: 'Q?',
    start: 'a',
    nodes: {
      a: {
        q: 'A?',
        options: [
          { text: 'go', ok: true, fb: 'f', to: 'b' },
          { text: 'stop', ok: false, fb: 'no' },
        ],
      },
      b: {
        q: 'B?',
        options: [
          { text: 'back', ok: true, fb: 'f', to: 'a' },
          { text: 'stop', ok: false, fb: 'no' },
        ],
      },
    },
  };
  assert.ok(checkExercise(tree, {}).includes('ch01-e003: the right path of the tree loops or leads nowhere'));
});

test('DIFFICULTY_MIX is the quality rule mix.difficulty', () => {
  const mix = QUALITY.checks.find(c => c.id === 'mix.difficulty');
  assert.deepEqual({ target: mix?.target, tol: mix?.tol }, { target: DIFFICULTY_MIX.target, tol: DIFFICULTY_MIX.tol });
});

test('checkPack: ids, sections and pictures; balance errors only when the pack asks for them', () => {
  const ex = (i: number, extra: object = {}) => ({
    id: `ch01-e${String(i).padStart(3, '0')}`,
    type: 'tf',
    section: 'ch01-s01',
    difficulty: 1,
    q: 'Q?',
    answer: true,
    explain: 'x',
    ...extra,
  });
  const pack = (authoring?: object) => ({
    format: 'noema-pack',
    subject: { id: 'demo-x', title: 'Demo', ...(authoring ? { authoring } : {}) },
    chapters: [
      {
        id: 'ch01',
        sections: [{ id: 'ch01-s01', title: 'S', blocks: [{ t: 'figure', media: 'nope' }] }],
        exercises: [ex(1), ex(1), ex(2, { section: 'ch09-s01' })],
      },
    ],
    media: {},
  });
  const r = checkPack(pack(), 'demo-y', {}, noActivities);
  assert.ok(r.errors.includes('subject.id is "demo-x" but you uploaded it as "demo-y"'));
  assert.ok(r.errors.includes('duplicate exercise ch01-e001'));
  assert.ok(r.errors.includes('ch01-e002: section ch09-s01 not found in its chapter'));
  assert.ok(r.errors.includes('ch01-s01: figure media "nope" not in pack.media'));
  assert.ok(
    !r.errors.some(e => e.includes('[balance')) && r.warnings.some(w => w.includes('[balance.type] mcq')),
    'no authoring.minPerKind: warnings',
  );
  assert.ok(
    checkPack(pack({ minPerKind: 3 }), null, {}, noActivities).errors.some(e => e.includes('[balance.type] mcq')),
    'minPerKind 3: errors',
  );
  assert.ok(!checkPack(pack({ minPerKind: 0 }), null, {}, noActivities).warnings.some(e => e.includes('[balance')), 'minPerKind 0: off');
  assert.deepEqual(r.counts, { chapters: 1, sections: 1, exercises: 3, visual: 0, media: 0 });
  assert.deepEqual(checkPack([], null, {}, noActivities).errors, ['not a JSON object']);
});

test('checkBalance: a missing exercise is named with its rule, value, have and need', () => {
  const ch = { id: 'ch01', sections: [], exercises: [1, 2].map(i => ({ id: `e${i}`, type: 'odd', difficulty: 1, tags: ['concept'] })) };
  const odd = checkBalance(ch, {}).find(i => i.value === 'odd');
  assert.deepEqual(odd && { rule: odd.rule, have: odd.have, need: odd.need }, { rule: 'balance.type', have: 2, need: 3 });
  assert.ok(checkBalance(ch, {}, { min: 2 }).every(i => i.value !== 'odd'));
  assert.ok(checkBalance(ch, { features: { code: true } }).some(i => i.value === 'spotbug'));
});
