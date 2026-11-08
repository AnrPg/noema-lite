/**
 * NoemaShell.area5 — the shell's door to the screens of area 5 (languages and activities, src/ui/screens/
 * languages-activities.ts). They are the lazy piece build/lang-activities.js (src/composition/pieces.ts): it runs on the
 * first language page, on build/ui.js's own Lit and kit (src/composition/ui-shared.ts), and hands back its mount function.
 *
 *   await NoemaShell.area5.mount('#/lang', host, { account, go, createCourse })
 *     → { crumbs: [{ label, href? }], back?, tab? } (what the frame shows around it), or null when no screen has that address
 *   await NoemaShell.area5.part('lang-strip', host, { course }, options)   a part of a page (the strip of languages)
 *   await NoemaShell.area5.load()   the piece is on the page (the course runtime waits for it before it draws)
 *   NoemaShell.area5.now()  → the same mount and part, synchronous, once the piece is on the page (else null)
 */
import type { ScreenChrome, ScreenContext, ScreensApi } from './lang-activities-root.ts';
import { AREA5_PIECE_KEY, pieceLoader, type PieceHost } from './pieces.ts';
import { UI_SHARED, UI_SHARED_KEY } from './ui-shared.ts';

export interface Area5Door {
  load(): Promise<void>;
  now(): ScreensApi | null;
  has(hash: string): boolean;
  mount(hash: string, host: HTMLElement, ctx: ScreenContext): Promise<ScreenChrome | null>;
  part(name: string, host: HTMLElement, ctx: ScreenContext, options?: object): Promise<boolean>;
}

/** The door over a page; `script` is build/ui.js's own address (the piece is next to it). */
export function area5Door(page: PieceHost, script: string | undefined): Area5Door {
  (globalThis as Record<string, unknown>)[UI_SHARED_KEY] ??= UI_SHARED;
  const load = pieceLoader<ScreensApi>(page, script, 'lang-activities', AREA5_PIECE_KEY);
  let api: ScreensApi | null = null;
  const ready = async (): Promise<ScreensApi> => (api ??= await load());
  return Object.freeze({
    load: async (): Promise<void> => {
      await ready();
    },
    now: (): ScreensApi | null => api,
    has: (hash: string): boolean => (api ? api.has(hash) : /^#\/lang(?:[/?]|$)/.test(hash)),
    mount: async (hash: string, host: HTMLElement, ctx: ScreenContext): Promise<ScreenChrome | null> =>
      (await ready()).mount(hash, host, ctx),
    part: async (name: string, host: HTMLElement, ctx: ScreenContext, options?: object): Promise<boolean> =>
      (await ready()).part(name, host, ctx, options),
  });
}
