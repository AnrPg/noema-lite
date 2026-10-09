/* ---------- P5 — the grammar lane (docs/LANGUAGES.md §6.3, §6.4, §7.3, §7.5, §8) ----------
   Widgets for the grammar exercises made by langcore (paradigm tables, choices per word or per dimension, proofreading,
   contrasts, morphemes and joined sentences), the feasibility light of a function, the 📐 grammar lane (home and
   #/grammar/<lang>), practice blocks that record practiceFunction, and the grammar step of the daily session. */
const FEAS_LIGHT = { ready: '🟢', thin: '🟡', locked: '🔒', absent: '—' };
const FN_STATE = { new: '○ new', practicing: '◑ practising', solid: '● solid', mastered: '★ mastered' };
const explainAttrs = () => ({ lang: UI.C.explainLang, dir: 'ltr' });

/** The light of one function in one language (§7.3): 🟢 ready · 🟡 thin (n sentences) · 🔒 needs node X. */
function feasText(c, f) {
  if (f.state === 'ready') return `🟢 ready${f.usesBank ? ` · ${f.sentences} sentences` : ''}`;
  if (f.state === 'thin') return `🟡 thin (${f.sentences} sentence${f.sentences === 1 ? '' : 's'})`;
  if (f.state === 'absent') return '— not in this language';
  const miss = Object.entries(f.needs || {}).filter(([, [have, need]]) => have < need).map(([pos, [have, need]]) => `${have}/${need} ${(N.POS_LABEL[pos] || pos).split(' ')[0]}s`);
  const node = f.unlockBy?.[0] && UI.C.nodes[f.unlockBy[0]];
  return '🔒 ' + (node ? `needs ${node.step != null ? stepLabel(node) + ' ' : ''}${node.title}` : 'needs more words') + (miss.length ? ` (${miss.join(', ')})` : '');
}
/** On a grammar card: the light, the state and ▶ practise (not inside a running lesson). */
function feasibilityBar(c, fid, compact) {
  const g = LX(c).grammar[fid]; if (!g || g.status === 'absent' || UI.C.functions[fid]?.category === 'overview') return null;
  const f = N.feasibility(UI.C, UI.L, c, fid), st = N.functionState(UI.C, UI.L, c, fid);
  const can = (f.state === 'ready' || f.state === 'thin') && !document.querySelector('.lx-session');
  return h('div', { class: 'lx-feas s-' + f.state, 'data-feas': f.state, 'data-fn': fid, 'data-lang': c },
    h('span', { class: 'lx-light', title: 'Can this point be trained now with the words you know? (§7.3)' }, feasText(c, f)),
    h('span', { class: 'lx-badge lx-fnstate' }, FN_STATE[st] || st),
    can ? h('button', { class: 'btn small primary lx-practise', onclick: () => practiseFn(c, fid) }, '▶ Practise') : null,
    !compact && can ? h('span', { class: 'tiny lx-kinds' }, kindsOf(c, fid)) : null);
}
const KIND_NAME = { inflect: 'forms', gender: 'gender', measure: 'measure words', meaning: 'meanings', build: 'building sentences', transform: 'changing sentences', quiz: 'quiz',
  paradigm: 'tables', analyze: 'analysing forms', morph: 'pieces of words', root: 'roots and patterns', agree: 'agreement', contrast: 'contrasts', parse: 'word roles',
  gloss: 'glosses', proofread: 'finding mistakes', combine: 'joining sentences', word: 'words' };
function kindsOf(c, fid) {
  const kinds = uniq(N.exercises(UI.C, UI.L, c, fid, { auto: true, max: 60 }).map(it => it.kind));
  return kinds.length ? 'Exercises: ' + kinds.map(k => KIND_NAME[k] || k).join(' · ') : '';
}

