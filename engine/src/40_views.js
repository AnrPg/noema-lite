/* ===================== Views ===================== */
const main = () => $('main');
/* The new frame (engine/shell.js) owns the top bar, the tabs, the back arrow and the ⋮ menus; these views draw
   the pages of the open subject (#/subject, #/ch, #/s, …) and tell it their crumbs and menu (docs/UI_MAP.md).
   Without the shell (an old index.html) the classic top bar below is used. */
const SHL = () => window.NoemaShell?.mounted ? window.NoemaShell : null;
const SL = (k, v) => window.NoemaShell ? NoemaShell.L(k, v) : k;
const HOME = () => SHL() ? '#/subject' : '#/';
function shellChrome(c = {}) { const X = SHL(); if (X) X.chrome(X.subjectChrome(c)); }
const backBtn = (label, hash) => SHL() ? null : h('button', { class: 'back', onclick: () => go(hash) }, label);
function view(...kids) { const m = main(); m.innerHTML = ''; m.dataset.page = '@engine'; const v = h('div', { class: 'view' }, ...kids); const fb = typeof filterBanner === 'function' ? filterBanner() : null; if (fb) v.prepend(fb); if (STEP_LOCK) v.prepend(h('div', { class: 'lockbar', role: 'note' }, '🔒 ' + SL('lockedPreview'))); m.append(v); scrollTo({ top: 0 }); return v; }
/* ---------- 🔒 a Roadmap step that is still locked opens for reading: its theory is there, its exercises wait until the step opens ---------- */
let STEP_LOCK = null;
/** { missing: titles of the steps to master first } when every Roadmap step this subject teaches is still locked, else null. */
function stepLock() {
  const CU = window.NoemaCurriculum, acc = ACCOUNT?.id; if (!CU?.stepsOf || !acc) return null;
  const on = CU.stepsOf(acc, SUBJ.id).filter(x => !x.c.nodes[x.nid].pack?.assigned).map(x => ({ ...x, all: CU.statuses(acc, x.c) })).filter(x => x.all[x.nid]);   // a subject of the learner's own, attached to a step, stays theirs
  if (!on.length || on.some(x => x.all[x.nid].open || x.all[x.nid].mastered)) return null;
  const x = on[0]; return { missing: (x.all[x.nid].parents || []).filter(p => !x.all[p]?.mastered).map(p => x.c.nodes[p]?.title || p) };
}
const lockNote = () => h('div', { class: 'locknote' }, '🔒 ', SL('exLocked', { list: STEP_LOCK.missing.join(', ') || '…' }));
function lockedView() {
  shellChrome({ sub: true, crumbs: [[SL('exercisesWord')]], back: HOME(), corner: true });
  view(lockNote(), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => go(HOME()) }, '📖 ' + SL('backToTheory'))));
}
const LOCKED_ROUTES = new Set(['practice', 'run', 'boss', 'lightning', 'cards', 'drills', 'drill', 'mistakes', 'ex']);
const go = hash => { location.hash = hash; };
/** Remember where the learner reads (Today › Continue, across subjects; engine/shell.js). */
function noteRecent(extra = {}) {
  const X = window.NoemaShell; if (!X?.noteRecent) return;
  X.noteRecent({ subj: SUBJ.id, title: SUBJ.title, cid: Noema.node?.id || null, node: Noema.node?.node || null, ...extra });
}

/* ---------- top bar (classic, without the shell) ---------- */
let timerT = null, timerEnd = 0;
function renderTopStats() {
  const x = $('#xpchip'), s = $('#streakchip');
  if (x) x.textContent = `⭐ ${S.xp} XP`;
  if (s) s.textContent = `🔥 ${Noema.stats.streakNow()}`;
}
/** ⏱️ The 15-minute focus sprint (top bar chip, or the shell's ⋮ with a small clock next to it). */
function focusSprint(btn) {
  const clock = btn || $('.ns-focus') || (SHL() ? (() => { const b = h('button', { class: 'chip timer ns-focus', title: t('top.focusTitle'), onclick: () => focusSprint() }); SHL().setActs([b]); return b; })() : null);
  const idle = () => { clock?.classList.remove('running'); if (clock) { if (clock.classList.contains('ns-focus')) clock.remove(); else clock.textContent = '⏱️ ' + t('top.focus'); } };
  if (timerT) { clearInterval(timerT); timerT = null; idle(); return; }
  timerEnd = Date.now() + 15 * 60e3; clock?.classList.add('running');
  const tick = () => { const left = Math.max(0, timerEnd - Date.now()); const c = $('.timer.running') || clock; if (c) c.textContent = `⏱️ ${String(left / 60e3 | 0).padStart(2, '0')}:${String((left / 1e3 | 0) % 60).padStart(2, '0')}`; if (!left) { clearInterval(timerT); timerT = null; idle(); confetti(120); beep('win'); toast('🎉 Sprint done! Take a 3-minute break — stretch, water, breathe.', 5000); } };
  tick(); timerT = setInterval(tick, 1000);
}
function topbar() {
  const timer = h('button', { class: 'chip timer hide-m', title: t('top.focusTitle'), onclick: () => focusSprint(timer) }, '⏱️ ' + t('top.focus'));
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand', onclick: () => go('#/') }, window.NoemaArt && window.NoemaThemes ? h('div', { class: 'logo', html: NoemaArt.mascot(NoemaThemes.current()) }) : null, h('span', { class: 'name' }, Noema.config.appName || 'noema-lite')),
    h('button', { class: 'subjchip', title: t('top.switchSubject'), onclick: () => Noema.openSubjectPicker() }, h('span', {}, SUBJ.emoji || '📘'), h('span', { class: 'st' }, SUBJ.title), h('span', { class: 'chev' }, '▾')),
    h('div', { class: 'spacer' }),
    Noema.node ? h('button', { class: 'chip curchip', title: t('top.mapTitle'), onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, '🧭', h('span', { class: 'hide-s' }, ' ' + t('top.map')))
      : h('button', { class: 'chip curchip', title: t('top.curriculaTitle'), onclick: () => Noema.curricula() }, '🧭', h('span', { class: 'hide-s' }, ' ' + t('top.curricula'))),
    h('button', { class: 'chip explorechip', title: t('top.exploreTitle'), onclick: () => Noema.explore() }, '🌍', h('span', { class: 'hide-s' }, ' ' + t('top.explore'))),
    timer,
    h('span', { class: 'chip xp hide-m', id: 'xpchip' }), h('span', { class: 'chip streak hide-s', id: 'streakchip', title: t('top.streak') }),
    h('button', { class: 'iconbtn srcbtn', title: t('top.sources'), onclick: () => toggleSourcesDeck() }, '📚'),
    h('button', { class: 'iconbtn hide-m', title: t('top.theme'), onclick: () => { S.settings.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); route(); } }, '🌓'),
    bellButton(),
    h('button', { class: 'iconbtn tutor', title: t('top.tutorTitle'), onclick: () => openTutor() }, TUTOR.avatar, h('span', {}, t('top.tutor'))),
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
    const draw = list => { body.innerHTML = ''; if (!list.length) body.append(h('p', { class: 'muted' }, ACCOUNT.kind === 'cloud' ? 'Nothing new. 🎈' : 'Notifications need a ☁️ cloud account (Account menu → Cloud).')); list.forEach(sh => body.append(Noema.shareRow(sh, { onAccepted: s => { close(); confirmBox(`Open “${s.title}” now?`, () => s.kind === 'curriculum' ? Noema.curriculumMap(s.curriculum) : Noema.switchTo(ACCOUNT.id, s.id)); } }))); };
    Noema.notes.on(draw);
    box.append(h('div', { class: 'row' }, h('h2', { class: 'grow' }, '🔔 Notifications'), h('button', { class: 'iconbtn', onclick: close }, '✕')), body);
  });
}
function shareBanner() {
  const bar = h('div', { class: 'sharebar', role: 'status' });
  let later = new Set();
  const draw = list => {
    const items = list.filter(x => !later.has(x.id)); bar.innerHTML = '';
    bar.classList.toggle('on', !!items.length); if (!items.length) return;
    const sh = items[0];
    if (['curupdate', 'stepupdate', 'subjupdate'].includes(sh.kind)) {   // 🔔 an update that waits for me: take it or keep mine
      const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await Noema.notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toast(take ? `✅ “${sh.title}” is up to date` : `👍 You keep your version of “${sh.title}”`); else b.disabled = false; } catch (er) { toast('⚠️ ' + er.message, 5000); b.disabled = false; } };   // 🔎 Review only opens the review: “Not now” there keeps the update waiting
      bar.append(h('span', { class: 'grow' }, ...Noema.updateText(sh), items.length > 1 ? h('span', { class: 'tiny' }, `  (+${items.length - 1} more in 🔔)`) : ''),
        h('button', { class: 'btn small primary', onclick: act(true) }, Noema.updateLabel(sh)), h('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? 'Keep my copy' : 'Keep mine'),
        h('button', { class: 'btn small ghost', title: 'Decide later (it stays in 🔔)', onclick: () => { later.add(sh.id); draw(Noema.notes.pending); } }, 'Later'));
      return;
    }
    const cur = sh.kind === 'curriculum';   // 👥 an invitation to a shared curriculum
    bar.append(h('span', { class: 'grow' }, cur ? '👥 ' : '📬 ', h('b', {}, sh.from_name || sh.from_email || 'Someone'), cur ? ' invites you to the Roadmap ' : ' wants to share ', h('b', {}, `“${sh.title}”`), cur ? '' : ' with you', items.length > 1 ? h('span', { class: 'tiny' }, `  (+${items.length - 1} more in 🔔)`) : ''),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await Noema.notes.accept(sh); toast(cur ? `👥 You joined “${s.title}” — your progress is your own, the prepared steps are shared` : `✅ “${s.title}” added to your subjects`); confirmBox(`Open “${s.title}” now?`, () => cur ? Noema.curriculumMap(s.curriculum) : Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, cur ? '✓ Join' : '✓ Accept'),
      h('button', { class: 'btn small', onclick: async () => { await Noema.notes.reject(sh).catch(er => toast('⚠️ ' + er.message)); } }, '✕ Reject'),
      h('button', { class: 'btn small ghost', title: 'Decide later (it stays in 🔔)', onclick: () => { later.add(sh.id); draw(Noema.notes.pending); } }, 'Later'));
  };
  Noema.notes.on(draw);
  return bar;
}


