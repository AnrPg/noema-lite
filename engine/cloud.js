/* =====================================================================================
   noema-lite — cloud adapter (Supabase: Auth + PostgREST + Storage), dependency-free.
   Every row/object is owned by the signed-in user and protected by row-level security
   (see cloud/supabase.sql). The browser only ever holds the public publishable key.
   Data model: noema_kv mirrors the local namespaced key/value store of a cloud account
   (key = suffix after "noema1:u_<uid>:"), last-write-wins per key using timestamps.
   ===================================================================================== */
(function () {
  'use strict';
  const SKEY = 'noema1:cloud:session';
  let CFG = null, BASE = '', KEY = '';   // KEY = the project's publishable key (sb_publishable_…) or legacy anon JWT
  const st = { syncing: false, lastSync: null, error: null, listeners: [], pending: new Set(), convoPending: new Set(), timer: null, ctimer: null };
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const emit = () => st.listeners.forEach(f => { try { f(status()); } catch (e) { } });
  const status = () => ({ signedIn: !!session(), syncing: st.syncing, lastSync: st.lastSync, error: st.error, pending: st.pending.size + st.convoPending.size });
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

    /* ---------- key/value sync ---------- */
    async pull(acc = accId()) {
      st.syncing = true; emit();
      try {
        const rows = await call('/rest/v1/noema_kv?select=key,value,updated_at&order=key');
        const pre = 'noema1:' + acc + ':'; const mt = jget(pre + 'meta:mtime', {}); let changed = 0;
        for (const r of rows || []) {
          if (r.key.startsWith('a:curin:') || r.key.startsWith('a:curclaim:')) continue;   // answers from the Claude app (read and deleted by engine/curjobs.js) and its runs' claims: never stored here
          const t = Date.parse(r.updated_at) || 0;
          if (!mt[r.key] || t > mt[r.key]) { if (localStorage.getItem(pre + r.key) !== r.value) { try { localStorage.setItem(pre + r.key, r.value); changed++; } catch (e) { } } mt[r.key] = t; }
        }
        // keys changed locally while offline (newer than server or missing there) → push
        const remote = new Map((rows || []).filter(r => !r.key.startsWith('a:curin:') && !r.key.startsWith('a:curclaim:')).map(r => [r.key, Date.parse(r.updated_at) || 0]));
        Object.keys(mt).forEach(k => { if (!remote.has(k) || mt[k] > remote.get(k)) st.pending.add(k); });
        jset(pre + 'meta:mtime', mt);
        st.lastSync = Date.now(); st.error = null; return changed;
      } catch (e) { st.error = e.message; throw e; } finally { st.syncing = false; emit(); }
    },
    async push(acc = accId(), { keepalive = false } = {}) {
      if (!st.pending.size || !session()) return 0;
      const pre = 'noema1:' + acc + ':'; const mt = jget(pre + 'meta:mtime', {});
      const keys = [...st.pending]; st.pending.clear();
      const rows = [], dels = [];
      keys.forEach(k => { const v = localStorage.getItem(pre + k); if (v == null) dels.push(k); else rows.push({ user_id: uid(), key: k, value: v, updated_at: new Date(mt[k] || Date.now()).toISOString() }); });
      st.syncing = true; emit();
      try {
        for (let i = 0; i < rows.length; i += 50) await call('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', body: rows.slice(i, i + 50), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, keepalive });
        for (const k of dels) await call('/rest/v1/noema_kv?key=eq.' + enc(k), { method: 'DELETE', keepalive });
        st.lastSync = Date.now(); st.error = null; return rows.length + dels.length;
      } catch (e) { keys.forEach(k => st.pending.add(k)); st.error = e.message; throw e; } finally { st.syncing = false; emit(); }
    },
    /** Rows whose key starts with `prefix` (e.g. the Claude app's answers, a:curin:) — read directly, not mirrored locally. */
    async kvRows(prefix) { return (await call('/rest/v1/noema_kv?select=key,value,updated_at&order=key&key=like.' + enc(prefix + '*'))) || []; },
    async kvDelete(key) { await call('/rest/v1/noema_kv?key=eq.' + enc(key), { method: 'DELETE' }); },
    startAutoSync(acc) {
      if (!window.Noema || st.autoAcc === acc) return; st.autoAcc = acc;   // once per page
      // debounce 3 s, but never longer than 10 s after the first unsynced change (steady writes must not starve the sync)
      Noema.kv.listeners.push((key, a) => { if (a !== acc) return; st.pending.add(key.slice(('noema1:' + acc + ':').length)); st.firstPending = st.firstPending || Date.now(); clearTimeout(st.timer); st.timer = setTimeout(() => { st.firstPending = null; this.push(acc).catch(() => { }); }, Math.max(0, Math.min(3000, 10000 - (Date.now() - st.firstPending)))); emit(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.push(acc, { keepalive: true }).catch(() => { }); else this.pull(acc).catch(() => { }); });
      addEventListener('online', () => { this.push(acc).catch(() => { }); this.pushConvos(acc).catch(() => { }); });
      if (window.NoemaConvos) NoemaConvos.onChange((a, r) => { if (a !== acc) return; st.convoPending.add(r.id); clearTimeout(st.ctimer); st.ctimer = setTimeout(() => this.pushConvos(acc).catch(() => { }), 2500); emit(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.pushConvos(acc, { keepalive: true }).catch(() => { }); });
      this.push(acc).catch(() => { });
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
