/* ---------- aspects (D29): the sides of a language — sound, writing, forms, sentences, meaning, use, culture — each a labelled, pale-tinted section
   in a lesson's theory, and the library “By aspect” that lists the same sections of one language together. ---------- */
const ASPECT_ORDER = ['phonology', 'morphology', 'syntax', 'semantics', 'lexicon', 'pragmatics'];
/** The aspect of a grammar function: its category (morphosyntax reads as morphology). */
const aspectOf = fid => { const c = UI.C.functions[fid]?.category; return c === 'morphosyntax' ? 'morphology' : ASPECT_ORDER.includes(c) ? c : null; };
const aspectRank = fid => { const i = ASPECT_ORDER.indexOf(aspectOf(fid)); return i < 0 ? ASPECT_ORDER.length : i; };
const aspectLabel = a => h('span', { class: 'lx-asplabel' }, LT('lang.aspect.' + a));
/** The library of one language by aspect: its grammar points grouped by the side of the language they are about, then the views for writing, listening & speaking, reading and culture. */
VIEWS.aspects = (v, r) => {
  const c = r.arg && UI.C.lang[r.arg] ? r.arg : UI.lang, X = LX(c), only = ASPECT_ORDER.concat(['writing', 'listening', 'reading']).includes(r.arg2) ? r.arg2 : null;
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, arrowBack() + ' ' + LT('lang.card.map'))),
    h('h1', {}, LT('lang.view.aspects'), h('span', { class: 'tiny' }, ` · ${info(c).flag} ${info(c).label}`)));
  const fns = Object.keys(X.grammar).filter(f => X.grammar[f] && X.grammar[f].status !== 'absent' && aspectOf(f));
  const sec = (a, items) => items.length && (!only || only === a) ? h('section', { class: 'lx-card lx-asp lx-asp-' + a, 'data-aspect': a }, h('h3', {}, aspectLabel(a)),
    h('div', { class: 'lx-lhlib' }, ...items)) : null;
  const btn = (txt, to) => h('button', { class: 'lx-lhtile', onclick: () => go(to) }, txt);
  const nonLatin = X.language.script !== 'Latn', first = f => UI.C.order.indexOf((UI.C.functions[f].after || [])[0]);
  v.append(...[...ASPECT_ORDER.map(a => sec(a, fns.filter(f => aspectOf(f) === a).sort((x, y) => first(x) - first(y)).map(f => btn(UI.C.functions[f].title, '#/fn/' + encodeURIComponent(f) + '/' + c)))),
    sec('writing', [nonLatin ? btn(LT('lang.view.script'), '#/script/' + c) : null, btn(LT('lang.view.write'), '#/write/' + c)].filter(Boolean)),
    sec('listening', [btn(LT('lang.view.listen'), '#/listen/' + c)]), sec('reading', [btn(LT('lang.view.read'), '#/read/' + c)])].filter(Boolean));
};
