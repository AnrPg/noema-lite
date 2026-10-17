/* ---------- the shell: start, top bar, routes ---------- */
let wired = false;
/** Open a course. host: an element inside the frame (the course is drawn there, its addresses live under #/lang/<course>/…,
    onRoute({ view, label, home }) tells the frame where the learner is); without it the course takes the whole page. */
function start({ acc, id, data, host = null, onRoute = null }) {
  if (UI.C && UI.acc) save(true);   // another course was open in this page (the frame opens one after the other)
  UI.acc = acc; UI.id = id; UI.data = data; UI.facade = null; UI.profMap = null; UI.L = null; UI.C = buildCourse(data); UI.L = loadLearner(); UI.day = today(); UI.profiles = false;
  window.NoemaLangUI?.claude?.activateAdded?.();   // a language a package added (docs/LANGUAGES.md §10.2) is active once
  if (studyChoice().langs.join() !== UI.C.languages.join()) { save(true); UI.C = buildCourse(data); UI.L = loadLearner(); }   // D21: … and studied
  applyExplanationLocale();   // D19: the explanations in the learner's native language (its facade), when one is on
  UI.lang = UI.prefs.lang && UI.C.lang[UI.prefs.lang] ? UI.prefs.lang : activeLangs()[0];
  FR.on = !!host; FR.host = host; FR.onRoute = onRoute; FR.base = host ? '#/lang/' + encodeURIComponent(id) : '';
  document.title = `${courseTitle()} · noema-lite`;   // i18n-ignore (the course title and the app name)
  document.documentElement.lang = UI.C.explainLang;
  document.body.classList.add('lx');
  if (host) { host.replaceChildren(h('div', { class: 'lx-top lx-subbar', role: 'tablist', 'aria-label': LT('lang.shell.yourLanguages') }), h('div', { class: 'lx-main' })); frameWatch(host); }   // inside the frame: its top bar and tabs stay
  else document.body.append(h('header', { class: 'topbar lx-top' }), h('main', { class: 'lx-main' }));
  if (!wired) {
    wired = true;
    addEventListener('hashchange', () => { if (!FR.on) render(); });   // inside the frame its router calls render()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && UI.C) save(true); });
  }
  render();
}
/* ---------- D19: the explanation locale and its facade (docs/language-packs.md §2.2, §3) ---------- */
/** The locale facades of the open course: {locale: {status, coverage, path?}} — from the registry (built course.expl.<locale>.js) and those loaded. */
function facadeStatuses() {
  const meta = ((window.NOEMA_REGISTRY || {}).languages || []).find(m => m.id === UI.id), out = {};
  for (const [loc, f] of Object.entries(meta?.expl || {})) out[loc] = f;
  for (const [loc, f] of Object.entries(((window.NOEMA_LANGEXPL || {})[UI.id]) || {})) out[loc] = { ...(out[loc] || {}), status: f.status, coverage: f.coverage };
  return out;
}
const previewHost = () => { try { return !!window.NOEMA_CONFIG?.i18nPreview || /^(deploy-preview-\d+|[\w-]+--)/.test(location.hostname); } catch (e) { return false; } };
const facadeOpts = () => ({ preview: previewHost(), drafts: window.NOEMA_CONFIG?.i18nDrafts === true });
/** The locales the explanations can be shown in: the master and every usable facade. */
function explanationLocales() {
  const master = UI.data.course.masterLang || UI.data.course.explainLang || 'en', F = facadeStatuses();
  return [master, ...Object.keys(F).filter(l => l !== master && N.facadeUsable(F[l], facadeOpts()))];
}
/** The course as the learner sees it: the master, or the master through the facade of the explanation locale. */
const buildCourse = data => N.course(UI.facade ? N.applyFacade(data, UI.facade) : data, { languages: studyChoice(data).langs });   // D21: only the languages the learner studies
/** D21: the learner chose other languages (here, on the Languages tab, on another device): the course again with only those, the
    learner state read again from the stored keys — the progress of a language chosen again is all there. */
function restudy() {
  if (!UI.C) return;
  save(true);
  UI.C = buildCourse(UI.data); if (UI.profMap) N.addProfiles(UI.C, facadeProfMap(UI.profMap));
  UI.L = loadLearner(); save();
  if (!UI.C.lang[UI.lang]) UI.lang = UI.prefs.lang && UI.C.lang[UI.prefs.lang] ? UI.prefs.lang : activeLangs()[0];
  nativeMemo = null;
  if (!document.querySelector('.lx-session')) render();
}
/** The word profiles (course.profiles.js) through the facade. */
const facadeProfMap = map => UI.facade && map ? N.facadeProfiles(map, UI.facade) : map;
const facadeLoading = {};
/** Resolve the explanation locale (native ▸ UI locale ▸ master; the learner's choice first) and show the course through its facade:
 *  at once when the facade is loaded, else after its file (course.expl.<locale>.js, loaded like the word profiles). → the locale */