/* ---------- the subject's page (#/subject): where you are, Continue, Practice ▾, the chapters as a list or as cards ---------- */
function ring(pct, size = 120, stroke = 12, color = 'var(--c)') {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const holder = h('div', { style: { position: 'absolute', inset: '0' }, html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" data-off="${C * (1 - Math.min(1, pct))}"/></svg>` });
  return holder;
}
function animateRings(root) { requestAnimationFrame(() => requestAnimationFrame(() => $$('circle[data-off]', root).forEach(c => c.style.strokeDashoffset = c.dataset.off))); }
/** Read / solved over the whole subject (0…1). */
function courseProgress() {
  const secs = COURSE.flatMap(c => c.sections.map(s => s.id)); const exN = COURSE.reduce((a, c) => a + c.exercises.length, 0);
  return { sr: secs.length ? secs.filter(id => S.read[id]).length / secs.length : 0, ex: exN ? Object.values(S.res).filter(r => r.ok > 0).length / exN : 0 };
}
/** This subject is a station of a 🧭 Roadmap: which one, its mastery so far, the way back to the map. */
/** The subject as a step of a Roadmap: where, how far to mastery (and the 🎉 once it is mastered). → null when it is not a step */
function stationInfo() {
  if (!Noema.node || !window.NoemaCurMap) return null;
  const info = NoemaCurMap.nodeInfo(ACCOUNT.id, Noema.node); if (!info) return null;
  const { sr: read, ex: solved } = courseProgress();
  const done = info.st.mastered || (read >= 0.999 && solved >= NoemaCurriculum.PASS);
  if (done && !S.nodeDone) { S.nodeDone = Date.now(); save(); setTimeout(() => window.NoemaReact?.big('node'), 600); }
  return { info, read, solved, done };
}
function nodeBanner() {
  const st = stationInfo(); if (!st) return null;
  const { info, read, solved, done } = st;
  return h('div', { class: 'callout key nodebanner' }, h('span', { class: 'ci' }, '🧭'),
    h('div', { class: 'grow' }, h('b', { class: 't' }, SL('stationOf', { title: info.c.title || info.c.goal })),
      h('div', { class: 'tiny' }, done ? SL('stationDone') : SL('stationMastery', { r: Math.round(read * 100), e: Math.round(solved * 100), p: Math.round(NoemaCurriculum.PASS * 100) })),
      h('div', { class: 'nbbar' }, h('i', { style: { width: Math.round(Math.min(read, solved / NoemaCurriculum.PASS) * 100) + '%' } }))),
    h('button', { class: 'btn small', onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, '🗺️ ' + SL('openMap')));
}
/** 🎯 Practice ▾ — every way to practise the whole subject, in one place. */
function practiceItems() {
  if (STEP_LOCK) return [{ label: SL('exercisesWord'), sub: SL('exLocked', { list: STEP_LOCK.missing.join(', ') || '…' }), icon: '🔒', run: () => toast('🔒 ' + SL('lockedPreview'), 4000) }];
  const dueFc = countDueCards(), duePb = countDuePlaybooks(), wrong = mistakesList().length;
  return [
    { label: t('home.mixed'), sub: t('home.mixedSub'), icon: '🎲', href: '#/practice/all' },
    { label: t('home.cards'), sub: t('home.cardsSub'), icon: '🃏', href: '#/cards', badge: dueFc ? t('home.due', { n: dueFc }) : null, tone: 4 },
    Object.keys(PB).length ? { label: t('home.drills'), sub: t('home.drillsSub'), icon: '🔧', href: '#/drills', badge: duePb ? t('home.due', { n: duePb }) : null, tone: 4 } : null,
    { label: t('home.mistakes'), sub: t('home.mistakesSub'), icon: '🔁', href: '#/mistakes', badge: wrong || null, tone: 3 },
    { label: t('home.lightning'), sub: t('home.lightningSub'), icon: '⚡', href: '#/lightning' },
    '-',
    { label: SHL() ? SL('askTutor') : t('home.tutor'), sub: SHL() ? SL(window.NoemaThemes?.tutor?.()?.pl ? 'askTutorSubPl' : 'askTutorSub') : t('home.tutorSub'), icon: TUTOR.avatar, run: () => openTutor(null, 'socratic', null, { intent: INTENT.course }) }];
}
function practiceButton(items = practiceItems()) {
  const X = SHL();
  if (!X?.menuButton) return h('div', { class: 'modes' }, ...items.filter(x => x && x !== '-').map(it => modeTile(it.icon, it.label, it.sub, it.href, it.badge, it.run)));
  return X.menuButton(items, { cls: 'btn ns-practicebtn', label: t('ch.practice'), content: h('span', {}, t('ch.practice'), ' ▾') });
}
function modeTile(ic, title, sub, hash, badge, fn) {
  return h('button', { class: 'mode', onclick: fn || (() => go(hash)) }, badge ? h('span', { class: 'pill badge', style: { background: '#ffe3d3', color: '#e8590c' } }, badge) : null, h('span', { class: 'ic' }, ic), h('b', {}, title), h('small', {}, sub));
}
/** ⋮ of the subject: everything that is not studying itself. */
async function subjectMeta() { return (await Noema.subjectsFor(ACCOUNT.id)).find(x => x.id === SUBJ.id) || { ...SUBJ, origin: Noema.subjectMeta?.origin }; }
function subjectMenu() {
  const own = m => m.origin !== 'library';
  return () => [
    { label: SL('searchSubject'), icon: 'search', run: openSearch },
    newSources().length ? { label: t('view.whatsNew'), icon: 'spark', href: '#/new' } : null,
    { label: SL('sources'), sub: SL('sourcesSub'), icon: 'book', run: () => toggleSourcesDeck() },
    { label: timerT ? SL('focusStop') : SL('focusSprint'), sub: SL('focusSprintSub'), icon: 'clock', run: () => focusSprint() },
    '-',
    Noema.node ? { label: SL('openMap'), icon: 'map', run: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) } : null,
    window.NoemaCurMap?.attachDialog ? { label: Noema.node ? SL('otherStation') : SL('putOnMap'), sub: SL('putOnMapSub'), icon: 'path', run: async () => NoemaCurMap.attachDialog(ACCOUNT.id, { subject: await subjectMeta(), onDone: () => location.reload() }) } : null,
    { label: SL('editSubject'), sub: SL('editSubjectSub'), icon: 'edit', run: async () => Noema.editSubject(await subjectMeta(), { onChange: () => location.reload() }) },
    own(Noema.subjectMeta || {}) ? { label: SL('shareSubject'), sub: SL('shareSubjectSub'), icon: 'share', run: async () => Noema.share(await subjectMeta()) } : null,   // library subjects are everybody's already
    { label: SL('exportPackage'), sub: SL('exportPackageSub'), icon: 'download', run: () => Noema.exportPackage(ACCOUNT.id, Noema.pack).catch(e => toast('⚠️ ' + e.message, 4000)) },
    { label: SL('pickSubject'), icon: 'book', run: () => Noema.openSubjectPicker() },
    '-',
    { label: SL('resetProgress', { title: SUBJ.title }), icon: 'close', danger: true, run: resetProgress }];
}
function resetProgress(after) {
  confirmBox(`Reset your progress in ${SUBJ.title}? (a restore point is kept)`, async () => { await Noema.backup.restorePoint(ACCOUNT.id, 'Before reset of ' + SUBJ.title); const st = S.settings; for (const k of Object.keys(S)) delete S[k]; Object.assign(S, { xp: 0, read: {}, res: {}, pb: {}, fc: {}, boss: {}, last: null, resetAt: Date.now(), settings: st }); flushSave(); if (typeof after === 'function') after(); route(); renderTopStats(); });
}
/** 🔎 Jump to any concept of the subject. */
function openSearch() {
  const results = h('div', { class: 'results' });
  const inp = h('input', { class: 'noema-input', placeholder: `${SL('searchConcept')}${SUBJ.searchExamples ? ' (' + SUBJ.searchExamples + ')' : ''}`, 'aria-label': SL('searchSubject'), oninput: e => doSearch(e.target.value, results) });
  const X = SHL();
  if (X?.sheet) { X.sheet(SL('searchSubject'), (body, close) => { body.append(h('div', { class: 'search' }, h('span', { class: 'si' }, '🔎'), inp), results); results.addEventListener('click', e => { if (e.target.closest('.result')) close(); }); setTimeout(() => inp.focus(), 50); }); return; }
  modal((box, close) => { box.append(h('div', { class: 'search' }, h('span', { class: 'si' }, '🔎'), inp), results); results.addEventListener('click', e => { if (e.target.closest('.result')) close(); }); setTimeout(() => inp.focus(), 50); });
}
const CHVIEW_KEY = 'noema-chview';
function chapterViewStyle() { try { return localStorage.getItem(CHVIEW_KEY) === 'list' ? 'list' : 'cards'; } catch (e) { return 'cards'; } }   // cards unless the learner chose the list
function homeView() {
  setTutorContext(null);
  setAccent(document.body, null);
  shellChrome({ corner: true, menu: subjectMenu() });
  noteRecent();
  const p = courseProgress(), last = S.last && SEC[S.last], first = COURSE[0]?.sections[0];
  const nSec = COURSE.reduce((a, c) => a + c.sections.length, 0);
  const body = h('div', { class: 'chbox' });
  let style = chapterViewStyle();
  const seg = h('div', { class: 'ns-seg small chviewseg', role: 'radiogroup', 'aria-label': SL('chView') }, ...[['list', SL('viewList')], ['cards', SL('viewCards')]].map(([k, l]) => h('button', { 'data-v': k, class: style === k ? 'on' : '', role: 'radio', 'aria-checked': String(style === k), onclick: () => { style = k; try { localStorage.setItem(CHVIEW_KEY, k); } catch (e) { } $$('button', seg).forEach(b => { b.classList.toggle('on', b.dataset.v === k); b.setAttribute('aria-checked', String(b.dataset.v === k)); }); draw(); } }, l)));
  const X = SHL(), st = X ? stationInfo() : null, pr = { r: Math.round(p.sr * 100), e: Math.round(p.ex * 100) };
  const mantra = SUBJ.hero?.mantra || SUBJ.description;
  // the frame: one plain header (a step of which Roadmap · the title · one line · one bar); the classic screens keep the emoji and the step banner
  const top = X ? [st ? h('button', { class: 'ns-kicker subjkicker', title: SL('openMap'), onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, SL('stationOf', { title: st.info.c.title || st.info.c.goal }), ' ›') : null,
      h('h1', { class: 'herohead' }, SUBJ.title), mantra ? h('p', { class: 'mantra', html: fmt(mantra) }) : null]
    : [h('div', { class: 'subjtop' }, h('span', { class: 'subjemo' }, SUBJ.emoji || '📘'), h('div', { class: 'grow' }, h('h1', { class: 'herohead' }, SUBJ.title), mantra ? h('p', { class: 'mantra', html: fmt(mantra) }) : null))];
  const barW = st ? Math.round(Math.min(st.read, st.solved / NoemaCurriculum.PASS) * 100) : Math.round((p.sr + p.ex) * 50);
  const barTip = st ? (st.done ? SL('stationDone') : SL('stationMastery', { ...pr, p: Math.round(NoemaCurriculum.PASS * 100) })) : SL('subjProgress', pr);
  const v = view(
    setupBanner(), X ? null : nodeBanner(),
    h('section', { class: 'subjhead' + (st ? ' station' : '') }, ...top,
      h('div', { class: 'subjbar', title: barTip }, h('div', { class: 'bar' }, h('i', { style: { width: barW + '%' } })), h('span', { class: 'tiny' }, st?.done ? '✓ ' + SL('stationMastered') : SL('subjProgress', pr))),
      h('div', { class: 'row subjgo' },
        last ? h('button', { class: 'btn primary', onclick: () => go(`#/s/${last.id}`) }, SL('continueSec', { title: last.title }))
          : first ? h('button', { class: 'btn primary', onclick: () => go('#/s/' + first.id) }, SL('startCh1')) : null,
        practiceButton(), whatsNewButton())),
    h('div', { class: 'row chlisthead' }, h('h2', { class: 'grow' }, t('home.chapters')), h('span', { class: 'tiny hide-s' }, SL('subjCounts', { c: COURSE.length, s: nSec, e: ALL_EX.length })), seg),
    body);
  function draw() {
    body.innerHTML = '';
    if (style === 'cards') {
      body.append(h('div', { class: 'chapters' }, ...COURSE.map((c, i) => {
        const p = chProgress(c);
        const card = h('button', { class: 'chcard', style: { animationDelay: i * 40 + 'ms' }, onclick: () => go('#/ch/' + c.id) },
          newBadge(c), h('div', { class: 'emo' }, c.emoji), h('div', { class: 'num' }, `${SL('chapterN', { n: c.num })}${S.boss[c.id] ? ' · 🏆' : ''}`), h('h3', {}, c.title), h('p', {}, c.subtitle),
          h('div', { class: 'bars' },
            h('div', { class: 'barlbl' }, h('span', {}, '📖 ' + SL('theory')), h('span', {}, Math.round(p.sr * 100) + '%')), h('div', { class: 'bar' }, h('i', { style: { width: '0%' }, 'data-w': p.sr * 100 + '%' })),
            h('div', { class: 'barlbl' }, h('span', {}, '🎯 ' + SL('practice')), h('span', {}, Math.round(p.ex * 100) + '%')), h('div', { class: 'bar alt' }, h('i', { style: { width: '0%' }, 'data-w': p.ex * 100 + '%' }))));
        setAccent(card, c); return card;
      })));
      requestAnimationFrame(() => requestAnimationFrame(() => $$('.bar>i[data-w]', body).forEach(i => i.style.width = i.dataset.w)));
    } else {
      body.append(h('div', { class: 'chlist' }, ...COURSE.map((c, i) => {
        const p = chProgress(c), pct = Math.round((p.sr + p.ex) * 50);
        const row = h('button', { class: 'chrow' + (pct >= 100 ? ' done' : ''), style: { animationDelay: i * 25 + 'ms' }, onclick: () => go('#/ch/' + c.id) },
          h('span', { class: 'emo' }, c.emoji), h('span', { class: 'grow' }, h('small', {}, SL('chapterN', { n: c.num }), S.boss[c.id] ? ' · 🏆' : ''), h('b', {}, c.title), c.subtitle ? h('small', { class: 'sub' }, c.subtitle) : null),
          newBadge(c), h('span', { class: 'chpct' }, h('span', { class: 'minibar' }, h('i', { style: { width: pct + '%' } })), h('small', {}, pct + '%')));
        setAccent(row, c); return row;
      })));
    }
  }
  draw();
  animateRings(v);
}
let searchIdx = null;
function doSearch(q, box) {
  box.innerHTML = '';
  q = q.trim().toLowerCase(); if (q.length < 2) return;
  if (!searchIdx) searchIdx = Object.values(SEC).map(s => ({ s, title: s.title.toLowerCase(), body: sectionText(s).toLowerCase() }));
  const words = q.split(/\s+/);
  const res = searchIdx.map(x => { let sc = 0; for (const w of words) { if (x.title.includes(w)) sc += 10; const c = x.body.split(w).length - 1; if (!c) return null; sc += Math.min(c, 8); } return { ...x, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 7);
  if (!res.length) { box.append(h('div', { class: 'tiny' }, `No match — try a different word, or ask ${TUTOR.name} ${TUTOR.avatar}`)); return; }
  res.forEach((r, i) => {
    const pos = r.body.indexOf(words[0]);
    const snip = sectionText(r.s).slice(Math.max(0, pos - 50), pos + 90).replace(/\s+/g, ' ');
    const b = h('button', { class: 'result', style: { animationDelay: i * 30 + 'ms' }, onclick: () => go('#/s/' + r.s.id) }, h('b', {}, `${r.s._ch.emoji} ${r.s.title}`), h('small', {}, `Ch${r.s._ch.num} · …${snip}…`));
    box.append(b);
  });
}

/* ---------- chapter: Theory · Practice · Traps (the old Cards and Debug-drill tabs live inside Practice; their links still work) ---------- */
let chTab = {};
/** A row of choices: a ⋮-style pop-up in the shell, plain buttons without it. */
function choiceList(items) {
  return h('div', { class: 'plist' }, ...items.filter(Boolean).map(it => h('button', { class: 'pitem' + (it.cls ? ' ' + it.cls : ''), onclick: it.run || (() => go(it.href)) },
    h('span', { class: 'pic' }, it.icon), h('span', { class: 'grow' }, h('b', {}, it.label), it.sub ? h('small', {}, it.sub) : null), it.badge != null && it.badge !== '' ? h('span', { class: 'pill c' }, it.badge) : null, h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
}
function chapterMenu(c) {
  return () => [{ label: SL('chSocratic'), sub: SL('chSocraticSub'), icon: TUTOR.avatar, run: () => openTutor({ kind: 'chapter', id: c.id }, 'socratic', null, { intent: INTENT.chSocratic }) },
    { label: SL('searchSubject'), icon: 'search', run: openSearch }, { label: SL('sources'), sub: SL('sourcesSub'), icon: 'book', run: () => toggleSourcesDeck() },
    { label: timerT ? SL('focusStop') : SL('focusSprint'), sub: SL('focusSprintSub'), icon: 'clock', run: () => focusSprint() }, '-',
    { label: SL('allChapters'), icon: 'list', href: HOME() }];
}
function chapterView(id, tab) {
  const c = CH[id]; if (!c) return go(HOME());
  setAccent(document.body, c);
  setTutorContext({ kind: 'chapter', id });
  tab = tab || chTab[id] || 'learn'; chTab[id] = tab;
  const on = ['debug', 'cards', 'filters'].includes(tab) ? 'practice' : ['learn', 'practice', 'traps'].includes(tab) ? tab : 'learn';
  shellChrome({ sub: true, crumbs: [[`${c.emoji} ${c.title}`]], back: HOME(), corner: true, menu: chapterMenu(c) });
  noteRecent({ chNum: c.num, chOf: COURSE.length });
  const p = chProgress(c);
  const tabs = [['learn', t('ch.learn'), c.sections.length], ['practice', t('ch.practice'), c.exercises.length], ['traps', t('ch.traps'), c.pitfalls.length]];
  const body = h('div');
  const v = view(
    backBtn(t('ch.all'), HOME()),
    h('div', { class: 'chhead' }, h('div', { class: 'emo' }, c.emoji),
      h('div', { class: 'grow' }, h('div', { class: 'num' }, SL('chOf', { n: c.num, of: COURSE.length })), h('h1', {}, c.title), c.subtitle ? h('p', { class: 'muted', style: { margin: '6px 0 0' } }, c.subtitle) : null, sourceChips(FULL_COURSE.find(x => x.id === c.id) || c)),
      h('div', { class: 'chring' }, ring((p.sr + p.ex) / 2, 76, 9), h('div', { class: 'chringc' }, Math.round((p.sr + p.ex) * 50) + '%'))),
    explainable(h('div', { class: 'mantrabox' }, h('span', {}, '🧭'), F(c.mantra)), () => ({ label: c.mantra, text: `The mental model of chapter ${c.num} "${c.title}": ${c.mantra}`, ch: c, what: 'mental model' })),
    h('div', { class: 'tabs', role: 'tablist' }, ...tabs.map(([k, l, n]) => h('button', { class: on === k ? 'on' : '', role: 'tab', 'aria-selected': String(on === k), onclick: () => go(`#/ch/${id}/${k}`) }, l, h('span', { class: 'n' }, n)))),
    body);
  animateRings(v);
  if (on === 'learn') {
    const nextSec = c.sections.find(s => !S.read[s.id]);
    body.append(
      h('details', { class: 'obj' }, h('summary', {}, '🎯 ' + SL('objectives') + ' ▸'), h('ul', {}, ...c.objectives.map(o => h('li', { html: fmt(o) })))),
      h('div', { class: 'path' }, ...c.sections.map((s, i) => {
        const nEx = c.exercises.filter(e => e.section === s.id), nOk = nEx.filter(e => solved(e.id)).length;
        return h('button', { class: 'node' + (S.read[s.id] ? ' done' : ''), style: { animationDelay: i * 35 + 'ms' }, onclick: () => go('#/s/' + s.id) },
          h('div', { class: 'dot' }, S.read[s.id] ? '✓' : i + 1), h('div', { class: 'grow' }, h('b', {}, s.title), h('small', {}, s.hook || '')),
          h('div', { class: 'meta' }, newBadge(s), h('span', { class: 'pill' + (nOk === nEx.length && nEx.length ? ' c' : '') }, `🎯 ${nOk}/${nEx.length}`)));
      })),
      h('div', { class: 'row', style: { marginTop: '22px' } },
        nextSec ? h('button', { class: 'btn primary', onclick: () => go('#/s/' + nextSec.id) }, (S.read[c.sections[0].id] ? SL('continueSec', { title: nextSec.title }) : SL('startReading'))) : h('button', { class: 'btn primary', onclick: () => go(`#/ch/${id}/practice`) }, '🎯 ' + SL('practiceChapter')),
        h('button', { class: 'btn ghost', onclick: () => openTutor({ kind: 'chapter', id }, 'socratic', null, { intent: INTENT.chSocratic }) }, `${TUTOR.avatar} ${SL('chSocratic')}`)));
  } else if (on === 'practice') {
    if (STEP_LOCK) body.append(lockNote());
    else if (tab === 'practice') body.append(chapterPractice(c));
    else {
      body.append(h('button', { class: 'linkish subback', onclick: () => go(`#/ch/${id}/practice`) }, '‹ ' + SL('allWays')));
      if (tab === 'debug') drillList(body, c.debug);
      else if (tab === 'cards') flashDeck(body, c.flashcards.map((f, i) => ({ ...f, key: f._key || c.id + '#' + i, _ch: c })));
      else practiceSetup(body, c);
    }
  } else if (on === 'traps') {
    const traps = c.exercises.filter(e => e.tags.some(t => ['pitfall', 'exam'].includes(t))), tf = c.exercises.filter(e => e.type === 'tf');
    body.append(h('p', { class: 'muted' }, SL('trapsIntro')),
      h('div', { class: 'row', style: { marginBottom: '14px' } },
        traps.length ? h('button', { class: 'btn primary', onclick: () => startRun(traps, { title: `⚠️ ${SL('trapDrill')} · Ch${c.num}`, count: 12, back: `#/ch/${id}/traps` }) }, '⚠️ ' + SL('trapsNoTimer')) : null,
        tf.length >= 3 ? h('button', { class: 'btn', onclick: () => go('#/lightning/' + id) }, '⚡ ' + SL('trapsTimed')) : null),
      h('div', { style: { display: 'grid', gap: '10px' } }, ...c.pitfalls.map((p, i) => explainable(h('div', { class: 'callout pitfall', style: { animation: `slideIn .4s ${i * 30}ms both` } }, h('span', { class: 'ci' }, '⚠️'), h('b', { class: 't', html: fmt(p.title) }), h('div', { html: fmt(p.text) }), p.fix ? h('div', { style: { marginTop: '6px' }, html: '✅ <b>Fix:</b> ' + fmt(p.fix) }) : null), () => ({ label: p.title, text: `${p.title}: ${p.text}${p.fix ? ' — Fix: ' + p.fix : ''}`, ch: c, what: 'trap' })))));
  }
}
/** Practice tab: every way to practise this chapter. */
function chapterPractice(c) {
  const id = c.id, ok = c.exercises.filter(e => solved(e.id)).length, wrong = c.exercises.filter(e => S.res[e.id]?.last === false);
  const cards = c.flashcards.map((f, i) => f._key || c.id + '#' + i), dueC = cards.filter(k => S.fc[k] && cardDue(k)).length;
  const dueD = c.debug.filter(d => !S.pb[d.id] || S.pb[d.id].due <= today()).length;
  return choiceList([
    c.exercises.length ? { label: SL('round10'), sub: SL('solvedOf', { n: ok, of: c.exercises.length }), icon: '🎯', cls: 'main', run: () => startRun(c.exercises, { title: `🎯 Ch${c.num} · ${c.title}`, count: 10, back: `#/ch/${id}/practice` }) } : null,
    c.exercises.length ? { label: SL('chooseRound'), sub: SL('chooseRoundSub'), icon: '🎛️', href: `#/ch/${id}/filters` } : null,
    c.flashcards.length ? { label: t('home.cards'), sub: t('home.cardsSub'), icon: '🃏', href: `#/ch/${id}/cards`, badge: dueC ? t('home.due', { n: dueC }) : c.flashcards.length } : null,
    c.debug.length ? { label: t('home.drills'), sub: t('home.drillsSub'), icon: '🔧', href: `#/ch/${id}/debug`, badge: dueD ? t('home.due', { n: dueD }) : c.debug.length } : null,
    wrong.length ? { label: t('home.mistakes'), sub: t('home.mistakesSub'), icon: '🔁', badge: wrong.length, run: () => startRun(wrong, { title: `🔁 Ch${c.num} mistakes`, count: wrong.length, back: `#/ch/${id}/practice` }) } : null,
    c.exercises.length ? { label: S.boss[id] ? SL('bossBeaten') : SL('boss'), sub: SL('bossSub'), icon: S.boss[id] ? '🏆' : '👾', href: `#/boss/${id}` } : null,
    { label: SL('chSocratic'), sub: SL('chSocraticSub'), icon: TUTOR.avatar, run: () => openTutor({ kind: 'chapter', id }, 'socratic', null, { intent: INTENT.chSocratic }) }]);
}

/* ---------- section reader ---------- */
const CALLOUT_IC = { key: '🔑', pitfall: '⚠️', tip: '💡', exam: '🎓', warn: '🚧', analogy: '🧩', debug: '🔧', interview: '🎤' };
function renderBlock(b, i) {
  const wrap = h('div', { class: 'blk b-' + b.t, style: { animationDelay: (i % 6) * 60 + 'ms' } });
  switch (b.t) {
    case 'p': wrap.append(h('p', { html: fmt(b.text) })); break;
    case 'list': wrap.append(h(b.ordered ? 'ol' : 'ul', {}, ...b.items.map(x => h('li', { html: fmt(x) })))); break;
    case 'code': wrap.append(codeBlock(b.code, b.lang)); if (b.caption) wrap.append(h('div', { class: 'caption', html: fmt(b.caption) })); break;
    case 'figure': wrap.append(figureBlock(b)); break;
    case 'diagram': wrap.append(h('div', { class: 'diagram' }, b.text)); if (b.caption) wrap.append(h('div', { class: 'caption', html: fmt(b.caption) })); break;
    case 'table': wrap.append(h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...b.head.map(x => h('th', { html: fmt(x) })))), h('tbody', {}, ...b.rows.map(r => h('tr', {}, ...r.map(x => h('td', { html: fmt(x) })))))))); if (b.caption) wrap.append(h('div', { class: 'caption', html: fmt(b.caption) })); break;
    case 'callout': wrap.append(h('div', { class: 'callout ' + b.kind }, h('span', { class: 'ci' }, CALLOUT_IC[b.kind] || '💡'), b.title ? h('b', { class: 't', html: fmt(b.title) }) : null, h('div', { html: fmt(b.text) }))); break;
    case 'compare': wrap.append(h('div', { class: 'compare' }, ...b.items.map(it => h('div', {}, h('h4', { html: fmt(it.title) }), h('ul', {}, ...it.points.map(p => h('li', { html: fmt(p) }))))))); break;
    case 'flow': { const f = h('div', { class: 'flow' }); b.items.forEach((x, k) => { if (k) f.append(h('span', { class: 'ar' }, '→')); f.append(h('span', { class: 'st', style: { animationDelay: k * 70 + 'ms' }, html: fmt(x) })); }); wrap.append(f); if (b.caption) wrap.append(h('div', { class: 'caption', html: fmt(b.caption) })); break; }
    case 'reveal': { const r = h('div', { class: 'reveal' }, h('button', { onclick: () => { r.classList.toggle('open'); if (r.classList.contains('open') && !r._xp) { r._xp = 1; addXP(1, r); } } }, h('span', {}, '🤔'), h('span', { class: 'q', html: fmt(b.label) }), h('span', { class: 'chev' }, '▸')), h('div', { class: 'ans', html: fmt(b.text) })); wrap.append(r); break; }
    case 'ask': {
      const box = h('div', { class: 'ask' });
      const ol = h('ol', {}, ...b.questions.map(q => { const li = h('li', { onclick: () => li.classList.add('shown') }, h('span', { html: fmt(q) })); return li; }));
      const tog = h('button', { class: 'btn small', style: { marginLeft: 'auto' }, onclick: () => { box.classList.toggle('recall'); $$('li', ol).forEach(l => l.classList.remove('shown')); tog.textContent = box.classList.contains('recall') ? '👁️ Show all' : '🙈 Recall mode'; } }, '🙈 Recall mode');
      box.append(h('div', { class: 'hd' }, '🧠', h('span', { html: fmt(b.title || 'Ask yourself') }), tog), ol);
      wrap.append(box); break;
    }
    case 'terms': wrap.append(h('div', { class: 'terms' }, ...b.items.map(t => h('div', { class: 'term' }, h('b', { html: fmt(t.term) }), h('div', { class: 'tiny', style: { color: 'var(--ink2)', fontSize: '14px' }, html: fmt(t.def) }))))); break;
  }
  return wrap;
}
/** 💡 on a block and on its cards / items (compare columns, terms, list items, table rows). */
const BLOCK_WHAT = { p: 'paragraph', list: 'list', code: 'code example', figure: 'figure', diagram: 'diagram', table: 'table', callout: 'note', compare: 'comparison', flow: 'process', reveal: 'question', ask: 'set of questions', terms: 'set of terms' };
function explainParts(el, b, s) {
  explainable(el, () => ({ label: b.title || b.label || b.caption || (b.t === 'figure' ? (MEDIA[b.media]?.alt || 'this figure') : blockText(b)), text: blockText(b), sec: s, what: BLOCK_WHAT[b.t] || 'part of the lesson' }));
  if (b.t === 'compare') $$('.compare > div', el).forEach((d, k) => { const it = b.items[k]; if (it) explainable(d, () => ({ label: it.title, text: it.title + ':\n' + it.points.map(p => '- ' + p).join('\n') + '\n\n(Compared with: ' + b.items.filter(x => x !== it).map(x => x.title).join(', ') + ')', sec: s, what: 'card' })); });
  if (b.t === 'terms') $$('.term', el).forEach((d, k) => { const t = b.items[k]; if (t) explainable(d, () => ({ label: t.term, text: `${t.term}: ${t.def}`, sec: s, what: 'term' })); });
  if (b.t === 'list') $$('li', el).forEach((d, k) => { const x = b.items[k]; if (x && String(x).length > 30) explainable(d, () => ({ label: x, text: x + '\n\n(One item of the list:\n' + blockText(b) + ')', sec: s, what: 'point' })); });
  if (b.t === 'table') $$('tbody tr', el).forEach((d, k) => { const r = b.rows[k]; if (r) explainable(d.lastElementChild || d, () => ({ label: r[0], text: b.head.map((hd, j) => `${hd}: ${r[j] ?? ''}`).join('\n'), sec: s, what: 'row of the table' })); });
  return el;
}
function chunkBlocks(blocks) {
  // group into bite-size chunks of ~3–4 blocks, never splitting right after a heading-like callout
  const out = []; let cur = [], weight = 0;
  blocks.forEach(b => {
    const w = b.t === 'p' ? 1 : b.t === 'list' ? 1.3 : b.t === 'code' || b.t === 'diagram' || b.t === 'table' || b.t === 'compare' ? 1.6 : 1;
    cur.push(b); weight += w;
    if (weight >= 3.6) { out.push(cur); cur = []; weight = 0; }
  });
  if (cur.length) { if (out.length && cur.length === 1) out[out.length - 1].push(...cur); else out.push(cur); }
  return out;
}
const revealedChunks = {};
function sectionMenu(s) {
  const fresh = () => { const slot = $('.freshslot'); if (slot) { slot.dispatchEvent(new Event('noema-fresh')); slot.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else go('#/s/' + s.id); };
  return () => [{ label: SL('askSocratic'), icon: TUTOR.avatar, run: () => askSection(s, 'socratic') }, $('.freshslot') ? { label: SL('askFresh'), sub: SL('askFreshSub'), icon: '✨', run: fresh } : null, { label: SL('searchSubject'), icon: 'search', run: openSearch },
    { label: SL('sources'), sub: SL('sourcesSub'), icon: 'book', run: () => toggleSourcesDeck() }, { label: timerT ? SL('focusStop') : SL('focusSprint'), sub: SL('focusSprintSub'), icon: 'clock', run: () => focusSprint() },
    '-', { label: SL('allSections'), icon: 'list', href: '#/ch/' + s._ch.id }];
}
function sectionView(sid) {
  const s = SEC[sid]; if (!s) return go(HOME());
  const c = s._ch; setAccent(document.body, c);
  S.last = sid; save();
  setTutorContext({ kind: 'section', id: sid });
  shellChrome({ sub: true, crumbs: [[`${c.emoji} ${c.title}`, '#/ch/' + c.id]], back: '#/ch/' + c.id, reading: true, menu: sectionMenu(s) });
  noteRecent({ sid, secTitle: s.title, chNum: c.num, chOf: COURSE.length, secNum: s._j + 1, secOf: c.sections.length });
  const chunks = S.settings.chunk ? chunkBlocks(s.blocks) : [s.blocks];
  let shown = revealedChunks[sid] || (S.read[sid] ? chunks.length : 1);
  const prev = c.sections[s._j - 1], next = c.sections[s._j + 1];
  const body = h('div');
  const pl = h('div', { class: 'progressline' }, h('i', { style: { width: '0%' } }));
  const tail = h('div');
  const v = view(h('div', { class: 'reader' },
    backBtn(`← ${c.emoji} Ch${c.num} · ${c.title}`, '#/ch/' + c.id),
    pl,
    explainable(h('div', { class: 'sechead' }, h('div', { class: 'row' }, h('span', { class: 'pill c' }, SHL() ? `${SL('chOf', { n: c.num, of: COURSE.length })} · ${SL('secOf', { n: s._j + 1, of: c.sections.length })}` : `Section ${s._j + 1} / ${c.sections.length}`), S.read[sid] ? h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)' } }, '✓ ' + SL('read')) : null),
      h('h1', { style: { marginTop: '10px' } }, s.title), s.hook ? h('p', { class: 'hook', html: fmt(s.hook) }) : null), () => ({ label: s.title, text: `The whole section "${s.title}" — ${s.hook || ''} (give me the big picture of this section)`, sec: s, what: 'section' })),
    body, tail));
  function draw(scroll) {
    body.innerHTML = '';
    chunks.slice(0, shown).forEach((ch, ci) => ch.forEach((b, i) => { const el = renderBlock(b, ci === shown - 1 ? i : 0); markNewBlock(el, b, c); explainParts(el, b, s); body.append(el); }));
    pl.firstChild.style.width = (shown / chunks.length * 100) + '%';
    tail.innerHTML = '';
    if (shown < chunks.length) {
      tail.append(h('div', { class: 'continue' }, h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { shown++; revealedChunks[sid] = shown; draw(true); } }, `${SL('continueRead')} ▾  (${shown}/${chunks.length})`),
        h('button', { class: 'btn ghost small', onclick: () => { shown = chunks.length; revealedChunks[sid] = shown; draw(); } }, SL('showAll')))));
      if (scroll) { const els = $$('.blk', body); const first = els[els.length - chunks[shown - 1].length]; first?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else {
      if (!S.read[sid]) {
        S.read[sid] = true; save(); addXP(5, pl);
        if (c.sections.every(x => S.read[x.id])) setTimeout(() => window.NoemaReact?.big('chapter'), 500);   // the last section of the chapter
      }
      tail.append(sectionTail(s, prev, next));
      if (scroll) { const els = $$('.blk', body); const first = els[els.length - chunks[shown - 1].length]; first?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  }
  draw();
}
const SEC_ASK = { socratic: ['Start a Socratic session on "{t}". Begin by probing what I already think.', 'secSocratic'], debug: ['Start a debugging simulation related to "{t}".', 'secDebug'], interview: ['Interview me about "{t}".', 'secInterview'] };
function askSection(s, mode) { const [msg, intent] = SEC_ASK[mode]; openTutor({ kind: 'section', id: s.id }, mode, msg.replace('{t}', s.title), { intent: INTENT[intent] }); }
function sectionTail(s, prev, next) {
  const c = s._ch;
  const exs = c.exercises.filter(e => e.section === s.id);
  const quick = exs.filter(e => e.quick);
  const pbs = c.debug.filter(d => d.section === s.id);
  const zone = h('div', { class: 'quickzone' });
  if (STEP_LOCK) { if (exs.length || pbs.length) zone.append(lockNote()); }
  else if (quick.length) {
    zone.append(h('h3', {}, '⚡ ' + SL('quickCheck'), h('span', { class: 'tiny' }, SL('quickCheckSub', { n: quick.length }))));
    quick.forEach(e => zone.append(exerciseCard(e)));
  }
  if (pbs.length && !STEP_LOCK) {
    zone.append(h('h3', { style: { margin: '22px 0 10px' } }, '🔧 ' + SL('sectionDrill')));
    pbs.forEach(d => zone.append(drillTile(d)));
  }
  const fresh = h('div', { class: STEP_LOCK ? '' : 'freshslot' });
  const freshQ = async () => { const note = h('p', { class: 'tiny' }, '✨ ' + SL('generating')); fresh.prepend(note); try { const ex = await aiQuestion(s); note.replaceWith(exerciseCard(ex)); } catch (er) { note.remove(); toast('⚠️ ' + er.message, 4000); } };
  const ask = [{ label: SL('askSocratic'), icon: TUTOR.avatar, run: () => askSection(s, 'socratic') }, { label: SL('askDebug'), icon: '🔧', run: () => askSection(s, 'debug') },
    { label: SL('askInterview'), icon: '🎤', run: () => askSection(s, 'interview') }, '-', { label: SL('askFresh'), sub: SL('askFreshSub'), icon: '✨', run: freshQ }];
  const X = SHL();
  if (!STEP_LOCK) fresh.addEventListener('noema-fresh', freshQ);   // the section's ⋮ › A new question
  // in the frame the tutor's ways (Socratic, debugging, interview) are in its own window and a new question in the section's ⋮
  zone.append(fresh, h('div', { class: 'row sectools' },
    X ? null : h('span', { class: 'row' }, ...ask.filter(a => a !== '-').map(a => h('button', { class: 'btn' + (a.icon === TUTOR.avatar ? ' ai' : ''), onclick: a.run }, `${a.icon} ${a.label}`))),
    exs.length && !STEP_LOCK ? h('button', { class: 'btn ghost', onclick: () => startRun(exs, { title: `🎯 ${s.title}`, count: exs.length, back: '#/s/' + s.id }) }, '🎯 ' + SL('allExercises', { n: exs.length })) : null));
  if (!X) {
    zone.append(h('div', { class: 'secnav' },
      prev ? h('button', { class: 'btn', onclick: () => go('#/s/' + prev.id) }, '← ' + prev.title) : h('span'),
      next ? h('button', { class: 'btn primary', onclick: () => go('#/s/' + next.id) }, next.title + ' →') : h('button', { class: 'btn primary', onclick: () => go(`#/ch/${c.id}/practice`) }, '🎯 ' + SL('practiceChapter') + ' →')));
    return zone;
  }
  // the frame: one big “Next section” (the next chapter's first one after the last section), the chapter's practice beside it
  const nextCh = !next && COURSE[COURSE.indexOf(c) + 1], to = next || nextCh?.sections[0];
  zone.append(h('nav', { class: 'secnav ns-secnav', 'aria-label': SL('nextSection') },
    to ? h('button', { class: 'btn primary secnext', onclick: () => go('#/s/' + to.id) }, h('span', { class: 'nx' }, SL('nextSection') + ' →'), h('small', {}, next ? next.title : SL('nextChapterFirst', { n: nextCh.num, title: nextCh.title })))
      : h('button', { class: 'btn primary secnext', onclick: () => go(`#/ch/${c.id}/practice`) }, h('span', { class: 'nx' }, '🎯 ' + SL('practiceChapter') + ' →')),
    to && !next ? h('button', { class: 'btn', onclick: () => go(`#/ch/${c.id}/practice`) }, '🎯 ' + SL('practiceChapter')) : null,
    prev ? h('button', { class: 'btn ghost small secprev', title: prev.title, onclick: () => go('#/s/' + prev.id) }, '← ' + SL('prevSection')) : null));
  return zone;
}

/* ---------- practice ---------- */
function practiceSetup(body, c) {
  const st = { sec: 'all', types: new Set(), tags: new Set(), diff: 0, mode: 'smart', count: 10 };
  const info = h('span', { class: 'tiny' });
  const pool = () => c.exercises.filter(e => (st.sec === 'all' || e.section === st.sec) && (!st.types.size || st.types.has(e.type)) && (!st.tags.size || e.tags.some(t => st.tags.has(t))) && (!st.diff || e.difficulty === st.diff));
  const upd = () => { const p = pool(); info.textContent = `${p.length} exercises match · ${p.filter(e => solved(e.id)).length} solved`; };
  const chipset = (items, set, label) => h('div', { class: 'fchips' }, ...items.map(([k, l]) => { const b = h('button', { class: 'fchip', onclick: () => { set.has(k) ? set.delete(k) : set.add(k); b.classList.toggle('on'); upd(); } }, l); return b; }));
  const types = [...new Set(c.exercises.map(e => e.type))];
  const secSel = h('select', { class: 'sel', onchange: e => { st.sec = e.target.value; upd(); } }, h('option', { value: 'all' }, 'All sections'), ...c.sections.map(s => h('option', { value: s.id }, s.title)));
  const diffChips = h('div', { class: 'fchips' }, ...[[0, 'Any'], [1, '● easy'], [2, '●● medium'], [3, '●●● hard']].map(([d, l]) => { const b = h('button', { class: 'fchip' + (d === 0 ? ' on' : ''), onclick: () => { st.diff = d; $$('.fchip', diffChips).forEach(x => x.classList.remove('on')); b.classList.add('on'); upd(); } }, l); return b; }));
  const countChips = h('div', { class: 'fchips' }, ...[[5, '5'], [10, '10'], [20, '20'], [999, '∞ all']].map(([n, l]) => { const b = h('button', { class: 'fchip' + (n === 10 ? ' on' : ''), onclick: () => { st.count = n; $$('.fchip', countChips).forEach(x => x.classList.remove('on')); b.classList.add('on'); } }, l); return b; }));
  body.append(h('div', { class: 'card filters' },
    h('div', {}, h('div', { class: 'lbl' }, 'Section'), secSel),
    h('div', {}, h('div', { class: 'lbl' }, 'Exercise types'), chipset(types.map(t => [t, TYPE_LABEL[t]]), st.types)),
    h('div', {}, h('div', { class: 'lbl' }, 'Focus'), chipset([['pitfall', '⚠️ pitfalls'], ['debug', '🔧 debugging'], ['exam', '🎓 exam traps'], ['syntax', '⌨️ syntax'], ['calc', '🧮 calc'], ['interview', '🎤 interview'], ['compare', '⚖️ compare']], st.tags)),
    h('div', {}, h('div', { class: 'lbl' }, 'Difficulty'), diffChips),
    h('div', {}, h('div', { class: 'lbl' }, 'Round size'), countChips),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { const p = pool(); if (!p.length) return toast('No exercises match these filters'); startRun(p, { title: `🎯 Ch${c.num} practice`, count: st.count, back: `#/ch/${c.id}/practice` }); } }, '▶ Start round'), info)));
  upd();
}
function runOrder(list) {
  // unsolved & previously-wrong first, then the rest; shuffled inside groups
  const g1 = [], g2 = [], g3 = [];
  list.forEach(e => { const r = S.res[e.id]; if (!r) g1.push(e); else if (r.last === false) g2.push(e); else g3.push(e); });
  return [...shuffle(g2), ...shuffle(g1), ...shuffle(g3)];
}
function startRun(list, opt = {}) {
  RUN = { list: (opt.keepOrder ? list : runOrder(list)).slice(0, opt.count || 10), i: 0, ok: 0, xp0: S.xp, wrong: [], title: opt.title || 'Practice', back: opt.back || HOME(), lives: opt.lives || 0, boss: opt.boss || null };
  if (location.hash === '#/run') runView(); else go('#/run');
}
let RUN = null;
function runView() {
  if (!RUN) return go(HOME());
  const R0 = RUN;
  shellChrome({ sub: true, crumbs: [[R0.title]], back: R0.back, reading: true });
  if (R0.i >= R0.list.length || (R0.lives && R0.lives <= 0)) return runSummary();
  const ex = R0.list[R0.i];
  setAccent(document.body, ex._ch);
  setTutorContext({ kind: 'section', id: ex.section });
  const nextBtn = h('button', { class: 'btn primary', style: { display: 'none' }, onclick: () => { R0.i++; runView(); } }, R0.i + 1 < R0.list.length ? 'Next →' : 'Finish 🏁');
  const card = exerciseCard(ex, { showSection: true, onDone: (ok) => { if (ok) R0.ok++; else { R0.wrong.push(ex); if (R0.lives) { R0.lives--; $('.hearts') && ($('.hearts').textContent = '❤️'.repeat(R0.lives) + '🤍'.repeat(3 - R0.lives)); } } if (R0.lives === 0 && R0.boss) nextBtn.textContent = 'See result'; nextBtn.style.display = ''; nextBtn.classList.add('pop'); setTimeout(() => nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300); } });
  view(h('div', { class: 'runner' },
    h('div', { class: 'runtop' }, h('button', { class: 'iconbtn', title: 'Quit', onclick: () => go(R0.back) }, '✕'),
      h('div', { class: 'bar' }, h('i', { style: { width: (R0.i / R0.list.length * 100) + '%' } })),
      R0.boss ? h('span', { class: 'hearts' }, '❤️'.repeat(R0.lives) + '🤍'.repeat(3 - R0.lives)) : null,
      h('b', { class: 'tiny' }, `${R0.i + 1}/${R0.list.length}`)),
    h('div', { class: 'tiny', style: { marginBottom: '8px', fontWeight: 700 } }, R0.title),
    card, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, nextBtn)));
}
function runSummary() {
  const R0 = RUN, n = R0.i, pct = n ? R0.ok / n : 0, xp = S.xp - R0.xp0;
  let big = pct >= .9 ? '🏆' : pct >= .7 ? '🎉' : pct >= .5 ? '💪' : '🌱';
  let msg = pct >= .9 ? 'Outstanding!' : pct >= .7 ? 'Great work!' : pct >= .5 ? 'Solid progress — the mistakes are where the learning is.' : 'Good start — retry the mistakes while they are fresh.';
  const RX = SHL() ? window.NoemaReact : null;
  if (R0.boss) {
    const won = R0.lives > 0 && R0.i >= R0.list.length && pct >= .7;
    if (won) { S.boss[R0.boss] = true; save(); big = '🏆'; msg = 'Boss defeated! Chapter badge unlocked.'; RX?.big('bosswin'); } else { big = '👾'; msg = 'The boss wins this time. Review the misses and come back stronger!'; }
  } else if (R0.back === '#/mistakes' && R0.ok && !mistakesList().length) RX?.big('gym');   // the gym is empty
  else if (n >= 5 && R0.ok === n) RX?.big('perfect');
  if (pct >= .7) { if (!RX) confetti(); beep('win'); }
  view(h('div', { class: 'runner' }, h('div', { class: 'card summary' },
    h('div', { class: 'big' }, big), h('h2', {}, msg),
    h('div', { class: 'statgrid' }, h('div', { class: 'stat' }, h('b', {}, `${R0.ok}/${n}`), h('span', { class: 'tiny' }, 'correct')), h('div', { class: 'stat' }, h('b', {}, Math.round(pct * 100) + '%'), h('span', { class: 'tiny' }, 'accuracy')), h('div', { class: 'stat' }, h('b', {}, '+' + xp), h('span', { class: 'tiny' }, 'XP'))),
    R0.wrong.length ? h('div', { style: { textAlign: 'left', margin: '0 0 18px' } }, h('b', {}, 'Review these:'), h('ul', {}, ...R0.wrong.map(e => h('li', { html: fmt((e.q || '').slice(0, 140)) })))) : null,
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      R0.wrong.length ? h('button', { class: 'btn primary', onclick: () => startRun(R0.wrong, { title: '🔁 Retry mistakes', count: R0.wrong.length, back: R0.back }) }, '🔁 Retry mistakes') : null,
      h('button', { class: 'btn', onclick: () => go(R0.back) }, 'Done')))));
}
function mistakesList() { return ALL_EX.filter(e => S.res[e.id] && S.res[e.id].last === false); }
function mistakesView() {
  setAccent(document.body, null);
  shellChrome({ sub: true, crumbs: [[t('home.mistakes')]], back: HOME() });
  const list = mistakesList();
  view(backBtn(t('nav.home'), HOME()), h('h1', {}, t('view.mistakes')),
    h('p', { class: 'muted' }, 'Everything whose last attempt was wrong. Get it right once and it leaves the gym.'),
    list.length ? h('div', {}, h('div', { class: 'row', style: { margin: '8px 0 18px' } }, h('button', { class: 'btn primary', onclick: () => startRun(list, { title: '🔁 Mistakes gym', count: 15, back: '#/mistakes' }) }, `▶ Train ${Math.min(15, list.length)} of ${list.length}`)),
      h('div', { style: { display: 'grid', gap: '8px' } }, ...COURSE.map(c => { const n = list.filter(e => e._ch === c).length; return n ? h('button', { class: 'node', onclick: () => startRun(list.filter(e => e._ch === c), { title: `🔁 Ch${c.num} mistakes`, count: n, back: '#/mistakes' }) }, h('div', { class: 'dot' }, c.emoji), h('div', { class: 'grow' }, h('b', {}, c.title)), h('span', { class: 'pill' }, n)) : null; })))
      : h('div', { class: 'empty' }, h('div', { class: 'e' }, '✨'), h('p', {}, 'No open mistakes. Go make some (that’s how learning works)!')));
}
function mixedView() {
  setAccent(document.body, null);
  shellChrome({ sub: true, crumbs: [[t('home.mixed')]], back: HOME() });
  const readSecs = new Set(Object.keys(S.read));
  const pool = ALL_EX.filter(e => readSecs.has(e.section));
  view(backBtn(t('nav.home'), HOME()), h('h1', {}, t('view.mixed')),
    h('p', { class: 'muted' }, 'Interleaving beats blocking: random exercises from every section you have read (or from everything).'),
    h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn primary', disabled: !pool.length, onclick: () => startRun(pool, { title: '🎲 Mixed: what I have read', count: 12, back: '#/practice/all' }) }, `▶ From what I've read (${pool.length})`),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX, { title: '🎲 Mixed: everything', count: 12, back: '#/practice/all' }) }, `▶ From everything (${ALL_EX.length})`),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX.filter(e => e.tags.includes('debug')), { title: '🔧 Debugging only', count: 12, back: '#/practice/all' }) }, '🔧 Debugging only'),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX.filter(e => e.tags.includes('exam')), { title: '🎓 Exam traps only', count: 12, back: '#/practice/all' }) }, '🎓 Exam traps only')));
}
function bossView(id) {
  const c = CH[id]; if (!c) return go(HOME());
  setAccent(document.body, c);
  shellChrome({ sub: true, crumbs: [[`${c.emoji} ${c.title}`, '#/ch/' + id], [SL('boss')]], back: '#/ch/' + id + '/practice' });
  view(backBtn(`← ${c.title}`, '#/ch/' + id),
    h('div', { class: 'card summary' }, h('div', { class: 'big' }, '👾'), h('h1', {}, `Boss battle · Ch${c.num}`),
      h('p', { class: 'muted' }, '15 mixed questions, mostly medium/hard. You have 3 lives ❤️❤️❤️. Lose them all and the boss wins. Score ≥ 70% with lives left to earn the 🏆.'),
      h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: () => {
        const pool = c.exercises.filter(e => e.type !== 'free');
        const hard = shuffle(pool.filter(e => e.difficulty >= 2)), easy = shuffle(pool.filter(e => e.difficulty < 2));
        const pick = [...hard.slice(0, 12), ...easy.slice(0, 3)];
        startRun(shuffle(pick).slice(0, 15), { title: `👾 Boss · Ch${c.num}`, count: 15, back: '#/ch/' + id, lives: 3, boss: id, keepOrder: true });
        window.NoemaReact?.big('boss');
      } }, '⚔️ Fight!')));
}

