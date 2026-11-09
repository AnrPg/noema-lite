import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runLegacy } from './legacy.ts';

test('a script publishes on window; the next one reads it by name; nothing leaks into the real global', () => {
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  const s = runLegacy(
    [
      { path: 'a.js', text: 'window.NoemaA = { twice: x => 2 * x }; globalThis.NoemaFlag = true; self.NoemaSelf = 1;' },
      {
        path: 'b.js',
        text: "'use strict'; window.NoemaB = { four: NoemaA.twice(2), flag: typeof NoemaFlag, json: JSON.stringify([1]), t: typeof setTimeout };",
      },
    ],
    { NoemaGiven: 7 },
  );
  assert.deepEqual(s.NoemaB, { four: 4, flag: 'boolean', json: '[1]', t: 'function' });
  assert.equal(s.NoemaSelf, 1);
  assert.equal(s.NoemaGiven, 7);
  assert.deepEqual(
    Object.getOwnPropertyNames(globalThis).filter(k => !before.has(k)),
    [],
  );
});

test('runtime functions called through window keep their own this', () => {
  const s = runLegacy([{ path: 'c.js', text: 'window.NoemaC = window.encodeURIComponent("a b") + typeof window.queueMicrotask;' }]);
  assert.equal(s.NoemaC, 'a%20bfunction');
});

test('a file that does not compile names itself', () => {
  assert.throws(() => runLegacy([{ path: 'engine/broken.js', text: 'window.x = (;' }]), /engine\/broken\.js/);
});
