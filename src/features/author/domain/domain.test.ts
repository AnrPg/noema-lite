/* The activity author's domain: the JSON Schema core (registry, $ref, validation, branches, skeletons, paths), the form's
   view of a document and its edits, the activity document (names, files) and the .zip. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FieldNode, FormIntent, InputField, ObjectField } from '../../../ports/authoring.ts';
import { files, fromFiles, item, itemEdited, namesAt, partSub, tables } from './activity.ts';
import { applyIntent, formTree, type FormWords } from './form.ts';
import {
  branchIndex,
  delAt,
  getAt,
  node,
  objectView,
  parseNum,
  parsePath,
  pathStr,
  registry,
  schemaApi,
  setAt,
  skeleton,
  validate,
  walk,
} from './schema.ts';
import { crc32, unzip, zip } from './zip.ts';

const DOC = 'https://x.test/schemas/a.json';
const OTHER = 'https://x.test/schemas/b.json';
const SCHEMA = {
  $id: DOC,
  type: 'object',
  required: ['name', 'shape'],
  additionalProperties: false,
  properties: {
    name: { title: 'name', type: 'string', minLength: 1, 'x-noema': 'key' },
    size: { title: 'size', type: 'number', minimum: 0 },
    count: { title: 'count', type: 'integer' },
    mode: { title: 'mode', enum: ['lin', 'log'] },
    on: { type: 'boolean' },
    shape: { $ref: '#/$defs/shape' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    vars: { type: 'object', additionalProperties: { type: 'number' }, propertyNames: { pattern: '^[a-z]+$' } },
    numOrExpr: { $ref: 'b.json#/$defs/numOrExpr' },
  },
  $defs: {
    shape: {
      oneOf: [
        {
          type: 'object',
          required: ['kind', 'r'],
          properties: { kind: { const: 'circle' }, r: { type: 'number', default: 1 } },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'w', 'h'],
          properties: { kind: { const: 'rect' }, w: { type: 'number' }, h: { type: 'number' } },
          additionalProperties: false,
        },
      ],
    },
  },
};
const B = { $id: OTHER, $defs: { numOrExpr: { oneOf: [{ type: 'number' }, { type: 'string', 'x-noema': 'expr' }] } } };
const reg = registry([SCHEMA, B]);
const root = node(SCHEMA, DOC);
const W: FormWords = {
  label: (t, p, f) => f ?? p ?? t ?? '' /* no key has a word: the fallback, as the app's catalogs do */,
  help: () => '',
  text: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
};
const good = { name: 'a', shape: { kind: 'circle', r: 2 } };

test('the registry resolves local and relative $refs; an unknown schema is an error', () => {
  assert.deepEqual(reg.resolve('#/$defs/shape', DOC).base, DOC);
  assert.equal(reg.resolve('b.json#/$defs/numOrExpr', DOC).base, OTHER);
  assert.throws(() => reg.resolve('c.json#/x', DOC), /not in the registry/);
  assert.deepEqual(reg.ids().sort(), [DOC, OTHER].sort());
});

test('validate: types, required, enum, limits, unknown fields, the branch of a oneOf, maps and their names', () => {
  assert.deepEqual(validate(reg, SCHEMA, good), []);
  const kws = (v: unknown): string[] => validate(reg, SCHEMA, v).map(e => `${pathStr(e.path)}:${e.kw}`);
  assert.deepEqual(kws({ shape: { kind: 'circle', r: 1 } }), ['name:required']);
  assert.deepEqual(kws({ ...good, size: -1 }), ['size:minimum']);
  assert.deepEqual(kws({ ...good, mode: 'x' }), ['mode:enum']);
  assert.deepEqual(kws({ ...good, code: 1 }), ['code:additionalProperties']);
  assert.deepEqual(
    kws({ ...good, shape: { kind: 'rect', w: 1 } }),
    ['shape.h:required'],
    'the error of the branch the discriminator names',
  );
  assert.deepEqual(kws({ ...good, tags: ['a', 'b', 'c', 'd'] }), ['tags:maxItems']);
  assert.deepEqual(kws({ ...good, vars: { a: 1, B: 2 } }), ['vars.B:propertyNames']);
  assert.deepEqual(kws({ ...good, numOrExpr: true }), ['numOrExpr:type']);
  assert.equal(validate(reg, SCHEMA, { ...good, size: 1 })[0], undefined);
});

