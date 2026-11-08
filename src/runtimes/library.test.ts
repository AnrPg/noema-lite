import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest } from '../plugins/index.ts';
import { RUNTIME_CHECKS } from './checks.ts';
import { createRuntimeLibrary, lazyRuntimePlugins, type RuntimesPiece } from './library.ts';
import { RUNTIME_DESCRIPTORS, switchedOn } from './manifests.ts';
import { RUNTIME_PLUGINS } from './plugins.ts';
import type { RuntimeHost } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('every runtime has a valid manifest of kind runtime, provides runtime:<id> and has its folder', () => {
  assert.deepEqual(
    RUNTIME_PLUGINS.map(p => p.manifest.id),
    RUNTIME_DESCRIPTORS.map(d => d.manifest.id),
  );
  for (const p of RUNTIME_PLUGINS) {
    assert.deepEqual(checkManifest(p.manifest), [], p.manifest.id);
    assert.equal(p.manifest.kind, 'runtime');
    assert.deepEqual(p.manifest.provides, ['runtime:' + p.manifest.id]);
    assert.ok(fs.existsSync(path.join(HERE, p.manifest.id.split('@')[0] ?? '')), p.manifest.id);
  }
});

test('the switch rule: on unless false; opt-in only when true', () => {
  assert.equal(switchedOn('on', undefined), true);
  assert.equal(switchedOn('on', false), false);
  assert.equal(switchedOn('opt-in', undefined), false);
  assert.equal(switchedOn('opt-in', 'yes'), false);
  assert.equal(switchedOn('opt-in', true), true);
  const lib = createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS);
  assert.equal(lib.switchOf('external-embed@1'), 'opt-in');
  assert.equal(lib.isOn('external-embed@1', {}), false);
  assert.equal(lib.isOn('external-embed@1', { 'external-embed@1': true }), true);
  assert.equal(lib.isOn('nope@1', { 'nope@1': true }), false);
  assert.equal(lib.checks, RUNTIME_CHECKS);
  assert.equal(lib.switchOf('wasm-module@1'), 'on');
  assert.equal(lib.isOn('wasm-module@1', {}), true);
  assert.equal(lib.isOn('wasm-module@1', { 'wasm-module@1': false }), false);
});

test('a runtime names the engines of sim-spec@1 it brings before its code is loaded', async () => {
  const lib = createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS);
  assert.deepEqual(lib.engines(), ['wasm@1']);
  assert.equal(lib.engineOwner('wasm@1'), 'wasm-module@1');
  assert.equal(lib.engineOwner('formula@1'), null);
  const rt = (await lib.load('wasm-module@1')).create(host({}));
  assert.ok(rt);
  assert.deepEqual(
    (rt.engines ?? []).map(e => e.id),
    ['wasm@1'],
  );
  assert.equal(rt.autoHeight, true);
  assert.equal(typeof rt.engines?.[0]?.workerSource, 'string');
});

const host = (flags: Record<string, unknown>): RuntimeHost => {
  const settings: Record<string, unknown> = {};
  return {
    t: k => k,
    message: (type, payload) => ({ p: 'noema.activity', v: 1, type, payload: payload ?? {} }),
    setting: k => settings[k],
    setSetting: (k, v) => {
      settings[k] = v;
    },
    flags: () => flags,
    warn: () => undefined,
    now: () => 1,
    check: () => ({ ok: false, why: 'not here' }),
    asset: p => 'engine/' + p,
    compute: {
      engine: () => null,
      engines: () => [],
      library: () => [],
      compile: () => () => NaN,
      content: () => null,
      parts: () => null,
    },
    items: () => ({}),
    expr: () => null,
    loadedRuntime: () => null,
    config: () => undefined,
    num: n => String(n),
    simView: () => null,
  };
};

test('a runtime loads once, on demand, and is made for its host (null when the deployment has it off)', async () => {
  let loads = 0;
  const piece: RuntimesPiece = { plugins: RUNTIME_PLUGINS };
  const lib = createRuntimeLibrary(
    lazyRuntimePlugins(() => {
      loads++;
      return Promise.resolve(piece);
    }),
    () => null,
  );
  assert.equal(lib.loaded('external-embed@1'), null);
  assert.equal(loads, 0);
  const [a, b] = await Promise.all([lib.load('external-embed@1'), lib.load('external-embed@1')]);
  assert.equal(a, b);
  assert.equal(loads, 1);
  assert.equal(lib.loaded('external-embed@1'), a);
  assert.equal(a.create(host({})), null);
  const rt = a.create(host({ 'external-embed@1': true }));
  assert.equal(rt?.id, 'external-embed@1');
  assert.deepEqual(
    ['embed-refused', 'embed-offline', 'other'].map(c => rt.failText?.(c) ?? null),
    [{ text: 'engine.act.embed.refused', restart: false }, { text: 'engine.act.embed.offline', restart: true }, null],
  );
  await assert.rejects(lib.load('nope@1'));
  assert.equal(lib.checks, null);
});

test('a failed load of the piece may be tried again', async () => {
  let n = 0;
  const lib = createRuntimeLibrary(
    lazyRuntimePlugins(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ plugins: RUNTIME_PLUGINS }))),
    () => null,
  );
  await assert.rejects(lib.load('external-embed@1'));
  assert.ok(await lib.load('external-embed@1'));
  assert.equal(n, 2);
});

test('h5p@1 is on by default, its package rules are the allow-list of tools/h5p_allow.json and refuse what is not a package', async () => {
  const lib = createRuntimeLibrary(RUNTIME_PLUGINS, () => RUNTIME_CHECKS);
  assert.equal(lib.switchOf('h5p@1'), 'on');
  assert.equal(lib.isOn('h5p@1', {}), true);
  assert.equal(lib.isOn('h5p@1', { 'h5p@1': false }), false);
  const allow = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'tools', 'h5p_allow.json'), 'utf8')) as {
    content: Record<string, { versions: string[]; tested?: boolean }>;
    libraries: unknown;
    refuse: unknown;
  };
  const H = RUNTIME_CHECKS.h5p;
  assert.deepEqual(H.ALLOW.content, Object.fromEntries(Object.entries(allow.content).map(([k, v]) => [k, v.versions])));
  assert.deepEqual(
    H.ALLOW.untested,
    Object.keys(allow.content).filter(k => !allow.content[k]?.tested),
  );
  assert.deepEqual(H.ALLOW.libraries, allow.libraries);
  assert.deepEqual(H.ALLOW.refuse, allow.refuse);
  await assert.rejects(H.unzip(new TextEncoder().encode('not a zip at all')), /not a zip file/);
  assert.deepEqual(H.check({}).errors, ['no h5p.json']);
  const rt = (await lib.load('h5p@1')).create(host({}));
  assert.equal(rt?.id, 'h5p@1');
});
