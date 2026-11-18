/// <reference types="node" />
/** The device's key/value store: an account's keys in IndexedDB behind an in-memory copy, never capped by localStorage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../kernel/errors.ts';
import { fakeIndexedDB } from '../testing/fake-indexeddb.ts';
import { fakeWebStorage } from '../testing/fake-web-storage.ts';
import { isAccountKey, JOURNAL_PREFIX, mirroredKv, type ChannelLike } from './kv-mirror.ts';

const value = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  assert.ok(r.ok);
  return (r as { value: T }).value;
};

type Ls = ReturnType<typeof fakeWebStorage>;
function setup(
  o: {
    lsQuota?: number;
    idb?: ReturnType<typeof fakeIndexedDB> | null;
    ls?: Ls;
    channel?: () => ChannelLike | null;
    lsBroken?: () => boolean;
  } = {},
) {
  const ls = o.ls ?? fakeWebStorage(o.lsQuota ?? Infinity);
  const idb = o.idb === undefined ? fakeIndexedDB() : o.idb;
  const full: string[] = [];
  const kv = mirroredKv({
    localStorage: () => {
      if (o.lsBroken?.()) throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
      return ls;
    },
    indexedDB: () => idb?.factory,
    onQuota: key => {
      full.push(key);
      return new NoemaError('storage.quota', 'full', { params: { key } });
    },
    channel: o.channel ?? (() => null),
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

/** a journal entry's value in localStorage, or undefined */
const journaled = (ls: Ls, k: string): string | null | undefined => {
  const raw = ls.getItem(JOURNAL_PREFIX + k);
  return raw === null ? undefined : (JSON.parse(raw) as { v: string | null }).v;
};
/** tabs on one bus */
function bus(): () => ChannelLike {
  const peers: ChannelLike[] = [];
  return () => {
    const c: ChannelLike = {
      onmessage: null,
      postMessage(m) {
        for (const p of peers) if (p !== c) p.onmessage?.({ data: structuredClone(m) });
      },
    };
    peers.push(c);
    return c;
  };
}

test('delete: gone now and after the next start, also over an older journal entry', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:a:x', '1');
  s.kv.journal(); // an entry in the journal, older than the delete
  assert.ok(s.kv.delete('noema1:acc:a:x').ok);
  assert.equal(value(s.kv.get('noema1:acc:a:x')), null);
  assert.ok(!value(s.kv.keys('noema1:acc:')).includes('noema1:acc:a:x'));
  await s.kv.flushed();
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:x')), null);
});

