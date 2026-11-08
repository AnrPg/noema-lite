/// <reference types="node" />
/**
 * The Clock contract. `make()` gives a clock and `pass(ms)`, which lets ms of its time go by (a manual clock moves; the
 * system clock really waits). `dayChange`, when given, moves the clock past the next local midnight.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, isLocalDay } from '../../kernel/day.ts';
import type { Clock } from '../clock.ts';

export interface ClockHarness {
  readonly clock: Clock;
  pass(ms: number): Promise<void>;
  dayChange?(): Promise<void>;
}

export function clockContract(name: string, make: () => ClockHarness): void {
  describe(`Clock contract: ${name}`, () => {
    test('now, today (the local day of now), time zone', () => {
      const { clock } = make();
      const t = clock.now();
      assert.ok(Number.isFinite(t) && t > Date.UTC(2020, 0, 1));
      assert.ok(isLocalDay(clock.today()));
      assert.equal(clock.today(), dayOf(clock.now()));
      assert.ok(clock.timeZone().length > 0);
    });

    test('time never goes back while it passes', async () => {
      const h = make();
      const a = h.clock.now();
      await h.pass(5);
      assert.ok(h.clock.now() >= a + 5 - 1);
    });

    test('setTimeout fires once; clearTimeout stops it', async () => {
      const h = make();
      let fired = 0,
        cleared = 0;
      h.clock.setTimeout(() => {
        fired++;
      }, 10);
      const x = h.clock.setTimeout(() => {
        cleared++;
      }, 10);
      h.clock.clearTimeout(x);
      await h.pass(40);
      assert.equal(fired, 1);
      assert.equal(cleared, 0);
    });

    test('setInterval repeats until cleared', async () => {
      const h = make();
      let n = 0;
      const i = h.clock.setInterval(() => {
        n++;
      }, 10);
      // the clock's own time, step by step until it fired three times: under load the system clock's timers run late, so a
      // fixed window of wall time could see fewer (the bound is generous: 2 s)
      for (let waited = 0; n < 3 && waited < 2000; waited += 10) await h.pass(10);
      h.clock.clearInterval(i);
      const seen = n;
      await h.pass(40);
      assert.ok(seen >= 3, `fired ${seen}`);
      assert.equal(n, seen, 'nothing after clearInterval');
    });

    test('sleep resolves; an aborted sleep rejects with the reason', async () => {
      const h = make();
      let done = false;
      const p = h.clock.sleep(10).then(() => {
        done = true;
      });
      await h.pass(30);
      await p;
      assert.ok(done);
      const ac = new AbortController();
      const q = h.clock.sleep(10_000, ac.signal);
      ac.abort(new Error('stop'));
      await assert.rejects(q, /stop/);
    });

    test('onDayChange tells the new day; unsubscribing stops it', async t => {
      const h = make();
      if (!h.dayChange) {
        t.skip('this clock cannot be moved to the next day');
        return;
      }
      const days: string[] = [];
      const off = h.clock.onDayChange(d => days.push(d));
      const before = h.clock.today();
      await h.dayChange();
      assert.equal(days.length, 1);
      assert.notEqual(days[0], before);
      off();
      await h.dayChange();
      assert.equal(days.length, 1);
    });
  });
}
