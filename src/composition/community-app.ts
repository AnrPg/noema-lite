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
import type { CommunityHost, HostSubject, NoteItem, ScreenChrome } from '../features/community/ui/host.ts';
import { searchService } from '../features/search/application/search.ts';
import type { Here } from '../features/search/domain/params.ts';
import { SearchUi, type SearchDeps } from '../features/search/ui/model.ts';
import type { I18n } from '../ports/i18n.ts';
import type { Notifier } from '../ports/notifier.ts';
import type { ReportDeps } from '../features/reports/ui/dialog.ts';
import type { VaultParams } from '../features/vault/domain/index.ts';
import { VaultUi, type SendItem } from '../features/vault/ui/model.ts';
import { SocialUi } from '../features/social/ui/model.ts';
import type { VaultFile } from '../ports/vault.ts';
import type { BridgeExtension } from './bridge.ts';
import type * as ScreensModule from './community-ui.ts';
import { token, type Resolver } from './container.ts';
import { oldAppHost } from './community-host.ts';
import { captureErrors, oldAppReportContext } from './community-old.ts';
import { REPORTS, SOCIAL, VAULT } from './community.ts';
import { oldAppShare } from './sharing-host.ts';
import { catalogBridge } from './study.ts';
import { CLOCK, I18N, NOTIFIER, STORAGE } from './tokens.ts';

/** What every screen is handed (community-ui.ts builds the screens' deps from it). */
export interface CommunityApp {
  readonly r: Resolver;
  readonly host: CommunityHost;
  readonly notify: Notifier;
  readonly i18n: I18n;
  readonly search: SearchUi;
  readonly reports: ReportDeps;
  readonly vault: VaultUi;
  readonly social: SocialUi;
}

type OpenIndex = (account: string, sources: () => Promise<readonly IndexSource[]>) => CatalogIndex;

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function communityApp(
  r: Resolver,
  win: Window & typeof globalThis,
  errors: ReturnType<typeof captureErrors>,
  sendTo: (item: SendItem) => void,
): CommunityApp {
  const host = oldAppHost(win as never, { report: oldAppReportContext(win, errors), share: oldAppShare(win) });
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
  const reports: ReportDeps = { host, notify, i18n, win, reports: r.get(REPORTS), newId: () => win.crypto.randomUUID() };
  const social = r.get(SOCIAL);
  const vault = new VaultUi({
    host,
    notify,
    i18n: () => i18n,
    vault: r.get(VAULT),
    groups: async () => {
      if (!host.session()) return [];
      if (!social.state.loaded) await social.refresh();
      return social.groups();
    },
    usedBytes: async () => {
      if (!host.session()) return null;
      const n = await social.server.usedBytes();
      return n.ok ? n.value : null;
    },
    sendTo,
  });
  const socialUi = new SocialUi({ host, i18n: () => i18n, social, device: searchDeps.device, tab: searchDeps.tab, win });
  return { r, host, notify, i18n, search: new SearchUi(searchDeps, () => i18n), reports, vault, social: socialUi };
}

/** the screens (build/community.js), loaded once */
export type Screens = typeof ScreensModule;
/** the load of build/community.js (the page registers it: src/composition/browser.ts) */
export const COMMUNITY_SCREENS = token<() => Promise<Screens>>('community.screens', 'the load of build/community.js');
let screens: Promise<Screens> | null = null,
  loaded: Screens | null = null;

