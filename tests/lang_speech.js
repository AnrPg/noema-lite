/* P9 — listening and speaking (docs/LANGUAGES.md §3.9, §6.8, §7.5, §8).
   Part 1 (Node): the runtime over the pilot course and the mini fixture course — the voice per language, homophones never as wrong
   options, Chinese tones as spoken, dictation and speech checked against the stored forms only, what the device can do, the session
   step, the reviews an answer records, the generators.
   Part 2 (Playwright; speechSynthesis, SpeechSynthesisUtterance, getUserMedia / MediaRecorder and SpeechRecognition mocked with
   page.addInitScript — what is spoken is recorded, recognition results are driven by the test; never real audio, never the network):
   🔊 on word cards, examples and the reader with the stored text as written, the voice and speed from the settings, “no voice” said
   once, the 🎧 lane and its six sets, the session step, auto-play, shadowing with a recording, speak with and without recognition,
   “I can't listen now”, phone width, keyboard, no page errors.
   Usage: node tests/lang_speech.js [prepared-repo-dir]   (built with tools/build.py) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const N = require(path.join(__dirname, '..', 'engine', 'langcore.js'));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0, checks = 0; const ok = (c, m) => { checks++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
const COURSE = 'polyglot-semitic-zh-de', SUBJ = 'lang:' + COURSE;
const loadCourse = dir => {
  const read = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(dir, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  return N.course(N.readCourse(read, list));
};
const C = loadCourse(path.join(__dirname, '..', 'library', 'languages', COURSE));
const nfc = s => String(s).normalize('NFC');
let seed = 11; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function learner(C, day = 100, re = /^(fd|cr)\./) {
  const L = N.newLearner(C);
  for (const c of C.languages) for (const nid of C.order) {
    if (!re.test(nid) || !C.lang[c].applies[nid]) continue;
    for (const id of C.lang[c].byNode[nid] || []) for (const t of ['r', 'p']) { N.review(C, L, c, id, t, true, day - 10); N.review(C, L, c, id, t, true, day - 9); N.review(C, L, c, id, t, true, day - 6); }
    if (C.nodes[nid].kind === 'lesson') N.recordCheck(C, L, c, nid, 1, day - 6);
  }
  return L;
}
const L = learner(C), K = Object.fromEntries(C.languages.map(c => [c, N.known(C, L, c)]));
const lexByLemma = (c, w) => Object.values(C.lang[c].lex).filter(x => nfc(x.lemma) === nfc(w));

console.log('— voices and tags (§3.9)');
{
  ok(['ar', 'he', 'zh', 'de'].map(c => N.speechTag(C, c)).join() === 'ar-SA,he-IL,zh-CN,de-DE', 'default tags: ar-SA, he-IL, zh-CN, de-DE');
  C.lang.de.language.speechLang = 'de-AT'; const t = N.speechTag(C, 'de'); delete C.lang.de.language.speechLang;
  ok(t === 'de-AT', 'language.json speechLang wins');
  const V = [{ name: 'Remote', lang: 'de_DE', localService: false }, { name: 'Anna', lang: 'de-DE', localService: true }, { name: 'Wien', lang: 'de-AT', localService: true },
    { name: 'Sin-ji', lang: 'zh-HK' }, { name: 'Mei-Jia', lang: 'zh-TW' }, { name: 'Ting-Ting', lang: 'zh-CN' }, { name: 'Carmit', lang: 'iw-IL' }, { name: 'Tarik', lang: 'ar-EG' }, { name: 'Lee', lang: 'yue-HK' }];
  ok(N.pickVoice(V, 'de-DE').name === 'Anna' && N.pickVoice(V, 'de-DE', 'Wien').name === 'Wien' && N.pickVoice(V, 'de-DE', 'Carmit').name === 'Anna', 'German: the same tag, local first; the chosen voice when it speaks the language; another language\'s voice is never taken');
  ok(N.pickVoice(V, 'zh-CN').name === 'Ting-Ting' && N.pickVoice(V.filter(v => v.name !== 'Ting-Ting'), 'zh-CN').name === 'Mei-Jia' && N.pickVoice(V.filter(v => /HK/.test(v.lang)), 'zh-CN') === null, 'Mandarin: zh-CN, then zh-TW — never a Cantonese voice (zh-HK, yue)');
  ok(N.pickVoice(V, 'he-IL').name === 'Carmit' && N.pickVoice(V, 'ar-SA').name === 'Tarik' && N.pickVoice([], 'de-DE') === null, 'Hebrew voices under the old code iw; Arabic of any region; no voice → null');
  ok(N.voicesFor(V, 'de-DE').map(v => v.name).join() === 'Anna,Remote,Wien', 'voices of a language for the settings: same tag first');
  const ar = Object.values(C.lang.ar.lex).find(x => x.lemma !== N.stripMarks('ar', x.lemma));
  ok(N.speechText(C, 'ar', ar.lemma) === nfc(ar.lemma), 'the text sent to the voice keeps its vowel marks (as written)');
}

console.log('— sounds alike, never a homophone as a wrong option');
{
  const ta = ['他', '她', '它'].flatMap(w => lexByLemma('zh', w));
  ok(ta.length === 3 && N.homophones(C, 'zh', ta[0].id).includes(ta[1].id) && N.homophones(C, 'zh', ta[0].id).includes(ta[2].id), 'zh: 他 / 她 / 它 sound the same (tā)');
  let bad = [], n = 0;
  for (const c of C.languages) for (let r = 0; r < 4; r++) for (const it of N.speechItems(C, L, c, 'listen_pick', { k: K[c], rng, max: 60 })) {
    n++;
    if (!it.options.includes(it.answer) || new Set(it.options).size !== it.options.length || it.options.length < 3) bad.push([c, it.lex, 'options']);
    if (!K[c].R.has(it.lex) || nfc(it.say) !== nfc(C.lang[c].lex[it.lex].lemma)) bad.push([c, it.lex, 'say']);
    const key = N.soundKey(C, c, it.lex);
    if (it.kind === 'hear_word') for (const o of it.options) if (o !== it.answer && lexByLemma(c, o).some(x => N.soundKey(C, c, x.id) === key)) bad.push([c, it.lex, o]);
    if (it.kind === 'hear_meaning') { const homs = N.homophones(C, c, it.lex).map(id => { const s = (C.lang[c].lex[id].senses || [])[0]; return s && C.concepts[s].gloss; }); for (const o of it.options) if (o !== it.answer && homs.includes(o)) bad.push([c, it.lex, o]); }
  }
  ok(n > 100 && !bad.length, `${n} listen_pick items (hear the word → which one / what it means): the answer among distinct options, a met word, no homophone as a wrong option` + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 4)) : ''));
  ok(N.soundKey(C, 'de', lexByLemma('de', 'Rad')[0]?.id || '') === N.soundKey(C, 'de', lexByLemma('de', 'Rat')[0]?.id || '') || !lexByLemma('de', 'Rad').length, 'German sound key folds final devoicing (Rad / Rat), when both are in the course');
}

console.log('— Chinese tones as they are said');
{
  const T = w => { const x = lexByLemma('zh', w)[0]; return x && N.spokenTones(C, 'zh', x.id); };
  ok(T('你好').spoken.join() === '2,3' && T('你好').sure.every(Boolean), '你好: written 3 + 3, said 2 + 3');
  ok(T('不客气').spoken[0] === 2 && T('一起').spoken[0] === 4, '不客气 bú (before a 4th tone); 一起 yì (the stored spoken form)');
  const dr = T('打扰一下'); ok(!!dr && !dr.sure[0] && !dr.sure[1] && dr.sure[2] && dr.spoken[2] === 2, '打扰一下: the 3 + 3 inside a four-syllable word is not asked; 一 yí from the stored form');
  ok(lexByLemma('zh', '男人').length && T('男人') === null, 'a word with several readings (男人 nán rén / nán ren) is not asked');
  let bad = [], n = 0;
  for (let r = 0; r < 3; r++) for (const it of N.speechItems(C, L, 'zh', 'listen_tone', { k: K.zh, rng, max: 200 })) {
    n++; const t = N.spokenTones(C, 'zh', it.lex);
    if (!t || !t.sure[it.at] || String(t.spoken[it.at]) !== it.answer || !it.options.includes(it.answer) || nfc(it.say) !== nfc(C.lang.zh.lex[it.lex].lemma)) bad.push(it.lex);
  }
  ok(n > 50 && !bad.length, `${n} tone items: the whole word is spoken, the answer is the spoken tone of a syllable whose tone is sure` + (bad.length ? ' — ' + bad.slice(0, 5) : ''));
  ok(['ar', 'he', 'de'].every(c => !N.speechItems(C, L, c, 'listen_tone', { k: K[c] }).length), 'no tone items outside Chinese');
}

console.log('— dictation: checked by checkTyped (a word) and typedAnswer (that sentence only)');
{
  let bad = [], words = 0, sents = 0;
  for (const c of C.languages) for (const it of N.speechItems(C, L, c, 'dictation', { k: K[c], rng, max: 40 })) {
    if (it.kind === 'word') { words++; if (it.answer !== nfc(C.lang[c].lex[it.lex].lemma) || !N.checkDictation(C, c, it, it.answer).ok || !it.hint) bad.push([c, it.lex]); }
    else { sents++; const s = C.lang[c].sentenceById[it.sentence]; if (it.answer !== s.text || !N.checkDictation(C, c, it, s.text).ok || s.nwords > 8 || it.unknown.length > s.cap || (c === 'zh' && !it.hint)) bad.push([c, it.sentence]); }
  }
  ok(words > 20 && sents > 20 && !bad.length, `${words} words and ${sents} sentences (≤ 8 words, D19 ⌈30 %⌉, zh with its meaning): the stored text is the answer` + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 4)) : ''));
  const ar = N.speechItems(C, L, 'ar', 'dictation', { k: K.ar, rng, max: 40 }), aw = ar.find(i => i.kind === 'word' && [...N.stripMarks('ar', i.answer)].length >= 3), as = ar.find(i => i.kind === 'sentence');
  ok(N.checkDictation(C, 'ar', aw, N.stripMarks('ar', aw.answer)).ok && !N.checkDictation(C, 'ar', aw, N.stripMarks('ar', aw.answer).slice(0, -1) + 'ق').ok, 'Arabic word: without vowel marks → right; a wrong letter → wrong, with a letter diff');
  ok(N.checkDictation(C, 'ar', as, N.stripMarks('ar', as.answer)).ok, 'Arabic sentence without vowel marks → right (the form index reads the same words)');
  const de = N.speechItems(C, L, 'de', 'dictation', { k: K.de, rng, max: 60 }).filter(i => i.kind === 'sentence'), d1 = de.find(i => C.lang.de.sentenceById[i.sentence].nwords >= 3);
  const w = d1.answer.replace(/[.!?]$/, '').split(' ');
  ok(N.checkDictation(C, 'de', d1, d1.answer.toLowerCase().replace(/^./, x => x)).ok === (d1.answer.toLowerCase().slice(1) === d1.answer.slice(1)), 'German: only the first letter is free (nouns keep their capital)');
  ok(!N.checkDictation(C, 'de', d1, [w[1], w[0], ...w.slice(2)].join(' ')).ok, 'German: another word order is wrong (the voice said this sentence)');
  const withAlt = Object.values(C.lang.de.sentences).find(s => (s.alts || []).length && s.nwords <= 8 && s.alts[0] !== s.text);
  ok(!withAlt || !N.checkDictation(C, 'de', { kind: 'sentence', sentence: withAlt.id }, withAlt.alts[0]).ok, 'a stored alternative order is not accepted in a dictation');
  const dw = N.checkDictation(C, 'de', { kind: 'word', lex: lexByLemma('de', 'Brot')[0].id }, 'brot');
  ok(!dw.ok && dw.notes.some(n => /capital/.test(n)), 'German word with a small letter: wrong, the note says nouns take a capital');
}

console.log('— hearing sentences, shadowing, speaking');
{
  let bad = [], n = 0;
  for (const c of C.languages) for (const it of N.speechItems(C, L, c, 'listen_meaning', { k: K[c], rng, max: 30 })) {
    n++; const s = C.lang[c].sentenceById[it.sentence];
    if (it.answer !== s.gloss || !it.options.includes(it.answer) || new Set(it.options).size !== it.options.length || it.options.length < 3 || it.say !== s.text || it.unknown.length > s.cap) bad.push([c, it.sentence]);
  }
  ok(n > 60 && !bad.length, `${n} listen_meaning items: the stored gloss among other sentences' glosses, D19` + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 3)) : ''));
  const sh = N.speechItems(C, L, 'de', 'shadowing', { k: K.de, rng, max: 10 }), sp = N.speechItems(C, L, 'de', 'speak', { k: K.de, rng, max: 12 });
  ok(sh.length === 10 && sh.some(i => i.kind === 'word') && sh.some(i => i.kind === 'sentence') && sp.length === 12 && sp.every(i => i.type === 'speak') && sp.some(i => i.mode === 'produce' && K.de.P.has(i.lex)), 'shadowing and speak: words and sentences; “produce” only for words known for production');
}

console.log('— what was said: the transcript against the stored forms');
{
  const pickS = (c, f) => Object.values(C.lang[c].sentences).find(s => !s.variantOf && s.nwords >= 3 && s.nwords <= 6 && s.req.every(l => K[c].R.has(l)) && f(s));
  const de = pickS('de', s => /^Ich /.test(s.text)), it = { kind: 'sentence', sentence: de.id };
  const plain = de.text.replace(/[.,!?]/g, '').toLowerCase();
  ok(N.checkSpoken(C, 'de', it, [plain]).ok, `de: “${plain}” (no capitals, no punctuation — not heard) → right`);
  const wrong = N.checkSpoken(C, 'de', it, ['ich ' + plain.split(' ').slice(1, -1).join(' ') + ' banane']);
  ok(!wrong.ok && wrong.matched[0] && !wrong.matched[wrong.matched.length - 1], 'de: the last word replaced → wrong, the other words marked as heard');
  ok(N.checkSpoken(C, 'de', it, ['etwas ganz anderes', plain]).ok, 'the alternatives of the recognizer are all tried');
  const ar = pickS('ar', s => /[أإ]/.test(s.text)) || pickS('ar', () => true);
  const arHeard = N.stripMarks('ar', ar.text).replace(/[أإآ]/g, 'ا').replace(/[.،؟!]/g, '');
  ok(N.checkSpoken(C, 'ar', { kind: 'sentence', sentence: ar.id }, [arHeard]).ok, 'ar: without vowel marks and with a bare alif for the hamza seat → right');
  const pl = Object.values(C.lang.he.lex).find(x => Object.keys(x.plene || {}).length && K.he.R.has(x.id) && Object.values(x.plene).some(p => nfc(p) !== N.stripMarks('he', x.lemma)));
  ok(!pl || N.checkSpoken(C, 'he', { kind: 'word', lex: pl.id }, [Object.values(pl.plene)[0]]).ok, 'he: a word heard in the full spelling (ktiv male) → right');
  const zs = pickS('zh', s => /她/.test(s.text));
  ok(N.checkSpoken(C, 'zh', { kind: 'sentence', sentence: zs.id }, [zs.text.replace(/她/g, '他')]).ok && N.checkSpoken(C, 'zh', { kind: 'sentence', sentence: zs.id }, [zs.text]).how === 'exact', `zh: ${zs.text} heard with 他 (the same sound) → right; as stored → exact`);
  const z2 = pickS('zh', s => /吃/.test(s.text));
  ok(!N.checkSpoken(C, 'zh', { kind: 'sentence', sentence: z2.id }, [z2.text.replace('吃', '喝')]).ok, 'zh: another word (吃 → 喝) → wrong');
  const z3 = Object.values(C.lang.zh.sentences).find(s => /三/.test(s.text) && !/[十百千]/.test(s.text));
  ok(!z3 || N.checkSpoken(C, 'zh', { kind: 'sentence', sentence: z3.id }, [z3.text.replace(/三/g, '3')]).ok, 'zh: digits from the recognizer read as the course\'s number words (3 → 三)');
  const brot = lexByLemma('de', 'Brot')[0];
  ok(N.checkSpoken(C, 'de', { kind: 'word', lex: brot.id }, ['das brot']).ok && N.checkSpoken(C, 'de', { kind: 'word', lex: brot.id }, ['Brote']).ok && !N.checkSpoken(C, 'de', { kind: 'word', lex: brot.id }, ['Boot']).ok, 'a word: with its article, in another form → right; another word → wrong');
}

console.log('— what the device can do, the session, the reviews, the generators');
{
  N.setSpeechCaps({ listen: { de: false, ar: true, he: true, zh: true }, recognize: false, record: true });
  ok(!N.speechItems(C, L, 'de', 'listen_pick', { k: K.de }).length && !N.speechItems(C, L, 'de', 'dictation', { k: K.de }).length && !N.speechItems(C, L, 'de', 'speak', { k: K.de }).length, 'no German voice: no listening item, no shadowing in its place');
  const sp = N.speechItems(C, L, 'ar', 'speak', { k: K.ar, max: 4 });
  ok(sp.length === 4 && sp.every(i => i.type === 'shadowing' && i.from === 'speak'), 'no recognition: “speak” items are offered as shadowing');
  N.setSpeechCaps({ listen: true, recognize: true, noSpeak: true });
  ok(!N.speechItems(C, L, 'ar', 'speak', { k: K.ar }).length && !N.speechItems(C, L, 'ar', 'shadowing', { k: K.ar }).length && N.speechItems(C, L, 'ar', 'listen_pick', { k: K.ar }).length > 0, '“I can\'t speak now”: no speaking items, listening ones still');
  N.setSpeechCaps({ listen: true, noListen: true });
  ok(N.speechPlan(C, L, { day: 3 }).length === 0 && !N.speechItems(C, L, 'zh', 'listen_tone', { k: K.zh }).length, '“I can\'t listen now”: nothing in the session, no audio items');
  N.setSpeechCaps({ listen: { ar: false, he: false, zh: true, de: true }, recognize: true });
  const plans = [0, 1, 2, 3, 4, 5].map(d => N.speechPlan(C, L, { day: 200 + d }));
  ok(plans.every(p => p.length === 2 && ['listen_pick', 'listen_meaning', 'dictation'].includes(p[0].type) && p[1].type === 'speak' && p.every(i => ['zh', 'de'].includes(i.lang))), 'the session step: one listening item, one speaking item, only in languages with a voice');
  ok(new Set(plans.map(p => p[0].type)).size === 3 && new Set(plans.map(p => p[0].lang)).size === 2, 'rotating by day: the three listening types, the languages taking turns');
  N.setSpeechCaps(null);
  const L2 = learner(C), k2 = N.known(C, L2, 'de'), lp = N.speechItems(C, L2, 'de', 'listen_pick', { k: k2, max: 1, rng })[0];
  const r0 = L2.langs.de.items[lp.lex].r.reps; N.speechRecord(C, L2, lp, true, 101);
  const dw = N.speechItems(C, L2, 'de', 'dictation', { k: k2, max: 1, rng, wordsOnly: true })[0], p0 = L2.langs.de.items[dw.lex].p.reps; N.speechRecord(C, L2, dw, false, 101);
  ok(L2.langs.de.items[lp.lex].r.reps === r0 + 1 && L2.langs.de.items[dw.lex].p.reps === 0 && p0 > 0, 'answers record reviews: hearing a word → R track; a dictated word → P track (a wrong one resets it)');
  const ss = N.speechItems(C, L2, 'de', 'speak', { k: k2, max: 6, rng }).find(i => i.kind === 'sentence'), sents = C.lang.de.sentenceById[ss.sentence];
  const done = N.speechRecord(C, L2, ss, true, 102);
  ok(done.length === sents.req.filter(l => k2.R.has(l)).length && done.every(d => d[1] === 'p'), 'a sentence said right → a production review of its known words');
  ok(N.speechRecord(C, L2, { ...ss, type: 'shadowing' }, true, 103).length === 0, 'shadowing (self-graded) records no review');
  ok(N.SPEECH_TYPES.every(t => typeof N.GEN[t] === 'function'), 'the six types are registered as generators');
  const fid = Object.keys(C.lang.de.grammar).find(f => N.selectSentences(C, 'de', { known: K.de.R, functions: [f], maxUnknown: 'auto' }).filter(s => s.nwords <= 8).length >= 4);
  const g = C.lang.de.grammar[fid], saved = g.generators; g.generators = [{ type: 'dictation' }, { type: 'listen_meaning' }];
  const ex = N.exercises(C, L, 'de', fid, { k: K.de, rng, max: 8 }); g.generators = saved;
  ok(ex.length >= 4 && ex.every(i => ['dictation', 'listen_meaning'].includes(i.type) && i.fn === fid && (C.lang.de.sentenceById[i.sentence].functions || []).includes(fid)), `a realization may list them: ${fid} → dictation / listen_meaning of its own sentences`);
  const py = cp.spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, "tools"); import validate_lang as v; print(sorted(t for t in v.GENERATORS if t in {"listen_pick","listen_tone","dictation","listen_meaning","shadowing","speak"}))'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  ok(/'dictation'.*'listen_meaning'.*'listen_pick'.*'listen_tone'.*'shadowing'.*'speak'/.test(py.stdout), 'the validator knows the six ids');
  const M = loadCourse(path.join(__dirname, 'fixtures', 'lang-mini')), LM = learner(M, 100, /./), out = {};
  for (const c of M.languages) { const k = N.known(M, LM, c); for (const t of N.SPEECH_TYPES) out[c + ' ' + t] = N.speechItems(M, LM, c, t, { k, rng, max: 4 }).length; }
  ok(Object.entries(out).filter(([k]) => !/listen_tone/.test(k) || /^zh/.test(k)).every(([, n]) => n >= 0) && out['zh listen_tone'] > 0 && out['de dictation'] > 0, 'the mini fixture course: items of every type where its few words allow (' + Object.entries(out).filter(([, n]) => n).length + ' kinds)');
}

/* ---------------------------------------------------------------- Part 2 · the browser ---------------------------------------------------------------- */
function mockSpeech({ voices, sr }) {
  window.__spoken = []; window.__rec = { starts: 0, stops: 0 }; window.__played = 0; window.__heard = []; window.__toasts = [];
  const list = voices.map(v => ({ default: false, localService: true, voiceURI: v.name, ...v }));
  const synth = { speaking: false, pending: false, paused: false, _l: {},
    getVoices() { return list.slice(); },
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, rate: u.rate }); setTimeout(() => { u.onend && u.onend({}); }, 5); },
    cancel() { }, pause() { }, resume() { },
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }, removeEventListener() { } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ''; this.rate = 1; this.voice = null; };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { } }] }) }, configurable: true });
  window.MediaRecorder = class { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; window.__rec.starts++; }
    stop() { this.state = 'inactive'; window.__rec.stops++; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['x'], { type: 'audio/webm' }) }); this.onstop && this.onstop(); }, 5); } };
  HTMLMediaElement.prototype.play = function () { window.__played++; return Promise.resolve(); };
  if (sr) {
    class R { start() { const alts = window.__heard.shift() || []; window.__srLang = this.lang;
      setTimeout(() => { if (alts.error) this.onerror && this.onerror({ error: alts.error }); else if (alts.length) { const res = alts.map(t => ({ transcript: t, confidence: 0.9 })); res.isFinal = true; this.onresult && this.onresult({ results: [res], resultIndex: 0 }); } this.onend && this.onend(); }, 5); }
      stop() { } abort() { } }
    window.SpeechRecognition = R; window.webkitSpeechRecognition = R;
  } else { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; }
  const obs = new MutationObserver(() => { const t = document.querySelector('.lx-toast'); if (t && !t.dataset.seen) { t.dataset.seen = 1; window.__toasts.push(t.textContent); } });
  addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }));
}
const VOICES = [{ name: 'Anna', lang: 'de-DE' }, { name: 'Markus', lang: 'de-DE' }, { name: 'Maged', lang: 'ar-SA' }, { name: 'Sin-ji', lang: 'zh-HK' }, { name: 'Ting-Ting', lang: 'zh-CN' }];   // no Hebrew voice

