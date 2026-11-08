/* R3 (strengthens D14): the word card shows the word's distinctive parameters right under the word, before the senses —
   langcore wordParams over the pilot course, then the card in a real browser (Arabic plurals with their meanings, German
   der/die/das + plural, a German strong verb with Präteritum, Partizip II with hat / ist and the vowel change; phone width, dark);
   and "In other languages" open at 320 px (LTR and RTL) and desktop: no word broken in the middle, 🔊 beside its word, no overflow.
   Usage: node tests/lang_wordcard.js [prepared-repo-dir]   (the browser part needs a built repo: python3 tools/build.py) */
const fs = require('fs'), path = require('path');
const { appUrl } = require('./serve');   // the app over http, as the website serves it (tests/serve.js)
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
require('./built').ensureBuilt(ROOT);   // the generated files it reads (never committed): built first, unless tests/run_e2e.sh did
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
const PILOT = path.join(ROOT, 'library', 'languages', 'polyglot-semitic-zh-de');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const read = rel => { const p = path.join(PILOT, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const list = rel => { const p = path.join(PILOT, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
const C = N.course(N.readCourse(read, list));
const P = (c, id) => N.wordParams(C, id, c), row = (ps, id) => ps.find(r => r.id === id);
const texts = r => (r ? r.values.flatMap(v => v.forms.map(f => f.text)) : []);

console.log('— wordParams over the pilot course');
// Arabic: a noun with two plurals, each with its own meanings
const AR = Object.values(C.lang.ar.lex).find(x => x.pos === 'NOUN' && (x.features?.plurals || []).length >= 2 && x.features.plurals.every(p => (p.senses || []).length)
  && new Set(x.features.plurals.flatMap(p => p.senses)).size === x.features.plurals.flatMap(p => p.senses).length);
const arPl = AR && row(P('ar', AR.id), 'plurals');
ok(AR && arPl.prominent && arPl.values.length === AR.features.plurals.length && arPl.values.every((v, i) => v.forms[0].text === AR.features.plurals[i].form && v.senses.length === AR.features.plurals[i].senses.length && v.senses.every(s => s.def && s.n >= 1)),
  `Arabic ${AR?.lemma}: both plurals (${texts(arPl).filter(t => /[؀-ۿ]/.test(t)).join(' / ')}), each with the meanings it belongs to`);
ok(AR && P('ar', AR.id)[0].id === 'gender' && row(P('ar', AR.id), 'dual') && !row(P('ar', AR.id), 'dual').prominent, 'Arabic noun: gender first, the dual kept but under “More” (D28: a rule)');
// German nouns: der / die / das + the word, the plural
const haus = P('de', 'de:Haus');
ok(texts(row(haus, 'gender'))[0] === 'das Haus' && texts(row(haus, 'plurals')).includes('die Häuser') && haus[0].id === 'gender', 'German noun: “das Haus” first, plural “die Häuser”');
ok(texts(row(haus, 'genitive'))[0] === 'des Hauses', 'German noun: genitive “des Hauses”');
// German strong verbs: present with the vowel change, Präteritum, Partizip II with hat / ist
const fa = P('de', 'de:fahren'), pr = row(fa, 'present'), pa = row(fa, 'participle');
ok(pr?.prominent && texts(pr).join() === 'du fährst,er fährt' && pr.values[0].tags.length === 1, 'fahren: present du fährst · er fährt, the vowel change named (a → ä), visible');
ok(texts(row(fa, 'preterite')).join() === 'fuhr', 'fahren: Präteritum fuhr');
ok(texts(pa).includes('ist gefahren') && texts(pa).includes('hat gefahren') && pa.values.every(v => v.senses.length), 'fahren: Partizip II with ist and with hat, each with its meanings');
ok(fa.indexOf(pr) < fa.indexOf(row(fa, 'preterite')) && fa.indexOf(row(fa, 'preterite')) < fa.indexOf(pa) && !row(fa, 'aux') && !row(fa, 'principalParts'), 'German verb: present → Präteritum → Partizip II, the auxiliary inside the participle (no separate rows)');
const es = P('de', 'de:essen');
ok(texts(row(es, 'present')).join() === 'du isst,er isst' && texts(row(es, 'preterite')).join() === 'aß' && texts(row(es, 'participle')).join() === 'hat gegessen', 'essen: du isst · er isst, aß, hat gegessen');
const he = P('de', 'de:heißen');
ok(!row(he, 'present').prominent && row(he, 'participle').prominent, 'heißen: no vowel change → the present is folded, the participle stays visible');
const sep = Object.values(C.lang.de.lex).find(x => x.pos === 'VERB' && typeof x.features?.separable === 'string');
ok(sep && texts(row(P('de', sep.id), 'separable')).includes(sep.features.separable) && texts(row(P('de', sep.id), 'preterite'))[0].endsWith(' ' + sep.features.separable), `separable ${sep?.lemma}: the particle, and the Präteritum with the particle after it`);
// Hebrew and Chinese
const gv = P('he', 'he:gever');
ok(['root', 'plurals'].every(id => row(gv, id)?.prominent) && !row(gv, 'construct').prominent && texts(row(gv, 'construct')).length === 2, 'Hebrew noun: root and plural visible, the construct forms kept under “More” (D28)');
const zhN = Object.values(C.lang.zh.lex).find(x => x.pos === 'NOUN' && Array.isArray(x.features?.measure) && x.features.measure.length), zm = row(P('zh', zhN.id), 'measure');
ok(zm.prominent && zm.values[0].forms[0].sub && /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(zm.values[0].forms[0].sub), `Chinese ${zhN.lemma}: measure word with its pinyin (${zm.values[0].forms[0].text} ${zm.values[0].forms[0].sub})`);
// every word of the course: no throw, every declared parameter of its part of speech on its card
let bad = [];
for (const c of C.languages) for (const [id, x] of Object.entries(C.lang[c].lex)) {
  try { const ps = P(c, id); if (ps.some(r => !r.title || (r.none == null && !r.values.length))) bad.push(id); } catch (e) { bad.push(id + ': ' + e.message); }
}
ok(!bad.length, `every word of the pilot course gets its parameters (${bad.slice(0, 3).join(', ')})`);

// ---------------- the card in a browser ----------------
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed — the browser part is skipped)'); return done(); }
  if (!fs.existsSync(path.join(PILOT, 'course.pack.js')) || !fs.existsSync(path.join(ROOT, 'engine', 'langui.js'))) { console.log('  (not built — run python3 tools/build.py; the browser part is skipped)'); return done(); }
  console.log('— the card');
  const SUBJ = 'lang:polyglot-semitic-zh-de', url = await appUrl(ROOT);
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(), E = []; page.on('pageerror', e => E.push(e.message));
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  const open = async (hash, pg = page) => {
    await pg.goto(url + '?account=anr&subject=' + SUBJ + hash);
    await pg.waitForFunction(() => window.NoemaLangUI?.UI?.C && document.querySelector('.lx-main .lx-view'), null, { timeout: 60000 });
    await pg.waitForFunction(() => { const U = NoemaLangUI.UI; return U.profiles || Object.values(U.C.lang.de.lex).some(x => x.profile); }, null, { timeout: 20000 }).catch(() => { });
    if (!pg.__taught) await pg.evaluate(() => { const U = NoemaLangUI.UI; U.L.langs = U.L.langs || {}; for (const c of ['ar', 'de', 'he', 'zh']) { const S = U.L.langs[c] = U.L.langs[c] || {}; S.checks = S.checks || {}; for (const n of U.C.order) if (U.C.nodes[n].kind === 'lesson') S.checks[n] = Object.assign({}, S.checks[n], { best: 100 }); } });   // D26: this test looks at the full card, so every lesson counts as taught
    await pg.evaluate(() => NoemaLangUI.render ? NoemaLangUI.render() : window.dispatchEvent(new HashChangeEvent('hashchange'))); await wait(400);
  };
  const W = (c, id) => `#/w/${c}/${encodeURIComponent(id)}`;
  // Arabic
  await open(W('ar', AR.id));
  const order = await page.evaluate(() => { const card = document.querySelector('.lx-card'), ps = card?.querySelector('.lx-params'), sec = card?.querySelector('.lx-sec'), top = card?.querySelector('.lx-cardtop');
    return !!ps && !!top && !!(top.compareDocumentPosition(ps) & 4) && (!sec || !!(ps.compareDocumentPosition(sec) & 4)); });
  ok(order, 'the parameters block sits right under the word, before the senses');
  const arRow = page.locator('.lx-card .lx-params > .lx-prow[data-param="plurals"]');
  const arForms = await arRow.locator('.lx-pform:not(.lx-ppattern) .lx-w').evaluateAll(es => es.map(e => [e.textContent.normalize('NFC'), e.getAttribute('lang'), e.getAttribute('dir')]));
  ok(arForms.length === AR.features.plurals.length && arForms.every(([t, l, d], i) => t === AR.features.plurals[i].form.normalize('NFC') && l === 'ar' && d === 'rtl'), `Arabic: both plurals shown, vocalized, lang=ar dir=rtl (${arForms.map(f => f[0]).join(' · ')})`);
  const arSenses = await arRow.locator('.lx-pval').evaluateAll(vs => vs.map(v => v.querySelectorAll('.lx-psense').length));
  ok(arSenses.every(n => n >= 1) && arSenses.length === AR.features.plurals.length, 'Arabic: each plural with the meanings it belongs to (' + arSenses.join(' / ') + ')');
  ok(await page.locator('.lx-card .lx-pmore').count() === 1 && !(await page.locator('.lx-card .lx-pmore').getAttribute('open')) && await page.locator('.lx-card .lx-pmore .lx-pnone').count() >= 1, 'the uninformative “none”s are folded');
  ok(!(await page.locator('.lx-card .lx-sec summary').allInnerTexts()).some(t => /^Facade|facade/.test(t)), 'no duplicate facade section under the senses');
  // German noun
  await open(W('de', 'de:Haus'));
  const deN = await page.locator('.lx-card .lx-params').first().innerText();
  ok(/das Haus/.test(deN) && /die Häuser/.test(deN) && /des Hauses/.test(deN), 'German noun: das Haus · die Häuser · des Hauses under the word');
  // German strong verb
  await open(W('de', 'de:fahren'));
  const deV = await page.locator('.lx-card .lx-params').first().innerText();
  ok(/du fährst/.test(deV) && /er fährt/.test(deV) && /fuhr/.test(deV) && /ist gefahren/.test(deV) && /hat gefahren/.test(deV) && /Präteritum/.test(deV) && /Partizip II/.test(deV), 'German verb: du fährst · er fährt, Präteritum fuhr, Partizip II ist / hat gefahren');
  await page.screenshot({ path: path.join(ROOT, 'lx_wordcard_de.png') }).catch(() => { });
  // phone width, dark
  const phone = await ctx.newPage(); await phone.setViewportSize({ width: 360, height: 760 }); phone.on('pageerror', e => E.push(e.message));
  await open(W('ar', AR.id), phone);
  await phone.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await wait(150);
  const m = await phone.evaluate(() => { const ps = document.querySelector('.lx-card .lx-params'), r = ps.getBoundingClientRect(), pv = ps.querySelector('.lx-pv');
    return { over: document.scrollingElement.scrollWidth - window.innerWidth, right: r.right, bg: getComputedStyle(pv).backgroundColor, ink: getComputedStyle(pv).color }; });
  const lum = s => { const [r, g, b] = (s.match(/\d+/g) || [255, 255, 255]).map(Number); return (r + g + b) / 3; };
  ok(m.over <= 1 && m.right <= 361, `phone width: no horizontal scroll (${m.over}px), the block fits`);
  ok(lum(m.bg) < 128 && lum(m.ink) > 128, `dark theme: dark background, light text (${m.bg} / ${m.ink})`);
  // "In other languages" open, in the app's frame: never a word or a language's name broken in the middle, 🔊 on the line of
  // its word, nothing sideways (docs/UI_MAP.md "Small screens") — at 320 px (left to right and, in Arabic, right to left) and desktop
  for (const [width, lang] of [[320, 'en'], [320, 'ar-XB'], [1280, 'en'], [1280, 'ar-XB']]) {
    const c2 = await browser.newContext({ viewport: { width, height: 800 } });
    await c2.addInitScript(() => { let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (c) c.pseudoLocales = true; } }); });   // ar-XB, as tests/i18n_rtl.js
    await c2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const pg = await c2.newPage(); pg.on('pageerror', e => E.push(e.message));
    // the learner's settings before the app starts (the interface language is read once, at start)
    await pg.goto(url); await pg.evaluate(l => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:current', JSON.stringify({ acc: 'anr' }));
      localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ lang: l, world: 'both', character: 'robot', onboarded: Date.now(), studyLangs: ['ar', 'he', 'zh', 'de'] })); }, lang);
    await pg.goto(url + '?account=anr#/lang/he/c/person.teacher');
    const shown = await pg.waitForSelector('details.lx-others', { timeout: 30000 }).then(() => true, () => false); await wait(800);
    if (shown) { await pg.evaluate(() => { const d = document.querySelector('details.lx-others'); if (!d.open) d.querySelector('summary').click(); }); await wait(600); }
    const r = shown ? await pg.evaluate(() => {
      const t = document.querySelector('details.lx-others[open] .lx-wordtable'); if (!t) return null;
      const lines = rs => new Set([...rs].filter(x => x.width > 0).map(x => Math.round(x.top + x.height / 2))).size;
      const broken = [], apart = [];
      const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.parentElement.closest('rt, .lx-spk')) continue;
        for (const m of n.textContent.matchAll(/\S+/g)) {
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const rects = [...rg.getClientRects()].filter(x => x.width > 0);
          if (rects.length > 1 && lines(rects) > 1 && rects.some(x => Math.abs(x.top - rects[0].top) > x.height / 2)) broken.push(m[0]);
        }
      }
      for (const b of t.querySelectorAll('.lx-spkglue > .lx-spk')) {   // a word or a short phrase (a sentence wraps, 98_speech.js)
        const w = b.previousElementSibling; if (!w) continue;
        const ww = getComputedStyle(w).display === 'contents' ? w.firstElementChild || w : w;   // noema-lang-word draws no box (display: contents): its .lx-w
        const wr = [...ww.getClientRects()].pop(), br = b.getBoundingClientRect();
        if (!wr || br.top > wr.bottom || br.bottom < wr.top) apart.push(b.dataset.text);
      }
      return { broken, apart, words: t.querySelectorAll('.lx-tok').length, over: document.scrollingElement.scrollWidth - innerWidth, inside: t.scrollWidth - t.clientWidth, dir: document.documentElement.dir || 'ltr', cards: getComputedStyle(t.querySelector('tr')).display !== 'table-row' };
    }) : null;
    const tag = `${width} px${lang === 'ar-XB' ? ', right to left (ar-XB)' : ''}`;
    ok(!!r && r.words >= 5 && (lang === 'en' || r.dir === 'rtl'), `“In other languages” open at ${tag}: the table with its words (${r?.words})${r ? (r.cards ? ', a card per language' : ', a table') : ''}${r?.dir ? ', dir ' + r.dir : ''}`);
    if (r) {
      ok(!r.broken.length, `${tag}: no word and no language name broken in the middle${r.broken.length ? ' — ' + r.broken.slice(0, 6).join(' · ') : ''}`);
      ok(!r.apart.length, `${tag}: every 🔊 on the line of its word${r.apart.length ? ' — not: ' + r.apart.slice(0, 6).join(' · ') : ''}`);
      ok(r.over <= 1 && r.inside <= 1, `${tag}: nothing sideways (page ${r.over}px, table ${r.inside}px)`);
    }
    if (width === 320) await pg.locator('details.lx-others').screenshot({ path: path.join(ROOT, `lx_wordcard_others_${lang}.png`) }).catch(() => { });
    await c2.close();
  }
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close();
  done();
})().catch(e => { console.error(e); fails++; done(); });
function done() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
