/// <reference types="node" />
/** The browser EventStore (the app's IndexedDB "noema-lite", BroadcastChannel) passes the EventStore contract over the
    fakes, and writes the sync's outbox in the append's own transaction. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventStoreContract, sampleEvent } from '../../ports/contract/event-store.contract.ts';
import type { EventOutbox, OutboxEvent } from '../../ports/event-store.ts';
import { fakeIndexedDB } from '../testing/fake-indexeddb.ts';
import { browserEventStore, LEARNING_CHANNEL, type BroadcastChannelLike } from './event-store.ts';
import { APP_DB, browserStorage } from './storage.ts';

const appStorage = (idb: ReturnType<typeof fakeIndexedDB>): ReturnType<typeof browserStorage> => {
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = idb.KeyRange;
  return browserStorage({ indexedDB: () => idb.factory, localStorage: () => undefined, storageManager: () => undefined });
};

eventStoreContract('browser (IndexedDB)', o => {
  const idb = fakeIndexedDB();
  if (o.quota !== undefined) idb.quota = o.quota;
  return browserEventStore({ storage: appStorage(idb), broadcast: () => undefined });
});

test('the app database holds the log beside the sync (one version for the loader and the root)', () => {
  assert.equal(APP_DB.version, 3);
  for (const c of ['sync', 'log.events', 'log.ids', 'log.snapshots', 'log.meta'])
    assert.ok((APP_DB.collections as readonly string[]).includes(c), c);
});

test('the tabs of a device: an append reaches the other tabs through the channel', async () => {
  const idb = fakeIndexedDB();
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
  const a = browserEventStore({ storage: appStorage(idb), broadcast }),
    b = browserEventStore({ storage: appStorage(idb), broadcast });
  const heard: string[] = [];
  b.watch((acc, evs) => heard.push(...evs.map(e => e.id)));
  a.watch(() => undefined);
  assert.ok((await a.append('anr', [sampleEvent('evt-0001', 10)])).ok);
  assert.deepEqual(heard, ['evt-0001']);
  assert.equal(open[0]?.name, LEARNING_CHANNEL);
  const r = await b.read('anr');
  assert.ok(r.ok && r.value.length === 1, 'one database for both tabs');
});

test('the outbox: written in the append transaction (all or nothing), told after it, never for received events', async () => {
  const idb = fakeIndexedDB();
  const storage = appStorage(idb);
  const told: string[] = [];
  let fail = false;
  const outbox: EventOutbox = {
    collections: ['sync'],
    async enqueueIn(tx, account, events: readonly OutboxEvent[]) {
      for (const e of events) await tx.put('sync', `outbox|${account}|${e.hlc}|${e.id}`, e);
      if (fail) throw new Error('the outbox refused');
    },
    notify: account => told.push(account),
  };
  const s = browserEventStore({ storage, outbox, broadcast: () => undefined });
  assert.ok((await s.append('u_1', [sampleEvent('evt-0001', 10, 'u_1')])).ok);
  const q = await storage.docs.list<OutboxEvent>('sync', { prefix: 'outbox|u_1|' });
  assert.ok(q.ok && q.value.length === 1);
  const body: Record<string, unknown> = { ...q.value[0]?.[1] };
  assert.equal(body['id'], 'evt-0001');
  assert.ok(!('account' in body), 'the body is the event without its account');
  assert.equal(body['type'], 'answer.given');
  assert.deepEqual(told, ['u_1']);
  // the same event again: nothing new, nothing queued, nobody told
  assert.deepEqual((await s.append('u_1', [sampleEvent('evt-0001', 10, 'u_1')])).ok && told, ['u_1']);
  // another device's event (the sync's pull): kept, not queued
  assert.ok((await s.append('u_1', [sampleEvent('evt-0002', 20, 'u_1')], { received: true })).ok);
  const q2 = await storage.docs.list('sync', { prefix: 'outbox|u_1|' });
  assert.ok(q2.ok && q2.value.length === 1);
  assert.deepEqual(told, ['u_1']);
  // the outbox fails: the event is not kept either
  fail = true;
  const r = await s.append('u_1', [sampleEvent('evt-0003', 30, 'u_1')]);
  assert.ok(!r.ok);
  const all = await s.read('u_1');
  assert.ok(all.ok);
  assert.deepEqual(
    all.value.map(e => e.id),
    ['evt-0001', 'evt-0002'],
  );
  assert.deepEqual(told, ['u_1']);
});

test('no IndexedDB: storage.unavailable, never a throw', async () => {
  const storage = browserStorage({ indexedDB: () => undefined, localStorage: () => undefined, storageManager: () => undefined });
  const s = browserEventStore({ storage, broadcast: () => undefined });
  const r = await s.append('anr', [sampleEvent('evt-0001', 10)]);
  assert.ok(!r.ok && r.error.code === 'storage.unavailable');
});
