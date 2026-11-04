/* ===================== interactive activities — runtime py-module@1 (Tier C: Python with numpy/scipy, docs/activities-dev/pyodide.md) =====================
   The activity is Python source (act.python) with a function step(inputs, state) → outputs (a dict) and an optional init(task, seed).
   Its UI is not Python: the app draws the controls and plots from a declarative spec and calls step with py:step {inputs} → py:out {outputs}.
   Where it runs: <iframe sandbox="allow-scripts"> (opaque origin "null") holding only OUR runner script (allowed by its hash), which
   starts a blob: Worker with Pyodide 0.27.7. The runner has NO network at all (connect-src 'none'): the app reads the pinned files
   (sha256-checked against /vendor/pyodide/manifest.json, cached on the device by engine/pyodide-sw.js) and hands their bytes over the
   MessagePort; inside the worker, fetch() and importScripts() are replaced by a lookup in those bytes, so Pyodide, numpy, scipy and the
   allow-listed extra wheels (micropip, our own index only) load without a request — and nothing else can be loaded: the lookup is
   emptied once Python has started, and the policy blocks every real request (fetch, XHR, WebSocket, importScripts, import()).
   A step that runs longer than its budget (3 s) ends the worker: error {code:'runaway'}; py:restart (or a new mount) starts it again.
   Handshake as html-app@1 (34_activity_html.js): the runner posts hello {nonce} to the app, which hands over one MessagePort.
   Not available on file:// copies and in the one-file bundle (no service worker, no cache, no files): the core shows the fallback.
   Page API: window.NoemaPy = { available(), prepareOffline({include, onProgress, force}), status(), protocol, config() }. */