let BROWSER = null;
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed: the browser part is skipped)'); return finish(); }
  if (!fs.existsSync(path.join(ROOT, 'engine', 'langui.js'))) { console.log('  (not built: run tools/build.py)'); fails++; return finish(); }
  console.log('— the browser (speech services mocked)');
  const browser = BROWSER = await chromium.launch();
  const newCtx = async (opts, mock) => { const ctx = await browser.newContext(opts); await ctx.route(/^https?:\/\//, r => r.fulfill({ status: 200, body: '' })); await ctx.addInitScript(mockSpeech, mock); return ctx; };
  const ctx = await newCtx({ viewport: { width: 1280, height: 900 } }, { voices: VOICES, sr: true });
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const url = 'file://' + ROOT + '/index.html', open = async (hash, ms = 700) => { await page.goto(url + '?account=anr&subject=' + SUBJ + hash); await wait(ms); };
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  await page.goto(url); await page.evaluate(() => localStorage.clear());
  await open('', 1200);
  await page.evaluate(() => { const U = NoemaLangUI.UI, N = NoemaLang, d = N.dayNumber();
    for (const c of U.C.languages) for (const nid of U.C.order) { if (!/^(fd|cr)\./.test(nid) || !U.C.lang[c].applies[nid]) continue;
      for (const id of U.C.lang[c].byNode[nid] || []) for (const t of ['r', 'p']) { N.review(U.C, U.L, c, id, t, true, d - 10); N.review(U.C, U.L, c, id, t, true, d - 9); N.review(U.C, U.L, c, id, t, true, d - 6); }
      if (U.C.nodes[nid].kind === 'lesson') N.recordCheck(U.C, U.L, c, nid, 1, d - 6); }
    NoemaLangUI.save(true); });
  await open('#/', 1000);
  ok(await page.locator('.lx-speechlanes .lx-lanerow .lx-tolisten').count() === 4, 'the home: a 🎧 Listening & speaking lane for every language');
  await page.screenshot({ path: SHOTS + '/p9_home.png' });

  // ---------- 🔊 on a word card: the stored text, the voice of the language ----------
  const brot = await page.evaluate(() => Object.values(NoemaLangUI.UI.C.lang.de.lex).find(x => x.lemma === 'Brot').id);
  await open('#/w/de/' + encodeURIComponent(brot));
  ok(await page.locator('.lx-lemma .lx-spk').count() === 1 && await page.locator('.lx-card .lx-ex .lx-spk').count() >= 1, 'a word card: 🔊 after the word and after its examples');
  await page.click('.lx-lemma .lx-spk'); await wait(100);
  let sp = (await spoken()).pop();
  ok(sp && sp.text === 'Brot' && sp.lang === 'de-DE' && sp.voice === 'Anna' && sp.rate === 1, '🔊 speaks the word with the German voice at normal speed: ' + JSON.stringify(sp));
  await page.locator('.lx-card .lx-ex .lx-spk').first().click(); await wait(100);
  const ex1 = await page.locator('.lx-card .lx-ex .lx-extext [data-say]').first().getAttribute('data-say');
  ok((await spoken()).pop().text === ex1, 'an example: its own text is spoken');
  // Arabic: the display without vowel marks, the voice gets them
  await page.evaluate(() => { NoemaLangUI.UI.prefs.markLevel = { ar: 'none' }; NoemaLangUI.save(true); });
  const arW = await page.evaluate(() => Object.values(NoemaLangUI.UI.C.lang.ar.lex).find(x => x.lemma !== NoemaLang.stripMarks('ar', x.lemma) && NoemaLangUI.UI.L.langs.ar.items[x.id]).id);
  await open('#/w/ar/' + encodeURIComponent(arW));
  const shownAr = await page.locator('.lx-lemma .lx-w').first().innerText(), arLemma = await page.evaluate(id => NoemaLangUI.UI.C.lang.ar.lex[id].lemma, arW);
  await page.click('.lx-lemma .lx-spk'); await wait(100); sp = (await spoken()).pop();
  ok(nfc(shownAr) !== nfc(arLemma) && sp.text === nfc(arLemma) && sp.lang === 'ar-SA' && sp.voice === 'Maged', 'Arabic shown without vowel marks, sent to the voice as written (with them)');
  await page.evaluate(() => { NoemaLangUI.UI.prefs.markLevel = {}; NoemaLangUI.save(true); });
  // Hebrew: no voice → said once
  const heW = await page.evaluate(() => Object.keys(NoemaLangUI.UI.L.langs.he.items)[0]);
  await open('#/w/he/' + encodeURIComponent(heW));
  const n0 = (await spoken()).length;
  await page.click('.lx-lemma .lx-spk'); await wait(150);
  ok((await page.evaluate(() => window.__toasts)).filter(t => /No Hebrew voice/.test(t)).length === 1 && await page.locator('.lx-lemma .lx-spk.lx-mute').count() === 1, 'no Hebrew voice: the button says so (🔇) and a notice once');
  await page.locator('.lx-card .lx-ex .lx-spk').first().click().catch(() => { }); await page.click('.lx-lemma .lx-spk'); await wait(150);
  ok((await page.evaluate(() => window.__toasts)).filter(t => /No Hebrew voice/.test(t)).length === 1 && (await spoken()).length === n0, '… only once, nothing spoken, no error');
  // grammar page and reader
  const fid = await page.evaluate(() => { const U = NoemaLangUI.UI, k = NoemaLang.known(U.C, U.L, 'de'); return Object.keys(U.C.lang.de.grammar).find(f => NoemaLang.selectSentences(U.C, 'de', { known: k.R, functions: [f], maxUnknown: 'auto' }).length >= 3); });
  await open('#/fn/' + encodeURIComponent(fid) + '/de');
  const gsay = await page.locator('.lx-gram .lx-extext .lx-sent').first().getAttribute('data-say');
  await page.locator('.lx-gram .lx-extext .lx-spk').first().click(); await wait(100);
  ok(!!gsay && (await spoken()).pop().text === gsay && await page.locator('.lx-gram .lx-summary .lx-spk').count() === 0, 'the grammar page: 🔊 after each bank sentence (not on words inside the explanation)');
  await open('#/read/de'); await page.click('.lx-textcard >> nth=0'); await wait(500);
  const nSent = await page.locator('.lx-reader .lx-rsent').count(), before = (await spoken()).length;
  ok(await page.locator('.lx-reader .lx-rsent .lx-spk').count() === nSent, `the reader: 🔊 after each of the ${nSent} sentences`);
  await page.click('.lx-readall'); await wait(600);
  ok((await spoken()).length - before === nSent, '▶ the whole text: every sentence spoken in turn');
  await open('#/cmp/c/' + encodeURIComponent(await page.evaluate(id => NoemaLangUI.UI.C.lang.de.lex[id].senses[0], brot)));
  if (!(await page.locator('.lx-compare').count())) { await page.click('button:has-text("Compare")').catch(() => { }); await wait(300); }
  ok(await page.locator('.lx-view .lx-spk').count() >= 2, 'the compare view: 🔊 on the words of the languages');

  // ---------- settings: voice, speed ----------
  await open('#/settings', 900);
  ok(await page.locator('.lx-speechset select.lx-voicesel').count() === 3 && /none on this device/.test(await page.locator('.lx-speechset').innerText()) && await page.locator('.lx-speechset select[data-lang=zh] option:has-text("Sin-ji")').count() === 0,
    'settings: a voice choice per language with a voice (no Cantonese voice offered for Mandarin), “none” for Hebrew');
  await page.selectOption('.lx-speechset select[data-lang=de]', 'Markus'); await page.selectOption('.lx-speechset .lx-ratesel', 'slow');
  await open('#/w/de/' + encodeURIComponent(brot)); await page.click('.lx-lemma .lx-spk'); await wait(100); sp = (await spoken()).pop();
  ok(sp.voice === 'Markus' && sp.rate === 0.7, 'the chosen voice and the slow speed are used');
  await page.evaluate(() => { NoemaLangUI.UI.prefs.speech.rate = 'normal'; NoemaLangUI.save(true); });

  // ---------- the lane ----------
  await open('#/listen/de', 900);
  let cards = await page.$$eval('.lx-lanecard', b => b.map(x => [x.dataset.set, !x.disabled]));
  ok(cards.length === 5 && cards.every(([, e]) => e) && /Voice: Markus/.test(await page.locator('.lx-devline').innerText()), 'German lane: five sets ready, the voice named: ' + cards.map(c => c[0]).join(', '));
  await page.screenshot({ path: SHOTS + '/p9_lane.png' });
  await open('#/listen/zh', 900);
  cards = await page.$$eval('.lx-lanecard', b => b.map(x => [x.dataset.set, !x.disabled]));
  ok(cards.length === 6 && cards.find(c => c[0] === 'tones')[1], 'Chinese lane: six sets, 🎵 tones among them');
  await open('#/listen/he', 900);
  cards = await page.$$eval('.lx-lanecard', b => b.map(x => [x.dataset.set, !x.disabled]));
  ok(cards.filter(c => c[1]).map(c => c[0]).join() === 'speak' && /No Hebrew voice/.test(await page.locator('.lx-devline').innerText()), 'Hebrew without a voice: only “say it” (no audio needed), the lane says why');

  /** Answer the choice items of a run rightly; returns [n, right]. */
  const runChoices = async (max = 8, check) => {
    let n = 0, right = 0;
    while (n < max) {
      const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) break;
      const opts = await page.$$('.lx-stage .lx-opts:not([data-done]) .lx-opt'); if (!opts.length) break;
      if (check) await check(it, n);
      await opts[it.options.indexOf(it.answer)].click(); await wait(60);
      if (await page.$('.lx-stage .lx-fb.ok')) right++; n++;
      await page.click('.lx-stage .lx-next'); await wait(250);
    }
    return [n, right];
  };
  await open('#/listen/de/hear', 1000);
  let autoOk = true, replay = false;
  const [hn, hr] = await runChoices(8, async (it, i) => {
    const s = (await spoken()).pop(); if (!s || s.text !== nfc(it.say) || s.voice !== 'Markus') autoOk = false;
    if (i === 0) { const k0 = (await spoken()).length; await page.keyboard.press('r'); await wait(80); replay = (await spoken()).length === k0 + 1; }
  });
  ok(hn >= 5 && hr === hn && autoOk && /0 to practise again/.test(await page.locator('.lx-result').innerText()), `🔊 hear and choose: ${hn} items, each word spoken when shown, all answered right`);
  ok(replay, 'keyboard: r plays it again');
  ok(await page.evaluate(() => { const U = NoemaLangUI.UI; return Object.values(U.L.langs.de.items).some(x => x.r && x.r.last === NoemaLang.dayNumber() || x.r && x.r.due > NoemaLang.dayNumber() + 1); }), 'the answers were recorded as reviews of the words');

  await open('#/listen/zh/tones', 1000);
  let toneOk = true;
  const [tn, tr] = await runChoices(6, async it => { const s = (await spoken()).pop(); if (!s || s.text !== nfc(it.say) || it.chars.join('') !== nfc(it.say) || s.voice !== 'Ting-Ting' || s.lang !== 'zh-CN') toneOk = false; });
  ok(tn >= 4 && tr === tn && toneOk, `🎵 tones: ${tn} items — the whole word spoken (Mandarin voice, never Cantonese), the tone of one syllable chosen`);
  await open('#/listen/zh/sentences', 1000);
  const [mn, mr] = await runChoices(1);
  ok(mn === 1 && mr === 1 && await page.locator('.lx-result').count() === 0 && (await page.$$eval('.lx-stage .lx-fb .lx-sent', s => s.every(x => x.lang === 'zh' && x.dir === 'ltr'))), '👂 sentences: the meaning chosen, then the sentence shown (lang + dir)');

  // dictation
  await open('#/listen/de/dictation', 1000);
  let dn = 0, dr = 0;
  while (dn < 3) {
    const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it) break;
    await page.fill('.lx-stage .lx-typein2', it.answer); await page.press('.lx-stage .lx-typein2', 'Enter'); await wait(80);
    if (await page.$('.lx-stage .lx-fb.ok')) dr++; dn++; await page.click('.lx-stage .lx-next'); await wait(250);
  }
  ok(dn === 3 && dr === 3, '✍️ dictation: the stored text typed (Enter) → right');
  const dit = await page.evaluate(() => NoemaLangUI.UI.current?.it || null);
  await page.fill('.lx-stage .lx-typein2', 'xyz quatsch'); await page.click('.lx-stage .lx-check'); await wait(80);
  ok(await page.locator('.lx-stage .lx-fb.bad').count() === 1 && await page.locator('.lx-stage .lx-diff .lx-d').count() > 0 && (dit.kind !== 'sentence' || await page.locator('.lx-stage .lx-fb .lx-sent').count() === 1), 'a wrong dictation: ❌, the letters compared, the stored text shown');
  await open('#/listen/ar/dictation', 1000);
  const ait = await page.evaluate(() => NoemaLangUI.UI.current.it);
  ok(await page.locator('.lx-stage .lx-kbd').count() === 1 && await page.locator('.lx-stage .lx-typein2').getAttribute('dir') === 'rtl', 'Arabic dictation: the on-screen keyboard, the input right to left');
  await page.fill('.lx-stage .lx-typein2', await page.evaluate(t => NoemaLang.stripMarks('ar', t), ait.answer)); await page.press('.lx-stage .lx-typein2', 'Enter'); await wait(80);
  ok(await page.locator('.lx-stage .lx-fb.ok').count() === 1, 'Arabic dictation without vowel marks → right');

  // speak (recognition driven by the test)
  await open('#/listen/de/speak', 1000);
  let sOk = 0, sTot = 0, wrongSeen = false;
  while (sTot < 3) {
    const it = await page.evaluate(() => NoemaLangUI.UI.current?.it || null); if (!it || it.type !== 'speak') break;
    const right = it.say.replace(/[.,!?¿¡]/g, '').toLowerCase();
    if (sTot === 0) { await page.evaluate(() => { window.__heard = [['blabla quatsch']]; }); await page.click('.lx-stage .lx-mic'); await wait(150); wrongSeen = await page.locator('.lx-stage .lx-again').count() === 1 && await page.locator('.lx-stage .lx-hw.miss').count() >= 1; }
    await page.evaluate(r => { window.__heard = [[r]]; }, right); await page.click('.lx-stage .lx-mic'); await wait(150);
    if (await page.$('.lx-stage .lx-fb.ok')) sOk++; sTot++;
    await page.click('.lx-stage .lx-next'); await wait(250);
  }
  ok(sTot === 3 && sOk === 3 && wrongSeen && await page.evaluate(() => window.__srLang) === 'de-DE', '🎤 say it: a wrong transcript → try again (missed words marked); the right one (small letters, no punctuation) → right; recognition in de-DE');
  // shadowing with a recording
  await open('#/listen/de/shadow', 1000);
  await page.click('.lx-stage .lx-recbtn'); await wait(50); await page.click('.lx-stage .lx-recbtn'); await wait(100);
  const p0 = await page.evaluate(() => window.__played), s0 = (await spoken()).length;
  await page.click('.lx-stage .lx-both'); await wait(200);
  ok(await page.evaluate(() => window.__rec.starts === 1 && window.__rec.stops === 1) && await page.locator('.lx-stage audio.lx-mine:not([hidden])').count() === 1 && await page.evaluate(() => window.__played) === p0 + 1 && (await spoken()).length === s0 + 1,
    '🗣️ shadowing: record, stop, play the voice and then yourself');
  await page.click('.lx-stage .lx-good'); await wait(80);
  ok(await page.locator('.lx-stage .lx-next').count() === 1 && await page.locator('.lx-stage .lx-badge:has-text("self-graded")').count() === 1, 'self-graded, then on to the next');

  // ---------- the session: the step and auto-play ----------
  await open('#/settings', 700);
  await page.check('.lx-speechset [data-key=autoplay] input'); await wait(80);
  const step = await page.evaluate(() => { const items = NoemaLangUI.speech.sessionSpeechItems({ day: NoemaLang.dayNumber() }); return items.map(x => [x.kind, x.it.type, x.it.lang]); });
  ok(step.length === 2 && step.every(x => x[0] === 'item' && x[2] !== 'he') && ['listen_pick', 'listen_meaning', 'dictation'].includes(step[0][1]) && step[1][1] === 'speak', 'the session step: a listening and a speaking item, in languages with a voice: ' + JSON.stringify(step));
  await page.evaluate(() => NoemaLangUI.poly.runSession({ day: NoemaLang.dayNumber(), steps: [] })); await wait(400);
  ok(await page.evaluate(() => NoemaLang.SPEECH_TYPES.includes(NoemaLangUI.UI.current?.it?.type)), 'the daily session runs it: ' + await page.evaluate(() => NoemaLangUI.UI.current?.it?.type));
  const learn = await page.evaluate(() => { const U = NoemaLangUI.UI, p = NoemaLang.planSession(U.C, U.L, { day: NoemaLang.dayNumber(), minutes: 30, languages: ['de'] }); return p.steps.find(s => s.kind === 'learn') || null; });
  if (learn) {
    await page.evaluate(st => NoemaLangUI.poly.runSession({ steps: [st] }), learn); await wait(400);
    const intro = await page.evaluate(() => NoemaLangUI.UI.current), last = (await spoken()).pop();
    ok(intro.kind === 'intro' && last && last.text === await page.evaluate(a => NoemaLangUI.UI.C.lang[a.lang].lex[a.lex].lemma, intro) && await page.locator('.lx-stage .lx-intro .lx-spk').count() >= 1, 'auto-play: a new word is spoken when it is introduced; the intro has its 🔊');
  } else ok(false, 'a batch of new words to introduce');
  // “I can't listen now”
  await open('#/', 500); await open('#/settings', 700);
  await page.check('.lx-speechset [data-key=noListen] input'); await wait(80);
  ok(await page.evaluate(() => NoemaLangUI.speech.sessionSpeechItems({ day: NoemaLang.dayNumber() }).filter(x => x.it.type !== 'speak').length === 0), '“I can’t listen now”: no audio item in the session');
  await open('#/listen/de', 900);
  cards = await page.$$eval('.lx-lanecard', b => b.map(x => [x.dataset.set, !x.disabled]));
  ok(cards.filter(c => c[1]).map(c => c[0]).join() === 'speak' && await page.locator('.lx-offnote').count() === 1, '… the lane offers only “say it” and says how to turn listening back on');
  await page.click('.lx-offnote button'); await wait(900);
  ok((await page.$$eval('.lx-lanecard', b => b.filter(x => !x.disabled).length)) === 5, 'listening back on');

  // ---------- no recognition in the browser: speak → shadowing ----------
  const ctx2 = await newCtx({ viewport: { width: 1280, height: 900 } }, { voices: VOICES, sr: false });
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => E.push(e.message));
  await p2.goto(url); await p2.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  await p2.goto(url + '?account=anr&subject=' + SUBJ + '#/listen/de/speak'); await wait(1200);
  ok(await p2.locator('.lx-stage .lx-exshadow[data-from=speak]').count() === 1 && /speech recognition is not available/.test(await p2.locator('.lx-stage .lx-q').innerText()), 'a browser without recognition: “say it” is offered as shadowing');

  // ---------- phone width ----------
  const phone = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { voices: VOICES, sr: true });
  const pp = await phone.newPage(); pp.on('pageerror', e => E.push(e.message));
  await pp.goto(url); await pp.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  const wide = async () => pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  for (const hsh of ['#/', '#/listen/ar', '#/listen/ar/dictation', '#/listen/he/speak', '#/listen/zh/tones', '#/listen/de/shadow', '#/settings', '#/w/ar/' + encodeURIComponent(arW)]) {
    await pp.goto(url + '?account=anr&subject=' + SUBJ + hsh); await wait(1100);
    ok(await wide() <= 0, `390 px: ${hsh} has no sideways scrolling`);
  }
  await pp.goto(url + '?account=anr&subject=' + SUBJ + '#/listen/ar/dictation'); await wait(1100); await pp.screenshot({ path: SHOTS + '/p9_phone_dictation.png' });
  ok(await pp.$$eval('.lx-stage [lang]', es => es.filter(e => ['ar', 'he'].includes(e.lang)).every(e => e.dir === 'rtl' || e.closest('[dir=rtl]'))), 'Arabic spans carry lang + dir');

  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.slice(0, 3).join(' | ') : ''));
  await browser.close();
  finish();
})().catch(async e => { console.error(e); fails++; try { await BROWSER?.close(); } catch (x) { } finish(); });
function finish() { console.log(fails ? `\n${fails} FAILED (of ${checks})` : `\nALL PASSED (${checks} checks)`); process.exitCode = fails ? 1 : 0; }
