/// <reference types="node" />
/**
 * The Notifier contract. `make()` gives a notifier, what is on screen now (`onScreen`: the texts of the visible
 * messages), what the live region announced (`announced`, after `settle()`), and `now` it reads the time from.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Notifier, OverflowNotice } from '../notifier.ts';

export interface NotifierHarness {
  readonly notifier: Notifier;
  onScreen(): string[];
  announced(): string[];
  /** Lets pending timers of the surface run (the live region's short delay). */
  settle(): Promise<void>;
  /** Moves the harness's time (the burst window). */
  advance(ms: number): void;
}

export function notifierContract(name: string, make: () => NotifierHarness): void {
  describe(`Notifier contract: ${name}`, () => {
    test('a toast shows its text', () => {
      const h = make();
      h.notifier.toast('Saved');
      assert.deepEqual(h.onScreen(), ['Saved']);
    });

    test('two notices show; a third moves all three to the overflow (the bell), and none stays on screen', () => {
      const h = make();
      const over: Array<readonly OverflowNotice[]> = [];
      h.notifier.onOverflow(n => over.push(n));
      h.notifier.notice('Step A ready');
      h.notifier.notice('Step B ready');
      assert.deepEqual(h.onScreen(), ['Step A ready', 'Step B ready']);
      h.notifier.notice('Step C ready');
      assert.deepEqual(h.onScreen(), []);
      assert.equal(over.length, 1);
      assert.deepEqual(
        over[0]?.map(n => n.text),
        ['Step A ready', 'Step B ready', 'Step C ready'],
      );
      h.notifier.notice('Step D ready');
      assert.deepEqual(h.onScreen(), [], 'the rest of a burst goes to the bell too');
      assert.deepEqual(
        over[1]?.map(n => n.text),
        ['Step D ready'],
      );
      h.advance(60_000);
      h.notifier.notice('Later news');
      assert.deepEqual(h.onScreen(), ['Later news'], 'after a quiet while, toasts again');
    });

    test('an alert is shown AND announced; the same alert is announced again', async () => {
      const h = make();
      h.notifier.alert('⚠️ The storage is full');
      await h.settle();
      assert.ok(h.onScreen().includes('⚠️ The storage is full'));
      assert.deepEqual(h.announced(), ['⚠️ The storage is full']);
      h.notifier.alert('⚠️ The storage is full');
      await h.settle();
      assert.equal(h.announced().length, 2);
    });
  });
}
