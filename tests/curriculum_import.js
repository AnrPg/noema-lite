/* 📥 Importing a curriculum map (engine/curimport.js) — the parser (tree art, outline, Mermaid, JSON, Greek), the AI
   reading (with its no-new-topics guard), and end to end in the browser against the Supabase emulator + scripted Claude
   and Gemini: paste a tree → steps + files matched → only the chapter planner runs (with the files' outline) → a step
   with a PDF is built by Claude FROM the file (uploaded into the sandbox, no web_fetch, packaged back) → a step with
   notes is built by Gemini from their text (no Google Search) → 📎 material added / removed in the step editor.
   Usage: node tests/curriculum_import.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), http = require('http'), vm = require('vm'), crypto = require('crypto'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const F = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54351, BASE = `http://localhost:${PORT}`, APORT = 54352, ABASE = `http://localhost:${APORT}`;
const KEY = 'sk-ant-api03-' + 'i'.repeat(40);
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
const TREE = `MOLECULAR INFORMATION BIOLOGY
│
├── PREREQUISITES
│
├── DNA REPLICATION
│
├── TRANSCRIPTION
│
├── RNA MATURATION / RNA LIFE CYCLE
│
├── TRANSLATION
│
├── CO-TRANSLATIONAL PROCESSES
│
├── QUALITY CONTROL
│
├── CROSS-PROCESS COUPLING
│
├── CELL-TYPE SPECIALIZATION
│
├── DISEASE + MEDICINE
│
└── EXPERIMENTAL / SYSTEMS BIOLOGY`;

/* ---------- 1. the parser, without a browser ---------- */
function unit() {
  console.log('— reading maps (no AI)');
  const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['engine/curriculum.js', 'engine/curimport.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const I = ctx.window.NoemaCurImport; const T = (g, id) => g.nodes[id].title; const pre = (g, id) => g.edges.filter(e => e.to === id).map(e => T(g, e.from));
  const g = I.parse(TREE);
  ok(g.format === 'outline' && g.title === 'Molecular information biology' && g.order.length === 11, 'tree art: the root is the title, 11 steps: ' + g.order.map(id => T(g, id)).join(' · '));
  ok(T(g, g.order[0]) === 'Prerequisites' && g.nodes[g.order[0]].role === 'foundation' && pre(g, g.order[1])[0] === 'Prerequisites' && pre(g, g.order[10])[0] === 'Disease + medicine' && g.edges.length === 10, 'in the order written: each step after the previous one; “Prerequisites” is a prerequisite step');
  ok(T(g, g.order[3]) === 'RNA maturation / RNA life cycle' && T(g, g.order[5]) === 'Co-translational processes', 'ALL CAPS become normal capitals (DNA / RNA stay)');
  ok(I.parse(TREE, { keepCaps: true }).nodes[g.order[1]].title === 'DNA REPLICATION', '…unless “keep capitals” is ticked');
  const nest = I.parse('Cell biology\n├── Basics\n│   ├── Chemistry of life\n│   └── Water\n├── The cell\n│   ├── Membranes\n│   └── Organelles\n└── Applications\n    └── Medicine', { mode: 'parallel' });
  const byT = t => Object.keys(nest.nodes).find(id => nest.nodes[id].title === t);
  ok(pre(nest, byT('Membranes')).join() === 'The cell' && pre(nest, byT('The cell')).sort().join() === 'Chemistry of life,Water' && pre(nest, byT('Applications')).sort().join() === 'Membranes,Organelles' && nest.nodes[byT('Water')].role === 'foundation' && nest.nodes[byT('Medicine')].role === 'application', 'nesting + “independent”: a topic before its sub-topics, prerequisites → topics → applications');
  const mm = I.parse('flowchart LR\n  subgraph P [Prerequisites]\n    A[Algebra] --> B[Calculus]\n  end\n  B --> C(Probability) & D{{Linear algebra}}\n  C -- builds on --> E[Bayesian inference]\n  D --> E\n  E ==> F[Applications in medicine]');
  const mT = t => Object.keys(mm.nodes).find(id => mm.nodes[id].title === t);
  ok(mm.format === 'mermaid' && mm.order.length === 6 && pre(mm, mT('Bayesian inference')).sort().join() === 'Linear algebra,Probability' && mm.nodes[mT('Algebra')].role === 'foundation' && mm.nodes[mT('Applications in medicine')].role === 'application', 'Mermaid: shapes, “&”, labelled links, subgraph “Prerequisites”, ==>');
  ok(pre(I.parse('graph TD\nA[Calculus] --> B[Algebra]', { reverse: true }), 'algebra')[0] === undefined && I.parse('graph TD\nA[Calculus] --> B[Algebra]', { reverse: true }).edges[0].from === 'algebra', '⇄ reverses arrows drawn the other way');
  const js = I.parse(JSON.stringify({ title: 'Genetics', nodes: [{ id: 'm', title: 'Mendel' }, { id: 'd', title: 'DNA', requires: ['m'], chapters: ['Structure', 'Packing'], files: ['dna.pdf'] }, { id: 'e', title: 'Expression', prerequisites: ['Mendel', 'd'] }] }));
  ok(js.format === 'json' && js.order.length === 3 && js.nodes.dna.chapters.length === 2 && js.nodes.dna.fileRefs[0].path === 'dna.pdf' && pre(js, 'expression').join() === 'DNA', 'JSON: ids or titles as prerequisites, chapters and files kept, implied links dropped');
  const gr = I.parse('# Θερμοδυναμική\n- Βασικές έννοιες\n  - Θερμοκρασία\n  - Θερμότητα\n- Πρώτος νόμος (μετά από: Θερμότητα)\n- Δεύτερος νόμος — εντροπία και αντιστρεπτότητα\n- Εφαρμογές 📎 μηχανές.pdf');
  const gT = t => Object.keys(gr.nodes).find(id => gr.nodes[id].title === t);
  ok(gr.title === 'Θερμοδυναμική' && gr.order.length === 6 && gr.nodes[gT('Βασικές έννοιες')].role === 'foundation' && gr.nodes[gT('Δεύτερος νόμος')].summary === 'εντροπία και αντιστρεπτότητα' && gr.nodes[gT('Εφαρμογές')].fileRefs[0].path === 'μηχανές.pdf' && gr.nodes[gT('Εφαρμογές')].role === 'application', 'Greek outline: heading = title, “(μετά από: …)”, “— summary”, “📎 file”');
  const ex = I.parse(JSON.stringify({ format: 'noema.curriculum/v1', id: 'cabc', title: 'Exported', language: 'el', nodes: { a: { id: 'a', title: 'Alpha', role: 'foundation', chapters: [{ ref: 'c1', title: 'One', goals: ['g'], coverage: ['x'] }], learningGoals: ['L1', 'L2'] }, b: { id: 'b', title: 'Beta', role: 'goal', chapters: [], learningGoals: [] } }, edges: [{ from: 'a', to: 'b' }] }));
  ok(ex.title === 'Exported' && ex.language === 'el' && ex.nodes.alpha.chapters[0].title === 'One' && ex.nodes.alpha.role === 'foundation' && ex.nodes.beta.role === 'intro' && ex.edges.length === 1, 'a curriculum exported from noema-lite comes back with its chapters, roles and language');
  let cyc = ''; try { I.parse('graph TD\nA-->B\nB-->A'); } catch (e) { cyc = e.message; }
  ok(/loop/.test(cyc), 'a loop is reported in plain words: ' + cyc.slice(0, 80));
  const m = I.matchFiles(g, [{ name: 'dna-replication.pdf' }, { name: 'Transcription notes.md' }, { name: 'random.pdf' }]);
  ok(T(g, m[0].targets[0].id) === 'DNA replication' && T(g, m[1].targets[0].id) === 'Transcription' && !m[2].targets.length, 'files are matched to steps by name (unknown ones stay unused)');

  console.log('— branches, joins and named files in every format');
  const ar = I.parse('Algebra → Calculus → Probability\nCalculus → Linear algebra\nProbability, Linear algebra → Bayesian inference\nBayesian inference → Medicine, Spam filters\n📎 Files\nBayesian inference: bayes/\nSpam filters: ml.pdf pp. 10-20');
  const aT = t => Object.keys(ar.nodes).find(id => ar.nodes[id].title === t);
  ok(ar.format === 'arrows' && ar.stats.branches === 2 && ar.stats.joins === 1 && pre(ar, aT('Bayesian inference')).sort().join() === 'Linear algebra,Probability' && pre(ar, aT('Spam filters')).join() === 'Bayesian inference', 'arrows: chains, a join (A, B → C) and branches (A → B, C) — ' + JSON.stringify(ar.stats));
  ok(ar.nodes[aT('Spam filters')].fileRefs[0].path === 'ml.pdf' && String(ar.nodes[aT('Spam filters')].fileRefs[0].range) === '10,20' && ar.nodes[aT('Bayesian inference')].fileRefs[0].path === 'bayes/', 'a 📎 Files section names files, folders and page ranges per step');
  const tr2 = I.parse('Molecular biology\n├── Prerequisites\n├── DNA (any order)\n│   ├── Structure 📎 dna/structure.pdf\n│   └── Replication\n├── Transcription (after: 2.1)\n└── Applications');
  const tT = t => Object.keys(tr2.nodes).find(id => tr2.nodes[id].title === t);
  ok(pre(tr2, tT('Structure')).join() === 'DNA' && pre(tr2, tT('Replication')).join() === 'DNA' && pre(tr2, tT('Transcription')).sort().join() === 'Replication,Structure' && tr2.stats.branches >= 1 && tr2.stats.joins >= 1, 'tree: “(any order)” makes a level a branch; the next step waits for all of it (a join); “after: 2.1” links by number');
  const mm2 = I.parse('flowchart TD\nA[Algebra] --> B[Calculus 📎 calc.pdf p. 3-9]\nA --> C[Logic]\nB & C --> D[Proofs]\n%% 📎 Files\n%% D: proofs/');
  ok(mm2.stats.branches === 1 && mm2.stats.joins === 1 && String(mm2.nodes.calculus.fileRefs[0].range) === '3,9' && mm2.nodes.proofs.fileRefs[0].path === 'proofs/', 'Mermaid: a diamond (branch + join), 📎 in a label and a %% files section');
  let loop = ''; try { I.parse('A → B\nB → C\nC → A'); } catch (e) { loop = e.message; } ok(/A → B → C|loop/.test(loop) && /Branches and joins are fine/.test(loop), 'only a real circle of “needs” is refused, and it says so');
  ok(I.refMatches(I.parseRef('dna/*.pdf'), 'material/dna/a.pdf') && !I.refMatches(I.parseRef('dna/*.pdf'), 'material/dna/a.md') && I.refMatches(I.parseRef('lab/'), 'x/lab/sub/b.pdf') && I.refMatches(I.parseRef('notes/dna'), 'm/notes/dna.md') && I.refMatches(I.parseRef('**/κεφ-3.pdf'), 'a/b/Κεφ 3.pdf') && !I.refMatches(I.parseRef('book.pdf'), 'other.pdf'), 'paths: globs, folders, names without extension, Greek / accents / case');
  // automatic matching: folders (any depth, numbered), duplicate titles told apart by their parent folder, numbers, one book for two steps
  const bio = I.parse('Biology\n1. Cells\n   1.1 Introduction\n   1.2 Membranes\n2. Genetics\n   2.1 Introduction\n   2.2 Genes\n📎 Files\n1.2: book.pdf pp. 10-20\n2.2: book.pdf pp. 21-40');
  const fz = ['course/01 Cells/Introduction/cells-intro.pdf', 'course/02 Genetics/Introduction/gen-intro.pdf', 'course/02 Genetics/2.2 Genes/genes.md', 'course/1.2/slides.pptx', 'course/book.pdf', 'course/misc/random.txt'].map(x => ({ name: x.split('/').pop(), hint: x }));
  const bm = I.matchFiles(bio, fz); const bT = id => bio.nodes[id].title + '@' + (bio.nodes[bio.nodes[id].parent]?.title || '');
  const got = bm.map(x => x.targets.map(t => bT(t.id) + (t.range ? '[' + t.range + ']' : '')).join('+') || '—');
  ok(got[0] === 'Introduction@Cells' && got[1] === 'Introduction@Genetics', 'two steps called “Introduction”: the parent folder decides — ' + got.slice(0, 2).join(' | '));
  ok(got[2] === 'Genes@Genetics' && got[3] === 'Membranes@Cells' && bm[3].targets[0].how === 'folder', 'numbered folders (“2.2 Genes”, “1.2”) — ' + got.slice(2, 4).join(' | '));
  ok(got[4] === 'Membranes@Cells[10,20]+Genes@Genetics[21,40]' && bm[4].confidence === 'high', 'one textbook named for two steps, with pages each — ' + got[4]);
  ok(got[5] === '—' && bm[5].confidence === 'none', 'a file nothing points to stays unused (the learner chooses)');
  const one = I.matchFiles(bio, [{ name: 'g.md', hint: 'Genes/g.md' }]);
  ok(bio.nodes[one[0].targets[0].id].title === 'Genes', 'a single file dropped with its step folder still matches (the folder is not mistaken for a shared root)');
}

/* ---------- scripted vendors ---------- */
const A = { agent: [], node: [], gem: [], files: [], pdf: null, zips: {} };
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
  // like some newer Claude models: a FORCED tool call is refused (the app must fall back to tool_choice auto)
  const sseText = (res, obj) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', ...cors }); const s = 'Here is the result:\n```json\n' + JSON.stringify(obj) + '\n```'; const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
    ev('message_start', { message: { usage: { input_tokens: 3000 } } }); ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } }); ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'Let me map it.' } }); ev('content_block_stop', { index: 0 });
    ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } }); for (let i = 0; i < s.length; i += 300) ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: s.slice(i, i + 300) } });
    ev('content_block_stop', { index: 1 }); ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 100 } }); ev('message_stop', {}); res.end();
  };
  const plans = ids => { const p = F.plans(ids); for (const x of p.plans) if (/dna_replication/.test(x.nodeId)) x.chapters.forEach((ch, i) => { ch.material = `dna-replication.pdf pp. ${i + 1}–${i + 2}`; }); return p; };
  return http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
      const buf = Buffer.concat(chunks); const u = new URL(req.url, ABASE); const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (p.startsWith('/v1beta/models/')) {   // ---- Gemini
        const b = JSON.parse(buf.toString()); const first = b.contents[0].parts[0].text; const repair = b.contents.length > 1;
        A.gem.push({ first, tools: b.tools });
        const reply = text => J(res, 200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 900 } });
        if (b.tools?.[0]?.google_search) return reply('Research brief [1]');
        if (/Create the identity/.test(first)) return reply(JSON.stringify({ title: 'Transcription', emoji: '🧬', description: 'From DNA to RNA.', headline: 'Master **transcription**', mantra: 'Polymerase reads, RNA follows.', searchExamples: 'promoter, polymerase', math: false, code: false, tutor: { name: 'Pol', avatar: '🦉', domain: 'transcription', examples: 'lac operon', interviewer: 'a biologist', simulation: 'a mutant promoter', terminology: '"promoter"', examinerRole: 'examiner' } }));
        const m = first.match(/Write chapter (\d+) of (\d+) now: “([^”]+)”/);
        if (m) return reply(JSON.stringify(F.chapter(+m[1], m[3], { broken: false })));
        return J(res, 400, { error: { message: 'unscripted gemini call' } });
      }
      if (req.headers['x-api-key'] !== KEY) return J(res, 401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (p === '/v1/models') return J(res, 200, { data: [{ id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }] });
      if (p === '/v1/skills' && req.method === 'GET') return J(res, 200, { data: [] });
      if (p === '/v1/skills' && req.method === 'POST') return J(res, 200, { id: 'skill_01noema' });
      if (/^\/v1\/skills\/skill_01noema/.test(p)) return J(res, 200, { id: 'skill_01noema' });
      if (p === '/v1/files' && req.method === 'POST') { const name = (buf.toString('latin1').match(/filename="([^"]+)"/) || [])[1]; A.files.push({ name: Buffer.from(name || '', 'latin1').toString('utf8'), size: buf.length }); return J(res, 200, { id: 'file_src_' + A.files.length }); }
      if (/^\/v1\/files\/file_pkg_\d+$/.test(p)) { const z = A.zips[p.split('/').pop()]; return J(res, 200, { id: 'x', filename: z.name, size_bytes: z.buf.length }); }
      if (/^\/v1\/files\/file_pkg_\d+\/content$/.test(p)) { const z = A.zips[p.split('/')[3]]; res.writeHead(200, { 'content-type': 'application/octet-stream', ...cors }); return res.end(z.buf); }
      if (p === '/v1/messages') {
        const b = JSON.parse(buf.toString());
        if (b.stream && b.tool_choice?.type === 'tool') { A.forced = (A.forced || 0) + 1; return J(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }); }
        if (b.stream && b.tool_choice) {
          const name = b.tool_choice.name || b.tools?.[0]?.name; const text = b.messages[0].content[0].text; const round = (b.messages.length - 1) / 2;
          A.agent.push({ name, text, round, repairText: round ? b.messages.at(-1).content[0].text : '', choice: b.tool_choice.type, sys: b.system[0].text });
          if (name === 'submit_chapter_plans') return sse(res, name, plans(text.match(/node IDs: ([^\n]+)\./)[1].split(', ')));
          if (name === 'submit_imported_map') return sseText(res, { title: 'Genetics', nodes: [{ ref: 'mendel', title: 'Mendelian inheritance', role: 'foundation', prerequisites: [] }, { ref: 'dna', title: 'DNA structure', role: 'aspect', prerequisites: ['mendel'] }, { ref: 'expr', title: 'Gene expression', role: 'aspect', prerequisites: ['dna'] }, ...(round ? [] : [{ ref: 'qg', title: 'Quantum gravity', role: 'related', prerequisites: [] }])] });
          return J(res, 400, { error: { message: 'unscripted agent ' + name } });
        }
        // a curriculum node built by the skill (engine/claude.js job): answer with a PACKAGE that carries the learner's file
        const first = b.messages[0].content; const sid = first[0].text.match(/Subject id: (\S+)/)[1];
        A.node.push({ sid, system: b.system[0].text, tools: b.tools.map(t => t.type || t.name), uploads: first.filter(x => x.type === 'container_upload').length, first: first[0].text });
        const pack = JSON.parse(JSON.stringify(FX)); pack.subject = { ...pack.subject, id: sid, title: 'DNA replication', owner: null }; pack.version = sid + '-v1';
        pack.sources = { sources: [{ id: 'm1', title: 'DNA replication (my PDF)', file: 'sources/dna-replication.pdf', fileName: 'dna-replication.pdf', size: A.pdf.length, sha256: crypto.createHash('sha256').update(A.pdf).digest('hex'), mime: 'application/pdf', firstPage: 1 }], chapters: { ch01: 'm1' }, patches: {} };
        pack.chapters[0].sources = [{ id: 'm1', pages: 'σ. 2–3' }];
        const JSZip = require(path.join(ROOT, 'engine/vendor/viewer/jszip.min.js')); const z = new JSZip(); z.file('pack.json', JSON.stringify(pack)); z.file('sources/dna-replication.pdf', A.pdf);
        const fid = 'file_pkg_' + A.node.length; A.zips[fid] = { name: sid + '.noema.zip', buf: await z.generateAsync({ type: 'nodebuffer' }) };
        return J(res, 200, { id: 'm', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 3000 }, container: { id: 'cont_' + sid },
          content: [{ type: 'server_tool_use', id: 's1', name: 'bash_code_execution', input: { command: `python3 scripts/make_pack.py work/x /tmp/out && cp /tmp/out/${sid}.noema.zip "$OUTPUT_DIR/"` } }, { type: 'bash_code_execution_tool_result', tool_use_id: 's1', content: { type: 'bash_code_execution_result', stdout: '', stderr: '', return_code: 0, content: [{ file_id: fid }] } }, { type: 'text', text: 'Done.' }] });
      }
      J(res, 404, { error: { message: 'no route ' + p } });
    });
  });
}

