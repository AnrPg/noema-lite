/* text@1 (engine/src/48_lib_text.js, docs/library/text.md): published reference values (Manning & Schütze 1999; Flesch 1948 /
   Kincaid 1975 coefficients; the lexical-diversity package 0.1.1 of Kyle 2018 as an independent implementation; standard scansions
   of Virgil, Ovid and Homer), Unicode edge cases, the codes, the checks, the sim adapter, the Worker source, speed.
   Run: node tests/lib_text.js */
'use strict';
const path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol, `${m}: ${a} ≈ ${b} (± ${tol})`);
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibText = ENGINES.mod('text@1');
const X = NoemaLibText;
const run = (texts, outputs, extra, env) => X.run({ model: Object.assign({ texts }, extra || {}), outputs }, env || {}, {});
const sc = (id, of, f) => Object.assign({ id, kind: 'scalar', of }, f || {});
const hasCode = (r, c) => r.codes.some(x => x.code === c);

// ---- 1. association measures: Manning & Schütze 1999, ch. 5 (N = 14 307 668 tokens of the NYT corpus) ----
const NYT = 14307668, A = (o11, r1, c1, m) => X.assoc(o11, r1, c1, NYT, m, []);
near(A(8, 15828, 4675, 't'), 0.999932, 1e-5, 't-score "new companies" (M&S §5.3.1)');
near(A(8, 15828, 4675, 'chi2'), 1.55, 0.005, 'χ² "new companies" (M&S §5.3.3)');
near(A(20, 42, 20, 'pmi'), 18.38, 0.005, 'PMI "Ayatollah Ruhollah" (M&S Table 5.16)');
near(A(150, 12593, 932, 'g2'), 1291.42, 0.15, 'log-likelihood −2 log λ "most powerful" (M&S Table 5.12; Dunning 1993)');
near(A(150, 12593, 932, 'g2'), 1291.319057, 1e-5, '… the exact 2×2 G² of the same table');
near(A(150, 12593, 932, 'logDice'), 14 + Math.log2(300 / 13525), 1e-12, 'logDice (Rychlý 2008) = 14 + log2(2·f12 / (f1 + f2))');
near(A(20, 42, 20, 'npmi'), 18.377968 / -Math.log2(20 / NYT), 1e-5, 'NPMI (Bouma 2009) in [−1, 1]');
{ const cs = []; ok(X.assoc(0, 10, 10, 1000, 'pmi', cs) === -Infinity && cs.includes('zero_pair'), 'PMI of a pair never seen: −∞, code zero_pair'); }
{ const cs = []; ok(Number.isNaN(X.assoc(30, 10, 10, 1000, 'g2', cs)) && cs.includes('counts'), 'impossible counts (o11 > f1): NaN, code counts'); }
{ const cs = []; X.assoc(1, 2, 2, 100, 'chi2', cs); ok(cs.includes('chi2_small'), 'χ² with expected counts < 5: code chi2_small'); }

// ---- 2. readability: Flesch 1948, Kincaid et al. 1975 ----
{ const r = run([{ id: 'c', lang: 'en', body: 'The cat sat on the mat.' }], [sc('f', 'readability', { formula: 'flesch' }), sc('k', 'readability', { formula: 'fk' }), sc('s', 'readability', { formula: 'flesch', what: 'syllables' })]);
  near(r.out.f, 116.145, 1e-9, 'Flesch Reading Ease of "The cat sat on the mat." (6 words, 1 sentence, 6 syllables)'); near(r.out.k, -1.45, 1e-9, 'Flesch–Kincaid grade −1.45 (outside the scale: shown, not clipped)'); ok(r.out.s === 6, 'six syllables'); }
{ const r = run([{ id: 'd', lang: 'de', body: 'Der Hund läuft schnell nach Hause.' }], [sc('f', 'readability', { formula: 'flesch' }), sc('a', 'readability', { formula: 'amstad' })]);
  ok(hasCode(r, 'formula_lang') && Number.isFinite(r.out.a), 'an English formula on a German text: code formula_lang; Amstad (German) has none'); }
{ const r = run([{ id: 'p', lang: 'en', body: 'no full stop in this line\nnor in this one' }], [sc('f', 'readability', { formula: 'flesch' })]);
  ok(hasCode(r, 'no_sentences'), 'a poem without sentence punctuation: code no_sentences'); }
