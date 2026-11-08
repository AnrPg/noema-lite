/**
 * The browser's Notifier: the app's toasts (one `.toasts` container at the end of <body>, a `.toast` per message — the
 * classes engine/engine.css styles) and the assertive live region `#noema-alert` (visually hidden; emptied first, so the
 * same warning is announced again). Notices are `.toast.notice` with role="status". The rules are policyNotifier's.
 */
import type { Notifier } from '../../ports/notifier.ts';
import { policyNotifier, type NotifierOptions, type NotifierSurface, type ToastKind } from '../local/notifier-policy.ts';

/** What the surface uses of the DOM (the real document, or a small fake in tests). */
export interface DocumentLike {
  readonly body: { append(node: unknown): void } | null;
  querySelector(selector: string): ElementLike | null;
  getElementById(id: string): ElementLike | null;
  createElement(tag: string): ElementLike;
}
export interface ElementLike {
  className: string;
  id: string;
  textContent: string | null;
  readonly isConnected: boolean;
  setAttribute(name: string, value: string): void;
  append(...nodes: unknown[]): void;
  remove(): void;
  readonly style: { cssText: string };
}

export const LIVE_REGION_ID = 'noema-alert';
const HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';

export interface TimersLike {
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export function domSurface(
  doc: () => DocumentLike | undefined = () => (globalThis as { document?: DocumentLike }).document,
  timers: TimersLike = {
    setTimeout: (f, ms) => globalThis.setTimeout(f, ms),
    clearTimeout: h => {
      globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>);
    },
  },
): NotifierSurface {
  const box = (d: DocumentLike): ElementLike => {
    let t = d.querySelector('.toasts');
    if (!t) {
      t = d.createElement('div');
      t.className = 'toasts';
      d.body?.append(t);
    }
    return t;
  };
  return {
    show(text: string, kind: ToastKind, ms: number) {
      const d = doc();
      if (!d?.body) return { remove() {}, isShown: () => false }; // no page to draw on (a Worker, a test context)
      const x = d.createElement('div');
      x.className = kind === 'notice' ? 'toast notice' : kind === 'alert' ? 'toast alert' : 'toast';
      if (kind === 'notice') x.setAttribute('role', 'status');
      x.textContent = text;
      box(d).append(x);
      const h = timers.setTimeout(() => {
        x.remove();
      }, ms);
      return {
        remove: () => {
          timers.clearTimeout(h);
          x.remove();
        },
        isShown: () => x.isConnected,
      };
    },
    announce(text: string) {
      const d = doc();
      if (!d?.body) return;
      let live = d.getElementById(LIVE_REGION_ID);
      if (!live) {
        live = d.createElement('div');
        live.id = LIVE_REGION_ID;
        live.setAttribute('role', 'alert');
        live.setAttribute('aria-live', 'assertive');
        live.style.cssText = HIDDEN;
        d.body.append(live);
      }
      const region = live;
      region.textContent = '';
      timers.setTimeout(() => {
        region.textContent = text;
      }, 50);
    },
  };
}

export const browserNotifier = (surface: NotifierSurface = domSurface(), options: NotifierOptions = {}): Notifier =>
  policyNotifier(surface, options);
