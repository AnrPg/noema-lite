/* P6 — the polyglot layer (docs/LANGUAGES.md §6.6, §7.5, §8, §9): parallel sentences, bridges, comparison statements, the five
   polyglot exercise types, interleaved sessions, today's languages, depth, the ⇄ compare lane and the widgets in a real browser.
   Usage: node tests/lang_poly.js [<prepared-repo-dir>]   (the browser part needs the dir built with tools/build.py; without it only the Node part runs) */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const load = dir => {
  const read = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  return N.course(N.readCourse(read, list));
};
const COURSE = 'polyglot-semitic-zh-de';

// ================= Node: the mini course =================
console.log('— parallel sentences, bridges (mini course)');
const M = load(path.join(__dirname, 'fixtures', 'lang-mini'));
{
  const G = N.parallelGroups(M);
  ok(G.length === 7 && G.filter(g => Object.keys(g.by).length === 4).length === 6, `same frame + same gloss = one meaning: ${G.length} groups, 6 in all four languages`);
  ok(N.equivalents(M, 'ar', 'ar.s.003', 'de').join() === 'de.s.003', 'a bracket note that is no variant (“(in general)”) is set aside: ar.s.003 = de.s.003');
  ok(N.equivalents(M, 'de', 'de.s.007', 'he').join() === 'he.s.007' && !N.equivalents(M, 'de', 'de.s.007', 'zh').length, 'the carrots (plural) exist in he, not in zh: no false partner');
  const k1 = N.glossKey('I’m here (to a woman).'), k2 = N.glossKey('I am here.'), k3 = N.glossKey('You (pl., formal) eat.');
  ok(k1.key === k2.key && k1.marks.G === 'F' && !k2.marks.G && k3.marks.N === 'PL' && k3.marks.R === 'FORM', 'gloss keys: contractions folded, the notes kept as marks (gender, number, formality)');
  // the marks decide between variants (a hand-made group)
  const fake = { languages: ['a', 'b'], _par: { groups: [], of: {} } };
  const G2 = { by: { a: [{ id: 'a1', marks: { N: 'PL' } }, { id: 'a2', marks: {} }, { id: 'a3', marks: { G: 'F' } }], b: [{ id: 'b1', marks: {} }, { id: 'b2', marks: { N: 'PL' } }, { id: 'b3', marks: { G: 'M' } }, { id: 'b4', marks: { G: 'F' } }] } };
  for (const x of [...G2.by.a.map(y => ['a', y.id]), ...G2.by.b.map(y => ['b', y.id])]) fake._par.of[x[0] + '|' + x[1]] = G2;
  ok(N.equivalents(fake, 'a', 'a1', 'b').join() === 'b2' && N.equivalents(fake, 'a', 'a2', 'b').join() === 'b1' && N.equivalents(fake, 'a', 'a3', 'b').join() === 'b4' && N.equivalents(fake, 'b', 'b3', 'a').join() === 'a2',
    'variants: “you (pl.)” → only the plural; no note → the plain one; a woman → the feminine; a man where the other has only “a woman” → the plain one');
  const B = N.bridges(M);
  ok(B.list.some(b => b.a.lex === 'ar:basal' && b.b.lex === 'he:batsal' && b.via.includes('root')) && B.list.some(b => b.a.lex === 'ar:akala' && b.b.lex === 'he:akhal'),
    'roots: بَصَل ↔ בָּצָל and أَكَلَ ↔ אָכַל (corresponding radicals + a shared meaning)');
  ok(!B.list.some(b => b.a.lex === 'ar:jazar' && b.via.join() === 'root'), 'a root the facade says is none (a loanword) makes no root bridge (the stray top-level root is ignored)');
  const vec = [['ث ل ث', 'שׁ ל שׁ', true], ['ب ي ت', 'ב י ת', true], ['ك ت ب', 'כ ת ב', true], ['ل ح م', 'ל ח ם', true], ['و ل د', 'י ל ד', true], ['ب ص ل', 'ג ז ר', false], ['ك ت ب', 'כ ת', false]];
  ok(vec.every(([a, h, want]) => N.rootsCorrespond(a, h) === want), `root correspondences: ${vec.length} vectors (ث→שׁ, final ם, w/y, length)`);
}

