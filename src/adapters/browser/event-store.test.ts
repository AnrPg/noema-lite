/// <reference types="node" />
/** The browser EventStore (IndexedDB "noema-learning", BroadcastChannel) passes the EventStore contract over the fakes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventStoreContract, sampleEvent } from '../../ports/contract/event-store.contract.ts';
import { fakeIndexedDB } from '../testing/fake-indexeddb.ts';
import { browserEventStore, LEARNING_DB, type BroadcastChannelLike } from './event-store.ts';

eventStoreContract('browser (IndexedDB)', o => {
  const idb = fakeIndexedDB();
  if (o.quota !== undefined) idb.quota = o.quota;
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = idb.KeyRange;
  return browserEventStore({ indexedDB: () => idb.factory, broadcast: () => undefined });
});

test('the tabs of a device: an append reaches the other tabs through the channel', async () => {
  const idb = fakeIndexedDB();
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = idb.KeyRange;
  const open: Array<BroadcastChannelLike & { name: string }> = [];
  const broadcast = (name: string): BroadcastChannelLike => {
    const ch: BroadcastChannelLike & { name: string } = {
      name,
      onmessage: null,
      postMessage(m) {
        for (const o of open) if (o !== ch && o.name === name) o.onmessage?.({ data: structuredClone(m) });
      },
    };
    open.push(ch);
    return ch;
  };
  const a = browserEventStore({ indexedDB: () => idb.factory, broadcast }),
    b = browserEventStore({ indexedDB: () => idb.factory, broadcast });
  const heard: string[] = [];
  b.watch((acc, evs) => heard.push(...evs.map(e => e.id)));
  a.watch(() => undefined);
  assert.ok((await a.append('anr', [sampleEvent('evt-0001', 10)])).ok);
  assert.deepEqual(heard, ['evt-0001']);
  assert.equal(open[0]?.name, LEARNING_DB.channel);
  const r = await b.read('anr');
  assert.ok(r.ok && r.value.length === 1, 'one database for both tabs');
});

test('no IndexedDB: storage.unavailable, never a throw', async () => {
  const s = browserEventStore({ indexedDB: () => undefined, broadcast: () => undefined });
  const r = await s.append('anr', [sampleEvent('evt-0001', 10)]);
  assert.ok(!r.ok && r.error.code === 'storage.unavailable');
});
