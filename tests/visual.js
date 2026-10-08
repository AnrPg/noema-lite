/* Visual exercises (docs/VISUAL.md): every type, mouse + touch + keyboard, desktop + phone.
   Usage: node tests/visual.js <prepared-repo-dir>   (needs the demo-physics fixture, see tests/run_e2e.sh) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) E.push(m.text()); });   // (config.local.js is absent in test copies)
  await p.goto('file://' + ROOT + '/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(700);
  await p.click('.noema-chip:has-text("Demo Physics")'); await wait(1300);
  return { p, E, ctx };
}
/** Render one exercise card alone in <main>; returns a locator. */
async function card(p, id) {
  await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX[id]); c.id = 'T'; m.append(c); window.scrollTo(0, 0); }, id);
  await wait(250); return p.locator('#T');
}
/** Page coordinates of an image point (image units). */
async function at(p, ix, iy, sel = '#T .vx-stage') {
  const b = await p.locator(sel).boundingBox(); const m = await p.evaluate(s => { const st = document.querySelector(s); const vb = st.querySelector('svg').viewBox.baseVal; return [vb.width, vb.height]; }, sel);
  return [b.x + ix / m[0] * b.width, b.y + iy / m[1] * b.height];
}
const clickImg = async (p, ix, iy, sel) => { const [x, y] = await at(p, ix, iy, sel); await p.mouse.click(x, y); await wait(60); };
const tapImg = async (p, ix, iy) => { const [x, y] = await at(p, ix, iy); await p.touchscreen.tap(x, y); await wait(80); };
const result = async p => p.evaluate(() => { const c = document.getElementById('T'); return c._locked() ? (c.querySelector('.explain.ok') ? 'ok' : 'bad') : 'open'; });
const check = async p => { await p.click('#T button:has-text("Check")'); await wait(150); };
const C = { fuel: [95, 125], boiler: [290, 125], turbine: [490, 125], generator: [695, 125], grid: [380, 305], sun: [140, 300], tower: [660, 315] };

