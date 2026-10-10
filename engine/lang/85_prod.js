/* ---------- P7 — production and reading (docs/LANGUAGES.md §6.5, §8 Tutor) ----------
   ✍️ Writing lane: translate (tiles → typed; the stored sentence, its alts and every spelling the form index reads as the same
   words are accepted — anything else goes to the AI, labelled "AI-judged"), rewrite / expand, guided writing with a rubric,
   numbers / clock / date, register and dialogue turns. 📖 Reading lane: graded texts from the bank, tap-to-gloss, questions
   from the stored glosses; a new text by the AI only after the tokenizer accepted every sentence. 🎓 The tutor in a language.
   Every AI call uses the learner's own key on this device (NoemaLLM); its text is tokenized and checked against the form index. */

/* ---------- the AI: availability, the key, the label ---------- */
const aiVendor = () => { try { return window.NoemaLLM?.pick?.(UI.acc) || null; } catch (e) { return null; } };
const chatLangOf = () => UI.prefs.chatLang || UI.C.explainLang;
const aiBadge = (txt = '🤖 AI-judged') => h('span', { class: 'lx-badge lx-ai', title: 'Judged by an AI model with your own key — the course’s stored answers stay the reference' }, txt);
/** How to add a key — shown wherever an AI button cannot work yet. The Gemini key is stored on this device only. */
function keyHelp(onSaved) {
  const inp = h('input', { class: 'noema-input lx-keyin', type: 'password', placeholder: 'Gemini API key (AIza…)', autocomplete: 'off', 'aria-label': 'Gemini API key' });
  const box = h('div', { class: 'lx-callout k-tip lx-keyhelp' },
    h('b', {}, '🔑 The AI needs your own key. '),
    'Get a free Gemini key at ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey'),
    ' and paste it here — it stays on this device only (never synced, never in a backup). A Claude API key works too: add it in the app’s ⚙️ Settings → Claude of any subject.',
    h('div', { class: 'row' }, inp, h('button', { class: 'btn small primary', onclick: () => {
      const v = inp.value.trim(); if (!v) return inp.focus();
      try { window.Noema?.geminiKey ? Noema.geminiKey.set(UI.acc, v) : localStorage.setItem('noema-device:geminiKey:' + UI.acc, v); } catch (e) { }
      box.replaceWith(h('div', { class: 'tiny lx-keyok' }, '✅ Key saved on this device.')); onSaved?.();
    } }, 'Save the key')));
  return box;
}
async function aiJSON(t, extra = {}) {
  return NoemaLLM.json({ acc: UI.acc, system: t.system, prompt: t.prompt, schema: t.schema, name: t.name, validate: t.validate, repairs: extra.repairs ?? 1, maxTokens: 8000 });
}
/** Text checked against the form index (§7.2): course words open their card (🆕 when not learned yet); words not in the course are marked. */
function checkedText(c, text, r) {
  const X = LX(c); r = r || N.checkText(UI.C, c, text, N.known(UI.C, UI.L, c).R);
  const parts = [], sp = X.language.tokenJoin !== 'none'; let wi = 0;
  for (const k of r.tokens) {
    if (k.p) { parts.push({ t: k.t, el: document.createTextNode(k.t) }); continue; }
    const w = r.words[wi++];   // checkText lists the words in the order of the tokens
    if (!w || !w.inCourse) { parts.push({ t: k.t, el: h('span', { class: 'lx-w lx-notin', lang: c, title: 'not in the course (check it in a dictionary)' }, k.t) }); continue; }
    parts.push({ t: k.t, el: h('span', { class: 'lx-w lx-tok' + (w.known ? '' : ' lx-new'), lang: c, tabindex: '0', title: (w.known ? '' : '🆕 ') + (w.l ? gloss(c, w.l) : ''), onclick: e => { e.stopPropagation(); if (w.l) wordPopup(c, w.l); } }, k.t) });
  }
  return h('span', { class: 'lx-sent', lang: c, dir: X.language.dir || 'ltr' }, ...parts.flatMap((p, i) => i && sp && !/^[.,!?;:،؟。，！？、)」]/.test(p.t) && !/^[(«„“]$/.test(parts[i - 1].t) ? [' ', p.el] : [p.el]));
}
/** Under an AI text: the course words it uses that are not learned yet (glossed) and the words that are not in the course. */
function wordsNote(c, r) {
  if (!r.unlearned.length && !r.unknown.length) return h('div', { class: 'tiny lx-wordsok' }, '✓ Only words you know.');
  noteNew(c, r.unlearned);
  return h('div', { class: 'tiny lx-wordsnote' },
    r.unlearned.length ? h('div', {}, '🆕 ', ...r.unlearned.flatMap((l, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, LX(c).lex[l].lemma), ' = ' + gloss(c, l)])) : null,
    r.unknown.length ? h('div', {}, '❓ Not in the course: ', uniq(r.unknown).join(' · ')) : null);
}

