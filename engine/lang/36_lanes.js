/* ---------- ⫴ parallel lanes: the paths of your languages side by side (D13, §4.4.3, §9; #/lanes) ----------
   One quiet column per language; the same subject sits on the same level in every lane (langcore.parallelLanes), a step of
   one language alone sits beside the others' running lines. Each step is a small button: a tap tells more about it there. */
const LANE_SECTION = s => ['foundations', 'core', 'advanced'].includes(s) ? LT('lang.lanes.sec.' + s) : s.startsWith('field:') ? (UI.C.data.fields.find(f => 'field:' + f.field === s)?.title || LT('lang.lanes.sec.words')) : '';
const LANE_SIGN = { passed: '✓', known: '✓', mastered: '★', learning: '◑', open: '○', ready: '○', locked: '🔒', unprepared: '⏳', skipped: '⤼', na: '' };
function laneShort(n) { const t = String(n.title || '').split(/ — |: /)[0]; return t.length > 34 ? t.slice(0, 32) + '…' : t; }
/** The short code of a step for the compact lanes: S00 → S0, C05 → C5; a field node → its letter and number (veg.2a → V2a). */
function laneCode(n) {
  const s = stepLabel(n); if (s) return s[0] + String(+s.slice(1));
  const m = String(n.id).match(/\.([0-9]+[a-z]?)$/); const f = UI.C.data.fields.find(x => x.field === n.field);
  return ((f?.title || n.title || '?')[0].toUpperCase()) + (m ? m[1] : '');
}
/** Tiles, or small round dots when the lanes would be too narrow for tiles (many languages, a small screen) — or as chosen. */
const LANE_MIN_TILE = 80;   // px a tile needs; four languages still fit as tiles on a phone, five do not
function laneCompact(n) {
  const pick = UI.prefs.lanesView; if (pick === 'dots') return true; if (pick === 'tiles') return false;
  const w = (FR.on && FR.host ? FR.host.clientWidth : document.documentElement.clientWidth) - 32;
  return w / n < LANE_MIN_TILE;
}
let laneHover = null;
function laneHoverShow(btn, c, nid) {
  laneHoverHide(); const n = UI.C.nodes[nid], s = N.nodeStates(UI.C, UI.L, c)[nid], r = btn.getBoundingClientRect();
  laneHover = h('div', { class: 'lx-lhover', role: 'tooltip' }, h('b', {}, (stepLabel(n) ? stepLabel(n) + ' ' : '') + n.title), h('div', { class: 'tiny' }, info(c).flag + ' ' + info(c).label + ' · ' + String(STATE_LABEL[s] || s).replace(/^\S+\s/, '')));
  document.body.append(laneHover);
  const w = laneHover.offsetWidth, x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), above = r.top > 90;
  Object.assign(laneHover.style, { left: x + 'px', top: (above ? r.top - laneHover.offsetHeight - 8 : r.bottom + 8) + 'px' });
}
function laneHoverHide() { laneHover?.remove(); laneHover = null; }
addEventListener('resize', () => { if (UI.view === 'lanes' && !UI.prefs.lanesView) { const g = document.querySelector('.lx-lanes2'); if (g && g.classList.contains('lx-ldots') !== laneCompact(+g.dataset.n)) render(); } });
VIEWS.lanes = (v) => {
  const langs = UI.C.languages.filter(c => UI.C.lang[c]), L = N.parallelLanes(UI.C, langs), dots = laneCompact(langs.length);
  const st = Object.fromEntries(langs.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  v.classList.add('lx-lanesview');
  const seg = h('div', { class: 'lx-seg lx-lviewpick', role: 'group', 'aria-label': LT('lang.lanes.lookLabel') }, ...[['', LT('lang.lanes.auto')], ['tiles', LT('lang.lanes.tiles')], ['dots', LT('lang.lanes.dots')]].map(([k, t]) =>
    h('button', { class: (UI.prefs.lanesView || '') === k ? 'on' : '', 'aria-pressed': (UI.prefs.lanesView || '') === k ? 'true' : 'false', onclick: () => { UI.prefs.lanesView = k || undefined; save(); render(); } }, t)));
  v.append(h('div', { class: 'lx-lanestop' }, h('h1', {}, LT('lang.view.lanes')), seg),
    h('p', { class: 'tiny lx-lanesnote' }, LT('lang.lanes.note')));
  const grid = h('div', { class: 'lx-lanes2' + (dots ? ' lx-ldots' : ''), 'data-n': langs.length, style: `--n:${langs.length}`, role: 'table', 'aria-label': LT('lang.lanes.tableLabel') });
  grid.append(h('div', { class: 'lx-lhead', role: 'row' }, ...langs.map(c => h('div', { class: 'lx-lflag', role: 'columnheader', 'data-lang': c, title: info(c).label }, info(c).flag, h('span', { class: 'lx-lname' }, info(c).label)))));
  let sec = null;
  L.rows.forEach((row, i) => {
    if (row.section !== sec) { sec = row.section; const t = LANE_SECTION(sec); if (t) grid.append(h('div', { class: 'lx-lsec', role: 'row' }, h('span', {}, t))); }
    const r = h('div', { class: 'lx-lrow' + (row.common ? ' lx-lcommon' : ''), role: 'row', 'data-row': i });
    for (const c of langs) {
      const nid = row.cells[c], n = nid && UI.C.nodes[nid], s = nid ? st[c][nid] : null;
      r.append(h('div', { class: 'lx-lcell' + (nid ? '' : ' lx-lgap'), role: 'cell', 'data-lang': c },
        !nid ? null : dots
          ? h('button', { class: 'lx-ldot s-' + s, 'data-node': nid, 'data-lang': c, 'aria-label': `${info(c).label} · ${n.title} · ${STATE_LABEL[s] || s}`,
              onclick: () => { laneHoverHide(); laneInfo(c, nid); }, onmouseenter: e => laneHoverShow(e.currentTarget, c, nid), onmouseleave: laneHoverHide, onfocus: e => laneHoverShow(e.currentTarget, c, nid), onblur: laneHoverHide }, laneCode(n))
          : h('button', { class: 'lx-lnode s-' + s, 'data-node': nid, 'data-lang': c, title: `${info(c).label} · ${n.title} · ${STATE_LABEL[s] || s}`, onclick: () => laneInfo(c, nid) },
              h('span', { class: 'lx-lstep' }, stepLabel(n) || (n.kind === 'field' ? '·' : '')), h('span', { class: 'lx-ltitle' }, laneShort(n)), LANE_SIGN[s] ? h('span', { class: 'lx-lsign', 'aria-hidden': 'true' }, LANE_SIGN[s]) : null)));
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
    h('p', { class: 'lx-linfo-st' }, info(c).flag, ' ', info(c).label, ' · ', String(STATE_LABEL[s] || s).replace(/^\S+\s/, '')),
    fns.length ? h('ul', { class: 'lx-linfo-fns' }, ...fns.map(f => { const g = X.grammar[f]; return h('li', {}, UI.C.functions[f]?.title || f, g?.status && g.status !== 'realized' ? h('span', { class: 'tiny' }, ' · ' + g.status) : null); })) : null,
    words ? h('p', { class: 'tiny' }, LT('lang.lanes.words', { n: words, lang: info(c).name })) : null,
    others.length ? h('p', { class: 'tiny lx-linfo-oth' }, LT('lang.lanes.alsoIn') + ' ', ...others.flatMap((x, i) => [i ? ' · ' : '', h('button', { class: 'btn ghost small', 'data-lang': x, onclick: () => { close(); laneInfo(x, nid); } }, info(x).label + ' · ' + String(STATE_LABEL[N.nodeStates(UI.C, UI.L, x)[nid]] || '').replace(/^\S+\s/, ''))])) : h('p', { class: 'tiny' }, LT('lang.lanes.onlyIn', { lang: info(c).name })),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { close(); UI.lang = c; UI.prefs.lang = c; save(); go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid); } }, LT('lang.home.open'))));
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
const lanesButton = () => UI.C.languages.length > 1 ? h('button', { class: 'btn ghost small lx-tolanes', onclick: () => go('#/lanes') }, '⫴ ' + LT('lang.view.lanes')) : null;
