/* noema-lite — the data contracts: every schema compiles in ajv's strict mode with a stable versioned id, every data file
   of the repository satisfies its contract, the compiled validators word their errors, and the copies of a format that
   live elsewhere (the Roadmap agents' schemas, packcheck's types, the difficulty mix) are the
   same as the contract (the connector's tool list: src/connector/tools/tools.test.ts). node --test --experimental-strip-types src/contracts/contracts.test.ts (npm run test:unit). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { check, problems, CONTRACT_IDS, isContractId } from './index.ts';
import { repoFiles, FILE_KINDS } from './repo.ts';
import { DIFFICULTY_MIX } from './rules/levels.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMAS = path.join(ROOT, 'src', 'contracts', 'schemas');
const require = createRequire(import.meta.url);
const readJson = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

interface Built {
  readonly file: string;
  readonly id: string;
  readonly name: string;
  readonly schema: Record<string, unknown>;
}
interface Ajv {
  getSchema(ref: string): unknown;
  compile(s: unknown): unknown;
}
const tool = './../../tools/contracts.mjs';
const { loadSchemas, makeAjv } = (await import(tool)) as { loadSchemas: () => Built[]; makeAjv: (s: Built[], o?: object) => Ajv };

test('every schema: draft 2020-12, an id noema.<name>.v<N> that is its file name, and it compiles (ajv strict)', () => {
  const schemas = loadSchemas();
  const files = fs.readdirSync(SCHEMAS).filter(f => f.endsWith('.schema.json'));
  assert.equal(schemas.length, files.length);
  const ajv = makeAjv(schemas);
  for (const s of schemas) {
    assert.match(s.id, /^https:\/\/noema-lite\.netlify\.app\/schemas\/noema\.[a-z][a-z0-9-]*\.v[0-9]+\.schema\.json$/);
    assert.equal(path.basename(new URL(s.id).pathname), s.file);
    for (const d of Object.keys((s.schema.$defs as object | undefined) ?? {}))
      assert.ok(ajv.getSchema(`${s.id}#/$defs/${d}`), `${s.name}#${d} compiles`);
  }
});

test('the compiled validators cover every schema and every definition', () => {
  for (const s of loadSchemas())
    for (const d of Object.keys((s.schema.$defs as object | undefined) ?? {})) assert.ok(isContractId(`${s.name}#${d}`), `${s.name}#${d}`);
  assert.ok(CONTRACT_IDS.length > 200);
  assert.deepEqual(
    check('noema.nothing.v9', {}).issues.map(i => i.text),
    ['unknown contract "noema.nothing.v9"'],
  );
});

test('every data file of the repository satisfies its contract', () => {
  const files = repoFiles(ROOT),
    bad: string[] = [];
  for (const { rel, kind } of files) for (const p of problems(kind.contract, readJson(rel))) bad.push(`${rel} (${kind.contract}): ${p}`);
  assert.deepEqual(bad.slice(0, 20), []);
  const used = new Set(files.map(f => f.kind.contract));
  for (const id of [
    'noema.subject.v1',
    'noema.sources.v1',
    'noema.chapter.v1',
    'noema.chapter.v1#patchFile',
    'noema.pack.v3',
    'noema.bridge.v1#core',
    'noema.bridge.v1#locale',
    'noema.visual.v1#mediaRegistry',
    'noema.lang.v1#lexicon',
    'noema.lang.v1#grammar',
    'noema.lang.v1#bank',
    'noema.langfacade.v1#manifest',
    'noema.activities.v1#item',
    'noema.account.v1#groups',
  ])
    assert.ok(used.has(id), `files of ${id} are checked`);
  for (const k of FILE_KINDS) assert.ok(isContractId(k.contract), k.contract);
  assert.ok(files.length > 500, `${files.length} files`);
});

test('a broken file gets the words of its contract', () => {
  const ch = readJson('tests/fixtures/demo-physics/chapters/ch01.json') as {
    exercises: Record<string, unknown>[];
    sections: { title?: string }[];
  };
  const e = ch.exercises[0] as Record<string, unknown>;
  assert.deepEqual(problems('noema.chapter.v1#exercise', { ...e, type: 'mcq', options: ['a', 'a'], answer: 0 }), [
    'options: must be a list of different texts',
  ]);
  assert.deepEqual(problems('noema.chapter.v1#exercise', { id: 'x', section: 's', type: 'nope', q: 'Q' }), ['type: unknown type']);
  const s0 = { ...(ch.sections[0] as object) } as { title?: string };
  delete s0.title;
  assert.ok(problems('noema.chapter.v1', { ...ch, sections: [s0] }).includes('sections[0].title: missing'));
  const subj = readJson('tests/fixtures/demo-physics/subject.json') as Record<string, unknown>;
  assert.deepEqual(problems('noema.subject.v1', { ...subj, i18n: { Greek: { title: 'x' } } }), [
    'i18n.Greek: "Greek" is not a locale code (e.g. el, fr, pt-PT, zh-Hant)',
  ]);
  assert.deepEqual(problems('noema.subject.v1', { ...subj, i18n: { el: { title: 'x', colour: 'red' } } }), [
    'i18n.el.colour: unknown field (allowed: title, appTitle, description, searchExamples, hero, tutor)',
  ]);
  assert.deepEqual(
    problems('noema.translation.v1', { format: 'noema-translation', v: 1, pack: 'demo-physics', locale: 'fr', chapters: [] }),
    ['chapters: must be a non-empty list of translated chapters'],
  );
  assert.ok(
    problems('noema.bridge.v1', {
      format: 'noema-bridge',
      v: 1,
      pack: 'p1',
      source: 'en',
      native: 'ru',
      status: 'draft',
      entries: [{ k: 'x', senses: [{ id: '1', t: '<b>x</b>' }] }],
    })[0]?.includes('plain text'),
  );
});

test('a Roadmap with levels, its inbox entries and claims', () => {
  const levels = [
    { id: 's1', kind: 'semester', order: 1, names: { en: 'Semester 1' } },
    { id: 's2', kind: 'semester', order: 2, names: { en: 'Semester 2', el: '2ο εξάμηνο' } },
  ];
  const c = {
    format: 'noema.curriculum/v1',
    id: 'c1',
    title: 'T',
    goal: 'G',
    levels,
    nodes: { a: { id: 'a', title: 'A', level: 's1' }, b: { id: 'b', title: 'B', level: { from: 's1', to: 's2' } } },
    edges: [{ from: 'a', to: 'b' }],
  };
  const base = check('noema.curriculum.v1', c);
  assert.deepEqual(
    base.issues.map(i => i.text),
    [],
  );
  assert.ok(!check('noema.curriculum.v1', { ...c, levels: [{ ...levels[0], kind: 'class' }] }).ok, 'an unknown kind of level');
  assert.ok(
    !check('noema.curriculum.v1', { ...c, levels: [{ id: 's1', kind: 'semester', order: 1, names: {} }] }).ok,
    'a level without a name',
  );
  assert.ok(check('noema.curriculum.v1#inboxEntry', { v: 1, kind: 'step', nid: 'a', packId: 'p', at: '2026-11-07T10:00:00Z' }).ok);
  assert.ok(check('noema.curriculum.v1#claim', { v: 1, nid: 'a', at: '2026-11-07T10:00:00Z', run: 'x1' }).ok);
});

/* ---------- the copies of a format that live elsewhere are the contract's ---------- */
test("engine/packcheck.js: its types and blocks are the contract's, and it checks shapes with the contracts", () => {
  require(path.join(ROOT, 'engine', 'packcheck.js'));
  const P = (
    globalThis as unknown as { NoemaPackCheck: { TYPES: Set<string>; BLOCKS: Set<string>; checkExercise(e: object, m: object): string[] } }
  ).NoemaPackCheck;
  const chapter = readJson('src/contracts/schemas/noema.chapter.v1.schema.json') as {
    $defs: { exerciseType: { enum: string[] }; block: { properties: { t: { enum: string[] } } } };
  };
  assert.deepEqual([...P.TYPES].sort(), [...chapter.$defs.exerciseType.enum].sort());
  assert.deepEqual([...P.BLOCKS].sort(), [...chapter.$defs.block.properties.t.enum].sort());
  assert.deepEqual(P.checkExercise({ id: 'ch01-e001', type: 'tf', section: 'ch01-s01', q: 'Q?', answer: 'yes' }, {}), [
    'ch01-e001: answer: must be true or false',
  ]);
});

test('DIFFICULTY_MIX is tools/pack_rules.json quality "mix.difficulty"', () => {
  const rules = readJson('tools/pack_rules.json') as { quality: { checks: { id: string; target?: object; tol?: number }[] } };
  const mix = rules.quality.checks.find(c => c.id === 'mix.difficulty');
  assert.deepEqual({ target: mix?.target, tol: mix?.tol }, { target: DIFFICULTY_MIX.target, tol: DIFFICULTY_MIX.tol });
});
