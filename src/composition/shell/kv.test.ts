import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountKv, GeminiKey, NoticeStore, profileId, slugify, type DeviceKv } from './kv.ts';

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

test('slugify keeps the old ids (may be empty); a profile id is never empty and never taken', () => {
  assert.equal(slugify('Ελένη'), '');
  assert.equal(slugify('  Café Über—Physik! '), 'cafe-uber-physik');
  assert.equal(slugify('x'.repeat(40)).length, 30);
  assert.equal(profileId('Ελένη', new Set()), 'profile');
  assert.equal(profileId('Ana', new Set(['ana', 'ana-2'])), 'ana-3');
});

test('the Gemini key never stays in a:settings: migrate moves it to this device and keeps every other setting', () => {
  const kv = mapKv(),
    store = new AccountKv(
      kv,
      () => 1,
      () => undefined,
    );
  store.acc = 'anr';
  const key = new GeminiKey(kv, store, () => 'BUILTIN');
  kv.set('noema1:anr:a:settings', JSON.stringify({ lang: 'el', apiKey: 'K1' }));
  key.migrate();
  assert.equal(key.get('anr'), 'K1');
  assert.deepEqual(JSON.parse(kv.get('noema1:anr:a:settings') ?? ''), { lang: 'el' });
  kv.set('noema1:anr:a:settings', JSON.stringify({ apiKey: 'K2' }));
  key.migrate('anr'); // a key already here wins
  assert.equal(key.get('anr'), 'K1');
  key.set('anr', 'BUILTIN'); // the built-in key is never stored
  assert.equal(key.get('anr'), '');
});

test('the 🔔 news of this device: kept, dismissed, cleared, and every change is told', () => {
  const kv = mapKv(),
    n = new NoticeStore(kv, () => 'r');
  let told = 0;
  const off = n.onChange(() => told++);
  n.keep('anr', [
    { text: 'a', at: 1 },
    { text: 'b', at: 2 },
  ]);
  const list = n.list('anr');
  assert.deepEqual(
    list.map(x => x.text),
    ['a', 'b'],
  );
  n.dismiss('anr', list[0]?.id ?? '');
  assert.deepEqual(
    n.list('anr').map(x => x.text),
    ['b'],
  );
  n.clear('anr');
  assert.deepEqual(n.list('anr'), []);
  assert.equal(told, 3);
  off();
  n.keep(null, [{ text: 'c', at: 3 }]);
  assert.equal(told, 3);
  assert.equal(n.list(null).length, 1);
  assert.ok(kv.get('noema-notices:local'));
});
