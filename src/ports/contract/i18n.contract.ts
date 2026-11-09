/// <reference types="node" />
/**
 * The I18n contract. `make(catalogs)` gives an I18n in English over these catalogs and `use(locale)` switches it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { I18n } from '../i18n.ts';

export const CONTRACT_CATALOGS = {
  en: {
    'home.hello': 'Hello, {name}!',
    'home.days': '{n, plural, one {# day} other {# days}}',
    'err.cloud.network': 'Network error — are you offline? ({detail})',
    'only.en': 'English only',
  },
  el: { 'home.hello': 'Γεια σου, {name}!', 'err.cloud.network': 'Σφάλμα δικτύου ({detail})' },
  'ar-EG': { 'home.hello': 'مرحبا {name}' },
} as const;

export interface I18nHarness {
  readonly i18n: I18n;
  use(locale: string): Promise<void> | void;
}
export type I18nFactory = (catalogs: typeof CONTRACT_CATALOGS) => I18nHarness;

export function i18nContract(name: string, make: I18nFactory): void {
  describe(`I18n contract: ${name}`, () => {
    test('t fills params and plurals; has; a missing key gives text, never a throw', () => {
      const { i18n } = make(CONTRACT_CATALOGS);
      assert.equal(i18n.locale(), 'en');
      assert.equal(i18n.t('home.hello', { name: 'Ada' }), 'Hello, Ada!');
      assert.equal(i18n.t('home.days', { n: 1 }), '1 day');
      assert.equal(i18n.t('home.days', { n: 3 }), '3 days');
      assert.ok(i18n.has('home.hello') && !i18n.has('no.such.key'));
      assert.equal(typeof i18n.t('no.such.key'), 'string');
    });

    test('err: a coded error in the UI language, else its own message', () => {
      const { i18n } = make(CONTRACT_CATALOGS);
      const coded = Object.assign(new Error('Network error — are you offline? (x)'), { code: 'cloud.network', params: { detail: 'x' } });
      assert.equal(i18n.err(coded), 'Network error — are you offline? (x)');
      assert.equal(
        i18n.err({ error: { code: 'cloud.network', params: { detail: 'y' }, message: 'm' } }),
        'Network error — are you offline? (y)',
      );
      assert.equal(i18n.err(Object.assign(new Error('The server said no'), { code: 'cloud.unknown' })), 'The server said no');
      assert.equal(i18n.err(null), '');
    });

    test('switching the locale: the words, the fallback to English, the direction, the listeners', async () => {
      const h = make(CONTRACT_CATALOGS);
      const seen: string[] = [];
      h.i18n.onChange(l => seen.push(l));
      await h.use('el');
      assert.equal(h.i18n.locale(), 'el');
      assert.deepEqual([...h.i18n.chain()], ['el', 'en']);
      assert.deepEqual([...h.i18n.chain('pt-PT')], ['pt-PT', 'pt', 'en']);
      assert.deepEqual([...h.i18n.chain('zh-Hant')], ['zh-Hant', 'en']);
      assert.equal(h.i18n.t('home.hello', { name: 'Ada' }), 'Γεια σου, Ada!');
      assert.equal(h.i18n.t('only.en'), 'English only');
      assert.equal(h.i18n.dir(), 'ltr');
      await h.use('ar-EG');
      assert.equal(h.i18n.dir(), 'rtl');
      assert.deepEqual(seen, ['el', 'ar-EG']);
    });

    test("formats are Intl's; a broken date is empty, never a RangeError", () => {
      const { i18n } = make(CONTRACT_CATALOGS);
      assert.equal(i18n.format.number(1234.5), '1,234.5');
      assert.equal(i18n.format.date('not a date'), '');
      assert.ok(i18n.format.date(Date.UTC(2026, 10, 7)).includes('2026'));
      assert.equal(i18n.format.list(['a', 'b', 'c']), 'a, b, and c');
      assert.ok(i18n.format.compare('a', 'B') < 0);
      assert.equal(i18n.plural(1), 'one');
      assert.equal(i18n.plural(2), 'other');
    });
  });
}
