/* ===================== The subject's engine pages, the author, the boot ===================== */
/* The subject's pages (#/subject, #/ch, #/s, practice, cards, drills, the Mistakes gym, sources, what's new) are the study
   area's (src/features/study/ui, build/study.js), which engine/app/study.js registers in the frame with their host adapter
   (src/features/study/ui/host.ts). This file keeps the engine's indexes the study area's course feeds (followCourse), the
   activity author (#/author), the engines' page (#/engines, 49_lib_view.js) and the boot. */
const main = () => $('main');
const SHL = () => window.NoemaShell?.mounted ? window.NoemaShell : null;
const SL = (k, v) => window.NoemaShell ? NoemaShell.L(k, v) : k;
const HOME = () => '#/subject';
function shellChrome(c = {}) { const X = SHL(); if (X) X.chrome(X.subjectChrome(c)); }
/** the page of #/author and #/engines (49_lib_view.js); the study pages draw their own */
function view(...kids) { const m = main(); m.innerHTML = ''; m.dataset.page = '@engine'; const v = h('div', { class: 'view' }, ...kids); m.append(v); scrollTo({ top: 0 }); return v; }
const go = hash => { location.hash = hash; };

/* ---------- the study area's course: the engine's indexes follow it ---------- */
let STUDY = null;   // Noema.app.study.mount() at boot (engine/app/study.js): { app, show(hash), segments, figure, figureText, exerciseText, inspect }
const MEDIA = Noema.pack?.media || {};   // the pack's pictures by id (the study area's media; 32_activities.js)
const FULL_COURSE = COURSE.slice();   // the pack's chapters before the source filter (15_inbox.js, 60_convos.js, 85_locate.js)
FULL_COURSE.forEach(c => c.flashcards.forEach((f, k) => { f._key = f.id || f._key || c.id + '#' + k; }));   // SRS keys: the card's id (packs without ids: its position), independent of filtering
{ /* tell sibling apps (Meletee, a:caps) that card progress is keyed by card id; each feature merges only its own flag */
  const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { }
  if (!c.stableCardIds) Noema.kv.set(k, JSON.stringify({ ...c, stableCardIds: 1 }));
}
/** The engine's indexes (COURSE, CH, SEC, EX, PB, ALL_EX) follow the study area's course (the source filter): the tutor,
    the search's places (85_locate.js), the inbox and the activities read them. */
function followCourse(course) {
  COURSE.length = 0; ALL_EX.length = 0;
  for (const o of [CH, SEC, EX, PB]) for (const k of Object.keys(o)) delete o[k];
  course.chapters.forEach((c, i) => {
    c._i = i; COURSE.push(c); CH[c.id] = c;
    c.sections.forEach((s, j) => { s._ch = c; s._j = j; s._full = s.full; SEC[s.id] = s; });
    c.exercises.forEach(e => { e._ch = c; EX[e.id] = e; ALL_EX.push(e); });
    c.debug.forEach(d => { d._ch = c; PB[d.id] = d; });
  });
}
/** a file to download (the subject's exports, engine/app/study.js; an engine request, 49_lib_view.js) */
function saveBlob(name, blob) {
  const u = URL.createObjectURL(blob), a = h('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
  toast('⬇️ ' + name, 3000);   // i18n-ignore (a file name)
}


/* ---------- router ---------- */
/** the engine's own pages of the subject (the frame sends #/engines here: NoemaShell.attachEngine; #/author is a page of its
    own: src/composition/shell/author-page.ts) */
function enginePage() {
  const p = (location.hash || '#/').slice(2).split('/');
  if (innerWidth < 720) closeTutor();
  if (p[0] === 'engines') return enginesView(p[1]);   // the engines of activities and requests for new ones (49_lib_view.js)
}
/** draw the page again (another tab's answers, the settings, the theme): the frame's router */
function route() { NoemaShell.route(); }
// tell other apps (a:caps, synced) that #/ex/<id> exists; each feature merges its own flag
{ const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { } if (!c.exerciseRoute) Noema.kv.set(k, JSON.stringify({ ...c, exerciseRoute: 1 })); }

/* ---------- boot ---------- */
function boot() {
  applyTheme();
  document.body.append(h('div', { class: 'scrim', onclick: closeTutor }), h('aside', { class: 'drawer' }));   // the frame has the top bar, the banner and <main>
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => route());   // i18n-ignore
  NoemaShell.attachEngine({ route: enginePage, locate: locateItem, openTutor: () => openTutor(), history: () => NoemaShell.convos(), resumeConvo, convoChanged,
    accView: (tab, body, close, opts) => ACC_VIEWS[tab](body, close, opts || {}), retheme: () => { renderTutorHead?.(); } });
  setTimeout(resumeConvo, 300);
  if (S.settings.apiKey && !S.settings.models.length) detectModels().catch(() => { });
}
