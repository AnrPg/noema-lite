/* =====================================================================================
   noema-lite — ⚑ problem reports (docs/REPORTS.md).
   The ⚑ at the foot of the side bar (Me ▾ › Report a problem on phones): a screenshot of the screen as it is, a few
   words, optionally the very thing pointed at (🎯), and the exact place — the address, the subject and its pack
   version, the chapter, section, block, exercise or card and the field inside it, the trap or drill, the interface
   text and its catalog key, the UI and content languages, the language course, the build of the app, the last errors.
   Sent to the table noema_error_reports (cloud/supabase.sql §15); the app's admins (noema_admins) review them on
   #/admin/reports, and Claude reads them through the connector (noema_reports, noema_report) with the same brief.
   The brief, the repository paths, sending and the outbox: src/features/reports (NoemaCore.reports, also the connector's).
   ===================================================================================== */
(function (root) {
  'use strict';
  // the reports' domain and use cases (the kinds, the statuses, the brief, the repository paths, sending and the outbox, the admins' list)
  // are NoemaCore.reports (src/features/reports); this file is the ⚑ dialog, the place it collects and #/admin/reports
  const R = root.NoemaCore.reports;
  const { KINDS, STATUSES } = R;
  const API = root.NoemaReport = {};
  if (typeof document === 'undefined' || !root.document) return;

  /* ======================= in the app ======================= */
  const N = () => root.Noema, CL = () => root.NoemaCloud, SH = () => root.NoemaShell;
  const T = (k, p) => root.NoemaI18n ? NoemaI18n.t('report.' + k, p) : k;
  const toast = (m, ms) => N()?.toast?.(m, ms);
  const clip = (s, n = 300) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const cloudOn = () => N()?.account?.kind === 'cloud' && !!CL()?.session?.();

  /* ---------- the last errors of the page (kept from the start: a report about something broken says what failed) ---------- */
  const ERRS = [];
  const note = (level, args) => { try { ERRS.push({ level, at: new Date().toISOString().slice(11, 19), msg: clip([...args].map(a => a instanceof Error ? a.message + (a.stack ? ' @ ' + String(a.stack).split('\n')[1]?.trim() : '') : typeof a === 'string' ? a : JSON.stringify(a)).join(' '), 400) }); if (ERRS.length > 15) ERRS.shift(); } catch (e) { } };
  for (const level of ['error', 'warn']) { const orig = console[level]; console[level] = function (...a) { note(level, a); return orig.apply(this, a); }; }
  root.addEventListener('error', e => note('error', [e.message + (e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno}:${e.colno})` : '')]));
  root.addEventListener('unhandledrejection', e => note('error', ['unhandled rejection: ', e.reason instanceof Error ? e.reason : String(e.reason)]));

  /* ---------- the place: everything that locates the problem uniquely ---------- */
  const SKIP = '.nr-skip, .ns-layer, .ns-pop, .nr-hl';   // i18n-ignore (selectors)
  /** The data-* of an element and its parents (the engine's data-ex, data-bid, data-card, data-pid, data-nf, the course's data-node, data-lex …). */
  function dataChain(el) {
    const out = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      const d = {}; for (const a of e.attributes) if (a.name.startsWith('data-') && !/^data-(pop|sticky|off)$/.test(a.name)) d[a.name.slice(5)] = clip(a.value, 120);
      if (Object.keys(d).length) out.push(d);
      if (out.length >= 12) break;
    }
    return out;
  }
  /** A CSS path that finds the element again (ids, then tags with their classes and position). */
  function selectorOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) { parts.unshift('#' + e.id); break; }
      let s = e.tagName.toLowerCase(); const cls = [...e.classList].filter(c => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 3); if (cls.length) s += '.' + cls.join('.');
      const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(s); if (parts.length >= 7) break;
    }
    return parts.join(' > ');
  }
  /** Which catalog keys (i18n/<component>/*.arb) make this text: the interface's own words, in the shown locale and in English. */
  let REV = null;
  function reverseCatalog() {
    if (REV) return REV;
    const I = root.NoemaI18n, cats = I?.catalogs || {}, out = [];
    for (const loc of [...new Set([I?.locale || 'en', 'en'])]) {
      const m = cats[loc]?.m || cats[loc] || {};
      for (const [key, msg] of Object.entries(m)) {
        if (typeof msg !== 'string' || msg.length < 2) continue;
        const lit = [], src = String(msg); let i = 0, cur = '';
        while (i < src.length) {   // the literal parts; any {…} (a value, a plural, a select) is a gap
          if (src[i] === '{') { let d = 0; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) break; } i++; lit.push(cur); cur = ''; continue; }
          cur += src[i++];
        }
        lit.push(cur);
        const parts = lit.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (!parts.length) continue;
        out.push({ key, loc, parts, len: parts.join('').length, re: new RegExp('^' + lit.map(x => x.replace(/\s+/g, ' ').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?') + '$', 'su') });
      }
    }
    return (REV = out);
  }
  function catalogKeys(el) {
    if (el.closest?.('[data-nf], .nb-root .nw')) return [];   // the pack's own words (a field of an exercise, a block, a card), not the interface's
    const texts = [];
    for (let e = el, n = 0; e && e.nodeType === 1 && n < 3; e = e.parentElement, n++) {
      for (const c of e.childNodes) if (c.nodeType === 3 && c.textContent.trim()) texts.push(c.textContent);   // its own words first, then all of its text, then its labels
      const own = clip(e.innerText || e.textContent || '', 400); if (own) texts.push(own);
      for (const a of ['aria-label', 'title', 'placeholder']) if (e.getAttribute?.(a)) texts.push(e.getAttribute(a));
    }
    const cands = [...new Set(texts.map(t => String(t).replace(/^[\p{Extended_Pictographic}️‍\s▾▸›‹←→⚑✓✅]+/u, '').replace(/\s+/g, ' ').trim()).filter(t => t.length >= 2))];
    const hits = [];
    try {
      const rev = reverseCatalog();
      cands.forEach((t, i) => { for (const r of rev) if (r.len >= Math.max(3, t.length * 0.4) && r.re.test(t) && !hits.some(h => h.key === r.key)) hits.push({ key: r.key, locale: r.loc, text: clip(t, 160), exact: r.parts.length === 1, len: r.len, i }); });
    } catch (e) { }
    return hits.sort((a, b) => a.i - b.i || b.exact - a.exact || b.len - a.len).slice(0, 4).map(({ len, exact, i, ...x }) => x);   // the closest words first
  }
  /** The address of the page, as the shell reads it: #/<page>/<args…>?… */
  function routeNow() {
    const hash = location.hash || '#/';
    const args = hash.replace(/^#\/?/, '').split('?')[0].split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    return { hash, page: args[0] || '', args: args.slice(1) };
  }
  /** From the address and the element's data-* chain to the pack's own terms (chapter, section, block, exercise, card …). */
  function placeOf(rt, chain) {
    const p = {}, a = rt.args, pick = k => chain.find(d => d[k] != null)?.[k];
    if (rt.page === 'ch' && a[0]) p.chapter = a[0];
    if (rt.page === 's' && a[0]) { p.section = a[0]; if (a[1]) p.block = a[1]; }
    if (rt.page === 'ex' && a[0]) p.exercise = a[0];
    if (rt.page === 'drill' && a[0]) p.drill = a[0];
    if (rt.page === 'cards' && a[0]) p.card = a[0];
    if (rt.page === 'boss' && a[0]) p.chapter = a[0];
    const ex = pick('ex'), bid = pick('bid'), card = pick('card'), pid = pick('pid'), nf = chain[0]?.nf ?? pick('nf'), ch = pick('ch');
    if (ex) p.exercise = ex; if (bid) p.block = bid; if (card) p.card = card; if (pid) p.trap = pid; if (ch && !p.chapter) p.chapter = ch;
    if (nf != null) p.field = String(nf);
    return p;
  }
  const refOf = (p, keys) => p.exercise ? 'ex:' + p.exercise : p.card ? 'card:' + p.card : p.block ? `blk:${p.section || '?'}/${p.block}` : p.trap ? `trap:${p.chapter || '?'}/${p.trap}` : p.drill ? 'drill:' + p.drill : p.section ? 'sec:' + p.section : p.chapter ? 'ch:' + p.chapter : keys?.[0] ? 'ui:' + keys[0].key : null;
  /** What else is on screen: the exercises, cards and blocks in view (when nothing was pointed at, one of them is it). */
  function visibleItems() {
    const out = [];
    for (const el of document.querySelectorAll('[data-ex], [data-card], [data-bid], [data-pid]')) {
      if (el.closest(SKIP)) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
      const d = el.dataset, ref = d.ex ? 'ex:' + d.ex : d.card ? 'card:' + d.card : d.bid ? 'blk:' + d.bid : 'trap:' + d.pid;
      if (!out.some(x => x.ref === ref)) out.push({ ref, text: clip(el.innerText, 90) });
      if (out.length >= 10) break;
    }
    return out;
  }
  function subjectNow(rt) {
    const S = N()?.subject, P = N()?.pack, M = N()?.subjectMeta || {};
    if (!S || !SH()?.ENGINE_ROUTES?.has(rt.page) || S.kind === 'language') return null;
    let bridge = null; try { const b = root.NoemaBridge?.settings?.(); bridge = b?.on === false ? null : (b?.native || b?.lang || null); } catch (e) { }
    return { id: S.id, title: clip(S.title, 120), origin: M.origin || null, owner: M.owner || P?.subject?.owner || null, version: P?.version || M.version || null, builtAt: P?.builtAt || null,
      packLanguage: S.sourceLanguage || S.language || 'en', shown: S.language || 'en', translation: S.sourceLanguage ? S.language : null, bridge: typeof bridge === 'string' ? bridge : null,
      curriculum: N()?.node ? { id: N().node.id, node: N().node.node } : null };
  }
  /** Everything a report carries: built when ⚑ is pressed (before anything of the report is on screen) and again after 🎯. */
  function collect(target, picked) {
    const rt = routeNow(), chain = target ? dataChain(target) : [], keys = target ? catalogKeys(target) : [];
    const place = placeOf(rt, chain);
    let item = null; try { item = Object.keys(place).length ? SH()?.engine?.locate?.(place) || null : null; } catch (e) { item = { error: e.message }; }
    const lang = rt.page === 'lang' && rt.args[0] ? { course: rt.args[0], ...(rt.args[1] ? { view: rt.args[1] } : {}), ...(rt.args[2] ? { at: rt.args.slice(2).join('/') } : {}) } : null;
    if (lang) { const ln = chain.find(d => d.node)?.node, lx = chain.find(d => d.lex)?.lex, lg = chain.find(d => d.lang)?.lang, id = chain.find(d => d.id)?.id; if (ln) lang.node = ln; if (lx) lang.lex = lx; if (lg) lang.lang = lg; if (id) lang.id = id; }
    const r = target?.getBoundingClientRect?.();
    let given = null; try { const card = target?.closest?.('.ex'); given = card?._w?.given ? clip(card._w.given(), 400) || null : null; } catch (e) { }
    const B = root.NOEMA_BUILD || {}, I = root.NoemaI18n;
    const crumbs = [...document.querySelectorAll('.ns-crumbs > *:not(.sep)')].map(x => clip(x.innerText, 60)).filter(Boolean);
    const h1 = [...document.querySelectorAll('main h1')].find(x => !x.closest(SKIP));
    const subject = subjectNow(rt);
    const loc = {
      v: 1, at: new Date().toISOString(),
      app: { version: N()?.version || null, commit: B.commit || null, builtAt: B.builtAt || null, frame: !!SH()?.mounted, bundle: !!root.NOEMA_BUNDLE, url: location.protocol === 'file:' ? 'file://' : location.origin + location.pathname },
      route: rt,
      screen: { title: h1 ? clip(h1.innerText, 120) : clip(document.title, 120), crumbs, tab: document.querySelector('.ns-tab.on')?.dataset.tab || null },
      ui: { locale: I?.locale || 'en', dir: I?.dir || 'ltr', htmlLang: document.documentElement.lang || null, theme: document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark (system)' : 'light (system)'),
        character: root.NoemaThemes?.current?.() || null, world: root.NoemaThemes?.world?.() || null, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }, scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
        ua: navigator.userAgent, touch: matchMedia('(pointer: coarse)').matches },
      account: { kind: N()?.account?.kind || 'local' },
      subject, place, item, lang,
      target: target ? { picked: !!picked, selector: selectorOf(target), tag: target.tagName.toLowerCase(), text: clip(target.innerText || target.textContent || target.getAttribute?.('aria-label') || '', 400),
        rect: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null, data: chain, i18n: keys, given } : null,
      visible: visibleItems(), errors: ERRS.slice(-10),
    };
    loc.itemRef = refOf(place, keys) || (lang ? 'lang:' + [lang.course, lang.view, lang.node || lang.lex || lang.at].filter(Boolean).join('/') : 'page:' + (rt.page || 'today'));
    return loc;
  }

  /* ---------- the screenshot: the screen as it is (modern-screenshot, engine/vendor; loaded on the first report) ---------- */
  let libP = null;
  function lib() {
    if (root.modernScreenshot) return Promise.resolve(root.modernScreenshot);
    return libP || (libP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = (root.NOEMA_ENGINE_BASE || 'engine/') + 'vendor/modern-screenshot.umd.js'; s.onload = () => root.modernScreenshot ? ok(root.modernScreenshot) : no(new Error('no screenshot library')); s.onerror = () => { libP = null; no(new Error('screenshot library not loaded')); }; document.head.append(s); }));
  }
  /** A JPEG of what is in the window now (data: URL, ≤ ~1.4 MB), or null. */
  async function shoot() {
    try {
      const M = await lib(), y = Math.round(scrollY), x = Math.round(scrollX), w = document.documentElement.clientWidth || innerWidth, hgt = document.documentElement.clientHeight || innerHeight;
      const bg = getComputedStyle(document.body).backgroundColor;
      const scale = Math.min(devicePixelRatio || 1, 1600 / w, 1.5);
      const make = async (q, s) => M.domToJpeg(document.documentElement, { width: w, height: hgt, scale: s, quality: q, backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff', timeout: 6000,
        filter: n => !(n.nodeType === 1 && n.matches?.('.nr-skip, .ns-layer > *, script')),
        // the window's part of the page: the page moves up by the scroll; fixed bars stay where they are
        onCloneNode: c => {
          const b = c?.querySelector?.('body'); if (!b) return;
          Object.assign(c.style, { overflow: 'visible', height: hgt + 'px' });
          Object.assign(b.style, { position: 'relative', top: -y + 'px', left: -x + 'px', overflow: 'visible', height: 'auto', maxHeight: 'none' });
        } });
      let url = await make(0.72, scale);
      if (url.length > 1400000) url = await make(0.55, Math.min(scale, 1));
      return url.length <= 2900000 && /^data:image\/jpeg;base64,/.test(url) ? url : null;
    } catch (e) { console.warn('[report] screenshot', e?.message || e); return null; }   // i18n-ignore (a log)
  }

  /* ---------- 🎯 point at it ---------- */
  function pointAt() {
    return new Promise(done => {
      const box = document.createElement('div'); box.className = 'nr-hl nr-skip'; document.body.append(box);
      const tip = document.createElement('div'); tip.className = 'nr-tip nr-skip'; tip.textContent = T('pointHint'); tip.setAttribute('role', 'status'); document.body.append(tip);
      let cur = null;
      const under = (x, y) => { const e = document.elementFromPoint(x, y); return e && !e.closest('.nr-skip') ? e : null; };
      const show = e => { cur = e; if (!e) { box.style.display = 'none'; return; } const r = e.getBoundingClientRect(); Object.assign(box.style, { display: 'block', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' }); };
      const move = ev => show(under(ev.clientX, ev.clientY));
      const stop = ev => { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); };
      const end = el => { removeEventListener('pointermove', move, true); for (const t of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) removeEventListener(t, swallow, true); removeEventListener('keydown', key, true); tip.remove(); box.remove(); done(el ? { el } : null); };
      const swallow = ev => { stop(ev); if (ev.type === 'click') { const e = under(ev.clientX, ev.clientY) || cur; if (e) { show(e); end(e); } } };
      const key = ev => { if (ev.key === 'Escape') { stop(ev); end(null); } };
      addEventListener('pointermove', move, true);
      for (const t of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) addEventListener(t, swallow, { capture: true, passive: false });
      addEventListener('keydown', key, true);
    });
  }

  /* ---------- sending (and keeping it when offline) ---------- */
  const row = (loc, kind, noteText, shot) => R.row(crypto.randomUUID(), loc, kind, noteText, shot);
  /** what waits on this device goes when the app is back (and signed in to the cloud) */
  const flush = () => (cloudOn() ? R.flush() : Promise.resolve(0));

  /* ---------- the dialog ---------- */
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  let busy = false;
  /** ⚑ pressed: the place and the screenshot first (nothing of the report on screen yet), then the dialog. */
  async function open() {
    if (busy) return; busy = true;
    const X = SH(); if (!X?.modal) { busy = false; return; }
    X.closePops?.();
    document.body.classList.add('nr-shooting');
    let loc = collect(document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.nr-skip') ? document.activeElement : null, false);
    let shot = await shoot();
    document.body.classList.remove('nr-shooting');
    busy = false;
    let kind = null, withShot = !!shot, text = '';
    const { h, svg } = X;
    const draw = ({ head, body, close }) => {
      head.replaceChildren(h('h2', {}, T('title')), h('button', { type: 'button', class: 'ns-iconbtn', 'aria-label': T('cancel'), title: T('cancel'), onclick: close }, svg('close')));
      body.replaceChildren();
      const kinds = h('div', { class: 'nr-kinds', role: 'radiogroup', 'aria-label': T('kind') }, ...KINDS.map(k => h('button', { type: 'button', class: 'nr-kind' + (k === kind ? ' on' : ''), role: 'radio', 'aria-checked': String(k === kind), 'data-k': k, onclick: () => { kind = k; [...kinds.children].forEach(b => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-checked', String(b.dataset.k === k)); }); } }, T('kind_' + k))));
      const ta = h('textarea', { class: 'nr-note', rows: 4, maxlength: 4000, placeholder: T('notePh'), 'aria-label': T('note') }); ta.value = text; ta.oninput = () => { text = ta.value; };
      const pointed = loc.target?.picked ? h('div', { class: 'nr-pointed' }, svg('target'), h('span', {}, T('pointed', { what: clip(loc.target.text || loc.target.tag, 80) || loc.target.tag }))) : null;
      const pointBtn = h('button', { type: 'button', class: 'btn small nr-point', onclick: async () => {
        close(); const got = await pointAt();
        if (got) {   // the screenshot again, with the thing pointed at framed on the page itself (so the frame moves with it)
          document.body.classList.add('nr-shooting'); loc = collect(got.el, true);
          got.el.classList.add('nr-picked'); const s2 = await shoot(); got.el.classList.remove('nr-picked');
          document.body.classList.remove('nr-shooting'); if (s2) { shot = s2; withShot = true; }
        }
        X.modal(T('title'), draw, { cls: 'nr-modal nr-skip' });
      } }, svg('target'), h('span', {}, loc.target?.picked ? T('repoint') : T('point')));
      const shotBox = shot ? h('figure', { class: 'nr-shot' }, h('img', { src: shot, alt: T('shotAlt') }), h('label', { class: 'nr-check' }, (() => { const c = h('input', { type: 'checkbox', checked: withShot }); c.onchange = () => { withShot = c.checked; shotBox.classList.toggle('off', !withShot); }; return c; })(), h('span', {}, T('shot')))) : h('p', { class: 'ns-muted nr-noshot' }, T('noShot'));
      const where = h('details', { class: 'nr-details' }, h('summary', {}, T('details')), h('pre', {}, JSON.stringify({ item: loc.itemRef, route: loc.route.hash, subject: loc.subject?.id, place: loc.place, target: loc.target && { text: loc.target.text, i18n: loc.target.i18n } }, null, 1)));
      const err = h('p', { class: 'nr-err', role: 'alert' });
      const send = h('button', { class: 'btn primary nr-send', type: 'button', onclick: async () => {
        if (!kind) { kinds.classList.remove('shake'); void kinds.offsetWidth; kinds.classList.add('shake'); err.textContent = T('pickKind'); return; }
        const r = row(loc, kind, text, withShot ? shot : null);
        send.disabled = true; send.textContent = T('sending');
        try { const how = await R.send(r); close(); toast(how === 'queued' ? T('queued') : T('sent'), how === 'queued' ? 5000 : 4000); }
        catch (e) {
          send.disabled = false; send.textContent = T('send'); err.textContent = T('failed', { error: root.NoemaI18n?.err ? NoemaI18n.err(e) : e.message });
        }
      } }, T('send'));
      const local = !cloudOn();
      body.append(h('p', { class: 'ns-muted nr-lead' }, T('lead')), shotBox, h('div', { class: 'nr-label' }, T('kind')), kinds, h('label', { class: 'nr-label' }, T('note'), ta),
        h('div', { class: 'nr-row' }, pointBtn, pointed), where,
        local ? h('p', { class: 'nr-signin' }, T('signIn')) : h('p', { class: 'ns-muted nr-privacy' }, T('privacy')), err,
        h('div', { class: 'nr-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: close }, T('cancel')),
          local ? h('button', { type: 'button', class: 'btn primary', onclick: () => { download(`noema-report-${loc.at.slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(row(loc, kind || 'other', text, withShot ? shot : null), null, 1), 'application/json'); } }, T('download')) : send));
      setTimeout(() => (kind ? ta : kinds.firstChild)?.focus?.(), 30);
    };
    X.modal(T('title'), draw, { cls: 'nr-modal nr-skip' });
  }

  /* ---------- admins (noema_admins): who sees the reports ---------- */
  const isAdmin = () => (cloudOn() ? R.isAdmin() : Promise.resolve(false));
  const newCount = () => (cloudOn() ? R.newCount() : Promise.resolve(0));
  const Server = { list: R.list, one: R.one, save: R.save, remove: R.remove };

  /* ---------- #/admin/reports[/<id>]: the review page ---------- */
  const when = t => { try { return NoemaI18n.fmt.ago ? NoemaI18n.fmt.ago(Date.parse(t)) : new Date(t).toLocaleString(); } catch (e) { return String(t); } };
  const TONE = { new: 5, seen: 3, fixing: 4, fixed: 2, wontfix: 1, duplicate: 1 };
  function page(args, X) {
    const { h, page: draw, go, pill } = X, filter = /[?&]f=(\w+)/.exec(location.hash)?.[1] || 'open';
    const v = draw({ tab: null, crumbs: [[T('adminTitle'), args[0] ? '#/admin/reports' : null], ...(args[0] ? [[String(args[0]).slice(0, 8)]] : [])], back: args[0] ? '#/admin/reports' : '#/' }, h('div', { class: 'nr-admin' }, h('p', { class: 'ns-muted' }, '…')));
    const box = v.querySelector('.nr-admin');
    isAdmin().then(ok => {
      if (!ok) { box.replaceChildren(h('div', { class: 'ns-panel' }, h('p', {}, T('notAdmin')))); return; }
      return args[0] ? detail(args[0], box, X) : list(filter, box, X);
    }).catch(e => box.replaceChildren(h('p', { class: 'nr-err' }, root.NoemaI18n?.err ? NoemaI18n.err(e) : e.message)));
  }
  async function list(filter, box, X) {
    const { h, go, pill } = X;
    const rows = await Server.list(filter);
    const seg = h('div', { class: 'ns-seg small nr-filter', role: 'tablist' }, ...['open', 'new', 'fixed', 'all'].map(f => h('button', { class: f === filter ? 'on' : '', role: 'tab', 'aria-selected': String(f === filter), 'data-f': f, onclick: () => go('#/admin/reports?f=' + f) }, T('f_' + f))));
    box.replaceChildren(h('h1', {}, T('adminTitle')), h('div', { class: 'nr-bar' }, seg, h('span', { class: 'ns-muted' }, T('count', { n: rows.length }))),
      rows.length ? h('div', { class: 'nr-list' }, ...rows.map(r => h('button', { class: 'nr-item', 'data-id': r.id, onclick: () => go('#/admin/reports/' + encodeURIComponent(r.id)) },
        h('span', { class: 'nr-pills' }, pill(T('st_' + r.status), TONE[r.status] || 1), pill(T('kind_' + r.kind), 6)),
        h('span', { class: 't' }, h('b', { dir: 'auto' }, clip(r.note, 140) || T('noNote')), h('small', { dir: 'auto' }, [r.subject, r.item, r.route].filter(Boolean).join(' · '))),
        h('small', { class: 'nr-who' }, T('from', { name: r.reporter_name || r.reporter_email || '?', when: when(r.created_at) }))))) : h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('empty'))));
  }
  async function detail(id, box, X) {
    const { h, go, pill } = X;
    const r = await Server.one(id);
    if (!r) { box.replaceChildren(h('div', { class: 'ns-panel' }, h('p', {}, T('empty')))); return; }
    if (r.status === 'new') { Server.save(r.id, { status: 'seen' }).catch(() => { }); r.status = 'seen'; }
    const L = r.locator || {}, it = L.item || {}, tg = L.target || {};
    const kv = (k, v) => v == null || v === '' ? null : h('tr', {}, h('th', {}, k), h('td', { dir: 'auto' }, v));
    const code = s => h('code', {}, s);
    const where = h('table', { class: 'nr-where' }, h('tbody', {},
      kv(T('w_item'), code(r.item || '—')), kv(T('w_route'), r.route ? h('span', {}, code(r.route), ' ', h('a', { href: (L.app?.url || '') + r.route, target: '_blank', rel: 'noopener' }, T('openHere'))) : null),
      kv(T('w_subject'), L.subject ? `${L.subject.id} · ${L.subject.title || ''} · ${L.subject.origin || '?'} · v ${L.subject.version || '?'}` : null),
      kv(T('w_content'), L.subject ? `${L.subject.shown}${L.subject.translation ? ' ← ' + L.subject.packLanguage : ''}${L.subject.bridge ? ' · 文A ' + L.subject.bridge : ''}` : null),
      kv(T('w_chapter'), it.chapter ? `${it.chapter.id} · ${it.chapter.title || ''}` : null), kv(T('w_section'), it.section ? `${it.section.id} · ${it.section.title || ''}` : null),
      kv(T('w_block'), it.block ? `${it.block.id} · ${it.block.t} · ${it.block.text || ''}` : null), kv(T('w_exercise'), it.exercise ? `${it.exercise.id} · ${it.exercise.type || ''} · ${it.exercise.q || it.exercise.note || ''}` : null),
      kv(T('w_card'), it.card ? `${it.card.key} · ${it.card.q || ''}` : null), kv(T('w_drill'), it.drill ? `${it.drill.id} · ${it.drill.title || ''}` : null), kv(T('w_trap'), it.trap ? `${it.trap.id} · ${it.trap.title || ''}` : null),
      kv(T('w_field'), it.field ? h('span', {}, code(it.field.path), ' ', it.field.shown || '', it.field.own != null ? ' ← ' + it.field.own : '') : null),
      kv(T('w_lang'), L.lang ? Object.entries(L.lang).map(([k, v]) => `${k}: ${v}`).join(' · ') : null),
      kv(T('w_target'), tg.text || tg.selector ? h('span', {}, tg.text || '', tg.selector ? h('small', { class: 'nr-sel' }, tg.selector) : null) : null),
      kv(T('w_ui'), (tg.i18n || []).length ? tg.i18n.map(k => `${k.key} (${k.locale})`).join(' · ') : null),
      kv(T('w_answer'), tg.given || null),
      kv(T('w_app'), [L.app?.version, L.app?.commit, L.ui?.locale, L.ui?.viewport && `${L.ui.viewport.w}×${L.ui.viewport.h}`, L.ui?.ua].filter(Boolean).join(' · ')),
      kv(T('w_errors'), (L.errors || []).length ? h('ul', {}, ...L.errors.map(e => h('li', {}, `${e.level}: ${e.msg}`))) : null)));
    const status = h('select', { class: 'nr-status', 'aria-label': T('status') }, ...STATUSES.map(s => h('option', { value: s, selected: s === r.status }, T('st_' + s))));
    const anote = h('textarea', { class: 'nr-anote', rows: 3, maxlength: 4000, placeholder: T('answerPh') }); anote.value = r.admin_note || '';
    const fixed = h('input', { class: 'nr-fixed', type: 'text', maxlength: 300, placeholder: T('fixedIn') }); fixed.value = r.fixed_in || '';
    const copy = async () => { const t = R.brief(r); try { await navigator.clipboard.writeText(t); toast(T('copied'), 4000); } catch (e) { download(`report-${r.id}.md`, t, 'text/markdown;charset=utf-8'); } };
    box.replaceChildren(
      h('div', { class: 'nr-dhead' }, h('span', { class: 'nr-pills' }, pill(T('st_' + r.status), TONE[r.status] || 1), pill(T('kind_' + r.kind), 6)), h('small', { class: 'ns-muted' }, T('from', { name: [r.reporter_name, r.reporter_email].filter(Boolean).join(' · ') || '?', when: when(r.created_at) }))),
      h('blockquote', { class: 'nr-quote', dir: 'auto' }, r.note || T('noNote')),
      r.shot ? h('a', { class: 'nr-bigshot', href: r.shot, target: '_blank', rel: 'noopener' }, h('img', { src: r.shot, alt: T('shotAlt') })) : h('p', { class: 'ns-muted' }, T('noShotSent')),
      h('div', { class: 'nr-actions start' }, h('button', { class: 'btn primary nr-copy', type: 'button', onclick: copy }, X.svg('copy'), h('span', {}, T('copyBrief'))), h('button', { class: 'btn', type: 'button', onclick: () => download(`report-${r.id}.json`, JSON.stringify(r, null, 1), 'application/json') }, T('json'))),
      h('h2', {}, T('where')), where,
      h('details', { class: 'nr-details' }, h('summary', {}, T('all')), h('pre', {}, JSON.stringify(L, null, 1))),
      h('h2', {}, T('answer')),
      h('div', { class: 'nr-form' }, h('label', { class: 'nr-label' }, T('status'), status), h('label', { class: 'nr-label' }, T('answerLabel'), anote), h('label', { class: 'nr-label' }, T('fixedIn'), fixed),
        h('div', { class: 'nr-actions start' }, h('button', { class: 'btn primary nr-save', type: 'button', onclick: async e => { e.currentTarget.disabled = true; try { await Server.save(r.id, { status: status.value, admin_note: anote.value.trim() || null, fixed_in: fixed.value.trim() || null }); toast(T('saved')); go('#/admin/reports'); } catch (er) { e.currentTarget.disabled = false; toast(NoemaI18n?.err?.(er) || er.message, 5000); } } }, T('save')),
          h('button', { class: 'btn ghost danger', type: 'button', onclick: async () => { if (!confirm(T('deleteQ'))) return; await Server.remove(r.id).catch(() => { }); go('#/admin/reports'); } }, T('delete')))));
  }

  Object.assign(API, { open, collect, shoot, pointAt, page, isAdmin, newCount, flush, Server, _errors: ERRS });
  setTimeout(() => flush().catch(() => { }), 4000);   // reports kept while offline go when the app is back
})(typeof window !== 'undefined' ? window : globalThis);
