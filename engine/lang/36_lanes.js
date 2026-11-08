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
const laneState = (c, nid) => N.nodeStates(UI.C, UI.L, c)[nid];
const laneStateText = s => String(STATE_LABEL[s] || s).replace(/^\S+\s/, '');
/** The lanes as the screen draws them (src/ui/screens/languages/lang-lanes.ts, course-port.ts LanesModel). */
function lanesModel() {
  const langs = UI.C.languages.filter(c => UI.C.lang[c]), L = N.parallelLanes(UI.C, langs);
  const st = Object.fromEntries(langs.map(c => [c, N.nodeStates(UI.C, UI.L, c)]));
  let sec = null;
  const rows = L.rows.map(row => {
    const head = row.section !== sec ? (sec = row.section, LANE_SECTION(sec) || null) : null;
    const cells = Object.fromEntries(langs.map(c => {
      const nid = row.cells[c], n = nid && UI.C.nodes[nid];
      if (!n) return [c, null];
      const s = st[c][nid];
      return [c, { node: nid, step: stepLabel(n) || (n.kind === 'field' ? '·' : ''), title: n.title, short: laneShort(n), code: laneCode(n), state: s, stateLabel: laneStateText(s), sign: LANE_SIGN[s] || '' }];
    }));
    return { section: head, common: !!row.common, cells };
  });
  return { langs: langs.map(courseLang), view: UI.prefs.lanesView || '', rows, width: () => FR.on && FR.host ? FR.host.clientWidth : document.documentElement.clientWidth };
}
/** A step of one language: what it teaches there, how far you are, and the same step in your other languages. */
function laneInfo(c, nid) {
  const n = UI.C.nodes[nid], X = LX(c);
  const fns = n.kind === 'lesson' ? N.lessonFunctions(UI.C, c, nid).filter(f => f !== 'fn.overview') : [];
  return {
    node: nid, title: (stepLabel(n) ? stepLabel(n) + ' ' : '') + n.title, lang: courseLang(c), state: laneStateText(laneState(c, nid)),
    functions: fns.map(f => { const g = X.grammar[f]; return { title: UI.C.functions[f]?.title || f, note: g?.status && g.status !== 'realized' ? LT('lang.poly.st.' + (['periphrastic', 'absent'].includes(g.status) ? g.status : 'other'), { status: g.status }) : null }; }),
    words: (X.byNode[nid] || []).length,
    others: UI.C.languages.filter(x => x !== c && UI.C.lang[x]?.applies[nid]).map(x => ({ code: x, label: info(x).label, state: laneStateText(laneState(x, nid)) })),
  };
}
function laneOpen(c, nid) { const n = UI.C.nodes[nid]; UI.lang = c; UI.prefs.lang = c; save(); go((n.kind === 'lesson' ? '#/lesson/' : '#/node/') + nid); }
VIEWS.lanes = v => screenPart(v, 'lang-lanes', 'lx-screen');
/** The way in: a quiet button next to the map (only with two or more languages). */
const lanesButton = () => UI.C.languages.length > 1 ? h('button', { class: 'btn ghost small lx-tolanes', onclick: () => go('#/lanes') }, '⫴ ' + LT('lang.view.lanes')) : null;