(async () => {
  const browser = await chromium.launch();
  /* ======================= desktop, mouse ======================= */
  console.log('— desktop (1280×900, mouse)');
  const { p, E } = await open(browser, { width: 1280, height: 900 });
  ok(await p.evaluate(() => MEDIA['power-station'].data.startsWith('data:image/svg+xml') && MEDIA['ek-graph'].origin === 'plot'), 'picture embedded in the pack as a data URI');

  // hotspot single: the last tap wins; right answer
  await card(p, 'ch01-e101');
  ok(await p.$$eval('#T .vx-img', i => i[0].complete && i[0].naturalWidth > 0), 'picture loads');
  await clickImg(p, ...C.turbine); await clickImg(p, ...C.boiler);
  ok(await p.$$eval('#T .vx-pick', x => x.length) === 1, 'hotspot (single): a new tap moves the pin');
  await check(p); ok(await result(p) === 'ok', 'hotspot: tapping the boiler is correct');
  ok(await p.$$eval('#T .vx-out.right', x => x.length) === 1 && await p.$$eval('#T .vx-tag', x => x.length) === 1, 'hotspot: answer outlined + labelled after checking');
  // hotspot wrong → why shown
  await card(p, 'ch01-e101'); await clickImg(p, ...C.turbine); await check(p);
  ok(await result(p) === 'bad' && /turbine turns steam/i.test(await p.locator('#T').innerText()), 'hotspot: wrong place → wrong + the “why” for that place');
  // hotspot edges: inside the circle's bounding box but outside the circle → not the sun; edge of a box counts
  await card(p, 'ch01-e102');
  await clickImg(p, 140 - 50, 300 - 50); await clickImg(p, ...C.tower); await check(p);
  ok(await result(p) === 'bad', 'hotspot (multi): corner of the circle’s box is NOT the circle (true circle hit-test)');
  await card(p, 'ch01-e102'); await clickImg(p, 140 + 30, 300 + 30); await clickImg(p, 715, 365); await check(p);
  ok(await result(p) === 'ok', 'hotspot (multi): inside the circle + inside the slanted polygon → correct');
  await card(p, 'ch01-e102'); await clickImg(p, ...C.sun); await check(p);
  ok(await result(p) === 'open', 'hotspot (multi): checking with too few pins asks to finish first');
  await clickImg(p, ...C.tower); ok(await p.$$eval('#T .vx-pick', x => x.map(e => e.textContent).join()) === '1,2', 'hotspot (multi): pins are numbered and additive');
  await clickImg(p, ...C.sun); ok(await p.$$eval('#T .vx-pick', x => x.length) === 1, 'hotspot: tapping a pin again removes it');

  // sequence: undo + auto-check
  await card(p, 'ch01-e103');
  await clickImg(p, ...C.fuel); await clickImg(p, ...C.turbine); await clickImg(p, ...C.turbine);
  ok(await p.$$eval('#T .vx-step', x => x.length) === 1, 'sequence: tapping a numbered part undoes from there');
  await clickImg(p, 20, 400); ok(await p.$$eval('#T .vx-step', x => x.length) === 1, 'sequence: taps outside any part are ignored');
  for (const k of ['boiler', 'turbine', 'generator', 'grid']) await clickImg(p, ...C[k]);
  await clickImg(p, ...C.sun); ok(await p.$$eval('#T .vx-step', x => x.length) === 5, 'sequence: no extra steps beyond the path length');
  await check(p); ok(await result(p) === 'ok', 'sequence: right order → correct');
  await card(p, 'ch01-e103'); for (const k of ['fuel', 'turbine', 'boiler', 'generator', 'grid']) await clickImg(p, ...C[k]);
  await check(p); ok(await result(p) === 'bad' && /Correct path/.test(await p.locator('#T').innerText()), 'sequence: wrong order → wrong + correct path shown');

  // drag: real mouse drags + tap-tap + moving a placed label
  await card(p, 'ch01-e104');
  ok(await p.$$eval('#T .vx-mask:not(.off)', x => x.length) === 4, 'drag: the 4 targets are covered');
  ok(await p.$$eval('#T .vx-bank .vx-chip', x => x.length) === 5, 'drag: 4 labels + 1 distractor in the bank');
  const dragTo = async (label, key, root = '#T') => {
    const chip = p.locator(`${root} .vx-bank .vx-chip:text-is("${label}"), ${root} .vx-drop.filled:text-is("${label}")`).first(); const b = await chip.boundingBox();
    const [x, y] = await at(p, ...C[key], root + ' .vx-stage');
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
    await p.mouse.move(b.x + 20, b.y + 10, { steps: 3 }); await p.mouse.move(x, y, { steps: 8 }); await p.mouse.up(); await wait(120);
  };
  await dragTo('Turbine', 'fuel');                          // wrong on purpose …
  await dragTo('Turbine', 'turbine');                       // … then move it: it leaves the old zone
  ok(await p.evaluate(() => { const z = [...document.querySelectorAll('#T .vx-drop')]; return z.filter(x => x.textContent === 'Turbine').length === 1 && z[1 - 1].textContent === '?'; }), 'drag: a placed label can be dragged to another place (moves, never duplicated)');
  await dragTo('Fuel', 'fuel'); const fz = await p.locator('#T .vx-drop.filled:text-is("Fuel")').boundingBox();
  await p.mouse.move(fz.x + 10, fz.y + 10); await p.mouse.down(); await p.mouse.move(fz.x + 40, fz.y - 200, { steps: 6 }); await p.mouse.move(5, 5, { steps: 4 }); await p.mouse.up(); await wait(120);
  ok(await p.$$eval('#T .vx-bank .vx-chip:text-is("Fuel")', x => x.length) === 1, 'drag: dragging a placed label off the picture returns it to the bank');
  await dragTo('Fuel', 'fuel');
  await p.click('#T .vx-bank .vx-chip:text-is("Boiler")'); const [bx, by] = await at(p, ...C.boiler); await p.mouse.click(bx, by); await wait(80);
  await p.click('#T .vx-bank .vx-chip:text-is("Generator")'); const [gx, gy] = await at(p, ...C.generator); await p.mouse.click(gx, gy); await wait(80);
  ok(await p.$$eval('#T .vx-bank .vx-chip', x => x.length) === 1, 'drag: tap a label then tap a place works too');
  await p.screenshot({ path: SHOTS + '/v1_drag_filled.png' });
  await check(p); ok(await result(p) === 'ok', 'drag: all four correct → correct');
  ok(await p.$$eval('#T .vx-mask.off', x => x.length) === 4 && await p.$$eval('#T .vx-res.ok', x => x.length) === 4, 'drag: covers removed, result list shown');

  // label: exact, alias, small typo; then a wrong one
  await card(p, 'ch01-e105');
  const inputs = p.locator('#T .vx-input');
  await inputs.nth(0).fill('coal'); await inputs.nth(1).fill('Boiler'); await inputs.nth(2).fill('turbin'); await inputs.nth(3).fill('dynamo');
  await inputs.nth(3).press('Enter'); await wait(150);
  ok(await result(p) === 'ok', 'label: alias (“coal”, “dynamo”) + small typo (“turbin”) accepted; Enter on the last field checks');
  ok(/spelling: Turbine/.test(await p.locator('#T').innerText()), 'label: the correct spelling is shown for the typo');
  await card(p, 'ch01-e105'); await inputs.nth(0).fill('Fuel'); await inputs.nth(1).fill('Furnace'); await inputs.nth(2).fill('Turbine'); await inputs.nth(3).fill('Generator'); await check(p);
  ok(await result(p) === 'bad' && /you: “Furnace”/.test(await p.locator('#T').innerText()), 'label: a wrong name is marked and corrected');

  // select
  await card(p, 'ch01-e106');
  const sels = p.locator('#T .vx-select');
  ok((await sels.nth(0).locator('option').allTextContents()).includes('Reactor'), 'select: distractor in the dropdown');
  await sels.nth(0).selectOption('Boiler'); await sels.nth(1).selectOption('Turbine'); await check(p);
  ok(await result(p) === 'open', 'select: unanswered dropdown → finish first');
  await sels.nth(2).selectOption('Grid'); await check(p); ok(await result(p) === 'ok', 'select: all right → correct');

  // occlusion
  await card(p, 'ch01-e107');
  ok(await p.$$eval('#T .vx-mask.occ.cur', x => x.length) === 1, 'occlusion: one cover highlighted at a time');
  await p.click('#T button:has-text("Reveal")'); await p.click('#T button:has-text("I knew it")');
  ok(/What gets rid of the waste heat/.test(await p.locator('#T').innerText()), 'occlusion: per-part question shown');
  const [tx, ty] = await at(p, ...C.tower); await p.mouse.click(tx, ty); await wait(100);   // tapping the cover reveals too
  await p.click('#T button:has-text("I knew it")'); await wait(150);
  ok(await result(p) === 'ok' && /recalled 2 \/ 2/.test(await p.locator('#T').innerText()), 'occlusion: tap the cover or Reveal, rate, score → done');

  // reveal: bonus XP for fewer tiles
  await card(p, 'ch01-e108');
  ok(await p.$$eval('#T .vx-mask.tile:not(.off)', x => x.length) === 6, 'reveal: 3×2 grid of covered tiles');
  await clickImg(p, 130, 70); await clickImg(p, 400, 300);
  const xp0 = await p.evaluate(() => S.xp);
  await p.click('#T .opt:has-text("A power station")'); await wait(200);
  const gained = await p.evaluate(() => S.xp) - xp0;
  ok(await result(p) === 'ok' && gained === 4 + 2 * 4 + 4, `reveal: answered after 2/6 tiles → +${gained} XP (incl. +4 bonus)`);
  ok(await p.$$eval('#T .vx-mask.tile.off', x => x.length) === 6, 'reveal: everything uncovered after answering');
  await card(p, 'ch01-e108'); await p.keyboard.press('1'); await wait(150);
  ok(await result(p) !== 'open', 'reveal: keyboard 1–3 answers');

  // keyboard only (TD-3): hotspot and sequence without a mouse
  await card(p, 'ch01-e101');
  await p.focus('#T .vx-stage');
  const kbAt = async (tx, ty) => {      // walk the crosshair to an image point with arrow keys (4 % steps, Shift = 1 %)
    for (let i = 0; i < 2; i++) await p.keyboard.press('ArrowRight');   // first press shows the crosshair at the centre
    let [cx, cy] = await p.evaluate(() => { const c = document.querySelector('#T .vx-cross'); const st = document.querySelector('#T .vx-stage').getBoundingClientRect(); const r = c.getBoundingClientRect(); const vb = document.querySelector('#T .vx-svg').viewBox.baseVal; return [(r.left + r.width / 2 - st.left) / st.width * vb.width, (r.top + r.height / 2 - st.top) / st.height * vb.height]; });
    const W = await p.evaluate(() => document.querySelector('#T .vx-svg').viewBox.baseVal.width), H = await p.evaluate(() => document.querySelector('#T .vx-svg').viewBox.baseVal.height);
    const steps = (d, size) => { const big = Math.trunc(d / (size * 0.04)); const small = Math.round((d - big * size * 0.04) / (size * 0.01)); return [big, small]; };
    const [bx, sx] = steps(tx - cx, W), [by, sy] = steps(ty - cy, H);
    for (let i = 0; i < Math.abs(bx); i++) await p.keyboard.press(bx > 0 ? 'ArrowRight' : 'ArrowLeft');
    for (let i = 0; i < Math.abs(sx); i++) await p.keyboard.press(sx > 0 ? 'Shift+ArrowRight' : 'Shift+ArrowLeft');
    for (let i = 0; i < Math.abs(by); i++) await p.keyboard.press(by > 0 ? 'ArrowDown' : 'ArrowUp');
    for (let i = 0; i < Math.abs(sy); i++) await p.keyboard.press(sy > 0 ? 'Shift+ArrowDown' : 'Shift+ArrowUp');
  };
  await kbAt(...C.boiler); await p.keyboard.press('Enter'); await wait(80);
  ok(await p.$$eval('#T .vx-pick', x => x.length) === 1 && await result(p) === 'open', 'keyboard: Enter places a pin (and does not check the card by accident)');
  ok(/Pin placed/.test(await p.$eval('#T .vx-sr', e => e.textContent)), 'keyboard: screen-reader message after a tap');
  await p.keyboard.press('Backspace'); ok(await p.$$eval('#T .vx-pick', x => x.length) === 0, 'keyboard: Backspace removes the pin');
  await p.keyboard.press('Enter'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await wait(150);
  ok(await result(p) === 'ok', 'keyboard: Enter → Tab → Enter checks: correct');
  await card(p, 'ch01-e103'); await p.focus('#T .vx-stage');
  for (const k of ['fuel', 'boiler', 'turbine', 'generator', 'grid']) { await kbAt(...C[k]); await wait(30); await p.keyboard.press('Enter'); }
  await wait(80); ok(/Step 5: Grid/.test(await p.$eval('#T .vx-sr', e => e.textContent)), 'keyboard: the part under the crosshair is announced');
  await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await wait(150);
  ok(await result(p) === 'ok', 'keyboard: the whole sequence answered with arrows + Enter');

  // function graph (svgkit.Plot): curve bands + a point
  await card(p, 'ch01-e109');
  const onCurve = await p.evaluate(() => { const m = MEDIA['ek-graph']; const r = m.regions.find(r => r.id === 'ek'); const n = r.points.length / 2; const a = r.points[Math.floor(n * 0.8)], b = r.points[r.points.length - 1 - Math.floor(n * 0.8)]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  await clickImg(p, ...onCurve); await check(p);
  ok(await result(p) === 'ok', 'graph: tapping on the parabola selects the energy curve');
  await card(p, 'ch01-e109');
  const onLine = await p.evaluate(() => { const r = MEDIA['ek-graph'].regions.find(r => r.id === 'mom'); const n = r.points.length / 2; const a = r.points[Math.floor(n * 0.9)], b = r.points[r.points.length - 1 - Math.floor(n * 0.9)]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  await clickImg(p, ...onLine); await check(p);
  ok(await result(p) === 'bad' && /doubling v doubles p/.test(await p.locator('#T').innerText()), 'graph: tapping the momentum line is wrong, with the reason');
  await card(p, 'ch01-e110'); await p.click('#T .vx-bank .vx-chip:text-is("Kinetic energy (J)")'); await p.click('#T .vx-drop[data-k="0"]'); await p.click('#T .vx-bank .vx-chip:text-is("Momentum (kg·m/s)")'); await p.click('#T .vx-drop[data-k="1"]'); await check(p);
  ok(await result(p) === 'ok', 'graph: drag the curve names onto the curves');

  // zoom
  await card(p, 'ch01-e104');
  await p.click('#T .vx-zoom'); await wait(200); await p.screenshot({ path: SHOTS + '/v0_zoom.png' });
  const full = await p.evaluate(() => { const v = document.querySelector('.vx.full'); const r = v?.querySelector('.vx-stage').getBoundingClientRect(); return v && getComputedStyle(v).position === 'fixed' && r.width > 1000 && r.bottom <= innerHeight; });
  ok(full, 'zoom: ⤢ opens the picture full screen (bigger, fully visible)');
  const bankVisible = await p.evaluate(() => { const b = document.querySelector('.vx.full .vx-bank').getBoundingClientRect(); return b.bottom <= innerHeight; });
  ok(bankVisible, 'zoom: the label bank is visible without scrolling');
  await dragTo('Fuel', 'fuel', '.vx.full');
  ok(await p.$$eval('.vx.full .vx-drop.filled', x => x.length) === 1, 'zoom: dragging lands correctly at the bigger size');
  await p.keyboard.press('Escape'); await wait(150);
  ok(await p.$eval('#T .vx', v => !v.classList.contains('full')) && await p.$$eval('#T .vx-drop.filled', x => x.length) === 1, 'zoom: Esc closes it, back in the card with the answer kept');

  // figure in the theory (real route)
  await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(500);
  { const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(300); } }
  ok(await p.$$eval('main .vx-fig img', x => x.length) === 2, 'figure blocks render in the section (diagram + function graph)');
  await p.evaluate(() => { document.querySelector('main .vx-fig').id = 'F1'; });
  const fsel = '#F1 .vx-stage'; await p.locator(fsel).scrollIntoViewIfNeeded(); await wait(200);
  const [hx, hy] = await at(p, ...C.boiler, fsel); await p.mouse.move(hx, hy); await wait(150);
  ok(await p.$eval('#F1 .vx-tip', t => t.classList.contains('on') && /Boiler/.test(t.textContent)), 'figure: hovering a part shows its name');
  await p.click('#F1 button:has-text("Hide labels")'); await wait(150);
  ok(await p.$$eval('#F1 .vx-mask:not(.off)', x => x.length) >= 5, 'figure: 🙈 Hide labels covers the parts');
  await p.mouse.click(hx, hy); await wait(100);
  ok(await p.$$eval('#F1 .vx-mask.off', x => x.length) === 1, 'figure: tapping a cover peeks under it');
  await p.screenshot({ path: SHOTS + '/v2_figure.png' });
  // Practice › “Choose what to practise” lists the visual types as filters
  await p.evaluate(() => { location.hash = '#/ch/ch01/filters'; }); await wait(500);
  ok(/Drag the labels/.test(await p.locator('main').innerText()), 'practice filters show the visual types');
  // tutor context
  ok(await p.evaluate(() => /Labeled parts: .*Boiler/.test(exerciseAsText(EX['ch01-e104'])) && /Correct order: Fuel → Boiler/.test(exerciseAsText(EX['ch01-e103']))), 'the tutor gets a text version of the picture and the answers');
  ok(!E.length, 'desktop: no page errors ' + JSON.stringify(E.slice(0, 3)));

  /* ======================= phone, touch ======================= */
  console.log('— phone (390×844, touch)');
  const P = await open(browser, { width: 390, height: 844 }, { touch: true }); const q = P.p;
  await card(q, 'ch01-e105');
  ok(await q.$eval('#T .vx', v => v.classList.contains('compact')), 'phone: compact layout (numbered markers + list)');
  ok(await q.$$eval('#T .vx-list .vx-input', x => x.length) === 4 && await q.$$eval('#T .vx-marker', x => x.filter(m => getComputedStyle(m).display !== 'none').length) === 4, 'phone: inputs listed under the picture, numbers on it');
  await q.screenshot({ path: SHOTS + '/v3_phone_label.png', fullPage: true });
  await card(q, 'ch01-e104');
  for (const [label, key] of [['Fuel', 'fuel'], ['Boiler', 'boiler'], ['Turbine', 'turbine'], ['Generator', 'generator']]) {
    await q.tap(`#T .vx-bank .vx-chip:text-is("${label}")`); await wait(60);
    const k = ['fuel', 'boiler', 'turbine', 'generator'].indexOf(key); await q.tap(`#T .vx-list .vx-drop >> nth=${k}`); await wait(80);
  }
  await q.tap('#T button:has-text("Check")'); await wait(150);
  ok(await result(q) === 'ok', 'phone: drag exercise solvable with taps');
  // a real finger drag (touch events → pointer events)
  await card(q, 'ch01-e104');
  const cdp = await P.ctx.newCDPSession(q);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const cb = await q.locator('#T .vx-bank .vx-chip:text-is("Boiler")').boundingBox();
  const zb = await q.locator('#T .vx-list .vx-drop >> nth=1').boundingBox();
  await touch('touchStart', cb.x + 10, cb.y + 10);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', cb.x + 10 + (zb.x + 20 - cb.x - 10) * i / 10, cb.y + 10 + (zb.y + 12 - cb.y - 10) * i / 10); await wait(16); }
  await touch('touchEnd'); await wait(150);
  ok(await q.$eval('#T .vx-list .vx-drop >> nth=1', z => z.textContent).catch(() => null) === 'Boiler' || await q.evaluate(() => document.querySelectorAll('#T .vx-drop')[1].textContent === 'Boiler'), 'phone: dragging a label with a finger drops it');
  await card(q, 'ch01-e103'); for (const k of ['fuel', 'boiler', 'turbine', 'generator', 'grid']) await tapImg(q, ...C[k]);
  await q.tap('#T button:has-text("Check")'); await wait(150); ok(await result(q) === 'ok', 'phone: sequence with touch taps');
  await card(q, 'ch01-e101'); await tapImg(q, ...C.boiler); await q.tap('#T button:has-text("Check")'); await wait(150);
  ok(await result(q) === 'ok', 'phone: hotspot with a touch tap');
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal overflow');
  await q.screenshot({ path: SHOTS + '/v4_phone_hotspot.png' });
  ok(!P.E.length, 'phone: no page errors ' + JSON.stringify(P.E.slice(0, 3)));

  /* ======================= tablet width, inline controls ======================= */
  console.log('— tablet (820×1180)');
  const Tb = await open(browser, { width: 820, height: 1180 }); const t = Tb.p;
  await card(t, 'ch01-e106');
  ok(await t.$eval('#T .vx', v => !v.classList.contains('compact')) && await t.$$eval('#T .vx-pin .vx-select', x => x.length) === 3, 'tablet: dropdowns sit on the picture');
  const overl = await t.evaluate(() => { const st = document.querySelector('#T .vx-stage').getBoundingClientRect(); return [...document.querySelectorAll('#T .vx-select')].every(s => { const b = s.getBoundingClientRect(); return b.left >= st.left - 2 && b.right <= st.right + 2; }); });
  ok(overl, 'tablet: controls stay inside the picture');
  await t.screenshot({ path: SHOTS + '/v5_tablet_select.png' });
  ok(!Tb.E.length, 'tablet: no page errors');

  await browser.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
