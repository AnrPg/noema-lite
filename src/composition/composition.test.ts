/// <reference types="node" />
/**
 * The composition roots: the container's rules, the bridge's surface over memory adapters, the browser root wired with
 * fakes (storage-full → the learner's alert), and the built engine/core.js loading in a bare vm and in a page-like one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NoemaError } from '../kernel/errors.ts';
import { manualClock } from '../adapters/memory/clock.ts';
import { fakeWebStorage } from '../adapters/testing/fake-web-storage.ts';
import { fakeDocument } from '../adapters/testing/fake-dom.ts';
import { Container, token } from './container.ts';
import { buildBridge } from './bridge.ts';
import { createToolsContainer } from './tools.ts';
import { createConnectorContainer } from './connector.ts';
import { createAppContainer, workerFactory, WORKER_SOURCE_ID } from './browser.ts';
import { AI, CLOUD, COMPUTE, ERRORS, NOTIFIER, STORAGE } from './tokens.ts';
import { browserStorage } from '../adapters/browser/storage.ts';
import { browserNotifier, domSurface } from '../adapters/browser/notifier.ts';

const codeOf = (f: () => unknown): string => {
  try { f(); } catch (e: unknown) { if (e instanceof NoemaError) return e.code; throw e; }
  return 'none';
};

test('container: lazy singletons, typed tokens, unknown / twice / cycle / frozen', () => {
  const A = token<number>('a'), B = token<string>('b'), X = token<number>('x'), Y = token<number>('y');
  let made = 0;
  const c = new Container().register(A, () => ++made).register(B, r => 'b' + r.get(A));
  assert.equal(made, 0);
  assert.equal(c.get(B), 'b1');
  assert.equal(c.get(A), 1);
  assert.equal(made, 1);
  assert.equal(codeOf(() => c.get(token('none'))), 'container.unknown');
  assert.equal(codeOf(() => c.register(A, () => 2)), 'invariant.failed');
  c.register(A, () => 5, { replace: true });
  assert.equal(c.get(A), 5);
  c.register(X, r => r.get(Y)).register(Y, r => r.get(X));
  assert.equal(codeOf(() => c.get(X)), 'container.cycle');
  assert.deepEqual(c.keys(), ['a', 'b', 'x', 'y']);
  c.freeze();
  assert.ok(c.frozen);
  assert.equal(codeOf(() => c.value(token('z'), 1)), 'container.frozen');
  assert.equal(createConnectorContainer().keys().length, 0);
  assert.ok(createConnectorContainer([k => k.value(A, 3)]).get(A) === 3);
});

test('bridge: days, clock, storage, notify, compute, errors, extensions', async () => {
  const clock = manualClock(new Date(2026, 2, 29, 10), 'Europe/Athens');
  const c = createToolsContainer({ clock, catalogs: { en: { hi: 'Hello {who}' } } });
  const core = buildBridge(c, [{ name: 'extra', build: () => 42 }]);
  assert.equal(core.version, 1);
  assert.equal(core.clock.today(), core.day.of(clock.now()));
  assert.equal(core.day.of(), core.clock.today());
  assert.equal(core.day.add('2026-03-28', 2), '2026-03-30');
  assert.equal(core.day.between('2026-03-01', '2026-04-01'), 31);
  assert.equal(core.day.weekStart('2026-11-07'), '2026-11-02');
  assert.equal(core.day.weekStart('2026-11-07', 0), '2026-11-01');
  assert.equal(core.day.compare('2026-01-02', '2026-01-01'), 1);
  assert.equal(core.day.is('2026-02-30'), false);
  assert.equal(codeOf(() => core.day.add('yesterday', 1)), 'day.invalid');
  assert.equal(core.storage.kv.set('k', 'v'), true);
  assert.equal(core.storage.kv.get('k'), 'v');
  assert.deepEqual(core.storage.kv.keys('k'), ['k']);
  core.storage.kv.delete('k');
  assert.equal(core.storage.kv.get('k'), null);
  assert.equal(core.i18n.t('hi', { who: 'Ann' }), 'Hello Ann');
  assert.deepEqual(await core.compute.run('core.ping', 7), { pong: 7 });
  await assert.rejects(core.compute.run('nope', 1), (e: unknown) => e instanceof NoemaError && e.code === 'compute.unknown_job');
  core.errors.report(new NoemaError('cloud.network', 'offline'), { where: 'test', severity: 'warning' });
  assert.equal(core.errors.journal().at(-1)?.code, 'cloud.network');
  assert.equal(core['extra'], 42);
  assert.ok(Object.isFrozen(core) && Object.isFrozen(core.day) && Object.isFrozen(core.storage.kv));
  assert.equal(codeOf(() => buildBridge(c, [{ name: 'day', build: () => 1 }])), 'invariant.failed');
});

test('bridge: a storage that fails is false/null and journaled once per code', () => {
  const ls = fakeWebStorage();
  ls.setItem = () => { throw new Error('SecurityError'); };
  const c = createToolsContainer({}, [k => k.register(STORAGE, () => browserStorage({ localStorage: () => ls }), { replace: true })]);
  const core = buildBridge(c);
  assert.equal(core.storage.kv.set('a', '1'), false);
  assert.equal(core.storage.kv.set('b', '1'), false);
  assert.equal(core.errors.journal().filter(e => e.where === 'storage.kv.set').length, 1);
});

test('browser root: a full storage alerts the learner once a minute in the live region; cloud and AI from config', () => {
  const doc = fakeDocument();
  const ls = fakeWebStorage(40);
  const page = { NOEMA_CONFIG: { supabaseUrl: 'https://p.supabase.test', supabaseKey: 'sb_publishable_x' }, fetch: globalThis.fetch };
  const timers = { setTimeout: (f: () => void, ms: number) => { if (ms <= 50) f(); return 0; }, clearTimeout: () => {} }; // the live region's 50 ms, not the toasts' end
  const c = createAppContainer(page, null, [
    k => k.register(STORAGE, () => browserStorage({ localStorage: () => ls }), { replace: true }),
    k => k.register(NOTIFIER, () => browserNotifier(domSurface(() => doc, timers)), { replace: true }),
  ]);
  const core = buildBridge(c);
  assert.equal(core.storage.kv.set('big', 'x'.repeat(100)), false);
  assert.equal(core.storage.kv.set('big2', 'x'.repeat(100)), false);
  const alerts = doc.toasts().filter(t => t.className.includes('alert'));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0]?.textContent ?? '', /^⚠️ /);
  assert.equal(doc.getElementById('noema-alert')?.textContent, alerts[0]?.textContent);
  assert.equal(c.get(ERRORS).journal().filter(e => e.code === 'storage.quota').length, 2);
  assert.ok(c.get(CLOUD) !== null);
  assert.equal(c.get(AI)('gemini', 'k').provider, 'gemini');
  assert.equal(createAppContainer({}, null).get(CLOUD), null);
  assert.equal(codeOf(() => c.register(token('late'), () => 1)), 'container.frozen');
  assert.ok(c.get(COMPUTE));
});

test('browser root: the Worker comes from the bundle\'s inline copy, else next to core.js, never on file://', () => {
  const made: string[] = [];
  class W { onmessage = null; onerror = null; constructor(u: string) { made.push(u); } postMessage(): void {} terminate(): void {} }
  const blobs = { createObjectURL: () => 'blob:core-worker' };
  const withInline = { Worker: W, Blob, URL: blobs, document: { getElementById: (id: string) => (id === WORKER_SOURCE_ID ? { textContent: 'self.x=1' } : null) } };
  workerFactory(withInline, null)();
  workerFactory({ Worker: W, document: { getElementById: () => null }, location: { protocol: 'https:' } }, 'https://x/engine/core-worker.js')();
  assert.deepEqual(made, ['blob:core-worker', 'https://x/engine/core-worker.js']);
  assert.equal(codeOf(() => workerFactory({ Worker: W, location: { protocol: 'file:' } }, 'file:///engine/core-worker.js')()), 'compute.unavailable');
  assert.equal(codeOf(() => workerFactory({}, null)()), 'compute.unavailable');
});

const built = new URL('../../engine/core.js', import.meta.url);
test('engine/core.js: starts in a bare vm and in a page, publishes a read-only NoemaCore once', { skip: !existsSync(built) && 'engine/core.js is not built' }, () => {
  const src = readFileSync(built, 'utf8');
  const bare = vm.createContext({});
  vm.runInContext(src, bare);
  const core = vm.runInContext('NoemaCore', bare) as { day: { add(d: string, n: number): string }; clock: { today(): string }; storage: { kv: { set(k: string, v: string): boolean } } };
  assert.equal(core.day.add('2026-10-24', 2), '2026-10-26');
  assert.match(core.clock.today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(core.storage.kv.set('k', 'v'), false); // no localStorage: false, not an exception
  vm.runInContext(src, bare);
  assert.equal(vm.runInContext('NoemaCore', bare), core);
  assert.equal(vm.runInContext('"use strict"; try { NoemaCore = 1; "written" } catch (e) { "refused" }', bare), 'refused');
  const page = vm.createContext({ localStorage: fakeWebStorage(), document: { currentScript: { src: 'https://x/engine/core.js?v=1' }, getElementById: () => null } });
  vm.runInContext(src, page);
  assert.equal(vm.runInContext('NoemaCore.storage.kv.set("k", "v") && localStorage.getItem("k")', page), 'v');
});
