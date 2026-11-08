/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abortReason, promised } from './promise.ts';

test('promised runs at once and settles like an async function', async () => {
  let ran = false;
  const p = promised(() => {
    ran = true;
    return 1;
  });
  assert.equal(ran, true);
  assert.equal(await p, 1);
  assert.equal(await promised(() => Promise.resolve('adopted')), 'adopted');
  await assert.rejects(
    promised(() => {
      throw new Error('boom');
    }),
    /boom/,
  );
});

test('abortReason is the Error a signal was aborted with, or wraps any other reason', () => {
  const plain = new AbortController();
  plain.abort();
  assert.equal(abortReason(plain.signal), plain.signal.reason);
  assert.equal(abortReason(plain.signal).name, 'AbortError');
  const coded = new AbortController(),
    why = new Error('stopped');
  coded.abort(why);
  assert.equal(abortReason(coded.signal), why);
  const odd = new AbortController();
  odd.abort('a string');
  const e = abortReason(odd.signal);
  assert.equal(e.name, 'AbortError');
  assert.equal(e.message, 'a string');
  assert.equal(e.cause, 'a string');
});
