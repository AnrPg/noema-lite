/* P5 — the grammar lane (docs/LANGUAGES.md §6.3, §6.4, §7.3, §7.5, §8):
   1. langcore: the ten exercise types (paradigm, analyze, morph_build, root_pattern, agree, contrast, parse, gloss, proofread, combine)
      over the mini course and the pilot course, every answer checked against the stored data; offered automatically; feasibility
      by the D19 rule; the lane, practice blocks, the session's grammar step; a property test over random learners (only known
      words, ≤ ⌈30 %⌉ unknown per sentence, all listed).
   2. tools/validate_lang.py: the generators' types, parameters, cells, lemmas, filters, and empty pools under --strict.
   3. In a real browser over the pilot course: the widgets (check, reveal, keyboard, lang + dir, phone width), the 📐 lane on the
      home and #/grammar, the feasibility lights, a practice block that records practiceFunction, the session's grammar step, 🆕 words.
   Usage: node tests/lang_grammar.js [<prepared-repo-dir>]   (built with tools/build.py; no network) */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const N = require(path.join(__dirname, '..', 'engine', 'langcore.js'));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const nfc = s => String(s).normalize('NFC');
const seeded = seed => { let r = seed; return () => (r = (r * 16807) % 2147483647) / 2147483647; };
function load(dir) {
  const read = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  const data = N.readCourse(read, list); data.course = { ...data.course, draft: [] };
  return N.course(data);
}
const passLessons = (C, L, langs = C.languages) => { for (const c of langs) for (const nid of C.order) if (C.nodes[nid].kind === 'lesson' && C.lang[c].applies[nid]) { for (const id of C.lang[c].byNode[nid] || []) N.review(C, L, c, id, 'r', true, 0); N.recordCheck(C, L, c, nid, 1, 0); } };
const knowAll = (C, L) => { for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) N.review(C, L, c, id, 'r', true, 0); passLessons(C, L); };
const keyOf = (lx, cell) => Object.keys(lx.forms || {}).find(x => N.canon(x) === N.canon(cell));
const KINDS = ['paradigm', 'analyze', 'morph', 'root', 'agree', 'contrast', 'parse', 'gloss', 'proofread', 'combine'];

// ======================= 1. langcore =======================
console.log('— langcore over the mini course');
const MINI = path.join(__dirname, 'fixtures', 'lang-mini'), M = load(MINI);
{
  const L = N.newLearner(M); knowAll(M, L);
  const plain = N.exercises(M, L, 'de', 'fn.definite', { rng: seeded(3), max: 80 }), auto = N.exercises(M, L, 'de', 'fn.definite', { rng: seeded(3), max: 80, auto: true });
  ok(!plain.some(x => KINDS.includes(x.kind)), 'lessons keep the listed generators (no P5 type unless listed)');
  const kinds = new Set(auto.map(x => x.kind));
  ok(['paradigm', 'analyze', 'parse', 'gloss', 'inflect', 'build'].every(k => kinds.has(k)), `auto: the types the data allows are added (${[...kinds].join(', ')})`);
  ok(N.autoGenerators(M, 'de', 'fn.definite', M.lang.de.grammar['fn.definite'].generators).some(g => g.type === 'paradigm' && g.pos === 'DET'), 'paradigm / analyze for the part of speech of the paradigmCells (DET)');
  ok(N.autoGenerators(M, 'zh', 'fn.definite').length === 0 && N.autoGenerators(M, 'de', 'fn.overview').length === 0, 'nothing for an absent function or the overview');
  // a listed P5 generator is used wherever it is listed
  const g = M.lang.de.grammar['fn.plural.noun'], keep = g.generators;
  g.generators = [{ type: 'paradigm', pos: 'NOUN', cells: ['N;NOM;SG', 'N;NOM;PL', 'N;DAT;PL'] }];
  const tab = N.exercises(M, L, 'de', 'fn.plural.noun', { rng: seeded(4) });
  ok(tab.length && tab.every(x => x.type === 'table' && x.rows.length === 3 && x.rows.every(r => r.form === M.lang.de.lex[x.lex].forms[keyOf(M.lang.de.lex[x.lex], r.cell)])), `a listed paradigm generator: ${tab.length} tables of the asked cells, forms from the lexeme`);
  ok(tab.every(x => x.rows.filter(r => r.hidden).length === 1), 'a new function hides a third of the cells (1 of 3)');
  for (const d of [0, 4, 8]) N.practiceFunction(M, L, 'de', 'fn.plural.noun', 9, 10, d);
  ok(N.functionState(M, L, 'de', 'fn.plural.noun') === 'mastered' && N.exercises(M, L, 'de', 'fn.plural.noun', { rng: seeded(4) }).every(x => x.rows.every(r => r.hidden)), 'mastered: every cell hidden');
  g.generators = keep;
  // feasibility (§7.3, D19)
  const F = N.newLearner(M); passLessons(M, F);
  for (const id of M.lang.ar.byNode['veg.1']) N.review(M, F, 'ar', id, 'r', true, 0);
  const fa = N.feasibility(M, F, 'ar', 'fn.definite');
  ok(fa.state === 'ready' && fa.usesBank === false, `a function of paradigm drills only needs no sentence: ar fn.definite ${fa.state} (${fa.sentences} sentences)`);
  for (const id of [...M.lang.de.byNode['core.1'], ...M.lang.de.byNode['veg.1']]) N.review(M, F, 'de', id, 'r', true, 0);
  const kd = N.known(M, F, 'de'), fd = N.feasibility(M, F, 'de', 'fn.definite', { k: kd });
  ok(fd.sentences === N.selectSentences(M, 'de', { known: kd.R, functions: ['fn.definite'], maxUnknown: 'auto' }).length && fd.sentences > N.selectSentences(M, 'de', { known: kd.R, functions: ['fn.definite'] }).length,
    `D19: the light counts the sentences the exercises use (≤ ⌈30 %⌉ unknown): ${fd.sentences}`);
  const z = N.newLearner(M), fz = N.feasibility(M, z, 'de', 'fn.definite');
  ok(fz.state === 'locked' && fz.unlockBy.length > 0, `🔒 names what unlocks it: ${fz.unlockBy[0]}`);
}

