/* 🧭 Curricula end to end, against the Supabase emulator + scripted Claude and Gemini APIs:
   build (4 agents, repair of a broken graph) → map (three parts, locked/open) → background preparation of the
   next steps (Claude skill jobs) → study a step in the engine → mastery opens the next steps → placement test →
   phone layout → the Gemini path (in-browser pack generator, diagrams) → resume after a stop.
   Usage: node tests/curriculum.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const { start } = require('./mock_supabase');
const F = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54337, BASE = `http://localhost:${PORT}`, APORT = 54338, ABASE = `http://localhost:${APORT}`;
const KEY = 'sk-ant-api03-' + 'k'.repeat(40);
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));

/* ---------- scripted vendors ---------- */
const A = { agent: [], node: [], gem: [], files: {}, dagCalls: 0, gemDag: 0, slowPlan: 0 };
function vendors() {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE' };
  const J = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  const sse = (res, name, obj) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', ...cors });
    const s = JSON.stringify(obj); const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
    ev('message_start', { message: { usage: { input_tokens: 3000, cache_read_input_tokens: 1000 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'tu', name, input: {} } });
    for (let i = 0; i < s.length; i += 500) ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: s.slice(i, i + 500) } });
    ev('content_block_stop', { index: 0 }); ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: Math.ceil(s.length / 4) } }); ev('message_stop', {}); res.end();
  };
  const agentAnswer = (name, text, repairRound) => {
    if (name.includes('dag')) return F.dag({ broken: repairRound === 0 && !A.dagFixed });
    if (name.includes('audit')) return F.audit();
    if (name.includes('expansion')) return F.expand();
    if (name.includes('chapter_plans')) { const ids = text.match(/node IDs: ([^\n]+)\./)[1].split(', '); return F.plans(ids); }
    if (name.includes('test')) return F.test();
  };
  return http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
      const buf = Buffer.concat(chunks); const u = new URL(req.url, ABASE); const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      // ---- Gemini
      if (p.startsWith('/v1beta/models/')) {
        const b = JSON.parse(buf.toString()); const first = b.contents[0].parts[0].text; const repair = b.contents.length > 1;
        A.gem.push({ first: first.slice(0, 200), chapter: +(first.match(/Write chapter (\d+) of/) || [])[1] || 0, tools: b.tools, json: b.generationConfig.responseMimeType, n: b.contents.length });
        const reply = (text, extra = {}) => J(res, 200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...extra }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 900 } });
        if (b.tools?.[0]?.google_search) return reply('Research brief: priors, posteriors, MCMC… [1][2]', { groundingMetadata: { webSearchQueries: ['bayesian inference'], groundingChunks: [{ web: { uri: 'https://example.org/bayes', title: 'Bayes course (University)' } }, { web: { uri: 'https://example.org/stan', title: 'Stan docs' } }] } });
        if (/"dag_creator"/.test(first)) { A.gemDag++; if (A.slowPlan === 1) await wait(10); return reply(JSON.stringify(F.dag())); }
        if (/"prerequisite_auditor"/.test(first)) return reply(JSON.stringify(F.audit()));
        if (/"goal_expander"/.test(first)) return reply(JSON.stringify(F.expand()));
        if (/"chapter_planner"/.test(first)) { if (A.slowPlan) await wait(A.slowPlan); const ids = first.match(/node IDs: ([^\n]+)\./)[1].split(', '); return reply('```json\n' + JSON.stringify(F.plans(ids)) + '\n```'); }
        if (/Create the identity/.test(first)) return reply(JSON.stringify({ title: 'Probability basics', emoji: '🎲', description: 'Chance, made precise.', headline: 'Master **probability**', mantra: 'Probability measures belief.', searchExamples: 'event, axiom', math: true, code: false, tutor: { name: 'Bay', avatar: '🦉', domain: 'probability', examples: 'dice', interviewer: 'a statistician', simulation: 'a dice game', terminology: '"event"', examinerRole: 'examiner' } }));
        const m = first.match(/Write chapter (\d+) of (\d+) now: “([^”]+)”/);
        if (m) return reply(JSON.stringify(F.chapter(+m[1], m[3], { broken: +m[1] === 1 && !repair })));
        return J(res, 400, { error: { message: 'unscripted gemini call' } });
      }
      // ---- Claude
      if (req.headers['x-api-key'] !== KEY) return J(res, 401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (p === '/v1/models') return J(res, 200, { data: [{ id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }] });
      if (p === '/v1/skills' && req.method === 'GET') return J(res, 200, { data: [] });
      if (p === '/v1/skills' && req.method === 'POST') return J(res, 200, { id: 'skill_01noema' });
      if (/^\/v1\/skills\/skill_01noema/.test(p)) return J(res, 200, { id: 'skill_01noema' });
      if (/^\/v1\/files\/file_pack_\d+$/.test(p)) { const f = A.files[p.split('/').pop()]; return J(res, 200, { id: 'x', filename: f.name, size_bytes: 5000 }); }
      if (/^\/v1\/files\/file_pack_\d+\/content$/.test(p)) { const f = A.files[p.split('/')[3]]; res.writeHead(200, { 'content-type': 'application/octet-stream', ...cors }); return res.end(JSON.stringify(f.pack)); }
      if (p === '/v1/messages') {
        const b = JSON.parse(buf.toString());
        if (b.stream && b.tool_choice) { const name = b.tool_choice.name; const text = b.messages[0].content[0].text; const round = (b.messages.length - 1) / 2; A.agent.push({ name, round, model: b.model, text, repairText: round ? b.messages.at(-1).content[0].text : '' }); return sse(res, name, agentAnswer(name, text, round)); }
        // a curriculum node built by the skill (engine/claude.js job)
        const first = b.messages[0].content[0].text; const sid = first.match(/Subject id: (\S+)/)[1];
        A.node.push({ sid, system: b.system[0].text, tools: b.tools.map(t => t.type || t.name), first });
        const pack = JSON.parse(JSON.stringify(FX)); pack.subject = { ...pack.subject, id: sid, title: (first.match(/Title: (.+)/) || [])[1] || sid, owner: null }; pack.version = sid + '-v1';
        const fid = 'file_pack_' + A.node.length; A.files[fid] = { name: sid + '.json', pack };
        return J(res, 200, { id: 'm', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 3000 }, container: { id: 'cont_' + sid },
          content: [{ type: 'server_tool_use', id: 's1', name: 'bash_code_execution', input: { command: 'python3 scripts/make_pack.py work/x /tmp/out && cp /tmp/out/x.json "$OUTPUT_DIR/"' } }, { type: 'bash_code_execution_tool_result', tool_use_id: 's1', content: { type: 'bash_code_execution_result', stdout: '', stderr: '', return_code: 0, content: [{ file_id: fid }] } }, { type: 'text', text: 'Done.' }] });
      }
      J(res, 404, { error: { message: 'no route ' + p } });
    });
  });
}