/* ---------- widgets (WIDGETS[type], see 45_grammar.js) ---------- */
function textInput(c, { multiline = false, placeholder = '' } = {}) {
  const X = LX(c);
  return h(multiline ? 'textarea' : 'input', { class: 'noema-input lx-typed' + (multiline ? ' lx-compose' : ''), lang: c, dir: X.language.dir || 'ltr', rows: multiline ? 5 : null, placeholder,
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': `your answer in ${info(c).name}` });
}
/** The AI's verdict on an open answer, labelled; the course's own answer stays shown as the reference (never replaced). */
function verdictView(c, d) {
  const r = d.corrected ? N.checkText(UI.C, c, d.corrected, N.known(UI.C, UI.L, c).R) : null;
  return h('div', { class: 'lx-aiv v-' + d.verdict, 'data-verdict': d.verdict },
    h('div', { class: 'row' }, aiBadge(), h('b', {}, d.verdict === 'correct' ? '✅ Correct' : d.verdict === 'acceptable' ? '🟡 Acceptable' : '❌ Not right yet')),
    d.feedback ? h('p', {}, wordsIn(c, d.feedback)) : null,
    (d.mistakes || []).length ? h('ul', { class: 'lx-list' }, ...d.mistakes.map(m => h('li', {}, h('del', {}, word(c, m.wrong, { sub: false })), ' → ', h('ins', {}, word(c, m.right, { sub: false })), m.why ? ' — ' + m.why : ''))) : null,
    r && d.corrected ? h('div', { class: 'lx-aicorr' }, h('span', { class: 'tiny' }, 'AI correction (not the answer key): '), checkedText(c, d.corrected, r), wordsNote(c, r)) : null);
}
/** Judge an open answer: AI when the learner has a key, otherwise say how to get one. → Promise<bool> */
async function judgeOpen(box, c, task) {
  if (!aiVendor()) { box.append(h('div', { class: 'lx-fb bad' }, '🤷 This answer is not one the course has stored. An AI could judge it: ', keyHelp())); return false; }
  const wait = h('div', { class: 'tiny lx-aiwait' }, '🤖 asking the AI…'); box.append(wait);
  try {
    const t = N.aiTask(UI.C, UI.L, c, task, { chatLang: chatLangOf() });
    const r = await aiJSON(t); wait.remove();
    box.append(verdictView(c, r.data));
    return r.data.verdict !== 'wrong';
  } catch (e) { wait.remove(); box.append(h('div', { class: 'lx-fb bad' }, '⚠️ The AI could not judge it: ' + (e.message || e), /key/i.test(e.message || '') ? keyHelp() : null)); return false; }
}
const courseAnswer = (c, txt, label = 'The course’s answer: ') => h('div', { class: 'lx-ref' }, h('span', { class: 'tiny' }, label), word(c, txt, { sub: false }));
/** A typed answer checked against stored sentences first; the AI only for what they do not decide. */
function typedBox(c, { sentence, refs, onCheck, aiTask, multiline = false, placeholder = '' }, done) {
  const wrap = h('div', { class: 'lx-typebox' }), inp = textInput(c, { multiline, placeholder }); let over = false;
  const submit = async () => {
    const val = inp.value.trim(); if (over || !val) return; over = true; inp.disabled = true; btn.disabled = true; give.disabled = true;
    const r = sentence ? N.typedAnswer(UI.C, c, sentence, val, refs) : { ok: false, how: null };
    const extra = onCheck ? onCheck(val, wrap) : null;
    if (r.ok) { wrap.append(h('div', { class: 'lx-fb ok', 'data-how': r.how }, '✅ ', r.how === 'variant' ? 'Right — the course writes it: ' : 'Right: ', word(c, sentence.text === val ? val : (refs?.[0] || sentence.text), { sub: false }), extra)); return done(true, r.how); }
    if (extra) wrap.append(extra);
    if (sentence || refs?.length) wrap.append(courseAnswer(c, refs?.[0] || sentence.text));
    const ok = aiTask ? await judgeOpen(wrap, c, { ...aiTask, answer: val }) : false;
    done(ok, ok ? 'ai' : null);
  };
  const btn = h('button', { class: 'btn primary small', onclick: submit }, 'Check');
  const give = h('button', { class: 'btn ghost small', onclick: () => { if (over) return; over = true; inp.disabled = true; btn.disabled = true; give.disabled = true; if (sentence || refs?.length) wrap.append(courseAnswer(c, refs?.[0] || sentence.text)); done(false, null); } }, 'Show me');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  wrap.append(inp, h('div', { class: 'row' }, btn, give, multiline ? h('span', { class: 'tiny' }, 'Ctrl + Enter checks') : null));
  setTimeout(() => inp.focus(), 40);
  return wrap;
}
WIDGETS.translate = (it, done) => {
  const c = it.lang, X = LX(c), s = X.sentenceById[it.sentence];
  if (it.mode === 'tiles') {
    const holder = h('div', { class: 'lx-ex lx-extrans', 'data-kind': 'translate', 'data-mode': 'tiles' });
    holder.append(exBuild({ ...it, type: 'build', kind: 'translate' }, ok => done(ok)),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small lx-totyped', onclick: () => holder.replaceWith(WIDGETS.translate({ ...it, mode: 'typed' }, done)) }, '⌨️ Type it instead')));
    return holder;
  }
  const box = h('div', { class: 'lx-ex lx-extrans', 'data-kind': 'translate', 'data-mode': 'typed' },
    h('div', { class: 'lx-q' }, `Say it in ${info(c).name}:`), h('div', { class: 'lx-prompt lx-meaning' }, it.gloss));
  noteNew(c, it.unknown);
  if ((it.unknown || []).length) box.append(h('div', { class: 'tiny lx-newwords' }, '🆕 ', ...it.unknown.flatMap((l, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, X.lex[l].lemma), ' = ' + gloss(c, l)])));
  box.append(typedBox(c, { sentence: s, aiTask: { kind: 'translate', gloss: it.gloss, reference: it.answers } }, (ok, how) => { if (how && how !== 'ai') credit(c, s, ok); done(ok); }));
  return box;
};
/** A production answer decided by the stored data counts as a production review of the sentence's words (§5.1). */
function credit(c, s, ok) { if (!ok || !s) return; const k = N.known(UI.C, UI.L, c), day = today(); for (const l of s.req) if (k.R.has(l)) N.review(UI.C, UI.L, c, l, 'p', 'good', day); }
WIDGETS.rewrite = (it, done) => {
  const c = it.lang, X = LX(c), src = X.sentenceById[it.sentence], target = it.target ? X.sentenceById[it.target] : null;
  const box = h('div', { class: 'lx-ex lx-exrewrite', 'data-kind': it.kind },
    h('div', { class: 'lx-q' }, it.kind === 'expand' ? '➕ Expand the sentence' : '🔁 Rewrite the sentence'),
    h('div', { class: 'lx-prompt lx-src' }, sentenceView(c, src, it.unknown)), h('div', { class: 'lx-tr' }, it.sourceGloss),
    h('div', { class: 'lx-constraint' }, '👉 ', it.constraint), !target ? h('div', { class: 'tiny' }, aiBadge('🤖 open answer'), ' judged by the AI with your key; the words are checked against the course') : null);
  noteNew(c, it.unknown);
  const vocab = (val, wrap) => { const r = N.checkText(UI.C, c, val, N.known(UI.C, UI.L, c).R); return h('div', { class: 'lx-vocab' }, h('span', { class: 'tiny' }, 'Your words: '), checkedText(c, val, r), wordsNote(c, r)); };
  box.append(typedBox(c, { sentence: target, onCheck: target ? null : vocab, aiTask: { kind: it.kind, source: it.source, sourceGloss: it.sourceGloss, constraint: it.constraint, reference: it.answers } },
    (ok, how) => { if (target && how && how !== 'ai') credit(c, target, ok); done(ok); }));
  return box;
};
WIDGETS.compose = (it, done) => {
  const c = it.lang, X = LX(c);
  const box = h('div', { class: 'lx-ex lx-excompose', 'data-kind': 'compose' }, h('div', { class: 'lx-q' }, '📝 ', it.prompt),
    it.picture ? h('div', { class: 'lx-prompt' }, conceptPic(it.picture, 'lx-bigemoji')) : null,
    h('div', { class: 'lx-required' }, h('span', { class: 'tiny' }, 'Use these words (any form): '), ...it.required.map(l => h('button', { class: 'chip lx-req', 'data-lex': l, onclick: () => wordPopup(c, l) }, word(c, X.lex[l].lemma, { sub: false }), ' ', h('span', { class: 'tiny' }, gloss(c, l))))));
  const inp = textInput(c, { multiline: true, placeholder: `Write in ${info(c).name}…` }); let over = false;
  const out = h('div', { class: 'lx-composeout' });
  const submit = async () => {
    const val = inp.value.trim(); if (over || !val) return; over = true; inp.disabled = true; btn.disabled = true;
    const k = N.known(UI.C, UI.L, c), r = N.composeCheck(UI.C, c, val, it, k.R);
    out.append(h('div', { class: 'lx-check1' }, h('b', {}, '✔ Checked by the course: '),
      ...it.required.map(l => h('span', { class: 'lx-badge ' + (r.used.includes(l) ? 'lx-used' : 'lx-missing'), 'data-lex': l }, (r.used.includes(l) ? '✓ ' : '✗ ') + X.lex[l].lemma)),
      h('span', { class: 'tiny' }, ` · ${r.sentences} sentence${r.sentences === 1 ? '' : 's'}`)), h('div', {}, checkedText(c, val, r)), wordsNote(c, r));
    let ok = !r.missing.length;
    if (!aiVendor()) { out.append(h('p', { class: 'tiny' }, 'The rubric (grammar, vocabulary, spelling, cohesion) needs an AI: '), keyHelp()); return done(ok); }
    const wait = h('div', { class: 'tiny' }, '🤖 the AI reads your text…'); out.append(wait);
    try {
      const res = await aiJSON(N.aiTask(UI.C, UI.L, c, { ...it, kind: 'compose', answer: val }, { chatLang: chatLangOf() })); wait.remove();
      out.append(rubricView(c, val, res.data));
      const avg = ['grammar', 'vocabulary', 'spelling', 'cohesion'].reduce((a, x) => a + (res.data.aspects[x]?.score || 0), 0) / 4;
      ok = ok && avg >= 3;
    } catch (e) { wait.remove(); out.append(h('div', { class: 'lx-fb bad' }, '⚠️ The AI could not grade it: ' + (e.message || e))); }
    done(ok);
  };
  const btn = h('button', { class: 'btn primary small', onclick: submit }, 'Check my text');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  box.append(inp, h('div', { class: 'row' }, btn, h('span', { class: 'tiny' }, 'Ctrl + Enter checks')), out);
  setTimeout(() => inp.focus(), 40);
  return box;
};
/** The AI rubric: a score per aspect, the text with the corrections inline, the AI's corrected text checked against the course. */
function rubricView(c, text, d) {
  const marked = []; let rest = text;
  for (const cor of (d.corrections || [])) {
    const i = cor.from ? rest.indexOf(cor.from) : -1; if (i < 0) continue;
    marked.push(rest.slice(0, i), h('span', { class: 'lx-cor', title: cor.why || '' }, h('del', { lang: c, dir: LX(c).language.dir || 'ltr' }, cor.from), h('ins', { lang: c, dir: LX(c).language.dir || 'ltr' }, cor.to)));
    rest = rest.slice(i + cor.from.length);
  }
  marked.push(rest);
  const r = d.corrected ? N.checkText(UI.C, c, d.corrected, N.known(UI.C, UI.L, c).R) : null;
  return h('div', { class: 'lx-rubric' }, h('div', { class: 'row' }, aiBadge(), h('b', {}, 'The rubric')),
    h('div', { class: 'lx-aspects' }, ...['grammar', 'vocabulary', 'spelling', 'cohesion'].map(a => h('div', { class: 'lx-aspect', 'data-aspect': a },
      h('b', {}, a), h('span', { class: 'lx-score' }, '●'.repeat(d.aspects[a]?.score || 0) + '○'.repeat(5 - (d.aspects[a]?.score || 0)), ' ', (d.aspects[a]?.score ?? '–') + '/5'), h('div', { class: 'tiny' }, d.aspects[a]?.comment || '')))),
    (d.corrections || []).length ? h('div', { class: 'lx-marked', lang: c, dir: LX(c).language.dir || 'ltr' }, ...marked) : null,
    (d.corrections || []).length ? h('ul', { class: 'lx-list tiny' }, ...d.corrections.map(x => h('li', {}, h('del', {}, word(c, x.from, { sub: false })), ' → ', h('ins', {}, word(c, x.to, { sub: false })), x.why ? ' — ' + x.why : ''))) : null,
    r ? h('div', { class: 'lx-aicorr' }, h('span', { class: 'tiny' }, 'AI correction: '), checkedText(c, d.corrected, r), wordsNote(c, r)) : null,
    d.feedback ? h('p', {}, wordsIn(c, d.feedback)) : null);
}
/** A choice whose prompt is not a plain word: numbers, clock, dates, register, dialogue turns. */
function choiceBox(it, done, promptEl, optLabel) {
  const box = h('div', { class: 'lx-ex lx-exchoose lx-ex-' + it.type, 'data-kind': it.kind });
  noteNew(it.lang, it.unknown);
  const opts = it.options.map(o => ({ label: optLabel ? optLabel(o) : word(it.lang, o, { sub: false }), ok: o === it.answer }));
  box.append(it.ask ? h('div', { class: 'lx-q' }, it.ask) : null, promptEl,
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok);
      box.append(h('div', { class: 'lx-fb ' + (o.ok ? 'ok' : 'bad') }, o.ok ? '✅ ' : '❌ ', wordsIn(it.lang, it.why || it.answer))); done(!!o.ok); }));
  return box;
}
const digitsLabel = o => /^\d+$/.test(o) ? h('span', { class: 'lx-digits' }, o) : o;
WIDGETS.number = (it, done) => choiceBox(it, done, h('div', { class: 'lx-prompt' + (it.kind === 'word2digits' ? '' : ' lx-digits') }, it.kind === 'word2digits' ? word(it.lang, it.prompt, { sub: false }) : it.kind === 'counting' ? wordsIn(it.lang, it.prompt) : it.prompt),
  it.kind === 'word2digits' ? digitsLabel : null);
