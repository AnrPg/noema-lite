/// <reference types="node" />
/** The memory EventStore passes the EventStore contract; two stores on one tab hub hear each other's appends. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventStoreContract, sampleEvent } from '../../ports/contract/event-store.contract.ts';
import { memoryTabHub } from '../local/event-store.ts';
import { memoryEventStore } from './event-store.ts';

eventStoreContract('memory', o => memoryEventStore(o.quota === undefined ? {} : { quota: o.quota }));

test('tabs: an append in one is heard by the other, never by itself', async () => {
  const hub = memoryTabHub();
  const a = memoryEventStore({ channel: hub() }),
    b = memoryEventStore({ channel: hub() });
  const heardA: string[] = [],
    heardB: string[] = [];
  a.watch((acc, evs) => heardA.push(...evs.map(e => acc + ':' + e.id)));
  b.watch((acc, evs) => heardB.push(...evs.map(e => acc + ':' + e.id)));
  assert.ok((await a.append('anr', [sampleEvent('evt-0001', 10)])).ok);
  assert.ok((await a.append('anr', [sampleEvent('evt-0001', 10)])).ok);
  assert.deepEqual(heardB, ['anr:evt-0001'], 'only what was new');
  assert.deepEqual(heardA, []);
});
