/* P5v — vocabulary depth (docs/LANGUAGES.md §6.2 “Deepening”, §7.5): the thirteen depth types of langcore over the mini course and
   the pilot course (every answer from the stored data, D19 caps, tracks, only met words as partners, the session plan, GEN),
   then the UI in a real browser (🏋️ practise this word, 🏋️ deepen, the daily session, keyboard, RTL, phone width).
   Usage: node tests/lang_vocab2.js [prepared-repo-dir]   (the browser part needs a built repo: python3 tools/build.py) */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const load = dir => {
  const read = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  return N.course(N.readCourse(read, list));
};
const seeded = (s = 7) => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
const plain = (c, s) => N.stripMarks(c, N.nfc(s)).toLowerCase().trim();
/** A learner who knows every word of some languages (R and P, not due before `due`). */
function knowsAll(C, langs, { due = 100, filter = () => true } = {}) {
  const L = N.newLearner(C);
  for (const c of langs) for (const id of Object.keys(C.lang[c].lex)) if (filter(c, id)) L.langs[c].items[id] = { seen: 0, r: { reps: 3, ivl: 5, ease: 2.5, streak: 3, due, last: 1 }, p: { reps: 3, ivl: 5, ease: 2.5, streak: 3, due, last: 1 } };
  return L;
}
/** Is every option list sound: the answer among the options, no option twice, at least two. */
function soundItem(it) {
  if (it.type === 'vpick') return it.options.length >= 2 && it.options.includes(it.answer) && new Set(it.options).size === it.options.length;
  if (it.type === 'vsteps') return it.steps.every(s => s.options.includes(s.answer) && new Set(s.options).size === s.options.length);
  if (it.type === 'vsort') return it.buckets.length >= 2 && it.cards.length >= 3 && it.cards.every(c => it.buckets.some(b => b.id === c.bucket));
  if (it.type === 'vorder') return it.cards.length >= 3;
  return false;
}
/** The tokens of a sentence prompt: unknown words besides the target at most ⌈30 %⌉ (D19), the 🆕 list = the new tokens. */
function d19(it, strict = false) {
  const toks = it.prompt?.sentence || it.cards?.find(c => c.tokens)?.tokens; if (!toks) return true;
  const words = toks.filter(k => !k.p).length, bad = toks.filter(k => k.new || k.out).length;
  if (strict && bad) return false;
  if (['example_cloze', 'sense_pick', 'sense_split'].includes(it.kind) && bad > Math.ceil(0.3 * words)) return false;
  const news = toks.filter(k => k.new).map(k => k.l);
  return news.every(l => (it.unknown || []).includes(l));
}

