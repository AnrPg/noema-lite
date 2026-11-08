/**
 * THE COMMUNITY SCREENS' ROUTES — the one file of area 4's route entries (docs/UI_MAP.md): every community address, the
 * element that draws it, and the deps it is handed. Loaded on first use by community-app.ts (Lit and the UI kit come with
 * it); the older frame (engine/shell.js) and the phase-3 frame both mount through `mount`.
 *
 *   #/search?…                      the search page                       (src/features/search/ui)
 *   #/admin/reports[/<id>][?f=…]   the ⚑ reports, for the app's admins   (src/features/reports/ui)
 *   #/engines[/new]                 ⚙ engines of activities, requests     (src/features/reports/ui), inside the engine
 *   #/vault?…                       🗄️ the vault: files students share     (src/features/vault/ui)
 *   #/people · #/chat/<room> · #/group/<room> · #/join/<code>   👥 people     (src/features/social/ui)
 *   (no address)                    🔎 the quick sheet · ⚑ the report dialog
 */
import { NoemaExplorePage } from '../features/sharing/ui/explore.ts';
import { NoemaSharePanel, openShare } from '../features/sharing/ui/share.ts';
import type { HostSubject } from '../features/community/ui/host.ts';
import type { ScreenChrome } from '../features/community/ui/host.ts';
import { CHROME_EVENT, type CommunityScreen } from '../features/community/ui/screen.ts';
import type { Here } from '../features/search/domain/params.ts';
import { NoemaReportAdmin } from '../features/reports/ui/admin.ts';
import { openReport } from '../features/reports/ui/dialog.ts';
import { NoemaEnginesPage, type EnginesDeps } from '../features/reports/ui/engines.ts';
import type { CatalogEntry } from '../engines/types.ts';
import { NoemaSearchPage } from '../features/search/ui/page.ts';
import { NoemaSearchQuick, quickSearch, type SearchScreenDeps } from '../features/search/ui/quick.ts';
import { NoemaVaultForm, type VaultScreenDeps } from '../features/vault/ui/form.ts';
import { NoemaVaultPage } from '../features/vault/ui/page.ts';
import { NoemaVaultUpload } from '../features/vault/ui/upload.ts';
import type { SendItem } from '../features/vault/ui/model.ts';
import { NoemaChatPage } from '../features/social/ui/chat.ts';
import { NoemaGroupPage, NoemaJoinPage, NoemaPersonActions } from '../features/social/ui/group.ts';
import { NoemaPeoplePage } from '../features/social/ui/home.ts';
import { openSendTo, type SocialScreenDeps } from '../features/social/ui/parts.ts';
import { provideServices, requestServices } from '../ui/core/services.ts';
import { defineUi } from '../ui/index.ts';
import { defineRoutes, type RouteMatch } from '../ui/router/routes.ts';
import type { CommunityApp } from './community-app.ts';
import { ENGINE_REQUESTS } from './community.ts';
import { CLOCK, ENGINES } from './tokens.ts';

export const COMMUNITY_ROUTES = defineRoutes({
  search: '/search',
  reports: '/admin/reports/:id?',
  engines: '/engines/:sub?',
  vault: '/vault',
  people: '/people',
  chat: '/chat/:room',
  group: '/group/:room',
  join: '/join/:code',
  explore: '/explore/:kind?',
});
type R = typeof COMMUNITY_ROUTES.table;
type Match = RouteMatch<R>;

/** the community's own elements and their tags */
export const COMMUNITY_ELEMENTS = {
  'noema-search-page': NoemaSearchPage,
  'noema-search-quick': NoemaSearchQuick,
  'noema-report-admin': NoemaReportAdmin,
  'noema-engines-page': NoemaEnginesPage,
  'noema-vault-page': NoemaVaultPage,
  'noema-vault-form': NoemaVaultForm,
  'noema-vault-upload': NoemaVaultUpload,
  'noema-people-page': NoemaPeoplePage,
  'noema-chat-page': NoemaChatPage,
  'noema-group-page': NoemaGroupPage,
  'noema-join-page': NoemaJoinPage,
  'noema-person-actions': NoemaPersonActions,
  'noema-explore-page': NoemaExplorePage,
  'noema-share-panel': NoemaSharePanel,
} as const;

export interface CommunityScreens {
  has(hash: string): boolean;
  mount(el: HTMLElement, hash: string, onChrome: (c: ScreenChrome) => void, ctx?: MountContext): HTMLElement | null;
  quickSearch(here: Here | null): void;
  openReport(): void;
  /** ✉ a vault file into one of my conversations */
  sendTo(item: SendItem): void;
  /** 🔗 the share dialog of one of the learner's subjects */
  share(s: HostSubject): void;
  /** the buttons of someone's page (#/u/<id>) drawn into el */
  personActions(el: HTMLElement, userId: string): void;
}

/** what the place that mounts a screen adds (the engine's #/engines: the engines it runs, the open subject, its home) */
export interface MountContext {
  readonly engineHere?: (e: CatalogEntry) => boolean;
  readonly subjectId?: string | null;
  readonly back?: string;
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
  const vaultDeps: VaultScreenDeps = { host: app.host, notify: app.notify, ui: app.vault };
  const socialDeps: SocialScreenDeps = { host: app.host, notify: app.notify, ui: app.social, vault: app.vault };

  /** the element of a matched address, with its deps */
  const screenOf = (m: Match, ctx: MountContext): CommunityScreen | null => {
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
      case 'engines': {
        const el = doc.createElement('noema-engines-page');
        const deps: EnginesDeps = {
          host: app.host,
          notify: app.notify,
          requests: app.r.get(ENGINE_REQUESTS),
          catalog: () => app.r.get(ENGINES).catalog,
          engineHere: ctx.engineHere ?? (() => false),
          subjectId: () => ctx.subjectId ?? null,
          back: ctx.back ?? '#/',
        };
        el.deps = deps;
        el.sub = m.params.sub ?? '';
        return el;
      }
      case 'vault': {
        const el = doc.createElement('noema-vault-page');
        el.deps = vaultDeps;
        return el;
      }
      case 'people': {
        const el = doc.createElement('noema-people-page');
        el.deps = socialDeps;
        return el;
      }
      case 'chat': {
        const el = doc.createElement('noema-chat-page');
        el.deps = socialDeps;
        el.room = m.params.room;
        return el;
      }
      case 'group': {
        const el = doc.createElement('noema-group-page');
        el.deps = socialDeps;
        el.room = m.params.room;
        return el;
      }
      case 'join': {
        const el = doc.createElement('noema-join-page');
        el.deps = socialDeps;
        el.code = m.params.code;
        return el;
      }
      case 'explore': {
        const el = doc.createElement('noema-explore-page');
        el.deps = { host: app.host, notify: app.notify };
        el.kind = m.params.kind ?? '';
        return el;
      }
    }
  };

  made = {
    has: hash => COMMUNITY_ROUTES.match(hash) !== null,
    mount: (el, hash, onChrome, ctx = {}) => {
      const m = COMMUNITY_ROUTES.match(hash);
      if (!m) return null;
      const screen = screenOf(m, ctx);
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
    sendTo: item => {
      void openSendTo(socialDeps, { kind: item.kind, id: item.id, title: item.title }, item.title);
    },
    share: s => {
      void openShare({ host: app.host, notify: app.notify, i18n: app.i18n }, s);
    },
    personActions: (el, userId) => {
      const a = win.document.createElement('noema-person-actions');
      a.deps = socialDeps;
      a.person = userId;
      el.replaceChildren(a);
    },
  };
  return made;
}
