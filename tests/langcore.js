/* engine/langcore.js — unit tests over the mini course (docs/LANGUAGES.md §5, §7). Usage: node tests/langcore.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
const MINI = path.join(__dirname, 'fixtures', 'lang-mini');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } };

// ---------- shared vectors (the Python twin is tools/langlib.py) ----------
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lang-vectors.json'), 'utf8'));
const vbad = (arr, f) => arr.filter(c => !f(c));
let b;
b = vbad(V.canon, c => N.canon(c[0]) === c[1]); ok(!b.length, `canon: ${V.canon.length} vectors ${b.length ? JSON.stringify(b) : ''}`);
b = vbad(V.strip, c => N.stripMarks(c[0], c[1]) === c[2].normalize('NFC')); ok(!b.length, `stripMarks: ${V.strip.length} vectors ${b.length ? JSON.stringify(b) : ''}`);
b = vbad(V.pinyinValid, c => (N.pinyinSyllableErrors(c[0]).length === 0) === c[1]); ok(!b.length, `pinyin syllables: ${V.pinyinValid.length} vectors ${b.length ? JSON.stringify(b.map(c => [c[0], N.pinyinSyllableErrors(c[0])])) : ''}`);
b = vbad(V.pinyinNumbers, c => N.pinyinNumbersToMarks(c[0]) === c[1] && N.pinyinMarksToNumbers(c[1]) === c[2]); ok(!b.length, `pinyin numbers ↔ marks: ${V.pinyinNumbers.length} vectors ${b.length ? JSON.stringify(b) : ''}`);
b = vbad(V.join, c => N.joinTokens(c[0], c[1]) === c[2]); ok(!b.length, `joinTokens: ${V.join.length} vectors ${b.length ? JSON.stringify(b) : ''}`);

// ---------- the course ----------
const read = rel => { const p = path.join(MINI, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const list = rel => { const p = path.join(MINI, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
const C = N.course(N.readCourse(read, list));
const nLex = c => Object.keys(C.lang[c].lex).length;
ok(same([nLex('de'), nLex('ar'), nLex('he'), nLex('zh')], [11, 9, 10, 11]) && same(C.order, ['core.1', 'veg.1', 'veg.2']), `course read: words de 11 · ar 9 · he 10 · zh 11, nodes in order ${C.order.join(' → ')}`);
ok(!!C.lang.ar.absent['det.def'] && !!C.lang.zh.absent['det.indef'] && C.lang.de.byConcept['det.def'][0] === 'de:der', 'absent concepts and words per concept are indexed');

// ---------- states and gating ----------
let L = N.newLearner(C);
const ns = c => N.nodeStates(C, L, c);
ok(C.languages.every(c => same(ns(c), { 'core.1': 'open', 'veg.1': 'locked', 'veg.2': 'locked' })), 'a new learner: core.1 open, the rest locked — in every language');
ok(N.itemState(C, L, 'de', 'de:essen', ns('de')) === 'ready' && N.itemState(C, L, 'de', 'de:Karotte', ns('de')) === 'locked', 'words of an open node are ready, of a locked node locked');
const learn = (c, id, track, days) => days.forEach(d => N.review(C, L, c, id, track, true, d));
const learnNode = (c, nid, upto = 'known_p') => { for (const id of C.lang[c].byNode[nid]) { learn(c, id, 'r', [0, 1]); if (upto !== 'known_r') learn(c, id, 'p', [0, 1]); } };
N.introduce(C, L, 'de', 'de:essen', 0);
ok(N.itemState(C, L, 'de', 'de:essen', ns('de')) === 'seen' && ns('de')['core.1'] === 'learning', 'introduced → seen; the node is now learning');
N.review(C, L, 'de', 'de:essen', 'r', true, 0);
ok(N.itemState(C, L, 'de', 'de:essen', ns('de')) === 'learning', 'one correct recognition → learning');
N.review(C, L, 'de', 'de:essen', 'r', true, 1);
ok(N.itemState(C, L, 'de', 'de:essen', ns('de')) === 'known_r', 'two correct, interval ≥ 3 days → known_r');
learn('de', 'de:essen', 'p', [1, 2]);
ok(N.itemState(C, L, 'de', 'de:essen', ns('de')) === 'known_p', '…and in production → known_p');
// 90 % known_r and 70 % known_p open the next node — in that language only
const core = C.lang.de.byNode['core.1'];
core.forEach(id => learn('de', id, 'r', [0, 1]));
core.slice(0, 4).forEach(id => learn('de', id, 'p', [0, 1]));
ok(ns('de')['core.1'] === 'learning' && ns('de')['veg.1'] === 'locked', `4/6 words known in production (67 %) → still learning (${ns('de')['core.1']})`);
learn('de', core[4], 'p', [0, 1]);
ok(ns('de')['core.1'] === 'known' && ns('de')['veg.1'] === 'open', '5/6 (83 %) → known, and Vegetables I opens in German');
ok(ns('he')['veg.1'] === 'locked' && ns('ar')['veg.1'] === 'locked', '…but stays locked in Hebrew and Arabic (gating per language)');
N.review(C, L, 'de', core[0], 'p', false, 5);
ok(N.itemState(C, L, 'de', core[0], ns('de')) === 'known_r', 'a wrong production answer → back to known_r');
N.review(C, L, 'de', core[1], 'r', false, 5);
ok(N.itemState(C, L, 'de', core[1], ns('de')) === 'learning', 'a wrong recognition answer → back to learning');
ok(ns('de')['core.1'] === 'learning' && ns('de')['veg.1'] === 'locked', 'the node falls back and its successor locks again (states are always derived)');
learn('de', core[0], 'p', [5, 6]); learn('de', core[1], 'r', [5, 6]);
ok(ns('de')['core.1'] === 'known', 'relearned → known again');
// mastered
const M = N.newLearner(C);
for (const id of C.lang.he.byNode['core.1']) { [0, 1, 4, 12, 32].forEach(d => N.review(C, M, 'he', id, 'r', true, d)); [0, 1, 4, 12, 32].forEach(d => N.review(C, M, 'he', id, 'p', true, d)); }
ok(N.nodeStates(C, M, 'he')['core.1'] === 'mastered' && N.itemState(C, M, 'he', 'he:et', N.nodeStates(C, M, 'he')) === 'mastered', 'five correct reviews on both tracks → mastered (interval ≥ 21 days)');
const D = N.newLearner(C, { depth: { de: 1 } });
ok(N.nodeStates(C, D, 'de')['veg.2'] === 'skipped' && N.nodeStates(C, D, 'he')['veg.2'] === 'locked', 'depth 1 in German skips the tier-2 node there only');
ok(N.conceptState(C, L, 'ar', 'det.def') === 'absent' && N.conceptState(C, L, 'de', 'verb.eat') === 'known_p', 'concept state for the flag dot (absent / the best state of its words)');

// ---------- known sets, bank, feasibility ----------
let k = N.known(C, L, 'de');
ok(k.R.has('de:essen') && !k.R.has('de:Karotte') && k.P.has('de:essen'), 'known sets: R and P');
ok(N.selectSentences(C, 'de', { known: k.R }).length === 0, 'no sentence before a single vegetable is known');
learn('de', 'de:Karotte', 'r', [6]);
k = N.known(C, L, 'de');
const s1 = N.selectSentences(C, 'de', { known: k.R }).map(s => s.id);
ok(same(s1, ['de.s.001', 'de.s.007']), `one vegetable in learning → exactly its sentences: ${s1}`);
const s2 = N.selectSentences(C, 'de', { known: k.R, maxUnknown: 1 });
ok(s2.every(s => s.unknown.length <= 1) && s2.some(s => same(s.unknown, ['de:Zwiebel'])), 'maxUnknown 1 adds sentences with one new word, which is reported');
ok(N.selectSentences(C, 'de', { known: k.P }).length === 0, 'production uses the P set (the carrot is not known_r yet)');
let f = N.feasibility(C, L, 'de', 'fn.definite');
ok(f.state === 'locked' && f.needs.NOUN[0] === 1 && f.unlockBy[0] === 'veg.1', `fn.definite in German: locked (1/3 nouns), unlock by ${f.unlockBy.join(', ')}`);
learnNode('de', 'veg.1', 'known_r');
k = N.known(C, L, 'de');
f = N.feasibility(C, L, 'de', 'fn.definite', { k });
ok(f.state === 'thin' && f.sentences === 4, `after Vegetables I: thin (${f.sentences} sentences < 12)`);
ok(N.feasibility(C, L, 'de', 'fn.definite', { k, minSentences: 4 }).state === 'ready', '…ready when the threshold is met');
ok(N.feasibility(C, L, 'zh', 'fn.plural.noun').state === 'absent', 'a function absent in Chinese is reported as absent');
// property: whatever the learner knows, the selected sentences only use known words; open nodes have done prerequisites
let prop = true, gating = true;
for (let seed = 1; seed <= 200; seed++) {
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const T = N.newLearner(C);
  for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) if (rnd() < 0.5) { const n = 1 + Math.floor(rnd() * 3); for (let d = 0; d < n; d++) N.review(C, T, c, id, rnd() < 0.5 ? 'r' : 'p', rnd() < 0.8, d * 3); }
  for (const c of C.languages) {
    const kk = N.known(C, T, c);
    for (const s of N.selectSentences(C, c, { known: kk.R })) if (!s.req.every(l => kk.R.has(l))) prop = false;
    for (const nid of C.order) if (kk.nodes[nid] !== 'locked' && kk.nodes[nid] !== 'skipped' && (C.nodes[nid].prereqs || []).some(p => !['known', 'mastered', 'skipped'].includes(kk.nodes[p]))) gating = false;
  }
}
ok(prop, '200 random learners × 4 languages: every selected sentence uses only known words');
ok(gating, '200 random learners × 4 languages: no node is open before its prerequisites are known');

// ---------- function states ----------
const F = N.newLearner(C);
const fsx = () => N.functionState(C, F, 'de', 'fn.definite');
ok(fsx() === 'new', 'function: new');
N.practiceFunction(C, F, 'de', 'fn.definite', 4, 6, 10); ok(fsx() === 'practicing', 'after one block: practicing');
N.practiceFunction(C, F, 'de', 'fn.definite', 6, 6, 11); ok(fsx() === 'solid', 'two days, 10/12 = 83 % → solid');
N.practiceFunction(C, F, 'de', 'fn.definite', 6, 6, 14); ok(fsx() === 'solid', 'three days but only 4 days apart → still solid');
N.practiceFunction(C, F, 'de', 'fn.definite', 6, 6, 18); ok(fsx() === 'mastered', 'three good days spanning ≥ 7 days → mastered');
N.practiceFunction(C, F, 'de', 'fn.definite', 1, 6, 19); ok(fsx() === 'practicing', 'a bad day → practicing again');

// ---------- reading text ----------
const words = toks => toks.map(t => t.t);
let a = N.analyze(C, 'de', 'Sie isst die Tomate.', k.R);
ok(same(a.unknown, ['Tomate']) && same(words(a.tokens), ['Sie', 'isst', 'die', 'Tomate', '.']), 'German: tokens, capital at the start, unknown word reported');
a = N.analyze(C, 'de', 'Er isst die Gurke.', k.R);
ok(!a.unknown.length && !a.unlearned.length, 'German: a sentence of known words passes');
a = N.analyze(C, 'de', 'Er isst den Kürbis.', k.R);
ok(!a.unknown.length && same(a.unlearned, ['Kürbis']), 'German: a course word not learned yet is “unlearned”, not unknown');
const he = N.tokenize(C, 'he', 'הוא אוכל את הגזר ואת הבצל.');
ok(he.filter(t => !t.p).every(t => !t.unknown) && he[4].parts?.map(p => p.matches[0].l).join('+') === 'he:ve+he:et', 'Hebrew without vowel marks: every word found; ואת = וְ + אֶת');
const ar = N.tokenize(C, 'ar', 'هو يأكل الجزرة والبصلة.');
ok(ar.filter(t => !t.p).every(t => !t.unknown) && ar[3].parts?.map(p => p.matches[0].l).join('+') === 'ar:wa+ar:basal', 'Arabic without vowel marks: every word found; والبصلة = وَ + الْبَصَلَة');
ok(same(words(N.tokenize(C, 'zh', '他吃胡萝卜和洋葱。')), ['他', '吃', '胡萝卜', '和', '洋葱', '。']), 'Chinese is segmented by the course words (longest match)');
const zu = N.tokenize(C, 'zh', '他吃苹果。');
ok(same(zu.filter(t => t.unknown).map(t => t.t), ['苹', '果']), 'Chinese: characters outside the course are reported one by one');
{ const d = N.readCourse(read, list); d.langs.he.lexicon['veg.1'].lexemes[0].plene = { 'N;SG;INDF': 'גזר', 'N;SG;DEF': 'הגזר' };
  d.langs.he.lexicon['veg.1'].lexemes[1].plene = { 'N;SG;INDF': 'בצאל' };   // an invented full spelling, only to test the index
  const C2 = N.course(d); ok(N.lookup(C2, 'he', 'בצאל').matches[0]?.l === 'he:batsal', 'a full (plene) spelling given by the lexeme is found'); }
// every bank sentence reads back to the words it is annotated with
let rt = []; for (const c of C.languages) for (const s of C.lang[c].sentences) {
  const flat = []; const walk = ks => ks.forEach(t => t.parts ? walk(t.parts) : !t.p && flat.push(t.l)); walk(s.tokens);
  const got = []; for (const t of N.tokenize(C, c, s.text)) { if (t.p) continue; if (t.parts) t.parts.forEach(p => got.push(p.matches.map(m => m.l))); else got.push(t.matches.map(m => m.l)); }
  if (got.length !== flat.length || got.some((alts, i) => !alts.includes(flat[i]))) rt.push(s.id);
}
ok(!rt.length, `all ${C.languages.reduce((n, c) => n + C.lang[c].sentences.length, 0)} bank sentences tokenize back to their annotated words` + (rt.length ? ' — not: ' + rt : ''));

// ---------- the daily session ----------
const P0 = N.newLearner(C);
let plan = N.planSession(C, P0, { day: 0, minutes: 30 });
const learnStep = plan.steps.find(s => s.kind === 'learn');
ok(plan.steps.length === 1 && learnStep && learnStep.node === 'core.1', 'a new learner: one step — learn core.1');
const he1 = learnStep.concepts.find(x => x.concept === 'verb.eat');
ok(same(he1.langs.map(x => x.lang), ['ar', 'he', 'zh', 'de']), 'the same concept is learned in every language one after the other');
ok(!learnStep.concepts.find(x => x.concept === 'det.def').langs.some(x => ['ar', 'he', 'zh'].includes(x.lang)), 'absent concepts are skipped in the languages without a word');
ok(learnStep.concepts.some(x => x.concept === 'he:et') && learnStep.concepts.some(x => x.concept === 'zh:ge'), 'words without a shared concept (אֶת, 个) are in the batch too');
for (const st of learnStep.concepts) for (const e of st.langs) { N.introduce(C, P0, e.lang, e.lex, 0); N.review(C, P0, e.lang, e.lex, 'r', true, 0); }
plan = N.planSession(C, P0, { day: 1, minutes: 30 });
const rv = plan.steps.find(s => s.kind === 'review');
ok(rv && rv.items.length === learnStep.concepts.reduce((n, c) => n + c.langs.length, 0), `next day: ${rv?.items.length} reviews due`);
const conceptOf = it => (C.lang[it.lang].lex[it.lex].senses || [])[0] || it.lex;
const runs = rv.items.map(conceptOf).filter((c, i, arr) => i === 0 || arr[i - 1] !== c);
ok(new Set(runs).size === runs.length, 'reviews are grouped by concept across the languages');
const short = N.planSession(C, P0, { day: 1, minutes: 1 });
ok(short.seconds <= 60 && short.steps.every(s => s.kind === 'review'), `a 1-minute session fits the budget (${short.seconds} s)`);
// with vegetables known in German, a grammar block is planned
plan = N.planSession(C, L, { day: 7, minutes: 30, languages: ['de'] });
ok(plan.steps.some(s => s.kind === 'grammar' && s.lang === 'de'), 'when a function is trainable, the session has a grammar block');

// ---------- storage ----------
const kv = N.toKV(C, L);
ok(Object.keys(kv).every(k => k === 'settings' || /^lang:(de|ar|he|zh):(node|fn):/.test(k)) && !!kv['lang:de:node:core.1'], `stored per (language, node): ${Object.keys(kv).filter(k => k !== 'settings').join(', ')}`);
const back = N.fromKV(C, JSON.parse(JSON.stringify(kv)));
ok(same(back.langs.de, L.langs.de) && same(N.nodeStates(C, back, 'de'), N.nodeStates(C, L, 'de')), 'round trip through storage keeps every state');
ok(N.dayNumber(new Date(2026, 9, 7, 23, 59)) - N.dayNumber(new Date(2026, 9, 7, 0, 1)) === 0 && N.dayNumber(new Date(2026, 9, 8, 0, 1)) - N.dayNumber(new Date(2026, 9, 7, 23, 59)) === 1, 'days change at local midnight');
let threw = false; try { N.review(C, L, 'de', 'de:Tomate', 'r', true, 0); } catch (e) { threw = /unknown word/.test(e.message); }
ok(threw, 'a review of an unknown word is refused');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
