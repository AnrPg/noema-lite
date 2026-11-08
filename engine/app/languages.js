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
  const loadLangUI = async () => { const base = window.NOEMA_ENGINE_BASE || 'engine/'; await (langCSS || (langCSS = loadCSS(base + 'langui.css'))); if (!window.NoemaLang) await loadScript(base + 'langcore.js'); if (!window.NoemaLangUI) await loadScript(base + 'langui.js'); };
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
  const LANG_LAST = acc => `${P}${acc}:meta:lastLang`;   // device-local: the course you were in (Today's card, the tab's ⋮)
  const langSum = acc => jget(`${P}${acc}:meta:langsum`, {}) || {};   // device-local: the next lesson the open course last showed (langui)
  const langCourses = acc => [...(REG.languages || []).map(m => m.id), ...langAccount(acc).map(r => r.id)].filter((x, i, a) => a.indexOf(x) === i).map(id => langMeta('lang:' + id)).filter(Boolean);
  /* ---------------- D21: the languages the learner studies (docs/LANGUAGES.md §8 *Languages to study*) ----------------
     One answer for the whole app: a:settings.studyLangs (synced, in backups). Every course teaches the chosen languages it has
     (langui builds it with only those, the progress of the others stays stored); a course with none of them asks for its own.
     Before the first answer a course teaches what it taught before (its own settings.languages, else all). */
  const STUDY = acc => { const s = (jget(`${P}${acc}:a:settings`, {}) || {}).studyLangs; return Array.isArray(s) ? s : null; };
  /** Every language the app offers: [{code, courses: [course ids]}], in the order of the courses (the union over the library and the learner's own). */
  function studyOffered(acc) {
    const out = [];
    for (const m of langCourses(acc)) for (const c of m.languages || []) { let x = out.find(o => o.code === c); if (!x) out.push(x = { code: c, courses: [] }); if (!x.courses.includes(m.courseId)) x.courses.push(m.courseId); }
    return out;
  }
  /** The languages of a course the learner studies (the twin of NoemaLang.studyLangs, without loading the course). */
  function langChosen(acc, meta) {
    const all = [...new Set(meta.languages || [])], study = STUDY(acc), set = jget(`${P}${acc}:s:lang:${meta.courseId}:settings`, {}) || {};
    const own = Array.isArray(set.languages) ? all.filter(c => set.languages.includes(c)) : [];
    if (study) { const x = all.filter(c => study.includes(c)); if (x.length) return x; }
    return own.length ? own : all;
  }
  const studiesAny = (acc, meta) => { const st = STUDY(acc); return !st || (meta.languages || []).some(c => st.includes(c)); };
  function putStudy(acc, codes) {
    const v = [...new Set(codes)];
    if (window.NoemaThemes?.putSettings) NoemaThemes.putSettings({ studyLangs: v }, acc);
    else { const k = `${P}${acc}:a:settings`, s = jget(k, {}) || {}; s.studyLangs = v; KV.set(k, JSON.stringify(s)); }
    try { dispatchEvent(new CustomEvent('noema:study', { detail: { acc, langs: v } })); } catch (e) { NoemaCore.errors.report(e, { where: 'loader.event.study', severity: 'debug' }); }
  }
  /** A new course the learner made: its languages are studied (once the learner has answered). */
  const studyAdd = (acc, codes) => { const st = STUDY(acc); if (st && (codes || []).some(c => !st.includes(c))) putStudy(acc, [...st, ...codes]); };
  /** A language's own name (endonym: Ελληνικά, Deutsch, العربية) and its name in the UI language. */
  function langEndo(code, acc) {
    const cap = (s, loc) => { const a = [...String(s || '')]; return a.length ? a[0].toLocaleUpperCase(loc) + a.slice(1).join('') : ''; };
    let own = '', ui = '';
    try { own = new Intl.DisplayNames([code], { type: 'language' }).of(code) || ''; } catch (e) { /* a language this browser cannot name: the code is shown instead */ }
    const loc = (window.NoemaI18n && NoemaI18n.lang(uiPref(acc))) || 'en';
    try { ui = new Intl.DisplayNames([loc, 'en'], { type: 'language' }).of(code) || ''; } catch (e) { /* a language this browser cannot name: the code is shown instead */ }
    if (!own || own.toLowerCase() === code.toLowerCase()) own = ui || code;
    return { own: cap(own, code), ui: cap(ui || code, loc) };
  }
  /** “Which languages do you want to study?” — every language the app offers (endonym, its name in the UI language, its flag),
      one, several or all; the answer is stored for the whole app. opts: {onDone(codes), course: a course id (its languages first,
      “in this course” marked), none: the course has none of the chosen languages (says so)}. → an element. */
  function studyChooser(acc, { onDone = null, course = null, none = false } = {}) {
    const offered = studyOffered(acc), mine = course ? (langMeta('lang:' + course)?.languages || []) : [];
    const list = [...offered.filter(o => mine.includes(o.code)), ...offered.filter(o => !mine.includes(o.code))];
    const cur = STUDY(acc), pick = new Set((cur || []).filter(c => list.some(o => o.code === c)));
    const ok = el('button', { class: 'btn primary noema-study-ok' }), all = el('button', { class: 'btn small noema-study-all' });
    const btns = list.map(o => {
      const n = langEndo(o.code, acc), titles = o.courses.map(id => langMeta('lang:' + id)?.title).filter(Boolean);
      const b = el('button', { class: 'noema-study-lang', type: 'button', 'data-lang': o.code, title: titles.join(' · '), onclick: () => { pick.has(o.code) ? pick.delete(o.code) : pick.add(o.code); paint(); } },
        el('span', { class: 'f', 'aria-hidden': 'true' }, LANG_FLAGS[o.code] || o.code.toUpperCase()),
        el('span', { class: 't' }, el('b', { lang: o.code, dir: 'auto' }, n.own), n.ui.toLowerCase() !== n.own.toLowerCase() ? el('small', {}, n.ui) : null,
          course && mine.includes(o.code) && offered.some(x => !mine.includes(x.code)) ? el('small', { class: 'here' }, tr('loader.study.inCourse', null, acc)) : null));
      return b;
    });
    const paint = () => {
      btns.forEach(b => { const on = pick.has(b.dataset.lang); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      ok.disabled = !pick.size; ok.textContent = tr('loader.study.ok', { n: pick.size }, acc);
      all.textContent = tr(pick.size === list.length ? 'loader.study.none' : 'loader.study.all', null, acc);
    };
    all.onclick = () => { if (pick.size === list.length) pick.clear(); else list.forEach(o => pick.add(o.code)); paint(); };
    ok.onclick = () => { if (!pick.size) return; const v = list.map(o => o.code).filter(c => pick.has(c)); putStudy(acc, v); onDone?.(v); };
    const box = el('div', { class: 'noema-study', 'data-ask': 'study', role: 'group', 'aria-label': tr('loader.study.ask', null, acc) },
      el('b', { class: 'noema-study-q' }, tr('loader.study.ask', null, acc)),
      el('p', { class: 'noema-study-why' }, tr(none ? 'loader.study.noneHere' : 'loader.study.why', none ? { langs: langNames(mine, acc) } : null, acc)),
      el('div', { class: 'noema-study-langs' }, ...btns),
      el('div', { class: 'row noema-study-foot' }, all, ok));
    paint();
    return box;
  }
  /** The course that opens for a language: the one you were last in that has it, else the first. */
  function studyCourse(acc, code) {
    const last = jget(LANG_LAST(acc), null), cs = langCourses(acc).filter(m => (m.languages || []).includes(code) && langChosen(acc, m).includes(code));
    return cs.find(x => x.courseId === last) || cs[0] || null;
  }
  /** Open a language: its own home page (#/lang/<code>), about that language only. */
  function studyOpen(acc, code) {
    const m = studyCourse(acc, code); if (!m) return;
    const UIx = window.NoemaLangUI?.UI;
    if (UIx?.id === m.courseId && UIx.C?.lang[code]) { UIx.lang = code; UIx.prefs.lang = code; }
    else { const k = `${P}${acc}:s:lang:${m.courseId}:prefs`, pr = jget(k, {}) || {}; pr.lang = code; KV.set(k, JSON.stringify(pr)); }
    NoemaShell.go('#/lang/' + encodeURIComponent(code));
  }
  const langDay = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };   // = NoemaLang.dayNumber
  const langHash = id => '#/lang/' + encodeURIComponent(id);
  const langFlags = m => (m.languages || []).map(c => LANG_FLAGS[c] || c.toUpperCase()).join(' ');
  const langNames = (codes, acc, loc = null) => { let dn = null; try { dn = new Intl.DisplayNames([loc || (window.NoemaI18n && NoemaI18n.lang(uiPref(acc))) || 'en', 'en'], { type: 'language' }); } catch (e) { /* no Intl.DisplayNames for this locale: the codes are shown instead */ } return codes.map(c => { try { return dn?.of(c) || c; } catch (e) { return c; } }).join(' · '); };
  /** Progress without loading the course (7 MB): from the stored learner state (docs/LANGUAGES.md §5.6) — per language the words met
      and the reviews due today; the next lesson as the course last showed it. */
  function langProgress(acc, meta) {
    const pre = `${P}${acc}:s:lang:${meta.courseId}:`, day = langDay();
    const langs = langChosen(acc, meta);   // D21: only the languages the learner studies
    const per = Object.fromEntries(langs.map(c => [c, { words: 0, due: 0, total: (meta.words || {})[c] || 0 }]));
    let started = false;
    for (const k of ls.keys(pre + 'lang:')) {
      const m = k.slice(pre.length).match(/^lang:([^:]+):(node:.+|script)$/); if (!m || !per[m[1]]) continue;
      for (const it of Object.values((jget(k, null) || {}).items || {})) {
        if (!it || typeof it !== 'object') continue; started = true;
        if (m[2] !== 'script') per[m[1]].words++;
        for (const t of ['r', 'p']) if (it[t] && typeof it[t].due === 'number' && it[t].due <= day) per[m[1]].due++;
      }
    }
    const sumOf = f => Object.values(per).reduce((a, x) => a + x[f], 0), words = sumOf('words'), total = sumOf('total');
    return { langs, per, due: sumOf('due'), words, total, pct: total ? Math.min(1, words / total) : 0, started, sum: langSum(acc)[meta.courseId] || null };
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
    S.sheet(S.L('langOther'), (body, close) => body.append(langList(KV.acc, S, { onPick: id => { close(); langOpen(id); } })));
  }
  /** One row per course: flags, title, languages, words met, what is due today, the next lesson; a bar for the words met. */
  function langList(acc, S, { onPick = langOpen, menus = false, list = langCourses(acc) } = {}) {
    const { h, L } = S, cur = jget(LANG_LAST(acc), null);
    return h('div', { class: 'ns-list ns-langlist' }, ...list.map((m, i) => {
      const pr = langProgress(acc, m), next = pr.sum?.next;
      const names = langNames(pr.langs.length ? pr.langs : m.languages || [], acc), named = pr.langs.length === (m.languages || []).length && (m.languages || []).every(c => String(m.title).includes(langNames([c], acc, 'en')));
      const sub = [named ? null : names, pr.started ? L('langWords', { n: pr.words }) : null, m.account ? L('langOwn') : null].filter(Boolean).join(' · ');
      const line2 = pr.due ? L('langDue', { n: pr.due }) : next ? L('langNext', { lesson: `${next.step ? next.step + ' ' : ''}${next.title}` }) : pr.started ? L('langNothingDue') : null;
      const row = h('button', { class: 'ns-item ns-langitem', 'data-course': m.courseId, style: { animationDelay: i * 30 + 'ms' }, onclick: () => onPick(m.courseId) },
        S.icoTxt(h('span', { class: 'ns-langflags', style: { fontSize: pr.langs.length > 2 ? '.8rem' : '1.1rem', lineHeight: '1.1', whiteSpace: 'normal', textAlign: 'center' } }, langFlags({ languages: pr.langs })), (i % 4) + 1, 'emo'),
        h('span', { class: 't' }, h('b', {}, m.title, m.courseId === cur ? h('span', { class: 'ns-muted', style: { fontWeight: 400 } }, ' · ' + (window.NoemaI18n ? NoemaI18n.fmt.lower(L('langContinue')) : L('langContinue').toLowerCase())) : null), h('small', {}, sub), line2 ? h('small', { class: 'ns-langdue' }, line2) : null, pr.total ? S.bar(pr.pct) : null),
        pr.due ? S.pill(pr.due, 4) : S.h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›'));
      if (!menus) return row;
      return h('div', { class: 'ns-itemwrap noema-chipwrap' }, row, S.menuButton([
        { label: m.courseId === cur ? L('langContinue') : L('langStart'), icon: 'play', run: () => onPick(m.courseId) },
        { label: L('langSettings'), sub: L('langSettingsSub'), icon: 'gear', href: langHash(m.courseId) + '/settings' },
        { label: L('langClaude'), sub: L('langClaudeSub'), icon: 'spark', href: langHash(m.courseId) + '/claude' }], { label: L('moreFor', { title: m.title }) }));
    }));
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
    if (!meta) { const m = studyCourse(acc, id); if (m) { scope = id; id = m.courseId; meta = langMeta('lang:' + id); } }   // #/lang/<code>: the home of one language
    const base = scope ? '#/lang/' + encodeURIComponent(scope) : langHash(id), key = id + '|' + (scope || '');
    if (!meta) { document.body.classList.remove('lx-frame'); ctx.page({ crumbs: [[L('languages'), '#/lang'], [id]], menu: langMenu(null) }, h('div', { class: 'ns-panel ns-empty' }, S.faceEl(undefined, 'breathe'), h('p', {}, L('langMissing')), h('button', { class: 'btn primary', onclick: () => S.go('#/lang') }, L('languages')))); return; }
    jset(LANG_LAST(acc), id); Noema.setCurrent(acc, meta.id);   // a reload comes back here; Today's card continues it
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
  function langToday(box, { h, L, lead = false }) {
    const S = window.NoemaShell, acc = KV.acc, all = langCourses(acc); if (!all.length) return false;
    const last = jget(LANG_LAST(acc), null), cur = jget(P + 'current', {}).subj;
    const mine = all.filter(x => studiesAny(acc, x));   // D21: a course with a language the learner studies
    const m = mine.find(x => x.courseId === last) || mine.find(x => x.id === cur) || (lead ? null : mine[0]);
    if (!m) return false;
    const pr = langProgress(acc, m), next = pr.sum?.next;
    box.append(h('button', { class: 'ns-go ns-langgo', 'data-course': m.courseId, onclick: () => langOpen(m.courseId) },
      h('span', { class: 'rm' }, h('span', { class: 'ns-tx' }, '文A'), ' ', m.title),   // i18n-ignore (文A: the Languages icon)
      h('h2', {}, pr.due ? L('langSession') : next ? `${next.step ? next.step + ' · ' : ''}${next.title}` : pr.started ? L('langSession') : m.title),
      h('span', { class: 'meta' }, S.pill(langFlags({ languages: pr.langs }), 1), pr.due ? S.pill(L('langDue', { n: pr.due }), 4) : pr.started ? S.pill(L('langNothingDue'), 2) : S.pill(L('langStart'), 1), pr.due && next ? S.pill(L('langNext', { lesson: next.step || next.title }), 2) : null),
      h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')));
    return true;
  }
  /** The Languages tab: every course, + New language. */
  function langPage(v, { h, L }) {
    const S = window.NoemaShell, acc = KV.acc;
    if (!langCourses(acc).length) { v.append(h('div', { class: 'ns-panel ns-empty' }, S.faceEl(undefined, 'breathe'), h('p', {}, L('noLanguages')), h('button', { class: 'btn primary', onclick: langCreate }, '+ ' + L('newLanguage')))); return; }
    const study = STUDY(acc), offered = studyOffered(acc);
    if (!study && offered.length > 1) {   // D21: the first step — which languages? (the courses stay listed below)
      v.append(h('div', { class: 'ns-panel ns-studyask' }, studyChooser(acc, { onDone: () => S.go('#/lang', true) })), h('span', { class: 'ns-label' }, tr('loader.study.courses', null, acc)), langList(acc, S, { menus: true }));
      return;
    }
    if (!study) { v.append(langList(acc, S, { menus: true })); return; }
    // the chosen languages, each opening its course; the courses that teach them; the others folded
    const chosen = offered.filter(o => study.includes(o.code)), all = langCourses(acc), mine = all.filter(m => studiesAny(acc, m)), rest = all.filter(m => !studiesAny(acc, m));
    const change = () => S.sheet(tr('loader.study.change', null, acc), (body, close) => body.append(studyChooser(acc, { onDone: () => { close(); S.go('#/lang', true); } })));
    v.append(h('div', { class: 'ns-list ns-studylist', 'aria-label': tr('loader.study.yours', null, acc) }, ...chosen.map((o, i) => {
        const n = langEndo(o.code, acc), titles = all.length < 2 ? [] : o.courses.map(id => langMeta('lang:' + id)).filter(m => m && langChosen(acc, m).includes(o.code)).map(m => m.title);   // its course(s), when there are several
        return h('button', { class: 'ns-item ns-studylang', 'data-lang': o.code, onclick: () => studyOpen(acc, o.code) },
          S.icoTxt(h('span', { style: { fontSize: '1.1rem' } }, LANG_FLAGS[o.code] || o.code.toUpperCase()), (i % 4) + 1, 'emo'),
          h('span', { class: 't' }, h('b', { lang: o.code, dir: 'auto' }, n.own), h('small', {}, [n.ui.toLowerCase() !== n.own.toLowerCase() ? n.ui : null, ...titles].filter(Boolean).join(' · '))),
          h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›'));
      }), h('button', { class: 'ns-item ns-studychange', onclick: change }, S.ico('edit', 2), h('span', { class: 't' }, h('b', {}, tr('loader.study.change', null, acc)), h('small', {}, tr('loader.study.changeSub', null, acc))), h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›'))),
      mine.length ? h('span', { class: 'ns-label' }, tr('loader.study.courses', null, acc)) : null, mine.length ? langList(acc, S, { menus: true, list: mine }) : null,
      rest.length ? h('details', { class: 'ns-studyrest' }, h('summary', { class: 'ns-label' }, tr('loader.study.otherCourses', { n: rest.length }, acc)), h('p', { class: 'ns-muted' }, tr('loader.study.otherCoursesSub', null, acc)), langList(acc, S, { menus: true, list: rest })) : null);
  }
  /** Boot in the frame with a course (?subject=lang:<id>, or the course the learner was in): open it at #/lang/<id>. */
  function langBoot(acc, meta, asked) {
    const h0 = location.hash, want = langHash(meta.courseId);
    if (h0.startsWith(want + '/') || h0 === want) return;
    if (!h0 || h0 === '#' || (asked && h0 === '#/')) history.replaceState(null, '', location.pathname + location.search + want);
    if (window.NoemaThemes?.world(acc.id) === 'know' && location.hash.startsWith('#/lang/')) NoemaThemes.putSettings({ world: 'both' }, acc.id);   // a course is open: the Languages tab shows
  }
  if (SHELL()) {
    NoemaShell.registerWorld('lang', { page: langPage, route: langRoute, create: langCreate, today: langToday,
      menu: () => langMenu(jget(LANG_LAST(KV.acc), null)),
      // the page others see (Me › Me, docs/PROFILE.md): the courses the learner has started → [{ id, title, languages: [code], words }]
      studying: () => langCourses(KV.acc).map(m => ({ m, p: langProgress(KV.acc, m) })).filter(x => x.p.started).map(({ m, p }) => ({ id: m.courseId, title: m.title, languages: p.langs, words: p.words })) });
    addEventListener('hashchange', () => {   // leaving a course: the frame's own pages again; a subject's page: that subject is the one a reload reopens
      const hs = location.hash || '#/', inCourse = /^#\/lang\/[^/]+/.test(hs);
      if (!inCourse) { document.body.classList.remove('lx-frame'); window.NoemaLangUI?.prod?.closeLangTutor?.(); document.querySelector('.lx-pop')?.remove(); if (window.NoemaLangUI?.FR?.on) document.title = CFG.appName || 'noema-lite'; }
      const k = hs.replace(/^#\/?/, '').split('/')[0];
      if (NoemaShell.isSubjectPage?.(k) && NoemaShell.engine && Noema.subject?.id && Noema.subject.kind !== 'language' && KV.acc) Noema.setCurrent(KV.acc, Noema.subject.id);
    });
  }
  /** 📥 Import: a package (<id>.noema.zip = pack + its source files) or a plain pack (.json). */
  Object.assign(APP, { langAccount, pickLanguage });

  N.langStudy = { get: STUDY, set: putStudy, offered: studyOffered, chosen: langChosen, chooser: studyChooser, open: studyOpen };   // D21: the languages the learner studies
  Object.assign(N, { langCourses: () => langCourses(KV.acc), langData: meta => langData(KV.acc, meta) });   // the search indexes the courses too
  Object.assign(N.boot, {
    wanted: (acc, subs, w) => subs.find(s => s.id === w) || (String(w || '').startsWith('lang:') ? langMeta(w) : null),
    langBoot, startLanguage,
  });
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const subjects = force => APP.subjects(force);
  const h = S.h;
  const faceEl = S.faceEl;
  const icoTxt = S.icoTxt;
  const chev = S.chev;
  const L = S.L;
  const sheet = S.sheet;
  const menuButton = S.menuButton;
  const go = S.go;
  const open = S.open;
  const chrome = S.chrome;
  const page = S.page;
  const isLang = S.isLang;
  const WORLDS = S.WORLDS;
  /* ---------- Languages (the languages branch registers them; otherwise: language subjects you have) ---------- */
  PAGES.lang = async (args = []) => {
    const W = WORLDS.lang;
    // #/lang/<course>/… : a course drawn inside the frame by the languages branch (docs/NEW_FRAME_AND_LANGUAGES.md)
    if (args.length && args[0] && W?.route) { W.route(args, { page: (c, ...kids) => page({ tab: 'lang', back: '#/lang', ...c }, ...kids), chrome: c => chrome({ tab: 'lang', back: '#/lang', ...c }), main: S.main, h, L, open, go, sheet, menuButton, faceEl }); return; }
    const v = page({ tab: 'lang', crumbs: [[L('languages')]], corner: true, menu: W?.menu?.() || null },
      h('h1', {}, L('languages')), h('div', { class: 'row spread' }, h('span', { class: 'ns-label' }, L('yourLanguages')), W?.create ? h('button', { class: 'btn small ghost', onclick: () => W.create() }, '+ ' + L('newLanguage')) : null));
    if (W?.page) { W.page(v, { h, open, L }); return; }
    const langs = (await subjects(true)).filter(isLang);
    v.append(langs.length ? h('div', { class: 'ns-list' }, ...langs.map((s, i) => h('button', { class: 'ns-item', onclick: () => open(s.id) }, icoTxt(s.emoji || '文', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, s.title), h('small', {}, s.description || '')), chev())))
      : h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('noLanguages'))));
  };

  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
