/* py-module@1: the Python runner (Tier C: Python with numpy/scipy, docs/INTERACTIVE_PYTHON.md).
   The activity is Python source (act.python) with a function step(inputs, state) → outputs (a dict) and an optional init(task, seed).
   Its UI is not Python: the app draws the controls and plots from a declarative spec (runtime.ts) and calls step with py:step {inputs}
   → py:out {outputs}.
   Where it runs: <iframe sandbox="allow-scripts"> (opaque origin "null") holding only OUR runner script (allowed by its hash), which
   starts a blob: Worker with Pyodide 0.27.7. The runner has NO network at all (connect-src 'none'): the app reads the pinned files
   (sha256-checked against /vendor/pyodide/manifest.json, cached on the device by the site's service worker /sw.js, src/composition/sw.ts)
   and hands their bytes over the MessagePort; inside the worker, fetch() and importScripts() are replaced by a lookup in those bytes,
   so Pyodide, numpy, scipy and the allow-listed extra wheels (micropip, our own index only) load without a request — and nothing else
   can be loaded: the lookup is emptied once Python has started, and the policy blocks every real request.
   A step that runs longer than its budget (3 s) ends the worker: error {code:'runaway'}; py:restart (or a new mount) starts it again.
   Handshake as html-app@1 (34_activity_html.js): the runner posts hello {nonce} to the app, which hands over one MessagePort.
   Not available on file:// copies and in the one-file bundle (no service worker, no cache, no files): the descriptor's rule
   (manifests.ts availableHere 'website'), so the core shows the fallback before any code is loaded.
   The service (createPyService): available(), prepareOffline({include, onProgress, force}), status(), need(packages), protocol, config(),
   mountRunner(box, ctx). No user-visible text here: failures are codes. */
import { availableHere } from '../manifests.ts';
import type { ProtocolMessage, RuntimeHost } from '../types.ts';

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const jsize = (v: unknown): number => {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
};
const err = (code: string, message?: string): Error & { code: string } => Object.assign(new Error(message || code), { code });
const codeOf = (e: unknown): string => (isObj(e) && typeof e.code === 'string' ? e.code : '');
const hex = async (buf: BufferSource): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
const b64 = async (text: string): Promise<string> =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
const TYPES: Readonly<Record<string, string>> = {
  js: 'text/javascript',
  wasm: 'application/wasm',
  json: 'application/json',
  zip: 'application/zip',
  whl: 'application/zip',
};
const typeOf = (p: string): string => TYPES[(p.split('.').pop() || '').toLowerCase()] ?? 'application/octet-stream';

export const DEFAULTS = Object.freeze({
  base: '/vendor/pyodide/0.27.7/',
  manifest: '/vendor/pyodide/manifest.json',
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- a deployment may set it to false
  sw: '/sw.js' as string | false,
  swScope: '/',
  loader: '/vendor/pyodide/__loader.html',
  stepMs: 3000,
  initMs: 20000,
  startMs: 120000,
  maxPython: 256 * 1024,
});
export type PyConfig = { -readonly [K in keyof typeof DEFAULTS]: (typeof DEFAULTS)[K] };
const CACHE = 'noema-py-v1';
const BASE_PKGS: readonly string[] = ['numpy', 'scipy'];

/* ---------- the small protocol of this runtime (on top of noema.activity/v1, same envelope) ----------
   app → runner  py:boot {python, packages, extras, stepMs, files}   (once, after init; files: { vpath: ArrayBuffer })
                 py:step {inputs} + id          → py:out {outputs} | {error:{code, message}} + re = that id
                 py:restart {}                  → a new worker with the same files and the last saved state
   runner → app  py:status {phase: loading|starting|ready|stopped|failed, code?, message?, ms?}
                 py:out {outputs?, error?, ms?, init?}   (init: true — what init(task, seed) returned) */
const PHASES: readonly string[] = ['loading', 'starting', 'ready', 'stopped', 'failed'];
const CODE = /^[a-z0-9_.-]{1,40}$/;
const strUpTo = (v: unknown, n: number): boolean => typeof v === 'string' && v.length <= n;
const PY_IN: Readonly<Record<string, (p: Obj) => boolean>> = {
  'py:out': p =>
    (p.outputs == null || isObj(p.outputs)) &&
    (p.error == null ||
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
      (isObj(p.error) && CODE.test(String(p.error.code || '')) && (p.error.message == null || strUpTo(p.error.message, 2000)))) &&
    (p.ms == null || (typeof p.ms === 'number' && isFinite(p.ms))),
  'py:status': p =>
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
    PHASES.includes(String(p.phase)) && (p.code == null || CODE.test(String(p.code))) && (p.message == null || strUpTo(p.message, 2000)),
};
const PY_OUT: Readonly<Record<string, (p: Obj) => boolean>> = {
  'py:step': p => isObj(p.inputs),
  'py:restart': () => true,
  'py:boot': p => typeof p.python === 'string',
};
export interface PyMessage {
  readonly type: string;
  readonly id: unknown;
  readonly re: unknown;
  readonly payload: Obj;
}
export type PyCheck =
  { readonly ok: true; readonly msg: PyMessage } | { readonly ok: false; readonly why: string; readonly ignore?: boolean };
