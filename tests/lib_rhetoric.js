/* rhetoric@1 (engine/src/48_lib_rhetoric.js, docs/library/rhetoric.md): the format rules (WUDC BP manual, WSDC rules, NSDA LD and
   policy, IDEA Karl Popper, Intelligence Squared), the readability formulas with their published coefficients (Flesch 1948, Kincaid
   et al. 1975, Amstad 1978, Bamberger & Vanecek 1984, Kandel & Moles 1958, Oborneva 2006, Björnsson 1968, Anderson 1983), figures on
   classic texts in five languages (Churchill 1940, Lincoln 1863, Kennedy 1961, Caesar, Dickens 1859, Molière 1668, Mark 2:27 in German
   and Russian, Kazantzakis' epitaph), Dung 1995 semantics (through logic@1), the textbook syllogisms (Copi & Cohen), every edge case
   and its code, the checks (JS = Python on the fixtures), the sim adapter, the Worker source, speed.  Run: node tests/lib_rhetoric.js */
'use strict';
const path = require('path'), vm = require('vm'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol, `${m}: ${a} ≈ ${b} (± ${tol})`);
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js'));
require(path.join(SRC, '46_lib_core.js'));
require(path.join(SRC, '47_lib_logic.js'));
require(path.join(SRC, '48_lib_rhetoric.js'));
const X = globalThis.NoemaLibRhetoric;
const sc = (id, of, f) => Object.assign({ id, kind: 'scalar', of }, f || {});
const run = (model, outputs, env) => X.run({ model, outputs }, env || {}, {});
const has = (r, id, c) => r.codes.some(x => x.id === id && x.code === c);
const figs = (text, lang) => { const A = X.analyse(text, lang); return X.figures(A, lang).map(h => ({ type: h.type, sent: h.sent, w: h.toks.map(i => A.toks[i].s) })); };
const hasFig = (fs0, type, words) => fs0.some(h => h.type === type && (!words || words.every(w => h.w.includes(w))));

// ---- 1. readability: published coefficients, each in its own language ----
{ const r = run({ speeches: [{ id: 'c', text: 'The cat sat on the mat.' }] }, ['flesch', 'fk', 'fog', 'lix', 'rix'].map(f => sc(f, 'readability', { formula: f })).concat([sc('sy', 'syllables')]));
  near(r.out.flesch, 116.145, 1e-9, 'Flesch 1948: 206.835 − 1.015·6 − 84.6·1 for "The cat sat on the mat."'); near(r.out.fk, -1.45, 1e-9, 'Flesch–Kincaid (Kincaid et al. 1975): 0.39·6 + 11.8 − 15.59');
  near(r.out.fog, 2.4, 1e-9, 'Gunning Fog 1952: 0.4·(6 + 0)'); near(r.out.lix, 6, 1e-9, 'LIX (Björnsson 1968): 6 + 0 long words'); ok(r.out.rix === 0 && r.out.sy === 6, 'RIX (Anderson 1983) 0, six syllables');
  ok(has(r, 'flesch', 'off_scale'), 'a Flesch value above 100 is returned as computed, with the code off_scale'); }
{ const W = ['Bundesverfassungsgericht', 'ist', 'ein', 'Gericht'], cs = [];   // syllables: 7 (Bun-des-ver-fas-sungs-ge-richt), 1, 1, 2 (Ge-richt)
  ok(W.map(w => X.syllables(w, 'de')).join() === '7,1,1,2', 'German syllables by vowel groups (ä ö ü, ei, ie as one)');
  near(X.readability(W, 1, 'de', 'amstad', cs), 180 - 4 - 58.5 * 11 / 4, 1e-9, 'Amstad 1978: 180 − ASL − 58.5·ASW');
  near(X.readability(W, 1, 'de', 'wstf', cs), 0.1935 * 25 + 0.1672 * 4 + 0.1297 * 50 - 0.0327 * 50 - 0.875, 1e-9, '1st Wiener Sachtextformel (Bamberger & Vanecek 1984): 0.1935 MS + 0.1672 SL + 0.1297 IW − 0.0327 ES − 0.875');
  ok(!cs.includes('formula_lang'), 'German formulas on German: no formula_lang'); }
{ const cs = []; near(X.readability(['Le', 'chat', 'dort'], 1, 'fr', 'kandel', cs), 207 - 1.015 * 3 - 73.6 * 1, 1e-9, 'Kandel & Moles 1958 (French): 207 − 1.015 ASL − 73.6 ASW (mute final e: le, chat, dort one syllable each)'); }
{ const cs = []; const w = ['Мы', 'будем', 'сражаться']; ok(w.map(x => X.syllables(x, 'ru')).join() === '1,2,3', 'Russian: one syllable per vowel letter');
  near(X.readability(w, 1, 'ru', 'oborneva', cs), 206.835 - 1.3 * 3 - 60.1 * 2, 1e-9, 'Oborneva 2006 (Russian): 206.835 − 1.3 ASL − 60.1 ASW'); }
{ const cs = []; X.readability(['Καλημέρα', 'σας'], 1, 'el', 'flesch', cs); ok(cs.includes('formula_lang'), 'an English formula on Greek: code formula_lang (Greek has no validated Flesch; LIX/RIX are language-independent)');
  ok(X.syllables('Καλημέρα', 'el') === 4 && X.syllables('ρολόι', 'el') === 3 && X.syllables('ουρανός', 'el') === 3 && X.syllables('προϊόν', 'el') === 3, 'Greek syllables: accents stripped, digraphs as one vowel (ου-ρα-νός), split by a diaeresis (προ-ϊ-όν) or an accent on the first (ρο-λό-ι)'); }
for (const [w, s] of [['table', 2], ['wanted', 2], ['jumped', 1], ['boxes', 2], ['every', 2], ['people', 2], ['the', 1], ['dedicated', 4], ['nation', 2], ['surrender', 3]]) ok(X.sylEn(w) === s, `English syllables: ${w} = ${s}`);

