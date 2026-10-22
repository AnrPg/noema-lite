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
  const cfgJs = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', autoBackupMinutes: 5, askSubjectOnStart: true, shell: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfgJs });
  // the public library may be read by other apps (Meletee fetches registry.js and pack.json as data)
  ok(/\/library\/\*\n(  .+\n)*  Access-Control-Allow-Origin: \*\n/.test(fs.readFileSync(path.join(ROOT, 'dist/site/_headers'), 'utf8')), '_headers: the public library allows cross-origin reads');
  // the function exactly as tools/build.py generates it, but pointed at the emulator
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', storageChunkBytes: 4500, library: [{ id: 'databricks', title: 'Databricks', counts: { chapters: 13, exercises: 1715 } }] };
  const DOCS = { workflow: fs.readFileSync(path.join(ROOT, 'skill/noema-pack-builder/SKILL.md'), 'utf8'), content: fs.readFileSync(path.join(ROOT, 'tools/CONTENT_SPEC.md'), 'utf8'), visual: fs.readFileSync(path.join(ROOT, 'docs/VISUAL.md'), 'utf8'), bridge: fs.readFileSync(path.join(ROOT, 'docs/BRIDGE.md'), 'utf8'), pipelines: fs.readFileSync(path.join(ROOT, 'docs/PIPELINES.md'), 'utf8'),
    pipelineSteps: JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/pipelines/steps.json'), 'utf8')).steps,
    pipelineFlows: Object.fromEntries(fs.readdirSync(path.join(ROOT, 'tools/pipelines')).map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/pipelines', f), 'utf8'))).filter(f => f.format === 'noema.pipeline/v1').map(f => [f.id, f])) };
  const fn = path.join(os.tmpdir(), `noema-mcp-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify(DOCS)};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));   // as tools/build.py (MCP_ENGINE)   // as tools/build.py assembles it
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
  ok(['noema_whoami', 'noema_authoring_guide', 'noema_list_subjects', 'noema_get_pack_url', 'noema_start_upload', 'noema_finish_upload', 'noema_save_pack', 'noema_pipeline', 'noema_save_translation'].every(n => names.includes(n)), 'tools/list: ' + names.join(', '));
  const tool = async (name, args) => (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }, T)).json?.result;
  ok(['noema_vault_fields_queue', 'noema_vault_fields_find', 'noema_vault_fields_save'].every(n => names.includes(n)) && /Only the app's admins/.test((await tool('noema_vault_fields_queue', {})).content[0].text)
    && /every UI locale/.test((await tool('noema_vault_fields_save', { items_json: '[{"names":{"en":"Bird biology"}}]' })).content[0].text), 'vault fields: the tools for Claude; only admins review; an accepted field needs a name in every locale');
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

  console.log('— pictures: search the whole web, get one (pages and Wikimedia file pages resolved, shown to Claude)');
  ok(names.includes('noema_image_search') && names.includes('noema_image_fetch'), 'tools: noema_image_search + noema_image_fetch');
  { const PNGB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const seen = [];
    globalThis.NOEMA_IMG_FETCH = async url => { const u = new URL(url); seen.push(u.href);
      const R = (b, t, st = 200, h = {}) => new Response(b, { status: st, headers: { 'content-type': t, ...h } });
      if (u.hostname === 'www.bing.com') return R('<a m="{&quot;murl&quot;:&quot;https://www.textbook.org/fig/fork.png&quot;,&quot;purl&quot;:&quot;https://www.textbook.org/ch5&quot;,&quot;t&quot;:&quot;Replication fork&quot;}"></a>', 'text/html');
      if (u.hostname === 'commons.wikimedia.org' && u.pathname === '/w/api.php') return R(JSON.stringify({ query: { pages: {} } }), 'application/json');
      if (u.hostname === 'commons.wikimedia.org' && u.pathname.startsWith('/wiki/Special:FilePath/')) return R('', 'text/plain', 302, { location: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/DNA.png' });
      if (u.hostname === 'upload.wikimedia.org') return R(PNGB, 'image/png');
      return R('down', 'text/plain', 503);
    };
    const s1 = (await tool('noema_image_search', { query: 'replication fork' })).content[0].text;
    ok(/1 pictures for “replication fork”/.test(s1) && /image: https:\/\/www\.textbook\.org\/fig\/fork\.png/.test(s1) && /page: https:\/\/www\.textbook\.org\/ch5/.test(s1) && /unavailable now: .*openverse/.test(s1), 'noema_image_search: web-wide results (Bing) with image + page; unavailable sources named');
    const f1 = await tool('noema_image_fetch', { url: 'https://commons.wikimedia.org/wiki/File:DNA_Structure%2BKey%2BLabelled.pn_NoBB.png', media_id: 'dna', alt: 'DNA' });
    const entry = JSON.parse(f1.content[0].text.match(/\{"id":"dna".*\}/)[0]);
    ok(!f1.isError && f1.content[1]?.type === 'image' && f1.content[1].mimeType === 'image/png' && seen.some(x => x.includes('Special:FilePath')), 'noema_image_fetch: the Commons FILE PAGE (the link that failed) → the picture, shown to Claude');
    ok(entry.fetch === 'app' && entry.url === 'https://upload.wikimedia.org/wikipedia/commons/4/4c/DNA.png' && entry.w === 1 && entry.h === 1 && /commons\.wikimedia\.org\/wiki\/File:/.test(entry.page), 'and a ready media.json entry: "fetch": "app", the file url, its size, the page as source');
    const f2 = await tool('noema_image_fetch', { url: 'http://169.254.169.254/latest/meta-data' });
    ok(f2.isError && /not allowed/.test(f2.content[0].text), 'private addresses are refused');
    delete globalThis.NOEMA_IMG_FETCH; }

  console.log('— uploading an original source file');
  const ss = (await tool('noema_start_source_upload', { subject_id: 'physics-by-claude', source_id: 'part1', filename: 'Κεφ 5 βιβλίο.pdf' })).content[0].text;
  const surl = ss.match(/https?:\/\/\S+upload\/sign\S+/)[0];
  const up = await fetch(surl, { method: 'PUT', headers: { 'x-upsert': 'true', apikey: 'k' }, body: Buffer.from('%PDF-1.4 x') });
  const me = Object.values(srv.state.users).find(u => u.email === 'claude-user@example.com').id;
  ok(up.ok && Object.keys(srv.state.files).includes(`${me}/sources/physics-by-claude/part1/file.pdf`) && /Κεφ 5 βιβλίο\.pdf/.test(srv.state.kv[me]?.['a:srcfiles:physics-by-claude']?.value || ''), 'source files: signed upload (ASCII storage path) + registered in the synced index with the original name');

  console.log('— saving a pack');
  const fx = path.join(ROOT, 'tests/fixtures/demo-physics');
  const pack = (p => (p.translations.fr = { chapters: JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/tr.fr.json'), 'utf8')).chapters }, p))(JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8')));   // the French chapter inline, as an older pack carries it
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
  // the quality rules (docs/PIPELINES.md §4): a new pack cannot skip them by leaving subject.authoring.rules out; older packs keep working
  const norules = JSON.parse(JSON.stringify(small)); norules.subject.id = 'no-rules-new'; norules.subject.authoring = { minVisualPerChapter: 3 }; norules.builtAt = '2026-11-02T10:00:00Z';
  const nr = await tool('noema_save_pack', { pack_json: JSON.stringify(norules) });
  ok(nr.isError && /subject\.authoring\.rules must be 2/.test(nr.content[0].text) && !srv.state.kv[uid]['a:packmeta:no-rules-new'], 'a pack built since 2026-10-22 without subject.authoring.rules is refused');
  const old = JSON.parse(JSON.stringify(norules)); old.subject.id = 'no-rules-old'; old.builtAt = '2026-10-01T10:00:00Z';
  ok(!(await tool('noema_save_pack', { pack_json: JSON.stringify(old) })).isError && srv.state.kv[uid]['a:packmeta:no-rules-old'], 'an older pack without the rules is still accepted');
  const strictQ = JSON.parse(JSON.stringify(small)); strictQ.subject.id = 'claude-quality'; strictQ.subject.authoring = { rules: 2, by: 'claude' };
  const sq = await tool('noema_save_pack', { pack_json: JSON.stringify(strictQ) });
  ok(sq.isError && /\[map\.present\]/.test(sq.content[0].text), 'a pack Claude wrote is held to the quality rules (no knowledge map → refused)');
  // noema_pipeline: the same flows as tools/pipeline.py
  const pd = (await tool('noema_pipeline', { action: 'detect', facts: { sources: 2 } })).content[0].text;
  ok(/^Flow 4: Sources → one subject/.test(pd) && /pipeline\.py check work\/<id> map/.test(pd) && /call noema_finish_upload/.test(pd), 'noema_pipeline detect: 2 files, one topic → flow 4 with its checks');
  ok(/^Flow 1:/.test((await tool('noema_pipeline', { action: 'detect', facts: { sources: 3, topics: 4 } })).content[0].text) && /^Flow 2:/.test((await tool('noema_pipeline', { action: 'detect', facts: { step: true } })).content[0].text), 'detect: several topics → 1, a Roadmap step → 2');
  ok(/L2 · Γ2/.test((await tool('noema_pipeline', { action: 'flows' })).content[0].text) && (await tool('noema_pipeline', { action: 'steps', flow: 'x' })).isError, 'noema_pipeline flows lists every flow; an unknown flow is an error');
  // 文A language bridges (docs/BRIDGE.md): checked as the app checks them, stored where the app reads them
  ok(names.includes('noema_bridge_guide') && names.includes('noema_save_bridge'), 'tools: noema_bridge_guide + noema_save_bridge');
  const lp = (await call({ jsonrpc: '2.0', id: 5, method: 'prompts/get', params: { name: 'language_help', arguments: { subject: 'tiny-inline', native: 'ar' } } }, T)).json?.result;
  ok(/noema_bridge_guide/.test(JSON.stringify(lp || {})) && /into ar/.test(JSON.stringify(lp || {})), 'prompt language_help: the steps for one subject and native language');
  const sid0 = small.chapters[0].sections[0].id;
  const br = { format: 'noema-bridge', v: 1, pack: 'tiny-inline', source: small.subject.language || 'en', native: 'ru', status: 'draft', coverage: 0.3, chapters: [], of: small.chapters.length,
    entries: [{ k: 'energy', pos: 'NOUN', band: 2, senses: [{ id: '1', t: 'энергия' }] }], sections: { [sid0]: { terms: ['energy'], preview: 'Энергия.' } }, anchors: [] };
  const bBad = await tool('noema_save_bridge', { bridge_json: JSON.stringify({ ...br, entries: [...br.entries, { k: 'the', pos: 'DET', senses: [{ id: '1', t: 'x' }] }] }) });
  const bOther = await tool('noema_save_bridge', { bridge_json: JSON.stringify({ ...br, pack: 'no-such-pack' }) });
  ok(bBad.isError && /DET/.test(bBad.content[0].text) && bOther.isError && /No pack/.test(bOther.content[0].text), 'save_bridge refuses a function word and a pack the account does not have');
  const bOk = await tool('noema_save_bridge', { bridge_json: JSON.stringify(br) });
  const bix = JSON.parse(srv.state.kv[uid]['a:bridges']?.value || '{}');
  ok(!bOk.isError && srv.state.files[`${uid}/bridges/tiny-inline.ru.json`] && bix['tiny-inline']?.ru?.entries === 1 && /^[0-9a-z]+$/.test(bix['tiny-inline'].ru.v), 'save_bridge stores <uid>/bridges/<pack>.<native>.json and the synced index a:bridges');
  // a bridge too big to paste: subject_id + native → an upload command; the uploaded file goes live only once checked
  const bu1 = await tool('noema_save_bridge', { subject_id: 'tiny-inline', native: 'el' }); const buUrl = (bu1.content[0].text.match(/curl [^\n]* "([^"]+)"/) || [])[1];
  ok(!bu1.isError && !!buUrl && !srv.state.files[`${uid}/bridges/tiny-inline.el.json`], 'save_bridge with subject_id + native returns an upload command');
  await fetch(buUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...br, native: 'ru' }) });
  const buWrong = await tool('noema_save_bridge', { subject_id: 'tiny-inline', native: 'el' });
  await fetch(buUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...br, native: 'el', status: 'reviewed' }) });
  const bu2 = await tool('noema_save_bridge', { subject_id: 'tiny-inline', native: 'el' });
  const bix2 = JSON.parse(srv.state.kv[uid]['a:bridges']?.value || '{}');
  ok(buWrong.isError && /not tiny-inline → el/.test(buWrong.content[0].text) && !bu2.isError && /\(reviewed\)/.test(bu2.content[0].text) && srv.state.files[`${uid}/bridges/tiny-inline.el.json`] && !srv.state.files[`${uid}/bridges/incoming/tiny-inline.el.json`] && bix2['tiny-inline']?.el?.status === 'reviewed' && bix2['tiny-inline']?.ru?.entries === 1, 'save_bridge from an upload: refuses the wrong file, saves the right one, clears the upload, keeps the other natives in a:bridges');
  srv.state.kv[uid]['a:bridgeReports'] = { value: JSON.stringify([{ pack: 'tiny-inline', native: 'ru', k: 'energy', sense: '1', form: 'energy', sid: sid0, note: 'better: энергия (физ.)' }]), updated_at: new Date().toISOString() };
  const bg = (await tool('noema_bridge_guide', { subject_id: 'tiny-inline' })).content[0].text;
  ok(/tiny-inline → ru: 1 words/.test(bg) && /энергия \(физ\.\)/.test(bg), 'bridge_guide lists the account\'s bridges and the mistakes learners reported');
  const multi = JSON.parse(JSON.stringify(pack)); multi.subject.id = 'tiny-multi'; multi.subject.title = 'Tiny multi'; multi.v = 2;
  multi.translations = multi.translations || { fr: { chapters: JSON.parse(JSON.stringify(pack.chapters)) } };
  const mono = JSON.parse(JSON.stringify(multi)); mono.subject.id = 'tiny-mono'; mono.subject.title = 'Tiny mono'; delete mono.translations;
  const sm = await tool('noema_save_pack', { pack_json: JSON.stringify(multi) }), so = await tool('noema_save_pack', { pack_json: JSON.stringify(mono) });
  const metaOf = id => JSON.parse(srv.state.kv[uid]['a:packmeta:' + id]?.value || '{}');
  ok(!sm.isError && !so.isError && JSON.stringify(metaOf('tiny-multi').contentLocales) === JSON.stringify(Object.keys(multi.translations)) && !('contentLocales' in metaOf('tiny-mono')),
     'packmeta lists the content translations as contentLocales (pack schema v2, docs/i18n.md §10); none without translations');

  console.log('— a pack with its source files packaged (make_pack.py): every file must arrive');
  const crypto = require('crypto');
  const part = (n, len) => Buffer.concat([Buffer.from('%PDF-1.4 part ' + n + ' '), Buffer.alloc(len, n)]);
  const F = { 'ecb-1': part(1, 3000), 'ecb-2': part(2, 5000) };
  const pk = JSON.parse(JSON.stringify(pack)); pk.subject.id = 'packaged-physics'; pk.subject.title = 'Packaged physics';
  pk.sources = { sources: [
    { id: 'ecb-1', title: 'ECB part 1', file: 'sources/ecb_p1-12.pdf', fileName: 'ecb_p1-12.pdf', firstPage: 1, size: F['ecb-1'].length, sha256: crypto.createHash('sha256').update(F['ecb-1']).digest('hex'), mime: 'application/pdf' },
    { id: 'ecb-2', title: 'ECB part 2', file: 'sources/ecb_p13-30.pdf', fileName: 'Βιβλίο μέρος 2.pdf', firstPage: 13, size: F['ecb-2'].length, sha256: crypto.createHash('sha256').update(F['ecb-2']).digest('hex'), mime: 'application/pdf' },
    { id: 'web', title: 'A web page', url: 'https://example.org/x' }], chapters: { ch01: 'ecb-1' }, patches: {} };
  const s3 = await tool('noema_start_upload', { subject_id: 'packaged-physics' });
  ok(/work\/packaged-physics\/build\/packaged-physics\.json/.test(s3.content[0].text), 'start_upload points at the pack written by make_pack.py');
  await fetch(s3.content[0].text.match(/https?:\/\/\S+token=\S+/)[0], { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pk) });
  // the commands, one block per file: a curl, or (big file) split into parts + one curl per part
  const cmds = t => t.split(/\n\n/).filter(b => /^# \S+ — /.test(b)).map(b => ({ id: b.match(/^# (\S+)/)[1], local: (b.match(/--data-binary @"([^"]+)"/) || b.match(/split -b \d+ -d -a 3 "([^"]+)"/) || [])[1], split: +((b.match(/split -b (\d+)/) || [])[1] || 0), urls: [...b.matchAll(/curl [^\n]* "([^"]+)"/g)].map(m => m[1]) }));
  const putF = (u, buf) => fetch(u, { method: 'PUT', headers: { 'x-upsert': 'true', apikey: 'k', 'content-type': 'application/octet-stream' }, body: buf });
  const run = async (c, buf) => { if (!c.split) return putF(c.urls[0], buf); for (let i = 0; i < c.urls.length; i++) await putF(c.urls[i], buf.subarray(i * c.split, (i + 1) * c.split)); };   // what `split` + the curls do
  const f1 = await tool('noema_finish_upload', { subject_id: 'packaged-physics' }); const c1 = cmds(f1.content[0].text);
  ok(f1.isError && c1.length === 2 && c1[0].local === 'work/packaged-physics/sources/ecb_p1-12.pdf' && /Content-Type: application\/pdf/.test(f1.content[0].text) && !srv.state.kv[uid]['a:packmeta:packaged-physics'], 'finish_upload refuses to save while source files are missing and returns the upload commands of each file (not saved yet)');
  const big = c1.find(c => c.id === 'ecb-2');
  ok(big.split === 4500 && big.urls.length === 2 && big.local === 'work/packaged-physics/sources/ecb_p13-30.pdf' && /in 2 parts/.test(f1.content[0].text), 'a file over the storage limit is uploaded in parts: split + one signed URL per part (no size limit for Claude)');
  await run(c1.find(c => c.id === 'ecb-1'), F['ecb-1']);
  await putF(big.urls[0], F['ecb-2'].subarray(0, 4500));   // only the first part arrives
  const f2 = await tool('noema_finish_upload', { subject_id: 'packaged-physics' }); const c2 = cmds(f2.content[0].text);
  ok(f2.isError && c2.length === 1 && c2[0].id === 'ecb-2', 'a file with a part missing still counts as missing; the complete one is accepted');
  await run(c2[0], F['ecb-2']);
  const f3 = await tool('noema_finish_upload', { subject_id: 'packaged-physics' });
  const ix = JSON.parse(srv.state.kv[uid]?.['a:srcfiles:packaged-physics']?.value || '{}');
  ok(!f3.isError && /📎 2 source file\(s\)/.test(f3.content[0].text) && srv.state.kv[uid]['a:packmeta:packaged-physics'], 'with every file uploaded the subject is saved: ' + f3.content[0].text.split('\n').pop());
  ok(/🌐 Still to do before this subject's flow ends[^\n]*full translations into el, ru[^\n]*文A bridges into el, ru, ar/.test(f3.content[0].text), 'a new pack (rules 2) is told which translations and bridges it still needs');
  ok(ix['ecb-1']?.size === F['ecb-1'].length && !ix['ecb-1'].chunks && ix['ecb-2']?.name === 'Βιβλίο μέρος 2.pdf' && ix['ecb-2'].type === 'application/pdf' && ix['ecb-2'].chunks === 2 && ix['ecb-2'].cloud && !ix.web, 'the synced index lists each file (original name, type, size, parts) → 👁 on every device');
  ok(Buffer.compare(Buffer.concat([0, 1].map(i => Buffer.from(srv.state.files[`${uid}/sources/packaged-physics/ecb-2/file.pdf.p00${i}`].data))), F['ecb-2']) === 0 && Buffer.compare(Buffer.from(srv.state.files[`${uid}/sources/packaged-physics/ecb-1/file.pdf`].data), F['ecb-1']) === 0, 'the storage holds exactly the packaged files (same paths as the app uses)');
  const inl = JSON.parse(JSON.stringify(pk)); inl.subject.id = 'inline-with-files'; inl.subject.title = 'Inline with files';
  const si = await tool('noema_save_pack', { pack_json: JSON.stringify(inl) });
  ok(si.isError && cmds(si.content[0].text).length === 2 && !srv.state.kv[uid]['a:packmeta:inline-with-files'], 'save_pack applies the same file check');

  console.log('— translations in their own files (make_pack.py → <id>.tr.<locale>.json; docs/i18n.md §10)');
  const TRF = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/tr.fr.json'), 'utf8'));
  const tp = JSON.parse(JSON.stringify(pack)); tp.subject.id = 'tr-physics'; tp.subject.title = 'Translated physics'; tp.translations = { fr: { file: true, chapters: TRF.chapters.length } };
  const s4 = await tool('noema_start_upload', { subject_id: 'tr-physics' });
  await fetch(s4.content[0].text.match(/https?:\/\/\S+token=\S+/)[0], { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tp) });
  const t1 = await tool('noema_finish_upload', { subject_id: 'tr-physics' }); const t1t = t1.content[0].text;
  const trUrl = (t1t.match(/--data-binary @work\/tr-physics\/build\/tr-physics\.tr\.fr\.json "([^"]+)"/) || [])[1];
  ok(t1.isError && /translations are not in the account yet: fr/.test(t1t) && /NOT saved/.test(t1t) && !!trUrl && !srv.state.kv[uid]['a:packmeta:tr-physics'], 'finish_upload refuses a pack whose translation file is missing and returns its curl (work/<id>/build/<id>.tr.fr.json; not saved)');
  const badTr = JSON.parse(JSON.stringify({ ...TRF, pack: 'tr-physics' })); badTr.chapters[0].exercises[2].answer = 2;
  await fetch(trUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(badTr) });
  const t2 = await tool('noema_finish_upload', { subject_id: 'tr-physics' });
  ok(t2.isError && /answer differs/.test(t2.content[0].text) && !srv.state.kv[uid]['a:packmeta:tr-physics'], 'a translation that changes an answer is refused: ' + t2.content[0].text.split('\n')[0].slice(0, 120));
  await fetch(trUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...TRF, pack: 'tr-physics' }) });
  const t3 = await tool('noema_finish_upload', { subject_id: 'tr-physics' });
  ok(!t3.isError && srv.state.kv[uid]['a:packmeta:tr-physics'] && JSON.stringify(JSON.parse(srv.state.kv[uid]['a:packmeta:tr-physics'].value).contentLocales) === '["fr"]', 'with the translation file uploaded the subject is saved, fr listed in contentLocales: ' + t3.content[0].text.split('\n')[0].slice(0, 110));
  const ru = { ...TRF, pack: 'tr-physics', locale: 'ru', chapters: TRF.chapters.map(c => ({ ...c, title: 'Энергия' })) };
  const t4 = await tool('noema_save_translation', { subject_id: 'tr-physics', locale: 'ru', translation_json: JSON.stringify(ru) });
  const saved = JSON.parse(Buffer.from(srv.state.files[`${uid}/packs/tr-physics.json`].data).toString());
  ok(!t4.isError && !!srv.state.files[`${uid}/packs/tr-physics.tr.ru.json`] && saved.translations.ru?.file === true && saved.translations.fr?.file === true && JSON.parse(srv.state.kv[uid]['a:packmeta:tr-physics'].value).contentLocales.includes('ru'), 'noema_save_translation (inline): stored beside the pack, the pack names it, contentLocales gains ru: ' + t4.content[0].text.split('\n')[0]);
  const t5 = await tool('noema_save_translation', { subject_id: 'tr-physics', locale: 'el' }); const elUrl = (t5.content[0].text.match(/curl [^\n]* "([^"]+)"/) || [])[1];
  ok(!t5.isError && /tr-physics\.tr\.el\.json/.test(t5.content[0].text) && !!elUrl, 'noema_save_translation without the JSON returns an upload command');
  await fetch(elUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ru, locale: 'el', chapters: TRF.chapters.map(c => ({ ...c, exercises: c.exercises.slice(1) })) }) });
  const t6 = await tool('noema_save_translation', { subject_id: 'tr-physics', locale: 'el' });
  ok(t6.isError && /missing/.test(t6.content[0].text) && !JSON.parse(Buffer.from(srv.state.files[`${uid}/packs/tr-physics.json`].data).toString()).translations.el, 'an uploaded translation with an exercise missing is refused and the pack does not name it: ' + t6.content[0].text.split('\n')[1]);
  const t7 = await tool('noema_save_translation', { subject_id: 'tr-physics', locale: 'en', translation_json: JSON.stringify({ ...ru, locale: 'en' }) });
  ok(t7.isError, 'a translation into the pack’s own language is refused: ' + t7.content[0].text.split('\n').slice(0, 2).join(' '));

  const ls = (await tool('noema_list_subjects', {})).content[0].text;
  ok(/databricks/.test(ls) && /physics-by-claude/.test(ls) && /tiny-inline/.test(ls), 'list_subjects shows library + private packs');
  const gu = (await tool('noema_get_pack_url', { subject_id: 'physics-by-claude' })).content[0].text.match(/https?:\/\/\S+token=\S+/)[0];
  ok((await (await fetch(gu)).json()).subject.id === 'physics-by-claude', 'get_pack_url gives a working download link (for additive updates)');
  ok(/library\/subjects\/databricks\/pack\.json/.test((await tool('noema_get_pack_url', { subject_id: 'databricks' })).content[0].text), 'library packs are offered from the website');

  console.log('— the app side');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
  srv.state.authz['az1'] = { redirect_uri: BASE + '/oauth-callback' };
  await p.goto(BASE + '/oauth/consent/?authorization_id=az1');
  await p.locator('button:has-text("Sign in")').waitFor({ state: 'visible' });
  ok(/Connect Claude/.test(await p.locator('body').innerText()), 'Supabase’s consent URL (/oauth/consent) opens the app’s consent screen');
  await p.click('button:has-text("Sign in")'); await wait(200);
  await p.fill('input[type=email]', 'claude-user@example.com'); await p.fill('input[type=password]', 'secret123'); await p.click('.noema-form button.primary'); await wait(900);
  ok(/Claude.*wants to use your noema-lite account/.test(await p.locator('body').innerText()), 'after sign-in it shows who asks and what it may do');
  await p.screenshot({ path: '/tmp/noema_shots/c1_consent.png' });
  await p.click('button:has-text("Allow")'); await wait(900);
  ok(srv.state.consents.some(c => c.id === 'az1' && c.action === 'approve' && c.uid === uid) && /code=code-az1/.test(srv.state.callbacks.join()), 'Allow → consent approved and the browser returns to Claude’s callback');
  srv.state.authz['az2'] = { redirect_uri: BASE + '/oauth-callback' };
  await p.goto(BASE + '/oauth/consent/?authorization_id=az2');
  await p.locator('button:has-text("Deny")').waitFor({ state: 'visible' });
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
  ok(await p.evaluate(async n => (await NoemaSrcFiles.get(Noema.account.id, 'packaged-physics', 'ecb-2'))?.blob.size === n, F['ecb-2'].length), 'the app joins the parts Claude uploaded into the original file');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); fs.unlinkSync(fn);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