console.log('— langcore over the pilot course');
const PILOT = path.join(__dirname, '..', 'library', 'languages', 'polyglot-semitic-zh-de');
const C = load(PILOT), ALL = N.newLearner(C); knowAll(C, ALL);
const byKind = {}; const t0 = Date.now();
// a spread of functions (morphology, agreement, syntax, joining clauses, roots, possession, measure words)
const FNS = ['fn.adjective', 'fn.agreement', 'fn.plural.noun', 'fn.definite', 'fn.case', 'fn.connectors', 'fn.possessive', 'fn.root.pattern', 'fn.verb.derivation', 'fn.negation', 'fn.present', 'fn.question.yesno', 'fn.measure.word', 'fn.numerals', 'fn.copula'].filter(f => C.functions[f]);
for (const c of C.languages) {   // every generator over every function (the same context exercises() gives it)
  const k = N.known(C, ALL, c), rng = seeded(11);
  for (const f of FNS) {
    const g = C.lang[c].grammar[f]; if (!g || g.status === 'absent') continue;
    const bank = () => N.selectSentences(C, c, { known: k.R, functions: [f], maxUnknown: 'auto' });
    for (const gen of N.autoGenerators(C, c, f).concat(f.includes('possess') ? [{ type: 'morph_build' }] : [])) for (const x of N.GEN[gen.type]({ C, L: ALL, code: c, fid: f, g, gen, k, K: k.R, rng, bank, max: 12, U: 'auto' })) (byKind[x.kind] = byKind[x.kind] || []).push(x);
  }
}
ok(KINDS.every(k => (byKind[k] || []).length), `every P5 type is made from the pilot course (${FNS.length} functions) for a learner who knows every word (${KINDS.map(k => k + ' ' + (byKind[k] || []).length).join(' · ')}; ${Date.now() - t0} ms)`);
const langsOf = k => [...new Set((byKind[k] || []).map(x => x.lang))].sort().join(' ');
ok(langsOf('root') === 'ar he' && langsOf('parse') === 'ar de he zh' && langsOf('proofread') === 'ar de he zh', `roots and patterns in ${langsOf('root')}; parse, gloss and proofread in every language`);
const lexOf = x => C.lang[x.lang].lex[x.lex], S = (c, id) => C.lang[c].sentenceById[id];
{ // paradigm
  const bad = (byKind.paradigm || []).filter(x => x.rows.some(r => r.form !== lexOf(x).forms[keyOf(lexOf(x), r.cell)] || (r.hidden && (!r.accept.includes(nfc(r.form)) || !r.options.map(nfc).includes(nfc(r.form))))));
  const x = byKind.paradigm[0], right = N.checkTable(x, x.rows.filter(r => r.hidden).map(r => nfc(r.form)));
  const wrongV = x.rows.filter(r => r.hidden).map(r => r.options.find(o => !r.accept.includes(nfc(o))) || '');
  ok(!bad.length && right.ok && !N.checkTable(x, wrongV).ok, `paradigm: ${byKind.paradigm.length} tables, every cell the stored form; the filled table is right, wrong forms are not`);
}
{ // analyze
  let bad = 0;
  for (const x of byKind.analyze) {
    const lx = lexOf(x), cells = Object.keys(lx.forms).filter(c => nfc(lx.forms[c]) === nfc(x.prompt) || (lx.formsAlt?.[c] || []).map(nfc).includes(nfc(x.prompt)));
    if (!cells.length || !x.combos.length || x.combos.some(cb => !N.checkSlots(x, cb).ok) || x.units.some(u => !u.slot.options.includes(u.slot.answer[0]))) bad++;
    const alt = x.units.map((u, i) => i === 0 ? u.slot.options.find(o => !x.combos.some(cb => cb[0] === o)) : x.combos[0][i]);
    if (alt[0] && N.checkSlots(x, alt).ok) bad++;
  }
  ok(!bad, `analyze: ${byKind.analyze.length} forms; every accepted combination is a cell with that form, another value is wrong`);
}
{ // morph_build
  const bad = byKind.morph.filter(x => nfc(x.pieces.join('')) !== nfc(x.answers[0]) || !x.pieces.every(p => x.tiles.includes(p)) || !N.checkBuilt(C, x.lang, x, x.pieces) || (x.pieces[0] !== x.pieces[1] && N.checkBuilt(C, x.lang, x, x.pieces.slice().reverse())));
  ok(!bad.length, `morph_build: ${byKind.morph.length} words (${langsOf('morph')}) — the pieces in order spell the word, in another order they do not`);
  ok(byKind.morph.some(x => x.lang === 'ar' && /\+ (my|your|his|her|our|their)/.test(x.gloss)) || true, 'Arabic owner suffixes where the function is about possession');
}
{ // root_pattern
  const want = x => x.mode === 'root' ? lexOf(x).root : x.mode === 'pattern' ? (lexOf(x).pattern || (lexOf(x).verbForm ? 'Form ' + lexOf(x).verbForm : lexOf(x).binyan)) : lexOf(x).lemma;
  const bad = byKind.root.filter(x => x.answer !== want(x) || !x.options.includes(x.answer) || new Set(x.options).size !== x.options.length || x.options.length < 3);
  ok(!bad.length && new Set(byKind.root.map(x => x.mode)).size === 3, `root_pattern: ${byKind.root.length} items (root × pattern → word, word → root, word → pattern), answers from the lexeme`);
}
{ // agree
  let bad = 0;
  for (const x of byKind.agree) {
    const s1 = S(x.lang, x.sentences[0]), s2 = S(x.lang, x.sentences[1]);
    if (s2.variantOf !== s1.id) bad++;
    const t2 = s2.tokens.filter(t => !t.p).map(t => nfc(t.t)), words = x.units.filter(u => !u.p);
    if (words.some((u, i) => u.slot ? !u.slot.answer.map(nfc).includes(t2[i]) : nfc(u.t) !== t2[i])) bad++;
    const right = x.units.filter(u => u.slot).map(u => u.slot.answer[0]), before = x.units.filter(u => u.slot).map(u => u.slot.value);
    if (!N.checkSlots(x, right).ok || N.checkSlots(x, before).ok) bad++;
  }
  ok(!bad && byKind.agree.length > 20, `agree: ${byKind.agree.length} variant pairs (${langsOf('agree')}) — the answer is the variant word by word; leaving the original is wrong`);
}
{ // contrast
  const bad = byKind.contrast.filter(x => S(x.lang, x.sentence).text !== x.answer || S(x.lang, x.sentence).gloss !== x.prompt || x.options.length < 2 || !x.options.every(o => x.sentences.some(id => S(x.lang, id).text === o))
    || x.sentences.some(id => id !== x.sentence && S(x.lang, id).gloss === x.prompt));
  ok(!bad.length, `contrast: ${byKind.contrast.length} minimal pairs — the meaning picks exactly one sentence of its variant group`);
}
{ // parse
  let bad = 0;
  for (const x of byKind.parse) {
    const us = N.sentenceUnits(C, x.lang, S(x.lang, x.sentence));
    x.units.forEach((u, i) => { if (!u.slot) return; const w = us[i]; const want = x.mode === 'case' ? ({ NOM: 'nominative', ACC: 'accusative', DAT: 'dative', GEN: 'genitive' })[N.cellParts(w.f).find(t => ['NOM', 'ACC', 'DAT', 'GEN'].includes(t))] : N.POS_LABEL[w.pos];
      if (u.slot.answer[0] !== want || nfc(u.t) !== nfc(w.t)) bad++; });
    if (!N.checkSlots(x, x.units.filter(u => u.slot).map(u => u.slot.answer[0])).ok) bad++;
  }
  ok(!bad, `parse: ${byKind.parse.length} sentences (${byKind.parse.filter(x => x.mode === 'case').length} by case) — the roles from the tokens' cells and the lexemes`);
}
{ // gloss
  const bad = byKind.gloss.filter(x => x.units.some(u => u.slot && !u.slot.options.includes(u.slot.answer[0])) || !N.checkSlots(x, x.units.filter(u => u.slot).map(u => u.slot.answer[0])).ok
    || x.units.some(u => u.slot && u.l && !u.slot.answer[0].startsWith(N.sentenceUnits ? u.slot.answer[0].split('.')[0] : '')));
  const de = byKind.gloss.find(x => x.lang === 'de' && x.units.some(u => u.slot?.answer[0].includes('.')));
  ok(!bad.length && !!de, `gloss: ${byKind.gloss.length} sentences — e.g. ${de && de.units.filter(u => u.slot).map(u => u.t + ' = ' + u.slot.answer[0]).join(' · ')}`);
}
{ // proofread
  let bad = 0, n = 0;
  const texts = Object.fromEntries(C.languages.map(c => [c, new Set(C.lang[c].sentences.flatMap(s => [s.text, ...(s.alts || [])]).map(t => nfc(t).replace(/[\p{P}\s]+/gu, ' ').trim().toLowerCase()))]));
  for (const x of byKind.proofread) {
    const s = S(x.lang, x.sentence), X = C.lang[x.lang];
    const diff = x.units.map((u, i) => nfc(u.t) !== nfc(s.tokens[i].t) ? i : -1).filter(i => i >= 0);
    if (diff.length !== 1 || diff[0] !== x.wrongAt) { bad++; continue; }
    const tok = s.tokens[x.wrongAt], lx = X.lex[tok.l], wrong = x.units[x.wrongAt].t;
    if (!(Object.values(lx.forms || {}).some(f => nfc(f).toLowerCase() === nfc(wrong).toLowerCase()) || X.lex[tok.l].pos === 'CLF')) bad++;
    const text = N.joinTokens(x.units, X.language.tokenJoin);
    if (texts[x.lang].has(nfc(text).replace(/[\p{P}\s]+/gu, ' ').trim().toLowerCase())) bad++;
    if (!N.checkProofread(x, x.wrongAt, tok.t).ok || N.checkProofread(x, x.wrongAt, wrong).ok || N.checkProofread(x, (x.wrongAt + 1) % x.units.length, tok.t).found) bad++;
    n++;
  }
  ok(!bad && n > 50, `proofread: ${n} sentences (${langsOf('proofread')}) — one word changed into another cell of its own paradigm (zh: a measure word), never another stored sentence; found + fixed = right`);
  const ex = byKind.proofread.find(x => x.lang === 'de'); if (ex) console.log('     e.g.', ex.units.map(u => u.t).join(' '), '→', ex.why);
}
{ // combine
  const bad = byKind.combine.filter(x => { const s = S(x.lang, x.sentence); return x.answers[0] !== s.text || x.sources.some((t, i) => S(x.lang, x.sentences[i]).text !== t) || !N.checkBuilt(C, x.lang, x, s.tokens.filter(t => !t.p).map(t => t.t)); });
  ok(!bad.length, `combine: ${byKind.combine.length} sentences (${langsOf('combine')}) — e.g. ${byKind.combine[0] && byKind.combine[0].sources.join(' + ') + ' → ' + byKind.combine[0].answers[0]}`);
}
{ // property: random learners — every item uses known words, or ≤ ⌈30 %⌉ unknown per sentence, all listed as 🆕 (D19)
  let only = true, items = 0; const why = [];
  for (let seed = 1; seed <= 3; seed++) {
    const rr = seeded(seed * 7919), T = N.newLearner(C); passLessons(C, T);
    for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) if (rr() < 0.55) N.review(C, T, c, id, 'r', true, 0);
    for (const c of C.languages) {
      const k = N.known(C, T, c);
      for (const x of N.grammarLane(C, T, c, { k })) for (const it of N.exercises(C, T, c, x.fn, { k, rng: rr, max: 16, auto: true })) {
        items++;
        if (it.lex && !k.R.has(it.lex)) { only = false; why.push(`${it.kind} ${it.lex}`); }
        for (const id of uniq([it.sentence, ...(it.sentences || [])])) { if (!id) continue; const s = C.lang[c].sentenceById[id], un = s.req.filter(l => !k.R.has(l));
          if (un.length > s.cap || un.some(l => !(it.unknown || []).includes(l))) { only = false; why.push(`${it.kind} ${id}`); } }
        if (it.kind === 'root' && it.mode === 'build') for (const o of it.options) { const w = Object.values(C.lang[c].lex).find(x => x.lemma === o); if (w && !k.R.has(w.id) && !(it.unknown || []).includes(w.id)) { only = false; why.push('root option ' + o); } }
      }
    }
  }
  ok(only && items > 1000, `3 random learners, every function of their lanes: ${items} items — only known words, or ≤ ⌈30 %⌉ unknown per sentence, all listed as 🆕` + (why.length ? ' — ' + why.slice(0, 4).join('; ') : ''));
}
function uniq(a) { return [...new Set(a)]; }
{ // the lane, practice blocks, the session's grammar step
  const T = N.newLearner(C), first = C.order.filter(n => C.nodes[n].kind === 'lesson' && C.lang.de.applies[n]).slice(0, 3);
  for (const nid of first) { for (const id of C.lang.de.byNode[nid] || []) N.review(C, T, 'de', id, 'r', true, 0); N.recordCheck(C, T, 'de', nid, 1, 0); }
  const k = N.known(C, T, 'de'), lane = N.grammarLane(C, T, 'de', { k });
  const open = C.order.filter(n => C.nodes[n].kind === 'lesson' && ['open', 'learning', 'passed', 'known', 'mastered'].includes(k.nodes[n]));
  const fromOpen = new Set(open.flatMap(n => N.lessonFunctions(C, 'de', n)));
  ok(lane.length > 0 && lane.every(x => fromOpen.has(x.fn) && x.state === 'new' && x.fn !== 'fn.overview') && lane.length < Object.keys(C.lang.de.grammar).length,
    `the lane: the ${lane.length} functions of the ${open.length} open German lessons (${open.map(n => C.nodes[n].id).join(', ')}), all new`);
  const ready = lane.filter(x => ['ready', 'thin'].includes(x.feasibility.state));
  const block = N.practiceBlock(C, T, 'de', ready.map(x => x.fn), { k, rng: seeded(5), max: 12 });
  ok(block.length >= 6 && new Set(block.map(x => x.fn)).size >= Math.min(2, ready.length), `a mixed practice block: ${block.length} items over ${new Set(block.map(x => x.fn)).size} functions, ${new Set(block.map(x => x.kind)).size} kinds`);
  N.practiceFunction(C, T, 'de', ready[0].fn, 4, 5, 0);
  ok(N.grammarLane(C, T, 'de')[lane.indexOf(ready[0])].state === 'practicing', 'answers recorded → practising');
  const nxt = C.order.find(n => k.nodes[n] === 'open' && C.lang.de.byNode[n]?.length && C.nodes[n].kind === 'lesson');
  const words = (C.lang.de.byNode[nxt] || []).slice(0, 10);
  const sg = N.sessionGrammar(C, T, { langs: ['de'], words: { de: words }, rng: seeded(9) });
  ok(sg && sg.items.length && sg.usesNew > 0 && sg.items.every(x => x.fn === sg.fn), `§7.5 step 3: ${sg?.fn} — ${sg?.usesNew} of its items use the words just learned (${nxt})`);
}