// ---------------- the mini course ----------------
console.log('— the mini course');
{
  const C = load(path.join(__dirname, 'fixtures', 'lang-mini'));
  ok(N.DEEP_TYPES.length === 13 && N.DEEP_TYPES.every(t => typeof N.GEN[t] === 'function'), 'thirteen depth types, each also a grammar generator (GEN.<type>)');
  ok(N.DEEP_TYPES.filter(t => N.deepTrack(t) === 'p').sort().join() === 'collocation,confusables,example_cloze,nuance_pick,register_pick,sense_split', 'production types review the P track, the others the R track');
  const L = knowsAll(C, C.languages), got = {};
  for (const c of C.languages) for (const it of N.deepItems(C, L, c, Object.keys(C.lang[c].lex), { rng: seeded(), max: 999, perWord: 99 })) (got[it.kind] = got[it.kind] || []).push(it);
  const want = ['root_family', 'collocation', 'register_pick', 'nuance_pick', 'connotation', 'idiom_meaning', 'example_cloze', 'sense_pick', 'etymology_link'];
  ok(want.every(t => got[t]?.length), 'the mini course makes ' + want.map(t => `${t} ${got[t]?.length || 0}`).join(' · '));
  const all = Object.values(got).flat();
  ok(all.every(soundItem), `every item is sound: the answer among the options, none twice (${all.length} items)`);
  const a = N.deepItems(C, L, 'de', ['de:Gurke', 'de:essen'], { rng: seeded(3), max: 8, perWord: 4, maxUnknown: 99 }), b = N.deepItems(C, L, 'de', ['de:Gurke', 'de:essen'], { rng: seeded(3), max: 8, perWord: 4, maxUnknown: 99 });
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length === 8 && new Set(a.map(i => i.kind)).size >= 5, `deterministic for one seed, the types mixed (${[...new Set(a.map(i => i.kind))].join(', ')})`);
  const gurke = C.lang.de.lex['de:Gurke'];   // the mini course has few words: its examples are read with any number of unknown words here
  const sp = N.deepItems(C, L, 'de', ['de:Gurke'], { types: ['sense_pick'], max: 99, maxUnknown: 99 });
  ok(sp.length && sp.every(it => gurke.profile.senses.some(s => !s.of && s.def === it.answer) && it.options.every(o => gurke.profile.senses.some(s => s.def === o))), `sense_pick: the meanings are the word's own senses (${sp.length})`);
  const cl = N.deepItems(C, L, 'de', ['de:Gurke'], { types: ['example_cloze'], max: 99, maxUnknown: 99 });
  ok(cl.length && cl.every(it => Object.values(gurke.forms).includes(it.answer) && gurke.profile.examples.some(e => e.text.includes(it.answer))), `example_cloze: the gap is a stored form of the word in its example (${cl.length})`);
  // a new learner: no other word on screen they have not met
  const L0 = N.newLearner(C), fresh = N.deepItems(C, L0, 'de', ['de:Gurke'], { max: 99 });
  ok(fresh.every(it => !['confusables', 'sense_split'].includes(it.kind)), 'a new learner gets no partner words they have not met');
  // strictKnown: no unknown word at all in the sentences
  const strict = N.deepItems(C, L0, 'de', Object.keys(C.lang.de.lex), { strictKnown: true, max: 999, perWord: 99 });
  ok(strict.filter(it => it.prompt?.sentence && ['example_cloze', 'sense_pick'].includes(it.kind)).every(it => d19(it, true)), 'strictKnown: sentences with known words only');
  // records: the right track, a sorting item every word
  const L2 = knowsAll(C, ['de']), cz = cl[0];
  N.deepRecord(C, L2, 'de', cz, false, 10);
  ok(L2.langs.de.items['de:Gurke'].p.last === 10 && L2.langs.de.items['de:Gurke'].p.lapses === 1 && L2.langs.de.items['de:Gurke'].r.last === 1, 'a wrong cloze is a lapse of the P track (R untouched)');
  N.deepRecord(C, L2, 'de', { kind: 'root_family', type: 'vsort', track: 'r', lex: 'de:Gurke' }, true, 11, { 'de:Gurke': true, 'de:Karotte': false });
  ok(L2.langs.de.items['de:Gurke'].r.last === 11 && L2.langs.de.items['de:Karotte'].r.lapses === 1, 'a sorting item reviews every word on it (right and wrong)');
  // GEN: a realization may list a depth type as a generator
  const g = C.lang.de.grammar['fn.plural.noun'], keep = g.generators;
  g.generators = [{ type: 'connotation', pos: 'NOUN' }];
  const ex = N.exercises(C, L, 'de', 'fn.plural.noun', { rng: seeded(), max: 5 });
  g.generators = keep;
  ok(ex.length && ex.every(it => it.kind === 'connotation' && it.fn === 'fn.plural.noun' && it.deep && C.lang.de.lex[it.lex].pos === 'NOUN'), `GEN.connotation as a grammar generator: ${ex.length} items, filtered by part of speech`);
  // masking and compounds
  ok(N.maskWords('From Gurke; gurken (pl.). Not Gurkensalat.', ['Gurke', 'Gurken']) === 'From …; … (pl.). Not Gurkensalat.', 'maskWords: whole Latin words in any case');
  ok(N.maskWords('the root of جَزَر and جزر', ['جَزَر']) === 'the root of … and …', 'maskWords: Arabic with or without vowel marks');
}

