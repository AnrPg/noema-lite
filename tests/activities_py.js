/* py-module@1 (src/runtimes/py-module: runner.ts, the service worker src/composition/sw.ts → build/sw.js, tools/fetch_pyodide.py) in real browsers.
     node tests/activities_py.js [chromium] [firefox] [webkit]        (default: all three, one after the other)
   Needs Playwright and network to cdn.jsdelivr.net + files.pythonhosted.org the first time (tools/fetch_pyodide.py; the downloads are kept
   in $NOEMA_PYODIDE_CACHE or ~/.cache/noema-pyodide). Firefox/WebKit: PLAYWRIGHT_BROWSERS_PATH=<dir with them>; a browser that is not
   installed is skipped with a notice. What it checks, per browser:
     A numpy: hello → ready, step() numbers (a first-order low-pass), init(), t(), state/event/result/announce pass ACTP.check,
       numpy only → 0 requests for scipy/openblas files, `import scipy` fails
     B scipy (declared) loads lazily, step() numbers (2nd-order Butterworth)
     C `while True: pass` in step → error runaway within the budget, py:restart → works again
     D no way out: fetch / XHR / open_url / pyfetch / importScripts / WebSocket / EventSource / Worker / loadPackage / blob script from
       Python → 0 requests at the test server and at a second ("outside") server
     E extras: allow-listed wheels through micropip (our index only); a package not on the list, a wheel whose sha256 does not match,
       extras without requiresNetwork → refused; micropip.install('six') at run time fails without a request
     F offline: after first use, and after prepareOffline() in a fresh profile: a second page with /vendor blocked (server 503 + route
       abort) still runs numpy (and scipy) activities; status() says what is cached
     G (chromium) without a service worker: the page's own cache, same checks */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process'), crypto = require('crypto');
