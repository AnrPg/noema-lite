/* ---------- a node: its ideas, in the chosen language ---------- */
VIEWS.node = (v, r) => {
  const n = UI.C.nodes[r.arg]; if (!n) return VIEWS.home(v);
  if (n.kind === 'lesson') return VIEWS.lesson(v, r);
  const c = UI.lang, X = LX(c), k = N.known(UI.C, UI.L, c), ns = k.nodes[n.id];
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, n.title),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
      h('span', { class: 'lx-ns ns-' + ns }, info(c).flag, ' ', STATE_LABEL[ns] || ns)),
    h('div', { class: 'row lx-actions' },
      ['open', 'learning', 'known', 'mastered'].includes(ns) ? h('button', { class: 'btn primary small', onclick: () => runSession(N.planSession(UI.C, UI.L, { day: today(), minutes: 15, languages: [c] }), { only: n.id }) }, '▶ Learn / review this node') : null,
      n.kind === 'field' ? h('button', { class: 'btn small', onclick: () => go('#/field/' + encodeURIComponent(n.field) + '/' + n.tier) }, '🧺 Field map') : null,
      n.kind === 'field' && ['learning', 'known', 'mastered'].includes(ns) ? h('button', { class: 'btn small', onclick: () => go('#/recall/' + encodeURIComponent(n.field)) }, '⏱️ Name them all') : null,
      deepenButton(n.id, c)),
    !X.prepared[n.id] ? h('p', { class: 'lx-note' }, `⏳ The ${info(c).name} words of this node are not written yet.`) : null);
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
    h('span', { class: 'lx-tword' }, absent ? h('i', { class: 'tiny' }, '— no word') : visible ? lids.map((id, i) => [i ? ' · ' : '', word(c, X.lex[id].lemma, { sub: false })]) : '?'),
    h('span', { class: 'lx-tgloss' }, cid ? UI.C.concepts[cid].gloss : gloss(c, lex)));
}

/* ---------- a concept: the flag card (one language at a time) + compare ---------- */
VIEWS.c = (v, r) => {
  const cid = r.arg, con = UI.C.concepts[cid]; if (!con) return VIEWS.home(v);
  const node = UI.C.nodes[LX(UI.lang).owner[cid] || UI.C.owner[cid]];
  const draw = () => {
    v.innerHTML = ''; topbar();
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 || !node ? history.back() : go('#/node/' + node.id) }, '← ' + (node ? node.title : 'Back'))),
      h('div', { class: 'lx-cardhead' }, conceptPic(cid, 'lx-bigemoji'), h('div', {}, h('h1', {}, con.gloss), h('div', { class: 'tiny' }, [node ? node.title : '⏳ a meaning not taught yet (D15) — met as another meaning of a word you learn', con.wikidata ? 'Wikidata ' + con.wikidata : null].filter(Boolean).join(' · ')))),
      h('div', { class: 'row' }, flagRail(cid, UI.lang, x => { UI.lang = x; UI.prefs.lang = x; save(); draw(); }),
        h('button', { class: 'btn small' + (UI.prefs.compare ? ' primary' : ''), onclick: () => { UI.prefs.compare = !UI.prefs.compare; save(); draw(); } }, '⇄ Compare')));
    if (UI.prefs.compare) v.append(compareTable(cid), polyConceptStrip(cid));   // + the bridges among its words (P6)
    const X = LX(UI.lang), lids = X.byConcept[cid] || [];
    if (X.absent[cid]) v.append(h('div', { class: 'lx-absent' }, h('b', {}, `${info(UI.lang).flag} No ${info(UI.lang).name} word for this. `), X.absent[cid].reason, X.absent[cid].use ? h('div', {}, 'Instead: ', h('b', {}, X.absent[cid].use)) : null));
    else if (node && !X.prepared[node.id]) v.append(h('p', { class: 'lx-note' }, `⏳ Not written yet in ${info(UI.lang).name}.`));
    for (const lid of lids) v.append(wordCardView(UI.lang, lid, cid));
  };
  draw();
};
VIEWS.w = (v, r) => { const c = r.arg, lid = r.arg2; if (!UI.C.lang[c]?.lex[lid]) return VIEWS.home(v); v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.back() }, '← Back')), wordCardView(c, lid)); };