// ---------------- the pilot course ----------------
const PILOT = path.join(ROOT, 'library', 'languages', 'polyglot-semitic-zh-de');
if (fs.existsSync(path.join(PILOT, 'course.json'))) {
  console.log('— the pilot course');
  const C = load(PILOT), L = knowsAll(C, C.languages), per = {};
  const ART = { MASC: 'der', FEM: 'die', NEUT: 'das' };
  const problems = [];
  for (const c of C.languages) {
    const X = C.lang[c], ids = Object.keys(X.lex).filter((id, i) => i % 3 === 0 || X.lex[id].compound || typeof X.lex[id].profile?.intensity === 'number');   // a third of the words, every compound and every scaled word
    const k = N.known(C, L, c);
    for (const it of N.deepItems(C, L, c, ids, { k, rng: seeded(11), max: 1e6, perWord: 1e6 })) {
      const key = it.kind; (per[key] = per[key] || {})[c] = (per[key][c] || 0) + 1;
      const lx = X.lex[it.lex], p = lx.profile || {};
      const bad = m => problems.push(`${c} ${it.kind} ${it.lex}: ${m}`);
      if (!soundItem(it)) bad('unsound options');
      if (!d19(it)) bad('D19: too many unknown words or a 🆕 word not listed');
      if (it.track !== N.deepTrack(it.kind)) bad('track');
      if (it.kind === 'root_family' && it.type === 'vpick' && it.answer !== lx.root.trim()) bad('root ≠ stored root');
      if (it.kind === 'root_family' && it.type === 'vsort' && it.cards.some(cd => N.stripMarks(c, X.lex[cd.lex].root).replace(/\s+/g, ' ').trim() !== cd.bucket)) bad('a card in the wrong root family');
      if (it.kind === 'compound_split' && (it.steps[0].answer.replace(/·/g, '') !== lx.lemma || (it.steps[1] && it.steps[1].answer !== ART[lx.gender]))) bad('compound split / article');
      if (it.kind === 'sense_split' && it.type === 'vpick' && (it.answer !== lx.lemma || !it.options.every(o => Object.values(X.lex).some(y => y.lemma === o && (y.senses || []).some(s => (lx.senses || []).includes(s)))))) bad('sense_split options are not words of one concept');
      if (it.kind === 'collocation' && !(p.collocations || []).some(col => col.text.includes(it.answer))) bad('collocation partner not in a stored collocation');
      if (it.kind === 'confusables' && it.answer !== lx.lemma) bad('confusables answer');
      if (it.kind === 'register_pick') { const regs = o => o === lx.lemma ? [].concat(p.register || []) : [].concat((p.synonyms || []).find(s => s.word === o)?.register || []); if (it.options.filter(o => regs(o).includes(it.register)).length !== 1 || !regs(it.answer).includes(it.register)) bad('register not unique'); }
      if (it.kind === 'nuance_pick' && ![lx.lemma, ...(p.synonyms || []).map(s => s.word)].includes(it.answer)) bad('nuance answer is not the word or a synonym');
      if (it.kind === 'connotation' && it.answer !== p.connotation) bad('connotation');
      if (it.kind === 'idiom_meaning' && !(p.phrases || []).some(ph => ph.meaning === it.answer || ph.text === it.answer)) bad('idiom answer');
      if (it.kind === 'example_cloze' && !(Object.values(lx.forms || {}).concat([lx.lemma], lx.alts || []).some(f => plain(c, f) === plain(c, it.answer)) && (p.examples || []).some(e => N.nfc(e.text).includes(N.nfc(it.answer))))) bad('cloze answer is not a stored form in an example');
      if (it.kind === 'example_cloze' && it.options.filter(o => plain(c, o) === plain(c, it.answer)).length !== 1) bad('cloze: a distractor equals the answer');
      if (it.kind === 'sense_pick' && !(p.senses || []).some(s => !s.of && s.def === it.answer)) bad('sense_pick answer');
      if (it.kind === 'etymology_link' && (it.answer !== lx.lemma || plain(c, (it.prompt.text || '')).includes(plain(c, lx.lemma)))) bad('etymology answer shown in the clue');
      if (it.kind === 'intensity_scale' && it.type === 'vpick') { const v = o => Object.values(X.lex).find(y => y.lemma === o)?.profile?.intensity; if (it.options.some(o => o !== it.answer && v(o) >= v(it.answer))) bad('intensity'); }
    }
  }
  ok(!problems.length, `pilot course: every item sound and from the stored data (${Object.values(per).flatMap(Object.values).reduce((a, b) => a + b, 0)} items)` + (problems.length ? ' — ' + problems.slice(0, 6).join(' | ') : ''));
  const where = t => Object.entries(per[t] || {}).map(([c, n]) => `${c} ${n}`).join(' ');
  ok(per.root_family?.ar && per.root_family?.he && !per.root_family?.de && !per.root_family?.zh, 'root_family in Arabic and Hebrew: ' + where('root_family'));
  ok(per.compound_split?.de && Object.keys(per.compound_split).length === 1, 'compound_split in German: ' + where('compound_split'));
  ok(N.DEEP_TYPES.filter(t => !['root_family', 'compound_split', 'intensity_scale'].includes(t)).every(t => C.languages.every(c => per[t]?.[c])), 'every other type in every language');
  ok(per.intensity_scale?.ar && per.intensity_scale?.zh, 'intensity_scale where the data has a scale (ar, zh): ' + where('intensity_scale'));
  // compounds
  const de = C.lang.de, cs = id => N.compoundSplit(de.lex[id]);
  ok(cs('de:Krankenhaus')?.pieces.join('|') === 'Kranken|haus' && cs('de:Schlangenhaargurke')?.pieces.join('|') === 'Schlangen|haar|gurke' && cs('de:Viertel') === null, 'compoundSplit: Kranken|haus, Schlangen|haar|gurke, Viertel (parts not in the word) → none');
  // partners only when met: a learner who met only the words of S01–S06 in German
  const early = new Set(C.order.slice(0, C.order.indexOf('fd.06') + 1));
  const L6 = knowsAll(C, ['de'], { filter: (c, id) => early.has(C.lang.de.lex[id].node) }), k6 = N.known(C, L6, 'de');
  const its6 = N.deepItems(C, L6, 'de', Object.keys(de.lex).filter(id => early.has(de.lex[id].node)), { k: k6, rng: seeded(5), max: 1e5, perWord: 1e5, types: ['confusables', 'sense_split', 'root_family'] });
  const unmet = its6.filter(it => (it.type === 'vpick' ? it.options : it.cards.map(cd => de.lex[cd.lex].lemma)).some(o => !Object.values(de.lex).some(y => y.lemma === o && k6.R.has(y.id))));
  ok(its6.length && !unmet.length, `confusables / sense_split offer only words the learner has met (${its6.length} items)`);
  // the daily session: 1–3 items, words ≥ known_r and not due, none for a new learner
  const Ld = knowsAll(C, ['de', 'zh'], { due: 50, filter: (c, id) => early.has(C.lang[c].lex[id].node) });
  Ld.langs.de.items['de:Bruder'] && (Ld.langs.de.items['de:Bruder'].r.due = 20);
  const dp = N.deepenPlan(C, Ld, { day: 20, languages: ['de', 'zh'], n: 3, rng: seeded(9) });
  ok(dp.length === 3 && dp.every(d => d.item.lex === d.lex && soundItem(d.item)) && new Set(dp.map(d => d.lang)).size === 2 && !dp.some(d => d.lex === 'de:Bruder'), `deepenPlan: 3 items, both languages, a word due today left to the reviews (${dp.map(d => d.item.kind).join(', ')})`);
  ok(N.deepenPlan(C, N.newLearner(C), { day: 20, n: 3 }).length === 0, 'deepenPlan: nothing for a new learner');
} else console.log('  (no pilot course here — skipped)');

