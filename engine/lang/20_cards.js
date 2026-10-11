/* ---------- a node: its ideas, in the chosen language ---------- */
VIEWS.node = (v, r) => {
  const n = UI.C.nodes[r.arg]; if (!n) return VIEWS.home(v);
  if (n.kind === 'lesson') return VIEWS.lesson(v, r);
  const c = UI.lang, X = LX(c), k = N.known(UI.C, UI.L, c), ns = k.nodes[n.id];
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← ' + LT('lang.card.map'))),
    h('h1', {}, n.title),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
      h('span', { class: 'lx-ns ns-' + ns }, info(c).flag, ' ', STATE_LABEL[ns] || ns)),
    h('div', { class: 'row lx-actions' },
      ['open', 'learning', 'known', 'mastered'].includes(ns) ? h('button', { class: 'btn primary small', 'data-icon': 'plus', onclick: () => runSession(N.planSession(UI.C, UI.L, { day: today(), minutes: 15, languages: [c] }), { only: n.id }) }, '▶ ' + LT('lang.card.learnNode')) : null,
      n.kind === 'field' ? h('button', { class: 'btn small', 'data-icon': 'map', onclick: () => go('#/field/' + encodeURIComponent(n.field) + '/' + n.tier) }, '🧺 ' + LT('lang.card.fieldMap')) : null,
      n.kind === 'field' && ['learning', 'known', 'mastered'].includes(ns) ? h('button', { class: 'btn small', 'data-icon': 'dots', onclick: () => go('#/recall/' + encodeURIComponent(n.field)) }, '⏱️ ' + LT('lang.view.recall')) : null,
      deepenButton(n.id, c)),
    !X.prepared[n.id] ? h('p', { class: 'lx-note' }, '⏳ ' + LT('lang.card.nodeUnwritten', { lang: info(c).name })) : null);
  const grid = h('div', { class: 'lx-cgrid' });
  const ids = [...n.concepts.map(cid => ({ cid })), ...(X.byNode[n.id] || []).filter(id => !(X.lex[id].senses || []).length).map(id => ({ lex: id }))];
  for (const it of ids) grid.append(conceptTile(c, it, k));
  v.append(grid);
};
function conceptTile(c, { cid, lex }, k) {
  const X = LX(c), lids = cid ? (X.byConcept[cid] || []) : [lex], absent = cid && X.absent[cid];
  const st = cid ? N.conceptState(UI.C, UI.L, c, cid, k) : k.state[lex];
  const visible = !['locked', 'ready'].includes(st) || UI.prefs.peek;
  return h('button', { class: 'lx-tile s-' + st, onclick: () => go(cid ? '#/c/' + cid : '#/w/' + c + '/' + lex), title: STATE_LABEL[st] || '' },
    cid ? conceptPic(cid) : h('span', { class: 'lx-temoji' }, '🔤'),
    h('span', { class: 'lx-tword' }, absent ? h('i', { class: 'tiny' }, '— ' + LT('lang.card.noWordShort')) : visible ? lids.map((id, i) => [i ? ' · ' : '', word(c, X.lex[id].lemma, { sub: false })]) : '?'),
    h('span', { class: 'lx-tgloss' }, cid ? UI.C.concepts[cid].gloss : gloss(c, lex)));
}

/* ---------- a concept: the flag card (one language at a time) + compare ---------- */
VIEWS.c = (v, r) => {
  const cid = r.arg, con = UI.C.concepts[cid]; if (!con) return VIEWS.home(v);
  const node = UI.C.nodes[LX(UI.lang).owner[cid] || UI.C.owner[cid]];
  const draw = () => {
    v.innerHTML = ''; topbar();
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 || !node ? history.back() : go('#/node/' + node.id) }, '← ' + (node ? node.title : LT('lang.card.back')))),
      h('div', { class: 'lx-cardhead' }, conceptPic(cid, 'lx-bigemoji'), h('div', {}, h('h1', {}, con.gloss), h('div', { class: 'tiny' }, [node ? node.title : '⏳ ' + LT('lang.card.untaughtMeaning'), con.wikidata ? 'Wikidata ' + con.wikidata : null].filter(Boolean).join(' · ')))),   // i18n-ignore (Wikidata: a name)
      h('div', { class: 'row' }, flagRail(cid, UI.lang, x => { UI.lang = x; UI.prefs.lang = x; save(); draw(); }),
        h('button', { class: 'btn small' + (UI.prefs.compare ? ' primary' : ''), onclick: () => { UI.prefs.compare = !UI.prefs.compare; save(); draw(); } }, '⇄ ' + LT('lang.view.cmp'))));
    if (UI.prefs.compare) v.append(compareTable(cid), polyConceptStrip(cid));   // + the bridges among its words (P6)
    const X = LX(UI.lang), lids = X.byConcept[cid] || [];
    if (X.absent[cid]) v.append(h('div', { class: 'lx-absent' }, h('b', {}, info(UI.lang).flag + ' ' + LT('lang.card.noWordFor', { lang: info(UI.lang).name }) + ' '), X.absent[cid].reason, X.absent[cid].use ? h('div', {}, LT('lang.card.instead') + ' ', h('b', {}, X.absent[cid].use)) : null));
    else if (node && !X.prepared[node.id]) v.append(h('p', { class: 'lx-note' }, '⏳ ' + LT('lang.card.unwrittenIn', { lang: info(UI.lang).name })));
    for (const lid of lids) v.append(wordCardView(UI.lang, lid, cid));
  };
  draw();
};
VIEWS.w = (v, r) => { const c = r.arg, lid = r.arg2; if (!UI.C.lang[c]?.lex[lid]) return VIEWS.home(v); v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.back() }, '← ' + LT('lang.card.back'))), wordCardView(c, lid)); };

