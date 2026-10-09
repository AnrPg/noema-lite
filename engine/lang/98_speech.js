/* ---------- P9 — Listening and speaking (docs/LANGUAGES.md §3.9, §6.8, §7.5, §8) ----------
   The browser's own speech services only — no server, no key: speechSynthesis (a voice per course language, the stored text sent
   as written, normal or slow), MediaRecorder for shadowing (kept in memory, never stored or sent), SpeechRecognition where the
   browser has it (its transcript compared with the stored forms by langcore.checkSpoken — never by an AI). A 🔊 after every word
   card head, example and bank sentence shown (outside exercises; inside them only the intro and the feedback), the widgets of the
   six types, the 🎧 lane (#/listen/<lang>), the settings, auto-play of new words, the session step. */
const SP = { voices: [], warned: {}, capsSet: false, reading: null };
/* a button with no text of its own (the 🔊 / 🔇 is CSS), so it never changes the text of a sentence or a card */
const srCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
const synthOK = () => { try { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); } catch (e) { return false; } };
const recordOK = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const spPrefs = () => UI.prefs.speech || {};
const spToday = key => spPrefs()[key] === today();
function setSp(patch) { UI.prefs.speech = { ...spPrefs(), ...patch }; save(); pushCaps(); }
const tagOf = c => UI.C?.lang[c] ? N.speechTag(UI.C, c) : (N.SPEECH_TAGS[c] || c);
const voiceOf = c => N.pickVoice(SP.voices, tagOf(c), (spPrefs().voice || {})[c]);
const hasVoice = c => !!voiceOf(c);
const langLabel = c => UI.C?.lang[c] ? info(c).name : langName(c);
/** What this device can do, for langcore (no voice / “can't listen now” → no audio items; no recognition → speak as shadowing). */
function speechCaps() {
  return { listen: Object.fromEntries(UI.C.languages.map(c => [c, hasVoice(c)])), recognize: !!srCtor(), record: recordOK(), noListen: spToday('noListen'), noSpeak: spToday('noSpeak') };
}
function pushCaps() { if (!UI.C) return null; SP.capsSet = true; return N.setSpeechCaps(speechCaps()); }
function refreshVoices() {
  try { SP.voices = synthOK() ? (speechSynthesis.getVoices() || []).slice() : []; } catch (e) { SP.voices = []; }
  pushCaps();
}
/** The device's voices; some browsers fill the list only after 'voiceschanged'. */
function loadVoices(ms = 1200) {
  refreshVoices();
  if (SP.voices.length || !synthOK()) return Promise.resolve(SP.voices);
  return new Promise(res => {
    let over = false; const end = () => { if (over) return; over = true; refreshVoices(); res(SP.voices); };
    try { speechSynthesis.addEventListener('voiceschanged', end, { once: true }); } catch (e) { }
    setTimeout(end, ms);
  });
}
if (synthOK()) { try { speechSynthesis.addEventListener('voiceschanged', () => { refreshVoices(); const s = document.querySelector('.lx-speechset'); if (s && !s.contains(document.activeElement)) s.replaceWith(speechSettings()); }); speechSynthesis.getVoices(); } catch (e) { } }