function applyExplanationLocale() {
  const master = UI.data.course.masterLang || UI.data.course.explainLang || 'en';
  const loc = N.explanationLocale({ native: nativeL(), uiLocale: window.NoemaI18n?.locale || 'en', override: UI.L?.settings.speaker, facades: facadeStatuses(), master, ...facadeOpts() });
  const id = UI.id, loaded = l => ((window.NOEMA_LANGEXPL || {})[id] || {})[l];
  const swap = fac => {
    const kv = UI.L ? N.toKV(UI.C, UI.L) : null;
    UI.facade = fac ? { ...fac, locale: fac.locale || loc } : null; UI.C = buildCourse(UI.data);
    if (kv) { const st = UI.L.settings; UI.L = N.fromKV(UI.C, kv); UI.L.settings = st; }   // every setting kept as it is (fromKV keeps only the known ones)
    if (UI.profMap) N.addProfiles(UI.C, facadeProfMap(UI.profMap));
    nativeMemo = null;
  };
  const want = loc === master ? null : loc;
  if ((UI.facade?.locale || null) !== want) {
    if (!want) swap(null);
    else if (loaded(want)) swap(loaded(want));
    else {
      const path = facadeStatuses()[want]?.path;
      if (path && !facadeLoading[id + '|' + want]) facadeLoading[id + '|' + want] = new Promise(res => { const sc = document.createElement('script'); sc.src = path; sc.onload = sc.onerror = () => res(); document.head.append(sc); })
        .then(() => { delete facadeLoading[id + '|' + want]; if (UI.id === id && loaded(want)) { applyExplanationLocale(); if (UI.C && !document.querySelector('.lx-session')) render(); } });
      N.setExplainLocale(UI.C.explainLang); return UI.C.explainLang;   // until it is in: the master
    }
  }
  N.setExplainLocale(UI.C.explainLang);
  try {   // the explanations this code writes (lang.expl.*, lc.expl.*) follow the explanation language: its catalog, when it is a UI locale
    const xl = window.NoemaI18n && NoemaI18n.match(UI.C.explainLang);
    if (xl && xl !== 'en' && !NoemaI18n.catalogs[xl]) NoemaI18n.load(xl).then(() => { if (UI.C && UI.id === id && !document.querySelector('.lx-session')) render(); });
  } catch (e) { }
  if (UI.C.explainLang && document.documentElement && UI.view) document.documentElement.lang = UI.C.explainLang;
  return UI.C.explainLang;
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
    return h('button', { class: 'chip lx-flagchip' + (c === UI.lang ? ' on' : ''), 'data-lang': c, title: LT('lang.shell.chipKnown', { lang: info(c).name, kn, total }), onclick: () => { UI.lang = c; UI.prefs.lang = c; save(); render(); } },
      h('span', { class: 'lx-flag' }, info(c).flag), c.toUpperCase(), h('span', { class: 'lx-ring', style: { '--p': total ? Math.round(kn / total * 100) : 0 } }));
  });
  const explain = h('span', { class: 'chip lx-explain', title: LT('lang.shell.explainTitle') }, '💬 ' + info(UI.C.explainLang).name);
  if (FR.on) { t.append(...chips, h('span', { class: 'spacer' }), explain); return; }   // the frame has the title (crumbs), ⚙️ and the other courses (⋮)
  t.append(
    h('div', { class: 'brand', onclick: () => go('#/') }, h('div', { class: 'logo' }, '🌍'), h('span', { class: 'lx-title' }, courseTitle())),
    h('span', { class: 'spacer' }), explain, ...chips,
    h('button', { class: 'iconbtn', title: LT('lang.shell.settings'), onclick: () => go('#/settings') }, '⚙️'),
    h('button', { class: 'iconbtn', title: LT('lang.shell.otherSubject'), onclick: () => window.Noema?.openSubjectPicker ? Noema.openSubjectPicker() : null }, '📚'));
}
const VIEWS = {};
/** Where the learner is, in words: the last crumb of the frame. */
const VIEW_NAMES = ['lanes', 'settings', 'claude', 'grammar', 'write', 'read', 'script', 'listen', 'cmp', 'poly', 'sort', 'parts', 'peculiar', 'recall', 'deep', 'deepen'];
const VIEW_LABEL = new Proxy({}, { get: (o, k) => VIEW_NAMES.includes(k) ? LT('lang.view.' + k) : undefined });   // lang.view.<name>
function viewLabel(r) {
  const C = UI.C, fl = c => C.lang[c] ? info(c).flag + ' ' : '';
  try {
    if (r.name === 'home') return null;
    if (r.name === 'c') return C.concepts[r.arg]?.gloss || r.arg;
    if (r.name === 'w') return C.lang[r.arg]?.lex[r.arg2]?.lemma || r.arg2;
    if (r.name === 'node' || r.name === 'lesson') return C.nodes[r.arg] ? (C.nodes[r.arg].kind === 'lesson' ? stepLabel(C.nodes[r.arg]) + ' ' : '') + C.nodes[r.arg].title : r.arg;
    if (r.name === 'fn') return C.functions[r.arg]?.title || r.arg;
    if (r.name === 'field') return (C.data.fields.find(f => f.field === r.arg) || {}).title || r.arg;
    if (r.name === 'deepen') return LT('lang.view.deepenOf', { title: C.nodes[r.arg]?.title || r.arg });
    return (r.arg && C.lang[r.arg] ? fl(r.arg) : '') + (VIEW_LABEL[r.name] || r.name);
  } catch (e) { return VIEW_LABEL[r.name] || r.name; }
}
function render() {
  if (!UI.C || !shown()) return;
  const r = route(); UI.view = r.name;
  if (!document.querySelector('.lx-session') && studyChoice().langs.join() !== UI.C.languages.join()) return restudy();   // D21: the choice changed elsewhere
  if (!document.querySelector('.lx-session')) applyExplanationLocale();   // D19: the native language may have changed (Me › Language and appearance, another device)
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
    all[UI.id] = { at: Date.now(), title: courseTitle(), next: n ? { node: nid, step: stepLabel(n), title: n.title } : null, lang: UI.lang };
    localStorage.setItem(k, JSON.stringify(all));
  } catch (e) { }
}
/** A row of flag buttons for a card: one per course language, with the state of the concept in it. */
function flagRail(cid, current, onPick) {
  if (UI.C.languages.length < 2) return null;   // D21: one language studied — a course of one language, no switch
  return h('div', { class: 'lx-rail', role: 'tablist', 'aria-label': LT('lang.shell.languages') }, ...UI.C.languages.map(c => {
    const st = cid ? N.conceptState(UI.C, UI.L, c, cid) : null;
    return h('button', { class: 'lx-railbtn' + (c === current ? ' on' : ''), 'data-lang': c, role: 'tab', 'aria-selected': c === current ? 'true' : 'false', title: `${info(c).label} — ${STATE_LABEL[st] || ''}`, onclick: () => onPick(c) },
      h('span', { class: 'lx-flag' }, info(c).flag), h('span', { class: 'lx-dot s-' + (st || 'none') }));
  }));
}