/** → { ok, msg } | { ok: false, why } — the py:* messages (both directions), like ACTP.check; limits: one message ≤ 64 KB (as ACTP) */
export function pyCheck(data: unknown, dir: 'in' | 'out' = 'in'): PyCheck {
  if (!isObj(data) || data.p !== 'noema.activity' || data.v !== 1 || typeof data.type !== 'string')
    return { ok: false, why: 'not this protocol' };
  const rules = dir === 'in' ? PY_IN : PY_OUT,
    rule = Object.prototype.hasOwnProperty.call(rules, data.type) ? rules[data.type] : undefined;
  if (!rule) return { ok: false, why: 'unknown type ' + data.type, ignore: true };
  const payload = data.payload == null ? {} : data.payload;
  if (!isObj(payload)) return { ok: false, why: 'payload is not an object' };
  if (data.type !== 'py:boot' && jsize(data) > 64 * 1024) return { ok: false, why: 'message too big' };
  if (!rule(payload)) return { ok: false, why: 'bad ' + data.type };
  return { ok: true, msg: { type: data.type, id: data.id, re: data.re, payload } };
}

/* ---------- the pinned manifest (tools/fetch_pyodide.py) ---------- */
interface Pin {
  readonly sha256?: string;
  readonly bytes?: number;
}
interface Wheel extends Pin {
  readonly file?: string;
}
interface Manifest {
  readonly format: string;
  readonly version?: string;
  readonly base: string;
  readonly wheelsBase?: string;
  readonly core: readonly string[];
  readonly files: Readonly<Record<string, Pin>>;
  readonly packages?: Readonly<Record<string, readonly string[]>>;
  readonly wheels?: Readonly<Record<string, Wheel>>;
}
interface PlanFile {
  readonly vpath: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}
export interface Progress {
  readonly file: string | null;
  readonly done: number;
  readonly total: number;
  readonly bytes: number;
  readonly totalBytes: number;
}
export interface NeedReport {
  readonly files: number;
  readonly bytes: number;
  readonly missing: number;
  readonly missingBytes: number;
  readonly extras: string[];
  readonly extrasMissing: string[];
}
export interface GroupStatus {
  files: number;
  cached: number;
  bytes: number;
  ready?: boolean;
}
export interface PyStatus {
  supported: boolean;
  sw: 'active' | 'none';
  via: 'sw' | 'page' | null;
  persisted: boolean | null;
  version: string | null;
  cachedBytes: number;
  groups: Record<string, GroupStatus>;
}
export interface PrepareResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly files: number;
  readonly bytes: number;
  readonly persisted: boolean | null;
  readonly failed: readonly { readonly file: string; readonly code: string }[];
}

/** what mountRunner gets */
export interface RunnerContext {
  readonly act: Obj | null;
  readonly init: unknown;
  readonly title?: string;
  onMessage(raw: unknown): void;
  onFail(why: string): void;
  onPy?(m: PyMessage): void;
}
/** the runner's port */
export interface RunnerPort {
  send(type: string, payload?: Obj, extra?: Obj): void;
  close(): void;
  /** → Promise<{ outputs } | { error: { code, message } }> */
  step(inputs: unknown): Promise<Obj>;
  restart(): void;
  on(type: string, f: (payload: Obj, m: PyMessage) => void): () => void;
  readonly ready: boolean;
}

