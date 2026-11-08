import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountKv, type DeviceKv } from './kv.ts';
import { OLD_FORMATS, oldData } from './migrate.ts';

function mapKv(): DeviceKv & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: k => map.get(k) ?? null,
    set: (k, v) => (map.set(k, String(v)), true),
    delete: k => {
      map.delete(k);
    },
    keys: (p = '') => [...map.keys()].filter(k => k.startsWith(p)),
  };
}
function setup(o: { hasProgress?: boolean } = {}) {
  const kv = mapKv(),
    KV = new AccountKv(
      kv,
      () => 1,
      () => undefined,
    ),
    rows = new Map<string, unknown>();
  let carried = 0;
  const m = oldData({
    kv,
    KV,
    idb: {
      get: <T>(store: string, key: string) => Promise.resolve(rows.get(store + '/' + key) as T | undefined),
      put: (store, key, v) => {
        rows.set(store + '/' + key, v);
        return Promise.resolve();
      },
    },
    indexedDB: () => undefined,
    convoSchema: () => 'noema.conversation/v1',
    learning: { account: () => 'anr', hasProgress: () => !!o.hasProgress },
    carried: () => {
      carried++;
    },
    warn: () => undefined,
  });
  return { kv, m, carried: () => carried };
}

test('the old prefix (lq1:) is copied once, only onto a device with no keys of its own; nothing is deleted', () => {
  const { kv, m } = setup();
  kv.set('lq1:anr:a:settings', '{"lang":"el"}');
  m.prefix();
  assert.equal(kv.get('noema1:anr:a:settings'), '{"lang":"el"}');
  assert.equal(kv.get('lq1:anr:a:settings'), '{"lang":"el"}');
  kv.set('lq1:anr:a:settings', '{"lang":"de"}');
  m.prefix(); // once
  assert.equal(kv.get('noema1:anr:a:settings'), '{"lang":"el"}');
  const b = setup();
  b.kv.set('noema1:x:a:profile', '{}');
  b.kv.set('lq1:anr:a:settings', '{}');
  b.m.prefix(); // this device already has its own keys
  assert.equal(b.kv.get('noema1:anr:a:settings'), null);
});

test('Databricks Quest: carried over when its pack opens, as the state before the learning log; once', async () => {
  const { kv, m, carried } = setup();
  kv.set('noema1:anr:a:settings', JSON.stringify({ lang: 'el' }));
  kv.set(
    'dbquest_v1',
    JSON.stringify({
      xp: 50,
      xpDay: { '2026-10-06': 50 },
      streak: 3,
      lastDay: '2026-10-06',
      res: { e1: { ok: 1 } },
      settings: { theme: 'dark', srcOn: 'x' },
    }),
  );
  kv.set('dbquest_convos_v1', '[{"title":"Old Chat"}]');
  assert.equal(m.quest('anr', 'other'), false, 'waits for the Databricks pack');
  assert.equal(m.quest('anr', 'databricks'), true);
  const st = JSON.parse(kv.get('noema1:anr:s:databricks:state') ?? '{}') as Record<string, unknown>;
  assert.equal(st['xp'], 50);
  assert.equal(st['srcOn'], 'x');
  assert.equal(st['settings'], undefined);
  assert.deepEqual(JSON.parse(kv.get('noema1:anr:a:settings') ?? ''), { theme: 'dark', lang: 'el' }, 'the settings here win');
  assert.deepEqual(JSON.parse(kv.get('noema1:anr:a:stats') ?? ''), {
    xp: 50,
    xpDay: { '2026-10-06': 50 },
    streak: 3,
    lastDay: '2026-10-06',
  });
  assert.equal(kv.get('noema1:anr:s:databricks:convos'), '[{"title":"Old Chat"}]');
  assert.ok(kv.get('dbquest_v1'), 'the old copy stays');
  assert.equal(m.quest('anr', 'databricks'), false, 'once');
  await new Promise(r => setTimeout(r, 1600));
  assert.equal(carried(), 1);
  const s = setup({ hasProgress: true });
  s.kv.set('dbquest_v1', '{"xp":1}');
  assert.equal(s.m.quest('anr', 'databricks'), false, 'progress in the log already: skipped');
  assert.equal(s.kv.get('noema1:migrated:legacy'), 'skipped');
});

test('a pack of the old format gets the current one; others stay as they are', () => {
  const { m } = setup();
  assert.deepEqual(m.pack({ format: OLD_FORMATS.packFormats[0], subject: { id: 'x' } }), { format: 'noema-pack', subject: { id: 'x' } });
  const p = { format: 'noema-pack' };
  assert.equal(m.pack(p), p);
});
