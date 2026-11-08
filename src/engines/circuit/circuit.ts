/* ===================== interactive activities — the circuit engine circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md, docs/adr/001 P3) =====================
   A small, deterministic circuit simulator for the electronics benches of tier B (sim-spec@1): RC/RLC transients, filters, PWM and
   fault-finding benches (a virtual device with a hidden fault; the learner measures, then diagnoses). Pure JS, no DOM, no text for the
   learner: it gives codes and numbers only, the activity host words them.
   Also: AC small-signal analysis (Bode), lossless transmission lines, op-amp gain-bandwidth / slew / offset / output resistance, device
   capacitances, Zener/TVS breakdown, a voltage-controlled switch, mains pickup on floating nodes, meters with input resistance and
   DC / AC / true-RMS / average-responding modes, scope probes with a ground lead, switching power (§9 of the doc).
   How: Modified Nodal Analysis (node voltages + the currents of voltage-defined branches), a dense LU with partial pivoting (circuits
   are small: at most 60 nodes), Newton–Raphson with junction limiting, gmin stepping and source stepping for the nonlinear parts,
   trapezoidal integration with a backward-Euler step at the start and on every step that holds a source discontinuity.
   The netlist (noema.circuit/v1) is described in docs/INTERACTIVE_CIRCUIT.md and src/contracts/schemas/noema.circuit.v1.schema.json.
   Also used by tests/circuit.js (node). */
import NoemaSimKit from '../kernel/simkit.ts';
/* i18n-ignore-start */ // code, not text: only codes and numbers leave this engine
type Rec = Readonly<Record<string, unknown>>;
type Emit = (code: string, path: string, msg: string) => void;
/** a problem of a netlist or of its faults (the same shape as the library's) */
interface Prob {
  code: string;
  path: string;
  msg: string;
  level: 'error' | 'warning';
}
/** an error of the engine with its code (and the fields of the failure) */
type Fail = Error & { code: string } & Record<string, unknown>;
/** the time shift of the noise sources (each capture of a noisy board sees another stretch of it) */
interface Hold {
  shift: number;
}
/** a source's waveform in its canonical form: numbers parsed, defaults filled */
interface Wave {
  kind: string;
  dc?: number;
  v1?: number;
  v2?: number;
  delay?: number;
  rise?: number;
  fall?: number;
  width?: number;
  period?: number;
  offset?: number;
  amp?: number;
  freq?: number;
  phase?: number;
  v?: number;
  duty?: number;
  low?: number;
  rms?: number;
  bw?: number;
  seed?: number;
  hum?: number;
  humAmp?: number;
  wander?: number;
  hold?: Hold;
  pickup?: boolean;
}
interface WaveFn {
  at(t: number): number;
  readonly avg: number;
  readonly at0m: number;
  next(t: number): number;
  readonly noise?: boolean;
}
/* the netlist (noema.circuit/v1) as check() leaves it */
interface NetNode {
  readonly name: string;
  readonly probe?: string;
  readonly pickup?: boolean;
}
interface NetEl {
  id: string;
  type: string;
  n: string[];
  value?: unknown;
  ic?: unknown;
  params?: Rec;
  preset?: string;
  on?: boolean;
}
interface Netlist {
  readonly nodes: readonly (string | NetNode)[];
  readonly elements: NetEl[];
  readonly pickup?: unknown;
}
interface Fault {
  readonly kind?: string;
  readonly element?: string;
  readonly pin?: number;
  readonly pins?: unknown;
  readonly factor?: unknown;
  readonly param?: string;
  readonly node?: string;
  readonly side?: unknown;
  readonly add?: unknown;
}
/** the parameters of an element (normalized: numbers; a source's value its waveform) */
interface ElP {
  value?: number | Wave;
  ic?: number;
  rails?: number[];
  body?: boolean;
  Is?: number;
  n?: number;
  Ron?: number;
  Roff?: number;
  betaF?: number;
  betaR?: number;
  Vth?: number;
  k?: number;
  lambda?: number;
  gain?: number;
  headroom?: number;
  Cj?: number;
  Bv?: number;
  Ibv?: number;
  Cbe?: number;
  Cbc?: number;
  Cgs?: number;
  Cgd?: number;
  Cds?: number;
  gbw?: number;
  slew?: number;
  rout?: number;
  vos?: number;
  ib?: number;
  z0?: number;
  td?: number;
  len?: number;
  vf?: number;
  Von?: number;
  Voff?: number;
}
/** a compiled element: its pins indexed and the fields its model uses */
interface El {
  id: string;
  type: string;
  n: string[];
  p: ElP;
  on?: boolean;
  board: string[];
  pins: number[];
  boardPins: number[];
  k: number;
  a: number;
  c: number;
  d: number;
  g?: number;
  C?: number;
  L?: number;
  ic?: number | null;
  w?: WaveFn;
  wk?: string;
  per?: number;
  Is?: number;
  nvt?: number;
  vcrit?: number;
  vcritb?: number;
  s?: { v?: number; vbe?: number; vbc?: number };
  bv?: number;
  ibv?: number;
  pol?: number;
  bf?: number;
  br?: number;
  vth?: number;
  kp?: number;
  lam?: number;
  A?: number;
  lo?: number;
  hi?: number;
  head?: number;
  rp?: number | null;
  rn?: number | null;
  vos?: number;
  ib?: number;
  y?: number;
  yName?: string;
  outName?: string;
  gm?: number;
  imax?: number;
  cp?: number;
  z0?: number;
  td?: number;
  tl?: [number, number, number, number];
  cn?: number;
  lgon?: number;
  lgoff?: number;
  von?: number;
  voff?: number;
  vp?: number;
  ip?: number;
  h?: number[][];
  E1?: number;
  E2?: number;
}
/** a probe's own part (a meter's input resistance, a scope probe's capacitance and lead) */
interface Extra {
  readonly type: string;
  readonly n: readonly string[];
  readonly value: unknown;
}
interface CompileOpts {
  readonly ver?: number;
  readonly seed?: number;
  readonly hold?: Hold;
  readonly extras?: readonly Extra[];
  readonly noPickup?: boolean;
}
/** the device equations' results (bjt, mos) */
interface Q {
  ibe: number;
  gbe: number;
  ibc: number;
  gbc: number;
  ict: number;
  gmf: number;
  gmr: number;
  id: number;
  gm: number;
  gds: number;
}
/** an analysis' context: the mode (op, op0, ohm, tran), the time, the source and gmin stepping */
interface Ctx {
  mode: string;
  avg?: boolean;
  t0m?: boolean;
  t: number;
  gsh?: number;
  src: number;
  h?: number;
  be?: boolean;
  dae?: boolean;
  test?: { a: number; b: number };
}
interface TranOpts {
  readonly dt?: unknown;
  readonly tEnd?: unknown;
  readonly maxSteps?: unknown;
  readonly uic?: unknown;
  readonly fromAvg?: unknown;
  readonly power?: unknown;
}
/** a transient held open: the step count, the unknowns, the histories */
interface TranRun {
  dt: number;
  tol: number;
  s: number;
  xs: Float64Array;
  V: number[][];
  I: number[][];
  pw: string[];
  pwEl: El[];
  PW: number[][];
  caps: El[];
  inds: El[];
  tls: El[];
  bp: number;
  ctx: Ctx;
}
interface AcOpts {
  readonly source?: unknown;
  readonly fStart?: unknown;
  readonly fStop?: unknown;
  readonly points?: unknown;
  readonly scale?: unknown;
  readonly idx?: unknown;
}
interface Probe {
  readonly kind?: string;
  readonly a?: string;
  readonly b?: string;
  readonly element?: string;
  readonly pin?: number;
  readonly node?: string;
  readonly ref?: string;
  readonly nodes?: readonly string[];
  readonly threshold?: unknown;
  readonly tEnd?: unknown;
  readonly dt?: unknown;
  readonly tStart?: unknown;
  readonly maxSteps?: unknown;
  readonly uic?: unknown;
  readonly mode?: string;
  readonly zin?: unknown;
  readonly lead?: unknown;
  readonly cin?: unknown;
  readonly source?: unknown;
  readonly fStart?: unknown;
  readonly fStop?: unknown;
  readonly points?: unknown;
}
interface ScopeStats {
  min: number;
  max: number;
  mean: number;
  pp: number;
  rms: number;
  freq: number;
}
interface LogicEdge {
  t: number;
  to: number;
}
/** one reading of an instrument */
type Reading =
  | { kind: 'V' | 'I'; value: number; unit: string; mode?: string }
  | { kind: 'R'; value: number | 'OL'; unit: string }
  | { kind: 'scope'; t: number[]; v: number[]; unit: string; stats: ScopeStats }
  | {
      kind: 'logic';
      t: number[];
      traces: Record<string, number[]>;
      edges: Record<string, LogicEdge[]>;
      stats: Record<string, { freq: number; duty: number; edges: number }>;
      threshold: number;
    }
  | { kind: 'bode'; f: number[]; db: number[]; phase: number[]; stats: Record<string, number> };
interface Noise {
  rel: number;
  abs: number;
  seed: number;
}
type Sim = ReturnType<typeof makeSim>;
interface CreateOpts {
  readonly version?: number;
  readonly faults?: unknown;
  readonly noise?: { readonly rel?: unknown; readonly abs?: unknown; readonly seed?: unknown } | undefined;
  readonly seed?: unknown;
}
const ID = 'circuit-mna@1',
  FORMAT = 'noema.circuit/v1';
const MAX_NODES = 60,
  MAX_ELEMENTS = 200,
  MAX_STEPS = 200000;
const VT = 0.025852; // kT/q at 300 K
const GMIN = 1e-12; // from every node to ground and across every junction
const RSHORT = 1e-3; // a short fault
const OHM_I = 1e-3,
  OHM_OL = 20e6; // the ohmmeter's test current and its over-range
const EX80 = Math.exp(80);
const isGnd = (s: unknown) => s === 'gnd' || s === '0';
/** a plain object (not an array): a typed field keeps its type, an unknown value becomes a record */
const isObj = ((v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)) as {
  <T extends object>(v: T | null | undefined): v is T;
  (v: unknown): v is Rec;
};
const NODE_RE = /^[A-Za-z0-9_][A-Za-z0-9_+\-]{0,31}$/,
  ID_RE = /^[A-Za-z][A-Za-z0-9_\-]{0,31}$/;
function fail(code: string, extra?: Rec): Fail {
  const e = new Error('circuit: ' + code) as Fail;
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

/** a number, or a string with an SI prefix ("4.7k", "100n", "2meg") → number; anything else → NaN */
const SI: Readonly<Record<string, number>> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  G: 1e9,
};
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$/.exec(v);
  return m ? parseFloat(m[1]!) * (m[2] ? SI[m[2]]! : 1) : NaN;
}

// ---- element types, parameters, presets ----
const TYPES: Readonly<Record<string, readonly number[]>> = {
  R: [2],
  C: [2],
  L: [2],
  V: [2],
  I: [2],
  D: [2],
  SW: [2],
  NPN: [3],
  PNP: [3],
  NMOS: [3],
  PMOS: [3],
  OPAMP: [3, 5],
};
const PARAMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  R: {},
  C: {},
  L: {},
  V: {},
  I: {},
  D: { Is: 'pos', n: 'pos' },
  SW: { Ron: 'pos', Roff: 'pos' },
  NPN: { Is: 'pos', betaF: 'pos', betaR: 'pos' },
  PNP: { Is: 'pos', betaF: 'pos', betaR: 'pos' },
  NMOS: { Vth: 'fin', k: 'pos', lambda: 'nonneg' },
  PMOS: { Vth: 'fin', k: 'pos', lambda: 'nonneg' },
  OPAMP: { gain: 'pos', rails: 'rails', headroom: 'nonneg' },
};
const DEFAULTS: Readonly<Record<string, ElP>> = {
  D: { Is: 1e-14, n: 1 },
  SW: { Ron: 0.01, Roff: 1e9 },
  NPN: { Is: 1e-14, betaF: 100, betaR: 1 },
  PNP: { Is: 1e-14, betaF: 100, betaR: 1 },
  NMOS: { Vth: 1.5, k: 0.1, lambda: 0 },
  PMOS: { Vth: 1.5, k: 0.1, lambda: 0 },
  OPAMP: { gain: 1e5, rails: [-15, 15], headroom: 0 },
};
const led = (vf: number) => ({ Is: 0.02 / Math.expm1(vf / (2 * VT)), n: 2 }); // Vf at 20 mA
const PRESETS: Readonly<Record<string, Readonly<Record<string, ElP>>>> = {
  D: {
    '1n4148': { Is: 2.52e-9, n: 1.752 },
    '1n4001': { Is: 14.11e-9, n: 1.984 },
    'led-red': led(1.8),
    'led-orange': led(2.0),
    'led-yellow': led(2.05),
    'led-green': led(2.1),
    'led-blue': led(3.0),
    'led-white': led(3.0),
  },
  NPN: {
    '2n3904': { Is: 6.734e-15, betaF: 200, betaR: 0.74 },
    '2n2222': { Is: 14.34e-15, betaF: 200, betaR: 6.1 },
    bc547: { Is: 7e-15, betaF: 300, betaR: 1 },
  },
  PNP: { '2n3906': { Is: 1.41e-15, betaF: 180, betaR: 4 }, bc557: { Is: 7e-15, betaF: 250, betaR: 1 } },
  NMOS: {
    '2n7000': { Vth: 2.1, k: 0.2, lambda: 0.01 },
    bs170: { Vth: 1.8, k: 0.25, lambda: 0.01 },
    irlz44n: { Vth: 1.6, k: 30, lambda: 0.002 },
  },
  PMOS: { bs250: { Vth: 2.4, k: 0.12, lambda: 0.01 }, irf9540: { Vth: 3.0, k: 8, lambda: 0.003 } },
};
const SHORT_PINS: Readonly<Record<string, readonly number[]>> = { NPN: [0, 2], PNP: [0, 2], NMOS: [0, 2], PMOS: [0, 2], OPAMP: [0, 1] };
const DRIFT_PARAM: Readonly<Record<string, string>> = {
  R: 'value',
  C: 'value',
  L: 'value',
  V: 'value',
  I: 'value',
  D: 'Is',
  SW: 'Ron',
  NPN: 'betaF',
  PNP: 'betaF',
  NMOS: 'k',
  PMOS: 'k',
  OPAMP: 'gain',
};
const NONLINEAR = new Set(['D', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'VSW']);

