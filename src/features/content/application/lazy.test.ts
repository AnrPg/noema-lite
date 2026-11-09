import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_ENGINES, createContentChecks } from './index.ts';
import { lazyContentChecks } from './lazy.ts';

const real = createContentChecks(NO_ENGINES);

test('lazy content checks: refuse before ready(), then answer like the checks; one load, a failed one tried again', async () => {
  let n = 0;
  const C = lazyContentChecks(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(real)));
  assert.equal(C.loaded, false);
  assert.throws(() => C.checkPack({}), /not loaded yet/);
  await assert.rejects(C.ready(), /offline/);
  await Promise.all([C.ready(), C.ready()]);
  assert.equal(n, 2);
  assert.ok(C.loaded);
  assert.equal(C.checkTranslation, real.checkTranslation);
  assert.equal(C.TYPES, real.TYPES);
  assert.deepEqual(
    Object.keys(C)
      .filter(k => k !== 'ready' && k !== 'loaded')
      .sort(),
    Object.keys(real).sort(),
    'every name of the checks',
  );
});
