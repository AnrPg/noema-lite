/**
 * The router: the current route of a route table (routes.ts) over a HashLocation, and moving between routes. The page's
 * address stays the source of truth (a link, the browser's back button and a typed address all work the same way);
 * listeners hear every change, including an address no route names (`null`: the app's "not found" or another app).
 *
 *   const router = createRouter(routes, browserHash());
 *   router.subscribe(m => draw(m));                 // called now and on every change
 *   router.navigate(routes.href('chapter', { id: 'ch2' }));                     // pushes '#/ch/ch2' (typed by href)
 *   router.navigate(routes.href('search', {}, { q: 'ohm' }), { replace: true });
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { RouteMatch, RouteTable, Routes } from './routes.ts';

/** Where the hash lives: the browser's address (browserHash) or a memory one (tests). */
export interface HashLocation {
  get(): string;
  set(hash: string, options: { readonly replace: boolean }): void;
  /** Called after the hash changed (by set, a link, the back button). */
  onChange(listener: () => void): Unsubscribe;
}

export interface Router<R extends RouteTable> {
  readonly routes: Routes<R>;
  current(): RouteMatch<R> | null;
  /** Calls the listener now and after every change of the address. */
  subscribe(listener: (m: RouteMatch<R> | null) => void): Unsubscribe;
  /** Goes to an address ('#/…'). */
  navigate(href: string, options?: { readonly replace?: boolean }): void;
  dispose(): void;
}

export function createRouter<const R extends RouteTable>(routes: Routes<R>, location: HashLocation): Router<R> {
  const listeners = new Set<(m: RouteMatch<R> | null) => void>();
  let now = routes.match(location.get());
  const stop = location.onChange(() => {
    now = routes.match(location.get());
    for (const l of [...listeners]) l(now);
  });
  return {
    routes,
    current: () => now,
    subscribe(listener) {
      listeners.add(listener);
      listener(now);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(href, options) {
      if (href === location.get()) return;
      location.set(href, { replace: options?.replace === true });
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}

/** The browser's address bar (a `hashchange` per change; replace keeps the history entry). */
export function browserHash(win: Window = window): HashLocation {
  return {
    get: () => win.location.hash,
    set(hash, { replace }) {
      if (replace) {
        win.history.replaceState(win.history.state, '', hash);
        win.dispatchEvent(new HashChangeEvent('hashchange'));
      } else win.location.hash = hash;
    },
    onChange(listener) {
      win.addEventListener('hashchange', listener);
      return () => {
        win.removeEventListener('hashchange', listener);
      };
    },
  };
}

/** A hash in memory with a history (tests): `back()` goes to the previous address. */
export function memoryHash(start = '#/'): HashLocation & { back(): void; readonly history: readonly string[] } {
  const stack = [start];
  const listeners = new Set<() => void>();
  const fire = (): void => {
    for (const l of [...listeners]) l();
  };
  return {
    get: () => stack.at(-1) ?? '',
    set(hash, { replace }) {
      if (replace) stack[stack.length - 1] = hash;
      else stack.push(hash);
      fire();
    },
    back() {
      if (stack.length > 1) {
        stack.pop();
        fire();
      }
    },
    get history() {
      return [...stack];
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
