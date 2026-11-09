/// <reference types="node" />
/**
 * The EventStore contract: every EventStore adapter passes it. `make({ quota })` gives a fresh, empty store; quota =
 * documents it may hold (events, ids, snapshots and meta values together), only when given.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoemaError } from '../../kernel/errors.ts';
import type { EventStore, StoredEvent } from '../event-store.ts';
import type { StorageFullEvent } from '../storage.ts';

export type EventStoreFactory = (o: { readonly quota?: number }) => Promise<EventStore> | EventStore;

const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const stamp = (wall: number, count = 0, node = 'dev1'): string =>
  `${String(wall).padStart(15, '0')}-${String(count).padStart(5, '0')}-${node}`;
/** A valid event (noema.events/v1) of account `acc`. */
export function sampleEvent(id: string, wall: number, acc = 'anr', over: Partial<StoredEvent> = {}): StoredEvent {
  return {
    v: 1,
    id,
    type: 'answer.given',
    hlc: stamp(wall),
    day: '2026-11-08',
    device: 'dev1',
    account: acc,
    subject: 'demo',
    item: 'ch01-e001',
    data: { ok: true },
    ...over,
  };
}

export function eventStoreContract(name: string, make: EventStoreFactory): void {
  describe(`EventStore contract: ${name}`, () => {
    test('append returns what was new, read gives the log in order (stamp, then id)', async () => {
      const s = await make({});
      const added = value(await s.append('anr', [sampleEvent('evt-0003', 30), sampleEvent('evt-0001', 10), sampleEvent('evt-0002', 10)]));
      assert.deepEqual(
        added.map(e => e.id),
        ['evt-0001', 'evt-0002', 'evt-0003'],
      );
      assert.deepEqual(
        value(await s.read('anr')).map(e => e.id),
        ['evt-0001', 'evt-0002', 'evt-0003'],
      );
      assert.deepEqual(value(await s.read('other')), [], 'another account has its own log');
    });

    test('idempotent by id: within a batch, across appends, and after the event was forgotten', async () => {
      const s = await make({});
      value(await s.append('anr', [sampleEvent('evt-a0001', 10), sampleEvent('evt-a0001', 10)]));
      assert.deepEqual(
        value(await s.append('anr', [sampleEvent('evt-a0001', 99)])),
        [],
        'an id seen before adds nothing (whatever its stamp)',
      );
      assert.equal(value(await s.read('anr')).length, 1);
      assert.equal(value(await s.forget('anr', ['evt-a0001', 'evt-nope'])), 1);
      assert.equal(value(await s.read('anr')).length, 0, 'forgotten');
      assert.deepEqual([...value(await s.known('anr', ['evt-a0001', 'evt-b0001']))], ['evt-a0001'], 'its id is still known');
      assert.deepEqual(value(await s.append('anr', [sampleEvent('evt-a0001', 10)])), [], 'so it never comes back');
      assert.equal(value(await s.forget('anr', ['evt-a0001'])), 0);
    });

    test('read after a stamp: only the later events', async () => {
      const s = await make({});
      value(
        await s.append('anr', [
          sampleEvent('evt-0001', 10),
          sampleEvent('evt-0002', 20),
          sampleEvent('evt-0003', 20),
          sampleEvent('evt-0004', 30),
        ]),
      );
      assert.deepEqual(
        value(await s.read('anr', { after: stamp(20) })).map(e => e.id),
        ['evt-0004'],
      );
      assert.deepEqual(
        value(await s.read('anr', { after: stamp(5) })).map(e => e.id),
        ['evt-0001', 'evt-0002', 'evt-0003', 'evt-0004'],
      );
    });

    test('a snapshot survives later events and is dropped by an event at or before what it folded', async () => {
      const s = await make({});
      value(await s.append('anr', [sampleEvent('evt-0001', 10), sampleEvent('evt-0005', 50)]));
      value(await s.putSnapshot('anr', { upTo: { hlc: stamp(50), id: 'evt-0005' }, value: { n: 2 } }));
      value(await s.append('anr', [sampleEvent('evt-0006', 60)]));
      assert.deepEqual(value(await s.getSnapshot('anr'))?.value, { n: 2 }, 'a later event leaves it');
      value(await s.append('anr', [sampleEvent('evt-0005', 50)]));
      assert.ok(value(await s.getSnapshot('anr')), 'a duplicate adds nothing, so it stays too');
      value(await s.append('anr', [sampleEvent('evt-0003', 30)]));
      assert.equal(value(await s.getSnapshot('anr')), undefined, 'an earlier event (another device, later) drops it');
    });

    test('meta values, and clear removes one account only', async () => {
      const s = await make({});
      value(await s.putMeta('anr', 'migrated', { at: 1 }));
      value(await s.putMeta('maria', 'migrated', { at: 2 }));
      value(await s.append('anr', [sampleEvent('evt-0001', 10)]));
      value(await s.append('maria', [sampleEvent('evt-0001', 10, 'maria')]));
      value(await s.putSnapshot('anr', { upTo: { hlc: stamp(10), id: 'evt-0001' }, value: 1 }));
      assert.deepEqual(value(await s.getMeta('anr', 'migrated')), { at: 1 });
      value(await s.clear('anr'));
      assert.equal(value(await s.getMeta('anr', 'migrated')), undefined);
      assert.equal(value(await s.read('anr')).length, 0);
      assert.equal(value(await s.getSnapshot('anr')), undefined);
      assert.equal(value(await s.known('anr', ['evt-0001'])).size, 0);
      assert.equal(value(await s.read('maria')).length, 1, 'the other account keeps everything');
      assert.deepEqual(value(await s.getMeta('maria', 'migrated')), { at: 2 });
    });

    test('an event of another account, or a bad account name, is refused', async () => {
      const s = await make({});
      const r = await s.append('anr', [sampleEvent('evt-0001', 10, 'maria')]);
      assert.ok(!r.ok && r.error.code === 'events.invalid');
      const r2 = await s.read('bad|name');
      assert.ok(!r2.ok && r2.error.code === 'events.invalid');
      assert.equal(value(await s.read('anr')).length, 0);
    });

    test('a full storage: storage.quota, the storage-full signal, and nothing of the batch is kept', async () => {
      const s = await make({ quota: 5 });
      const seen: StorageFullEvent[] = [];
      const off = s.onFull(e => seen.push(e));
      value(await s.append('anr', [sampleEvent('evt-0001', 10), sampleEvent('evt-0002', 20)])); // 4 documents
      const r = await s.append('anr', [sampleEvent('evt-0003', 30), sampleEvent('evt-0004', 40)]);
      assert.ok(!r.ok && r.error.code === 'storage.quota', 'full');
      assert.equal(seen.length, 1, 'the signal is raised');
      assert.deepEqual(
        value(await s.read('anr')).map(e => e.id),
        ['evt-0001', 'evt-0002'],
        'all or nothing',
      );
      assert.equal(value(await s.known('anr', ['evt-0003'])).size, 0);
      off();
    });
  });
}