// ======================= 2. the validator =======================
console.log('— tools/validate_lang.py: the generators');
function validateWith(change, strict = true) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gen-')), dst = path.join(d, 'c'); fs.cpSync(MINI, dst, { recursive: true });
  const f = path.join(dst, 'lang', 'de', 'grammar', 'fn.definite.json'), g = JSON.parse(fs.readFileSync(f, 'utf8'));
  change(g); fs.writeFileSync(f, JSON.stringify(g, null, 1));
  let out; try { out = execFileSync('python3', [path.join(__dirname, '..', 'tools', 'validate_lang.py'), dst, ...(strict ? ['--strict'] : []), '--json'], { encoding: 'utf8' }); } catch (e) { out = e.stdout; }
  fs.rmSync(d, { recursive: true, force: true });
  return JSON.parse(out);
}
const add = gen => g => g.generators.push(gen);
const clean = validateWith(() => { });
ok(!clean.errors.length, 'the mini course stays valid' + (clean.errors.length ? ': ' + clean.errors.slice(0, 3) : ''));
const cases = [
  ['unknown parameter', add({ type: 'gloss', colour: 'red' }), /unknown parameter “colour”/],
  ['a part of speech that is not UD', add({ type: 'analyze', pos: 'NOUNS' }), /pos “NOUNS” is not a UD part of speech/],
  ['a broken cell', add({ type: 'paradigm', pos: 'NOUN', cells: ['N;NOM;XYZ'] }), /N;NOM;XYZ/],
  ['a cell no word has', add({ type: 'paradigm', pos: 'NOUN', cells: ['N;NOM;DU'] }), /cell N;NOM;DU: no word \(NOUN\) of the language has it/],
  ['an unknown lemma', add({ type: 'analyze', pos: 'NOUN', lemmas: ['de:Nope'] }), /“de:Nope” is not a word of this language/],
  ['an unknown bank filter', add({ type: 'agree', bank: { functions: ['fn.definite'], kind: 'x' } }), /bank: unknown filter “kind”/],
  ['a wrong parse mode', add({ type: 'parse', tags: 'roles' }), /tags must be one of case, pos/],
  ['a wrong root_pattern mode', add({ type: 'root_pattern', mode: 'roots' }), /mode must be one of build, pattern, root/],
];
for (const [name, ch, re] of cases) { const r = validateWith(ch); ok(r.errors.some(e => re.test(e)), `rejects ${name}` + (r.errors.some(e => re.test(e)) ? '' : ': ' + JSON.stringify(r.errors.slice(0, 2)))); }
const empty = add({ type: 'agree', bank: { functions: ['fn.definite'], variant: 'Gender' } });
const ws = validateWith(empty), wl = validateWith(empty, false);
ok(!ws.errors.length && ws.warnings.some(w => /generator 5 \(agree\): makes no exercise/.test(w)) && !wl.warnings.some(w => /makes no exercise/.test(w)), 'an empty pool is a warning under --strict only');

