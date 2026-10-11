/* D21 — the learner chooses the languages to study (docs/LANGUAGES.md §8 *Languages to study*):
     A. Node: NoemaLang.studyLangs (the answer, the course's own choice, none) and a course built with only the chosen languages —
        one language: no polyglot item, one lane, no bridges; two of four: polyglot items and comparisons only between them;
        the progress of a language left out is kept in the stored keys and comes back
     B. the browser, classic screens: the first-open question on the course's home, one language everywhere (no flag rail, no
        compare, no polyglot part), two of four from ⚙️ Settings (the compare lane with two columns), progress kept, a course with
        none of the chosen languages asks for its own
     C. the frame: the Languages tab asks first, then lists the chosen languages (each opens its course) and the courses with only them
   Usage: node tests/lang_select.js <prepared-repo-dir>   (built with tools/build.py; without playwright only part A runs) */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const COURSE = 'polyglot-semitic-zh-de';
const readData = dir => { const rd = r => { try { return JSON.parse(fs.readFileSync(path.join(dir, r), 'utf8')); } catch (e) { return null; } };
  const ls = r => { try { return fs.readdirSync(path.join(dir, r)).filter(f => f.endsWith('.json')).sort(); } catch (e) { return []; } }; return N.readCourse(rd, ls); };

console.log('A. the chosen languages in langcore');
{
  const S = (a, b, c) => JSON.stringify(N.studyLangs(a, b, c));
  ok(S(['ar', 'he', 'zh', 'de'], ['de', 'fr'], ['ar']) === JSON.stringify({ langs: ['de'], chosen: true, none: false }), 'the answer for the app decides (de of de, fr); the course’s own older choice does not');
  ok(S(['ar', 'he', 'zh', 'de'], null, ['he', 'ar']) === JSON.stringify({ langs: ['ar', 'he'], chosen: false, none: false }), 'no answer yet: the course’s own choice (in course order)');
  ok(S(['ar', 'he'], null, null).includes('"langs":["ar","he"]') && N.studyLangs(['ar', 'he'], ['fr'], null).none === true, 'no choice at all: every language; an answer with none of the course’s languages: none (the course asks)');
  const data = readData(path.join(ROOT, 'library', 'languages', COURSE));
  const full = N.course(data), one = N.course(data, { languages: ['de'] }), two = N.course(data, { languages: ['he', 'ar'] });
  ok(one.languages.join() === 'de' && Object.keys(one.lang).join() === 'de' && one.allLanguages.join() === 'ar,he,zh,de' && one.data === data, 'one language: the course knows only German (its data and all its languages stay)');
  ok(two.languages.join() === 'ar,he' && N.course(data, { languages: ['xx'] }).languages.length === 4, 'two of four in course order; a choice with none of them builds the whole course');
  const L1 = N.newLearner(one), L2 = N.newLearner(two);
  for (const C of [one, two]) { const L = C === one ? L1 : L2; for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex).slice(0, 80)) N.review(C, L, c, id, 'r', 'good', 0); }
  const p1 = N.planSession(one, L1, { day: 3, minutes: 30 }), p2 = N.planSession(two, L2, { day: 3, minutes: 30 });
  ok(!p1.steps.some(s => s.kind === 'poly') && p1.steps.every(s => (s.langs || [s.lang]).filter(Boolean).every(c => c === 'de')), 'one language: today’s plan is German only, no polyglot item');
  ok(p2.steps.every(s => (s.langs || [s.lang]).filter(Boolean).every(c => ['ar', 'he'].includes(c))), 'two of four: today’s plan only in Arabic and Hebrew');
  const k2 = { ar: N.known(two, L2, 'ar'), he: N.known(two, L2, 'he') };
  const items = N.POLY_TYPES.flatMap(t => N.polyItems(two, L2, t, { langs: two.languages, k: k2, knows: [], max: 6 }));
  const used = new Set(items.flatMap(it => [it.lang, it.from, ...(it.langs || []), ...(it.options || [])]).filter(c => typeof c === 'string' && /^[a-z]{2,3}$/.test(c)));
  ok(items.length > 0 && [...used].every(c => ['ar', 'he'].includes(c)), `two of four: ${items.length} polyglot items, all between Arabic and Hebrew (${[...used].join(', ')})`);
  ok(N.polyItems(one, L1, 'which_language', { langs: one.languages, k: { de: N.known(one, L1, 'de') }, knows: [], max: 6 }).length === 0, 'one language: no “which language?” items');
  ok(N.bridges(two).list.every(b => ['ar', 'he'].includes(b.a.lang) && ['ar', 'he'].includes(b.b.lang)) && !N.bridges(one).list.length, 'bridges only among the languages studied (none for one language)');
  ok(N.parallelLanes(one, one.languages).rows.every(r => Object.keys(r.cells).every(c => c === 'de')) && N.compareFn(two, 'fn.plural.noun', two.languages).langs.every(c => ['ar', 'he'].includes(c)), 'the lanes: one lane; the compare strip of a function: two columns');
  // the progress of a language left out: never deleted, back when it is chosen again (the stored keys, §5.6)
  const store = {}, put = (C, L) => Object.assign(store, JSON.parse(JSON.stringify(N.toKV(C, L))));
  const LF = N.newLearner(full); for (const id of Object.keys(full.lang.zh.lex).slice(0, 12)) N.review(full, LF, 'zh', id, 'r', 'good', 0); put(full, LF);
  const zhKeys = Object.keys(store).filter(k => k.startsWith('lang:zh:'));
  const Lde = N.fromKV(one, store); Lde.settings.languages = one.languages.slice(); N.review(one, Lde, 'de', Object.keys(one.lang.de.lex)[0], 'r', 'good', 1); put(one, Lde);
  ok(zhKeys.length && !Object.keys(N.toKV(one, Lde)).some(k => k.startsWith('lang:zh:')) && zhKeys.every(k => store[k]), 'German only: nothing of Chinese is written — and nothing of it is deleted');
  const back = N.fromKV(full, store);
  ok(Object.keys(back.langs.zh.items).length === 12 && Object.keys(back.langs.de.items).length === 1, 'Chinese chosen again: its 12 words are back, German’s new word too');
}

