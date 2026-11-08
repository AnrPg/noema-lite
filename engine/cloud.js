/* =====================================================================================
   noema-lite — cloud adapter (Supabase: Auth + PostgREST + Storage), dependency-free.
   Every row/object is owned by the signed-in user and protected by row-level security
   (see cloud/supabase.sql). The browser only ever holds the public publishable key.
   The sync itself is NoemaCore.sync (src/features/sync, docs/SYNC.md): its loop and the "one device at a time" lease are
   statecharts, the learning log goes as events (noema_events) and the settings as per-field registers (noema_settings).
   This file is its key/value channel: noema_kv mirrors the rest of the local namespaced key/value store of a cloud
   account (key = suffix after "noema1:u_<uid>:"; curricula, language courses, records…). Writes are compare-and-swap on
   each row's updated_at and copies changed on two devices are combined ("key/value sync" below). The indexes of the 👁
   source files and the 文A bridges are tables of one row per entry instead ("entry tables" below).
   ===================================================================================== */
(function () {
  'use strict';
  const SKEY = 'noema1:cloud:session';
  let CFG = null, BASE = '', KEY = '';   // KEY = the project's publishable key (sb_publishable_…) or legacy anon JWT
  const st = { convoPending: new Set(), seq: 0, autoAcc: null };
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const caught = (where, severity = 'warning') => NoemaCore.errors.catcher(where, { severity });   // a background step that failed: into the error journal (src/ports/error-reporter.ts)
  const jset = (k, v) => NoemaCore.storage.kv.set(k, JSON.stringify(v));   // a full storage: the core warns the learner
  /** Something waits to be sent: the sync loop's wait starts (NoemaCore.sync). */
  const changed = () => NoemaCore.sync.changed();
  /** The sync's state as the old UI shows it (engine/shell.js, engine/src/70_account.js): error = its words in the UI language. */
  const status = () => { const s = NoemaCore.sync.status(); return { signedIn: !!session(), syncing: s.syncing, lastSync: s.lastSync, error: s.error ? errText(s.error) : null, errorInfo: s.errorInfo, pending: s.pending }; };
  function session() { return jget(SKEY, null); }
  function setSession(s) { if (s) { s.expires_at = s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600); jset(SKEY, { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: { id: s.user.id, email: s.user.email, user_metadata: s.user.user_metadata || {} } }); } else localStorage.removeItem(SKEY); }
  function errMsg(j, r) { return (j && (j.msg || j.message || j.error_description || j.error)) || `HTTP ${r.status}`; }   // i18n-ignore (the server's own English; codeOf names it)

  /* ---------- errors: every error a learner may read has a stable code (the contract: docs/i18n.md §6) ----------
     .message stays the English text (logs, older callers, regexes), .code + .params give the words in the UI language:
     NoemaI18n.err(e) → t('err.' + code, params), or the English message for a code without a catalog entry. */
  const coded = (message, code, params = {}, extra = {}) => Object.assign(new Error(message), { code, params }, extra);
  const ET = (k, p) => window.NoemaI18n ? NoemaI18n.t(k, p) : k;
  const errText = e => window.NoemaI18n ? NoemaI18n.err(e) : String((e && e.message) || e);
  const errInfo = e => e ? { code: e.code || null, params: e.params || {}, message: String(e.message || e) } : null;
  /** Supabase Auth (GoTrue) error_code → our code. */
  const AUTH = {
    invalid_credentials: 'auth.invalid_credentials', email_not_confirmed: 'auth.email_not_confirmed', user_already_exists: 'auth.user_already_exists',
    email_exists: 'auth.email_exists', over_email_send_rate_limit: 'auth.email_rate_limit', over_request_rate_limit: 'auth.rate_limit',
    otp_expired: 'auth.otp_expired', email_address_invalid: 'auth.email_invalid', signup_disabled: 'auth.signup_disabled', email_provider_disabled: 'auth.signup_disabled',
    user_banned: 'auth.user_banned', user_not_found: 'auth.user_not_found', same_password: 'auth.same_password', email_address_not_authorized: 'auth.email_not_authorized',
    captcha_failed: 'auth.captcha_failed', refresh_token_not_found: 'auth.session_expired', refresh_token_already_used: 'auth.session_expired',
    session_not_found: 'auth.session_expired', session_expired: 'auth.session_expired', bad_jwt: 'auth.session_expired', no_authorization: 'auth.session_expired',
  };
  /* older Auth servers (and the test emulator) send no error_code: recognised by their English message */
  /* i18n-ignore-start */
  const AUTH_MSG = [[/invalid login credentials/i, 'invalid_credentials'], [/email not confirmed/i, 'email_not_confirmed'], [/already (been )?registered/i, 'user_already_exists'],
    [/password should|weak password/i, 'weak_password'], [/email rate limit/i, 'over_email_send_rate_limit'], [/rate limit/i, 'over_request_rate_limit'],
    [/expired or is invalid|invalid or has expired/i, 'otp_expired'], [/refresh token/i, 'refresh_token_not_found'], [/signups? not allowed/i, 'signup_disabled'],
    [/unable to validate email|email address .* is invalid/i, 'email_address_invalid'], [/invalid jwt|jwt expired/i, 'bad_jwt']];
  /* i18n-ignore-end */
  /** A failed answer of Supabase → [code, params] (docs/i18n.md §6). Codes without a catalog entry (*.unknown) show the server's English. */
  function codeOf(path, j, status, m) {
    const o = j && typeof j === 'object' ? j : {};
    if (/^\/auth\/v1\//.test(path)) {
      let ec = o.error_code || (typeof o.code === 'string' ? o.code : null);
      if (!(ec in AUTH) && ec !== 'weak_password') { const hit = AUTH_MSG.find(([re]) => re.test(m)); ec = hit ? hit[1] : ec; }
      if (ec === 'weak_password') { const min = +(String(m).match(/at least (\d+) characters/i) || [])[1]; return min ? ['auth.weak_password', { min }] : ['auth.weak_password_other', {}]; }
      if (AUTH[ec]) return [AUTH[ec], {}];
      if (status === 429) return ['auth.rate_limit', {}];
      if (status >= 500) return ['auth.server', { status }];
      return ['auth.unknown', { status, detail: m }];
    }
    if (/PGRST205|42P01/.test(o.code || '') || /schema cache|does not exist|Bucket not found/i.test(m)) return ['cloud.schema_old', {}];
    if (status === 401 || /\bJWT\b/i.test(m)) return ['auth.session_expired', {}];
    if (o.code === '42501' || status === 403 || /row-level security/i.test(m)) return ['cloud.permission', {}];
    if (status === 413 || /maximum allowed size|payload too large/i.test(m)) return ['cloud.too_large', {}];
    if (status === 429) return ['cloud.rate_limit', {}];
    if (status >= 500) return ['cloud.server', { status }];
    return ['cloud.unknown', { status, detail: m }];
  }
  const failed = (path, j, r) => { const m = errMsg(j, r), [code, params] = codeOf(path, j, r.status, m); return coded(m, code, params, { status: r.status }); };
  async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false, keepalive = false } = {}) {
    if (auth) await fresh();
    const s = session();
    // Publishable keys (sb_publishable_…) are not JWTs: send them only as `apikey`; the Authorization header carries the user's session token.
    const bearer = auth && s ? s.access_token : (/^sb_/.test(KEY) ? null : KEY);
    const h = Object.assign({ apikey: KEY }, bearer ? { Authorization: 'Bearer ' + bearer } : {}, body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}, headers);   // i18n-ignore
    const payload = body === undefined ? undefined : (body instanceof Blob || typeof body === 'string' ? body : JSON.stringify(body));
    const size = payload == null ? 0 : (payload instanceof Blob ? payload.size : payload.length * 3);
    if (keepalive && size > 60000) keepalive = false;      // browsers refuse keepalive bodies over 64 KB
    let r;
    try { r = await fetch(BASE + path, { method, headers: h, body: payload, keepalive }); }
    catch (e) { throw coded('Network error — are you offline? (' + e.message + ')', /^\/auth\//.test(path) ? 'auth.network' : 'cloud.network', { detail: e.message }, { network: true }); }   // i18n-ignore (English .message of err.*.network)
    if (raw) { if (!r.ok) { let j = null; try { j = await r.clone().json(); } catch (e) { /* an error answer that is not JSON: classified by its status alone */ } throw Object.assign(failed(path, j, r), { message: `HTTP ${r.status}` }); } return r; }
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) throw failed(path, j, r);
    return j;
  }
  async function fresh() {
    const s = session(); if (!s) throw coded('Not signed in', 'auth.not_signed_in');   // i18n-ignore (English .message of err.auth.not_signed_in)
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false }).catch(e => { if (e.code === 'auth.session_expired' || /invalid|expired|not found/i.test(e.message)) setSession(null); throw e; });
    setSession(j); return session();
  }
  const uid = () => session()?.user.id;
  const accId = () => 'u_' + uid();
  const enc = s => encodeURIComponent(s);
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
  const markDirty = (acc, k) => { metaSet(acc, 'unsynced', m => { m[k] = Date.now() * 1000 + (++st.seq % 1000); }); changed(); };
  const clean = (acc, k, mark) => { metaSet(acc, 'unsynced', m => { if (mark === undefined || m[k] === mark) delete m[k]; }); };   // only if not changed again meanwhile
  const put = (full, v) => { if (NoemaCore.storage.kv.set(full, v)) return true; st.full = true; return false; };   // a full storage: the core warns the learner (storage-full signal)
  const FULL = () => coded('This device’s storage is full: some changes from your other devices could not be saved here.', 'cloud.storage_full');   // i18n-ignore (English .message of err.cloud.storage_full)
  /** keys (full localStorage keys) another device changed → the open subject folds them into what it holds in memory (engine/src/10_core.js);
      NoemaCore.sync's pulls tell it through onRemote (startAutoSync), a combined copy of a push here */
  const notify = (acc, keys) => { try { dispatchEvent(new CustomEvent('noema:remote', { detail: { acc, keys } })); } catch (e) { NoemaCore.errors.report(e, { where: 'cloud.event.remote', severity: 'debug' }); } };
  const isoAfter = prev => new Date(Math.max(Date.now(), (Date.parse(prev || '') || 0) + 1)).toISOString();   // a version stamp never equal to the one it replaces
  const isObj = x => x != null && typeof x === 'object' && !Array.isArray(x);
  const pj = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
  async function restorePoint(acc) {   // before combining drops anything: at most one every 10 minutes
    if (Date.now() - (st.rpAt || 0) < 10 * 60e3) return; st.rpAt = Date.now();
    try { await window.Noema?.backup?.restorePoint(acc, 'Before combining changes from another device', { k: 'engine.bk.pointCombine' }); } catch (e) { NoemaCore.errors.report(e, { where: 'cloud.restorepoint', severity: 'warning' }); }   // i18n-ignore (the stored label for older apps; k: shown in the UI language, engine/src/70_account.js)
  }

  /* ---------- combining two copies of a key ---------- */
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
      if (isObj(a.steps) || isObj(b.steps)) { const st = { ...(b.steps || {}) }; for (const [x, d] of Object.entries(a.steps || {})) st[x] = st[x] == null ? d : Math.min(st[x], d); out.steps = st; }   // the ladder's stored steps (D22): the earliest day of each
      return out;
    }
    if (/:lang:[^:]+:script$/.test(k)) {   // the script stage (letters / characters, P4): per letter and track the later review wins, as for words
      const items = { ...(b.items || {}) }; for (const [id, it] of Object.entries(a.items || {})) items[id] = mergeLangItem(it, items[id]);
      return { ...b, ...a, items };
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
    if (k.startsWith('s:lang:') && isObj(a) && isObj(b)) { const m = mergeLang(k, a, b); if (m) return { value: JSON.stringify(m), lost: false }; }
    if (isObj(a) && isObj(b)) {   // records: every field of both, the newer copy wins where both set one
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
    const b = meta(acc, 'base')[k], full = 'noema1:' + acc + ':' + k; let v = localStorage.getItem(full);
    if (v != null && k.startsWith('a:curriculum:') && !tries) {   // an older copy saved on this device keeps the cloud's chapter plans (they are stamped, so merging is safe)
      const row = ((await call('/rest/v1/noema_kv?select=value&key=eq.' + enc(k))) || [])[0];
      const m = row && mergeCurriculum(k, v, row.value); if (m && put(full, m)) { v = m; notify(acc, [full]); }
    }
    const q = '/rest/v1/noema_kv?key=eq.' + enc(k) + (b ? '&updated_at=eq.' + enc(b) : ''), rep = { Prefer: 'return=representation' };   // i18n-ignore
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
    if (tries >= 3) throw coded(`“${k}” keeps changing on another device: trying again later`, 'cloud.keeps_changing', { key: k });   // i18n-ignore (English .message of err.cloud.keeps_changing)
    const cur = ((await call('/rest/v1/noema_kv?select=key,value,updated_at&key=eq.' + enc(k))) || [])[0] || null;
    const changed = await resolve(acc, k, cur); if (changed) notify(acc, [changed]);
    const m = meta(acc, 'unsynced')[k]; if (m !== undefined) return pushKey(acc, k, m, keepalive, tries + 1);
  }

  /* ---------- what is not a key/value row here ----------
     Progress (s:<subject>:state, a:stats) goes as the learning log's events and the settings (a:settings) as per-field
     registers (NoemaCore.sync); the cloud's old rows of both are only read, once per version ("legacy" in pullKv). The
     "in use" row a:inuse is the lease's (src/features/sync/application/lease-service.ts). */
  const SETTINGS = 'a:settings';
  const progressKey = k => k === 'a:stats' || (/^s:.+:state$/.test(k) && !k.startsWith('s:lang:'));   // a language course's progress stays here (mergeLang)
  const legacyKey = k => progressKey(k) || k === SETTINGS;
  const remoteOnly = k => inboxKey(k) || k === 'a:inuse';
  /** the local caches of the entry tables (below): kept from the tables' rows, never mirrored into noema_kv */
  const tabled = k => k.startsWith('a:srcfiles:') || k === 'a:bridges';
  const kvSkip = k => remoteOnly(k) || tabled(k) || legacyKey(k);

  /* ---------- the UI language in the account (user_metadata.locale): Supabase's e-mails are written in it (cloud/email/, docs/i18n.md §6) ----------
     At sign-up it goes with the new account; afterwards, once per page and language, when NoemaI18n.locale differs from it. */
  const uiLocale = () => (window.NoemaI18n && NoemaI18n.locale) || null;
  const localeSent = new Set();
  async function syncLocale() {
    const s = session(), loc = uiLocale(); if (!s || !loc || !BASE) return false;
    const key = s.user.id + '|' + loc;
    if ((s.user.user_metadata || {}).locale === loc || localeSent.has(key)) return false;
    localeSent.add(key);
    try {
      const u = await call('/auth/v1/user', { method: 'PUT', body: { data: { locale: loc } } });
      const cur = session(); if (cur && cur.user.id === s.user.id) { cur.user.user_metadata = { ...(cur.user.user_metadata || {}), ...((u && u.user_metadata) || {}), locale: loc }; jset(SKEY, cur); }
      return true;
    } catch (e) { console.warn('[cloud] the UI language was not saved in the account', e.message); return false; }   // i18n-ignore
  }

  /* ---------- entry tables (cloud/supabase.sql §17): one row per entry ----------
     The files of a subject's sources (noema_source_files: subject × source → its meta, engine/srcfiles.js) and the 文A
     bridges (noema_bridges: pack × pair → its summary, engine/bridge.js). Each entry is its own row, so this device, the
     others and the Claude connector writing at the same time never drop each other's entry. This device keeps them in
     local caches (a:srcfiles:<subject>, a:bridges — the modules read those), which are not mirrored into noema_kv: a change
     goes into the outbox meta:rowbox and is sent with the next push; a pull rebuilds the caches from the rows plus what the
     outbox still holds. The first pull of an account sends up every entry this device has and the tables lack. */
  const ROWS = {
    source_files: { path: 'noema_source_files', a: 'subject_id', b: 'source_id', key: a => 'a:srcfiles:' + a, mine: k => k.startsWith('a:srcfiles:'),
      set: (v, a, b, m) => { v[b] = m; }, del: (v, a, b) => { delete v[b]; }, entries: (k, v) => Object.entries(v || {}).map(([b, m]) => [k.slice('a:srcfiles:'.length), b, m]) },
    bridges: { path: 'noema_bridges', a: 'pack_id', b: 'pair', key: () => 'a:bridges', mine: k => k === 'a:bridges',
      set: (v, a, b, m) => { (v[a] = v[a] || {})[b] = m; }, del: (v, a, b) => { if (v[a]) { delete v[a][b]; if (!Object.keys(v[a]).length) delete v[a]; } },
      entries: (k, v) => Object.entries(v || {}).flatMap(([a, o]) => Object.entries(o || {}).map(([b, m]) => [a, b, m])) },
  };
  const boxId = (t, a, b) => JSON.stringify([t, a, b]);
  /** Queue a change of one entry for the next push (put: its meta; del). */
  function rowOp(acc, t, a, b, op) {
    if (!ROWS[t]) throw new Error('no entry table ' + t);   // i18n-ignore (a programming error)
    metaSet(acc, 'rowbox', m => { m[boxId(t, a, b)] = { t, a, b, ...op, mark: Date.now() * 1000 + (++st.seq % 1000) }; }); changed();
  }
  async function pushRows(acc, keepalive) {
    const box = meta(acc, 'rowbox'); let n = 0;
    for (const [id, op] of Object.entries(box)) {
      const d = ROWS[op.t];
      if (d && op.op === 'put') await call(`/rest/v1/${d.path}?on_conflict=user_id,${d.a},${d.b}`, { method: 'POST', body: [{ user_id: uid(), [d.a]: op.a, [d.b]: op.b, meta: op.meta }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, keepalive });
      else if (d && op.op === 'del') await call(`/rest/v1/${d.path}?${d.a}=eq.${enc(op.a)}&${d.b}=eq.${enc(op.b)}`, { method: 'DELETE', keepalive });
      metaSet(acc, 'rowbox', m => { if (m[id] && m[id].mark === op.mark) delete m[id]; }); n++;   // only if not changed again meanwhile
    }
    return n;
  }
  /** The tables → this device's caches. Returns the full keys that changed here. */
  async function pullRows(acc) {
    const pre = 'noema1:' + acc + ':', changed = [], first = !meta(acc, 'rowsync').at;
    const localKeys = () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre) && tabled(k.slice(pre.length))) out.push(k.slice(pre.length)); } return out; };
    for (const [t, d] of Object.entries(ROWS)) {
      const rows = (await call(`/rest/v1/${d.path}?select=${d.a},${d.b},meta&order=${d.a},${d.b}`)) || [];
      const have = {}, there = new Set();
      for (const r of rows) { const k = d.key(r[d.a]); d.set(have[k] = have[k] || {}, r[d.a], r[d.b], r.meta); there.add(boxId(t, r[d.a], r[d.b])); }
      const mine = localKeys().filter(d.mine);
      if (first) for (const k of mine) for (const [a, b, m] of d.entries(k, jget(pre + k, {}))) {   // never lose an entry made before the tables
        if (!there.has(boxId(t, a, b)) && !(boxId(t, a, b) in meta(acc, 'rowbox')) && isObj(m)) rowOp(acc, t, a, b, { op: 'put', meta: m });
      }
      for (const op of Object.values(meta(acc, 'rowbox'))) if (op.t === t) {   // what this device changed and has not sent yet
        const k = d.key(op.a); have[k] = have[k] || {};
        if (op.op === 'put') d.set(have[k], op.a, op.b, op.meta); else d.del(have[k], op.a, op.b);
      }
      for (const k of new Set([...Object.keys(have), ...mine])) {
        const v = have[k] && Object.keys(have[k]).length ? JSON.stringify(have[k]) : null, cur = localStorage.getItem(pre + k);
        if (v === cur) continue;
        if (v == null) localStorage.removeItem(pre + k); else if (!put(pre + k, v)) continue;
        changed.push(pre + k);
      }
    }
    if (first) metaSave(acc, 'rowsync', { at: new Date().toISOString() });
    return changed;
  }


  /* ---------- key/value sync (NoemaCore.sync's channel "kv") ----------
     Every device remembers, per key, the cloud version its copy comes from (meta:base = the row's updated_at) and which
     keys it changed since (meta:unsynced). A push only replaces the row if it is still that version (compare-and-swap),
     so no device can overwrite a newer copy, whatever its clock says. When both sides changed a key, the two copies are
     combined (mergeValue); a restore point is kept before anything could be dropped. */
  /** The cloud's rows → this device. Returns the full keys that changed here. */
  async function pullKv(acc) {
    // first only the keys and their version stamps (a few KB); then the values of the rows that changed — a sync
    // where nothing changed no longer downloads every curriculum and language course again (megabytes each time)
    const heads = await call('/rest/v1/noema_kv?select=key,updated_at&order=key');
    const pre = 'noema1:' + acc + ':', base = meta(acc, 'base'), dirty = meta(acc, 'unsynced'), seen = new Set(), keys = [], conflicts = [];
    for (const k of Object.keys(base)) if (kvSkip(k)) delete base[k];   // entry tables (their rows are pulled below), progress and settings (NoemaCore.sync)
    for (const k of Object.keys(dirty)) if (kvSkip(k)) clean(acc, k);
    // legacy: the rows of progress and settings from before the log and the registers, taken in once per version (they stay in the cloud for older apps)
    const took = meta(acc, 'legacy'), legacy = (heads || []).filter(r => legacyKey(r.key) && took[r.key] !== r.updated_at);
    const want = (heads || []).filter(r => !kvSkip(r.key) && base[r.key] !== r.updated_at).map(r => r.key).concat(legacy.map(r => r.key)), got = new Map();
    for (let i = 0; i < want.length; i += 40) {   // short enough addresses
      const list = want.slice(i, i + 40).map(k => '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
      for (const r of (await call('/rest/v1/noema_kv?select=key,value,updated_at&key=in.' + enc('(' + list + ')'))) || []) got.set(r.key, r);
    }
    for (const h of legacy) {
      const r = got.get(h.key); if (!r) continue;
      let seenAt = r.updated_at;
      if (r.key === SETTINGS) {
        const o = pj(r.value);
        if (isObj(o) && typeof o.apiKey === 'string') {   // a Gemini key an older version synced: kept on this device, taken out of the cloud's row
          if (o.apiKey && !window.Noema?.geminiKey?.get(acc)) Noema.geminiKey.set(acc, o.apiKey);
          delete o.apiKey;
          const w = await call('/rest/v1/noema_kv?key=eq.' + SETTINGS + '&updated_at=eq.' + enc(r.updated_at), { method: 'PATCH', body: { value: JSON.stringify(o), updated_at: isoAfter(r.updated_at) }, headers: { Prefer: 'return=representation' } });   // i18n-ignore
          if (Array.isArray(w) && w[0]) seenAt = w[0].updated_at;   // refused: an older app wrote it again meanwhile, the next pull looks at that one
        }
        keys.push(...await NoemaCore.sync.settings.importLegacy(acc, JSON.stringify(isObj(o) ? o : {}), r.updated_at));   // field by field, as old as the row
      } else { const had = localStorage.getItem(pre + r.key); await NoemaCore.sync.legacyProgress(acc, r.key, r.value); if (localStorage.getItem(pre + r.key) !== had) keys.push(pre + r.key); }   // the learning log's migration
      metaSet(acc, 'legacy', m => { m[r.key] = seenAt; });
    }
    for (const h of heads || []) {
      if (kvSkip(h.key)) continue;   // answers from the Claude app (read and deleted by engine/curjobs.js), its runs' claims, other apps' results (engine/src/15_inbox.js), the "in use" row, the legacy rows: never stored here as they are
      seen.add(h.key);
      if (base[h.key] === h.updated_at) continue;   // the cloud still has the version this copy comes from
      const r = got.get(h.key); if (!r) continue;   // deleted between the two requests: the next pull sees it
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
    Object.keys(window.Noema?.kv?.accountData?.(acc) || {}).forEach(k => { if (!seen.has(k) && !(k in base) && !kvSkip(k)) markDirty(acc, k); });
    for (const r of conflicts) { const k = await resolve(acc, r.key, r); if (k) keys.push(k); }
    keys.push(...await pullRows(acc));
    if (st.full) { st.full = false; NoemaCore.errors.report(FULL(), { where: 'cloud.pull.full', severity: 'warning' }); }
    try { dispatchEvent(new CustomEvent('noema:pulled', { detail: { acc, changed: keys.length, keys } })); } catch (e) { NoemaCore.errors.report(e, { where: 'cloud.event.pulled', severity: 'debug' }); }   // e.g. the open subject reads its results inbox
    return keys;
  }
  /** This device's changes → the cloud: the keys, the entries of the tables, the conversations. Returns how many were sent. */
  async function pushKv(acc, keepalive) {
    const dirty = meta(acc, 'unsynced'); for (const k of Object.keys(dirty)) if (kvSkip(k)) clean(acc, k);
    const keys = Object.keys(dirty).filter(k => !kvSkip(k)); if (!session()) return 0;
    // the page is being hidden: every request leaves at once (keepalive), a slower loop could be cut off
    if (keepalive) await Promise.all(keys.map(k => pushKey(acc, k, dirty[k], true)));
    else for (const k of keys) await pushKey(acc, k, dirty[k], false);
    return keys.length + await pushRows(acc, keepalive) + await NoemaCloud.pushConvos(acc, { keepalive });
  }
  const kvChannel = {
    name: 'kv',
    pending: acc => Object.keys(meta(acc, 'unsynced')).filter(k => !kvSkip(k)).length + Object.keys(meta(acc, 'rowbox')).length + st.convoPending.size,
    async pull(acc, { reason }) {
      const keys = await pullKv(acc);
      if (reason !== 'takeover') return keys;
      // this tab took the account over: what the other one did may be in this browser already (another tab) — the open page reads all of it again
      return [...new Set([...keys, ...Object.keys(window.Noema?.kv?.accountData?.(acc) || {}).map(k => 'noema1:' + acc + ':' + k)])];
    },
    push: (acc, { keepalive }) => pushKv(acc, keepalive),
    beforeLeave() { window.flushSave?.(); },   // what the open page holds is saved first (engine/src/10_core.js), then sent
  };

  const NoemaCloud = window.NoemaCloud = {
    session, status, onStatus(f) { return NoemaCore.sync.onStatus(() => f(status())); },
    /** A raw Supabase call as the signed-in user (row-level security applies) — e.g. engine/curshare.js. */
    api: (path, o) => call(path, o), uid,
    async init(cfg) {
      CFG = cfg; BASE = cfg.supabaseUrl.replace(/\/+$/, ''); KEY = cfg.supabaseKey || cfg.supabaseAnonKey || '';
      if (session()) { try { await fresh(); } catch (e) { console.warn('[cloud] session refresh failed', e.message); } }   // i18n-ignore
      if (window.NoemaI18n && !st.localeHook) { st.localeHook = true; NoemaI18n.onChange(() => { syncLocale(); }); Promise.resolve(NoemaI18n.ready).then(syncLocale, () => { }); }
    },
    /** Save the UI language in user_metadata.locale when it differs (→ true when sent); called by itself after boot and on every change. */
    syncLocale,
    async signUp(email, password, name) {
      const data = { name: name || email.split('@')[0] }; if (uiLocale()) data.locale = uiLocale();   // the confirmation e-mail already speaks the learner's language
      const j = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password, data } });
      const s = j.access_token ? j : (j.session || null);
      if (s && s.access_token) { setSession(s); await this.saveProfile({ name: name || email.split('@')[0] }); return { session: true }; }
      return { session: false };
    },
    async signIn(email, password) { const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }); setSession(j); syncLocale(); return true; },
    async recover(email) { await call('/auth/v1/recover', { method: 'POST', auth: false, body: { email } }); },
    async signOut() { NoemaCore.sync.stop(); st.autoAcc = null; try { await call('/auth/v1/logout', { method: 'POST' }); } catch (e) { NoemaCore.errors.report(e, { where: 'cloud.signout', severity: 'info' }); } setSession(null); },
    async saveProfile(p) {
      const row = { user_id: uid(), display_name: p.name || null, emoji: p.emoji || null, learner: p.learner || null, updated_at: new Date().toISOString() };
      await call('/rest/v1/noema_profiles?on_conflict=user_id', { method: 'POST', body: [row], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      jset('noema1:' + accId() + ':a:profile', { name: p.name, emoji: p.emoji, learner: p.learner });
    },

    /* ---------- the sync (docs/SYNC.md): NoemaCore.sync runs it; pull/push are its 🔄 Sync now, for the account given ---------- */
    async pull(acc = accId()) { this.startAutoSync(acc); return NoemaCore.sync.pull(); },
    async push(acc = accId(), { keepalive = false } = {}) { if (!session()) return 0; this.startAutoSync(acc); return NoemaCore.sync.push({ keepalive }); },
    /** Combine two copies of a key (this device's and the cloud's) → { value, lost } — `lost`: something of `local` may be dropped. */
    mergeValue, mergeLang,
    /** Rows whose key starts with `prefix` (e.g. the Claude app's answers, a:curin:) — read directly, not mirrored locally. */
    async kvRows(prefix) { return (await call('/rest/v1/noema_kv?select=key,value,updated_at&order=key&key=like.' + enc(prefix + '*'))) || []; },
    async kvDelete(key) { await call('/rest/v1/noema_kv?key=eq.' + enc(key), { method: 'DELETE' }); },
    /** Entry tables (above): engine/srcfiles.js and engine/bridge.js queue their changes here (the signed-in account only). */
    rows: {
      put(acc, table, a, b, m) { rowOp(acc, table, a, b, { op: 'put', meta: m }); },
      del(acc, table, a, b) { rowOp(acc, table, a, b, { op: 'del' }); },
    },
    /** Starts the sync of a signed-in cloud account on this page (NoemaCore.sync: the loop, the lease, this file's key/value channel). */
    startAutoSync(acc) {
      if (!window.Noema || st.autoAcc === acc) return;
      const first = !st.autoAcc; st.autoAcc = acc;
      if (first) {   // once per page
        NoemaCore.sync.channel(kvChannel);
        NoemaCore.sync.onRemote((a, keys) => notify(a, keys));
        Noema.kv.listeners.push((key, a) => { if (a !== st.autoAcc) return; const k = key.slice(('noema1:' + a + ':').length); if (k === SETTINGS) NoemaCore.sync.settings.changed(a); else if (!kvSkip(k)) markDirty(a, k); });
        if (window.NoemaConvos) NoemaConvos.onChange((a, r) => { if (a !== st.autoAcc) return; st.convoPending.add(r.id); changed(); });
      }
      try { NoemaCore.sync.start(acc); } catch (e) { NoemaCore.errors.report(e, { where: 'cloud.sync.start', severity: 'warning' }); }   // no cloud set up for the core: this page works on its own
      this.autoSnapshot().catch(caught('cloud.snapshot.auto'));
    },

    /* ---------- conversations (canonical noema.conversation/v1 records, one row each) ---------- */
    async pullConvos(acc = accId()) {
      const mk = 'noema1:' + acc + ':meta:convoPulledAt'; const since = jget(mk, null);
      let col = 'synced_at', rows;
      try { rows = await call(`/rest/v1/noema_conversations?select=record,updated_at,synced_at&order=synced_at.asc` + (since ? '&synced_at=gt.' + enc(since) : '')); }   // i18n-ignore
      catch (e) { if (!/synced_at/.test(e.message)) throw e; col = 'updated_at'; rows = await call('/rest/v1/noema_conversations?select=record,updated_at&order=updated_at.asc' + (since ? '&updated_at=gt.' + enc(since) : '')); }   // i18n-ignore
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
      st.convoPending.clear(); changed();
      const rows = [];
      for (const id of ids) { const r = await NoemaConvos.get(acc, id); if (r) rows.push({ user_id: uid(), id: r.id, subject_id: r.subject?.id || null, kind: r.kind, mode: r.mode, title: r.title, context_label: r.context?.label || null, message_count: r.stats.messages, deleted: r.deleted, created_at: r.createdAt, updated_at: r.updatedAt, record: r }); }
      try { for (let i = 0; i < rows.length; i += 20) await call('/rest/v1/noema_conversations?on_conflict=user_id,id', { method: 'POST', body: rows.slice(i, i + 20), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, keepalive }); return rows.length; }
      catch (e) { ids.forEach(i => st.convoPending.add(i)); throw e; }
    },

    /* ---------- snapshots (cloud restore points of the whole account) ---------- */
    async snapshot(label = 'Manual snapshot') {   // i18n-ignore (stored names: fixed English, matched below and read on every device — engine/src/70_account.js snapLabel shows them in the UI language)
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
      await this.snapshot('Daily auto-snapshot');   // i18n-ignore
      const list = await this.listSnapshots();
      const autos = (list || []).filter(s => s.label === 'Daily auto-snapshot');   // i18n-ignore
      for (const s of autos.slice(30)) await this.deleteSnapshot(s.id).catch(caught('cloud.snapshot.prune'));
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
        if (!r.ok) throw Object.assign(failed('/storage/v1/object', null, r), { message: `HTTP ${r.status}` });
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
    /** The public rows of some subject ids (🔔 a new version of a subject taken from 🌍 Explore). */
    async publicRows(ids) { return ids.length ? call(`/rest/v1/noema_public_packs?select=owner,subject_id,owner_name,title,updated_at,meta&subject_id=in.(${ids.map(enc).join(',')})`, { auth: !!session() }) : []; },
    /** files: [{ srcId, blob, name, type, act? }] — the subject's source files and its h5p@1 items' .h5p files (act) go with it (pack.sharedFiles tells the receiver where). */
    async publish(pack, meta, { files = [], onProgress } = {}) {
      const id = pack.subject.id;
      if (files.length) { const up = await this.uploadShareFiles('noema-public', f => `${uid()}/${id}/sources/${f.safe}/file.${f.ext}`, files, onProgress); pack = { ...pack, sharedFiles: up.map }; meta = { ...meta, filePaths: up.paths, sourceFiles: files.filter(f => !f.act).length, sourceBytes: files.reduce((a, f) => a + f.blob.size, 0) }; }
      else meta = { ...meta, filePaths: [], sourceFiles: 0 };
      const old = ((await this.myPublished().catch(() => [])) || []).find(r => r.subject_id === id);
      const stale = (old?.meta?.filePaths || []).filter(x => !(meta.filePaths || []).includes(x)); if (stale.length) await this.deleteObjects('noema-public', stale).catch(caught('cloud.page.cleanup'));
      await call(`/storage/v1/object/noema-public/${uid()}/${id}.json`, { method: 'POST', body: new Blob([JSON.stringify(pack)], { type: 'application/json' }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
      const row = { owner: uid(), subject_id: id, owner_name: meta.ownerName || null, title: pack.subject.title, emoji: pack.subject.emoji || null, description: pack.subject.description || null, language: pack.subject.language || null, meta, updated_at: new Date().toISOString() };
      await call('/rest/v1/noema_public_packs?on_conflict=owner,subject_id', { method: 'POST', body: [row], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    async unpublish(id) {
      const old = ((await this.myPublished().catch(() => [])) || []).find(r => r.subject_id === id);
      await call(`/rest/v1/noema_public_packs?owner=eq.${uid()}&subject_id=eq.${enc(id)}`, { method: 'DELETE' });
      await this.deleteObjects('noema-public', [`${uid()}/${id}.json`, ...(old?.meta?.filePaths || [])]).catch(caught('cloud.page.cleanup'));
    },
    async myPublished() { return call(`/rest/v1/noema_public_packs?select=subject_id,title,updated_at,meta&owner=eq.${uid()}`); },
    /* ---------- the page others see (Me › Me, docs/PROFILE.md): one row per person, readable by everybody once published ---------- */
    async myPage() { return session() ? ((await call(`/rest/v1/noema_public_profiles?select=*&owner=eq.${uid()}`)) || [])[0] || null : null; },
    async saveMyPage(p) {
      const row = { owner: uid(), published: !!p.published, display_name: p.display_name || null, emoji: p.emoji || null, bio: p.bio || null, avatar: p.avatar || null, show: p.show || {}, card: p.card || {}, updated_at: new Date().toISOString() };
      await call('/rest/v1/noema_public_profiles?on_conflict=owner', { method: 'POST', body: [row], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      return row;
    },
    async publicPage(owner) { return ((await call(`/rest/v1/noema_public_profiles?select=*&owner=eq.${enc(owner)}`, { auth: !!session() })) || [])[0] || null; },
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
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw coded('Please type a valid e-mail address.', 'share.invalid_email');   // i18n-ignore (English .message of err.share.invalid_email)
      if (to === (session()?.user?.email || '').toLowerCase()) throw coded('That is your own e-mail address.', 'share.own_email');   // i18n-ignore (English .message of err.share.own_email)
      const u = session().user;
      const [row] = await call('/rest/v1/noema_shares', { method: 'POST', body: [{ from_user: uid(), from_email: u.email, from_name: meta.ownerName || u.user_metadata?.name || u.email, to_email: to, subject_id: pack.subject.id, title: pack.subject.title, meta, message: message || null }], headers: { Prefer: 'return=representation' } });
      try {
        // files are named <share-id>.<source>.<ext>: the storage rules give them to exactly the same two people as the pack
        if (files.length) {
          const up = await this.uploadShareFiles('noema-shared', f => `${row.id}.src-${f.safe}.${f.ext}`, files, onProgress);
          pack = { ...pack, sharedFiles: up.map };
          await call(`/rest/v1/noema_shares?id=eq.${row.id}`, { method: 'PATCH', body: { meta: { ...meta, filePaths: up.paths, sourceFiles: files.filter(f => !f.act).length, sourceBytes: files.reduce((a, f) => a + f.blob.size, 0) } }, headers: { Prefer: 'return=minimal' } });
        }
        await call(`/storage/v1/object/noema-shared/${row.id}.json`, { method: 'POST', body: new Blob([JSON.stringify(pack)], { type: 'application/json' }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
      }
      catch (e) { await call(`/rest/v1/noema_shares?id=eq.${row.id}`, { method: 'DELETE' }).catch(caught('cloud.share.rollback')); throw e; }
      return row;
    },
    async incomingShares() { const me = (session()?.user?.email || '').toLowerCase(); if (!me) return []; return call(`/rest/v1/noema_shares?select=*&to_email=eq.${enc(me)}&status=eq.pending&order=created_at.desc`); },
    async outgoingShares() { return call(`/rest/v1/noema_shares?select=id,to_email,subject_id,title,status,created_at,responded_at,meta&from_user=eq.${uid()}&order=created_at.desc&limit=200`); },
    async downloadShared(id) { const r = await call(`/storage/v1/object/authenticated/noema-shared/${id}.json`, { raw: true }); return r.json(); },
    async answerShare(id, accept) { await call(`/rest/v1/noema_shares?id=eq.${id}`, { method: 'PATCH', body: { status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() }, headers: { Prefer: 'return=minimal' } }); },
    async revokeShare(id, filePaths = []) { await call(`/rest/v1/noema_shares?id=eq.${id}`, { method: 'PATCH', body: { status: 'revoked' }, headers: { Prefer: 'return=minimal' } }); await this.deleteObjects('noema-shared', [`${id}.json`, ...filePaths]).catch(caught('cloud.share.cleanup')); },

    /* ---------- 🩺 self-test against the REAL project with the signed-in account (cleans up after itself) ---------- */
    async selfTest(onStep = () => { }) {
      const out = [];
      const hint = e => {   // matched on the English message (the same for every UI language), shown in the UI language
        const m = String(e && e.message || e);
        if (/PGRST205|Could not find the table|does not exist|Bucket not found|schema cache|synced_at/i.test(m)) return ET('err.ui.selftest.hint.schema');
        if (/JWT|401|Not signed in|invalid.*token|refresh/i.test(m)) return ET('err.ui.selftest.hint.session');
        if (/row-level security|403|permission/i.test(m)) return ET('err.ui.selftest.hint.permission');
        if (/Network|Failed to fetch|offline/i.test(m)) return ET('err.ui.selftest.hint.network');
        return ET('err.ui.selftest.hint.unexpected');
      };
      const step = async (name, fn) => {
        const t = Date.now(); onStep({ name, running: true });
        try { const note = await fn(); const r = { name, ok: true, ms: Date.now() - t, note: note || '' }; out.push(r); onStep(r); }
        catch (e) { const r = { name, ok: false, ms: Date.now() - t, error: errText(e), errorInfo: errInfo(e), hint: hint(e) }; out.push(r); onStep(r); }
      };
      const T = Date.now().toString(36), me = uid();
      await step(ET('err.ui.selftest.step.signIn'), async () => { const s = session(); if (!s) throw coded('Not signed in', 'auth.not_signed_in'); const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false }); setSession(j); return s.user.email; });   // i18n-ignore (English .message)
      await step(ET('err.ui.selftest.step.profile'), async () => { await call('/rest/v1/noema_profiles?select=user_id&limit=1'); });
      await step(ET('err.ui.selftest.step.progress'), async () => {
        const key = 'meta:selftest-' + T;
        await call('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', body: [{ user_id: me, key, value: T, updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        const r = await call(`/rest/v1/noema_kv?select=value&key=eq.${enc(key)}`); if (r?.[0]?.value !== T) throw coded('value did not come back', 'cloud.selftest.value_missing');   // i18n-ignore (English .message)
        await call(`/rest/v1/noema_kv?key=eq.${enc(key)}`, { method: 'DELETE' });
      });
      await step(ET('err.ui.selftest.step.sync'), async () => { await call('/rest/v1/rpc/noema_events_since', { method: 'POST', body: { after: null, max_rows: 1 } }); await call('/rest/v1/rpc/noema_settings_since', { method: 'POST', body: { after: null, max_rows: 1 } }); });   // cloud/supabase.sql §19
      await step(ET('err.ui.selftest.step.conversations'), async () => {
        const id = 'cv_selftest' + T, now = new Date().toISOString();
        await call('/rest/v1/noema_conversations?on_conflict=user_id,id', { method: 'POST', body: [{ user_id: me, id, kind: 'tutor', created_at: now, updated_at: now, record: { id, selftest: true } }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        const r = await call(`/rest/v1/noema_conversations?select=id,synced_at&id=eq.${enc(id)}`);
        await call(`/rest/v1/noema_conversations?id=eq.${enc(id)}`, { method: 'DELETE' });
        /* i18n-ignore-start */ if (!r?.[0]) throw coded('row did not come back', 'cloud.selftest.row_missing'); if (!r[0].synced_at) throw coded('column synced_at missing', 'cloud.selftest.column_missing'); /* i18n-ignore-end */
      });
      await step(ET('err.ui.selftest.step.snapshots'), async () => {
        const [row] = await call('/rest/v1/noema_snapshots', { method: 'POST', body: [{ user_id: me, label: 'self-test ' + T, data: { selftest: true }, size_bytes: 20 }], headers: { Prefer: 'return=representation' } });
        await call('/rest/v1/noema_snapshots?id=eq.' + row.id, { method: 'DELETE' });
      });
      await step(ET('err.ui.selftest.step.files'), async () => {
        const path = `selftest/${T}.json`;
        await this.uploadObject(path, new Blob([JSON.stringify({ T })], { type: 'application/json' }), 'application/json');
        const list = await this.listObjects('selftest'); if (!(list || []).some(o => o.name === T + '.json')) throw coded('uploaded file not listed', 'cloud.selftest.not_listed');   // i18n-ignore (English .message)
        const back = await (await this.downloadObject(path)).json(); if (back.T !== T) throw coded('downloaded content differs', 'cloud.selftest.content_differs');   // i18n-ignore (English .message)
        await this.deleteObjects('noema-private', [`${me}/${path}`]);
      });
      await step(ET('err.ui.selftest.step.public'), async () => {
        await call('/rest/v1/noema_public_packs?select=subject_id&limit=1');
        const path = `${me}/selftest-${T}.json`;
        await call(`/storage/v1/object/noema-public/${path}`, { method: 'POST', body: new Blob(['{"ok":1}'], { type: 'application/json' }), headers: { 'Content-Type': 'application/json' } });   // i18n-ignore
        const r = await fetch(`${BASE}/storage/v1/object/public/noema-public/${path}`); const ok = r.ok;
        await this.deleteObjects('noema-public', [path]); if (!ok) throw coded('public file not readable (bucket must be public)', 'cloud.selftest.public_unreadable');   // i18n-ignore (English .message)
      });
      await step(ET('err.ui.selftest.step.sharing'), async () => { await call('/rest/v1/noema_shares?select=id&limit=1'); await call('/storage/v1/object/list/noema-shared', { method: 'POST', body: { prefix: '', limit: 1 } }); });
      await step(ET('err.ui.selftest.step.curricula'), async () => { await call('/rest/v1/noema_curricula_shared?select=id&limit=1'); await call('/rest/v1/noema_curriculum_steps?select=node_id&limit=1'); await call('/rest/v1/noema_curriculum_members?select=email&limit=1'); await call('/storage/v1/object/list/noema-curricula', { method: 'POST', body: { prefix: '', limit: 1 } }); });
      return out;
    },

    /* ---------- OAuth consent for the Claude connector (Supabase OAuth 2.1 server, docs/CLAUDE_CONNECTOR.md) ---------- */
    async oauthDetails(id) { return call('/auth/v1/oauth/authorizations/' + enc(id)); },
    async oauthConsent(id, action) { return call('/auth/v1/oauth/authorizations/' + enc(id) + '/consent', { method: 'POST', body: { action } }); },
    async uploadFile(folder, file) { return this.uploadObject(`${folder}/${file.name}`, file, file.type || 'application/octet-stream'); },
  };
})();
