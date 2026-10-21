/* 文A language help (engine/wordlink.js, engine/bridge.js, docs/BRIDGE.md).
   Without a browser: words and folding, the longest entry wins, multi-word entries only across spaces, checkBridge (function
   words, markup, orphan anchors, the wrong pack or language; a section the pack lost only warns), tools/bridge.py check / build on the pilot and
   the same block ids as the app.
   In the browser (the Databricks pilot, English → el / ru / ar): the 文A badge, the first-time card (native language, then
   A2 / B1 / B2), "Before you read", the dotted words and the glosses per level, never inside code, diagrams or exercises,
   the word card (translation, other meanings, draft), the anchor's sense, "I know it", help off, the phone's bottom sheet in
   Arabic (right to left), and a bridge imported for another pack (a wrong one refused).
   Usage: node tests/bridge.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 1. without a browser ---------- */
function unit() {
  console.log('— words, matching and the checks, without a browser');
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['engine/catalog.js', 'engine/wordlink.js', 'engine/packcheck.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const W = ctx.NoemaWordlink, C = ctx.NoemaPackCheck.checkBridge;
  ok(W.tokenize("Spark's data-skew, don’t 42x").map(t => t.t).join('|') === "Spark's|data-skew|don’t|42x", "words keep ' and - inside them, digits count as letters");
  const idx = W.index([{ k: 'data', forms: [] }, { k: 'data skew', forms: ['data skews'] }, { k: 'κατάσταση', forms: ['καταστάσεις'] }, { k: 'Delta', case: true }]);
  const f = t => W.find(t, idx).map(m => m.entry.k + '=' + m.form).join(' | ');
  ok(f('Data skew hurts; data is fine') === 'data skew=Data skew | data=data', 'the longest entry that starts at a word wins, case does not matter');
  ok(f('data\nskew and data, skew') === 'data=data | data=data', 'the words of one entry are joined by spaces only — never across a line or a comma');
  ok(f('ΚΑΤΑΣΤΑΣΕΙΣ και καταστασεις') === 'κατάσταση=ΚΑΤΑΣΤΑΣΕΙΣ | κατάσταση=καταστασεις', 'Greek forms are found in capitals and without accents');
  ok(f('delta and Delta') === 'Delta=Delta', 'an entry marked case matches only as written');
  const pack = { subject: { id: 'p1', language: 'en' }, chapters: [{ id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'p', text: 'A snapshot.' }] }] }] };
  const good = { format: 'noema-bridge', v: 1, pack: 'p1', source: 'en', native: 'ru', status: 'draft',
    entries: [{ k: 'snapshot', pos: 'NOUN', forms: ['snapshots'], band: 3, senses: [{ id: '1', t: 'снимок' }] }], sections: { 'ch01-s01': { terms: ['snapshot'], preview: 'Снимок.' } }, anchors: [] };
  const r0 = C(good, pack);
  ok(!r0.errors.length && r0.counts.entries === 1, 'a correct bridge passes (' + (r0.errors.join('; ') || 'no errors') + ')');
  const bad = (patch, re, what) => { const b = JSON.parse(JSON.stringify(good)); patch(b); const r = C(b, pack); ok(r.errors.some(e => re.test(e)), what + ' → ' + (r.errors[0] || 'NO ERROR')); };
  bad(b => b.entries.push({ k: 'the', pos: 'DET', senses: [{ id: '1', t: 'x' }] }), /function|DET/i, 'a function word is refused');
  bad(b => { b.entries[0].senses[0].t = '<img src=x onerror=alert(1)>'; }, /markup|plain/i, 'markup in a translation is refused');
  { const x = JSON.parse(JSON.stringify(good)); x.sections['ch09-s01'] = { terms: [] }; const r = C(x, pack); ok(!r.errors.length && r.warnings.some(e => /ch09-s01/.test(e)), 'a section the pack no longer has is a warning, not an error (a pack update never breaks its bridges)'); }
  bad(b => { b.anchors.push({ at: 'ch01-s01/bxyz', quote: 'snapshot', k: 'nothing', sense: '1' }); }, /anchor|nothing/i, 'an anchor to a word with no entry is refused');
  bad(b => { b.pack = 'other'; }, /pack/i, 'a bridge of another pack is refused');
  bad(b => { b.native = 'en'; }, /native/i, 'a bridge into the pack\'s own language is refused');
  // the tool: the pilot is clean, and its block ids are the app's
  const subj = path.join(ROOT, 'library/subjects/databricks');
  const chk = execFileSync('python3', [path.join(ROOT, 'tools/bridge.py'), 'check', subj], { encoding: 'utf8' });
  ok(/0 error\(s\)/.test(chk), 'tools/bridge.py check: the Databricks pilot has no errors');
  const ids = execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import bridge; p = bridge.load(${JSON.stringify(subj)})[0]; s = p['chapters'][0]['sections'][4]; print(json.dumps([s['id'], bridge.block_ids(s['blocks'])]))`], { encoding: 'utf8' });
  const [sid, pyIds] = JSON.parse(ids);
  const P = JSON.parse(fs.readFileSync(path.join(subj, 'pack.json'), 'utf8'));
  const sec = P.chapters[0].sections.find(s => s.id === sid);
  ok(JSON.stringify(ctx.NoemaCatalog.blockIds(sec.blocks)) === JSON.stringify(pyIds), `the tool's block ids are the app's (${sid}, ${pyIds.length} blocks)`);
  const out = path.join(require('os').tmpdir(), 'bridge-ru.json');
  execFileSync('python3', [path.join(ROOT, 'tools/bridge.py'), 'build', subj, '--native', 'ru', '-o', out], { encoding: 'utf8' });
  const built = JSON.parse(fs.readFileSync(out, 'utf8')), rb = C(built, P);
  ok(built.format === 'noema-bridge' && !rb.errors.length && built.chapters.includes('ch01') && built.coverage > 0.5, `the built file passes the app's check (${built.entries.length} words, ${Math.round(built.coverage * 100)}%, chapters ${built.chapters.join(',')})`);
}

