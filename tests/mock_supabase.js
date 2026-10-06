/* Minimal in-memory Supabase emulator (Auth + PostgREST subset + Storage subset) for e2e tests.
   Enforces per-user isolation like the RLS policies in cloud/supabase.sql. Also serves a static folder. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
function start({ port = 54321, staticDir = null, configOverride = null } = {}) {
  const users = {}, tokens = {}, kv = {}, snaps = [], profiles = {}, files = {}, signed = {}; let snapId = 1;
  const json = (res, code, obj, extra = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors, extra)); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,x-upsert', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
  const session = u => { const at = crypto.randomUUID(), rt = crypto.randomUUID(); tokens[at] = u.id; tokens['r:' + rt] = u.id; return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email, user_metadata: u.meta } }; };
  const who = req => tokens[(req.headers.authorization || '').replace('Bearer ', '')];
  const server = http.createServer((req, res) => {
    let body = []; req.on('data', c => body.push(c)); req.on('end', () => {
      const buf = Buffer.concat(body); const txt = buf.toString(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { }
      const u = new URL(req.url, 'http://x'); const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      server.log.push(`${req.method} ${p}${u.search}`);
      // ---- signed storage URLs (no apikey / Authorization needed: the token in the URL authorizes)
      let sm;
      if ((sm = p.match(/^\/storage\/v1\/object\/upload\/sign\/noema-private\/(.+)$/)) && req.method === 'PUT') { const k = decodeURIComponent(sm[1]); if (signed[u.searchParams.get('token')] !== 'up:' + k) return json(res, 400, { message: 'invalid signature' }); files[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-private/' + k }); }
      if ((sm = p.match(/^\/storage\/v1\/object\/sign\/noema-private\/(.+)$/)) && req.method === 'GET') { const k = decodeURIComponent(sm[1]); if (signed[u.searchParams.get('token')] !== 'dl:' + k || !files[k]) return json(res, 400, { message: 'invalid signature' }); res.writeHead(200, Object.assign({ 'Content-Type': files[k].type }, cors)); return res.end(files[k].data); }
      if (p === '/oauth-callback') { server.state.callbacks.push(u.search); res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<h1>back in Claude</h1>'); }
      const api = /^\/(auth|rest|storage)\/v1\//.test(p);
      if (api && !req.headers.apikey) return json(res, 401, { message: 'No API key found in request' });
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
      if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) { if (!uid) return json(res, 401, { message: 'JWT required' }); }
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
        if (req.method === 'GET') return json(res, 200, Object.entries(kv[uid]).map(([key, v]) => ({ key, value: v.value, updated_at: v.updated_at })));
        if (req.method === 'POST') { for (const r of data) { if (r.user_id !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); kv[uid][r.key] = { value: r.value, updated_at: r.updated_at }; } return json(res, 201); }
        if (req.method === 'DELETE') { const k = (u.searchParams.get('key') || '').replace(/^eq\./, ''); delete kv[uid][k]; return json(res, 204); }
      }
      if (p === '/rest/v1/noema_conversations') {
        server.state.convs[uid] = server.state.convs[uid] || {};
        if (req.method === 'POST') { for (const r of data) { if (r.user_id !== uid) return json(res, 403, { message: 'rls' }); server.state.convs[uid][r.id] = r; } return json(res, 201); }
        const gt = (u.searchParams.get('updated_at') || '').replace(/^gt\./, '');
        return json(res, 200, Object.values(server.state.convs[uid]).filter(r => !gt || r.updated_at > gt).sort((a, b) => a.updated_at < b.updated_at ? -1 : 1).map(r => ({ record: r.record, updated_at: r.updated_at })));
      }
      if (p === '/rest/v1/noema_snapshots') {
        if (req.method === 'POST') { data.forEach(r => snaps.push({ id: snapId++, user_id: uid, label: r.label, data: r.data, size_bytes: r.size_bytes, created_at: new Date().toISOString() })); return json(res, 201); }
        const mine = snaps.filter(s => s.user_id === uid);
        const idf = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        if (req.method === 'DELETE') { const i = snaps.findIndex(s => s.user_id === uid && String(s.id) === idf); if (i >= 0) snaps.splice(i, 1); return json(res, 204); }
        if (idf) return json(res, 200, mine.filter(s => String(s.id) === idf).map(s => ({ data: s.data })));
        return json(res, 200, mine.slice().reverse().map(({ data, user_id, ...rest }) => rest));
      }
      // ---- Storage subset
      let m;
      if ((m = p.match(/^\/storage\/v1\/object\/list\/noema-private$/))) { const pre = data.prefix; return json(res, 200, Object.keys(files).filter(k => k.startsWith(pre)).map(k => ({ name: k.slice(pre.length), metadata: { size: files[k].data.length } }))); }
      if ((m = p.match(/^\/storage\/v1\/object\/upload\/sign\/noema-private\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'rls' }); const t = crypto.randomUUID(); signed[t] = 'up:' + k; return json(res, 200, { url: `/object/upload/sign/noema-private/${k}?token=${t}`, token: t }); }
      if ((m = p.match(/^\/storage\/v1\/object\/sign\/noema-private\/(.+)$/)) && req.method === 'POST') { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid || !files[k]) return json(res, 400, { message: 'Object not found' }); const t = crypto.randomUUID(); signed[t] = 'dl:' + k; return json(res, 200, { signedURL: `/object/sign/noema-private/${k}?token=${t}` }); }
      if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/noema-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid || !files[k]) return json(res, 404, { message: 'Object not found' }); res.writeHead(200, Object.assign({ 'Content-Type': files[k].type }, cors)); return res.end(files[k].data); }
      if ((m = p.match(/^\/storage\/v1\/object\/noema-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); files[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-private/' + k }); }
      // ---- static site
      if (staticDir) {
        if (configOverride && p === '/config.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(configOverride); }
        let fp = path.join(staticDir, decodeURIComponent(p.endsWith('/') ? p + 'index.html' : p));
        if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
        if (fp.startsWith(staticDir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          const ext = path.extname(fp); const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
          res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); return res.end(fs.readFileSync(fp));
        }
      }
      json(res, 404, { message: 'not found ' + p });
    });
  });
  server.log = []; server.state = { users, kv, snaps, files, profiles, convs: {}, authz: {}, consents: [], callbacks: [] };
  return new Promise(r => server.listen(port, () => r(server)));
}
module.exports = { start };