/** No voice for a language: said once (a notice, not an error); the buttons of that language show 🔇. */
function noVoice(c) {
  for (const b of document.querySelectorAll(`.lx-spk[data-lang="${c}"]`)) { b.title = `No ${langLabel(c)} voice on this device`; b.classList.add('lx-mute'); }
  if (SP.warned[c]) return; SP.warned[c] = true;
  toast(`🔇 No ${langLabel(c)} voice on this device — add one in the system's speech settings, then reload.`);
}
/** Speak a stored text in language c → Promise<boolean> (false: no voice / no speech synthesis). */
async function say(c, text, { slow = false } = {}) {
  if (!synthOK() || !text) { noVoice(c); return false; }
  if (!SP.voices.length) await loadVoices();
  const v = voiceOf(c); if (!v) { noVoice(c); return false; }
  try { speechSynthesis.cancel(); } catch (e) { }
  const u = new SpeechSynthesisUtterance(UI.C?.lang[c] ? N.speechText(UI.C, c, text) : String(text));
  u.lang = tagOf(c); u.voice = v; u.rate = slow || spPrefs().rate === 'slow' ? N.SPEECH_RATE.slow : N.SPEECH_RATE.normal;
  return new Promise(res => {
    let over = false; const end = ok => { if (!over) { over = true; res(ok); } };
    u.onend = () => end(true); u.onerror = () => end(false);
    try { speechSynthesis.speak(u); } catch (e) { end(false); }
    setTimeout(() => end(true), 2500 + String(text).length * 180);   // some engines never fire 'end'
  });
}
function speakerBtn(c, text) {
  return h('button', { type: 'button', class: 'lx-spk', 'data-lang': c, 'aria-label': `Listen (${langLabel(c)})`, title: `Listen (${langLabel(c)})`,
    onclick: e => { e.stopPropagation(); e.preventDefault(); say(c, text); } });   // the icon comes from the CSS (::before): the text of what it follows stays the same
}

/* ---------- 🔊 everywhere: the texts get data-say (the stored text, not the faded display); a watcher adds the buttons ---------- */
{
  const w0 = word; word = (code, text, o = {}) => { const e = w0(code, text, o); if (e && text != null && e.dataset) { e.dataset.say = N.nfc(String(text)); e.dataset.sayl = code; } return e; };
  const s0 = sentenceView; sentenceView = (c, s, unknown = []) => { const e = s0(c, s, unknown); if (e?.dataset && s?.text) { e.dataset.say = s.text; e.dataset.sayl = c; } return e; };
  const i0 = wordsIn; wordsIn = (c, s) => { const out = i0(c, s); for (const x of out) if (x && x.dataset) x.dataset.inline = '1'; return out; };   // runs inside prose: no button (but examples are spoken)
}
const SPK_SKIP = 'button, .lx-opts, .lx-opt, select, option, label, .lx-tile, .lx-tile1, .lx-slot, .lx-tiles, .lx-kbd, .lx-cands, .lx-tutor, [data-nospeak], .lx-hidecol, .lx-input, header, .lx-tmsg, .lx-diff, .lx-roman';
const SPK_IN_STAGE = '.lx-fb, .lx-ref, .lx-intro, .lx-readtext, .lx-gram, .lx-typology, .lx-overview';   // inside an exercise: never on a prompt it would give away
function decorate(root) {
  if (!UI.C) return;
  if (!SP.capsSet) pushCaps();
  for (const el of root.querySelectorAll('[data-say]:not([data-spk]), .lx-ow:not([data-spk])')) {
    el.dataset.spk = '1';
    if (el.closest(SPK_SKIP) || el.parentElement?.closest('[data-say]')) continue;
    if (el.dataset.inline && !el.parentElement?.closest('.lx-extext')) continue;
    if (el.closest('.lx-stage') && !el.closest(SPK_IN_STAGE)) continue;
    const l = el.dataset.sayl || el.getAttribute('lang') || ''; if (!l || /-latn/i.test(l)) continue;
    const c = UI.C.lang[l] ? l : l.split('-')[0]; if (!UI.C.lang[c] && !N.SPEECH_TAGS[c]) continue;
    const text = el.dataset.say || el.textContent; if (!text || !text.trim()) continue;
    el.after(speakerBtn(c, text));
  }
}
{
  let pending = false;
  new MutationObserver(() => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; try { decorate(document.body || document.documentElement); } catch (e) { console.warn(e); } }); })
    .observe(document.documentElement, { childList: true, subtree: true });
}
/** r replays the audio of a listening exercise (not while typing). */
document.addEventListener('keydown', e => {
  if (e.key !== 'r' || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
  const b = document.querySelector('.lx-stage .lx-play'); if (b) { e.preventDefault(); b.click(); }
});

/* ---------- the parts of the widgets ---------- */
const spRecord = (it, ok) => { try { N.speechRecord(UI.C, UI.L, it, ok, today()); save(); } catch (e) { console.warn(e); } };
const spSentence = it => it.sentence ? LX(it.lang).sentenceById[it.sentence] : null;
/** The stored word or sentence of an item, shown (lang + dir, 🆕 marked). */
function spText(it) {
  const c = it.lang, X = LX(c);
  if (it.sentence) return sentenceView(c, spSentence(it), it.unknown || []);
  return word(c, X.lex[it.lex].lemma, { lex: X.lex[it.lex] });
}
function newLine(it) {
  const c = it.lang; noteNew(c, it.unknown);
  if (!(it.unknown || []).length) return null;
  return h('div', { class: 'tiny lx-newwords' }, '🆕 ', ...it.unknown.flatMap((l, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, LX(c).lex[l].lemma), ' = ' + gloss(c, l)]));
}
/** ▶ the audio of an item (played once when shown), 🐢 slowly; without a voice the text can be shown instead. */
function player(it, { auto = true, reveal = true } = {}) {
  const c = it.lang, box = h('div', { class: 'row lx-player' });
  const play = h('button', { type: 'button', class: 'btn primary lx-play', 'aria-label': `Play (${info(c).name})`, onclick: () => say(c, it.say) }, '🔊 Play');
  const slow = h('button', { type: 'button', class: 'btn ghost small lx-slow', 'aria-label': 'Play slowly', onclick: () => say(c, it.say, { slow: true }) }, '🐢 Slowly');
  box.append(play, slow, h('span', { class: 'tiny lx-keyhint' }, 'r = again'));
  if (!hasVoice(c)) {
    box.append(h('span', { class: 'tiny lx-novoice' }, `🔇 No ${info(c).name} voice on this device. `));
    if (reveal) box.append(h('button', { type: 'button', class: 'btn ghost small lx-revealtxt', onclick: e => e.currentTarget.replaceWith(h('span', { class: 'lx-revealed' }, spText(it))) }, '👁 Read it instead'));
  } else if (auto) setTimeout(() => { if (box.isConnected) say(c, it.say); }, 150);
  return box;
}
const fbBoxSp = (ok, ...kids) => h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', ...kids);
const TONE_OPTS = { 1: '1st  ā  ˉ', 2: '2nd  á  ˊ', 3: '3rd  ǎ  ˇ', 4: '4th  à  ˋ', 5: 'neutral  a  ·' };

