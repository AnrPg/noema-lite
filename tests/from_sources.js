/* 📚 From your sources (engine/sourceplan.js, docs/FROM_SOURCES.md) — one way from a pile of material to a Roadmap or to one
   subject. Without a browser: the estimate (small → one subject, big → a Roadmap, a long PDF split by its outline or its pages),
   the checks of an AI answer (files that are not the learner's, files left out, pages outside a file, cycles), the pasted
   answer of the Claude app, the Roadmap as an import (files on their steps with their pages), the subject's brief.
   In the browser against the Supabase emulator + scripted Claude: the wizard from 🧭 Roadmaps, the AI reads the outline and
   first lines (a wrong answer goes back with its problems), both shapes ready and flippable, a Roadmap made from it (only the
   chapter planner runs, each step gets its files and pages), one subject made with ✨ Create with Claude filled in (the
   confirmed chapter plan is Claude's brief; it lands on the Shelf), the Claude app by copy and paste, and the connector's
   noema_create_roadmap (the learner's Claude read the files in its chat; the app picks the Roadmap up on its next sync).
   Usage: node tests/from_sources.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), http = require('http'), vm = require('vm'), crypto = require('crypto'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const F = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54371, BASE = `http://localhost:${PORT}`, APORT = 54372, ABASE = `http://localhost:${APORT}`;
const KEY = 'sk-ant-api03-' + 'f'.repeat(40);
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));

/* ---------- 1. without a browser ---------- */
function unit() {
  console.log('— the plan, without a browser');
  const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['engine/curriculum.js', 'engine/curimport.js', 'engine/sourceplan.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const P = ctx.window.NoemaSourcePlan;
  const doc = (p, pages, outline = []) => ({ path: p, name: p.split('/').pop(), size: pages * 40000, kind: 'pdf', paged: true, pages, outline, excerpt: '', file: { name: p.split('/').pop(), hint: p, size: pages * 40000 } });
  // small: two short PDFs → one subject
  const small = [doc('notes/2 Transcription.pdf', 30), doc('notes/10 Translation.pdf', 20), doc('notes/1 Replication.pdf', 40)];
  small.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const e1 = P.estimate(small);
  ok(e1.recommend === 'course' && e1.course.chapters.length === 3 && e1.roadmap.steps.length === 3 && e1.title === 'notes', 'a little material → one subject (the folder names it): ' + e1.reasons.join(' | '));
  ok(e1.course.chapters.map(c => c.title).join(',') === 'Replication,Transcription,Translation', 'in the order of the files, numbers counted as numbers (1, 2, 10)');
  ok(e1.roadmap.steps[1].prerequisites.join() === 's1' && e1.reasons.some(r => /without AI/.test(r)), 'the Roadmap alternative is ready too (a chain), and the estimate says it is one');
  // big: a 900-page book with an outline → a Roadmap, one step per top-level entry with its pages
  const outline = [['Cells', 1], ['Genetics', 180], ['Evolution', 400], ['Ecology', 650]].map(([t, p]) => ({ title: t, depth: 0, page: p })).concat([{ title: 'Mitosis', depth: 1, page: 40 }]);
  const big = [doc('Campbell Biology.pdf', 900, outline)];
  const e2 = P.estimate(big);
  ok(e2.recommend === 'roadmap' && e2.roadmap.steps.length === 4 && e2.roadmap.steps[1].files[0] === 'Campbell Biology.pdf pp. 180–399', 'a big book → a Roadmap, one step per top-level entry with its pages: ' + e2.roadmap.steps.map(s => s.files[0]).join(' · '));
  ok(/Too much for one subject: about 36 chapters/.test(e2.reasons.join('|')), 'the reason says how big it is: ' + e2.reasons[1]);
  // one long PDF without an outline → parts by pages
  const e3 = P.estimate([doc('scan.pdf', 120)]);
  ok(e3.course.chapters.length === 5 && e3.course.chapters[0].files[0] === 'scan.pdf pp. 1–24' && e3.course.chapters.at(-1).files[0] === 'scan.pdf pp. 97–120', 'one long PDF without an outline → chapters by pages: ' + e3.course.chapters.map(c => c.files[0]).join(' · '));
  // the checks of an AI answer
  const good = { recommend: 'course', reasons: ['Small', 'One topic'], title: 'Molecular biology', course: { chapters: [{ title: 'Replication', files: ['notes/1 Replication.pdf'] }, { title: 'Expression', files: ['notes/2 Transcription.pdf pp. 1–30', 'notes/10 Translation.pdf'] }] },
    roadmap: { steps: [{ ref: 'rep', title: 'Replication', role: 'foundation', prerequisites: [], files: ['notes/1 Replication.pdf'] }, { ref: 'exp', title: 'Expression', role: 'aspect', prerequisites: ['rep'], files: ['notes/2 Transcription.pdf', 'notes/10 Translation.pdf pp. 1–20'] }] } };
  ok(!P.check(good, small).length, 'a sound answer passes');
  const bad = JSON.parse(JSON.stringify(good)); bad.course.chapters[0].files = ['other.pdf']; bad.roadmap.steps[0].prerequisites = ['exp']; bad.roadmap.steps[1].files = ['notes/2 Transcription.pdf pp. 20–45'];
  const errs = P.check(bad, small);
  ok(errs.some(e => /"other\.pdf" is not one of the learner's files/.test(e)) && errs.some(e => /course: these files are not used: notes\/1 Replication\.pdf/.test(e)) && errs.some(e => /pages 20–45 are outside notes\/2 Transcription\.pdf/.test(e)) && errs.some(e => /cycle/.test(e)) && errs.some(e => /roadmap: these files are not used: notes\/10 Translation\.pdf/.test(e)),
    'a wrong answer: every problem named (unknown file, unused files, pages outside, a cycle): ' + errs.length);
  // a pasted answer (the Claude app by hand)
  ok(P.fromAnswer('Sure! Here it is:\n```json\n' + JSON.stringify(good) + '\n```', small).plan?.via === 'app', 'a pasted answer, with prose and a code fence around it, is read');
  ok(/not the JSON answer/.test(P.fromAnswer('I cannot do that', small).errors?.[0] || ''), 'text without JSON: “not the JSON answer”');
  ok(P.fromAnswer(JSON.stringify(bad), small).errors?.length === errs.length, 'a pasted wrong answer gets the same problems back');
  // the Roadmap as an import, the subject as a brief
  const plan = P.fromAnswer(JSON.stringify(good), small).plan;
  const { parsed, assignments } = P.roadmapImport(plan, small);
  const byPath = Object.fromEntries(assignments.map(a => [a.file.hint, a.targets.map(t => t.id + (t.range ? '@' + t.range.join('-') : '')).join(',')]));
  ok(parsed.order.join() === 'replication,expression' && parsed.edges.length === 1 && parsed.nodes.replication.role === 'foundation', 'the Roadmap: its steps (named after their titles), links and roles');
  ok(byPath['notes/1 Replication.pdf'] === 'replication' && byPath['notes/10 Translation.pdf'] === 'expression@1-20' && byPath['notes/2 Transcription.pdf'] === 'expression', 'every file on its step, with its pages: ' + JSON.stringify(byPath));
  const brief = P.courseBrief(plan);
  ok(/confirmed this chapter plan for the subject “Molecular biology”/.test(brief) && /2\. Expression\n {3}From the material: notes\/2 Transcription\.pdf pp\. 1–30; notes\/10 Translation\.pdf/.test(brief), 'the subject: the chapter plan with each chapter’s pages is Claude’s brief');
  ok(/attach \(1 Replication\.pdf, 2 Transcription\.pdf, 10 Translation\.pdf\)/.test(P.courseMessage(plan, small)), 'the Claude app message names the files to attach');
  return { good };
}

/* ---------- 2. the scripted vendors ---------- */
const A = { agent: [], files: [], node: [], zips: {} };
let PLAN = null;
function vendors() {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE' };
  const J = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  const sse = (res, name, obj) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', ...cors });
    const s = JSON.stringify(obj); const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
    ev('message_start', { message: { usage: { input_tokens: 3000 } } }); ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'tu', name, input: {} } });
    for (let i = 0; i < s.length; i += 500) ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: s.slice(i, i + 500) } });
    ev('content_block_stop', { index: 0 }); ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 100 } }); ev('message_stop', {}); res.end();
  };
  return http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
      const buf = Buffer.concat(chunks); const p = new URL(req.url, ABASE).pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (req.headers['x-api-key'] !== KEY) return J(res, 401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (p === '/v1/models') return J(res, 200, { data: [{ id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }] });
      if (p === '/v1/skills' && req.method === 'GET') return J(res, 200, { data: [] });
      if (p === '/v1/skills' && req.method === 'POST') return J(res, 200, { id: 'skill_01noema' });
      if (/^\/v1\/skills\/skill_01noema/.test(p)) return J(res, 200, { id: 'skill_01noema' });
      if (p === '/v1/files' && req.method === 'POST') { const name = (buf.toString('latin1').match(/filename="([^"]+)"/) || [])[1]; A.files.push({ name: Buffer.from(name || '', 'latin1').toString('utf8') }); return J(res, 200, { id: 'file_src_' + A.files.length }); }
      if (/^\/v1\/files\/file_pkg_\d+$/.test(p)) { const z = A.zips[p.split('/').pop()]; return J(res, 200, { id: 'x', filename: z.name, size_bytes: z.buf.length }); }
      if (/^\/v1\/files\/file_pkg_\d+\/content$/.test(p)) { const z = A.zips[p.split('/')[3]]; res.writeHead(200, { 'content-type': 'application/octet-stream', ...cors }); return res.end(z.buf); }
      if (p === '/v1/messages') {
        const b = JSON.parse(buf.toString());
        if (b.stream && b.tool_choice) {
          const name = b.tool_choice.name || b.tools?.[0]?.name; const text = b.messages[0].content[0].text; const round = (b.messages.length - 1) / 2;
          A.agent.push({ name, text, round, repairText: round ? b.messages.at(-1).content[0].text : '', sys: b.system[0].text });
          if (name === 'submit_source_plan') { const d = JSON.parse(JSON.stringify(PLAN)); if (!round) d.course.chapters[0].files = ['lecture-99.pdf']; return sse(res, name, d); }   // the first answer names a file that is not there
          if (name === 'submit_chapter_plans') return sse(res, name, F.withMaterial(F.plans(text.match(/node IDs: ([^\n]+)\./)[1].split(', ')), text));
          return J(res, 400, { error: { message: 'unscripted agent ' + name } });
        }
        // ✨ Create with Claude (the skill in the sandbox): answer with a package
        const first = b.messages[0].content; const sid = first[0].text.match(/Subject id: (\S+)/)[1];
        A.node.push({ sid, first: first[0].text, uploads: first.filter(x => x.type === 'container_upload').length });
        const pack = JSON.parse(JSON.stringify(FX)); pack.subject = { ...pack.subject, id: sid, title: 'Molecular biology', owner: null }; pack.version = sid + '-v1'; pack.sources = { sources: [] };
        const JSZip = require(path.join(ROOT, 'engine/vendor/viewer/jszip.min.js')); const z = new JSZip(); z.file('pack.json', JSON.stringify(pack));
        const fid = 'file_pkg_' + A.node.length; A.zips[fid] = { name: sid + '.noema.zip', buf: await z.generateAsync({ type: 'nodebuffer' }) };
        return J(res, 200, { id: 'm', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 3000 }, container: { id: 'cont_' + sid },
          content: [{ type: 'server_tool_use', id: 's1', name: 'bash_code_execution', input: { command: `cp /tmp/out/${sid}.noema.zip "$OUTPUT_DIR/"` } }, { type: 'bash_code_execution_tool_result', tool_use_id: 's1', content: { type: 'bash_code_execution_result', stdout: 'ok', stderr: '', return_code: 0, content: [{ type: 'bash_code_execution_output', file_id: fid }] } }, { type: 'text', text: 'Done.' }] });
      }
      J(res, 404, { error: { message: 'no route ' + p } });
    });
  });
}

