/* ---------- ⫴ parallel lanes: the paths of your languages side by side (D13, §4.4.3, §9; #/lanes) ----------
   One quiet column per language; the same subject sits on the same level in every lane (langcore.parallelLanes), a step of
   one language alone sits beside the others' running lines. Each step is a small button: a tap tells more about it there. */
const LANE_SECTION = s => s === 'foundations' ? 'Foundations' : s === 'core' ? 'Core' : s === 'advanced' ? 'Advanced' : s.startsWith('field:') ? (UI.C.data.fields.find(f => 'field:' + f.field === s)?.title || 'Words') : '';
const LANE_SIGN = { passed: '✓', known: '✓', mastered: '★', learning: '◑', open: '○', ready: '○', locked: '🔒', unprepared: '⏳', skipped: '⤼', na: '' };
function laneShort(n) { const t = String(n.title || '').split(/ — |: /)[0]; return t.length > 34 ? t.slice(0, 32) + '…' : t; }
VIEWS.lanes = (v) => {
  const langs = UI.C.languages.filter(c => UI.C.lang[c]), L = N.parallelLanes(UI.C, langs);
  const st = Object.fromEntries(langs.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  v.classList.add('lx-lanesview');
  v.append(h('h1', {}, 'Parallel lanes'),
    h('p', { class: 'tiny lx-lanesnote' }, 'The same subject is on the same level in every language. A step of one language alone sits between them.'));
  const grid = h('div', { class: 'lx-lanes2', style: `--n:${langs.length}`, role: 'table', 'aria-label': 'The paths of your languages side by side' });
  grid.append(h('div', { class: 'lx-lhead', role: 'row' }, ...langs.map(c => h('div', { class: 'lx-lflag', role: 'columnheader', 'data-lang': c, title: info(c).name }, info(c).flag, h('span', { class: 'lx-lname' }, info(c).name)))));
  let sec = null;
  L.rows.forEach((row, i) => {
    if (row.section !== sec) { sec = row.section; const t = LANE_SECTION(sec); if (t) grid.append(h('div', { class: 'lx-lsec', role: 'row' }, h('span', {}, t))); }
    const r = h('div', { class: 'lx-lrow' + (row.common ? ' lx-lcommon' : ''), role: 'row', 'data-row': i });
    for (const c of langs) {
      const nid = row.cells[c], n = nid && UI.C.nodes[nid], s = nid ? st[c][nid] : null;
      r.append(h('div', { class: 'lx-lcell' + (nid ? '' : ' lx-lgap'), role: 'cell', 'data-lang': c },
        nid ? h('button', { class: 'lx-lnode s-' + s, 'data-node': nid, 'data-lang': c, title: `${info(c).name} · ${n.title} · ${STATE_LABEL[s] || s}`, onclick: () => laneInfo(c, nid) },
          h('span', { class: 'lx-lstep' }, stepLabel(n) || (n.kind === 'field' ? '·' : '')), h('span', { class: 'lx-ltitle' }, laneShort(n)), LANE_SIGN[s] ? h('span', { class: 'lx-lsign', 'aria-hidden': 'true' }, LANE_SIGN[s]) : null) : null));
    }
    grid.append(r);
  });
  v.append(grid);
};
/** A step of one language: what it teaches there, how far you are, and the same step in your other languages. */
function laneInfo(c, nid) {
  const n = UI.C.nodes[nid], X = LX(c), s = N.nodeStates(UI.C, UI.L, c)[nid];
  const fns = n.kind === 'lesson' ? N.lessonFunctions(UI.C, c, nid).filter(f => f !== 'fn.overview') : [];
  const words = (X.byNode[nid] || []).length;
  const others = UI.C.languages.filter(x => x !== c && UI.C.lang[x]?.applies[nid]);
  const body = box => box.append(
    h('p', { class: 'lx-linfo-st' }, info(c).flag, ' ', info(c).name, ' · ', String(STATE_LABEL[s] || s).replace(/^\S+\s/, '')),
    fns.length ? h('ul', { class: 'lx-linfo-fns' }, ...fns.map(f => { const g = X.grammar[f]; return h('li', {}, UI.C.functions[f]?.title || f, g?.status && g.status !== 'realized' ? h('span', { class: 'tiny' }, ' · ' + g.status) : null); })) : null,
    words ? h('p', { class: 'tiny' }, `${words} words in ${info(c).name}`) : null,
    others.length ? h('p', { class: 'tiny lx-linfo-oth' }, 'Also in ', ...others.flatMap((x, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', 'data-lang': x, onclick: () => { close(); laneInfo(x, nid); } }, info(x).name + ' · ' + String(STATE_LABEL[N.nodeStates(UI.C, UI.L, x)[nid]] || '').replace(/^\S+\s/, ''))])) : h('p', { class: 'tiny' }, `Only in ${info(c).name}.`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { close(); UI.lang = c; UI.prefs.lang = c; save(); go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid); } }, 'Open')));
  let close = () => document.querySelector('.lx-pop')?.remove();
  const title = (stepLabel(n) ? stepLabel(n) + ' ' : '') + n.title;
  if (FR.on && window.NoemaShell?.sheet) { NoemaShell.sheet(title, (b, cl) => { close = cl; body(b); }); return; }
  document.querySelector('.lx-pop')?.remove();
  const pop = h('div', { class: 'lx-pop', role: 'dialog', 'aria-label': title, onclick: e => { if (e.target === pop) pop.remove(); } });
  const inner = h('div', { class: 'lx-popbox lx-linfo' }, h('div', { class: 'row' }, h('b', {}, title), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost small', onclick: () => pop.remove() }, '✕')));
  body(inner); pop.append(inner); document.body.append(pop);
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') pop.remove(); });
  inner.querySelector('.btn.primary')?.focus();
}
/** The way in: a quiet button next to the map (only with two or more languages). */
const lanesButton = () => UI.C.languages.length > 1 ? h('button', { class: 'btn ghost small lx-tolanes', onclick: () => go('#/lanes') }, '⫴ Parallel lanes') : null;
