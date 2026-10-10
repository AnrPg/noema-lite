/* The whole language part, end to end (QA, docs/LANGUAGES.md §13 “QA”): regression checks for what the QA pass fixed, and a
   smoke pass over every route of the language UI for three learners — (a) brand-new, (b) the foundations S00–S18 passed in two
   languages and some vegetables learned, (c) all four languages with the core C01–C03 passed — on 1280 px and 390 px:
   no page error, no console error, nothing out of the screen sideways, no “undefined”, every Arabic / Hebrew / Chinese text in
   an element with its lang. No network: fonts and every http(s) request are answered locally.
   Usage: node tests/lang_walkthrough.js <prepared-repo-dir>   (built with tools/build.py) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0, checks = 0; const ok = (c, m) => { checks++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE, URL0 = 'file://' + path.join(ROOT, 'index.html'), URL1 = URL0 + '?account=anr&subject=' + SUBJ;

/* ---------- the learners (made through the runtime, stored like the app stores them) ---------- */
function setupLearner(prof) {
  const N = NoemaLang, { C, L } = NoemaLangUI.UI, d = N.dayNumber();
  const pass = (c, want) => { for (const nid of C.order) if (C.nodes[nid].kind === 'lesson' && want(nid) && C.lang[c].applies[nid]) {
    for (const id of C.lang[c].byNode[nid] || []) { N.introduce(C, L, c, id, d - 12); N.review(C, L, c, id, 'r', 'good', d - 12); N.review(C, L, c, id, 'r', 'good', d - 9); N.review(C, L, c, id, 'p', 'good', d - 8); }
    N.recordCheck(C, L, c, nid, 1, d - 7); } };
  const fd = nid => nid.startsWith('fd.');
  if (prof === 'b') { for (const c of ['de', 'ar']) pass(c, fd); for (const id of (C.lang.de.byNode['veg.1'] || []).slice(0, 12)) { N.introduce(C, L, 'de', id, d - 5); N.review(C, L, 'de', id, 'r', 'good', d - 5); N.review(C, L, 'de', id, 'p', 'good', d - 2); } }
  if (prof === 'c') { for (const c of C.languages) pass(c, n => fd(n) || ['cr.01', 'cr.02', 'cr.03'].includes(n)); for (const c of C.languages) for (const id of (C.lang[c].byNode['veg.1'] || []).slice(0, 10)) { N.introduce(C, L, c, id, d - 5); N.review(C, L, c, id, 'r', 'good', d - 5); } }
  NoemaLangUI.save(true);
}
async function open(browser, prof, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
  await ctx.route(/^https?:\/\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));   // fonts and anything else online: answered locally
  const page = await ctx.newPage(), E = [], CE = [];
  page.on('pageerror', e => E.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) CE.push(m.text()); });   // config.local.js is optional
  page.on('dialog', d => d.accept());
  await page.goto(URL0); await page.evaluate(() => localStorage.clear());
  await page.goto(URL1); await page.waitForSelector('.lx-main .lx-view', { timeout: 20000 }); await wait(600);
  if (prof !== 'a') { await page.evaluate(setupLearner, prof); await reload(page, '#/'); await page.waitForSelector('.lx-main .lx-view', { timeout: 20000 }); await wait(500); }
  return { ctx, page, E, CE };
}
/** A real reload (a goto that changes only the hash would not reload). */
const reload = async (page, h) => { await page.evaluate(h => { location.hash = h; }, h); await page.reload(); await page.waitForSelector('.lx-main .lx-view', { timeout: 20000 }); await wait(300); };
const hash = async (page, h) => { await page.evaluate(h => { location.hash = h; }, h); await wait(350); };
/** What a learner must never see on a page: things out of the screen, “undefined”, foreign script without its lang. */
const pageProblems = page => page.evaluate(() => {
  const iw = innerWidth, out = [];
  const clipped = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true; return false; };
  for (const e of document.querySelectorAll('.lx-main *')) { const b = e.getBoundingClientRect(); if (b.width && b.right > iw + 1 && getComputedStyle(e).position !== 'fixed' && !clipped(e)) { out.push('wide ' + e.tagName + '.' + e.className + ' ' + Math.round(b.right)); break; } }
  if (document.documentElement.scrollWidth > iw + 1) out.push('page scrolls sideways ' + document.documentElement.scrollWidth);
  const txt = document.querySelector('.lx-main')?.innerText || '';
  const bad = txt.match(/.{0,25}(\bundefined\b|\bNaN\b|\[object ).{0,25}/); if (bad) out.push('text: ' + bad[0]);
  if (txt.trim().length < 40) out.push('empty view');
  const tw = document.createTreeWalker(document.querySelector('.lx-main'), NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode, sc = /[֐-׿]/.test(t.data) ? /^(he|yi|und-hebr)/ : /[؀-ۿ]/.test(t.data) ? /^(ar|fa|ur|und-arab)/ : /[一-鿿]/.test(t.data) ? /^(zh|ja|und-hani)/ : null;
    if (!sc || t.parentElement.closest('svg, select, textarea')) continue;
    const l = (t.parentElement.closest('[lang]')?.getAttribute('lang') || '').toLowerCase();
    if (!sc.test(l)) { out.push(`no lang: “${t.data.slice(0, 20)}” in <${t.parentElement.tagName.toLowerCase()} lang=${l}>`); break; }
  }
  return out;
});
/** Answer whatever is on the stage (an option, a tile, a typed box, the next button) — a random but valid action. */
const act = page => page.evaluate(() => {
  const vis = e => e && e.offsetParent !== null && !e.disabled, st = document.querySelector('.lx-stage') || document.querySelector('.lx-main');
  const res = st.querySelector('.lx-result h2, .lx-sortdone');
  if (res && !st.querySelector('.lx-nextrow .lx-next, .lx-result .lx-next') && !/lesson check$/i.test(res.textContent)) return 'end';
  const pick = sel => { const l = [...st.querySelectorAll(sel)].filter(vis); if (!l.length) return false; l[Math.random() * l.length | 0].click(); return true; };
  if (pick('.lx-opts:not([data-done]) .lx-opt')) return 'opt';
  if (Math.random() < 0.85 && pick('.lx-tile1:not([disabled]), .lx-bucket:not(.on), .lx-atok:not([disabled])')) return 'tile';
  const inp = [...st.querySelectorAll('input[type=text], input:not([type]), textarea')].filter(vis).find(x => !x.dataset.qa);
  if (inp) { inp.dataset.qa = 1; inp.value = 'x'; inp.dispatchEvent(new Event('input', { bubbles: true })); const b = [...st.querySelectorAll('button')].find(b => vis(b) && /^(Check|✓)/.test(b.textContent.trim())); if (b) { b.click(); return 'typed'; } }
  if (pick('.lx-next, .lx-selfok, .lx-check')) return 'next';
  const g = [...st.querySelectorAll('button')].find(b => vis(b) && /Show me/.test(b.textContent)); if (g) { g.click(); return 'show'; }
  return pick('.lx-tile1:not([disabled]), .lx-tonebtn, .lx-vletter') ? 'misc' : 'stuck';
});
async function runToEnd(page, max = 200) { for (let i = 0; i < max; i++) { const a = await act(page); if (a === 'end') return true; await wait(a === 'stuck' ? 250 : 60); } return false; }

