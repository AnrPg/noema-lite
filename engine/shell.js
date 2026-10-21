/* =====================================================================================
   noema-lite — the shell: the frame every screen lives in (docs/UI_MAP.md).
   Phones: a top bar that hides while you read + bottom tabs. Wider screens: a left rail with "Me" at its foot.
   Tabs: Today · Knowledge (Roadmaps; the Shelf is a quiet link) · Languages (when chosen) · Discover · Progress.
   The shell owns the address (#/…): its own pages are drawn here; a subject's pages (#/subject, #/ch, #/s, …)
   are drawn by the engine (engine/src/*), which the loader starts for the current subject.
   Every action of the older screens has a home: the important ones on the page, the rest in ⋮ menus.
   ===================================================================================== */
window.NoemaShell = (() => {
  'use strict';
  const TH = () => window.NoemaThemes, ART = () => window.NoemaArt, N = () => window.Noema;
  const CU = () => window.NoemaCurriculum, CM = () => window.NoemaCurMap;
  const $ = s => document.querySelector(s);
  const DAY = 864e5;
  /* ---------- tiny DOM helper: text is always text (titles come from packs and other people) ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
  }
  const svg = (k, cls = 'i') => h('span', { class: 'ns-svg', html: ART() ? ART().svg(k, cls) : '' });
  const faceEl = (m = TH()?.current(), cls = '') => h('span', { class: 'ns-face ' + cls, 'aria-hidden': 'true', html: ART()?.mascot(m) || '' });
  const tone = n => ({ '--bgc': `var(--t${n})`, '--fgc': `var(--t${n}i)` });
  const ico = (k, n = 1) => h('span', { class: 'ns-ico', style: tone(n) }, svg(k));
  const icoTxt = (x, n = 1, cls = 'txt') => h('span', { class: 'ns-ico ' + cls, style: tone(n) }, x);
  const pill = (x, n = 1, cls = '') => h('span', { class: 'ns-pill ' + cls, style: tone(n) }, x);
  const bar = pct => h('div', { class: 'ns-bar' }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, pct || 0)) * 100) + '%' } }));
  const chev = () => h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›');
  function ring(pct, size, stroke) {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(1, pct || 0)));
    return h('span', { class: 'ns-ringsvg', html: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/><circle class="ns-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--acc)" stroke-width="${stroke}" stroke-linecap="round" style="--C:${C};stroke-dasharray:${C};stroke-dashoffset:${off}"/></svg>` });
  }

  /* ---------- words: i18n/shell/<locale>.arb ('sh.*', docs/i18n.md), with the tutor's name in the right form ---------- */
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const settings = () => { try { return JSON.parse(localStorage.getItem(`noema1:${acc()}:a:settings`) || '{}') || {}; } catch (e) { return {}; } };
  const uiPref = () => settings().lang;
  const lang = () => window.NoemaI18n ? NoemaI18n.lang(uiPref()) : 'en';
  function tv(m) { let t = TH()?.tutor(m); if (!t) { const n = window.NoemaI18n ? NoemaI18n.t('sh.tutorDefault', null, uiPref()) : 'Tutor'; t = { n, nom: n, acc: n, to: n }; } return { tutor: t.n, tutorAcc: t.acc, tutorTo: t.to, tutorNom: t.nom, Tutor: t.nom ? t.nom[0].toUpperCase() + t.nom.slice(1) : t.n }; }   // i18n-ignore (English only without the i18n runtime)
  const L = (k, v) => window.NoemaI18n ? NoemaI18n.t('sh.' + k, { ...tv(), ...(v || {}) }, uiPref()) : k;
  /** A sentence with some of its values in bold (names and titles stay text, never markup) */
  function rich(k, vals) { const names = Object.keys(vals), marks = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0001`])); return L(k, marks).split('\u0001').map((x, i) => i % 2 ? (vals[names[+x]]?.nodeType ? vals[names[+x]] : h('b', {}, vals[names[+x]])) : x); }   // a value that is an element goes in as it is
  const fmtDate = (t, o = { day: 'numeric', month: 'long' }) => { try { return window.NoemaI18n ? NoemaI18n.fmt.date(t, o) : new Date(t).toLocaleDateString(lang(), o); } catch (e) { return new Date(t).toDateString(); } };
  const today = () => new Date().toISOString().slice(0, 10);
  const toast = (m, ms) => (N()?.toast || (x => console.log(x)))(m, ms);

  /* ---------- the learner's state across subjects (read from storage; the engine owns the open subject) ---------- */
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const stateOf = sid => jget(`noema1:${acc()}:s:${sid}:state`, null);
  const recentKey = () => `noema1:${acc()}:meta:recent`;
  /** The places the learner was reading, newest first (written by the engine: noteRecent). Device-local. */
  const recent = () => (jget(recentKey(), []) || []).filter(r => r && r.subj);
  function noteRecent(r) {
    if (!acc() || !r?.subj) return;
    const list = recent().filter(x => x.subj !== r.subj);
    list.unshift({ ...r, at: Date.now() }); jset(recentKey(), list.slice(0, 12));
  }
  const dueCount = st => { const d = today(); let fc = 0, pb = 0; for (const r of Object.values(st?.fc || {})) if (r?.due && r.due <= d) fc++; for (const r of Object.values(st?.pb || {})) if (r?.due && r.due <= d) pb++; return { fc, pb }; };
  const wrongCount = st => Object.values(st?.res || {}).filter(r => r && r.last === false).length;
  let subjCache = null;
  async function subjects(force) { if (!subjCache || force) subjCache = await N().subjectsFor(acc()).catch(() => []); return subjCache; }
  const isLang = s => s && (s.kind === 'language' || String(s.id).startsWith('lang:'));

  /* ---------- the engine of the open subject (engine/src/40_views.js calls attachEngine) ---------- */
  let ENGINE = null;
  const ENGINE_ROUTES = new Set(['subject', 'ch', 's', 'practice', 'run', 'srun', 'boss', 'lightning', 'cards', 'drills', 'drill', 'mistakes', 'new', 'ex']);
  const subjectId = () => N()?.subject?.id || null;
  /** Open a subject (loads its pack: the page reloads) or, when it is open already, go to the place. */
  function open(subj, hash = '#/subject') {
    if (!subj) return;
    if (ENGINE && subj === subjectId()) { location.hash = hash; return; }
    N().switchTo(acc(), subj, hash);
  }

  /* ---------- languages: the languages branch registers its world here (docs/SHELF_AND_LANGUAGES.md) ---------- */
  const WORLDS = {};
  function registerWorld(id, provider) { WORLDS[id] = provider; if (mounted) { drawTabs(); route(); } }

  /* ======================= the frame ======================= */
  let mounted = false, chromeNow = {}, pendingEngine = false;
  const F = {};   // the frame's elements
  /** engine: a subject is loading (its pages are drawn once engine/engine.js has booted) */
  function mount({ engine = false } = {}) {
    if (mounted) return; mounted = true; pendingEngine = engine;
    TH()?.apply();
    document.body.classList.add('ns-on');
    F.land = h('div', { class: 'ns-land', 'aria-hidden': 'true' });
    F.pv = h('div', { class: 'ns-pvslot' });
    F.brand = h('button', { class: 'ns-brand', 'aria-label': L('today'), onclick: () => go('#/') });
    F.back = h('button', { class: 'ns-back', 'aria-label': L('back'), onclick: goBack }, '←');
    F.crumbs = h('nav', { class: 'ns-crumbs', 'aria-label': L('where') });
    F.acts = h('div', { class: 'ns-acts' });
    F.bellBadge = h('span', { class: 'bellbadge' });
    F.find = h('button', { class: 'ns-iconbtn ns-find', id: 'ns-find', title: L('sr_search'), 'aria-label': L('sr_search'), 'aria-keyshortcuts': '/', onclick: () => window.NoemaSearch?.quick(here()) }, svg('search'));   // 🔎 everything, everywhere (engine/search.js)
    F.peopleBadge = h('span', { class: 'bellbadge' });
    F.people = null;   // 👥 conversations, buddies, groups (engine/social.js): a tab of the side bar, with what waits there (drawTabs)
    F.bell = h('button', { class: 'ns-iconbtn bell', id: 'bellbtn', title: L('notifications'), 'aria-label': L('notifications'), onclick: openNotes }, svg('bell'), F.bellBadge);
    F.topMe = h('button', { class: 'ns-me acchip', id: 'ns-topme', title: L('me'), 'aria-label': L('meLong'), onclick: () => go('#/me') }, h('span', { class: 'ns-meemo' }), h('i', { class: 'syncdot', id: 'syncdot' }));
    F.top = h('header', { class: 'ns-top', id: 'ns-top' }, F.back, F.crumbs, F.acts, F.find, F.bell, F.topMe);
    F.share = h('div', { class: 'sharebar', role: 'status' });
    F.tabs = h('nav', { class: 'ns-tabs', 'aria-label': L('mainNav') });
    F.railMe = h('button', { class: 'ns-railme', 'data-pop': '1', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: e => { e.stopPropagation(); meMenu(F.railMe, true); } }, h('span', { class: 'ns-me' }, h('span', { class: 'ns-meemo' })), h('span', { class: 'ns-mename' }, L('me')));
    // "Me" (top right on phones) opens the same menu: Me · Settings · Help · My subjects — Switch account · Log out
    Object.assign(F.topMe.dataset, { pop: '1' }); F.topMe.setAttribute('aria-haspopup', 'menu'); F.topMe.setAttribute('aria-expanded', 'false');
    F.top.addEventListener('click', e => { if (e.target.closest('#ns-topme')) { e.stopPropagation(); meMenu(F.topMe); } }, true);
    F.main = document.querySelector('main') || h('main');
    F.main.id = 'ns-main';
    F.fab = h('button', { class: 'ns-fab full', id: 'ns-fab', onclick: () => chromeNow.tutor ? chromeNow.tutor() : ENGINE ? ENGINE.openTutor?.() : Promise.resolve(N().ensureEngine?.()).then(ok => ok ? ENGINE?.openTutor?.() : toast(L('needSubject'), 4000)) }, h('span', { class: 'ns-fabface breathe' }), h('span', { class: 'nm' }));
    F.fx = h('div', { class: 'ns-fx', id: 'ns-fx' });
    F.layer = h('div', { class: 'ns-layer', id: 'ns-layer' });
    document.body.prepend(F.land, F.pv, F.brand, F.top, F.share, F.tabs, F.railMe);
    if (!F.main.isConnected) document.body.append(F.main);
    document.body.append(F.fab, F.fx, F.layer);
    drawMe(); drawTabs(); paintCharacter(); wireNotes(); wireSocial(); wireSync(); wireScroll();
    TH()?.onChange((m, why) => { if (why === 'tick') { drawPreview(); return; } paintCharacter(m); if (ENGINE?.retheme) ENGINE.retheme(); if (!F.layer.querySelector('.ns-onb')) route(); });
    noteTrail();
    addEventListener('hashchange', () => { noteTrail(); route(); restoreScroll(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (closePops()) return; if (F.layer.firstChild && !F.layer.querySelector('[data-sticky]')) { F.layer.replaceChildren(); return; } }
      // / or Ctrl/⌘ K: search (not while typing, not over a window that must be answered)
      if ((e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey || (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) && !e.target.closest?.('input, textarea, select, [contenteditable="true"]') && !F.layer.querySelector('[data-sticky], .ns-modal') && window.NoemaSearch) { e.preventDefault(); NoemaSearch.quick(here()); }   // i18n-ignore (selector)
    });
    document.addEventListener('click', e => { if (!e.target.closest('.ns-pop, [data-pop]')) closePops(); }, true);
    route();
    maybeOnboard();
  }
  function paintCharacter(m = TH()?.current() || 'hedge') {   // m: the character being worn now (also while choosing one)
    const t = tv(m);
    if (ART()) { F.land.innerHTML = ART().land(m); F.brand.innerHTML = ART().mascot(m); F.fab.querySelector('.ns-fabface').innerHTML = ART().mascot(m); }
    F.fab.querySelector('.nm').textContent = t.tutor; F.fab.setAttribute('aria-label', L('askTutor')); F.fab.title = L('askTutor');
    drawPreview();
  }
  function drawMe() {
    const a = N()?.account || {}; const emo = a.emoji || (a.name || '?').trim()[0]?.toUpperCase() || '?';
    document.querySelectorAll('.ns-meemo').forEach(x => { x.textContent = emo; });
    document.querySelectorAll('.ns-mename').forEach(x => { x.textContent = a.name || L('me'); x.title = a.name || ''; });   // under the avatar: the account's name
  }
  function tabsList() {
    const w = TH()?.world() || 'know', t = [['today', '#/', svg('sun'), L('today')]];
    if (w !== 'lang') t.push(['learn', '#/learn', svg('path'), L('knowledge')]);
    if (w !== 'know') t.push(['lang', '#/lang', h('span', { class: 'ns-tx' }, '文A'), L('languages')]);   // i18n-ignore (文A: the Languages icon)
    t.push(['discover', '#/discover', svg('compass'), L('discover')]);
    // the vault and people are places of their own, not corners of Discover (people: cloud accounts only)
    t.push(['vault', '#/vault', svg('vault'), L('vault')]);
    if (social()) t.push(['people', '#/people', svg('community'), L('people')]);
    t.push(['progress', '#/progress', svg('star'), L('progress')]);
    return t;
  }
  function drawTabs() {
    const TIP = { vault: L('vaultSub'), people: L('peopleSub') };
    F.tabs.replaceChildren(...tabsList().map(([k, href, i, l]) => h('button', { class: 'ns-tab' + (k === 'people' ? ' bell ns-peoplebtn' : ''), id: k === 'people' ? 'ns-people' : null, title: TIP[k] || null, 'data-tab': k, onclick: () => go(href) },
      h('span', { class: 'i2' }, i), h('span', { class: 'lb' }, l), k === 'people' ? F.peopleBadge : null)));
    F.people = F.tabs.querySelector('#ns-people');
    F.tabs.style.setProperty('--n', F.tabs.children.length);
  }
  /** The top bar and tab of the page now showing. crumbs: [[label, href?], …] · back: href · menu: [{label, sub?, icon?, run, danger?}]
      · tutor: what the character button opens on this page (a language course: its own tutor) */
  function chrome(c = {}) {
    chromeNow = c;
    F.crumbs.replaceChildren(...(c.crumbs || []).flatMap(([l, href], i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, '›') : null, href ? h('button', { onclick: () => go(href) }, l) : h('b', {}, l)]).filter(Boolean));
    F.back.classList.toggle('on', !!c.back);
    F.acts.replaceChildren(...[...(c.acts || []), c.menu && (typeof c.menu === 'function' || c.menu.length) ? menuButton(c.menu, { label: c.menuLabel || L('more'), dot: !!c.menuDot }) : null].filter(Boolean));   // menu: a list, or a function that makes it when opened
    document.querySelectorAll('.ns-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === c.tab));
    F.railMe.classList.toggle('on', c.tab === 'me');
    F.fab.hidden = c.fab === false;   // the tutor is always there, whole and alive, with its name (it brings an engine along when needed)
    document.body.classList.toggle('ns-reading', !!c.reading);
    F.top.classList.remove('hide');
  }
  const go = hash => { if (location.hash === hash || (hash === '#/' && !location.hash)) route(); else location.hash = hash; };
  /* ← back: the screens of this tab in the order they were seen (sessionStorage), so ← returns to the screen the learner
     came from, whatever way led there. Every screen keeps its own stable address (shareable, reload-proof); the trail only
     remembers the way. With no trail (a shared link, a bookmark, a new tab) ← goes to the screen's parent. */
  const TRAIL = 'noema-trail', here0 = () => location.hash || '#/';
  const trailGet = () => { try { const t = JSON.parse(sessionStorage.getItem(TRAIL)); return Array.isArray(t) ? t : []; } catch (e) { return []; } };
  const trailPut = t => { try { sessionStorage.setItem(TRAIL, JSON.stringify(t.slice(-60))); } catch (e) { } };
  let backTo = null;   // the address ← (or the browser's back) is returning to: its scroll position comes back too
  function noteTrail() {
    const t = trailGet(), now = here0();
    if (t.length && t[t.length - 1].h === now) return;
    if (t.length > 1 && t[t.length - 2].h === now) { backTo = t.pop() && t[t.length - 1]; trailPut(t); return; }   // back, by ← or by the browser
    const top = t[t.length - 1];
    if (top && top.at > lastInput && Date.now() - top.at < 1500) t.pop();   // a screen that forwarded on its own (no click, no key): ← skips it
    else if (top) top.y = Math.round(scrollY);   // the screen being left (it has not been redrawn yet)
    backTo = null; t.push({ h: now, y: 0, at: Date.now() }); trailPut(t);
  }
  let lastInput = 0; ['pointerdown', 'keydown'].forEach(k => addEventListener(k, () => { lastInput = Date.now(); }, true));
  function restoreScroll() { const b = backTo; if (!b || !b.y) return; [60, 250].forEach(ms => setTimeout(() => { if (here0() === b.h && scrollY < 4) scrollTo({ top: b.y }); }, ms)); }
  /** The parent of an address when there is no trail: the screen's own idea of its parent, else one level up. */
  const parentOf = hash => chromeNow.back || (hash.replace(/\/[^/]*$/, '') || '#/');
  function goBack() { const t = trailGet(); go(t.length > 1 && t[t.length - 1].h === here0() ? t[t.length - 2].h : parentOf(here0())); }

  /* ---------- ⋮ menus and small pop-overs ---------- */
  function closePops() { const p = document.querySelectorAll('.ns-pop'); p.forEach(x => x.remove()); document.querySelectorAll('[data-pop][aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); return p.length > 0; }
  /** A ⋮ button with a list of actions. Items: { label, sub?, icon?, run, danger?, href? } or null (skipped) or '-' (a line). */
  /** dot: something in this menu waits for you (a small dot on ⋮) */
  function menuButton(items, { label = L('more'), cls = 'ns-iconbtn', content = null, down = true, dot = false } = {}) {
    const b = h('button', { class: cls + ' ns-menubtn' + (dot ? ' has-dot' : ''), 'data-pop': '1', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label, onclick: e => { e.stopPropagation(); const had = b.parentElement?.querySelector(':scope > .ns-pop'); closePops(); if (!had) popMenu(b, typeof items === 'function' ? items() : items, { down }); } }, content || svg('dots'), dot ? h('i', { class: 'ns-dot', 'aria-hidden': 'true' }) : null);
    return h('span', { class: 'ns-menu' }, b);
  }
  function popMenu(anchor, items, { down = true } = {}) {
    const list = (items || []).filter(Boolean);
    const pop = h('div', { class: 'ns-pop' + (down ? ' down' : ''), role: 'menu' }, ...list.map(it => it === '-' ? h('hr') : h('button', { role: 'menuitem', class: [it.danger ? 'danger' : '', it.cls || ''].join(' ').trim() || null, disabled: it.disabled || null, onclick: e => { e.stopPropagation(); closePops(); it.href ? go(it.href) : it.run?.(e); } },
      it.icon ? h('span', { class: 'mi' }, typeof it.icon === 'string' && it.icon.length > 2 && ART()?.I[it.icon] ? svg(it.icon) : it.icon) : null, h('span', { class: 'mt' }, it.label, it.sub ? h('small', {}, it.sub) : null), it.badge ? pill(it.badge, it.tone || 1) : null)));
    anchor.parentElement.append(pop); anchor.setAttribute('aria-expanded', 'true');
    // keep it on screen
    requestAnimationFrame(() => {
      const a = anchor.getBoundingClientRect(), r = pop.getBoundingClientRect();
      if (r.right > innerWidth - 8) pop.style.right = '0'; if (r.left < 8) { pop.style.left = '0'; pop.style.right = 'auto'; }
      if (!down) return;
      const below = innerHeight - a.bottom - 14, above = a.top - 70;   // up only when it does not fit below and there is more room above
      if (r.height > below && above > below) { pop.classList.add('up'); pop.style.maxHeight = above + 'px'; } else pop.style.maxHeight = Math.max(below, 220) + 'px';
    });
    pop.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    pop.addEventListener('keydown', e => { const bs = [...pop.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); } });
    return pop;
  }
  let tipT = 0;
  function tip(text) { F.layer.querySelector('.ns-tip')?.remove(); const parts = String(text).split(/(?<=[.!?;·])\s+(?=\S)/).filter(Boolean), t = h('div', { class: 'ns-tip', role: 'status', onclick: () => t.remove() }, ...(parts.length > 1 ? parts.map(x => h('p', {}, x)) : [text])); F.layer.append(t); clearTimeout(tipT); tipT = setTimeout(() => t.remove(), Math.max(5500, String(text).length * 70)); }   // a long hint reads as short lines, stays long enough to read, and goes on a tap
  const hint = text => h('button', { class: 'ns-hint', 'aria-label': L('whatIsThis'), title: L('whatIsThis'), onclick: e => { e.stopPropagation(); tip(text); } }, 'i');
  /** A sheet from the bottom (phones) / the right (wide screens). build(body, close) */
  function sheet(title, build, { cls = '' } = {}) {
    const close = () => { F.layer.replaceChildren(); };
    const body = h('div', { class: 'ns-shbody' });
    F.layer.replaceChildren(h('div', { class: 'ns-scrim', onclick: close }), h('aside', { class: 'ns-sheet ' + cls, role: 'dialog', 'aria-label': title },
      h('div', { class: 'ns-shhead' }, h('b', {}, title), h('button', { class: 'ns-iconbtn', 'aria-label': L('close'), onclick: close }, svg('close'))), body));
    build(body, close); N()?.plain?.watch(body); return close;
  }

  /* ---------- 🔔 notifications: shares, invitations, updates that wait for the learner ---------- */
  let later = new Set();
  function wireNotes() {
    const notes = N()?.notes; if (!notes) return;
    notes.on(list => {
      F.bellBadge.textContent = list.length || ''; F.bellBadge.style.display = list.length ? '' : 'none'; F.bell.classList.toggle('has', !!list.length);
      F.bell.setAttribute('aria-label', list.length ? L('notificationsN', { n: list.length }) : L('notifications'));
      drawShareBar(list);
    });
  }
  const accepted = s => { if (s.kind === 'curriculum') go('#/map/' + encodeURIComponent(s.curriculum)); else open(s.id); };
  function openNotes() {
    sheet(L('notifications'), body => {
      const draw = list => { body.replaceChildren(); if (!list.length) body.append(h('p', { class: 'ns-muted' }, N().account?.kind === 'cloud' ? L('nothingNew') : L('notesNeedCloud')));
        list.forEach(sh => body.append(N().shareRow(sh, { onAccepted: s => { F.layer.replaceChildren(); if (confirm(L('openNow', { title: s.title }))) accepted(s); } }))); };
      N().notes.on(list => { if (body.isConnected) draw(list); });
    });
  }
  function drawShareBar(list) {
    const bar = F.share, items = list.filter(x => !later.has(x.id)); bar.replaceChildren();
    bar.classList.toggle('on', !!items.length); if (!items.length) return;
    const sh = items[0], more = items.length > 1 ? h('span', { class: 'tiny' }, '  ' + L('moreInBell', { n: items.length - 1 })) : null;
    const laterBtn = h('button', { class: 'btn small ghost', title: L('decideLater'), onclick: () => { later.add(sh.id); drawShareBar(N().notes.pending); } }, L('later'));
    if (['curupdate', 'stepupdate', 'subjupdate'].includes(sh.kind)) {
      const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await N().notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toast(take ? L('upToDate', { title: sh.title }) : L('keepYours', { title: sh.title })); else b.disabled = false; } catch (er) { toast(er.message, 5000); b.disabled = false; } };
      bar.append(h('span', { class: 'grow' }, ...N().updateText(sh), more), h('button', { class: 'btn small primary', onclick: act(true) }, N().updateLabel(sh)), h('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? L('keepCopy') : L('keepMine')), laterBtn);
      return;
    }
    const cur = sh.kind === 'curriculum';
    const tB = h('b', {}, sh.title), mtT = window.NoemaMT ? NoemaMT.toggle(acc(), [NoemaMT.mark(tB, { language: sh.language || sh.meta?.language, kind: cur ? 'shared.roadmap' : 'shared.pack' })]) : null;   // 🌐 its title on request (the personal message is never sent)
    bar.append(h('span', { class: 'grow' }, svg(cur ? 'people' : 'bell'), ' ', ...rich(cur ? 'invitesYou' : 'wantsShare', { who: sh.from_name || sh.from_email || L('someone'), title: tB }), more, mtT ? ' ' : null, mtT),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await N().notes.accept(sh); toast(L(cur ? 'joinedToast' : 'addedToast', { title: s.title })); subjCache = null; if (confirm(L('openNow', { title: s.title }))) accepted(s); } catch (er) { toast(er.message, 5000); e.target.disabled = false; } } }, cur ? L('join') : L('accept')),
      h('button', { class: 'btn small', onclick: async () => { await N().notes.reject(sh).catch(er => toast(er.message)); } }, L('reject')), laterBtn);
  }
  /* ---------- 👥 people: the top bar's button and what waits there (cloud accounts) ---------- */
  function social() { return !!window.NoemaSocial && N()?.account?.kind === 'cloud' && !!window.NoemaCloud?.session?.(); }
  function wireSocial() {
    const S = window.NoemaSocial; if (!social()) return;
    drawTabs(); S.start();
    S.onChange(() => { const n = S.waiting(); F.peopleBadge.textContent = n || ''; F.peopleBadge.style.display = n ? '' : 'none'; F.people?.classList.toggle('has', !!n);
      F.people?.setAttribute('aria-label', n ? L('peopleN', { n }) : L('people')); });
  }
  /* ---------- the sync dot on "Me" (cloud accounts) ---------- */
  function wireSync() {
    const dot = F.topMe.querySelector('.syncdot'), C = window.NoemaCloud;
    if (N()?.account?.kind !== 'cloud' || !C?.onStatus) { dot.remove(); return; }
    const paint = s => { dot.className = 'syncdot ' + (s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok'); dot.title = s.error ? L('syncErr', { e: s.error }) : s.syncing ? L('syncing') : s.pending ? L('syncWait') : L('synced'); };
    C.onStatus(paint); paint(C.status());
  }
  /* ---------- phones: the top bar slides away while reading and comes back after a deliberate scroll up ---------- */
  function wireScroll() {
    let lastY = 0, upRun = 0, shownAt = 0;
    addEventListener('scroll', () => {
      if (innerWidth >= 760) return;
      const y = scrollY, d = y - lastY; lastY = y;
      if (d > 4 && y > 80) { upRun = 0; F.top.classList.add('hide'); }
      else if (d < 0) { upRun -= d; if (upRun > 60 && F.top.classList.contains('hide')) { F.top.classList.remove('hide'); shownAt = Date.now(); } }
      if (y < 10) F.top.classList.remove('hide');
    }, { passive: true });
    F.top.addEventListener('click', e => { if (Date.now() - shownAt < 300) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* ======================= routing ======================= */
  const PAGES = {};
  function route() {
    if (!mounted) return;
    closePops();
    const p = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0].split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });   // #/search?q=…: the page's own settings after ?
    const k = p[0] || '';
    // <html lang>: the subject's language on its own pages (its text), the menus' language everywhere else
    const docLang = l => { if (document.documentElement.lang !== l) document.documentElement.lang = l; };
    [F.top, F.tabs, F.fab, F.layer].forEach(e => { if (e) e.lang = lang(); });   // the frame itself always speaks the menus' language
    if (ENGINE_ROUTES.has(k)) {
      docLang(N()?.subject?.language || 'en');
      if (!ENGINE && pendingEngine) { chrome({ tab: 'learn', crumbs: [['…']] }); F.main.dataset.page = '@wait'; F.main.replaceChildren(h('div', { class: 'ns-view ns-wait' }, faceEl(undefined, 'breathe'))); return; }
      if (!ENGINE) { location.replace('#/'); return; }
      if (N()?.backgroundEngine) { N().backgroundEngine = false; N().setCurrent(acc(), subjectId()); }   // a quietly loaded subject you now study is the one a reload reopens
      chrome(subjectChrome());
      ENGINE.route();
      return;
    }
    docLang(lang());
    if (k === 'lang' && TH()?.world() === 'know') {   // a link to a course (#/lang/<course>…) shows the Languages tab too; the tab alone goes home
      if (p[1] && WORLDS.lang?.route) { TH().putSettings({ world: 'both' }); drawTabs(); } else { location.replace('#/'); return; }
    }
    if (k === 'learn' && TH()?.world() === 'lang') { location.replace('#/lang'); return; }
    if (F.main.dataset.page !== k) { F.main.replaceChildren(); }
    F.main.dataset.page = k;
    document.body.classList.remove('ns-mapmode');
    const page = PAGES[k] || PAGES[''];
    try { page(p.slice(1)); } catch (e) { console.error('[shell]', e); F.main.replaceChildren(h('div', { class: 'ns-view' }, h('p', {}, e.message))); }
    scrollTo({ top: 0 });
  }
  /** Draw a page into <main>: chrome + content. */
  function page(c, ...kids) {
    chrome(c);
    const v = h('div', { class: 'ns-view' + (c.cls ? ' ' + c.cls : '') }, ...kids);
    F.main.replaceChildren(v); delete F.main.dataset.engine;
    return v;
  }
  /** The default top bar of a subject's pages; the engine's views refine it (crumbs, ⋮). */
  function subjectChrome(extra = {}) {
    const s = N()?.subject || {}, node = N()?.node, c = node && CU()?.get(acc(), node.id);
    const crumbs = c ? [[shortTitle(c), '#/map/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(node.node)]] : [[L('shelf'), '#/shelf']];
    return { tab: isLang(s) ? 'lang' : 'learn', ...extra, crumbs: [...crumbs, [s.title || '…', extra.sub ? '#/subject' : null], ...(extra.crumbs || [])], back: extra.back ?? (c ? '#/map/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(node.node) : '#/shelf') };
  }
  const shortTitle = c => { const t = c.title || c.goal || ''; return t.length > 28 ? t.split(/[:—–(-]/)[0].trim().slice(0, 28) || t.slice(0, 28) : t; };

  /** Where the learner is now, for the search's "here": the open subject, a Roadmap, a language course (or nothing). */
  function here() {
    const p = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0].split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (ENGINE_ROUTES.has(p[0]) && N()?.subject?.id && !isLang(N().subject)) return { kind: 'subj', id: N().subject.id, title: N().subject.title };
    if (p[0] === 'map' && p[1]) { const c = CU()?.get(acc(), p[1]); if (c) return { kind: 'cur', id: c.id, title: shortTitle(c) }; }
    if (p[0] === 'lang' && p[1]) return { kind: 'course', id: p[1], title: window.NoemaLangUI?.titleOf?.(p[1]) || (window.NOEMA_REGISTRY?.languages || []).find(x => x.id === p[1])?.title || p[1] };
    if (p[0] === 'search') return window.NoemaSearch?.hereNow?.() || null;
    return null;
  }
  /* ---------- 🔎 the search page (#/search?q=…): engine/search.js draws it ---------- */
  PAGES.search = () => {
    if (!window.NoemaSearch) { page({ tab: null, crumbs: [[L('sr_search')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaSearch.page({ page, h, L, go, open, sheet, menuButton, faceEl, pill, svg, ico, chev, main: F.main });
  };

  /* ---------- 🗄️ the vault (#/vault?…): engine/vault.js draws it ---------- */
  PAGES.vault = () => {
    if (!window.NoemaVault) { page({ tab: 'vault', crumbs: [[L('vault')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaVault.page({ page, h, L, go, open, sheet, modal, menuButton, popMenu, faceEl, pill, svg, ico, chev });
  };

  /* ---------- 👥 people (#/people, #/chat/<room>, #/group/<room>, #/join/<code>): engine/social.js draws them ---------- */
  const socialCtx = () => ({ page, h, L, go, open, sheet, modal, chrome, menuButton, popMenu, faceEl, pill, svg, ico, icoTxt, chev, fitRow });
  for (const k of ['people', 'chat', 'group', 'join']) PAGES[k] = args => {
    if (!window.NoemaSocial) { page({ tab: 'people', crumbs: [[L('people')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaSocial.page(k, args || [], socialCtx());
  };

  /* ======================= pages ======================= */
  /* ---------- Today: where you left off, what is due, the day's goal ---------- */
  PAGES[''] = () => {
    const a = N().account || {}, st = N().stats, goal = settings().goal || 120, xp = st?.todayXP() || 0, hr = new Date().getHours();
    const hello = hr < 5 ? L('helloNight') : hr < 12 ? L('helloMorning') : hr < 18 ? L('helloDay') : L('helloEvening');
    const v = page({ tab: 'today', crumbs: [[L('today')]], menu: todayMenu() },
      h('div', { class: 'ns-hello' }, faceEl(undefined, 'breathe'), h('div', { class: 'grow' }, h('p', { class: 'tiny' }, fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })), h('h1', {}, `${hello}, ${a.name || ''}`)),
        h('div', { class: 'ns-goal', title: L('goalTitle', { xp, goal }) }, ring(xp / goal, 64, 7), h('div', { class: 'c' }, h('b', {}, xp), h('span', { class: 'tiny' }, '/' + goal)))));
    const box = h('div', { class: 'ns-stack' }); v.append(box);
    drawToday(box);
  };
  function todayMenu() {
    return [{ label: L('pickSubject'), icon: 'book', run: () => N().openSubjectPicker?.() }, { label: L('newRoadmap'), icon: 'map', run: () => CM()?.create(acc(), { onStudy }) },
      ENGINE ? { label: L('focusSprint'), sub: L('focusSprintSub'), icon: 'clock', run: () => ENGINE.focus?.() } : null, { label: L('switchProfile'), icon: 'user', run: () => N().openAccountPicker?.() }];
  }
  async function drawToday(box) {
    const subs = await subjects(true); const byId = Object.fromEntries(subs.map(s => [s.id, s]));
    const w = TH()?.world() || 'know', fits = s => w === 'both' || (w === 'lang') === isLang(s);
    let rec = recent().filter(r => byId[r.subj] && fits(byId[r.subj]));
    if (!rec.length && subjectId() && fits(N().subject)) rec = [{ subj: subjectId(), title: N().subject.title, emoji: N().subject.emoji }];
    box.replaceChildren();
    // the one big "continue"
    const r0 = rec[0];
    if (r0) {
      const s = byId[r0.subj] || {}, rm = r0.cid && CU()?.get(acc(), r0.cid);
      box.append(h('button', { class: 'ns-go', onclick: () => open(r0.subj, r0.sid ? '#/s/' + r0.sid : '#/subject') },
        h('span', { class: 'rm' }, s.emoji ? s.emoji + ' ' : svg(rm ? 'map' : 'book'), ' ', rm ? rm.title || rm.goal : s.title || r0.title),
        h('h2', {}, r0.secTitle || s.title || r0.title),
        h('span', { class: 'meta' }, r0.chNum ? pill(L('chOf', { n: r0.chNum, of: r0.chOf }), 2) : null, r0.secNum ? pill(L('secOf', { n: r0.secNum, of: r0.secOf }), 4) : !r0.sid ? pill(L('start'), 1) : null),
        rm && r0.node ? h('span', { class: 'step wide' }, L('stepIs', { step: rm.nodes?.[r0.node]?.title || r0.node })) : null,
        h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')));
    }
    // the language courses' own "continue" (docs/NEW_FRAME_AND_LANGUAGES.md); with nothing else to continue, the course you were in leads (lead: it draws only that, and says so)
    const langToday = w !== 'know' && WORLDS.lang?.today, n0 = box.children.length;
    const led = !r0 && langToday ? WORLDS.lang.today(box, { h, L, open, go, lead: true }) : false, langLed = led === true || (led === undefined && box.children.length > n0);
    if (!r0 && !langLed && !(w === 'lang' && langToday)) box.append(firstSteps());
    if (langToday && !langLed) WORLDS.lang.today(box, { h, L, open, go });
    // continue elsewhere
    const more = rec.slice(1, 4);
    if (more.length) box.append(h('div', {}, h('span', { class: 'ns-label' }, L('continueElsewhere')), h('div', { class: 'ns-list' }, ...more.map(r => { const s = byId[r.subj] || {};
      return h('button', { class: 'ns-item', onclick: () => open(r.subj, r.sid ? '#/s/' + r.sid : '#/subject') }, icoTxt(s.emoji || (s.title || r.title || '?').slice(0, 1), (s.title || '').length % 4 + 1, s.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, h('b', {}, s.title || r.title), h('small', {}, [r.chNum ? L('chOf', { n: r.chNum, of: r.chOf }) : null, r.at ? L('lastSeen', { when: ago(r.at) }) : null].filter(Boolean).join(' · '))), chev()); }))));
    // due today: review + mistakes, over every subject with progress
    let due = 0, dueFc = 0, duePb = 0, wrong = 0; const per = [];
    for (const s of subs) { if (!fits(s)) continue; const st = stateOf(s.id); if (!st) continue; const d = dueCount(st), wr = wrongCount(st); if (d.fc + d.pb + wr) per.push({ s, ...d, wr }); dueFc += d.fc; duePb += d.pb; wrong += wr; }
    due = dueFc + duePb;
    box.append(h('div', {}, h('span', { class: 'ns-label' }, L('forToday')), h('div', { class: 'ns-duo' },
      h('button', { class: 'ns-vcard', onclick: () => reviewGo('review', per) }, h('span', { class: 'top' }, ico('cards', 4), due ? pill(due, 4) : null), h('b', {}, L('review'), ' ', hint(L('reviewTip'))), h('small', {}, due ? L('reviewSub', { fc: dueFc, pb: duePb }) : L('reviewNone'))),
      h('button', { class: 'ns-vcard', onclick: () => reviewGo('gym', per) }, h('span', { class: 'top' }, ico('gym', 3), wrong ? pill(wrong, 3) : null), h('b', {}, L('gym'), ' ', hint(L('gymTip'))), h('small', {}, wrong ? L('gymSub', { n: wrong }) : L('gymNone'))))));
    // the streak, gently
    const sn = N().stats?.streakNow() || 0;
    box.append(h('button', { class: 'ns-cheer', onclick: () => go('#/progress') }, h('span', { class: 'lines' }, h('b', {}, sn ? L('streakDays', { n: sn }) : L('streakStart')), h('span', {}, sn && sn % 7 === 6 ? L('streakTomorrowWeek') : L('streakKeep'))), h('span', { class: 'more' }, L('progress') + ' ›')));
  }
  function firstSteps() {
    const curs = CU()?.list(acc()) || [];
    if (curs.length) { const c = curs[0], nx = CU().nextUp?.(acc(), c)?.[0];
      return h('button', { class: 'ns-go', onclick: () => go('#/map/' + encodeURIComponent(c.id) + (nx ? '/' + encodeURIComponent(nx) : '')) }, h('span', { class: 'rm' }, svg('map'), ' ', c.title || c.goal), h('h2', {}, nx ? c.nodes[nx]?.title : L('openMap')), h('span', { class: 'meta' }, pill(L('nextStep'), 2)), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')); }
    return h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('h2', {}, L('welcomeTitle')), h('p', { class: 'ns-muted' }, L('welcomeText')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => CM()?.create(acc(), { onStudy }) }, L('newRoadmap')), h('button', { class: 'btn', onclick: () => go('#/discover') }, L('discover')), h('button', { class: 'btn ghost', onclick: () => go('#/shelf') }, L('shelf'))));
  }
  const ago = t => { const d = Math.round((Date.now() - t) / DAY); return d <= 0 ? (window.NoemaI18n ? NoemaI18n.fmt.lower(L('today')) : L('today').toLowerCase()) : d === 1 ? L('yesterday') : L('daysAgo', { n: d }); };
  /** Review / mistakes live in each subject: one subject → go straight there; several → choose. */
  function reviewGo(kind, per) {
    const list = per.filter(x => kind === 'gym' ? x.wr : x.fc + x.pb);
    const dest = x => kind === 'gym' ? '#/mistakes' : x.fc ? '#/cards' : '#/drills';
    if (!list.length) { if (ENGINE) go(kind === 'gym' ? '#/mistakes' : '#/cards'); else tip(kind === 'gym' ? L('gymNone') : L('reviewNone')); return; }
    if (list.length === 1) { open(list[0].s.id, dest(list[0])); return; }
    sheet(kind === 'gym' ? L('gym') : L('review'), body => body.append(h('p', { class: 'ns-muted' }, L('pickWhere')), h('div', { class: 'ns-list' }, ...list.map(x => h('button', { class: 'ns-item', onclick: () => { F.layer.replaceChildren(); open(x.s.id, dest(x)); } }, icoTxt(x.s.emoji || (x.s.title || '?').trim()[0].toUpperCase(), 4, 'emo'), h('span', { class: 't' }, h('b', {}, x.s.title), h('small', {}, kind === 'gym' ? L('gymSub', { n: x.wr }) : L('reviewSub', { fc: x.fc, pb: x.pb }))), chev())))));
  }

  /* ---------- Knowledge: the Roadmaps (curricula), the Shelf below ---------- */
  const onStudy = (sid, nid) => open(sid);
  PAGES.learn = () => {
    const list = CU()?.list(acc()) || [];
    const v = page({ tab: 'learn', crumbs: [[L('knowledge')]], corner: true, menu: learnMenu() },
      h('h1', {}, L('knowledge')),
      h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('yourRoadmaps')), h('button', { class: 'btn small ghost ns-newrm', onclick: () => CM()?.create(acc(), { onStudy }) }, '+ ' + L('newRoadmap'))));
    const inv = h('div', { class: 'cm-invites' }); v.append(inv); drawInvites(inv);
    if (!list.length) v.append(h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('noRoadmaps')), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => CM()?.create(acc(), { onStudy }) }, L('newRoadmap')), h('button', { class: 'btn', onclick: () => CM()?.importMap(acc(), { onStudy }) }, L('importMap')), h('button', { class: 'btn ghost', onclick: () => CM()?.exploreCurricula?.(acc(), { onStudy }) }, L('exploreRoadmaps')))));
    v.append(...list.map((c, i) => roadmapCard(c, i)));
    const shelfLbl = h('span', {}, L('shelf')), shelfBtn = h('button', { class: 'ns-shelflink', onclick: () => go('#/shelf') }, svg('shelf'), ' ', shelfLbl);
    const nCol = window.NoemaSearch?.collections?.().length || 0;   // saved searches: a quiet link, only when there are some
    v.append(h('div', { class: 'ns-shelf' }, shelfBtn, nCol ? h('button', { class: 'ns-shelflink ns-collink', onclick: () => go('#/search') }, svg('search'), ' ', L('sr_collectionsN', { n: nCol })) : null));
    N().shelf?.(acc()).then(l => { shelfLbl.textContent = L('shelfN', { n: l.length }); }).catch(() => { });
    const off = CU()?.onChange?.(() => { if (v.isConnected && F.main.dataset.page === 'learn') { clearTimeout(PAGES.learn.t); PAGES.learn.t = setTimeout(() => { if (v.isConnected) PAGES.learn(); }, 300); } else off?.(); });
  };
  function learnMenu() {
    return [{ label: L('newRoadmap'), icon: 'plus', run: () => CM()?.create(acc(), { onStudy }) }, { label: L('importMap'), sub: L('importMapSub'), icon: 'download', run: () => CM()?.importMap(acc(), { onStudy }) },
      { label: L('exploreRoadmaps'), icon: 'globe', href: '#/explore' }, '-', { label: L('shelf'), icon: 'shelf', href: '#/shelf' }];
  }
  async function drawInvites(box) {
    if (N().account?.kind !== 'cloud' || !window.NoemaCurShare || !CM()?.inviteRow) return;
    const inv = await NoemaCurShare.invites().catch(() => []); if (!inv.length || !box.isConnected) return;
    box.replaceChildren(h('div', { class: 'nx-lbl' }, L('invitesN', { n: inv.length })), ...inv.map(i => CM().inviteRow(acc(), i, { onJoined: c => go('#/map/' + encodeURIComponent(c.id)), onDone: () => drawInvites(box) })));
  }
  function roadmapCard(c, i) {
    const ready = c.status === 'ready' || c.status === 'attach', s = c.status === 'ready' ? CU().summary(acc(), c) : null;
    const sh = c.shared && !c.shared.ended ? c.shared : null;
    const sub = s ? L('rmSummary', { m: s.mastered, n: s.total })
      : c.status === 'attach' ? L('rmAttach') : c.status === 'waiting' ? L('rmWaiting') : c.status === 'building' ? L('rmBuilding') : c.status === 'paused' ? L('rmPaused') : L('rmStopped');
    const openIt = () => ready ? go('#/map/' + encodeURIComponent(c.id)) : CM()?.progress(acc(), c, { onStudy });
    const canShare = !(c.shared?.role === 'member') && Object.keys(c.nodes || {}).length;
    const menu = menuButton([{ label: L('openMap'), icon: 'map', run: openIt },
      canShare ? { label: sh ? L('sharing') : L('share'), sub: L('shareRmSub'), icon: 'people', run: () => CM()?.shareCurriculum?.(acc(), c.id, { onDone: () => PAGES.learn() }) } : null,
      ready ? { label: L('rmSettings'), sub: L('rmSettingsSub'), icon: 'gear', run: () => { CM()?.mapOpts && (CM().mapOpts.next = { settings: true }); go('#/map/' + encodeURIComponent(c.id)); } } : null,
      { label: L('exportJson'), icon: 'download', run: () => { const b = new Blob([JSON.stringify(CU().get(acc(), c.id), null, 1)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: `curriculum-${c.id}.json` }); document.body.append(a); a.click(); a.remove(); } }], { label: L('moreFor', { title: c.title || c.goal }) });
    return h('div', { class: 'ns-rmwrap cm-cardwrap' }, h('button', { class: 'ns-rmcard cm-card', style: { animationDelay: i * 40 + 'ms' }, onclick: openIt },
      h('div', { class: 'row nowrap' }, sh ? ico('people', (i % 4) + 1) : c.emoji ? icoTxt(c.emoji, (i % 4) + 1, 'emo') : ico('map', (i % 4) + 1), h('div', { class: 'grow' }, h('b', { class: 'ttl' }, c.title || c.goal), h('small', { class: 'ns-muted' }, sh ? (sh.role === 'member' ? L('sharedBy', { who: sh.ownerName || '…' }) + ' · ' : L('youShare') + ' · ') : '', sub)), chev()),
      s ? bar(s.mastered / Math.max(1, s.total)) : null), menu);
  }

  /* ---------- the Shelf: subjects that teach no step of any Roadmap ---------- */
  PAGES.shelf = async () => {
    const v = page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [L('shelf')]], back: '#/learn', corner: true, menu: shelfMenu() },
      h('div', {}, h('span', { class: 'ns-label' }, L('shelf'), ' ', hint(L('shelfTip'))), h('h1', {}, L('shelfTitle'))));
    const q = h('input', { class: 'noema-input ns-search', type: 'search', placeholder: L('searchSubjects'), 'aria-label': L('searchSubjects'), oninput: () => draw() });
    const listBox = h('div', { class: 'ns-list ns-shelflist' });
    v.append(q, listBox);
    let list = (await N().shelf(acc()).catch(() => [])).filter(s => !isLang(s));
    q.hidden = list.length < 8;
    const hidden = (await subjects(true)).filter(s => s.hidden).length;
    if (hidden) v.append(h('button', { class: 'ns-shelflink', onclick: () => go('#/subjects') }, svg('eye'), ' ', L('hiddenN', { n: hidden })));
    function draw() {
      const term = q.value.trim().toLowerCase(), items = list.filter(s => !term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term));
      listBox.replaceChildren(...items.map((s, i) => shelfItem(s, i, async () => { list = (await N().shelf(acc()).catch(() => [])).filter(x => !isLang(x)); draw(); })));
      if (!items.length) listBox.replaceChildren(h('div', { class: 'ns-item ns-muted' }, list.length ? L('noMatch') : L('shelfEmpty')));
    }
    draw();
  };
  function shelfMenu() {
    return [CM()?.fromSources ? { label: L('fromSources'), sub: L('fromSourcesSub'), icon: 'upload', run: () => CM().fromSources(acc(), { onStudy }) } : null, { label: L('importFile'), sub: L('importFileSub'), icon: 'upload', run: importFile }, { label: L('createClaude'), sub: L('createClaudeSub'), icon: 'spark', run: () => N().claudeGuide({ onDone: s => landedOpen(s) }) },
      { label: L('exploreShared'), icon: 'globe', href: '#/explore/subjects' }, { label: L('allSubjects'), sub: L('allSubjectsSub'), icon: 'book', run: () => N().openSubjectPicker?.() }];
  }
  function shelfItem(s, i, refresh) {
    const pct = Math.round(subjectPct(s) * 100);
    const menu = menuButton(subjectMenu(s, refresh), { label: L('moreFor', { title: s.title }) });
    return h('div', { class: 'ns-itemwrap noema-chipwrap' }, h('button', { class: 'ns-item ns-subj', 'data-subject': s.id, style: { animationDelay: i * 25 + 'ms' }, title: s.description || '', onclick: () => open(s.id) }, icoTxt(s.emoji || (s.title || '?').trim()[0].toUpperCase(), (i % 4) + 1, 'emo'),
      h('span', { class: 't' }, h('b', {}, s.title, N().langTag?.(s) || '', N().bridgeTag?.(s) || '', s.updateAvailable ? h('span', { class: 'ns-upd', title: L('updateWaiting') }, ' ', svg('spark')) : ''), h('small', {}, [s.counts?.chapters ? L('nChapters', { n: s.counts.chapters }) : null, s.sharedBy ? L('sharedBy', { who: s.sharedBy }) : s.publicOwner ? L('from', { who: s.publicOwner }) : s.origin === 'private' ? L('privateSubj') : null].filter(Boolean).join(' · '))),
      pct ? pill(pct + '%', 2) : chev()), menu);
  }
  /** A subject's ⋮: study, put it on a Roadmap, edit, share, export the package (with its source files); hide: also hide / show it */
  function subjectMenu(s, refresh, { hide = false } = {}) {
    const own = s.origin !== 'library', hidden = (settings().hiddenSubjects || []).includes(s.id);
    return [{ label: L('study'), icon: 'play', run: () => open(s.id) },
      CM()?.attachDialog ? { label: L('putOnMap'), sub: L('putOnMapSub'), icon: 'map', run: () => CM().attachDialog(acc(), { subject: s, onDone: refresh }) } : null,
      { label: L('editSubject'), sub: L('editSubjectSub'), icon: 'edit', run: () => N().editSubject(s, { onChange: refresh }) },
      own ? { label: L('shareSubject'), sub: L('shareSubjectSub'), icon: 'share', run: () => N().share(s) } : null,
      { label: L('exportPackage'), sub: L('exportPackageSub'), icon: 'download', run: async () => { try { const p = await N().loadSubject(acc(), s.id); await N().exportPackage(acc(), p); } catch (e) { toast(e.message, 4000); } } },
      hide ? { label: L(hidden ? 'subjShow' : 'subjHide'), icon: 'eye', run: () => { const l = new Set(settings().hiddenSubjects || []); hidden ? l.delete(s.id) : l.add(s.id); TH().putSettings({ hiddenSubjects: [...l] }); subjCache = null; refresh(); } } : null];
  }
  const subjectPct = s => { const st = stateOf(s.id); if (!st || !s.counts?.exercises) return 0; return Math.min(1, Object.values(st.res || {}).filter(r => r.ok > 0).length / s.counts.exercises); };
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.zip,.json,.noemapack', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; inp.remove(); if (!f) return; try { const s = await N().importPackFile(acc(), f); landedOpen(s); } catch (er) { toast(er.message, 4000); } } });
    document.body.append(inp); inp.click();
  }
  function landedOpen(s) { if (!s) return; subjCache = null; toast(L('onShelfNow', { title: s.title || s.id }), 5000); open(s.id); }

  /* ---------- a Roadmap: the treasure map (engine/curmap.js draws it, here as a page) ---------- */
  PAGES.map = ([cid, nid]) => {
    const c = CU()?.get(acc(), cid);
    if (!c || !CM()) { page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn']], back: '#/learn' }, h('p', { class: 'ns-muted' }, L('rmMissing'))); return; }
    const host = h('div', { class: 'ns-maphost' });
    page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [shortTitle(c)]], back: '#/learn', cls: 'ns-mapview' }, host);
    document.body.classList.add('ns-mapmode');
    const opts = CM().mapOpts?.next || {}; if (CM().mapOpts) CM().mapOpts.next = null;
    CM().map(acc(), cid, { focus: nid || null, onStudy, page: host, chrome: (m, extra = {}) => chrome({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [shortTitle(CU().get(acc(), cid) || c)]], back: '#/learn', menu: m, menuLabel: L('mapMenu'), ...extra }), ...opts });
  };

  /* ---------- Languages (the languages branch registers them; otherwise: language subjects you have) ---------- */
  PAGES.lang = async (args = []) => {
    const W = WORLDS.lang;
    // #/lang/<course>/… : a course drawn inside the frame by the languages branch (docs/NEW_FRAME_AND_LANGUAGES.md)
    if (args.length && args[0] && W?.route) { W.route(args, { page: (c, ...kids) => page({ tab: 'lang', back: '#/lang', ...c }, ...kids), chrome: c => chrome({ tab: 'lang', back: '#/lang', ...c }), main: F.main, h, L, open, go, sheet, menuButton, faceEl }); return; }
    const v = page({ tab: 'lang', crumbs: [[L('languages')]], corner: true, menu: W?.menu?.() || null },
      h('h1', {}, L('languages')), h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('yourLanguages')), W?.create ? h('button', { class: 'btn small ghost', onclick: () => W.create() }, '+ ' + L('newLanguage')) : null));
    if (W?.page) { W.page(v, { h, open, L }); return; }
    const langs = (await subjects(true)).filter(isLang);
    v.append(langs.length ? h('div', { class: 'ns-list' }, ...langs.map((s, i) => h('button', { class: 'ns-item', onclick: () => open(s.id) }, icoTxt(s.emoji || '文', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, s.title), h('small', {}, s.description || '')), chev())))
      : h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('noLanguages'))));
  };

  /* ---------- Explore: what others share (Roadmaps, or subjects), in one closed section per domain; searching shows only the matches ---------- */
  PAGES.explore = async ([kind] = []) => {
    const rm = kind !== 'subjects', title = L(rm ? 'exploreRoadmaps' : 'exploreShared');
    const v = page({ tab: 'discover', crumbs: [[L('discover'), '#/discover'], [title]], back: '#/discover', corner: true },
      h('div', {}, h('h1', {}, title), h('p', { class: 'ns-muted' }, L(rm ? 'exploreRoadmapsLead' : 'exploreLead'))));
    const q = h('input', { class: 'noema-input ns-search', type: 'search', placeholder: L(rm ? 'searchRoadmaps' : 'searchSubjects'), 'aria-label': L(rm ? 'searchRoadmaps' : 'searchSubjects') });
    const body = h('div', { class: 'ns-exp' }, h('p', { class: 'ns-muted' }, L('loading')));
    v.append(q, body);
    let items = [], studyIt = null;
    try {
      if (rm) items = await CM().publicRoadmaps(acc());
      else { const r = await N().publicSubjects(); items = r.all; studyIt = r.study; }
    } catch (e) { body.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, L('exploreOffline')), h('p', { class: 'ns-muted' }, e.message))); q.hidden = true; return; }
    const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (er) { toast(er.message, 5000); } b.disabled = false; };
    const mtK = rm ? 'explore.roadmap' : 'explore.pack';   // 🌐 shared texts, translatable on request (engine/mt.js, docs/i18n.md §11)
    const mtN = (n, x) => window.NoemaMT ? NoemaMT.mark(n, { language: x.language || x.meta?.language, kind: mtK }) : n;
    // the person who shares it: a quiet button to their page (#/u/<id>), next to the row
    const who = (row, x) => x.owner ? h('div', { class: 'ns-itemwrap noema-chipwrap' }, row, h('span', { class: 'ns-menu' }, tipped(h('button', { class: 'ns-iconbtn ns-who', 'aria-label': L('pfOpen', { who: x.owner_name || '…' }), onclick: () => go('#/u/' + encodeURIComponent(x.owner)) }, svg('user')), L('pfOpen', { who: x.owner_name || '…' })))) : row;
    const mk = (x, i) => who(rm
      ? h('button', { class: 'ns-item ns-pubitem', 'data-id': x.id, onclick: e => busy(e.currentTarget, () => CM().openPublic(acc(), x, { onOpen: id => go('#/map/' + encodeURIComponent(id)) })) },
        ico('map', (i % 4) + 1), h('span', { class: 't' }, mtN(h('b', {}, x.title), x), h('small', {}, x.description ? mtN(h('span', {}, x.description), x) : null, x.description ? ' · ' : null, L('rmPubMeta', { who: x.owner_name || '…', n: x.steps, p: x.prepared }))),
        h('span', { class: 'ns-pill' }, L(x.have ? (x.own ? 'rmYours' : 'rmJoined') : 'rmJoin')))
      : h('button', { class: 'ns-item ns-pubitem', 'data-id': x.id, onclick: e => busy(e.currentTarget, () => studyIt(x, s => open(s.id))) },
        icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, mtN(h('b', {}, x.title), x), N().langTag?.(x) || '', x.description ? mtN(h('small', {}, x.description), x) : null), chev()), x);
    if (!items.length) { q.hidden = true; body.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L(rm ? 'noPublicRoadmaps' : 'noPublicSubjects')))); return; }
    const DOMS = CU()?.DOMAINS || ['other'];
    const sections = h('div', { class: 'ns-doms' }, ...DOMS.map(d => [d, items.filter(x => (x.domain || 'other') === d)]).filter(([, l]) => l.length).map(([d, l]) =>
      h('details', { class: 'ns-dom', 'data-dom': d }, h('summary', {}, h('span', { class: 'ns-domt' }, L('dom_' + d)), h('span', { class: 'ns-pill' }, String(l.length)), h('span', { class: 'ns-domchev', 'aria-hidden': 'true' }, '›')),
        h('div', { class: 'ns-list' }, ...l.map(mk)))));
    const results = h('div', { class: 'ns-list ns-results', hidden: true });
    body.replaceChildren(...[window.NoemaMT?.bar(acc(), body)].filter(Boolean), sections, results);
    // searching (the field has the focus, or something is typed): only the matches, or nothing; the sections come back when the field is left empty
    let focused = false;
    const show = () => { const t = q.value.trim(); sections.hidden = focused || !!t; results.hidden = !t; };
    q.addEventListener('input', () => {
      const t = q.value.trim().toLowerCase(), hit = items.filter(x => [x.title, x.description, x.owner_name].join(' ').toLowerCase().includes(t));
      results.replaceChildren(...(hit.length ? hit.map(mk) : [h('div', { class: 'ns-item ns-muted ns-noresults' }, L('noResults'))])); show();
    });
    q.addEventListener('focus', () => { focused = true; show(); }); q.addEventListener('blur', () => { focused = false; show(); });
  };

  /* ---------- Discover: everything that adds something new ---------- */
  PAGES.discover = () => {
    const w = TH()?.world() || 'know', item = (ic, n, title, sub, run, cls = '') => h('button', { class: 'ns-item ' + cls, onclick: run }, typeof ic === 'string' ? ico(ic, n) : ic, h('span', { class: 't' }, h('b', {}, title), h('small', {}, sub)), chev());
    page({ tab: 'discover', crumbs: [[L('discover')]], corner: true },
      h('h1', {}, L('discover')),
      h('div', { class: 'ns-list' },
        item('search', 4, L('exploreShared'), w === 'lang' ? L('exploreLangSub') : L('exploreSub'), () => go('#/explore/subjects'), 'ns-explore'),
        w !== 'lang' ? item('people', 2, L('exploreRoadmaps'), L('exploreRoadmapsSub'), () => go('#/explore'), 'ns-explorerm') : null,
        w !== 'lang' && CM()?.fromSources ? item('upload', 3, L('fromSources'), L('fromSourcesSub'), () => CM().fromSources(acc(), { onStudy }), 'ns-fromsrc') : null,
        w !== 'lang' ? item('map', 1, L('newRoadmap'), L('newRoadmapSub'), () => CM()?.create(acc(), { onStudy }), 'ns-create') : null,
        w !== 'lang' ? item('spark', 2, L('createClaude'), L('createClaudeSub'), () => N().claudeGuide({ onDone: s => landedOpen(s) })) : null,
        w !== 'know' && WORLDS.lang?.create ? item(icoTxt('文A', 3), 3, L('newLanguage'), L('newLanguageSub'), () => WORLDS.lang.create()) : null,
        item('upload', 1, L('importFile'), L('importFileSub'), importFile),
        w !== 'lang' ? item('download', 4, L('importMap'), L('importMapSub'), () => CM()?.importMap(acc(), { onStudy })) : null),
      h('span', { class: 'ns-label' }, L('withClaude')),
      h('div', { class: 'ns-list' },
        item('chat', 4, L('claudeApp'), L('claudeAppSub'), () => N().claudeSetupView?.(acc(), { open: 'B' })),
        item('key', 2, L('claudeKey'), L('claudeKeySub'), () => go('#/me/ai'))));
  };

  /* ---------- Progress: level, streak, the collection, the week, treasures found ---------- */
  const LEVEL = xp => { let lv = 1, need = 100, left = xp; while (left >= need) { left -= need; lv++; need = Math.round(need * 1.18 / 10) * 10; } return { lv, into: left, need }; };
  PAGES.progress = async () => {
    const m = TH()?.current() || 'hedge', tx = TH()?.text(m) || {}, st = N().stats?.get() || { xp: 0, xpDay: {} }, sn = N().stats?.streakNow() || 0, lv = LEVEL(st.xp || 0);
    const v = page({ tab: 'progress', crumbs: [[L('progress')]], corner: true }, h('h1', {}, L('yourProgress')));
    v.append(h('section', { class: 'ns-panel ns-level' }, h('div', { class: 'ns-ringwrap' }, ring(lv.into / lv.need, 132, 11), h('div', { class: 'ringc' }, h('span', { class: 'tiny' }, L('level')), h('b', {}, lv.lv))),
      h('div', { class: 'grow' }, h('span', { class: 'ns-label' }, tx.place || ''), h('h2', {}, L('xpToLevel', { n: lv.need - lv.into, lv: lv.lv + 1 })), h('p', { class: 'ns-muted' }, L('xpTotal', { xp: st.xp || 0 })))));
    // the week as stepping stones; the 7th holds a small chest
    const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * DAY); return { k: d.toISOString().slice(0, 10), l: fmtDate(d, { weekday: 'narrow' }) }; });
    const stones = [[40, 90], [110, 70], [180, 84], [250, 62], [320, 78], [390, 58], [460, 72]];
    const did = days.map(d => (st.xpDay || {})[d.k] > 0);
    const trail = `<svg class="ns-trail" viewBox="0 0 500 130" role="img" aria-label="${L('trailAria', { n: did.filter(Boolean).length }).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';')}"><path d="M40 90 Q75 60 110 70 T180 84 T250 62 T320 78 T390 58 T460 72" fill="none" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="3 7" opacity=".6"/>`
      + stones.map(([x, y], i) => did[i] ? `<ellipse cx="${x}" cy="${y}" rx="20" ry="9" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/>` : `<ellipse cx="${x}" cy="${y}" rx="20" ry="9" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 4"/>`).join('')
      + `<rect x="447" y="42" width="26" height="18" rx="4" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/><path d="M447 50 h26" stroke="var(--t2i)" stroke-width="1.5"/>`
      + days.map((d, i) => `<text x="${stones[i][0]}" y="${stones[i][1] + 28}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink3)">${d.l}</text>`).join('')
      + `<g transform="translate(${Math.max(0, did.lastIndexOf(true)) * 70 + 4} -8)"><g class="breathe">${ART()?.mascot(m, 64, 59) || ''}</g></g></svg>`;
    v.append(h('section', { class: 'ns-panel center' }, h('h2', {}, sn ? L('streakDays', { n: sn }) : L('streakStart')), h('p', { class: 'ns-muted' }, sn ? L('streakKeep') : L('streakStartSub')), h('div', { html: trail })));
    // the collection: one item per chapter you have completed (every section read); this week's shine
    const subs = await subjects();
    let done = 0, fcN = 0, boss = 0; for (const s of subs) { const x = stateOf(s.id); if (!x) continue; done += chaptersDone(s, x); fcN += Object.keys(x.fc || {}).length; boss += Object.keys(x.boss || {}).length; }
    const wk = weekKey(), cw = jget(`noema1:${acc()}:meta:collweekch`, null); const base = cw?.week === wk ? cw.base : done; if (!cw || cw.week !== wk) jset(`noema1:${acc()}:meta:collweekch`, { week: wk, base: done });
    const fresh = Math.max(0, done - base);
    v.append(h('section', { class: 'ns-panel' }, h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, tx.coll || ''), pill(L('nChapters', { n: done }), 1)),
      h('div', { class: 'ns-coll', html: `<svg viewBox="0 0 300 230" role="img" aria-label="${(tx.coll || '').replace(/"/g, '')}: ${done}">${ART()?.collection(m, done, fresh) || ''}</svg>` }),
      h('p', { class: 'tiny center' }, L('collNote', { item: tx.item || '', n: fresh }))));
    // the week's XP
    const max = Math.max(settings().goal || 120, ...days.map(d => (st.xpDay || {})[d.k] || 0)), wsum = days.reduce((a, d) => a + ((st.xpDay || {})[d.k] || 0), 0);
    v.append(h('section', { class: 'ns-panel' }, h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('xpWeek')), pill(wsum, 1)),
      h('div', { class: 'ns-bars' }, ...days.map((d, i) => h('div', {}, h('i', { class: i === 6 ? 'today' : '', style: { height: (((st.xpDay || {})[d.k] || 0) / max * 100) + '%', '--i': i } }), h('span', {}, d.l))))));
    // treasures found (medals)
    const MED = medals({ fcN, sn, boss, xp: st.xp || 0 });
    v.append(h('section', { class: 'ns-panel' }, h('span', { class: 'ns-label' }, L('treasures')), medalsEl(MED)));
    v.append(h('p', { class: 'tiny' }, L('gameNote'), ' ', h('button', { class: 'linkish', onclick: () => go('#/me/look') }, L('look'))));
    rememberMedals(MED.filter(x => x[0]).length);
  };
  /** The treasures (medals): [[found, key, mark, words, tone]] — the Progress tab and the page others see (only the keys of the found ones travel) */
  function medals({ fcN = 0, sn = 0, boss = 0, xp = 0 } = {}) {
    const mastered = (CU()?.list(acc()) || []).reduce((a, c) => a + (c.status === 'ready' ? CU().summary(acc(), c).mastered : 0), 0);
    return [[mastered >= 1, 'step', '1', L('medalStep'), 1], [fcN >= 100, 'cards', '100', L('medalCards', { n: Math.min(fcN, 100) }), 4], [sn >= 7, 'week', '7', L('medalWeek', { n: Math.min(sn, 7) }), 2], [boss >= 1, 'boss', svg('crown'), L('medalBoss'), 3], [xp >= 1000, 'xp', '1k', L('medalXp'), 1], [sn >= 30, 'month', '30', L('medalMonth', { n: Math.min(sn, 30) }), 2]];
  }
  const medalsEl = MED => h('div', { class: 'ns-medals' }, ...MED.map(([ok, , x, l, n]) => h('div', { class: 'ns-medal' + (ok ? '' : ' lock') }, h('div', { class: 'm', style: ok ? tone(n) : null }, x), h('small', {}, l))));
  /** chapters of a subject with every section read (section ids are chNN-sNN); when the subject does not say how many
      sections its chapters have, a chapter whose test is beaten counts */
  function chaptersDone(s, x) {
    const read = {}; Object.keys(x.read || {}).forEach(id => { const c = String(id).split('-s')[0]; read[c] = (read[c] || 0) + 1; });
    const chs = s.chapters || s.meta?.chapters || [];
    if (!chs.length) return Object.keys(x.boss || {}).filter(c => x.boss[c]).length;
    return chs.filter(c => { const id = c.id || 'ch' + String(c.num).padStart(2, '0'), n = typeof c.sections === 'number' ? c.sections : (c.sections || []).length; return n > 0 && (read[id] || 0) >= n; }).length;
  }
  const weekKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  function rememberMedals(n) { const k = `noema1:${acc()}:meta:medals`, was = jget(k, null); jset(k, n); if (was != null && n > was) window.NoemaReact?.big('medal'); }

  /* ---------- Me ▾: a menu — Me (the page others see) · Settings · Help · My subjects — Switch account · Log out ---------- */
  function meMenu(anchor, rail = false) {
    const had = document.querySelector('.ns-pop.ns-mepop'); closePops(); if (had) return;
    const pop = popMenu(anchor, [
      { label: L('me'), sub: L('menuMeSub'), icon: 'user', href: '#/profile' },
      { label: L('settings'), sub: L('settingsSub'), icon: 'gear', href: '#/me' },
      { label: L('help'), sub: L('helpSub'), icon: 'help', href: '#/help' },
      { label: L('mySubjects'), sub: L('subjectsSub'), icon: 'book', href: '#/subjects' },
      '-',
      { label: L('switchAccount'), icon: 'people', run: () => N().openAccountPicker?.() },
      { label: L('logOut'), icon: 'logout', run: logOut }], { down: !rail });
    // on <body>, fixed under "Me" (top right) or above it (the rail's foot), so no bar clips it
    pop.classList.add('ns-mepop'); document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    Object.assign(pop.style, rail ? { left: r.left + 'px', right: 'auto', top: 'auto', bottom: (innerHeight - r.top + 6) + 'px', maxHeight: (r.top - 14) + 'px' }
      : { right: Math.max(8, innerWidth - r.right) + 'px', left: 'auto', top: (r.bottom + 6) + 'px', bottom: 'auto', maxHeight: (innerHeight - r.bottom - 14) + 'px' });
  }
  /** Log out: a cloud account sends what is waiting and signs out; then the list of profiles opens (even when there is only one) */
  async function logOut() {
    const a = N()?.account || {}, C = window.NoemaCloud;
    if (a.kind === 'cloud') { if (!confirm(L('logOutQ', { name: a.name || a.email || '' }))) return; await C?.push(a.id).catch(() => { }); await C?.signOut().catch(() => { }); }
    jset('noema1:current', { loggedOut: true });
    history.replaceState(null, '', location.pathname); location.reload();
  }

  /* ---------- Settings (#/me): the character, the account, AI, appearance, conversations, data ---------- */
  const ME_VIEWS = { profile: 'profile', ai: 'settings', subjects: 'subjects', backup: 'backup', cloud: 'cloud', help: 'help', data: 'cloud' };
  PAGES.me = ([sec]) => {
    if (sec === 'look') return lookPage();
    if (sec === 'subjects' || sec === 'help') return location.replace('#/' + sec);   // their own places since 2026-10-11 (Me ▾)
    if (sec && ME_VIEWS[sec]) return mePage(sec);
    const a = N().account || {}, m = TH()?.current(), t = tv(m), trying = !!TH()?.preview();
    const changeAt = TH()?.nextChangeAt(), can = TH()?.canChange();
    const it = (icon, n, title, sub, run, extra = {}) => h('button', { class: 'ns-item', onclick: run, ...extra }, icon, h('span', { class: 't' }, h('b', {}, title), sub ? h('small', {}, sub) : null), chev());
    const w = TH()?.world() || 'know';
    page({ tab: 'me', crumbs: [[L('settings')]] },
      h('div', { class: 'ns-hello' }, avatarEl(a, myPage().avatar, 'big'), h('div', { class: 'grow' }, h('h1', {}, L('settings')), h('p', { class: 'tiny' }, [a.name, a.kind === 'cloud' ? (a.email || '') : L('localProfile')].filter(Boolean).join(' · ')))),
      h('section', { class: 'ns-panel' }, h('span', { class: 'ns-label' }, L('whatILearn')), h('p', { class: 'tiny' }, L('whatILearnSub')),
        h('div', { class: 'ns-seg', role: 'radiogroup', 'aria-label': L('whatILearn') }, ...[['know', L('knowledge')], ['lang', L('languages')], ['both', L('both')]].map(([k, l]) => h('button', { class: w === k ? 'on' : '', role: 'radio', 'aria-checked': String(w === k), onclick: () => { TH().putSettings({ world: k }); drawTabs(); PAGES.me([]); } }, l)))),
      h('div', { class: 'ns-list' },
        it(h('span', { class: 'ns-ico face', style: tone(2) }, faceEl(m)), 2, L('character'), TH()?.locked() ? L('charLocked', { tutor: t.tutor }) : trying ? L('tryingNow') : `${t.tutor} · ${can ? L('canChange') : L('nextChange', { date: fmtDate(changeAt) })}`, () => go('#/character')),
        it(ico('user', 4), 4, L('profile'), L('profileSub'), () => go('#/me/profile')),
        it(ico('spark', 2), 2, L('aiTitle'), L('aiSub'), () => go('#/me/ai')),
        it(ico('palette', 4), 4, L('look'), L('lookSub', { lang: (window.NoemaI18n?.LOCALES.find(x => x.tag === lang()) || { name: lang() }).name }), () => go('#/me/look')),
        it(ico('clock', 1), 1, L('activity'), L('activitySub'), () => convos()),
        it(ico('cloud', 1), 1, L('data'), L('dataSub'), () => go('#/me/data'))),
      fitRow(h('button', { class: 'btn small', onclick: () => N().openAccountPicker?.() }, svg('user'), L('switchProfile')),
        tipped(h('button', { class: 'btn small ns-logout', onclick: logOut }, svg('logout'), L('logOut')), L('logOutTip'))));
  };
  function mePage(sec) {
    const titles = { profile: L('profile'), ai: L('aiTitle'), subjects: L('mySubjects'), backup: L('backup'), cloud: L('data'), data: L('data'), help: L('help') };
    const crumbs = sec === 'help' ? [[L('help')]] : [[L('settings'), '#/me'], [titles[sec]]];
    const v = page({ tab: 'me', crumbs, back: sec === 'help' ? null : '#/me' }, h('h1', {}, titles[sec]));
    if (!ENGINE?.accView) {   // these pages live in the engine: load it quietly (no subject is opened), else say what is missing
      const wait = h('div', { class: 'ns-wait' }, faceEl(undefined, 'breathe')); v.append(wait);
      Promise.resolve(N().ensureEngine?.()).then(ok => { if (!wait.isConnected) return; if (ok && ENGINE?.accView) route(); else wait.replaceWith(h('div', { class: 'ns-panel' }, h('p', {}, L('needSubject')), h('button', { class: 'btn primary', onclick: () => N().openSubjectPicker?.() }, L('pickSubject')))); });
      return;
    }
    const body = h('div', { class: 'accbody ns-accbody' }); v.append(body);
    const close = () => go(sec === 'help' ? '#/' : '#/me');
    if (sec === 'data') { ENGINE.accView('cloud', body, close); const b2 = h('div', { class: 'accbody ns-accbody' }); v.append(h('h2', { class: 'ns-h2' }, L('backup')), b2); ENGINE.accView('backup', b2, close); return; }
    ENGINE.accView(ME_VIEWS[sec], body, close, sec === 'ai' ? { only: 'ai' } : {});
  }
  /* ---------- Help (#/help): every guide ---------- */
  PAGES.help = () => mePage('help');

  /* ---------- My subjects (#/subjects): grouped by Roadmap › station › chapter, every group folded until opened ---------- */
  PAGES.subjects = async () => {
    const v = page({ tab: 'me', crumbs: [[L('mySubjects')]], corner: true }, h('h1', {}, L('mySubjects')), h('p', { class: 'ns-muted' }, L('subjLead')));
    const tree = h('div', { class: 'ns-doms ns-subjtree' }, h('p', { class: 'ns-muted' }, L('loading')));
    v.append(tree, fitRow(
      tipped(h('button', { class: 'btn', 'data-act': 'create', onclick: () => N().claudeGuide({ onDone: s => landedOpen(s) }) }, svg('spark'), L('bCreate')), L('createClaudeSub')),
      tipped(h('button', { class: 'btn', 'data-act': 'shelf', onclick: () => go('#/shelf') }, svg('shelf'), L('bShelf')), L('bShelfTip')),
      tipped(h('button', { class: 'btn', 'data-act': 'import', onclick: importFile }, svg('upload'), L('bImport')), L('importFileSub'))));
    const opened = new Set();   // the groups open now stay open when the list is drawn again (after a change)
    const draw = async () => {
      opened.clear(); tree.querySelectorAll('details[open]').forEach(d => opened.add(d.dataset.k));
      const subs = await subjects(true), byId = new Map(subs.map(s => [s.id, s])), placed = new Set(), hiddenL = settings().hiddenSubjects || [];
      const fold = (k, head, ...kids) => h('details', { class: 'ns-dom ns-sgrp', 'data-k': k, open: opened.has(k) || null }, h('summary', {}, ...head, h('span', { class: 'ns-domchev', 'aria-hidden': 'true' }, '›')), ...kids);
      const groups = [];
      for (const c of CU()?.list(acc()) || []) {
        const ids = [...new Set([...(CU().order?.(c) || []), ...Object.keys(c.nodes || {})])].filter(id => c.nodes[id]?.pack?.id && byId.has(c.nodes[id].pack.id));
        if (!ids.length) continue;
        ids.forEach(id => placed.add(c.nodes[id].pack.id));
        groups.push(fold('c:' + c.id, [ico('map', 1), h('span', { class: 'ns-domt' }, c.title || c.goal), pill(L('subjStations', { n: ids.length }), 1)],
          h('div', { class: 'ns-sstations' }, ...ids.map(id => subjBlock(byId.get(c.nodes[id].pack.id), 'c:' + c.id + '/' + id, c.nodes[id].title, c.nodes[id].chapters)))));
      }
      const rest = subs.filter(s => !placed.has(s.id)), langs = rest.filter(isLang), shelf = rest.filter(s => !isLang(s));
      if (shelf.length) groups.push(fold('shelf', [ico('shelf', 3), h('span', { class: 'ns-domt' }, L('shelf')), pill(String(shelf.length), 3)], h('div', { class: 'ns-sstations' }, ...shelf.map(s => subjBlock(s, 's:' + s.id)))));
      if (langs.length) groups.push(fold('lang', [icoTxt('文A', 4), h('span', { class: 'ns-domt' }, L('languages')), pill(String(langs.length), 4)], h('div', { class: 'ns-sstations' }, ...langs.map(s => subjBlock(s, 's:' + s.id)))));
      tree.replaceChildren(...(groups.length ? groups : [h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('subjNone')))]));
      // a station (or a subject): its subject — open it, or its ⋮ (study, Roadmap, edit, share, export, hide) — then its chapters
      function subjBlock(s, k, title = s.title, planned = []) {
        const st = stateOf(s.id), read = {}; Object.keys(st?.read || {}).forEach(id => { const ch = String(id).split('-s')[0]; read[ch] = (read[ch] || 0) + 1; });
        const chs = (s.chapters || s.meta?.chapters || []).length ? (s.chapters || s.meta.chapters) : (planned || []).map((p, i) => ({ num: i + 1, title: p.title }));
        const hid = hiddenL.includes(s.id), pct = Math.round(subjectPct(s) * 100);
        return fold(k, [icoTxt(s.emoji || (s.title || '?').trim()[0].toUpperCase(), 2, 'emo'), h('span', { class: 'ns-sst' }, h('b', {}, title), title !== s.title ? h('small', {}, s.title) : null),
          hid ? h('span', { class: 'ns-hid', title: L('subjHidden') }, svg('eye')) : null, pct ? pill(pct + '%', 2) : chs.length ? pill(L('nChapters', { n: chs.length }), 2) : null],
          h('div', { class: 'ns-sbody' },
            h('div', { class: 'ns-itemwrap noema-chipwrap' }, h('button', { class: 'ns-item ns-subj', 'data-subject': s.id, onclick: () => open(s.id) }, h('span', { class: 't' }, h('b', {}, s.title), s.description ? h('small', {}, s.description) : null), h('span', { class: 'ns-pill' }, L('subjOpen'))),
              menuButton(subjectMenu(s, draw, { hide: true }), { label: L('moreFor', { title: s.title }) })),
            chs.length ? h('ol', { class: 'ns-schs' }, ...chs.map((c, i) => { const id = c.id || 'ch' + String(c.num || i + 1).padStart(2, '0'), n = typeof c.sections === 'number' ? c.sections : (c.sections || []).length, done = n > 0 && (read[id] || 0) >= n;
              return h('li', {}, h('button', { class: 'ns-sch' + (done ? ' done' : ''), onclick: () => open(s.id, '#/ch/' + id) }, h('span', { class: 'n' }, String(c.num || i + 1)), h('span', { class: 'grow' }, c.title || id), done ? svg('check') : null)); })) : null));
      }
    };
    draw();
  };

  /* ---------- the page others see: Me (#/profile, yours) and #/u/<id> (somebody's, once published). docs/PROFILE.md ---------- */
  const PAGE_PARTS = [['progress', 'pfProgress', 'pfProgressSub'], ['achievements', 'pfAch', 'pfAchSub'], ['languages', 'pfLangs', 'pfLangsSub'], ['topics', 'pfTopics', 'pfTopicsSub'], ['shares', 'pfShares', 'pfSharesSub']];
  const myPageKey = () => `noema1:${acc()}:a:mypage`;
  /** your page as kept on this device: { bio, avatar, show: { progress… }, published } — everything off until you switch it on */
  const myPage = () => ({ bio: '', avatar: null, show: {}, published: false, ...(jget(myPageKey(), null) || {}) });
  function putMyPage(p) { const v = JSON.stringify(p); if (N()?.kv?.set) N().kv.set(myPageKey(), v); else jset(myPageKey(), p); }
  const cloudMe = () => N()?.account?.kind === 'cloud' && window.NoemaCloud?.session?.()?.user?.id ? NoemaCloud.session().user.id : null;
  const avatarEl = (a, src, cls = '') => src ? h('img', { class: 'ns-avatar ' + cls, src, alt: '' }) : h('span', { class: 'ns-me ns-avatar ' + cls, 'data-emoji': '1' }, a.emoji || (a.display_name || a.name || '?').trim()[0]?.toUpperCase() || '?');
  /** What the page shows of you now, only the parts switched on (progress, treasures, languages, topics) */
  async function myCard(show) {
    const card = {}, st = N().stats?.get() || { xp: 0 }, sn = N().stats?.streakNow() || 0, subs = await subjects();
    let done = 0, fcN = 0, boss = 0; for (const s of subs) { const x = stateOf(s.id); if (!x) continue; done += chaptersDone(s, x); fcN += Object.keys(x.fc || {}).length; boss += Object.keys(x.boss || {}).length; }
    if (show.progress) card.progress = { level: LEVEL(st.xp || 0).lv, xp: st.xp || 0, streak: sn, chapters: done };
    if (show.achievements) card.achievements = medals({ fcN, sn, boss, xp: st.xp || 0 }).filter(m => m[0]).map(m => m[1]);
    if (show.languages) card.languages = WORLDS.lang?.studying ? WORLDS.lang.studying() : subs.filter(isLang).map(s => ({ id: s.id, title: s.title, languages: [] }));
    if (show.topics) card.topics = [...(CU()?.list(acc()) || []).filter(c => c.nodes && Object.keys(c.nodes).length).map(c => ({ kind: 'roadmap', title: c.title || c.goal, pct: Math.round(CU().summary(acc(), c).pct * 100) })),
      ...subs.filter(s => !isLang(s) && !CU()?.stepsOf?.(acc(), s.id)?.length && subjectPct(s) > 0).map(s => ({ kind: 'subject', title: s.title, emoji: s.emoji || null, pct: Math.round(subjectPct(s) * 100) }))].slice(0, 40);
    return card;
  }
  /** Send your page to the cloud (published or not: unpublished, only you can read it) */
  async function saveMyPage(p) {
    putMyPage(p);
    if (!cloudMe()) return;
    const a = N().account || {};
    await NoemaCloud.saveMyPage({ published: p.published, display_name: a.name, emoji: a.emoji, bio: p.bio, avatar: p.avatar, show: p.show, card: await myCard(p.show) });
  }
  PAGES.profile = async () => {
    const a = N().account || {}, uid = cloudMe(), v = page({ tab: 'me', crumbs: [[L('me')]], corner: true });
    let p = myPage();
    if (uid && !jget(myPageKey(), null)) { const r = await NoemaCloud.myPage().catch(() => null); if (r) { p = { bio: r.bio || '', avatar: r.avatar || null, show: r.show || {}, published: !!r.published }; putMyPage(p); } }   // another device wrote it
    const draw = async () => {
      const status = h('p', { class: 'ns-pfstate tiny' }, svg(p.published ? 'globe' : 'lock'), ' ', L(p.published ? 'pfPublic' : 'pfPrivate'));
      const acts = fitRow(
        tipped(h('button', { class: 'btn small', 'data-act': 'edit', onclick: editPage }, svg('edit'), L('pfEdit')), L('pfEditTip')),
        uid ? tipped(h('button', { class: 'btn small' + (p.published ? '' : ' primary'), 'data-act': 'publish', onclick: async e => { e.currentTarget.disabled = true; p.published = !p.published; try { await saveMyPage(p); toast(L(p.published ? 'pfPublic' : 'pfPrivate'), 2500); } catch (er) { p.published = !p.published; toast(L('pfCloudErr', { e: er.message }), 5000); } draw(); } }, svg(p.published ? 'lock' : 'globe'), L(p.published ? 'pfUnpublish' : 'pfPublish')), L('pfPublishTip')) : null,
        uid && p.published ? tipped(h('button', { class: 'btn small', 'data-act': 'link', onclick: () => { const url = location.href.split('#')[0].split('?')[0] + '#/u/' + uid; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast(L('pfLinkCopied'), 2500), () => prompt(L('pfLink'), url)); } }, svg('link'), L('pfLink')), L('pfLinkTip')) : null);
      const card = await myCard(p.show);
      v.replaceChildren(...pageView({ display_name: a.name, emoji: a.emoji, bio: p.bio, avatar: p.avatar, show: p.show, card }, { owner: uid, mine: true }), h('div', { class: 'ns-pffoot' }, status, uid ? null : h('p', { class: 'tiny ns-muted' }, L('pfNeedCloud')), acts));
      if (uid && p.published) saveMyPage(p).catch(() => { });   // a published page follows your progress
    };
    function editPage() {
      sheet(L('pfEdit'), (body, close) => {
        const pic = h('div', { class: 'ns-pfpic' }, avatarEl(a, p.avatar, 'big'));
        const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { p.avatar = await smallPicture(f); pic.replaceChildren(avatarEl(a, p.avatar, 'big')); delBtn.style.display = ''; } catch (er) { toast(L('pfPhotoBad'), 4000); } } });
        const delBtn = h('button', { class: 'btn small ghost', style: { display: p.avatar ? '' : 'none' }, onclick: () => { p.avatar = null; pic.replaceChildren(avatarEl(a, null, 'big')); delBtn.style.display = 'none'; } }, L('pfPhotoDel'));
        const bio = h('textarea', { class: 'noema-input ns-pfbio', maxlength: '600', rows: '4', placeholder: L('pfBioPh'), 'aria-label': L('pfBio') }); bio.value = p.bio || '';
        const sw = PAGE_PARTS.map(([k, t, sub]) => { const inp = h('input', { type: 'checkbox', 'data-part': k, checked: !!p.show[k] || null }); return h('label', { class: 'ns-pfsw' }, h('span', { class: 'grow' }, h('b', {}, L(t)), h('small', {}, L(sub))), h('span', { class: 'switch' }, inp, h('i'))); });
        body.append(h('div', { class: 'ns-pfedit' }, h('div', { class: 'row nowrap' }, pic, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => file.click() }, svg('upload'), L(p.avatar ? 'pfPhoto' : 'pfPhotoAdd')), delBtn), file),
          h('span', { class: 'ns-label' }, L('pfBio')), bio, h('span', { class: 'ns-label' }, L('pfShow')), h('p', { class: 'tiny' }, L('pfShowSub')), h('div', { class: 'ns-list ns-pfsws' }, ...sw),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-act': 'save', onclick: async e => {
            e.currentTarget.disabled = true; p.bio = bio.value.trim().slice(0, 600); p.show = Object.fromEntries(sw.map(l => { const i = l.querySelector('input'); return [i.dataset.part, i.checked]; }));
            try { await saveMyPage(p); toast(L('pfSaved'), 2000); } catch (er) { toast(L('pfCloudErr', { e: er.message }), 5000); }
            close(); draw(); } }, L('pfDone')))));
      }, { cls: 'ns-pfsheet' });
    }
    draw();
  };
  PAGES.u = async ([id]) => {
    if (id && id === cloudMe()) return location.replace('#/profile');
    const v = page({ tab: null, crumbs: [[L('me')]], back: '#/discover' }, h('p', { class: 'ns-muted' }, L('loading')));
    let r = null; try { r = id && window.NoemaCloud ? await NoemaCloud.publicPage(id) : null; } catch (e) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, L('pfCloudErr', { e: e.message })))); return; }
    if (!r || !r.published) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('pfMissing')))); return; }
    chrome({ tab: null, crumbs: [[r.display_name || '…']], back: '#/discover' });
    v.replaceChildren(...pageView(r, { owner: id }), window.NoemaSocial?.personActions(socialCtx(), id), h('p', { class: 'tiny ns-muted' }, L('pfUpdated', { date: fmtDate(r.updated_at) })));
  };
  /** The page itself (yours as others see it, or somebody's): picture, name, a few words, then the parts that are shown */
  function pageView(r, { owner, mine = false }) {
    const show = r.show || {}, card = r.card || {}, part = (k, ...kids) => show[k] ? h('section', { class: 'ns-panel ns-pfpart', 'data-part': k }, h('span', { class: 'ns-label' }, L(PAGE_PARTS.find(x => x[0] === k)[1])), ...kids) : null;
    const none = () => h('p', { class: 'tiny ns-muted' }, L('pfNone')), pr = card.progress;
    const langName = c => { try { return new Intl.DisplayNames([lang()], { type: 'language' }).of(c) || c; } catch (e) { return c; } };
    const shares = show.shares && owner ? h('div', { class: 'ns-pfshares' }, h('p', { class: 'tiny ns-muted' }, L('loading'))) : null;
    if (shares) Promise.all([CM()?.publicRoadmaps ? CM().publicRoadmaps(acc()).catch(() => []) : [], N().publicSubjects ? N().publicSubjects().catch(() => ({ all: [] })) : { all: [] }]).then(([rms, ps]) => {
      const rl = rms.filter(x => x.owner === owner), sl = (ps.all || []).filter(x => x.kind === 'public' && x.owner === owner), busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (er) { toast(er.message, 5000); } b.disabled = false; };
      shares.replaceChildren(...(rl.length || sl.length ? [
        rl.length ? h('span', { class: 'tiny ns-muted' }, L('pfSharedRm')) : null, rl.length ? h('div', { class: 'ns-list' }, ...rl.map((x, i) => h('button', { class: 'ns-item', onclick: e => busy(e.currentTarget, () => CM().openPublic(acc(), x, { onOpen: cid => go('#/map/' + encodeURIComponent(cid)) })) }, ico('map', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, x.title), x.description ? h('small', {}, x.description) : null), chev()))) : null,
        sl.length ? h('span', { class: 'tiny ns-muted' }, L('pfSharedSubj')) : null, sl.length ? h('div', { class: 'ns-list' }, ...sl.map((x, i) => h('button', { class: 'ns-item', onclick: e => busy(e.currentTarget, () => ps.study(x, s => open(s.id))) }, icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, h('b', {}, x.title), x.description ? h('small', {}, x.description) : null), chev()))) : null] : [none()]));
    });
    const MED = Object.fromEntries(medals({ fcN: 100, sn: 30, boss: 1, xp: 1000 }).map(m => [m[1], m]));
    return [h('div', { class: 'ns-hello ns-pfhead' }, avatarEl(r, r.avatar, 'big'), h('div', { class: 'grow' }, h('h1', {}, r.display_name || '…'), r.bio ? h('p', { class: 'ns-pfbiotext' }, r.bio) : mine ? h('p', { class: 'tiny ns-muted' }, L('pfBioPh')) : null)),
      part('progress', pr ? h('div', { class: 'ns-pfstats' }, pill(L('pfLevel', { lv: pr.level }), 1), pill(L('pfXp', { xp: pr.xp || 0 }), 2), pr.streak ? pill(L('streakDays', { n: pr.streak }).replace(/\.$/, ''), 3) : null, pill(L('nChapters', { n: pr.chapters || 0 }), 4)) : none()),
      part('achievements', (card.achievements || []).length ? medalsEl(card.achievements.filter(k => MED[k]).map(k => MED[k])) : none()),
      part('languages', (card.languages || []).length ? h('div', { class: 'ns-list' }, ...card.languages.map(x => h('div', { class: 'ns-item' }, icoTxt('文A', 4), h('span', { class: 't' }, h('b', {}, x.title), h('small', {}, [(x.languages || []).map(langName).join(' · '), x.words ? L('pfWords', { n: x.words }) : null].filter(Boolean).join(' · ')))))) : none()),
      part('topics', (card.topics || []).length ? h('div', { class: 'ns-list' }, ...card.topics.map((x, i) => h('div', { class: 'ns-item' }, x.kind === 'roadmap' ? ico('map', (i % 4) + 1) : icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, h('b', {}, x.title)), x.pct ? pill(x.pct + '%', 2) : null))) : none()),
      part('shares', shares)].filter(Boolean);
  }
  /** A picture for the page: square, 256 px, JPEG (small enough to live in the page's row; nothing of the original file travels) */
  async function smallPicture(f) {
    if (f.size > 15e6) throw new Error('too big');
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = Math.min(img.naturalWidth, img.naturalHeight);
      if (!m) throw new Error('empty');
      x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
      for (const q of [0.85, 0.7, 0.55]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 190000) return d; }
      throw new Error('too big');
    } finally { URL.revokeObjectURL(url); }
  }
  /** Buttons in one row when they all fit, else one under the other (never ragged) */
  function fitRow(...kids) {
    const r = h('div', { class: 'ns-fitrow' }, ...kids); let w = -1;
    const fit = () => { if (!r.isConnected || r.clientWidth === w) return; w = r.clientWidth; r.classList.remove('stack'); if (r.scrollWidth > r.clientWidth + 1) r.classList.add('stack'); };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(r); requestAnimationFrame(fit);
    return r;
  }
  /** A short label, its explanation in a quiet bubble on hover or focus (kept inside the screen) */
  function tipped(el, text) {
    el.setAttribute('aria-description', text);
    let t = null;
    const hide = () => { t?.remove(); t = null; };
    const show = () => { hide(); t = h('div', { class: 'ns-hovertip', role: 'tooltip' }, text); document.body.append(t);
      const a = el.getBoundingClientRect(), r = t.getBoundingClientRect(); let y = a.top - r.height - 8; if (y < 8) y = a.bottom + 8;
      Object.assign(t.style, { left: Math.max(8, Math.min(innerWidth - r.width - 8, a.left + a.width / 2 - r.width / 2)) + 'px', top: y + 'px' }); };
    el.addEventListener('mouseenter', show); el.addEventListener('mouseleave', hide); el.addEventListener('focus', show); el.addEventListener('blur', hide); el.addEventListener('click', hide);
    if (!tipped.wired) { tipped.wired = true; addEventListener('hashchange', () => document.querySelectorAll('.ns-hovertip').forEach(x => x.remove())); }
    return el;
  }
  /* Language & appearance: menus language, light/dark, how much "game", sound, reading, goal */
  function lookPage() {
    const s = settings(), engineS = window.S?.settings || {};
    const v = page({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('look')]], back: '#/me' }, h('h1', {}, L('look')));
    const uiL = h('select', { class: 'noema-input', 'aria-label': L('uiLang') }, h('option', { value: '' }, L('uiLangAuto', { lang: (window.NoemaI18n?.LOCALES.find(x => x.tag === NoemaI18n.browser()) || { name: 'English' }).name })), ...uiLocaleOptions(s.lang).map(([k, l]) => h('option', { value: k, selected: s.lang === k || null, lang: k }, l)));
    const theme = engineS.theme || s.theme || 'auto';
    const seg = (name, cur, opts, onpick) => h('div', { class: 'ns-seg', role: 'radiogroup', 'aria-label': name }, ...opts.map(([k, l]) => h('button', { class: cur === k ? 'on' : '', role: 'radio', 'aria-checked': String(cur === k), 'data-v': k, onclick: e => { [...e.currentTarget.parentElement.children].forEach(b => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); }); onpick(k); } }, l)));
    const game = TH()?.game() || 'playful';
    const chk = (k, def, label) => { const c = h('input', { type: 'checkbox', checked: (engineS[k] ?? s[k] ?? def) || null, onchange: () => putS({ [k]: c.checked }) }); return h('label', { class: 'row ns-check' }, c, label); };
    const goal = h('input', { class: 'noema-input', type: 'number', min: 20, step: 10, value: engineS.goal || s.goal || 120, style: { width: '110px' }, 'aria-label': L('dailyGoal'), onchange: () => putS({ goal: Math.max(20, +goal.value || 120) }) });
    v.append(
      h('section', { class: 'ns-panel ns-form' }, h('label', { class: 'ns-field' }, h('span', { class: 'ns-label' }, L('uiLang')), uiL), h('p', { class: 'tiny' }, L('uiLangTip'))),
      h('section', { class: 'ns-panel ns-form' }, h('span', { class: 'ns-label' }, L('lightDark')), seg(L('lightDark'), theme, [['auto', L('auto')], ['light', L('light')], ['dark', L('dark')]], k => { putS({ theme: k }); if (k === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = k; })),
      h('section', { class: 'ns-panel ns-form' }, h('span', { class: 'ns-label' }, L('gameMode')), h('p', { class: 'tiny' }, L('gameModeSub')),
        seg(L('gameMode'), game, [['playful', L('gamePlayful')], ['calm', L('gameCalm')], ['off', L('gameOff')]], k => TH().putSettings({ game: k })),
        h('p', { class: 'tiny' }, L('gameRules'))),
      h('section', { class: 'ns-panel ns-form' }, h('span', { class: 'ns-label' }, L('studying')), chk('sound', true, L('sound')), chk('chunk', true, L('chunk')), h('label', { class: 'row ns-check' }, goal, L('dailyGoal'))),
      nativeField(s),
      window.NoemaMT ? NoemaMT.panel(acc()) : null,   // 🌐 machine translation of shared texts: consent, provider, caps (engine/mt.js, docs/i18n.md §11)
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/character') }, faceEl(undefined, 'mini'), L('character'))));
    uiL.addEventListener('change', () => { putS({ lang: uiL.value || undefined }); location.reload(); });
  }
  /** D19 (docs/language-packs.md §2.2): the learner's native language (a:settings.native), read by every language course. The supported
      natives here; any other language (with its type and family) is chosen in a language course's ⚙️ settings and shown as it is. */
  function nativeField(s) {
    // the supported natives = NoemaLang.SUPPORTED_NATIVES (one source of truth) = the UI locales' languages (langcore may not be loaded here)
    const NATIVES = (window.NoemaLang && NoemaLang.SUPPORTED_NATIVES) || [...new Set(((window.NoemaI18n && NoemaI18n.LOCALES) || []).filter(x => !x.pseudo).map(x => x.tag.split('-')[0]))];
    const cur = s.native || null, name = c => { try { return new Intl.DisplayNames([lang(), 'en'], { type: 'language' }).of(c) || c; } catch (e) { return c; } };
    const opts = NATIVES.map(c => [c, name(c)]).sort((a, b) => window.NoemaI18n ? NoemaI18n.fmt.compare(a[1], b[1]) : a[1].localeCompare(b[1]));
    const other = cur && !(cur.code && NATIVES.includes(cur.code));
    const sel = h('select', { class: 'noema-input ns-native', 'aria-label': L('native') }, h('option', { value: '' }, L('nativeNone')),
      ...opts.map(([c, n]) => h('option', { value: c, selected: cur?.code === c || null }, n)), other ? h('option', { value: '=', selected: true }, cur.name || name(cur.code)) : null);
    sel.addEventListener('change', () => { if (sel.value !== '=') putS({ native: sel.value ? { code: sel.value } : undefined }); });
    return h('section', { class: 'ns-panel ns-form' }, h('label', { class: 'ns-field' }, h('span', { class: 'ns-label' }, L('native')), sel), h('p', { class: 'tiny' }, L('nativeTip')));
  }
  /** The UI languages to offer (endonym · code; never flags): those switched on, plus the learner's current choice. */
  function uiLocaleOptions(cur) {
    const I = window.NoemaI18n; if (!I) return [];
    return I.LOCALES.filter(x => I.available().includes(x) || x.tag === cur).map(x => [x.tag, `${x.name} · ${x.tag}`]);
  }
  /** Save account settings (a:settings, synced) and keep the open subject's copy (S.settings) in step. */
  function putS(patch) {
    if (window.S?.settings) { Object.assign(window.S.settings, patch); try { window.flushSave?.(); } catch (e) { } }
    TH()?.putSettings(patch);
  }

  /* ---------- the character gallery: try anyone for 5 minutes; change freely for 15 days, then once every 5 days ---------- */
  PAGES.character = () => {
    const own = TH().owned(), can = TH().canChange(), locked = TH().locked(), at = TH().settings().characterAt;
    const v = page({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('character')]], back: '#/me' },
      h('div', {}, h('span', { class: 'ns-label' }, L('companion')), h('h1', {}, L('character'))),
      h('p', { class: 'ns-muted' }, L('characterIntro')),
      h('p', { class: 'tiny' }, locked ? L('charLockedLong') : Date.now() < TH().freeUntil() ? L('freeUntil', { date: fmtDate(TH().freeUntil()) }) : can ? L('canChangeNow') : L('changedOn', { date: fmtDate(at), next: fmtDate(TH().nextChangeAt()) })));
    const sample = L('fontSample');   // “Aa” + a greeting in the UI language: how each font looks
    for (const g of ['animals', 'tales', 'grown']) {
      const gal = h('div', { class: 'ns-gal' }); v.append(charGroup(g, gal));
      for (const k of TH().GROUPS[g]) {
        const t = TH().text(k), d = TH().DATA[k], cur = k === own, nm = tv(k).tutor;
        gal.append(h('div', { class: 'ns-gcard' + (cur ? ' cur' : ''), 'data-m': k, 'data-char': k },
          cur ? h('span', { class: 'badge' }, pill(L('yours'), 1)) : null, faceEl(k, 'breathe'),
          h('h3', {}, nm), h('span', { class: 'tiny' }, `${t.name} · ${t.world}`),
          h('span', { class: 'sws' }, ...[d.light[6], d.light[9], d.light[11], d.light[13], d.light[15]].map(c => h('i', { style: { background: c } }))),
          h('span', { class: 'fs' }, sample),
          cur || locked ? null : h('div', { class: 'row' }, h('button', { class: 'btn small soft', 'data-try': k, onclick: () => { TH().startPreview(k); toast(L('tryingNow', { tutor: nm }), 2500); } }, L('try5'))
            , !TH().settings().character || can ? h('button', { class: 'btn small', 'data-choose': k, onclick: () => { TH().choose(k); window.NoemaReact?.big('level', L('welcomeWorld')); } }, L('choose')) : null)));
      }
    }
  };
  /** the characters come in three groups, each folded until the learner opens it; its head shows the faces inside */
  function charGroup(g, body) {
    return h('details', { class: 'ns-chgrp', 'data-group': g }, h('summary', {}, h('span', { class: 'ns-chgt' }, L('group_' + g)),
      h('span', { class: 'ns-chfaces', 'aria-hidden': 'true' }, ...TH().GROUPS[g].map(k => faceEl(k))), h('span', { class: 'ns-pill' }, String(TH().GROUPS[g].length)), h('span', { class: 'ns-domchev', 'aria-hidden': 'true' }, '›')), body);
  }
  /* the 5-minute preview bar */
  function drawPreview() {
    const p = TH()?.preview(); if (!p) { F.pv.replaceChildren(); document.body.classList.remove('ns-previewing'); return; }
    document.body.classList.add('ns-previewing');
    const left = Math.max(0, p.until - Date.now()), mm = Math.floor(left / 6e4), ss = String(Math.floor(left / 1e3) % 60).padStart(2, '0'), can = TH().canChange(), nm = tv(p.m).tutor;
    const bar0 = F.pv.querySelector('.ns-preview');
    if (bar0 && bar0.dataset.m === p.m) { bar0.querySelector('.ns-pvtime').textContent = `${mm}:${ss}`; return; }
    F.pv.replaceChildren(h('div', { class: 'ns-preview', role: 'status', 'data-m': p.m }, faceEl(p.m), h('span', {}, L('trying'), ' ', h('b', {}, nm), ' · ', h('b', { class: 'ns-pvtime' }, `${mm}:${ss}`)),
      h('span', { class: 'row grow-end' }, h('button', { class: 'btn small primary', disabled: can ? null : true, onclick: () => { TH().choose(p.m); window.NoemaReact?.big('level', L('welcomeWorld')); } }, L('keepIt')), h('button', { class: 'btn small', onclick: () => TH().endPreview() }, L('endTry'))),
      can ? null : h('span', { class: 'tiny full' }, L('keepFrom', { date: fmtDate(TH().nextChangeAt()) }))));
  }

  /* ---------- 🕘 the conversations with the tutor, in every subject: a window in the middle of the screen, grouped by Roadmap and step ---------- */
  const emoBtn = (emo, label, run) => h('button', { class: 'ns-emobtn', type: 'button', title: label, 'aria-label': label, onclick: run }, emo);
  /** A window in the middle of the screen. build({ head, body, close }) */
  /** A window in the middle of the screen: focus moves into it, Tab stays inside, and closing gives focus back to what opened it. */
  function modal(title, build, { cls = '' } = {}) {
    const opener = document.activeElement;
    const close = () => { F.layer.replaceChildren(); if (opener?.isConnected) opener.focus?.(); };
    const head = h('div', { class: 'ns-mdhead' }), body = h('div', { class: 'ns-mdbody' });
    const win = h('div', { class: 'ns-modal ns-mdwin ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1', onkeydown: e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = [...win.querySelectorAll('button,[href],input,select,textarea,summary')].filter(x => !x.disabled && x.getClientRects().length);
      if (!f.length) return;
      const a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === win)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    } }, head, body);
    const refocus = () => { if (!win.contains(document.activeElement)) win.focus(); };   // after a re-render dropped the focused button
    F.layer.replaceChildren(h('div', { class: 'ns-scrim', onclick: close }), win);
    build({ head, body, close, refocus }); refocus(); return close;
  }
  const cvTitle = r => r.title || String(r.messages.find(m => m.role === 'user')?.content || '').replace(/\s+/g, ' ').slice(0, 60) || L('untitled');
  const cvMode = r => { if (r.kind && r.kind !== 'tutor') return window.NoemaConvos?.KIND_NAME?.[r.kind] || r.kind; const m = String(r.mode || ''), k = 'mode' + m.charAt(0).toUpperCase() + m.slice(1); return m && window.NoemaI18n?.has('sh.' + k) ? L(k) : m; };   // a mode the catalog does not know: its code (a missing key no longer comes back as the key)
  const cvWhat = r => !r.context || r.context.type === 'course' ? '' : r.context.type === 'exercise' ? L('forExercise') : r.context.label || '';   // a whole-subject chat needs no label (it read like a filter)
  const cvText = t => String(t || '').replace(/<noema-state>[\s\S]*?<\/noema-state>/g, '').trim();
  function cvMd(t) { const d = h('div', { class: 'ns-md' }); if (window.marked && window.DOMPurify) d.innerHTML = DOMPurify.sanitize(marked.parse(cvText(t))); else d.textContent = cvText(t); return d; }
  function download(name, text) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const cvMarkdown = r => window.NoemaConvos?.toMarkdown ? NoemaConvos.toMarkdown({ ...r, messages: r.messages.map(m => ({ ...m, content: cvText(m.content) })) }, { tutorName: tv().tutor, tutorAvatar: TH()?.tutor()?.emoji || '' }) : r.messages.map(m => `**${m.role === 'user' ? L('you') : tv().tutor}:** ${cvText(m.content)}`).join('\n\n');
  const slug = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'conversation';
  /** Where a subject sits: { group: Roadmap (or "no Roadmap"), step: its step (or the subject itself) } */
  function placeOf(sid, title) {
    const st = window.NoemaCurriculum?.stepsOf ? NoemaCurriculum.stepsOf(acc(), sid) : [];
    if (st.length) { const { c, nid } = st[0]; return { g: 'c:' + c.id, gt: c.title || c.goal || L('roadmap'), s: c.id + '/' + nid, st: c.nodes[nid]?.title || title }; }
    return { g: 'other', gt: L('otherSubjects'), s: 's:' + sid, st: title || sid };
  }
  function convos(openId) {   // openId: open that conversation at once (a search result)
    const C = window.NoemaConvos; if (!C || !acc()) return;
    let q = '', allKinds = false;
    modal(L('activity'), ({ head, body, close, refocus }) => {
      const closeBtn = h('button', { class: 'ns-iconbtn', 'aria-label': L('close'), onclick: close }, svg('close'));
      const groups = h('div', { class: 'ns-cvgroups' });
      const search = h('input', { class: 'noema-input ns-cvsearch', type: 'search', placeholder: L('convosSearch'), 'aria-label': L('convosSearch'), oninput: e => { q = e.target.value.trim().toLowerCase(); draw(); } });
      let rows = [];
      async function load() { rows = (await C.list(acc()).catch(() => [])).filter(r => r.messages?.length).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))); }
      async function listView() {
        await load();
        const tutorOnly = rows.filter(r => !r.kind || r.kind === 'tutor'), others = rows.length - tutorOnly.length;
        head.replaceChildren(...[h('h2', { class: 'grow' }, `${L('activity')} (${tutorOnly.length})`), rows.length ? emoBtn('⬇️', L('exportAll'), () => download('conversations.md', (allKinds ? rows : tutorOnly).map(cvMarkdown).join('\n\n---\n\n'))) : null, closeBtn].filter(Boolean));
        body.replaceChildren(...[h('p', { class: 'tiny ns-muted' }, L('convosSaved')),
          rows.length > 3 ? search : null,
          others ? h('label', { class: 'row tiny ns-check' }, h('input', { type: 'checkbox', checked: allKinds, onchange: e => { allKinds = e.target.checked; draw(); } }), L('convosOthers', { n: others })) : null,
          groups].filter(Boolean));   // replaceChildren() would print a null as text
        draw(); refocus();
      }
      function draw() {
        const shown = rows.filter(r => (allKinds || !r.kind || r.kind === 'tutor') && (!q || (cvTitle(r) + ' ' + cvWhat(r) + ' ' + (r.subject?.title || '') + ' ' + r.messages.map(m => m.content).join(' ')).toLowerCase().includes(q)));
        if (!shown.length) { groups.replaceChildren(h('p', { class: 'ns-muted' }, rows.length ? L('noResults') : L('noConvos'))); return; }
        const G = new Map();   // Roadmap → step → conversations, newest first (rows are sorted)
        for (const r of shown) {
          const p = placeOf(r.subject?.id || '', r.subject?.title);
          if (!G.has(p.g)) G.set(p.g, { t: p.gt, steps: new Map() });
          const g = G.get(p.g); if (!g.steps.has(p.s)) g.steps.set(p.s, { t: p.st, rows: [] }); g.steps.get(p.s).rows.push(r);
        }
        const first = [...G.keys()].sort((a, b) => (a === 'other') - (b === 'other'));
        groups.replaceChildren(...first.map((gk, gi) => { const g = G.get(gk), n = [...g.steps.values()].reduce((a, s) => a + s.rows.length, 0);
          return h('details', { class: 'ns-cvgrp', open: q || gi === 0 ? true : null }, h('summary', {}, h('span', { class: 'grow' }, g.t), pill(String(n), 4)),
            ...[...g.steps.values()].map((s, si) => h('details', { class: 'ns-cvstep', open: q || (gi === 0 && si === 0) ? true : null }, h('summary', {}, h('span', { class: 'grow' }, s.t), h('span', { class: 'tiny' }, String(s.rows.length))), ...s.rows.map(row)))); }));
      }
      function row(r) {
        let sure = false; const tl = h('b', {}, cvTitle(r));
        return h('div', { class: 'ns-cvrow' },
          h('button', { class: 'ns-cvmain', onclick: () => oneView(r) }, tl, h('small', {}, [cvMode(r), cvWhat(r), fmtDate(r.updatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), L('nMessages', { n: r.messages.length })].filter(Boolean).join(' · '))),
          h('span', { class: 'ns-cvacts' },
            emoBtn('✏️', L('rename'), () => { const inp = h('input', { class: 'noema-input', value: cvTitle(r), 'aria-label': L('rename'), onkeydown: e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { e.stopPropagation(); inp.value = cvTitle(r); inp.blur(); } },
              onblur: async () => { const v = inp.value.trim().slice(0, 80); if (v && v !== cvTitle(r)) { r.title = v; r.titleSource = 'user'; r = await C.put(acc(), r); ENGINE?.convoChanged?.(r.id, { title: v }); /* put() gives it a newer updatedAt, or other devices keep the old title */ } inp.replaceWith(tl); tl.textContent = cvTitle(r); setTimeout(refocus); } });
              tl.replaceWith(inp); inp.focus(); inp.select(); }),
            emoBtn('⬇️', L('exportMd'), () => download(slug(cvTitle(r)) + '.md', cvMarkdown(r))),
            emoBtn('🗑️', L('del'), async e => { const b = e.currentTarget; if (!sure) { sure = true; b.textContent = '❓'; b.title = L('delAgain'); return; } await C.remove(acc(), r.id); ENGINE?.convoChanged?.(r.id, null); listView(); })));
      }
      function oneView(r) {
        head.replaceChildren(emoBtn('↩️', L('convBack'), listView), h('h2', { class: 'grow' }, cvTitle(r)), emoBtn('⬇️', L('exportMd'), () => download(slug(cvTitle(r)) + '.md', cvMarkdown(r))), closeBtn);
        const p = placeOf(r.subject?.id || '', r.subject?.title);
        body.replaceChildren(h('p', { class: 'tiny ns-muted' }, [p.st, cvMode(r), cvWhat(r), fmtDate(r.updatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')),
          h('div', { class: 'ns-cvmsgs' }, ...r.messages.filter(m => cvText(m.content)).map(m => h('div', { class: 'ns-cvmsg ' + (m.role === 'user' ? 'me' : 'ai') }, h('small', {}, m.role === 'user' ? L('you') : tv().tutor), cvMd(m.content)))),
          r.subject?.id && (!r.kind || r.kind === 'tutor') ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { close(); goConvo(r); } }, L('convContinue'))) : null);
        body.scrollTop = 0; refocus();
      }
      if (openId) load().then(() => { const r = rows.find(x => x.id === openId); if (r) oneView(r); else listView(); }); else listView();
    }, { cls: 'ns-convos' });
  }
  /** Continue a conversation in the tutor's window: in this subject at once, else after opening its subject (engine/src/60_convos.js resumeConvo). */
  function goConvo(r) {
    try { sessionStorage.setItem('noema-device:openConvo', JSON.stringify({ acc: acc(), sid: r.subject.id, id: r.id })); } catch (e) { }
    if (ENGINE && r.subject.id === subjectId()) { ENGINE.resumeConvo?.(); return; }
    N().switchTo(acc(), r.subject.id, '#/subject');
  }

  /* ---------- first time: what do you want to learn, and who comes with you ---------- */
  function maybeOnboard() {
    const cfg = window.NOEMA_CONFIG || {};
    if (cfg.onboarding === false || settings().onboarded || !acc()) return;
    onboarding(1);
  }
  function onboarding(step, picked = {}) {
    const modal = (...kids) => {   // the step's heading names the dialog for screen readers
      const head = kids.find(k => k?.tagName === 'H1'); if (head) head.id = 'ns-onb-title';
      F.layer.replaceChildren(h('div', { class: 'ns-scrim', 'data-sticky': '1' }), h('div', { class: 'ns-modal ns-onb', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': head ? 'ns-onb-title' : null, 'data-sticky': '1' }, ...kids));
    };
    if (step === 1) {
      const pick = w => { picked.world = w; TH().putSettings({ world: w }); drawTabs(); TH().locked() ? finish() : onboarding(2, picked); };
      modal(faceEl(undefined, 'breathe'), h('h1', { class: 'center' }, L('onbWhat')),
        h('button', { class: 'ns-choice', 'data-pick': 'know', onclick: () => pick('know') }, ico('path', 1), h('span', {}, h('b', {}, L('knowledge')), h('small', {}, L('onbKnow')))),
        h('button', { class: 'ns-choice', 'data-pick': 'lang', onclick: () => pick('lang') }, icoTxt('文A', 3), h('span', {}, h('b', {}, L('languages')), h('small', {}, L('onbLang')))),
        h('button', { class: 'ns-choice', 'data-pick': 'both', onclick: () => pick('both') }, ico('star', 2), h('span', {}, h('b', {}, L('both')), h('small', {}, L('onbBoth')))),
        h('p', { class: 'tiny center' }, L('onbChangeLater')));
      return;
    }
    let sel = TH().owned();
    const grid = h('div', { class: 'ns-pickgroups' }, ...['animals', 'tales', 'grown'].map(g => charGroup(g, h('div', { class: 'ns-pick' }, ...TH().GROUPS[g].map(k => h('button', { class: k === sel ? 'on' : '', 'data-m': k, 'data-onbm': k, onclick: e => { sel = k; TH().apply(k); grid.querySelectorAll('.ns-pick button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, faceEl(k), h('span', {}, tv(k).tutor)))))));
    function finish() { if (!TH().locked()) TH().choose(sel, { force: true }); TH().putSettings({ onboarded: Date.now() }); F.layer.replaceChildren(); route(); setTimeout(() => window.NoemaReact?.big('hello'), 400); }
    modal(h('h1', { class: 'center' }, L('onbWho')), h('p', { class: 'ns-muted center' }, L('onbWhoSub')), grid, h('button', { class: 'btn primary', 'data-onbdone': '1', onclick: finish }, L('onbGo')), h('p', { class: 'tiny center' }, L('onbWhoLater')));
  }

  /* ======================= for the engine ======================= */
  /** The engine of the open subject calls this once it has booted: from now on its routes are drawn by it. */
  function attachEngine(api) {
    ENGINE = api; pendingEngine = false;
    if (mounted) route();
  }
  /** The subject could not be loaded: say so and stay on the shell's pages. */
  function noEngine(msg) { pendingEngine = false; toast(msg, 6000); if (ENGINE_ROUTES.has((location.hash || '').replace(/^#\/?/, '').split('/')[0])) location.replace('#/'); else route(); }
  /** Small items an engine page shows in the top bar, next to ⋮ (e.g. the focus-sprint clock). */
  function setActs(nodes) { F.acts.prepend(...nodes.filter(Boolean)); }

  return { level: LEVEL, here, mount, attachEngine, noEngine, chrome, subjectChrome, route, go, open, menuButton, popMenu, closePops, sheet, modal, convos, tip, hint, h, svg, faceEl, ico, icoTxt, pill, bar, ring, L, tv, noteRecent, recent, registerWorld, setActs, onboarding, importFile,
    get mounted() { return mounted; }, get engine() { return ENGINE; }, ENGINE_ROUTES };
})();
