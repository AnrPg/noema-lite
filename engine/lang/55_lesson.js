/* ---------- the foundations: lessons that teach words, grammar and sentences together, every language at the same step (§6.7, D9–D11) ---------- */
const stepLabel = n => n.step == null ? '' : n.stage === 'core' ? 'C' + String(n.step - 18).padStart(2, '0') : 'S' + String(n.step).padStart(2, '0');
const lessonLangs = nid => activeLangs().filter(c => LX(c).applies[nid]);
/** Words of a lesson in one language that are still to be introduced. */
const toIntroduce = (c, nid, k) => (LX(c).byNode[nid] || []).filter(id => k.state[id] === 'ready');

VIEWS.lesson = (v, r) => {
  const nid = r.arg, n = UI.C.nodes[nid]; if (!n || n.kind !== 'lesson') return VIEWS.home(v);
  const langs = lessonLangs(nid); if (!langs.length) return VIEWS.home(v);
  const c = langs.includes(UI.lang) ? UI.lang : langs[0], X = LX(c), k = N.known(UI.C, UI.L, c);
  const st = Object.fromEntries(langs.map(x => [x, N.nodeStates(UI.C, UI.L, x)[nid]]));
  const can = langs.filter(x => ['open', 'learning', 'passed', 'known', 'mastered'].includes(st[x]));
  v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← Map')),
    h('h1', {}, h('span', { class: 'lx-step' }, stepLabel(n)), ' ', n.title),
    h('div', { class: 'row' }, flagRail(null, c, x => { UI.lang = x; UI.prefs.lang = x; save(); render(); }),
      ...langs.map(x => h('span', { class: 'lx-ns ns-' + st[x] }, info(x).flag, ' ', STATE_LABEL[st[x]] || st[x], UI.L.langs[x]?.checks?.[nid] ? ` · ${Math.round(UI.L.langs[x].checks[nid].best * 100)} %` : ''))),
    h('div', { class: 'row lx-actions' },
      can.length ? h('button', { class: 'btn primary', onclick: () => runLesson(nid, can) }, '▶ ' + (can.every(x => !toIntroduce(x, nid, N.known(UI.C, UI.L, x)).length) ? 'Practise' : 'Learn') + ' — ' + can.map(x => info(x).flag).join(' ')) : h('span', { class: 'lx-note' }, '🔒 Pass the lesson before it first.'),
      can.length ? h('button', { class: 'btn', onclick: () => runLesson(nid, can, { checkOnly: true }) }, '✔ Lesson check') : null, deepenButton(nid, c)));
  const fns = N.lessonFunctions(UI.C, c, nid);
  if (fns.includes('fn.overview')) v.append(typologyCard());
  v.append(h('h2', { class: 'lx-h2' }, '📖 Grammar in ', info(c).name), ...fns.map(f => grammarCard(c, f, { compact: true, onPick: x => { UI.lang = x; UI.prefs.lang = x; save(); render(); } })));
  // the same step in the other languages: their own extra points (D10)
  const extra = langs.filter(x => x !== c).map(x => [x, N.lessonFunctions(UI.C, x, nid).filter(f => !fns.includes(f))]).filter(([, f]) => f.length);
  if (extra.length) v.append(h('div', { class: 'lx-callout k-key' }, h('b', {}, '🔗 At this step your other languages also learn: '),
    h('ul', { class: 'lx-list' }, ...extra.map(([x, f]) => h('li', {}, info(x).flag, ' ', ...f.map(fid => h('button', { class: 'btn ghost small', onclick: () => go(`#/fn/${encodeURIComponent(fid)}/${x}`) }, UI.C.functions[fid]?.title || fid)))))));
  if (n.concepts.length || (X.byNode[nid] || []).length) {
    const grid = h('div', { class: 'lx-cgrid' });
    for (const cid of n.concepts) grid.append(conceptTile(c, { cid }, k));
    for (const id of (X.byNode[nid] || []).filter(id => !(X.lex[id].senses || []).length)) grid.append(conceptTile(c, { lex: id }, k));
    v.append(h('h2', { class: 'lx-h2' }, '🔤 Words ', h('span', { class: 'tiny' }, n.concepts.length)), grid);
  }
};