export function communityBridge(r: Resolver): unknown {
  const win = globalThis as Window & typeof globalThis;
  let app: CommunityApp | null = null;
  // the page's errors from the start (a ⚑ report carries the last ones); Node and the tests' vm have no page
  const errors = typeof win.addEventListener === 'function' && 'console' in win ? captureErrors(win) : () => [];
  const A = (): CommunityApp =>
    (app ??= communityApp(r, win, errors, item => {
      void ui().then(s => {
        s.sendTo(item);
      });
    }));
  const cloudOn = (): boolean => A().host.account()?.kind === 'cloud' && !!A().host.session();
  const loadScreens = (): Promise<Screens> =>
    (screens ??= r
      .get(COMMUNITY_SCREENS)()
      .then(m => {
        loaded = m;
        return m;
      })
      .catch((e: unknown) => {
        screens = null; // a failed load may be tried again
        throw e;
      }));
  const ui = async (): Promise<ReturnType<Screens['communityScreens']>> => (await loadScreens()).communityScreens(A(), win);
  /** once the screens are loaded, a screen is mounted in the same task (the frame never shows a page half drawn) */
  const now = (): ReturnType<Screens['communityScreens']> | null => (loaded ? loaded.communityScreens(A(), win) : null);
  if (typeof win.addEventListener === 'function')
    win.addEventListener('load', () => {
      // warm the index a little after start when the learner has searched on this device before
      win.setTimeout(() => {
        A().search.warmIfUsed();
      }, 8000);
      // ⚑ reports kept while offline go when the app is back
      win.setTimeout(() => {
        if (cloudOn()) void A().reports.reports.flush();
      }, 4000);
    });
  return Object.freeze({
    /** is this address one of the community screens */
    has: async (hash: string): Promise<boolean> => (await ui()).has(hash),
    mount: (
      el: HTMLElement,
      hash: string,
      onChrome: (c: ScreenChrome) => void,
      ctx?: ScreensModule.MountContext,
    ): Promise<HTMLElement | null> => {
      const s = now();
      return s ? Promise.resolve(s.mount(el, hash, onChrome, ctx)) : ui().then(x => x.mount(el, hash, onChrome, ctx));
    },
    /** 🔔 the bell's sharing rows (a share, an invitation, an update, news) and its "Clear all" */
    notes: Object.freeze({
      row: async (
        el: HTMLElement,
        item: NoteItem,
        o: { onAccepted?: (s: { readonly kind?: string; readonly id?: string }) => void } = {},
      ) => {
        (await ui()).noteRow(el, item, o.onAccepted ?? null);
      },
      clear: async (el: HTMLElement) => {
        (await ui()).noticesClear(el);
      },
      /** the banner under the top bar, drawn into the frame's .sharebar (shown while a share or an update waits) */
      bar: async (el: HTMLElement) => {
        (await ui()).shareBar(el);
      },
    }),
    /** 🧭 Explore in a dialog (kind 'subjects' or '': Roadmaps), where no frame draws the page (the classic screens) */
    explore: async (kind: string) => {
      (await ui()).explore(kind);
    },
    /** 🔗 the share dialog of one of the learner's subjects (public, with a person; its source files with it) */
    share: async (s: HostSubject) => {
      (await ui()).share(s);
    },
    report: Object.freeze({
      /** ⚑ pressed: the place and the screenshot, then the dialog */
      open: async () => {
        (await ui()).openReport();
      },
      /** does this account review the reports (an admin of the app) */
      isAdmin: async (): Promise<boolean> => {
        if (!cloudOn()) return false;
        const x = await A().reports.reports.isAdmin();
        return x.ok && x.value;
      },
      /** the new reports waiting for an admin */
      newCount: async (): Promise<number> => {
        if (!cloudOn()) return 0;
        const x = await A().reports.reports.newCount();
        return x.ok ? x.value : 0;
      },
    }),
    vault: Object.freeze({
      /** '' when the vault takes the file, else why not (in the learner's words); it reads the file's first bytes */
      checkFile: (file: Pick<Blob, 'slice'> & { readonly name: string; readonly size: number }, usedBytes?: number) =>
        A().vault.checkFile(file, usedBytes),
      /** the files that pass the page's filters and search words */
      filter: (all: readonly VaultFile[], P: VaultParams) => A().vault.filter(all, P),
      /** forget the list read (the page reads it again) */
      reset: () => {
        A().vault.reset();
      },
    }),
    social: Object.freeze({
      /** the poll of what waits (a cloud account's start) */
      start: () => {
        A().social.start();
      },
      /** what waits for me: unread messages, invitations, buddy requests (the People button's count) */
      waiting: () => A().social.waiting(),
      onChange: (f: () => void) => A().social.onChange(f),
      refresh: () => A().social.refresh(),
      /** the server's refusals in the learner's words */
      why: (e: unknown) => A().social.why(e),
    }),
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