async function signUp(browser, email, name, viewport = { width: 1300, height: 900 }) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1300);
  return { p, E, ctx };
}
const cur = p => p.evaluate(() => NoemaCurriculum.list(Noema.account?.id || Object.keys(localStorage).find(k => k.includes(':a:curriculum:')).split(':')[1])[0]);

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', anthropicBase: '${ABASE}', geminiBase: '${ABASE}/v1beta', askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const api = vendors(); await new Promise(r => api.listen(APORT, r));
  const browser = await chromium.launch();

  console.log('— build a curriculum with Claude (4 agents)');
  const U = await signUp(browser, 'eva@example.com', 'Eva'); const p = U.p;
  ok(await p.locator('.cm-mode').count() === 1 && await p.locator('details.pick-shelf').count() === 1, 'the subject picker leads with 🧭 Curricula; the other subjects wait on the 📚 Shelf');
  await p.click('.cm-mode:has-text("Curricula")'); await wait(300);
  ok(/No curriculum yet/.test(await p.locator('.noema-ovbox').last().innerText()), 'the library starts empty');
  await p.locator('.noema-ovbox').last().locator('button:has-text("New curriculum")').click(); await wait(300);
  await p.click('.cg-go'); await wait(150);
  ok(/goal topic/.test(await p.locator('.cg-kstat.bad').last().innerText()), 'Build without a goal → a friendly pointer');
  ok(await p.locator('.cm-provider').inputValue() === 'claudeapp' && await p.locator('.cm-appinfo').isVisible(), 'a cloud account: the Claude app (your Claude plan) is preselected and explained');
  await p.selectOption('.cm-provider', 'auto');
  await p.fill('input[placeholder^="sk-ant-… (Claude"]', KEY); await p.click('button:has-text("Use this key")');
  ok(await until(async () => /✅ Claude/.test(await p.locator('.cm-keys').first().innerText()), 5000), 'the Claude key is checked and kept on this device');
  await p.fill('textarea[placeholder^="e.g. “Bayesian"]', 'Bayesian inference');
  await p.selectOption('label:has-text("Depth") select', 'standard'); await p.selectOption('label:has-text("Prepare ahead") select', '2');
  await p.screenshot({ path: SHOTS + '/k1_new.png', fullPage: true });
  await p.click('.cg-go');
  ok(await until(() => p.locator('.cg-status.ready').count(), 30000), 'the four agents finish: “Your curriculum is ready”');
  await p.screenshot({ path: SHOTS + '/k2_built.png' });
  const names = A.agent.map(a => a.name);
  ok(names[0] === 'submit_curriculum_dag' && names[1] === 'submit_curriculum_dag' && names.includes('submit_prerequisite_audit') && names.includes('submit_goal_expansion') && names.filter(n => n === 'submit_chapter_plans').length === 5, 'agents: DAG creator (twice: repair), prerequisite auditor, goal expander, 5 chapter-planner batches');
  ok(/does not lead to the goal/.test(A.agent[1].repairText), 'the broken graph is sent back with the exact problem to fix');
  let c = await cur(p);
  ok(c && Object.keys(c.nodes).length === 25 && c.nodes.sets_and_events && c.nodes.goal_synthesis && c.nodes.bayesian_inference.role === 'intro', 'graph: 8 prerequisites (1 added by the auditor) → introduction, 4 aspects, 7 sub-topics, 1 related, synthesis → 3 applications');
  ok(Object.values(c.nodes).every(n => n.chapters.length === 4 && n.learningGoals.length >= 2), 'every node has learning goals and a chapter plan (teaching goals + coverage)');
  ok(c.edges.filter(e => e.from === 'goal_synthesis').length === 3 && !c.edges.some(e => e.from === 'bayesian_inference' && c.nodes[e.to].role === 'application'), 'applications now hang off the synthesis node');
  const eva = Object.values(srv.state.users).find(u => u.email === 'eva@example.com').id;
  await wait(3500);
  ok(!!srv.state.kv[eva]?.['a:curriculum:' + c.id], 'the curriculum is synced to the cloud account (every device)');
  ok(!JSON.stringify(srv.state.kv[eva] || {}).includes('sk-ant'), 'the API key is not synced');
  { // ✨ re-plan the whole curriculum with its own AI (here: Claude, API key) — batches of up to 5, prepared steps keep their chapters
    const before = A.agent.filter(a => a.name === 'submit_chapter_plans').length;
    await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); c.nodes.prob_basics.pack = { status: 'ready', id: 'x' }; c.nodes.prob_basics.chapters[0].title = 'KEEP ME'; c.nodes.conditional_probability.reviewed = '2026-01-01'; NoemaCurriculum.save(Noema.account.id, c); }, c.id);
    const rr = await p.evaluate(id => NoemaCurriculum.Edit.replanAll(Noema.account.id, id, { instruction: 'exam focus' }), c.id);
    const calls = A.agent.filter(a => a.name === 'submit_chapter_plans').slice(before);
    const c2 = await p.evaluate(id => NoemaCurriculum.get(Noema.account.id, id), c.id);
    ok(rr.ok && rr.count === 24 && calls.length === 5 && calls.every(a => /exam focus/.test(a.text)) && !calls.some(a => /prob_basics/.test(a.text.match(/node IDs: ([^\n]+)/)[1])), `✨ re-plan the whole curriculum (API): ${rr.count} steps in ${calls.length} requests, with the wish; the prepared step is left out`);
    ok(c2.nodes.prob_basics.chapters[0].title === 'KEEP ME' && !c2.nodes.conditional_probability.reviewed, 'a prepared step keeps its chapters; re-planned steps are reviewed again');
    await p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); delete c.nodes.prob_basics.pack; NoemaCurriculum.save(Noema.account.id, c); }, c.id);
  }

  console.log('— the map');
  await p.click('button:has-text("Open the map")'); await wait(800);
  ok(await p.locator('.cm-node').count() === 25 && await p.locator('.cm-band').count() === 3, 'map: 25 nodes in three parts (Prerequisites · goal · Applications)');
  const roots = ['sets_and_events', 'calculus_basics', 'philosophy_of_induction'];
  ok(await p.evaluate(r => r.every(id => document.querySelector(`.cm-node[data-id="${id}"]`).classList.contains('cm-open')), roots) && await p.locator('.cm-node.cm-locked').count() === 22, 'the 3 starting prerequisites are open, the other 22 steps locked 🔒');
  await p.click('.cm-node[data-id="likelihood"]'); await wait(300);
  const lockTxt = await p.locator('.cm-panel').innerText();
  ok(/Locked/.test(lockTxt) && /Probability distributions/.test(lockTxt) && await p.locator('.cm-panel .cm-chapters li').count() === 4 && !(await p.locator('.cm-panel button:has-text("Study")').count()), 'a locked step shows its info and chapters, what to master first — and no Study button');
  await p.click('.cm-panel .cm-chapters li >> nth=0'); ok(/🎯/.test(await p.locator('.cm-chd').innerText()), 'tap a chapter → its teaching goals and coverage');
  await p.screenshot({ path: SHOTS + '/k3_map.png' });

  console.log('— “I already know this” (placement test) opens the next step');
  ok(await p.evaluate(() => document.querySelector('.cm-node[data-id="prob_basics"]').classList.contains('cm-locked')), '“Probability basics” is locked (its prerequisite “Sets and events” is not mastered)');
  await p.click('.cm-node[data-id="sets_and_events"]'); await wait(300);
  await p.click('.cm-panel button:has-text("I already know this")');
  ok(await until(() => p.locator('.cm-test .cm-opts').count(), 10000), 'a 10-question placement test opens');
  for (let i = 0; i < 10; i++) { await p.click('.cm-opts button >> nth=0'); await p.click('.cm-test button.primary'); await wait(60); }
  ok(/mastered/.test(await p.locator('.cm-test').innerText()), '10/10 → mastered');
  await p.click('.cm-test button:has-text("OK")'); await wait(500);
  ok(await p.evaluate(() => document.querySelector('.cm-node[data-id="sets_and_events"]').classList.contains('cm-mastered') && document.querySelector('.cm-node[data-id="prob_basics"]').classList.contains('cm-open')), 'it is mastered and “Probability basics” is now open');
  await p.screenshot({ path: SHOTS + '/k6_progress.png' });
  await p.click('.cm-node[data-id="sets_and_events"]'); await wait(200); await p.click('.cm-panel button:has-text("Undo")'); await wait(400);
  ok(await p.evaluate(() => document.querySelector('.cm-node[data-id="prob_basics"]').classList.contains('cm-locked')), '↩ Undo locks the dependent step again');

  console.log('— review before preparing (the learner can change the step first)');
  await wait(2500);
  ok(A.node.length === 0 && await p.locator('.cm-node.cm-open .cm-badges:has-text("📝")').count() === 3, 'nothing is generated before you review it (open steps show 📝)');
  await p.click('.cm-node[data-id="sets_and_events"]'); await wait(300);
  await p.click('.cm-panel button:has-text("Review & prepare")'); await wait(400);
  ok(/before it is prepared/.test(await p.locator('.noema-ovbox').last().innerText()) && await p.locator('.cm-chedit .cm-chrow').count() === 4, 'the review shows the step with its 4 planned chapters, editable');
  await p.fill('.cm-chedit .cm-chrow >> nth=0 >> input', 'My own first chapter');
  await p.click('.cm-chedit .cm-chrow >> nth=1 >> button[aria-label="Remove chapter"]');
  await p.click('button:has-text("Add a chapter")'); await p.fill('.cm-chedit .cm-chrow >> nth=3 >> input', 'Extra: Venn diagrams');
  await p.click('.cm-chedit .cm-chrow >> nth=3 >> button[aria-label="Move chapter up"]');
  await p.screenshot({ path: SHOTS + '/k3b_review.png', fullPage: true });
  await p.click('button:has-text("Looks good — prepare it")');
  ok(await until(async () => (await cur(p))?.nodes.sets_and_events.pack?.status === 'ready', 30000), 'confirmed → the step is prepared');
  c = await cur(p);
  ok(c.nodes.sets_and_events.chapters.map(ch => ch.title).join(' | ') === 'My own first chapter | Worked examples (sets_and_events) | Extra: Venn diagrams | Pitfalls and transfer (sets_and_events)', 'your edited chapter plan is saved: ' + c.nodes.sets_and_events.chapters.map(ch => ch.title).join(' | '));
  ok(/My own first chapter/.test(A.node[0].first) && /Extra: Venn diagrams/.test(A.node[0].first) && !/Core definitions \(sets_and_events\)/.test(A.node[0].first), 'and Claude builds exactly that plan');

  console.log('— automatic preparation when you turn the review off');
  await p.click('.cm-tools button[title="Settings of this curriculum"]'); await wait(300);
  await p.uncheck('label:has-text("review each step") input'); await p.click('.noema-ovbox button:has-text("Save")');
  ok(await until(async () => Object.values((await cur(p)).nodes).filter(n => n.pack?.status === 'ready').length === 2, 40000), 'the next open step is prepared in the background (prefetch 2)');
  c = await cur(p);
  const ready = Object.values(c.nodes).filter(n => n.pack?.status === 'ready');
  ok(A.node.length === 2 && A.node.every(j => /ONE NODE of a learning curriculum/.test(j.system) && j.tools.includes('web_fetch_20250910') && j.tools.includes('web_search_20250305')), 'each step is built by the skill with web search + web fetch (official sources)');
  ok(/Planned chapters/.test(A.node[0].first) && /already mastered/.test(A.node[0].first), 'the brief carries the chapter plan and what the learner already knows');
  ok(ready.every(n => Object.keys(srv.state.files).includes(`${eva}/packs/${n.pack.id}.json`)), 'prepared steps are stored as subjects in the cloud account');
  await p.click(`.cm-node[data-id="${ready[0].id}"]`); await wait(300);
  ok(await p.locator('.cm-panel button:has-text("Study this step")').count() === 1, 'an open, prepared step has 📖 Study');
  await p.screenshot({ path: SHOTS + '/k4_ready.png' });

  console.log('— study a step, master it');
  const target = ready[0];
  await p.click(`.cm-node[data-id="${target.id}"]`); await p.click('.cm-panel button:has-text("Study this step")'); await wait(2500);
  ok(await p.evaluate(t => typeof SUBJ !== 'undefined' && SUBJ.id === t, target.pack.id), 'the step opens as a full subject in the engine (theory, exercises, tutor…)');
  ok(await p.locator('.nodebanner').count() === 1 && await p.locator('.curchip:has-text("Map")').count() === 1, 'the subject shows its place in the curriculum, its mastery and a 🧭 Map button');
  await p.screenshot({ path: SHOTS + '/k5_node_subject.png' });
  await p.evaluate(() => { COURSE.forEach(ch => { ch.sections.forEach(s => S.read[s.id] = true); ch.exercises.forEach(e => S.res[e.id] = { n: 1, ok: 1 }); }); flushSave(); });
  await p.click('.nodebanner button:has-text("Map")'); await wait(800);
  ok(await p.evaluate(t => document.querySelector(`.cm-node[data-id="${t}"]`).classList.contains('cm-mastered'), target.id), 'all sections read + exercises solved → the step is ✅ mastered (automatically)');

  console.log('— editing the map');
  await p.click('.cm-node[data-id="sets_and_events"]'); await wait(300);
  await p.click('.cm-panel button:has-text("Edit step")'); await wait(300);
  ok(await p.locator('.cm-chedit input[disabled]').count() === 4 && /fixed/.test(await p.locator('.noema-ovbox').last().innerText()), 'a prepared step: its chapters are fixed…');
  await p.fill('.noema-ovbox input[placeholder="Name of the step"]', 'Sets, events and Venn diagrams'); await p.click('.noema-ovbox button:has-text("Save")'); await wait(400);
  c = await cur(p);
  ok(c.nodes.sets_and_events.title === 'Sets, events and Venn diagrams' && /Sets, events and Venn/.test(await p.evaluate(id => localStorage.getItem(`noema1:${Noema.account.id}:a:subjoverride:${id}`), c.nodes.sets_and_events.pack.id)), '…but it can still be renamed (its subject too)');
  await p.click('.cm-node[data-id="prob_basics"]'); await wait(200); await p.click('.cm-panel button:has-text("Edit step")'); await wait(300);
  const opts = await p.$$eval('select[aria-label="Add prerequisite"] option', o => o.map(x => x.value));
  ok(!opts.includes('distributions') && !opts.includes('likelihood') && opts.includes('calculus_basics'), 'only steps that keep the graph acyclic can be added as prerequisites');
  await p.selectOption('select[aria-label="Add prerequisite"]', 'calculus_basics'); await p.click('.noema-ovbox button:has-text("Save")'); await wait(300);
  ok((await cur(p)).edges.some(e => e.from === 'calculus_basics' && e.to === 'prob_basics'), 'links can be added (prerequisites / dependents)');
  await p.click('.cm-tools button:has-text("Step")'); await wait(300);
  await p.fill('.noema-ovbox input[placeholder="Name of the step"]', 'Measure theory (light)'); await p.selectOption('select[aria-label="Add dependent step"]', 'distributions');
  await p.click('.noema-ovbox button:has-text("Add the step")');
  ok(await until(async () => { const cc = await cur(p); const n = Object.values(cc.nodes).find(x => x.title === 'Measure theory (light)'); return n && n.chapters.length === 4 && cc.edges.some(e => e.from === n.id && e.to === 'distributions'); }, 15000), '➕ a new step is added where you put it, and the AI plans its chapters');
  await p.click('.cm-node[data-id="random_variables"]'); await wait(200); await p.click('.cm-panel button:has-text("Edit step")'); await wait(300);
  p.once('dialog', d => d.accept()); await p.click('.noema-ovbox button:has-text("Remove the step")'); await wait(500);
  c = await cur(p);
  ok(!c.nodes.random_variables && c.edges.some(e => e.from === 'prob_basics' && e.to === 'distributions') && await p.locator('.cm-node[data-id="random_variables"]').count() === 0, '🗑 a removed step is bridged: its prerequisites now lead to the steps after it');
  await p.screenshot({ path: SHOTS + '/k6b_edited.png' });

  console.log('— phone');
  const phc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await U.ctx.storageState() }); const ph = await phc.newPage(); const PE = []; ph.on('pageerror', e => PE.push(e.message));
  await ph.goto(BASE + '/'); await wait(2500); if (await ph.isVisible('.noema-inuse')) { await ph.click('.noema-inuse .btn'); await wait(1000); }   // the first window is still in use: continue here
  await ph.evaluate(id => { Noema.curriculumMap(id); }, c.id); await wait(800);
  await ph.tap('.cm-node[data-id="calculus_basics"]'); await wait(400);
  const pb = await ph.locator('.cm-panel').boundingBox();
  ok(pb && pb.y > 200 && pb.width > 380 && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: the map scrolls inside its frame and the step opens as a bottom sheet');
  await ph.screenshot({ path: SHOTS + '/k7_phone.png' });
  await phc.close();

  console.log('— the Gemini path (free key, pack generated in the browser)');
  const V = await signUp(browser, 'finn@example.com', 'Finn'); const q = V.p;
  await q.evaluate(() => { const k = `noema1:${Noema.account.id}:a:settings`; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.apiKey = 'AIza-test-key'; localStorage.setItem(k, JSON.stringify(s)); });
  await q.click('.cm-mode:has-text("Curricula")'); await q.locator('.noema-ovbox').last().locator('button:has-text("New curriculum")').click(); await wait(300);
  await q.selectOption('.cm-provider', 'auto');
  ok(/✅ Gemini/.test(await q.locator('.cm-keys').first().innerText()) && /➖ Claude/.test(await q.locator('.cm-keys').first().innerText()), 'without a Claude key the Gemini key is used');
  await q.fill('textarea[placeholder^="e.g. “Bayesian"]', 'Bayesian inference'); await q.selectOption('label:has-text("Depth") select', 'standard'); await q.selectOption('label:has-text("Prepare ahead") select', '1');
  A.slowPlan = 1200;
  await q.click('.cg-go');
  ok(await until(async () => /Agent 3/.test(await q.locator('.cg-log').innerText()), 15000), 'Gemini agents run (graph, audit, expansion, now chapter plans)');
  await q.click('button:has-text("Stop")'); await wait(1500);
  const dagBefore = A.gemDag; A.slowPlan = 0;
  ok(/Paused|stopped|Continue/.test(await q.locator('.noema-ovbox').last().innerText()), 'Stop pauses the build');
  await q.click('button:has-text("Continue")');
  ok(await until(() => q.locator('.cg-status.ready').count(), 30000) && A.gemDag === dagBefore, 'Continue finishes it without redoing the finished agents');
  ok(A.gem.some(g => g.json === 'application/json'), 'Gemini answers in JSON mode (validated + repaired by the app)');
  await q.click('button:has-text("Open the map")'); await wait(500);
  await q.click('.cm-node[data-id="philosophy_of_induction"]'); await q.click('.cm-panel button:has-text("Review & prepare")'); await wait(300); await q.click('button:has-text("Looks good — prepare it")');
  ok(await until(async () => Object.values((await cur(q)).nodes).some(n => n.pack?.status === 'ready'), 40000), 'the first open step is generated in the browser (research → subject → chapters)');
  ok(A.gem.some(g => g.tools?.[0]?.google_search), 'research uses Google Search grounding');
  ok(A.gem.filter(g => g.chapter === 1 && g.n > 1).length >= 1, 'an incomplete chapter is sent back for repair');
  const gc = await cur(q); const gn = Object.values(gc.nodes).find(n => n.pack?.status === 'ready');
  await q.click(`.cm-node[data-id="${gn.id}"]`); await q.click('.cm-panel button:has-text("Study this step")'); await wait(2500);
  ok(await q.evaluate(() => typeof SUBJ !== 'undefined' && COURSE.length === 4 && ALL_EX.length >= 60), 'the generated subject opens: 4 chapters (one per planned chapter), all exercise types');
  ok(await q.evaluate(() => Object.values(MEDIA).some(m => /^data:image\/svg\+xml/.test(m.data) && m.regions.length === 3)), 'diagrams are drawn with clickable regions (picture exercises work)');
  ok(await q.evaluate(() => (Array.isArray(SOURCES) ? SOURCES : SOURCES.sources || []).some(s => /example\.org/.test(s.url || ''))), 'the sources found by Google Search are listed');
  await q.screenshot({ path: SHOTS + '/k8_gemini_subject.png' });

  for (const [n, x] of [['Eva', U.E], ['Finn', V.E], ['phone', PE]]) ok(!x.length, `${n}: no page errors ${JSON.stringify(x.slice(0, 2))}`);
  await browser.close(); srv.close(); api.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