/* ---------- widgets (exItem → WIDGETS[it.type]) ---------- */
function fbBox(ok, it) { return h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', wordsIn(it.lang, it.why || '')); }
function checkRow(onCheck, onReveal) {
  return h('div', { class: 'row lx-checkrow' }, h('button', { class: 'btn primary lx-check', onclick: onCheck }, 'Check ✓'), h('button', { class: 'btn small ghost lx-reveal', onclick: onReveal }, 'Show me'));
}
/** A choice inside a sentence or a row: a native select (keyboard and screen readers work), foreign options in their script. */
function selectFor(slot, { foreign, c, label }) {
  const s = h('select', { class: 'lx-sel', 'aria-label': label || 'choose', ...(foreign ? { lang: c, dir: dirOf(c) } : explainAttrs()) },
    slot.value == null ? h('option', { value: '' }, '…') : null, ...slot.options.map(o => h('option', { value: o }, foreign && LX(c).language.vowelMarks && UI.prefs.marks === false ? N.stripMarks(c, o) : o)));
  s.value = slot.value ?? '';
  return s;
}
/** A word of a sentence in a widget: font and direction, 🆕 when the learner has not learned it (meaning on hover, its card on tap). */
function unitWord(c, u, unknown) {
  const X = LX(c), isNew = u.l && unknown.includes(u.l), shown = X.language.vowelMarks && UI.prefs.marks === false ? N.stripMarks(c, u.t) : u.t;
  if (!u.l || !X.lex[u.l]) return h('span', { class: 'lx-w', lang: c, dir: dirOf(c) }, shown);
  return h('span', { class: 'lx-w lx-tok' + (isNew ? ' lx-new' : ''), lang: c, dir: dirOf(c), tabindex: '0', title: (isNew ? '🆕 ' : '') + gloss(c, u.l),
    onclick: e => { e.stopPropagation(); wordPopup(c, u.l); }, onkeydown: e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); wordPopup(c, u.l); } } }, shown);
}
const FOREIGN_SLOTS = it => it.kind === 'agree' || (it.kind === 'gloss' && it.reverse);
WIDGETS.slots = (it, done) => {
  const c = it.lang, X = LX(c), box = h('div', { class: 'lx-ex lx-exslots', 'data-kind': it.kind }), un = it.unknown || [];
  noteNew(c, un);
  box.append(h('div', { class: 'lx-q' }, wordsIn(c, it.ask)));
  if (it.kind === 'analyze') box.append(h('div', { class: 'lx-prompt' }, word(c, it.prompt, { sub: false })), it.fixed ? h('div', { class: 'tiny lx-fixed' }, 'Given: ', it.fixed) : null);
  if (it.kind === 'agree') box.append(h('div', { class: 'lx-src' }, X.sentenceById[it.sentences?.[0]] ? sentenceView(c, X.sentenceById[it.sentences[0]], un) : word(c, it.source, { sub: false })), h('div', { class: 'tiny' }, it.sourceGloss, ' → ', h('b', {}, it.gloss)));
  else if (it.gloss) box.append(h('div', { class: 'tiny lx-tr' }, '“', it.gloss, '”'));
  const sels = [], foreign = FOREIGN_SLOTS(it);
  if (it.layout === 'rows') {
    box.append(h('div', { class: 'lx-dims' }, ...it.units.map(u => { const s = selectFor(u.slot, { foreign: false, c, label: u.label }); sels.push(s); return h('label', { class: 'lx-dim' }, h('span', { class: 'lx-dimlabel' }, u.label), s); })));
  } else {
    const line = h('div', { class: 'lx-units', lang: c, dir: dirOf(c) });
    let last = null;
    for (const u of it.units) {
      if (u.p) { if (last) last.querySelector('.lx-unitw')?.append(h('span', { lang: c }, u.t)); continue; }
      const col = h('div', { class: 'lx-unit' + (u.trigger ? ' lx-trigger' : '') + (u.pre ? ' lx-pre' : '') });
      col.append(h('div', { class: 'lx-unitw' }, u.trigger ? [h('s', { lang: c }, u.from), ' → '] : null, unitWord(c, u, un), u.pre ? h('span', { class: 'tiny' }, '‑') : null));
      if (u.slot) { const s = selectFor(u.slot, { foreign, c, label: u.t }); sels.push(s); col.append(s); }
      else if (u.gloss) col.append(h('div', { class: 'lx-ugloss', ...explainAttrs() }, u.gloss));
      line.append(col); last = col;
    }
    box.append(line);
  }
  if (it.kind === 'gloss' && !it.reverse) box.append(h('div', { class: 'tiny lx-legend' }, legend(it)));
  let over = false;
  const finish = (ok, shown) => {
    over = true; sels.forEach(s => s.disabled = true);
    it.given = sels.map(s => s.value); box.dataset.given = JSON.stringify(it.given);
    box.querySelector('.lx-checkrow')?.remove();
    box.append(fbBox(ok, it)); done(ok);
  };
  const check = () => {
    if (over) return;
    const r = N.checkSlots(it, sels.map(s => s.value));
    sels.forEach((s, i) => s.classList.add(r.wrong.includes(i) ? 'wrong' : 'right'));
    finish(r.ok);
  };
  const reveal = () => {
    if (over) return;
    const want = it.combos ? it.combos[0] : it.units.filter(u => u.slot).map(u => u.slot.answer[0]);
    sels.forEach((s, i) => { if (s.value !== want[i]) s.classList.add('wrong'); s.value = want[i]; s.classList.add('shown'); });
    finish(false);
  };
  box.append(checkRow(check, reveal));
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'SELECT') { e.preventDefault(); check(); } });
  setTimeout(() => sels[0]?.focus(), 30);
  return box;
};
/** The tags of a gloss line, spelled out (ACC = accusative …). */
function legend(it) {
  const tags = uniq(it.units.filter(u => u.slot).flatMap(u => u.slot.options).flatMap(o => o.split('.').slice(1))).filter(t => /^[A-Z0-9]+$/.test(t));
  const lab = { NOM: 'nominative', ACC: 'accusative', DAT: 'dative', GEN: 'genitive', SG: 'singular', PL: 'plural', DU: 'dual', COLL: 'collective', MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter',
    DEF: 'definite', INDF: 'indefinite', PRS: 'present', PST: 'past', FUT: 'future', IND: 'indicative', SBJV: 'subjunctive', JUS: 'jussive', IMP: 'imperative', NFIN: 'infinitive', PTCP: 'participle',
    CONST: 'construct state', STRG: 'strong ending', WEAK: 'weak ending', MIX: 'mixed ending', CMPR: 'comparative', SPRL: 'superlative', PFV: 'perfective', IPFV: 'imperfective', FORM: 'formal', INFM: 'informal', 1: '1st person', 2: '2nd person', 3: '3rd person' };
  return tags.length ? '🔤 ' + tags.map(t => `${t} = ${lab[t] || t}`).join(' · ') : '';
}
/* paradigm: a table with hidden cells */
WIDGETS.table = (it, done) => {
  const c = it.lang, X = LX(c), box = h('div', { class: 'lx-ex lx-extable', 'data-kind': it.kind }), sels = [];
  box.append(h('div', { class: 'lx-q' }, wordsIn(c, it.ask)), h('div', { class: 'lx-prompt' }, word(c, it.prompt, { lex: X.lex[it.lex] })), h('div', { class: 'tiny lx-tr' }, gloss(c, it.lex)));
  const rows = it.rows.map(r => {
    let cell;
    if (r.hidden) { const s = selectFor({ options: r.options }, { foreign: true, c, label: r.label }); sels.push(s); cell = s; }
    else cell = word(c, r.form, { sub: false });
    return h('tr', {}, h('th', { scope: 'row' }, r.label), h('td', {}, cell));
  });
  box.append(h('div', { class: 'lx-ptab' }, h('table', {}, h('tbody', {}, ...rows))));
  let over = false;
  const finish = ok => { over = true; sels.forEach(s => s.disabled = true); it.given = sels.map(s => s.value); box.dataset.given = JSON.stringify(it.given); box.querySelector('.lx-checkrow')?.remove(); box.append(fbBox(ok, it)); done(ok); };
  const check = () => { if (over) return; const r = N.checkTable(it, sels.map(s => s.value)); sels.forEach((s, i) => s.classList.add(r.wrong.includes(i) ? 'wrong' : 'right')); finish(r.ok); };
  const reveal = () => { if (over) return; it.rows.filter(r => r.hidden).forEach((r, i) => { if (sels[i].value !== N.nfc(r.form)) sels[i].classList.add('wrong'); sels[i].value = N.nfc(r.form); sels[i].classList.add('shown'); }); finish(false); };
  box.append(checkRow(check, reveal));
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'SELECT') { e.preventDefault(); check(); } });
  setTimeout(() => sels[0]?.focus(), 30);
  return box;
};
/* proofread: tap the wrong word, then choose the right form */
WIDGETS.proofread = (it, done) => {
  const c = it.lang, X = LX(c), box = h('div', { class: 'lx-ex lx-exproof', 'data-kind': it.kind }), un = it.unknown || [];
  noteNew(c, un);
  box.append(h('div', { class: 'lx-q' }, 'One word is wrong — tap it, then fix it.'), h('div', { class: 'tiny lx-tr' }, '“', it.gloss, '”'));
  const line = h('div', { class: 'lx-proofline', lang: c, dir: dirOf(c) }), sp = X.language.tokenJoin !== 'none';
  let over = false, at = null;
  const btns = it.units.map((u, i) => u.p ? h('span', { lang: c }, u.t) : h('button', { class: 'lx-pword' + (u.l && un.includes(u.l) ? ' lx-new' : ''), lang: c, 'data-i': i, title: u.l && un.includes(u.l) ? '🆕 ' + gloss(c, u.l) : '', onclick: () => pick(i) },
    X.language.vowelMarks && UI.prefs.marks === false ? N.stripMarks(c, u.t) : u.t));
  btns.forEach((b, i) => line.append(i && sp && !it.units[i].p ? ' ' : '', b));
  box.append(line);
  const end = (ok, at2, fix) => {
    over = true; btns.forEach(b => { if (b.tagName === 'BUTTON') b.disabled = true; });
    it.given = { at: at2, fix }; box.dataset.given = JSON.stringify(it.given);
    box.querySelector('.lx-checkrow')?.remove(); box.append(fbBox(ok, it)); done(ok);
  };
  function pick(i) {
    if (over || at != null) return;
    at = i;
    if (i !== it.wrongAt) { btns[i].classList.add('wrong'); btns[it.wrongAt].classList.add('right'); return end(false, i, null); }
    btns[i].classList.add('found');
    const opts = it.fix.options.map(o => ({ label: word(c, o, { sub: false }), v: o, ok: it.fix.accept.includes(N.nfc(o)) }));
    box.insertBefore(h('div', { class: 'lx-q' }, 'The right form?'), box.querySelector('.lx-checkrow'));
    box.insertBefore(options(opts, (o, b, wrap) => { const r = N.checkProofread(it, i, o.v); b.classList.add(r.ok ? 'right' : 'wrong'); if (!r.ok) markOpts(wrap, j => opts[j].ok); end(r.ok, i, o.v); }), box.querySelector('.lx-checkrow'));
    setTimeout(() => box.querySelector('.lx-opts .lx-opt')?.focus(), 30);
  }
  box.append(h('div', { class: 'row lx-checkrow' }, h('button', { class: 'btn small ghost lx-reveal', onclick: () => { if (over) return; btns[it.wrongAt].classList.add('right'); end(false, null, null); } }, 'Show me')));
  setTimeout(() => btns.find(b => b.tagName === 'BUTTON')?.focus(), 30);
  return box;
};
/* contrast: a meaning → which of the sentences says it, with the reason */
WIDGETS.contrast = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-excontrast', 'data-kind': it.kind });
  noteNew(c, it.unknown);
  const opts = it.options.map(o => ({ label: word(c, o, { sub: false }), ok: o === it.answer, v: o }));
  box.append(h('div', { class: 'lx-q' }, it.ask), h('div', { class: 'lx-prompt lx-meaning', ...explainAttrs() }, '“', it.prompt, '”'),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); it.given = o.v; box.append(fbBox(!!o.ok, it)); done(!!o.ok); }));
  return box;
};
/* morph_build and combine: tiles, as when building a sentence */
WIDGETS.morph = (it, done) => {
  const box = exBuild({ ...it, type: 'build' }, done); box.dataset.kind = 'morph';
  const q = box.querySelector('.lx-q'); if (q) q.textContent = 'Put the pieces together, in order:';
  const p = box.querySelector('.lx-prompt'); if (p) { p.innerHTML = ''; p.append(...wordsIn(it.lang, it.gloss)); }
  return box;
};
WIDGETS.combine = (it, done) => {
  const c = it.lang, X = LX(c), box = exBuild({ ...it, type: 'build' }, done); box.dataset.kind = 'combine';
  const q = box.querySelector('.lx-q'); if (q) q.textContent = `Join the two sentences into one with “${it.connector}” (${it.connectorGloss}):`;
  const srcs = h('ol', { class: 'lx-list lx-sources' }, ...(it.sentences || []).slice(0, 2).map((id, i) => h('li', {}, X.sentenceById[id] ? sentenceView(c, X.sentenceById[id], it.unknown || []) : word(c, it.sources[i], { sub: false }), h('div', { class: 'tiny' }, it.sourceGlosses?.[i] || ''))));
  q?.after(srcs);
  return box;
};