(async () => {
  const { good } = unit();
  // the learner's material: a PDF with an outline (bookmarks) and Markdown notes
  const TF = path.join(ROOT, 'dist/site/testfiles/sources'); fs.mkdirSync(TF, { recursive: true });
  execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1]); titles = ['Origins of replication', 'Helicase and the fork', 'Polymerases', 'Okazaki fragments']
for i, t in enumerate(titles):
    c.bookmarkPage('p%d' % i); c.addOutlineEntry(t, 'p%d' % i, level=0); c.setFont('Helvetica', 20); c.drawString(72, 720, t); c.setFont('Helvetica', 12); c.drawString(72, 690, 'Helicase unwinds the double helix.' if i == 1 else 'Page %d of the replication notes.' % (i + 1)); c.showPage()
c.save()`, path.join(TF, 'dna-replication.pdf')]);
  fs.writeFileSync(path.join(TF, 'Transcription notes.md'), '# Transcription\n\nRNA polymerase reads the template strand from 3′ to 5′.\n\n## Promoters\n\nThe TATA box sits about 25 bp upstream.\n');
  const FILES = [path.join(TF, 'dna-replication.pdf'), path.join(TF, 'Transcription notes.md')];
  PLAN = { recommend: 'course', reasons: ['Two short files on one topic: gene expression.', 'About 6 pages: one concise subject.'], title: 'Molecular biology', summary: 'From DNA to RNA.',
    course: { chapters: [{ title: 'Replication', files: ['dna-replication.pdf pp. 1–4'] }, { title: 'Transcription', files: ['Transcription notes.md'] }] },
    roadmap: { steps: [{ ref: 'replication', title: 'DNA replication', role: 'foundation', prerequisites: [], files: ['dna-replication.pdf pp. 1–2'] }, { ref: 'transcription', title: 'Transcription', role: 'aspect', prerequisites: ['replication'], files: ['dna-replication.pdf pp. 3–4', 'Transcription notes.md'] }] } };
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', anthropicBase: '${ABASE}', askSubjectOnStart: true, shell: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const api = vendors(); await new Promise(r => api.listen(APORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  try {
    await p.goto(BASE + '/'); await wait(800);
    await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
    await p.fill('input[placeholder="Display name"]', 'Iro'); await p.fill('input[type=email]', 'iro@example.com'); await p.fill('input[type=password]', 'secret123');
    await p.click('button:has-text("Create account")'); await wait(1300);
    await p.evaluate(k => NoemaClaude.Key.set(Noema.account.id, k, true), KEY);

    console.log('— the wizard: the AI reads the material and proposes');
    await p.click('.cm-mode:has-text("Roadmaps")'); await wait(300);
    await p.locator('.noema-ovbox').last().locator('.cm-srcbtn').click(); await wait(300);
    ok(await p.locator('.cm-src h1').innerText() === 'From your sources', 'From your sources opens from 🧭 Roadmaps');
    await p.setInputFiles('.cm-src .cg-drop input[type=file]', FILES); await wait(200);
    ok(await p.locator('.cm-srcfiles li').count() === 2 && /2 files ·/.test(await p.locator('.cm-src .cg-step >> nth=0').innerText()), 'the two files are listed with their size');
    ok(await p.inputValue('.cm-srcreader') === 'auto', 'with a key, the AI reads it by default');
    await p.click('.cm-srcread');
    ok(await until(() => p.locator('.cm-srcshape').count().then(n => n === 2), 20000), 'the proposal is there: two shapes');
    const ag = A.agent.filter(a => a.name === 'submit_source_plan');
    ok(ag.length === 2 && /Helicase and the fork \(p\. 2\)/.test(ag[0].text) && /dna-replication\.pdf\nPDF, 4 pages/.test(ag[0].text) && /RNA polymerase reads the template/.test(ag[0].text), 'the AI got each file’s pages, outline and first lines (not the files)');
    ok(/"lecture-99\.pdf" is not one of the learner's files/.test(ag[1].repairText) && /course: these files are not used: dna-replication\.pdf/.test(ag[1].repairText), 'its wrong first answer went back with the problems, and the second was taken');
    ok(await p.locator('.cm-srcshape.on').getAttribute('data-shape') === 'course' && await p.locator('.cm-srcshape[data-shape=course] .cg-badge').innerText() === 'Recommended', 'one subject is recommended and chosen');
    ok(/Two short files on one topic/.test(await p.locator('.cm-srcwhy').innerText()) && await p.inputValue('.cm-srctitle') === 'Molecular biology', 'its reasons are shown, and its name fills the name field');
    ok(/2 chapters/.test(await p.locator('.cm-srcshape[data-shape=course]').innerText()) && /2 steps/.test(await p.locator('.cm-srcshape[data-shape=roadmap]').innerText()), 'each card says its size');
    await p.screenshot({ path: SHOTS + '/src1_proposal.png', fullPage: true });
    await p.click('.cm-srcshape[data-shape=roadmap]'); await wait(200);
    ok(await p.locator('.cm-srcshape.on').getAttribute('data-shape') === 'roadmap' && await p.locator('.cm-srcplan li').count() === 2 && /dna-replication\.pdf pp\. 3–4 · Transcription notes\.md/.test(await p.locator('.cm-srcplan li >> nth=1').textContent()), 'flipped to the Roadmap: its steps with their files and pages');
    await p.fill('.cm-srctitle', 'Gene expression');

    console.log('— a Roadmap from it');
    await p.selectOption('.cm-src .cm-provider', 'auto'); await p.click('.cm-srcgo');
    ok(await until(() => p.locator('.cg-status.ready').count(), 30000), 'made: only the chapters are planned, then “ready”');
    ok(A.agent.filter(a => a.name !== 'submit_source_plan').every(a => a.name === 'submit_chapter_plans'), 'no DAG creator, auditor or expander ran');
    const c = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id)[0]);
    const rep = Object.values(c.nodes).find(n => n.title === 'DNA replication'), trn = Object.values(c.nodes).find(n => n.title === 'Transcription');
    ok(c.title === 'Gene expression' && Object.keys(c.nodes).length === 2 && c.edges.length === 1 && c.fromSources?.via === 'ai', 'the Roadmap: its name, 2 steps, 1 link, made from sources');
    ok(rep.material.files.map(f => f.name + '@' + f.range).join() === 'dna-replication.pdf@1,2' && trn.material.files.map(f => f.name + '@' + (f.range || '')).join() === 'dna-replication.pdf@3,4,Transcription notes.md@', 'every step has its files with their pages: ' + JSON.stringify([rep.material.files.map(f => f.range), trn.material.files.map(f => f.range)]));
    ok(Object.keys(c.files || {}).length === 2, 'each file is stored once for the Roadmap');
    ok(rep.chapters.length === 4 && rep.chapters[0].material === 'dna-replication.pdf pp. 1–2', 'the planner planned each step from its pages: ' + rep.chapters[0].material);
    
    console.log('— one subject from it, with ✨ Create with Claude filled in');
    await p.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); NoemaCurMap.fromSources(Noema.account.id); }); await wait(300);
    await p.setInputFiles('.cm-src .cg-drop input[type=file]', FILES); await p.selectOption('.cm-srcreader', 'estimate'); await p.click('.cm-srcread');
    ok(await until(() => p.locator('.cm-srcshape').count().then(n => n === 2), 10000) && /without AI/.test(await p.locator('.cm-srcwhy').innerText()) && await p.locator('.cm-srcshape.on').getAttribute('data-shape') === 'course', 'without AI: an estimate, one subject recommended: ' + (await p.locator('.cm-srcwhy').innerText()).replace(/\n/g, ' | '));
    await p.click('.cm-srcgo'); await wait(500);
    ok(await p.evaluate(() => [...document.querySelectorAll('.cg-box input.noema-input')].some(i => i.value === 'dna-replication')) && await p.locator('.cg-files li').count() === 2, 'Create with Claude opens with the name and both files');
    await p.click('.cg-box button.cg-go');
    ok(await until(() => p.locator('.cg-box button:has-text("Open my new subject")').count(), 40000), 'Claude made it: “Open my new subject”');
    await p.click('.cg-box button:has-text("Open my new subject")');
    const landed = await until(() => p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.some(s => s.title === 'Molecular biology'))), 15000);
    if (!landed) console.log('   jobs:', JSON.stringify(await p.evaluate(() => NoemaClaude.jobs(Noema.account.id).then(j => j.map(x => [x.status, x.error, (x.log || []).slice(-3).map(l => l.m)])))), '\n   shelf:', JSON.stringify(await p.evaluate(() => Noema.shelf(Noema.account.id).then(l => l.map(s => s.title)))), '\n   ui:', (await p.locator('.cg-box').last().innerText()).slice(0, 600));
    ok(landed, 'the subject is made and lands on the Shelf');
    const job = A.node[0] || {};
    ok(job.uploads === 2 && /The learner confirmed this chapter plan/.test(job.first) && /From the material: dna-replication\.pdf\n/.test(job.first), 'Claude got both files and the chapter plan with the pages as its brief');

    console.log('— the Claude app, by copy and paste');
    await wait(1500); await until(() => p.evaluate(() => !!window.NoemaCurMap && !!window.Noema?.account), 15000);
    await p.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); NoemaCurMap.fromSources(Noema.account.id); }); await wait(300);
    await p.setInputFiles('.cm-src .cg-drop input[type=file]', FILES); await p.selectOption('.cm-srcreader', 'app'); await p.click('.cm-srcread'); await wait(1500);
    ok(await p.locator('.cm-srccopytask').count() === 1 && await p.locator('.cm-srcshape').count() === 0, 'with the Claude app: copy the task, paste the answer');
    await p.fill('.cm-src .cm-paste', JSON.stringify({ ...good, title: 'x' })); await p.click('.cm-srcuse'); await wait(200);
    ok(/problem/.test(await p.locator('.cm-src span.cg-kstat.bad').innerText()), 'an answer about other files: its problems, to copy back to Claude');
    await p.fill('.cm-src .cm-paste', 'Here you go:\n' + JSON.stringify(PLAN)); await p.click('.cm-srcuse'); await wait(200);
    ok(await p.locator('.cm-srcshape').count() === 2 && await p.locator('.cm-srccopymsg').count() === 1, 'a good answer: the proposal, and the subject can be made in the Claude app (a message to paste)');
    await p.screenshot({ path: SHOTS + '/src2_app.png', fullPage: true });

    console.log('— the connector: the learner’s Claude makes the Roadmap (noema_create_roadmap)');
    const fn = path.join(require('os').tmpdir(), `noema-mcp-src-${process.pid}.mjs`);
    const MCP = ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js', 'engine/langcore.js', 'engine/curimport.js', 'engine/sourceplan.js'];   // = tools/build.py MCP_ENGINE
    ok(MCP.every(f => fs.readFileSync(path.join(ROOT, 'tools/build.py'), 'utf8').includes(`'${f}'`)), 'the connector bundles the From-your-sources code');
    fs.writeFileSync(fn, `const CFG = ${JSON.stringify({ siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] })};\nconst DOCS = ${JSON.stringify({ workflow: 'SKILL', content: 'C', visual: 'V' })};\nglobalThis.window = globalThis;\n` + MCP.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
    const { default: handler } = await import(fn);
    const T = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'iro@example.com', password: 'secret123' }) })).json()).access_token;
    let rpc = 0; const tool = async (name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })); const j = await r.json(); return { text: j.result.content.map(x => x.text || '').join('\n'), err: !!j.result.isError }; };
    const RM = { title: 'Cell biology', summary: 'From membranes to signalling.', files: [{ path: 'lectures/cells.pdf', pages: 80 }, { path: 'notes/signals.md' }],
      steps: [{ ref: 'm', title: 'Membranes', role: 'foundation', files: ['lectures/cells.pdf pp. 1–40'] }, { ref: 's', title: 'Cell signalling', role: 'aspect', prerequisites: ['m'], files: ['lectures/cells.pdf pp. 41–80', 'notes/signals.md'] }] };
    const bad = await tool('noema_create_roadmap', { plan_json: JSON.stringify({ ...RM, steps: [RM.steps[0], { ...RM.steps[1], files: ['lectures/cells.pdf pp. 41–95'] }] }), language: 'en' });
    ok(bad.err && /pages|not used: notes\/signals\.md/.test(bad.text), 'a Roadmap with pages outside a file and a file left out goes back with its problems: ' + bad.text.split('\n').slice(1, 3).join(' '));
    const made = await tool('noema_create_roadmap', { plan_json: JSON.stringify(RM), language: 'en', learner: 'a second-year biology student' });
    const cid2 = (made.text.match(/\((c[a-z0-9]+)\)/) || [])[1];
    ok(!made.err && cid2 && /2 steps, 1 links?/.test(made.text) && /noema_curriculum_task/.test(made.text), 'a good one is made: ' + made.text.split('\n')[0]);
    const task = await tool('noema_curriculum_task', { curriculum_id: cid2 });
    ok(/chapters of 2 steps/.test(task.text) && /in the Claude chat where this Roadmap was made/.test(task.text) && /“Cell signalling”: lectures\/cells\.pdf pp\. 41–80; notes\/signals\.md/.test(task.text), 'its first task plans the chapters, from the files of that chat, page by page');
    const ids = (task.text.match(/task plan:([^\s]+)/) || [])[1]?.split(',') || [];
    const sub = await tool('noema_curriculum_submit', { curriculum_id: cid2, task_id: 'plan:' + ids.join(','), result_json: JSON.stringify(F.plans(ids)) });
    ok(!sub.err && /Accepted/.test(sub.text), 'Claude’s chapter plans are accepted: ' + sub.text.split('\n').slice(-1)[0].slice(0, 120));
    const st = await tool('noema_curriculum_task', { curriculum_id: cid2 });
    const sid2 = (st.text.match(/subject_id: (cur-[a-z0-9-]+)/) || [])[1];
    ok(sid2 && /prepare ONE step/.test(st.text) && /“Membranes”: lectures\/cells\.pdf pp\. 1–40/.test(st.text) && !/research it yourself/.test(st.text) && /Why it matters \(membranes\)/.test(st.text), 'then the first step in study order (all were queued), from its pages in the chat, with its planned chapters');
    const pk = JSON.parse(JSON.stringify(FX)); pk.subject = { ...pk.subject, id: sid2, title: 'Membranes', owner: null }; pk.version = sid2 + '-v1';
    const upUrl = (await tool('noema_start_upload', { subject_id: sid2 })).text.match(/https?:\/\/\S+upload\/sign\S+/)[0];
    await fetch(upUrl, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(pk) });
    const fin = await tool('noema_finish_upload', { subject_id: sid2 });
    ok(!fin.err && /This is the step “Membranes”/.test(fin.text), 'the step’s subject is saved and registered on its step: ' + fin.text.split('\n')[0].slice(0, 100));
    const nx = await tool('noema_curriculum_task', { curriculum_id: cid2 });
    ok(/“Cell signalling”: lectures\/cells\.pdf pp\. 41–80; notes\/signals\.md/.test(nx.text) && /prepare ONE step/.test(nx.text), 'and the next task is the next step');
    await p.evaluate(() => NoemaCloud.pull(Noema.account.id));
    ok(await until(() => p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); return c && c.provider === 'claudeapp' && c.fromSources?.via === 'connector' && Object.keys(c.nodes).length === 2; }, cid2), 10000), 'the app has it after a sync: a Roadmap the Claude app works on, made from sources');
    ok(await until(async () => { await p.evaluate(() => NoemaCloud.pull(Noema.account.id)); return p.evaluate(id => { const c = NoemaCurriculum.get(Noema.account.id, id); return c && Object.values(c.nodes).some(n => n.title === 'Membranes' && n.pack?.status === 'ready' && n.chapters?.length === 4); }, cid2); }, 25000, 1000), 'in the app: both steps planned, “Membranes” ⚡ ready');
    ok(!E.length, 'no page errors ' + E.join(' | '));
  } catch (e) { ok(false, 'crashed: ' + e.stack); await p.screenshot({ path: SHOTS + '/src_fail.png', fullPage: true }).catch(() => { }); }
  await browser.close(); api.close(); srv.close?.();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ all passed'); process.exit(fails ? 1 : 0);
})();
