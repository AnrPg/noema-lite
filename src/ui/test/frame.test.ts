/* The app frame and its overlay layer in a DOM (happy-dom): landmarks, the current tab and crumb, the interface
   language and direction (also when it changes), the skip link, a yes / no question. */
import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { deepActiveElement } from '../core/focus.ts';
import { confirmDialog } from '../frame/layer.ts';
import { defineUi } from '../index.ts';
import { $, key, mount, settle, testServices } from './services.ts';

defineUi();
afterEach(() => {
  document.body.replaceChildren();
});

async function frame(services = testServices()): Promise<HTMLElementTagNameMap['noema-app-frame']> {
  const host = mount(services);
  const f = document.createElement('noema-app-frame');
  f.tabs = [
    { id: 'home', label: 'Home', icon: 'home', href: '#/' },
    { id: 'study', label: 'Study', icon: 'book', href: '#/study', badge: 5 },
    { id: 'me', label: 'Me', icon: 'user', href: '#/me' },
  ];
  f.current = 'study';
  f.crumbs = [{ label: 'Study', href: '#/study' }, { label: 'Mechanics' }];
  f.back = '#/study';
  const p = document.createElement('p');
  p.textContent = 'content';
  f.append(p);
  host.append(f);
  await settle(host);
  return f;
}

describe('app frame', () => {
  test('one banner, a named navigation for the tabs and one for the crumbs, the main region', async () => {
    const f = await frame();
    assert.ok($(f, 'header.top'));
    assert.equal($(f, 'nav.tabs').getAttribute('aria-label'), 'Main');
    assert.equal($(f, 'nav.crumbs').getAttribute('aria-label'), 'Where you are');
    assert.equal($(f, 'main').id, 'main');
    assert.equal($(f, 'a.back').getAttribute('aria-label'), 'Back');
    const tabs = [...(f.shadowRoot?.querySelectorAll('a.tab') ?? [])];
    assert.deepEqual(
      tabs.map(t => t.getAttribute('aria-current')),
      [null, 'page', null],
    );
    assert.match(tabs[1]?.textContent ?? '', /waiting: 5/);
    const here = $(f, '.here');
    assert.equal(here.textContent, 'Mechanics');
    assert.equal(here.getAttribute('aria-current'), 'page');
    assert.equal(f.hasAttribute('many'), false);
  });
  test('“Skip to the content” puts the focus on main', async () => {
    const f = await frame();
    const skip = $(f, 'button.skip');
    assert.equal(skip.textContent.trim(), 'Skip to the content');
    skip.click();
    assert.equal(deepActiveElement(), f.main);
  });
  test('the frame speaks the interface language: lang and dir follow the locale, also when it changes', async () => {
    const s = testServices();
    const f = await frame(s);
    assert.deepEqual([f.lang, f.dir], ['en', 'ltr']);
    s.i18n.use('ar-EG');
    await settle(f);
    assert.deepEqual([f.lang, f.dir], ['ar-EG', 'rtl']);
    assert.notEqual($(f, 'nav.tabs').getAttribute('aria-label'), 'Main');
    s.i18n.use('de');
    await settle(f);
    assert.deepEqual([f.lang, f.dir], ['de', 'ltr']);
  });
  test('more than four tabs: the frame says so (the names of the others hide on narrow phones)', async () => {
    const f = await frame();
    f.tabs = [...f.tabs, { id: 'a', label: 'A', icon: 'star', href: '#/a' }, { id: 'b', label: 'B', icon: 'star', href: '#/b' }];
    await settle(f);
    assert.ok(f.hasAttribute('many'));
  });
});

describe('overlay layer', () => {
  test('the layer holds the toaster and mounts elements', async () => {
    const f = await frame();
    const layer = f.layer;
    assert.equal(layer.toaster.localName, 'noema-toaster');
    const x = document.createElement('div');
    const remove = layer.mount(x);
    assert.equal(x.parentElement, layer);
    remove();
    assert.equal(x.parentElement, null);
  });
  test('a yes / no question: focus on the safe answer; ok → true, Escape → false', async () => {
    const f = await frame();
    const ask = (): Promise<boolean> =>
      confirmDialog(f.layer, { heading: 'Reset?', text: 'All progress', ok: 'Reset', cancel: 'Keep', danger: true });
    const first = ask();
    await settle(f.layer);
    const dlg = f.layer.querySelector('noema-dialog');
    assert.ok(dlg?.open);
    const [cancel, ok] = [...dlg.querySelectorAll('noema-button')];
    assert.equal(cancel?.textContent, 'Keep');
    assert.equal(ok?.variant, 'danger');
    // the dialog focuses the [autofocus] child; happy-dom does not delegate focus into a shadow root (tests/ui_kit.js does)
    assert.ok(cancel.hasAttribute('autofocus'));
    ok.click();
    assert.equal(await first, true);
    assert.equal(f.layer.querySelector('noema-dialog'), null, 'taken out of the layer');
    const second = ask();
    await settle(f.layer);
    key(document.body, 'Escape');
    assert.equal(await second, false);
  });
});
