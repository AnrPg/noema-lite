/* D19 — a language course taught through the learner's native language (docs/language-packs.md §2.2, §3), in a real browser over
   the pilot course: the course asks once for the native language; a Greek native sees only the Greek notes (no English ones) and,
   with a locale facade switched on, the explanations in Greek; a Turkish native (not a supported native) sees the notes for the
   type of their language and never the note for Turkish; an English native sees the English notes; through a facade the texts
   change and the exercises do not. The facade is tests/fixtures/lang-facade/el, built into course.expl.el.js by tools/build.py
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

/** A copy of the prepared repo with the fixture facade (el) and two test notes, built. */
function prepared() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-native-'));
  fs.cpSync(SRC, dst, { recursive: true, filter: p => !/[\\/](\.git|dist|data|node_modules)([\\/]|$)/.test('/' + path.relative(SRC, p)) });
  const cdir = path.join(dst, 'library', 'languages', COURSE);
  fs.cpSync(path.join(__dirname, 'fixtures', 'lang-facade', 'el'), path.join(cdir, 'facades', 'el'), { recursive: true });
  const gf = path.join(cdir, 'lang', 'de', 'grammar', FN + '.json'), g = JSON.parse(fs.readFileSync(gf, 'utf8'));
  g.notes.push({ for: 'type:agglutinating', rel: 'new', text: AGG }); fs.writeFileSync(gf, JSON.stringify(g, null, 1));
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
  const notesFor = () => page.locator('.lx-notesbox [data-for]').evaluateAll(els => els.map(e => e.dataset.for));
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
    ok(mine.length === 1 && mine[0] === 'el' && /Τα ο \/ η \/ το/.test(await page.locator('.lx-notesbox').innerText()) && !/the \/ a work the same way/.test(t), 'only the Greek note, itself translated — no English note, no other language (' + mine.join(', ') + ')'); }
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
  if (word) { await open('#/w/de/' + encodeURIComponent(word));
    const w = await page.locator('.lx-wnotes [data-for]').evaluateAll(els => els.map(e => e.dataset.for));
    ok(w.join() === 'el', 'a word card shows its profile.notes for the native language only (' + w.join(', ') + ')'); }
  await open('#/settings');
  ok(await page.locator('.lx-nativesel').inputValue() === 'el' && await page.locator('.lx-speaker option').count() === 3, 'course settings: the native language, and “Explanations in” (automatic · English · Greek)');

  console.log('— a Turkish native (not a supported native)');
  await setNative({ code: 'tr' }); await open('#/fn/' + FN + '/de');
  { const mine = await notesFor(), t = await page.locator('.lx-notesbox').innerText();
    ok(await ex() === 'en|en' && mine.join() === 'type:agglutinating' && t.includes(AGG), 'the notes for the type of their language (agglutinating), in the master’s language: ' + mine.join(', '));
    ok(!mine.includes('tr') && !/Turkish/.test(t), 'never the note written for Turkish (source material only)'); }
  if (word) { await open('#/w/de/' + encodeURIComponent(word)); ok((await page.locator('.lx-wnotes [data-for]').evaluateAll(els => els.map(e => e.dataset.for))).join() === 'type:agglutinating', 'the word card too: the type’s note, not Turkish'); }

  console.log('— an English native');
  await setNative({ code: 'en' }); await open('#/fn/' + FN + '/de');
  { const mine = await notesFor(); ok(await ex() === 'en|en' && mine.join() === 'en' && /the \/ a work the same way/.test(await page.locator('.lx-notesbox').innerText()), 'only the English note: ' + mine.join(', ')); }
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
  await browser.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
