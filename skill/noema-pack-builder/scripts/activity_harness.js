/* The activity harness (docs/INTERACTIVE.md §11): runs a subject's activities in a real browser with the app's own runtime
   (the same frame, CSP, loop guard and protocol as the app), without the app.
     node activity_harness.js test    SUBJECT_DIR [ID]          → every activity in every language: it says hello, shows no
                                                                   errors, and each case of activities/<id>/tests.json holds
     node activity_harness.js preview SUBJECT_DIR ID [OUT_DIR]  → screenshots: light, dark, 360 px wide, the fallback
   sim-spec@1 activities run in the app's own sim runtime (35_activity_sim.js, with the spec check of packcheck.js); in their
   tests.json a step {"set": "<param id>", "value": v} sets a control, "values": {name: number | [lo, hi]} checks a computed value,
   "passed" the exercise's checks grader, "state" the saved values. A bench (circuit-mna@1 or twin@1, docs/INTERACTIVE.md §12.7): a step
   {"measure": {"instrument": "V", "a": "TP3", "b": "GND"}} (or {"instrument": "I", "part": 0}) takes a measurement, {"diagnose": 6}
   picks the 7th diagnosis; "readings": [[i, lo, hi]] checks the number of the i-th measurement, "log": n how many there are;
   a case's "task" (e.g. {"fault": "rOpen"}) overrides the exercise's task.params.
   wasm-module@1 (docs/INTERACTIVE_WASM.md): activities/<id>/module.wasm (+ its own spec.json) runs like a sim-spec@1 activity, with
   the app's wasm runtime (44_activity_wasm.js: the module checked, then run in a worker without network); a sim-spec@1 spec with
   engine wasm@1 finds its module item in activities.json. external-embed@1 is not run here (it needs the network and the provider's
   page): check it with embed_check.py.
   py-module@1 (docs/INTERACTIVE_PYTHON.md) runs like sim-spec@1 (the same steps and expectations; "values" are Python's scalar outputs),
   over a small local http server that also serves the pinned Python files: from $NOEMA_PYODIDE_SITE (a folder with vendor/pyodide/manifest.json,
   e.g. dist/site after `python3 tools/fetch_pyodide.py`) or the repository's dist/site. Without them the Python activities are skipped
   (and the harness exits 2 when nothing else was checked).
   h5p@1 items (an ordinary .h5p file, docs/INTERACTIVE_H5P.md) play in the app's own H5P runtime (38_activity_h5p.js + the vendored
   player): in every language of the pack (the subject's own and each content.<locale>.json); a step {"click": selector} or
   {"set": selector, "value": v} acts inside the item, "passed" is the score H5P reports (xAPI answered), "state" the saved
   state ({"h5p": …}), a case's "locale" plays it in that language.
   html-app@1 mini-apps that list engines of the library ("engines": ["graph@1"], docs/INTERACTIVE.md §8.1) get them through
   noema.engine(id) exactly as in the app (the host's checks, the engine's own Worker, its time limit); a step {"waitFor": selector}
   waits (≤ 8 s) until the selector matches inside the mini-app, e.g. until the engine has answered.
   Called by activity_test.py and activity_preview.py. Needs Playwright with Chromium (npm i playwright; npx playwright install chromium). */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto');
let pw; try { pw = require(process.env.PW || 'playwright'); } catch (e) {
  console.log('✗ Playwright is not installed here. Install it:  npm i playwright && npx playwright install chromium   (then run again)'); process.exit(2);
}
const HERE = __dirname;
const [mode, sdirArg, onlyId, outArg] = process.argv.slice(2);
if (!mode || !sdirArg) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(1); }
const SDIR = path.resolve(sdirArg);

/* the app's runtime: in the skill zip it is in activity_host/; in the repository, in engine/src/ */
const srcDir = [path.join(HERE, 'activity_host'), path.join(HERE, '..', '..', '..', 'engine', 'src')].find(d => fs.existsSync(path.join(d, '34_activity_html.js')));
if (!srcDir) { console.log('✗ the activity runtime (activity_host/34_activity_html.js) is missing from the toolkit'); process.exit(2); }
const rd = f => fs.readFileSync(path.join(srcDir, f), 'utf8');
const inl = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\x21--');   // a source inlined in the host page: "</script" must not end the <script>, nor "<!--" … "<script" make the parser skip its end (tools/build.py esc)
const rs = f => inl(rd(f));
const s32 = rd('32_activities.js'), ACTP = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));

