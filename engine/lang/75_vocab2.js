/* ---------- P5v — vocabulary depth (docs/LANGUAGES.md §6.2 “Deepening”): the item widgets and the views ----------
   The items come from langcore.deepItems (roots, compounds, semantic splits, collocations, confusables, intensity, register, nuance,
   connotation, idioms, cloze, senses, origins) — every answer from the stored words and profiles. Each answer is a review of the word
   (langcore.deepRecord: R or P track; a sorting item reviews every word on it).
   🏋️ practise this word (#/deep/<lang>/<lexeme>, from the word card) · 🏋️ deepen (#/deepen/<node>/<lang>, from the node and lesson pages)
   · 1–3 deepening items at the end of the daily session (sessionDeep, §7.5). */
const DEEP_LABEL = { root_family: '🌳 Root families', compound_split: '🧱 Compounds', sense_split: '🔀 Which word here?', collocation: '🤝 Goes with', confusables: '👯 Easily mixed up',
  intensity_scale: '📶 Strength', register_pick: '🎭 Register', nuance_pick: '🔍 Nuance', connotation: '💭 Feeling', idiom_meaning: '🗝️ Idioms and sayings', example_cloze: '✏️ In context',
  sense_pick: '🧭 Which meaning?', etymology_link: '🏺 Where it comes from' };
const MET_DEEP = ['seen', 'learning', 'known_r', 'known_p', 'mastered'];
/** Explanation parts: text in the explanation language (Arabic, Hebrew, Chinese runs tagged) and foreign words {w, lang} with their lang and dir. */
function richText(parts, c) { return (Array.isArray(parts) ? parts : [parts]).map(p => p && typeof p === 'object' ? word(UI.C.lang[p.lang] ? p.lang : c, p.w, { sub: false }) : wordsIn(c, String(p ?? ''))); }
/** A profile sentence from its tokens: the trained word marked (or a gap), course words with their meaning and card on tap (🆕 when not known yet), words outside the course marked. */
function deepTokens(c, toks, fill = null, interactive = true) {
  const X = LX(c), sp = X.language.tokenJoin !== 'none', show = t => X.language.vowelMarks && UI.prefs.marks === false ? N.stripMarks(c, t) : t, out = [];
  let glue = true;
  for (const k of toks || []) {
    let el;
    if (k.gap) el = h('span', { class: 'lx-gapw' }, show(k.pre || ''), h('span', { class: 'lx-gap' + (fill ? ' filled' : ''), 'aria-label': fill ? null : 'gap' }, fill ? show(fill) : '＿＿＿'), show(k.post || ''));
    else if (k.p) el = document.createTextNode(k.t);
    else if (k.target) el = h('mark', { class: 'lx-target' }, show(k.t));
    else if (k.l && X.lex[k.l] && !interactive) el = h('span', { class: 'lx-w' + (k.new ? ' lx-new' : ''), title: (k.new ? '🆕 ' : '') + gloss(c, k.l) }, show(k.t));   // inside a button: the 🆕 words open from the line above
    else if (k.l && X.lex[k.l]) {
      const open = e => { e.stopPropagation(); wordPopup(c, k.l); };
      el = h('span', { class: 'lx-w lx-tok' + (k.new ? ' lx-new' : ''), tabindex: '0', role: 'button', title: (k.new ? '🆕 ' : '') + gloss(c, k.l), onclick: open, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } } }, show(k.t));
    } else el = h('span', { class: k.out ? 'lx-out' : '', title: k.out ? 'not in the course yet — see the translation' : null }, show(k.t));
    if (out.length && sp && !glue && k.p !== true) out.push(' ');
    out.push(el); glue = k.p === 'open';
  }
  return h('span', { class: 'lx-sent lx-deepsent', lang: c, dir: X.language.dir || 'ltr' }, ...out);
}
/** The 🆕 words of an item: each opens its card. */
function newWordsLine(c, ids) {
  ids = (ids || []).filter(l => LX(c).lex[l]); if (!ids.length) return null;
  noteNew(c, ids);
  return h('div', { class: 'tiny lx-newwords' }, '🆕 ', ...ids.flatMap((l, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, word(c, LX(c).lex[l].lemma, { sub: false })), ' = ' + gloss(c, l)]));
}
const deepFeedback = (it, ok) => h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', ...richText(it.why || it.answer, it.lang));
const deepOpt = (it, o, lang) => lang ? word(lang, o, { sub: false }) : h('span', { class: 'lx-optx' }, ...wordsIn(it.lang, o));   // one flex item, however mixed the text
function deepPrompt(it, fill = null) {
  const c = it.lang, pr = it.prompt || {};
  if (pr.word) return h('div', { class: 'lx-prompt' }, word(c, pr.word, { lex: LX(c).lex[it.lex] }));
  if (pr.sentence) return h('div', { class: 'lx-prompt lx-deepq' }, deepTokens(c, pr.sentence, fill));
  return h('div', { class: 'lx-prompt lx-meaning lx-deeptext' }, ...richText(pr.text || '', c));
}

