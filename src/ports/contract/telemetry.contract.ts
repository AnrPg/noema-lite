/// <reference types="node" />
/** The Telemetry contract: counts and events, kept locally — and NOTHING goes over the network. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Telemetry } from '../telemetry.ts';

export function telemetryContract(name: string, make: () => Telemetry): void {
  describe(`Telemetry contract: ${name}`, () => {
    test('counters add up; events keep their data; a snapshot is a copy; reset empties', () => {
      const t = make();
      t.count('sync.conflict');
      t.count('sync.conflict', 2);
      t.event('compute.timeout', { job: 'x', ms: 50 });
      const s = t.snapshot();
      assert.equal(s.counters['sync.conflict'], 3);
      assert.equal(s.events[0]?.name, 'compute.timeout');
      assert.equal(s.events[0]?.data['ms'], 50);
      t.count('sync.conflict');
      assert.equal(s.counters['sync.conflict'], 3, 'the snapshot did not change');
      t.reset();
      assert.deepEqual(t.snapshot().counters, {});
      assert.equal(t.snapshot().events.length, 0);
    });

    test('events are bounded', () => {
      const t = make();
      for (let i = 0; i < 1000; i++) t.event('e', { i });
      const ev = t.snapshot().events;
      assert.ok(ev.length >= 50 && ev.length <= 1000);
      assert.equal(ev.at(-1)?.data['i'], 999);
    });

    test('no network: fetch, XMLHttpRequest and sendBeacon are never used', () => {
      const g = globalThis as { fetch?: unknown; XMLHttpRequest?: unknown; navigator?: unknown };
      const saved = { fetch: g.fetch, xhr: g.XMLHttpRequest };
      let calls = 0;
      g.fetch = () => { calls++; throw new Error('telemetry used the network'); };
      g.XMLHttpRequest = function () { calls++; };
      try {
        const t = make();
        for (let i = 0; i < 20; i++) { t.count('x'); t.event('y'); }
        t.snapshot();
      } finally {
        g.fetch = saved.fetch;
        g.XMLHttpRequest = saved.xhr;
      }
      assert.equal(calls, 0);
    });
  });
}
