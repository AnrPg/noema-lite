/* The activity author (engine/activity_author.js, engine/schemaform.js, docs/activities-dev/authoring_ui.md).
   Node (always): the sim-spec schema (src/contracts/schemas/noema.sim-spec.v1.schema.json) accepts the reference specs and never refuses what
   the validators accept (the parity cases of tests/activities.js), and refuses the structural ones; the registry schema accepts the
   reference entries; the form generator reaches every value of the reference specs with a typed schema (no raw-data fallback);
   the documents round-trip losslessly through files, zip and import; check() finds no problem in the references and puts a bad
   formula at its field; the exported folder passes activity_lint.py; the words: every engine.author.* key is in i18n/engine/en.arb
   with a description and drafted in every UI locale with the placeholders of English (tools/i18n/check.js: 0 errors), the page
   reads them through NoemaI18n (no side table), every schema title and netlist field has a label; engine/activity_author_schemas.js
   is the copy of src/contracts/schemas that tools/build.py writes.
   The engine library (docs/INTERACTIVE_LIBRARY.md §1.5): every library engine whose module exports its `table` gets a schema
   (NoemaLibSchema.specSchema) that accepts its reference activities and every fixture spec its own checkSpec accepts
   (tests/fixtures/enginelib/<name>.json), refuses the structural mistakes, and has a label for every field word; check() finds no
   problem in the references; the references ship in activity_author_schemas.js (NoemaActivityRefs).
   Browser (with --browser; BROWSERS=chromium (default),firefox,webkit): the page in the built site, through its route #/author (the address,
   then the way in: subject ⋮ › Create an activity, the crumbs, 320 px): rc-lowpass built from scratch through the form equals the reference; a bad formula shows its error at its field;
   the preview follows a changed start value; the .zip download passes activity_lint.py; undo / redo; 360 px without horizontal
   scroll; dark mode; graph@1: picked in the engine picker → started from its reference → the preview draws its scene → a wrong
   model field shows the engine's own message at the field → the .zip passes activity_lint.py.
   Usage: node tests/activity_author.js [--browser [<prepared-repo>]]   (the browser part opens #/author in <prepared-repo>/dist/site, as tests/run_e2e.sh builds it)
   (browser: NODE_PATH=$(npm root -g), PLAYWRIGHT_BROWSERS_PATH=…; run under flock on a shared machine) */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
require('./built').ensureBuilt(ROOT, 'engine');   // engine/activity_author_schemas.js and the catalogs are generated (never committed)
const args = process.argv.slice(2);
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); return c; };
const rj = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const SCH = f => rj(path.join(ROOT, 'src', 'contracts', 'schemas', f));
const SCHEMA_FILES = ['noema.sim-spec.v1.schema.json', 'noema.circuit.v1.schema.json', 'noema.activities.v1.schema.json'];

/* ---------- the embedded copy of the schemas (the one-file bundle, opened from disk, cannot fetch them): tools/build.py writes it ---------- */
const EMBED = path.join(ROOT, 'engine', 'activity_author_schemas.js');
const embedText = () => cp.execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--author-schemas'], { encoding: 'utf8', cwd: ROOT });

/* ---------- the modules, as the app loads them ---------- */
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibSchema = ENGINES.kernel('schema'), NoemaLibGraph = ENGINES.mod('graph@1'), NoemaLibGenetics = ENGINES.mod('genetics@1'), NoemaLibClinic = ENGINES.mod('clinic@1');
const SF = require(path.join(ROOT, 'engine', 'schemaform.js'));
require(path.join(ROOT, 'tools', 'i18n', 'node.js')).load();   // the app's i18n runtime (English): the page reads its words through NoemaI18n
require(EMBED);
const AA = require(path.join(ROOT, 'engine', 'activity_author.js'));
const P = globalThis.NoemaCore.content;   // the content checks (build/noema-tools.cjs), as the app's NoemaCore.content
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
// the author's words as the app's catalog has them (engine.author.* in i18n/engine/en.arb)
const AP = 'engine.author.', arb = f => rj(path.join(ROOT, 'i18n', 'engine', f));
const EN = Object.fromEntries(Object.entries(arb('en.arb')).filter(([k]) => k.startsWith(AP)).map(([k, v]) => [k.slice(AP.length), v]));

