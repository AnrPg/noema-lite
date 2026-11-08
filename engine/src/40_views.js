/* ===================== The study area's host, the classic top bar, the author, the router, the boot ===================== */
/* The subject's pages (#/subject, #/ch, #/s, practice, cards, drills, the Mistakes gym, sources, what's new) are drawn by
   the study area (src/features/study/ui, NoemaCore.studyUi; docs/UI_MAP.md). This file builds its host — studyHost(),
   the adapter of src/features/study/ui/host.ts over this page (S, the frame or the classic top bar, the tutor, the
   activities, the Roadmap, the search, the source files) — and keeps what is not the study area's: the classic top bar
   and its 🔔 (without the shell, an old index.html), the activity author (#/author), the router and the boot. */
const main = () => $('main');
const SHL = () => window.NoemaShell?.mounted ? window.NoemaShell : null;
const SL = (k, v) => window.NoemaShell ? NoemaShell.L(k, v) : k;
const HOME = () => SHL() ? '#/subject' : '#/';
function shellChrome(c = {}) { const X = SHL(); if (X) X.chrome(X.subjectChrome(c)); }
const backBtn = (label, hash) => SHL() ? null : h('button', { class: 'back', onclick: () => go(hash) }, label);
/** the page of #/author and #/engines (49_lib_view.js); the study pages draw their own */
function view(...kids) { const m = main(); m.innerHTML = ''; m.dataset.page = '@engine'; const v = h('div', { class: 'view' }, ...kids); m.append(v); scrollTo({ top: 0 }); return v; }
const go = hash => { location.hash = hash; };