/** the runner's code for the sandboxed frame and its worker (their source is these functions' text: self-contained) */
/* the worker (runs Pyodide) */
function workerMain(g: DedicatedWorkerGlobalScope & { loadPyodide?: (o: Obj) => Promise<PyodideLike> }): void {
  'use strict';
  const VB = 'https://py.noema.invalid/';
  let FILES: Record<string, ArrayBuffer> = {},
    py: PyodideLike | null = null,
    stepFn: ((s: string) => unknown) | null = null;
  const realImport = g.importScripts.bind(g);
  const TY: Record<string, string> = {
    js: 'text/javascript',
    wasm: 'application/wasm',
    json: 'application/json',
    zip: 'application/zip',
    whl: 'application/zip',
  };
  const post = (m: unknown): void => {
    g.postMessage(m);
  };
  const urlOf = (x: unknown): string =>
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
    String(x != null && typeof x === 'object' && 'url' in x ? x.url : x);
  const get = (u: string): ArrayBuffer | null => (Object.prototype.hasOwnProperty.call(FILES, u) ? (FILES[u] ?? null) : null);
  // every load of Pyodide goes through these two; after the start FILES is empty, so nothing can be loaded any more
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Pyodide calls it with its own arguments
  g.fetch = function (input: unknown, opts?: { integrity?: unknown }): Promise<Response> {
    const u = urlOf(input),
      b = get(u);
    if (!b) return Promise.reject(new TypeError('noema: ' + u.slice(0, 200) + ' cannot be loaded here'));
    const integ = opts?.integrity,
      res = (): Response =>
        new Response(b, {
          status: 200,
          headers: { 'content-type': TY[(u.split('.').pop() || '').toLowerCase()] ?? 'application/octet-stream' },
        });
    if (!integ || !(g.crypto as Crypto | undefined)?.subtle) return Promise.resolve(res());
    return crypto.subtle.digest('SHA-256', b).then(d => {
      const s = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(d))));
      if (
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
        String(integ)
          .split(/\s+/)
          .indexOf('sha256-' + s) < 0
      )
        throw new TypeError('noema: integrity ' + u);
      return res();
    });
  } as typeof fetch;
  g.importScripts = function (...args: (string | URL)[]): void {
    const urls: string[] = [];
    for (const a of args) {
      const b = get(urlOf(a));
      if (!b) throw new TypeError('noema: script cannot be loaded here');
      urls.push(URL.createObjectURL(new Blob([b], { type: 'text/javascript' })));
    }
    realImport(...urls);
  };
  const msgOf = (e: unknown): string => {
    const s = String((e instanceof Error && e.message) || e);
    const lines = s.trim().split('\n');
    return lines.slice(-6).join('\n').slice(-1500);
  };
  interface BootMsg {
    files: Record<string, ArrayBuffer>;
    packages: string[];
    extras: { name: string; file: string }[];
    api: string;
    init: unknown;
    python: string;
  }
  async function boot(m: BootMsg): Promise<void> {
    const t0 = performance.now();
    let t1 = t0,
      t2 = t0;
    try {
      for (const k in m.files) FILES[VB + k] = m.files[k] as ArrayBuffer;
      post({ k: 'status', phase: 'starting' });
      g.importScripts(VB + 'pyodide/pyodide.js');
      const load = g.loadPyodide;
      if (!load) throw new Error('no pyodide');
      const P = await load({
        indexURL: VB + 'pyodide/',
        lockFileURL: VB + 'pyodide/pyodide-lock.json',
        stdLibURL: VB + 'pyodide/python_stdlib.zip',
        packages: [],
        fullStdLib: false,
        stdout: (s: unknown) => {
          post({ k: 'log', text: String(s).slice(0, 500) });
        },
        stderr: (s: unknown) => {
          post({ k: 'log', text: String(s).slice(0, 500), err: true });
        },
      });
      py = P;
      t1 = performance.now();
      const pk: string[] = m.packages.filter(p => p === 'numpy' || p === 'scipy');
      if (m.extras.length) pk.push('micropip');
      if (pk.length)
        await P.loadPackage(pk, {
          checkIntegrity: true,
          messageCallback: () => undefined,
          errorCallback: (s: unknown) => {
            post({ k: 'log', text: String(s).slice(0, 500), err: true });
          },
        });
      if (m.extras.length) {
        P.globals.set('_noema_wheels', P.toPy(m.extras.map(x => VB + 'pywheels/' + x.file)));
        await P.runPythonAsync(
          'import micropip\nawait micropip.install(list(_noema_wheels), deps=False)\ntry:\n    micropip.set_index_urls(["' +
            VB +
            'pywheels/simple/{package_name}/"])\nexcept Exception:\n    pass\ndel _noema_wheels',
        );
      }
      t2 = performance.now();
      FILES = {}; // from here on nothing can be loaded: not our files, not any other
      P.registerJsModule('_noema_bridge', {
        send: (type: unknown, json: unknown) => {
          post({ k: 'send', type: String(type), payload: JSON.parse(String(json)) as unknown });
        },
      });
      P.runPython(m.api, { filename: 'noema.py' });
      (P.globals.get('_noema_setup') as (s: string) => unknown)(JSON.stringify(m.init));
      stepFn = P.globals.get('_noema_step') as (s: string) => unknown;
      post({ k: 'user' }); // the author's code starts: the runner's budget runs from here
      const r = (P.globals.get('_noema_run') as (s: string) => unknown)(m.python);
      post({
        k: 'ready',
        ms: { start: Math.round(t1 - t0), packages: Math.round(t2 - t1), user: Math.round(performance.now() - t2) },
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
        outputs: r == null ? null : String(r),
      });
    } catch (e) {
      FILES = {};
      post({ k: 'fatal', code: py ? 'python' : 'py-start', message: msgOf(e) });
    }
  }
  g.onmessage = (e: MessageEvent) => {
    const m = (e.data || {}) as { k?: string; id?: unknown; inputs?: unknown; locale?: unknown; strings?: unknown };
    if (m.k === 'boot') {
      void boot(m as unknown as BootMsg);
      return;
    }
    if (m.k === 'step') {
      const t = performance.now();
      try {
        const s = (stepFn as (s: string) => unknown)(String(m.inputs));
        post({ k: 'out', id: m.id, outputs: String(s), ms: Math.round(performance.now() - t) });
      } catch (x) {
        post({ k: 'out', id: m.id, error: { code: 'python', message: msgOf(x) }, ms: Math.round(performance.now() - t) });
      }
      return;
    }
    if (m.k === 'locale' && py) {
      try {
        (py.globals.get('_noema_locale') as (s: string) => unknown)(JSON.stringify({ locale: m.locale, strings: m.strings }));
      } catch {
        return; // an old activity without locale support
      }
    }
  };
}
interface PyodideLike {
  loadPackage(p: string[], o: Obj): Promise<unknown>;
  runPythonAsync(s: string): Promise<unknown>;
  runPython(s: string, o?: Obj): unknown;
  registerJsModule(name: string, m: Obj): void;
  toPy(v: unknown): unknown;
  readonly globals: { get(k: string): unknown; set(k: string, v: unknown): void };
}

/* ---------- the Python side: module noema + the step/init calls (docs/INTERACTIVE_PYTHON.md §3) ---------- */
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

