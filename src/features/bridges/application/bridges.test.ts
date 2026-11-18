/* The 文A bridges' use cases over memory ports: settings and the native language (a:settings.native, D19), the learner's
   words, the bridges offered, loading (this device's copy, the cloud when the version moved — the signed-in account's only —,
   the library; a revised index entry read again, a miss never kept), attaching (checked, kept, then indexed; refused ones;
   nothing listed when it could not be kept), detaching and the reports. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bridge } from '../domain/help.ts';
import { summary } from '../domain/help.ts';
import { createBridgeService, type BridgePorts, type SubjectRow } from './bridges.ts';

/** the version the index keeps of a bridge (the fakes' hash: the length) */
const summaryV = (b: Bridge): string => summary(b, x => String(x.length), 0).v;

function fakes(
  o: {
    /** the account signed in to the cloud (its folder is that account's) */
    signedIn?: string;
    errors?: string[];
    subjects?: SubjectRow[];
    cloud?: Record<string, unknown>;
    failPut?: boolean;
    failUpload?: boolean;
    library?: boolean;
  } = {},
) {
  const kv = new Map<string, unknown>(),
    cache = new Map<string, Bridge>(),
    uploads: string[] = [],
    downloads: string[] = [],
    rows: string[] = [],
    library: string[] = [];
  let now = 1000;
  const ports: BridgePorts = {
    account: acc => acc ?? 'u1',
    uiLocale: () => 'de-AT',
    read: (acc, name) => kv.get(`${String(acc)}:${name}`) ?? null,
    write: (acc, name, v) => kv.set(`${String(acc)}:${name}`, JSON.parse(JSON.stringify(v)) as unknown),
    putSettings: (acc, patch) => {
      const cur = (kv.get(`${String(acc)}:settings`) ?? {}) as Record<string, unknown>;
      kv.set(`${String(acc)}:settings`, { ...cur, ...patch });
    },
    registry: id => (id === 'lib' ? { language: 'en', bridgeLocales: { ru: { v: 'r', status: 'reviewed', path: 'bridge.ru.js' } } } : null),
    cache: {
      get: k => Promise.resolve(cache.get(k) ?? null),
      put: (k, b) => {
        if (o.failPut) return Promise.reject(new Error('QuotaExceededError'));
        cache.set(k, b);
        return Promise.resolve();
      },
      del: k => {
        cache.delete(k);
        return Promise.resolve();
      },
    },
    cloud: {
      isAccount: acc => !!o.signedIn && acc === o.signedIn,
      download: path => {
        downloads.push(path);
        return Promise.resolve(o.cloud?.[path] ?? null);
      },
      upload: path => {
        if (o.failUpload) return Promise.reject(new Error('503'));
        uploads.push(path);
        return Promise.resolve();
      },
      putRow: (_a, pack, pair) => rows.push(`+${pack}.${pair}`),
      deleteRow: (_a, pack, pair) => rows.push(`-${pack}.${pair}`),
    },
    library: (pack, nat, path) => {
      library.push(path);
      return Promise.resolve(o.library === false ? null : { pack, native: nat, entries: [{ k: 'lib' }] });
    },
    subjects: () => Promise.resolve(o.subjects ?? [{ id: 'p1', title: 'Physics', language: 'en' }]),
    loadSubject: () => Promise.resolve({ subject: { language: 'en' } }),
    check: () => ({ errors: o.errors ?? [] }),
    hash: s => String(s.length),
    now: () => now++,
  };
  return { ports, kv, cache, uploads, downloads, rows, library, s: createBridgeService(ports) };
}
const bridge = (x: Partial<Bridge> = {}): Bridge => ({
  format: 'noema-bridge',
  pack: 'p1',
  source: 'en',
  native: 'ru',
  status: 'draft',
  entries: [{ k: 'a' }],
  ...x,
});

test('settings and the native language: a:settings.bridge and a:settings.native, else the interface language', () => {
  const { s, kv } = fakes();
  assert.equal(s.native(), null);
  assert.equal(s.nativeOrUi(), 'de');
  s.setNative(null, 'ru-RU');
  assert.equal(s.native(), 'ru');
  assert.deepEqual(kv.get('u1:settings'), { native: { code: 'ru-RU' } }, 'the language course’s field, as it is (D19)');
  assert.equal(s.setSettings(null, { level: 'tap' }).level, 'tap');
  assert.equal(s.settings().level, 'tap');
});

test('the learner’s words: per source language, merged', () => {
  const { s } = fakes();
  s.touchWord(null, 'en-GB', 'snapshot', { look: n => (n ?? 0) + 1 });
  s.touchWord(null, 'en', 'snapshot', { known: 7 });
  assert.deepEqual(Object.keys(s.words(null, 'en')), ['snapshot']);
  assert.equal(s.words(null, 'en')['snapshot']?.look, 1);
  assert.equal(s.words(null, 'en')['snapshot']?.known, 7);
  assert.deepEqual(s.words(null, 'el'), {});
});

test('attach: checked, kept on this device and in the cloud, indexed; offered after; detached again', async () => {
  const { s, cache, uploads, rows, kv } = fakes({ signedIn: 'u1' });
  const r = await s.attach(null, bridge());
  assert.ok(r.ok);
  assert.deepEqual(r.value, { pack: 'p1', native: 'ru', source: 'en', title: 'Physics' });
  assert.ok(cache.has('u1|p1|ru'));
  assert.deepEqual(uploads, ['bridges/p1.ru.json']);
  assert.deepEqual(rows, ['+p1.ru']);
  assert.deepEqual(Object.keys(s.available(null, 'p1', { id: 'p1', language: 'en' }, 'en', 'en')), ['ru']);
  assert.equal((await s.load(null, 'p1', 'ru', 'en', 'en'))?.native, 'ru');
  await s.detach(null, 'p1', 'ru', 'en', 'en');
  assert.deepEqual(kv.get('u1:bridges'), {});
  assert.ok(!cache.has('u1|p1|ru'));
  assert.deepEqual(rows, ['+p1.ru', '-p1.ru']);
});

