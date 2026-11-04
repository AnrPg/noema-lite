/* Interactive activities without a browser (docs/INTERACTIVE.md, docs/adr/001):
   1. the loop guard (engine/src/33_activity_guard.js): every loop gets the guard, nothing else changes, the program still runs
      the same, an endless loop throws; strings, templates, regexes and comments are left alone;
   2. the protocol checks (ACTP in engine/src/32_activities.js): sizes, types, payloads, a newer version;
   3. the rules in JS (engine/packcheck.js checkActivities) and Python (tools/activities.py) give the same errors on the same packs,
      html-app@1 and sim-spec@1 (the spec: shape, limits, names, every expression through NoemaExpr / simexpr, engines, string keys;
      the checks grader of a sim exercise);
   4. no code path ever gives a frame allow-same-origin.
   Usage: node tests/activities.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };

// 1. the loop guard
require(path.join(ROOT, 'engine', 'src', '33_activity_guard.js'));
const LG = globalThis.NoemaLoopGuard;
const T = src => LG.transform(src, 'G').code;
ok(T('while (a) b();') === 'while (G()&&(a)) b();', 'while (c) → while (G()&&(c))');
ok(T('do { x++ } while (x < 3);') === 'do { x++ } while (G()&&(x < 3));', 'do … while (c) gets the guard too');
ok(T('for (let i = 0; i < n; i++) f(i);') === 'for (let i = 0;G()&&( i < n); i++) f(i);', 'for (a; b; c) → for (a; G()&&(b); c)');
ok(T('for (;;) f();') === 'for (;G();) f();', 'for (;;) → for (;G();)');
ok(T('for (const x of xs) f(x);') === 'for (const x of G.it( xs)) f(x);', 'for (x of y) → for (x of G.it(y))');
ok(T('for await (const x of xs) f(x);') === 'for await (const x of xs) f(x);', 'for await is left alone (it pauses anyway)');
ok(T('for (const k in o) f(k);') === 'for (const k in o) f(k);', 'for (k in o) is finite: left alone');
const quiet = 's = "while (1) {}"; t = `for (;;) ${a} while(x)`; r = /while\\(/g; // while (true)\n/* for (;;) */ o.while(1); o?.for(2);';
ok(T(quiet) === quiet, 'strings, template literals, regexes, comments and properties named while/for are untouched');
ok(T('x = a / b; while (c) d();') === 'x = a / b; while (G()&&(c)) d();', 'a division is not taken for a regex');
ok(T('for (let i = 0, j = (k, 1); i < f(a, b); i++) {}') === 'for (let i = 0, j = (k, 1);G()&&( i < f(a, b)); i++) {}', 'nested brackets in a for head');
ok(LG.transform('while(a){} for(;;){} for(x of y){}', 'G').loops === 3, 'it counts the loops it guarded');
// the guarded program runs the same, and an endless one is stopped
const runIn = (code, budget = 200) => {
  const ctx = { performance: { now: () => Date.now() }, MessageChannel: class { constructor() { this.port1 = {}; this.port2 = { postMessage() { } }; } }, Object, Symbol, Error, window: {} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(LG.runtime('G', budget, 'function(){ window.tripped = true; }'), ctx);
  return { r: vm.runInContext(LG.transform(code, 'G').code, ctx), ctx };
};
ok(runIn('var s = 0; for (var i = 0; i < 1000; i++) s += i; var t = 0; for (var x of [1, 2, 3]) t += x; var k = 0; while (k < 10) k++; [s, t, k].join()').r === '499500,6,10', 'a guarded program computes what it did before');
let thrown = null, ctxT = null; const t0 = Date.now();
try { runIn('while (true) {}', 200); } catch (e) { thrown = e; }
ok(thrown && /ran too long/.test(thrown.message) && Date.now() - t0 < 2000, `an endless loop throws after the budget (${Date.now() - t0} ms)`);
try { const x = runIn('var it = { [Symbol.iterator]() { return { next: () => ({ done: false, value: 1 }) }; } }; for (var v of it) {}', 200); ctxT = x.ctx; } catch (e) { thrown = e; }
ok(/ran too long/.test(thrown.message), 'an endless iterator (for … of) is stopped too');
ok(fs.readFileSync(path.join(ROOT, 'engine', 'src', '34_activity_html.js'), 'utf8').includes('NoemaLoopGuard.transform(s.textContent, G)'), 'html-app@1 guards every script of the bundle before it hashes it');

// 2. the protocol checks
const src32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
const actpSrc = src32.slice(src32.indexOf('const ACTP = '), src32.indexOf('const ACT = ('));
const ACTP = vm.runInNewContext(actpSrc + '; ACTP', { TextEncoder, JSON, Object, Array, Number, String, Math });
const M = (type, payload, extra) => ({ p: 'noema.activity', v: 1, type, payload, ...(extra || {}) });
ok(ACTP.check(M('ready', { protocols: [1] })).ok, 'ready is accepted');
ok(!ACTP.check({ p: 'other', v: 1, type: 'ready' }).ok, 'another protocol is refused');
ok(ACTP.check(M('ready', {}, { v: 2 })).version, 'a newer protocol version is told apart (the app says it needs a newer build)');
ok(!ACTP.check(M('result', { score: 2, passed: true })).ok && !ACTP.check(M('result', { score: 0.5 })).ok, 'result: score in [0, 1] and passed are required');
ok(ACTP.check(M('result', { score: 1, passed: true, detail: 'fs=10' })).ok, 'a good result is accepted');
ok(ACTP.check(M('nonsense', {})).ignore, 'an unknown type is ignored, not a strike');
ok(!ACTP.check(M('state', { version: 1, data: 'x'.repeat(300 * 1024) })).ok, 'a state over 256 KB is refused');
ok(!ACTP.check(M('event', { name: 'x', data: 'y'.repeat(70 * 1024) })).ok, 'a message over 64 KB is refused');
ok(!ACTP.check(M('resize', { h: 'tall' })).ok && ACTP.check(M('resize', { h: 300 })).ok, 'resize needs a number');
ok(!ACTP.check(null).ok && !ACTP.check('hello').ok, 'not an object → refused');

// 3. the same rules in JS and Python
require(path.join(ROOT, 'engine', 'src', '35_simexpr.js'));   // the expression checker packcheck uses for sim-spec@1
require(path.join(ROOT, 'engine', 'src', '36_engine_circuit.js'));   // the netlist and fault checker packcheck uses for circuit-mna@1
require(path.join(ROOT, 'engine', 'packcheck.js'));
require(path.join(ROOT, 'engine', 'src', '44_activity_wasm.js'));   // NoemaWasm: packcheck checks wasm-module@1 items and wasm@1 models with it (P6)
globalThis.NoemaEmbed = require(path.join(ROOT, 'engine', 'src', '45_activity_embed.js'));   // NoemaEmbed: the external-embed@1 rules (P6)
const P = globalThis.NoemaPackCheck;
const html = fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', 'app.html'), 'utf8');
const crypto = require('crypto');
const strings = Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', `strings.${l}.json`), 'utf8'))]));
const item = { ...JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', 'activity.json'), 'utf8')), html, sha256: crypto.createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html), strings };
delete item.entry;
const base = () => JSON.parse(JSON.stringify({ subject: { id: 'x', language: 'en' }, media: { 'alias-lab-still': { w: 600, h: 220 } }, requires: ['activities/v1', 'runtime:html-app@1'], activities: { format: 'noema.activities/v1', items: [item] },
  chapters: [{ id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'interactive', activity: 'alias-lab' }] }], exercises: [{ id: 'ch01-e1', type: 'sim', activity: 'alias-lab', grade: { mode: 'reported' }, task: { seed: 'auto', params: { f: 7 } }, hints: ['a'] }] }] }));
