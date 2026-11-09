/* The UI foundation (phase 3, src/ui; docs/ARCHITECTURE.md §6.3) in a real browser, through its demo #/ui-kit (development
   only: served from localhost), Playwright + Chromium:
     A. lazy: the start screen never asks for build/ui-kit.js; #/ui-kit loads it and shows the frame and the kit, no page error
     B. every section at 1280 px and 320 px: no sideways scrolling, every control at least 24 × 24 px (WCAG 2.5.8)
     C. the keyboard: a menu (↓ opens on the first item, Escape closes, focus back), a dialog (focus inside, Tab stays in
        it, Escape closes, focus back on its button), tabs (→ selects the next), the skip link, a yes / no question
     D. forms: the fields take part in their <form> (FormData of a submit), a missing name is said and focused
     E. the appearance: dark and a character kept after a reload; leaving #/ui-kit starts the older screens again
     F. right to left (ar-EG): the frame mirrors, still no sideways scrolling at 320 px
   (axe: tests/a11y.js audits #/ui-kit too.)
   Usage: node tests/ui_kit.js <prepared-repo-dir>   PW=<path to playwright> */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(100); } return false; };
const SECTIONS = ['basics', 'overlays', 'forms', 'look'];
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
/** the element that has the focus, through the shadow roots: "tag#id.class" (with its shadow host's tag) */
const focused = page => page.evaluate(() => {
  let a = document.activeElement; const hosts = [];
  while (a && a.shadowRoot && a.shadowRoot.activeElement) { hosts.push(a.localName + (a.id ? '#' + a.id : '')); a = a.shadowRoot.activeElement; }
  return a ? [...hosts, a.localName + (a.id ? '#' + a.id : '') + (a.getAttribute('role') ? `[${a.getAttribute('role')}]` : '')].join(' > ') : '';
});
/** the controls on screen smaller than 24 × 24 px (every shadow root walked) */
const smallTargets = page => page.evaluate(() => {
  const SEL = 'button, a[href], input, select, textarea, [role="tab"], [role="radio"], [role="switch"], [role="menuitem"], [tabindex="0"]';
  const out = [];
  const walk = root => {
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(SEL) && !el.closest('[hidden]')) {
        // a link stretched over its card or row by an absolute ::after: the target is that box
        const after = getComputedStyle(el, '::after'), stretched = after.position === 'absolute' && after.content !== 'none' && el.offsetParent;
        const r = (stretched ? el.offsetParent : el).getBoundingClientRect(), cs = getComputedStyle(el);
        const shown = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.classList.contains('vh') && !el.classList.contains('skip');
        if (shown && (r.width < 23.5 || r.height < 23.5)) out.push(`${el.localName}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(r.width)}×${Math.round(r.height)} in <${root.host ? root.host.localName : 'document'}>`);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
});
const frameReady = page => page.waitForSelector('noema-app-frame noema-ui-kit', { timeout: 20000 }).then(() => true, () => false);

(async () => {
  const url = await appUrl(ROOT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(() => {   // Arabic (Egypt) switched on, whatever config.js says (F)
    let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (c) c.locales = { ...(c.locales || {}), 'ar-EG': 'on' }; } });
  });
  const page = await ctx.newPage(), E = [], asked = [];
  page.on('pageerror', e => E.push(e.message));
  page.on('request', r => { if (/\/build\/ui-kit\.js/.test(r.url())) asked.push(r.url()); });

  console.log('— A. lazy');
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(1500);
  ok(!asked.length, 'the start screen never asks for build/ui-kit.js');
  await page.goto(url + '#/ui-kit'); await page.reload();
  ok(await frameReady(page), '#/ui-kit shows the frame with the kit');
  ok(asked.length === 1, `#/ui-kit loads build/ui-kit.js once (${asked.length})`);
  ok(await page.evaluate(() => !document.getElementById('noema-splash') && !document.body.classList.contains('noema-booting')), 'the splash is gone');
  ok(await page.evaluate(() => document.querySelectorAll('noema-app-frame').length === 1 && !document.querySelector('#app .card, .home')), 'only the new frame is on the page (the older screens did not start)');

  console.log('— B. every section at 1280 px and 320 px');
  for (const vp of [{ width: 1280, height: 900 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(vp);
    for (const s of SECTIONS) {
      await page.evaluate(h => { location.hash = h; }, `#/ui-kit/${s}`);
      await until(() => page.evaluate(s => document.querySelector('noema-ui-kit')?.section === s, s)); await wait(300);
      const small = await smallTargets(page);
      ok(await noHScroll(page), `${s} at ${vp.width} px: no sideways scrolling`);
      ok(!small.length, `${s} at ${vp.width} px: every control at least 24 px${small.length ? ': ' + small.slice(0, 6).join('; ') : ''}`);
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  ok(await page.evaluate(() => { const r = document.querySelector('noema-app-frame').shadowRoot.querySelector('nav.tabs').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2 && r.width <= innerWidth; }), 'at 320 px the tabs are a bar at the bottom');
  await page.setViewportSize({ width: 1280, height: 900 });
  ok(await page.evaluate(() => { const r = document.querySelector('noema-app-frame').shadowRoot.querySelector('nav.tabs').getBoundingClientRect(); return r.left < 2 && r.height > 300; }), 'at 1280 px the tabs are a rail at the side');

  console.log('— C. the keyboard');
  await page.evaluate(() => { location.hash = '#/ui-kit/overlays'; }); await wait(400);
  const menuBtn = 'noema-ui-kit noema-menu >> button.trigger';
  await page.focus(menuBtn); await page.keyboard.press('ArrowDown'); await wait(150);
  ok(/menuitem/.test(await focused(page)), `a menu: ↓ on its button opens it with the focus on an item (${await focused(page)})`);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await wait(150);
  ok(await page.evaluate(() => !document.querySelector('noema-ui-kit').shadowRoot.querySelector('noema-menu').open), 'Escape closes the menu');
  ok(/noema-menu > button/.test(await focused(page)), `the focus is back on the menu's button (${await focused(page)})`);
  await page.click('noema-ui-kit #open-dialog'); await wait(300);
  ok(await page.evaluate(() => document.querySelector('noema-ui-kit').shadowRoot.querySelector('#dlg').shadowRoot.querySelector('dialog').open), 'the dialog opens');
  const inDialog = async () => /noema-dialog|noema-text-field|input/.test(await focused(page)) && !/open-dialog/.test(await focused(page));
  ok(await inDialog(), `the focus is in the dialog (${await focused(page)})`);
  let stays = true;
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const f = await focused(page); if (/noema-app-frame > (a|button)|open-/.test(f)) stays = false; }
  ok(stays, 'Tab stays in the dialog');
  await page.keyboard.press('Escape'); await wait(300);
  ok(await page.evaluate(() => !document.querySelector('noema-ui-kit').shadowRoot.querySelector('#dlg').open), 'Escape closes the dialog');
  ok(/open-dialog/.test(await focused(page)), `the focus is back on its button (${await focused(page)})`);
  await page.click('noema-ui-kit #open-confirm'); await wait(300);
  ok(/noema-button.*> button/.test(await focused(page)) && await page.evaluate(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a?.getRootNode().host?.getAttribute('autofocus') !== null; }), 'a yes / no question: the focus on the safe answer');
  await page.keyboard.press('Escape'); await wait(300);
  ok(await page.evaluate(() => !document.querySelector('noema-layer noema-dialog')), 'Escape answers no (the question is gone)');
  await page.evaluate(() => { location.hash = '#/ui-kit/forms'; }); await wait(400);
  await page.focus('noema-ui-kit noema-tabs >> [role="tab"][aria-selected="true"]'); await page.keyboard.press('ArrowRight'); await wait(150);
  ok(await page.evaluate(() => document.querySelector('noema-ui-kit').shadowRoot.querySelector('noema-tabs').selected === 'practice'), 'tabs: → selects the next tab');
  ok(/\[tab\]/.test(await focused(page)), 'the focus moved with it');
  await page.reload(); await frameReady(page); await wait(300);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await wait(100);
  ok(/main/.test(await focused(page)), `the first Tab reaches “Skip to the content”, Enter puts the focus on the page (${await focused(page)})`);

  console.log('— D. forms');
  await page.evaluate(() => {
    const form = document.querySelector('noema-ui-kit').shadowRoot.querySelector('form');
    form.addEventListener('submit', () => { window.__sent = Object.fromEntries(new FormData(form)); });
  });
  await page.click('noema-ui-kit form noema-button[type="submit"]'); await wait(200);
  ok(await page.evaluate(() => document.querySelector('noema-ui-kit').shadowRoot.querySelector('noema-text-field[name="name"]').shadowRoot.querySelector('input').getAttribute('aria-invalid') === 'true'), 'a missing name is said (aria-invalid, the message)');
  ok(/noema-text-field > input/.test(await focused(page)), `and focused (${await focused(page)})`);
  await page.keyboard.type('Ada');
  await page.click('noema-ui-kit form noema-button[type="submit"]'); await wait(200);
  const sent = await page.evaluate(() => window.__sent);
  ok(sent && sent.name === 'Ada' && sent.goal === '120' && sent.sound === 'on' && sent.game === 'calm', `the fields take part in the form: ${JSON.stringify(sent)}`);
  ok(await until(() => page.evaluate(() => document.querySelector('noema-app-frame').layer.toaster.shown.length === 1), 3000), 'saved: a toast');

  console.log('— E. the appearance; leaving');
  await page.evaluate(() => { location.hash = '#/ui-kit/look'; }); await wait(400);
  await page.click('noema-ui-kit noema-radio-group >> [role="radio"]:nth-child(3)'); await wait(100);
  await page.selectOption('noema-ui-kit noema-select:not(#locale) >> select', 'owl'); await wait(200);
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.m === 'owl'), 'dark and the owl, at once');
  await page.reload(); await frameReady(page); await wait(300);
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.m === 'owl'), 'kept after a reload');
  ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgb(255, 255, 255)'), 'the page is drawn in the dark tokens');
  await page.evaluate(() => { location.hash = '#/'; });
  ok(await until(() => page.evaluate(() => !document.querySelector('noema-app-frame') && !!window.Noema)), 'leaving #/ui-kit starts the older screens');

  console.log('— F. right to left');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(url + '#/ui-kit/look'); await page.reload(); await frameReady(page); await wait(300);
  await page.selectOption('noema-ui-kit #locale >> select', 'ar-EG');
  ok(await until(() => page.evaluate(() => { const f = document.querySelector('noema-app-frame'); return f.dir === 'rtl' && f.lang === 'ar-EG'; })), 'the frame speaks ar-EG, right to left');
  for (const s of SECTIONS) {
    await page.evaluate(h => { location.hash = h; }, `#/ui-kit/${s}`); await wait(300);
    ok(await noHScroll(page), `${s} in ar-EG at 320 px: no sideways scrolling`);
  }
  ok(await page.evaluate(() => { const r = document.querySelector('noema-app-frame').shadowRoot.querySelector('a.back').getBoundingClientRect(); return r.right > innerWidth - 60; }), 'the back arrow stands at the right');
  await page.evaluate(() => NoemaI18n.use('en'));

  ok(!E.length, `no page errors${E.length ? ': ' + JSON.stringify([...new Set(E)].slice(0, 3)) : ''}`);
  await browser.close();
  console.log(fails ? `\n✗ ui_kit: ${fails} of ${n} failed` : `\n✓ ui_kit: ${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