/* ---------- the runner (the sandboxed frame's only script) ---------- */
function runnerMain(N: string, WSRC: string, API: string): void {
  'use strict';
  type M = Record<string, unknown>;
  const P = 'noema.activity';
  let port: MessagePort | null = null,
    init: M | null = null,
    boot: M | null = null,
    worker: Worker | null = null,
    pyReady = false,
    busy: unknown = null,
    queued: { id: unknown; inputs: unknown } | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    budget = 3000,
    initBudget = 20000,
    saved: { data: unknown; from?: unknown } | null = null,
    stopped = false;
  const SENDS: Record<string, number> = { state: 1, event: 1, result: 1, 'a11y:announce': 1, error: 1 };
  function out(type: string, payload?: unknown, extra?: M): void {
    const m: M = { p: P, v: 1, type, payload: payload || {} };
    if (extra) for (const k in extra) m[k] = extra[k];
    if (port) port.postMessage(m);
  }
  function on(e: MessageEvent): void {
    const d = e.data as M | null;
    if (e.source !== parent || !d || d.t !== 'welcome' || d.nonce !== N || !e.ports[0] || port) return;
    port = e.ports[0];
    removeEventListener('message', on, true);
    port.onmessage = msg;
    port.start();
  }
  addEventListener('message', on, true);
  function disarm(): void {
    if (timer != null) clearTimeout(timer);
    timer = null;
  }
  function arm(ms: number): void {
    disarm();
    timer = setTimeout(runaway, ms);
  }
  function kill(): void {
    disarm();
    if (worker) {
      try {
        worker.terminate();
      } catch {
        worker = null;
      }
    }
    worker = null;
    pyReady = false;
  }
  function reply(id: unknown, payload: M): void {
    if (id != null) out('py:out', payload, { re: id });
  }
  function runaway(): void {
    kill();
    stopped = true;
    out('error', { code: 'runaway', message: 'the Python code ran longer than ' + String(budget / 1000) + ' s and was stopped' });
    reply(busy, { error: { code: 'runaway', message: 'stopped after ' + String(budget) + ' ms' } });
    busy = null;
    if (queued) {
      reply(queued.id, { error: { code: 'runaway', message: 'stopped' } });
      queued = null;
    }
    out('py:status', { phase: 'stopped', code: 'runaway' });
  }
  function dispatch(): void {
    if (!pyReady || busy != null || !queued || !worker) return;
    const q = queued;
    queued = null;
    busy = q.id == null ? '' : q.id;
    worker.postMessage({ k: 'step', id: q.id, inputs: JSON.stringify(q.inputs) });
    arm(budget);
  }
  function start(): void {
    if (!init || !boot || worker) return;
    stopped = false;
    pyReady = false;
    let w: Worker;
    try {
      w = new Worker(URL.createObjectURL(new Blob([WSRC], { type: 'text/javascript' })));
    } catch (x) {
      out('py:status', { phase: 'failed', code: 'worker', message: String((x instanceof Error && x.message) || x).slice(0, 300) });
      return;
    }
    worker = w;
    w.onmessage = fromWorker;
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      out('py:status', { phase: 'failed', code: 'py-start', message: (e.message || 'worker error').slice(0, 300) });
      kill();
    };
    w.postMessage({
      k: 'boot',
      files: boot.files,
      python: boot.python,
      packages: boot.packages,
      extras: boot.extras,
      api: API,
      init: {
        task: init.task || {},
        seed: Number(init.seed) >>> 0,
        locale: init.locale,
        strings: init.strings || {},
        exerciseId: init.exerciseId || null,
        stateVersion: init.stateVersion || 1,
        state: saved ? saved.data : null,
        stateFrom: saved ? saved.from || null : null,
      },
    });
  }
  function fromWorker(e: MessageEvent): void {
    const m = (e.data || {}) as M;
    if (m.k === 'status') {
      out('py:status', { phase: m.phase });
      return;
    }
    if (m.k === 'user') {
      arm(initBudget); // the top-level code (imports: scipy.signal alone takes seconds) and init(task, seed)
      return;
    }
    if (m.k === 'ready') {
      disarm();
      pyReady = true;
      const ms = (m.ms || {}) as Record<string, number>;
      out('py:status', { phase: 'ready', ms: (ms.start || 0) + (ms.packages || 0) + (ms.user || 0), timing: m.ms });
      if (typeof m.outputs === 'string' && m.outputs) {
        let o: unknown = null,
          parsed = true;
        try {
          o = JSON.parse(m.outputs);
        } catch {
          parsed = false; // init's outputs are optional
        }
        if (parsed && m.outputs.length <= 60000) out('py:out', { outputs: o, init: true });
      }
      dispatch();
      return;
    }
    if (m.k === 'send') {
      const type = String(m.type);
      if (!SENDS[type]) return;
      if (type === 'state') saved = { data: (m.payload as M | null)?.data };
      out(type, m.payload);
      return;
    }
    if (m.k === 'out') {
      disarm();
      const id = busy;
      busy = null;
      const p: M = { ms: m.ms };
      const er = m.error as M | undefined;
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
      if (er) p.error = { code: String(er.code || 'python').slice(0, 40), message: String(er.message || '').slice(0, 1500) };
      else if (String(m.outputs).length > 60000)
        p.error = { code: 'too-big', message: 'step() returned ' + String(String(m.outputs).length) + ' bytes (at most 60000)' };
      else {
        try {
          p.outputs = JSON.parse(String(m.outputs)) as unknown;
        } catch {
          p.error = { code: 'python', message: 'bad outputs' };
        }
      }
      reply(id === '' ? null : id, p);
      dispatch();
      return;
    }
    if (m.k === 'fatal') {
      kill();
      out('py:status', {
        phase: 'failed',
        code: m.code === 'python' ? 'python' : 'py-start',
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
        message: String(m.message || '').slice(0, 1500),
      });
      return;
    }
    if (m.k === 'log') {
      try {
        (m.err ? console.warn : console.log)('[python]', m.text);
      } catch {
        return; // no console
      }
    }
  }
  function msg(e: MessageEvent): void {
    const m = e.data as M | null;
    if (!m || m.p !== P) return;
    const p = (m.payload || {}) as M;
    switch (m.type) {
      case 'ping':
        out('pong');
        return;
      case 'init': {
        init = p;
        const st = p.state as M | null | undefined;
        saved = st ? { data: st.data, from: st.migrateFrom || null } : null;
        out('ready', { protocols: [1], wants: ['py:step'] });
        out('py:status', { phase: 'loading' });
        start();
        return;
      }
      case 'py:boot':
        boot = p;
        budget = Math.max(100, Math.min(Number(p.stepMs) || 3000, 30000));
        initBudget = Math.max(budget, Math.min(Number(p.initMs) || 20000, 60000));
        start();
        return;
      case 'py:step':
        if (stopped || typeof p.inputs !== 'object') {
          reply(m.id, { error: { code: stopped ? 'stopped' : 'bad-inputs' } });
          return;
        }
        if (queued) reply(queued.id, { error: { code: 'superseded' } });
        queued = { id: m.id == null ? null : m.id, inputs: p.inputs };
        dispatch();
        return;
      case 'py:restart':
        kill();
        busy = null;
        if (queued) {
          reply(queued.id, { error: { code: 'superseded' } });
          queued = null;
        }
        start();
        return;
      case 'locale':
        if (init) {
          init.locale = p.locale;
          init.strings = p.strings || init.strings;
        }
        if (worker) worker.postMessage({ k: 'locale', locale: p.locale, strings: p.strings || init?.strings });
        return;
      case 'destroy':
        kill();
        return;
    }
  }
  parent.postMessage({ t: 'hello', nonce: N }, '*');
}