/* ---------- the study area's host (src/features/study/ui/host.ts) ---------- */
let STUDY = null;   // NoemaCore.studyUi.mount(studyHost()) at boot: { app, show(hash), segments, figure, figureText, exerciseText, inspect }
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
/** the Roadmap step this subject is attached to (its first), or null */
function stepAt() { const CU = window.NoemaCurriculum; return CU?.stepsOf && ACCOUNT?.id ? CU.stepsOf(ACCOUNT.id, SUBJ.id)[0] || null : null; }
/** { missing: the titles of the steps to master first } when every Roadmap step this subject teaches is still locked, else null */
function stepLock() {
  const CU = window.NoemaCurriculum, acc = ACCOUNT?.id; if (!CU?.stepsOf || !acc) return null;
  const on = CU.stepsOf(acc, SUBJ.id).filter(x => !x.c.nodes[x.nid].pack?.assigned).map(x => ({ ...x, all: CU.statuses(acc, x.c) })).filter(x => x.all[x.nid]);   // a subject of the learner's own, attached to a step, stays theirs
  if (!on.length || on.some(x => x.all[x.nid].open || x.all[x.nid].mastered)) return null;
  const x = on[0]; return { missing: (x.all[x.nid].parents || []).filter(p => !x.all[p]?.mastered).map(p => x.c.nodes[p]?.title || p) };
}
/** the ladder of levels over this subject: its Roadmap's, else the pack's own (names in the UI language) */
function levelLadder() {
  const at = stepAt(), levels = (at?.c?.levels?.length ? at.c.levels : Noema.pack?.subject?.levels) || [], lang = uiLang();
  return levels.filter(l => l && typeof l === 'object' && l.id).map((l, i) => ({ id: l.id, order: typeof l.order === 'number' ? l.order : i,
    name: l.names?.[lang] || l.names?.[lang.split('-')[0]] || l.names?.en || Object.values(l.names || {})[0] || l.name || l.id }));
}
function reachedLevel() {
  const at = stepAt();
  try { return NoemaCore.study.models.current().levels?.[at?.c?.id || SUBJ.id]?.level || null; } catch (e) { return null; }
}
async function subjectMeta() { return (await Noema.subjectsFor(ACCOUNT.id)).find(x => x.id === SUBJ.id) || { ...SUBJ, origin: Noema.subjectMeta?.origin }; }
/** what the other areas add to the subject's ⋮: the Roadmap, editing, the author, the engines, sharing, the exports */
function subjectActions() {
  return [
    Noema.node ? { label: SL('openMap'), icon: 'map', run: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) } : null,
    window.NoemaCurMap?.attachDialog ? { label: Noema.node ? SL('otherStation') : SL('putOnMap'), sub: SL('putOnMapSub'), icon: 'path', run: async () => NoemaCurMap.attachDialog(ACCOUNT.id, { subject: await subjectMeta(), onDone: () => location.reload() }) } : null,
    { label: SL('editSubject'), sub: SL('editSubjectSub'), icon: 'edit', run: async () => Noema.editSubject(await subjectMeta(), { onChange: () => location.reload() }) },
    { label: tE('engine.author.create'), sub: tE('engine.author.createSub'), icon: 'wrench', href: '#/author' },
    { label: tE('engine.engines.menu'), sub: tE('engine.engines.menuSub'), icon: 'spark', href: '#/engines' },
    (Noema.subjectMeta || {}).origin !== 'library' ? { label: SL('shareSubject'), sub: SL('shareSubjectSub'), icon: 'share', run: async () => Noema.share(await subjectMeta()) } : null,   // library subjects are everybody's already
    { label: SL('exportPackage'), sub: SL('exportPackageSub'), icon: 'download', run: () => Noema.exportPackage(ACCOUNT.id, Noema.pack).catch(e => toast('⚠️ ' + errText(e), 4000)) },
    window.NoemaXAPI ? { label: tE('engine.xapi.export'), sub: tE('engine.xapi.exportSub'), icon: 'download', run: exportXAPI } : null,
    window.NoemaXAPI ? { label: tE('engine.xapi.cmi5'), sub: tE('engine.xapi.cmi5Sub'), icon: 'download', run: exportCmi5 } : null,
    { label: SL('pickSubject'), icon: 'book', run: () => Noema.openSubjectPicker() }];
}
/** ⏱️ the focus sprint's clock: the classic top bar's chip, or a small clock next to the frame's ⋮ while it runs */
function sprintClock() {
  const app = STUDY.app, left = app.sprintLeft;
  let c = $('.timer.chip');
  if (!c && SHL() && left !== null) { c = h('button', { class: 'chip timer ns-focus', title: t('top.focusTitle'), onclick: () => app.toggleSprint() }); SHL().setActs([c]); }
  if (!c) return;
  c.classList.toggle('running', left !== null);
  if (left === null) { if (c.classList.contains('ns-focus')) c.remove(); else c.textContent = '⏱️ ' + t('top.focus'); return; }
  c.textContent = `⏱️ ${String(left / 60e3 | 0).padStart(2, '0')}:${String((left / 1e3 | 0) % 60).padStart(2, '0')}`;
}
/** confirmBox (10_core.js) as a promise: → true on Yes, false on Cancel or ✕ */
function confirmed(text) {
  return new Promise(ok => {
    modal((b, close) => {
      const done = v => { close(); ok(v); };
      b.append(h('h3', {}, text), h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => done(false) }, tE('engine.core.cancel')), h('button', { class: 'btn primary', onclick: () => done(true) }, tE('engine.core.yes'))));
    });
  });
}
/** the next step of the Roadmap after this subject's (the step that needs it, else the next one up) → { title, href } */
function nextRoadmapStep() {
  const CU = window.NoemaCurriculum, at = stepAt(); if (!at) return null;
  const all = CU.statuses(ACCOUNT.id, at.c), ord = CU.order(at.c).filter(x => at.c.nodes[x]);
  const to = ord.find(x => (all[x]?.parents || []).includes(at.nid)) || CU.nextUp(ACCOUNT.id, at.c).find(x => x !== at.nid);
  return to ? { title: CU.shownNode(at.c, to).title, href: '#/map/' + encodeURIComponent(at.c.id) + '/' + encodeURIComponent(to) } : null;
}
function studyHost() {
  const RX = () => SHL() ? window.NoemaReact : null, SF = () => window.NoemaSrcFiles;
  return {
    subject: SUBJ, account: { id: ACCOUNT.id, name: ACCOUNT.name || '', kind: ACCOUNT.kind || 'local' },
    chapters: FULL_COURSE, media: MEDIA, sources: window.SOURCES || null,
    state: S, save, flush: () => { flushSave(); renderTopStats(); },
    learn: (type, item, data, more) => { learnt(type, item, data || {}, more || {}); },   // the learning log (10_core.js): S folds it in
    addXP(n) {
      const before = Noema.stats.todayXP(), LV = window.NoemaShell?.level, lv0 = LV ? LV(LOG.stats().xp || 0).lv : 0;
      learnt('xp.earned', null, { amount: Math.max(1, Math.round(n)) }); renderTopStats();
      return { goal: before < S.settings.goal && Noema.stats.todayXP() >= S.settings.goal, level: !!LV && LV(LOG.stats().xp || 0).lv > lv0 };
    },
    get goal() { return S.settings.goal; },
    courseChanged: followCourse,
    restorePoint: label => Noema.backup.restorePoint(ACCOUNT.id, label, { k: 'engine.home.resetPoint', p: { title: SUBJ.title } }),
    frame: {
      get framed() { return !!SHL(); },
      main, setupBanner: () => setupBanner(),
      chrome: c => shellChrome(c),
      menuButton: (items, { label, cls }) => SHL().menuButton(items, { cls, label, content: h('span', {}, label, ' ▾') }),
      sheet: (title, build, o) => SHL().sheet(title, build, o),
      modal, toast, confirm: confirmed, navigate: go,
      setActs: nodes => SHL()?.setActs(nodes),
      noteRecent: extra => window.NoemaShell?.noteRecent?.({ subj: SUBJ.id, title: SUBJ.title, cid: Noema.node?.id || null, node: Noema.node?.node || null, ...extra }),
      subjectTags: () => [Noema.langTag?.(SUBJ), Noema.bridgeTag?.(SUBJ)].filter(Boolean),
      character: () => ({ face: window.NoemaArt && window.NoemaThemes ? NoemaArt.mascot(NoemaThemes.current()) : '', name: TUTOR.name, avatar: TUTOR.avatar, plural: !!window.NoemaThemes?.tutor?.()?.pl }),
      L: (k, v) => SL(k, v),
    },
    feedback: {
      beep, confetti, big: k => RX()?.big(k), answered: (ok, o) => RX()?.answered?.(ok, o), tick: s => RX()?.tick?.(s),
      xpFloat(n, el) { const r = el?.getBoundingClientRect?.(); const f = h('div', { class: 'xpfloat', style: { left: (r ? r.left + r.width / 2 : innerWidth / 2) + 'px', top: (r ? r.top : innerHeight / 2) + 'px' } }, tE('engine.core.xpFloat', { n })); document.body.append(f); setTimeout(() => f.remove(), 1200); },
      get reacts() { return !!RX(); },
    },
    roadmap: {
      station() {
        if (!Noema.node || !window.NoemaCurMap?.nodeInfo) return null;
        const info = NoemaCurMap.nodeInfo(ACCOUNT.id, Noema.node); if (!info) return null;
        return { title: info.c.title || info.c.goal || '', mastered: !!info.st?.mastered, pass: window.NoemaCurriculum?.PASS || 0.8 };
      },
      openMap: () => { if (Noema.node) Noema.curriculumMap(Noema.node.id, Noema.node.node); },
      lock: stepLock,
      nextStep: nextRoadmapStep,
      ladder: levelLadder, reachedLevel,
    },
    activities: {
      block: (b, sid) => interactiveBlock({ ...b, _sec: sid }),
      asText: b => interactiveAsText(b),
      runnable: ex => ACT.runnable(ex),
      exercise: (ex, api) => ex.type === 'sim' ? simWidget(ex, api) : null,
    },
    bridge: { section: o => window.NoemaBridge?.section?.(o), menuItem: () => window.NoemaBridge?.menuItem?.() || null },
    subjectActions: { menu: subjectActions },
    search: {
      step() { const R0 = window.NoemaSearch?.round?.(), st = R0?.steps?.[R0.i]; return st && st.sj === SUBJ.id ? { kind: st.kind, ids: st.ids, keys: st.keys, title: st.title, back: R0.back } : null; },
      after: () => window.NoemaSearch?.after?.() || null,
      get page() { return window.NoemaSearch ? '#/search' : HOME(); },
    },
    sourceFiles: {
      available: s => { const a = SF()?.available(ACCOUNT.id, SUBJ.id, s); return a ? { ...(a.url && !a.meta ? { url: a.url } : {}), stored: !!a.meta } : null; },
      index: () => SF() ? SF().index(ACCOUNT.id, SUBJ.id) : {},
      webUrl: s => SF()?.webUrl?.(s) || null,
      get: id => SF() ? SF().get(ACCOUNT.id, SUBJ.id, id).catch(() => null) : Promise.resolve(null),
      put: (id, f) => SF().put(ACCOUNT.id, SUBJ.id, id, f),
      remove: id => SF().remove(ACCOUNT.id, SUBJ.id, id),
      filePage: (s, p) => SF()?.filePage ? SF().filePage(s, p) : p,
    },
    openFile: f => NoemaViewer.open(f),
    refitFsrs: last => NoemaCore.study.models.refit(last),
    blockIds: blocks => NoemaCore.catalog.blockIds(blocks),
    trapId: p => NoemaCore.catalog.trapId(p),
    tutor: TUTOR_UI.port,   // the tutor (src/composition/tutor.ts): mounted first
    ai: TUTOR_UI.ai,
  };
}

