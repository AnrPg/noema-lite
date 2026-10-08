/* 📦 Subjects on curriculum steps · 📚 the Shelf (docs/CURRICULUM.md §9), against the Supabase emulator + a scripted Claude:
     A. the subject picker leads with 🧭 Curricula; the subjects on no step wait on the 📚 Shelf (open while there is no map)
     B. 📦 attach a subject you have to a step: the warning, only that step is re-planned (from the subject's outline), it is
        closed meanwhile (🔄), dependents keep their plans (⚑ flagged), the subject leaves the Shelf, progress is shared,
        studying the step opens the subject; take it off again; a step's own prepared subject goes to the Shelf
     C. sync: an older copy never drops an attachment (mergePlans); language courses cannot be attached
     D. creating a map: hold the planning until the learner has attached their subjects (Claude app and API key)
     E. the connector: a pack saved with curriculum_id + step lands on that step (inbox → app), else on the Shelf;
        the plan task of that step describes the subject; noema_list_subjects says where each subject is
     F. 🧭 Put on a map… from the Shelf; ⚙️ → Subjects; phone layout
   Usage: node tests/shelf.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { start } = require('./mock_supabase');
const F = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54371, BASE = `http://localhost:${PORT}`, APORT = 54372, ABASE = `http://localhost:${APORT}`;
const KEY = 'sk-ant-api03-' + 'k'.repeat(40);
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));

/* ---------- a scripted Claude: the chapter planner ---------- */
const A = { plans: [], slow: 0 };
function claude() {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE' };
  const J = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  const sse = (res, name, obj) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', ...cors });
    const s = JSON.stringify(obj); const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
    ev('message_start', { message: { usage: { input_tokens: 3000 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'tu', name, input: {} } });
    ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: s } });
    ev('content_block_stop', { index: 0 }); ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 900 } }); ev('message_stop', {}); res.end();
  };
  return http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
      const p = new URL(req.url, ABASE).pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (req.headers['x-api-key'] !== KEY) return J(res, 401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (p === '/v1/models') return J(res, 200, { data: [{ id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }] });
      if (p === '/v1/messages') {
        const b = JSON.parse(Buffer.concat(chunks).toString()); const name = b.tool_choice?.name || ''; const text = b.messages[0].content[0].text;
        if (name.includes('chapter_plans')) { const ids = text.match(/node IDs: ([^\n]+)\./)[1].split(', '); A.plans.push({ ids, text }); if (A.slow) await wait(A.slow); return sse(res, name, F.plans(ids)); }
      }
      J(res, 404, { error: { message: 'no route ' + p } });
    });
  });
}

