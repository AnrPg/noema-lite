/**
 * The I18n port over the app's i18n runtime (engine/i18n.js → window.NoemaI18n) and its catalogs. The runtime loads
 * after the core (index.html), so it is looked up at every call; until it is there (and in a context without it) the
 * adapter answers like a runtime with no catalog: the key's last part, an error's own message.
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { I18n, I18nFormats, MessageParams, TextDirection } from '../../ports/i18n.ts';
import { catalogI18n } from '../memory/i18n.ts';

/** What the adapter uses of NoemaI18n (engine/i18n.js). */
export interface NoemaI18nRuntime {
  t(key: string, params?: MessageParams): string;
  has(key: string): boolean;
  err(e: unknown): string;
  readonly locale: string;
  chain(tag: string): string[];
  readonly dir: TextDirection;
  onChange(listener: (locale: string) => void): void;
  readonly fmt: {
    number(n: number, o?: Intl.NumberFormatOptions): string;
    percent(x: number, o?: Intl.NumberFormatOptions): string;
    date(d: Date | number | string, o?: Intl.DateTimeFormatOptions): string;
    time(d: Date | number | string, o?: Intl.DateTimeFormatOptions): string;
    relative(v: number, unit: Intl.RelativeTimeFormatUnit): string;
    list(items: string[], o?: Intl.ListFormatOptions): string;
    compare(a: string, b: string): number;
    plural(n: number): Intl.LDMLPluralRule;
  };
}

export function noemaI18n(
  runtime: () => NoemaI18nRuntime | undefined = () => (globalThis as { NoemaI18n?: NoemaI18nRuntime }).NoemaI18n,
): I18n {
  const fallback = catalogI18n({});
  const listeners = new Set<(l: string) => void>();
  let hooked: NoemaI18nRuntime | null = null;
  /** The runtime, hooked once for its locale changes. */
  const rt = (): NoemaI18nRuntime | undefined => {
    const r = runtime();
    if (r && hooked !== r) {
      hooked = r;
      r.onChange(l => {
        for (const f of [...listeners]) f(l);
      });
    }
    return r;
  };
  const format: I18nFormats = {
    number: (n, o) => rt()?.fmt.number(n, o) ?? fallback.format.number(n, o),
    percent: (x, o) => rt()?.fmt.percent(x, o) ?? fallback.format.percent(x, o),
    date: (d, o) => rt()?.fmt.date(d, o) ?? fallback.format.date(d, o),
    time: (d, o) => rt()?.fmt.time(d, o) ?? fallback.format.time(d, o),
    relative: (v, u) => rt()?.fmt.relative(v, u) ?? fallback.format.relative(v, u),
    list: (items, o) => rt()?.fmt.list([...items], o) ?? fallback.format.list(items, o),
    compare: (a, b) => rt()?.fmt.compare(a, b) ?? fallback.format.compare(a, b),
  };
  return {
    t: (key, params) => rt()?.t(key, params) ?? fallback.t(key, params),
    has: key => rt()?.has(key) ?? false,
    err: e => rt()?.err(e) ?? fallback.err(e),
    plural: n => rt()?.fmt.plural(n) ?? fallback.plural(n),
    locale: () => rt()?.locale ?? 'en',
    chain: l => {
      const r = rt();
      return r ? r.chain(l ?? r.locale) : fallback.chain(l ?? 'en');
    },
    dir: () => rt()?.dir ?? 'ltr',
    format,
    onChange(listener): Unsubscribe {
      listeners.add(listener);
      rt();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
