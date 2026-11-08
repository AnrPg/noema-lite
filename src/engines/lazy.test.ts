import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_PLUGINS } from './plugins.ts';
import { ENGINE_MANIFESTS } from './manifests.ts';
import { createLazyEngines, lazyPlugins, type EnginesPiece } from './lazy.ts';
import type { EngineModule } from './types.ts';
import * as contracts from '../contracts/index.ts';
import { lazyContracts } from '../contracts/lazy.ts';

const fakeModule = (id: string): EngineModule => ({ id, engine: { id, check: () => [], create: () => ({ run: () => ({ y: 1 }) }) } });
/** build/engines.js as the test sees it: every engine, its code a stand-in (the real entries import Worker bundles) */
const piece: EnginesPiece = {
  plugins: ENGINE_PLUGINS.map(p => ({
    manifest: p.manifest,
    entry: () => Promise.resolve(fakeModule(p.manifest.id)),
    worker: () => Promise.resolve('self.noemaEngine = {};'),
  })),
  schema: () => Promise.reject(new Error('no schema here')),
};

test('the manifests of the start path are the manifests of build/engines.js, in the same order', () => {
  assert.deepEqual(
    ENGINE_MANIFESTS.map(m => m.id),
    ENGINE_PLUGINS.map(p => p.manifest.id),
  );
  ENGINE_MANIFESTS.forEach((m, i) => {
    assert.deepEqual(m, ENGINE_PLUGINS[i]?.manifest, m.id);
  });
});

test('lazy engines: nothing loads until an engine is asked for, then the piece loads once', async () => {
  let n = 0;
  const L = createLazyEngines(() => {
    n++;
    return Promise.resolve(piece);
  });
  const id = ENGINE_MANIFESTS[0]?.id ?? '';
  assert.ok(L.has(id) && L.supports([`engine:${id}`]).ok);
  assert.equal(L.expr.evaluate('2 * x + 1', { x: 3 }), 7); // the expression language is in the start path
  assert.equal(n, 0);
  assert.ok((await L.load(id)).ok);
  assert.equal(L.engine(id)?.workerSource, 'self.noemaEngine = {};');
  await L.load(ENGINE_MANIFESTS[1]?.id ?? '');
  assert.equal(n, 1);
});

test('lazy engines: a failed load is tried again on the next ask', async () => {
  let n = 0;
  const plugins = lazyPlugins(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(piece)));
  const first = plugins[0];
  assert.ok(first);
  await assert.rejects(first.entry(), /offline/);
  assert.ok(await first.entry());
  assert.equal(n, 2);
});

test('lazy contracts: refuse before ready(), then answer like the module; one load', async () => {
  let n = 0;
  const C = lazyContracts(() => {
    n++;
    return Promise.resolve(contracts);
  });
  assert.equal(C.loaded, false);
  assert.throws(() => C.check('noema.pack.v3', {}), /not loaded yet/);
  await Promise.all([C.ready(), C.ready()]);
  assert.equal(n, 1);
  assert.ok(C.loaded);
  assert.deepEqual(C.check('noema.pack.v3', {}), contracts.check('noema.pack.v3', {}));
  assert.deepEqual(C.problems('nope', 1, 'x'), contracts.problems('nope', 1, 'x'));
  assert.equal(C.CONTRACT_IDS, contracts.CONTRACT_IDS);
  assert.ok(C.isContractId('noema.pack.v3'));
});

test('lazy contracts: a failed load may be tried again', async () => {
  let n = 0;
  const C = lazyContracts(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(contracts)));
  await assert.rejects(C.ready(), /offline/);
  await C.ready();
  assert.ok(C.loaded && n === 2);
});