(async () => {
  console.log('— the runtime');
  {
    const js = fs.readFileSync(path.join(ROOT, 'library', 'languages', COURSE, 'course.pack.js'), 'utf8'), data = JSON.parse(js.slice(js.indexOf('"] = ') + 5).replace(/;\s*$/, ''));
    const C = N.course(data), L = N.newLearner(C, {});
    for (const c of ['de', 'ar']) for (const nid of C.order.filter(n => C.nodes[n].kind === 'lesson' && C.lang[c].applies[n]).slice(0, 12)) for (const id of C.lang[c].byNode[nid] || []) N.review(C, L, c, id, 'r', true, 0);
    const texts = ['de', 'ar'].flatMap(c => N.readerTexts(C, L, c));
    ok(texts.length > 3 && texts.every(t => !/\b(PERSON|THING|ADJECTIVE|PLACE|VEGETABLE)\b/.test(t.title) && t.title.endsWith('…')), `graded texts are titled by their first sentence, not by a frame pattern (${texts.length}: “${texts[0]?.title}”)`);
    ok(new Set(texts.filter(t => t.lang === 'de').map(t => t.title)).size === texts.filter(t => t.lang === 'de').length, 'no two texts of a language share a title');
  }

  const browser = await chromium.launch();
  console.log('— a brand-new learner (390 px)');
  {
    const { ctx, page, E, CE } = await open(browser, 'a', 390);
    const go = page.locator('.lx-go');
    ok(!(await go.isDisabled()) && /Start: S00/.test(await go.innerText()), 'the big button starts the first lesson (not “nothing due — come back tomorrow”): ' + (await go.innerText()).replace(/\s+/g, ' '));
    const rows = await page.$$eval('.lx-prodlanes .lx-lanerow', rs => rs.map(r => ({ c: r.dataset.lang, n: ['.lx-togrammar', '.lx-towrite', '.lx-toread', '.lx-scriptbtn', '.lx-topec', '.lx-totutor'].filter(s => r.querySelector(s)).length })));
    ok(rows.length === 4 && rows.every(r => r.n === 6), 'home: one lane row per language with 📐 ✍️ 📖 🔤 📚 🎓 (' + rows.map(r => r.c + ':' + r.n).join(' ') + ')');
    ok(!(await page.$('.lx-libraries')) && await page.locator('.lx-prodlanes .lx-polydrills').count() === 1 && await page.locator('.lx-prodlanes .lx-drills .lx-sortfold').count() === 1, 'home: the polyglot drills and the drills sit under the lanes; the field sorts folded in one button');
    const order = await page.evaluate(() => [...document.querySelectorAll('.lx-view > *')].map(e => e.className.split(' ').find(c => /^lx-(hero|lessons|prodlanes|glane|nodes)$/.test(c))).filter(Boolean));
    ok(order.join() === 'lx-hero,lx-lessons,lx-prodlanes,lx-glane,lx-nodes', 'home order: session · next lesson · lanes · grammar · map — ' + order.join());
    const map = await page.evaluate(() => ({ shown: [...document.querySelectorAll('.lx-node')].filter(n => !n.hidden).length, all: document.querySelectorAll('.lx-node').length, chip: document.querySelector('.lx-node .lx-ns')?.textContent, title: document.querySelector('.lx-node .lx-ns')?.title, legend: document.querySelector('.lx-maplegend')?.textContent || '' }));
    ok(map.shown < 12 && map.all > 60 && /locked/.test(map.legend) && map.chip.length <= 6 && /open|locked/.test(map.title), `the map: the near steps (${map.shown} of ${map.all}), compact chips (“${map.chip}”, words in the tooltip and the legend)`);
    await page.click('.lx-mapmore'); ok(await page.evaluate(() => [...document.querySelectorAll('.lx-node')].every(n => !n.hidden)), '🗺️ the whole map unfolds on a tap');
    ok(!(await pageProblems(page)).length, 'home at 390 px: ' + JSON.stringify(await pageProblems(page)));
    await page.click('.lx-go'); await wait(300);
    ok(await page.locator('.lx-lessonrun[data-node="fd.00"]').count() === 1, '▶ the first lesson runs');
    ok(await runToEnd(page, 120), 'the first lesson runs to its end');
    // the tutor without a key: Esc closes it (the focus is in the drawer)
    await reload(page, '#/'); await page.waitForSelector('.lx-prodlanes'); await page.click('.lx-lanerow[data-lang=de] .lx-totutor'); await wait(250);
    ok(await page.locator('.lx-tutor').count() === 1 && await page.evaluate(() => !!document.activeElement?.closest('.lx-tutor')), '🎓 the tutor opens with the focus inside (no key: the key box)');
    await page.keyboard.press('Escape'); await wait(150); ok(await page.locator('.lx-tutor').count() === 0, 'Esc closes the tutor without a key too');
    ok(!E.length && !CE.length, 'no page / console errors ' + JSON.stringify([...E, ...CE].slice(0, 3)));
    await ctx.close();
  }

  console.log('— a learner with the foundations in German and Arabic (1280 px)');
  {
    const { ctx, page, E, CE } = await open(browser, 'b', 1280);
    // 🏋️ deepening: the line above an item names the type, never the word (it is the answer of some types)
    await hash(page, '#/deepen/fd.05/de'); let leaks = 0, seen = 0;
    for (let i = 0; i < 12; i++) {
      const r = await page.evaluate(() => { const a = NoemaLangUI.UI.current; const w = document.querySelector('.lx-deeprun .lx-which'); if (!a?.it || !w) return null; const lx = NoemaLangUI.UI.C.lang[a.it.lang].lex[a.it.lex]; return { leak: !!lx && w.textContent.includes(lx.lemma) }; });
      if (r) { seen++; if (r.leak) leaks++; }
      if (await act(page) === 'end') break; await wait(60); await act(page); await wait(60);
    }
    ok(seen > 2 && !leaks, `🏋️ deepen: ${seen} items, the word never shown above the question`);
    // 🔁 principal parts: German articles are der / die / das of the same noun
    await hash(page, '#/parts/de'); let arts = 0, good = 0;
    for (let i = 0; i < 10; i++) {
      const q = await page.evaluate(() => { const e = document.querySelector('.lx-exparts'); return e ? { label: e.dataset.label, opts: [...e.querySelectorAll('.lx-opt')].map(o => o.innerText.replace(/^\d+\s*/, '').trim()) } : null; });
      if (!q) break;
      if (q.label === 'article') { arts++; const nouns = new Set(q.opts.map(o => o.split(' ').slice(1).join(' '))); if (nouns.size === 1 && q.opts.every(o => /^(der|die|das) /.test(o))) good++; }
      if (q.label === 'genitive' || q.label === 'plural') { arts++; const flat = w => w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'); const lem = await page.evaluate(() => NoemaLangUI.UI.C.lang.de.lex[document.querySelector('.lx-exparts').dataset.lex].lemma); if (q.opts.filter(o => flat(o).includes(flat(lem).slice(0, 3))).length >= q.opts.length - 1) good++; else console.log('     ', lem, q.opts.join(' / ')); }
      await page.click('.lx-exparts .lx-opt >> nth=0'); await page.click('.lx-exparts .lx-next'); await wait(40);
    }
    ok(arts > 0 && good === arts, `🔁 principal parts: the options are forms of the same word (${good}/${arts})`);
    // 📖 reading: titles a learner understands
    await hash(page, '#/read/de');
    const titles = await page.$$eval('.lx-textcard b', bs => bs.map(b => b.textContent));
    ok(titles.length > 2 && titles.every(t => !/\b(PERSON|THING|ADJECTIVE|PLACE)\b/.test(t)), '📖 reading list: ' + titles.slice(0, 3).join(' | '));
    // D19: the 🆕 words of a sentence open their card and are listed at the end
    await hash(page, '#/write/de/translate'); let sawNew = false;
    for (let i = 0; i < 160; i++) { if (!sawNew && await page.$('.lx-stage .lx-new')) { sawNew = true; await page.click('.lx-stage .lx-new >> nth=0'); await wait(150); ok(await page.locator('.lx-pop .lx-card').count() === 1, 'D19: a 🆕 word opens its card'); await page.click('.lx-pop button:has-text("✕")'); } if (await act(page) === 'end') break; await wait(50); }
    ok(await page.locator('.lx-result').count() === 1 && (!sawNew || await page.locator('.lx-result .lx-newlist li').count() > 0), 'D19: ✍️ translate runs to its end' + (sawNew ? ' and lists the 🆕 words' : ''));
    // a lesson passed before and failed now: said as it is; the next lesson offered
    await hash(page, '#/lesson/fd.01'); await page.click('button:has-text("Lesson check")'); await wait(200);
    for (let i = 0; i < 400; i++) { const st = await page.evaluate(() => !!document.querySelector('.lx-result h2')?.textContent.includes('Lesson check done')); if (st) break;
      if (await act(page) === 'end') break; await wait(40); }
    const res = await page.evaluate(() => [...document.querySelectorAll('.lx-result li[data-lang]')].map(li => li.textContent));
    if (!res.length) console.log('      (stage: ' + (await page.locator('.lx-main').innerText()).slice(0, 300).replace(/\s+/g, ' ') + ')');
    ok(res.length && res.every(t => /passed|not yet/.test(t)) && res.every(t => !/\b([0-7]?\d) % — ✔ passed$/.test(t)), 'lesson check: a low score in a passed lesson is not called “✔ passed”: ' + res.join(' | '));
    ok(await page.locator('.lx-nextlesson').count() === 1, 'the end of a lesson offers ▶ the next lesson: ' + (await page.locator('.lx-nextlesson').innerText().catch(() => '—')));
    await page.click('.lx-nextlesson', { timeout: 3000 }).catch(() => { }); await wait(200); ok(await page.locator('.lx-lessonrun').count() === 1 && await page.locator('.lx-lessonrun').getAttribute('data-node') !== 'fd.01', '▶ next lesson starts it');
    // keyboard: the number keys answer in a session
    await reload(page, '#/'); await page.waitForSelector('.lx-go'); await page.click('.lx-go'); await wait(200);
    for (let i = 0; i < 6 && !(await page.$('.lx-stage .lx-opts:not([data-done])')); i++) { await act(page); await wait(60); }
    if (await page.$('.lx-stage .lx-opts:not([data-done])')) { await page.keyboard.press('1'); await wait(80); ok(await page.locator('.lx-stage .lx-opts[data-done]').count() >= 1, 'keyboard: “1” answers'); }
    // reload keeps the progress
    const before = await page.evaluate(() => JSON.stringify(NoemaLangUI.UI.L.langs.de.items).length);
    await reload(page, '#/'); await page.waitForSelector('.lx-go'); await wait(300);
    ok(await page.evaluate(() => JSON.stringify(NoemaLangUI.UI.L.langs.de.items).length) === before, 'a reload keeps every answer');
    ok(!E.length && !CE.length, 'no page / console errors ' + JSON.stringify([...E, ...CE].slice(0, 3)));
    await ctx.close();
  }

  console.log('— settings, languages, the picker, the ✨ dialog (390 px)');
  {
    const { ctx, page, E, CE } = await open(browser, 'c', 390);
    await hash(page, '#/settings');
    await page.selectOption('.lx-knows select[aria-label="add a language"]', { label: (await page.locator('.lx-knows select[aria-label="add a language"] option').allTextContents()).find(o => /^Japanese/.test(o)) });
    await page.fill('input[type=number] >> nth=0', '9'); await page.press('input[type=number] >> nth=0', 'Tab'); await wait(300);
    await reload(page, '#/settings'); await page.waitForSelector('.lx-knows'); await wait(300);
    const S = await page.evaluate(() => NoemaLangUI.UI.L.settings);
    ok(S.knows.some(k => k.code === 'ja') && S.batch === 9 && await page.inputValue('input[type=number] >> nth=0') === '9', 'settings round trip: a language added to “you know” and the batch size survive a reload');
    // D18: what the learner's native languages already have is folded
    await page.evaluate(() => { NoemaLangUI.UI.L.settings.knows = [{ code: 'tr', level: 'native' }]; NoemaLangUI.save(true); });
    let folds = 0; for (const f of ['fn.case.basic', 'fn.personal.suffix', 'fn.plural.noun', 'fn.negation']) { await hash(page, `#/fn/${f}/de`); folds += await page.locator('.lx-familiar, .lx-familiarline').count(); }
    await page.evaluate(() => { NoemaLangUI.UI.L.settings.knows = [{ code: 'zh', level: 'native' }]; NoemaLangUI.save(true); }); await hash(page, '#/fn/fn.tones/zh');
    const zhFold = await page.locator('.lx-familiar, .lx-familiarline').count();
    ok(folds + zhFold > 0, `D18: familiar parts folded for a native speaker (${folds} on German pages for Turkish, ${zhFold} on the tones for Chinese)`);
    // switching the language
    await reload(page, '#/'); await page.waitForSelector('.lx-flagchip'); await page.click('.lx-flagchip[data-lang="he"]'); await wait(200);
    await reload(page, '#/'); await page.waitForSelector('.lx-flagchip'); await wait(200);
    ok(await page.evaluate(() => NoemaLangUI.UI.lang) === 'he' && await page.locator('.lx-flagchip.on[data-lang="he"]').count() === 1, 'switching the language: kept after a reload');
    // compose: the words to use wrap on a phone
    await hash(page, '#/write/de/compose'); await wait(200);
    const reqOut = await page.$$eval('.lx-req', (rs, w) => rs.filter(r => r.getBoundingClientRect().right > w + 1).length, 390);
    ok(await page.locator('.lx-req').count() > 0 && reqOut === 0, '✍️ guided writing: the words to use stay on the screen at 390 px');
    ok(!E.length && !CE.length, 'no page / console errors ' + JSON.stringify([...E, ...CE].slice(0, 3)));
    // the picker → 🌍 Languages → ✨ the new-course dialog → the course
    const p2 = await ctx.newPage(); const E2 = []; p2.on('pageerror', e => E2.push(e.message));
    await p2.goto(URL0 + '?account=anr'); await wait(1200);
    await p2.click('.cm-mode:has-text("Languages")'); await wait(300);
    await p2.click('button:has-text("New language course")'); await p2.waitForSelector('.lj-box');
    ok(await p2.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Title'), '✨ the dialog opens with the title focused');
    const chips = await p2.$$eval('.lj-lang', bs => bs.map(b => b.textContent.trim()));
    ok(chips.every(t => !/^\W*[a-z]{2,3}$/.test(t)) && chips.some(t => /Portuguese/.test(t)), 'every language of the dialog has its name (' + chips.slice(-5).join(', ') + ')');
    await p2.keyboard.press('Escape'); await wait(150); ok(await p2.locator('.lj-box').count() === 0, 'Esc closes it');
    await p2.click('button:has-text("New language course")'); await p2.waitForSelector('.lj-box'); await p2.click('.lj-box button:has-text("Cancel")'); await wait(150);
    ok(await p2.locator('.lj-box').count() === 0 && await p2.locator('.noema-chip:has-text("Arabic")').count() > 0, 'Cancel closes it, back to the 🌍 courses');
    await p2.click('.noema-chip:has-text("Arabic")'); await p2.waitForFunction(() => !!window.NoemaLangUI?.UI?.C, null, { timeout: 20000 }).catch(() => { });
    ok(await p2.evaluate(() => !!document.querySelector('.lx-hero')), 'the picker opens the course on its home');
    ok(!E2.length, 'no page errors in the picker ' + JSON.stringify(E2.slice(0, 3)));
    await ctx.close();
  }

  console.log('— every route, three learners, two widths');
  for (const prof of ['a', 'b', 'c']) for (const width of [1280, 390]) {
    const { ctx, page, E, CE } = await open(browser, prof, width);
    const R = await page.evaluate(() => { const { C } = NoemaLangUI.UI; return { de: Object.keys(C.lang.de.lex)[40], ar: Object.keys(C.lang.ar.lex)[40], zh: Object.keys(C.lang.zh.lex)[40], frame: C.data.frames[0].id }; });
    const routes = ['#/', '#/settings', '#/lesson/fd.00', '#/lesson/fd.05', '#/lesson/fd.18', '#/lesson/cr.01', '#/lesson/cr.05', '#/node/veg.1', '#/node/veg.3b', '#/c/veg.carrot',
      `#/w/de/${R.de}`, `#/w/ar/${R.ar}`, `#/w/zh/${R.zh}`, '#/field/food.vegetables/0', '#/field/family/0', '#/recall/food.vegetables', '#/peculiar/ar', '#/peculiar/zh', '#/sort/food.vegetables', '#/parts/de', '#/parts/ar',
      '#/fn/fn.plural.noun/de', '#/fn/fn.plural.noun/ar', '#/fn/fn.overview/zh', '#/fn/fn.tones/zh', '#/fn/fn.tones/de', '#/fn/fn.root.pattern/he', '#/grammar/de', '#/grammar/ar', '#/grammar/zh',
      `#/deep/de/${R.de}`, '#/deepen/veg.1/de', '#/deepen/fd.05/ar', '#/cmp', '#/cmp/fn/fn.negation', `#/cmp/frame/${R.frame}`, '#/cmp/c/veg.carrot',
      '#/poly/which_language', '#/poly/parallel_align', '#/poly/parallel_translate', '#/poly/cognate_bridge', '#/poly/compare_rule',
      '#/write/de', '#/write/ar', '#/write/he/translate', '#/read/de', '#/read/zh', '#/script/ar', '#/script/he', '#/script/zh', '#/script/de', '#/claude'];
    const bad = [];
    for (const r of routes) { await hash(page, r); const p = await pageProblems(page); if (p.length) bad.push(r + ' → ' + p.join('; ')); }
    ok(!bad.length, `${prof} · ${width} px: ${routes.length} routes clean` + (bad.length ? ' — ' + bad.slice(0, 4).join(' ‖ ') : ''));
    ok(!E.length && !CE.length, `${prof} · ${width} px: no page / console errors ` + JSON.stringify([...E, ...CE].slice(0, 3)));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} of ${checks} FAILED` : `\nALL PASSED (${checks} checks)`); process.exit(fails ? 1 : 0);
})();
