/* noema-lite — the language courses: which ones there are, the languages the learner studies (D21), a course's data, the Languages tab, a course at start (docs/LANGUAGES.md).
   An area of the app on the shell (build/ui.js: window.Noema, window.NoemaShell; docs/ARCHITECTURE.md §6.3): it adds its
   parts to Noema, its pages to the frame (NoemaShell.registerPage) and its steps of the start to Noema.boot. Whatever
   another area needs of it goes through Noema.app (APP). */
(() => {
  'use strict';
  const APP = (window.Noema.app ||= {});
  {
  const N = window.Noema;
  const CFG = N.config;
  const REG = N.registry;
  const P = 'noema1:';
  const KV = N.kv;
  const SHELL = () => !!window.NoemaShell && CFG.shell !== false;
  const Noema = N;
  const caught = N.caught;
  const jget = N.jget;
  const jset = N.jset;
  const el = N.el;
  const tr = N.tr;
  const errMsg = N.errMsg;
  const uiPref = N.uiPref;
  const overlay = N.overlay;
  const brandHead = N.brandHead;
  const toastL = (m, ms) => N.toast(m, ms);
  const AutoBackup = N.autoBackup;
  const ls = { get: k => NoemaCore.storage.kv.get(k), set: (k, v) => NoemaCore.storage.kv.set(k, v), del: k => NoemaCore.storage.kv.delete(k), keys: prefix => NoemaCore.storage.kv.keys(prefix) };
  const loadCSS = (...a) => APP.loadCSS(...a);
  const loadScript = (...a) => APP.loadScript(...a);
  /* ---------------- language courses (docs/LANGUAGES.md): their own runtime and UI, loaded instead of the subject engine ---------------- */
  /** The account's own language courses, made through Claude (docs/LANGUAGES.md §10.1): records a:langcourse:<id>. */
  const langAccount = acc => ls.keys(`${P}${acc}:a:langcourse:`).map(k => jget(k, null)).filter(r => r && r.origin === 'account' && r.id);
  /** The languages the learner added to a course with a language package (records a:langpack:<course>:<code>, docs/LANGUAGES.md §10.2). */
  const langAdded = (acc, cid) => acc ? ls.keys(`${P}${acc}:a:langpack:${cid}:`).map(k => jget(k, null)).filter(r => r && r.code).map(r => r.code) : [];
  const withAdded = (langs, cid) => [...(langs || []), ...langAdded(KV.acc, cid).filter(c => !(langs || []).includes(c))];
  const langMeta = id => { const m = (REG.languages || []).find(x => 'lang:' + x.id === id); if (m) return { ...m, languages: withAdded(m.languages, m.id), id: 'lang:' + m.id, courseId: m.id, kind: 'language' };
    const r = KV.acc && langAccount(KV.acc).find(x => 'lang:' + x.id === id); return r ? { id: 'lang:' + r.id, courseId: r.id, title: r.title, languages: withAdded(r.languages, r.id), kind: 'language', account: true } : null; };
  let langCSS = null;
  const loadLangUI = async () => { const base = window.NOEMA_ENGINE_BASE || 'engine/'; await (langCSS || (langCSS = loadCSS(base + 'langui.css'))); if (!window.NoemaLang) await loadScript(base + 'langcore.js'); if (!window.NoemaLangUI) await loadScript(base + 'langui.js'); await window.NoemaShell?.area5.load().catch(caught('loader.screens')); };   // the course's new screens (build/lang-activities.js)
  /** A course's content: an account course from the device / the cloud; a library course with the learner's private refills (docs/LANGUAGES.md §10.1). */
  async function langData(acc, meta) {
    await loadLangUI();
    if (!meta.account && !(window.NOEMA_LANGPACKS || {})[meta.courseId]) await loadScript(meta.path);
    return meta.account ? NoemaLangUI.claude.loadCourse(acc, meta.courseId) : NoemaLangUI.claude.withPatch(acc, meta.courseId, window.NOEMA_LANGPACKS[meta.courseId]);
  }
  /** The depth of every word (word profiles), loaded after the course is open; again after the course is opened again. */
  function langProfiles(meta) {
    const have = () => (window.NOEMA_LANGPROFILES || {})[meta.courseId];
    if (have()) { NoemaLangUI.addProfiles(have()); return; }
    if (meta.profiles) loadScript(meta.profiles).then(() => { if (NoemaLangUI.UI.id === meta.courseId) NoemaLangUI.addProfiles(have()); }).catch(e => console.warn('[noema] word profiles', e));
  }
  const LANG_FLAGS = { ar: '🇸🇦', he: '🇮🇱', zh: '🇨🇳', de: '🇩🇪', el: '🇬🇷', en: '🇬🇧', ru: '🇷🇺', tr: '🇹🇷', hi: '🇮🇳', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', ja: '🇯🇵' };
  function pickLanguage(acc, onPick) {
    overlay((box, close) => {
      box.append(brandHead('🌍 ' + tr('loader.langs.title'), tr('loader.langs.sub')),
        el('div', { class: 'noema-chips' }, ...[...(REG.languages || []), ...langAccount(acc).map(r => ({ ...r, mine: true }))].map(m => el('button', { class: 'noema-chip', 'data-course': m.id, onclick: () => { close(); onPick(langMeta('lang:' + m.id)); } },
          el('span', { class: 'e' }, (m.courseId || m.id ? langChosen(acc, { languages: m.languages, courseId: m.courseId || m.id }) : m.languages).map(c => LANG_FLAGS[c] || c).join('')), el('span', { class: 't' }, m.title), m.mine ? el('span', { class: 'o', title: tr('loader.langs.own') }, '🔒') : null))),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small ai', onclick: async () => { try { await loadLangUI(); NoemaLangUI.newCourse(acc, { onCreated: r => { studyAdd(acc, r.languages); close(); onPick(langMeta('lang:' + r.id)); } }); } catch (e) { toastL('⚠️ ' + errMsg(e), 4000); } } }, '✨ ' + tr('loader.langs.new')), el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
    }, { closable: true });
  }
  async function startLanguage(acc, meta) {
    KV.subj = meta.id; Noema.setCurrent(acc.id, meta.id);
    Noema.subject = { id: meta.id, title: meta.title, kind: 'language', tutor: {}, hero: {}, features: {} };
    const data = await langData(acc.id, meta).catch(e => e);
    document.body.classList.remove('noema-booting'); document.getElementById('noema-splash')?.remove();
    if (data instanceof Error) { document.body.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '⚠️'), el('p', {}, errMsg(data)), el('button', { class: 'btn', onclick: () => Noema.switchTo(acc.id, null) }, tr('loader.chooseAnother')))); return; }
    NoemaLangUI.start({ acc: acc.id, id: meta.courseId, data }); NoemaLangUI.claude.startPolling(acc.id);
    langProfiles(meta);
    AutoBackup.start(acc.id).catch(caught('loader.autobackup'));
  }
  /* ---------------- language courses inside the frame (docs/NEW_FRAME_AND_LANGUAGES.md, docs/LANGUAGES.md §8) ----------------
     The Languages tab (#/lang) lists the learner's courses; #/lang/<course>/… draws a course inside the frame (NoemaLangUI.start
     with a host: the frame's top bar and tabs stay; the course's own addresses #/c/…, #/fn/… live under it); Today gets a
     "continue" card; the ⋮ holds the course's settings, its Claude task queue and the other courses. With shell: false none of
     this runs: startLanguage takes the whole page, as before. */
  /* ---------------- the language courses before any is loaded: NoemaCore.languages (src/features/languages) ----------------
     D21 (docs/LANGUAGES.md §8 *Languages to study*): one answer for the whole app, a:settings.studyLangs (synced, in backups).
     Every course teaches the chosen languages it has; a course with none of them asks for its own. The Languages tab, the
     chooser, Today's card and the rows of courses are Lit screens (src/ui/screens/languages-activities.ts) put in place
     through NoemaShell.area5. */
  const LS = () => NoemaCore.languages;
  const langCourses = acc => LS().courses(acc).map(m => langMeta('lang:' + m.courseId)).filter(Boolean);
  function langChosen(acc, meta) { return LS().chosen(acc, meta); }
  /** A new course the learner made: its languages are studied (once the learner has answered). */
  const studyAdd = (acc, codes) => { const st = LS().study(acc); if (st && (codes || []).some(c => !st.includes(c))) LS().setStudy(acc, [...st, ...codes]); };
  const langHash = id => '#/lang/' + encodeURIComponent(id);
  /** What the Languages screens get from the page: the profile, the frame's navigation, a new course. */
  const langCtx = () => ({ account: { id: KV.acc }, go: x => NoemaShell.go(x), createCourse: langCreate });
  const screenFailed = (where, box) => e => { NoemaCore.errors.report(e, { where: 'loader.screens.' + where }); if (box) box.replaceChildren(el('p', { class: 'ns-muted' }, errMsg(e))); else toastL('⚠️ ' + errMsg(e), 4000); };
  /** A part of the Languages screens (study-chooser, lang-courses, lang-today) in a new element of its own. */
  function langPart(name, options) {
    const host = el('div', { class: 'ns-langpart', 'data-part': name });
    NoemaShell.area5.part(name, host, langCtx(), options).catch(screenFailed(name, host));
    return host;
  }
  /** The learner opens a course in the frame (Languages tab, Today, a link, ?subject=lang:<id>). */
  const langOpen = id => window.NoemaShell?.go(langHash(id));
  function langCreate() {
    const acc = KV.acc;
    loadLangUI().then(() => NoemaLangUI.newCourse(acc, { onCreated: r => { studyAdd(acc, r.languages); langOpen(r.id); } })).catch(e => toastL('⚠️ ' + errMsg(e), 4000));
  }
  /** Choose another course: a sheet with every course. */
  function langChooser() {
    const S = window.NoemaShell; if (!S) return;
    S.sheet(S.L('langOther'), (body, close) => body.append(langPart('lang-courses', { onPick: id => { close(); langOpen(id); } })));
  }
  /** The ⋮ of the Languages tab and of a course: the course's settings and Claude queue, another course, a new one. */
  function langMenu(id) {
    const L = window.NoemaShell.L, m = id && langMeta('lang:' + id);
    return [m ? { label: L('langSettings'), sub: L('langSettingsSub'), icon: 'gear', href: langHash(id) + '/settings' } : null,
      m ? { label: L('langClaude'), sub: L('langClaudeSub'), icon: 'spark', href: langHash(id) + '/claude' } : null,
      m ? '-' : null,
      langCourses(KV.acc).length > 1 || !m ? { label: L('langOther'), icon: 'book', run: langChooser } : null,
      { label: L('langNew'), sub: L('newLanguageSub'), icon: 'plus', run: langCreate },
      { label: L('pickSubject'), icon: 'book', run: () => Noema.openSubjectPicker() }];
  }
  /** #/lang/<course>/… : the course inside the frame. The course is started once and re-drawn on every address of it. */
  let langOpening = null;
  async function langRoute(parts, ctx) {
    const S = window.NoemaShell, { h, L } = ctx, acc = KV.acc;
    let id = parts[0], scope = null, meta = langMeta('lang:' + id);
    if (!meta) { const m = LS().courseFor(acc, id); if (m) { scope = id; id = m.courseId; meta = langMeta('lang:' + id); } }   // #/lang/<code>: the home of one language
    const base = scope ? '#/lang/' + encodeURIComponent(scope) : langHash(id), key = id + '|' + (scope || '');
    if (!meta) { document.body.classList.remove('lx-frame'); ctx.page({ crumbs: [[L('languages'), '#/lang'], [id]], menu: langMenu(null) }, h('div', { class: 'ns-panel ns-empty' }, S.faceEl(undefined, 'breathe'), h('p', {}, L('langMissing')), h('button', { class: 'btn primary', onclick: () => S.go('#/lang') }, L('languages')))); return; }
    LS().setLast(acc, id); Noema.setCurrent(acc, meta.id);   // a reload comes back here; Today's card continues it
    const UI = window.NoemaLangUI?.UI, host = ctx.main.querySelector('.lx-host');
    if (host && host.dataset.course === key && UI?.id === id && NoemaLangUI.FR.host === host) { document.body.classList.add('lx', 'lx-frame'); NoemaLangUI.render(); return; }
    const top = { crumbs: [[L('languages'), '#/lang'], [meta.title]], back: '#/lang', menu: () => langMenu(id) };
    const nhost = h('div', { class: 'lx-host', 'data-course': key }, h('div', { class: 'ns-wait' }, S.faceEl(undefined, 'breathe')));
    ctx.page(top, nhost);
    const mine = langOpening = {};
    let data = UI?.id === id && UI.C ? UI.C.data : null;   // the course was open a moment ago (the learner went to another tab): what it holds now
    if (!data) data = await langData(acc, meta).catch(e => e);
    if (langOpening !== mine || !nhost.isConnected) return;   // the learner went elsewhere meanwhile
    if (data instanceof Error) { nhost.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, errMsg(data)), h('button', { class: 'btn', onclick: () => S.go('#/lang') }, L('languages')))); return; }
    document.body.classList.add('lx-frame');
    NoemaLangUI.start({ acc, id: meta.courseId, data, host: nhost, base, scope, onRoute: r => S.chrome({ tab: 'lang', crumbs: [[L('languages'), '#/lang'], [NoemaLangUI.titleOf(meta.courseId) || meta.title, r.home ? null : base], ...(r.label ? [[r.label]] : [])], back: r.home ? '#/lang' : base, menu: () => [...(r.acts || []), r.acts?.length ? '-' : null, ...langMenu(id)], menuLabel: L('langMore'), reading: ['lesson', 'node', 'c', 'w', 'fn', 'read', 'peculiar', 'field', 'cmp'].includes(r.view), tutor: () => NoemaLangUI.prod?.openLangTutor({}) }) });
    if (!langRoute.polling) { langRoute.polling = true; NoemaLangUI.claude.startPolling(acc); }
    langProfiles(meta);
  }
  /** Today: continue the course you were in (reviews due, the next lesson), else start the first one. lead: only the course you
      were in (it then stands for the big "continue" when no subject waits); returns whether a card was drawn. */
  function langToday(box, { lead = false }) {
    const m = LS().today(KV.acc, { lead, current: jget(P + 'current', {}).subj });
    if (!m) return false;
    box.append(langPart('lang-today', { course: m.courseId }));
    return true;
  }
  /** Boot in the frame with a course (?subject=lang:<id>, or the course the learner was in): open it at #/lang/<id>. */
  function langBoot(acc, meta, asked) {
    const h0 = location.hash, want = langHash(meta.courseId);
    if (h0.startsWith(want + '/') || h0 === want) return;
    if (!h0 || h0 === '#' || (asked && h0 === '#/')) history.replaceState(null, '', location.pathname + location.search + want);
    if (window.NoemaThemes?.world(acc.id) === 'know' && location.hash.startsWith('#/lang/')) NoemaThemes.putSettings({ world: 'both' }, acc.id);   // a course is open: the Languages tab shows
  }
  if (SHELL()) {
    NoemaShell.registerWorld('lang', { route: langRoute, create: langCreate, today: langToday,
      menu: () => langMenu(LS().last(KV.acc)),
      // the page others see (Me › Me, docs/PROFILE.md): the courses the learner has started → [{ id, title, languages: [code], words }]
      studying: () => langCourses(KV.acc).map(m => ({ m, p: LS().progress(KV.acc, m) })).filter(x => x.p.started).map(({ m, p }) => ({ id: m.courseId, title: m.title, languages: p.langs, words: p.words })) });
    addEventListener('hashchange', () => {   // leaving a course: the frame's own pages again; a subject's page: that subject is the one a reload reopens
      const hs = location.hash || '#/', inCourse = /^#\/lang\/[^/]+/.test(hs);
      if (!inCourse) { document.body.classList.remove('lx-frame'); window.NoemaLangUI?.prod?.closeLangTutor?.(); document.querySelector('.lx-pop')?.remove(); if (window.NoemaLangUI?.FR?.on) document.title = CFG.appName || 'noema-lite'; }
      const k = hs.replace(/^#\/?/, '').split('/')[0];
      if (NoemaShell.isSubjectPage?.(k) && NoemaShell.engine && Noema.subject?.id && Noema.subject.kind !== 'language' && KV.acc) Noema.setCurrent(KV.acc, Noema.subject.id);
    });
  }
  /** 📥 Import: a package (<id>.noema.zip = pack + its source files) or a plain pack (.json). */
  Object.assign(APP, { langAccount, pickLanguage, langCtx });

  Object.assign(N, { langCourses: () => langCourses(KV.acc), langData: meta => langData(KV.acc, meta) });   // the search indexes the courses too
  Object.assign(N.boot, {
    wanted: (acc, subs, w) => subs.find(s => s.id === w) || (String(w || '').startsWith('lang:') ? langMeta(w) : null),
    langBoot, startLanguage,
  });
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const h = S.h;
  const faceEl = S.faceEl;
  const L = S.L;
  const sheet = S.sheet;
  const menuButton = S.menuButton;
  const go = S.go;
  const open = S.open;
  const chrome = S.chrome;
  const page = S.page;
  const WORLDS = S.WORLDS;
  /* ---------- Languages: the tab (#/lang, a Lit screen of area 5: src/ui/screens/languages/languages-page.ts) and a course
     inside the frame (#/lang/<course or code>/…, drawn by the course runtime) ---------- */
  PAGES.lang = async (args = []) => {
    const W = WORLDS.lang;
    // #/lang/<course>/… : a course drawn inside the frame by the languages branch (docs/NEW_FRAME_AND_LANGUAGES.md)
    if (args.length && args[0] && W?.route) { W.route(args, { page: (c, ...kids) => page({ tab: 'lang', back: '#/lang', ...c }, ...kids), chrome: c => chrome({ tab: 'lang', back: '#/lang', ...c }), main: S.main, h, L, open, go, sheet, menuButton, faceEl }); return; }
    const v = h('div', { class: 'ns-langpage' }, h('div', { class: 'ns-wait' }, faceEl(undefined, 'breathe')));
    page({ tab: 'lang', crumbs: [[L('languages')]], corner: true, menu: W?.menu?.() || null },
      h('h1', {}, L('languages')), h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('yourLanguages')), W?.create ? h('button', { class: 'btn small ghost', onclick: () => W.create() }, '+ ' + L('newLanguage')) : null), v);
    if (W?.page) { W.page(v.replaceChildren() || v, { h, open, L }); return; }   // a world that draws its own list
    const at = location.hash;
    try {
      const c = await S.area5.mount('#/lang', v, APP.langCtx());
      if (c && location.hash === at) chrome({ tab: c.tab || 'lang', crumbs: c.crumbs.map(x => [x.label, x.href || null]), corner: true, menu: W?.menu?.() || null });
    } catch (e) { NoemaCore.errors.report(e, { where: 'loader.screens.lang' }); v.replaceChildren(h('p', { class: 'ns-muted' }, e instanceof Error ? e.message : String(e))); }
  };

  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