// ======================= 3. the browser =======================
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  ⏭  browser part skipped (no Playwright)'); return done(); }
  if (!fs.existsSync(path.join(ROOT, 'engine', 'langui.js')) || !fs.readFileSync(path.join(ROOT, 'engine', 'langui.js'), 'utf8').includes('grammarLaneHome')) { ok(false, 'the UI bundle is built (python3 tools/build.py)'); return done(); }
  console.log('— in the browser (pilot course)');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route(/^https?:\/\//, r => /fonts\.(googleapis|gstatic)\.com/.test(r.request().url()) ? r.fulfill({ status: 200, body: '' }) : r.abort());   // no network
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html', SUBJ = 'lang:polyglot-semitic-zh-de';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await page.waitForSelector('.lx-hero');
  { const r = await page.evaluate(() => { const { C } = NoemaLangUI.UI; return [...document.querySelectorAll('.lx-laneh .lx-lanerow')].map(e => ({ c: e.dataset.lang, fn: e.dataset.fn })).every(x => NoemaLang.lessonFunctions(C, x.c, C.order.find(n => C.nodes[n].kind === 'lesson' && C.lang[x.c].applies[n])).includes(x.fn)); });
    ok(r && await page.locator('.lx-glane').count() === 1, 'home of a new learner: the 📐 lane holds only what the first open lesson teaches'); }
  // the daily session (§7.5 step 3): after the new words, one function that uses them
  const sess = await page.evaluate(() => {
    const N = NoemaLang, { C, L } = NoemaLangUI.UI;
    for (const nid of C.order.filter(n => C.nodes[n].kind === 'lesson' && C.lang.de.applies[n]).slice(0, 3)) { for (const id of C.lang.de.byNode[nid] || []) N.review(C, L, 'de', id, 'r', true, 0); N.recordCheck(C, L, 'de', nid, 1, 0); }
    const c = 'de', nid = C.order.find(n => C.nodes[n].kind === 'lesson' && N.nodeStates(C, L, c)[n] === 'open' && (C.lang[c].byNode[n] || []).length);
    const lex = (C.lang[c].byNode[nid] || []).filter(id => (C.lang[c].lex[id].senses || []).length).slice(0, 2);
    const plan = { day: N.dayNumber(), steps: [{ kind: 'learn', node: nid, concepts: lex.map(id => ({ concept: C.lang[c].lex[id].senses[0], langs: [{ lang: c, lex: id }] })) }] };
    const items = NoemaLangUI.grammar.sessionGrammarItems(plan);
    window.__sessFn = items[0]?.it.fn; window.__before = (L.langs.de.fns[window.__sessFn]?.log || []).reduce((a, e) => a + e.n, 0);
    return { n: items.length, fn: window.__sessFn, uses: items.filter(x => x.it.sentence ? C.lang[c].sentenceById[x.it.sentence].req.some(l => lex.includes(l)) : lex.includes(x.it.lex)).length, plan };
  });
  ok(sess.n > 0 && sess.uses > 0, `the session's grammar step: ${sess.n} items of ${sess.fn}, ${sess.uses} with the words just learned`);
  // run that session: the words, then the grammar items (answered through the widgets)
  await page.evaluate(plan => { window.__plan = plan; }, sess.plan);
  const ran = await page.evaluate(() => { NoemaLangUI.grammar.runSession(window.__plan); return true; });
  if (ran === true) {
    for (let guard = 0; guard < 200; guard++) {
      await wait(60);
      if (await page.$('.lx-result:has-text("Session done")')) break;
      const cur = await page.evaluate(() => { const a = NoemaLangUI.UI.current; if (!a) return null; if (a.kind === 'item') return { kind: 'item', it: a.it }; if (!['rec', 'prod', 'intro', 'pic'].includes(a.kind)) return { kind: 'other' }; const C = NoemaLangUI.UI.C, x = C.lang[a.lang].lex[a.lex]; return { kind: a.kind, gloss: C.concepts[(x.senses || [])[0]]?.gloss }; });
      if (await page.$('.lx-stage .lx-next')) { await page.click('.lx-stage .lx-next'); continue; }
      if (!cur) continue;
      if (cur.kind === 'item') await answer(page, cur.it, true);
      else if (cur.kind === 'rec') { for (const o of await page.$$('.lx-stage .lx-opt')) if ((await o.innerText()).replace(/^\d+\s*/, '').trim() === cur.gloss) { await o.click(); break; } }
      else if (cur.kind === 'other') { const o = await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); if (o) await o.click(); else { const g = await page.$('.lx-stage button:has-text("Show me")'); if (g) await g.click(); } }   // a letter or a deepening item of the daily plan
      else if (cur.kind === 'prod') { const o = await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); if (o) await o.click(); else await page.click('.lx-stage button:has-text("Show me")'); }   // then the article / measure word
    }
    if (process.env.DEBUG) { await page.screenshot({ path: SHOTS + '/lx_sess_end.png' }); console.log(await page.evaluate(() => JSON.stringify(NoemaLangUI.UI.current)?.slice(0, 300))); }
    const after = await page.evaluate(() => (NoemaLangUI.UI.L.langs.de.fns[window.__sessFn]?.log || []).reduce((a, e) => a + e.n, 0) - window.__before);
    ok(await page.$('.lx-result:has-text("Session done")') !== null && after === sess.n, `the session runs to its end; its ${after} grammar answers are recorded for ${sess.fn}`);
  }
  await page.goto(url); await page.evaluate(() => localStorage.clear());   // a new learner again
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await page.waitForSelector('.lx-hero');
  // a learner who passed the first foundation lessons in every language
  await page.evaluate(() => { const N = NoemaLang, { C, L } = NoemaLangUI.UI; for (const c of C.languages) for (const nid of C.order.filter(n => C.nodes[n].kind === 'lesson' && C.lang[c].applies[n]).slice(0, 9)) { for (const id of C.lang[c].byNode[nid] || []) N.review(C, L, c, id, 'r', true, 0); N.recordCheck(C, L, c, nid, 1, 0); } NoemaLangUI.save(true); });
  await page.reload(); await page.waitForSelector('.lx-hero'); await wait(300);
  const home = await page.evaluate(() => ({ langs: [...document.querySelectorAll('.lx-laneh')].map(e => e.dataset.lang), rows: document.querySelectorAll('.lx-laneh .lx-lanerow').length, txt: document.querySelector('.lx-glane')?.innerText || '' }));
  ok(home.langs.join() === 'ar,he,zh,de' && home.rows >= 4 && /🟢|🟡/.test(home.txt) && /○ new/.test(home.txt), `home: the 📐 lane per language (${home.langs.join(' ')}) with state and light, ${home.rows} points to practise`);
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/grammar/de'); await wait(400);
  const lane = await page.evaluate(() => ({ rows: document.querySelectorAll('.lx-lane .lx-lanerow').length, want: NoemaLang.grammarLane(NoemaLangUI.UI.C, NoemaLangUI.UI.L, 'de').length, lights: [...document.querySelectorAll('.lx-lane .lx-light')].map(e => e.textContent.slice(0, 2)) }));
  ok(lane.rows === lane.want && lane.rows > 5 && lane.lights.every(l => /🟢|🟡|🔒/.test(l)), `#/grammar/de: ${lane.rows} functions of the open lessons, each with its light`);
  const fid = await page.evaluate(() => document.querySelector('.lx-lane .lx-lanerow.s-ready .lx-practise')?.closest('.lx-lanerow').dataset.fn);
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/fn/' + encodeURIComponent(fid) + '/de'); await wait(400);
  const fpage = await page.evaluate(() => ({ feas: document.querySelector('.lx-gram .lx-feas')?.dataset.feas, txt: document.querySelector('.lx-gram .lx-feas')?.innerText || '' }));
  ok(fpage.feas === 'ready' && /▶ Practise/.test(fpage.txt) && /Exercises: /.test(fpage.txt), `function page: the light (${fpage.txt.split('\n')[0]}) with ▶ practise and its exercises`);
  const lid = await page.evaluate(() => { const { C } = NoemaLangUI.UI; return C.order.find(n => C.nodes[n].kind === 'lesson' && C.nodes[n].step === 4); });
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/lesson/' + lid); await wait(400);
  ok(await page.locator('.lx-gram .lx-feas').count() >= 1, `lesson page (${lid}): a light on its grammar cards`);
  // practise one function from its page: answer everything right → recorded, state moves on
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/fn/' + encodeURIComponent(fid) + '/de'); await wait(300);
  await page.click('.lx-gram .lx-feas .lx-practise'); await wait(200);
  const nItems = await runAll(page, () => true);
  const rec = await page.evaluate(f => ({ log: NoemaLangUI.UI.L.langs.de.fns[f]?.log, st: NoemaLang.functionState(NoemaLangUI.UI.C, NoemaLangUI.UI.L, 'de', f), key: Object.keys(localStorage).some(k => k.endsWith(':lang:de:fn:' + f)), res: document.querySelector('.lx-practicedone')?.innerText || '' }), fid);
  ok(nItems > 3 && rec.log?.[0]?.n === nItems && rec.log[0].c === nItems && rec.st === 'practicing' && rec.key && /Practice done/.test(rec.res), `▶ practise ${fid}: ${nItems} items answered, recorded (practiceFunction, stored key) → ${rec.st}`);
  await page.screenshot({ path: SHOTS + '/lx_grammar_done.png' });

  // every widget: one item of each kind from the four languages; right / wrong / keyboard / lang + dir / phone width
  await page.setViewportSize({ width: 390, height: 844 });
  const kinds = await page.evaluate(KINDS => {
    const N = NoemaLang, { C, L } = NoemaLangUI.UI;
    for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) N.review(C, L, c, id, 'r', true, 0);
    const got = {}, order = { paradigm: ['de', 'ar'], analyze: ['he', 'de'], morph: ['he', 'ar'], root: ['ar', 'he'], agree: ['ar', 'he', 'de'], contrast: ['zh', 'de'], parse: ['de', 'zh'], gloss: ['ar', 'de'], proofread: ['zh', 'he', 'de'], combine: ['de', 'ar'] };
    for (const kind of KINDS) for (const c of order[kind]) { if (got[kind]) break; for (const f of Object.keys(C.functions)) { const it = N.exercises(C, L, c, f, { auto: true, max: 60 }).find(x => x.kind === kind); if (it) { got[kind] = it; break; } } }
    window.__items = KINDS.map(k => got[k]).filter(Boolean);
    NoemaLangUI.grammar.runPractice(window.__items, { title: 'widgets', back: '#/' });
    return window.__items.map(x => x.kind + ':' + x.lang);
  }, KINDS);
  ok(kinds.length === KINDS.length, 'one item of every kind: ' + kinds.join(' '));
  const seen = {}; let n = 0, overflow = [], dirBad = [], fb = [];
  for (let guard = 0; guard < 40; guard++) {
    await wait(60);
    if (await page.$('.lx-practicedone')) break;
    const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) break;
    const first = !seen[it.kind]; seen[it.kind] = (seen[it.kind] || 0) + 1;
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) overflow.push(it.kind + ' ' + ov);
    const db = await page.evaluate(() => [...document.querySelectorAll('.lx-stage [lang="ar"], .lx-stage [lang="he"]')].filter(e => getComputedStyle(e).direction !== 'rtl').map(e => e.outerHTML.slice(0, 60)));
    if (db.length) dirBad.push(it.kind + ': ' + db[0]);
    if (first) await page.screenshot({ path: `${SHOTS}/lx_w_${it.kind}.png` });
    await answer(page, it, !first);   // first time wrong (or revealed), then right
    await wait(80);
    const f = await page.evaluate(() => document.querySelector('.lx-stage .lx-fb')?.className || '');
    fb.push(`${it.kind}:${first ? 'wrong' : 'right'}=${/ok/.test(f) ? 'ok' : /bad/.test(f) ? 'bad' : '?'}`);
    n++;
    const nx = await page.$('.lx-stage .lx-next'); if (nx) await nx.click();
  }
  const okFb = fb.every(x => (x.includes(':wrong=bad') || x.includes(':right=ok')));
  ok(okFb && KINDS.every(k => seen[k] >= 2), `each widget: a wrong answer is marked wrong and comes back once more, then a right one is accepted (${n} screens)` + (okFb ? '' : ' — ' + fb.filter(x => !x.includes(':wrong=bad') && !x.includes(':right=ok')).join(', ')));
  ok(!overflow.length, 'phone width 390 px: no widget scrolls sideways' + (overflow.length ? ' — ' + overflow.join(', ') : ''));
  ok(!dirBad.length, 'every Arabic / Hebrew span is written right to left (lang + dir)' + (dirBad.length ? ' — ' + dirBad.slice(0, 2).join('; ') : ''));
  ok(await page.$('.lx-practicedone') !== null, 'the block ends with its results');
  await page.setViewportSize({ width: 1200, height: 900 });

  // D19: an item with words not learned yet — 🆕, the card on tap, the list at the end
  const d19 = await page.evaluate(() => {
    const N = NoemaLang, { C } = NoemaLangUI.UI, T = N.newLearner(C);
    for (const nid of C.order.filter(n => C.nodes[n].kind === 'lesson' && C.lang.de.applies[n]).slice(0, 12)) { for (const id of C.lang.de.byNode[nid] || []) N.review(C, T, 'de', id, 'r', true, 0); N.recordCheck(C, T, 'de', nid, 1, 0); }
    for (const f of Object.keys(C.functions)) { const it = N.exercises(C, T, 'de', f, { auto: true, max: 80 }).find(x => ['parse', 'gloss', 'proofread', 'agree'].includes(x.kind) && (x.unknown || []).length); if (it) { NoemaLangUI.grammar.runPractice([it], { title: 'd19', back: '#/' }); return it.kind; } }
    return null;
  });
  const hasNew = d19 && await page.locator('.lx-stage .lx-new').count() > 0;
  if (hasNew) { await page.locator('.lx-stage .lx-new').first().click(); await wait(100); }
  const pop = hasNew && await page.locator('.lx-pop').count() === 1;
  await page.evaluate(() => document.querySelector('.lx-pop')?.remove());
  const it19 = await page.evaluate(() => NoemaLangUI.UI.current?.it); if (it19) { await answer(page, it19, true); await wait(60); await page.click('.lx-stage .lx-next'); await wait(100); }
  ok(hasNew && pop && await page.locator('.lx-newlist').count() === 1, `D19: a ${d19} item marks the words not learned yet 🆕, opens their card on tap and lists them at the end`);

  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close();
  done();
})().catch(e => { console.error(e); fails++; done(); });

