/* P7 — production and reading (docs/LANGUAGES.md §6.5, §7.1, §8 Tutor).
   Part 1 (Node): the runtime over the pilot course — numbers built from the lexicon (checked against the course's own grammar
   texts and bank), clock and date read from annotated sentences, typed answers (the stored sentence, its alts, every spelling the
   form index accepts), translate / rewrite / register / dialogue / reader items from stored data only, the AI's prompts and the
   checks of AI text, the generators registered for the grammar files.
   Part 2 (Playwright, Gemini mocked — no network): the ✍️ Writing and 📖 Reading lanes, typed answers decided without the AI,
   other answers "AI-judged" with the AI text checked against the form index, the rubric, the AI reader, the tutor in a language
   (with and without a key), phone width, lang + dir, keyboard, no page errors.
   Usage: node tests/lang_prod.js [prepared-repo-dir]   (built with tools/build.py) */
const fs = require('fs'), path = require('path');
const N = require(path.join(__dirname, '..', 'engine', 'langcore.js'));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE;
const CDIR = path.join(__dirname, '..', 'library', 'languages', COURSE);
const read = rel => { const p = path.join(CDIR, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const list = rel => { const p = path.join(CDIR, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
const data = N.readCourse(read, list);
const C = N.course(data);
const nfc = s => String(s).normalize('NFC');
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** A learner who has passed the foundations and the first core lessons in every language. */
function learner(day = 100) {
  const L = N.newLearner(C);
  for (const c of C.languages) for (const nid of C.order) {
    if (!/^(fd|cr)\./.test(nid) || !C.lang[c].applies[nid]) continue;
    for (const id of C.lang[c].byNode[nid] || []) for (const t of ['r', 'p']) { N.review(C, L, c, id, t, true, day - 10); N.review(C, L, c, id, t, true, day - 9); N.review(C, L, c, id, t, true, day - 6); }
    if (C.nodes[nid].kind === 'lesson') N.recordCheck(C, L, c, nid, 1, day - 6);
  }
  return L;
}
const L = learner(), K = Object.fromEntries(C.languages.map(c => [c, N.known(C, L, c)]));
const allText = code => { let s = ''; for (const f of list(`lang/${code}/grammar`)) s += JSON.stringify(read(`lang/${code}/grammar/${f}`)); for (const f of list(`lang/${code}/bank`)) s += JSON.stringify(read(`lang/${code}/bank/${f}`)); return nfc(s); };

console.log('— numbers from the lexicon (number_words)');
{
  const V = { de: [[21, 'einundzwanzig'], [26, 'sechsundzwanzig'], [27, 'siebenundzwanzig'], [45, 'fünfundvierzig'], [99, 'neunundneunzig'], [16, 'sechzehn'], [30, 'dreißig']],
    zh: [[21, '二十一'], [45, '四十五'], [99, '九十九'], [12, '十二'], [20, '二十']],
    ar: [[21, 'وَاحِدٌ وَعِشْرُونَ', 'MASC'], [25, 'خَمْسَةٌ وَعِشْرُونَ', 'MASC'], [35, 'خَمْسَةٌ وَثَلَاثُونَ', 'MASC']],
    he: [[28, 'עֶשְׂרִים וּשְׁמוֹנָה', 'MASC'], [21, 'עֶשְׂרִים וְאַחַת', 'FEM']] };
  for (const [c, vs] of Object.entries(V)) {
    const txt = allText(c), bad = vs.filter(([n, w, g]) => nfc(N.numberWord(C, c, n, { gender: g })?.text || '') !== nfc(w) || !txt.includes(nfc(w)));
    ok(!bad.length, `${c}: ${vs.length} numbers built from the stored words, each as the course's own grammar or bank writes it` + (bad.length ? ' — ' + JSON.stringify(bad.map(([n, w, g]) => [n, w, N.numberWord(C, c, n, { gender: g })?.text])) : ''));
  }
  ok(N.numberWord(C, 'ar', 21, { gender: 'FEM' }) === null && N.numberWord(C, 'he', 99) === null && N.numberWord(C, 'de', 101) === null, 'what the course has no rule for is left out (ar 21 with a feminine noun, he units with a begadkefat dagesh, numbers above 99 but 100 / 1000)');
  ok(N.numberWord(C, 'de', 21, { K: new Set(['de:eins', 'de:zwanzig']) }) === null && !!N.numberWord(C, 'de', 21, { K: new Set(['de:eins', 'de:zwanzig', 'de:und']) }), 'a built number needs all its parts known');
  ok(N.heAnd('שְׁנַיִם') === nfc('וּשְׁנַיִם') && N.heAnd('חֲמִשָּׁה') === nfc('וַחֲמִשָּׁה') && N.heAnd('אַחַת') === nfc('וְאַחַת') && N.heAnd('תִּשְׁעָה') === null, 'Hebrew “and” before a number: וּ before a shva, וַ before a hataf, וְ otherwise; a dagesh letter is left out');
  let bad = [];
  for (const c of C.languages) for (const it of N.numberItems(C, L, c, { k: K[c], rng, max: 40 })) {
    if (!it.options.includes(it.answer) || new Set(it.options).size !== it.options.length) bad.push([c, it.kind, 'options']);
    if (it.kind === 'digits2word' && nfc(it.answer) !== nfc(N.numberWord(C, c, it.n).text)) bad.push([c, it.n, it.answer]);
    if (it.kind === 'word2digits' && it.answer !== String(it.n)) bad.push([c, it.n]);
    if (it.kind === 'counting' && c !== 'zh') { const noun = C.lang[c].lex[it.noun], num = C.lang[c].lex[it.lex[0]], cell = Object.keys(num.forms).find(k => k.includes(noun.gender) && (c === 'he' || k.includes('CONST')) && (c === 'he' ? N.canon(k) === N.canon('NUM;' + noun.gender) : k.includes('NOM'))); if (!it.answer.startsWith(num.forms[cell])) bad.push([c, 'polarity', it.answer]); }
    if (it.kind === 'counting' && c === 'zh' && !it.answer.startsWith('两')) bad.push([c, it.answer]);
  }
  ok(!bad.length, `number items in every language: the answer is the stored / built word, counting follows the noun's gender (ar, he) or 两 (zh)` + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 4)) : ''));
  ok(['ar', 'he'].every(c => N.numberItems(C, L, c, { k: K[c], rng, max: 40 }).some(i => i.kind === 'counting')) && N.numberItems(C, L, 'zh', { k: K.zh, rng, max: 40 }).some(i => i.kind === 'counting'), 'counting items exist for ar, he (gender polarity) and zh (两)');
  ok(N.numberItems(C, N.newLearner(C), 'de', { rng }).length === 0, 'a new learner gets no number items (no number word known yet)');
  ok(N.digitsIn('ar', 25) === '٢٥' && N.digitsIn('de', 25) === '25', 'Arabic shows Arabic-Indic digits');
}

console.log('— clock and date read from the bank');
{
  const find = (c, t) => C.lang[c].sentences.find(s => nfc(s.text) === nfc(t));
  const T = (c, t) => { const s = find(c, t); const r = s && N.clockOf(C, c, s); return r ? `${r.h}:${r.m}` : null; };
  ok(T('ar', 'السَّاعَةُ الْآنَ الثَّالِثَةُ وَالنِّصْفُ.') === '3:30' && T('zh', '现在三点一刻。') === '3:15' && T('de', 'Ich stehe um sechs Uhr auf.') === '6:0' && T('he', 'הַמָּטוֹס מַגִּיעַ בְּשָׁעָה אַחַת.') === '1:0', 'times: ar 3:30 (ordinal + و + half), zh 3:15 (一刻), de 6:00, he 1:00');
  ok(T('he', 'הַשָּׁעָה שָׁלוֹשׁ וְעֶשְׂרִים.') === null && T('zh', '我们下午三点十分到北京。') === null && T('he', 'הוּא חִכָּה חֲצִי שָׁעָה.') === null, 'not read: minutes in numbers (3:20, 3:10), a duration (half an hour)');
  let bad = [];
  for (const c of C.languages) for (const s of C.lang[c].sentences) { const t = N.clockOf(C, c, s); if (t && !(new RegExp(`\\b(${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][t.h]}|${t.h})\\b`).test(s.gloss.toLowerCase()))) bad.push(s.id); }
  ok(!bad.length, 'every time read is confirmed by the gloss' + (bad.length ? ' — ' + bad.slice(0, 5) : ''));
  const D = (c, t) => { const s = find(c, t); const r = s && N.dateOf(C, c, s); return r ? `${r.d}.${r.m}` : null; };
  ok(D('de', 'Mein Geburtstag ist am dritten März.') === '3.3' && D('zh', '今天是十月九号。') === '9.10' && D('ar', 'الْيَوْمُ هُوَ الْخَامِسُ مِنْ مَايُو.') === '5.5' && D('he', 'הַיּוֹם אַרְבָּעָה בְּיוּלִי.') === '4.7', 'dates: de am dritten März, zh 十月九号, ar الْخَامِسُ مِنْ مَايُو, he אַרְבָּעָה בְּיוּלִי');
  ok(D('zh', '九月是第九个月。') === null, 'not a date: “September is the ninth month”');
  for (const c of C.languages) {
    const ci = N.clockItems(C, L, c, { k: K[c], rng }), di = N.dateItems(C, L, c, { k: K[c], rng, max: 20 });
    ok(ci.length >= 3 && ci.every(i => i.options.includes(i.answer) && new Set(i.options).size === i.options.length) && di.length >= 4 && di.every(i => i.options.includes(i.answer) && new Set(i.options).size === i.options.length),
      `${c}: ${ci.length} clock items, ${di.length} date items (${[...new Set(di.map(i => i.kind))].join(', ')}), each answer among distinct options`);
  }
}

console.log('— typed answers: the stored sentence, its alts, every spelling the form index accepts');
{
  for (const c of C.languages) {
    const X = C.lang[c]; let exact = 0, plain = 0, wrongOrder = 0, n = 0;
    for (const s of X.sentences) {
      n++;
      if (N.typedAnswer(C, c, s, s.text).ok) exact++;
      if ((c === 'ar' || c === 'he') && N.typedAnswer(C, c, s, N.stripMarks(c, s.text)).ok) plain++;
      const w = s.text.split(' '); if (w.length > 2 && c !== 'zh') { const r = [...w].reverse().join(' '), same = a => a.toLowerCase().replace(/[\p{P}]/gu, '').split(' ').join(' '); if (same(r) !== same(s.text) && !(s.alts || []).includes(r) && N.typedAnswer(C, c, s, r).ok) wrongOrder++; }
    }
    ok(exact === n && (c !== 'ar' && c !== 'he' || plain === n) && wrongOrder === 0, `${c}: all ${n} sentences accepted as stored${c === 'ar' || c === 'he' ? ' and without vowel marks' : ''}; none in reversed order`);
  }
  const s = C.lang.ar.sentences.find(x => nfc(x.text) === nfc('هٰذَا كِتَابٌ.'));
  ok(s && !N.typedAnswer(C, 'ar', s, nfc('هٰذَا كُتُبٌ.')).ok, 'wrong vowel marks are not accepted deterministically (they go to the AI)');
  const s2 = C.lang.ar.sentences.find(x => x.text.split(' ').length >= 3), w = s2.text.split(' '); w[0] = N.stripMarks('ar', w[0]);
  ok(N.typedAnswer(C, 'ar', s2, w.join(' ')).how === 'variant', 'a sentence vocalized only in part: read by the form index as the same words (“variant”)');
  const d = C.lang.de.sentences.find(x => /\b[A-ZÄÖÜ][a-zäöüß]+\b/.test(x.text.split(' ').slice(1).join(' ')) && x.tokens.some(t => t.f && t.f.startsWith('N;')) && x.tokens.slice(1).some(t => t.f && t.f.startsWith('N;')));
  ok(d && N.typedAnswer(C, 'de', d, d.text.toLowerCase()).ok === false && N.typedAnswer(C, 'de', d, d.text.charAt(0).toLowerCase() + d.text.slice(1)).ok, 'German: a noun written small is not right; only the first letter is free');
}

console.log('— items from stored data only');
{
  for (const c of C.languages) {
    const X = C.lang[c], k = K[c];
    const tr = N.translateItems(C, L, c, { k, rng, max: 30 });
    const okTr = tr.every(it => { const s = X.sentenceById[it.sentence]; return it.answers[0] === s.text && it.gloss === s.gloss && s.req.filter(l => !k.R.has(l)).length <= s.cap && it.tiles.filter(t => s.tokens.some(x => x.t === t)).length >= it.size; });
    ok(tr.length >= 8 && okTr && tr.some(i => i.mode === 'typed'), `${c}: translate — ${tr.length} items, answers = the bank sentence + alts, tiles = its words (+ one wrong form), ≤ ⌈30 %⌉ unknown words`);
    const tiles = N.translateItems(C, N.newLearner(C), c, { rng, max: 5, mode: undefined, sentences: N.selectSentences(C, c, { known: new Set(), maxUnknown: 99 }).slice(0, 20) });
    ok(tiles.every(i => i.mode === 'tiles'), `${c}: a beginner translates with tiles`);
    const rw = N.rewriteItems(C, L, c, { k, rng, max: 30 });
    ok(rw.length && rw.every(it => it.answers.length ? X.sentenceById[it.target].variantOf === it.sentence && it.answers[0] === X.sentenceById[it.target].text : !it.target) && rw.some(i => i.answers.length) && rw.some(i => i.kind === 'expand'),
      `${c}: rewrite / expand — stored answers are the bank variants of the sentence; open ones (paraphrase, expand) have none (AI-judged)`);
    const rg = N.registerItems(C, L, c, { k, rng, max: 30 });
    ok(rg.every(it => it.answer === X.sentenceById[it.sentence].text && it.options.includes(X.sentenceById[X.sentenceById[it.sentence].variantOf].text)) && rg.length >= 2, `${c}: register — ${rg.length} items, the answer is the variant with the asked register (${[...new Set(rg.map(i => i.ask))].join(' / ')})`);
    const dl = N.dialogueItems(C, L, c, { k, rng, max: 30 });
    ok(dl.length >= 2 && dl.every(it => { const ts = N.turnsOf(X.sentenceById[it.sentence]); return ts.length === 2 && nfc(it.answer) === nfc(N.joinTokens(ts[1], X.language.tokenJoin)) && new Set(it.options).size === it.options.length; }), `${c}: dialogue turns — ${dl.length} items, the answer is the stored second turn`);
    const texts = N.readerTexts(C, L, c, { k });
    const okTexts = texts.every(t => t.sentences.length >= 4 && t.sentences.every(id => X.sentenceById[id].req.filter(l => !k.R.has(l)).length <= 1));
    const qs = texts.slice(0, 5).flatMap(t => N.readerQuestions(C, L, c, t, { rng }).map(q => ({ q, t })));
    const okQ = qs.every(({ q, t }) => t.sentences.some(id => X.sentenceById[id].gloss === q.answer) && q.options.filter(o => o !== q.answer).every(o => !t.sentences.some(id => X.sentenceById[id].gloss === o)));
    ok(texts.length >= 5 && okTexts && qs.length && okQ, `${c}: graded reader — ${texts.length} texts of related frames, ≤ 1 unknown word per sentence; questions answered by the stored glosses, wrong options not in the text`);
    const task = N.composeTask(C, L, c, { k, rng });
    ok(task && task.required.length === 3 && task.required.every(l => k.R.has(l)), `${c}: guided writing — a topic with 3 known words to use`);
    const used = N.composeCheck(C, c, task.required.map(l => X.lex[l].lemma).join(' ') + (c === 'zh' ? '。' : '.'), task, k.R);
    ok(used.missing.length === 0 && N.composeCheck(C, c, X.lex[task.required[0]].lemma, task, k.R).missing.length === 2, `${c}: the required words are found in any form by the tokenizer`);
  }
  // property: for random learners every sentence an item shows has at most ⌈30 %⌉ unknown words (D19)
  let viol = 0, items = 0;
  for (let r = 0; r < 25; r++) {
    const T = N.newLearner(C), day = 100;
    for (const c of C.languages) for (const id of Object.keys(C.lang[c].lex)) if (rng() < 0.4) N.review(C, T, c, id, 'r', true, day);
    for (const c of C.languages) {
      const k = N.known(C, T, c), X = C.lang[c];
      for (const it of [...N.translateItems(C, T, c, { k, rng }), ...N.rewriteItems(C, T, c, { k, rng }), ...N.clockItems(C, T, c, { k, rng }), ...N.registerItems(C, T, c, { k, rng }), ...N.dialogueItems(C, T, c, { k, rng })]) {
        items++; const s = X.sentenceById[it.sentence]; if (s.req.filter(l => !k.R.has(l)).length > s.cap) viol++;
      }
    }
  }
  ok(items > 500 && viol === 0, `25 random learners: ${items} items, every sentence with ≤ ⌈30 %⌉ unknown words`);
  // generators registered for the grammar files (§6.7): a realization may list them
  const g = C.lang.de.grammar['fn.numerals'];
  C.lang.de.grammar['fn.p7test'] = { ...g, generators: [{ type: 'translate', bank: { functions: ['fn.numerals'] } }, ...['number_words', 'clock', 'date', 'register', 'dialogue_turn', 'rewrite'].map(type => ({ type }))] };
  const ex = N.exercises(C, L, 'de', 'fn.p7test', { k: K.de, rng, max: 40 }); delete C.lang.de.grammar['fn.p7test'];
  ok(['translate', 'number', 'clock', 'date', 'register', 'dialogue', 'rewrite'].every(t => ex.some(i => i.type === t)) && ex.every(i => i.fn === 'fn.p7test'), 'GEN: translate, number_words, clock, date, register, dialogue_turn, rewrite — usable as generators of a grammar realization');
}

console.log('— the AI: prompts, checks of its text, the tutor context');
{
  const r = N.checkText(C, 'de', 'Ich esse eine Karotte und Schnitzel.', K.de.R);
  ok(r.unknown.includes('Schnitzel') && r.unlearned.includes('de:Karotte') && r.words.find(w => w.t === 'Ich').known, 'AI text checked against the form index: Schnitzel not in the course, Karotte in the course but not learned (🆕), Ich known');
  const s = C.lang.de.sentences[3], t = N.aiTask(C, L, 'de', { kind: 'translate', gloss: s.gloss, reference: [s.text], answer: 'xyz' });
  ok(t.system.includes('[noema:lang-judge]') && t.prompt.includes(s.text) && t.prompt.includes('xyz') && t.schema.properties.verdict.enum.includes('acceptable') && /not replace them/.test(t.system), 'the judge sees the course answer as the reference and may not replace it');
  const rb = N.aiTask(C, L, 'de', { kind: 'compose', prompt: 'Write …', required: ['de:Brot'], answer: 'Ich esse Brot.' });
  ok(['grammar', 'vocabulary', 'spelling', 'cohesion'].every(a => rb.schema.properties.aspects.required.includes(a)) && rb.prompt.includes('Brot'), 'the rubric: grammar, vocabulary, spelling, cohesion');
  const rt = N.readerTask(C, L, 'de', { k: K.de });
  ok(rt.validate({ sentences: [{ text: 'Ich esse Brot.' }, { text: 'Er trinkt Tee.' }, { text: 'Der Hund frisst Schnitzel.' }, { text: 'Wir essen Brot.' }] }).length === 0
    && rt.validate({ sentences: [{ text: 'Schnitzel Pommes.' }, { text: 'Ketchup Senf.' }, { text: 'Ich esse Brot.' }] }).length > 0
    && N.readerProblems(C, 'de', { sentences: [{ text: 'Der Hund frisst Schnitzel.' }] }, K.de.R).length === 1, 'an AI text: a sentence with a word outside the course is dropped; a repair is asked only when too few remain');
  const tt = N.tutorTask(C, L, 'ar', { fn: 'fn.numerals', intent: 'compare' }, { k: K.ar, cap: 150 });
  ok(tt.context.words.length === 150 && tt.system.includes(N.TUTOR_RULE) && tt.system.includes(C.lang.ar.grammar['fn.numerals'].summary.slice(0, 60)) && tt.system.includes(N.TUTOR_INTENTS.compare) && tt.system.includes('German (') !== tt.system.includes('de ('),
    'the tutor: the rule, the known words capped at 150 (production-known first), the function in this language and the others, the intent');
  const tq = N.tutorTask(C, L, 'zh', { node: 'fd.05', intent: 'quiz' }, { k: K.zh });
  ok(tq.system.includes(C.nodes['fd.05'].title) && tq.system.includes('二十') && tq.system.includes(N.TUTOR_INTENTS.quiz), 'quiz this node: the node, its words, its grammar');
}

/* ---------------------------------------------------------------- Part 2 · the browser ---------------------------------------------------------------- */
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed: the browser part is skipped)'); return finish(); }
  if (!fs.existsSync(path.join(ROOT, 'engine', 'langui.js'))) { console.log('  (not built: run tools/build.py)'); fails++; return finish(); }
  console.log('— the browser (Gemini mocked)');
  const browser = await chromium.launch();
  const AI = { calls: [] };
  async function mockGemini(ctx) {
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    await ctx.route('**/generativelanguage.googleapis.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}'), sys = body.systemInstruction?.parts?.[0]?.text || '', prompt = body.contents?.map(c => c.parts.map(p => p.text).join('')).join('\n') || '';
      AI.calls.push({ sys, prompt });
      let obj;
      if (sys.includes('[noema:lang-tutor]')) obj = { reply: '**Gut!** Ein Beispiel: Ich esse eine Karotte und Schnitzel. Und zählen: einundzwanzig.', target: ['Ich esse eine Karotte und Schnitzel.'] };
      else if (sys.includes('[noema:lang-reader]')) obj = { title: 'Mein Tag', sentences: [{ text: 'Ich esse Brot.', gloss: 'I eat bread.' }, { text: 'Er trinkt Tee.', gloss: 'He drinks tea.' }, { text: 'Der Hund frisst Schnitzel.', gloss: 'The dog eats schnitzel.' }, { text: 'Wir trinken Wasser.', gloss: 'We drink water.' }] };
      else if (prompt.includes('Grade each aspect')) obj = { aspects: { grammar: { score: 4, comment: 'Good.' }, vocabulary: { score: 3, comment: 'Simple.' }, spelling: { score: 2, comment: 'Capitals.' }, cohesion: { score: 4, comment: 'Fine.' } }, corrections: [{ from: 'brot', to: 'Brot', why: 'nouns take a capital' }], corrected: 'Ich esse Brot und Karotte.', feedback: 'Nice text.' };
      else if (sys.includes('[noema:lang-judge]')) obj = { verdict: 'acceptable', corrected: 'Ich esse eine Karotte und Schnitzel.', mistakes: [{ wrong: 'karotte', right: 'Karotte', why: 'a noun' }], feedback: 'Almost.' };
      else obj = { ok: true };
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });
    });
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await mockGemini(ctx);
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html';
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?account=anr&subject=' + SUBJ); await wait(1200);
  // a learner who has passed the foundations and C01–C04 everywhere
  await page.evaluate(() => { const U = NoemaLangUI.UI, N = NoemaLang, d = N.dayNumber();
    for (const c of U.C.languages) for (const nid of U.C.order) { if (!/^(fd|cr)\./.test(nid) || !U.C.lang[c].applies[nid]) continue;
      for (const id of U.C.lang[c].byNode[nid] || []) for (const t of ['r', 'p']) { N.review(U.C, U.L, c, id, t, true, d - 10); N.review(U.C, U.L, c, id, t, true, d - 9); N.review(U.C, U.L, c, id, t, true, d - 6); }
      if (U.C.nodes[nid].kind === 'lesson') N.recordCheck(U.C, U.L, c, nid, 1, d - 6); }
    NoemaLangUI.save(true); });
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(1200);
  await page.screenshot({ path: SHOTS + '/p7_home.png', fullPage: false });
  ok(await page.locator('.lx-prodlanes .lx-lanerow').count() === 4 && await page.locator('.lx-prodlanes .lx-towrite').count() === 4 && await page.locator('.lx-prodlanes .lx-toread').count() === 4, 'the home: a ✍️ Writing and a 📖 Reading lane for every language');

  // ---------- without a key: the AI buttons say how to add one ----------
  await page.click('.lx-lanerow[data-lang=de] .lx-towrite'); await wait(500);
  ok(await page.locator('.lx-keyhelp').count() === 1 && /aistudio\.google\.com/.test(await page.locator('.lx-keyhelp').innerText()), 'no key: the writing lane says how to add one (stored on this device)');
  await page.screenshot({ path: SHOTS + '/p7_write.png' });
  const cards = await page.$$eval('.lx-lanecard', b => b.map(x => [x.dataset.set, !x.disabled]));
  ok(cards.length === 7 && cards.every(([, en]) => en), 'seven writing sets, all ready: ' + cards.map(c => c[0]).join(', '));
  await page.click('.lx-lanerow, .lx-back button').catch(() => { });
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(800);
  await page.click('.lx-lanerow[data-lang=de] .lx-totutor'); await wait(300);
  ok(await page.locator('.lx-tutor .lx-keyhelp').count() === 1, 'the tutor without a key: how to add one');
  await page.click('.lx-tutor [data-intent=chat]'); await wait(200);
  ok(/needs an AI key/.test(await page.locator('.lx-tutor .lx-tmsgs').innerText()) && AI.calls.length === 0, 'its buttons say a key is needed; nothing is sent');
  await page.click('.lx-tutor button[aria-label="Close the tutor"]');

  // ---------- typed translate: decided by the stored data, no AI ----------
  const runOne = (c, sid, mode = 'typed') => page.evaluate(({ c, sid, mode }) => { const U = NoemaLangUI.UI, N = NoemaLang, k = N.known(U.C, U.L, c);
    const items = N.translateItems(U.C, U.L, c, { k, mode, sentences: [U.C.lang[c].sentenceById[sid]].map(s => ({ ...s, unknown: [] })) }); NoemaLangUI.prod.runProd(items, { title: 't', back: '#/write/' + c, lang: c }); return items.length; }, { c, sid, mode });
  const pickS = (c, re) => page.evaluate(({ c, re }) => NoemaLangUI.UI.C.lang[c].sentences.find(s => new RegExp(re).test(s.text) && !s.variantOf && s.nwords >= 3)?.id, { c, re });
  const deS = await pickS('de', '^Ich esse');
  await runOne('de', deS); await wait(200);
  const deText = await page.evaluate(id => NoemaLangUI.UI.C.lang.de.sentenceById[id].text, deS);
  ok(await page.locator('.lx-extrans[data-mode=typed] input.lx-typed').getAttribute('lang') === 'de', 'typed translate: an input in the language (lang set)');
  await page.fill('.lx-typed', deText); await page.press('.lx-typed', 'Enter'); await wait(200);
  ok(await page.locator('.lx-fb.ok[data-how=exact]').count() === 1 && AI.calls.length === 0, 'the stored sentence typed (Enter) → ✅ without the AI');
  const arS = await pickS('ar', '.');
  await runOne('ar', arS); await wait(200);
  const arPlain = await page.evaluate(id => NoemaLang.stripMarks('ar', NoemaLangUI.UI.C.lang.ar.sentenceById[id].text), arS);
  ok(await page.locator('.lx-typed').getAttribute('dir') === 'rtl', 'the Arabic input runs right to left');
  await page.fill('.lx-typed', arPlain); await page.click('.lx-typebox button:has-text("Check")'); await wait(200);
  ok(await page.locator('.lx-fb.ok').count() === 1 && AI.calls.length === 0, 'Arabic without vowel marks → ✅ (the form index reads the same words), no AI');
  // something else: no key → the course's answer and how to get a key
  await runOne('de', deS); await wait(200);
  await page.fill('.lx-typed', 'Ich esse karotte.'); await page.press('.lx-typed', 'Enter'); await wait(200);
  ok(await page.locator('.lx-ref').count() === 1 && await page.locator('.lx-typebox .lx-keyhelp').count() === 1 && AI.calls.length === 0, 'another answer without a key: the course’s answer + how to add a key');

  // ---------- with a key: AI-judged, its text checked against the form index ----------
  await page.evaluate(() => localStorage.setItem('noema-device:geminiKey:anr', 'TEST-KEY'));
  await runOne('de', deS); await wait(200);
  await page.fill('.lx-typed', 'Ich esse karotte.'); await page.press('.lx-typed', 'Enter'); await wait(700);
  const judge = AI.calls.find(x => x.sys.includes('[noema:lang-judge]'));
  ok(!!judge && judge.prompt.includes(deText) && judge.prompt.includes('Ich esse karotte.'), 'another answer → the AI judges it, with the course’s answer as the reference');
  ok(await page.locator('.lx-aiv .lx-ai').count() === 1 && /AI-judged/.test(await page.locator('.lx-aiv').innerText()) && await page.locator('.lx-aiv[data-verdict=acceptable]').count() === 1, 'the verdict is labelled “AI-judged”');
  ok(nfc(await page.locator('.lx-ref .lx-w').innerText()) === nfc(deText) && /not the answer key/.test(await page.locator('.lx-aicorr').innerText()), 'the course’s answer stays the reference; the AI correction is marked as not the answer key');
  ok(await page.locator('.lx-aicorr .lx-new:has-text("Karotte")').count() === 1 && await page.locator('.lx-aicorr .lx-notin:has-text("Schnitzel")').count() === 1 && /Not in the course: Schnitzel/.test(await page.locator('.lx-aicorr .lx-wordsnote').innerText()) && /Karotte = carrot/.test(await page.locator('.lx-aicorr .lx-wordsnote').innerText()),
    'the AI text tokenized: 🆕 Karotte glossed (a course word not learned yet), Schnitzel marked “not in the course”');
  await page.screenshot({ path: SHOTS + '/p7_judged.png', fullPage: true });
  await page.click('.lx-aicorr .lx-new'); await wait(200);
  ok(await page.locator('.lx-pop .lx-card').count() >= 1, 'a word of the AI text opens its word card'); await page.click('.lx-pop button:has-text("✕")');
  await page.click('.lx-next'); await wait(150);
  ok(/1 right/.test(await page.locator('.lx-result').innerText()), 'an “acceptable” AI verdict counts as right');

  // ---------- tiles (a beginner's translate) ----------
  await runOne('de', deS, 'tiles'); await wait(200);
  const toks = await page.evaluate(id => NoemaLangUI.UI.C.lang.de.sentenceById[id].tokens.filter(t => !t.p).map(t => t.t), deS);
  for (const t of toks) for (const b of await page.$$('.lx-stage .lx-tile1:not([disabled])')) if ((await b.innerText()) === t) { await b.click(); break; }
  await wait(150);
  ok(await page.locator('.lx-extrans[data-mode=tiles] .lx-slot.right').count() === 1, 'translate with tiles: the stored sentence built → ✅');

  // ---------- rewrite with a stored variant; expand → AI with the vocabulary check ----------
  const rwOk = await page.evaluate(() => { const U = NoemaLangUI.UI, N = NoemaLang, k = N.known(U.C, U.L, 'de');
    const it = N.rewriteItems(U.C, U.L, 'de', { k, kind: 'rewrite', storedOnly: true, max: 50 }).find(i => i.answers.length); window.__rw = it; NoemaLangUI.prod.runProd([it], { title: 'r', back: '#/', lang: 'de' }); return !!it; });
  await wait(200); const calls0 = AI.calls.length;
  await page.fill('.lx-typed', await page.evaluate(() => window.__rw.answers[0])); await page.press('.lx-typed', 'Enter'); await wait(200);
  ok(rwOk && await page.locator('.lx-exrewrite .lx-fb.ok').count() === 1 && AI.calls.length === calls0 && /Make it|Put it|Say it|Ask|Point/.test(await page.locator('.lx-constraint').innerText()), 'rewrite under a constraint with a stored variant → decided without the AI');
  await page.evaluate(() => { const U = NoemaLangUI.UI, N = NoemaLang, k = N.known(U.C, U.L, 'de'); NoemaLangUI.prod.runProd([N.rewriteItems(U.C, U.L, 'de', { k, kind: 'expand', max: 5 })[0]], { title: 'e', back: '#/', lang: 'de' }); });
  await wait(200);
  await page.fill('.lx-typed', 'Ich esse heute eine Karotte und Schnitzel.'); await page.press('.lx-typed', 'Enter'); await wait(700);
  ok(await page.locator('.lx-exrewrite[data-kind=expand] .lx-vocab .lx-notin').count() >= 1 && await page.locator('.lx-exrewrite .lx-aiv').count() === 1 && AI.calls.length === calls0 + 1, 'expand: the learner’s words checked against the course, then AI-judged');

  // ---------- guided writing: required words (deterministic) + the AI rubric ----------
  await page.evaluate(() => { const U = NoemaLangUI.UI, N = NoemaLang, k = N.known(U.C, U.L, 'de'); const t = N.composeTask(U.C, U.L, 'de', { k, node: 'fd.07' }); window.__task = t; NoemaLangUI.prod.runProd([t], { title: 'c', back: '#/', lang: 'de' }); });
  await wait(200);
  const req = await page.evaluate(() => window.__task.required.map(l => NoemaLangUI.UI.C.lang.de.lex[l].lemma));
  ok(req.length === 3 && await page.locator('.lx-req').count() === 3, 'guided writing: a prompt and three words to use: ' + req.join(', '));
  await page.fill('.lx-typed.lx-compose', `Ich habe brot. ${req[0]} ${req[1]}.`); await page.press('.lx-typed.lx-compose', 'Control+Enter'); await wait(700);
  await page.screenshot({ path: SHOTS + '/p7_rubric.png', fullPage: true });
  ok(await page.locator('.lx-badge.lx-used').count() >= 2 && await page.locator('.lx-badge.lx-missing').count() >= 1, 'the course checks which required words are used (any form)');
  ok(await page.locator('.lx-rubric .lx-aspect').count() === 4 && await page.locator('.lx-rubric .lx-ai').count() === 1 && await page.locator('.lx-marked del:has-text("brot")').count() === 1 && await page.locator('.lx-marked ins:has-text("Brot")').count() === 1,
    'the AI rubric: four aspects, the corrections inline (brot → Brot), labelled');

  // ---------- numbers, clock, dates, register, dialogue: through the lane, answered right ----------
  for (const [c, set] of [['de', 'numbers'], ['ar', 'numbers'], ['zh', 'clock'], ['he', 'date'], ['ar', 'register'], ['zh', 'register']]) {
    await page.goto(url + '?account=anr&subject=' + SUBJ + `#/write/${c}/${set}`); await wait(700);
    let n = 0, right = 0;
    while (n < 15) {
      const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) break;
      const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); if (!opts.length) break;
      await opts[it.options.indexOf(it.answer)].click(); await wait(60);
      if (await page.$('.lx-stage .lx-fb.ok')) right++; n++;
      await page.click('.lx-stage .lx-next'); await wait(60);
    }
    ok(n >= 3 && right === n && /0 to practise again/.test(await page.locator('.lx-result').innerText()), `${c} ${set}: ${n} items answered right through the lane`);
  }
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/write/ar/numbers'); await wait(600);
  ok(/[٠-٩]|×/.test(await page.locator('.lx-stage').innerText()) || await page.locator('.lx-stage .lx-digits').count() > 0, 'Arabic numbers: Arabic-Indic digits or counting phrases');
  await page.keyboard.press('1'); await wait(80);
  ok(await page.locator('.lx-stage .lx-opts[data-done]').count() === 1, 'keyboard: 1–4 choose an option');
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/write/de/clock'); await wait(600);
  await page.screenshot({ path: SHOTS + '/p7_clock.png' });
  ok(await page.locator('.lx-stage svg.lx-clockface').count() >= 1, 'the clock: an analogue clock face');

  // ---------- reading ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/read/zh'); await wait(700);
  ok(await page.locator('.lx-textcard').count() >= 5, 'the reading lane lists graded texts: ' + await page.locator('.lx-textcard').count());
  await page.click('.lx-textcard >> nth=0'); await wait(500);
  ok(await page.locator('.lx-reader .lx-sent').count() >= 4 && await page.$$eval('.lx-reader .lx-sent', s => s.every(x => x.lang === 'zh' && x.dir)), 'a text: its sentences in the language (lang + dir)');
  await page.click('.lx-reader .lx-eye >> nth=0'); await wait(100); await page.screenshot({ path: SHOTS + '/p7_reader.png' });
  ok(await page.locator('.lx-reader .lx-rtr:not([hidden])').count() === 1, '👁 shows the meaning of a sentence');
  await page.click('.lx-reader .lx-tok >> nth=0'); await wait(200);
  ok(await page.locator('.lx-pop .lx-card').count() >= 1, 'tap a word: its card'); await page.click('.lx-pop button:has-text("✕")');
  await page.click('.lx-readq'); await wait(300);
  let qn = 0, qr = 0;
  while (qn < 5) { const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) break; ok(qn > 0 || await page.locator('.lx-readtext .lx-reader').count() === 1, 'the question shows the text above it');
    const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); await opts[it.options.indexOf(it.answer)].click(); await wait(60); if (await page.$('.lx-stage .lx-fb.ok')) qr++; qn++; await page.click('.lx-stage .lx-next'); await wait(60); }
  ok(qn >= 2 && qr === qn, `comprehension questions answered from the stored glosses (${qr}/${qn})`);
  // the AI reader: the tokenizer decides
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/read/de'); await wait(600);
  await page.click('button:has-text("A new text written by the AI")'); await wait(900);
  ok(/AI-written · checked/.test(await page.locator('h1').innerText()) && await page.locator('.lx-reader .lx-rsent').count() === 3 && !/Schnitzel/.test(await page.locator('.lx-reader').innerText()) && /3 of 4 sentences passed/.test(await page.locator('.lx-view').innerText()),
    'an AI-written text: the sentence with a word outside the course is left out (3 of 4 kept), labelled');

  // ---------- the tutor in a language ----------
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/fn/fn.numerals/de'); await wait(700);
  ok(await page.locator('.lx-tutorrow [data-intent]').count() === 3, 'the grammar page: tutor buttons — explain this rule, compare the languages, quiz');
  const before = AI.calls.length;
  await page.click('.lx-tutorrow [data-intent=explain]'); await wait(800);
  const tc = AI.calls.slice(before).find(x => x.sys.includes('[noema:lang-tutor]'));
  const summary = await page.evaluate(() => NoemaLangUI.UI.C.lang.de.grammar['fn.numerals'].summary.slice(0, 50));
  ok(!!tc && tc.sys.includes('at most one new word per sentence') && tc.sys.includes(summary) && /KNOWN WORDS in German \(150 of \d+/.test(tc.sys) && tc.sys.includes('Explain this rule'),
    'the tutor’s instructions: the rule, the function in German, the learner’s known words, the intent');
  ok(await page.locator('.lx-tutor .lx-tmsg.ai .lx-tl[lang=de]').count() === 1 && await page.locator('.lx-tutor .lx-tcheck .lx-new:has-text("Karotte")').count() === 1 && await page.locator('.lx-tutor .lx-tcheck .lx-notin:has-text("Schnitzel")').count() === 1,
    'its reply: the German sentence marked (lang), checked against the course — 🆕 Karotte glossed, Schnitzel not in the course');
  await page.fill('.lx-tutor .lx-tin', 'Danke! Noch ein Beispiel?'); await page.press('.lx-tutor .lx-tin', 'Enter'); await wait(800);
  await page.screenshot({ path: SHOTS + '/p7_tutor.png' });
  const last = AI.calls[AI.calls.length - 1];
  ok(await page.locator('.lx-tutor .lx-tmsg.me').count() === 2 && /Learner: Explain this rule/.test(last.prompt) && /Tutor: \*\*Gut!\*\*/.test(last.prompt), 'the conversation goes on with its history');
  const convos = await page.evaluate(async () => (await NoemaConvos.list('anr')).filter(r => r.subject?.id === 'lang:polyglot-semitic-zh-de').map(r => [r.mode, r.messages.length]));
  ok(convos.length === 1 && convos[0][0] === 'lang-explain' && convos[0][1] === 4, 'the tutor conversation is kept with the others (NoemaConvos)');
  await page.click('.lx-tutor button[aria-label="Close the tutor"]');
  await page.goto(url + '?account=anr&subject=' + SUBJ + '#/lesson/fd.05'); await wait(700);
  await page.click('.lx-tutorrow [data-intent=quiz]'); await wait(800);
  const tq = AI.calls[AI.calls.length - 1];
  ok(tq.sys.includes('Quiz this node') && tq.sys.includes('Numbers and the plural'), 'a lesson: “quiz this node” sends the node and its words');
  await page.click('.lx-tutor button[aria-label="Close the tutor"]');

  // ---------- phone width ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await mockGemini(phone);
  const pp = await phone.newPage(); pp.on('pageerror', e => E.push(e.message));
  await pp.goto(url); await pp.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  const wide = async () => pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  for (const hsh of ['#/', '#/write/ar', '#/read/he', '#/write/de/translate', '#/write/zh/clock']) {
    await pp.goto(url + '?account=anr&subject=' + SUBJ + hsh); await wait(900);
    ok(await wide() <= 0, `390 px: ${hsh} has no sideways scrolling`);
  }
  await pp.goto(url + '?account=anr&subject=' + SUBJ + '#/read/he'); await wait(700); await pp.click('.lx-textcard >> nth=0'); await wait(400);
  await pp.screenshot({ path: SHOTS + '/p7_phone_reader.png' });
  ok(await wide() <= 0 && await pp.$$eval('.lx-reader .lx-sent', s => s.every(x => x.dir === 'rtl')), '390 px: a Hebrew text, right to left, no sideways scrolling');
  await pp.goto(url + '?account=anr&subject=' + SUBJ + '#/'); await wait(700); await pp.click('.lx-lanerow[data-lang=he] .lx-totutor'); await wait(900);
  await pp.screenshot({ path: SHOTS + '/p7_phone_tutor.png' });
  ok(await wide() <= 0 && await pp.evaluate(() => document.querySelector('.lx-tutor').getBoundingClientRect().width <= 390), '390 px: the tutor fills the screen without sideways scrolling');

  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.slice(0, 3).join(' | ') : ''));
  await browser.close();
  finish();
})().catch(e => { console.error(e); fails++; finish(); });
function finish() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exitCode = fails ? 1 : 0; }