const cases = {
  good: p => p,
  'no format': p => { p.activities.format = 'x'; },
  'bad id': p => { p.activities.items[0].id = 'Alias Lab'; },
  'later runtime': p => { p.activities.items[0].runtime = 'py-module@1'; },
  'sim-spec without its spec': p => { p.activities.items[0].runtime = 'sim-spec@1'; },
  'unknown runtime': p => { p.activities.items[0].runtime = 'flash@9'; },
  'no fallback': p => { delete p.activities.items[0].fallback; },
  'fallback picture missing': p => { p.activities.items[0].fallback.media = 'nope'; },
  'missing locale': p => { delete p.activities.items[0].strings.ru; p.translations = { el: {}, ru: {} }; },
  'keys differ': p => { delete p.activities.items[0].strings.el.signal; },
  'network': p => { p.activities.items[0].html += '<img src="//x.example/a.png">'; p.activities.items[0].sha256 = null; p.activities.items[0].bytes = null; },
  'handler': p => { p.activities.items[0].html += '<button onclick="x()">'; p.activities.items[0].sha256 = null; p.activities.items[0].bytes = null; },
  'sha mismatch': p => { p.activities.items[0].sha256 = '0'.repeat(64); },
  'no requires': p => { p.requires = []; },
  'unknown activity': p => { p.chapters[0].sections[0].blocks[0].activity = 'nope'; },
  'checks grading': p => { p.chapters[0].exercises[0].grade = { mode: 'checks' }; },
  'bad seed': p => { p.chapters[0].exercises[0].task.seed = -1; },
  'bad height': p => { p.chapters[0].sections[0].blocks[0].height = 50; },
  'too many hints': p => { p.chapters[0].exercises[0].hints = Array(7).fill('h'); },
};
// sim-spec@1: the reference rc-lowpass as a second activity, with its block and a sim exercise graded by checks
const RC = path.join(ROOT, 'tools', 'activities_examples', 'rc-lowpass');
const rcItem = { ...JSON.parse(fs.readFileSync(path.join(RC, 'activity.json'), 'utf8')), spec: JSON.parse(fs.readFileSync(path.join(RC, 'spec.json'), 'utf8')),
  strings: Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(RC, `strings.${l}.json`), 'utf8'))])) };
delete rcItem.entry;
const SIMX = { id: 'ch01-e2', type: 'sim', activity: 'rc-lowpass', task: { seed: 'auto', params: { target: 1000 } }, hints: ['h'],
  grade: { mode: 'checks', checks: [{ expr: 'err <= tol', label: 'checkFc', weight: 3 }, { expr: 'abs(C / 1e-7 - 1) < 0.001', label: 'checkC' }], pass: 1 } };
