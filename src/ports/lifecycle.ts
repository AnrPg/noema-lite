/**
 * Lifecycle port: what the sync loop and the "one device at a time" lease must know about the page they run in
 * (docs/SYNC.md): whether the learner can see it, whether the device thinks it is online, when it is being left, when the
 * learner touches it, and which device and tab this is.
 *
 * The browser adapter listens to visibilitychange, pagehide, online and the learner's input (pointer, keys, wheel,
 * touch); the memory adapter is driven by hand in tests.
 */
import type { Unsubscribe } from './common.ts';

/** The kind of device, as a code (each screen shows it in its own language: loader.inuse.device). */
export type DeviceKind = 'iphone' | 'ipad' | 'android_phone' | 'android_tablet' | 'chromebook' | 'mac' | 'windows' | 'linux' | 'other';

export interface DeviceDescription {
  readonly os: DeviceKind;
  /** The browser's own name (Chrome, Safari…), or '' when unknown. */
  readonly browser: string;
}

export interface Lifecycle {
  /** The learner can see the page now. */
  visible(): boolean;
  /** The device believes it has a network (a "false" is reliable, a "true" is a hope). */
  online(): boolean;
  onVisibility(listener: (visible: boolean) => void): Unsubscribe;
  onOnline(listener: () => void): Unsubscribe;
  /** The page is being hidden or closed: the last moment to send what waits (keepalive requests). */
  onLeave(listener: () => void): Unsubscribe;
  /** The learner touched the page (pointer, key, wheel, touch). */
  onInput(listener: () => void): Unsubscribe;
  /** This device's kind and browser. */
  device(): DeviceDescription;
  /** An id of this tab, kept across its reloads (a new tab gets a new one). */
  tabId(): string;
}