/* ---------- widgets (§6.8) ---------- */
WIDGETS.listen_pick = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-exlisten', 'data-kind': it.kind, 'data-type': it.type });
  const opts = it.options.map(o => ({ label: it.kind === 'hear_word' ? word(c, o, { sub: false }) : h('span', {}, o), ok: o === it.answer }));
  box.append(h('div', { class: 'lx-q' }, it.ask), player(it),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); spRecord(it, !!o.ok); feedback(box, !!o.ok, c, it.lex); done(!!o.ok); }));
  return box;
};
WIDGETS.listen_tone = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-exlisten lx-extone', 'data-kind': 'tone', 'data-type': it.type });
  const chars = h('div', { class: 'lx-prompt lx-tonechars', lang: c, dir: 'ltr' }, ...it.chars.map((ch, i) => h('span', { class: i === it.at ? 'lx-tonehit' : 'lx-toneoff' }, ch)));
  const opts = it.options.map(o => ({ label: h('span', { lang: 'zh-Latn-pinyin' }, TONE_OPTS[o] || o), ok: o === it.answer }));
  box.append(h('div', { class: 'lx-q' }, it.ask), chars, h('div', { class: 'tiny' }, it.gloss), player(it, { reveal: false }),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); spRecord(it, !!o.ok);
      box.append(fbBoxSp(!!o.ok, word(c, LX(c).lex[it.lex].lemma, { lex: LX(c).lex[it.lex] }), h('div', { class: 'tiny' }, wordsIn(c, it.why)))); done(!!o.ok); }));
  return box;
};
WIDGETS.dictation = (it, done) => {
  const c = it.lang, X = LX(c), box = h('div', { class: 'lx-ex lx-exdict', 'data-kind': it.kind, 'data-type': it.type });
  const out = h('div', { class: 'lx-diff', lang: c, dir: X.language.dir || 'ltr' }); let over = false;
  const finish = (ok, r) => {
    if (over) return; over = true; si.input.disabled = true; spRecord(it, ok);
    if (r && !ok && r.diff?.length) out.append(...r.diff.map(d => h('span', { class: 'lx-d d-' + d.op, title: d.op === 'wrong' ? `you: ${d.t} · right: ${d.want}` : d.op }, d.op === 'wrong' ? d.want : d.t)));
    box.append(fbBoxSp(ok, spText(it), ' — ', it.kind === 'word' ? gloss(c, it.lex) : (it.gloss || ''),
      r?.notes?.length ? h('ul', { class: 'lx-list tiny' }, ...r.notes.map(n => h('li', {}, n))) : null, ok && r?.how === 'variant' ? h('div', { class: 'tiny' }, 'Right — the course writes it like this.') : null));
    done(ok);
  };
  const check = v => { if (over || !String(v || '').trim()) return; const r = N.checkDictation(UI.C, c, it, v); finish(r.ok, r); };
  const si = scriptInput(c, { placeholder: 'Type what you hear…', autofocus: true, onEnter: check });
  box.append(h('div', { class: 'lx-q' }, it.kind === 'word' ? '✍️ Listen and write the word' : '✍️ Listen and write the sentence'),
    it.hint ? h('div', { class: 'tiny lx-hint' }, 'Meaning: ', it.hint) : null, newLine(it), player(it, { reveal: false }), si.el, out,
    h('div', { class: 'row' }, h('button', { class: 'btn primary small lx-check', onclick: () => check(si.input.value) }, 'Check'),
      h('button', { class: 'btn ghost small', onclick: () => finish(false, null) }, 'Show me')));
  return box;
};
WIDGETS.listen_meaning = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-exlisten', 'data-kind': it.kind, 'data-type': it.type });
  noteNew(c, it.unknown);
  const opts = it.options.map(o => ({ label: h('span', {}, o), ok: o === it.answer }));
  box.append(h('div', { class: 'lx-q' }, it.ask), player(it),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); spRecord(it, !!o.ok);
      box.append(fbBoxSp(!!o.ok, spText(it), h('div', { class: 'tiny' }, it.answer), newLine(it))); done(!!o.ok); }));
  return box;
};
/** A recorder in memory (getUserMedia + MediaRecorder): record → stop → play yourself, or the voice and then you. */
function recorderView(it) {
  const box = h('div', { class: 'lx-rec row' });
  if (!recordOK()) { box.append(h('span', { class: 'tiny lx-norec' }, '🎙️ Recording is not available in this browser: say it aloud after the voice, then judge yourself.')); return box; }
  let rec = null, stream = null, url = null, chunks = [];
  const audio = h('audio', { class: 'lx-mine', controls: true, hidden: true, 'aria-label': 'Your recording' });
  const both = h('button', { type: 'button', class: 'btn small lx-both', hidden: true, onclick: async () => { await say(it.lang, it.say); try { audio.currentTime = 0; await audio.play(); } catch (e) { } } }, '▶ The voice, then you');
  const btn = h('button', { type: 'button', class: 'btn small lx-recbtn', onclick: async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        try { (stream.getTracks?.() || []).forEach(t => t.stop()); } catch (e) { }
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })); audio.src = url; audio.hidden = false; both.hidden = false;
        btn.textContent = '🎙️ Record again'; btn.classList.remove('on'); box.dataset.recorded = '1';
      };
      rec.start(); btn.textContent = '⏹ Stop'; btn.classList.add('on');
    } catch (e) { box.append(h('span', { class: 'tiny lx-norec' }, '🎙️ The microphone is not available (' + (e.name || e.message || e) + '): say it aloud and judge yourself.')); btn.disabled = true; }
  } }, '🎙️ Record yourself');
  box.append(btn, audio, both);
  return box;
}
WIDGETS.shadowing = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-exshadow', 'data-kind': it.kind, 'data-type': 'shadowing', ...(it.from ? { 'data-from': it.from } : {}) });
  const grade = h('div', { class: 'row lx-selfgrade' }, h('span', { class: 'lx-badge reg' }, '🙋 self-graded'),
    h('button', { class: 'btn small lx-good', onclick: () => fin(true) }, '✓ Close to the voice'), h('button', { class: 'btn ghost small lx-notyet', onclick: () => fin(false) }, '✗ Not yet'));
  let over = false; const fin = ok => { if (over) return; over = true; [...grade.querySelectorAll('button')].forEach(b => b.disabled = true); spRecord(it, ok); done(ok); };
  box.append(h('div', { class: 'lx-q' }, it.from === 'speak' ? '🗣️ Say it after the voice (speech recognition is not available here, so you judge yourself)' : '🗣️ Listen, then say it after the voice'),
    h('div', { class: 'lx-prompt' }, spText(it)), h('div', { class: 'tiny' }, it.gloss || ''), newLine(it), player(it, { reveal: false }), recorderView(it), grade);
  return box;
};
/** Listen once with the browser's recognizer → Promise<[alternatives]> (rejects with the recognizer's error code). */
function hearOnce(c) {
  return new Promise((res, rej) => {
    const R = srCtor(); if (!R) return rej(new Error('no-recognition'));
    const rec = new R(); let got = null;
    rec.lang = tagOf(c); rec.interimResults = false; rec.maxAlternatives = 5; rec.continuous = false;
    rec.onresult = e => { const r = e.results[e.results.length - 1] || e.results[0]; got = []; for (let i = 0; i < (r?.length || 0); i++) got.push(r[i].transcript); };
    rec.onerror = e => rej(new Error(e.error || 'error'));
    rec.onend = () => res(got || []);
    try { rec.start(); } catch (e) { rej(e); }
  });
}
WIDGETS.speak = (it, done) => {
  if (!srCtor()) return WIDGETS.shadowing({ ...it, type: 'shadowing', from: 'speak' }, done);
  const c = it.lang, X = LX(c), box = h('div', { class: 'lx-ex lx-exspeak', 'data-kind': it.kind, 'data-type': 'speak', 'data-mode': it.mode });
  const s = spSentence(it), lx = it.lex ? X.lex[it.lex] : null;
  const out = h('div', { class: 'lx-heardbox' }); let tries = 0, over = false;
  const mic = h('button', { type: 'button', class: 'btn primary lx-mic', onclick: () => listen() }, '🎤 Speak');
  const give = h('button', { type: 'button', class: 'btn ghost small lx-giveup', onclick: () => end(false) }, 'Show me');
  const end = ok => { if (over) return; over = true; mic.disabled = true; give.disabled = true; spRecord(it, ok);
    box.append(fbBoxSp(ok, spText(it), ' — ', it.gloss || '', h('div', { class: 'tiny' }, 'Checked against the course’s words (what your browser heard)'))); done(ok); };
  const heardView = r => {
    const tokens = s ? (s.tokens || []).filter(k => !k.p) : [{ t: lx.lemma }];
    return h('div', { class: 'lx-heard' }, h('span', { class: 'tiny' }, 'Heard: '), h('span', { class: 'lx-w', lang: c, dir: X.language.dir || 'ltr' }, '“' + (r.heard || '…') + '”'),
      h('div', { class: 'lx-heardwords', lang: c, dir: X.language.dir || 'ltr' }, ...tokens.map((k, i) => h('span', { class: 'lx-hw ' + (r.matched[i] ? 'ok' : 'miss') }, k.t))));
  };
  const listen = async () => {
    if (over) return; mic.disabled = true; mic.textContent = '… listening'; out.innerHTML = '';
    try {
      const alts = await hearOnce(c); mic.textContent = '🎤 Speak'; mic.disabled = false;
      if (!alts.length) { out.append(h('div', { class: 'tiny lx-nothing' }, 'Nothing heard — try again.')); return; }
      const r = N.checkSpoken(UI.C, c, it, alts); tries++;
      out.append(heardView(r));
      if (r.ok) return end(true);
      if (tries >= 3) return end(false);
      out.append(h('div', { class: 'tiny lx-again' }, `❌ Not quite — try again (${3 - tries} left).`));
    } catch (e) {
      mic.textContent = '🎤 Speak'; mic.disabled = false;
      if (/not-allowed|service-not-allowed|no-recognition|audio-capture/.test(e.message)) { box.replaceWith(WIDGETS.shadowing({ ...it, type: 'shadowing', from: 'speak' }, done)); return; }
      out.append(h('div', { class: 'tiny lx-nothing' }, e.message === 'no-speech' ? 'Nothing heard — try again.' : '⚠️ ' + e.message));
    }
  };
  box.append(h('div', { class: 'lx-q' }, it.mode === 'produce' ? `🎤 Say it in ${info(c).name}` : '🎤 Say it aloud'),
    it.mode === 'produce' ? h('div', { class: 'lx-prompt lx-meaning' }, lx?.senses?.[0] ? conceptPic(lx.senses[0], 'lx-exemoji') : '', ' ', it.gloss)
      : h('div', {}, h('div', { class: 'lx-prompt' }, spText(it)), h('div', { class: 'tiny' }, it.gloss || '')),
    newLine(it), it.mode !== 'produce' && hasVoice(c) ? player(it, { auto: false, reveal: false }) : null,
    h('div', { class: 'row' }, mic, give), out,
    h('div', { class: 'tiny lx-srnote' }, 'Your browser turns your voice into text (it may use its own online service); the course compares that text with its stored words.'));
  return box;
};