for (const [w, s] of [['table', 2], ['wanted', 2], ['jumped', 1], ['boxes', 2], ['every', 2], ['beautiful', 3], ['the', 1], ['temperate', 3], ['complexion', 3], ['idea', 3]]) ok(X.sylEn(w) === s, `English syllables: ${w} = ${s}`);

// ---- 3. lexical diversity: the Gettysburg Address (Bliss copy, public domain), cross-checked with lexical-diversity 0.1.1 (Kyle) ----
const GETTY = `Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.
Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.
But, in a larger sense, we can not dedicate -- we can not consecrate -- we can not hallow -- this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us -- that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion -- that we here highly resolve that these dead shall not have died in vain -- that this nation, under God, shall have a new birth of freedom -- and that government of the people, by the people, for the people, shall not perish from the earth.`;
{ const r = run([{ id: 'g', lang: 'en', body: GETTY }], [sc('N', 'tokens'), sc('V', 'types'), sc('ttr', 'ttr'), sc('m', 'mattr', { window: 50 }), sc('d', 'mtld'), sc('h', 'hdd'), sc('k', 'yuleK'), sc('v1', 'hapax'), sc('s', 'sentences'), sc('fre', 'readability', { formula: 'flesch' }), sc('b', 'heaps')]);
  ok(r.out.N === 272 && r.out.V === 138 && r.out.v1 === 90, 'Gettysburg: 272 tokens, 138 types, 90 hapax legomena');
  ok(r.out.s === 10, 'Gettysburg: 10 sentences');
  near(r.out.m, 0.7664574, 1e-7, 'MATTR, window 50 (Covington & McFall 2010; lexical-diversity mattr)');
  near(r.out.d, 58.131408, 1e-6, 'MTLD, threshold 0.72 (McCarthy & Jarvis 2010; lexical-diversity mtld)');
  near(r.out.h, 0.8263084, 1e-7, 'HD-D, sample 42 (McCarthy & Jarvis 2007; lexical-diversity hdd)');
  near(r.out.k, 110.564446, 1e-6, "Yule's K (Yule 1944)");
  ok(r.out.fre > 60 && r.out.fre < 72, `Flesch Reading Ease ${r.out.fre.toFixed(1)} (asserted as a range: syllable counters differ between tools)`);
  ok(r.out.b > 0.6 && r.out.b < 1, `Heaps β on a short speech: ${r.out.b.toFixed(3)}`); }
{ const r = run([{ id: 't', lang: 'en', body: 'the cat sat on the mat and the dog sat on the log' }], [sc('ttr', 'ttr'), sc('m', 'mattr', { window: 5 }), sc('d', 'mtld'), sc('k', 'yuleK'), sc('c', 'herdanC'), sc('g', 'guiraudR')]);
  near(r.out.ttr, 8 / 13, 1e-12, 'toy text: TTR 8/13'); near(r.out.m, 0.911111, 1e-6, 'MATTR(5) = 0.911111 (lexical-diversity)'); near(r.out.d, 13, 1e-12, 'MTLD = 13 (one factor at token 10, a final partial factor of 0)');
  near(r.out.k, 946.745562, 1e-6, "Yule's K"); near(r.out.c, 0.8107145, 1e-7, 'Herdan C'); near(r.out.g, 2.2188008, 1e-7, 'Guiraud R'); }
{ // TTR falls with length, MATTR does not (the length bias: Tweedie & Baayen 1998)
  const r = run([{ id: 'g', lang: 'en', body: GETTY }], [{ id: 't', kind: 'series', of: 'ttrCurve', steps: 10 }, { id: 'm', kind: 'series', of: 'mattrCurve', steps: 10, window: 25 }, { id: 'n', kind: 'series', of: 'prefixN', steps: 10 }]);
  ok(r.out.t[1] - r.out.t[9] > 0.15 && Math.abs(r.out.m[3] - r.out.m[9]) < 0.06 && r.out.n[9] === 272, 'the length bias: TTR falls with the prefix length, MATTR stays'); }