WIDGETS.date = (it, done) => choiceBox(it, done, it.sentence ? h('div', { class: 'lx-prompt lx-src' }, sentenceView(it.lang, LX(it.lang).sentenceById[it.sentence], it.unknown))
  : h('div', { class: 'lx-prompt' + (/^\D/.test(it.prompt) ? '' : ' lx-digits') }, /^[\d٠-٩]/.test(it.prompt) ? it.prompt : word(it.lang, it.prompt, { sub: false })),
  it.kind === 'word2month' ? digitsLabel : it.kind === 'sentence2date' ? (o => o) : null);
/** A question on a graded text: the text stays readable above it (folded on a phone). */
WIDGETS.readq = (it, done) => {
  const X = LX(it.lang), k = N.known(UI.C, UI.L, it.lang);
  const text = (it.text || []).length ? h('details', { class: 'lx-sec lx-readtext', open: true }, h('summary', {}, '📖 The text'), textBody(it.lang, it.text.map(id => X.sentenceById[id]).map(s => ({ s, unknown: s.req.filter(l => !k.R.has(l)) })), { noEye: true })) : null;
  return choiceBox({ ...it, ask: it.prompt }, done, text, o => wordsIn(it.lang, o));
};
WIDGETS.register = (it, done) => choiceBox(it, done, h('div', { class: 'lx-meaning' }, it.gloss));
WIDGETS.dialogue = (it, done) => choiceBox(it, done, h('div', { class: 'lx-dialog' }, h('div', { class: 'lx-turn' }, '💬 ', word(it.lang, it.prompt, { sub: false }), it.promptGloss ? h('div', { class: 'tiny' }, it.promptGloss) : null), h('div', { class: 'lx-turn me' }, '💬 …')));
/** An analogue clock face (SVG, no text: works in any language). */
function clockFace(t) {
  const NS = 'http://www.w3.org/2000/svg', el = (n, a) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const svg = el('svg', { viewBox: '-50 -50 100 100', class: 'lx-clockface', role: 'img', 'aria-label': `${t.h}:${String(t.m).padStart(2, '0')}` });
  svg.append(el('circle', { r: 46, class: 'f' }));
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; svg.append(el('line', { x1: 38 * Math.sin(a), y1: -38 * Math.cos(a), x2: 43 * Math.sin(a), y2: -43 * Math.cos(a), class: 'tick' })); }
  const ha = ((t.h % 12) + t.m / 60) * Math.PI / 6, ma = t.m * Math.PI / 30;
  svg.append(el('line', { x1: 0, y1: 0, x2: 22 * Math.sin(ha), y2: -22 * Math.cos(ha), class: 'hh' }), el('line', { x1: 0, y1: 0, x2: 33 * Math.sin(ma), y2: -33 * Math.cos(ma), class: 'mh' }), el('circle', { r: 2.5, class: 'c' }));
  return svg;
}
WIDGETS.clock = (it, done) => {
  const X = LX(it.lang);
  if (it.kind === 'time2sentence') return choiceBox(it, done, h('div', { class: 'lx-prompt' }, clockFace(it.time)), id => sentenceView(it.lang, X.sentenceById[id]));
  return choiceBox(it, done, h('div', { class: 'lx-prompt lx-src' }, sentenceView(it.lang, X.sentenceById[it.sentence], it.unknown)), o => { const [hh, mm] = o.split(':').map(Number); return h('span', { class: 'lx-clockopt' }, clockFace({ h: hh, m: mm }), h('span', { class: 'lx-digits' }, o)); });
};

