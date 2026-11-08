/* 🪜 The levels of a Roadmap in the app (src/features/roadmaps/ui, docs/CURRICULUM.md §11), Playwright + Chromium, on the
   Roadmap page of the new frame (#/map/<id>):
     A. the ladder on the map: every level (done · current · ahead), the current level and how far it is
     B. moving up: a done level is reached by itself and the level-reached moment says so, once; Continue → the map
     C. the level test (a Roadmap with levelTest): what it is, the questions from the level's prepared subject, the keyboard
        (Tab · Enter · focus on Next), failed → the level stays; passed → reached (the moment), the next level is current
     D. Claude's proposed arrangement: the banner, every change in words, Apply → the Roadmap is arranged anew (the step's
        level changed, the proposal applied); another one declined → it stays as it was; a member sees no banner
     E. 320 px: no sideways scrolling, every control at least 24 × 24 px; axe on the bar and each dialog; Escape closes;
        right to left (Arabic): the dialogs follow the page's direction
   Usage: node tests/roadmap_levels.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const { appUrl } = require('./serve');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A Roadmap with two study years: a (year 1, prepared) → b (year 2); options: the level test, a pending proposal. */
const seed = (page, cid, o = {}) => page.evaluate(([cid, o]) => {
  const acc = Noema.account.id;
  NoemaCurriculum.save(acc, {
    id: cid, title: 'Mechanics ' + cid, goal: 'Mechanics', language: 'en', status: 'ready', stage: 'done', provider: 'auto', goalId: 'b',
    levels: [{ id: 'y1', kind: 'year', order: 1, names: { en: 'First year' } }, { id: 'y2', kind: 'year', order: 2, names: {} }],
    ...(o.levelTest ? { levelTest: true } : {}),
    nodes: {
      a: { id: 'a', title: 'Motion', role: 'foundation', level: 'y1', chapters: [], pack: { id: 'lv-pack', status: 'ready' } },
      b: { id: 'b', title: 'Energy', role: 'goal', level: 'y2', chapters: [] },
    },
    edges: [{ from: 'a', to: 'b', why: 'energy needs motion' }],
    proposals: o.proposal ? [{ id: 'p1', kind: 'restructure', at: new Date().toISOString(), via: 'claude', status: 'pending', plan: { why: 'Energy fits the first year.', steps: [{ step: 'b', level: 'y1' }] } }] : [],
  });
  // the level's prepared subject: 8 true/false questions, all "true"
  Noema.loadSubject = async (_acc, id) => id === 'lv-pack' ? { chapters: [{ exercises: Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, type: 'tf', q: `Statement **${i + 1}** is true`, answer: true, explain: 'It is.' })) }] } : null;
  if (o.mastered) NoemaCurriculum.setMastered(acc, NoemaCurriculum.get(acc, cid), 'a', 'test');
}, [cid, o]);
const openMap = async (page, url, cid) => { await page.goto(url + '#/map/' + cid); await until(() => page.$('noema-roadmap-levels')); await wait(600); };
/** the text a learner sees in an element, through its shadow roots (slotted text once) */
const deepText = (page, sel) => page.evaluate(sel => {
  const walk = n => n.nodeType === 3 ? n.textContent : n.nodeType !== 1 && n.nodeType !== 11 ? '' : [...(n.shadowRoot ? [n.shadowRoot] : []), ...n.childNodes].map(walk).join(' ');
  const deep = r => r.querySelector(sel) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot)).find(Boolean) || null;   // the map draws its parts in its shadow root
  const el = deep(document); return el ? walk(el).replace(/\s+/g, ' ') : '';
}, sel);
const barText = page => deepText(page, 'noema-roadmap-levels');
/** an open dialog of a Roadmap element: count() > 0 while it is open; innerText() its words */
const dlg = (page, tag) => ({ count: () => page.locator(`${tag} dialog[open]`).count(), innerText: () => deepText(page, tag) });
/** no sideways scrolling, every visible control at least 24 × 24 px, inside a Roadmap element (shadow roots included) */
const fit = (page, tag) => page.evaluate(tag => {
  const all = r => [...r.querySelectorAll('*')].flatMap(e => [e, ...(e.shadowRoot ? all(e.shadowRoot) : [])]);
  const deep = r => r.querySelector(tag) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot)).find(Boolean) || null;   // the map draws its parts in its shadow root
  const el = deep(document); const small = [];
  for (const b of all(el)) {
    if (!b.matches('button, a[href], input, select')) continue;
    const r = b.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.width < 24 || r.height < 24) small.push(`${b.textContent.trim().slice(0, 20) || b.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return { scroll: document.documentElement.scrollWidth - innerWidth, small };
}, tag);
/** answer every question of the open quiz: the first option (true) or the second (false), with the keyboard */
const answerAll = async (page, host, pick) => {
  for (let i = 0; i < 8; i++) {
    const opt = page.locator(`${host} noema-roadmap-quiz .opt`).nth(pick);
    await opt.focus(); await page.keyboard.press('Enter'); await wait(80);
    const onNext = await page.evaluate(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return !!a?.closest('noema-button.next') || a?.getRootNode()?.host?.classList.contains('next'); });
    if (i === 0) ok(onNext, 'after an answer the focus is on Next (the keyboard goes on)');
    await page.keyboard.press('Enter'); await wait(80);
  }
};

(async () => {
  const browser = await chromium.launch();
  const url = await appUrl(ROOT);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(() => {   // Arabic (Egypt) switched on, whatever config.js says (E)
    let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (c) c.locales = { ...(c.locales || {}), 'ar-EG': 'on' }; } });
  });
  const page = await ctx.newPage(); const E = [];
  page.on('pageerror', e => E.push('PAGEERROR ' + e.message));
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);

  console.log('— A. the ladder on the map');
  await seed(page, 'lv-a');
  await openMap(page, url, 'lv-a');
  ok(await page.locator('noema-roadmap-levels noema-level-badge').count() === 2, 'the ladder: both levels');
  ok(await page.locator('noema-roadmap-levels noema-level-badge').nth(0).getAttribute('state') === 'current' && await page.locator('noema-roadmap-levels noema-level-badge').nth(1).getAttribute('state') === 'ahead', 'year 1 current, year 2 ahead');
  ok(/Level: First year/.test(await barText(page)), 'the current level by its own name');
  ok(await page.locator('noema-roadmap-levels noema-progress[label="Steps of First year mastered"]').count() === 1, 'how far the current level is (a named progress bar)');
  ok(!(await page.$('noema-roadmap-level-reached')), 'nothing reached yet: no moment');
  await page.screenshot({ path: SHOTS + '/levels_bar.png' });

  console.log('— B. moving up');
  await page.evaluate(() => NoemaCurriculum.setMastered(Noema.account.id, NoemaCurriculum.get(Noema.account.id, 'lv-a'), 'a', 'test'));
  await openMap(page, url, 'lv-a');
  ok(await until(() => dlg(page, 'noema-roadmap-level-reached').count()), 'year 1 done → the level-reached moment');
  const moment = await dlg(page, 'noema-roadmap-level-reached').innerText();
  ok(/A new level/.test(moment) && /Level reached: First year/.test(moment) && /Next: Year 2/.test(moment), 'it names the level and the next one (a preset level by the catalog’s words): ' + moment.replace(/\s+/g, ' ').slice(0, 90));
  await page.screenshot({ path: SHOTS + '/levels_moment.png' });
  await page.locator('noema-roadmap-level-reached noema-button').click(); await wait(300);
  ok(!(await page.$('noema-roadmap-level-reached')), 'Continue → back to the map');
  ok(/Level: Year 2/.test(await barText(page)) && await page.locator('noema-roadmap-levels noema-level-badge').nth(0).getAttribute('state') === 'done', 'the ladder moved: year 1 done, year 2 current');
  await openMap(page, url, 'lv-a');
  ok(!(await page.$('noema-roadmap-level-reached')), 'the map again: no second moment for the same level');
  ok(await page.evaluate(async () => (await NoemaCore.roadmaps.levels.view(Noema.account.id, NoemaCurriculum.get(Noema.account.id, 'lv-a'), () => true)).value.reached.includes('y1')), 'the learning log has it (NoemaCore.roadmaps.levels)');

  console.log('— C. the level test');
  await seed(page, 'lv-c', { levelTest: true, mastered: true });
  await openMap(page, url, 'lv-c');
  ok(/First year is done: take the level test to move up/.test(await barText(page)) && !(await page.$('noema-roadmap-level-reached')), 'a done level of a Roadmap with a level test waits for it (no moment yet)');
  await page.locator('noema-roadmap-levels noema-button.take').click();
  ok(await until(() => dlg(page, 'noema-roadmap-level-test').count()), 'the level test opens');
  ok(await until(async () => /8 questions from the subjects of this level/.test(await dlg(page, 'noema-roadmap-level-test').innerText())), 'first what it is: 8 questions from the level’s subject, 80 % to move up');
  ok(/Level test: First year/.test(await dlg(page, 'noema-roadmap-level-test').innerText()), 'its title names the level');
  ok(!(await page.$('noema-roadmap-level-test noema-roadmap-quiz')), 'no question before the learner goes on');
  await page.locator('noema-roadmap-level-test noema-button.start').click(); await wait(200);
  ok(/Question 1 of 8/.test(await dlg(page, 'noema-roadmap-level-test').innerText()) && await page.locator('noema-roadmap-level-test .q strong').count() === 1, 'one question at a time, its Markdown drawn');
  await answerAll(page, 'noema-roadmap-level-test', 1);
  ok(await until(async () => /0 of 8: not 80 % yet/.test(await dlg(page, 'noema-roadmap-level-test').innerText())), 'all wrong → failed, it says what to do');
  await page.locator('noema-roadmap-level-test noema-button:has-text("OK")').click(); await wait(300);
  ok(!(await page.$('noema-roadmap-level-test')) && /take the level test/.test(await barText(page)), 'the level stays; the test is still due');
  await page.locator('noema-roadmap-levels noema-button.take').click();
  await until(async () => /8 questions/.test(await dlg(page, 'noema-roadmap-level-test').innerText()));
  await page.locator('noema-roadmap-level-test noema-button.start').click(); await wait(200);
  await answerAll(page, 'noema-roadmap-level-test', 0);
  ok(await until(async () => /Passed: 8 of 8\. You moved up a level\./.test(await dlg(page, 'noema-roadmap-level-test').innerText())), 'all right → passed');
  await page.locator('noema-roadmap-level-test noema-button:has-text("OK")').click(); await wait(400);
  ok(await until(() => dlg(page, 'noema-roadmap-level-reached').count()) && /Level reached: First year/.test(await dlg(page, 'noema-roadmap-level-reached').innerText()), 'the moment follows the passed test');
  await page.locator('noema-roadmap-level-reached noema-button').click(); await wait(300);
  ok(/Level: Year 2/.test(await barText(page)) && !/take the level test/.test(await barText(page)), 'year 2 is current, no test due');

  console.log('— D. Claude’s proposed arrangement');
  await seed(page, 'lv-d', { proposal: true });
  await openMap(page, url, 'lv-d');
  ok(/Claude proposes a new arrangement of the levels/.test(await barText(page)), 'the banner on the map');
  await page.locator('noema-roadmap-levels noema-button.review').click();
  ok(await until(() => dlg(page, 'noema-roadmap-restructure').count()), 'Review opens the proposal');
  const prop = await dlg(page, 'noema-roadmap-restructure').innerText();
  ok(/Energy fits the first year\./.test(prop) && /“Energy”: Year 2 → First year/.test(prop) && /Nothing is lost/.test(prop), 'why, every change in words (levels by their names), and that nothing is lost');
  await page.screenshot({ path: SHOTS + '/levels_proposal.png' });
  const axeD = await new AxeBuilder({ page }).withTags(TAGS).include('noema-roadmap-restructure').analyze();
  ok(!axeD.violations.length, 'axe: the proposal ' + axeD.violations.map(v => v.id).join(', '));
  await page.locator('noema-roadmap-restructure noema-button.apply').click();
  ok(await until(async () => !(await page.$('noema-roadmap-restructure'))), 'Apply closes it');
  const after = await page.evaluate(() => { const c = NoemaCurriculum.get(Noema.account.id, 'lv-d'); return { level: c.nodes.b.level, status: c.proposals[0].status }; });
  ok(after.level === 'y1' && after.status === 'applied', 'the Roadmap is arranged anew: Energy is in the first year, the proposal applied');
  ok(!/proposes/.test(await barText(page)), 'the banner is gone');
  await seed(page, 'lv-d2', { proposal: true });
  await openMap(page, url, 'lv-d2');
  await page.locator('noema-roadmap-levels noema-button.review').click(); await until(() => dlg(page, 'noema-roadmap-restructure').count());
  await page.locator('noema-roadmap-restructure noema-button.decline').click();
  ok(await until(async () => !(await page.$('noema-roadmap-restructure'))), 'Keep it as it is closes it');
  const kept = await page.evaluate(() => { const c = NoemaCurriculum.get(Noema.account.id, 'lv-d2'); return { level: c.nodes.b.level, status: c.proposals[0].status }; });
  ok(kept.level === 'y2' && kept.status === 'declined', 'declined: nothing changed, the proposal declined');
  await seed(page, 'lv-d3', { proposal: true });
  await page.evaluate(() => { const c = NoemaCurriculum.get(Noema.account.id, 'lv-d3'); c.shared = { role: 'member', ownerName: 'Ana' }; NoemaCurriculum.save(Noema.account.id, c); });
  await openMap(page, url, 'lv-d3');
  ok(!/proposes/.test(await barText(page)), 'a member of a shared Roadmap sees no proposal (its owner decides)');

  console.log('— E. 320 px, axe, Escape, right to left');
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, 'lv-e', { levelTest: true, mastered: true });
  await openMap(page, url, 'lv-e');
  { const f = await fit(page, 'noema-roadmap-levels'); ok(f.scroll <= 0 && !f.small.length, `the bar at 320 px: no sideways scrolling (${f.scroll}), targets ≥ 24 px ${f.small.join(', ')}`); }
  const axeBar = await new AxeBuilder({ page }).withTags(TAGS).include({ fromShadowDom: ['noema-roadmap-map', 'noema-roadmap-levels'] }).analyze();
  ok(!axeBar.violations.length, 'axe: the level bar ' + axeBar.violations.map(v => v.id).join(', '));
  await page.locator('noema-roadmap-levels noema-button.take').click();
  await until(async () => /8 questions/.test(await dlg(page, 'noema-roadmap-level-test').innerText()));
  await page.locator('noema-roadmap-level-test noema-button.start').click(); await wait(200);
  await page.locator('noema-roadmap-level-test noema-roadmap-quiz .opt').nth(0).click(); await wait(100);
  { const f = await fit(page, 'noema-roadmap-level-test'); ok(f.scroll <= 0 && !f.small.length, `the level test at 320 px: no sideways scrolling (${f.scroll}), targets ≥ 24 px ${f.small.join(', ')}`); }
  await page.screenshot({ path: SHOTS + '/levels_test_320.png' });
  const axeT = await new AxeBuilder({ page }).withTags(TAGS).include('noema-roadmap-level-test').analyze();
  ok(!axeT.violations.length, 'axe: the level test with an answer ' + axeT.violations.map(v => v.id).join(', '));
  await page.keyboard.press('Escape'); await wait(300);
  ok(!(await page.$('noema-roadmap-level-test')), 'Escape closes the test');
  const rtl = await page.evaluate(async () => { await NoemaI18n.use('ar-EG'); return document.documentElement.dir; });
  await openMap(page, url, 'lv-e');
  await page.locator('noema-roadmap-levels noema-button.take').click();
  await until(() => dlg(page, 'noema-roadmap-level-test').count()); await wait(300);
  const dir = await page.evaluate(() => getComputedStyle(document.querySelector('noema-roadmap-level-test').shadowRoot.querySelector('noema-dialog').shadowRoot.querySelector('dialog')).direction);
  { const f = await fit(page, 'noema-roadmap-level-test'); ok(rtl === 'rtl' && dir === 'rtl' && f.scroll <= 0, `Arabic: the page and the dialog run right to left (${rtl}, ${dir}), no sideways scrolling`); }
  await page.screenshot({ path: SHOTS + '/levels_test_rtl.png' });

  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n❌ roadmap_levels: ${fails} failed` : '\n✅ roadmap_levels: all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