/* ---------- lightning ---------- */
function lightningView() {
  setAccent(document.body, null);
  shellChrome({ sub: true, crumbs: [[t('home.lightning')]], back: HOME() });
  const chSel = h('select', { class: 'sel' }, h('option', { value: 'all' }, 'All chapters'), ...COURSE.map(c => h('option', { value: c.id }, `${c.emoji} Ch${c.num} ${c.title}`)));
  const best = S.bestLightning || 0;
  view(backBtn(t('nav.home'), HOME()),
    h('div', { class: 'card lightning' }, h('div', { style: { fontSize: '56px' } }, '⚡'), h('h1', {}, t('view.lightning')),
      h('p', { class: 'muted' }, '60 seconds. True or false. Use ← / → or the buttons. Wrong answers are explained at the end.'),
      h('div', { class: 'row', style: { justifyContent: 'center', margin: '14px 0' } }, chSel), h('p', { class: 'tiny' }, `Personal best: ${best}`),
      h('button', { class: 'btn primary', onclick: () => playLightning(chSel.value) }, '▶ Go!')));
}
function playLightning(chid) {
  const pool = shuffle(ALL_EX.filter(e => e.type === 'tf' && (chid === 'all' || e._ch.id === chid)));
  if (!pool.length) { toast('No true/false questions here'); return go(HOME()); }
  const c0 = CH[chid], back = c0 ? `#/ch/${chid}/traps` : '#/lightning', here = location.hash;
  shellChrome({ sub: true, crumbs: c0 ? [[`${c0.emoji} ${c0.title}`, '#/ch/' + chid], [t('home.lightning')]] : [[t('home.lightning')]], back, reading: true });
  let i = 0, score = 0, end = Date.now() + 60e3, wrong = [], over = false, warned = false;
  const clock = h('div', { class: 'clock' }, '60'), stmt = h('div', { class: 'stmt' }), sc = h('div', { class: 'tiny' });
  const ans = v => { if (over) return; const ex = pool[i % pool.length]; if (v === ex.answer) { score++; beep('ok'); stmt.classList.remove('pop'); void stmt.offsetWidth; stmt.classList.add('pop'); } else { wrong.push(ex); beep('bad'); stmt.classList.remove('shake'); void stmt.offsetWidth; stmt.classList.add('shake'); } record(ex, v === ex.answer); i++; draw(); };
  const draw = () => { const ex = pool[i % pool.length]; stmt.innerHTML = ''; stmt.append(h('div', { html: fmt(ex.q) })); setAccent(stmt, ex._ch); sc.textContent = `Score: ${score}`; };
  const key = e => { if (e.key === 'ArrowLeft') ans(true); if (e.key === 'ArrowRight') ans(false); };
  document.addEventListener('keydown', key);
  view(h('div', { class: 'runner lightning' + (SHL() ? ' has-ask' : '') }, SHL() ? askBuddyBtn(() => askAIAbout(pool[i % pool.length], null)) : null, clock, stmt, h('div', { class: 'tfrow' }, h('button', { class: 'tfbtn t', onclick: () => ans(true) }, '👍 True  ←'), h('button', { class: 'tfbtn f', onclick: () => ans(false) }, '→  👎 False')), h('div', { style: { marginTop: '12px' } }, sc)));
  draw();
  const t = setInterval(() => {
    if (location.hash !== here) { clearInterval(t); document.removeEventListener('keydown', key); over = true; return; }
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); clock.textContent = left;
    if (left <= 5 && left > 0) { if (!warned) { warned = true; window.NoemaReact?.big('timer'); } else window.NoemaReact?.tick(left); }
    if (!left) {
      clearInterval(t); document.removeEventListener('keydown', key); over = true;
      addXP(score * 3, clock);
      const pb = score > (S.bestLightning || 0); if (pb) { S.bestLightning = score; save(); }
      if (!wrong.length && score >= 5 && SHL() && window.NoemaReact) window.NoemaReact.big('timerwin'); else if (score >= 8 || pb) confetti();
      beep('win');
      view(h('div', { class: 'runner' }, h('div', { class: 'card summary' }, h('div', { class: 'big' }, pb ? '🏅' : '⚡'), h('h2', {}, `${score} correct in 60 s${pb ? ' — new personal best!' : ''}`),
        wrong.length ? h('div', { style: { textAlign: 'left', marginTop: '16px', display: 'grid', gap: '10px' } }, h('b', {}, 'The ones that fooled you:'), ...wrong.map(ex => h('div', { class: 'explain bad' }, h('div', { class: 'hd' }, ex.answer ? 'TRUE' : 'FALSE'), h('div', { html: '<b>' + fmt(ex.q) + '</b>' }), h('div', { style: { marginTop: '4px' }, html: fmt(ex.explain) })))) : h('p', {}, 'Flawless! 🔥'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } }, h('button', { class: 'btn primary', onclick: () => playLightning(chid) }, '⚡ Again'), h('button', { class: 'btn', onclick: () => go(c0 ? back : HOME()) }, c0 ? SL('back') : 'Home')))));
    }
  }, 200);
}

