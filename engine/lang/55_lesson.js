/* ---------- the foundations: lessons that teach words, grammar and sentences together, every language at the same step (§6.7, D9–D11) ---------- */
const stepLabel = n => n.step == null ? '' : n.stage === 'core' ? 'C' + String(n.step - 18).padStart(2, '0') : 'S' + String(n.step).padStart(2, '0');
const lessonLangs = nid => scopeLangs().filter(c => LX(c).applies[nid]);
/** Words of a lesson in one language that are still to be introduced. */
const toIntroduce = (c, nid, k) => (LX(c).byNode[nid] || []).filter(id => k.state[id] === 'ready');

/** D22: the lesson's ladder over the languages learned together (wl → wp → tr → tp): a step is done when it is done in every language. */
function ladderOf(nid, langs) {
  const per = langs.map(c => N.lessonSteps(UI.C, UI.L, c, nid));
  let open = true; const steps = N.LESSON_STEPS.map((id, i) => { const done = per.every(p => p.steps[i].done), st = { id, done, open }; open = open && done; return st; });
  const next = (steps.find(x => !x.done) || {}).id || null;
  return { steps, next, done: !next };
}
const stepTitle = id => LT('lang.step.' + id);
/** The one primary button of a lesson: Continue · <next step> (all done: review). */
const continueButton = (nid, langs, cls = 'btn primary') => { const L = ladderOf(nid, langs); return h('button', { class: cls + ' lx-continue', 'data-step': L.next || 'done', onclick: () => runLesson(nid, langs) }, '▶ ' + (L.next ? LT('lang.step.continue', { step: stepTitle(L.next) }) : LT('lang.step.review'))); };

/** The head of a lesson's page as the screen draws it (course-port.ts LessonHead). */
function lessonHead(nid) {
  const n = UI.C.nodes[nid]; if (!n || n.kind !== 'lesson') return null;
  const langs = lessonLangs(nid); if (!langs.length) return null;
  const c = langs.includes(UI.lang) ? UI.lang : langs[0];
  const st = Object.fromEntries(langs.map(x => [x, N.nodeStates(UI.C, UI.L, x)[nid]]));
  const can = langs.filter(x => ['open', 'learning', 'passed', 'known', 'mastered'].includes(st[x]));
  const L = can.length ? ladderOf(nid, can) : null, dn = deepenCount(nid, c);
  return {
    step: stepLabel(n), title: n.title, can,
    langs: langs.map(x => { const ch = UI.L.langs[x]?.checks?.[nid]; return { code: x, flag: info(x).flag, state: st[x], stateLabel: STATE_LABEL[st[x]] || st[x], pct: ch ? Math.round(ch.best * 100) : null }; }),
    ladder: L ? { steps: L.steps.map(s => ({ id: s.id, done: s.done, open: s.open })), next: L.next } : null,
    deepen: dn ? { n: dn, href: `#/deepen/${encodeURIComponent(nid)}/${c}` } : null,
    translit: hasTranslit() ? { on: UI.prefs.translit !== false } : null,
    frame: !!FR.on,
  };
}
/** A lesson's page below its head (course-port.ts LessonPage; src/ui/screens/languages/lang-lesson.ts). */
function lessonPage(nid) {
  const n = UI.C.nodes[nid]; if (!n || n.kind !== 'lesson') return null;
  const langs = lessonLangs(nid); if (!langs.length) return null;
  const c = langs.includes(UI.lang) ? UI.lang : langs[0], X = LX(c), k = N.known(UI.C, UI.L, c);
  const can = langs.filter(x => ['open', 'learning', 'passed', 'known', 'mastered'].includes(N.nodeStates(UI.C, UI.L, x)[nid]));
  const theoryOpen = !can.includes(c) || ladderOf(nid, [c]).steps.find(x => x.id === 'tr').open;   // D22: the theory is read after the words
  const fns = N.lessonFunctions(UI.C, c, nid), pick = x => { UI.lang = x; UI.prefs.lang = x; save(); render(); };
  const theory = theoryOpen ? { overview: fns.includes('fn.overview') ? typologyCard() : null, cards: [...fns].sort((x, y) => aspectRank(x) - aspectRank(y)).map(f => grammarCard(c, f, { compact: true, onPick: pick })) } : null;
  // the same step in the other languages: their own extra points (D10)
  const extra = langs.filter(x => x !== c).map(x => [x, N.lessonFunctions(UI.C, x, nid).filter(f => !fns.includes(f))]).filter(([, f]) => f.length)
    .map(([x, f]) => ({ code: x, flag: info(x).flag, fns: f.map(fid => ({ id: fid, title: UI.C.functions[fid]?.title || fid })) }));
  let words = null;
  if (n.concepts.length || (X.byNode[nid] || []).length)
    words = { n: LNUM(n.concepts.length), tiles: [...n.concepts.map(cid => conceptTile(c, { cid }, k)), ...(X.byNode[nid] || []).filter(id => !(X.lex[id].senses || []).length).map(id => conceptTile(c, { lex: id }, k))] };
  return { lang: courseLang(c), rail: railModel(null, c, pick), theory, extra, words };
}
/** #/lesson/<id>: noema-lang-lesson (its head, the theory once the words are done, the other languages' points, its words). */
VIEWS.lesson = (v, r) => {
  const nid = r.arg, n = UI.C.nodes[nid]; if (!n || n.kind !== 'lesson') return VIEWS.home(v);
  const langs = lessonLangs(nid); if (!langs.length) return VIEWS.home(v);
  const c = langs.includes(UI.lang) ? UI.lang : langs[0];
  if (FR.on) {   // the frame: one primary action on the page, Deepen and Aa· wait in its ⋮
    const dn = deepenCount(nid, c);
    if (dn) FR.viewActs.push({ label: LT('lang.deep.deepenN', { n: dn }), icon: 'gym', run: () => go(`#/deepen/${encodeURIComponent(nid)}/${c}`) });
    if (hasTranslit()) { const on = UI.prefs.translit !== false; FR.viewActs.push({ label: LT(on ? 'lang.translit.hide' : 'lang.translit.show'), run: () => setTranslit(!on) }); }
  }
  v.append(screenEl('noema-lang-lesson', { node: nid }));
};