(async () => {
  unit();
  // the learner's files: a PDF with an outline (bookmarks) and Markdown notes
  const TF = path.join(ROOT, 'dist/site/testfiles/import'); fs.mkdirSync(TF, { recursive: true });
  execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1]); titles = ['Origins of replication', 'Helicase and the fork', 'Polymerases', 'Okazaki fragments']
for i, t in enumerate(titles):
    c.bookmarkPage('p%d' % i); c.addOutlineEntry(t, 'p%d' % i, level=0); c.setFont('Helvetica', 20); c.drawString(72, 720, t); c.setFont('Helvetica', 12); c.drawString(72, 690, 'Helicase unwinds the double helix at the replication fork.' if i == 1 else 'Page %d of the DNA replication handout' % (i + 1)); c.showPage()
c.save()`, path.join(TF, 'dna-replication.pdf')]);
  fs.writeFileSync(path.join(TF, 'Transcription notes.md'), '# Transcription\n\nRNA polymerase reads the template strand from 3′ to 5′ and builds RNA 5′ → 3′.\n\n## Promoters\n\nThe TATA box sits about 25 bp upstream.\n');
  fs.writeFileSync(path.join(TF, 'translation-extra.md'), '# Ribosomes\n\nThe ribosome reads codons.\n');
  A.pdf = fs.readFileSync(path.join(TF, 'dna-replication.pdf'));
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', anthropicBase: '${ABASE}', geminiBase: '${ABASE}/v1beta', askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const api = vendors(); await new Promise(r => api.listen(APORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Iro'); await p.fill('input[type=email]', 'iro@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1300);
  const iro = Object.values(srv.state.users).find(u => u.email === 'iro@example.com').id;
  await p.evaluate(k => NoemaClaude.Key.set(Noema.account.id, k, true), KEY);

  console.log('— 📥 import the map with files');
  await p.click('.cm-mode:has-text("Curricula")'); await wait(300);
  await p.click('button:has-text("Import a map")'); await wait(300);
  // ⓘ guides: every example is read by the real parser exactly as its “Read as” says; ▶ Try it loads it
  await p.click('.cg-step >> nth=0 >> .cg-tip summary'); await wait(150);
  const gd1 = await p.locator('.cg-step >> nth=0 >> .cg-tipbody').innerText();
  ok(['Tree or outline', 'Arrows', 'Mermaid', 'JSON', 'Anything else', '(any order)', '(after: A, 2.1)', 'A, B → C', 'B & C --> D', '"edges"'].every(x => gd1.includes(x)), 'ⓘ of “Your map”: every form, what each syntax means, with examples');
  const exs = await p.evaluate(() => [...document.querySelectorAll('.cm-guide .cm-ex')].map(d => ({ code: d.querySelector(':scope > pre').textContent, reads: d.querySelector('.cm-reads pre')?.textContent || '' })));
  const bad = await p.evaluate(exs => exs.flatMap(({ code, reads }) => { try { const g = NoemaCurImport.parse(code); if (!reads) return []; const lines = reads.split('\n'); return g.order.flatMap(id => { const n = g.nodes[id], pre = g.edges.filter(e => e.to === id).map(e => g.nodes[e.from].title).sort().join(', '); const l = lines.find(x => x.replace(/^[\d.]+ /, '').split(/\s{2,}|\s+⟵|\s+📎/)[0].trim() === n.title); if (!l) return [code.slice(0, 20) + ': no line for ' + n.title]; const m = l.match(/⟵ ([^(]+?)(\s{2,}|\s*\(|$)/); const got = m ? m[1].split(/,\s*/).sort().join(', ') : ''; return got === pre || (!m && /📎/.test(l)) || (!m && /\(start\)/.test(l) && !pre) ? [] : [n.title + ': guide says “' + got + '”, parser “' + pre + '”']; }); } catch (e) { return [code.slice(0, 20) + ': ' + e.message]; } }), exs);
  ok(exs.length >= 6 && !bad.length, `the ${exs.length} examples of the guides parse, and their “Read as” is what the app reads ` + JSON.stringify(bad));
  await p.click('.cg-step >> nth=0 >> .cm-gsec:has-text("Arrows") >> .cm-try'); await wait(500);
  ok(/arrows: 5 steps · 5 links/.test(await p.locator('.cm-detect').innerText()), '▶ Try it puts the example in the box and reads it: ' + await p.locator('.cm-detect').innerText());
  await p.click('.cg-step >> nth=0 >> .cg-tip summary');
  await p.click('.cg-step >> nth=2 >> .cg-tip summary'); await wait(150);
  const gd3 = await p.locator('.cg-step >> nth=2 >> .cg-tipbody').innerText();
  ok(['Named in your map', '📎 Files', 'pp. 40–62', 'dna/**', 'a sub-folder named like a step', 'To check', 'Not used', 'drag a file onto a step'].every(x => gd3.includes(x)), 'ⓘ of “Material”: how files are given to steps — in the map, paths and pages, automatic matching, fixing');
  await p.click('.cg-step >> nth=2 >> .cg-tip summary');
  await p.fill('.cm-maptext', TREE); await wait(600);
  ok(/tree \/ outline: 11 steps · 10 links/.test(await p.locator('.cm-detect').innerText()) && await p.locator('.cm-preview li').count() === 11, 'the pasted tree is read at once: ' + await p.locator('.cm-detect').innerText());
  ok(await p.inputValue('input[placeholder="Name of the curriculum"]') === 'Molecular information biology', 'the root becomes the name of the curriculum');
  await p.setInputFiles('.cm-import .cg-drop input[type=file]', [path.join(TF, 'dna-replication.pdf'), path.join(TF, 'Transcription notes.md')]);
  await wait(300);
  const sels = await p.$$eval('.cm-filetable tbody tr', rs => rs.map(r => [...r.querySelectorAll('.cm-tchip .linklike')].map(b => b.textContent).join('+')));
  ok(sels[0] === 'DNA replication' && sels[1] === 'Transcription', 'files matched to their steps by name: ' + sels.join(' | '));
  await p.screenshot({ path: SHOTS + '/i1_import.png', fullPage: true });
  await p.click('button:has-text("Import my map")');
  const imp1 = await until(() => p.locator('.cg-status.ready').count(), 30000); if (!imp1) console.log('   status:', await p.locator('.cg-status').innerText().catch(() => ''));
  ok(imp1, 'imported: only the chapters are planned, then “ready”');
  const names = A.agent.map(a => a.name);
  ok(names.length && names.every(n => n === 'submit_chapter_plans') && names.length === 3, 'no AI mapping: no DAG creator / auditor / expander — only 3 chapter-planner batches');
  ok(A.forced >= 1 && A.forced <= 3 && A.agent.every(a => a.choice === 'auto') && /Always answer by calling the tool "submit_chapter_plans"/.test(A.agent[0].sys) && await p.evaluate(() => localStorage.getItem('noema-device:claude-json-mode:claude-sonnet-9')) === 'auto', 'a model that refuses a forced tool call: the app switches to tool_choice auto (each parallel batch at most once) and remembers it (no error)');
  const planText = A.agent.map(a => a.text).join('\n');
  ok(/The learner's own material/.test(planText) && /dna-replication\.pdf \(4 pages/.test(planText) && /Helicase and the fork \(p\. 2\)/.test(planText) && /Transcription notes\.md/.test(planText) && /RNA polymerase reads/.test(planText), 'the planner gets each step\'s files: pages, outline (bookmarks) and the first lines');
  let c = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id)[0]);
  const dna = Object.keys(c.nodes).find(id => c.nodes[id].title === 'DNA replication'), tr = Object.keys(c.nodes).find(id => c.nodes[id].title === 'Transcription'), tl = Object.keys(c.nodes).find(id => c.nodes[id].title === 'Translation');
  ok(c.imported?.format === 'outline' && Object.keys(c.nodes).length === 11 && c.edges.length === 10 && c.title === 'Molecular information biology', 'the curriculum is your map, exactly (11 steps, 10 links)');
  ok(c.nodes[dna].material.files[0].name === 'dna-replication.pdf' && c.nodes[dna].material.files[0].pages === 4 && c.nodes[dna].chapters[0].material === 'dna-replication.pdf pp. 1–2', 'each chapter of a step with files says which pages it comes from');
  const pidDna = await p.evaluate(([cid, id]) => NoemaCurriculum.packId(NoemaCurriculum.get(Noema.account.id, cid), id), [c.id, dna]);
  ok(c.files && Object.keys(c.files).length === 2 && c.nodes[dna].material.files[0].fileId === 'f1', 'each file is stored once for the curriculum (c.files) and linked to its step');
  ok(await until(() => Object.keys(srv.state.files).includes(`${iro}/sources/curfiles-${c.id}/f1/file.pdf`), 10000), 'the files are in the cloud (this device + every device)');
  await p.click('button:has-text("Open the map")'); await wait(800);
  ok(await p.locator('.cm-node').count() === 11 && await p.locator('.cm-node:has-text("DNA replication") .cm-badges >> text=📎').count() === 1, 'the map shows the 11 steps; steps with files carry 📎');
  await p.screenshot({ path: SHOTS + '/i2_map.png' });

  console.log('— a step with a PDF, built by Claude FROM the file');
  await p.evaluate(([cid]) => { const c = NoemaCurriculum.get(Noema.account.id, cid); NoemaCurriculum.setMastered(Noema.account.id, c, 'prerequisites', 'manual'); }, [c.id]);
  await p.click(`.cm-node[data-id="${dna}"]`); await wait(300);
  ok(/your material/i.test(await p.locator('.cm-panel').innerText()) && /dna-replication\.pdf/.test(await p.locator('.cm-panel').innerText()), 'the step panel lists “📎 Your material”');
  await p.click('.cm-panel button:has-text("Review & prepare")'); await wait(400);
  ok(/dna-replication\.pdf/.test(await p.locator('.cm-editor .cm-mat').innerText()), 'the review shows the step’s files');
  await p.click('.cm-editor button:has-text("Looks good")');
  ok(await until(async () => (await p.evaluate(([cid, id]) => NoemaCurriculum.get(Noema.account.id, cid).nodes[id].pack?.status, [c.id, dna])) === 'ready', 40000), 'the step is prepared');
  const job = A.node[0] || {};
  ok(A.files.some(f => f.name === 'dna-replication.pdf') && job.uploads === 1, 'the PDF is uploaded into Claude’s sandbox with the job');
  ok(/THESE FILES ARE THE SOURCES/.test(job.system) && /Do NOT research the theory on the web/.test(job.system) && !job.tools.includes('web_fetch_20250910'), 'Claude builds from the file — no web research of the theory (no web_fetch)');
  ok(/m1: dna-replication\.pdf \(4 pages\)/.test(job.first) && /From the material: dna-replication\.pdf pp\. 1–2/.test(job.first), 'the brief names the file (source id m1) and each chapter’s pages');
  const ixOk = await until(() => { const ix = JSON.parse(srv.state.kv[iro]?.['a:srcfiles:' + pidDna]?.value || '{}'); return Object.keys(ix).join() === 'm1' && ix.m1.size === A.pdf.length && ix.m1.cloud; }, 15000);
  if (!ixOk) console.log('   index:', srv.state.kv[iro]?.['a:srcfiles:' + pidDna]?.value);
  ok(ixOk, 'the packaged file is the step subject’s source (👁 at the cited pages)');

  console.log('— a step with notes, built by Gemini from their text');
  await p.evaluate(([cid, dna]) => { const a = Noema.account.id; const k = `noema1:${a}:a:settings`; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.apiKey = 'AIza-test-key'; localStorage.setItem(k, JSON.stringify(s)); const c = NoemaCurriculum.get(a, cid); c.provider = 'gemini'; NoemaCurriculum.save(a, c); NoemaCurriculum.setMastered(a, NoemaCurriculum.get(a, cid), dna, 'manual'); }, [c.id, dna]);
  const g0 = A.gem.length;
  await p.evaluate(([cid, id]) => NoemaCurriculum.Gen.request(NoemaCurriculum.get(Noema.account.id, cid), id), [c.id, tr]);
  ok(await until(async () => (await p.evaluate(([cid, id]) => NoemaCurriculum.get(Noema.account.id, cid).nodes[id].pack?.status, [c.id, tr])) === 'ready', 40000), 'the step is prepared with Gemini');
  const gcalls = A.gem.slice(g0);
  ok(!gcalls.some(x => x.tools?.[0]?.google_search), 'no Google Search: the notes are the source');
  ok(gcalls.filter(x => /Write chapter/.test(x.first)).length === 4 && gcalls.filter(x => /Write chapter/.test(x.first)).every(x => /The learner's material for this chapter/.test(x.first) && /RNA polymerase reads the template strand/.test(x.first)), 'every chapter is written from the notes’ text');
  const pidTr = await p.evaluate(([cid, id]) => NoemaCurriculum.packId(NoemaCurriculum.get(Noema.account.id, cid), id), [c.id, tr]);
  const trPack = await p.evaluate(id => Noema.getPackById(Noema.account.id, id), pidTr);
  ok(trPack.sources.sources[0].id === 'm1' && trPack.sources.sources[0].fileName === 'Transcription notes.md' && trPack.chapters.every(ch => ch.src === 'm1'), 'the subject lists the notes as its source (each chapter cites it)');

  console.log('— 📎 material in the step editor');
  await p.evaluate(() => document.querySelectorAll('.noema-ov').forEach(o => o.remove()));
  await p.evaluate(([cid]) => NoemaCurMap.map(Noema.account.id, cid), [c.id]); await wait(800);
  await p.evaluate(([cid, id]) => NoemaCurMap.editStep(Noema.account.id, cid, id), [c.id, tl]); await wait(400);
  await p.setInputFiles('.cm-editor .cm-mat input[type=file]', path.join(TF, 'translation-extra.md'));
  ok(await until(async () => /translation-extra\.md/.test(await p.locator('.cm-editor .cm-mat').innerText()), 8000), 'files can be added to a step before it is prepared');
  const pidTl = await p.evaluate(([cid, id]) => NoemaCurriculum.packId(NoemaCurriculum.get(Noema.account.id, cid), id), [c.id, tl]);
  const tlFid = await p.evaluate(([cid, id]) => NoemaCurriculum.get(Noema.account.id, cid).nodes[id].material?.files?.[0]?.fileId, [c.id, tl]);
  ok(await until(() => Object.keys(srv.state.files).includes(`${iro}/sources/curfiles-${c.id}/${tlFid}/file.md`), 8000), '…and stored in the cloud');
  await p.click('.cm-editor .cm-mat button[aria-label^="Remove"]');
  ok(await until(async () => !(await p.evaluate(([cid, id]) => NoemaCurriculum.get(Noema.account.id, cid).nodes[id].material?.files?.length, [c.id, tl])) && !Object.keys(srv.state.files).includes(`${iro}/sources/curfiles-${c.id}/${tlFid}/file.md`), 8000), '…and removed again (device + cloud — no other step uses it)');
  await p.click('.cm-editor button:has-text("Cancel")');
  await p.evaluate(([cid, id]) => NoemaCurMap.editStep(Noema.account.id, cid, id), [c.id, dna]); await wait(300);
  ok(!(await p.locator('.cm-editor .cm-mat input[type=file]').count()) && !(await p.locator('.cm-editor .cm-mat button[aria-label^="Remove"]').count()), 'once a step is prepared its material is fixed');
  await p.click('.cm-editor button:has-text("Cancel")');

  console.log('— a map with a branch and a join, one textbook for two steps (pages each), drag & drop');
  execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1])
for i in range(1, 13): c.setFont('Helvetica', 16); c.drawString(72, 720, 'Book page %d' % i); c.showPage()
c.save()`, path.join(TF, 'textbook.pdf')]);
  fs.writeFileSync(path.join(TF, 'transport-notes.md'), '# Transport\n\nPumps and channels.\n'); fs.writeFileSync(path.join(TF, 'misc.md'), '# Misc\n\nBasics of the cell.\n');
  await p.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); NoemaCurMap.importMap(Noema.account.id); }); await wait(400);
  await p.fill('.cm-maptext', '# Cell biology\nBasics → Membranes, Organelles\nMembranes, Organelles → Transport\n📎 Files\nMembranes: textbook.pdf pp. 3-5\nOrganelles: textbook.pdf pp. 6-9'); await wait(700);
  const det2 = await p.locator('.cm-detect').innerText();
  ok(/arrows: 4 steps · 4 links · 1 branch · 1 join/.test(det2) && await p.locator('.cm-mnode').count() === 4, 'the preview draws the map (branch + join visible): ' + det2);
  await p.setInputFiles('.cm-import .cg-drop input[type=file]', [path.join(TF, 'textbook.pdf'), path.join(TF, 'transport-notes.md'), path.join(TF, 'misc.md')]); await wait(500);
  const rowOf = n => p.locator(`.cm-filetable tbody tr:has(b:text-is("${n}"))`);
  const tb = await rowOf('textbook.pdf').evaluate(r => ({ chips: [...r.querySelectorAll('.cm-tchip .linklike')].map(b => b.textContent), pages: [...r.querySelectorAll('.cm-range')].map(i => i.value) }));
  ok(tb.chips.join('+') === 'Membranes+Organelles' && tb.pages.join('|') === '3–5|6–9', 'one textbook → two steps, pages each (from the map): ' + JSON.stringify(tb));
  ok(/Transport/.test(await rowOf('transport-notes.md').innerText()) && !(await rowOf('misc.md').locator('.cm-tchip').count()), 'a file named like a step is matched; an unknown one waits for you');
  // HTML5 drag & drop of a file row onto a step (the same events a mouse drag fires)
  await p.evaluate(() => { const row = [...document.querySelectorAll('.cm-filetable tbody tr')].find(r => r.querySelector('b')?.textContent === 'misc.md'); const node = document.querySelector('.cm-mnode[data-id="basics"]'); const dt = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); node.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); node.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); row.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true })); });
  await wait(300);
  ok(/Basics/.test(await rowOf('misc.md').innerText()) && /📎1/.test(await p.locator('.cm-mnode[data-id="basics"]').innerText()), 'drag a file onto a step in the map → it is that step’s');
  await p.click('.cm-mnode[data-id="transport"]'); await wait(200);
  ok(/transport-notes\.md/.test(await p.locator('.cm-nodebox').innerText()), 'tap a step → its files (and “give it a file…”)');
  await p.screenshot({ path: SHOTS + '/i4_branch_files.png', fullPage: true });
  const nAg = A.agent.length;
  await p.click('button:has-text("Import my map")');
  ok(await until(() => p.locator('.cg-status.ready').count(), 30000), 'imported');
  const plan2 = A.agent.slice(nAg).map(a => a.text).join('\n');
  ok(/textbook\.pdf — ONLY pages 3–5 belong to this step/.test(plan2) && /textbook\.pdf — ONLY pages 6–9 belong to this step/.test(plan2), 'the planner is told which pages of the textbook belong to each step');
  const c2 = await p.evaluate(() => NoemaCurriculum.list(Noema.account.id).find(x => x.title === 'Cell biology'));
  const tbId = Object.keys(c2.files).find(k => c2.files[k].name === 'textbook.pdf');
  ok(Object.keys(c2.files).length === 3 && c2.nodes.membranes.material.files[0].fileId === tbId && c2.nodes.organelles.material.files[0].fileId === tbId && String(c2.nodes.organelles.material.files[0].range) === '6,9', 'the textbook is stored ONCE and linked to both steps with their pages');
  ok(await until(() => Object.keys(srv.state.files).filter(k => k.includes('textbook') || k.includes(`curfiles-${c2.id}/${tbId}/`)).length === 1, 8000), 'one copy in the cloud');
  // prepare “Membranes” with Gemini: only its pages are read
  await p.evaluate(([cid]) => { const a = Noema.account.id; const cc = NoemaCurriculum.get(a, cid); cc.provider = 'gemini'; NoemaCurriculum.save(a, cc); NoemaCurriculum.setMastered(a, NoemaCurriculum.get(a, cid), 'basics', 'manual'); NoemaCurriculum.Gen.request(NoemaCurriculum.get(a, cid), 'membranes'); }, [c2.id]);
  const g1 = A.gem.length;
  ok(await until(async () => (await p.evaluate(([cid]) => NoemaCurriculum.get(Noema.account.id, cid).nodes.membranes.pack?.status, [c2.id])) === 'ready', 40000), '“Membranes” is prepared from its pages');
  const chapPrompts = A.gem.slice(g1).filter(x => /Write chapter/.test(x.first)).map(x => x.first).join('\n');
  ok(/\[textbook\.pdf p\. 3\]/.test(chapPrompts) && /Book page 5/.test(chapPrompts) && !/Book page (2|6|7)\b/.test(chapPrompts), 'Gemini gets exactly pages 3–5 of the textbook (not the pages of the other step)');
  const pidM = await p.evaluate(([cid]) => NoemaCurriculum.packId(NoemaCurriculum.get(Noema.account.id, cid), 'membranes'), [c2.id]);
  const mIdx = await p.evaluate(id => JSON.parse(localStorage.getItem(`noema1:${Noema.account.id}:a:srcfiles:${id}`) || '{}'), pidM);
  ok(mIdx.m1?.ref?.src === tbId && !Object.keys(srv.state.files).some(k => k.includes(`/sources/${pidM}/`)) && await p.evaluate(async id => (await NoemaSrcFiles.get(Noema.account.id, id, 'm1'))?.blob.size, pidM) === fs.statSync(path.join(TF, 'textbook.pdf')).size, 'the step’s subject points at the curriculum’s copy (👁 works, no second copy)');

  console.log('— ✨ the AI reads a map written in prose (no new topics allowed)');
  const ai = await p.evaluate(() => NoemaCurImport.aiRead(Noema.account.id, 'To study genetics: first Mendelian inheritance, then DNA structure, then gene expression.', { provider: 'claude' }).then(g => ({ n: g.order.map(id => g.nodes[id].title), title: g.title, ai: g.ai }), e => ({ err: e.message })));
  const aiCalls = A.agent.filter(a => a.name === 'submit_imported_map');
  ok(aiCalls.length === 2 && /Quantum gravity” is not a topic of the given map/.test(aiCalls[1].repairText), 'an invented topic is sent back (“not a topic of the given map”) — the model answered in text (after thinking): the JSON is read from it');
  ok(ai.ai && ai.title === 'Genetics' && ai.n.join(' → ') === 'Mendelian inheritance → DNA structure → Gene expression', 'the AI’s reading: ' + (ai.n || [ai.err]).join(' → '));

  console.log('— phone');
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  await ph.goto(BASE + '/'); await wait(1500);
  await ph.evaluate(() => { document.querySelectorAll('.noema-ov').forEach(o => o.remove()); NoemaCurMap.importMap(Noema.account.id); }); await wait(400);
  await ph.fill('.cm-maptext', TREE); await ph.setInputFiles('.cm-import .cg-drop input[type=file]', [path.join(TF, 'dna-replication.pdf')]); await wait(600);
  execFileSync('python3', ['-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("material/04 Translation/ribosomes.md","# Ribosomes")\nz.writestr("material/Quality control/qc-notes.txt","QC")\nz.writestr("__MACOSX/._x","")\nz.close()', path.join(TF, 'material.zip')]);
  await ph.setInputFiles('.cm-import .cg-drop input[type=file]', path.join(TF, 'material.zip')); await wait(800);
  const zsel = await ph.$$eval('.cm-filetable tbody tr', rs => rs.map(r => '📄 ' + r.querySelector('td b').textContent + ' → ' + [...r.querySelectorAll('.cm-tchip .linklike')].map(b => b.textContent).join('+')));
  ok(zsel.length === 3 && zsel.includes('📄 ribosomes.md → Translation') && zsel.includes('📄 qc-notes.txt → Quality control'), 'a .zip with a folder per step: its files are matched by the folder names: ' + zsel.join(' | '));
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cm-import .cg-step, .cm-filetable')].every(s => s.getBoundingClientRect().right <= innerWidth + 1)), 'phone: the import screen fits (no sideways scrolling)');
  await ph.click('.cg-step >> nth=0 >> .cg-tip summary'); await ph.click('.cg-step >> nth=2 >> .cg-tip summary'); await wait(200);
  await ph.locator('.cg-step >> nth=0 >> .cm-gsec >> nth=1').screenshot({ path: '/tmp/claude-0/guide-phone.png' }).catch(() => {});
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.cm-guide, .cm-rules, .cm-ex')].every(s => s.getBoundingClientRect().right <= innerWidth + 1)), 'phone: the ⓘ guides fit too (no sideways scrolling)');
  await ph.screenshot({ path: SHOTS + '/i3_phone.png', fullPage: true });
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close(); api.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
