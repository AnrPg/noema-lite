/// <reference types="node" />
/** The Supabase adapter passes the Remote + Auth contract against a fake project, and its ACL maps Supabase's errors. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteContract } from '../../ports/contract/remote.contract.ts';
import { memoryStorage } from '../memory/storage.ts';
import { fakeSupabase } from '../testing/fake-supabase.ts';
import { SupabaseClient, versionAfter } from './client.ts';
import { classify } from './errors.ts';
import { createSupabase, SESSION_KEY } from './index.ts';

const BASE = 'https://proj.supabase.test';

remoteContract('supabase (fake project)', ({ now }) => {
  const sb = fakeSupabase(BASE, { now });
  sb.addUser('ada@example.org', 'correct-horse-1', 'Ada');
  const { auth, remote } = createSupabase({ url: BASE, key: 'sb_publishable_test', fetch: (u, i) => sb.fetch(u, i), store: memoryStorage().kv, now });
  return { auth, remote, credentials: { email: 'ada@example.org', password: 'correct-horse-1' }, rpcName: 'echo', setOffline: x => { sb.offline = x; } };
});

test('versionAfter: strictly later than the version it replaces, even with a clock behind or frozen', () => {
  const t = Date.parse('2026-11-07T12:00:00.000Z');
  assert.equal(versionAfter(null, t), '2026-11-07T12:00:00.000Z');
  assert.equal(versionAfter('2026-11-07T12:00:00.000Z', t), '2026-11-07T12:00:00.001Z');
  assert.equal(versionAfter('2026-11-07T12:00:05.000+00:00', t), '2026-11-07T12:00:05.001Z', 'a server time ahead of this device');
  assert.ok(versionAfter('2026-11-07T12:00:00.123456+00:00', t) > '2026-11-07T12:00:00.123456', 'microseconds of the server');
  assert.equal(versionAfter('garbage', t), '2026-11-07T12:00:00.000Z');
});

test('the session is kept where engine/cloud.js keeps it; it is refreshed before it ends; tokens never reach the port', async () => {
  let t = Date.now();
  const sb = fakeSupabase(BASE, { now: () => t });
  sb.addUser('ada@example.org', 'pw-123456');
  sb.tokenSeconds = 120;
  const store = memoryStorage();
  const { auth, remote } = createSupabase({ url: BASE, key: 'sb_publishable_test', fetch: (u, i) => sb.fetch(u, i), store: store.kv, now: () => t });
  const s = await auth.signIn('ada@example.org', 'pw-123456');
  assert.ok(s.ok);
  assert.ok(!JSON.stringify(s.value).includes('at1'), 'no token in the session the app sees');
  const kept = JSON.parse(store.kvMap.get(SESSION_KEY) ?? '{}') as { access_token?: string; user?: { id?: string } };
  assert.ok(kept.access_token && kept.user?.id, 'engine/cloud.js reads the same session');
  t += 90_000; // within a minute of the end
  const events: string[] = [];
  auth.onChange(e => events.push(e.type));
  assert.ok((await remote.rows.get('kv', 'a:x')).ok);
  assert.ok(sb.requests.some(r => r.path.includes('grant_type=refresh_token')), 'refreshed first');
  assert.deepEqual(events, ['refreshed']);
});

test('a refused refresh signs out (expired) and says auth.session_expired', async () => {
  let t = Date.now();
  const sb = fakeSupabase(BASE, { now: () => t });
  sb.addUser('ada@example.org', 'pw-123456');
  sb.tokenSeconds = 30;
  const store = memoryStorage();
  const client = new SupabaseClient({ url: BASE, key: 'sb_publishable_test', fetch: (u, i) => sb.fetch(u, i), store: store.kv, now: () => t });
  const { auth, remote } = createSupabase({ url: BASE, key: 'sb_publishable_test', fetch: (u, i) => sb.fetch(u, i), store: store.kv, now: () => t });
  await auth.signIn('ada@example.org', 'pw-123456');
  const kept = JSON.parse(store.kvMap.get(SESSION_KEY) ?? '{}') as Record<string, unknown>;
  store.kv.set(SESSION_KEY, JSON.stringify({ ...kept, refresh_token: 'stolen-or-old' }));
  const events: Array<{ type: string; reason?: string }> = [];
  auth.onChange(e => events.push(e.type === 'signed_out' ? { type: e.type, reason: e.reason } : { type: e.type }));
  t += 60_000;
  const r = await remote.rows.get('kv', 'a:x');
  assert.ok(!r.ok && r.error.code === 'auth.session_expired');
  assert.equal(auth.session(), null);
  assert.deepEqual(events, [{ type: 'signed_out', reason: 'expired' }]);
  assert.equal(client.session(), null);
});

test('the ACL: Supabase answers → contract codes (docs/i18n.md §6.2)', () => {
  assert.deepEqual(classify('/auth/v1/token', { error_code: 'invalid_credentials' }, 400, 'Invalid login credentials'), ['auth.invalid_credentials', {}]);
  assert.deepEqual(classify('/auth/v1/token', {}, 400, 'Email not confirmed'), ['auth.email_not_confirmed', {}], 'an older server without error_code');
  assert.deepEqual(classify('/auth/v1/signup', { error_code: 'weak_password' }, 422, 'Password should be at least 8 characters.'), ['auth.weak_password', { min: 8 }]);
  assert.deepEqual(classify('/auth/v1/signup', { error_code: 'weak_password' }, 422, 'Password is known to be weak'), ['auth.weak_password_other', {}]);
  assert.deepEqual(classify('/auth/v1/token', {}, 503, 'down'), ['auth.server', { status: 503 }]);
  assert.deepEqual(classify('/rest/v1/noema_kv', { code: 'PGRST205' }, 404, 'Could not find the table'), ['cloud.schema_old', {}]);
  assert.deepEqual(classify('/rest/v1/noema_kv', { code: '42501' }, 403, 'new row violates row-level security policy'), ['cloud.permission', {}]);
  assert.deepEqual(classify('/storage/v1/object/x', {}, 413, 'Payload too large'), ['cloud.too_large', {}]);
  assert.deepEqual(classify('/rest/v1/noema_kv', {}, 401, 'JWT expired'), ['auth.session_expired', {}]);
  assert.deepEqual(classify('/rest/v1/noema_kv', {}, 429, 'slow down'), ['cloud.rate_limit', {}]);
  assert.deepEqual(classify('/rest/v1/noema_kv', {}, 502, 'bad gateway'), ['cloud.server', { status: 502 }]);
  assert.deepEqual(classify('/rest/v1/noema_kv', {}, 418, 'teapot'), ['cloud.unknown', { status: 418, detail: 'teapot' }]);
});

test('the ACL: no Supabase field name crosses the port', async () => {
  const sb = fakeSupabase(BASE);
  sb.addUser('ada@example.org', 'pw-123456');
  const { auth, remote } = createSupabase({ url: BASE, key: 'sb_publishable_test', fetch: (u, i) => sb.fetch(u, i), store: memoryStorage().kv });
  await auth.signIn('ada@example.org', 'pw-123456');
  const row = await remote.rows.put('kv', 'a:x', '1', { expected: null });
  assert.ok(row.ok);
  assert.deepEqual(Object.keys(row.value).sort(), ['key', 'value', 'version']);
  const s = auth.session();
  assert.deepEqual(Object.keys(s ?? {}).sort(), ['expiresAt', 'user']);
  assert.deepEqual(Object.keys(s?.user ?? {}).sort(), ['email', 'id', 'locale', 'name']);
});