/** vpick: one question, several answers (keyboard 1–9 through the runners). */
WIDGETS.vpick = (it, done) => {
  const c = it.lang, pr = it.prompt || {}, box = h('div', { class: 'lx-ex lx-deep lx-vpick', 'data-kind': it.kind, 'data-type': 'vpick' });
  let promptEl = deepPrompt(it);
  const after = pr.trAfter ? h('div', { class: 'lx-tr lx-trafter', hidden: true }, pr.trAfter) : null;
  box.append(h('div', { class: 'lx-q' }, ...richText(it.ask, c)), promptEl,
    pr.tr ? h('div', { class: 'lx-tr' }, pr.tr) : null, pr.hint ? h('div', { class: 'lx-chips' }, h('span', { class: 'lx-badge reg' }, '🎭 ' + pr.hint)) : null, pr.lit ? h('div', { class: 'tiny' }, 'literally: “' + pr.lit + '”') : null, newWordsLine(c, it.unknown));
  const opts = it.options.map(o => ({ o, label: deepOpt(it, o, it.optLang), ok: o === it.answer }));
  box.append(options(opts, (o, b, wrap) => {
    b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok);
    if (pr.sentence && ['example_cloze', 'collocation'].includes(it.kind)) { const p2 = deepPrompt(it, it.answer); promptEl.replaceWith(p2); promptEl = p2; }
    if (after) after.hidden = false;
    box.append(deepFeedback(it, o.ok)); done(!!o.ok);
  }));
  if (after) box.append(after);
  return box;
};
/** vsort: tap a card, then its group; a card put in a wrong group counts as wrong for its word (it.perLex). */
WIDGETS.vsort = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-deep lx-vsort', 'data-kind': it.kind, 'data-type': 'vsort' });
  const perLex = {}, chips = h('div', { class: 'lx-sortchips' }), bins = h('div', { class: 'lx-sortbins' }), status = h('div', { class: 'tiny lx-sortstatus' });
  let picked = null, left = it.cards.length, wrong = 0;
  const label = (card, inChip) => card.tokens ? h('span', {}, deepTokens(c, card.tokens, null, !inChip), card.tr ? h('span', { class: 'tiny lx-cardtr' }, ' — ' + card.tr) : null, card.hint ? h('span', { class: 'tiny lx-cardtr' }, ' (' + card.hint + ')') : null) : h('span', {}, word(card.lang || c, card.text, { sub: false }), card.note ? h('span', { class: 'tiny' }, ' ' + card.note) : null);
  for (const card of it.cards) {
    const chip = h('button', { class: 'btn lx-sortchip' + (card.tokens ? ' lx-sortsent' : ''), 'data-id': card.id, 'data-bucket': card.bucket, onclick: () => {
      if (chip.disabled) return; chips.querySelectorAll('.on').forEach(x => x.classList.remove('on')); chip.classList.add('on'); picked = { card, chip }; status.textContent = 'Now its group…'; } }, label(card, true));
    chips.append(chip);
  }
  for (const b of it.buckets) {
    const list = h('div', { class: 'lx-sortlist' });
    const drop = () => {
      if (!picked) { status.textContent = 'Tap a card first.'; return; }
      const { card, chip } = picked;
      if (card.bucket === b.id) {
        if (!(card.lex in perLex)) perLex[card.lex] = true;
        chip.remove(); list.append(h('div', { class: 'lx-sortin' }, label(card, true))); picked = null; left--; status.textContent = left ? `${left} to sort` : '';
        if (!left) { it.perLex = perLex; box.append(deepFeedback(it, !wrong)); done(!wrong); }
      } else { perLex[card.lex] = false; wrong++; bin.classList.add('lx-shake'); setTimeout(() => bin.classList.remove('lx-shake'), 400); status.textContent = 'Not this one — try another group'; }
    };
    const bin = h('div', { class: 'lx-sortbin', 'data-group': b.id, role: 'button', tabindex: '0', onclick: drop, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(); } } },
      h('div', { class: 'lx-sorthead' }, b.lang ? word(b.lang, b.label, { sub: false }) : b.label), list);
    bins.append(bin);
  }
  box.append(h('div', { class: 'lx-q' }, ...richText(it.ask, c)), newWordsLine(c, it.unknown), chips, status, bins);
  return box;
};
/** vorder: tap the words in order (the weakest first). */
WIDGETS.vorder = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-deep lx-vorder', 'data-kind': it.kind, 'data-type': 'vorder' });
  const built = [], slot = h('ol', { class: 'lx-orderlist' }), pool = h('div', { class: 'lx-tiles' }); let over = false;
  const draw = () => { slot.innerHTML = ''; for (const x of built) slot.append(h('li', {}, word(x.card.lang || c, x.card.text, { sub: false }))); };
  const shuffledCards = shuffle(it.cards.map((card, i) => ({ card, i })));
  for (const x of shuffledCards) pool.append(h('button', { class: 'lx-tile1', 'data-i': x.i, onclick: e => {
    if (over || e.currentTarget.disabled) return; e.currentTarget.disabled = true; built.push(x); draw();
    if (built.length === it.cards.length) { over = true; const ok = built.every((y, j) => y.i === j); slot.classList.add(ok ? 'right' : 'wrong'); box.append(deepFeedback(it, ok)); done(ok); }
  } }, word(x.card.lang || c, x.card.text, { sub: false }), x.card.note ? h('span', { class: 'tiny' }, ' ' + x.card.note) : null));
  const undo = h('button', { class: 'btn small ghost', onclick: () => { if (over || !built.length) return; const x = built.pop(); pool.querySelector(`[data-i="${x.i}"]`).disabled = false; draw(); } }, '⌫');
  box.append(h('div', { class: 'lx-q' }, ...richText(it.ask, c)), slot, pool, h('div', { class: 'row' }, undo));
  return box;
};
/** vsteps: questions about one word, one after the other (a compound: where it splits, then its article). */
WIDGETS.vsteps = (it, done) => {
  const c = it.lang, box = h('div', { class: 'lx-ex lx-deep lx-vsteps', 'data-kind': it.kind, 'data-type': 'vsteps' });
  box.append(deepPrompt(it));
  let all = true;
  const step = i => {
    const s = it.steps[i]; if (!s) { box.append(deepFeedback(it, all)); return done(all); }
    const opts = s.options.map(o => ({ o, label: deepOpt(it, o, s.optLang), ok: o === s.answer }));
    box.append(h('div', { class: 'lx-q' }, ...richText(s.ask, c)), options(opts, (o, b, wrap) => {
      b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) { all = false; markOpts(wrap, j => opts[j].ok); } step(i + 1); }));
  };
  step(0);
  return box;
};

