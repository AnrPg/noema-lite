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
    if (a === 'grammar') {   // word forms by the feature they inflect (tense, number, case…), sentences by level; each group folds
      const fold = (title, n, body, open) => { const d = h('details', { class: 'lx-aspfold' }, h('summary', {}, h('b', {}, title), h('span', { class: 'tiny' }, ' · ' + n)), body); d.open = !!open; return d; };
      const forms = fns.filter(f => UI.C.functions[f].category !== 'syntax'), sent = fns.filter(f => UI.C.functions[f].category === 'syntax');
      const KNOWN_TAGS = ['Mood', 'Number', 'Case', 'Tense', 'Voice', 'Degree', 'Person', 'Aspect', 'Possession', 'Polarity', 'Tone', 'Politeness', 'Gender', 'Definiteness', 'Deixis'], tagOf = f => KNOWN_TAGS.find(t => (UI.C.functions[f].tags || []).includes(t)) || 'other', tags = [...new Set(forms.map(tagOf))].sort((x, y) => (x === 'other') - (y === 'other') || forms.filter(f => tagOf(f) === y).length - forms.filter(f => tagOf(f) === x).length);
      const lib = l => h('div', { class: 'lx-lhlib' }, ...l.map(fbtn));
      if (forms.length) sec.append(h('h3', {}, LT('lang.aspect.morphology')), ...tags.map(t => { const l = forms.filter(f => tagOf(f) === t); return fold(LT('lang.aspect.tag.' + t), l.length, lib(l)); }));
      if (sent.length) { const lv = [...new Set(sent.map(f => UI.C.functions[f].level || ''))].sort();
        sec.append(h('h3', {}, LT('lang.aspect.syntax')), ...lv.map(x => { const l = sent.filter(f => (UI.C.functions[f].level || '') === x); return fold(x || LT('lang.aspect.tag.other'), l.length, lib(l)); })); }
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
    const FACETS = { idioms: ['reg'], registers: ['reg', 'conn', 'status'] }, fold = x => (window.NoemaCatalog ? NoemaCatalog.fold(x) : String(x).toLowerCase());
    const facetLabel = (f, v) => f === 'reg' ? regWord(v) : f === 'conn' ? CONNOTATION[v] + ' ' + LT('lang.card.conn.' + v) : codeWord('lang.expl.status.', v);
    const metaOf = (key, it) => key === 'use' ? { reg: it.regs, conn: it.conn && it.conn !== 'neutral' ? [it.conn] : [], status: it.status && it.status !== 'current' ? [it.status] : [] } : { reg: [].concat(it.register || []).filter(x => x !== 'neutral'), conn: [], status: [] };
    for (const k of parts) {   // each part is a section that folds (closed), with its own text filter and, where the data has them, chips by register / shade / status
      const list = h('div', { class: 'lx-asplist' }), all = rows[k], shown = 40, box = h('details', { class: 'lx-aspart lx-aspfold', 'data-part': k }), pick = {};
      const draw = (full) => {
        const q = fold(inp.value.trim()), f = all.filter(([lx, key, it]) => (!q || fold(lx.lemma + ' ' + (lx.translit || '') + ' ' + (lx.pinyin || '') + ' ' + JSON.stringify(it)).includes(q)) &&
          Object.entries(pick).every(([fc, v]) => !v || metaOf(key, it)[fc].includes(v)));
        list.replaceChildren(...[...f.slice(0, full ? f.length : shown).map(([lx, key, it]) => aspectEntry(c, lx, key, it)),
          !full && f.length > shown ? h('button', { class: 'btn ghost small', onclick: () => draw(true) }, LT('lang.frame.more', { n: f.length - shown, what: '' }).trim()) : null].filter(Boolean));   // replaceChildren turns a null into the text "null"
        cnt.textContent = LT('lang.aspect.count', { n: f.length });
      };
      const inp = h('input', { class: 'noema-input', type: 'search', placeholder: LT('lang.aspect.filter'), 'aria-label': LT('lang.aspect.filter') }), cnt = h('p', { class: 'tiny' });
      inp.addEventListener('input', () => draw(false));
      box.append(h('summary', {}, h('b', {}, LT('lang.aspect.part.' + k)), h('span', { class: 'tiny' }, ' · ' + all.length)));
      if (!all.length) box.append(h('p', { class: 'lx-note' }, LT('lang.aspect.none')));
      else {
        const chips = [];
        for (const fc of FACETS[k] || []) {
          const vals = [...new Set(all.flatMap(([, key, it]) => metaOf(key, it)[fc]))].filter(Boolean).sort(); if (vals.length < 2) continue;
          const row = h('div', { class: 'lx-facet', 'data-facet': fc }, h('span', { class: 'tiny' }, LT('lang.aspect.facet.' + fc))), bs = [];
          for (const v of [null, ...vals]) { const b = h('button', { class: 'lx-chip' + (v == null ? ' on' : ''), 'aria-pressed': String(v == null), 'data-v': v || '', onclick: () => { pick[fc] = v; bs.forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); draw(false); } }, v == null ? LT('lang.aspect.facet.all') : facetLabel(fc, v)); bs.push(b); row.append(b); }
          chips.push(row);
        }
        box.append(cnt, ...chips, inp, list); draw(false);
      }
      box.open = parts.length === 1;   // a page with one section shows it; with several they are closed
      sec.append(box);
    }
  }, sec);
  const vs = ASPECT_VIEWS[a] ? ASPECT_VIEWS[a](c) : [];
  if (vs.length) sec.append(h('div', { class: 'lx-lhlib' }, ...vs.map(n => h('button', { class: 'lx-lhtile', onclick: () => go('#/' + n + '/' + c) }, LT('lang.view.' + n)))));
};
