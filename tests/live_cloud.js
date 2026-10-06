/* Live check of the REAL Supabase project (TD-5) — the same self-test as the app's "🩺 Check the cloud connection".
     node tests/live_cloud.js                      → anonymous checks only (project reachable, tables + rules installed)
     NOEMA_LIVE_EMAIL=… NOEMA_LIVE_PASSWORD=… node tests/live_cloud.js
                                                   → + a full round trip with that (existing, confirmed) account; cleans up after itself
   Optional: --url https://<ref>.supabase.co --key sb_publishable_…   (default: from config.js). Works on macOS, Windows and Linux (Node ≥ 18). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const store = new Map();
const ctx = { console, fetch, Blob, URL, setTimeout, clearTimeout, Date, JSON, Promise, encodeURIComponent,
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  document: { addEventListener() { } }, addEventListener() { } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx);
const CFG = Object.assign({}, ctx.NOEMA_CONFIG, arg('--url') ? { supabaseUrl: arg('--url') } : {}, arg('--key') ? { supabaseKey: arg('--key') } : {});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine', 'cloud.js'), 'utf8'), ctx);
const C = ctx.NoemaCloud;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
(async () => {
  if (!CFG.supabaseUrl) { console.log('config.js has no supabaseUrl — nothing to check.'); return; }
  console.log(`— anonymous checks: ${CFG.supabaseUrl}`);
  await C.init(CFG);
  const anon = async p => { const r = await fetch(CFG.supabaseUrl + p, { headers: { apikey: CFG.supabaseKey } }); return { status: r.status, body: await r.text() }; };
  for (const t of ['noema_profiles', 'noema_kv', 'noema_snapshots', 'noema_conversations', 'noema_public_packs', 'noema_shares']) {
    const r = await anon(`/rest/v1/${t}?select=*&limit=1`);
    ok(r.status === 200, `table ${t} ${r.status === 200 ? 'installed' : 'MISSING → run cloud/supabase.sql (' + r.body.slice(0, 80) + ')'}`);
  }
  const syn = await anon('/rest/v1/noema_conversations?select=synced_at&limit=1');
  ok(syn.status === 200, 'conversations.synced_at ' + (syn.status === 200 ? 'present' : 'missing → run the newest cloud/supabase.sql'));
  const leak = await anon('/rest/v1/noema_kv?select=*&limit=5');
  ok(leak.status === 200 && leak.body.trim() === '[]', 'signed-out visitors see no private rows (row-level security on)');
  const email = process.env.NOEMA_LIVE_EMAIL, pw = process.env.NOEMA_LIVE_PASSWORD;
  if (!email || !pw) { console.log('\n(set NOEMA_LIVE_EMAIL and NOEMA_LIVE_PASSWORD for the full round trip with a real account)'); }
  else {
    console.log(`— full round trip as ${email}`);
    await C.signIn(email, pw);
    const res = await C.selfTest();
    res.forEach(r => ok(r.ok, `${r.name} (${r.ms} ms)${r.ok ? '' : ' — ' + r.error + '\n       👉 ' + r.hint}`));
    await C.signOut();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
