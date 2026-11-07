/* Interactive activities without a browser (docs/INTERACTIVE.md, docs/adr/001):
   1. the loop guard (engine/src/33_activity_guard.js): every loop gets the guard, nothing else changes, the program still runs
      the same, an endless loop throws; strings, templates, regexes and comments are left alone;
   2. the protocol checks (ACTP in engine/src/32_activities.js): sizes, types, payloads, a newer version;
   3. the rules in JS (engine/packcheck.js checkActivities) and Python (tools/activities.py) give the same errors on the same packs,
      html-app@1, sim-spec@1 and py-module@1 (the Python file's lint, packages and the allow-list, requiresNetwork, stepMs, its spec) (the spec: shape, limits, names, every expression through NoemaExpr / simexpr, engines, string keys;
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
ok(ACTP.check(M('py:out', { outputs: { a: 1 } }, { re: 'py1' })).ok && ACTP.check(M('py:status', { phase: 'ready' })).ok && !ACTP.check(M('py:out', { error: { code: 'BAD CODE' } })).ignore, 'py:out and py:status are known (no strike for the Python runtime\'s own traffic; a bad one is still refused)');

// 3. the same rules in JS and Python
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaCircuit = ENGINES.kernel('circuit'), NoemaEngineCatalog = ENGINES.lib.catalog, NoemaThermal = ENGINES.mod('thermal@1'), NoemaPID = ENGINES.mod('pid@1'), NoemaRF = ENGINES.mod('rf@1'), NoemaTwin = ENGINES.mod('twin@1');
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
  'later runtime': p => { p.activities.items[0].runtime = 'h5p@1'; },
  'py-module without its Python and spec': p => { p.activities.items[0].runtime = 'py-module@1'; p.requires.push('runtime:py-module@1'); },
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
// the P6 engines (docs/INTERACTIVE_ENGINES.md): each reference activity as the second activity, with its sim exercise graded by checks;
// the validators call each engine's own checkSpec (JS) / check_spec (Python) and check every expression of the model (bindings, times, at)
const P6X = path.join(ROOT, 'tools', 'activities_examples');
const p6item = id => { const d = path.join(P6X, id); const it = { ...JSON.parse(fs.readFileSync(path.join(d, 'activity.json'), 'utf8')), spec: JSON.parse(fs.readFileSync(path.join(d, 'spec.json'), 'utf8')),
  strings: Object.fromEntries(['en', 'el', 'ru', 'fr'].map(l => [l, JSON.parse(fs.readFileSync(path.join(d, `strings.${l}.json`), 'utf8'))])) }; delete it.entry; return it; };
const P6EX = {
  heatsink: { id: 'ch01-e904', engine: 'thermal@1', checks: [{ expr: 'tjSS <= TjMax', label: 'checkTj', weight: 2 }, { expr: 'Rsa >= RsaMin', label: 'checkCheap' }] },
  'pid-tune': { id: 'ch01-e905', engine: 'pid@1', checks: [{ expr: 'os < osMax', label: 'checkOs' }, { expr: 'ts < tsMax', label: 'checkTs' }, { expr: 'abs(ess) < essMax', label: 'checkEss' }] },
  'lora-link': { id: 'ch01-e906', engine: 'rf@1', checks: [{ expr: 'margin >= marginMin', label: 'checkMargin', weight: 2 }, { expr: 'air <= airMax', label: 'checkAir' }] },
  'sensor-node': { id: 'ch01-e907', engine: 'twin@1', checks: [{ expr: 'life / 86400 >= daysMin', label: 'checkLife', weight: 2 }, { expr: 'perDay >= perDayMin', label: 'checkRate' }] },
};
const p6base = aid => () => { const p = base(), x = P6EX[aid]; p.media[aid + '-still'] = { w: 600, h: 260 }; p.requires.push('runtime:sim-spec@1', 'engine:' + x.engine); p.activities.items.push(p6item(aid));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: aid }); p.chapters[0].exercises.push({ id: x.id, type: 'sim', activity: aid, task: { seed: 'auto', params: {} }, hints: ['h'], grade: { mode: 'checks', checks: JSON.parse(JSON.stringify(x.checks)) } }); return p; };
// twin@1's fault-finding bench on sensor-node: the battery's voltage, the supply current (meter and scope), the event log, the RSSI
const TWIN_BENCH = { faults: [{ id: 'antenna', apply: [{ kind: 'antenna-detached' }] }, { id: 'ageing', apply: [{ kind: 'battery-ageing' }] }, { id: 'wake', apply: [{ kind: 'wake-period', factor: 0.1 }] }],
  points: [{ id: 'VBAT', at: 'vbat', label: 'ptVbat' }, { id: 'VLOAD', at: 'vload', label: 'ptVload' }, { id: 'GND', at: 'gnd', label: 'ptGnd' }, { id: 'ISENSE', at: 'i', label: 'ptI' }],
  instruments: [{ kind: 'V', points: ['VBAT', 'VLOAD', 'GND'] }, { kind: 'I', parts: [{ element: 'battery', label: 'ptI' }] }, { kind: 'scope', points: ['ISENSE'], tEnd: 1300 }, { kind: 'log' }, { kind: 'rssi' }],
  budget: 6, diagnosis: { options: [{ label: 'dxAntenna', fault: 'antenna' }, { label: 'dxAgeing', fault: 'ageing' }, { label: 'dxWake', fault: 'wake' }, { label: 'dxNone' }] } };
const TWIN_BENCH_WORDS = { ptVbat: 'battery (open circuit)', ptVload: 'battery under load (lowest)', ptGnd: 'ground', ptI: 'supply current', dxAntenna: 'the antenna is loose', dxAgeing: 'the battery has aged', dxWake: 'the wake period is set too short', dxNone: 'nothing is wrong' };
const twinBench = p => { sp(p).bench = JSON.parse(JSON.stringify(TWIN_BENCH)); for (const l of Object.keys(p.activities.items[1].strings)) Object.assign(p.activities.items[1].strings[l], TWIN_BENCH_WORDS);
  Object.assign(sx(p), { task: { seed: 3, params: { fault: 'antenna' } }, grade: { mode: 'checks', pass: 0.75, checks: [{ expr: 'correct', label: 'checkLife', weight: 3 }, { expr: 'measurements <= 4', label: 'checkRate' }] } }); };
const tb = p => sp(p).bench;
const p6cases = {
  heatsink: {
    'thermal good': p => p,
    'thermal: no engine:… in requires': p => { p.requires = p.requires.filter(x => x !== 'engine:thermal@1'); },
    'thermal: no network': p => { delete md(p).network; },
    'thermal: a link with R and G': p => { md(p).network.links[0].G = 2; },
    'thermal: a node id twice': p => { md(p).network.nodes[1].id = 'J'; },
    'thermal: a binding to no element': p => { md(p).bindings[0].element = 'Rzz'; },
    'thermal: a binding with a bad expression': p => { md(p).bindings[0].expr = 'Rsa * nope'; },
    'thermal: a binding that is not the language': p => { md(p).bindings[1].expr = 'Math.max(P, 1)'; },
    'thermal: a bad transient expression': p => { md(p).transient.tEnd = '300 * Rsa2'; },
    'thermal: too many steps': p => { md(p).transient = { tEnd: 1e6, dt: 1 }; },
    'thermal: an output on no node': p => { sp(p).outputs[1].node = 'X'; },
    'thermal: a time constant beyond the capacities': p => { sp(p).outputs[5].tau = 9; },
    'thermal: an output at with an unknown name': p => { sp(p).outputs.push({ id: 'tjAt', kind: 'scalar', node: 'J', at: 'tLater' }); },
    'thermal: a good output at an expression': p => { sp(p).outputs.push({ id: 'tjAt', kind: 'scalar', node: 'J', at: '60 * Rsa' }); sp(p).readouts.push({ label: 'tjLabel', expr: 'tjAt' }); },
    'thermal: a bench': p => { sp(p).bench = JSON.parse(JSON.stringify(TWIN_BENCH)); },
  },
  'pid-tune': {
    'pid good': p => p,
    'pid: an unknown plant': p => { md(p).plant.type = 'quantum'; },
    'pid: no transient': p => { delete md(p).transient; },
    'pid: a gain that is not a number': p => { md(p).controller.Kp = 'fast'; },
    'pid: a binding to no element': p => { md(p).bindings[0].element = 'valve'; },
    'pid: a binding with a bad expression': p => { md(p).bindings[1].expr = 'Ki +'; },
    'pid: an unknown metric': p => { sp(p).outputs[4].metric = 'wobble'; },
    'pid: a scalar signal without at or stat': p => { sp(p).outputs.push({ id: 'yy', kind: 'scalar', signal: 'y' }); },
    'pid: an output at with an unknown name': p => { sp(p).outputs.push({ id: 'yAt', kind: 'scalar', signal: 'y', at: 'later' }); },
    'pid: a transient dt that is not the language': p => { md(p).transient.dt = 'tEnd / 1000'; },
    'pid: a good anti-windup toggle': p => { sp(p).params.push({ id: 'aw', kind: 'toggle', label: 'kp', default: true }); md(p).bindings.push({ element: 'controller', prop: 'antiWindup', expr: 'aw' }); },
  },
  'lora-link': {
    'rf good': p => p,
    'rf: no link': p => { delete md(p).link; },
    'rf: an unknown path model': p => { md(p).link.path.model = 'magic'; },
    'rf: a frequency that is not a number': p => { md(p).link.f = 'loud'; },
    'rf: a binding to no field': p => { md(p).bindings[1].field = 'radio.colour'; },
    'rf: a binding with a bad expression': p => { md(p).bindings[1].expr = 'sf + nope'; },
    'rf: an empty binding expression': p => { md(p).bindings[2].expr = ' '; },
    'rf: an output it cannot compute': p => { sp(p).outputs.push({ id: 'zz', kind: 'scalar' }); },
    'rf: a series that is not a series': p => { sp(p).outputs.push({ id: 'm2', kind: 'series', of: 'airtime' }); },
    'rf: a check on an unknown name': p => { sx(p).grade.checks[1].expr = 'airtime <= airMax'; },
  },
  'sensor-node': {
    'twin good': p => p,
    'twin: no device': p => { delete md(p).device; },
    'twin: sensing longer than the period': p => { md(p).device.schedule.sense = 100; },
    'twin: an unknown chemistry': p => { md(p).device.battery.chem = 'coal'; },
    'twin: a binding to no field': p => { md(p).bindings[0].field = 'schedule.colour'; },
    'twin: a binding with a bad expression': p => { md(p).bindings[0].expr = 'period * zz'; },
    'twin: an output on no sensor': p => { sp(p).outputs.push({ id: 'rd', kind: 'series', of: 'reading', sensor: 'hum' }); },
    'twin bench good': p => { twinBench(p); },
    'twin bench: a fault of no kind': p => { twinBench(p); tb(p).faults[0].apply[0].kind = 'gremlin'; },
    'twin bench: a stuck sensor the device does not have': p => { twinBench(p); tb(p).faults[1].apply = [{ kind: 'sensor-stuck', sensor: 'hum' }]; },
    'twin bench: a point at no probe of the device': p => { twinBench(p); tb(p).points[0].at = 'TP1'; },
    'twin bench: a voltmeter on the current': p => { twinBench(p); tb(p).instruments[0].points.push('ISENSE'); },
    'twin bench: a scope on the battery': p => { twinBench(p); tb(p).instruments[2].points = ['VBAT']; },
    'twin bench: an ammeter on a part': p => { twinBench(p); tb(p).instruments[1].parts[0].element = 'R1'; },
    'twin bench: the event log on a point': p => { twinBench(p); tb(p).instruments[3].points = ['VBAT']; },
    'twin bench: a thermometer and a clock check': p => { twinBench(p); tb(p).instruments.push({ kind: 'T' }, { kind: 'clock' }); },
    'twin bench: the thermometer on a point': p => { twinBench(p); tb(p).instruments.push({ kind: 'T', points: ['VBAT'] }); },
    'twin bench: meter modes on the twin': p => { twinBench(p); tb(p).instruments[0].modes = ['dc']; },
    'twin bench: a logic analyser': p => { twinBench(p); tb(p).instruments[4] = { kind: 'logic', tEnd: 1 }; },
    'twin bench: task.fault not a fault': p => { twinBench(p); sx(p).task.params.fault = 'stuck'; },
    'twin bench: a diagnosis label missing in one table': p => { twinBench(p); delete p.activities.items[1].strings.fr.dxWake; },
  },
};
ccases['circuit: the event log on a circuit bench'] = p => { bn(p).instruments.push({ kind: 'log' }); };
// the new physics (docs/INTERACTIVE_CIRCUIT.md §9): AC outputs, power, meter modes and windows, scope ground leads, the frequency response analyser
Object.assign(ccases, {
  'circuit: good ac, power and instrument extras': p => { md(p).ac = { source: 'V1', fStart: 1, fStop: 1e6, points: 50 }; md(p).transient = { tEnd: 0.01 };
    sp(p).outputs = [{ id: 'f', kind: 'series', ac: 'f' }, { id: 'g', kind: 'series', ac: 'db', node: 'a' }, { id: 'g1k', kind: 'scalar', ac: 'phase', node: 'a', ref: 's', at: 1000 }, { id: 'fc', kind: 'scalar', ac: 'f3db', node: 'a' },
      { id: 'pd', kind: 'scalar', power: 'D1', stat: 'mean' }, { id: 'vm', kind: 'scalar', probe: { kind: 'V', a: 'a', mode: 'rms', zin: 1e7, tEnd: 0.01, dt: 1e-5 } }];
    bn(p).instruments[0].modes = ['dc', 'ac', 'rms']; bn(p).instruments[0].zin = 1e7; bn(p).instruments[1].modes = ['dc', 'avg']; bn(p).instruments[1].tEnd = 0.02;
    bn(p).instruments.push({ kind: 'scope', tEnd: 0.001, zin: 1e7, leads: [{ label: 'tp3', lead: 150e-9, cin: 12e-12 }, { label: 'tp3', lead: 0 }] }, { kind: 'bode', source: 'V1', fStart: 10, fStop: 1e5, fPoints: 100 }); },
  'circuit: ac on a resistor': p => { md(p).ac = { source: 'R1', fStart: 1, fStop: 1e6 }; },
  'circuit: ac without fStop': p => { md(p).ac = { source: 'V1', fStart: 1 }; },
  'circuit: ac fStop below fStart': p => { md(p).ac = { source: 'V1', fStart: 1e6, fStop: 1 }; },
  'circuit: ac with too many points': p => { md(p).ac = { source: 'V1', fStart: 1, fStop: 1e6, points: 5000 }; },
  'circuit: an ac output with no model.ac': p => { sp(p).outputs = [{ id: 'g', kind: 'series', ac: 'db', node: 'a' }]; },
  'circuit: an ac point with no frequency': p => { md(p).ac = { source: 'V1', fStart: 1, fStop: 1e6 }; sp(p).outputs = [{ id: 'g', kind: 'scalar', ac: 'db', node: 'a' }]; },
  'circuit: an ac curve of a stat': p => { md(p).ac = { source: 'V1', fStart: 1, fStop: 1e6 }; sp(p).outputs = [{ id: 'g', kind: 'series', ac: 'f3db', node: 'a' }]; },
  'circuit: an ac output on no node': p => { md(p).ac = { source: 'V1', fStart: 1, fStop: 1e6 }; sp(p).outputs = [{ id: 'g', kind: 'series', ac: 'db', node: 'zz' }]; },
  'circuit: ref on a node output': p => { sp(p).outputs = [{ id: 'v', kind: 'scalar', node: 'a', ref: 's' }]; },
  'circuit: power of no part': p => { sp(p).outputs = [{ id: 'pd', kind: 'scalar', power: 'D9', stat: 'mean' }]; },
  'circuit: power without at or stat': p => { md(p).transient = { tEnd: 0.01 }; sp(p).outputs = [{ id: 'pd', kind: 'scalar', power: 'D1' }]; },
  'circuit: a probe in a bad mode': p => { sp(p).outputs = [{ id: 'vm', kind: 'scalar', probe: { kind: 'V', a: 'a', mode: 'peak' } }]; },
  'circuit: an ohmmeter with zin': p => { sp(p).outputs = [{ id: 'r', kind: 'scalar', probe: { kind: 'R', a: 'a', zin: 1e6 } }]; },
  'circuit: modes on the ohmmeter': p => { bn(p).instruments[2].modes = ['dc']; },
  'circuit: a mode twice': p => { bn(p).instruments[0].modes = ['dc', 'dc']; },
  'circuit: zin on the ammeter': p => { bn(p).instruments[1].zin = 0.1; },
  'circuit: a meter window without tEnd': p => { bn(p).instruments[0].dt = 1e-5; },
  'circuit: leads on the voltmeter': p => { bn(p).instruments[0].leads = [{ label: 'tp3', lead: 1e-7 }]; },
  'circuit: a lead with a negative inductance': p => { bn(p).instruments.push({ kind: 'scope', tEnd: 0.001, leads: [{ label: 'tp3', lead: -1 }] }); },
  'circuit: a lead label missing': p => { bn(p).instruments.push({ kind: 'scope', tEnd: 0.001, leads: [{ label: 'leadNope', lead: 0 }] }); },
  'circuit: a bode with no source': p => { bn(p).instruments.push({ kind: 'bode', source: 'R1', fStart: 1, fStop: 1e5 }); },
  'circuit: a bode without fStart': p => { bn(p).instruments.push({ kind: 'bode', source: 'V1', fStop: 1e5 }); },
  'circuit: a probe window that averages nothing': p => { sp(p).outputs = [{ id: 'vm', kind: 'scalar', probe: { kind: 'V', a: 'a', tEnd: 0.01, tStart: 0.01 } }]; },
  'circuit: a probe window without tEnd': p => { sp(p).outputs = [{ id: 'vm', kind: 'scalar', probe: { kind: 'V', a: 'a', dt: 1e-5 } }]; },
  'circuit: a bench meter window that averages nothing': p => { bn(p).instruments[0].tEnd = 0.01; bn(p).instruments[0].tStart = 0.02; },
  'circuit: fStart on the scope': p => { bn(p).instruments.push({ kind: 'scope', tEnd: 0.001, fStart: 1 }); },
});

const P6GOOD = ['thermal good', 'thermal: a good output at an expression', 'pid good', 'pid: a good anti-windup toggle', 'rf good', 'twin good', 'twin bench good', 'twin bench: a thermometer and a clock check'];
const P6PRE = /^(thermal|pid|rf|twin)\b/;
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
// py-module@1: the reference py-filter (main.py + its spec) as the second activity, with a sim exercise graded by checks on Python's outputs
const PF = path.join(ROOT, 'tools', 'activities_examples', 'py-filter');
const pySrc = fs.readFileSync(path.join(PF, 'main.py'), 'utf8');
const pfItem = { ...JSON.parse(fs.readFileSync(path.join(PF, 'activity.json'), 'utf8')), python: pySrc, sha256: crypto.createHash('sha256').update(pySrc).digest('hex'), bytes: Buffer.byteLength(pySrc),
  spec: JSON.parse(fs.readFileSync(path.join(PF, 'spec.json'), 'utf8')), strings: Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(PF, `strings.${l}.json`), 'utf8'))])) };
delete pfItem.entry;
const PX = { id: 'ch01-e4', type: 'sim', activity: 'py-filter', task: { seed: 'auto', params: {} }, hints: ['h'],
  grade: { mode: 'checks', checks: [{ expr: 'att1k <= -20', label: 'checkTone', weight: 2 }, { expr: 'pass300 >= -3', label: 'checkPass' }] } };
const pbase = () => { const p = base(); p.media['py-filter-still'] = { w: 600, h: 260 }; p.requires.push('runtime:py-module@1'); p.activities.items.push(JSON.parse(JSON.stringify(pfItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'py-filter' }); p.chapters[0].exercises.push(JSON.parse(JSON.stringify(PX))); return p; };
const pi = p => p.activities.items[1], pyEdit = (p, f) => { pi(p).python = f(pi(p).python); pi(p).sha256 = null; pi(p).bytes = null; };
const pcases = {
  'py good': p => p,
  'py: graded "reported" (noema.result)': p => { sx(p).grade = { mode: 'reported' }; },
  'py: a task param for Python only': p => { sx(p).task.params = { level: 2, f0: 'x' }; },
  'py: scipy declared and imported': p => { pi(p).packages = ['numpy', 'scipy']; pyEdit(p, s => 'from scipy import signal\n' + s); },
  'py: an allow-listed extra with requiresNetwork': p => { pi(p).packages = ['numpy', 'quantiphy']; pi(p).requiresNetwork = true; pi(p).stepMs = 500; },
  'py: no runtime in requires': p => { p.requires = p.requires.filter(x => x !== 'runtime:py-module@1'); },
  'py: no Python file': p => { delete pi(p).python; },
  'py: no spec': p => { delete pi(p).spec; },
  'py: no step()': p => { pyEdit(p, s => s.replace('def step(', 'def stepp(')); },
  'py: imports scipy without declaring it': p => { pyEdit(p, s => 'import scipy.signal\n' + s); },
  'py: a package not on the list': p => { pi(p).packages = ['numpy', 'pandas']; },
  'py: a package twice': p => { pi(p).packages = ['numpy', 'numpy']; },
  'py: packages not a list': p => { pi(p).packages = 'numpy'; },
  'py: an extra without requiresNetwork': p => { pi(p).packages = ['numpy', 'quantiphy']; },
  'py: requiresNetwork not a boolean': p => { pi(p).requiresNetwork = 'yes'; },
  'py: stepMs too long': p => { pi(p).stepMs = 60000; },
  'py: stepMs not whole': p => { pi(p).stepMs = 250.5; },
  'py: import js': p => { pyEdit(p, s => 'import js\n' + s); },
  'py: the network': p => { pyEdit(p, s => s + '\nfrom pyodide.http import pyfetch\n'); },
  'py: urllib': p => { pyEdit(p, s => s + '\nimport urllib.request\n'); },
  'py: micropip': p => { pyEdit(p, s => s + '\nimport micropip\n'); },
  'py: input()': p => { pyEdit(p, s => s + '\nx = input()\n'); },
  'py: while True (a warning)': p => { pyEdit(p, s => s + '\ndef spin():\n    while True:\n        break\n'); },
  'py: over 256 KB': p => { pyEdit(p, s => s + '\n# ' + 'x'.repeat(270 * 1024) + '\n'); },
  'py: sha mismatch': p => { pi(p).sha256 = 'f'.repeat(64); },
  'py: bytes mismatch': p => { pi(p).bytes = 3; },
  'py: spec names an engine': p => { pi(p).spec.engine = 'formula@1'; },
  'py: spec has a model': p => { pi(p).spec.model = {}; },
  'py: spec has no outputs': p => { delete pi(p).spec.outputs; pi(p).spec.readouts = []; pi(p).spec.plots = []; },
  'py: spec with a bench': p => { pi(p).spec.bench = { faults: [] }; },
  'py: a check on an unknown output': p => { sx(p).grade.checks[0].expr = 'att2k <= -20'; },
  'py: a check on a series': p => { sx(p).grade.checks[0].expr = 'gain <= -20'; },
  'py: a task const not a number': p => { pi(p).spec.consts = { fs: 8000 }; sx(p).task.params = { fs: 'fast' }; },
};
// h5p@1: the reference planets-quiz (an ordinary .h5p package beside the pack; its words in el and ru as content.<locale>.json)
const PQ = path.join(ROOT, 'tools', 'activities_examples', 'planets-quiz'), PQB = fs.readFileSync(path.join(PQ, 'item.h5p'));
const pqItem = { ...JSON.parse(fs.readFileSync(path.join(PQ, 'activity.json'), 'utf8')), sha256: crypto.createHash('sha256').update(PQB).digest('hex'), bytes: PQB.length };
const pqContent = l => JSON.parse(fs.readFileSync(path.join(PQ, `content.${l}.json`), 'utf8'));
const hbase = () => { const p = base(); p.media['planets-quiz-still'] = { w: 600, h: 220 }; p.requires.push('runtime:h5p@1'); p.activities.items.push(JSON.parse(JSON.stringify(pqItem)));
  p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'planets-quiz' });
  p.chapters[0].exercises.push({ id: 'ch01-e3', type: 'sim', activity: 'planets-quiz', grade: { mode: 'reported' }, reveal: 'Jupiter.' }); return p; };
const hx = p => p.activities.items[1];
const hcases = {
  'h5p good': p => p,
  'h5p good in el and ru': p => { p.translations = { el: {}, ru: {} }; hx(p).h5pByLocale = { el: { content: pqContent('el') }, ru: { content: pqContent('ru'), l10n: { close: 'Закрыть' } } }; },
  'h5p: strings are checked when given': p => { hx(p).strings = { en: { a: 'x' }, el: { b: 'y' } }; },
  'h5p: no sha256': p => { delete hx(p).sha256; },
  'h5p: a bad sha256': p => { hx(p).sha256 = 'abc'; },
  'h5p: no bytes': p => { delete hx(p).bytes; },
  'h5p: entry not an .h5p': p => { hx(p).entry = 'activities/planets-quiz/app.html'; },
  'h5p: entry that leaves the folder': p => { hx(p).entry = 'activities/../x.h5p'; },
  'h5p: an html bundle too': p => { hx(p).html = '<p>x</p>'; },
  'h5p: inline h5p not base64 text': p => { hx(p).h5p = { data: 1 }; },
  'h5p: a translation missing': p => { p.translations = { el: {}, ru: {} }; hx(p).h5pByLocale = { el: { content: pqContent('el') } }; },
  'h5p: a language the pack is not read in': p => { hx(p).h5pByLocale = { de: { content: {} } }; },
  'h5p: a bad h5pByLocale entry': p => { p.translations = { el: {} }; hx(p).h5pByLocale = { el: { text: 'x' } }; },
  'h5p: a bad l10n': p => { p.translations = { el: {} }; hx(p).h5pByLocale = { el: { content: {}, l10n: 'x' } }; },
  'h5p: another package without sha256': p => { p.translations = { el: {} }; hx(p).h5pByLocale = { el: { h5p: 'UEsDBA==' } }; },
  'h5p: h5pByLocale not an object': p => { hx(p).h5pByLocale = ['el']; },
  'h5p: no requires': p => { p.requires = ['activities/v1', 'runtime:html-app@1']; },
  'h5p: checks grading': p => { p.chapters[0].exercises[1].grade = { mode: 'checks', checks: [{ expr: 'score > 0' }] }; },
};
const packs = [...Object.entries(cases).map(([k, f]) => { const p = base(); f(p); return [k, p]; }), ...Object.entries(scases).map(([k, f]) => { const p = sbase(); f(p); return [k, p]; }), ...Object.entries(ccases).map(([k, f]) => { const p = cbase(); f(p); return [k, p]; }), ...Object.entries(pcases).map(([k, f]) => { const p = pbase(); f(p); return [k, p]; }),
  ...Object.entries(wcases).map(([k, f]) => { const p = wbase(); f(p); return [k, p]; }), ...Object.entries(ecases).map(([k, f]) => { const p = ebase(); f(p); return [k, p]; }),
  ...Object.entries(p6cases).flatMap(([aid, cs]) => Object.entries(cs).map(([k, f]) => { const p = p6base(aid)(); f(p); return [k, p]; })),
  ...Object.entries(hcases).map(([k, f]) => { const p = hbase(); f(p); return [k, p]; })];
const GOOD = new Set(['h5p good', 'h5p good in el and ru', 'good', 'spec good', 'spec: a good choice and toggle', 'circuit good', 'circuit: rc-transient (no bench)', 'circuit: a good scalar output in a readout', 'circuit: a scope and a logic analyser', 'circuit: task.fault a list', 'circuit: a check on the diagnosis index', 'circuit: good ac, power and instrument extras',
  'wasm good', 'wasm: through a sim-spec@1 spec (engine wasm@1)', 'embed good', ...P6GOOD,
  'py good', 'py: graded "reported" (noema.result)', 'py: a task param for Python only', 'py: scipy declared and imported', 'py: an allow-listed extra with requiresNetwork', 'py: while True (a warning)']);
const tmp = path.join(require('os').tmpdir(), 'noema-act-parity.json'); fs.writeFileSync(tmp, JSON.stringify(packs));
const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
out = {}
for k, p in json.load(open(sys.argv[1], encoding='utf-8')):
    e, w = A.check_activities(p, list((p.get('translations') or {}).keys())); out[k] = [len(e), len(w), e if k.startswith('py') else None]
print(json.dumps(out, ensure_ascii=False))`, tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
for (const [k, p] of packs) {
  const js = P.checkActivities(p, Object.keys(p.translations || {}));
  const norm = l => l.map(m => m.replace(/'/g, '"'));   // (Python's repr quotes with ', the JS twin with ")
  const same = js.errors.length === py[k][0] && js.warnings.length === py[k][1] && (py[k][2] == null || JSON.stringify(norm(js.errors)) === JSON.stringify(norm(py[k][2])));
  ok(same && (GOOD.has(k) ? js.errors.length === 0 : js.errors.length > 0), `${k}: ${GOOD.has(k) && js.errors.length ? js.errors[0] + ' ' : ''}JS ${js.errors.length} error(s), Python ${py[k][0]}${GOOD.has(k) ? ' (a good pack passes)' : ' — ' + (js.errors[0] || '').slice(0, 110)}${same ? '' : '  JS: ' + js.errors.join(' | ')}`);
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
  const py2 = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A, re
print(json.dumps([A.check_spec(p['activities']['items'][1].get('spec'), p['activities']['items'][1].get('strings')) for k, p in json.load(open(sys.argv[1], encoding='utf-8')) if k.startswith('spec') or k.startswith('circuit') or re.match(r'(thermal|pid|rf|twin)\\b', k)], ensure_ascii=False))`, tmp], { encoding: 'utf8' }));
  const js2 = packs.filter(([k]) => k.startsWith('spec') || k.startsWith('circuit') || P6PRE.test(k)).map(([, p]) => P.checkSimSpec(p.activities.items[1].spec, p.activities.items[1].strings));
  const norm = l => l.map(m => m.replace(/'/g, '"'));   // (Python's repr quotes with ', the JS twin with ")
  const diff = js2.map((e, i) => JSON.stringify(norm(e)) === JSON.stringify(norm(py2[i])) ? null : [e, py2[i]]).filter(Boolean);
  ok(!diff.length, 'checkSimSpec (JS) and check_spec (Python) give the same messages ' + (diff.length ? JSON.stringify(diff[0]).slice(0, 600) : ''));
}
{ // the circuit checker: NoemaCircuit.check / checkFaults (JS) and tools/circuit.py check / check_faults give the same findings
  const C = NoemaCircuit;
  const cases=[
   null, 5, {nodes:'a'}, {format:'x',nodes:[],elements:[]},
   {nodes:['a',{name:'TP',probe:'a'},{name:'T2',probe:'zz'},'a','b c',{name:'gnd',probe:'a'}],elements:[{id:'R1',type:'R',n:['a','gnd'],value:'4.7k',x:1},{id:'R1',type:'R',n:['TP','q'],value:-1},{id:'1x',type:'Q',n:[]},{id:'C1',type:'C',n:['a','gnd'],value:'1u',ic:'x'},{id:'V1',type:'V',n:['a','gnd'],value:{pulse:{v1:0,v2:5,width:1,period:0.5,zz:1}}},{id:'V2',type:'V',n:['a','gnd'],value:{sine:{amp:1}}},{id:'V3',type:'V',n:['a','gnd'],value:{dc:'x'}},{id:'V4',type:'V',n:['a','gnd'],value:{dc:1,pwm:{}}},{id:'V5',type:'V',n:['a','gnd'],value:{pwm:{v:5,freq:1e3,duty:2}}},{id:'D1',type:'D',n:['a','gnd'],preset:'nope',value:1,on:true},{id:'S1',type:'SW',n:['a','gnd'],on:'yes',params:{Ron:0,Zz:1}},{id:'U1',type:'OPAMP',n:['a','gnd','a'],params:{rails:[5,1]}},{id:'R9',type:'R',n:['a',5],value:null},{id:'Q1',type:['NPN'],n:['a','a','gnd']}]},
   {nodes:['a','b','c','d'],elements:[{id:'V1',type:'V',n:['a','gnd'],value:5},{id:'V2',type:'V',n:['a','gnd'],value:5},{id:'R1',type:'R',n:['b','b'],value:1},{id:'C1',type:'C',n:['c','gnd'],value:1e-6},{id:'U1',type:'OPAMP',n:['a','b','a']}]},
   {nodes:['a','b'],elements:[{id:'R1',type:'R',n:['a','b'],value:1}]},
   {nodes:Array.from({length:61},(_, i)=>'n'+i),elements:[]},
   // the second-generation parts and fields (docs/INTERACTIVE_CIRCUIT.md §9)
   {nodes:['a','b',{name:'c',pickup:'no'},'d','e'],pickup:{hum:-1,zz:1,r:'1meg'},elements:[{id:'T1',type:'TLINE',n:['a','b']},{id:'T2',type:'TLINE',n:['a','gnd','b','gnd'],params:{z0:50,vf:2,len:1}},{id:'S1',type:'VSW',n:['a','b','c','gnd'],params:{Von:'x'}},
     {id:'U1',type:'OPAMP',n:['a','b','d'],params:{gbw:0,slew:1e6,rout:-1,vos:'1m',ib:1e-9},preset:'lm358'},{id:'M1',type:'NMOS',n:['d','a','gnd'],params:{Cgs:1e-9,body:1}},{id:'D1',type:'D',n:['e','gnd'],params:{Bv:0,Cj:'4p'},preset:'bzx55c3v3'},
     {id:'V1',type:'V',n:['e','gnd'],value:{noise:{rms:1}}},{id:'V2',type:'V',n:['a','gnd'],value:{noise:{rms:0.1,bw:1e3,colour:1}}},{id:'Q1',type:'NPN',n:['d','e','gnd'],params:{Cbe:-1}}]},
   {nodes:['a','b',{name:'f',pickup:false}],pickup:false,elements:[{id:'V1',type:'V',n:['a','gnd'],value:1},{id:'V2',type:'V',n:['b','gnd'],value:1},{id:'T1',type:'TLINE',n:['a','b'],params:{td:1e-9}},{id:'C1',type:'C',n:['f','gnd'],value:1e-9}]},
   {nodes:['a','b'],pickup:'x',elements:[{id:'T1',type:'TLINE',n:['a','a'],params:{td:1e-9}},{id:'R1',type:'R',n:['a','gnd'],value:1},{id:'S1',type:'VSW',n:['b','gnd','a','gnd']}]},
  ];
  const nl={nodes:['vin','a'],elements:[{id:'V1',type:'V',n:['vin','gnd'],value:5},{id:'R1',type:'R',n:['vin','a'],value:220},{id:'D1',type:'D',n:['a','gnd'],preset:'led-red'},{id:'Q1',type:'NPN',n:['a','vin','gnd']}]};
  const fl=[[{element:'D1',kind:'reverse'},{element:'R9',kind:'open'},{element:'R1',kind:'melt'},{node:'zz',kind:'open-trace'},{element:'R1',kind:'drift',factor:0},{element:'D1',kind:'drift',param:'gain'},{element:'R1',kind:'open',pin:2},{node:'a',kind:'open-trace',side:['V1','R1.1','R1.0',5]},{element:'R1',kind:'open',colour:'red'},{element:'R1',kind:'drift',add:'x'},{element:'R1',kind:'drift',add:0.5,factor:1},{element:'Q1',kind:'drift',param:'Cbe',add:1e-12},{element:'Q1',kind:'reverse'},{element:'Q1',kind:'short',pins:[0,0]},{node:'vin',kind:'open-trace'},{node:'gnd',kind:'open-trace',side:[]},5,{element:'Q1',kind:'drift',param:'betaF',factor:'2k'}], 'x'];
  const ctmp = path.join(require('os').tmpdir(), 'noema-circuit-parity.json'); fs.writeFileSync(ctmp, JSON.stringify({ cases, nl, fl }));
  const cpy = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import circuit as C; d = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({'c': [C.check(c) for c in d['cases']], 'f': [C.check_faults(d['nl'], f) for f in d['fl']]}, ensure_ascii=False))`, ctmp], { encoding: 'utf8' }));
  const cjs = { c: cases.map(c => C.check(c)), f: fl.map(f => C.checkFaults(nl, f)) };
  const cdiff = ['c', 'f'].flatMap(k => cjs[k].map((r, i) => JSON.stringify(r) === JSON.stringify(cpy[k][i]) ? null : [k, i, r, cpy[k][i]]).filter(Boolean));
  ok(!cdiff.length && cjs.f.flat().length >= 8, `netlist and fault checks: JS and Python agree on ${cases.length} netlists and ${fl.length} fault lists ${cdiff.length ? JSON.stringify(cdiff[0]).slice(0, 500) : ''}`);
}
ok(!('py-module@1' in P.ACTIVITY_RULES.LATER) && !('h5p@1' in P.ACTIVITY_RULES.LATER) && !('sim-spec@1' in P.ACTIVITY_RULES.LATER) && ['sim-spec@1', 'py-module@1', 'h5p@1'].every(r => P.ACTIVITY_RULES.RUNTIMES.has(r)), 'sim-spec@1, py-module@1 and h5p@1 are runtimes now');
{ // py-module@1: the packages JS and Python allow are the allow-list's (tools/pywheels_allow.json) + numpy, scipy; the spec rules with python: true agree word for word
  const allow = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'pywheels_allow.json'), 'utf8')).wheels).sort();
  const pyl = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A; print(json.dumps([A.PY_BASE, A.PY_EXTRAS, A.PY_MAX, list(A.PY_STEP)]))`], { encoding: 'utf8' }));
  const R = P.ACTIVITY_RULES;
  ok(JSON.stringify([...R.PY_EXTRAS].sort()) === JSON.stringify(allow) && JSON.stringify(pyl) === JSON.stringify([R.PY_BASE, R.PY_EXTRAS, R.PY_MAX, R.PY_STEP]) && JSON.stringify(R.PY_BASE) === '["numpy","scipy"]', `the Python packages: numpy, scipy + the allow-list (${allow.join(', ')}), the same in JS and Python`);
  const specs = packs.filter(([k]) => k in pcases).map(([, p]) => p.activities.items[1]);
  const stmp = path.join(require('os').tmpdir(), 'noema-py-parity.json'); fs.writeFileSync(stmp, JSON.stringify(specs));
  const py3 = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
print(json.dumps([[A.check_spec(a.get('spec'), a.get('strings'), python=True), list(A.lint_python(a.get('python'), a.get('packages') if isinstance(a.get('packages'), list) else []))] for a in json.load(open(sys.argv[1], encoding='utf-8'))], ensure_ascii=False))`, stmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const js3 = specs.map(a => { const l = P.lintPython(a.python, Array.isArray(a.packages) ? a.packages : []); return [P.checkSimSpec(a.spec, a.strings, null, { python: true }), [l.errors, l.warnings]]; });
  const norm = l => JSON.stringify(l).replace(/'/g, '"');
  const d3 = js3.map((x, i) => norm(x) === norm(py3[i]) ? null : [x, py3[i]]).filter(Boolean);
  ok(!d3.length, `py-module@1: the spec check (python: true) and the Python lint give the same messages in JS and Python on ${specs.length} items ${d3.length ? JSON.stringify(d3[0]).slice(0, 600) : ''}`);
  ok(P.needRequires([pfItem]).join() === 'activities/v1,runtime:py-module@1', 'pack.requires of a Python activity: activities/v1, runtime:py-module@1 (no engine)');
}
{ // the same messages for the h5p@1 registry rules (not only the same counts)
  const hk = packs.filter(([k]) => k.startsWith('h5p')).map(([k]) => k);
  const pyh = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
print(json.dumps({k: A.check_activities(p, list((p.get('translations') or {}).keys()))[0] for k, p in json.load(open(sys.argv[1], encoding='utf-8')) if k.startswith('h5p')}, ensure_ascii=False))`, tmp], { encoding: 'utf8' }));
  const hd = hk.filter(k => JSON.stringify(P.checkActivities(packs.find(x => x[0] === k)[1], Object.keys(packs.find(x => x[0] === k)[1].translations || {})).errors.map(m => m.replace(/'/g, '"'))) !== JSON.stringify(pyh[k].map(m => m.replace(/'/g, '"'))));
  ok(hk.length >= 15 && !hd.length, `h5p@1: checkActivities (JS) and check_activities (Python) give the same messages on ${hk.length} packs ${hd.slice(0, 2).join(', ')}`);
}
{ // h5p@1: the packages themselves — NoemaPackCheck.checkActivityPackages (through NoemaH5P, the app's own checker) and check_h5p_packages
  // (through tools/h5p_check.py) give the same errors and warnings on the reference, the fixtures and broken or hostile variants
  globalThis.window = globalThis; require(path.join(ROOT, 'engine', 'src', '38_activity_h5p.js'));
  const H = globalThis.NoemaH5P, allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'h5p_allow.json'), 'utf8'));
  ok(JSON.stringify(Object.fromEntries(Object.entries(allow.content).map(([k, v]) => [k, v.versions]))) === JSON.stringify(H.ALLOW.content) && JSON.stringify(allow.libraries) === JSON.stringify(H.ALLOW.libraries)
    && JSON.stringify(allow.refuse) === JSON.stringify(H.ALLOW.refuse) && JSON.stringify(allow.files.extensions) === JSON.stringify(H.ALLOW.extensions) && JSON.stringify(Object.keys(allow.content).filter(k => !allow.content[k].tested)) === JSON.stringify(H.ALLOW.untested),
    'one allow-list: tools/h5p_allow.json = NoemaH5P.ALLOW (the app, the connector and packcheck use it)');
  const hdir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noema-h5p-parity-'));
  cp.execFileSync('python3', ['-c', `import sys, zipfile, json, os
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src); ent = [(i.filename, z.read(i)) for i in z.infolist() if not i.is_dir()]
def w(name, f):
    es = f([list(e) for e in ent]); zz = zipfile.ZipFile(os.path.join(out, name + '.h5p'), 'w', zipfile.ZIP_DEFLATED)
    for n, b in es: zz.writestr(n, b)
    zz.close()
def setf(es, n, b):
    for e in es:
        if e[0] == n: e[1] = b; return es
    es.append([n, b]); return es
def hj(es, f):
    h = json.loads(dict(es)['h5p.json']); f(h); return setf(es, 'h5p.json', json.dumps(h).encode())
def cj(es, f):
    c = json.loads(dict(es)['content/content.json']); f(c); return setf(es, 'content/content.json', json.dumps(c).encode())
w('php', lambda es: setf(es, 'content/shell.php', b'<?php ?>'))
w('script-in-content', lambda es: setf(es, 'content/run.js', b'alert(1)'))
w('refused', lambda es: hj(es, lambda h: h['preloadedDependencies'].append({'machineName': 'H5P.MathDisplay', 'majorVersion': '1', 'minorVersion': '0'})))
w('outside-link', lambda es: cj(es, lambda c: c.update(question='<img src="https://x.example/p.png">')))
w('attribution', lambda es: cj(es, lambda c: c.update(metadata={'source': 'https://example.org/x'})))
w('no-h5p-json', lambda es: [e for e in es if e[0] != 'h5p.json'])
w('missing-library', lambda es: [e for e in es if not e[0].startswith('H5P.JoubelUI-1.3/')])
open(os.path.join(out, 'not-a-zip.h5p'), 'wb').write(b'not a zip at all')`, path.join(PQ, 'item.h5p'), hdir]);
  const fixtures = ['mc', 'drag', 'tf'].map(k => [k, path.join(ROOT, 'tests', 'fixtures', 'h5p', k + '.h5p')]);
  const variants = fs.readdirSync(hdir).filter(f => f.endsWith('.h5p')).sort().map(f => [f.slice(0, -4), path.join(hdir, f)]);
  const hpk = [];
  for (const [k, f] of [...fixtures, ...variants]) {   // each as the file beside the pack (entry), and the reference also inline and with translations
    const b = fs.readFileSync(f), p = hbase(); Object.assign(hx(p), { entry: f, sha256: crypto.createHash('sha256').update(b).digest('hex'), bytes: b.length }); hpk.push(['file ' + k, p]);
  }
  { const p = hbase(); hx(p).h5p = PQB.toString('base64'); hpk.push(['inline', p]); }
  { const p = hbase(); hx(p).sha256 = '0'.repeat(64); hx(p).bytes = 5; hpk.push(['sha and bytes differ', p]); }
  { const p = hbase(); hx(p).entry = path.join(hdir, 'gone.h5p'); hpk.push(['missing file', p]); }
  { const p = hbase(); hx(p).h5pByLocale = { el: { content: pqContent('el') }, ru: { content: { ...pqContent('ru'), question: '<a href="//evil.example/">x</a>' } } }; hpk.push(['a translation with an outside link', p]); }
  { const p = hbase(); hx(p).h5pByLocale = { el: { h5p: fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'h5p', 'tf.h5p')).toString('base64'), sha256: '1'.repeat(64) }, ru: { h5p: 'bm90IGEgemlw', sha256: '2'.repeat(64) } }; hpk.push(['another package per language', p]); }
  const ptmp = path.join(hdir, 'packs.json'); fs.writeFileSync(ptmp, JSON.stringify(hpk));
  const pyp = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json, os; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
rd = lambda a: open(a['entry'], 'rb').read() if os.path.exists(a['entry']) else None
print(json.dumps({k: A.check_h5p_packages(p, rd) for k, p in json.load(open(sys.argv[1], encoding='utf-8'))}, ensure_ascii=False))`, ptmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  globalThis.__h5pParity = (async () => {
    const rd = a => fs.existsSync(a.entry) ? new Uint8Array(fs.readFileSync(a.entry)) : null;
    const want = { 'file mc': 0, 'file drag': 0, 'file tf': 0, inline: 0, 'file attribution': 0 };
    const diff = [];
    for (const [k, p] of hpk) {
      const r = await P.checkActivityPackages(p, rd), y = pyp[k];
      const same = JSON.stringify(r.errors) === JSON.stringify(y[0]) && JSON.stringify(r.warnings) === JSON.stringify(y[1]);
      const good = k in want ? !r.errors.length : r.errors.length > 0;
      if (!same || !good) diff.push(`${k}: JS ${JSON.stringify(r)} Python ${JSON.stringify(y)}`.slice(0, 600));
    }
    ok(!diff.length, `h5p@1 packages: checkActivityPackages (JS, NoemaH5P.check) and check_h5p_packages (Python, h5p_check.py) agree on ${hpk.length} packs (${Object.keys(want).length} good, the rest refused) ${diff[0] || ''}`);
    const pw = (await P.checkActivityPackages(hpk.find(x => x[0] === 'file attribution')[1], rd)).warnings;
    ok(pw.some(m => /attribution/.test(m)), 'an attribution link is a warning only (shown as text)');
  })();
}
ok(JSON.stringify(P.needRequires(sbase().activities.items)) === JSON.stringify(['activities/v1', 'runtime:html-app@1', 'runtime:sim-spec@1']) && P.needRequires([{ runtime: 'sim-spec@1', spec: { engine: 'circuit-mna@1' } }]).includes('engine:circuit-mna@1'), 'pack.requires: the runtimes, and every engine but the built-in formula@1');
{ // the P6 engines: the same ENGINES in both validators; registered like circuit-mna@1 (Worker path); pack.requires gets engine:<id>
  const pyE = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A; print(json.dumps([sorted(A.ENGINES), sorted(A.BENCH_ENGINES)]))`], { encoding: 'utf8' }));
  const R = P.ACTIVITY_RULES;
  ok(JSON.stringify([[...R.ENGINES].sort(), [...R.BENCH_ENGINES].sort()]) === JSON.stringify(pyE) && ['thermal@1', 'pid@1', 'rf@1', 'twin@1'].every(e => R.ENGINES.has(e)) && R.BENCH_ENGINES.has('twin@1'), `ENGINES and BENCH_ENGINES are the same in packcheck.js and activities.py (${pyE[0].join(', ')}; benches: ${pyE[1].join(', ')})`);
  const reg = Object.fromEntries(['thermal@1', 'pid@1', 'rf@1', 'twin@1'].map(id => [id, NoemaCore.engines.engine(id)]));
  const shape = Object.values(reg).every(d => d && typeof d.check === 'function' && typeof d.prepare === 'function' && typeof d.create === 'function' && typeof d.workerSource === 'string' && d.workerSource.includes('self.noemaEngine'));
  ok(Object.keys(reg).sort().join() === 'pid@1,rf@1,thermal@1,twin@1' && shape && reg['twin@1'].bench === true && !reg['thermal@1'].bench, `the engine library has ${Object.keys(reg).sort().join(', ')} with check, prepare, create and workerSource (a Worker, as circuit-mna@1); twin@1 takes measurements`);
  const reqs = Object.keys(P6EX).map(a => P.needRequires([p6item(a)]));
  ok(reqs.every((r, i) => r.includes('engine:' + P6EX[Object.keys(P6EX)[i]].engine)), 'pack.requires: engine:thermal@1, engine:pid@1, engine:rf@1, engine:twin@1 for the reference activities');
  // a worker made of workerSource alone runs the reference activities and gives the same numbers as the engine on the page
  const sameRun = Object.keys(P6EX).map(a => { const it = p6item(a), E = reg[P6EX[a].engine], env = { ...(it.spec.consts || {}) }; for (const q of it.spec.params) env[q.id] = q.default; for (const d of it.spec.derived || []) env[d.id] = NoemaExpr.compile(d.expr)(env);
    const inp = E.prepare(it.spec, NoemaExpr.compile)(env), w = {}; vm.runInNewContext(E.workerSource, { self: w, Math, JSON, Object, Array, Number, String, Float64Array, Uint32Array, Int32Array, Map, Set, Error, isFinite, isNaN, Symbol, Infinity, NaN });
    const a1 = w.noemaEngine.create(it.spec, { seed: 1 }).run(inp), a2 = E.create(it.spec, { seed: 1 }).run(inp);
    return it.spec.outputs.filter(o => o.kind === 'scalar').every(o => Object.is(+a1[o.id], +a2[o.id]) || Math.abs(a1[o.id] - a2[o.id]) <= 1e-12 * Math.abs(a2[o.id])); });
  ok(sameRun.every(Boolean), `each engine's workerSource alone (as in the Worker) computes the same scalars as on the page: ${sameRun.join(', ')}`);
}
{ // the runtime's own words go through tE() and exist in every UI language (the drafts)
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_activity_sim.js'), 'utf8'), keys = [...new Set([...src.matchAll(/tE\('(engine\.act\.(?:sim|bench)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*)'/g)].map(m => m[1]))];
  for (const k of ['V', 'I', 'R', 'scope', 'logic', 'bode', 'log', 'rssi', 'T', 'clock']) keys.push('engine.act.bench.inst.' + k);   // (built: 'engine.act.bench.inst.' + kind)
  for (const k of ['dc', 'ac', 'rms', 'avg']) keys.push('engine.act.bench.mode.' + k);   // (built: 'engine.act.bench.mode.' + mode)
  const src32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8'); for (const m of src32.matchAll(/tE\('(engine\.act\.sim\.[a-z]+)'/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  const srcPy = fs.readFileSync(path.join(ROOT, 'engine', 'src', '37_activity_py_ui.js'), 'utf8'); for (const m of srcPy.matchAll(/tE\('(engine\.(?:act\.py|py)\.[a-zA-Z]+)'/g)) if (!keys.includes(m[1])) keys.push(m[1]);   // py-module@1: the notes and Settings
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'en.arb'), 'utf8')), dr = fs.readdirSync(path.join(ROOT, 'i18n', 'engine', 'drafts'));
  const miss = keys.filter(k => !en[k]).concat(...dr.map(f => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'drafts', f), 'utf8')); return keys.filter(k => !d[k]).map(k => f + ':' + k); }));
  ok(keys.length >= 5 && !miss.length, `the sim runtime's ${keys.length} host strings are in en.arb and in all ${dr.length} drafts ${miss.slice(0, 3).join(' ')}`);
}
{ // P6: the words of the outside-page card, the core's embed notes, the Settings line and the xAPI export exist in every UI language
  const keys = new Set();
  for (const f of ['45_activity_embed.js', '32_activities.js', '70_account.js', '40_views.js']) for (const m of fs.readFileSync(path.join(ROOT, 'engine', 'src', f), 'utf8').matchAll(/\b(?:T|tE)\('((?:engine\.act\.embed|engine\.xapi)\.[a-zA-Z]+)'/g)) keys.add(m[1]);
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'en.arb'), 'utf8')), dr = fs.readdirSync(path.join(ROOT, 'i18n', 'engine', 'drafts'));
  const miss = [...keys].filter(k => !en[k] || !en['@' + k]?.description).concat(...dr.map(f => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'engine', 'drafts', f), 'utf8')); return [...keys].filter(k => !d[k]).map(k => f + ':' + k); }));
  ok(keys.size >= 14 && !miss.length, `the ${keys.size} P6 host strings (outside-page card, notes, Settings "Ask again", xAPI export) are in en.arb with descriptions and in all ${dr.length} drafts ${miss.slice(0, 3).join(' ')}`);
  const wsrc = fs.readFileSync(path.join(ROOT, 'engine', 'src', '44_activity_wasm.js'), 'utf8');
  ok(!/\btE\(/.test(wsrc) && !/innerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function/.test(wsrc.replace(/\/\*[\s\S]*?\*\//g, '')), 'wasm-module@1 adds no words of its own (failures are the core\'s codes) and never puts HTML or code from the pack in the page');
}
{ // the sim runtime renders without a frame and never runs pack code: no eval / Function / HTML from the pack
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_activity_sim.js'), 'utf8');
  ok(!/\beval\s*\(|new\s+Function|innerHTML|insertAdjacentHTML|document\.write/.test(src) && /NoemaPackCheck\.checkSimSpec\(spec, tables, host \? null : ACT\.engines\(\), host \? host\.check : undefined\)/.test(src) && /NoemaCore\.engines\.expr\.compile/.test(src), 'sim-spec@1: no eval, no new Function, no HTML from the pack; the spec is checked before it is shown; formulas only through the expression language (NoemaCore.engines.expr)');
}

{ // html-app@1 + the engine library (docs/INTERACTIVE.md §8.1): the "engines" a mini-app lists — JS = Python word for word, pack.requires,
  // the protocol messages, the host bridge (34_activity_html.js) and the reference mini-game cheapest-route (graph@1)
  const CR = path.join(ROOT, 'tools', 'activities_examples', 'cheapest-route'), crHtml = fs.readFileSync(path.join(CR, 'app.html'), 'utf8');
  const crItem = { ...JSON.parse(fs.readFileSync(path.join(CR, 'activity.json'), 'utf8')), html: crHtml, sha256: crypto.createHash('sha256').update(crHtml).digest('hex'), bytes: Buffer.byteLength(crHtml),
    strings: Object.fromEntries(['en', 'el', 'ru', 'de', 'fr'].map(l => [l, JSON.parse(fs.readFileSync(path.join(CR, `strings.${l}.json`), 'utf8'))])) };
  delete crItem.entry;
  const gbase = () => { const p = base(); p.media['cheapest-route-still'] = { w: 600, h: 372 }; p.requires.push('engine:graph@1'); p.activities.items.push(JSON.parse(JSON.stringify(crItem)));
    p.chapters[0].sections[0].blocks.push({ t: 'interactive', activity: 'cheapest-route' }); return p; };
  const gi = p => p.activities.items[1], gEdit = (p, f) => { gi(p).html = f(gi(p).html); gi(p).sha256 = null; gi(p).bytes = null; };
  const gcases = {
    'engines good': p => p,
    'engines good: two engines, one only declared': p => { gi(p).engines = ['graph@1', 'timeline@1']; p.requires.push('engine:timeline@1'); },
    'engines: not a list': p => { gi(p).engines = 'graph@1'; },
    'engines: an empty list': p => { gi(p).engines = []; },
    'engines: not texts': p => { gi(p).engines = ['graph@1', 3]; },
    'engines: too many': p => { gi(p).engines = ['graph@1', 'ode@1', 'prob@1', 'geom@1', 'genetics@1', 'seq@1', 'med@1', 'clinic@1', 'music@1']; },
    'engines: unknown engine': p => { gi(p).engines = ['graph@1', 'warp@1']; },
    'engines: a plugin (circuit-mna@1)': p => { gi(p).engines = ['graph@1', 'circuit-mna@1']; },
    'engines: formula@1': p => { gi(p).engines = ['graph@1', 'formula@1']; },
    'engines: twice': p => { gi(p).engines = ['graph@1', 'graph@1']; },
    'engines: the bundle uses one not listed': p => { gEdit(p, h => h.replace("noema.engine('graph@1')", "noema.engine('graph@1'); var tl = noema.engine(\"timeline@1\")")); },
    'engines: none listed, one used': p => { delete gi(p).engines; },
    'engines: not in pack.requires': p => { p.requires = p.requires.filter(x => x !== 'engine:graph@1'); },
    'engines: on another runtime': p => { const a = p.activities.items[0]; a.runtime = 'sim-spec@1'; a.engines = ['graph@1']; },
  };
  const GGOOD = new Set(['engines good', 'engines good: two engines, one only declared']);
  const gpacks = Object.entries(gcases).map(([k, f]) => { const p = gbase(); f(p); return [k, p]; });
  const gtmp = path.join(require('os').tmpdir(), 'noema-act-engines.json'); fs.writeFileSync(gtmp, JSON.stringify({ packs: gpacks, item: crItem }));
  const gpy = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
d = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({'packs': [A.check_activities(p, list((p.get('translations') or {}).keys())) for k, p in d['packs']], 'req': A.need_requires([d['item'], {**d['item'], 'id': 'x2', 'engines': ['ode@1', 'warp@1', 7]}])}, ensure_ascii=False))`, gtmp], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  const norm = l => l.map(m => m.replace(/'/g, '"'));
  gpacks.forEach(([k, p], i) => {
    const js = P.checkActivities(p, Object.keys(p.translations || {})), py = gpy.packs[i];
    const same = JSON.stringify([norm(js.errors), norm(js.warnings)]) === JSON.stringify([norm(py[0]), norm(py[1])]);
    ok(same && (GGOOD.has(k) ? js.errors.length === 0 : js.errors.length > 0), `${k}: the same ${js.errors.length} error(s) in JS and Python${GGOOD.has(k) ? ' (passes)' : ' — ' + (js.errors[0] || '').slice(0, 120)}${same ? '' : '  JS: ' + JSON.stringify(js) + '  PY: ' + JSON.stringify(py)}`);
  });
  const msg = k => P.checkActivities(gpacks.find(x => x[0] === k)[1]).errors.join(' | ');
  ok(/engine "warp@1" is not an engine of the library/.test(msg('engines: unknown engine')) && /"circuit-mna@1" is not an engine of the library/.test(msg('engines: a plugin (circuit-mna@1)')) && /"formula@1" is not an engine/.test(msg('engines: formula@1'))
    && /the bundle uses the engine "timeline@1": list it in "engines"/.test(msg('engines: the bundle uses one not listed')) && /only an html-app@1 item lists engines/.test(msg('engines: on another runtime')) && /pack\.requires must list engine:graph@1/.test(msg('engines: not in pack.requires')),
    'engines: an unknown id, a plugin, formula@1, an engine the bundle uses but does not list, engines on another runtime and a missing pack.requires are refused with their own words');
  const jreq = P.needRequires([crItem, { ...crItem, id: 'x2', engines: ['ode@1', 'warp@1', 7] }]);
  ok(jreq.join() === 'activities/v1,runtime:html-app@1,engine:graph@1,engine:ode@1' && JSON.stringify(jreq) === JSON.stringify(gpy.req), 'pack.requires of mini-apps with engines: engine:<id> for each known engine they list (JS = Python) ' + JSON.stringify([jreq, gpy.req]));
  const l = P.lintHtml ? P.lintHtml(crHtml) : { errors: [], warnings: [] };
  ok(!l.errors.length && !l.warnings.length, 'the reference cheapest-route passes the bundle lint without a warning ' + JSON.stringify(l));
  // the protocol: two request types, checked like every other message
  ok(ACTP.check(M('engine:run', { engine: 'graph@1', spec: { model: {}, outputs: [] }, inputs: { k: 1 }, seed: 7 }, { id: 'e1' })).ok && ACTP.check(M('engine:check', { engine: 'graph@1', spec: {} }, { id: 'e2' })).ok, 'engine:run and engine:check are known messages');
  ok(!ACTP.check(M('engine:run', { engine: 'graph@1', spec: 'x' })).ok && !ACTP.check(M('engine:run', { engine: 'graph@1', spec: {}, seed: -1 })).ok && !ACTP.check(M('engine:run', { engine: 'graph@1', spec: {}, inputs: [1] })).ok
    && !ACTP.check(M('engine:check', { engine: 7, spec: {} })).ok && !ACTP.check(M('engine:run', { engine: 'graph@1', spec: { big: 'x'.repeat(70 * 1024) } })).ok, 'a spec that is not an object, a bad seed, inputs that are a list, an engine that is not a text and a request over 64 KB are refused (strikes)');
  // the host bridge: the frame's policy is unchanged (no Worker in the frame); only library engines, only declared ones, only in a Worker, with limits
  const h34 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '34_activity_html.js'), 'utf8'), s35 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '35_activity_sim.js'), 'utf8');
  ok(/"worker-src 'none'"/.test(h34) && /"connect-src 'none'"/.test(h34) && /NoemaCore\?\.engines\?\.catalog\.LIBRARY/.test(h34) && /declaredOf\(act\)\.filter\(id => lib\.has\(id\)/.test(h34) && /!s\.runner\.inWorker\(\)/.test(h34)
    && /outBytes: 512 \* 1024, perSec: 30, timeouts: 3/.test(h34) && /bridge\.close\(\)/.test(h34) && /'superseded'/.test(h34),
    'html-app@1: the frame still has no Worker and no network; the host runs only declared library engines, only in their Worker, ≤ 512 KB out, ≤ 30 requests/s, 3 timeouts and the engine is off, every Worker ended on unmount');
  ok(/ACT\.engineRunner = engineRunner/.test(s35) && /function respec\(s2, o2\)/.test(s35) && /self\.__i=null;self\.__i=self\.noemaEngine\.create/.test(s35), 'the mini-apps reuse the sim runtime\'s Worker runner (respec: another model in the same Worker; a failed model never leaves the old one behind)');
  // the bridge itself, in Node with a fake Worker runner: codes, the queue, the limits
  const vmctx = { console, Promise, Date, JSON, Object, Array, Set, String, Number, Math, Error, isFinite, setTimeout, clearTimeout };
  vmctx.window = vmctx; vmctx.Worker = function () { };
  let runs = [], closed = 0, inW = true;
  const graphE = { id: 'graph@1', workerSource: 'x', check: sp => (sp.model.bad ? ['model.bad: no'] : []), create() { } };
  vmctx.NoemaCore = { engines: { catalog: { LIBRARY: ['graph@1', 'timeline@1'] } } };
  vmctx.ACTP = ACTP;
  vmctx.ACT = { registerRuntime() { }, engine: id => (id === 'graph@1' ? graphE : null), engineRunner(E, spec, opts, onFail) { const r = { spec, opts, onFail, run(inp, done) { runs.push({ inp, done, r }); }, respec(sp, o) { r.spec = sp; r.opts = o; }, close() { closed++; }, inWorker: () => inW }; return r; } };
  vm.createContext(vmctx);
  vm.runInContext(h34.replace('ACT.registerRuntime({', 'globalThis.__bridge = engineBridge; ACT.registerRuntime({'), vmctx);
  const out = [], B = vmctx.__bridge({ engines: ['graph@1', 'timeline@1', 'warp@1'] }, 99, (type, payload, extra) => out.push({ type, payload, re: extra.re }));
  const last = () => out[out.length - 1].payload, spec = { model: { graph: {} }, outputs: [{ id: 'd', kind: 'scalar', of: 'result' }] };
  const R = (id, type, payload) => B.handle({ type, id, payload });
  ok(JSON.stringify(B.engines) === '["graph@1"]', 'the engines a mini-app gets: declared ∩ the library ∩ registered here (timeline@1 not loaded, warp@1 not of the library) ' + JSON.stringify(B.engines));
  R('a', 'engine:run', { engine: 'ode@1', spec }); ok(last().code === 'undeclared', 'an engine the registry entry does not list: undeclared');
  R('b', 'engine:run', { engine: 'timeline@1', spec }); ok(last().code === 'unavailable', 'a declared engine this app cannot run: unavailable');
  R('c', 'engine:check', { engine: 'graph@1', spec: { model: { bad: 1 }, outputs: [] } }); ok(last().ok === true && last().errors[0] === 'model.bad: no', 'check: the engine\'s own problems, as a list');
  R('d', 'engine:run', { engine: 'graph@1', spec: { model: { bad: 1 }, outputs: [] } }); ok(last().code === 'spec' && last().errors.length === 1, 'run with a model that fails its checks: spec, with the problems');
  R('e', 'engine:run', { engine: 'graph@1', spec: { outputs: [] } }); ok(last().code === 'spec', 'a spec without model: spec');
  R('f', 'engine:run', { engine: 'graph@1', spec, inputs: { 'a b': 1 } }); ok(last().code === 'inputs', 'inputs with a bad name: inputs');
  R('g', 'engine:run', { engine: 'graph@1', spec, inputs: { k: 'x' } }); ok(last().code === 'inputs', 'inputs that are not numbers: inputs');
  const n0 = out.length;
  R('h', 'engine:run', { engine: 'graph@1', spec, inputs: { k: 1 } }); R('i', 'engine:run', { engine: 'graph@1', spec, inputs: { k: 2 } }); R('j', 'engine:run', { engine: 'graph@1', spec: { ...spec, model: { graph: { x: 1 } } }, inputs: { k: 3 } });
  ok(runs.length === 1 && out.length === n0 + 1 && out[n0].re === 'i' && out[n0].payload.code === 'superseded' && runs[0].r.opts.seed === 99, 'one run at a time and one waiting: a newer request replaces the waiting one (superseded); the seed is the activity\'s');
  runs[0].done({ d: 5 }); ok(out[out.length - 1].re === 'h' && out[out.length - 1].payload.ok && out[out.length - 1].payload.outputs.d === 5 && runs.length === 2 && runs[1].r.spec.model.graph.x === 1, 'the answer goes back to its request; the waiting run starts on the same Worker with its own model (respec)');
  runs[1].done({ big: 'x'.repeat(600 * 1024) }); ok(out[out.length - 1].re === 'j' && out[out.length - 1].payload.code === 'too-big', 'outputs over 512 KB: too-big');
  R('k', 'engine:run', { engine: 'graph@1', spec }); runs[2].done(null); ok(last().code === 'failed', 'an engine that cannot compute: failed');
  for (let i = 0; i < 3; i++) { R('t' + i, 'engine:run', { engine: 'graph@1', spec }); runs[runs.length - 1].r.onFail('runaway'); }
  R('u', 'engine:run', { engine: 'graph@1', spec }); ok(out.filter(o => /^t\d$/.test(o.re)).every(o => o.payload.code === 'timeout') && last().code === 'unavailable', 'a run over the time limit: timeout (the Worker is ended); after 3 the engine is off for this mount');
  const B2 = vmctx.__bridge({ engines: ['graph@1'] }, 1, (type, payload, extra) => out.push({ type, payload, re: extra.re }));
  inW = false; B2.handle({ type: 'engine:run', id: 'w', payload: { engine: 'graph@1', spec } }); ok(last().code === 'unavailable', 'no Worker here: unavailable (a mini-app\'s model never runs on the page\'s own thread)'); inW = true;
  for (let i = 0; i < 40; i++) B2.handle({ type: 'engine:check', id: 'q' + i, payload: { engine: 'graph@1', spec } });
  ok(last().code === 'rate', 'more than 30 requests a second: rate');
  const B3 = vmctx.__bridge({ engines: ['graph@1'] }, 1, (type, payload, extra) => out.push({ type, payload, re: extra.re }));
  const c0 = closed, r0 = runs.length; B3.handle({ type: 'engine:run', id: 'z', payload: { engine: 'graph@1', spec } }); B3.close(); ok(runs.length === r0 + 1 && closed === c0 + 1, 'unmounted: every Worker of the mini-app is ended');
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
// h5p@1 in the toolkit, the connector, the site and the bundle (docs/INTERACTIVE_H5P.md)
const srv = fs.readFileSync(path.join(ROOT, 'cloud', 'mcp', 'server.mjs'), 'utf8'), bld = fs.readFileSync(path.join(ROOT, 'tools', 'build.py'), 'utf8');
ok(/'h5p_check\.py', 'h5p_allow\.json'/.test(bld) && /'38_activity_h5p\.js', '32_activities\.css'/.test(bld) && /'player\.js', 'LICENSE', 'LICENSE-NOTICE\.txt'\] \+ sorted/.test(bld) && /activity_host\/h5p\/' \+ f/.test(bld) && /'INTERACTIVE_H5P\.md'\)(?: \+ INTERACTIVE_P6)? if/.test(bld) && /'engine\/src\/38_activity_h5p\.js'/.test(bld),
  'h5p@1: the skill zip carries h5p_check.py, h5p_allow.json, the runtime and the player for the harness (with its licences and readable source); the connector runs NoemaH5P; the guide part "interactive" includes INTERACTIVE_H5P.md');
ok(/bundle_h5p\(metas, sel\)/.test(bld) && /engine\/vendor\/h5p\/3\.8\.2\/player\.js/.test(bld) && /h5p_entries\(m\)/.test(bld), 'h5p@1: the one-file bundle carries the player and small .h5p files inline; the site copies the library\'s .h5p files');
{ const sf = fs.readFileSync(path.join(ROOT, 'engine', 'srcfiles.js'), 'utf8'), ld = fs.readFileSync(path.join(ROOT, 'engine', 'loader.js'), 'utf8');
  ok(/wireActivities\(acc\.id, meta, pack\)/.test(ld) && /attachActivityFiles\(acc, b\.pack, b\.file\)/.test(ld) && /enumerable: false/.test(sf) && /packs\/\$\{subj\}\/\$\{a\.entry\}/.test(sf) && /actPath = \(uid, sid, a\) => `\$\{uid\}\/packs\/\$\{sid\}\/\$\{a\.entry\}/.test(srv),
    'h5p@1: the app keeps the .h5p file beside the pack (this device, packs/<subject>/<entry> in the account — the same path as the connector) and gives each item a loader that is never stored'); }
// 5. the content author learns it: the connector's guide has the part "interactive" (docs/INTERACTIVE.md + the playbook), the skill ships the toolkit

ok(/enum: \['workflow', 'content', 'visual', 'interactive'/.test(srv) && /interactive: DOCS\.interactive/.test(srv) && /docs\['interactive'\] = rd\('docs\/INTERACTIVE\.md'\)/.test(bld), 'noema_authoring_guide serves part "interactive" (and in "all")');
for (const f of ['activity_new.py', 'activity_lint.py', 'activity_test.py', 'activity_preview.py', 'activity_harness.js']) ok(fs.existsSync(path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', f)), 'the skill has ' + f);
ok(/'activities\.py'/.test(bld) && /'simexpr\.py'/.test(bld) && /activity_host/.test(bld) && /'35_activity_sim\.js', '37_activity_py\.js'/.test(bld) && /activity_host\/noema-engines\.js', engines_bundle\('--harness'\)/.test(bld) && /activities_examples/.test(bld), 'the skill zip carries activities.py, simexpr.py, the runtimes for the harness (html-app, sim-spec), the engine library (noema-engines.js) and the reference activities');
ok(/'circuit\.py'/.test(bld) && NoemaCore.engines.has('circuit-mna@1') && /'INTERACTIVE_SIMEXPR\.md', 'INTERACTIVE_CIRCUIT\.md'[,)]/.test(bld), 'the skill zip carries circuit.py and the circuit engine for the harness (in noema-engines.js); the guide part "interactive" includes the circuit engine');
ok(['thermal@1', 'pid@1', 'rf@1', 'twin@1'].every(id => NoemaCore.engines.has(id)) && /'thermal\.py', 'pid\.py', 'rf\.py', 'twin\.py'/.test(bld) && /'INTERACTIVE_CIRCUIT\.md', 'INTERACTIVE_ENGINES\.md'(?:, 'INTERACTIVE_[A-Z0-9]+\.md')*\)(?: \+ INTERACTIVE_P6)? if/.test(bld)
  && /ENGINES_SERVER, 'engine\/packcheck\.js'/.test(bld) && /<script>\{esc\(rd\("engine\/engines\.js"\)\)\}<\/script>\n<script>\{esc\(rd\("engine\/packcheck\.js"/.test(bld) && /'engine\.css', 'engines\.js'/.test(bld) && /wt\(os\.path\.join\(ENGINE, 'engines\.js'\), engines_bundle\('--harness'\)\)/.test(bld),
  'the P6 engines: the skill zip carries thermal.py, pid.py, rf.py, twin.py and the engines for the harness; the connector (every engine in hand), the site and the bundle (engine/engines.js) load them before packcheck; the guide part "interactive" includes INTERACTIVE_ENGINES.md');
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), pc = html.indexOf('engine/packcheck.js');
  ok(html.indexOf('<script src="engine/engines.js">') > 0 && html.indexOf('<script src="engine/engines.js">') < pc, 'the shell loads the engine library (engine/engines.js) before packcheck.js (the engines\' checkSpec)'); }
ok(['wasm_check.py', 'embed_check.py', 'embed_allow.json', 'h5p_import.py'].every(f => new RegExp(`SKILL_TOOLS = \\[[^\\]]*'${f.replace('.', '\\.')}'`).test(bld)) && /'44_activity_wasm\.js'\): z\.write/.test(bld)
  && /INTERACTIVE_P6 = \('INTERACTIVE_WASM\.md', 'INTERACTIVE_EMBED\.md', 'INTERACTIVE_XAPI\.md'\)/.test(bld) && /'INTERACTIVE_CIRCUIT\.md', 'INTERACTIVE_ENGINES\.md'(?:, 'INTERACTIVE_[A-Z0-9]+\.md')*\) \+ INTERACTIVE_P6 if os\.path\.exists/.test(bld) && ['INTERACTIVE_WASM.md', 'INTERACTIVE_EMBED.md', 'INTERACTIVE_XAPI.md'].every(f => fs.existsSync(path.join(ROOT, 'docs', f))),
  'P6: the skill zip carries wasm_check.py, embed_check.py + the allow-list, h5p_import.py and the wasm runtime for the harness; the guide part "interactive" includes the wasm, embed and xAPI pages');
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(['44_activity_wasm.js', '45_activity_embed.js'].every(f => html.includes('engine/src/' + f) && new RegExp(`'engine/src/${f.replace('.', '\\.')}'`).test(bld.split('MCP_ENGINE = ')[1].split('\n')[0]) && bld.includes(`rd("engine/src/${f}")`) && /^PAGE_SRC = \('43_xapi\.js', '44_activity_wasm\.js', '45_activity_embed\.js'\)$/m.test(bld) && /for f in PAGE_SRC: shutil\.copy/.test(bld))
    && /^var NoemaEmbed = /m.test(fs.readFileSync(path.join(ROOT, 'engine', 'src', '45_activity_embed.js'), 'utf8')),
    'the shell, the site, the one-file bundle and the connector load NoemaWasm and NoemaEmbed beside packcheck.js (45 declares var: it is loaded twice in the app)'); }
{ const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
  ok(/why === 'embed-refused' \|\| why === 'embed-graded' \? stop\(tE\('engine\.act\.embed\.refused'\), false\)/.test(src) && /why === 'embed-offline' \? stop\(tE\('engine\.act\.embed\.offline'\)\)/.test(src) && /why === 'embed-timeout' \? stop\(tE\('engine\.act\.embed\.timeout'/.test(src),
    'the core: a refused or graded outside page stops without Restart; offline or not loaded stops with Restart (retry)'); }
ok(/ENGINES_SERVER, 'engine\/packcheck\.js'/.test(bld) && /INTERACTIVE_SIMEXPR\.md/.test(bld), 'the connector runs the engine library (the expression language, every engine) before packcheck (sim-spec checks) and serves the expression language in the guide');
{ const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), a = html.indexOf('<script src="engine/engines.js">'), b = html.indexOf('engine/packcheck.js');
  ok(a > 0 && a < b && /'engine\.css', 'engines\.js'/.test(bld) && /rd\("engine\/engines\.js"\)\)\}<\/script>\n<script>\{esc\(rd\("engine\/packcheck\.js"/.test(bld),
    'the shell, the site and the one-file bundle load the engine library (the expression language, the circuit engine …) before packcheck.js (a sim-spec pack imported before any subject is open is checked, not refused)'); }
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
{ // activity_new.py --from offers every reference activity: the P6 engines' and wasm-oscillator
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noema-actnew-'));
  const sc = path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_new.py');
  const want = { heatsink: 'thermal@1', 'pid-tune': 'pid@1', 'lora-link': 'rf@1', 'sensor-node': 'twin@1', 'wasm-oscillator': 'wasm@1' };
  const rs = Object.keys(want).map(r => cp.spawnSync('python3', [sc, d, 'my-' + r, '--from', r], { encoding: 'utf8' }));
  const rj = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  const reg = rj(path.join(d, 'activities', 'activities.json'));
  const good = Object.entries(want).every(([r, eng]) => { const a = path.join(d, 'activities', 'my-' + r), sp = rj(path.join(a, 'spec.json')), t = rj(path.join(a, 'tests.json')).cases || [];
    return ('engine' in sp ? sp.engine : 'wasm@1') === eng && fs.existsSync(path.join(a, 'strings.el.json')) && fs.existsSync(path.join(d, 'media', `my-${r}-still.svg`))
      && t.length === 2 && t[0].expect?.passed === true && t[1].expect?.passed === false && t.every(c => c.exercise === 'chNN-eNNN' && /^TODO /.test(c.name)); });
  const usage = cp.spawnSync('python3', [sc], { encoding: 'utf8' }).stdout;
  ok(rs.every(r => r.status === 0) && reg.items?.length === 5 && good && Object.keys(want).every(r => usage.includes(r)),
    'activity_new.py --from heatsink / pid-tune / lora-link / sensor-node / wasm-oscillator copies each reference (its engine, strings, fallback, two TODO cases from its own tests); the usage names them');
}
{ // py-module@1 in the app: the runtime is drawn by the sim-spec view (no pack HTML), the runner stays sandboxed, Python never in the bundle
  const ui = fs.readFileSync(path.join(ROOT, 'engine', 'src', '37_activity_py_ui.js'), 'utf8'), rt = fs.readFileSync(path.join(ROOT, 'engine', 'src', '37_activity_py.js'), 'utf8');
  ok(/ACT\.simView\(box/.test(ui) && /check: \{ python: true \}/.test(ui) && !/innerHTML|eval\s*\(|new\s+Function/.test(ui), 'py-module@1 renders through the sim-spec view (its spec checked with python: true), no HTML from the pack');
  ok(/setAttribute\('sandbox', 'allow-scripts'\)/.test(rt) && /connect-src 'none'/.test(rt) && /!window\.NOEMA_BUNDLE/.test(rt), 'the Python runner: sandbox exactly allow-scripts, no network; not available in the one-file bundle');
  const core = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
  ok(/'py-module@1': true/.test(core) && /!window\.NOEMA_BUNDLE && window\.isSecureContext && \/\^https\?:\$\//.test(rt), "py-module@1 is on by default (ADR 001 §10: tested in Chromium, Firefox and WebKit); NOEMA_CONFIG.activities['py-module@1'] = false switches it off; it still refuses itself in the one-file bundle and on file://");
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noema-actnew-'));
  const r = cp.spawnSync('python3', [path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_new.py'), d, 'my-py', '--from', 'py-filter'], { encoding: 'utf8' });
  const reg = fs.existsSync(path.join(d, 'activities', 'activities.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'activities', 'activities.json'), 'utf8')) : null;
  ok(r.status === 0 && reg?.items?.[0]?.runtime === 'py-module@1' && reg.items[0].entry === 'activities/my-py/main.py' && fs.existsSync(path.join(d, 'activities', 'my-py', 'main.py')) && fs.existsSync(path.join(d, 'activities', 'my-py', 'spec.json')), 'activity_new.py --from py-filter copies the Python reference (main.py, spec.json, strings, the registry entry) ' + (r.stdout + r.stderr).slice(-200));
  ok(/'INTERACTIVE_PYTHON\.md'/.test(bld) && /'37_activity_py\.js', '37_activity_py_ui\.js'/.test(bld) && /pyodide-sw\.js/.test(bld) && /Service-Worker-Allowed: \/vendor\//.test(bld), 'the build: the guide part "interactive" and the skill carry INTERACTIVE_PYTHON.md and the Python runtime; the site copies the service worker and sends its headers');
}
(globalThis.__h5pParity || Promise.resolve()).catch(e => ok(false, 'h5p@1 package parity: ' + e.message)).then(() => { console.log(fails ? `\n${fails} of ${n} failed` : `\nactivities: ${n} checks passed`); process.exit(fails ? 1 : 0); });
