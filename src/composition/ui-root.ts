/**
 * THE UI ROOT (phase 3; src/composition/ui.ts is the entry that starts it, built to build/ui.js): it picks the adapters
 * the new UI uses — the I18n port over the app's i18n runtime (engine/i18n.js) and its catalogs, the system clock, the
 * device storage for device preferences — defines the kit (src/ui), hands the components their services, applies the
 * appearance, wires the Notifier policy over the frame's toaster and routes the hash.
 *
 * Today it serves the kit's demo, #/ui-kit (development only); phase 3 grows it into the app's root, screen by screen,
 * and this file stays the one place where the new UI meets the adapters.
 */
import { systemClock } from '../adapters/browser/clock.ts';
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { browserStorage } from '../adapters/browser/storage.ts';
import { policyNotifier } from '../adapters/local/notifier-policy.ts';
import type { Clock } from '../ports/clock.ts';
import type { I18n } from '../ports/i18n.ts';
import type { Notifier } from '../ports/notifier.ts';
import type { KeyValueStore } from '../ports/storage.ts';
import { DEFAULT_APPEARANCE, applyAppearance, isCharacter, type Appearance } from '../ui/core/appearance.ts';
import { provideServices, type LocaleInfo, type Locales, type UiServices } from '../ui/core/services.ts';
import { KIT_SECTIONS, NoemaUiKit, isKitSection, type KitSection } from '../ui/demo/ui-kit.ts';
import type { FrameTab } from '../ui/frame/app-frame.ts';
import { defineUi } from '../ui/index.ts';
import { browserHash, createRouter, type HashLocation, type Router } from '../ui/router/router.ts';
import { defineRoutes } from '../ui/router/routes.ts';

/** the demo's routes: #/ui-kit (its first section) and #/ui-kit/<section> */
export const KIT_ROUTES = defineRoutes({ kit: '/ui-kit', section: '/ui-kit/:section' });
export type KitRoutes = typeof KIT_ROUTES.table;

/** The kit's demo serves this page: #/ui-kit on a development host (localhost) — engine/loader.js asks the same. */
export const isUiKitPage = (loc: Pick<Location, 'hash' | 'hostname'>): boolean =>
  /^#\/ui-kit(?:[/?]|$)/.test(loc.hash) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);

/** the device preference of the demo's appearance (localStorage keeps device preferences only) */
export const APPEARANCE_KEY = 'noema-ui:appearance';

/** What the root uses of engine/i18n.js (NoemaI18n): its locales and the switch between them. */
export interface I18nRuntimeLocales {
  readonly ready?: Promise<unknown>;
  available(): readonly { readonly tag: string; readonly name: string; readonly dir?: string }[];
  use(tag: string): Promise<string>;
}

const ICONS: Readonly<Record<KitSection, string>> = { basics: 'cards', overlays: 'more', forms: 'edit', look: 'sun' };

/** The interface languages the runtime offers (those switched on), and the switch. */
export function runtimeLocales(rt: () => I18nRuntimeLocales | undefined): Locales {
  return {
    list: (): LocaleInfo[] =>
      (rt()?.available() ?? [{ tag: 'en', name: 'English' }]).map(l => ({
        tag: l.tag,
        name: l.name,
        dir: l.dir === 'rtl' ? 'rtl' : 'ltr',
      })),
    use: tag => rt()?.use(tag) ?? Promise.resolve('en'),
  };
}

/** a saved appearance as written (null when it is not readable JSON: hand-edited, the defaults apply) */
function savedAppearance(raw: string): Partial<Appearance> | null {
  try {
    return JSON.parse(raw) as Partial<Appearance>;
  } catch {
    return null;
  }
}

/** The demo's appearance: the device's saved choice, else the character on the page (engine/themes.js put it there), else the default. */
export function loadAppearance(kv: KeyValueStore, root: HTMLElement): Appearance {
  const r = kv.get(APPEARANCE_KEY);
  const a = r.ok && r.value ? savedAppearance(r.value) : null;
  if (a)
    return {
      scheme: a.scheme === 'light' || a.scheme === 'dark' ? a.scheme : 'system',
      character: isCharacter(a.character) ? a.character : DEFAULT_APPEARANCE.character,
      motion: a.motion === 'reduced' || a.motion === 'full' ? a.motion : 'system',
    };
  const onPage = root.dataset.m;
  return { ...DEFAULT_APPEARANCE, character: isCharacter(onPage) ? onPage : DEFAULT_APPEARANCE.character };
}