// ---- 4. Zipf and Heaps ----
{ const z = []; for (let r = 1; r <= 2000; r++) for (let i = 0; i < Math.max(1, Math.round(20000 / r)); i++) z.push('w' + r);
  const r = run([{ id: 'z', body: z.join(' ') }], [sc('a', 'zipf'), sc('b', 'zipf', { fit: 'mle', xmin: 10 }), { id: 'f', kind: 'series', of: 'rankFreq', top: 5 }]);
  near(r.out.a, 1, 0.002, 'Zipf OLS on an exact f = 20000/r text gives α = 1'); near(r.out.b, 1, 0.06, 'Zipf by the discrete MLE (Clauset et al. 2009, x_min = 10)'); ok(JSON.stringify(r.out.f) === '[20000,10000,6667,5000,4000]', 'rank–frequency series'); }
{ const r = run([{ id: 'z', body: 'a b c' }], [sc('a', 'zipf')]); ok(Number.isNaN(r.out.a) && hasCode(r, 'few_types'), 'Zipf with < 5 types: NaN, code few_types'); }

// ---- 5. Unicode, scripts, tokens ----
ok('ΟΔΥΣΣΕΥΣ'.toLowerCase().codePointAt(7) === 0x3C2, 'final sigma: "ΟΔΥΣΣΕΥΣ".toLowerCase() ends in ς U+03C2 (SpecialCasing Final_Sigma)');
ok('ά'.normalize('NFC') === 'ά' && [...'ἄνδρα'.normalize('NFD')].length === 7 && [...'ἄνδρα'.normalize('NFC')].length === 5, 'NFC: oxia U+1F71 → tonos U+03AC; ἄνδρα is 5 code points NFC, 7 NFD');
{ const r = run([{ id: 'a', lang: 'grc', body: 'ἄνδρα ἄνδρα'.normalize('NFD') + ' ' + 'ἄνδρα'.normalize('NFC') + ' ά ά' }], [sc('V', 'types'), sc('N', 'tokens')]);
  ok(r.out.V === 2 && r.out.N === 5, 'NFD and NFC input, oxia and tonos: the same types after normalisation'); }
{ const r = run([{ id: 'a', lang: 'grc', body: 'λόγος λόγοσ' }], [sc('V', 'types')], { normalize: { foldSigma: true } }); ok(r.out.V === 1, 'foldSigma: ς and σ are one letter'); }
{ const r = run([{ id: 'a', lang: 'grc', body: "ἀλλ' ἀλλ’ ἀλλʼ ἀλλ᾽" }], [sc('V', 'types'), sc('N', 'tokens')]); ok(r.out.V === 1 && r.out.N === 4, "four elision apostrophes (' ’ ʼ ᾽) are one: ἀλλ’"); }
{ const r = run([{ id: 'a', lang: 'grc', body: 'τί λέγεις; οὐδέν. ἀλλὰ· ναί' }], [sc('s', 'sentences')]); ok(r.out.s === 3, 'Greek: ";" (after NFC) ends a question, "·" does not end a sentence'); }
{ const r = run([{ id: 'z', lang: 'zh', body: '我们学习中文。' }], [sc('N', 'tokens'), sc('V', 'types')]); ok(r.out.N === 6 && r.out.V === 6, 'Chinese: characters as tokens by default (deterministic)'); }
{ const r = run([{ id: 'z', lang: 'zh', body: '我们学习中文' }], [sc('N', 'tokens')], { normalize: { segment: 'words' } }); ok(r.out.N >= 2 && r.out.N <= 6 && (hasCode(r, 'segmenter_approx') || hasCode(r, 'no_segmenter')), `Chinese words by Intl.Segmenter: ${r.out.N} words, code segmenter_approx (ICU dictionaries differ by browser)`); }
{ const r = run([{ id: 'l', lang: 'la', body: 'arma virumque cano' }], [sc('N', 'tokens'), sc('f', 'freq', { word: '-que' })], { normalize: { enclitics: true } }); ok(r.out.N === 4 && r.out.f === 1, 'Latin enclitic -que split off (virumque → virum + -que)'); }
{ const r = run([{ id: 'e', lang: 'en', body: 'well-\nknown 1066 and 3.14' }], [sc('N', 'tokens')]); ok(r.out.N === 2, 'a line-end hyphen joined, numbers dropped by default'); }
{ const r = run([{ id: 'e', lang: 'en', body: '' }], [sc('N', 'tokens'), sc('t', 'ttr'), sc('m', 'mtld'), sc('f', 'readability', { formula: 'flesch' })]);
  ok(r.out.N === 0 && Number.isNaN(r.out.t) && Number.isNaN(r.out.m) && Number.isNaN(r.out.f) && hasCode(r, 'empty'), 'an empty text: 0 tokens, ratios NaN with code empty, nothing throws'); }
{ const r = run([{ id: 'e', lang: 'en', body: 'word' }], [sc('c', 'herdanC'), sc('m', 'mattr')]); ok(Number.isNaN(r.out.c) && hasCode(r, 'too_short') && r.out.m === 1 && hasCode(r, 'window_gt_text'), 'one token: Herdan C undefined (too_short); MATTR = TTR (window_gt_text)'); }
{ const r = run([{ id: 'e', lang: 'en', body: 'a a a a' }], [sc('t', 'ttr'), sc('k', 'yuleK'), sc('h', 'honoreR')]); ok(r.out.t === 0.25 && Math.abs(r.out.k - 1e4 * 12 / 16) < 1e-9, 'all tokens alike: TTR 1/N, Yule K = 10⁴(N² − N)/N²'); }