/* ---------- top bar (classic, without the shell) ---------- */
function renderTopStats() {
  const x = $('#xpchip'), s = $('#streakchip');
  if (x) x.textContent = '⭐ ' + tE('engine.top.xp', { n: S.xp });
  if (s) s.textContent = '🔥 ' + nf(Noema.stats.streakNow());
}
/** ⏱️ The 15-minute focus sprint (top bar chip, or the shell's ⋮ with a small clock next to it). */
function topbar() {
  const timer = h('button', { class: 'chip timer hide-m', title: t('top.focusTitle'), onclick: () => STUDY.app.toggleSprint() }, '⏱️ ' + t('top.focus'));
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand', onclick: () => go('#/') }, window.NoemaArt && window.NoemaThemes ? h('div', { class: 'logo', html: NoemaArt.mascot(NoemaThemes.current()) }) : null, h('span', { class: 'name' }, Noema.config.appName || 'noema-lite')),   // i18n-ignore (the app's name)
    h('button', { class: 'subjchip', title: t('top.switchSubject'), onclick: () => Noema.openSubjectPicker() }, h('span', {}, SUBJ.emoji || '📘'), h('span', { class: 'st' }, SUBJ.title), h('span', { class: 'chev' }, '▾')),
    h('div', { class: 'spacer' }),
    Noema.node ? h('button', { class: 'chip curchip', title: t('top.mapTitle'), onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, '🧭', h('span', { class: 'hide-s' }, ' ' + t('top.map')))
      : h('button', { class: 'chip curchip', title: t('top.curriculaTitle'), onclick: () => Noema.curricula() }, '🧭', h('span', { class: 'hide-s' }, ' ' + t('top.curricula'))),
    h('button', { class: 'chip explorechip', title: t('top.exploreTitle'), onclick: () => Noema.explore() }, '🌍', h('span', { class: 'hide-s' }, ' ' + t('top.explore'))),
    timer,
    h('span', { class: 'chip xp hide-m', id: 'xpchip' }), h('span', { class: 'chip streak hide-s', id: 'streakchip', title: t('top.streak') }),
    h('button', { class: 'iconbtn srcbtn', title: t('top.sources'), onclick: () => STUDY.app.sourcesUi.toggleDeck() }, '📚'),
    h('button', { class: 'iconbtn hide-m', title: t('top.theme'), onclick: () => { S.settings.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); route(); } }, '🌓'),
    bellButton(),
    h('button', { class: 'iconbtn tutor', title: t('top.tutorTitle'), onclick: () => TUTOR_UI.open() }, TUTOR.avatar, h('span', {}, t('top.tutor'))),
    h('button', { class: 'acchip', title: t('top.account', { name: ACCOUNT.name }), onclick: () => openAccountMenu() }, h('span', {}, ACCOUNT.emoji || '🙂'), h('i', { class: 'syncdot', id: 'syncdot' })));
}