const CSP = (hash: string): string =>
  [
    "default-src 'none'",
    `script-src 'sha256-${hash}' blob: 'wasm-unsafe-eval'`,
    'worker-src blob:',
    'child-src blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "img-src 'none'",
    "style-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "manifest-src 'none'",
  ].join('; ');
const ALLOW = [
  'accelerometer',
  'autoplay',
  'camera',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'usb',
  'web-share',
  'xr-spatial-tracking',
]
  .map(f => f + " 'none'")
  .join('; ');
async function runnerDoc(nonce: string): Promise<string> {
  const js =
    `(${runnerMain.toString()})(${JSON.stringify(nonce)}, ${JSON.stringify('(' + workerMain.toString() + ')(self);')}, ${JSON.stringify(NOEMA_PY)});`.replace(
      /<\/(script)/gi,
      '<\\/$1',
    );
  const csp = CSP(await b64(js)).replace(/"/g, '&quot;'); // the hash of exactly the text the frame runs
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>${js}</script></head><body></body></html>`;
}

/** the Python service of one host: the files (service worker, cache), the runner. host: the deployment's py settings
    (NOEMA_CONFIG.py) and the protocol's envelope */
export function createPyService(host: Pick<RuntimeHost, 'config' | 'message' | 'warn'>) {
  const config = (): PyConfig => {
    const c = host.config('py');
    return Object.assign({}, DEFAULTS, isObj(c) ? c : {});
  };
  const available = (): boolean => availableHere('website', globalThis);
  let swP: Promise<ServiceWorkerRegistration | null> | null = null,
    loaderEl: HTMLIFrameElement | null = null,
    loaderP: Promise<HTMLIFrameElement | null> | null = null,
    loaderNo = 0,
    manP: Promise<Manifest> | null = null,
    via: 'sw' | 'page' | null = null; // how the last file was read
  /** the registration of the site's service worker (/sw.js, the same one build/pwa.js registers; it pins the files of
      /vendor/pyodide/manifest.json) with an active worker, or null (unsupported, refused, NOEMA_CONFIG.py.sw === false) */
  function sw(): Promise<ServiceWorkerRegistration | null> {
    if (swP) return swP;
    return (swP = (async () => {
      const c = config(),
        swc = (navigator as Partial<Navigator>).serviceWorker;
      if (c.sw === false || !swc) return null;
      try {
        const reg = await swc.register(c.sw, { scope: c.swScope });
        if (!reg.active) {
          const w = reg.installing || reg.waiting;
          if (w)
            await new Promise<void>(res => {
              const t = setTimeout(res, 10000);
              w.addEventListener('statechange', () => {
                if (w.state === 'activated' || w.state === 'redundant') {
                  clearTimeout(t);
                  res();
                }
              });
            });
        }
        return reg.active ? reg : null;
      } catch (e) {
        host.warn('[noema] python: no service worker —', e instanceof Error ? e.message : e);
        return null;
      }
    })());
  }
  /** a hidden same-origin page in the worker's scope (served by the worker itself, no scripts can run in it): its fetch() goes
      through the service worker. null → the page reads the cache itself (the same cache, the same checks). */
  function loader(): Promise<HTMLIFrameElement | null> {
    if (loaderEl?.isConnected) return Promise.resolve(loaderEl);
    if (loaderP) return loaderP;
    if (Date.now() - loaderNo < 60000) return Promise.resolve(null); // it just failed: the page's cache for a while
    return (loaderP = (async () => {
      const reg = await sw();
      if (!reg) return null;
      const f = document.createElement('iframe');
      f.src = config().loader;
      f.title = 'noema python files';
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.display = 'none';
      await new Promise(res => {
        f.addEventListener('load', res, { once: true });
        setTimeout(res, 5000);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a page may have no body yet
        (document.body || document.documentElement).append(f);
      });
      let ok = false;
      try {
        const w = f.contentWindow;
        ok = !!w?.navigator.serviceWorker.controller && typeof w.fetch === 'function' && f.contentDocument?.title === 'noema python files';
      } catch {
        ok = false;
      }
      if (!ok) {
        f.remove();
        loaderNo = Date.now();
        return null;
      }
      return (loaderEl = f);
    })().finally(() => {
      loaderP = null;
    }));
  }
  async function cache(): Promise<Cache | null> {
    try {
      return await caches.open(CACHE);
    } catch {
      return null;
    }
  }
  /** the bytes of one pinned file, checked: the service worker (cache first) or, without it, the page's own cache */
  async function getFile(path: string, sha256: string): Promise<ArrayBuffer> {
    const url = new URL(path, location.origin).href,
      f = await loader();
    let buf: ArrayBuffer;
    const w = f?.contentWindow;
    if (w) {
      let r: Response;
      try {
        r = await w.fetch(url);
      } catch {
        throw err('offline', path);
      }
      if (!r.ok)
        throw err(
          r.headers.get('x-noema-error') === 'integrity' ? 'integrity' : r.status === 504 ? 'offline' : 'fetch',
          path + ' ' + String(r.status),
        );
      buf = await r.arrayBuffer();
      via = 'sw';
    } else {
      via = 'page';
      const c = await cache(),
        hit = c && (await c.match(url));
      if (hit) buf = await hit.arrayBuffer();
      else {
        let r: Response;
        try {
          r = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
        } catch {
          throw err('offline', path);
        }
        if (!r.ok) throw err('fetch', path + ' ' + String(r.status));
        buf = await r.arrayBuffer();
        if ((await hex(buf)) !== sha256) throw err('integrity', path);
        try {
          await c?.put(url, new Response(buf.slice(0), { headers: { 'content-type': typeOf(path) } }));
        } catch {
          via = 'page'; // not kept (quota): it is read again next time
        }
        return buf;
      }
    }
    if ((await hex(buf)) !== sha256) {
      try {
        await (await cache())?.delete(url);
      } catch {
        via = 'page'; // the bad copy stays until the next check
      }
      throw err('integrity', path);
    }
    return buf;
  }
  /** the runtime manifest written by tools/fetch_pyodide.py (network first; the cached copy offline) */
  function manifest(): Promise<Manifest> {
    if (manP) return manP;
    const p = (async () => {
      const url = new URL(config().manifest, location.origin).href,
        f = await loader();
      let m: unknown = null;
      const w = f?.contentWindow;
      if (w) {
        const r = await w.fetch(url).catch(() => null);
        if (r?.ok) m = await r.json();
      } else {
        const c = await cache();
        try {
          const r = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
          if (r.ok) {
            m = await r.clone().json();
            await c?.put(url, r).catch(() => null); // not kept: read from the network next time
          }
        } catch {
          m = null; // offline: the cached copy
        }
        if (!m && c) {
          const hit = await c.match(url);
          if (hit) m = await hit.json();
        }
      }
      if (!isObj(m) || m.format !== 'noema.pyodide-manifest/v1' || !Array.isArray(m.core) || !isObj(m.files))
        throw err('offline', 'no manifest');
      return m as unknown as Manifest;
    })();
    manP = p;
    p.catch(() => {
      manP = null;
    });
    return p;
  }
  /** what an activity's packages need: [{ vpath, path, sha256, bytes }] (core first) and the extra wheels; throws 'packages' */
  function plan(man: Manifest, packages: readonly string[]): { files: PlanFile[]; extras: { name: string; file: string }[] } {
    const outF = new Map<string, PlanFile>(),
      extras: { name: string; file: string }[] = [];
    const add = (vpath: string, path: string, pin: Pin | undefined): void => {
      if (!pin || !/^[0-9a-f]{64}$/.test(pin.sha256 || '')) throw err('packages', 'not pinned: ' + path);
      outF.set(vpath, { vpath, path, sha256: pin.sha256 ?? '', bytes: pin.bytes || 0 });
    };
    const pkg = (name: string): void => {
      const files = man.packages?.[name];
      if (!Array.isArray(files)) throw err('packages', name + ' is not on this site');
      for (const f of files as readonly string[]) add('pyodide/' + f, man.base + f, man.files[f]);
    };
    for (const f of man.core) add('pyodide/' + f, man.base + f, man.files[f]);
    for (const p of packages) {
      const wh = man.wheels && Object.prototype.hasOwnProperty.call(man.wheels, p) ? man.wheels[p] : undefined;
      if (BASE_PKGS.includes(p)) pkg(p);
      else if (wh) extras.push({ name: p, file: String(wh.file) });
      else throw err('packages', p + ' is not on the allow-list');
    }
    if (extras.length) {
      pkg('micropip');
      for (const x of extras) {
        const w = man.wheels?.[x.name] ?? {};
        if (!/^[A-Za-z0-9_.-]+-py3-none-any\.whl$/.test(w.file || '')) throw err('packages', 'bad wheel ' + x.name);
        add('pywheels/' + String(w.file), String(man.wheelsBase) + String(w.file), w);
      }
    }
    return { files: [...outF.values()], extras };
  }
  async function loadAll(list: readonly PlanFile[], onProgress?: (p: Progress) => void): Promise<Record<string, ArrayBuffer>> {
    const files: Record<string, ArrayBuffer> = {},
      total = list.length,
      totalBytes = list.reduce((s, f) => s + f.bytes, 0);
    let done = 0,
      bytes = 0,
      i = 0;
    const one = async (): Promise<void> => {
      while (i < list.length) {
        const f = list[i++];
        if (!f) break;
        files[f.vpath] = await getFile(f.path, f.sha256);
        done++;
        bytes += f.bytes;
        onProgress?.({ file: f.path, done, total, bytes, totalBytes });
      }
    };
    await Promise.all([one(), one(), one()]);
    return files;
  }
  async function persist(): Promise<boolean | null> {
    try {
      const st = (navigator as Partial<Navigator>).storage;
      if (typeof st?.persist !== 'function') return null;
      if (await st.persisted()) return true;
      return await Promise.race([
        st.persist(),
        new Promise<null>(r =>
          setTimeout(() => {
            r(null);
          }, 3000),
        ),
      ]);
    } catch {
      return null;
    }
  }
  const saveData = (): boolean => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  /** Settings → "Prepare Python for offline": download and keep the core + the named packages (numpy, scipy, allow-listed extras).
      Never automatic; on a metered / save-data connection only with force. → { ok, files, bytes, persisted, failed: [{file, code}] } */
  async function prepareOffline(
    opts: { readonly include?: readonly string[]; readonly onProgress?: (p: Progress) => void; readonly force?: boolean } = {},
  ): Promise<PrepareResult> {
    const include = Array.isArray(opts.include) ? opts.include : ['numpy', 'scipy'];
    if (!available()) return { ok: false, code: 'unavailable', files: 0, bytes: 0, persisted: null, failed: [] };
    if (saveData() && !opts.force) return { ok: false, code: 'save-data', files: 0, bytes: 0, persisted: null, failed: [] };
    const persisted = await persist();
    const man = await manifest();
    const { files } = plan(man, include);
    const failed: { file: string; code: string }[] = [];
    let done = 0,
      bytes = 0;
    const emit = (d: Progress): void => {
      try {
        opts.onProgress?.(d);
      } catch (e) {
        host.warn(e);
      }
      try {
        dispatchEvent(new CustomEvent('noema-py-progress', { detail: d }));
      } catch (e) {
        host.warn(e);
      }
    };
    const sum = (): number => files.reduce((s, x) => s + x.bytes, 0);
    emit({ file: null, done: 0, total: files.length, bytes: 0, totalBytes: sum() });
    let i = 0;
    const one = async (): Promise<void> => {
      while (i < files.length) {
        const f = files[i++];
        if (!f) break;
        try {
          await getFile(f.path, f.sha256);
          bytes += f.bytes;
        } catch (e) {
          failed.push({ file: f.path, code: codeOf(e) || 'fetch' });
        }
        done++;
        emit({ file: f.path, done, total: files.length, bytes, totalBytes: sum() });
      }
    };
    await Promise.all([one(), one(), one()]);
    return { ok: !failed.length, files: files.length - failed.length, bytes, persisted, failed };
  }
  /** what an activity's packages need and how much of it is already on the device (the first-use note); throws when there is no
      manifest (offline, never used) */
  async function need(packages: unknown): Promise<NeedReport> {
    const man = await manifest(),
      { files, extras } = plan(man, Array.isArray(packages) ? (packages as string[]) : []);
    const c = await cache(),
      have = new Set(c ? (await c.keys()).map(r => new URL(r.url).pathname) : []);
    const miss = files.filter(f => !have.has(new URL(f.path, location.origin).pathname));
    const sum = (l: readonly PlanFile[]): number => l.reduce((n, f) => n + (f.bytes || 0), 0);
    return {
      files: files.length,
      bytes: sum(files),
      missing: miss.length,
      missingBytes: sum(miss),
      extras: extras.map(x => x.name),
      extrasMissing: extras.filter(x => miss.some(f => f.vpath === 'pywheels/' + String(man.wheels?.[x.name]?.file))).map(x => x.name),
    };
  }
  /** what is on the device */
  async function status(): Promise<PyStatus> {
    const out: PyStatus = { supported: available(), sw: 'none', via, persisted: null, version: null, cachedBytes: 0, groups: {} };
    if (!out.supported) return out;
    try {
      const st = (navigator as Partial<Navigator>).storage;
      out.persisted = typeof st?.persisted === 'function' ? await st.persisted() : null;
    } catch {
      out.persisted = null;
    }
    try {
      const reg = await (navigator as Partial<Navigator>).serviceWorker?.getRegistration(config().swScope);
      out.sw = reg?.active ? 'active' : 'none';
    } catch {
      out.sw = 'none';
    }
    let man: Manifest;
    try {
      man = await manifest();
    } catch {
      return out;
    }
    out.version = man.version ?? null;
    const c = await cache(),
      have = new Set(c ? (await c.keys()).map(r => new URL(r.url).pathname) : []);
    const group = (name: string, list: readonly (readonly [string, Pin | undefined])[]): void => {
      const g: GroupStatus = { files: list.length, cached: 0, bytes: 0 };
      for (const [p, pin] of list) {
        g.bytes += pin?.bytes || 0;
        if (have.has(p)) {
          g.cached++;
          out.cachedBytes += pin?.bytes || 0;
        }
      }
      g.ready = g.cached === g.files;
      out.groups[name] = g;
    };
    group(
      'core',
      man.core.map(f => [man.base + f, man.files[f]] as const),
    );
    for (const [n, files] of Object.entries(man.packages || {}))
      group(
        n,
        files.map(f => [man.base + f, man.files[f]] as const),
      );
    for (const [n, w] of Object.entries(man.wheels || {})) group(n, [[String(man.wheelsBase) + String(w.file), w]]);
    return out;
  }

  /** the runner in a hidden sandboxed frame: computes; the app renders (runtime.ts) */
  function mountRunner(box: HTMLElement, ctx: RunnerContext): RunnerPort {
    const { act, init, title } = ctx,
      onMessage = (raw: unknown): void => {
        ctx.onMessage(raw);
      },
      onFail = (why: string): void => {
        ctx.onFail(why);
      },
      onPy = ctx.onPy ? (m: PyMessage): void => ctx.onPy?.(m) : undefined;
    const c = config();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts'); // exactly this token: never allow-same-origin
    frame.setAttribute('allow', ALLOW);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', title || 'python');
    frame.setAttribute('aria-hidden', 'true'); // the runner shows nothing: the app draws the activity's controls
    frame.className = 'act-frame act-pyrunner';
    frame.style.cssText = 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    let ch: MessageChannel | null = null,
      closed = false,
      failed = false,
      loads = 0,
      seq = 0,
      pyReady = false;
    const pending: ProtocolMessage[] = [],
      waits: Record<string, (r: Obj) => void> = {},
      L: Record<string, ((payload: Obj, m: PyMessage) => void)[]> = {};
    const emit = (m: PyMessage): void => {
      for (const f of (L[m.type] || []).slice())
        try {
          f(m.payload, m);
        } catch (e) {
          console.error(e);
        }
      for (const f of (L['*'] || []).slice())
        try {
          f(m.payload, m);
        } catch (e) {
          console.error(e);
        }
    };
    const settle = (code: string): void => {
      for (const id of Object.keys(waits)) {
        waits[id]?.({ error: { code } });
        Reflect.deleteProperty(waits, id);
      }
    };
    const fail = (why: string): void => {
      if (closed || failed) return;
      failed = true;
      clearTimeout(startT);
      settle(why);
      onFail(why);
    };
    const startT = setTimeout(() => {
      if (!pyReady) fail('timeout');
    }, c.startMs);
    const port: RunnerPort = {
      send(type, payload, extra) {
        const m = host.message(type, payload, extra);
        if (closed) return;
        if (ch) ch.port1.postMessage(m);
        else pending.push(m);
      },
      close() {
        closed = true;
        clearTimeout(startT);
        removeEventListener('message', hello);
        try {
          ch?.port1.close();
        } catch {
          ch = null;
        }
        frame.remove();
        settle('closed');
      },
      step(inputs) {
        return new Promise(res => {
          if (closed || failed) {
            res({ error: { code: 'closed' } });
            return;
          }
          const id = 'py' + String(++seq);
          waits[id] = res;
          port.send('py:step', { inputs: inputs || {} }, { id });
        });
      },
      restart() {
        pyReady = false;
        port.send('py:restart', {});
      },
      on(type, f) {
        (L[type] = L[type] || []).push(f);
        return () => {
          L[type] = (L[type] || []).filter(x => x !== f);
        };
      },
      get ready() {
        return pyReady;
      },
    };
    function fromRunner(raw: unknown): void {
      if (closed) return;
      if (isObj(raw) && typeof raw.type === 'string' && raw.type.startsWith('py:')) {
        const r = pyCheck(raw, 'in');
        if (!r.ok) {
          host.warn('[noema] python runner:', r.why);
          return;
        }
        const m = r.msg;
        if (m.type === 'py:status') {
          if (m.payload.phase === 'ready') {
            pyReady = true;
            clearTimeout(startT);
          }
          if (m.payload.phase === 'stopped') pyReady = false;
          if (m.payload.phase === 'failed') {
            host.warn('[noema] python:', m.payload.code, m.payload.message || '');
            fail(typeof m.payload.code === 'string' && m.payload.code ? m.payload.code : 'python');
          }
        }
        const re = typeof m.re === 'string' ? m.re : null;
        const w = re != null ? waits[re] : undefined;
        if (m.type === 'py:out' && re != null && w) {
          Reflect.deleteProperty(waits, re);
          w(m.payload);
        }
        emit(m);
        try {
          onPy?.(m);
        } catch (e) {
          console.error(e);
        }
      }
      onMessage(raw); // the core checks everything with ACTP (py:* are not its types: ignored there, never a strike)
    }
    function hello(e: MessageEvent): void {
      if (closed || ch || e.source !== frame.contentWindow) return;
      const d = e.data as Obj | null;
      if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
      removeEventListener('message', hello);
      const mc = new MessageChannel();
      ch = mc;
      mc.port1.onmessage = (m: MessageEvent) => {
        fromRunner(m.data);
      };
      frame.contentWindow?.postMessage({ t: 'welcome', nonce }, '*', [mc.port2]);
      mc.port1.postMessage(host.message('init', isObj(init) ? init : {}));
      while (pending.length) mc.port1.postMessage(pending.shift());
    }
    addEventListener('message', hello);
    frame.addEventListener('load', () => {
      if (++loads > 1 && !closed) fail('navigated');
    });
    (async () => {
      const python = act?.python;
      if (typeof python !== 'string' || !python.trim()) throw err('empty');
      if (new TextEncoder().encode(python).length > c.maxPython) throw err('size');
      if (act?.sha256) {
        const h = await hex(new TextEncoder().encode(python));
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a value of the wire, of unknown kind: String() renders it as the old runner did
        if (h !== String(act.sha256).toLowerCase()) throw err('integrity', 'python source');
      }
      const packages: unknown = act?.packages == null ? [] : act.packages;
      if (
        !Array.isArray(packages) ||
        packages.length > 12 ||
        !(packages as unknown[]).every(p => typeof p === 'string' && /^[a-z0-9_.-]{1,60}$/.test(p))
      )
        throw err('packages', 'bad packages');
      const pk = packages as string[];
      if (!available()) throw err('unavailable');
      frame.srcdoc = await runnerDoc(nonce);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- close() may have run while it awaited
      if (closed) return;
      box.append(frame);
      const man = await manifest();
      const { files, extras } = plan(man, pk);
      if (extras.length && act?.requiresNetwork !== true)
        throw err('packages', 'an activity with extra packages must declare requiresNetwork');
      emit({ type: 'py:status', id: null, re: null, payload: { phase: 'loading', done: 0, total: files.length } });
      const bytes = await loadAll(files, d => {
        emit({
          type: 'py:status',
          id: null,
          re: null,
          payload: { phase: 'loading', done: d.done, total: d.total, bytes: d.bytes, totalBytes: d.totalBytes },
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- close() may have run while it awaited
      if (closed) return;
      port.send('py:boot', {
        python,
        packages: [...new Set(pk)],
        extras,
        stepMs: Math.max(100, Math.min(Number(act?.stepMs) || c.stepMs, 10000)),
        initMs: c.initMs,
        files: bytes,
      });
    })().catch((e: unknown) => {
      host.warn('[noema] py-module', act?.id, codeOf(e), e instanceof Error ? e.message : '');
      fail(codeOf(e) || 'build');
    });
    return port;
  }

  return Object.freeze({
    available,
    prepareOffline,
    status,
    need,
    config,
    protocol: Object.freeze({ check: pyCheck }),
    mountRunner,
    _plan: plan,
    _manifest: manifest,
  });
}
export type PyService = ReturnType<typeof createPyService>;
