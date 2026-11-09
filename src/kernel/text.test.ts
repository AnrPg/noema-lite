/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textOf } from './text.ts';

test('textOf renders any value as String() does', () => {
  const cases: [unknown, string][] = [
    ['a', 'a'],
    [1.5, '1.5'],
    [true, 'true'],
    [null, 'null'],
    [undefined, 'undefined'],
    [10n, '10'],
    [[1, [2, 3]], '1,2,3'],
    [{ a: 1 }, '[object Object]'],
    [new Error('boom'), 'Error: boom'],
    [new URL('https://x.test/a'), 'https://x.test/a'],
  ];
  for (const [x, want] of cases) assert.equal(textOf(x), want);
});
