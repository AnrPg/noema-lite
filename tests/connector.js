/* The Claude connector (cloud/mcp/server.mjs) against the Supabase emulator: OAuth discovery, MCP protocol,
   upload → check → register, and the app side (consent page, the subject appearing in the picker).
   Usage: node tests/connector.js <prepared-repo-dir>   (needs dist/site and the demo-physics fixture) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const PORT = 54331, BASE = `http://localhost:${PORT}`;

(async () => {
  const cfgJs = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', autoBackupMinutes: 5, askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfgJs });
  // the function exactly as tools/build.py generates it, but pointed at the emulator
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [{ id: 'databricks', title: 'Databricks', counts: { chapters: 13, exercises: 1715 } }] };
  const DOCS = { workflow: fs.readFileSync(path.join(ROOT, 'skill/noema-pack-builder/SKILL.md'), 'utf8'), content: fs.readFileSync(path.join(ROOT, 'tools/CONTENT_SPEC.md'), 'utf8'), visual: fs.readFileSync(path.join(ROOT, 'docs/VISUAL.md'), 'utf8') };
  const fn = path.join(os.tmpdir(), `noema-mcp-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify(DOCS)};\n` + fs.readFileSync(path.join(ROOT, 'engine/packcheck.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));   // as tools/build.py assembles it
  const { default: handler } = await import(fn);
  const call = async (body, token, method = 'POST', url = BASE + '/mcp') => {
    const r = await handler(new Request(url, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: method === 'POST' ? JSON.stringify(body) : undefined }));
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { }
    return { status: r.status, headers: r.headers, json: j, text: t };
  };
  console.log('— OAuth discovery & protocol');
  const un = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  ok(un.status === 401 && /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/.test(un.headers.get('www-authenticate') || ''), 'no token → 401 with the resource_metadata pointer (starts Claude’s sign-in)');
  const prm = await call(null, null, 'GET', BASE + '/.well-known/oauth-protected-resource/mcp');
  ok(prm.json?.resource === BASE + '/mcp' && prm.json?.authorization_servers?.[0] === BASE + '/auth/v1', 'protected-resource metadata names the MCP URL and Supabase Auth as authorization server');
  ok((await call({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'forged-token')).status === 401, 'a forged token is rejected');
  const su = await (await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'claude-user@example.com', password: 'secret123' }) })).json();
  const T = su.access_token;
  const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } } }, T);
  ok(init.json?.result?.protocolVersion === '2025-06-18' && init.json.result.serverInfo.name === 'noema-lite' && init.json.result.capabilities.tools, 'initialize negotiates the protocol version');
  ok((await call({ jsonrpc: '2.0', method: 'notifications/initialized' }, T)).status === 202, 'notifications get 202 Accepted');
  const tl = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, T);
  const names = (tl.json?.result?.tools || []).map(t => t.name);
  ok(['noema_whoami', 'noema_authoring_guide', 'noema_list_subjects', 'noema_get_pack_url', 'noema_start_upload', 'noema_finish_upload', 'noema_save_pack'].every(n => names.includes(n)), 'tools/list: ' + names.join(', '));
  const tool = async (name, args) => (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }, T)).json?.result;
  const g = await tool('noema_authoring_guide', { part: 'visual' });
  ok(/minExercisesPerPicture|Pictures from the sources/.test(g.content[0].text), 'authoring guide returns the visual contract');
  ok(/claude-user@example\.com/.test((await tool('noema_whoami', {})).content[0].text), 'whoami shows the connected account');
  const tk = (await tool('noema_get_toolkit', {})).content[0].text;
  ok(tk.includes(BASE + '/downloads/noema-pack-builder.zip') && /unzip/.test(tk), 'toolkit tool: works without the skill installed (zip url + commands)');
  const zr = await fetch(BASE + '/downloads/noema-pack-builder.zip'); ok(zr.ok && (await zr.arrayBuffer()).byteLength > 10000, 'the toolkit zip is served by the website');
  const pl = await call({ jsonrpc: '2.0', id: 4, method: 'prompts/list' }, T);
  ok(pl.json?.result?.prompts?.[0]?.name === 'create_subject', 'prompts/list offers “Create a noema-lite subject”');
  const pg = await call({ jsonrpc: '2.0', id: 5, method: 'prompts/get', params: { name: 'create_subject', arguments: { title: 'Heart', language: 'el' } } }, T);
  ok(/"Heart"/.test(pg.json?.result?.messages?.[0]?.content?.text) && /noema_get_toolkit/.test(pg.json.result.messages[0].content.text), 'prompts/get fills in the title and tells Claude how to work without the skill');

  console.log('— saving a pack');
  const fx = path.join(ROOT, 'tests/fixtures/demo-physics');
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  pack.subject = { ...pack.subject, id: 'physics-by-claude', title: 'Physics by Claude', owner: null };
  ok((await tool('noema_start_upload', { subject_id: 'databricks' })).isError, 'library ids are protected');
  const su1 = await tool('noema_start_upload', { subject_id: 'physics-by-claude' });
  const url = (su1.content[0].text.match(/https?:\/\/\S+token=\S+/) || [])[0];
  ok(!!url && /apikey: sb_publishable_test/.test(su1.content[0].text), 'start_upload returns a signed URL + a curl command');
  const fin0 = await tool('noema_finish_upload', { subject_id: 'physics-by-claude' });
  ok(fin0.isError && /No uploaded file/.test(fin0.content[0].text), 'finish before upload explains what to do');
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-upsert': 'true', apikey: 'sb_publishable_test' }, body: JSON.stringify(pack) });
  ok(put.ok, 'the sandbox-side PUT to the signed URL works (like curl)');
  const fin = await tool('noema_finish_upload', { subject_id: 'physics-by-claude' });
  ok(!fin.isError && /Physics by Claude/.test(fin.content[0].text) && /11 visual/.test(fin.content[0].text), 'finish_upload checks and registers: ' + fin.content[0].text.split('\n')[0].slice(0, 110));
  const uid = Object.values(srv.state.users)[0].id;
  ok(!!srv.state.kv[uid]?.['a:packmeta:physics-by-claude'], 'registered as a:packmeta in the user’s synced key/value store (RLS: own rows only)');
  // broken pack
  const bad = JSON.parse(JSON.stringify(pack)); bad.subject.id = 'broken-pack'; bad.chapters[0].exercises[0].section = 'nope';
  const s2 = await tool('noema_start_upload', { subject_id: 'broken-pack' }); const u2 = s2.content[0].text.match(/https?:\/\/\S+token=\S+/)[0];
  await fetch(u2, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bad) });
  const fb = await tool('noema_finish_upload', { subject_id: 'broken-pack' });
  ok(fb.isError && /section nope not found/.test(fb.content[0].text) && !srv.state.kv[uid]['a:packmeta:broken-pack'], 'a broken pack is refused with the list of errors');
  const small = JSON.parse(JSON.stringify(pack)); small.subject.id = 'tiny-inline'; small.subject.title = 'Tiny inline';
  ok(!(await tool('noema_save_pack', { pack_json: JSON.stringify(small) })).isError && srv.state.kv[uid]['a:packmeta:tiny-inline'], 'save_pack stores a small pack inline');
  const ls = (await tool('noema_list_subjects', {})).content[0].text;
  ok(/databricks/.test(ls) && /physics-by-claude/.test(ls) && /tiny-inline/.test(ls), 'list_subjects shows library + private packs');
  const gu = (await tool('noema_get_pack_url', { subject_id: 'physics-by-claude' })).content[0].text.match(/https?:\/\/\S+token=\S+/)[0];
  ok((await (await fetch(gu)).json()).subject.id === 'physics-by-claude', 'get_pack_url gives a working download link (for additive updates)');
  ok(/library\/subjects\/databricks\/pack\.json/.test((await tool('noema_get_pack_url', { subject_id: 'databricks' })).content[0].text), 'library packs are offered from the website');

  console.log('— the app side');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
  srv.state.authz['az1'] = { redirect_uri: BASE + '/oauth-callback' };
  await p.goto(BASE + '/oauth/consent/?authorization_id=az1'); await wait(900);
  ok(/Connect Claude/.test(await p.locator('body').innerText()), 'Supabase’s consent URL (/oauth/consent) opens the app’s consent screen');
  await p.click('button:has-text("Sign in")'); await wait(200);
  await p.fill('input[type=email]', 'claude-user@example.com'); await p.fill('input[type=password]', 'secret123'); await p.click('.noema-form button.primary'); await wait(900);
  ok(/Claude.*wants to use your noema-lite account/.test(await p.locator('body').innerText()), 'after sign-in it shows who asks and what it may do');
  await p.screenshot({ path: '/tmp/noema_shots/c1_consent.png' });
  await p.click('button:has-text("Allow")'); await wait(900);
  ok(srv.state.consents.some(c => c.id === 'az1' && c.action === 'approve' && c.uid === uid) && /code=code-az1/.test(srv.state.callbacks.join()), 'Allow → consent approved and the browser returns to Claude’s callback');
  srv.state.authz['az2'] = { redirect_uri: BASE + '/oauth-callback' };
  await p.goto(BASE + '/oauth/consent/?authorization_id=az2'); await wait(900);
  await p.click('button:has-text("Deny")'); await wait(700);
  ok(srv.state.consents.some(c => c.id === 'az2' && c.action === 'deny') && /error=access_denied/.test(srv.state.callbacks.join()), 'Deny is passed on too');
  // the subject Claude saved shows up in the picker and opens
  await p.goto(BASE + '/'); await wait(1200);
  const acc = await p.$('.noema-acc:has-text("claude-user")'); if (acc) { await acc.click(); await wait(1200); }
  ok(!!(await p.$('.noema-chip:has-text("Physics by Claude")')), 'the pack saved by Claude is in the subject picker');
  ok(!!(await p.$('button:has-text("Create with Claude")')), 'picker offers ✨ Create with Claude');
  await p.click('button:has-text("Create with Claude")'); await wait(300);
  await p.click('.cg-choice:has-text("In the Claude app")'); await wait(300);
  const guide = await p.locator('.noema-ovbox').last().innerText();
  ok(/Upload a skill/.test(guide) && guide.includes(BASE + '/mcp') && !!(await p.$('a[href$="/downloads/noema-pack-builder.zip"]')), 'the guide shows skill download, connector URL and prompt');
  const zip = await fetch(BASE + '/downloads/noema-pack-builder.zip'); ok(zip.ok && (await zip.arrayBuffer()).byteLength > 20000, 'the skill zip is served by the website');
  await p.screenshot({ path: '/tmp/noema_shots/k2_guide.png' });
  await p.click('.noema-ovbox button:has-text("Close")'); await wait(300);
  await p.click('.noema-chip:has-text("Physics by Claude")'); await wait(1800);
  ok(await p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.id === 'physics-by-claude' && ALL_EX.length === 14), 'it opens: downloaded from the user’s private storage');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); fs.unlinkSync(fn);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
