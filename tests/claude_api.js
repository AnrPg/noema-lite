/* "Create with Claude" — way A (inside the app, with the learner's API key) against a scripted Claude API emulator,
   plus the way-B guide, the picture fetcher (/api/img) and "fetch": "app" pictures.
   Usage: node tests/claude_api.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const PORT = 54335, BASE = `http://localhost:${PORT}`, APORT = 54336, ABASE = `http://localhost:${APORT}`;
const KEY = 'sk-ant-api03-' + 'x'.repeat(40);
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await new Promise(r => setTimeout(r, step)); } return false; };
const PNG = fs.readFileSync(path.join(ROOT, 'library/subjects/databricks/media/spark-stage-page.png'));

/* ---------- a scripted Claude API ---------- */
const A = { reqs: [], skills: [], files: {}, msgCalls: [], badKey: 0 };
function claudeApi() {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access,content-type,anthropic-beta', 'access-control-allow-methods': 'GET,POST,DELETE' };
  const J = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  return http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const buf = Buffer.concat(chunks); const u = new URL(req.url, ABASE); const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (p === '/page/heart') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><head><meta property="og:image" content="/img/no-cors.png"></head><body>An article about the heart</body></html>'); }   // a page, not a picture
      if (p === '/img/no-cors.png') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(PNG); }   // no CORS header + generic type → the app must use /api/img + sniffing
      A.reqs.push({ method: req.method, p, headers: req.headers });
      if (req.headers['x-api-key'] !== KEY) { A.badKey++; return J(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }); }
      if (!req.headers['anthropic-dangerous-direct-browser-access']) return J(res, 401, { error: { type: 'x', message: 'CORS requests need the browser header' } });
      if (p === '/v1/models') return J(res, 200, { data: [{ id: 'claude-opus-9', display_name: 'Claude Opus 9' }, { id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }, { id: 'claude-haiku-9', display_name: 'Claude Haiku 9' }] });
      if (p === '/v1/skills' && req.method === 'GET') return J(res, 200, { data: A.skills });
      if (p === '/v1/skills' && req.method === 'POST') {
        const body = buf.toString('latin1'); const zipOk = body.includes('name="files[]"; filename="noema-pack-builder.zip"') && body.includes('PK');
        if (!zipOk) return J(res, 400, { error: { type: 'invalid_request_error', message: 'files required' } });
        const s = { id: 'skill_01noema', display_title: 'noema-pack-builder', source: 'custom' }; A.skills.push(s); return J(res, 200, s);
      }
      if (/^\/v1\/skills\/skill_01noema(\/versions)?$/.test(p)) return J(res, 200, { id: 'skill_01noema', latest_version: '1' });
      if (p === '/v1/files' && req.method === 'POST') { const id = 'file_src_' + (Object.keys(A.files).length + 1); A.files[id] = { name: (buf.toString('latin1').match(/filename="([^"]+)"/) || [])[1] }; return J(res, 200, { id, type: 'file' }); }
      if (p === '/v1/files/file_out_1') return J(res, 200, { id: 'file_out_1', filename: 'heart-by-claude.json', size_bytes: 9000 });
      if (p === '/v1/files/file_out_1/content') { res.writeHead(200, { 'content-type': 'application/octet-stream', ...cors }); return res.end(JSON.stringify(A.jsonDecoy)); }
      if (p === '/v1/files/file_out_2') return J(res, 200, { id: 'file_out_2', filename: 'heart-by-claude.noema.zip', size_bytes: A.zip.length });
      if (p === '/v1/files/file_out_2/content') { res.writeHead(200, { 'content-type': 'application/octet-stream', ...cors }); return res.end(A.zip); }
      if (p === '/v1/messages') return messages(JSON.parse(buf.toString()), res, J);
      J(res, 404, { error: { type: 'not_found_error', message: 'no route ' + p } });
    });
  });
}
function messages(body, res, J) {
  A.msgCalls.push(body); const n = A.msgCalls.length;
  const usage = { input_tokens: 2000, output_tokens: 800, cache_read_input_tokens: 50000, cache_creation_input_tokens: 3000, server_tool_use: { web_search_requests: n === 2 ? 1 : 0 } };
  const reply = (content, stop_reason) => J(res, 200, { id: 'msg_' + n, type: 'message', role: 'assistant', model: body.model, content, stop_reason, usage, container: { id: 'container_abc', expires_at: '2099-01-01' } });
  const bash = (cmd, files = []) => [{ type: 'server_tool_use', id: 'srv_' + n, name: 'bash_code_execution', input: { command: cmd } },
    { type: 'bash_code_execution_tool_result', tool_use_id: 'srv_' + n, content: { type: 'bash_code_execution_result', stdout: 'ok', stderr: '', return_code: 0, content: files.map(f => ({ file_id: f })) } }];
  if (n === 1) return reply([{ type: 'text', text: 'I will read the PDF first.' }, ...bash('python3 scripts/pdf_text.py /mnt/user-data/uploads/heart.pdf > t.txt')], 'pause_turn');
  if (n === 2) return reply([{ type: 'server_tool_use', id: 'srv_ws', name: 'web_search', input: { query: 'heart anatomy diagram wikimedia' } },
    { type: 'tool_use', id: 'toolu_1', name: 'noema_web_image', input: { url: BASE + '/testimg/heart.png', page_url: 'https://commons.wikimedia.org/wiki/File:Heart.png' } },
    { type: 'tool_use', id: 'toolu_2', name: 'noema_web_image', input: { url: ABASE + '/img/no-cors.png' } },
    { type: 'tool_use', id: 'toolu_3', name: 'noema_web_image', input: { url: BASE + '/index.html' } },
    { type: 'tool_use', id: 'toolu_4', name: 'noema_web_image', input: { url: ABASE + '/page/heart' } },
    { type: 'tool_use', id: 'toolu_5', name: 'noema_image_search', input: { query: 'heart anatomy diagram', n: 5 } }], 'tool_use');
  if (n === 3) return reply([{ type: 'text', text: 'Should the course follow the order of the PDF (A) or start from blood flow (B)?' }], 'end_turn');
  if (n === 4) return reply([{ type: 'text', text: 'Building.' }, ...bash('python3 scripts/make_pack.py work/heart-by-claude /tmp/out && cp /tmp/out/heart-by-claude.noema.zip "$OUTPUT_DIR/"', ['file_out_1', 'file_out_2']), { type: 'text', text: 'Done: 1 chapter, 14 exercises.' }], 'end_turn');
  J(res, 500, { error: { type: 'api_error', message: 'unexpected call ' + n } });
}

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', anthropicBase: '${ABASE}', askSubjectOnStart: true, shell: false };`;
  fs.mkdirSync(path.join(ROOT, 'dist/site/testimg'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'dist/site/testimg/heart.png'), PNG);
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  // the picture search's view of the web (scripted): Bing finds a figure on a publisher's page; the other sources are down
  globalThis.NOEMA_IMG_FETCH = async url => { const u = new URL(url); if (u.hostname === 'www.bing.com') return new Response('<a m="{&quot;murl&quot;:&quot;https://pubs.example.edu/heart.png&quot;,&quot;purl&quot;:&quot;https://pubs.example.edu/heart&quot;,&quot;t&quot;:&quot;Heart&quot;}"></a>', { headers: { 'content-type': 'text/html' } }); return new Response('down', { status: 503 }); };
  const api = claudeApi(); await new Promise(r => api.listen(APORT, r));
  // the pack Claude "builds": the demo fixture + two web pictures that the APP must download ("fetch": "app")
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  fx.subject = { ...fx.subject, id: 'heart-by-claude', title: 'Heart by Claude', owner: null }; fx.version = 'hbc-1';
  // Claude split heart.pdf into two parts and packaged them (make_pack.py): <id>.noema.zip = pack.json + sources/…
  const crypto = require('crypto'); const JSZip = require(path.join(ROOT, 'engine/vendor/viewer/jszip.min.js'));
  A.parts = { 'sources/heart_p1-10.pdf': Buffer.from('%PDF-1.4 part one ' + 'a'.repeat(900)), 'sources/heart_p11-20.pdf': Buffer.from('%PDF-1.4 part two ' + 'b'.repeat(1300)) };
  const pkd = (id, title, file, firstPage) => ({ id, title, file, fileName: file.split('/').pop(), firstPage, size: A.parts[file].length, sha256: crypto.createHash('sha256').update(A.parts[file]).digest('hex'), mime: 'application/pdf', added: '2026-10-07', emoji: '📘' });
  fx.sources = { sources: [pkd('book-1', 'Heart textbook, part 1', 'sources/heart_p1-10.pdf', 1), pkd('book-2', 'Heart textbook, part 2', 'sources/heart_p11-20.pdf', 11), { id: 'pic', title: 'Valve photo', added: '2026-10-07', emoji: '🖼️' }], chapters: { ch01: 'book-1' }, patches: {} };
  const first = Object.keys(fx.media)[0];
  fx.media[first] = { ...fx.media[first], data: undefined, fetch: 'app', origin: 'web', url: BASE + '/testimg/heart.png', page: 'https://commons.wikimedia.org/wiki/File:Heart.png', license: 'CC BY-SA 4.0', retrieved: '2026-10-07' };
  delete fx.media[first].data; A.pack = fx;
  const z = new JSZip(); z.file('pack.json', JSON.stringify(fx)); for (const [k, v] of Object.entries(A.parts)) z.file(k, v);
  A.zip = await z.generateAsync({ type: 'nodebuffer' });
  A.jsonDecoy = { ...fx, version: 'hbc-json-only' };   // an older .json next to it: the package must win

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1250, height: 950 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Dora'); await p.fill('input[type=email]', 'dora@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1200);

  console.log('— the guide: two ways');
  await p.click('.noema-ovfoot button:has-text("Create with Claude")'); await wait(400);
  ok(await p.locator('.cg-choice').count() === 3 && /usually cheapest/.test(await p.locator('.cg-choice-c').innerText()), 'three ways are offered: A here in noema-lite, B in the Claude app, C a whole curriculum with the Claude plan (⭐ usually cheapest)');
  await p.screenshot({ path: SHOTS + '/c0_ways.png' });
  await p.click('.cg-choice:has-text("In the Claude app")'); await wait(300);
  const b = await p.locator('.noema-ovbox').last().innerText();
  ok(await p.locator('.cg-steps > .cg-step').count() === 6, 'way B: 6 numbered steps');
  ok(await p.locator('.cg-step').first().locator('.cg-sub > li').count() >= 2, 'steps have numbered sub-steps');
  ok(b.includes(BASE + '/mcp') && /claude\.ai/.test(await p.locator('.cg-step a[href^="https://claude.ai/"]').first().getAttribute('href')), 'way B starts with creating a Claude account (link) and shows this site’s connector address');
  ok(/Code execution and file creation/.test(b) && /Customize → Connectors/.test(b) && /Upload a skill/.test(b), 'way B: capabilities, connector and (optional) skill steps');
  await p.click('.cg-step >> nth=2 >> .cg-tip summary'); await wait(150);
  ok(await p.locator('.cg-step >> nth=2 >> .cg-tip').evaluate(d => d.open) && /same for everybody/.test(await p.locator('.cg-step >> nth=2 >> .cg-tipbody').innerText()), 'ⓘ tips open on click (works on touch screens too)');
  await p.click('.cg-faq summary:has-text("same on every computer")');
  ok(/same for every user/.test(await p.locator('.cg-faq').nth(1).innerText()), 'FAQ: the connector address is the same for every user and device');
  await p.screenshot({ path: SHOTS + '/c1_wayB.png', fullPage: true });
  await p.click('.cg-back');

  console.log('— way A: API key inside the app');
  await p.click('.cg-choice:has-text("Here in noema-lite")'); await wait(300);
  ok(await p.locator('.cg-steps > .cg-step').count() === 7, 'way A: 7 numbered steps');
  const a = await p.locator('.noema-ovbox').last().innerText();
  ok(/platform\.claude\.com/.test(await p.locator('.cg-step').first().locator('a').first().getAttribute('href')) && /Billing/.test(a) && /API keys/.test(a), 'way A starts with creating the Console account, credit, key (links)');
  await p.click('.cg-go'); await wait(200);
  ok(/key needs to work/.test(await p.locator('.cg-go + .cg-kstat, .cg-kstat.bad').last().innerText()), 'Start without a key → a friendly pointer to step 4');
  await p.fill('input[placeholder="sk-ant-…"]', 'hello'); await p.click('button:has-text("Check the key")'); await wait(200);
  ok(/does not look like/.test(await p.locator('.cg-kstat').first().innerText()), 'a wrong-looking key is caught before calling Claude');
  await p.fill('input[placeholder="sk-ant-…"]', 'sk-ant-api03-' + 'y'.repeat(40)); await p.click('button:has-text("Check the key")'); await wait(500);
  ok(/not accepted/.test(await p.locator('.cg-kstat').first().innerText()), 'a rejected key → plain-language message');
  await p.fill('input[placeholder="sk-ant-…"]', KEY); await p.click('button:has-text("Check the key")'); await wait(500);
  ok(/key works/.test(await p.locator('.cg-kstat').first().innerText()) && await p.$eval('.cg-model select', s => s.value) === 'claude-sonnet-9', 'the key works; the newest Sonnet is preselected');
  await p.setInputFiles('.cg-drop input[type=file]', [{ name: 'heart.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }, { name: 'valve.png', mimeType: 'image/png', buffer: PNG }]);
  ok(await p.locator('.cg-files li').count() === 2, 'two sources listed (with ✕ to remove)');
  await p.fill('input[placeholder="e.g. Human heart anatomy"]', 'Heart by Claude');
  await p.screenshot({ path: SHOTS + '/c2_wayA.png', fullPage: true });
  await p.click('.cg-go');
  await p.waitForSelector('.cg-status.question', { timeout: 20000 }).catch(() => { });
  ok(A.skills.length === 1, 'the skill was uploaded to the user’s Claude workspace automatically');
  ok(Object.values(A.files).map(f => f.name).join() === 'heart.pdf,valve.png', 'sources uploaded with the Files API');
  const m1 = A.msgCalls[0];
  ok(m1?.container?.skills?.[0]?.skill_id === 'skill_01noema' && m1.tools.some(t => t.type === 'code_execution_20250825') && m1.tools.some(t => t.name === 'noema_web_image') && m1.tools.some(t => /^web_search/.test(t.type)), 'messages: skill in the container + code execution + web search + noema_web_image');
  ok(m1.messages[0].content.filter(c => c.type === 'container_upload').length === 2 && /Heart by Claude/.test(m1.messages[0].content[0].text) && m1.system?.[0]?.cache_control, 'the sources go into the container; prompt caching on');
  ok(A.msgCalls[1]?.container?.id === 'container_abc' && A.msgCalls[1].messages.length === 2, 'pause_turn → resent with the same container');
  const tr = A.msgCalls[2]?.messages.at(-1)?.content || [];
  ok(tr.length === 5 && tr[0].content?.[1]?.type === 'image' && JSON.parse(tr[0].content[0].text).w > 800, 'noema_web_image: the app downloads the picture and shows it to Claude with its size');
  ok(tr[1].content?.[1]?.type === 'image', 'a host without CORS / with a generic content type → fetched through /api/img and recognised');
  ok(tr[2].is_error && /no main picture|not a picture/.test(tr[2].content), 'a page without a picture → a helpful error for Claude');
  ok(tr[3].content?.[1]?.type === 'image' && JSON.parse(tr[3].content[0].text).url === ABASE + '/img/no-cors.png', 'a PAGE given instead of an image → its main picture (og:image), reported with its file url for media.json');
  const sr = JSON.parse(tr[4].content || '{}');
  ok(m1.tools.some(t => t.name === 'noema_image_search') && sr.results?.[0]?.url === 'https://pubs.example.edu/heart.png' && sr.results[0].source === 'bing' && /noema_web_image/.test(sr.next), 'noema_image_search: Claude searches pictures on the whole web (Bing + open collections) through the picture service');
  ok(tr.at(-1).cache_control?.type === 'ephemeral', 'the newest turn is cached');
  ok(/order of the PDF/.test(await p.locator('.cg-claudesays').innerText()), 'Claude’s question is shown with an answer box');
  ok(/≈ \$\d+\.\d\d of your \$15 limit/.test(await p.locator('.noema-ovbox').last().innerText()), 'live cost estimate with the limit');
  await p.screenshot({ path: SHOTS + '/c3_question.png' });
  const dora = Object.values(srv.state.users).find(u => u.email === 'dora@example.com').id;
  ok(!JSON.stringify(srv.state.kv[dora] || {}).includes('sk-ant'), 'the API key never reaches the noema-lite cloud');

  console.log('— resume after closing the page');
  await p.reload(); await wait(1500);
  await p.evaluate(() => { Noema.claudeGuide(); }); await wait(500);
  ok(/Not finished yet/.test(await p.locator('.cg-resume').innerText()) && /Heart by Claude/.test(await p.locator('.cg-resume').innerText()), 'the unfinished job is offered for Resume');
  await p.click('.cg-resume button:has-text("Resume")'); await wait(300);
  await p.fill('.noema-ovbox textarea', 'A'); await p.click('.noema-ovbox button:has-text("Send")');
  await p.waitForSelector('.cg-status.done', { timeout: 20000 }).catch(() => { });
  ok(A.msgCalls[3]?.messages.at(-1)?.content?.[0]?.text === 'A', 'the answer is sent to Claude');
  ok(await p.locator('.cg-status.done').count() === 1, 'the built pack ($OUTPUT_DIR file) is found and downloaded');
  await p.screenshot({ path: SHOTS + '/c4_done.png' });
  await p.click('button:has-text("Open my new subject")'); await wait(2500);
  ok(await p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.title === 'Heart by Claude'), 'it opens as a new subject');
  ok(await p.evaluate(f => /^data:image\/png;base64,/.test(MEDIA[f]?.data || ''), first), '"fetch": "app" picture embedded (works offline)');
  ok(Object.keys(srv.state.files).some(k => k === `${dora}/packs/heart-by-claude.json`), 'and saved to the cloud account (all devices)');
  const F = srv.state.files, sp = id => `${dora}/sources/heart-by-claude/${id}/file.pdf`;
  ok(await p.evaluate(() => Noema.pack.version) === 'hbc-1', 'the package (.noema.zip) is imported, not the older .json next to it');
  ok(F[sp('book-1')] && Buffer.compare(Buffer.from(F[sp('book-1')].data), A.parts['sources/heart_p1-10.pdf']) === 0 && F[sp('book-2')] && Buffer.compare(Buffer.from(F[sp('book-2')].data), A.parts['sources/heart_p11-20.pdf']) === 0, 'the two parts Claude split the PDF into are attached to their own sources, byte for byte (👁 on every device)');
  ok(Object.keys(F).includes(`${dora}/sources/heart-by-claude/pic/file.png`), 'a source without a packaged file still gets the learner’s upload by name (valve.png)');
  ok(!Object.keys(F).some(k => /heart-by-claude\/book\//.test(k)) && Object.keys(F).filter(k => k.includes('/sources/heart-by-claude/')).length === 3, 'the unsplit original is not attached next to its parts');
  ok(/split|SKILL\.md §3b|work\/<id>\/sources/.test(m1.system[0].text) && /\.noema\.zip/.test(m1.system[0].text), 'Claude is told to package every uploaded file (or its parts) and to copy the .noema.zip');
  ok(!(await p.evaluate(() => NoemaClaude.jobs(Noema.account.id))).length, 'the finished job is cleaned up');

  console.log('— ⚙️ Settings: a tab of the profile menu, with an optional Claude section');
  ok(!(await p.locator('.topbar .iconbtn[title="Settings"]').count()), 'no ⚙️ in the top bar — Settings lives only in the avatar menu');
  await p.click('.acchip'); await wait(400);
  const tabsBox = await p.locator('.accbox .tabs').boundingBox(), helpBox = await p.locator('.accbox .tabs button[data-t="help"]').boundingBox();
  ok(helpBox && helpBox.x + helpBox.width <= tabsBox.x + tabsBox.width + 1, 'every tab of the avatar menu is visible (❓ Help is not pushed off the edge)');
  await p.click('.accbox .tabs button[data-t="settings"]'); await wait(400);
  ok(await p.locator('.accbox .tabs button.on').innerText() === '⚙️ Settings' && await p.locator('.accbox .accsec').count() === 5, 'the avatar menu has a ⚙️ Settings tab: Gemini · Claude · language of the AI conversations · Display & studying · this subject');
  await p.click('.accsec summary:has-text("Claude (optional)")'); await wait(300);
  ok(await until(async () => /The key works/.test(await p.locator('.accsec:has-text("Claude (optional)")').innerText()), 6000) && await p.locator('select[aria-label="Claude model"] option').count() === 4, 'the Claude key on this device is shown and checked; its models are listed');
  await p.selectOption('select[aria-label="Claude model"]', 'claude-opus-9'); await p.fill('input[aria-label="Spending limit per Roadmap step"]', '5'); await p.selectOption('select[aria-label="AI for new Roadmaps"]', 'claude');
  await p.click('button:has-text("Save settings")'); await wait(500);
  ok(await p.evaluate(() => [JSON.parse(localStorage.getItem(`noema1:${Noema.account.id}:a:claudeModel`)), JSON.parse(localStorage.getItem(`noema1:${Noema.account.id}:a:settings`)).curProvider]).then(x => x[0] === 'claude-opus-9' && x[1] === 'claude'), 'saved: the Claude model and the AI for new curricula');
  await p.evaluate(() => NoemaCurMap.create(Noema.account.id)); await wait(400);
  ok(await p.locator('.cm-provider').inputValue() === 'claude' && await p.locator('.cg-budget').inputValue() === '5', 'a new curriculum starts with them (Claude, $5 per step)');
  await p.locator('.noema-ovbox button:has-text("Close")').last().click(); await wait(300);
  await p.evaluate(() => openAccountMenu('settings')); await wait(300); await p.click('.accsec summary:has-text("Claude (optional)")');
  await p.click('button:has-text("Remove the key")'); await wait(200);
  ok(await p.evaluate(() => NoemaClaude.Key.get(Noema.account.id)) === '', 'Remove the key → gone from this device');
  await p.fill('input[aria-label="Claude API key"]', KEY); await p.click('button:has-text("Check the key")');
  ok(await until(() => p.evaluate(k => NoemaClaude.Key.get(Noema.account.id) === k, KEY), 5000), 'pasting a key + ✔️ Check → kept on this device again');
  await p.screenshot({ path: SHOTS + '/c5_settings.png' });
  ok(!JSON.stringify(srv.state.kv[dora] || {}).includes('sk-ant'), 'still: the Claude key never reaches the noema-lite cloud');
  await p.evaluate(() => document.querySelector('.modal')?.remove());

  console.log('— phone');
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ph.goto(BASE + '/'); await wait(900); await ph.evaluate(() => { Noema.claudeGuide(); }).catch(() => { });
  await ph.waitForSelector('.cg-choice', { timeout: 5000 }).catch(() => { });
  if (await ph.locator('.cg-choice').count()) { await ph.tap('.cg-choice:has-text("Here in noema-lite")'); await wait(300); }
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cg-step')].every(s => s.getBoundingClientRect().right <= innerWidth + 1)), 'phone: the steps fit the screen (no sideways scrolling)');
  await ph.screenshot({ path: SHOTS + '/c5_phone.png' });

  console.log('— /api/img safety');
  const ar = async q => { const r = await fetch(BASE + '/api/img?url=' + encodeURIComponent(q), { headers: { origin: BASE } }); return r.status; };
  ok(await ar('file:///etc/passwd') === 400 && await ar('notaurl') === 400, 'only http(s) urls');
  ok((await fetch(BASE + '/api/img?url=' + encodeURIComponent(BASE + '/index.html'), { headers: { origin: BASE } })).status === 415, 'non-pictures are refused');
  ok((await fetch(BASE + '/api/img?url=x', { headers: { origin: 'https://evil.example' } })).status === 403, 'other websites cannot use it');
  const { blockedHost } = await import(require('url').pathToFileURL(path.join(ROOT, 'cloud/img/proxy.mjs')).href);
  ok(['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '2130706433', '::1'].every(blockedHost) && !blockedHost('upload.wikimedia.org'), 'private / local addresses are blocked on the real site');

  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); api.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