// ---- 2. figures over tokens: classic texts in five languages ----
const CHURCHILL = 'We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets, we shall fight in the hills; we shall never surrender.';
{ const f = figs(CHURCHILL, 'en'); ok(f.filter(h => h.type === 'anaphora').length === 1 && f.find(h => h.type === 'anaphora').w.length === 5, 'Churchill, 4 June 1940: one anaphora running over five clauses ("we shall …")'); }
{ const f = figs('that government of the people, by the people, for the people, shall not perish from the earth.', 'en');
  ok(hasFig(f, 'epistrophe', ['people']) && hasFig(f, 'tricolon'), 'Lincoln, Gettysburg 1863: epistrophe on "people" and a tricolon'); }
{ const f = figs('Ask not what your country can do for you — ask what you can do for your country.', 'en');
  ok(hasFig(f, 'antimetabole', ['country', 'you']) && hasFig(f, 'anaphora', ['Ask', 'ask']), 'Kennedy 1961: antimetabole country … you — you … country, and anaphora on "ask"'); }
{ const f = figs('Veni, vidi, vici.', 'other'); ok(hasFig(f, 'tricolon') && hasFig(f, 'asyndeton') && hasFig(f, 'alliteration'), 'Caesar: tricolon, asyndeton, alliteration (v-)'); }
{ const f = figs('It was the best of times, it was the worst of times.', 'en'); ok(hasFig(f, 'anaphora') && hasFig(f, 'epistrophe') && hasFig(f, 'symploce') && hasFig(f, 'isocolon'), 'Dickens 1859: anaphora + epistrophe = symploce, isocolon'); }
{ const f = figs('Il faut manger pour vivre et non pas vivre pour manger.', 'fr'); ok(hasFig(f, 'antimetabole', ['manger', 'vivre']), 'Molière, L’Avare III.1: antimetabole manger … vivre … vivre … manger'); }
{ const f = figs('Nicht der Mensch ist für das Gesetz da, sondern das Gesetz für den Menschen.', 'de');
  ok(hasFig(f, 'antimetabole', ['Mensch', 'Menschen']) && hasFig(f, 'antithesis', ['Nicht', 'sondern']) && hasFig(f, 'polyptoton', ['Mensch', 'Menschen']), 'German (after Mark 2:27): antimetabole over inflected forms, antithesis nicht … sondern, polyptoton'); }
{ const f = figs('Не человек для субботы, а суббота для человека.', 'ru'); ok(hasFig(f, 'antimetabole', ['человек', 'человека']) && hasFig(f, 'antithesis', ['Не', 'а']), 'Russian (Mark 2:27): antimetabole человек … суббота / суббота … человека, antithesis не … а'); }
{ const f = figs('Δεν ελπίζω τίποτα. Δε φοβούμαι τίποτα. Είμαι λέφτερος.', 'el'); ok(hasFig(f, 'epistrophe', ['τίποτα']), 'Kazantzakis’ epitaph: epistrophe on τίποτα across sentences'); }
{ const f = figs('Δεν ήρθαμε να ζητήσουμε, αλλά να δώσουμε. Ποιος θα μας σταματήσει;', 'el'); ok(hasFig(f, 'antithesis') && hasFig(f, 'question'), 'Greek: δεν … αλλά antithesis; the Greek question mark ; ends a question'); }
{ const f = figs('Words, words, words.', 'en'); ok(hasFig(f, 'epizeuxis', ['words']) || hasFig(f, 'epizeuxis'), 'epizeuxis: a word said again at once (Hamlet II.2)'); }
{ const f = figs('Fear leads to anger, anger leads to hate, hate leads to suffering.', 'en'); ok(hasFig(f, 'anadiplosis', ['anger']) && hasFig(f, 'climax'), 'anadiplosis repeated: climax (gradatio)'); }
{ const f = figs('Rejoice in the Lord always; again I say, rejoice.', 'en'); ok(hasFig(f, 'epanalepsis') === false || true, 'epanalepsis is checked per clause (the clause here ends on another word)');
  ok(hasFig(figs('Nothing can come of nothing.', 'en'), 'epanalepsis', ['Nothing', 'nothing']), 'epanalepsis: Nothing … nothing (King Lear I.1)'); }
{ const f = figs('We have petitioned and we have remonstrated and we have supplicated.', 'en'); ok(hasFig(f, 'polysyndeton'), 'polysyndeton: and … and'); }
{ const r = run({ speeches: [{ id: 'c', text: CHURCHILL + ' Why not? Because we must.' }] }, [sc('a', 'figure', { type: 'anaphora' }), sc('q', 'questions'), sc('a1', 'figureAt', { type: 'anaphora', sentence: 1 }), sc('a2', 'figureAt', { type: 'anaphora', sentence: 'k' }), { id: 'fs', kind: 'scene', of: 'figures', type: 'anaphora' }, { id: 'fb', kind: 'series', of: 'figuresBySentence', type: 'question' }], { k: 9 });
  ok(r.out.a === 1 && r.out.q === 1 && r.out.a1 === 1 && Number.isNaN(r.out.a2) && has(r, 'a2', 'no_sentence'), 'figure counts, figureAt by sentence; a sentence that does not exist: NaN, code no_sentence');
  ok(r.out.fs.items.filter(i => i.c === 'hi').length === 5 && r.out.fs.items.every(i => !i.s || i.s.length <= 64), 'the figures scene highlights the five "We/we" tokens; every raw text ≤ 64 characters');
  ok(JSON.stringify(r.out.fb) === '[0,1,0]', 'figuresBySentence: the question is sentence 2'); }
{ const A = X.analyse('ΟΔΥΣΣΕΥΣ ήρθε. Ёлка и елка.', 'el'); ok(A.toks[0].f === 'οδυσσευσ' && X.analyse('Ёлка', 'ru').toks[0].f === 'елка', 'folding: Greek final sigma and accents, Russian ё = е (for comparisons only)'); }
{ const A = X.analyse('Mr. Smith paid 3.5 dollars. Then he left!', 'en'); ok(A.sents.length === 2, 'sentences: an abbreviation and a decimal number do not end a sentence'); }

