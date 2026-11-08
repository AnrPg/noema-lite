/**
 * The services of the UI's unit tests: the memory I18n over the real catalogs of the kit (i18n/ui/en.arb and its 14
 * drafts, so a key missing from the catalog shows in a test as its bare last part), a manual clock, and the 15 locales.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { ReactiveElement } from 'lit';
import { fileURLToPath } from 'node:url';
import { manualClock, type ManualClock } from '../../adapters/memory/clock.ts';
import { catalogI18n } from '../../adapters/memory/i18n.ts';
import type { I18n } from '../../ports/i18n.ts';
import { provideServices, type LocaleInfo, type UiServices } from '../core/services.ts';

const DIR = fileURLToPath(new URL('../../../i18n/ui/', import.meta.url));

/** an ARB file's messages (no metadata) */
export function arb(path: string): Record<string, string> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => !e[0].startsWith('@') && typeof e[1] === 'string'));
}

/** every catalog of the kit: { locale: { key: message } } (drafts included) */
export function uiCatalogs(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { en: arb(DIR + 'en.arb') };
  for (const f of readdirSync(DIR + 'drafts')) if (f.endsWith('.arb')) out[f.slice(0, -4)] = arb(DIR + 'drafts/' + f);
  return out;
}

/** the memory I18n fills "{n}", not "{n, number}": the tests' copy of the catalogs drops the format */
const simple = (cats: Record<string, Record<string, string>>): Record<string, Record<string, string>> =>
  Object.fromEntries(
    Object.entries(cats).map(([l, m]) => [
      l,
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.replace(/\{(\w+), number\}/g, '{$1}')])),
    ]),
  );

export const LOCALES: readonly LocaleInfo[] = [
  'en',
  'el',
  'ru',
  'fr',
  'ar-EG',
  'de',
  'hi',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'it',
  'es-ES',
  'sq',
  'pt-PT',
  'tr',
].map(tag => ({ tag, name: tag, dir: tag === 'ar-EG' ? 'rtl' : 'ltr' }));

export interface TestServices extends UiServices {
  readonly i18n: I18n & { use(locale: string): void };
  readonly clock: ManualClock;
}

export function testServices(locale = 'en'): TestServices {
  const i18n = catalogI18n(simple(uiCatalogs()), locale);
  const clock = manualClock();
  return {
    i18n,
    clock,
    locales: {
      list: () => LOCALES,
      use: tag => {
        i18n.use(tag);
        return Promise.resolve(tag);
      },
    },
  };
}

/** A fresh container in the document whose subtree gets these services; → the container. */
export function mount(services: UiServices = testServices()): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  provideServices(host, services);
  return host;
}

/** Waits for every Lit element under root (and itself) to finish drawing. */
export async function settle(root: Element): Promise<void> {
  const all = (r: Element | ShadowRoot): Element[] =>
    [...r.querySelectorAll('*')].flatMap(e => [e, ...(e.shadowRoot ? all(e.shadowRoot) : [])]);
  for (let i = 0; i < 3; i++) {
    const els = [root, ...(root.shadowRoot ? all(root.shadowRoot) : []), ...all(root)];
    await Promise.all(els.flatMap(e => (e instanceof ReactiveElement ? [e.updateComplete] : [])));
  }
}

/** A keydown on an element (bubbling, composed, cancelable, as the browser sends it). */
export function key(el: Element, k: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...extra });
  el.dispatchEvent(e);
  return e;
}

/** The element in a shadow root (throws when it is missing: the test fails with the selector). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- as querySelector<T>: the caller names the element the selector finds
export function $<T extends Element = HTMLElement>(host: Element, selector: string): T {
  const x = host.shadowRoot?.querySelector<T>(selector);
  if (!x) throw new Error(`no ${selector} in <${host.localName}>`);
  return x;
}
