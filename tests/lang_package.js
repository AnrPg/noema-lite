/* §10.2 — a whole language in one prompt: the language package (docs/LANGUAGES.md §10.2, docs/NEW_LANGUAGE_PLAYBOOK.md).
     A. the tools and langcore over the mini course: German taken out of the course, packaged (tools/lang_course.py package),
        put back (unpack --package), packaged again (the round trip); package refuses a folder the validator refuses;
        checkLangPackage refuses a wrong form, a missing facade, a new node, a language the course has, a missing profile;
        langApplyPackage adds the language (lanes, phenomena, the profile, seeAlso) without changing the course it was given;
        the plan of batches, the guide text, mkbrief.py --sandbox, the skill zip
     B. the connector (cloud/mcp/server.mjs, in-process): the guide, start (signed URL + curl) / finish (checked; the record
        a:langpack:<course>:<code>; every problem listed when refused) for a library course and for an account course
     C. the app (the frame) against the Supabase emulator: the added language after a reload (a row on the course home,
        ⫴ lanes, the Languages tab), on a second device (phone 390 px), ⋮ › German › Remove this language (record + file
        gone, every device), no page errors.
   Network: none — Supabase is the emulator on port 54351. Usage: node tests/lang_package.js <built-repo-dir> */
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
const MINI = path.join(ROOT, 'tests', 'fixtures', 'lang-mini'), LIBL = path.join(ROOT, 'library', 'languages');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const clone = o => JSON.parse(JSON.stringify(o));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 54351, BASE = `http://localhost:${PORT}`;
const py = (...a) => spawnSync('python3', a, { encoding: 'utf8' });
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-lp-'));
const readDir = root => N.readCourse(rel => { const p = path.join(root, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }, rel => { const p = path.join(root, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; });

(async () => {
  /* ======================= A. tools + langcore ======================= */
  console.log('— A. the package: tools and langcore');
  // the world next to the course (shared typology + catalogues), the mini course without German
  for (const d of ['_typology', '_phenomena']) { fs.mkdirSync(path.join(W, d)); for (const f of fs.readdirSync(path.join(LIBL, d))) fs.copyFileSync(path.join(LIBL, d, f), path.join(W, d, f)); }
  const B = path.join(W, 'lang-mini'); fs.cpSync(MINI, B, { recursive: true }); fs.rmSync(path.join(B, 'lang', 'de'), { recursive: true });
  const cj = JSON.parse(fs.readFileSync(path.join(B, 'course.json'), 'utf8')); cj.languages = cj.languages.filter(c => c !== 'de'); delete cj.defaults.depth.de;
  fs.writeFileSync(path.join(B, 'course.json'), JSON.stringify(cj, null, 1));
  const base = readDir(B);
  ok(base.course.languages.join() === 'ar,he,zh' && !base.langs.de && base.world?.phenomena?.ar?.length > 20 && base.world.languages.some(l => l.code === 'de'), 'the mini course without German (the world next to it: typology, catalogues)');
  const courseFile = path.join(W, 'course.json'); fs.writeFileSync(courseFile, JSON.stringify(base));
  // package German from the full mini course
  const pkgFile = path.join(W, 'de.langpack.json');
  let r = py(path.join(ROOT, 'tools/lang_course.py'), 'package', MINI, 'de', '-o', pkgFile);
  const pkg = r.status === 0 ? JSON.parse(fs.readFileSync(pkgFile, 'utf8')) : null;
  ok(!!pkg && /✅ .*German \(de\) for lang-mini — 12 words in 4 nodes, 3 grammar pages, 7 sentences/.test(r.stdout), 'lang_course.py package: ' + (r.stdout.trim() || r.stderr.trim()).split('\n').pop());
  ok(pkg?.format === 'noema.langpack/v1' && pkg.course === 'lang-mini' && pkg.code === 'de' && pkg.name === 'German' && pkg.checks.validator.errors === 0 && pkg.checks.validator.strict && pkg.phenomena?.lang === 'de' && pkg.checks.refcheck.offline && Object.keys(pkg.lexicon).sort().join() === 'core.1,fd.01,veg.1,veg.2' && pkg.bank.length === 7 && !pkg.typology,
    'the package: format, course, code, name, the checks (validator --strict, refcheck from the cache, phenomena), lexicon per node, grammar, bank, the catalogue (no profile: the library has one)');
  // put it back: unpack the course without German + the package → a folder that validates --strict, packaged again = the same
  r = py(path.join(ROOT, 'tools/lang_course.py'), 'unpack', courseFile, path.join(W, 'out'), '--package', pkgFile);
  const O = path.join(W, 'out', 'lang-mini');
  ok(r.status === 0 && JSON.parse(fs.readFileSync(path.join(O, 'course.json'), 'utf8')).languages.includes('de') && fs.existsSync(path.join(O, 'lang/de/lexicon/veg.1.json')) && fs.existsSync(path.join(W, 'out/_phenomena/de.json')) && fs.existsSync(path.join(W, 'out/_typology/features.json')), 'unpack --package: the course as a folder with German added (files, course.json, its catalogue, the shared typology)');
  r = py(path.join(ROOT, 'tools/validate_lang.py'), O, '--strict', '--lang', 'de', '--alone');
  ok(/✅ valid/.test(r.stdout), 'the folder validates --strict for German: ' + r.stdout.trim().split('\n').pop());
  r = py(path.join(ROOT, 'tools/lang_course.py'), 'package', O, 'de', '-o', path.join(W, 'de2.json'));
  const pkg2 = r.status === 0 ? JSON.parse(fs.readFileSync(path.join(W, 'de2.json'), 'utf8')) : {};
  ok(['language', 'lexicon', 'grammar', 'bank', 'phenomena'].every(k => JSON.stringify(pkg2[k]) === JSON.stringify(pkg[k])), 'the round trip: package → unpack --package → package gives the same language');
  // the tool refuses what the validator refuses
  const lx = JSON.parse(fs.readFileSync(path.join(O, 'lang/de/lexicon/veg.1.json'), 'utf8')); lx.lexemes[0].forms[Object.keys(lx.lexemes[0].forms)[0]] = 'Karrrotte';
  fs.writeFileSync(path.join(O, 'lang/de/lexicon/veg.1.json'), JSON.stringify(lx));
  r = py(path.join(ROOT, 'tools/lang_course.py'), 'package', O, 'de', '-o', path.join(W, 'bad.json'));
  ok(r.status !== 0 && /not packaged: validate_lang\.py --strict --lang de has \d+ error/.test(r.stdout + r.stderr) && !fs.existsSync(path.join(W, 'bad.json')), 'package refuses while validate_lang.py --strict has errors');
  r = py(path.join(ROOT, 'tools/lang_course.py'), 'plan', O, 'de');
  ok(/^F1 +foundations +fd\.00,fd\.01/m.test(r.stdout) && /^V1 +field +veg\.1/m.test(r.stdout) && /^K1 +core +core\.1/m.test(r.stdout), 'lang_course.py plan: the batches of this course for German (F1 fd.00,fd.01 · V1 veg.1 · K1 core.1)');

  // langcore: the same check as the app and the connector
  ok(!N.checkLangPackage(base, pkg).length, 'checkLangPackage: the German package fits the course without German');
  const bad1 = clone(pkg), s0 = bad1.bank.find(s => s.tokens.some(k => k.l === 'de:essen')), ti = s0.tokens.findIndex(k => k.l === 'de:essen');
  s0.tokens[ti].t = 'esst'; s0.text = N.joinTokens(s0.tokens, 'space');
  let e = N.checkLangPackage(base, bad1);
  ok(e.some(x => /“esst” is not the V;PRS;3;SG form of de:essen/.test(x)), 'a wrong form in a sentence is refused: ' + (e.find(x => /esst/.test(x)) || e[0] || '').slice(0, 120));
  const bad2 = clone(pkg); delete bad2.lexicon['veg.1'].lexemes[0].features.declension;
  e = N.checkLangPackage(base, bad2);
  ok(e.some(x => /does not state its .*declension.*D14/.test(x)), 'a missing parameter of a word\'s facade is refused (D14)');
  const bad3 = clone(pkg); bad3.lexicon['veg.9'] = clone(pkg.lexicon['veg.2']);
  e = N.checkLangPackage(base, bad3);
  ok(e.some(x => /lexicon\/veg\.9: the course has no node “veg\.9” — a package fills the course's nodes, it never adds one/.test(x)), 'a new node is refused: a package fills the course\'s nodes');
  const bad4 = clone(pkg); delete bad4.lexicon['veg.2'];
  ok(N.checkLangPackage(base, bad4).some(x => /node veg\.2 .* has no words in de/.test(x)), 'a node of the course left unwritten is refused (only draft nodes may wait)');
  const bad5 = clone(pkg); bad5.grammar['fn.unknown'] = clone(pkg.grammar['fn.definite']);
  ok(N.checkLangPackage(base, bad5).some(x => /the course has no function “fn\.unknown”/.test(x)), 'a new grammar function is refused');
  const full = readDir(MINI);
  ok(N.checkLangPackage(full, pkg).some(x => /de is already a language of/.test(x)) && N.checkLangPackage(base, { ...pkg, course: 'other' }).some(x => /was made for “other”, not for this course “lang-mini”/.test(x)), 'a language the course has, a package for another course: refused');
  ok(N.checkLangPackage(base, { ...pkg, checks: {} }).some(x => /lang_course\.py package/.test(x)), 'a package that did not come from lang_course.py package (no validator check) is refused');
  const noProf = clone(base); noProf.world.languages = noProf.world.languages.filter(l => l.code !== 'de');
  ok(N.checkLangPackage(noProf, pkg).some(x => /the library has no profile for de/.test(x)), 'a language without a profile in the library must bring it (D16)');
  const prof = base.world.languages.find(l => l.code === 'de'), withProf = { ...clone(pkg), typology: clone(prof) };
  ok(!N.checkLangPackage(noProf, withProf).length, '… with its profile it passes');
  const phenBad = clone(pkg); phenBad.phenomena.phenomena[0].typology = [{ feature: 'no.such.feature', value: 'x' }];
  ok(N.checkLangPackage(base, phenBad).some(x => /unknown feature “no\.such\.feature”/.test(x)), 'the catalogue of phenomena is checked against the shared typology');
  // seeAlso additions to the other languages' pages
  const fnA = Object.keys(base.langs.ar.grammar).find(f => pkg.grammar[f]);
  const withSee = { ...clone(withProf), seeAlso: { ar: { [fnA]: [{ lang: 'de', fn: fnA, note: 'German marks it with the article' }] } } };
  ok(!N.checkLangPackage(noProf, withSee).length && N.checkLangPackage(noProf, { ...withSee, seeAlso: { xx: { [fnA]: [] } } }).some(x => /seeAlso\.xx: not another language/.test(x)), 'seeAlso additions to the other languages\' pages are checked');
  // apply
  const before = JSON.stringify(noProf);
  const added = N.langApplyPackage(noProf, withSee);
  ok(JSON.stringify(noProf) === before, 'langApplyPackage does not change the course it was given (the library pack stays as the website sent it)');
  ok(added.course.languages.join() === 'ar,he,zh,de' && added.course.added.de.name === 'German' && added.course.defaults.depth.de === 3 && added.world.phenomena.de.length === pkg.phenomena.phenomena.length && added.world.languages.some(l => l.code === 'de')
    && added.langs.ar.grammar[fnA].seeAlso.some(x => x.lang === 'de'), 'the language is added: course.languages, added, depth, langs.de, world.phenomena.de (trimmed), the profile, seeAlso on the Arabic page');
  ok(N.langApplyPackage(added, withSee) === added || N.langApplyPackage(added, withSee).course.languages.filter(c => c === 'de').length === 1, 'applying it twice keeps one German');
  const C = N.course(added), lanes = N.parallelLanes(C, C.languages);
  ok(Object.keys(C.lang.de.lex).length === 12 && C.lang.de.sentences.length === 7 && lanes.rows.some(rw => rw.cells.de) && N.planSession(C, N.newLearner(C), { day: 0, languages: ['de'] }).steps[0]?.node === 'fd.00', 'the runtime reads it: 12 German words, 7 sentences, a German lane in ⫴, a new learner starts with fd.00');
  // the plan and the guide
  const plan = N.langPackagePlan(base, 'de', 'fusional');
  ok(plan.batches.map(b => b.id + ':' + b.nodes.join(',')).join(' ') === 'F1:fd.00,fd.01 F2:fd.01x V1:veg.1 V2:veg.2 K1:core.1', 'langPackagePlan: ' + plan.batches.map(b => b.id + ':' + b.nodes.join(',')).join(' '));
  const g = N.langPackageGuide(base, 'de', { name: 'German', typ: 'fusional', toolkitUrl: 'https://x/downloads/noema-language-builder.zip', files: [{ url: 'https://x/c.pack.js', name: 'course.pack.js' }] });
  ok(/# Add German \(de\) to “Mini course/.test(g) && /cannot be done|CANNOT be done/.test(g) && /sub-agent/.test(g) && /work\/de-progress\.json/.test(g) && /mkbrief\.py foundations --course-dir work\/lang\/lang-mini --lang de --batch F1 --nodes fd\.00,fd\.01 --sandbox/.test(g)
    && /noema_lang_package_start/.test(g) && /noema_lang_package_finish/.test(g) && /lang_course\.py package work\/lang\/lang-mini de/.test(g) && /Audit what was just written/.test(g) && /native-check/.test(g) && /curl -sSL -o work\/course\.pack\.js "https:\/\/x\/c\.pack\.js"/.test(g),
    'the guide: honest about scale, sub-agents + audit turns, the progress file, the briefs with this course\'s nodes, checks, package, upload, report');
  // mkbrief --sandbox: the repository's paths become the sandbox's
  r = py(path.join(ROOT, 'tools/lang_sources/mkbrief.py'), 'foundations', '--course-dir', O, '--lang', 'de', '--batch', 'F1', '--nodes', 'fd.00,fd.01', '--sandbox');
  ok(r.status === 0 && /WORK FOLDER \(work only here\):/.test(r.stdout) && /lang_readback\.js .*lang-mini --lang de/.test(r.stdout) && /lang_phenomena\.py --root /.test(r.stdout) && !/python3 tools\//.test(r.stdout) && !/library\/languages\/lang-mini/.test(r.stdout) && !/`docs\/LANGUAGE_RULES/.test(r.stdout), 'mkbrief.py --course-dir … --sandbox: the brief with the sandbox\'s paths');
  r = py(path.join(ROOT, 'tools/lang_sources/mkbrief.py'), 'foundations', '--course', 'polyglot-semitic-zh-de', '--lang', 'de', '--batch', 'F1', '--nodes', 'fd.00');
  ok(r.status === 0 && /python3 tools\/validate_lang\.py library\/languages\/polyglot-semitic-zh-de/.test(r.stdout), 'mkbrief.py in the repository is unchanged');
  // the read-back tool (the skill runs it in its sandbox)
  r = spawnSync('node', [path.join(ROOT, 'tools/lang_readback.js'), path.join(W, 'out', 'lang-mini'), '--lang', 'ar', '--package', pkgFile, '--course', courseFile], { encoding: 'utf8' });
  ok(r.status === 0 && /the package de for lang-mini: accepted/.test(r.stdout) && /ar: \d+ sentences tokenize back/.test(r.stdout), 'lang_readback.js --package: ' + (r.stdout.match(/the package .*/) || [r.stdout.slice(-200)])[0]);
  // the skill zip and the toolkit
  const zips = path.join(ROOT, 'dist', 'site', 'downloads');
  const ls = z => { try { return execFileSync('python3', ['-c', 'import zipfile,sys; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', z]).toString().split('\n'); } catch (x) { return []; } };
  const zl = ls(path.join(zips, 'noema-language-builder.zip')), tk = ls(path.join(zips, 'noema-pack-builder.zip'));
  ok(['SKILL.md', 'scripts/mkbrief.py', 'scripts/lang_course.py', 'scripts/langcore.js', 'scripts/lang_readback.js', 'scripts/lang_script.py', 'scripts/lang_phenomena.py', 'references/NEW_LANGUAGE_PLAYBOOK.md', 'references/LANGUAGE_RULES.md', 'references/AGENT_BRIEF.md', 'references/briefs/foundations.txt', 'schemas/noema.langpack.v1.schema.json', 'library/languages/_typology/features.json'].every(f => zl.includes('noema-language-builder/' + f)),
    `the skill zip noema-language-builder.zip (${zl.length - 1} files): SKILL.md, the scripts, the playbook, the briefs, the schema, the shared typology`);
  ok(['LANGUAGE_BUILDER.md', 'scripts/mkbrief.py', 'scripts/lang_script.py', 'references/briefs/core.txt'].every(f => tk.includes('noema-pack-builder/' + f)), 'the noema-pack-builder toolkit carries it too (LANGUAGE_BUILDER.md + its scripts and briefs)');

  /* ======================= B + C. the connector and the app ======================= */
  const { chromium } = require(process.env.PW || 'playwright');
  const { start } = require('./mock_supabase');
  const TF = path.join(ROOT, 'dist/site/testfiles/lang-mini'); fs.mkdirSync(TF, { recursive: true });
  fs.writeFileSync(path.join(TF, 'course.pack.js'), `(window.NOEMA_LANGPACKS = window.NOEMA_LANGPACKS || {})["lang-mini"] = ${JSON.stringify(base).replace(/<\//g, '<\\/')};\n`);
  const libMeta = { id: 'lang-mini', title: base.course.title, emoji: '🌍', languages: base.course.languages, explainLang: 'en', path: 'testfiles/lang-mini/course.pack.js', words: {} };
  const regTxt = fs.readFileSync(path.join(ROOT, 'dist/site/library/registry.js'), 'utf8'); const w0 = {}; new Function('window', regTxt)(w0);
  const REG = { ...w0.NOEMA_REGISTRY, languages: [libMeta] };
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', onboarding: false, autoBackupMinutes: 0 };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [], languages: [{ id: 'lang-mini', title: libMeta.title, languages: libMeta.languages, path: libMeta.path }] };
  const fn = path.join(os.tmpdir(), `noema-mcp-lp-${process.pid}.mjs`);
  fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = ${JSON.stringify({ workflow: 'SKILL', content: 'C', visual: 'V', languages: 'RULES' })};\nglobalThis.window = globalThis;\n` + ['engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js', 'engine/langcore.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
  const { default: handler } = await import(fn);
  let T = null, rpc = 0;
  const call = async (method, params) => (await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method, params }) }))).json();
  const tool = async (name, args = {}) => { const j = await call('tools/call', { name, arguments: args }); return { text: j.result?.content?.[0]?.text || j.error?.message || '', error: !!j.result?.isError || !!j.error }; };
  const browser = await chromium.launch();
  try {
    // the learner's cloud account (signed up through the API; the app gets the session on its devices)
    const su = await (await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'poly@example.com', password: 'secret123', data: { name: 'Poly' } }) })).json();
    T = su.access_token; const uid = su.user.id, ACC = 'u_' + uid;
    const kv = () => srv.state.kv[uid] || {};
    const api = (p, o = {}) => fetch(BASE + p, { ...o, headers: { apikey: 'sb_publishable_test', authorization: 'Bearer ' + T, ...(o.headers || {}) } });

    console.log('— B. the connector: guide, start, finish');
    const tl = await call('tools/list', {});
    ok(['noema_language_package_guide', 'noema_lang_package_start', 'noema_lang_package_finish'].every(n => tl.result.tools.some(t => t.name === n)), 'tools/list offers noema_language_package_guide, noema_lang_package_start, noema_lang_package_finish');
    const pl = await call('prompts/list', {}), pg = await call('prompts/get', { name: 'add_language', arguments: { language: 'German', course: 'lang-mini' } });
    ok(pl.result.prompts.some(p => p.name === 'add_language' && p.title === 'Add a language to my course') && /noema_language_package_guide/.test(pg.result?.messages?.[0]?.content?.text || '') && /German/.test(pg.result.messages[0].content.text), 'the prompt “Add a language to my course” starts it from one sentence');
    const ini = await call('initialize', { protocolVersion: '2025-06-18' });
    ok(/noema_language_package_guide/.test(ini.result.instructions), 'the server instructions name the way');
    r = await tool('noema_language_package_guide', { course_id: 'lang-mini', language: 'German' });
    ok(!r.error && /# Add German \(de\) to “Mini course/.test(r.text) && /F1\. |Foundations F1: fd\.00, fd\.01/.test(r.text) && r.text.includes(`${BASE}/downloads/noema-language-builder.zip`) && r.text.includes(`curl -sSL -o work/course.pack.js "${BASE}/testfiles/lang-mini/course.pack.js"`) && /noema_lang_package_start/.test(r.text), 'the guide for German in this course: the batches with its node ids, the toolkit and course links, the upload');
    r = await tool('noema_language_package_guide', { course_id: 'lang-mini', language: 'Arabic' });
    ok(r.error && /already a language/.test(r.text), 'a language the course has: nothing to add');
    r = await tool('noema_language_package_guide', { course_id: 'nope', language: 'fa' });
    ok(r.error && /No language course “nope”/.test(r.text) && /lang-mini/.test(r.text), 'an unknown course: the courses are listed');
    r = await tool('noema_lang_package_finish', { course_id: 'lang-mini', language: 'de' });
    ok(r.error && /No uploaded package/.test(r.text), 'finish before the upload: run the curl command first');
    r = await tool('noema_lang_package_start', { course_id: 'lang-mini', language: 'de' });
    const up = (r.text.match(/--data-binary @work\/de\.langpack\.json "([^"]+)"/) || [])[1];
    ok(!r.error && !!up && /x-upsert: true/.test(r.text) && up.includes(`/noema-private/${uid}/langs/lang-mini.lang-de.json`) && !/secret|service_role/i.test(r.text), 'start: a signed URL into the learner\'s own storage langs/lang-mini.lang-de.json and the exact curl command (no secret)');
    const put = body => fetch(up, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-upsert': 'true', apikey: 'sb_publishable_test' }, body: JSON.stringify(body) });
    await put(bad2);
    r = await tool('noema_lang_package_finish', { course_id: 'lang-mini', language: 'de' });
    ok(r.error && /problem\(s\) — it is NOT added/.test(r.text) && /declension/.test(r.text) && !kv()['a:langpack:lang-mini:de'], 'finish refuses a wrong package and lists every problem; nothing is recorded');
    await put(pkg);
    r = await tool('noema_lang_package_finish', { course_id: 'lang-mini', language: 'de' });
    const rec = kv()['a:langpack:lang-mini:de'] && JSON.parse(kv()['a:langpack:lang-mini:de'].value);
    ok(!r.error && /✅ German \(de\) is in the learner's noema-lite account/.test(r.text) && /12 words/.test(r.text) && rec?.code === 'de' && rec.path === 'langs/lang-mini.lang-de.json' && rec.size > 1000 && rec.checks?.validator?.errors === 0 && rec.counts.sentences === 7 && !!rec.at, 'finish accepts it and records a:langpack:lang-mini:de {code, name, path, size, checks, counts, at}');
    // an account course (the learner's own, made through Claude)
    const made = N.langNewCourse({ title: 'My three', languages: ['ar', 'he', 'zh'], library: [base] });
    N.applyLangAnswer(made.record, made.data, N.langNext(made.record), { fields: base.fields, nodes: base.nodes, functions: base.functions, frames: base.frames, typology: base.typology });
    await api('/rest/v1/noema_kv?on_conflict=user_id,key', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ user_id: uid, key: 'a:langcourse:' + made.record.id, value: JSON.stringify(made.record), updated_at: new Date().toISOString() }]) });
    await api(`/storage/v1/object/noema-private/${uid}/langs/${made.record.id}.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(made.data) });
    r = await tool('noema_language_package_guide', { course_id: 'My three', language: 'de' });
    ok(!r.error && /curl -sSL -o work\/course\.json "http:\/\/localhost:54351\/storage\/v1\/object\/sign\/noema-private\//.test(r.text), 'the guide for the learner\'s own course: a signed link to its course file');
    r = await tool('noema_lang_package_start', { course_id: made.record.id, language: 'de' });
    const up2 = (r.text.match(/"(http[^"]+lang-de\.json[^"]*)"/) || [])[1];
    await fetch(up2, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...pkg, course: made.record.id }) });
    r = await tool('noema_lang_package_finish', { course_id: made.record.id, language: 'de' });
    ok(!r.error && !!kv()[`a:langpack:${made.record.id}:de`], 'a package for the learner\'s own course is checked against its content and recorded' + (r.error ? ': ' + r.text.slice(0, 300) : ''));

    console.log('— C. the app: the language added on every device, removed');
    const device = async (vp) => {
      const ctx = await browser.newContext({ viewport: vp }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, x => x.fulfill({ status: 200, body: '' }));
      await ctx.route(BASE + '/library/registry.js', x => x.fulfill({ status: 200, contentType: 'application/javascript', body: `window.NOEMA_REGISTRY = ${JSON.stringify(REG)};` }));
      const sess = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'poly@example.com', password: 'secret123' }) })).json());
      await ctx.addInitScript(([s, acc]) => { if (location.protocol === 'http:' && !localStorage.getItem('noema1:cloud:session')) { localStorage.setItem('noema1:cloud:session', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, user: s.user })); localStorage.setItem(`noema1:${acc}:a:settings`, JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); } }, [sess, ACC]);
      const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', x => E.push(x.message)); p.on('dialog', d => d.accept());
      if (process.env.DEBUG) p.on('console', m => console.log('   [console]', m.text().slice(0, 300)));
      return { ctx, p, E };
    };
    const useHere = async p => { if (await p.isVisible('.noema-inuse').catch(() => false)) { await p.click('.noema-inuse button:has-text("Use here")').catch(() => { }); await wait(1000); } };
    const open = async p => { await p.goto('about:blank'); await p.goto(`${BASE}/?account=${ACC}#/lang/lang-mini`); /* a real load, not a hash change: the boot pulls */ await wait(800); await useHere(p); return p.waitForSelector('.lx-host .lx-fhome', { timeout: 30000 }).then(() => true).catch(() => false); };
    const rows = p => p.$$eval('.lx-fhome .ns-item[data-act^="lang-"]', l => l.map(x => x.dataset.act.slice(5)));
    const noHScroll = p => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

    // device 1 (desktop): the record arrived with the sync; the course opens with German
    const D1 = await device({ width: 1280, height: 900 });
    ok(await open(D1.p), 'device 1 opens the library course inside the frame');
    ok((await rows(D1.p)).join() === 'ar,he,zh,de', 'the added language is a row on the course home: ' + (await rows(D1.p)).join(', '));
    ok(await D1.p.evaluate(() => NoemaLangUI.UI.C.languages.join() === 'ar,he,zh,de' && NoemaLangUI.UI.C.data.course.added.de.name === 'German' && Object.keys(NoemaLangUI.UI.C.lang.de.lex).length === 12 && NoemaLangUI.UI.L.settings.languages.includes('de')), 'the course holds German (12 words) and it is one of the learner\'s active languages');
    ok(await D1.p.evaluate(() => (NOEMA_LANGPACKS['lang-mini'].course.languages || []).join() === 'ar,he,zh'), 'the library course itself is unchanged (the package is laid over it)');
    // the learner had chosen languages before: a reload keeps German active once and does not add it twice
    await D1.p.evaluate(() => { NoemaLangUI.save(true); }); await D1.p.reload(); await wait(800); await useHere(D1.p); await D1.p.waitForSelector('.lx-host .lx-fhome', { timeout: 30000 });
    ok((await rows(D1.p)).join() === 'ar,he,zh,de' && await D1.p.evaluate(() => NoemaLangUI.UI.L.settings.languages.filter(c => c === 'de').length === 1 && (NoemaLangUI.UI.prefs.addedSeen || []).includes('de')), 'after a reload: still there, active once');
    ok(await D1.p.evaluate(async () => !!(await Noema.idb.get('packs', `langpack|${Noema.account.id}|lang-mini:de`))?.pkg), 'the package is cached on the device (IndexedDB)');
    await D1.p.evaluate(() => { location.hash = '#/lang/lang-mini/lanes'; }); await D1.p.waitForSelector('.lx-lanes2', { timeout: 20000 });
    ok(await D1.p.$$eval('.lx-lanes2 .lx-lflag', l => l.map(x => x.dataset.lang).join()) === 'ar,he,zh,de' && await D1.p.locator('.lx-lanes2 .lx-lnode[data-lang=de]').count() > 0, '⫴ parallel lanes: a German lane with its steps');
    await D1.p.evaluate(() => { location.hash = '#/lang'; }); await wait(600);
    ok(/🇩🇪/.test(await D1.p.$eval('.ns-langitem[data-course="lang-mini"]', b => b.innerText).catch(() => '')), 'the Languages tab lists the course with German');
    await D1.p.screenshot({ path: SHOTS + '/lp1_desktop.png' });

    // device 2 (phone): German comes with the sync, from the cloud copy
    const D2 = await device({ width: 390, height: 844 });
    ok(await open(D2.p) && (await rows(D2.p)).join() === 'ar,he,zh,de', 'device 2 (phone) has German too: ' + (await rows(D2.p)).join(', '));
    ok(await noHScroll(D2.p), '390 px: nothing scrolls sideways');
    await D2.p.evaluate(() => { location.hash = '#/lang/lang-mini/settings'; }); await wait(800);
    ok(await D2.p.isVisible('.lj-addedrow[data-lang=de] .lj-remove'), 'the course settings list the added language with “Remove this language”');
    await D2.p.evaluate(() => { location.hash = '#/lang/lang-mini'; }); await D2.p.waitForSelector('.lx-host .lx-fhome');
    await D2.p.screenshot({ path: SHOTS + '/lp2_phone.png' });
    // ⋮ › German › Remove this language
    await D2.p.click('#ns-top .ns-menubtn'); await D2.p.waitForSelector('.ns-pop', { timeout: 5000 });
    const items = await D2.p.$$eval('.ns-pop button', l => l.map(x => x.textContent.trim()));
    ok(items.some(t => /German/.test(t) && /Added through Claude/.test(t)), '⋮ lists the added language: ' + items.filter(t => /German/.test(t)).join(' | '));
    await D2.p.locator('.ns-pop button', { hasText: 'Added through Claude' }).first().click(); await wait(400);
    ok(await D2.p.isVisible('.ns-item[data-act="remove-de"]'), '… its sheet offers “Remove this language”');
    await D2.p.click('.ns-item[data-act="remove-de"]');
    ok(await until(() => !kv()['a:langpack:lang-mini:de'] && !srv.state.files[`${uid}/langs/lang-mini.lang-de.json`], 15000), 'removed: the record and the file are gone from the account');
    await wait(1500); await useHere(D2.p); await D2.p.waitForSelector('.lx-host .lx-fhome', { timeout: 30000 }).catch(() => { });
    ok((await rows(D2.p)).join() === 'ar,he,zh' && await D2.p.evaluate(() => !NoemaLangUI.UI.C.lang.de), 'device 2 reopens the course without German');
    // device 1 after a reload: gone there too
    ok(await open(D1.p) && (await rows(D1.p)).join() === 'ar,he,zh', 'device 1 after a reload: German is gone there too');
    ok(!D1.E.length && !D2.E.length, 'no page errors ' + JSON.stringify([...D1.E, ...D2.E].slice(0, 3)));
  } finally { await browser.close(); srv.close(); fs.unlinkSync(fn); fs.rmSync(TF, { recursive: true, force: true }); fs.rmSync(W, { recursive: true, force: true }); }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