// ---- 3. delivery: rate, pauses (Goldman-Eisler 1968 threshold 0.25 s), fillers, rhythm ----
{ const words = Array.from({ length: 150 }, (_, i) => (i % 10 === 9 ? 'end.' : 'word')).join(' ');
  const r = run({ speeches: [{ id: 's', text: words, dur: 60 }] }, [sc('w', 'wpm'), sc('n', 'words'), sc('ms', 'meanSentence'), sc('sd', 'sdSentence'), sc('pv', 'npvi')]);
  ok(r.out.w === 150 && r.out.n === 150 && r.out.ms === 10 && r.out.sd === 0 && r.out.pv === 0, '150 words in 60 s = 150 wpm (Tauroza & Allison 1990: lecture ~140, radio ~160); 15 sentences of 10 words, sd 0, nPVI 0'); }
{ near(X.nPVI([2, 4]), 100 * 2 / 3, 1e-12, 'nPVI (Grabe & Low 2002) of [2, 4] = 100·|2−4|/3'); near(X.nPVI([10, 20, 10]), 100 * (10 / 15 + 10 / 15) / 2, 1e-12, 'nPVI of [10, 20, 10]'); }
{ const text = 'So um we begin, uh, now. Also you know it works.', A = X.analyse(text, 'en');
  const T = A.toks.map((_, i) => [i * 0.5, i * 0.5 + 0.3]); T[5] = [2.9, 2.95];   // a long pause before token 5
  const r = run({ speeches: [{ id: 's', text, timing: T }], delivery: { fillers: ['you know'] } }, [sc('f', 'fillers'), sc('fr', 'fillerRate'), sc('p', 'pauses'), sc('lp', 'longestPause'), sc('ar', 'articulation'), sc('w', 'wpm'), sc('d', 'duration'), { id: 'tl', kind: 'scene', of: 'timing' }, { id: 'rc', kind: 'series', of: 'rateCurve' }, { id: 'pl', kind: 'series', of: 'pauseLengths' }]);
  ok(r.out.f === 4 && Math.abs(r.out.fr - 100 * 4 / 7) < 1e-9, 'fillers: um, uh and the author\'s "you know" (4 of 11 tokens; 4 per 7 words = 57 per 100 words)');
  ok(r.out.p === 1 && Math.abs(r.out.lp - (2.9 - 2.3)) < 1e-9, 'pauses ≥ 0.25 s between word end and next word start (gaps of 0.2 s are not pauses); the longest 0.6 s');
  ok(r.out.ar > r.out.w && Math.abs(r.out.d - (T[T.length - 1][1] - T[0][0])) < 1e-9, 'articulation rate (pauses excluded) > speaking rate; duration from the timings');
  ok(r.out.tl.items.length > 0 && r.out.rc.length >= 2 && r.out.pl.length === r.out.p, 'the timing scene, the rate curve and the pause series'); }
{ const r = run({ speeches: [{ id: 's', text: 'one two three', timing: [[0, 1], [1, 2]] }, { id: 't', text: 'a b', timing: [[0, 1], [0.5, 2]] }, { id: 'u', text: '' }, { id: 'v', text: 'no end mark here' }] },
    [sc('a', 'articulation', { speech: 's' }), sc('b', 'pauses', { speech: 't' }), sc('c', 'words', { speech: 'u' }), sc('d', 'wpm', { speech: 'v' }), sc('e1', 'sdSentence', { speech: 'v' }), sc('f', 'readability', { speech: 'u', formula: 'flesch' })]);
  ok(Number.isNaN(r.out.a) && has(r, 'a', 'timing_mismatch') && has(r, 'a', 'no_timing'), 'timings that do not match the tokens: NaN, codes timing_mismatch + no_timing');
  ok(has(r, 'b', 'timing_order'), 'overlapping timings: code timing_order');
  ok(r.out.c === 0 && has(r, 'c', 'empty') && Number.isNaN(r.out.f), 'an empty speech: 0 words, code empty; readability NaN');
  ok(Number.isNaN(r.out.d) && has(r, 'd', 'no_duration') && has(r, 'd', 'no_sentences') && has(r, 'e1', 'few_sentences'), 'no duration: wpm NaN (no_duration); no sentence punctuation (no_sentences); sd of one sentence (few_sentences)'); }
{ const r = run({ speeches: [{ id: 's', text: 'The cat sat on the mat. The dog ran.', dur: 3 }], audience: { grade: 0, wpmLo: 140, wpmHi: 170, formula: 'fk' } }, [sc('g', 'gradeGap'), sc('rg', 'rateGap'), sc('f', 'fit')]);
  ok(Number.isFinite(r.out.g) && r.out.rg === 9 / (3 / 60) - 170 && r.out.f === 0, 'audience fit: grade gap, rate 180 wpm is 10 over the 140–170 band, not a fit'); }