function compareTable(cid) {
  const rows = UI.C.languages.map(c => {
    const X = LX(c), lids = X.byConcept[cid] || [];
    const first = lids[0] && N.wordCard(UI.C, UI.L, c, lids[0]);
    return h('tr', {}, h('th', {}, info(c).flag + ' ' + info(c).name),
      h('td', {}, X.absent[cid] ? h('i', {}, '— ', X.absent[cid].use || 'no word') : lids.map((id, i) => [i ? h('br') : null, word(c, X.lex[id].lemma, { lex: X.lex[id] })])),
      h('td', { class: 'tiny' }, first ? first.parts.slice(0, 2).map(p => `${p[0]}: ${p[1]}`).join(' · ') : ''),
      h('td', {}, first?.examples[0] ? h('span', {}, word(c, first.examples[0].text, { sub: false }), h('div', { class: 'tiny' }, first.examples[0].tr)) : ''));
  });
  return h('div', { class: 'lx-compare' }, h('table', {}, h('tbody', {}, ...rows)));
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
    h('div', { class: 'lx-chips' }, badge('🎭 ' + [].concat(e.register).join(', '), 'reg'), badge('📍 ' + e.context, 'ctx'), e.senseDef ? badge('≈ ' + e.senseDef, 'sense') : null,
      e.unknown?.length ? badge('🆕 ' + e.unknown.length + ' new word' + (e.unknown.length > 1 ? 's' : ''), 'new') : null));
  const sec = {
    senses: items => h('ol', { class: 'lx-senses' }, ...items.map(s => h('li', { class: s.current ? 'lx-cur' : null },
      h('b', {}, s.def), ' ', badge([].concat(s.register || []).join(', '), 'reg'), s.domains ? badge(s.domains.join(', '), 'ctx') : null,
      s.current ? badge('← this meaning', 'sense') : s.concept ? h('a', { class: 'lx-badge sense', href: '#/c/' + s.concept }, (s.pending ? '⏳ ' : '→ ') + s.gloss) : null,
      ...s.forms.map(f => badge(f.label + ': ' + f.text, 'ctx')),
      s.words.length ? h('div', { class: 'tiny' }, 'also said: ', s.words.join(' · '), s.contrast ? h('span', {}, ' — ⇄ ', h('b', {}, s.contrast.axis), ': this word = ', s.contrast.value) : null) : null,
      s.nuances.length ? h('ul', { class: 'lx-list' }, ...s.nuances.map(n => h('li', {}, n.def, ' ', badge([].concat(n.register || []).join(', '), 'reg'), ...n.forms.map(f => badge(f.label + ': ' + f.text, 'ctx'))))) : null))),
    facade: items => h('dl', { class: 'lx-parts' }, ...items.flatMap(x => [h('dt', {}, x.title), h('dd', { class: x.none ? 'tiny' : null }, /[֐-ۿ一-鿿]/.test(x.text) ? word(c, x.text, { sub: false }) : x.text)])),
    examples: items => h('div', {}, ...items.map(ex)),
    collocations: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' — ', x.tr))),
    particleVerbs: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' — ', x.tr))),
    phrases: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.text, { sub: false }), ' ', badge(x.kind, 'ctx'), x.register ? badge([].concat(x.register).join(', '), 'reg') : null,
      h('div', { class: 'tiny' }, '“' + x.tr + '” — ', h('b', {}, x.meaning), x.source ? ' (' + x.source + ')' : '')))),
    synonyms: groups => h('div', {}, ...Object.entries(groups).map(([reg, list]) => h('div', { class: 'lx-syngroup' }, badge(reg, 'reg'),
      h('ul', { class: 'lx-list' }, ...list.map(s => h('li', {}, word(c, s.word, { sub: false }), s.region ? badge('🗺️ ' + s.region, 'ctx') : null, ' — ', s.nuance)))))),
    antonyms: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, word(c, x.word, { sub: false }), x.note ? ' — ' + x.note : ''))),
    pitfalls: items => h('ul', { class: 'lx-list lx-warn' }, ...items.map(x => h('li', {}, x))),
    subtleties: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, x))),
    etymology: items => h('div', {}, ...items.map(x => h('p', {}, x.text, h('span', { class: 'tiny' }, ' — ' + x.src)))),
    funFacts: items => h('ul', { class: 'lx-list' }, ...items.map(x => h('li', {}, '💡 ', x))),
  };
  return h('article', { class: 'lx-card', lang: UI.C.explainLang },
    h('div', { class: 'lx-cardtop' },
      h('div', { class: 'lx-lemma' }, word(c, lx.lemma, { lex: lx })),
      h('div', { class: 'lx-meta' }, h('div', {}, h('b', {}, card.gloss)), h('div', { class: 'lx-chips' },
        badge(STATE_LABEL[card.state] || card.state, 'st s-' + card.state), badge(card.frequency, 'freq'), badge(card.status && card.status !== 'current' ? card.status : null, 'reg'),
        ...card.register.map(r => badge('🎭 ' + r, 'reg')), badge(card.connotation ? { positive: '🙂 positive', negative: '🙁 negative', neutral: '😐 neutral', mixed: '🤔 mixed' }[card.connotation] : null, 'ctx'),
        card.intensity ? badge('strength ' + '●'.repeat(card.intensity) + '○'.repeat(5 - card.intensity), 'ctx') : null))),
    card.parts.length ? h('dl', { class: 'lx-parts' }, ...card.parts.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, /[֐-ۿ一-鿿]/.test(val) ? word(c, val, { sub: false }) : val)])) : null,
    deepButton(c, lid),
    card.feeling ? h('p', { class: 'lx-feeling' }, '💭 ', card.feeling) : null,
    ...card.sections.map(s => h('details', { class: 'lx-sec', open: ['senses', 'facade', 'examples', 'pitfalls'].includes(s.key) ? true : null },
      h('summary', {}, s.title, h('span', { class: 'tiny' }, ' ' + (Array.isArray(s.items) ? s.items.length : Object.values(s.items).flat().length))), sec[s.key](s.items))),
    polyWordExtras(c, lid),   // P6: bridges and false friends across the learner's languages
    card.synonymsNone ? h('p', { class: 'tiny' }, 'Synonyms: ', card.synonymsNone) : null,
    !card.hasProfile ? h('p', { class: 'tiny' }, 'A little word: ', gloss(c, lid)) : null);
}
