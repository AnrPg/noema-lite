import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkManifest, createPluginRegistry, type Plugin, type PluginManifest } from './index.ts';

const man = (id: `${string}@${number}`, extra: Partial<PluginManifest> = {}): PluginManifest =>
  ({ id, kind: 'engine', version: id.split('@')[1] + '.0.0', needs: [], provides: ['engine:' + id], locales: [], ...extra });
const plug = <T>(m: PluginManifest, value: T, calls: { n: number } = { n: 0 }): Plugin<T> => ({ manifest: m, entry: () => { calls.n++; return Promise.resolve(value); } });

test('a manifest: id name@N, a known kind, a semver whose major is N, capabilities and locales well formed', () => {
  assert.deepEqual(checkManifest(man('prob@1')), []);
  assert.deepEqual(checkManifest(man('Prob@1')).map(p => p.code), ['id', 'capability']);   // (its provides, engine:Prob@1, too)
  assert.deepEqual(checkManifest(man('prob@1', { version: '2.0.0' })).map(p => p.code), ['version']);
  assert.deepEqual(checkManifest(man('prob@1', { version: '1.0' })).map(p => p.code), ['version']);
  assert.deepEqual(checkManifest({ ...man('prob@1'), kind: 'gadget' as 'engine' }).map(p => p.code), ['kind']);
  assert.deepEqual(checkManifest(man('prob@1', { needs: ['Bad Cap'], provides: ['engine:prob@1', 'engine:prob@1'] })).map(p => p.code), ['capability', 'duplicate']);
  assert.deepEqual(checkManifest(man('hedge@1', { kind: 'mascot', locales: ['en', 'zh-Hans', 'EN_us'] })).map(p => p.path), ['locales[2]']);
});

test('register: a bad manifest and a second plugin with the same id are refused; manifests are frozen copies', () => {
  const R = createPluginRegistry<string>();
  const bad = R.register(plug(man('x@0'), 'x'));
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.error.code, 'invalid-manifest');
  const m = man('a@1'), r = R.register(plug(m, 'A'));
  assert.ok(r.ok && Object.isFrozen(r.value) && Object.isFrozen(r.value.needs) && r.value !== m);
  const again = R.register(plug(man('a@1'), 'A2'));
  assert.equal(!again.ok && again.error.code, 'duplicate');
  assert.deepEqual(R.manifests().map(x => x.id), ['a@1']);
  assert.deepEqual(R.manifests('theme'), []);
});

test('load on demand, once: concurrent loads share one entry call; later ones get the same value', async () => {
  const R = createPluginRegistry<{ v: number }>(), calls = { n: 0 }, value = { v: 1 };
  R.register(plug(man('a@1'), value, calls));
  assert.equal(R.state('a@1'), 'registered');
  assert.equal(R.loaded('a@1'), null);
  const [x, y] = await Promise.all([R.load('a@1'), R.load('a@1')]);
  const z = await R.load('a@1');
  assert.ok(x.ok && y.ok && z.ok && x.value === value && y.value === value && z.value === value);
  assert.equal(calls.n, 1);
  assert.equal(R.state('a@1'), 'loaded');
  assert.equal(R.loaded('a@1'), value);
});

test('capabilities: a plugin whose needs nobody provides is not loaded (missing-capability, its entry never called)', async () => {
  const calls = { n: 0 }, R = createPluginRegistry<string>({ host: ['kernel:expr'] });
  R.register(plug(man('clinic@1', { needs: ['kernel:expr', 'engine:med@1'] }), 'C', calls));
  assert.deepEqual(R.missingFor('clinic@1'), ['engine:med@1']);
  const r = await R.load('clinic@1');
  assert.ok(!r.ok && r.error.code === 'missing-capability' && r.error.missing?.join() === 'engine:med@1');
  assert.equal(calls.n, 0);
  R.register(plug(man('med@1', { needs: ['kernel:expr'] }), 'M'));   // med@1 joins: clinic@1 can be loaded (med itself need not be loaded)
  assert.deepEqual(R.missingFor('clinic@1'), []);
  const r2 = await R.load('clinic@1');
  assert.ok(r2.ok && r2.value === 'C' && calls.n === 1);
});

test('supports(requires): the query of the pack checker — what the host and the plugins provide, loaded or not', () => {
  const R = createPluginRegistry<string>({ host: ['activities/v1', 'runtime:sim-spec@1'] });
  R.register(plug(man('prob@1'), 'P'));
  assert.deepEqual(R.supports(['activities/v1', 'runtime:sim-spec@1', 'engine:prob@1']), { ok: true, missing: [] });
  assert.deepEqual(R.supports(['engine:prob@1', 'engine:quantum@1', 'runtime:vr@1']), { ok: false, missing: ['engine:quantum@1', 'runtime:vr@1'] });
  assert.ok(R.provided().has('engine:prob@1') && R.provided().has('activities/v1'));
});

test('a failed load is reported (load-failed, the cause) and may be tried again', async () => {
  let fails = 1;
  const R = createPluginRegistry<string>();
  R.register({ manifest: man('a@1'), entry: () => (fails-- > 0 ? Promise.reject(new Error('chunk lost')) : Promise.resolve('A')) });
  const r = await R.load('a@1');
  assert.ok(!r.ok && r.error.code === 'load-failed' && r.error.cause === 'chunk lost');
  assert.equal(R.state('a@1'), 'failed');
  const r2 = await R.load('a@1');
  assert.ok(r2.ok && r2.value === 'A' && R.state('a@1') === 'loaded');
  const u = await R.load('nope@1');
  assert.ok(!u.ok && u.error.code === 'unknown-plugin');
});

test('adopt: code already in hand is loaded at once, its entry never runs; onLoad tells each listener once per plugin', async () => {
  const calls = { n: 0 }, seen: string[] = [], R = createPluginRegistry<string>();
  R.register(plug(man('a@1'), 'from-entry', calls));
  R.register(plug(man('b@1'), 'B'));
  const off = R.onLoad((id, v) => seen.push(id + '=' + v));
  assert.ok(R.adopt('a@1', 'in-hand').ok);
  const again = await R.load('a@1');
  assert.ok(again.ok && again.value === 'in-hand' && calls.n === 0);
  await R.load('b@1');
  off();
  R.adopt('b@1', 'ignored');
  assert.deepEqual(seen, ['a@1=in-hand', 'b@1=B']);
  assert.ok(!R.adopt('zzz@1', 'x').ok);
});