test('a delete not committed when the page closes stays deleted (its tombstone is journaled)', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:a:curriculum:c1', 'map');
  await s.kv.flushed();
  // the page deletes it and closes before the transaction commits: its journal is this localStorage now
  s.kv.delete('noema1:acc:a:curriculum:c1');
  s.kv.journal();
  assert.equal(journaled(s.ls, 'noema1:acc:a:curriculum:c1'), null, 'a tombstone in the journal');
  const tomb = s.ls.getItem(JOURNAL_PREFIX + 'noema1:acc:a:curriculum:c1') ?? '';
  // the next start: a database that still has the Roadmap (the delete was aborted), the journal with the tombstone
  const idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  const seed = setup({ idb, ls });
  await seed.kv.ready();
  seed.kv.set('noema1:acc:a:curriculum:c1', 'map');
  await seed.kv.flushed();
  // (the tombstone was written later than the seed: give it a revision after the seed's)
  const t0 = JSON.parse(tomb) as { v: null; r: string };
  ls.setItem(JOURNAL_PREFIX + 'noema1:acc:a:curriculum:c1', JSON.stringify({ v: null, r: '9' + t0.r.slice(1) }));
  const t = setup({ idb, ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:curriculum:c1')), null);
  await t.kv.flushed();
  const u = setup({ idb, ls });
  await u.kv.ready();
  assert.equal(value(u.kv.get('noema1:acc:a:curriculum:c1')), null, 'and in the database from then on');
  assert.equal(journaled(ls, 'noema1:acc:a:curriculum:c1'), undefined, 'the journal entry is gone once committed');
});

test('IndexedDB full: the write goes to the journal and back into the database on the next start; both full: the signal, memory keeps it', async () => {
  const idb = fakeIndexedDB();
  const s = setup({ lsQuota: 400, idb });
  await s.kv.ready();
  idb.quota = 0;
  s.kv.set('noema1:acc:s:sub:p', 'progress');
  await s.kv.flushed();
  assert.equal(journaled(s.ls, 'noema1:acc:s:sub:p'), 'progress', 'kept in the journal');
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
  assert.equal(journaled(s.ls, 'noema1:acc:s:sub:p'), undefined, 'committed: the journal entry is gone');
});

test('a refused write that a newer one replaced is not tried again over it', async () => {
  const idb = fakeIndexedDB();
  const s = setup({ idb });
  await s.kv.ready();
  s.kv.set('noema1:acc:a:k', 'v0');
  await s.kv.flushed();
  idb.quota = 1; // full for new keys; the key exists, so its next writes fit
  s.kv.set('noema1:acc:a:new', 'refused'); // fails the batch…
  s.kv.set('noema1:acc:a:k', 'v1'); // …with this one in it
  const first = s.kv.flushed();
  idb.quota = Infinity;
  s.kv.set('noema1:acc:a:k', 'v2'); // a newer write, in the next batch
  await first;
  await s.kv.flushed();
  s.kv.set('noema1:acc:a:other', 'x');
  await s.kv.flushed();
  const t = setup({ idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:k')), 'v2', 'the older refused write never replaces the newer one');
  assert.equal(value(s.kv.get('noema1:acc:a:k')), 'v2');
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
  const channel = bus(),
    idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  const a = setup({ idb, ls, channel }).kv,
    b = setup({ idb, ls, channel }).kv;
  await Promise.all([a.ready(), b.ready()]);
  const heard: string[] = [];
  b.onChange(keys => heard.push(...keys));
  a.set('noema1:acc:a:curriculum:c1', 'v2');
  assert.equal(value(b.get('noema1:acc:a:curriculum:c1')), 'v2');
  a.delete('noema1:acc:a:curriculum:c1');
  assert.equal(value(b.get('noema1:acc:a:curriculum:c1')), null);
  assert.deepEqual(heard, ['noema1:acc:a:curriculum:c1', 'noema1:acc:a:curriculum:c1']);
});

test('two tabs writing the same key at once end on the same value, in memory and in the database', async () => {
  const idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  // messages held back, as when both write before hearing the other
  const held: Array<() => void> = [];
  const peers: ChannelLike[] = [];
  const channel = (): ChannelLike => {
    const c: ChannelLike = {
      onmessage: null,
      postMessage(m) {
        for (const p of peers) if (p !== c) held.push(() => p.onmessage?.({ data: structuredClone(m) }));
      },
    };
    peers.push(c);
    return c;
  };
  const a = setup({ idb, ls, channel }).kv,
    b = setup({ idb, ls, channel }).kv;
  await Promise.all([a.ready(), b.ready()]);
  a.set('noema1:acc:meta:mtime', 'from A');
  b.set('noema1:acc:meta:mtime', 'from B'); // later
  for (const f of held.splice(0)) f();
  await Promise.all([a.flushed(), b.flushed()]);
  assert.equal(value(a.get('noema1:acc:meta:mtime')), value(b.get('noema1:acc:meta:mtime')), 'the tabs agree');
  const c = setup({ idb, ls }).kv;
  await c.ready();
  assert.equal(value(c.get('noema1:acc:meta:mtime')), value(a.get('noema1:acc:meta:mtime')), 'and so does the database');
});

test('a tab that starts while another writes keeps the newer value (a message during its loading)', async () => {
  const channel = bus(),
    idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  const a = setup({ idb, ls, channel }).kv;
  await a.ready();
  a.set('noema1:acc:a:x', 'old');
  await a.flushed();
  const b = setup({ idb, ls, channel }).kv;
  const loading = b.ready(); // reads the database ('old')…
  a.set('noema1:acc:a:x', 'new'); // …while A writes
  a.delete('noema1:acc:a:y');
  await loading;
  assert.equal(value(b.get('noema1:acc:a:x')), 'new');
});

test('a peer’s newer write: this page no longer journals its older one', async () => {
  const channel = bus(),
    idb = fakeIndexedDB(),
    ls = fakeWebStorage(Infinity);
  const a = setup({ idb, ls, channel }).kv,
    b = setup({ idb, ls, channel }).kv;
  await Promise.all([a.ready(), b.ready()]);
  a.set('noema1:acc:a:x', 'older');
  b.set('noema1:acc:a:x', 'newer');
  await b.flushed();
  a.journal();
  assert.notEqual(journaled(ls, 'noema1:acc:a:x'), 'older');
  await a.flushed();
  const c = setup({ idb, ls }).kv;
  await c.ready();
  assert.equal(value(c.get('noema1:acc:a:x')), 'newer');
});

test('localStorage cleared on its own (a reset): the account copy in IndexedDB goes with it; an unreadable localStorage drops nothing', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:a:x', '1');
  await s.kv.flushed();
  assert.ok(s.ls.getItem('noema-device:kv-mark'), 'the mark is in localStorage');
  const kept = setup({ idb: s.idb, ls: s.ls });
  await kept.kv.ready();
  assert.equal(value(kept.kv.get('noema1:acc:a:x')), '1', 'same localStorage: kept');
  const blocked = setup({ idb: s.idb, ls: s.ls, lsBroken: () => true });
  await blocked.kv.ready();
  assert.equal(value(blocked.kv.get('noema1:acc:a:x')), '1', 'localStorage unreadable: nothing dropped');
  await blocked.kv.flushed();
  s.ls.map.clear();
  const t = setup({ idb: s.idb, ls: s.ls });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:a:x')), null, 'cleared with localStorage');
  await t.kv.flushed();
  const u = setup({ idb: s.idb, ls: s.ls });
  await u.kv.ready();
  assert.equal(value(u.kv.get('noema1:acc:a:x')), null);
});

test('a page that closes: what is not committed yet is journaled, read on the next start; once committed it leaves', async () => {
  const s = setup();
  await s.kv.ready();
  s.kv.set('noema1:acc:s:sub:last', 'answer 41');
  s.kv.journal(); // pagehide, before the transaction ends
  assert.equal(journaled(s.ls, 'noema1:acc:s:sub:last'), 'answer 41');
  // as if the page closed now and its transaction was aborted: this localStorage, a database without the write
  const after = fakeWebStorage(Infinity);
  for (const [k, v] of s.ls.map) after.setItem(k, v);
  const t = setup({ idb: fakeIndexedDB(), ls: after });
  await t.kv.ready();
  assert.equal(value(t.kv.get('noema1:acc:s:sub:last')), 'answer 41');
  await s.kv.flushed();
  assert.equal(journaled(s.ls, 'noema1:acc:s:sub:last'), undefined, 'committed: the journal entry is gone');
});