/** Run a lesson for some languages together: grammar (the first time) → a batch of words in every language → drills → the check once every word is in. */
function runLesson(nid, langs, { checkOnly = false, step = null } = {}) {
  const n = UI.C.nodes[nid], batch = UI.L.settings.batch || 12, queue = [];
  const K = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c)]));
  const lad = ladderOf(nid, langs);
  step = checkOnly ? 'tp' : step && lad.steps.find(x => x.id === step)?.open ? step : lad.next || 'tp';   // D22: only the step that is open
  if (step === 'wl') {
    // words, in a lesson form: a batch of ideas, each in every language one after the other (the "Got it" introduces them)
    const ideas = [];
    for (const cid of n.concepts) { const e = langs.flatMap(c => (LX(c).byConcept[cid] || []).filter(id => K[c].state[id] === 'ready' && LX(c).lex[id].node === nid).slice(0, 1).map(id => ({ lang: c, lex: id }))); if (e.length) ideas.push(e); }
    for (const c of langs) for (const id of toIntroduce(c, nid, K[c])) if (!(LX(c).lex[id].senses || []).length && !ideas.some(e => e.some(x => x.lang === c && x.lex === id))) ideas.push([{ lang: c, lex: id }]);
    for (const e of ideas.slice(0, batch)) for (const x of e) queue.push({ kind: 'intro', ...x });
  } else if (step === 'wp') {
    // practice of the words just met: recognising, then producing
    const todo = langs.flatMap(c => (LX(c).byNode[nid] || []).filter(id => K[c].state[id] !== 'ready' && !((UI.L.langs[c]?.items?.[id] || {}).r && (UI.L.langs[c]?.items?.[id] || {}).p)).map(id => ({ lang: c, lex: id }))).slice(0, batch * 2);
    for (const x of todo) queue.push({ kind: 'rec', ...x }); for (const x of todo) queue.push({ kind: 'prod', ...x });
  } else if (step === 'tr') {
    // theory: read the grammar of the lesson (and the typology overview), then it counts as read
    const fns = uniq(langs.flatMap(c => N.lessonFunctions(UI.C, c, nid)));
    if (fns.includes('fn.overview') && UI.C.data.typology) queue.push({ kind: 'screen', make: () => typologyCard() });
    for (const f of fns) queue.push({ kind: 'screen', fn: f, langs: langs.filter(c => N.lessonFunctions(UI.C, c, nid).includes(f)) });
    queue.push({ kind: 'mark', step: 'tr' });
  } else {
    // theory practice: drills and sentences of the lesson's grammar (made when reached), then the check
    queue.push({ kind: 'drills' }, { kind: 'check' });
  }
  if (!queue.length) queue.push({ kind: 'mark', step });
  runQueue(queue, { nid, langs, title: `${stepLabel(n)} ${n.title} · ${stepTitle(step)}`, step });
}