// ---- 6. KWIC, keyness, Delta ----
{ const r = run([{ id: 'g', lang: 'en', body: GETTY }], [{ id: 'k', kind: 'scene', of: 'kwic', word: 'nation', window: 4 }]);
  const hits = r.out.k.items.filter(i => i.c === 'hi'); ok(hits.length === 5 && hits.every(i => /^nation$/i.test(i.s)) && r.out.k.items.every(i => !i.s || i.s.length <= 64), 'KWIC: the 5 lines of "nation", surface forms, ≤ 64 characters'); }
{ const r = run([{ id: 'a', lang: 'en', body: 'cat cat cat dog' }, { id: 'b', lang: 'en', body: 'dog dog dog dog cat' }], [sc('g', 'keyness', { text: 'a', ref: 'b', word: 'cat' }), sc('lr', 'keyness', { text: 'a', ref: 'b', word: 'cat', measure: 'logRatio' })]);
  ok(r.out.g > 0 && Math.abs(r.out.lr - Math.log2((3 / 4) / (1 / 5))) < 1e-12, 'keyness: signed G² and Log Ratio (Hardie 2014)'); }
{ const t = ['the the the and of a cat sat', 'the the the and of a dog sat', 'of of of of a a a a and', 'the and of a a cat dog sat'].map((b, i) => ({ id: 't' + i, lang: 'en', body: b }));
  const r = run(t, [sc('ab', 'delta', { a: 't0', b: 't1', mfw: 6 }), sc('ac', 'delta', { a: 't0', b: 't2', mfw: 6 }), sc('cos', 'delta', { a: 't0', b: 't1', mfw: 6, variant: 'cosine' }), { id: 'm', kind: 'scene', of: 'deltaMap', mfw: 6 }]);
  ok(r.out.ab < r.out.ac && r.out.cos >= 0 && r.out.cos < 1, `Burrows' Delta: the two "the"-texts are nearest (${r.out.ab.toFixed(3)} < ${r.out.ac.toFixed(3)}); Cosine Delta in [0, 2]`);
  ok(r.out.m.items.filter(i => i.k === 'poly').length === 16, 'the Delta heat map: 4 × 4 cells'); }
{ const D = X.deltaMatrix([['a', 'b'], ['a', 'c'], ['a', 'd']], 4, 'burrows', []); ok(D.words.indexOf('a') < 0, "a word with the same frequency in every text (sd = 0) is dropped (code sd_zero)"); }

