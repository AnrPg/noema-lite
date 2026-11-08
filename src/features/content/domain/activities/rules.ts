/* noema-lite — the rules of interactive activities (docs/INTERACTIVE.md): the runtimes, the engines of sim-spec@1, their
   limits and the patterns a bundle may not contain. One list for the app, the connector and the tools (the Node bridge). */

export const FORMAT = 'noema.activities/v1';
export const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
export const KEY_RE = /^[a-z][a-zA-Z0-9_.-]{0,63}$/;
export const H5P = 'h5p@1';
export const PY = 'py-module@1';
/** P6 (docs/adr/001 D12): a precompiled WebAssembly module and an allow-listed outside page */
export const WASM = 'wasm-module@1';
export const WASM_ENGINE = 'wasm@1';
export const EMBED = 'external-embed@1';
export const RUNTIMES: ReadonlySet<string> = new Set(['html-app@1', 'sim-spec@1', PY, H5P, WASM, EMBED]);
/** runtimes that arrive in a later version of the app: {runtime: why} */
export const LATER: Readonly<Record<string, string>> = {};
export const SHA_RE = /^[0-9a-f]{64}$/;
/** h5p@1: the .h5p file travels beside the pack (docs/INTERACTIVE_H5P.md) */
export const H5P_MAX = 100 * 1024 * 1024;
export const CAPS: ReadonlySet<string> = new Set(['state', 'events', 'resize', 'result', 'hints', 'announce']);
export const GRADE_MODES: ReadonlySet<string> = new Set(['reported', 'checks']);
/** runtimes whose values the app can see (the checks grader needs them) */
export const CHECKS_RUNTIMES: ReadonlySet<string> = new Set(['sim-spec@1', PY, WASM]);
/** runtimes the app draws from a spec (py-module@1: its outputs come from Python's step()) */
export const SPEC_RUNTIMES: ReadonlySet<string> = new Set(['sim-spec@1', PY]);

