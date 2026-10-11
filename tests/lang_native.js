/* D19 / R1 / R2 — a language course taught through the learner's native language (docs/language-packs.md §2.2, §3), in a real
   browser over the pilot course: the course asks once for the native language; a Greek native sees the Greek notes first (no
   English ones among their languages) and, with a locale facade switched on, the explanations in Greek; with English at C1 and
   learning Arabic + German, an Arabic page shows “From your languages” (Greek, then English), “Among the languages you are
   learning” (German) and the folded “From other languages”; notes in the Markdown subset are drawn as lists; a Turkish native
   sees the Turkish notes; a native language without notes sees those of its type; through a facade the texts change and the
   exercises do not. The facade is tests/fixtures/lang-facade/el, built into course.expl.el.js by tools/build.py
   in a copy of the prepared repo (with two test notes added to that copy).
   Usage: node tests/lang_native.js <prepared-repo-dir>   (built with tools/build.py) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const SRC = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE, FN = 'fn.definite';
const AGG = 'TEST · If your language adds one ending per meaning, expect German to pack gender, number and case into one small word.';
const MD_DE = 'TEST-MD · Two points:\n- **Gender** decides the article\n- the article *declines* with the case\n→ der Tisch — the table';

/** A copy of the prepared repo with the fixture facade (el) and two test notes, built. */
function prepared() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-native-'));
  fs.cpSync(SRC, dst, { recursive: true, filter: p => !/[\\/](\.git|dist|data|node_modules)([\\/]|$)/.test('/' + path.relative(SRC, p)) });
  const cdir = path.join(dst, 'library', 'languages', COURSE);
  fs.cpSync(path.join(__dirname, 'fixtures', 'lang-facade', 'el'), path.join(cdir, 'facades', 'el'), { recursive: true });
  const gf = path.join(cdir, 'lang', 'de', 'grammar', FN + '.json'), g = JSON.parse(fs.readFileSync(gf, 'utf8'));
  g.notes.push({ for: 'type:agglutinating', rel: 'new', text: AGG }); fs.writeFileSync(gf, JSON.stringify(g, null, 1));
  const af = path.join(cdir, 'lang', 'ar', 'grammar', FN + '.json'), ga = JSON.parse(fs.readFileSync(af, 'utf8'));   // R2: a note in the Markdown subset
  ga.notes.find(n => n.for === 'de').text = MD_DE; fs.writeFileSync(af, JSON.stringify(ga, null, 1));
  // a word with profile.notes (the new place of the comparisons of a word, §2.1)
  let word = null;
  for (const f of fs.readdirSync(path.join(cdir, 'lang', 'de', 'lexicon'))) {
    const lf = path.join(cdir, 'lang', 'de', 'lexicon', f), L = JSON.parse(fs.readFileSync(lf, 'utf8')), x = (L.lexemes || []).find(x => x.profile && (x.senses || []).length);
    if (!x) continue;
    x.profile.notes = [{ for: 'el', rel: 'similar', text: 'TEST-EL word note' }, { for: 'en', rel: 'trap', text: 'TEST-EN word note' }, { for: 'tr', rel: 'new', text: 'TEST-TR word note' }, { for: 'type:agglutinating', rel: 'new', text: 'TEST-AGG word note' }];
    fs.writeFileSync(lf, JSON.stringify(L, null, 1)); word = x.id; break;
  }
  execFileSync('python3', [path.join(dst, 'tools', 'build.py'), '--no-validate'], { cwd: dst, stdio: 'pipe' });
  return { dst, word };
}

/** A copy of the prepared repo with the REAL el facade (facades/el, as the translators left it) set to status “preview”, built, and the
 *  host taken as a deploy preview (config.i18nPreview). While Tier 1 is not complete the facade must not be offered (checked
 *  first); to see what the finished facade will look like, the copy then marks Tier 1 complete. */
