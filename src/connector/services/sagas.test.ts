import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeSupabase } from '../testing/fake_supabase.ts';
import { Sagas, SAGA_LEASE_MS, sagaKey } from './sagas.ts';

test('a saga runs its steps once; the same key again replays the first result', async () => {
  const { sb, db } = fakeSupabase();
  const s = new Sagas(sb, 'u1'); let runs = 0;
  const body = async (c: Parameters<Parameters<Sagas['run']>[2]>[0]): Promise<string> => { await c.step('a', async () => ++runs); return 'saved ' + runs; };
  const first = await s.run('pack', 'k1', body);
  const again = await s.run('pack', 'k1', body);
  assert.deepEqual(first, { status: 'done', value: 'saved 1', replayed: false });
  assert.deepEqual(again, { status: 'done', value: 'saved 1', replayed: true });
  assert.equal(runs, 1);
  assert.equal(db.sagas.get('k1')?.status, 'done');
  assert.equal(await s.finished('k1'), 'saved 1');
});

test('stillDone false: the state the saga made is gone, so it runs again from the start', async () => {
  const { sb } = fakeSupabase();
  const s = new Sagas(sb, 'u1'); let runs = 0;
  const body = async (c: Parameters<Parameters<Sagas['run']>[2]>[0]): Promise<number> => c.step('a', async () => ++runs);
  await s.run('pack', 'k', body);
  const r = await s.run('pack', 'k', body, { stillDone: async () => false });
  assert.deepEqual(r, { status: 'done', value: 2, replayed: false });
});

test('a running saga with a live lease is busy; once the lease runs out it is resumed, its recorded steps skipped', async () => {
  const { sb, db } = fakeSupabase();
  let t = Date.now();
  const s = new Sagas(sb, 'u1', () => t);
  const calls: string[] = [];
  let release!: () => void; const held = new Promise<void>(r => { release = r; });
  const slow = s.run('pack', 'k', async c => { await c.step('one', async () => { calls.push('one'); return 1; }); await held; return 'x'; });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(await s.run('pack', 'k', async () => 'never'), { status: 'busy' });
  // the first call stops (its process died): the lease runs out, the next call takes over
  t += SAGA_LEASE_MS + 1000;
  const taken = await s.run('pack', 'k', async c => { await c.step('one', async () => { calls.push('one again'); return 1; }); await c.step('two', async () => { calls.push('two'); return 2; }); return 'resumed'; });
  assert.deepEqual(taken, { status: 'done', value: 'resumed', replayed: false });
  assert.deepEqual(calls, ['one', 'two']);
  release();
  assert.deepEqual(await slow, { status: 'lost' }, 'the call that lost the saga stops at its next write');
  assert.equal(db.sagas.get('k')?.result, 'resumed');
});

test('a failing step: the compensations of this call run in reverse, the saga is failed, the next call starts from there', async () => {
  const { sb, db } = fakeSupabase();
  const s = new Sagas(sb, 'u1'); const undone: string[] = [];
  await assert.rejects(s.run('pack', 'k', async c => {
    await c.step('file', async () => 'f', async () => { undone.push('file'); });
    await c.step('index', async () => 'i', async () => { undone.push('index'); });
    await c.step('boom', async () => { throw new Error('network'); });
    return 'no';
  }), /network/);
  assert.deepEqual(undone, ['index', 'file']);
  const row = db.sagas.get('k');
  assert.equal(row?.status, 'failed'); assert.equal(row?.error, 'network'); assert.deepEqual(row?.steps, {});
  const ok = await s.run('pack', 'k', async c => { await c.step('file', async () => 'f2'); return 'ok'; });
  assert.deepEqual(ok, { status: 'done', value: 'ok', replayed: false });
});

test('every write of a saga row gets a version strictly later than the one it replaces', async () => {
  const { sb, db } = fakeSupabase();
  const s = new Sagas(sb, 'u1'); const seen: string[] = [];
  await s.run('pack', 'k', async c => { for (const n of ['a', 'b', 'c']) { await c.step(n, async () => n); seen.push(String(db.sagas.get('k')?.updated_at)); } return 'ok'; });
  for (let i = 1; i < seen.length; i++) assert.ok(Date.parse(seen[i] ?? '') > Date.parse(seen[i - 1] ?? ''));
});

test('sagaKey: only safe characters, at most 200', () => {
  assert.equal(sagaKey('pack', 'a b', 'x/y'), 'pack:a_b:x_y');
  assert.equal(sagaKey('x'.repeat(300)).length, 200);
});