const sbase = () => { const p = base(); p.media['rc-lowpass-still'] = { w: 600, h: 260 }; p.requires.push('runtime:sim-spec@1'); p.activities.items.push(JSON.parse(JSON.stringify(rcItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'rc-lowpass' }); p.chapters[0].exercises.push(JSON.parse(JSON.stringify(SIMX))); return p; };
const sp = p => p.activities.items[1].spec, sx = p => p.chapters[0].exercises[1];
const scases = {
  'spec good': p => p,
  'spec: no format': p => { sp(p).format = 'x'; },
  'spec: unknown field': p => { sp(p).code = 'alert(1)'; },
  'spec: unknown engine': p => { sp(p).engine = 'warp@9'; },
  'spec: model for formula@1': p => { sp(p).model = { a: 1 }; },
  'spec: outputs for formula@1': p => { sp(p).outputs = [{ id: 'v', kind: 'series' }]; },
  'spec: no params': p => { sp(p).params = []; },
  'spec: 25 params': p => { sp(p).params = Array.from({ length: 25 }, (_, i) => ({ id: 'p' + i, kind: 'toggle', label: 'resistance' })); },
  'spec: min > max': p => { Object.assign(sp(p).params[0], { min: 5, max: 1 }); },
  'spec: default out of range': p => { sp(p).params[0].default = 1e9; },
  'spec: log scale from 0': p => { sp(p).params[1].min = 0; },
  'spec: a reserved name': p => { sp(p).params[0].id = 'constructor'; },
  'spec: pi as a name': p => { sp(p).consts.pi = 3; },
  'spec: false as a name': p => { sp(p).params[0].id = 'false'; },
  'spec: true as the x var': p => { sp(p).plots[0].x.var = 'true'; },
  'spec: a name used twice': p => { sp(p).derived.push({ id: 'fc', expr: '1' }); },
  'spec: unknown variable': p => { sp(p).derived[0].expr = 'R * L'; },
  'spec: not the language': p => { sp(p).readouts[0].expr = 'Math.sqrt(R)'; },
  'spec: property access': p => { sp(p).readouts[0].expr = 'R.constructor'; },
  'spec: a later derived value used early': p => { sp(p).derived[0].expr = 'fc * 2'; },
  'spec: bad choice': p => { sp(p).params.push({ id: 'm', kind: 'choice', label: 'gain', options: [{ value: 1, label: 'gain' }, { value: 1, label: 'time' }], default: 3 }); },
  'spec: a good choice and toggle': p => { sp(p).params.push({ id: 'm', kind: 'choice', label: 'gain', options: [{ value: 1, label: 'gain' }, { value: 2, label: 'time' }], default: 2 }, { id: 'sh', kind: 'toggle', label: 'time', default: true }); },
  'spec: label not in the tables': p => { sp(p).params[0].label = 'nope'; },
  'spec: label missing in one table': p => { delete p.activities.items[1].strings.el.time; },
  'spec: 7 plots': p => { sp(p).plots = Array(7).fill(sp(p).plots[0]); },
  'spec: 2001 points': p => { sp(p).plots[0].points = 2001; },
  'spec: x var clashes': p => { sp(p).plots[0].x.var = 'R'; },
  'spec: series plot without an engine series': p => { sp(p).plots[0] = { kind: 'series', x: { series: 't' }, series: [{ y: 'v' }] }; },
  'spec: bad axis limit expression': p => { sp(p).plots[1].x.max = '5 * taux'; },
  'spec: y min above max': p => { Object.assign(sp(p).plots[0].y, { min: 5, max: -60 }); },
  'spec: bad mark': p => { sp(p).plots[0].marks.push({ axis: 'z', expr: 'fc' }); },
  'spec: unit too long': p => { sp(p).params[0].unit = 'x'.repeat(17); },
  'spec: not an object': p => { p.activities.items[1].spec = [1]; },
  'spec: over 64 KB': p => { sp(p).derived.push(...Array.from({ length: 40 }, (_, i) => ({ id: 'd' + i, expr: Array(900).fill('R').join(' + ') }))); },
  'spec: engine:… in requires': p => { sp(p).engine = 'warp@9'; p.requires.push('engine:warp@9'); },
  'checks: none': p => { sx(p).grade.checks = []; },
  'checks: unknown name': p => { sx(p).grade.checks[0].expr = 'fcut < 1'; },
  'checks: bad weight': p => { sx(p).grade.checks[0].weight = 0; },
  'checks: bad pass': p => { sx(p).grade.pass = 1.5; },
  'checks: label missing': p => { sx(p).grade.checks[0].label = 'nope'; },
  'checks: on an html-app': p => { p.chapters[0].exercises[0].grade = { mode: 'checks', checks: [{ expr: 'fs == 10' }] }; },
  'reported on a sim-spec': p => { sx(p).grade = { mode: 'reported' }; },
  'task param not a const': p => { sx(p).task.params.R = 1; },
  'task param not a number': p => { sx(p).task.params.target = 'big'; },
};
// circuit-mna@1: the fault bench led-bench as the second activity, with a sim exercise graded on the diagnosis
const LB = path.join(ROOT, 'tools', 'activities_examples', 'led-bench');
const lbItem = { ...JSON.parse(fs.readFileSync(path.join(LB, 'activity.json'), 'utf8')), spec: JSON.parse(fs.readFileSync(path.join(LB, 'spec.json'), 'utf8')),
  strings: Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(LB, `strings.${l}.json`), 'utf8'))])) };
delete lbItem.entry;
const BX = { id: 'ch01-e3', type: 'sim', activity: 'led-bench', task: { seed: 7, params: { fault: 'ledReversed' } }, hints: ['h'],
  grade: { mode: 'checks', checks: [{ expr: 'correct', label: 'checkDx', weight: 3 }, { expr: 'measurements <= 6', label: 'checkEff' }], pass: 0.75 } };