// ---- the second-generation model (docs/INTERACTIVE_CIRCUIT.md §9): line, voltage-controlled switch, device capacitances, breakdown, op-amp dynamics,
//      pickup on floating nodes, real instruments, AC analysis. {version: 1} switches it all off (the first model, kept for comparisons in tests/circuit2.js) ----
const TYPES2 = Object.assign({}, TYPES, { TLINE: [2, 4], VSW: [4] });
const PARAMS2 = Object.assign({}, PARAMS, {
  D: Object.assign({}, PARAMS.D, { Cj: 'nonneg', Bv: 'pos', Ibv: 'pos' }),
  NPN: Object.assign({}, PARAMS.NPN, { Cbe: 'nonneg', Cbc: 'nonneg' }),
  PNP: Object.assign({}, PARAMS.PNP, { Cbe: 'nonneg', Cbc: 'nonneg' }),
  NMOS: Object.assign({}, PARAMS.NMOS, { Cgs: 'nonneg', Cgd: 'nonneg', Cds: 'nonneg', body: 'bool' }),
  PMOS: Object.assign({}, PARAMS.PMOS, { Cgs: 'nonneg', Cgd: 'nonneg', Cds: 'nonneg', body: 'bool' }),
  OPAMP: Object.assign({}, PARAMS.OPAMP, { gbw: 'pos', slew: 'pos', rout: 'nonneg', vos: 'fin', ib: 'fin' }),
  TLINE: { z0: 'pos', td: 'pos', len: 'pos', vf: 'vf' },
  VSW: { Ron: 'pos', Roff: 'pos', Von: 'fin', Voff: 'fin' },
});
const DEFAULTS2 = Object.assign({}, DEFAULTS, { TLINE: { z0: 50, vf: 0.66 }, VSW: { Ron: 0.01, Roff: 1e9, Von: 2, Voff: 1 } });
const PRESETS2 = ((): Record<string, Record<string, ElP>> => {
  const P: Record<string, Record<string, ElP>> = {};
  for (const t of Object.keys(PRESETS)) {
    P[t] = {};
    for (const k of Object.keys(PRESETS[t]!)) P[t][k] = Object.assign({}, PRESETS[t]![k]);
  }
  const add = (t: string, k: string, v: ElP) => {
    P[t] = P[t] || {};
    P[t][k] = Object.assign(P[t][k] || {}, v);
  };
  add('D', '1n4148', { Cj: 4e-12, Bv: 100 });
  add('D', '1n4001', { Cj: 15e-12, Bv: 50 });
  for (const k of ['led-red', 'led-orange', 'led-yellow', 'led-green', 'led-blue', 'led-white']) add('D', k, { Cj: 20e-12 });
  add('D', '1n5819', { Is: 3e-6, n: 1.05, Cj: 110e-12, Bv: 40 }); // a Schottky: 0.35 V at 1 A
  add('D', 'bzx55c3v3', { Is: 1e-14, n: 1, Bv: 3.3, Ibv: 5e-3, Cj: 300e-12 }); // Zeners: Bv at Ibv
  add('D', 'bzx55c5v1', { Is: 1e-14, n: 1, Bv: 5.1, Ibv: 5e-3, Cj: 200e-12 });
  add('D', 'smbj5.0a', { Is: 1e-12, n: 1, Bv: 6.4, Ibv: 1e-3, Cj: 2e-9 }); // a 5 V TVS
  add('NPN', '2n3904', { Cbe: 8e-12, Cbc: 3.6e-12 });
  add('NPN', '2n2222', { Cbe: 25e-12, Cbc: 8e-12 });
  add('NPN', 'bc547', { Cbe: 10e-12, Cbc: 4e-12 });
  add('PNP', '2n3906', { Cbe: 10e-12, Cbc: 4.5e-12 });
  add('PNP', 'bc557', { Cbe: 10e-12, Cbc: 4.5e-12 });
  add('NMOS', '2n7000', { Cgs: 20e-12, Cgd: 5e-12, Cds: 11e-12 });
  add('NMOS', 'bs170', { Cgs: 20e-12, Cgd: 5e-12, Cds: 10e-12 });
  add('NMOS', 'irlz44n', { Cgs: 1.5e-9, Cgd: 0.25e-9, Cds: 0.4e-9, body: true });
  add('PMOS', 'bs250', { Cgs: 20e-12, Cgd: 5e-12, Cds: 10e-12 });
  add('PMOS', 'irf9540', { Cgs: 1.2e-9, Cgd: 0.2e-9, Cds: 0.5e-9, body: true });
  P.OPAMP = {
    lm358: { gain: 1e5, gbw: 1e6, slew: 0.3e6, rout: 50, headroom: 1.2 },
    lm741: { gain: 2e5, gbw: 1e6, slew: 0.5e6, rout: 75, headroom: 1.5 },
    tl072: { gain: 2e5, gbw: 3e6, slew: 13e6, rout: 100, headroom: 1.5 },
    ne5532: { gain: 1e5, gbw: 10e6, slew: 9e6, rout: 30, headroom: 1.5 },
    mcp6002: { gain: 1e5, gbw: 1e6, slew: 0.6e6, rout: 100, headroom: 0.025 },
  };
  return P;
})();
const SHORT_PINS2 = Object.assign({}, SHORT_PINS, { TLINE: [0, 1], VSW: [0, 1] });
const DRIFT_PARAM2 = Object.assign({}, DRIFT_PARAM, { TLINE: 'z0', VSW: 'Ron' });
const ROP = 1e6,
  GCL = 10,
  C0 = 299792458; // the op-amp's internal pole: a 1 MΩ node, clamped softly near its rails; the speed of light
const PICKUP = { hum: 50, amp: 1, noise: 0.3, bw: 500, wander: 0.3, r: 1e8 }; // what a node with no DC path picks up
const MODES = ['dc', 'ac', 'rms', 'avg'];
const tbl = (ver: number) =>
  ver === 2
    ? { T: TYPES2, P: PARAMS2, D: DEFAULTS2, PR: PRESETS2, SP: SHORT_PINS2, DP: DRIFT_PARAM2 }
    : { T: TYPES, P: PARAMS, D: DEFAULTS, PR: PRESETS, SP: SHORT_PINS, DP: DRIFT_PARAM };
const verOf = (o: unknown) => (o === 1 || (o && (o as { readonly version?: unknown }).version === 1) ? 1 : 2); // 2 = everything (the default); {version: 1} = the first model, kept for comparisons in the tests

// ---- waveforms of the V and I sources ----
const WAVE_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  pulse: { v1: 'fin!', v2: 'fin!', delay: 'nonneg', rise: 'nonneg', fall: 'nonneg', width: 'pos', period: 'pos' },
  sine: { offset: 'fin', amp: 'fin!', freq: 'pos!', phase: 'fin', delay: 'nonneg' },
  pwm: { v: 'fin!', freq: 'pos!', duty: 'unit!', low: 'fin', delay: 'nonneg' },
};
const WAVE_FIELDS2 = Object.assign({}, WAVE_FIELDS, { noise: { rms: 'nonneg!', bw: 'pos!', offset: 'fin', seed: 'fin' } });
/** canonical form: {kind:'dc', dc} | {kind:'pulse', v1, v2, …} | … (numbers parsed, defaults filled) */
function canonWave(spec: unknown): Wave {
  if (!isObj(spec)) return { kind: 'dc', dc: num(spec) };
  if (spec.dc !== undefined) return { kind: 'dc', dc: num(spec.dc) };
  for (const kind of ['pulse', 'sine', 'pwm', 'noise'])
    if (spec[kind] !== undefined) {
      const q = (spec[kind] || {}) as Rec,
        w = { kind } as Wave,
        wr = w as unknown as Record<string, number | undefined>;
      for (const f of Object.keys(WAVE_FIELDS2[kind]!)) wr[f] = q[f] === undefined ? undefined : num(q[f]);
      if (kind === 'noise') {
        w.offset = w.offset || 0;
        w.seed = w.seed || 0;
        return w;
      }
      if (kind === 'pulse') {
        w.delay = w.delay || 0;
        w.rise = w.rise || 0;
        w.fall = w.fall || 0;
        w.period = w.period || 0;
        if (w.width === undefined) w.width = w.period > 0 ? (w.period - w.rise - w.fall) / 2 : Infinity;
      }
      if (kind === 'sine') {
        w.offset = w.offset || 0;
        w.phase = w.phase || 0;
        w.delay = w.delay || 0;
      }
      if (kind === 'pwm') {
        w.low = w.low || 0;
        w.delay = w.delay || 0;
      }
      return w;
    }
  return { kind: 'dc', dc: NaN };
}
function scaleWave(w: Wave, f: number) {
  const s = Object.assign({}, w) as unknown as Record<string, unknown>;
  for (const k of ['dc', 'v1', 'v2', 'offset', 'amp', 'v', 'low', 'rms', 'humAmp', 'wander']) if (typeof s[k] === 'number') s[k] *= f;
  return s as unknown as Wave;
}
function shiftWave(w: Wave, d: number) {
  // drift {add}: every level moves by d
  const s = Object.assign({}, w) as unknown as Record<string, unknown>;
  for (const k of ['dc', 'v1', 'v2', 'offset', 'v', 'low']) if (typeof s[k] === 'number') s[k] += d;
  return s as unknown as Wave;
}
/** the simulation kernel (NoemaSimKit, src/engines/kernel/simkit.ts): the meters' seeded jitter draws from its MRG32k3a streams, one per
      measurement; the noise sources draw from its counter-based Philox stream (counterStream: sample i of a source is read at any
      time of a transient in O(1), with no state to carry). */
const K = NoemaSimKit;
const streamOf = (name: string, seed: number) => K.stream(seed >>> 0, 'circuit:' + name);
/** → {at(t), avg, at0m (the value at t = 0⁻), next(t): the first breakpoint after t (Infinity if none)} */
function wave(w0: Wave): WaveFn {
  const w = w0 as Required<Omit<Wave, 'hold' | 'pickup'>> & Wave; // canonWave filled every field the kind has
  if (w.kind === 'dc') return { at: () => w.dc, avg: w.dc, at0m: w.dc, next: () => Infinity };
  if (w.kind === 'noise') {
    // seeded band-limited noise (straight lines between Gaussian samples 1/(2·bw) apart), plus the pickup's hum and slow wander
    const hold = w.hold || { shift: 0 },
      sd = w.seed >>> 0,
      dn = 1 / (2 * w.bw),
      dw = 1;
    const cs = { n: K.counterStream(sd, 'circuit:noise:n', null), w: K.counterStream(sd, 'circuit:noise:w', null) };
    const g = (tag: 'n' | 'w', i: number) => cs[tag].normal(i, 0, 0, null);
    const lerp = (tag: 'n' | 'w', u: number) => {
      const i = Math.floor(u),
        f = u - i;
      return g(tag, i) * (1 - f) + g(tag, i + 1) * f;
    };
    const at = (t: number) => {
      const tt = t + hold.shift;
      let v = w.offset + w.rms * lerp('n', tt / dn);
      if (w.wander) v += w.wander * lerp('w', tt / dw);
      if (w.humAmp && w.hum > 0) v += w.humAmp * Math.sin(2 * Math.PI * w.hum * tt);
      return v;
    };
    return {
      at,
      avg: w.offset,
      get at0m() {
        return at(0);
      },
      next: () => Infinity,
      noise: true,
    };
  }
  if (w.kind === 'sine') {
    const ph = (w.phase * Math.PI) / 180,
      om = 2 * Math.PI * w.freq;
    const at = (t: number) => w.offset + w.amp * Math.sin(t < w.delay ? ph : om * (t - w.delay) + ph);
    return { at, avg: w.offset, at0m: at(0), next: t => (t < w.delay ? w.delay : Infinity) };
  }
  if (w.kind === 'pwm') {
    const T = 1 / w.freq,
      tol = 1e-9;
    const at = (t: number) => {
      if (t < w.delay - tol * T) return w.low;
      const ph = (t - w.delay) * w.freq;
      let fr = ph - Math.floor(ph + tol);
      if (fr < 0) fr = 0;
      return fr < w.duty - tol ? w.v : w.low;
    };
    const next = (t: number) => {
      if (w.duty <= 0 || w.duty >= 1) return t < w.delay ? w.delay : Infinity;
      if (t < w.delay) return w.delay;
      const k = Math.floor((t - w.delay) * w.freq);
      for (let c = k; c <= k + 1; c++)
        for (const o of [0, w.duty]) {
          const bp = w.delay + (c + o) * T;
          if (bp > t) return bp;
        }
      return w.delay + (k + 2) * T;
    };
    return { at, avg: w.low + (w.v - w.low) * w.duty, at0m: w.duty >= 1 && w.delay <= 0 ? w.v : w.low, next };
  }
  // pulse (SPICE semantics)
  const { v1, v2, delay, rise, fall, width, period: per } = w;
  const scale = per > 0 ? per : rise + fall + (Number.isFinite(width) ? width : 0) + delay || 1e-6,
    tol = 1e-9 * scale;
  const at = (t: number) => {
    if (t < delay - tol) return v1;
    let tt = t - delay;
    if (tt < 0) tt = 0;
    if (per > 0) {
      tt -= per * Math.floor(tt / per + 1e-9);
      if (tt < 0) tt = 0;
    }
    if (tt < rise) return v1 + ((v2 - v1) * tt) / rise;
    tt -= rise;
    if (tt < width - tol) return v2;
    tt -= width;
    if (tt < fall) return v2 + ((v1 - v2) * tt) / fall;
    return v1;
  };
  const offs = [0, rise, rise + width, rise + width + fall].filter(Number.isFinite);
  const next = (t: number) => {
    if (t < delay) return delay;
    const k = per > 0 ? Math.floor((t - delay) / per) : 0;
    for (let c = k; c <= k + 1; c++) {
      const base = delay + c * per;
      for (const o of offs) {
        const bp = base + o;
        if (bp > t) return bp;
      }
      if (!(per > 0)) break;
    }
    return Infinity;
  };
  const avg =
    per > 0 ? (v1 * (per - rise - width - fall) + v2 * width + 0.5 * (v1 + v2) * (rise + fall)) / per : Number.isFinite(width) ? v1 : v2;
  return { at, avg, at0m: v1, next };
}

