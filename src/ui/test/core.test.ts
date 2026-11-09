/* The UI's core: keyboard movement, placement of floating panels, the typed routes and the router, the overlay stack,
   the services' context protocol, the appearance. */
import './dom.ts';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyAppearance, isCharacter, resolvedScheme, themeColour } from '../core/appearance.ts';
import { deepActiveElement, rememberFocus } from '../core/focus.ts';
import { moveIndex, typeahead } from '../core/keys.ts';
import { openOverlay, openOverlays } from '../core/overlays.ts';
import { place } from '../core/place.ts';
import { provideServices, requestServices } from '../core/services.ts';
import { createRouter, memoryHash } from '../router/router.ts';
import { defineRoutes, splitHash, type ParamsOf } from '../router/routes.ts';
import { CHARACTERS } from '../tokens/characters.ts';
import { testServices } from './services.ts';

describe('keys', () => {
  const v = { orientation: 'vertical', dir: 'ltr' } as const;
  test('↓ ↑ wrap, Home End, other keys are not movement', () => {
    assert.equal(moveIndex('ArrowDown', 0, 3, v), 1);
    assert.equal(moveIndex('ArrowDown', 2, 3, v), 0);
    assert.equal(moveIndex('ArrowUp', 0, 3, v), 2);
    assert.equal(moveIndex('ArrowDown', 2, 3, { ...v, wrap: false }), 2);
    assert.equal(moveIndex('Home', 2, 3, v), 0);
    assert.equal(moveIndex('End', 0, 3, v), 2);
    assert.equal(moveIndex('ArrowRight', 0, 3, v), null);
    assert.equal(moveIndex('a', 0, 3, v), null);
    assert.equal(moveIndex('ArrowDown', 0, 0, v), null);
  });
  test('disabled items are skipped, Home and End land on the first and last usable', () => {
    const skip = (i: number): boolean => i === 1 || i === 3;
    assert.equal(moveIndex('ArrowDown', 0, 4, { ...v, skip }), 2);
    assert.equal(moveIndex('ArrowDown', 2, 4, { ...v, skip }), 0);
    assert.equal(moveIndex('End', 0, 4, { ...v, skip }), 2);
    assert.equal(moveIndex('Home', 2, 4, { ...v, skip: i => i === 0 }), 1);
  });
  test('horizontal: → is forward left to right, ← is forward right to left', () => {
    assert.equal(moveIndex('ArrowRight', 0, 3, { orientation: 'horizontal', dir: 'ltr' }), 1);
    assert.equal(moveIndex('ArrowLeft', 0, 3, { orientation: 'horizontal', dir: 'rtl' }), 1);
    assert.equal(moveIndex('ArrowRight', 0, 3, { orientation: 'horizontal', dir: 'rtl' }), 2);
    assert.equal(moveIndex('ArrowDown', 0, 3, { orientation: 'horizontal', dir: 'ltr' }), null);
  });
  test('type-ahead: the next item that starts with the letters, accents and case ignored, from after the current one', () => {
    const labels = ['Edit', 'Export', 'Ελληνικά', 'Énergie', 'Share'];
    assert.equal(typeahead(labels, 'e', 0), 1);
    assert.equal(typeahead(labels, 'e', 1), 3);
    assert.equal(typeahead(labels, 'ex', -1), 1);
    assert.equal(typeahead(labels, 'ελ', 0), 2);
    assert.equal(typeahead(labels, 'ENER', 0), 3);
    assert.equal(typeahead(labels, 'z', 0), null);
    assert.equal(typeahead(labels, '', 0), null);
  });
});

describe('place', () => {
  const phone = { width: 320, height: 640 };
  test('below the control when it fits, aligned to its start (ltr) or its end edge', () => {
    const a = { left: 20, top: 100, width: 40, height: 40 };
    const p = place(a, { width: 200, height: 150 }, phone, { dir: 'ltr', align: 'start' });
    assert.deepEqual([p.side, p.left, p.top], ['below', 20, 146]);
    const e = place(a, { width: 200, height: 150 }, phone, { dir: 'ltr', align: 'end' });
    assert.equal(e.left, 8, 'the end edge would leave the screen: kept inside its margin');
  });
  test('right to left: start is the right edge', () => {
    const a = { left: 260, top: 100, width: 40, height: 40 };
    const p = place(a, { width: 200, height: 100 }, phone, { dir: 'rtl', align: 'start' });
    assert.equal(p.left, 100);
    const e = place(a, { width: 200, height: 100 }, phone, { dir: 'rtl', align: 'end' });
    assert.equal(e.left, 112, 'the end (left) edge of the control, clamped to the margin on the right');
  });
  test('above when there is no room below, with the height it may use', () => {
    const p = place({ left: 10, top: 560, width: 40, height: 40 }, { width: 200, height: 300 }, phone, { dir: 'ltr' });
    assert.equal(p.side, 'above');
    assert.equal(p.top, 560 - 6 - 300);
    assert.equal(p.maxHeight, 560 - 6 - 8);
  });
  test('a panel wider than a 320 px screen gets the screen width minus the margins: no sideways scrolling', () => {
    const p = place({ left: 280, top: 10, width: 40, height: 40 }, { width: 500, height: 100 }, phone, { dir: 'ltr', align: 'end' });
    assert.equal(p.maxWidth, 304);
    assert.equal(p.left, 8);
    assert.ok(p.left + Math.min(500, p.maxWidth) <= 320 - 8);
  });
  test('centred tips', () => {
    const p = place({ left: 100, top: 10, width: 24, height: 24 }, { width: 100, height: 40 }, phone, { dir: 'ltr', align: 'center' });
    assert.equal(p.left, 62);
  });
});