// ---------------- the UI in a browser ----------------
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed — the browser part is skipped)'); return done(); }
  if (!fs.existsSync(path.join(PILOT, 'course.pack.js')) || !fs.existsSync(path.join(ROOT, 'engine', 'langui.js'))) { console.log('  (not built — run python3 tools/build.py; the browser part is skipped)'); return done(); }
  console.log('— the UI');
  const SUBJ = 'lang:polyglot-semitic-zh-de', url = 'file://' + ROOT + '/index.html';
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(), E = []; page.on('pageerror', e => E.push(e.message));
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  const ready = async (pg = page) => { await pg.waitForFunction(() => window.NoemaLangUI?.UI?.C && document.querySelector('.lx-main .lx-view'), null, { timeout: 60000 }); await wait(300); };
  const open = async (hash = '', pg = page) => { await pg.goto(url + '?account=anr&subject=' + SUBJ + hash); await ready(pg); };
  await open();
  // the learner: the family (S06) known in German and Arabic two days ago, one German word due today
  await page.evaluate(() => {
    const { C, L } = NoemaLangUI.UI, d = NoemaLang.dayNumber() - 2;
    for (const c of ['de', 'ar']) for (const id of C.lang[c].byNode['fd.06']) for (const t of ['r', 'p']) { NoemaLang.review(C, L, c, id, t, 'good', d); NoemaLang.review(C, L, c, id, t, 'good', d + 1); }
    const due = C.lang.de.byNode['fd.06'][0]; L.langs.de.items[due] = { seen: d, r: NoemaLang.sm2(null, 'good', d + 1) };
    const kv = NoemaLang.toKV(C, L); for (const [k, v] of Object.entries(kv)) localStorage.setItem(`noema1:anr:s:lang:polyglot-semitic-zh-de:${k}`, JSON.stringify(v));
  });
  const ids = await page.evaluate(() => NoemaLangUI.UI.C.lang.de.byNode['fd.06']);
  const wid = ids.find(id => /Bruder/.test(id)) || ids[3];

  /** Answer the depth item on screen from the item itself (right or wrong). */
  async function answerDeep(right = true) {
    const it = await page.evaluate(() => { const c = NoemaLangUI.UI.current; return c && c.kind === 'deep' ? c.it : null; });
    if (!it) return null;
    const box = '.lx-stage .lx-deep';
    if (it.type === 'vpick') { const i = it.options.indexOf(it.answer); await page.keyboard.press(String((right ? i : (i + 1) % it.options.length) + 1)); }
    else if (it.type === 'vsteps') for (const s of it.steps) { const i = s.options.indexOf(s.answer); const opts = await page.$$(`${box} .lx-opts:not([data-done]) .lx-opt`); await opts[right ? i : (i + 1) % opts.length].click(); await wait(30); }
    else if (it.type === 'vsort') for (const cd of it.cards) {
      await page.click(`${box} .lx-sortchip[data-id="${cd.id}"]`);
      const target = right ? cd.bucket : it.buckets.find(b => b.id !== cd.bucket).id;
      await page.click(`${box} .lx-sortbin[data-group="${target}"]`);
      if (!right) await page.click(`${box} .lx-sortbin[data-group="${cd.bucket}"]`);
    }
    else if (it.type === 'vorder') { const order = right ? it.cards.map((c, i) => i) : it.cards.map((c, i) => i).reverse(); for (const i of order) await page.click(`${box} .lx-tile1[data-i="${i}"]`); }
    await wait(40);
    return it;
  }
  async function runAll(right = true, guard = 30) {
    const seen = [];
    for (let i = 0; i < guard; i++) {
      await wait(40);
      if (await page.$('.lx-deepdone')) break;
      const it = await answerDeep(right); if (!it) break; seen.push(it);
      const nx = await page.$('.lx-stage .lx-next'); if (nx) await nx.click(); else break;
    }
    return seen;
  }

  // ---------- the daily session: reviews, then 1–3 deepening items ----------
  await open('#/');
  const goTxt = await page.locator('.lx-go').innerText();
  await page.click('.lx-go'); await wait(300);
  let deepN = 0, steps = 0;
  for (; steps < 200; steps++) {
    await wait(30);
    if (await page.$('.lx-result')) break;
    const cur = await page.$eval('.lx-stage .lx-ex', e => ({ ...e.dataset })).catch(() => null); if (!cur) break;
    if (cur.kind === 'deep') {
      if (!/once more/.test(await page.locator('.lx-stage .lx-which').innerText())) deepN++;   // a wrong one comes back once, like every item
      // the session runner's item: answer by clicking the first option or the cards, whatever is shown
      if (await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt')) await page.click('.lx-stage .lx-opts:not([data-done]) .lx-opt');
      else if (await page.$('.lx-stage .lx-sortchip')) { for (let j = 0; j < 20 && await page.$('.lx-stage .lx-sortchip'); j++) { await page.click('.lx-stage .lx-sortchip'); const bins = await page.$$('.lx-stage .lx-sortbin'); for (const b of bins) { if (!(await page.$('.lx-stage .lx-sortchip.on'))) break; await b.click(); } } }
      else if (await page.$('.lx-stage .lx-vorder')) { for (const t of await page.$$('.lx-stage .lx-vorder .lx-tile1')) await t.click(); }
      for (let j = 0; j < 3 && await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); j++) await page.click('.lx-stage .lx-opts:not([data-done]) .lx-opt');
    } else if (cur.kind === 'intro') { await page.click('.lx-stage .lx-next'); continue; }
    else if (await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt')) await page.click('.lx-stage .lx-opts:not([data-done]) .lx-opt');
    else await page.click('.lx-stage button:has-text("Show me")').catch(() => { });
    for (let j = 0; j < 2 && await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); j++) await page.click('.lx-stage .lx-opts:not([data-done]) .lx-opt');
    await wait(30);
    const nx = await page.$('.lx-stage .lx-next'); if (nx) await nx.click();
  }
  ok(deepN >= 1 && deepN <= 3 && await page.$('.lx-result') && /reviews?/.test(goTxt), `the daily session ends with ${deepN} deepening item(s) for known words (${steps} steps; “${goTxt}”)`);

  // ---------- the word card → 🏋️ practise this word ----------
  await open('#/w/de/' + encodeURIComponent(wid));
  ok(await page.locator('.lx-card .lx-deepbtn').count() === 1, 'the word card has “🏋️ Practise this word”');
  await page.click('.lx-card .lx-deepbtn'); await page.waitForSelector('.lx-stage .lx-deep', { timeout: 30000 });
  ok(/#\/deep\/de\//.test(await page.evaluate(() => location.hash)), 'it opens #/deep/de/<word>');
  const types = await page.$$eval('.lx-deeptypes [data-type]', b => b.map(x => x.dataset.type));
  ok(types.length >= 4, 'the types its data allows: ' + types.join(', '));
  const before = await page.evaluate(w => JSON.stringify(NoemaLangUI.UI.L.langs.de.items[w]), wid);
  const done1 = await runAll(true);
  const res = await page.locator('.lx-deepdone h2').innerText().catch(() => '');
  ok(done1.length >= 4 && new RegExp(`${done1.length} of ${done1.length} right`).test(res), `answered rightly: “${res}” (${[...new Set(done1.map(i => i.kind))].join(', ')})`);
  const after = await page.evaluate(w => NoemaLangUI.UI.L.langs.de.items[w], wid), today = await page.evaluate(() => NoemaLang.dayNumber());
  ok(before !== JSON.stringify(after) && (after.r?.last === today || after.p?.last === today), 'the answers are reviews of the word (its tracks moved today)');
  ok(done1.every(it => it.lex === wid), 'every item of “practise this word” is about that word');

  // ---------- the lesson page → 🏋️ deepen (mixed set; wrong answers are lapses) ----------
  await open('#/lesson/fd.06');
  await page.click('.lx-flagchip:has-text("DE")').catch(() => { }); await wait(300);
  await open('#/lesson/fd.06');
  ok(await page.locator('.lx-deepenbtn').count() === 1 && /Deepen \(\d+ words\)/.test(await page.locator('.lx-deepenbtn').innerText()), 'the lesson page has “🏋️ Deepen (n words)”');
  await page.click('.lx-deepenbtn'); await page.waitForSelector('.lx-stage .lx-deep', { timeout: 30000 });
  const lapsesBefore = await page.evaluate(ids => ids.reduce((a, id) => a + (NoemaLangUI.UI.L.langs.de.items[id]?.r?.lapses || 0) + (NoemaLangUI.UI.L.langs.de.items[id]?.p?.lapses || 0), 0), ids);
  const done2 = await runAll(false);
  const kinds2 = [...new Set(done2.map(i => i.kind))];
  ok(done2.length >= 6 && kinds2.length >= 4, `a mixed set over the lesson's words: ${done2.length} items, ${kinds2.length} types (${kinds2.join(', ')})`);
  ok(new Set(done2.map(i => i.lex)).size >= 3 && done2.every(it => ids.includes(it.lex)), 'over several of its words, all of this lesson');
  const lapsesAfter = await page.evaluate(ids => ids.reduce((a, id) => a + (NoemaLangUI.UI.L.langs.de.items[id]?.r?.lapses || 0) + (NoemaLangUI.UI.L.langs.de.items[id]?.p?.lapses || 0), 0), ids);
  ok(lapsesAfter > lapsesBefore && /0 of \d+ right/.test(await page.locator('.lx-deepdone h2').innerText()), `wrong answers are lapses of the words (${lapsesBefore} → ${lapsesAfter})`);
  const metNew = done2.some(it => (it.unknown || []).length || (it.cards || []).some(c => (c.unknown || []).length));
  ok(!metNew || await page.locator('.lx-deepdone .lx-newlist li').count() > 0, `the end of the set lists the 🆕 words met (${metNew ? 'there were some' : 'none this time'})`);

  // ---------- RTL: Arabic, the node page of the same lesson, foreign spans with lang and dir ----------
  await open('#/deepen/fd.06/ar'); await page.waitForSelector('.lx-stage .lx-deep', { timeout: 30000 });
  let rtlOk = true, spans = 0, hasSent = false;
  for (let i = 0; i < 12; i++) {
    const it = await page.evaluate(() => NoemaLangUI.UI.current?.kind === 'deep' ? NoemaLangUI.UI.current.it : null); if (!it) break;
    const st = await page.$$eval('.lx-stage .lx-deep [lang="ar"]', els => els.map(e => [e.getAttribute('lang'), e.getAttribute('dir')]));
    spans += st.length; if (st.some(([l, d]) => d !== 'rtl')) rtlOk = false;
    if (await page.$('.lx-stage .lx-deepsent')) hasSent = true;
    const sent = await page.$$eval('.lx-stage .lx-deepsent', els => els.every(e => e.getAttribute('lang') && e.getAttribute('dir')));
    if (!sent) rtlOk = false;
    await answerDeep(true); const nx = await page.$('.lx-stage .lx-next'); if (nx) await nx.click(); else break; await wait(40);
  }
  ok(rtlOk && spans > 5, `Arabic: every foreign span has lang="ar" dir="rtl" (${spans} spans${hasSent ? ', sentences too' : ''})`);
  // ---------- 🆕 words in a sentence open their card ----------
  const found = await page.evaluate(() => {
    const { C, L } = NoemaLangUI.UI, its = NoemaLang.deepItems(C, L, 'de', C.lang.de.byNode['fd.06'], { max: 200, perWord: 99, types: ['example_cloze', 'sense_pick'] });
    return its.find(it => (it.unknown || []).length) || null;
  });
  ok(!!found, 'some German sentence items carry 🆕 words (D19: ≤ ⌈30 %⌉ of the words)');

  // ---------- phones ----------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hsh of ['#/deep/de/' + encodeURIComponent(wid), '#/deepen/fd.06/ar', '#/deepen/fd.06/de']) {
    await open(hsh); await page.waitForSelector('.lx-stage .lx-deep', { timeout: 30000 });
    let worst = 0;
    for (let i = 0; i < 6; i++) {
      worst = Math.max(worst, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
      if (!(await answerDeep(true))) break; worst = Math.max(worst, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
      const nx = await page.$('.lx-stage .lx-next'); if (nx) await nx.click(); else break; await wait(40);
    }
    ok(worst <= 1, `phone: no sideways scrolling on ${hsh} (${worst}px)`);
  }
  // ---------- the profiles arrive after the start: a direct link waits for them ----------
  await page.setViewportSize({ width: 1280, height: 900 });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => E.push(e.message));
  await p2.goto(url + '?account=anr&subject=' + SUBJ + '#/deep/de/' + encodeURIComponent(wid));
  for (let i = 0; i < 40 && !(await p2.$('.lx-stage .lx-deep')); i++) await wait(250);
  ok(await p2.locator('.lx-stage .lx-deep').count() === 1, 'a direct link to #/deep/… draws once the word profiles have loaded');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close();
  done();
})().catch(e => { console.error(e); fails++; done(); });
function done() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