/* a small map of steps, every step planned (as if built or imported) */
const makeMap = (p, { provider = 'auto', planned = true, attachFirst = false } = {}) => p.evaluate(({ provider, planned, attachFirst }) => {
  const C = NoemaCurriculum, acc = Noema.account.id; const c = C.blank({ goal: 'Mechanics', language: 'en', provider, prefetch: 0 });
  const mk = (id, title, role, summary) => ({ id, title, summary, role, part: C.PART[role], learningGoals: planned ? ['Explain ' + id, 'Use ' + id] : [], plannedAt: planned ? '2026-01-01T00:00:00.000Z' : undefined,
    chapters: planned ? [1, 2, 3, 4].map(i => ({ ref: 'c' + i, title: `${title} ${i}`, goals: ['goal ' + i], coverage: ['topic ' + i] })) : [] });
  c.nodes = { kinematics: mk('kinematics', 'Physics of motion', 'foundation', 'Kinematics: velocity, acceleration'), forces: mk('forces', 'Forces', 'foundation', 'Newton’s laws'), energy: mk('energy', 'Energy', 'intro', 'Work and energy') };
  c.edges = [{ from: 'kinematics', to: 'energy', why: 'x' }, { from: 'forces', to: 'energy', why: 'y' }];
  c.goalId = 'energy'; c.paths = { minimal: [], deep: C.order(c) }; c.title = 'Mechanics'; c.autoApprove = true;
  c.stage = planned ? 'done' : 'plan'; c.status = 'ready'; if (attachFirst) c.attachFirst = true;
  C.save(acc, c); return c.id;
}, { provider, planned, attachFirst });
const node = (p, cid, nid) => p.evaluate(({ cid, nid }) => NoemaCurriculum.get(Noema.account.id, cid).nodes[nid], { cid, nid });

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', anthropicBase: '${ABASE}', askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const api = claude(); await new Promise(r => api.listen(APORT, r));
  // the connector exactly as tools/build.py bundles it (MCP_ENGINE), pointed at the emulator
  const fn = path.join(os.tmpdir(), `noema-mcp-shelf-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify({ siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] })};\nconst DOCS = ${JSON.stringify({ workflow: 'S', content: 'C', visual: 'V' })};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
  const { default: handler } = await import(fn);
  let T = null, rpc = 0;
  const tool = async (name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })); const j = await r.json(); return { text: j.result?.content?.[0]?.text || j.error?.message || '', error: !!j.result?.isError || !!j.error }; };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Sam'); await p.fill('input[type=email]', 'sam@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1300);
  const uid = Object.values(srv.state.users).find(u => u.email === 'sam@example.com').id;
  T = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sam@example.com', password: 'secret123' }) })).json()).access_token;
  const box = () => p.locator('.noema-ovbox').last();

  console.log('— A. the picker: 🧭 Curricula first, 📚 the Shelf for the rest');
  ok(await p.locator('.cm-mode').count() === 1 && /Curricula/.test(await p.locator('.cm-mode').innerText()), 'one way in: 🧭 Curricula (no 📚 Subjects tab)');
  ok(await p.locator('details.pick-shelf[open]').count() === 1, 'no curriculum yet: the 📚 Shelf is open');
  ok(/Shelf — 2 subject/.test(await p.locator('.pick-shelf > summary').innerText()) && await p.locator('.pick-shelf .noema-chip:has-text("Demo Physics")').isVisible(), 'the Shelf holds the library subjects (2), studyable as before');
  ok(await p.locator('.pick-nocur button:has-text("New curriculum")').isVisible(), 'no map yet: ➕ New curriculum right there');
  ok(await p.locator('.pick-shelf .noema-mapbtn').count() === 2, 'every Shelf subject has 🧭 Put on a map…');
  await p.screenshot({ path: SHOTS + '/sh1_picker.png' });
  await p.evaluate(k => NoemaClaude.Key.set(Noema.account.id, k, true), KEY);
  const cid = await makeMap(p);
  await p.goto(BASE + '/'); await wait(1500);
  ok(await p.locator('details.pick-shelf').count() === 1 && await p.locator('details.pick-shelf[open]').count() === 0, 'with a map: the Shelf is folded away');
  ok(await p.locator('.pick-cur:has-text("Mechanics")').isVisible(), 'the curriculum is right in the picker');
  await p.click('.pick-shelf > summary'); await wait(200);
  await p.goto(BASE + '/'); await wait(1500);
  ok(await p.locator('details.pick-shelf[open]').count() === 1, 'the Shelf stays open once the learner opened it (per device)');
  await p.click('.pick-shelf > summary'); await wait(200);

  console.log('— B. 📦 a subject you have, on a step');
  await p.click('.pick-cur:has-text("Mechanics")'); await wait(900);
  await p.click('.cm-node[data-id="kinematics"]'); await wait(300);
  await p.click('.cm-usesubject'); await wait(500);
  ok(await box().locator('.cm-attachchip').count() === 2 && /on the Shelf/.test(await box().locator('.cm-attachchip:has-text("Demo Physics")').innerText()), 'the dialog lists my subjects and where each is (📚 on the Shelf)');
  ok(await p.locator('.cm-attachgo').isDisabled(), 'nothing chosen yet → Attach is disabled');
  await box().locator('.cm-attachchip:has-text("Demo Physics")').click(); await wait(150);
  const warn = await box().locator('.cm-attachwarn').innerText();
  ok(/Only this step is re-planned/.test(warn) && /stays closed until its new plan/.test(warn) && /The 1 step after it keeps its plan/.test(warn) && /does not change/.test(warn), 'the warning: only this step is re-planned, closed until then, the step after it keeps its plan, the subject is unchanged');
  await p.screenshot({ path: SHOTS + '/sh2_attach.png' });
  A.slow = 2500; const before = A.plans.length;
  await p.click('.cm-attachgo');
  ok(await until(async () => /🔄/.test(await p.locator('.cm-node[data-id="kinematics"] .cm-badges').innerText()), 5000), 'the step shows 🔄 while it is re-planned');
  await p.click('.cm-node[data-id="kinematics"]'); await wait(300);
  const panel = await p.locator('.cm-panel').innerText();
  ok(/Re-planning it to match its subject|Being re-planned/.test(panel) && !(await p.locator('.cm-panel button:has-text("Study this step")').count()), 'and it is closed: no 📖 Study while its new plan is coming');
  ok(await until(async () => !(await node(p, cid, 'kinematics')).replan, 15000), 'the new plan arrives');
  const call = A.plans.slice(before);
  ok(call.length === 1 && call[0].ids.join() === 'kinematics', 'only that step went to the chapter planner');
  ok(/Steps taught by a subject pack the learner chose/.test(call[0].text) && call[0].text.includes(FX.chapters[0].title) && /Not in the pack: /.test(call[0].text), 'the planner gets the subject’s outline (its chapters) and the rules (follow its chapters; gaps → “Not in the pack: …”)');
  let k = await node(p, cid, 'kinematics');
  ok(k.pack.assigned && k.pack.id === 'demo-physics' && k.pack.status === 'ready' && k.pack.sections.length > 0 && k.chapters[0].title === 'Why it matters (kinematics)', 'the step is taught by the subject (same id — its progress stays) and has its new plan');
  const en = await node(p, cid, 'energy');
  ok(en.plannedAt === '2026-01-01T00:00:00.000Z' && en.chapters[0].title === 'Energy 1', 'the step after it was NOT re-planned');
  await wait(600);
  ok(/📦/.test(await p.locator('.cm-node[data-id="kinematics"] .cm-badges').innerText()), 'the map shows 📦 on it');
  await p.click('.cm-node[data-id="kinematics"]'); await wait(300);
  ok(/Taught by your subject “Demo Physics”/.test(await p.locator('.cm-panel').innerText()) && await p.locator('.cm-panel button:has-text("Study this step")').isVisible(), 'its panel: 📦 taught by your subject · 📖 Study this step');
  await p.click('.cm-node[data-id="energy"]'); await wait(300);
  ok(/now taught by your own subject — check that this step still fits/.test(await p.locator('.cm-flag').innerText()), 'the step after it is flagged (⚑ check that it still fits)');
  await p.screenshot({ path: SHOTS + '/sh3_map.png' });
  ok(!(await p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.map(s => s.id)))).includes('demo-physics'), 'it is no longer on the Shelf');
  await p.evaluate(({ cid }) => { const acc = Noema.account.id, n = NoemaCurriculum.get(acc, cid).nodes.kinematics; const res = {}; for (let i = 0; i < n.pack.exercises; i++) res['e' + i] = { ok: 1 }; localStorage.setItem(`noema1:${acc}:s:demo-physics:state`, JSON.stringify({ read: Object.fromEntries(n.pack.sections.map(x => [x, 1])), res })); }, { cid });
  ok(await p.evaluate(cid => { const C = NoemaCurriculum; return C.nodeStatus(Noema.account.id, C.get(Noema.account.id, cid), 'kinematics').mastered; }, cid), 'progress in the subject is the step’s progress (all read + 80 % solved → mastered)');
  await p.click('.cm-node[data-id="kinematics"]'); await wait(300);
  await p.click('.cm-panel button:has-text("Review")'); await wait(2500);
  ok(await p.evaluate(() => Noema.subject?.id === 'demo-physics' && Noema.node?.node === 'kinematics'), 'studying the step opens the subject, which knows its step (🧭 back to the map)');
  ok(await p.locator('.curchip').count() > 0, 'the subject has the 🧭 Map button');

  console.log('— B2. take it off; a step’s own subject goes to the Shelf');
  const det = await p.evaluate(cid => NoemaCurriculum.Edit.detach(Noema.account.id, cid, 'kinematics'), cid);
  k = await node(p, cid, 'kinematics');
  ok(det.ok && !k.pack && k.replan && (await p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.map(s => s.id)))).includes('demo-physics'), '↩ taken off: the step is planned again the usual way; the subject is back on the Shelf');
  const own = await p.evaluate(cid => { const acc = Noema.account.id, C = NoemaCurriculum, c = C.get(acc, cid);
    Noema.kv.set(`noema1:${acc}:a:packmeta:cur-own-forces`, JSON.stringify({ id: 'cur-own-forces', title: 'Forces (prepared)', curriculum: cid, node: 'forces', counts: {} }));
    c.nodes.forces.pack = { id: 'cur-own-forces', status: 'ready' }; C.save(acc, c);
    return C.Edit.assign(acc, cid, 'forces', 'databricks'); }, cid);
  const fo = await node(p, cid, 'forces');
  ok(own.ok && own.replan && fo.pack.id === 'databricks' && fo.pack.assigned && fo.replan && fo.pack.outline.length > 5, 'a library subject replaces the step’s own prepared subject; the step waits for its new plan');
  ok((await p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.map(s => s.id)))).includes('cur-own-forces'), 'the subject that was prepared for the step is on the Shelf now (nothing deleted)');
  ok(await p.evaluate(cid => !NoemaCurriculum.Edit.update(Noema.account.id, cid, 'forces', { learningGoals: ['mine'] }).error, cid), 'its plan can still be changed (the subject is never rebuilt, so the plan is not locked)');

  console.log('— C. sync and limits');
  ok(await p.evaluate(cid => { const C = NoemaCurriculum, c = C.get(Noema.account.id, cid), old = JSON.parse(JSON.stringify(c)); old.nodes.forces.pack = { id: 'cur-own-forces', status: 'ready' }; delete old.nodes.forces.assignedAt; C.mergePlans(c, old); return c.nodes.forces.pack.id === 'databricks' && c.nodes.forces.pack.assigned; }, cid), 'an older copy (another device) never drops the attachment');
  ok(await p.evaluate(cid => { const C = NoemaCurriculum, c = C.get(Noema.account.id, cid), stale = JSON.parse(JSON.stringify(c)); stale.nodes.forces.pack = null; delete stale.nodes.forces.assignedAt; delete stale.nodes.forces.replan; return C.mergePlans(stale, c) && stale.nodes.forces.pack?.id === 'databricks' && stale.nodes.forces.replan; }, cid), 'and a device that has not seen it yet gets it (with its re-plan)');
  ok(/Language courses/.test((await p.evaluate(cid => NoemaCurriculum.Edit.assign(Noema.account.id, cid, 'energy', 'lang:greek-russian'), cid)).error || ''), 'a language course cannot be attached to a step');
  ok(await p.evaluate(cid => { const C = NoemaCurriculum, c = C.get(Noema.account.id, cid); return C.Edit.cannotAssign({ ...c, shared: { role: 'member' } }, c.nodes.energy); }, cid) === null, 'a step of a shared curriculum may take your own subject too (yours only — tests/curriculum_share.js)');
  const fresh = await p.evaluate(cid => { const C = NoemaCurriculum, acc = Noema.account.id, pk = { version: 'databricks-new', chapters: [{ title: 'One', sections: [{ id: 's1' }], exercises: [{}, {}] }] };
    const k = C.Edit.refreshAssigned(acc, 'databricks', pk), again = C.Edit.refreshAssigned(acc, 'databricks', pk), c = C.get(acc, cid); return { k, again, f: c.nodes.forces, e: c.nodes.energy }; }, cid);
  ok(fresh.k === 1 && fresh.again === 0 && fresh.f.pack.version === 'databricks-new' && fresh.f.pack.sections.join() === 's1' && fresh.f.pack.exercises === 2 && fresh.f.replan && fresh.e.chapters[0].title === 'Energy 1', 'a new version of the subject (an update, an import): the step it teaches follows it and is re-planned — only that step');

  console.log('— D. creating a map: attach first, then plan');
  const app = await makeMap(p, { provider: 'claudeapp', planned: false, attachFirst: true });
  let w = await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); return { hold: NoemaCurriculum.holding(c), work: NoemaCurJobs.work(c) }; }, app);
  ok(w.hold && !w.work.toPlan.length, 'Claude app: while the learner attaches their subjects, no step is handed out to plan');
  await p.evaluate(() => NoemaCurMap.map(Noema.account.id, NoemaCurriculum.list(Noema.account.id).find(c => c.provider === 'claudeapp').id)); await wait(900);
  ok(await p.locator('.cm-holdbar button:has-text("Attach subjects")').isVisible() && await p.locator('.cm-holdbar button:has-text("Plan the steps now")').isVisible(), 'the map says so: 📦 Attach subjects · ▶ Plan the steps now');
  await p.click('.cm-holdbar .cm-attachsubs'); await wait(600);
  await box().locator('button:has-text("Suggest matches")').click(); await wait(200);
  ok(await box().locator('select[aria-label="Subject for Physics of motion"]').inputValue() === 'demo-physics', '✨ Suggest matches pairs “Demo Physics” with “Physics of motion” (no AI)');
  await p.screenshot({ path: SHOTS + '/sh4_many.png' });
  await box().locator('.cm-attachmanygo').click(); await wait(800);
  const ak = await node(p, app, 'kinematics');
  ok(ak.pack?.assigned && ak.pack.id === 'demo-physics' && !ak.chapters.length, 'attached before planning (nothing to re-plan yet)');
  await p.click('.cm-holdbar .cm-plannow'); await wait(900);
  w = await p.evaluate(id => NoemaCurJobs.work(NoemaCurriculum.get(Noema.account.id, id)), app);
  ok(w.toPlan.length === 3 && await p.evaluate(id => /Steps taught by a subject pack/.test(NoemaCurJobs.next(NoemaCurriculum.get(Noema.account.id, id)).system + NoemaCurJobs.next(NoemaCurriculum.get(Noema.account.id, id)).prompt), app), '▶ Plan the steps now: all 3 steps are handed out, the attached one with its subject’s outline');
  const api2 = await makeMap(p, { planned: false, attachFirst: true });
  const built = await p.evaluate(id => NoemaCurriculum.build(Noema.account.id, NoemaCurriculum.get(Noema.account.id, id)), api2);
  ok(built.status === 'attach' && built.stage === 'plan' && !A.plans.some(x => x.ids.includes('forces') && x.text.includes(api2)), 'API key: the build stops before planning (📦 attach) and plans nothing yet');
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));

  console.log('— E. the connector');
  await p.evaluate(() => NoemaCloud.push(Noema.account.id)); await wait(500);
  const mine = JSON.parse(JSON.stringify(FX)); mine.subject = { ...mine.subject, id: 'my-energy', title: 'My energy notes', owner: null }; mine.version = 'v1';
  let r = await tool('noema_save_pack', { pack_json: JSON.stringify(mine), curriculum_id: app, step: 'Energy' });
  ok(!r.error && /Attached to the step “Energy”/.test(r.text) && /only that step is re-planned/.test(r.text), 'noema_save_pack with curriculum_id + step: “attached to the step Energy — only that step is re-planned”');
  const row = Object.entries(srv.state.kv[uid] || {}).find(([key]) => key.startsWith('a:curin:' + app));
  ok(row && /"kind":"assign"/.test(row[1].value) && /"outline"/.test(row[1].value), 'it reaches the app through the inbox, with the subject’s outline');
  const n0 = await p.evaluate(() => NoemaCurJobs.App.poll(Noema.account.id));
  const ae = await node(p, app, 'energy');
  ok(n0 >= 1 && ae.pack?.id === 'my-energy' && ae.pack.assigned?.from === 'claude', 'the app applies it: the step is taught by the new subject');
  const t2 = await tool('noema_curriculum_task', { curriculum_id: app, want: 'plan', step: 'energy' });
  ok(/Steps taught by a subject pack/.test(t2.text) && /My energy notes/.test(t2.text), 'its plan task (for Claude) describes the subject');
  mine.subject.id = 'loose-notes'; mine.subject.title = 'Loose notes';
  r = await tool('noema_save_pack', { pack_json: JSON.stringify(mine) });
  ok(!r.error && /Shelf/.test(r.text), 'saved without a step: Claude is told it is on the learner’s 📚 Shelf (and how to attach it)');
  r = await tool('noema_list_subjects');
  ok(/my-energy .*teaches “Energy”/.test(r.text) && /loose-notes .*📚 on the Shelf/.test(r.text), 'noema_list_subjects says which step each subject teaches, or that it is on the Shelf');

  console.log('— F. 🧭 Put on a map… · ⚙️ Subjects · phone');
  await p.evaluate(p0 => Noema.importPack(Noema.account.id, p0), (() => { const x = JSON.parse(JSON.stringify(FX)); x.subject = { ...x.subject, id: 'kin-notes', title: 'Kinematics notes', owner: null }; return x; })());
  await p.evaluate(() => Noema.openShelf(Noema.account.id)); await wait(700);
  ok(await box().locator('.noema-chip:has-text("Kinematics notes")').isVisible(), '📚 the Shelf on its own lists the imported subject');
  await box().locator('.noema-chipwrap:has-text("Kinematics notes") .noema-mapbtn').click({ force: true }); await wait(600);
  await box().locator('select[aria-label="Curriculum"]').selectOption(cid); await wait(200);
  ok(await box().locator('select[aria-label="Step"]').inputValue() === 'kinematics', 'Put on a map…: choose the curriculum; the matching step is suggested');
  await box().locator('.cm-attachgo').click();
  ok(await until(async () => { const n = await node(p, cid, 'kinematics'); return n.pack?.id === 'kin-notes' && !n.replan; }, 15000), 'attached and re-planned');
  ok(!(await p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.map(s => s.id)))).includes('kin-notes'), 'and it left the Shelf');
  await p.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
  await p.evaluate(() => window.openAccountMenu ? openAccountMenu('subjects') : null).catch(() => { });
  const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 844 }); await ph.goto(BASE + '/'); await wait(1500);
  await ph.evaluate(() => Noema.switchTo ? null : null);
  await ph.evaluate(cid => NoemaCurMap.attachDialog(Noema.account.id, { cid, nid: 'energy' }), cid).catch(() => { }); await wait(700);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: the attach dialog fits');
  await ph.screenshot({ path: SHOTS + '/sh5_phone.png' });
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); api.close(); fs.rmSync(fn, { force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
