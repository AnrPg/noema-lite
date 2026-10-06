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
    imported.forEach(p => { const m = p.subject; if (!list.some(s => s.id === m.id)) list.push({ ...m, origin: 'imported', counts: p.counts || countPack(p), version: p.version }); });
    // imported packs known from synced metadata (e.g. imported on another device, stored in the cloud)
    ls.keys(`${P}${acc}:a:packmeta:`).forEach(k => { const m = jget(k, null); if (m && !list.some(s => s.id === m.id)) list.push({ ...m, origin: 'imported' }); });
    return list.map(s => ({ ...s, hidden: hidden.has(s.id) }));
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
  async function getPack(acc, meta) {
    window.NOEMA_PACKS = window.NOEMA_PACKS || {};
    if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id];
    if (meta.origin === 'imported') { const p = await IDB.get('packs', acc + '|' + meta.id); if (p) return p; }
    if (meta.path) { await loadScript(meta.path); if (window.NOEMA_PACKS[meta.id]) return window.NOEMA_PACKS[meta.id]; }
    if (window.NoemaCloud && NoemaCloud.session()) { const p = await NoemaCloud.downloadPack(meta.id).catch(() => null); if (p) { await IDB.put('packs', acc + '|' + meta.id, p).catch(() => { }); return p; } }
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
  function pickAccount({ closable = false } = {}) {
    return new Promise(resolve => {
      overlay((box, close) => {
        const draw = () => {
          box.innerHTML = '';
          const accs = allAccounts();
          box.append(brandHead(CFG.appName, 'Who is studying?'),
            el('div', { class: 'noema-accgrid' }, ...accs.map((a, i) => el('button', { class: 'noema-acc', style: { animationDelay: i * 50 + 'ms' }, onclick: async () => {
              if (a.pin) { const pin = await askPin(box, a); if (!pin) return; if ((await sha256(a.id + ':' + pin)) !== a.pin) { toastL('Wrong PIN'); return; } }
              close(); resolve(a);
            } }, el('span', { class: 'noema-accemo' }, a.emoji || '🙂'), el('b', {}, a.name), el('small', {}, a.kind === 'cloud' ? '☁️ ' + a.email : (a.pin ? '🔒 local profile' : 'local profile')))),
              el('button', { class: 'noema-acc add', onclick: () => newProfileForm(box, a => { saveLocalAccount(a); close(); resolve(getAccount(a.id)); }, draw) }, el('span', { class: 'noema-accemo' }, '➕'), el('b', {}, 'New profile'), el('small', {}, 'on this device'))),
            CFG.supabaseUrl && window.NoemaCloud && !NoemaCloud.session() ? el('div', { class: 'noema-cloudrow' }, el('button', { class: 'btn ai', onclick: () => cloudForm(box, acc => { close(); resolve(acc); }, draw) }, '☁️ Sign in / create a cloud account'), el('span', { class: 'tiny' }, 'Study from any device — progress syncs automatically.')) : null);
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
    const subs = (await subjectsFor(acc)).filter(s => !s.hidden);
    const groups = (REG.groups || []).slice(); if (!groups.some(g => g.id === 'other')) groups.push({ id: 'other', title: 'Other', emoji: '✨' });
    const a = getAccount(acc) || { name: acc, emoji: '🙂' };
    return new Promise(resolve => {
      overlay((box, close) => {
        const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 Search subjects…', oninput: () => draw() });
        const list = el('div');
        const draw = () => {
          list.innerHTML = '';
          const term = q.value.trim().toLowerCase();
          let n = 0;
          groups.forEach(g => {
            const items = subs.filter(s => (groups.some(x => x.id === s.group) ? s.group : 'other') === g.id && (!term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term)));
            if (!items.length) return;
            list.append(el('div', { class: 'noema-group' }, el('div', { class: 'noema-grouphead' }, `${g.emoji || ''} ${g.title}`),
              el('div', { class: 'noema-chips' }, ...items.map(s => { n++; const pct = Math.round(subjectProgress(acc, s) * 100); return el('button', { class: 'noema-chip' + (s.id === KV.subj ? ' on' : ''), style: { animationDelay: n * 35 + 'ms' }, title: s.description || '', onclick: () => { close(); resolve(s); } },
                el('span', { class: 'e' }, s.emoji || '📘'), el('span', { class: 't' }, s.title), s.origin !== 'library' ? el('span', { class: 'o' }, s.origin === 'private' ? '🔒' : '📥') : null, pct ? el('span', { class: 'p' }, pct + '%') : null); }))));
          });
          if (!n) list.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '📭'), el('p', {}, subs.length ? 'No subject matches.' : 'No subjects yet. Hand your sources to Claude to generate a subject pack, then import it here.')));
        };
        const imp = el('label', { class: 'btn small' }, '📥 Import subject pack', el('input', { type: 'file', accept: '.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await importPackFile(acc, e.target.files[0]); close(); resolve(s); } catch (er) { toastL('⚠️ ' + er.message, 4000); } } }));
        box.append(brandHead('What do you want to study?', `${a.emoji || ''} ${a.name}`), q, list,
          el('div', { class: 'row noema-ovfoot' }, imp, el('button', { class: 'btn small ghost', onclick: async () => { close(); const na = await pickAccount({ closable: true }); if (na) { Noema.switchTo(na.id, null); } } }, '👤 Switch profile'),
            closable ? el('button', { class: 'btn small', onclick: () => { close(); resolve(null); } }, 'Close') : null));
        draw(); if (subs.length > 8) setTimeout(() => q.focus(), 300);
      }, { closable });
    });
  }
  async function importPackFile(acc, file) {
    const p = JSON.parse(await file.text());
    if (LEGACY.packFormats.includes(p.format)) p.format = 'noema-pack';
    if (p.format !== 'noema-pack' || !p.subject?.id || !Array.isArray(p.chapters)) throw new Error('This file is not a noema-lite subject pack.');
    p.counts = p.counts || countPack(p);
    await IDB.put('packs', acc + '|' + p.subject.id, p);
    KV.set(KV.accountKey('packmeta:' + p.subject.id, acc), JSON.stringify({ ...p.subject, counts: p.counts, version: p.version || null }));
    if (window.NoemaCloud && NoemaCloud.session() && acc === 'u_' + NoemaCloud.session().user.id) NoemaCloud.uploadPack(p).catch(e => console.warn(e));
    toastL(`📥 “${p.subject.title}” imported`);
    return { ...p.subject, origin: 'imported', counts: p.counts };
  }

  /* ---------------- backups & restore ---------------- */
  const Backup = {
    async collect(acc, { includeSecrets = false } = {}) {
      const a = getAccount(acc) || { id: acc };
      const data = KV.accountData(acc);
      if (!includeSecrets && data['a:settings']) { try { const s = JSON.parse(data['a:settings']); delete s.apiKey; data['a:settings'] = JSON.stringify(s); } catch (e) { } }
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
        if (suf === 'a:settings' && !obj.includesSecrets) { try { const cur = jget(pre + 'a:settings', {}); const nv = JSON.parse(val); if (cur.apiKey && !nv.apiKey) nv.apiKey = cur.apiKey; v = JSON.stringify(nv); } catch (e) { } }
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
    version: VERSION, config: CFG, local: LOCAL, registry: REG, kv: KV, stats: Stats, idb: IDB, backup: Backup, autoBackup: AutoBackup,
    account: null, subject: null, pack: null, el, esc, jget, jset, convos: window.NoemaConvos || null, preloadedConvos: [],
    accounts: allAccounts, getAccount, saveLocalAccount, subjectsFor, pickSubject, pickAccount, importPackFile, overlay,
    removeLocalAccount(id) { const rm = jget(P + 'accounts:removed', []); rm.push(id); jset(P + 'accounts:removed', rm); jset(P + 'accounts', jget(P + 'accounts', []).filter(a => a.id !== id)); },
    wipeAccountData(id) { ls.keys(`${P}${id}:`).forEach(k => ls.del(k)); },
    setCurrent(acc, subj) { jset(P + 'current', { acc, subj }); },
    switchTo(acc, subj) { jset(P + 'current', { acc, subj, skipPicker: !!subj }); location.hash = ''; location.reload(); },
    async openSubjectPicker() { const s = await pickSubject(Noema.account.id, { closable: true }); if (s && s.id !== Noema.subject.id) Noema.switchTo(Noema.account.id, s.id); },
    async openAccountPicker() { const a = await pickAccount({ closable: true }); if (a && a.id !== Noema.account.id) Noema.switchTo(a.id, null); },
  };

  /* ---------------- boot ---------------- */
  async function start() {
    document.body.classList.add('noema-booting');
    migrateOldPrefix(); try { await migrateOldIDB(); } catch (e) { console.warn('[noema] old browser database not migrated', e); }
    if (CFG.supabaseUrl && (CFG.supabaseKey || CFG.supabaseAnonKey) && window.NoemaCloud) { try { await NoemaCloud.init(CFG); } catch (e) { console.warn('[Noema] cloud init failed', e); } }
    const url = new URLSearchParams(location.search);
    const cur = jget(P + 'current', {});
    let acc = getAccount(url.get('account') || cur.acc);
    const accs = allAccounts();
    if (!acc) acc = accs.length === 1 ? accs[0] : await pickAccount();
    KV.acc = acc.id; Noema.account = acc;
    if (acc.kind === 'cloud' && window.NoemaCloud) { try { await Promise.race([NoemaCloud.pull(acc.id), new Promise(r => setTimeout(r, 7000))]); } catch (e) { console.warn('[Noema] cloud pull failed — using local cache', e); } }
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
    Noema.pack = pack; Noema.subject = Object.assign({ tutor: {}, hero: {}, features: {} }, pack.subject);
    window.COURSE = pack.chapters; window.SOURCES = pack.sources || { sources: [], chapters: {}, patches: {} };
    document.title = `${Noema.subject.title} · ${CFG.appName}`;
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