describe('routes', () => {
  const routes = defineRoutes({ today: '/', chapter: '/ch/:id', map: '/map/:id/:step?', files: '/files/*path', search: '/search' });
  test('match: names, parameters (decoded), the optional last one, the rest, the query', () => {
    assert.deepEqual(routes.match(''), { name: 'today', params: {}, query: {} });
    assert.deepEqual(routes.match('#/'), { name: 'today', params: {}, query: {} });
    assert.deepEqual(routes.match('#/ch/ch%202'), { name: 'chapter', params: { id: 'ch 2' }, query: {} });
    assert.deepEqual(routes.match('#/map/r1'), { name: 'map', params: { id: 'r1' }, query: {} });
    assert.deepEqual(routes.match('#/map/r1/s2?view=list'), { name: 'map', params: { id: 'r1', step: 's2' }, query: { view: 'list' } });
    assert.deepEqual(routes.match('#/files/a/b%2Fc/d.pdf'), { name: 'files', params: { path: 'a/b/c/d.pdf' }, query: {} });
    assert.deepEqual(routes.match('#/search?q=%CE%BD%CF%8C%CE%BC%CE%BF%CF%82'), { name: 'search', params: {}, query: { q: 'νόμος' } });
    assert.equal(routes.match('#/ch'), null);
    assert.equal(routes.match('#/ch/a/b'), null);
    assert.equal(routes.match('#/elsewhere'), null);
    assert.deepEqual(
      routes.match('#/ch/%E0%A4'),
      { name: 'chapter', params: { id: '%E0%A4' }, query: {} },
      'a broken escape stays as written',
    );
  });
  test('href: encoded, the optional segment left out, the query; a missing parameter is a programming error', () => {
    assert.equal(routes.href('today'), '#/');
    assert.equal(routes.href('chapter', { id: 'ch 2/α' }), '#/ch/ch%202%2F%CE%B1');
    assert.equal(routes.href('map', { id: 'r1' }), '#/map/r1');
    assert.equal(routes.href('map', { id: 'r1', step: 's2' }), '#/map/r1/s2');
    assert.equal(routes.href('files', { path: 'a b/c' }), '#/files/a%20b/c');
    assert.equal(routes.href('search', {}, { q: 'ohm law' }), '#/search?q=ohm+law');
    assert.throws(() => (routes.href as (n: string, p: object) => string)('chapter', {}), /needs id/);
    for (const [name, params] of [
      ['chapter', { id: 'x y' }],
      ['map', { id: 'a', step: 'b' }],
      ['files', { path: 'p/q' }],
    ] as const)
      assert.deepEqual(routes.match(routes.href(name, params))?.params, params, `${name} round trip`);
  });
  test('the parameters are typed from the pattern', () => {
    const p: ParamsOf<'/map/:id/:step?'> = { id: 'r1' };
    assert.equal(p.id, 'r1');
    // @ts-expect-error: id is required
    const q: ParamsOf<'/map/:id/:step?'> = { step: 's' };
    assert.ok(q);
    // @ts-expect-error: the route needs its id
    assert.throws(() => routes.href('chapter'));
  });
  test('a bad table is refused when it is defined', () => {
    assert.throws(() => defineRoutes({ a: '/x/:y?/z' }), /only the last segment/);
    assert.throws(() => defineRoutes({ a: '/x/*rest/z' }), /must be the last/);
    assert.throws(() => defineRoutes({ a: '/x/:1bad' }), /not a parameter name/);
  });
  test('splitHash', () => {
    assert.deepEqual(splitHash('#/a//b/?x=1&y=%20'), { path: ['a', 'b'], query: { x: '1', y: ' ' } });
  });
});

