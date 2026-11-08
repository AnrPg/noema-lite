/**
 * THE ROOT OF AREA 5'S SCREENS while the older shell still runs (build/lang-activities.js, src/composition/lang-activities.ts
 * starts it): it defines the kit and the screens of languages and activities (src/ui/screens/languages-activities.ts),
 * picks the services they speak through (the I18n port over engine/i18n.js, the system clock, the interface languages)
 * and hands NoemaCore.screens its mount function (screens-bridge.ts). Each mount gives the screen the port it needs over
 * what the page has (lang-activities-ports.ts).
 */
import { systemClock } from '../adapters/browser/clock.ts';
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { provideServices, type LocaleInfo, type UiServices } from '../ui/core/services.ts';
import { defineUi } from '../ui/index.ts';
import type { CoursePort } from '../ui/screens/languages/course-port.ts';
import {
  AREA5_ROUTES,
  defineArea5,
  isArea5Part,
  mountArea5,
  mountArea5Part,
  type Area5Ports,
  type PartOptions,
} from '../ui/screens/languages-activities.ts';
import { languagesPort, type CoreForScreens } from './lang-activities-ports.ts';
import type { ScreenChrome, ScreenContext, ScreensApi } from './screens-bridge.ts';

/** What the root uses of engine/i18n.js (NoemaI18n) for the interface languages. */
interface I18nRuntimeLocales {
  available(): readonly { readonly tag: string; readonly name: string; readonly dir?: string }[];
  use(tag: string): Promise<string>;
}

export interface LangActivitiesOptions {
  readonly win?: Window;
  readonly services?: UiServices;
  readonly core?: CoreForScreens;
}

/** The screens' mount function over a page (window, its NoemaCore and NoemaI18n). */
export function langActivities(o: LangActivitiesOptions = {}): ScreensApi {
  const win = o.win ?? window;
  const rt = (): I18nRuntimeLocales | undefined => (win as unknown as { NoemaI18n?: I18nRuntimeLocales }).NoemaI18n;
  const core = (): CoreForScreens => o.core ?? (win as unknown as { NoemaCore: CoreForScreens }).NoemaCore;
  defineUi(win.customElements);
  defineArea5(win.customElements);
  const services: UiServices = o.services ?? {
    i18n: noemaI18n(),
    clock: systemClock(),
    locales: {
      list: (): LocaleInfo[] =>
        (rt()?.available() ?? [{ tag: 'en', name: 'English' }]).map(l => ({
          tag: l.tag,
          name: l.name,
          dir: l.dir === 'rtl' ? 'rtl' : 'ltr',
        })),
      use: tag => rt()?.use(tag) ?? Promise.resolve('en'),
    },
  };
  const provided = new WeakSet<HTMLElement>();
  const provide = (host: HTMLElement): void => {
    if (provided.has(host)) return;
    provided.add(host);
    provideServices(host, services);
  };
  const ports = (ctx: ScreenContext): Area5Ports => ({
    course: () => (ctx.course as CoursePort | undefined) ?? null,
    languages: () => {
      const svc = core().languages;
      if (!svc) throw new Error('this build has no NoemaCore.languages');
      return languagesPort(svc, ctx, win);
    },
  });
  return {
    has: hash => AREA5_ROUTES.match(hash) !== null,
    mount(hash: string, host: HTMLElement, ctx: ScreenContext): ScreenChrome | null {
      const m = AREA5_ROUTES.match(hash);
      if (!m) return null;
      provide(host);
      return mountArea5(m, host, ports(ctx), k => services.i18n.t(k)).chrome;
    },
    part(name: string, host: HTMLElement, ctx: ScreenContext, options?: PartOptions): boolean {
      if (!isArea5Part(name)) return false;
      provide(host);
      mountArea5Part(name, host, ports(ctx), options);
      return true;
    },
  };
}

/** Starts the root on this page: NoemaCore.screens gets the mount function. */
export function startLangActivities(win: Window = window): ScreensApi {
  const api = langActivities({ win });
  const bridge = (win as unknown as { NoemaCore?: { screens?: { register(a: ScreensApi): void } } }).NoemaCore?.screens;
  bridge?.register(api);
  return api;
}