function runQueue(queue, { nid, langs, title, step }) {
  metNew.clear();   // the 🆕 words of this run, listed at the end (D20)
  const m = $('.lx-main'), run = screenEl('noema-lang-run', { node: nid, heading: title }), stage = run.stage;   // src/ui/screens/languages/lang-lesson.ts
  m.replaceChildren(run); run.drawNow?.();
  const bar = { set: pct => { run.pct = pct; } };
  const stats = { right: 0, wrong: 0, introduced: 0 }, results = {}, retried = new Set(); let total = queue.length, i = 0;
  const day = today();
  const nextBtn = (label = LT('lang.drill.next') + ' ' + arrowOn()) => { const b = h('button', { class: 'btn primary lx-next' }, label); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30); };
  function next() {
    bar.set(i / Math.max(total, 1) * 100);
    const a = queue.shift(); if (!a) return finish();
    i++; stage.innerHTML = '';
    if (a.kind === 'screen') {
      if (a.make) stage.append(a.make());
      else { let cur = a.langs[0] || langs[0]; const holder = h('div'); const draw = () => { holder.innerHTML = ''; holder.append(grammarCard(cur, a.fn, { compact: true, onPick: x => { cur = x; draw(); } })); }; draw(); stage.append(a.langs.length > 1 ? flagRail(null, cur, x => { cur = x; draw(); }) : null, holder); }
      return nextBtn(LT('lang.ex.gotIt') + ' ' + arrowOn());
    }
    if (a.kind === 'mark') { if (a.step === 'tr') for (const c of langs) N.recordStep(UI.C, UI.L, c, nid, 'tr', day); save(true); return next(); }
    if (a.kind === 'drills') {   // expand into exercises now that the words are known
      const items = [];
      for (const c of langs) { const k = N.known(UI.C, UI.L, c); for (const f of N.lessonFunctions(UI.C, c, nid)) if (f !== 'fn.overview') for (const it of N.exercises(UI.C, UI.L, c, f, { k, max: 4 })) items.push({ kind: 'item', it }); }
      queue.unshift(...items); total += items.length; return next();
    }
    if (a.kind === 'check') {
      const items = [];
      for (const c of langs) {
        const k = N.known(UI.C, UI.L, c); if (toIntroduce(c, nid, k).length) continue;
        const its = N.lessonCheck(UI.C, UI.L, c, nid, { k });
        if (!its.length) results[c] = { c: 1, n: 1, empty: true };   // nothing to ask in this language (no word, the grammar absent): the lesson is read, that is all
        for (const it of its) items.push({ kind: 'item', it, check: true });
      }
      if (!items.length) return finish();
      stage.append(h('div', { class: 'lx-result' }, h('h2', {}, '✔ ' + LT('lang.lesson.theCheck')), h('p', {}, LT('lang.lesson.checkIntro', { n: items.length, flags: uniq(items.map(x => x.it.lang)).map(c => info(c).flag).join(' ') }))));
      queue.unshift(...shuffle(items)); total += items.length; return nextBtn(LT('lang.lesson.start') + ' ' + arrowOn());
    }
    const done = ok => {
      if (a.kind === 'intro') { N.introduce(UI.C, UI.L, a.lang, a.lex, day); stats.introduced++; save(); return next(); }
      if (a.kind === 'item') {
        const it = a.it;
        if (a.check) { const R = results[it.lang] = results[it.lang] || { c: 0, n: 0 }; R.n++; if (ok) R.c++; }
        else if (it.fn) N.practiceFunction(UI.C, UI.L, it.lang, it.fn, ok ? 1 : 0, 1, day);
        if (it.lex && it.kind === 'word') N.review(UI.C, UI.L, it.lang, it.lex, 'r', ok ? 'good' : 'again', day);
        else if (it.deep) N.deepRecord(UI.C, UI.L, it.lang, it, ok, day, it.perLex);   // a depth item listed as a generator (P5v)
      } else N.review(UI.C, UI.L, a.lang, a.lex, a.kind === 'rec' ? 'r' : 'p', ok ? 'good' : 'again', day);
      save(); ok ? stats.right++ : stats.wrong++;
      const key = JSON.stringify([a.kind, a.lang, a.lex, a.it?.prompt]);
      if (!ok && !a.check && !retried.has(key)) { retried.add(key); queue.splice(Math.min(3, queue.length), 0, { ...a, retry: true }); total++; }
      nextBtn();
    };
    UI.current = a;   // what is on screen (tests, the tutor)
    const ex = a.kind === 'item' ? exItem(a.it, done) : a.kind === 'intro' ? exIntro(a.lang, a.lex, done) : a.kind === 'rec' ? exRecognize(a.lang, a.lex, done) : exProduce(a.lang, a.lex, done);
    const lang = a.lang || a.it.lang;
    Object.assign(ex.dataset, { kind: a.kind === 'item' ? a.it.kind : a.kind, lang, ...(a.check ? { check: '1' } : {}) });
    stage.append(h('div', { class: 'tiny lx-which' }, info(lang).flag, ' ', info(lang).label, a.check ? ' · ' + LT('lang.lesson.checkTag') : '', a.retry ? ' · ' + LT('lang.sess.onceMore') : ''), ex);
  }
  function finish() {
    for (const [c, R] of Object.entries(results)) N.recordCheck(UI.C, UI.L, c, nid, R.n ? R.c / R.n : 0, day);
    save(true); bar.set(100); stage.innerHTML = '';
    const st = Object.fromEntries(langs.map(c => [c, N.nodeStates(UI.C, UI.L, c)[nid]])), nextL = qaNextLessonButton(nid, langs), more = step !== 'tp' && ladderOf(nid, langs).next;
    const rows = Object.entries(results).map(([c, R]) => ({ code: c, flag: info(c).flag, label: info(c).label,
      text: LT('lang.lesson.score', { c: R.c, n: R.n, pct: Math.round(R.c / R.n * 100) }) + ' — ' + (!['passed', 'known', 'mastered'].includes(st[c]) ? LT('lang.lesson.notYet') : R.c / R.n >= N.PASS ? '✔ ' + LT('lang.state.passed') : '✔ ' + LT('lang.lesson.passedBefore', { best: Math.round((UI.L.langs[c]?.checks?.[nid]?.best ?? 1) * 100) })) }));
    const L = more ? ladderOf(nid, langs) : null;
    const actions = [
      more ? { label: '▶ ' + LT('lang.step.continue', { step: stepTitle(L.next) }), primary: true, cls: 'lx-continue', step: L.next, run: () => runLesson(nid, langs) }
        : nextL ? { label: nextL.textContent, primary: true, cls: 'lx-nextlesson', run: () => nextL.click() } : null,
      { label: LT('lang.lesson.back'), primary: !more && !nextL, run: () => go('#/lesson/' + nid) },
      { label: LT('lang.home.map'), primary: false, run: () => go('#/') }].filter(Boolean);
    stage.append(screenEl('noema-lang-result', { model: { checked: Object.keys(results).length > 0, introduced: stats.introduced, right: stats.right, wrong: stats.wrong, rows,
      moreWaiting: langs.some(c => toIntroduce(c, nid, N.known(UI.C, UI.L, c)).length), newWords: newWordsList(), actions } }));
  }
  document.onkeydown = e => {
    if (!$('.lx-session')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}
