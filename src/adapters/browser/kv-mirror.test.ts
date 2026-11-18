/// <reference types="node" />
/** The device's key/value store: an account's keys in IndexedDB behind an in-memory copy, never capped by localStorage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../kernel/errors.ts';
import { fakeIndexedDB } from '../testing/fake-indexeddb.ts';
import { fakeWebStorage } from '../testing/fake-web-storage.ts';
import { isAccountKey, mirroredKv, type ChannelLike, type MirroredKv } from './kv-mirror.ts';

const value = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  assert.ok(r.ok);
  return (r as { value: T }).value;
};

function setup(o: { lsQuota?: number; idb?: ReturnType<typeof fakeIndexedDB> | null; ls?: ReturnType<typeof fakeWebStorage> } = {}) {
  const ls = o.ls ?? fakeWebStorage(o.lsQuota ?? Infinity);
  const idb = o.idb === undefined ? fakeIndexedDB() : o.idb;
  const full: string[] = [];
  const kv = mirroredKv({
    localStorage: () => ls,
    indexedDB: () => idb?.factory,
    onQuota: key => {
      full.push(key);
      return new NoemaError('storage.quota', 'full', { params: { key } });
    },
    channel: () => null,
    warn: () => undefined,
  });
  return { ls, idb, kv, full };
}

test('which keys are the account’s', () => {
  assert.ok(isAccountKey('noema1:acc1:a:curriculum:c1'));
  assert.ok(isAccountKey('noema1:acc1:s:sub:state'));
  assert.ok(isAccountKey('noema1:acc1:meta:mtime'));
  for (const k of ['noema1:current', 'noema1:accounts', 'noema1:accounts:removed', 'noema1:migrated:prefix', 'noema1:cloud:session'])
    assert.ok(!isAccountKey(k), k);
  assert.ok(!isAccountKey('noema1:acc1:a:settings'), 'read before ready: stays in localStorage');
  assert.ok(!isAccountKey('noema-device:geminiKey:acc1'));
});

test('an account far larger than localStorage’s cap is kept, and read back by the next start', async () => {
  const s = setup({ lsQuota: 5000 }); // a 5 000-character localStorage
  await s.kv.ready();
  assert.equal(s.kv.backing(), 'indexeddb');
  const big = 'x'.repeat(4000);
  for (let i = 0; i < 20; i++) assert.ok(s.kv.set(`noema1:acc:a:curriculum:c${String(i)}`, big + String(i)).ok);
  assert.deepEqual(s.full, [], 'no storage-full signal');
  assert.deepEqual([...s.ls.map.keys()], ['noema-device:kv-mark'], 'nothing of the account in localStorage');
  await s.kv.flushed();
  // the next start, on the same database
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:curriculum:c7')), big + '7');
  assert.equal(value(t.kv.keys('noema1:acc:a:curriculum:')).length, 20);
});

test('an older version’s keys move from localStorage to IndexedDB on ready, and are read the same before and after', async () => {
  const ls = fakeWebStorage(Infinity);
  ls.setItem('noema1:acc:a:curriculum:c1', '{"v":1}');
  ls.setItem('noema1:acc:s:sub:x', 'old');
  ls.setItem('noema1:current', '{"acc":"acc"}');
  ls.setItem('noema1:acc:a:settings', '{"lang":"el"}');
  const s = setup({ ls });
  assert.equal(value(s.kv.get('noema1:acc:a:curriculum:c1')), '{"v":1}', 'before ready: from localStorage');
  assert.ok(s.kv.set('noema1:acc:s:sub:x', 'new before ready').ok);
  await s.kv.ready();
  assert.equal(value(s.kv.get('noema1:acc:a:curriculum:c1')), '{"v":1}');
  assert.equal(value(s.kv.get('noema1:acc:s:sub:x')), 'new before ready', 'a write before ready wins');
  await s.kv.flushed();
  assert.equal(ls.getItem('noema1:acc:a:curriculum:c1'), null, 'moved out of localStorage');
  assert.equal(ls.getItem('noema1:acc:s:sub:x'), null);
  assert.equal(ls.getItem('noema1:current'), '{"acc":"acc"}', 'device keys stay');
  assert.equal(ls.getItem('noema1:acc:a:settings'), '{"lang":"el"}', 'a:settings stays');
  const t = setup({ idb: s.idb, ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:s:sub:x')), 'new before ready');
  assert.deepEqual(value(t.kv.keys('noema1:acc:')).sort(), ['noema1:acc:a:curriculum:c1', 'noema1:acc:a:settings', 'noema1:acc:s:sub:x']);
});

test('delete: gone now and after the next start (also a copy left in localStorage)', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:a:x', '1');
  await s.kv.flushed();
  s.ls.setItem('noema1:acc:a:x', 'stale'); // a failed-over copy from earlier
  assert.ok(s.kv.delete('noema1:acc:a:x').ok);
  assert.equal(value(s.kv.get('noema1:acc:a:x')), null);
  await s.kv.flushed();
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:x')), null);
});

test('IndexedDB full: the write goes to localStorage and is moved back on the next start; both full: the signal, the copy keeps it', async () => {
  const idb = fakeIndexedDB();
  const s = setup({ lsQuota: 200, idb });
  await s.kv.ready();
  idb.quota = 0;
  s.kv.set('noema1:acc:s:sub:p', 'progress');
  await s.kv.flushed();
  assert.equal(s.ls.getItem('noema1:acc:s:sub:p'), 'progress', 'kept in localStorage');
  assert.deepEqual(s.full, []);
  s.kv.set('noema1:acc:a:big', 'y'.repeat(500));
  await s.kv.flushed();
  assert.deepEqual(s.full, ['noema1:acc:a:big'], 'nowhere to keep it: the learner is told');
  assert.equal(value(s.kv.get('noema1:acc:a:big')), 'y'.repeat(500), 'this session still has it');
  idb.quota = Infinity;
  s.kv.set('noema1:acc:a:other', '1'); // the next write takes the waiting one along
  await s.kv.flushed();
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:big')), 'y'.repeat(500));
  assert.equal(value(t.kv.get('noema1:acc:s:sub:p')), 'progress');
  await t.kv.flushed();
  assert.equal(s.ls.getItem('noema1:acc:s:sub:p'), null, 'moved back into IndexedDB');
});

test('without IndexedDB: everything stays in localStorage, as before', async () => {
  const s = setup({ idb: null });
  s.kv.set('noema1:acc:a:x', 'early');
  await s.kv.ready();
  assert.equal(s.kv.backing(), 'localStorage');
  assert.equal(s.ls.getItem('noema1:acc:a:x'), 'early');
  s.kv.set('noema1:acc:a:y', '2');
  assert.equal(s.ls.getItem('noema1:acc:a:y'), '2');
  assert.deepEqual(value(s.kv.keys('noema1:acc:a:')).sort(), ['noema1:acc:a:x', 'noema1:acc:a:y']);
});

test('the other tabs: a change reaches their copy', async () => {
  const peers: ChannelLike[] = [];
  const channel = (): ChannelLike => {
    const c: ChannelLike = {
      onmessage: null,
      postMessage(m) {
        for (const p of peers) if (p !== c) p.onmessage?.({ data: m });
      },
    };
    peers.push(c);
    return c;
  };
  const idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  const make = (): MirroredKv =>
    mirroredKv({
      localStorage: () => ls,
      indexedDB: () => idb.factory,
      onQuota: k => new NoemaError('storage.quota', 'full', { params: { key: k } }),
      channel,
      warn: () => undefined,
    });
  const a = make(),
    b = make();
  await Promise.all([a.ready(), b.ready()]);
  const heard: string[] = [];
  b.onChange(keys => heard.push(...keys));
  a.set('noema1:acc:a:curriculum:c1', 'v2');
  assert.equal(value(b.get('noema1:acc:a:curriculum:c1')), 'v2');
  a.delete('noema1:acc:a:curriculum:c1');
  assert.equal(value(b.get('noema1:acc:a:curriculum:c1')), null);
  assert.deepEqual(heard, ['noema1:acc:a:curriculum:c1', 'noema1:acc:a:curriculum:c1']);
});

test('localStorage cleared on its own (a reset): the account copy in IndexedDB goes with it; a blocked localStorage drops nothing', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:a:x', '1');
  await s.kv.flushed();
  assert.ok(s.ls.getItem('noema-device:kv-mark'), 'the mark is in localStorage');
  const kept = setup({ idb: s.idb, ls: s.ls });
  await kept.kv.ready();
  assert.equal(value(kept.kv.get('noema1:acc:a:x')), '1', 'same localStorage: kept');
  s.ls.map.clear();
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:x')), null, 'cleared with localStorage');
  await t.kv.flushed();
  const u = setup({ idb: s.idb, ls: s.ls });
  await u.kv.ready();
  assert.equal(value(u.kv.get('noema1:acc:a:x')), null);
});

test('a page that closes: what is not committed yet is in localStorage too, read on the next start; once committed it leaves', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:s:sub:last', 'answer 41');
  s.kv.journal(); // pagehide, before the transaction ends
  assert.equal(s.ls.getItem('noema1:acc:s:sub:last'), 'answer 41');
  // as if the page closed now and its transaction was aborted: this localStorage, a database without the write
  const after = fakeWebStorage(Infinity);
  for (const [k, v] of s.ls.map) after.setItem(k, v);
  const t = setup({ idb: fakeIndexedDB(), ls: after });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:s:sub:last')), 'answer 41');
  await s.kv.flushed();
  await t.kv.flushed();
  assert.equal(s.ls.getItem('noema1:acc:s:sub:last'), null, 'committed: the journal copy is gone');
});
