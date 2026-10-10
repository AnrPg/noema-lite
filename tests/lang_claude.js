/* P8 — language courses through Claude (docs/LANGUAGES.md §7.4, §10.1): engine/langcore.js (tasks, checks, merges),
   tools/lang_course.py + tools/validate_lang.py (the checks Claude runs), the connector (cloud/mcp/server.mjs, run
   in-process) and the app (engine/lang/95_claude.js + the loader hooks) in a browser against the Supabase emulator.
     A. langcore over the mini course: a new account course, the core (D13 against a library course, cycles, missing
        declarations), nodes / functions / comparisons / refills — refused with their problems, accepted and merged
        additively —, the queue (dedupe, night queue, claims), the inbox view, the task text; the Python round trip
     B. the connector: list / take (claimed, a signed link to the course) / submit (checked, to the inbox)
     C. the app: ✨ new course in the 🌍 overlay → the Claude app writes the core and nodes → merged; 🌙 night queue;
        ▶ with the Claude key (mocked API, a repair round); 📋 copy / 📥 paste; ✨ more sentences on a library course
        (the learner's private patch); phone width, keyboard, no page errors.
   Network: none — the Claude API is a Playwright route, Supabase the emulator on port 54341.
   Usage: node tests/lang_claude.js <built-repo-dir>   (python3 tools/build.py site first) */
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
const MINI = path.join(ROOT, 'tests', 'fixtures', 'lang-mini');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const clone = o => JSON.parse(JSON.stringify(o));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 54341, BASE = `http://localhost:${PORT}`;

