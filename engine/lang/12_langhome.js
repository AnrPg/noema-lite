/* ---------- the home of one language (#/lang/<code>): the central page about it — where you are, what is next, and everything else
   the language has (its libraries, topics, drills). A tap on a language opens this page, never a lesson. ---------- */
/** The languages the page shows: the one in the address, else all the learner studies. */
const scopeLangs = () => UI.scope && UI.C.lang[UI.scope] ? [UI.scope] : activeLangs();
/** The library of one language: [view name, address, shown?] — the labels are the views' own (lang.view.<name>). */
function langLibrary(c) {
  const lj = LX(c).language, nonLatin = lj.script !== 'Latn';
  return [['script', '#/script/' + c, nonLatin], ['listen', '#/listen/' + c, true], ['read', '#/read/' + c, true], ['write', '#/write/' + c, true], ['grammar', '#/grammar/' + c, true], ['aspects', '#/aspects/' + c, true],
    ['parts', '#/parts/' + c, true], ['peculiar', '#/peculiar/' + c, !!UI.C.data.world], ['recall', '#/recall/' + c, true], ['lanes', '#/lanes', UI.C.languages.length > 1]].filter(x => x[2]);
}
function langHome(v) {
  const c = UI.scope, X = LX(c), inf = info(c), k = N.known(UI.C, UI.L, c);
  const total = Object.keys(X.lex).length, kn = Object.values(k.state).filter(s => ['known_r', 'known_p', 'mastered'].includes(s)).length;
  const plan = N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20, languages: [c] });
  const nRev = plan.steps.filter(s => s.kind === 'review').reduce((a, s) => a + s.items.length, 0);
  const learn = plan.steps.find(s => s.kind === 'learn'), nNew = learn ? learn.concepts.reduce((a, x) => a + x.langs.length, 0) : 0;
  const lessons = plan.steps.filter(s => s.kind === 'lesson'), nid = lessons[0]?.node;
  const counts = LT('lang.home.sessionCounts', { rev: nRev, nNew });
  v.append(h('div', { class: 'lx-lhhead', 'data-lang': c },
    h('span', { class: 'lx-flag lx-lhflag' }, inf.flag),
    h('div', {}, h('h1', {}, inf.label), h('div', { class: 'tiny' }, [X.language.nativeName && X.language.nativeName !== inf.label ? X.language.nativeName : null, LT('lang.hub.known', { kn, total })].filter(Boolean).join(' · ')))));
  v.append(h('div', { class: 'lx-lhgo' },
    nid ? h('div', {}, h('span', { class: 'lx-step' }, stepLabel(UI.C.nodes[nid])), ' ', h('b', {}, UI.C.nodes[nid].title)) : h('div', {}, h('b', {}, LT('lang.hub.allDone'))),
    h('div', { class: 'row' }, nid ? continueButton(nid, [c]) : null,
      nRev || nNew ? h('button', { class: nid ? 'btn' : 'btn primary', 'data-go': 'session', onclick: () => runSession(plan) }, '▶ ' + LT('lang.home.session', { counts })) : h('span', { class: 'tiny' }, '✅ ' + LT('lang.home.nothingDue')))));
  const path = UI.C.order.filter(id => UI.C.nodes[id].kind === 'lesson' && X.applies[id]);
  if (path.length) {   // the lessons: a window around where you are; the rest one tap away
    const dn = path.map(id => ladderOf(id, [c]).done), at = Math.max(0, dn.indexOf(false)), from = Math.max(0, at - 2), to = Math.min(path.length, from + 12);
    const chip = (id, i) => h('button', { class: 'lx-lhstep' + (dn[i] ? ' d' : i === at ? ' n' : ''), title: UI.C.nodes[id].title, onclick: () => go('#/lesson/' + id) }, stepLabel(UI.C.nodes[id]));
    const row = h('div', { class: 'lx-lhpath' }), draw = all => { row.replaceChildren(...path.map((id, i) => [id, i]).filter(([, i]) => all || (i >= from && i < to)).map(([id, i]) => chip(id, i)),
      ...(all || path.length <= to - from ? [] : [h('button', { class: 'lx-lhstep', onclick: () => draw(true) }, '… +' + (path.length - (to - from)))])); };
    draw(false); v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.path')), row);
  }
  v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.library')), h('div', { class: 'lx-lhlib' }, ...langLibrary(c).map(([name, to]) => h('button', { class: 'lx-lhtile', 'data-view': name, onclick: () => go(to) }, LT('lang.view.' + name)))));
  const topics = (UI.C.data.fields || []).filter(f => (f.subgroups || []).length > 1);
  if (topics.length) v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.topics')), h('div', { class: 'lx-lhlib' }, ...topics.map(f => h('button', { class: 'lx-lhtile', onclick: () => go('#/sort/' + encodeURIComponent(f.field)) }, f.title))));
  v.append(h('div', { class: 'row lx-lhmore' },
    h('button', { class: 'btn ghost small', onclick: () => { location.hash = '#/search'; } }, '🔎 ' + LT('lang.hub.search')),
    UI.C.languages.length > 1 ? h('button', { class: 'btn ghost small', onclick: () => go('#/cmp') }, '⇄ ' + LT('lang.view.cmp')) : null,
    h('button', { class: 'btn ghost small', onclick: () => go('#/settings') }, LT('lang.view.settings'))));
}
