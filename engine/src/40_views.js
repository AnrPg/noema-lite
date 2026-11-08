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
const FULL_COURSE = COURSE.slice();   // the pack's chapters before the source filter (15_inbox.js, the tutor's host, 85_locate.js)
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
/* ---------- the tutor's host (src/composition/tutor.ts TutorPageHost) ---------- */
/* The tutor, its conversations and its threads are src/features/tutor (the session, the prompts, the screens), mounted from
   the study piece (NoemaCore.studyUi.tutor) before the study area, which gets its two ports (TUTOR_UI.port, TUTOR_UI.ai).
   This host gives it the open subject: the course after the source filter, the character, the settings, the page's drawer. */
let TUTOR_UI = null;   // NoemaCore.studyUi.tutor(tutorHost()) at boot: { session, port, ai, md, gemini, chatLangs, chatLangIs, open, close, … }
/* i18n-ignore-start */   // the learner profile is part of the AI's prompts (English)
function learnerProfile() {
  let learner = '';
  try { learner = JSON.parse(Noema.kv.get(Noema.kv.accountKey('settings')) || '{}').learner || ''; } catch (e) { }   // no settings yet: the default profile
  learner = learner || ACCOUNT.learner || `The learner (${ACCOUNT.name || 'the student'}) learns best when challenged, tested and given tightly structured, co-located information.`;
  return `${learner} ${TUTOR.prior || ''}`.trim();
}
/* i18n-ignore-end */
/** a part of the whole pack (before the source filter): its chapter, or the exercise itself */
function findFull(kind, id) {
  for (const c of FULL_COURSE) {
    if (kind === 'chapter' && c.id === id) return c;
    if (kind === 'section' && c.sections.some(s => s.id === id)) return c;
    if (kind === 'playbook' && c.debug.some(d => d.id === id)) return c;
    if (kind === 'exercise') { const e = c.exercises.find(x => x.id === id); if (e) return e; }
  }
  return null;
}
function tutorHost() {
  const fullSec = s => s._full ? { ...s, blocks: s._full.blocks } : s;
  const visible = (kind, id) => kind === 'section' ? SEC[id] : kind === 'chapter' ? CH[id] : kind === 'playbook' ? PB[id] : kind === 'exercise' ? findFull('exercise', id) : null;
  const learner = learnerProfile();
  return {
    account: { id: ACCOUNT.id, name: ACCOUNT.name || '', kind: ACCOUNT.kind || 'local' },
    subject: () => ({ id: SUBJ.id, title: SUBJ.title, language: SUBJ.language || 'en', math: !!SUBJ.features?.math, code: !!SUBJ.features?.code, packVersion: Noema.pack?.version || null }),
    persona: () => ({ name: TUTOR.name, avatar: TUTOR.avatar, domain: TUTOR.domain, prior: TUTOR.prior || '', examples: TUTOR.examples, interviewer: TUTOR.interviewer, simulation: TUTOR.simulation, terminology: TUTOR.terminology, examinerRole: TUTOR.examinerRole }),
    learner: () => learner,
    course: {
      outlines: () => COURSE.map(chapterOutline),
      section: id => { const s = SEC[id]; return s ? { title: s.title, chapter: s._ch.id, text: sectionText(fullSec(s)), mantra: s._ch.mantra || '' } : null; },
      chapter: id => { const c = CH[id]; return c ? { num: c.num, title: c.title, outline: chapterOutline(c) } : null; },
      playbook: id => PB[id] || null,
    },
    exerciseText: id => { const e = findFull('exercise', id); return e ? STUDY.exerciseText(e) : null; },
    exerciseTextOf: ex => STUDY.exerciseText(ex),
    sectionOf: id => EX[id]?.section || null,
    filteredOut: (kind, id) => !visible(kind, id) && !!findFull(kind, id),
    showAll: () => STUDY.app.setFilter(null),
    preloaded: Noema.preloadedConvos || [],
    settings: () => S.settings, save, toast, touchStreak,
    openSettings: () => openAccountMenu('settings'), openGuide: () => openGuide('gemini'),
    drawer: () => $('aside.drawer'), scrim: () => $('.scrim'),
    framed: () => !!SHL(),
    face: () => SHL() && window.NoemaArt && window.NoemaThemes ? NoemaArt.mascot(NoemaThemes.current()) : '',
    tutor: () => ({ name: TUTOR.name, avatar: TUTOR.avatar, plural: !!window.NoemaThemes?.tutor?.()?.pl }),
    uiLang,
    appTitle: APP_TITLE, appName: Noema.config.appName || 'noema-lite',   // i18n-ignore (the app's name)
  };
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
  if (innerWidth < 720) TUTOR_UI.close();
  if (p[0] === 'engines') return enginesView(p[1]);   // the engines of activities and requests for new ones (49_lib_view.js)
}
/** draw the page again (another tab's answers, the settings, the theme): the frame's router */
function route() { NoemaShell.route(); }
// tell other apps (a:caps, synced) that #/ex/<id> exists; each feature merges its own flag
{ const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { } if (!c.exerciseRoute) Noema.kv.set(k, JSON.stringify({ ...c, exerciseRoute: 1 })); }

/* ---------- boot ---------- */
function boot() {
  applyTheme();
  document.body.append(h('div', { class: 'scrim', onclick: () => TUTOR_UI.close() }), h('aside', { class: 'drawer' }));   // the frame has the top bar, the banner and <main>
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => route());   // i18n-ignore
  NoemaShell.attachEngine({ route: enginePage, locate: locateItem, openTutor: () => TUTOR_UI.open(), history: () => NoemaShell.convos(),
    resumeConvo: () => TUTOR_UI.resumeAsked(), convoChanged: (id, patch) => TUTOR_UI.changed(id, patch),
    accView: (tab, body, close, opts) => ACC_VIEWS[tab](body, close, opts || {}), retheme: () => TUTOR_UI.refresh() });
  setTimeout(() => TUTOR_UI.resumeAsked(), 300);
  if (S.settings.apiKey && !S.settings.models.length) TUTOR_UI.gemini.detect().catch(() => { });   // offline or a bad key: ⚙️ Settings says why
}
