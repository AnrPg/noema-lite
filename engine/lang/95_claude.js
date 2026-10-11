/* ---------- P8 — Through Claude: ✨ new language courses, the task queue, refills (docs/LANGUAGES.md §7.4, §8, §10.1) ----------
   The tasks, their checks and merges are engine/langcore.js (P8 section) — the same code as the connector. Here: where an
   account course lives (record a:langcourse:<id> synced; content in IndexedDB + the private cloud storage langs/<id>.json,
   written by this app only), the three ways (the key on this device · the Claude app with the connector · copy / paste),
   the inbox the connector fills (a:langin:<id>:<seq>), the ✨ dialog, the #/claude page and the refill card. */
(() => {
  const LJ = N.LANGJOBS, K = LJ.KIND;
  const jparse = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
  const PRE = acc => `noema1:${acc}:a:langcourse:`;
  const kvSet = (k, v) => { const s = JSON.stringify(v); if (window.Noema?.kv) Noema.kv.set(k, s); else localStorage.setItem(k, s); };
  const getRec = (acc, cid) => jparse(localStorage.getItem(PRE(acc) + cid));
  const putRec = (acc, rec) => kvSet(PRE(acc) + rec.id, rec);
  function records(acc) {
    const p = PRE(acc), out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) { const r = jparse(localStorage.getItem(k)); if (r?.format === LJ.FORMAT) out.push(r); } }
    return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  }
  const cloudAcc = acc => { try { const s = window.NoemaCloud?.session?.(); return !!s && acc === 'u_' + s.user.id; } catch (e) { return false; } };
  const toast = (m, ms = 3000) => window.Noema?.toast ? Noema.toast(m, ms) : console.log(m);
  /** An error's words for the learner: its code's message in the UI language, else its (English) text (docs/i18n.md §6). */
  const errW = e => window.NoemaI18n ? NoemaI18n.err(e) : String((e && e.message) || e);
  /** A refused task's error: task.error keeps the English text (the connector, older apps), task.errorInfo { code, params } the learner's words. */
  const taskErr = t => t.errorInfo && t.errorInfo.code && window.NoemaI18n && NoemaI18n.has('err.' + t.errorInfo.code) ? NoemaI18n.err(t.errorInfo) : t.error;

  /* ---------- device + cloud storage of the content ---------- */
  const ownDb = { db: null, open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('noema-lite', 1); r.onupgradeneeded = () => { const d = r.result; ['packs', 'handles', 'restore', 'convos'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); } };
  const IDB = () => window.Noema?.idb || { get: (s, k) => ownDb.open().then(d => new Promise((res, rej) => { const r = d.transaction(s).objectStore(s).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })), put: (s, k, v) => ownDb.open().then(d => new Promise((res, rej) => { const t = d.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); })) };
  const devKey = (acc, kind, cid) => `${kind}|${acc}|${cid}`;   // never “<acc>|…”: those keys are the account's subject packs (loader importedPacks)
  const devGet = async k => { try { return await Promise.race([IDB().get('packs', k), new Promise(r => setTimeout(() => r(null), 4000))]); } catch (e) { return null; } };
  const devPut = async (k, v) => { try { await IDB().put('packs', k, v); } catch (e) { console.warn('[langjobs] device storage', e); } };
  const cloudGet = async path => { try { const r = await NoemaCloud.downloadObject(path); return await r.json(); } catch (e) { return null; } };
  const cloudPut = (path, obj) => NoemaCloud.uploadObject(path, new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'application/json');
  /** The content of an account course: the device copy, or the cloud copy when it is newer (another device merged more). */
  async function loadContent(acc, cid) {
    const rec = getRec(acc, cid); let d = await devGet(devKey(acc, 'langcourse', cid));
    if (cloudAcc(acc) && (!d || (rec && (d.rev || 0) < (rec.rev || 0)))) { const c = await cloudGet(`langs/${cid}.json`); if (c && (!d || (c.rev || 0) > (d.rev || 0))) { d = c; await devPut(devKey(acc, 'langcourse', cid), d); } }
    if (!d) throw new Error(LT(cloudAcc(acc) ? 'lang.claude.notHereCloud' : 'lang.claude.notHereSignIn'));
    return d;
  }
  async function saveContent(acc, rec, data) {
    await devPut(devKey(acc, 'langcourse', rec.id), data);
    if (cloudAcc(acc)) await cloudPut(`langs/${rec.id}.json`, data).catch(e => console.warn('[langjobs] upload', e));
    rec.rev = data.rev; putRec(acc, rec);
  }
  async function loadPatch(acc, cid) {
    let p = await devGet(devKey(acc, 'langpatch', cid));
    if (cloudAcc(acc)) { const c = await cloudGet(`langs/${cid}.patch.json`); if (c && (!p || (c.rev || 0) > (p.rev || 0))) { p = c; await devPut(devKey(acc, 'langpatch', cid), p); } }
    return p || N.langEmptyPatch(cid);
  }
  async function savePatch(acc, patch) { await devPut(devKey(acc, 'langpatch', patch.course), patch); if (cloudAcc(acc)) await cloudPut(`langs/${patch.course}.patch.json`, patch).catch(e => console.warn('[langjobs] upload', e)); }
  /** The built library courses (their language.json, typology and the common order, D13). */
  async function libraryData() {
    const out = [];
    for (const m of window.NOEMA_REGISTRY?.languages || []) {
      if (!(window.NOEMA_LANGPACKS || {})[m.id]) await new Promise(res => { const s = document.createElement('script'); s.src = m.path; s.onload = res; s.onerror = res; document.head.append(s); });
      if ((window.NOEMA_LANGPACKS || {})[m.id]) out.push(window.NOEMA_LANGPACKS[m.id]);
    }
    return out;
  }
  /** The content a task of this record works on: the account course, or a library course with the learner's patch. */
  async function contentFor(acc, rec) {
    if (rec.origin === 'account') return { data: await loadContent(acc, rec.id) };
    const lib = (await libraryData()).find(d => d.course.id === rec.id); if (!lib) throw new Error(LT('lang.claude.libMissing', { id: rec.id }));
    const patch = await loadPatch(acc, rec.id);
    return { data: N.langApplyPatch(JSON.parse(JSON.stringify(lib)), patch), patch };
  }

  /* ---------- §10.2 the learner's language packages: records a:langpack:<course>:<code> (synced keys, written by the connector),
     files langs/<course>.lang-<code>.json in the private storage, cached on the device by the record's time ---------- */
  const PKP = (acc, cid) => `noema1:${acc}:a:langpack:${cid}:`;
  function packRecords(acc, cid) {
    const p = PKP(acc, cid), out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) { const r = jparse(localStorage.getItem(k)); if (r?.code) out.push(r); } }
    return out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }
  const PACKS = {};   // acc|course → the packages laid over the open course (again after a merge rebuilds it)
  async function loadPack(acc, cid, r) {
    const k = devKey(acc, 'langpack', cid + ':' + r.code), c = await devGet(k);
    if (c?.pkg && c.at === r.at) return c.pkg;
    if (cloudAcc(acc)) { const p = await cloudGet(r.path || N.langPackPath(cid, r.code)); if (p?.code === r.code) { await devPut(k, { at: r.at, pkg: p }); return p; } }
    return c?.pkg || null;   // offline: the copy this device has
  }
  const applyPacks = (data, pk) => (pk || []).reduce((d, p) => { try { return N.langApplyPackage(d, p); } catch (e) { console.warn('[langpack]', e); return d; } }, data);
  /** The course with the learner's packages laid over it (a new object: the library pack stays as the website sent it). */
  async function withPackages(acc, cid, data) {
    const rs = packRecords(acc, cid);
    const pk = rs.length ? (await Promise.all(rs.map(r => loadPack(acc, cid, r).catch(() => null)))).filter(Boolean) : [];
    PACKS[acc + '|' + cid] = pk;
    return applyPacks(data, pk);
  }
  /** Remove a language a package added: the record (synced — every device drops it), the file, the device copy. */
  async function removePackage(acc, cid, code) {
    const key = PKP(acc, cid) + code;
    if (window.Noema?.kv?.del) Noema.kv.del(key); else localStorage.removeItem(key);
    await devPut(devKey(acc, 'langpack', cid + ':' + code), null);
    if (UI.acc === acc && UI.id === cid && UI.L) {   // the learner's choice of languages forgets it; adding it again makes it active again
      UI.prefs.addedSeen = (UI.prefs.addedSeen || []).filter(c => c !== code);
      UI.L.settings.languages = (UI.L.settings.languages || []).filter(c => c !== code); if (UI.prefs.lang === code) delete UI.prefs.lang;
      save(true);
    }
    if (cloudAcc(acc)) {
      await NoemaCloud.push(acc).catch(e => console.warn('[langpack] push', e));
      await NoemaCloud.deleteObjects('noema-private', [`${NoemaCloud.session().user.id}/${N.langPackPath(cid, code)}`]).catch(e => console.warn('[langpack] delete', e));
    }
  }
  /** A language a package added becomes active once for a learner who chose their languages before (called by start). */
  function activateAdded() {
    const added = Object.keys(UI.C?.data.course.added || {}); if (!added.length) return;
    const seen = UI.prefs.addedSeen || [], fresh = added.filter(c => !seen.includes(c)); if (!fresh.length) return;
    UI.L.settings.languages = [...new Set([...(UI.L.settings.languages || UI.C.languages), ...fresh])];
    UI.prefs.addedSeen = [...seen, ...fresh]; save();
  }
  /** ⋮ › the language › Remove this language (and the course settings): asks, removes, opens the course again without it. */
  async function removeAdded(code) {
    const a = UI.C?.data.course.added?.[code]; if (!a) return;
    if (!confirm(LT('lang.claude.removeAsk', { lang: a.name || info(code).name, title: UI.C.data.course.title }) + '\n\n' + LT('lang.claude.removeAskSub'))) return;
    await removePackage(UI.acc, UI.id, code);
    toast(LT('lang.claude.removed', { lang: a.name || info(code).name }), 2500);
    setTimeout(() => location.reload(), 300);
  }
  const addedPanel = () => {
    const added = UI.C.data.course.added || {}, codes = Object.keys(added); if (!codes.length) return null;
    return h('div', { class: 'lj-added' }, h('h3', { class: 'lx-h3' }, LT('lang.claude.addedTitle')),
      ...codes.map(c => h('div', { class: 'row lj-addedrow', 'data-lang': c }, h('span', {}, info(c).flag, ' ', h('b', {}, added[c].name || info(c).label), added[c].built ? h('span', { class: 'tiny' }, ' · ' + LT('lang.claude.made', { date: String(added[c].built).slice(0, 10) })) : null),
        h('button', { class: 'btn small ghost lj-remove', 'data-lang': c, onclick: () => removeAdded(c) }, LT('lang.frame.removeLang')))));
  };

  /* ---------- the course that is open: rebuilt after a merge ---------- */
  function refresh(acc, cid, data) {
    if (UI.acc !== acc || UI.id !== cid || !UI.C) return;
    UI.data = applyPacks(data, PACKS[acc + '|' + cid]); UI.C = buildCourse(UI.data); const prof = (window.NOEMA_LANGPROFILES || {})[cid]; if (prof) { UI.profMap = prof; N.addProfiles(UI.C, facadeProfMap(prof)); }   // D19: through the facade of the explanation locale
    UI.L = N.fromKV(UI.C, N.toKV(UI.C, UI.L));
    if (!document.querySelector('.lx-session')) render();
  }
  /** Apply one checked answer and store everything → the log line. */
  async function applyAndSave(acc, rec, ctx, task, ans) {
    const line = N.applyLangAnswer(rec, ctx.data, task, ans, { patch: ctx.patch || null });
    if (ctx.patch) { await savePatch(acc, ctx.patch); putRec(acc, rec); } else await saveContent(acc, rec, ctx.data);
    refresh(acc, rec.id, ctx.data);
    return line;
  }

  /* ---------- the three ways ---------- */
  /** ▶ With the Claude key on this device: one task (Claude repairs its answer when the check finds problems). */
  async function runTask(acc, cid, taskId, { onLog = () => { }, signal } = {}) {
    const rec = getRec(acc, cid), task = rec && N.langTaskById(rec, taskId); if (!task) throw new Error(LT('lang.claude.taskClosed'));
    const ctx = await contentFor(acc, rec), peers = task.kind === K.core ? await libraryData() : [];
    const sp = N.langTaskSpec(rec, ctx.data, task, { peers });
    onLog(`✨ ${sp.title}…`);
    const r = await NoemaLLM.json({ acc, provider: 'claude', name: 'answer', system: sp.system, prompt: sp.prompt, schema: sp.schema, maxTokens: 32000, signal, repairs: 2,
      validate: d => N.checkLangAnswer(rec, ctx.data, task, d, { peers }), onRepair: (errs) => onLog('↻ ' + LT('lang.claude.fixes', { n: errs.length })) });
    const line = await applyAndSave(acc, rec, ctx, task, r.data);
    onLog('✓ ' + line); return line;
  }
  /** ▶ The whole queue (🌙 a night with the device left open): one task after another until it is empty or stopped. */
  async function runQueue(acc, cid, { onLog = () => { }, signal, max = 999 } = {}) {
    let n = 0;
    for (; n < max; n++) {
      if (signal?.aborted) break;
      const t = N.langNext(getRec(acc, cid) || { tasks: [] }); if (!t || t.error) break;
      try { await runTask(acc, cid, t.id, { onLog, signal }); }
      catch (e) { onLog('⚠️ ' + t.id + ': ' + errW(e)); const rec = getRec(acc, cid), x = N.langTaskById(rec, t.id); if (x && !signal?.aborted) { x.status = 'refused'; x.error = String(e.message).slice(0, 300); x.errorInfo = e.code ? { code: e.code, params: e.params || {} } : null; putRec(acc, rec); } if (/key|credit|401|Stopped/i.test(e.message)) break; }
    }
    return n;
  }
  /** 📋 Without the connector: the task to copy, and the pasted answer. */
  async function copyTask(acc, cid, taskId) {
    const rec = getRec(acc, cid), task = N.langTaskById(rec, taskId); const ctx = await contentFor(acc, rec);
    return N.langTaskText(rec, ctx.data, task, { mode: 'paste', peers: task.kind === K.core ? await libraryData() : [] });
  }
  async function paste(acc, cid, taskId, text) {
    const rec = getRec(acc, cid), task = rec && N.langTaskById(rec, taskId); if (!task) return { errors: [LT('lang.claude.taskClosedCopy')] };
    let ans; try { ans = NoemaLLM.parseJSON(text); } catch (e) { return { errors: [LT('lang.claude.notJSON')] }; }
    const ctx = await contentFor(acc, rec), errs = N.checkLangAnswer(rec, ctx.data, task, ans, { peers: task.kind === K.core ? await libraryData() : [] });
    if (errs.length) return { errors: errs };
    return { ok: true, line: await applyAndSave(acc, rec, ctx, task, ans) };
  }
  /** 💬 The connector's answers: fetch the inbox, check each answer again, merge it, then empty the inbox. → how many were merged */
  let chain = Promise.resolve();
  /** One poll at a time: a second call waits for the running one, then looks again. */
  const poll = (acc, opts) => (chain = chain.catch(() => 0).then(() => poll1(acc, opts)));
  async function poll1(acc, { only = null } = {}) {
    const CL = window.NoemaCloud; if (!cloudAcc(acc) || !CL?.kvRows) return 0;
    let n = 0;
    try {
      const rows = (await CL.kvRows(LJ.IN)).filter(r => !only || r.key.startsWith(LJ.IN + only + ':')).sort((a, b) => a.key.localeCompare(b.key)); if (!rows.length) return 0;
      if (CL.pull) await CL.pull(acc).catch(() => { });   // the newest record (another device may have merged some of them)
      const ctxs = {}, done = [];
      for (const r of rows) {
        const cid = r.key.slice(LJ.IN.length).split(':')[0], e = jparse(r.value);
        const rec = getRec(acc, cid); if (!rec || !e) { if (!e || Date.now() - (Date.parse(r.updated_at) || 0) > 7 * 864e5) done.push(r.key); continue; }
        const task = N.langTaskById(rec, e.task);
        if (!task) { done.push(r.key); continue; }   // merged already (here or on another device)
        try {
          const ctx = ctxs[cid] = ctxs[cid] || await contentFor(acc, rec);
          const errs = N.checkLangAnswer(rec, ctx.data, task, e.data, { peers: task.kind === K.core ? await libraryData() : [] });
          if (errs.length) { console.warn('[langjobs] answer refused', errs); task.status = 'refused'; task.error = errs.slice(0, 5).join('; '); task.errorInfo = null; putRec(acc, rec); }
          else { await applyAndSave(acc, rec, ctx, task, e.data); n++; }
          done.push(r.key);
        } catch (x) { console.warn('[langjobs]', x); }
      }
      if (n) await CL.push(acc).catch(() => { });   // the records reach the cloud before their answers leave the inbox
      for (const k of done) await CL.kvDelete(k).catch(() => { });
      if (n) toast('✨ ' + LT('lang.claude.merged', { n }), 3500);
    } catch (x) { console.warn('[langjobs] poll', x); }
    return n;
  }
  let timer = null;
  function startPolling(acc) {
    clearTimeout(timer);
    const loop = async () => { if (document.visibilityState === 'visible' && records(acc).some(r => N.langWork(r).queued.length || N.langWork(r).claimed.length)) await poll(acc).catch(() => { }); timer = setTimeout(loop, 20000); };
    timer = setTimeout(loop, 1500);
  }

  /* ---------- for the loader: an account course to open, a library course with the learner's patch ---------- */
  async function loadCourse(acc, cid) { await poll(acc, { only: cid }).catch(() => { }); return withPackages(acc, cid, await loadContent(acc, cid)); }
  async function withPatch(acc, cid, data) {
    data = await withPackages(acc, cid, data);   // the learner's language packages first (§10.2), then the refills
    const rec = getRec(acc, cid); if (!rec || rec.origin !== 'library') return data;   // no refills yet: the course as built
    await poll(acc, { only: cid }).catch(() => { });
    return N.langApplyPatch(data, await loadPatch(acc, cid));
  }
  /** ✨ Create an account course → {record, data} (stored on the device and in the cloud). */
  async function create(acc, opts) {
    const { record, data } = N.langNewCourse({ ...opts, library: await libraryData() });
    await saveContent(acc, record, data);
    if (cloudAcc(acc)) await window.NoemaCloud?.push?.(acc).catch(() => { });
    return { record, data };
  }
  /** ✨ Ask Claude for more sentences with what I know (§7.4) → the queued task. */
  function queueRefill(acc, C, L, code, fid) {
    let rec = getRec(acc, C.id) || N.langLibraryRecord(C);
    const t = N.langQueue(rec, K.refill, N.langRefillRequest(C, L, code, fid)); putRec(acc, rec); return t;
  }

  /* ---------- small UI helpers ---------- */
  const LANGS = ['ar', 'he', 'zh', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'tr', 'ja', 'ko', 'el', 'en', 'hi', 'fa', 'nl', 'pl', 'sw', 'vi'];
  const EXPLAIN = [['en', 'English'], ['el', 'Ελληνικά'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['ru', 'Русский'], ['tr', 'Türkçe']];   // i18n-ignore (endonyms)
  const copy = async (t, btn) => { try { await navigator.clipboard.writeText(t); if (btn) { const o = btn.textContent; btn.textContent = '✓ ' + LT('lang.claude.copied'); setTimeout(() => btn.textContent = o, 1600); } } catch (e) { } };
  const hasKey = acc => !!window.NoemaClaude?.Key?.get(acc);
  const STATUS_SIGN = { queued: '⏳', done: '✅', refused: '⚠️' };
  const STATUS = new Proxy({}, { get: (o, s) => typeof s === 'string' && STATUS_SIGN[s] ? STATUS_SIGN[s] + ' ' + LT('lang.claude.status.' + s) : undefined });   // lang.claude.status.<status>
  const KIND_SIGN = { [K.core]: ['🧱', 'core'], [K.node]: ['📖', 'node'], [K.function]: ['🧩', 'function'], [K.compare]: ['⇄', 'compare'], [K.refill]: ['✨', 'refill'] };
  const kindLabel = new Proxy({}, { get: (o, k) => typeof k === 'string' && KIND_SIGN[k] ? KIND_SIGN[k][0] + ' ' + LT('lang.claude.kind.' + KIND_SIGN[k][1]) : undefined });   // lang.claude.kind.<kind>
  function overlay(build) {
    const o = h('div', { class: 'noema-overlay lj-ov', role: 'dialog', 'aria-modal': 'true' }), box = h('div', { class: 'noema-ovbox lj-box' }); o.append(box);
    const close = () => { o.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    o.addEventListener('click', e => { if (e.target === o) close(); }); document.addEventListener('keydown', esc);
    build(box, close); document.body.append(o); setTimeout(() => box.querySelector('input,button')?.focus(), 30); return close;
  }
  function textBox(text) { return h('textarea', { class: 'lj-text', readonly: true, rows: 8, 'aria-label': LT('lang.claude.textToCopy') }, text); }

  /* ---------- ✨ New language course (from the subject picker's 🌍 Languages overlay) ---------- */
  function newCourse(acc, { onCreated = () => { } } = {}) {
    overlay((box, close) => {
      const chosen = new Set(), depth = {};
      const title = h('input', { class: 'noema-input lj-in', placeholder: LT('lang.claude.titlePh'), 'aria-label': LT('lang.claude.titleLabel') });
      const more = h('input', { class: 'noema-input lj-in', placeholder: LT('lang.claude.morePh'), 'aria-label': LT('lang.claude.moreLabel') });
      const known = h('input', { class: 'noema-input lj-in', placeholder: LT('lang.claude.knownPh'), 'aria-label': LT('lang.claude.knownLabel') });
      const explain = h('select', { class: 'noema-input lj-in', 'aria-label': LT('lang.claude.explainLabel') }, ...EXPLAIN.map(([v, t]) => h('option', { value: v }, t)));
      const depths = h('div', { class: 'lj-depths' });
      const langsNow = () => [...chosen, ...more.value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[a-z]{2,3}$/.test(x))].filter((x, i, a) => a.indexOf(x) === i);
      const drawDepth = () => { depths.innerHTML = ''; for (const c of langsNow()) depths.append(h('label', { class: 'lj-depth' }, info(c).flag, ' ', info(c).label, ' ', h('select', { 'aria-label': LT('lang.claude.depthOf', { code: c }), 'data-lang': c, onchange: e => { depth[c] = +e.target.value; } }, ...[[3, LT('lang.claude.depth3')], [2, LT('lang.claude.depth2')], [1, LT('lang.claude.depth1')]].map(([v, t]) => h('option', { value: v, selected: (depth[c] || 3) === v ? '' : null }, t))))); };
      more.addEventListener('input', drawDepth);
      const chips = h('div', { class: 'lj-chips' }, ...LANGS.map(c => h('button', { class: 'chip lj-lang', type: 'button', 'data-lang': c, 'aria-pressed': 'false', onclick: e => { const b = e.currentTarget; if (chosen.has(c)) chosen.delete(c); else chosen.add(c); b.setAttribute('aria-pressed', chosen.has(c) ? 'true' : 'false'); b.classList.toggle('on', chosen.has(c)); drawDepth(); } }, info(c).flag, ' ', info(c).label)));
      let way = 'claudeapp';
      const ways = h('div', { class: 'cg-choices lj-ways', role: 'radiogroup', 'aria-label': LT('lang.claude.whoWrites') }, ...[
        ['claudeapp', '💬 ' + LT('lang.claude.wayApp'), LT('lang.claude.wayAppSub')],
        ['claude', '▶ ' + LT('lang.claude.wayKey'), LT(hasKey(acc) ? 'lang.claude.wayKeySub' : 'lang.claude.wayKeyNeeds')],
        ['cowork', '🧑‍💻 ' + LT('lang.claude.wayCowork'), LT('lang.claude.wayCoworkSub')],
      ].map(([v, t, d]) => h('button', { class: 'cg-choice lj-way' + (v === way ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': v === way ? 'true' : 'false', 'data-way': v, disabled: v === 'claude' && !hasKey(acc) ? '' : null, onclick: e => { way = v; ways.querySelectorAll('.lj-way').forEach(b => { const on = b.dataset.way === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); } }, h('b', {}, t), h('span', { class: 'tiny' }, d))));
      const msg = h('div', { class: 'lj-msg', role: 'status' });
      const go1 = h('button', { class: 'btn primary lj-create', type: 'button', onclick: async () => {
        const langs = langsNow(), opts = { title: title.value.trim(), languages: langs, explainLang: explain.value || 'en', depth: Object.fromEntries(langs.map(c => [c, depth[c] || 3])), knownLanguages: known.value.split(/[\s,;]+/).filter(Boolean), provider: way };
        if (!opts.title) { msg.textContent = '⚠️ ' + LT('lang.claude.needTitle'); title.focus(); return; }
        if (!langs.length) { msg.textContent = '⚠️ ' + LT('lang.claude.needLang'); return; }
        if (way === 'cowork') { box.innerHTML = ''; box.append(h('h2', {}, '🧑‍💻 ' + LT('lang.claude.coworkTitle')), h('p', {}, LT('lang.claude.coworkHow')), textBox(coworkBrief(opts)), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: e => copy(coworkBrief(opts), e.currentTarget) }, '📋 ' + LT('lang.claude.copy')), h('button', { class: 'btn ghost', onclick: close }, LT('lang.tutor.close')))); return; }
        go1.disabled = true; msg.textContent = '⏳ ' + LT('lang.claude.creating');
        try {
          const { record } = await create(acc, opts);
          if (way === 'claude') {
            msg.textContent = '✨ ' + LT('lang.claude.writingCore');
            try { await runTask(acc, record.id, 'core', { onLog: t => { msg.textContent = t; } }); } catch (e) { msg.textContent = '⚠️ ' + LT('lang.claude.staysQueued', { err: errW(e) }); }
            close(); onCreated(record); return;
          }
          box.innerHTML = '';
          box.append(h('h2', {}, '✨ ' + LT('lang.claude.waiting', { title: record.title })), h('p', {}, LT('lang.claude.waitingHow')),
            textBox(N.langMessage(record)), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: e => copy(N.langMessage(record), e.currentTarget) }, '📋 ' + LT('lang.claude.copyMsg')), h('button', { class: 'btn primary', onclick: () => { close(); onCreated(record); } }, LT('lang.claude.openCourse'))));
        } catch (e) { go1.disabled = false; msg.textContent = '⚠️ ' + errW(e); }
      } }, '✨ ' + LT('lang.claude.create'));
      box.append(h('h2', {}, '✨ ' + LT('lang.claude.newTitle')), h('p', { class: 'tiny' }, LT('lang.claude.newSub')),
        h('label', { class: 'lj-field' }, h('b', {}, LT('lang.claude.titleLabel')), title),
        h('div', { class: 'lj-field' }, h('b', {}, LT('lang.shell.languages')), chips, more),
        h('label', { class: 'lj-field' }, h('b', {}, LT('lang.claude.explainIn')), explain),
        h('div', { class: 'lj-field' }, h('b', {}, LT('lang.claude.depthPer')), depths),
        h('label', { class: 'lj-field' }, h('b', {}, LT('lang.set.knowAlready')), known),
        h('div', { class: 'lj-field' }, h('b', {}, LT('lang.claude.whoWrites')), ways),
        msg, h('div', { class: 'row' }, go1, h('button', { class: 'btn ghost', type: 'button', onclick: close }, LT('lang.claude.cancel'))));
      drawDepth();
    });
  }
  const coworkBrief = o => `Create a new language course for the shared library of noema-lite: “${o.title}” — languages ${o.languages.join(', ')}, explanations in ${o.explainLang}, depth ${Object.entries(o.depth).map(([k, v]) => k + ' ' + v).join(', ')}, known languages ${o.knownLanguages.join(', ') || '—'}.\nRead docs/LANGUAGE_RULES.md first (binding), then docs/LANGUAGES.md §4, §10 and §11. A language without a catalogue starts with its typological profile and its catalogue of phenomena (library/languages/_phenomena/<code>.json) and its wordFeatures. Place every node on the common order of all the courses (D13). Write it in library/languages/<id>/, ground every form (tools/lang_refcheck.py), and leave python3 tools/validate_lang.py <dir> --strict, tools/lang_phenomena.py and python3 tools/build.py clean.`;   // i18n-ignore (a brief for Claude Code: stays English)

  /* ---------- #/claude — the course's task queue ---------- */
  const busy = { ctl: null };
  VIEWS.claude = (v) => {
    const acc = UI.acc, C = UI.C, rec = getRec(acc, C.id);
    const account = !!C.data.course.account;
    v.append(h('div', { class: 'lx-back' }, h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '← ' + LT('lang.claude.theCourse'))),
      h('h1', { class: 'lj-h1' }, '✨ ' + LT('lang.view.claude')), h('p', { class: 'lx-sub' }, LT(account ? 'lang.claude.subAccount' : 'lang.claude.subLibrary')));
    if (!rec) { v.append(h('p', { class: 'lx-note' }, LT('lang.claude.nothingQueued'))); return; }
    const data = C.data, nd = account ? N.langNeeds(rec, data) : null, w = N.langWork(rec);
    const log = h('div', { class: 'lj-log', role: 'log', 'aria-live': 'polite' });
    const say = t => { log.prepend(h('div', {}, t)); };
    const queueBtns = account ? h('div', { class: 'row lj-queue' },
      nd.core ? null : h('button', { class: 'btn small', disabled: nd.nodes.length ? null : '', onclick: () => { const r = getRec(acc, C.id); const per = {}; for (const x of nd.nodes) if (!per[x.lang]) per[x.lang] = x; Object.values(per).forEach(x => N.langQueue(r, K.node, x)); putRec(acc, r); render(); } }, '🧱 ' + LT('lang.claude.queueNext')),
      nd.core ? null : h('button', { class: 'btn small lj-night', disabled: nd.nodes.length || nd.functions.length ? null : '', onclick: () => { const r = getRec(acc, C.id); const n = N.langQueueNight(r, data); putRec(acc, r); toast('🌙 ' + LT('lang.claude.nightQueued', { n })); render(); } }, '🌙 ' + LT('lang.claude.queueAll', { n: nd.nodes.length + nd.functions.length })),
      nd.core ? null : h('button', { class: 'btn small', disabled: nd.compare.length ? null : '', onclick: () => { const r = getRec(acc, C.id); nd.compare.forEach(fn => N.langQueue(r, K.compare, { fn })); putRec(acc, r); render(); } }, '⇄ ' + LT('lang.claude.queueCmp', { n: nd.compare.length }))) : null;
    const runAll = hasKey(acc) && w.queued.length ? h('button', { class: 'btn primary lj-runall', onclick: async e => {
      if (busy.ctl) { busy.ctl.abort(); return; }
      busy.ctl = new AbortController(); e.currentTarget.textContent = '■ ' + LT('lang.sess.stop');
      try { await runQueue(acc, C.id, { onLog: say, signal: busy.ctl.signal }); } finally { busy.ctl = null; render(); }
    } }, '▶ ' + LT('lang.claude.runAll', { n: w.queued.length })) : null;
    v.append(h('div', { class: 'lx-card lj-ways2' },
      h('div', { class: 'lj-stats' }, h('span', { class: 'lx-badge' }, LT('lang.claude.nQueued', { n: w.queued.length })), w.claimed.length ? h('span', { class: 'lx-badge ctx' }, LT('lang.claude.nClaimed', { n: w.claimed.length })) : null, h('span', { class: 'lx-badge reg' }, LT('lang.claude.nDone', { n: w.done })), w.refused ? h('span', { class: 'lx-badge new' }, LT('lang.claude.nRefused', { n: w.refused })) : null),
      queueBtns,
      h('div', { class: 'row' }, runAll,
        w.queued.length ? h('button', { class: 'btn small lj-msgbtn', onclick: e => copy(N.langMessage(getRec(acc, C.id), { count: Math.min(5, w.queued.length) }), e.currentTarget) }, '💬 ' + LT('lang.claude.copyForApp')) : null,
        cloudAcc(acc) ? h('button', { class: 'btn small lj-poll', onclick: async () => { const n = await poll(acc); say(n ? '✓ ' + LT('lang.claude.nMerged', { n }) : LT('lang.claude.noAnswers')); if (n) render(); } }, '🔄 ' + LT('lang.claude.fetch')) : null,
        account ? h('button', { class: 'btn small ghost', onclick: () => { const blob = new Blob([JSON.stringify(C.data)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `course-${C.id}.json` }); document.body.append(a); a.click(); a.remove(); } }, '⬇️ ' + LT('lang.claude.courseFile')) : null),
      !hasKey(acc) ? h('p', { class: 'tiny' }, '▶ ' + LT('lang.claude.withKey')) : null,
      log));
    const open = N.langOpenTasks(rec), past = (rec.tasks || []).filter(t => t.status !== 'queued').slice(-12).reverse();
    v.append(h('h2', { class: 'lx-h2' }, LT('lang.claude.queue')), open.length ? h('div', { class: 'lj-tasks' }, ...open.map(t => taskRow(acc, C, t, say))) : h('p', { class: 'tiny' }, account && !nd.core && !nd.nodes.length ? '🎉 ' + LT('lang.claude.allWritten') : LT('lang.claude.nothingInQueue')));
    if (past.length) v.append(h('details', { class: 'lx-sec' }, h('summary', {}, LT('lang.claude.past') + ' ', h('span', { class: 'tiny' }, LNUM(past.length))), h('ul', { class: 'lx-list' }, ...past.map(t => h('li', { 'data-task': t.id }, STATUS[t.status] || t.status, ' ', h('code', {}, t.id), t.error ? h('div', { class: 'tiny' }, taskErr(t)) : null)))));
    if ((rec.log || []).length) v.append(h('details', { class: 'lx-sec' }, h('summary', {}, LT('lang.claude.wrote')), h('ul', { class: 'lx-list' }, ...rec.log.slice(-15).reverse().map(l => h('li', {}, window.NoemaI18n ? NoemaI18n.fmt.date(l.t, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }) : new Date(l.t).toLocaleString(), ' — ', l.k && window.NoemaI18n ? '✓ ' + NoemaI18n.t(l.k, l.p) : l.m)))));   // l.m: English (the connector, older entries); l.k, l.p: the learner's words
  };
  function taskRow(acc, C, t, say) {
    const row = h('div', { class: 'lx-card lj-task', 'data-task': t.id },
      h('div', { class: 'lj-taskhead' }, h('b', {}, kindLabel[t.kind] || t.kind), ' ', h('code', {}, t.id), t.night ? h('span', { class: 'lx-badge' }, '🌙') : null, t.claimedAt ? h('span', { class: 'lx-badge ctx' }, '✍️ ' + LT('lang.claude.claimedByRun')) : null),
      h('div', { class: 'row' },
        hasKey(acc) ? h('button', { class: 'btn small primary lj-run', onclick: async e => { e.currentTarget.disabled = true; try { await runTask(acc, C.id, t.id, { onLog: say }); } catch (x) { say('⚠️ ' + errW(x)); } render(); } }, '▶ ' + LT('lang.claude.writeNow')) : null,
        h('button', { class: 'btn small lj-copy', onclick: async e => copy(await copyTask(acc, C.id, t.id), e.currentTarget) }, '📋 ' + LT('lang.claude.copyTask')),
        h('button', { class: 'btn small lj-paste', onclick: () => pasteBox(acc, C, t, row) }, '📥 ' + LT('lang.claude.pasteAnswer'))));
    return row;
  }
  function pasteBox(acc, C, t, row) {
    row.querySelector('.lj-pastebox')?.remove();
    const ta = h('textarea', { class: 'lj-text lj-answer', rows: 8, placeholder: LT('lang.claude.pastePh'), 'aria-label': LT('lang.claude.answerLabel') }), out = h('div', { class: 'lj-errs', role: 'status' });
    const box = h('div', { class: 'lj-pastebox' }, ta, h('div', { class: 'row' }, h('button', { class: 'btn small primary lj-check', onclick: async () => {
      const r = await paste(acc, C.id, t.id, ta.value);
      if (r.errors) { out.innerHTML = ''; out.append(h('b', {}, '❌ ' + LT('lang.claude.problems', { n: r.errors.length })), h('ul', { class: 'lx-list' }, ...r.errors.slice(0, 30).map(e => h('li', {}, e)))); return; }
      toast('✓ ' + r.line); render();
    } }, '✓ ' + LT('lang.claude.checkAdd'))), out);
    row.append(box); ta.focus();
  }

  /* ---------- hooks: the home of a course made through Claude, the refill card on a grammar page ---------- */
  const home0 = VIEWS.home;
  VIEWS.home = (v, r) => {
    const rec = getRec(UI.acc, UI.id);
    if (UI.C.data.course.account && !UI.C.data.nodes.length) return VIEWS.claude(v, r);   // nothing to learn before the core is written
    home0(v, r);
    if (rec) { const w = N.langWork(rec); v.prepend(h('div', { class: 'row lj-homebar' }, h('button', { class: 'btn small ghost lj-open', onclick: () => go('#/claude') }, '✨ ' + (w.queued.length + w.claimed.length ? LT('lang.claude.homeWaiting', { n: w.queued.length + w.claimed.length }) : LT('lang.view.claude'))))); }
    else if (UI.C.data.course.account) v.prepend(h('div', { class: 'row lj-homebar' }, h('button', { class: 'btn small ghost lj-open', onclick: () => go('#/claude') }, '✨ ' + LT('lang.view.claude'))));
  };
  const fn0 = VIEWS.fn;
  VIEWS.fn = (v, r) => {
    fn0(v, r);
    const fid = r.arg, c = r.arg2 && UI.C.lang[r.arg2] ? r.arg2 : UI.lang; if (!UI.C.functions[fid] || !LX(c).grammar[fid] || UI.C.functions[fid].category === 'overview') return;
    if ((UI.C.data.course.added || {})[c]) return;   // a language added by a package: no refills for it yet (§10.2)
    const cmp = (UI.C.data.compare || {})[fid];
    if (cmp) {
      const head = h('thead', {}, h('tr', {}, h('th', {}, ''), ...UI.C.languages.map(x => h('th', {}, info(x).flag, ' ', info(x).label))));
      const body = h('tbody', {}, ...cmp.rows.map(row => h('tr', {}, h('th', {}, row.aspect), ...UI.C.languages.map(x => h('td', { lang: x, dir: LX(x).language.dir || 'ltr' }, row.cells[x] ? wordsIn(x, row.cells[x]) : '—')))));
      v.append(h('div', { class: 'lx-card lj-cmp' }, h('h3', {}, '⇄ ', LT('lang.claude.acrossLangs', { title: UI.C.functions[fid].title })), h('div', { class: 'lx-compare' }, h('table', {}, head, body))));
    }
    const f = N.feasibility(UI.C, UI.L, c, fid), rec = getRec(UI.acc, UI.id), open = rec && (rec.tasks || []).find(t => t.kind === K.refill && t.fn === fid && t.lang === c && t.status === 'queued');
    const lockedBy = f.unlockBy.slice(0, 2).map(n => UI.C.nodes[n]?.title || n);
    const light = { ready: () => '🟢 ' + LT('lang.feas.ready'), thin: () => '🟡 ' + LT('lang.claude.thinN', { n: f.sentences }), locked: () => '🔒 ' + (lockedBy.length ? LT('lang.feas.needsNode', { node: LLIST(lockedBy) }) : LT('lang.feas.needsWords')), absent: () => '—' }[f.state]?.();
    v.append(h('div', { class: 'lx-card lj-refill', 'data-state': f.state },
      h('div', {}, h('b', {}, LT('lang.claude.withYourWords') + ' '), light, h('span', { class: 'tiny' }, ' · ' + LT('lang.claude.usable', { n: f.sentences }))),
      open ? h('p', { class: 'tiny lj-queued' }, '⏳ ' + LT('lang.claude.askedAlready', { id: open.id })) : null,
      f.state === 'absent' ? null : h('div', { class: 'row' }, h('button', { class: 'btn small ai lj-askmore', onclick: () => {
        const t = queueRefill(UI.acc, UI.C, UI.L, c, fid);
        toast('✨ ' + LT('lang.claude.asked', { id: t.id })); go('#/claude');
      } }, '✨ ' + LT(f.state === 'ready' ? 'lang.claude.askEvenMore' : 'lang.claude.askMore')))));
  };

  // the course settings: the languages added through Claude, each with Remove (§10.2)
  const settings0 = VIEWS.settings;
  VIEWS.settings = (v, r) => { settings0(v, r); const p = addedPanel(); if (p) { const tail = [...v.children].reverse().find(x => x.tagName === 'P'); tail ? tail.before(p) : v.append(p); } };

  Object.assign(window.NoemaLangUI, { newCourse, claude: { records, getRec, putRec, loadCourse, withPatch, loadContent, saveContent, loadPatch, create, runTask, runQueue, copyTask, paste, poll, startPolling, queueRefill, libraryData,
    packRecords, withPackages, removePackage, removeAdded, activateAdded } });
  addEventListener('noema:remote', e => { if (UI.C && e.detail?.acc === UI.acc && (e.detail.keys || []).some(k => k.includes(':a:langcourse:' + UI.id)) && UI.view === 'claude') render(); });
})();
