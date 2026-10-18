/* ---------- the home of one language (#/lang/<code>): the central page about it — where you are, what is next, and everything else
   the language has (its libraries, topics, drills). A tap on a language opens this page, never a lesson. ---------- */
/** The languages the page shows: the one in the address, else all the learner studies. */
const scopeLangs = () => UI.scope && UI.C.lang[UI.scope] ? [UI.scope] : activeLangs();
/** The aspects of one language the home offers: [aspect, address, how many points]. Only an aspect the language has something for. */
function langAspects(c) {
  const X = LX(c), fns = Object.keys(X.grammar).filter(f => X.grammar[f] && X.grammar[f].status !== 'absent' && aspectOf(f)), n = a => fns.filter(f => aspectOf(f) === a).length;
  return [...ASPECT_ORDER.filter(a => n(a)).map(a => [a, '#/aspects/' + c + '/' + a, n(a)]), ['writing', '#/aspects/' + c + '/writing', 0], ['listening', '#/aspects/' + c + '/listening', 0], ['reading', '#/aspects/' + c + '/reading', 0]];
}
/** What is not an aspect of the language but a way to practise or look at it: [view name, address]. */
function langTools(c) {
  return [['parts', '#/parts/' + c], ['recall', '#/recall/' + c], ['peculiar', '#/peculiar/' + c, !!UI.C.data.world], ['lanes', '#/lanes', UI.C.languages.length > 1]].filter(x => x[2] !== false);
}
/** The topics of the vocabulary as a shelf of books: one book per topic, each its own colour, height and lean. */
function topicShelf(topics) {
  const PAL = [350, 28, 48, 95, 150, 185, 215, 255, 290, 320], hash = t => [...t].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7), per = 7, rows = [];
  for (let i = 0; i < topics.length; i += per) rows.push(topics.slice(i, i + per));
  return h('div', { class: 'lx-shelf' }, ...rows.map((row, ri) => h('div', { class: 'lx-shelfrow' }, ...row.map((f, i) => {
    const k = hash(f.field), n = PAL[(ri * 3 + i * 3 + k % 3) % PAL.length], len = [...f.title].length, w = 38 + (k % 4) * 5, ht = 96 + (k % 5) * 8 + Math.min(len, 26) * 4, lean = (k % 7 === 0 ? 7 : k % 11 === 0 ? -6 : 0);
    const book = h('button', { class: 'lx-book', title: f.title, onclick: () => go('#/sort/' + encodeURIComponent(f.field)) }, h('span', { class: 'lx-spine' }, f.title));
    for (const [k, v] of Object.entries({ '--h': n, '--bw': w + 'px', '--bh': ht + 'px', '--lean': lean + 'deg', '--d': (ri * per + i) * 70 + 'ms' })) book.style.setProperty(k, v);   // custom properties need setProperty
    return book;
  }))));
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
  v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.aspects', { lang: inf.label })), h('div', { class: 'lx-lhaspects' }, ...langAspects(c).map(([a, to, n]) =>
    h('button', { class: 'lx-lhtile lx-asp lx-asp-' + a, 'data-aspect': a, onclick: () => go(to) }, h('b', {}, LT('lang.aspect.' + a)), n ? h('span', { class: 'tiny' }, LT('lang.hub.points', { n })) : null))));
  const topics = (UI.C.data.fields || []).filter(f => (f.subgroups || []).length > 1);
  if (topics.length) v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.shelf')), topicShelf(topics));
  const tools = langTools(c);
  v.append(h('h2', { class: 'lx-h2' }, LT('lang.hub.tools')), h('div', { class: 'lx-lhlib' }, ...tools.map(([name, to]) => h('button', { class: 'lx-lhtile lx-lhtool', 'data-view': name, onclick: () => go(to) }, LT('lang.view.' + name)))));
}