/* ---------- 2. in the browser ---------- */
const URL = 'file://' + path.join(ROOT, 'index.html');
async function open(b, { w = 1100, h = 900, settings = {}, sid = 'ch01-s05' } = {}) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  page._errors = []; page.on('pageerror', e => page._errors.push(e.message));
  await page.goto(URL); await wait(200);
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ lang: 'en', ...s })); localStorage.setItem('noema1:current', JSON.stringify({ acc: 'anr' })); }, settings);
  await page.goto('about:blank'); await page.goto(URL); await wait(900);
  await page.click('.noema-chip:has-text("Databricks")'); await wait(1300);
  if (sid) await section(page, sid);
  return page;
}
async function section(page, sid) {
  await page.evaluate(s => { location.hash = '#/s/' + s; }, sid); await wait(1100);
  const all = await page.$('button:has-text("Show all")'); if (all) { await all.click(); await wait(600); }
}
const count = (page, sel) => page.$$eval(sel, x => x.length);

(async () => {
  unit();
  const b = await chromium.launch();
  try {
    console.log('— the first time: the native language, then the level');
    let page = await open(b, { sid: null });
    const tag = await page.evaluate(() => { const t = document.querySelector('.nb-tag'); return t ? { text: t.textContent, tip: t.title, weak: t.classList.contains('nb-weak') } : null; });
    ok(tag && /文A/.test(tag.text) && /Ελληνικά/.test(tag.tip) && /Русский/.test(tag.tip) && /العربية/.test(tag.tip) && tag.weak, `the 文A badge names the languages by their own names, dashed while partial (“${tag?.text}”, “${tag?.tip}”)`);
    await section(page, 'ch01-s05');
    ok(await count(page, '.nb-ask .nb-natsel') === 1 && await count(page, '.nb-root .nw') === 0, 'a section first asks the native language, and links nothing yet');
    await page.selectOption('.nb-ask .nb-natsel', 'ru'); await wait(200);
    ok(/Русский/.test(await page.$eval('.nb-ask', e => e.textContent)) && await count(page, '.nb-askrow button') === 4, 'then the level: A2 · B1 · B2 · later');
    await page.click('.nb-askrow button:nth-child(2)'); await wait(700);
    const s1 = await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:settings')));
    ok(s1.native?.code === 'ru' && s1.bridge?.level === 'balanced' && s1.bridge?.cefr === 'b1' && s1.bridge?.asked, 'B1 is kept as the balanced level, the native language in a:settings.native (shared with the language courses)');
    const bal = await count(page, '.nb-root .nw-g'), words = await count(page, '.nb-root .nw');
    ok(words > 80 && bal > 5 && bal < words / 2, `the words are linked (${words}) and the field's terms glossed (${bal})`);
    ok(await page.$eval('.nb-prep', e => /Before you read/.test(e.textContent) && /[а-я]/i.test(e.querySelector('.nb-preview')?.textContent || '')) && await count(page, '.nb-prep .nb-term') >= 5, '“Before you read”: the key words and a preview in Russian');
    ok(await count(page, 'code .nw, pre .nw, .diagram .nw, .katex .nw, .excard .nw, .ex .nw, .opts .nw, button .nw') === 0, 'never inside code, diagrams, maths, buttons or exercises');
    await page.screenshot({ path: path.join(SHOTS, 'bridge_b1.png') });

    console.log('— the word card');
    const w = await page.$('.nb-root .nw[data-k="snapshot"]'); await w.scrollIntoViewIfNeeded(); await w.click(); await wait(300);
    const cardText = await page.$eval('.nb-card', e => e.innerText);
    ok(/снимок/.test(cardText) && /noun/.test(cardText) && /draft translation/.test(cardText) && /I know it/.test(cardText) && /Report a mistake/.test(cardText), 'the card: the translation in the meaning of the pack, part of speech, draft, I know it, report');
    await page.click('.nb-card .nb-rep'); await page.fill('.nb-card textarea', 'better: моментальный снимок'); await page.click('.nb-report button'); await wait(150);
    const reps = await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:bridgeReports') || '[]'));
    ok(reps.length === 1 && reps[0].k === 'snapshot' && reps[0].native === 'ru' && reps[0].sid === 'ch01-s05', 'a reported mistake is kept for the author (a:bridgeReports)');
    await page.keyboard.press('Escape'); await wait(100);
    ok(await count(page, '.nb-card') === 0, 'Escape closes the card');
    const before = await page.$$eval('.nb-root .nw[data-k="transaction"]', x => x.filter(e => e.classList.contains('nw-g')).length);
    await page.click('.nb-root .nw[data-k="transaction"]'); await wait(200); await page.click('.nb-card .nb-known'); await wait(700);
    const after = await page.$$eval('.nb-root .nw[data-k="transaction"]', x => ({ g: x.filter(e => e.classList.contains('nw-g')).length, known: x.every(e => e.classList.contains('nw-known')) }));
    ok(before === 1 && after.g === 0 && after.known, '“I know it”: the gloss goes, the word stays tappable');

    console.log('— levels, the anchor, help off');
    await page.click('.nb-btn'); await wait(200); await page.check('.nb-panel input[value="open"]'); await wait(700);
    const open_ = await count(page, '.nb-root .nw-g');
    await page.check('.nb-panel input[value="tap"]'); await wait(700);
    const tap = await count(page, '.nb-root .nw-g');
    ok(open_ > bal && tap === 0 && await count(page, '.nb-root .nw') > 80, `open glosses more than balanced (${open_} > ${bal}), tap none — every word still opens its card`);
    await page.keyboard.press('Escape');
    await section(page, 'ch01-s06');
    const order = await page.$$eval('.nb-root .nw[data-k="order"]', x => x.map(e => e.dataset.s));
    ok(order.includes('2'), `the anchor picks “order” = sequence where the text says so (senses here: ${order.join(',')})`);
    await page.click('.nb-root .nw[data-k="order"][data-s="2"]'); await wait(200);
    ok(/порядок|последовательн/i.test(await page.$eval('.nb-card .nb-t', e => e.textContent)) && /заказ/.test(await page.$eval('.nb-card .nb-other', e => e.textContent)), 'its card shows that sense, the other meaning folded under it');
    await page.keyboard.press('Escape');
    await page.click('.nb-btn'); await wait(200); await page.uncheck('.nb-panel .nb-on'); await wait(600);
    ok(await count(page, '.nb-root .nw') === 0 && await count(page, '.nb-prep') === 0, 'help off: plain text again');
    ok(!page._errors.length, 'no page errors' + (page._errors.length ? ': ' + page._errors.join(' · ') : ''));
    await page.context().close();

    console.log('— a phone in Arabic');
    page = await open(b, { w: 390, h: 800, settings: { native: { code: 'ar' }, bridge: { on: true, level: 'balanced', asked: 1 } } });
    const wd = await page.$('.nb-root .nw[data-k="snapshot"]'); await wd.scrollIntoViewIfNeeded(); await wd.click(); await wait(300);
    const sheet = await page.$eval('.nb-card', e => ({ sheet: e.classList.contains('nb-sheet'), dir: getComputedStyle(e.querySelector('.nb-t')).direction, t: e.querySelector('.nb-t').textContent, w: e.getBoundingClientRect().width }));
    ok(sheet.sheet && sheet.dir === 'rtl' && /[؀-ۿ]/.test(sheet.t) && sheet.w <= 390, `a bottom sheet, the Arabic right to left (“${sheet.t}”)`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), 'no sideways scrolling');
    await page.screenshot({ path: path.join(SHOTS, 'bridge_phone_ar.png') });
    ok(!page._errors.length, 'no page errors' + (page._errors.length ? ': ' + page._errors.join(' · ') : ''));
    await page.context().close();

    console.log('— a bridge for another pack, imported');
    page = await open(b, { sid: null, settings: { native: { code: 'el' }, bridge: { on: true, level: 'open', asked: 1 } } });
    const res = await page.evaluate(async () => {
      const mk = entries => ({ format: 'noema-bridge', v: 1, pack: 'demo-physics', source: 'en', native: 'el', status: 'draft', coverage: 0.4, chapters: [], of: 1, entries, sections: { 'ch01-s01': { terms: ['kinetic energy'], preview: 'Η κινητική ενέργεια.' } }, anchors: [] });
      let refused = '';
      try { await NoemaBridge.attach('anr', mk([{ k: 'the', pos: 'DET', senses: [{ id: '1', t: 'ο' }] }])); } catch (e) { refused = e.message; }
      const got = await NoemaBridge.attach('anr', mk([{ k: 'kinetic energy', pos: 'NOUN', band: 3, key: true, senses: [{ id: '1', t: 'κινητική ενέργεια' }] }, { k: 'energy', pos: 'NOUN', band: 2, senses: [{ id: '1', t: 'ενέργεια' }] }]));
      return { refused, got, av: NoemaBridge.available('anr', 'demo-physics') };
    });
    ok(/DET|function/i.test(res.refused), 'a bridge with a function word is refused (' + res.refused.slice(0, 80) + ')');
    ok(res.got?.native === 'el' && res.av.el?.own, 'a correct one is attached to the account and listed as its own');
    await page.goto('about:blank'); await page.goto(URL); await wait(900);
    await page.click('.noema-chip:has-text("Demo Physics")'); await wait(1200); await section(page, 'ch01-s01');
    const dp = await page.$$eval('.nb-root .nw', x => x.map(e => e.dataset.k + (e.querySelector('.nw-rt') ? '=' + e.querySelector('.nw-rt').textContent : '')));
    ok(dp.includes('kinetic energy=κινητική ενέργεια'), `its words are linked after a reload, the phrase before the word (${dp.slice(0, 4).join(', ')})`);
    ok(!page._errors.length, 'no page errors' + (page._errors.length ? ': ' + page._errors.join(' · ') : ''));
  } finally { await b.close(); }
  console.log(fails ? `\n❌ ${fails} check(s) failed` : '\n✅ language help: all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