const cbase = () => { const p = base(); p.media['led-bench-still'] = { w: 600, h: 260 }; p.requires.push('runtime:sim-spec@1', 'engine:circuit-mna@1'); p.activities.items.push(JSON.parse(JSON.stringify(lbItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'led-bench' }); p.chapters[0].exercises.push(JSON.parse(JSON.stringify(BX))); return p; };
const bn = p => sp(p).bench, md = p => sp(p).model;
const RT = path.join(ROOT, 'tools', 'activities_examples', 'rc-transient');
const ccases = {
  'circuit good': p => p,
  'circuit: rc-transient (no bench)': p => { p.activities.items[1].spec = JSON.parse(fs.readFileSync(path.join(RT, 'spec.json'), 'utf8')); p.activities.items[1].strings = Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(RT, `strings.${l}.json`), 'utf8'))])); Object.assign(sx(p), { task: { seed: 'auto', params: {} }, grade: { mode: 'checks', checks: [{ expr: 'abs(vAt / Vs - frac) <= tol', label: 'checkPct' }] } }); },
  'circuit: no engine:… in requires': p => { p.requires = p.requires.filter(x => x !== 'engine:circuit-mna@1'); },
  'circuit: no model': p => { delete sp(p).model; },
  'circuit: a bad netlist': p => { md(p).netlist.elements[2].value = -5; },
  'circuit: an unknown model field': p => { md(p).spice = '.tran'; },
  'circuit: a binding to no part': p => { md(p).bindings[0].element = 'SW9'; },
  'circuit: a binding to no prop': p => { md(p).bindings[0].prop = 'colour'; },
  'circuit: a binding with a bad expression': p => { md(p).bindings[0].expr = 'closed && nope'; },
  'circuit: a bad transient': p => { md(p).transient = { tEnd: 1, dt: 1e-9 }; },
  'circuit: bad noise': p => { md(p).noise = { rel: 2 }; },
  'circuit: an output on no node': p => { sp(p).outputs = [{ id: 'v', kind: 'scalar', node: 'zz' }]; },
  'circuit: a bad stat': p => { sp(p).outputs = [{ id: 'v', kind: 'scalar', node: 'a', stat: 'median' }]; },
  'circuit: a good scalar output in a readout': p => { sp(p).outputs = [{ id: 'va', kind: 'scalar', node: 'a' }]; sp(p).readouts = [{ label: 'tp3', expr: 'va', unit: 'V' }]; },
  'circuit: a bench name in a readout': p => { sp(p).readouts = [{ label: 'tp3', expr: 'diagnosis' }]; },
  'circuit: a bench on formula@1': p => { sp(p).engine = 'formula@1'; delete sp(p).model; p.requires = p.requires.filter(x => x !== 'engine:circuit-mna@1'); },
  'circuit: a bench without faults': p => { bn(p).faults = []; },
  'circuit: a fault id twice': p => { bn(p).faults[1].id = 'ledReversed'; },
  'circuit: a fault on no part': p => { bn(p).faults[0].apply[0].element = 'D9'; },
  'circuit: an unknown fault kind': p => { bn(p).faults[0].apply[0].kind = 'melt'; },
  'circuit: open-trace on a side that does not touch': p => { bn(p).faults[4].apply[0].side = ['V1']; },
  'circuit: a point on no node': p => { bn(p).points[0].at = 'TP9'; },
  'circuit: a point on no pin': p => { bn(p).points[3].at = '@D1.7'; },
  'circuit: a point label missing': p => { bn(p).points[0].label = 'nope'; },
  'circuit: an unknown instrument': p => { bn(p).instruments.push({ kind: 'spectrum' }); },
  'circuit: an ammeter on no part': p => { bn(p).instruments[1].parts[0].element = 'R7'; },
  'circuit: a scope and a logic analyser': p => { bn(p).instruments.push({ kind: 'scope', tEnd: 0.001, dt: 1e-5 }, { kind: 'logic', tEnd: 0.001, threshold: 2.5 }); },
  'circuit: a bad budget': p => { bn(p).budget = 0; },
  'circuit: a diagnosis that names no fault': p => { bn(p).diagnosis.options[2].fault = 'rMelt'; },
  'circuit: a fault no diagnosis names': p => { bn(p).diagnosis.options.pop(); },
  'circuit: a diagnosis label missing in one table': p => { delete p.activities.items[1].strings.ru.dxTrace; },
  'circuit: a diagnosis label missing everywhere': p => { bn(p).diagnosis.options[0].label = 'dxNope'; },
  'circuit: one option': p => { bn(p).diagnosis.options = bn(p).diagnosis.options.slice(0, 1); },
  'circuit: an unknown bench field': p => { bn(p).answer = 'ledReversed'; },
  'circuit: task.fault not a fault': p => { sx(p).task.params.fault = 'ledShort'; },
  'circuit: task.fault a list': p => { sx(p).task.params.fault = ['ledOpen', 'rOpen']; },
  'circuit: task.fault a bad list': p => { sx(p).task.params.fault = ['ledOpen', 3]; },
  'circuit: a check on the diagnosis index': p => { sx(p).grade.checks[0].expr = 'diagnosis == 6'; },
  'circuit: a check on an unknown name': p => { sx(p).grade.checks[1].expr = 'measures <= 6'; },
};
// wasm-module@1 (P6): the reference wasm-oscillator (a module with its own spec) as the second activity, with a sim exercise graded by checks
const WO = path.join(ROOT, 'tools', 'activities_examples', 'wasm-oscillator'), FIXW = path.join(ROOT, 'tests', 'fixtures', 'wasm');
const wasmOf = b => ({ wasm: b.toString('base64'), sha256: crypto.createHash('sha256').update(b).digest('hex'), bytes: b.length });
const woItem = { ...JSON.parse(fs.readFileSync(path.join(WO, 'activity.json'), 'utf8')), ...wasmOf(fs.readFileSync(path.join(WO, 'module.wasm'))), spec: JSON.parse(fs.readFileSync(path.join(WO, 'spec.json'), 'utf8')),
  strings: Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(WO, `strings.${l}.json`), 'utf8'))])) };
const WX = { id: 'ch01-e4', type: 'sim', activity: 'wasm-oscillator', task: { seed: 'auto', params: {} }, hints: ['h'],
  grade: { mode: 'checks', checks: [{ expr: 'E <= share * E0', label: 'checkLeft', weight: 3 }, { expr: 'abs(k - 4) < 0.01', label: 'checkK' }] } };
const wbase = () => { const p = base(); p.media['wasm-oscillator-still'] = { w: 600, h: 260 }; p.requires.push('runtime:wasm-module@1', 'engine:wasm@1'); p.activities.items.push(JSON.parse(JSON.stringify(woItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'wasm-oscillator' }); p.chapters[0].exercises.push(JSON.parse(JSON.stringify(WX))); return p; };
const wi = p => p.activities.items[1];
/** the module alone (no spec) + a sim-spec@1 activity whose engine wasm@1 runs it (the second way in) */
const viaSpec = p => { const m = wi(p), s = m.spec; delete m.spec; m.id = 'osc-core'; p.chapters[0].sections[0].blocks.pop(); p.chapters[0].exercises.pop();
  p.activities.items.push({ id: 'osc-sim', runtime: 'sim-spec@1', stateVersion: 1, spec: { ...s, engine: 'wasm@1', model: { ...s.model, module: 'osc-core' } }, strings: m.strings, fallback: m.fallback });
  p.requires.push('runtime:sim-spec@1'); p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'osc-sim' }); };
