/* =====================================================================================
   noema-lite — loader
   Subject-agnostic bootstrap: accounts/profiles, subject picker, pack loading,
   namespaced storage (per account × subject), backups/restore points, cloud hook.
   The study engine (engine.js) is only started after a subject pack is in memory.
   ===================================================================================== */
(function () {
  'use strict';
  const CFG = Object.assign({ appName: 'noema-lite', supabaseUrl: '', supabaseKey: '', autoBackupMinutes: 5, askSubjectOnStart: true }, window.NOEMA_CONFIG || {});
  const LOCAL = window.NOEMA_CONFIG_LOCAL || {};            // config.local.js — never committed (e.g. a default Gemini key)
  const REG = window.NOEMA_REGISTRY || { groups: [], subjects: [], accounts: [] };
  const P = 'noema1:';
  const VERSION = '1.0.0';

  /* ---------------- DOM guard: optional UI parts are written as `cond ? node : null`; never render them as the text "null" ---------------- */
  for (const proto of [Element.prototype, DocumentFragment.prototype]) for (const fn of ['append', 'prepend', 'before', 'after', 'replaceWith']) {
    const orig = proto[fn]; if (!orig || orig.__noemaGuard) continue;
    const guarded = function (...xs) { return orig.apply(this, xs.filter(x => x != null && x !== false)); };
    guarded.__noemaGuard = true; proto[fn] = guarded;
  }

  /* ---------------- tiny utils ---------------- */
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { console.warn('[Noema] storage write failed', k, e); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
    keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k); } } catch (e) { } return out; },
  };
  const jget = (k, d) => { try { const v = ls.get(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => ls.set(k, JSON.stringify(v));
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  const toastL = (m, ms = 2400) => { if (window.toast) return window.toast(m, ms); let t = document.querySelector('.toasts'); if (!t) { t = el('div', { class: 'toasts' }); document.body.append(t); } const x = el('div', { class: 'toast' }, m); t.append(x); setTimeout(() => x.remove(), ms); };
  async function sha256(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; } }

  /* ---------------- IndexedDB (imported packs, folder handles, restore points) ---------------- */
  const IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
        const r = indexedDB.open('noema-lite', 1);
        r.onupgradeneeded = () => { const d = r.result; ['packs', 'handles', 'restore', 'convos'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
        r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error);
      });
    },
    async tx(store, mode, fn) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); let out; Promise.resolve(fn(s)).then(v => out = v); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); },
    get(store, key) { return this.open().then(d => new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
    put(store, key, val) { return this.open().then(d => new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); })); },
    del(store, key) { return this.open().then(d => new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); })); },
    entries(store, prefix = '') { return this.open().then(d => new Promise((res, rej) => { const out = []; const r = d.transaction(store).objectStore(store).openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return res(out); if (String(c.key).startsWith(prefix)) out.push([c.key, c.value]); c.continue(); }; r.onerror = () => rej(r.error); })); },
  };

  /* ---------------- accounts ---------------- */
  function localAccounts() {
    const removed = new Set(jget(P + 'accounts:removed', []));
    const map = new Map();
    (REG.accounts || []).forEach(a => map.set(a.id, { ...a, kind: 'local', seed: true }));
    jget(P + 'accounts', []).forEach(a => map.set(a.id, { ...(map.get(a.id) || {}), ...a, kind: 'local' }));
    return [...map.values()].filter(a => !removed.has(a.id));
  }
  function cloudAccount() {
    const s = window.NoemaCloud && NoemaCloud.session();
    return s ? { id: 'u_' + s.user.id, kind: 'cloud', email: s.user.email, name: jget(P + 'u_' + s.user.id + ':a:profile', {}).name || (s.user.user_metadata?.name) || s.user.email.split('@')[0], emoji: jget(P + 'u_' + s.user.id + ':a:profile', {}).emoji || '☁️' } : null;
  }
  function allAccounts() { const c = cloudAccount(); return [...(c ? [c] : []), ...localAccounts()]; }
  function getAccount(id) { return allAccounts().find(a => a.id === id) || null; }
  function saveLocalAccount(a) { const list = jget(P + 'accounts', []).filter(x => x.id !== a.id); list.push({ id: a.id, name: a.name, emoji: a.emoji, pin: a.pin || null, created: a.created || Date.now(), learner: a.learner || '' }); jset(P + 'accounts', list); const rm = jget(P + 'accounts:removed', []).filter(x => x !== a.id); jset(P + 'accounts:removed', rm); }

  /* ---------------- namespaced key/value store (+ mtimes for sync, dirty flag for backups) ---------------- */
  const KV = {
    acc: null, subj: null, listeners: [],
    accountKey(name, acc = this.acc) { return `${P}${acc}:a:${name}`; },
    subjectKey(name, subj = this.subj, acc = this.acc) { return `${P}${acc}:s:${subj}:${name}`; },
    get(key) { return ls.get(key); },
    set(key, val, { silent = false } = {}) {
      if (ls.get(key) === val) return true;
      const ok = ls.set(key, val);
      if (ok && !silent) this.touch(key);
      return ok;
    },
    del(key) { if (ls.get(key) == null) return; ls.del(key); this.touch(key); },
    touch(key) {
      const acc = key.slice(P.length).split(':')[0];
      const mk = `${P}${acc}:meta:mtime`; const m = jget(mk, {}); m[key.slice((P + acc + ':').length)] = Date.now(); jset(mk, m);
      jset(`${P}${acc}:meta:dirty`, Date.now());
      this.listeners.forEach(f => { try { f(key, acc); } catch (e) { } });
    },
    accountData(acc) {   // every data key of an account, keyed by suffix (without "noema1:<acc>:")
      const pre = `${P}${acc}:`; const out = {};
      ls.keys(pre).forEach(k => { const suf = k.slice(pre.length); if (!suf.startsWith('meta:')) out[suf] = ls.get(k); });
      return out;
    },
  };

  /* ---------------- the Gemini key: on THIS device only, like the Claude key (engine/claude.js Key) ----------------
     Never in a:settings, so never synced and never in a backup without secrets. Older versions kept it in a:settings
     (synced) → migrate() moves it here once and rewrites a:settings without it, which also clears the cloud row. */
  const GeminiKey = {
    k: acc => 'noema-device:geminiKey:' + acc,
    get(acc = KV.acc) { return ls.get(this.k(acc)) || ''; },
    set(acc, key) { key = String(key || '').trim(); if (key && key !== (LOCAL.geminiKey || window.DEFAULT_GEMINI_KEY)) ls.set(this.k(acc), key); else ls.del(this.k(acc)); },
    migrate(acc = KV.acc) {
      const sk = KV.accountKey('settings', acc); const s = jget(sk, null);
      if (!s || typeof s !== 'object' || !('apiKey' in s)) return;
      if (s.apiKey && !this.get(acc)) this.set(acc, s.apiKey);
      delete s.apiKey; KV.set(sk, JSON.stringify(s));
    },
  };

  /* ---------------- LEGACY: data written before the app was renamed noema-lite ----------------
     The ONLY place where the old names appear. Data is copied (never deleted) on first start. */
  const LEGACY = { kvPrefix: 'lq1:', idbName: 'learning-quest', backupFormats: ['learning-quest-backup'], packFormats: ['lq-pack'], schema: 'lq.conversation/v1' };
  function migrateOldPrefix() {
    if (ls.get(P + 'migrated:prefix')) return;
    const old = ls.keys(LEGACY.kvPrefix);
    if (old.length && !ls.keys(P).length) old.forEach(k => ls.set(P + k.slice(LEGACY.kvPrefix.length), ls.get(k)));
    ls.set(P + 'migrated:prefix', JSON.stringify({ at: Date.now(), keys: old.length }));
  }
  async function migrateOldIDB() {
    if (ls.get(P + 'migrated:idb') || !window.indexedDB) return;
    const oldDb = await new Promise(res => { let created = false; const r = indexedDB.open(LEGACY.idbName); r.onupgradeneeded = () => { created = true; r.transaction.abort(); }; r.onsuccess = () => res(created ? null : r.result); r.onerror = () => res(null); r.onblocked = () => res(null); });
    if (oldDb) {
      for (const store of ['packs', 'handles', 'restore', 'convos']) {
        if (!oldDb.objectStoreNames.contains(store)) continue;
        const rows = await new Promise(res => { const out = []; const c = oldDb.transaction(store).objectStore(store).openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(out); out.push([x.key, x.value]); x.continue(); }; c.onerror = () => res(out); });
        for (let [k, v] of rows) {
          if (store === 'convos' && v) { v = { ...v, schema: window.NoemaConvos?.SCHEMA || 'noema.conversation/v1', messages: (v.messages || []).map(m => m.meta?.lqState ? { ...m, meta: { ...m.meta, noemaState: m.meta.lqState, lqState: undefined } } : m) }; }
          if (store === 'packs' && v && LEGACY.packFormats.includes(v.format)) v = { ...v, format: 'noema-pack' };
          if (!(await IDB.get(store, k))) await IDB.put(store, k, v);
        }
      }
      oldDb.close();
    }
    ls.set(P + 'migrated:idb', String(Date.now()));
  }

  /* ---------------- legacy migration (Databricks Quest v1–v3 single-file app) ---------------- */
  function migrateLegacy(acc, subj) {
    if (ls.get(P + 'migrated:legacy')) return;
    const old = ls.get('dbquest_v1'), oldC = ls.get('dbquest_convos_v1');
    if (!old && !oldC) { ls.set(P + 'migrated:legacy', 'none'); return; }
    if (subj !== 'databricks') return;                       // wait until the Databricks pack is opened
    if (ls.get(KV.subjectKey('state', subj, acc))) { ls.set(P + 'migrated:legacy', 'skipped'); return; }
    try {
      if (old) { const s = JSON.parse(old); const settings = s.settings || {}; delete s.settings; s.srcOn = settings.srcOn || null; delete settings.srcOn;
        KV.set(KV.subjectKey('state', subj, acc), JSON.stringify(s)); const cur = jget(KV.accountKey('settings', acc), {}); KV.set(KV.accountKey('settings', acc), JSON.stringify({ ...settings, ...cur }));
        const st = jget(KV.accountKey('stats', acc), null); if (!st) KV.set(KV.accountKey('stats', acc), JSON.stringify({ xp: s.xp || 0, xpDay: s.xpDay || {}, streak: s.streak || 0, lastDay: s.lastDay || null })); }
      if (oldC) KV.set(KV.subjectKey('convos', subj, acc), oldC);
      ls.set(P + 'migrated:legacy', JSON.stringify({ acc, at: Date.now() }));
      setTimeout(() => toastL('✅ Your previous Databricks Quest progress was carried over'), 1500);
    } catch (e) { console.warn('[Noema] legacy migration failed', e); }
  }

  /* ---------------- account-level stats (XP / streak across all subjects) ---------------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const Stats = {
    get() { return Object.assign({ xp: 0, xpDay: {}, streak: 0, lastDay: null, bySubject: {} }, jget(KV.accountKey('stats'), {})); },
    put(s) { KV.set(KV.accountKey('stats'), JSON.stringify(s)); },
    touchStreak() { const s = this.get(), d = today(); if (s.lastDay === d) return s; const diff = s.lastDay ? Math.round((new Date(d) - new Date(s.lastDay)) / 864e5) : 99; s.streak = diff === 1 ? s.streak + 1 : 1; s.lastDay = d; this.put(s); return s; },
    add(n) { const s = this.touchStreak(); s.xp += n; s.xpDay[today()] = (s.xpDay[today()] || 0) + n; s.bySubject[KV.subj] = (s.bySubject[KV.subj] || 0) + n; const keys = Object.keys(s.xpDay).sort(); while (keys.length > 400) delete s.xpDay[keys.shift()]; this.put(s); return s; },
    streakNow() { const s = this.get(); return s.lastDay && Math.round((new Date(today()) - new Date(s.lastDay)) / 864e5) <= 1 ? s.streak : 0; },
    todayXP() { return this.get().xpDay[today()] || 0; },
  };

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
      const newer = !!(extra.version && extra.version !== (p.version || null));
      list.push(newer
        ? { ...m, ...extra, origin: 'imported', counts: extra.counts || p.counts || countPack(p), version: extra.version, updateAvailable: true }
        : { ...extra, ...m, origin: 'imported', counts: p.counts || countPack(p), version: p.version, sharedBy: extra.sharedBy, publicFrom: extra.publicFrom, publicOwner: extra.publicOwner });
    });
    // imported packs known from synced metadata (e.g. imported on another device, stored in the cloud)
    ls.keys(`${P}${acc}:a:packmeta:`).forEach(k => { const m = jget(k, null); if (m && !list.some(s => s.id === m.id)) list.push({ ...m, origin: 'imported' }); });
    return list.map(s => ({ ...s, ...subjOverride(acc, s.id), hidden: hidden.has(s.id) }));
  }
  /* ---------- your own name / description for any subject (synced; the pack itself is not changed) ---------- */
  function subjOverride(acc, id) { const o = jget(KV.accountKey('subjoverride:' + id, acc), null); if (!o) return {}; const r = {}; if (o.title) r.title = o.title; if (o.description != null) r.description = o.description; if (o.emoji) r.emoji = o.emoji; return r; }
  function setSubjOverride(acc, id, o) { const k = KV.accountKey('subjoverride:' + id, acc); const cur = jget(k, {}) || {}; const next = { ...cur, ...o }; Object.keys(next).forEach(x => (next[x] === '' || next[x] == null) && delete next[x]); if (Object.keys(next).length) KV.set(k, JSON.stringify(next)); else KV.del(k); }
  function setHidden(acc, id, hide) { const k = KV.accountKey('settings', acc); const st = jget(k, {}); const h = new Set(st.hiddenSubjects || []); hide ? h.add(id) : h.delete(id); st.hiddenSubjects = [...h]; KV.set(k, JSON.stringify(st)); }
  /** Delete a subject that belongs to this account (imported / made with Claude / shared with you / from Explore / a curriculum step):
      this device, the cloud copy, its metadata and source files. Progress is kept (it returns if the pack is imported again). */
  async function deleteSubject(acc, s) {
    await IDB.del('packs', acc + '|' + s.id).catch(() => { });
    KV.del(KV.accountKey('packmeta:' + s.id, acc)); KV.del(KV.accountKey('subjoverride:' + s.id, acc));
    if (isCloudAcc(acc)) await NoemaCloud.deleteObjects('noema-private', [`${NoemaCloud.session().user.id}/packs/${s.id}.json`]).catch(e => console.warn('[delete subject]', e));
    if (window.NoemaSrcFiles) await NoemaSrcFiles.removeAll(acc, s.id).catch(() => { });
    if (s.curriculum && window.NoemaCurriculum) { const c = NoemaCurriculum.get(acc, s.curriculum); if (c?.nodes[s.node]) { c.nodes[s.node].pack = null; NoemaCurriculum.save(acc, c); } }
    if (window.NOEMA_PACKS) delete window.NOEMA_PACKS[s.id];
  }
  /** ✏️ Edit a subject: name, description, hide, delete (and share for your own). */
  function editSubject(acc, s, { onChange } = {}) {
    const own = s.origin !== 'library' && s.origin !== 'private';
    overlay((box, close) => {
      const title = el('input', { class: 'noema-input', value: s.title, maxlength: '90', 'aria-label': 'Name' });
      const desc = el('textarea', { class: 'noema-input', rows: 3, maxlength: '400', placeholder: 'A line about this subject (shown in the subject list)', 'aria-label': 'Description' }); desc.value = s.description || '';
      const done = () => { close(); onChange?.(); };
      box.append(brandHead(`${s.emoji || '📘'} Edit “${s.title}”`, s.origin === 'library' ? 'A library subject: your name and description are only for you.' : 'Only you see these changes.'),
        el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, 'Name', title), el('label', { class: 'cg-field' }, 'Description', desc),
          el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => { const t = title.value.trim(); if (!t) { title.focus(); return; } setSubjOverride(acc, s.id, { title: t === (s._origTitle || '') ? '' : t, description: desc.value.trim() }); toastL('✔ Saved'); done(); } }, 'Save'),
            jget(KV.accountKey('subjoverride:' + s.id, acc), null) ? el('button', { class: 'btn small ghost', onclick: () => { KV.del(KV.accountKey('subjoverride:' + s.id, acc)); toastL('↩ Original name and description restored'); done(); } }, '↩ Restore the original') : null)),
        el('div', { class: 'nx-sec' }, el('h4', {}, '🙈 Remove from my list'), el('p', { class: 'tiny' }, 'Hides the subject from the subject list (your progress stays). Bring it back in ⚙️ → Subjects.'),
          el('button', { class: 'btn small', onclick: () => { setHidden(acc, s.id, true); toastL('🙈 Hidden — ⚙️ → Subjects brings it back'); done(); } }, '🙈 Hide')),
        own ? el('div', { class: 'nx-sec' }, el('h4', {}, '🗑 Delete'), el('p', { class: 'tiny' }, 'Deletes the subject from this device and your cloud account, with its attached source files. Your progress is kept, so importing it again brings everything back.'),
          el('button', { class: 'btn small danger', onclick: async () => { if (!confirm(`Delete “${s.title}”? This cannot be undone (progress is kept).`)) return; await deleteSubject(acc, s); toastL('🗑 Deleted'); done(); if (KV.subj === s.id) Noema.switchTo(acc, null); } }, '🗑 Delete the subject')) : null,
        own ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { close(); shareDialog(acc, s); } }, '🔗 Share or make public')) : null,
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      setTimeout(() => title.focus(), 150);
    });
  }
  function countPack(p) { const ch = p.chapters || []; return { chapters: ch.length, sections: ch.reduce((a, c) => a + c.sections.length, 0), exercises: ch.reduce((a, c) => a + c.exercises.length, 0) }; }
  function subjectProgress(acc, s) {
    const st = jget(KV.subjectKey('state', s.id, acc), null); if (!st || !s.counts?.exercises) return 0;
    const ok = Object.values(st.res || {}).filter(r => r.ok > 0).length;
    return Math.min(1, ok / s.counts.exercises);
  }

  /* ---------------- pack loading ---------------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = el('script', { src }); s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); }); }
  function loadCSS(href) { return new Promise(res => { const l = el('link', { rel: 'stylesheet', href }); l.onload = res; l.onerror = res; document.head.append(l); }); }
  /** "fetch": "app" web pictures (docs/VISUAL.md §6): download + embed once, so the subject also works offline.
      Pictures that cannot be downloaded now stay as links (shown from the web) and are tried again next time. */
  const needsPictures = p => Object.values(p?.media || {}).some(m => m.fetch === 'app' && !m.data);
  async function embedWebPictures(acc, p, { wait = 20000 } = {}) {
    if (!needsPictures(p) || !window.NoemaClaude) return p;
    const job = NoemaClaude.fillWebPictures(p).then(r => { if (r.embedded) IDB.put('packs', acc + '|' + p.subject.id, p).catch(() => { }); });
    await Promise.race([job, new Promise(r => setTimeout(r, wait))]).catch(() => { });
    return p;
  }
  async function getPack(acc, meta) {
    window.NOEMA_PACKS = window.NOEMA_PACKS || {};
    if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id];
    let cached = null;
    if (meta.origin === 'imported') {
      cached = await IDB.get('packs', acc + '|' + meta.id);
      const stale = !!(cached && meta.version && cached.version !== meta.version && window.NoemaCloud && NoemaCloud.session());
      if (cached && !stale) { if (needsPictures(cached)) embedWebPictures(acc, cached, { wait: 0 }); return cached; }     // a newer version exists in the cloud (e.g. Claude updated it) → download below
      if (stale) toastL(`⬇️ Getting the new version of “${meta.title || meta.id}”…`, 4000);
    }
    if (meta.path) { await loadScript(meta.path); if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id]; }
    if (window.NoemaCloud && NoemaCloud.session()) {
      let err = null; const p = await NoemaCloud.downloadPack(meta.id).catch(e => { err = e; return null; });
      if (p) { await IDB.put('packs', acc + '|' + meta.id, p).catch(() => { }); if (cached) toastL(`✨ “${meta.title || meta.id}” is up to date`, 3000); return embedWebPictures(acc, p); }
      if (cached && err) { console.warn('[noema] the new version could not be downloaded', err); toastL(`⚠️ The new version of “${meta.title || meta.id}” could not be downloaded right now (${err.message || 'network'}). You are studying the copy saved on this device; it will try again next time.`, 7000); }
    }
    if (cached) return cached;
    throw new Error(`The study pack for “${meta.title || meta.id}” could not be loaded.`);
  }
  async function ensureMath() {
    if (window.katex && window.renderMathInElement) return;
    const base = window.NOEMA_VENDOR_BASE || 'engine/vendor/';
    try { await loadCSS(base + 'katex/katex.min.css'); await loadScript(base + 'katex/katex.min.js'); await loadScript(base + 'katex/contrib/auto-render.min.js'); }
    catch (e) { try { await loadCSS('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'); await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'); await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js'); } catch (e2) { console.warn('[Noema] math rendering unavailable'); } }
  }

  /* ---------------- overlays (account + subject pickers) ---------------- */
  function overlay(build, { closable = true } = {}) {
    const o = el('div', { class: 'noema-overlay' }); const box = el('div', { class: 'noema-ovbox' }); o.append(box);
    const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 250); };
    if (closable) o.addEventListener('click', e => { if (e.target === o) close(); });
    build(box, close); document.body.append(o); return close;
  }
  function brandHead(title, sub) {
    return el('div', { class: 'noema-ovhead' }, el('div', { class: 'logo' }, '◆'), el('div', {}, el('h1', {}, title), sub ? el('p', { class: 'muted' }, sub) : null));
  }
  /** The interface language (engine/i18n.js): the account's settings.lang (else the last account's), else the browser's. */
  const uiPref = (acc = KV.acc || jget(P + 'current', {}).acc) => acc ? jget(`${P}${acc}:a:settings`, {}).lang : null;
  const tr = (key, vars, acc) => window.NoemaI18n ? NoemaI18n.t(key, vars, uiPref(acc)) : key;
  function pickAccount({ closable = false } = {}) {
    return new Promise(resolve => {
      overlay((box, close) => {
        const draw = () => {
          box.innerHTML = '';
          const accs = allAccounts();
          box.append(brandHead(CFG.appName, tr('pick.who')),
            el('div', { class: 'noema-accgrid' }, ...accs.map((a, i) => el('button', { class: 'noema-acc', style: { animationDelay: i * 50 + 'ms' }, onclick: async () => {
              if (a.pin) { const pin = await askPin(box, a); if (!pin) return; if ((await sha256(a.id + ':' + pin)) !== a.pin) { toastL('Wrong PIN'); return; } }
              close(); resolve(a);
            } }, el('span', { class: 'noema-accemo' }, a.emoji || '🙂'), el('b', {}, a.name), el('small', {}, a.kind === 'cloud' ? '☁️ ' + a.email : (a.pin ? '🔒 ' : '') + tr('pick.local')))),
              el('button', { class: 'noema-acc add', onclick: () => newProfileForm(box, a => { saveLocalAccount(a); close(); resolve(getAccount(a.id)); }, draw) }, el('span', { class: 'noema-accemo' }, '➕'), el('b', {}, tr('pick.newProfile')), el('small', {}, tr('pick.onDevice')))),
            CFG.supabaseUrl && window.NoemaCloud && !NoemaCloud.session() ? el('div', { class: 'noema-cloudrow' }, el('button', { class: 'btn ai', onclick: () => cloudForm(box, acc => { close(); resolve(acc); }, draw) }, tr('pick.cloudSignIn')), el('span', { class: 'tiny' }, tr('pick.cloudHint'))) : null);
        };
        draw();
      }, { closable });
    });
  }
  function askPin(box, a) {
    return new Promise(res => {
      const inp = el('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'PIN', class: 'noema-input', onkeydown: e => { if (e.key === 'Enter') { res(inp.value); f.remove(); } if (e.key === 'Escape') { res(null); f.remove(); } } });
      const f = el('div', { class: 'noema-form pop' }, el('b', {}, `${a.emoji} ${a.name} — enter PIN`), inp, el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { res(null); f.remove(); } }, 'Cancel'), el('button', { class: 'btn primary', onclick: () => { res(inp.value); f.remove(); } }, 'Unlock')));
      box.append(f); inp.focus();
    });
  }
  function newProfileForm(box, done, back) {
    const EMO = ['🦉', '🦊', '🐼', '🐯', '🦄', '🐙', '🌵', '🚀', '🎧', '📚', '🧪', '🧠'];
    let emoji = EMO[Math.random() * EMO.length | 0];
    const name = el('input', { class: 'noema-input', placeholder: 'Name (e.g. Maria)', maxlength: 30 });
    const pin = el('input', { class: 'noema-input', type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'Optional PIN (privacy curtain, not encryption)' });
    const emos = el('div', { class: 'noema-emos' }, ...EMO.map(e => { const b = el('button', { class: 'noema-emo' + (e === emoji ? ' on' : ''), onclick: () => { emoji = e; [...emos.children].forEach(x => x.classList.toggle('on', x === b)); } }, e); return b; }));
    box.innerHTML = '';
    box.append(brandHead('New profile', 'Each profile has its own subjects, progress, conversations, settings and backups.'), el('div', { class: 'noema-form' }, name, emos, pin,
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: back }, '← Back'), el('button', { class: 'btn primary', onclick: async () => {
        const n = name.value.trim(); if (!n) { name.focus(); return; }
        let id = slugify(n) || 'profile'; const taken = new Set(allAccounts().map(a => a.id)); let k = 2; const base = id; while (taken.has(id)) id = base + '-' + k++;
        done({ id, name: n, emoji, pin: pin.value ? await sha256(id + ':' + pin.value) : null, created: Date.now() });
      } }, 'Create profile'))));
    name.focus();
  }
  function cloudForm(box, done, back) {
    let mode = 'in';
    const email = el('input', { class: 'noema-input', type: 'email', placeholder: 'Email', autocomplete: 'email' });
    const pw = el('input', { class: 'noema-input', type: 'password', placeholder: 'Password (min 8 characters)', autocomplete: 'current-password' });
    const nm = el('input', { class: 'noema-input', placeholder: 'Display name' });
    const msg = el('div', { class: 'tiny' });
    const draw = () => {
      box.innerHTML = '';
      box.append(brandHead(mode === 'in' ? 'Sign in' : 'Create cloud account', 'Your data is private to your account (row-level security).'),
        el('div', { class: 'noema-form' }, mode === 'up' ? nm : null, email, pw, msg,
          el('div', { class: 'row' }, el('button', { class: 'btn', onclick: back }, '← Back'),
            el('button', { class: 'btn primary', onclick: async e => {
              const b = e.currentTarget; b.disabled = true; msg.textContent = '…';
              try {
                if (mode === 'in') { await NoemaCloud.signIn(email.value.trim(), pw.value); done(cloudAccount()); }
                else { const r = await NoemaCloud.signUp(email.value.trim(), pw.value, nm.value.trim()); if (r.session) done(cloudAccount()); else { msg.textContent = '📧 Check your inbox to confirm the email, then sign in.'; mode = 'in'; setTimeout(draw, 2500); } }
              } catch (er) { msg.textContent = '⚠️ ' + er.message; } finally { b.disabled = false; }
            } }, mode === 'in' ? 'Sign in' : 'Create account')),
          el('div', { class: 'row' },
            el('button', { class: 'tiny linkish', onclick: () => { mode = mode === 'in' ? 'up' : 'in'; draw(); } }, mode === 'in' ? 'No account yet? Create one' : 'Have an account? Sign in'),
            mode === 'in' ? el('button', { class: 'tiny linkish', onclick: async () => { try { await NoemaCloud.recover(email.value.trim()); msg.textContent = '📧 Password-reset email sent.'; } catch (er) { msg.textContent = '⚠️ ' + er.message; } } }, 'Forgot password?') : null)));
      email.focus();
    };
    draw();
  }
  async function pickSubject(acc, { closable = false } = {}) {
    const subs = (await subjectsFor(acc)).filter(s => !s.hidden && !s.curriculum);   // curriculum steps live in 🧭 Curricula
    const groups = (REG.groups || []).slice(); if (!groups.some(g => g.id === 'other')) groups.push({ id: 'other', title: tr('pick.other', null, acc), emoji: '✨' });
    const a = getAccount(acc) || { name: acc, emoji: '🙂' };
    return new Promise(resolve => {
      overlay((box, close) => {
        const q = el('input', { class: 'noema-input noema-search', placeholder: tr('pick.search', null, acc), oninput: () => draw() });
        const list = el('div');
        const draw = () => {
          list.innerHTML = '';
          const term = q.value.trim().toLowerCase();
          let n = 0;
          groups.forEach(g => {
            const items = subs.filter(s => (groups.some(x => x.id === s.group) ? s.group : 'other') === g.id && (!term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term)));
            if (!items.length) return;
            list.append(el('div', { class: 'noema-group' }, el('div', { class: 'noema-grouphead' }, `${g.emoji || ''} ${g.title}`),
              el('div', { class: 'noema-chips' }, ...items.map(s => { n++; const pct = Math.round(subjectProgress(acc, s) * 100);
                const chip = el('button', { class: 'noema-chip' + (s.id === KV.subj ? ' on' : ''), style: { animationDelay: n * 35 + 'ms' }, title: s.description || '', onclick: () => { close(); resolve(s); } },
                  el('span', { class: 'e' }, s.emoji || '📘'), el('span', { class: 't' }, s.title), s.origin !== 'library' ? el('span', { class: 'o', title: s.sharedBy ? 'shared by ' + s.sharedBy : s.publicOwner ? 'from ' + s.publicOwner : '' }, s.origin === 'private' ? '🔒' : s.sharedBy ? '🤝' : s.publicFrom ? '🌍' : '📥') : null, s.updateAvailable ? el('span', { class: 'o', title: 'A new version is ready — it downloads when you open the subject' }, '✨') : null, pct ? el('span', { class: 'p' }, pct + '%') : null);
                const edit = el('button', { class: 'noema-editbtn', title: 'Rename, describe, hide or delete', 'aria-label': 'Edit ' + s.title, onclick: e => { e.stopPropagation(); editSubject(acc, s, { onChange: async () => { const fresh = (await subjectsFor(acc)).filter(x => !x.hidden && !x.curriculum); subs.length = 0; subs.push(...fresh); draw(); } }); } }, '✏️');
                return el('span', { class: 'noema-chipwrap' }, chip, edit, s.origin === 'library' ? null : el('button', { class: 'noema-sharebtn', title: 'Share or make public', 'aria-label': 'Share ' + s.title, onclick: e => { e.stopPropagation(); shareDialog(acc, s); } }, '🔗')); }))));
          });
          if (!n) list.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '📭'), el('p', {}, subs.length ? tr('pick.noMatch', null, acc) : tr('pick.none', null, acc))));
        };
        const imp = el('label', { class: 'btn small' }, tr('pick.import', null, acc), el('input', { type: 'file', accept: '.zip,.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await importPackFile(acc, e.target.files[0]); close(); resolve(s); } catch (er) { toastL('⚠️ ' + er.message, 4000); } } }));
        const reqs = el('div', { class: 'nx-reqs' });
        Notes.on(all => { const pending = all.filter(x => x.kind !== 'curriculum'); reqs.innerHTML = ''; if (!pending.length) return; reqs.append(el('div', { class: 'nx-lbl' }, tr('pick.shared', { n: pending.length }, acc)), ...pending.map(sh => shareRow(sh, { onAccepted: s => { close(); resolve(s); } }))); });
        // two ways to study: ready-made subject packs, or a curriculum (a map of steps generated on demand)
        const modes = el('div', { class: 'cm-modes', role: 'tablist' },
          el('button', { class: 'cm-mode on', role: 'tab', 'aria-selected': 'true' }, tr('pick.subjects', null, acc), el('small', {}, tr('pick.subjectsSub', null, acc))),
          el('button', { class: 'cm-mode', role: 'tab', 'aria-selected': 'false', onclick: () => window.NoemaCurMap?.library(acc, { onStudy: async id => { const s = (await subjectsFor(acc)).find(x => x.id === id); if (s) { close(); resolve(s); } } }) }, tr('pick.curricula', null, acc), el('small', {}, tr('pick.curriculaSub', null, acc))));
        box.append(brandHead(tr('pick.what', null, acc), `${a.emoji || ''} ${a.name}`), modes, reqs, q, list,
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small ai', onclick: () => claudeGuide(acc, { onDone: s => { close(); resolve(s); } }) }, tr('pick.create', null, acc)), el('button', { class: 'btn small', onclick: () => explore(acc, { onChoose: s => { close(); resolve(s); } }) }, tr('pick.explore', null, acc)), imp, el('button', { class: 'btn small ghost', onclick: async () => { close(); const na = await pickAccount({ closable: true }); if (na) { Noema.switchTo(na.id, null); } } }, tr('pick.switchProfile', null, acc)),
            closable ? el('button', { class: 'btn small', onclick: () => { close(); resolve(null); } }, tr('pick.close', null, acc)) : null));
        draw(); if (subs.length > 8) setTimeout(() => q.focus(), 300);
      }, { closable });
    });
  }
  /** 📥 Import: a package (<id>.noema.zip = pack + its source files) or a plain pack (.json). */
  async function importPackFile(acc, file) {
    const SF = window.NoemaSrcFiles;
    if (SF && await SF.isZip(file)) {
      toastL('📦 Opening the package…', 1500);
      const b = await SF.readBundle(file);
      const s = await importPack(acc, b.pack);
      const r = await SF.attachPackaged(acc, b.pack, b.file);
      const miss = r.missing.length + r.bad.length;
      toastL(`📥 “${s.title}” imported` + (r.attached.length ? ` with ${r.attached.length} source file(s) — 👁 open them in 📚 Sources` : '') + (miss ? ` · ⚠️ ${miss} source file(s) missing or damaged: ${[...r.missing, ...r.bad].join(', ')}` : ''), miss ? 6000 : 3500);
      return s;
    }
    let p; try { p = JSON.parse(await file.text()); } catch (e) { throw new Error('This file is not a noema-lite subject pack or package.'); }
    const s = await importPack(acc, p);
    const want = SF ? SF.packaged(p).filter(x => !SF.index(acc, p.subject.id)[x.id]) : [];
    toastL(`📥 “${s.title}” imported` + (want.length ? ` · 📎 its ${want.length} source file(s) are not in this .json — import the .noema.zip package instead, or attach them in 📚 Sources` : ''), want.length ? 6500 : 2500);
    return s;
  }
  /** ⬇️ Save a subject as a package (pack + every attached source file). */
  async function exportPackage(acc, pack) {
    if (!window.NoemaSrcFiles) { const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' })), download: pack.subject.id + '.json' }); a.click(); return; }
    toastL('📦 Preparing the package…', 1500);
    // the pack as stored (the open subject's object is extended by the engine): IndexedDB copy, or the library file
    let clean = await IDB.get('packs', acc + '|' + pack.subject.id).catch(() => null);
    if (!clean) { const m = (REG.subjects || []).find(x => x.id === pack.subject.id); if (m?.path) clean = await fetch(m.path.replace(/pack\.js$/, 'pack.json')).then(r => r.ok ? r.json() : null).catch(() => null); }
    if (clean) pack = clean;
    try { const n = await NoemaSrcFiles.downloadBundle(acc, pack); toastL(`⬇️ ${pack.subject.id}.noema.zip` + (n ? ` (with ${n} source file(s))` : ''), 3000); }
    catch (e) { toastL('⚠️ ' + e.message, 4000); }
  }

  /* ---------------- Sharing, Explore & notifications (docs/SHARING.md) ---------------- */
  const fmtN = n => Number(n || 0).toLocaleString();
  const nOf = (n, one, many = one + 's') => `${fmtN(n)} ${Number(n) === 1 ? one : many}`;
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
    };
  }
  /** A readable info card: stats, chapters (numbered list), sources (with links). */
  /** The chapter list as Markdown (numbered), rendered and sanitised, in a fixed-height scroll box. */
  const mdEsc = t => String(t || '').replace(/([\\`*_[\]<>#|])/g, '\\$1');
  function chaptersBox(chs) {
    const md = chs.map((ch, i) => `${i + 1}. ${ch.emoji ? ch.emoji + ' ' : ''}**${mdEsc(ch.title)}**${ch.sections || ch.exercises ? ` — *${nOf(ch.sections, 'section')} · ${nOf(ch.exercises, 'exercise')}*` : ''}`).join('\n');
    const box = el('div', { class: 'nx-chapters', tabindex: '0', 'aria-label': 'Chapters' });
    if (window.marked && window.DOMPurify) box.innerHTML = DOMPurify.sanitize(marked.parse(md));
    else box.append(el('ol', {}, ...chs.map(ch => el('li', {}, (ch.emoji ? ch.emoji + ' ' : '') + ch.title))));
    return box;
  }
  function infoCard(s, m) {
    const c = (m && m.counts) || s.counts || {};
    const stat = (v, l) => v ? el('div', { class: 'nx-stat' }, el('b', {}, fmtN(v)), el('span', {}, l)) : null;
    return el('div', { class: 'nx-info' },
      el('div', { class: 'nx-infohead' }, el('span', { class: 'nx-emo' }, s.emoji || '📘'), el('div', {}, el('h3', {}, s.title), el('div', { class: 'tiny' }, [s.owner_name || (m && m.ownerName) ? '👤 ' + (s.owner_name || m.ownerName) : '📚 noema-lite library', m && m.language || s.language ? '🗣️ ' + (m && m.language || s.language) : '', m && m.sizeKB ? `💾 ${fmtN(m.sizeKB)} KB` : ''].filter(Boolean).join(' · ')))),
      s.description ? el('p', { class: 'nx-desc' }, s.description) : null,
      el('div', { class: 'nx-stats' }, stat(c.chapters, 'chapters'), stat(c.sections, 'sections'), stat(c.exercises, 'exercises'), stat(c.visual, 'picture exercises'), stat(c.pictures || c.media, 'pictures'), stat(c.flashcards, 'flashcards'), stat(c.playbooks, 'debug playbooks')),
      m && m.chapters && m.chapters.length ? el('div', {}, el('div', { class: 'nx-lbl' }, `📖 ${nOf(m.chapters.length, 'chapter')}`), chaptersBox(m.chapters)) : null,
      m && m.sources && m.sources.length ? el('div', {}, el('div', { class: 'nx-lbl' }, '📚 Sources'), el('ul', { class: 'nx-sources' }, ...m.sources.map(x => el('li', {}, x.url ? el('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title + ' ↗') : x.title, x.subtitle ? el('span', { class: 'tiny' }, ' — ' + x.subtitle) : null, x.pages ? el('span', { class: 'tiny' }, ` (pages ${x.pages})`) : null)))) : null,
      m && m.sourceFiles ? el('p', { class: 'tiny' }, `📎 Comes with ${nOf(m.sourceFiles, 'source file')}${m.sourceBytes ? ' (' + fmtMB(m.sourceBytes) + ')' : ''} — they open with 👁 in 📚 Sources.`) : null,
      m && m.restricted ? el('p', { class: 'tiny' }, `🔒 ${m.restricted} picture(s) are not openly licensed (personal study use).`) : null);
  }
  /** Turn a pack object into one of the account's subjects (local + cloud). */
  async function importPack(acc, p, extra = {}) {
    if (LEGACY.packFormats.includes(p.format)) p.format = 'noema-pack';
    if (p.format !== 'noema-pack' || !p.subject?.id || !Array.isArray(p.chapters)) throw new Error('This file is not a noema-lite subject pack.');
    p.counts = p.counts || countPack(p);
    if (p.sharedFiles) { Object.defineProperty(p, '_sharedFiles', { value: p.sharedFiles, enumerable: false, configurable: true }); delete p.sharedFiles; }   // fetched by the caller (attachShared), not stored
    await embedWebPictures(acc, p);
    await IDB.put('packs', acc + '|' + p.subject.id, p);
    KV.set(KV.accountKey('packmeta:' + p.subject.id, acc), JSON.stringify({ ...p.subject, counts: p.counts, version: p.version || null, ...extra }));
    if (isCloudAcc(acc)) await NoemaCloud.uploadPack(p).catch(e => console.warn(e));
    return { ...p.subject, origin: 'imported', counts: p.counts, ...extra };
  }

  /** The source files that came with a shared / public subject → this account (device + cloud). */
  async function attachSharedFiles(acc, p, bucket) {
    const f = p._sharedFiles; if (!f || !Object.keys(f).length || !window.NoemaSrcFiles) return;
    toastL(`📎 Getting its ${Object.keys(f).length} source file(s)…`, 2500);
    const r = await NoemaSrcFiles.attachShared(acc, { ...p, sharedFiles: f }, bucket);
    if (r.failed.length) toastL(`⚠️ ${r.failed.length} source file(s) could not be downloaded: ${r.failed.join(', ')}`, 6000);
  }
  const fmtMB = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  /* ---- 🔗 share dialog: public + with a person ---- */
  async function shareDialog(acc, s) {
    let pack; try { pack = await getPack(acc, s); } catch (e) { toastL('⚠️ ' + e.message, 4000); return; }
    const meta = packInfo(pack, acc);
    overlay((box, close) => {
      const draw = async () => {
        box.innerHTML = '';
        box.append(brandHead(`🔗 Share “${s.title}”`, `${nOf(meta.counts.chapters, 'chapter')} · ${nOf(meta.counts.exercises, 'exercise')} · ${nOf(meta.counts.pictures, 'picture')}`));
        if (!isCloudAcc(acc)) {
          box.append(el('div', { class: 'noema-form' }, el('p', {}, '☁️ Sharing needs a cloud account (free). Sign in with one — or send the file instead:'),
            el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => exportPackage(acc, pack) }, '⬇️ Download the package to send'))),
            el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
          return;
        }
        const warn = meta.restricted ? el('label', { class: 'nx-warn' }, el('input', { type: 'checkbox', id: 'nx-ack' }), ` ⚠️ ${meta.restricted} picture(s) in this subject are not openly licensed (fine for your own study). Sharing them may need the owners’ permission — I understand.`) : null;
        const acked = () => !warn || warn.querySelector('input').checked;
        // the subject's source files (PDFs…) go with it, unless the learner unticks it
        const fx = window.NoemaSrcFiles ? Object.values(NoemaSrcFiles.index(acc, s.id)) : [];
        const withFiles = el('input', { type: 'checkbox', checked: true });
        const filesRow = fx.length ? el('label', { class: 'nx-files' }, withFiles, ` 📎 Include its ${fx.length} source file${fx.length > 1 ? 's' : ''} (${fmtMB(fx.reduce((a, m) => a + (m.size || 0), 0))}) — PDFs and documents open with 👁 for them too`) : null;
        const prog = el('div', { class: 'tiny' });
        const files = async () => { if (!fx.length || !withFiles.checked) return []; prog.textContent = '⏳ Preparing the source files…'; const fs = await NoemaSrcFiles.forSharing(acc, s.id); return fs; };
        const onProgress = (k, n, name) => { prog.textContent = `⬆️ Uploading source files: ${Math.min(n, Math.floor(k) + 1)}/${n} — ${name}`; };
        const mine = await NoemaCloud.myPublished().catch(() => []);
        const pub = (mine || []).find(r => r.subject_id === s.id);
        const pubBox = el('div', { class: 'nx-sec' }, el('h4', {}, '🌍 Public', el('span', { class: 'nx-tip', title: 'Everyone who opens noema-lite can find it under 🌍 Explore, read its info and study it. You can withdraw it at any time.' }, 'ⓘ')),
          el('p', { class: 'tiny' }, pub ? `Public since ${new Date(pub.updated_at).toLocaleDateString()} — visible to everyone in 🌍 Explore.` : 'Only you can see it now.'),
          el('div', { class: 'row' }, pub
            ? [el('button', { class: 'btn small', onclick: async e => { if (!acked()) return warn.classList.add('shake'); e.currentTarget.disabled = true; try { await NoemaCloud.publish(pack, meta, { files: await files(), onProgress }); toastL('🌍 Updated'); } catch (er) { toastL('⚠️ ' + er.message, 5000); } draw(); } }, '🔄 Publish the newest version'),
               el('button', { class: 'btn small ghost', onclick: async e => { e.currentTarget.disabled = true; await NoemaCloud.unpublish(s.id); toastL('Withdrawn'); draw(); } }, 'Withdraw')]
            : el('button', { class: 'btn small primary', onclick: async e => { if (!acked()) { warn.classList.remove('shake'); void warn.offsetWidth; warn.classList.add('shake'); return; } const b = e.currentTarget; b.disabled = true; try { await NoemaCloud.publish(pack, meta, { files: await files(), onProgress }); toastL('🌍 Public now'); draw(); } catch (er) { b.disabled = false; toastL('⚠️ ' + er.message, 5000); } } }, '🌍 Make it public')));
        const email = el('input', { class: 'noema-input', type: 'email', placeholder: 'Their e-mail (the one they sign in with)' });
        const msg = el('input', { class: 'noema-input', placeholder: 'Optional message, e.g. “for Friday’s exam”', maxlength: 200 });
        const status = el('div', { class: 'tiny' });
        const sent = el('div', { class: 'nx-sent' });
        const personBox = el('div', { class: 'nx-sec' }, el('h4', {}, '👤 Share with a person', el('span', { class: 'nx-tip', title: 'They get a notification (🔔 and a banner) and choose Accept or Reject. After accepting it appears in their subjects. They need a noema-lite cloud account with this e-mail.' }, 'ⓘ')),
          email, msg, el('div', { class: 'row' }, el('button', { class: 'btn small primary', onclick: async e => {
            if (!acked()) { warn.classList.remove('shake'); void warn.offsetWidth; warn.classList.add('shake'); return; }
            const b = e.currentTarget; b.disabled = true; status.textContent = 'Sending…';
            try { await NoemaCloud.shareWith(email.value, pack, meta, msg.value.trim(), { files: await files(), onProgress }); prog.textContent = ''; status.textContent = `✅ Sent to ${email.value.trim().toLowerCase()} — they will see it next time they open noema-lite.`; email.value = ''; msg.value = ''; drawSent(); }
            catch (er) { status.textContent = '⚠️ ' + er.message; } finally { b.disabled = false; }
          } }, '📨 Send')), status, sent);
        const drawSent = async () => {
          const rows = ((await NoemaCloud.outgoingShares().catch(() => [])) || []).filter(r => r.subject_id === s.id);
          sent.innerHTML = ''; if (!rows.length) return;
          sent.append(el('div', { class: 'nx-lbl' }, 'Sent'), ...rows.map(r => el('div', { class: 'nx-sentrow' }, el('span', { class: 'grow' }, r.to_email), el('span', { class: 'pill nx-st-' + r.status }, { pending: '⏳ waiting', accepted: '✅ accepted', rejected: '✖ rejected', revoked: '↩ withdrawn' }[r.status] || r.status),
            r.status === 'pending' ? el('button', { class: 'btn small ghost', onclick: async () => { await NoemaCloud.revokeShare(r.id, r.meta?.filePaths || []); drawSent(); } }, 'Withdraw') : null)));
        };
        box.append(warn, filesRow, prog, pubBox, personBox, el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
        drawSent();
      };
      draw();
    });
  }

  /* ---- 🌍 Explore: every public subject (library + published by users) ---- */
  async function explore(acc, { onChoose } = {}) {
    const choose = onChoose || (s => Noema.switchTo(acc, s.id));
    let pub = [];
    try { if (window.NoemaCloud && CFG.supabaseUrl) pub = (await NoemaCloud.listPublic()) || []; } catch (e) { console.warn('[explore]', e.message); }
    const mine = new Map((await subjectsFor(acc)).map(s => [s.id, s]));
    const lib = (REG.subjects || []).filter(s => !s.owner).map(s => ({ kind: 'library', id: s.id, title: s.title, emoji: s.emoji, description: s.description, language: s.language, counts: s.counts, meta: { counts: s.counts, chapters: s.chapters, sources: s.sources, language: s.language } }));
    const users = pub.map(r => ({ kind: 'public', id: r.subject_id, owner: r.owner, owner_name: r.owner_name, title: r.title, emoji: r.emoji, description: r.description, language: r.language, counts: r.meta?.counts || {}, meta: r.meta || {}, updated_at: r.updated_at }));
    const all = [...lib, ...users];
    const study = async s => {
      if (s.kind === 'library') return choose(s);
      const have = mine.get(s.id);
      if (have && have.origin !== 'library' && (have.version || null) === (s.meta.version || null)) return choose(have);
      toastL('⬇️ Getting “' + s.title + '”…');
      const r = await fetch(NoemaCloud.publicPackUrl(s.owner, s.id)); if (!r.ok) throw new Error('Could not download it (' + r.status + ')');
      const p = await r.json(); if (REG.subjects.some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(s.owner_name || 'shared');
      const added = await importPack(acc, p, { publicFrom: s.owner, publicOwner: s.owner_name || '' });
      await attachSharedFiles(acc, p, 'noema-public');
      toastL(`📥 “${p.subject.title}” added to your subjects`); choose(added);
    };
    overlay((box, close) => {
      const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 Search public subjects…', oninput: () => draw() });
      const grid = el('div', { class: 'nx-grid' });
      const tipCard = el('div', { class: 'nx-hover' });
      const touch = matchMedia('(hover: none)').matches;
      const pick = async s => { hideTip(); close(); try { await study(s); } catch (e) { toastL('⚠️ ' + e.message, 5000); } };
      // details: hover (mouse), focus (keyboard), press-and-hold (touch screens) — a click / tap only chooses the subject
      let tipTimer = null, tipFor = null;
      const hideTip = () => { clearTimeout(tipTimer); tipCard.classList.remove('on', 'sheet'); tipFor = null; };
      const showTip = (s, card, { sheet = false } = {}) => {
        tipCard.innerHTML = ''; tipCard.append(infoCard(s, s.meta));
        if (sheet) tipCard.append(el('div', { class: 'row nx-sheetfoot' }, el('button', { class: 'btn primary', onclick: () => pick(s) }, '📚 Study this subject'), el('button', { class: 'btn small', onclick: hideTip }, 'Close')));
        if (!tipCard.isConnected) document.body.append(tipCard);
        tipFor = s.id; tipCard.classList.toggle('sheet', sheet);
        if (sheet) {   // touch: a bottom sheet; tapping outside closes it
          tipCard.style.cssText = ''; tipCard.classList.add('on');
          setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!tipCard.contains(ev.target)) { hideTip(); } if (!tipCard.classList.contains('sheet') || !tipCard.contains(ev.target)) document.removeEventListener('pointerdown', off, true); }, true), 0);
          return;
        }
        // fixed to the window, so it is never clipped by the dialog; below the card, or above it when there is no room
        const r = card.getBoundingClientRect(), w = Math.min(400, innerWidth - 16);
        tipCard.style.width = w + 'px'; tipCard.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; tipCard.style.top = '0px';
        const h = Math.min(tipCard.offsetHeight || 400, innerHeight - 16);
        tipCard.style.top = (r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h)) + 'px'; tipCard.classList.add('on');
      };
      const draw = () => {
        grid.innerHTML = ''; const t = q.value.trim().toLowerCase();
        const items = all.filter(s => !t || (s.title + ' ' + (s.description || '') + ' ' + (s.owner_name || '')).toLowerCase().includes(t));
        if (!items.length) grid.append(el('p', { class: 'tiny' }, all.length ? 'Nothing matches.' : 'No public subjects yet.'));
        items.forEach((s, i) => {
          let held = false, pressT = null, startXY = null;
          const card = el('button', { class: 'nx-card', type: 'button', 'aria-label': s.title + ' — choose to study', style: { animationDelay: i * 30 + 'ms' },
            onclick: e => { if (held) { e.preventDefault(); held = false; return; } pick(s); },
            onmouseenter: () => { if (touch) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(s, card), 180); },
            onmouseleave: e => { clearTimeout(tipTimer); if (!tipCard.contains(e.relatedTarget)) hideTip(); },
            onfocus: () => { if (!touch) showTip(s, card); }, onblur: () => { if (tipFor === s.id && !tipCard.classList.contains('sheet')) hideTip(); },
            onpointerdown: e => { if (e.pointerType === 'mouse') return; held = false; startXY = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = setTimeout(() => { held = true; navigator.vibrate?.(15); showTip(s, card, { sheet: true }); }, 450); },
            onpointermove: e => { if (startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) clearTimeout(pressT); },
            onpointerup: () => clearTimeout(pressT), onpointercancel: () => clearTimeout(pressT),
            oncontextmenu: e => { if (touch || held) e.preventDefault(); } },
            el('span', { class: 'nx-emo' }, s.emoji || '📘'), el('b', {}, s.title));
          grid.append(card);
        });
      };
      box.classList.add('nx-explore');
      box.append(brandHead('🌍 Explore', matchMedia('(hover: none)').matches ? 'Subjects anyone can study. Tap a subject to study it · press and hold it for the details.' : 'Subjects anyone can study. Click a subject to study it · point at it for the details.'), q, grid,
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      draw(); setTimeout(() => q.focus(), 200);
      const iv = setInterval(() => { if (!box.isConnected) { tipCard.remove(); clearInterval(iv); } }, 300);
      tipCard.addEventListener('mouseleave', e => { if (!tipCard.classList.contains('sheet') && !e.relatedTarget?.closest?.('.nx-card')) hideTip(); });
    });
  }

  /* ---- 🔔 incoming shares: bell + banner (engine) and the picker ---- */
  const Notes = {
    pending: [], listeners: [], timer: null, acc: null,
    on(f) { this.listeners.push(f); f(this.pending); },
    emit() { this.listeners.forEach(f => { try { f(this.pending); } catch (e) { } }); },
    async refresh() {
      if (!this.acc || !isCloudAcc(this.acc)) return this.pending;
      try {
        const subs = (await NoemaCloud.incomingShares()) || [];
        // 👥 invitations to curricula (engine/curshare.js) — in the same bell and banner
        const curs = window.NoemaCurShare ? ((await NoemaCurShare.invites().catch(e => { console.warn('[notes] curricula', e.message); return []; })) || []).map(i => ({ ...i, id: 'cur:' + i.curriculum, kind: 'curriculum', from_name: i.owner_name || '', meta: { ...(i.meta || {}), counts: i.meta?.counts || {} } })) : [];
        this.pending = [...subs, ...curs]; this.emit();
      } catch (e) { console.warn('[notes]', e.message); }
      return this.pending;
    },
    start(acc) {
      this.acc = acc; if (!isCloudAcc(acc)) return;
      this.refresh(); clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), 120e3);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    },
    async accept(sh) {
      if (sh.kind === 'curriculum') {   // 👥 join a shared curriculum: my own progress, the steps prepared together
        const c = await NoemaCurShare.join(this.acc, sh.curriculum);
        this.pending = this.pending.filter(x => x.id !== sh.id); this.emit();
        return { kind: 'curriculum', curriculum: c.id, title: c.title || c.goal };
      }
      const p = await NoemaCloud.downloadShared(sh.id);
      if ((REG.subjects || []).some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(sh.from_name || 'shared');
      const added = await importPack(this.acc, p, { sharedBy: sh.from_name || sh.from_email, sharedAt: new Date().toISOString() });
      await attachSharedFiles(this.acc, p, 'noema-shared');
      await NoemaCloud.answerShare(sh.id, true);
      this.pending = this.pending.filter(x => x.id !== sh.id); this.emit();
      return added;
    },
    async reject(sh) { if (sh.kind === 'curriculum') await NoemaCurShare.decline(sh.curriculum); else await NoemaCloud.answerShare(sh.id, false); this.pending = this.pending.filter(x => x.id !== sh.id); this.emit(); },
  };
  /** One request as a row: who, what (info), Accept / Reject. */
  function shareRow(sh, { onAccepted } = {}) {
    const row = el('div', { class: 'nx-req' },
      sh.kind === 'curriculum' ? el('div', { class: 'grow' }, el('b', {}, `${sh.from_name || 'Someone'}`), ' invites you to the curriculum ', el('b', {}, `“${sh.title}”`),
        el('div', { class: 'tiny' }, `👥 ${nOf(sh.meta?.counts?.steps, 'step')} — your own progress, the prepared steps are shared` + (sh.message ? ` · “${sh.message}”` : '')))
      : el('div', { class: 'grow' }, el('b', {}, `${sh.from_name || sh.from_email}`), ` wants to share `, el('b', {}, `“${sh.title}”`), ' with you',
        el('div', { class: 'tiny' }, `${nOf(sh.meta?.counts?.chapters, 'chapter')} · ${nOf(sh.meta?.counts?.exercises, 'exercise')}` + (sh.message ? ` · “${sh.message}”` : ''))),
      sh.kind === 'curriculum' ? null : el('button', { class: 'btn small ghost', title: 'Details', onclick: () => overlay((b, c) => b.append(infoCard({ title: sh.title, emoji: sh.meta?.emoji, owner_name: sh.from_name }, sh.meta), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: c }, 'Back')))) }, 'ℹ️'),
      el('button', { class: 'btn small primary', onclick: async e => { e.currentTarget.disabled = true; try { const s = await Notes.accept(sh); toastL(s.kind === 'curriculum' ? `👥 You joined “${s.title}” — find it in 🧭 Curricula` : `✅ “${s.title}” is now in your subjects`); onAccepted && onAccepted(s); } catch (er) { toastL('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, sh.kind === 'curriculum' ? '✓ Join' : '✓ Accept'),
      el('button', { class: 'btn small', onclick: async () => { await Notes.reject(sh).catch(er => toastL('⚠️ ' + er.message)); toastL('Rejected'); } }, '✕ Reject'));
    return row;
  }

  /* ---------------- Claude: two ways (docs/CLAUDE_CONNECTOR.md) ----------------
     A. here in noema-lite with the learner's Claude API key (engine/claude.js) — never leave the app
     B. in the Claude app / website with the learner's Claude plan + the noema-lite connector (+ optional skill) */
  const SITE = (CFG.siteUrl || '').replace(/\/$/, '');
  const MCP_URL = SITE ? SITE + '/mcp' : '';
  /** After "Create with Claude": attach the source files — first the ones packaged by Claude (exact, checked), then
      the learner's own uploads for any file-less source left (matched by name). */
  async function attachJobFiles(acc, j) {
    const SF = window.NoemaSrcFiles; const sid = j.pack.subject.id; let n = 0, bad = [];
    if (j.bundleFiles && Object.keys(j.bundleFiles).length) {
      const r = await SF.attachPackaged(acc, j.pack, path => j.bundleFiles[path] || null); n += r.attached.length; bad = [...r.missing, ...r.bad];
    }
    if (j.sourceBlobs?.length) {
      const have = SF.index(acc, sid); const pk = new Set(SF.packaged(j.pack).map(x => x.id));
      const pairs = SF.match((j.pack.sources?.sources || []).filter(s => !have[s.id] && !pk.has(s.id)), j.sourceBlobs);
      for (const [src, f] of pairs) { await SF.put(acc, sid, src.id, f).then(() => n++).catch(e => console.warn('[source files]', e)); }
    }
    if (n) toastL(`📎 ${n} source file(s) attached — open them with 👁 in 📚 Sources`, 4000);
    if (bad.length) toastL(`⚠️ ${bad.length} source file(s) of the package could not be attached: ${bad.join(', ')}`, 6000);
    if (j.bundleFiles) { j.bundleFiles = null; window.NoemaClaude?.saveJob(j).catch(() => { }); }
  }
  const SKILL_URL = (location.protocol.startsWith('http') ? '' : SITE) + '/downloads/noema-pack-builder.zip';
  const CLAUDE_PROMPT = 'Create a noema-lite subject pack from the files I attached.\nSubject title: …\nLanguage of the material: …\nMy goal: exam / understanding / project\nUse the noema-pack-builder skill if you have it; otherwise use the noema-lite connector (noema_get_toolkit + noema_authoring_guide). Include every file I attached in the package — if you split a PDF, its parts, each as its own source — and save it to my noema-lite account with its source files.';
  async function copyText(t, b) { try { await navigator.clipboard.writeText(t); if (b) { const o = b.textContent; b.textContent = '✓ Copied'; setTimeout(() => { b.textContent = o; }, 1600); } } catch (e) { prompt('Copy this:', t); } }
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const slugId = t => slugify(String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[α-ω]/g, c => GR[c] || '')) || 'subject-' + Date.now().toString(36);
  /** ⓘ — a small info toggle that works with mouse, touch and keyboard. */
  const tip = (...txt) => el('details', { class: 'cg-tip' }, el('summary', { title: 'More info', 'aria-label': 'More info' }, 'i'), el('div', { class: 'cg-tipbody' }, ...txt));
  const ext = (href, label) => el('a', { class: 'btn small', href, target: '_blank', rel: 'noopener' }, label + ' ↗');
  /** One numbered step: a bold title (+ ⓘ), then a numbered list of small actions. */
  const step = (title, info, ...subs) => el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, title), info ? tip(info) : null),
    subs.length ? el('ol', { class: 'cg-sub' }, ...subs.filter(Boolean).map(s => s.tagName === 'LI' ? s : el('li', {}, s))) : null);
  const sub = (...kids) => el('li', {}, ...kids);
  const plain = (...kids) => el('li', { class: 'cg-plain' }, ...kids);   // a form field inside a step (not numbered)

  /** Ways B and C, steps 1–4: a Claude account, code execution, the noema-lite connector, the optional skill. */
  function claudeConnectSteps(acc) {
    const cloud = window.NoemaCloud && NoemaCloud.session();
    return [
        step('Create a Claude account', 'The Free plan works for small sources (a few pages). For whole books or many PDFs use Pro or Max: they allow much longer work.',
          sub('Open ', ext('https://claude.ai/', 'claude.ai'), ' — or install the Claude app for your computer or phone from ', ext('https://claude.ai/download', 'claude.ai/download'), '.'),
          sub('Click ', el('b', {}, 'Sign up'), ' and use your e-mail or Google account.'),
          sub(el('span', { class: 'tiny' }, 'Already have one? Go to step 2.'))),
        step('Switch on “Code execution”', 'Claude needs it to run the noema-lite tools that check and build the course.',
          sub('Open ', ext('https://claude.ai/settings/capabilities', 'Settings → Capabilities'), '.'),
          sub('Turn on ', el('b', {}, 'Code execution and file creation'), '.')),
        MCP_URL ? step('Connect noema-lite to Claude', ['Then Claude saves finished subjects straight into your noema-lite account. The address is the same for everybody, on every computer and phone: it is on the noema-lite website, not on your computer. On the Free plan you can add one connector.'],
          cloud ? null : sub(el('span', { class: 'cg-warn' }, '☁️ You need a noema-lite cloud account for this: choose “Sign in / create a cloud account” when noema-lite asks who is studying (⚙️ → Cloud).')),
          sub('In Claude open ', el('b', {}, 'Customize → Connectors'), '.'),
          sub('Click ', el('b', {}, '+ Add'), ' → ', el('b', {}, 'Add custom connector'), '.'),
          sub('Name: ', el('b', {}, 'noema-lite'), ' · URL: ', el('code', { class: 'cg-url' }, MCP_URL), ' ', el('button', { class: 'btn small', onclick: e => copyText(MCP_URL, e.currentTarget) }, '📋 Copy')),
          sub('Leave ', el('i', {}, 'Advanced settings'), ' empty and click ', el('b', {}, 'Add'), '.'),
          sub('Click ', el('b', {}, 'Connect'), ': a noema-lite page opens → sign in with your cloud account → ', el('b', {}, 'Allow'), '.')) : null,
        step('Optional: add the skill', 'Not required: the connector already gives Claude the same instructions and tools. The skill only lets Claude start a little faster. Claude does not allow other websites to install skills into your account (a safety rule), so this one step is manual.',
          sub(el('a', { class: 'btn small', href: SKILL_URL, download: 'noema-pack-builder.zip' }, '⬇️ Download the skill'), ' (a .zip file — do not unzip it).'),
          sub('In Claude: ', el('b', {}, 'Customize → Skills'), ' → ', el('b', {}, '+'), ' → ', el('b', {}, 'Create skill'), ' → ', el('b', {}, 'Upload a skill'), ' → choose the zip.'))].filter(Boolean);
  }
  /** Way B (Claude app / website + connector): the steps and the two questions — used by ✨ Create with Claude and by ❓ Help. */
  function claudeAppSteps(acc) {
    return [
      el('ol', { class: 'cg-steps' },
        ...claudeConnectSteps(acc),
        step('Ask Claude', 'Big sources take 10–40 minutes. You can watch Claude work; keep the chat open until it says the subject is saved.',
          sub(ext('https://claude.ai/new', 'Open a new chat')),
          sub('Attach your PDFs and pictures with the ', el('b', {}, '+'), ' (or 📎) button.'),
          sub('Either choose ', el('b', {}, '+ → noema-lite → Create a noema-lite subject'), ' and type the title, or paste this message and fill in the dots: ',
            el('button', { class: 'btn small', onclick: e => copyText(CLAUDE_PROMPT, e.currentTarget) }, '📋 Copy the message')),
          sub('Press Send.')),
        step('Study', null,
          sub('Open noema-lite → subject picker: the new subject is there with 🔒 (if not, close and reopen the picker).'),
          sub('Without the connector Claude gives you a package ', el('b', {}, '<id>.noema.zip'), ' (the course + your source files): download it, then ', el('b', {}, '📥 Import subject pack'), ' in the subject picker.'))),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ Why can’t noema-lite add the skill to my Claude by itself?'),
        el('p', {}, 'Claude does not let websites install things into your Claude account — that protects you. You do not need the skill anyway: with the connector Claude gets the instructions from noema-lite by itself. In way A (here in noema-lite) the app uploads the skill for you automatically, using your API key.')),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ Is the connector address the same on every computer?'),
        el('p', {}, 'Yes: ', el('code', {}, MCP_URL || '(this installation has no website address)'), '. It points to the noema-lite website, so it is the same for every user and every device (Windows, Mac, Linux, phones).')),
    ];
  }
  /** Way C (curricula with the Claude plan): the learner's Claude app runs the curriculum agents and prepares the steps. */
  function claudeCurriculumSteps(acc) {
    const lib = () => window.NoemaCurMap?.library(acc);
    return [
      el('p', { class: 'cg-recommend' }, '⭐ ', el('b', {}, 'Recommended for curricula — usually the cheapest way. '), 'A curriculum has many steps and each one becomes a full subject. With an API key (way A) every prepared step costs a few dollars, so 30–40 steps add up; with your Claude plan (Free, Pro or Max) there is nothing to pay beyond the plan. The difference grows with the size of the curriculum. The catch: your plan has usage limits, so a big curriculum may be prepared over a few days — prepare the next steps while you study the first ones.'),
      el('ol', { class: 'cg-steps' },
        ...claudeConnectSteps(acc),
        step('Choose “Claude app” in noema-lite', 'It is preselected when you have a cloud account. Your curricula made with an API key can switch too: open the map → ⚙️ → AI for new steps; or send single steps with “💬 In my Claude app instead”.',
          sub('Open ', el('button', { class: 'btn small', onclick: lib }, '🧭 Curricula'), ' → ', el('b', {}, '➕ New curriculum'), ' or ', el('b', {}, '📥 Import a map'), '.'),
          sub('At “Which AI…?” choose ', el('b', {}, '💬 Claude app — with your Claude plan'), '.'),
          sub('Press ', el('b', {}, 'Build'), ' / ', el('b', {}, 'Import'), '. Nothing runs in noema-lite: it waits for your Claude app.')),
        step('Paste one message into a Claude chat', 'Claude asks the connector for the next task — the map’s agents, the chapter plans, then the queued steps — does it and saves it into your account. One step per chat keeps Claude fast and focused; for the next step paste the same message into a new chat.',
          sub('In noema-lite press ', el('b', {}, '📋 Copy the message'), ' (on the waiting curriculum, in the 💬 bar of its map, or on a step).'),
          sub(ext('https://claude.ai/new', 'Open a new chat'), ' — in the chat, make sure the noema-lite connector is on (', el('b', {}, '+ → Connectors'), ').'),
          sub('Paste the message and send it. Claude works for a few minutes (the map) up to 10–40 minutes (a step with big files).')),
        step('Come back to noema-lite', 'The app checks when you return to it and every 20 seconds while something waits. ⚡ on the map = ready to study.',
          sub('What Claude saved appears by itself: the map, the chapters, the prepared steps.'),
          sub('No connector (or no cloud account)? Press ', el('b', {}, 'How? · by hand'), ': copy a task into any Claude chat and paste the answer back; for a step, download its bundle (task + your files + toolkit), give it to Claude, and import the .noema.zip it makes with ', el('b', {}, '📥 Import its package'), '.'))),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ Which way should I choose?'),
        el('ul', {}, el('li', {}, el('b', {}, 'C (Claude plan): '), 'cheapest for curricula, best for big ones; you paste a message per step and the plan’s limits set the pace.'),
          el('li', {}, el('b', {}, 'A (API key): '), 'fully automatic — steps are prepared in the background while the app is open; you pay per step (you set a limit).'),
          el('li', {}, el('b', {}, 'Gemini (free key): '), 'free and automatic, simpler subjects (no web pictures).'),
          el('li', {}, 'You can mix them: switch a curriculum in ⚙️, or send single steps to the Claude app.'))),
    ];
  }
  /** ❓ Help → “Set up Claude”: all ways, always available (the same steps as in ✨ Create with Claude). open: 'A' | 'B' | 'C' */
  function claudeSetupView(acc = KV.acc, { open = 'A' } = {}) {
    const wrap = el('div', { class: 'cg-setup' });
    const A = window.NoemaClaude ? claudeKeySteps(acc) : null;
    wrap.append(
      el('details', { class: 'cg-way', open: open === 'A' }, el('summary', {}, el('b', {}, '🏠 A. Here in noema-lite — with a Claude API key'), el('span', { class: 'tiny' }, ' · you pay Anthropic per use; everything happens in this app')),
        A ? el('ol', { class: 'cg-steps' }, ...A.steps) : el('p', {}, 'This installation has no Claude module.'),
        el('div', { class: 'row' }, el('button', { class: 'btn ai', onclick: () => claudeGuide(acc, { way: 'A' }) }, '✨ Create a subject this way'), el('button', { class: 'btn small', onclick: () => window.NoemaCurMap?.library(acc) }, '🧭 Curricula (use the same key)'))),
      el('details', { class: 'cg-way', open: open === 'B' }, el('summary', {}, el('b', {}, '💬 B. In the Claude app or website — with the noema-lite connector'), el('span', { class: 'tiny' }, ' · uses your Claude plan; the subject arrives here by itself')),
        ...claudeAppSteps(acc)),
      el('details', { class: 'cg-way cg-way-c', open: open === 'C' }, el('summary', {}, el('b', {}, '🧭 C. Curricula with your Claude plan — the Claude app plans and prepares the steps'), el('span', { class: 'cg-badge' }, '⭐ recommended for curricula · usually cheapest'), el('span', { class: 'tiny' }, ' · no API cost; results arrive here by themselves')),
        ...claudeCurriculumSteps(acc)));
    return wrap;
  }
  /** Way A, steps 1–4 (Console account, credit, API key, paste + check) — used by ✨ Create with Claude and by ❓ Help. */
  function claudeKeySteps(acc) {
    const C = window.NoemaClaude;
    const key = el('input', { class: 'noema-input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', value: C.Key.get(acc) });
    const remember = el('input', { type: 'checkbox' }); remember.checked = C.Key.remembered(acc) || !C.Key.get(acc);
    const kstat = el('div', { class: 'tiny cg-kstat' });
    const model = el('select', { class: 'noema-input' }); const modelRow = el('div', { class: 'cg-model', style: { display: 'none' } }, el('label', {}, 'Claude model ', model, tip('The default is the newest “Sonnet”: very good quality for its price. “Opus” is the strongest and costs more; “Haiku” is cheaper but writes weaker courses.')));
    let keyOk = false;
    const checkKey = async () => {
      const k = key.value.trim(); keyOk = false; modelRow.style.display = 'none';
      if (!C.Key.looksValid(k)) { kstat.textContent = '⚠️ That does not look like a Claude API key — it starts with sk-ant- and is long. Copy it again from the Console.'; kstat.className = 'tiny cg-kstat bad'; return false; }
      kstat.textContent = '⏳ Checking…'; kstat.className = 'tiny cg-kstat';
      try {
        const ms = await C.models(k); if (!ms.length) throw new Error('no models available for this key');
        model.innerHTML = ''; ms.forEach(m => model.append(el('option', { value: m.id }, m.name)));
        model.value = jget(KV.accountKey('claudeModel', acc), null) && ms.some(m => m.id === jget(KV.accountKey('claudeModel', acc), null)) ? jget(KV.accountKey('claudeModel', acc), null) : C.defaultModel(ms);
        C.Key.set(acc, k, remember.checked); keyOk = true; modelRow.style.display = '';
        kstat.textContent = '✅ The key works.' + (remember.checked ? ' It is remembered on this device only (never sent to the noema-lite cloud).' : ' It is kept only until you close this tab.'); kstat.className = 'tiny cg-kstat ok';
        return true;
      } catch (e) { kstat.textContent = '❌ ' + e.message; kstat.className = 'tiny cg-kstat bad'; return false; }
    };
    const steps = [
      step('Create a Claude Console account', ['This is Anthropic’s account for the Claude API (Anthropic makes Claude). It is separate from a claude.ai chat plan: a Pro or Max subscription does ', el('b', {}, 'not'), ' include API credit.'],
        sub('Open the Claude Console: ', ext('https://platform.claude.com/', 'platform.claude.com')),
        sub('Click ', el('b', {}, 'Sign up'), ' and use your e-mail or your Google account.'),
        sub('Open the e-mail Anthropic sends you and confirm it.'),
        sub(el('span', { class: 'tiny' }, 'Already have an account? Skip to step 2.'))),
      step('Add some credit', 'You pay only for what Claude actually uses. A typical subject costs a few dollars; very big PDFs cost more. noema-lite shows the estimated cost while Claude works and stops at the limit you set in step 7.',
        sub('Open ', ext('https://platform.claude.com/settings/billing', 'Settings → Billing'), '.'),
        sub('Buy credit — a small amount (for example $5–10) is enough to start.'),
        sub('Recommended: set a monthly spending limit (in the Console: ', el('b', {}, 'Settings → Limits'), ').')),
      step('Create an API key', 'The key is like a password that lets noema-lite ask Claude for you. Anyone who has it can spend your credit — do not send it to anybody. You can delete it in the Console at any time.',
        sub('Open ', ext('https://platform.claude.com/settings/keys', 'Settings → API keys'), '.'),
        sub('Click ', el('b', {}, 'Create key'), ', name it ', el('b', {}, 'noema-lite'), ', and confirm.'),
        sub('Click ', el('b', {}, 'Copy'), '. The key starts with ', el('code', {}, 'sk-ant-'), ' and is shown only once.')),
      step('Paste the key here', 'The key stays in this browser. It is never uploaded to the noema-lite cloud and is not part of backups.',
        sub('Click in the box and paste the key (', el('kbd', {}, 'Ctrl'), ' + ', el('kbd', {}, 'V'), ' on Windows and Linux, ', el('kbd', {}, '⌘'), ' + ', el('kbd', {}, 'V'), ' on a Mac):', key),
        sub('Click ', el('button', { class: 'btn small', onclick: checkKey }, '✔️ Check the key'), ' — a green ✅ means it works.'),
        plain(el('label', { class: 'tiny' }, remember, ' Remember the key on this device (untick on a shared computer)')),
        plain(kstat, modelRow)),
    ];
    if (key.value) setTimeout(checkKey, 0);
    return { key, model, checkKey, ok: () => keyOk, steps };
  }

  function claudeGuide(acc = KV.acc, { onDone, way } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      const done = s => { close(); if (onDone) onDone(s); else Noema.switchTo(acc, s.id); };
      const home = async () => {
        box.innerHTML = '';
        box.append(brandHead('✨ Create a subject with Claude', 'Claude reads your PDFs, notes, pictures and links and builds the whole course: theory, exercises, picture exercises and flashcards.'));
        const unfinished = window.NoemaClaude ? (await NoemaClaude.jobs(acc)).filter(j => j.status !== 'done' && j.kind !== 'node') : [];
        if (unfinished.length) box.append(el('div', { class: 'cg-resume' }, el('b', {}, '⏳ Not finished yet'), ...unfinished.slice(0, 3).map(j => el('div', { class: 'cg-jobrow' },
          el('span', {}, `“${j.title}” · ${new Date(j.created).toLocaleString()} · ≈ $${NoemaClaude.cost(j.usage, j.model).toFixed(2)}`),
          el('button', { class: 'btn small primary', onclick: () => progress(j) }, 'Resume'),
          el('button', { class: 'btn small ghost', onclick: async () => { if (confirm('Delete this unfinished subject? What Claude did so far is lost.')) { await NoemaClaude.deleteJob(j.id); home(); } } }, 'Delete')))));
        box.append(el('p', { class: 'cg-q' }, 'How do you want to work with Claude?'),
          el('div', { class: 'cg-choices' },
            el('button', { class: 'cg-choice', onclick: wayA }, el('span', { class: 'cg-ico' }, '🏠'), el('b', {}, 'A. Here in noema-lite'),
              el('ul', {}, el('li', {}, 'You never leave this app'), el('li', {}, 'Needs a Claude API key: you pay Anthropic per use (a few dollars per subject — you see the cost live and set a limit)'), el('li', {}, 'Simplest: everything happens on this page'))),
            el('button', { class: 'cg-choice', onclick: wayB }, el('span', { class: 'cg-ico' }, '💬'), el('b', {}, 'B. In the Claude app or website'),
              el('ul', {}, el('li', {}, 'Uses your Claude plan (Free, Pro or Max) — no extra cost'), el('li', {}, 'You chat with Claude there; the finished subject arrives here by itself'), el('li', {}, 'Best for very big sources (Pro / Max)'))),
            el('button', { class: 'cg-choice cg-choice-c', onclick: wayC }, el('span', { class: 'cg-ico' }, '🧭'), el('b', {}, 'C. A whole curriculum with your Claude plan'), el('span', { class: 'cg-badge' }, '⭐ usually cheapest'),
              el('ul', {}, el('li', {}, 'A map of steps (from a goal, or your own map + files); every step becomes a subject'), el('li', {}, 'Your Claude app plans and prepares the steps — no API cost'), el('li', {}, 'The bigger the curriculum, the bigger the saving')))),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      };
      const back = () => el('button', { class: 'btn small ghost cg-back', onclick: home }, '← Back');

      /* ---------- A: API key, inside the app ---------- */
      function wayA() {
        box.innerHTML = '';
        const C = window.NoemaClaude;
        if (!C) { box.append(back(), el('p', {}, 'This noema-lite installation has no Claude module.')); return; }
        const K = claudeKeySteps(acc); const { key, model, checkKey } = K;
        const files = []; const flist = el('ul', { class: 'cg-files' });
        const drawFiles = () => { flist.innerHTML = ''; files.forEach((f, i) => flist.append(el('li', {}, `📄 ${f.name} · ${(f.size / 1048576).toFixed(1)} MB `, el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name, onclick: () => { files.splice(i, 1); drawFiles(); } }, '✕')))); };
        const pick = el('input', { type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json,.docx,.pptx,.xlsx', style: { display: 'none' }, onchange: e => { for (const f of e.target.files) if (!files.some(x => x.name === f.name && x.size === f.size)) files.push(f); e.target.value = ''; drawFiles(); } });
        const drop = el('label', { class: 'cg-drop', ondragover: e => { e.preventDefault(); drop.classList.add('on'); }, ondragleave: () => drop.classList.remove('on'),
          ondrop: e => { e.preventDefault(); drop.classList.remove('on'); for (const f of e.dataTransfer.files) files.push(f); drawFiles(); } }, pick, '📂 Choose files', el('span', { class: 'tiny' }, ' or drag them here'));
        const links = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'Optional: web links, one per line' });
        const title = el('input', { class: 'noema-input', placeholder: 'e.g. Human heart anatomy' });
        const lang = el('select', { class: 'noema-input' }, ...[['', 'Same as the sources'], ['en', 'English'], ['el', 'Ελληνικά'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['ru', 'Русский']].map(([v, t]) => el('option', { value: v }, t)));
        const goal = el('select', { class: 'noema-input' }, ...[['exam', 'Pass an exam'], ['understanding', 'Understand it deeply'], ['project', 'Use it in a project / at work']].map(([v, t]) => el('option', { value: v }, t)));
        const notes = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'Optional: anything Claude should know (e.g. “focus on chapters 3–5”, “I am a beginner”)' });
        const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', step: '1', value: String(jget(KV.accountKey('claudeBudget', acc), 15)) });
        const err = el('div', { class: 'tiny cg-kstat bad' });
        const go = el('button', { class: 'btn primary cg-go', onclick: async () => {
          err.textContent = '';
          if (!K.ok() && !(await checkKey())) { err.textContent = '👆 Step 4: the key needs to work first.'; key.focus(); return; }
          if (!files.length && !links.value.trim()) { err.textContent = '👆 Step 5: add at least one file or link.'; return; }
          if (!title.value.trim()) { err.textContent = '👆 Step 6: give the subject a title.'; title.focus(); return; }
          const b = Math.max(1, +budget.value || 15); jset(KV.accountKey('claudeBudget', acc), b); jset(KV.accountKey('claudeModel', acc), model.value);
          let sid = slugId(title.value); if (REG.subjects.some(s => s.id === sid)) sid += '-mine';
          go.disabled = true; go.textContent = '⏳ Preparing…';
          const logs = el('div', { class: 'tiny' }); box.append(logs);
          try {
            const job = await C.create({ acc, key: key.value.trim(), model: model.value, title: title.value.trim(), subjectId: sid, language: lang.value, goal: goal.value, notes: notes.value.trim(),
              links: links.value.split('\n').map(x => x.trim()).filter(x => /^https?:\/\//.test(x)), files, budget: b, onLog: t => { logs.textContent = t; } });
            progress(job, { start: true });
          } catch (e) { go.disabled = false; go.textContent = '🚀 Start'; err.textContent = '❌ ' + e.message; logs.remove(); }
        } }, '🚀 Start');
        box.append(back(), brandHead('🏠 Create it here in noema-lite', 'Follow the steps in order. Steps 1–3 are needed only the first time.'),
          el('ol', { class: 'cg-steps' },
            ...K.steps,
            step('Add your sources', 'PDFs, pictures (photos, scans, slides), text files or Word documents. Claude reads everything and uses the pictures inside them for picture exercises. It also finds extra pictures on the web.',
              sub('Click ', el('b', {}, 'Choose files'), ' and pick your files (hold ', el('kbd', {}, 'Ctrl'), ' / ', el('kbd', {}, '⌘'), ' to pick several), or drag them onto the box:', drop, flist),
              sub('Optional: paste web pages to use as sources, one per line:', links)),
            step('Describe the subject', 'Only the title is required. The language decides the language of the course and of the AI tutor.',
              plain(el('label', { class: 'cg-field' }, 'Title', title)),
              plain(el('label', { class: 'cg-field' }, 'Language', lang)),
              plain(el('label', { class: 'cg-field' }, 'Your goal', goal)),
              plain(el('label', { class: 'cg-field' }, 'Notes for Claude (optional)', notes))),
            step('Start', 'Claude works for 10–60 minutes depending on the size of the sources. Keep this page open (you can use other tabs or apps). If the page closes, open ✨ Create with Claude again and press Resume — nothing is lost.',
              sub('Choose a spending limit: ', el('label', { class: 'cg-inline' }, 'stop and ask me above $ ', budget), tip('An estimate based on the published prices; the exact amount is in the Console under Usage. When the limit is reached Claude pauses; you can raise it and continue.')),
              sub('Press ', go, ' and watch Claude work.'), plain(err))),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      }

      /* ---------- progress of an API job ---------- */
      let ctl = null;
      async function progress(job, { start = false } = {}) {
        const C = window.NoemaClaude; box.innerHTML = '';
        const status = el('div', { class: 'cg-status' }); const money = el('div', { class: 'tiny' }); const log = el('ol', { class: 'cg-log', 'aria-live': 'polite' });
        const actions = el('div', { class: 'row' }); const ask = el('div', {});
        const addLog = t => { if (!t) return; log.append(el('li', {}, t)); while (log.children.length > 80) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
        (job.log || []).slice(-40).forEach(x => addLog(x.m));
        const keyIn = el('input', { class: 'noema-input', type: 'password', placeholder: 'sk-ant-… (your Claude API key)' });
        const getKey = () => C.Key.get(acc) || keyIn.value.trim();
        const go = async fn => {
          if (!getKey()) { status.textContent = '🔑 Paste your Claude API key to continue.'; actions.innerHTML = ''; actions.append(keyIn, el('button', { class: 'btn primary', onclick: () => { if (C.Key.looksValid(keyIn.value)) { C.Key.set(acc, keyIn.value, false); go(fn); } } }, 'Continue')); return; }
          ctl = new AbortController(); paint(job);
          const wl = await navigator.wakeLock?.request('screen').catch(() => null);
          try { await fn(getKey(), { onLog: addLog, onUpdate: paint, signal: ctl.signal }); } finally { wl?.release?.(); ctl = null; paint(job); }
        };
        function paint(j) {
          const running = !!ctl && j.status === 'running';
          const usd = C.cost(j.usage, j.model), tok = ((j.usage.input || 0) + (j.usage.cacheRead || 0) + (j.usage.cacheWrite || 0) + (j.usage.output || 0));
          money.textContent = `≈ $${usd.toFixed(2)} of your $${j.budget} limit · ${(tok / 1000).toFixed(0)}k tokens · ${j.turns || 0} steps · model ${j.model}`;
          status.className = 'cg-status ' + j.status;
          status.textContent = { starting: '⏳ Preparing…', running: running ? '🧠 Claude is working… keep this page open.' : '⏸️ Paused.', paused: '⏸️ ' + (j.error || 'Paused.'), question: '💬 Claude needs an answer:', budget: '💰 ' + j.error, error: '⚠️ ' + j.error, failed: '❌ ' + j.error, done: '✅ Your subject is ready!' }[j.status] || j.status;
          actions.innerHTML = ''; ask.innerHTML = '';
          if (running) actions.append(el('button', { class: 'btn', onclick: () => ctl?.abort() }, '⏹ Stop'));
          else if (j.status === 'done') actions.append(el('button', { class: 'btn primary', onclick: async () => { try { const s = await importPack(acc, j.pack, { via: 'claude-api' });
            if (window.NoemaSrcFiles) await attachJobFiles(acc, j);
            await C.deleteJob(j.id); toastL(`📥 “${s.title}” added to your subjects`); done(s); } catch (e) { toastL('⚠️ ' + e.message, 5000); } } }, '📚 Open my new subject'));
          else if (j.status === 'question') {
            const ans = el('textarea', { class: 'noema-input', rows: 3, placeholder: 'Your answer (or just press Send: “continue and finish the pack”)' });
            ask.append(el('div', { class: 'cg-claudesays' }, j.question), ans, el('button', { class: 'btn primary', onclick: () => go((k, o) => C.answer(j, k, ans.value.trim() || 'Continue and finish the pack.', o)) }, 'Send'));
          } else if (j.status === 'budget') {
            const nb = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(Math.ceil(j.budget * 1.5)) });
            actions.append(el('label', { class: 'tiny' }, 'New limit $ ', nb), el('button', { class: 'btn primary', onclick: async () => { j.budget = Math.max(j.budget + 1, +nb.value || 0); await C.saveJob(j); go((k, o) => C.run(j, k, o)); } }, '▶ Continue'));
          } else if (j.status !== 'failed') actions.append(el('button', { class: 'btn primary', onclick: () => go((k, o) => C.run(j, k, o)) }, '▶ Resume'));
          if (!running && j.status !== 'done') actions.append(el('button', { class: 'btn small ghost', onclick: async () => { if (confirm('Delete this unfinished subject?')) { await C.deleteJob(j.id); home(); } } }, '🗑 Delete'));
        }
        box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { if (ctl && !confirm('Claude keeps working only while this window is open. Stop and go back?')) return; ctl?.abort(); home(); } }, '← Back'),
          brandHead(`✨ “${job.title}”`, 'Made by Claude with your API key'), status, money, ask, actions,
          el('details', { class: 'cg-logbox', open: true }, el('summary', {}, 'What Claude is doing'), log));
        paint(job);
        if (start || job.status === 'running') go((k, o) => C.run(job, k, o));
      }

      /* ---------- C: curricula with the Claude plan ---------- */
      function wayC() {
        box.innerHTML = '';
        box.append(back(), brandHead('🧭 A curriculum with your Claude plan', 'Steps 1–4 are needed only the first time (the same as way B).'), ...claudeCurriculumSteps(acc),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      }
      /* ---------- B: the Claude app / website + connector ---------- */
      function wayB() {
        box.innerHTML = '';
        box.append(back(), brandHead('💬 Use the Claude app or website', 'Steps 1–4 are needed only the first time. Works the same on Windows, Mac, Linux, iPhone and Android.'),
          ...claudeAppSteps(acc),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      }
      if (way === 'A') wayA(); else if (way === 'B') wayB(); else if (way === 'C') wayC(); else home();
    });
  }

  /** Supabase OAuth 2.1 consent page for the Claude connector: <site>/oauth/consent?authorization_id=… */
  async function connectClaude(authId) {
    document.body.classList.remove('noema-booting'); document.getElementById('noema-splash')?.remove();
    const fail = msg => overlay(box => box.append(brandHead('Connect Claude', ''), el('p', {}, '⚠️ ' + msg), el('div', { class: 'row noema-ovfoot' }, el('a', { class: 'btn small', href: location.pathname }, 'Open noema-lite'))), { closable: false });
    if (!window.NoemaCloud || !CFG.supabaseUrl) return fail('This noema-lite installation has no cloud accounts.');
    if (!NoemaCloud.session()) await new Promise(res => overlay((box, close) => {
      const intro = () => { box.innerHTML = ''; box.append(brandHead('🔗 Connect Claude', 'Sign in to the noema-lite account Claude should save your subjects to.'), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary', onclick: () => cloudForm(box, () => { close(); res(); }, intro) }, '☁️ Sign in'))); };
      intro();
    }, { closable: false }));
    let det;
    try { det = await NoemaCloud.oauthDetails(authId); } catch (e) { return fail('This connection request is invalid or has expired (' + e.message + '). Start again from Claude.'); }
    if (det && det.redirect_url && !det.client) { location.assign(det.redirect_url); return; }
    const who = NoemaCloud.session()?.user?.email || '';
    const back = (() => { try { return new URL(det.redirect_uri || det.redirect_url || '').host; } catch (e) { return ''; } })();
    overlay(box => {
      const go = async (action, b) => {
        b.disabled = true;
        try { const r = await NoemaCloud.oauthConsent(authId, action); const to = r?.redirect_url || r?.redirect_to; if (to) location.assign(to); else box.append(el('p', {}, action === 'approve' ? '✅ Connected — go back to Claude.' : 'Cancelled.')); }
        catch (e) { b.disabled = false; box.append(el('p', { class: 'tiny' }, '⚠️ ' + e.message)); }
      };
      box.append(brandHead('🔗 Connect Claude to noema-lite', who ? 'Signed in as ' + who : ''),
        el('div', { class: 'noema-form' },
          el('p', {}, el('b', {}, det?.client?.client_name || 'Claude'), ' wants to use your noema-lite account.'),
          el('ul', { class: 'noema-consent' }, el('li', {}, '✅ list your subjects'), el('li', {}, '✅ create and update your private subject packs'), el('li', {}, '✅ read your curricula and send their map, chapter plans and prepared steps (you see them arrive in noema-lite)'),
            el('li', {}, '🚫 it gets only the connector’s tools: no access to your conversations, progress or keys through them')),
          back ? el('p', { class: 'tiny' }, 'After approving you return to ', el('b', {}, back), '.') : null,
          el('div', { class: 'row' }, el('button', { class: 'btn', onclick: e => go('deny', e.currentTarget) }, 'Deny'), el('button', { class: 'btn primary', onclick: e => go('approve', e.currentTarget) }, 'Allow'))));
    }, { closable: false });
  }

  /* ---------------- backups & restore ---------------- */
  const Backup = {
    async collect(acc, { includeSecrets = false } = {}) {
      const a = getAccount(acc) || { id: acc };
      const data = KV.accountData(acc);
      if (data['a:settings']) { try { const s = JSON.parse(data['a:settings']); delete s.apiKey; if (includeSecrets && GeminiKey.get(acc)) s.apiKey = GeminiKey.get(acc); data['a:settings'] = JSON.stringify(s); } catch (e) { } }   // the Gemini key lives on the device (GeminiKey)
      const packs = (await importedPacks(acc)).map(p => ({ id: p.subject.id, pack: p }));
      const conversations = window.NoemaConvos ? await NoemaConvos.list(acc, { includeDeleted: true }).catch(() => []) : [];
      return { format: 'noema-lite-backup', version: 2, conversationSchema: window.NoemaConvos?.SCHEMA, conversations, app: CFG.appName, appVersion: VERSION, createdAt: new Date().toISOString(),
        account: { id: a.id, name: a.name, emoji: a.emoji, kind: a.kind || 'local', email: a.email || null }, includesSecrets: !!includeSecrets, data, importedPacks: packs };
    },
    fileName(acc) { return `noema-lite-backup_${acc}_${stamp()}.json`; },
    download(obj) { jset(`${P}${obj.account.id}:meta:lastDownloadBackup`, Date.now()); const b = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }); const u = URL.createObjectURL(b); const x = el('a', { href: u, download: this.fileName(obj.account.id) }); document.body.append(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); },
    validate(obj) {
      if (obj && (obj.format === 'noema-lite-backup' || LEGACY.backupFormats.includes(obj.format)) && obj.data) return obj;
      // legacy single-file app export (Databricks Quest): {xp, res, read, settings, ...}
      if (obj && obj.res && obj.settings && typeof obj.xp === 'number') {
        const settings = obj.settings; const st = { ...obj }; delete st.settings; st.srcOn = settings.srcOn || null; delete settings.srcOn;
        return { format: 'noema-lite-backup', version: 1, legacy: true, createdAt: new Date().toISOString(), account: { id: '?', name: 'legacy export' }, data: { 'a:settings': JSON.stringify(settings), 's:databricks:state': JSON.stringify(st) }, importedPacks: [] };
      }
      throw new Error('Not a noema-lite backup file.');
    },
    async restorePoint(acc, label) { const snap = await this.collect(acc, { includeSecrets: true }); const key = acc + '|' + Date.now(); await IDB.put('restore', key, { label, at: Date.now(), snap }); const all = (await IDB.entries('restore', acc + '|')).sort((x, y) => x[1].at - y[1].at); while (all.length > 12) { const [k] = all.shift(); await IDB.del('restore', k); } return key; },
    async listRestorePoints(acc) { try { return (await IDB.entries('restore', acc + '|')).map(([k, v]) => ({ key: k, label: v.label, at: v.at, size: JSON.stringify(v.snap).length })).sort((a, b) => b.at - a.at); } catch (e) { return []; } },
    async getRestorePoint(key) { return (await IDB.get('restore', key))?.snap; },
    /** mode: 'replace' (wipe target profile, then write) | 'merge' (overwrite keys present in backup) */
    async apply(obj, targetAcc, mode = 'replace') {
      obj = this.validate(obj);
      await this.restorePoint(targetAcc, 'Before restore ' + new Date().toLocaleString());
      const pre = `${P}${targetAcc}:`;
      if (mode === 'replace') ls.keys(pre).forEach(k => { if (!k.slice(pre.length).startsWith('meta:')) ls.del(k); });
      for (const [suf, val] of Object.entries(obj.data)) {
        let v = val;
        if (suf === 'a:settings') { try { const nv = JSON.parse(val); if (obj.includesSecrets && nv.apiKey) GeminiKey.set(targetAcc, nv.apiKey); delete nv.apiKey; v = JSON.stringify(nv); } catch (e) { } }   // without secrets: this device's key stays
        KV.set(pre + suf, typeof v === 'string' ? v : JSON.stringify(v));
      }
      for (const p of obj.importedPacks || []) await IDB.put('packs', targetAcc + '|' + p.id, p.pack);
      if (window.NoemaConvos) {
        if (mode === 'replace') await NoemaConvos.clear(targetAcc);
        const a = getAccount(targetAcc) || { id: targetAcc };
        for (const r of obj.conversations || []) await NoemaConvos.put(targetAcc, { ...r, account: { id: a.id, kind: a.kind || 'local' } }, { keepUpdatedAt: true });
        // v1 backups / legacy kv conversations are converted on next start (migrateLegacy)
        if (mode === 'replace') ls.del(`${P}${targetAcc}:meta:convosMigrated`);
      }
      return true;
    },
  };

  /* ---------------- auto-backup to a folder (File System Access API: Chrome / Edge) ---------------- */
  const AutoBackup = {
    supported: () => 'showDirectoryPicker' in window,
    timer: null, status: 'off', lastAt: null,
    async handle(acc) { try { return await IDB.get('handles', 'dir|' + acc); } catch (e) { return null; } },
    async choose(acc) {
      const h = await window.showDirectoryPicker({ id: 'noema-backups', mode: 'readwrite' });
      await IDB.put('handles', 'dir|' + acc, h); this.status = 'on'; await this.run(acc, true); this.start(acc); return h.name;
    },
    async disable(acc) { await IDB.del('handles', 'dir|' + acc); this.status = 'off'; clearInterval(this.timer); },
    async permitted(h, ask = false) { if (!h) return false; const o = { mode: 'readwrite' }; if ((await h.queryPermission(o)) === 'granted') return true; if (ask && (await h.requestPermission(o)) === 'granted') return true; return false; },
    async run(acc, force = false) {
      const h = await this.handle(acc); if (!h) { this.status = 'off'; return false; }
      if (!(await this.permitted(h))) { this.status = 'needs-permission'; return false; }
      const dirty = jget(`${P}${acc}:meta:dirty`, 0), last = jget(`${P}${acc}:meta:lastFolderBackup`, 0);
      if (!force && dirty <= last) return true;
      // canonical folder layout:  <chosen>/backups/noema-lite-backup_<acc>_<day>.json (+ _latest)   <chosen>/conversations/<subject>/<YYYY-MM>/<id>.json|.md
      const bdir = await h.getDirectoryHandle('backups', { create: true });
      const obj = await Backup.collect(acc);
      const day = new Date().toISOString().slice(0, 10);
      for (const name of [`noema-lite-backup_${acc}_${day}.json`, `noema-lite-backup_${acc}_latest.json`]) {
        const fh = await bdir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(JSON.stringify(obj, null, 1)); await w.close();
      }
      if (window.NoemaConvos) await NoemaConvos.writeToFolder(acc, h, { all: force && !jget(`${P}${acc}:meta:convosFolderSeeded`, 0) }).then(() => jset(`${P}${acc}:meta:convosFolderSeeded`, 1));
      jset(`${P}${acc}:meta:lastFolderBackup`, Date.now()); this.lastAt = Date.now(); this.status = 'on'; return true;
    },
    async start(acc) {
      clearInterval(this.timer);
      const h = await this.handle(acc); if (!h) { this.status = 'off'; return; }
      this.status = (await this.permitted(h)) ? 'on' : 'needs-permission';
      this.timer = setInterval(() => this.run(acc).catch(() => { }), Math.max(1, CFG.autoBackupMinutes) * 60e3);
      // conversations are written to the folder within ~20 s of any change (independently of the 5-minute backup)
      if (window.NoemaConvos && !this._convoHook) { this._convoHook = true; let t; NoemaConvos.onChange(a => { if (a !== acc) return; clearTimeout(t); t = setTimeout(async () => { const hd = await this.handle(acc); if (hd && await this.permitted(hd)) NoemaConvos.writeToFolder(acc, hd).catch(e => console.warn('[Noema] convo folder write', e)); }, 20000); }); }
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.run(acc).catch(() => { }); });
    },
  };

  /* ---------------- public API ---------------- */
  const Noema = window.Noema = {
    version: VERSION, config: CFG, local: LOCAL, registry: REG, kv: KV, geminiKey: GeminiKey, stats: Stats, idb: IDB, backup: Backup, autoBackup: AutoBackup,
    account: null, subject: null, pack: null, el, esc, jget, jset, convos: window.NoemaConvos || null, preloadedConvos: [],
    accounts: allAccounts, getAccount, saveLocalAccount, subjectsFor, pickSubject, pickAccount, importPackFile, importPack, exportPackage, overlay, claudeSetupView: (acc, opts) => claudeSetupView(acc, opts || {}), claudeGuide: opts => claudeGuide(Noema.account?.id || KV.acc, opts || {}), notes: Notes, shareRow,
    share(s) { return shareDialog(Noema.account.id, s); },
    editSubject(s, o) { return editSubject(Noema.account.id, s, o); }, deleteSubject(s) { return deleteSubject(Noema.account.id, s); }, setHidden(id, h) { return setHidden(Noema.account.id, id, h); },
    toast: toastL, getPackById: (acc, id) => getPack(acc, { id, origin: 'imported' }),
    curricula() { return window.NoemaCurMap?.library(Noema.account.id); }, curriculumMap(cid, focus) { return window.NoemaCurMap?.map(Noema.account.id, cid, { focus }); }, explore() { return explore(Noema.account.id); }, infoCard, packInfo,
    removeLocalAccount(id) { const rm = jget(P + 'accounts:removed', []); rm.push(id); jset(P + 'accounts:removed', rm); jset(P + 'accounts', jget(P + 'accounts', []).filter(a => a.id !== id)); },
    wipeAccountData(id) { ls.keys(`${P}${id}:`).forEach(k => ls.del(k)); },
    setCurrent(acc, subj) { jset(P + 'current', { acc, subj }); },
    switchTo(acc, subj) { jset(P + 'current', { acc, subj, skipPicker: !!subj }); if (/[?&](subject|account)=/.test(location.search)) { location.replace(location.pathname); return; } location.hash = ''; location.reload(); },   // a ?subject= link must not win over the new choice
    async openSubjectPicker() { const s = await pickSubject(Noema.account.id, { closable: true }); if (s && s.id !== Noema.subject.id) Noema.switchTo(Noema.account.id, s.id); },
    async openAccountPicker() { const a = await pickAccount({ closable: true }); if (a && a.id !== Noema.account.id) Noema.switchTo(a.id, null); },
  };

  /* ---------------- boot ---------------- */
  async function start() {
    document.body.classList.add('noema-booting');
    migrateOldPrefix(); try { await migrateOldIDB(); } catch (e) { console.warn('[noema] old browser database not migrated', e); }
    if (CFG.supabaseUrl && (CFG.supabaseKey || CFG.supabaseAnonKey) && window.NoemaCloud) { try { await NoemaCloud.init(CFG); } catch (e) { console.warn('[Noema] cloud init failed', e); } }
    const url = new URLSearchParams(location.search);
    if (url.get('authorization_id')) return connectClaude(url.get('authorization_id'));   // OAuth consent for the Claude connector
    const cur = jget(P + 'current', {});
    let acc = getAccount(url.get('account') || cur.acc);
    const accs = allAccounts();
    if (!acc) acc = accs.length === 1 ? accs[0] : await pickAccount();
    KV.acc = acc.id; Noema.account = acc;
    GeminiKey.migrate(acc.id);   // before the first pull, so a synced a:settings never replaces the only copy of the key
    if (acc.kind === 'cloud' && window.NoemaCloud) { try { await Promise.race([NoemaCloud.pull(acc.id), new Promise(r => setTimeout(r, 7000))]); } catch (e) { console.warn('[Noema] cloud pull failed — using local cache', e); } }
    if (window.NoemaCloud && acc.kind === 'cloud') NoemaCloud.startAutoSync(acc.id);   // already in the pickers: curricula and shares change keys there
    Notes.start(acc.id);
    try { window.NoemaCurriculum?.Gen.start(acc.id); window.NoemaCurJobs?.App.start(acc.id); } catch (e) { console.warn('[curriculum]', e); }   // prepares the next curriculum steps in the background; picks up what the Claude app did
    const subs = await subjectsFor(acc.id);
    let meta = subs.find(s => s.id === (url.get('subject') || (cur.acc === acc.id ? cur.subj : null)));
    const settings = jget(KV.accountKey('settings'), {});
    const ask = settings.askSubjectOnStart ?? CFG.askSubjectOnStart;
    if (!meta || (ask && !cur.skipPicker && !url.get('subject'))) meta = await pickSubject(acc.id) || meta;
    if (!meta) return;
    KV.subj = meta.id;
    Noema.setCurrent(acc.id, meta.id);
    migrateLegacy(acc.id, meta.id);
    jset(`${P}${acc.id}:meta:sessions`, (jget(`${P}${acc.id}:meta:sessions`, 0) || 0) + 1);
    if (window.NoemaConvos) {
      try { await NoemaConvos.migrateLegacy(acc.id, subs); } catch (e) { console.warn('[Noema] conversation migration', e); }
      if (acc.kind === 'cloud' && window.NoemaCloud) { try { await Promise.race([NoemaCloud.pullConvos(acc.id), new Promise(r => setTimeout(r, 5000))]); } catch (e) { console.warn('[Noema] conversation pull failed', e); } }
      try { Noema.preloadedConvos = await NoemaConvos.list(acc.id, { subject: meta.id, includeDeleted: false }); } catch (e) { Noema.preloadedConvos = []; }
    }
    let pack;
    try { pack = await getPack(acc.id, meta); } catch (e) { document.body.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '⚠️'), el('p', {}, e.message), el('button', { class: 'btn', onclick: () => Noema.switchTo(acc.id, null) }, 'Choose another subject'))); return; }
    Noema.pack = pack; Noema.subject = Object.assign({ tutor: {}, hero: {}, features: {} }, pack.subject, subjOverride(acc.id, pack.subject.id));
    Noema.node = pack.curriculum || (meta.curriculum ? { id: meta.curriculum, node: meta.node } : null);   // a curriculum step?
    window.COURSE = pack.chapters; window.SOURCES = pack.sources || { sources: [], chapters: {}, patches: {} };
    document.title = `${Noema.subject.title} · ${CFG.appName}`;
    document.documentElement.lang = Noema.subject.language || 'en';   // correct capitals, hyphenation and fonts for the subject's language (e.g. Greek without accents in CAPS)
    if (Noema.subject.features?.math) await ensureMath();
    // start the engine
    const inline = document.getElementById('noema-engine-src');
    if (inline) { const s = document.createElement('script'); s.textContent = inline.textContent; document.body.append(s); }
    else await loadScript((window.NOEMA_ENGINE_BASE || 'engine/') + 'engine.js');
    document.body.classList.remove('noema-booting');
    document.getElementById('noema-splash')?.remove();
    if (window.NoemaCloud && acc.kind === 'cloud') NoemaCloud.startAutoSync(acc.id);
    AutoBackup.start(acc.id).catch(() => { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
