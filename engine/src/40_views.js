/* ===================== Views ===================== */
const main = () => $('main');
function view(...kids) { const m = main(); m.innerHTML = ''; const v = h('div', { class: 'view' }, ...kids); const fb = typeof filterBanner === 'function' ? filterBanner() : null; if (fb) v.prepend(fb); m.append(v); scrollTo({ top: 0 }); return v; }
const go = hash => { location.hash = hash; };

/* ---------- top bar ---------- */
let timerT = null, timerEnd = 0;
function renderTopStats() {
  const x = $('#xpchip'), s = $('#streakchip');
  if (x) x.textContent = `⭐ ${S.xp} XP`;
  if (s) s.textContent = `🔥 ${Noema.stats.streakNow()}`;
}
function topbar() {
  const timer = h('button', { class: 'chip timer hide-m', title: '15-minute focus sprint', onclick: () => {
    if (timerT) { clearInterval(timerT); timerT = null; timer.classList.remove('running'); timer.textContent = '⏱️ Focus'; return; }
    timerEnd = Date.now() + 15 * 60e3; timer.classList.add('running');
    const tick = () => { const left = Math.max(0, timerEnd - Date.now()); timer.textContent = `⏱️ ${String(left / 60e3 | 0).padStart(2, '0')}:${String((left / 1e3 | 0) % 60).padStart(2, '0')}`; if (!left) { clearInterval(timerT); timerT = null; timer.classList.remove('running'); timer.textContent = '⏱️ Focus'; confetti(120); beep('win'); toast('🎉 Sprint done! Take a 3-minute break — stretch, water, breathe.', 5000); } };
    tick(); timerT = setInterval(tick, 1000);
  } }, '⏱️ Focus');
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand', onclick: () => go('#/') }, h('div', { class: 'logo' }, '◆'), h('span', { class: 'name' }, Noema.config.appName || 'noema-lite')),
    h('button', { class: 'subjchip', title: 'Switch subject', onclick: () => Noema.openSubjectPicker() }, h('span', {}, SUBJ.emoji || '📘'), h('span', { class: 'st' }, SUBJ.title), h('span', { class: 'chev' }, '▾')),
    h('div', { class: 'spacer' }),
    Noema.node ? h('button', { class: 'chip curchip', title: 'Back to the map of this curriculum', onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, '🧭', h('span', { class: 'hide-s' }, ' Map'))
      : h('button', { class: 'chip curchip', title: 'Curricula: type a goal, get a map of steps', onclick: () => Noema.curricula() }, '🧭', h('span', { class: 'hide-s' }, ' Curricula')),
    h('button', { class: 'chip explorechip', title: 'Explore: every public subject — info, statistics, study it', onclick: () => Noema.explore() }, '🌍', h('span', { class: 'hide-s' }, ' Explore')),
    timer,
    h('span', { class: 'chip xp hide-m', id: 'xpchip' }), h('span', { class: 'chip streak hide-s', id: 'streakchip', title: 'Day streak' }),
    h('button', { class: 'iconbtn srcbtn', title: 'Sources', onclick: () => toggleSourcesDeck() }, '📚'),
    h('button', { class: 'iconbtn hide-m', title: 'Theme', onclick: () => { S.settings.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); route(); } }, '🌓'),
    bellButton(),
    h('button', { class: 'iconbtn', title: 'Settings', onclick: openSettings }, '⚙️'),
    h('button', { class: 'iconbtn tutor', title: 'Open tutor', onclick: () => openTutor() }, TUTOR.avatar, h('span', {}, 'Tutor')),
    h('button', { class: 'acchip', title: `${ACCOUNT.name} — account, backup & sync`, onclick: () => openAccountMenu() }, h('span', {}, ACCOUNT.emoji || '🙂'), h('i', { class: 'syncdot', id: 'syncdot' })));
}

