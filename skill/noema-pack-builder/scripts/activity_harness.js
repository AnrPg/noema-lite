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
   Called by activity_test.py and activity_preview.py. Needs Playwright with Chromium (npm i playwright; npx playwright install chromium). */
const fs = require('fs'), path = require('path'), os = require('os');
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
  return { ...a, html: text, strings, sha256: null, _dir: dir };
});
const items = allItems.filter(a => !onlyId || a.id === onlyId);
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
const SIMOK = has('35_activity_sim.js') && has('35_simexpr.js') && !!pcPath;
const CIRCUIT = has('36_engine_circuit.js') && has('36_engine_circuit_sim.js');   // the circuit engine circuit-mna@1 (P3)
const P6 = ['39_engine_thermal.js', '40_engine_pid.js', '41_engine_rf.js', '42_engine_twin.js', '43_engines_p6.js'].filter(has);   // thermal@1, pid@1, rf@1, twin@1 (P6)
const WASMOK = SIMOK && has('44_activity_wasm.js');   // wasm-module@1 and the engine wasm@1 (P6)
// the host words of sim-spec@1 (the app shows them in the learner's language; here English is enough)
const HOSTWORDS = { 'engine.act.sim.reset': 'Reset the values', 'engine.act.sim.computing': 'Computing…', 'engine.act.sim.results': 'Results', 'engine.act.sim.plot': 'Plot of {y} against {x}',
  'engine.act.bench.instrument': 'Instrument', 'engine.act.bench.inst.V': 'Multimeter: voltage', 'engine.act.bench.inst.I': 'Multimeter: current', 'engine.act.bench.inst.R': 'Multimeter: resistance',
  'engine.act.bench.inst.scope': 'Oscilloscope', 'engine.act.bench.inst.logic': 'Logic analyser', 'engine.act.bench.red': 'Red lead (+)', 'engine.act.bench.black': 'Black lead (−)', 'engine.act.bench.probe': 'Probe on',
  'engine.act.bench.part': 'Current through', 'engine.act.bench.measure': 'Measure', 'engine.act.bench.left': '{left} measurements left', 'engine.act.bench.log': 'Measurements', 'engine.act.bench.logEmpty': 'No measurements yet.',
  'engine.act.bench.scopeStats': '{pp} peak to peak, mean {mean}, frequency {freq}', 'engine.act.bench.logicStats': 'frequency {freq}, duty cycle {duty}', 'engine.act.bench.time': 'Time', 'engine.act.bench.voltage': 'Voltage',
  'engine.act.bench.level': 'Logic level (0 or 1)', 'engine.act.bench.diagnosis': 'Your diagnosis', 'engine.act.bench.choose': 'Choose the fault…', 'engine.act.bench.commit': 'Check my diagnosis',
  'engine.act.bench.right': 'Right: {fault}', 'engine.act.bench.wrong': 'Not this one. The fault was: {fault}', 'engine.act.bench.another': 'Another device', 'engine.act.bench.failed': 'this measurement could not be made',
  'engine.act.bench.inst.log': 'Event log', 'engine.act.bench.inst.rssi': 'Radio: signal strength (RSSI)', 'engine.act.bench.current': 'Current',
  'engine.act.bench.logStats': 'resets: {resets}, lost messages: {lost}, overrun wake-ups: {overruns}' };
