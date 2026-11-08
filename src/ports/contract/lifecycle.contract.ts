/// <reference types="node" />
/**
 * The Lifecycle contract. `make()` gives a lifecycle and the means to act on its page: hide / show it, go on line, touch it,
 * close it (pagehide).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Lifecycle } from '../lifecycle.ts';

export interface LifecycleHarness {
  readonly lifecycle: Lifecycle;
  setVisible(visible: boolean): void;
  goOnline(): void;
  touch(): void;
  close(): void;
}

export function lifecycleContract(name: string, make: () => LifecycleHarness): void {
  describe(`Lifecycle contract: ${name}`, () => {
    test('visibility and its events; hiding the page is leaving it', () => {
      const h = make();
      const seen: boolean[] = [];
      let left = 0;
      const off = h.lifecycle.onVisibility(v => seen.push(v));
      h.lifecycle.onLeave(() => left++);
      assert.equal(h.lifecycle.visible(), true);
      h.setVisible(false);
      assert.equal(h.lifecycle.visible(), false);
      h.setVisible(true);
      off();
      h.setVisible(false);
      assert.deepEqual(seen, [false, true]);
      assert.equal(left, 2, 'hidden twice');
      h.close();
      assert.equal(left, 3, 'closing is leaving');
    });

    test('online and input events; an unsubscribed listener hears nothing', () => {
      const h = make();
      let online = 0,
        input = 0;
      h.lifecycle.onOnline(() => online++);
      const off = h.lifecycle.onInput(() => input++);
      h.goOnline();
      h.touch();
      off();
      h.touch();
      assert.deepEqual([online, input, h.lifecycle.online()], [1, 1, true]);
    });

    test('the device and a tab id that stays the same', () => {
      const h = make();
      const d = h.lifecycle.device();
      assert.ok(d.os.length > 0 && typeof d.browser === 'string');
      assert.ok(h.lifecycle.tabId().length > 0);
      assert.equal(h.lifecycle.tabId(), h.lifecycle.tabId());
    });
  });
}