// ---- check(netlist) ----
function checkNumber(kind: string, v: unknown) {
  const x = num(v);
  switch (kind) {
    case 'pos':
      return x > 0;
    case 'nonneg':
      return x >= 0;
    case 'unit':
      return x >= 0 && x <= 1;
    case 'vf':
      return x > 0 && x <= 1;
    case 'bool':
      return typeof v === 'boolean';
    case 'rails':
      return Array.isArray(v) && v.length === 2 && num(v[0]) < num(v[1]);
    default:
      return Number.isFinite(x);
  }
}
function checkWave(v: unknown, path: string, E: Emit, ver: number) {
  if (!isObj(v)) {
    if (!Number.isFinite(num(v))) E('value', path, 'needs a number or a waveform');
    return;
  }
  const keys = Object.keys(v),
    kinds = ver === 2 ? ['dc', 'pulse', 'sine', 'pwm', 'noise'] : ['dc', 'pulse', 'sine', 'pwm'];
  if (keys.length !== 1 || !kinds.includes(keys[0]!)) {
    E('value', path, 'one of ' + kinds.join(', '));
    return;
  }
  const kind = keys[0]!;
  if (kind === 'dc') {
    if (!Number.isFinite(num(v.dc))) E('value', path + '.dc', 'needs a number');
    return;
  }
  const q = v[kind],
    F = WAVE_FIELDS2[kind]!;
  if (!isObj(q)) {
    E('value', path + '.' + kind, 'needs an object');
    return;
  }
  for (const k of Object.keys(q)) if (!Object.prototype.hasOwnProperty.call(F, k)) E('value', `${path}.${kind}.${k}`, 'unknown field');
  for (const [k, spec] of Object.entries(F)) {
    const must = spec.endsWith('!'),
      kd = must ? spec.slice(0, -1) : spec;
    if (q[k] === undefined) {
      if (must) E('value', `${path}.${kind}.${k}`, 'missing');
      continue;
    }
    if (!checkNumber(kd, q[k])) E('value', `${path}.${kind}.${k}`, 'out of range');
  }
  if (kind === 'pulse' && q.period !== undefined) {
    const w = canonWave(v);
    if (w.rise! + w.width! + w.fall! > w.period! * (1 + 1e-12)) E('value', path + '.pulse', 'rise + width + fall > period');
  }
}
const EL_KEYS = new Set(['id', 'type', 'n', 'value', 'ic', 'params', 'preset', 'on', 'label', 'note']);
const PICKUP_FIELDS: Readonly<Record<string, string>> = {
  hum: 'nonneg',
  amp: 'nonneg',
  noise: 'nonneg',
  bw: 'pos',
  wander: 'nonneg',
  offset: 'fin',
  r: 'pos',
};
function check(nl: unknown, opts?: unknown) {
  const ver = verOf(opts),
    TB = tbl(ver),
    P: Prob[] = [];
  const E = (code: string, path: string, msg: string) => {
    P.push({ code, path, msg, level: 'error' });
  };
  const W = (code: string, path: string, msg: string) => {
    P.push({ code, path, msg, level: 'warning' });
  };
  if (!isObj(nl)) {
    E('format', '', 'netlist is not an object');
    return P;
  }
  if (nl.format !== undefined && nl.format !== FORMAT) E('format', 'format', 'not ' + FORMAT);
  if (!Array.isArray(nl.nodes)) E('format', 'nodes', 'not an array');
  if (!Array.isArray(nl.elements)) E('format', 'elements', 'not an array');
  if (P.length) return P;
  for (const k of Object.keys(nl))
    if (!['format', 'nodes', 'elements', 'meta'].concat(ver === 2 ? ['pickup'] : []).includes(k)) W('unknown-field', k, 'ignored');
  if (ver === 2 && nl.pickup !== undefined) {
    if (nl.pickup !== false && !isObj(nl.pickup)) E('value', 'pickup', 'false, or {hum, amp, noise, bw, wander, offset, r}');
    else if (isObj(nl.pickup))
      for (const [k, v] of Object.entries(nl.pickup)) {
        if (!Object.prototype.hasOwnProperty.call(PICKUP_FIELDS, k)) E('value', 'pickup.' + k, 'unknown field');
        else if (!checkNumber(PICKUP_FIELDS[k]!, v)) E('value', 'pickup.' + k, 'out of range');
      }
  }
  const names = new Set<string>(),
    labels = new Map<string, { to: unknown; i: number }>(),
    nodeAt = new Map<string, number>();
  (nl.nodes as unknown[]).forEach((x, i) => {
    const nm = typeof x === 'string' ? x : isObj(x) ? x.name : undefined;
    if (typeof nm !== 'string' || !NODE_RE.test(nm)) {
      E('node-name', `nodes[${i}]`, 'bad node name');
      return;
    }
    if (names.has(nm) || labels.has(nm)) {
      E('dup-node', `nodes[${i}]`, 'duplicate node ' + nm);
      return;
    }
    if (ver === 2 && isObj(x) && x.pickup !== undefined && typeof x.pickup !== 'boolean')
      E('value', `nodes[${i}].pickup`, 'needs true or false');
    if (isObj(x) && x.probe !== undefined) {
      if (isGnd(nm)) {
        E('node-name', `nodes[${i}]`, 'ground cannot be a label');
        return;
      }
      labels.set(nm, { to: x.probe, i });
    } else {
      names.add(nm);
      nodeAt.set(nm, i);
    }
  });
  for (const [, { to, i }] of labels)
    if (typeof to !== 'string' || !(names.has(to) || isGnd(to))) E('unknown-node', `nodes[${i}].probe`, 'label of an unknown node');
  if ([...names].filter(s => !isGnd(s)).length > MAX_NODES) E('size', 'nodes', `more than ${MAX_NODES} nodes`);
  if ((nl.elements as unknown[]).length > MAX_ELEMENTS) E('size', 'elements', `more than ${MAX_ELEMENTS} elements`);
  const ids = new Set<string>();
  (nl.elements as unknown[]).forEach((el, i) => {
    const at = `elements[${i}]`;
    if (!isObj(el)) {
      E('format', at, 'element is not an object');
      return;
    }
    for (const k of Object.keys(el)) if (!EL_KEYS.has(k)) W('unknown-field', `${at}.${k}`, 'ignored');
    if (typeof el.id !== 'string' || !ID_RE.test(el.id)) E('id', at + '.id', 'bad id');
    else if (ids.has(el.id)) E('dup-id', at + '.id', 'duplicate id ' + el.id);
    else ids.add(el.id);
    const t = el.type;
    if (typeof t !== 'string' || !Object.prototype.hasOwnProperty.call(TB.T, t)) {
      E('type', at + '.type', 'unknown type');
      return;
    }
    if (!Array.isArray(el.n) || !TB.T[t]!.includes(el.n.length)) {
      E('pins', at + '.n', 'wrong number of terminals');
      return;
    }
    (el.n as unknown[]).forEach((m, k) => {
      if (labels.has(m as string)) E('probe-only', `${at}.n[${k}]`, 'a probe-only label cannot be a terminal');
      else if (typeof m !== 'string' || !(names.has(m) || isGnd(m))) E('unknown-node', `${at}.n[${k}]`, 'unknown node ' + String(m));
    });
    if (t === 'R' || t === 'C' || t === 'L') {
      if (el.value === undefined) E('value', at + '.value', 'missing value');
      else if (!(num(el.value) > 0)) E('value', at + '.value', 'needs a positive number');
      if (el.ic !== undefined && (t === 'R' || !Number.isFinite(num(el.ic)))) E('value', at + '.ic', 'needs a number');
    } else if (t === 'V' || t === 'I') {
      if (el.value === undefined) E('value', at + '.value', 'missing value');
      else checkWave(el.value, at + '.value', E, ver);
    } else if (el.value !== undefined) E('value', at + '.value', 'this type takes params, not a value');
    if (el.ic !== undefined && t !== 'C' && t !== 'L') E('value', at + '.ic', 'only C and L have ic');
    if (el.on !== undefined && (t !== 'SW' || typeof el.on !== 'boolean')) E('value', at + '.on', 'only SW has on (true/false)');
    if (
      el.preset !== undefined &&
      !(TB.PR[t] && typeof el.preset === 'string' && Object.prototype.hasOwnProperty.call(TB.PR[t], el.preset))
    )
      E('preset', at + '.preset', 'unknown preset');
    if (t === 'TLINE' && !(isObj(el.params) && (el.params.td !== undefined || el.params.len !== undefined)))
      E('param', at + '.params', 'a line needs td (s) or len (m)');
    if (el.params !== undefined) {
      if (!isObj(el.params)) E('param', at + '.params', 'not an object');
      else
        for (const [k, v] of Object.entries(el.params)) {
          const kd = Object.prototype.hasOwnProperty.call(TB.P[t], k) ? TB.P[t]![k] : null;
          if (!kd) E('param', `${at}.params.${k}`, 'unknown parameter');
          else if (!checkNumber(kd, v)) E('param', `${at}.params.${k}`, 'out of range');
        }
    }
  });
  if (P.some(p => p.level === 'error')) return P;
  // the graph: ground, loops of voltage-defined branches, nodes without a DC path to ground
  const els = nl.elements as NetEl[],
    G0 = 'gnd',
    key = (s: string) => (isGnd(s) ? G0 : s);
  if (els.length && !els.some(el => el.n.some(isGnd))) E('no-ground', 'elements', 'no element touches ground');
  const uf = () => {
    const p = new Map<string, string>();
    const f = (s: string) => {
      s = key(s);
      while (p.has(s) && p.get(s) !== s) s = p.get(s)!;
      return s;
    };
    return {
      f,
      u: (a: string, b: string) => {
        const x = f(a),
          y = f(b);
        if (x === y) return false;
        p.set(x, y);
        return true;
      },
    };
  };
  const VL = uf(),
    DCP = uf();
  els.forEach((el, i) => {
    const n = el.n;
    if ((el.type === 'V' || el.type === 'L') && !VL.u(n[0]!, n[1]!)) E('vloop', `elements[${i}]`, 'loop of voltage sources / inductors');
    if (el.type === 'OPAMP' && !VL.u(n[2]!, G0)) E('vloop', `elements[${i}]`, 'op-amp output on a voltage-defined node');
    if (el.type === 'TLINE') {
      const q = n.length === 4 ? n : [n[0], G0, n[1], G0];
      for (const [x, y] of [
        [q[0], q[2]],
        [q[1], q[3]],
      ])
        if (key(x!) !== key(y!) && !VL.u(x!, y!)) E('vloop', `elements[${i}]`, 'loop of voltage sources / inductors / lines');
      DCP.u(q[0]!, q[2]!);
      DCP.u(q[1]!, q[3]!);
    }
    if (n.length === 2 && el.type !== 'V' && el.type !== 'L' && el.type !== 'TLINE' && key(n[0]!) === key(n[1]!))
      W('self-loop', `elements[${i}]`, 'both terminals on one node');
    if (['R', 'L', 'V', 'D', 'SW', 'VSW'].includes(el.type)) DCP.u(n[0]!, n[1]!);
    else if (el.type === 'NPN' || el.type === 'PNP') {
      DCP.u(n[0]!, n[1]!);
      DCP.u(n[1]!, n[2]!);
    } else if (el.type === 'NMOS' || el.type === 'PMOS') DCP.u(n[0]!, n[2]!);
    else if (el.type === 'OPAMP') DCP.u(n[2]!, G0);
  });
  const used = new Set<string>();
  els.forEach(el => {
    el.n.forEach(m => used.add(key(m)));
  });
  for (const nm of names) {
    if (isGnd(nm)) continue;
    if (!used.has(nm)) W('unused', `nodes[${nodeAt.get(nm)}]`, 'no element uses ' + nm);
    else if (DCP.f(nm) !== DCP.f(G0)) W('floating', `nodes[${nodeAt.get(nm)}]`, 'no DC path to ground from ' + nm);
  }
  return P;
}

/** checkFaults(netlist, faults) → problems of a list of faults on a netlist that passes check() (the same codes and paths as check;
      the validators run it on a bench's faults before the app ever compiles them). Golden outputs of the former twin's check_faults: tests/fixtures/parity/enginelib.json. */
const FAULT_KINDS = ['open', 'short', 'drift', 'open-trace', 'reverse'];
const FAULT_KEYS = new Set(['kind', 'element', 'pin', 'pins', 'factor', 'param', 'node', 'side']);
function checkFaults(nl: unknown, faults: unknown, opts?: unknown) {
  const ver = verOf(opts),
    TB = tbl(ver),
    P: Prob[] = [],
    E = (path: string, msg: string) => {
      P.push({ code: 'fault', path, msg, level: 'error' });
    };
  if (!Array.isArray(faults)) {
    E('', 'faults must be a list');
    return P;
  }
  const els = (isObj(nl) && Array.isArray(nl.elements) ? (nl.elements as unknown[]).filter(isObj) : []) as unknown as NetEl[];
  const byId = new Map(els.map(e => [e.id, e]));
  const declared = new Set(
    (isObj(nl) && Array.isArray(nl.nodes) ? (nl.nodes as unknown[]) : [])
      .filter(x => typeof x === 'string' || (isObj(x) && x.probe === undefined))
      .map(x => (typeof x === 'string' ? x : (x as NetNode).name)),
  );
  const same = (m: unknown, node: unknown) => m === node || (isGnd(m) && isGnd(node));
  const pinsOk = (pins: unknown, n: number) =>
    Array.isArray(pins) && pins.length === 2 && pins.every(k => Number.isInteger(k) && k >= 0 && k < n) && pins[0] !== pins[1];
  (faults as unknown[]).forEach((f, i) => {
    const at = `faults[${i}]`;
    if (!isObj(f)) {
      E(at, 'a fault is an object {element | node, kind}');
      return;
    }
    for (const k of Object.keys(f)) if (!FAULT_KEYS.has(k) && !(ver === 2 && k === 'add')) E(`${at}.${k}`, 'unknown field');
    if (!FAULT_KINDS.includes(f.kind as string)) {
      E(at + '.kind', 'one of ' + FAULT_KINDS.join(', '));
      return;
    }
    if (f.kind === 'open-trace') {
      if (typeof f.node !== 'string' || !(declared.has(f.node) || isGnd(f.node))) {
        E(at + '.node', 'not a node of the netlist');
        return;
      }
      const touching = els.filter(e => Array.isArray(e.n) && e.n.some(m => same(m, f.node)));
      if (f.side === undefined) {
        if (touching.length < 2) E(at + '.node', 'fewer than two parts touch this node');
        return;
      }
      if (!Array.isArray(f.side) || !f.side.length) {
        E(at + '.side', 'a list of parts (R1) or pins (R1.0) on the node');
        return;
      }
      (f.side as unknown[]).forEach((x, j) => {
        const [eid, pin] = parsePinRef(x),
          e = typeof x === 'string' ? byId.get(eid) : undefined;
        if (!e) E(`${at}.side[${j}]`, 'not a part of the netlist');
        else if (pin === undefined ? !e.n.some(m => same(m, f.node)) : !(pin < e.n.length && same(e.n[pin], f.node)))
          E(`${at}.side[${j}]`, 'does not touch the node');
      });
      return;
    }
    const e = typeof f.element === 'string' ? byId.get(f.element) : undefined;
    if (!e) {
      E(at + '.element', 'not a part of the netlist');
      return;
    }
    const n = e.n.length;
    if (f.kind === 'open') {
      if (f.pin !== undefined && !(Number.isInteger(f.pin) && (f.pin as number) >= 0 && (f.pin as number) < n))
        E(at + '.pin', 'not a pin of the part');
    } else if (f.kind === 'short' || f.kind === 'reverse') {
      if (f.pins !== undefined ? !pinsOk(f.pins, n) : f.kind === 'reverse' && n !== 2) E(at + '.pins', 'two different pins of the part');
    } else {
      // drift
      if (f.factor !== undefined && !(num(f.factor) > 0)) E(at + '.factor', 'needs a number > 0');
      if (ver === 2 && f.add !== undefined && !Number.isFinite(num(f.add))) E(at + '.add', 'needs a number');
      if (f.param !== undefined) {
        const t = e.type,
          okp =
            typeof f.param === 'string' &&
            (['R', 'C', 'L', 'V', 'I'].includes(t)
              ? f.param === 'value'
              : Object.prototype.hasOwnProperty.call(TB.P[t], f.param) && TB.P[t]![f.param] !== 'bool');
        if (!okp) E(at + '.param', 'not a parameter of the part');
      }
    }
  });
  return P;
}