test('branches, skeletons and object views', () => {
  const shape = node(SCHEMA.$defs.shape, DOC);
  assert.equal(branchIndex(reg, shape, { kind: 'rect' }), 1);
  assert.equal(branchIndex(reg, node(B.$defs.numOrExpr, OTHER), '2 * x'), 1);
  assert.deepEqual(skeleton(reg, root), { name: '', shape: { kind: 'circle', r: 1 } });
  const ov = objectView(reg, shape, { kind: 'rect' });
  assert.equal(ov.d?.prop, 'kind');
  assert.deepEqual(ov.view.required, ['kind', 'w', 'h']);
  assert.equal(schemaApi.typeOf(reg, SCHEMA), 'object');
});

test('paths: a validator message names its field; get, set and delete in place', () => {
  assert.deepEqual(parsePath('spec.params[0].min: x', 'spec'), ['params', 0, 'min']);
  assert.equal(parsePath('other', 'spec'), null);
  assert.equal(pathStr(['a', 0, 'b'], 'spec'), 'spec.a[0].b');
  const v = { a: [{ b: 1 }, { b: 2 }] };
  assert.equal(getAt(v, ['a', 1, 'b']), 2);
  setAt(v, ['a', 0, 'b'], 5);
  delAt(v, ['a', 1]);
  assert.deepEqual(v, { a: [{ b: 5 }] });
  assert.equal(parseNum('4,7'), 4.7);
  assert.equal(parseNum('−2e-3'), -0.002);
  assert.equal(parseNum('x'), null);
});

test('walk visits every value with its schema (through $refs and the branch of an alternative)', () => {
  const seen: string[] = [];
  walk(reg, root, { ...good, numOrExpr: 'k * 2' }, [], (p, s) => {
    const x = s['x-noema'];
    if (typeof x === 'string') seen.push(`${pathStr(p)}:${x}`);
  });
  assert.deepEqual(seen, ['name:key', 'numOrExpr:expr']);
});

const find = (n: FieldNode | null, path: string): FieldNode | null => {
  if (!n) return null;
  if (JSON.stringify(n.path) === path) return n;
  const kids: (FieldNode | null)[] =
    n.kind === 'object'
      ? [...n.fields, ...(n.map?.entries.map(e => e.value) ?? [])]
      : n.kind === 'array'
        ? n.items.map(i => i.body)
        : n.kind === 'alt'
          ? [n.body]
          : [];
  for (const k of kids) {
    const r = find(k, path);
    if (r) return r;
  }
  return null;
};

test('the form tree: a control for every value, the absent optional fields, the discriminator as a select', () => {
  const t = formTree(reg, root, { ...good, size: 3, mode: 'log', on: true, tags: ['x'], vars: { a: 1 }, numOrExpr: 'q' }, W) as ObjectField;
  assert.equal(t.kind, 'object');
  assert.equal(t.frame, 'root');
  assert.deepEqual(
    t.absent.map(o => o.value),
    ['count'],
  );
  const size = find(t, '["size"]') as InputField;
  assert.equal(size.control, 'number');
  assert.equal(size.value, '3');
  assert.equal(size.removable, true);
  assert.equal((find(t, '["name"]') as InputField).removable, false, 'a required field has no x');
  assert.equal((find(t, '["mode"]') as InputField).value, '1');
  assert.equal((find(t, '["on"]') as InputField).control, 'checkbox');
  const shape = find(t, '["shape"]') as ObjectField;
  assert.equal(shape.frame, 'fieldset');
  assert.deepEqual(
    shape.disc?.options.map(o => o.label),
    ['circle', 'rect'],
  );
  const alt = find(t, '["numOrExpr"]');
  assert.ok(alt?.kind === 'alt');
  assert.equal(alt.selected, '1');
  assert.equal(alt.body?.bare, true);
  const vars = find(t, '["vars"]') as ObjectField;
  assert.deepEqual(
    vars.map?.entries.map(e => e.key),
    ['a'],
  );
  const unknown = formTree(reg, root, { ...good, extra: [1] }, W) as ObjectField;
  assert.equal((find(unknown, '["extra"]') as InputField).control, 'json', 'a field the schema does not describe is kept, as JSON');
});

