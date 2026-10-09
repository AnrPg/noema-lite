/* P4 — scripts and input (docs/LANGUAGES.md §4.9, §5.5, §6.1, §7.2, §8).
   1 · langcore (Node): the script modules, positional forms, the script stage and its storage, every generator (answers from stored
       data, property test over random learners), vowel-mark fading, tone sandhi, pinyin input, typed answers, stroke matching, the
       tokenizer fixes (Hebrew prefix spellings, Arabic لِلْـ, Chinese splits of the bank).
   2 · the validator (Python, on copies): the script checks and the prefix spellings.
   3 · the app (Playwright, the built pilot course, a phone 390 px wide): the 🔤 lane for ar, he, zh, de, every widget answered right
       and wrong (mouse and keyboard), keyboards, pinyin input, umlaut buttons, fading, the session step, RTL, no sideways scrolling.
   Usage: node tests/lang_script.js [<prepared-repo-dir>]   (built with tools/build.py; no network: fonts are stubbed) */
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE;
function load(dir) {
  const read = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  const data = N.readCourse(read, list); data.course = { ...data.course, draft: [] }; return data;
}
const rng0 = seed => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

console.log('— 1 · langcore');
const data = load(path.join(ROOT, 'library', 'languages', COURSE)), C = N.course(data);
const ar = N.scriptModule(C, 'ar'), he = N.scriptModule(C, 'he'), zh = N.scriptModule(C, 'zh');
ok(ar?.kind === 'letters' && ar.order.length === 47 && ar.groups.length === 8, `Arabic module: ${ar?.order.length} letters and marks in ${ar?.groups.length} groups`);
ok(he?.kind === 'letters' && he.order.length === 44 && he.groups.length === 7, `Hebrew module: ${he?.order.length} letters and marks in ${he?.groups.length} groups`);
const hanInWords = new Set(Object.values(C.lang.zh.lex).flatMap(x => [...x.lemma].filter(N.isHan)));
ok(zh?.kind === 'chars' && [...hanInWords].every(ch => zh.items[ch]) && zh.order.length === hanInWords.size, `Chinese module: every one of the ${hanInWords.size} characters of the words`);
ok(N.scriptModule(C, 'de') === null, 'German: no script module (Latin alphabet)');
ok(['ا', 'د', 'ذ', 'ر', 'ز', 'و'].every(l => ar.items[l].joins === 'right') && ar.items['ء'].joins === 'none' && ar.items['ب'].joins === 'dual' && ar.items['ى'].joins === 'right', 'Arabic joining from Unicode: the six non-connectors, hamza on its own, alif maqṣūra final-only');
const pos = t => N.glyphPositions(C, 'ar', t).filter(x => !x.sep).map(x => x.pos).join(' ');
ok(pos('كِتَاب') === 'initial medial final isolated' && pos('بيت') === 'initial medial final' && pos('دار') === 'isolated isolated isolated' && pos('مُعَلِّم') === 'initial medial medial final',
  'positional forms: كتاب, بيت, دار, معلم (' + [pos('كِتَاب'), pos('دار')].join(' / ') + ')');
ok(N.glyphPositions(C, 'ar', 'لا')[0].lamAlif === true && N.glyphForm(C, 'ar', 'ب', 'medial') === '‍ب‍' && N.glyphForm(C, 'ar', 'ر', 'initial') === null, 'lām-alif; the ZWJ forms; ر has no initial form');
ok(N.glyphPositions(C, 'he', 'שָׁלוֹם').map(x => x.letter + ':' + x.pos).join(' ') === 'שׁ:regular ל:regular ו:regular ם:final' && N.letterClusters(C, 'he', 'כּוֹס')[0].letter === 'כּ' && N.letterClusters(C, 'he', 'נֶכֶד')[1].letter === 'כ',
  'Hebrew: shin with its dot, the final mem, kaf with dagesh vs khaf');
ok(N.letterClusters(C, 'he', 'שָׁלוֹם')[0].marks.join('') === 'ָ' && N.letterClusters(C, 'ar', 'مُعَلِّم')[2].marks.slice().sort().join('') === ['ِ', 'ّ'].sort().join(''), 'letter clusters: the shin dot is part of the letter; šadda + kasra on one letter');

// the script stage
const L = N.newLearner(C);
let st = N.scriptState(C, L, 'ar');
ok(st.stage === 0 && st.open.join() === 'ar.g1' && !st.complete && N.needsTranslit(C, L, 'ar'), 'a new learner: Arabic stage 0, the first group open, transliteration shown');
for (const key of ar.groups[0].items) { N.reviewGlyph(C, L, 'ar', key, 'r', 'good', 100); N.reviewGlyph(C, L, 'ar', key, 'r', 'good', 101); }
st = N.scriptState(C, L, 'ar');
ok(st.stage === 1 && st.open.includes('ar.g2') && st.groups[0].state === 'known' && st.known === 6, `the first group known → stage 1, the next group opens (${st.open})`);
for (const key of ar.order) for (const t of ['r', 'p']) { N.reviewGlyph(C, L, 'ar', key, t, 'good', 100); N.reviewGlyph(C, L, 'ar', key, t, 'good', 101); }
ok(N.scriptState(C, L, 'ar').complete && !N.needsTranslit(C, L, 'ar'), 'every letter known → the stage is complete, the transliteration is no longer forced');
const kv = N.toKV(C, L), L2 = N.fromKV(C, JSON.parse(JSON.stringify(kv)));
ok(kv['lang:ar:script'] && Object.keys(kv['lang:ar:script'].items).length === 47 && N.scriptState(C, L2, 'ar').complete, 'stored in lang:ar:script and read back (toKV / fromKV)');
let threw = false; try { N.reviewGlyph(C, L, 'ar', 'Q', 'r', true, 1); } catch (e) { threw = true; }
ok(threw, 'a review of a letter the module does not have is refused');
// zh: a character is known through its words
const Lz = N.newLearner(C), w = C.lang.zh.byConcept['pron.i'][0];
N.review(C, Lz, 'zh', w, 'r', 'good', 10); N.review(C, Lz, 'zh', w, 'r', 'good', 11);
ok(N.scriptState(C, Lz, 'zh').items['我'] === 'known_r', 'Chinese: 我 known through the word 我');

