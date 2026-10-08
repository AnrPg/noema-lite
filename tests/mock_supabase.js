/* Minimal in-memory Supabase emulator (Auth + PostgREST subset + Storage subset) for e2e tests.
   Enforces per-user isolation like the RLS policies in cloud/supabase.sql. Also serves a static folder. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
function start({ port = 54321, staticDir = null, configOverride = null, maxObject = Infinity } = {}) {   // maxObject: like Supabase's per-file upload limit
  const users = {}, tokens = {}, kv = {}, snaps = [], profiles = {}, files = {}, signed = {}, pubFiles = {}, shrFiles = {}, pubPacks = [], shares = []; let snapId = 1;
  const json = (res, code, obj, extra = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors, extra)); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,x-upsert', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
  const session = u => { const at = crypto.randomUUID(), rt = crypto.randomUUID(); tokens[at] = u.id; tokens['r:' + rt] = u.id; return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email, user_metadata: u.meta } }; };
  const who = req => tokens[(req.headers.authorization || '').replace('Bearer ', '')];
  /* ---------- 👥 shared curricula: tables noema_curricula_shared / _members / _steps + bucket noema-curricula ---------- */
  const curs = {}, mems = [], steps = [], curFiles = {}; const now = () => new Date().toISOString();
  const emailOf = uid => uid && users[uid] ? users[uid].email.toLowerCase() : '';
  const access = (cid, uid) => {
    const c = curs[cid]; if (!c) return null; const em = emailOf(uid);
    if (uid && c.owner === uid) return 'owner';
    if (uid && mems.some(m => m.curriculum === cid && m.user_id === uid && m.status === 'joined')) return 'member';
    if (uid && mems.some(m => m.curriculum === cid && m.email === em && m.status === 'pending')) return 'invited';
    return c.public ? 'public' : null;
  };
  const filt = (rows, sp) => rows.filter(r => { for (const [k, v] of sp) { if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue; const m = /^(eq|neq|lt|gt|in)\.([\s\S]*)$/.exec(v); if (!m) continue; const x = r[k];
    if (m[1] === 'eq' && String(x) !== m[2]) return false; if (m[1] === 'neq' && String(x) === m[2]) return false;
    if (m[1] === 'lt' && !(x != null && Date.parse(x) < Date.parse(m[2]))) return false; if (m[1] === 'gt' && !(x != null && Date.parse(x) > Date.parse(m[2]))) return false;
    if (m[1] === 'in' && !m[2].replace(/^\(|\)$/g, '').split(',').includes(String(x))) return false; } return true; });
  const rls = res => json(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
  const dupe = res => json(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
  const repr = (req, res, code, rows) => /representation/.test(req.headers.prefer || '') ? json(res, code, rows) : json(res, code === 201 ? 201 : 204);
  const folder = k => k.split('/');
  const canWriteFile = (k, uid) => { const f = folder(k), a = access(f[0], uid); return (f[1] === 'steps' && f[2] === uid && ['owner', 'member'].includes(a)) || (f[1] === 'files' && a === 'owner'); };
  function sharedCurricula(req, res, p, u, uid, data, buf) {
    const sp = [...u.searchParams.entries()], M = req.method, em = emailOf(uid);
    if (p === '/rest/v1/noema_curricula_shared') {
      const vis = Object.values(curs).filter(c => access(c.id, uid));
      if (M === 'GET') return json(res, 200, filt(vis, sp).sort((a, b) => a.updated_at < b.updated_at ? 1 : -1));
      if (!uid) return json(res, 401, { message: 'JWT required' });
      if (M === 'POST') { const out = []; for (const r of data) { const row = { owner: uid, public: false, meta: {}, version: 1, published_at: now(), updated_at: now(), ...r }; if (row.owner !== uid || !/^c[a-z0-9]{2,30}$/.test(row.id)) return rls(res); if (curs[row.id]) return dupe(res); curs[row.id] = row; out.push(row); } return repr(req, res, 201, out); }
      const mine = filt(vis.filter(c => c.owner === uid), sp);
      if (M === 'PATCH') { if (data.owner && data.owner !== uid) return rls(res); for (const c of mine) Object.assign(c, data, { id: c.id, owner: c.owner, updated_at: now() }); return repr(req, res, 200, mine); }
      if (M === 'DELETE') { for (const c of mine) { delete curs[c.id]; for (let i = mems.length - 1; i >= 0; i--) if (mems[i].curriculum === c.id) mems.splice(i, 1); for (let i = steps.length - 1; i >= 0; i--) if (steps[i].curriculum === c.id) steps.splice(i, 1); } return json(res, 204); }
    }
    if (p === '/rest/v1/noema_curriculum_members') {
      if (!uid) return json(res, 401, { message: 'JWT required' });
      const vis = mems.filter(m => m.user_id === uid || m.email === em || access(m.curriculum, uid) === 'owner');
      if (M === 'GET') return json(res, 200, filt(vis, sp).sort((a, b) => a.created_at < b.created_at ? -1 : 1));
      if (M === 'POST') { const out = []; for (const r of data) { const row = { user_id: null, name: null, status: 'pending', invited_by: uid, message: null, created_at: now(), responded_at: null, ...r };
        const invite = access(row.curriculum, uid) === 'owner' && row.status === 'pending' && !row.user_id, join = row.status === 'joined' && row.user_id === uid && row.email === em && curs[row.curriculum]?.public;
        if (!invite && !join) return rls(res); if (mems.some(m => m.curriculum === row.curriculum && m.email === row.email)) return dupe(res); mems.push(row); out.push(row); } return repr(req, res, 201, out); }
      if (M === 'PATCH') { const out = [];
        for (const m of filt(vis, sp)) { const own = access(m.curriculum, uid) === 'owner', self = (m.user_id === uid || m.email === em) && m.status !== 'revoked'; if (!own && !self) continue;
          const nx = { ...m, ...data, curriculum: m.curriculum, email: m.email }; if (!own && !(nx.email === em && nx.user_id === uid && ['joined', 'rejected', 'left'].includes(nx.status))) return rls(res); Object.assign(m, nx); out.push(m); }
        return repr(req, res, 200, out); }
      if (M === 'DELETE') { for (const m of filt(vis, sp)) if (m.user_id === uid || access(m.curriculum, uid) === 'owner') mems.splice(mems.indexOf(m), 1); return json(res, 204); }
    }
    if (p === '/rest/v1/noema_curriculum_steps') {
      const vis = steps.filter(r => access(r.curriculum, uid));
      if (M === 'GET') return json(res, 200, filt(vis, sp).sort((a, b) => a.node_id < b.node_id ? -1 : 1));
      if (!uid) return json(res, 401, { message: 'JWT required' });
      const part = cid => ['owner', 'member'].includes(access(cid, uid));
      if (M === 'POST') { const out = []; for (const r of data) { const row = { author: uid, author_name: null, pack_id: null, version: null, path: null, meta: {}, claimed_until: null, created_at: now(), updated_at: now(), ...r };
        if (row.author !== uid || !part(row.curriculum) || !curs[row.curriculum]?.record?.nodes?.[row.node_id] || !['preparing', 'ready'].includes(row.status)) return rls(res);
        if (steps.some(x => x.curriculum === row.curriculum && x.node_id === row.node_id)) return dupe(res); steps.push(row); out.push(row); } return repr(req, res, 201, out); }
      if (M === 'PATCH') { const out = [], t = Date.now();
        for (const r of filt(vis, sp)) { if (!part(r.curriculum) || !(r.author === uid || (r.status === 'preparing' && Date.parse(r.claimed_until || 0) < t))) continue;
          const nx = { ...r, ...data, curriculum: r.curriculum, node_id: r.node_id, updated_at: new Date(Math.max(t, Date.parse(r.updated_at) + 1)).toISOString() }; if (nx.author !== uid) return rls(res); Object.assign(r, nx); out.push(r); }
        server.state.stepWrites++; return repr(req, res, 200, out); }
      if (M === 'DELETE') { for (const r of filt(vis, sp)) if (r.author === uid || access(r.curriculum, uid) === 'owner') steps.splice(steps.indexOf(r), 1); return json(res, 204); }
    }
    let m;
    if (p === '/storage/v1/object/list/noema-curricula') return json(res, 200, []);
    if ((m = p.match(/^\/storage\/v1\/object\/noema-curricula$/)) && M === 'DELETE') { for (const k of data.prefixes || []) { const f = folder(k); if ((f[1] === 'steps' && f[2] === uid) || access(f[0], uid) === 'owner') delete curFiles[k]; } return json(res, 200, []); }
    if ((m = p.match(/^\/storage\/v1\/object\/noema-curricula\/(.+)$/)) && M === 'POST') { const k = decodeURIComponent(m[1]); if (!uid || !canWriteFile(k, uid)) return rls(res); curFiles[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-curricula/' + k }); }
    if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/noema-curricula\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (!uid || !access(folder(k)[0], uid) || !curFiles[k]) return json(res, 404, { message: 'Object not found' }); res.writeHead(200, Object.assign({ 'Content-Type': curFiles[k].type || 'application/octet-stream' }, cors)); return res.end(curFiles[k].data); }
    if ((m = p.match(/^\/storage\/v1\/object\/sign\/noema-curricula\/(.+)$/)) && M === 'POST') { const k = decodeURIComponent(m[1]); if (!uid || !access(folder(k)[0], uid) || !curFiles[k]) return json(res, 400, { message: 'Object not found' }); const t = crypto.randomUUID(); signed[t] = 'cdl:' + k; return json(res, 200, { signedURL: `/object/sign/noema-curricula/${m[1]}?token=${t}` }); }
    if ((m = p.match(/^\/storage\/v1\/object\/sign\/noema-curricula\/(.+)$/)) && M === 'GET') { const k = decodeURIComponent(m[1]); if (signed[u.searchParams.get('token')] !== 'cdl:' + k || !curFiles[k]) return json(res, 400, { message: 'invalid signature' }); res.writeHead(200, Object.assign({ 'Content-Type': curFiles[k].type || 'application/octet-stream' }, cors)); return res.end(curFiles[k].data); }
    return undefined;
  }
  const server = http.createServer((req, res) => {
    let body = []; req.on('data', c => body.push(c)); req.on('end', () => {
      const buf = Buffer.concat(body); const txt = buf.toString(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { }
      const u = new URL(req.url, 'http://x'); const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      server.log.push(`${req.method} ${p}${u.search}`);
      // Supabase refuses objects above the per-file limit (free plan: 50 MB) → the app / Claude upload big files in parts
      if (/^\/storage\/v1\/object\/(?!list\/|sign\/)/.test(p) && ['POST', 'PUT'].includes(req.method) && !/\/object\/upload\/sign\/[^?]+$/.test(p) || (/\/object\/upload\/sign\//.test(p) && req.method === 'PUT')) { if (buf.length > maxObject) return json(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }); }
      // ---- signed storage URLs (no apikey / Authorization needed: the token in the URL authorizes)
      let sm;
      if ((sm = p.match(/^\/storage\/v1\/object\/upload\/sign\/noema-private\/(.+)$/)) && req.method === 'PUT') { const k = decodeURIComponent(sm[1]); if (signed[u.searchParams.get('token')] !== 'up:' + k) return json(res, 400, { message: 'invalid signature' }); files[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-private/' + k }); }
      if ((sm = p.match(/^\/storage\/v1\/object\/sign\/noema-private\/(.+)$/)) && req.method === 'GET') { const k = decodeURIComponent(sm[1]); if (signed[u.searchParams.get('token')] !== 'dl:' + k || !files[k]) return json(res, 400, { message: 'invalid signature' }); res.writeHead(200, Object.assign({ 'Content-Type': files[k].type || 'application/octet-stream' }, cors)); return res.end(files[k].data); }
      if (p === '/oauth-callback') { server.state.callbacks.push(u.search); res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<h1>back in Claude</h1>'); }
      const api = /^\/(auth|rest|storage)\/v1\//.test(p);
      if (api && !req.headers.apikey && !p.startsWith('/storage/v1/object/public/')) return  /* public bucket URLs work without a key, like <img src> */ json(res, 401, { message: 'No API key found in request' });
      const authz = req.headers.authorization; if (api && authz && !tokens[authz.replace('Bearer ', '')]) return json(res, 401, { message: 'Invalid JWT' });
      // ---- auth
      if (p === '/auth/v1/signup') { if (Object.values(users).some(x => x.email === data.email)) return json(res, 422, { msg: 'User already registered' }); const usr = { id: crypto.randomUUID(), email: data.email, pw: data.password, meta: data.data || {} }; users[usr.id] = usr; return json(res, 200, session(usr)); }
      if (p === '/auth/v1/token') {
        const g = u.searchParams.get('grant_type');
        if (g === 'password') { const usr = Object.values(users).find(x => x.email === data.email && x.pw === data.password); return usr ? json(res, 200, session(usr)) : json(res, 400, { error_description: 'Invalid login credentials' }); }
        if (g === 'refresh_token') { const id = tokens['r:' + data.refresh_token]; return id ? json(res, 200, session(users[id])) : json(res, 400, { error_description: 'Invalid Refresh Token' }); }
      }
      if (p === '/auth/v1/logout' || p === '/auth/v1/recover') return json(res, 204);
      const uid = who(req);
      const q = k => (u.searchParams.get(k) || '').replace(/^(eq|gt)\./, '');
      // ---- 👥 shared curricula (rules as in cloud/supabase.sql §10; anonymous reads of public ones)
      sharedCurricula(req, res, p, u, uid, data, buf); if (res.headersSent) return;
      // ---- anonymous reads: public packs + public bucket
      if (p === '/rest/v1/noema_public_packs' && req.method === 'GET') { const o = q('owner'); return json(res, 200, pubPacks.filter(r => !o || r.owner === o).slice().sort((a, b) => a.updated_at < b.updated_at ? 1 : -1)); }
      let pm;
      if ((pm = p.match(/^\/storage\/v1\/object\/public\/noema-public\/(.+)$/))) { const k = decodeURIComponent(pm[1]); if (!pubFiles[k]) return json(res, 404, { message: 'not found' }); res.writeHead(200, Object.assign({ 'Content-Type': pubFiles[k].type || 'application/octet-stream' }, cors)); return res.end(pubFiles[k].data); }
      if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) { if (!uid) return json(res, 401, { message: 'JWT required' }); }
      const myEmail = uid && users[uid].email.toLowerCase();
      // ---- public packs (owner only writes)
      if (p === '/rest/v1/noema_public_packs') {
        if (req.method === 'POST') { for (const r of data) { if (r.owner !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); const i = pubPacks.findIndex(x => x.owner === r.owner && x.subject_id === r.subject_id); const row = Object.assign({ published_at: new Date().toISOString() }, i >= 0 ? pubPacks[i] : {}, r); if (i >= 0) pubPacks[i] = row; else pubPacks.push(row); } return json(res, 201); }
        if (req.method === 'DELETE') { const i = pubPacks.findIndex(x => x.owner === uid && x.owner === q('owner') && x.subject_id === q('subject_id')); if (i >= 0) pubPacks.splice(i, 1); return json(res, 204); }
      }
      // ---- shares (sender / recipient rules as in cloud/supabase.sql)
      if (p === '/rest/v1/noema_shares') {
        const visible = shares.filter(x => x.from_user === uid || x.to_email === myEmail);
        if (req.method === 'GET') return json(res, 200, visible.filter(x => (!q('to_email') || x.to_email === decodeURIComponent(q('to_email'))) && (!q('status') || x.status === q('status')) && (!q('from_user') || x.from_user === q('from_user')) && (!q('id') || x.id === q('id'))));
        if (req.method === 'POST') { const out = []; for (const r of data) { if (r.from_user !== uid || (r.status && r.status !== 'pending') || r.to_email !== r.to_email.toLowerCase()) return json(res, 403, { message: 'new row violates row-level security policy' }); const row = Object.assign({ id: crypto.randomUUID(), status: 'pending', created_at: new Date().toISOString(), responded_at: null }, r); shares.push(row); out.push(row); } return json(res, 201, out); }
        const row = visible.find(x => x.id === q('id'));
        if (req.method === 'PATCH') { if (!row) return json(res, 204); const okR = row.to_email === myEmail && ['accepted', 'rejected'].includes(data.status); const okS = row.from_user === uid; if (!okR && !okS) return json(res, 403, { message: 'rls' }); Object.assign(row, data); return json(res, 204); }
        if (req.method === 'DELETE') { if (row && row.from_user === uid) shares.splice(shares.indexOf(row), 1); return json(res, 204); }
      }
      if (p === '/auth/v1/user') { if (!uid) return json(res, 401, { msg: 'invalid JWT' }); const usr = users[uid]; return json(res, 200, { id: usr.id, email: usr.email, user_metadata: usr.meta }); }
      let om;
      if ((om = p.match(/^\/auth\/v1\/oauth\/authorizations\/([^/]+)(\/consent)?$/))) {
        if (!uid) return json(res, 401, { msg: 'login required' });
        const a = server.state.authz[om[1]]; if (!a) return json(res, 404, { msg: 'authorization not found' });
        if (!om[2]) return json(res, 200, { authorization_id: om[1], redirect_uri: a.redirect_uri, client: { client_id: 'claude-dcr-1', client_name: 'Claude' }, user: { id: uid, email: users[uid].email }, scope: 'openid email profile' });
        server.state.consents.push({ id: om[1], action: data.action, uid });
        return json(res, 200, { redirect_url: a.redirect_uri + (data.action === 'approve' ? '?code=code-' + om[1] + '&state=s1' : '?error=access_denied&state=s1') });
      }
      // ---- PostgREST subset
      if (p === '/rest/v1/noema_profiles') { (data || []).forEach(r => { if (r.user_id !== uid) return; profiles[uid] = r; }); return json(res, 201); }
      if (p === '/rest/v1/noema_kv') {
        kv[uid] = kv[uid] || {};
        const kq = u.searchParams.get('key') || '', likeRe = /^like\./.test(kq) ? new RegExp('^' + kq.slice(5).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null;   // PostgREST like.<pattern> (* = %)
        if (req.method === 'GET') return json(res, 200, Object.entries(kv[uid]).filter(([key]) => likeRe ? likeRe.test(key) : !q('key') || key === decodeURIComponent(q('key'))).sort(([a], [b]) => a < b ? -1 : 1).map(([key, v]) => ({ key, value: v.value, updated_at: v.updated_at })));
        if (req.method === 'POST') {   // upsert (merge-duplicates) or insert-if-absent (ignore-duplicates); return=representation → the rows written
          const pref = req.headers.prefer || '', keep = /ignore-duplicates/.test(pref), out = [];
          for (const r of data) { if (r.user_id !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); if (keep && kv[uid][r.key]) continue; kv[uid][r.key] = { value: r.value, updated_at: r.updated_at }; out.push({ user_id: uid, key: r.key, value: r.value, updated_at: r.updated_at }); }
          return /representation/.test(pref) ? json(res, 201, out) : json(res, 201);
        }
        if (req.method === 'PATCH') {   // ?key=eq.K[&updated_at=lt.T] — a conditional update; return=representation → the rows updated
          const k = decodeURIComponent(q('key') || ''), lt = u.searchParams.get('updated_at'), row = kv[uid][k], out = [];
          if (row && (!lt || !/^lt\./.test(lt) || Date.parse(row.updated_at) < Date.parse(lt.slice(3)))) { Object.assign(row, data.value != null ? { value: data.value } : {}, data.updated_at ? { updated_at: data.updated_at } : {}); out.push({ user_id: uid, key: k, ...row }); }
          return /representation/.test(req.headers.prefer || '') ? json(res, 200, out) : json(res, 204);
        }
        if (req.method === 'DELETE') { const k = decodeURIComponent(q('key')); delete kv[uid][k]; return json(res, 204); }
      }
      if (p === '/rest/v1/noema_conversations') {
        server.state.convs[uid] = server.state.convs[uid] || {};
        if (req.method === 'POST') { for (const r of data) { if (r.user_id !== uid) return json(res, 403, { message: 'rls' }); server.state.convs[uid][r.id] = Object.assign({}, r, { synced_at: new Date(Date.now() + (server.state.seq = (server.state.seq || 0) + 1)).toISOString() }); } return json(res, 201); }
        if (req.method === 'DELETE') { delete server.state.convs[uid][decodeURIComponent(q('id'))]; return json(res, 204); }
        if (q('id')) return json(res, 200, Object.values(server.state.convs[uid]).filter(r => r.id === decodeURIComponent(q('id'))).map(r => ({ id: r.id, synced_at: r.synced_at })));
        const col = /synced_at/.test(u.searchParams.get('order') || '') ? 'synced_at' : 'updated_at';
        const gt = decodeURIComponent(q(col));
        return json(res, 200, Object.values(server.state.convs[uid]).filter(r => !gt || r[col] > gt).sort((a, b) => a[col] < b[col] ? -1 : 1).map(r => ({ record: r.record, updated_at: r.updated_at, synced_at: r.synced_at })));
      }
      if (p === '/rest/v1/noema_snapshots') {
        if (req.method === 'POST') { const rows = data.map(r => ({ id: snapId++, user_id: uid, label: r.label, data: r.data, size_bytes: r.size_bytes, created_at: new Date().toISOString() })); snaps.push(...rows); return json(res, 201, /representation/.test(req.headers.prefer || '') ? rows.map(({ data, ...x }) => x) : undefined); }
        const mine = snaps.filter(s => s.user_id === uid);
        const idf = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        if (req.method === 'DELETE') { const i = snaps.findIndex(s => s.user_id === uid && String(s.id) === idf); if (i >= 0) snaps.splice(i, 1); return json(res, 204); }
        if (idf) return json(res, 200, mine.filter(s => String(s.id) === idf).map(s => ({ data: s.data })));
        return json(res, 200, mine.slice().reverse().map(({ data, user_id, ...rest }) => rest));
      }
      // ---- Storage subset
      let m;
      if ((m = p.match(/^\/storage\/v1\/object\/list\/noema-private$/))) { const pre = data.prefix.replace(/\/+$/, '') + '/'; if (pre.split('/')[0] !== uid) return json(res, 200, []); return json(res, 200, Object.keys(files).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ name: k.slice(pre.length), metadata: { size: files[k].data.length } }))); }
      if (p === '/storage/v1/object/list/noema-shared') return json(res, 200, []);
      if ((m = p.match(/^\/storage\/v1\/object\/(noema-private|noema-public|noema-shared)$/)) && req.method === 'DELETE') {
        for (const k of data.prefixes || []) {
          if (m[1] === 'noema-private' && k.split('/')[0] === uid) delete files[k];
          if (m[1] === 'noema-public' && k.split('/')[0] === uid) delete pubFiles[k];
          if (m[1] === 'noema-shared') { const sh = shares.find(x => x.id === k.split('.')[0]); if (sh && sh.from_user === uid) delete shrFiles[k]; }
        }
        return json(res, 200, []);
      }
      if ((m = p.match(/^\/storage\/v1\/object\/noema-public\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); pubFiles[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-public/' + k }); }
      if ((m = p.match(/^\/storage\/v1\/object\/noema-shared\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); const sh = shares.find(x => x.id === k.split('.')[0]); if (!sh || sh.from_user !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); shrFiles[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-shared/' + k }); }
      if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/noema-shared\/(.+)$/))) { const k = decodeURIComponent(m[1]); const sh = shares.find(x => x.id === k.split('.')[0]); if (!sh || !(sh.from_user === uid || sh.to_email === myEmail) || !shrFiles[k]) return json(res, 404, { message: 'Object not found' }); res.writeHead(200, Object.assign({ 'Content-Type': shrFiles[k].type || 'application/octet-stream' }, cors)); return res.end(shrFiles[k].data); }
      if ((m = p.match(/^\/storage\/v1\/object\/upload\/sign\/noema-private\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'rls' }); const t = crypto.randomUUID(); signed[t] = 'up:' + k; return json(res, 200, { url: `/object/upload/sign/noema-private/${k}?token=${t}`, token: t }); }
      if ((m = p.match(/^\/storage\/v1\/object\/sign\/noema-private\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid || !files[k]) return json(res, 400, { message: 'Object not found' }); const t = crypto.randomUUID(); signed[t] = 'dl:' + k; return json(res, 200, { signedURL: `/object/sign/noema-private/${k}?token=${t}` }); }
      if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/noema-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid || !files[k]) return json(res, 404, { message: 'Object not found' }); res.writeHead(200, Object.assign({ 'Content-Type': files[k].type || 'application/octet-stream' }, cors)); return res.end(files[k].data); }
      if ((m = p.match(/^\/storage\/v1\/object\/noema-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); files[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-private/' + k }); }
      // ---- /api/img: the picture fetcher Netlify function (cloud/img/proxy.mjs), run in-process; local hosts allowed in tests
      if (p === '/api/img' || p === '/api/file' || p === '/api/imgsearch') {
        globalThis.NOEMA_IMG_ALLOW_LOCAL = true; require(path.join(__dirname, '..', 'engine', 'imglib.js'));   // as tools/build.py prepends it
        return import(require('url').pathToFileURL(path.join(__dirname, '..', 'cloud', 'img', 'proxy.mjs')).href).then(async mod => {
          const r = await mod.default(new Request('http://localhost:' + port + req.url, { headers: req.headers.origin ? { origin: req.headers.origin } : {} }));
          const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
        }).catch(e => json(res, 500, { message: e.message }));
      }
      // ---- static site
      if (staticDir) {
        if (configOverride && p === '/config.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(configOverride); }
        let fp = path.join(staticDir, decodeURIComponent(p.endsWith('/') ? p + 'index.html' : p));
        if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
        if (fp.startsWith(staticDir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          const ext = path.extname(fp); const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.zip': 'application/zip', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
          res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); return res.end(fs.readFileSync(fp));
        }
      }
      json(res, 404, { message: 'not found ' + p });
    });
  });
  server.log = []; server.state = { users, kv, snaps, files, profiles, convs: {}, authz: {}, consents: [], callbacks: [], pubFiles, shrFiles, pubPacks, shares, curs, mems, steps, curFiles, stepWrites: 0 };
  return new Promise(r => server.listen(port, () => r(server)));
}
module.exports = { start };
