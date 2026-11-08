/** A Lifecycle driven by hand (tests): show / hide the page, go on line, touch it, leave it. */
import type { Unsubscribe } from '../../ports/common.ts';
import type { DeviceDescription, Lifecycle } from '../../ports/lifecycle.ts';

export interface ManualLifecycle extends Lifecycle {
  setVisible(visible: boolean): void;
  setOnline(online: boolean): void;
  touch(): void;
  leave(): void;
}

export function manualLifecycle(o: { readonly tab?: string; readonly device?: DeviceDescription } = {}): ManualLifecycle {
  let shown = true,
    net = true;
  const sets = {
    vis: new Set<(v: boolean) => void>(),
    online: new Set<() => void>(),
    leave: new Set<() => void>(),
    input: new Set<() => void>(),
  };
  const add = <T>(s: Set<T>, l: T): Unsubscribe => {
    s.add(l);
    return () => {
      s.delete(l);
    };
  };
  return {
    visible: () => shown,
    online: () => net,
    onVisibility: l => add(sets.vis, l),
    onOnline: l => add(sets.online, l),
    onLeave: l => add(sets.leave, l),
    onInput: l => add(sets.input, l),
    device: () => o.device ?? { os: 'linux', browser: 'Firefox' },
    tabId: () => o.tab ?? 'tab1',
    setVisible(v) {
      if (v === shown) return;
      shown = v;
      for (const l of [...sets.vis]) l(v);
      if (!v) for (const l of [...sets.leave]) l();
    },
    setOnline(v) {
      net = v;
      if (v) for (const l of [...sets.online]) l();
    },
    touch() {
      for (const l of [...sets.input]) l();
    },
    leave() {
      for (const l of [...sets.leave]) l();
    },
  };
}
