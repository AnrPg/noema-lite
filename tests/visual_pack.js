/* Every visual exercise of every real subject pack must be solvable through the UI (desktop mouse + phone touch),
   and every figure must render. Catches content bugs: overlapping regions, crowded controls, unreachable answers.
   Usage: node tests/visual_pack.js <prepared-repo-dir> [subjectTitle]   (default: Databricks) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SUBJ = process.argv[3] || 'Databricks';
let fails = 0; const ok = (c, m) => { if (!c) { console.log('  ❌ ' + m); fails++; } return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(browser, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto('file://' + ROOT + '/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(700);
  await p.click(`.noema-chip:has-text("${SUBJ}")`); await wait(1500);
  const ids = await p.evaluate(() => ALL_EX.filter(isVisual).map(e => e.id));
  const tap = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  const tapSel = async sel => touch ? p.tap(sel) : p.click(sel);
  let solved = 0, listed = 0;
  for (const id of ids) {
    await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX[id]); c.id = 'T'; m.append(c); scrollTo(0, 0); }, id);
    await wait(120);
    const I = await p.evaluate(id => { const ex = EX[id]; const m = MEDIA[ex.media]; const regs = vRegions(ex, m); return { type: ex.type, W: m.w, H: m.h, answer: ex.answer, any: !!ex.any, options: ex.options,
      regs: Object.fromEntries(regs.map(r => [r.id, { c: rCenter(r), label: r.label }])), targets: vTargets(ex, regs).map(r => r.id), compact: document.querySelector('#T .vx').classList.contains('compact') }; }, id);
    if (I.compact) listed++;
    const at = async id2 => { const el = p.locator('#T .vx-stage'); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); const [x, y] = I.regs[id2].c; return [b.x + x / I.W * b.width, b.y + y / I.H * b.height]; };
    const checkBtn = async () => { const b = await p.$('#T button:has-text("Check")'); if (b) { await b.scrollIntoViewIfNeeded(); await (touch ? b.tap() : b.click()); } };
    try {
      if (I.type === 'img_hotspot') { for (const a of (I.any ? [I.answer[0]] : I.answer)) await tap(...await at(a)); await checkBtn(); }
      else if (I.type === 'img_sequence') { for (const a of I.answer) await tap(...await at(a)); await checkBtn(); }
      else if (I.type === 'img_reveal') { const t = I.options[I.answer]; await tapSel(`#T .opt:has-text("${t.replace(/"/g, '\\"')}")`); }
      else if (I.type === 'img_drag') {
        for (let k = 0; k < I.targets.length; k++) {
          const lab = I.regs[I.targets[k]].label;
          await tapSel(`#T .vx-bank .vx-chip >> text="${lab}"`);
          const z = p.locator(`#T .vx-drop[data-k="${k}"]`); await z.scrollIntoViewIfNeeded(); await (touch ? z.tap() : z.click());
        }
        await checkBtn();
      }
      else if (I.type === 'img_label') { for (let k = 0; k < I.targets.length; k++) await p.locator('#T .vx-input').nth(k).fill(I.regs[I.targets[k]].label); await checkBtn(); }
      else if (I.type === 'img_select') { for (let k = 0; k < I.targets.length; k++) await p.locator('#T .vx-select').nth(k).selectOption(I.regs[I.targets[k]].label); await checkBtn(); }
      else if (I.type === 'img_occlusion') { for (let k = 0; k < I.targets.length; k++) { await tapSel('#T button:has-text("Reveal")'); await tapSel('#T button:has-text("I knew it")'); } }
      await wait(120);
      const r = await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() ? (c.querySelector('.explain.ok') ? 'ok' : 'bad') : 'open'; });
      if (ok(r === 'ok', `${id} (${I.type}) solvable on ${viewport.width}px${touch ? ' touch' : ''} → ${r}`)) solved++;
    } catch (e) { ok(false, `${id} (${I.type}) on ${viewport.width}px: ${e.message.split('\n')[0]}`); }
  }
  // figures render inside their sections
  const figs = await p.evaluate(() => COURSE.flatMap(c => c.sections.filter(s => s.blocks.some(b => b.t === 'figure')).map(s => s.id)));
  let figOK = 0;
  for (const sid of figs) {
    await p.evaluate(sid => { location.hash = '#/s/' + sid; }, sid); await wait(350);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    if (ok(await p.$$eval('main .vx-fig img', xs => xs.length > 0 && xs.every(i => i.complete && i.naturalWidth > 0)), `figure in ${sid} renders`)) figOK++;
  }
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  console.log(`  ${viewport.width}px${touch ? ' touch' : ''}: ${solved}/${ids.length} visual exercises solved through the UI (${listed} used the list layout), ${figOK}/${figs.length} figures render`);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch();
  console.log(`— ${SUBJ}: every visual exercise, solved through the UI`);
  await run(browser, { width: 1280, height: 900 }, false);
  await run(browser, { width: 390, height: 844 }, true);
  await browser.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