/* ---------- running a set of depth items (the views below) ---------- */
function deepRun(holder, items, { again = null } = {}) {
  metNew.clear();
  const stage = h('div', { class: 'lx-stage lx-deeprun' }), bar = h('div', { class: 'lx-progress' }, h('i'));
  holder.append(bar, stage);
  const day = today(); let i = 0, right = 0; const byKind = {};
  const next = () => {
    bar.firstChild.style.width = Math.round(i / items.length * 100) + '%'; stage.innerHTML = '';
    if (i >= items.length) {
      save(true);
      stage.append(h('div', { class: 'lx-result lx-deepdone' }, h('h2', {}, `🏋️ ${right} of ${items.length} right`),
        h('ul', { class: 'lx-list' }, ...Object.entries(byKind).map(([k, r]) => h('li', {}, `${DEEP_LABEL[k] || k}: ${r.c} / ${r.n}`))),
        h('p', { class: 'tiny' }, 'Every answer counts as a review of its word.'), newWordsList(),
        h('div', { class: 'row' }, again ? h('button', { class: 'btn primary', onclick: again }, '↻ Again') : null, h('button', { class: 'btn', onclick: () => history.length > 1 ? history.back() : go('#/') }, '← Back'))));
      return;
    }
    const it = items[i++];
    const el = exItem(it, ok => {
      N.deepRecord(UI.C, UI.L, it.lang, it, ok, day, it.perLex); save();
      if (ok) right++; const t = byKind[it.kind] = byKind[it.kind] || { c: 0, n: 0 }; t.n++; if (ok) t.c++;
      const b = h('button', { class: 'btn primary lx-next' }, i < items.length ? 'Next →' : 'Finish'); b.onclick = next;
      stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30);
    });
    Object.assign(el.dataset, { kind: it.kind, lang: it.lang, lex: it.lex });
    UI.current = { kind: 'deep', it };
    stage.append(h('div', { class: 'tiny lx-which' }, info(it.lang).flag, ' ', DEEP_LABEL[it.kind] || it.kind, ' · ', word(it.lang, LX(it.lang).lex[it.lex].lemma, { sub: false })), el);
  };
  document.onkeydown = e => {
    if (!stage.isConnected) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input|select|textarea/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}