const read = rel => { const p = path.join(MINI, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const list = rel => { const p = path.join(MINI, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
const mini = N.readCourse(read, list); delete mini.world;
const coreOf = d => clone({ fields: d.fields, nodes: d.nodes, functions: d.functions, frames: d.frames, typology: d.typology });
/** The mini course's sentences of a language whose functions are realized (or are fs) and whose words exist. */
const sentencesFor = (data, code, fns) => mini.langs[code].bank.filter(s => (s.functions || []).every(f => fns.includes(f) || data.langs[code].grammar[f]?.evidence) && JSON.stringify(s.tokens).match(/"l":"[^"]+"/g).every(m => { const l = m.slice(5, -1); return Object.values(data.langs[code].lexicon).some(f => f.lexemes.some(x => x.id === l)); }));

(async () => {
  /* ======================= A. langcore ======================= */
  console.log('— A. langcore: account courses, tasks, checks, merges');
  const made = N.langNewCourse({ title: 'Four languages, my way', languages: ['ar', 'he', 'zh', 'de'], knownLanguages: ['el', 'en'], depth: { de: 2 }, library: [mini], now: Date.parse('2026-10-09T08:00:00Z') });
  let { record: rec, data } = made;
  ok(/^u-four-languages-my-way-[a-z]{4}$/.test(rec.id) && rec.origin === 'account' && rec.provider === 'claudeapp' && data.course.account && data.course.defaults.depth.de === 2 && data.course.defaults.depth.ar === 3, `a new account course: ${rec.id}, depth per language, the learner's languages`);
  ok(rec.tasks.length === 1 && rec.tasks[0].id === 'core' && N.langNext(rec).id === 'core' && ['ar', 'he', 'zh', 'de'].every(c => data.langs[c].language?.code === c) && data.typology?.types?.length === 4, 'the core task is queued; language.json and the four types come from the library course');
  const es = N.langNewCourse({ title: 'Spanish', languages: ['es', 'de'], library: [mini] });
  let e = N.checkLangAnswer(es.record, es.data, N.langNext(es.record), { fields: [], nodes: [{ id: 'n1', kind: 'core', title: 'x', concepts: ['c1'] }], functions: [], frames: [] });
  ok(e.some(x => /lang\/es\/language\.json: missing/.test(x)) && e.some(x => /unknown concept “c1”/.test(x)), 'a language without its declarations (language.json) is named, with its catalogue of phenomena first (D14); unknown concepts too');
  const core = coreOf(mini), tCore = N.langNext(rec);
  ok(!N.checkLangAnswer(rec, data, tCore, core, { peers: [mini] }).length, 'the core that keeps the library course’s order passes (D13 with the peers)');
  const swapped = coreOf(mini); swapped.nodes.find(n => n.id === 'core.1').prereqs = ['veg.1']; swapped.nodes.find(n => n.id === 'veg.1').prereqs = ['fd.01x'];
  e = N.checkLangAnswer(rec, data, tCore, swapped, { peers: [mini] });
  ok(e.some(x => /parallel order \(D13\).*node (core|veg)\.1/.test(x)), 'a core teaching two common subjects in the opposite order is refused: ' + (e[0] || '').slice(0, 140));
  const cyc = coreOf(mini); cyc.nodes.find(n => n.id === 'fd.00').prereqs = ['veg.2'];
  ok(N.checkLangAnswer(rec, data, tCore, cyc).some(x => /cycle/.test(x)), 'a cycle in the DAG is refused');
  const orphan = coreOf(mini); orphan.fields[0].concepts.push({ id: 'veg.lost', gloss: 'lost', subgroup: orphan.fields[0].subgroups?.[0]?.id, tier: 3, rank: 999 });
  ok(N.checkLangAnswer(rec, data, tCore, orphan).some(x => /veg\.lost: is in no node/.test(x)), 'a concept in no node (and not pending) is refused');
  N.applyLangAnswer(rec, data, tCore, core, { now: Date.parse('2026-10-09T08:10:00Z') });
  ok(rec.tasks[0].status === 'done' && data.nodes.length === 6 && data.rev === 2 && rec.rev === 2 && /the core: 6 nodes/.test(rec.log[0].m), 'the core is merged: done, revision 2, logged');

  const nd = N.langNeeds(rec, data);
  ok(nd.nodes.length === 16 && nd.nodes[0].node === 'fd.01' && nd.functions.some(x => x.fn === 'fn.root.pattern' && x.lang === 'ar') && !nd.functions.some(x => x.fn === 'fn.root.pattern' && x.lang === 'de') && nd.functions.some(x => x.fn === 'fn.plural.noun' && x.lang === 'de'), 'what is still to write, in course order: every node × language, the realizations its lessons need (by type and language)');
  const n1 = N.langQueueNight(rec, data, { now: Date.parse('2026-10-09T22:00:00Z') });
  const n2 = N.langQueueNight(rec, data, { now: Date.parse('2026-10-09T22:01:00Z') });
  ok(n1 === nd.nodes.length + nd.functions.length && n2 === 0 && N.langWork(rec).queued.length === n1 && N.langWork(rec).queued.every(t => t.night), `🌙 the night queue: ${n1} tasks, queued once (a second press adds nothing)`);
  ok(N.langWork(rec).queued[0].id === 'node:fd.01:ar' && N.langQueue(rec, 'lang.node', { node: 'fd.01', lang: 'de' }) === N.langTaskById(rec, 'node:fd.01:de'), 'tasks keep the course order; queueing an open task returns it');
  const claims = [{ key: N.langClaimKey(rec.id, 'node:fd.01:ar'), updated_at: '2026-10-09T22:05:00Z' }, { key: N.langClaimKey(rec.id, 'node:fd.01:he'), updated_at: '2026-10-09T10:00:00Z' }];
  const st = N.langSettle(rec, { claims, now: Date.parse('2026-10-09T22:30:00Z') });
  ok(N.langNext(st).id === 'node:fd.01:he' && N.langWork(st).claimed.map(t => t.id).join() === 'node:fd.01:ar' && N.langNext(st, { task: 'node:fd.01:ar' }).error && N.langNext(st, { task: 'node:fd.01:ar', force: true }).id === 'node:fd.01:ar', 'a task claimed by another run is skipped (an expired claim is not); force takes it over');

  // nodes in German: refused with their problems, then accepted
  const tNode = id => N.langTaskById(rec, id);
  const lx = n => clone(mini.langs.de.lexicon[n]);
  const badVeg = lx('veg.1'); delete badVeg.lexemes[0].features.declension; badVeg.lexemes[1].senses = ['veg.nothing']; badVeg.lexemes = badVeg.lexemes.filter(x => !x.senses.includes('veg.cucumber'));
  e = N.checkLangAnswer(rec, data, tNode('node:veg.1:de'), { lexicon: badVeg });
  ok(e.some(x => /does not state its .*declension/.test(x)) && e.some(x => /unknown concept “veg\.nothing”/.test(x)) && e.some(x => /concept “veg\.cucumber” has no word and is not marked absent/.test(x)), 'a node is refused for a missing parameter of the facade (D14), an unknown concept, a concept without a word');
  const noCell = lx('core.1'), verb = noCell.lexemes.find(x => x.pos === 'VERB'); delete verb.forms['V;PRS;3;SG'];
  ok(N.checkLangAnswer(rec, data, tNode('node:core.1:de'), { lexicon: noCell }).some(x => /missing cell V;PRS;3;SG/.test(x)), 'a missing paradigm cell is refused');
  for (const n of ['fd.01', 'core.1', 'veg.1', 'veg.2']) {
    const errs = N.checkLangAnswer(rec, data, tNode(`node:${n}:de`), { lexicon: lx(n) });
    if (errs.length) console.log(errs.slice(0, 5));
    N.applyLangAnswer(rec, data, tNode(`node:${n}:de`), { lexicon: lx(n) });
  }
  ok(Object.keys(data.langs.de.lexicon).length === 4 && N.course(data).lang.de.lex['de:Karotte'] && !tNode('node:veg.1:de'), 'the German nodes are accepted and merged (the course reads them: de:Karotte)');
  // a function with sentences: a wrong form is refused, the right ones merged
  const tDef = tNode('function:fn.definite:de'), gDef = clone(mini.langs.de.grammar['fn.definite']);
  const sDef = sentencesFor(data, 'de', ['fn.definite']).filter(s => s.functions.includes('fn.definite'));
  const wrong = clone(sDef); wrong[0].tokens[1].t = 'esst'; wrong[0].text = wrong[0].text.replace('isst', 'esst');
  e = N.checkLangAnswer(rec, data, tDef, { grammar: gDef, bank: wrong });
  ok(e.some(x => /“esst” is not the V;PRS;3;SG form of de:essen \(“isst”\)/.test(x)), 'a sentence token that is not its paradigm cell is refused: ' + (e[0] || '').slice(0, 110));
  const noNotes = clone(gDef); noNotes.notes = noNotes.notes.slice(0, 3);
  ok(N.checkLangAnswer(rec, data, tDef, { grammar: noNotes, bank: sDef }).some(x => /comparison notes for the reference set: 3 of at least 8/.test(x)), 'a grammar page without notes for 8 reference languages of all four types is refused (D18)');
  const joined = clone(sDef); joined[0].text = joined[0].text + ' ';
  ok(N.checkLangAnswer(rec, data, tDef, { grammar: gDef, bank: joined }).some(x => /≠ the tokens joined/.test(x)), 'text ≠ the joined tokens is refused');
  ok(!N.checkLangAnswer(rec, data, tDef, { grammar: gDef, bank: sDef }).length && sDef.length >= 3, `fn.definite in German with ${sDef.length} sentences passes`);
  N.applyLangAnswer(rec, data, tDef, { grammar: gDef, bank: sDef });
  ok(!N.langTaskById(rec, tDef.id), 'an answered task is closed');
  ok(N.checkLangAnswer(rec, data, { ...tDef, status: 'queued' }, { grammar: gDef, bank: sDef }).some(x => /used twice/.test(x)), 'sentence ids already in the bank are refused (additive merges never overwrite)');
  const C1 = N.course(data);
  ok(C1.lang.de.sentences.length === sDef.length && N.feasibility(C1, N.newLearner(C1), 'de', 'fn.definite').sentences === 0, 'the sentences are in the course (and a new learner knows none of their words)');
  // a comparison
  N.applyLangAnswer(rec, data, N.langQueue(rec, 'lang.function', { fn: 'fn.definite', lang: 'zh' }), { grammar: clone(mini.langs.zh.grammar['fn.definite']) });
  const tCmp = N.langQueue(rec, 'lang.compare', { fn: 'fn.definite' });
  const cmp = { compare: { function: 'fn.definite', rows: [{ aspect: 'How “the” is shown', cells: { de: 'der / die / das, declined', zh: 'no article: context, 这 / 那' } }, { aspect: 'Where', cells: { de: 'before the noun', xx: 'nowhere' } }] } };
  ok(N.checkLangAnswer(rec, data, tCmp, cmp).some(x => /“xx” is not a course language/.test(x)), 'a comparison with a language outside the course is refused');
  cmp.compare.rows[1].cells = { de: 'before the noun', zh: '—: none' };
  ok(!N.checkLangAnswer(rec, data, tCmp, cmp).length && /compared/.test(N.applyLangAnswer(rec, data, tCmp, cmp)) && data.compare['fn.definite'].rows.length === 2, 'the comparison is accepted and stored with the course');
  // a refill (§7.4): only the learner's known words
  const C2 = N.course(data), L2 = N.newLearner(C2);
  for (const id of ['de:sie', 'de:er', 'de:essen', 'de:der', 'de:Karotte', 'de:Zwiebel', 'de:Gurke', 'de:und']) if (C2.lang.de.lex[id]) { N.introduce(C2, L2, 'de', id, 100); N.review(C2, L2, 'de', id, 'r', 'good', 100); }
  const req = N.langRefillRequest(C2, L2, 'de', 'fn.definite');
  ok(req.R.includes('de:Karotte') && !req.R.includes('de:Kürbis') && req.fn === 'fn.definite' && req.lang === 'de', `the refill request carries the known words: R = ${req.R.length} lexemes`);
  const tRef = N.langQueue(rec, 'lang.refill', req);
  const tok = (t, l, f) => ({ t, l, ...(f ? { f } : {}) });
  const s1 = { id: 'de.refill.definite.1.001', frame: 'fr.eat.def', text: 'Er isst die Zwiebel.', tokens: [tok('Er', 'de:er', 'PRON;NOM'), tok('isst', 'de:essen', 'V;PRS;3;SG'), tok('die', 'de:der', 'DET;ACC;SG;FEM'), tok('Zwiebel', 'de:Zwiebel', 'N;ACC;SG'), { t: '.', p: true }], functions: ['fn.definite'], gloss: 'He eats the onion.' };
  const s2 = { id: 'de.refill.definite.1.002', frame: 'fr.eat.def', text: 'Sie isst den Kürbis.', tokens: [tok('Sie', 'de:sie', 'PRON;NOM'), tok('isst', 'de:essen', 'V;PRS;3;SG'), tok('den', 'de:der', 'DET;ACC;SG;MASC'), tok('Kürbis', 'de:Kürbis', 'N;ACC;SG'), { t: '.', p: true }], functions: ['fn.definite'], gloss: 'She eats the pumpkin.' };
  e = N.checkLangAnswer(rec, data, tRef, { bank: [s1, s2] });
  ok(e.length === 1 && /uses words the learner does not know yet: de:Kürbis/.test(e[0]), 'a refill sentence with a word the learner does not know is refused (requirements ⊆ known)');
  ok(N.checkLangAnswer(rec, data, tRef, { bank: [{ ...s1, functions: [] }] }).some(x => /must list fn\.definite/.test(x)), 'a refill sentence must show the function it was asked for');
  ok(!N.checkLangAnswer(rec, data, tRef, { bank: [s1] }).length, 'a refill with known words only passes');
  // the inbox view (the connector works on the course as it will be once the app has merged)
  const rows = [{ key: N.langInboxKey(rec.id, '001'), value: JSON.stringify({ task: tRef.id, data: { bank: [s1] } }) }, { key: N.langInboxKey(rec.id, '002'), value: JSON.stringify({ task: 'node:fd.01:ar', data: { lexicon: { lexemes: [] } } }) }];
  const view = N.langMerged(rec, data, rows);
  ok(!N.langTaskById(view.rec, tRef.id) && N.langTaskById(view.rec, 'node:fd.01:ar') && N.langTaskById(rec, tRef.id) && view.data.langs.de.bank.some(s => s.id === s1.id) && !data.langs.de.bank.some(s => s.id === s1.id), 'the inbox view: a good answer is merged (in the view only), a bad one leaves its task open');
  // a library course: the refill goes into the learner's patch
  const libC = N.course(clone(mini)), libRec = N.langLibraryRecord(libC), patch = N.langEmptyPatch(libC.id), libData = clone(mini);
  const tLib = N.langQueue(libRec, 'lang.refill', { ...req, R: req.R.filter(id => libC.lang.de.lex[id]) });
  const s3 = { ...s1, id: 'de.refill.definite.1.101' };
  ok(!N.checkLangAnswer(libRec, libData, tLib, { bank: [s3] }).length, 'a library course’s refill is checked against the library course');
  N.applyLangAnswer(libRec, libData, tLib, { bank: [s3] }, { patch });
  ok(patch.langs.de.bank.length === 1 && patch.rev === 1 && libRec.rev === 0 && N.langApplyPatch(clone(mini), patch).langs.de.bank.length === mini.langs.de.bank.length + 1 && N.langApplyPatch(N.langApplyPatch(clone(mini), patch), patch).langs.de.bank.length === mini.langs.de.bank.length + 1, 'merged into the learner’s private patch, laid over the course once (idempotent)');
  // the task text
  const txt = N.langTaskText(rec, data, tNode('node:veg.2:zh'), { files: [{ url: 'https://example.org/c.json', name: 'course.json' }] });
  ok(/node:veg\.2:zh/.test(txt) && /D13/.test(txt) && /D18/.test(txt) && /noema_lang_submit/.test(txt) && /lang_course\.py unpack course\.json/.test(txt) && /validate_lang\.py work\/lang\/.* --lang zh --alone/.test(txt) && /lang_refcheck\.py/.test(txt) && /"required":\["lexicon"\]/.test(txt) && /zh:huluobo|胡萝卜/.test(txt) === false && /veg\.eggplant/.test(txt), 'the task text: the rules, the node’s concepts, the checks to run, how to answer, the schema');
  const ptxt = N.langTaskText(rec, data, tRef, { mode: 'paste' });
  ok(/only the JSON/.test(ptxt) && /de:Karotte · Karotte · NOUN FEM · veg\.carrot \{N;NOM;SG=Karotte/.test(ptxt) && !/de:Kürbis ·/.test(ptxt), 'a refill task lists exactly the known words, with every form (paste mode)');
  ok(/noema_lang_task with course_id "u-four/.test(N.langMessage(rec, { count: 3 })), 'the message for the Claude app names the course and the tool');
  // the Python twin: course ↔ folder, the validator, the answer read back
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-lc-'));
  try {
    fs.writeFileSync(path.join(W, 'course.json'), JSON.stringify(data));
    execFileSync('python3', [path.join(ROOT, 'tools/lang_course.py'), 'unpack', path.join(W, 'course.json'), path.join(W, 'lang')]);
    const dir = path.join(W, 'lang', rec.id), ans = { bank: [s1] };
    fs.writeFileSync(path.join(W, 'a.json'), JSON.stringify(ans));
    execFileSync('python3', [path.join(ROOT, 'tools/lang_course.py'), 'apply', dir, path.join(W, 'a.json'), tRef.id]);
    let out = ''; try { out = execFileSync('python3', [path.join(ROOT, 'tools/validate_lang.py'), dir, '--lang', 'de', '--alone']).toString(); } catch (x) { out = String(x.stdout); }
    ok(/✅ valid/.test(out), 'lang_course.py unpack + apply → validate_lang.py --lang de: ' + out.split('\n').filter(l => /❌|valid/.test(l)).slice(0, 2).join(' | '));
    const back = JSON.parse(execFileSync('python3', [path.join(ROOT, 'tools/lang_course.py'), 'answer', dir, tRef.id]).toString());
    ok(back.bank.length === 1 && back.bank[0].id === s1.id && !N.checkLangAnswer(rec, data, tRef, back).length, 'lang_course.py answer reads the answer back from the folder — and the app accepts it');
    const wf = clone(ans); wf.bank[0].tokens[3].t = 'Zwiebeln'; wf.bank[0].text = 'Er isst die Zwiebeln.'; fs.writeFileSync(path.join(W, 'b.json'), JSON.stringify(wf));
    execFileSync('python3', [path.join(ROOT, 'tools/lang_course.py'), 'apply', dir, path.join(W, 'b.json'), tRef.id]);
    try { out = execFileSync('python3', [path.join(ROOT, 'tools/validate_lang.py'), dir, '--lang', 'de', '--alone']).toString(); } catch (x) { out = String(x.stdout); }
    ok(/“Zwiebeln” is not the N;ACC;SG form/.test(out) && N.checkLangAnswer(rec, data, tRef, wf).some(x => /“Zwiebeln” is not the N;ACC;SG form/.test(x)), 'the validator and the app refuse the same wrong form');
  } finally { fs.rmSync(W, { recursive: true, force: true }); }
  N.applyLangAnswer(rec, data, tRef, { bank: [s1] });
  ok(data.langs.de.bank.some(s => s.id === s1.id) && rec.tasks.find(t => t.id === tRef.id).status === 'done', 'the refill is merged into the account course');

  /* ======================= B + C. the connector and the app ======================= */
  const { chromium } = require(process.env.PW || 'playwright');
  const { start } = require('./mock_supabase');
  // the mini course as a library course of the website (a built pack + a registry that lists it)
  const TF = path.join(ROOT, 'dist/site/testfiles/lang-mini'); fs.mkdirSync(TF, { recursive: true });
  fs.writeFileSync(path.join(TF, 'course.pack.js'), `(window.NOEMA_LANGPACKS = window.NOEMA_LANGPACKS || {})["lang-mini"] = ${JSON.stringify(mini).replace(/<\//g, '<\\/')};\n`);
  const libMeta = { id: 'lang-mini', title: mini.course.title, emoji: '🌍', languages: mini.course.languages, explainLang: 'en', path: 'testfiles/lang-mini/course.pack.js', words: {} };
  const regTxt = fs.readFileSync(path.join(ROOT, 'dist/site/library/registry.js'), 'utf8'); const w0 = {}; new Function('window', regTxt)(w0);
  const REG = { ...w0.NOEMA_REGISTRY, languages: [libMeta] };
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: true, shell: false };   // the older screens, like main's suites (tests/lang_frame.js tests the frame)`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [], languages: [{ id: 'lang-mini', title: libMeta.title, languages: libMeta.languages, path: libMeta.path }] };
  const fn = path.join(os.tmpdir(), `noema-mcp-lang-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify({ workflow: 'SKILL', content: 'C', visual: 'V', languages: 'RULES' })};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js', 'engine/langcore.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
  const { default: handler } = await import(fn);
  let T = null, rpc = 0;
  const tool = async (name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })); const j = await r.json(); return { text: j.result?.content?.[0]?.text || j.error?.message || '', error: !!j.result?.isError || !!j.error }; };
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    await ctx.route(BASE + '/library/registry.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: `window.NOEMA_REGISTRY = ${JSON.stringify(REG)};` }));
    // the Claude API (▶ with the key): answers come from this list, as a streamed tool call
    const claudeAnswers = [], claudeCalls = [];
    const sse = obj => [{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'answer', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(obj) } }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }, { type: 'message_stop' }].map(d => `event: ${d.type}\ndata: ${JSON.stringify(d)}`).join('\n\n') + '\n\n';
    await ctx.route('https://api.anthropic.com/**', async r => { claudeCalls.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(claudeAnswers.shift() || {}) }); });
    const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', x => E.push(x.message)); if (process.env.DEBUG) p.on('console', m => console.log('   [console]', m.text().slice(0, 300)));
    await p.goto(BASE + '/'); await wait(800);
    await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
    await p.fill('input[placeholder="Display name"]', 'Mira'); await p.fill('input[type=email]', 'mira@example.com'); await p.fill('input[type=password]', 'secret123');
    await p.click('button:has-text("Create account")'); await wait(1300);
    const uid = Object.values(srv.state.users).find(u => u.email === 'mira@example.com').id, ACC = 'u_' + uid;
    T = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mira@example.com', password: 'secret123' }) })).json()).access_token;
    const kv = () => srv.state.kv[uid] || {};
    const poll = () => p.evaluate(() => NoemaLangUI.claude.poll(Noema.account.id));

    console.log('— C1. ✨ a new language course in the 🌍 overlay');
    await p.click('.cm-mode:has-text("Languages")'); await wait(300);
    ok(await p.isVisible('button:has-text("New language course")'), 'the 🌍 Languages overlay offers ✨ New language course');
    await p.click('button:has-text("New language course")'); await p.waitForSelector('.lj-box');
    ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Title'), 'keyboard: the dialog opens with the title field focused');
    await p.fill('.lj-box input[aria-label=Title]', 'My four languages');
    for (const c of ['ar', 'he', 'zh', 'de']) await p.click(`.lj-lang[data-lang=${c}]`);
    await p.selectOption('.lj-depths select[data-lang=de]', '2');
    await p.fill('.lj-box input[aria-label="Languages you know"]', 'el, en');
    ok(await p.locator('.lj-way').count() === 3 && await p.locator('.lj-way.on').getAttribute('data-way') === 'claudeapp' && await p.locator('.lj-way[data-way=claude]').isDisabled(), 'three ways; the Claude app is chosen (recommended), the key way needs a key on this device');
    await p.click('.lj-way[data-way=cowork]'); await p.click('.lj-create'); await wait(200);
    ok(/library\/languages/.test(await p.locator('.lj-box textarea').inputValue()) && /LANGUAGE_RULES/.test(await p.locator('.lj-box textarea').inputValue()), '“Claude here in Cowork” gives the brief for the shared library (no account course)');
    await p.keyboard.press('Escape'); await wait(150);
    ok(!(await p.$('.lj-box')), 'Escape closes the dialog');
    await p.click('button:has-text("New language course")'); await p.waitForSelector('.lj-box');
    await p.fill('.lj-box input[aria-label=Title]', 'My four languages'); for (const c of ['ar', 'he', 'zh', 'de']) await p.click(`.lj-lang[data-lang=${c}]`); await p.fill('.lj-box input[aria-label="Languages you know"]', 'el, en');
    await p.screenshot({ path: SHOTS + '/lj1_new.png' });
    await p.click('.lj-create'); await p.waitForSelector('.lj-box h2:has-text("waiting for your Claude app")');
    const msg = await p.locator('.lj-box textarea').inputValue();
    const cid = (msg.match(/course_id (u-[a-z0-9-]+)/) || [])[1];
    ok(!!cid && /noema_lang_task/.test(msg), 'created: the message for the Claude app names the course and the tool — ' + cid);
    ok(await until(() => kv()['a:langcourse:' + cid] && srv.state.files[`${uid}/langs/${cid}.json`]), 'the record is a synced account key, the content is in the private storage (the connector reads both)');
    await p.click('.lj-box button:has-text("Open the course")'); await wait(1200);
    ok(await p.evaluate(() => location.hash) === '' && await p.isVisible('h1:has-text("Through Claude")') && await p.isVisible('.lj-task[data-task=core]'), 'the course opens on ✨ Through Claude while its core is not written: the core is queued');

    console.log('— B. the connector: list, take, submit');
    const tl = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).then(r => r.json());
    ok(['noema_lang_courses', 'noema_lang_task', 'noema_lang_submit'].every(n => tl.result.tools.some(t => t.name === n)), 'tools/list offers noema_lang_courses, noema_lang_task, noema_lang_submit');
    const pg = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: 'language_course_work', arguments: { course: 'My four languages', tasks: '3' } } }) })).then(r => r.json());
    ok(/next 3 queued tasks/.test(pg.result?.messages?.[0]?.content?.text || ''), 'a prompt “Write my noema-lite language course”');
    let r = await tool('noema_lang_courses');
    ok(r.text.includes(cid) && /1 task\(s\) queued: core/.test(r.text), 'noema_lang_courses: the course and its queue');
    r = await tool('noema_lang_task', { course_id: cid, peek: true });
    ok(/Next task \(not claimed — peek\): core/.test(r.text) && !kv()[N.langClaimKey(cid, 'core')], 'peek says what is next without claiming it');
    r = await tool('noema_lang_task', { course_id: cid });
    const link = (r.text.match(/curl -sSL -o course\.json "([^"]+)"/) || [])[1];
    ok(/language task — The core of the course/.test(r.text) && /common order of the library course/.test(r.text) && kv()[N.langClaimKey(cid, 'core')] && !!link, 'noema_lang_task: the core task as complete instructions (with the library order, D13), claimed for this run, a signed link to the course');
    const dl = link ? await (await fetch(link)).json() : null;
    ok(dl?.course?.id === cid && dl.format === 'noema.langdata/v1', 'the link downloads the course file (for lang_course.py unpack)');
    r = await tool('noema_lang_task', { course_id: cid });
    ok(/Nothing is waiting/.test(r.text) && /being written by other runs/.test(r.text), 'a second run is not given the claimed task');
    r = await tool('noema_lang_submit', { course_id: cid, task_id: 'core', result_json: JSON.stringify(swapped) });
    ok(r.error && /parallel order \(D13\)/.test(r.text), 'a core in another order than the library course is refused with the problem');
    r = await tool('noema_lang_submit', { course_id: cid, task_id: 'core', result_json: '```json\n' + JSON.stringify(core) + '\n```' });
    ok(!r.error && /Accepted \(core\)/.test(r.text) && Object.keys(kv()).some(k => k.startsWith('a:langin:' + cid + ':')) && !kv()[N.langClaimKey(cid, 'core')], 'the right core is accepted: into the inbox, the claim released');
    r = await tool('noema_lang_submit', { course_id: cid, task_id: 'core', result_json: JSON.stringify(core) });
    ok(r.error && /not open any more/.test(r.text), 'the same task cannot be answered twice (the inbox counts)');

    console.log('— C2. the app merges the answers; 🌙 the night queue');
    await poll();
    ok(await p.evaluate(c => NoemaLangUI.claude.getRec(Noema.account.id, c).log.some(l => /the core: 6 nodes/.test(l.m)), cid), 'the app fetches the inbox, checks the answer again and merges it');
    ok(await until(() => !Object.keys(kv()).some(k => k.startsWith('a:langin:'))) && await p.evaluate(c => NoemaLangUI.UI.C.data.nodes.length === 6 && NoemaLangUI.claude.getRec(Noema.account.id, c).tasks[0].status === 'done', cid), 'the inbox is emptied; the open course has its core now');
    ok(await until(async () => JSON.parse(kv()['a:langcourse:' + cid].value).rev === 2 && JSON.parse(srv.state.files[`${uid}/langs/${cid}.json`].data.toString()).rev === 2), 'the record and the content in the cloud are at revision 2');
    await p.evaluate(() => { location.hash = '#/claude'; }); await wait(400);
    await p.click('.lj-night'); await wait(300);
    const nNight = await p.evaluate(c => NoemaLangUI.claude.getRec(Noema.account.id, c).tasks.filter(t => t.status === 'queued' && t.night).length, cid);
    ok(nNight === 16 + 11 && await p.locator('.lj-task').count() === nNight, `🌙 every unwritten node and realization is queued (${nNight}) and listed`);
    ok(await until(() => JSON.parse(kv()['a:langcourse:' + cid].value).tasks.length === 1 + nNight, 10000), 'the queue reaches the cloud (scheduled runs see it)');
    r = await tool('noema_lang_task', { course_id: cid, want: 'node' });
    ok(/node:fd\.01:ar/.test(r.text) && /greet\.hello/.test(r.text), 'the next scheduled run gets the first node in course order (fd.01 in Arabic), with its concepts');
    const sub = async (task, ans) => tool('noema_lang_submit', { course_id: cid, task_id: task, result_json: JSON.stringify(ans) });
    const badDe = lx('veg.1'); badDe.lexemes[0].forms['N;ACC;PL'] = '';
    r = await sub('node:veg.1:de', { lexicon: badDe });
    ok(r.error && /empty form/.test(r.text), 'a node with an empty form is refused by the connector');
    for (const n of ['fd.01', 'core.1', 'veg.1']) { r = await sub(`node:${n}:de`, { lexicon: lx(n) }); if (r.error) console.log(r.text.slice(0, 400)); }
    ok(!r.error, 'three German nodes are accepted');
    r = await tool('noema_lang_task', { course_id: cid, task: 'node:veg.2:de' });
    const link2 = (r.text.match(/curl -sSL -o course\.json "([^"]+)"/) || [])[1];
    const view = link2 ? await (await fetch(link2)).json() : null;
    ok(/view\.json/.test(link2 || '') && Object.keys(view?.langs?.de?.lexicon || {}).length === 3 && /de:Karotte · Karotte/.test(r.text), 'while answers wait in the inbox, Claude gets a working copy with them merged (the course itself is not written by the connector)');
    await poll();
    ok(await p.evaluate(() => Object.keys(NoemaLangUI.UI.C.lang.de.lex).length) === 10, 'the app merges the three nodes: the German words are in the open course');

    console.log('— C3. ▶ with the Claude key (mocked API) and 📋 copy / 📥 paste');
    await p.evaluate(a => { localStorage.setItem('noema-device:anthropicKey:' + a, 'sk-ant-' + 'a'.repeat(32)); localStorage.setItem(`noema1:${a}:a:claudeModel`, JSON.stringify('claude-test')); }, ACC);
    await p.evaluate(() => { location.hash = '#/'; }); await wait(200); await p.evaluate(() => { location.hash = '#/claude'; }); await wait(400);
    const gD = clone(mini.langs.de.grammar['fn.definite']), dataNow = await p.evaluate(() => NoemaLangUI.UI.C.data);
    const sD = sentencesFor(dataNow, 'de', ['fn.definite']).filter(s => s.functions.includes('fn.definite'));
    claudeAnswers.push({ grammar: { ...gD, notes: [] }, bank: sD }, { grammar: gD, bank: sD });
    await p.click('.lj-task[data-task="function:fn.definite:de"] .lj-run'); await wait(1500);
    ok(claudeCalls.length === 2 && /comparison notes for the reference set/.test(JSON.stringify(claudeCalls[1].messages)) && claudeCalls[0].tool_choice?.name === 'answer', '▶ the app asks Claude (a tool call); the check sends the problems back and Claude repairs its answer');
    ok(await p.evaluate(() => !!NoemaLangUI.UI.C.lang.de.grammar['fn.definite'] && NoemaLangUI.UI.C.lang.de.sentences.length) === sD.length && !(await p.$('.lj-task[data-task="function:fn.definite:de"]')), `the answer is merged: the realization + ${sD.length} sentences; the task leaves the queue`);
    await p.click('.lj-task[data-task="node:veg.2:de"] .lj-copy'); await wait(300);
    const copied = await p.evaluate(() => navigator.clipboard.readText());
    ok(/only the JSON, nothing before or after it/.test(copied) && /node:veg\.2:de/.test(copied) && /course-u-/.test(copied), '📋 the task to copy into any Claude chat (answer with the JSON only; the course file to attach)');
    await p.click('.lj-task[data-task="node:veg.2:de"] .lj-paste');
    const badV2 = lx('veg.2'); badV2.lexemes[0].senses = ['veg.carrot'];
    await p.fill('.lj-answer', JSON.stringify({ lexicon: badV2 })); await p.click('.lj-check'); await wait(300);
    ok(/problem/.test(await p.locator('.lj-errs').innerText()) && /belongs to node veg\.1/.test(await p.locator('.lj-errs').innerText()), '📥 a pasted answer with a problem lists it (to give back to Claude)');
    await p.fill('.lj-answer', JSON.stringify({ lexicon: lx('veg.2') })); await p.click('.lj-check'); await wait(600);
    ok(await p.evaluate(() => !!NoemaLangUI.UI.C.lang.de.lex['de:Kürbis']) && !(await p.$('.lj-task[data-task="node:veg.2:de"]')), '📥 the right answer is merged');
    // a comparison through the connector, shown on the grammar page
    await p.evaluate(c => { const a = Noema.account.id, R = NoemaLangUI.claude.getRec(a, c); NoemaLang.langQueue(R, 'lang.compare', { fn: 'fn.definite' }); NoemaLangUI.claude.putRec(a, R); }, cid);
    await until(() => JSON.parse(kv()['a:langcourse:' + cid].value).tasks.some(t => t.id === 'compare:fn.definite'), 10000);
    r = await sub('compare:fn.definite', { compare: { function: 'fn.definite', rows: [{ aspect: 'The article', cells: { de: 'der / die / das', ar: 'الـ (al-), one form', zh: 'none' } }] } });
    ok(!r.error, 'a comparison is accepted by the connector');
    await poll(); await p.evaluate(() => { location.hash = '#/fn/fn.definite/de'; }); await wait(500);
    ok(await p.isVisible('.lj-cmp') && await p.locator('.lj-cmp td[lang=ar][dir=rtl]').count() === 1 && await p.locator('.lj-cmp td[lang=de][dir=ltr]').count() === 1, 'the comparison table on the grammar page: every cell with lang and dir');
    ok(await p.isVisible('.lj-refill') && /🔒|🟡|🟢/.test(await p.locator('.lj-refill').innerText()), 'the grammar page shows how many sentences fit the learner’s words, and ✨ more');

    console.log('— C4. ✨ more sentences on a library course: the learner’s private patch');
    await p.goto(BASE + '/?subject=lang:lang-mini#/'); await until(() => p.evaluate(() => window.NoemaLangUI?.UI?.id === 'lang-mini'), 25000);
    ok(await p.evaluate(() => NoemaLangUI.UI.id === 'lang-mini' && !NoemaLangUI.claude.getRec(Noema.account.id, 'lang-mini')), 'the library course opens as built (no refill yet)');
    await p.evaluate(() => { const { UI } = NoemaLangUI, N = NoemaLang; for (const id of ['de:sie', 'de:er', 'de:essen', 'de:der', 'de:Karotte', 'de:Zwiebel', 'de:Gurke']) { N.introduce(UI.C, UI.L, 'de', id, N.dayNumber()); N.review(UI.C, UI.L, 'de', id, 'r', 'good', N.dayNumber()); } NoemaLangUI.save(true); UI.lang = 'de'; location.hash = '#/fn/fn.definite/de'; });
    await wait(500);
    const before = await p.evaluate(() => NoemaLang.feasibility(NoemaLangUI.UI.C, NoemaLangUI.UI.L, 'de', 'fn.definite').sentences);
    await p.click('.lj-askmore'); await wait(500);
    const lrec = await p.evaluate(() => NoemaLangUI.claude.getRec(Noema.account.id, 'lang-mini'));
    const tr = lrec?.tasks?.[0];
    ok(lrec?.origin === 'library' && tr?.kind === 'lang.refill' && tr.R.includes('de:Karotte') && !tr.R.includes('de:Kürbis') && await p.evaluate(() => location.hash) === '#/claude', `✨ Ask Claude for more sentences: a refill task with the known words (R = ${tr?.R?.length}); the queue page opens`);
    ok(await until(() => kv()['a:langcourse:lang-mini'], 10000), 'the refill queue of the library course is synced too');
    r = await tool('noema_lang_task', { course_id: 'lang-mini' });
    ok(/More sentences for/.test(r.text) && /curl -sSL -o course\.pack\.js "http:\/\/localhost:54341\/testfiles\/lang-mini\/course\.pack\.js"/.test(r.text) && /de:Zwiebel · Zwiebel/.test(r.text) && !/de:Kürbis ·/.test(r.text), 'the connector: the refill task with the library course file and exactly the known words');
    const sNew = { ...s1, id: `de.refill.definite.${tr.n}.001` }, sUnknown = { ...s2, id: `de.refill.definite.${tr.n}.002` };
    r = await tool('noema_lang_submit', { course_id: 'lang-mini', task_id: tr.id, result_json: JSON.stringify({ bank: [sNew, sUnknown] }) });
    ok(r.error && /does not know yet: de:Kürbis/.test(r.text), 'a sentence with an unknown word is refused');
    r = await tool('noema_lang_submit', { course_id: 'lang-mini', task_id: tr.id, result_json: JSON.stringify({ bank: [sNew] }) });
    ok(!r.error, 'with known words only it is accepted');
    await poll(); await wait(400);
    ok(await p.evaluate(id => NoemaLangUI.UI.C.lang.de.sentenceById[id] && NoemaLang.feasibility(NoemaLangUI.UI.C, NoemaLangUI.UI.L, 'de', 'fn.definite').sentences, sNew.id) === before + 1, `merged into the open course: usable sentences ${before} → ${before + 1}`);
    ok(await until(() => srv.state.files[`${uid}/langs/lang-mini.patch.json`]) && JSON.parse(srv.state.files[`${uid}/langs/lang-mini.patch.json`].data.toString()).langs.de.bank[0].id === sNew.id, 'kept in the learner’s private patch (device + cloud), not in the library course');
    await p.goto(BASE + '/?subject=lang:lang-mini#/'); await wait(1500);
    ok(await p.evaluate(id => !!NoemaLangUI.UI.C.lang.de.sentenceById[id], sNew.id), 'after a reload the patch is laid over the course again');

    console.log('— C5. phone width, the account course in the overlay');
    const ph = await ctx.newPage(); const E2 = []; ph.on('pageerror', x => E2.push(x.message));
    await ph.setViewportSize({ width: 390, height: 844 });
    await ph.goto(BASE + `/?subject=lang:${cid}#/claude`); await wait(1500);
    if (await ph.isVisible('.noema-inuse')) { await ph.click('.noema-inuse .btn'); await wait(1000); }
    ok(await ph.isVisible('h1:has-text("Through Claude")') && await ph.evaluate(() => document.documentElement.scrollWidth <= 392), '390 px: the queue page without sideways scrolling');
    await ph.evaluate(() => { Noema.openSubjectPicker(); }); await wait(500); await ph.click('.cm-mode:has-text("Languages")'); await wait(300);
    ok(await ph.isVisible(`.noema-chip[data-course="${cid}"]`) && /🔒/.test(await ph.locator(`.noema-chip[data-course="${cid}"]`).innerText()), 'the 🌍 overlay lists the account course (🔒 private) with the library courses');
    await ph.click('button:has-text("New language course")'); await ph.waitForSelector('.lj-box');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= 392 && document.querySelector('.lj-box').scrollWidth <= document.querySelector('.lj-box').clientWidth + 1), '390 px: the ✨ dialog fits');
    await ph.screenshot({ path: SHOTS + '/lj2_phone.png' });
    ok(!E.length && !E2.length, 'no page errors ' + JSON.stringify([...E, ...E2].slice(0, 3)));
  } finally { await browser.close(); srv.close(); fs.unlinkSync(fn); fs.rmSync(TF, { recursive: true, force: true }); }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