/* ---------- flashcards (Leitner) ---------- */
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
/* one Leitner step for a card: 0 = again (back to box 1), 1 = good (+1 box), 2 = easy (+2); due counted from `from` */
function rateCardKey(key, q, from = new Date()) { const r = S.fc[key] || { box: 0 }; r.box = q === 0 ? 1 : Math.min(5, (r.box || 0) + (q === 2 ? 2 : 1)); const d = new Date(from); d.setDate(d.getDate() + BOX_DAYS[q === 0 ? 0 : r.box]); r.due = d.toISOString().slice(0, 10); S.fc[key] = r; save(); return r; }
function cardDue(key) { const r = S.fc[key]; return !r || !r.due || r.due <= today(); }
function countDueCards() { return COURSE.reduce((a, c) => a + c.flashcards.filter((f, i) => { const k = f._key || c.id + '#' + i; return S.fc[k] && cardDue(k); }).length, 0); }
function allCards() { return COURSE.flatMap(c => c.flashcards.map((f, i) => ({ ...f, key: f._key || c.id + '#' + i, _ch: c }))); }
function cardsView() {
  setAccent(document.body, null);
  shellChrome({ sub: true, crumbs: [[t('home.cards')]], back: HOME() });
  const body = h('div');
  view(backBtn(t('nav.home'), HOME()), h('h1', {}, t('view.cards')), h('p', { class: 'muted' }, 'Leitner spaced repetition: “Again” sends a card back to box 1, “Easy” jumps it ahead.'), body);
  flashDeck(body, allCards());
}
function flashDeck(body, cards) {
  const seen = cards.filter(c => S.fc[c.key]);
  const due = cards.filter(c => S.fc[c.key] && cardDue(c.key)), fresh = cards.filter(c => !S.fc[c.key]);
  const queue = [...shuffle(due), ...shuffle(fresh).slice(0, 15)];
  body.append(h('div', { class: 'row', style: { margin: '6px 0 16px' } }, h('span', { class: 'pill c' }, `${due.length} due`), h('span', { class: 'pill' }, `${fresh.length} new`), h('span', { class: 'pill' }, `${seen.length - due.length} resting`)));
  const stage = h('div'); body.append(stage);
  let i = 0;
  function show() {
    stage.innerHTML = '';
    if (i >= queue.length) { stage.append(h('div', { class: 'empty' }, h('div', { class: 'e' }, '🌟'), h('p', {}, 'Deck done for now. Come back later for due cards!'))); if (queue.length) confetti(80); return; }
    const c = queue[i];
    const fl = h('div', { class: 'flash' }, h('div', { class: 'inner', onclick: () => fl.classList.toggle('flipped') },
      h('div', { class: 'face' }, h('small', {}, `${c._ch.emoji} Ch${c._ch.num} · ${i + 1}/${queue.length}`), h('div', { html: fmt(c.q) }), h('div', { class: 'tiny', style: { position: 'absolute', bottom: '14px' } }, 'tap to flip')),
      h('div', { class: 'face back' }, h('small', {}, 'answer'), h('div', { html: fmt(c.a) }))));
    setAccent(fl, c._ch);
    if (SHL()) { fl.classList.add('has-ask'); fl.append(askBuddyBtn(() => askAboutCard(c, fl.classList.contains('flipped')))); }
    const rate = q => { rateCardKey(c.key, q); addXP(q === 0 ? 1 : 2, fl); if (q === 0) queue.push(c); i++; show(); };
    stage.append(fl, h('div', { class: 'rate' }, h('button', { class: 'btn', onclick: () => rate(0) }, '😵 Again'), h('button', { class: 'btn', onclick: () => rate(1) }, '🙂 Good'), h('button', { class: 'btn primary', onclick: () => rate(2) }, '😎 Easy')),
      c.section && SEC[c.section] ? h('div', { style: { textAlign: 'center', marginTop: '10px' } }, h('button', { class: 'tiny', style: { textDecoration: 'underline' }, onclick: () => go('#/s/' + c.section) }, 'open the section')) : null);
  }
  show();
}

