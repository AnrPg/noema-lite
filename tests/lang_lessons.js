/* The foundations in a real browser (docs/LANGUAGES.md D9–D11, §6.7) over the mini course: lesson S00 (the types of languages,
   the overview, its quiz) and S01 in four languages together, gating per language, an extra lesson for one language,
   the grammar page with the same point in the other languages.
   Usage: node tests/lang_lessons.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), { execSync } = require('child_process');
const SRC = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// a light copy with the mini course as a library course
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-lessons-'));
fs.cpSync(SRC, ROOT, { recursive: true, filter: p => !/[\\/](\.git|dist|data)([\\/]|$)/.test(path.relative(SRC, p) ? '/' + path.relative(SRC, p) : '') && !/[\\/]library[\\/]subjects[\\/]/.test(p) });
fs.cpSync(path.join(SRC, 'tests', 'fixtures', 'lang-mini'), path.join(ROOT, 'library', 'languages', 'lang-mini'), { recursive: true });
execSync('python3 tools/build.py', { cwd: ROOT, stdio: 'pipe' });
const SUBJ = 'lang:lang-mini';

/** Answer what is on screen, rightly or wrongly. */
async function answer(page, right = true) {
  const a = await page.evaluate(() => { const c = NoemaLangUI.UI.current; if (!c) return null; const C = NoemaLangUI.UI.C;
    if (c.kind !== 'item') { const x = C.lang[c.lang].lex[c.lex], k = (x.senses || [])[0]; return { kind: c.kind, gloss: k ? C.concepts[k].gloss : x.role, lemma: x.lemma, lang: c.lang }; }
    return { kind: 'item', type: c.it.type, answer: c.it.answer, index: (c.it.options || []).indexOf(c.it.answer), size: c.it.size, lang: c.it.lang }; });
  if (!a) return null;
  if (a.kind === 'intro') { await page.click('.lx-stage .lx-next'); return a; }
  const pick = async want => { const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); let hit = null;
    for (const o of opts) { const t = (await o.innerText()).replace(/^\d+\s*/, '').trim(); if ((t === want.normalize('NFC')) === right) { hit = o; break; } } await (hit || opts[0]).click(); };
  if (a.kind === 'rec') await pick(a.gloss);
  else if (a.kind === 'prod') {
    if (!right) await page.click('.lx-stage button:has-text("Show me")');
    else { const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(a.lemma)].map(s => s.segment).filter(t => t.trim());
      for (const p of parts) { for (const t of await page.$$('.lx-stage .lx-tile1:not([disabled])')) if ((await t.innerText()) === p) { await t.click(); break; } } }
  } else if (a.type === 'choose') {   // options are shown in the item's order
    const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); await opts[right ? a.index : (a.index + 1) % opts.length].click();
  }
  else {   // build: the tiles of the stored sentence, in order
    const toks = await page.evaluate(() => { const it = NoemaLangUI.UI.current.it; return NoemaLangUI.UI.C.lang[it.lang].sentenceById[it.sentence].tokens.filter(t => !t.p).map(t => t.t); });
    if (!right) await page.click('.lx-stage button:has-text("Show me")');
    else for (const t of toks) { for (const b of await page.$$('.lx-stage .lx-tile1:not([disabled])')) if ((await b.innerText()) === t) { await b.click(); break; } }
  }
  await wait(40);
  const next = await page.$('.lx-stage .lx-next'); if (next) await next.click();
  return a;
}
/** Go through a running lesson: screens, words, drills, the check. wrongIn: languages where the check is answered wrongly. */
async function runThrough(page, wrongIn = []) {
  for (let guard = 0; guard < 400; guard++) {
    await wait(30);
    if (await page.$('.lx-result:has-text("Lesson check done"), .lx-result:has-text("Well done")')) return true;
    const cur = await page.evaluate(() => { const c = NoemaLangUI.UI.current; return c ? { check: !!c.check, lang: c.lang || c.it?.lang, shown: !!document.querySelector('.lx-stage .lx-ex') } : null; });
    if (cur?.shown && !(await page.$('.lx-stage .lx-next'))) { await answer(page, !(cur.check && wrongIn.includes(cur.lang))); continue; }
    const nx = await page.$('.lx-stage .lx-next'); if (nx) { await nx.click(); continue; }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?account=anr&subject=' + SUBJ); await wait(1200);
  const card = page.locator('.lx-lessonbtn');
  ok(await card.count() === 1 && /S00/.test(await card.innerText()) && /Arabic · 🇮🇱 Hebrew · 🇨🇳 Chinese · 🇩🇪 German/.test(await card.innerText()), 'home: the next lesson is S00, for all four languages together');
  ok(await page.locator('.lx-lessonnode').count() === 3 && /S01/.test(await page.locator('.lx-lessonnode >> nth=1').innerText()), 'the map lists the lessons with their step');

  // ---------- S00: the types of languages, the overview, the quiz ----------
  await page.click('.lx-lessonbtn button:has-text("Learn")'); await wait(300);
  ok(await page.locator('.lx-typology [data-type]').count() === 4 && /Isolating[\s\S]*🇨🇳/.test(await page.locator('.lx-typology').innerText()), 'S00 begins with the four types; each course language under its type');
  await page.click('.lx-stage .lx-next'); await wait(200);
  ok(await page.locator('.lx-overview').count() === 1 && /special from the very beginning/.test(await page.locator('.lx-overview').innerText()), 'then the overview of the language with its peculiarities');
  await page.click('.lx-stage .lx-railbtn >> nth=2'); await wait(100);
  ok(/Tones/.test(await page.locator('.lx-overview').innerText()), 'the flags switch the overview to another language (Chinese: tones)');
  ok(await runThrough(page, ['he']), 'S00 runs to the end');
  const res = await page.locator('.lx-result').innerText();
  ok(/Arabic: 3\/3[\s\S]*passed/.test(res) && /Hebrew: 0\/3[\s\S]*not yet/.test(res), 'the check: Arabic passed, Hebrew not yet (answered wrongly)');
  await page.screenshot({ path: (process.env.SHOTS || '/tmp/noema_shots') + '/lx_lesson_s00.png' });
  const st = await page.evaluate(() => { const { C, L } = NoemaLangUI.UI; return Object.fromEntries(C.languages.map(c => [c, NoemaLang.nodeStates(C, L, c)])); });
  ok(st.ar['fd.01'] === 'open' && st.he['fd.01'] === 'locked' && st.zh['fd.01'] === 'open', 'S01 opens only where S00 was passed');

  // ---------- S01 in three languages; an extra lesson for German ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(900);
  const cards = await page.locator('.lx-lessonbtn').allInnerTexts();
  ok(cards.length === 2 && /S00[\s\S]*Hebrew/.test(cards[0]) && /S01[\s\S]*Arabic · 🇨🇳 Chinese · 🇩🇪 German/.test(cards[1]), 'home: Hebrew repeats S00, the others go on to S01 together');
  await page.click('.lx-lessonbtn[data-node="fd.01"] button:has-text("Learn")'); await wait(300);
  ok(await page.locator('.lx-gram').count() === 1, 'S01 starts with its grammar');
  ok(await runThrough(page), 'S01 runs to the end: grammar, the word in three languages, drills, the check');
  const st2 = await page.evaluate(() => { const { C, L } = NoemaLangUI.UI; return Object.fromEntries(C.languages.map(c => [c, NoemaLang.nodeStates(C, L, c)])); });
  ok(st2.ar['fd.01'] === 'passed' && st2.ar['core.1'] === 'open' && st2.de['fd.01x'] === 'open' && st2.de['core.1'] === 'locked' && st2.zh['core.1'] === 'open', 'after S01: core.1 opens in Arabic and Chinese; German first has its extra lesson');
  const did = await page.evaluate(() => Object.keys(NoemaLangUI.UI.L.langs.ar.fns));
  ok(did.includes('fn.root.pattern'), 'the Arabic roots quiz was part of the lesson (its practice is stored)');

  // ---------- the lesson page and the grammar page ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/lesson/fd.01'); await wait(800);
  await page.evaluate(() => { NoemaLangUI.UI.lang = 'zh'; }); await page.goto(url + '?account=anr&subject=' + SUBJ + '#/lesson/fd.01'); await wait(800);
  await page.click('.lx-rail .lx-railbtn >> nth=2'); await wait(300);
  ok(/other languages also learn[\s\S]*Roots and patterns/.test(await page.locator('.view').innerText()), 'the Chinese lesson page points to what Arabic and Hebrew also learn at this step');
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/fn/fn.root.pattern/ar'); await wait(800);
  ok(await page.locator('.lx-across tr').count() === 4 && /not written yet/.test(await page.locator('.lx-across').innerText()), 'the grammar page shows the same point in all four languages (German, Chinese: not written)');
  await page.click('.lx-across button:has-text("Hebrew")'); await wait(400);
  ok(await page.evaluate(() => location.hash) === '#/fn/fn.root.pattern/he' && /כ-ת-ב/.test(await page.locator('.lx-gram').innerText()), 'a link opens the same point in Hebrew');
  await page.setViewportSize({ width: 380, height: 800 }); await page.goto(url + '?account=anr&subject=' + SUBJ + '#/lesson/fd.00'); await wait(800);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone width: the lesson page does not scroll sideways');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