/* ---------- auto-play of a new word (setting), the reader's ▶ the whole text ---------- */
{
  const i0 = exIntro;
  exIntro = (c, lid, done) => { const box = i0(c, lid, done); if (spPrefs().autoplay && !spToday('noListen')) setTimeout(() => { if (box.isConnected && hasVoice(c)) say(c, LX(c).lex[lid].lemma); }, 150); return box; };
}
async function readAloud(btn, c) {
  if (SP.reading) { SP.reading.stop = true; try { speechSynthesis.cancel(); } catch (e) { } SP.reading = null; btn.textContent = '🔊 Listen to the whole text'; return; }
  const job = SP.reading = { stop: false }; btn.textContent = '⏹ Stop';
  for (const el of document.querySelectorAll('.lx-reader .lx-rsent > [data-say]')) {
    if (job.stop || !btn.isConnected) break;
    el.classList.add('lx-reading'); const ok = await say(c, el.dataset.say); el.classList.remove('lx-reading');
    if (!ok) break;
  }
  if (SP.reading === job) { SP.reading = null; btn.textContent = '🔊 Listen to the whole text'; }
}

/* ---------- 🎧 the lane ---------- */
const LISTEN_SETS = [
  { id: 'hear', type: 'listen_pick', icon: '🔊', title: 'Hear and choose', what: 'a word → which one it is, or what it means' },
  { id: 'sentences', type: 'listen_meaning', icon: '👂', title: 'Sentences', what: 'a sentence → what it means' },
  { id: 'dictation', type: 'dictation', icon: '✍️', title: 'Dictation', what: 'a word or a sentence → write it' },
  { id: 'shadow', type: 'shadowing', icon: '🗣️', title: 'Shadowing', what: 'say it after the voice, record yourself, compare' },
  { id: 'speak', type: 'speak', icon: '🎤', title: 'Say it', what: 'say a word or a sentence — checked against the course' },
  { id: 'tones', type: 'listen_tone', icon: '🎵', title: 'Tones by ear', what: 'one syllable of a word → its tone', only: c => c === 'zh' || LX(c).language.romanization === 'pinyin' }];
