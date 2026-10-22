/* ===================== ⚑ where a problem is: the place of a report, in the pack's own terms (engine/report.js) ===================== */
/* The report button knows the address and the element pointed at (its data-* chain: data-ex, data-bid, data-card, data-pid,
   data-nf …); the engine knows what they are. locateItem() turns them into the chapter, section, block, exercise, card,
   drill or trap of the pack — with its type, its text as shown, and its text in the pack's own language when a
   translation is shown — so whoever fixes it (a person or Claude) finds exactly one place to change. */
/* i18n-ignore-start */   // every word here is for the report (read by the person or the AI who fixes it), not for the learner
function locateItem(p = {}) {
  const clip = (s, n = 400) => { s = typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s); return s.length > n ? s.slice(0, n) + '…' : s; };
  const at = (o, path) => String(path || '').split('.').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[/^\d+$/.test(k) ? +k : k]), o);
  const out = {}, own = Noema.pack?.chapters || [], shownLoc = SUBJ.sourceLanguage ? SUBJ.language : null;
  const ownCh = id => own.find(c => c.id === id);
  const ownOf = (list, id) => { for (const c of own) { const x = (c[list] || []).find(y => y.id === id); if (x) return x; } return null; };
  const chap = c => c && (out.chapter = { id: c.id, num: c.num, title: clip(c.title, 160), index: c._i });
  const field = (obj, ownObj) => {   // the field pointed at inside the item (data-nf): its path, its text as shown and in the pack's own language
    if (!p.field || !obj) return;
    out.field = { path: p.field, shown: clip(at(obj, p.field)) };
    if (shownLoc && ownObj) out.field.own = clip(at(ownObj, p.field));
  };
  const ex = p.exercise && (EX[p.exercise] || null);
  if (p.exercise) {
    if (ex) {
      chap(ex._ch);
      out.exercise = { id: ex.id, type: ex.type, section: ex.section || null, difficulty: ex.difficulty, lr: ex.lr || null, tags: ex.tags || [], q: clip(ex.q, 300), cite: ex.cite || null, src: ex.src || null, facade: ex.facade || null };
      const o = shownLoc ? ownOf('exercises', ex.id) : null;
      if (shownLoc) out.exercise.qOwn = clip(o?.q, 300);
      field(ex, o);
    } else out.exercise = { id: p.exercise, notInPack: true, note: 'not an exercise of the pack (made by the AI on the spot, or a drill\'s ordering task)' };
  }
  if (p.card) {
    let card = null, cc = null;
    for (const c of FULL_COURSE) c.flashcards.forEach((f, i) => { if (!card && (f._key || c.id + '#' + i) === p.card) { card = f; cc = c; out.cardIndex = i; } });
    if (card) {
      chap(cc);
      out.card = { key: p.card, index: out.cardIndex, section: card.section || null, q: clip(card.q, 300), a: clip(card.a, 300) };
      const o = shownLoc ? (ownCh(cc.id)?.flashcards || [])[out.cardIndex] : null;
      if (o) Object.assign(out.card, { qOwn: clip(o.q, 300), aOwn: clip(o.a, 300) });
      field(card, o);
    } else out.card = { key: p.card, notFound: true };
    delete out.cardIndex;
  }
  if (p.drill) {
    const d = PB[p.drill];
    if (d) { chap(d._ch); out.drill = { id: d.id, title: clip(d.title, 200), section: d.section || null }; field(d, shownLoc ? ownOf('debug', d.id) : null); }
    else out.drill = { id: p.drill, notFound: true };
  }
  const sid = p.section || ex?.section || null, s = sid && SEC[sid];
  if (s) {
    if (!out.chapter) chap(s._ch);
    out.section = { id: s.id, title: clip(s.title, 200), index: s._j };
    if (p.block) {
      const bids = s._bids || (window.NoemaCatalog ? NoemaCatalog.blockIds(s.blocks) : s.blocks.map((b, i) => 'b' + i)), i = bids.indexOf(p.block), b = s.blocks[i];
      if (b) {
        out.block = { id: p.block, index: i, t: b.t, text: clip(window.NoemaCatalog ? NoemaCatalog.blockText(b) : b.text, 400) };
        const os = shownLoc ? (ownCh(s._ch.id)?.sections || []).find(x => x.id === s.id) : null, ob = os?.blocks?.[i];
        if (ob) out.block.textOwn = clip(window.NoemaCatalog ? NoemaCatalog.blockText(ob) : ob.text, 400);
        if (!ex) field(b, ob);
      } else out.block = { id: p.block, notFound: true };
    }
  } else if (sid) out.section = { id: sid, notFound: true };
  if (p.trap || p.chapter) {
    const c = CH[p.chapter] || (out.chapter && CH[out.chapter.id]) || null;
    if (c && !out.chapter) chap(c);
    if (p.trap && c) {
      const i = c.pitfalls.findIndex(x => window.NoemaCatalog && NoemaCatalog.trapId(x) === p.trap), x = c.pitfalls[i];
      if (x) { out.trap = { id: p.trap, index: i, title: clip(x.title, 200), text: clip(x.text, 300) }; const o = shownLoc ? (ownCh(c.id)?.pitfalls || [])[i] : null; if (o) out.trap.titleOwn = clip(o.title, 200); }
    }
  }
  if (!out.chapter && p.chapter) out.chapter = { id: p.chapter, notFound: !CH[p.chapter] };
  out.content = { packLanguage: SUBJ.sourceLanguage || SUBJ.language || 'en', shown: SUBJ.language || 'en', translation: shownLoc };
  return out;
}
/* i18n-ignore-end */