/* the subject's activities, read like make_pack.py does */
const rj = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const regPath = path.join(SDIR, 'activities', 'activities.json');
if (!fs.existsSync(regPath)) { console.log('✗ no activities/activities.json in ' + SDIR); process.exit(1); }
const allItems = (rj(regPath).items || []).map(a => {
  const dir = path.join(SDIR, 'activities', a.id), strings = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = f.match(/^strings\.(.+)\.json$/); if (m) strings[m[1]] = rj(path.join(dir, f)); }
  const entry = a.entry ? path.join(SDIR, a.entry) : null;
  const text = entry && fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : '';
  if (a.runtime === 'sim-spec@1') { let spec = null; try { spec = JSON.parse(text); } catch (e) { spec = null; } return { ...a, spec, strings, _dir: dir }; }
  if (a.runtime === 'wasm-module@1') {   // the module as make_pack.py puts it in the pack: base64 + sha256 + bytes; its own spec beside it
    const b = entry && fs.existsSync(entry) ? fs.readFileSync(entry) : null, sp = path.join(dir, 'spec.json');
    let spec; try { spec = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : undefined; } catch (e) { spec = null; }
    return { ...a, ...(b ? { wasm: b.toString('base64'), sha256: require('crypto').createHash('sha256').update(b).digest('hex'), bytes: b.length } : {}), ...(spec !== undefined ? { spec } : {}), strings, _dir: dir };
  }
  if (a.runtime === 'py-module@1') {   // main.py + its spec.json beside it (like make_pack.py)
    let spec = a.spec || null; const sf = path.join(dir, 'spec.json'); if (!spec && fs.existsSync(sf)) try { spec = rj(sf); } catch (e) { spec = null; }
    const entryPy = entry || path.join(dir, 'main.py'), py = fs.existsSync(entryPy) ? fs.readFileSync(entryPy, 'utf8') : '';
    return { ...a, python: py || null, sha256: py ? crypto.createHash('sha256').update(py).digest('hex') : null, bytes: Buffer.byteLength(py), spec, strings, _dir: dir };
  }
  if (a.runtime === 'h5p@1') {   // the package as the app gets it (inline here; the app reads it from beside the pack), its words per language
    const buf = entry && fs.existsSync(entry) ? fs.readFileSync(entry) : null, by = { ...(a.h5pByLocale || {}) };
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = f.match(/^(content|l10n)\.(.+)\.json$/); if (m) by[m[2]] = { ...(by[m[2]] || {}), [m[1]]: rj(path.join(dir, f)) }; }
    return { ...a, h5p: buf ? buf.toString('base64') : null, sha256: buf ? require('crypto').createHash('sha256').update(buf).digest('hex') : null, h5pByLocale: by, strings, _dir: dir, _missing: !buf };
  }
  return { ...a, html: text, strings, sha256: null, _dir: dir };
});
const items = allItems.filter(a => !onlyId || a.id === onlyId);
// activities/_parts/<name>.json: the parts a spec reuses ({use, with}, docs/INTERACTIVE.md §12.8), as make_pack.py carries them
const PARTSLIB = (() => { const d = path.join(SDIR, 'activities', '_parts'), r = {}; for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) if (/^[a-z0-9][a-z0-9-]{0,60}\.json$/.test(f)) try { r[f.slice(0, -5)] = rj(path.join(d, f)); } catch (e) { } return r; })();
const MODULES = Object.fromEntries(allItems.filter(a => a.runtime === 'wasm-module@1').map(a => [a.id, a]));   // what a wasm@1 spec names (model.module)
if (!items.length) { console.log('✗ no activity ' + (onlyId || '') + ' in activities.json'); process.exit(1); }
const exercises = {};
for (const d of ['chapters']) { const dd = path.join(SDIR, d); for (const f of fs.existsSync(dd) ? fs.readdirSync(dd) : []) if (f.endsWith('.json')) for (const e of rj(path.join(dd, f)).exercises || []) exercises[e.id] = e; }