// ================= Node: the pilot course =================
console.log('— the pilot course: bridges, items, sessions');
const C = load(path.join(ROOT, 'library', 'languages', COURSE));
const lem = w => C.lang[w.lang].lex[w.lex].lemma;
{
  const ms = (t, own = 'he') => N.mentionsIn(C, t, own).map(m => [m.code, m.word, m.kind]);
  const m1 = ms('Borrowed from French café, from Italian caffè, from Ottoman Turkish kahve.');
  ok(JSON.stringify(m1) === JSON.stringify([['fr', 'café', 'loan'], ['it', 'caffè', 'loan']]), 'mentions: “Borrowed from French café, from Italian caffè” → two loans; Ottoman Turkish (an older stage) is left out');
  ok(ms('English shallot is from French échalote.').find(m => m[0] === 'fr')?.[2] === 'other', 'a sentence about another word (“English shallot is from French échalote”) is not about this word');
  ok(!ms('False friend for Turkish speakers: Turkish hala (the father’s sister), Turkish teyze.', 'ar').filter(m => m[2] === 'falseFriend').some(m => m[1] === 'teyze'), 'a false-friend sentence is about its first word of each language');
  ok(!ms('From Old Polish ogórek; for Turkish speakers.').length && ms('Calque of Arabic صَبَاح النُّور.')[0]?.[2] === 'calque', 'older stages and words like “speakers” are no mentions; a calque is not a bridge');
  const B = N.bridges(C), kinds = {}; for (const b of B.list) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  ok(kinds.cognate > 50 && kinds.loan > 30 && kinds.falseFriend >= 1, `bridges of the course: ${JSON.stringify(kinds)}, ${B.known.length} links to other languages`);
  const ff = B.list.find(b => b.kind === 'falseFriend');
  ok(ff && [lem(ff.a), lem(ff.b)].sort().join() === ['מְדִינָה', 'مَدِينَة'].sort().join() && !ff.same, 'the false friend the data names: مَدِينَة (city) ↔ מְדִינָה (state), no meaning in common');
  ok(B.list.every(b => b.kind === 'falseFriend' ? !b.same : true) && B.list.filter(b => b.via.join() === 'root').every(b => b.same && N.rootsCorrespond(b.roots[0], b.roots[1])), 'every root bridge has corresponding roots and a shared meaning; no false friend shares one');
  const bayt = N.bridgesOf(C, 'ar', 'ar:bayt').find(b => b.other.lang === 'he');
  ok(bayt && lem(bayt.other) === 'בַּיִת', 'بَيْت ↔ בַּיִת on the word');
  ok(N.bridgesOf(C, 'de', 'de:Kaffee').some(b => b.other.lang === 'zh' && b.via.includes('source')), 'shared source: Kaffee ↔ 咖啡 (both from Italian caffè)');
  ok(N.knownLinks(C, 'ar', 'ar:khala', ['tr']).some(x => x.word === 'hala' && x.kind === 'falseFriend') && !N.knownLinks(C, 'ar', 'ar:khala', ['el']).length, 'links to the learner’s languages: خَالَة ⚠️ Turkish hala — only for a learner who knows Turkish');
}
// a learner who has met every word in every language (R), knows Turkish and English
const all = N.newLearner(C, { knows: [{ code: 'tr', level: 'native' }, { code: 'en', level: 'C2' }] });
for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) N.review(C, all, c, id, 'r', 'good', 0);
const kAll = Object.fromEntries(C.languages.map(c => [c, N.known(C, all, c)]));
const fold = (c, s) => N.stripMarks(c, s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const tokC = (c, t) => (t.l ? [t.l] : (t.parts || []).map(p => p.l).filter(Boolean)).flatMap(l => C.lang[c].lex[l]?.senses || []);
{
  const rng = N.seeded(42);
  const W = N.polyItems(C, all, 'which_language', { k: kAll, rng, max: 40 });
  const romans = Object.fromEntries(C.languages.map(c => [c, new Set(Object.values(C.lang[c].lex).flatMap(x => [N.romanOf(C, c, x), x.lemma].filter(Boolean).map(r => fold(c, r))))]));
  ok(W.length === 40 && W.every(it => it.answer === it.lang && it.options.length === 4 && C.lang[it.lang].lex[it.lex] && !C.languages.some(o => o !== it.lang && romans[o].has(fold(it.lang, it.prompt)))),
    `which_language: ${W.length} items, the answer is the word's language, no romanization shared with another option`);
  ok(W.slice(0, 2).every(it => it.pair) && W.filter(it => it.roman).length > 25, 'which_language: related words first, one after the other; words in romanization (transliteration, pinyin)');

  const T = N.polyItems(C, all, 'parallel_translate', { k: kAll, rng, max: 60 });
  const tBad = T.filter(it => {
    const sA = C.lang[it.from].sentenceById[it.source], sB = C.lang[it.lang].sentenceById[it.sentence];
    const tiles = sB.tokens.filter(t => !t.p).map(t => t.t);
    return !(sA.frame === sB.frame && N.glossKey(sA.gloss).key === N.glossKey(sB.gloss).key && it.answers.includes(sB.text) && tiles.every(t => it.tiles.includes(t)) && N.checkBuilt(C, it.lang, it, tiles) && it.from !== it.lang);
  });
  ok(T.length === 60 && !tBad.length && new Set(T.map(it => it.from + it.lang)).size >= 6, `parallel_translate: ${T.length} items over ${new Set(T.map(it => it.from + it.lang)).size} language pairs — same frame and meaning, the target's tiles build it ${tBad.length ? JSON.stringify(tBad[0]).slice(0, 300) : ''}`);
  const wrongOk = T.filter(it => it.tiles.length > it.size).every(it => {
    const sB = C.lang[it.lang].sentenceById[it.sentence], words = sB.tokens.filter(k => !k.p), extra = it.tiles.find(t => !words.some(k => k.t === t)); if (!extra) return true;
    const at = words.findIndex(k => k.l && Object.values(C.lang[it.lang].lex[k.l]?.forms || {}).includes(extra));
    return at >= 0 && !N.checkBuilt(C, it.lang, it, words.map((k, i) => i === at ? extra : k.t));
  });
  ok(T.some(it => it.tiles.length > it.size) && wrongOk, 'parallel_translate: a wrong tile (another form of one of its words) is offered and never accepted');

  const A = N.polyItems(C, all, 'parallel_align', { k: kAll, rng, max: 40 });
  const aBad = A.filter(it => it.rows.some(r => {
    const sP = C.lang[it.lang].sentenceById[it.sentences[it.lang]];
    if (!tokC(it.lang, sP.tokens[r.pivot]).includes(r.concept)) return true;
    return Object.entries(r.hits).some(([c, is]) => !is.length || is.some(i => !tokC(c, C.lang[c].sentenceById[it.sentences[c]].tokens[i]).includes(r.concept)));
  }) || Object.keys(it.sentences).length < 2 || Object.keys(it.sentences).length > 4 || it.rows.length < 2);
  ok(A.length >= 20 && !aBad.length, `parallel_align: ${A.length} items of 2–4 languages, every pair of words carries the same concept (from token lemmas)`);

  const Bq = N.polyItems(C, all, 'cognate_bridge', { k: kAll, rng, max: 30 }), kinds = {}; for (const it of Bq) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
  const bBad = Bq.filter(it => {
    if (it.kind === 'false_friend') { const ps = it.pairs.map(p => N.bridgesOf(C, p.a.lang, p.a.lex).find(b => b.other.lang === p.b.lang && b.other.lex === p.b.lex)); return ps[it.answer]?.kind !== 'falseFriend' || ps.some((b, i) => i !== it.answer && !(b && b.same)); }
    if (it.kind === 'known') return !it.options.includes(it.answer) || !N.knownLinks(C, it.lang, it.answer, ['tr', 'en']).some(x => x.word === it.other.word);
    const linked = id => N.bridgesOf(C, it.from, it.lex).some(b => b.other.lang === it.lang && b.other.lex === id);
    return !linked(it.answer) || it.options.filter(id => id !== it.answer).some(id => linked(id) || (C.lang[it.lang].lex[id].senses || []).some(s => (C.lang[it.from].lex[it.lex].senses || []).includes(s)));
  });
  ok(kinds.bridge && kinds.known && kinds.false_friend && !bBad.length, `cognate_bridge: ${JSON.stringify(kinds)} — the answer is the bridged word, no distractor related or of the same meaning, the false friend is the one the data names`);

  const R = N.polyItems(C, all, 'compare_rule', { k: kAll, rng, max: 12 });
  const rBad = R.filter(it => it.statements.some(st => !st.holds.length || st.holds.some(c => !it.langs.includes(c))) || (it.kind === 'whose' && it.statements.some(st => st.holds.length !== 1 || /\b(Arabic|Hebrew|Chinese|German)\b/.test(st.text))));
  const cf = N.compareFn(C, 'fn.plural.noun', C.languages), fNum = cf.features.find(f => f.feature === 'nom.dual');
  ok(R.length === 12 && !rBad.length && R.some(it => it.kind === 'compare') && R.some(it => it.kind === 'whose'), `compare_rule: ${R.length} items (statements × languages from typology tags and status; whose page, names masked)`);
  ok(fNum && fNum.values.ar.value === 'productive' && fNum.values.zh.value === 'none' && cf.rows.find(r => r.lang === 'zh').status === 'absent', 'the comparison strip of the plural: the dual productive in Arabic, none in Chinese; Chinese marks no plural (absent)');
  const st = N.polyItems(C, all, 'compare_rule', { fn: 'fn.plural.noun', k: kAll, rng: N.seeded(1), max: 4 }).find(it => it.kind === 'compare');
  ok(st && st.statements.every(s => { const f = cf.features.find(x => s.text.startsWith(x.title + ':')); return !f || s.holds.every(c => s.text.endsWith(f.values[c].title)); }), 'compare_rule over one function: every statement holds exactly for the languages whose value it states');
}
{ // D19: a learner who knows a part only — every item stays within what is known (words) or ⌈30 %⌉ unknown (sentences)
  const part = N.newLearner(C), rng = N.seeded(7);
  for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) if (rng() < 0.45) N.review(C, part, c, id, 'r', 'good', 0);
  const k = Object.fromEntries(C.languages.map(c => [c, N.known(C, part, c)]));
  const capOk = (c, id) => { const s = C.lang[c].sentenceById[id]; return s.req.filter(l => !k[c].R.has(l)).length <= s.cap; };
  const W = N.polyItems(C, part, 'which_language', { k, rng, max: 30 }), T = N.polyItems(C, part, 'parallel_translate', { k, rng, max: 30 }), A = N.polyItems(C, part, 'parallel_align', { k, rng, max: 20 }), B = N.polyItems(C, part, 'cognate_bridge', { k, rng, max: 20 });
  ok(W.length && W.every(it => k[it.lang].R.has(it.lex)) && B.every(it => it.kind === 'false_friend' ? it.pairs.every(p => k[p.a.lang].R.has(p.a.lex) && k[p.b.lang].R.has(p.b.lex)) : (it.kind === 'known' ? true : k[it.from].R.has(it.lex)) && it.options.every(id => k[it.lang].R.has(id))), `words: only known ones (${W.length} which_language, ${B.length} cognate_bridge)`);
  ok(T.length && A.length && T.every(it => capOk(it.from, it.source) && capOk(it.lang, it.sentence)) && A.every(it => Object.entries(it.sentences).every(([c, id]) => capOk(c, id))), `sentences: at most ⌈30 %⌉ unknown words, in both languages (${T.length} translate, ${A.length} align)`);
  const none = N.newLearner(C);
  ok(['which_language', 'parallel_translate', 'parallel_align', 'cognate_bridge'].every(t => !N.polyItems(C, none, t, {}).length), 'a new learner gets no polyglot item (nothing known yet)');
}
{ // sessions (§7.5): one polyglot item with ≥ 2 languages, confusables side by side
  const L = N.newLearner(C), d0 = 0;
  for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex).slice(0, 60)) { N.review(C, L, c, id, 'r', 'good', d0); }
  for (const [c, id] of [['ar', 'ar:madina'], ['he', 'he:medina'], ['ar', 'ar:bayt'], ['he', 'he:bayit'], ['de', 'de:Haus']]) N.review(C, L, c, id, 'r', 'good', d0);
  const p2 = N.planSession(C, L, { day: 1, minutes: 30 }), poly = p2.steps.find(s => s.kind === 'poly');
  ok(poly && poly.items.length === 1 && ['which_language', 'parallel_align'].includes(poly.type), `the daily session of 4 languages has one polyglot item (${poly && poly.type})`);
  ok(!N.planSession(C, L, { day: 1, minutes: 30, languages: ['de'] }).steps.some(s => s.kind === 'poly') && !N.planSession(C, L, { day: 1, minutes: 1 }).steps.some(s => s.kind === 'poly'), 'one language, or a one-minute session: no polyglot item');
  ok(JSON.stringify(N.planSession(C, L, { day: 1, minutes: 30 })) === JSON.stringify(p2), 'the plan of a day is the same when it is made again (seeded)');
  const types = new Set([1, 2, 3, 4].map(d => N.planSession(C, L, { day: d, minutes: 30 }).steps.find(s => s.kind === 'poly')?.type));
  ok(types.has('which_language') && types.has('parallel_align'), 'which_language and parallel_align alternate by day');
  const rv = p2.steps.find(s => s.kind === 'review').items, ix = (c, id) => rv.findIndex(x => x.lang === c && x.lex === id && x.track === 'r');
  ok(Math.abs(ix('ar', 'ar:madina') - ix('he', 'he:medina')) === 1, `the false friends مَدِينَة / מְדִינָה are reviewed one right after the other (${ix('ar', 'ar:madina')}, ${ix('he', 'he:medina')})`);
}
{ // the generators: a realization may list the polyglot types (§6.7)
  const L = N.newLearner(M); for (const c of M.languages) for (const id of Object.keys(M.lang[c].lex)) N.review(M, L, c, id, 'r', 'good', 0);
  const g = M.lang.de.grammar['fn.plural.noun'], keep = g.generators;
  g.generators = [{ type: 'parallel_translate', to: ['he'] }, { type: 'parallel_align' }, { type: 'compare_rule' }];
  const ex = N.exercises(M, L, 'de', 'fn.plural.noun', { rng: N.seeded(3), max: 12 }); g.generators = keep;
  const byT = {}; for (const it of ex) byT[it.type] = (byT[it.type] || 0) + 1;
  ok(byT.parallel_translate && byT.parallel_align && byT.compare_rule && ex.filter(it => it.type === 'parallel_translate').every(it => it.from === 'de' && it.lang === 'he' && (M.lang.de.sentenceById[it.source].functions || []).includes('fn.plural.noun')),
    `generators GEN.<type>: ${JSON.stringify(byT)} — German plural sentences into Hebrew`);
  const { execFileSync } = require('child_process');
  const impl = execFileSync('python3', ['-c', 'import sys; sys.path.insert(0, "tools"); import lang_phenomena as p; print(" ".join(sorted(p.implemented_generators())))'], { cwd: ROOT }).toString();
  ok(N.POLY_TYPES.every(t => impl.includes(t)), 'tools/lang_phenomena.py counts the five polyglot types as implemented');
}
{ // depth per language (§9.6): a field above the depth is skipped and its words stay locked
  const L = N.newLearner(C, { depth: { de: 1 } }), ns = N.nodeStates(C, L, 'de'), k = N.known(C, L, 'de');
  const w2 = C.lang.de.byNode['veg.2a'][0];
  ok(ns['veg.2a'] === 'skipped' && ns['veg.3a'] === 'skipped' && N.nodeStates(C, L, 'ar')['veg.2a'] !== 'skipped' && k.state[w2] === 'locked', 'depth 1 in German: tiers 2 and 3 skipped there only, their words locked (not “new”)');
}

