/**
 * THE COMMUNITY SCREENS' ROUTES — the one file of area 4's route entries (docs/UI_MAP.md): every community address, the
 * element that draws it, and the deps it is handed. Loaded on first use by community-app.ts (Lit and the UI kit come with
 * it); the older frame (engine/shell.js) and the phase-3 frame both mount through `mount`.
 *
 *   #/search?…                      the search page                       (src/features/search/ui)
 *   #/admin/reports[/<id>][?f=…]   the ⚑ reports, for the app's admins   (src/features/reports/ui)
 *   (no address)                    🔎 the quick sheet · ⚑ the report dialog
 */
import type { ScreenChrome } from '../features/community/ui/host.ts';
import { CHROME_EVENT, type CommunityScreen } from '../features/community/ui/screen.ts';
import type { Here } from '../features/search/domain/params.ts';
import { NoemaReportAdmin } from '../features/reports/ui/admin.ts';
import { openReport } from '../features/reports/ui/dialog.ts';
import { NoemaSearchPage } from '../features/search/ui/page.ts';
import { NoemaSearchQuick, quickSearch, type SearchScreenDeps } from '../features/search/ui/quick.ts';
import { provideServices, requestServices } from '../ui/core/services.ts';
import { defineUi } from '../ui/index.ts';
import { defineRoutes, type RouteMatch } from '../ui/router/routes.ts';
import type { CommunityApp } from './community-app.ts';
import { CLOCK } from './tokens.ts';

export const COMMUNITY_ROUTES = defineRoutes({
  search: '/search',
  reports: '/admin/reports/:id?',
});
type R = typeof COMMUNITY_ROUTES.table;
type Match = RouteMatch<R>;

/** the community's own elements and their tags */
export const COMMUNITY_ELEMENTS = {
  'noema-search-page': NoemaSearchPage,
  'noema-search-quick': NoemaSearchQuick,
  'noema-report-admin': NoemaReportAdmin,
} as const;

export interface CommunityScreens {
  has(hash: string): boolean;
  mount(el: HTMLElement, hash: string, onChrome: (c: ScreenChrome) => void): HTMLElement | null;
  quickSearch(here: Here | null): void;
  openReport(): void;
}

let made: CommunityScreens | null = null;

export function communityScreens(app: CommunityApp, win: Window): CommunityScreens {
  if (made) return made;
  defineUi(win.customElements);
  for (const [tag, ctor] of Object.entries(COMMUNITY_ELEMENTS)) if (!win.customElements.get(tag)) win.customElements.define(tag, ctor);
  // the kit's services for every element in the page (the phase-3 root provides its own: then this one is not needed)
  if (!requestServices(win.document.body))
    provideServices(win.document.body, {
      i18n: app.i18n,
      clock: app.r.get(CLOCK),
      locales: { list: () => [{ tag: app.i18n.locale(), name: app.i18n.locale(), dir: app.i18n.dir() }], use: tag => Promise.resolve(tag) },
    });
  const searchDeps: SearchScreenDeps = { ...app.search.d, ui: app.search };

  /** the element of a matched address, with its deps */
  const screenOf = (m: Match): CommunityScreen | null => {
    const doc = win.document;
    switch (m.name) {
      case 'search': {
        const el = doc.createElement('noema-search-page');
        el.deps = searchDeps;
        return el;
      }
      case 'reports': {
        const el = doc.createElement('noema-report-admin');
        el.deps = app.reports;
        el.reportId = m.params.id ?? '';
        return el;
      }
    }
  };

  made = {
    has: hash => COMMUNITY_ROUTES.match(hash) !== null,
    mount: (el, hash, onChrome) => {
      const m = COMMUNITY_ROUTES.match(hash);
      if (!m) return null;
      const screen = screenOf(m);
      if (!screen) return null;
      screen.addEventListener(CHROME_EVENT, e => {
        onChrome((e as CustomEvent<ScreenChrome>).detail);
      });
      screen.shownHash = hash;
      el.replaceChildren(screen);
      onChrome(screen.screenChrome()); // at once: the frame never shows the page without its ⋮
      return screen;
    },
    quickSearch: here => {
      quickSearch(searchDeps, here, k => app.i18n.t(k));
    },
    openReport: () => {
      void openReport(app.reports);
    },
  };
  return made;
}