function preparedReal() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-native-el-'));
  fs.cpSync(SRC, dst, { recursive: true, filter: p => !/[\\/](\.git|dist|data|node_modules)([\\/]|$)/.test('/' + path.relative(SRC, p)) });
  const fdir = path.join(dst, 'library', 'languages', COURSE, 'facades', 'el'), hf = path.join(fdir, 'facade.json');
  if (!fs.existsSync(hf)) return { dst, none: true };
  const head = JSON.parse(fs.readFileSync(hf, 'utf8')), N = require(path.join(SRC, 'engine', 'langcore.js'));
  const preview = { ...head, status: 'preview' }, gate = { tier1: N.facadeUsable({ ...preview, status: 'on' }), preview: N.facadeUsable(preview, { preview: true }), off: N.facadeUsable(preview), draftsOnly: N.facadeUsable({ ...head, status: 'draft' }, { preview: true }) };
  const t1 = (head.coverage || {})['1'] || {};
  if (!gate.tier1) preview.coverage = { ...head.coverage, 1: { ...t1, done: (t1.total || 0) - (t1.stale || 0), missing: 0 } };
  fs.writeFileSync(hf, JSON.stringify(preview, null, 1));
  fs.appendFileSync(path.join(dst, 'config.js'), '\nwindow.NOEMA_CONFIG.i18nPreview = true;   // lang_native.js: a deploy-preview host\n');
  const T = {}; for (const f of fs.readdirSync(fdir)) if (f.endsWith('.json') && f !== 'facade.json') Object.assign(T, JSON.parse(fs.readFileSync(path.join(fdir, f), 'utf8')));
  execFileSync('python3', [path.join(dst, 'tools', 'build.py'), '--no-validate'], { cwd: dst, stdio: 'pipe' });
  return { dst, gate, t1, T };
}