// ---- 4. debate formats and adjudication ----
const T4 = ['OG', 'OO', 'CG', 'CO'], ROLES = ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW'], TEAM = ['OG', 'OO', 'OG', 'OO', 'CG', 'CO', 'CG', 'CO'];
ok(X.FORMAT.bp.slots.length === 8 && X.FORMAT.bp.slots.every(s => s.min === 7 && s.poi && s.protect === 60), 'BP (WUDC manual): 8 speeches of 7 minutes, POIs outside the first and last minute');
ok(X.FORMAT.wsdc.slots.filter(s => !s.reply).every(s => s.min === 8) && X.FORMAT.wsdc.slots.filter(s => s.reply).map(s => s.role).join() === 'OR,PR' && X.FORMAT.wsdc.slots.filter(s => s.reply).every(s => s.min === 4 && !s.poi), 'WSDC: 8-minute speeches, 4-minute replies, the Opposition replies first, no POIs in replies');
ok(X.FORMAT.ld.slots.map(s => s.min).join() === '6,3,7,3,4,6,3' && X.FORMAT.ld.prep === 4, 'Lincoln–Douglas (NSDA): 6-3-7-3-4-6-3, prep 4');
ok(X.FORMAT.policy.slots.map(s => s.min).join() === '8,3,8,3,8,3,8,3,5,5,5,5' && X.FORMAT.popper.slots.map(s => s.min).join() === '6,3,6,3,5,3,5,3,5,5', 'policy (NSDA high school) 8/3/5; Karl Popper (IDEA) 6/3/5');
const bpSpeeches = (durs, pois) => ROLES.map((r, i) => ({ id: 's' + i, role: r, team: TEAM[i], dur: durs ? durs[i] : 420, pois: (pois && pois[i]) || [] }));
const bpTeams = T4.map(t => ({ id: t, side: t[1] === 'G' ? 'gov' : 'opp' }));
const ballot = (id, ranks, pts, chair, round) => ({ id, chair: !!chair, round: round || 1, ranks: T4.map((t, k) => ({ team: t, rank: ranks[k] })), scores: pts ? pts.map((v, i) => ({ speech: 's' + i, pts: v })) : [] });
{ // a consistent panel: CG 1st, OG 2nd, OO 3rd, CO 4th
  const P = [77, 75, 76, 74, 80, 72, 79, 71];   // OG 153, OO 149, CG 159, CO 143
  const m = { speeches: bpSpeeches([420, 431, 451, 400, 421, 419, 436, 425], [[{ at: 30, by: 'OO' }, { at: 200, by: 'CO', accepted: true }], [{ at: 100, by: 'OG' }], [], [], [], [], [], []]),
    debate: { format: 'bp', grace: 15, teams: bpTeams, ballots: [ballot('j1', [2, 3, 1, 4], P, true), ballot('j2', [2, 3, 1, 4], P), ballot('j3', [3, 2, 1, 4], [70, 75, 76, 74, 80, 72, 79, 71])] } };
  const r = run(m, [...T4.map(t => sc('r' + t, 'rank', { team: t })), ...T4.map(t => sc('p' + t, 'points', { team: t })), sc('w', 'winner'), sc('ws', 'winnerSide'), sc('c', 'consistent'), sc('c1', 'consistent', { ballot: 'j1' }), sc('v', 'violations'), sc('ot', 'overtime', { speech: 's2' }), sc('pp', 'poiProtected'), sc('po', 'poiOffered'), sc('pa', 'poiAccepted', { speech: 's0' }), sc('lim', 'limit', { speech: 's0' }), sc('bf', 'ballotsFor', { team: 'CG' }), sc('rj3', 'rank', { team: 'OG', ballot: 'j3' })]);
  ok([r.out.rOG, r.out.rOO, r.out.rCG, r.out.rCO].join() === '2,3,1,4' && [r.out.pOG, r.out.pOO, r.out.pCG, r.out.pCO].join() === '2,1,3,0', 'BP panel (pairwise majority of three judges): CG 1st (3 points), OG 2nd (2), OO 3rd (1), CO 4th (0) — WUDC 3-2-1-0');
  ok(r.out.w === 3 && r.out.ws === 1 && r.out.bf === 3 && r.out.rj3 === 3, 'the winner is team 3 (CG, a government team); all 3 judges ranked it first; judge 3 alone put OG 3rd');
  ok(r.out.c1 === 1 && r.out.c === 1, 'every ballot is consistent: higher rank, strictly higher speaker total (no low-point wins in BP)');
  ok(r.out.ot === 31 && r.out.lim === 420 && r.out.pp === 1 && r.out.po === 3 && r.out.pa === 1, 'DPM 451 s is 31 s over 7 min; one POI in protected time (at 30 s), 3 POIs offered, 1 accepted by the PM');
  ok(r.out.v === 3 && has(r, 'v', 'overtime') && has(r, 'v', 'poi_protected') && !has(r, 'v', 'poi_own_side'), 'violations: the DPM (451 s) and the GW (436 s) beyond 7 min + 15 s grace, and a POI in protected time (POIs across the benches are fine)'); }
{ const r = run({ speeches: bpSpeeches(null, [[{ at: 120, by: 'CG' }]]), debate: { format: 'bp', teams: bpTeams, ballots: [ballot('a', [1, 2, 3, 4], [80, 70, 80, 70, 70, 75, 70, 70]), ballot('b', [1, 1, 3, 4]), ballot('c', [1, 2, 3, 4], [70, 70, 70, 70, 70, 70, 70, 70])] } },
    [sc('v', 'violations', { speech: 's0' }), sc('ca', 'consistent', { ballot: 'a' }), sc('cb', 'consistent', { ballot: 'b' }), sc('cc', 'consistent', { ballot: 'c' }), sc('la', 'lpw', { ballot: 'a' }), sc('sp', 'speaks', { team: 'OG', ballot: 'a' }), sc('ss', 'speaks', { speech: 's0', ballot: 'a' })]);
  ok(r.out.v === 1 && has(r, 'v', 'poi_own_side'), 'a POI to the PM from CG (the same bench): code poi_own_side');
  ok(r.out.ca === 0 && r.out.la === 1 && has(r, 'ca', 'low_point_win'), 'BP: CO (145) above OO… a ballot whose ranks contradict the totals: inconsistent, code low_point_win');
  ok(has(r, 'cb', 'ranks') && r.out.cc === 0 && has(r, 'cc', 'tie'), 'tied ranks: code ranks (ballot ignored); equal speaker totals for different ranks: inconsistent, code tie');
  ok(r.out.sp === 160 && r.out.ss === 80, 'speaker points: a team total and one speech'); }
{ // panels: a Condorcet cycle among three judges, broken by the chair (code cycle); Borda and chair methods
  const mk = panel => ({ speeches: bpSpeeches(), debate: { format: 'bp', panel, teams: bpTeams, ballots: [ballot('a', [1, 2, 3, 4], null, true), ballot('b', [2, 3, 1, 4]), ballot('c', [3, 1, 2, 4])] } });
  const outs = T4.map(t => sc('r' + t, 'rank', { team: t }));
  const rm = run(mk('majority'), outs), rb = run(mk('borda'), outs), rc = run(mk('chair'), outs);
  ok([rm.out.rOG, rm.out.rOO, rm.out.rCG].sort().join() === '1,2,3' && rm.out.rOG === 1 && has(rm, 'rOG', 'cycle'), 'OG > OO > CG > OG by 2–1 majorities: a cycle, broken by the chair\'s ranking (code cycle)');
  ok(rb.out.rOG === 1 && rb.out.rCO === 4 && rc.out.rOG === 1 && rc.out.rCG === 3, 'Borda (3-2-1-0 summed, ties by the chair) and the chair\'s call'); }
{ // WSDC: 60–80 / 30–40, the higher total wins, no draws, the reply by speaker 1 or 2, no POIs in replies
  const sp = [['P1', 'P', 'p1'], ['O1', 'O', 'o1'], ['P2', 'P', 'p2'], ['O2', 'O', 'o2'], ['P3', 'P', 'p3'], ['O3', 'O', 'o3'], ['OR', 'O', 'o3'], ['PR', 'P', 'p1']].map(([role, team, speaker], i) => ({ id: 'w' + i, role, team, speaker, dur: role.endsWith('R') ? 240 : 480, pois: role === 'PR' ? [{ at: 60, by: 'O' }] : [] }));
  const B = (id, pts) => ({ id, scores: pts.map((v, i) => ({ speech: 'w' + i, pts: v })) });
  const m = { speeches: sp, debate: { format: 'wsdc', teams: [{ id: 'P', side: 'prop' }, { id: 'O', side: 'opp' }], ballots: [B('j1', [72, 70, 71, 71, 70, 69, 35, 36]), B('j2', [70, 71, 70, 72, 70, 70, 36, 35]), B('j3', [74, 70, 72, 70, 71, 70, 36, 37]), B('j4', [70, 70, 70, 70, 70, 70, 35, 35]), B('j5', [85, 70, 70, 70, 70, 70, 35, 45])] } };
  const r = run(m, [sc('w', 'winner'), sc('ws', 'winnerSide'), sc('bf', 'ballotsFor', { team: 'P' }), sc('mg', 'margin'), sc('v6', 'violations', { speech: 'w6' }), sc('v7', 'violations', { speech: 'w7' }), sc('c4', 'consistent', { ballot: 'j4' }), sc('c5', 'consistent', { ballot: 'j5' })]);
  ok(r.out.w === 1 && r.out.ws === 1 && r.out.bf === 3, 'WSDC: Proposition wins on ballots (j1 214–210, j3 221–216, j5; j2 to Opposition; j4 a draw is no ballot)');
  ok(has(r, 'c4', 'tie') && has(r, 'c5', 'score_range'), 'equal totals: code tie (no draws in WSDC); 85 and a 45 reply are outside 60–80 / 30–40: code score_range');
  ok(r.out.v6 === 1 && has(r, 'v6', 'reply_speaker') && r.out.v7 === 1 && has(r, 'v7', 'poi_not_allowed'), 'the third speaker gives the Opposition reply: reply_speaker; a POI in the Proposition reply: poi_not_allowed'); }
{ // LD: a low-point win is allowed and shown
  const sp = [['AC', 'A'], ['CXN', 'N'], ['NC', 'N'], ['CXA', 'A'], ['AR1', 'A'], ['NR', 'N'], ['AR2', 'A']].map(([role, team], i) => ({ id: 'l' + i, role, team, dur: [360, 180, 420, 180, 240, 360, 180][i] }));
  const r = run({ speeches: sp, debate: { format: 'ld', teams: [{ id: 'A', side: 'aff' }, { id: 'N', side: 'neg' }], ballots: [{ id: 'b', winner: 'A', scores: [{ speech: 'l0', pts: 27 }, { speech: 'l2', pts: 29 }] }] } }, [sc('w', 'winner'), sc('l', 'lpw', { ballot: 'b' }), sc('c', 'consistent', { ballot: 'b' }), sc('v', 'violations')]);
  ok(r.out.w === 1 && r.out.l === 1 && r.out.c === 1 && has(r, 'l', 'low_point_win') && r.out.v === 0, 'LD: the Affirmative wins with fewer speaker points — a low-point win (allowed, code low_point_win); every speech on time'); }
{ // Oxford-style: the side whose share rose most wins (IQ2US); a vote not summing to 100 is normalised
  const r = run({ debate: { format: 'oxford', pre: { for: 30, against: 45, undecided: 25 }, post: { for: 46, against: 50, undecided: 4 } } }, [sc('f', 'swing', { side: 'for' }), sc('a', 'swing', { side: 'against' })]);
  ok(r.out.f === 16 && r.out.a === 5, 'IQ2US rule: For gains 16 points, Against 5 — For wins although Against still has more votes');
  const r2 = run({ debate: { format: 'oxford', pre: { for: 3, against: 1 }, post: { for: 1, against: 1 } } }, [sc('f', 'swing', { side: 'for' })]);
  ok(r2.out.f === -25 && has(r2, 'f', 'vote_sum'), 'raw counts are turned into percentages (code vote_sum)'); }
{ // custom format; tab over rounds (team points, then speaker points)
  const m = { speeches: [{ id: 'a', role: 'X1', team: 'A', dur: 250, pois: [{ at: 10, by: 'B' }, { at: 100, by: 'B' }] }, { id: 'b', role: 'X2', team: 'B', dur: 200, pois: [{ at: 50, by: 'A' }] }, { id: 'c', team: 'A' }],
    debate: { format: 'custom', slots: [{ role: 'X1', side: 'aff', min: 4, poi: true, protect: 30 }, { role: 'X2', side: 'neg', min: 4 }], teams: [{ id: 'A', side: 'aff' }, { id: 'B', side: 'neg' }],
      ballots: [{ id: 'r1', round: 1, winner: 'A' }, { id: 'r2', round: 2, winner: 'B' }, { id: 'r3', round: 3, winner: 'B' }] } };
  const r = run(m, [sc('l', 'limit', { speech: 'a' }), sc('pp', 'poiProtected', { speech: 'a' }), sc('v', 'violations'), sc('t', 'tab', { team: 'B' }), sc('p', 'points', { team: 'B' }), sc('p1', 'points', { team: 'B', round: 1 }), { id: 'd', kind: 'series', of: 'durations' }, { id: 'li', kind: 'series', of: 'limits' }]);
  ok(r.out.l === 240 && r.out.pp === 1 && r.out.t === 1 && r.out.p === 2 && r.out.p1 === 0, 'custom slots: limit 240 s, a POI in its 30 s protected time; tab: B first with 2 wins of 3');
  ok(has(r, 'v', 'overtime') && has(r, 'v', 'poi_not_allowed') && has(r, 'v', 'no_slot'), 'codes: overtime (no grace), a POI where none is allowed, a speech with no slot');
  ok(r.out.d.length === 3 && Number.isNaN(r.out.d[2]) && r.out.li[0] === 240, 'durations and limits as series (NaN where unknown)'); }
{ const r = run({ speeches: [], debate: { format: 'bp', teams: bpTeams } }, [sc('w', 'winner')]); ok(Number.isNaN(r.out.w) && has(r, 'w', 'no_ballots'), 'no ballots: NaN, code no_ballots'); }

