/* 🗄️ The vault's screens in a DOM (happy-dom): the folders by school with their counts, a filter into the address and
   its removable chip, the files view grouped and sorted, the format check by the first bytes in the learner's words, the
   upload's form asking for what is still needed. Over a vault service and a host made for the test. */
import '../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ok } from '../kernel/result.ts';
import { catalogI18n } from '../adapters/memory/i18n.ts';
import type { VaultFile } from '../ports/vault.ts';
import { defineUi } from '../ui/index.ts';
import { arb, mount, settle, uiCatalogs } from '../ui/test/services.ts';
import type { CommunityHost } from '../features/community/ui/host.ts';
import type { VaultService } from '../features/vault/application/vault.ts';
import { fieldGraph } from '../features/vault/domain/index.ts';
import { NoemaVaultForm } from '../features/vault/ui/form.ts';
import { VaultUi } from '../features/vault/ui/model.ts';
import { NoemaVaultPage } from '../features/vault/ui/page.ts';
import { NoemaVaultUpload } from '../features/vault/ui/upload.ts';

defineUi();
for (const [tag, c] of [
  ['noema-vault-page', NoemaVaultPage],
  ['noema-vault-form', NoemaVaultForm],
  ['noema-vault-upload', NoemaVaultUpload],
] as const)
  if (!customElements.get(tag)) customElements.define(tag, c);
afterEach(() => {
  document.body.replaceChildren();
});

const VAULT_EN = arb(new URL('../../i18n/vault/en.arb', import.meta.url).pathname);
const i18n = catalogI18n(
  {
    en: Object.fromEntries(
      Object.entries({ ...uiCatalogs()['en'], ...VAULT_EN }).map(([k, v]) => [k, v.replace(/\{(\w+), number\}/g, '{$1}')]),
    ),
  },
  'en',
);

const FILES: VaultFile[] = [
  {
    id: 'a',
    title: 'Genetics notes',
    kind: 'notes',
    university: 'Crete',
    department: 'Biology',
    course: 'Genetics',
    year: 2023,
    semester: 3,
    language: 'en',
    fields: ['bio'],
    file_name: 'a.pdf',
    created_at: '2026-01-02',
  },
  {
    id: 'b',
    title: 'Genetics exam',
    kind: 'exam',
    university: 'Crete',
    department: 'Biology',
    course: 'Genetics',
    year: 2022,
    language: 'en',
    fields: ['bio'],
    file_name: 'b.pdf',
    has_solutions: true,
    created_at: '2026-01-01',
  },
  {
    id: 'c',
    title: 'Σημειώσεις',
    kind: 'notes',
    university: 'Athens',
    language: 'el',
    fields: ['bio'],
    file_name: 'c.pdf',
    created_at: '2026-01-03',
  },
];
const graph = fieldGraph([{ id: 'bio', names: { en: 'Biology' }, parents: [], status: 'accepted' }]);

function setup(): { el: NoemaVaultPage; addr: string[]; ui: VaultUi } {
  const addr: string[] = [];
  let hash = '#/vault';
  const settings: Record<string, string> = {};
  const host = {
    hash: () => hash,
    replace: (h: string) => {
      hash = h;
      addr.push(h);
    },
    go: (h: string) => {
      hash = h;
    },
    session: () => ({ userId: 'me' }),
    account: () => ({ id: 'acc', kind: 'cloud' }),
    face: () => null,
    getAccountSetting: (n: string) => settings[n] ?? null,
    setAccountSetting: (n: string, v: string) => {
      settings[n] = v;
    },
    report: { catalogs: () => ({}) },
    overlay: (d: HTMLElement) => {
      document.body.append(d);
      return () => {
        d.remove();
      };
    },
  } as unknown as CommunityHost;
  const vault = {
    list: () => Promise.resolve(ok(FILES)),
    myRatings: () => Promise.resolve(ok({})),
    myReports: () => Promise.resolve(ok({})),
    loadFields: () => Promise.resolve(ok(graph)),
    fields: () => graph,
    suggest: () => Promise.resolve(ok([])),
  } as unknown as VaultService;
  const notify = { toast: () => undefined } as never;
  const ui = new VaultUi({
    host,
    notify,
    i18n: () => i18n,
    vault,
    groups: () => Promise.resolve([]),
    usedBytes: () => Promise.resolve(0),
    sendTo: null,
  });
  const el = document.createElement('noema-vault-page');
  el.deps = { host, notify, ui };
  mount({ i18n, clock: { now: () => 0 } as never, locales: { list: () => [], use: t => Promise.resolve(t) } }).append(el);
  return { el, addr, ui };
}
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));

