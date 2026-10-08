/* 👥 Shared curricula (engine/curshare.js, docs/CURRICULUM.md §8) — three people against the Supabase emulator, plus the
   connector (cloud/mcp/server.mjs) run in-process as one of them:
     A. Anna shares her curriculum with people (the step she prepared goes with it, and her material file) and invites Bob
     B. Bob gets the invitation (🔔 banner), joins, sees Anna's step ⚡👤 and studies it — his own progress
     C. Bob's Claude app prepares an empty step: reserved for him (nobody else may take it), saved → shared with everybody
     D. nobody overwrites a step somebody else prepared — not the owner, not a member (app, connector and the API itself)
     E. Anna makes it public → Carl finds it in 🌍 Explore curricula, joins, prepares the last step; everybody sees it
     F. the owner changes the map → it reaches the members (their progress stays); the owner removes a member's version
     G. Bob leaves, Anna stops sharing → Carl keeps his copy; phone layout; no page errors
   Usage: node tests/curriculum_share.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54371, BASE = `http://localhost:${PORT}`;
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));

async function signUp(browser, email, name, { phone = false } = {}) {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1300, height: 900 }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1300);
  return { p, E, ctx };
}
const closeAll = p => p.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(x => x.remove()));

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: true, storageChunkBytes: 200000 };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg, maxObject: 300000 });
  const S = srv.state, stepOf = (cid, nid) => S.steps.find(r => r.curriculum === cid && r.node_id === nid);
  // the connector exactly as tools/build.py bundles it (MCP_ENGINE), pointed at the emulator
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] };
  const fn = path.join(os.tmpdir(), `noema-mcp-share-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify({ workflow: 'W', content: 'C', visual: 'V' })};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
  const { default: handler } = await import(fn);
  const tokenOf = async email => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })).json()).access_token;
  let rpc = 0;
  const tool = async (T, name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })).then(r => r.json()); return { text: r.result?.content?.map(c => c.text).join('\n') || JSON.stringify(r.error), error: !!r.result?.isError }; };
  const rest = async (T, p, o = {}) => { const r = await fetch(BASE + p, { method: o.method || 'GET', headers: { apikey: 'k', authorization: 'Bearer ' + T, 'content-type': 'application/json', ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; };
  const browser = await chromium.launch();
  const packFor = (id, title, v) => { const p = JSON.parse(JSON.stringify(FX)); p.subject = { ...p.subject, id, title, owner: null }; p.version = v; return p; };
  const finishStep = (who, cid, nid, title, v) => who.p.evaluate(async ({ cid, nid, pack }) => { const C = NoemaCurriculum; C.Gen.start(Noema.account.id); await C.Gen.finish(C.get(Noema.account.id, cid), nid, pack); }, { cid, nid, pack: packFor('x', title, v) });
  const cur = (who, cid) => who.p.evaluate(cid => NoemaCurriculum.get(Noema.account.id, cid), cid);

  /* ---------- A. Anna shares ---------- */
  console.log('— A. Anna shares her curriculum with people');
  const A = await signUp(browser, 'anna@example.com', 'Anna');
  const anna = Object.values(S.users).find(u => u.email === 'anna@example.com').id;
  const cid = await A.p.evaluate(async () => {
    const C = NoemaCurriculum, acc = Noema.account.id; const c = C.blank({ goal: 'Cell biology', language: 'en', depth: 'standard' });
    const mk = (id, title, role) => ({ id, title, role, part: C.PART[role], summary: title + ' — what it covers', learningGoals: ['explain ' + title], chapters: [{ title: title + ' I', goals: ['a'], coverage: ['x'] }, { title: title + ' II', goals: ['b'], coverage: ['y'] }] });
    c.nodes = { atoms: mk('atoms', 'Atoms', 'foundation'), cells: mk('cells', 'Cells', 'intro'), membranes: mk('membranes', 'Membranes', 'aspect'), energy: mk('energy', 'Energy', 'aspect') };
    c.edges = [{ from: 'atoms', to: 'cells' }, { from: 'cells', to: 'membranes' }, { from: 'atoms', to: 'energy' }];
    c.goalId = 'cells'; c.status = 'ready'; c.stage = 'done'; c.title = 'Cell biology'; c.prefetch = 0; c.autoApprove = true;
    // her material: one file the step “Membranes” is taught from (stored once per curriculum)
    const blob = new File([new Uint8Array(5000).map((_, i) => i % 251)], 'membranes.pdf', { type: 'application/pdf' });
    await NoemaSrcFiles.put(acc, C.curStore(c.id), 'f_membranes', blob);
    c.files = { f_membranes: { name: 'membranes.pdf', size: 5000, type: 'application/pdf', pages: 4 } };
    c.nodes.membranes.material = { files: [{ fileId: 'f_membranes', srcId: 'membranes-pdf', name: 'membranes.pdf', size: 5000, type: 'application/pdf', pages: 4 }] };
    C.save(acc, c); return c.id;
  });
  await finishStep(A, cid, 'atoms', 'Atoms', 'anna-atoms-v1');
  const pid = id => `cur-${cid.slice(1, 7)}-`;   // (prefix only)
  await A.p.click('.cm-mode:has-text("Curricula")'); await wait(400);
  ok(await A.p.locator('.cm-explorebtn').isVisible() && await A.p.locator('.cm-sharebtn').count() === 1, '🧭 Curricula: 🌍 Explore curricula, and 👥 on her own curriculum');
  await A.p.click('.cm-sharebtn'); await wait(300);
  ok(/keeps their own progress/i.test(await A.p.locator('.cm-sharedlg').innerText()) && /Nobody can overwrite a step someone else prepared/.test(await A.p.locator('.cm-sharedlg').innerText()) && /Include the 1 step you prepared/.test(await A.p.locator('.cm-sharedlg').innerText()), 'the dialog says the rules: own progress, shared steps, nobody overwrites anybody — and offers her prepared step');
  await A.p.screenshot({ path: SHOTS + '/cs1_share.png' });
  await A.p.click('.cm-sharepeople');
  ok(await until(() => S.curs[cid] && stepOf(cid, 'atoms')?.status === 'ready', 15000), 'shared: the map is in the cloud, her prepared step too (ready, by Anna)');
  const sc = S.curs[cid];
  ok(!sc.public && sc.owner === anna && sc.record.nodes.atoms && !sc.record.nodes.atoms.pack && !sc.record.log && !sc.record.prefetch && !('remote' in sc.record), 'the shared map has the steps and plans — nobody’s progress, settings or preparation state');
  const atomsRow = stepOf(cid, 'atoms');
  ok(atomsRow.author === anna && atomsRow.author_name === 'Anna' && S.curFiles[atomsRow.path + '.p000'] || S.curFiles[atomsRow.path], 'the step’s subject is in the shared bucket, in her own folder: ' + atomsRow.path + (atomsRow.meta.chunks ? ` (${atomsRow.meta.chunks} parts)` : ''));
  ok(Object.keys(S.curFiles).some(k => k.startsWith(cid + '/files/')) && sc.meta.files?.f_membranes, 'her material file goes with the map (the members prepare “Membranes” from it)');
  await A.p.fill('.cm-sharedlg input[type=email]', 'bob@example.com'); await A.p.fill('.cm-sharedlg input[placeholder^="A message"]', 'Let us split the work!');
  await A.p.click('.cm-invitebtn');
  ok(await until(() => S.mems.some(m => m.email === 'bob@example.com' && m.status === 'pending')), '📨 Bob is invited');
  ok(await until(async () => /bob@example\.com/.test(await A.p.locator('.cm-members').innerText()) && /invited/.test(await A.p.locator('.cm-members').innerText())), 'the dialog lists him: ⏳ invited');
  await A.p.screenshot({ path: SHOTS + '/cs2_shared.png' });
  await closeAll(A.p);

  /* ---------- B. Bob joins ---------- */
  console.log('— B. Bob joins and studies Anna’s step');
  const B = await signUp(browser, 'bob@example.com', 'Bob');
  const bob = Object.values(S.users).find(u => u.email === 'bob@example.com').id;
  await B.p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await B.p.evaluate(() => Noema.notes.refresh()); await wait(400);
  ok(/Anna invites you to the curriculum “Cell biology”/.test(await B.p.locator('.sharebar').innerText()) && await B.p.locator('.sharebar button:has-text("Join")').isVisible(), '🔔 the banner: “Anna invites you to the curriculum …” → Join');
  await B.p.click('.sharebar button:has-text("Join")');
  ok(await until(() => S.mems.some(m => m.email === 'bob@example.com' && m.status === 'joined' && m.user_id === bob)), 'he joined');
  let bc = await cur(B, cid);
  ok(bc && bc.id === cid && bc.shared?.role === 'member' && bc.shared.ownerName === 'Anna' && Object.keys(bc.nodes).length === 4 && bc.prefetch === 0, 'he has the map (the same id → the same step subjects), as a member: nothing is prepared for him automatically');
  ok(await until(async () => (await cur(B, cid)).remote?.atoms?.status === 'ready'), 'he sees that Anna prepared “Atoms”');
  await B.p.keyboard.press('Escape').catch(() => { }); await closeAll(B.p);
  await B.p.evaluate(cid => Noema.curriculumMap(cid), cid); await wait(800);
  ok(/Shared by Anna/.test(await B.p.locator('.cm-sharebar').innerText()) && /your progress is your own/.test(await B.p.locator('.cm-sharebar').innerText()), 'the map: “👥 Shared by Anna · … · your progress is your own”');
  ok(await B.p.locator('.cm-node[data-id="atoms"] .cm-by').count() === 1 && /prepared by Anna/.test(await B.p.locator('.cm-node[data-id="atoms"]').getAttribute('aria-label')), '“Atoms”: ⚡👤 prepared by Anna');
  ok(await B.p.locator('button:has-text("➕ Step")').count() === 0 && await B.p.locator('.cm-sharetool').count() === 0, 'a member does not change the map (no ➕ Step, no sharing)');
  await B.p.screenshot({ path: SHOTS + '/cs3_member_map.png' });
  await B.p.click('.cm-node[data-id="atoms"]'); await wait(300);
  ok(/Prepared by Anna/.test(await B.p.locator('.cm-panel').innerText()) && await B.p.locator('.cm-panel .cm-editrow').count() === 0, 'its panel: “⚡ Prepared by Anna — shared with everybody”, no ✏️ Edit step');
  const atomsId = await B.p.evaluate(cid => NoemaCurriculum.packId(NoemaCurriculum.get(Noema.account.id, cid), 'atoms'), cid);
  ok(await until(async () => (await cur(B, cid)).nodes.atoms.pack?.status === 'ready'), 'the next prepared step is fetched ahead into his account (it opens at once)');
  const bp = (await cur(B, cid)).nodes.atoms.pack;
  ok(bp.shared && bp.by === 'Anna' && bp.author === anna && bp.version === 'anna-atoms-v1', '…with who prepared it and its version');
  await B.p.click('.cm-node[data-id="atoms"]'); await wait(300);
  await B.p.click('.cm-panel button:has-text("Study this step")');
  ok(await until(() => B.p.evaluate(() => !!document.querySelector('.nodebanner')), 8000), '…and it opens as his subject, with the curriculum banner');
  ok(!!S.kv[bob]['a:packmeta:' + atomsId] && !!S.files[`${bob}/packs/${atomsId}.json`], 'it is his own copy now (his cloud), under the same subject id as Anna’s');
  await B.p.evaluate(({ cid }) => NoemaCurriculum.setMastered(Noema.account.id, NoemaCurriculum.get(Noema.account.id, cid), 'atoms', 'test', { score: 0.9 }), { cid });
  await wait(4000);
  ok(!!S.kv[bob]['a:curprog:' + cid] && !S.kv[anna]['a:curprog:' + cid], 'his progress is his own (his account) — Anna’s is untouched');

  /* ---------- C. Bob's Claude app prepares an empty step ---------- */
  console.log('— C. Bob’s Claude app prepares “Cells” (nobody had it)');
  await B.p.evaluate(cid => { const C = NoemaCurriculum, acc = Noema.account.id; const c = C.get(acc, cid); c.provider = 'claudeapp'; C.save(acc, c); C.Gen.start(acc); C.Gen.toApp(C.get(acc, cid), 'cells'); }, cid);
  const TB = await tokenOf('bob@example.com'), TA = await tokenOf('anna@example.com');
  ok(await until(() => { try { return JSON.parse(S.kv[bob]['a:curriculum:' + cid].value).nodes.cells.pack?.status === 'app'; } catch (e) { return false; } }), 'queued for his Claude app (in the cloud for the connector)');
  let r = await tool(TB, 'noema_curricula');
  ok(/shared by Anna/.test(r.text) && /1 step\(s\) queued/.test(r.text), 'the connector lists it: “👥 shared by Anna” · 1 queued');
  r = await tool(TB, 'noema_curriculum_task', { curriculum_id: cid });
  const cellsId = (r.text.match(/cur-[a-z0-9-]+/) || [])[0];
  ok(!r.error && /Cells/.test(r.text) && cellsId, 'Bob’s Claude gets the step');
  ok(stepOf(cid, 'cells')?.status === 'preparing' && stepOf(cid, 'cells').author === bob && Date.parse(stepOf(cid, 'cells').claimed_until) > Date.now() + 3 * 3600e3, 'it is reserved for Bob in the shared curriculum (4 h) — handed out = reserved');
  ok(!(await A.p.evaluate(cid => NoemaCurShare.claim(Noema.account.id, NoemaCurriculum.get(Noema.account.id, cid), 'cells'), cid)), 'Anna cannot reserve it meanwhile (the owner neither)');
  await A.p.evaluate(cid => NoemaCurShare.refresh(Noema.account.id, cid), cid);
  ok((await cur(A, cid)).remote.cells?.status === 'preparing' && (await cur(A, cid)).remote.cells.by === 'Bob', 'Anna sees “⏳ Bob is preparing this step”');
  await A.p.evaluate(cid => Noema.curriculumMap(cid), cid); await wait(700); await A.p.click('.cm-node[data-id="cells"]'); await wait(300);
  ok(/Bob is preparing this step/.test(await A.p.locator('.cm-panel').innerText()) && await A.p.locator('.cm-panel button:has-text("Prepare this step now")').count() === 0, 'her panel: “⏳ Bob is preparing this step” — no ⚡ Prepare button');
  ok(await A.p.locator('.cm-node[data-id="cells"] .cm-by').innerText() === '⏳👤', 'on her map: ⏳👤');
  await A.p.screenshot({ path: SHOTS + '/cs4_others_prep.png' });
  // a second run of Bob's Claude (scheduled) does not get it again
  r = await tool(TB, 'noema_curriculum_task', { curriculum_id: cid });
  ok(!/subject_id/.test(r.text) || !r.text.includes(cellsId), 'a second run does not get it again');
  const pc = packFor(cellsId, 'Cells', 'bob-cells-v1');
  r = await tool(TB, 'noema_save_pack', { pack_json: JSON.stringify(pc) });
  ok(!r.error && /👥 Shared: every member/.test(r.text), 'saved → “👥 Shared: every member of “Cell biology” sees this step on their map now”');
  ok(stepOf(cid, 'cells')?.status === 'ready' && stepOf(cid, 'cells').author === bob && stepOf(cid, 'cells').version === 'bob-cells-v1' && !!S.curFiles[stepOf(cid, 'cells').path], 'the step is ready for everybody, by Bob, its subject in his folder');
  ok(await until(async () => (await cur(B, cid)).nodes.cells.pack?.status === 'ready', 30000), 'Bob’s app picks it up (his inbox) — ready for him');
  ok(await until(() => stepOf(cid, 'cells')?.meta && !stepOf(cid, 'cells').meta.filesPending), '…and publishes it again from his app (with its pictures and source files)');
  // Carl-less check of the connector refusing a step somebody else has
  r = await tool(TB, 'noema_curriculum_task', { curriculum_id: cid, step: 'Atoms' });
  ok(r.error && /prepared/.test(r.text), 'Bob’s Claude asked for “Atoms” by name: “already prepared” — not twice');

  /* ---------- D. nobody overwrites anybody ---------- */
  console.log('— D. nobody overwrites a step somebody else prepared');
  await A.p.evaluate(cid => NoemaCurShare.refresh(Noema.account.id, cid), cid);
  ok((await cur(A, cid)).remote.cells?.status === 'ready' && (await cur(A, cid)).remote.cells.by === 'Bob', 'Anna sees “Cells” ⚡ by Bob');
  await finishStep(A, cid, 'cells', 'Cells (Anna)', 'anna-cells-v1');   // she also made one (e.g. by hand) — later
  const ac = await cur(A, cid);
  ok(stepOf(cid, 'cells').author === bob && stepOf(cid, 'cells').version === 'bob-cells-v1' && ac.nodes.cells.pack.own === true, 'her own later version stays HER copy: the shared one is still Bob’s (the owner cannot overwrite it)');
  let x = await rest(TA, `/rest/v1/noema_curriculum_steps?curriculum=eq.${cid}&node_id=eq.cells`, { method: 'PATCH', body: { author: anna, version: 'evil', path: 'x' }, headers: { Prefer: 'return=representation' } });
  ok(Array.isArray(x.body) && x.body.length === 0 && stepOf(cid, 'cells').version === 'bob-cells-v1', 'the API itself refuses: the owner’s update of Bob’s step changes nothing');
  x = await rest(TB, `/rest/v1/noema_curriculum_steps`, { method: 'POST', body: [{ curriculum: cid, node_id: 'atoms', status: 'ready', author: bob, path: 'x' }] });
  ok(x.status === 409 && stepOf(cid, 'atoms').author === anna, 'a member cannot replace Anna’s step either (it exists: first come, first served)');
  x = await fetch(`${BASE}/storage/v1/object/noema-curricula/${cid}/steps/${bob}/cells.json`, { method: 'POST', headers: { apikey: 'k', authorization: 'Bearer ' + TA, 'x-upsert': 'true', 'content-type': 'application/json' }, body: '{}' });
  ok(x.status === 403, 'nobody writes into somebody else’s step files');

  /* ---------- E. public: Carl ---------- */
  console.log('— E. Anna makes it public; Carl finds it, joins, prepares the last step');
  await closeAll(A.p);
  await A.p.evaluate(cid => NoemaCurShare.setPublic(Noema.account.id, cid, true), cid);
  ok(S.curs[cid].public === true, '🌍 public');
  const Cc = await signUp(browser, 'carl@example.com', 'Carl');
  const carl = Object.values(S.users).find(u => u.email === 'carl@example.com').id;
  await Cc.p.click('.cm-mode:has-text("Curricula")'); await wait(300);
  await Cc.p.click('.cm-explorebtn'); await wait(800);
  const card = Cc.p.locator('.cm-pubcard:has-text("Cell biology")');
  ok(await card.count() === 1 && /Anna/.test(await card.innerText()) && /4 steps/.test(await card.innerText()) && /2 prepared/.test(await card.innerText()), '🌍 Explore curricula: “Cell biology” · 👤 Anna · 4 steps · ⚡ 2 prepared');
  await Cc.p.screenshot({ path: SHOTS + '/cs5_explore.png' });
  await card.locator('.cm-joinbtn').click();
  ok(await until(() => S.mems.some(m => m.user_id === carl && m.status === 'joined')) && await until(async () => /Shared by Anna/.test(await Cc.p.locator('.cm-sharebar').innerText().catch(() => ''))), '➕ Join → he is in, and the map opens');
  ok(await Cc.p.locator('.cm-node .cm-by').count() === 2, 'both prepared steps show ⚡👤');
  // Carl prepares “Energy” (here with his own AI: reserve, build, publish)
  ok(await Cc.p.evaluate(cid => NoemaCurShare.claim(Noema.account.id, NoemaCurriculum.get(Noema.account.id, cid), 'energy'), cid), 'Carl reserves “Energy” (nobody has it)');
  await finishStep(Cc, cid, 'energy', 'Energy', 'carl-energy-v1');
  ok(stepOf(cid, 'energy')?.status === 'ready' && stepOf(cid, 'energy').author === carl, 'built → shared: “Energy” ⚡ by Carl');
  await finishStep(Cc, cid, 'atoms', 'Atoms (Carl)', 'carl-atoms-v1');
  ok(stepOf(cid, 'atoms').author === anna && stepOf(cid, 'atoms').version === 'anna-atoms-v1', 'his own “Atoms” does not replace Anna’s');
  await until(() => !!S.kv[carl]?.['a:curriculum:' + cid], 15000);   // his copy reaches his cloud (the connector reads it there)
  r = await tool(await tokenOf('carl@example.com'), 'noema_curriculum_task', { curriculum_id: cid, step: 'Cells' });
  ok(r.error && /prepared by Bob/.test(r.text), 'his Claude app is told “Cells” is prepared by Bob already: ' + r.text.slice(0, 160));
  // the members' material: “Membranes” is taught from Anna's file — Carl prepares it from the shared copy
  const got = await Cc.p.evaluate(async cid => { const C = NoemaCurriculum, acc = Noema.account.id; await NoemaCurShare.ensureNodeFiles(acc, C.get(acc, cid), 'membranes'); const r = await C.materialFile(acc, C.get(acc, cid), 'membranes', C.get(acc, cid).nodes.membranes.material.files[0]); return r?.blob?.size || 0; }, cid);
  ok(got === 5000, 'the step taught from Anna’s file: its file comes from the shared curriculum to Carl, to prepare it');
  r = await tool(TB, 'noema_curricula'); await B.p.evaluate(cid => NoemaCurShare.refresh(Noema.account.id, cid), cid);
  ok((await cur(B, cid)).remote.energy?.by === 'Carl', 'Bob sees “Energy” by Carl');

  /* ---------- F. the owner changes the map ---------- */
  console.log('— F. the owner’s changes reach the members; the owner removes a version');
  await A.p.evaluate(cid => NoemaCurriculum.Edit.update(Noema.account.id, cid, 'membranes', { title: 'Membranes and transport' }), cid);
  ok(await until(() => S.curs[cid].record.nodes.membranes.title === 'Membranes and transport', 10000), 'Anna renames a step → the shared map changes by itself');
  await B.p.evaluate(cid => NoemaCurShare.refresh(Noema.account.id, cid), cid);
  bc = await cur(B, cid);
  ok(bc.nodes.membranes.title === 'Membranes and transport' && bc.nodes.atoms.pack?.status === 'ready' && bc.nodes.cells.pack?.status === 'ready' && bc.provider === 'claudeapp', 'Bob gets the new map — his steps, settings and progress stay');
  ok(await B.p.evaluate(cid => NoemaCurriculum.statuses(Noema.account.id, NoemaCurriculum.get(Noema.account.id, cid)).atoms.mastered, cid), '…“Atoms” still mastered for him');
  await A.p.evaluate(cid => NoemaCurShare.removeStep(Noema.account.id, cid, 'energy'), cid);
  ok(!stepOf(cid, 'energy') && !Object.keys(S.curFiles).some(k => k.includes('/energy.json')), 'the owner removes Carl’s version of “Energy” (the step can be prepared again)');

  /* ---------- G. leave, stop ---------- */
  console.log('— G. leaving and stopping');
  await B.p.evaluate(cid => NoemaCurShare.leave(Noema.account.id, cid), cid);
  ok(S.mems.find(m => m.email === 'bob@example.com').status === 'left' && !(await cur(B, cid)) && !!S.kv[bob]['a:packmeta:' + atomsId], 'Bob leaves: the map goes from his curricula, the steps he studied stay his subjects');
  await A.p.evaluate(cid => Noema.curriculumMap(cid), cid); await wait(500);
  await A.p.click('.cm-sharetool'); await wait(600);
  ok(/left/.test(await A.p.locator('.cm-members').innerText()) && /Carl/.test(await A.p.locator('.cm-members').innerText()), 'Anna’s list: Bob ↩ left, Carl ✅ joined');
  // phone
  const P = await signUp(browser, 'dora@example.com', 'Dora', { phone: true });
  await P.p.click('.cm-mode:has-text("Curricula")'); await wait(300); await P.p.click('.cm-explorebtn'); await wait(700);
  const w = await P.p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 392 && await P.p.locator('.cm-pubcard').count() === 1, 'phone: Explore curricula fits (' + w + ' px)');
  await P.p.screenshot({ path: SHOTS + '/cs6_phone.png' });
  await A.p.click('summary:has-text("Stop sharing")'); A.p.once('dialog', d => d.accept()); await A.p.click('.cm-stopshare');
  ok(await until(() => !S.curs[cid]) && !S.steps.some(r => r.curriculum === cid) && !Object.keys(S.curFiles).some(k => k.startsWith(cid + '/')), 'Anna stops sharing: the shared map, its steps and files are gone');
  await Cc.p.evaluate(cid => NoemaCurShare.refresh(Noema.account.id, cid), cid);
  const cc = await cur(Cc, cid);
  ok(cc && cc.shared?.ended && cc.nodes.energy.pack?.status === 'ready', 'Carl keeps his copy of the map and his steps (“no longer shared with you”)');
  ok((await cur(A, cid)).shared == null && (await cur(A, cid)).nodes.atoms.pack?.status === 'ready', 'Anna’s curriculum is hers as before');
  for (const [n, x] of [['Anna', A], ['Bob', B], ['Carl', Cc], ['Dora', P]]) ok(!x.E.length, `${n}: no page errors ${JSON.stringify(x.E.slice(0, 2))}`);
  await browser.close(); srv.close(); fs.unlinkSync(fn);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
