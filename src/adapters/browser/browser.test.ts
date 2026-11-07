/// <reference types="node" />
/** The browser adapters pass their contracts — over fakes of localStorage, IndexedDB, Worker, the DOM, and the real i18n runtime. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { clockContract } from '../../ports/contract/clock.contract.ts';
import { computeContract } from '../../ports/contract/compute.contract.ts';
import { i18nContract } from '../../ports/contract/i18n.contract.ts';
import { notifierContract } from '../../ports/contract/notifier.contract.ts';
import { storageContract } from '../../ports/contract/storage.contract.ts';
import { coreJobs, createJobRegistry, inlineCompute } from '../local/jobs.ts';
import { fakeDocument } from '../testing/fake-dom.ts';
import { fakeIndexedDB } from '../testing/fake-indexeddb.ts';
import { fakeWebStorage } from '../testing/fake-web-storage.ts';
import { fakeWorkerFactory } from '../testing/fake-worker.ts';
import { systemClock } from './clock.ts';
import { workerCompute } from './compute.ts';
import { noemaI18n, type NoemaI18nRuntime } from './i18n.ts';
import { browserNotifier, domSurface, LIVE_REGION_ID } from './notifier.ts';
import { browserStorage } from './storage.ts';

/* ---------- storage: localStorage + IndexedDB ---------- */
storageContract('browser (localStorage + IndexedDB)', o => {
  const idb = fakeIndexedDB();
  if (o.docsQuota !== undefined) idb.quota = o.docsQuota;
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = idb.KeyRange;
  const ls = fakeWebStorage(o.kvQuota ?? Infinity);
  return browserStorage({ localStorage: () => ls, indexedDB: () => idb.factory, storageManager: () => ({ estimate: async () => ({ usage: 10, quota: 100 }), persist: async () => true, persisted: async () => false }) });
});

test('browser storage without localStorage or IndexedDB: storage.unavailable, never a throw', async () => {
  const s = browserStorage({ localStorage: () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); }, indexedDB: () => undefined, storageManager: () => undefined });
  const g = s.kv.get('x');
  assert.ok(!g.ok && g.error.code === 'storage.unavailable');
  const p = await s.docs.get('packs', 'x');
  assert.ok(!p.ok && p.error.code === 'storage.unavailable');
  const e = await s.estimate();
  assert.ok(e.ok && e.value.quota === null);
});

/* ---------- clock ---------- */
clockContract('system', () => ({ clock: systemClock(), pass: ms => new Promise(r => setTimeout(r, ms)) }));

/* ---------- compute: Workers (fake, same protocol), and the fallback when none can start ---------- */
const registryOf = (jobs: Parameters<typeof createJobRegistry>[0] = {}) => createJobRegistry({ ...coreJobs(), ...jobs });
computeContract('workers', registry => workerCompute({ createWorker: fakeWorkerFactory(registry).create, fallback: inlineCompute(registry), maxWorkers: 2 }), registryOf);
computeContract('workers unavailable → inline', registry => workerCompute({ createWorker: () => { throw new Error('file:// cannot start a Worker'); }, fallback: inlineCompute(registry) }), registryOf);

test('a timed-out job stops its Worker; the pool starts a fresh one; at most maxWorkers run', async () => {
  const reg = registryOf({ 'slow': (_x, ctx) => new Promise((_r, j) => ctx.signal.addEventListener('abort', () => j(ctx.signal.reason))), 'add': (x: unknown) => (x as number) + 1 });
  const f = fakeWorkerFactory(reg);
  let unavailable = 0;
  const c = workerCompute({ createWorker: f.create, fallback: inlineCompute(reg), maxWorkers: 2, onUnavailable: () => { unavailable++; } });
  const r = await c.run('slow', null, { timeoutMs: 30 });
  assert.ok(!r.ok && r.error.code === 'compute.timeout');
  assert.equal(f.alive(), 0, 'the Worker of the timed-out job is stopped');
  const many = await Promise.all([1, 2, 3, 4].map(i => c.run<number, number>('add', i)));
  assert.deepEqual(many.map(x => (x.ok ? x.value : 0)), [2, 3, 4, 5]);
  assert.ok(f.alive() <= 2);
  assert.equal(unavailable, 0);
  c.dispose();
  assert.equal(f.alive(), 0);
});