export interface UiKitOptions {
  readonly win?: Window;
  readonly i18n?: I18n;
  readonly clock?: Clock;
  readonly kv?: KeyValueStore;
  readonly locales?: Locales;
  readonly location?: HashLocation;
  /** what happens when the address leaves #/ui-kit (the page: a reload, so the older screens start) */
  readonly leave?: () => void;
}

export interface UiKitApp {
  readonly services: UiServices;
  readonly notifier: Notifier;
  readonly router: Router<KitRoutes>;
  readonly frame: HTMLElementTagNameMap['noema-app-frame'];
  readonly kit: NoemaUiKit;
  stop(): void;
}

/** Mounts the frame with the kit's demo on the page (#/ui-kit). */
export async function startUiKit(o: UiKitOptions = {}): Promise<UiKitApp> {
  const win = o.win ?? window,
    doc = win.document;
  const rt = (): (I18nRuntimeLocales & { readonly ready?: Promise<unknown> }) | undefined =>
    (win as unknown as { NoemaI18n?: I18nRuntimeLocales }).NoemaI18n;
  await rt()?.ready;
  defineUi(win.customElements);
  if (!win.customElements.get('noema-ui-kit')) win.customElements.define('noema-ui-kit', NoemaUiKit);

  const services: UiServices = {
    i18n: o.i18n ?? noemaI18n(),
    clock: o.clock ?? systemClock(),
    locales: o.locales ?? runtimeLocales(rt),
  };
  const kv = o.kv ?? browserStorage().kv;
  provideServices(doc.body, services);
  doc.getElementById('noema-splash')?.remove();
  doc.body.classList.remove('noema-booting');

  let appearance = loadAppearance(kv, doc.documentElement);
  let stopLook = applyAppearance(doc.documentElement, appearance);

  const frame = doc.createElement('noema-app-frame');
  const kit = doc.createElement('noema-ui-kit');
  if (!(kit instanceof NoemaUiKit)) throw new Error('noema-ui-kit is not the demo element');
  frame.append(kit);
  doc.body.append(frame);
  await frame.updateComplete;
  await frame.layer.updateComplete;
  const notifier = policyNotifier(frame.layer.toaster, { now: () => services.clock.now() });
  kit.host = {
    notifier,
    layer: frame.layer,
    appearance: () => appearance,
    setAppearance(a) {
      appearance = a;
      stopLook();
      stopLook = applyAppearance(doc.documentElement, a);
      kv.set(APPEARANCE_KEY, JSON.stringify(a));
    },
  };
  const stopOverflow = kit.watchOverflow();

  const tabs = (): FrameTab[] =>
    KIT_SECTIONS.map(s => ({ id: s, label: kit.sectionName(s), icon: ICONS[s], href: KIT_ROUTES.href('section', { section: s }) }));
  const router = createRouter(KIT_ROUTES, o.location ?? browserHash(win));
  const leave =
    o.leave ??
    ((): void => {
      win.location.reload();
    });
  let first = true;
  const draw = (): void => {
    const m = router.current();
    if (!m) return;
    const section: KitSection = m.name === 'section' && isKitSection(m.params.section) ? m.params.section : 'basics';
    kit.section = section;
    frame.tabs = tabs();
    frame.current = section;
    frame.crumbs = [{ label: services.i18n.t('ui.kit.title'), href: KIT_ROUTES.href('kit') }, { label: kit.sectionName(section) }];
    frame.back = section === 'basics' ? undefined : KIT_ROUTES.href('kit');
  };
  const stopRoute = router.subscribe(m => {
    if (!m) {
      leave();
      return;
    }
    // an unknown section is the first one, with the address corrected
    if (m.name === 'section' && !isKitSection(m.params.section)) {
      router.navigate(KIT_ROUTES.href('kit'), { replace: true });
      return;
    }
    draw();
    if (!first) {
      win.scrollTo({ top: 0 });
      void frame.updateComplete.then(() => {
        frame.focusMain();
      });
    }
    first = false;
  });
  const stopLocale = services.i18n.onChange(draw);
  return {
    services,
    notifier,
    router,
    frame,
    kit,
    stop() {
      stopRoute();
      stopLocale();
      stopOverflow();
      stopLook();
      router.dispose();
      frame.remove();
    },
  };
}