/* ---------- 🔔 notifications: subjects shared with me (bell + banner; the shell has its own) ---------- */
function bellButton() {
  const badge = h('span', { class: 'bellbadge' });
  const b = h('button', { class: 'iconbtn bell', id: 'bellbtn', title: t('top.notifications'), 'aria-label': t('top.notifications'), onclick: () => openNotes() }, '🔔', badge);
  Noema.notes.on(list => { badge.textContent = list.length || ''; badge.style.display = list.length ? '' : 'none'; b.classList.toggle('has', !!list.length); });
  return b;
}
function openNotes() {
  modal((box, close) => {
    const body = h('div');
    const draw = list => { body.innerHTML = ''; if (!list.length) body.append(h('p', { class: 'muted' }, ACCOUNT.kind === 'cloud' ? tE('engine.notes.nothing') : tE('engine.notes.needCloud'))); list.forEach(sh => body.append(Noema.shareRow(sh, { onAccepted: s => { close(); confirmBox(tE('engine.share.openNow', { title: s.title }), () => s.kind === 'curriculum' ? Noema.curriculumMap(s.curriculum) : Noema.switchTo(ACCOUNT.id, s.id)); } }))); const clr = Noema.noticesClear?.(list); if (clr) body.append(clr); };
    Noema.notes.on(draw);
    box.append(h('div', { class: 'row' }, h('h2', { class: 'grow' }, '🔔 ' + t('top.notifications')), h('button', { class: 'iconbtn', onclick: close }, '✕')), body);
  });
}
function shareBanner() {
  const bar = h('div', { class: 'sharebar', role: 'status' });
  let later = new Set();
  const draw = list => {
    const items = list.filter(x => !later.has(x.id) && x.kind !== 'notice'); bar.innerHTML = '';   // 🔔 news only waits in the bell
    bar.classList.toggle('on', !!items.length); if (!items.length) return;
    const sh = items[0];
    if (['curupdate', 'stepupdate', 'subjupdate'].includes(sh.kind)) {   // 🔔 an update that waits for me: take it or keep mine
      const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await Noema.notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toast(take ? '✅ ' + tE('engine.share.upToDate', { title: sh.title }) : '👍 ' + tE('engine.share.keepYours', { title: sh.title })); else b.disabled = false; } catch (er) { toast('⚠️ ' + errText(er), 5000); b.disabled = false; } };   // 🔎 Review only opens the review: “Not now” there keeps the update waiting
      bar.append(h('span', { class: 'grow' }, ...Noema.updateText(sh), items.length > 1 ? h('span', { class: 'tiny' }, '  ' + tE('engine.share.more', { n: items.length - 1 })) : ''),
        h('button', { class: 'btn small primary', onclick: act(true) }, Noema.updateLabel(sh)), h('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? tE('engine.share.keepMyCopy') : tE('engine.share.keepMine')),
        h('button', { class: 'btn small ghost', title: tE('engine.share.laterTip'), onclick: () => { later.add(sh.id); draw(Noema.notes.pending); } }, tE('engine.share.later')));
      return;
    }
    const cur = sh.kind === 'curriculum';   // 👥 an invitation to a shared curriculum
    const tB = h('b', {}, sh.title), mtT = window.NoemaMT ? NoemaMT.toggle(ACCOUNT.id, [NoemaMT.mark(tB, { language: sh.language || sh.meta?.language, kind: cur ? 'shared.roadmap' : 'shared.pack' })]) : null;   // 🌐 its title on request (the personal message is never sent)
    bar.append(h('span', { class: 'grow' }, cur ? '👥 ' : '📬 ', ...tNodes(cur ? 'engine.share.invite' : 'engine.share.offer', null, { name: h('b', {}, sh.from_name || sh.from_email || tE('engine.share.someone')), title: tB }), items.length > 1 ? h('span', { class: 'tiny' }, '  ' + tE('engine.share.more', { n: items.length - 1 })) : '', mtT ? ' ' : '', mtT || ''),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await Noema.notes.accept(sh); toast(cur ? '👥 ' + tE('engine.share.joined', { title: s.title }) : '✅ ' + tE('engine.share.added', { title: s.title })); confirmBox(tE('engine.share.openNow', { title: s.title }), () => cur ? Noema.curriculumMap(s.curriculum) : Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + errText(er), 5000); e.target.disabled = false; } } }, '✓ ' + (cur ? tE('engine.share.join') : tE('engine.share.accept'))),
      h('button', { class: 'btn small', onclick: async () => { await Noema.notes.reject(sh).catch(er => toast('⚠️ ' + errText(er))); } }, '✕ ' + tE('engine.share.reject')),
      h('button', { class: 'btn small ghost', title: tE('engine.share.laterTip'), onclick: () => { later.add(sh.id); draw(Noema.notes.pending); } }, tE('engine.share.later')));
  };
  Noema.notes.on(draw);
  return bar;
}



