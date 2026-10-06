/* Minimal in-memory Supabase emulator (Auth + PostgREST subset + Storage subset) for e2e tests.
   Enforces per-user isolation like the RLS policies in cloud/supabase.sql. Also serves a static folder. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
function start({ port = 54321, staticDir = null, configOverride = null } = {}) {
  const users = {}, tokens = {}, kv = {}, snaps = [], profiles = {}, files = {}; let snapId = 1;
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
      // ---- PostgREST subset
      if (p === '/rest/v1/lq_profiles') { (data || []).forEach(r => { if (r.user_id !== uid) return; profiles[uid] = r; }); return json(res, 201); }
      if (p === '/rest/v1/lq_kv') {
        kv[uid] = kv[uid] || {};
        if (req.method === 'GET') return json(res, 200, Object.entries(kv[uid]).map(([key, v]) => ({ key, value: v.value, updated_at: v.updated_at })));
        if (req.method === 'POST') { for (const r of data) { if (r.user_id !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); kv[uid][r.key] = { value: r.value, updated_at: r.updated_at }; } return json(res, 201); }
        if (req.method === 'DELETE') { const k = (u.searchParams.get('key') || '').replace(/^eq\./, ''); delete kv[uid][k]; return json(res, 204); }
      }
      if (p === '/rest/v1/lq_snapshots') {
        if (req.method === 'POST') { data.forEach(r => snaps.push({ id: snapId++, user_id: uid, label: r.label, data: r.data, size_bytes: r.size_bytes, created_at: new Date().toISOString() })); return json(res, 201); }
        const mine = snaps.filter(s => s.user_id === uid);
        const idf = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        if (req.method === 'DELETE') { const i = snaps.findIndex(s => s.user_id === uid && String(s.id) === idf); if (i >= 0) snaps.splice(i, 1); return json(res, 204); }
        if (idf) return json(res, 200, mine.filter(s => String(s.id) === idf).map(s => ({ data: s.data })));
        return json(res, 200, mine.slice().reverse().map(({ data, user_id, ...rest }) => rest));
      }
      // ---- Storage subset
      let m;
      if ((m = p.match(/^\/storage\/v1\/object\/list\/lq-private$/))) { const pre = data.prefix; return json(res, 200, Object.keys(files).filter(k => k.startsWith(pre)).map(k => ({ name: k.slice(pre.length) }))); }
      if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/lq-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid || !files[k]) return json(res, 404, { message: 'Object not found' }); res.writeHead(200, Object.assign({ 'Content-Type': files[k].type }, cors)); return res.end(files[k].data); }
      if ((m = p.match(/^\/storage\/v1\/object\/lq-private\/(.+)$/))) { const k = decodeURIComponent(m[1]); if (k.split('/')[0] !== uid) return json(res, 403, { message: 'new row violates row-level security policy' }); files[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'lq-private/' + k }); }
      // ---- static site
      if (staticDir) {
        if (configOverride && p === '/config.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(configOverride); }
        let fp = path.join(staticDir, decodeURIComponent(p === '/' ? '/index.html' : p));
        if (fp.startsWith(staticDir) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          const ext = path.extname(fp); const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
          res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); return res.end(fs.readFileSync(fp));
        }
      }
      json(res, 404, { message: 'not found ' + p });
    });
  });
  server.log = []; server.state = { users, kv, snaps, files, profiles };
  return new Promise(r => server.listen(port, () => r(server)));
}
module.exports = { start };