// ---- compile: faults applied, nodes indexed, element models built ----
const parsePinRef = (s: unknown): [string, number | undefined] => {
  const m = /^(.*)\.(\d+)$/.exec(String(s));
  return m ? [m[1]!, +m[2]!] : [String(s), undefined];
};
function normalize(el: NetEl, ver: number) {
  const TB = tbl(ver),
    t = el.type,
    d = { id: el.id, type: t, n: el.n.slice(), p: {} } as El,
    dp = d.p as Record<string, unknown>;
  if (t === 'R' || t === 'C' || t === 'L') {
    d.p.value = num(el.value);
    if (el.ic !== undefined) d.p.ic = num(el.ic);
  } else if (t === 'V' || t === 'I') d.p.value = canonWave(el.value);
  else {
    Object.assign(d.p, TB.D[t], el.preset ? TB.PR[t]![el.preset] : null);
    for (const [k, v] of Object.entries(el.params || {}))
      dp[k] = k === 'rails' ? [num((v as unknown[])[0]), num((v as unknown[])[1])] : typeof v === 'boolean' ? v : num(v);
  }
  if (t === 'SW') d.on = el.on !== false;
  return d;
}
function compile(nl: Netlist, faults: readonly Fault[] | null | undefined, o: CompileOpts | null | undefined) {
  o = o || {};
  const ver = o.ver === 2 ? 2 : 1,
    TB = tbl(ver),
    declared: string[] = [],
    labelOf = new Map<string, string>(),
    noPick = new Set<string>();
  for (const x of nl.nodes) {
    const nm = typeof x === 'string' ? x : x.name;
    if (isObj(x) && x.probe !== undefined) labelOf.set(nm, x.probe as string);
    else declared.push(nm);
    if (isObj(x) && x.pickup === false) noPick.add(nm);
  }
  const els = nl.elements.map(e => normalize(e, ver)),
    byId = new Map(els.map(e => [e.id, e])),
    extra: El[] = [],
    hold = o.hold || { shift: 0 };
  const same = (m: string, node: unknown) => m === node || (isGnd(m) && isGnd(node));
  const known = (s: unknown) => typeof s === 'string' && (isGnd(s) || declared.includes(s));
  (faults || []).forEach((f, fi) => {
    // a part soldered the wrong way round: its legs sit on each other's pads (so before the board)
    if (!isObj(f) || f.kind !== 'reverse') return;
    const e = byId.get(f.element!);
    if (!e) throw fail('fault', { index: fi });
    const pins = (f.pins === undefined ? (e.n.length === 2 ? [0, 1] : null) : f.pins) as number[] | null;
    if (
      !Array.isArray(pins) ||
      pins.length !== 2 ||
      !pins.every(k => Number.isInteger(k) && k >= 0 && k < e.n.length) ||
      pins[0] === pins[1]
    )
      throw fail('fault', { index: fi });
    const x = e.n[pins[0]!];
    e.n[pins[0]!] = e.n[pins[1]!]!;
    e.n[pins[1]!] = x!;
  });
  (faults || []).forEach((f, fi) => {
    if (!isObj(f) || f.kind !== 'open-trace') return;
    if (!known(f.node)) throw fail('fault', { index: fi });
    const far = `#trace:${fi}`;
    let side = f.side;
    if (side === undefined) {
      const touching = els.filter(e => e.n.some(m => same(m, f.node)));
      if (touching.length < 2) throw fail('fault', { index: fi });
      side = [touching[touching.length - 1]!.id];
    }
    if (!Array.isArray(side) || !side.length) throw fail('fault', { index: fi });
    for (const s of side) {
      const [eid, pin] = parsePinRef(s),
        e = byId.get(eid);
      if (!e) throw fail('fault', { index: fi });
      if (pin === undefined) {
        if (!e.n.some(m => same(m, f.node))) throw fail('fault', { index: fi });
        e.n = e.n.map(m => (same(m, f.node) ? far : m));
      } else {
        if (!(pin < e.n.length) || !same(e.n[pin]!, f.node)) throw fail('fault', { index: fi });
        e.n[pin] = far;
      }
    }
  });
  for (const e of els) e.board = e.n.slice(); // where the legs are soldered: pin references "@R1.0" measure here
  (faults || []).forEach((f, fi) => {
    if (!isObj(f)) throw fail('fault', { index: fi });
    if (f.kind === 'open-trace' || f.kind === 'reverse') return;
    const e = byId.get(f.element!);
    if (!e) throw fail('fault', { index: fi });
    if (f.kind === 'open') {
      const pins = f.pin !== undefined ? [f.pin] : e.n.map((_, k) => k);
      for (const k of pins) {
        if (!(Number.isInteger(k) && k >= 0 && k < e.n.length)) throw fail('fault', { index: fi });
        e.n[k] = `#open:${fi}.${k}`;
      }
    } else if (f.kind === 'short') {
      const pins = f.pins || TB.SP[e.type] || [0, 1];
      if (
        !Array.isArray(pins) ||
        pins.length !== 2 ||
        !pins.every(k => Number.isInteger(k) && k >= 0 && k < e.n.length) ||
        pins[0] === pins[1]
      )
        throw fail('fault', { index: fi });
      if (e.n.length === 2) {
        e.type = 'R';
        e.p = { value: RSHORT };
      } else
        extra.push({
          id: `#short:${fi}`,
          type: 'R',
          n: [e.n[pins[0] as number]!, e.n[pins[1] as number]!],
          board: [],
          p: { value: RSHORT },
        } as unknown as El);
    } else if (f.kind === 'drift') {
      const ep = e.p as unknown as Record<string, number>;
      const factor = f.factor === undefined ? (ver === 2 && f.add !== undefined ? 1 : 2) : num(f.factor),
        param = f.param || TB.DP[e.type];
      const add = ver === 2 && f.add !== undefined ? num(f.add) : 0;
      if (!(factor > 0) || !Number.isFinite(add)) throw fail('fault', { index: fi });
      if (param === 'value' && (e.type === 'V' || e.type === 'I')) {
        e.p.value = scaleWave(e.p.value as Wave, factor);
        if (add) e.p.value = shiftWave(e.p.value, add);
      } else if (typeof ep[param!] === 'number') {
        ep[param!]! *= factor;
        if (add) ep[param!]! += add;
      } else if (ver === 2 && ep[param!] === undefined && Object.prototype.hasOwnProperty.call(TB.P[e.type] || {}, param!)) {
        if (add) ep[param!] = add;
      } // (an unset vos, ib … that a fault sets)
      else if (param === 'rails' && Array.isArray(e.p.rails)) e.p.rails = e.p.rails.map(v => v * factor);
      else throw fail('fault', { index: fi });
    } else throw fail('fault', { index: fi });
  });
  if (ver === 2) compile2(els, extra, nl, noPick, labelOf, byId, o, declared);
  const all = els.concat(extra);
  // node indices: declared names first (ground = −1), then the private nodes the faults made
  const index = new Map<string, number>();
  let N = 0;
  const idx = (nm: string): number => {
    if (isGnd(nm)) return -1;
    if (!index.has(nm)) index.set(nm, N++);
    return index.get(nm)!;
  };
  declared.forEach(idx);
  for (const e of all) e.n.forEach(idx);
  let nb = 0;
  for (const e of all) {
    e.pins = e.n.map(idx);
    e.boardPins = e.board.map(idx);
    e.k = -1;
    const p = e.p,
      t = e.type;
    e.a = e.pins[0]!;
    e.c = e.pins[1]!;
    e.d = e.pins.length > 2 ? e.pins[2]! : -1;
    if (t === 'R') e.g = 1 / (p.value as number);
    else if (t === 'SW') e.g = 1 / (e.on ? p.Ron! : p.Roff!);
    else if (t === 'C') {
      e.C = p.value as number;
      e.ic = p.ic === undefined ? null : p.ic;
      if (e.ic !== null) e.k = nb++;
    } else if (t === 'L') {
      e.L = p.value as number;
      e.ic = p.ic === undefined ? null : p.ic;
      e.k = nb++;
    } else if (t === 'V' || t === 'I') {
      const pw = p.value as Wave,
        w = pw.kind === 'noise' ? Object.assign({}, pw, { hold, seed: hash32(e.id, ((o.seed! >>> 0) ^ (pw.seed! >>> 0)) >>> 0) }) : pw;
      e.w = wave(w);
      e.wk = w.kind;
      if (t === 'V') e.k = nb++;
      e.per =
        w.kind === 'pwm' || w.kind === 'sine'
          ? 1 / w.freq!
          : w.kind === 'pulse'
            ? w.period! > 0
              ? w.period!
              : 0
            : w.kind === 'noise'
              ? w.hum! > 0 && w.humAmp
                ? 1 / w.hum!
                : 1 / (2 * w.bw!)
              : 0;
    } else if (t === 'D') {
      e.Is = p.Is!;
      e.nvt = p.n! * VT;
      e.vcrit = e.nvt * Math.log(e.nvt / (Math.SQRT2 * e.Is));
      e.s = { v: 0 };
      e.bv = p.Bv! > 0 ? p.Bv! : 0;
      if (e.bv) {
        e.ibv = p.Ibv! > 0 ? p.Ibv! : 1e-3;
        e.vcritb = VT * Math.log(VT / (Math.SQRT2 * e.ibv));
      }
    } else if (t === 'NPN' || t === 'PNP') {
      e.pol = t === 'NPN' ? 1 : -1;
      e.Is = p.Is!;
      e.bf = p.betaF!;
      e.br = p.betaR!;
      e.vcrit = VT * Math.log(VT / (Math.SQRT2 * e.Is));
      e.s = { vbe: 0, vbc: 0 };
    } else if (t === 'NMOS' || t === 'PMOS') {
      e.pol = t === 'NMOS' ? 1 : -1;
      e.vth = Math.abs(p.Vth!);
      e.kp = p.k!;
      e.lam = p.lambda!;
    } else if (t === 'OPAMP') {
      e.A = p.gain!;
      e.lo = p.rails![0]!;
      e.hi = p.rails![1]!;
      e.head = p.headroom!;
      e.rp = e.pins.length === 5 ? e.pins[3]! : null;
      e.rn = e.pins.length === 5 ? e.pins[4]! : null;
      e.k = nb++;
      e.vos = p.vos || 0;
      e.ib = p.ib || 0;
      e.y = e.yName ? idx(e.yName) : -1;
      if (e.outName) e.d = idx(e.outName);
      if (e.y >= 0) {
        e.gm = e.A / ROP;
        e.imax = p.slew! > 0 ? p.slew! * e.cp! : Infinity;
      }
    } else if (t === 'TLINE') {
      e.z0 = p.z0!;
      e.td = p.td !== undefined ? p.td : p.len! / (p.vf! * C0);
      e.tl = e.pins.length === 4 ? (e.pins.slice() as [number, number, number, number]) : [e.pins[0]!, -1, e.pins[1]!, -1];
      e.k = nb;
      nb += 2;
    } else if (t === 'VSW') {
      e.cn = e.pins[3]!;
      e.lgon = Math.log(1 / p.Ron!);
      e.lgoff = Math.log(1 / p.Roff!);
      e.von = p.Von!;
      e.voff = p.Voff === p.Von ? p.Von! - 1e-3 : p.Voff!;
    }
  }
  for (const e of all) if (e.k >= 0) e.k += N;
  const outNames = declared.slice();
  if (!outNames.some(isGnd)) outNames.push('gnd');
  for (const l of labelOf.keys()) outNames.push(l);
  const resolveName = (nm: string) => (isGnd(nm) ? -1 : labelOf.has(nm) ? idx(labelOf.get(nm)!) : index.get(nm));
  return {
    N,
    S: N + nb,
    els: all,
    real: all.filter(e => e.id[0] !== '#'),
    byId,
    index,
    outNames,
    resolveName,
    ver,
    hold,
    linear: !all.some(e => NONLINEAR.has(e.type)),
    sources: all.filter(e => e.w),
    varying: all.some(e => e.w && e.wk !== 'dc'),
    pickup: all.some(e => e.id === '#hum'),
  };
}

/** the parts every real device has (junction and gate capacitances, a MOSFET's body diode, an op-amp's internal pole and output
      resistance), the pickup of every node without a DC path to ground, then the probe's own parts (o.extras: a meter's input
      resistance, a scope probe's capacitance and ground lead) — all hidden elements, ids starting with '#' */
function compile2(
  els: El[],
  extra: El[],
  nl: Netlist,
  noPick: Set<string>,
  labelOf: Map<string, string>,
  byId: Map<string, El>,
  o: CompileOpts,
  declared: string[],
) {
  const hid = (id: string, type: string, n: string[], p: ElP) => extra.push({ id, type, n, board: [], p } as unknown as El);
  for (const e of els) {
    const p = e.p,
      n = e.n,
      cap = (tag: string, a: string, b: string, v: number | undefined) => {
        if (v! > 0) hid('#c' + tag + ':' + e.id, 'C', [a, b], { value: v! });
      };
    if (e.type === 'D') cap('j', n[0]!, n[1]!, p.Cj);
    else if (e.type === 'NPN' || e.type === 'PNP') {
      cap('be', n[1]!, n[2]!, p.Cbe);
      cap('bc', n[1]!, n[0]!, p.Cbc);
    } else if (e.type === 'NMOS' || e.type === 'PMOS') {
      cap('gs', n[1]!, n[2]!, p.Cgs);
      cap('gd', n[1]!, n[0]!, p.Cgd);
      cap('ds', n[0]!, n[2]!, p.Cds);
      if (p.body === true) hid('#body:' + e.id, 'D', e.type === 'NMOS' ? [n[2]!, n[0]!] : [n[0]!, n[2]!], { Is: 1e-12, n: 1.3 });
    } else if (e.type === 'OPAMP') {
      if (p.gbw! > 0 || p.slew! > 0) {
        // one pole: gain·ROP/(1 + s·ROP·Cp) = gain at DC, unity at gbw; the slew rate limits the current into Cp
        const gbw = p.gbw! > 0 ? p.gbw! : 1e6,
          Cp = p.gain! / (2 * Math.PI * gbw * ROP);
        e.yName = '#op:' + e.id;
        e.cp = Cp;
        hid('#rp:' + e.id, 'R', [e.yName, 'gnd'], { value: ROP });
        hid('#cp:' + e.id, 'C', [e.yName, 'gnd'], { value: Cp });
      }
      if (p.rout! > 0) {
        e.outName = '#opo:' + e.id;
        hid('#rout:' + e.id, 'R', [e.outName, n[2]!], { value: p.rout! });
      }
      if (p.vos) {
        const v = '#vos:' + e.id;
        hid('#vsrc:' + e.id, 'V', [v, n[0]!], { value: { kind: 'dc', dc: p.vos } });
        n[0] = v;
        p.vos = 0;
      } // the offset: a source in series with in+
    }
  }
  const pk: Rec = isObj(nl.pickup) ? nl.pickup : {},
    pv = (k: keyof typeof PICKUP) => (pk[k] !== undefined ? num(pk[k]) : PICKUP[k]);
  if (nl.pickup !== false && !o.noPickup) {
    // a node with no DC path to ground picks up mains hum and noise through a high impedance
    const par = new Map<string, string>(),
      f = (s: string) => {
        s = isGnd(s) ? 'gnd' : s;
        while (par.has(s) && par.get(s) !== s) s = par.get(s)!;
        return s;
      },
      u = (a: string, b: string) => {
        const x = f(a),
          y = f(b);
        if (x !== y) par.set(x, y);
      };
    const names = new Set<string>();
    for (const e of els.concat(extra)) {
      const n = e.n;
      n.forEach(m => {
        if (!isGnd(m)) names.add(m);
      });
      if (['R', 'L', 'V', 'D', 'VSW'].includes(e.type) || (e.type === 'SW' && e.on))
        u(n[0]!, n[1]!); // (an open switch is no path)
      else if (e.type === 'NPN' || e.type === 'PNP') {
        u(n[0]!, n[1]!);
        u(n[1]!, n[2]!);
      } else if (e.type === 'NMOS' || e.type === 'PMOS') u(n[0]!, n[2]!);
      else if (e.type === 'OPAMP') {
        u(n[2]!, 'gnd');
        if (e.outName) u(e.outName, 'gnd');
        if (e.yName) u(e.yName, 'gnd');
      } else if (e.type === 'TLINE') {
        const q = n.length === 4 ? n : [n[0], 'gnd', n[1], 'gnd'];
        u(q[0]!, q[2]!);
        u(q[1]!, q[3]!);
      }
    }
    const fl = [...names].filter(m => f(m) !== f('gnd') && !noPick.has(m));
    if (fl.length) {
      let top = 0;
      for (const e of els)
        if (e.type === 'V') {
          const a = wave(e.p.value as Wave).avg;
          if (a > top) top = a;
        }
      hid('#hum', 'V', ['#humn', 'gnd'], {
        value: {
          kind: 'noise',
          offset: pk.offset !== undefined ? num(pk.offset) : top / 2,
          rms: pv('noise'),
          bw: pv('bw'),
          wander: pv('wander'),
          hum: pv('hum'),
          humAmp: pv('amp'),
          seed: 0,
          pickup: true,
        },
      });
      for (const m of fl) hid('#pick:' + m, 'R', [m, '#humn'], { value: pv('r') });
    }
  }
  const at = (s: unknown) => {
    // a probe's endpoint → the name of the node it touches
    if (typeof s !== 'string') throw fail('unknown-node', { ref: s });
    if (isGnd(s)) return 'gnd';
    if (labelOf.has(s)) return labelOf.get(s)!;
    if (s[0] === '@') {
      const [eid, pin] = parsePinRef(s.slice(1)),
        e = byId.get(eid);
      if (!e || pin === undefined || !(pin < e.board.length)) throw fail('unknown-node', { ref: s });
      return e.board[pin]!;
    }
    if (!declared.includes(s)) throw fail('unknown-node', { ref: s });
    return s;
  };
  (o.extras || []).forEach((x, i) =>
    hid(
      `#probe${i}:${x.type}`,
      x.type,
      x.n.map(m => (m[0] === '#' && m[1] === '#' ? m.slice(1) : at(m))),
      { value: x.value as number },
    ),
  );
}

// ---- dense LU with partial pivoting ----
function factor(M: Float64Array, n: number, perm: Int32Array) {
  for (let k = 0; k < n; k++) {
    let p = k,
      mx = Math.abs(M[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const a = Math.abs(M[i * n + k]!);
      if (a > mx) {
        mx = a;
        p = i;
      }
    }
    if (!(mx > 1e-20)) return false;
    perm[k] = p;
    if (p !== k)
      for (let j = 0; j < n; j++) {
        const t = M[k * n + j];
        M[k * n + j] = M[p * n + j]!;
        M[p * n + j] = t!;
      }
    const piv = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k]! / piv!;
      M[i * n + k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j++) M[i * n + j]! -= f * M[k * n + j]!;
    }
  }
  return true;
}
function subst(M: Float64Array, n: number, perm: Int32Array, b: Float64Array, x: Float64Array) {
  x.set(b);
  for (let k = 0; k < n; k++) {
    const p = perm[k];
    if (p !== k) {
      const t = x[k];
      x[k] = x[p!]!;
      x[p!] = t!;
    }
  }
  for (let i = 1; i < n; i++) {
    let s = x[i];
    for (let j = 0; j < i; j++) s! -= M[i * n + j]! * x[j]!;
    x[i] = s!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s! -= M[i * n + j]! * x[j]!;
    x[i] = s! / M[i * n + i]!;
  }
}

