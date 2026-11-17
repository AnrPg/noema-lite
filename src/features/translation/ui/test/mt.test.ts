/* 🌐 The machine translation's screens in a DOM (happy-dom), over the translator with memory ports and a mock provider: a
   toggle only where the language differs, translated in place with its badge and the original in the tooltip, Show original
   restores it exactly; the bar for every marked text (hidden while nothing needs it); the settings panel. The consent dialog,
   the estimate and the Greek interface in a real browser: tests/mt.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { catalogI18n } from '../../../../adapters/memory/i18n.ts';
import { arb } from '../../../../ui/test/services.ts';
import { createTranslator, type JsonStore } from '../../application/translator.ts';
import type { MtSettings } from '../../domain/plan.ts';
import { translationUi } from '../mt.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const CAT = arb(new URL('../../../../../i18n/mt/en.arb', import.meta.url).pathname);
const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

function setup() {
  const map = new Map<string, unknown>(),
    settings = new Map<string, MtSettings>();
  const device: JsonStore = { get: k => map.get(k) ?? null, set: (k, v) => (map.set(k, v), true), remove: k => void map.delete(k) };
  const mt = createTranslator({
    account: () => 'tester',
    uiLocale: () => 'en',
    readSettings: a => settings.get(a) ?? null,
    writeSettings: (a, s) => settings.set(a, s),
    device,
    session: null,
    clock: { now: () => 1, today: () => '2026-11-17' },
    providers: () => [],
    perMinute: () => 100,
  });
  const sent: string[] = [];
  mt.useProvider({
    translate: (_a, texts, o) => {
      sent.push(...texts);
      return Promise.resolve({ texts: texts.map(t => `[${o.to}] ${t}`) });
    },
  });
  mt.setSettings(null, { on: true });
  const ui = translationUi({ mt, i18n: catalogI18n({ en: CAT }), host: () => document.body });
  const list = document.createElement('div');
  document.body.append(list);
  const mk = (text: string, language: string): HTMLElement => {
    const n = document.createElement('b');
    n.textContent = text;
    list.append(n);
    return ui.mark(n, { language, kind: 'explore.pack' });
  };
  return { mt, ui, list, mk, sent };
}

test('the toggle: only where the language differs; translated in place, marked; Show original restores it', async () => {
  const { ui, mk } = setup();
  const n = mk('Κύτταρο', 'el'),
    en = mk('Cell biology', 'en');
  assert.equal(ui.toggle(null, [en]), null);
  const t = ui.toggle(null, [n]);
  assert.ok(t);
  document.body.append(t);
  const b = t.querySelector<HTMLButtonElement>('.mt-btn');
  assert.ok(b);
  assert.equal(b.textContent.trim(), '🌐 Translate');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  b.click();
  for (let i = 0; i < 5 && n.getAttribute('data-mt-state') !== 'mt'; i++) await flush();
  assert.equal(n.textContent, '[en] Κύτταρο');
  assert.equal(n.lang, 'en');
  assert.equal(n.nextElementSibling?.classList.contains('mt-badge'), true);
  assert.match(n.title, /Κύτταρο/);
  const b2 = t.querySelector<HTMLButtonElement>('.mt-btn');
  assert.equal(b2?.getAttribute('aria-pressed'), 'true');
  b2.click();
  await flush();
  assert.equal(n.textContent, 'Κύτταρο');
  assert.equal(n.getAttribute('data-mt-state'), null);
  assert.equal(document.querySelectorAll('.mt-badge').length, 0);
});

test('a private item gets no toggle and never reaches the provider', () => {
  const { ui, list, sent } = setup();
  const n = document.createElement('b');
  n.textContent = 'Οι σημειώσεις μου';
  list.append(n);
  ui.mark(n, { language: 'el', kind: 'explore.pack', private: true });
  assert.equal(ui.toggle(null, [n]), null);
  assert.equal(sent.length, 0);
});

test('the bar: shown while something needs a translation; Translate all, then Show originals', async () => {
  const { ui, list, mk } = setup();
  const a = mk('Γενετική', 'el');
  const bar = ui.bar(null, list);
  document.body.prepend(bar);
  await flush();
  assert.ok(bar.classList.contains('mt-bar'));
  assert.equal(bar.hidden, false);
  bar.querySelector<HTMLButtonElement>('.mt-all')?.click();
  for (let i = 0; i < 5 && a.getAttribute('data-mt-state') !== 'mt'; i++) await flush();
  assert.equal(a.textContent, '[en] Γενετική');
  assert.equal(bar.querySelector('.mt-all')?.textContent.trim(), '🌐 Show originals');
  bar.querySelector<HTMLButtonElement>('.mt-all')?.click();
  await flush();
  assert.equal(a.textContent, 'Γενετική');
});

test('the panel: the consent, the switch, the provider, the caps, clear; with or without its heading', () => {
  const { ui, mt } = setup();
  const p = ui.panel(null);
  document.body.append(p);
  assert.ok(p.querySelector('.ns-label'));
  const on = p.querySelector<HTMLInputElement>('.mt-enable');
  assert.equal(on?.checked, true);
  on.click();
  assert.equal(mt.enabled(), false);
  assert.equal(p.querySelector<HTMLSelectElement>('.mt-provider')?.value, 'auto');
  assert.ok(p.querySelector('.mt-clear') && p.querySelector('.mt-dailyChars'));
  const bare = ui.panel(null, { heading: false });
  assert.ok(!bare.querySelector('.ns-label') && bare.querySelector('.mt-enable'));
});