/** Ask the character about a flashcard: a hint while its answer is hidden, a deeper explanation once it is turned. */
function askAboutCard(c, turned) {
  const ctx = { kind: 'exercise', id: 'fc:' + c.key, text: `Flashcard (chapter ${c._ch.num} “${c._ch.title}”)\nFront: ${c.q}\nBack: ${c.a}` };
  if (turned) openTutor(ctx, 'explain', 'Explain this flashcard to me in more depth, with an example.');
  else openTutor(ctx, 'hint', 'Give me a hint for this flashcard — don\'t tell me the answer.', { intent: INTENT.exHint('') });
}

/* ---------- debug drills ---------- */
function countDuePlaybooks() { return Object.values(PB).filter(d => S.pb[d.id] && S.pb[d.id].due <= today()).length; }
function drillTile(d) {
  const r = S.pb[d.id] || { box: 0 };
  const t = h('button', { class: 'pb', onclick: () => go('#/drill/' + d.id) }, h('span', { class: 'ic' }, '🔧'),
    h('div', { class: 'grow' }, h('b', { html: fmt(d.title) }), newPill(d), h('div', { class: 'tiny' }, `${d.askYourself.length} ask-yourself questions${d.mnemonic ? ' · has mnemonic' : ''}`)),
    h('div', { class: 'boxes', title: 'mastery' }, ...[1, 2, 3, 4, 5].map(i => h('i', { class: i <= r.box ? 'on' : '' }))));
  setAccent(t, d._ch); return t;
}
function drillList(body, list) {
  const due = list.filter(d => !S.pb[d.id] || S.pb[d.id].due <= today());
  body.append(h('p', { class: 'muted' }, 'Each drill: read the symptom → write the questions you would ask yourself → compare with the checklist → rate yourself. Repeat until it is automatic.'),
    h('div', { class: 'row', style: { marginBottom: '14px' } }, due.length ? h('button', { class: 'btn primary', onclick: () => go('#/drill/' + due[0].id) }, `▶ Next due drill (${due.length})`) : h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)' } }, 'All drills rested ✓')),
    h('div', { style: { display: 'grid', gap: '10px' } }, ...list.map(drillTile)));
}
function drillsView() {
  setAccent(document.body, null);
  shellChrome({ sub: true, crumbs: [[t('home.drills')]], back: HOME() });
  const body = h('div');
  view(backBtn(t('nav.home'), HOME()), h('h1', {}, t('view.drills')),
    h('p', { class: 'muted' }, `${Object.keys(PB).length} debugging playbooks. The goal: the right questions pop into your head automatically when something breaks.`), body);
  COURSE.forEach(c => { if (!c.debug.length) return; const sub = h('div', { style: { margin: '22px 0 0' } }); body.append(h('h3', { style: { margin: '20px 0 10px' } }, `${c.emoji} Ch${c.num} · ${c.title}`), sub); sub.append(...c.debug.map(drillTile)); });
}
function drillView(id) {
  const d = PB[id]; if (!d) return go('#/drills');
  const c = d._ch; setAccent(document.body, c);
  setTutorContext({ kind: 'playbook', id });
  shellChrome({ sub: true, crumbs: [[`${c.emoji} ${c.title}`, '#/ch/' + c.id], [t('home.drills'), `#/ch/${c.id}/debug`]], back: `#/ch/${c.id}/debug`, reading: true });
  const ta = h('textarea', { class: 'answer', placeholder: 'One question per line, in the order you would ask them…' });
  const stage = h('div');
  view(h('div', { class: 'reader' },
    backBtn(`← ${c.emoji} Ch${c.num} debug drills`, `#/ch/${c.id}/debug`),
    h('span', { class: 'pill c' }, '🔧 Debug drill'), h('h1', { style: { margin: '10px 0 14px' }, html: fmt(d.title) }),
    h('div', { class: 'tiny', style: { fontWeight: 700, marginBottom: '6px' } }, 'SYMPTOM'), h('div', { class: 'symptom', html: fmt(d.symptom) }),
    h('h3', { style: { margin: '22px 0 8px' } }, '🧠 What do you ask yourself? (before peeking)'), ta,
    h('div', { class: 'actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      h('button', { class: 'btn primary', onclick: () => reveal(null) }, '👀 Reveal checklist'),
      h('button', { class: 'btn ai', onclick: async e => { if (!ta.value.trim()) { ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 500); return; } const b = e.currentTarget; b.disabled = true; b.textContent = '✨ Grading…'; try { const g = await aiDrillGrade(d, ta.value); reveal(g); } catch (er) { toast('⚠️ ' + er.message, 4000); reveal(null); } } }, '✨ Grade my checklist'),
      h('button', { class: 'btn', onclick: () => orderDrill() }, '🔢 Order drill'),
      h('button', { class: 'btn', onclick: () => openTutor({ kind: 'playbook', id }, 'debug', `Run a debugging simulation based on this playbook: "${d.title}". Give me only the symptom and let me investigate.`, { intent: INTENT.pbRoleplay }) }, `🎭 Role-play it with ${TUTOR.name}`)),
    stage));
  function orderDrill() {
    stage.innerHTML = '';
    const ex = { id: d.id + '-ord', type: 'order', q: 'Put your ask-yourself questions in the best order:', items: d.askYourself.slice(0, 9), explain: 'Ordering matters: cheap, high-signal checks first (identity, location, history) before expensive or invasive actions.', difficulty: 2, tags: ['debug'], _ch: c, _ai: true, section: d.section };
    stage.append(h('div', { style: { marginTop: '18px' } }, exerciseCard(ex, { noXP: false })));
  }
  function reveal(g) {
    stage.innerHTML = '';
    const hit = new Set(g?.hit || []);
    const checks = d.askYourself.map((q, i) => h('input', { type: 'checkbox', checked: hit.has(i) }));
    if (g) stage.append(h('div', { class: 'fb ai' }, h('div', { class: 'row' }, h('span', { class: 'score', style: { background: g.score >= 70 ? 'var(--ok)' : g.score >= 45 ? 'var(--warn)' : 'var(--bad)' } }, g.score | 0), h('div', { class: 'grow' }, md(g.feedback)))));
    stage.append(
      h('div', { class: 'ask', style: { marginTop: '18px' } }, h('div', { class: 'hd' }, '🧠 The checklist', h('span', { class: 'tiny', style: { marginLeft: 'auto' } }, 'tick the ones you had')),
        h('div', { class: 'rubric' }, ...d.askYourself.map((q, i) => h('label', {}, checks[i], h('span', {}, h('b', {}, (i + 1) + '. '), F(q)))))),
      d.mnemonic ? h('div', { style: { marginTop: '14px' } }, h('div', { class: 'tiny', style: { fontWeight: 700 } }, 'MEMORY HOOK'), h('div', { class: 'mnemo', html: fmt(d.mnemonic) })) : null,
      h('h3', { style: { margin: '22px 0 10px' } }, '🛠️ Steps'), h('div', { class: 'steps' }, ...d.steps.map((s, i) => h('div', { class: 'stepc' }, h('b', { html: `${i + 1}. ` + fmt(s.do) }), s.why ? h('div', { class: 'tiny', style: { color: 'var(--ink2)', fontSize: '14px' }, html: '↳ ' + fmt(s.why) }) : null, s.code ? h('div', { style: { marginTop: '8px' } }, codeBlock(s.code, guessLang(s.code))) : null))),
      h('h3', { style: { margin: '22px 0 10px' } }, '🎯 Usual root causes'), h('ul', {}, ...d.rootCauses.map(r => h('li', { html: fmt(r) }))),
      h('div', { class: 'callout tip', style: { marginTop: '12px' } }, h('span', { class: 'ci' }, '✅'), h('b', { class: 't' }, 'Fix'), h('div', { html: fmt(d.fix) })),
      h('h3', { style: { margin: '24px 0 10px' } }, 'How well did you recall it?'),
      h('div', { class: 'row' }, ...[['😵 Blank', 0], ['🤔 Partly', 1], ['😎 Nailed it', 2]].map(([l, q]) => h('button', { class: 'btn' + (q === 2 ? ' primary' : ''), onclick: () => {
        const r = S.pb[d.id] || { box: 0 };
        const ticked = checks.filter(x => x.checked).length / checks.length;
        r.box = q === 0 ? 1 : Math.min(5, r.box + (q === 2 && ticked >= .7 ? 2 : 1));
        const dt = new Date(); dt.setDate(dt.getDate() + BOX_DAYS[q === 0 ? 0 : r.box]); r.due = dt.toISOString().slice(0, 10);
        S.pb[d.id] = r; save(); addXP(3 + Math.round(ticked * 7), stage);
        if (q === 2) confetti(70);
        const all = Object.values(PB).filter(x => x.id !== d.id && (!S.pb[x.id] || S.pb[x.id].due <= today()));
        const nxt = all.find(x => x._ch === c) || all[0];
        toast(nxt ? 'Saved ✔ — next drill loading' : 'Saved ✔');
        setTimeout(() => go(nxt ? '#/drill/' + nxt.id : `#/ch/${c.id}/debug`), 700);
      } }, l))));
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- router ---------- */
/** The subject's pages. In the shell, #/ is Today and the subject lives at #/subject; any other address is the shell's. */
function route() {
  const p = (location.hash || '#/').slice(2).split('/');
  const X = SHL();
  if (X && !X.ENGINE_ROUTES.has(p[0])) return X.route();
  closeTutorIfMobile();
  STEP_LOCK = stepLock();
  if (STEP_LOCK && LOCKED_ROUTES.has(p[0])) return lockedView();
  if (!p[0] || p[0] === 'subject') return homeView();
  if (p[0] === 'ch') return chapterView(p[1], p[2]);
  if (p[0] === 's') return sectionView(p[1]);
  if (p[0] === 'practice') return p[1] === 'all' ? mixedView() : (chTab[p[1]] = 'practice', chapterView(p[1], 'practice'));
  if (p[0] === 'run') return runView();
  if (p[0] === 'boss') return bossView(p[1]);
  if (p[0] === 'lightning') return p[1] && CH[p[1]] ? playLightning(p[1]) : lightningView();
  if (p[0] === 'cards') return cardsView();
  if (p[0] === 'drills') return drillsView();
  if (p[0] === 'drill') return drillView(p[1]);
  if (p[0] === 'mistakes') return mistakesView();
  if (p[0] === 'new') return whatsNewView();
  if (p[0] === 'ex') { const e = EX[p[1]]; return e ? startRun([e], { title: '🎯 ' + (SEC[e.section]?.title || e._ch.title), count: 1, keepOrder: true, back: '#/s/' + e.section }) : homeView(); }   // one exercise (deep links from other apps)
  homeView();
}
// tell other apps (a:caps, synced) that #/ex/<id> exists; each feature merges its own flag
{ const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { } if (!c.exerciseRoute) Noema.kv.set(k, JSON.stringify({ ...c, exerciseRoute: 1 })); }
function closeTutorIfMobile() { if (innerWidth < 720) closeTutor(); }

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'Escape') { closeTutor(); $('.modal')?.remove(); return; }
  const cards = $$('main .ex'); const card = cards.find(c => !c._locked?.()) ;
  if (!card) { if (e.key === 'Enter') { const nb = [...$$('main .btn.primary')].find(b => b.offsetParent && /Next|Finish|See result/.test(b.textContent)); nb?.click(); } return; }
  if (/^[1-6]$/.test(e.key) && card._w.keys) { card._w.keys(+e.key - 1); }
  else if (e.key === 'Enter') card._check();
});

/* ---------- boot ---------- */
function boot() {
  applyTheme();
  const X = SHL();
  if (X) document.body.append(h('div', { class: 'scrim', onclick: closeTutor }), h('aside', { class: 'drawer' }));   // the shell has the top bar, the banner and <main>
  else document.body.append(topbar(), shareBanner(), h('main'), h('div', { class: 'scrim', onclick: closeTutor }), h('aside', { class: 'drawer' }));
  renderTopStats();
  if (!X) addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => route());
  if (X) { X.attachEngine({ route, openTutor: () => openTutor(), focus: () => focusSprint(), history: () => X.convos(), resumeConvo, convoChanged,
    accView: (tab, body, close, opts) => ACC_VIEWS[tab](body, close, opts || {}), retheme: () => { renderTutorHead?.(); } });
    setTimeout(resumeConvo, 300); }
  else route();
  if (S.settings.apiKey && !S.settings.models.length) detectModels().catch(() => { });
}