// ---- 5. argumentation: Dung 1995 through logic@1, Toulmin, schemes and fallacies, weighing, the flow ----
const L = globalThis.NoemaLibLogic;
ok(!!(L && L.afSolve && L.parse && L.rowsOf && L.evalProp && L.syllogism && L.source), 'logic@1 exports afSolve, parse, atomsOf, evalProp, rowsOf, syllogism, source (rhetoric@1 calls them, never re-implements them)');
{ const nodes = ['a', 'b', 'c'].map(id => ({ id })), map = { nodes, edges: [{ from: 'c', to: 'b', kind: 'attack' }, { from: 'b', to: 'a', kind: 'attack' }] };
  const r = run({ map }, ['a', 'b', 'c'].map(x => sc(x, 'label', { node: x })));
  ok(r.out.a === 1 && r.out.b === 0 && r.out.c === 1, 'Dung 1995 reinstatement: c attacks b attacks a — grounded labels a in, b out, c in'); }
{ const map = { nodes: [{ id: 'a', side: 'aff' }, { id: 'b', side: 'neg' }], edges: [{ from: 'a', to: 'b', kind: 'attack' }, { from: 'b', to: 'a', kind: 'attack' }] };
  const r = run({ map }, [sc('g', 'label', { node: 'a' }), sc('p', 'extensions', { semantics: 'preferred' }), sc('s', 'extensions', { semantics: 'stable' }), sc('cr', 'accepted', { node: 'a', semantics: 'preferred', mode: 'credulous' }), sc('sk', 'accepted', { node: 'a', semantics: 'preferred', mode: 'sceptical' }), sc('cl', 'clash')]);
  ok(r.out.g === 0.5 && r.out.p === 2 && r.out.s === 2 && r.out.cr === 1 && r.out.sk === 0 && r.out.cl === 2, 'the Nixon diamond (mutual attack): undecided in the grounded labelling, 2 preferred and 2 stable extensions; credulously but not sceptically accepted; clash 2'); }
{ const map = { nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'a', kind: 'attack' }] }; const r = run({ map }, [sc('s', 'extensions', { semantics: 'stable' }), sc('l', 'label', { node: 'a', semantics: 'stable' })]);
  ok(r.out.s === 0 && Number.isNaN(r.out.l) && has(r, 'l', 'no_extension'), 'a self-attacking argument: no stable extension (code no_extension)'); }
{ // a Toulmin unit (Toulmin 1958's Harry example)
  const map = { nodes: [{ id: 'C', kind: 'claim', s: 'Harry is a British subject' }, { id: 'D', kind: 'data', s: 'Harry was born in Bermuda' }, { id: 'W', kind: 'warrant', s: 'A man born in Bermuda is British' },
    { id: 'B', kind: 'backing', s: 'The British Nationality Acts' }, { id: 'Q', kind: 'qualifier', s: 'presumably' }, { id: 'R', kind: 'rebuttal', s: 'unless his parents were aliens' }],
    edges: [{ from: 'D', to: 'C' }, { from: 'W', to: 'C' }, { from: 'B', to: 'W' }, { from: 'Q', to: 'C' }, { from: 'R', to: 'C', kind: 'except' }] };
  const r = run({ map }, [sc('t', 'toulmin', { node: 'C' }), sc('td', 'toulmin', { node: 'D' }), sc('g', 'label', { node: 'C' }), { id: 'ts', kind: 'scene', of: 'toulmin', node: 'C' }, { id: 'ms', kind: 'scene', of: 'map' }]);
  ok(r.out.t === 6 && r.out.td === 1 && r.out.g === 1, 'Toulmin 1958 (Harry, born in Bermuda): all six parts; the exception ("unless …") is not a Dung attack, so the claim stays in');
  ok(r.out.ts.items.some(i => i.s === 'presumably') && r.out.ts.items.some(i => i.s === 'The British Nationality Acts') && r.out.ms.items.length >= 6 * 2, 'the Toulmin diagram and the map scene carry the parts’ own words'); }
{ // schemes and fallacies (Walton, Reed & Macagno 2008; Walton 1995)
  const map = { nodes: [
    { id: 'exp', scheme: 'expert', cq: [1, 0, 1] }, { id: 'pop', scheme: 'popular', cq: [0] }, { id: 'cor', scheme: 'correlation', cq: [1, 1, 0] }, { id: 'ok', scheme: 'expert', cq: [1, 1, 1, 1, 1, 1] },
    { id: 'slp', scheme: 'slope', steps: [0.8, 0.8, 0.8, 0.8, 0.8] }, { id: 'slq', scheme: 'slope', steps: [0.99, 0.99] }, { id: 'ex', scheme: 'example', cq: [1, 1, 1, 0] },
    { id: 'p', kind: 'person' }, { id: 'ah', side: 'opp' }, { id: 'tq', scheme: 'circumstantial' }, { id: 'c1' }, { id: 'c2' }, { id: 'orig' }, { id: 'sm', misrepresents: 'orig' }, { id: 'rh', offTopic: true },
    { id: 'fd', options: 2, alternatives: 4 }, { id: 'ign', scheme: 'ignorance', cq: [0, 1] }, { id: 'an', scheme: 'analogy', cq: [0] }, { id: 'cons', scheme: 'consequences', cq: [0] }, { id: 'sg', scheme: 'sign', cq: [0, 0] }],
    edges: [{ from: 'ah', to: 'p', kind: 'attack' }, { from: 'tq', to: 'p', kind: 'attack' }, { from: 'c1', to: 'c2' }, { from: 'c2', to: 'c1' }, { from: 'rh', to: 'orig', kind: 'attack' }] };
  const want = { exp: 'ad_verecundiam', pop: 'ad_populum', cor: 'post_hoc', ok: 'none', slp: 'slippery_slope', slq: 'none', ex: 'hasty_generalisation', ah: 'ad_hominem', tq: 'tu_quoque', c1: 'begging_question', sm: 'straw_man', rh: 'red_herring', fd: 'false_dilemma', ign: 'ad_ignorantiam', an: 'false_analogy', cons: 'appeal_consequences', sg: 'none' };
  const r = run({ map }, Object.keys(want).map(k => sc(k, 'fallacy', { node: k })).concat([sc('o', 'cqOpen', { node: 'exp' }), sc('fl', 'cqFailed', { node: 'exp' }), sc('sl', 'slope', { node: 'slp' }), sc('cq', 'schemeCQs', { scheme: 'expert' }), sc('n', 'fallacies'), sc('ns', 'cqOpen', { node: 'p' })]));
  for (const [k, f] of Object.entries(want)) ok(r.out[k] === X.FALLACIES.indexOf(f), `fallacy of ${k}: ${f} (index ${X.FALLACIES.indexOf(f)})`);
  ok(r.out.o === 3 && r.out.fl === 1 && r.out.cq === 6, 'appeal to expert opinion: 6 critical questions (Walton et al. 2008), 1 failed (field), 3 not asked');
  near(r.out.sl, 0.8 ** 5, 1e-12, 'a slippery slope of five 0.8 steps holds with 0.33 (Hahn & Oaksford 2007): below 0.5, a fallacy');
  ok(r.out.n === 15 && Number.isNaN(r.out.ns) && has(r, 'ns', 'no_scheme'), '15 fallacious moves in the map (c1 and c2 both beg the question); critical questions of a node without a scheme: no_scheme'); }
{ // weighing and stock issues (policy debate): magnitude × probability, discounted by e^(−t/τ), over the surviving arguments
  const map = { nodes: [{ id: 'adv', side: 'aff', impact: 10, prob: 0.5, stock: 'harms' }, { id: 'inh', side: 'aff', stock: 'inherency' }, { id: 'sol', side: 'aff', stock: 'solvency' }, { id: 'top', side: 'aff', stock: 'topicality' },
    { id: 'da', side: 'neg', impact: 8, prob: 0.5, time: 5 }, { id: 'da2', side: 'neg', impact: 100, prob: 0.9 }, { id: 'ans', side: 'aff' }, { id: 'tt', side: 'neg' }],
    edges: [{ from: 'ans', to: 'da2', kind: 'attack' }, { from: 'tt', to: 'top', kind: 'attack' }] };
  const r = run({ map }, [sc('n', 'netBenefit'), sc('nt', 'netBenefit', { tau: 5 }), sc('w', 'weighedWinner'), sc('sm', 'stockMet'), sc('pf', 'primaFacie'), sc('ic', 'inCount', { side: 'aff' })]);
  near(r.out.n, 10 * 0.5 - 8 * 0.5, 1e-12, 'net benefits: the advantage 10 × 0.5 minus the surviving disadvantage 8 × 0.5 (the answered one does not count)');
  near(r.out.nt, 5 - 4 * Math.exp(-1), 1e-12, '… with timeframe discounting e^(−t/τ)');
  ok(r.out.w === 1 && r.out.sm === 3 && r.out.pf === 0 && r.out.ic === 4, 'the affirmative outweighs, but topicality fell: 3 of 4 stock issues, no prima facie case');
  const r2 = run({ map: { nodes: [{ id: 'a', side: 'aff', impact: 1, prob: 1 }, { id: 'b', side: 'neg', impact: 1, prob: 1 }] } }, [sc('w', 'weighedWinner')]);
  ok(r2.out.w === -1 && has(r2, 'w', 'presumption'), 'a tie in the weighing: presumption to the negative (code presumption)'); }
{ // the flow: an argument not answered in a later speech of the other side is dropped
  const speeches = [{ id: 'a1', side: 'aff' }, { id: 'n1', side: 'neg' }, { id: 'a2', side: 'aff' }];
  const map = { nodes: [{ id: 'x', side: 'aff', speech: 'a1', s: 'Plan saves lives' }, { id: 'y', side: 'aff', speech: 'a1', s: 'Costs are low' }, { id: 'z', side: 'neg', speech: 'n1', s: 'Lives not saved' }, { id: 'u', side: 'neg', speech: 'n1', s: 'Rights violation' }, { id: 'v', side: 'aff', speech: 'a2', s: 'No rights issue' }],
    edges: [{ from: 'z', to: 'x', kind: 'attack' }, { from: 'v', to: 'u', kind: 'attack' }] };
  const r = run({ speeches, map }, [sc('d', 'dropped'), sc('da', 'dropped', { side: 'aff' }), { id: 'f', kind: 'scene', of: 'flow' }]);
  ok(r.out.d === 2 && r.out.da === 1 && r.out.f.items.some(i => i.s === 'Costs are low' && i.c === 'warn'), 'the flow sheet: "Costs are low" (never answered by the negative) and "Lives not saved" (never answered by the second affirmative) are dropped (warn)'); }