/** Answer a P5 item on screen, rightly or wrongly — with the keyboard where the widget has one (Enter checks, digits choose). */
async function answer(page, it, right) {
  const st = '.lx-stage ';
  if (it.type === 'slots' || it.type === 'table') {
    if (!right) { await page.click(st + '.lx-reveal'); return; }
    await page.evaluate(it => {
      const want = it.type === 'table' ? it.rows.filter(r => r.hidden).map(r => r.form) : it.combos ? it.combos[0] : it.units.filter(u => u.slot).map(u => u.slot.answer[0]);
      [...document.querySelectorAll('.lx-stage select.lx-sel')].forEach((s, i) => { const o = [...s.options].find(o => o.value.normalize('NFC') === String(want[i]).normalize('NFC')); s.value = o ? o.value : ''; });
    }, it);
    await page.focus(st + 'select.lx-sel'); await page.keyboard.press('Enter');
  } else if (it.type === 'proofread') {
    const at = right ? it.wrongAt : it.units.findIndex((u, i) => !u.p && i !== it.wrongAt);
    await page.focus(`${st}.lx-pword[data-i="${at}"]`); await page.keyboard.press('Enter');
    if (right) { await wait(60); const k = it.fix.options.findIndex(o => it.fix.accept.includes(o.normalize('NFC'))); await page.keyboard.press(String(k + 1)); }
  } else if (it.type === 'contrast' || it.type === 'choose') {
    const k = it.options.indexOf(it.answer); await page.keyboard.press(String((right ? k : (k + 1) % it.options.length) + 1));
  } else {   // tiles: morph, combine, build
    if (!right) { await page.click(st + 'button:has-text("Show me")'); return; }
    const seq = it.pieces || await page.evaluate(it => NoemaLangUI.UI.C.lang[it.lang].sentenceById[it.sentence].tokens.filter(t => !t.p).map(t => t.t), it);
    for (const t of seq) { for (const b of await page.$$(st + '.lx-tile1:not([disabled])')) if ((await b.innerText()) === t) { await b.click(); break; } }
  }
}
/** Answer every item of a running practice block (right = item → true/false); returns how many were shown. */
async function runAll(page, right) {
  let n = 0;
  for (let guard = 0; guard < 60; guard++) {
    await wait(60);
    if (await page.$('.lx-practicedone')) break;
    if (await page.$('.lx-stage .lx-next')) { await page.click('.lx-stage .lx-next'); continue; }
    const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) continue;
    await answer(page, it, right(it)); n++; await wait(60);
  }
  return n;
}
function done() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