// ---- complex dense LU with partial pivoting (the AC analysis) ----
function cfactor(R: Float64Array, I: Float64Array, n: number, perm: Int32Array) {
  for (let k = 0; k < n; k++) {
    let p = k,
      mx = R[k * n + k]! * R[k * n + k]! + I[k * n + k]! * I[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const a = R[i * n + k]! * R[i * n + k]! + I[i * n + k]! * I[i * n + k]!;
      if (a > mx) {
        mx = a;
        p = i;
      }
    }
    if (!(mx > 1e-40)) return false;
    perm[k] = p;
    if (p !== k)
      for (let j = 0; j < n; j++) {
        let t = R[k * n + j];
        R[k * n + j] = R[p * n + j]!;
        R[p * n + j] = t!;
        t = I[k * n + j];
        I[k * n + j] = I[p * n + j]!;
        I[p * n + j] = t!;
      }
    const pr = R[k * n + k],
      pi = I[k * n + k],
      d = pr! * pr! + pi! * pi!;
    for (let i = k + 1; i < n; i++) {
      const ar = R[i * n + k],
        ai = I[i * n + k];
      if (ar === 0 && ai === 0) continue;
      const fr = (ar! * pr! + ai! * pi!) / d,
        fi = (ai! * pr! - ar! * pi!) / d;
      R[i * n + k] = fr;
      I[i * n + k] = fi;
      for (let j = k + 1; j < n; j++) {
        const br = R[k * n + j],
          bi = I[k * n + j];
        R[i * n + j]! -= fr * br! - fi * bi!;
        I[i * n + j]! -= fr * bi! + fi * br!;
      }
    }
  }
  return true;
}
function csubst(
  R: Float64Array,
  I: Float64Array,
  n: number,
  perm: Int32Array,
  br: Float64Array,
  bi: Float64Array,
  xr: Float64Array,
  xi: Float64Array,
) {
  xr.set(br);
  xi.set(bi);
  for (let k = 0; k < n; k++) {
    const p = perm[k];
    if (p !== k) {
      let t = xr[k];
      xr[k] = xr[p!]!;
      xr[p!] = t!;
      t = xi[k];
      xi[k] = xi[p!]!;
      xi[p!] = t!;
    }
  }
  for (let i = 1; i < n; i++) {
    let sr = xr[i],
      si = xi[i];
    for (let j = 0; j < i; j++) {
      const lr = R[i * n + j],
        li = I[i * n + j];
      sr! -= lr! * xr[j]! - li! * xi[j]!;
      si! -= lr! * xi[j]! + li! * xr[j]!;
    }
    xr[i] = sr!;
    xi[i] = si!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = xr[i],
      si = xi[i];
    for (let j = i + 1; j < n; j++) {
      const ur = R[i * n + j],
        ui = I[i * n + j];
      sr! -= ur! * xr[j]! - ui! * xi[j]!;
      si! -= ur! * xi[j]! + ui! * xr[j]!;
    }
    const dr = R[i * n + i],
      di = I[i * n + i],
      d = dr! * dr! + di! * di!;
    xr[i] = (sr! * dr! + si! * di!) / d;
    xi[i] = (si! * dr! - sr! * di!) / d;
  }
}
/** a frequency response in numbers — gain in dB, phase in degrees (unwrapped), and its landmarks */
function acStats(f: readonly number[], re: readonly number[], im: readonly number[]) {
  const n = f.length,
    db: number[] = [],
    ph: number[] = [];
  let off = 0,
    prev = null as number | null;
  for (let i = 0; i < n; i++) {
    db.push(20 * Math.log10(Math.hypot(re[i]!, im[i]!) || 1e-300));
    let p = (Math.atan2(im[i]!, re[i]!) * 180) / Math.PI + off;
    if (prev !== null) {
      while (p - prev > 180) {
        p -= 360;
        off -= 360;
      }
      while (p - prev < -180) {
        p += 360;
        off += 360;
      }
    }
    ph.push(p);
    prev = p;
  }
  let ip = 0;
  for (let i = 1; i < n; i++) if (db[i]! > db[ip]!) ip = i;
  const lf = (i: number) => Math.log(f[i]!),
    cross = (i: number, j: number, lvl: number) => Math.exp(lf(i) + ((lf(j) - lf(i)) * (lvl - db[i]!)) / (db[j]! - db[i]! || 1));
  const pk = db[ip]!,
    lvl = pk - 3;
  let f3 = NaN;
  for (let i = ip + 1; i < n; i++)
    if (db[i]! <= lvl) {
      f3 = cross(i - 1, i, lvl);
      break;
    }
  let fl = NaN;
  for (let i = ip - 1; i >= 0; i--)
    if (db[i]! <= lvl) {
      fl = cross(i + 1, i, lvl);
      break;
    }
  let fu = NaN,
    pmg = NaN;
  for (let i = 1; i < n; i++)
    if (db[i - 1]! > 0 && db[i]! <= 0) {
      fu = cross(i - 1, i, 0);
      const t = (Math.log(fu) - lf(i - 1)) / (lf(i) - lf(i - 1) || 1);
      pmg = 180 + ph[i - 1]! + (ph[i]! - ph[i - 1]!) * t;
      break;
    }
  return { db, phase: ph, dcDb: db[0]!, peakDb: pk, fPeak: f[ip]!, f3db: f3, fLow3db: fl, fUnity: fu, pm: pmg };
}

// ---- device equations ----
const ex = (a: number) => (a < 80 ? Math.exp(a) : EX80 * (1 + a - 80));
const dex = (a: number) => (a < 80 ? Math.exp(a) : EX80);
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number) {
  // SPICE junction limiting
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}
function bjt(e: El, vbe: number, vbc: number, q: Q) {
  const ef = ex(vbe / VT),
    er = ex(vbc / VT),
    df = dex(vbe / VT) / VT,
    dr = dex(vbc / VT) / VT;
  q.ibe = (e.Is! / e.bf!) * (ef - 1);
  q.gbe = (e.Is! / e.bf!) * df;
  q.ibc = (e.Is! / e.br!) * (er - 1);
  q.gbc = (e.Is! / e.br!) * dr;
  q.ict = e.Is! * (ef - er);
  q.gmf = e.Is! * df;
  q.gmr = e.Is! * dr;
  return q;
}
function mos(e: El, vgs: number, vds: number, q: Q) {
  const vov = vgs - e.vth!,
    k = e.kp,
    lam = e.lam;
  if (vov <= 0) {
    q.id = 0;
    q.gm = 0;
    q.gds = 0;
  } else if (vds < vov) {
    const l = 1 + lam! * vds,
      base = vov * vds - (vds * vds) / 2;
    q.id = k! * base * l;
    q.gm = k! * vds * l;
    q.gds = k! * (vov - vds) * l + k! * base * lam!;
  } else {
    const l = 1 + lam! * vds;
    q.id = (k! / 2) * vov * vov * l;
    q.gm = k! * vov * l;
    q.gds = (k! / 2) * vov * vov * lam!;
  }
  return q;
}