// generators: every item from stored data
function checkItem(code, it) {
  const X = C.lang[code], M = N.scriptModule(C, code), bad = [];
  if (it.options) { if (!it.options.includes(it.answer)) bad.push('answer not among the options'); if (new Set(it.options).size !== it.options.length) bad.push('options repeat'); if (it.options.length < 2) bad.push('fewer than 2 options'); }
  if (it.type === 'transliterate') {
    if (it.kind === 'letter' && it.answer !== M.items[it.glyph].translit) bad.push('letter translit');
    if (it.kind === 'letter_rev' && (it.answer !== it.glyph || it.options.filter(o => M.items[o].translit === M.items[it.glyph].translit).length !== 1)) bad.push('two letters with the same transliteration offered');
    if (it.kind === 'word' && it.answer !== (code === 'zh' ? X.lex[it.lex].pinyin : X.lex[it.lex].translit)) bad.push('word translit');
    if (it.kind === 'word_rev' && it.answer !== X.lex[it.lex].lemma) bad.push('word');
    if (it.kind === 'char' && ![...(M.items[it.glyph].readings || []), ...(M.items[it.glyph].wordReadings || [])].includes(it.answer)) bad.push('char reading');
  }
  if (it.type === 'glyph_form') {
    if (it.kind === 'position' && it.answer !== M.items[it.glyph].forms[it.pos]) bad.push('form');
    if (it.kind === 'join' && (it.letters.join('') !== N.stripMarks(code, X.lex[it.lex].lemma) || !it.letters.every(l => it.tiles.includes(l)))) bad.push('join letters');
  }
  if (it.type === 'vowelize' && N.nfc(it.letters.map(l => l.base + l.marks.join('')).join('')) !== N.nfc(X.lex[it.lex].lemma)) bad.push('vowelize ≠ lemma');
  if (it.type === 'tone_mark') { const t = N.pinyinSplit(X.lex[it.lex].pinyin).map(s => N.pinyinTone(s)[1]); if ((it.mode === 'written' ? it.answer : it.written).join() !== t.join()) bad.push('tones'); }
  if (it.type === 'char_compose' && it.kind === 'compose' && (!it.answer.every(p => M.items[it.glyph].ids.includes(p)) || !it.answer.every(p => it.tiles.includes(p)))) bad.push('parts');
  if (it.type === 'char_compose' && it.kind === 'radical' && it.answer !== M.items[it.glyph].radical) bad.push('radical');
  if (it.type === 'trace' && it.check === 'medians' && it.medians !== M.items[it.glyph].medians) bad.push('medians');
  if (it.type === 'spell' && it.answer !== X.lex[it.lex].lemma) bad.push('spell');
  if (!['glyph_form', 'transliterate', 'vowelize', 'tone_mark', 'char_compose', 'trace', 'spell'].includes(it.type)) bad.push('type ' + it.type);
  return bad;
}
const want = { ar: ['glyph_form', 'transliterate', 'vowelize', 'trace', 'spell'], he: ['glyph_form', 'transliterate', 'vowelize', 'trace', 'spell'], zh: ['transliterate', 'tone_mark', 'char_compose', 'trace', 'spell'], de: ['spell'] };
for (const code of C.languages) {
  ok(N.scriptTypes(C, code).join() === want[code].join(), `${code}: script exercise types ${N.scriptTypes(C, code).join(', ')}`);
  const bad = [], counts = {};
  for (let s = 1; s <= 12; s++) {   // random learners: some words met, some letters met
    const rng = rng0(s * 7919), T = N.newLearner(C), X = C.lang[code];
    for (const id of Object.keys(X.lex)) if (rng() < 0.15 + s * 0.02) N.review(C, T, code, id, 'r', rng() < 0.8, 50);
    const M = N.scriptModule(C, code); if (M?.kind === 'letters') for (const key of M.order) if (rng() < 0.4) N.reviewGlyph(C, T, code, key, 'r', true, 50);
    const k = N.known(C, T, code);
    for (const t of N.scriptTypes(C, code)) for (const it of N.scriptItems(C, T, code, { type: t, k, rng, max: 40 })) { counts[t] = (counts[t] || 0) + 1; for (const b of checkItem(code, it)) bad.push(`${t}/${it.kind || ''} ${it.glyph || it.lex}: ${b}`); }
  }
  ok(!bad.length && want[code].every(t => counts[t] > 0), `${code}: ${Object.values(counts).reduce((a, b) => a + b, 0)} script items over 12 random learners, every answer from the module or the lexicon (${Object.entries(counts).map(([t, c]) => t + ' ' + c).join(', ')})` + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));
}
const sp = N.scriptItems(C, N.newLearner(C), 'ar', { type: 'glyph_form', max: 400 }).filter(x => x.kind === 'position');
ok(sp.length && sp.every(x => x.options.every(o => o.replace(/‍/g, '').length >= 1)) && sp.some(x => x.pos === 'medial'), `glyph_form: ${sp.length} position items for the letters of the first group`);
const hj = N.scriptItems(C, N.newLearner(C), 'he', { type: 'glyph_form', max: 400 }).filter(x => x.kind === 'join' && /[ךםןףץ]$/.test(x.answer));
ok(hj.length && hj.every(x => x.tiles.some(t => /[כמנפצ]/.test(t))), `Hebrew word building offers the regular form next to the final one (${hj.length} words ending in a final letter)`);
const zt = N.scriptItems(C, N.newLearner(C), 'zh', { type: 'tone_mark', max: 400 });
ok(zt.some(x => x.mode === 'written'), `tone_mark: ${zt.length} items (written tones${zt.some(x => x.mode === 'spoken') ? ', and spoken ones' : ''})`);
// the grammar generators of the registry are the same functions
ok(['glyph_form', 'transliterate', 'vowelize', 'tone_mark', 'char_compose', 'trace', 'spell'].every(t => typeof N.GEN[t] === 'function'), 'the seven types are registered as GEN.<type> for grammar generators');
// the daily session
const Ls = N.newLearner(C);
const ss0 = N.scriptSession(C, Ls, 'ar', 200, { n: 3 });
ok(ss0.length === 3 && ss0.every(x => x.intro && ar.groups[0].items.includes(x.intro)), 'session: the first new Arabic letters are introduced (' + ss0.map(x => x.intro).join(' ') + ')');
ok(N.scriptSession(C, Ls, 'zh', 200).length === 0, 'session: no Chinese characters before the first word');
N.review(C, Ls, 'zh', w, 'r', true, 200);
ok(N.scriptSession(C, Ls, 'zh', 201, { n: 3 }).length > 0 && N.scriptSession(C, Ls, 'zh', 260).length === 0, 'session: Chinese character items in the first six weeks only');
ok(N.scriptSession(C, L, 'ar', 300).length === 0, 'session: no Arabic letters once the stage is complete');