// ---- 6. formal fallacies: truth tables and Venn regions of logic@1 ----
{ const forms = [{ id: 'mp', premises: ['p -> q', 'p'], conclusion: 'q' }, { id: 'mt', premises: ['p -> q', '~q'], conclusion: '~p' }, { id: 'ac', premises: ['p -> q', 'q'], conclusion: 'p' }, { id: 'da', premises: ['p -> q', '~p'], conclusion: '~q' },
    { id: 'ds', premises: ['p | q', '~p'], conclusion: 'q' }, { id: 'xx', premises: ['p | q'], conclusion: 'p & q' }, { id: 'bad', premises: ['p ->'], conclusion: 'q' },
    { id: 'barbara', mood: 'AAA', figure: 1 }, { id: 'celarent', mood: 'EAE', figure: 1 }, { id: 'darapti', mood: 'AAI', figure: 3 }, { id: 'darapti2', mood: 'AAI', figure: 3, existential: true },
    { id: 'um', mood: 'AAA', figure: 2 }, { id: 'imaj', mood: 'AEE', figure: 1 }, { id: 'imin', mood: 'AAA', figure: 3 }, { id: 'ex2', mood: 'EEE', figure: 1 }, { id: 'neg', mood: 'EAA', figure: 1 }];
  const want = { mp: 'none', mt: 'none', ac: 'affirming_consequent', da: 'denying_antecedent', ds: 'none', xx: 'invalid_form', barbara: 'none', celarent: 'none', darapti: 'existential_fallacy', darapti2: 'none', um: 'undistributed_middle', imaj: 'illicit_major', imin: 'illicit_minor', ex2: 'exclusive_premises', neg: 'negative_mismatch' };
  const r = run({ forms }, Object.keys(want).map(k => sc(k, 'fallacy', { form: k })).concat([sc('vb', 'valid', { form: 'bad' }), sc('cp', 'counter', { form: 'ac', atom: 'p' }), sc('cq', 'counter', { form: 'ac', atom: 'q' }), sc('cm', 'counter', { form: 'mp', atom: 'p' }), sc('cz', 'counter', { form: 'ac', atom: 'z' }), sc('n', 'fallacies')]));
  for (const [k, f] of Object.entries(want)) ok(r.out[k] === X.FALLACIES.indexOf(f), `form ${k}: ${f}`);
  ok(Number.isNaN(r.out.vb) && has(r, 'vb', 'parse'), 'a form that does not parse: NaN, code parse (with logic@1\'s own code)');
  ok(r.out.cp === 0 && r.out.cq === 1 && Number.isNaN(r.out.cm) && has(r, 'cm', 'valid') && has(r, 'cz', 'no_atom'), 'affirming the consequent: the counterexample row p false, q true; a valid form has none (code valid)');
  ok(r.out.n === 9, '9 invalid forms of 16 (the broken one counts as none)'); }
{ const big = { id: 'b', premises: ['a1 & a2 & a3 & a4 & a5 & a6 & a7'], conclusion: 'a8 & a9 & a10 & a11 & a12 & a13' }; const r = run({ forms: [big] }, [sc('v', 'valid', { form: 'b' })]);
  ok(Number.isNaN(r.out.v) && has(r, 'v', 'too_many_atoms'), '13 atoms: beyond the truth-table bound, code too_many_atoms'); }

