import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOOLS } from './tools/index.ts';
import { checkArgs, type JsonSchema } from './validate.ts';

const S: JsonSchema = { type: 'object', properties: { n: { type: 'integer' }, on: { type: 'boolean' }, part: { type: 'string', enum: ['a', 'b'] }, ids: { type: 'array', items: { type: 'string' } }, facts: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] } }, required: ['part'] };

test('scalars sent as strings are converted when that is lossless', () => {
  const r = checkArgs(S, { n: '12', on: 'false', ids: [1, 'b'] });
  assert.deepEqual(r, { ok: true, value: { n: 12, on: false, ids: ['1', 'b'] } });
});

test('what does not fit is refused with every problem', () => {
  const r = checkArgs(S, { n: 1.5, on: 'yes', part: 'c', facts: {} });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.problems, ['n: must be an integer (got number)', 'on: must be a boolean (got string)', 'part: must be one of a, b (got "c")', 'facts.x: required']);
  assert.equal(checkArgs(S, 'x').ok, false);
});

test('a missing top-level argument is left to the tool (its own instructions); checked when asked', () => {
  assert.equal(checkArgs(S, {}).ok, true);
  assert.equal(checkArgs(S, {}, { required: true }).ok, false);
});

test('every tool: a definition with a name, a description and an object schema; names unique', () => {
  const names = TOOLS.map(t => t.definition.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of TOOLS) {
    assert.match(t.definition.name, /^noema_[a-z_]+$/);
    assert.ok(t.definition.description.length > 20, t.definition.name);
    assert.equal(t.definition.inputSchema.type, 'object', t.definition.name);
  }
});
