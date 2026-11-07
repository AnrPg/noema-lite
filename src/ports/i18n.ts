/**
 * I18n port: the interface language (docs/ARCHITECTURE.md §4, docs/i18n.md).
 *
 * `t(key, params)` formats a catalog message (ICU: plurals, selects, numbers in the locale's digits) in the current UI
 * locale, falling back along its chain to English; `err(e)` gives the words for an error (its "err." + code message, else
 * its English message: docs/i18n.md §6.1). Formats are Intl's, never hand-made. In the browser the adapter sits over the
 * existing runtime (engine/i18n.js, NoemaI18n) and its catalogs (i18n/<component>/*.arb → engine/i18n/<locale>.js).
 */
import type { Unsubscribe } from './common.ts';

export type MessageParams = { readonly [key: string]: string | number | boolean | null | undefined };
export type TextDirection = 'ltr' | 'rtl';

export interface I18nFormats {
  number(n: number, options?: Intl.NumberFormatOptions): string;
  percent(ratio: number, options?: Intl.NumberFormatOptions): string;
  /** '' for a missing or broken time stamp (never a RangeError). */
  date(moment: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  time(moment: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  relative(value: number, unit: Intl.RelativeTimeFormatUnit): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  compare(a: string, b: string): number;
}

export interface I18n {
  t(key: string, params?: MessageParams): string;
  has(key: string): boolean;
  /** The words for an error: { code, params, message } or an Error with .code → t('err.' + code), else its message. */
  err(error: unknown): string;
  /** The CLDR plural category of n in the current locale. */
  plural(n: number): Intl.LDMLPluralRule;
  locale(): string;
  dir(): TextDirection;
  readonly format: I18nFormats;
  onChange(listener: (locale: string) => void): Unsubscribe;
}
