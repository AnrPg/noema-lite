/// <reference types="node" />
/**
 * The Storage contract: every Storage adapter passes it (src/adapters/<x>/<x>.test.ts calls it with its factory).
 * `make({ kvQuota, docsQuota })` gives a fresh, empty store; kvQuota = characters the key-value store may hold
 * (keys + values), docsQuota = documents the document store may hold, both only when given.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../kernel/errors.ts';
import type { Storage, StorageFullEvent } from '../storage.ts';

export interface StorageHarnessOptions {
  readonly kvQuota?: number;
  readonly docsQuota?: number;
}
export type StorageFactory = (o: StorageHarnessOptions) => Promise<Storage> | Storage;

const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

export function storageContract(name: string, make: StorageFactory): void {
  describe(`Storage contract: ${name}`, () => {
    test('kv: set, get, overwrite, delete, keys by prefix', async () => {
      const { kv } = await make({});
      assert.equal(value(kv.get('noema1:a:x')), null);
      assert.ok(kv.set('noema1:a:x', '1').ok);
      assert.ok(kv.set('noema1:a:y', '2').ok);
      assert.ok(kv.set('noema1:b:z', '3').ok);
      assert.ok(kv.set('noema1:a:x', '4').ok);
      assert.equal(value(kv.get('noema1:a:x')), '4');
      assert.deepEqual(value(kv.keys('noema1:a:')).sort(), ['noema1:a:x', 'noema1:a:y']);
      assert.ok(kv.delete('noema1:a:x').ok);
      assert.ok(kv.delete('noema1:a:never').ok, 'deleting a missing key is fine');
      assert.equal(value(kv.get('noema1:a:x')), null);
      assert.equal(value(kv.keys()).length, 2);
    });

    test('kv: a full storage is storage.quota, raises the storage-full signal, keeps the old value', async () => {
      const s = await make({ kvQuota: 40 });
      const seen: StorageFullEvent[] = [];
      const off = s.onFull(e => seen.push(e));
      assert.ok(s.kv.set('k', 'small').ok);
      const r = s.kv.set('k', 'x'.repeat(100));
      assert.ok(!r.ok && r.error.code === 'storage.quota', 'storage.quota');
      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.store, 'kv');
      assert.equal(seen[0]?.key, 'k');
      assert.equal(value(s.kv.get('k')), 'small', 'the value before the failed write is kept');
      off();
      s.kv.set('k2', 'y'.repeat(100));
      assert.equal(seen.length, 1, 'no event after unsubscribing');
    });

    test('docs: put, get (a copy), delete, missing keys', async () => {
      const { docs } = await make({});
      assert.ok(docs.collections.includes('packs'));
      const pack = { subject: { id: 'p1' }, chapters: [{ id: 'ch01', n: 1 }], bytes: new Uint8Array([1, 2, 3]) };
      assert.ok((await docs.put('packs', 'acc|p1', pack)).ok);
      const back = value(await docs.get<typeof pack>('packs', 'acc|p1'));
      assert.deepEqual(back, pack);
      assert.notEqual(back, pack, 'a stored document is a copy');
      pack.chapters[0]!.n = 99;
      assert.equal(value(await docs.get<typeof pack>('packs', 'acc|p1'))?.chapters[0]?.n, 1, 'changing the original changes nothing stored');
      assert.equal(value(await docs.get('packs', 'acc|none')), undefined);
      assert.ok((await docs.delete('packs', 'acc|p1')).ok);
      assert.equal(value(await docs.get('packs', 'acc|p1')), undefined);
      const bad = await docs.get('no-such-collection', 'x');
      assert.ok(!bad.ok, 'an unknown collection is an error');
    });

    test('docs: list in key order, by prefix, with a limit', async () => {
      const { docs } = await make({});
      for (const k of ['b|2', 'a|2', 'a|1', 'c|1', 'a|3']) await docs.put('restore', k, { k });
      assert.deepEqual(value(await docs.list('restore', { prefix: 'a|' })).map(([k]) => k), ['a|1', 'a|2', 'a|3']);
      assert.deepEqual(value(await docs.list('restore', { limit: 2 })).map(([k]) => k), ['a|1', 'a|2']);
      assert.deepEqual(value(await docs.list<{ k: string }>('restore', { prefix: 'c' })).map(([, v]) => v.k), ['c|1']);
      assert.equal(value(await docs.list('restore')).length, 5);
    });

    test('docs: a transaction keeps all its writes, across collections', async () => {
      const { docs } = await make({});
      const r = await docs.transaction(['packs', 'convos'], 'readwrite', async tx => {
        await tx.put('packs', 'p', { n: 1 });
        await tx.put('convos', 'c', { n: 2 });
        const p = await tx.get<{ n: number }>('packs', 'p');
        return (p?.n ?? 0) + 1;
      });
      assert.equal(value(r), 2);
      assert.deepEqual(value(await docs.get('packs', 'p')), { n: 1 });
      assert.deepEqual(value(await docs.get('convos', 'c')), { n: 2 });
    });

    test('docs: a transaction whose work fails keeps none of its writes, and returns the error', async () => {
      const { docs } = await make({});
      await docs.put('packs', 'keep', { v: 'before' });
      const r = await docs.transaction(['packs'], 'readwrite', async tx => {
        await tx.put('packs', 'keep', { v: 'changed' });
        await tx.put('packs', 'new', { v: 'new' });
        throw new NoemaError('storage.corrupt', 'the work found bad data');
      });
      assert.ok(!r.ok && r.error.code === 'storage.corrupt', 'the work\'s own error comes back');
      assert.deepEqual(value(await docs.get('packs', 'keep')), { v: 'before' });
      assert.equal(value(await docs.get('packs', 'new')), undefined);
    });

    test('docs: a readonly transaction cannot write', async () => {
      const { docs } = await make({});
      const r = await docs.transaction(['packs'], 'readonly', async tx => { await tx.put('packs', 'x', 1); });
      assert.ok(!r.ok);
      assert.equal(value(await docs.get('packs', 'x')), undefined);
    });

    test('docs: a full store is storage.quota and raises the signal', async () => {
      const s = await make({ docsQuota: 2 });
      const seen: StorageFullEvent[] = [];
      s.onFull(e => seen.push(e));
      assert.ok((await s.docs.put('packs', 'a', 1)).ok);
      assert.ok((await s.docs.put('packs', 'b', 2)).ok);
      const r = await s.docs.put('packs', 'c', 3);
      assert.ok(!r.ok && r.error.code === 'storage.quota', 'storage.quota: ' + (r.ok ? 'ok' : r.error.code));
      assert.equal(seen[0]?.store, 'docs');
      assert.equal(value(await s.docs.get('packs', 'c')), undefined);
    });

    test('estimate and persist answer', async () => {
      const s = await make({});
      const e = value(await s.estimate());
      assert.ok(e.usage === null || e.usage >= 0);
      assert.ok(e.quota === null || e.quota >= 0);
      assert.equal(typeof value(await s.persist()), 'boolean');
    });
  });
}
