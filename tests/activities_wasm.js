/* wasm-module@1 and the sim-spec engine wasm@1 (engine/src/44_activity_wasm.js, docs/activities-dev/wasm.md).
   Node part (always):
     1. the fixtures: every tests/fixtures/wasm/*.wat assembles (watasm.py) to exactly the committed .wasm, and node's own WebAssembly accepts it;
     2. parity: tools/wasm_check.py and NoemaWasm.inspect give the same report (imports, exports, memory, errors, sha256) on every fixture
        and on broken binaries, at two page limits; checkItem / checkModel and check_item / check_model give the same messages;
     3. the synchronous sha256 equals node's crypto; the sim spec of the browser part passes NoemaPackCheck.checkSimSpec;
     4. the ABI mapping: the worker's own code (run here in node) through the engine's prepare → the oscillator's numbers exactly,
        the seeded noema_random, the capped log, a capped memory grow; neutralise() removes the network globals.
   Browser part (unless --node): a stub host page like activity_harness.js builds (ACTP from 32_activities.js, the sim runtime, this
     file) served over http, plus a beacon server: the oscillator through the sim-spec renderer (values and plot), the runtime
     wasm-module@1 with its own spec, runaway (engine: 5 s; NoemaWasm.load: budget 300 ms) and Restart, a forbidden import refused
     (the page check and the worker's own), the memory limits, 0 requests from the worker (fetch, XHR, WebSocket, EventSource,
     importScripts, Worker, sendBeacon). With --app <built repo dir>: the same oscillator, runaway + Restart and the refused import in
     the real app (index.html, file://, like tests/activities_app.js).
   Usage: node tests/activities_wasm.js [--node] [--app <repo dir with a built engine.js>]   (BROWSERS=chromium,firefox,webkit; PW_CHANNEL) */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures', 'wasm');