/* ---------- running a set of items (the lanes) ---------- */
function runProd(items, { title, back = '#/', lang }) {
  metNew.clear();
  const m = $('.lx-main'), bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  m.innerHTML = ''; m.append(h('div', { class: 'view lx-view lx-session lx-prodrun', 'data-lang': lang || '' }, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go(back); render(); } }, '✕ Stop'), h('b', { class: 'tiny' }, title), bar), stage));
  if (!items.length) { stage.append(h('p', { class: 'lx-note' }, 'Nothing to practise here yet with the words you know — learn the lesson it needs first.'), h('button', { class: 'btn', onclick: () => go(back) }, '← Back')); return; }
  const queue = items.slice(), total = queue.length, stats = { right: 0, wrong: 0 }, day = today(); let i = 0;
  const next = () => {
    bar.firstChild.style.width = Math.round(i / total * 100) + '%';
    const it = queue.shift(); if (!it) return finish();
    i++; stage.innerHTML = '';
    UI.current = { kind: 'item', it };
    const done = ok => {
      if (it.fn) N.practiceFunction(UI.C, UI.L, it.lang, it.fn, ok ? 1 : 0, 1, day);
      if ((it.lex || []).length && LX(it.lang).lex[it.lex[0]]) N.review(UI.C, UI.L, it.lang, it.lex[0], 'r', ok ? 'good' : 'again', day);   // the number / month word asked
      save(); ok ? stats.right++ : stats.wrong++;
      const b = h('button', { class: 'btn primary lx-next' }, 'Next →'); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30);
    };
    const ex = exItem(it, done);
    stage.append(h('div', { class: 'tiny lx-which' }, info(it.lang).flag, ' ', info(it.lang).name), ex);
  };
  const finish = () => {
    UI.current = null; save(true); bar.firstChild.style.width = '100%'; stage.innerHTML = '';
    stage.append(h('div', { class: 'lx-result' }, h('h2', {}, '🎉 Done'), h('p', {}, `${stats.right} right · ${stats.wrong} to practise again`), newWordsList(),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => go(back) }, '← Back'), h('button', { class: 'btn', onclick: () => go('#/') }, 'The map'))));
  };
  document.onkeydown = e => {
    if (!$('.lx-prodrun')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input|textarea/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}

/* ---------- ✍️ the writing lane ---------- */
const WRITE_SETS = [
  { id: 'translate', icon: '🔤', title: 'Translate', what: 'the meaning → the sentence (tiles first, typing when you know the words)', make: (c, k) => N.translateItems(UI.C, UI.L, c, { k, max: 8 }) },
  { id: 'rewrite', icon: '🔁', title: 'Rewrite and expand', what: 'the same sentence under a constraint, or with a detail more', make: (c, k) => N.rewriteItems(UI.C, UI.L, c, { k, max: 6 }) },
  { id: 'compose', icon: '📝', title: 'Guided writing', what: 'a few sentences on a topic with given words — a rubric per aspect', make: (c, k) => { const t = N.composeTask(UI.C, UI.L, c, { k }); return t ? [t] : []; } },
  { id: 'register', icon: '🎭', title: 'Register and dialogue', what: 'the right formula for the person; the fitting answer', make: (c, k) => shuffle([...N.registerItems(UI.C, UI.L, c, { k, max: 4 }), ...N.dialogueItems(UI.C, UI.L, c, { k, max: 4 })]) },
  { id: 'numbers', icon: '🔢', title: 'Numbers', what: 'digits ↔ words, counting things', make: (c, k) => N.numberItems(UI.C, UI.L, c, { k, max: 10 }) },
  { id: 'clock', icon: '🕒', title: 'The clock', what: 'what time does it say?', make: (c, k) => N.clockItems(UI.C, UI.L, c, { k, max: 6 }) },
  { id: 'date', icon: '📅', title: 'Dates', what: 'months, days, ordinals, dates in sentences', make: (c, k) => N.dateItems(UI.C, UI.L, c, { k, max: 8 }) }];
VIEWS.write = (v, r) => {
  const c = UI.C.lang[r.arg] ? r.arg : UI.lang, k = N.known(UI.C, UI.L, c);
  if (r.arg2) { const set = WRITE_SETS.find(s => s.id === r.arg2); if (set) return runProd(set.make(c, k), { title: `${set.icon} ${set.title} · ${info(c).flag} ${info(c).name}`, back: '#/write/' + c, lang: c }); }
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '✍️ Writing', h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/write/' + x); })),
    h('p', { class: 'tiny' }, `Sentences with the words you know (${k.R.size}); a few new ones are marked 🆕. The course's stored sentences decide; other answers are judged by the AI with your key and marked “AI-judged”.`),
    !aiVendor() ? keyHelp(() => render()) : null);
  const grid = h('div', { class: 'lx-lanegrid' });
  for (const set of WRITE_SETS) {
    const n = set.make(c, k).length;
    grid.append(h('button', { class: 'lx-lanecard', 'data-set': set.id, disabled: n ? null : true, onclick: () => go(`#/write/${c}/${set.id}`) },
      h('span', { class: 'lx-laneicon' }, set.icon), h('b', {}, set.title), h('span', { class: 'tiny' }, set.what), h('span', { class: 'tiny lx-lanen' }, n ? `${n} ready` : 'learn more words first')));
  }
  v.append(grid, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => openLangTutor({ lang: c, intent: 'chat' }) }, '🎓 A conversation at my level')));
};