// vowel marks: fading by the state of the word
const lb = C.lang.ar.byConcept['person.teacher'][0], Lf = N.newLearner(C);
ok(N.markLevel(C, Lf, 'ar', lb, 'fading') === 'full' && N.markLevel(C, Lf, 'ar', lb, 'full') === 'full' && N.markLevel(C, Lf, 'ar', lb, 'none') === 'none', 'a new word keeps its marks when fading');
for (const d of [1, 2]) N.review(C, Lf, 'ar', lb, 'r', 'good', d);
const lightT = N.fadeMarks('ar', C.lang.ar.lex[lb].lemma, N.markLevel(C, Lf, 'ar', lb, 'fading'));
for (const d of [1, 2]) N.review(C, Lf, 'ar', lb, 'p', 'good', d);
ok(N.markLevel(C, Lf, 'ar', lb, 'fading') === 'none' && lightT === 'معلّم', `known for reading → only the šadda (${lightT}); known for writing → no marks`);
ok(N.fadeMarks('he', 'שָׁלוֹם', 'light') === 'שׁלום' && N.fadeMarks('he', 'כּוֹס', 'light') === 'כּוס' && N.fadeMarks('he', 'שָׁלוֹם', 'none') === 'שלום', 'Hebrew light: shin dot and dagesh stay');
ok(N.textMarkLevel(C, Lf, 'ar', C.lang.ar.lex[lb].lemma, 'fading') === 'none' && N.textMarkLevel(C, Lf, 'ar', 'كِتَاب', 'fading') === 'full', 'text without its word: read through the tokenizer');
// tones
ok(N.toneSandhi(['你', '好'], [3, 3]).join() === '2,3' && N.toneSandhi(['不', '是'], [4, 4]).join() === '2,4' && N.toneSandhi(['不', '好'], [4, 3]) === null && N.toneSandhi(['老', '虎'], [3, 3]).join() === '2,3', 'tone sandhi: 3+3 → 2+3, 不 before a 4th tone');
// pinyin input
const pp = s => (N.parsePinyin(s) || []).map(x => x.base + (x.tone || '')).join(' ');
ok(pp('ni3hao3') === 'ni3 hao3' && pp('nǐhǎo') === 'ni3 hao3' && pp('nihao') === 'ni hao' && pp("xi'an") === 'xi an' && pp('xian') === 'xian' && pp('lv4') === 'lü4' && pp('ma0') === 'ma5' && N.parsePinyin('qx') === null,
  'pinyin parsing: numbers, marks, none, apostrophe, v = ü, neutral 0/5, nonsense refused');
const pc = N.pinyinCandidates(C, 'zh', 'ni3hao3'), pc2 = N.pinyinCandidates(C, 'zh', 'hao3'), pc3 = N.pinyinCandidates(C, 'zh', 'nihao');
ok(pc.marks === 'nǐ hǎo' && pc.candidates[0].text === '你好' && pc2.candidates.some(x => x.text === '好') && !pc2.candidates.some(x => x.text === '号') && pc3.candidates.some(x => x.text === '你好'), 'pinyin candidates: ni3hao3 → 你好; hao3 → 好 (not 号 hào); tones optional');
// typed answers
const de = id => Object.values(C.lang.de.lex).find(x => x.lemma === id).id;
const t1 = N.checkTyped(C, 'de', de('Mädchen'), 'Madchen'), t2 = N.checkTyped(C, 'de', de('Mädchen'), 'mädchen'), t3 = N.checkTyped(C, 'de', de('Mädchen'), 'Mädchen');
ok(!t1.ok && t1.notes.some(x => /umlaut/.test(x)) && t1.diff.some(d => d.op === 'wrong' && d.want === 'ä') && !t2.ok && t2.notes.some(x => /capital/.test(x)) && t3.ok, 'German: umlaut and capital letter caught, with a letter-level diff');
const kit = Object.values(C.lang.ar.lex).find(x => N.stripMarks('ar', x.lemma) === 'كتاب').id;
const a1 = N.checkTyped(C, 'ar', kit, 'كتاب'), a2 = N.checkTyped(C, 'ar', kit, 'كُتَاب'), a3 = N.checkTyped(C, 'ar', kit, 'كتاپ');
ok(a1.ok && !a2.ok && a2.notes.some(x => /vowel mark/.test(x)) && !a3.ok, 'Arabic: the letters without marks are right; with a wrong mark not');
const shl = Object.values(C.lang.he.lex).find(x => x.lemma === 'שָׁלוֹם').id, h1 = N.checkTyped(C, 'he', shl, 'שלומ');
ok(!h1.ok && h1.notes.some(x => /final form/.test(x)) && N.checkTyped(C, 'he', shl, 'שלום').ok, 'Hebrew: the final mem is required');
const zx = C.lang.zh.byConcept['veg.carrot'][0], z1 = N.checkTyped(C, 'zh', zx, 'huluobo');
ok(!z1.ok && z1.notes.some(x => /pinyin/.test(x)) && N.checkTyped(C, 'zh', zx, C.lang.zh.lex[zx].lemma).ok && N.checkTyped(C, 'zh', zx, C.lang.zh.lex[zx].trad).ok, 'Chinese: the characters (simplified or traditional); pinyin alone is not the answer');
ok(N.letterDiff('Haus', 'Hasu').filter(d => d.op !== 'same').length === 2 && N.letterDiff('abc', 'abxc').some(d => d.op === 'extra'), 'letter diff: wrong, missing, extra');
// strokes
const med = zh.items['男'].medians;
ok(med.every(m => N.strokeMatch(m, m).ok) && !N.strokeMatch(med[0].slice().reverse(), med[0]).ok && N.strokeMatch(med[0].slice().reverse(), med[0]).reversed && !N.strokeMatch(med[0].map(([x, y]) => [x + 400, y - 400]), med[0]).ok && !N.strokeMatch(med[1], med[0]).ok,
  'stroke matching: each median matches itself; reversed, moved or another stroke does not');
