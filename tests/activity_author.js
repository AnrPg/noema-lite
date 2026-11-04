/* The activity author (engine/activity_author.js, engine/schemaform.js, docs/activities-dev/authoring_ui.md).
   Node (always): the sim-spec schema (tools/schemas/noema.sim-spec.v1.schema.json) accepts the reference specs and never refuses what
   the validators accept (the parity cases of tests/activities.js), and refuses the structural ones; the registry schema accepts the
   reference entries; the form generator reaches every value of the reference specs with a typed schema (no raw-data fallback);
   the documents round-trip losslessly through files, zip and import; check() finds no problem in the references and puts a bad
   formula at its field; the exported folder passes activity_lint.py; the words: en, el, ru, fr have the same keys and placeholders,
   every schema title and netlist field has a label; engine/activity_author_schemas.js is the copy of tools/schemas.
   Browser (with --browser; BROWSERS=chromium,firefox,webkit): the page in the real app (index.html, the route as the integrator
   mounts it): rc-lowpass built from scratch through the form equals the reference; a bad formula shows its error at its field;
   the preview follows a changed start value; the .zip download passes activity_lint.py; undo / redo; 360 px without horizontal
   scroll; dark mode.
   Usage: node tests/activity_author.js [--browser] [--write-schemas]
   (browser: NODE_PATH=$(npm root -g), PLAYWRIGHT_BROWSERS_PATH=…; run under flock on a shared machine) */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); return c; };
const rj = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const SCH = f => rj(path.join(ROOT, 'tools', 'schemas', f));
const SCHEMA_FILES = ['noema.sim-spec.v1.schema.json', 'noema.circuit.v1.schema.json', 'noema.activities.v1.schema.json'];

/* ---------- the embedded copy of the schemas (the page cannot fetch on file://) ---------- */
const EMBED = path.join(ROOT, 'engine', 'activity_author_schemas.js');
function embedText() {
  const all = Object.fromEntries(SCHEMA_FILES.map(f => [f, SCH(f)]));
  return '/* noema-lite — the JSON Schemas of the activity author (engine/activity_author.js). GENERATED from tools/schemas/ by\n' +
    '   node tests/activity_author.js --write-schemas (tests/activity_author.js checks that it is up to date). Do not edit. */\n' +
    '(function (root) { root.NoemaActivitySchemas = ' + JSON.stringify(all) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n';
}
if (args.includes('--write-schemas')) { fs.writeFileSync(EMBED, embedText()); console.log('wrote ' + path.relative(ROOT, EMBED)); }

/* ---------- the modules, as the app loads them ---------- */
require(path.join(ROOT, 'engine', 'src', '35_simexpr.js'));
require(path.join(ROOT, 'engine', 'src', '36_engine_circuit.js'));
require(path.join(ROOT, 'engine', 'packcheck.js'));
const SF = require(path.join(ROOT, 'engine', 'schemaform.js'));
const STR = require(path.join(ROOT, 'engine', 'activity_author_i18n.js'));
require(EMBED);
const AA = require(path.join(ROOT, 'engine', 'activity_author.js'));
const P = globalThis.NoemaPackCheck;
const sim = SCH('noema.sim-spec.v1.schema.json'), regSchema = SCH('noema.activities.v1.schema.json');
const reg = SF.registry(SCHEMA_FILES.map(SCH));
AA.registry(SCHEMA_FILES.map(SCH));
const EX = path.join(ROOT, 'tools', 'activities_examples');
const refDoc = id => {
  const d = path.join(EX, id), item = rj(path.join(d, 'activity.json'));
  const strings = Object.fromEntries(fs.readdirSync(d).filter(f => /^strings\.[\w-]+\.json$/.test(f)).map(f => [f.split('.')[1], rj(path.join(d, f))]));
  return { item, spec: rj(path.join(d, 'spec.json')), strings };
};
const REFS = ['rc-lowpass', 'rc-transient', 'led-bench'];

console.log('— the schemas');
ok(fs.readFileSync(EMBED, 'utf8') === embedText(), 'engine/activity_author_schemas.js is the current copy of tools/schemas (node tests/activity_author.js --write-schemas)');
for (const id of REFS) { const e = SF.validate(reg, sim, refDoc(id).spec); ok(!e.length, `sim-spec schema accepts the reference ${id} ${e.length ? JSON.stringify(e.slice(0, 2)) : ''}`); }
for (const id of ['alias-lab', ...REFS]) { const it = rj(path.join(EX, id, 'activity.json')); const e = SF.validate(reg, regSchema, { format: 'noema.activities/v1', items: [it] }); ok(!e.length, `registry schema accepts the entry of ${id} ${e.length ? JSON.stringify(e.slice(0, 2)) : ''}`); }