/* py-module@1 (docs/INTERACTIVE_PYTHON.md): Python with numpy, scipy and the allow-listed extras (tools/pywheels_allow.json) */
export const PY_BASE = ['numpy', 'scipy'] as const;
export const PY_EXTRAS = ['quantiphy'] as const;
export const PY_MAX = 256 * 1024;
export const PY_STEP = [100, 10000] as const;
export const PY_PACKAGES_MAX = 12;
export const PY_BANNED: readonly (readonly [RegExp, string])[] = [
  [
    /^\s*(?:import\s+js\b|from\s+js\s+import\b|import\s+pyodide_js\b|from\s+pyodide_js\b)/m,
    'the browser (js, pyodide_js): Python has no page and no network here; return values from step()',
  ],
  [
    /\bpyodide\.http\b|\bpyfetch\b|\bopen_url\b|^\s*(?:import|from)\s+(?:urllib|requests|http\.client|socket|ssl)\b/m,
    'a network call: a Python activity has no network',
  ],
  [/^\s*(?:import|from)\s+micropip\b/m, 'micropip: list the package in "packages" instead (only the allow-listed ones)'],
  [/(?:^|[^A-Za-z0-9_.])input\s*\(/m, 'input(): there is no console; the learner uses the controls of the spec'],
];
export const PY_WARN: readonly (readonly [RegExp, string])[] = [
  [/^\s*while\s+True\s*:/m, 'while True: each step() has a budget (stepMs, 3 s by default) and is stopped after it'],
  [/\btime\.sleep\s*\(/, 'time.sleep(): a step blocks the learner while it sleeps; return at once'],
];

/* sim-spec@1 (docs/INTERACTIVE.md §12) */
export const SPEC_FORMAT = 'noema.sim-spec/v1';
export const DEFAULT_ENGINE = 'formula@1';
export const CIRCUIT = 'circuit-mna@1';
export const TWIN = 'twin@1';
/** the P6 engines (docs/INTERACTIVE_ENGINES.md): each checks its model with its own checkSpec (src/engines/<file>) */
export const P6: Readonly<Record<string, string>> = {
  'thermal@1': 'thermal/thermal.js',
  'pid@1': 'pid/pid.js',
  'rf@1': 'rf/rf.js',
  'twin@1': 'twin/twin.js',
};
/** the engine library (docs/INTERACTIVE_LIBRARY.md): general engines on one core; each checks its model with its own checkSpec and
    lists the expressions (exprs) and string keys (keys) of its model */
export const LIB: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'ode',
    'prob',
    'graph',
    'geom',
    'genetics',
    'seq',
    'med',
    'clinic',
    'anatomy',
    'timeline',
    'music',
    'map',
    'text',
    'craft',
    'logic',
    'rhetoric',
    'philo',
    'des',
    'field',
    'agents',
    'law',
  ].map(n => [`${n}@1`, `${n}/${n}.js`]),
);
export const ENGINES: ReadonlySet<string> = new Set(['formula@1', CIRCUIT, ...Object.keys(P6), ...Object.keys(LIB), WASM_ENGINE]);
export const isLib = (eng: unknown): eng is string => typeof eng === 'string' && Object.prototype.hasOwnProperty.call(LIB, eng);
export const isP6 = (eng: unknown): eng is string => typeof eng === 'string' && Object.prototype.hasOwnProperty.call(P6, eng);
export const SPEC_KEYS: ReadonlySet<string> = new Set([
  'format',
  'engine',
  'model',
  'title',
  'intro',
  'consts',
  'params',
  'derived',
  'outputs',
  'readouts',
  'plots',
  'bench',
  'parts',
  'couple',
]);
export const BENCH_ENGINES: ReadonlySet<string> = new Set([CIRCUIT, TWIN]);
export const BENCH_NAMES = ['diagnosis', 'measurements', 'correct'] as const;
export const LIB_KINDS = ['scalar', 'series', 'scene', 'sound'] as const;
export const LINE_STYLES = ['line', 'bars', 'steps', 'points'] as const;
/** html-app@1: the engines of the library a mini-app may use ("engines": [...], docs/INTERACTIVE.md §8.1) */
export const APP_ENGINES_MAX = 8;
/** engines whose model.transient times and outputs' at may be expressions */
export const P6_TIMED = ['thermal@1', 'pid@1'] as const;
/* twin@1's bench: the probe points of the device and its instruments */
export const TWIN_POINTS = ['vbat', 'vload', 'i', 'gnd'] as const;
export const TWIN_INSTRUMENTS = ['V', 'I', 'scope', 'log', 'rssi', 'T', 'clock'] as const;
export const WHOLE = ['log', 'rssi', 'T', 'clock'] as const;
export const MODEL_KEYS = ['netlist', 'bindings', 'transient', 'noise', 'ac'] as const;
export const OUT_KEYS = ['id', 'kind', 'node', 'branch', 'time', 'probe', 'at', 'stat', 'power', 'ac', 'ref'] as const;
export const STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'] as const;
/* the AC analysis (docs/INTERACTIVE_CIRCUIT.md §9.6) and the meters' modes (§9.5) */
export const AC_CURVES = ['f', 'db', 'phase', 'mag'] as const;
export const AC_POINT = ['db', 'phase', 'mag'] as const;
export const AC_STATS = ['dcDb', 'peakDb', 'fPeak', 'f3db', 'fLow3db', 'fUnity', 'pm'] as const;
export const MODES = ['dc', 'ac', 'rms', 'avg'] as const;
export const WAVES: Readonly<Record<string, readonly string[]>> = {
  pulse: ['v1', 'v2', 'delay', 'rise', 'fall', 'width', 'period'],
  sine: ['offset', 'amp', 'freq', 'phase', 'delay'],
  pwm: ['v', 'freq', 'duty', 'low', 'delay'],
};
export const BENCH_KEYS = ['faults', 'points', 'instruments', 'diagnosis', 'budget'] as const;
export const INSTRUMENTS = ['V', 'I', 'R', 'scope', 'logic', 'bode'] as const;
export const INST_KEYS = [
  'kind',
  'points',
  'parts',
  'tEnd',
  'dt',
  'tStart',
  'threshold',
  'modes',
  'zin',
  'leads',
  'source',
  'fStart',
  'fStop',
  'fPoints',
] as const;
export const BENCH_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const BENCH_LIM = {
  faults: 16,
  apply: 4,
  points: 24,
  instruments: 7,
  parts: 24,
  options: 12,
  budget: 100,
  bindings: 24,
  steps: 200000,
  leads: 4,
  acPoints: 1000,
} as const;
export const SPEC_LIM = {
  params: 24,
  consts: 24,
  derived: 48,
  outputs: 24,
  readouts: 24,
  plots: 6,
  series: 6,
  marks: 8,
  points: 2000,
  options: 12,
  checks: 16,
  bytes: 64 * 1024,
  unit: 16,
  digits: 8,
} as const;
export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
export const PARAM_KINDS = ['slider', 'number', 'toggle', 'choice'] as const;
export const NUM_FORMATS = ['auto', 'si', 'fixed'] as const;
/* parts: several engines in one spec (docs/INTERACTIVE.md §12.8) */
export const PARTS_LIM = { parts: 8, inputs: 24, outputs: 48, loops: 4, iter: 50, macro: 5000, points: 2000 } as const;
export const PART_KEYS = ['id', 'engine', 'model', 'outputs', 'inputs', 'use', 'with'] as const;
export const USE_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
/** the engines that can be stepped in time (a stepper: docs/INTERACTIVE_LIBRARY.md §1.6) */
export const STEPPERS: ReadonlySet<string> = new Set([
  'ode@1',
  'med@1',
  'clinic@1',
  'genetics@1',
  'des@1',
  'field@1',
  'agents@1',
  'thermal@1',
  'pid@1',
  'twin@1',
  'circuit-mna@1',
]);

