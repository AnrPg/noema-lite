/* ---------- inside the frame: main's calm style (docs/LANGUAGES.md §8 *Style inside the frame*, docs/UI_MAP.md) ----------
   Only when the course is drawn in the frame (FR.on); with shell: false the course keeps its own screens.
   Every view is drawn as before, then tidied: one primary action per screen; the other actions go to the frame's ⋮ (or a
   "Practice ▾" next to the primary one, or a sheet); the home becomes the frame's components (.ns-go, .ns-label, .ns-list /
   .ns-item, sheets); counts and sign legends that are noise are shown on demand; the frame's ← and crumbs replace the
   views' own "← Back" buttons; chrome text (titles, buttons) drops its pictographs like the rest of the frame (flags,
   lesson text, foreign words and exercise pictures stay). The moved buttons stay in the page, hidden (.lx-moved), and the
   menus press them: every feature keeps its code path and stays reachable. */
const FS = () => window.NoemaShell;
const FRAME_EMO = /(?![\u00A9\u00AE\u2122\u2190-\u21FF\u25A0-\u25FF\u2713\u2715])\p{Extended_Pictographic}(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic})*\uFE0F?[ \u00A0]?/gu;
const framePlain = t => String(t || '').replace(FRAME_EMO, '').replace(/\u25B6\s*/g, '').replace(/^\s*[\u2190-\u21FF]\s*/, '').replace(/[ \u00A0]{2,}/g, ' ').trim();
/* the frame's line icons for the lanes and the actions the course offers (engine/art.js keys) */
const FRAME_ICON = [[/grammar|rule|point/i, 'grid'], [/writ|rewrite|translate/i, 'edit'], [/read|text/i, 'book'], [/letter|character|spelling|script|trac/i, 'doc'], [/peculiar|signs mean|what the/i, 'info'],
  [/listen|speak|say|shadow|dictat|voice/i, 'mic'], [/tutor|conversation|quiz|explain|ask/i, 'chat'], [/compare|across|bridge|which|align|holds/i, 'globe'], [/check/i, 'check'], [/claude|sentences/i, 'spark'],
  [/field|sort|map/i, 'map'], [/practi|drill|deepen|parts|mixed|round/i, 'gym'], [/setting/i, 'gear'], [/today/i, 'sun'], [/new|learn/i, 'plus']];