console.log('— the schemas');
ok(fs.readFileSync(EMBED, 'utf8') === embedText(), 'engine/activity_author_schemas.js is the current copy of src/contracts/schemas (python3 tools/build.py writes it)');
ok(SCHEMA_FILES.every(f => JSON.stringify(globalThis.NoemaActivitySchemas?.[f]) === JSON.stringify(SCH(f))), 'the embedded schemas equal src/contracts/schemas/*.json');
for (const id of REFS) { const e = SF.validate(reg, sim, refDoc(id).spec); ok(!e.length, `sim-spec schema accepts the reference ${id} ${e.length ? JSON.stringify(e.slice(0, 2)) : ''}`); }
for (const id of fs.readdirSync(EX).filter(d => fs.existsSync(path.join(EX, d, 'activity.json')))) { const it = rj(path.join(EX, id, 'activity.json')); const e = SF.validate(reg, regSchema, { format: 'noema.activities/v1', items: [it] }); ok(!e.length, `registry schema accepts the entry of ${id} ${e.length ? JSON.stringify(e.slice(0, 2)) : ''}`); }

{ // every runtime the validators accept, and entry by runtime: required for a file, refused for an outside page (external-embed@1)
  const EMB = { id: 'ohm-phet', runtime: 'external-embed@1', stateVersion: 1, provider: 'phet', url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html',
    credit: 'PhET Interactive Simulations · CC-BY-4.0', license: 'CC-BY-4.0', fallback: { media: 'ohm-still', text: 'Ohm’s law: the current through a resistor grows with the voltage and falls with the resistance.' } };
  const v = it => SF.validate(reg, regSchema, { format: 'noema.activities/v1', items: [it] });
  const rcItem = rj(path.join(EX, 'rc-lowpass', 'activity.json')), noEntry = { ...rcItem }; delete noEntry.entry;
  ok(!v(EMB).length && v({ ...EMB, entry: 'activities/ohm-phet/app.html' }).length > 0 && v(noEntry).length > 0,
    'registry schema: an outside page has no entry (one is refused); a sim-spec@1 item without its entry is refused ' + JSON.stringify(v(EMB).slice(0, 2)));
  ok(['html-app@1', 'sim-spec@1', 'py-module@1', 'h5p@1', 'wasm-module@1', 'external-embed@1'].every(r => regSchema.$defs.item.properties.runtime.enum.includes(r)) && [...P.ACTIVITY_RULES.RUNTIMES].every(r => regSchema.$defs.item.properties.runtime.enum.includes(r)),
    'registry schema: the runtime enum names every runtime the validators know');
}

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