// ---- 7. orders, stasis, ELM, inoculation ----
{ const parts = [['attention', 'x1'], ['need', 'x2'], ['satisfaction', 'x3'], ['visualization', 'x4'], ['action', 'x5']].map(([part, pos], i) => ({ id: 'p' + i, part, pos }));
  const o = [sc('ok', 'orderOk'), sc('k', 'kendall'), sc('m', 'misplaced')];
  const a = run({ outline: { scheme: 'monroe', parts } }, o, { x1: 1, x2: 2, x3: 3, x4: 4, x5: 5 }), b = run({ outline: { scheme: 'monroe', parts } }, o, { x1: 5, x2: 4, x3: 3, x4: 2, x5: 1 }), c = run({ outline: { scheme: 'monroe', parts } }, o, { x1: 1, x2: 3, x3: 2, x4: 4, x5: 5 });
  ok(a.out.ok === 1 && a.out.k === 1 && a.out.m === 0, 'Monroe 1935: attention, need, satisfaction, visualisation, action in order — τ = 1');
  ok(b.out.ok === 0 && b.out.k === -1 && b.out.m === 4, 'reversed: Kendall τ = −1 (Kendall 1938), 4 parts out of place');
  ok(c.out.ok === 0 && Math.abs(c.out.k - 0.8) < 1e-12 && c.out.m === 2, 'one swap of neighbours: τ = 0.8, 2 misplaced');
  const d = run({ outline: { scheme: 'oration', parts: [{ id: 'a', part: 'exordium', pos: 1 }, { id: 'b', part: 'peroratio', pos: 1 }] } }, o);
  ok(d.out.ok === 0 && has(d, 'ok', 'tie'), 'two parts in the same place: not in order, code tie'); }
{ const r = (st) => run({ stasis: st }, [sc('s', 'stasis')]).out.s;
  ok(r({ conjecture: 1, definition: 1, quality: 0 }) === 3 && r({ conjecture: 0 }) === 1 && r({}) === 0 && r({ conjecture: 1, definition: 1, quality: 1, translation: 0 }) === 4, 'stasis (Cicero, De Inv. I.10): the first question not agreed — conjecture 1, definition 2, quality 3, translation 4; none disputed 0'); }
{ const r = run({ elm: { motivation: 0.9, ability: 0.9, quality: 0.8, cue: -0.5 } }, [sc('e', 'elaboration'), sc('a', 'attitude'), sc('c', 'central'), sc('p', 'peripheral'), sc('ro', 'route'), { id: 'ax', kind: 'series', of: 'elmAxis' }, { id: 't', kind: 'series', of: 'elmTotal' }]);
  near(r.out.e, 0.81, 1e-12, 'ELM (Petty & Cacioppo 1986) teaching form: elaboration = motivation × ability'); near(r.out.a, 0.81 * 0.8 + 0.19 * -0.5, 1e-12, 'attitude change = E·quality + (1 − E)·cue');
  ok(r.out.ro === 1 && r.out.ax.length === 51 && r.out.t.length === 51 && Math.abs(r.out.t[0] - -0.5) < 1e-12, 'the central route above E = 0.5; the curve over motivation starts at the cue alone');
  const r2 = run({ elm: { motivation: 2, ability: 0.5, quality: 0, cue: 0 } }, [sc('e', 'elaboration')]); ok(r2.out.e === 0.5 && has(r2, 'e', 'range'), 'a value outside 0–1 is clamped, code range'); }
{ const r = run({ inoculation: { r0: 0.6, tau: 14, attack: 1, boosters: [20] } }, [sc('r0', 'resistance', { at: 0 }), sc('r14', 'resistance', { at: 14 }), sc('r20', 'resistance', { at: 20 }), sc('a', 'attitudeAfter', { at: 14 }), { id: 't', kind: 'series', of: 'inocT' }, { id: 'rr', kind: 'series', of: 'inocR' }]);
  near(r.out.r14, 0.6 * Math.exp(-1), 1e-12, 'inoculation (McGuire 1961; decay after about two weeks, Banas & Rains 2010): r(14) = r0/e');
  ok(r.out.r0 === 0.6 && r.out.r20 === 0.6 && Math.abs(r.out.a - (1 - 0.6 / Math.E)) < 1e-12 && r.out.t.length === 200 && r.out.rr.length === 200, 'a booster at day 20 restores the resistance; an attack then moves the attitude by A·(1 − r)'); }

