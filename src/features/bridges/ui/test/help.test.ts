/* 文A the language help's screens in a DOM (happy-dom): a subject's badge (its languages, weak when drafts only, none for a
   language course) and the panel (on/off, the native language, the levels) over a memory bridges service. The page's words,
   the card and the phone's sheet in a real browser: tests/bridge.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { catalogI18n } from '../../../../adapters/memory/i18n.ts';
import { arb } from '../../../../ui/test/services.ts';
import { createBridgeService, type BridgePorts } from '../../application/bridges.ts';
import { bridgeUi } from '../help.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const CAT = arb(new URL('../../../../../i18n/bridge/en.arb', import.meta.url).pathname);

function ui(index: Record<string, unknown> = {}) {
  const kv = new Map<string, unknown>([['u1:bridges', index]]);
  const ports: BridgePorts = {
    account: acc => acc ?? 'u1',
    uiLocale: () => 'en',
    read: (acc, n) => kv.get(`${String(acc)}:${n}`) ?? null,
    write: (acc, n, v) => kv.set(`${String(acc)}:${n}`, v),
    putSettings: (acc, patch) =>
      kv.set(`${String(acc)}:settings`, { ...(kv.get(`${String(acc)}:settings`) as object | undefined), ...patch }),
    registry: () => null,
    cache: { get: () => Promise.resolve(null), put: () => Promise.resolve(), del: () => Promise.resolve() },
    cloud: {
      isAccount: () => false,
      download: () => Promise.resolve(null),
      upload: () => Promise.resolve(),
      putRow: () => undefined,
      deleteRow: () => undefined,
    },
    library: () => Promise.resolve(null),
    subjects: () => Promise.resolve([]),
    loadSubject: () => Promise.resolve(null),
    check: () => null,
    hash: s => String(s.length),
    now: () => 1,
  };
  const bridges = createBridgeService(ports);
  const names: Record<string, string> = { ru: 'Русский', ar: 'العربية', en: 'English' };
  const u = bridgeUi({
    bridges,
    i18n: catalogI18n({ en: CAT }),
    words: () => null,
    open: () => null,
    langName: c => c,
    endonym: c => names[c] ?? c,
    today: () => '2026-11-17',
    now: () => 1,
    speaker: () => null,
    document,
  });
  return { u, bridges, kv };
}

test('the badge: its languages, the learner’s first; weak while only drafts; none for a language course or no bridge', () => {
  const { u, bridges } = ui({ p1: { ru: { v: 'a', status: 'draft' }, ar: { v: 'b', status: 'reviewed', coverage: 1 } } });
  assert.equal(u.tag({ id: 'p2', language: 'en' }), null);
  assert.equal(u.tag({ id: 'lang:el', language: 'en' }), null);
  bridges.setNative(null, 'ru');
  const t = u.tag({ id: 'p1', language: 'en' });
  assert.ok(t);
  document.body.append(t);
  assert.ok(t.classList.contains('nb-tag'));
  assert.ok(!t.classList.contains('nb-weak'));
  assert.match(t.textContent, /文A RU \+1/);
  assert.match(t.getAttribute('aria-label') ?? '', /Русский/);
  const { u: u2 } = ui({ p1: { ru: { v: 'a', status: 'draft' } } });
  assert.ok(u2.tag({ id: 'p1', language: 'en' })?.classList.contains('nb-weak'));
});

test('the panel: on and off, the native language, the three levels — each change kept', () => {
  const { u, bridges } = ui({ p1: { ru: { v: 'a', status: 'draft' } } });
  let changes = 0;
  const p = u.panel(null, {
    onChange: () => {
      changes++;
    },
  });
  document.body.append(p);
  assert.ok(p.classList.contains('nb-panel'));
  const radios = [...p.querySelectorAll<HTMLInputElement>('input[name="nb-level"]')];
  assert.deepEqual(
    radios.map(r => r.value),
    ['open', 'balanced', 'tap'],
  );
  radios[2]?.click();
  assert.equal(bridges.settings().level, 'tap');
  const on = p.querySelector<HTMLInputElement>('.nb-on');
  assert.ok(on);
  on.checked = false;
  on.dispatchEvent(new Event('change'));
  assert.equal(bridges.settings().on, false);
  const sel = p.querySelector<HTMLSelectElement>('.nb-natsel');
  assert.ok(sel);
  assert.ok(
    [...sel.options].some(o => o.value === 'en'),
    'the interface language is offered too',
  );
  sel.value = 'en';
  sel.dispatchEvent(new Event('change'));
  assert.equal(bridges.native(), 'en');
  assert.ok(changes >= 3);
});
