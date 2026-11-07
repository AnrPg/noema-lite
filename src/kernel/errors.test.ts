/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERNAL_ERROR_CODES, NoemaError, USER_ERROR_CODES, isErrorCode, isUserErrorCode } from './errors.ts';

const root = new URL('../../', import.meta.url);
const arb = JSON.parse(readFileSync(new URL('i18n/errors/en.arb', root), 'utf8')) as Record<string, unknown>;
const doc = readFileSync(new URL('docs/i18n.md', root), 'utf8');
const table = doc.slice(doc.indexOf('### 6.2'), doc.indexOf('### 6.3'));
const tableCodes = [...table.matchAll(/^\| `([a-z_.]+)`/gm)].map(m => m[1]);

test('the user codes are exactly the contract table of docs/i18n.md §6.2', () => {
  assert.deepEqual([...USER_ERROR_CODES].sort(), [...new Set(tableCodes)].sort());
});

test("every user code has an English catalog text, except those §6.2 shows in the server's own words", () => {
  const noEntry = new Set([...table.matchAll(/^\| `([a-z_.]+)`[^\n]*no catalog entry/gm)].map(m => m[1]));
  for (const c of USER_ERROR_CODES) assert.ok(noEntry.has(c) || typeof arb['err.' + c] === 'string', 'err.' + c);
});

test('internal codes never collide with user codes and have no catalog entry', () => {
  for (const c of INTERNAL_ERROR_CODES) {
    assert.ok(!isUserErrorCode(c), c);
    assert.equal(arb['err.' + c], undefined, c);
  }
  assert.ok(isErrorCode('storage.quota') && !isErrorCode('storage.nope'));
});

test('NoemaError carries code, params, status, cause and serialises', () => {
  const cause = new Error('inner');
  const e = new NoemaError('cloud.server', 'HTTP 503', { params: { status: 503 }, cause, retryable: true, status: 503 });
  assert.ok(e instanceof Error && e.name === 'NoemaError' && Object.isFrozen(e.params));
  assert.equal(e.cause, cause);
  assert.ok(e.retryable);
  assert.deepEqual(e.toJSON(), { code: 'cloud.server', params: { status: 503 }, message: 'HTTP 503' });
  assert.deepEqual(JSON.parse(JSON.stringify(e)), { code: 'cloud.server', params: { status: 503 }, message: 'HTTP 503' });
});

test('NoemaError.from keeps a coded engine error, wraps anything else', () => {
  const old = Object.assign(new Error('Not signed in'), { code: 'auth.not_signed_in', params: { a: 1, bad: { x: 1 } }, status: 401 });
  const e = NoemaError.from(old);
  assert.equal(e.code, 'auth.not_signed_in');
  assert.deepEqual(e.params, { a: 1 });
  assert.equal(e.status, 401);
  assert.equal(e.cause, old);
  assert.equal(NoemaError.from(e), e);
  assert.equal(NoemaError.from(new TypeError('x')).code, 'internal.unexpected');
  assert.equal(NoemaError.from('text', 'storage.failed').code, 'storage.failed');
  assert.equal(NoemaError.from(Object.assign(new Error('x'), { code: 'made.up' })).code, 'internal.unexpected');
  const back = NoemaError.fromInfo({ code: 'compute.timeout', params: { ms: 5 }, message: 'took too long' });
  assert.ok(back.code === 'compute.timeout' && back.params['ms'] === 5 && back.message === 'took too long');
});