// ---- 7. quantitative metre: scansions of classic lines (any school edition; Hypotactic; Pedecerto) ----
const scan = (line, lang, pat, opts) => { const cs = []; const r = X.scan(line, lang, pat, opts || {}, cs); r.codes = cs; return r; };
{ const r = scan('Arma virumque cano, Troiae qui primus ab oris', 'la', 'hexameter');
  ok(r.readings[0].feet === 'DDSSDS' && r.readings[0].caesurae.includes('penthemimeral'), 'Aeneid 1.1: DDSSDS, penthemimeral caesura after cano');
  ok(r.readings.length === 2 && r.readings[1].notes.includes('spondeiazon'), 'without macrons a second, rarer reading (a spondeiazon) is also valid — and ranked second');
  ok(scan('Arma virumque cano, Troiae qui prīmus ab ōris', 'la', 'hexameter').readings.length === 1, '… with the macrons of prīmus, ōris the scansion is unique'); }
ok(scan('litora, multum ille et terris iactatus et alto', 'la', 'hexameter').readings.map(x => x.feet).join() === 'DSSSDS', 'Aeneid 1.3: DSSSDS with the elisions mult(um) ill(e) et (unique)');
ok(scan('Ītaliam fātō profugus Lāvīnjaque vēnit', 'la', 'hexameter').readings.map(x => x.feet).join() === 'DSDSDS', 'Aeneid 1.2: DSDSDS when the author marks the consonantal i (Lavīnja-) and the long vowels');
ok(scan('Italiam fato profugus Laviniaque venit', 'la', 'hexameter').readings.every(x => x.feet !== 'DSDSDS'), 'Aeneid 1.2 unmarked: the true reading is not found (synizesis of -nia- needs the author) — an edge case to teach');
ok(scan('Tityre, tu patulae recubans sub tegmine fagi', 'la', 'hexameter').readings.map(x => x.feet).join() === 'DDDSDS', 'Eclogue 1.1: DDDSDS');
ok(scan('quidquid id est, timeo Danaos et dona ferentes', 'la', 'hexameter').readings.map(x => x.feet).join() === 'DDDSDS', 'Aeneid 2.49: DDDSDS');
{ const r = scan('Arma gravi numero violentaque bella parabam', 'la', 'hexameter'); ok(r.readings.length === 1 && r.readings[0].feet === 'DDDDDS' && r.readings[0].syl.length === 17, 'Ovid, Amores 1.1.1: DDDDDS, 17 syllables'); }
{ const r = scan('edere, materia conveniente modis.', 'la', 'pentameter'); ok(r.readings.length === 1 && r.readings[0].feet === 'DDDD' && r.readings[0].caesurae.includes('diaeresis') && r.readings[0].q === 'LSSLSSLLSSLSSL', 'Amores 1.1.2 pentameter: – ⏑⏑ – ⏑⏑ – ‖ – ⏑⏑ – ⏑⏑ –, the diaeresis at the half'); }
{ const r = scan('μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος', 'grc', 'hexameter'); ok(r.readings.length === 1 && r.readings[0].feet === 'DDSDDS' && r.readings[0].notes.includes('synizesis') && r.readings[0].syl.length === 16, 'Iliad 1.1: DDSDDS with the synizesis of -εω (16 syllables)'); }
{ const r = scan('ἄνδρα μοι ἔννεπε, μοῦσα, πολύτροπον, ὃς μάλα πολλὰ', 'grc', 'hexameter'); ok(r.readings.length === 1 && r.readings[0].feet === 'DDDDDS' && r.readings[0].cost === 1, 'Odyssey 1.1: DDDDDS with the epic correption of μοι (cost 1)'); }
ok(scan('Πηλεύς τε Θέτις τε', 'grc', 'hexameter').codes.includes('no_scansion'), 'a line that is not a hexameter: no reading, code no_scansion');
for (const ln of ['Arma virumque cano, Troiae qui primus ab oris', 'Tityre, tu patulae recubans sub tegmine fagi']) { const r = scan(ln, 'la', 'hexameter'); ok(r.readings.every(x => x.syl.length === 12 + [...x.feet.slice(0, 5)].filter(f => f === 'D').length), 'syllables = 12 + dactyls in feet 1–5 (' + ln.slice(0, 12) + '…)'); }
{ const r = scan('bona est', 'la', 'hendecasyllable'); ok(r.base.notes.some(x => x.k === 'prodelision'), 'prodelision: bona est → bona’st'); }

