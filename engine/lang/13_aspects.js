/* ---------- aspects (D29): the sides of a language one studies — sounds, writing, grammar, meaning, use, idioms, etymology, folk tradition, culture,
   listening & speaking, reading. A grammar point belongs to one by its category (morphology and syntax are both grammar); the others are
   read from what the word profiles already hold (etymology, phrases, fun facts, registers). Each lesson's grammar card carries its aspect as a label
   and a pale tint; the language home lists the aspects as tiles; #/aspects/<code>/<aspect> is the page of one. ---------- */
const ASPECT_OF_CAT = { phonology: 'sounds', morphology: 'grammar', morphosyntax: 'grammar', syntax: 'grammar', semantics: 'meaning', lexicon: 'meaning', pragmatics: 'use' };
const ASPECT_ORDER = ['sounds', 'grammar', 'meaning', 'use'];
/** The aspect of a grammar function (by its category), or null. */
const aspectOf = fid => ASPECT_OF_CAT[UI.C.functions[fid]?.category] || null;
const aspectRank = fid => { const i = ASPECT_ORDER.indexOf(aspectOf(fid)); return i < 0 ? ASPECT_ORDER.length : i; };
/** The label of a grammar card: its aspect, and for grammar whether it is about the forms of words or about sentences. */
const aspectText = fid => { const a = aspectOf(fid), cat = UI.C.functions[fid]?.category; return a ? LT('lang.aspect.' + a) + (a === 'grammar' ? ' · ' + LT('lang.aspect.' + (cat === 'syntax' ? 'syntax' : 'morphology')) : '') : ''; };
const aspectLabel = fid => h('span', { class: 'lx-asplabel' }, aspectText(fid));
/** What the word profiles hold, in parts: the section of the card and which of its items belong ('registers' reads the words that are not plain neutral everyday ones). */
const PHRASE_IDIOM = ['idiom', 'fixed expression', 'colloquial', 'slang'], PHRASE_FOLK = ['proverb', 'saying'];
const PROFILE_PARTS = {
  idioms: { sec: 'phrases', keep: it => PHRASE_IDIOM.includes(it.kind) },
  registers: { sec: null },
  sayings: { sec: 'phrases', keep: it => PHRASE_FOLK.includes(it.kind) },
  facts: { sec: 'funFacts', keep: () => true },
  etymology: { sec: 'etymology', keep: () => true },
};
/** The aspect pages: grammar points of the aspect (by category), then these parts. Idioms belong to how a language is used; proverbs and fun facts to its culture. */
const PAGE_PARTS = { use: ['idioms', 'registers'], culture: ['sayings', 'facts'], etymology: ['etymology'] };
const ASPECT_PAGES = ['sounds', 'writing', 'grammar', 'meaning', 'use', 'etymology', 'culture'];
const ASPECT_VIEWS = { writing: c => (LX(c).language.script !== 'Latn' ? ['script', 'write'] : ['write']) };
/** One entry of a profile aspect: the word, then what the profile says (the same renderers as the card's sections). */
function aspectEntry(c, lx, key, it) {
  const T = x => mdView(x, { forLang: c, inline: true });
  const head = h('a', { class: 'lx-aspword', href: '#/w/' + c + '/' + encodeURIComponent(lx.id) }, word(c, lx.lemma, { lex: lx }));
  let body;
  if (key === 'use') body = h('div', {}, it.regs.length ? h('span', { class: 'lx-badge reg' }, regWords(it.regs)) : null, it.conn && it.conn !== 'neutral' ? h('span', { class: 'lx-badge' }, CONNOTATION[it.conn] + ' ' + LT('lang.card.conn.' + it.conn)) : null,
    it.status && it.status !== 'current' ? h('span', { class: 'lx-badge ctx' }, codeWord('lang.expl.status.', it.status)) : null, ' ', h('span', { class: 'tiny' }, gloss(c, lx.id)));
  else if (key === 'phrases') body = h('div', {}, word(c, it.text, { sub: false }), ' ', it.register ? h('span', { class: 'lx-badge reg' }, regWords(it.register)) : null, h('div', { class: 'tiny' }, '“' + it.tr + '” — ', h('b', {}, it.meaning), it.source ? ' (' + it.source + ')' : ''));
  else if (key === 'etymology') body = h('div', {}, it.text, h('span', { class: 'tiny' }, it.src ? ' — ' + it.src : ''));
  else body = h('div', {}, '💡 ', T(it));
  return h('div', { class: 'lx-aspentry' }, head, body);
}
VIEWS.aspects = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, X = LX(c), a = ASPECT_PAGES.includes(r.arg2) ? r.arg2 : null;
  if (!a) return VIEWS.home(v);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, arrowBack() + ' ' + LT('lang.card.map'))),
    h('h1', {}, LT('lang.aspect.' + a), h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).label}`)));
  const sec = h('div', { class: 'lx-asp lx-asp-' + a + ' lx-aspbox', 'data-aspect': a });
  v.append(sec);
  const fns = Object.keys(X.grammar).filter(f => X.grammar[f] && X.grammar[f].status !== 'absent' && aspectOf(f) === a).sort((x, y) => UI.C.order.indexOf((UI.C.functions[x].after || [])[0]) - UI.C.order.indexOf((UI.C.functions[y].after || [])[0]));
  const fbtn = f => h('button', { class: 'lx-lhtile', onclick: () => go('#/fn/' + encodeURIComponent(f) + '/' + c) }, UI.C.functions[f].title);
  if (fns.length) {
    if (a === 'grammar') {
      for (const [sub, cats] of [['morphology', ['morphology', 'morphosyntax']], ['syntax', ['syntax']]]) {
        const l = fns.filter(f => cats.includes(UI.C.functions[f].category)); if (l.length) sec.append(h('h3', {}, LT('lang.aspect.' + sub)), h('div', { class: 'lx-lhlib' }, ...l.map(fbtn)));
      }
      sec.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => go('#/grammar/' + c) }, '📐 ' + LT('lang.view.grammar'))));
    } else sec.append(h('div', { class: 'lx-lhlib' }, ...fns.map(fbtn)));
  }
  const parts = PAGE_PARTS[a] || [];
  if (parts.length) whenProfiles(c, () => {
    const rows = Object.fromEntries(parts.map(k => [k, []]));
    for (const lx of Object.values(X.lex)) {
      let card; try { card = N.wordCard(UI.C, UI.L, c, lx.id); } catch (e) { continue; }
      for (const k of parts) {
        const P = PROFILE_PARTS[k];
        if (P.sec) { const sc = card.sections.find(x => x.key === P.sec); for (const it of (sc?.items || []).filter(P.keep)) rows[k].push([lx, P.sec, it]); }
        else { const p = lx.profile || {}, regs = [].concat(p.register || []).filter(x => x !== 'neutral');
          if (regs.length || (p.connotation && p.connotation !== 'neutral') || (p.status && p.status !== 'current')) rows[k].push([lx, 'use', { regs, conn: p.connotation, status: p.status }]); }
      }
    }
    for (const k of parts) {
      const list = h('div', { class: 'lx-asplist' }), all = rows[k], shown = 40, box = h('section', { class: 'lx-aspart', 'data-part': k });
      const draw = (full, q) => {
        const f = all.filter(([lx, , it]) => !q || (lx.lemma + ' ' + JSON.stringify(it)).toLowerCase().includes(q));
        list.replaceChildren(...[...f.slice(0, full ? f.length : shown).map(([lx, key, it]) => aspectEntry(c, lx, key, it)),
          !full && f.length > shown ? h('button', { class: 'btn ghost small', onclick: () => draw(true, q) }, LT('lang.frame.more', { n: f.length - shown, what: '' }).trim()) : null].filter(Boolean));   // replaceChildren turns a null into the text "null"
      };
      const inp = h('input', { class: 'noema-input', type: 'search', placeholder: LT('lang.aspect.filter'), 'aria-label': LT('lang.aspect.filter') });
      inp.addEventListener('input', () => draw(false, inp.value.trim().toLowerCase()));
      if (parts.length > 1) box.append(h('h3', {}, LT('lang.aspect.part.' + k)));
      if (!all.length) box.append(h('p', { class: 'lx-note' }, LT('lang.aspect.none')));
      else { box.append(h('p', { class: 'tiny' }, LT('lang.aspect.count', { n: all.length })), inp, list); draw(false, ''); }
      sec.append(box);
    }
  }, sec);
  const vs = ASPECT_VIEWS[a] ? ASPECT_VIEWS[a](c) : [];
  if (vs.length) sec.append(h('div', { class: 'lx-lhlib' }, ...vs.map(n => h('button', { class: 'lx-lhtile', onclick: () => go('#/' + n + '/' + c) }, LT('lang.view.' + n)))));
};
