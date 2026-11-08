/* noema-lite — the library: the subjects of this account (the registry, imported and shared packs), the Shelf, opening a subject (its pack, translations, the engine), the subject picker, a subject's ⋮, the export of a package and of the learning record, My subjects and the conversations with the tutor.
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
  const getAccount = N.getAccount;
  const pickAccount = o => N.pickAccount(o);
  const AutoBackup = N.autoBackup;
  const ls = { get: k => NoemaCore.storage.kv.get(k), set: (k, v) => NoemaCore.storage.kv.set(k, v), del: k => NoemaCore.storage.kv.delete(k), keys: prefix => NoemaCore.storage.kv.keys(prefix) };
  const fmtPct = p => window.NoemaI18n ? NoemaI18n.fmt.percent(p / 100) : p + '%';
  const Notes = { on: f => APP.Notes.on(f) };   // community.js (loaded after this file)
  const claudeGuide = (...a) => APP.claudeGuide(...a);
  const explore = (...a) => APP.explore(...a);
  const importPack = (...a) => APP.importPack(...a);
  const isCloudAcc = (...a) => APP.isCloudAcc(...a);
  const langAccount = (...a) => APP.langAccount(...a);
  const pickLanguage = (...a) => APP.pickLanguage(...a);
  const shareDialog = (...a) => APP.shareDialog(...a);
  const shareRow = (...a) => APP.shareRow(...a);
  /* ---------------- subject packs in several languages (docs/i18n.md §10, pack format v3) ----------------
     The UI language never changes a pack's content by itself; a pack MAY offer its metadata (subject.i18n) and its chapters
     (pack.translations) in other languages, and the learner sees them when the pack has their UI locale (or its language:
     es-ES → es; never English for someone else). Otherwise: the pack's own texts, with a small tag naming their language. */
  const uiLoc = () => window.NoemaI18n ? NoemaI18n.lang(uiPref()) : 'en';
  const langKey = t => { const x = String(t || 'en'); return /^zh-/i.test(x) ? x.toLowerCase() : x.split('-')[0].toLowerCase(); };
  /** The one of `offered` to show (a key of subject.i18n / pack.translations), or null: the pack's own texts. */
  function packLocale(offered, own) {
    const ui = uiLoc(), keys = (offered || []).filter(x => typeof x === 'string');
    if (!keys.length) return null;
    const want = (window.NoemaI18n?.chain ? NoemaI18n.chain(ui) : [ui]).filter(t => t !== 'en' || langKey(ui) === 'en');
    for (const t of want) {
      if (t.toLowerCase() === String(own || 'en').toLowerCase()) return null;
      const k = keys.find(x => x.toLowerCase() === t.toLowerCase()); if (k) return k;
    }
    return null;
  }
  /** A subject (pack.subject, a registry entry, packmeta) as the learner sees it: title, description, hero, tutor… in their
      language when the pack offers it (metaLocale), and the language its content is shown in (contentLang). */
  function localizedSubject(s) {
    if (!s || typeof s !== 'object') return s;
    const own = s.language || 'en', out = { ...s, contentLang: packLocale(s.contentLocales, own) || own };
    const loc = s.i18n && typeof s.i18n === 'object' ? packLocale(Object.keys(s.i18n), own) : null;
    if (!loc) return out;
    const L = s.i18n[loc] || {}; out.metaLocale = loc;
    for (const k of ['title', 'appTitle', 'description', 'searchExamples']) if (typeof L[k] === 'string' && L[k].trim()) out[k] = L[k];
    for (const k of ['hero', 'tutor']) if (L[k] && typeof L[k] === 'object') out[k] = { ...(s[k] || {}), ...L[k] };
    return out;
  }
  /** The chapters to study: the pack's translation for loc (same ids, so progress is shared), chapter by chapter; a chapter
      without a translation — or whose sections differ — stays in the pack's language; items a translation lacks (a later
      patch) are kept from the source, so nothing is lost. */
  function translatedChapters(pack, loc) {
    const tr = new Map((pack.translations?.[loc]?.chapters || []).map(c => [c.id, c]));
    const ids = (x, k) => (x[k] || []).map(y => y.id).join();
    return (pack.chapters || []).map(c => {
      const t = tr.get(c.id); if (!t || ids(t, 'sections') !== ids(c, 'sections')) return c;
      const fill = k => { const have = new Set((t[k] || []).map(x => x.id)); return [...(t[k] || []), ...(c[k] || []).filter(x => x.id && !have.has(x.id))]; };
      return { ...t, src: c.src ?? t.src, exercises: fill('exercises'), flashcards: fill('flashcards'), debug: fill('debug'), pitfalls: t.pitfalls || c.pitfalls || [] };
    });
  }
  /* A translation can live in its own file (noema-translation, docs/i18n.md §10): the pack then says
     translations: { "<locale>": { file: true, chapters: n } } and the chapters are fetched only for the learner who reads
     that language — the library's tr.<locale>.js, this device (IndexedDB "packs", key tr|<account>|<subject>|<locale>), or
     the account's storage (packs/<subject>.tr.<locale>.json). Packs with the chapters inline work as before. */
  const trKey = (acc, id, loc) => `tr|${acc}|${id}|${loc}`;
  /** Fill pack.translations[loc].chapters from wherever the file is → true when the chapters are there. */
  async function loadTranslation(acc, meta, pack, loc) {
    const t = pack?.translations?.[loc]; if (!t) return false;
    if (Array.isArray(t.chapters)) return true;
    const id = pack.subject.id, ok = f => f && f.format === 'noema-translation' && f.pack === id && Array.isArray(f.chapters);
    let f = window.NOEMA_TRANSLATIONS?.[`${id}|${loc}`];
    const lib = meta?.trLocales?.[loc]?.path;
    if (!ok(f) && lib) { await loadScript(lib).catch(caught('loader.translation.script', 'info')); f = window.NOEMA_TRANSLATIONS?.[`${id}|${loc}`]; }
    if (!ok(f)) f = await IDB.get('packs', trKey(acc, id, loc)).catch(() => null);
    if ((!ok(f) || (pack.version && f.version && f.version !== pack.version)) && isCloudAcc(acc)) {   // none here, or made for another version: the account's copy
      const r = await NoemaCloud.downloadObject(`packs/${id}.tr.${loc}.json`).then(x => x.json()).catch(() => null);
      if (ok(r)) { f = r; IDB.put('packs', trKey(acc, id, loc), r).catch(caught('loader.translation.cache')); }
    }
    if (!ok(f)) { console.warn('[noema] translation not found', id, loc); return false; }
    pack.translations[loc] = { ...t, chapters: f.chapters };
    return true;
  }
  /** Keep a pack's translations in their own files (this device + the account), the pack only names them. */
  async function storeTranslations(acc, p) {
    for (const [loc, t] of Object.entries(p.translations || {})) {
      if (!t || !Array.isArray(t.chapters)) continue;
      const f = { format: 'noema-translation', v: 1, pack: p.subject.id, locale: loc, source: p.subject.language || 'en', version: p.version || null, chapters: t.chapters };
      await IDB.put('packs', trKey(acc, p.subject.id, loc), f).catch(caught('loader.translation.cache'));
      if (isCloudAcc(acc)) await NoemaCloud.uploadObject(`packs/${p.subject.id}.tr.${loc}.json`, new Blob([JSON.stringify(f)], { type: 'application/json' }), 'application/json').catch(e => console.warn(e));
      p.translations[loc] = { file: true, chapters: t.chapters.length };
    }
    return p;
  }
  /** A copy of the pack with every translation inline (to share, publish or save as a package: it must stand alone). */
  async function inlineTranslations(acc, meta, pack) {
    if (!pack?.translations) return pack;
    const p = { ...pack, translations: { ...pack.translations } };
    for (const loc of Object.keys(p.translations)) if (!(await loadTranslation(acc, meta, p, loc))) delete p.translations[loc];
    if (!Object.keys(p.translations).length) delete p.translations;
    return p;
  }
  /** A noema-translation file imported on its own (📥): checked against the subject it belongs to, then kept like the others. */
  async function attachTranslation(acc, f) {
    const meta = (await subjectsFor(acc)).find(x => x.id === f.pack);
    if (!meta) throw new Error(tr('loader.tr.noSubject', { id: String(f.pack || '') }));
    await NoemaCore.contracts.ready();   // the content checks come with the contracts' validators (build/contracts.js)
    const pack = await getPack(acc, meta), r = NoemaCore.content.checkTranslation(f, pack);
    if (r.errors.length) throw new Error(tr('loader.tr.invalid', { list: r.errors.slice(0, 3).join('; ') }));   // the errors: English diagnostics (src/features/content)
    await IDB.put('packs', trKey(acc, f.pack, f.locale), f);
    if (isCloudAcc(acc)) await NoemaCloud.uploadObject(`packs/${f.pack}.tr.${f.locale}.json`, new Blob([JSON.stringify(f)], { type: 'application/json' }), 'application/json').catch(e => console.warn(e));
    if (meta.origin === 'imported') {   // the subject now names it, on every device
      const p = { ...pack, translations: { ...(pack.translations || {}), [f.locale]: { file: true, chapters: f.chapters.length } },
        ...(f.subject && typeof f.subject === 'object' ? { subject: { ...pack.subject, i18n: { ...(pack.subject.i18n || {}), [f.locale]: { ...(pack.subject.i18n?.[f.locale] || {}), ...f.subject } } } } : {}) };   // its name in that language too
      for (const [loc, t] of Object.entries(p.translations)) if (Array.isArray(t?.chapters)) p.translations[loc] = { file: true, chapters: t.chapters.length };
      await IDB.put('packs', acc + '|' + p.subject.id, p);
      const pm = KV.accountKey('packmeta:' + p.subject.id, acc), cur = jget(pm, null) || {};
      KV.set(pm, JSON.stringify({ ...cur, contentLocales: Object.keys(p.translations), ...(p.subject.i18n ? { i18n: p.subject.i18n } : {}) }));
      if (isCloudAcc(acc)) await NoemaCloud.uploadPack(p).catch(e => console.warn(e));
      if (window.NOEMA_PACKS) delete window.NOEMA_PACKS[p.subject.id];
    }
    return { title: meta.title || meta.id, locale: f.locale };
  }
  /** A small tag with the language of a subject's content, when it is not the UI language (null otherwise). */
  function langTag(s) {
    if (!s || s.kind === 'language' || String(s.id || '').startsWith('lang:')) return null;
    const code = s.contentLang || s.language || 'en';
    if (langKey(code) === langKey(uiLoc())) return null;
    const name = window.NoemaI18n ? NoemaI18n.fmt.langName(code) : code, label = tr('packs.langTag', { lang: name });
    return el('span', { class: 'noema-langtag', title: label, 'aria-label': label, 'data-lang': code }, String(code).split('-')[0].toUpperCase());
  }

  /* ---------------- subjects visible to an account ---------------- */
  async function importedPacks(acc) { try { return (await IDB.entries('packs', acc + '|')).map(([k, v]) => v); } catch (e) { return []; } }
  async function subjectsFor(acc) {
    const a = getAccount(acc) || {};
    const settings = jget(KV.accountKey('settings', acc), {});
    const hidden = new Set(settings.hiddenSubjects || []);
    const allow = Array.isArray(a.subjects) ? new Set(a.subjects) : null;
    const list = (REG.subjects || []).filter(s => (!s.owner || s.owner === acc) && (!allow || allow.has(s.id) || s.owner === acc)).map(s => ({ ...s, origin: s.owner ? 'private' : 'library' }));
    const imported = await importedPacks(acc);
    imported.forEach(p => {
      const m = p.subject; const extra = jget(KV.accountKey('packmeta:' + m.id, acc), null) || {};
      if (list.some(s => s.id === m.id)) return;
      // The synced metadata (written by the connector when Claude saves a new version, or by another device) wins over
      // the copy cached on this device: a different version there means the cached copy is out of date → getPack downloads it.
      // A translation saved since (noema_save_translation keeps the version and names the language in the metadata) counts too.
      const newer = !!(extra.version && extra.version !== (p.version || null)) || (extra.contentLocales || []).some(l => !p.translations?.[l]);
      list.push(newer
        ? { ...m, ...extra, origin: 'imported', counts: extra.counts || p.counts || countPack(p), version: extra.version, updateAvailable: true }
        : { ...extra, ...m, origin: 'imported', counts: p.counts || countPack(p), version: p.version, sharedBy: extra.sharedBy, publicFrom: extra.publicFrom, publicOwner: extra.publicOwner, contentLocales: Object.keys(p.translations || {}),
          chapters: (p.chapters || []).map(c => ({ id: c.id, num: c.num, sections: (c.sections || []).length })) });
    });
    // imported packs known from synced metadata (e.g. imported on another device, stored in the cloud)
    ls.keys(`${P}${acc}:a:packmeta:`).forEach(k => { const m = jget(k, null); if (m && !list.some(s => s.id === m.id)) list.push({ ...m, origin: 'imported' }); });
    return list.map(s => { const L = localizedSubject(s), mine = L.metaLocale ? { _origTitle: L.title, _origDesc: L.description || '' } : {};   // ✏️: saving the translated words unchanged keeps no override
      return { ...L, ...mine, ...subjOverride(acc, s.id), hidden: hidden.has(s.id) }; });
  }
  /* ---------- your own name / description for any subject (synced; the pack itself is not changed) ---------- */
  function subjOverride(acc, id) { const o = jget(KV.accountKey('subjoverride:' + id, acc), null); if (!o) return {}; const r = {}; if (o.title) r.title = o.title; if (o.description != null) r.description = o.description; if (o.emoji) r.emoji = o.emoji; return r; }
  function setSubjOverride(acc, id, o) { const k = KV.accountKey('subjoverride:' + id, acc); const cur = jget(k, {}) || {}; const next = { ...cur, ...o }; Object.keys(next).forEach(x => (next[x] === '' || next[x] == null) && delete next[x]); if (Object.keys(next).length) KV.set(k, JSON.stringify(next)); else KV.del(k); }
  function setHidden(acc, id, hide) { const k = KV.accountKey('settings', acc); const st = jget(k, {}); const h = new Set(st.hiddenSubjects || []); hide ? h.add(id) : h.delete(id); st.hiddenSubjects = [...h]; KV.set(k, JSON.stringify(st)); }
  /** Delete a subject that belongs to this account (imported / made with Claude / shared with you / from Explore / a curriculum step):
      this device, the cloud copy, its metadata and source files. Progress is kept (it returns if the pack is imported again). */
  async function deleteSubject(acc, s) {
    const stored = await IDB.get('packs', acc + '|' + s.id).catch(() => null);
    const locs = Object.keys(stored?.translations || {});   // its translations go with it (docs/i18n.md §10)
    if (stored && window.NoemaSrcFiles?.removeActivityFiles) await NoemaSrcFiles.removeActivityFiles(acc, stored).catch(caught('loader.subject.remove'));   // and its H5P activities' files
    await IDB.del('packs', acc + '|' + s.id).catch(caught('loader.subject.remove'));
    for (const l of locs) await IDB.del('packs', trKey(acc, s.id, l)).catch(caught('loader.subject.remove'));
    KV.del(KV.accountKey('packmeta:' + s.id, acc)); KV.del(KV.accountKey('subjoverride:' + s.id, acc));
    if (isCloudAcc(acc)) await NoemaCloud.deleteObjects('noema-private', [`${NoemaCloud.session().user.id}/packs/${s.id}.json`, ...locs.map(l => `${NoemaCloud.session().user.id}/packs/${s.id}.tr.${l}.json`)]).catch(e => console.warn('[delete subject]', e));
    if (window.NoemaSrcFiles) await NoemaSrcFiles.removeAll(acc, s.id).catch(caught('loader.subject.remove'));
    if (s.curriculum && window.NoemaCurriculum) { const c = NoemaCurriculum.get(acc, s.curriculum); if (c?.nodes[s.node]) { c.nodes[s.node].pack = null; NoemaCurriculum.save(acc, c); } }
    // 📦 every other step it teaches (attached to them): the step is planned and prepared the usual way again
    if (window.NoemaCurriculum?.stepsOf) for (const { c, nid } of NoemaCurriculum.stepsOf(acc, s.id)) { if (c.nodes[nid].pack?.assigned) NoemaCurriculum.Edit.detach(acc, c.id, nid); else { const cc = NoemaCurriculum.get(acc, c.id); cc.nodes[nid].pack = null; NoemaCurriculum.save(acc, cc); } }
    if (window.NOEMA_PACKS) delete window.NOEMA_PACKS[s.id];
  }
  /** ✏️ Edit a subject: name, description, hide, delete (and share for your own). */
  function editSubject(acc, s, { onChange } = {}) {
    const own = s.origin !== 'library' && s.origin !== 'private';
    overlay((box, close) => {
      const title = el('input', { class: 'noema-input', value: s.title, maxlength: '90', 'aria-label': tr('loader.edit.name') });
      const desc = el('textarea', { class: 'noema-input', rows: 3, maxlength: '400', placeholder: tr('loader.edit.descPlaceholder'), 'aria-label': tr('loader.edit.desc') }); desc.value = s.description || '';
      const done = () => { close(); onChange?.(); };
      box.append(brandHead(`${s.emoji || '📘'} ${tr('loader.edit.title', { title: s.title })}`, s.origin === 'library' ? tr('loader.edit.libraryNote') : tr('loader.edit.ownNote')),
        el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, tr('loader.edit.name'), title), el('label', { class: 'cg-field' }, tr('loader.edit.desc'), desc),
          el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => { const t = title.value.trim(); if (!t) { title.focus(); return; } setSubjOverride(acc, s.id, { title: t === (s._origTitle || '') ? '' : t, description: s._origDesc != null && desc.value.trim() === s._origDesc ? '' : desc.value.trim() }); toastL('✔ ' + tr('loader.edit.saved')); done(); } }, tr('loader.edit.save')),
            jget(KV.accountKey('subjoverride:' + s.id, acc), null) ? el('button', { class: 'btn small ghost', onclick: () => { KV.del(KV.accountKey('subjoverride:' + s.id, acc)); toastL('↩ ' + tr('loader.edit.restored')); done(); } }, '↩ ' + tr('loader.edit.restore')) : null)),
        el('div', { class: 'nx-sec' }, el('h4', {}, '🙈 ' + tr('loader.edit.removeTitle')), el('p', { class: 'tiny' }, tr('loader.edit.removeText')),
          el('button', { class: 'btn small', onclick: () => { setHidden(acc, s.id, true); toastL('🙈 ' + tr('loader.edit.hidden')); done(); } }, '🙈 ' + tr('loader.edit.hide'))),
        own ? el('div', { class: 'nx-sec' }, el('h4', {}, '🗑 ' + tr('loader.edit.deleteTitle')), el('p', { class: 'tiny' }, tr('loader.edit.deleteText')),
          el('button', { class: 'btn small danger', onclick: async () => { if (!confirm(tr('loader.edit.deleteConfirm', { title: s.title }))) return; await deleteSubject(acc, s); toastL('🗑 ' + tr('loader.edit.deleted')); done(); if (KV.subj === s.id) Noema.switchTo(acc, null); } }, '🗑 ' + tr('loader.edit.deleteBtn'))) : null,
        own ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { close(); shareDialog(acc, s); } }, '🔗 ' + tr('loader.edit.share'))) : null,
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      setTimeout(() => title.focus(), 150);
    });
  }
  function countPack(p) { const ch = p.chapters || []; return { chapters: ch.length, sections: ch.reduce((a, c) => a + c.sections.length, 0), exercises: ch.reduce((a, c) => a + c.exercises.length, 0) }; }
  function subjectProgress(acc, s) {
    const L = NoemaCore.learning; if (L.account() !== acc || !s.counts?.exercises || !L.hasProgress(s.id)) return 0;
    const ok = Object.values(L.progress(s.id).res).filter(r => r.ok > 0).length;
    return Math.min(1, ok / s.counts.exercises);
  }

  /* ---------------- pack loading ---------------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = el('script', { src }); s.onload = res; s.onerror = () => rej(new Error(tr('loader.err.loadScript', { file: src }))); document.head.append(s); }); }
  function loadCSS(href) { return new Promise(res => { const l = el('link', { rel: 'stylesheet', href }); l.onload = res; l.onerror = res; document.head.append(l); }); }
  /** "fetch": "app" web pictures (docs/VISUAL.md §6): download + embed once, so the subject also works offline.
      Pictures that cannot be downloaded now stay as links (shown from the web) and are tried again next time. */
  const needsPictures = p => Object.values(p?.media || {}).some(m => m.fetch === 'app' && !m.data);
  async function embedWebPictures(acc, p, { wait = 20000 } = {}) {
    if (!needsPictures(p) || !window.NoemaClaude) return p;
    const job = NoemaClaude.fillWebPictures(p).then(r => { if (r.embedded) IDB.put('packs', acc + '|' + p.subject.id, p).catch(caught('loader.pictures.cache')); });
    await Promise.race([job, new Promise(r => setTimeout(r, wait))]).catch(caught('loader.pictures'));
    return p;
  }
  async function getPack(acc, meta) {
    window.NOEMA_PACKS = window.NOEMA_PACKS || {};
    if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id];
    let cached = null;
    if (meta.origin === 'imported') {
      cached = await IDB.get('packs', acc + '|' + meta.id);
      // a newer version, or a translation saved since this copy was kept (noema_save_translation rewrites the pack under the same version and names the language in its card)
      const lacksTr = !!(cached && (meta.contentLocales || []).some(l => !cached.translations?.[l]));
      const stale = !!(cached && ((meta.version && cached.version !== meta.version) || lacksTr) && window.NoemaCloud && NoemaCloud.session());
      if (cached && !stale) { if (needsPictures(cached)) embedWebPictures(acc, cached, { wait: 0 }); return cached; }     // a newer version exists in the cloud (e.g. Claude updated it) → download below
      if (stale) toastL('⬇️ ' + tr('loader.pack.gettingNew', { title: meta.title || meta.id }), 4000);
    }
    if (meta.path) { await loadScript(meta.path); if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id]; }
    if (window.NoemaCloud && NoemaCloud.session()) {
      let err = null; const p = await NoemaCloud.downloadPack(meta.id).catch(e => { err = e; return null; });
      if (p) { await IDB.put('packs', acc + '|' + meta.id, p).catch(caught('loader.pack.cache')); if (cached) toastL('✨ ' + tr('loader.pack.upToDate', { title: meta.title || meta.id }), 3000); return embedWebPictures(acc, p); }
      if (cached && err) { console.warn('[noema] the new version could not be downloaded', err); toastL('⚠️ ' + tr('loader.pack.newFailed', { title: meta.title || meta.id, error: (err.message || err.code ? errMsg(err) : '') || tr('loader.pack.network') }), 7000); }
    }
    if (cached) return cached;
    throw new Error(tr('loader.pack.loadFailed', { title: meta.title || meta.id }));
  }
  async function ensureMath() {
    if (window.katex && window.renderMathInElement) return;
    const base = window.NOEMA_VENDOR_BASE || 'engine/vendor/';
    try { await loadCSS(base + 'katex/katex.min.css'); await loadScript(base + 'katex/katex.min.js'); await loadScript(base + 'katex/contrib/auto-render.min.js'); }
    catch (e) { try { await loadCSS('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'); await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'); await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js'); } catch (e2) { console.warn('[Noema] math rendering unavailable'); } }
  }

  /* ---------------- 📚 the Shelf (docs/CURRICULUM.md §9): subjects that teach no step of any curriculum ---------------- */
  /** The subjects on the Shelf: studyable, but the curriculum map is the way to study. (Language courses are never on it.) */
  async function shelf(acc) {
    const CU = window.NoemaCurriculum, on = new Set();
    for (const c of CU?.list(acc) || []) for (const n of Object.values(c.nodes || {})) if (n.pack?.id) on.add(n.pack.id);
    const onItsWay = s => { const c = s.curriculum && CU?.get(acc, s.curriculum); return !!(c?.nodes[s.node] && !c.nodes[s.node].pack); };   // made for a step that has not picked it up yet
    return (await subjectsFor(acc)).filter(s => !s.hidden && !on.has(s.id) && !onItsWay(s) && s.kind !== 'language' && !String(s.id).startsWith('lang:'));
  }
  /** The curriculum step a subject teaches → { id, node } | null: the step it was opened from on the map (one subject may
      teach several steps; curmap.js viaStep), else the step it was made for while that step still uses it, else the first
      step it is attached to — or the step it was made for that has not picked it up yet. */
  function stepOf(acc, meta, pack) {
    const CU = window.NoemaCurriculum, ref = pack?.curriculum || (meta.curriculum ? { id: meta.curriculum, node: meta.node } : null);
    if (!CU?.stepsOf) return ref;
    const on = CU.stepsOf(acc, meta.id), uses = r => !!r && on.some(x => x.c.id === r.id && x.nid === r.node);
    let via = null; try { via = JSON.parse(sessionStorage.getItem('noema-device:viaStep') || 'null'); } catch (e) { /* no sessionStorage here (blocked site data): the step this tab came from is only a back link, nothing is lost */ }
    if (via?.acc === acc && via.sid === meta.id && uses(via)) return { id: via.id, node: via.node };
    if (uses(ref)) return ref;
    if (on.length) return { id: on[0].c.id, node: on[0].nid };
    const c = ref && CU.get(acc, ref.id); return ref && (!c || !c.nodes[ref.node]?.pack?.id) ? ref : null;
  }
  /** A subject's pack by its id (library, private or imported) — e.g. one attached to a curriculum step. */
  async function loadSubject(acc, id) { const meta = (await subjectsFor(acc)).find(s => s.id === id); if (!meta) throw new Error(tr('loader.pack.notInLibrary')); return getPack(acc, meta); }
  /** A subject that just arrived (imported, from 🌍 Explore, shared with you) is on the Shelf: say how to put it on a map. */
  function landed(acc, s) {
    if (!s || !window.NoemaCurMap || !window.NoemaCurriculum || NoemaCurriculum.stepsOf(acc, s.id).length) return;
    setTimeout(() => toastL(tr('pick.onShelf', { title: s.title || s.id }, acc), 6000), 3800);
  }
  /** The Shelf's subjects as chips, by group: tap = study it; ✏️ edit · 🔗 share · 🧭 put it on a map. → { list, draw(subs) } */
  /** A library group's name (library/groups.json) in the UI language: loader.group.<id>; a group the catalog does not know keeps its title. */
  const groupTitle = (g, acc) => g.id === 'other' ? tr('pick.other', null, acc) : window.NoemaI18n?.has?.('loader.group.' + g.id) ? tr('loader.group.' + g.id, null, acc) : g.title;
  function shelfChips(acc, { q, onPick, onChange }) {
    const groups = (REG.groups || []).slice(); if (!groups.some(g => g.id === 'other')) groups.push({ id: 'other', title: tr('pick.other', null, acc), emoji: '✨' });
    const list = el('div'); let subs = [];
    const draw = next => {
      if (next) subs = next; list.innerHTML = '';
      const term = (q?.value || '').trim().toLowerCase(); let n = 0;
      groups.forEach(g => {
        const items = subs.filter(s => (groups.some(x => x.id === s.group) ? s.group : 'other') === g.id && (!term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term)));
        if (!items.length) return;
        list.append(el('div', { class: 'noema-group' }, el('div', { class: 'noema-grouphead' }, `${g.emoji || ''} ${groupTitle(g, acc)}`),
          el('div', { class: 'noema-chips' }, ...items.map(s => { n++; const pct = Math.round(subjectProgress(acc, s) * 100);
            const chip = el('button', { class: 'noema-chip' + (s.id === KV.subj ? ' on' : ''), style: { animationDelay: n * 35 + 'ms' }, title: s.description || '', onclick: () => onPick(s) },
              el('span', { class: 'e' }, s.emoji || '📘'), el('span', { class: 't' }, s.title), langTag(s), window.NoemaBridge?.tag(s, acc) || null, s.origin !== 'library' ? el('span', { class: 'o', title: s.sharedBy ? tr('loader.chip.sharedBy', { name: s.sharedBy }) : s.publicOwner ? tr('loader.chip.from', { name: s.publicOwner }) : '' }, s.origin === 'private' ? '🔒' : s.sharedBy ? '🤝' : s.publicFrom ? '🌍' : '📥') : null, s.updateAvailable ? el('span', { class: 'o', title: tr('loader.chip.update') }, '✨') : null, pct ? el('span', { class: 'p' }, fmtPct(pct)) : null);
            const edit = el('button', { class: 'noema-editbtn', title: tr('loader.chip.editTip'), 'aria-label': tr('loader.chip.editLabel', { title: s.title }), onclick: e => { e.stopPropagation(); editSubject(acc, s, { onChange }); } }, '✏️');
            const toMap = window.NoemaCurMap?.attachDialog ? el('button', { class: 'noema-mapbtn', title: tr('pick.putOnMap', null, acc), 'aria-label': `${tr('pick.putOnMap', null, acc)} ${s.title}`, onclick: e => { e.stopPropagation(); NoemaCurMap.attachDialog(acc, { subject: s, onDone: onChange }); } }, '🧭') : null;
            return el('span', { class: 'noema-chipwrap' }, chip, edit, s.origin === 'library' ? null : el('button', { class: 'noema-sharebtn', title: tr('loader.edit.share'), 'aria-label': tr('loader.chip.shareLabel', { title: s.title }), onclick: e => { e.stopPropagation(); shareDialog(acc, s); } }, '🔗'), toMap); }))));
      });
      if (!n) list.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '📭'), el('p', {}, subs.length ? tr('pick.noMatch', null, acc) : tr('pick.none', null, acc))));
    };
    return { list, draw };
  }
  /** 📚 The Shelf on its own (from 🧭 Curricula and ⚙️ → Subjects). onStudy(id) — default: open the subject. */
  async function openShelf(acc, { onStudy } = {}) {
    const study = id => onStudy ? onStudy(id) : Noema.switchTo(acc, id);
    overlay(async (box, close) => {
      const q = el('input', { class: 'noema-input noema-search', placeholder: tr('pick.search', null, acc), oninput: () => S.draw() });
      const S = shelfChips(acc, { q, onPick: s => { close(); study(s.id); }, onChange: async () => S.draw(await shelf(acc)) });
      const subs = await shelf(acc);
      box.append(brandHead(tr('pick.shelf', { n: subs.length }, acc), tr('pick.shelfSub', null, acc)), q, S.list,
        el('div', { class: 'row noema-ovfoot' }, window.NoemaCurMap ? el('button', { class: 'btn small', onclick: () => { close(); NoemaCurMap.library(acc, { onStudy }); } }, tr('pick.curricula', null, acc)) : null, el('button', { class: 'btn small', onclick: close }, tr('pick.close', null, acc))));
      S.draw(subs);
    }, { closable: true });
  }
  async function pickSubject(acc, { closable = false } = {}) {
    let subs = await shelf(acc);   // 📚 on no step of any curriculum
    const a = getAccount(acc) || { name: acc, emoji: '🙂' };
    const CU = window.NoemaCurriculum, CM = () => window.NoemaCurMap;
    return new Promise(resolve => {
      overlay((box, close) => {
        const pick = s => { close(); resolve(s); };
        const onStudy = async id => { const s = (await subjectsFor(acc)).find(x => x.id === id); if (s) pick(s); };
        const q = el('input', { class: 'noema-input noema-search', placeholder: tr('pick.search', null, acc), oninput: () => S.draw() });
        const S = shelfChips(acc, { q, onPick: pick, onChange: async () => { subs = await shelf(acc); S.draw(subs); drawCurs(); sum.textContent = tr('pick.shelf', { n: subs.length }, acc); } });
        const imp = el('label', { class: 'btn small' }, tr('pick.import', null, acc), el('input', { type: 'file', accept: '.zip,.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await importPackFile(acc, e.target.files[0]); if (!s) { S.draw(await shelf(acc)); return; } landed(acc, s); pick(s); } catch (er) { toastL('⚠️ ' + errMsg(er), 4000); } } }));
        const reqs = el('div', { class: 'nx-reqs' });
        Notes.on(all => { const pending = all.filter(x => !x.kind); reqs.innerHTML = ''; if (!pending.length) return; reqs.append(el('div', { class: 'nx-lbl' }, tr('pick.shared', { n: pending.length }, acc)), ...pending.map(sh => shareRow(sh, { onAccepted: s => { landed(acc, s); pick(s); } }))); });
        // the way to study: a curriculum — a map of steps, each step a subject (the subjects on no map wait on 📚 the Shelf below)
        const modes = el('div', { class: 'cm-modes', role: 'tablist' },
          el('button', { class: 'cm-mode on', role: 'tab', 'aria-selected': 'true', onclick: () => CM()?.library(acc, { onStudy }) }, tr('pick.curricula', null, acc), el('small', {}, tr('pick.curriculaSub', null, acc))),
          (REG.languages || []).length || langAccount(acc).length ? el('button', { class: 'cm-mode', role: 'tab', 'aria-selected': 'false', onclick: () => pickLanguage(acc, s => { close(); resolve(s); }) }, '🌍 ' + tr('loader.pick.languages'), el('small', {}, tr('loader.pick.languagesSub'))) : null);
        const curs = el('div', { class: 'pick-curs' });
        const drawCurs = () => {
          curs.innerHTML = ''; const list = CU?.list(acc) || [];
          if (!list.length) { curs.append(el('div', { class: 'tiny pick-nocur' }, tr('pick.noCurricula', null, acc), ' ', CM() ? el('button', { class: 'btn small', onclick: () => CM().create(acc, { onStudy }) }, tr('pick.newCurriculum', null, acc)) : null, ' ', CM() ? el('button', { class: 'btn small ghost', onclick: () => CM().importMap(acc, { onStudy }) }, tr('pick.importMap', null, acc)) : null)); return; }
          curs.append(...list.slice(0, 6).map(c => { const sm = c.status === 'ready' ? CU.summary(acc, c) : null;
            return el('button', { class: 'pick-cur', onclick: () => c.status === 'ready' || c.status === 'attach' ? CM()?.map(acc, c.id, { onStudy }) : CM()?.progress(acc, c, { onStudy }) },
              el('b', {}, (c.shared && !c.shared.ended ? '👥 ' : '🧭 ') + (CU.shownTitle?.(c) || c.title || c.goal)), el('span', { class: 'tiny' }, sm ? tr('loader.pick.curSummary', { mastered: sm.mastered, total: sm.total, open: sm.open }) : '⏳')); }),
            list.length > 6 ? el('button', { class: 'pick-cur', onclick: () => CM()?.library(acc, { onStudy }) }, el('b', {}, `+${list.length - 6}`), el('span', { class: 'tiny' }, tr('pick.curricula', null, acc))) : null);
        };
        // 📚 the Shelf: folded away once the learner has a map (it remembers, per device, whether it was left open)
        const SK = `${P}${acc}:pickShelfOpen`; let remembered = null; remembered = ls.get(SK);
        const sum = el('summary', {}, tr('pick.shelf', { n: subs.length }, acc));
        const shelfBox = el('details', { class: 'pick-shelf', open: remembered != null ? remembered === '1' : !(CU?.list(acc) || []).length || !CM() },
          sum, el('p', { class: 'tiny' }, tr('pick.shelfSub', null, acc)), q, S.list);
        sum.addEventListener('click', () => setTimeout(() => { ls.set(SK, shelfBox.open ? '1' : '0'); if (shelfBox.open && subs.length > 8) q.focus(); }, 0));   // only the learner's own choice is remembered
        box.append(brandHead(tr('pick.what', null, acc), `${a.emoji || ''} ${a.name}`), modes, reqs, curs, shelfBox,
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small ai', onclick: () => claudeGuide(acc, { onDone: s => { landed(acc, s); pick(s); } }) }, tr('pick.create', null, acc)), el('button', { class: 'btn small', onclick: () => explore(acc, { onChoose: s => { landed(acc, s); pick(s); } }) }, tr('pick.explore', null, acc)), imp, el('button', { class: 'btn small ghost', onclick: async () => { close(); const na = await pickAccount({ closable: true }); if (na) { Noema.switchTo(na.id, null); } } }, tr('pick.switchProfile', null, acc)),
            closable ? el('button', { class: 'btn small', onclick: () => { close(); resolve(null); } }, tr('pick.close', null, acc)) : null));
        drawCurs(); S.draw(subs); if (shelfBox.open && subs.length > 8) setTimeout(() => q.focus(), 300);
        const offC = CU?.onChange?.(() => { if (box.isConnected) drawCurs(); else offC?.(); });
      }, { closable });
    });
  }
  async function importPackFile(acc, file) {
    const SF = window.NoemaSrcFiles;
    if (SF && await SF.isZip(file)) {
      toastL('📦 ' + tr('loader.import.opening'), 1500);
      const b = await SF.readBundle(file);
      const s = await importPack(acc, b.pack);
      const r = await SF.attachPackaged(acc, b.pack, b.file);
      const ra = await SF.attachActivityFiles(acc, b.pack, b.file);   // h5p@1: each activity's .h5p file beside the pack (docs/INTERACTIVE_H5P.md)
      r.missing.push(...ra.missing);
      const miss = r.missing.length + r.bad.length;
      toastL('📥 ' + (r.attached.length ? tr('loader.import.doneWithFiles', { title: s.title, n: r.attached.length }) : tr('loader.import.done', { title: s.title })) + (miss ? ' · ⚠️ ' + tr('loader.import.filesMissing', { n: miss, files: [...r.missing, ...r.bad].join(', ') }) : ''), miss ? 6000 : 3500);
      return s;
    }
    let p; try { p = JSON.parse(await file.text()); } catch (e) { throw new Error(tr('loader.import.notPackOrPackage')); }
    if (p?.format === 'noema-translation') {   // a translation of a subject the learner has (docs/i18n.md §10)
      const r = await attachTranslation(acc, p);
      toastL('🌐 ' + tr('loader.tr.attached', { lang: window.NoemaI18n ? NoemaI18n.fmt.langName(r.locale) : r.locale, title: r.title }), 4000);
      return null;
    }
    if (p?.format === 'noema-bridge' && window.NoemaBridge) {   // 文A language help for a subject the learner has (docs/BRIDGE.md): attached, the pack is not changed
      const r = await NoemaBridge.attach(acc, p);
      toastL('文A ' + tr('bridge.attached', { lang: window.NoemaI18n ? NoemaI18n.fmt.langName(r.native) : r.native, title: r.title }), 4000);   // i18n-ignore (the icon)
      return null;
    }
    const s = await importPack(acc, p);
    const want = SF ? SF.packaged(p).filter(x => !SF.index(acc, p.subject.id)[x.id]) : [];
    toastL('📥 ' + tr('loader.import.done', { title: s.title }) + (want.length ? ' · 📎 ' + tr('loader.import.jsonNoFiles', { n: want.length }) : ''), want.length ? 6500 : 2500);
    return s;
  }
  /** ⬇️ Save a subject as a package (pack + every attached source file). */
  async function exportPackage(acc, pack) {
    if (!window.NoemaSrcFiles) { const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' })), download: pack.subject.id + '.json' }); a.click(); return; }
    toastL('📦 ' + tr('loader.export.preparing'), 1500);
    const live = pack, lib = (REG.subjects || []).find(x => x.id === pack.subject.id), base = lib?.path && /\/pack\.js$/.test(lib.path) ? lib.path.replace(/pack\.js$/, '') : null;   // h5p@1: the items' .h5p files come from what the app holds, or from beside the library pack
    // the pack as stored (the open subject's object is extended by the engine): IndexedDB copy, or the library file
    let clean = await IDB.get('packs', acc + '|' + pack.subject.id).catch(() => null);
    if (!clean) { const m = (REG.subjects || []).find(x => x.id === pack.subject.id); if (m?.path) clean = await fetch(m.path.replace(/pack\.js$/, 'pack.json')).then(r => r.ok ? r.json() : null).catch(() => null); }
    if (clean) pack = clean;
    pack = await inlineTranslations(acc, (REG.subjects || []).find(x => x.id === pack.subject.id), pack);   // the package stands alone
    try {
      const { files: n, missing } = await NoemaSrcFiles.downloadBundle(acc, pack, { live, base });
      toastL(`⬇️ ${pack.subject.id}.noema.zip` + (n ? ' ' + tr('loader.export.withFiles', { n }) : ''), 3000);   // i18n-ignore (a file name)
      if (missing.length) toastL('⚠️ ' + tr('loader.export.missingActivities', { n: missing.length, items: missing.join(', ') }), 8000);
    }
    catch (e) { toastL('⚠️ ' + errMsg(e), 4000); }
  }

  /** Boot the engine on a subject. background: the frame needs the engine's account pages (Me › Profile, AI, Help…) or the
      tutor before any subject was opened: the last subject you studied (else the first) loads quietly, without becoming the
      one you are "in" and without the start-of-day things start() already did. */
  let engineBoot = null, engineScript = null;   // engineScript: engine.js being loaded or loaded (once per page)
  async function openEngine(acc, subs, meta, { background = false } = {}) {
    await NoemaCore.contracts.ready();   // the engine checks content (activities, the author): its checks come with the contracts' validators
    KV.subj = meta.id;
    if (!background) Noema.setCurrent(acc.id, meta.id);
    if (N.migrate.quest(acc.id, meta.id)) await NoemaCore.learning.migrate();   // Databricks Quest's progress, once its pack is opened (src/composition/shell/migrate.ts)
    jset(`${P}${acc.id}:meta:sessions`, (jget(`${P}${acc.id}:meta:sessions`, 0) || 0) + 1);
    if (window.NoemaConvos) {
      try { await NoemaConvos.migrateLegacy(acc.id, subs); } catch (e) { console.warn('[Noema] conversation migration', e); }
      if (acc.kind === 'cloud' && window.NoemaCloud) { try { await Promise.race([NoemaCloud.pullConvos(acc.id), new Promise(r => setTimeout(r, 5000))]); } catch (e) { console.warn('[Noema] conversation pull failed', e); } }
      try { Noema.preloadedConvos = await NoemaConvos.list(acc.id, { subject: meta.id, includeDeleted: false }); } catch (e) { Noema.preloadedConvos = []; }
    }
    let pack;
    try { pack = await getPack(acc.id, meta); } catch (e) { if (SHELL() && NoemaShell.mounted) { document.body.classList.remove('noema-booting'); document.getElementById('noema-splash')?.remove(); NoemaShell.noEngine(errMsg(e)); return; } document.body.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '⚠️'), el('p', {}, errMsg(e)), el('button', { class: 'btn', onclick: () => Noema.switchTo(acc.id, null) }, tr('loader.chooseAnother')))); return; }
    const own = pack.subject.language || 'en';
    let contentLoc = packLocale(Object.keys(pack.translations || {}), own);   // docs/i18n.md §10
    if (contentLoc && !(await loadTranslation(acc.id, meta, pack, contentLoc))) contentLoc = null;   // its own file could not be had: the pack's own texts
    Noema.pack = pack; Noema.subject = Object.assign({ tutor: {}, hero: {}, features: {} }, localizedSubject({ ...pack.subject, contentLocales: Object.keys(pack.translations || {}) }), subjOverride(acc.id, pack.subject.id));
    if (contentLoc) Object.assign(Noema.subject, { language: contentLoc, sourceLanguage: own });   // the content (and the tutor's replies) in the learner's language
    Noema.subjectMeta = meta;   // where it comes from (origin: library, private, shared, public…), for the subject's ⋮
    try { window.NoemaSrcFiles?.wireActivities(acc.id, meta, pack); } catch (e) { console.warn('[activity files]', e); }   // h5p@1: each item reads its .h5p file from beside the pack (fetched early)
    Noema.node = stepOf(acc.id, meta, pack);   // a curriculum step? (made for it, or 📦 attached to it)
    window.COURSE = contentLoc ? translatedChapters(pack, contentLoc) : pack.chapters; window.SOURCES = pack.sources || { sources: [], chapters: {}, patches: {} };
    if (!background) document.title = `${Noema.subject.title} · ${CFG.appName}`;
    if (!SHELL() || !NoemaShell.mounted) document.documentElement.lang = Noema.subject.language || 'en';   // correct capitals, hyphenation and fonts for the subject's language (e.g. Greek without accents in CAPS); in the frame each route sets it
    if (background) Noema.backgroundEngine = true;
    if (Noema.subject.features?.math) await ensureMath();
    // start the engine
    // once per page: engine.js declares top-level constants, so a second copy would throw (a route that asks for the engine
    // while the subject's own engine is still loading waits for that one: Noema.ensureEngine)
    await (engineScript || (engineScript = (async () => {
      const inline = document.getElementById('noema-engine-src');
      if (inline) { const s = document.createElement('script'); s.textContent = inline.textContent; document.body.append(s); }
      else await loadScript((window.NOEMA_ENGINE_BASE || 'engine/') + 'engine.js');
    })().catch(e => { engineScript = null; throw e; })));   // a failed load may be tried again
    document.body.classList.remove('noema-booting');
    document.getElementById('noema-splash')?.remove();
    if (background) return;
    window.NoemaReact?.dayStart(acc.id);
    AutoBackup.start(acc.id).catch(caught('loader.autobackup'));
  }
  /** The frame asks for an engine when none is open (see openEngine). Resolves true once it is there. */
  Noema.ensureEngine = () => {
    if (window.NoemaShell?.engine) return Promise.resolve(true);
    if (engineScript) return engineScript.then(() => !!window.NoemaShell?.engine, () => false);   // the subject's engine is already on its way
    return engineBoot || (engineBoot = (async () => {
      const acc = Noema.account; if (!acc) return false;
      const subs = await subjectsFor(acc.id); if (!subs.length) return false;
      const last = window.NoemaShell?.recent?.()?.find?.(r => subs.some(s => s.id === r.subj));
      const meta = subs.find(s => s.id === last?.subj) || subs[0];
      await openEngine(acc, subs, meta, { background: true });
      return !!window.NoemaShell?.engine;
    })().catch(e => { console.warn('[noema] engine', e); return false; }).finally(() => { engineBoot = null; }));
  };
  Object.assign(APP, { countPack, embedWebPictures, exportPackage, getPack, inlineTranslations, langTag, loadCSS, loadScript, localizedSubject, storeTranslations, subjectsFor });

  /* ---- this account's subjects, as the frame's pages read them (an import or an accepted share drops the list) ---- */
  let subjCache = null;
  APP.subjects = async force => { if (!subjCache || force) subjCache = await subjectsFor(N.account?.id || KV.acc).catch(() => []); return subjCache; };
  APP.dropSubjects = () => { subjCache = null; };
  Object.assign(N, {
    subjectsFor, pickSubject, shelf, loadSubject, stepOf, importedPacks, importPackFile, exportPackage, langTag, localizedSubject,
    openShelf: (acc, opts) => openShelf(acc || N.account?.id || KV.acc, opts || {}),
    editSubject(s, o) { return editSubject(N.account.id, s, o); }, deleteSubject(s) { return deleteSubject(N.account.id, s); }, setHidden(id, h) { return setHidden(N.account.id, id, h); },
    getPackById: (acc, id) => getPack(acc, { id, origin: 'imported' }), inlineTranslations: (acc, pack) => inlineTranslations(acc, null, pack),
    bridgeTag: s => window.NoemaBridge?.tag(s) || null,
    async openSubjectPicker() { const s = await pickSubject(N.account.id, { closable: true }); if (s?.kind === 'language' && SHELL() && NoemaShell.mounted) return NoemaShell.go('#/lang/' + encodeURIComponent(s.courseId)); if (s && s.id !== N.subject?.id) N.switchTo(N.account.id, s.id, SHELL() ? '#/subject' : ''); else if (s && SHELL()) NoemaShell.go('#/subject'); },
  });
  N.boot.openEngine = openEngine;
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const TH = () => window.NoemaThemes;
  const N = () => window.Noema;
  const CU = () => window.NoemaCurriculum;
  const CM = () => window.NoemaCurMap;
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const settings = () => N().jget(`noema1:${acc()}:a:settings`, {}) || {};
  const uiPref = () => settings().lang;
  const XL = k => window.NoemaI18n ? NoemaI18n.t('engine.xapi.' + k, null, uiPref()) : k;
  const toast = (m, ms) => N().toast(m, ms);
  const jget = (k, d) => N().jget(k, d);
  const stateOf = sid => NoemaCore.learning.progressOf(acc(), sid);   // the learning log's fold (read only)
  const subjects = force => APP.subjects(force);
  const subjectId = () => N()?.subject?.id || null;
  const h = S.h;
  const svg = S.svg;
  const faceEl = S.faceEl;
  const ico = S.ico;
  const icoTxt = S.icoTxt;
  const pill = S.pill;
  const chev = S.chev;
  const tv = S.tv;
  const L = S.L;
  const fmtDate = S.fmtDate;
  const hint = S.hint;
  const modal = S.modal;
  const menuButton = S.menuButton;
  const fitRow = S.fitRow;
  const tipped = S.tipped;
  const go = S.go;
  const open = S.open;
  const page = S.page;
  const isLang = S.isLang;
  const onStudy = (...a) => APP.onStudy(...a);
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
      window.NoemaXAPI ? { label: XL('export'), sub: XL('exportSub'), icon: 'download', run: () => exportRecord(s, 'xapi') } : null,
      window.NoemaXAPI ? { label: XL('cmi5'), sub: XL('cmi5Sub'), icon: 'download', run: () => exportRecord(s, 'cmi5') } : null,
      hide ? { label: L(hidden ? 'subjShow' : 'subjHide'), icon: 'eye', run: () => { const l = new Set(settings().hiddenSubjects || []); hidden ? l.delete(s.id) : l.add(s.id); TH().putSettings({ hiddenSubjects: [...l] }); APP.dropSubjects(); refresh(); } } : null];
  }
  /** a subject's ⋮ › the learning record (xAPI, from the learning log) or the course package for an LMS (cmi5) — the same files
      as the subject's own ⋮ in the engine (NoemaXAPI.subjectRecord / subjectCmi5, engine/src/43_xapi.js, docs/INTERACTIVE_XAPI.md) */
  async function exportRecord(s, kind) {
    try {
      const p = await N().loadSubject(acc(), s.id), subj = { ...(p?.subject || {}), id: s.id, title: p?.subject?.title || s.title }, chapters = p?.chapters || [], site = N().config?.siteUrl;
      let name, blob;
      if (kind === 'cmi5') { const r = NoemaXAPI.subjectCmi5({ pack: subj, chapters, site }); name = r.name; blob = await NoemaXAPI.zip(r.files); }
      else {
        const { attempts, answers } = await NoemaCore.learning.xapi(s.id), r = NoemaXAPI.subjectRecord({ attempts, answers, pack: subj, chapters, accountId: acc(), site, now: Date.now() });
        if (!r) { toast(XL('none'), 3500); return; }
        name = r.name; blob = new Blob([JSON.stringify(r.file, null, 1)], { type: 'application/json' });
      }
      const u = URL.createObjectURL(blob), a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
      toast('⬇️ ' + name, 3000);   // i18n-ignore (a file name)
    } catch (e) { toast('⚠️ ' + (window.NoemaI18n ? NoemaI18n.err(e) : e.message), 4000); }
  }
  const subjectPct = s => { const st = stateOf(s.id); if (!st || !s.counts?.exercises) return 0; return Math.min(1, Object.values(st.res || {}).filter(r => r.ok > 0).length / s.counts.exercises); };
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.zip,.json,.noemapack', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; inp.remove(); if (!f) return; try { const s = await N().importPackFile(acc(), f); landedOpen(s); } catch (er) { toast(er.message, 4000); } } });
    document.body.append(inp); inp.click();
  }
  function landedOpen(s) { if (!s) return; APP.dropSubjects(); toast(L('onShelfNow', { title: s.title || s.id }), 5000); open(s.id); }

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
        groups.push(fold('c:' + c.id, [ico('map', 1), h('span', { class: 'ns-domt' }, CU().shownTitle(c)), pill(L('subjStations', { n: ids.length }), 1)],
          h('div', { class: 'ns-sstations' }, ...ids.map(id => subjBlock(byId.get(c.nodes[id].pack.id), 'c:' + c.id + '/' + id, CU().shownNode(c, id).title, CU().shownNode(c, id).chapters)))));
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

  /* ---------- 🕘 the conversations with the tutor, in every subject: a window in the middle of the screen, grouped by Roadmap and step ---------- */
  const emoBtn = (emo, label, run) => h('button', { class: 'ns-emobtn', type: 'button', title: label, 'aria-label': label, onclick: run }, emo);
  /** A window in the middle of the screen. build({ head, body, close }) */
  /** A window in the middle of the screen: focus moves into it, Tab stays inside, and closing gives focus back to what opened it. */
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
    if (st.length) { const { c, nid } = st[0]; return { g: 'c:' + c.id, gt: CU().shownTitle(c) || L('roadmap'), s: c.id + '/' + nid, st: CU().shownNode(c, nid)?.title || title }; }
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
              onblur: async () => { const v = inp.value.trim().slice(0, 80); if (v && v !== cvTitle(r)) { r.title = v; r.titleSource = 'user'; r = await C.put(acc(), r); S.engine?.convoChanged?.(r.id, { title: v }); /* put() gives it a newer updatedAt, or other devices keep the old title */ } inp.replaceWith(tl); tl.textContent = cvTitle(r); setTimeout(refocus); } });
              tl.replaceWith(inp); inp.focus(); inp.select(); }),
            emoBtn('⬇️', L('exportMd'), () => download(slug(cvTitle(r)) + '.md', cvMarkdown(r))),
            emoBtn('🗑️', L('del'), async e => { const b = e.currentTarget; if (!sure) { sure = true; b.textContent = '❓'; b.title = L('delAgain'); return; } await C.remove(acc(), r.id); S.engine?.convoChanged?.(r.id, null); listView(); })));
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
    try { sessionStorage.setItem('noema-device:openConvo', JSON.stringify({ acc: acc(), sid: r.subject.id, id: r.id })); } catch (e) { /* no sessionStorage here (blocked site data): the conversation simply does not reopen by itself */ }
    if (S.engine && r.subject.id === subjectId()) { S.engine.resumeConvo?.(); return; }
    N().switchTo(acc(), r.subject.id, '#/subject');
  }

  Object.assign(APP, { importFile, landedOpen, subjectPct });

  Object.assign(S, { convos, goConvo });   // the conversations' window (engine/engine.js, engine/search.js)
  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
