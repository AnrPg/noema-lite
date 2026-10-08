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

  /* ---------- words: engine/i18n_shell.js ('sh.*'), with the tutor's name in the right form ---------- */
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const settings = () => { try { return JSON.parse(localStorage.getItem(`noema1:${acc()}:a:settings`) || '{}') || {}; } catch (e) { return {}; } };
  const uiPref = () => settings().lang;
  const lang = () => window.NoemaI18n ? NoemaI18n.lang(uiPref()) : 'en';
  function tv(m) { const t = TH()?.tutor(m) || { n: 'Tutor', nom: 'Tutor', acc: 'Tutor', to: 'Tutor' }; return { tutor: t.n, tutorAcc: t.acc, tutorTo: t.to, tutorNom: t.nom, Tutor: t.nom ? t.nom[0].toUpperCase() + t.nom.slice(1) : t.n }; }
  const one = (k, v) => v && v.n === 1 && window.NoemaI18n?.bundles.en?.['sh.' + k + '1'] ? k + '1' : k;   // '<key>1': the words for exactly one
  const L = (k, v) => window.NoemaI18n ? NoemaI18n.t('sh.' + one(k, v), { ...tv(), ...(v || {}) }, uiPref()) : k;
  /** A sentence with some of its values in bold (names and titles stay text, never markup) */
  function rich(k, vals) { const names = Object.keys(vals), marks = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0001`])); return L(k, marks).split('\u0001').map((x, i) => i % 2 ? h('b', {}, vals[names[+x]]) : x); }
  const fmtDate = (t, o = { day: 'numeric', month: 'long' }) => { try { return new Date(t).toLocaleDateString(lang(), o); } catch (e) { return new Date(t).toDateString(); } };
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
  const ENGINE_ROUTES = new Set(['subject', 'ch', 's', 'practice', 'run', 'boss', 'lightning', 'cards', 'drills', 'drill', 'mistakes', 'new', 'ex']);
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
    F.back = h('button', { class: 'ns-back', 'aria-label': L('back'), onclick: () => chromeNow.back ? go(chromeNow.back) : history.back() }, '←');
    F.crumbs = h('nav', { class: 'ns-crumbs', 'aria-label': L('where') });
    F.acts = h('div', { class: 'ns-acts' });
    F.bellBadge = h('span', { class: 'bellbadge' });
    F.bell = h('button', { class: 'ns-iconbtn bell', id: 'bellbtn', title: L('notifications'), 'aria-label': L('notifications'), onclick: openNotes }, svg('bell'), F.bellBadge);
    F.topMe = h('button', { class: 'ns-me acchip', id: 'ns-topme', title: L('me'), 'aria-label': L('meLong'), onclick: () => go('#/me') }, h('span', { class: 'ns-meemo' }), h('i', { class: 'syncdot', id: 'syncdot' }));
    F.top = h('header', { class: 'ns-top', id: 'ns-top' }, F.back, F.crumbs, F.acts, F.bell, F.topMe);
    F.share = h('div', { class: 'sharebar', role: 'status' });
    F.tabs = h('nav', { class: 'ns-tabs', 'aria-label': L('mainNav') });
    F.railMe = h('button', { class: 'ns-railme', onclick: () => go('#/me') }, h('span', { class: 'ns-me' }, h('span', { class: 'ns-meemo' })), h('span', {}, L('me')));
    F.main = document.querySelector('main') || h('main');
    F.main.id = 'ns-main';
    F.fab = h('button', { class: 'ns-fab', id: 'ns-fab', onclick: () => ENGINE?.openTutor?.() }, h('span', { class: 'ns-fabface' }), h('span', { class: 'nm' }));
    F.fx = h('div', { class: 'ns-fx', id: 'ns-fx' });
    F.layer = h('div', { class: 'ns-layer', id: 'ns-layer' });
    document.body.prepend(F.land, F.pv, F.brand, F.top, F.share, F.tabs, F.railMe);
    if (!F.main.isConnected) document.body.append(F.main);
    document.body.append(F.fab, F.fx, F.layer);
    drawMe(); drawTabs(); paintCharacter(); wireNotes(); wireSync(); wireScroll();
    TH()?.onChange((m, why) => { if (why === 'tick') { drawPreview(); return; } paintCharacter(m); if (ENGINE?.retheme) ENGINE.retheme(); if (!F.layer.querySelector('.ns-onb')) route(); });
    addEventListener('hashchange', route);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (closePops()) return; if (F.layer.firstChild && !F.layer.querySelector('[data-sticky]')) { F.layer.replaceChildren(); return; } }
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
    const a = N()?.account || {}; const emo = a.emoji || (a.name || '?').trim()[0]?.toUpperCase() || '🙂';
    document.querySelectorAll('.ns-meemo').forEach(x => { x.textContent = emo; });
  }
  function tabsList() {
    const w = TH()?.world() || 'know', t = [['today', '#/', svg('sun'), L('today')]];
    if (w !== 'lang') t.push(['learn', '#/learn', svg('path'), L('knowledge')]);
    if (w !== 'know') t.push(['lang', '#/lang', h('span', { class: 'ns-tx' }, '文A'), L('languages')]);
    t.push(['discover', '#/discover', svg('compass'), L('discover')], ['progress', '#/progress', svg('star'), L('progress')]);
    return t;
  }
  function drawTabs() {
    F.tabs.replaceChildren(...tabsList().map(([k, href, i, l]) => h('button', { class: 'ns-tab', 'data-tab': k, onclick: () => go(href) }, h('span', { class: 'i2' }, i), h('span', { class: 'lb' }, l))));
    F.tabs.style.setProperty('--n', F.tabs.children.length);
  }
  /** The top bar and tab of the page now showing. crumbs: [[label, href?], …] · back: href · menu: [{label, sub?, icon?, run, danger?}] */
  function chrome(c = {}) {
    chromeNow = c;
    F.crumbs.replaceChildren(...(c.crumbs || []).flatMap(([l, href], i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, '›') : null, href ? h('button', { onclick: () => go(href) }, l) : h('b', {}, l)]).filter(Boolean));
    F.back.classList.toggle('on', !!c.back);
    F.acts.replaceChildren(...[...(c.acts || []), c.menu && (typeof c.menu === 'function' || c.menu.length) ? menuButton(c.menu, { label: c.menuLabel || L('more') }) : null].filter(Boolean));   // menu: a list, or a function that makes it when opened
    document.querySelectorAll('.ns-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === c.tab));
    F.railMe.classList.toggle('on', c.tab === 'me');
    F.fab.classList.toggle('full', !!c.corner); F.fab.querySelector('.ns-fabface').classList.toggle('breathe', !!c.corner);
    F.fab.hidden = !ENGINE || c.fab === false;
    document.body.classList.toggle('ns-reading', !!c.reading);
    F.top.classList.remove('hide');
  }
  const go = hash => { if (location.hash === hash || (hash === '#/' && !location.hash)) route(); else location.hash = hash; };

  /* ---------- ⋮ menus and small pop-overs ---------- */
  function closePops() { const p = document.querySelectorAll('.ns-pop'); p.forEach(x => x.remove()); document.querySelectorAll('[data-pop][aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); return p.length > 0; }
  /** A ⋮ button with a list of actions. Items: { label, sub?, icon?, run, danger?, href? } or null (skipped) or '-' (a line). */
  function menuButton(items, { label = L('more'), cls = 'ns-iconbtn', content = null, down = true } = {}) {
    const b = h('button', { class: cls + ' ns-menubtn', 'data-pop': '1', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label, onclick: e => { e.stopPropagation(); const had = b.parentElement?.querySelector(':scope > .ns-pop'); closePops(); if (!had) popMenu(b, typeof items === 'function' ? items() : items, { down }); } }, content || svg('dots'));
    return h('span', { class: 'ns-menu' }, b);
  }
  function popMenu(anchor, items, { down = true } = {}) {
    const list = (items || []).filter(Boolean);
    const pop = h('div', { class: 'ns-pop' + (down ? ' down' : ''), role: 'menu' }, ...list.map(it => it === '-' ? h('hr') : h('button', { role: 'menuitem', class: it.danger ? 'danger' : '', disabled: it.disabled || null, onclick: e => { e.stopPropagation(); closePops(); it.href ? go(it.href) : it.run?.(e); } },
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
  function tip(text) { F.layer.querySelector('.ns-tip')?.remove(); const t = h('div', { class: 'ns-tip', role: 'status' }, text); F.layer.append(t); clearTimeout(tipT); tipT = setTimeout(() => t.remove(), 5500); }
  const hint = text => h('button', { class: 'ns-hint', 'aria-label': L('whatIsThis'), title: L('whatIsThis'), onclick: e => { e.stopPropagation(); tip(text); } }, 'i');
  /** A sheet from the bottom (phones) / the right (wide screens). build(body, close) */
  function sheet(title, build, { cls = '' } = {}) {
    const close = () => { F.layer.replaceChildren(); };
    const body = h('div', { class: 'ns-shbody' });
    F.layer.replaceChildren(h('div', { class: 'ns-scrim', onclick: close }), h('aside', { class: 'ns-sheet ' + cls, role: 'dialog', 'aria-label': title },
      h('div', { class: 'ns-shhead' }, h('b', {}, title), h('button', { class: 'ns-iconbtn', 'aria-label': L('close'), onclick: close }, svg('close'))), body));
    build(body, close); return close;
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
      const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await N().notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toast(take ? L('upToDate', { title: sh.title }) : L('keepYours', { title: sh.title })); else b.disabled = false; } catch (er) { toast('⚠️ ' + er.message, 5000); b.disabled = false; } };
      bar.append(h('span', { class: 'grow' }, ...N().updateText(sh), more), h('button', { class: 'btn small primary', onclick: act(true) }, N().updateLabel(sh)), h('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? L('keepCopy') : L('keepMine')), laterBtn);
      return;
    }
    const cur = sh.kind === 'curriculum';
    bar.append(h('span', { class: 'grow' }, cur ? '👥 ' : '📬 ', ...rich(cur ? 'invitesYou' : 'wantsShare', { who: sh.from_name || sh.from_email || L('someone'), title: sh.title }), more),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await N().notes.accept(sh); toast(L(cur ? 'joinedToast' : 'addedToast', { title: s.title })); subjCache = null; if (confirm(L('openNow', { title: s.title }))) accepted(s); } catch (er) { toast('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, cur ? L('join') : L('accept')),
      h('button', { class: 'btn small', onclick: async () => { await N().notes.reject(sh).catch(er => toast('⚠️ ' + er.message)); } }, L('reject')), laterBtn);
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
    const p = (location.hash || '#/').replace(/^#\/?/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    const k = p[0] || '';
    if (ENGINE_ROUTES.has(k)) {
      if (!ENGINE && pendingEngine) { chrome({ tab: 'learn', crumbs: [['…']] }); F.main.dataset.page = '@wait'; F.main.replaceChildren(h('div', { class: 'ns-view ns-wait' }, faceEl(undefined, 'breathe'))); return; }
      if (!ENGINE) { location.replace('#/'); return; }
      chrome(subjectChrome());
      ENGINE.route();
      return;
    }
    if (k === 'lang' && TH()?.world() === 'know') { location.replace('#/'); return; }
    if (k === 'learn' && TH()?.world() === 'lang') { location.replace('#/lang'); return; }
    if (F.main.dataset.page !== k) { F.main.replaceChildren(); }
    F.main.dataset.page = k;
    document.body.classList.remove('ns-mapmode');
    const page = PAGES[k] || PAGES[''];
    try { page(p.slice(1)); } catch (e) { console.error('[shell]', e); F.main.replaceChildren(h('div', { class: 'ns-view' }, h('p', {}, '⚠️ ' + e.message))); }
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
        h('span', { class: 'rm' }, (s.emoji || '📘') + ' ', rm ? rm.title || rm.goal : s.title || r0.title),
        h('h2', {}, r0.secTitle || s.title || r0.title),
        h('span', { class: 'meta' }, r0.chNum ? pill(L('chOf', { n: r0.chNum, of: r0.chOf }), 2) : null, r0.secNum ? pill(L('secOf', { n: r0.secNum, of: r0.secOf }), 4) : !r0.sid ? pill(L('start'), 1) : null),
        rm && r0.node ? h('span', { class: 'step wide' }, L('stepIs', { step: rm.nodes?.[r0.node]?.title || r0.node })) : null,
        h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')));
    } else if (!(w === 'lang' && WORLDS.lang?.today)) box.append(firstSteps());
    if (w !== 'know' && WORLDS.lang?.today) WORLDS.lang.today(box, { h, L, open, go });   // the language courses' own "continue" (docs/NEW_FRAME_AND_LANGUAGES.md)
    // continue elsewhere
    const more = rec.slice(1, 4);
    if (more.length) box.append(h('div', {}, h('span', { class: 'ns-label' }, L('continueElsewhere')), h('div', { class: 'ns-list' }, ...more.map(r => { const s = byId[r.subj] || {};
      return h('button', { class: 'ns-item', onclick: () => open(r.subj, r.sid ? '#/s/' + r.sid : '#/subject') }, icoTxt(s.emoji || '📘', (s.title || '').length % 4 + 1, 'emo'), h('span', { class: 't' }, h('b', {}, s.title || r.title), h('small', {}, [r.chNum ? L('chOf', { n: r.chNum, of: r.chOf }) : null, r.at ? L('lastSeen', { when: ago(r.at) }) : null].filter(Boolean).join(' · '))), chev()); }))));
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
      return h('button', { class: 'ns-go', onclick: () => go('#/map/' + encodeURIComponent(c.id) + (nx ? '/' + encodeURIComponent(nx) : '')) }, h('span', { class: 'rm' }, '🧭 ', c.title || c.goal), h('h2', {}, nx ? c.nodes[nx]?.title : L('openMap')), h('span', { class: 'meta' }, pill(L('nextStep'), 2)), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')); }
    return h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('h2', {}, L('welcomeTitle')), h('p', { class: 'ns-muted' }, L('welcomeText')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => CM()?.create(acc(), { onStudy }) }, L('newRoadmap')), h('button', { class: 'btn', onclick: () => go('#/discover') }, L('discover')), h('button', { class: 'btn ghost', onclick: () => go('#/shelf') }, L('shelf'))));
  }
  const ago = t => { const d = Math.round((Date.now() - t) / DAY); return d <= 0 ? L('today').toLowerCase() : d === 1 ? L('yesterday') : L('daysAgo', { n: d }); };
  /** Review / mistakes live in each subject: one subject → go straight there; several → choose. */
  function reviewGo(kind, per) {
    const list = per.filter(x => kind === 'gym' ? x.wr : x.fc + x.pb);
    const dest = x => kind === 'gym' ? '#/mistakes' : x.fc ? '#/cards' : '#/drills';
    if (!list.length) { if (ENGINE) go(kind === 'gym' ? '#/mistakes' : '#/cards'); else tip(kind === 'gym' ? L('gymNone') : L('reviewNone')); return; }
    if (list.length === 1) { open(list[0].s.id, dest(list[0])); return; }
    sheet(kind === 'gym' ? L('gym') : L('review'), body => body.append(h('p', { class: 'ns-muted' }, L('pickWhere')), h('div', { class: 'ns-list' }, ...list.map(x => h('button', { class: 'ns-item', onclick: () => { F.layer.replaceChildren(); open(x.s.id, dest(x)); } }, icoTxt(x.s.emoji || '📘', 4, 'emo'), h('span', { class: 't' }, h('b', {}, x.s.title), h('small', {}, kind === 'gym' ? L('gymSub', { n: x.wr }) : L('reviewSub', { fc: x.fc, pb: x.pb }))), chev())))));
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
    const shelfBtn = h('button', { class: 'ns-shelflink', onclick: () => go('#/shelf') }, '📚 ', L('shelf'));
    v.append(h('div', { class: 'ns-shelf' }, shelfBtn));
    N().shelf?.(acc()).then(l => { shelfBtn.textContent = '📚 ' + L('shelfN', { n: l.length }); }).catch(() => { });
    const off = CU()?.onChange?.(() => { if (v.isConnected && F.main.dataset.page === 'learn') { clearTimeout(PAGES.learn.t); PAGES.learn.t = setTimeout(() => { if (v.isConnected) PAGES.learn(); }, 300); } else off?.(); });
  };
  function learnMenu() {
    return [{ label: L('newRoadmap'), icon: 'plus', run: () => CM()?.create(acc(), { onStudy }) }, { label: L('importMap'), sub: L('importMapSub'), icon: 'download', run: () => CM()?.importMap(acc(), { onStudy }) },
      { label: L('exploreRoadmaps'), icon: 'globe', run: () => CM()?.exploreCurricula?.(acc(), { onStudy }) }, '-', { label: L('shelf'), icon: 'shelf', href: '#/shelf' }];
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
      h('div', { class: 'row nowrap' }, icoTxt(sh ? '👥' : c.emoji || '🧭', (i % 4) + 1, 'emo'), h('div', { class: 'grow' }, h('b', { class: 'ttl' }, c.title || c.goal), h('small', { class: 'ns-muted' }, sh ? (sh.role === 'member' ? L('sharedBy', { who: sh.ownerName || '…' }) + ' · ' : L('youShare') + ' · ') : '', sub)), chev()),
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
    if (hidden) v.append(h('button', { class: 'ns-shelflink', onclick: () => go('#/me/subjects') }, '🙈 ', L('hiddenN', { n: hidden })));
    function draw() {
      const term = q.value.trim().toLowerCase(), items = list.filter(s => !term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term));
      listBox.replaceChildren(...items.map((s, i) => shelfItem(s, i, async () => { list = (await N().shelf(acc()).catch(() => [])).filter(x => !isLang(x)); draw(); })));
      if (!items.length) listBox.replaceChildren(h('div', { class: 'ns-item ns-muted' }, list.length ? L('noMatch') : L('shelfEmpty')));
    }
    draw();
  };
  function shelfMenu() {
    return [{ label: L('importFile'), sub: L('importFileSub'), icon: 'upload', run: importFile }, { label: L('createClaude'), sub: L('createClaudeSub'), icon: 'spark', run: () => N().claudeGuide({ onDone: s => landedOpen(s) }) },
      { label: L('exploreShared'), icon: 'globe', run: () => N().explore() }, { label: L('allSubjects'), sub: L('allSubjectsSub'), icon: 'book', run: () => N().openSubjectPicker?.() }];
  }
  function shelfItem(s, i, refresh) {
    const pct = Math.round(subjectPct(s) * 100), own = s.origin !== 'library';   // like the older Shelf chips: everything but the library can be shared
    const menu = menuButton([{ label: L('study'), icon: 'play', run: () => open(s.id) },
      CM()?.attachDialog ? { label: L('putOnMap'), sub: L('putOnMapSub'), icon: 'map', run: () => CM().attachDialog(acc(), { subject: s, onDone: refresh }) } : null,
      { label: L('editSubject'), sub: L('editSubjectSub'), icon: 'edit', run: () => N().editSubject(s, { onChange: refresh }) },
      own ? { label: L('shareSubject'), sub: L('shareSubjectSub'), icon: 'share', run: () => N().share(s) } : null,
      { label: L('exportPackage'), sub: L('exportPackageSub'), icon: 'download', run: async () => { try { const p = await N().loadSubject(acc(), s.id); await N().exportPackage(acc(), p); } catch (e) { toast('⚠️ ' + e.message, 4000); } } }], { label: L('moreFor', { title: s.title }) });
    return h('div', { class: 'ns-itemwrap noema-chipwrap' }, h('button', { class: 'ns-item ns-subj', 'data-subject': s.id, style: { animationDelay: i * 25 + 'ms' }, title: s.description || '', onclick: () => open(s.id) }, icoTxt(s.emoji || '📘', (i % 4) + 1, 'emo'),
      h('span', { class: 't' }, h('b', {}, s.title, s.updateAvailable ? ' ✨' : ''), h('small', {}, [s.counts?.chapters ? L('nChapters', { n: s.counts.chapters }) : null, s.sharedBy ? L('sharedBy', { who: s.sharedBy }) : s.publicOwner ? L('from', { who: s.publicOwner }) : s.origin === 'private' ? '🔒' : null].filter(Boolean).join(' · '))),
      pct ? pill(pct + '%', 2) : chev()), menu);
  }
  const subjectPct = s => { const st = stateOf(s.id); if (!st || !s.counts?.exercises) return 0; return Math.min(1, Object.values(st.res || {}).filter(r => r.ok > 0).length / s.counts.exercises); };
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.zip,.json,.noemapack', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; inp.remove(); if (!f) return; try { const s = await N().importPackFile(acc(), f); landedOpen(s); } catch (er) { toast('⚠️ ' + er.message, 4000); } } });
    document.body.append(inp); inp.click();
  }
  function landedOpen(s) { if (!s) return; subjCache = null; toast(L('onShelfNow', { title: s.title || s.id }), 5000); open(s.id); }

  /* ---------- a Roadmap: the treasure map (engine/curmap.js draws it, here as a page) ---------- */
  PAGES.map = ([cid, nid]) => {
    const c = CU()?.get(acc(), cid);
    if (!c || !CM()) { page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn']], back: '#/learn' }, h('p', { class: 'ns-muted' }, L('rmMissing'))); return; }
    const host = h('div', { class: 'ns-maphost' });
    page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [shortTitle(c)]], back: '#/learn', cls: 'ns-mapview', fab: true }, host);
    document.body.classList.add('ns-mapmode');
    const opts = CM().mapOpts?.next || {}; if (CM().mapOpts) CM().mapOpts.next = null;
    CM().map(acc(), cid, { focus: nid || null, onStudy, page: host, chrome: m => chrome({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [shortTitle(CU().get(acc(), cid) || c)]], back: '#/learn', menu: m, menuLabel: L('mapMenu'), fab: !!ENGINE }), ...opts });
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

  /* ---------- Discover: everything that adds something new ---------- */
  PAGES.discover = () => {
    const w = TH()?.world() || 'know', item = (ic, n, title, sub, run, cls = '') => h('button', { class: 'ns-item ' + cls, onclick: run }, typeof ic === 'string' ? ico(ic, n) : ic, h('span', { class: 't' }, h('b', {}, title), h('small', {}, sub)), chev());
    page({ tab: 'discover', crumbs: [[L('discover')]], corner: true },
      h('h1', {}, L('discover')),
      h('div', { class: 'ns-list' },
        item('search', 4, L('exploreShared'), w === 'lang' ? L('exploreLangSub') : L('exploreSub'), () => N().explore(), 'ns-explore'),
        w !== 'lang' ? item('people', 2, L('exploreRoadmaps'), L('exploreRoadmapsSub'), () => CM()?.exploreCurricula?.(acc(), { onStudy })) : null,
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
      h('div', { class: 'grow' }, h('span', { class: 'ns-label' }, tx.place || ''), h('h2', {}, L('xpToLevel', { n: lv.need - lv.into, lv: lv.lv + 1 })), h('p', { class: 'ns-muted' }, L('xpTotal', { xp: (st.xp || 0).toLocaleString(lang()) })))));
    // the week as stepping stones; the 7th holds a small chest
    const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * DAY); return { k: d.toISOString().slice(0, 10), l: d.toLocaleDateString(lang(), { weekday: 'narrow' }) }; });
    const stones = [[40, 90], [110, 70], [180, 84], [250, 62], [320, 78], [390, 58], [460, 72]];
    const did = days.map(d => (st.xpDay || {})[d.k] > 0);
    const trail = `<svg class="ns-trail" viewBox="0 0 500 130" role="img" aria-label="${L('trailAria', { n: did.filter(Boolean).length })}"><path d="M40 90 Q75 60 110 70 T180 84 T250 62 T320 78 T390 58 T460 72" fill="none" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="3 7" opacity=".6"/>`
      + stones.map(([x, y], i) => did[i] ? `<ellipse cx="${x}" cy="${y}" rx="20" ry="9" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/>` : `<ellipse cx="${x}" cy="${y}" rx="20" ry="9" fill="none" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="4 4"/>`).join('')
      + `<rect x="447" y="42" width="26" height="18" rx="4" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/><path d="M447 50 h26" stroke="var(--t2i)" stroke-width="1.5"/>`
      + days.map((d, i) => `<text x="${stones[i][0]}" y="${stones[i][1] + 28}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink3)">${d.l}</text>`).join('')
      + `<g transform="translate(${Math.max(0, did.lastIndexOf(true)) * 70 + 4} -8)"><g class="breathe">${ART()?.mascot(m, 64, 59) || ''}</g></g></svg>`;
    v.append(h('section', { class: 'ns-panel center' }, h('h2', {}, sn ? L('streakDays', { n: sn }) : L('streakStart')), h('p', { class: 'ns-muted' }, sn ? L('streakKeep') : L('streakStartSub')), h('div', { html: trail })));
    // the collection: one item per section you have read; this week's shine
    const subs = await subjects();
    let read = 0, fcN = 0, boss = 0; for (const s of subs) { const x = stateOf(s.id); if (!x) continue; read += Object.keys(x.read || {}).length; fcN += Object.keys(x.fc || {}).length; boss += Object.keys(x.boss || {}).length; }
    const wk = weekKey(), cw = jget(`noema1:${acc()}:meta:collweek`, null); let base = cw?.week === wk ? cw.base : read; if (!cw || cw.week !== wk) jset(`noema1:${acc()}:meta:collweek`, { week: wk, base: read });
    const fresh = Math.max(0, read - base);
    v.append(h('section', { class: 'ns-panel' }, h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, tx.coll || ''), pill(L('nConcepts', { n: read }), 1)),
      h('div', { class: 'ns-coll', html: `<svg viewBox="0 0 300 230" role="img" aria-label="${(tx.coll || '').replace(/"/g, '')}: ${read}">${ART()?.collection(m, read, fresh) || ''}</svg>` }),
      h('p', { class: 'tiny center' }, L('collNote', { item: tx.item || '', n: fresh }))));
    // the week's XP
    const max = Math.max(settings().goal || 120, ...days.map(d => (st.xpDay || {})[d.k] || 0)), wsum = days.reduce((a, d) => a + ((st.xpDay || {})[d.k] || 0), 0);
    v.append(h('section', { class: 'ns-panel' }, h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('xpWeek')), pill(wsum, 1)),
      h('div', { class: 'ns-bars' }, ...days.map((d, i) => h('div', {}, h('i', { class: i === 6 ? 'today' : '', style: { height: (((st.xpDay || {})[d.k] || 0) / max * 100) + '%', '--i': i } }), h('span', {}, d.l))))));
    // treasures found (medals)
    const mastered = (CU()?.list(acc()) || []).reduce((a, c) => a + (c.status === 'ready' ? CU().summary(acc(), c).mastered : 0), 0);
    const MED = [[mastered >= 1, '1', L('medalStep'), 1], [fcN >= 100, '100', L('medalCards', { n: Math.min(fcN, 100) }), 4], [sn >= 7, '7', L('medalWeek', { n: Math.min(sn, 7) }), 2], [boss >= 1, '👑', L('medalBoss'), 3], [(st.xp || 0) >= 1000, '1k', L('medalXp'), 1], [sn >= 30, '30', L('medalMonth', { n: Math.min(sn, 30) }), 2]];
    v.append(h('section', { class: 'ns-panel' }, h('span', { class: 'ns-label' }, L('treasures')), h('div', { class: 'ns-medals' }, ...MED.map(([ok, x, l, n]) => h('div', { class: 'ns-medal' + (ok ? '' : ' lock') }, h('div', { class: 'm', style: ok ? tone(n) : null }, x), h('small', {}, l))))));
    v.append(h('p', { class: 'tiny' }, L('gameNote'), ' ', h('button', { class: 'linkish', onclick: () => go('#/me/look') }, L('look'))));
    rememberMedals(MED.filter(x => x[0]).length);
  };
  const weekKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  function rememberMedals(n) { const k = `noema1:${acc()}:meta:medals`, was = jget(k, null); jset(k, n); if (was != null && n > was) window.NoemaReact?.big('medal'); }

  /* ---------- Me: the account, the character, settings, data ---------- */
  const ME_VIEWS = { profile: 'profile', ai: 'settings', subjects: 'subjects', backup: 'backup', cloud: 'cloud', help: 'help', data: 'cloud' };
  PAGES.me = ([sec]) => {
    if (sec === 'look') return lookPage();
    if (sec && ME_VIEWS[sec]) return mePage(sec);
    const a = N().account || {}, m = TH()?.owned(), t = tv(m);
    const changeAt = TH()?.nextChangeAt(), can = TH()?.canChange();
    const it = (icon, n, title, sub, run, extra = {}) => h('button', { class: 'ns-item', onclick: run, ...extra }, icon, h('span', { class: 't' }, h('b', {}, title), sub ? h('small', {}, sub) : null), chev());
    const w = TH()?.world() || 'know';
    page({ tab: 'me', crumbs: [[L('myAccount')]], fab: false },
      h('div', { class: 'ns-hello' }, h('span', { class: 'ns-me big' }, a.emoji || (a.name || '?')[0]), h('div', { class: 'grow' }, h('h1', {}, L('myAccount')), h('p', { class: 'tiny' }, [a.name, a.kind === 'cloud' ? '☁️ ' + (a.email || '') : L('localProfile')].filter(Boolean).join(' · ')))),
      h('section', { class: 'ns-panel' }, h('span', { class: 'ns-label' }, L('whatILearn')), h('p', { class: 'tiny' }, L('whatILearnSub')),
        h('div', { class: 'ns-seg', role: 'radiogroup', 'aria-label': L('whatILearn') }, ...[['know', L('knowledge')], ['lang', L('languages')], ['both', L('both')]].map(([k, l]) => h('button', { class: w === k ? 'on' : '', role: 'radio', 'aria-checked': String(w === k), onclick: () => { TH().putSettings({ world: k }); drawTabs(); PAGES.me([]); } }, l)))),
      h('div', { class: 'ns-list' },
        it(h('span', { class: 'ns-ico face', style: tone(2) }, faceEl(m)), 2, L('character'), TH()?.locked() ? L('charLocked', { tutor: t.tutor }) : `${t.tutor} · ${can ? L('canChange') : L('nextChange', { date: fmtDate(changeAt) })}`, () => go('#/character')),
        it(ico('user', 4), 4, L('profile'), L('profileSub'), () => go('#/me/profile')),
        it(ico('spark', 2), 2, L('aiTitle'), L('aiSub'), () => go('#/me/ai')),
        it(ico('palette', 4), 4, L('look'), L('lookSub', { lang: (window.NoemaI18n?.LANGS.find(x => x[0] === lang()) || [, lang()])[1] }), () => go('#/me/look')),
        ENGINE ? it(ico('clock', 1), 1, L('activity'), L('activitySub'), () => ENGINE.history?.()) : null,
        it(ico('book', 3), 3, L('mySubjects'), L('mySubjectsSub'), () => go('#/me/subjects')),
        it(ico('cloud', 1), 1, L('data'), L('dataSub'), () => go('#/me/data')),
        it(ico('help', 2), 2, L('help'), L('helpSub'), () => go('#/me/help'))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => N().openAccountPicker?.() }, svg('user'), L('switchProfile'))));
  };
  function mePage(sec) {
    const titles = { profile: L('profile'), ai: L('aiTitle'), subjects: L('mySubjects'), backup: L('backup'), cloud: L('data'), data: L('data'), help: L('help') };
    const v = page({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [titles[sec]]], back: '#/me', fab: false }, h('h1', {}, titles[sec]));
    if (!ENGINE?.accView) { v.append(h('div', { class: 'ns-panel' }, h('p', {}, L('needSubject')), h('button', { class: 'btn primary', onclick: () => N().openSubjectPicker?.() }, L('pickSubject')))); return; }
    const body = h('div', { class: 'accbody ns-accbody' }); v.append(body);
    const close = () => go('#/me');
    if (sec === 'data') { ENGINE.accView('cloud', body, close); const b2 = h('div', { class: 'accbody ns-accbody' }); v.append(h('h2', { class: 'ns-h2' }, L('backup')), b2); ENGINE.accView('backup', b2, close); return; }
    ENGINE.accView(ME_VIEWS[sec], body, close, sec === 'ai' ? { only: 'ai' } : {});
  }
  /* Language & appearance: menus language, light/dark, how much "game", sound, reading, goal */
  function lookPage() {
    const s = settings(), engineS = window.S?.settings || {};
    const v = page({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('look')]], back: '#/me', fab: false }, h('h1', {}, L('look')));
    const uiL = h('select', { class: 'noema-input', 'aria-label': L('uiLang') }, h('option', { value: '' }, L('uiLangAuto', { lang: (window.NoemaI18n?.LANGS.find(x => x[0] === NoemaI18n.browser()) || [, 'English'])[1] })), ...(window.NoemaI18n?.LANGS || []).map(([k, l]) => h('option', { value: k, selected: s.lang === k || null }, l)));
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
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/character') }, faceEl(TH()?.owned(), 'mini'), L('character'))));
    uiL.addEventListener('change', () => { putS({ lang: uiL.value || undefined }); location.reload(); });
  }
  /** Save account settings (a:settings, synced) and keep the open subject's copy (S.settings) in step. */
  function putS(patch) {
    if (window.S?.settings) { Object.assign(window.S.settings, patch); try { window.flushSave?.(); } catch (e) { } }
    TH()?.putSettings(patch);
  }

  /* ---------- the character gallery: try anyone for 5 minutes, change once every 15 days ---------- */
  PAGES.character = () => {
    const own = TH().owned(), can = TH().canChange(), locked = TH().locked(), at = TH().settings().characterAt;
    const v = page({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('character')]], back: '#/me', fab: false },
      h('div', {}, h('span', { class: 'ns-label' }, L('companion')), h('h1', {}, L('character'))),
      h('p', { class: 'ns-muted' }, L('characterIntro')),
      h('p', { class: 'tiny' }, locked ? L('charLockedLong') : can ? L('canChangeNow') : L('changedOn', { date: fmtDate(at), next: fmtDate(TH().nextChangeAt()) })));
    const gal = h('div', { class: 'ns-gal' }); v.append(gal);
    const sample = { el: 'Αα Καλησπέρα', en: 'Aa Good evening', ru: 'Аа Добрый вечер', fr: 'Aa Bonsoir' }[lang()] || 'Aa';
    for (const g of ['animals', 'tales', 'grown']) {
      gal.append(h('span', { class: 'ns-label galsep' }, L('group_' + g)));
      for (const k of TH().GROUPS[g]) {
        const t = TH().text(k), d = TH().DATA[k], cur = k === own, nm = tv(k).tutor;
        gal.append(h('div', { class: 'ns-gcard' + (cur ? ' cur' : ''), 'data-m': k, 'data-char': k },
          cur ? h('span', { class: 'badge' }, pill(L('yours'), 1)) : null, faceEl(k, 'breathe'),
          h('h3', {}, nm), h('span', { class: 'tiny' }, `${t.name} · ${t.world}`),
          h('span', { class: 'sws' }, ...[d.light[6], d.light[9], d.light[11], d.light[13], d.light[15]].map(c => h('i', { style: { background: c } }))),
          h('span', { class: 'fs' }, sample),
          cur || locked ? null : h('div', { class: 'row' }, h('button', { class: 'btn small soft', 'data-try': k, onclick: () => { TH().startPreview(k); toast(L('tryingNow', { tutor: nm }), 2500); } }, L('try5'))
            , !TH().settings().character ? h('button', { class: 'btn small', onclick: () => { TH().choose(k); window.NoemaReact?.big('level', L('welcomeWorld')); } }, L('choose')) : null)));
      }
    }
  };
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

  /* ---------- first time: what do you want to learn, and who comes with you ---------- */
  function maybeOnboard() {
    const cfg = window.NOEMA_CONFIG || {};
    if (cfg.onboarding === false || settings().onboarded || !acc()) return;
    onboarding(1);
  }
  function onboarding(step, picked = {}) {
    const modal = (...kids) => F.layer.replaceChildren(h('div', { class: 'ns-scrim', 'data-sticky': '1' }), h('div', { class: 'ns-modal ns-onb', role: 'dialog', 'aria-modal': 'true', 'data-sticky': '1' }, ...kids));
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
    const grid = h('div', { class: 'ns-pick' }, ...TH().ORDER.map(k => h('button', { class: k === sel ? 'on' : '', 'data-m': k, 'data-onbm': k, onclick: e => { sel = k; TH().apply(k); grid.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, faceEl(k), h('span', {}, tv(k).tutor))));
    function finish() { if (!TH().locked()) TH().choose(sel, { force: true }); TH().putSettings({ onboarded: Date.now() }); F.layer.replaceChildren(); route(); setTimeout(() => window.NoemaReact?.big('hello'), 400); }
    modal(h('h1', { class: 'center' }, L('onbWho')), h('p', { class: 'ns-muted center' }, L('onbWhoSub')), grid, h('button', { class: 'btn primary', 'data-onbdone': '1', onclick: finish }, L('onbGo')), h('p', { class: 'tiny center' }, L('onbWhoLater')));
  }

  /* ======================= for the engine ======================= */
  /** The engine of the open subject calls this once it has booted: from now on its routes are drawn by it. */
  function attachEngine(api) {
    ENGINE = api; pendingEngine = false; F.fab && (F.fab.hidden = false);
    if (mounted) route();
  }
  /** The subject could not be loaded: say so and stay on the shell's pages. */
  function noEngine(msg) { pendingEngine = false; toast('⚠️ ' + msg, 6000); if (ENGINE_ROUTES.has((location.hash || '').replace(/^#\/?/, '').split('/')[0])) location.replace('#/'); else route(); }
  /** Small items an engine page shows in the top bar, next to ⋮ (e.g. the focus-sprint clock). */
  function setActs(nodes) { F.acts.prepend(...nodes.filter(Boolean)); }

  return { level: LEVEL, mount, attachEngine, noEngine, chrome, subjectChrome, route, go, open, menuButton, popMenu, closePops, sheet, tip, hint, h, svg, faceEl, ico, icoTxt, pill, bar, ring, L, tv, noteRecent, recent, registerWorld, setActs, onboarding, importFile,
    get mounted() { return mounted; }, get engine() { return ENGINE; }, ENGINE_ROUTES };
})();
