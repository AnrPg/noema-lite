/**
 * An I18n over plain catalogs (tests, Node tools): { locale: { key: message } }, with the same fallback chain as the app
 * (pt-PT → pt → en). Messages fill simple "{name}" placeholders and the "{n, plural, one {…} other {…}}" form (with #);
 * the browser adapter uses the full ICU runtime (engine/i18n.js).
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { I18n, I18nFormats, MessageParams, TextDirection } from '../../ports/i18n.ts';

export type Catalogs = { readonly [locale: string]: { readonly [key: string]: string } };

const RTL = /^(ar|he|fa|ur)(-|$)|^ar-XB$/;

export function chainOf(tag: string): string[] {
  const out = [tag], parts = tag.split('-');
  if (parts.length > 1 && !/^zh-/i.test(tag) && parts[0]) out.push(parts[0]);
  if (!out.includes('en')) out.push('en');
  return out;
}

/** "{n, plural, one {# day} other {# days}}" and "{name}" (enough for tests and tools). */
export function formatSimple(message: string, params: MessageParams, locale: string): string {
  const plural = /\{(\w+),\s*plural,\s*((?:[=\w]+\s*\{[^{}]*\}\s*)+)\}/g;
  const out = message.replace(plural, (_m, name: string, body: string) => {
    const n = Number(params[name] ?? 0);
    const forms = new Map([...body.matchAll(/([=\w]+)\s*\{([^{}]*)\}/g)].map(x => [x[1] ?? '', x[2] ?? '']));
    const form = forms.get('=' + n) ?? forms.get(new Intl.PluralRules(locale).select(n)) ?? forms.get('other') ?? '';
    return form.replace(/#/g, new Intl.NumberFormat(locale).format(n));
  });
  return out.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
}

export function catalogI18n(catalogs: Catalogs, initialLocale = 'en'): I18n & { use(locale: string): void } {
  let locale = initialLocale;
  const listeners = new Set<(l: string) => void>();
  const source = (key: string): [string, string] | null => {
    for (const l of chainOf(locale)) { const m = catalogs[l]?.[key]; if (m !== undefined) return [m, l]; }
    return null;
  };
  const t = (key: string, params: MessageParams = {}): string => {
    const s = source(key);
    return s ? formatSimple(s[0], params, s[1]) : key.split('.').pop() ?? key;
  };
  const has = (key: string): boolean => source(key) !== null;
  const asDate = (x: Date | number | string): Date => (x instanceof Date ? x : new Date(x));
  const format: I18nFormats = {
    number: (n, o) => new Intl.NumberFormat(locale, o).format(n),
    percent: (x, o) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0, ...o }).format(x),
    date: (d, o = { dateStyle: 'medium' }) => { const x = asDate(d); return Number.isNaN(x.getTime()) ? '' : new Intl.DateTimeFormat(locale, o).format(x); },
    time: (d, o = { timeStyle: 'short' }) => { const x = asDate(d); return Number.isNaN(x.getTime()) ? '' : new Intl.DateTimeFormat(locale, o).format(x); },
    relative: (v, unit) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(v, unit),
    list: (items, o = { type: 'conjunction' }) => new Intl.ListFormat(locale, o).format([...items]),
    compare: (a, b) => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }).compare(a, b),
  };
  return {
    t,
    has,
    err(e) {
      if (e === null || e === undefined) return '';
      const x = (typeof e === 'object' && 'error' in e && e.error && typeof e.error === 'object' ? e.error : e) as { code?: unknown; params?: unknown; message?: unknown };
      const code = typeof x.code === 'string' ? x.code : null;
      if (code && has('err.' + code)) return t('err.' + code, (x.params ?? {}) as MessageParams);
      return typeof x.message === 'string' ? x.message : String(e);
    },
    plural: n => new Intl.PluralRules(locale).select(n),
    locale: () => locale,
    dir: (): TextDirection => (RTL.test(locale) ? 'rtl' : 'ltr'),
    format,
    onChange(listener): Unsubscribe { listeners.add(listener); return () => { listeners.delete(listener); }; },
    use(l) { if (l !== locale) { locale = l; for (const f of [...listeners]) f(l); } },
  };
}
