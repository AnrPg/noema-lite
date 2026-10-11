/* ---------- R1 / R2 — the comparisons a learner sees (docs/language-packs.md §2.2), structured ----------
   Three sections wherever a place has comparison notes (grammar pages, their blocks, the overview, the typology card, phenomena,
   word cards): “From your languages” (the native language first — else its branch / family / type —, then the C1 / C2 languages
   in the learner's order), “Among the languages you are learning” (the other course languages the learner studies: their notes
   and the links to them) and, folded, “From other languages” (every other note: other languages, types, branches, families).
   Each note sits under the heading of its language: its own name (endonym) and a rel chip.
   Every note (and every comparison-like text: pitfalls, subtleties, fun facts, feeling, synonyms' nuances, the grammar pages'
   comparison texts) is a small Markdown subset (langcore noteMarkdown) drawn as DOM nodes — never innerHTML of the text —
   with the runs of another script in their language, font and direction. */

/** The languages the learner speaks at C1 / C2 (course settings.knows), in their order, without the native one. */
const speaksL = () => N.speaksOf(UI.L?.settings.knows, nativeL());
/** contrastFor for the learner on screen (page: the language shown, null for a shared page such as the typology card). Until the
 *  native language is known no comparison at all (§2.2: the course asks for it once; general texts only until then). */
const contrastL = (notes, page = null, seeAlso = []) => nativeL() ? N.contrastFor(notes, nativeL(), { speaks: speaksL(), learning: UI.L ? activeLangs() : [], page, seeAlso })
  : { yours: [], learning: [], others: [] };
/** A language's own name (its endonym: “Ελληνικά”, “Deutsch”, “العربية”), else its name in the UI language. */
function endonym(code) {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (n && n.toLowerCase() !== String(code).toLowerCase()) { const a = [...n]; return a[0].toLocaleUpperCase(code) + a.slice(1).join(''); }
  } catch (e) { }
  return capFirst(langName(code));
}
const REL_SIGN = { same: '=', similar: '≈', different: '≠', new: '✨', trap: '⚠️' };
const REL_LABEL = new Proxy({}, { get: (o, r) => typeof r === 'string' && REL_SIGN[r] ? REL_SIGN[r] + ' ' + LT('lang.gram.rel.' + r) : undefined });   // lang.gram.rel.<rel>
const relChip = rel => rel ? h('span', { class: 'lx-rel r-' + (REL_SIGN[rel] ? rel : 'other') }, REL_LABEL[rel] || rel) : null;
const noteAiBadge = n => n?.ai ? h('span', { class: 'lx-badge reg' }, LT('lang.gram.aiBadge')) : null;

/* ---- R2: the Markdown subset as DOM ---- */
const RUN_SCRIPTS = [   // [script, its runs (letters, with spaces between them), the language a run is in]
  ['he', /[֐-׿יִ-ﭏ]/, () => 'he'],
  ['ar', /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/, f => ['fa', 'ur'].includes(f) ? f : 'ar'],
  ['cjk', /[぀-ヿ㐀-鿿豈-﫿　-〿＀-￯]/, (f, run) => /[぀-ヿ]/.test(run) || f === 'ja' ? 'ja' : 'zh'],
  ['el', /[Ͱ-Ͽἀ-῿]/, () => 'el'],
  ['cyr', /[Ѐ-ӿ]/, f => ['ru', 'uk', 'bg', 'sr'].includes(f) ? f : 'ru'],
  ['deva', /[ऀ-ॿ]/, f => ['hi', 'mr'].includes(f) ? f : 'hi'],
];
const RUN_RE = new RegExp(RUN_SCRIPTS.map(([, r]) => { const c = r.source; return `${c}+(?:[\\s\\u0300-\\u036F'’]*${c}+)*`; }).join('|'), 'g');
const RTL = new Set(['he', 'ar', 'fa', 'ur']);
/** The script the explanations are written in (its runs need no marking). */
const explScript = () => ({ he: 'he', ar: 'ar', fa: 'ar', zh: 'cjk', ja: 'cjk', el: 'el', ru: 'cyr', uk: 'cyr', bg: 'cyr', hi: 'deva' })[String(UI.C?.explainLang || 'en').split('-')[0]] || null;
/** Mixed text: every run of another script in its language (a course language: its font, direction and vowel marks — like wordsIn;
 *  any other: lang and dir). forLang: the language the note speaks about (decides Japanese kanji, Persian letters …). */
