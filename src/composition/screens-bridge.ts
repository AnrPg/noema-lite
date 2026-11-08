/**
 * NoemaCore.screens — how the older shell (engine/shell.js, engine/loader.js, engine.js) mounts the new screens of area 5
 * (languages and activities, src/ui/screens/languages-activities.ts) while it still runs. The screens are not in
 * build/app.js: they are the bundle build/lang-activities.js (Lit, the kit, the screens), loaded on the first mount, which
 * hands its mount function back with register(). In the one-file bundle that script is inline and registers at once.
 *
 *   await NoemaCore.screens.mount('#/engines', hostElement, { account, subject, runtimes })
 *     → { crumbs: [{ label, href? }], back?, tab? } (what the frame shows around it), or null when no screen has that address
 *   await NoemaCore.screens.part('lang-strip', hostElement, { course }, options)   a part of a page (the strip of languages)
 *   NoemaCore.screens.now()  → the same mount and part, synchronous, once the bundle is on the page (else null)
 *   NoemaCore.screens.has('#/engines')  → true when area 5 has a screen for the address (no loading)
 *
 * When the new root owns the router (phase 3, the shell), it imports the route file itself and this extension goes with
 * the bridge.
 */
import { NoemaError } from '../kernel/errors.ts';
import type { BridgeExtension } from './bridge.ts';

/** What the older page knows and the screens need: the profile, the open subject, which runtimes the page can mount. */
export interface ScreenContext {
  /** the profile: its id and kind (local profiles keep their requests on this device) */
  readonly account: { readonly id?: string | null; readonly kind?: string } | null;
  readonly subject?: string | null;
  /** does this page run that runtime or engine (the activity core of the open subject: ACT.runtime / ACT.engines) */
  readonly runs?: (id: string, runtime: string | null) => boolean;
  /** the open subject's title (the author's crumbs) */
  readonly subjectTitle?: string | null;
  /** the open language course's port (engine/lang/14_screens.js: src/ui/screens/languages/course-port.ts) */
  readonly course?: unknown;
  /** opens an address of the app (the shell's router; else the address bar) */
  readonly go?: (hash: string) => void;
  /** + New language course (through Claude: the course runtime's dialog) */
  readonly createCourse?: () => void;
}
export interface ScreenChrome {
  readonly crumbs: readonly { readonly label: string; readonly href?: string }[];
  readonly back?: string;
  readonly tab?: string;
}
/** What the screens' bundle registers. */
export interface ScreensApi {
  has(hash: string): boolean;
  mount(hash: string, host: HTMLElement, ctx: ScreenContext): ScreenChrome | null;
  /** a part of a page that is not a page itself (the strip of languages); false when there is no such part */
  part(name: string, host: HTMLElement, ctx: ScreenContext, options?: object): boolean;
}

/** the address of the screens' bundle: next to build/app.js (the script that is running while the bridge is built) */
function bundleUrl(): string | null {
  const doc = (globalThis as { document?: Document }).document;
  const cur = doc?.currentScript as { readonly src?: unknown } | null | undefined;
  const src = typeof cur?.src === 'string' ? cur.src : '';
  if (src && /\/app\.js(\?.*)?$/.test(src)) return src.replace(/\/app\.js(\?.*)?$/, '/lang-activities.js$1');
  return typeof doc?.baseURI === 'string' && doc.baseURI ? new URL('build/lang-activities.js', doc.baseURI).href : null;
}

export const screensBridge: BridgeExtension = {
  name: 'screens',
  build: () => {
    const url = bundleUrl();
    let api: ScreensApi | null = null,
      loading: Promise<ScreensApi> | null = null;
    const waiting: ((a: ScreensApi) => void)[] = [];
    const load = (): Promise<ScreensApi> => {
      if (api) return Promise.resolve(api);
      loading ??= new Promise<ScreensApi>((resolve, reject) => {
        waiting.push(resolve);
        const doc = (globalThis as { document?: Document }).document;
        if (!doc || !url || (globalThis as { NOEMA_BUNDLE?: boolean }).NOEMA_BUNDLE) {
          reject(new NoemaError('ui.unavailable', 'the screens of languages and activities are not in this page'));
          return;
        }
        const s = doc.createElement('script');
        s.src = url;
        s.onerror = () => {
          loading = null;
          reject(new NoemaError('ui.unavailable', 'build/lang-activities.js did not load'));
        };
        doc.head.append(s);
      });
      return loading;
    };
    return Object.freeze({
      /** the screens' bundle hands its mount function over (once) */
      register(a: ScreensApi): void {
        api = a;
        for (const f of waiting.splice(0)) f(a);
      },
      load: async (): Promise<void> => {
        await load();
      },
      has: (hash: string): boolean => (api ? api.has(hash) : false),
      mount: async (hash: string, host: HTMLElement, ctx: ScreenContext): Promise<ScreenChrome | null> =>
        (await load()).mount(hash, host, ctx),
      part: async (name: string, host: HTMLElement, ctx: ScreenContext, options?: object): Promise<boolean> =>
        (await load()).part(name, host, ctx, options),
      /** the mount function when the screens' bundle is already on the page (a synchronous draw), else null */
      now: (): ScreensApi | null => api,
    });
  },
};