/** The word profiles arrive after the course opens: wait for them (a few seconds at most), then draw. */
function whenProfiles(c, draw, v) {
  const ready = () => UI.profiles || Object.values(LX(c).lex).some(x => x.profile);
  if (ready()) return draw();
  v.append(h('p', { class: 'lx-note lx-wait' }, '⏳ Loading the word profiles…'));
  const hash = location.hash; let n = 0;
  const t = setInterval(() => { if (location.hash !== hash) return clearInterval(t); if (ready() || ++n > 50) { clearInterval(t); render(); } }, 200);
}
const hasDepthData = x => !!(x.profile || x.root || x.compound || (x.contrasts || []).length);
/** 🏋️ on the word card (the types its data allows). */
function deepButton(c, lid) {
  const x = LX(c)?.lex[lid]; if (!x || !hasDepthData(x) || document.querySelector('.lx-session')) return null;
  return h('button', { class: 'btn small lx-deepbtn', onclick: () => { document.querySelector('.lx-pop')?.remove(); go(`#/deep/${c}/${encodeURIComponent(lid)}`); } }, '🏋️ Practise this word');
}
/** 🏋️ deepen on a node or lesson page: when the learner has met some of its words in this language. */
function deepenButton(nid, c) {
  const k = N.known(UI.C, UI.L, c), met = (LX(c).byNode[nid] || []).filter(id => MET_DEEP.includes(k.state[id]) && hasDepthData(LX(c).lex[id]));
  return met.length ? h('button', { class: 'btn small lx-deepenbtn', onclick: () => go(`#/deepen/${encodeURIComponent(nid)}/${c}`) }, `🏋️ Deepen (${met.length} word${met.length === 1 ? '' : 's'})`) : null;
}
VIEWS.deep = (v, r) => {
  const c = r.arg, lid = r.arg2, x = UI.C.lang[c]?.lex[lid]; if (!x) return VIEWS.home(v);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 ? history.back() : go('#/w/' + c + '/' + encodeURIComponent(lid)) }, '← Back')),
    h('h1', {}, '🏋️ ', word(c, x.lemma, { lex: x }), h('span', { class: 'tiny' }, ` · ${gloss(c, lid)} · ${info(c).flag} ${info(c).name}`)));
  whenProfiles(c, () => {
    const types = N.deepTypes(UI.C, UI.L, c, lid);
    if (!types.length) return v.append(h('p', { class: 'lx-note' }, 'Nothing to practise in depth for this word yet: its data allows none of the depth exercises (or they need words you have not met).'));
    v.append(h('div', { class: 'lx-chips lx-deeptypes' }, ...types.map(t => h('span', { class: 'lx-badge ctx', 'data-type': t }, DEEP_LABEL[t] || t))));
    const run = () => { v.querySelector('.lx-deephold')?.remove(); const hold = h('div', { class: 'lx-deephold' }); v.append(hold); deepRun(hold, N.deepItems(UI.C, UI.L, c, [lid], { max: 10 }), { again: run }); };
    run();
  }, v);
};
VIEWS.deepen = (v, r) => {
  const nid = r.arg, n = UI.C.nodes[nid]; if (!n) return VIEWS.home(v);
  const c = r.arg2 && UI.C.lang[r.arg2] ? r.arg2 : UI.lang;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid) }, '← ' + n.title)),
    h('h1', {}, '🏋️ Deepen', h('span', { class: 'tiny' }, ` · ${n.title} · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go(`#/deepen/${encodeURIComponent(nid)}/${x}`); })));
  whenProfiles(c, () => {
    const k = N.known(UI.C, UI.L, c), ids = (LX(c).byNode[nid] || []).filter(id => MET_DEEP.includes(k.state[id]));
    if (!ids.length) return v.append(h('p', { class: 'lx-note' }, `Meet some words of this node in ${info(c).name} first.`));
    const run = () => { v.querySelector('.lx-deephold')?.remove(); const hold = h('div', { class: 'lx-deephold' }); v.append(hold);
      const items = N.deepItems(UI.C, UI.L, c, shuffle(ids), { k, max: 12 });
      if (!items.length) return hold.append(h('p', { class: 'lx-note' }, 'Nothing to deepen here yet.'));
      hold.append(h('p', { class: 'tiny' }, `A mixed set over the ${ids.length} word${ids.length === 1 ? '' : 's'} you have met: `, ...uniq(items.map(it => it.kind)).map(t => h('span', { class: 'lx-badge ctx' }, DEEP_LABEL[t] || t))));
      deepRun(hold, items, { again: run }); };
    run();
  }, v);
};
/** The daily session (§7.5): 1–3 deepening items for words already known, at the end (not in “learn / review this node”). */
function sessionDeep(plan, only) {
  if (only) return [];
  const minutes = UI.L.settings.minutes || 20, n = minutes >= 20 ? 3 : minutes >= 10 ? 2 : 1;
  return N.deepenPlan(UI.C, UI.L, { day: today(), languages: activeLangs(), n }).map(d => ({ kind: 'deep', lang: d.lang, lex: d.lex, it: d.item }));
}