console.log('— the engine library: a form from each engine’s table');
const LS = NoemaLibSchema, LIBS = AA.libEngines();
const FINISHED = ['ode@1', 'logic@1', 'prob@1', 'seq@1', 'anatomy@1', 'rhetoric@1', 'philo@1', 'des@1', 'law@1', 'field@1', 'agents@1', 'graph@1', 'geom@1', 'genetics@1', 'med@1', 'clinic@1', 'timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1'];
ok(FINISHED.every(id => LIBS.some(e => e.id === id)), 'every finished library engine exports its table and has a kind in the author: ' + LIBS.map(e => e.id).join(' '));
const libRefs = id => fs.readdirSync(EX).filter(d => fs.existsSync(path.join(EX, d, 'spec.json')) && rj(path.join(EX, d, 'spec.json')).engine === id);
for (const e of LIBS) {
  const R = AA.registry(SCHEMA_FILES.map(SCH)), sid = LS.schemaId(e.id), sch = R.get(sid);
  if (!ok(!!sch, `${e.id}: a schema from its table (${sid.split('/').pop()})`)) continue;
  for (const id of libRefs(e.id)) {
    const d = refDoc(id), er = SF.validate(R, sch, d.spec, sid), pr = AA.check(d);
    ok(!er.length, `${e.id}: its schema accepts the reference ${id} ${er.length ? JSON.stringify(er.slice(0, 2)) : ''}`);
    ok(!pr.length, `${e.id}: check() finds no problem in the reference ${id} ${pr.length ? JSON.stringify(pr.slice(0, 2)) : ''}`);
    const back = AA.fromFiles(AA.files(d));
    ok(JSON.stringify(back.spec) === JSON.stringify(d.spec) && AA.typeOf(back).engine === e.id, `${e.id}: files → import gives ${id} back, as a ${e.id} activity`);
  }
  const fx = path.join(ROOT, 'tests', 'fixtures', 'enginelib', e.id.replace(/@.*$/, '') + '.json');
  if (fs.existsSync(fx)) {
    // (a fixture tests the engine: what it judges is the engine, the model and the outputs; the controls are the validators' business)
    let acc = 0; const bad = [];
    rj(fx).specs.forEach((sp, i) => { if (!sp || typeof sp !== 'object' || Array.isArray(sp) || e.M.checkSpec(sp).some(q => q.level === 'error')) return; acc++; const er = SF.validate(R, sch, sp, sid).filter(x => ['engine', 'model', 'outputs'].includes(x.path[0])); if (er.length) bad.push(i + ' ' + JSON.stringify(er[0])); });
    ok(acc > 0 && !bad.length, `${e.id}: its schema accepts all ${acc} fixture specs its checkSpec accepts ${bad.slice(0, 2).join(' | ')}`);
  }
  const r0 = libRefs(e.id)[0];
  if (r0) {
    const base = refDoc(r0).spec, v = f => { const x = JSON.parse(JSON.stringify(base)); f(x); return SF.validate(R, sch, x, sid).length > 0; };
    ok(v(x => { x.bench = { faults: [] }; }) && v(x => { x.outputs.push({ id: 'zz', kind: 'warp', of: 'x' }); }) && v(x => { x.plots = [{ kind: 'pie', of: 'x' }]; }) && v(x => { x.engine = 'formula@1'; }) && v(x => { delete x.model; }),
      `${e.id}: its schema refuses a bench, an unknown output kind, an unknown plot kind, another engine, no model`);
  }
  const b = AA.libBlank(e.id, R);
  ok(b.spec.engine === e.id && AA.typeOf(b).engine === e.id && b.spec.model && typeof b.spec.model === 'object', `${e.id}: a blank activity of this engine`);
}
{ // scene and sound plots, line styles: only in a library engine's schema (formula@1's sim-spec keeps its shape)
  const R = AA.registry(SCHEMA_FILES.map(SCH)), g = R.get(LS.schemaId('graph@1')), d = refDoc('dijkstra-steps').spec;
  const withStyle = JSON.parse(JSON.stringify(d)); withStyle.outputs.push({ id: 'dg', kind: 'series', of: 'degree' }, { id: 'ix', kind: 'series', of: 'nodeIndex' }); withStyle.plots.push({ kind: 'series', x: { series: 'ix' }, series: [{ y: 'dg', style: 'bars' }] });
  const badStyle = JSON.parse(JSON.stringify(withStyle)); badStyle.plots[1].series[0].style = 'pie';
  ok(!SF.validate(R, g, withStyle).length && SF.validate(R, g, badStyle).length > 0 && SF.validate(reg, sim, refDoc('rc-lowpass').spec).length === 0, 'a library schema takes scene plots and line styles (bars), and refuses an unknown style');
  ok(JSON.stringify(LS.ofs(NoemaLibGraph.table, d.model, 'scene')) === '["drawing"]' && LS.ofs(NoemaLibClinic.table, refDoc('sepsis-case').spec.model, 'scalar').length > 10 && LS.ofs(NoemaLibGenetics.table, { mode: 'hw' }, 'scene').join() === 'deFinetti',
    'what an output may compute: from the table (graph@1 scene: drawing), from the model (clinic@1), by mode (genetics@1 hw: deFinetti)');
}
{ // the labels: every field word of every engine's schema in the catalog (f.lib.<field>), every option of the new selects
  const R = AA.registry(SCHEMA_FILES.map(SCH)), all = new Set();
  for (const e of LIBS.filter(x => FINISHED.includes(x.id))) LS.titles(R.get(LS.schemaId(e.id))).forEach(t => all.add(t));
  all.delete('spec');
  const miss = [...all].filter(t => !(('f.' + t) in EN) && !(t.startsWith('lib.') && LS.symbolic(t.slice(4))));
  ok(!miss.length, `every field of the finished engines’ schemas (${all.size} titles) has a label (f.<title>; a symbol such as k or x0 is its own) ` + miss.slice(0, 12));
  const opts = ['outKind.scene', 'outKind.sound', 'plotKind.scene', 'plotKind.sound', ...LS.STYLES.map(x => 'lineStyle.' + x)];
  ok(opts.every(k => ('f.' + k) in EN), 'the new options have words ' + opts.filter(k => !(('f.' + k) in EN)));
}
{ // parts: several engines in one spec (docs/INTERACTIVE.md §12.8), each part with the form of its engine
  console.log('— parts: several engines in one spec');
  const R = AA.registry(SCHEMA_FILES.map(SCH)), PID = LS.PARTS_ID, ps = R.get(PID), sim = SCH('noema.sim-spec.v1.schema.json');
  ok(!!ps && ps.properties.parts.items.oneOf.length >= LIBS.length && AA.TYPES.some(t => t.parts), `a schema of specs with parts (${PID.split('/').pop()}): a branch per library engine (${LIBS.length}), circuit-mna@1 and a part file (use)`);
  const C = rj(path.join(ROOT, 'tests', 'fixtures', 'parts_cases.json')).cases, good = Object.entries(C).filter(([k]) => /^parts good/.test(k));
  const bad1 = [], bad2 = [];
  for (const [k, c] of good) { const sp = c.spec || c; if (SF.validate(R, sim, sp, sim.$id).length) bad1.push(k); if (SF.validate(R, ps, sp, PID).length) bad2.push(k); }
  ok(good.length > 0 && !bad1.length && !bad2.length, `sim-spec and the parts schema accept every good case of tests/fixtures/parts_cases.json (${good.length}) ${bad1.concat(bad2).slice(0, 3)}`);
  const refs = fs.readdirSync(EX).filter(d => fs.existsSync(path.join(EX, d, 'spec.json')) && Array.isArray(rj(path.join(EX, d, 'spec.json')).parts));
  for (const id of refs) {
    const d = AA.fromFiles(Object.fromEntries(fs.readdirSync(path.join(EX, id)).filter(f => /\.json$/.test(f)).map(f => [f, fs.readFileSync(path.join(EX, id, f), 'utf8')])));
    const er = SF.validate(R, ps, d.spec, PID), pr = AA.check(d, R).filter(p => p.tab === 'spec');
    ok(AA.typeOf(d).parts && AA.specSchemaId(d.spec, R) === PID && !er.length && !pr.length, `${id}: a parts activity, its schema accepts it and check() finds no problem in its spec ${JSON.stringify(er.concat(pr).slice(0, 2))}`);
  }
  ok(refs.length >= 1, 'the parts references found: ' + refs.join(', '));
  const sp0 = good[0][1].spec || good[0][1];
  const wrong = JSON.parse(JSON.stringify(sp0)); wrong.parts[0].engine = 'nope@1';
  const noOut = JSON.parse(JSON.stringify(sp0)); delete noOut.parts[0].outputs;
  ok(SF.validate(R, ps, wrong, PID).length > 0 && SF.validate(R, ps, noOut, PID).length > 0 && SF.validate(R, ps, Object.assign({}, sp0, { couple: { loops: [{ parts: ['a'] }] } }), PID).length > 0,
    'the parts schema refuses an unknown engine, a part with no outputs, a loop with no tolerance');
  { // a bench on a circuit part (spec.bench.part): the validators take it, so do both schemas
    const led = rj(path.join(EX, 'led-bench', 'spec.json')), sp = JSON.parse(JSON.stringify(led));
    sp.parts = [{ id: 'c', engine: 'circuit-mna@1', model: sp.model, outputs: sp.outputs || [{ id: 'va', kind: 'scalar', node: 'a' }] }]; sp.bench = Object.assign({ part: 'c' }, sp.bench);
    delete sp.engine; delete sp.model; delete sp.outputs;
    const tabs = Object.fromEntries(fs.readdirSync(path.join(EX, 'led-bench')).map(f => /^strings\.([\w-]+)\.json$/.exec(f)).filter(Boolean).map(m => [m[1], rj(path.join(EX, 'led-bench', m[0]))]));
    const ve = P.checkSimSpec(sp, tabs);
    const e1 = SF.validate(R, sim, sp, sim.$id), e2 = SF.validate(R, ps, sp, PID);
    ok(!ve.length && !e1.length && !e2.length, `a parts spec with bench.part (led-bench's circuit as a part): the validators, sim-spec and the parts schema accept it ${JSON.stringify(ve.concat(e1, e2).slice(0, 2))}`);
  }
  const b = AA.TYPES.find(t => t.parts).blank();
  ok(Array.isArray(b.spec.parts) && b.spec.parts.length === 1 && AA.typeOf(b).parts && !b.spec.engine, 'a blank parts activity: one part of a library engine, no top-level engine');
  const labs = [...LS.titles(ps)].filter(t => t.startsWith('eng.'));
  ok(labs.length > 0 && labs.every(t => AA.engLabel(t.slice(4)) !== ''), 'a part’s engine is named by the catalogue (eng.<id> titles) ' + labs.length);
  const sub = AA.partSub(sp0, sp0.parts[0]);
  ok(sub.engine === sp0.parts[0].engine && Object.keys(sp0.parts[0].inputs || {}).every(k => k in sub.consts), 'a part’s own spec for its engine’s checks: its model and outputs, its inputs as names');
  const titles = [...LS.titles(ps)].filter(t => !t.startsWith('eng.') && !t.startsWith('lib.') && t !== 'spec');
  const miss = titles.filter(t => !(('f.' + t) in EN));
  ok(!miss.length, `every field of the parts schema has a label ${miss.slice(0, 10)}`);
  ok(['type.parts', 'type.partsWhat', 'typeGroupParts'].every(k => k in EN), 'the parts kind has its words');
}
{ // the references ship with the page (tools/build.py writes them into activity_author_schemas.js)
  const R = globalThis.NoemaActivityRefs;
  if (!R) console.log('⚠ NoemaActivityRefs is not in engine/activity_author_schemas.js yet (tools/build.py author_schemas_js: the references) — the page then offers Blank only');
  else ok(LIBS.filter(e => FINISHED.includes(e.id)).every(e => AA.refsFor(e.id).length >= 1) && AA.refsFor('graph@1')[0].ref === 'dijkstra-steps' && JSON.stringify(AA.refsFor('graph@1')[0].spec) === JSON.stringify(refDoc('dijkstra-steps').spec),
    'the page has the reference activity of every finished library engine (dijkstra-steps for graph@1, as on disk)');
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
  for (const t of AA.TYPES.filter(x => !x.lib && !x.parts)) {   // (a library engine's blank is its model's skeleton: its own checks then say what to fill in)
    const b = t.blank(); const pr = AA.check(b).filter(p => !(p.tab === 'item' && p.path.join('.') === 'fallback.text')); ok(!pr.length && t.match(b), `the blank "${t.id}" has no problem but its fallback text ${pr.length ? JSON.stringify(pr.slice(0, 2)) : ''}`); }

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

  console.log('— the words: the app’s catalogs (i18n/engine/en.arb + drafts for every UI locale), no side table');
  const EN_META = arb('en.arb'), LOCS = require(path.join(ROOT, 'tools', 'i18n', 'icu.js')).LOCALES.filter(l => l !== 'en');
  ok(!fs.existsSync(path.join(ROOT, 'engine', 'activity_author_i18n.js')), 'no side table: engine/activity_author_i18n.js is gone');
  ok(Object.keys(EN).length > 250 && Object.keys(EN).every(k => String(EN_META['@' + AP + k]?.description || '').trim()), `en.arb has the author's ${Object.keys(EN).length} keys, each with a description for translators`);
  ok(AA.T('title') === EN.title && AA.T('problems', { n: 2 }) === '2 problems' && AA.T('no.such.key') === null, 'the page reads its words through NoemaI18n (plural formatted; an unknown key is null, so a label falls back to the field name)');
  const ph = s => [...new Set([...String(s).matchAll(/\{(\w+)(?:[,}])/g)].map(m => m[1]))].sort().join();
  for (const l of LOCS) {
    const d = arb(path.join('drafts', l + '.arb')), miss = Object.keys(EN).filter(k => !(typeof d[AP + k] === 'string' && d[AP + k].trim())), badPh = Object.keys(EN).filter(k => d[AP + k] != null && ph(d[AP + k]) !== ph(EN[k]));
    ok(!miss.length && !badPh.length, `${l}: a draft for every key, with the placeholders of English ${miss.slice(0, 4).concat(badPh.slice(0, 4))}`);
  }
  ok(cp.spawnSync('node', [path.join(ROOT, 'tools', 'i18n', 'check.js')], { encoding: 'utf8' }).status === 0, 'tools/i18n/check.js: 0 errors (ICU, plural categories per locale, placeholders, descriptions)');
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'activity_author.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'engine', 'schemaform.js'), 'utf8');
  const used = [...new Set([...src.matchAll(/\b(?:TT|T)\('([\w.]+)'/g)].map(m => m[1]))].filter(k => !/\.$/.test(k));
  ok(used.every(k => k in EN), 'every word the code asks for is in en.arb ' + used.filter(k => !(k in EN)));
  const views = fs.readFileSync(path.join(ROOT, 'engine', 'src', '40_views.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'engine', 'app', 'study.js'), 'utf8');   // the route (the engine) and its menu item (the study area's subject ⋮)
  const routeKeys = [...views.matchAll(/tE\('engine\.author\.([\w.]+)'/g)].map(m => m[1]);
  ok(routeKeys.length >= 4 && routeKeys.every(k => k in EN), 'the route and its menu item use catalog words ' + routeKeys);
  const titles = new Set(); (function tw(o) { if (Array.isArray(o)) o.forEach(tw); else if (o && typeof o === 'object') { if (typeof o.title === 'string') titles.add(o.title); Object.values(o).forEach(tw); } })([sim, regSchema]);
  titles.delete('spec'); titles.delete('registry');
  const noLabel = [...titles].filter(t => !(('f.' + t) in EN));
  ok(!noLabel.length, `every schema title (${titles.size}) has a label (f.<title>) ` + noLabel.slice(0, 8));
  const props = new Set(); (function pw(o) { if (Array.isArray(o)) o.forEach(pw); else if (o && typeof o === 'object') { if (o.properties) Object.keys(o.properties).forEach(k => props.add(k)); Object.values(o).forEach(pw); } })(SCH('noema.circuit.v1.schema.json'));
  const noP = [...props].filter(k => !(('p.' + k) in EN));
  ok(!noP.length, `every netlist field (${props.size}) has a label (p.<property>) ` + noP.slice(0, 8));
  const enumOpts = []; (function ew(o) { if (Array.isArray(o)) o.forEach(ew); else if (o && typeof o === 'object') { if (Array.isArray(o.enum) && o.title) for (const v of o.enum) if (typeof v === 'string') enumOpts.push(o.title + '.' + v); Object.values(o).forEach(ew); } })(sim);
  ok(enumOpts.every(k => ('f.' + k) in EN), 'every option of a select of the spec has words ' + enumOpts.filter(k => !(('f.' + k) in EN)).slice(0, 6));

  if (args.includes('--browser')) await browser();
  console.log(`\n${fails ? '✗' : '✓'} activity author: ${n - fails}/${n}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* =========================== browser (written for the batch runs; node tests/activity_author.js --browser) =========================== */
async function browser() {
  const pw = require(process.env.PW || 'playwright'), { appUrl } = require('./serve');
  // the built site of a prepared repo (tests/run_e2e.sh: node tests/activity_author.js --browser "$T"), else this repo's dist/site
  const SITE = path.resolve(args.find(a => !a.startsWith('--')) || ROOT), SITE_URL = await appUrl(path.join(SITE, 'dist', 'site'));   // over http, as the website serves it
  if (!fs.existsSync(path.join(SITE, 'dist', 'site', 'index.html'))) throw new Error('no built site: python3 tools/build.py site (in ' + SITE + ')');
  const names = (process.env.BROWSERS || 'chromium').split(',');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(120); } return false; };
  const ref = refDoc('rc-lowpass');
  for (const name of names) {
    console.log(`— browser: ${name}`);
    const browser = await pw[name].launch(name === 'chromium' ? { channel: process.env.PW_CHANNEL || 'chromium' } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    const E = []; p.on('pageerror', e => E.push(e.message));
    // the built site with a subject open (in the frame: a subject always opens there), then the route #/author
    // (the site ships no profile of this device: one local profile, so the app opens it without asking "Who is studying?")
    await p.goto(SITE_URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('noema1:accounts', JSON.stringify([{ id: 'author', name: 'Author', emoji: '🙂', pin: null, created: Date.now(), learner: '' }])); });
    await p.goto(SITE_URL + '?subject=demo-physics'); await wait(1500);
    ok(await until(() => p.evaluate(() => typeof ACT !== 'undefined' && ACT.engines().includes('formula@1'))), 'the built site is up with a subject and its sim-spec@1 runtime');
    ok(await p.evaluate(() => typeof NoemaActivityAuthor === 'undefined'), 'the author’s scripts are not loaded before the route is opened');
    await p.evaluate(() => { location.hash = '#/author'; });
    ok(await until(() => p.evaluate(() => !!(window.NoemaActivityAuthor?.current && document.querySelector('main .aa h1')))), 'the address #/author loads the author’s scripts and opens the page');
    ok(await p.evaluate(() => [...document.styleSheets].some(x => /activity_author\.css$/.test(x.href || ''))), 'its stylesheet is loaded with it');
    await p.evaluate(() => { window.__aa = NoemaActivityAuthor.current; });
    ok(await p.locator('.aa h1').innerText() === EN.title && await p.locator('.aa-pbox .sim').count() === 1, 'the page shows the form (in the catalog’s words) and the preview of the blank activity (the real runtime)');

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
    ok(await until(() => p.locator('.aa-pnote').innerText().then(t => t.length > 0)), 'the preview says it waits for the fix');   // (the checks run 200 ms after a change, the preview 400 ms after them)
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
    // a library engine: graph@1 from its reference activity, the scene in the preview, a checkSpec message at its field, the .zip
    await p.emulateMedia({ colorScheme: 'light' }); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await p.evaluate(() => { window.__aa = NoemaActivityAuthor.current; });   // (the page may have been mounted again meanwhile)
    const hasGraph = await p.evaluate(() => !!document.querySelector('[data-aa=type] option[value="lib:graph@1"]'));
    ok(hasGraph, 'the kind select offers the library engines this app has (graph@1 among them, in its group)');
    if (hasGraph) {
      ok(await p.evaluate(() => !!document.querySelector('[data-aa=type] optgroup option[value="lib:graph@1"]')), 'graph@1 sits in an engine group of the select');
      await p.selectOption('[data-aa=type]', 'lib:graph@1'); await wait(200);
      const refBtn = await p.locator('[data-aa=start-ref]').count();
      ok(refBtn === 1 && await p.locator('[data-aa=start-blank]').count() === 1, 'choosing graph@1 asks: the reference activity or blank');
      if (refBtn) {
        await p.click('[data-aa=start-ref]');
        const loaded = await until(() => p.evaluate(() => __aa.get().spec.engine === 'graph@1' && __aa.get().item.id === 'dijkstra-steps'));
        ok(loaded, 'Start from the reference activity loads dijkstra-steps ' + (loaded ? '' : JSON.stringify(await p.evaluate(() => [__aa.get().spec.engine, __aa.get().item.id]))));
        ok(await until(() => p.evaluate(() => !!document.querySelector('.aa-pbox svg.sim-scene'))), 'the preview shows the engine’s drawing (a scene plot)');
        ok(await p.evaluate(() => __aa.check().length === 0), 'the reference has no problems in the author');
        await p.click('[data-tab=spec]'); panel = 'spec';
        const src = field(['model', 'run', 'source']);
        ok(await p.locator(src).count() === 1, 'the model’s fields come from the engine’s table (model.run.source)');
        await fill(src, 'nowhere'); await wait(600);
        ok(await until(() => p.locator(`#aa-panel-spec [data-field='["model","run","source"]'] .sf-err`).count().then(n => n >= 1)), 'a node that does not exist: the engine’s checkSpec message at its field');
        await fill(src, 's'); await wait(600);
        ok(await until(() => p.evaluate(() => __aa.check().length === 0)), 'set back: no problems');
        const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('[data-aa=zip]')]);
        const zp2 = path.join(os.tmpdir(), 'noema-author-graph-' + name + '.zip'); await dl2.saveAs(zp2);
        const fz2 = await AA.unzip(fs.readFileSync(zp2));
        const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-author-g-'));
        for (const [f, text] of Object.entries(fz2)) { fs.mkdirSync(path.dirname(path.join(dir2, f)), { recursive: true }); fs.writeFileSync(path.join(dir2, f), text); }
        const media2 = JSON.parse(fz2['activities/activities.json']).activities?.[0]?.fallback?.media || 'dijkstra-steps-still';
        fs.mkdirSync(path.join(dir2, 'media'), { recursive: true }); fs.writeFileSync(path.join(dir2, 'media', 'media.json'), JSON.stringify({ items: [{ id: media2, file: 'still.svg' }] }));
        fs.writeFileSync(path.join(dir2, 'subject.json'), JSON.stringify({ id: 'author-test', language: 'en' }));
        for (const f of Object.keys(fz2)) { const m = f.match(/strings\.([\w-]+)\.json$/); if (m && m[1] !== 'en') fs.mkdirSync(path.join(dir2, 'translations', m[1]), { recursive: true }); }
        const lint2 = cp.spawnSync('python3', [path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_lint.py'), dir2], { encoding: 'utf8' });
        ok(lint2.status === 0 && !!fz2['activities/dijkstra-steps/spec.json'], 'the graph@1 .zip: activity_lint.py accepts the folder ' + (lint2.status ? lint2.stdout.slice(-300) : ''));
        await p.setViewportSize({ width: 320, height: 700 }); await wait(400);
        ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px with a library engine: no horizontal scroll');
        await p.setViewportSize({ width: 1280, height: 900 });
      } else console.log('⚠ ' + 'NoemaActivityRefs is not shipped by this build: the reference flow is skipped');
    }

    // several engines in one spec: the kind "parts", each part with its engine's form; the reference pk-ode (when shipped) runs in the preview
    if (await p.evaluate(() => !!document.querySelector('[data-aa=type] option[value="sim-parts"]'))) {
      await p.evaluate(() => { window.__aa = NoemaActivityAuthor.current; });
      await p.selectOption('[data-aa=type]', 'sim-parts'); await wait(200);
      const hasRef = await p.locator('[data-aa=start-ref]').count();
      await p.click(hasRef ? '[data-aa=start-ref]' : '[data-aa=start-blank]');
      ok(await until(() => p.evaluate(() => Array.isArray(__aa.get().spec.parts) && !__aa.get().spec.engine)), 'the kind “Several engines”: a spec with parts ' + (hasRef ? '(from a reference)' : '(blank)'));
      await p.click('[data-tab=spec]'); panel = 'spec';
      const engSel = `#aa-panel-spec select[data-path='${JSON.stringify(['parts', 0, '$alt'])}'], #aa-panel-spec select[data-path='${JSON.stringify(['parts', 0, 'engine'])}']`;
      ok(await until(() => p.locator(engSel).count().then(n => n >= 1)) && (await p.locator(engSel).first().locator('option').allInnerTexts()).some(t => /\(graph@1\)/.test(t)), 'each part has an engine select (the engines by their catalogue names) and the form of that engine');
      const eng0 = await p.evaluate(() => __aa.get().spec.parts[0].engine);
      ok(await p.locator(`#aa-panel-spec [data-field^='${JSON.stringify(['parts', 0, 'model']).slice(0, -1)}']`).count() >= 1, `the model of part 1 (${eng0}) is a form from its engine’s table`);
      if (hasRef) {
        ok(await until(() => p.evaluate(() => __aa.check().filter(q => q.tab === 'spec').length === 0)), 'the parts reference has no problem in the author');
        ok(await until(() => p.evaluate(() => !!document.querySelector('.aa-pbox .sim')), 12000), 'the preview runs the parts (the real runtime)');
      }
      await p.setViewportSize({ width: 320, height: 700 }); await wait(400);
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px with parts: no horizontal scroll');
      await p.setViewportSize({ width: 1280, height: 900 });
    } else ok(false, 'the kind select offers “Several engines” (sim-parts)');

    // leaving the route stops the page (its keys and preview)
    await p.evaluate(() => { location.hash = '#/'; }); await wait(400);
    ok(await p.evaluate(() => NoemaActivityAuthor.current === null && !document.querySelector('.aa')), 'leaving #/author stops the page');

    // the new frame: the one way in is the subject’s ⋮ › Create an activity; the crumbs end with the page’s title
    await p.emulateMedia({ colorScheme: 'light' });
    await p.evaluate(() => localStorage.setItem('noema-test:newUI', '1'));
    await p.goto(SITE_URL); await wait(1200);
    if (await until(() => p.$('[data-pick="know"]'), 3000)) { await p.click('[data-pick="know"]'); await wait(300); await p.click('[data-onbdone]'); await wait(600); }   // the first-time questions
    await p.goto(SITE_URL + '#/shelf'); await until(() => p.$('[data-subject="demo-physics"]')); await p.click('[data-subject="demo-physics"]'); await until(() => p.$('.subjhead'));
    ok(await until(() => p.evaluate(() => !!window.NoemaShell?.mounted && !!window.NoemaShell.engine && !!document.querySelector('#ns-top .ns-menubtn'))), 'the frame is up with the subject open');
    await p.click('#ns-top .ns-menubtn'); await p.waitForSelector('.ns-pop');
    const item = p.locator('.ns-pop button', { hasText: EN.create }).first();
    ok(await item.count() === 1 && await item.locator('.mi svg').count() === 1 && (await item.locator('small').innerText()) === EN.createSub, 'subject ⋮: “Create an activity” with a line icon and its one-line explanation');
    await item.click();
    ok(await until(() => p.evaluate(() => location.hash === '#/author' && !!document.querySelector('main .aa h1'))), 'it opens #/author inside the frame');
    const crumbs = await p.locator('.ns-crumbs > *').allInnerTexts();
    ok(crumbs.length >= 2 && crumbs[crumbs.length - 1].includes(EN.title), 'the crumbs end with the page’s title ' + JSON.stringify(crumbs));
    await p.setViewportSize({ width: 320, height: 700 }); await wait(400);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px in the frame: no horizontal scroll');
    await p.evaluate(() => localStorage.removeItem('noema-test:newUI'));
    ok(!E.length, 'no page errors ' + E.slice(0, 3).join(' | '));
    await browser.close();
  }
}
