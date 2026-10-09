/* =====================================================================================
   noema-lite — cloud adapter (Supabase: Auth + PostgREST + Storage), dependency-free.
   Every row/object is owned by the signed-in user and protected by row-level security
   (see cloud/supabase.sql). The browser only ever holds the public publishable key.
   Data model: noema_kv mirrors the local namespaced key/value store of a cloud account
   (key = suffix after "noema1:u_<uid>:"). Writes are compare-and-swap on each row's updated_at, copies changed on two
   devices are combined, and one device at a time is "in use" (see "key/value sync" and "one device at a time" below).
   ===================================================================================== */
(function () {
  'use strict';
  const SKEY = 'noema1:cloud:session';
  let CFG = null, BASE = '', KEY = '';   // KEY = the project's publishable key (sb_publishable_…) or legacy anon JWT
  const st = { syncing: false, lastSync: null, error: null, listeners: [], convoPending: new Set(), timer: null, ctimer: null, seq: 0, chain: null };
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const emit = () => st.listeners.forEach(f => { try { f(status()); } catch (e) { } });
  const status = () => ({ signedIn: !!session(), syncing: st.syncing, lastSync: st.lastSync, error: st.error, pending: (session() ? Object.keys(jget('noema1:' + (st.autoAcc || 'u_' + session().user.id) + ':meta:unsynced', {})).length : 0) + st.convoPending.size });
  function session() { return jget(SKEY, null); }
  function setSession(s) { if (s) { s.expires_at = s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600); jset(SKEY, { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: { id: s.user.id, email: s.user.email, user_metadata: s.user.user_metadata || {} } }); } else localStorage.removeItem(SKEY); }
  function errMsg(j, r) { return (j && (j.msg || j.message || j.error_description || j.error)) || `HTTP ${r.status}`; }
  async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false, keepalive = false } = {}) {
    if (auth) await fresh();
    const s = session();
    // Publishable keys (sb_publishable_…) are not JWTs: send them only as `apikey`; the Authorization header carries the user's session token.
    const bearer = auth && s ? s.access_token : (/^sb_/.test(KEY) ? null : KEY);
    const h = Object.assign({ apikey: KEY }, bearer ? { Authorization: 'Bearer ' + bearer } : {}, body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}, headers);
    const payload = body === undefined ? undefined : (body instanceof Blob || typeof body === 'string' ? body : JSON.stringify(body));
    const size = payload == null ? 0 : (payload instanceof Blob ? payload.size : payload.length * 3);
    if (keepalive && size > 60000) keepalive = false;      // browsers refuse keepalive bodies over 64 KB
    let r;
    try { r = await fetch(BASE + path, { method, headers: h, body: payload, keepalive }); }
    catch (e) { const er = new Error('Network error — are you offline? (' + e.message + ')'); er.network = true; throw er; }
    if (raw) { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) throw new Error(errMsg(j, r));
    return j;
  }
  async function fresh() {
    const s = session(); if (!s) throw new Error('Not signed in');
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false }).catch(e => { if (/invalid|expired|not found/i.test(e.message)) setSession(null); throw e; });
    setSession(j); return session();
  }
  const uid = () => session()?.user.id;
  const accId = () => 'u_' + uid();
  const enc = s => encodeURIComponent(s);
  // safety net: the Gemini key stays on the device (loader.js GeminiKey), so a:settings is never pushed with it
  const noSecrets = (k, v) => { if (k !== 'a:settings' || v == null) return v; try { const o = JSON.parse(v); if (o && typeof o === 'object' && 'apiKey' in o) { delete o.apiKey; return JSON.stringify(o); } } catch (e) { } return v; };
  // rows other writers append for the app to read and delete; never mirrored into localStorage
  const inboxKey = k => k.startsWith('a:curin:') || k.startsWith('a:curclaim:') || k.startsWith('a:inbox:') || k.startsWith('a:langin:') || k.startsWith('a:langclaim:');   // + language courses through Claude (docs/LANGUAGES.md §10.1)

  /** Two JSON copies of a curriculum record → `base` with the newer chapter plans of `other` (string), or null when nothing changes. */
  function mergeCurriculum(key, base, other) {
    if (!key.startsWith('a:curriculum:') || !window.NoemaCurriculum?.mergePlans) return null;
    try { const c = JSON.parse(base), o = JSON.parse(other); return window.NoemaCurriculum.mergePlans(c, o) ? JSON.stringify(c) : null; } catch (e) { return null; }
  }

  /* ---------- sync bookkeeping (per account, in localStorage so it survives reloads and is shared by the tabs) ---------- */
  const meta = (acc, name) => jget('noema1:' + acc + ':meta:' + name, {});
  const metaSave = (acc, name, v) => jset('noema1:' + acc + ':meta:' + name, v);
  const metaSet = (acc, name, f) => { const m = meta(acc, name); f(m); metaSave(acc, name, m); };
  const markDirty = (acc, k) => { metaSet(acc, 'unsynced', m => { m[k] = Date.now() * 1000 + (++st.seq % 1000); }); emit(); };
  const clean = (acc, k, mark) => { metaSet(acc, 'unsynced', m => { if (mark === undefined || m[k] === mark) delete m[k]; }); emit(); };   // only if not changed again meanwhile
  const put = (full, v) => { try { localStorage.setItem(full, v); return true; } catch (e) { st.full = true; return false; } };
  const FULL = 'This device’s storage is full: some changes from your other devices could not be saved here.';
  /** keys (full localStorage keys) another device changed → the open subject folds them into what it holds in memory (engine/src/10_core.js) */
  const notify = (acc, keys) => { try { dispatchEvent(new CustomEvent('noema:remote', { detail: { acc, keys } })); } catch (e) { } };
  const serial = fn => (st.chain = (st.chain || Promise.resolve()).catch(() => { }).then(fn));   // one pull or push at a time
  const isoAfter = prev => new Date(Math.max(Date.now(), (Date.parse(prev || '') || 0) + 1)).toISOString();   // a version stamp never equal to the one it replaces
  const isObj = x => x != null && typeof x === 'object' && !Array.isArray(x);
  const pj = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
  async function restorePoint(acc) {   // before combining drops anything: at most one every 10 minutes
    if (Date.now() - (st.rpAt || 0) < 10 * 60e3) return; st.rpAt = Date.now();
    try { await window.Noema?.backup?.restorePoint(acc, 'Before combining changes from another device'); } catch (e) { }
  }

  /* ---------- combining two copies of a key (progress only grows) ---------- */
  const perId = (x, y, pick) => { const o = { ...(y || {}) }; for (const [id, v] of Object.entries(x || {})) o[id] = id in o && isObj(v) && isObj(o[id]) ? pick(v, o[id]) : v; return o; };
  const moreTries = (x, y) => (x.n || 0) !== (y.n || 0) ? ((x.n || 0) > (y.n || 0) ? x : y) : ((x.t || 0) >= (y.t || 0) ? x : y);
  const laterReview = (x, y) => String(x.due || '') !== String(y.due || '') ? (String(x.due || '') > String(y.due || '') ? x : y) : ((x.box || 0) >= (y.box || 0) ? x : y);
  /** A subject's progress (s:<subject>:state): a = this device's copy (wins on plain settings), b = the other one. */
  function mergeState(a, b) {
    const ra = a.resetAt || 0, rb = b.resetAt || 0;
    if (ra !== rb) {   // reset on one side: the newer reset wins, plus the answers given after it on the other side
      const [n, o] = ra > rb ? [a, b] : [b, a]; const out = { ...n, res: { ...(n.res || {}) } };
      for (const [id, r] of Object.entries(o.res || {})) if (!(id in out.res) && (r?.t || 0) > n.resetAt) out.res[id] = r;
      return out;
    }
    const out = { ...b, ...a };
    for (const f of Object.keys(out)) {
      if (isObj(a[f]) && isObj(b[f])) out[f] = { ...b[f], ...a[f] };   // read sections, beaten bosses, applied inbox rows…: both
      else if (Array.isArray(a[f]) && Array.isArray(b[f])) out[f] = a[f].length >= b[f].length ? a[f] : b[f];
    }
    out.xp = Math.max(a.xp || 0, b.xp || 0);
    out.res = perId(a.res, b.res, moreTries); out.fc = perId(a.fc, b.fc, laterReview); out.pb = perId(a.pb, b.pb, laterReview);
    return out;
  }
  const maxMap = (x, y) => { const o = { ...(y || {}) }; for (const [k, v] of Object.entries(x || {})) o[k] = Math.max(v || 0, o[k] || 0); return o; };
  const sum = m => Object.values(m || {}).reduce((s, v) => s + (v || 0), 0);
  /** XP and streak across subjects (a:stats). */
  function mergeStats(a, b) {
    const xpDay = maxMap(a.xpDay, b.xpDay), top = (a.xp || 0) >= (b.xp || 0) ? a : b;
    const out = { ...b, ...a, xpDay, bySubject: maxMap(a.bySubject, b.bySubject), xp: (top.xp || 0) + Math.max(0, sum(xpDay) - sum(top.xpDay)) };
    const la = String(a.lastDay || ''), lb = String(b.lastDay || ''); const w = la === lb ? ((a.streak || 0) >= (b.streak || 0) ? a : b) : (la > lb ? a : b);
    out.lastDay = w.lastDay ?? null; out.streak = w.streak || 0;
    return out;
  }
  /* 🌍 language courses (s:lang:<course>:…, docs/LANGUAGES.md §5.6): progress only grows.
     A word's recognition and production tracks: the later review wins (on the same day the one with more answers);
     a lesson check keeps the best score and the most tries; a grammar function's log keeps every day (the fuller entry of a day). */
  const laterTrack = (x, y) => !isObj(x) ? y : !isObj(y) ? x : (x.last || 0) !== (y.last || 0) ? ((x.last || 0) > (y.last || 0) ? x : y)
    : ((x.reps || 0) + (x.lapses || 0) >= (y.reps || 0) + (y.lapses || 0) ? x : y);
  function mergeLangItem(a, b) {
    if (!isObj(a)) return b; if (!isObj(b)) return a;
    const o = { ...b, ...a }; if (a.seen != null && b.seen != null) o.seen = Math.min(a.seen, b.seen);
    for (const t of ['r', 'p']) { const v = laterTrack(a[t], b[t]); if (v) o[t] = v; }
    return o;
  }
  function mergeLang(k, a, b) {
    if (/:node:[^:]+$/.test(k)) {
      const items = { ...(b.items || {}) }; for (const [id, it] of Object.entries(a.items || {})) items[id] = mergeLangItem(it, items[id]);
      const out = { ...b, ...a, items }, ca = a.check, cb = b.check;
      if (isObj(ca) && isObj(cb)) { const n = (ca.day || 0) >= (cb.day || 0) ? ca : cb; out.check = { ...n, best: Math.max(ca.best || 0, cb.best || 0), tries: Math.max(ca.tries || 0, cb.tries || 0) }; }
      return out;
    }
    if (/:fn:[^:]+$/.test(k)) {
      const by = {}; for (const e of [...(b.log || []), ...(a.log || [])]) if (isObj(e) && (!by[e.day] || (e.n || 0) > (by[e.day].n || 0))) by[e.day] = e;
      return { ...b, ...a, log: Object.values(by).sort((x, y) => x.day - y.day).slice(-60) };
    }
    return null;   // settings, prefs: like any record
  }
  /** Two copies of key `k` (strings) → { value, lost }: `lost` = something only this device had may be dropped (a restore point is kept first). */
  function mergeValue(k, local, remote, localNewer) {
    if (local === remote) return { value: local, lost: false };
    if (k.startsWith('a:curriculum:')) {   // the newer copy, with the newest chapter plans of both
      const [nw, od] = localNewer ? [local, remote] : [remote, local]; const value = mergeCurriculum(k, nw, od) || nw;
      return { value, lost: !localNewer };
    }
    const a = pj(local), b = pj(remote);
    if (/^s:.+:state$/.test(k) && isObj(a) && isObj(b)) return { value: JSON.stringify(mergeState(a, b)), lost: false };
    if (k === 'a:stats' && isObj(a) && isObj(b)) return { value: JSON.stringify(mergeStats(a, b)), lost: false };
    if (k.startsWith('s:lang:') && isObj(a) && isObj(b)) { const m = mergeLang(k, a, b); if (m) return { value: JSON.stringify(m), lost: false }; }
    if (isObj(a) && isObj(b)) {   // settings and other records: every field of both, the newer copy wins where both set one
      const out = localNewer ? { ...b, ...a } : { ...a, ...b };
      return { value: JSON.stringify(out), lost: Object.keys(a).some(f => JSON.stringify(out[f]) !== JSON.stringify(a[f])) };
    }
    return localNewer ? { value: local, lost: false } : { value: remote, lost: true };
  }

  /** The cloud copy `cur` (null = deleted there) of a key this device changed too → combine into this device's copy. Returns the full key if it changed here. */
  async function resolve(acc, k, cur) {
    const pre = 'noema1:' + acc + ':', full = pre + k, local = localStorage.getItem(full), mark = meta(acc, 'unsynced')[k];
    if (!cur) { metaSet(acc, 'base', b => { delete b[k]; }); if (local == null) clean(acc, k, mark); return null; }   // deleted there: what this device has is uploaded again
    if (local == null || local === cur.value) {   // deleted here but changed there (keep the data), or the same content
      if (local == null && !put(full, cur.value)) return null;
      metaSet(acc, 'base', b => { b[k] = cur.updated_at; }); clean(acc, k, mark); return local == null ? full : null;
    }
    const mt = jget(pre + 'meta:mtime', {});
    const { value, lost } = mergeValue(k, local, cur.value, (mt[k] || 0) > (Date.parse(cur.updated_at) || 0));
    if (lost) await restorePoint(acc);
    if (localStorage.getItem(full) !== local) return null;   // changed again meanwhile: the next round combines that
    if (value !== local && !put(full, value)) return null;
    metaSet(acc, 'base', b => { b[k] = cur.updated_at; });
    if (value === cur.value) clean(acc, k, mark); else markDirty(acc, k);
    return value !== local ? full : null;
  }
  /** Upload one changed key, only over the cloud version this copy comes from; otherwise combine and try again. */
  async function pushKey(acc, k, mark, keepalive, tries = 0) {
    const b = meta(acc, 'base')[k], full = 'noema1:' + acc + ':' + k; let v = noSecrets(k, localStorage.getItem(full));
    if (v != null && k.startsWith('a:curriculum:') && !tries) {   // an older copy saved on this device keeps the cloud's chapter plans (they are stamped, so merging is safe)
      const row = ((await call('/rest/v1/noema_kv?select=value&key=eq.' + enc(k))) || [])[0];
      const m = row && mergeCurriculum(k, v, row.value); if (m && put(full, m)) { v = m; notify(acc, [full]); }
    }
    const q = '/rest/v1/noema_kv?key=eq.' + enc(k) + (b ? '&updated_at=eq.' + enc(b) : ''), rep = { Prefer: 'return=representation' };
    if (v == null) {
      if (!b) { clean(acc, k, mark); return; }   // never reached the cloud
      const r = await call(q, { method: 'DELETE', headers: rep, keepalive });
      if (Array.isArray(r) && r.length) { metaSet(acc, 'base', x => { delete x[k]; }); clean(acc, k, mark); return; }
    } else {
      const at = isoAfter(b);
      const r = b ? await call(q, { method: 'PATCH', body: { value: v, updated_at: at }, headers: rep, keepalive })
        : await call('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', body: [{ user_id: uid(), key: k, value: v, updated_at: at }], headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, keepalive });
      const row = Array.isArray(r) ? r[0] : null;
      if (row) { metaSet(acc, 'base', x => { x[k] = row.updated_at; }); clean(acc, k, mark); return; }
    }
    // refused: another device (or the Claude connector) changed it since this device last saw it
    if (tries >= 3) throw new Error(`“${k}” keeps changing on another device: trying again later`);
    const cur = ((await call('/rest/v1/noema_kv?select=key,value,updated_at&key=eq.' + enc(k))) || [])[0] || null;
    const changed = await resolve(acc, k, cur); if (changed) notify(acc, [changed]);
    const m = meta(acc, 'unsynced')[k]; if (m !== undefined) return pushKey(acc, k, m, keepalive, tries + 1);
  }

  /* ---------- one device at a time: the "in use" row (a:inuse, cloud only) ----------
     The tab the learner is using (visible, touched in the last 2 minutes) holds it and renews it every 30 s; a hidden or
     closed tab lets it go. Another device takes it silently when it is free or stale; while it is fresh, the other device
     shows "in use on …" (engine/loader.js) and nothing is saved there until the learner chooses "Use here". */
  const LEASE = 'a:inuse', FRESH = 2 * 60e3, BEAT = 30e3;
  const remoteOnly = k => inboxKey(k) || k === LEASE;
  const L = { state: 'unknown', holder: null, acc: null, lastInput: Date.now(), lastBeat: 0, at: null, busy: null };
  function deviceName() {
    const u = navigator.userAgent || '';
    const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android phone' : 'Android tablet')
      : /CrOS/.test(u) ? 'Chromebook' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows PC' : /Linux/.test(u) ? 'Linux PC' : 'another device';
    const br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
    return br ? os + ' · ' + br : os;
  }
  const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ME = (() => {
    let dev = null, sid = null;
    try { dev = localStorage.getItem('noema-device:id'); if (!dev) { dev = rnd(); localStorage.setItem('noema-device:id', dev); } } catch (e) { dev = rnd(); }
    try { sid = sessionStorage.getItem('noema:tab'); if (!sid) { sid = rnd(); sessionStorage.setItem('noema:tab', sid); } } catch (e) { sid = rnd(); }   // one per tab, kept across reloads
    return { dev, sid, name: deviceName() };
  })();
  const live = v => !!(v && !v.released && Date.now() - (v.at || 0) < FRESH);
  const activeHere = () => document.visibilityState === 'visible' && Date.now() - L.lastInput < FRESH;
  function setLease(state, holder) {
    const was = L.state; L.state = state; L.holder = holder ? { ...holder, sameDevice: holder.dev === ME.dev } : null;
    if (window.Noema?.kv) Noema.kv.frozen = state === 'other' ? L.acc : null;   // paused: this device saves nothing
    if (was !== state || state === 'other') try { dispatchEvent(new CustomEvent('noema:inuse', { detail: { state, holder: L.holder, unsynced: Object.keys(meta(L.acc, 'unsynced')).length } })); } catch (e) { }
  }
  async function leaseWrite(prevAt, v, keepalive = false) {
    const value = JSON.stringify(v), at = isoAfter(prevAt);
    const r = prevAt ? await call('/rest/v1/noema_kv?key=eq.' + LEASE + '&updated_at=eq.' + enc(prevAt), { method: 'PATCH', body: { value, updated_at: at }, headers: { Prefer: 'return=representation' }, keepalive })
      : await call('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', body: [{ user_id: uid(), key: LEASE, value, updated_at: at }], headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, keepalive });
    return Array.isArray(r) && r[0] ? r[0].updated_at : null;
  }
  async function leaseCheck(take) {
    const before = L.state;
    for (let i = 0; i < 3; i++) {
      const row = ((await call('/rest/v1/noema_kv?select=value,updated_at&key=eq.' + LEASE)) || [])[0] || null;
      const v = row ? pj(row.value) : null, mine = v?.sid === ME.sid;
      L.lastBeat = Date.now();
      if (!mine && live(v) && !take) { setLease('other', v); return 'other'; }   // in use elsewhere right now
      if (!take && !activeHere()) { setLease(mine ? 'mine' : 'unknown'); break; }   // nobody is using this tab: don't take it
      const at = await leaseWrite(row?.updated_at, { sid: ME.sid, dev: ME.dev, name: ME.name, at: Date.now() });
      if (!at) continue;   // someone wrote it in between: look again
      L.at = at; setLease('mine');
      if (v && !mine) L.tookOver = true;   // another tab or device had it: bring in what it did
      break;
    }
    if (before === 'other' && L.state !== 'other' || L.tookOver) {   // bring in what the other tab or device did, also when another tab of this browser already stored it
      L.tookOver = false; await NoemaCloud.pull(L.acc).catch(() => { });
      notify(L.acc, Object.keys(window.Noema?.kv?.accountData?.(L.acc) || {}).map(k => 'noema1:' + L.acc + ':' + k));
    }
    return L.state;
  }
  function leaseRelease() {
    if (L.state !== 'mine' || !L.at || !session()) return;
    const at = L.at; L.at = null; L.state = 'unknown';
    leaseWrite(at, { sid: ME.sid, dev: ME.dev, name: ME.name, at: Date.now(), released: true }, true).catch(() => { });
  }

  const NoemaCloud = window.NoemaCloud = {
    session, status, onStatus(f) { st.listeners.push(f); },
    /** A raw Supabase call as the signed-in user (row-level security applies) — e.g. engine/curshare.js. */
    api: (path, o) => call(path, o), uid,
    async init(cfg) { CFG = cfg; BASE = cfg.supabaseUrl.replace(/\/+$/, ''); KEY = cfg.supabaseKey || cfg.supabaseAnonKey || ''; if (session()) { try { await fresh(); } catch (e) { console.warn('[cloud] session refresh failed', e.message); } } },
    async signUp(email, password, name) {
      const j = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password, data: { name: name || email.split('@')[0] } } });
      const s = j.access_token ? j : (j.session || null);
      if (s && s.access_token) { setSession(s); await this.saveProfile({ name: name || email.split('@')[0] }); return { session: true }; }
      return { session: false };
    },
    async signIn(email, password) { const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }); setSession(j); return true; },
    async recover(email) { await call('/auth/v1/recover', { method: 'POST', auth: false, body: { email } }); },
    async signOut() { try { await call('/auth/v1/logout', { method: 'POST' }); } catch (e) { } setSession(null); emit(); },
    async saveProfile(p) {
      const row = { user_id: uid(), display_name: p.name || null, emoji: p.emoji || null, learner: p.learner || null, updated_at: new Date().toISOString() };
      await call('/rest/v1/noema_profiles?on_conflict=user_id', { method: 'POST', body: [row], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      jset('noema1:' + accId() + ':a:profile', { name: p.name, emoji: p.emoji, learner: p.learner });
    },

    /* ---------- key/value sync ----------
       Every device remembers, per key, the cloud version its copy comes from (meta:base = the row's updated_at) and which
       keys it changed since (meta:unsynced). A push only replaces the row if it is still that version (compare-and-swap),
       so no device can overwrite a newer copy, whatever its clock says. When both sides changed a key, the two copies are
       combined (progress only grows: mergeValue); a restore point is kept before anything could be dropped. */
    async pull(acc = accId()) { return serial(() => this._pull(acc)); },
    async _pull(acc) {
      st.syncing = true; emit();
      try {
        const rows = await call('/rest/v1/noema_kv?select=key,value,updated_at&order=key');
        const pre = 'noema1:' + acc + ':', base = meta(acc, 'base'), dirty = meta(acc, 'unsynced'), seen = new Set(), keys = [], conflicts = [];
        for (const r of rows || []) {
          if (remoteOnly(r.key)) continue;   // answers from the Claude app (read and deleted by engine/curjobs.js), its runs' claims, other apps' results (engine/src/15_inbox.js), the "in use" row: never stored here
          seen.add(r.key);
          if (base[r.key] === r.updated_at) continue;   // the cloud still has the version this copy comes from
          const local = localStorage.getItem(pre + r.key);
          // changed here too (or a copy that never synced with this version): combine; else simply take the cloud's
          if (r.key in dirty || (base[r.key] === undefined && local != null && local !== r.value)) { conflicts.push(r); continue; }
          // a curriculum keeps the chapter plans only this copy has (an older app or the connector may write a stale copy whole)
          const m = local != null && local !== r.value && mergeCurriculum(r.key, r.value, local), v = m || r.value;
          if (local !== v && !put(pre + r.key, v)) continue;   // storage full: try again next time
          if (local !== v) keys.push(pre + r.key);
          base[r.key] = r.updated_at; if (m) markDirty(acc, r.key);
        }
        for (const k of Object.keys(base)) if (!seen.has(k)) {   // deleted on another device
          if (!(k in dirty)) { if (localStorage.getItem(pre + k) != null) { localStorage.removeItem(pre + k); keys.push(pre + k); } }
          delete base[k];   // changed here since: it is uploaded again (keeping data beats losing it)
        }
        metaSave(acc, 'base', base);
        // data that never reached the cloud (made offline before this version, or the row was refused) → upload
        Object.keys(window.Noema?.kv?.accountData?.(acc) || {}).forEach(k => { if (!seen.has(k) && !(k in base) && !remoteOnly(k)) markDirty(acc, k); });
        for (const r of conflicts) { const k = await resolve(acc, r.key, r); if (k) keys.push(k); }
        st.lastSync = Date.now(); st.error = st.full ? FULL : null; st.full = false;
        if (keys.length) notify(acc, keys);
        try { dispatchEvent(new CustomEvent('noema:pulled', { detail: { acc, changed: keys.length, keys } })); } catch (e) { }   // e.g. the open subject reads its results inbox
        return keys.length;
      } catch (e) { st.error = e.message; throw e; } finally { st.syncing = false; emit(); }
    },
    async push(acc = accId(), { keepalive = false } = {}) {
      if (!session() || !Object.keys(meta(acc, 'unsynced')).length) return 0;
      if (keepalive) return this._push(acc, true);   // the page is going away: send now, don't wait for a pull in progress
      return serial(() => this._push(acc, false));
    },
    async _push(acc, keepalive) {
      const dirty = meta(acc, 'unsynced'), keys = Object.keys(dirty); if (!keys.length || !session()) return 0;
      st.syncing = true; emit();
      try {
        // the page is being hidden: every request leaves at once (keepalive), a slower loop could be cut off
        if (keepalive) await Promise.all(keys.map(k => pushKey(acc, k, dirty[k], true)));
        else for (const k of keys) await pushKey(acc, k, dirty[k], false);
        st.lastSync = Date.now(); st.error = null; return keys.length;
      } catch (e) { st.error = e.message; throw e; } finally { st.syncing = false; emit(); }
    },
    /** Combine two copies of a key (this device's and the cloud's) → { value, lost } — `lost`: something of `local` may be dropped. */
    mergeValue, mergeState, mergeLang,
    /** Rows whose key starts with `prefix` (e.g. the Claude app's answers, a:curin:) — read directly, not mirrored locally. */
    async kvRows(prefix) { return (await call('/rest/v1/noema_kv?select=key,value,updated_at&order=key&key=like.' + enc(prefix + '*'))) || []; },
    async kvDelete(key) { await call('/rest/v1/noema_kv?key=eq.' + enc(key), { method: 'DELETE' }); },
    /** One device at a time (see "in use" above): state 'mine' | 'other' | 'unknown', holder = { name, sameDevice, at } when 'other'. */
    lease: {
      get state() { return L.state; }, get holder() { return L.holder; }, device: ME,
      /** Look at the "in use" row and take it if nobody else is using Noema right now; take = true: take it anyway ("Use here"). */
      async check({ take = false } = {}) {
        if (!session() || !L.acc) return L.state;
        while (L.busy) await L.busy.catch(() => { });
        L.busy = leaseCheck(take); try { return await L.busy; } catch (e) { return L.state; } finally { L.busy = null; }   // offline: keep going, the changes are combined later
      },
      release: leaseRelease,
    },
    startAutoSync(acc) {
      if (!window.Noema || st.autoAcc === acc) return; st.autoAcc = acc; L.acc = acc;   // once per page
      // debounce 3 s, but never longer than 10 s after the first unsynced change (steady writes must not starve the sync)
      Noema.kv.listeners.push((key, a) => { if (a !== acc) return; const k = key.slice(('noema1:' + acc + ':').length); if (remoteOnly(k)) return; markDirty(acc, k); st.firstPending = st.firstPending || Date.now(); clearTimeout(st.timer); st.timer = setTimeout(() => { st.firstPending = null; this.push(acc).catch(() => { }); }, Math.max(0, Math.min(3000, 10000 - (Date.now() - st.firstPending)))); });
      const sync = () => this.lease.check().finally(() => this.pull(acc).then(() => this.push(acc)).catch(() => { }));
      // leaving: save what the open page holds first (engine/src/10_core.js flushSave), then send it, then let the "in use" row go
      const leave = () => { try { window.flushSave?.(); } catch (e) { } this.push(acc, { keepalive: true }).catch(() => { }); leaseRelease(); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); else { L.lastInput = Date.now(); sync(); } });
      addEventListener('pagehide', leave);
      addEventListener('online', () => { sync(); this.pushConvos(acc).catch(() => { }); });
      // the learner touches this tab: renew (or take) the "in use" row at most every 30 s
      const touched = () => { L.lastInput = Date.now(); if (L.state !== 'other' && Date.now() - L.lastBeat > BEAT) this.lease.check(); };
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, touched, { capture: true, passive: true }));
      // while paused, notice when the other device is put away; while in use, keep the row fresh
      setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - L.lastBeat > BEAT && (L.state === 'other' || activeHere())) this.lease.check(); }, 10e3);
      if (window.NoemaConvos) NoemaConvos.onChange((a, r) => { if (a !== acc) return; st.convoPending.add(r.id); clearTimeout(st.ctimer); st.ctimer = setTimeout(() => this.pushConvos(acc).catch(() => { }), 2500); emit(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.pushConvos(acc, { keepalive: true }).catch(() => { }); });
      this.lease.check().finally(() => this.push(acc).catch(() => { }));
      this.autoSnapshot().catch(() => { });
    },

    /* ---------- conversations (canonical noema.conversation/v1 records, one row each) ---------- */
    async pullConvos(acc = accId()) {
      const mk = 'noema1:' + acc + ':meta:convoPulledAt'; const since = jget(mk, null);
      let col = 'synced_at', rows;
      try { rows = await call(`/rest/v1/noema_conversations?select=record,updated_at,synced_at&order=synced_at.asc` + (since ? '&synced_at=gt.' + enc(since) : '')); }
      catch (e) { if (!/synced_at/.test(e.message)) throw e; col = 'updated_at'; rows = await call('/rest/v1/noema_conversations?select=record,updated_at&order=updated_at.asc' + (since ? '&updated_at=gt.' + enc(since) : '')); }
      let n = 0, last = since;
      for (const row of rows || []) {
        const r = row.record; if (!r || !r.id) continue;
        const local = await NoemaConvos.get(acc, r.id);
        if (!local || Date.parse(r.updatedAt) > Date.parse(local.updatedAt)) { await NoemaConvos.put(acc, r, { silent: true, keepUpdatedAt: true }); n++; }
        last = row[col] || row.updated_at;
      }
      if (last) jset(mk, last);
      return n;
    },
    async pushConvos(acc = accId(), { keepalive = false } = {}) {
      const ids = [...st.convoPending]; if (!ids.length || !session()) return 0;
      st.convoPending.clear();
      const rows = [];
      for (const id of ids) { const r = await NoemaConvos.get(acc, id); if (r) rows.push({ user_id: uid(), id: r.id, subject_id: r.subject?.id || null, kind: r.kind, mode: r.mode, title: r.title, context_label: r.context?.label || null, message_count: r.stats.messages, deleted: r.deleted, created_at: r.createdAt, updated_at: r.updatedAt, record: r }); }
      st.syncing = true; emit();
      try { for (let i = 0; i < rows.length; i += 20) await call('/rest/v1/noema_conversations?on_conflict=user_id,id', { method: 'POST', body: rows.slice(i, i + 20), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, keepalive }); st.lastSync = Date.now(); st.error = null; return rows.length; }
      catch (e) { ids.forEach(i => st.convoPending.add(i)); st.error = e.message; throw e; } finally { st.syncing = false; emit(); }
    },

    /* ---------- snapshots (cloud restore points of the whole account) ---------- */
    async snapshot(label = 'Manual snapshot') {
      const data = await Noema.backup.collect(accId(), { includeSecrets: false });
      await call('/rest/v1/noema_snapshots', { method: 'POST', body: [{ user_id: uid(), label, data, size_bytes: JSON.stringify(data).length }], headers: { Prefer: 'return=minimal' } });
      jset('noema1:' + accId() + ':meta:lastSnapshot', Date.now());
    },
    async listSnapshots() { return call('/rest/v1/noema_snapshots?select=id,label,created_at,size_bytes&order=created_at.desc&limit=60'); },
    async getSnapshot(id) { const r = await call('/rest/v1/noema_snapshots?select=data&id=eq.' + enc(id)); return r?.[0]?.data; },
    async deleteSnapshot(id) { await call('/rest/v1/noema_snapshots?id=eq.' + enc(id), { method: 'DELETE' }); },
    async autoSnapshot() {
      const last = jget('noema1:' + accId() + ':meta:lastSnapshot', 0);
      if (Date.now() - last < 20 * 3600e3) return;
      await this.snapshot('Daily auto-snapshot');
      const list = await this.listSnapshots();
      const autos = (list || []).filter(s => s.label === 'Daily auto-snapshot');
      for (const s of autos.slice(30)) await this.deleteSnapshot(s.id).catch(() => { });
    },

    /* ---------- private storage: imported subject packs + database backups ---------- */
    async uploadObject(path, blob, type) { return call(`/storage/v1/object/noema-private/${uid()}/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': type, 'x-upsert': 'true' } }); },
    async downloadObject(path) { const r = await call(`/storage/v1/object/authenticated/noema-private/${uid()}/${path}`, { raw: true }); return r; },
    /* ---------- big files: stored in parts (Supabase's free plan accepts ≤ 50 MB per object) ---------- */
    chunkBytes() { return (CFG && CFG.storageChunkBytes) || 45 * 1024 * 1024; },
    partPaths(path, chunks) { return chunks ? Array.from({ length: chunks }, (_, i) => `${path}.p${String(i).padStart(3, '0')}`) : [path]; },
    /** Upload a blob of any size to bucket/path (path = full object name in the bucket) → { chunks } (0 = one object). */
    async putFile(bucket, path, blob, type = 'application/octet-stream', { onProgress } = {}) {
      const C = this.chunkBytes(); const n = blob.size > C ? Math.ceil(blob.size / C) : 0;
      const parts = this.partPaths(path, n);
      for (let i = 0; i < parts.length; i++) {
        const body = n ? blob.slice(i * C, Math.min(blob.size, (i + 1) * C), 'application/octet-stream') : blob;
        await call(`/storage/v1/object/${bucket}/${parts[i].split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', body, headers: { 'Content-Type': n ? 'application/octet-stream' : (type || 'application/octet-stream'), 'x-upsert': 'true' } });
        onProgress && onProgress(i + 1, parts.length);
      }
      return { chunks: n };
    },
    /** Download what putFile stored (public buckets need no sign-in) → Blob */
    async getFile(bucket, path, chunks = 0, { isPublic = false, type = '' } = {}) {
      const blobs = [];
      for (const pth of this.partPaths(path, chunks)) {
        const enc2 = pth.split('/').map(encodeURIComponent).join('/');
        const r = isPublic ? await fetch(`${BASE}/storage/v1/object/public/${bucket}/${enc2}`) : await call(`/storage/v1/object/authenticated/${bucket}/${enc2}`, { raw: true });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        blobs.push(await r.blob());
      }
      return new Blob(blobs, { type: type || blobs[0]?.type || '' });
    },
    async listObjects(prefix) { return call('/storage/v1/object/list/noema-private', { method: 'POST', body: { prefix: `${uid()}/${prefix}`.replace(/\/+$/, ''), limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } } }); },
    async deleteObjects(bucket, paths) { return call(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes: paths } }); },
    async uploadPack(p) { return this.uploadObject(`packs/${p.subject.id}.json`, new Blob([JSON.stringify(p)], { type: 'application/json' }), 'application/json'); },
    async downloadPack(id) { const r = await this.downloadObject(`packs/${id}.json`); return r.json(); },
    async listPacks() { return (await this.listObjects('packs/')).filter(o => o.name.endsWith('.json')).map(o => o.name.replace(/\.json$/, '')); },
    /* ---------- sharing: public packs (everyone) and shares with one person (docs/SHARING.md) ---------- */
    publicPackUrl(owner, id) { return `${BASE}/storage/v1/object/public/noema-public/${owner}/${id}.json`; },
    async listPublic() { return call('/rest/v1/noema_public_packs?select=*&order=updated_at.desc', { auth: !!session() }); },
    /** files: [{ srcId, blob, name, type }] — the subject's source files go with it (pack.sharedFiles tells the receiver where). */
    async publish(pack, meta, { files = [], onProgress } = {}) {
      const id = pack.subject.id;
      if (files.length) { const up = await this.uploadShareFiles('noema-public', f => `${uid()}/${id}/sources/${f.safe}/file.${f.ext}`, files, onProgress); pack = { ...pack, sharedFiles: up.map }; meta = { ...meta, filePaths: up.paths, sourceFiles: files.length, sourceBytes: files.reduce((a, f) => a + f.blob.size, 0) }; }
      else meta = { ...meta, filePaths: [], sourceFiles: 0 };
      const old = ((await this.myPublished().catch(() => [])) || []).find(r => r.subject_id === id);
      const stale = (old?.meta?.filePaths || []).filter(x => !(meta.filePaths || []).includes(x)); if (stale.length) await this.deleteObjects('noema-public', stale).catch(() => { });
      await call(`/storage/v1/object/noema-public/${uid()}/${id}.json`, { method: 'POST', body: new Blob([JSON.stringify(pack)], { type: 'application/json' }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
      const row = { owner: uid(), subject_id: id, owner_name: meta.ownerName || null, title: pack.subject.title, emoji: pack.subject.emoji || null, description: pack.subject.description || null, language: pack.subject.language || null, meta, updated_at: new Date().toISOString() };
      await call('/rest/v1/noema_public_packs?on_conflict=owner,subject_id', { method: 'POST', body: [row], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    async unpublish(id) {
      const old = ((await this.myPublished().catch(() => [])) || []).find(r => r.subject_id === id);
      await call(`/rest/v1/noema_public_packs?owner=eq.${uid()}&subject_id=eq.${enc(id)}`, { method: 'DELETE' });
      await this.deleteObjects('noema-public', [`${uid()}/${id}.json`, ...(old?.meta?.filePaths || [])]).catch(() => { });
    },
    async myPublished() { return call(`/rest/v1/noema_public_packs?select=subject_id,title,updated_at,meta&owner=eq.${uid()}`); },
    /** Upload source files for sharing → { map: { srcId: { path, name, type, size, chunks } }, paths: [every object written] } */
    async uploadShareFiles(bucket, pathOf, files, onProgress) {
      const map = {}, paths = []; let k = 0;
      for (const f of files) {
        const safe = String(f.srcId).replace(/[^a-zA-Z0-9_-]/g, '_'); const ext = ((String(f.name).toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || 'bin');
        const path = pathOf({ ...f, safe, ext });
        const r = await this.putFile(bucket, path, f.blob, f.type, { onProgress: (i, n) => onProgress && onProgress(k + i / n, files.length, f.name) });
        map[f.srcId] = { path, name: f.name, type: f.type || '', size: f.blob.size, chunks: r.chunks }; paths.push(...this.partPaths(path, r.chunks)); k++;
      }
      return { map, paths };
    },
    async shareWith(email, pack, meta, message, { files = [], onProgress } = {}) {
      const to = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Please type a valid e-mail address.');
      if (to === (session()?.user?.email || '').toLowerCase()) throw new Error('That is your own e-mail address.');
      const u = session().user;
      const [row] = await call('/rest/v1/noema_shares', { method: 'POST', body: [{ from_user: uid(), from_email: u.email, from_name: meta.ownerName || u.user_metadata?.name || u.email, to_email: to, subject_id: pack.subject.id, title: pack.subject.title, meta, message: message || null }], headers: { Prefer: 'return=representation' } });
      try {
        // files are named <share-id>.<source>.<ext>: the storage rules give them to exactly the same two people as the pack
        if (files.length) {
          const up = await this.uploadShareFiles('noema-shared', f => `${row.id}.src-${f.safe}.${f.ext}`, files, onProgress);
          pack = { ...pack, sharedFiles: up.map };
          await call(`/rest/v1/noema_shares?id=eq.${row.id}`, { method: 'PATCH', body: { meta: { ...meta, filePaths: up.paths, sourceFiles: files.length, sourceBytes: files.reduce((a, f) => a + f.blob.size, 0) } }, headers: { Prefer: 'return=minimal' } });
        }
        await call(`/storage/v1/object/noema-shared/${row.id}.json`, { method: 'POST', body: new Blob([JSON.stringify(pack)], { type: 'application/json' }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
      }
      catch (e) { await call(`/rest/v1/noema_shares?id=eq.${row.id}`, { method: 'DELETE' }).catch(() => { }); throw e; }
      return row;
    },
    async incomingShares() { const me = (session()?.user?.email || '').toLowerCase(); if (!me) return []; return call(`/rest/v1/noema_shares?select=*&to_email=eq.${enc(me)}&status=eq.pending&order=created_at.desc`); },
    async outgoingShares() { return call(`/rest/v1/noema_shares?select=id,to_email,subject_id,title,status,created_at,responded_at,meta&from_user=eq.${uid()}&order=created_at.desc&limit=200`); },
    async downloadShared(id) { const r = await call(`/storage/v1/object/authenticated/noema-shared/${id}.json`, { raw: true }); return r.json(); },
    async answerShare(id, accept) { await call(`/rest/v1/noema_shares?id=eq.${id}`, { method: 'PATCH', body: { status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() }, headers: { Prefer: 'return=minimal' } }); },
    async revokeShare(id, filePaths = []) { await call(`/rest/v1/noema_shares?id=eq.${id}`, { method: 'PATCH', body: { status: 'revoked' }, headers: { Prefer: 'return=minimal' } }); await this.deleteObjects('noema-shared', [`${id}.json`, ...filePaths]).catch(() => { }); },

    /* ---------- 🩺 self-test against the REAL project with the signed-in account (cleans up after itself) ---------- */
    async selfTest(onStep = () => { }) {
      const out = [];
      const hint = e => {
        const m = String(e && e.message || e);
        if (/PGRST205|Could not find the table|does not exist|Bucket not found|schema cache|synced_at/i.test(m)) return 'The database is older than this app: Supabase → SQL Editor → run the newest cloud/supabase.sql once.';
        if (/JWT|401|Not signed in|invalid.*token|refresh/i.test(m)) return 'Your sign-in expired: sign out and sign in again.';
        if (/row-level security|403|permission/i.test(m)) return 'Permission rule refused it: run the newest cloud/supabase.sql (it resets the rules).';
        if (/Network|Failed to fetch|offline/i.test(m)) return 'No connection to Supabase: check the internet / config.js address.';
        return 'Unexpected — copy this line and give it to Claude.';
      };
      const step = async (name, fn) => {
        const t = Date.now(); onStep({ name, running: true });
        try { const note = await fn(); const r = { name, ok: true, ms: Date.now() - t, note: note || '' }; out.push(r); onStep(r); }
        catch (e) { const r = { name, ok: false, ms: Date.now() - t, error: String(e && e.message || e), hint: hint(e) }; out.push(r); onStep(r); }
      };
      const T = Date.now().toString(36), me = uid();
      await step('Signed in, token refresh', async () => { const s = session(); if (!s) throw new Error('Not signed in'); const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false }); setSession(j); return s.user.email; });
      await step('Profile', async () => { await call('/rest/v1/noema_profiles?select=user_id&limit=1'); });
      await step('Progress sync (key/value)', async () => {
        const key = 'meta:selftest-' + T;
        await call('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', body: [{ user_id: me, key, value: T, updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        const r = await call(`/rest/v1/noema_kv?select=value&key=eq.${enc(key)}`); if (r?.[0]?.value !== T) throw new Error('value did not come back');
        await call(`/rest/v1/noema_kv?key=eq.${enc(key)}`, { method: 'DELETE' });
      });
      await step('Conversations', async () => {
        const id = 'cv_selftest' + T, now = new Date().toISOString();
        await call('/rest/v1/noema_conversations?on_conflict=user_id,id', { method: 'POST', body: [{ user_id: me, id, kind: 'tutor', created_at: now, updated_at: now, record: { id, selftest: true } }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        const r = await call(`/rest/v1/noema_conversations?select=id,synced_at&id=eq.${enc(id)}`);
        await call(`/rest/v1/noema_conversations?id=eq.${enc(id)}`, { method: 'DELETE' });
        if (!r?.[0]) throw new Error('row did not come back'); if (!r[0].synced_at) throw new Error('column synced_at missing');
      });
      await step('Cloud snapshots', async () => {
        const [row] = await call('/rest/v1/noema_snapshots', { method: 'POST', body: [{ user_id: me, label: 'self-test ' + T, data: { selftest: true }, size_bytes: 20 }], headers: { Prefer: 'return=representation' } });
        await call('/rest/v1/noema_snapshots?id=eq.' + row.id, { method: 'DELETE' });
      });
      await step('Private files (packs, database)', async () => {
        const path = `selftest/${T}.json`;
        await this.uploadObject(path, new Blob([JSON.stringify({ T })], { type: 'application/json' }), 'application/json');
        const list = await this.listObjects('selftest'); if (!(list || []).some(o => o.name === T + '.json')) throw new Error('uploaded file not listed');
        const back = await (await this.downloadObject(path)).json(); if (back.T !== T) throw new Error('downloaded content differs');
        await this.deleteObjects('noema-private', [`${me}/${path}`]);
      });
      await step('Public subjects (Explore)', async () => {
        await call('/rest/v1/noema_public_packs?select=subject_id&limit=1');
        const path = `${me}/selftest-${T}.json`;
        await call(`/storage/v1/object/noema-public/${path}`, { method: 'POST', body: new Blob(['{"ok":1}'], { type: 'application/json' }), headers: { 'Content-Type': 'application/json' } });
        const r = await fetch(`${BASE}/storage/v1/object/public/noema-public/${path}`); const ok = r.ok;
        await this.deleteObjects('noema-public', [path]); if (!ok) throw new Error('public file not readable (bucket must be public)');
      });
      await step('Sharing with a person', async () => { await call('/rest/v1/noema_shares?select=id&limit=1'); await call('/storage/v1/object/list/noema-shared', { method: 'POST', body: { prefix: '', limit: 1 } }); });
      await step('Shared curricula', async () => { await call('/rest/v1/noema_curricula_shared?select=id&limit=1'); await call('/rest/v1/noema_curriculum_steps?select=node_id&limit=1'); await call('/rest/v1/noema_curriculum_members?select=email&limit=1'); await call('/storage/v1/object/list/noema-curricula', { method: 'POST', body: { prefix: '', limit: 1 } }); });
      return out;
    },

    /* ---------- OAuth consent for the Claude connector (Supabase OAuth 2.1 server, docs/CLAUDE_CONNECTOR.md) ---------- */
    async oauthDetails(id) { return call('/auth/v1/oauth/authorizations/' + enc(id)); },
    async oauthConsent(id, action) { return call('/auth/v1/oauth/authorizations/' + enc(id) + '/consent', { method: 'POST', body: { action } }); },
    async uploadFile(folder, file) { return this.uploadObject(`${folder}/${file.name}`, file, file.type || 'application/octet-stream'); },
  };
})();