(() => {
  /* i18n-ignore-start */   // code, protocol names and Python source — no UI text
  const DEFAULTS = { base: '/vendor/pyodide/0.27.7/', manifest: '/vendor/pyodide/manifest.json', sw: '/engine/pyodide-sw.js', swScope: '/vendor/pyodide/',
    loader: '/vendor/pyodide/__loader.html', stepMs: 3000, initMs: 20000, startMs: 120000, maxPython: 256 * 1024 };
  const config = () => Object.assign({}, DEFAULTS, (typeof window !== 'undefined' && window.NOEMA_CONFIG && window.NOEMA_CONFIG.py) || {});
  const CACHE = 'noema-py-v1';
  const BASE_PKGS = ['numpy', 'scipy'];
  const VB = 'https://py.noema.invalid/';   // the virtual address of the files inside the worker (never requested: .invalid)
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const jsize = v => { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } };
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const hex = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
  const b64 = async text => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  const TYPES = { js: 'text/javascript', wasm: 'application/wasm', json: 'application/json', zip: 'application/zip', whl: 'application/zip' };
  const typeOf = p => TYPES[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

  /* ---------- the small protocol of this runtime (on top of noema.activity/v1, same envelope) ----------
     app → runner  py:boot {python, packages, extras, stepMs, files}   (once, after init; files: { vpath: ArrayBuffer })
                   py:step {inputs} + id          → py:out {outputs} | {error:{code, message}} + re = that id
                   py:restart {}                  → a new worker with the same files and the last saved state
     runner → app  py:status {phase: loading|starting|ready|stopped|failed, code?, message?, ms?}
                   py:out {outputs?, error?, ms?, init?}   (init: true — what init(task, seed) returned) */
  const PHASES = ['loading', 'starting', 'ready', 'stopped', 'failed'];
  const CODE = /^[a-z0-9_.-]{1,40}$/;
  const PY_IN = {
    'py:out': p => (p.outputs == null || isObj(p.outputs)) && (p.error == null || (isObj(p.error) && CODE.test(p.error.code || '') && (p.error.message == null || (typeof p.error.message === 'string' && p.error.message.length <= 2000)))) && (p.ms == null || (typeof p.ms === 'number' && isFinite(p.ms))),
    'py:status': p => PHASES.includes(p.phase) && (p.code == null || CODE.test(p.code)) && (p.message == null || (typeof p.message === 'string' && p.message.length <= 2000)),
  };
  const PY_OUT = { 'py:step': p => isObj(p.inputs), 'py:restart': p => true, 'py:boot': p => typeof p.python === 'string' };
  /** → { ok, msg } | { ok: false, why } — the py:* messages (both directions), like ACTP.check; limits: one message ≤ 64 KB (as ACTP) */
  function pyCheck(data, dir = 'in') {
    if (!isObj(data) || data.p !== 'noema.activity' || data.v !== 1 || typeof data.type !== 'string') return { ok: false, why: 'not this protocol' };
    const rules = dir === 'in' ? PY_IN : PY_OUT, rule = Object.prototype.hasOwnProperty.call(rules, data.type) ? rules[data.type] : null;
    if (!rule) return { ok: false, why: 'unknown type ' + data.type, ignore: true };
    const payload = data.payload == null ? {} : data.payload;
    if (!isObj(payload)) return { ok: false, why: 'payload is not an object' };
    if (data.type !== 'py:boot' && jsize(data) > 64 * 1024) return { ok: false, why: 'message too big' };
    if (!rule(payload)) return { ok: false, why: 'bad ' + data.type };
    return { ok: true, msg: { type: data.type, id: data.id, re: data.re, payload } };
  }

  /* ---------- the files: pinned manifest, service worker, cache ---------- */
  const available = () => { try { return !!(!window.NOEMA_BUNDLE && window.isSecureContext && /^https?:$/.test(location.protocol) && 'caches' in window && window.crypto?.subtle && typeof Worker === 'function' && typeof WebAssembly === 'object'); } catch (e) { return false; } };
  let swP = null, loaderEl = null, loaderP = null, loaderNo = 0, manP = null, via = null;   // via: how the last file was read ('sw' | 'page')
  /** the registration of engine/pyodide-sw.js with an active worker, or null (unsupported, refused, NOEMA_CONFIG.py.sw === false) */
  function sw() {
    if (swP) return swP;
    return swP = (async () => {
      const c = config();
      if (c.sw === false || !navigator.serviceWorker) return null;
      try {
        const reg = await navigator.serviceWorker.register(c.sw + '?manifest=' + encodeURIComponent(c.manifest), { scope: c.swScope });
        if (!reg.active) {
          const w = reg.installing || reg.waiting;
          if (w) await new Promise(res => { const t = setTimeout(res, 10000); w.addEventListener('statechange', () => { if (w.state === 'activated' || w.state === 'redundant') { clearTimeout(t); res(); } }); });
        }
        return reg.active ? reg : null;
      } catch (e) { console.warn('[noema] python: no service worker —', e && e.message); return null; }
    })();
  }
  /** a hidden same-origin page in the worker's scope (served by the worker itself, no scripts can run in it): its fetch() goes
      through the service worker. null → the page reads the cache itself (the same cache, the same checks). */
  function loader() {
    if (loaderEl && loaderEl.isConnected) return Promise.resolve(loaderEl);
    if (loaderP) return loaderP;
    if (Date.now() - loaderNo < 60000) return Promise.resolve(null);   // it just failed: the page's cache for a while
    return loaderP = (async () => {
      const reg = await sw(); if (!reg) return null;
      const f = document.createElement('iframe');
      f.src = config().loader; f.title = 'noema python files'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.style.display = 'none';
      await new Promise(res => { f.addEventListener('load', res, { once: true }); setTimeout(res, 5000); (document.body || document.documentElement).append(f); });
      let ok = false;
      try { ok = !!f.contentWindow.navigator.serviceWorker.controller && typeof f.contentWindow.fetch === 'function' && f.contentDocument.title === 'noema python files'; } catch (e) { }
      if (!ok) { f.remove(); loaderNo = Date.now(); return null; }
      return (loaderEl = f);
    })().finally(() => { loaderP = null; });
  }
  async function cache() { try { return await caches.open(CACHE); } catch (e) { return null; } }
  /** the bytes of one pinned file, checked: the service worker (cache first) or, without it, the page's own cache */
  async function getFile(path, sha256) {
    const url = new URL(path, location.origin).href, f = await loader();
    let buf;
    if (f) {
      let r; try { r = await f.contentWindow.fetch(url); } catch (e) { throw err('offline', path); }
      if (!r.ok) throw err(r.headers.get('x-noema-error') === 'integrity' ? 'integrity' : r.status === 504 ? 'offline' : 'fetch', path + ' ' + r.status);
      buf = await r.arrayBuffer(); via = 'sw';
    } else {
      via = 'page';
      const c = await cache(), hit = c && await c.match(url);
      if (hit) buf = await hit.arrayBuffer();
      else {
        let r; try { r = await fetch(url, { cache: 'no-cache', credentials: 'omit' }); } catch (e) { throw err('offline', path); }
        if (!r.ok) throw err('fetch', path + ' ' + r.status);
        buf = await r.arrayBuffer();
        if (await hex(buf) !== sha256) throw err('integrity', path);
        try { await c?.put(url, new Response(buf.slice(0), { headers: { 'content-type': typeOf(path) } })); } catch (e) { }
        return buf;
      }
    }
    if (await hex(buf) !== sha256) { try { (await cache())?.delete(url); } catch (e) { } throw err('integrity', path); }
    return buf;
  }
  /** the runtime manifest written by tools/fetch_pyodide.py (network first; the cached copy offline) */
  function manifest() {
    if (manP) return manP;
    manP = (async () => {
      const url = new URL(config().manifest, location.origin).href, f = await loader();
      let m = null;
      if (f) { const r = await f.contentWindow.fetch(url).catch(() => null); if (r && r.ok) m = await r.json(); }
      else {
        const c = await cache();
        try { const r = await fetch(url, { cache: 'no-cache', credentials: 'omit' }); if (r.ok) { m = await r.clone().json(); try { await c?.put(url, r); } catch (e) { } } } catch (e) { }
        if (!m && c) { const hit = await c.match(url); if (hit) m = await hit.json(); }
      }
      if (!m || m.format !== 'noema.pyodide-manifest/v1' || !Array.isArray(m.core) || !isObj(m.files)) throw err('offline', 'no manifest');
      return m;
    })();
    manP.catch(() => { manP = null; });
    return manP;
  }
  /** what an activity's packages need: [{ vpath, path, sha256, bytes }] (core first) and the extra wheels; throws 'packages' */
  function plan(man, packages) {
    const out = new Map(), extras = [];
    const add = (vpath, path, pin) => { if (!pin || !/^[0-9a-f]{64}$/.test(pin.sha256 || '')) throw err('packages', 'not pinned: ' + path); out.set(vpath, { vpath, path, sha256: pin.sha256, bytes: pin.bytes || 0 }); };
    const pkg = name => { const files = man.packages && man.packages[name]; if (!Array.isArray(files)) throw err('packages', name + ' is not on this site'); for (const f of files) add('pyodide/' + f, man.base + f, man.files[f]); };
    for (const f of man.core) add('pyodide/' + f, man.base + f, man.files[f]);
    for (const p of packages) {
      if (BASE_PKGS.includes(p)) pkg(p);
      else if (man.wheels && Object.prototype.hasOwnProperty.call(man.wheels, p)) extras.push({ name: p, file: man.wheels[p].file });
      else throw err('packages', p + ' is not on the allow-list');
    }
    if (extras.length) { pkg('micropip'); for (const x of extras) { const w = man.wheels[x.name]; if (!/^[A-Za-z0-9_.-]+-py3-none-any\.whl$/.test(w.file || '')) throw err('packages', 'bad wheel ' + x.name); add('pywheels/' + w.file, man.wheelsBase + w.file, w); } }
    return { files: [...out.values()], extras };
  }
  async function loadAll(list, onProgress) {
    const files = {}, total = list.length, totalBytes = list.reduce((s, f) => s + f.bytes, 0);
    let done = 0, bytes = 0, i = 0;
    const one = async () => { while (i < list.length) { const f = list[i++]; files[f.vpath] = await getFile(f.path, f.sha256); done++; bytes += f.bytes; onProgress && onProgress({ file: f.path, done, total, bytes, totalBytes }); } };
    await Promise.all([one(), one(), one()]);
    return files;
  }
  async function persist() {
    try { if (!navigator.storage?.persist) return null; if (await navigator.storage.persisted()) return true; return await Promise.race([navigator.storage.persist(), new Promise(r => setTimeout(() => r(null), 3000))]); } catch (e) { return null; }
  }
  /** Settings → "Prepare Python for offline": download and keep the core + the named packages (numpy, scipy, allow-listed extras).
      Never automatic; on a metered / save-data connection only with force. → { ok, files, bytes, persisted, failed: [{file, code}] } */
  async function prepareOffline(opts = {}) {
    const include = Array.isArray(opts.include) ? opts.include : ['numpy', 'scipy'];
    if (!available()) return { ok: false, code: 'unavailable', files: 0, bytes: 0, persisted: null, failed: [] };
    if (navigator.connection?.saveData && !opts.force) return { ok: false, code: 'save-data', files: 0, bytes: 0, persisted: null, failed: [] };
    const persisted = await persist();
    const man = await manifest();
    const { files } = plan(man, include);
    const failed = [];
    let done = 0, bytes = 0;
    const emit = d => { try { opts.onProgress?.(d); } catch (e) { } try { dispatchEvent(new CustomEvent('noema-py-progress', { detail: d })); } catch (e) { } };
    emit({ file: null, done: 0, total: files.length, bytes: 0, totalBytes: files.reduce((s, f) => s + f.bytes, 0) });
    let i = 0;
    const one = async () => { while (i < files.length) { const f = files[i++]; try { await getFile(f.path, f.sha256); bytes += f.bytes; } catch (e) { failed.push({ file: f.path, code: e.code || 'fetch' }); } done++; emit({ file: f.path, done, total: files.length, bytes, totalBytes: files.reduce((s, x) => s + x.bytes, 0) }); } };
    await Promise.all([one(), one(), one()]);
    return { ok: !failed.length, files: files.length - failed.length, bytes, persisted, failed };
  }
  /** what an activity's packages need and how much of it is already on the device (the first-use note):
      → { files, bytes, missing, missingBytes, extras: [names], extrasMissing: [names] }; throws when there is no manifest (offline, never used) */
  async function need(packages) {
    const man = await manifest(), { files, extras } = plan(man, Array.isArray(packages) ? packages : []);
    const c = await cache(), have = new Set(c ? (await c.keys()).map(r => new URL(r.url).pathname) : []);
    const miss = files.filter(f => !have.has(new URL(f.path, location.origin).pathname));
    const sum = l => l.reduce((n, f) => n + (f.bytes || 0), 0);
    return { files: files.length, bytes: sum(files), missing: miss.length, missingBytes: sum(miss), extras: extras.map(x => x.name),
      extrasMissing: extras.filter(x => miss.some(f => f.vpath === 'pywheels/' + man.wheels[x.name].file)).map(x => x.name) };
  }
  /** what is on the device: { supported, sw: 'active'|'none', via: how the last file was read ('sw'|'page'|null), persisted, version, cachedBytes, groups: { core, numpy, scipy, micropip, <extra>: { files, cached, bytes, ready } } } */
  async function status() {
    const out = { supported: available(), sw: 'none', via, persisted: null, version: null, cachedBytes: 0, groups: {} };
    if (!out.supported) return out;
    try { out.persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch (e) { }
    try { const reg = await navigator.serviceWorker?.getRegistration(config().swScope); out.sw = reg && reg.active ? 'active' : 'none'; } catch (e) { }
    let man; try { man = await manifest(); } catch (e) { return out; }
    out.version = man.version;
    const c = await cache(), have = new Set(c ? (await c.keys()).map(r => new URL(r.url).pathname) : []);
    const group = (name, list) => { const g = { files: list.length, cached: 0, bytes: 0 }; for (const [p, pin] of list) { g.bytes += pin.bytes || 0; if (have.has(p)) { g.cached++; out.cachedBytes += pin.bytes || 0; } } g.ready = g.cached === g.files; out.groups[name] = g; };
    group('core', man.core.map(f => [man.base + f, man.files[f]]));
    for (const [n, files] of Object.entries(man.packages || {})) group(n, files.map(f => [man.base + f, man.files[f]]));
    for (const [n, w] of Object.entries(man.wheels || {})) group(n, [[man.wheelsBase + w.file, w]]);
    return out;
  }

  /* ---------- the worker (runs Pyodide; its source is this function's text) ---------- */
  function workerMain() {
    'use strict';
    var VB = 'https://py.noema.invalid/', FILES = {}, py = null, stepFn = null, realImport = self.importScripts.bind(self);
    var TY = { js: 'text/javascript', wasm: 'application/wasm', json: 'application/json', zip: 'application/zip', whl: 'application/zip' };
    function post(m) { self.postMessage(m); }
    function urlOf(x) { return String(x && typeof x === 'object' && 'url' in x ? x.url : x); }
    function get(u) { return Object.prototype.hasOwnProperty.call(FILES, u) ? FILES[u] : null; }
    // every load of Pyodide goes through these two; after the start FILES is empty, so nothing can be loaded any more
    self.fetch = function (input, opts) {
      var u = urlOf(input), b = get(u);
      if (!b) return Promise.reject(new TypeError('noema: ' + u.slice(0, 200) + ' cannot be loaded here'));
      var integ = opts && opts.integrity, res = function () { return new Response(b, { status: 200, headers: { 'content-type': TY[(u.split('.').pop() || '').toLowerCase()] || 'application/octet-stream' } }); };
      if (!integ || !self.crypto || !crypto.subtle) return Promise.resolve(res());
      return crypto.subtle.digest('SHA-256', b).then(function (d) {
        var s = btoa(String.fromCharCode.apply(null, new Uint8Array(d)));
        if (String(integ).split(/\s+/).indexOf('sha256-' + s) < 0) throw new TypeError('noema: integrity ' + u);
        return res();
      });
    };
    self.importScripts = function () {
      var urls = [];
      for (var i = 0; i < arguments.length; i++) { var b = get(urlOf(arguments[i])); if (!b) throw new TypeError('noema: script cannot be loaded here'); urls.push(URL.createObjectURL(new Blob([b], { type: 'text/javascript' }))); }
      return realImport.apply(self, urls);
    };
    function msgOf(e) { var s = String(e && e.message || e); var lines = s.trim().split('\n'); return lines.slice(-6).join('\n').slice(-1500); }
    async function boot(m) {
      var t0 = performance.now(), t1, t2;
      try {
        for (var k in m.files) FILES[VB + k] = m.files[k];
        post({ k: 'status', phase: 'starting' });
        self.importScripts(VB + 'pyodide/pyodide.js');
        py = await self.loadPyodide({ indexURL: VB + 'pyodide/', lockFileURL: VB + 'pyodide/pyodide-lock.json', stdLibURL: VB + 'pyodide/python_stdlib.zip', packages: [], fullStdLib: false,
          stdout: function (s) { post({ k: 'log', text: String(s).slice(0, 500) }); }, stderr: function (s) { post({ k: 'log', text: String(s).slice(0, 500), err: true }); } });
        t1 = performance.now();
        var pk = m.packages.filter(function (p) { return p === 'numpy' || p === 'scipy'; });
        if (m.extras.length) pk.push('micropip');
        if (pk.length) await py.loadPackage(pk, { checkIntegrity: true, messageCallback: function () { }, errorCallback: function (s) { post({ k: 'log', text: String(s).slice(0, 500), err: true }); } });
        if (m.extras.length) {
          py.globals.set('_noema_wheels', py.toPy(m.extras.map(function (x) { return VB + 'pywheels/' + x.file; })));
          await py.runPythonAsync('import micropip\nawait micropip.install(list(_noema_wheels), deps=False)\ntry:\n    micropip.set_index_urls(["' + VB + 'pywheels/simple/{package_name}/"])\nexcept Exception:\n    pass\ndel _noema_wheels');
        }
        t2 = performance.now();
        FILES = {};   // from here on nothing can be loaded: not our files, not any other
        py.registerJsModule('_noema_bridge', { send: function (type, json) { post({ k: 'send', type: String(type), payload: JSON.parse(String(json)) }); } });
        py.runPython(m.api, { filename: 'noema.py' });
        py.globals.get('_noema_setup')(JSON.stringify(m.init));
        stepFn = py.globals.get('_noema_step');
        post({ k: 'user' });   // the author's code starts: the runner's budget runs from here
        var r = py.globals.get('_noema_run')(m.python);
        post({ k: 'ready', ms: { start: Math.round(t1 - t0), packages: Math.round(t2 - t1), user: Math.round(performance.now() - t2) }, outputs: r == null ? null : String(r) });
      } catch (e) { FILES = {}; post({ k: 'fatal', code: py ? 'python' : 'py-start', message: msgOf(e) }); }
    }
    self.onmessage = function (e) {
      var m = e.data || {};
      if (m.k === 'boot') return boot(m);
      if (m.k === 'step') {
        var t = performance.now();
        try { var s = stepFn(String(m.inputs)); post({ k: 'out', id: m.id, outputs: String(s), ms: Math.round(performance.now() - t) }); }
        catch (x) { post({ k: 'out', id: m.id, error: { code: 'python', message: msgOf(x) }, ms: Math.round(performance.now() - t) }); }
        return;
      }
      if (m.k === 'locale' && py) { try { py.globals.get('_noema_locale')(JSON.stringify({ locale: m.locale, strings: m.strings })); } catch (x) { } }
    };
  }

  /* ---------- the Python side: module noema + the step/init calls (docs/activities-dev/pyodide.md "Python API") ---------- */
  const NOEMA_PY = String.raw`
import sys, json, math, re, types, random as _random
import _noema_bridge
_I = {}
_ACT = {'g': None}
noema = types.ModuleType('noema')
noema.__doc__ = 'The noema-lite activity API (py-module@1): state, task, seed, locale, t(), save_state(), event(), result(), announce(), error(), random.'
sys.modules['noema'] = noema

def _clean(o, d=0):
    if d > 40: raise ValueError('too deeply nested')
    if o is None or isinstance(o, (bool, str)): return o
    if isinstance(o, int): return o
    if isinstance(o, float): return o if math.isfinite(o) else None
    if isinstance(o, complex): return {'re': _clean(o.real), 'im': _clean(o.imag)}
    if isinstance(o, dict): return {str(k): _clean(v, d + 1) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [_clean(v, d + 1) for v in o]
    tl = getattr(o, 'tolist', None)          # numpy arrays and numpy scalars
    if callable(tl): return _clean(tl(), d + 1)
    raise TypeError('cannot send a value of type ' + type(o).__name__)

def _send(kind, payload):
    _noema_bridge.send(kind, json.dumps(payload, allow_nan=False))

def _fill(s, v):
    return re.sub(r'\{(\w+)\}', lambda m: str(v[m.group(1)]) if v and v.get(m.group(1)) is not None else m.group(0), s)

def t(key, vars=None):
    tb = _I.get('strings') or {}
    return _fill(str(tb.get(key, key)) if isinstance(tb, dict) else str(key), vars)

def save_state(data=None):
    if data is not None: noema.state = data
    _send('state', {'version': int(_I.get('stateVersion') or 1), 'data': _clean(noema.state)})

def event(name, data=None):
    p = {'name': str(name)}
    if data is not None: p['data'] = _clean(data)
    _send('event', p)

def result(score, passed, detail=None):
    s = float(score)
    if not math.isfinite(s): raise ValueError('score must be a number')
    p = {'score': max(0.0, min(1.0, s)), 'passed': bool(passed)}
    if detail is not None: p['detail'] = str(detail)[:500]
    _send('result', p)

def announce(text):
    text = str(text).strip()[:300]
    if text: _send('a11y:announce', {'text': text})

def error(code, message=None):
    p = {'code': re.sub(r'[^a-z0-9_.-]', '-', str(code).lower())[:40] or 'error'}
    if message is not None: p['message'] = str(message)[:500]
    _send('error', p)

for _f in (t, save_state, event, result, announce, error): setattr(noema, _f.__name__, _f)

def _noema_setup(js):
    i = json.loads(js); _I.clear(); _I.update(i)
    noema.task = i.get('task') or {}
    noema.seed = int(i.get('seed') or 0)
    noema.locale = i.get('locale') or 'en'
    noema.exercise = i.get('exerciseId')
    st = i.get('state')
    noema.state = st if st is not None else {}
    noema.state_from = i.get('stateFrom')
    noema.random = _random.Random(noema.seed)

def _noema_locale(js):
    i = json.loads(js); _I['strings'] = i.get('strings') or _I.get('strings'); noema.locale = i.get('locale') or noema.locale

def _noema_run(src):
    g = {'__name__': 'activity', '__builtins__': __builtins__}
    exec(compile(src, 'activity.py', 'exec'), g)
    _ACT['g'] = g
    if callable(g.get('init')):
        r = g['init'](noema.task, noema.seed)
        if isinstance(r, dict): return json.dumps(_clean(r), allow_nan=False)
    return None

def _noema_step(js):
    g = _ACT['g'] or {}
    f = g.get('step')
    if not callable(f): raise RuntimeError('the activity defines no step(inputs, state)')
    out = f(json.loads(js), noema.state)
    if out is None: out = {}
    if not isinstance(out, dict): raise TypeError('step() must return a dict, not ' + type(out).__name__)
    return json.dumps(_clean(out), allow_nan=False)
`;

  /* ---------- the runner (the sandboxed frame's only script; its source is this function's text) ---------- */
  function runnerMain(N, WSRC, API) {
    'use strict';
    var P = 'noema.activity', port = null, init = null, boot = null, worker = null, pyReady = false, busy = null, queued = null, timer = null, budget = 3000, initBudget = 20000, saved = null, stopped = false;
    var SENDS = { state: 1, event: 1, result: 1, 'a11y:announce': 1, error: 1 };
    function out(type, payload, extra) { var m = { p: P, v: 1, type: type, payload: payload || {} }; if (extra) for (var k in extra) m[k] = extra[k]; if (port) port.postMessage(m); }
    function on(e) { if (e.source !== parent || !e.data || e.data.t !== 'welcome' || e.data.nonce !== N || !e.ports || !e.ports[0] || port) return; port = e.ports[0]; removeEventListener('message', on, true); port.onmessage = msg; port.start(); }
    addEventListener('message', on, true);
    function disarm() { clearTimeout(timer); timer = null; }
    function arm(ms) { disarm(); timer = setTimeout(runaway, ms); }
    function kill() { disarm(); if (worker) { try { worker.terminate(); } catch (x) { } } worker = null; pyReady = false; }
    function reply(id, payload) { if (id != null) out('py:out', payload, { re: id }); }
    function runaway() {
      kill(); stopped = true;
      out('error', { code: 'runaway', message: 'the Python code ran longer than ' + (budget / 1000) + ' s and was stopped' });
      reply(busy, { error: { code: 'runaway', message: 'stopped after ' + budget + ' ms' } }); busy = null;
      if (queued) { reply(queued.id, { error: { code: 'runaway', message: 'stopped' } }); queued = null; }
      out('py:status', { phase: 'stopped', code: 'runaway' });
    }
    function dispatch() {
      if (!pyReady || busy != null || !queued) return;
      var q = queued; queued = null; busy = q.id == null ? '' : q.id;
      worker.postMessage({ k: 'step', id: q.id, inputs: JSON.stringify(q.inputs) });
      arm(budget);
    }
    function start() {
      if (!init || !boot || worker) return;
      stopped = false; pyReady = false;
      try { worker = new Worker(URL.createObjectURL(new Blob([WSRC], { type: 'text/javascript' }))); }
      catch (x) { out('py:status', { phase: 'failed', code: 'worker', message: String(x && x.message || x).slice(0, 300) }); return; }
      worker.onmessage = fromWorker;
      worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); out('py:status', { phase: 'failed', code: 'py-start', message: String(e && e.message || 'worker error').slice(0, 300) }); kill(); };
      worker.postMessage({ k: 'boot', files: boot.files, python: boot.python, packages: boot.packages, extras: boot.extras, api: API,
        init: { task: init.task || {}, seed: init.seed >>> 0, locale: init.locale, strings: init.strings || {}, exerciseId: init.exerciseId || null, stateVersion: init.stateVersion || 1,
          state: saved ? saved.data : null, stateFrom: saved ? saved.from || null : null } });
    }
    function fromWorker(e) {
      var m = e.data || {};
      if (m.k === 'status') return out('py:status', { phase: m.phase });
      if (m.k === 'user') return arm(initBudget);   // the top-level code (imports: scipy.signal alone takes seconds) and init(task, seed)
      if (m.k === 'ready') {
        disarm(); pyReady = true; out('py:status', { phase: 'ready', ms: (m.ms.start || 0) + (m.ms.packages || 0) + (m.ms.user || 0), timing: m.ms });
        if (m.outputs) { try { var o = JSON.parse(m.outputs); if (m.outputs.length <= 60000) out('py:out', { outputs: o, init: true }); } catch (x) { } }
        return dispatch();
      }
      if (m.k === 'send') {
        if (!SENDS[m.type]) return;
        if (m.type === 'state') saved = { data: m.payload && m.payload.data };
        return out(m.type, m.payload);
      }
      if (m.k === 'out') {
        disarm(); var id = busy; busy = null;
        var p = { ms: m.ms };
        if (m.error) p.error = { code: String(m.error.code || 'python').slice(0, 40), message: String(m.error.message || '').slice(0, 1500) };
        else if (String(m.outputs).length > 60000) p.error = { code: 'too-big', message: 'step() returned ' + String(m.outputs).length + ' bytes (at most 60000)' };
        else { try { p.outputs = JSON.parse(m.outputs); } catch (x) { p.error = { code: 'python', message: 'bad outputs' }; } }
        reply(id === '' ? null : id, p);
        return dispatch();
      }
      if (m.k === 'fatal') { kill(); return out('py:status', { phase: 'failed', code: m.code === 'python' ? 'python' : 'py-start', message: String(m.message || '').slice(0, 1500) }); }
      if (m.k === 'log') { try { (m.err ? console.warn : console.log)('[python]', m.text); } catch (x) { } }
    }
    function msg(e) {
      var m = e.data; if (!m || m.p !== P) return; var p = m.payload || {};
      switch (m.type) {
        case 'ping': return out('pong');
        case 'init': init = p; saved = p.state ? { data: p.state.data, from: p.state.migrateFrom || null } : null; out('ready', { protocols: [1], wants: ['py:step'] }); out('py:status', { phase: 'loading' }); return start();
        case 'py:boot': boot = p; budget = Math.max(100, Math.min(+p.stepMs || 3000, 30000)); initBudget = Math.max(budget, Math.min(+p.initMs || 20000, 60000)); return start();
        case 'py:step': if (stopped || !p || typeof p.inputs !== 'object') { reply(m.id, { error: { code: stopped ? 'stopped' : 'bad-inputs' } }); return; }
          if (queued) reply(queued.id, { error: { code: 'superseded' } });
          queued = { id: m.id == null ? null : m.id, inputs: p.inputs }; return dispatch();
        case 'py:restart': kill(); busy = null; if (queued) { reply(queued.id, { error: { code: 'superseded' } }); queued = null; } return start();
        case 'locale': if (init) { init.locale = p.locale; init.strings = p.strings || init.strings; } if (worker) worker.postMessage({ k: 'locale', locale: p.locale, strings: p.strings || (init && init.strings) }); return;
        case 'destroy': return kill();
      }
    }
    parent.postMessage({ t: 'hello', nonce: N }, '*');
  }

  const CSP = hash => ["default-src 'none'", `script-src 'sha256-${hash}' blob: 'wasm-unsafe-eval'`, 'worker-src blob:', 'child-src blob:', "connect-src 'none'", "frame-src 'none'",
    "img-src 'none'", "style-src 'none'", "font-src 'none'", "media-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "manifest-src 'none'"].join('; ');
  const ALLOW = ['accelerometer', 'autoplay', 'camera', 'display-capture', 'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture', 'publickey-credentials-get', 'screen-wake-lock', 'usb', 'web-share', 'xr-spatial-tracking'].map(f => f + " 'none'").join('; ');
  async function runnerDoc(nonce) {
    const js = `(${runnerMain.toString()})(${JSON.stringify(nonce)}, ${JSON.stringify('(' + workerMain.toString() + ')();')}, ${JSON.stringify(NOEMA_PY)});`.replace(/<\/(script)/gi, '<\\/$1');
    const csp = CSP(await b64(js)).replace(/"/g, '&quot;');   // the hash of exactly the text the frame runs
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>${js}</script></head><body></body></html>`;
  }

  function mount(box, { act, init, title, onMessage, onFail, onPy }) {
    const c = config();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');   // exactly this token: never allow-same-origin
    frame.setAttribute('allow', ALLOW);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', title || 'python');
    frame.setAttribute('aria-hidden', 'true');   // the runner shows nothing: the app draws the activity's controls
    frame.className = 'act-frame act-pyrunner';
    frame.style.cssText = 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    let ch = null, closed = false, failed = false, loads = 0, seq = 0, pyReady = false;
    const pending = [], waits = {}, L = {};
    const emit = m => { for (const f of (L[m.type] || []).slice()) { try { f(m.payload, m); } catch (e) { console.error(e); } } for (const f of (L['*'] || []).slice()) { try { f(m.payload, m); } catch (e) { console.error(e); } } };
    const fail = why => { if (closed || failed) return; failed = true; clearTimeout(startT); for (const id in waits) { waits[id]({ error: { code: why } }); delete waits[id]; } onFail(why); };
    const startT = setTimeout(() => { if (!pyReady) fail('timeout'); }, c.startMs);
    const port = {
      send(type, payload, extra) { const m = ACTP.out(type, payload, extra); if (closed) return; if (ch) ch.port1.postMessage(m); else pending.push(m); },
      close() { closed = true; clearTimeout(startT); removeEventListener('message', hello); try { ch?.port1.close(); } catch (e) { } frame.remove(); for (const id in waits) { waits[id]({ error: { code: 'closed' } }); delete waits[id]; } },
      /** → Promise<{ outputs } | { error: { code, message } }> */
      step(inputs) { return new Promise(res => { if (closed || failed) return res({ error: { code: 'closed' } }); const id = 'py' + (++seq); waits[id] = res; port.send('py:step', { inputs: inputs || {} }, { id }); }); },
      restart() { pyReady = false; port.send('py:restart', {}); },
      on(type, f) { (L[type] = L[type] || []).push(f); return () => { L[type] = (L[type] || []).filter(x => x !== f); }; },
      get ready() { return pyReady; },
    };
    function fromRunner(raw) {
      if (closed) return;
      if (raw && typeof raw.type === 'string' && raw.type.startsWith('py:')) {
        const r = pyCheck(raw, 'in'); if (!r.ok) { console.warn('[noema] python runner:', r.why); return; }
        const m = r.msg;
        if (m.type === 'py:status') { if (m.payload.phase === 'ready') { pyReady = true; clearTimeout(startT); } if (m.payload.phase === 'stopped') pyReady = false; if (m.payload.phase === 'failed') { console.warn('[noema] python:', m.payload.code, m.payload.message || ''); fail(m.payload.code || 'python'); } }
        if (m.type === 'py:out' && m.re && waits[m.re]) { const w = waits[m.re]; delete waits[m.re]; w(m.payload); }
        emit(m);
        try { onPy?.(m); } catch (e) { console.error(e); }
      }
      onMessage(raw);   // the core checks everything with ACTP (py:* are not its types: ignored there, never a strike)
    }
    function hello(e) {
      if (closed || ch || e.source !== frame.contentWindow) return;
      const d = e.data; if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
      removeEventListener('message', hello);
      ch = new MessageChannel();
      ch.port1.onmessage = m => fromRunner(m.data);
      frame.contentWindow.postMessage({ t: 'welcome', nonce }, '*', [ch.port2]);
      ch.port1.postMessage(ACTP.out('init', init));
      while (pending.length) ch.port1.postMessage(pending.shift());
    }
    addEventListener('message', hello);
    frame.addEventListener('load', () => { if (++loads > 1 && !closed) fail('navigated'); });
    (async () => {
      const python = act && act.python;
      if (typeof python !== 'string' || !python.trim()) throw err('empty');
      if (new TextEncoder().encode(python).length > c.maxPython) throw err('size');
      if (act.sha256) { const h = await hex(new TextEncoder().encode(python)); if (h !== String(act.sha256).toLowerCase()) throw err('integrity', 'python source'); }
      const packages = act.packages == null ? [] : act.packages;
      if (!Array.isArray(packages) || packages.length > 12 || !packages.every(p => typeof p === 'string' && /^[a-z0-9_.-]{1,60}$/.test(p))) throw err('packages', 'bad packages');
      if (!available()) throw err('unavailable');
      frame.srcdoc = await runnerDoc(nonce);
      if (closed) return;
      box.append(frame);
      const man = await manifest();
      const { files, extras } = plan(man, packages);
      if (extras.length && act.requiresNetwork !== true) throw err('packages', 'an activity with extra packages must declare requiresNetwork');
      emit({ type: 'py:status', payload: { phase: 'loading', done: 0, total: files.length } });
      const bytes = await loadAll(files, d => emit({ type: 'py:status', payload: { phase: 'loading', done: d.done, total: d.total, bytes: d.bytes, totalBytes: d.totalBytes } }));
      if (closed) return;
      port.send('py:boot', { python, packages: [...new Set(packages)], extras, stepMs: Math.max(100, Math.min(+act.stepMs || c.stepMs, 10000)), initMs: c.initMs, files: bytes });
    })().catch(e => { console.warn('[noema] py-module', act && act.id, e.code || '', e.message || ''); fail(e.code || 'build'); });
    return port;
  }

  const NoemaPy = { available, prepareOffline, status, need, config, protocol: { check: pyCheck }, mountRunner: mount, _plan: plan, _manifest: manifest };
  if (typeof window !== 'undefined') window.NoemaPy = NoemaPy;
  if (typeof ACT !== 'undefined' && available()) ACT.registerRuntime({ id: 'py-module@1', version: 1, startTimeoutMs: DEFAULTS.startMs, mount });
  /* i18n-ignore-end */
})();
