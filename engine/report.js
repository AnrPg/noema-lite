/* =====================================================================================
   noema-lite — ⚑ problem reports (docs/REPORTS.md).
   The ⚑ at the foot of the side bar (Me ▾ › Report a problem on phones): a screenshot of the screen as it is, a few
   words, optionally the very thing pointed at (🎯), and the exact place — the address, the subject and its pack
   version, the chapter, section, block, exercise or card and the field inside it, the trap or drill, the interface
   text and its catalog key, the UI and content languages, the language course, the build of the app, the last errors.
   Sent to the table noema_error_reports (cloud/supabase.sql §15); the app's admins (noema_admins) review them on
   #/admin/reports, and Claude reads them through the connector (noema_reports, noema_report) with the same brief.
   The brief and the repository paths are pure functions (no DOM): tools/build.py prepends this file to the connector.
   ===================================================================================== */
(function (root) {
  'use strict';
  /* i18n-ignore-start */   // codes, paths and the brief: read by the person or the AI who fixes the problem, in English
  const KINDS = ['content', 'translation', 'display', 'broken', 'idea', 'other'];
  const STATUSES = ['new', 'seen', 'fixing', 'fixed', 'wontfix', 'duplicate'];
  const OPEN = ['new', 'seen', 'fixing'];
  // the i18n component of a catalog key's prefix (i18n/<component>/en.arb, docs/i18n.md §5.1); 'roadmap.' lives in two
  const COMPONENT = { sh: ['shell'], engine: ['engine'], vault: ['vault'], social: ['social'], roadmap: ['roadmaps', 'roadmaps-map'], lang: ['lang'], lc: ['langcore'], err: ['errors'], loader: ['loader'],
    char: ['characters'], bridge: ['bridge'], mt: ['mt'], packs: ['packs'], email: ['email'], report: ['report'], top: ['core'], home: ['core'], ch: ['core'], nav: ['core'], view: ['core'], acc: ['core'], set: ['core'], inuse: ['core'], pick: ['core'] };
  const componentsOf = key => COMPONENT[String(key).split('.')[0]] || ['core'];

  /** The files of the repository (AnrPg/noema-lite) where the reported thing is written, most likely first. */
  function repoFiles(loc) {
    loc = loc || {}; const out = [], s = loc.subject || {}, it = loc.item || {}, ch = it.chapter?.id || loc.place?.chapter;
    const add = (path, why) => { if (path && !out.some(x => x.path === path)) out.push({ path, why }); };
    const tr = s.translation;
    if (s.id && s.origin === 'library') {
      const base = `library/subjects/${s.id}/`;
      if (tr && (it.exercise || it.card || it.block || it.drill || it.trap || it.section)) add(base + `translations/${tr}/${ch || '<chapter>'}.json`, `the ${tr} translation the learner was reading (same ids as the source)`);
      if (ch) add(base + `chapters/${ch}.json`, 'the chapter in the pack’s own language (or a patch in patches/ that adds or revises the item: search its id)');
      add(base + 'patches/', 'additive patches: an item added later lives here (search its id)');
      if (s.bridge) add(base + `bridges/${s.bridge}.json`, `文A language help into ${s.bridge} (docs/BRIDGE.md)`);
      add(base + 'subject.json', 'the subject’s title, description, tutor');
    } else if (s.id && s.owner) add(`accounts/${s.owner}/packs/${s.id}/` + (ch ? `chapters/${ch}.json` : ''), 'a private pack of a local profile');
    else if (s.id) add(`(cloud) <owner>/packs/${s.id}.json`, `a pack in a learner’s account (origin: ${s.origin || '?'}), not in the repository: get it with the connector (noema_get_pack_url) or ask its owner`);
    if (loc.lang?.course) add(`library/languages/${loc.lang.course}/`, 'the language course (read docs/LANGUAGE_RULES.md before any change)');
    for (const k of loc.target?.i18n || []) for (const c of componentsOf(k.key)) {
      add(`i18n/${c}/en.arb`, `interface text ${k.key} (English, written by hand)`);
      if (k.locale && k.locale !== 'en') add(`i18n/${c}/${k.locale}.arb`, `the ${k.locale} translation of ${k.key} (Weblate; Claude’s drafts: i18n/${c}/drafts/${k.locale}.arb)`);
    }
    const page = loc.route?.page;
    const CODE = { subject: 'engine/src/40_views.js', ch: 'engine/src/40_views.js', s: 'engine/src/40_views.js', ex: 'engine/src/30_exercises.js', run: 'engine/src/40_views.js', practice: 'engine/src/40_views.js', cards: 'engine/src/40_views.js', drill: 'engine/src/40_views.js',
      lang: 'engine/lang/*.js (→ engine/langui.js)', vault: 'engine/vault.js', people: 'engine/social.js', chat: 'engine/social.js', group: 'engine/social.js', search: 'engine/search.js', map: 'engine/curmap.js', learn: 'engine/shell.js', '': 'engine/shell.js', me: 'engine/shell.js', admin: 'engine/report.js' };
    if (['display', 'broken'].includes(loc.kind) || !out.length) add(CODE[page] || 'engine/shell.js', 'the code that draws this screen');
    return out;
  }
  const line = (k, v) => (v == null || v === '' ? '' : `- **${k}:** ${v}\n`);
  const q = s => s == null ? '' : '“' + String(s).replace(/\s+/g, ' ').trim() + '”';
  /** The brief for whoever fixes it (Markdown, English): what was reported, the one place it points to, and where that is in the repository. */
  function brief(r) {
    const L = r.locator || {}, it = L.item || {}, s = L.subject || {}, t = L.target || {}, rt = L.route || {};
    let o = `# noema-lite problem report ${r.id || ''}\n\n`;
    o += line('Kind', r.kind) + line('Status', r.status) + line('Sent', r.created_at || L.at) + line('By', [r.reporter_name, r.reporter_email].filter(Boolean).join(' · '));
    o += `\n## What the learner wrote\n\n${r.note ? '> ' + String(r.note).replace(/\n/g, '\n> ') : '(nothing — see the screenshot and the place)'}\n`;
    o += `\n## The place (unique)\n\n` + line('Item id', r.item || L.itemRef) + line('Address', rt.hash ? '`' + rt.hash + '`' + (L.app?.url ? ` (open: ${L.app.url}${rt.hash})` : '') : '');
    if (s.id) o += line('Subject', `\`${s.id}\` “${s.title || ''}” · origin ${s.origin || '?'} · pack version ${s.version || '?'}${s.builtAt ? ' (built ' + s.builtAt + ')' : ''}`)
      + line('Content language', `shown ${it.content?.shown || s.shown || '?'}${(it.content?.translation || s.translation) ? ` — a TRANSLATION of the pack’s ${it.content?.packLanguage || s.packLanguage || '?'}` : ' (the pack’s own language)'}${s.bridge ? ` · 文A help into ${s.bridge}` : ''}`);
    if (it.chapter) o += line('Chapter', `\`${it.chapter.id}\` (${it.chapter.num ?? '?'}) ${q(it.chapter.title)}`);
    if (it.section) o += line('Section', `\`${it.section.id}\` ${q(it.section.title)}`);
    if (it.block) o += line('Block', `\`${it.block.id}\` = blocks[${it.block.index}] of the section, type \`${it.block.t}\`: ${q(it.block.text)}` + (it.block.textOwn ? ` · in the pack’s language: ${q(it.block.textOwn)}` : ''));
    if (it.exercise) o += line('Exercise', `\`${it.exercise.id}\` type \`${it.exercise.type || '?'}\`${it.exercise.notInPack ? ' — NOT in the pack (' + it.exercise.note + ')' : ''}: ${q(it.exercise.q)}` + (it.exercise.qOwn ? ` · in the pack’s language: ${q(it.exercise.qOwn)}` : '') + (it.exercise.cite ? ` · cite ${JSON.stringify(it.exercise.cite)}` : ''));
    if (it.card) o += line('Flashcard', `key \`${it.card.key}\` (flashcards[${it.card.index}] of the chapter): ${q(it.card.q)} → ${q(it.card.a)}`);
    if (it.drill) o += line('Debug drill', `\`${it.drill.id}\` ${q(it.drill.title)}`);
    if (it.trap) o += line('Trap', `\`${it.trap.id}\` = pitfalls[${it.trap.index}] ${q(it.trap.title)}`);
    if (it.field) o += line('Field', `\`${it.field.path}\` = ${q(it.field.shown)}` + (it.field.own != null ? ` · in the pack’s language: ${q(it.field.own)}` : ''));
    if (L.lang) o += line('Language course', Object.entries(L.lang).map(([k, v]) => `${k} \`${v}\``).join(' · '));
    if (t.text || t.selector) o += line(t.picked ? 'Pointed at' : 'In view', `${q(t.text)}${t.selector ? ' — `' + t.selector + '`' : ''}`);
    if ((t.i18n || []).length) o += line('Interface text', t.i18n.map(k => `\`${k.key}\` (${k.locale}) ${q(k.text)}`).join('; '));
    if ((t.data || []).length) o += line('data-* of the element and its parents', t.data.map(d => Object.entries(d).map(([k, v]) => `${k}=${v}`).join(' ')).join(' ‹ '));
    if (t.given) o += line('The learner’s answer', q(t.given));
    if (L.visible?.length) o += line('Also on screen', L.visible.map(v => `${v.ref} ${q(v.text)}`).join('; '));
    const ui = L.ui || {};
    o += `\n## The app\n\n` + line('Build', [L.app?.version, L.app?.commit && 'commit ' + L.app.commit, L.app?.builtAt && 'built ' + L.app.builtAt, L.app?.frame ? 'the frame' : 'classic screens', L.app?.bundle && 'single-file bundle'].filter(Boolean).join(' · '))
      + line('Interface', `${ui.locale || '?'} (${ui.dir || 'ltr'}) · ${ui.theme || ''} · character ${ui.character || '?'} · ${ui.viewport ? ui.viewport.w + '×' + ui.viewport.h + ' @' + ui.viewport.dpr : ''} · scrolled ${ui.scroll?.y ?? 0}px`)
      + line('Browser', ui.ua) + line('Screen', [L.screen?.title && q(L.screen.title), (L.screen?.crumbs || []).join(' › ')].filter(Boolean).join(' · '));
    if (L.errors?.length) o += `\n## Recent errors in the console\n\n` + L.errors.map(e => `- ${e.level} ${e.at || ''}: ${String(e.msg).slice(0, 300)}`).join('\n') + '\n';
    const files = repoFiles({ ...L, kind: r.kind });
    o += `\n## Where to fix it (repository AnrPg/noema-lite)\n\n` + files.map(f => `- \`${f.path}\` — ${f.why}`).join('\n') + '\n';
    o += `\n## How\n\n1. Find the item by its id (unique in the pack) in the files above; never by its position alone.\n2. Fix the text where the learner read it: a translation is fixed in its translation file, the pack’s own text in the chapter (or the patch that added it); keep every id.\n3. Interface text: the key in i18n/<component>/en.arb (English) or the locale’s file; then node tools/i18n/check.js.\n4. Rebuild and check: python3 tools/build.py (validates the packs); language courses: docs/LANGUAGE_RULES.md first.\n5. Mark the report fixed with the commit or pull request (connector: noema_report_update, or #/admin/reports).\n`;
    return o;
  }
  /* i18n-ignore-end */
  const API = root.NoemaReport = { KINDS, STATUSES, OPEN, brief, repoFiles, componentsOf };
  if (typeof document === 'undefined' || !root.document) return;

  /* ======================= in the app ======================= */
  const N = () => root.Noema, CL = () => root.NoemaCloud, SH = () => root.NoemaShell;
  const T = (k, p) => root.NoemaI18n ? NoemaI18n.t('report.' + k, p) : k;
  const toast = (m, ms) => N()?.toast?.(m, ms);
  const clip = (s, n = 300) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const cloudOn = () => N()?.account?.kind === 'cloud' && !!CL()?.session?.();
  const api = (path, o) => CL().api(path, o);

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
  const OUTBOX = 'noema1:report:outbox';
  const outbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]') || []; } catch (e) { return []; } };
  const putOutbox = l => { try { localStorage.setItem(OUTBOX, JSON.stringify(l.slice(-3))); } catch (e) { try { localStorage.setItem(OUTBOX, JSON.stringify(l.slice(-3).map(r => ({ ...r, shot: null })))); } catch (e2) { } } };
  const row = (loc, kind, noteText, shot) => ({ id: crypto.randomUUID(), kind, note: clip(noteText, 4000) || null, route: clip(loc.route.hash, 600), subject: loc.subject?.id || null, item: clip(loc.itemRef, 300), locator: loc, shot: shot || null, app_version: clip([loc.app.version, loc.app.commit && String(loc.app.commit).slice(0, 12)].filter(Boolean).join('+'), 80) });
  const post = r => api('/rest/v1/noema_error_reports', { method: 'POST', body: [r], headers: { Prefer: 'return=minimal' } });
  async function flush() {
    if (!cloudOn()) return; const l = outbox(); if (!l.length) return;
    const left = []; for (const r of l) { try { await post(r); } catch (e) { if (e.network) left.push(r); } }
    putOutbox(left);
  }

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
        try { await post(r); close(); toast(T('sent'), 4000); }
        catch (e) {
          if (e.network) { putOutbox([...outbox(), r]); close(); toast(T('queued'), 5000); return; }
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
  let adminP = null, adminFor = null;
  function isAdmin() {
    if (!cloudOn()) return Promise.resolve(false);
    const me = CL().uid(); if (adminFor !== me) { adminFor = me; adminP = null; }
    return adminP || (adminP = api('/rest/v1/noema_admins?select=user_id&limit=1').then(r => Array.isArray(r) && r.length > 0).catch(() => { adminP = null; return false; }));
  }
  const newCount = () => api('/rest/v1/noema_error_reports?select=id&status=eq.new&limit=500').then(r => (r || []).length).catch(() => 0);
  const COLS = 'id,reporter_name,reporter_email,kind,note,route,subject,item,status,admin_note,fixed_in,app_version,created_at,updated_at';
  const Server = {
    list: st => api(`/rest/v1/noema_error_reports?select=${COLS}${st && st !== 'all' ? '&status=in.(' + (st === 'open' ? OPEN : [st]).join(',') + ')' : ''}&order=created_at.desc&limit=300`),
    one: id => api(`/rest/v1/noema_error_reports?select=*&id=eq.${encodeURIComponent(id)}`).then(r => (r || [])[0] || null),
    save: (id, patch) => api(`/rest/v1/noema_error_reports?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }),
    remove: id => api(`/rest/v1/noema_error_reports?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };

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
    const copy = async () => { const t = brief(r); try { await navigator.clipboard.writeText(t); toast(T('copied'), 4000); } catch (e) { download(`report-${r.id}.md`, t, 'text/markdown;charset=utf-8'); } };
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
