import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest } from '../plugins/index.ts';
import { ENGINE_PLUGINS, EXPR } from './plugins.ts';
import { createEngineLibrary } from './library.ts';
import NoemaEngineCatalog from './catalog.ts';
import type { EngineModule, EnginePlugin, SchemaApi } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ids = ENGINE_PLUGINS.map(p => p.manifest.id);

test('every engine plugin has a valid manifest: engine:<id>, the expression language, no strings of its own', () => {
  assert.equal(ids.length, 26);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of ENGINE_PLUGINS) {
    assert.deepEqual(checkManifest(p.manifest), [], p.manifest.id);
    assert.equal(p.manifest.kind, 'engine');
    assert.deepEqual(p.manifest.provides, ['engine:' + p.manifest.id]);
    assert.ok(p.manifest.needs.includes(EXPR));
    assert.deepEqual(p.manifest.locales, []);
  }
});

test("the plugins are the catalogue's engine plugins, in its order, each with its module file", () => {
  const cat = NoemaEngineCatalog.CATALOG.filter(e => e.plugin);
  assert.deepEqual(
    cat.map(e => e.id),
    ids,
  );
  for (const e of cat) assert.ok(fs.existsSync(path.join(HERE, '..', '..', e.file)), e.file);
  assert.deepEqual(
    [...NoemaEngineCatalog.LIBRARY],
    cat.filter(e => e.layer === 'library').map(e => e.id),
  );
});

test('every plugin entry is an import() of its module and a noema-worker: bundle of it; node.ts holds exactly the same', () => {
  const src = fs.readFileSync(path.join(HERE, 'plugins.ts'), 'utf8'),
    node = fs.readFileSync(path.join(HERE, 'node.ts'), 'utf8');
  for (const e of NoemaEngineCatalog.CATALOG.filter(x => x.plugin)) {
    const mod = './' + path.relative('src/engines', e.file).split(path.sep).join('/');
    const re = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(src, new RegExp(`\\(\\) => import\\('${re(mod)}'\\),\\s*\\(\\) => import\\('noema-worker:${re(mod)}#`), e.id); // (in any layout)
    assert.ok(node.includes(`from '${mod}';`) && node.includes(`from 'noema-worker:${mod}#`) && node.includes(`'${e.id}': [`), e.id);
  }
  assert.equal((node.match(/^ {2}'[a-z-]+@1': \[m\d+, w\d+\],$/gm) || []).length, ids.length);
});

const fakeModule = (id: string): EngineModule => ({ id, engine: { id, check: () => [], create: () => ({ run: () => ({ y: 1 }) }) } });
const fakePlugins = (n: { entry: number; worker: number }): EnginePlugin[] =>
  ENGINE_PLUGINS.slice(0, 3).map(p => ({
    manifest: p.manifest,
    entry: () => {
      n.entry++;
      return Promise.resolve(fakeModule(p.manifest.id));
    },
    worker: () => {
      n.worker++;
      return Promise.resolve('self.noemaEngine = {};');
    },
  }));
const noSchema = (): Promise<SchemaApi> => Promise.reject(new Error('no schema here'));

test('the library loads an engine on demand, once, with its Worker bundle; unknown ids are reported, never thrown', async () => {
  const n = { entry: 0, worker: 0 },
    L = createEngineLibrary({ plugins: fakePlugins(n), schema: noSchema });
  const a = ids[0] as string,
    b = ids[1] as string;
  assert.deepEqual(L.ids(), ids.slice(0, 3));
  assert.equal(L.loaded(a), null);
  assert.equal(L.engine(a), null);
  const r = await L.load([a, a, 'formula@1']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.loaded, [a]);
  assert.deepEqual(r.failed, [{ id: 'formula@1', code: 'unknown-plugin' }]);
  await L.load(a);
  assert.deepEqual(n, { entry: 1, worker: 1 });
  const E = L.engine(a);
  assert.ok(E && E.id === a && E.workerSource === 'self.noemaEngine = {};' && Object.isFrozen(E));
  assert.equal(L.loaded(a)?.engine, E);
  assert.equal(L.loaded(b), null); // only what was asked
  assert.ok(L.has(b) && !L.has('formula@1'));
});

test('supports: the engine entries of pack.requires (the rest belongs to the activity core)', () => {
  const L = createEngineLibrary({ plugins: ENGINE_PLUGINS, schema: noSchema });
  assert.deepEqual(L.supports(['activities/v1', 'runtime:sim-spec@1', 'engine:prob@1', 'engine:circuit-mna@1']), { ok: true, missing: [] });
  assert.deepEqual(L.supports(['engine:prob@1', 'engine:wasm@1']).missing, ['engine:wasm@1']);
});

test('adopt: a module in hand needs no load; the expression language and the catalogue are there at once', async () => {
  const n = { entry: 0, worker: 0 },
    L = createEngineLibrary({ plugins: fakePlugins(n), schema: noSchema });
  const a = ids[0] as string;
  assert.ok(L.adopt(a, fakeModule(a), 'W'));
  assert.ok(!L.adopt('nope@1', fakeModule('nope@1'), 'W'));
  assert.equal(L.engine(a)?.workerSource, 'W');
  await L.load(a);
  assert.deepEqual(n, { entry: 0, worker: 0 });
  assert.equal(L.expr.evaluate('2 * x + 1', { x: 3 }), 7);
  assert.ok(L.catalog.suggest('a predator and prey population').some(s => s.id === 'ode@1'));
  await assert.rejects(L.loadSchema(), /no schema here/);
  assert.equal(L.schema(), null);
});