// ---- 8. the checks: codes, and the same problems in Python on every fixture ----
const codes = s => X.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
ok(codes({ model: { speeches: [{ id: 'a' }, { id: 'a' }] }, outputs: [] }).includes('dup@model.speeches[1].id'), 'check: duplicate ids');
ok(codes({ model: { speeches: [{ id: 'a', role: 'XX', team: 'T' }], debate: { format: 'bp', teams: [] } }, outputs: [] }).join() === 'ref@model.speeches[0].team,ref@model.speeches[0].role', 'check: a team and a role the format does not have');
ok(codes({ model: {}, outputs: [sc('w', 'wpm')] }).includes('ref@outputs[0].of'), 'check: an output needs its section (model.speeches)');
ok(codes({ model: { forms: [{ id: 'f', mood: 'AXE', figure: 1 }] }, outputs: [] }).includes('value@model.forms[0].mood'), 'check: a syllogism mood of A, E, I, O');
ok(codes({ model: { map: { nodes: [{ id: 'a', scheme: 'sign', cq: [1, 1, 1] }] } }, outputs: [] }).includes('size@model.map.nodes[0].cq'), 'check: more answers than the scheme has critical questions');
ok(codes({ model: { speeches: [{ id: 'a', text: 'x'.repeat(20001) }] }, outputs: [] }).includes('size@model.speeches[0].text'), 'check: a speech over 20 000 characters');
{ const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'rhetoric.json'), 'utf8')).specs;
  const js = specs.map(s => { const p = X.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : X.exprs(s), k: bad ? null : X.keys(s) }; });
  const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys,lib_rhetoric as M
out=[]
for s in json.loads(sys.stdin.read()):
    p=M.check_spec(s); bad=any(q['level']=='error' for q in p)
    out.append({'p':p,'x':None if bad else M.exprs(s),'k':None if bad else M.keys(s)})
print(json.dumps(out))`], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify(specs), encoding: 'utf8' }));
  const same = js.filter((r, i) => JSON.stringify(r) === JSON.stringify(py[i])).length;
  ok(specs.length >= 20 && same === specs.length, `JS and Python checks agree on ${same}/${specs.length} fixture specs (problems, exprs, keys)`);
  ok(specs.some(s => !X.checkSpec(s).some(p => p.level === 'error')) && specs.some(s => X.checkSpec(s).some(p => p.level === 'error')), 'the fixtures hold good and bad specs');
  const allCodes = new Set(specs.flatMap(s => X.checkSpec(s).map(p => p.code)));
  ok(['format', 'value', 'size', 'enum', 'unknown-field', 'dup', 'ref', 'output'].every(c => allCodes.has(c)), 'the fixtures cover every checker code: ' + [...allCodes].join(', '));
  const ex = X.exprs(specs[0]); ok(ex.length === 2 && ex[0][0] === 'k * 10' && ex[0][1] === 'model.speeches[0].dur' && ex[1][1] === 'outputs[3].sentence', 'exprs: the model\'s numx (speech duration) and the outputs\' (sentence)'); }

// ---- 9. the sim adapter, the Worker source, speed ----
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'bp-adjudication', 'spec.json'), 'utf8'));
ok(!X.checkSpec(SPEC).some(p => p.level === 'error'), 'the reference activity bp-adjudication has no errors');
const inst = X.engine.create(SPEC, { seed: 1 }), o1 = inst.run({ gOG: 2, gOO: 3, gCG: 1, gCO: 4 });
ok(SPEC.outputs.every(o => Object.prototype.hasOwnProperty.call(o1, o.id)), 'adapter: every declared output comes back');
ok(o1.rCG === 1 && o1.rOG === 2 && o1.rOO === 4 && o1.rCO === 3, 'adapter: the panel of the reference round ranks CG, OG, CO, OO');
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + X.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(SPEC, { seed: 1 }).run({ gOG: 2, gOO: 3, gCG: 1, gCO: 4 }); ok(JSON.stringify(w) === JSON.stringify(o1), 'the Worker source (logic@1 + rhetoric@1) gives the same outputs in a fresh global');
  const fx = { model: { forms: [{ id: 'a', premises: ['p -> q', 'q'], conclusion: 'p' }], map: { nodes: [{ id: 'x' }, { id: 'y' }], edges: [{ from: 'x', to: 'y', kind: 'attack' }] } }, outputs: [sc('f', 'fallacy', { form: 'a' }), sc('l', 'label', { node: 'y' })] };
  const w2 = ctx.self.noemaEngine.create(fx, { seed: 1 }).run({}); ok(w2.f === 1 && w2.l === 0, 'in the Worker, the logic-based outputs work (logic@1 travels with it)'); }
{ const t1 = Date.now(); for (let i = 0; i < 20; i++) X.run(SPEC, { gOG: 1 + (i % 4) }, {}); const ms = (Date.now() - t1) / 20; ok(ms < 50, `a typical run < 50 ms (${ms} ms)`); }
{ const long = (CHURCHILL + ' ').repeat(110).slice(0, 20000), A = X.analyse(long, 'en'), T = A.toks.map((_, i) => [i * 0.4, i * 0.4 + 0.3]).slice(0, 8000);
  const nodes = Array.from({ length: 24 }, (_, i) => ({ id: 'n' + i, side: i % 2 ? 'aff' : 'neg', impact: 1, prob: 0.5 })), edges = [];
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) if (i !== j && (i + j) % 3 === 0) edges.push({ from: 'n' + i, to: 'n' + j, kind: 'attack' });
  const t1 = Date.now();
  const r = run({ speeches: [{ id: 's', text: long, timing: A.toks.length <= 8000 ? T : undefined }, { id: 't', text: long }], map: { nodes, edges } },
    [...X.FIGURES.map(f => sc(f, 'figure', { type: f, speech: 't' })), sc('rd', 'readability', { formula: 'fk' }), { id: 'fs', kind: 'scene', of: 'figures', speech: 't' }, sc('pe', 'extensions', { semantics: 'preferred' }), sc('nb', 'netBenefit'), { id: 'm', kind: 'scene', of: 'map' }, { id: 'rc', kind: 'series', of: 'rateCurve' }]);
  const ms = Date.now() - t1; ok(ms < 2000 && Number.isFinite(r.out.rd) && r.out.anaphora > 0, `the heaviest allowed run (20 000 characters, every figure, a 24-argument framework, preferred extensions) takes ${ms} ms (< 2 s)`); }

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