const listenMake = (c, set, k) => N.speechItems(UI.C, UI.L, c, set.type, { k, max: 8, caps: pushCaps() });
VIEWS.listen = (v, r) => {
  const c = UI.C.lang[r.arg] ? r.arg : UI.lang;
  const wait = h('p', { class: 'tiny lx-loading' }, '… looking for voices on this device');
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '🎧 Listening & speaking', h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/listen/' + x); })), wait);
  loadVoices().then(() => {
    if (route().name !== 'listen' || !wait.isConnected) return;
    wait.remove();
    const k = N.known(UI.C, UI.L, c);
    if (r.arg2) { const set = LISTEN_SETS.find(s => s.id === r.arg2); if (set) return runProd(listenMake(c, set, k), { title: `${set.icon} ${set.title} · ${info(c).flag} ${info(c).name}`, back: '#/listen/' + c, lang: c }); }
    const v0 = voiceOf(c);
    v.append(h('div', { class: 'lx-callout k-key lx-devline' },
      h('div', {}, v0 ? `🔊 Voice: ${v0.name} (${v0.lang})` : `🔇 No ${info(c).name} voice on this device — listening needs one (add it in the system's speech settings).`),
      h('div', {}, srCtor() ? '🎤 Speech recognition: yes (your browser may use its own online service)' : '🎤 No speech recognition in this browser — “Say it” becomes shadowing.'),
      h('div', {}, recordOK() ? '🎙️ Recording: yes (kept on this page only)' : '🎙️ No recording here — shadowing without it.')),
      spToday('noListen') ? h('p', { class: 'lx-note lx-offnote' }, '🙉 You chose “I can’t listen now” for today. ', h('button', { class: 'btn small', onclick: () => { setSp({ noListen: null }); render(); } }, 'I can listen again')) : null,
      spToday('noSpeak') ? h('p', { class: 'lx-note lx-offnote' }, '🤐 You chose “I can’t speak now” for today. ', h('button', { class: 'btn small', onclick: () => { setSp({ noSpeak: null }); render(); } }, 'I can speak again')) : null);
    const grid = h('div', { class: 'lx-lanegrid' });
    for (const set of LISTEN_SETS) {
      if (set.only && !set.only(c)) continue;
      const n = listenMake(c, set, k).length;
      grid.append(h('button', { class: 'lx-lanecard', 'data-set': set.id, disabled: n ? null : true, onclick: () => go(`#/listen/${c}/${set.id}`) },
        h('span', { class: 'lx-laneicon' }, set.icon), h('b', {}, set.title), h('span', { class: 'tiny' }, set.what), h('span', { class: 'tiny lx-lanen' }, n ? `${n} ready` : !v0 && set.type !== 'speak' ? 'needs a voice' : 'learn more words first')));
    }
    v.append(grid, h('p', { class: 'tiny' }, '⚙️ Voice, speed, auto-play and “I can’t listen / speak now”: ', h('button', { class: 'btn ghost small', onclick: () => go('#/settings') }, 'Settings')));
  });
};
function speechLanes() {
  return h('div', { class: 'lx-speechlanes' }, h('h2', { class: 'lx-h2' }, '🎧 Listening · 🗣️ Speaking'),
    h('div', { class: 'lx-lanes' }, ...activeLangs().map(c => h('div', { class: 'lx-lanerow', 'data-lang': c },
      h('span', { class: 'lx-flag' }, info(c).flag), h('b', {}, info(c).name),
      h('button', { class: 'btn small lx-tolisten', onclick: () => go('#/listen/' + c) }, '🎧 Listening & speaking')))));
}
/** ⚙️ Settings → 🎧: a voice per language, the speed, auto-play, “I can't listen / speak now” (today). */
function speechSettings() {
  const sp = spPrefs(), box = h('div', { class: 'lx-speechset' }, h('h3', { class: 'lx-h3' }, '🎧 Listening & speaking'));
  if (!synthOK()) box.append(h('p', { class: 'tiny' }, '🔇 This browser has no speech synthesis.'));
  for (const c of UI.C.languages) {
    const vs = N.voicesFor(SP.voices, tagOf(c)), cur = (sp.voice || {})[c] || '';
    box.append(h('label', { class: 'lx-setrow' }, info(c).flag, ' ', info(c).name, ' — voice: ',
      vs.length ? h('select', { 'data-lang': c, class: 'lx-voicesel', 'aria-label': `Voice for ${info(c).name}`, onchange: e => setSp({ voice: { ...(spPrefs().voice || {}), [c]: e.target.value || undefined } }) },
        h('option', { value: '' }, 'automatic' + (vs[0] ? ` (${vs[0].name})` : '')), ...vs.map(v => h('option', { value: v.name, selected: v.name === cur ? true : null }, `${v.name} · ${v.lang}`)))
        : h('span', { class: 'tiny lx-novoice' }, `🔇 none on this device (${tagOf(c)})`)));
  }
  const chk = (key, label, val, set) => h('label', { class: 'lx-check', 'data-key': key }, h('input', { type: 'checkbox', checked: val ? true : null, onchange: e => set(e.target.checked) }), ' ', label);
  box.append(h('label', { class: 'lx-setrow' }, 'Speed: ', h('select', { class: 'lx-ratesel', 'aria-label': 'Speed of the voice', onchange: e => setSp({ rate: e.target.value }) },
      ...[['normal', 'normal'], ['slow', 'slow']].map(([x, t]) => h('option', { value: x, selected: (sp.rate || 'normal') === x ? true : null }, t)))),
    chk('autoplay', 'Play new words aloud in the session', sp.autoplay, x => setSp({ autoplay: x })),
    chk('noListen', 'I can’t listen now (no audio items today)', spToday('noListen'), x => setSp({ noListen: x ? today() : null })),
    chk('noSpeak', 'I can’t speak now (no speaking items today)', spToday('noSpeak'), x => setSp({ noSpeak: x ? today() : null })),
    h('p', { class: 'tiny' }, srCtor() ? '🎤 Speech recognition is available in this browser (it may send what you say to its own service); the course compares the text with its stored words.' : '🎤 No speech recognition in this browser: speaking items become shadowing.',
      ' ', recordOK() ? '🎙️ Recordings stay on the page and are never stored.' : ''));
  return box;
}
/** The session's step (§7.5 step 6): up to two items, in today's languages that have a voice. */
function sessionSpeechItems(plan) {
  pushCaps();
  try { return N.speechPlan(UI.C, UI.L, { day: plan.day, languages: todayLangs(), n: 2 }).map(it => ({ kind: 'item', it, lang: it.lang })); } catch (e) { console.warn(e); return []; }
}
{
  const home = VIEWS.home;
  VIEWS.home = (v, r) => { home(v, r); const after = v.querySelector('.lx-prodlanes'), lanes = speechLanes(); if (after) after.after(lanes); else { const map = [...v.querySelectorAll('h2')].find(x => /The map/.test(x.textContent)); map ? map.before(lanes) : v.append(lanes); } };
  const settings = VIEWS.settings;
  VIEWS.settings = (v, r) => { settings(v, r); const tail = [...v.children].reverse().find(x => x.tagName === 'P'); const s = speechSettings(); tail ? tail.before(s) : v.append(s); loadVoices().then(() => { const o = v.querySelector('.lx-speechset'); if (o && !o.contains(document.activeElement)) o.replaceWith(speechSettings()); }); };
  const read = VIEWS.read;
  VIEWS.read = (v, r) => { read(v, r); if (!r.arg2) return; const c = UI.C.lang[r.arg] ? r.arg : UI.lang, reader = v.querySelector('.lx-reader'); if (reader) reader.before(h('div', { class: 'row lx-readaloud' }, h('button', { class: 'btn small lx-readall', onclick: e => readAloud(e.currentTarget, c) }, '🔊 Listen to the whole text'))); };
}
Object.assign(window.NoemaLangUI || {}, { speech: { say, loadVoices, speechCaps, pushCaps, sessionSpeechItems, LISTEN_SETS, SP, decorate } });
