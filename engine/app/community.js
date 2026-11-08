/* noema-lite — sharing and Explore: the 🔔 shares, invitations and updates, a subject shared or published, Explore and Discover, the search and the vault pages, people, the page others see (Me › Profile, #/u/<id>) and the admins' pages.
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
  const IDB = N.idb;
  const Noema = N;
  const jget = N.jget;
  const el = N.el;
  const slugify = N.slugify;
  const tr = N.tr;
  const overlay = N.overlay;
  const toastL = (m, ms) => N.toast(m, ms);
  const getAccount = N.getAccount;
  const Notices = N.notices;
  const ls = { get: k => NoemaCore.storage.kv.get(k), set: (k, v) => NoemaCore.storage.kv.set(k, v), del: k => NoemaCore.storage.kv.delete(k), keys: prefix => NoemaCore.storage.kv.keys(prefix) };
  const countPack = (...a) => APP.countPack(...a);
  const embedWebPictures = (...a) => APP.embedWebPictures(...a);
  const localizedSubject = (...a) => APP.localizedSubject(...a);
  const storeTranslations = (...a) => APP.storeTranslations(...a);
  const subjectsFor = (...a) => APP.subjectsFor(...a);
  /* ---------------- Sharing, Explore & notifications (docs/SHARING.md) ---------------- */
  const fmtN = n => window.NoemaI18n ? NoemaI18n.fmt.number(Number(n || 0)) : String(Number(n || 0));
  const num = n => Number(n || 0);   // a count for a plural message (never undefined)
  /** A day / a moment in the UI locale (the same numeric forms as toLocaleDateString() / toLocaleString()). */
  const DAY_O = { year: 'numeric', month: 'numeric', day: 'numeric' }, WHEN_O = { ...DAY_O, hour: 'numeric', minute: 'numeric', second: 'numeric' };
  const fmtWhen = d => window.NoemaI18n ? NoemaI18n.fmt.date(d, WHEN_O) : new Date(d).toLocaleString();
  const isCloudAcc = acc => !!(window.NoemaCloud && NoemaCloud.session() && acc === 'u_' + NoemaCloud.session().user.id);
  /** Everything another learner wants to know before choosing a subject (stored with public packs and shares). */
  function packInfo(p, acc) {
    const ch = p.chapters || [];
    const media = p.media || {};
    const exN = ch.reduce((a, c) => a + (c.exercises || []).length, 0);
    return {
      counts: { chapters: ch.length, sections: ch.reduce((a, c) => a + (c.sections || []).length, 0), exercises: exN,
        visual: ch.reduce((a, c) => a + (c.exercises || []).filter(e => /^img_/.test(e.type)).length, 0), flashcards: ch.reduce((a, c) => a + (c.flashcards || []).length, 0),
        playbooks: ch.reduce((a, c) => a + (c.debug || []).length, 0), pictures: Object.keys(media).length },
      chapters: ch.map(c => ({ num: c.num, title: c.title, emoji: c.emoji || '', sections: (c.sections || []).length, exercises: (c.exercises || []).length })),
      sources: ((p.sources && p.sources.sources) || []).map(s => ({ title: s.title, subtitle: s.subtitle || '', pages: s.pages || '', url: /^https?:/.test(s.url || '') ? s.url : (/^https?:/.test(s.file || '') ? s.file : '') })),
      restricted: Object.values(media).filter(m => m.restricted).length,
      language: p.subject.language || '', version: p.version || null, sizeKB: Math.round(JSON.stringify(p).length / 1024),
      ownerName: (getAccount(acc) || {}).name || '', math: !!p.subject.features?.math, code: !!p.subject.features?.code,
      ...(p.subject.i18n ? { i18n: p.subject.i18n } : {}), ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}),   // docs/i18n.md §10
    };
  }
  /** A readable info card: stats, chapters (numbered list), sources (with links). */
  /** The chapter list as Markdown (numbered), rendered and sanitised, in a fixed-height scroll box. */
  /** Turn a pack object into one of the account's subjects (local + cloud). */
  async function importPack(acc, p, extra = {}) {
    if (N.migrate.OLD_FORMATS.packFormats.includes(p.format)) p.format = 'noema-pack';   // a pack of the app's name before noema-lite
    if (p.format !== 'noema-pack' || !p.subject?.id || !Array.isArray(p.chapters)) throw new Error(tr('loader.import.notPack'));
    p.counts = p.counts || countPack(p);
    if (p.sharedFiles) { Object.defineProperty(p, '_sharedFiles', { value: p.sharedFiles, enumerable: false, configurable: true }); delete p.sharedFiles; }   // fetched by the caller (attachShared), not stored
    await embedWebPictures(acc, p);
    await storeTranslations(acc, p);   // translations in their own files (docs/i18n.md §10)
    await IDB.put('packs', acc + '|' + p.subject.id, p);
    KV.set(KV.accountKey('packmeta:' + p.subject.id, acc), JSON.stringify({ ...p.subject, counts: p.counts, version: p.version || null, ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}), ...extra }));
    if (isCloudAcc(acc)) await NoemaCloud.uploadPack(p).catch(e => console.warn(e));
    window.NoemaCurriculum?.Edit?.refreshAssigned?.(acc, p.subject.id, p);   // 📦 a new version of a subject that teaches steps: those steps follow it
    return { ...p.subject, origin: 'imported', counts: p.counts, ...extra };
  }

  /** The source files that came with a shared / public subject → this account (device + cloud). */
  async function attachSharedFiles(acc, p, bucket) {
    const f = p._sharedFiles; if (!f || !Object.keys(f).length || !window.NoemaSrcFiles) return;
    toastL('📎 ' + tr('loader.files.getting', { n: Object.keys(f).length }), 2500);
    const r = await NoemaSrcFiles.attachShared(acc, { ...p, sharedFiles: f }, bucket);
    if (r.failed.length) toastL('⚠️ ' + tr('loader.files.failed', { n: r.failed.length, files: r.failed.join(', ') }), 6000);
  }

  /* ---- 🌍 Explore: every public subject (library + published by users) ---- */
  /** every public subject (library + published by users) and how to study one: the shell's Explore page and the dialog below */
  async function publicSubjects(acc) {
    let pub = [];
    try { if (window.NoemaCloud && CFG.supabaseUrl) pub = (await NoemaCloud.listPublic()) || []; } catch (e) { console.warn('[explore]', e.message); }
    const mine = new Map((await subjectsFor(acc)).map(s => [s.id, s]));
    const lib = (REG.subjects || []).filter(s => !s.owner).map(localizedSubject).map(s => ({ kind: 'library', id: s.id, title: s.title, emoji: s.emoji, description: s.description, language: s.language, contentLang: s.contentLang, counts: s.counts, meta: { counts: s.counts, chapters: s.chapters, sources: s.sources, language: s.language } }));
    const users = pub.map(r => { const L = localizedSubject({ title: r.title, description: r.description, language: r.language || undefined, i18n: r.meta?.i18n, contentLocales: r.meta?.contentLocales });
      return { kind: 'public', id: r.subject_id, owner: r.owner, owner_name: r.owner_name, title: L.title, emoji: r.emoji, description: L.description, language: r.language, contentLang: L.contentLang, counts: r.meta?.counts || {}, meta: r.meta || {}, updated_at: r.updated_at }; });
    const all = [...lib, ...users].map(s => ({ ...s, domain: window.NoemaCurriculum?.domainOf ? NoemaCurriculum.domainOf({ group: s.group || s.meta?.group || (REG.subjects || []).find(x => x.id === s.id)?.group, title: s.title, description: s.description }) : 'other' }));
    const study = async (s, choose) => {
      if (s.kind === 'library') return choose(s);
      const have = mine.get(s.id);
      if (have && have.origin !== 'library' && (have.version || null) === (s.meta.version || null)) return choose(have);
      toastL('⬇️ ' + tr('loader.explore.getting', { title: s.title }));
      const r = await fetch(NoemaCloud.publicPackUrl(s.owner, s.id)); if (!r.ok) throw new Error(tr('loader.explore.downloadFailed', { status: r.status }));
      const p = await r.json(); if (REG.subjects.some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(s.owner_name || 'shared');
      const added = await importPack(acc, p, { publicFrom: s.owner, publicOwner: s.owner_name || '', publicId: s.id, publicAt: s.updated_at || null });
      await attachSharedFiles(acc, p, 'noema-public');
      toastL('📥 ' + tr('loader.explore.added', { title: p.subject.title })); choose(added);
    };
    return { all, study };
  }
  /** 🧭 Explore (#/explore/subjects: src/features/sharing/ui/explore.ts). onChoose: who takes the subject studied from there
      (the subject picker's Explore), else it opens */
  let chooseNext = null;
  function explore(acc, { onChoose } = {}) {
    chooseNext = onChoose || null;
    document.querySelectorAll('.noema-overlay').forEach(o => o.remove());   // the picker it was opened from steps aside
    if (window.NoemaShell?.mounted) location.hash = '#/explore/subjects';
    else window.NoemaCore.community.explore('subjects');   // the classic screens: in a dialog
  }
  /** study a public subject (Explore's row, a person's page): downloaded the first time, then opened */
  async function studyPublic(x) {
    const { study } = await publicSubjects(N.account.id);
    const choose = chooseNext || (s => window.NoemaShell?.mounted ? NoemaShell.open(s.id) : Noema.switchTo(N.account.id, s.id));
    chooseNext = null;
    return study(x, choose);
  }
  /** 🔗 the share dialog of a subject (src/features/sharing/ui/share.ts) */
  const shareDialog = (acc, s) => window.NoemaCore.community.share(s);
  /* ---- 🔔 incoming shares: bell + banner (engine) and the picker ---- */
  /* ---- 🔔 a new version of a subject taken from 🌍 Explore waits for the learner: ⬆️ Update or Keep mine ---- */
  const SubjUpdates = {
    list: [],
    async check(acc) {
      const metas = ls.keys(`${P}${acc}:a:packmeta:`).map(k => jget(k, null)).filter(m => m?.id && m.publicFrom);
      if (!metas.length) return (this.list = []);
      const rows = await NoemaCloud.publicRows([...new Set(metas.map(m => m.publicId || m.id))]).catch(() => null); if (!rows) return this.list;
      const CU = window.NoemaCurriculum;
      this.list = metas.map(m => {
        const r = rows.find(x => x.owner === m.publicFrom && x.subject_id === (m.publicId || m.id)); if (!r) return null;
        const v = r.meta?.version || null, mark = v || r.updated_at;
        const newer = v ? v !== (m.version || null) : !!(m.publicAt && r.updated_at > m.publicAt);
        if (!newer || m.publicSkip === mark) return null;
        const steps = CU?.stepsOf ? CU.stepsOf(acc, m.id).filter(x => x.c.nodes[x.nid].pack?.assigned).length : 0;
        return { id: 'subup:' + m.id, kind: 'subjupdate', subject: m.id, title: m.title, from_name: r.owner_name || m.publicOwner || '', owner: r.owner, publicId: r.subject_id, mark, at: r.updated_at, steps };
      }).filter(Boolean);
      return this.list;
    },
    /** ⬆️ Take the new version: the same subject id, so progress, notes and conversations stay; steps it teaches are re-planned. */
    async apply(acc, u) {
      const r = await fetch(NoemaCloud.publicPackUrl(u.owner, u.publicId)); if (!r.ok) throw new Error(tr('loader.explore.downloadFailed', { status: r.status }));
      const p = await r.json(); p.subject.id = u.subject;
      const s = await importPack(acc, p, { publicFrom: u.owner, publicOwner: u.from_name || '', publicId: u.publicId, publicAt: u.at });
      await attachSharedFiles(acc, p, 'noema-public');
      this.list = this.list.filter(x => x.id !== u.id); return s;
    },
    keep(acc, u) { const k = KV.accountKey('packmeta:' + u.subject, acc), m = jget(k, null); if (m) KV.set(k, JSON.stringify({ ...m, publicSkip: u.mark })); this.list = this.list.filter(x => x.id !== u.id); },
  };
  const Notes = {
    pending: [], remote: [], listeners: [], timer: null, acc: null,
    on(f) { this.listeners.push(f); f(this.pending); },
    /** An answered share or invitation leaves the list and the cloud's cached copy (else local() would bring it back). */
    drop(id) { this.remote = this.remote.filter(x => x.id !== id); this.pending = this.pending.filter(x => x.id !== id); this.emit(); },
    emit() { this.listeners.forEach(f => { try { f(this.pending); } catch (e) { NoemaCore.errors.report(e, { where: 'loader.notes.listener', severity: 'error' }); } }); },
    /** 🔔 = shares and invitations (from the cloud) + updates that wait for the learner (shared curricula, their steps, Explore subjects). */
    local() { this.pending = [...this.remote, ...(window.NoemaCurShare?.updates?.(this.acc) || []), ...SubjUpdates.list, ...Notices.list(this.acc)]; this.emit(); return this.pending; },
    async refresh() {
      if (!this.acc || !isCloudAcc(this.acc)) return this.pending;
      try {
        const subs = (await NoemaCloud.incomingShares()) || [];
        // 👥 invitations to curricula (engine/curshare.js) — in the same bell and banner
        const curs = window.NoemaCurShare ? ((await NoemaCurShare.invites().catch(e => { console.warn('[notes] curricula', e.message); return []; })) || []).map(i => ({ ...i, id: 'cur:' + i.curriculum, kind: 'curriculum', from_name: i.owner_name || '', meta: { ...(i.meta || {}), counts: i.meta?.counts || {} } })) : [];
        await SubjUpdates.check(this.acc).catch(e => console.warn('[notes] updates', e.message));
        this.remote = [...subs, ...curs]; this.local();
      } catch (e) { console.warn('[notes]', e.message); }
      return this.pending;
    },
    start(acc) {
      this.acc = acc; this.local(); if (!isCloudAcc(acc)) return;   // 🔔 news kept on this device shows at once, for every kind of account
      this.refresh(); clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), 120e3);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
      if (!this.curOn && window.NoemaCurShare?.onChange) { this.curOn = true; NoemaCurShare.onChange(() => this.local()); }
    },
    /** An update: take it (true) or keep mine (false). A shared map's changes open their review (you tick what you take). */
    async update(sh, take) {
      const acc = this.acc, done = () => { this.local(); };
      if (sh.kind === 'curupdate') { if (take) { await window.NoemaCurMap?.reviewChanges(acc, sh.curriculum, { onDone: done }); return; } await NoemaCurShare.takeChanges(acc, sh.curriculum, []); return done(); }
      if (sh.kind === 'stepupdate') { if (take) await NoemaCurShare.download(acc, sh.curriculum, sh.node); else NoemaCurShare.keepStep(acc, sh.curriculum, sh.node); return done(); }
      if (sh.kind === 'subjupdate') { if (take) await SubjUpdates.apply(acc, sh); else SubjUpdates.keep(acc, sh); return done(); }
    },
    async accept(sh) {
      if (sh.kind === 'curriculum') {   // 👥 join a shared curriculum: my own progress, the steps prepared together
        const c = await NoemaCurShare.join(this.acc, sh.curriculum);
        this.drop(sh.id);
        return { kind: 'curriculum', curriculum: c.id, title: c.title || c.goal };
      }
      const p = await NoemaCloud.downloadShared(sh.id);
      if ((REG.subjects || []).some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(sh.from_name || 'shared');
      const added = await importPack(this.acc, p, { sharedBy: sh.from_name || sh.from_email, sharedAt: new Date().toISOString() });
      await attachSharedFiles(this.acc, p, 'noema-shared');
      await NoemaCloud.answerShare(sh.id, true);
      this.drop(sh.id);
      return added;
    },
    async reject(sh) { if (sh.kind === 'curriculum') await NoemaCurShare.decline(sh.curriculum); else await NoemaCloud.answerShare(sh.id, false); this.drop(sh.id); },
  };
  /** 🔔 One of the bell's sharing rows (a share, an invitation, an update, news): src/features/sharing/ui/notes.ts, drawn
      into the box once the community screens are there */
  function shareRow(sh, { onAccepted } = {}) {
    const box = el('div', { class: 'nx-reqwrap' });
    window.NoemaCore.community.notes.row(box, sh, { onAccepted }).catch(e => console.error('[notes]', e));
    return box;
  }
  /** 🔔 “Clear all” under the bell's list, when news waits there (null otherwise). */
  function noticesClear(list) {
    if (!list.some(x => x.kind === 'notice')) return null;
    const box = el('div');
    window.NoemaCore.community.notes.clear(box).catch(e => console.error('[notes]', e));
    return box;
  }


  Object.assign(APP, { Notes, explore, fmtWhen, importPack, isCloudAcc, shareDialog, shareRow });

  N.notices.onChange(() => Notes.local());   // 🔔 news kept on this device joins the bell's list
  Object.assign(N, {
    importPack, explore() { return explore(N.account.id); }, publicSubjects() { return publicSubjects(N.account.id); }, studyPublic, share(s) { return shareDialog(N.account.id, s); },
    notes: Notes, shareRow, noticesClear, packInfo,
  });
  const started = N.boot.started;
  N.boot.started = acc => { started?.(acc); Notes.start(acc.id); };
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const TH = () => window.NoemaThemes;
  const N = () => window.Noema;
  const CM = () => window.NoemaCurMap;
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const caught = (where, severity = 'warning') => NoemaCore.errors.catcher(where, { severity });
  const h = S.h;
  const ico = S.ico;
  const icoTxt = S.icoTxt;
  const chev = S.chev;
  const L = S.L;
  const go = S.go;
  const chrome = S.chrome;
  const page = S.page;
  const WORLDS = S.WORLDS;
  const importFile = (...a) => APP.importFile(...a);
  const landedOpen = (...a) => APP.landedOpen(...a);
  /* ---------- the community screens (NoemaCore.community: src/composition/community-ui.ts, Lit on the UI kit, build/community.js) ----------
     🔎 #/search · 🗄️ #/vault · 👥 #/people #/chat #/group #/join · 🧭 #/explore · ⚑ #/admin/reports: drawn into the page,
     their tab, crumbs, ← and ⋮ told to the frame as they change */
  const CMY = () => window.NoemaCore?.community || null;
  const communityChrome = c => chrome({ tab: c.tab, crumbs: (c.crumbs || []).map(x => [x.label, x.href]), back: c.back, menu: c.menu?.length ? c.menu.map(it => it === '-' ? '-' : { ...it }) : null });
  function communityPage(tab, title) {
    const at = location.hash, was = S.main.querySelector(':scope > .ns-community')?.firstElementChild;
    // the same address drawn again (the frame redraws on a theme or a world that arrives late): the screen stays as it is, open menus and all
    if (was?.screenChrome && was.shownHash === at) { communityChrome(was.screenChrome()); return S.KEPT; }
    const v = page({ tab, crumbs: [[title]] });
    v.classList.add('ns-community');
    CMY()?.mount(v, at, c => { if (v.isConnected) communityChrome(c); })
      .catch(e => { console.error('[community]', e); if (v.isConnected) v.replaceChildren(h('p', {}, e.message)); });
    return null;
  }
  PAGES.search = () => communityPage(null, L('sr_search'));
  PAGES.vault = () => communityPage('vault', L('vault'));
  for (const k of ['people', 'chat', 'group', 'join']) PAGES[k] = () => communityPage('people', L('people'));
  PAGES.explore = ([kind] = []) => communityPage('discover', L(kind === 'subjects' ? 'exploreShared' : 'exploreRoadmaps'));

  /* ---------- Discover: everything that adds something new ---------- */
  PAGES.discover = () => {
    const w = TH()?.world() || 'know', item = (ic, n, title, sub, run, cls = '') => h('button', { class: 'ns-item ' + cls, onclick: run }, typeof ic === 'string' ? ico(ic, n) : ic, h('span', { class: 't' }, h('b', {}, title), h('small', {}, sub)), chev());
    page({ tab: 'discover', crumbs: [[L('discover')]], corner: true },
      h('h1', {}, L('discover')),
      h('div', { class: 'ns-list' },
        item('search', 4, L('exploreShared'), w === 'lang' ? L('exploreLangSub') : L('exploreSub'), () => go('#/explore/subjects'), 'ns-explore'),
        w !== 'lang' ? item('people', 2, L('exploreRoadmaps'), L('exploreRoadmapsSub'), () => go('#/explore'), 'ns-explorerm') : null,
        w !== 'lang' ? item('upload', 3, L('fromSources'), L('fromSourcesSub'), () => N().fromSources(acc()), 'ns-fromsrc') : null,
        w !== 'lang' ? item('map', 1, L('newRoadmap'), L('newRoadmapSub'), () => CM()?.create(acc()), 'ns-create') : null,
        w !== 'lang' ? item('spark', 2, L('createClaude'), L('createClaudeSub'), () => N().claudeGuide({ onDone: s => landedOpen(s) })) : null,
        w !== 'know' && WORLDS.lang?.create ? item(icoTxt('文A', 3), 3, L('newLanguage'), L('newLanguageSub'), () => WORLDS.lang.create()) : null,
        item('upload', 1, L('importFile'), L('importFileSub'), importFile),
        w !== 'lang' ? item('download', 4, L('importMap'), L('importMapSub'), () => CM()?.importMap(acc())) : null),
      h('span', { class: 'ns-label' }, L('withClaude')),
      h('div', { class: 'ns-list' },
        item('chat', 4, L('claudeApp'), L('claudeAppSub'), () => N().claudeSetupView?.(acc(), { open: 'B' })),
        item('key', 2, L('claudeKey'), L('claudeKeySub'), () => go('#/me/ai'))));
  };

  /* ---------- 🛠️ admin pages (#/admin/reports[/<id>]): src/features/reports/ui ---------- */
  PAGES.admin = ([what]) => {
    if (what !== 'reports' || !CMY()) { location.replace('#/'); return null; }
    return communityPage(null, window.NoemaI18n ? NoemaI18n.t('report.adminTitle') : 'Reports');
  };

  /* ---------- the page others see: mine (#/profile) and somebody's (#/u/<id>): src/features/social/ui/profile.ts. docs/PROFILE.md ---------- */
  PAGES.profile = () => communityPage('me', L('me'));
  PAGES.u = () => communityPage(null, L('me'));

  /* ---------- 🔔 the banner under the top bar (src/features/sharing/ui/bar.ts): drawn once a share or an update waits ---------- */
  S.whenMounted(() => N().notes?.on(list => { if (list.some(x => x.kind !== 'notice')) CMY()?.notes.bar(S.share).catch(caught('community.sharebar')); }));
  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