// ================= the browser =================
(async () => {
  const DIR = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!DIR || !fs.existsSync(path.join(DIR, 'library', 'languages', COURSE, 'course.pack.js'))) { console.log('(no built repo given: the browser part is skipped)'); return end(); }
  console.log('— the browser');
  const { chromium } = require(process.env.PW || 'playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.route(/^https?:\/\//, r => /fonts/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.abort());   // no network in tests
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + DIR + '/index.html', open = async (hash = '#/') => {
    await page.goto(url + '?account=anr&subject=lang:' + COURSE + hash);
    await page.waitForFunction(() => window.NoemaLangUI && document.querySelector('.lx-main .lx-view'), null, { timeout: 20000 }); await wait(400);
  };
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await open();
  // a learner who has met the words of the first foundation lessons in every language (passed), ten days ago
  await page.evaluate(() => {
    const { C, L } = NoemaLangUI.UI, d = NoemaLang.dayNumber() - 10;
    for (const c of C.languages) { let n = 0; for (const nid of C.order) { if (C.nodes[nid].kind !== 'lesson' || !C.lang[c].applies[nid]) continue; if (n++ > 8) break;
      for (const id of C.lang[c].byNode[nid]) { NoemaLang.review(C, L, c, id, 'r', 'good', d); NoemaLang.review(C, L, c, id, 'r', 'good', d + 3); } NoemaLang.recordCheck(C, L, c, nid, 1, d); } }
    for (const [c, id] of [['ar', 'ar:madina'], ['he', 'he:medina'], ['ar', 'ar:bayt'], ['he', 'he:bayit']]) if (C.lang[c].lex[id]) NoemaLang.review(C, L, c, id, 'r', 'good', d);
    const kv = NoemaLang.toKV(C, L); for (const [k, v] of Object.entries(kv)) localStorage.setItem(`noema1:anr:s:lang:polyglot-semitic-zh-de:${k}`, JSON.stringify(v));
  });
  await open();
  // ---- colours ----
  const col = await page.evaluate(() => ({ chip: getComputedStyle(document.querySelector('.lx-flagchip[data-lang="ar"]')).boxShadow, chip2: getComputedStyle(document.querySelector('.lx-flagchip[data-lang="he"]')).boxShadow }));
  ok(/15, 157, 88/.test(col.chip) && /26, 115, 232/.test(col.chip2), 'a fixed colour per language on the chips (Arabic green, Hebrew blue)');
  // ---- today's languages ----
  ok(await page.locator('.lx-todaychip').count() === 4, 'the home: today’s languages, four chips');
  await page.click('.lx-todaychip[data-lang="zh"]'); await wait(300);
  const today = await page.evaluate(() => ({ t: NoemaLangUI.UI.prefs.today, langs: NoemaLangUI.poly.todayLangs() }));
  ok(today.langs.join() === 'ar,he,de' && await page.locator('.lx-todaychip[data-lang="zh"]').getAttribute('aria-pressed') === 'false', 'Chinese left out today: ' + today.langs.join());
  const lessonsTxt = await page.locator('.lx-lessons').innerText().catch(() => '');
  ok(!/🇨🇳/.test(lessonsTxt) && /🇩🇪/.test(lessonsTxt), 'today’s plan has no Chinese lesson');
  await page.evaluate(() => { NoemaLangUI.UI.prefs.today = { day: NoemaLang.dayNumber() - 1, langs: ['de'] }; NoemaLangUI.save(true); });
  ok((await page.evaluate(() => NoemaLangUI.poly.todayLangs())).length === 4, 'the next day starts with all the languages again');
  // ---- the daily session runs its polyglot item ----
  const sess = await page.evaluate(() => { const { C, L } = NoemaLangUI.UI, plan = NoemaLang.planSession(C, L, { day: NoemaLang.dayNumber(), minutes: 20 }); const p = plan.steps.find(s => s.kind === 'poly');
    NoemaLangUI.poly.runSession({ steps: p ? [p] : [] }); return p; });
  ok(sess && sess.items.length === 1, 'the plan of the day has one polyglot item: ' + (sess && sess.type));
  if (sess) {
    await wait(200);
    ok(await page.locator('.lx-session .lx-ex[data-poly="1"]').count() === 1 && /across your languages/.test(await page.locator('.lx-which').innerText()), 'the session shows it (🌐 across your languages)');
    await answerItem(page, sess.items[0]); await wait(150);
    await page.click('.lx-stage .lx-next'); await wait(200);
    ok(/1 right/.test(await page.locator('.lx-result').innerText()), 'answered right → counted');
  }
  // ---- the compare lane ----
  await open('#/cmp');
  const nFn = await page.locator('.lx-cmprow[data-fn]').count(), nFr = await page.locator('.lx-cmprow[data-frame]').count();
  ok(nFn > 25 && nFr > 20, `⇄ compare lane: ${nFn} grammar points side by side, ${nFr} frames`);
  ok(/מְדִינָה/.test((await page.locator('details[data-kind="falseFriend"]').innerText()).normalize('NFC')), 'the bridges: the false friend listed first, open');
  await page.click('.lx-cmprow[data-fn="fn.plural.noun"]'); await wait(500);
  ok(await page.locator('.lx-cmpfn tr').count() === 4 && await page.locator('.lx-strip tr.lx-differs').count() >= 2, 'a function side by side: 4 languages, the comparison strip with the rows that differ marked');
  ok(await page.locator('.lx-cmpfn .lx-sent').count() >= 2, 'with an example sentence in each language');
  await open('#/cmp/frame/fr.eat');
  ok(await page.locator('.lx-pgroup').count() > 5 && await page.locator('.lx-pgroup .lx-prow').count() > 12, 'a frame: the same meaning in every language');
  await open('#/cmp/c/home.house');
  ok(await page.locator('.lx-compare tr').count() === 4 && /בַּיִת/.test((await page.locator('.lx-polystrip').innerText()).normalize('NFC')), 'a concept: the compare table + its bridges (بَيْت ⇄ בַּיִת)');
  // ---- the word card, the flag card, the function page ----
  await page.evaluate(() => { NoemaLangUI.UI.L.settings.knows = [{ code: 'tr', level: 'native' }]; NoemaLangUI.save(true); });
  await open('#/w/ar/ar:khala');
  const card = await page.locator('.lx-bridges').first().innerText().catch(() => '');
  ok(/Turkish/.test(card) && /hala/.test(card) && /false friend/.test(card), 'the word card, across your languages: خَالَة ⚠️ Turkish hala');
  await open('#/w/he/he:medina');
  ok(/مَدِينَة/.test((await page.locator('.lx-bridges').innerText()).normalize('NFC')) && await page.locator('.lx-bridges li.lx-ff').count() >= 1, 'מְדִינָה: the false friend مَدِينَة on its card');
  await open('#/fn/fn.plural.noun/de');
  ok(await page.locator('.lx-fnstrip').count() === 1, 'the function page carries the strip (folded) and the way to the compare lane');
  // ---- the drills: every widget, answered right (and keyboard) ----
  for (const type of ['which_language', 'parallel_translate', 'parallel_align', 'cognate_bridge', 'compare_rule']) {
    await open('#/poly/' + type);
    let n = 0;
    while (n < 12 && await page.$('.lx-polyrun .lx-stage .lx-ex')) {
      const it = await page.evaluate(() => NoemaLangUI.UI.current);
      if (type === 'which_language' && n === 0) {   // keyboard: the number of the right option
        const idx = it.options.indexOf(it.answer); await page.keyboard.press(String(idx + 1)); await wait(80);
      } else await answerItem(page, it);
      await wait(80); n++;
      const nx = await page.$('.lx-stage .lx-next'); if (!nx) break; await nx.click(); await wait(80);
    }
    const res = await page.locator('.lx-polydone h2').innerText().catch(() => '');
    ok(n > 0 && new RegExp(`✅ ${n} of ${n} right`).test(res), `${type}: ${res || 'no result'}`);
  }
  // lang + dir on every foreign span of the widgets
  await open('#/poly/parallel_align');
  const spans = await page.evaluate(() => [...document.querySelectorAll('.lx-exalign .lx-atok')].map(e => [e.lang, e.dir]));
  ok(spans.length && spans.every(([l, d]) => l && d), `every word of the align widget has lang and dir (${spans.length})`);
  await open('#/poly/which_language');
  const roman = await page.evaluate(() => { const e = document.querySelector('.lx-exwhich .lx-prompt .lx-w, .lx-exwhich .lx-prompt [lang]'); return e && [e.lang, e.dir, getComputedStyle(e).textDecorationColor]; });
  ok(roman && /-Latn$|^[a-z]{2}$/.test(roman[0]) && roman[1] && /rgba\(0, 0, 0, 0\)|transparent/.test(roman[2]), 'which_language: the word carries its language (ar-Latn …) but not its colour before the answer');
  // ---- depth per language in the settings is honoured on the map ----
  await open('#/settings');
  await page.selectOption('select[aria-label="How far to go in German"]', '1'); await wait(200);
  await open('#/');
  const veg2 = await page.evaluate(() => [...[...document.querySelectorAll('.lx-node')].find(n => n.textContent.includes('Vegetables II'))?.querySelectorAll('.lx-ns') || []].map(x => x.title).join(' | '));   // the map's chips: the words in the tooltip (QA)
  ok(/German: ⤼ skipped/.test(veg2) && !/Arabic: ⤼ skipped/.test(veg2), 'depth 1 for German: Vegetables II skipped in German only');
  // ---- phones ----
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hsh of ['#/', '#/cmp', '#/cmp/fn/fn.plural.noun', '#/cmp/frame/fr.eat', '#/poly/parallel_align', '#/poly/compare_rule', '#/poly/parallel_translate', '#/w/ar/ar:bayt']) {
    await open(hsh);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, `phone: no sideways scrolling on ${hsh} (${over}px)`);
  }
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close();
  end();
})().catch(e => { console.error(e); fails++; end(); });

