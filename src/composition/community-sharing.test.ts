/* 🔗 Sharing in a DOM (happy-dom): Explore's sections and search, the share dialog's licence warning (nothing is
   published before it is acknowledged), the bell's rows (a share: Accept / Reject; news: ✕). Over a host made for the
   test. */
import '../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { catalogI18n } from '../adapters/memory/i18n.ts';
import { defineUi } from '../ui/index.ts';
import { arb, mount, settle, uiCatalogs } from '../ui/test/services.ts';
import type { CommunityHost, NoteItem, PublicItem, SharePrep } from '../features/community/ui/host.ts';
import { matches, NoemaExplorePage, sections } from '../features/sharing/ui/explore.ts';
import { NoemaShareRow, richParts } from '../features/sharing/ui/notes.ts';
import { NoemaSharePanel } from '../features/sharing/ui/share.ts';

defineUi();
for (const [tag, ctor] of [
  ['noema-explore-page', NoemaExplorePage],
  ['noema-share-panel', NoemaSharePanel],
  ['noema-share-row', NoemaShareRow],
] as const)
  if (!customElements.get(tag)) customElements.define(tag, ctor);
afterEach(() => {
  document.body.replaceChildren();
});

const EN = {
  ...arb(new URL('../../i18n/loader/en.arb', import.meta.url).pathname),
  ...arb(new URL('../../i18n/shell/en.arb', import.meta.url).pathname),
};
const i18n = catalogI18n(
  {
    en: Object.fromEntries(Object.entries({ ...uiCatalogs()['en'], ...EN }).map(([k, v]) => [k, v.replace(/\{(\w+), number\}/g, '{$1}')])),
  },
  'en',
);
const ITEMS: PublicItem[] = [
  { id: 'heart', title: 'Heart test', domain: 'health', owner: 'anna', owner_name: 'Anna' },
  { id: 'db', title: 'Databricks', domain: 'cs', description: 'Spark and tables' },
  { id: 'x', title: 'Odd one', domain: 'nowhere' },
];
function root(): HTMLElement {
  return mount({ i18n, clock: { now: () => 0 } as never, locales: { list: () => [], use: t => Promise.resolve(t) } });
}

describe('🧭 Explore', () => {
  test('one section per domain in the host’s order, the unknown ones under Other; the field matches title, words, owner', () => {
    assert.deepEqual(
      sections(ITEMS, ['cs', 'health']).map(([d, l]) => [d, l.map(x => x.id)]),
      [
        ['cs', ['db']],
        ['health', ['heart']],
        ['other', ['x']],
      ],
    );
    assert.deepEqual(
      matches(ITEMS, 'anna').map(x => x.id),
      ['heart'],
    );
    assert.deepEqual(
      matches(ITEMS, 'spark').map(x => x.id),
      ['db'],
    );
  });
  test('the page: closed sections; typing shows only the matches', async () => {
    const host = {
      publicSubjects: () => Promise.resolve(ITEMS),
      domains: () => ['cs', 'health'],
      translatable: () => undefined,
      translateBar: () => null,
      langTag: () => null,
    } as unknown as CommunityHost;
    const el = document.createElement('noema-explore-page');
    el.deps = { host, notify: { toast: () => undefined } as never };
    el.kind = 'subjects';
    root().append(el);
    await settle(el);
    await new Promise(r => setTimeout(r, 0));
    await settle(el);
    assert.deepEqual(
      [...el.querySelectorAll('details.ex-dom')].map(d => [d.getAttribute('data-dom'), (d as HTMLDetailsElement).open]),
      [
        ['cs', false],
        ['health', false],
        ['other', false],
      ],
    );
    const q = el.querySelector<HTMLInputElement>('.ex-q');
    assert.ok(q);
    q.value = 'heart';
    q.dispatchEvent(new Event('input'));
    await settle(el);
    assert.deepEqual(
      [...el.querySelectorAll('.ex-results .ex-item')].map(b => b.getAttribute('data-id')),
      ['heart'],
    );
    assert.ok(el.querySelector('.ex-row:has(.ex-item[data-id="heart"]) .ex-who'), 'the person who shares it: their page');
  });
});

describe('🔗 the share dialog', () => {
  test('pictures not openly licensed: nothing is published before the warning is acknowledged', async () => {
    let published = 0;
    const share = {
      published: () => Promise.resolve(null),
      sent: () => Promise.resolve([]),
      publish: () => {
        published++;
        return Promise.resolve();
      },
    };
    const host = { share, account: () => ({ kind: 'cloud' }), session: () => ({}) } as unknown as CommunityHost;
    const el = document.createElement('noema-share-panel');
    el.deps = { host, notify: { toast: () => undefined } as never, i18n };
    el.cloud = true;
    el.prep = {
      subject: { id: 's', title: 'Heart test' },
      counts: { chapters: 1, exercises: 2, pictures: 3 },
      restricted: 2,
      files: { n: 2, bytes: 4096 },
    } satisfies SharePrep;
    root().append(el);
    await settle(el);
    assert.match(el.querySelector('.nx-files')?.textContent ?? '', /Include its 2 source files/);
    el.querySelector<HTMLElement>('.nx-publish')?.click();
    await settle(el);
    assert.equal(published, 0);
    const box = el.querySelector<HTMLInputElement>('.nx-warn input');
    assert.ok(box);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    el.querySelector<HTMLElement>('.nx-publish')?.click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(published, 1);
  });
});

describe('🔔 the bell’s rows', () => {
  test('{who} and {title} in bold inside the catalog’s words', () => {
    const parts = richParts('\u0001who\u0002 wants to share “\u0001title\u0002” with you', {
      who: document.createElement('b'),
      title: document.createElement('i'),
    });
    assert.equal(parts.length, 4);
    assert.equal(parts[1], ' wants to share “');
  });
  test('a share: who, what, Accept and Reject; news: ✕ clears it', async () => {
    const done: string[] = [];
    const notes = {
      accept: () => {
        done.push('accept');
        return Promise.resolve({ title: 'Heart test' });
      },
      reject: () => Promise.resolve(),
      update: () => Promise.resolve(),
      dismiss: (id: string) => {
        done.push('dismiss ' + id);
      },
      clear: () => undefined,
    };
    const host = { notes, translatable: () => undefined, translateBar: () => null, ago: () => 'just now' } as unknown as CommunityHost;
    const share: NoteItem = { id: 'sh1', title: 'Heart test', from_name: 'Anna', meta: { counts: { chapters: 1, exercises: 4 } } };
    const row = document.createElement('noema-share-row');
    row.deps = { host, notify: { toast: () => undefined } as never };
    row.item = share;
    root().append(row);
    await settle(row);
    assert.match(row.textContent, /Anna wants to share “Heart test” with you/);
    assert.ok(row.querySelector('.nx-accept') && row.querySelector('.nx-reject') && row.querySelector('.nx-details'));
    row.querySelector<HTMLElement>('.nx-accept')?.click();
    await new Promise(r => setTimeout(r, 0));
    const news = document.createElement('noema-share-row');
    news.deps = row.deps;
    news.item = { id: 'n1', kind: 'notice', title: '', text: 'Something arrived', at: 1 };
    root().append(news);
    await settle(news);
    news.querySelector<HTMLElement>('.nx-dismiss')?.click();
    assert.deepEqual(done, ['accept', 'dismiss n1']);
  });
});