/* ---------- 📖 the reading lane ---------- */
VIEWS.read = (v, r) => {
  const c = UI.C.lang[r.arg] ? r.arg : UI.lang, k = N.known(UI.C, UI.L, c);
  if (r.arg2) return readerView(v, c, r.arg2, k);
  const texts = N.readerTexts(UI.C, UI.L, c, { k });
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '📖 Reading', h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/read/' + x); })),
    h('p', { class: 'tiny' }, 'Short texts made of the course’s sentences, at most one new word per sentence. Tap a word for its card.'),
    h('div', { class: 'row' }, aiVendor() ? h('button', { class: 'btn small', onclick: e => aiReader(c, e.currentTarget) }, '✨ A new text written by the AI (checked against your words)') : h('span', { class: 'tiny' }, '✨ New texts written by an AI need your key (see Writing).')));
  if (!texts.length) return v.append(h('p', { class: 'lx-note' }, `No text yet with the words you know in ${info(c).name} — learn a few lessons first.`));
  v.append(h('div', { class: 'lx-texts' }, ...texts.slice(0, 40).map(t => h('button', { class: 'lx-textcard', 'data-text': t.id, onclick: () => go(`#/read/${c}/${encodeURIComponent(t.id)}`) },
    h('b', {}, t.title), h('span', { class: 'tiny' }, `${t.sentences.length} sentences · ${t.unknown.length ? '🆕 ' + t.unknown.length + ' new word' + (t.unknown.length > 1 ? 's' : '') : '✓ only words you know'}`)))));
};
function readerView(v, c, id, k) {
  const t = N.readerTexts(UI.C, UI.L, c, { k }).find(x => x.id === id); if (!t) return go('#/read/' + c);
  const X = LX(c); metNew.clear();
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/read/' + c) }, '← Texts')), h('h1', {}, '📖 ', t.title));
  v.append(textBody(c, t.sentences.map(sid => X.sentenceById[sid]).map(s => ({ s, unknown: s.req.filter(l => !k.R.has(l)) }))));
  v.append(newWordsList('🆕 New words in this text') || h('p', { class: 'tiny' }, '✓ Only words you know.'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary lx-readq', onclick: () => runProd(N.readerQuestions(UI.C, UI.L, c, t, { n: 3 }).map(q => ({ ...q, type: 'readq', text: t.sentences })), { title: `📖 ${t.title} — questions`, back: `#/read/${c}/${encodeURIComponent(t.id)}`, lang: c }) }, '❓ Questions on the text'),
      h('button', { class: 'btn small', onclick: () => openLangTutor({ lang: c, intent: 'chat' }) }, '🎓 Talk about it with the tutor')));
}
/** The sentences of a text in one paragraph: each word opens its card, 👁 shows the meaning of a sentence. */
function textBody(c, rows, { aiGloss = false, noEye = false } = {}) {
  const X = LX(c), body = h('div', { class: 'lx-reader', lang: c, dir: X.language.dir || 'ltr' });
  for (const { s, unknown, r, gl } of rows) {
    if (s) noteNew(c, unknown);
    const tr = h('span', { class: 'lx-rtr', hidden: true, lang: UI.C.explainLang, dir: 'ltr' }, (gl ?? s.gloss) + (aiGloss ? ' (AI)' : ''));
    body.append(h('span', { class: 'lx-rsent' }, s ? sentenceView(c, s, unknown) : checkedText(c, r.text, r.check), ' ',
      noEye ? null : h('button', { class: 'lx-eye', title: 'show the meaning', 'aria-label': 'show the meaning', onclick: () => { tr.hidden = !tr.hidden; } }, '👁'), noEye ? null : tr, ' '));
  }
  return body;
}
/** ✨ A text by the AI: the LLM proposes, the tokenizer decides (every word in the course, at most one unknown per sentence). No questions: they would need an answer key. */
async function aiReader(c, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = '✨ writing…';
  try {
    const k = N.known(UI.C, UI.L, c), t = N.readerTask(UI.C, UI.L, c, { k, chatLang: chatLangOf() });
    const res = await aiJSON(t, { repairs: 2 });
    const rows = res.data.sentences.map(x => ({ r: { text: x.text, check: N.checkText(UI.C, c, x.text, k.R) }, gl: x.gloss }));
    const okRows = rows.filter(x => !x.r.check.unknown.length && x.r.check.unlearned.length <= 1);
    const v = $('.lx-view'); metNew.clear(); for (const x of okRows) noteNew(c, x.r.check.unlearned);
    v.innerHTML = '';
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/read/' + c) }, '← Texts')), h('h1', {}, '📖 ', res.data.title, ' ', aiBadge('🤖 AI-written · checked')),
      h('p', { class: 'tiny' }, `${okRows.length} of ${rows.length} sentences passed the check (every word in the course, at most one new word per sentence)${rows.length > okRows.length ? '; the others are left out' : ''}. The meanings are the AI’s translation.`),
      textBody(c, okRows, { aiGloss: true }), newWordsList('🆕 New words in this text') || h('p', { class: 'tiny' }, '✓ Only words you know.'));
  } catch (e) { btn.disabled = false; btn.textContent = '⚠️ ' + (e.message || 'failed') + ' — try again'; console.warn(e); return; }
  btn.textContent = old;
}