const THEMES = {
  light: { tokens: { bg: '#fafaf7', bg2: '#f2f1ec', card: '#ffffff', ink: '#222', ink2: '#555', ink3: '#888', line: '#e3e1da', ok: '#2f8f5b', bad: '#c0483f', warn: '#b7791f', info: '#3b6ea8', c: '#4a6fa5', font: 'system-ui, sans-serif', mono: 'ui-monospace, monospace', r: '12px' }, scheme: 'light', reducedMotion: false, textScale: 1, dir: 'ltr' },
  dark: { tokens: { bg: '#16181c', bg2: '#1e2126', card: '#22262c', ink: '#e8e6e1', ink2: '#b9b6ae', ink3: '#8b8880', line: '#353a42', ok: '#5cc08a', bad: '#e2766d', warn: '#e0a84f', info: '#7fa8d8', c: '#8fb0e0', font: 'system-ui, sans-serif', mono: 'ui-monospace, monospace', r: '12px' }, scheme: 'dark', reducedMotion: false, textScale: 1, dir: 'ltr' },
};
const has = f => fs.existsSync(path.join(srcDir, f));
const pcPath = [path.join(srcDir, 'packcheck.js'), path.join(srcDir, '..', 'packcheck.js')].find(f => fs.existsSync(f));
// NoemaCore of an activity host (src/composition/harness.ts): the data contracts packcheck.js checks shapes with and the engine
// library (the expression language, every engine of sim-spec@1, the catalogue) — the skill's activity_host/noema-core.js, or the
// repository's build/harness.js (npm run build)
const corePath = [path.join(srcDir, 'noema-core.js'), path.join(srcDir, '..', '..', 'build', 'harness.js')].find(f => fs.existsSync(f));
const SIMOK = has('35_activity_sim.js') && !!corePath && !!pcPath;
const WASMOK = SIMOK && has('44_activity_wasm.js');   // wasm-module@1 and the engine wasm@1 (P6)
// py-module@1 (P4): the runner and its view, and the pinned Python files to serve (never fetched by the harness itself)
const PYSITE = [process.env.NOEMA_PYODIDE_SITE, path.join(HERE, '..', '..', '..', 'dist', 'site')].filter(Boolean).map(d => path.resolve(d)).find(d => fs.existsSync(path.join(d, 'vendor', 'pyodide', 'manifest.json')));
// the site's service worker (it keeps the Python files): the built site's /sw.js or the repository's build/sw.js (npm run build); served
// with an empty app shell, so here it handles only the Python files
const PYSW = [PYSITE && path.join(PYSITE, 'sw.js'), path.join(srcDir, '..', '..', 'build', 'sw.js')].find(f => f && fs.existsSync(f));
const pySw = () => 'self.NOEMA_SW = {"version":"harness","shell":[]};\n' + fs.readFileSync(PYSW, 'utf8').replace(/^self\.NOEMA_SW = .*;$/m, '');
const PYOK = SIMOK && has('37_activity_py.js') && has('37_activity_py_ui.js') && !!PYSITE && !!PYSW;
const NEEDHTTP = PYOK && items.some(a => a.runtime === 'py-module@1');
// h5p@1: the runtime and the app's own H5P player (skill zip: activity_host/h5p/player.js; repository: engine/vendor/h5p/<version>/player.js)
const playerPath = [path.join(srcDir, 'h5p', 'player.js'), path.join(srcDir, '..', 'vendor', 'h5p', '3.8.2', 'player.js')].find(f => fs.existsSync(f));
const H5POK = has('38_activity_h5p.js') && !!playerPath;
const OWN = (() => { try { return rj(path.join(SDIR, 'subject.json')).language || 'en'; } catch (e) { return 'en'; } })();
// the host words of sim-spec@1 (the app shows them in the learner's language; here English is enough)
const HOSTWORDS = { 'engine.act.sim.reset': 'Reset the values', 'engine.act.sim.noConverge': 'These values did not settle: the parts of the model kept changing each other, so some results are not shown. Try other settings.', 'engine.act.sim.partFailed': 'One part of this simulation could not compute its results for these settings.', 'engine.act.sim.computing': 'Computing…', 'engine.act.sim.results': 'Results', 'engine.act.sim.plot': 'Plot of {y} against {x}',
  'engine.act.bench.instrument': 'Instrument', 'engine.act.bench.inst.V': 'Multimeter: voltage', 'engine.act.bench.inst.I': 'Multimeter: current', 'engine.act.bench.inst.R': 'Multimeter: resistance',
  'engine.act.bench.inst.scope': 'Oscilloscope', 'engine.act.bench.inst.logic': 'Logic analyser', 'engine.act.bench.red': 'Red lead (+)', 'engine.act.bench.black': 'Black lead (−)', 'engine.act.bench.probe': 'Probe on',
  'engine.act.bench.part': 'Current through', 'engine.act.bench.measure': 'Measure', 'engine.act.bench.left': '{left} measurements left', 'engine.act.bench.log': 'Measurements', 'engine.act.bench.logEmpty': 'No measurements yet.',
  'engine.act.bench.scopeStats': '{pp} peak to peak, mean {mean}, frequency {freq}', 'engine.act.bench.logicStats': 'frequency {freq}, duty cycle {duty}', 'engine.act.bench.time': 'Time', 'engine.act.bench.voltage': 'Voltage',
  'engine.act.bench.level': 'Logic level (0 or 1)', 'engine.act.bench.diagnosis': 'Your diagnosis', 'engine.act.bench.choose': 'Choose the fault…', 'engine.act.bench.commit': 'Check my diagnosis',
  'engine.act.bench.right': 'Right: {fault}', 'engine.act.bench.wrong': 'Not this one. The fault was: {fault}', 'engine.act.bench.another': 'Another device', 'engine.act.bench.failed': 'this measurement could not be made',
  'engine.act.bench.inst.log': 'Event log', 'engine.act.bench.inst.rssi': 'Radio: signal strength (RSSI)', 'engine.act.bench.current': 'Current',
  'engine.act.bench.logStats': 'resets: {resets}, lost messages: {lost}, overrun wake-ups: {overruns}',
  "engine.common.sizeMB": "{size} MB", "engine.common.sizeKB": "{size} KB", "engine.common.sizeB": "{size} B", "engine.act.py.firstUse": "This activity runs Python: it downloads about {size} once, then works offline.", "engine.act.py.network": "The first time it also downloads {packages}, so it needs the internet.", "engine.act.py.download": "Download {size} and start", "engine.act.py.loading": "Getting Python ready… {done} of {total}", "engine.act.py.starting": "Starting Python…", "engine.act.py.stepError": "The activity's Python code stopped with an error ({code}).", "engine.act.py.noHere": "This activity runs Python, which works only on the website, not in a downloaded copy of the app. Here is what it shows.", "engine.act.py.offline": "Python is not on this device yet, and there is no connection. Connect once, or prepare Python ahead in Settings.", "engine.act.py.slow": "Python took too long to start." };