describe('the vault page', () => {
  test('opens on the folders by school, each with its count; the count of files is the quiet last line', async () => {
    const { el } = setup();
    await tick();
    await settle(el);
    const rows = [...el.querySelectorAll('.vt-folder')].map(
      b => `${b.querySelector('b')?.textContent ?? ''} · ${b.querySelector('small')?.textContent ?? ''}`,
    );
    assert.deepEqual(rows, ['Crete · 2 files', 'Athens · 1 file']);
    assert.equal(el.querySelector('.vt-viewseg [data-v="folders"]')?.classList.contains('on'), true);
    assert.equal(el.querySelector('.vt-out')?.lastElementChild?.classList.contains('vt-count'), true);
  });

  test('a folder opens its departments; the files view groups nothing and sorts the newest first', async () => {
    const { el, addr } = setup();
    await tick();
    await settle(el);
    el.querySelector<HTMLButtonElement>('.vt-folder[data-v="Crete"]')?.click();
    await settle(el);
    assert.match(addr.at(-1) ?? '', /f=Crete/);
    assert.match(el.querySelector('.vt-path')?.textContent ?? '', /All schools\s*›\s*Crete/);
    el.querySelector<HTMLButtonElement>('.vt-viewseg [data-v="files"]')?.click();
    await settle(el);
    assert.deepEqual(
      [...el.querySelectorAll('.vt-file')].map(f => f.getAttribute('data-id')),
      ['c', 'a', 'b'],
    );
  });

  test('a filter goes into the address and shows as a removable chip', async () => {
    const { el, addr } = setup();
    await tick();
    await settle(el);
    el.querySelector<HTMLButtonElement>('.vt-viewseg [data-v="files"]')?.click();
    await settle(el);
    el.querySelector<HTMLElement>('.vt-filtbtn')?.click();
    await settle(document.body);
    const chip = document.querySelector<HTMLButtonElement>('.vt-filtsheet [data-f="sol"][data-v="1"]');
    assert.ok(chip, 'the filters sheet has the contents chips');
    chip.click();
    await settle(el);
    assert.match(addr.at(-1) ?? '', /sol=1/);
    assert.deepEqual(
      [...el.querySelectorAll('.vt-file')].map(f => f.getAttribute('data-id')),
      ['b'],
    );
    const on = el.querySelector<HTMLButtonElement>('.vt-active .vt-chip[data-f="sol"]');
    assert.ok(on?.getAttribute('aria-label')?.includes('Has solutions'));
    on?.click();
    await settle(el);
    assert.equal(el.querySelectorAll('.vt-file').length, 3);
  });
});

describe('the vault model', () => {
  test('the first bytes decide: a program renamed .pdf is refused in the learner’s words', async () => {
    const { ui } = setup();
    const file = (name: string, text: string): { name: string; size: number; slice: () => Blob } => ({
      name,
      size: text.length,
      slice: () => new Blob([text]),
    });
    assert.equal(await ui.checkFile(file('a.pdf', '%PDF-1.7')), '');
    assert.match(await ui.checkFile(file('a.pdf', 'MZ program')), /not what its name says/);
    assert.match(await ui.checkFile(file('a.exe', 'MZ')), /does not take/);
  });
  test('a search finds a file by the words of its type, in the menus’ language', () => {
    const { ui } = setup();
    assert.deepEqual(
      ui.filter(FILES, { q: 'solutions' }).map(f => f.id),
      ['b'],
    );
  });
});

describe('the upload form', () => {
  test('only the type, the fields and the languages are required', async () => {
    const { el } = setup();
    await tick();
    const up = document.createElement('noema-vault-upload');
    up.deps = el.deps;
    el.append(up);
    await settle(up);
    const form = up.querySelector('noema-vault-form');
    assert.ok(form);
    const r = form.read();
    assert.ok('error' in r && /Type, Fields/.test(r.error), JSON.stringify(r));
    assert.equal(form.querySelector('[data-k="course"]')?.getAttribute('placeholder'), '(exactly as your school calls it)');
  });
});
