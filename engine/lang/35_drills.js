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
/** 🧩 the sorting drill of a field in the language shown (course-port.ts SortDrill). */
function sortDrill(fid) {
  const field = UI.C.data.fields.find(f => f.field === fid); if (!field) return null;
  const c = UI.lang, X = LX(c), pool = sortPool(c, fid);
  return { field: { id: fid, title: field.title }, lang: courseLang(c), rail: railModel(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
    pool: pool.map(p => ({ id: p.id, cid: p.cid, group: p.group, lemma: X.lex[p.id].lemma, gloss: UI.C.concepts[p.cid].gloss })),
    groups: (field.subgroups || []).filter(g => pool.some(p => p.group === g.id)).map(g => ({ id: g.id, title: g.title, emoji: SUB_EMOJI[g.id] || '' })) };
}
function sortRecord(c, results) { const day = today(); for (const x of results) N.review(UI.C, UI.L, c, x.id, 'r', x.ok ? 'good' : 'again', day); save(); }
VIEWS.sort = (v, r) => {
  if (!UI.C.data.fields.some(f => f.field === r.arg)) return VIEWS.home(v);
  v.append(screenEl('noema-lang-sort', { field: r.arg }));
};

/** Words of language c the learner has met that have something to memorize besides the meaning → [{ id, parts }] */
function partsPool(c) {
  const X = LX(c), k = N.known(UI.C, UI.L, c), out = [];
  for (const [id, x] of Object.entries(X.lex)) {
    if (!MET.includes(k.state[id])) continue;
    const parts = N.principalParts(UI.C, c, x).filter(q => q[2] !== 'transliteration');   // q = [label (words), value, id]
    if (parts.length) out.push({ id, parts });
  }
  return out;
}
const FOREIGN = /[֐-ۿ一-鿿]/;
/** 🔁 the principal parts drill of language c (course-port.ts PartsDrill): ten words, one part each, its distractors. */
function partsDrill(code) {
  const c = UI.C.lang[code] ? code : UI.lang, X = LX(c), all = partsPool(c), pool = shuffle(all).slice(0, 10);
  const byLabel = {}; for (const p of all) for (const [, val, id] of p.parts) (byLabel[id] = byLabel[id] || new Set()).add(val);   // every value a part (by its id) takes among the words met: the distractors
  const items = pool.map(p => {
    const x = X.lex[p.id], [label, val, pid] = p.parts[Math.floor(Math.random() * p.parts.length)];   // label: the words shown; pid: the part's stable id (compared)
    const others = qaPartsDistractors(c, p, pid, val, byLabel[pid]);   // forms of the same word first (99_qa.js): another word's form gives the answer away
    return { id: p.id, lemma: x.lemma, gloss: gloss(c, p.id), label, pid, val, foreign: FOREIGN.test(val), sub: pid !== 'pinyin',   // the pinyin under the word would be the answer
      ask: /^(with |perfect |one |plural only|er\/|du$)/.test(pid) ? label[0].toUpperCase() + label.slice(1) + ' …?' : LT('lang.parts.its', { label }),
      options: others.length ? shuffle([{ val, ok: true }, ...others.map(o => ({ val: o, ok: false }))]).map(o => ({ ...o, foreign: FOREIGN.test(o.val) })) : null };
  });
  return { lang: courseLang(c), rail: railModel(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); go('#/parts/' + x); }), items };
}
function partsRecord(c, lex, ok) { N.review(UI.C, UI.L, c, lex, 'r', ok ? 'good' : 'again', today()); save(); }
VIEWS.parts = (v, r) => { v.append(screenEl('noema-lang-parts', { code: UI.C.lang[r.arg] ? r.arg : UI.lang })); };