ok(N.strokeMatch(med[2].map(([x, y]) => [x + 30, y - 25]), med[2]).ok, 'stroke matching: a stroke drawn a little off still counts');
// tokenizer fixes (§7.2)
const parts = (c, s) => N.tokenize(C, c, s).filter(t => !t.p).map(t => t.parts ? t.parts.map(p => p.t + '=' + (p.matches[0]?.l || '?')).join('+') : t.t + '=' + (t.matches[0]?.l || '?'));
ok(parts('he', 'וּשְׁנַיִם')[0].startsWith('וּ=he:ve+') && parts('he', 'שְׁלוֹשִׁים וָחָמֵשׁ')[1].startsWith('וָ=he:ve+') && parts('he', 'וּבַבַּיִת')[0].split('+').length === 3, 'Hebrew: וּ and וָ read as the prefix וְ (with their vowel), two prefixes');
const lb2 = N.tokenize(C, 'ar', 'لِلْبَيْتِ')[0], lb3 = N.tokenize(C, 'ar', 'للبيت')[0];
ok(lb2.parts?.length === 2 && lb2.parts[0].matches[0].l === 'ar:li' && lb2.parts[1].matches.some(m => /DEF/.test(m.f)) && lb3.parts?.[1].matches.some(m => /DEF/.test(m.f)), 'Arabic: لِلْبَيْتِ = لِ + الْبَيْتِ (definite), also unvocalized');
// zh: a newer, longer word does not break older sentences (a copy of the course with 回家 as one word)
const d2 = JSON.parse(JSON.stringify(data)), node = C.lang.zh.lex[C.lang.zh.byConcept['verb.return']?.[0] || Object.keys(C.lang.zh.lex)[0]].node;
d2.langs.zh.lexicon[node].lexemes.push({ id: 'zh:huijia.test', lemma: '回家', pinyin: 'huí jiā', trad: '回家', pos: 'VERB', senses: [], role: 'test word' });
const C2 = N.course(d2), X2 = C2.lang.zh;
const roundTrip = (Cx, code) => {   // as tests/lang_courses.js: every annotated word (parts included) is read back
  const bad = [];
  for (const s of Cx.lang[code].sentences) {
    const flat = [], names = new Set(); const walk = ks => ks.forEach(t => t.parts && t.parts.some(x => x.name) ? names.add(t.t) : t.parts ? walk(t.parts) : t.name ? names.add(t.t) : !t.p && flat.push(t.l)); walk(s.tokens);
    let text = s.text; for (const nm of names) if (nm.includes(' ')) text = text.split(nm).join(' ');
    const got = []; for (const t of N.tokenize(Cx, code, text)) { if (t.p || (t.unknown && names.has(t.t))) continue; if (t.parts) t.parts.forEach(p => got.push(p.matches.map(m => m.l))); else got.push(t.matches.map(m => m.l)); }
    if (got.length !== flat.length || got.some((a, i) => !a.includes(flat[i]))) bad.push(s.id);
  }
  return bad;
};
const withHuijia = X2.sentences.filter(s => s.text.includes('回家'));
ok(withHuijia.length > 0 && !roundTrip(C2, 'zh').length, `zh: with 回家 added as a word, all ${X2.sentences.length} sentences still read back (${withHuijia.length} split it as 回 + 家)`);
ok(N.tokenize(C2, 'zh', '他们回家吗').filter(t => !t.p).map(t => t.t).join('|') === '他们|回|家|吗', 'zh: in a new text the span the bank always splits stays split (回 + 家)');
const d3 = JSON.parse(JSON.stringify(d2)); d3.langs.zh.bank.push({ id: 'zh.s.test1', frame: d3.frames[0].id, text: '回家', tokens: [{ t: '回家', l: 'zh:huijia.test' }], gloss: 'go home' });
const C3 = N.course(d3);
ok(N.tokenize(C3, 'zh', '他们回家吗').filter(t => !t.p).map(t => t.t).join('|') === '他们|回家|吗' && !roundTrip(C3, 'zh').length, 'zh: once the bank writes 回家 as one word too, new texts take the longest word; every sentence keeps its own words');
ok(!roundTrip(C, 'he').length && !roundTrip(C, 'ar').length, 'ar, he: every bank sentence still reads back after the prefix changes');