/* ---------- 🔔 notifications: subjects shared with me (bell + banner) ---------- */
function bellButton() {
  const badge = h('span', { class: 'bellbadge' });
  const b = h('button', { class: 'iconbtn bell', id: 'bellbtn', title: 'Notifications', 'aria-label': 'Notifications', onclick: () => openNotes() }, '🔔', badge);
  Noema.notes.on(list => { badge.textContent = list.length || ''; badge.style.display = list.length ? '' : 'none'; b.classList.toggle('has', !!list.length); });
  return b;
}
function openNotes() {
  modal((box, close) => {
    const body = h('div');
    const draw = list => { body.innerHTML = ''; if (!list.length) body.append(h('p', { class: 'muted' }, ACCOUNT.kind === 'cloud' ? 'Nothing new. 🎈' : 'Notifications need a ☁️ cloud account (Account menu → Cloud).')); list.forEach(sh => body.append(Noema.shareRow(sh, { onAccepted: s => { close(); confirmBox(`Open “${s.title}” now?`, () => Noema.switchTo(ACCOUNT.id, s.id)); } }))); };
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
    bar.append(h('span', { class: 'grow' }, '📬 ', h('b', {}, sh.from_name || sh.from_email), ' wants to share ', h('b', {}, `“${sh.title}”`), ' with you', items.length > 1 ? h('span', { class: 'tiny' }, `  (+${items.length - 1} more in 🔔)`) : ''),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await Noema.notes.accept(sh); toast(`✅ “${s.title}” added to your subjects`); confirmBox(`Open “${s.title}” now?`, () => Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, '✓ Accept'),
      h('button', { class: 'btn small', onclick: async () => { await Noema.notes.reject(sh).catch(er => toast('⚠️ ' + er.message)); } }, '✕ Reject'),
      h('button', { class: 'btn small ghost', title: 'Decide later (it stays in 🔔)', onclick: () => { later.add(sh.id); draw(Noema.notes.pending); } }, 'Later'));
  };
  Noema.notes.on(draw);
  return bar;
}

/* ---------- home ---------- */
function ring(pct, size = 120, stroke = 12, color = 'var(--c)') {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const holder = h('div', { style: { position: 'absolute', inset: '0' }, html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" data-off="${C * (1 - Math.min(1, pct))}"/></svg>` });
  return holder;
}
function animateRings(root) { requestAnimationFrame(() => requestAnimationFrame(() => $$('circle[data-off]', root).forEach(c => c.style.strokeDashoffset = c.dataset.off))); }
/** This subject is a step of a 🧭 curriculum: where it sits, mastery so far, back to the map. */
function nodeBanner() {
  if (!Noema.node || !window.NoemaCurMap) return null;
  const info = NoemaCurMap.nodeInfo(ACCOUNT.id, Noema.node); if (!info) return null;
  const secs = COURSE.flatMap(c => c.sections.map(s => s.id)); const exN = COURSE.reduce((a, c) => a + c.exercises.length, 0);
  const read = secs.length ? secs.filter(id => S.read[id]).length / secs.length : 0, solved = exN ? Object.values(S.res).filter(r => r.ok > 0).length / exN : 0;
  const done = info.st.mastered || (read >= 0.999 && solved >= NoemaCurriculum.PASS);
  return h('div', { class: 'callout key nodebanner' }, h('span', { class: 'ci' }, '🧭'),
    h('div', { class: 'grow' }, h('b', { class: 't' }, `Step of “${info.c.title || info.c.goal}”`),
      h('div', { class: 'tiny' }, done ? '✅ Mastered — the next steps are open on the map.' : `Mastery: ${Math.round(read * 100)} % of the sections read · ${Math.round(solved * 100)} % of the exercises solved — the next steps open at 100 % read + ${Math.round(NoemaCurriculum.PASS * 100)} % solved.`),
      h('div', { class: 'nbbar' }, h('i', { style: { width: Math.round(Math.min(read, solved / NoemaCurriculum.PASS) * 100) + '%' } }))),
    h('button', { class: 'btn small', onclick: () => Noema.curriculumMap(Noema.node.id, Noema.node.node) }, '🗺️ Map'));
}
function homeView() {
  setTutorContext(null);
  setAccent(document.body, null);
  const xpToday = Noema.stats.todayXP();
  const goal = h('div', { class: 'goalring' }, ring(xpToday / S.settings.goal, 120, 12, '#ff922b'), h('div', { class: 'lbl' }, h('b', {}, xpToday), h('small', { class: 'tiny' }, `/ ${S.settings.goal} XP today`)));
  const dueFc = countDueCards(), duePb = countDuePlaybooks(), wrong = mistakesList().length;
  const results = h('div', { class: 'results' });
  const search = h('div', { class: 'search' }, h('span', { class: 'si' }, '🔎'), h('input', { placeholder: `Jump to any concept…${SUBJ.searchExamples ? ' (e.g. ' + SUBJ.searchExamples + ')' : ''}`, oninput: e => doSearch(e.target.value, results) }));
  const last = S.last && SEC[S.last];
  const v = view(
    setupBanner(), nodeBanner(),
    h('section', { class: 'hero' },
      h('div', {},
        h('h1', { class: 'herohead', html: fmt(SUBJ.hero?.headline || `Master **${SUBJ.title}**, one bite at a time.`) }),
        SUBJ.hero?.mantra || SUBJ.description ? h('p', { class: 'mantra', html: fmt(SUBJ.hero?.mantra || SUBJ.description) }) : null,
        last ? h('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: () => go(`#/s/${last.id}`) }, `▶ Continue: ${last.title}`) : h('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: () => go('#/s/' + COURSE[0].sections[0].id) }, '▶ Start chapter 1'),
        whatsNewButton()),
      goal),
    search, results,
    h('div', { class: 'modes' },
      modeTile('⚡', 'Lightning round', '60 seconds of true/false traps', '#/lightning'),
      modeTile('🔧', 'Debug drills', 'Memorize the “ask yourself” checklists', '#/drills', duePb ? `${duePb} due` : null),
      modeTile('🃏', 'Flashcards', 'Spaced-repetition recall', '#/cards', dueFc ? `${dueFc} due` : null),
      modeTile('🔁', 'Mistakes gym', 'Retry what you got wrong', '#/mistakes', wrong ? `${wrong}` : null),
      modeTile('🎲', 'Mixed practice', 'Random exercises from everything you read', '#/practice/all'),
      modeTile(TUTOR.avatar, 'Socratic tutor', 'Gemini questions you until it clicks', null, null, () => openTutor(null, 'socratic', null, { intent: INTENT.course }))),
    h('div', { class: 'row', style: { marginBottom: '14px' } }, h('h2', {}, 'Chapters'), h('span', { class: 'tiny' }, `${COURSE.length} chapters · ${COURSE.reduce((a, c) => a + c.sections.length, 0)} sections · ${ALL_EX.length} exercises`)),
    h('div', { class: 'chapters' }, ...COURSE.map((c, i) => {
      const p = chProgress(c);
      const card = h('button', { class: 'chcard', style: { animationDelay: i * 40 + 'ms' }, onclick: () => go('#/ch/' + c.id) },
        newBadge(c), h('div', { class: 'emo' }, c.emoji), h('div', { class: 'num' }, `Chapter ${c.num}${S.boss[c.id] ? ' · 🏆' : ''}`), h('h3', {}, c.title), h('p', {}, c.subtitle),
        h('div', { class: 'bars' },
          h('div', { class: 'barlbl' }, h('span', {}, '📖 Theory'), h('span', {}, Math.round(p.sr * 100) + '%')), h('div', { class: 'bar' }, h('i', { style: { width: '0%' }, 'data-w': p.sr * 100 + '%' })),
          h('div', { class: 'barlbl' }, h('span', {}, '🎯 Practice'), h('span', {}, Math.round(p.ex * 100) + '%')), h('div', { class: 'bar alt' }, h('i', { style: { width: '0%' }, 'data-w': p.ex * 100 + '%' }))));
      setAccent(card, c); return card;
    })));
  animateRings(v); requestAnimationFrame(() => requestAnimationFrame(() => $$('.bar>i[data-w]').forEach(i => i.style.width = i.dataset.w)));
}
function modeTile(ic, title, sub, hash, badge, fn) {
  return h('button', { class: 'mode', onclick: fn || (() => go(hash)) }, badge ? h('span', { class: 'pill badge', style: { background: '#ffe3d3', color: '#e8590c' } }, badge) : null, h('span', { class: 'ic' }, ic), h('b', {}, title), h('small', {}, sub));
}
let searchIdx = null;
function doSearch(q, box) {
  box.innerHTML = '';
  q = q.trim().toLowerCase(); if (q.length < 2) return;
  if (!searchIdx) searchIdx = Object.values(SEC).map(s => ({ s, title: s.title.toLowerCase(), body: sectionText(s).toLowerCase() }));
  const words = q.split(/\s+/);
  const res = searchIdx.map(x => { let sc = 0; for (const w of words) { if (x.title.includes(w)) sc += 10; const c = x.body.split(w).length - 1; if (!c) return null; sc += Math.min(c, 8); } return { ...x, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 7);
  if (!res.length) { box.append(h('div', { class: 'tiny' }, `No match — try a different word, or ask ${TN} ${TUTOR.avatar}`)); return; }
  res.forEach((r, i) => {
    const pos = r.body.indexOf(words[0]);
    const snip = sectionText(r.s).slice(Math.max(0, pos - 50), pos + 90).replace(/\s+/g, ' ');
    const b = h('button', { class: 'result', style: { animationDelay: i * 30 + 'ms' }, onclick: () => go('#/s/' + r.s.id) }, h('b', {}, `${r.s._ch.emoji} ${r.s.title}`), h('small', {}, `Ch${r.s._ch.num} · …${snip}…`));
    box.append(b);
  });
}

/* ---------- chapter ---------- */
let chTab = {};
function chapterView(id, tab) {
  const c = CH[id]; if (!c) return go('#/');
  setAccent(document.body, c);
  setTutorContext({ kind: 'chapter', id });
  tab = tab || chTab[id] || 'learn'; chTab[id] = tab;
  const p = chProgress(c);
  const tabs = [['learn', '📖 Learn', c.sections.length], ['practice', '🎯 Practice', c.exercises.length], ['debug', '🔧 Debug drills', c.debug.length], ['cards', '🃏 Cards', c.flashcards.length], ['traps', '⚠️ Traps', c.pitfalls.length]];
  const body = h('div');
  const v = view(
    h('button', { class: 'back', onclick: () => go('#/') }, '← All chapters'),
    h('div', { class: 'chhead' }, h('div', { class: 'emo' }, c.emoji),
      h('div', { class: 'grow' }, h('div', { class: 'num' }, `Chapter ${c.num}`), h('h1', {}, c.title), c.subtitle ? h('p', { class: 'muted', style: { margin: '6px 0 0' } }, c.subtitle) : null, sourceChips(FULL_COURSE.find(x => x.id === c.id) || c)),
      h('div', { style: { position: 'relative', width: '76px', height: '76px', flex: 'none' } }, ring((p.sr + p.ex) / 2, 76, 9), h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800 } }, Math.round((p.sr + p.ex) * 50) + '%'))),
    explainable(h('div', { class: 'mantrabox' }, h('span', {}, '🧭'), F(c.mantra)), () => ({ label: c.mantra, text: `The mental model of chapter ${c.num} "${c.title}": ${c.mantra}`, ch: c, what: 'mental model' })),
    h('div', { class: 'tabs' }, ...tabs.map(([k, l, n]) => h('button', { class: tab === k ? 'on' : '', onclick: () => go(`#/ch/${id}/${k}`) }, l, h('span', { class: 'n' }, n)))),
    body);
  animateRings(v);
  if (tab === 'learn') {
    body.append(
      h('details', { class: 'obj' }, h('summary', {}, '🎯 What you will be able to do ▸'), h('ul', {}, ...c.objectives.map(o => h('li', { html: fmt(o) })))),
      h('div', { class: 'path' }, ...c.sections.map((s, i) => {
        const nEx = c.exercises.filter(e => e.section === s.id), nOk = nEx.filter(e => solved(e.id)).length;
        return h('button', { class: 'node' + (S.read[s.id] ? ' done' : ''), style: { animationDelay: i * 35 + 'ms' }, onclick: () => go('#/s/' + s.id) },
          h('div', { class: 'dot' }, S.read[s.id] ? '✓' : i + 1), h('div', { class: 'grow' }, h('b', {}, s.title), h('small', {}, s.hook || '')),
          h('div', { class: 'meta' }, newBadge(s), h('span', { class: 'pill' + (nOk === nEx.length && nEx.length ? ' c' : '') }, `🎯 ${nOk}/${nEx.length}`)));
      })),
      h('div', { class: 'row', style: { marginTop: '22px' } },
        h('button', { class: 'btn primary', onclick: () => go(`#/practice/${id}`) }, '🎯 Practice this chapter'),
        h('button', { class: 'btn', onclick: () => go(`#/boss/${id}`) }, S.boss[id] ? '🏆 Boss battle (beaten!)' : '👾 Boss battle'),
        h('button', { class: 'btn ai', onclick: () => openTutor({ kind: 'chapter', id }, 'socratic', null, { intent: INTENT.chSocratic }) }, `${TUTOR.avatar} Socratic review`)));
  } else if (tab === 'practice') practiceSetup(body, c);
  else if (tab === 'debug') drillList(body, c.debug);
  else if (tab === 'cards') flashDeck(body, c.flashcards.map((f, i) => ({ ...f, key: f._key || c.id + '#' + i, _ch: c })));
  else if (tab === 'traps') {
    body.append(h('p', { class: 'muted' }, 'Every trap in this chapter, side by side. Read them, then hit the trap drill.'),
      h('div', { class: 'row', style: { marginBottom: '14px' } }, h('button', { class: 'btn primary', onclick: () => startRun(c.exercises.filter(e => e.tags.some(t => ['pitfall', 'exam'].includes(t))), { title: `⚠️ Trap drill · Ch${c.num}`, count: 12, back: `#/ch/${id}/traps` }) }, '⚠️ Start trap drill')),
      h('div', { style: { display: 'grid', gap: '10px' } }, ...c.pitfalls.map((p, i) => explainable(h('div', { class: 'callout pitfall', style: { animation: `slideIn .4s ${i * 30}ms both` } }, h('span', { class: 'ci' }, '⚠️'), h('b', { class: 't', html: fmt(p.title) }), h('div', { html: fmt(p.text) }), p.fix ? h('div', { style: { marginTop: '6px' }, html: '✅ <b>Fix:</b> ' + fmt(p.fix) }) : null), () => ({ label: p.title, text: `${p.title}: ${p.text}${p.fix ? ' — Fix: ' + p.fix : ''}`, ch: c, what: 'trap' })))));
  }
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
function sectionView(sid) {
  const s = SEC[sid]; if (!s) return go('#/');
  const c = s._ch; setAccent(document.body, c);
  S.last = sid; save();
  setTutorContext({ kind: 'section', id: sid });
  const chunks = S.settings.chunk ? chunkBlocks(s.blocks) : [s.blocks];
  let shown = revealedChunks[sid] || (S.read[sid] ? chunks.length : 1);
  const prev = c.sections[s._j - 1], next = c.sections[s._j + 1];
  const body = h('div');
  const pl = h('div', { class: 'progressline' }, h('i', { style: { width: '0%' } }));
  const tail = h('div');
  const v = view(h('div', { class: 'reader' },
    h('button', { class: 'back', onclick: () => go('#/ch/' + c.id) }, `← ${c.emoji} Ch${c.num} · ${c.title}`),
    pl,
    explainable(h('div', { class: 'sechead' }, h('div', { class: 'row' }, h('span', { class: 'pill c' }, `Section ${s._j + 1} / ${c.sections.length}`), S.read[sid] ? h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)' } }, '✓ read') : null),
      h('h1', { style: { marginTop: '10px' } }, s.title), s.hook ? h('p', { class: 'hook', html: fmt(s.hook) }) : null), () => ({ label: s.title, text: `The whole section "${s.title}" — ${s.hook || ''} (give me the big picture of this section)`, sec: s, what: 'section' })),
    body, tail));
  function draw(scroll) {
    body.innerHTML = '';
    chunks.slice(0, shown).forEach((ch, ci) => ch.forEach((b, i) => { const el = renderBlock(b, ci === shown - 1 ? i : 0); markNewBlock(el, b, c); explainParts(el, b, s); body.append(el); }));
    pl.firstChild.style.width = (shown / chunks.length * 100) + '%';
    tail.innerHTML = '';
    if (shown < chunks.length) {
      tail.append(h('div', { class: 'continue' }, h('div', { class: 'row' },
        h('button', { class: 'btn primary', style: { animation: 'pulse 2s infinite' }, onclick: () => { shown++; revealedChunks[sid] = shown; draw(true); } }, `Continue ▾  (${shown}/${chunks.length})`),
        h('button', { class: 'btn ghost small', onclick: () => { shown = chunks.length; revealedChunks[sid] = shown; draw(); } }, 'show all'))));
      if (scroll) { const els = $$('.blk', body); const first = els[els.length - chunks[shown - 1].length]; first?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else {
      if (!S.read[sid]) { S.read[sid] = true; save(); addXP(5, pl); }
      tail.append(sectionTail(s, prev, next));
      if (scroll) { const els = $$('.blk', body); const first = els[els.length - chunks[shown - 1].length]; first?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  }
  draw();
}
function sectionTail(s, prev, next) {
  const c = s._ch;
  const exs = c.exercises.filter(e => e.section === s.id);
  const quick = exs.filter(e => e.quick);
  const pbs = c.debug.filter(d => d.section === s.id);
  const zone = h('div', { class: 'quickzone' });
  zone.append(h('div', { class: 'row', style: { margin: '6px 0 18px' } },
    h('button', { class: 'btn ai', onclick: () => openTutor({ kind: 'section', id: s.id }, 'socratic', `Start a Socratic session on "${s.title}". Begin by probing what I already think.`, { intent: INTENT.secSocratic }) }, `${TUTOR.avatar} Socratic dialogue on this`),
    h('button', { class: 'btn', onclick: () => openTutor({ kind: 'section', id: s.id }, 'debug', `Start a debugging simulation related to "${s.title}".`, { intent: INTENT.secDebug }) }, '🔧 Debug simulation'),
    h('button', { class: 'btn', onclick: () => openTutor({ kind: 'section', id: s.id }, 'interview', `Interview me about "${s.title}".`, { intent: INTENT.secInterview }) }, '🎤 Interview me')));
  if (quick.length) {
    zone.append(h('h3', {}, '⚡ Quick check', h('span', { class: 'tiny' }, `${quick.length} right here, right now`)));
    quick.forEach(e => zone.append(exerciseCard(e)));
  }
  if (pbs.length) {
    zone.append(h('h3', { style: { margin: '22px 0 10px' } }, '🔧 Debug drill for this section'));
    pbs.forEach(d => zone.append(drillTile(d)));
  }
  zone.append(h('div', { class: 'row', style: { marginTop: '18px' } },
    h('button', { class: 'btn primary', onclick: () => startRun(exs, { title: `🎯 ${s.title}`, count: exs.length, back: '#/s/' + s.id }) }, `🎯 All ${exs.length} exercises for this section`),
    h('button', { class: 'btn ai', onclick: async e => { const b = e.currentTarget; b.disabled = true; b.textContent = '✨ Generating…'; try { const ex = await aiQuestion(s); b.after(exerciseCard(ex)); } catch (er) { toast('⚠️ ' + er.message, 4000); } b.disabled = false; b.textContent = '✨ Fresh AI question'; } }, '✨ Fresh AI question')));
  zone.append(h('div', { class: 'secnav' },
    prev ? h('button', { class: 'btn', onclick: () => go('#/s/' + prev.id) }, '← ' + prev.title) : h('span'),
    next ? h('button', { class: 'btn primary', onclick: () => go('#/s/' + next.id) }, next.title + ' →') : h('button', { class: 'btn primary', onclick: () => go(`#/boss/${c.id}`) }, '👾 Chapter boss battle →')));
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
  RUN = { list: (opt.keepOrder ? list : runOrder(list)).slice(0, opt.count || 10), i: 0, ok: 0, xp0: S.xp, wrong: [], title: opt.title || 'Practice', back: opt.back || '#/', lives: opt.lives || 0, boss: opt.boss || null };
  if (location.hash === '#/run') runView(); else go('#/run');
}
let RUN = null;
function runView() {
  if (!RUN) return go('#/');
  const R0 = RUN;
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
  if (R0.boss) {
    const won = R0.lives > 0 && R0.i >= R0.list.length && pct >= .7;
    if (won) { S.boss[R0.boss] = true; save(); big = '🏆'; msg = 'Boss defeated! Chapter badge unlocked.'; } else { big = '👾'; msg = 'The boss wins this time. Review the misses and come back stronger!'; }
  }
  if (pct >= .7) { confetti(); beep('win'); }
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
  const list = mistakesList();
  view(h('button', { class: 'back', onclick: () => go('#/') }, '← Home'), h('h1', {}, '🔁 Mistakes gym'),
    h('p', { class: 'muted' }, 'Everything whose last attempt was wrong. Get it right once and it leaves the gym.'),
    list.length ? h('div', {}, h('div', { class: 'row', style: { margin: '8px 0 18px' } }, h('button', { class: 'btn primary', onclick: () => startRun(list, { title: '🔁 Mistakes gym', count: 15, back: '#/mistakes' }) }, `▶ Train ${Math.min(15, list.length)} of ${list.length}`)),
      h('div', { style: { display: 'grid', gap: '8px' } }, ...COURSE.map(c => { const n = list.filter(e => e._ch === c).length; return n ? h('button', { class: 'node', onclick: () => startRun(list.filter(e => e._ch === c), { title: `🔁 Ch${c.num} mistakes`, count: n, back: '#/mistakes' }) }, h('div', { class: 'dot' }, c.emoji), h('div', { class: 'grow' }, h('b', {}, c.title)), h('span', { class: 'pill' }, n)) : null; })))
      : h('div', { class: 'empty' }, h('div', { class: 'e' }, '✨'), h('p', {}, 'No open mistakes. Go make some (that’s how learning works)!')));
}
function mixedView() {
  setAccent(document.body, null);
  const readSecs = new Set(Object.keys(S.read));
  const pool = ALL_EX.filter(e => readSecs.has(e.section));
  view(h('button', { class: 'back', onclick: () => go('#/') }, '← Home'), h('h1', {}, '🎲 Mixed practice'),
    h('p', { class: 'muted' }, 'Interleaving beats blocking: random exercises from every section you have read (or from everything).'),
    h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn primary', disabled: !pool.length, onclick: () => startRun(pool, { title: '🎲 Mixed: what I have read', count: 12, back: '#/practice/all' }) }, `▶ From what I've read (${pool.length})`),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX, { title: '🎲 Mixed: everything', count: 12, back: '#/practice/all' }) }, `▶ From everything (${ALL_EX.length})`),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX.filter(e => e.tags.includes('debug')), { title: '🔧 Debugging only', count: 12, back: '#/practice/all' }) }, '🔧 Debugging only'),
      h('button', { class: 'btn', onclick: () => startRun(ALL_EX.filter(e => e.tags.includes('exam')), { title: '🎓 Exam traps only', count: 12, back: '#/practice/all' }) }, '🎓 Exam traps only')));
}
function bossView(id) {
  const c = CH[id]; if (!c) return go('#/');
  setAccent(document.body, c);
  view(h('button', { class: 'back', onclick: () => go('#/ch/' + id) }, `← ${c.title}`),
    h('div', { class: 'card summary' }, h('div', { class: 'big' }, '👾'), h('h1', {}, `Boss battle · Ch${c.num}`),
      h('p', { class: 'muted' }, '15 mixed questions, mostly medium/hard. You have 3 lives ❤️❤️❤️. Lose them all and the boss wins. Score ≥ 70% with lives left to earn the 🏆.'),
      h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: () => {
        const pool = c.exercises.filter(e => e.type !== 'free');
        const hard = shuffle(pool.filter(e => e.difficulty >= 2)), easy = shuffle(pool.filter(e => e.difficulty < 2));
        const pick = [...hard.slice(0, 12), ...easy.slice(0, 3)];
        startRun(shuffle(pick).slice(0, 15), { title: `👾 Boss · Ch${c.num}`, count: 15, back: '#/ch/' + id, lives: 3, boss: id, keepOrder: true });
      } }, '⚔️ Fight!')));
}

/* ---------- lightning ---------- */
function lightningView() {
  setAccent(document.body, null);
  const chSel = h('select', { class: 'sel' }, h('option', { value: 'all' }, 'All chapters'), ...COURSE.map(c => h('option', { value: c.id }, `${c.emoji} Ch${c.num} ${c.title}`)));
  const best = S.bestLightning || 0;
  view(h('button', { class: 'back', onclick: () => go('#/') }, '← Home'),
    h('div', { class: 'card lightning' }, h('div', { style: { fontSize: '56px' } }, '⚡'), h('h1', {}, 'Lightning round'),
      h('p', { class: 'muted' }, '60 seconds. True or false. Use ← / → or the buttons. Wrong answers are explained at the end.'),
      h('div', { class: 'row', style: { justifyContent: 'center', margin: '14px 0' } }, chSel), h('p', { class: 'tiny' }, `Personal best: ${best}`),
      h('button', { class: 'btn primary', onclick: () => playLightning(chSel.value) }, '▶ Go!')));
}
function playLightning(chid) {
  const pool = shuffle(ALL_EX.filter(e => e.type === 'tf' && (chid === 'all' || e._ch.id === chid)));
  let i = 0, score = 0, end = Date.now() + 60e3, wrong = [], over = false;
  const clock = h('div', { class: 'clock' }, '60'), stmt = h('div', { class: 'stmt' }), sc = h('div', { class: 'tiny' });
  const ans = v => { if (over) return; const ex = pool[i % pool.length]; if (v === ex.answer) { score++; beep('ok'); stmt.classList.remove('pop'); void stmt.offsetWidth; stmt.classList.add('pop'); } else { wrong.push(ex); beep('bad'); stmt.classList.remove('shake'); void stmt.offsetWidth; stmt.classList.add('shake'); } record(ex, v === ex.answer); i++; draw(); };
  const draw = () => { const ex = pool[i % pool.length]; stmt.innerHTML = ''; stmt.append(h('div', { html: fmt(ex.q) })); setAccent(stmt, ex._ch); sc.textContent = `Score: ${score}`; };
  const key = e => { if (e.key === 'ArrowLeft') ans(true); if (e.key === 'ArrowRight') ans(false); };
  document.addEventListener('keydown', key);
  view(h('div', { class: 'runner lightning' }, clock, stmt, h('div', { class: 'tfrow' }, h('button', { class: 'tfbtn t', onclick: () => ans(true) }, '👍 True  ←'), h('button', { class: 'tfbtn f', onclick: () => ans(false) }, '→  👎 False')), h('div', { style: { marginTop: '12px' } }, sc)));
  draw();
  const t = setInterval(() => {
    if (location.hash !== '#/lightning') { clearInterval(t); document.removeEventListener('keydown', key); over = true; return; }
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); clock.textContent = left;
    if (!left) {
      clearInterval(t); document.removeEventListener('keydown', key); over = true;
      addXP(score * 3, clock);
      const pb = score > (S.bestLightning || 0); if (pb) { S.bestLightning = score; save(); }
      if (score >= 8 || pb) confetti();
      beep('win');
      view(h('div', { class: 'runner' }, h('div', { class: 'card summary' }, h('div', { class: 'big' }, pb ? '🏅' : '⚡'), h('h2', {}, `${score} correct in 60 s${pb ? ' — new personal best!' : ''}`),
        wrong.length ? h('div', { style: { textAlign: 'left', marginTop: '16px', display: 'grid', gap: '10px' } }, h('b', {}, 'The ones that fooled you:'), ...wrong.map(ex => h('div', { class: 'explain bad' }, h('div', { class: 'hd' }, ex.answer ? 'TRUE' : 'FALSE'), h('div', { html: '<b>' + fmt(ex.q) + '</b>' }), h('div', { style: { marginTop: '4px' }, html: fmt(ex.explain) })))) : h('p', {}, 'Flawless! 🔥'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } }, h('button', { class: 'btn primary', onclick: () => playLightning(chid) }, '⚡ Again'), h('button', { class: 'btn', onclick: () => go('#/') }, 'Home')))));
    }
  }, 200);
}