function scriptRuns(s, forLang = null) {
  s = String(s ?? ''); const out = [], skip = explScript(); let last = 0, m;
  RUN_RE.lastIndex = 0;
  while ((m = RUN_RE.exec(s))) {
    const run = m[0], sc = RUN_SCRIPTS.find(([, r]) => r.test(run[0]));
    if (!sc || sc[0] === skip) continue;
    if (m.index > last) out.push(s.slice(last, m.index));
    const code = sc[2](forLang, run);
    const e = UI.C?.lang[code] ? word(code, run, { sub: false }) : h('span', { lang: code, dir: RTL.has(code) ? 'rtl' : null }, run);
    if (e && e.dataset) e.dataset.inline = '1';   // a run inside prose: no 🔊 button of its own (98_speech.js)
    out.push(e);
    last = m.index + run.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
/** A text in the Markdown subset (R2) → DOM: paragraphs, lists, → examples, bold, italic. inline: one plain paragraph comes back as a
 *  span (inside a list item, after an icon …). */
function mdView(text, { forLang = null, inline = false, cls = '' } = {}) {
  const blocks = N.noteMarkdown(text);
  const inl = list => list.map(x => x.t === 'text' ? scriptRuns(x.s, forLang) : h(x.t === 'b' ? 'strong' : 'em', {}, inl(x.c)));
  const lines = ls => ls.flatMap((l, i) => i ? [h('br'), ...inl(l)] : inl(l));
  const ex = l => h('div', { class: 'lx-md-ex' }, h('span', { class: 'lx-md-arrow', 'aria-hidden': 'true' }, '→'), h('span', {}, inl(l)));
  if (inline && blocks.length <= 1 && (!blocks.length || blocks[0].t === 'p')) return h('span', { class: 'lx-md ' + cls }, blocks.length ? lines(blocks[0].lines) : '');
  return h('div', { class: 'lx-md ' + cls }, ...blocks.map(b => b.t === 'p' ? h('p', {}, lines(b.lines)) : b.t === 'ex' ? ex(b.inl)
    : h(b.t, { class: 'lx-md-list', start: b.t === 'ol' && b.start !== 1 ? b.start : null }, ...b.items.map(it => h('li', {}, lines(it.lines), ...it.ex.map(ex))))));
}

/* ---- R1: the sections ---- */
/** The name of a group of languages: a type by the course's name for it (core/typology.json), a branch / family as “… languages”. */
const groupName = key => { const [k, v] = String(key).split(':'); const t = k === 'type' && (UI.C?.data.typology?.types || []).find(x => x.id === v); return t ? t.name : langName(key); };
/** The heading of a group: the language's own name (+ its name in the UI language when it differs) or the group's name, C1 / C2,
 *  the rel chip of its first note. A native language shown through its branch / family / type: its name + that group's name. */
function groupHead(g, sec) {
  const code = g.kind === 'lang' ? g.lang : null, main = code ? endonym(code) : g.kind === 'name' ? capFirst(g.name || g.for) : groupName(g.for);
  const ui = code ? capFirst(langName(code)) : '', sub = g.via ? groupName(g.via) : ui && ui.toLowerCase() !== main.toLowerCase() ? ui : null;
  return h('div', { class: 'lx-cg-head' }, sec === 'learning' && code ? h('span', { class: 'lx-cg-flag', 'aria-hidden': 'true' }, info(code).flag) : null,
    h('b', { class: 'lx-cg-name', lang: code || null, dir: 'auto' }, main), sub ? h('span', { class: 'lx-cg-sub' }, sub) : null,
    g.level ? h('span', { class: 'lx-cg-lvl' }, g.level) : null, relChip(g.notes[0]?.rel), noteAiBadge(g.notes[0]));
}
function groupView(g, sec, fid) {
  return h('div', { class: 'lx-cgroup', 'data-lang': g.for, 'data-kind': g.kind || 'lang' },
    groupHead(g, sec),
    ...g.notes.map((n, i) => h('div', { class: 'lx-cg-note', 'data-for': n.for }, i ? h('div', { class: 'lx-cg-more' }, relChip(n.rel), noteAiBadge(n)) : null,
      mdView(n.text, { forLang: g.kind === 'lang' ? g.lang : null }))),
    g.seeAlso ? h('ul', { class: 'lx-cg-also' }, ...g.seeAlso.map(x => h('li', {},
      UI.C.lang[x.lang] ? h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(x.fn || fid)}/${x.lang}`) }, '🔗 ' + (UI.C.functions[x.fn || fid]?.title || x.fn || fid))
        : h('span', { class: 'tiny' }, '🔗 ' + (UI.C.functions[x.fn || fid]?.title || x.fn || fid)),   // D21: a course language the learner does not study has no page now
      x.note ? mdView(x.note, { forLang: x.lang, inline: true }) : null))) : null);
}
/** The sections of a contrastFor result → [element …] (none when empty): “From your languages”, “Among the languages you are
 *  learning”, and “From other languages” folded (a <details>). opts: {fid (seeAlso links), compact (inside a block, a phenomenon),
 *  cls (an extra class), tail (an element at the end of “yours”: the ✨ button)}. */
function contrastView(r, { fid = null, compact = false, cls = '', tail = null } = {}) {
  const k0 = `lx-notesbox lx-cmp${compact ? ' compact' : ''}${cls ? ' ' + cls : ''}`;
  const box = (k, groups, title, extra = null) => groups.length || extra ? h('section', { class: `${k0} k-${k}`, 'data-cmp': k },
    h('div', { class: 'lx-cmp-title' }, title), ...groups.map(g => groupView(g, k, fid)), extra) : null;
  const others = r.others || [];
  return [box('yours', r.yours || [], '🧭 ' + LT('lang.gram.fromYours'), tail), box('learning', r.learning || [], '🌐 ' + LT('lang.gram.amongLearning')),
    others.length ? h('details', { class: `${k0} k-others`, 'data-cmp': 'others' },   // folded by default (R1.3)
      h('summary', { class: 'lx-cmp-title' }, '🗺️ ' + LT('lang.gram.fromOthers'), h('span', { class: 'lx-cmp-n' }, LNUM(others.length))),
      ...others.map(g => groupView(g, 'others', fid))) : null].filter(Boolean);
}
/** The notes of one place (a block, a phenomenon, a word: notes; c: the language on screen) as the sections. */
const notesSections = (notes, c, opts = {}) => contrastView(contrastL(notes, c, opts.seeAlso || []), opts);
/** The comparison notes of a word (profile.notes) for its card. */
const wordNotesView = (c, lx) => notesSections(lx.profile?.notes, c, { cls: 'lx-wnotes' });