/* ---------- home ---------- */
VIEWS.home = (v) => {
  if (studyChoice().none) { const ask = studyAsk(true); if (ask) { v.append(h('h1', {}, courseTitle()), ask); return; } }   // D21: none of the chosen languages is in this course
  const plan = N.planSession(UI.C, UI.L, { day: today(), minutes: UI.L.settings.minutes || 20, languages: todayLangs() });   // today's languages (P6, §9.6)
  const nRev = plan.steps.filter(s => s.kind === 'review').reduce((a, s) => a + s.items.length, 0);
  const learn = plan.steps.find(s => s.kind === 'learn'), lessons = plan.steps.filter(s => s.kind === 'lesson');
  const nNew = learn ? learn.concepts.reduce((a, c) => a + c.langs.length, 0) : 0, nScript = scriptSessionSteps().length;   // letters / characters in the first weeks (P4)
  const counts = LT(nScript ? 'lang.home.sessionCountsScript' : 'lang.home.sessionCounts', { rev: nRev, nNew, script: nScript });   // the frame's big card shows them (data-rest)
  const ask = studyAsk(); if (ask) v.append(ask);   // D21: “Which languages do you want to study?” until the learner answers
  v.append(h('div', { class: 'lx-hero' },
    h('h1', {}, courseTitle()),
    h('p', { class: 'lx-sub' }, LT('lang.home.sub', { langs: UI.C.languages.map(c => info(c).flag + ' ' + info(c).label).join(' · '), lang: info(UI.C.explainLang).name })),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary lx-go', disabled: !(nRev || nNew || nScript), 'data-go': nRev || nNew || nScript ? 'session' : 'none', 'data-rest': counts, onclick: () => runSession(plan) }, nRev || nNew || nScript ? '▶ ' + LT('lang.home.session', { counts }) : '✅ ' + LT('lang.home.nothingDue')),
      learn ? h('span', { class: 'tiny' }, LT('lang.home.newFrom', { title: UI.C.nodes[learn.node].title })) : null)));
  v.append(nativeAsk() || '', polyHome());   // D19: “Your native language?” (once) · P6: today's languages, the compare lane, the polyglot drills
  if (lessons.length) v.append(h('h2', { class: 'lx-h2' }, '🧱 ' + LT(lessons.some(st => UI.C.nodes[st.node].stage === 'core') ? 'lang.home.nextLesson' : 'lang.home.nextFoundation')), h('div', { class: 'lx-lessons' }, ...lessons.map(st => {
    const n = UI.C.nodes[st.node];
    return h('div', { class: 'lx-card lx-lessonbtn', 'data-node': st.node }, h('div', {}, h('span', { class: 'lx-step' }, stepLabel(n)), ' ', h('b', {}, n.title), h('div', { class: 'tiny' }, st.langs.map(c => info(c).flag + ' ' + info(c).label).join(' · '))),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => go('#/lesson/' + st.node) }, LT('lang.home.open')), h('button', { class: 'btn primary', onclick: () => runLesson(st.node, st.langs) }, '▶ ' + LT('lang.home.learn'))));
  })));
  v.append(h('div', { class: 'row lx-drills' }, h('span', { class: 'tiny' }, '🏋️ ' + LT('lang.home.drills') + ' '),
    h('button', { class: 'btn ghost small', 'data-icon': 'gym', onclick: () => go('#/parts/' + UI.lang) }, '🔁 ' + LT('lang.view.parts')), ...scriptHomeButtons(),
    ...UI.C.data.fields.filter(f => (f.subgroups || []).length > 1).map(f => h('button', { class: 'btn ghost small', onclick: () => go('#/sort/' + encodeURIComponent(f.field)) }, '🧩 ' + f.title))));
  if (UI.C.data.world) v.append(h('div', { class: 'row lx-libraries' }, h('span', { class: 'tiny' }, '📚 ' + LT('lang.home.peculiarAnyTime') + ' '),
    ...activeLangs().map(c => h('button', { class: 'btn ghost small', onclick: () => go('#/peculiar/' + c) }, info(c).flag + ' ' + info(c).label))));
  if (typeof grammarLaneHome === 'function') v.append(grammarLaneHome());   // P5: the 📐 grammar lane
  v.append(h('div', { class: 'row lx-maphead' }, h('h2', { class: 'lx-h2' }, '🗺️ ' + LT('lang.home.map')), lanesButton()), nodeList());
};
function nodeList() {
  const st = Object.fromEntries(UI.C.languages.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  return h('div', { class: 'lx-nodes' }, ...UI.C.order.filter(nid => UI.C.nodes[nid].kind !== 'lesson' || activeLangs().some(c => LX(c).applies[nid])).map(nid => {
    const n = UI.C.nodes[nid];
    return h('button', { class: 'lx-node' + (n.kind === 'lesson' ? ' lx-lessonnode' : ''), onclick: () => go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid) },
      h('div', { class: 'lx-nodetitle' }, h('b', {}, n.kind === 'lesson' ? h('span', { class: 'lx-step' }, stepLabel(n)) : null, n.kind === 'lesson' ? ' ' : null, n.title), h('span', { class: 'tiny' }, n.prereqs?.length ? LT('lang.home.ideasAfter', { n: n.concepts.length, after: LLIST(n.prereqs.map(p => UI.C.nodes[p].title.split(' — ')[0])) }) : LT('lang.home.ideas', { n: n.concepts.length }))),
      h('div', { class: 'lx-nodestates' }, ...UI.C.languages.map(c => h('span', { class: 'lx-ns ns-' + st[c][nid], title: `${info(c).label}: ${STATE_LABEL[st[c][nid]] || st[c][nid]}` }, info(c).flag, ' ', (STATE_LABEL[st[c][nid]] || st[c][nid])))));
  }));
}
