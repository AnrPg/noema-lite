/* The language-course UI (docs/LANGUAGES.md §8, P3) in a real browser over the pilot course.
   First the course as it is (it starts with the foundations, D9); then the vocabulary lane on a copy of the course
   without its lessons (the vegetables open at once), so that lane is tested whatever the state of the lessons' content.
   Usage: node tests/lang_ui.js <prepared-repo-dir>   (built with tools/build.py) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE;
/** A light copy of the prepared repo whose course has no lessons (fields only). */
function strippedCopy(src) {
  const os = require('os'), dst = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-lxui-'));
  fs.cpSync(src, dst, { recursive: true, filter: p => !/[\\/](\.git|dist|data)([\\/]|$)/.test('/' + path.relative(src, p)) && !/[\\/]library[\\/]subjects[\\/]/.test(p) });
  const f = path.join(dst, 'library', 'languages', COURSE, 'course.pack.js'), js = fs.readFileSync(f, 'utf8');
  const head = js.slice(0, js.indexOf('"] = ') + 5), data = JSON.parse(js.slice(head.length).replace(/;\s*$/, ''));
  const lessons = new Set(data.nodes.filter(n => n.kind === 'lesson').map(n => n.id));
  data.nodes = data.nodes.filter(n => !lessons.has(n.id)).map(n => ({ ...n, prereqs: (n.prereqs || []).filter(p => !lessons.has(p)) }));
  data.course = { ...data.course, draft: [] };
  for (const L of Object.values(data.langs)) for (const id of lessons) delete L.lexicon[id];   // their words are not part of the copy (sentences that need them are not offered)
  fs.writeFileSync(f, head + JSON.stringify(data).replace(/<\//g, '<\\/') + ';\n');
  return dst;
}

/** Answer the current exercise: rightly (true) or wrongly (false). */
async function answer(page, right) {
  const ex = await page.$('.lx-stage .lx-ex'); if (!ex) return null;
  const d = await ex.evaluate(e => ({ ...e.dataset }));
  if (d.kind === 'intro') { await page.click('.lx-stage .lx-next'); return d; }
  if (d.kind === 'rec') {
    const g = await page.evaluate(({ lang, lex }) => { const C = NoemaLangUI.UI.C, x = C.lang[lang].lex[lex], c = (x.senses || [])[0]; return c ? C.concepts[c].gloss : x.role; }, d);
    const opts = await page.$$('.lx-stage .lx-opt'); let hit = null;
    for (const o of opts) { const t = (await o.innerText()).replace(/^\d+\s*/, '').trim(); if ((t === g) === right) { hit = o; break; } }
    await (hit || opts[0]).click();
  } else {
    if (right) {
      const parts = await page.evaluate(({ lang, lex }) => { const x = NoemaLangUI.UI.C.lang[lang].lex[lex]; return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(x.lemma)].map(s => s.segment).filter(t => t.trim()); }, d);
      if (await page.$('.lx-stage .lx-tiles')) {
        for (const p of parts) { const tiles = await page.$$('.lx-stage .lx-tile1:not([disabled])'); for (const t of tiles) { if ((await t.innerText()) === p) { await t.click(); break; } } }
      } else {   // a long word: chosen among options
        const lemma = await page.evaluate(({ lang, lex }) => NoemaLangUI.UI.C.lang[lang].lex[lex].lemma, d);
        for (const o of await page.$$('.lx-stage .lx-opt')) if ((await o.innerText()).replace(/^\d+\s*/, '').trim() === lemma.normalize('NFC')) { await o.click(); break; }
      }
    } else await page.click('.lx-stage button:has-text("Show me")').catch(() => page.click('.lx-stage .lx-opt'));
    await wait(80);
    // the article / measure word that follows
    if (await page.$('.lx-stage .lx-opts:not([data-done])')) {
      const want = await page.evaluate(({ lang, lex }) => { const x = NoemaLangUI.UI.C.lang[lang].lex[lex]; return lang === 'de' ? { MASC: 'der', FEM: 'die', NEUT: 'das' }[x.gender] : '一' + (x.measure || [])[0]; }, d);
      const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); let hit = null;
      for (const o of opts) { const t = (await o.innerText()).replace(/^\d+\s*/, '').trim(); if ((t === want) === right) { hit = o; break; } }
      await (hit || opts[0]).click();
    }
  }
  await wait(60);
  const next = await page.$('.lx-stage .lx-next'); if (next) await next.click();
  return d;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  let url = 'file://' + ROOT + '/index.html';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?account=anr&subject=' + SUBJ); await wait(1200);
  ok(await page.evaluate(() => !!window.NoemaLangUI && !window.COURSE), 'the language course opens with its own UI (the subject engine is not loaded)');
  ok(await page.locator('.lx-flagchip').count() === 4, 'four language chips in the top bar');
  ok(/English/.test(await page.locator('.lx-explain').innerText()), 'the explanation language is shown');
  ok(await page.locator('.lx-lessonbtn').count() === 1 && /S00/.test(await page.locator('.lx-lessonbtn').innerText()), 'the course starts with the foundations: lesson S00, all four languages');
  const nl = await page.locator('.lx-lessonnode').count(), nn = await page.locator('.lx-node').count();
  ok(nl === 19 && nn === 24, `the map: 19 lessons, then the 5 vegetable nodes (${nl}, ${nn})`);
  await page.screenshot({ path: SHOTS + '/lx1_home.png' });

  // ---------- the vocabulary lane (a copy of the course without its lessons) ----------
  const ROOT2 = strippedCopy(ROOT); url = 'file://' + ROOT2 + '/index.html';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?account=anr&subject=' + SUBJ); await wait(1200);
  ok(await page.locator('.lx-node').count() === 5, 'the vocabulary map: 5 vegetable nodes'); if (E.length) console.log(E);
  const home = await page.locator('.lx-go').innerText();
  ok(/0 reviews · \d+ new/.test(home), 'today: no reviews yet, new words: ' + home);

  // ---------- the first session: every exercise answered right ----------
  await page.click('.lx-go'); await wait(200);
  const kinds = {}, langs = new Set(); let n = 0, firstThree = [];
  while (n < 400) { const d = await answer(page, true); if (!d) break; n++; kinds[d.kind] = (kinds[d.kind] || 0) + 1; langs.add(d.lang); if (firstThree.length < 4 && d.kind === 'intro') firstThree.push(d.lang); }
  ok(n > 30 && kinds.intro && kinds.rec === kinds.intro && kinds.prod === kinds.intro, `session: ${kinds.intro} new words introduced, each recognized and produced (${n} steps)`);
  ok(langs.size === 4 && new Set(firstThree).size >= 3, 'the same idea is learned in every language one after the other: ' + firstThree.join(' → '));
  ok(/0 to practise again/.test(await page.locator('.lx-result').innerText()), 'all right → nothing to practise again');
  await page.screenshot({ path: SHOTS + '/lx2_done.png' });
  const keys = await page.evaluate(p => Object.keys(localStorage).filter(k => k.startsWith(p)), `noema1:anr:s:${SUBJ}:`);
  ok(keys.some(k => k.endsWith(':lang:de:node:veg.1')) && keys.some(k => k.endsWith(':lang:zh:node:veg.1')), `state stored per language and node (${keys.length} keys)`);

  // ---------- wrong answers come back once ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/node/veg.1'); await wait(900);
  const before = await page.evaluate(() => Object.keys(NoemaLangUI.UI.L.langs.ar.items).length);
  await page.click('.lx-flagchip:has-text("AR")'); await wait(200);
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/node/veg.1'); await wait(900);
  ok(await page.evaluate(() => NoemaLangUI.UI.lang) === 'ar', 'the chosen language is remembered');
  await page.click('button:has-text("Learn / review this node")'); await wait(200);
  let again = 0, steps = 0;
  while (steps < 120) { const d = await answer(page, false); if (!d) break; steps++; if (await page.$('.lx-which:has-text("once more")')) again++; }
  ok(again > 0 && /to practise again/.test(await page.locator('.lx-result').innerText()), `wrong answers are asked once more later (${again} retries)`);
  const arStates = await page.evaluate(() => { const k = NoemaLang.known(NoemaLangUI.UI.C, NoemaLangUI.UI.L, 'ar'); return Object.values(k.state).filter(s => s === 'learning').length; });
  ok(arStates > 0, `Arabic words now “learning” (${arStates}; ${before} before)`);

  // ---------- reload keeps everything ----------
  await page.reload(); await wait(1000);
  ok(await page.evaluate(() => Object.keys(NoemaLangUI.UI.L.langs.de.items).length) > 5, 'after a reload the progress is still there');

  // ---------- a node learned in German opens the next one in German only ----------
  await page.evaluate(() => { const { C, L } = NoemaLangUI.UI, d = NoemaLang.dayNumber() - 10;
    for (const id of C.lang.de.byNode['veg.1']) for (const t of ['r', 'p']) { NoemaLang.review(C, L, 'de', id, t, 'good', d); NoemaLang.review(C, L, 'de', id, t, 'good', d + 1); }
    const kv = NoemaLang.toKV(C, L); for (const [k, v] of Object.entries(kv)) localStorage.setItem(`noema1:anr:s:lang:polyglot-semitic-zh-de:${k}`, JSON.stringify(v)); });
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(900);
  const veg2 = await page.locator('.lx-node >> nth=1').innerText();
  ok(/🇩🇪\s*○ open/.test(veg2) && /🇮🇱\s*🔒 locked/.test(veg2), 'Vegetables I known in German → the next node opens in German only');
  ok(/🇩🇪\s*● known/.test(await page.locator('.lx-node >> nth=0').innerText()), 'Vegetables I shows “known” for German');

  // ---------- the flag card of a concept ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/c/veg.carrot'); await wait(900);
  ok(await page.locator('.lx-railbtn').count() === 4, 'flag rail with 4 languages');
  await page.click('.lx-railbtn >> nth=1'); await wait(150);   // he
  const heLemma = await page.locator('.lx-card .lx-lemma .lx-w').first();
  ok(await heLemma.getAttribute('dir') === 'rtl' && await heLemma.getAttribute('lang') === 'he' && /גֶּזֶר/.test((await heLemma.innerText()).normalize('NFC')), 'Hebrew word, right to left, vocalized');
  const secs = await page.$$eval('.lx-card .lx-sec summary', s => s.map(x => x.textContent));
  ok(secs.some(s => /Meanings/.test(s)) && secs.some(s => /In sentences/.test(s)) && secs.some(s => /Watch out/.test(s)) && secs.some(s => /Where it comes from/.test(s)), 'the word card shows the profile sections: ' + secs.length);
  await page.click('button:has-text("Compare")'); await wait(150);
  ok(await page.locator('.lx-compare tr').count() === 4, 'compare: the concept in all 4 languages side by side');
  await page.click('.lx-railbtn >> nth=2'); await wait(150);   // zh
  ok(/húluóbo/.test(await page.locator('.lx-card .lx-lemma').innerText()), 'Chinese: pinyin under the characters');
  await page.screenshot({ path: SHOTS + '/lx3_card.png', fullPage: true });
  const noAr = await page.evaluate(() => Object.keys(NoemaLangUI.UI.C.lang.ar.absent).find(c => c.startsWith('veg.')));
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/c/' + noAr); await wait(800);
  await page.click('.lx-railbtn >> nth=0'); await wait(150);
  ok(/No Arabic word/.test(await page.locator('.lx-absent').innerText()), 'a concept without an Arabic word says so and what is used instead');

  // ---------- the field map ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/field/food.vegetables/0'); await wait(900);
  ok(await page.locator('.lx-tile').count() === 163 && await page.locator('.lx-h3').count() === 10, 'field map: all 163 vegetables in 10 subgroups');
  await page.click('.lx-seg button:has-text("rare")'); await wait(300);
  ok(await page.locator('.lx-tile').count() === 80, 'tier filter: the 80 rare ones');

  // ---------- name them all ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(500);
  await page.click('.lx-flagchip:has-text("DE")'); await wait(200);
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/recall/food.vegetables'); await wait(800);
  for (const w of ['Karotte', 'kartoffel', 'Zwiebeln', 'Quatsch']) { await page.fill('.lx-recallin', w); await page.press('.lx-recallin', 'Enter'); await wait(60); }
  ok(await page.locator('.lx-hit').count() === 3, 'name them all: any form, any capitalization; nonsense is refused');
  await page.click('button:has-text("Done")'); await wait(200);
  ok(/3 of \d+ vegetables in German/.test(await page.locator('.lx-result h2').innerText()), 'result: ' + await page.locator('.lx-result h2').innerText());

  // ---------- settings: reading help ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/settings'); await wait(600);
  await page.click('label:has-text("Vowel marks") input'); await wait(100);
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/c/veg.onion'); await wait(800);
  await page.click('.lx-railbtn >> nth=0'); await wait(150);
  ok(!/[ً-ْ]/.test(await page.locator('.lx-card .lx-lemma .lx-w').first().innerText()), 'vowel marks can be switched off');

  // ---------- phones ----------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hsh of ['#/', '#/c/veg.carrot', '#/field/food.vegetables/1', '#/settings']) {
    await page.goto(url + '?account=anr&subject=' + SUBJ + hsh); await wait(700);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, `phone: no sideways scrolling on ${hsh} (${over}px)`);
  }
  await page.screenshot({ path: SHOTS + '/lx4_phone.png' });
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(700);
  await page.click('.lx-go').catch(() => { }); await wait(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 1, `phone: the session fits (${over}px)`);

  // ---------- the picker leads there ----------
  const p2 = await (await browser.newContext()).newPage(); const E2 = []; p2.on('pageerror', e => E2.push(e.message));
  await p2.goto(url + '?account=anr'); await wait(1200);
  const tab = p2.locator('.cm-mode:has-text("Languages")');
  ok(await tab.count() === 1, 'the subject picker has a 🌍 Languages tab');
  await tab.click(); await wait(300);
  await p2.click('.noema-chip:has-text("Arabic")'); await wait(1500);
  ok(await p2.evaluate(() => !!window.NoemaLangUI), 'choosing the course opens it');
  ok(!E.length && !E2.length, 'no page errors ' + JSON.stringify([...E, ...E2].slice(0, 3)));
  await browser.close(); fs.rmSync(ROOT2, { recursive: true, force: true }); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
