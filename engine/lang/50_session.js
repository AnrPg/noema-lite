/* ---------- the session: reviews, then new ideas learned in every language one after the other (§7.5) ---------- */
/** A batch of one node only (“Learn / review this node”). */
function nodePlan(nid, langs) {
  const plan = N.planSession(UI.C, UI.L, { day: today(), minutes: 15, languages: langs });
  const reviews = plan.steps.filter(s => s.kind === 'review').flatMap(s => s.items).filter(it => LX(it.lang).lex[it.lex].node === nid);
  const k = Object.fromEntries(langs.map(c => [c, N.known(UI.C, UI.L, c)]));
  const concepts = [];
  for (const cid of UI.C.nodes[nid].concepts) {
    const e = langs.flatMap(c => (LX(c).byConcept[cid] || []).filter(id => k[c].state[id] === 'ready').slice(0, 1).map(id => ({ lang: c, lex: id })));
    if (e.length && concepts.length < (UI.L.settings.batch || 12)) concepts.push({ concept: cid, langs: e });
  }
  for (const c of langs) for (const id of LX(c).byNode[nid] || []) if (!(LX(c).lex[id].senses || []).length && k[c].state[id] === 'ready' && concepts.length < (UI.L.settings.batch || 12)) concepts.push({ concept: id, langs: [{ lang: c, lex: id }] });
  return { steps: [...(reviews.length ? [{ kind: 'review', items: reviews }] : []), ...(concepts.length ? [{ kind: 'learn', node: nid, concepts }] : [])] };
}
function runSession(plan, { only = null } = {}) {
  if (only) plan = nodePlan(only, [UI.lang]);
  const queue = [];
  for (const s of plan.steps) {
    if (s.kind === 'review') for (const it of s.items) queue.push({ kind: it.track === 'r' ? 'rec' : 'prod', lang: it.lang, lex: it.lex, review: true });
    if (s.kind === 'learn') for (const cn of s.concepts) {
      for (const e of cn.langs) queue.push({ kind: 'intro', ...e });
      for (const e of cn.langs) queue.push({ kind: 'rec', ...e });
      for (const e of cn.langs) queue.push({ kind: 'prod', ...e });
    }
  }
  if (!queue.length) { go('#/'); return; }
  const total = queue.length, stats = { right: 0, wrong: 0, introduced: 0 }, retried = new Set();
  const before = Object.fromEntries(activeLangs().map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  const m = $('.lx-main'); const bar = h('div', { class: 'lx-progress' }, h('i')), stage = h('div', { class: 'lx-stage' });
  m.innerHTML = ''; m.append(h('div', { class: 'view lx-view lx-session' }, h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => { save(true); go('#/'); render(); } }, '✕ Stop'), bar), stage));
  let i = 0;
  const next = () => {
    bar.firstChild.style.width = Math.round(i / (total + retried.size) * 100) + '%';
    const a = queue.shift();
    if (!a) return finish();
    i++; stage.innerHTML = '';
    const day = today();
    const done = ok => {
      if (a.kind === 'intro') { N.introduce(UI.C, UI.L, a.lang, a.lex, day); stats.introduced++; save(); return next(); }
      N.review(UI.C, UI.L, a.lang, a.lex, a.kind === 'rec' ? 'r' : 'p', ok ? 'good' : 'again', day); save();
      ok ? stats.right++ : stats.wrong++;
      const key = a.kind + a.lang + a.lex;
      if (!ok && !retried.has(key)) { retried.add(key); queue.splice(Math.min(3, queue.length), 0, { ...a, retry: true }); }   // once more, a little later
      const btn = h('button', { class: 'btn primary lx-next' }, 'Next →'); btn.onclick = next;
      stage.append(h('div', { class: 'row lx-nextrow' }, btn)); setTimeout(() => btn.focus(), 30);
    };
    const ex = a.kind === 'intro' ? exIntro(a.lang, a.lex, done) : a.kind === 'rec' ? exRecognize(a.lang, a.lex, done) : exProduce(a.lang, a.lex, done);
    Object.assign(ex.dataset, { kind: a.kind, lang: a.lang, lex: a.lex });   // for tests and styling
    stage.append(h('div', { class: 'tiny lx-which' }, info(a.lang).flag, ' ', info(a.lang).name, a.review ? ' · review' : '', a.retry ? ' · once more' : ''), ex);
  };
  const finish = () => {
    save(true); bar.firstChild.style.width = '100%'; stage.innerHTML = '';
    const opened = [];
    for (const c of activeLangs()) { const now = N.nodeStates(UI.C, UI.L, c); for (const nid of UI.C.order) if (before[c][nid] !== now[nid] && ['open', 'known', 'mastered'].includes(now[nid])) opened.push(`${info(c).flag} ${UI.C.nodes[nid].title}: ${STATE_LABEL[now[nid]]}`); }
    stage.append(h('div', { class: 'lx-result' }, h('h2', {}, '🎉 Session done'),
      h('p', {}, `${stats.introduced} new · ${stats.right} right · ${stats.wrong} to practise again`),
      opened.length ? h('ul', {}, ...opened.map(t => h('li', {}, t))) : null,
      h('button', { class: 'btn primary', onclick: () => go('#/') }, 'Back to the map')));
  };
  document.onkeydown = e => {
    if (!$('.lx-session')) { document.onkeydown = null; return; }
    if (/^[1-4]$/.test(e.key) && !/input/i.test(document.activeElement?.tagName)) { const b = [...stage.querySelectorAll('.lx-opts:not([data-done]) .lx-opt')][+e.key - 1]; b?.click(); }
  };
  next();
}
/** The word profiles arrive after the start: a word card on screen is drawn again with them. */
function addProfiles(map) { const n = N.addProfiles(UI.C, map); UI.profiles = true; if (n && ['c', 'w', 'node', 'field'].includes(UI.view) && !$('.lx-session')) render(); return n; }
window.NoemaLangUI = { start, UI, addProfiles };
