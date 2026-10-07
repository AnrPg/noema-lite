/* 💬 Curricula with the learner's Claude app (their Claude plan) — engine/curjobs.js + the connector (cloud/mcp/server.mjs).
   In the browser against the Supabase emulator, with the connector function run in-process as the learner's Claude:
     A. a new curriculum “with the Claude app”: nothing runs in the app; Claude asks for the tasks (agents 1 · 1b · 2, then
        chapter plans in batches), a wrong answer comes back with its problems, accepted answers reach the app by themselves
     B. a step reviewed and sent to the Claude app → Claude gets the brief + subject id, saves the pack → the step is ready
     C. an imported map with a PDF: Claude gets a signed link to the learner's file, packages the same file → not uploaded
        twice (recognised by its SHA-256), the step's source links to the curriculum's copy
     D. without the connector: copy a task, paste a wrong / right answer; a step's bundle (task + files + toolkit) and
        📥 its .noema.zip; re-plan with a wish (no key) → a plan task carrying the wish; an API curriculum sends one step
     E. ❓ Set up Claude → way C (⭐ recommended for curricula), phone layout
   Usage: node tests/curriculum_app.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const F = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54361, BASE = `http://localhost:${PORT}`;
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
const JSZip = require(path.join(ROOT, 'engine/vendor/viewer/jszip.min.js'));

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  // the connector exactly as tools/build.py bundles it (MCP_ENGINE), pointed at the emulator
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] };
  const DOCS = { workflow: 'SKILL', content: 'CONTENT', visual: 'VISUAL' };
  const fn = path.join(os.tmpdir(), `noema-mcp-app-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify(DOCS)};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
  const { default: handler } = await import(fn);
  let T = null, rpc = 0;
  const tool = async (name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })); const j = await r.json(); return { text: j.result?.content?.[0]?.text || j.error?.message || '', error: !!j.result?.isError || !!j.error }; };
  const kvOf = uid => srv.state.kv[uid] || {};
  const inbox = uid => Object.keys(kvOf(uid)).filter(k => k.startsWith('a:curin:'));

  // the learner's file for an imported map
  const TF = path.join(ROOT, 'dist/site/testfiles/app'); fs.mkdirSync(TF, { recursive: true });
  execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1])
for i in range(4): c.drawString(72, 720, 'Membranes page %d' % (i + 1)); c.showPage()
c.save()`, path.join(TF, 'membranes.pdf')]);
  const PDF = fs.readFileSync(path.join(TF, 'membranes.pdf'));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Lena'); await p.fill('input[type=email]', 'lena@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1300);
  const uid = Object.values(srv.state.users).find(u => u.email === 'lena@example.com').id;
  T = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'lena@example.com', password: 'secret123' }) })).json()).access_token;
  const clip = () => p.evaluate(() => navigator.clipboard.readText());

  /* ---------- A. a new curriculum built by the Claude app ---------- */
  console.log('— A. a new curriculum, built by the learner’s Claude app');
  await p.click('.cm-mode:has-text("Curricula")'); await p.click('button:has-text("New curriculum")'); await wait(300);
  ok(await p.locator('.cm-provider').inputValue() === 'claudeapp' && await p.locator('.cm-appinfo').isVisible() && !(await p.locator('.cm-keys').isVisible()), 'cloud account: “💬 Claude app — with your Claude plan (recommended, usually cheaper)” is preselected; no key needed');
  ok(/usually cheaper/i.test(await p.locator('.cm-provider option[value=claudeapp]').innerText()) && /no extra cost beyond your plan/i.test(await p.locator('.cm-appinfo').innerText()), 'the choice says why: no cost beyond the Claude plan, the saving grows with the curriculum');
  await p.fill('textarea[placeholder^="e.g. “Bayesian"]', 'Bayesian inference'); await p.selectOption('label:has-text("Depth") select', 'standard');
  await p.click('.cg-go'); await wait(600);
  ok(/Your Claude app builds the map/.test(await p.locator('.cg-status').innerText()) && await p.locator('.cm-apppanel').isVisible(), 'nothing runs here: “💬 Your Claude app builds the map — follow the steps below”');
  await p.screenshot({ path: SHOTS + '/ca0_waiting.png', fullPage: true });
  const cid = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id)[0].id);
  await p.click('.cm-copymsg'); const msg = await clip();
  ok(msg.includes(`(id ${cid})`) && /noema_curriculum_task/.test(msg) && /build its map/.test(msg), 'the message for Claude names the curriculum and the connector tool: ' + msg.split('\n')[0].slice(0, 120));
  ok(await until(() => !!kvOf(uid)['a:curriculum:' + cid], 8000), 'the waiting curriculum is in the cloud (the connector reads it from there)');
  const tl = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).then(r => r.json());
  ok(['noema_curricula', 'noema_curriculum_task', 'noema_curriculum_submit'].every(n => tl.result.tools.some(t => t.name === n)), 'the connector offers the curriculum tools');
  const pl = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: 'curriculum_work', arguments: { curriculum: 'Bayesian inference', steps: '3' } } }) })).then(r => r.json());
  ok(/the next 3 queued steps/.test(pl.result.messages[0].content.text), 'a ready prompt in Claude: + → noema-lite → “Work on my noema-lite curriculum”');
  let r = await tool('noema_curricula');
  ok(/Bayesian inference/.test(r.text) && r.text.includes(cid) && /its map is being built/.test(r.text), 'noema_curricula: what is waiting');
  r = await tool('noema_curriculum_task', {});
  ok(/# noema-lite curriculum task — Agent 1/.test(r.text) && /task dag/.test(r.text) && /noema_curriculum_submit/.test(r.text) && /"dag_creator"/.test(r.text) && /complete beginner/.test(r.text), 'task 1: agent 1’s own prompt + how to answer + the JSON Schema (the only curriculum with work is picked by itself)');
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'dag', result_json: JSON.stringify(F.dag({ broken: true })) });
  ok(r.error && /philosophy_of_induction/.test(r.text) && /does not lead to the goal/.test(r.text), 'a wrong answer comes back with its problems (the app’s own checks): ' + r.text.split('\n')[1]);
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'audit', result_json: JSON.stringify(F.audit()) });
  ok(r.error && /not open/.test(r.text), 'an answer to a task that is not open is refused');
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'dag', result_json: 'Here you go:\n```json\n' + JSON.stringify(F.dag()) + '\n```' });
  ok(!r.error && /Accepted/.test(r.text) && /the next agent of the map/.test(r.text), 'the corrected answer is accepted (JSON in a code fence is fine)');
  ok(inbox(uid).length === 1 && !JSON.parse(kvOf(uid)['a:curriculum:' + cid].value).nodes.prob_basics, 'it waits in the inbox — the curriculum record itself is not touched by the connector');
  r = await tool('noema_curriculum_task', { curriculum_id: cid });
  ok(/Agent 1b/.test(r.text) && /Probability basics/.test(r.text), 'the next task already sees the accepted map (inbox merged): agent 1b');
  await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'audit', result_json: JSON.stringify(F.audit()) });
  r = await tool('noema_curriculum_task', { curriculum_id: cid });
  ok(/Agent 2/.test(r.text) && /task expand/.test(r.text), 'then agent 2');
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'expand', result_json: JSON.stringify(F.expand()) });
  ok(!r.error && /step\(s\) still need their chapter plan/.test(r.text), 'the map is complete → chapter plans next');
  // the app picks the answers up by itself
  ok(await until(async () => /Your curriculum is ready/.test(await p.locator('.cg-status').innerText()), 30000), 'the app picks up the answers by itself (inbox, every 20 s while waiting / ⟳) → “ready”');
  ok(await until(() => inbox(uid).length === 0, 5000) && /💬 Claude app — Agent 2/.test(await p.locator('.cg-log').innerText()), 'applied in order, logged, and removed from the inbox');
  await p.click('button:has-text("Open the map")'); await wait(500);
  const nNodes = await p.evaluate(id => Object.keys(NoemaCurriculum.get(Noema.account.id, id).nodes).length, cid);
  ok(nNodes > 15 && /to plan/.test(await p.locator('.cm-appbar').innerText()) && await p.locator('.cm-node:has-text("💬")').count() === nNodes, `the map (${nNodes} steps) is usable at once; the 💬 bar: steps to plan; each unplanned step shows 💬`);
  let batches = 0;
  for (; batches < 10; batches++) {
    r = await tool('noema_curriculum_task', { curriculum_id: cid, want: 'plan' }); if (!/task plan:/.test(r.text)) break;
    const ids = r.text.match(/task plan:([^\s]+)/)[1].split(',');
    if (!batches) ok(ids.length === 5 && /node IDs: /.test(r.text) && /Chapter granularity/.test(r.text), 'plan tasks: batches of 5 with the planner’s own prompt');
    r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: 'plan:' + ids.join(','), result_json: JSON.stringify(F.withMaterial(F.plans(ids), r.text)) });
    if (r.error) { console.log(r.text.slice(0, 300)); break; }
  }
  ok(/The map and all chapter plans are done/.test(r.text) || /Nothing is waiting/.test(r.text), `${batches} plan batches, then “all done”`);
  await p.click('.cm-appbar button:has-text("How?")'); await p.click('.cm-checknow'); await wait(800);
  ok(await until(() => p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); return Object.values(c.nodes).every(n => n.chapters.length) && c.stage === 'done'; }, cid), 8000), '⟳ Check now → every step has its chapters; stage “done”');
  await p.screenshot({ path: SHOTS + '/ca1_panel.png' }); await p.keyboard.press('Escape'); await p.locator('.noema-ovbox:has(.cm-apppanel) button:has-text("Close")').click().catch(() => { }); await wait(300);

  /* ---------- B. a step prepared by the Claude app ---------- */
  console.log('— B. a step reviewed here, prepared by the Claude app');
  const first = await p.evaluate(id => NoemaCurriculum.nextUp(Noema.account.id, NoemaCurriculum.get(Noema.account.id, id))[0], cid);
  await p.click(`.cm-node[data-id="${first}"]`); await wait(300);
  await p.click('button:has-text("Review & prepare this step")'); await wait(300);
  ok(await p.locator('button:has-text("send it to my Claude app")').count() === 1, 'the review ends with “✅ Looks good — send it to my Claude app”');
  await p.click('button:has-text("send it to my Claude app")'); await wait(500);
  ok(await p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack?.status, [cid, first]) === 'app' && /Waiting for your Claude app/.test(await p.locator('.cm-panel').innerText()), 'the step waits for the Claude app (💬), with the message to copy, “by hand” and 📥 import');
  await until(() => /"status":"app"/.test(kvOf(uid)['a:curriculum:' + cid]?.value || ''), 8000);
  await p.screenshot({ path: SHOTS + '/ca3_step.png' });
  r = await tool('noema_curriculum_task', { curriculum_id: cid });
  const sid = (r.text.match(/subject_id: (cur-[a-z0-9-]+)/) || [])[1];
  ok(sid && /prepare ONE step/.test(r.text) && /research it yourself/.test(r.text) && /Planned chapters/.test(r.text) && /noema_finish_upload/.test(r.text) && /start_subject\.py work cur-/.test(r.text), 'the step task: subject id, brief with the planned chapters, research (no files), how to build and save it');
  const pack = JSON.parse(JSON.stringify(FX)); pack.subject = { ...pack.subject, id: sid, title: 'Probability basics', owner: null }; pack.version = sid + '-v1';
  const su = (await tool('noema_start_upload', { subject_id: sid })).text; const upUrl = su.match(/https?:\/\/\S+upload\/sign\S+/)[0];
  await fetch(upUrl, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(pack) });
  r = await tool('noema_finish_upload', { subject_id: sid });
  if (!/This is the step/.test(r.text)) console.log('   finish:', r.text.slice(0, 400));
  ok(!r.error && /This is the step “[^”]+” of the curriculum/.test(r.text) && JSON.parse(kvOf(uid)['a:packmeta:' + sid].value).curriculum === cid, 'finish_upload knows the step: registered with its curriculum + node, the app is told through the inbox');
  ok(await until(() => p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack?.status === 'ready', [cid, first]), 25000), 'the app picks it up: the step is ⚡ ready (pack downloaded from the cloud)');
  ok(await until(async () => /Study this step/.test(await p.locator('.cm-panel').innerText()), 5000) && await p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack.via === 'claude-app', [cid, first]), '📖 Study this step');
  // 💬 prepare many steps ahead (e.g. overnight with a scheduled task): queue the whole map at once, in study order
  await p.click('.cm-tools button:has-text("⚙️")'); await wait(300); await p.click('summary:has-text("Prepare many steps ahead")');
  await p.selectOption('.cm-qmany', '5'); await p.click('.cm-queuemany'); await wait(300);
  ok(/0 steps queued/.test(await p.locator('.cm-qlog').innerText()) && /wait for your review/.test(await p.locator('.cm-qlog').innerText()), 'steps waiting for a review are not queued unless asked');
  await p.check('.cm-ahead input[type=checkbox]'); await p.selectOption('.cm-qmany', 'all'); await p.click('.cm-queuemany'); await wait(400);
  const qn = await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); const q = Object.entries(c.nodes).filter(([, n]) => n.pack?.status === 'app').sort((a, b) => a[1].pack.queuedAt.localeCompare(b[1].pack.queuedAt)).map(([k]) => k); return { q, total: Object.keys(c.nodes).length, order: NoemaCurriculum.order(c) }; }, cid);
  ok(qn.q.length === qn.total - 1 && /Copy the message/.test(await p.locator('.cm-qlog').innerText()), `“all steps not prepared yet”, without review → ${qn.q.length} steps queued (even locked ones), with the message to paste`);
  ok(qn.q.every((id, i) => i === 0 || qn.order.indexOf(id) > -1), 'queued in study order');
  await until(() => (JSON.parse(kvOf(uid)['a:curriculum:' + cid]?.value || '{"nodes":{}}').nodes ? Object.values(JSON.parse(kvOf(uid)['a:curriculum:' + cid].value).nodes).filter(n => n.pack?.status === 'app').length : 0) === qn.q.length, 8000);
  ok(new RegExp(`${qn.q.length} step\\(s\\) queued to prepare`).test((await tool('noema_curricula')).text) && (await tool('noema_curriculum_task', { curriculum_id: cid, want: 'step' })).text.includes(`(${qn.q[0]})`), 'the connector serves them one by one, first the first in study order');
  await p.evaluate(([id, ids]) => { const c = NoemaCurriculum.get(Noema.account.id, id); for (const k of ids) c.nodes[k].pack = { ...c.nodes[k].pack, status: null }; NoemaCurriculum.save(Noema.account.id, c); }, [cid, qn.q]);
  await p.locator('.noema-ovbox:has(.cm-ahead) button:has-text("Close")').click(); await wait(200);

  /* ---------- C. an imported map with the learner's PDF ---------- */
  console.log('— C. an imported map with a PDF, planned and prepared by the Claude app');
  await p.click('.cm-top button:has-text("Curricula")'); await wait(300);
  await p.click('button:has-text("Import a map")'); await wait(300);
  await p.fill('.cm-maptext', '# Cell biology\nBasics → Membranes → Transport\n📎 Files\nMembranes: membranes.pdf pp. 2-3'); await wait(600);
  await p.setInputFiles('.cm-import .cg-drop input[type=file]', [path.join(TF, 'membranes.pdf')]); await wait(800);
  ok(await p.locator('.cm-provider').inputValue() === 'claudeapp', 'import: the Claude app is preselected too');
  await p.click('button:has-text("Import my map")');
  ok(await until(() => p.locator('.cm-apppanel').count(), 15000), 'imported at once (nothing planned here) → the map opens with “💬 Your Claude app” showing what to do');
  await p.screenshot({ path: SHOTS + '/ca4_import.png' });
  const cid2 = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id).find(c => c.title === 'Cell biology').id);
  ok(await until(() => !!kvOf(uid)['a:srcfiles:curfiles-' + cid2] && Object.keys(srv.state.files).some(k => k.includes(`/sources/curfiles-${cid2}/`)), 10000), 'the PDF is stored once for the curriculum, in the cloud');
  await p.locator('.noema-ovbox:has(.cm-apppanel) button:has-text("Close")').click(); await wait(200);
  await until(() => !!kvOf(uid)['a:curriculum:' + cid2], 8000);
  r = await tool('noema_curricula');
  r = await tool('noema_curriculum_task', { curriculum_id: cid2 });
  ok(/task plan:/.test(r.text) && /The learner's own material/.test(r.text) && /membranes\.pdf — ONLY pages 2–3/.test(r.text), 'plan task: the step’s own file with its pages (plan FROM the files)');
  const planLink = (r.text.match(/curl -sSL -o "work\/plan-[^"]+\/membranes\.pdf" "([^"]+)"/) || [])[1];
  ok(/READ every page of each step before planning it/.test(r.text) && planLink && Buffer.from(await (await fetch(planLink)).arrayBuffer()).equals(PDF), 'the plan task also gives Claude the file itself (signed link) and tells it to read the step’s pages before planning');
  const big = await p.evaluate(() => { const J = NoemaCurJobs; const c = { nodes: { a: { material: { files: [{}] } }, b: { material: { files: [{}] } }, c: {}, d: { material: { files: [{}] } }, e: {}, f: {}, g: {} } }; return J.planBatch(c, ['a', 'b', 'c', 'd', 'e', 'f', 'g']); });
  ok(big.join() === 'a,b,c,e,f', 'plan batches: at most 5 steps, of which at most 2 with files (the others wait for the next batch): ' + big.join());
  const ids2 = r.text.match(/task plan:([^\s]+)/)[1].split(',');
  { // the plan must cover every page of the step's files: a plan that leaves pages out comes back with them
    const bad = F.plans(ids2); bad.plans.find(x => x.nodeId === 'membranes').chapters.forEach(ch => { ch.material = 'membranes.pdf p. 2'; });
    const rb = await tool('noema_curriculum_submit', { curriculum_id: cid2, task_id: 'plan:' + ids2.join(','), result_json: JSON.stringify(bad) });
    ok(rb.error && /pages 3 of membranes\.pdf are in no chapter|no chapter has "material"/.test(rb.text) || rb.error && /membranes/.test(rb.text), 'a plan that leaves pages of the step’s files out is sent back: ' + (rb.text.split('\n')[1] || '').slice(0, 140));
    const none = F.plans(ids2);
    const rn = await tool('noema_curriculum_submit', { curriculum_id: cid2, task_id: 'plan:' + ids2.join(','), result_json: JSON.stringify(none) });
    ok(rn.error && /no chapter has "material" from membranes\.pdf/.test(rn.text), 'a plan that ignores the step’s file is sent back');
    ok(/anchor its chapters|Anchor the step's chapters/.test(r.text) && /EVERYTHING in those pages/.test(r.text), 'the task tells Claude explicitly: read ALL the files, cover everything down to the details, cite file + pages');
  }
  await tool('noema_curriculum_submit', { curriculum_id: cid2, task_id: 'plan:' + ids2.join(','), result_json: JSON.stringify(F.withMaterial(F.plans(ids2), r.text)) });
  await p.evaluate(() => NoemaCurJobs.App.poll()); await wait(300);
  ok(await p.evaluate(id => Object.values(NoemaCurriculum.get(Noema.account.id, id).nodes).every(n => n.chapters.length), cid2), 'planned by the Claude app');
  await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); c.autoApprove = true; NoemaCurriculum.save(Noema.account.id, c); NoemaCurriculum.setMastered(Noema.account.id, c, 'basics', 'test'); NoemaCurriculum.Gen.kick(); }, cid2);
  ok(await until(() => p.evaluate(id => NoemaCurriculum.get(Noema.account.id, id).nodes.membranes?.pack?.status === 'app', cid2), 8000), '“prepare ahead”: the next open step is queued for the Claude app by itself (no key, nothing built here)');
  await until(() => /"membranes"[^]*"status":"app"/.test(kvOf(uid)['a:curriculum:' + cid2]?.value || ''), 8000);
  r = await tool('noema_curriculum_task', { curriculum_id: cid2, want: 'step' });
  const sid2 = (r.text.match(/subject_id: (cur-[a-z0-9-]+)/) || [])[1];
  const link = (r.text.match(/curl -sSL -o "work\/[^"]+\/sources\/membranes\.pdf" "([^"]+)"/) || [])[1];
  ok(sid2 && link && /THE sources of this step/.test(r.text) && /only pages 2–3 belong to this step/.test(r.text), 'the step task gives Claude a signed link to the learner’s PDF and its pages');
  const got = Buffer.from(await (await fetch(link)).arrayBuffer());
  ok(got.equals(PDF), 'the link downloads exactly the learner’s file');
  const pack2 = JSON.parse(JSON.stringify(FX)); pack2.subject = { ...pack2.subject, id: sid2, title: 'Membranes', owner: null }; pack2.version = sid2 + '-v1';
  pack2.sources = { sources: [{ id: 'm1', title: 'Membranes (my PDF)', file: 'sources/membranes.pdf', fileName: 'membranes.pdf', size: PDF.length, sha256: crypto.createHash('sha256').update(PDF).digest('hex'), mime: 'application/pdf', firstPage: 1 }], chapters: { ch01: 'm1' }, patches: {} };
  r = await tool('noema_save_pack', { pack_json: JSON.stringify(pack2) });
  ok(!r.error && /1 source file\(s\) attached/.test(r.text) && !Object.keys(srv.state.files).some(k => k.includes(`/sources/${sid2}/`)), 'Claude packaged the same PDF: recognised by its SHA-256 — accepted without uploading it again');
  ok(JSON.parse(kvOf(uid)['a:srcfiles:' + sid2].value).m1.ref?.subj === 'curfiles-' + cid2, 'the step’s source links to the curriculum’s copy');
  await p.evaluate(() => NoemaCurJobs.App.poll());
  ok(await until(() => p.evaluate(id => NoemaCurriculum.get(Noema.account.id, id).nodes.membranes.pack.status === 'ready', cid2), 15000), 'the step is ready in the app');
  ok(await p.evaluate(async s => !!(await NoemaSrcFiles.get(Noema.account.id, s, 'm1'))?.blob, sid2), '👁 its PDF opens (through the link)');

  /* ---------- D. without the connector ---------- */
  console.log('— D. by hand: copy a task, paste the answer; a step bundle and its package; re-plan with a wish; one step of an API curriculum');
  await p.click('.cm-top button:has-text("Curricula")'); await wait(300);
  await p.click('button:has-text("New curriculum")'); await wait(300);
  await p.fill('textarea[placeholder^="e.g. “Bayesian"]', 'Bayesian inference again'); await p.selectOption('label:has-text("Depth") select', 'standard');
  await p.click('.cg-go'); await wait(600);
  await p.click('.cm-manual summary'); await p.screenshot({ path: SHOTS + '/ca5_manual.png', fullPage: true }); await p.click('.cm-copytask'); const task = await clip();
  ok(/Agent 1/.test(task) && /answer with exactly ONE JSON object/.test(task) && !/noema_curriculum_submit/.test(task), 'copy the task: the same task, to answer with the JSON only');
  await p.fill('.cm-paste', JSON.stringify(F.dag({ broken: true }))); await p.click('.cm-usepaste'); await wait(300);
  ok(/problem/.test(await p.locator('.cm-pasteout').innerText()) && await p.locator('.cm-pasteout button:has-text("Copy the problems")').count() === 1, 'a wrong answer: its problems, ready to copy back to Claude');
  for (const [i, ans] of [F.dag(), F.audit(), F.expand()].entries()) { await p.fill('.cm-paste', JSON.stringify(ans)); await p.click('.cm-usepaste'); await wait(400); if (!i) ok(/Accepted/.test(await p.locator('.cm-pasteout').innerText()), 'the right answer is accepted'); }
  ok(await until(async () => /Your curriculum is ready/.test(await p.locator('.cg-status').innerText()), 5000), 'three pasted answers → the map is ready');
  const cid3 = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id).find(c => c.goal === 'Bayesian inference again').id);
  // a step's bundle and its package
  await p.click('button:has-text("Open the map")'); await wait(500);
  const st3 = await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); const n = NoemaCurriculum.nextUp(Noema.account.id, c)[0]; c.nodes[n].chapters = [{ ref: 'a', title: 'A', goals: ['g'], coverage: ['c'] }]; c.nodes[n].learningGoals = ['x', 'y']; NoemaCurriculum.save(Noema.account.id, c); NoemaCurriculum.Gen.toApp(c, n); return n; }, cid3);
  await p.click(`.cm-node[data-id="${st3}"]`); await wait(300);
  await p.click('.cm-panel button:has-text("How?")'); await wait(300); await p.click('.noema-ovbox:has(.cm-apppanel) .cm-manual summary');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.cm-bundle')]);
  const zb = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const taskMd = await zb.file('TASK.md').async('string');
  ok(/-for-claude\.zip$/.test(dl.suggestedFilename()) && /prepare ONE step/.test(taskMd) && /📥 Import its package/.test(taskMd) && !!zb.file('noema-pack-builder.zip'), '⬇️ the step’s bundle: TASK.md (the same instructions) + the toolkit');
  const sid3 = taskMd.match(/subject_id: (cur-[a-z0-9-]+)/)[1];
  const pack3 = JSON.parse(JSON.stringify(FX)); pack3.subject = { ...pack3.subject, id: 'whatever-claude-called-it', title: 'X', owner: null }; pack3.version = 'v-manual';
  const z3 = new JSZip(); z3.file('pack.json', JSON.stringify(pack3)); const zp = path.join(TF, 'step.noema.zip'); fs.writeFileSync(zp, await z3.generateAsync({ type: 'nodebuffer' }));
  await p.locator('.noema-ovbox:has(.cm-apppanel) .cm-importpkg input').setInputFiles(zp);
  ok(await until(() => p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack?.status === 'ready', [cid3, st3]), 10000), '📥 the .noema.zip Claude made → the step is ready');
  ok(await p.evaluate(([id, n, s]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack.id === s && NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack.via === 'claude-chat', [cid3, st3, sid3]), 'stored under the step’s own subject id (whatever id Claude used)');
  await p.locator('.noema-ovbox:has(.cm-apppanel) button:has-text("Close")').click().catch(() => { }); await wait(200);
  // re-plan with a wish (no key): the Claude app gets a plan task carrying the wish
  const other = await p.evaluate(id => Object.keys(NoemaCurriculum.get(Noema.account.id, id).nodes).find(n => n.startsWith('g_')), cid3);
  await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); for (const n of Object.values(c.nodes)) if (!n.chapters.length) { n.chapters = [{ ref: 'a', title: 'A', goals: ['g'], coverage: ['c'] }]; n.learningGoals = ['x', 'y']; } c.stage = 'done'; NoemaCurriculum.save(Noema.account.id, c); }, cid3);
  await p.evaluate(() => NoemaClaude.Key.set(Noema.account.id, 'sk-ant-api03-' + 'k'.repeat(40), true));   // even with an API key here: the curriculum chose the Claude app
  const rp = await p.evaluate(([id, n]) => NoemaCurriculum.Edit.plan(Noema.account.id, id, [n], { instruction: 'more clinical examples' }), [cid3, other]);
  await p.evaluate(() => NoemaClaude.Key.forget(Noema.account.id));
  await until(() => /more clinical examples/.test(kvOf(uid)['a:curriculum:' + cid3]?.value || ''), 8000);
  r = await tool('noema_curriculum_task', { curriculum_id: cid3, want: 'plan' });
  ok(rp.queued && r.text.includes(`task plan:${other}\n`) && /more clinical examples/.test(r.text), '✨ re-plan in a Claude-app curriculum (even with an API key on the device) → a plan task for the Claude app, with the learner’s wish — no API cost');
  ok(await p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].chapters.length > 0, [cid3, other]), 'its current chapters stay until the new plan arrives');
  // ✨ re-plan the whole curriculum — a Claude-app curriculum: every step not prepared goes to the Claude app (the prepared one keeps its plan)
  await p.evaluate(() => NoemaCurJobs.App.poll()); await wait(300);
  await p.click('.cm-tools button:has-text("⚙️")'); await wait(300); await p.click('summary:has-text("Re-plan the whole curriculum")');
  ok(/your Claude app/.test(await p.locator('.noema-ovbox:has(.cm-replanall)').innerText()), '⚙️ → ✨ Re-plan the whole curriculum — with the curriculum’s own AI (here: the Claude app)');
  p.once('dialog', d => d.accept()); await p.click('.cm-replanall'); await wait(500);
  ok(/steps wait for your Claude app/.test(await p.locator('.cm-replanlog').innerText()), 'queued for the Claude app');
  const rq = await p.evaluate(([id, n]) => { const c = NoemaCurriculum.get(Noema.account.id, id); return { replan: Object.values(c.nodes).filter(x => x.replan).length, total: Object.keys(c.nodes).length, prepared: !c.nodes[n].replan }; }, [cid3, st3]);
  ok(rq.replan === rq.total - 1 && rq.prepared, `${rq.replan} of ${rq.total} steps wait for a new plan; the prepared step does not`);
  await until(() => (JSON.parse(kvOf(uid)['a:curriculum:' + cid3]?.value || '{}').nodes ? Object.values(JSON.parse(kvOf(uid)['a:curriculum:' + cid3].value).nodes).filter(x => x.replan).length : 0) === rq.replan, 8000);
  r = await tool('noema_curriculum_task', { curriculum_id: cid3, want: 'plan' });
  ok(/task plan:/.test(r.text), 'the Claude app gets the plan tasks');
  await p.locator('.noema-ovbox:has(.cm-replanall) button:has-text("Close")').click(); await wait(200);
  // an API curriculum: one step sent to the Claude app
  const cid4 = await p.evaluate(id => { const a = Noema.account.id; const c = JSON.parse(JSON.stringify(NoemaCurriculum.get(a, id))); c.id = 'capi' + Date.now().toString(36).slice(-4); c.provider = 'gemini'; c.title = 'API one'; for (const n of Object.values(c.nodes)) { delete n.pack; delete n.replan; if (!n.chapters.length) n.chapters = [{ ref: 'a', title: 'A', goals: ['g'], coverage: ['c'] }]; } NoemaCurriculum.save(a, c); return c.id; }, cid3);
  await p.click('.cm-top button:has-text("Curricula")'); await wait(300); await p.click(`.cm-card:has-text("API one")`); await wait(400);
  const st4 = await p.evaluate(id => NoemaCurriculum.nextUp(Noema.account.id, NoemaCurriculum.get(Noema.account.id, id))[0], cid4);
  await p.click(`.cm-node[data-id="${st4}"]`); await wait(300);
  ok(await p.locator('.cm-panel .cm-otherways').count() === 1, 'a step of an API / Gemini curriculum: “Other ways to prepare it”');
  await p.click('.cm-panel .cm-otherways summary'); await p.click('.cm-toapp'); await wait(400);
  ok(await p.evaluate(([id, n]) => NoemaCurriculum.get(Noema.account.id, id).nodes[n].pack?.status === 'app', [cid4, st4]), '💬 “In my Claude app instead” queues just that step');
  await until(() => /"status":"app"/.test(kvOf(uid)['a:curriculum:' + cid4]?.value || ''), 8000);
  ok(/API one[^]*1 step\(s\) queued to prepare/.test((await tool('noema_curricula')).text), 'the connector lists it');
  await p.locator('.noema-ovbox:has(.cm-apppanel) button:has-text("Close")').click().catch(() => { }); await wait(200);

  /* ---------- E. ❓ Set up Claude → C, phone ---------- */
  console.log('— E. ❓ Set up Claude → way C; phone');
  const sv = await p.evaluate(() => { const d = Noema.claudeSetupView(Noema.account.id, { open: 'C' }); document.body.append(d); const c = d.querySelector('.cg-way-c'); const t = { open: c.open, text: c.innerText, order: [...d.querySelectorAll('.cg-way > summary b')].map(b => b.textContent.slice(0, 2)) }; d.remove(); return t; });
  ok(sv.open && /recommended for curricula/.test(sv.text) && /usually the cheapest/.test(sv.text) && /Add custom connector/.test(sv.text) && /Copy the message/.test(sv.text) && sv.order.length === 3, '❓ Set up Claude has a 3rd way, C — ⭐ recommended for curricula (usually the cheapest), with its own steps');
  const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 844 }); await ph.goto(BASE + '/'); await wait(1200);
  await ph.evaluate(id => NoemaCurMap.map(Noema.account.id, id, { appHelp: true }), cid3).catch(() => { }); await wait(800);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cm-apppanel, .cm-appbar')].every(s => s.getBoundingClientRect().right <= innerWidth + 1)), 'phone: the Claude-app panel fits');
  await ph.screenshot({ path: SHOTS + '/ca2_phone.png' });
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); fs.rmSync(fn, { force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