const args = process.argv.slice(2), NODE_ONLY = args.includes('--node'), APP = args.includes('--app') ? path.resolve(args[args.indexOf('--app') + 1]) : null;
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); return c; };
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x);
const py = (code, input) => JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import wasm_check as W\n` + code], { input: JSON.stringify(input), maxBuffer: 64 << 20 }).toString());

/* the app's pieces in node: NoemaExpr, packcheck, a stub ACT that captures what 44_activity_wasm.js registers */
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr');
require(path.join(ROOT, 'engine', 'packcheck.js'));
const REGD = { engines: {}, runtimes: {} };
globalThis.ACT = { ITEMS: {}, registerEngine: d => { REGD.engines[d.id] = d; }, registerRuntime: d => { REGD.runtimes[d.id] = d; }, runtime: id => REGD.runtimes[id] || null };
const W = require(path.join(ROOT, 'engine', 'src', '44_activity_wasm.js'));

/* the fixtures and the items / specs both parts use */
const wasm = f => fs.readFileSync(path.join(FIX, f + '.wasm'));
const item = (id, f, abi, extra) => { const b = wasm(f); return { id, runtime: 'wasm-module@1', wasm: b.toString('base64'), sha256: crypto.createHash('sha256').update(b).digest('hex'), bytes: b.length, abi, fallback: { text: 'A damped mass on a spring: the displacement decays as the damping takes the energy away.' }, ...(extra || {}) }; };
const N = 50;
const STRINGS = { en: { title: 'A damped oscillator', 'p.k': 'Spring constant k', 'p.c': 'Damping c', 'p.x0': 'Start displacement', 'r.E': 'Energy at the end', 'pl.t': 'Time', 'pl.x': 'Displacement', 'l.x': 'x(t)' } };
const oscSpec = (module, step) => ({ format: 'noema.sim-spec/v1', engine: 'wasm@1', title: 'title',
  model: { module, inputs: ['k', 'c', 'x0', '0', 'dt'], outputs: [{ id: 't', n: N }, { id: 'x', n: N }, { id: 'E' }], ...(step ? { step } : {}) },
  consts: { dt: 0.05 },
  params: [{ id: 'k', kind: 'slider', label: 'p.k', min: 1, max: 10, step: 0.5, default: 4 }, { id: 'c', kind: 'slider', label: 'p.c', min: 0, max: 2, step: 0.1, default: 0.2 }, { id: 'x0', kind: 'slider', label: 'p.x0', min: -2, max: 2, step: 0.1, default: 1 }],
  outputs: [{ id: 't', kind: 'series' }, { id: 'x', kind: 'series' }, { id: 'E', kind: 'scalar' }],
  readouts: [{ label: 'r.E', expr: 'E', format: 'fixed', digits: 6 }],
  plots: [{ kind: 'series', x: { series: 't', label: 'pl.t' }, y: { label: 'pl.x' }, series: [{ y: 'x', label: 'l.x' }] }] });
const ITEMS = {
  'osc-core': item('osc-core', 'osc', { version: 1, scratch: 1024, maxPages: 16 }),
  'imem-core': item('imem-core', 'imem', { scratch: 0, maxPages: 4 }),
  'bad-core': item('bad-core', 'forbidden', { scratch: 1024 }),
  'big-core': item('big-core', 'bigmem', { scratch: 1024, maxPages: 16 }),
};
ITEMS['osc-sim'] = { id: 'osc-sim', runtime: 'sim-spec@1', spec: oscSpec('osc-core'), strings: STRINGS, fallback: ITEMS['osc-core'].fallback };
ITEMS['osc-spin'] = { id: 'osc-spin', runtime: 'sim-spec@1', spec: oscSpec('osc-core', 'spin'), strings: STRINGS, fallback: ITEMS['osc-core'].fallback };
ITEMS['bad-sim'] = { id: 'bad-sim', runtime: 'sim-spec@1', spec: oscSpec('bad-core'), strings: STRINGS, fallback: ITEMS['osc-core'].fallback };
ITEMS['osc-own'] = { ...ITEMS['osc-core'], id: 'osc-own', spec: (({ engine, ...s }) => ({ ...s, model: { ...s.model, module: undefined } }))(oscSpec('osc-own')), strings: STRINGS };
delete ITEMS['osc-own'].spec.model.module;
/** the oscillator in plain JS, the same operations in the same order as osc.wat */
function osc(k, c, x, v, dt, n) { const t = [], xs = []; for (let i = 0; i < n; i++) { t.push(i * dt); xs.push(x); const a = -(k * x) - c * v; v = a * dt + v; x = v * dt + x; } return { t, x: xs, E: 0.5 * v * v + 0.5 * k * x * x }; }

function nodePart() {
  console.log('— 1. the fixtures');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-wasm-'));
  for (const f of fs.readdirSync(FIX).filter(f => f.endsWith('.wat')).sort()) {
    const out = path.join(tmp, f.replace(/\.wat$/, '.wasm'));
    cp.execFileSync('python3', [path.join(FIX, 'watasm.py'), path.join(FIX, f), out]);
    const same = Buffer.compare(fs.readFileSync(out), wasm(f.slice(0, -4))) === 0;
    let valid = false; try { new WebAssembly.Module(fs.readFileSync(out)); valid = true; } catch (e) { }
    ok(same && valid, `${f} assembles to the committed ${f.slice(0, -4)}.wasm, and WebAssembly accepts it`);
  }

  console.log('— 2. parity: tools/wasm_check.py and NoemaWasm.inspect');
  const bins = {};
  for (const f of ['osc', 'imem', 'forbidden', 'badsig', 'bigmem', 'nomax']) bins[f] = wasm(f);
  bins.truncated = wasm('osc').subarray(0, 200); bins.magic = Buffer.from('not wasm at all'); bins.empty = Buffer.alloc(0);
  bins.huge = Buffer.concat([wasm('osc').subarray(0, 8), Buffer.alloc(W.MAX_BYTES)]);
  bins.version2 = Buffer.from(wasm('osc')); bins.version2[4] = 2;
  const cases = []; for (const [k, b] of Object.entries(bins)) for (const mp of [16, 256]) cases.push({ k, mp, b64: b.toString('base64') });
  const P = py('import base64\nC = json.load(sys.stdin)\nprint(json.dumps([W.inspect(base64.b64decode(c["b64"]), c["mp"]) for c in C]))', cases);
  cases.forEach((c, i) => { const J = W.inspect(new Uint8Array(Buffer.from(c.b64, 'base64')), c.mp); ok(canon(J) === canon(P[i]), `${c.k} (max ${c.mp} pages): the same report${canon(J) === canon(P[i]) ? '' : '\n      js ' + canon(J) + '\n      py ' + canon(P[i])}`); });
  const verdict = f => W.inspect(new Uint8Array(bins[f]), 16);
  ok(verdict('osc').ok && verdict('imem').ok, 'osc and imem are fine');
  ok(/^import: env\.fetch_url \(func\) is not in the host ABI/.test(verdict('forbidden').errors[0]), 'a forbidden import is refused: ' + verdict('forbidden').errors[0]);
  ok(/^import: noema\.noema_now must be \(\)->\(f64\), it is \(\)->\(i32\)/.test(verdict('badsig').errors[0]), 'a host function with the wrong signature is refused');
  ok(/^memory: the declared maximum is 65536 pages \(at most 16\)/.test(verdict('bigmem').errors[0]) && /^memory: the memory has no maximum/.test(verdict('nomax').errors[0]), 'a memory over the limit or without a maximum is refused');
  ok(/^size:/.test(verdict('huge').errors[0]) && /^format:/.test(verdict('magic').errors[0]) && /^format: the module is malformed/.test(verdict('truncated').errors[0]), 'too big, not wasm, truncated: refused with their codes');
  const osc0 = verdict('osc');
  ok(canon(osc0.exports.map(e => e.name)) === canon(['memory', 'init', 'step', 'spin', 'grow', 'rnd']) && osc0.memory.max === 2 && osc0.exports.find(e => e.name === 'step').type === '(i32,i32,i32,i32)->()', 'the report lists the exports, their types and the memory');

  // items and models
  const it = ITEMS['osc-core'];
  const itemCases = [it, { ...it, sha256: '0'.repeat(64) }, { ...it, wasm: 'not base64!' }, { ...it, abi: { scratch: 3, maxPages: 0, budgetMs: 10, extra: 1 } }, { ...it, abi: {} },
    { ...it, runtime: 'html-app@1' }, { ...it, bytes: 7 }, ITEMS['bad-core'], ITEMS['big-core'], ITEMS['imem-core'], { ...it, abi: { scratch: 1024, step: 'nope' } }, null];
  const PI = py('C = json.load(sys.stdin)\nprint(json.dumps([W.check_item(c)[0] for c in C]))', itemCases);
  itemCases.forEach((c, i) => { const J = W.checkItem(c).problems; ok(canon(J) === canon(PI[i]), `item case ${i}: the same problems ${canon(J)}${canon(J) === canon(PI[i]) ? '' : ' / py ' + canon(PI[i])}`); });
  ok(W.checkItem(it).problems.length === 0 && W.checkItem(itemCases[4]).problems[0].startsWith('abi.scratch:'), 'a good item passes; a module without alloc needs abi.scratch');
  const S = oscSpec('osc-core'), modelCases = [S,
    { ...S, model: { ...S.model, module: 'nope' } }, { ...S, model: { ...S.model, extra: 1, step: 'spin' } }, { ...S, model: { ...S.model, step: 'grow' } },
    { ...S, model: { ...S.model, outputs: [{ id: 't' }, { id: 'x', n: 50 }, { id: 'E', n: 3 }] } }, { ...S, model: { ...S.model, outputs: [{ id: 't', n: 50 }] } },
    { ...S, model: { ...S.model, inputs: ['k', 'nosuch + 1', ''] } }, { ...S, model: { ...S.model, inputs: [] } }, { ...S, model: { ...S.model, module: 'bad-core' } },
    { ...S, model: { ...S.model, init: 'step' } }, { ...S, model: null }];
  const PM = py('C = json.load(sys.stdin)\nI = C.pop()\nprint(json.dumps([W.check_model(c, I) for c in C]))', [...modelCases, ITEMS]);
  modelCases.forEach((c, i) => { const J = W.checkModel(c, ITEMS); ok(canon(J) === canon(PM[i]), `model case ${i}: the same problems ${canon(J)}${canon(J) === canon(PM[i]) ? '' : ' / py ' + canon(PM[i])}`); });
  ok(W.checkModel(S, ITEMS).length === 0, 'the oscillator model passes');

  console.log('— 3. sha256, the spec');
  let shaOk = true; for (const len of [0, 1, 55, 56, 63, 64, 65, 1000, 123457]) { const b = crypto.randomBytes(len); if (W.sha256(new Uint8Array(b)) !== crypto.createHash('sha256').update(b).digest('hex')) shaOk = false; }
  ok(shaOk, 'the synchronous sha256 equals node crypto (0 … 123 457 bytes)');
  const engs = ['formula@1', 'circuit-mna@1', 'wasm@1'];
  for (const id of ['osc-sim', 'osc-spin', 'bad-sim']) { const p = globalThis.NoemaPackCheck.checkSimSpec(ITEMS[id].spec, STRINGS, engs); ok(p.length === 0, `the spec of ${id} passes checkSimSpec ${p.slice(0, 2).join(' | ')}`); }
  const ownSpec = { ...ITEMS['osc-own'].spec, engine: 'wasm@1', model: { ...ITEMS['osc-own'].spec.model, module: 'osc-own' } };
  ok(globalThis.NoemaPackCheck.checkSimSpec(ownSpec, STRINGS, engs).length === 0 && W.checkModel(ownSpec, ITEMS).length === 0, 'the own spec of osc-own (as the runtime completes it) passes');

  console.log('— 4. the ABI mapping (the worker code, run in node)');
  const E = REGD.engines['wasm@1'];
  ok(E && typeof E.workerSource === 'string' && typeof E.prepare === 'function' && REGD.runtimes['wasm-module@1']?.autoHeight, 'wasm@1 and wasm-module@1 are registered');
  let threw = null; try { E.create(S, {}); } catch (e) { threw = e.code; } ok(threw === 'worker', 'create on the page thread refuses (a module runs only in a worker)');
  globalThis.ACT.ITEMS = ITEMS;
  ok(canon(E.check(S)) === '[]' && /refused/.test(E.check(oscSpec('bad-core'))[0] || ''), 'the engine check: the oscillator passes, the forbidden import is refused');
  const g = { performance, console: { log: () => { } } }; W._wasmWorker(g);
  const prep = E.prepare(S, NoemaExpr.compile), inst = g.noemaEngine.create(S, { seed: 7 });
  const env = { dt: 0.05, k: 4, c: 0.2, x0: 1 }, inp = prep(env);
  ok(canon(inp.$in) === canon([4, 0.2, 1, 0, 0.05]) && inp.$mod.nOut === 2 * N + 1 && inp.$mod.bytes.length === wasm('osc').length, 'prepare: the inputs in order, the layout (2n+1 values), the checked bytes');
  const r = inst.run(inp), ref = osc(4, 0.2, 1, 0, 0.05, N);
  ok(canon(r.t) === canon(ref.t) && canon(r.x) === canon(ref.x) && r.E === ref.E, `the oscillator: t, x and E exactly as the JS reference (E = ${r.E})`);
  const r2 = inst.run(prep({ ...env, k: 9, c: 1.5 })), ref2 = osc(9, 1.5, 1, 0, 0.05, N);
  ok(canon(r2.x) === canon(ref2.x) && r2.E === ref2.E && r2.E < ref.E, 'new inputs, the same instance: the new numbers');
  const core = g.noemaWasmCore, ab = { step: 'step', init: 'init', maxPages: 16, scratch: 1024, memMin: 1, memMax: 2 };
  const a1 = core.instantiate(new Uint8Array(wasm('osc')), ab, 42), a2 = core.instantiate(new Uint8Array(wasm('osc')), ab, 42), a3 = core.instantiate(new Uint8Array(wasm('osc')), ab, 43);
  const R1 = Array.from(a1.call('rnd', [], 5)), R2 = Array.from(a2.call('rnd', [], 5)), R3 = Array.from(a3.call('rnd', [], 5));
  ok(canon(R1) === canon(R2) && canon(R1) !== canon(R3) && R1.every(v => v >= 0 && v < 1), 'noema_random: the same seed gives the same numbers, another seed others');
  a1.reseed(); ok(canon(Array.from(a1.call('rnd', [], 5))) === canon(R1), 'reseed: the run starts from the seed again');
  ok(canon(a1.takeLog()) === canon(['osc ready']), 'noema_log: init wrote "osc ready" (read from the module memory)');
  ok(a1.raw('grow', [1]) === 1 && a1.raw('grow', [1]) === -1 && a1.pages() === 2, 'a defined memory grows only to its declared maximum (2 pages)');
  const m1 = core.instantiate(new Uint8Array(wasm('imem')), { step: 'step', init: 'init', maxPages: 4, scratch: 0, memMin: 1, memMax: null }, 1);
  ok(m1.raw('grow', [2]) === 1 && m1.raw('grow', [10]) === -1 && m1.raw('grow', [1]) === 3 && m1.raw('grow', [1]) === -1 && m1.pages() === 4, 'an imported memory without a maximum is capped at abi.maxPages (4)');
  ok(m1.call('step', [1, 2, 3.5], 1)[0] === 6.5, 'imported memory: step reads the inputs and writes the output');
  let lt = null; try { core.instantiate(new Uint8Array(wasm('forbidden')), ab, 1); } catch (e) { lt = e.code; } ok(lt === 'import', "the worker's own import check refuses env.fetch_url before instantiation");
  const fake = { fetch() { }, XMLHttpRequest() { }, WebSocket() { }, EventSource() { }, importScripts() { }, Worker() { }, postMessage() { } };
  const proto = { indexedDB: {}, caches: {} }; Object.setPrototypeOf(fake, proto); W._neutralise(fake);
  ok(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'indexedDB', 'caches'].every(k => fake[k] === undefined) && typeof fake.postMessage === 'function', 'neutralise: the network globals are gone (own and inherited), postMessage stays');
  ok(!/tE\(|textContent\s*=\s*['"`]/.test(fs.readFileSync(path.join(ROOT, 'engine', 'src', '44_activity_wasm.js'), 'utf8')), 'the engine file shows no text of its own (codes only)');
}