/* ---------- flashcards (Leitner) ---------- */
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
function cardDue(key) { const r = S.fc[key]; return !r || !r.due || r.due <= today(); }
function countDueCards() { return COURSE.reduce((a, c) => a + c.flashcards.filter((f, i) => { const k = f._key || c.id + '#' + i; return S.fc[k] && cardDue(k); }).length, 0); }
function allCards() { return COURSE.flatMap(c => c.flashcards.map((f, i) => ({ ...f, key: f._key || c.id + '#' + i, _ch: c }))); }
function cardsView() {
  setAccent(document.body, null);
  const body = h('div');
  view(h('button', { class: 'back', onclick: () => go('#/') }, '← Home'), h('h1', {}, '🃏 Flashcards'), h('p', { class: 'muted' }, 'Leitner spaced repetition: “Again” sends a card back to box 1, “Easy” jumps it ahead.'), body);
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
    const rate = q => { const r = S.fc[c.key] || { box: 0 }; r.box = q === 0 ? 1 : Math.min(5, (r.box || 0) + (q === 2 ? 2 : 1)); const d = new Date(); d.setDate(d.getDate() + BOX_DAYS[q === 0 ? 0 : r.box]); r.due = d.toISOString().slice(0, 10); S.fc[c.key] = r; save(); addXP(q === 0 ? 1 : 2, fl); if (q === 0) queue.push(c); i++; show(); };
    stage.append(fl, h('div', { class: 'rate' }, h('button', { class: 'btn', onclick: () => rate(0) }, '😵 Again'), h('button', { class: 'btn', onclick: () => rate(1) }, '🙂 Good'), h('button', { class: 'btn primary', onclick: () => rate(2) }, '😎 Easy')),
      c.section && SEC[c.section] ? h('div', { style: { textAlign: 'center', marginTop: '10px' } }, h('button', { class: 'tiny', style: { textDecoration: 'underline' }, onclick: () => go('#/s/' + c.section) }, 'open the section')) : null);
  }
  show();
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
  const body = h('div');
  view(h('button', { class: 'back', onclick: () => go('#/') }, '← Home'), h('h1', {}, '🔧 Debug drills'),
    h('p', { class: 'muted' }, `${Object.keys(PB).length} debugging playbooks. The goal: the right questions pop into your head automatically when something breaks.`), body);
  COURSE.forEach(c => { if (!c.debug.length) return; const sub = h('div', { style: { margin: '22px 0 0' } }); body.append(h('h3', { style: { margin: '20px 0 10px' } }, `${c.emoji} Ch${c.num} · ${c.title}`), sub); sub.append(...c.debug.map(drillTile)); });
}
function drillView(id) {
  const d = PB[id]; if (!d) return go('#/drills');
  const c = d._ch; setAccent(document.body, c);
  setTutorContext({ kind: 'playbook', id });
  const ta = h('textarea', { class: 'answer', placeholder: 'One question per line, in the order you would ask them…' });
  const stage = h('div');
  view(h('div', { class: 'reader' },
    h('button', { class: 'back', onclick: () => go(`#/ch/${c.id}/debug`) }, `← ${c.emoji} Ch${c.num} debug drills`),
    h('span', { class: 'pill c' }, '🔧 Debug drill'), h('h1', { style: { margin: '10px 0 14px' }, html: fmt(d.title) }),
    h('div', { class: 'tiny', style: { fontWeight: 700, marginBottom: '6px' } }, 'SYMPTOM'), h('div', { class: 'symptom', html: fmt(d.symptom) }),
    h('h3', { style: { margin: '22px 0 8px' } }, '🧠 What do you ask yourself? (before peeking)'), ta,
    h('div', { class: 'actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      h('button', { class: 'btn primary', onclick: () => reveal(null) }, '👀 Reveal checklist'),
      h('button', { class: 'btn ai', onclick: async e => { if (!ta.value.trim()) { ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 500); return; } const b = e.currentTarget; b.disabled = true; b.textContent = '✨ Grading…'; try { const g = await aiDrillGrade(d, ta.value); reveal(g); } catch (er) { toast('⚠️ ' + er.message, 4000); reveal(null); } } }, '✨ Grade my checklist'),
      h('button', { class: 'btn', onclick: () => orderDrill() }, '🔢 Order drill'),
      h('button', { class: 'btn', onclick: () => openTutor({ kind: 'playbook', id }, 'debug', `Run a debugging simulation based on this playbook: "${d.title}". Give me only the symptom and let me investigate.`, { intent: INTENT.pbRoleplay }) }, '🎭 Role-play it with Brick')),
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
function route() {
  const p = (location.hash || '#/').slice(2).split('/');
  closeTutorIfMobile();
  if (!p[0]) return homeView();
  if (p[0] === 'ch') return chapterView(p[1], p[2]);
  if (p[0] === 's') return sectionView(p[1]);
  if (p[0] === 'practice') return p[1] === 'all' ? mixedView() : (chTab[p[1]] = 'practice', chapterView(p[1], 'practice'));
  if (p[0] === 'run') return runView();
  if (p[0] === 'boss') return bossView(p[1]);
  if (p[0] === 'lightning') return lightningView();
  if (p[0] === 'cards') return cardsView();
  if (p[0] === 'drills') return drillsView();
  if (p[0] === 'drill') return drillView(p[1]);
  if (p[0] === 'mistakes') return mistakesView();
  if (p[0] === 'new') return whatsNewView();
  homeView();
}
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
  document.body.append(topbar(), shareBanner(), h('main'), h('div', { class: 'scrim', onclick: closeTutor }), h('aside', { class: 'drawer' }));
  renderTopStats();
  addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => route());
  route();
  if (S.settings.apiKey && !S.settings.models.length) detectModels().catch(() => { });
}
