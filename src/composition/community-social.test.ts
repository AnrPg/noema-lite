/* 👥 The people screens in a DOM (happy-dom): #/people's three tabs with what waits on each, the buddies tab's
   requests and their one next step, the server's refusals in the learner's words. Over a social service and a host
   made for the test. */
import '../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { catalogI18n } from '../adapters/memory/i18n.ts';
import { ok } from '../kernel/result.ts';
import { memoryStorage } from '../adapters/memory/storage.ts';
import { defineUi } from '../ui/index.ts';
import { arb, mount, settle, uiCatalogs } from '../ui/test/services.ts';
import type { CommunityHost } from '../features/community/ui/host.ts';
import type { VaultUi } from '../features/vault/ui/model.ts';
import type { SocialService, SocialState } from '../features/social/application/social.ts';
import { bondWith, requestsFor, waitingFor } from '../features/social/domain/index.ts';
import { NoemaPeoplePage } from '../features/social/ui/home.ts';
import { SocialUi } from '../features/social/ui/model.ts';

defineUi();
if (!customElements.get('noema-people-page')) customElements.define('noema-people-page', NoemaPeoplePage);
afterEach(() => {
  document.body.replaceChildren();
});

const EN = arb(new URL('../../i18n/social/en.arb', import.meta.url).pathname);
const i18n = catalogI18n(
  {
    en: Object.fromEntries(Object.entries({ ...uiCatalogs()['en'], ...EN }).map(([k, v]) => [k, v.replace(/\{(\w+), number\}/g, '{$1}')])),
  },
  'en',
);

function setup(): { el: NoemaPeoplePage; ui: SocialUi } {
  const S: SocialState = {
    mine: { user_id: 'me', display_name: 'Iro', findable: true },
    inbox: [
      { room: 'r1', kind: 'dm', status: 'joined', unread: 2, other: 'nikos', other_name: 'Nikos' },
      { room: 'g1', kind: 'group', status: 'invited', name: 'Genetics', members: 3 },
    ],
    buddies: [{ a: 'eleni', b: 'me', status: 'pending', asked_by: 'eleni' }],
    blocks: [],
    names: { eleni: { user_id: 'eleni', display_name: 'Eleni' } },
    loaded: true,
  };
  const svc = {
    state: S,
    me: () => 'me',
    onChange: (f: () => void) => {
      f();
      return () => undefined;
    },
    refresh: () => Promise.resolve(ok(undefined)),
    ensureMe: () => Promise.resolve(ok(S.mine)),
    requests: () => requestsFor('me', S.buddies),
    waiting: () => waitingFor('me', S.inbox, S.buddies),
    bond: (x: string) => bondWith(x, 'me', S.buddies, S.blocks),
  } as unknown as SocialService;
  const host = {
    account: () => ({ id: 'acc', kind: 'cloud' }),
    session: () => ({ userId: 'me' }),
    face: () => null,
    go: () => undefined,
  } as unknown as CommunityHost;
  const kv = memoryStorage().kv;
  const ui = new SocialUi({
    host,
    i18n: () => i18n,
    social: svc,
    device: kv,
    tab: kv,
    win: { setInterval: () => 0, clearInterval: () => undefined, document },
  });
  ui.markNoted();
  const el = document.createElement('noema-people-page');
  el.deps = { host, notify: { toast: () => undefined } as never, ui, vault: {} as VaultUi };
  mount({ i18n, clock: { now: () => 0 } as never, locales: { list: () => [], use: t => Promise.resolve(t) } }).append(el);
  return { el, ui };
}

describe('#/people', () => {
  test('three tabs; what waits shows on each (unread messages and an invitation; a buddy request)', async () => {
    const { el, ui } = setup();
    await settle(el);
    const tabs = [...el.querySelectorAll('.so-tabs [data-tab]')].map(b => [
      b.getAttribute('data-tab'),
      b.querySelector('.so-count')?.textContent ?? '',
    ]);
    assert.deepEqual(tabs, [
      ['chats', '3'],
      ['buddies', '1'],
      ['groups', ''],
    ]);
    assert.equal(ui.waiting(), 4);
    assert.equal(el.querySelectorAll('.so-invite[data-room="g1"]').length, 1);
    assert.equal(el.querySelectorAll('.so-room[data-room="r1"].unread').length, 1);
  });
  test('the buddies tab: the request, with Accept and Decline', async () => {
    const { el } = setup();
    await settle(el);
    el.querySelector<HTMLButtonElement>('.so-tabs [data-tab="buddies"]')?.click();
    await settle(el);
    const row = el.querySelector('.so-buddies .so-person[data-person="eleni"]');
    assert.ok(row);
    assert.equal(row.getAttribute('data-bond'), 'theyAsked');
    assert.match(row.querySelector('.so-act')?.textContent ?? '', /Accept/);
    assert.ok(row.querySelector('.so-decline'));
  });
  test('the server’s refusals are said in the learner’s words', () => {
    const { ui } = setup();
    assert.match(ui.why(new Error('they do not take messages from you')), /only from their study buddies/);
    assert.match(ui.why(new Error('storage quota: 1 of 52428800 bytes used')), /50 MB are full/);
  });
});
