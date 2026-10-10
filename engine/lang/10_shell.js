/* ---------- the shell: start, top bar, routes ---------- */
let wired = false;
/** Open a course. host: an element inside the frame (the course is drawn there, its addresses live under #/lang/<course>/…,
    onRoute({ view, label, home }) tells the frame where the learner is); without it the course takes the whole page. */
function start({ acc, id, data, host = null, onRoute = null }) {
  if (UI.C && UI.acc) save(true);   // another course was open in this page (the frame opens one after the other)
  UI.acc = acc; UI.id = id; UI.C = N.course(data); UI.L = loadLearner(); UI.day = today(); UI.profiles = false;
  UI.lang = UI.prefs.lang && UI.C.lang[UI.prefs.lang] ? UI.prefs.lang : activeLangs()[0];
  FR.on = !!host; FR.host = host; FR.onRoute = onRoute; FR.base = host ? '#/lang/' + encodeURIComponent(id) : '';
  document.title = `${UI.C.data.course.title} · noema-lite`;
  document.documentElement.lang = UI.C.explainLang;
  if (!document.querySelector('link[data-lx-fonts]')) document.head.append(h('link', { rel: 'stylesheet', 'data-lx-fonts': '1', href: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&family=Noto+Sans+Hebrew:wght@400;600&family=Noto+Sans+SC:wght@400;600&display=swap' }));
  document.body.classList.add('lx');
  if (host) { host.replaceChildren(h('div', { class: 'lx-top lx-subbar', role: 'tablist', 'aria-label': 'Your languages' }), h('div', { class: 'lx-main' })); frameWatch(host); }   // inside the frame: its top bar and tabs stay
  else document.body.append(h('header', { class: 'topbar lx-top' }), h('main', { class: 'lx-main' }));
  if (!wired) {
    wired = true;
    addEventListener('hashchange', () => { if (!FR.on) render(); });   // inside the frame its router calls render()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && UI.C) save(true); });
  }
  render();
}
/** Is the course on screen? (inside the frame the learner may be on another tab) */
const shown = () => !FR.on || (!!FR.host?.isConnected && innerHash() != null);
function go(hash) { const full = toHash(hash); if (location.hash === full) render(); else location.hash = full; }
function route() { const p = (innerHash() || '#/').slice(2).split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }); return { name: p[0] || 'home', arg: p[1] || null, arg2: p[2] || null }; }

function topbar() {
  const t = $('.lx-top'); if (!t) return; t.innerHTML = '';
  const k = Object.fromEntries(activeLangs().map(c => [c, N.known(UI.C, UI.L, c)]));
  const chips = activeLangs().map(c => {
    const total = Object.keys(LX(c).lex).length, kn = Object.values(k[c].state).filter(s => ['known_r', 'known_p', 'mastered'].includes(s)).length;
    return h('button', { class: 'chip lx-flagchip' + (c === UI.lang ? ' on' : ''), 'data-lang': c, title: `${info(c).name}: ${kn} of ${total} words known`, onclick: () => { UI.lang = c; UI.prefs.lang = c; save(); render(); } },
      h('span', { class: 'lx-flag' }, info(c).flag), c.toUpperCase(), h('span', { class: 'lx-ring', style: { '--p': total ? Math.round(kn / total * 100) : 0 } }));
  });
  const explain = h('span', { class: 'chip lx-explain', title: 'Explanations, meanings and feedback are written in this language (chosen when the course was made)' }, '💬 ' + info(UI.C.explainLang).name);
  if (FR.on) { t.append(...chips, h('span', { class: 'spacer' }), explain); return; }   // the frame has the title (crumbs), ⚙️ and the other courses (⋮)
  t.append(
    h('div', { class: 'brand', onclick: () => go('#/') }, h('div', { class: 'logo' }, '🌍'), h('span', { class: 'lx-title' }, UI.C.data.course.title)),
    h('span', { class: 'spacer' }), explain, ...chips,
    h('button', { class: 'iconbtn', title: 'Settings', onclick: () => go('#/settings') }, '⚙️'),
    h('button', { class: 'iconbtn', title: 'Choose another subject or course', onclick: () => window.Noema?.openSubjectPicker ? Noema.openSubjectPicker() : null }, '📚'));
}
const VIEWS = {};
/** Where the learner is, in words: the last crumb of the frame. */
const VIEW_LABEL = { settings: 'Settings', claude: 'Through Claude', grammar: 'Grammar', write: 'Writing', read: 'Reading', script: 'Script', listen: 'Listening & speaking',
  cmp: 'Compare', poly: 'Polyglot drills', sort: 'Sort a field', parts: 'Principal parts', peculiar: 'Peculiarities', recall: 'Name them all', deep: 'Practise this word', deepen: 'Deepen' };
function viewLabel(r) {
  const C = UI.C, fl = c => C.lang[c] ? info(c).flag + ' ' : '';
  try {
    if (r.name === 'home') return null;
    if (r.name === 'c') return C.concepts[r.arg]?.gloss || r.arg;
    if (r.name === 'w') return C.lang[r.arg]?.lex[r.arg2]?.lemma || r.arg2;
    if (r.name === 'node' || r.name === 'lesson') return C.nodes[r.arg] ? (C.nodes[r.arg].kind === 'lesson' ? stepLabel(C.nodes[r.arg]) + ' ' : '') + C.nodes[r.arg].title : r.arg;
    if (r.name === 'fn') return C.functions[r.arg]?.title || r.arg;
    if (r.name === 'field') return (C.data.fields.find(f => f.field === r.arg) || {}).title || r.arg;
    if (r.name === 'deepen') return 'Deepen · ' + (C.nodes[r.arg]?.title || r.arg);
    return (r.arg && C.lang[r.arg] ? fl(r.arg) : '') + (VIEW_LABEL[r.name] || r.name);
  } catch (e) { return VIEW_LABEL[r.name] || r.name; }
}
function render() {
  if (!UI.C || !shown()) return;
  const r = route(); UI.view = r.name;
  if (FR.on) document.documentElement.lang = UI.C.explainLang;
  topbar();
  const m = $('.lx-main'); m.innerHTML = ''; window.scrollTo(0, 0);
  const v = h('div', { class: 'view lx-view' });
  m.append(v);
  (VIEWS[r.name] || VIEWS.home)(v, r);
  if (!FR.on) return;
  if (r.name === 'home') frameSummary(v);
  let acts = []; try { acts = frameTidy(v, r); } catch (e) { console.warn('[lang] frame', e); }   // main's calm style: one primary action, the rest in ⋮ (99z_frame.js)
  try { FR.onRoute?.({ view: r.name, label: viewLabel(r), home: r.name === 'home' && !r.arg, acts }); } catch (e) { console.warn('[lang] frame', e); }
}
/** What the frame's Languages tab and Today card show without loading the course: the next lesson (device-local, docs/LANGUAGES.md §8). */
function frameSummary(v) {
  try {
    const b = v.querySelector('.lx-lessonbtn'), nid = b?.dataset.node, n = nid && UI.C.nodes[nid];
    const k = `noema1:${UI.acc}:meta:langsum`, all = JSON.parse(localStorage.getItem(k) || '{}') || {};
    all[UI.id] = { at: Date.now(), title: UI.C.data.course.title, next: n ? { node: nid, step: stepLabel(n), title: n.title } : null, lang: UI.lang };
    localStorage.setItem(k, JSON.stringify(all));
  } catch (e) { }
}
/** A row of flag buttons for a card: one per course language, with the state of the concept in it. */
function flagRail(cid, current, onPick) {
  return h('div', { class: 'lx-rail', role: 'tablist', 'aria-label': 'Languages' }, ...UI.C.languages.map(c => {
    const st = cid ? N.conceptState(UI.C, UI.L, c, cid) : null;
    return h('button', { class: 'lx-railbtn' + (c === current ? ' on' : ''), 'data-lang': c, role: 'tab', 'aria-selected': c === current ? 'true' : 'false', title: `${info(c).name} — ${STATE_LABEL[st] || ''}`, onclick: () => onPick(c) },
      h('span', { class: 'lx-flag' }, info(c).flag), h('span', { class: 'lx-dot s-' + (st || 'none') }));
  }));
}

/* ---------- home ---------- */
VIEWS.home = (v) => {
  const plan = N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20, languages: todayLangs() });   // today's languages (P6, §9.6)
  const nRev = plan.steps.filter(s => s.kind === 'review').reduce((a, s) => a + s.items.length, 0);
  const learn = plan.steps.find(s => s.kind === 'learn'), lessons = plan.steps.filter(s => s.kind === 'lesson');
  const nNew = learn ? learn.concepts.reduce((a, c) => a + c.langs.length, 0) : 0, nScript = scriptSessionSteps().length;   // letters / characters in the first weeks (P4)
  v.append(h('div', { class: 'lx-hero' },
    h('h1', {}, UI.C.data.course.title),
    h('p', { class: 'lx-sub' }, `${UI.C.languages.map(c => info(c).flag + ' ' + info(c).name).join(' · ')} — explained in ${info(UI.C.explainLang).name}`),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary lx-go', disabled: !(nRev || nNew || nScript), onclick: () => runSession(plan) }, nRev || nNew || nScript ? `▶ Today's session — ${nRev} review${nRev === 1 ? '' : 's'} · ${nNew} new` + (nScript ? ` · ${nScript} letters & characters` : '') : '✅ Nothing due — come back tomorrow'),
      learn ? h('span', { class: 'tiny' }, `new words from “${UI.C.nodes[learn.node].title}”, the same ideas in every language`) : null)));
  v.append(polyHome());   // P6: today's languages, the compare lane, the polyglot drills
  if (lessons.length) v.append(h('h2', { class: 'lx-h2' }, lessons.some(st => UI.C.nodes[st.node].stage === 'core') ? '🧱 Your next lesson' : '🧱 Foundations — your next lesson'), h('div', { class: 'lx-lessons' }, ...lessons.map(st => {
    const n = UI.C.nodes[st.node];
    return h('div', { class: 'lx-card lx-lessonbtn', 'data-node': st.node }, h('div', {}, h('span', { class: 'lx-step' }, stepLabel(n)), ' ', h('b', {}, n.title), h('div', { class: 'tiny' }, st.langs.map(c => info(c).flag + ' ' + info(c).name).join(' · '))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => go('#/lesson/' + st.node) }, 'Open'), h('button', { class: 'btn primary', onclick: () => runLesson(st.node, st.langs) }, '▶ Learn')));
  })));
  v.append(h('div', { class: 'row lx-drills' }, h('span', { class: 'tiny' }, '🏋️ Drills: '),
    h('button', { class: 'btn ghost small', onclick: () => go('#/parts/' + UI.lang) }, '🔁 Principal parts'), ...scriptHomeButtons(),
    ...UI.C.data.fields.filter(f => (f.subgroups || []).length > 1).map(f => h('button', { class: 'btn ghost small', onclick: () => go('#/sort/' + encodeURIComponent(f.field)) }, '🧩 ' + f.title))));
  if (UI.C.data.world) v.append(h('div', { class: 'row lx-libraries' }, h('span', { class: 'tiny' }, '📚 Peculiarities, any time: '),
    ...activeLangs().map(c => h('button', { class: 'btn ghost small', onclick: () => go('#/peculiar/' + c) }, info(c).flag + ' ' + info(c).name))));
  if (typeof grammarLaneHome === 'function') v.append(grammarLaneHome());   // P5: the 📐 grammar lane
  v.append(h('h2', { class: 'lx-h2' }, '🗺️ The map'), nodeList());
};
function nodeList() {
  const st = Object.fromEntries(UI.C.languages.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  return h('div', { class: 'lx-nodes' }, ...UI.C.order.filter(nid => UI.C.nodes[nid].kind !== 'lesson' || activeLangs().some(c => LX(c).applies[nid])).map(nid => {
    const n = UI.C.nodes[nid];
    return h('button', { class: 'lx-node' + (n.kind === 'lesson' ? ' lx-lessonnode' : ''), onclick: () => go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid) },
      h('div', { class: 'lx-nodetitle' }, h('b', {}, n.kind === 'lesson' ? h('span', { class: 'lx-step' }, stepLabel(n)) : null, n.kind === 'lesson' ? ' ' : null, n.title), h('span', { class: 'tiny' }, `${n.concepts.length} ideas` + (n.prereqs?.length ? ' · after ' + n.prereqs.map(p => UI.C.nodes[p].title.split(' — ')[0]).join(', ') : ''))),
      h('div', { class: 'lx-nodestates' }, ...UI.C.languages.map(c => h('span', { class: 'lx-ns ns-' + st[c][nid], title: `${info(c).name}: ${STATE_LABEL[st[c][nid]] || st[c][nid]}` }, info(c).flag, ' ', (STATE_LABEL[st[c][nid]] || st[c][nid])))));
  }));
}
