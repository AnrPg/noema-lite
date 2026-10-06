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
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : (body instanceof Blob || typeof body === 'string' ? body : JSON.stringify(body)), keepalive });
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
          const t = Date.parse(r.updated_at) || 0;
          if (!mt[r.key] || t > mt[r.key]) { if (localStorage.getItem(pre + r.key) !== r.value) { try { localStorage.setItem(pre + r.key, r.value); changed++; } catch (e) { } } mt[r.key] = t; }
        }
        // keys changed locally while offline (newer than server or missing there) → push
        const remote = new Map((rows || []).map(r => [r.key, Date.parse(r.updated_at) || 0]));
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
    startAutoSync(acc) {
      if (!window.Noema) return;
      Noema.kv.listeners.push((key, a) => { if (a !== acc) return; st.pending.add(key.slice(('noema1:' + acc + ':').length)); clearTimeout(st.timer); st.timer = setTimeout(() => this.push(acc).catch(() => { }), 3000); emit(); });
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
      const rows = await call('/rest/v1/noema_conversations?select=record,updated_at&order=updated_at.asc' + (since ? '&updated_at=gt.' + enc(since) : ''));
      let n = 0, last = since;
      for (const row of rows || []) {
        const r = row.record; if (!r || !r.id) continue;
        const local = await NoemaConvos.get(acc, r.id);
        if (!local || Date.parse(r.updatedAt) > Date.parse(local.updatedAt)) { await NoemaConvos.put(acc, r, { silent: true, keepUpdatedAt: true }); n++; }
        last = row.updated_at;
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
    async listObjects(prefix) { return call('/storage/v1/object/list/noema-private', { method: 'POST', body: { prefix: `${uid()}/${prefix}`, limit: 1000, sortBy: { column: 'name', order: 'asc' } } }); },
    async uploadPack(p) { return this.uploadObject(`packs/${p.subject.id}.json`, new Blob([JSON.stringify(p)], { type: 'application/json' }), 'application/json'); },
    async downloadPack(id) { const r = await this.downloadObject(`packs/${id}.json`); return r.json(); },
    async listPacks() { return (await this.listObjects('packs/')).filter(o => o.name.endsWith('.json')).map(o => o.name.replace(/\.json$/, '')); },
    /* ---------- OAuth consent for the Claude connector (Supabase OAuth 2.1 server, docs/CLAUDE_CONNECTOR.md) ---------- */
    async oauthDetails(id) { return call('/auth/v1/oauth/authorizations/' + enc(id)); },
    async oauthConsent(id, action) { return call('/auth/v1/oauth/authorizations/' + enc(id) + '/consent', { method: 'POST', body: { action } }); },
    async uploadFile(folder, file) { return this.uploadObject(`${folder}/${file.name}`, file, file.type || 'application/octet-stream'); },
  };
})();