console.log('— 2 · the validator');
function py(args) { try { return { code: 0, out: execFileSync('python3', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-script-'));
const mini = path.join(tmp, 'mini'); fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'lang-mini'), mini, { recursive: true });
const vmini = () => py([path.join(ROOT, 'tools', 'validate_lang.py'), mini, '--strict', '--alone']);
ok(vmini().code === 0, 'the mini course with its script modules is valid');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8')), Wj = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 1));
const sa = path.join(mini, 'lang', 'ar', 'script.json'), sh = path.join(mini, 'lang', 'he', 'script.json'), sz = path.join(mini, 'lang', 'zh', 'chars.json');
const keepA = fs.readFileSync(sa, 'utf8'), keepH = fs.readFileSync(sh, 'utf8'), keepZ = fs.readFileSync(sz, 'utf8');
let d = J(sa); d.letters = d.letters.filter(x => x.ch !== 'ر'); d.groups.forEach(g => g.items = g.items.filter(x => x !== 'ر')); Wj(sa, d);
let r = vmini(); ok(r.code === 1 && /writes the letter ر/.test(r.out), 'a letter the course writes is missing → error');
d = J(sa); d.letters.find(x => x.ch === 'د').joins = 'dual'; Wj(sa, d); r = vmini();
ok(r.code === 1 && /joins must be “right”/.test(r.out), 'a wrong joining (د joining both sides) → error');
fs.writeFileSync(sa, keepA); d = J(sa); d.groups[0].items.push(d.groups[1].items[0]); Wj(sa, d); r = vmini();
ok(r.code === 1 && /exactly one teaching group/.test(r.out), 'a letter in two groups → error');
fs.writeFileSync(sa, keepA); d = J(sh); d.letters.find(x => x.ch === 'מ').forms.final = 'ן'; Wj(sh, d); r = vmini();
ok(r.code === 1 && /its final form is ם/.test(r.out), 'a wrong Hebrew final form → error');
fs.writeFileSync(sh, keepH); d = J(sz); const gone = d.chars.shift().ch; Wj(sz, d); r = vmini();
ok(r.code === 1 && new RegExp(`character ${gone}.*missing`).test(r.out), `a character of a word missing (${gone}) → error`);
fs.writeFileSync(sz, keepZ); d = J(sz); d.chars[0].readings = ['xyz9']; delete d.chars[0].wordReadings; Wj(sz, d); r = vmini();
ok(r.code === 1 && /not a pinyin syllable|is not listed/.test(r.out), 'a wrong reading → error');
fs.writeFileSync(sz, keepZ); fs.rmSync(sz); r = vmini();
ok(r.code === 0 && /chars\.json: missing/.test(r.out), 'a missing module is only a warning');
fs.writeFileSync(sz, keepZ);
// prefixes: וָ / וּ are spellings of וְ; a wrong letter is not
const bk = path.join(mini, 'lang', 'he', 'bank', 'basic.json'), keepB = fs.readFileSync(bk, 'utf8');
const setVe = sp2 => { const b = J(bk); for (const s of b.sentences) for (const k of s.tokens) if (k.parts && k.parts[0].l === 'he:ve') { k.parts[0].t = sp2; k.t = k.parts.map(p => p.t).join(''); s.text = N.joinTokens(s.tokens, 'space'); } Wj(bk, b); };
setVe('וָ'); r = vmini(); ok(r.code === 0, 'Hebrew: the prefix וְ written וָ is accepted (the vowel the next word asks for)');
setVe('בְ'); r = vmini(); ok(r.code === 1 && /is not the lemma form of he:ve/.test(r.out), 'Hebrew: another letter as the prefix is refused');
fs.writeFileSync(bk, keepB);
// Arabic لِلْـ on a copy of the pilot's Arabic (the mini course has no لِ)
const pil = path.join(tmp, 'pilot'); fs.cpSync(path.join(ROOT, 'library', 'languages', COURSE), pil, { recursive: true, filter: p => !/course\.(pack|profiles)\.js$/.test(p) });
for (const x of ['_phenomena', '_typology']) fs.cpSync(path.join(ROOT, 'library', 'languages', x), path.join(tmp, x), { recursive: true });
const frame = J(path.join(pil, 'core', 'frames.json')).frames[0].id;
const addAr = tokText => { const f = path.join(pil, 'lang', 'ar', 'bank', 'zz_test.json'); Wj(f, { sentences: [{ id: 'ar.s.test.lil', frame, text: tokText + '.', tokens: [{ t: tokText, parts: [{ t: 'لِ', l: 'ar:li', f: 'ADP' }, { t: tokText.slice(2), l: 'ar:bayt', f: 'N;GEN;SG;DEF' }] }, { t: '.', p: true }], gloss: 'for the house', functions: [] }] }); };
addAr('لِلْبَيْتِ'); r = py([path.join(ROOT, 'tools', 'validate_lang.py'), pil, '--lang', 'ar', '--alone']);
ok(!/ar\.s\.test\.lil/.test(r.out), 'Arabic: لِلْبَيْتِ annotated as لِ + the definite form without its alif is valid' + (/ar\.s\.test\.lil/.test(r.out) ? ' — ' + r.out.split('\n').filter(l => /test\.lil/.test(l)).slice(0, 2).join(' ') : ''));
addAr('لِبَيْتِ'); r = py([path.join(ROOT, 'tools', 'validate_lang.py'), pil, '--lang', 'ar', '--alone']);
ok(/ar\.s\.test\.lil/.test(r.out), 'Arabic: a definite form cut elsewhere is refused');
ok(py([path.join(ROOT, 'tools', 'lang_script.py'), 'check', path.join(ROOT, 'library', 'languages', COURSE)]).code === 0, 'tools/lang_script.py check: the pilot course’s modules are valid');
fs.rmSync(tmp, { recursive: true, force: true });

console.log('— 3 · the app');
(async () => {
  const { chromium } = require(process.env.PW || 'playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r2 => r2.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  const open = async hash => { await page.goto(url + '?account=anr&subject=' + SUBJ + hash); await page.waitForSelector('.lx-main .lx-view', { timeout: 10000 }).catch(() => { }); await wait(300); };
  const hashTo = async hash => { await page.evaluate(h2 => { location.hash = '#/x'; location.hash = h2; }, hash); await wait(350); };
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const cur = () => page.evaluate(() => { const c = NoemaLangUI.UI.current; return c && { ...c, it: c.it && { ...c.it, medians: undefined } }; });
  const next = async () => { const b = await page.$('.lx-stage .lx-next'); if (b) await b.click(); await wait(60); };
  const drill = async (c, type) => { await hashTo('#/script/' + c); await page.click(`.lx-scriptdrills button[data-type="${type}"]`); await wait(250); };
  await open('#/'); await page.waitForSelector('.lx-scriptbtn', { timeout: 8000 }).catch(() => { });
  const nsb = await page.locator('.lx-scriptbtn').count();
  ok(nsb === 4, `home: a 🔤 button per language (${nsb})`);

  // the lane, every language, at phone width
  for (const [c, groups, total] of [['ar', 8, 47], ['he', 7, 44]]) {
    await hashTo('#/script/' + c);
    const g = await page.locator('.lx-glyphgroup').count(), t = await page.locator('.lx-gtile').count();
    const rtl = await page.$$eval('.lx-gtile .lx-glyph', es => es.every(e => e.getAttribute('dir') === 'rtl' && e.getAttribute('lang')));
    ok(g === groups && t === total && rtl && /Stage 0 of/.test(await page.locator('.lx-stagemeter').innerText()), `${c} lane: stage meter, ${g} groups, ${t} letters and marks, right to left`);
    ok(await over() <= 1, `${c} lane: no sideways scrolling at 390 px`);
  }
  await hashTo('#/script/zh');
  ok(await page.locator('.lx-glyphgroup').count() >= 2 && /characters known/.test(await page.locator('.lx-stagemeter').innerText()) && await over() <= 1, 'zh lane: characters grouped by lesson, stage meter, fits the phone');
  await hashTo('#/script/de');
  ok(await page.locator('.lx-scriptdrills button').count() === 1 && /ä ö ü/.test(await page.locator('.lx-main').innerText()), 'de lane: spelling only, the special letters explained');
  // a letter card
  await hashTo('#/script/ar'); await page.click('.lx-gtile[data-glyph="ب"]'); await wait(200);
  const card = await page.locator('.lx-glyphcard').innerText();
  ok(/bāʾ/.test(card) && /initial/.test(card) && /medial/.test(card) && /In words of the course/.test(card) && await over() <= 1, 'the card of ب: name, its four forms, words of the course');
  await page.click('.lx-glyphcard button:has-text("✕")');

  // 🆕 learning the next letters: cards, then a question each
  await page.click('.lx-learnletters'); await wait(200);
  let intros = 0, asked = 0;
  for (let i = 0; i < 30; i++) {
    const c0 = await cur(); if (!c0 || await page.$('.lx-result')) break;
    if (c0.intro) { intros++; await page.click('.lx-stage .lx-next'); await wait(60); continue; }
    asked++; const it = c0.it;
    if (it.type === 'glyph_form' && it.kind === 'join') { for (const l of it.letters) await page.click(`.lx-stage .lx-tile1[data-t="${l}"]:not([disabled])`); }
    else { const idx = it.options.indexOf(it.answer); await page.click(`.lx-stage .lx-opts .lx-opt >> nth=${idx}`); }
    await wait(60); await next();
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:s:lang:polyglot-semitic-zh-de:lang:ar:script') || 'null'));
  ok(intros >= 4 && asked >= intros && /0 to practise again/.test(await page.locator('.lx-result').innerText()) && stored && Object.keys(stored.items).length >= intros, `learn: ${intros} letters introduced, ${asked} questions, stored in lang:ar:script`);

  // every widget, right and wrong
  // transliterate (choose; keys 1–4)
  await drill('ar', 'transliterate'); let it = (await cur()).it;
  await page.keyboard.press(String(it.options.indexOf(it.answer) + 1)); await wait(80);
  ok(await page.locator('.lx-stage .lx-opt.right').count() === 1 && await page.locator('.lx-fb.ok').count() === 1, `transliterate (${it.kind}) answered with the keyboard: right`);
  await next(); it = (await cur()).it;
  await page.click(`.lx-stage .lx-opts .lx-opt >> nth=${(it.options.indexOf(it.answer) + 1) % it.options.length}`); await wait(80);
  ok(await page.locator('.lx-fb.bad').count() === 1 && await page.locator('.lx-stage .lx-opt.right').count() === 1, 'a wrong answer is marked and the right one shown');
  // glyph_form: positions and building a word
  for (const lang of ['ar', 'he']) {
    await drill(lang, 'glyph_form'); let done2 = { join: 0, position: 0 };
    for (let i = 0; i < 10 && !(done2.join && done2.position); i++) {
      it = (await cur())?.it; if (!it) break;
      if (it.kind === 'join') { for (const l of it.letters) await page.click(`.lx-stage .lx-tile1[data-t="${l}"]:not([disabled])`); await wait(60); if (await page.locator('.lx-stage .lx-slot.right').count()) done2.join++; }
      else { await page.click(`.lx-stage .lx-opts .lx-opt >> nth=${it.options.indexOf(it.answer)}`); await wait(60); if (await page.locator('.lx-stage .lx-opt.right').count()) done2.position++; }
      if (lang === 'ar' && !(await over() <= 1)) done2.over = true;
      await next();
    }
    ok(done2.join + done2.position > 0 && !done2.over, `${lang} glyph_form: ${done2.position} forms and ${done2.join} words built from their letters, right`);
  }
  await drill('he', 'glyph_form');
  for (let i = 0; i < 12; i++) { it = (await cur()).it; if (it.kind === 'join') break; await page.click('.lx-stage .lx-opts .lx-opt >> nth=0'); await next(); }
  if (it.kind === 'join') { await page.click('.lx-stage button:has-text("Show me")'); await wait(60); ok(await page.locator('.lx-stage .lx-slot.wrong').count() === 1 && /=/.test(await page.locator('.lx-fb.bad').innerText()), 'word building: “Show me” counts as wrong and shows the letters'); }
  // vowelize: keyboard (digits) and mouse
  for (const lang of ['ar', 'he']) {
    await drill(lang, 'vowelize'); it = (await cur()).it;
    const order = it.letters.map((l, i) => [l, i]).filter(([l]) => !l.sep);
    for (const [l, i] of order) { await page.click(`.lx-stage .lx-vletter[data-i="${i}"]`); for (const m of l.marks) { const k = it.palette.indexOf(m); if (k < 9) await page.keyboard.press(String(k + 1)); else await page.click(`.lx-stage .lx-palette [data-mark="${m}"]`); } }
    const prev = await page.locator('.lx-vpreview').innerText();
    await page.keyboard.press('Enter'); await wait(80);
    ok(await page.locator('.lx-stage .lx-vletter.right').count() === order.length && await page.locator('.lx-fb.ok').count() === 1 && prev.normalize('NFC') === it.text, `${lang} vowelize: every mark set from the keyboard, the preview is the word (${it.text})`);
    await next(); it = (await cur()).it;
    await page.click('.lx-stage .lx-check'); await wait(80);
    ok(await page.locator('.lx-fb.bad').count() === 1 && await page.locator('.lx-stage .lx-vletter.wrong').count() >= 1, `${lang} vowelize: no marks → wrong, the letters to fix are marked`);
  }
  // tones
  await drill('zh', 'tone_mark'); it = (await cur()).it;
  for (const t of it.answer) await page.keyboard.press(String(t)); await wait(80);
  ok(await page.locator('.lx-fb.ok').count() === 1 && await page.locator('.lx-stage .lx-tonebtn.right').count() === it.answer.length, `tone_mark: the tones of ${it.chars.join('')} from the keyboard (${it.why})`);
  await next(); it = (await cur()).it;
  for (let i = 0; i < it.answer.length; i++) await page.click(`.lx-stage .lx-tonecol[data-i="${i}"] .lx-tonebtn[data-tone="${it.answer[i] === 1 ? 2 : 1}"]`).catch(() => { });
  await wait(80); ok(await page.locator('.lx-fb.bad').count() === 1, 'tone_mark: wrong tones → wrong');
  // building characters
  await drill('zh', 'char_compose'); let comp = false, rad = false;
  for (let i = 0; i < 10 && !(comp && rad); i++) {
    it = (await cur()).it;
    if (it.kind === 'compose') { for (const p of it.answer) await page.click(`.lx-stage .lx-tile1[data-t="${p}"]:not([disabled])`); await wait(60); comp = comp || await page.locator('.lx-stage .lx-slot.right').count() === 1; }
    else { await page.click(`.lx-stage .lx-opts .lx-opt >> nth=${it.options.indexOf(it.answer)}`); await wait(60); rad = rad || await page.locator('.lx-stage .lx-opt.right').count() === 1; }
    await next();
  }
  ok(comp && rad, 'char_compose: a character built from its parts, a radical found');
  // tracing: Chinese strokes against the medians; Arabic self-check
  await drill('zh', 'trace'); it = (await cur()).it;
  const tr1 = await page.evaluate(() => { const box = document.querySelector('.lx-extrace'), T = box._strokeTest; T.draw(T.med[0].slice().reverse()); return document.querySelector('.lx-tracestatus').textContent; });
  const tr2 = await page.evaluate(() => { const box = document.querySelector('.lx-extrace'), T = box._strokeTest; for (const m of T.med) T.draw(m); return !!document.querySelector('.lx-fb.ok'); });
  ok(/other way round/.test(tr1) && tr2, `trace ${it.glyph}: a reversed stroke is refused, the strokes in order are accepted (1 miss allowed)`);
  for (let i = 0; i < 8; i++) { await next(); if (await page.evaluate(() => document.querySelector('.lx-extrace')?._strokeTest.med.length >= 3)) break; }
  const tr3 = await page.evaluate(() => { const T = document.querySelector('.lx-extrace')._strokeTest;   // the stroke farthest from the first one, drawn twice
    const far = T.med.slice(1).sort((a, b) => NoemaLang.strokeMatch(b, T.med[0]).dist - NoemaLang.strokeMatch(a, T.med[0]).dist)[0]; T.draw(far); T.draw(far); return document.querySelector('.lx-tracestatus').textContent; });
  ok(/not stroke 1/.test(tr3) && /orange/.test(tr3), 'trace: strokes out of order are refused, then the next stroke is shown');
  const cv = await page.locator('.lx-canvas').boundingBox();
  await page.mouse.move(cv.x + 40, cv.y + 40); await page.mouse.down(); await page.mouse.move(cv.x + 120, cv.y + 60, { steps: 5 }); await page.mouse.up(); await wait(60);
  ok(cv.width <= 280 && await over() <= 1, 'trace: the canvas takes pointer strokes and fits the phone');
  await drill('ar', 'trace'); await page.mouse.move(cv.x + 100, cv.y + 50); await page.mouse.down(); await page.mouse.move(cv.x + 120, cv.y + 200, { steps: 6 }); await page.mouse.up();
  await page.click('.lx-selfok'); await wait(60);
  ok(await page.locator('.lx-fb.ok').count() === 1, 'trace (ar): self-checked against the model letter');

  // spelling with the on-screen keyboards, pinyin input and umlaut buttons
  await drill('ar', 'spell'); it = (await cur()).it;
  ok(await page.locator('.lx-kbd[lang=ar] .lx-key').count() > 40 && await over() <= 1, 'Arabic keyboard with the vowel marks, at phone width');
  for (const ch of [...N.stripMarks('ar', it.answer)]) await page.click(`.lx-stage .lx-kbd .lx-key[data-key="${ch}"]`);
  await page.click('.lx-stage .lx-check'); await wait(80);
  ok(await page.locator('.lx-fb.ok').count() === 1, `spell (ar) on the on-screen keyboard: ${N.stripMarks('ar', it.answer)} without marks is right`);
  await next(); it = (await cur()).it;
  await page.click('.lx-stage .lx-input input'); await page.keyboard.type(N.stripMarks('ar', it.answer).slice(0, -1) + 'ك'); await page.keyboard.press('Enter'); await wait(80);
  ok(await page.locator('.lx-fb.bad').count() === 1 && await page.locator('.lx-stage .lx-d').count() > 0, 'spell (ar) typed on the physical keyboard, a wrong letter → the letter-level difference');
  await drill('he', 'spell'); it = (await cur()).it;
  for (const ch of [...it.answer]) await page.click(`.lx-stage .lx-kbd .lx-key[data-key="${ch}"]`);
  await page.click('.lx-stage .lx-check'); await wait(80);
  ok(await page.locator('.lx-fb.ok').count() === 1, `spell (he) with every vowel mark from the keyboard: ${it.answer}`);
  await page.click('.lx-stage .lx-kbdtoggle').catch(() => { });
  await drill('he', 'spell');
  ok(await page.locator('.lx-kbd[lang=he]').isHidden(), 'the Hebrew keyboard stays hidden once hidden (remembered)');
  await page.click('.lx-stage .lx-kbdtoggle'); await wait(50);
  await drill('zh', 'spell'); it = (await cur()).it;
  const want = await page.evaluate(id => NoemaLangUI.UI.C.lang.zh.lex[id].pinyin, it.lex);
  await page.click('.lx-stage .lx-pyin');
  await page.keyboard.type(N.pinyinMarksToNumbers(want).replace(/\s+/g, '')); await wait(120);
  const prevTxt = await page.locator('.lx-stage .lx-pyprev').innerText();
  await page.click(`.lx-stage .lx-cand[data-text="${it.answer}"]`); await wait(60);
  await page.click('.lx-stage .lx-check'); await wait(80);
  ok(prevTxt.includes(N.pinyinNumbersToMarks(N.pinyinMarksToNumbers(want))) && await page.locator('.lx-fb.ok').count() === 1, `spell (zh): pinyin with tone numbers → ${prevTxt} → the characters ${it.answer} chosen`);
  await drill('de', 'spell'); it = (await cur()).it;
  await page.click('.lx-stage .lx-input input');
  for (const ch of it.answer) { if ('äöüßÄÖÜ'.includes(ch)) await page.click(`.lx-stage .lx-kbd-de .lx-key[data-key="${ch}"]`); else await page.keyboard.type(ch); }
  await page.keyboard.press('Enter'); await wait(80);
  ok(await page.locator('.lx-fb.ok').count() === 1, `spell (de): ${it.answer} typed${/[äöüß]/i.test(it.answer) ? ' with the umlaut buttons' : ''}`);
  const umlaut = await page.evaluate(() => { const box = NoemaLangUI.script.scriptInput('de', {}); document.body.append(box.el); box.input.focus(); box.el.querySelector('[data-key="ö"]').click(); const v = box.input.value; box.el.remove(); return v; });
  ok(umlaut === 'ö', 'the ö button types ö at the caret');
  for (const c of ['ar', 'he', 'zh', 'de']) { await drill(c, 'spell'); if (await over() > 1) { ok(false, `spell ${c} fits the phone`); } }
  ok(true, 'spelling fits the phone in all four languages');

  // the production exercise: typing in every script, ar/he only once the letters are known
  const prod = async c => page.evaluate(c2 => { const U = NoemaLangUI.UI, id = Object.keys(U.C.lang[c2].lex).find(x => (U.C.lang[c2].lex[x].senses || []).length);
    const box = NoemaLangUI.ex.exProduce(c2, id, () => { }); document.body.append(box); const r2 = { input: !!box.querySelector('.lx-input'), kbd: !!box.querySelector('.lx-kbd'), py: !!box.querySelector('.lx-pyin'), de: !!box.querySelector('.lx-kbd-de') }; box.remove(); return r2; }, c);
  const pAr = await prod('ar'), pZh = await prod('zh'), pDe = await prod('de');
  ok(!pAr.input && pZh.py && pDe.de, 'produce: Arabic with tiles while the letters are learned; Chinese with pinyin input; German with the umlaut buttons');
  await page.evaluate(() => { const { C, L } = NoemaLangUI.UI, M = NoemaLang.scriptModule(C, 'ar'); for (const k of M.order) for (const t of ['r', 'p']) { NoemaLang.reviewGlyph(C, L, 'ar', k, t, 'good', 1); NoemaLang.reviewGlyph(C, L, 'ar', k, t, 'good', 2); } NoemaLangUI.save(true); });
  const pAr2 = await prod('ar');
  ok(pAr2.input && pAr2.kbd, 'produce: once every Arabic letter is known, the word may be typed (with the keyboard)');

  // transliteration while the letters are learned; vowel-mark fading
  await page.evaluate(() => { NoemaLangUI.UI.prefs.translit = false; NoemaLangUI.save(true); });
  await open('#/c/person.teacher'); await page.click('.lx-railbtn >> nth=1'); await wait(150);
  ok(await page.locator('.lx-card .lx-lemma .lx-help').count() >= 1, 'Hebrew (letters not all known): the transliteration stays under the word although it is switched off');
  await page.click('.lx-railbtn >> nth=0'); await wait(150);
  ok(await page.locator('.lx-card .lx-lemma .lx-help').count() === 0, 'Arabic (every letter known): the transliteration follows the setting');
  await hashTo('#/settings');
  ok(await page.locator('.lx-marklevels select').count() === 2 && await over() <= 1, 'settings: a vowel-mark level for Arabic and Hebrew');
  await page.selectOption('.lx-marklevels select[data-lang="ar"]', 'fading'); await wait(100);
  const fade = await page.evaluate(() => { const { C, L } = NoemaLangUI.UI, id = C.lang.ar.byConcept['person.teacher'][0]; for (const d of [1, 2]) NoemaLang.review(C, L, 'ar', id, 'r', 'good', d); NoemaLangUI.save(true); return C.lang.ar.lex[id].lemma; });
  await open('#/c/person.teacher'); await page.click('.lx-railbtn >> nth=0'); await wait(150);
  const shownLemma = (await page.locator('.lx-card .lx-lemma .lx-w').first().innerText()).normalize('NFC');
  ok(shownLemma === N.fadeMarks('ar', fade, 'light') && shownLemma !== fade, `fading: a word known for reading shows only its šadda (${shownLemma})`);
  await open('#/c/person.student'); await page.click('.lx-railbtn >> nth=0'); await wait(150);
  ok(/[ًٌٍَُِّْ]/.test(await page.locator('.lx-card .lx-lemma .lx-w').first().innerText()), 'fading: a new word keeps every mark');
  await drill('ar', 'vowelize'); it = (await cur()).it; await page.click('.lx-stage button:has-text("Show me")'); await wait(60);
  ok((await page.locator('.lx-stage .lx-fb .lx-extext').innerText()).normalize('NFC') === it.text, 'drills about the marks keep them whatever the fading says');

  // the daily session: a few script items from the second day on
  await page.evaluate(() => { const { C, L } = NoemaLangUI.UI, d = NoemaLang.dayNumber() - 1; for (const c of ['he', 'zh']) for (const id of C.lang[c].byNode['fd.01'].slice(0, 4)) NoemaLang.introduce(C, L, c, id, d); NoemaLangUI.save(true); });
  await open('#/');
  const steps = await page.evaluate(() => NoemaLangUI.script.scriptSessionSteps().map(s => s.lang + ':' + (s.intro ? 'intro' : s.it.type)));
  ok(steps.some(s => s.startsWith('he:')) && steps.some(s => s.startsWith('zh:')) && !steps.some(s => s.startsWith('ar:')), 'session: script items for Hebrew and Chinese (met yesterday), none for Arabic (complete): ' + steps.join(' '));
  await page.click('.lx-go'); await wait(200);
  let sawScript = 0;
  for (let i = 0; i < 200; i++) {
    const ex = await page.$('.lx-stage .lx-ex'); if (!ex) break;
    if (await ex.evaluate(e => e.dataset.kind) === 'script') sawScript++;
    const nb = await page.$('.lx-stage .lx-next'); if (nb) { await nb.click(); await wait(40); continue; }
    const o = await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'), show = await page.$('.lx-stage button:has-text("Show me")');
    if (o) await o.click(); else if (show) await show.click(); else break;
    await wait(40); const o2 = await page.$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); if (o2) { await o2.click(); await wait(40); }
    await next();
  }
  ok(sawScript >= 2 && await page.locator('.lx-result').count() === 1, `the session ran its script steps (${sawScript}) and ended`);

  // name them all with the keyboard
  await open('#/recall/food.vegetables'); await page.click('.lx-flagchip:has-text("HE")'); await wait(150); await open('#/recall/food.vegetables');
  ok(await page.locator('.lx-recallin').count() === 1 && await page.locator('.lx-kbd[lang=he]').count() === 1 && await over() <= 1, '⏱️ name them all: the Hebrew keyboard under the field, fits the phone');

  // two devices: the script stage is combined like words
  const merged = await page.evaluate(() => { const k = 's:lang:polyglot-semitic-zh-de:lang:ar:script';
    const a = { items: { 'ب': { seen: 5, r: { last: 9, reps: 2, ivl: 3, ease: 2.5, streak: 2, due: 12 } } } }, b = { items: { 'ب': { seen: 3, r: { last: 7, reps: 1, ivl: 1, ease: 2.5, streak: 1, due: 8 } }, 'ت': { seen: 4 } } };
    return JSON.parse(NoemaCloud.mergeValue(k, JSON.stringify(a), JSON.stringify(b), true).value); });
  ok(merged.items['ت'] && merged.items['ب'].seen === 3 && merged.items['ب'].r.last === 9, 'two devices: letters of both are kept, the later review wins, the first seen day stays');

  // every view at 390 px with Arabic and Hebrew (RTL)
  for (const c of ['ar', 'he']) {
    await open('#/'); await page.click(`.lx-flagchip:has-text("${c.toUpperCase()}")`); await wait(150);
    const bad = [];
    for (const hsh of ['#/', '#/script/' + c, '#/c/veg.carrot', '#/node/veg.1', '#/lesson/fd.01', '#/lesson/fd.07', '#/fn/fn.overview/' + c, '#/field/food.vegetables/1', '#/sort/food.vegetables', '#/parts/' + c, '#/peculiar/' + c, '#/settings', '#/recall/food.vegetables']) {
      await hashTo(hsh); await wait(150); const o = await over(); if (o > 1) bad.push(`${hsh} ${o}px`);
      const noDir = await page.evaluate(code => [...document.querySelectorAll(`.lx-main [lang="${code}"]`)].filter(e => !e.closest('[dir]')).length, c);
      if (noDir) bad.push(`${hsh}: ${noDir} ${c} spans without a direction`);
    }
    ok(!bad.length, `${c}: 13 views at 390 px — no sideways scrolling, every ${c} span with its direction` + (bad.length ? ' — ' + bad.join('; ') : ''));
  }
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close();
  console.log(fails ? `\n${fails} of ${n} FAILED` : `\nALL ${n} PASSED`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
