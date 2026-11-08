/**
 * The browser's Lifecycle: document.visibilityState and visibilitychange, pagehide, online, the learner's input (pointer,
 * keys, wheel, touch; passive listeners in the capture phase), the user agent's device and browser, and a tab id kept in
 * sessionStorage. Platform objects are looked up on first use (the root also loads in a bare vm and a Worker).
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { DeviceDescription, DeviceKind, Lifecycle } from '../../ports/lifecycle.ts';

/** What the adapter uses of the page (the real window, or a fake in tests). */
export interface PageLike {
  readonly document?: {
    readonly visibilityState?: string;
    addEventListener(type: string, f: () => void, o?: unknown): void;
    removeEventListener(type: string, f: () => void, o?: unknown): void;
  };
  readonly navigator?: { readonly onLine?: boolean; readonly userAgent?: string; readonly maxTouchPoints?: number };
  readonly sessionStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  addEventListener?(type: string, f: () => void, o?: unknown): void;
  removeEventListener?(type: string, f: () => void, o?: unknown): void;
}

export const TAB_KEY = 'noema:tab';
const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** The device of a user agent (a code each screen names in its own language) and its browser. */
export function describeAgent(ua: string, maxTouchPoints = 0): DeviceDescription {
  const os: DeviceKind = /iPhone/.test(ua)
    ? 'iphone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
      ? 'ipad'
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? 'android_phone'
          : 'android_tablet'
        : /CrOS/.test(ua)
          ? 'chromebook'
          : /Mac/.test(ua)
            ? 'mac'
            : /Windows/.test(ua)
              ? 'windows'
              : /Linux/.test(ua)
                ? 'linux'
                : 'other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '';
  return { os, browser };
}

export function browserLifecycle(page: () => PageLike = () => globalThis, random: () => string): Lifecycle {
  let tab: string | null = null;
  const on = (target: 'doc' | 'win', type: string, f: () => void, o?: unknown): Unsubscribe => {
    const p = page(),
      t = target === 'doc' ? p.document : p;
    if (!t?.addEventListener) return () => undefined; // no page (a Worker, a test context): nothing ever happens
    t.addEventListener(type, f, o);
    return () => t.removeEventListener?.(type, f, o);
  };
  const visible = (): boolean => (page().document?.visibilityState ?? 'visible') === 'visible';
  return {
    visible,
    online: () => page().navigator?.onLine !== false,
    onVisibility(l) {
      return on('doc', 'visibilitychange', () => {
        l(visible());
      });
    },
    onOnline(l) {
      return on('win', 'online', l);
    },
    onLeave(l) {
      const hidden = (): void => {
        if (!visible()) l();
      };
      const offA = on('doc', 'visibilitychange', hidden),
        offB = on('win', 'pagehide', l);
      return () => {
        offA();
        offB();
      };
    },
    onInput(l) {
      const offs = INPUTS.map(t => on('win', t, l, { capture: true, passive: true }));
      return () => {
        for (const off of offs) off();
      };
    },
    device() {
      const n = page().navigator;
      return describeAgent(n?.userAgent ?? '', n?.maxTouchPoints ?? 0);
    },
    tabId() {
      if (tab) return tab;
      const ss = page().sessionStorage;
      try {
        tab = ss?.getItem(TAB_KEY) ?? null;
        if (!tab) {
          tab = random();
          ss?.setItem(TAB_KEY, tab);
        }
      } catch {
        // no sessionStorage (blocked site data): this tab gets an id for this page only, a reload is a new tab
        tab = tab ?? random();
      }
      return tab;
    },
  };
}