let pw; try { pw = require(process.env.PW || 'playwright'); } catch (e) { console.log('SKIP: Playwright is not installed'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..');
const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const BROWSERS = want.length ? want : ['chromium', 'firefox', 'webkit'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* ---------- the site: pinned Pyodide + two test wheels of our own ---------- */
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-py-site-'));
try { cp.execFileSync('python3', [path.join(ROOT, 'tools', 'fetch_pyodide.py'), '--site', SITE], { stdio: 'inherit' }); }
catch (e) { console.log('SKIP: tools/fetch_pyodide.py could not fetch Pyodide (network?)'); process.exit(0); }
const WHEELS = path.join(SITE, 'vendor', 'pywheels');
cp.execFileSync('python3', ['-I', '-c', `
import zipfile, hashlib, base64, sys
def wheel(path, name, ver, body):
    di = f'{name}-{ver}.dist-info'
    files = {f'{name}/__init__.py': body, f'{di}/METADATA': f'Metadata-Version: 2.1\\nName: {name}\\nVersion: {ver}\\n',
             f'{di}/WHEEL': 'Wheel-Version: 1.0\\nGenerator: noema-test\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n', f'{di}/top_level.txt': name + '\\n'}
    h = lambda v: base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b'=').decode()
    files[f'{di}/RECORD'] = ''.join(f'{k},sha256={h(v)},{len(v.encode())}\\n' for k, v in files.items()) + f'{di}/RECORD,,\\n'
    with zipfile.ZipFile(path, 'w') as z:
        for k, v in files.items(): z.writestr(k, v)
wheel(sys.argv[1] + '/noema_testpkg-0.1-py3-none-any.whl', 'noema_testpkg', '0.1', 'VALUE = 42\\n')
wheel(sys.argv[1] + '/noema_badpkg-0.1-py3-none-any.whl', 'noema_badpkg', '0.1', 'VALUE = 666\\n')
`, WHEELS]);
const MAN_PATH = path.join(SITE, 'vendor', 'pyodide', 'manifest.json');
const MAN = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const tw = fs.readFileSync(path.join(WHEELS, 'noema_testpkg-0.1-py3-none-any.whl')), bw = fs.readFileSync(path.join(WHEELS, 'noema_badpkg-0.1-py3-none-any.whl'));
MAN.wheels.noema_testpkg = { file: 'noema_testpkg-0.1-py3-none-any.whl', sha256: sha(tw), bytes: tw.length, license: 'test' };
MAN.wheels.noema_badpkg = { file: 'noema_badpkg-0.1-py3-none-any.whl', sha256: sha(tw), bytes: bw.length, license: 'test' };   // the pin does not match the file
fs.writeFileSync(MAN_PATH, JSON.stringify(MAN, null, 1));

/* ---------- the host page: the runtime alone, like skill/noema-pack-builder/scripts/activity_harness.js ---------- */
const s32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
const ACTP_SRC = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));
const HOST = `<!doctype html><meta charset="utf-8"><title>py host</title><body><div id="box" style="position:relative;height:120px"></div>
<script>window.NOEMA_CONFIG = { py: location.search.indexOf('nosw') >= 0 ? { sw: false } : {} };
var RT = null;
${ACTP_SRC}
window.ACTP = ACTP;</script>
<script>${fs.readFileSync(path.join(ROOT, 'build', 'runtimes.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>
<script>/* the runtime's Python service alone (build/runtimes.js: py-module@1, module.service(host)); RT: its runner, where Python can run */
window.READY = __noemaRuntimesPiece.plugins.find(function (p) { return p.manifest.id === 'py-module@1'; }).entry().then(function (m) {
  window.NoemaPy = m.service({ config: function (k) { return (window.NOEMA_CONFIG || {})[k]; }, message: ACTP.out, warn: function () { console.warn.apply(console, arguments); } });
  if (NoemaPy.available()) RT = { id: 'py-module@1', mount: NoemaPy.mountRunner };
});</script>
<script>
window.LOG = []; window.PY = []; window.H = null;
window.run = function (act, over) {
  if (window.H) try { window.H.close(); } catch (e) {}
  window.LOG = []; window.PY = []; window.T0 = performance.now();
  var init = Object.assign({ activityId: act.id, exerciseId: null, attemptId: 't1', seed: 7, task: { f0: 1000 }, locale: 'en', strings: { hello: 'Hello {name}' },
    theme: {}, state: null, stateVersion: 1, capabilities: ['state', 'events', 'result', 'announce'], limits: {} }, over || {});
  window.H = RT.mount(document.getElementById('box'), { act: act, init: init, title: 'py ' + act.id,
    onMessage: function (raw) { var r = ACTP.check(raw); LOG.push({ type: raw && raw.type, ok: r.ok, ignore: !!r.ignore, why: r.why || null, payload: raw && raw.payload }); },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); },
    onPy: function (m) { PY.push({ type: m.type, payload: m.payload, t: Math.round(performance.now() - window.T0) }); } });
  return !!window.H;
};
window.step = function (inputs) { var t = performance.now(); return window.H.step(inputs).then(function (r) { r.wall = Math.round(performance.now() - t); return r; }); };
</script>`;

/* ---------- the server: counts every request; /vendor can be blocked ---------- */
let BLOCK = false; const HITS = [], BLOCKED = [], BEACONS = [];
const send = (r, code, type, body, hdrs = {}) => { r.writeHead(code, { 'content-type': type, ...hdrs }); r.end(body); };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/beacon')) { BEACONS.push('main ' + q.url); return send(r, 200, 'text/plain', 'x', { 'access-control-allow-origin': '*' }); }
  if (u === '/host.html') return send(r, 200, 'text/html; charset=utf-8', HOST, { 'cache-control': 'no-store' });
  if (u === '/sw.js') return send(r, 200, 'text/javascript', 'self.NOEMA_SW = {"version":"test","shell":[]};\n' + fs.readFileSync(path.join(ROOT, 'build', 'sw.js'), 'utf8'), { 'cache-control': 'no-cache' });   // the site's one service worker, with no app shell: only the Python files
  if (u.startsWith('/vendor/')) {
    if (BLOCK) { BLOCKED.push(u); return send(r, 503, 'text/plain', 'blocked'); }
    HITS.push(u);
    const f = path.resolve(SITE, '.' + path.posix.normalize(u));
    if (!f.startsWith(SITE + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(r, 404, 'text/plain', 'no');
    return send(r, 200, f.endsWith('.json') ? 'application/json' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', fs.readFileSync(f),
      { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': u.includes('/0.27.7/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  }
  send(r, 404, 'text/plain', 'no');
});
server.on('upgrade', (q, s) => { BEACONS.push('main WS ' + q.url); s.destroy(); });
const outside = http.createServer((q, r) => { BEACONS.push('outside ' + q.url); r.writeHead(200, { 'access-control-allow-origin': '*' }); r.end('x'); });
outside.on('upgrade', (q, s) => { BEACONS.push('outside WS ' + q.url); s.destroy(); });

/* ---------- the activities ---------- */
const BODE = `
import numpy as np
import noema
def init(task, seed):
    return {'f0': task.get('f0'), 'hello': noema.t('hello', {'name': 'Ada'}), 'seed': seed}
def step(inputs, state):
    if inputs.get('try_scipy'):
        try:
            import scipy
            return {'scipy': 'available'}
        except ImportError:
            return {'scipy': 'missing'}
    f0 = float(inputs.get('f0', 1000))
    w = np.logspace(0, 6, 5)
    H = 1 / (1 + 1j * w / f0)
    state['n'] = state.get('n', 0) + 1
    noema.save_state()
    noema.event('probe:step', {'n': state['n']})
    if inputs.get('grade'):
        noema.result(0.75, True, 'cutoff found')
        noema.announce('Cutoff at ' + str(f0))
    return {'mag_db': np.round(20 * np.log10(np.abs(H)), 3), 'n': state['n'], 'cplx': H[2], 'nan': float('nan')}
`;
const BUTTER = `
import numpy as np
from scipy import signal
def step(inputs, state):
    b, a = signal.butter(int(inputs.get('order', 2)), float(inputs.get('wc', 1000)), analog=True)
    w, h = signal.freqs(b, a, worN=[100.0, 1000.0, 10000.0])
    return {'db': np.round(20 * np.log10(np.abs(h)), 2)}
`;
const SPIN = `
def step(inputs, state):
    if inputs.get('spin'):
        while True:
            pass
    return {'ok': 1}
`;
const PROBE = `
import js, asyncio, json
from pyodide.ffi import create_proxy, to_js
R = {}
def rec(name, p):
    R[name] = 'pending'
    p.then(create_proxy(lambda v: R.__setitem__(name, 'REACHED')), create_proxy(lambda e: R.__setitem__(name, 'blocked: ' + str(e)[:100])))
def tryit(name, f):
    try:
        v = f()
        if v is not None and hasattr(v, 'then'): rec(name, v)
        elif name not in R: R[name] = 'no error'
    except BaseException as e:
        R[name] = 'blocked: ' + type(e).__name__ + ' ' + str(e)[:80]
def on_events(name, o):
    R[name] = 'pending'
    o.onload = o.onopen = create_proxy(lambda e: R.__setitem__(name, 'REACHED'))
    o.onerror = create_proxy(lambda e: R.__setitem__(name, 'blocked: error event'))
    return None
def step(inputs, state):
    u, u2 = inputs['url'], inputs['url2']
    if inputs.get('phase') != 'go':
        try:
            import evil
            R['loadPackage'] = 'REACHED: evil was installed'
        except ImportError:
            R['loadPackage'] = 'blocked: nothing installed (its promise resolves: loadPackage only logs errors)'
        return {'R': dict(R), 'origin': str(js.self.origin)}
    proto = js.WorkerGlobalScope.prototype
    tryit('fetch', lambda: js.fetch(u2))
    tryit('fetch_real', lambda: proto.fetch.call(js.self, u))
    tryit('fetch_real_outside', lambda: proto.fetch.call(js.self, u2))
    def xs():
        x = js.XMLHttpRequest.new(); x.open('GET', u, False); x.send()
    tryit('xhr_sync', xs)
    def xa():
        x = js.XMLHttpRequest.new(); x.open('GET', u2, True); on_events('xhr_async', x); x.send()
    tryit('xhr_async', xa)
    def ou():
        from pyodide.http import open_url
        return open_url(u2)
    tryit('open_url', ou)
    def pf():
        from pyodide.http import pyfetch
        f = asyncio.ensure_future(pyfetch(u2)); R['pyfetch'] = 'pending'
        def done(t):
            try: t.result(); R['pyfetch'] = 'REACHED'
            except BaseException as e: R['pyfetch'] = 'blocked: ' + type(e).__name__
        f.add_done_callback(done)
    tryit('pyfetch', pf)
    def ul():
        import urllib.request
        return urllib.request.urlopen(u2)
    tryit('urllib', ul)
    tryit('importScripts', lambda: js.importScripts(u2))
    tryit('importScripts_real', lambda: proto.importScripts.call(js.self, u2))
    tryit('websocket', lambda: on_events('websocket', js.WebSocket.new(inputs['ws'])))
    tryit('eventsource', lambda: on_events('eventsource', js.EventSource.new(u2)))
    tryit('worker', lambda: on_events('worker', js.Worker.new(u2)))
    tryit('eval', lambda: js.eval('1+1'))
    tryit('Function', lambda: js.Function.new('return import("' + u2 + '")')())
    def lp():
        import pyodide_js
        return pyodide_js.loadPackage(u2 + '/evil-1.0-py3-none-any.whl')
    tryit('loadPackage', lp)
    def blob():
        src = "self.__r='ran';WorkerGlobalScope.prototype.fetch.call(self,'" + u2 + "').then(function(){self.__r='REACHED'},function(e){self.__r='blocked: '+e})"
        b = js.Blob.new(to_js([src]), to_js({'type': 'text/javascript'}, dict_converter=js.Object.fromEntries))
        proto.importScripts.call(js.self, js.URL.createObjectURL(b))
        R['blob_script_ran'] = str(js.self.__r)
    tryit('blob_script', blob)
    tryit('indexedDB', lambda: js.indexedDB.open('x'))
    def ck():
        # WebKit gives an opaque-origin worker a CacheStorage of its own: it must not be the app's (noema-py-v1 is the app's cache)
        def got(keys):
            names = list(keys.to_py()) if hasattr(keys, 'to_py') else list(keys)
            R['caches'] = ('REACHED the app cache ' if 'noema-py-v1' in names else 'own empty storage: ') + json.dumps(names)
        R['caches'] = 'pending'
        js.caches.keys().then(create_proxy(got), create_proxy(lambda e: R.__setitem__('caches', 'blocked: ' + str(e)[:80])))
    tryit('caches', ck)
    return {'started': True}
`;
const EXTRA = `
import asyncio
import noema_testpkg, quantiphy
R = {}
def step(inputs, state):
    if inputs.get('install'):
        import micropip
        f = asyncio.ensure_future(micropip.install('six'))
        R['six'] = 'pending'
        def done(t):
            try: t.result(); R['six'] = 'INSTALLED'
            except BaseException as e: R['six'] = 'refused: ' + type(e).__name__ + ' ' + str(e)[:100]
        f.add_done_callback(done)
    return {'value': noema_testpkg.VALUE, 'q': str(quantiphy.Quantity(4700, 'Ω')), 'R': dict(R)}
`;

/* ---------- the run ---------- */
const results = {};
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); await new Promise(r => outside.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port, OUT = 'http://127.0.0.1:' + outside.address().port;
  let totalFails = 0;
  for (const name of BROWSERS) {
    let browser;
    try { browser = await pw[name].launch(name === 'chromium' ? { channel: 'chromium' } : {}); }
    catch (e) { console.log(`\n— ${name}: SKIP (not installed here: ${String(e.message).split('\n')[0].slice(0, 120)})`); results[name] = 'skipped'; continue; }
    const R = results[name] = { checks: {}, timings: {} };
    let fails = 0;
    const ok = (c, m) => { R.checks[m] = !!c; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; return c; };
    console.log(`\n— ${name} ${browser.version()}`);
    const page = async (ctx, q = '') => { const p = await ctx.newPage(); p.on('pageerror', e => console.log('    [pageerror]', e.message)); await p.goto(ORIGIN + '/host.html' + q); await p.evaluate(() => window.READY); return p; };
    const waitPy = async (p, ms = 120000) => {   // → 'ready' | 'fail:<why>' | 'timeout'
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const s = await p.evaluate(() => { const f = LOG.find(m => m.type === 'fail'); if (f) return 'fail:' + f.why; return PY.some(m => m.type === 'py:status' && m.payload.phase === 'ready') ? 'ready' : null; });
        if (s) return s; await sleep(100);
      }
      return 'timeout';
    };
    const readyMs = p => p.evaluate(() => { const m = PY.find(m => m.type === 'py:status' && m.payload.phase === 'ready'); return m ? { wall: m.t, timing: m.payload.timing } : null; });
    const close = c => (c && Math.abs(c[0] - c[1]) <= (c[2] || 0.011));
    const scipyHits = () => HITS.filter(u => /scipy|openblas/.test(u)).length;
    try {
      const ctx = await browser.newContext();
      const p = await page(ctx);
      ok(await p.evaluate(() => !!window.RT && window.NoemaPy.available()), 'the runtime registers on an http(s) page (py-module@1)');

      // A numpy
      HITS.length = 0;
      await p.evaluate(a => run(a), { id: 'bode', runtime: 'py-module@1', python: BODE, packages: ['numpy'] });
      let st = await waitPy(p);
      ok(st === 'ready', 'A numpy activity: hello → ready → Python ready (' + st + ')');
      R.timings.firstStart = await readyMs(p);
      const ready = await p.evaluate(() => LOG.find(m => m.type === 'ready'));
      ok(ready && ready.ok, 'A ready passes ACTP.check');
      const initOut = await p.evaluate(() => (PY.find(m => m.type === 'py:out' && m.payload.init) || {}).payload);
      ok(initOut && initOut.outputs.f0 === 1000 && initOut.outputs.hello === 'Hello Ada' && initOut.outputs.seed === 7, 'A init(task, seed) and noema.t() → ' + JSON.stringify(initOut && initOut.outputs));
      let r = await p.evaluate(() => step({ f0: 1000, grade: true }));
      const exp = [0, -0.004, -3.01, -30.0, -60.0];
      ok(r.outputs && r.outputs.mag_db.every((v, i) => Math.abs(v - exp[i]) <= 0.011), 'A step() numbers: |H| in dB = ' + JSON.stringify(r.outputs && r.outputs.mag_db) + ` (${r.wall} ms)`);
      ok(r.outputs && close([r.outputs.cplx.re, 0.5]) && close([r.outputs.cplx.im, -0.5]) && r.outputs.nan === null, 'A numpy complex → {re, im}, NaN → null');
      R.timings.step = r.wall;
      await sleep(200);
      const L = await p.evaluate(() => LOG.filter(m => ['state', 'event', 'result', 'a11y:announce'].includes(m.type)));
      ok(['state', 'event', 'result', 'a11y:announce'].every(t => L.some(m => m.type === t && m.ok)) && L.every(m => m.ok), 'A state/event/result/announce from Python all pass ACTP.check (' + L.map(m => m.type + (m.ok ? '' : '✗' + m.why)).join(', ') + ')');
      const res = L.find(m => m.type === 'result');
      ok(res && res.payload.score === 0.75 && res.payload.passed === true && res.payload.detail === 'cutoff found', 'A result(score, passed, detail) arrives as sent');
      r = await p.evaluate(() => step({ f0: 1000 }));
      ok(r.outputs && r.outputs.n === 2, 'A the state dict lives between steps (n = ' + (r.outputs && r.outputs.n) + ')');
      r = await p.evaluate(() => step({ try_scipy: true }));
      ok(r.outputs && r.outputs.scipy === 'missing', 'A numpy only: `import scipy` fails (' + JSON.stringify(r.outputs) + ')');
      ok(scipyHits() === 0, 'A numpy only: 0 requests for scipy/openblas (' + HITS.length + ' requests in all)');
      const viaA = (await p.evaluate(() => NoemaPy.status())).via;
      ok(viaA === 'sw', 'A the files came through the service worker (via ' + viaA + ')');
      // the restart keeps the last saved state
      await p.evaluate(() => { PY.length = 0; H.restart(); });
      st = await waitPy(p);
      r = await p.evaluate(() => step({ f0: 1000 }));
      ok(st === 'ready' && r.outputs && r.outputs.n === 3, 'A py:restart: a new worker, the saved state comes back (n = ' + (r.outputs && r.outputs.n) + ')');
      R.timings.restartCached = await readyMs(p);

      // B scipy, lazily
      const before = scipyHits();
      await p.evaluate(a => run(a), { id: 'butter', runtime: 'py-module@1', python: BUTTER, packages: ['numpy', 'scipy'] });
      st = await waitPy(p);
      R.timings.scipyStart = await readyMs(p);
      r = st === 'ready' ? await p.evaluate(() => step({ order: 2, wc: 1000 })) : {};
      ok(r.outputs && close([r.outputs.db[0], 0, 0.01]) && close([r.outputs.db[1], -3.01, 0.01]) && close([r.outputs.db[2], -40, 0.01]), 'B scipy.signal.butter + freqs: ' + JSON.stringify(r.outputs || st));
      ok(before === 0 && scipyHits() >= 2, `B scipy files are fetched only now (${before} before, ${scipyHits()} after)`);

      // C runaway
      await p.evaluate(a => run(a), { id: 'spin', runtime: 'py-module@1', python: SPIN, packages: [] });
      st = await waitPy(p);
      r = await p.evaluate(() => step({ spin: true }));
      const rl = await p.evaluate(() => LOG.find(m => m.type === 'error'));
      ok(r.error && r.error.code === 'runaway' && r.wall < 4500 && rl && rl.ok && rl.payload.code === 'runaway', `C while True: pass → runaway after ${r.wall} ms (budget 3000), error passes ACTP.check`);
      R.timings.runaway = r.wall;
      await p.evaluate(() => { PY.length = 0; H.restart(); });
      st = await waitPy(p);
      r = st === 'ready' ? await p.evaluate(() => step({ spin: false })) : {};
      ok(r.outputs && r.outputs.ok === 1, 'C Restart → works again (' + st + ')');

      // D no way out
      BEACONS.length = 0;
      await p.evaluate(a => run(a), { id: 'probe', runtime: 'py-module@1', python: PROBE, packages: [] });
      st = await waitPy(p);
      const inp = { url: ORIGIN + '/beacon?py', url2: OUT + '/beacon?py', ws: OUT.replace('http', 'ws') + '/ws' };
      r = await p.evaluate(i => step(Object.assign({ phase: 'go' }, i)), inp);
      await sleep(2500);
      r = await p.evaluate(i => step(i), inp);
      const probe = r.outputs || {};
      const reached = Object.entries(probe.R || {}).filter(([k, v]) => /REACHED|no error/.test(v) && k !== 'blob_script' && !(k === 'caches' && /^own empty storage: \[\]$/.test(v)));
      console.log('    probes:', JSON.stringify(probe.R));
      ok(probe.origin === 'null', 'D the worker\'s origin is "null"');
      ok(BEACONS.length === 0, 'D 0 requests reached the test server or the outside server (' + JSON.stringify(BEACONS) + ')');
      ok(reached.length === 0 && Object.keys(probe.R || {}).length >= 16, 'D every probe failed (' + (reached.map(x => x.join('=')).join(', ') || Object.keys(probe.R || {}).length + ' probes') + ')');

      // E extras through micropip
      HITS.length = 0; BEACONS.length = 0;
      await p.evaluate(a => run(a), { id: 'extra', runtime: 'py-module@1', python: EXTRA, packages: ['quantiphy', 'noema_testpkg'], requiresNetwork: true });
      st = await waitPy(p);
      R.timings.extrasStart = await readyMs(p);
      r = st === 'ready' ? await p.evaluate(() => step({ install: true })) : { st };
      ok(r.outputs && r.outputs.value === 42 && r.outputs.q === '4.7 kΩ', 'E allow-listed wheels installed by micropip from our index: ' + JSON.stringify(r.outputs || r));
      await sleep(1500);
      r = await p.evaluate(() => step({}));
      ok(r.outputs && /^refused/.test(r.outputs.R.six) && BEACONS.length === 0 && !HITS.some(u => /six/.test(u)), 'E micropip.install("six") at run time: ' + (r.outputs && r.outputs.R.six) + ', 0 requests');
      for (const [pk, net, code, what] of [[['six'], true, 'packages', 'a package not on the allow-list'], [['noema_badpkg'], true, 'integrity', 'a wheel whose sha256 does not match'], [['noema_testpkg'], false, 'packages', 'extras without requiresNetwork']]) {
        await p.evaluate(([a, pk, net]) => run({ id: 'x', runtime: 'py-module@1', python: 'def step(i, s):\n    return {}\n', packages: pk, requiresNetwork: net }), [null, pk, net]);
        st = await waitPy(p, 30000);
        ok(st === 'fail:' + code, `E refused: ${what} → ${st}`);
      }
      await p.close();

      // F offline after first use (this profile ran numpy and scipy above): first the server refuses /vendor (503), then also route abort
      const pS = await page(ctx);
      R.timings.statusAfterUse = await pS.evaluate(() => NoemaPy.status());
      BLOCK = true; BLOCKED.length = 0;
      await pS.evaluate(a => run(a), { id: 'bode', runtime: 'py-module@1', python: BODE, packages: ['numpy'] });
      st = await waitPy(pS, 60000);
      r = st === 'ready' ? await pS.evaluate(() => step({ f0: 1000 })) : {};
      const viaS = (await pS.evaluate(() => NoemaPy.status())).via;
      ok(r.outputs && Math.abs(r.outputs.mag_db[2] + 3.01) < 0.011 && viaS === 'sw', `F offline after first use (server refuses /vendor): numpy activity runs from the service worker's cache (${st}; files read via ${viaS}; ${BLOCKED.length} refused requests: ${[...new Set(BLOCKED)].join(' ')})`);
      R.timings.offlineServerBlock = Object.assign(await readyMs(pS) || {}, { via: viaS });
      await pS.close();
      const p2 = await page(ctx);
      BLOCKED.length = 0; await ctx.route('**/vendor/**', rt => rt.abort());
      await p2.evaluate(a => run(a), { id: 'bode', runtime: 'py-module@1', python: BODE, packages: ['numpy'] });
      st = await waitPy(p2, 60000);
      r = st === 'ready' ? await p2.evaluate(() => step({ f0: 1000 })) : {};
      const via2 = (await p2.evaluate(() => NoemaPy.status())).via;
      ok(r.outputs && Math.abs(r.outputs.mag_db[2] + 3.01) < 0.011, `F offline after first use (server 503 + route abort): numpy activity runs (${st}; files read via ${via2}; ${BLOCKED.length} refused requests: ${[...new Set(BLOCKED)].join(' ')})`);
      R.timings.offlineStart = Object.assign(await readyMs(p2) || {}, { via: via2 });
      if (process.env.PYDEBUG) console.log('    timeline', JSON.stringify(await p2.evaluate(() => PY.filter(m => m.type === 'py:status').map(m => m.t + ' ' + m.payload.phase + ' ' + (m.payload.done || '')))));
      await ctx.unroute('**/vendor/**'); BLOCK = false;
      await p2.close(); await ctx.close();

      // F offline after prepareOffline() in a fresh profile
      const ctx2 = await browser.newContext();
      const p3 = await page(ctx2);
      HITS.length = 0;
      const t0 = Date.now();
      const prep = await p3.evaluate(() => { const ev = []; return NoemaPy.prepareOffline({ include: ['numpy', 'scipy'], onProgress: d => ev.push(d) }).then(r => ({ r, n: ev.length, last: ev[ev.length - 1] })); });
      R.timings.prepareOffline = { ms: Date.now() - t0, files: prep.r.files, mb: +(prep.r.bytes / 1e6).toFixed(1), persisted: prep.r.persisted };
      ok(prep.r.ok && prep.n >= prep.r.files && prep.last.done === prep.last.total, `F prepareOffline({include: numpy, scipy}): ${prep.r.files} files, ${(prep.r.bytes / 1e6).toFixed(1)} MB, ${prep.n} progress events, persisted=${prep.r.persisted} (${Date.now() - t0} ms)`);
      const sts = await p3.evaluate(() => NoemaPy.status());
      ok(sts.sw === 'active' && sts.groups.core.ready && sts.groups.numpy.ready && sts.groups.scipy.ready && !sts.groups.quantiphy.ready, 'F status(): sw ' + sts.sw + ', core/numpy/scipy cached, quantiphy not (' + (sts.cachedBytes / 1e6).toFixed(1) + ' MB)');
      await p3.close();
      BLOCK = true; BLOCKED.length = 0; await ctx2.route('**/vendor/**', rt => rt.abort());
      const p4 = await page(ctx2);
      await p4.evaluate(a => run(a), { id: 'butter', runtime: 'py-module@1', python: BUTTER, packages: ['numpy', 'scipy'] });
      st = await waitPy(p4, 60000);
      r = st === 'ready' ? await p4.evaluate(() => step({ order: 2, wc: 1000 })) : {};
      const via4 = (await p4.evaluate(() => NoemaPy.status())).via;
      ok(r.outputs && Math.abs(r.outputs.db[1] + 3.01) < 0.02, `F offline after prepareOffline (server 503 + route abort): scipy activity runs (${st}; files read via ${via4}; ${BLOCKED.length} refused requests)`);
      R.timings.offlineScipyStart = Object.assign(await readyMs(p4) || {}, { via: via4 });
      await ctx2.unroute('**/vendor/**'); BLOCK = false;
      await ctx2.close();

      // G without a service worker (the page's own cache)
      if (name === 'chromium') {
        const ctx3 = await browser.newContext(), p5 = await page(ctx3, '?nosw');
        await p5.evaluate(a => run(a), { id: 'bode', runtime: 'py-module@1', python: BODE, packages: ['numpy'] });
        st = await waitPy(p5);
        const s5 = await p5.evaluate(() => NoemaPy.status());
        ok(st === 'ready' && s5.sw === 'none' && s5.groups.numpy.ready, 'G no service worker: the page caches and checks the files itself (' + st + ')');
        await p5.close();
        BLOCK = true; const p6 = await page(ctx3, '?nosw');
        await p6.evaluate(a => run(a), { id: 'bode', runtime: 'py-module@1', python: BODE, packages: ['numpy'] });
        st = await waitPy(p6, 60000); BLOCK = false;
        ok(st === 'ready', 'G no service worker, /vendor blocked: runs from the page\'s cache (' + st + ')');
        await ctx3.close();
      }
    } catch (e) { ok(false, 'crashed: ' + (e && e.stack || e).toString().slice(0, 400)); }
    BLOCK = false;
    await browser.close();
    R.fails = fails; totalFails += fails;
    console.log(`  ${name}: ${Object.values(R.checks).filter(Boolean).length} passed, ${fails} failed; timings ${JSON.stringify(R.timings)}`);
  }
  server.close(); outside.close();
  fs.rmSync(SITE, { recursive: true, force: true });
  console.log('\nSUMMARY ' + JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v === 'skipped' ? v : { passed: Object.values(v.checks).filter(Boolean).length, failed: v.fails }]))));
  process.exit(totalFails ? 1 : 0);
})();