// the parity cases of tests/activities.js (the spec part), on the spec alone: the schema never refuses what the validators accept,
// and refuses every structural problem (names, formulas, order and tables are the validators' own: checkSimSpec)
const rc = () => refDoc('rc-lowpass'), lb = () => refDoc('led-bench');
const cases = {
  'spec good': [rc, s => s, 'good'],
  'spec: no format': [rc, s => { s.format = 'x'; }, 'schema'],
  'spec: unknown field': [rc, s => { s.code = 'alert(1)'; }, 'schema'],
  'spec: unknown engine': [rc, s => { s.engine = 'warp@9'; }, 'schema'],
  'spec: model for formula@1': [rc, s => { s.model = { a: 1 }; }, 'schema'],
  'spec: outputs for formula@1': [rc, s => { s.outputs = [{ id: 'v', kind: 'series' }]; }, 'schema'],
  'spec: no params': [rc, s => { s.params = []; }, 'schema'],
  'spec: 25 params': [rc, s => { s.params = Array.from({ length: 25 }, (_, i) => ({ id: 'p' + i, kind: 'toggle', label: 'resistance' })); }, 'schema'],
  'spec: min > max': [rc, s => { Object.assign(s.params[0], { min: 5, max: 1 }); }, 'validator'],
  'spec: default out of range': [rc, s => { s.params[0].default = 1e9; }, 'validator'],
  'spec: log scale from 0': [rc, s => { s.params[1].min = 0; }, 'validator'],
  'spec: a reserved name': [rc, s => { s.params[0].id = 'constructor'; }, 'validator'],
  'spec: pi as a name': [rc, s => { s.consts.pi = 3; }, 'schema'],
  'spec: false as a name': [rc, s => { s.params[0].id = 'false'; }, 'schema'],
  'spec: true as the x var': [rc, s => { s.plots[0].x.var = 'true'; }, 'schema'],
  'spec: a name used twice': [rc, s => { s.derived.push({ id: 'fc', expr: '1' }); }, 'validator'],
  'spec: unknown variable': [rc, s => { s.derived[0].expr = 'R * L'; }, 'validator'],
  'spec: not the language': [rc, s => { s.readouts[0].expr = 'Math.sqrt(R)'; }, 'validator'],
  'spec: a later derived value used early': [rc, s => { s.derived[0].expr = 'fc * 2'; }, 'validator'],
  'spec: bad choice': [rc, s => { s.params.push({ id: 'm', kind: 'choice', label: 'gain', options: [{ value: 1, label: 'gain' }, { value: 1, label: 'time' }], default: 3 }); }, 'validator'],
  'spec: a good choice and toggle': [rc, s => { s.params.push({ id: 'm', kind: 'choice', label: 'gain', options: [{ value: 1, label: 'gain' }, { value: 2, label: 'time' }], default: 2 }, { id: 'sh', kind: 'toggle', label: 'time', default: true }); }, 'good'],
  'spec: label not in the tables': [rc, s => { s.params[0].label = 'nope'; }, 'validator'],
  'spec: 7 plots': [rc, s => { s.plots = Array(7).fill(s.plots[0]); }, 'schema'],
  'spec: 2001 points': [rc, s => { s.plots[0].points = 2001; }, 'schema'],
  'spec: x var clashes': [rc, s => { s.plots[0].x.var = 'R'; }, 'validator'],
  'spec: series plot without an engine series': [rc, s => { s.plots[0] = { kind: 'series', x: { series: 't' }, series: [{ y: 'v' }] }; }, 'validator'],
  'spec: bad axis limit expression': [rc, s => { s.plots[1].x.max = '5 * taux'; }, 'validator'],
  'spec: y min above max': [rc, s => { Object.assign(s.plots[0].y, { min: 5, max: -60 }); }, 'validator'],
  'spec: bad mark': [rc, s => { s.plots[0].marks.push({ axis: 'z', expr: 'fc' }); }, 'schema'],
  'spec: unit too long': [rc, s => { s.params[0].unit = 'x'.repeat(17); }, 'schema'],
  'spec: not an object': [rc, () => [1], 'schema'],
  'circuit good': [lb, s => s, 'good'],
  'circuit: rc-transient (no bench)': [() => refDoc('rc-transient'), s => s, 'good'],
  'circuit: no model': [lb, s => { delete s.model; }, 'schema'],
  'circuit: a bad netlist': [lb, s => { s.model.netlist.elements[2].value = -5; }, 'validator'],
  'circuit: an unknown model field': [lb, s => { s.model.spice = '.tran'; }, 'schema'],
  'circuit: a binding to no part': [lb, s => { s.model.bindings[0].element = 'SW9'; }, 'validator'],
  'circuit: a bad transient': [lb, s => { s.model.transient = { tEnd: 1, dt: 1e-9 }; }, 'validator'],
  'circuit: bad noise': [lb, s => { s.model.noise = { rel: 2 }; }, 'schema'],
  'circuit: a bad stat': [lb, s => { s.outputs = [{ id: 'v', kind: 'scalar', node: 'a', stat: 'median' }]; }, 'schema'],
  'circuit: a good scalar output in a readout': [lb, s => { s.outputs = [{ id: 'va', kind: 'scalar', node: 'a' }]; s.readouts = [{ label: 'tp3', expr: 'va', unit: 'V' }]; }, 'good'],
  'circuit: a bench on formula@1': [lb, s => { s.engine = 'formula@1'; delete s.model; }, 'schema'],
  'circuit: a bench without faults': [lb, s => { s.bench.faults = []; }, 'schema'],
  'circuit: an unknown fault kind': [lb, s => { s.bench.faults[0].apply[0].kind = 'melt'; }, 'schema'],
  'circuit: an unknown instrument': [lb, s => { s.bench.instruments.push({ kind: 'spectrum' }); }, 'schema'],
  'circuit: a scope and a logic analyser': [lb, s => { s.bench.instruments.push({ kind: 'scope', tEnd: 0.001, dt: 1e-5 }, { kind: 'logic', tEnd: 0.001, threshold: 2.5 }); }, 'good'],
  'circuit: a bad budget': [lb, s => { s.bench.budget = 0; }, 'schema'],
  'circuit: one option': [lb, s => { s.bench.diagnosis.options = s.bench.diagnosis.options.slice(0, 1); }, 'schema'],
  'circuit: an unknown bench field': [lb, s => { s.bench.answer = 'ledReversed'; }, 'schema'],
  'circuit: a fault no diagnosis names': [lb, s => { s.bench.diagnosis.options.pop(); }, 'validator'],
};
for (const [name, [mk, f, want]] of Object.entries(cases)) {
  const d = mk(); const r = f(d.spec); const spec = r === undefined ? d.spec : r;
  const se = SF.validate(reg, sim, spec), ve = P.checkSimSpec(spec, d.strings);
  if (want === 'good') ok(!se.length && !ve.length, `${name}: the schema and the validators accept it ${se.length ? JSON.stringify(se[0]) : ''}${ve[0] || ''}`);
  else ok(ve.length > 0 && (want === 'schema' ? se.length > 0 : true), `${name}: the validators refuse it${want === 'schema' ? ', and so does the schema' : ' (a rule beyond a schema)'} ${want === 'schema' && !se.length ? '— schema accepted it' : ''}`);
}

