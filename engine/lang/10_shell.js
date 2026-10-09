/* ---------- the shell: start, top bar, routes ---------- */
function start({ acc, id, data }) {
  UI.acc = acc; UI.id = id; UI.C = N.course(data); UI.L = loadLearner(); UI.day = today();
  UI.lang = UI.prefs.lang && UI.C.lang[UI.prefs.lang] ? UI.prefs.lang : activeLangs()[0];
  document.title = `${UI.C.data.course.title} · noema-lite`;
  document.documentElement.lang = UI.C.explainLang;
  const fonts = h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&family=Noto+Sans+Hebrew:wght@400;600&family=Noto+Sans+SC:wght@400;600&display=swap' });
  document.head.append(fonts);
  document.body.classList.add('lx');
  document.body.append(h('header', { class: 'topbar lx-top' }), h('main', { class: 'lx-main' }));
  addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });
  render();
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function route() { const p = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent); return { name: p[0] || 'home', arg: p[1] || null, arg2: p[2] || null }; }

function topbar() {
  const t = $('.lx-top'); t.innerHTML = '';
  const k = Object.fromEntries(activeLangs().map(c => [c, N.known(UI.C, UI.L, c)]));
  t.append(
    h('div', { class: 'brand', onclick: () => go('#/') }, h('div', { class: 'logo' }, '🌍'), h('span', { class: 'lx-title' }, UI.C.data.course.title)),
    h('span', { class: 'spacer' }),
    h('span', { class: 'chip lx-explain', title: 'Explanations, meanings and feedback are written in this language (chosen when the course was made)' }, '💬 ' + info(UI.C.explainLang).name),
    ...activeLangs().map(c => {
      const total = Object.keys(LX(c).lex).length, kn = Object.values(k[c].state).filter(s => ['known_r', 'known_p', 'mastered'].includes(s)).length;
      return h('button', { class: 'chip lx-flagchip' + (c === UI.lang ? ' on' : ''), title: `${info(c).name}: ${kn} of ${total} words known`, onclick: () => { UI.lang = c; UI.prefs.lang = c; save(); render(); } },
        h('span', { class: 'lx-flag' }, info(c).flag), c.toUpperCase(), h('span', { class: 'lx-ring', style: { '--p': total ? Math.round(kn / total * 100) : 0 } }));
    }),
    h('button', { class: 'iconbtn', title: 'Settings', onclick: () => go('#/settings') }, '⚙️'),
    h('button', { class: 'iconbtn', title: 'Choose another subject or course', onclick: () => window.Noema?.openSubjectPicker ? Noema.openSubjectPicker() : null }, '📚'));
}
const VIEWS = {};
function render() {
  const r = route(); UI.view = r.name;
  topbar();
  const m = $('.lx-main'); m.innerHTML = ''; window.scrollTo(0, 0);
  const v = h('div', { class: 'view lx-view' });
  m.append(v);
  (VIEWS[r.name] || VIEWS.home)(v, r);
}
/** A row of flag buttons for a card: one per course language, with the state of the concept in it. */
function flagRail(cid, current, onPick) {
  return h('div', { class: 'lx-rail', role: 'tablist', 'aria-label': 'Languages' }, ...UI.C.languages.map(c => {
    const st = cid ? N.conceptState(UI.C, UI.L, c, cid) : null;
    return h('button', { class: 'lx-railbtn' + (c === current ? ' on' : ''), role: 'tab', 'aria-selected': c === current ? 'true' : 'false', title: `${info(c).name} — ${STATE_LABEL[st] || ''}`, onclick: () => onPick(c) },
      h('span', { class: 'lx-flag' }, info(c).flag), h('span', { class: 'lx-dot s-' + (st || 'none') }));
  }));
}

/* ---------- home ---------- */
VIEWS.home = (v) => {
  const plan = N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20 });
  const nRev = plan.steps.filter(s => s.kind === 'review').reduce((a, s) => a + s.items.length, 0);
  const learn = plan.steps.find(s => s.kind === 'learn'), lessons = plan.steps.filter(s => s.kind === 'lesson');
  const nNew = learn ? learn.concepts.reduce((a, c) => a + c.langs.length, 0) : 0;
  v.append(h('div', { class: 'lx-hero' },
    h('h1', {}, UI.C.data.course.title),
    h('p', { class: 'lx-sub' }, `${UI.C.languages.map(c => info(c).flag + ' ' + info(c).name).join(' · ')} — explained in ${info(UI.C.explainLang).name}`),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary lx-go', disabled: !(nRev || nNew), onclick: () => runSession(plan) }, nRev || nNew ? `▶ Today's session — ${nRev} review${nRev === 1 ? '' : 's'} · ${nNew} new` : '✅ Nothing due — come back tomorrow'),
      learn ? h('span', { class: 'tiny' }, `new words from “${UI.C.nodes[learn.node].title}”, the same ideas in every language`) : null)));
  if (lessons.length) v.append(h('h2', { class: 'lx-h2' }, lessons.some(st => UI.C.nodes[st.node].stage === 'core') ? '🧱 Your next lesson' : '🧱 Foundations — your next lesson'), h('div', { class: 'lx-lessons' }, ...lessons.map(st => {
    const n = UI.C.nodes[st.node];
    return h('div', { class: 'lx-card lx-lessonbtn', 'data-node': st.node }, h('div', {}, h('span', { class: 'lx-step' }, stepLabel(n)), ' ', h('b', {}, n.title), h('div', { class: 'tiny' }, st.langs.map(c => info(c).flag + ' ' + info(c).name).join(' · '))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => go('#/lesson/' + st.node) }, 'Open'), h('button', { class: 'btn primary', onclick: () => runLesson(st.node, st.langs) }, '▶ Learn')));
  })));
  v.append(h('div', { class: 'row lx-drills' }, h('span', { class: 'tiny' }, '🏋️ Drills: '),
    h('button', { class: 'btn ghost small', onclick: () => go('#/parts/' + UI.lang) }, '🔁 Principal parts'),
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
