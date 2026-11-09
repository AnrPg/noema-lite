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
const searchFold = x => (window.NoemaCore?.search ? NoemaCore.search.fold(x) : String(x).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase());
/** One entry of a profile aspect as the page draws it (course-port.ts AspectEntry): the word, then what the profile says. */
function aspectEntry(c, lx, key, it) {
  const base = { lex: lx.id, lemma: lx.lemma, href: toHash('#/w/' + c + '/' + encodeURIComponent(lx.id)), hay: searchFold(lx.lemma + ' ' + (lx.translit || '') + ' ' + (lx.pinyin || '') + ' ' + JSON.stringify(it)) };
  if (key === 'use') return { ...base, kind: 'use', meta: { reg: it.regs, conn: it.conn && it.conn !== 'neutral' ? [it.conn] : [], status: it.status && it.status !== 'current' ? [it.status] : [] }, gloss: gloss(c, lx.id),
    badges: [it.regs.length ? { cls: 'reg', text: regWords(it.regs) } : null, it.conn && it.conn !== 'neutral' ? { cls: '', text: CONNOTATION[it.conn] + ' ' + LT('lang.card.conn.' + it.conn) } : null,
      it.status && it.status !== 'current' ? { cls: 'ctx', text: codeWord('lang.expl.status.', it.status) } : null].filter(Boolean) };
  const meta = { reg: [].concat(it.register || []).filter(x => x !== 'neutral'), conn: [], status: [] };
  if (key === 'phrases') return { ...base, kind: 'phrase', meta, text: it.text, tr: it.tr, meaning: it.meaning, source: it.source || undefined, badges: it.register ? [{ cls: 'reg', text: regWords(it.register) }] : [] };
  if (key === 'etymology') return { ...base, kind: 'etymology', meta, text: it.text, src: it.src || undefined };
  return { ...base, kind: 'fact', meta, note: mdView(it, { forLang: c, inline: true }) };
}
const KNOWN_TAGS = ['Mood', 'Number', 'Case', 'Tense', 'Voice', 'Degree', 'Person', 'Aspect', 'Possession', 'Polarity', 'Tone', 'Politeness', 'Gender', 'Definiteness', 'Deixis'];
const FACETS = { idioms: ['reg'], registers: ['reg', 'conn', 'status'] };
const facetLabel = (f, v) => f === 'reg' ? regWord(v) : f === 'conn' ? CONNOTATION[v] + ' ' + LT('lang.card.conn.' + v) : codeWord('lang.expl.status.', v);
/** The page of one aspect of language c (course-port.ts AspectPage): its grammar points, the profile parts once the profiles are in. */
function aspectPage(c, a) {
  if (!UI.C.lang[c] || !ASPECT_PAGES.includes(a)) return null;
  const X = LX(c), F = UI.C.functions, tile = f => ({ id: f, title: F[f].title });
  const fns = Object.keys(X.grammar).filter(f => X.grammar[f] && X.grammar[f].status !== 'absent' && aspectOf(f) === a).sort((x, y) => UI.C.order.indexOf((F[x].after || [])[0]) - UI.C.order.indexOf((F[y].after || [])[0]));
  let grammar = null;
  if (a === 'grammar' && fns.length) {   // word forms by the feature they inflect (tense, number, case…), sentences by level
    const forms = fns.filter(f => F[f].category !== 'syntax'), sent = fns.filter(f => F[f].category === 'syntax');
    const tagOf = f => KNOWN_TAGS.find(t => (F[f].tags || []).includes(t)) || 'other';
    const tags = [...new Set(forms.map(tagOf))].sort((x, y) => (x === 'other') - (y === 'other') || forms.filter(f => tagOf(f) === y).length - forms.filter(f => tagOf(f) === x).length);
    grammar = { forms: tags.map(t => ({ tag: t, fns: forms.filter(f => tagOf(f) === t).map(tile) })),
      sentences: [...new Set(sent.map(f => F[f].level || ''))].sort().map(lv => ({ level: lv, fns: sent.filter(f => (F[f].level || '') === lv).map(tile) })) };
  }
  const keys = PAGE_PARTS[a] || [], ready = UI.profiles || Object.values(X.lex).some(x => x.profile);
  let parts = keys.length ? null : [];
  if (keys.length && ready) {
    const rows = Object.fromEntries(keys.map(k => [k, []]));
    for (const lx of Object.values(X.lex)) {
      let card; try { card = N.wordCard(UI.C, UI.L, c, lx.id); } catch (e) { continue; }
      for (const k of keys) {
        const P = PROFILE_PARTS[k];
        if (P.sec) { const sc = card.sections.find(x => x.key === P.sec); for (const it of (sc?.items || []).filter(P.keep)) rows[k].push(aspectEntry(c, lx, P.sec, it)); }
        else { const p = lx.profile || {}, regs = [].concat(p.register || []).filter(x => x !== 'neutral');
          if (regs.length || (p.connotation && p.connotation !== 'neutral') || (p.status && p.status !== 'current')) rows[k].push(aspectEntry(c, lx, 'use', { regs, conn: p.connotation, status: p.status })); }
      }
    }
    parts = keys.map(k => ({ key: k, entries: rows[k], facets: (FACETS[k] || []).map(fc => ({ facet: fc, values: [...new Set(rows[k].flatMap(e => e.meta[fc]))].filter(Boolean).sort().map(v => ({ v, label: facetLabel(fc, v) })) })).filter(f => f.values.length >= 2) }));
  }
  return { lang: courseLang(c), aspect: a, grammar, points: a === 'grammar' ? [] : fns.map(tile), parts, views: ASPECT_VIEWS[a] ? ASPECT_VIEWS[a](c) : [] };
}
/** #/aspects/<code>/<aspect>: noema-lang-aspect (src/ui/screens/languages/lang-aspect.ts). */
VIEWS.aspects = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, a = ASPECT_PAGES.includes(r.arg2) ? r.arg2 : null;
  if (!a) return VIEWS.home(v);
  v.append(screenEl('noema-lang-aspect', { code: c, aspect: a }));
  if ((PAGE_PARTS[a] || []).length) whenProfiles(c, () => undefined, v);   // the profiles still loading: a note, then the page again
};