console.log('— the form generator (schema → fields)');
for (const id of REFS) {
  const spec = refDoc(id).spec, raw = [], seen = new Set();
  SF.walk(reg, sim, spec, (p, s, v, b) => { seen.add(JSON.stringify(p)); const t = SF.typeOf(reg, s, b); if (v !== null && typeof v !== 'object' && !t) raw.push(p.join('.')); });
  const leaves = []; (function lv(v, p) { if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) lv(x, p.concat(Array.isArray(v) ? +k : k)); } else leaves.push(p); })(spec, []);
  const missed = leaves.filter(p => !seen.has(JSON.stringify(p)));
  ok(!missed.length && !raw.length, `${id}: every one of ${leaves.length} values has a field with a typed schema ${missed.length ? 'missed ' + missed.slice(0, 3).map(p => p.join('.')) : ''}${raw.join(', ')}`);
}
{
  const ov = SF.objectView(reg, sim.$defs.param, { id: 'x', kind: 'choice', label: 'x' }, sim.$id);
  ok(ov.d && ov.d.prop === 'kind' && ov.d.opts.map(o => o.value).join() === 'slider,number,toggle,choice' && ov.view.order.includes('options') && !ov.view.order.includes('min'), 'a control: kind is the discriminator of its oneOf; a choice shows options, not min');
  const el = reg.resolve('noema.circuit.v1.schema.json#/$defs/element', sim.$id);
  const ev = SF.objectView(reg, el.schema, { id: 'D1', type: 'D', n: ['a', 'gnd'] }, el.base);
  ok(ev.d && ev.d.prop === 'type' && ev.view.order.includes('preset') && ev.view.required.includes('id'), 'a netlist element: allOf (common) + oneOf by type (a one-value enum) → a diode shows preset');
  ok(SF.branchIndex(reg, sim.$defs.numOrExpr, '5 * tau', sim.$id) === 1 && SF.branchIndex(reg, sim.$defs.numOrExpr, 10, sim.$id) === 0, 'a number-or-formula field picks the branch of its value');
  const sk = SF.skeleton(reg, sim);
  ok(sk.format === 'noema.sim-spec/v1' && Array.isArray(sk.params) && sk.params.length === 1 && sk.params[0].kind === 'slider', 'the skeleton of a spec: the format and one slider (what Add / New put in)');
  const sw = SF.skeleton(reg, el.schema, el.base);
  ok(sw && typeof sw.id === 'string' && Array.isArray(sw.n) && sw.type === 'R' && 'value' in sw, 'the skeleton of a netlist element is a resistor with its required fields');
  ok(JSON.stringify(SF.parsePath('spec.params[0].min: x', 'spec')) === '["params",0,"min"]' && JSON.stringify(SF.parsePath('spec.model.netlist.elements[2].value must be', 'spec')) === '["model","netlist","elements",2,"value"]', 'validator messages map to field paths');
}