// ---- seeded noise ----
function hash32(s: string, seed: number) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- the simulator ----
function makeSim(ck: ReturnType<typeof compile>, noise: Noise | null) {
  const { N, S } = ck;
  const A = new Float64Array(S * S),
    B = new Float64Array(S),
    X = new Float64Array(S),
    Xn = new Float64Array(S),
    LU = new Float64Array(S * S),
    perm = new Int32Array(S);
  let luKey = null as string | null,
    limited = false;
  const q = {} as Q;
  const vx = (x: Float64Array, i: number) => (i < 0 ? 0 : x[i]!);
  function G(a: number, c: number, g: number) {
    if (a >= 0) {
      A[a * S + a]! += g;
      if (c >= 0) {
        A[a * S + c]! -= g;
        A[c * S + a]! -= g;
      }
    }
    if (c >= 0) A[c * S + c]! += g;
  }
  function J(a: number, c: number, i: number) {
    if (a >= 0) B[a]! -= i;
    if (c >= 0) B[c]! += i;
  } // a constant current a → c through the element
  function VC(a: number, c: number, p: number, r: number, g: number) {
    // a current g·(v_p − v_r) from a to c
    if (a >= 0) {
      if (p >= 0) A[a * S + p]! += g;
      if (r >= 0) A[a * S + r]! -= g;
    }
    if (c >= 0) {
      if (p >= 0) A[c * S + p]! -= g;
      if (r >= 0) A[c * S + r]! += g;
    }
  }
  function BR(a: number, c: number, k: number) {
    if (a >= 0) A[a * S + k]! += 1;
    if (c >= 0) A[c * S + k]! -= 1;
  } // the branch current k leaves a, enters c
  function ROWV(k: number, a: number, c: number) {
    if (a >= 0) A[k * S + a]! += 1;
    if (c >= 0) A[k * S + c]! -= 1;
  }
  const srcVal = (e: El, ctx: Ctx) => (ctx.mode === 'ohm' ? 0 : ctx.src * (ctx.avg ? e.w!.avg : ctx.t0m ? e.w!.at0m : e.w!.at(ctx.t)));

  function stamp(ctx: Ctx, x: Float64Array) {
    A.fill(0);
    B.fill(0);
    limited = false;
    const gs = GMIN + ctx.gsh!,
      tran = ctx.mode === 'tran',
      ohm = ctx.mode === 'ohm',
      op0 = ctx.mode === 'op0';
    for (let i = 0; i < N; i++) A[i * S + i]! += gs;
    for (const e of ck.els) {
      const a = e.a,
        c = e.c,
        k = e.k;
      switch (e.type) {
        case 'R':
        case 'SW':
          G(a, c, e.g!);
          break;
        case 'C':
          if (k >= 0) {
            if (op0) {
              BR(a, c, k);
              ROWV(k, a, c);
              B[k] = e.ic!;
            } else A[k * S + k] = 1;
          }
          if (tran && !ctx.dae) {
            const geq = ((ctx.be ? 1 : 2) * e.C!) / ctx.h!,
              ieq = geq * e.vp! + (ctx.be ? 0 : e.ip!);
            G(a, c, geq);
            J(a, c, -ieq);
          } // (dae: C is in the kernel's M)
          break;
        case 'L':
          BR(a, c, k);
          if (op0 && e.ic !== null) {
            A[k * S + k] = 1;
            B[k] = e.ic!;
            break;
          }
          ROWV(k, a, c);
          if (tran && !ctx.dae) {
            const req = ((ctx.be ? 1 : 2) * e.L!) / ctx.h!;
            A[k * S + k]! -= req;
            B[k] = -req * e.ip! - (ctx.be ? 0 : e.vp!);
          } // (dae: −L in M)
          break;
        case 'V':
          BR(a, c, k);
          ROWV(k, a, c);
          B[k] = srcVal(e, ctx);
          break;
        case 'I':
          J(a, c, -srcVal(e, ctx));
          break; // drives the current into n[0]
        case 'D': {
          const v = vx(x, a) - vx(x, c);
          let vl = pnjlim(v, e.s!.v!, e.nvt!, e.vcrit!);
          if (e.bv && v < 0 && !ohm) {
            const u = -v - e.bv,
              ul = pnjlim(u, -e.s!.v! - e.bv, VT, e.vcritb!);
            if (ul !== u) vl = -ul - e.bv;
          } // reverse breakdown (Zener, TVS)
          if (vl !== v) limited = true;
          e.s!.v = vl;
          let g0 = (e.Is! * dex(vl / e.nvt!)) / e.nvt!,
            i0 = e.Is! * (ex(vl / e.nvt!) - 1);
          if (e.bv && !ohm) {
            const w = -(vl + e.bv) / VT; // (the ohmmeter's open-circuit voltage, ~3 V, never reaches a breakdown)
            i0 -= e.ibv! * ex(w);
            g0 += (e.ibv! * dex(w)) / VT;
          }
          G(a, c, g0 + GMIN);
          J(a, c, i0 - g0 * vl);
          break;
        }
        case 'VSW': {
          // a switch driven by a voltage — log-conductance moves smoothly from Roff (at Voff) to Ron (at Von)
          const vc = vx(x, e.d) - vx(x, e.cn!),
            span = e.von! - e.voff!,
            u0 = (vc - e.voff!) / span,
            u = u0 < 0 ? 0 : u0 > 1 ? 1 : u0;
          const sm = u * u * (3 - 2 * u),
            ds = u0 > 0 && u0 < 1 ? (6 * u * (1 - u)) / span : 0;
          const g = Math.exp(e.lgoff! + (e.lgon! - e.lgoff!) * sm),
            gc = g * (e.lgon! - e.lgoff!) * ds * (vx(x, a) - vx(x, c));
          G(a, c, g);
          VC(a, c, e.d, e.cn!, gc);
          J(a, c, -gc * vc);
          break;
        }
        case 'TLINE': {
          // a lossless line, method of characteristics — v_k − Z0·i_k = v_j(t − td) + Z0·i_j(t − td); in DC a pair of wires
          const [p1, m1, p2, m2] = e.tl!,
            k1 = k,
            k2 = k + 1,
            z = e.z0;
          BR(p1, m1, k1);
          BR(p2, m2, k2);
          ROWV(k1, p1, m1);
          A[k1 * S + k1]! -= z!;
          ROWV(k2, p2, m2);
          A[k2 * S + k2]! -= z!;
          if (tran) {
            B[k1] = e.E1!;
            B[k2] = e.E2!;
          } else {
            ROWV(k1, m2, p2);
            A[k1 * S + k2]! -= z!;
            ROWV(k2, m1, p1);
            A[k2 * S + k1]! -= z!;
          }
          break;
        }
        case 'NPN':
        case 'PNP': {
          const p = e.pol,
            C_ = a,
            B_ = c,
            E_ = e.d,
            vb = vx(x, B_);
          const r1 = p! * (vb - vx(x, E_)),
            r2 = p! * (vb - vx(x, C_));
          const vbe = pnjlim(r1, e.s!.vbe!, VT, e.vcrit!),
            vbc = pnjlim(r2, e.s!.vbc!, VT, e.vcrit!);
          if (vbe !== r1 || vbc !== r2) limited = true;
          e.s!.vbe = vbe;
          e.s!.vbc = vbc;
          bjt(e, vbe, vbc, q);
          G(B_, E_, q.gbe + GMIN);
          J(B_, E_, p! * (q.ibe - q.gbe * vbe));
          G(B_, C_, q.gbc + GMIN);
          J(B_, C_, p! * (q.ibc - q.gbc * vbc));
          VC(C_, E_, B_, E_, q.gmf);
          VC(C_, E_, B_, C_, -q.gmr);
          J(C_, E_, p! * (q.ict - q.gmf * vbe + q.gmr * vbc));
          break;
        }
        case 'NMOS':
        case 'PMOS': {
          const p = e.pol,
            D_ = a,
            G_ = c,
            S_ = e.d,
            vd = vx(x, D_),
            vs = vx(x, S_);
          const sw = p! * (vd - vs) < 0,
            dd = sw ? S_ : D_,
            ss = sw ? D_ : S_,
            vss = sw ? vd : vs;
          const vgs = p! * (vx(x, G_) - vss),
            vds = p! * ((sw ? vs : vd) - vss);
          mos(e, vgs, vds, q);
          VC(dd, ss, G_, ss, q.gm);
          G(dd, ss, q.gds + GMIN);
          J(dd, ss, p! * (q.id - q.gm * vgs - q.gds * vds));
          break;
        }
        case 'OPAMP': {
          const out = e.d;
          BR(out, -1, k);
          if (ohm) {
            A[k * S + k] = 1;
            break;
          }
          if (e.ib) {
            J(a, -1, e.ib * ctx.src);
            J(c, -1, e.ib * ctx.src);
          } // input bias current, into both inputs
          const vp = vx(x, a),
            vn = vx(x, c),
            rails = e.rp !== null;
          const hi = rails ? vx(x, e.rp!) : e.hi,
            lo = rails ? vx(x, e.rn!) : e.lo;
          let hh = (hi! - lo!) / 2 - e.head!,
            dh = 1;
          if (hh < 1e-3) {
            hh = 1e-3;
            dh = 0;
          }
          const vd = vp - vn,
            dyn = e.y! >= 0;
          let y: number, gy: number; // what drives the output stage: gain·(vd + vos), or (with gbw / slew) the internal pole's node
          if (dyn) {
            const Y = e.y,
              yv = vx(x, Y!),
              vdo = vd + e.vos! * ctx.src;
            let iy: number, gd: number;
            if (e.imax! < Infinity) {
              const th = Math.tanh((e.gm! * vdo) / e.imax!);
              iy = e.imax! * th;
              gd = e.gm! * (1 - th * th);
            } else {
              iy = e.gm! * vdo;
              gd = e.gm!;
            }
            if (a >= 0) A[Y! * S + a]! -= gd;
            if (c >= 0) A[Y! * S + c]! += gd;
            B[Y!]! += iy - gd * vd;
            const L = hh + 0.3,
              sm = 0.05,
              sp = (u: number) => (u / sm > 40 ? u : sm * Math.log1p(Math.exp(u / sm))),
              sg_ = (u: number) => 1 / (1 + Math.exp(-u / sm));
            const icl = GCL * (sp(yv - L) - sp(-yv - L)),
              dcl = GCL * (sg_(yv - L) + sg_(-yv - L));
            A[Y! * S + Y!]! += dcl;
            B[Y!]! -= icl - dcl * yv;
            y = yv;
            gy = 1;
          } else {
            y = e.A! * (vd + e.vos! * ctx.src);
            gy = e.A!;
          } // (vos and ib scale with the sources: source stepping can then start from a quiet op-amp)
          // linear (exact gain A) up to a knee m below the rail, then an exponential approach: smooth, C¹, bounded
          const m = Math.min(0.05, hh / 2),
            knee = hh - m,
            ay = Math.abs(y);
          let f = (hi! + lo!) / 2,
            fd = gy,
            fh = 0;
          if (ay <= knee) f += y;
          else {
            const sg = y < 0 ? -1 : 1,
              ez = Math.exp(-(ay - knee) / m);
            f += sg * (hh - m * ez);
            fd = gy * ez;
            fh = dh * sg * (1 - ez);
          }
          if (out >= 0) A[k * S + out]! += 1;
          let rhs;
          if (dyn) {
            A[k * S + e.y!]! -= fd;
            rhs = f - fd * y;
          } else {
            if (a >= 0) A[k * S + a]! -= fd;
            if (c >= 0) A[k * S + c]! += fd;
            rhs = f - fd * vd;
          }
          if (rails) {
            const dhi = 0.5 + 0.5 * fh,
              dlo = 0.5 - 0.5 * fh;
            if (e.rp! >= 0) A[k * S + e.rp!]! -= dhi;
            if (e.rn! >= 0) A[k * S + e.rn!]! -= dlo;
            rhs -= dhi * hi! + dlo * lo!;
          }
          B[k] = rhs;
          break;
        }
      }
    }
    if (ohm) {
      const { a, b } = ctx.test!;
      if (a >= 0) B[a]! += OHM_I;
      if (b >= 0) B[b]! -= OHM_I;
    }
  }

  function newton(ctx: Ctx, x0: Float64Array, maxIt: number) {
    X.set(x0);
    const key = ck.linear ? `${ctx.mode}|${ctx.be}|${ctx.h}|${ctx.gsh}` : null;
    for (let it = 0; it < maxIt; it++) {
      stamp(ctx, X);
      if (!(key && key === luKey)) {
        LU.set(A);
        luKey = null;
        if (!factor(LU, S, perm)) {
          if (ck.linear) throw fail('singular');
          return false;
        }
        luKey = key;
      }
      subst(LU, S, perm, B, Xn);
      let conv = true;
      for (let i = 0; i < S; i++) {
        const v = Xn[i];
        if (!Number.isFinite(v)) return false;
        if (conv && Math.abs(v! - X[i]!) > (i < N ? 1e-6 : 1e-9) + 1e-6 * Math.abs(v!)) conv = false;
      }
      X.set(Xn);
      if (ck.linear || (conv && !limited)) return true;
    }
    return false;
  }
  /** an operating point; Newton, then gmin stepping, then source stepping */
  function op(ctx: Ctx) {
    const zero = new Float64Array(S);
    ctx.gsh = 0;
    ctx.src = 1;
    if (newton(ctx, zero, 150)) return Float64Array.from(X);
    let xg = zero,
      ok = true;
    for (let i = 2; i <= 12 && ok; i++) {
      ctx.gsh = Math.pow(10, -i);
      if (newton(ctx, xg, 150)) xg = Float64Array.from(X);
      else ok = false;
    }
    ctx.gsh = 0;
    if (ok && newton(ctx, xg, 150)) return Float64Array.from(X);
    xg = zero;
    ok = true;
    for (let s = 1; s <= 10 && ok; s++) {
      ctx.src = s / 10;
      if (newton(ctx, xg, 150)) xg = Float64Array.from(X);
      else ok = false;
    }
    ctx.src = 1;
    if (ok) return xg;
    throw fail('no-convergence', { mode: ctx.mode });
  }

  /** the pin currents of an element at the solution x (current into each pin) */
  function pinCurrents(e: El, x: Float64Array, ctx: Ctx): number[] {
    const a = e.a,
      c = e.c,
      va = vx(x, a),
      vc = vx(x, c);
    switch (e.type) {
      case 'R':
      case 'SW': {
        const i = (va - vc) * e.g!;
        return [i, -i];
      }
      case 'C': {
        const i = ctx.mode === 'tran' ? e.ip! : 0;
        return [i, -i];
      }
      case 'L':
      case 'V':
        return [x[e.k]!, -x[e.k]!];
      case 'I': {
        const j = srcVal(e, ctx);
        return [-j, j];
      }
      case 'D': {
        const v = va - vc,
          i = e.Is! * (ex(v / e.nvt!) - 1) + GMIN * v - (e.bv ? e.ibv! * ex(-(v + e.bv) / VT) : 0);
        return [i, -i];
      }
      case 'VSW': {
        const vcn = vx(x, e.d) - vx(x, e.cn!),
          u0 = (vcn - e.voff!) / (e.von! - e.voff!),
          u = u0 < 0 ? 0 : u0 > 1 ? 1 : u0,
          i = (va - vc) * Math.exp(e.lgoff! + (e.lgon! - e.lgoff!) * u * u * (3 - 2 * u));
        return [i, -i, 0, 0];
      }
      case 'TLINE': {
        const i1 = x[e.k]!,
          i2 = x[e.k + 1]!;
        return e.pins.length === 4 ? [i1, -i1, i2, -i2] : [i1, i2];
      }
      case 'NPN':
      case 'PNP': {
        const p = e.pol,
          vb = vc,
          vcol = va,
          ve = vx(x, e.d);
        bjt(e, p! * (vb - ve), p! * (vb - vcol), q);
        const ic = p! * (q.ict - q.ibc),
          ib = p! * (q.ibe + q.ibc);
        return [ic, ib, -(ic + ib)];
      }
      case 'NMOS':
      case 'PMOS': {
        const p = e.pol,
          vd = va,
          vs = vx(x, e.d),
          sw = p! * (vd - vs) < 0,
          vss = sw ? vd : vs;
        mos(e, p! * (vc - vss), p! * ((sw ? vs : vd) - vss), q);
        const id = (sw ? -1 : 1) * p! * q.id + GMIN * (vd - vs);
        return [id, 0, -id];
      }
      case 'OPAMP':
        return e.pins.map((_, i) => (i === 2 ? x[e.k]! : i < 2 ? e.ib || 0 : 0));
    }
    return e.pins.map(() => 0);
  }
  const mainCurrent = (e: El, pins: readonly number[]) => (e.type === 'OPAMP' ? pins[2]! : pins[0]!);

  // ---- results ----
  const dcCache: Record<string, { x: Float64Array; ctx: Ctx }> = {};
  function dcX(mode: string) {
    if (!dcCache[mode]) {
      const ctx = { mode: 'op', avg: mode !== 't0', t0m: mode === 't0', t: 0, gsh: 0, src: 1 };
      dcCache[mode] = { x: op(ctx), ctx };
    }
    return dcCache[mode];
  }
  function dc(opts?: { readonly mode?: unknown } | null) {
    const mode = opts && opts.mode === 't0' ? 't0' : 'avg';
    const { x, ctx } = dcX(mode),
      nodes: Record<string, number> = {},
      branches: Record<string, number> = {},
      pins: Record<string, number[]> = {};
    for (const nm of ck.outNames) nodes[nm] = vx(x, ck.resolveName(nm)!)!;
    for (const e of ck.real) {
      const pc = pinCurrents(e, x, ctx);
      pins[e.id] = pc;
      branches[e.id] = mainCurrent(e, pc)!;
    }
    return { nodes, branches, pins };
  }

  let tranCache = null as {
    key: string;
    T: Float64Array;
    V: Float64Array[];
    I: Float64Array[];
    steps: number;
    P: Record<string, Float64Array>;
  } | null;
  /* the transient: trapezoidal companion models, backward Euler on the first step and on every step that holds a source breakpoint
       (SPICE's practice): the gmin-stepping retry of tranAdvanceK below. tranStart / tranAdvance(K) are resumable:
       runTransient() and the stepper (docs/INTERACTIVE_LIBRARY.md §1.6) share them. */
  function tranStart(o: TranOpts, dt: number): TranRun {
    const pw = Array.isArray(o.power) ? (o.power as string[]).filter(id => ck.byId.has(id)) : [];
    const caps = ck.els.filter(e => e.type === 'C'),
      inds = ck.els.filter(e => e.type === 'L'),
      tls = ck.els.filter(e => e.type === 'TLINE');
    for (const e of tls) if (e.td! < dt * (1 - 1e-9)) throw fail('step', { element: e.id, td: e.td, dt });
    let x: Float64Array;
    if (o.uic) {
      x = new Float64Array(S);
      for (const e of caps) {
        e.vp = e.ic === null ? 0 : e.ic!;
        e.ip = 0;
      }
      for (const e of inds) {
        e.ip = e.ic === null ? 0 : e.ic!;
        e.vp = 0;
      }
    } else {
      x = o.fromAvg ? op({ mode: 'op', avg: true, t: 0, gsh: 0, src: 1 }) : op({ mode: 'op0', t0m: true, t: 0, gsh: 0, src: 1 }); // (fromAvg: a meter starts near the steady state)
      for (const e of caps) {
        e.vp = vx(x, e.a) - vx(x, e.c);
        e.ip = 0;
      }
      for (const e of inds) {
        e.ip = x[e.k]!;
        e.vp = vx(x, e.a) - vx(x, e.c);
      }
    }
    const V: number[][] = [];
    for (let i = 0; i < N; i++) V.push([x[i]!]);
    const I = ck.real.map(e => [mainCurrent(e, pinCurrents(e, x, { mode: 'op', t0m: true, t: 0, src: 1 }))]);
    const pwEl = pw.map(id => ck.byId.get(id)!),
      PW = pwEl.map(e => [power(e, x, { mode: 'op', t0m: true, t: 0, src: 1 })]);
    for (const e of tls) {
      e.h = [[], [], [], []];
      tlv(x, e).forEach((v, j) => {
        e.h![j]!.push(v!);
      });
    }
    const tol = 1e-6 * dt;
    return {
      dt,
      tol,
      s: 0,
      xs: x,
      V,
      I,
      pw,
      pwEl,
      PW,
      caps,
      inds,
      tls,
      bp: nextBp(-tol), // a breakpoint at t = 0 makes the first step backward Euler anyway
      ctx: { mode: 'tran', t: 0, h: dt, be: true, gsh: 0, src: 1, avg: false, t0m: false },
    };
  }
  const power = (e: El, xx: Float64Array, c: Ctx) => {
    const pc = pinCurrents(e, xx, c);
    let q = 0;
    e.pins.forEach((pi, j) => {
      q += vx(xx, pi) * pc[j]!;
    });
    return q;
  };
  const tlv = (xx: Float64Array, e: El) => {
    const [p1, m1, p2, m2] = e.tl!;
    return [vx(xx, p1) - vx(xx, m1), xx[e.k], vx(xx, p2) - vx(xx, m2), xx[e.k + 1]];
  };
  const nextBp = (t: number) => {
    let m = Infinity;
    for (const e of ck.sources) {
      const b = e.w!.next(t);
      if (b < m) m = b;
    }
    return m;
  };
  /** n more steps of dt */
  function tranAdvance(R: TranRun, n: number) {
    const { dt, tol, ctx, caps, inds, tls, pwEl } = R;
    for (let q = 0; q < n; q++) {
      const s = R.s,
        t1 = (s + 1) * dt;
      ctx.t = t1;
      ctx.be = s === 0 || R.bp <= t1 + tol;
      if (R.bp <= t1 + tol) R.bp = nextBp(t1 + tol);
      ctx.gsh = 0;
      for (const e of tls) {
        // the waves that left the other end td ago
        const tp = t1 - e.td!,
          h = e.h;
        let w;
        if (tp <= 0) w = [h![0]![0], h![1]![0], h![2]![0], h![3]![0]];
        else {
          const u = tp / dt;
          let i = Math.floor(u + 1e-9);
          if (i > s) i = s;
          const f = Math.max(0, u - i),
            j = Math.min(i + 1, s);
          w = h!.map(a => a[i]! * (1 - f) + a[j]! * f);
        }
        e.E1 = w[2]! + e.z0! * w[3]!;
        e.E2 = w[0]! + e.z0! * w[1]!;
      }
      if (!newton(ctx, R.xs, 60)) {
        let ok = true,
          xg = R.xs;
        for (let i = 3; i <= 12 && ok; i++) {
          ctx.gsh = Math.pow(10, -i);
          if (newton(ctx, xg, 100)) xg = Float64Array.from(X);
          else ok = false;
        }
        ctx.gsh = 0;
        if (!ok || !newton(ctx, xg, 100)) throw fail('no-convergence', { t: t1 });
      }
      const xs = (R.xs = Float64Array.from(X));
      for (const e of caps) {
        const v = vx(xs, e.a) - vx(xs, e.c),
          geq = ((ctx.be ? 1 : 2) * e.C!) / dt;
        e.ip = geq * (v - e.vp!) - (ctx.be ? 0 : e.ip!);
        e.vp = v;
      }
      for (const e of inds) {
        e.ip = xs[e.k]!;
        e.vp = vx(xs, e.a) - vx(xs, e.c);
      }
      for (let i = 0; i < N; i++) R.V[i]!.push(xs[i]!);
      ck.real.forEach((e, j) => {
        R.I[j]!.push(mainCurrent(e, pinCurrents(e, xs, ctx)));
      });
      pwEl.forEach((e, j) => {
        R.PW[j]!.push(power(e, xs, ctx));
      });
      for (const e of tls)
        tlv(xs, e).forEach((v, j) => {
          e.h![j]!.push(v!);
        });
      R.s++;
    }
    return R;
  }
  /** n more steps of dt on the kernel's θ-method DAE solver (NoemaSimKit.daeThetaInit): M·x' = f(t, x) = B(x) − A(x)·x, the MNA
        system without companion models (stamp with ctx.dae), M full: a capacitor C at (a, a), (c, c), −C at (a, c), (c, a); an
        inductor −L on its branch row; every other row algebraic. The Jacobian is −A of the same stamp; a linear circuit factors
        M − hθJ once per (h, θ) (linear: true). Before each step (beforeStep) θ = 1 (backward Euler) on the first step and on a step
        that holds a source breakpoint, ½ otherwise, and the lines' waves from td ago; the junction limiting (pnjlim) stays in stamp
        and a limited iterate forces another Newton iteration (limit). A step the kernel cannot solve (also after halving) is taken by
        the own step with gmin stepping (tranAdvance), then the kernel goes on. */
  function tranAdvanceK(R: TranRun, n: number) {
    const { dt, tol, ctx, caps, inds, tls, pwEl } = R,
      sEnd = R.s + n;
    if (!(n > 0)) return R;
    const Mk: Float64Array[] = [];
    for (let i = 0; i < S; i++) Mk.push(new Float64Array(S));
    for (const e of caps) {
      const a = e.a,
        c = e.c;
      if (a >= 0) {
        Mk[a]![a]! += e.C!;
        if (c >= 0) {
          Mk[a]![c]! -= e.C!;
          Mk[c]![a]! -= e.C!;
        }
      }
      if (c >= 0) Mk[c]![c]! += e.C!;
    }
    for (const e of inds) Mk[e.k]![e.k]! -= e.L!;
    const kc: Ctx = { mode: 'tran', dae: true, t: 0, h: dt, be: false, gsh: 0, src: 1, avg: false, t0m: false };
    let g0 = 0,
      g1 = 0,
      thS = 1,
      lastS = -1;
    const snap = (t: number) => (Math.abs(t - g1) <= 1e-9 * dt ? g1 : Math.abs(t - g0) <= 1e-9 * dt ? g0 : t); // the grid's own times s·dt for the sources
    const f = (t: number, y: Float64Array, out: Float64Array) => {
      kc.t = snap(t);
      stamp(kc, y);
      for (let i = 0; i < S; i++) {
        let q = B[i];
        for (let j = 0; j < S; j++) q! -= A[i * S + j]! * y[j]!;
        out[i] = q!;
      }
    };
    const jac = (t: number, y: Float64Array, Jm: Float64Array) => {
      for (let i = 0; i < S * S; i++) Jm[i] = -A[i]!;
    }; // A of the stamp f has just made at y
    const beforeStep = () => {
      const s = R.s;
      g0 = s * dt;
      g1 = (s + 1) * dt;
      if (s !== lastS) {
        // once per grid step (a halved retry keeps the step's θ)
        lastS = s;
        thS = s === 0 || R.bp <= g1 + tol ? 1 : 0.5;
        if (R.bp <= g1 + tol) R.bp = nextBp(g1 + tol);
        for (const e of tls) {
          // the waves that left the other end td ago
          const tp = g1 - e.td!,
            h = e.h;
          let w;
          if (tp <= 0) w = [h![0]![0], h![1]![0], h![2]![0], h![3]![0]];
          else {
            const u = tp / dt;
            let i = Math.floor(u + 1e-9);
            if (i > s) i = s;
            const fr = Math.max(0, u - i),
              j = Math.min(i + 1, s);
            w = h!.map(a => a[i]! * (1 - fr) + a[j]! * fr);
          }
          e.E1 = w[2]! + e.z0! * w[3]!;
          e.E2 = w[0]! + e.z0! * w[1]!;
        }
      }
      return { theta: thS };
    };
    const record = (xs: Float64Array) => {
      // the step s → s + 1 done: the companion currents (for the pins), the history
      const be = thS === 1;
      for (const e of caps) {
        const v = vx(xs, e.a) - vx(xs, e.c),
          geq = ((be ? 1 : 2) * e.C!) / dt;
        e.ip = geq * (v - e.vp!) - (be ? 0 : e.ip!);
        e.vp = v;
      }
      for (const e of inds) {
        e.ip = xs[e.k]!;
        e.vp = vx(xs, e.a) - vx(xs, e.c);
      }
      R.xs = Float64Array.from(xs);
      ctx.t = g1;
      ctx.be = be;
      for (let i = 0; i < N; i++) R.V[i]!.push(xs[i]!);
      ck.real.forEach((e, j) => {
        R.I[j]!.push(mainCurrent(e, pinCurrents(e, R.xs, ctx)));
      });
      pwEl.forEach((e, j) => {
        R.PW[j]!.push(power(e, R.xs, ctx));
      });
      for (const e of tls)
        tlv(R.xs, e).forEach((v, j) => {
          e.h![j]!.push(v!);
        });
      R.s++;
    };
    while (R.s < sEnd) {
      const D = K.daeThetaInit({
        M: Mk,
        f,
        jac,
        linear: ck.linear,
        beforeStep,
        limit: () => limited,
        y0: R.xs,
        t0: R.s * dt,
        tEnd: sEnd * dt,
        dt,
        newtonTol: 1e-9,
        maxNewton: 60,
        maxSteps: 64 * (sEnd - R.s) + 64,
        onStep: (t, y) => {
          if (Math.abs(t - g1) <= 1e-9 * dt) record(y);
        },
      }); // a halved substep is not a grid point
      const r = D.ok ? D.advance(sEnd * dt) : D.result;
      if (r.stop === 'end' && R.s >= sEnd) break;
      if (r.stop === 'budget') throw fail('budget', { steps: sEnd, limit: MAX_STEPS });
      lastS = -1;
      tranAdvance(R, 1); // the own step with gmin stepping (throws no-convergence when that fails too)
    }
    return R;
  }
  function runTransient(o: TranOpts | null | undefined) {
    o = o || {};
    const dt = num(o.dt),
      tEnd = num(o.tEnd),
      maxSteps = o.maxSteps === undefined ? MAX_STEPS : num(o.maxSteps);
    if (!(dt > 0) || !(tEnd > 0)) throw fail('bad-args');
    const steps = Math.ceil(tEnd / dt - 1e-9);
    if (!(maxSteps > 0) || maxSteps > MAX_STEPS || steps > maxSteps)
      throw fail('budget', { steps, limit: Math.min(maxSteps, MAX_STEPS) || MAX_STEPS });
    const pw = Array.isArray(o.power) ? (o.power as string[]).filter(id => ck.byId.has(id)) : [];
    const key = `${dt}|${tEnd}|${!!o.uic}|${!!o.fromAvg}|${ck.hold.shift}|${pw.join(',')}`;
    if (tranCache && tranCache.key === key) return tranCache;
    stepping = null; // the elements' companion state is the transient's: a stepper run is invalidated
    const R = tranAdvanceK(tranStart(o, dt), steps);
    const T = new Float64Array(steps + 1);
    for (let s = 0; s <= steps; s++) T[s] = s * dt;
    tranCache = {
      key,
      T,
      V: R.V.map(a => Float64Array.from(a)),
      I: R.I.map(a => Float64Array.from(a)),
      steps,
      P: Object.fromEntries(pw.map((id, j) => [id, Float64Array.from(R.PW[j]!)])),
    };
    return tranCache;
  }
  /** the stepper: a transient run held open — start(o) with {dt, uic?, power?}, to(tTo) → {t, nodes, branches, power} now */
  let stepping = null as TranRun | null;
  function tranStep(o: TranOpts | null | undefined, tTo: number) {
    if (o) {
      tranCache = null;
      stepping = tranStart(o, num(o.dt));
    }
    if (!stepping) throw fail('bad-args');
    const R = stepping,
      n = Math.max(0, Math.round((tTo - R.s * R.dt) / R.dt));
    if (R.s + n > MAX_STEPS) throw fail('budget', { steps: R.s + n, limit: MAX_STEPS });
    tranAdvanceK(R, n);
    const last = (a: readonly number[]) => a[a.length - 1]!,
      nodes: Record<string, number> = {},
      branches: Record<string, number> = {};
    for (const nm of ck.outNames) {
      const i = ck.resolveName(nm);
      nodes[nm] = i! < 0 ? 0 : last(R.V[i!]!);
    }
    ck.real.forEach((e, j) => {
      branches[e.id] = last(R.I[j]!);
    });
    // hist(kind, name): every step's value so far (node | branch | power), for stats and `at` over the whole run
    const hist = (kind: string, nm: string): number[] | null => {
      if (kind === 'node') {
        const i = ck.resolveName(nm);
        return i! < 0 ? R.V[0]!.map(() => 0) : R.V[i!]!;
      }
      if (kind === 'branch') {
        const j = ck.real.findIndex(e => e.id === nm);
        return j < 0 ? null : R.I[j]!;
      }
      const j = R.pw.indexOf(nm);
      return j < 0 ? null : R.PW[j]!;
    };
    return { t: R.s * R.dt, dt: R.dt, nodes, branches, power: Object.fromEntries(R.pw.map((id, j) => [id, last(R.PW[j]!)])), hist };
  }
  /** the held-open transient handed over to a sim of the same circuit with other values (a binding changed while stepping): the
        step count, the unknowns, the histories and each element's own state (companion v/i, line waves, junction limiting) by
        position — the same netlist with other values has the same elements in the same order; the next step is backward Euler (a
        breakpoint now), as after any source discontinuity */
  const STATE_KEYS = ['vp', 'ip', 'h', 'E1', 'E2', 's'];
  function tranState() {
    return stepping ? { R: stepping, S, N, ids: ck.els.map(e => e.id), els: ck.els } : null;
  }
  function tranAdopt(st: ReturnType<typeof tranState>) {
    if (!st || st.S !== S || st.N !== N || st.ids.length !== ck.els.length || st.ids.some((id, i) => ck.els[i]!.id !== id))
      throw fail('bad-args');
    tranCache = null;
    st.els.forEach((e, i) => {
      const d = ck.els[i] as unknown as Record<string, unknown>,
        es = e as unknown as Record<string, unknown>;
      for (const k of STATE_KEYS) if (es[k] !== undefined) d[k] = es[k];
    });
    const R0 = st.R,
      pwEl = R0.pw.map(id => ck.byId.get(id));
    stepping = Object.assign({}, R0, {
      caps: ck.els.filter(e => e.type === 'C'),
      inds: ck.els.filter(e => e.type === 'L'),
      tls: ck.els.filter(e => e.type === 'TLINE'),
      pwEl,
      bp: R0.s * R0.dt,
      ctx: Object.assign({}, R0.ctx),
    });
  }
  function transient(o?: TranOpts | null) {
    const r = runTransient(o),
      zero = Array.from(new Float64Array(r.steps + 1)),
      nodes: Record<string, number[]> = {},
      branches: Record<string, number[]> = {};
    for (const nm of ck.outNames) {
      const i = ck.resolveName(nm);
      nodes[nm] = i! < 0 ? zero.slice() : Array.from(r.V[i!]!);
    }
    ck.real.forEach((e, j) => {
      branches[e.id] = Array.from(r.I[j]!);
    });
    const out: { t: number[]; nodes: Record<string, number[]>; branches: Record<string, number[]>; power?: Record<string, number[]> } = {
      t: Array.from(r.T),
      nodes,
      branches,
    };
    if (o && Array.isArray(o.power)) out.power = Object.fromEntries(Object.entries(r.P).map(([id, a]) => [id, Array.from(a)]));
    return out;
  }

  // ---- AC small-signal analysis — the circuit linearised at its DC operating point (sources at their average), one source excited ----
  let acCache = null as {
    key: string;
    r: { f: number[]; nodes: Record<string, { re: number[]; im: number[] }>; at: Record<number, { re: number[]; im: number[] }> };
  } | null;
  function ac(o: AcOpts | null | undefined) {
    o = o || {};
    const src = typeof o.source === 'string' ? ck.byId.get(o.source) : null;
    const f0 = num(o.fStart),
      f1 = num(o.fStop),
      np = o.points === undefined ? 200 : Math.round(num(o.points)),
      lin = o.scale === 'lin';
    if (!src || (src.type !== 'V' && src.type !== 'I') || !(f0 > 0) || !(f1 > f0) || !(np >= 2 && np <= 1000)) throw fail('bad-args');
    const idx = Array.isArray(o.idx)
      ? (o.idx as unknown[]).filter((j): j is number => Number.isInteger(j) && (j as number) >= 0 && (j as number) < S)
      : []; // extra unknowns to read (a pin reference's board node)
    const key = `${o.source as string}|${f0}|${f1}|${np}|${lin}|${idx.join(',')}`;
    if (acCache && acCache.key === key) return acCache.r;
    const { x, ctx } = dcX('avg');
    stamp(Object.assign({}, ctx, { gsh: 0, src: 1 }), x);
    const A0 = Float64Array.from(A),
      Re = new Float64Array(S * S),
      Im = new Float64Array(S * S),
      br = new Float64Array(S),
      bi = new Float64Array(S),
      xr = new Float64Array(S),
      xi = new Float64Array(S),
      pm = new Int32Array(S);
    const f: number[] = [],
      nodes: Record<string, { re: number[]; im: number[] }> = {},
      at: Record<number, { re: number[]; im: number[] }> = {};
    for (const nm of ck.outNames) nodes[nm] = { re: [], im: [] };
    for (const j of idx) at[j] = { re: [], im: [] };
    const jG = (a: number, c: number, b: number) => {
      if (a >= 0) {
        Im[a * S + a]! += b;
        if (c >= 0) {
          Im[a * S + c]! -= b;
          Im[c * S + a]! -= b;
        }
      }
      if (c >= 0) Im[c * S + c]! += b;
    };
    for (let i = 0; i < np; i++) {
      const fr = lin ? f0 + ((f1 - f0) * i) / (np - 1) : f0 * Math.pow(f1 / f0, i / (np - 1)),
        w = 2 * Math.PI * fr;
      Re.set(A0);
      Im.fill(0);
      br.fill(0);
      bi.fill(0);
      for (const e of ck.els) {
        if (e.type === 'C') jG(e.a, e.c, w * e.C!);
        else if (e.type === 'L') Im[e.k * S + e.k]! -= w * e.L!;
        else if (e.type === 'TLINE') {
          // v_k − Z0·i_k = e^(−jωtd)·(v_j + Z0·i_j)
          const [p1, m1, p2, m2] = e.tl!,
            k1 = e.k,
            k2 = e.k + 1,
            z = e.z0,
            cr = Math.cos(w * e.td!),
            ci = -Math.sin(w * e.td!);
          for (const kk of [k1, k2])
            for (let j = 0; j < S; j++) {
              Re[kk * S + j] = 0;
              Im[kk * S + j] = 0;
            }
          const put = (kk: number, col: number, r: number, im: number) => {
            if (col >= 0) {
              Re[kk * S + col]! += r;
              Im[kk * S + col]! += im;
            }
          };
          put(k1, p1, 1, 0);
          put(k1, m1, -1, 0);
          put(k1, k1, -z!, 0);
          put(k1, p2, -cr, -ci);
          put(k1, m2, cr, ci);
          put(k1, k2, -z! * cr, -z! * ci);
          put(k2, p2, 1, 0);
          put(k2, m2, -1, 0);
          put(k2, k2, -z!, 0);
          put(k2, p1, -cr, -ci);
          put(k2, m1, cr, ci);
          put(k2, k1, -z! * cr, -z! * ci);
        }
      }
      if (src.type === 'V') br[src.k] = 1;
      else {
        if (src.a >= 0) br[src.a]! += 1;
        if (src.c >= 0) br[src.c]! -= 1;
      }
      if (!cfactor(Re, Im, S, pm)) throw fail('singular');
      csubst(Re, Im, S, pm, br, bi, xr, xi);
      f.push(fr);
      for (const nm of ck.outNames) {
        const j = ck.resolveName(nm);
        nodes[nm]!.re.push(j! < 0 ? 0 : xr[j!]!);
        nodes[nm]!.im.push(j! < 0 ? 0 : xi[j!]!);
      }
      for (const j of idx) {
        at[j]!.re.push(xr[j]!);
        at[j]!.im.push(xi[j]!);
      }
    }
    const r = { f, nodes, at };
    acCache = { key, r };
    return r;
  }

  // ---- instruments ----
  function where(ref: unknown) {
    if (typeof ref !== 'string') throw fail('unknown-node', { ref });
    if (ref[0] === '@') {
      const [eid, pin] = parsePinRef(ref.slice(1)),
        e = ck.byId.get(eid);
      if (!e || pin === undefined || !(pin < e.boardPins.length)) throw fail('unknown-node', { ref });
      return e.boardPins[pin]!;
    }
    const i = ck.resolveName(ref);
    if (i === undefined) throw fail('unknown-node', { ref });
    return i;
  }
  const rngFor = (probe: Probe) => (noise ? streamOf(JSON.stringify(probe), noise.seed) : null);
  const jit = (v: number, r: (() => number) | null) => (r ? v * (1 + noise!.rel * (2 * r() - 1)) + noise!.abs * (2 * r() - 1) : v);
  function window_(probe: Probe) {
    const tEnd = num(probe.tEnd),
      dt = probe.dt === undefined ? tEnd / 1000 : num(probe.dt),
      tStart = probe.tStart === undefined ? 0 : num(probe.tStart);
    const r = runTransient({ dt, tEnd, maxSteps: probe.maxSteps, uic: probe.uic });
    let s0 = 0;
    while (s0 < r.steps && r.T[s0]! < tStart - 1e-9 * dt) s0++;
    return { r, s0 };
  }
  const trace = (r: NonNullable<typeof tranCache>, i: number) => (i < 0 ? new Float64Array(r.steps + 1) : r.V[i]);
  function stats(t: readonly number[], v: readonly number[]): ScopeStats {
    let mn = Infinity,
      mx = -Infinity,
      sum = 0,
      sq = 0;
    for (const y of v) {
      if (y < mn) mn = y;
      if (y > mx) mx = y;
      sum += y;
      sq += y * y;
    }
    const n = v.length,
      mean = sum / n,
      pp = mx - mn,
      mid = (mx + mn) / 2,
      hyst = 0.1 * pp;
    const ups: number[] = [];
    let high = v[0]! > mid;
    for (let i = 1; i < n; i++) {
      if (!high && v[i]! > mid + hyst / 2) {
        high = true;
        let j = i;
        while (j > 0 && v[j - 1]! > mid) j--;
        const y0 = v[j - 1 < 0 ? 0 : j - 1],
          y1 = v[j];
        ups.push(j > 0 && y1 !== y0 ? t[j - 1]! + ((mid - y0!) / (y1! - y0!)) * (t[j]! - t[j - 1]!) : t[j]!);
      } else if (high && v[i]! < mid - hyst / 2) high = false;
    }
    const freq = pp > 0 && ups.length >= 2 ? (ups.length - 1) / (ups[ups.length - 1]! - ups[0]!) : 0;
    return { min: mn, max: mx, mean, pp, rms: Math.sqrt(sq / n), freq };
  }
  function measure(probe: Probe): Reading {
    if (!isObj(probe)) throw fail('probe');
    const r = rngFor(probe);
    switch (probe.kind) {
      case 'V': {
        const ia = where(probe.a),
          ib = where(probe.b === undefined ? 'gnd' : probe.b),
          { x } = dcX('avg');
        return { kind: 'V', value: jit(vx(x, ia) - vx(x, ib), r), unit: 'V' };
      }
      case 'I': {
        const e = ck.byId.get(probe.element!);
        if (!e) throw fail('unknown-element', { ref: probe.element });
        const { x, ctx } = dcX('avg'),
          pc = pinCurrents(e, x, ctx);
        if (probe.pin !== undefined && !(probe.pin >= 0 && probe.pin < pc.length)) throw fail('probe');
        return { kind: 'I', value: jit(probe.pin === undefined ? mainCurrent(e, pc) : pc[probe.pin]!, r), unit: 'A' };
      }
      case 'R': {
        const ia = where(probe.a),
          ib = where(probe.b === undefined ? 'gnd' : probe.b);
        let R = 0;
        if (ia !== ib) {
          const x = op({ mode: 'ohm', test: { a: ia, b: ib }, avg: true, t: 0, gsh: 0, src: 1 });
          R = (vx(x, ia) - vx(x, ib)) / OHM_I;
        }
        return { kind: 'R', value: Math.abs(R) > OHM_OL ? 'OL' : jit(R, r), unit: 'ohm' };
      }
      case 'scope': {
        const { r: tr, s0 } = window_(probe),
          ia = where(probe.node),
          ib = where(probe.ref === undefined ? 'gnd' : probe.ref);
        const va = trace(tr, ia),
          vb = trace(tr, ib),
          t: number[] = [],
          v: number[] = [];
        for (let s = s0; s <= tr.steps; s++) {
          t.push(tr.T[s]!);
          v.push(jit(va![s]! - vb![s]!, r));
        }
        return { kind: 'scope', t, v, unit: 'V', stats: stats(t, v) };
      }
      case 'logic': {
        if (!Array.isArray(probe.nodes) || !probe.nodes.length) throw fail('probe');
        const th = probe.threshold === undefined ? 1.5 : num(probe.threshold),
          { r: tr, s0 } = window_(probe);
        const t = Array.from(tr.T.subarray(s0)),
          traces: Record<string, number[]> = {},
          edges: Record<string, LogicEdge[]> = {},
          st: Record<string, { freq: number; duty: number; edges: number }> = {};
        for (const nm of probe.nodes as readonly string[]) {
          const v = trace(tr, where(nm)),
            bits: number[] = [],
            ed: LogicEdge[] = [];
          for (let s = s0; s <= tr.steps; s++) {
            const b = v![s]! > th ? 1 : 0;
            bits.push(b);
            if (s > s0 && b !== bits[bits.length - 2]) {
              const y0 = v![s - 1],
                y1 = v![s],
                tt = y1 !== y0 ? tr.T[s - 1]! + ((th - y0!) / (y1! - y0!)) * (tr.T[s]! - tr.T[s - 1]!) : tr.T[s]!;
              ed.push({ t: tt, to: b });
            }
          }
          traces[nm] = bits;
          edges[nm] = ed;
          const ups = ed.filter(z => z.to === 1);
          let freq = 0,
            duty = bits.reduce((p, b) => p + b, 0) / bits.length;
          if (ups.length >= 2) {
            const t0 = ups[0]!.t,
              t1 = ups[ups.length - 1]!.t;
            freq = (ups.length - 1) / (t1 - t0);
            let hi = 0,
              lvl = 1,
              tp = t0;
            for (const z of ed) {
              if (z.t <= t0) continue;
              if (z.t > t1) break;
              if (lvl) hi += z.t - tp;
              lvl = z.to;
              tp = z.t;
            }
            duty = hi / (t1 - t0);
          }
          st[nm] = { freq, duty, edges: ed.length };
        }
        return { kind: 'logic', t, traces, edges, stats: st, threshold: th };
      }
    }
    throw fail('probe');
  }
  return { dc, transient, measure, ac, runTransient, tranStep, tranState, tranAdopt, dcX, ck, where, pinCurrents, mainCurrent };
}

