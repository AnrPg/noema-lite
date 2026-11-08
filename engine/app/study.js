/* noema-lite — the study area (area 2): the open subject's pages in the frame.
   An area of the app on the shell (build/ui.js: window.Noema, window.NoemaShell; docs/ARCHITECTURE.md §6.3): it registers
   the subject's pages (NoemaShell.registerPage(…, { subject: true }): the frame draws them once the subject's engine is
   there, under its top bar) and draws them with the study area's pages (src/features/study/ui, build/study.js; the library
   waits for NoemaCore.studyUi.ready() before it opens a subject). Their host (src/features/study/ui/host.ts) is the frame's
   part (NoemaShell.studyFrame) and this adapter over the subject's engine (engine/engine.js: S, the learning log, the
   tutor, the activities), which reads the engine's names when the subject opens (Noema.app.study.mount, 90_boot.js).
   What the other areas need of it goes through Noema.app.study. */
(() => {
  'use strict';
  const APP = (window.Noema.app ||= {});
  const SH = () => window.NoemaShell;
  let ui = null;   // the study area mounted on the open subject (NoemaCore.studyUi.mount)
  /** a page of the subject: the study area draws its address (an address it does not know: the subject's home) */
  const page = () => {
    if (!ui) return;
    if (innerWidth < 720) window.closeTutor?.();
    if (!ui.show(location.hash || '#/subject')) ui.show('#/subject');
  };
  for (const k of NoemaCore.studyUi.segments) SH().registerPage(k, page, { subject: true });

  /** The tutor's "Ask <character>" about an exercise — each its own conversation, mode and task: before answering → hints
      (never the answer) · "Help me get it" after a wrong answer → Socratic, from the learner's answer · "Explain differently"
      → a free, in-depth explanation from another angle. */
  function askAIAbout(ex, mode, given = '') {
    const m = mode === 'explain' ? 'explain' : mode === 'socratic' ? 'socratic' : 'hint';
    const ctx = { kind: 'exercise', id: ex.id, text: STUDY.exerciseText(ex), origin: { via: m === 'explain' ? 'explainDifferently' : m === 'socratic' ? 'helpSocratic' : 'askHint', ex: ex.id, ...(ex.section ? { sec: ex.section } : {}) } };   // i18n-ignore (ids)
    const key = ex.id + '|' + m;
    T.hist[key] = []; delete T.tstate[key];
    const mine = { answered: given ? 'yes' : 'no', given: given.length > 300 ? given.slice(0, 300) + '…' : given };   // the learner's first message (their bubble, in the UI language)
    if (m === 'explain') openTutor(ctx, 'explain', tE('engine.aimsg.exExplain', mine), { intent: INTENT.exExplain(given) });
    else if (m === 'socratic') openTutor(ctx, 'socratic', tE('engine.aimsg.exSocratic', mine), { intent: INTENT.exSocratic(given) });
    else openTutor(ctx, 'hint', tE('engine.aimsg.exHint'), { intent: INTENT.exHint(given) });
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
      Noema.node ? { label: SH().L('openMap'), icon: 'map', run: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) } : null,
      window.NoemaCurMap?.attachDialog ? { label: Noema.node ? SH().L('otherStation') : SH().L('putOnMap'), sub: SH().L('putOnMapSub'), icon: 'path', run: async () => NoemaCurMap.attachDialog(ACCOUNT.id, { subject: await subjectMeta(), onDone: () => location.reload() }) } : null,
      { label: SH().L('editSubject'), sub: SH().L('editSubjectSub'), icon: 'edit', run: async () => Noema.editSubject(await subjectMeta(), { onChange: () => location.reload() }) },
      { label: tE('engine.author.create'), sub: tE('engine.author.createSub'), icon: 'wrench', href: '#/author' },
      { label: tE('engine.engines.menu'), sub: tE('engine.engines.menuSub'), icon: 'spark', href: '#/engines' },
      (Noema.subjectMeta || {}).origin !== 'library' ? { label: SH().L('shareSubject'), sub: SH().L('shareSubjectSub'), icon: 'share', run: async () => Noema.share(await subjectMeta()) } : null,   // library subjects are everybody's already
      { label: SH().L('exportPackage'), sub: SH().L('exportPackageSub'), icon: 'download', run: () => Noema.exportPackage(ACCOUNT.id, Noema.pack).catch(e => toast('⚠️ ' + errText(e), 4000)) },
      window.NoemaXAPI ? { label: tE('engine.xapi.export'), sub: tE('engine.xapi.exportSub'), icon: 'download', run: exportXAPI } : null,
      window.NoemaXAPI ? { label: tE('engine.xapi.cmi5'), sub: tE('engine.xapi.cmi5Sub'), icon: 'download', run: exportCmi5 } : null,
      { label: SH().L('pickSubject'), icon: 'book', run: () => Noema.openSubjectPicker() }];
  }
  /** ⏱️ the focus sprint's clock: a small clock next to the frame's ⋮ while it runs */
  function sprintClock(app) {
    const left = app.sprintLeft;
    let c = document.querySelector('.timer.ns-focus');
    if (!c && left !== null) { c = h('button', { class: 'chip timer ns-focus', title: t('top.focusTitle'), onclick: () => app.toggleSprint() }); SH().setActs([c]); }
    if (!c) return;
    c.classList.toggle('running', left !== null);
    if (left === null) { c.remove(); return; }
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
    const RX = () => window.NoemaReact, SF = () => window.NoemaSrcFiles;
    return {
      subject: SUBJ, account: { id: ACCOUNT.id, name: ACCOUNT.name || '', kind: ACCOUNT.kind || 'local' },
      chapters: FULL_COURSE, media: MEDIA, sources: window.SOURCES || null,
      state: S, save, flush: () => flushSave(),
      learn: (type, item, data, more) => { learnt(type, item, data || {}, more || {}); },   // the learning log (10_core.js): S folds it in
      addXP(n) {
        const before = Noema.stats.todayXP(), LV = window.NoemaShell?.level, lv0 = LV ? LV(LOG.stats().xp || 0).lv : 0;
        learnt('xp.earned', null, { amount: Math.max(1, Math.round(n)) });
        return { goal: before < S.settings.goal && Noema.stats.todayXP() >= S.settings.goal, level: !!LV && LV(LOG.stats().xp || 0).lv > lv0 };
      },
      get goal() { return S.settings.goal; },
      courseChanged: followCourse,
      restorePoint: label => Noema.backup.restorePoint(ACCOUNT.id, label, { k: 'engine.home.resetPoint', p: { title: SUBJ.title } }),
      frame: SH().studyFrame({
        setupBanner: () => setupBanner(), modal, confirm: confirmed,
        subjectTags: () => [Noema.langTag?.(SUBJ), Noema.bridgeTag?.(SUBJ)].filter(Boolean),
        character: () => ({ face: window.NoemaArt && window.NoemaThemes ? NoemaArt.mascot(NoemaThemes.current()) : '', name: TUTOR.name, avatar: TUTOR.avatar, plural: !!window.NoemaThemes?.tutor?.()?.pl }),
      }),
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
        get page() { return window.NoemaSearch ? '#/search' : '#/subject'; },
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
      tutor: {
        open: (ctx, mode, first, o) => openTutor(ctx, mode, first, o || {}),
        close: () => closeTutor(), setContext: ctx => setTutorContext(ctx),
        askAbout: (ex, mode, given) => askAIAbout(ex, mode, given || ''),
        explainable: (el, what) => explainable(el, what),
        intent: (name, given) => typeof INTENT[name] === 'function' ? INTENT[name](given || '') : INTENT[name] || '',
      },
      ai: { grade: (...a) => aiGrade(...a), question: (...a) => aiQuestion(...a), drillGrade: (...a) => aiDrillGrade(...a), md: x => md(x) },
    };
  }

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

  APP.study = {
    /** the open subject's engine has booted: its pages from now on (→ the mounted study area) */
    mount() {
      ui = NoemaCore.studyUi.mount(studyHost());
      ui.app.onSprint(() => sprintClock(ui.app));
      return ui;
    },
    /** ⏱️ the 15-minute focus sprint (Today's ⋮) */
    toggleSprint: () => ui?.app.toggleSprint(),
  };
})();