console.log('— documents, files, zip');
(async () => {
  for (const id of REFS) {
    const d = refDoc(id), f = AA.files(d), back = AA.fromFiles(f);
    ok(JSON.stringify(back.spec) === JSON.stringify(d.spec) && JSON.stringify(back.strings) === JSON.stringify(d.strings) && back.item.id === d.item.id && back.item.entry === d.item.entry, `${id}: files → import gives the same spec, item and words`);
    const z = await AA.unzip(AA.zip(f));
    ok(JSON.stringify(z) === JSON.stringify(f), `${id}: zip → unzip gives the same files (${Object.keys(f).length})`);
    const pr = AA.check(d);
    ok(!pr.length, `${id}: check() finds no problem in the reference ${pr.length ? JSON.stringify(pr.slice(0, 2)) : ''}`);
  }
  { const d = refDoc('rc-lowpass'); d.spec.derived[1].expr = '1 / (2 * pi * tauu)'; const pr = AA.check(d);
    ok(pr.some(p => p.tab === 'spec' && JSON.stringify(p.path) === '["derived",1,"expr"]' && /tauu/.test(p.msg)), 'a bad formula is a problem at its own field (derived[1].expr) ' + JSON.stringify(pr[0])); }
  { const d = refDoc('rc-lowpass'); d.spec.params[0].min = 'x'; const pr = AA.check(d);
    ok(pr.some(p => p.tab === 'spec' && p.path.join('.').startsWith('params.0')), 'a wrong value is a problem at its control'); }
  { const d = refDoc('rc-lowpass'); delete d.strings.el.gain; const pr = AA.check(d);
    ok(pr.some(p => p.tab === 'strings' && p.key === 'gain'), 'a word missing in one table is a problem of the words tab, on its key'); }
  { const d = refDoc('rc-lowpass'); d.item.fallback.text = 'short'; const pr = AA.check(d);
    ok(pr.some(p => p.tab === 'item' && p.path.join('.') === 'fallback.text'), 'a short fallback text is a problem at its field'); }
  ok(JSON.stringify(AA.namesAt(refDoc('rc-lowpass').spec, ['derived', 1, 'expr'])) === JSON.stringify(['target', 'tol', 'R', 'C', 'tau']) && AA.namesAt(refDoc('rc-lowpass').spec, ['plots', 0, 'series', 0, 'expr']).includes('f'), 'the names a formula may use: the derived values above it; a plot line also gets its x');
  ok(JSON.stringify(AA.usedKeys(refDoc('rc-lowpass').spec)) === JSON.stringify(['title', 'intro', 'resistance', 'capacitance', 'fcLabel', 'tauLabel', 'errLabel', 'bodeTitle', 'frequency', 'gain', 'gainLine', 'fcMark', 'targetMark', 'minus3', 'stepTitle', 'time', 'voltage', 'tauMark']), 'the keys a spec names, in order');
  for (const t of AA.TYPES) { const b = t.blank(); const pr = AA.check(b).filter(p => !(p.tab === 'item' && p.path.join('.') === 'fallback.text')); ok(!pr.length && t.match(b), `the blank "${t.id}" has no problem but its fallback text ${pr.length ? JSON.stringify(pr.slice(0, 2)) : ''}`); }

  console.log('— the exported folder passes activity_lint.py');
  for (const id of ['rc-lowpass', 'led-bench']) {
    const d = refDoc(id), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-author-'));
    for (const [f, text] of Object.entries(AA.files(d))) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.writeFileSync(path.join(dir, 'media', 'media.json'), JSON.stringify({ items: [{ id: d.item.fallback.media, file: 'still.svg' }] }));
    fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ id: 'author-test', language: 'en' }));
    for (const l of Object.keys(d.strings).filter(l => l !== 'en')) fs.mkdirSync(path.join(dir, 'translations', l), { recursive: true });
    const r = cp.spawnSync('python3', [path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_lint.py'), dir], { encoding: 'utf8' });
    ok(r.status === 0 && /0 error/.test(r.stdout), `${id}: activity_lint.py accepts the exported folder ${r.status ? r.stdout.split('\n').filter(l => /ERROR/.test(l)).slice(0, 2).join(' | ') : ''}`);
  }

  console.log('— the words (en, el, ru, fr)');
  const keys = l => Object.keys(STR[l]).sort();
  for (const l of ['el', 'ru', 'fr']) { const a = keys('en'), b = keys(l); ok(JSON.stringify(a) === JSON.stringify(b), `${l} has every key of en (${a.length}) ${JSON.stringify(a.filter(k => !b.includes(k)).concat(b.filter(k => !a.includes(k))).slice(0, 5))}`); }
  const ph = s => [...new Set([...String(s).matchAll(/\{(\w+)(?:[,}])/g)].map(m => m[1]))].sort().join();
  const badPh = []; for (const l of ['el', 'ru', 'fr']) for (const k of keys('en')) if (ph(STR.en[k]) !== ph(STR[l][k])) badPh.push(l + ':' + k);
  ok(!badPh.length, 'every translation has the placeholders of English ' + badPh.slice(0, 5));
  const ruPl = []; for (const k of keys('ru')) if (/plural/.test(STR.ru[k]) && !/\bfew\b/.test(STR.ru[k])) ruPl.push(k);
  ok(!ruPl.length, 'Russian plurals have one / few / many / other ' + ruPl);
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'activity_author.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'engine', 'schemaform.js'), 'utf8');
  const used = [...new Set([...src.matchAll(/\b(?:TT|T)\('([\w.]+)'/g)].map(m => m[1]))].filter(k => !/\.$/.test(k));
  ok(used.every(k => k in STR.en), 'every word the code asks for is in the table ' + used.filter(k => !(k in STR.en)));
  const titles = new Set(); (function tw(o) { if (Array.isArray(o)) o.forEach(tw); else if (o && typeof o === 'object') { if (typeof o.title === 'string') titles.add(o.title); Object.values(o).forEach(tw); } })([sim, regSchema]);
  titles.delete('spec'); titles.delete('registry');
  const noLabel = [...titles].filter(t => !(('f.' + t) in STR.en));
  ok(!noLabel.length, `every schema title (${titles.size}) has a label (f.<title>) ` + noLabel.slice(0, 8));
  const props = new Set(); (function pw(o) { if (Array.isArray(o)) o.forEach(pw); else if (o && typeof o === 'object') { if (o.properties) Object.keys(o.properties).forEach(k => props.add(k)); Object.values(o).forEach(pw); } })(SCH('noema.circuit.v1.schema.json'));
  const noP = [...props].filter(k => !(('p.' + k) in STR.en));
  ok(!noP.length, `every netlist field (${props.size}) has a label (p.<property>) ` + noP.slice(0, 8));
  const enumOpts = []; (function ew(o) { if (Array.isArray(o)) o.forEach(ew); else if (o && typeof o === 'object') { if (Array.isArray(o.enum) && o.title) for (const v of o.enum) if (typeof v === 'string') enumOpts.push(o.title + '.' + v); Object.values(o).forEach(ew); } })(sim);
  ok(enumOpts.every(k => ('f.' + k) in STR.en), 'every option of a select of the spec has words ' + enumOpts.filter(k => !(('f.' + k) in STR.en)).slice(0, 6));
  ok(Object.keys(STR.en).every(k => k in STR.desc || /^(f|p|h|v|type)\./.test(k) || ['title'].includes(k)), 'the UI keys have a description for translators (the field labels are described by their group)');

  if (args.includes('--browser')) await browser();
  console.log(`\n${fails ? '✗' : '✓'} activity author: ${n - fails}/${n}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* =========================== browser (written for the batch runs; node tests/activity_author.js --browser) =========================== */
async function browser() {
  const pw = require(process.env.PW || 'playwright');
  const names = (process.env.BROWSERS || 'chromium,firefox,webkit').split(',');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(120); } return false; };
  const ref = refDoc('rc-lowpass');
  for (const name of names) {
    console.log(`— browser: ${name}`);
    const browser = await pw[name].launch(name === 'chromium' ? { channel: process.env.PW_CHANNEL || 'chromium' } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    const E = []; p.on('pageerror', e => E.push(e.message));
    // the app (any subject), then the author page as the integrator's route mounts it
    await p.goto('file://' + ROOT + '/index.html'); await wait(1500);
    ok(await until(() => p.evaluate(() => typeof ACT !== 'undefined' && ACT.engines().includes('formula@1'))), 'the app is up with its sim-spec@1 runtime');
    for (const f of ['engine/schemaform.js', 'engine/activity_author_i18n.js', 'engine/activity_author_schemas.js', 'engine/activity_author.js']) await p.addScriptTag({ path: path.join(ROOT, f) });
    await p.addStyleTag({ path: path.join(ROOT, 'engine', 'activity_author.css') });
    await p.evaluate(() => { const m = document.querySelector('main') || document.body.appendChild(document.createElement('main')); window.__aa = NoemaActivityAuthor.view(m, { confirm: () => true }); });
    ok(await p.locator('.aa h1').count() === 1 && await p.locator('.aa-pbox .sim').count() === 1, 'the page shows the form and the preview of the blank activity (the real runtime)');

    // build rc-lowpass from scratch through the form
    const fill = async (sel, v) => { const l = p.locator(sel).first(); await l.fill(String(v)); };
    let panel = 'item';
    const field = pth => `#aa-panel-${panel} [data-path='${JSON.stringify(pth)}']`;
    const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x);
    await p.click('[data-tab=item]');
    await fill(field(['id']), 'rc-lowpass');
    await fill(field(['fallback', 'text']), ref.item.fallback.text);
    await p.locator(field(['$add'])).first().selectOption('height').catch(() => { });   // (an optional field can be added …)
    await p.locator('#aa-panel-item [data-field=\'["height"]\'] .sf-ib').first().click().catch(() => { });   // … and removed again
    await fill(field(['credit']), ref.item.credit);
    await p.click('[data-tab=spec]'); panel = 'spec';
    const addField = async (pth, prop) => { await p.locator(field(pth.concat('$add'))).selectOption(prop); await wait(60); };
    const addItem = async pth => { await p.locator(`#aa-panel-spec [data-field='${JSON.stringify(pth)}'] > .sf-arrbox > .sf-add > .sf-addbtn`).click(); await wait(60); };
    await addField([], 'title'); await fill(field(['title']), 'title');
    await addField([], 'intro'); await fill(field(['intro']), 'intro');
    await addField([], 'consts');
    for (const [k, v] of Object.entries(ref.spec.consts)) { await p.locator(`#aa-panel-spec [data-field='["consts"]'] .sf-addbtn`).click(); await wait(60); const last = p.locator('#aa-panel-spec [data-field=\'["consts"]\'] .sf-mrow').last(); await last.locator('.sf-key').fill(k); await last.locator('.sf-key').press('Tab'); await wait(60); await p.locator(field(['consts', k])).fill(String(v)); }
    // the controls: the blank has one; set it, add the second
    const ENUMS = { scale: ['lin', 'log'], format: ['auto', 'si', 'fixed'] };
    const setParam = async (i, q) => {
      for (const k of ['id', 'label']) await fill(field(['params', i, k]), q[k]);
      for (const k of ['min', 'max', 'default']) await fill(field(['params', i, k]), q[k]);
      for (const k of ['step', 'scale', 'unit', 'format']) if (k in q) { await addField(['params', i], k); const l = p.locator(field(['params', i, k])); if (ENUMS[k]) await l.selectOption(String(ENUMS[k].indexOf(q[k]))); else await l.fill(String(q[k])); }
    };
    await setParam(0, ref.spec.params[0]); await addItem(['params']); await setParam(1, ref.spec.params[1]);
    await addField([], 'derived');
    for (const [i, d] of ref.spec.derived.entries()) { await addItem(['derived']); await fill(field(['derived', i, 'id']), d.id); await fill(field(['derived', i, 'expr']), d.expr); }
    await addField([], 'readouts');
    for (const [i, r] of ref.spec.readouts.entries()) { await addItem(['readouts']); await fill(field(['readouts', i, 'label']), r.label); await fill(field(['readouts', i, 'expr']), r.expr); for (const k of ['unit', 'format', 'digits']) { await addField(['readouts', i], k); const l = p.locator(field(['readouts', i, k])); if (k === 'format') await l.selectOption(String(ENUMS.format.indexOf(r[k]))); else await l.fill(String(r[k])); } }
    // the plots: easier to set through the API of the form than click by click — the clicks above already exercise every widget
    await p.evaluate(pl => { const d = __aa.get(); d.spec.plots = pl; __aa.set(d); }, ref.spec.plots);
    // the words: every key in every table, through the boxes under the fields
    await p.click('[data-tab=strings]');
    for (const [loc, tab] of Object.entries(ref.strings)) {
      if (!(await p.evaluate(l => Object.keys(__aa.get().strings).includes(l), loc))) { await p.fill('[data-aa=new-locale]', loc); await p.click('[data-aa=add-locale]'); await wait(60); }
      for (const [k, v] of Object.entries(tab)) { const l = p.locator(`.aa-st input[data-strkey="${k}"][data-loc="${loc}"]`).first(); if (await l.count()) await l.fill(v); else await p.evaluate(([l2, k2, v2]) => { const d = __aa.get(); d.strings[l2][k2] = v2; __aa.set(d); }, [loc, k, v]); }
    }
    await p.evaluate(() => { const d = __aa.get(); for (const l of Object.keys(d.strings)) delete d.strings[l].x; __aa.set(d); });   // the blank's own key
    await p.evaluate(() => __aa.flush());
    const got = await p.evaluate(() => __aa.get());
    ok(canon(got.spec) === canon(ref.spec), 'rc-lowpass built from scratch through the form: the spec equals the reference ' + (canon(got.spec) === canon(ref.spec) ? '' : canon(got.spec).slice(0, 300)));
    ok(canon(got.strings) === canon(ref.strings), 'the words equal the reference tables');
    ok(await p.evaluate(() => __aa.check().length === 0) && await p.locator('.aa-probs .aa-ok').count() === 1, 'no problems are left');

    // a bad formula: its error at its field
    await p.click('[data-tab=spec]'); panel = 'spec';
    await fill(field(['derived', 1, 'expr']), '1 / (2 * pi * tauu)'); await wait(400);
    ok(await p.locator(`#aa-panel-spec [data-field='["derived",1,"expr"]'] .sf-err`).count() >= 1 && await p.locator(field(['derived', 1, 'expr'])).getAttribute('aria-invalid') === 'true', 'a bad formula shows its error at its field (and the field is aria-invalid)');
    ok(await p.locator('.aa-pnote').innerText().then(t => t.length > 0), 'the preview says it waits for the fix');
    await fill(field(['derived', 1, 'expr']), '1 / (2 * pi * tau)'); await wait(700);

    // the preview follows a changed start value
    const r0 = await p.evaluate(() => document.querySelector('.aa-pbox .sim-num[data-param=R]')?.value);
    await fill(field(['params', 0, 'default']), '1600'); await wait(900);
    const r1 = await p.evaluate(() => document.querySelector('.aa-pbox .sim-num[data-param=R]')?.value);
    const ro = await p.evaluate(() => document.querySelector('.aa-pbox .sim-ro')?.textContent || '');
    ok(r0 === '4700' && r1 === '1600' && /99\d/.test(ro), `the preview follows the start value of R (4700 → 1600: fc ≈ 995 Hz) ${ro.slice(0, 80)}`);

    // undo / redo
    await p.keyboard.press('Control+z'); await wait(500);
    const u = await p.evaluate(() => __aa.get().spec.params[0].default);
    await p.keyboard.press('Control+Shift+z'); await wait(500);
    const rr = await p.evaluate(() => __aa.get().spec.params[0].default);
    ok(u === 4700 && rr === 1600, `undo brings 4700 back, redo 1600 (${u}, ${rr})`);
    await fill(field(['params', 0, 'default']), '4700'); await p.evaluate(() => __aa.flush());

    // export: the .zip download passes the lint
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-aa=zip]')]);
    const zp = path.join(os.tmpdir(), 'noema-author-' + name + '.zip'); await dl.saveAs(zp);
    const fz = await AA.unzip(fs.readFileSync(zp));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-author-b-'));
    for (const [f, text] of Object.entries(fz)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.writeFileSync(path.join(dir, 'media', 'media.json'), JSON.stringify({ items: [{ id: 'rc-lowpass-still', file: 'still.svg' }] }));
    fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ id: 'author-test', language: 'en' }));
    for (const l of Object.keys(ref.strings).filter(l => l !== 'en')) fs.mkdirSync(path.join(dir, 'translations', l), { recursive: true });
    const lint = cp.spawnSync('python3', [path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_lint.py'), dir], { encoding: 'utf8' });
    ok(lint.status === 0 && JSON.parse(fz['activities/rc-lowpass/spec.json']) && canon(JSON.parse(fz['activities/rc-lowpass/spec.json'])) === canon(ref.spec), 'the downloaded .zip: activity_lint.py accepts the folder, and its spec.json is the reference ' + (lint.status ? lint.stdout.slice(-300) : ''));
    // import the same zip into a new page state
    await p.evaluate(() => __aa.set({ item: { id: 'x1', runtime: 'sim-spec@1', entry: 'activities/x1/spec.json', stateVersion: 1, fallback: { media: 'm', text: '' } }, spec: { format: 'noema.sim-spec/v1', params: [{ id: 'q', kind: 'toggle', label: 'q' }] }, strings: { en: { q: 'q' } } }));
    await p.setInputFiles('[data-aa=import-input]', zp); await wait(800);
    ok(canon(await p.evaluate(() => __aa.get().spec)) === canon(ref.spec), 'importing the .zip gives the activity back');

    // keyboard: the tabs with the arrow keys
    await p.focus('[data-tab=spec]'); await p.keyboard.press('ArrowRight');
    ok(await p.evaluate(() => document.activeElement?.dataset.tab === 'strings' && document.querySelector('#aa-panel-strings').hidden === false), 'the tabs work with the arrow keys');

    // 360 px: stacked, no horizontal scroll; dark mode
    await p.setViewportSize({ width: 360, height: 780 }); await wait(400);
    const fit = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, stacked: (() => { const a = document.querySelector('.aa-edit').getBoundingClientRect(), b = document.querySelector('.aa-prev').getBoundingClientRect(); return b.top >= a.bottom - 1; })() }));
    ok(fit.sw <= fit.w && fit.stacked, `360 px: no horizontal scroll (${fit.sw} ≤ ${fit.w}) and the preview below the form`);
    for (const t of ['item', 'spec', 'strings']) { await p.click(`[data-tab=${t}]`); await wait(150); }
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '360 px: every tab fits');
    await p.setViewportSize({ width: 1280, height: 900 });
    const side = await p.evaluate(() => { const a = document.querySelector('.aa-edit').getBoundingClientRect(), b = document.querySelector('.aa-prev').getBoundingClientRect(); return b.left >= a.right - 1; });
    ok(side, 'desktop: the preview beside the form');
    await p.emulateMedia({ colorScheme: 'dark' }); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await wait(300);
    const dark = await p.evaluate(() => { const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }; const f = document.querySelector('.aa .sf-in'); return { bg: lum(getComputedStyle(f).backgroundColor), ink: lum(getComputedStyle(f).color) }; });
    ok(dark.bg < 0.35 && dark.ink > 0.6, `dark mode: the fields are dark with light text (${dark.bg.toFixed(2)} / ${dark.ink.toFixed(2)})`);
    ok(!E.length, 'no page errors ' + E.slice(0, 3).join(' | '));
    await browser.close();
  }
}