function create(netlist: unknown, opts?: CreateOpts | null) {
  opts = opts || {};
  const ver = verOf(opts);
  const problems = check(netlist, { version: ver });
  if (problems.some(p => p.level === 'error')) throw fail('invalid', { problems });
  if (opts.faults !== undefined && !Array.isArray(opts.faults)) throw fail('fault', { index: -1 });
  const faults = JSON.parse(JSON.stringify(opts.faults || [])) as Fault[];
  let noise = null as Noise | null;
  if (opts.noise) {
    const rel = num(opts.noise.rel === undefined ? 0 : opts.noise.rel),
      abs = num(opts.noise.abs === undefined ? 0 : opts.noise.abs);
    if (!(rel >= 0) || !(abs >= 0)) throw fail('bad-args');
    noise = { rel, abs, seed: (opts.noise.seed !== undefined ? num(opts.noise.seed) : opts.seed !== undefined ? num(opts.seed) : 1) >>> 0 };
  }
  const seed = (opts.seed !== undefined ? num(opts.seed) : 1) >>> 0;
  let nl = JSON.parse(JSON.stringify(netlist)) as Netlist;
  const build = (o2: CompileOpts) => makeSim(compile(nl, faults, Object.assign({ ver, seed }, o2)), noise);
  let inner = build({}),
    subs = new Map<string, Sim>(),
    mcount = 0;
  const sub = (key: string, o2: CompileOpts) => {
    if (!subs.has(key)) subs.set(key, build(o2));
    return subs.get(key);
  };

  /** v2 instruments: the meter's input resistance and its modes (true averages and RMS of what really flows), a scope probe with its
        own capacitance and ground lead, a logic analyser's input, the frequency response analyser (bode) */
  function measure2(probe: Probe): Reading {
    if (!isObj(probe)) throw fail('probe');
    const count = ++mcount;
    const rng = noise ? streamOf(JSON.stringify(probe), noise.seed) : null;
    const jit = (v: number) => (rng ? v * (1 + noise!.rel * (2 * rng() - 1)) + noise!.abs * (2 * rng() - 1) : v);
    const shifted = <T>(s: Sim, fn: () => T): T => {
      // every capture of a board with noise or pickup sees another stretch of it (the same sequence of measurements reads the same)
      const h = s.ck.hold,
        live = s.ck.sources.some(e => e.wk === 'noise');
      h.shift = live ? streamOf(`m${count}`, seed)() * 1000 : 0;
      try {
        return fn();
      } finally {
        h.shift = 0;
      }
    };
    const nz = (v: unknown, d: number) => (v === undefined ? d : num(v));
    function windowOf(s: Sim): { tEnd: number; dt: number; tStart: number } | null {
      if (probe.tEnd !== undefined) {
        const te = num(probe.tEnd),
          w = { tEnd: te, dt: nz(probe.dt, te / 2000), tStart: nz(probe.tStart, te / 2) };
        if (!(w.tStart >= 0 && w.tStart < w.tEnd)) throw fail('probe');
        return w;
      }
      if (!s.ck.varying) return null;
      let P = 0;
      for (const e of s.ck.sources) if (e.per! > P) P = e.per!;
      return P > 0 ? { tEnd: 50 * P, dt: P / 200, tStart: 30 * P } : null;
    }
    function meter(s: Sim, dcVal: () => number, series: (r: NonNullable<ReturnType<Sim['runTransient']>>) => ArrayLike<number>) {
      // → the reading in the probe's mode
      const mode = probe.mode === undefined ? 'dc' : probe.mode;
      if (!MODES.includes(mode)) throw fail('probe');
      const w = windowOf(s);
      if (!w) {
        const v = dcVal();
        return mode === 'dc' ? v : mode === 'rms' ? Math.abs(v) : 0;
      }
      return shifted(s, () => {
        const r = s.runTransient({ tEnd: w.tEnd, dt: w.dt, maxSteps: probe.maxSteps, fromAvg: true }),
          v = series(r);
        let s0 = 0;
        while (s0 < r.steps && r.T[s0]! < w.tStart - 1e-9 * w.dt) s0++;
        const avg = (g: (y: number) => number) => {
          let a = 0;
          for (let i = s0; i < r.steps; i++) a += (g(v[i]!) + g(v[i + 1]!)) / 2;
          return a / Math.max(1, r.steps - s0);
        }; // time averages (trapezoids)
        const mean = avg(y => y),
          sq = avg(y => y * y);
        if (mode === 'dc') return mean;
        if (mode === 'rms') return Math.sqrt(sq);
        if (mode === 'ac') return Math.sqrt(Math.max(0, sq - mean * mean));
        return (avg(y => Math.abs(y - mean)) * Math.PI) / (2 * Math.SQRT2); // an average-responding meter, calibrated for sines
      });
    }
    switch (probe.kind) {
      case 'R':
        return sub('R', { noPickup: true })!.measure(probe);
      case 'V': {
        const zin = nz(probe.zin, 1e7),
          a = probe.a,
          b = probe.b === undefined ? 'gnd' : probe.b;
        if (!(zin >= 0)) throw fail('probe');
        const s = zin > 0 ? sub(JSON.stringify(['V', a, b, zin]), { extras: [{ type: 'R', n: [a as string, b], value: zin }] }) : inner;
        const ia = s!.where(a),
          ib = s!.where(b),
          vv = (x: Float64Array, i: number) => (i < 0 ? 0 : x[i]);
        const value = meter(
          s!,
          () => {
            const { x } = s!.dcX('avg');
            return vv(x, ia)! - vv(x, ib)!;
          },
          r => {
            const z = new Float64Array(r.steps + 1),
              A = ia < 0 ? z : r.V[ia],
              B = ib < 0 ? z : r.V[ib];
            return A!.map((y, i) => y - B![i]!);
          },
        );
        return { kind: 'V', value: jit(value), unit: 'V', ...(probe.mode ? { mode: probe.mode } : {}) };
      }
      case 'I': {
        const s = inner,
          e = s.ck.byId.get(probe.element!);
        if (!e) throw fail('unknown-element', { ref: probe.element });
        if (probe.pin !== undefined && !(probe.pin >= 0 && probe.pin < e.pins.length)) throw fail('probe');
        const j = s.ck.real.indexOf(e),
          dcI = () => {
            const { x, ctx } = s.dcX('avg'),
              pc = s.pinCurrents(e, x, ctx);
            return probe.pin === undefined ? s.mainCurrent(e, pc) : pc[probe.pin]!;
          };
        const value = probe.pin !== undefined && probe.pin !== 0 ? dcI() : meter(s, dcI, r => r.I[j]!);
        return { kind: 'I', value: jit(value), unit: 'A', ...(probe.mode ? { mode: probe.mode } : {}) };
      }
      case 'scope': {
        const zin = nz(probe.zin, 1e7),
          lead = nz(probe.lead, 0),
          cin = nz(probe.cin, lead > 0 ? 12e-12 : 0),
          ref = probe.ref === undefined ? 'gnd' : probe.ref;
        if (!(zin >= 0) || !(lead >= 0) || !(cin >= 0)) throw fail('probe');
        const tip = lead > 0 ? '##pg' : ref,
          ex: Extra[] = [];
        if (zin > 0) ex.push({ type: 'R', n: [probe.node as string, tip], value: zin });
        if (cin > 0) ex.push({ type: 'C', n: [probe.node as string, tip], value: cin });
        if (lead > 0) ex.push({ type: 'L', n: ['##pg', ref], value: lead });
        const s = ex.length ? sub(JSON.stringify(['scope', probe.node, ref, zin, cin, lead]), { extras: ex }) : inner;
        const q = Object.assign({}, probe, { ref: lead > 0 ? '#pg' : ref }) as unknown as Record<string, unknown>;
        delete q.zin;
        delete q.lead;
        delete q.cin;
        return shifted(s!, () => s!.measure(q as Probe));
      }
      case 'logic': {
        const zin = nz(probe.zin, 0);
        if (!(zin >= 0)) throw fail('probe');
        const s =
          zin > 0 && Array.isArray(probe.nodes)
            ? sub(JSON.stringify(['logic', probe.nodes, zin]), { extras: probe.nodes.map(m => ({ type: 'R', n: [m, 'gnd'], value: zin })) })
            : inner;
        const q = Object.assign({}, probe) as unknown as Record<string, unknown>;
        delete q.zin;
        return shifted(s!, () => s!.measure(q as Probe));
      }
      case 'bode': {
        const na = probe.node,
          nb = probe.ref === undefined ? 'gnd' : probe.ref;
        const ia = isGnd(na) ? -1 : inner.where(na),
          ib = isGnd(nb) ? -1 : inner.where(nb); // names, test points and pin references (on the faulted board)
        const r = inner.ac({
          source: probe.source,
          fStart: probe.fStart,
          fStop: probe.fStop,
          points: probe.points,
          idx: [ia, ib].filter(j => j >= 0),
        });
        const n = r.f.length,
          zero = { re: new Array<number>(n).fill(0), im: new Array<number>(n).fill(0) },
          pick = (j: number) => (j < 0 ? zero : r.at[j]);
        const A = pick(ia),
          B = pick(ib),
          re = A!.re.map((v, i) => v - B!.re[i]!),
          im = A!.im.map((v, i) => v - B!.im[i]!);
        const st = acStats(r.f, re, im);
        return {
          kind: 'bode',
          f: r.f.slice(),
          db: st.db,
          phase: st.phase,
          stats: { dcDb: st.dcDb, peakDb: st.peakDb, fPeak: st.fPeak, f3db: st.f3db, fLow3db: st.fLow3db, fUnity: st.fUnity, pm: st.pm },
        };
      }
    }
    return inner.measure(probe);
  }
  return Object.freeze({
    id: ID,
    dc: (o?: { readonly mode?: unknown } | null) => inner.dc(o),
    transient: (o?: TranOpts | null) => inner.transient(o),
    /** the stepper's transient held open: tranStep({dt, uic?, power?}, tTo) starts it, tranStep(null, tTo) goes on → the values at tTo */
    tranStep: (o: TranOpts | null | undefined, tTo: number) => inner.tranStep(o, tTo),
    /** tranState() → the held-open transient; tranAdopt(state) goes on with it here (this circuit with other values: same elements) */
    tranState: () => inner.tranState(),
    tranAdopt: (st: ReturnType<Sim['tranState']>) => {
      inner.tranAdopt(st);
    },
    measure: (p: Probe) => (ver === 2 ? measure2(p) : inner.measure(p)),
    /** the AC analysis {source, fStart, fStop, points?, scale?} → {f, nodes: {name: {re, im}}} */
    ac: (o: AcOpts | null | undefined) => {
      if (ver !== 2) throw fail('bad-args');
      return inner.ac(o);
    },
    /** the learner flips a switch or turns a knob: {on} for SW, {value} for R, C, L, V, I */
    set(id: string, patch: unknown) {
      const el = nl.elements.find(e => e.id === id);
      if (!el || !isObj(patch)) throw fail('unknown-element', { ref: id });
      const next = JSON.parse(JSON.stringify(nl)) as Netlist,
        ne = next.elements.find(e => e.id === id);
      if (patch.on !== undefined) ne!.on = patch.on as boolean;
      if (patch.value !== undefined) ne!.value = patch.value;
      const pr = check(next, { version: ver });
      if (pr.some(p => p.level === 'error')) throw fail('invalid', { problems: pr });
      nl = next;
      inner = build({});
      subs = new Map<string, Sim>();
    },
  });
}

const API = Object.freeze({
  id: ID,
  format: FORMAT,
  limits: Object.freeze({ nodes: MAX_NODES, elements: MAX_ELEMENTS, steps: MAX_STEPS, acPoints: 1000 }),
  FAULT_KINDS: Object.freeze(FAULT_KINDS.slice()),
  MODES: Object.freeze(MODES.slice()),
  check,
  checkFaults,
  create,
  num,
  acStats,
});
export default API;
/** the types the adapter (./sim.ts) reads */
export type { AcOpts, NetEl, Netlist, Probe, Reading, TranOpts };
export type CircuitApi = typeof API;
export type CircuitInstance = ReturnType<typeof create>;
/* i18n-ignore-end */