function toast(msg) { document.querySelector('.lx-toast')?.remove(); const t = h('div', { class: 'lx-toast', role: 'status' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3500); }
/* ---------- practice blocks: items of one or more functions, every answer recorded (practiceFunction) ---------- */
function practiseFn(c, fid) {
  const items = N.exercises(UI.C, UI.L, c, fid, { auto: true, max: 10 });
  if (!items.length) return toast('Nothing to practise yet with the words you know.');
  runPractice(items, { title: `${info(c).flag} ${UI.C.functions[fid]?.title || fid}`, back: location.hash || '#/', again: () => practiseFn(c, fid) });
}
function practiseMixed(c) {
  const fids = N.grammarLane(UI.C, UI.L, c).filter(x => x.state !== 'mastered' && ['ready', 'thin'].includes(x.feasibility.state)).map(x => x.fn);
  const items = N.practiceBlock(UI.C, UI.L, c, shuffle(fids).slice(0, 6), { max: 12 });
  if (!items.length) return toast('Nothing to practise yet with the words you know.');
  runPractice(items, { title: `${info(c).flag} 📐 Mixed grammar`, back: location.hash || '#/', again: () => practiseMixed(c) });
}
function runPractice(items, { title, back = '#/', again = null }) {
  metNew.clear();
  const m = $('.lx-main'), bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  m.innerHTML = ''; m.append(h('div', { class: 'view lx-view lx-session lx-practice' }, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go(back); } }, '✕ Stop'), h('b', { class: 'tiny' }, title), bar), stage));
  const queue = items.map(it => ({ it })), byFn = {}, retried = new Set(); let total = queue.length, i = 0;
  const day = today();
  const nextBtn = () => { const b = h('button', { class: 'btn primary lx-next' }, 'Next →'); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30); };
  function next() {
    bar.firstChild.style.width = Math.round(i / Math.max(total, 1) * 100) + '%';
    const a = queue.shift(); if (!a) return finish();
    i++; stage.innerHTML = '';
    UI.current = { kind: 'item', it: a.it };
    const done = ok => {
      const it = a.it;
      if (it.fn) { N.practiceFunction(UI.C, UI.L, it.lang, it.fn, ok ? 1 : 0, 1, day); const R = byFn[it.lang + '|' + it.fn] = byFn[it.lang + '|' + it.fn] || { c: 0, n: 0, lang: it.lang, fn: it.fn }; R.n++; if (ok) R.c++; }
      save();
      const key = JSON.stringify([it.kind, it.lex, it.sentence, it.prompt]);
      if (!ok && !a.retry && !retried.has(key)) { retried.add(key); queue.splice(Math.min(3, queue.length), 0, { it, retry: true }); total++; }
      nextBtn();
    };
    const ex = exItem(a.it, done);
    Object.assign(ex.dataset, { kind: a.it.kind, lang: a.it.lang });
    stage.append(h('div', { class: 'tiny lx-which' }, info(a.it.lang).flag, ' ', info(a.it.lang).name, ' · ', UI.C.functions[a.it.fn]?.title || '', a.retry ? ' · once more' : ''), ex);
  }
  function finish() {
    save(true); bar.firstChild.style.width = '100%'; stage.innerHTML = ''; UI.current = null;
    const rows = Object.values(byFn);
    stage.append(h('div', { class: 'lx-result lx-practicedone' }, h('h2', {}, '📐 Practice done'),
      h('ul', { class: 'lx-list' }, ...rows.map(R => h('li', { 'data-fn': R.fn, 'data-lang': R.lang }, info(R.lang).flag, ' ', UI.C.functions[R.fn]?.title || R.fn, `: ${R.c}/${R.n} — `, FN_STATE[N.functionState(UI.C, UI.L, R.lang, R.fn)]))),
      newWordsList(),
      h('div', { class: 'row' }, again ? h('button', { class: 'btn primary', onclick: again }, '↻ Again') : null, h('button', { class: 'btn', onclick: () => go(back) }, 'Back'))));
  }
  document.onkeydown = e => {
    if (!$('.lx-practice')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input|select/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}

/* ---------- the 📐 grammar lane ---------- */
function laneRow(c, x) {
  const can = ['ready', 'thin'].includes(x.feasibility.state);
  return h('div', { class: 'lx-lanerow s-' + x.feasibility.state, 'data-fn': x.fn, 'data-lang': c, 'data-state': x.state },
    h('div', { class: 'lx-lanetitle' }, h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(x.fn)}/${c}`) }, x.title),
      x.lesson && UI.C.nodes[x.lesson]?.step != null ? h('span', { class: 'lx-step' }, stepLabel(UI.C.nodes[x.lesson])) : null),
    h('div', { class: 'lx-lanemeta' }, h('span', { class: 'lx-badge lx-fnstate' }, FN_STATE[x.state]), h('span', { class: 'lx-light' }, feasText(c, x.feasibility)),
      can ? h('button', { class: 'btn small primary lx-practise', onclick: () => practiseFn(c, x.fn) }, '▶ Practise') : null));
}
const toPractise = lane => lane.filter(x => x.state !== 'mastered' && ['ready', 'thin'].includes(x.feasibility.state)).sort((a, b) => ['practicing', 'new', 'solid'].indexOf(a.state) - ['practicing', 'new', 'solid'].indexOf(b.state));
/** On the home: per language, what the open lessons teach, how far each point is and what can be practised now. */
function grammarLaneHome() {
  const box = h('section', { class: 'lx-glane' }, h('h2', { class: 'lx-h2' }, '📐 Grammar lane'));
  let any = false;
  for (const c of activeLangs()) {
    const lane = N.grammarLane(UI.C, UI.L, c); if (!lane.length) continue;
    any = true;
    const n = s => lane.filter(x => x.state === s).length, ready = toPractise(lane);
    box.append(h('div', { class: 'lx-card lx-laneh', 'data-lang': c },
      h('div', { class: 'row' }, h('b', {}, info(c).flag, ' ', info(c).name), h('span', { class: 'tiny' }, `${lane.length} point${lane.length === 1 ? '' : 's'} · ${FN_STATE.new} ${n('new')} · ${FN_STATE.practicing} ${n('practicing')} · ${FN_STATE.solid} ${n('solid')} · ${FN_STATE.mastered} ${n('mastered')}`),
        h('span', { class: 'spacer' }), ready.length ? h('button', { class: 'btn small primary lx-mixed', onclick: () => practiseMixed(c) }, '▶ Mixed practice') : null,
        h('button', { class: 'btn small ghost', onclick: () => go('#/grammar/' + c) }, 'All →')),
      ...ready.slice(0, 3).map(x => laneRow(c, x))));
  }
  if (!any) box.append(h('p', { class: 'tiny' }, 'The grammar of your lessons appears here once a lesson is open.'));
  return box;
}
VIEWS.grammar = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, lane = N.grammarLane(UI.C, UI.L, c);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '📐 Grammar', h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/grammar/' + x); }),
      toPractise(lane).length ? h('button', { class: 'btn primary lx-mixed', onclick: () => practiseMixed(c) }, '▶ Mixed practice') : null),
    h('p', { class: 'tiny' }, 'The points of your open lessons. 🟢 ready · 🟡 thin (few sentences with your words yet) · 🔒 needs a lesson or words first. Practising records how sure you are: new → practising → solid → mastered.'));
  if (!lane.length) return v.append(h('p', { class: 'lx-note' }, `No lesson is open yet in ${info(c).name}.`));
  v.append(h('div', { class: 'lx-lane' }, ...lane.map(x => laneRow(c, x))));
};

/* ---------- the daily session, step 3 (§7.5): one function with the words just learned ---------- */
function sessionGrammarItems(plan) {
  const learn = plan.steps.find(s => s.kind === 'learn'), gram = plan.steps.find(s => s.kind === 'grammar');
  try {
    if (learn) {
      const words = {}; for (const cn of learn.concepts) for (const e of cn.langs) (words[e.lang] = words[e.lang] || []).push(e.lex);
      const r = N.sessionGrammar(UI.C, UI.L, { langs: Object.keys(words), words, max: 5, limit: 12 });
      if (r) return r.items.map(it => ({ kind: 'item', it, lang: it.lang }));
    }
    if (gram) return N.exercises(UI.C, UI.L, gram.lang, gram.fn, { auto: true, max: 5 }).map(it => ({ kind: 'item', it, lang: it.lang }));
  } catch (e) { console.warn('session grammar', e); }
  return [];
}
Object.assign(window.NoemaLangUI, { grammar: { runPractice, practiseFn, practiseMixed, grammarLaneHome, sessionGrammarItems, feasibilityBar, runSession } });