const HOST = `<!doctype html><meta charset="utf-8"><style>#box iframe{display:block;width:100%;height:100%;border:0}
${has('32_activities.css') ? rd('32_activities.css') : ''}
body{margin:0;font-family:var(--font,system-ui);background:var(--bg);color:var(--ink)}.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:4px 10px;font:inherit}</style><body><div id="box" class="act-box" style="position:relative;box-sizing:border-box;width:100%;height:360px"></div><script>
var RT = {}, EN = {}; var ACT = { ITEMS: {}, registerRuntime: function (d) { RT[d.id] = d; }, runtime: function (id) { return RT[id] || null; }, registerEngine: function (d) { EN[d.id] = d; }, engine: function (id) { return EN[id] || null; }, engines: function () { return Object.keys(EN); } };
var WORDS = ${JSON.stringify(HOSTWORDS)};
function tE(k, v) { return String(WORDS[k] || k).replace(/\\{(\\w+)\\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }
function h(tag, attrs, ...kids) { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); } for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; }
${ACTP}
window.ACTP = ACTP;
</script><script>${rd('33_activity_guard.js')}</script><script>${rd('34_activity_html.js')}</script>${SIMOK ? `<script>${rd('35_simexpr.js')}</script><script>${fs.readFileSync(pcPath, 'utf8')}</script><script>${rd('35_activity_sim.js')}</script>${CIRCUIT ? `<script>${rd('36_engine_circuit.js')}</script><script>${rd('36_engine_circuit_sim.js')}</script>` : ''}${P6.map(f => `<script>${rd(f)}</script>`).join('')}${WASMOK ? `<script>${rd('44_activity_wasm.js')}</script>` : ''}` : ''}<script>
window.setTheme = function (t) { var r = document.documentElement; for (var k in t.tokens) r.style.setProperty('--' + k, t.tokens[k]); r.style.colorScheme = t.scheme; };
window.LOG = []; window.H = null;
window.run = function (act, init, modules) {
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
  const browser = await pw.chromium.launch();
  let fails = 0, passes = 0;
  const say = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (c) passes++; else fails++; return c; };
  const open = async (width = 800, theme = 'light') => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Unrecognized feature/.test(m.text())) errs.push(m.text()); });
    await p.goto('file://' + hostFile); return { p, ctx, errs };
  };
  const start = async (p, a, o = {}) => {
    const init = { activityId: a.id, exerciseId: o.exerciseId || null, attemptId: 'test', seed: o.seed ?? 12345, task: o.task || {}, locale: o.locale, strings: a.strings[o.locale] || {},
      theme: THEMES[o.theme || 'light'], state: o.state || null, stateVersion: a.stateVersion || 1, capabilities: a.capabilities || [], limits: { msgBytes: 65536, stateBytes: 262144, eventsPerSec: 50 } };
    await p.evaluate(([act, init, th, mods]) => { window.setTheme(th); window.run(act, init, mods); }, [a, init, THEMES[o.theme || 'light'], MODULES]);
    const t0 = Date.now(); while (Date.now() - t0 < 8000) { const L = await p.evaluate(() => window.LOG); if (L.some(m => m.type === 'ready' || m.type === 'fail')) break; await p.waitForTimeout(100); }
    await p.waitForTimeout(o.settle ?? 400);
    const frame = a.runtime === 'sim-spec@1' || a.runtime === 'wasm-module@1' ? p.mainFrame() : p.frames().find(f => f.parentFrame() && f.parentFrame() !== p.mainFrame());
    return { frame, log: await p.evaluate(() => window.LOG) };
  };
  const visible = f => f.evaluate(() => document.body.innerText);

  for (const a of items) {
    console.log(`\n— ${a.id} (${a.runtime})`);
    if (a.runtime === 'external-embed@1') { console.log('  (an outside page: not run here — it needs the network; check it with embed_check.py, and look at it in the app)'); continue; }
    if (a.runtime === 'wasm-module@1' && !a.spec) { console.log('  (a module without its own spec: it runs through the sim-spec@1 activities whose spec names it in model.module)'); continue; }
    const SIM = a.runtime === 'sim-spec@1' || a.runtime === 'wasm-module@1';
    if (!(a.runtime === 'html-app@1' || (a.runtime === 'sim-spec@1' && SIMOK) || (a.runtime === 'wasm-module@1' && WASMOK))) { say(false, `runtime ${a.runtime}: this toolkit runs html-app@1${SIMOK ? ', sim-spec@1' : ''}${WASMOK ? ', wasm-module@1' : ''} only for now`); continue; }
    if (SIM && !a.spec) { say(false, `${a.runtime === 'wasm-module@1' ? 'activities/' + a.id + '/spec.json' : a.entry || 'spec.json'}: not found or not JSON`); continue; }
    if (a.runtime === 'wasm-module@1' && !a.wasm) { say(false, `${a.entry || 'module.wasm'}: not found`); continue; }
    const locs = Object.keys(a.strings);
    if (mode === 'preview') {
      const out = path.resolve(outArg || path.join(SDIR, 'build', 'preview', a.id)); fs.mkdirSync(out, { recursive: true });
      const loc = a.strings.en ? 'en' : locs[0];
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
      const { frame } = await start(p, a, { locale: c.locale || (a.strings.en ? 'en' : locs[0]), exerciseId: c.exercise || null, task: { ...(ex?.task?.params || {}), ...(c.task || {}) }, seed: Number.isInteger(ex?.task?.seed) ? ex.task.seed : 12345 });
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
          if (s.wait) await p.waitForTimeout(s.wait);
        }
        await p.waitForTimeout(500);
        const log = await p.evaluate(() => window.LOG), st = [...log].reverse().find(m => m.type === 'state');
        let res = [...log].reverse().find(m => m.type === 'result');
        const vals = SIM ? await p.evaluate(() => window.H && window.H.values ? window.H.values() : null) : null;
        if (SIM && ex && ex.grade && ex.grade.mode === 'checks') {   // the app's checks grader, on the values the runtime exposes
          res = await p.evaluate(([g, v]) => { let tot = 0, got = 0; for (const c of g.checks || []) { const w = c.weight > 0 ? c.weight : 1; let ok = false; try { const r = NoemaExpr.evaluate(c.expr, v); ok = typeof r === 'boolean' ? r : (r !== 0 && r === r); } catch (e) { } tot += w; if (ok) got += w; } const share = tot ? got / tot : 0; return { payload: { passed: share >= (g.pass ?? 1) - 1e-9, score: share } }; }, [ex.grade, vals || {}]);
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
  await browser.close();
  console.log(fails ? `\n✗ ${fails} problem(s), ${passes} fine` : `\n✓ all ${passes} checks fine`);
  process.exit(fails ? 1 : 0);
})();
