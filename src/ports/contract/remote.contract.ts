/// <reference types="node" />
/**
 * The Remote + Auth contract: every cloud adapter passes it. `make({ now })` gives a fresh cloud with one account
 * (`credentials`) and its Remote and Auth, signed out; `now` is the clock the cloud's version stamps come from.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoemaError } from '../../kernel/errors.ts';
import type { Auth, AuthEvent } from '../auth.ts';
import type { LogEntry, Remote } from '../remote.ts';

export interface RemoteHarness {
  readonly remote: Remote;
  readonly auth: Auth;
  readonly credentials: { readonly email: string; readonly password: string };
  /** A server function the cloud has: `echo(args)` → args. */
  readonly rpcName: string;
  /** Takes the network away / brings it back. */
  setOffline(offline: boolean): void;
}
export type RemoteFactory = (o: { readonly now: () => number }) => Promise<RemoteHarness> | RemoteHarness;

const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const code = (r: { ok: boolean; error?: NoemaError }): string => (r.ok ? 'ok' : (r.error?.code ?? '?'));

export function remoteContract(name: string, make: RemoteFactory): void {
  const signedIn = async (now: () => number = Date.now): Promise<RemoteHarness> => {
    const h = await make({ now });
    value(await h.auth.signIn(h.credentials.email, h.credentials.password));
    return h;
  };

  describe(`Auth contract: ${name}`, () => {
    test('sign in: wrong password, then right; events; session; refresh; sign out', async () => {
      const h = await make({ now: Date.now });
      const events: AuthEvent['type'][] = [];
      h.auth.onChange(e => events.push(e.type));
      assert.equal(h.auth.session(), null);
      assert.equal(code(await h.auth.refresh()), 'auth.not_signed_in');
      assert.equal(code(await h.auth.signIn(h.credentials.email, 'wrong-password')), 'auth.invalid_credentials');
      const s = value(await h.auth.signIn(h.credentials.email, h.credentials.password));
      assert.equal(s.user.email, h.credentials.email);
      assert.ok(s.user.id && s.expiresAt > Date.now());
      assert.equal(h.auth.session()?.user.id, s.user.id);
      assert.equal(value(await h.auth.refresh()).user.id, s.user.id);
      assert.ok((await h.auth.signOut()).ok);
      assert.equal(h.auth.session(), null);
      assert.equal(events[0], 'signed_in');
      assert.equal(events.at(-1), 'signed_out');
    });

    test('sign up: an e-mail that exists is auth.user_already_exists', async () => {
      const h = await make({ now: Date.now });
      assert.equal(code(await h.auth.signUp({ email: h.credentials.email, password: 'another-password-1' })), 'auth.user_already_exists');
    });

    test('offline sign-in is auth.network', async () => {
      const h = await make({ now: Date.now });
      h.setOffline(true);
      assert.equal(code(await h.auth.signIn(h.credentials.email, h.credentials.password)), 'auth.network');
    });
  });

  describe(`Remote contract: ${name}`, () => {
    test('signed out: auth.not_signed_in', async () => {
      const h = await make({ now: Date.now });
      assert.equal(code(await h.remote.rows.get('kv', 'a:x')), 'auth.not_signed_in');
    });

    test('rows: create, then compare-and-swap; a stale version is refused and changes nothing', async () => {
      const { remote } = await signedIn();
      assert.equal(value(await remote.rows.get('kv', 'a:stats')), null);
      const v1 = value(await remote.rows.put('kv', 'a:stats', '{"xp":1}', { expected: null }));
      assert.equal(v1.value, '{"xp":1}');
      assert.equal(
        code(await remote.rows.put('kv', 'a:stats', '{"xp":9}', { expected: null })),
        'remote.conflict',
        'must-not-exist on a row that exists',
      );
      const v2 = value(await remote.rows.put('kv', 'a:stats', '{"xp":2}', { expected: v1.version }));
      assert.ok(v2.version > v1.version, 'the new version is later');
      const stale = await remote.rows.put('kv', 'a:stats', '{"xp":3}', { expected: v1.version });
      assert.equal(code(stale), 'remote.conflict');
      assert.ok(!stale.ok && stale.error.retryable);
      assert.equal(value(await remote.rows.get('kv', 'a:stats'))?.value, '{"xp":2}');
    });

    test('rows: writes in the same millisecond still get strictly later versions (a frozen clock)', async () => {
      const frozen = Date.parse('2026-11-07T12:00:00.000Z');
      const { remote } = await signedIn(() => frozen);
      let row = value(await remote.rows.put('kv', 'a:k', '0', { expected: null }));
      const versions = [row.version];
      for (let i = 1; i <= 5; i++) {
        row = value(await remote.rows.put('kv', 'a:k', String(i), { expected: row.version }));
        versions.push(row.version);
      }
      for (const [i, v] of versions.entries()) if (i > 0) assert.ok(v > (versions[i - 1] ?? ''), `${v} > ${versions[i - 1] ?? ''}`);
      assert.equal(new Set(versions).size, versions.length);
    });

    test('rows: list by prefix (literally: _ % * are not wildcards), after a version, with a limit', async () => {
      let t = Date.parse('2026-11-07T12:00:00.000Z');
      const { remote } = await signedIn(() => t);
      for (const k of ['s:a_b:state', 's:axb:state', 's:a%:x', 'a:other', 's:a_b:cards']) {
        t += 10;
        value(await remote.rows.put('kv', k, k, { expected: null }));
      }
      assert.deepEqual(
        value(await remote.rows.list('kv', { prefix: 's:a_b:' }))
          .map(r => r.key)
          .sort(),
        ['s:a_b:cards', 's:a_b:state'],
      );
      assert.deepEqual(
        value(await remote.rows.list('kv', { prefix: 's:a%' })).map(r => r.key),
        ['s:a%:x'],
      );
      const all = value(await remote.rows.list('kv'));
      assert.equal(all.length, 5);
      assert.equal(value(await remote.rows.list('kv', { limit: 2 })).length, 2);
      const newest = [...all].sort((a, b) => (a.version < b.version ? -1 : 1));
      const third = newest[2];
      assert.ok(third, 'five rows listed');
      const later = value(await remote.rows.list('kv', { after: third.version }))
        .map(r => r.key)
        .sort();
      assert.deepEqual(
        later,
        newest
          .slice(3)
          .map(r => r.key)
          .sort(),
      );
    });

    test('rows: delete (missing is fine; with a stale version it is refused)', async () => {
      const { remote } = await signedIn();
      const r1 = value(await remote.rows.put('kv', 'a:d', 'x', { expected: null }));
      const r2 = value(await remote.rows.put('kv', 'a:d', 'y', { expected: r1.version }));
      assert.equal(code(await remote.rows.delete('kv', 'a:d', { expected: r1.version })), 'remote.conflict');
      assert.ok((await remote.rows.delete('kv', 'a:d', { expected: r2.version })).ok);
      assert.equal(value(await remote.rows.get('kv', 'a:d')), null);
      assert.ok((await remote.rows.delete('kv', 'a:d')).ok);
      assert.ok((await remote.rows.delete('kv', 'a:d', { expected: r2.version })).ok, 'already gone: fine');
    });

    test('an unknown collection or bucket is remote.unknown_collection', async () => {
      const { remote } = await signedIn();
      assert.equal(code(await remote.rows.get('nope', 'x')), 'remote.unknown_collection');
      assert.equal(code(await remote.objects.get('nope', 'x')), 'remote.unknown_collection');
    });

    test('objects: put, get, list a folder, remove; a missing object is null', async () => {
      const { remote } = await signedIn();
      value(await remote.objects.put('private', 'u1/files/a.txt', 'hello', { contentType: 'text/plain' }));
      value(await remote.objects.put('private', 'u1/files/b.bin', new Uint8Array([1, 2, 3])));
      assert.equal(await value(await remote.objects.get('private', 'u1/files/a.txt'))?.text(), 'hello');
      assert.equal((await value(await remote.objects.get('private', 'u1/files/b.bin'))?.arrayBuffer())?.byteLength, 3);
      assert.equal(value(await remote.objects.get('private', 'u1/files/none')), null);
      assert.deepEqual(
        value(await remote.objects.list('private', 'u1/files/'))
          .map(o => o.path)
          .sort(),
        ['u1/files/a.txt', 'u1/files/b.bin'],
      );
      value(await remote.objects.remove('private', ['u1/files/a.txt', 'u1/files/none']));
      assert.deepEqual(
        value(await remote.objects.list('private', 'u1/files')).map(o => o.path),
        ['u1/files/b.bin'],
      );
    });

    test('log: append is idempotent by id; reads go on from a cursor, page by page, each entry once', async () => {
      const { remote } = await signedIn();
      const ev = (i: number): LogEntry => ({
        id: `ev${i}`,
        kind: 'answer.given',
        stamp: `${String(1_700_000_000_000 + i).padStart(15, '0')}-00000-devA`,
        device: 'devA',
        body: { id: `ev${i}`, n: i },
      });
      value(await remote.log.append('events', [ev(1), ev(2), ev(3)]));
      value(await remote.log.append('events', [ev(2), ev(3), ev(4)])); // sent again after a lost answer: nothing doubles
      const p1 = value(await remote.log.read('events', { after: null, limit: 3 }));
      assert.deepEqual(
        p1.entries.map(e => e.id),
        ['ev1', 'ev2', 'ev3'],
      );
      assert.ok(p1.more);
      assert.deepEqual(p1.entries[1]?.body, { id: 'ev2', n: 2 });
      assert.equal(p1.entries[1].kind, 'answer.given');
      const p2 = value(await remote.log.read('events', { after: p1.cursor, limit: 3 }));
      assert.deepEqual(
        p2.entries.map(e => e.id),
        ['ev4'],
      );
      assert.ok(!p2.more);
      const p3 = value(await remote.log.read('events', { after: p2.cursor, limit: 3 }));
      assert.deepEqual([p3.entries.length, p3.more, p3.cursor], [0, false, p2.cursor], 'nothing new: the cursor stays');
      value(await remote.log.append('events', [ev(5)]));
      assert.deepEqual(
        value(await remote.log.read('events', { after: p3.cursor })).entries.map(e => e.id),
        ['ev5'],
      );
      assert.equal(code(await remote.log.read('nope', { after: null })), 'remote.unknown_collection');
    });

    test('registers: the later stamp wins per key, an equal or earlier one is not kept; reads from a cursor; removal', async () => {
      const t = Date.parse('2026-11-07T12:00:00.000Z');
      const { remote } = await signedIn(() => t);
      const st = (ms: number, count = 0, node = 'devA'): string =>
        `${String(t + ms).padStart(15, '0')}-${String(count).padStart(5, '0')}-${node}`;
      const kept = value(
        await remote.registers.put('settings', [
          { key: 'settings.goal', value: 100, stamp: st(-1000), device: 'devA' },
          { key: 'settings.lang', value: 'el', stamp: st(-900), device: 'devA' },
        ]),
      );
      assert.deepEqual(
        kept.map(e => e.key),
        ['settings.goal', 'settings.lang'],
      );
      const first = value(await remote.registers.read('settings', { after: null }));
      assert.equal(first.entries.length, 2);
      const again = value(
        await remote.registers.put('settings', [
          { key: 'settings.goal', value: 50, stamp: st(-2000), device: 'devB' }, // older: not kept
          { key: 'settings.lang', value: 'fr', stamp: st(-900), device: 'devA' }, // the same stamp: not kept
          { key: 'settings.goal', value: 150, stamp: st(-1000, 1, 'devB'), device: 'devB' }, // later by its counter: kept
          { key: 'settings.sound', value: null, stamp: st(-500), device: 'devB' }, // a removal is a value too
        ]),
      );
      assert.deepEqual(
        again.map(e => [e.key, e.value]),
        [
          ['settings.goal', 150],
          ['settings.sound', null],
        ],
      );
      const next = value(await remote.registers.read('settings', { after: first.cursor }));
      assert.deepEqual(next.entries.map(e => [e.key, e.value]).sort(), [
        ['settings.goal', 150],
        ['settings.sound', null],
      ]);
      const all = value(await remote.registers.read('settings', { after: null }));
      assert.deepEqual(Object.fromEntries(all.entries.map(e => [e.key, e.value])), {
        'settings.goal': 150,
        'settings.lang': 'el',
        'settings.sound': null,
      });
      assert.equal(code(await remote.registers.read('nope', { after: null })), 'remote.unknown_collection');
    });

    test("registers: a stamp from a clock far ahead of the cloud is stored as the cloud's time", async () => {
      const t = Date.parse('2026-11-07T12:00:00.000Z');
      const { remote } = await signedIn(() => t);
      const ahead = `${String(t + 365 * 86_400_000).padStart(15, '0')}-00000-devX`;
      const [e] = value(await remote.registers.put('settings', [{ key: 'settings.goal', value: 1, stamp: ahead, device: 'devX' }]));
      assert.ok(e && e.stamp < ahead && Number(e.stamp.slice(0, 15)) <= t + 1000, 'clamped to the cloud clock: ' + String(e?.stamp));
      const later = `${String(t + 1000).padStart(15, '0')}-00000-devA`;
      assert.equal(
        value(await remote.registers.put('settings', [{ key: 'settings.goal', value: 2, stamp: later, device: 'devA' }])).length,
        1,
        'a real later write wins',
      );
    });

    test('rpc answers JSON; offline is cloud.network', async () => {
      const h = await signedIn();
      assert.deepEqual(value(await h.remote.rpc(h.rpcName, { a: 1, b: ['x'] })), { a: 1, b: ['x'] });
      h.setOffline(true);
      const r = await h.remote.rows.get('kv', 'a:x');
      assert.equal(code(r), 'cloud.network');
      assert.ok(!r.ok && r.error.retryable);
    });
  });
}