(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed — the browser part is skipped)'); return end(); }
  const b = await chromium.launch(), E = [], url = 'file://' + ROOT + '/index.html';
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const p = await ctx.newPage(); p.on('pageerror', e => E.push(e.message));
  const open = async (hash = '') => { await p.goto('about:blank'); await p.goto(url + '?account=anr&subject=lang:' + COURSE + hash);
    await p.waitForFunction(() => window.NoemaLangUI?.UI?.C && document.querySelector('.lx-main .lx-view'), null, { timeout: 60000 }); await wait(500); };
  const U = f => p.evaluate(f);
  console.log('B. classic screens');
  await p.goto(url); await p.evaluate(() => localStorage.clear());
  await open();
  const ask = await p.$eval('.lx-study-ask', e => ({ q: e.querySelector('.noema-study-q').textContent, langs: [...e.querySelectorAll('.noema-study-lang')].map(b => b.dataset.lang + ':' + b.querySelector('b').textContent + '/' + (b.querySelector('small')?.textContent || '')) })).catch(() => null);
  ok(ask && ask.q === 'Which languages do you want to study?' && ask.langs.length === 4 && ask.langs.some(x => x.startsWith('ar:العربية/Arabic')) && ask.langs.some(x => x.startsWith('de:Deutsch/German')) && ask.langs.some(x => x.startsWith('he:עברית')),
    'first open: “Which languages do you want to study?” — every language, its own name and its name in English (' + (ask?.langs || []).join(', ') + ')');
  ok(await p.locator('.lx-hero').count() === 1 && await U(() => NoemaLangUI.UI.C.languages.length) === 4, 'until the learner answers, the course teaches what it taught before (all four)');
  // progress in Chinese before choosing
  await U(() => { const { C, L } = NoemaLangUI.UI; for (const id of Object.keys(C.lang.zh.lex).slice(0, 10)) NoemaLang.review(C, L, 'zh', id, 'r', 'good', NoemaLang.dayNumber()); NoemaLangUI.save(true); });
  ok(await p.$eval('.noema-study-ok', b => b.disabled), 'nothing chosen yet: the button waits');
  await p.click('.lx-study-ask .noema-study-lang[data-lang="de"]'); ok(/Study 1 language/.test(await p.innerText('.noema-study-ok')), 'one chosen: “Study 1 language”');
  await p.click('.noema-study-ok'); await wait(600);
  const st1 = await U(() => ({ langs: NoemaLangUI.UI.C.languages.join(), set: JSON.parse(localStorage.getItem('noema1:anr:a:settings')).studyLangs, course: JSON.parse(localStorage.getItem('noema1:anr:s:lang:polyglot-semitic-zh-de:settings')).languages,
    zh: Object.keys(localStorage).filter(k => k.includes(':lang:zh:node:')).length, ask: !!document.querySelector('.lx-study-ask'), chips: document.querySelectorAll('.lx-top .lx-flagchip').length }));
  ok(st1.langs === 'de' && st1.set.join() === 'de' && st1.course.join() === 'de' && !st1.ask, 'German only: the course is rebuilt with German, the answer is stored for the app (and the course’s settings say it)');
  ok(st1.zh > 0, 'the Chinese progress stays stored (' + st1.zh + ' keys)');
  ok(st1.chips === 1 && await p.locator('.lx-polyhome .lx-polydrills, .lx-polyhome .lx-today').count() === 0 && await p.locator('.lx-tolanes').count() === 0, 'the home: one language chip, no today’s languages, no compare lane or polyglot drills, no parallel lanes');
  ok(await p.locator('.lx-nodestates').first().locator('.lx-ns').count() === 1, 'the map: one state per step (German)');
  const plan = await U(() => NoemaLang.planSession(NoemaLangUI.UI.C, NoemaLangUI.UI.L, { day: NoemaLang.dayNumber() + 3, minutes: 30, languages: NoemaLangUI.poly.todayLangs() }).steps);
  ok(!plan.some(s => s.kind === 'poly') && plan.every(s => (s.langs || [s.lang]).filter(Boolean).every(c => c === 'de')), 'today’s session: German only, no polyglot item');
  await open('#/c/veg.carrot');
  ok(await p.locator('.lx-rail').count() === 0 && !(await p.locator('button:has-text("Compare")').count()), 'a concept: no flag rail, no ⇄ Compare — a course of one language');
  await open('#/fn/fn.plural.noun/de');
  ok(await p.locator('.lx-gram').count() >= 1 && await p.locator('.lx-across, .lx-fnstrip, .lx-rail').count() === 0, 'a grammar point: no “same point in the other languages”, no comparison strip');
  ok(await p.locator('.lx-gram [data-cmp="learning"]').count() === 0, '“Among the languages you are learning”: absent with one language');
  await open('#/cmp');
  ok(/two languages/.test(await p.innerText('.lx-view')), 'the compare lane says why it is empty (one language)');
  await open('#/w/de/' + encodeURIComponent(await U(() => Object.keys(NoemaLangUI.UI.C.lang.de.lex).find(id => NoemaLangUI.UI.C.lang.de.lex[id].lemma === 'Kaffee') || Object.keys(NoemaLangUI.UI.C.lang.de.lex)[0])));
  ok(await p.locator('.lx-bridges li[data-lang]').count() === 0, 'a word card: no bridges to languages not studied');
  // ⚙️ Settings: two of four
  await open('#/settings');
  const boxes = await p.$$eval('.lx-studylangs .lx-check', l => l.map(x => x.dataset.lang + (x.querySelector('input').checked ? '+' : '-')));
  ok(boxes.join() === 'ar-,he-,zh-,de+', 'settings: every language of the course, German ticked (' + boxes.join() + ')');
  await p.click('.lx-studylangs .lx-check[data-lang="ar"] input'); await wait(400);
  await p.click('.lx-studylangs .lx-check[data-lang="he"] input'); await wait(400);
  await p.click('.lx-studylangs .lx-check[data-lang="de"] input'); await wait(400);
  const st2 = await U(() => ({ langs: NoemaLangUI.UI.C.languages.join(), set: JSON.parse(localStorage.getItem('noema1:anr:a:settings')).studyLangs.join() }));
  ok(st2.langs === 'ar,he' && st2.set === 'ar,he', 'ticked Arabic and Hebrew, unticked German: the course teaches Arabic and Hebrew (' + st2.langs + ')');
  await p.click('.lx-studylangs .lx-check[data-lang="ar"] input'); await wait(300);
  await p.click('.lx-studylangs .lx-check[data-lang="he"] input'); await wait(300);
  ok(await U(() => NoemaLangUI.UI.C.languages.join()) === 'he' && await p.$eval('.lx-studylangs .lx-check[data-lang="he"] input', i => i.checked), 'the last language cannot be unticked');
  await p.click('.lx-studylangs .lx-check[data-lang="ar"] input'); await wait(300);
  await open('#/cmp');
  ok(await p.locator('.lx-cmplangs .lx-todaychip').count() === 2 && await p.locator('.lx-cmprow').count() > 0, 'the compare lane: Arabic and Hebrew only');
  await open('#/cmp/fn/fn.plural.noun');
  ok((await p.$$eval('.lx-cmpfn tr[data-lang]', l => l.map(x => x.dataset.lang))).join() === 'ar,he', 'a function compared: two columns (ar, he)');
  const poly = await U(() => { const { C, L } = NoemaLangUI.UI, k = Object.fromEntries(C.languages.map(c => [c, NoemaLang.known(C, L, c)])); for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex).slice(0, 60)) NoemaLang.review(C, L, c, id, 'r', 'good', 0);
    const k2 = Object.fromEntries(C.languages.map(c => [c, NoemaLang.known(C, L, c)])); return NoemaLang.POLY_TYPES.flatMap(t => NoemaLang.polyItems(C, L, t, { langs: NoemaLangUI.poly.cmpLangs(), k: k2, knows: [], max: 4 })).flatMap(it => [it.lang, it.from, ...(it.langs || []), ...(it.options || [])]).filter(c => typeof c === 'string' && /^[a-z]{2,3}$/.test(c)); });
  ok(poly.length && poly.every(c => ['ar', 'he'].includes(c)), 'polyglot exercises only between Arabic and Hebrew');
  await open('#/fn/fn.plural.noun/ar');
  ok(JSON.stringify(await p.$$eval('.lx-across tr button', l => l.map(x => x.textContent.trim().split(' ').pop()))) === '["Arabic","Hebrew"]', 'a grammar point: the same point in the other language studied only');
  // Chinese again: its progress is back
  await open('#/settings'); await p.click('.lx-studylangs .lx-check[data-lang="zh"] input'); await wait(500);
  ok(await U(() => NoemaLangUI.UI.C.languages.join() === 'ar,he,zh' && Object.keys(NoemaLangUI.UI.L.langs.zh.items).length === 10), 'Chinese ticked again: its 10 words are back');
  // a course with none of the chosen languages asks for its own
  await U(() => { const k = 'noema1:anr:a:settings', s = JSON.parse(localStorage.getItem(k)); s.studyLangs = ['fr']; localStorage.setItem(k, JSON.stringify(s)); });
  await open();
  ok(await p.locator('.lx-study-ask').count() === 1 && await p.locator('.lx-hero').count() === 0 && /None of the languages you chose/.test(await p.innerText('.lx-study-ask')), 'the answer has none of this course’s languages: the course asks, nothing else');
  await p.click('.lx-study-ask .noema-study-lang[data-lang="zh"]'); await p.click('.noema-study-ok'); await wait(600);
  ok(await U(() => NoemaLangUI.UI.C.languages.join()) === 'zh' && await p.locator('.lx-hero').count() === 1, 'Chinese chosen: the course opens with Chinese');

  console.log('C. the frame: the Languages tab');
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(url + '?account=anr#/lang'); await until(() => p.$('.ns-studyask .noema-study'));
  ok(await p.locator('.ns-studyask .noema-study-lang').count() === 4 && await p.locator('.ns-langitem').count() >= 1, 'the tab asks first (four languages), the courses stay listed below');
  ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), '390 px: nothing scrolls sideways');
  await p.click('.ns-studyask .noema-study-lang[data-lang="de"]'); await p.click('.ns-studyask .noema-study-lang[data-lang="ar"]'); await p.click('.ns-studyask .noema-study-ok');
  await until(() => p.$('.ns-studylang'));
  ok((await p.$$eval('.ns-studylang', l => l.map(x => x.dataset.lang))).join() === 'ar,de' && /العربية/.test(await p.innerText('.ns-studylist')), 'then: your languages (ar, de) under their own names, each opening its course');
  const row = await p.$eval(`.ns-langitem[data-course="${COURSE}"]`, x => x.innerText).catch(() => '');
  ok(/🇸🇦/.test(row) && /🇩🇪/.test(row) && !/🇮🇱|🇨🇳/.test(row), 'the course row shows only the chosen languages: ' + row.replace(/\n/g, ' | '));
  await p.click('.ns-studylang[data-lang="de"]');
  await p.waitForSelector('.lx-host .lx-main .lx-view', { timeout: 30000 }); await wait(600);
  ok(await U(() => NoemaLangUI.UI.C.languages.join() + '|' + NoemaLangUI.UI.lang) === 'ar,de|de', 'German opens its course, with German on screen and Arabic beside it');
  ok(await p.locator('.lx-fhome .ns-item[data-act^="lang-"]').count() === 2, 'the course home: a row per chosen language (2)');
  await p.click('.ns-tab[data-tab="today"]'); await until(() => p.$('.ns-langgo'));
  ok(/🇸🇦 🇩🇪/.test(await p.innerText('.ns-langgo')) && !/🇨🇳/.test(await p.innerText('.ns-langgo')), 'Today: the course’s card with the chosen languages');
  await p.goto(url + '?account=anr#/lang'); await until(() => p.$('.ns-studychange'));
  await p.click('.ns-studychange'); await until(() => p.$('.ns-sheet .noema-study'));
  await p.click('.ns-sheet .noema-study-lang[data-lang="ar"]'); await p.click('.ns-sheet .noema-study-ok'); await until(async () => (await p.$$('.ns-studylang')).length === 1);
  ok((await p.$$eval('.ns-studylang', l => l.map(x => x.dataset.lang))).join() === 'de', 'changed on the tab: German only');
  await p.click(`.ns-langitem[data-course="${COURSE}"]`); await p.waitForSelector('.lx-host .lx-main .lx-view', { timeout: 30000 }); await wait(600);
  ok(await U(() => NoemaLangUI.UI.C.languages.join()) === 'de' && await p.locator('.lx-fhome .ns-item[data-act^="lang-"]').count() === 1 && await p.locator('.lx-fhome .ns-item[data-act="across"]').count() === 0,
    'the course: German only — one row, no “Across your languages”');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await b.close(); end();
})();
function end() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