function compareTable(cid) {
  const rows = UI.C.languages.map(c => {
    const X = LX(c), lids = X.byConcept[cid] || [];
    const first = lids[0] && N.wordCard(UI.C, UI.L, c, lids[0]);
    return h('tr', {}, h('th', {}, info(c).flag + ' ' + info(c).label),
      h('td', {}, X.absent[cid] ? h('i', {}, '— ', X.absent[cid].use || LT('lang.card.noWordShort')) : lids.map((id, i) => [i ? h('br') : null, word(c, X.lex[id].lemma, { lex: X.lex[id] })])),
      h('td', { class: 'tiny' }, first ? (first.params?.length ? paramsLine(c, lids[0]) : first.parts.slice(0, 2).map(p => `${p[0]}: ${p[1]}`).join(' · ')) : ''),
      h('td', {}, first?.examples[0] ? h('span', {}, word(c, first.examples[0].text, { sub: false }), h('div', { class: 'tiny' }, first.examples[0].tr)) : ''));
  });
  return h('div', { class: 'lx-compare' }, h('table', {}, h('tbody', {}, ...rows)));
}

const CONNOTATION = { positive: '🙂', negative: '🙁', neutral: '😐', mixed: '🤔' };   // + lang.card.conn.<connotation>
/** A code of a word profile in words of the explanation language (a value the catalog does not know stays as the course wrote it):
    registers lc.expl.reg.*, phrase kinds lc.expl.phraseKind.* (langcore's words), status lang.expl.status.*, domains lang.expl.domain.*. */
const codeWord = (prefix, v) => v != null && v !== '' && window.NoemaI18n && NoemaI18n.has(prefix + v) ? LE(prefix + v) : v;
const regWord = r => codeWord('lc.expl.reg.', r), regWords = rs => [].concat(rs || []).map(regWord).join(', ');
/* ---------- the word's parameters, right under the word (R3, D14): label · value, the forms in the language's script ---------- */
/** One form of a parameter: in the language's font and direction (pinyin / a transliteration in Latin letters), its reading under it, a link to its own card. */
function paramForm(c, f) {
  const X = LX(c), showSub = f.sub && (c === 'zh' ? UI.prefs.pinyin !== false : UI.prefs.translit !== false || needTranslit(c));
  let e = f.latin ? h('span', { class: 'lx-platin', lang: c === 'zh' ? 'zh-Latn-pinyin' : 'und-Latn' }, f.text) : word(c, f.text, { sub: false });
  if (showSub) e = h('span', { class: 'lx-wbox' }, e, h('span', { class: 'lx-help', lang: c === 'zh' ? 'zh-Latn-pinyin' : 'und-Latn' }, f.sub));
  if (f.lex && X.lex[f.lex] && !document.querySelector('.lx-session')) e = h('a', { class: 'lx-plink', href: '#/w/' + c + '/' + encodeURIComponent(f.lex), title: gloss(c, f.lex), onclick: () => document.querySelector('.lx-pop')?.remove() }, e);
  return h('span', { class: 'lx-pform' + (f.role ? ' lx-p' + f.role : ''), dir: f.latin ? 'ltr' : null }, e);
}
/** One value: its forms, its kind (tags), the meanings it belongs to, a note. compact: forms and tags only. */
function paramValue(c, v, compact) {
  return h('span', { class: 'lx-pval' + (v.senses.length && !compact ? ' lx-pwide' : '') },
    ...v.forms.map(f => paramForm(c, f)),
    v.text ? h('span', { class: 'lx-ptext' }, v.text) : null,
    ...v.tags.map(t => h('span', { class: 'lx-ptag' }, t)),
    ...(compact ? [] : v.senses.map(s => h('span', { class: 'lx-psense', title: s.def }, h('b', {}, LNUM(s.n)), ' ', s.def))),
    v.note && !compact ? h('span', { class: 'lx-pnote' }, v.note) : null);
}
function paramRow(c, r, compact) {
  return h('div', { class: 'lx-prow' + (r.none != null ? ' lx-pnone' : '') + (r.short ? ' lx-pshort' : ''), 'data-param': r.id },
    h('span', { class: 'lx-pk' }, r.title),
    h('span', { class: 'lx-pv' }, r.none != null ? h('span', { class: 'lx-pwhy' }, '— ' + r.none) : r.values.map(v => paramValue(c, v, compact))));
}
/** The parameters block (R3): the prominent ones always visible, in the declared order; the rest (and the uninformative “none”s) folded.
 *  compact (lesson intro, lists): the first prominent ones only, without meanings and notes. */