/* ---------- ⋮ › the exports of the subject ---------- */
/** ⋮ › Export learning record (xAPI): this subject's activity attempts (S.att) and answers (S.res) as an xAPI 1.0.3 file, made by
    NoemaXAPI (engine/src/43_xapi.js, docs/INTERACTIVE_XAPI.md) — nothing is sent anywhere. The actor is the account id, never an e-mail. The pack's own subject
    (title, language) goes with the pack's own chapters, never the name translated for the UI (SUBJ). */
async function exportXAPI() {
  let r;
  try { const { attempts, answers } = await LOG.xapi(SUBJ.id); r = NoemaXAPI.subjectRecord({ attempts, answers, pack: Noema.pack?.subject || SUBJ, chapters: Noema.pack?.chapters || COURSE, accountId: ACCOUNT.id, site: Noema.config?.siteUrl, now: Date.now() }); }
  catch (e) { toast('⚠️ ' + errText(e), 4000); return; }
  if (!r) { toast(tE('engine.xapi.none'), 3500); return; }
  saveBlob(r.name, new Blob([JSON.stringify(r.file, null, 1)], { type: 'application/json' }));
}
/** ⋮ › Course package for an LMS (cmi5): the subject's chapters as a cmi5 course structure in a .zip (NoemaXAPI.subjectCmi5; JSZip, the
    app's zip writer); its AUs open the chapters on the site, with the same ids as the xAPI record. */