// ---- 8. English metre and rhyme: Shakespeare, Sonnet 18 (1609 Quarto, modernised) ----
const S18 = "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date:\nSometime too hot the eye of heaven shines,\nAnd often is his gold complexion dimm'd;\nAnd every fair from fair sometime declines,\nBy chance or nature's changing course untrimm'd;\nBut thy eternal summer shall not fade,\nNor lose possession of that fair thou ow'st;\nNor shall Death brag thou wander'st in his shade,\nWhen in eternal lines to time thou grow'st:\nSo long as men can breathe or eyes can see,\nSo long lives this, and this gives life to thee.";
{ const outs = [sc('sch', 'scheme', { scheme: 'ABAB CDCD EFEF GG' }), sc('bad', 'scheme', { scheme: 'ABBA ABBA CDE CDE' }), sc('r13', 'rhyme', { a: 1, b: 3 }), sc('r12', 'rhyme', { a: 1, b: 2 })];
  for (let i = 1; i <= 14; i++) outs.push(sc('f' + i, 'metreFit', { line: i }), sc('s' + i, 'syllables', { line: i }));
  const r = run([{ id: 's', lang: 'en', body: S18 }], outs, { metre: { pattern: 'iambic5' } });
  ok(r.out.sch === 0 && r.out.bad > 0, 'Sonnet 18: rhyme scheme ABAB CDCD EFEF GG (0 disagreeing pairs); the Petrarchan scheme does not fit');
  ok(r.out.r13 === 1 && r.out.r12 === 0, 'day / May rhyme, day / temperate do not');
  ok([...Array(14)].every((_, i) => r.out['s' + (i + 1)] === 10), 'every line has 10 syllables (heaven, every as disyllables)');
  ok([...Array(14)].every((_, i) => r.out['f' + (i + 1)] === 0), 'every line fits iambic pentameter with no stress-maximum violation (Kiparsky 1975)'); }
{ const r = X.enFit('Sometime too hot the eye of heaven shines,', 'iambic5', new Map()); ok(r.best && r.best.name === 'inversion', 'Sonnet 18.5 "Sometime too hot…": an initial inversion'); }
{ const r = X.enFit('The curfew tolls the knell of parting day', 'iambic5', new Map()); ok(r.best && r.best.hard === 0 && r.syllables === 10, 'Gray, Elegy 1: a regular iambic pentameter'); }
{ const r = X.enFit('Shall I compare thee to a summer day of the year', 'iambic5', new Map()); ok(!r.best, 'a line of 13 syllables does not fit (metreFit NaN, code syllable_count)'); }

// ---- 9. checks ----
const codes = s => X.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
ok(codes({ model: { texts: [{ id: 'a', body: 'x' }] }, outputs: [sc('d', 'delta', { a: 'a', b: 'a' })] }).includes('value@outputs[0].of'), 'check: Delta needs 3 texts');
ok(codes({ model: { texts: [{ id: 'a', body: 'x' }] }, outputs: [sc('d', 'scansions', { line: 1 })] }).includes('ref@outputs[0].of'), 'check: scansion needs model.metre');
ok(codes({ model: { texts: [{ id: 'a' }] }, outputs: [] }).includes('value@model.texts[0].body'), 'check: a text without its body');
ok(codes({ model: { texts: [{ id: 'a', body: 'x'.repeat(60001) }] }, outputs: [] }).includes('size@model.texts[0].body'), 'check: a body over 60 000 characters');
ok(codes({ model: { texts: [{ id: 'a', body: 'x' }] }, outputs: [sc('f', 'freq', { word: 'x'.repeat(65) })] }).includes('value@outputs[0].word'), 'check: a query word over 64 characters');