/** Run a lesson for some languages together: grammar (the first time) → a batch of words in every language → drills → the check once every word is in. */
function runLesson(nid, langs, { checkOnly = false } = {}) {
  const n = UI.C.nodes[nid], day = today(), batch = UI.L.settings.batch || 12, queue = [];
  const K = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c)]));
  const fresh = langs.filter(c => (LX(c).byNode[nid] || []).every(id => K[c].state[id] === 'ready') && !UI.L.langs[c]?.checks?.[nid]);
  if (!checkOnly) {
    // ① grammar — the first time only (it stays on the lesson page)
    const fns = uniq(langs.flatMap(c => N.lessonFunctions(UI.C, c, nid)));
    if (fresh.length) {
      if (fns.includes('fn.overview') && UI.C.data.typology) queue.push({ kind: 'screen', make: () => typologyCard() });
      for (const f of fns) queue.push({ kind: 'screen', fn: f, langs: fresh.filter(c => N.lessonFunctions(UI.C, c, nid).includes(f)) });
    }
    // ② words: a batch of ideas, each in every language one after the other
    const ideas = [];
    for (const cid of n.concepts) { const e = langs.flatMap(c => (LX(c).byConcept[cid] || []).filter(id => K[c].state[id] === 'ready' && LX(c).lex[id].node === nid).slice(0, 1).map(id => ({ lang: c, lex: id }))); if (e.length) ideas.push(e); }
    for (const c of langs) for (const id of toIntroduce(c, nid, K[c])) if (!(LX(c).lex[id].senses || []).length) ideas.push([{ lang: c, lex: id }]);
    for (const e of ideas.slice(0, batch)) { for (const x of e) queue.push({ kind: 'intro', ...x }); for (const x of e) queue.push({ kind: 'rec', ...x }); for (const x of e) queue.push({ kind: 'prod', ...x }); }
    // ③ drills and sentences of the lesson's grammar, from what is known by then (made when reached)
    queue.push({ kind: 'drills' });
  }
  queue.push({ kind: 'check' });
  runQueue(queue, { nid, langs, title: `${stepLabel(n)} ${n.title}` });
}

function runQueue(queue, { nid, langs, title }) {
  metNew.clear();   // the 🆕 words of this run, listed at the end (D19)
  const m = $('.lx-main'), bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  m.innerHTML = ''; m.append(h('div', { class: 'view lx-view lx-session lx-lessonrun', 'data-node': nid }, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go('#/lesson/' + nid); render(); } }, '✕ Stop'), h('b', { class: 'tiny' }, title), bar), stage));
  const stats = { right: 0, wrong: 0, introduced: 0 }, results = {}, retried = new Set(); let total = queue.length, i = 0;
  const day = today();
  const nextBtn = (label = 'Next →') => { const b = h('button', { class: 'btn primary lx-next' }, label); b.onclick = next; stage.append(h('div', { class: 'row lx-nextrow' }, b)); setTimeout(() => b.focus(), 30); };
  function next() {
    bar.firstChild.style.width = Math.round(i / Math.max(total, 1) * 100) + '%';
    const a = queue.shift(); if (!a) return finish();
    i++; stage.innerHTML = '';
    if (a.kind === 'screen') {
      if (a.make) stage.append(a.make());
      else { let cur = a.langs[0] || langs[0]; const holder = h('div'); const draw = () => { holder.innerHTML = ''; holder.append(grammarCard(cur, a.fn, { compact: true, onPick: x => { cur = x; draw(); } })); }; draw(); stage.append(a.langs.length > 1 ? flagRail(null, cur, x => { cur = x; draw(); }) : null, holder); }
      return nextBtn('Got it →');
    }
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
      stage.append(h('div', { class: 'lx-result' }, h('h2', {}, '✔ The lesson check'), h('p', {}, `${items.length} questions in ${uniq(items.map(x => x.it.lang)).map(c => info(c).flag).join(' ')} — 80 % in a language passes the lesson there.`)));
      queue.unshift(...shuffle(items)); total += items.length; return nextBtn('Start →');
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
    stage.append(h('div', { class: 'tiny lx-which' }, info(lang).flag, ' ', info(lang).name, a.check ? ' · lesson check' : '', a.retry ? ' · once more' : ''), ex);
  }
  function finish() {
    for (const [c, R] of Object.entries(results)) N.recordCheck(UI.C, UI.L, c, nid, R.n ? R.c / R.n : 0, day);
    save(true); bar.firstChild.style.width = '100%'; stage.innerHTML = '';
    const st = Object.fromEntries(langs.map(c => [c, N.nodeStates(UI.C, UI.L, c)[nid]]));
    stage.append(h('div', { class: 'lx-result' }, h('h2', {}, Object.keys(results).length ? '🏁 Lesson check done' : '🎉 Well done'),
      h('p', {}, `${stats.introduced} new words · ${stats.right} right · ${stats.wrong} to practise again`),
      Object.keys(results).length ? h('ul', {}, ...Object.entries(results).map(([c, R]) => h('li', { 'data-lang': c }, info(c).flag, ' ', info(c).name, `: ${R.c}/${R.n} = ${Math.round(R.c / R.n * 100)} % — `, !['passed', 'known', 'mastered'].includes(st[c]) ? 'not yet (80 % passes)' : R.c / R.n >= N.PASS ? '✔ passed' : `✔ passed before (best ${Math.round((UI.L.langs[c]?.checks?.[nid]?.best ?? 1) * 100)} %) — practise it again`))) : null,
      langs.some(c => toIntroduce(c, nid, N.known(UI.C, UI.L, c)).length) ? h('p', { class: 'tiny' }, 'More words of this lesson are waiting — continue when you are ready.') : null,
      newWordsList(),
      h('div', { class: 'row' }, qaNextLessonButton(nid, langs), h('button', { class: 'btn' + (qaNextLessonButton(nid, langs) ? '' : ' primary'), onclick: () => go('#/lesson/' + nid) }, 'Back to the lesson'), h('button', { class: 'btn', onclick: () => go('#/') }, 'The map'))));
  }
  document.onkeydown = e => {
    if (!$('.lx-session')) { document.onkeydown = null; return; }
    if (/^[1-9]$/.test(e.key) && !/input/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}
