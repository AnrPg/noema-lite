/* ---------- exercises of the vocabulary lane (docs/LANGUAGES.md §6.2) ---------- */
const clusters = s => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map(x => x.segment); } catch (e) { return [...s]; } };

/** Other words of the same language to compare with: same subgroup first, then the same field, then anything. */
function neighbours(c, lid, n, pred = () => true) {
  const X = LX(c), me = X.lex[lid], cid = (me.senses || [])[0], con = UI.C.concepts[cid] || {};
  const pool = Object.values(X.lex).filter(x => x.id !== lid && pred(x) && !(x.senses || []).some(s => (me.senses || []).includes(s)));
  const score = x => { const k = UI.C.concepts[(x.senses || [])[0]] || {}; return (k.subgroup && k.subgroup === con.subgroup ? 0 : k.field && k.field === con.field ? 1 : 2) + (x.pos === me.pos ? 0 : 3) + Math.random(); };
  return pool.sort((a, b) => score(a) - score(b)).slice(0, n);
}
function feedback(box, ok, c, lid, extra) {
  box.append(h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', word(c, LX(c).lex[lid].lemma, { lex: LX(c).lex[lid] }), ' — ', gloss(c, lid), extra ? h('div', { class: 'tiny' }, extra) : null));
}
function options(list, onPick) {
  const wrap = h('div', { class: 'lx-opts' });
  list.forEach((o, i) => wrap.append(h('button', { class: 'lx-opt', 'data-k': i + 1, onclick: e => { if (wrap.dataset.done) return; wrap.dataset.done = 1; onPick(o, e.currentTarget, wrap); } }, h('span', { class: 'lx-k' }, i + 1), o.label)));
  return wrap;
}
function markOpts(wrap, isRight) { [...wrap.children].forEach((b, i) => { if (isRight(i)) b.classList.add('right'); }); }

/** recognize: the word → its meaning (recognition track). */
function exRecognize(c, lid, done) {
  const X = LX(c), me = X.lex[lid], box = h('div', { class: 'lx-ex lx-exrec' });
  const right = gloss(c, lid);
  const opts = shuffle([{ label: right, ok: true }, ...uniq(neighbours(c, lid, 8).map(x => gloss(c, x.id))).filter(g => g && g !== right).slice(0, 3).map(g => ({ label: g }))]);
  box.append(h('div', { class: 'lx-q' }, 'What does it mean?'), h('div', { class: 'lx-prompt' }, word(c, me.lemma, { lex: me })),
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); feedback(box, !!o.ok, c, lid); done(!!o.ok); }));
  return box;
}
/** picture_name (§6.2): the picture of the concept → which word is it? (reviews of words whose concept has a picture) */
const hasPic = (c, lid) => { const cid = (LX(c).lex[lid].senses || [])[0], con = cid && UI.C.concepts[cid]; return !!(con?.media && UI.C.data.media?.[con.media]); };
function exPicture(c, lid, done) {
  const X = LX(c), me = X.lex[lid], box = h('div', { class: 'lx-ex lx-expic' });
  const opts = shuffle([{ id: lid, ok: true }, ...neighbours(c, lid, 8).filter(x => x.lemma !== me.lemma).slice(0, 3).map(x => ({ id: x.id }))]);
  box.append(h('div', { class: 'lx-q' }, `What is it in ${info(c).name}?`), h('div', { class: 'lx-prompt' }, conceptPic(me.senses[0], 'lx-bigemoji')));
  box.append(options(opts.map(o => ({ ...o, label: word(c, X.lex[o.id].lemma, { sub: false }) })), (o, b, wrap) => {
    b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, j => opts[j].ok); feedback(box, !!o.ok, c, lid); done(!!o.ok); }));
  return box;
}
/** produce: the meaning → the word. Spelled with letter tiles (any script) — or chosen, for long words. */
function exProduce(c, lid, done) {
  const X = LX(c), me = X.lex[lid], box = h('div', { class: 'lx-ex lx-exprod' });
  const cid = (me.senses || [])[0];
  box.append(h('div', { class: 'lx-q' }, `In ${info(c).name}?`), h('div', { class: 'lx-prompt lx-meaning' }, cid ? conceptPic(cid, 'lx-exemoji') : '', ' ', gloss(c, lid)));
  const parts = clusters(me.lemma).filter(t => t.trim());   // multi-word words: the spaces are not tiles
  const afterWord = ok => extraCheck(c, lid, box, ok2 => { feedback(box, ok && ok2, c, lid); done(ok && ok2); }, ok);
  if (parts.length > 14) {
    const opts = shuffle([{ label: word(c, me.lemma, { sub: false }), ok: true }, ...neighbours(c, lid, 3).map(x => ({ label: word(c, x.lemma, { sub: false }) }))]);
    box.append(options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); afterWord(!!o.ok); }));
    return box;
  }
  const others = neighbours(c, lid, 6).flatMap(x => clusters(x.lemma)).filter(x => x.trim() && !parts.includes(x));
  const tiles = shuffle([...parts.map((t, i) => ({ t, i })), ...shuffle(uniq(others)).slice(0, Math.min(4, Math.max(2, parts.length >> 1))).map(t => ({ t }))]);
  const built = [], slot = h('div', { class: 'lx-slot', lang: c, dir: X.language.dir }), pool = h('div', { class: 'lx-tiles', lang: c, dir: X.language.dir });
  const drawSlot = () => { slot.textContent = built.map(b => b.t).join('') || '…'; };
  let over = false;
  const check = () => {
    over = true; const ok = N.nfc(built.map(b => b.t).join('')) === N.nfc(me.lemma.replace(/\s+/g, ''));
    slot.classList.add(ok ? 'right' : 'wrong'); [...pool.children].forEach(b => b.disabled = true); afterWord(ok);
  };
  tiles.forEach(tile => pool.append(h('button', { class: 'lx-tile1', onclick: e => { if (over || e.currentTarget.disabled) return; built.push(tile); e.currentTarget.disabled = true; e.currentTarget.dataset.used = built.length; drawSlot(); if (built.length === parts.length) check(); } }, tile.t === ' ' ? '␣' : tile.t)));
  const undo = h('button', { class: 'btn small ghost', onclick: () => { if (over || !built.length) return; built.pop(); const b = [...pool.children].find(x => +x.dataset.used === built.length + 1); if (b) { b.disabled = false; delete b.dataset.used; } drawSlot(); } }, '⌫');
  const giveUp = h('button', { class: 'btn small ghost', onclick: () => { if (!over) { over = true; slot.classList.add('wrong'); afterWord(false); } } }, 'Show me');
  // Latin script: typing is allowed too
  const typed = X.language.script === 'Latn' ? h('input', { class: 'noema-input lx-typein', placeholder: 'or type it…', autocapitalize: 'off', spellcheck: 'false', onkeydown: e => {
    if (e.key !== 'Enter' || over) return; over = true; const ok = N.nfc(e.target.value.trim()) === N.nfc(me.lemma) || (X.language.capitalizeFirst && N.nfc(e.target.value.trim()).toLowerCase() === N.nfc(me.lemma).toLowerCase() && me.pos !== 'NOUN');
    slot.textContent = e.target.value.trim(); slot.classList.add(ok ? 'right' : 'wrong'); afterWord(ok); } }) : null;
  drawSlot();
  box.append(slot, pool, h('div', { class: 'row' }, undo, giveUp, typed));
  return box;
}
/** After the word itself: what must be learned with it — the German article, the Chinese measure word. */
function extraCheck(c, lid, box, done, wordOk) {
  const me = LX(c).lex[lid];
  if (c === 'de' && me.pos === 'NOUN' && me.gender && me.class !== 'plt') {
    const right = { MASC: 'der', FEM: 'die', NEUT: 'das' }[me.gender], opts = ['der', 'die', 'das'].map(a => ({ label: a, ok: a === right }));
    box.append(h('div', { class: 'lx-q' }, wordOk ? 'And its article?' : 'Its article?'), options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); done(!!o.ok); }));
    return;
  }
  if (c === 'zh' && me.pos === 'NOUN' && me.measure?.length) {
    const clf = Object.values(LX(c).lex).filter(x => x.pos === 'CLF').map(x => x.lemma);
    const right = me.measure[0], wrongs = shuffle(clf.filter(m => !me.measure.includes(m))).slice(0, 3);
    const opts = shuffle([{ label: '一' + right, ok: true }, ...wrongs.map(m => ({ label: '一' + m }))]);
    box.append(h('div', { class: 'lx-q' }, 'Which measure word? (one …)'), options(opts.map(o => ({ ...o, label: word(c, o.label, { sub: false }) })), (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok); done(!!o.ok); }));
    return;
  }
  done(true);
}
/** The first meeting with a word: everything needed to recognize it, briefly. */
function exIntro(c, lid, done) {
  const X = LX(c), me = X.lex[lid], card = N.wordCard(UI.C, UI.L, c, lid);
  const e1 = card.examples[0];
  const box = h('div', { class: 'lx-ex lx-intro' },
    h('div', { class: 'lx-q' }, `New in ${info(c).flag} ${info(c).name}`),
    h('div', { class: 'lx-prompt' }, word(c, me.lemma, { lex: me })),
    h('div', { class: 'lx-meaning' }, me.senses?.[0] ? conceptPic(me.senses[0], 'lx-exemoji') : '', ' ', card.gloss),
    card.parts.length ? h('dl', { class: 'lx-parts' }, ...card.parts.slice(0, 4).flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, /[֐-ۿ一-鿿]/.test(val) ? word(c, val, { sub: false }) : val)])) : null,
    e1 ? h('div', { class: 'lx-ex1' }, word(c, e1.text, { sub: false }), h('div', { class: 'tiny' }, e1.tr)) : null,
    card.sections.find(s => s.key === 'pitfalls') ? h('div', { class: 'lx-warn tiny' }, '⚠️ ', card.sections.find(s => s.key === 'pitfalls').items[0]) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary lx-next', onclick: () => done(true) }, 'Got it →')));
  return box;
}