test('the edits: change only their path; a number that is not one is refused at its field', () => {
  const ap = (v: unknown, i: FormIntent): ReturnType<typeof applyIntent> => applyIntent(reg, root, v, i, W);
  const v0 = { ...good, size: 1, extra: 'kept' };
  const r1 = ap(v0, { op: 'input', path: ['size'], control: 'number', raw: '2,5' });
  assert.deepEqual(r1.value, { ...v0, size: 2.5 });
  assert.equal(r1.structural, false);
  assert.deepEqual(v0.size, 1, 'the value given is not changed');
  const r2 = ap(v0, { op: 'input', path: ['size'], control: 'number', raw: 'abc' });
  assert.equal(r2.error, 'notNumber');
  assert.deepEqual(ap(v0, { op: 'input', path: ['count'], control: 'integer', raw: '1.5' }).error, 'notWhole');
  assert.deepEqual(ap(v0, { op: 'add', path: [], prop: 'tags' }).value, { ...v0, tags: [] });
  assert.deepEqual(ap(v0, { op: 'add', path: [], prop: 'tags' }).focus, ['tags']);
  const r3 = ap({ ...good, tags: ['a', 'b'] }, { op: 'move', path: ['tags'], from: 0, to: 1 });
  assert.deepEqual(r3.value, { ...good, tags: ['b', 'a'] });
  assert.deepEqual(ap({ ...good, tags: [] }, { op: 'push', path: ['tags'] }).value, { ...good, tags: [''] });
  assert.deepEqual(ap(v0, { op: 'remove', path: ['extra'] }).value, { ...good, size: 1 });
  assert.deepEqual(ap(good, { op: 'branch', path: ['shape'], option: 1 }).value, { name: 'a', shape: { kind: 'rect', w: 0, h: 0 } });
  assert.deepEqual(
    ap({ ...good, numOrExpr: '7' }, { op: 'alt', path: ['numOrExpr'], option: 0 }).value,
    { ...good, numOrExpr: 7 },
    'a formula that is a number becomes the number',
  );
  assert.deepEqual(ap({ ...good, mode: 'lin' }, { op: 'input', path: ['mode'], control: 'select', raw: '1' }).value, {
    ...good,
    mode: 'log',
  });
  const e = ap({ ...good, vars: { k1: 1 } }, { op: 'entry', path: ['vars'] });
  assert.deepEqual(e.value, { ...good, vars: { k1: 1, k2: 0 } });
  assert.deepEqual(e.focus, ['vars', 'k2', '$key']);
  assert.deepEqual(ap({ ...good, vars: { a: 1, b: 2 } }, { op: 'rename', path: ['vars'], from: 'a', to: 'c' }).value, {
    ...good,
    vars: { c: 1, b: 2 },
  });
  assert.deepEqual(
    ap({ ...good, vars: { a: 1, b: 2 } }, { op: 'rename', path: ['vars'], from: 'a', to: 'b' }).value,
    { ...good, vars: { a: 1, b: 2 } },
    'a name in use is refused',
  );
  assert.deepEqual(ap(good, { op: 'input', path: ['extra'], control: 'json', raw: '[1' }).error, 'notJson');
});

test('the activity: the names a formula may use, a part’s own spec, the files and back', () => {
  const spec = {
    consts: { k: 1 },
    params: [{ id: 'R' }],
    derived: [{ id: 'a' }, { id: 'b' }],
    outputs: [{ id: 's', kind: 'scalar' }],
    plots: [{ kind: 'function', x: { var: 'f' }, series: [{}] }],
  };
  assert.deepEqual(namesAt(spec, ['derived', 1, 'expr']), ['k', 'R', 'a']);
  assert.deepEqual(namesAt(spec, ['model', 'x']), ['k', 'R', 'a', 'b']);
  assert.deepEqual(namesAt(spec, ['plots', 0, 'series', 0, 'expr']), ['k', 'R', 'a', 'b', 's', 'f']);
  const sub = partSub({ format: 'f', consts: { k: 1 }, params: [] }, { engine: 'ode@1', inputs: { u: 's' }, model: {}, outputs: [] });
  assert.deepEqual(sub['consts'], { k: 1, u: 1 });
  const doc = { item: item('act-1'), spec: { format: 'noema.sim-spec/v1' }, strings: tables(['t']) };
  const f = files(doc);
  assert.deepEqual(Object.keys(f).slice(0, 2), ['activities/activities.json', 'activities/act-1/spec.json']);
  assert.equal(Object.keys(f).length, 7);
  assert.deepEqual(fromFiles(f, { item: {}, spec: {}, strings: {} }), doc);
  const renamed = itemEdited(doc.item, { ...doc.item, id: 'act-2' });
  assert.equal(renamed['entry'], 'activities/act-2/spec.json');
  assert.deepEqual(renamed['fallback'], { media: 'act-2-still', text: '' });
});

test('zip: stored entries read back the same; the checksum is the standard one', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const fs = { 'a/b.json': '{"x":"ε"}\n', 'c.txt': '' };
  assert.deepEqual(await unzip(zip(fs)), fs);
  await assert.rejects(unzip(new Uint8Array(30)), /not a zip/);
});