const frameIcon = label => (FRAME_ICON.find(([re]) => re.test(label)) || [null, 'dots'])[1];
const FRAME_TEXT = 'h1, h2, h3, h4, summary, button.btn, .lx-note, .lx-sub';
const FRAME_KEEP = '.lx-w, .lx-tile, .lx-temoji, .lx-opt, .lx-prompt, .lx-glyphs, .lx-stage .lx-ex, .lx-ns, .lx-flag, .lx-laneicon, .lx-new, [lang]:not([lang|="en"]), textarea, input, select, .ns-ico';
/** Chrome text without pictographs (flags, foreign words, pictures of words and exercises stay). */
function framePlainTree(root) {
  if (!FR.on || !root || root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = []; let n;
  while ((n = w.nextNode())) list.push(n);
  for (const t of list) {
    const p = t.parentElement; if (!p || !p.closest(FRAME_TEXT) || p.closest(FRAME_KEEP)) continue;
    FRAME_EMO.lastIndex = 0; if (!FRAME_EMO.test(t.nodeValue) && !/^\s*\u25B6/.test(t.nodeValue)) continue;
    FRAME_EMO.lastIndex = 0; const v = t.nodeValue.replace(FRAME_EMO, '').replace(/^(\s*)\u25B6\s*/, '$1').replace(/^[ \u00A0]+(?=\S)/, '');
    if (v !== t.nodeValue) t.nodeValue = v;
  }
}
let frameObs = null;
/** Keep the course plain while it redraws itself (sessions, re-drawn cards). */
function frameWatch(host) {
  frameObs?.disconnect(); if (!host) return;
  frameObs = new MutationObserver(ms => { if (!FR.on) return; for (const m of ms) m.addedNodes.forEach(x => { if (x.nodeType === 1) framePlainTree(x); else if (x.nodeType === 3 && x.parentElement) framePlainTree(x.parentElement); }); });
  frameObs.observe(host, { childList: true, subtree: true });
}
/** A list of actions as the frame's rows: [{ label, sub?, icon?, run }] → .ns-list of .ns-item buttons. */
function frameList(items, { close = null } = {}) {
  const S = FS();
  return h('div', { class: 'ns-list lx-flist' }, ...items.map((it, i) => h('button', { class: 'ns-item', disabled: it.disabled ? true : null, 'data-act': it.key || null, onclick: () => { close?.(); it.run(); } },
    it.txt ? S.icoTxt(it.txt, (i % 4) + 1, 'txt') : it.flag ? S.icoTxt(it.flag, (i % 4) + 1, 'emo') : S.ico(it.icon || frameIcon(it.label), (i % 4) + 1),
    h('span', { class: 't' }, h('b', {}, it.label), it.sub ? h('small', {}, it.sub) : null), it.badge ? S.pill(it.badge, it.tone || 2) : h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›'))));
}
/** A button of the older screen as an action: its words without pictographs, pressing the (hidden) button itself. */
const frameAct = (b, extra = {}) => ({ label: framePlain(b.textContent) || b.title || '…', icon: frameIcon(b.textContent), disabled: b.disabled, run: () => b.click(), ...extra });
const frameSheet = (title, items) => FS().sheet(title, (body, close) => body.append(frameList(items(), { close })));

/** Tidy a view that was just drawn: → the actions for the frame's ⋮. */
function frameTidy(v, r) {
  const acts = [], hold = h('div', { class: 'lx-moved', hidden: true, 'aria-hidden': 'true' });
  const move = (b, extra) => { acts.push(frameAct(b, extra)); hold.append(b); };
  const kids = sel => [...v.querySelectorAll(':scope > ' + sel)];
  kids('.lx-back').forEach(x => x.remove());   // ← and the crumbs of the frame
  // the tutor's intents: the character opens the tutor; the intents of this page wait in ⋮
  kids('.lx-tutorrow').forEach(row => { row.querySelectorAll('button').forEach(b => move(b, { sub: 'Tutor', icon: 'chat' })); row.remove(); });
  // one primary action: the rest of an action row goes to ⋮
  kids('.lx-actions').forEach(row => {
    const bs = [...row.querySelectorAll(':scope > button')], keep = bs.find(b => b.classList.contains('primary')) || bs[0];
    bs.filter(b => b !== keep).forEach(b => move(b)); keep?.classList.remove('small');
  });
  // a row of drills (three buttons or more): its primary one, the others in "Practice ▾" next to it
  kids('.row').forEach(row => {
    if (row.matches('.lx-cmplangs, .lx-today') || row.querySelector('.lx-rail, input, select, textarea')) return;
    const bs = [...row.querySelectorAll(':scope > button.btn')]; if (bs.length < 3) return;
    const keep = bs.find(b => b.classList.contains('primary')), rest = bs.filter(b => b !== keep), lab = framePlain(row.querySelector(':scope > .tiny')?.textContent || '').replace(/:\s*$/, '');
    const items = rest.map(b => frameAct(b)); rest.forEach(b => hold.append(b));
    row.replaceChildren(...[keep, FS().menuButton(items, { cls: 'btn ns-dropbtn', label: lab || 'Practice', content: h('span', {}, (lab || 'Practice') + ' ▾') })].filter(Boolean));
    row.classList.add('lx-frow');
  });
  // a course written through Claude: its refill card says the state; asking for more is an action
  v.querySelectorAll('.lj-refill .row button').forEach(b => move(b, { icon: 'spark' }));
  // noise on demand: the state chips beside a title (the flags' dots say it), counts after section titles
  kids('.row > .lx-ns').forEach(x => x.remove());
  v.querySelectorAll(':scope > h2 > .tiny, :scope > section > h2 > .tiny').forEach(x => x.remove());
  // the explanation under a title → an (i) beside it
  const h1 = v.querySelector(':scope > h1');
  if (h1) for (let n = h1.nextElementSibling, i = 0; n && i < 3; n = n.nextElementSibling, i++) {
    if (n.matches('p.tiny') && !n.querySelector('a, button, input') && n.textContent.length > 40) { h1.append(' ', FS().hint(framePlain(n.textContent))); n.remove(); break; }
  }
  // a lesson's grammar points: the first one open, the others one tap away (less to scroll past on a phone)
  const grams = kids('article.lx-gram');
  if (grams.length > 1) grams.forEach((card, i) => { const d = h('details', { class: 'lx-ffold', open: i === 0 ? true : null }, h('summary', {}, card.querySelector('h3')?.textContent || 'Grammar')); card.replaceWith(d); d.append(card); });
  if (r.name === 'home' && v.querySelector('.lx-hero')) frameHome(v, acts, hold);
  if (hold.children.length) v.append(hold);
  // one primary action per screen: the first one stays primary, the others become plain buttons
  [...v.querySelectorAll('.btn.primary')].filter(b => !b.closest('.lx-moved, .lx-stage, .lx-session')).slice(1).forEach(b => b.classList.remove('primary'));
  // the languages switch of the older top bar says nothing new here: each page that shows one language has its flag rail, the home a row per language
  const sub = FR.host?.querySelector('.lx-subbar'); if (sub) sub.hidden = true;
  framePlainTree(v);
  return acts;
}

/** The course home in the frame's words: a header, ONE big card (today's session or the next lesson), your languages as
    rows (each opens a sheet with its lanes), across your languages, drills, the map. */
function frameHome(v, acts, hold) {
  const S = FS(), hero = v.querySelector('.lx-hero'), course = UI.C.data.course;
  const go1 = hero.querySelector('.lx-go'), todayRow = v.querySelector('.lx-today');
  const names = UI.C.languages.map(c => info(c).name), named = names.every(n => course.title.includes(n));
  const head = h('div', { class: 'lx-fhead' }, h('h1', {}, course.title), h('p', { class: 'ns-muted lx-fsub' }, (named ? '' : names.join(' · ') + ' — ') + 'explained in ' + info(UI.C.explainLang).name));
  // the one primary action
  const txt = framePlain(go1?.textContent || ''), session = /session/i.test(txt), start = txt.match(/^(?:▶\s*)?Start:\s*(.+)$/), none = !go1 || go1.disabled;
  const todays = todayLangs();
  const card = h(none ? 'div' : 'button', { class: 'ns-go lx-fgo' + (none ? ' lx-fdone' : ''), onclick: none ? null : () => go1.click() },
    h('span', { class: 'rm' }, session ? 'Today’s session' : start ? 'Your next lesson' : 'Today'),
    h('h2', {}, session ? txt.replace(/^.*?session\s*[—-]\s*/i, '') : start ? start[1] : txt.replace(/^✅\s*/, '')),
    h('span', { class: 'meta' }, todays.length > 1 || UI.C.languages.length > 1 ? S.pill(todays.map(c => info(c).flag).join(' '), 1) : null),
    none ? null : h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
  const out = [head, card];
  if (go1) hold.append(go1);
  if (todayRow) {   // which languages today: on demand
    hold.append(todayRow);
    acts.unshift({ label: 'Today’s languages', sub: todays.map(c => info(c).name).join(' · '), icon: 'sun', run: () => frameTodaySheet() });
  }
  // the next lessons (when the card is the session, or more than one waits)
  const lessons = [...v.querySelectorAll('.lx-lessonbtn')];
  const listed = lessons.filter((b, i) => session || i > 0 || !start);
  if (listed.length) out.push(h('span', { class: 'ns-label' }, listed.length > 1 ? 'Next lessons' : 'Next lesson'), frameList(listed.map(b => {
    const nid = b.dataset.node, n = UI.C.nodes[nid];
    return { label: n.title, sub: framePlain(b.querySelector('.tiny')?.textContent || ''), txt: stepLabel(n) || '·', run: () => go('#/lesson/' + nid) };
  })));
  // your languages: one row each, its lanes in a sheet
  const rows = [...v.querySelectorAll('.lx-prodlanes .lx-lanerow[data-lang]')];
  const langItems = rows.map(row => {
    const c = row.dataset.lang, bs = [...row.querySelectorAll('button')]; bs.forEach(b => hold.append(b));
    const k = N.known(UI.C, UI.L, c), kn = Object.values(k.state).filter(s => ['known_r', 'known_p', 'mastered'].includes(s)).length;
    return { label: info(c).name, sub: kn ? `${kn} words known` : null, flag: info(c).flag, key: 'lang-' + c, run: () => frameSheet(`${info(c).flag} ${info(c).name}`, () => bs.map(b => frameAct(b))) };
  });
  const poly = [...v.querySelectorAll('.lx-polydrills button')], drills = [...v.querySelectorAll('.lx-drills button:not(summary)')];
  poly.forEach(b => hold.append(b)); drills.forEach(b => hold.append(b));
  if (poly.length) langItems.push({ label: 'Across your languages', sub: 'Compare, bridges, which language', icon: 'globe', key: 'across', run: () => frameSheet('Across your languages', () => poly.map(b => frameAct(b))) });
  if (drills.length) langItems.push({ label: 'Drills', sub: 'Principal parts, sorting fields', icon: 'gym', key: 'drills', run: () => frameSheet('Drills', () => drills.map(b => frameAct(b))) });
  if (langItems.length) out.push(h('span', { class: 'ns-label' }, 'Your languages'), frameList(langItems));
  // the map: the steps near you; the signs explained on demand
  const nodes = v.querySelector('.lx-nodes'), legend = v.querySelector('.lx-maplegend'), more = v.querySelector('.lx-mapmore');
  if (nodes) {
    out.push(h('span', { class: 'ns-label' }, 'The map'), nodes); if (more) out.push(more);
    if (legend) { const t = legend.textContent; legend.remove(); acts.push({ label: 'What the signs mean', icon: 'info', run: () => S.sheet('What the signs mean', body => body.append(h('p', {}, t))) }); }
  }
  // everything else of the older home waits, hidden (the grammar lane is in each language's sheet)
  for (const x of [...v.children]) if (!x.classList.contains('lx-moved')) hold.append(x);
  v.classList.add('lx-fhome');
  v.prepend(...out);
}
/** Today's languages, as switches in a sheet (the older chips do the work). */
function frameTodaySheet() {
  FS().sheet('Today’s languages', (body, close) => {
    const draw = () => {
      const chips = [...document.querySelectorAll('.lx-moved .lx-todaychip')];
      body.replaceChildren(h('p', { class: 'ns-muted' }, 'The languages of today’s session; tomorrow all of them again.'), frameList(chips.map(ch => ({ label: info(ch.dataset.lang).name, flag: info(ch.dataset.lang).flag,
        badge: ch.classList.contains('on') ? '✓' : null, run: () => { ch.click(); setTimeout(draw, 50); } }))));
    };
    draw();
  });
}