/* ---------- 🎓 the tutor in a language (§8) ---------- */
const TT = { open: false, ctx: null, hist: {}, busy: false, ids: {} };
const tutorKey = ctx => [ctx.lang, ctx.fn || ctx.node || 'course', ctx.intent || 'chat'].join('|');
const INTENT_LABEL = { explain: '📘 Explain this rule', compare: '⇄ Compare the languages', quiz: '❓ Quiz this node', chat: '💬 A conversation at my level' };
const INTENT_MSG = { explain: 'Explain this rule to me.', compare: 'How does this point work in the other languages of the course?', quiz: 'Quiz me on this.', chat: 'Let’s talk — at my level, please.' };
/** The tutor is the learner's character (main: NoemaThemes.current() everywhere): its name and face, when the app has characters. */
function tutorNameNow() { try { return window.NoemaThemes ? NoemaThemes.tutor().n : ''; } catch (e) { return ''; } }
function tutorFaceNow() { try { return window.NoemaArt && window.NoemaThemes ? h('span', { class: 'lx-tface', html: NoemaArt.mascot(NoemaThemes.current()), 'aria-hidden': 'true' }) : null; } catch (e) { return null; } }
INTENT_MSG.hint = 'I am on an exercise and want a hint, not the answer.';
function openLangTutor(ctx) {
  TT.ctx = { lang: ctx.lang || UI.lang, fn: ctx.fn || null, node: ctx.node || null, intent: ctx.intent || 'chat' };
  TT.open = true; drawTutor();
  const key = tutorKey(TT.ctx);
  if (ctx.auto !== false && !(TT.hist[key] || []).length && aiVendor()) sendTutor(INTENT_MSG[TT.ctx.intent]);
}
function closeLangTutor() { TT.open = false; document.querySelector('.lx-tutor')?.remove(); }
function ctxLabelOf(ctx) {
  const c = ctx.lang, fn = ctx.fn && UI.C.functions[ctx.fn], n = ctx.node && UI.C.nodes[ctx.node];
  return `${info(c).flag} ${info(c).name}` + (fn ? ' · ' + fn.title : n ? ' · ' + n.title : '');
}
function drawTutor() {
  document.querySelector('.lx-tutor')?.remove(); if (!TT.open) return;
  const ctx = TT.ctx, key = tutorKey(ctx), hist = TT.hist[key] || [], c = ctx.lang;
  const intents = ['explain', 'compare', 'quiz', 'chat'].filter(x => x === 'chat' || (x === 'quiz' ? !!(ctx.node || ctx.fn) : !!ctx.fn));
  const msgs = h('div', { class: 'lx-tmsgs', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'noema-input lx-tin', rows: 2, placeholder: 'Your message…', 'aria-label': 'your message to the tutor', onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; sendTutor(v); } } } });
  const sel = h('select', { class: 'lx-tlang', 'aria-label': 'language of the tutor’s explanations', onchange: e => { UI.prefs.chatLang = e.target.value; save(); } },
    ...uniq([UI.C.explainLang, 'en', 'el', 'de', 'ru', 'tr', 'fr', 'es', ...knowsL().map(k => k.code).filter(Boolean)]).map(x => h('option', { value: x, selected: chatLangOf() === x ? true : null }, '🗣 ' + langName(x))));
  const box = h('aside', { class: 'lx-tutor', role: 'dialog', 'aria-label': 'Tutor' },
    h('div', { class: 'lx-thead' }, tutorFaceNow(), h('b', { class: 'lx-tname' }, tutorNameNow() || '🎓 Tutor'), h('span', { class: 'tiny lx-tctx' }, ctxLabelOf(ctx)), h('span', { class: 'spacer' }), sel, h('button', { class: 'iconbtn', title: 'Close', 'aria-label': 'Close the tutor', onclick: closeLangTutor }, '✕')),
    h('div', { class: 'lx-tintents' }, ...intents.map(x => h('button', { class: 'chip' + (x === ctx.intent ? ' on' : ''), 'data-intent': x, onclick: () => {
      if (!aiVendor()) { msgs.prepend(h('div', { class: 'lx-tmsg sys' }, `${INTENT_LABEL[x]} needs an AI key — add one below.`)); return; }
      TT.ctx = { ...ctx, intent: x }; drawTutor(); if (!(TT.hist[tutorKey(TT.ctx)] || []).length) sendTutor(INTENT_MSG[x]);
    } }, INTENT_LABEL[x]))),
    h('div', { class: 'tiny lx-trule' }, `Uses the ${info(c).name} words you know (${N.known(UI.C, UI.L, c).R.size}); at most one new word per sentence, glossed. Its words are checked against the course.`),
    !aiVendor() ? keyHelp(() => drawTutor()) : null, msgs,
    h('div', { class: 'lx-tcomp' }, ta, h('button', { class: 'btn primary small', disabled: aiVendor() ? null : true, onclick: () => { const v = ta.value.trim(); if (v) { ta.value = ''; sendTutor(v); } } }, '➤')));
  for (const m of hist) msgs.append(tutorMsg(c, m));
  if (!hist.length) msgs.append(h('div', { class: 'lx-tmsg sys' }, aiVendor() ? 'Pick what you want, or just write.' : 'Each button above works once you have added a key.'));
  box.addEventListener('keydown', e => { if (e.key === 'Escape') closeLangTutor(); });   // keyboard: Esc closes the drawer
  document.body.append(box); msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => (aiVendor() ? ta : box.querySelector('.lx-keyhelp input') || box.querySelector('[aria-label="Close the tutor"]'))?.focus(), 50);   // focus in the drawer: Esc closes it, with or without a key
}
/** A light markdown: **bold**, line breaks; the language's own sentences in their font and direction. */
function tutorText(c, text, targets) {
  const X = LX(c), out = h('div', { class: 'lx-tmd' });
  const lines = String(text || '').split('\n');
  lines.forEach((line, li) => {
    const segs = line.split(/(\*\*[^*]+\*\*)/g);
    for (const seg of segs) {
      const bold = /^\*\*[^*]+\*\*$/.test(seg), raw = bold ? seg.slice(2, -2) : seg, holder = bold ? h('b') : h('span');
      // the target sentences (any script) get lang + dir; the rest goes through wordsIn (ar / he / zh runs)
      let rest = raw; const ts = (targets || []).filter(t => t && raw.includes(t)).sort((a, b) => b.length - a.length);
      while (rest) {
        const hit = ts.map(t => [t, rest.indexOf(t)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
        if (!hit) { holder.append(...wordsIn(c, rest)); break; }
        const [t, i] = hit; if (i) holder.append(...wordsIn(c, rest.slice(0, i)));
        holder.append(h('span', { class: 'lx-w lx-tl', lang: c, dir: X.language.dir || 'ltr' }, t)); rest = rest.slice(i + t.length);
      }
      out.append(holder);
    }
    if (li < lines.length - 1) out.append(h('br'));
  });
  return out;
}
function tutorMsg(c, m) {
  if (m.role === 'user') return h('div', { class: 'lx-tmsg me' }, m.text);
  if (m.role === 'error') return h('div', { class: 'lx-tmsg err' }, '⚠️ ', m.text);
  const r = m.check;
  return h('div', { class: 'lx-tmsg ai' }, tutorText(c, m.text, m.target), r && (m.target || []).length ? h('div', { class: 'lx-tcheck' }, h('span', { class: 'tiny' }, 'In the course: '), ...m.target.map((t, i) => h('div', {}, checkedText(c, t, r[i]))), wordsNote(c, mergeChecks(r))) : null);
}
const mergeChecks = rs => ({ unknown: uniq(rs.flatMap(r => r.unknown)), unlearned: uniq(rs.flatMap(r => r.unlearned)) });
async function sendTutor(text) {
  if (TT.busy || !TT.ctx) return;
  const ctx = TT.ctx, key = tutorKey(ctx), c = ctx.lang, hist = TT.hist[key] = TT.hist[key] || [];
  hist.push({ role: 'user', text, t: Date.now() }); TT.busy = true; drawTutor();
  const msgs = document.querySelector('.lx-tmsgs'); msgs?.append(h('div', { class: 'lx-tmsg ai lx-typing' }, '…'));
  try {
    const k = N.known(UI.C, UI.L, c), task = N.tutorTask(UI.C, UI.L, c, ctx, { k, chatLang: chatLangOf(), tutorName: tutorNameNow() });
    const convo = hist.filter(m => m.role !== 'error').map(m => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`).join('\n\n');
    const r = await NoemaLLM.json({ acc: UI.acc, system: task.system, prompt: `The conversation so far:\n\n${convo}\n\nWrite the tutor's next message.`, schema: task.schema, name: task.name, repairs: 1, maxTokens: 6000 });
    const target = (r.data.target || []).filter(x => typeof x === 'string' && x.trim());
    hist.push({ role: 'assistant', text: r.data.reply, target, check: target.map(t => N.checkText(UI.C, c, t, k.R)), t: Date.now() });
    persistTutor(key, ctx, hist, r.provider);
  } catch (e) { hist.push({ role: 'error', text: e.message || String(e) }); }
  finally { TT.busy = false; if (TT.open && tutorKey(TT.ctx) === key) drawTutor(); }
}
/** Keep the conversation with the others (engine/convos.js: IndexedDB, the backup folder, the cloud). */
function persistTutor(key, ctx, hist, provider) {
  try {
    if (!window.NoemaConvos || !window.Noema?.idb) return;
    const id = TT.ids[key] = TT.ids[key] || NoemaConvos.newId();
    NoemaConvos.put(UI.acc, { id, kind: 'tutor', mode: 'lang-' + (ctx.intent || 'chat'), subject: { id: 'lang:' + UI.id, title: UI.C.data.course.title },
      context: { type: ctx.fn ? 'function' : ctx.node ? 'node' : 'course', id: (ctx.fn || ctx.node || null) && `${ctx.lang}:${ctx.fn || ctx.node}`, label: ctxLabelOf(ctx) },
      model: { provider: provider === 'claude' ? 'anthropic' : 'google', name: null },
      messages: hist.filter(m => m.role !== 'error').map(m => ({ role: m.role, content: m.text, t: m.t })) }).catch(() => { });
  } catch (e) { }
}

/* ---------- hooks: the lanes on the home, the tutor on the grammar, lesson and node pages ---------- */
function prodLanes() {
  return h('div', { class: 'lx-prodlanes' }, h('h2', { class: 'lx-h2' }, '✍️ Writing · 📖 Reading'),
    h('div', { class: 'lx-lanes' }, ...activeLangs().map(c => h('div', { class: 'lx-lanerow', 'data-lang': c },
      h('span', { class: 'lx-flag' }, info(c).flag), h('b', {}, info(c).name),
      h('button', { class: 'btn small lx-towrite', onclick: () => go('#/write/' + c) }, '✍️ Writing'),
      h('button', { class: 'btn small lx-toread', onclick: () => go('#/read/' + c) }, '📖 Reading'),
      h('button', { class: 'btn ghost small lx-totutor', onclick: () => openLangTutor({ lang: c, intent: 'chat' }) }, '🎓 Tutor')))));
}
const tutorRow = (ctx, intents) => h('div', { class: 'row lx-tutorrow' }, h('span', { class: 'tiny' }, '🎓 Tutor: '),
  ...intents.map(x => h('button', { class: 'btn ghost small', 'data-intent': x, onclick: () => openLangTutor({ ...ctx, intent: x }) }, INTENT_LABEL[x])));
{
  const home = VIEWS.home;
  VIEWS.home = (v, r) => { home(v, r); const map = [...v.querySelectorAll('h2')].find(x => /The map/.test(x.textContent)); const lanes = prodLanes(); map ? map.before(lanes) : v.append(lanes); };
  const fn = VIEWS.fn;
  VIEWS.fn = (v, r) => { fn(v, r); const fid = r.arg; if (!UI.C.functions[fid] || fid === 'fn.overview') return; const c = r.arg2 && UI.C.lang[r.arg2] ? r.arg2 : UI.lang; v.querySelector('.lx-gram')?.before(tutorRow({ lang: c, fn: fid }, ['explain', 'compare', 'quiz'])); };
  const lesson = VIEWS.lesson;
  VIEWS.lesson = (v, r) => { lesson(v, r); const n = UI.C.nodes[r.arg]; if (!n || n.kind !== 'lesson') return; const langs = lessonLangs(r.arg); if (!langs.length) return; const c = langs.includes(UI.lang) ? UI.lang : langs[0]; v.querySelector('.lx-actions')?.after(tutorRow({ lang: c, node: r.arg }, ['quiz', 'chat'])); };
  const node = VIEWS.node;
  VIEWS.node = (v, r) => { node(v, r); const n = UI.C.nodes[r.arg]; if (!n || n.kind === 'lesson') return; v.querySelector('.lx-actions')?.after(tutorRow({ lang: UI.lang, node: r.arg }, ['quiz', 'chat'])); };
}
Object.assign(window.NoemaLangUI || {}, { prod: { runProd, openLangTutor, closeLangTutor, sendTutor, TT, WRITE_SETS } });