/* html-app@1 */
export const HTML_MAX = 512 * 1024;
export const HTML_WARN = 256 * 1024;
export const FALLBACK_MIN = 40;
export const HINTS_MAX = 6;
export const BANNED: readonly (readonly [RegExp, string])[] = [
  [/<script[^>]*\bsrc\s*=/i, 'an external script (<script src>): put every script inline'],
  [
    /(?:\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\/)/i,
    'a link to the network (src/href to http(s):// or //): put everything inline (data: URIs)',
  ],
  [/url\(\s*["']?\s*(?:https?:)?\/\//i, 'a CSS url() to the network: use data: URIs'],
  [/@import\b/i, 'a CSS @import: put every style inline'],
  [/<[a-z][^>]*\son[a-z]+\s*=/i, 'an inline event handler (onclick=…): use addEventListener in a script'],
  [/javascript:/i, 'a javascript: URL'],
  [
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/i,
    'a network call (fetch, XHR, WebSocket, EventSource, sendBeacon): an activity has no network',
  ],
  [/\bimportScripts\b|\bnew\s+(?:Shared)?Worker\b/i, 'a worker: an html-app has none (numerical work goes to a later runtime)'],
  [
    /\beval\s*\(|\bnew\s+Function\b|\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/i,
    'code made from text (eval, new Function, setTimeout("…"))',
  ],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/i, 'browser storage: save with noema.saveState(…)'],
  [
    /\bwindow\.open\b|\bwindow\.top\b|\btop\.location\b|\bparent\.|\bopener\b/i,
    'a popup or the page around the frame: an activity stays in its frame',
  ],
  [/\bpostMessage\s*\(/i, 'raw postMessage: talk to the app through window.noema'],
  [/allow-same-origin/i, 'allow-same-origin: never'],
  [/<meta[^>]+http-equiv/i, 'a <meta http-equiv>: the app sets the policy'],
  [/<base\b/i, 'a <base> element'],
  [/<(?:iframe|frame|object|embed|form)\b/i, 'a frame, object, embed or form: not available in an activity'],
];
export const WARN: readonly (readonly [RegExp, string])[] = [
  [
    /while\s*\(\s*(?:true|1|!0)\s*\)/i,
    'while (true): every loop is stopped after 1.5 s without a pause; use requestAnimationFrame or setTimeout for a loop that never ends',
  ],
  [/setInterval\s*\([^,]+,\s*0\s*\)/i, 'setInterval(…, 0): use requestAnimationFrame'],
  [/new\s+Array\s*\(\s*\d{7,}/i, 'a huge array'],
];

/** the rules as one object (what the app's old ACTIVITY_RULES gave, and `noema-tools rules` prints) */
export const ACTIVITY_RULES = {
  FORMAT,
  ID_RE,
  KEY_RE,
  RUNTIMES,
  LATER,
  H5P,
  SHA_RE,
  H5P_MAX,
  CAPS,
  GRADE_MODES,
  CHECKS_RUNTIMES,
  SPEC_RUNTIMES,
  PY,
  PY_BASE,
  PY_EXTRAS,
  PY_MAX,
  PY_STEP,
  PY_PACKAGES_MAX,
  SPEC_FORMAT,
  DEFAULT_ENGINE,
  ENGINES,
  SPEC_KEYS,
  CIRCUIT,
  BENCH_ENGINES,
  BENCH_NAMES,
  P6,
  LIB,
  LIB_KINDS,
  LINE_STYLES,
  APP_ENGINES_MAX,
  TWIN,
  STEPPERS,
  SPEC_LIM,
  BENCH_LIM,
  PARTS_LIM,
  HTML_MAX,
  HTML_WARN,
  FALLBACK_MIN,
  HINTS_MAX,
  WASM,
  WASM_ENGINE,
  EMBED,
} as const;