const wcases = {
  'wasm good': p => p,
  'wasm: through a sim-spec@1 spec (engine wasm@1)': viaSpec,
  'wasm: the spec names no module': p => { viaSpec(p); p.activities.items[2].spec.model.module = 'nope'; },
  'wasm: the module without its own spec in a block': p => { delete wi(p).spec; p.chapters[0].exercises.pop(); },
  'wasm: sha256 does not match': p => { wi(p).sha256 = '0'.repeat(64); },
  'wasm: not base64': p => { wi(p).wasm = 'not base64!'; },
  'wasm: no scratch and no alloc': p => { wi(p).abi = {}; },
  'wasm: a forbidden import': p => { Object.assign(wi(p), wasmOf(fs.readFileSync(path.join(FIXW, 'forbidden.wasm')))); },
  'wasm: memory over the limit': p => { Object.assign(wi(p), wasmOf(fs.readFileSync(path.join(FIXW, 'bigmem.wasm')))); },
  'wasm: the own spec on another engine': p => { wi(p).spec.engine = 'formula@1'; },
  'wasm: the own spec names another module': p => { wi(p).spec.model.module = 'other'; },
  'wasm: a model output not declared': p => { wi(p).spec.model.outputs.push({ id: 'v', n: 50 }); },
  'wasm: a model input with an unknown name': p => { wi(p).spec.model.inputs[0] = 'kk'; },
  'wasm: no engine:wasm@1 in requires': p => { p.requires = p.requires.filter(x => x !== 'engine:wasm@1'); },
  'wasm: graded "reported"': p => { p.chapters[0].exercises[1].grade = { mode: 'reported' }; },
  'wasm: a check with an unknown name': p => { p.chapters[0].exercises[1].grade.checks[0].expr = 'Eend < 1'; },
};
// external-embed@1 (P6): an allow-listed outside page (PhET) in a theory block — explore only
const emItem = { id: 'ohm-phet', runtime: 'external-embed@1', stateVersion: 1, provider: 'phet', url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html?locale=en',
  credit: 'PhET Interactive Simulations, University of Colorado Boulder · Ohm’s Law · CC-BY-4.0 · https://phet.colorado.edu', license: 'CC-BY-4.0', height: 480,
  fallback: { media: 'ohm-still', text: 'Ohm’s law: the current grows with the voltage and falls with the resistance (I = V / R).' },
  strings: { en: { title: 'Ohm’s law simulation', why: 'Move V and R and watch I.' } } };