function paramsBlock(c, params, { compact = false, max = 6 } = {}) {
  if (!params || !params.length) return null;
  const top = params.filter(r => r.prominent), rest = params.filter(r => !r.prominent);
  if (compact) { const rows = top.filter(r => r.none == null).slice(0, max); return rows.length ? h('div', { class: 'lx-params lx-pcompact' }, ...rows.map(r => paramRow(c, r, true))) : null; }
  return h('section', { class: 'lx-params', 'aria-label': LT('lang.card.params.label') },
    ...top.map(r => paramRow(c, r)),
    rest.length ? h('details', { class: 'lx-pmore' }, h('summary', {}, LT('lang.card.params.more', { n: rest.length })), h('div', { class: 'lx-pmorebody' }, ...rest.map(r => paramRow(c, r)))) : null);
}
/** One line for a list of words: “plural: die Männer · genitive: des Mannes” (the first prominent parameters, as text). */
function paramsLine(c, lid, max = 2) {
  let ps = []; try { ps = N.wordParams(UI.C, lid, c); } catch (e) { return null; }
  const bits = ps.filter(r => r.prominent && r.none == null && r.values.some(v => v.forms.length)).slice(0, max)
    .map(r => [r.title + ': ', ...r.values.flatMap((v, i) => [i ? ' · ' : '', ...v.forms.filter(f => f.role !== 'pattern').map(f => f.latin ? f.text : word(c, f.text, { sub: false }))])]);
  return bits.length ? h('span', { class: 'lx-pline tiny' }, ...bits.flatMap((b, i) => [i ? ' · ' : ' (', ...b]), ')') : null;
}
/** Everything about one word (docs/LANGUAGES.md §4.6). */
function wordCardView(c, lid, concept) {
  const card = N.wordCard(UI.C, UI.L, c, lid, { concept }), X = LX(c), lx = X.lex[lid];
  const badge = (t, cls = '') => t ? h('span', { class: 'lx-badge ' + cls }, t) : null;
  const ex = e => h('div', { class: 'lx-ex' },
    h('div', { class: 'lx-extext' }, word(c, e.text, { sub: false })),
    e.py && UI.prefs.pinyin !== false ? h('div', { class: 'lx-help' }, e.py) : null,
    X.language.vowelMarks && UI.prefs.marks !== false ? h('div', { class: 'lx-plain', lang: c, dir: X.language.dir }, e.plain) : null,
    h('div', { class: 'lx-tr' }, e.tr),
    h('div', { class: 'lx-chips' }, badge('🎭 ' + regWords(e.register), 'reg'), badge('📍 ' + e.context, 'ctx'), e.senseDef ? badge('≈ ' + e.senseDef, 'sense') : null,
      e.unknown?.length ? badge('🆕 ' + LT('lang.card.newWords', { n: e.unknown.length }), 'new') : null));
  const sec = {
    senses: items => h('ol', { class: 'lx-senses' }, ...items.map(s => h('li', { class: s.current ? 'lx-cur' : null },
      h('b', {}, s.def), ' ', badge(regWords(s.register), 'reg'), s.domains ? badge(s.domains.map(d => codeWord('lang.expl.domain.', d)).join(', '), 'ctx') : null,
      s.current ? badge('← ' + LT('lang.card.thisMeaning'), 'sense') : s.concept ? h('a', { class: 'lx-badge sense', href: '#/c/' + s.concept }, (s.pending ? '⏳ ' : '→ ') + s.gloss) : null,
      ...s.forms.map(f => badge(f.label + ': ' + f.text, 'ctx')),
      s.words.length ? h('div', { class: 'tiny' }, LT('lang.card.alsoSaid') + ' ', s.words.join(' · '), s.contrast ? h('span', {}, ' — ⇄ ', h('b', {}, s.contrast.axis), ': ', LT('lang.card.thisWordIs', { value: s.contrast.value })) : null) : null,
      s.nuances.length ? h('ul', { class: 'lx-list' }, ...s.nuances.map(n => h('li', {}, n.def, ' ', badge(regWords(n.register), 'reg'), ...n.forms.map(f => badge(f.label + ': ' + f.text, 'ctx'))))) : null))),
    facade: items => h('dl', { class: 'lx-parts' }, ...items.flatMap(x => [h('dt', {}, x.title), h('dd', { class: x.none ? 'tiny' : null }, /[֐-ۿ一-鿿]/.test(x.text) ? word(c, x.text, { sub: false }) : x.text)])),
    examples: items => h('div', {}, ...items.map(ex)),
    collocations: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' — ', x.tr))),
    particleVerbs: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' — ', x.tr))),
    phrases: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' ', badge(codeWord('lc.expl.phraseKind.', x.kind), 'ctx'), x.register ? badge(regWords(x.register), 'reg') : null,
      h('div', { class: 'tiny' }, '“' + x.tr + '” — ', h('b', {}, x.meaning), x.source ? ' (' + x.source + ')' : '')))),
    synonyms: groups => h('div', {}, ...Object.entries(groups).map(([reg, list]) => h('div', { class: 'lx-syngroup' }, badge(regWord(reg), 'reg'),
      h('ul', { class: 'lx-list' }, ...list.map(s => h('li', {}, word(c, s.word, { sub: false }), s.region ? badge('🗺️ ' + s.region, 'ctx') : null, ' — ', mdView(s.nuance, { forLang: c, inline: true }))))))),   // R2
    antonyms: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.word, { sub: false }), x.note ? ' — ' + x.note : ''))),
    pitfalls: items => h('ul', { class: 'lx-list lx-warn' }, ...items.map(x => h('li', {}, mdView(x, { forLang: c, inline: true })))),   // R2: structured texts
    subtleties: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, mdView(x, { forLang: c, inline: true })))),
    etymology: items => h('div', {}, ...items.map(x => h('p', {}, x.text, h('span', { class: 'tiny' }, ' — ' + x.src)))),
    funFacts: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, '💡 ', mdView(x, { forLang: c, inline: true })))),
  };
  return h('article', { class: 'lx-card', lang: UI.C.explainLang },
    h('div', { class: 'lx-cardtop' },
      h('div', { class: 'lx-lemma' }, word(c, lx.lemma, { lex: lx })),
      h('div', { class: 'lx-meta' }, h('div', {}, h('b', {}, card.gloss)), h('div', { class: 'lx-chips' },
        badge(STATE_LABEL[card.state] || card.state, 'st s-' + card.state), badge(card.frequency, 'freq'), badge(card.status && card.status !== 'current' ? codeWord('lang.expl.status.', card.status) : null, 'reg'),
        ...card.register.map(r => badge('🎭 ' + regWord(r), 'reg')), badge(card.connotation && CONNOTATION[card.connotation] ? CONNOTATION[card.connotation] + ' ' + LT('lang.card.conn.' + card.connotation) : null, 'ctx'),
        card.intensity ? badge(LT('lang.card.strength', { dots: '●'.repeat(card.intensity) + '○'.repeat(5 - card.intensity) }), 'ctx') : null))),
    card.params?.length ? paramsBlock(c, card.params)   // R3: the word's parameters, right under it
      : card.parts.length ? h('dl', { class: 'lx-parts' }, ...card.parts.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, /[֐-ۿ一-鿿]/.test(val) ? word(c, val, { sub: false }) : val)])) : null,
    deepButton(c, lid),
    card.feeling ? h('div', { class: 'lx-feeling' }, '💭 ', mdView(card.feeling, { forLang: c, inline: true })) : null,
    ...card.sections.filter(s => !(s.key === 'facade' && card.params?.length)).map(s => h('details', { class: 'lx-sec', open: ['senses', 'facade', 'examples', 'pitfalls'].includes(s.key) ? true : null },
      h('summary', {}, s.title, h('span', { class: 'tiny' }, ' ' + LNUM(Array.isArray(s.items) ? s.items.length : Object.values(s.items).flat().length))), sec[s.key](s.items))),
    ...wordNotesView(c, lx),   // R1: the word seen from the learner's languages and among the languages they learn (46_notes.js)
    polyWordExtras(c, lid),   // P6: bridges and false friends across the learner's languages
    card.synonymsNone ? h('p', { class: 'tiny' }, LT('lang.card.synonyms') + ' ', card.synonymsNone) : null,
    !card.hasProfile ? h('p', { class: 'tiny' }, LT('lang.card.littleWord') + ' ', gloss(c, lid)) : null);
}