/* ---------- i18n: the real runtime (engine/i18n.js + intl-messageformat) in a sandbox ---------- */
const ROOT = new URL('../../../', import.meta.url);
i18nContract('NoemaI18n (engine/i18n.js)', catalogs => {
  const ctx: Record<string, unknown> = { console: { warn() {}, log() {} }, Intl, Promise, Date, Map, Set, JSON, Math, String, Number, Array, Object, Error, setTimeout, clearTimeout };
  ctx['window'] = ctx;
  ctx['NOEMA_CONFIG'] = { locales: { el: 'on', 'ar-EG': 'on' } };
  ctx['NOEMA_I18N'] = Object.fromEntries(Object.entries(catalogs).map(([l, m]) => [l, { m }]));
  vm.createContext(ctx);
  for (const f of ['engine/vendor/intl-messageformat.iife.js', 'engine/i18n.js']) vm.runInContext(readFileSync(new URL(f, ROOT), 'utf8'), ctx, { filename: f });
  const rt = ctx['NoemaI18n'] as NoemaI18nRuntime & { use(l: string): Promise<string> };
  return { i18n: noemaI18n(() => rt), use: async l => { await rt.use(l); } };
});

test('the i18n adapter before the runtime is loaded: the key\'s last part, an error\'s message, English formats', () => {
  const i = noemaI18n(() => undefined);
  assert.equal(i.t('loader.storage.full'), 'full');
  assert.equal(i.err(new Error('plain words')), 'plain words');
  assert.equal(i.locale(), 'en');
  assert.equal(i.dir(), 'ltr');
  assert.equal(i.format.number(1000), '1,000');
});

/* ---------- notifier: the DOM surface over a fake document ---------- */
notifierContract('DOM toasts + live region', () => {
  const doc = fakeDocument();
  const announced: string[] = [];
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const el = create(tag);
    let text: string | null = '';
    Object.defineProperty(el, 'textContent', { get: () => text, set: (v: string | null) => { text = v; if (el.id === LIVE_REGION_ID && v) announced.push(v); } });
    return el;
  };
  const short = { setTimeout: (f: () => void, ms: number) => (ms <= 100 ? setTimeout(f, ms) : 0), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  let t = 1_000_000;
  return {
    notifier: browserNotifier(domSurface(() => doc, short), { now: () => t }),
    onScreen: () => doc.toasts().filter(x => x.isConnected).map(x => x.textContent ?? ''),
    announced: () => announced,
    settle: () => new Promise(r => setTimeout(r, 80)),
    advance: ms => { t += ms; },
  };
});

test('the DOM surface: one .toasts box, notices with role=status, a hidden assertive live region', async () => {
  const doc = fakeDocument();
  const n = browserNotifier(domSurface(() => doc, { setTimeout: (f, ms) => (ms <= 100 ? setTimeout(f, ms) : 0), clearTimeout: () => {} }));
  n.toast('a');
  n.notice('b');
  n.alert('c');
  await new Promise(r => setTimeout(r, 80));
  const boxes = doc.bodyEl.all().filter(e => e.className === 'toasts');
  assert.equal(boxes.length, 1);
  const notice = doc.toasts().find(e => e.textContent === 'b');
  assert.equal(notice?.attrs.get('role'), 'status');
  const live = doc.getElementById(LIVE_REGION_ID) as unknown as { attrs: Map<string, string>; style: { cssText: string }; textContent: string };
  assert.equal(live.attrs.get('role'), 'alert');
  assert.equal(live.attrs.get('aria-live'), 'assertive');
  assert.match(live.style.cssText, /clip/);
  assert.equal(live.textContent, 'c');
  const none = browserNotifier(domSurface(() => undefined));
  none.toast('nowhere to draw: nothing happens, nothing throws');
});