const ebase = () => { const p = base(); p.media['ohm-still'] = { w: 600, h: 260 }; p.requires.push('runtime:external-embed@1'); p.activities.items.push(JSON.parse(JSON.stringify(emItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'ohm-phet' }); return p; };
const ei = p => p.activities.items[1];
const ecases = {
  'embed good': p => p,
  'embed: a pending provider (Wokwi)': p => Object.assign(ei(p), { provider: 'wokwi', url: 'https://wokwi.com/projects/305569599398609473', credit: 'Blink · simulated on Wokwi (wokwi.com)', license: 'Wokwi-ToS' }),
  'embed: a pending provider (Falstad)': p => Object.assign(ei(p), { provider: 'falstad', url: 'https://www.falstad.com/circuit/circuitjs.html?ctz=abc', credit: 'Circuit simulator by Paul Falstad', license: 'GPL-2.0-or-later' }),
  'embed: an unknown provider': p => { ei(p).provider = 'flashsims'; },
  'embed: http': p => { ei(p).url = ei(p).url.replace('https:', 'http:'); },
  'embed: another origin': p => { ei(p).url = 'https://evil.example/sims/html/ohms-law/latest/ohms-law_all.html'; },
  'embed: an entry': p => { ei(p).entry = 'activities/ohm-phet/app.html'; },
  'embed: no credit': p => { delete ei(p).credit; },
  'embed: no title': p => { delete ei(p).strings.en.title; },
  'embed: in a sim exercise': p => { p.chapters[0].exercises.push({ id: 'ch01-e5', type: 'sim', activity: 'ohm-phet', grade: { mode: 'reported' } }); },
  'embed: no runtime in requires': p => { p.requires = p.requires.filter(x => x !== 'runtime:external-embed@1'); },
};
const packs = [...Object.entries(cases).map(([k, f]) => { const p = base(); f(p); return [k, p]; }), ...Object.entries(scases).map(([k, f]) => { const p = sbase(); f(p); return [k, p]; }), ...Object.entries(ccases).map(([k, f]) => { const p = cbase(); f(p); return [k, p]; }),
  ...Object.entries(wcases).map(([k, f]) => { const p = wbase(); f(p); return [k, p]; }), ...Object.entries(ecases).map(([k, f]) => { const p = ebase(); f(p); return [k, p]; })];
const GOOD = new Set(['good', 'spec good', 'spec: a good choice and toggle', 'circuit good', 'circuit: rc-transient (no bench)', 'circuit: a good scalar output in a readout', 'circuit: a scope and a logic analyser', 'circuit: task.fault a list', 'circuit: a check on the diagnosis index',
  'wasm good', 'wasm: through a sim-spec@1 spec (engine wasm@1)', 'embed good']);
const tmp = path.join(require('os').tmpdir(), 'noema-act-parity.json'); fs.writeFileSync(tmp, JSON.stringify(packs));
const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
out = {}
for k, p in json.load(open(sys.argv[1], encoding='utf-8')):
    e, w = A.check_activities(p, list((p.get('translations') or {}).keys())); out[k] = [len(e), len(w)]
print(json.dumps(out))`, tmp], { encoding: 'utf8' }));
for (const [k, p] of packs) {
  const js = P.checkActivities(p, Object.keys(p.translations || {}));
  const same = js.errors.length === py[k][0];
  ok(same && (GOOD.has(k) ? js.errors.length === 0 : js.errors.length > 0), `${k}: JS ${js.errors.length} error(s), Python ${py[k][0]}${GOOD.has(k) ? ' (a good pack passes)' : ' — ' + (js.errors[0] || '').slice(0, 110)}${same ? '' : '  JS: ' + js.errors.join(' | ')}`);
}
{ // P6: the same messages (not only the same counts) for wasm-module@1 and external-embed@1 packs
  const py3 = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
print(json.dumps([A.check_activities(p, list((p.get('translations') or {}).keys())) for k, p in json.load(open(sys.argv[1], encoding='utf-8')) if k.startswith(('wasm', 'embed'))], ensure_ascii=False))`, tmp], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  const js3 = packs.filter(([k]) => /^(wasm|embed)/.test(k)).map(([, p]) => P.checkActivities(p, Object.keys(p.translations || {})));
  const norm = l => l.map(m => m.replace(/'/g, '"'));
  const diff = js3.map((r, i) => JSON.stringify([norm(r.errors), norm(r.warnings)]) === JSON.stringify([norm(py3[i][0]), norm(py3[i][1])]) ? null : [r, py3[i]]).filter(Boolean);
  ok(js3.length >= 25 && !diff.length, `wasm-module@1 and external-embed@1: checkActivities (JS) and check_activities (Python) give the same errors and warnings on ${js3.length} packs ${diff.length ? JSON.stringify(diff[0]).slice(0, 700) : ''}`);
  const msg = k => (P.checkActivities(packs.find(x => x[0] === k)[1]).errors[0] || '');
  ok(/forbidden|import: env\.fetch_url/.test(msg('wasm: a forbidden import')) && /sim-embed/.test(msg('embed: in a sim exercise')) && /provider-pending/.test(msg('embed: a pending provider (Falstad)')) && /url-scheme/.test(msg('embed: http')),
    'a forbidden import, a graded outside page, a pending provider (Falstad, CircuitJS1, Wokwi: no framing permission) and http are refused with their codes');
  ok(P.needRequires([woItem]).join() === 'activities/v1,runtime:wasm-module@1,engine:wasm@1','pack.requires of a wasm-module@1 item with its own spec: runtime:wasm-module@1 and engine:wasm@1');
}
ok(P.TYPES.has('sim') && P.BLOCKS.has('interactive'), 'packcheck knows the sim type and the interactive block');
{ // the same messages, not only the same counts, for the spec rules
  const py2 = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
print(json.dumps([A.check_spec(p['activities']['items'][1].get('spec'), p['activities']['items'][1].get('strings')) for k, p in json.load(open(sys.argv[1], encoding='utf-8')) if k.startswith('spec') or k.startswith('circuit')], ensure_ascii=False))`, tmp], { encoding: 'utf8' }));
  const js2 = packs.filter(([k]) => k.startsWith('spec') || k.startsWith('circuit')).map(([, p]) => P.checkSimSpec(p.activities.items[1].spec, p.activities.items[1].strings));
  const norm = l => l.map(m => m.replace(/'/g, '"'));   // (Python's repr quotes with ', the JS twin with ")
  const diff = js2.map((e, i) => JSON.stringify(norm(e)) === JSON.stringify(norm(py2[i])) ? null : [e, py2[i]]).filter(Boolean);
  ok(!diff.length, 'checkSimSpec (JS) and check_spec (Python) give the same messages ' + (diff.length ? JSON.stringify(diff[0]).slice(0, 600) : ''));
}
{ // the circuit checker: NoemaCircuit.check / checkFaults (JS) and tools/circuit.py check / check_faults give the same findings
  const C = globalThis.NoemaCircuit;
  const cases=[
   null, 5, {nodes:'a'}, {format:'x',nodes:[],elements:[]},
   {nodes:['a',{name:'TP',probe:'a'},{name:'T2',probe:'zz'},'a','b c',{name:'gnd',probe:'a'}],elements:[{id:'R1',type:'R',n:['a','gnd'],value:'4.7k',x:1},{id:'R1',type:'R',n:['TP','q'],value:-1},{id:'1x',type:'Q',n:[]},{id:'C1',type:'C',n:['a','gnd'],value:'1u',ic:'x'},{id:'V1',type:'V',n:['a','gnd'],value:{pulse:{v1:0,v2:5,width:1,period:0.5,zz:1}}},{id:'V2',type:'V',n:['a','gnd'],value:{sine:{amp:1}}},{id:'V3',type:'V',n:['a','gnd'],value:{dc:'x'}},{id:'V4',type:'V',n:['a','gnd'],value:{dc:1,pwm:{}}},{id:'V5',type:'V',n:['a','gnd'],value:{pwm:{v:5,freq:1e3,duty:2}}},{id:'D1',type:'D',n:['a','gnd'],preset:'nope',value:1,on:true},{id:'S1',type:'SW',n:['a','gnd'],on:'yes',params:{Ron:0,Zz:1}},{id:'U1',type:'OPAMP',n:['a','gnd','a'],params:{rails:[5,1]}},{id:'R9',type:'R',n:['a',5],value:null},{id:'Q1',type:['NPN'],n:['a','a','gnd']}]},
   {nodes:['a','b','c','d'],elements:[{id:'V1',type:'V',n:['a','gnd'],value:5},{id:'V2',type:'V',n:['a','gnd'],value:5},{id:'R1',type:'R',n:['b','b'],value:1},{id:'C1',type:'C',n:['c','gnd'],value:1e-6},{id:'U1',type:'OPAMP',n:['a','b','a']}]},
   {nodes:['a','b'],elements:[{id:'R1',type:'R',n:['a','b'],value:1}]},
   {nodes:Array.from({length:61},(_, i)=>'n'+i),elements:[]},
  ];
  const nl={nodes:['vin','a'],elements:[{id:'V1',type:'V',n:['vin','gnd'],value:5},{id:'R1',type:'R',n:['vin','a'],value:220},{id:'D1',type:'D',n:['a','gnd'],preset:'led-red'},{id:'Q1',type:'NPN',n:['a','vin','gnd']}]};
  const fl=[[{element:'D1',kind:'reverse'},{element:'R9',kind:'open'},{element:'R1',kind:'melt'},{node:'zz',kind:'open-trace'},{element:'R1',kind:'drift',factor:0},{element:'D1',kind:'drift',param:'gain'},{element:'R1',kind:'open',pin:2},{node:'a',kind:'open-trace',side:['V1','R1.1','R1.0',5]},{element:'R1',kind:'open',colour:'red'},{element:'Q1',kind:'reverse'},{element:'Q1',kind:'short',pins:[0,0]},{node:'vin',kind:'open-trace'},{node:'gnd',kind:'open-trace',side:[]},5,{element:'Q1',kind:'drift',param:'betaF',factor:'2k'}], 'x'];
  const ctmp = path.join(require('os').tmpdir(), 'noema-circuit-parity.json'); fs.writeFileSync(ctmp, JSON.stringify({ cases, nl, fl }));
  const cpy = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import circuit as C; d = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({'c': [C.check(c) for c in d['cases']], 'f': [C.check_faults(d['nl'], f) for f in d['fl']]}, ensure_ascii=False))`, ctmp], { encoding: 'utf8' }));
  const cjs = { c: cases.map(c => C.check(c)), f: fl.map(f => C.checkFaults(nl, f)) };
  const cdiff = ['c', 'f'].flatMap(k => cjs[k].map((r, i) => JSON.stringify(r) === JSON.stringify(cpy[k][i]) ? null : [k, i, r, cpy[k][i]]).filter(Boolean));
  ok(!cdiff.length && cjs.f.flat().length >= 8, `netlist and fault checks: JS and Python agree on ${cases.length} netlists and ${fl.length} fault lists ${cdiff.length ? JSON.stringify(cdiff[0]).slice(0, 500) : ''}`);
}
ok(!('sim-spec@1' in P.ACTIVITY_RULES.LATER) && P.ACTIVITY_RULES.RUNTIMES.has('sim-spec@1') && 'py-module@1' in P.ACTIVITY_RULES.LATER && 'h5p@1' in P.ACTIVITY_RULES.LATER, 'sim-spec@1 is a runtime now; py-module@1 and h5p@1 stay for later');
ok(JSON.stringify(P.needRequires(sbase().activities.items)) === JSON.stringify(['activities/v1', 'runtime:html-app@1', 'runtime:sim-spec@1']) && P.needRequires([{ runtime: 'sim-spec@1', spec: { engine: 'circuit-mna@1' } }]).includes('engine:circuit-mna@1'), 'pack.requires: the runtimes, and every engine but the built-in formula@1');
{ // the runtime's own words go through tE() and exist in every UI language (the drafts)
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_activity_sim.js'), 'utf8'), keys = [...new Set([...src.matchAll(/tE\('(engine\.act\.(?:sim|bench)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*)'/g)].map(m => m[1]))];
  for (const k of ['V', 'I', 'R', 'scope', 'logic']) keys.push('engine.act.bench.inst.' + k);   // (built: 'engine.act.bench.inst.' + kind)
  const src32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8'); for (const m of src32.matchAll(/tE\('(engine\.act\.sim\.[a-z]+)'/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'en.arb'), 'utf8')), dr = fs.readdirSync(path.join(ROOT, 'i18n', 'engine', 'drafts'));
  const miss = keys.filter(k => !en[k]).concat(...dr.map(f => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'drafts', f), 'utf8')); return keys.filter(k => !d[k]).map(k => f + ':' + k); }));
  ok(keys.length >= 5 && !miss.length, `the sim runtime's ${keys.length} host strings are in en.arb and in all ${dr.length} drafts ${miss.slice(0, 3).join(' ')}`);
}
{ // the sim runtime renders without a frame and never runs pack code: no eval / Function / HTML from the pack
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_activity_sim.js'), 'utf8');
  ok(!/\beval\s*\(|new\s+Function|innerHTML|insertAdjacentHTML|document\.write/.test(src) && /NoemaPackCheck\.checkSimSpec\(spec, tables, ACT\.engines\(\)\)/.test(src) && /NoemaExpr\.compile/.test(src), 'sim-spec@1: no eval, no new Function, no HTML from the pack; the spec is checked before it is shown; formulas only through NoemaExpr');
}

// 4. never allow-same-origin
const files = cp.execSync('git ls-files engine cloud tools skill', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.(js|mjs|py|html)$/.test(f) && !f.startsWith('engine/i18n/') && !f.includes('vendor/'));
const bad = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/sandbox['"]?\s*[:,=]\s*['"`][^'"`]*allow-same-origin/g)) bad.push(f + ': ' + m[0].slice(0, 80));   // a sandbox VALUE with the token
}
const okFiles = ['engine/viewer.js'];   // (the source viewer frames an outside web page from its own URL: its own origin, never pack content)
ok(bad.filter(b => !okFiles.some(f => b.startsWith(f))).length === 0, 'no code gives a frame allow-same-origin ' + JSON.stringify(bad.filter(b => !okFiles.some(f => b.startsWith(f))).slice(0, 3)));
ok(/setAttribute\('sandbox', 'allow-scripts'\)/.test(fs.readFileSync(path.join(ROOT, 'engine', 'src', '34_activity_html.js'), 'utf8')), 'html-app@1 sets sandbox to exactly allow-scripts');
// 5. the content author learns it: the connector's guide has the part "interactive" (docs/INTERACTIVE.md + the playbook), the skill ships the toolkit
const srv = fs.readFileSync(path.join(ROOT, 'cloud', 'mcp', 'server.mjs'), 'utf8'), bld = fs.readFileSync(path.join(ROOT, 'tools', 'build.py'), 'utf8');
ok(/enum: \['workflow', 'content', 'visual', 'interactive'/.test(srv) && /interactive: DOCS\.interactive/.test(srv) && /docs\['interactive'\] = rd\('docs\/INTERACTIVE\.md'\)/.test(bld), 'noema_authoring_guide serves part "interactive" (and in "all")');
for (const f of ['activity_new.py', 'activity_lint.py', 'activity_test.py', 'activity_preview.py', 'activity_harness.js']) ok(fs.existsSync(path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', f)), 'the skill has ' + f);
ok(/'activities\.py'/.test(bld) && /'simexpr\.py'/.test(bld) && /activity_host/.test(bld) && /'35_activity_sim\.js', '35_simexpr\.js'/.test(bld) && /activities_examples/.test(bld), 'the skill zip carries activities.py, simexpr.py, the runtimes for the harness (html-app, sim-spec) and the reference activities');
ok(/'circuit\.py'/.test(bld) && /'36_engine_circuit\.js', '36_engine_circuit_sim\.js'/.test(bld) && /'INTERACTIVE_SIMEXPR\.md', 'INTERACTIVE_CIRCUIT\.md'\)(?: \+ INTERACTIVE_P6)? if/.test(bld), 'the skill zip carries circuit.py and the circuit engine for the harness; the guide part "interactive" includes the circuit engine');
ok(['wasm_check.py', 'embed_check.py', 'embed_allow.json', 'h5p_import.py'].every(f => new RegExp(`SKILL_TOOLS = \\[[^\\]]*'${f.replace('.', '\\.')}'`).test(bld)) && /'44_activity_wasm\.js'\): z\.write/.test(bld)
  && /INTERACTIVE_P6 = \('INTERACTIVE_WASM\.md', 'INTERACTIVE_EMBED\.md', 'INTERACTIVE_XAPI\.md'\)/.test(bld) && /'INTERACTIVE_CIRCUIT\.md'\) \+ INTERACTIVE_P6 if os\.path\.exists/.test(bld) && ['INTERACTIVE_WASM.md', 'INTERACTIVE_EMBED.md', 'INTERACTIVE_XAPI.md'].every(f => fs.existsSync(path.join(ROOT, 'docs', f))),
  'P6: the skill zip carries wasm_check.py, embed_check.py + the allow-list, h5p_import.py and the wasm runtime for the harness; the guide part "interactive" includes the wasm, embed and xAPI pages');
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(['44_activity_wasm.js', '45_activity_embed.js'].every(f => html.includes('engine/src/' + f) && new RegExp(`'engine/src/${f.replace('.', '\\.')}'`).test(bld.split('MCP_ENGINE = ')[1].split('\n')[0]) && bld.includes(`rd("engine/src/${f}")`) && new RegExp(`\\('44_activity_wasm\\.js', '45_activity_embed\\.js'\\): shutil\\.copy`).test(bld))
    && /^var NoemaEmbed = /m.test(fs.readFileSync(path.join(ROOT, 'engine', 'src', '45_activity_embed.js'), 'utf8')),
    'the shell, the site, the one-file bundle and the connector load NoemaWasm and NoemaEmbed beside packcheck.js (45 declares var: it is loaded twice in the app)'); }
{ const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
  ok(/why === 'embed-refused' \|\| why === 'embed-graded' \? stop\(tE\('engine\.act\.embed\.refused'\), false\)/.test(src) && /why === 'embed-offline' \? stop\(tE\('engine\.act\.embed\.offline'\)\)/.test(src) && /why === 'embed-timeout' \? stop\(tE\('engine\.act\.embed\.timeout'/.test(src),
    'the core: a refused or graded outside page stops without Restart; offline or not loaded stops with Restart (retry)'); }
ok(/'engine\/src\/35_simexpr\.js', 'engine\/src\/36_engine_circuit\.js', 'engine\/packcheck\.js'/.test(bld) && /INTERACTIVE_SIMEXPR\.md/.test(bld), 'the connector runs NoemaExpr beside packcheck (sim-spec checks) and serves the expression language in the guide');
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), a = html.indexOf('engine/src/35_simexpr.js'), b = html.indexOf('engine/packcheck.js'), c = html.indexOf('engine/src/36_engine_circuit.js');
  ok(a > 0 && a < b && c > 0 && c < b && /\('35_simexpr\.js', '36_engine_circuit\.js'\)\]   # NoemaExpr and NoemaCircuit beside packcheck/.test(bld) && /rd\("engine\/src\/35_simexpr\.js"\)\)\}<\/script>\n<script>\{esc\(rd\("engine\/src\/36_engine_circuit\.js"\)\)\}<\/script>\n<script>\{esc\(rd\("engine\/packcheck\.js"/.test(bld),
    'the shell, the site and the one-file bundle load NoemaExpr and NoemaCircuit before packcheck.js (a sim-spec pack imported before any subject is open is checked, not refused)'); }
{ // activity_new.py --runtime sim-spec@1 starts from rc-lowpass
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noema-actnew-'));
  const r = cp.spawnSync('python3', [path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_new.py'), d, 'my-filter', '--runtime', 'sim-spec@1'], { encoding: 'utf8' });
  const reg = fs.existsSync(path.join(d, 'activities', 'activities.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'activities', 'activities.json'), 'utf8')) : null;
  ok(r.status === 0 && reg?.items?.[0]?.runtime === 'sim-spec@1' && reg.items[0].entry === 'activities/my-filter/spec.json' && fs.existsSync(path.join(d, 'activities', 'my-filter', 'spec.json')) && fs.existsSync(path.join(d, 'activities', 'my-filter', 'strings.fr.json')), 'activity_new.py --runtime sim-spec@1 copies rc-lowpass (spec.json, strings, the registry entry)');
}
{ // activity_new.py --from led-bench / rc-transient starts from a circuit reference
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noema-actnew-'));
  const sc = path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_new.py');
  const r1 = cp.spawnSync('python3', [sc, d, 'my-bench', '--from', 'led-bench'], { encoding: 'utf8' }), r2 = cp.spawnSync('python3', [sc, d, 'my-rc', '--from', 'rc-transient'], { encoding: 'utf8' });
  const r3 = cp.spawnSync('python3', [sc, d, 'my-x', '--from', 'led-bench', '--runtime', 'html-app@1'], { encoding: 'utf8' });
  const reg = fs.existsSync(path.join(d, 'activities', 'activities.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'activities', 'activities.json'), 'utf8')) : null;
  const sp1 = fs.existsSync(path.join(d, 'activities', 'my-bench', 'spec.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'activities', 'my-bench', 'spec.json'), 'utf8')) : {};
  const t1 = fs.existsSync(path.join(d, 'activities', 'my-bench', 'tests.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'activities', 'my-bench', 'tests.json'), 'utf8')) : {};
  ok(r1.status === 0 && r2.status === 0 && r3.status !== 0 && reg?.items?.length === 2 && reg.items.every(x => x.runtime === 'sim-spec@1') && sp1.engine === 'circuit-mna@1' && sp1.bench && t1.cases?.[0]?.steps?.[0]?.measure && fs.existsSync(path.join(d, 'activities', 'my-rc', 'strings.ru.json')),
    'activity_new.py --from led-bench / rc-transient copies a circuit reference (a bench with its measure/diagnose tests); a runtime that does not fit is refused');
}
console.log(fails ? `\n${fails} of ${n} failed` : `\nactivities: ${n} checks passed`); process.exit(fails ? 1 : 0);
