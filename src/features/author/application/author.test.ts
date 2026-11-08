/* The activity author's application (createAuthoring) over fakes of what the page hands in: the shipped schemas from
   src/contracts/schemas, a catalogue of words, an expression checker, the content checks. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createAuthoring, type AuthorChecks, type AuthorDeps, type AuthorEngines } from './index.ts';

const schema = (f: string): unknown => JSON.parse(readFileSync(new URL(`../../../contracts/schemas/${f}`, import.meta.url), 'utf8'));
const SCHEMAS = [
  'noema.sim-spec.v1.schema.json',
  'noema.circuit.v1.schema.json',
  'noema.activities.v1.schema.json',
  'noema.common.v1.schema.json',
].map(schema);

const WORDS: Record<string, string> = { 'engine.author.type.formula': 'Formula', 'engine.author.missingText': 'Missing text' };
const words = {
  has: (k: string): boolean => k in WORDS,
  t: (k: string, v?: Readonly<Record<string, string | number>>): string => (WORDS[k] ?? k) + (v ? ` ${JSON.stringify(v)}` : ''),
};
const engines = {
  catalog: { CATALOG: [], byId: () => null },
  loaded: () => null,
  schema: () => null,
  expr: {
    check: (src: string, o: { vars: readonly string[] }) =>
      /^[a-z]+$/i.test(src) && !o.vars.includes(src) ? [{ msg: `unknown name ${src}` }] : [],
  },
} satisfies AuthorEngines;
const seen: unknown[] = [];
const checks: AuthorChecks = {
  checkSimSpec(spec) {
    seen.push(spec);
    return ['spec.params[0].min: must be below max', 'the string t.title is missing in en'];
  },
};
const deps = (over: Partial<AuthorDeps> = {}): AuthorDeps => ({
  engines: () => engines,
  checks: () => checks,
  words,
  refs: () => ({}),
  schemas: () => SCHEMAS,
  ...over,
});

test('the kinds: the built-in ones, named by the catalogue; a word that is missing is null, not the key', () => {
  const A = createAuthoring(deps());
  A.registry();
  assert.equal(A.T('type.formula'), 'Formula');
  assert.equal(A.T('no.such.word'), null);
  const kinds = A.service.kinds().flatMap(g => g.kinds.map(k => k.id));
  assert.ok(kinds.includes('sim-formula') && kinds.includes('sim-circuit'), kinds.join());
  const blank = A.service.blank();
  assert.equal(A.service.kindOf(blank).id, 'sim-formula');
  assert.equal(blank.spec['format'], 'noema.sim-spec/v1');
});

test('check: the validators’ messages at their field and tab, the empty texts of the word tables', () => {
  const A = createAuthoring(deps());
  A.registry();
  const d = A.service.blank();
  const probs = A.service.check({ ...d, strings: { en: { ...(d.strings['en'] ?? {}), x: '' } } });
  const at = probs.find(p => p.msg === 'must be below max');
  assert.ok(at);
  assert.deepEqual(at.path, ['params', 0, 'min']);
  assert.equal(at.tab, 'spec');
  assert.ok(probs.some(p => p.tab === 'strings' && p.key === 't.title'));
  assert.ok(probs.some(p => p.tab === 'strings' && p.key === 'x' && p.loc === 'en'));
  assert.equal(seen.length > 0, true, 'the content checks were asked');
});

test('a form for the spec and the item, kept per schema; the formula feedback names what a field may use', () => {
  const A = createAuthoring(deps());
  A.registry();
  const d = A.service.blank();
  const f1 = A.service.specForm(d.spec);
  assert.equal(f1.form, A.service.specForm(d.spec).form, 'cached');
  assert.equal(f1.form.tree(d.spec)?.kind, 'object');
  assert.equal(A.service.itemForm().tree(d.item)?.kind, 'object');
  const spec = { ...d.spec, params: [{ id: 'R' }], derived: [{ id: 'a', expr: '' }] };
  const fb = A.service.formula({ ...d, spec }, ['derived', 0, 'expr'], 'Q');
  assert.deepEqual(fb, { names: ['R'], error: 'unknown name Q' });
  assert.equal(A.service.formula({ ...d, spec }, ['derived', 0, 'expr'], 'R')?.error, null);
});

test('without the engine library and the checks: the schema alone speaks, the kinds are the built-in ones', () => {
  const A = createAuthoring(deps({ engines: () => null, checks: () => null }));
  A.registry();
  const d = A.service.blank();
  assert.ok(Array.isArray(A.service.check(d)));
  assert.equal(A.service.formula(d, ['derived', 0, 'expr'], 'x')?.error, null);
  const back = A.service.fromFiles(A.service.files(d));
  assert.deepEqual(back, d);
});