/* ---------- the browser part ---------- */
async function browserPart() {
  let pw; try { pw = require(process.env.PW || 'playwright'); } catch (e) { console.log('  (Playwright is not installed: the browser part is skipped)'); return; }
  const http = require('http');
  const rd = f => fs.readFileSync(path.join(ROOT, 'engine', 'src', f), 'utf8');
  const s32 = rd('32_activities.js'), ACTP = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));
  const hline = fs.readFileSync(path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_harness.js'), 'utf8').split('\n').find(l => l.startsWith('function h(tag'));
  const WORDS = { 'engine.act.sim.reset': 'Reset the values', 'engine.act.sim.computing': 'Computing…', 'engine.act.sim.results': 'Results', 'engine.act.sim.plot': 'Plot of {y} against {x}' };
  const HOST = `<!doctype html><meta charset="utf-8"><style>${rd('32_activities.css')}</style><body><div id="box" class="act-box"></div><script>
var RT = {}, EN = {}; var ACT = { ITEMS: ${JSON.stringify(ITEMS)}, registerRuntime: function (d) { RT[d.id] = d; }, registerEngine: function (d) { EN[d.id] = d; }, engine: function (id) { return EN[id] || null; }, engines: function () { return Object.keys(EN); }, runtime: function (id) { return RT[id] || null; } };
var WORDS = ${JSON.stringify(WORDS)};
function tE(k, v) { return String(WORDS[k] || k).replace(/\\{(\\w+)\\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }
${hline}
${ACTP}
window.ACTP = ACTP;
</script><script>${fs.readFileSync(path.join(ROOT, 'engine', 'engines.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script><script>${fs.readFileSync(path.join(ROOT, 'engine', 'packcheck.js'), 'utf8')}</script><script>${rd('35_activity_sim.js')}</script><script>${rd('44_activity_wasm.js')}</script><script>
window.LOG = []; window.H = null;
window.run = function (id, task) {
  var act = ACT.ITEMS[id], box = document.getElementById('box'); box.innerHTML = ''; window.LOG = [];
  if (window.H) try { window.H.close(); } catch (e) {}
  var init = { activityId: id, exerciseId: null, attemptId: 't', seed: 12345, task: task || {}, locale: 'en', strings: (act.strings || {}).en || {}, theme: {}, state: null, stateVersion: 1, capabilities: [], limits: {} };
  window.H = RT[act.runtime].mount(box, { act: act, init: init, title: id,
    onMessage: function (raw) { var r = ACTP.check(raw); LOG.push(r.ok ? r.msg : { type: 'bad', why: r.why }); },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); } });
};
</script>`;
  // the host server (the page) and the beacon server (anything the worker might try to reach)
  const pageHits = [], beaconHits = [];
  const srv = http.createServer((q, s) => { pageHits.push(q.url); s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(HOST); });
  const beacon = http.createServer((q, s) => { beaconHits.push(q.method + ' ' + q.url); s.writeHead(200, { 'access-control-allow-origin': '*' }); s.end('hit'); });
  beacon.on('upgrade', (q, sock) => { beaconHits.push('UPGRADE ' + q.url); sock.destroy(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); await new Promise(r => beacon.listen(0, '127.0.0.1', r));
  const PAGE = `http://127.0.0.1:${srv.address().port}/host.html`, BEACON = `http://127.0.0.1:${beacon.address().port}`;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(100); } return false; };
  const ref = osc(4, 0.2, 1, 0, 0.05, N), ref9 = osc(9, 0.2, 1, 0, 0.05, N);
  for (const name of (process.env.BROWSERS || 'chromium,firefox,webkit').split(',')) {
    console.log(`— browser: ${name}`);
    let browser; try { browser = await pw[name].launch(name === 'chromium' && process.env.PW_CHANNEL !== '' ? { channel: process.env.PW_CHANNEL || 'chromium' } : {}); } catch (e) { console.log(`  (${name} is not installed here: skipped — ${e.message.split('\n')[0]})`); continue; }
    const p = await (await browser.newContext()).newPage(); p.setDefaultTimeout(15000);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    pageHits.length = 0; beaconHits.length = 0;
    await p.goto(PAGE);
    ok(await p.evaluate(() => !!(window.NoemaWasm && EN['wasm@1'] && RT['wasm-module@1'] && RT['sim-spec@1'])), 'the page has the sim runtime, wasm@1 and wasm-module@1');
    const started = () => until(() => p.evaluate(() => LOG.some(m => m.type === 'ready' || m.type === 'fail')));
    const values = () => until(() => p.evaluate(() => { const v = window.H && H.values && H.values(); return !!(v && typeof v.E === 'number' && v.E === v.E); }));

    // the oscillator through the renderer
    await p.evaluate(() => run('osc-sim')); await started(); await values();
    let v = await p.evaluate(() => H.values());
    ok(v && v.E === ref.E, `the sim-spec renderer: E = ${v && v.E} (the JS reference ${ref.E})`);
    ok(await p.evaluate(() => { const d = document.querySelector('#box path.sim-line')?.getAttribute('d') || ''; return d.split('L').length >= 40; }), 'the plot of x(t) is drawn (≥ 40 points)');
    ok(await p.evaluate(() => /Energy at the end/.test(document.getElementById('box').textContent)), 'the readout shows its label from the string table');
    await p.evaluate(() => { const e = document.querySelector('#box [data-param="k"]'); e.value = '9'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    ok(await until(async () => { const w = await p.evaluate(() => H.values()); return w && w.E === ref9.E; }), `k = 9: the new E (${ref9.E}) comes from the worker`);
    ok(await p.evaluate(() => !LOG.some(m => m.type === 'fail' || m.type === 'bad')), 'no failure, no bad message');

    // the runtime wasm-module@1 with its own spec
    await p.evaluate(() => run('osc-own')); await started(); await values();
    v = await p.evaluate(() => H.values());
    ok(v && v.E === ref.E, 'wasm-module@1 with its own spec: the same numbers');

    // a forbidden import: refused before anything runs (the fallback in the app: onFail spec)
    await p.evaluate(() => run('bad-sim')); await started();
    ok(await p.evaluate(() => LOG.some(m => m.type === 'fail' && m.why === 'spec') && !document.querySelector('#box .sim')), 'a forbidden import: the spec fails (spec), nothing is shown → the fallback');
    const L = await p.evaluate(async () => { try { await NoemaWasm.load(ACT.ITEMS['bad-core']); return 'loaded'; } catch (e) { return e.code; } });
    ok(L === 'import', 'NoemaWasm.load refuses it too (code import)');
    const L2 = await p.evaluate(async () => { const it = ACT.ITEMS['bad-core'], bin = atob(it.wasm), b = Uint8Array.from(bin, c => c.charCodeAt(0));
      const u = URL.createObjectURL(new Blob([NoemaWasm.workerSource() + '(' + NoemaWasm._directTail.toString() + ')(self);'], { type: 'text/javascript' })), w = new Worker(u);
      return new Promise(r => { w.onmessage = e => { w.terminate(); r(e.data.t + ':' + e.data.code); }; w.postMessage({ t: 'w:load', id: 1, bytes: b, abi: { step: 'step', init: 'init', maxPages: 16, scratch: 1024 }, seed: 1 }); setTimeout(() => r('timeout'), 5000); }); });
    ok(L2 === 'w:err:import', "past the page check, the worker's own check refuses it before instantiation: " + L2);

    // runaway: the engine (the sim runtime's 5 s) and NoemaWasm.load (its budget), then Restart
    const t0 = Date.now(); await p.evaluate(() => run('osc-spin'));
    ok(await until(() => p.evaluate(() => LOG.some(m => m.type === 'fail' && m.why === 'runaway')), 9000), `the endless step through the engine: runaway after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    ok(await p.evaluate(() => { const t = performance.now(); return new Promise(r => setTimeout(() => r(performance.now() - t < 400), 50)); }), 'the page stayed responsive');
    await p.evaluate(() => run('osc-sim')); await started();
    ok(await values() && (await p.evaluate(() => H.values().E)) === ref.E, 'Restart (a new mount): the oscillator runs again');
    const RA = await p.evaluate(async () => {
      const h = await NoemaWasm.load(ACT.ITEMS['osc-core'], { budgetMs: 300 }); const t = performance.now(); let code = null;
      try { await h.call('spin', [], 1); } catch (e) { code = e.code; }
      const ms = performance.now() - t, st = h.state();
      let after = null; try { await h.call('step', [4, 0.2, 1, 0, 0.05], 101); } catch (e) { after = e.code; }
      await h.restart(); const r = await h.call('step', [4, 0.2, 1, 0, 0.05], 101); h.close();
      return { code, ms, st, after, E: r.out[100], x3: r.out[53], log: r.log };
    });
    ok(RA.code === 'runaway' && RA.ms < 1500 && RA.st === 'stopped', `NoemaWasm.load, budget 300 ms: the endless call stops with runaway after ${Math.round(RA.ms)} ms, the worker is terminated`);
    ok(RA.after === 'stopped' && RA.E === ref.E && RA.x3 === ref.x[3], 'a call after the stop is refused; restart() runs the module again (the same numbers)');

    // the memory limits
    const M = await p.evaluate(async () => {
      let big = null; try { await NoemaWasm.load(ACT.ITEMS['big-core']); } catch (e) { big = e.code; }
      const h = await NoemaWasm.load(ACT.ITEMS['imem-core']); const a = await h.raw('grow', 2), b = await h.raw('grow', 10), c = await h.raw('grow', 1), d = await h.raw('grow', 1); h.close();
      return { big, a: a.value, b: b.value, c: c.value, d: d.value, pages: d.pages };
    });
    ok(M.big === 'memory', 'a module that declares a maximum over the limit is refused (memory)');
    ok(M.a === 1 && M.b === -1 && M.c === 3 && M.d === -1 && M.pages === 4, 'an imported memory grows only up to abi.maxPages (4): ' + JSON.stringify(M));

    // nothing leaves the worker
    const probe = await p.evaluate(async B => {
      const code = `var R = {}; function t(k, f) { try { var x = f(); R[k] = x === undefined ? 'undefined' : 'ran'; } catch (e) { R[k] = 'threw'; } }
        t('fetch', function () { return fetch('${B}/fetch'); }); t('xhr', function () { var x = new XMLHttpRequest(); x.open('GET', '${B}/xhr', false); x.send(); });
        t('ws', function () { return new WebSocket('${B}'.replace('http', 'ws') + '/ws'); }); t('es', function () { return new EventSource('${B}/es'); });
        t('importScripts', function () { importScripts('${B}/is.js'); }); t('worker', function () { return new Worker('${B}/w.js'); });
        t('beacon', function () { return navigator.sendBeacon('${B}/beacon'); }); t('proto', function () { return Object.getPrototypeOf(self).fetch('${B}/proto'); });
        t('ctor', function () { return self.constructor.prototype.fetch.call(self, '${B}/ctor'); });
        postMessage(R);`;
      const u = URL.createObjectURL(new Blob([NoemaWasm.workerSource() + code], { type: 'text/javascript' })), w = new Worker(u);
      return new Promise(r => { w.onmessage = e => r(e.data); setTimeout(() => r(null), 5000); });
    }, BEACON);
    await wait(1500);
    ok(probe && Object.values(probe).every(x => x === 'threw'), 'inside the worker every way out throws (fetch, XHR, WebSocket, EventSource, importScripts, Worker, sendBeacon, prototypes): ' + JSON.stringify(probe));
    ok(beaconHits.length === 0, `0 requests reached the beacon server during the whole run ${JSON.stringify(beaconHits)}`);
    ok(pageHits.length >= 1 && pageHits.every(u => u === '/host.html' || u === '/favicon.ico'), `the page server saw only the page itself ${JSON.stringify(pageHits)}`);
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));

    if (APP) await appPart(browser, ref);
    await browser.close();
  }
  srv.close(); beacon.close();
}

/* the real app (a built engine.js with 44_activity_wasm.js in it), like tests/activities_app.js: the items are put into ACT.ITEMS of an open subject */
async function appPart(browser, ref) {
  console.log('  — the real app');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(150); } return false; };
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + APP + '/index.html?subject=' + (process.env.APP_SUBJECT || 'demo-physics')); await wait(1500);
  if (!ok(await until(() => p.evaluate(() => typeof ACT !== 'undefined' && !!ACT.engine('wasm@1') && !!ACT.runtime('wasm-module@1'))), 'the app has wasm@1 and wasm-module@1 (engine.js built with 44_activity_wasm.js)')) return;
  ok(await p.evaluate(() => ACT.caps().has('runtime:wasm-module@1') && ACT.caps().has('engine:wasm@1')), 'ACT.caps() names runtime:wasm-module@1 and engine:wasm@1 (pack.requires)');
  await p.evaluate(I => { Object.assign(ACT.ITEMS, I); }, ITEMS);
  // a block that comes into view while the live slots are taken (blocks of the cleared page are destroyed only by their watchdog, ≤ 2 s)
  // waits with its Start button over the fallback: press it, so that what is checked is the activity's own start, never the parked state
  const mountBlk = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: id })); scrollTo(0, 0); }, id);
    if (await until(() => p.evaluate(() => !!document.querySelector('main .sim') || !!document.querySelector('main .act-note')?.textContent), 1500)) return;
    const b = p.locator('main .act-bar button.btn.primary'); if (await b.count()) await b.first().click(); };
  await mountBlk('osc-sim');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .sim') && /Energy at the end/.test(document.querySelector('main').textContent))), 'the oscillator renders in the app (controls, readout) ' + JSON.stringify(await p.evaluate(() => document.querySelector('main').innerText.slice(0, 160))));
  const want = ref.E.toFixed(6);
  ok(await until(() => p.evaluate(w => document.querySelector('main').textContent.replace(/−/g, '-').includes(w), want)), `the readout shows E = ${want}`);
  await mountBlk('osc-spin');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && document.querySelector('main .act-note').textContent.length > 0), 12000), 'the endless step: stopped, the fallback and a notice');
  const restart = p.locator('main .act-bar button', { hasText: /Restart|↻/ });
  ok(await restart.count() >= 1, 'Restart is offered');
  await mountBlk('bad-sim');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && !document.querySelector('main .sim') && /damped mass/.test(document.querySelector('main').textContent))), 'a forbidden import: the fallback text, nothing runs');
  ok(await p.evaluate(() => !document.querySelector('main .act-bar button')), 'no Restart for a refused module');
  ok(!errs.length, 'no page errors in the app ' + JSON.stringify(errs.slice(0, 3)));
}

(async () => {
  console.log('wasm-module@1 / wasm@1');
  nodePart();
  if (!NODE_ONLY) await browserPart();
  console.log(fails ? `\n✗ ${fails} of ${n} failed` : `\n✓ all ${n} fine`);
  process.exit(fails ? 1 : 0);
})();
