/* ---------- the course for the new screens (src/ui/screens/languages, src/ui/screens/languages-activities.ts): the port
   src/ui/screens/languages/course-port.ts answered from this course's state — plain models and the commands its pages start.
   A view that is a new screen draws a host here and NoemaCore.screens mounts the screen of its address into it (screenHost). ---------- */
/** The languages the page shows: the one in the address, else all the learner studies. */
const scopeLangs = () => UI.scope && UI.C.lang[UI.scope] ? [UI.scope] : activeLangs();
/** The aspects of one language the home offers: [aspect, address, how many grammar points]. A grammar aspect only when the language has points in it; the ones read from the word profiles always. */
function langAspects(c) {
  const X = LX(c), fns = Object.keys(X.grammar).filter(f => X.grammar[f] && X.grammar[f].status !== 'absent' && aspectOf(f)), n = a => fns.filter(f => aspectOf(f) === a).length, pg = a => '#/aspects/' + c + '/' + a;
  return [['sounds', pg('sounds'), n('sounds')], ['writing', pg('writing'), 0], ['grammar', pg('grammar'), n('grammar')], ['meaning', pg('meaning'), n('meaning')], ['use', pg('use'), n('use')],
    ['etymology', pg('etymology'), 0], ['culture', pg('culture'), 0], ['listening', '#/listen/' + c + '/listening', 0], ['speaking', '#/listen/' + c + '/speaking', 0], ['reading', '#/read/' + c, 0]].filter(x => !['sounds', 'meaning'].includes(x[0]) || x[2] > 0);
}
/** What is not an aspect of the language but a way to practise or look at it: [view name, address]. */
function langTools(c) {
  return [['parts', '#/parts/' + c], ['recall', '#/recall/' + c], ['peculiar', '#/peculiar/' + c, !!UI.C.data.world]].filter(x => x[2] !== false);
}
const KNOWN_STATES = ['known_r', 'known_p', 'mastered'];
/** A language as the screens name it (course-port.ts CourseLang). */
function courseLang(c) {
  const inf = info(c), k = N.known(UI.C, UI.L, c);
  return { code: c, flag: inf.flag, label: inf.label, name: inf.name, known: Object.values(k.state).filter(s => KNOWN_STATES.includes(s)).length, total: Object.keys(LX(c).lex).length };
}
const planFor = langs => N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20, languages: langs });
const COURSE_PORT = {
  home(c) {
    const X = LX(c), lang = courseLang(c), plan = planFor([c]);
    const reviews = plan.steps.filter(s => s.kind === 'review').reduce((a, s) => a + s.items.length, 0);
    const learn = plan.steps.find(s => s.kind === 'learn'), newWords = learn ? learn.concepts.reduce((a, x) => a + x.langs.length, 0) : 0;
    const nid = plan.steps.find(s => s.kind === 'lesson')?.node, n = nid && UI.C.nodes[nid];
    return {
      lang, nativeName: X.language.nativeName && X.language.nativeName !== lang.label ? X.language.nativeName : null,
      next: n ? { id: nid, step: stepLabel(n), title: n.title, ladderStep: ladderOf(nid, [c]).next } : null,
      due: { reviews, newWords }, lanes: UI.C.languages.length > 1,
      path: UI.C.order.filter(id => UI.C.nodes[id].kind === 'lesson' && X.applies[id]).map(id => ({ id, step: stepLabel(UI.C.nodes[id]), title: UI.C.nodes[id].title, done: ladderOf(id, [c]).done })),
      aspects: langAspects(c).map(([aspect, href, points]) => ({ aspect, href, points })),
      topics: (UI.C.data.fields || []).filter(f => (f.subgroups || []).length > 1).map(f => ({ field: f.field, title: f.title })),
      tools: langTools(c).map(([name, href]) => ({ name, href })),
    };
  },
  strip: () => ({ langs: activeLangs().map(courseLang), current: UI.scope || (FR.pick ? FR.pick.cur : null), explainName: info(UI.C.explainLang).name }),
  go: hash => go(hash),
  pick(c) {   // a page of one language: the same page for another (the address carries it); a page of all: the language it shows
    if (c && !UI.scope && FR.pick) { FR.pick.fn(c); syncStrip(); return; }
    const inner = (innerHash() || '#/').replace(/^#\/?/, '');
    location.hash = '#/lang/' + encodeURIComponent(c || UI.id) + (inner ? '/' + (c ? inScope(inner, c) : inner) : '');
  },
  continueLesson: (nid, langs) => runLesson(nid, [...langs]),
  session: c => runSession(planFor([c])),
};
/** The address the new screens know a course page by: #/lang/<code or course>/<the course's own address>. */
function screenHash() {
  const inner = (innerHash() || '#/').replace(/^#\/?/, '');
  return '#/lang/' + encodeURIComponent(UI.scope || UI.id) + (inner ? '/' + inner : '');
}
const screenFailed = host => e => {
  NoemaCore.errors.report(e, { where: 'lang.screens', severity: 'warning' });
  host.replaceChildren(h('p', { class: 'lx-note' }, LT('lang.screen.failed')));
};
/** A host for a new screen inside a view; NoemaCore.screens mounts the screen of the address into it. */
function screenHost(v, hash = screenHash(), cls = 'lx-screen') {
  const host = h('div', { class: cls });
  v.append(host);
  NoemaCore.screens.mount(hash, host, { account: { id: UI.acc }, course: COURSE_PORT }).catch(screenFailed(host));
  return host;
}
/** A host for a part of a page (the strip of languages, the chooser of languages: src/ui/screens/languages-activities.ts). */
function screenPart(v, name, cls, options) {
  const host = h('div', { class: cls });
  v.append(host);
  NoemaCore.screens.part(name, host, { account: { id: UI.acc }, course: COURSE_PORT }, options).catch(screenFailed(host));
  return host;
}
