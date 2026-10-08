/* ---------- grammar: the page of a function in one language, with the same point in the other languages (§6.7, D10) ---------- */
const STATUS_LABEL = { realized: '', periphrastic: '≈ said another way', absent: '— not in this language' };

/** Content blocks (tools/CONTENT_SPEC.md) — the kinds the grammar files use. Foreign text inside is shown in the language's font and direction. */
function blocks(c, list) {
  const t = s => wordsIn(c, s);
  return (list || []).map(b => {
    if (b.t === 'p') return h('p', {}, t(b.text));
    if (b.t === 'list') return h(b.ordered ? 'ol' : 'ul', { class: 'lx-list' }, ...(b.items || []).map(x => h('li', {}, t(x))));
    if (b.t === 'table') return h('div', { class: 'lx-compare' }, h('table', {}, b.head ? h('thead', {}, h('tr', {}, ...b.head.map(x => h('th', {}, t(x))))) : null,
      h('tbody', {}, ...(b.rows || []).map(r => h('tr', {}, ...r.map(x => h('td', {}, t(x))))))), b.caption ? h('div', { class: 'tiny' }, b.caption) : null);
    if (b.t === 'callout') return h('div', { class: 'lx-callout k-' + (b.kind || 'key') }, b.title ? h('b', {}, b.title + ' ') : null, t(b.text));
    if (b.t === 'compare') return h('div', { class: 'lx-cmpblk' }, ...(b.items || []).map(it => h('div', {}, h('b', {}, t(it.title)), h('ul', { class: 'lx-list' }, ...(it.points || []).map(x => h('li', {}, t(x)))))));
    if (b.t === 'flow') return h('div', { class: 'lx-flow' }, ...(b.items || []).map((x, i) => [i ? h('span', { class: 'lx-arrow' }, '→') : null, h('span', { class: 'chip' }, t(x))]));
    if (b.t === 'ask') return h('div', { class: 'lx-callout k-tip' }, h('b', {}, (b.title || 'Ask yourself') + ' '), h('ul', { class: 'lx-list' }, ...(b.questions || []).map(x => h('li', {}, t(x)))));
    if (b.t === 'terms') return h('dl', { class: 'lx-parts' }, ...(b.items || []).flatMap(x => [h('dt', {}, x.term), h('dd', {}, t(x.def))]));
    if (b.t === 'reveal') return h('details', { class: 'lx-sec' }, h('summary', {}, b.label), h('p', {}, t(b.text)));
    return b.text ? h('p', {}, t(b.text)) : null;
  });
}
/** Mixed text: runs of Arabic, Hebrew or Chinese script get their own span (font, direction), the rest stays as it is. */
function wordsIn(c, s) {
  s = String(s ?? '');
  const re = /([֐-׿יִ-ﭏ]+(?:[\s֐-׿יִ-ﭏ]*[֐-׿יִ-ﭏ])?|[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:[\s؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿])?|[㐀-鿿豈-﫿　-〿＀-￯]+)/g;
  const out = []; let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const run = m[0], code = /[֐-׿יִ-ﭏ]/.test(run) ? 'he' : /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(run) ? 'ar' : 'zh';
    out.push(UI.C.lang[code] ? word(code, run, { sub: false }) : h('span', { lang: code, dir: code === 'zh' ? 'ltr' : 'rtl' }, run));
    last = m.index + run.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
const firstSentence = s => (String(s || '').match(/^.*?[.!?](\s|$)/) || [s || ''])[0].trim();

/** The same teaching point in every course language: status + the first sentence, each a link to that language's page. */
function acrossLanguages(fid, current, onPick) {
  const rows = UI.C.languages.map(c => {
    const g = LX(c).grammar[fid];
    return h('tr', { class: c === current ? 'on' : '' }, h('th', {}, h('button', { class: 'btn ghost small', onclick: () => onPick(c) }, info(c).flag + ' ' + info(c).name)),
      h('td', {}, !g ? h('i', { class: 'tiny' }, 'not written yet') : [g.status !== 'realized' ? h('span', { class: 'lx-badge reg' }, STATUS_LABEL[g.status]) : null, ' ', wordsIn(c, firstSentence(g.summary))]));
  });
  return h('div', { class: 'lx-compare lx-across' }, h('div', { class: 'tiny' }, '⇄ The same point in your other languages'), h('table', {}, h('tbody', {}, ...rows)));
}

/** One function in one language: the explanation, the checklist, the traps, sentences of the bank, the other languages. */
function grammarCard(c, fid, { compact = false, onPick = null } = {}) {
  const g = LX(c).grammar[fid], fn = UI.C.functions[fid] || { title: fid };
  if (!g) return h('div', { class: 'lx-card' }, h('h3', {}, fn.title), h('p', { class: 'lx-note' }, `⏳ Not written yet in ${info(c).name}.`));
  if (fn.category === 'overview') return overviewCard(c, g);
  const k = N.known(UI.C, UI.L, c);
  const ex = N.selectSentences(UI.C, c, { known: k.R, functions: [fid], maxUnknown: 9 }).sort((a, b) => a.unknown.length - b.unknown.length).slice(0, compact ? 3 : 8);
  return h('article', { class: 'lx-card lx-gram', lang: UI.C.explainLang, 'data-fn': fid, 'data-lang': c },
    h('div', { class: 'lx-cardtop' }, h('h3', {}, info(c).flag, ' ', fn.title), g.status !== 'realized' ? h('span', { class: 'lx-badge reg' }, STATUS_LABEL[g.status]) : null),
    h('p', { class: 'lx-summary' }, wordsIn(c, g.summary)),
    ...blocks(c, g.blocks),
    g.procedure?.askYourself?.length ? h('div', { class: 'lx-callout k-tip' }, h('b', {}, '🤔 Ask yourself '), h('ol', { class: 'lx-list' }, ...g.procedure.askYourself.map(x => h('li', {}, wordsIn(c, x))))) : null,
    g.traps?.length ? h('div', { class: 'lx-callout k-pitfall' }, h('b', {}, '⚠️ Traps '), h('ul', { class: 'lx-list' }, ...g.traps.map(x => h('li', {}, wordsIn(c, x))))) : null,
    ex.length ? h('details', { class: 'lx-sec', open: compact ? null : true }, h('summary', {}, 'In sentences ', h('span', { class: 'tiny' }, ex.length)),
      ...ex.map(s => h('div', { class: 'lx-ex' }, h('div', { class: 'lx-extext' }, word(c, s.text, { sub: false })), h('div', { class: 'lx-tr' }, s.gloss), s.unknown.length ? h('div', { class: 'tiny' }, '🆕 ', s.unknown.length, ' word(s) not learned yet') : null))) : null,
    (g.seeAlso || []).length ? h('div', { class: 'lx-callout k-key' }, h('b', {}, '🔗 See also '), h('ul', { class: 'lx-list' }, ...g.seeAlso.map(x => h('li', {},
      h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(x.fn || fid)}/${x.lang}`) }, info(x.lang).flag + ' ' + (UI.C.functions[x.fn || fid]?.title || x.fn)), ' ', x.note || '')))) : null,
    acrossLanguages(fid, c, onPick || (x => go(`#/fn/${encodeURIComponent(fid)}/${x}`))));
}

/** Lesson S00: the four types of languages (shared) and this language at a glance (D11). */
function typologyCard() {
  const T = UI.C.data.typology; if (!T) return null;
  return h('article', { class: 'lx-card lx-typology' }, h('h3', {}, '🧬 Four ways languages build words'), h('p', {}, T.intro),
    ...T.types.map(t => h('details', { class: 'lx-sec', open: true, 'data-type': t.id }, h('summary', {}, h('b', {}, t.name), ' ', UI.C.languages.filter(c => LX(c).typology === t.id).map(c => info(c).flag).join(' ')),
      h('p', {}, t.summary), t.learnFirst ? h('p', { class: 'tiny' }, '🧭 Learn first: ', t.learnFirst) : null,
      ...t.examples.map(e => h('div', { class: 'lx-ex' }, h('div', { class: 'lx-extext' }, info(e.lang).flag, ' ', UI.C.lang[e.lang] ? word(e.lang, e.text, { sub: false }) : h('span', { lang: e.lang }, e.text)), e.tr ? h('div', { class: 'lx-tr' }, e.tr) : null, h('div', { class: 'tiny' }, wordsIn('en', e.analysis)))),
      t.languages ? h('p', { class: 'tiny' }, 'Languages: ', t.languages) : null)),
    T.spectrum ? h('div', { class: 'lx-callout k-key' }, h('b', {}, 'A spectrum, not boxes. '), T.spectrum) : null);
}
function overviewCard(c, g) {
  const T = UI.C.data.typology, type = T?.types.find(t => t.id === g.typology?.type);
  const others = UI.C.languages.filter(x => x !== c);
  return h('article', { class: 'lx-card lx-overview', 'data-lang': c },
    h('h3', {}, info(c).flag, ' ', info(c).name, ' at a glance'), h('p', { class: 'lx-summary' }, wordsIn(c, g.summary)),
    h('dl', { class: 'lx-parts' }, ...(g.facts || []).flatMap(f => [h('dt', {}, f.label), h('dd', {}, wordsIn(c, f.value))])),
    h('div', { class: 'lx-callout k-key' }, h('b', {}, `Type: ${type?.name || g.typology?.type}. `), wordsIn(c, g.typology?.why), g.typology?.alsoShows ? h('div', { class: 'tiny' }, 'Also: ', wordsIn(c, g.typology.alsoShows)) : null),
    h('h4', {}, '✨ What is special from the very beginning'),
    h('ul', { class: 'lx-list' }, ...(g.peculiarities || []).map(p => h('li', {}, h('b', {}, p.title), ' — ', wordsIn(c, p.text)))),
    g.pathNote ? h('div', { class: 'lx-callout k-tip' }, h('b', {}, '🛤️ Its path through the steps '), wordsIn(c, g.pathNote)) : null,
    (g.forYou || []).length ? [h('h4', {}, '🧭 For you'), h('ul', { class: 'lx-list' }, ...g.forYou.map(f => h('li', {}, info(f.lang).flag, ' ', wordsIn(c, f.text))))] : null,
    learnerView(c),
    others.length ? h('p', { class: 'tiny' }, 'The same overview for: ', ...others.map(x => h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/fn.overview/${x}`) }, info(x).flag + ' ' + info(x).name))) : null);
}
/** D16 — computed, not written from one point of view: what is new and what is familiar for this learner, from the languages they know. */
function learnerView(c) {
  const knows = UI.C.data.course.knownLanguages || [], r = N.forLearner(UI.C, c, knows);
  if (!r || !knows.length) return null;
  const W = UI.C.data.world, name = k => (W.languages.find(l => l.code === k) || {}).name || k;
  const item = (x, extra) => h('li', {}, h('b', {}, x.p.kind === 'lacks' ? '∅ ' + x.p.title : x.p.title), ' — ', wordsIn(c, x.p.what || ''), extra);
  return h('div', { class: 'lx-forlearner' },
    h('h4', {}, `🧭 New for you, familiar to you`),
    h('p', { class: 'tiny' }, 'Computed from the languages you know: ', r.knownProfiles.map(name).join(', ') || '—',
      r.unknownLangs.length ? ` (no profile yet for ${r.unknownLangs.join(', ')})` : '', ` · ${r.new.length} new · ${r.familiar.length} familiar`),
    h('details', { class: 'lx-sec', open: true }, h('summary', {}, `✨ New for you (${r.new.length})`),
      h('ul', { class: 'lx-list' }, ...r.new.map(x => item(x, x.notes.length ? h('div', { class: 'tiny' }, ...x.notes.map(n => h('div', {}, '↳ ', h('b', {}, n.title + ': '), n.value, n.note ? ' — ' + n.note : ''))) : null)))),
    h('details', { class: 'lx-sec' }, h('summary', {}, `🤝 Familiar from your languages (${r.familiar.length})`),
      h('ul', { class: 'lx-list' }, ...r.familiar.map(x => item(x, h('span', { class: 'tiny' }, ' (as in ', x.from.map(name).join(', '), ')'))))));
}
VIEWS.fn = (v, r) => {
  const fid = r.arg, c = r.arg2 && UI.C.lang[r.arg2] ? r.arg2 : UI.lang; if (!UI.C.functions[fid]) return VIEWS.home(v);
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => history.length > 1 ? history.back() : go('#/') }, '← Back')),
    h('div', { class: 'row' }, flagRail(null, c, x => go(`#/fn/${encodeURIComponent(fid)}/${x}`))),
    fid === 'fn.overview' ? typologyCard() : null, grammarCard(c, fid));
};

/* ---------- exercises from langcore.exercises (§6.7): choose one, build a sentence ---------- */
function exChoose(it, done) {
  const box = h('div', { class: 'lx-ex lx-exchoose', 'data-kind': it.kind });
  const prompt = it.kind === 'quiz' ? h('div', { class: 'lx-prompt lx-quizq' }, wordsIn(it.lang, it.prompt)) : h('div', { class: 'lx-prompt' }, word(it.lang, it.prompt, { lex: it.lex ? LX(it.lang).lex[it.lex] : null }));
  const opt = o => ['gender', 'word', 'meaning', 'quiz'].includes(it.kind) ? wordsIn(it.lang, o) : word(it.lang, o, { sub: false });
  const opts = it.options.map(o => ({ label: opt(o), ok: o === it.answer }));
  box.append(it.ask ? h('div', { class: 'lx-q' }, it.ask) : null, prompt,
    options(opts, (o, b, wrap) => { b.classList.add(o.ok ? 'right' : 'wrong'); if (!o.ok) markOpts(wrap, i => opts[i].ok);
      box.append(h('div', { class: 'lx-fb ' + (o.ok ? 'ok' : 'bad') }, o.ok ? '✅ ' : '❌ ', wordsIn(it.lang, it.why || it.answer))); done(!!o.ok); }));
  return box;
}
function exBuild(it, done) {
  const X = LX(it.lang), box = h('div', { class: 'lx-ex lx-exbuild', 'data-kind': it.kind });
  if (it.kind === 'transform') box.append(h('div', { class: 'lx-q' }, it.change), h('div', { class: 'lx-prompt' }, word(it.lang, it.source, { sub: false })), h('div', { class: 'tiny' }, it.sourceGloss));
  else box.append(h('div', { class: 'lx-q' }, `Build it in ${info(it.lang).name}:`), h('div', { class: 'lx-prompt lx-meaning' }, it.gloss));
  const built = [], slot = h('div', { class: 'lx-slot', lang: it.lang, dir: X.language.dir }), pool = h('div', { class: 'lx-tiles', lang: it.lang, dir: X.language.dir });
  const join = () => N.joinTokens(built.map(b => ({ t: b.t })), X.language.tokenJoin);
  const draw = () => { slot.textContent = built.length ? join() + (built.length === it.size ? it.punct : '') : '…'; };
  let over = false;
  const check = () => {
    over = true; const ok = N.checkBuilt(UI.C, it.lang, it, built.map(b => b.t));
    slot.classList.add(ok ? 'right' : 'wrong'); [...pool.children].forEach(b => b.disabled = true);
    box.append(h('div', { class: 'lx-fb ' + (ok ? 'ok' : 'bad') }, ok ? '✅ ' : '❌ ', word(it.lang, it.answers[0], { sub: false }), h('div', { class: 'tiny' }, it.gloss))); done(ok);
  };
  it.tiles.forEach((t, i) => pool.append(h('button', { class: 'lx-tile1', 'data-i': i, onclick: e => { if (over || e.currentTarget.disabled) return; built.push({ t, i }); e.currentTarget.disabled = true; draw(); if (built.length === it.size) check(); } }, t)));
  const undo = h('button', { class: 'btn small ghost', onclick: () => { if (over || !built.length) return; const b = built.pop(); pool.children[b.i].disabled = false; draw(); } }, '⌫');
  const giveUp = h('button', { class: 'btn small ghost', onclick: () => { if (!over) { over = true; slot.classList.add('wrong'); box.append(h('div', { class: 'lx-fb bad' }, '❌ ', word(it.lang, it.answers[0], { sub: false }))); done(false); } } }, 'Show me');
  draw(); box.append(slot, pool, h('div', { class: 'row' }, undo, giveUp));
  return box;
}
const exItem = (it, done) => it.type === 'build' ? exBuild(it, done) : exChoose(it, done);
