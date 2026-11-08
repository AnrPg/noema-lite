/**
 * NoemaCore.community — the community screens on the phase bridge (docs/ARCHITECTURE.md §6.3). The older frame
 * (engine/shell.js) and the engine use them through this one name:
 *
 *   community.mount(el, hash, onChrome)  draws the screen of a community address into el (→ the element, or null when the
 *                                        address is not one of them); onChrome(chrome) whenever its tab, crumbs, ← or ⋮ change
 *   community.search                     quick(here) · hereNow() · index() · collections() · round() · after() · goStep(i)
 *
 * What runs without the screens (the search's model, the practice round the engine asks for, the index warmed after a
 * start) is here; the screens themselves (Lit and the UI kit: community-ui.ts) load the first time one is shown, so a
 * page that never shows them pays nothing and app.js runs without a DOM (the unit tests, Node).
 */
import { browserStorage } from '../adapters/browser/storage.ts';
import type { CatalogIndex, IndexSource } from '../features/catalog/application/index-store.ts';
import type { CommunityHost, ScreenChrome } from '../features/community/ui/host.ts';
import { searchService } from '../features/search/application/search.ts';
import type { Here } from '../features/search/domain/params.ts';
import { SearchUi, type SearchDeps } from '../features/search/ui/model.ts';
import type { I18n } from '../ports/i18n.ts';
import type { Notifier } from '../ports/notifier.ts';
import type { BridgeExtension } from './bridge.ts';
import type * as ScreensModule from './community-ui.ts';
import type { Resolver } from './container.ts';
import { oldAppHost } from './community-host.ts';
import { oldAppReportContext, oldAppShare } from './community-old.ts';
import { catalogBridge } from './study.ts';
import { CLOCK, I18N, NOTIFIER, STORAGE } from './tokens.ts';

/** What every screen is handed (community-ui.ts builds the screens' deps from it). */
export interface CommunityApp {
  readonly r: Resolver;
  readonly host: CommunityHost;
  readonly notify: Notifier;
  readonly i18n: I18n;
  readonly search: SearchUi;
}

type OpenIndex = (account: string, sources: () => Promise<readonly IndexSource[]>) => CatalogIndex;

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function communityApp(r: Resolver, win: Window & typeof globalThis): CommunityApp {
  const host = oldAppHost(win as never, { report: oldAppReportContext(win), share: oldAppShare(win) });
  const i18n = r.get(I18N),
    notify = r.get(NOTIFIER);
  const searchDeps: SearchDeps = {
    host,
    notify,
    search: searchService({ i18n }),
    openIndex: (catalogBridge(r) as { readonly index: OpenIndex }).index,
    device: r.get(STORAGE).kv,
    // this tab only: the same adapter over sessionStorage
    tab: browserStorage({ localStorage: () => win.sessionStorage }).kv,
    now: () => r.get(CLOCK).now(),
    newId,
  };
  return { r, host, notify, i18n, search: new SearchUi(searchDeps, () => i18n) };
}

/** the screens, loaded once */
type Screens = typeof ScreensModule;
let screens: Promise<Screens> | null = null,
  loaded: Screens | null = null;
const loadScreens = (): Promise<Screens> =>
  (screens ??= import('./community-ui.ts').then(m => {
    loaded = m;
    return m;
  }));

export function communityBridge(r: Resolver): unknown {
  const win = globalThis as Window & typeof globalThis;
  let app: CommunityApp | null = null;
  const A = (): CommunityApp => (app ??= communityApp(r, win));
  const ui = async (): Promise<ReturnType<Screens['communityScreens']>> => (await loadScreens()).communityScreens(A(), win);
  /** once the screens are loaded, a screen is mounted in the same task (the frame never shows a page half drawn) */
  const now = (): ReturnType<Screens['communityScreens']> | null => (loaded ? loaded.communityScreens(A(), win) : null);
  if (typeof win.addEventListener === 'function')
    win.addEventListener('load', () => {
      // warm the index a little after start when the learner has searched on this device before
      win.setTimeout(() => {
        A().search.warmIfUsed();
      }, 8000);
    });
  return Object.freeze({
    /** is this address one of the community screens */
    has: async (hash: string): Promise<boolean> => (await ui()).has(hash),
    mount: (el: HTMLElement, hash: string, onChrome: (c: ScreenChrome) => void): Promise<HTMLElement | null> => {
      const s = now();
      return s ? Promise.resolve(s.mount(el, hash, onChrome)) : ui().then(x => x.mount(el, hash, onChrome));
    },
    search: Object.freeze({
      quick: async (here: Here | null) => {
        (await ui()).quickSearch(here);
      },
      hereNow: () => A().search.hereNow(),
      index: () => A().search.index(),
      collections: () => A().search.collections(),
      round: () => A().search.round(),
      after: () => A().search.after(),
      goStep: (i: number) => {
        A().search.goStep(i);
      },
    }),
  });
}

export const COMMUNITY_APP_BRIDGE: readonly BridgeExtension[] = [{ name: 'community', build: communityBridge }];
