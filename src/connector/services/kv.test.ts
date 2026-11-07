import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeSupabase } from '../testing/fake_supabase.ts';
import { isoAfter } from '../util.ts';
import { KvStore } from './kv.ts';

test('swap replaces a row only if it is still the version read, with a version strictly later', async () => {
  const { sb, db } = fakeSupabase();
  const kv = new KvStore(sb, 'u1');
  const future = new Date(Date.now() + 3600e3).toISOString(); // a writer whose clock runs an hour ahead
  db.kv.set('a:x', { key: 'a:x', user_id: 'u1', value: '1', updated_at: future });
  const w = await kv.swap('a:x', future, '2');
  assert.equal(w?.value, '2');
  assert.ok(Date.parse(w.updated_at) > Date.parse(future), 'never equal to (or before) the version it replaces');
  assert.equal(await kv.swap('a:x', future, '3'), null, 'a stale version is refused');
  assert.equal(db.kv.get('a:x')?.value, '2');
});

test('update retries on a clash and gives up when the row is gone', async () => {
  const { sb, db } = fakeSupabase();
  const kv = new KvStore(sb, 'u1');
  db.kv.set('a:n', { key: 'a:n', user_id: 'u1', value: '{"n":1}', updated_at: new Date().toISOString() });
  let clash = true;
  const ok = await kv.update<{ n: number }>('a:n', v => {
    if (clash) {
      clash = false;
      const r = db.kv.get('a:n');
      if (r) db.kv.set('a:n', { ...r, value: '{"n":5}', updated_at: isoAfter(r.updated_at) });
    }
    return { n: v.n + 1 };
  });
  assert.equal(ok, true);
  assert.equal(db.kv.get('a:n')?.value, '{"n":6}', "the second try works on the other writer's value");
  assert.equal(await kv.update('a:none', () => ({})), false);
});

test('insert takes a free key only', async () => {
  const { sb } = fakeSupabase();
  const kv = new KvStore(sb, 'u1');
  assert.ok(await kv.insert('a:claim', '"me"'));
  assert.equal(await kv.insert('a:claim', '"other"'), null);
  assert.equal(await kv.get('a:claim', ''), 'me');
});