test('attach refuses a bridge that fails its checks, and one for a pack the account does not have', async () => {
  const bad = await fakes({ errors: ['a function word', 'markup'] }).s.attach(null, bridge());
  assert.ok(!bad.ok);
  assert.deepEqual(bad.error, { code: 'bridge.invalid', detail: 'a function word · markup' });
  const none = await fakes({ subjects: [] }).s.attach(null, bridge());
  assert.ok(!none.ok);
  assert.deepEqual(none.error, { code: 'bridge.no_pack', id: 'p1' });
});

test('load: the library’s bridge when the account has none; the cloud’s when this device’s copy is out of date', async () => {
  const f = fakes();
  assert.deepEqual((await f.s.load(null, 'lib', 'ru'))?.entries, [{ k: 'lib' }]);
  assert.deepEqual(f.library, ['bridge.ru.js']);
  await f.s.load(null, 'lib', 'ru');
  assert.equal(f.library.length, 1, 'kept in memory');
  const fresh = bridge({ entries: [{ k: 'fresh' }] });
  const g = fakes({ signedIn: 'u1', cloud: { 'bridges/p1.ru.json': fresh } });
  g.kv.set('u1:bridges', { p1: { ru: { v: 'not-this', status: 'draft' } } });
  g.cache.set('u1|p1|ru', bridge());
  assert.deepEqual((await g.s.load(null, 'p1', 'ru'))?.entries, [{ k: 'fresh' }]);
  assert.deepEqual(g.cache.get('u1|p1|ru')?.entries, [{ k: 'fresh' }]);
});

test('reports: kept with their time, the last 200', () => {
  const { s, kv } = fakes();
  for (let i = 0; i < 205; i++) s.report(null, { k: 'w' + String(i) });
  const all = kv.get('u1:bridgeReports') as { k: string; at: string }[];
  assert.equal(all.length, 200);
  assert.equal(all[0]?.k, 'w5');
  assert.match(all[0].at, /^1970-01-01T/);
});

test('another profile on this device never reads the signed-in account’s cloud folder', async () => {
  const g = fakes({ signedIn: 'u_cloud', cloud: { 'bridges/p1.ru.json': bridge({ entries: [{ k: 'theirs' }] }) } });
  g.kv.set('u1:bridges', { p1: { ru: { v: 'gone', status: 'draft' } } }); // listed, its copy missing from this device
  assert.equal(await g.s.load('u1', 'p1', 'ru'), null);
  assert.deepEqual(g.downloads, []);
  assert.equal(g.cache.size, 0, 'nothing kept under the profile’s key');
});

test('load: a bridge revised in the index is read again; a miss is not kept', async () => {
  const g = fakes({ signedIn: 'u1', cloud: { 'bridges/p1.ru.json': bridge({ entries: [{ k: 'v2' }] }) } });
  g.cache.set('u1|p1|ru', bridge({ entries: [{ k: 'v1' }] }));
  const v1 = summaryV(bridge({ entries: [{ k: 'v1' }] }));
  g.kv.set('u1:bridges', { p1: { ru: { v: v1, status: 'draft' } } });
  assert.deepEqual((await g.s.load(null, 'p1', 'ru'))?.entries, [{ k: 'v1' }]);
  assert.deepEqual(g.downloads, [], 'this device’s copy is current');
  // the connector saved a new version: the synced index says so
  g.kv.set('u1:bridges', { p1: { ru: { v: 'v2-stamp', status: 'draft' } } });
  assert.deepEqual((await g.s.load(null, 'p1', 'ru'))?.entries, [{ k: 'v2' }]);
  assert.deepEqual(g.downloads, ['bridges/p1.ru.json']);
  const miss = fakes({ library: false });
  assert.equal(await miss.s.load(null, 'lib', 'ru'), null);
  assert.equal(await miss.s.load(null, 'lib', 'ru'), null);
  assert.equal(miss.library.length, 2, 'a failed load is tried again');
});

test('attach lists nothing when the bridge could not be kept: the cloud upload fails, or a local profile’s device copy', async () => {
  const up = fakes({ signedIn: 'u1', failUpload: true });
  const r1 = await up.s.attach(null, bridge());
  assert.ok(!r1.ok);
  assert.equal(r1.error.code, 'bridge.not_saved');
  assert.deepEqual(up.kv.get('u1:bridges') ?? null, null, 'no index entry');
  assert.deepEqual(up.rows, [], 'no noema_bridges row');
  const dev = fakes({ failPut: true });
  const r2 = await dev.s.attach(null, bridge());
  assert.ok(!r2.ok && r2.error.code === 'bridge.not_saved');
  assert.equal(r2.error.where, 'device');
  assert.equal(dev.kv.get('u1:bridges') ?? null, null);
  // a signed-in account whose device copy fails: the cloud keeps it, so it is listed
  const both = fakes({ signedIn: 'u1', failPut: true });
  assert.ok((await both.s.attach(null, bridge())).ok);
  assert.deepEqual(both.rows, ['+p1.ru']);
});
