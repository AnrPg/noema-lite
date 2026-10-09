/* ---------- drills of their own (docs/LANGUAGES.md §6.2, P3b) ----------
   🧩 field sorting: the words of a field that the learner has met, sorted into the field's subgroups (tap a word, then its group).
   🔁 principal parts: what is memorized with a word (plural, article, gender, root, pinyin, measure word …), asked one part at a time.
   Both record their answers as recognition reviews of the words (first try right = good, otherwise again). */
const MET = ['seen', 'learning', 'known_r', 'known_p', 'mastered'];

/** The words of a field that the learner has met in language c → [{ id, cid, group }] (at most n, the least sure first). */
function sortPool(c, fid, n = 12) {
  const field = UI.C.data.fields.find(f => f.field === fid), X = LX(c), k = N.known(UI.C, UI.L, c), out = [];
  for (const con of field?.concepts || []) for (const id of X.byConcept[con.id] || []) if (MET.includes(k.state[id]) && con.subgroup) out.push({ id, cid: con.id, group: con.subgroup, st: k.state[id] });
  const order = ['seen', 'learning', 'known_r', 'known_p', 'mastered'];
  return shuffle(out).sort((a, b) => order.indexOf(a.st) - order.indexOf(b.st)).slice(0, n);
}
VIEWS.sort = (v, r) => {
  const fid = r.arg, field = UI.C.data.fields.find(f => f.field === fid); if (!field) return VIEWS.home(v);
  const c = UI.lang, X = LX(c), pool = sortPool(c, fid);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/field/' + encodeURIComponent(fid) + '/0') }, '← Field map')),
    h('h1', {}, '🧩 Sort into groups', h('span', { class: 'tiny' }, ` · ${field.title} · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); })));
  if (pool.length < 4) return v.append(h('p', { class: 'lx-note' }, `Meet at least 4 words of this field in ${info(c).name} first (you have met ${pool.length}).`));
  const groups = (field.subgroups || []).filter(g => pool.some(p => p.group === g.id));
  const tries = {}; let picked = null, left = pool.length;
  const chips = h('div', { class: 'lx-sortchips' }), bins = h('div', { class: 'lx-sortbins' }), status = h('div', { class: 'tiny lx-sortstatus' }, `${left} to sort`);
  const finish = () => {
    const day = today(); let right = 0;
    for (const p of pool) { const ok = !tries[p.id]; if (ok) right++; N.review(UI.C, UI.L, c, p.id, 'r', ok ? 'good' : 'again', day); }
    save(); status.textContent = '';
    v.append(h('div', { class: 'lx-card lx-sortdone' }, h('b', {}, `✅ ${right} of ${pool.length} right the first time`), ' ',
      h('button', { class: 'btn small primary', onclick: () => render() }, '↻ Again'), ' ', h('button', { class: 'btn small', onclick: () => go('#/field/' + encodeURIComponent(fid) + '/0') }, 'Field map')));
  };
  for (const p of pool) {
    const chip = h('button', { class: 'btn lx-sortchip', 'data-id': p.id, onclick: () => { if (chip.disabled) return; chips.querySelectorAll('.on').forEach(x => x.classList.remove('on')); chip.classList.add('on'); picked = { p, chip }; } }, word(c, X.lex[p.id].lemma, { sub: false }));
    chips.append(chip);
  }
  for (const g of groups) {
    const list = h('div', { class: 'lx-sortlist' });
    const bin = h('div', { class: 'lx-sortbin', 'data-group': g.id, role: 'button', tabindex: '0', onclick: () => {
      if (!picked) return;
      const { p, chip } = picked;
      if (p.group === g.id) { chip.disabled = true; chip.classList.remove('on'); chip.classList.add('right'); list.append(h('span', { class: 'lx-sortin' }, word(c, X.lex[p.id].lemma, { sub: false }), h('span', { class: 'tiny' }, ' ' + UI.C.concepts[p.cid].gloss))); chip.remove(); picked = null; left--; status.textContent = left ? `${left} to sort` : ''; if (!left) finish(); }
      else { tries[p.id] = (tries[p.id] || 0) + 1; bin.classList.add('lx-shake'); setTimeout(() => bin.classList.remove('lx-shake'), 400); status.textContent = `Not ${g.title.toLowerCase()} — try another group`; }
    } }, h('div', { class: 'lx-sorthead' }, (SUB_EMOJI[g.id] || '') + ' ' + g.title), list);
    bins.append(bin);
  }
  v.append(h('p', { class: 'tiny' }, 'Tap a word, then the group it belongs to.'), chips, status, bins);
};

/** Words of language c the learner has met that have something to memorize besides the meaning → [{ id, parts }] */
function partsPool(c) {
  const X = LX(c), k = N.known(UI.C, UI.L, c), out = [];
  for (const [id, x] of Object.entries(X.lex)) {
    if (!MET.includes(k.state[id])) continue;
    const parts = N.principalParts(UI.C, c, x).filter(([l]) => l !== 'transliteration');
    if (parts.length) out.push({ id, parts });
  }
  return out;
}
VIEWS.parts = (v, r) => {
  const c = UI.C.lang[r.arg] ? r.arg : UI.lang, X = LX(c), pool = shuffle(partsPool(c)).slice(0, 10);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, '🔁 Principal parts', h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).name}`)),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/parts/' + x); })));
  if (!pool.length) return v.append(h('p', { class: 'lx-note' }, `Nothing to drill yet in ${info(c).name}: learn some words first.`));
  // every value a label takes among the words met: the distractors
  const byLabel = {}; for (const p of partsPool(c)) for (const [l, val] of p.parts) (byLabel[l] = byLabel[l] || new Set()).add(val);
  const stage = h('div', { class: 'lx-stage' }); v.append(stage);
  let i = 0, right = 0; const day = today();
  const next = () => {
    stage.innerHTML = '';
    if (i >= pool.length) { save(); return stage.append(h('div', { class: 'lx-card lx-sortdone' }, h('b', {}, `✅ ${right} of ${pool.length}`), ' ', h('button', { class: 'btn small primary', onclick: () => render() }, '↻ Again'))); }
    const p = pool[i++], x = X.lex[p.id], [label, val] = p.parts[Math.floor(Math.random() * p.parts.length)];
    const others = shuffle([...(byLabel[label] || [])].filter(o => o !== val)).slice(0, 3);
    const box = h('div', { class: 'lx-ex lx-exparts', 'data-kind': 'parts', 'data-lex': p.id, 'data-label': label });
    if (!others.length) {   // nothing to choose among: show it and go on
      box.append(h('div', { class: 'lx-prompt' }, word(c, x.lemma, { lex: x })), h('div', { class: 'lx-q' }, `${label}: `, /[֐-ۿ一-鿿]/.test(val) ? word(c, val, { sub: false }) : val), h('button', { class: 'btn primary lx-next', onclick: next }, 'Next →'));
      return stage.append(box);
    }
    const opts = shuffle([{ val, ok: true }, ...others.map(o => ({ val: o }))]);
    box.append(h('div', { class: 'lx-prompt' }, word(c, x.lemma, { lex: x }), h('div', { class: 'tiny' }, gloss(c, p.id))), h('div', { class: 'lx-q' }, `Its ${label}?`),
      options(opts.map(o => ({ ...o, label: /[֐-ۿ一-鿿]/.test(o.val) ? word(c, o.val, { sub: false }) : o.val })), (o, b, wrap) => {
        b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, j => opts[j].ok); if (o.ok) right++;
        N.review(UI.C, UI.L, c, p.id, 'r', o.ok ? 'good' : 'again', day); save();
        box.append(h('div', { class: 'row' }, h('button', { class: 'btn primary lx-next', onclick: next }, 'Next →')));
      }));
    stage.append(box);
  };
  next();
};