const HOST = `<!doctype html><meta charset="utf-8"><style>#box iframe{display:block;width:100%;height:100%;border:0}
${has('32_activities.css') ? rd('32_activities.css') : ''}
body{margin:0;font-family:var(--font,system-ui);background:var(--bg);color:var(--ink)}.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:4px 10px;font:inherit}</style><body><div id="box" class="act-box" style="position:relative;box-sizing:border-box;width:100%;height:360px"></div><script>
var RT = {}, EN = {}; var ACT = { ITEMS: {}, PARTS: ${inl(JSON.stringify(PARTSLIB))}, registerRuntime: function (d) { RT[d.id] = d; }, runtime: function (id) { return RT[id] || null; }, registerEngine: function (d) { EN[d.id] = d; }, engine: function (id) { return EN[id] || (window.NoemaCore && NoemaCore.engines.engine(id)) || null; }, engines: function () { return Object.keys(EN).concat(window.NoemaCore ? NoemaCore.engines.ids() : []); }, enabled: function (id) { return !!RT[id] && (!RT[id].available || RT[id].available()); } };
function nf(n) { return String(n); } function fmtBytes(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B'; } function tip(t) { return document.createTextNode(''); }
var WORDS = ${JSON.stringify(HOSTWORDS)};
function tE(k, v) { return String(WORDS[k] || k).replace(/\\{(\\w+)\\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }
function h(tag, attrs, ...kids) { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); } for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; }
${ACTP}
window.ACTP = ACTP;
</script>${corePath ? `<script>${inl(fs.readFileSync(corePath, 'utf8'))}</script>` : ''}<script>${rs('33_activity_guard.js')}</script><script>${rs('34_activity_html.js')}</script>${SIMOK ? `<script>${inl(fs.readFileSync(pcPath, 'utf8'))}</script><script>${rs('35_activity_sim.js')}</script>${WASMOK ? `<script>${rs('44_activity_wasm.js')}</script>` : ''}${PYOK ? `<script>${rs('37_activity_py.js')}</script><script>${rs('37_activity_py_ui.js')}</script>` : ''}` : ''}${H5POK ? `<script>${inl(fs.readFileSync(playerPath, 'utf8'))}</script><script>${rs('38_activity_h5p.js')}</script>` : ''}<script>
window.setTheme = function (t) { var r = document.documentElement; for (var k in t.tokens) r.style.setProperty('--' + k, t.tokens[k]); r.style.colorScheme = t.scheme; };
window.LOG = []; window.H = null;
/* every engine of the library loaded first (once: the app loads only those an activity needs) */
window.run = function (act, init, modules) {
  return (window.NoemaCore ? NoemaCore.engines.load(NoemaCore.engines.ids()) : Promise.resolve()).then(function () { mount(act, init, modules); });
};
function mount(act, init, modules) {
  if (modules) ACT.ITEMS = modules;
  var box = document.getElementById('box'); box.innerHTML = ''; window.LOG = [];
  if (window.H) try { window.H.close(); } catch (e) {}
  var rt = RT[act.runtime]; if (!rt) { LOG.push({ type: 'fail', why: 'runtime ' + act.runtime + ' is not in this toolkit' }); return; }
  box.style.height = rt.autoHeight ? '' : '360px';
  window.H = rt.mount(box, { act: act, init: init, title: 'activity ' + act.id,
    onMessage: function (raw) { var r = ACTP.check(raw); if (!r.ok) { LOG.push({ type: 'bad', why: r.why }); return; } LOG.push(r.msg);
      if (r.msg.type === 'resize') box.style.height = Math.max(160, Math.min(r.msg.payload.h, 2000)) + 'px';
      if (r.msg.type === 'hint:request') H.send('hint', { text: 'a hint' }, { re: r.msg.id }); },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); } });
};
</script>`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-act-')), hostFile = path.join(tmp, 'host.html');
  fs.writeFileSync(hostFile, HOST);
  // py-module@1 needs a secure http origin with the Python files under /vendor/ (the file:// host has no Python, as in the app)
  let base = 'file://' + hostFile, server = null;
  if (NEEDHTTP) {
    const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/zip', '.html': 'text/html; charset=utf-8', '.tar': 'application/x-tar' };
    server = http.createServer((q, r) => {
      const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      const send = (code, type, body, extra) => { r.writeHead(code, { 'content-type': type, ...(extra || {}) }); r.end(body); };
      if (u === '/host.html') return send(200, 'text/html; charset=utf-8', HOST);
      if (u === '/sw.js') return send(200, 'text/javascript', pySw(), { 'cache-control': 'no-cache' });
      if (u.startsWith('/vendor/') && !u.includes('..')) { const f = path.join(PYSITE, u); if (fs.existsSync(f) && fs.statSync(f).isFile()) return send(200, TYPES[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f), { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }); }
      send(404, 'text/plain', 'not found');
    });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}/host.html`;
  }
  const browser = await pw.chromium.launch({ args: ['--disable-features=IsolateSandboxedIframes'] });   // (Playwright reaches the item's frame nested in the wrapper)
  let fails = 0, passes = 0;
  const say = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (c) passes++; else fails++; return c; };
  const open = async (width = 800, theme = 'light') => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Unrecognized feature/.test(m.text())) errs.push(m.text()); });
    await p.goto(base); return { p, ctx, errs };
  };
  const start = async (p, a, o = {}) => {
    const init = { activityId: a.id, exerciseId: o.exerciseId || null, attemptId: 'test', seed: o.seed ?? 12345, task: o.task || {}, locale: o.locale, strings: a.strings[o.locale] || {},
      theme: THEMES[o.theme || 'light'], state: o.state || null, stateVersion: a.stateVersion || 1, capabilities: a.capabilities || [], limits: { msgBytes: 65536, stateBytes: 262144, eventsPerSec: 50 } };
    await p.evaluate(([act, init, th, mods]) => { window.setTheme(th); return window.run(act, init, mods); }, [a, init, THEMES[o.theme || 'light'], MODULES]);
    const t0 = Date.now(); while (Date.now() - t0 < 8000) { const L = await p.evaluate(() => window.LOG); if (L.some(m => m.type === 'ready' || m.type === 'fail')) break; await p.waitForTimeout(100); }
    if (a.runtime === 'py-module@1') await pyValues(p);   // Python loads (first use: the whole runtime) and computes the first outputs
    await p.waitForTimeout(o.settle ?? 400);
    const frame = a.runtime === 'sim-spec@1' || a.runtime === 'py-module@1' || a.runtime === 'wasm-module@1' ? p.mainFrame() : p.frames().find(f => f.parentFrame() && f.parentFrame() !== p.mainFrame());
    return { frame, log: await p.evaluate(() => window.LOG) };
  };
  const visible = f => f.evaluate(() => document.body.innerText);
  async function pyValues(p, ms = 120000) {   // until Python's outputs for the latest inputs are in (or it failed)
    const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await p.evaluate(() => ({ v: window.H && window.H.values ? window.H.values() : null, f: window.LOG.some(m => m.type === 'fail') })); if (v.v || v.f) return v.v; await p.waitForTimeout(100); }
    return null;
  }
  let skipped = 0;

  for (const a of items) {
    console.log(`\n— ${a.id} (${a.runtime})`);
    if (a.runtime === 'external-embed@1') { console.log('  (an outside page: not run here — it needs the network; check it with embed_check.py, and look at it in the app)'); continue; }
    if (a.runtime === 'wasm-module@1' && !a.spec) { console.log('  (a module without its own spec: it runs through the sim-spec@1 activities whose spec names it in model.module)'); continue; }
    const PY = a.runtime === 'py-module@1', WA = a.runtime === 'wasm-module@1', SIM = a.runtime === 'sim-spec@1' || PY || WA;
    const H5 = a.runtime === 'h5p@1';
    if (PY && !PYOK) { skipped++; console.log(`  (skipped: ${PYSITE ? 'the Python runner (activity_host/37_activity_py*.js) is missing from the toolkit' : 'the Python files are not here — set NOEMA_PYODIDE_SITE to a folder with vendor/pyodide/ (python3 tools/fetch_pyodide.py --site DIR)'})`); continue; }
    if (!(a.runtime === 'html-app@1' || (SIM && !WA && SIMOK) || (WA && WASMOK) || (H5 && H5POK))) { say(false, `runtime ${a.runtime}: this toolkit runs html-app@1${SIMOK ? ', sim-spec@1, py-module@1' : ''}${WASMOK ? ', wasm-module@1' : ''}${H5POK ? ', h5p@1' : ''} only for now`); continue; }
    if (H5 && a._missing) { say(false, `${a.entry || 'item.h5p'}: not found`); continue; }
    if (SIM && !a.spec) { say(false, `${PY || WA ? 'activities/' + a.id + '/spec.json' : a.entry || 'spec.json'}: not found or not JSON`); continue; }
    if (PY && !a.python) { say(false, `${a.entry || 'activities/' + a.id + '/main.py'}: not found`); continue; }
    if (WA && !a.wasm) { say(false, `${a.entry || 'module.wasm'}: not found`); continue; }
    const locs = H5 ? [...new Set([OWN, ...Object.keys(a.h5pByLocale || {})])] : Object.keys(a.strings);
    if (mode === 'preview') {
      const out = path.resolve(outArg || path.join(SDIR, 'build', 'preview', a.id)); fs.mkdirSync(out, { recursive: true });
      const loc = H5 ? OWN : a.strings.en ? 'en' : locs[0];
      for (const [name, width, theme] of [['light', 800, 'light'], ['dark', 800, 'dark'], ['phone-360', 360, 'light']]) {
        const { p, ctx, errs } = await open(width, theme); await start(p, a, { locale: loc, theme, settle: 800 });
        await p.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
        const over = await (SIM ? p.mainFrame() : p.frames().find(f => f.parentFrame() && f.parentFrame() !== p.mainFrame()))?.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1).catch(() => null);
        say(!errs.length, `${name}: ${path.join(out, name + '.png')}${errs.length ? '  errors: ' + errs.slice(0, 2).join(' | ') : ''}`);
        if (over) say(false, `${name}: the activity scrolls sideways (it must fit ${width} px)`);
        await ctx.close();
      }
      const fb = a.fallback || {}, mm = fs.existsSync(path.join(SDIR, 'media', 'media.json')) ? rj(path.join(SDIR, 'media', 'media.json')).items || [] : [];
      const pic = mm.find(m => m.id === fb.media), picFile = pic && pic.file ? path.join(SDIR, 'media', pic.file) : null;
      const { p, ctx } = await open(800, 'light');
      const src = picFile && fs.existsSync(picFile) ? 'data:' + (picFile.endsWith('.svg') ? 'image/svg+xml' : 'image/' + path.extname(picFile).slice(1).replace('jpg', 'jpeg')) + ';base64,' + fs.readFileSync(picFile).toString('base64') : '';
      await p.setContent(`<body style="font-family:system-ui;padding:12px;max-width:760px">${src ? `<img src="${src}" style="max-width:100%">` : '<p style="color:#c00">(no fallback picture)</p>'}<p>${String(fb.text || '(no fallback text)').replace(/</g, '&lt;')}</p></body>`);
      await p.screenshot({ path: path.join(out, 'fallback.png'), fullPage: true }); say(!!src && !!fb.text, `fallback: ${path.join(out, 'fallback.png')}`);
      await ctx.close();
      continue;
    }
    // test: every language
    for (const loc of locs) {
      const { p, ctx, errs } = await open(); const { frame, log } = await start(p, a, { locale: loc });
      const fail = log.find(m => m.type === 'fail'), bad = log.filter(m => m.type === 'bad' || m.type === 'error');
      say(log.some(m => m.type === 'ready') && !fail, `${loc}: it starts (hello → ready)${fail ? ' — ' + fail.why : ''}`);
      const txt = frame ? await visible(frame) : '';
      const raw = Object.keys(a.strings[loc] || {}).filter(k => /[A-Z._-]/.test(k) && new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(txt));
      say(!raw.length, `${loc}: no string key shows as text${raw.length ? ' (' + raw.slice(0, 4).join(', ') + ': a missing noema.t key?)' : ''}`);
      say(!bad.length && !errs.length, `${loc}: no errors${bad.length || errs.length ? ': ' + [...bad.map(b => b.why || b.payload?.code + ' ' + (b.payload?.message || '')), ...errs].slice(0, 3).join(' | ') : ''}`);
      await ctx.close();
    }
    // sandbox invariants (html-app@1: a frame; sim-spec@1 has none — no code of the pack runs)
    if (!SIM) { const { p, ctx } = await open(); await start(p, a, { locale: locs[0] });
      const fr = await p.$eval('#box iframe', f => ({ sandbox: f.getAttribute('sandbox'), csp: /http-equiv="Content-Security-Policy"/.test(f.srcdoc) }));
      say(fr.sandbox === 'allow-scripts' && fr.csp, 'sandbox allow-scripts and the CSP in place'); await ctx.close(); }
    // the cases
    const tf = path.join(a._dir, 'tests.json');
    const cases = fs.existsSync(tf) ? rj(tf).cases || [] : [];
    if (!cases.length) console.log('  (no tests.json: add cases with the right solution and tempting wrong ones — docs/INTERACTIVE_AUTHORING.md)');
    for (const c of cases) {
      const ex = c.exercise ? exercises[c.exercise] : null;
      if (c.exercise && !ex) { say(false, `case "${c.name}": exercise ${c.exercise} is not in chapters/`); continue; }
      const { p, ctx, errs } = await open();
      const { frame } = await start(p, a, { locale: c.locale || (H5 ? OWN : a.strings.en ? 'en' : locs[0]), exerciseId: c.exercise || null, task: { ...(ex?.task?.params || {}), ...(c.task || {}) }, seed: Number.isInteger(ex?.task?.seed) ? ex.task.seed : 12345 });
      try {
        for (const s of c.steps || []) {
          if (s.set && SIM) await p.evaluate(([id, v]) => { const e = document.querySelector(`#box [data-param="${id}"]`); if (!e) throw new Error('no param ' + id); if (e.type === 'checkbox') e.checked = !!v; else e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [s.set, s.value]);
          else if (s.set) await frame.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) throw new Error('no ' + sel); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [s.set, s.value]);
          else if (s.measure && SIM) {   // a bench: choose the instrument and where it goes, then Measure; wait for the reading
            const n0 = await p.evaluate(() => document.querySelectorAll('#box .sim-log li').length);
            const off = await p.evaluate(m => { const set = (k, v) => { if (v == null) return; const e = document.querySelector(`#box [data-bench="${k}"]`); if (!e) throw new Error('no bench control ' + k); e.value = String(v); if (e.value !== String(v)) throw new Error(`no ${k} ${v} on this bench`); e.dispatchEvent(new Event('change', { bubbles: true })); };
              set('instrument', m.instrument); set('a', m.a); set('b', m.b); set('part', m.part); const btn = document.querySelector('#box [data-bench="measure"]'); if (btn.disabled) return true; btn.click(); return false; }, s.measure);
            const t0 = Date.now(); while (!off && Date.now() - t0 < 8000) { const done = await p.evaluate(n => { const l = document.querySelectorAll('#box .sim-log li'); return l.length > n && !/…$/.test(l[l.length - 1].textContent); }, n0); if (done) break; await p.waitForTimeout(50); }
          } else if (s.diagnose != null && SIM) await p.evaluate(v => { const e = document.querySelector('#box [data-bench="diagnosis"]'); if (!e) throw new Error('this activity has no bench'); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); }, s.diagnose);
          else if (s.click) await frame.click(s.click);
          else if (s.waitFor) { const tw = Date.now(); while (!(SIM ? await p.$('#box ' + s.waitFor) : await frame.$(s.waitFor))) { if (Date.now() - tw > 8000) throw new Error('waitFor ' + s.waitFor + ': nothing matched in 8 s'); await p.waitForTimeout(100); } }
          if (s.wait) await p.waitForTimeout(s.wait);
        }
        await p.waitForTimeout(500);
        if (PY) await pyValues(p, 20000);
        const log = await p.evaluate(() => window.LOG), st = [...log].reverse().find(m => m.type === 'state');
        let res = [...log].reverse().find(m => m.type === 'result');
        const vals = SIM ? await p.evaluate(() => window.H && window.H.values ? window.H.values() : null) : null;
        if (SIM && ex && ex.grade && ex.grade.mode === 'checks') {   // the app's checks grader, on the values the runtime exposes
          res = await p.evaluate(([g, v]) => { let tot = 0, got = 0; for (const c of g.checks || []) { const w = c.weight > 0 ? c.weight : 1; let ok = false; try { const r = NoemaCore.engines.expr.evaluate(c.expr, v); ok = typeof r === 'boolean' ? r : (r !== 0 && r === r); } catch (e) { } tot += w; if (ok) got += w; } const share = tot ? got / tot : 0; return { payload: { passed: share >= (g.pass ?? 1) - 1e-9, score: share } }; }, [ex.grade, vals || {}]);
        }
        const why = [];
        if ('passed' in (c.expect || {}) && (res ? res.payload.passed : null) !== c.expect.passed) why.push(`passed: expected ${c.expect.passed}, got ${res ? res.payload.passed : 'no result'}`);
        for (const [k, want] of Object.entries(c.expect?.values || {})) { const v = vals ? vals[k] : undefined, okv = Array.isArray(want) ? (v >= want[0] && v <= want[1]) : v === want; if (!okv) why.push(`${k} = ${v}, expected ${JSON.stringify(want)}`); }
        const stData = st ? (SIM ? st.payload.data && st.payload.data.values : st.payload.data) : null;
        for (const [sel, part] of Object.entries(c.expect?.text || {})) { const t = await frame.evaluate(s => document.querySelector(s)?.textContent || '', sel); if (!t.includes(part)) why.push(`${sel}: "${t.slice(0, 60)}" has no "${part}"`); }
        for (const k of c.expect?.state || []) if (!stData || !(k in stData)) why.push(`state has no ${k}`);
        if (SIM && (c.expect?.readings || c.expect?.log != null)) {   // a bench: the numbers in the measurement log
          const L = await p.evaluate(() => [...document.querySelectorAll('#box .sim-log li b')].map(b => b.textContent));
          const val = t => { const m = String(t).replace(/\u2212/g, '-').match(/(-?[\d.,]+)\s*([pnµmkMG]?)/); if (!m) return NaN; return parseFloat(m[1].replace(',', '.')) * ({ p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1); };
          if (c.expect.log != null && L.length !== c.expect.log) why.push(`the log has ${L.length} measurements, expected ${c.expect.log}`);
          for (const [i, lo, hi] of c.expect.readings || []) { const v = L[i] === 'OL' ? Infinity : val(L[i]); if (!(v >= lo && v <= hi)) why.push(`measurement ${i + 1} reads ${L[i]}, expected ${lo}…${hi}`); }
        }
        if (errs.length) why.push('errors: ' + errs.slice(0, 2).join(' | '));
        say(!why.length, `case "${c.name}"${why.length ? ' — ' + why.join('; ') : ''}`);
      } catch (e) { say(false, `case "${c.name}": ${e.message.split('\n')[0]}`); }
      await ctx.close();
    }
  }
  await browser.close(); if (server) server.close();
  if (!fails && !passes && skipped) { console.log(`\n— nothing checked: ${skipped} Python activit${skipped > 1 ? 'ies' : 'y'} skipped (no Python files here)`); process.exit(2); }
  console.log(fails ? `\n✗ ${fails} problem(s), ${passes} fine` : `\n✓ all ${passes} checks fine${skipped ? ` (${skipped} Python activit${skipped > 1 ? 'ies' : 'y'} skipped)` : ''}`);
  process.exit(fails ? 1 : 0);
})();