/** Answer a polyglot item on the screen rightly, from the item itself. */
async function answerItem(page, it) {
  const st = '.lx-stage ';
  if (it.type === 'which_language') return page.click(`${st}.lx-opt:nth-child(${it.options.indexOf(it.answer) + 1})`);
  if (it.type === 'cognate_bridge') return page.click(`${st}.lx-opt:nth-child(${(it.kind === 'false_friend' ? it.answer : it.options.indexOf(it.answer)) + 1})`);
  if (it.type === 'parallel_translate') {
    const want = await page.evaluate(it => NoemaLangUI.UI.C.lang[it.lang].sentenceById[it.sentence].tokens.filter(t => !t.p).map(t => t.t), it);
    for (const w of want) { const i = await page.evaluate(([w]) => [...document.querySelectorAll('.lx-stage .lx-tile1')].findIndex(b => !b.disabled && b.textContent === w), [w]); await page.click(`${st}.lx-tile1[data-i="${await page.evaluate(i => document.querySelectorAll('.lx-stage .lx-tile1')[i].dataset.i, i)}"]`); }
    return;
  }
  if (it.type === 'parallel_align') {
    for (const row of it.rows) { for (const [c, is] of Object.entries(row.hits)) await page.click(`${st}.lx-aline[data-lang="${c}"] .lx-atok[data-i="${is[0]}"]`); await wait(260); }
    return;
  }
  if (it.type === 'compare_rule') {
    for (const [i, s] of it.statements.entries()) for (const c of s.holds) await page.click(`${st}.lx-stmt[data-i="${i}"] .lx-bucket[data-lang="${c}"]`);
    return page.click(`${st}.lx-check`);
  }
}
function end() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