(async () => {
  const { dst: ROOT, word } = prepared();
  const reg = fs.readFileSync(path.join(ROOT, 'library', 'registry.js'), 'utf8');
  ok(fs.existsSync(path.join(ROOT, 'library', 'languages', COURSE, 'course.expl.el.js')) && /"expl":\s*\{\s*"el":\s*\{\s*"path":\s*"library\/languages\/polyglot-semitic-zh-de\/course\.expl\.el\.js"/.test(reg),
    'build: facades/el/*.json → course.expl.el.js, listed in the registry with its status');
  { const pack = fs.readFileSync(path.join(ROOT, 'library', 'languages', COURSE, 'course.pack.js'), 'utf8');
    const data = JSON.parse(pack.slice(pack.indexOf('"] = ') + 5).replace(/;\s*$/, '')), de = data.langs.de.bank, s1 = de.find(s => s.id === 'de.c01_04.001'), s2 = de.find(s => s.id === 'de.c01_04.118');
    ok(de.every(s => s.mk && /^[0-9a-z]+$/.test(s.mk.k) || !s.gloss) && s1.time.h === 6 && s2.date.m === 5 && !('time' in s2), 'build: every bank sentence carries its master keys (s.mk; s.time / s.date where it names one)'); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html';
  const open = async (hash = '') => { await page.goto('about:blank'); await page.goto(url + '?account=anr&subject=' + SUBJ + hash);   // a fresh start each time (a hash alone would not reload)
    await page.waitForSelector('.lx-main .lx-view', { timeout: 20000 }).catch(() => { }); await wait(900); };
  const setNative = n => page.evaluate(n => { const k = 'noema1:anr:a:settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); if (n) s.native = n; else delete s.native; localStorage.setItem(k, JSON.stringify(s)); }, n);
  const uniq = a => [...new Set(a)];
  const notesFor = (sec = 'yours', root = '.lx-gram') => page.locator(`${root} [data-cmp="${sec}"] [data-for]`).evaluateAll(els => els.map(e => e.dataset.for)).then(uniq);
  const setCourse = s => page.evaluate(s => { const U = NoemaLangUI.UI; Object.assign(U.L.settings, s); NoemaLangUI.save(true); }, s);
  const ex = () => page.evaluate(() => document.documentElement.lang + '|' + NoemaLangUI.UI.C.explainLang);
  await page.goto(url); await page.evaluate(() => localStorage.clear());

  console.log('— no native language yet');
  await open();
  ok(await page.locator('.lx-native-ask').count() === 1, 'the course asks once: “Your native language?”');
  await open('#/fn/' + FN + '/de');
  ok(!(await notesFor()).length && !(await page.locator('.lx-notesbox details').count()) && !/From other languages/.test(await page.locator('.lx-gram').innerText()), 'until it is known: no comparison notes at all, no fold of other languages');
  await open();
  await page.selectOption('.lx-native-ask .lx-nativesel', 'el'); await wait(1200);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:settings')).native?.code) === 'el' && !(await page.locator('.lx-native-ask').count()), 'the answer is an account setting (a:settings.native); the question is gone');

  console.log('— a Greek native, the Greek facade on');
  await open('#/fn/' + FN + '/de'); await wait(600);
  ok(await ex() === 'el|el', 'the explanations are in Greek (the facade of the native language is on): ' + await ex());
  { const t = await page.locator('.lx-gram').textContent(), mine = await notesFor();
    ok(/Τα γερμανικά δείχνουν το οριστικό/.test(t) && /Το οριστικό και το αόριστο άρθρο/.test(t) && /ο\/η\/το \(οριστικό\)/.test(t) && /der Tisch/.test(t), 'the facade’s texts at their addresses (summary, title, a table label); the German forms untouched');
    const yours = (await page.locator('.lx-gram [data-cmp="yours"]').allInnerTexts()).join('\n');
    ok(mine.join() === 'el' && /Τα ο \/ η \/ το/.test(yours) && !/the \/ a work the same way/.test(yours), 'from your languages: only the Greek note, itself translated — no English note (' + mine.join(', ') + ')');
    ok(await page.locator('.lx-gram details[data-cmp="others"]:not([open])').count() >= 1 && !(await page.locator('.lx-gram details[data-cmp="others"][open]').count()) && (await notesFor('others')).includes('en'), 'the other languages’ notes (English among them) are in the folded “From other languages”'); }
  await page.screenshot({ path: SHOTS + '/lx_native_el.png' });
  { const r = await page.evaluate(() => {
      const N = NoemaLang, U = NoemaLangUI.UI, C0 = N.course(U.data), CF = U.C, L = N.newLearner(C0);
      for (const id of Object.keys(C0.lang.de.lex)) N.review(C0, L, 'de', id, 'r', 'good', 0);
      const LF = N.fromKV(CF, N.toKV(C0, L)), kk = (C, LL) => N.known(C, LL, 'de');
      const sig = (C, LL) => [N.clockItems(C, LL, 'de', { k: kk(C, LL), rng: N.seeded(5), max: 40 }).map(x => x.sentence + x.answer).join(), N.dateItems(C, LL, 'de', { k: kk(C, LL), rng: N.seeded(5), max: 40 }).map(x => x.kind + (x.sentence || '')).join(),
        N.parallelGroups(C).length, N.exercises(C, LL, 'de', 'fn.definite', { k: kk(C, LL), rng: N.seeded(9), max: 12 }).map(x => x.kind + ':' + JSON.stringify(x.answer ?? x.answers)).join('|')];
      return { master: sig(C0, L), facade: sig(CF, LF), gloss: CF.lang.de.sentenceById['de.c01_04.001'].gloss };
    });
    ok(r.gloss === 'Σήμερα ξύπνησα στις έξι.' && r.master[0] && JSON.stringify(r.master) === JSON.stringify(r.facade), `through the facade the exercises are the same (clock, date, parallel sentences, ${r.master[3].split('|').length} grammar items with their answers)`); }
  if (word) { await open('#/w/de/' + encodeURIComponent(word)); await page.waitForSelector('.lx-card [data-cmp="yours"] [data-for]', { timeout: 10000 }).catch(() => { });
    const w = await notesFor('yours', '.lx-card'), o = await notesFor('others', '.lx-card');
    ok(w.join() === 'el' && o.join() === 'en,tr,type:agglutinating', 'a word card shows its profile.notes: the native language’s, the others folded (' + w.join(', ') + ' | ' + o.join(', ') + ')'); }
  console.log('— the Greek native speaks English at C1 and learns Arabic and German');
  await open(); await setCourse({ knows: [{ code: 'en', level: 'C1' }], languages: ['ar', 'de'] });
  await open('#/fn/' + FN + '/ar'); await wait(400);
  { const heads = await page.locator('.lx-gram [data-cmp="yours"] .lx-cg-name').allInnerTexts();
    ok((await notesFor()).join() === 'el,en' && heads[0] === 'Ελληνικά' && heads[1] === 'English' && await page.locator('.lx-gram [data-cmp="yours"] .lx-cg-lvl').first().innerText() === 'C1',
      'from your languages: Greek first, then English (C1), each under its own name (' + (await notesFor()).join(', ') + ' · ' + heads.join(', ') + ')');
    const lrn = await notesFor('learning'), oth = await notesFor('others');
    ok(lrn.join() === 'de' && await page.locator('.lx-gram [data-cmp="learning"] .lx-cg-also button').count() >= 1 && !lrn.includes('he') && !lrn.includes('zh'),
      'among the languages you are learning: German (its note and the link to its page), not the course languages not studied (' + lrn.join(', ') + ')');
    ok(await page.locator('.lx-gram details[data-cmp="others"]:not([open])').count() >= 1 && !(await page.locator('.lx-gram details[data-cmp="others"][open]').count()) && oth.includes('fr') && oth.includes('zh') && oth.includes('type:fusional') && !oth.includes('el') && !oth.includes('en') && !oth.includes('de'),
      'from other languages: folded, with every other note (fr, zh, the types …) and none shown above (' + oth.length + ')');
    const md = page.locator('.lx-gram [data-cmp="learning"] .lx-md', { hasText: 'TEST-MD' });
    ok(await md.locator('ul.lx-md-list > li').count() === 2 && await md.locator('strong').innerText() === 'Gender' && await md.locator('em').innerText() === 'declines' && /der Tisch/.test(await md.locator('.lx-md-ex').innerText()) && !(await md.innerText()).includes('**'),
      'R2: a note in the Markdown subset is drawn as a list, bold, italic and an example line (no stars left)'); }
  await page.screenshot({ path: SHOTS + '/lx_native_sections.png', fullPage: true });
  if (word) { await open('#/w/de/' + encodeURIComponent(word)); await page.waitForSelector('.lx-card [data-cmp="yours"] [data-for="en"]', { timeout: 10000 }).catch(() => { }); ok((await notesFor('yours', '.lx-card')).join() === 'el,en', 'the word card too: Greek, then English (C1)'); }
  await setCourse({ knows: [], languages: ['ar', 'he', 'zh', 'de'] });
  await open('#/settings');
  ok(await page.locator('.lx-nativesel').inputValue() === 'el' && await page.locator('.lx-speaker option').count() === 3, 'course settings: the native language, and “Explanations in” (automatic · English · Greek)');

  console.log('— a Turkish native (a supported native since 2026-10-11)');
  await setNative({ code: 'tr' }); await open('#/fn/' + FN + '/de');
  { const mine = await notesFor();
    ok(await ex() === 'en|en' && mine.join() === 'tr' && (await notesFor('others')).includes('type:agglutinating'), 'the Turkish note from their language; the type notes with the others: ' + mine.join(', ')); }
  if (word) { await open('#/w/de/' + encodeURIComponent(word)); ok((await notesFor('yours', '.lx-card')).join() === 'tr', 'the word card too: the Turkish note'); }
  console.log('— a native language without notes of its own (Estonian)');
  await setNative({ code: 'et' }); await open('#/fn/' + FN + '/de');
  { const mine = await notesFor(), t = (await page.locator('.lx-gram [data-cmp="yours"]').allInnerTexts()).join('\n');
    ok(mine.join() === 'type:agglutinating' && t.includes(AGG), 'the notes for the type of their language (agglutinating), at its place: ' + mine.join(', ')); }

  console.log('— an English native');
  await setNative({ code: 'en' }); await open('#/fn/' + FN + '/de');
  { const mine = await notesFor(); ok(await ex() === 'en|en' && mine.join() === 'en' && /the \/ a work the same way/.test((await page.locator('.lx-gram [data-cmp="yours"]').allInnerTexts()).join('\n')), 'only the English note: ' + mine.join(', ')); }
  await open('#/settings'); await page.selectOption('.lx-speaker', 'el'); await wait(900);
  await open('#/fn/' + FN + '/de');
  ok(await ex() === 'el|el' && /Τα γερμανικά/.test(await page.locator('.lx-gram').innerText()) && (await notesFor()).join() === 'en', 'the learner may choose the explanation language (settings.speaker): Greek texts, still the notes of their own language');
  await open('#/settings'); await page.selectOption('.lx-speaker', ''); await wait(500);

  console.log('— a native language without a profile, typed in');
  await setNative(null); await open('#/settings');
  await page.selectOption('.lx-settings .lx-nativesel, .lx-view .lx-nativesel', '*'); await wait(100);
  await page.fill('.lx-nativeother input', 'Kirundi'); await page.selectOption('.lx-nativeother select >> nth=0', 'agglutinating');
  await page.click('.lx-nativeother button'); await wait(500);
  ok(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('noema1:anr:a:settings')).native)) === '{"name":"Kirundi","type":"agglutinating"}', 'another language: its name and type are stored');
  await open('#/fn/' + FN + '/de'); ok((await notesFor()).join() === 'type:agglutinating', '… and the notes for its type are shown');

  console.log('— Me › Language and appearance');
  await page.goto(url); await page.evaluate(() => { localStorage.setItem('noema-test:newUI', '1'); const k = 'noema1:anr:a:settings'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), onboarded: Date.now(), world: 'both', character: 'owl' })); });
  await page.goto(url + '?account=anr#/me/look'); await page.waitForSelector('.ns-native', { timeout: 15000 }).catch(() => { }); await wait(400);
  ok(await page.locator('.ns-native').count() === 1 && /Kirundi/.test(await page.locator('.ns-native').innerText()), 'the account page shows the native language (one for every course)');
  await page.selectOption('.ns-native', 'fr'); await wait(300);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:settings')).native?.code) === 'fr', '… and changes it');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));

  console.log('— the real el facade, status “preview”, on a deploy-preview host');
  const RE = preparedReal();
  if (RE.none) ok(false, 'library/languages/' + COURSE + '/facades/el/facade.json exists');
  else {
    const { gate, t1, T } = RE, tx = a => (T[a] && typeof T[a].t === 'string') ? T[a].t : null;
    ok(gate.preview === gate.tier1 && !gate.off && !gate.draftsOnly, `the gate: “preview” is offered on a preview host only, and only with Tier 1 complete (Tier 1: ${t1.done || 0} done · ${t1.stale || 0} stale · ${t1.missing || 0} missing → ${gate.tier1 ? 'ready' : 'not offered yet'})`);
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const p2 = await ctx2.newPage(); const E2 = []; p2.on('pageerror', e => E2.push(e.message));
    const url2 = 'file://' + RE.dst + '/index.html';
    const open2 = async (hash = '') => { await p2.goto('about:blank'); await p2.goto(url2 + '?account=anr&subject=' + SUBJ + hash); await p2.waitForSelector('.lx-main .lx-view', { timeout: 20000 }).catch(() => { }); await wait(900); };
    await p2.goto(url2); await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ native: { code: 'el' } })); });
    const plain = t => String(t || '').split('\n')[0].replace(/[*→]/g, '').replace(/^\s*-\s+/, '').trim().slice(0, 28);
    await open2('#/fn/' + FN + '/de');
    await p2.waitForFunction(() => window.NoemaLangUI?.UI?.C?.explainLang === 'el' && document.querySelector('.lx-gram'), null, { timeout: 30000 }).catch(() => { }); await wait(500);   // the facade file is large: it loads after the course
    const ex2 = await p2.evaluate(() => document.documentElement.lang + '|' + NoemaLangUI.UI.C.explainLang), gram = await p2.locator('.lx-gram').textContent().catch(() => '');
    const sum = tx(`g:de:${FN}/summary`);
    ok(/\|el$/.test(ex2) && sum && gram.includes(plain(sum)), `a Greek native: the explanations in Greek (${ex2}; the summary “${plain(sum)}…”)`);
    // notes: a Greek note of a grammar page (the native's section), else any translated note of a page
    const G = JSON.parse(fs.readFileSync(path.join(RE.dst, 'library', 'languages', COURSE, 'lang', 'de', 'grammar', FN + '.json'), 'utf8'));
    let na = G.notes.map((n, i) => [n, `g:de:${FN}/notes/${i}/text`]).find(([n, a]) => n.for === 'el' && tx(a)), at = '#/fn/' + FN + '/de';
    if (!na) for (const a of Object.keys(T)) { const m = /^g:(\w+):([^/]+)\/notes\/(\d+)\/text$/.exec(a); if (m && tx(a)) { const g = JSON.parse(fs.readFileSync(path.join(RE.dst, 'library', 'languages', COURSE, 'lang', m[1], 'grammar', m[2] + '.json'), 'utf8')); na = [g.notes[+m[3]], a]; at = '#/fn/' + m[2] + '/' + m[1]; if (na[0]?.for === 'el') break; } }
    if (!na) console.log('  ⏭  Greek notes: the el facade has no translated note yet (the notes come in its delta pass) — nothing to show');
    else {
      await open2(at);
      const sec = na[0].for === 'el' ? 'yours' : 'others', txt = await p2.locator(`.lx-gram [data-cmp="${sec}"]`).allTextContents().then(a => a.join('\n'));
      ok(txt.includes(plain(tx(na[1]))) && !txt.includes(plain(na[0].text)), `Greek notes: ${na[1]} (for ${na[0].for}, in “${sec}”) is shown in Greek, not in the master's English`);
    }
    // the word card: the parameters right under the word, their labels in Greek
    const LJ = JSON.parse(fs.readFileSync(path.join(RE.dst, 'library', 'languages', COURSE, 'lang', 'de', 'language.json'), 'utf8'));
    const elT = (LJ.wordFeatures.NOUN || []).map((d, i) => tx(`lg:de/wordFeatures/NOUN/${i}/title`)).filter(Boolean), enT = (LJ.wordFeatures.NOUN || []).map(d => d.title);
    await open2('#/w/de/' + encodeURIComponent('de:Tisch'));
    const keys = await p2.locator('.lx-card .lx-params .lx-pk').allTextContents();
    ok(keys.length >= 3 && elT.length && keys.filter(k => elT.includes(k.trim())).length >= 3 && !keys.some(k => enT.includes(k.trim()) && !elT.includes(k.trim())), `the word card of der Tisch: its parameters with Greek labels (${keys.slice(0, 4).join(' · ')})`);
    // the exercises do not change through the real facade
    const r2 = await p2.evaluate(() => {
      const N = NoemaLang, U = NoemaLangUI.UI, C0 = N.course(U.data), CF = U.C, L = N.newLearner(C0);
      for (const id of Object.keys(C0.lang.de.lex)) N.review(C0, L, 'de', id, 'r', 'good', 0);
      const LF = N.fromKV(CF, N.toKV(C0, L)), kk = (C, LL) => N.known(C, LL, 'de');
      const sig = (C, LL) => [N.clockItems(C, LL, 'de', { k: kk(C, LL), rng: N.seeded(5), max: 40 }).map(x => x.sentence + x.answer).join(), N.dateItems(C, LL, 'de', { k: kk(C, LL), rng: N.seeded(5), max: 40 }).map(x => x.kind + (x.sentence || '')).join(),
        N.parallelGroups(C).length, N.exercises(C, LL, 'de', 'fn.definite', { k: kk(C, LL), rng: N.seeded(9), max: 12 }).map(x => x.kind + ':' + (x.kind === 'meaning' ? x.sentence + '#' + x.options.indexOf(x.answer) : JSON.stringify(x.answer ?? x.answers))).join('|')];   // a meaning is chosen in the explanation language: the same sentence, the same option
      return { master: sig(C0, L), facade: sig(CF, LF), el: CF.explainLang };
    });
    ok(r2.el === 'el' && r2.master[0] && JSON.stringify(r2.master) === JSON.stringify(r2.facade), `through the real el facade the exercises are the same (clock, date, parallel sentences, ${r2.master[3].split('|').length} grammar items; a “meaning” answer is the same sentence’s gloss, in Greek)`);
    await open2('#/fn/' + FN + '/de');
    ok(!E2.length, 'no page errors with the real el facade ' + JSON.stringify(E2.slice(0, 3)));
    await ctx2.close();
  }
  if (RE.dst) fs.rmSync(RE.dst, { recursive: true, force: true });
  await browser.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