async function exportCmi5() {
  try {
    const r = NoemaXAPI.subjectCmi5({ pack: Noema.pack?.subject || SUBJ, chapters: Noema.pack?.chapters || COURSE, site: Noema.config?.siteUrl });
    saveBlob(r.name, await NoemaXAPI.zip(r.files));
  } catch (e) { toast('⚠️ ' + errText(e), 4000); }
}
function saveBlob(name, blob) {
  const u = URL.createObjectURL(blob), a = h('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
  toast('⬇️ ' + name, 3000);   // i18n-ignore (a file name)
}


/* ---------- ✎ the activity author (#/author): an interactive activity built with a form, the real sim-spec@1 runtime as its preview
   (docs/INTERACTIVE_AUTHORING.md, docs/activities-dev/authoring_ui.md). Its scripts load on the first visit (the single-file
   bundle has them inline); the activity is not added to the open subject — the author downloads its folder. ---------- */
let AUTHOR_LOAD = null;
function loadAuthor() {
  if (window.NoemaActivityAuthor) return Promise.resolve();
  const base = window.NOEMA_ENGINE_BASE || 'engine/';
  const js = f => new Promise((ok, no) => { const s = document.createElement('script'); s.src = base + f; s.onload = ok; s.onerror = () => no(new Error(f)); document.head.append(s); });
  return AUTHOR_LOAD || (AUTHOR_LOAD = (async () => {
    if (!document.querySelector('link[data-author-css]')) document.head.append(h('link', { rel: 'stylesheet', href: base + 'activity_author.css', 'data-author-css': '1' }));
    for (const f of ['schemaform.js', 'activity_author_schemas.js', 'activity_author.js']) if (!(f === 'schemaform.js' ? window.NoemaSchemaForm : f === 'activity_author.js' ? window.NoemaActivityAuthor : window.NoemaActivitySchemas)) await js(f);
    const L = window.NoemaCore.engines;   // the author offers every engine of the library: each one's table and checks, and the schema kernel its forms come from
    await Promise.all([L.load(L.ids()), L.loadSchema()]);
  })().catch(e => { AUTHOR_LOAD = null; throw e; }));
}
async function authorView() {
  shellChrome({ sub: true, crumbs: [[tE('engine.author.title')]], back: HOME() });
  const v = view(backBtn('← ' + SUBJ.title, HOME()), h('p', { class: 'muted' }, tE('engine.author.loading')));
  try { await loadAuthor(); } catch (e) { v.replaceChildren(...[backBtn('← ' + SUBJ.title, HOME()), h('p', {}, tE('engine.author.loadFailed'))].filter(Boolean)); return; }
  if ((location.hash || '').slice(2).split('/')[0] !== 'author') return;   // the learner went elsewhere while it loaded
  const m = main(); m.dataset.page = '@engine';
  NoemaActivityAuthor.view(m);
  if (!SHL()) m.prepend(backBtn('← ' + SUBJ.title, HOME()));
}

/* ---------- router ---------- */
/** In the shell, #/ is Today and the subject lives at #/subject; any address that is not the engine's is the shell's.
    #/author and #/engines are drawn here; every other page of the subject is the study area's (STUDY.show). */
function route() {
  const p = (location.hash || '#/').slice(2).split('/');
  if (p[0] !== 'author' && window.NoemaActivityAuthor?.current) { try { NoemaActivityAuthor.current.destroy(); } catch (e) { } NoemaActivityAuthor.current = null; }   // left the author: its preview and keys stop
  const X = SHL();
  if (X && !X.ENGINE_ROUTES.has(p[0])) return X.route();
  if (innerWidth < 720) TUTOR_UI.close();
  if (p[0] === 'author') return authorView();
  if (p[0] === 'engines') return enginesView(p[1]);   // the engines of activities and requests for new ones (49_lib_view.js)
  if (!STUDY.show(location.hash || '#/')) STUDY.show('#/subject');
}
// tell other apps (a:caps, synced) that #/ex/<id> exists; each feature merges its own flag
{ const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { } if (!c.exerciseRoute) Noema.kv.set(k, JSON.stringify({ ...c, exerciseRoute: 1 })); }

/* ---------- boot ---------- */
function boot() {
  applyTheme();
  const X = SHL();
  if (X) document.body.append(h('div', { class: 'scrim', onclick: () => TUTOR_UI.close() }), h('aside', { class: 'drawer' }));   // the shell has the top bar, the banner and <main>
  else document.body.append(topbar(), shareBanner(), h('main'), h('div', { class: 'scrim', onclick: () => TUTOR_UI.close() }), h('aside', { class: 'drawer' }));
  renderTopStats();
  STUDY.app.onSprint(sprintClock);
  if (!X) addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => route());   // i18n-ignore
  if (X) { X.attachEngine({ route, locate: locateItem, openTutor: () => TUTOR_UI.open(), focus: () => STUDY.app.toggleSprint(), history: () => X.convos(),
    resumeConvo: () => TUTOR_UI.resumeAsked(), convoChanged: (id, patch) => TUTOR_UI.changed(id, patch),
    accView: (tab, body, close, opts) => ACC_VIEWS[tab](body, close, opts || {}), retheme: () => TUTOR_UI.refresh() });
    setTimeout(() => TUTOR_UI.resumeAsked(), 300); }
  else route();
  if (S.settings.apiKey && !S.settings.models.length) TUTOR_UI.gemini.detect().catch(() => { });   // offline or a bad key: ⚙️ Settings says why
}