describe('router', () => {
  const routes = defineRoutes({ kit: '/ui-kit', section: '/ui-kit/:section' });
  test('subscribe hears now and every change; navigate pushes, replace replaces; back; an unknown address is null', () => {
    const loc = memoryHash('#/ui-kit');
    const r = createRouter(routes, loc);
    const seen: (string | null)[] = [];
    const stop = r.subscribe(m => seen.push(m ? `${m.name}:${m.name === 'section' ? m.params.section : ''}` : null));
    r.navigate(routes.href('section', { section: 'forms' }));
    r.navigate(routes.href('section', { section: 'forms' })); // the same address: nothing
    r.navigate(routes.href('section', { section: 'look' }), { replace: true });
    assert.deepEqual(loc.history, ['#/ui-kit', '#/ui-kit/look']);
    loc.back();
    loc.set('#/elsewhere', { replace: false });
    assert.deepEqual(seen, ['kit:', 'section:forms', 'section:look', 'kit:', null]);
    assert.equal(r.current(), null);
    stop();
    loc.set('#/ui-kit', { replace: false });
    assert.equal(seen.length, 5, 'no calls after unsubscribing');
    assert.equal(r.current()?.name, 'kit');
    r.dispose();
  });
});

describe('overlays', () => {
  test('Escape closes the top overlay only; a press outside closes light-dismiss ones down to the first it is inside of', () => {
    const a = document.createElement('div'),
      b = document.createElement('div'),
      c = document.createElement('div');
    document.body.append(a, b, c);
    const closed: string[] = [];
    const rmA = openOverlay({ host: a, lightDismiss: false, close: r => closed.push('a:' + r) });
    const rmB = openOverlay({ host: b, lightDismiss: true, close: r => closed.push('b:' + r) });
    const rmC = openOverlay({ host: c, lightDismiss: true, keep: [b], close: r => closed.push('c:' + r) });
    assert.equal(openOverlays(), 3);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(esc);
    assert.deepEqual(closed, ['c:escape']);
    assert.ok(esc.defaultPrevented, 'the Escape is used: a native dialog under it does not close by itself');
    rmC();
    // a press inside b: nothing closes
    b.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    assert.deepEqual(closed, ['c:escape']);
    // a press on the page: b closes (light dismiss), a stays (modal)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    assert.deepEqual(closed, ['c:escape', 'b:outside']);
    rmB();
    const rmD = openOverlay({ host: c, lightDismiss: true, escape: false, close: r => closed.push('d:' + r) });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.deepEqual(closed, ['c:escape', 'b:outside'], 'an overlay that must be answered ignores Escape');
    rmD();
    rmA();
    assert.equal(openOverlays(), 0);
    a.remove();
    b.remove();
    c.remove();
  });
});

describe('services and focus', () => {
  test('the nearest provider answers; none: null', () => {
    const outer = document.createElement('div'),
      inner = document.createElement('div'),
      leaf = document.createElement('span');
    outer.append(inner);
    inner.append(leaf);
    document.body.append(outer);
    const s1 = testServices('en'),
      s2 = testServices('el');
    const stop1 = provideServices(outer, s1);
    assert.equal(requestServices(leaf), s1);
    const stop2 = provideServices(inner, s2);
    assert.equal(requestServices(leaf), s2);
    stop2();
    stop1();
    assert.equal(requestServices(leaf), null);
    outer.remove();
  });
  test('the focused element inside shadow roots, and focus given back', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const btn = document.createElement('button');
    root.append(btn);
    btn.focus();
    assert.equal(deepActiveElement(), btn);
    const back = rememberFocus();
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    back();
    assert.equal(deepActiveElement(), btn);
    host.remove();
    other.remove();
  });
});

describe('appearance', () => {
  test('scheme, character and motion on the root; theme-color from the character’s tokens', () => {
    const root = document.documentElement;
    const stop = applyAppearance(root, { scheme: 'dark', character: 'owl', motion: 'reduced' });
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(root.dataset.m, 'owl');
    assert.equal(root.dataset.motion, 'reduced');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    assert.equal(meta?.content, CHARACTERS.owl.dark.bg);
    assert.ok(document.getElementById('noema-ui-switches')?.textContent.includes('--u-motion:0'));
    stop();
    const stop2 = applyAppearance(root, { scheme: 'system', character: 'robot', motion: 'system' });
    assert.equal(root.dataset.theme, undefined);
    assert.equal(root.dataset.motion, undefined);
    assert.equal(root.dataset.m, 'robot');
    assert.equal(meta.content, themeColour('robot', resolvedScheme('system', window)));
    assert.equal(document.querySelectorAll('#noema-ui-switches').length, 1, 'the switches are installed once');
    stop2();
    // an unknown character falls back to the default one
    applyAppearance(root, { scheme: 'light', character: 'nobody' as 'owl', motion: 'full' })();
    assert.equal(root.dataset.m, 'hedge');
    assert.ok(isCharacter('fruit') && !isCharacter('nobody'));
  });
});
