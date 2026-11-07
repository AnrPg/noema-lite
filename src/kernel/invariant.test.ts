/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNever, defined, invariant } from './invariant.ts';
import { NoemaError } from './errors.ts';

test('invariant throws invariant.failed with its params', () => {
  invariant(1 + 1 === 2, 'arithmetic');
  try {
    invariant(false, 'the sky is green', { colour: 'green' });
    assert.fail('no throw');
  } catch (e: unknown) {
    if (!(e instanceof NoemaError)) throw e;
    assert.equal(e.code, 'invariant.failed');
    assert.equal(e.params['colour'], 'green');
    assert.match(e.message, /sky is green/);
  }
});

test('defined and assertNever', () => {
  assert.equal(defined(0, 'zero'), 0);
  assert.throws(() => defined(null, 'the pack'), /the pack is missing/);
  assert.throws(() => assertNever('stray' as never, 'kind'), /unexpected kind: "stray"/);
});
