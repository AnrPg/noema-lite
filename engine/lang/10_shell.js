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
  const learn = plan.steps.find(s => s.kind === 'learn');
  const nNew = learn ? learn.concepts.reduce((a, c) => a + c.langs.length, 0) : 0;
  v.append(h('div', { class: 'lx-hero' },
    h('h1', {}, UI.C.data.course.title),
    h('p', { class: 'lx-sub' }, `${UI.C.languages.map(c => info(c).flag + ' ' + info(c).name).join(' · ')} — explained in ${info(UI.C.explainLang).name}`),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary lx-go', disabled: !(nRev || nNew), onclick: () => runSession(plan) }, nRev || nNew ? `▶ Today's session — ${nRev} review${nRev === 1 ? '' : 's'} · ${nNew} new` : '✅ Nothing due — come back tomorrow'),
      learn ? h('span', { class: 'tiny' }, `new words from “${UI.C.nodes[learn.node].title}”, the same ideas in every language`) : null)));
  v.append(h('h2', { class: 'lx-h2' }, '🗺️ The vocabulary map'), nodeList());
};
function nodeList() {
  const st = Object.fromEntries(UI.C.languages.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  return h('div', { class: 'lx-nodes' }, ...UI.C.order.map(nid => {
    const n = UI.C.nodes[nid];
    return h('button', { class: 'lx-node', onclick: () => go('#/node/' + nid) },
      h('div', { class: 'lx-nodetitle' }, h('b', {}, n.title), h('span', { class: 'tiny' }, `${n.concepts.length} ideas` + (n.prereqs?.length ? ' · after ' + n.prereqs.map(p => UI.C.nodes[p].title.split(' — ')[0]).join(', ') : ''))),
      h('div', { class: 'lx-nodestates' }, ...UI.C.languages.map(c => h('span', { class: 'lx-ns ns-' + st[c][nid], title: `${info(c).name}: ${STATE_LABEL[st[c][nid]] || st[c][nid]}` }, info(c).flag, ' ', (STATE_LABEL[st[c][nid]] || st[c][nid])))));
  }));
}
