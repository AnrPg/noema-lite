/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, andThen, err, fromPromise, fromThrowable, isErr, isOk, map, mapErr, match, ok, unwrap, unwrapOr, type Result } from './result.ts';

test('ok and err are frozen, narrowed by .ok', () => {
  const a: Result<number, string> = ok(1), b: Result<number, string> = err('no');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(b));
  assert.ok(isOk(a) && isErr(b));
  if (a.ok) assert.equal(a.value, 1);
  if (!b.ok) assert.equal(b.error, 'no');
});

test('map / mapErr / andThen touch only their side', () => {
  assert.deepEqual(map(ok(2), x => x * 3), ok(6));
  assert.deepEqual(map(err('e') as Result<number, string>, x => x * 3), err('e'));
  assert.deepEqual(mapErr(err('e'), e => e + '!'), err('e!'));
  assert.deepEqual(mapErr(ok(1) as Result<number, string>, e => e + '!'), ok(1));
  const half = (x: number): Result<number, string> => (x % 2 ? err('odd') : ok(x / 2));
  assert.deepEqual(andThen(ok(8), half), ok(4));
  assert.deepEqual(andThen(ok(3), half), err('odd'));
  assert.deepEqual(andThen(err('first') as Result<number, string>, half), err('first'));
});

test('match picks one case; unwrapOr and unwrap', () => {
  assert.equal(match(ok(1), { ok: v => 'v' + v, err: () => 'e' }), 'v1');
  assert.equal(match(err('x'), { ok: () => 'v', err: e => 'e' + e }), 'ex');
  assert.equal(unwrapOr(err('x'), 7), 7);
  assert.equal(unwrap(ok(5)), 5);
  assert.throws(() => unwrap(err(new Error('boom'))), /boom/);
});

test('all keeps the order and stops at the first error', () => {
  const r = all([ok(1), ok('a'), ok(true)] as const);
  assert.ok(r.ok);
  if (r.ok) {
    const [n, s, b] = r.value;
    assert.equal(n + s.length + Number(b), 3);
  }
  assert.deepEqual(all([ok(1), err('a'), err('b')]), err('a'));
  assert.deepEqual(all([]), ok([]));
});

test('fromThrowable and fromPromise turn exceptions into errors', async () => {
  assert.deepEqual(fromThrowable(() => JSON.parse('{"a":1}') as unknown, () => 'bad'), ok({ a: 1 }));
  assert.deepEqual(fromThrowable(() => JSON.parse('{') as unknown, () => 'bad'), err('bad'));
  assert.deepEqual(await fromPromise(Promise.resolve(2), () => 'no'), ok(2));
  assert.deepEqual(await fromPromise(Promise.reject(new Error('x')), e => (e as Error).message), err('x'));
});