// ---- 10. the sim adapter, the Worker source, speed ----
const spec = { format: 'noema.sim-spec/v1', engine: 'text@1', params: [{ id: 'w', kind: 'slider', label: 'w', min: 5, max: 100, default: 50 }],
  model: { texts: [{ id: 'g', lang: 'en', body: GETTY }, { id: 'v', lang: 'la', body: 'Arma virumque cano, Troiae qui primus ab oris\nlitora, multum ille et terris iactatus et alto' }], metre: { pattern: 'hexameter', lang: 'la' } },
  outputs: [sc('m', 'mattr', { text: 'g', window: 'w' }), sc('n', 'scansions', { text: 'v', line: 1 }), sc('f1', 'foot', { text: 'v', line: 1, n: 3 }), { id: 'sc', kind: 'scene', of: 'scansion', text: 'v', line: 2 }, { id: 'rf', kind: 'series', of: 'rankFreq', text: 'g', top: 50 }] };
ok(!X.checkSpec(spec).some(p => p.level === 'error'), 'the spec has no errors');
const inst = X.engine.create(spec, { seed: 1 }), o = inst.run({ w: 50 });
near(o.m, 0.7664574, 1e-7, 'adapter: MATTR with the window from a slider'); ok(o.n === 2 && o.f1 === 0, 'adapter: 2 scansions of Aeneid 1.1; foot 3 of the best is a spondee');
ok(o.sc.items.some(i => i.s === '–') && o.sc.items.some(i => i.s === '⏑') && o.sc.items.some(i => i.s === '‖'), 'the scansion scene: – ⏑ over the syllables, foot bars, the caesura ‖');
ok(o.rf.length === 50 && o.rf[0] === 13, 'rank–frequency series (the most frequent word, "that", 13 times)');
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + X.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(spec, { seed: 1 }).run({ w: 50 }); ok(JSON.stringify(w) === JSON.stringify(o), 'the Worker source gives the same outputs in a fresh global'); }
{ const big = (GETTY + '\n').repeat(40).slice(0, 59000), t1 = Date.now();
  const r = run([{ id: 'b', lang: 'en', body: big }, { id: 'c', lang: 'en', body: big.slice(0, 30000) }, { id: 'd', lang: 'en', body: big.slice(10000, 40000) }],
    [sc('m', 'mattr', { window: 500 }), sc('d', 'mtld'), sc('h', 'hdd'), sc('z', 'zipf'), sc('de', 'delta', { a: 'b', b: 'c', mfw: 500 }), sc('a', 'assoc', { w1: 'the', w2: 'people', measure: 'g2', span: 10 }), { id: 'k', kind: 'scene', of: 'kwic', word: 'the', max: 40 }, { id: 'mc', kind: 'series', of: 'mtldCurve', steps: 200 }]);
  const ms = Date.now() - t1; ok(ms < 2000 && Number.isFinite(r.out.de), `the heaviest allowed run (60 000 characters, Delta on 500 MFW, MTLD curve of 200 prefixes) takes ${ms} ms (< 2 s)`); }
{ const t1 = Date.now(); for (let i = 0; i < 10; i++) X.run(spec, { w: 40 + i }, {}); ok((Date.now() - t1) / 10 < 50, `a typical run < 50 ms (${(Date.now() - t1) / 10} ms)`); }
{ const t1 = Date.now(); const r = scan('ā ā ā ā ā ā ā ā ā ā ā ā ā ā ā ā ā', 'la', 'trimeter'); ok(Date.now() - t1 < 2000, 'a pathological line for the trimeter matcher stays bounded'); }

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
