/* ===================== interactive activities — the control-loop engine pid@1 (docs/INTERACTIVE_ENGINES.md §3, docs/adr/001 D12) =====================
   Control loops for tier B (sim-spec@1): a plant (first order + dead time, second order, integrator, DC motor speed / position,
   thermal, tank level), a PID controller (P, I, D with a derivative filter, setpoint weighting b / c, anti-windup by clamping or
   back-calculation, output limits, a sample time), setpoints (step, ramp, sine, steps), load and output disturbances, seeded
   sensor noise (a stream of the simulation kernel), open and closed loop; outputs r, y, ym, u, e as series and the step-response
   metrics (rise time, overshoot, settling time, steady-state error, IAE / ISE / ITAE, time in saturation).
   Fixed-step RK4 with the plant input held over each step; the controller runs every Ts (rounded to whole steps).
   TypeScript strict, deterministic, no DOM, no text for the learner: codes and numbers only, the activity host words them.
   Python twin of check / checkSpec: tools/pid.py. Schema: src/contracts/schemas/noema.pid.v1.schema.json.
   A plugin of the engine library (one line of src/engines/plugins.ts). Also used by tests/pid.js (node). */
import NoemaSimKit from '../kernel/simkit.js';
import type { Compiled, CreateOptions, Inputs, Problem, Spec, StepResult } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes and numbers leave this engine

/** a plain object of a model (data from outside: every field is checked where it is read) */
type Rec = Readonly<Record<string, unknown>>;
type Emit = (code: string, path: string, msg: string) => void;
type PidError = Error & { code: string } & Record<string, unknown>;

/** a plant after check(): the fields its type requires are there (each one is read only under its own type) */
interface Plant {
  readonly type: string;
  readonly output?: string;
  readonly K: number;
  readonly tau: number;
  readonly wn: number;
  readonly zeta: number;
  readonly C: number;
  readonly R: number;
  readonly A: number;
  readonly k: number;
  readonly theta?: number;
  readonly y0?: number;
  readonly J?: number;
  readonly b?: number;
  readonly Kt?: number;
  readonly L?: number;
  readonly Tamb?: number;
  readonly h0?: number;
  readonly hMax?: number;
}
type PlantNum = Exclude<keyof Plant, 'type' | 'output'>;
interface Controller {
  readonly Kp?: number;
  readonly Ki?: number;
  readonly Kd?: number;
  readonly N?: number;
  readonly Tf?: number;
  readonly b?: number;
  readonly c?: number;
  readonly uMin?: number;
  readonly uMax?: number;
  readonly antiWindup?: string;
  readonly Tt?: number;
  readonly Ts?: number;
  readonly u0?: number;
}
/** the fields of a signal after check() (each kind reads its own) */
interface SigFields {
  readonly from?: number;
  readonly to: number;
  readonly at?: number;
  readonly slope: number;
  readonly until?: number;
  readonly offset?: number;
  readonly amp: number;
  readonly freq: number;
  readonly phase?: number;
}
/** a signal after check(): a number, or one of {step}, {ramp}, {sine}, {steps: [[t, v], …]} */
type Signal = number | Readonly<Record<string, SigFields | readonly (readonly [number, number])[]>>;
/** a model after check() */
interface Model {
  readonly plant: Plant;
  readonly controller?: Controller;
  readonly mode?: string;
  readonly setpoint?: Signal;
  readonly load?: Signal;
  readonly disturbance?: Signal;
  readonly noise?: { readonly std: number; readonly seed?: number };
  readonly metrics?: { readonly band?: number };
}
/** the step-response metrics of a curve */
interface Metrics {
  rise: number;
  overshoot: number;
  peak: number;
  peakTime: number;
  settling: number;
  yFinal: number;
}
interface MetricOpts {
  readonly t0?: number;
  readonly y0?: number;
  readonly yf?: number;
  readonly band?: number;
}
/** the recorded signals of a run */
interface History {
  t: number[];
  r: number[];
  y: number[];
  ym: number[];
  u: number[];
  e: number[];
}
/** the loop's state (plain data: a snapshot is a copy) */
interface LoopState {
  h: number;
  hc: number;
  every: number;
  k: number;
  t: number;
  x: number[];
  I: number;
  D: number;
  sPrev: number | null;
  uHeld: number;
  sat: boolean;
  satTime: number;
  dead: boolean;
  ud: number;
  rng: number[] | null;
  ut: number[];
  uv: number[];
  H: History;
  final?: boolean;
  hAuto?: boolean;
}
/** the result of a run: the signals, the metrics, the steps */
interface SimResult {
  readonly t: Float64Array;
  readonly r: Float64Array;
  readonly y: Float64Array;
  readonly ym: Float64Array;
  readonly u: Float64Array;
  readonly e: Float64Array;
  readonly metrics: Readonly<Record<string, number | boolean>>;
  readonly steps: number;
  readonly dt: number;
}
interface RunArgs {
  readonly tEnd?: number | undefined;
  readonly dt?: number | undefined;
}
/** an output of a spec the checks passed */
interface PidOutput {
  readonly id: string;
  readonly kind: string;
  readonly signal?: string;
  readonly metric?: string;
  readonly time?: boolean;
  readonly at?: unknown;
  readonly stat?: string;
}
/** a binding of the model: element, prop, value (prepare() evaluates the expression) */
type Bound = readonly [string, unknown, number | boolean];
/** the inputs of a run after prepare(): the bindings, the transient and the times of the `at` outputs as numbers */
interface PidInputs {
  readonly $bind?: readonly Bound[];
  readonly $tran?: { readonly tEnd: number; readonly dt: number } | null;
  readonly $at?: Readonly<Record<string, number>>;
}

const ID = 'pid@1';
const MAX_STEPS = 200000,
  MAX_BINDINGS = 24,
  MAX_STEPS_SIGNAL = 32,
  BLOWUP = 1e12;
const STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'];
const SIGNALS = ['r', 'y', 'ym', 'u', 'e'];
const METRICS = ['rise', 'overshoot', 'peak', 'peakTime', 'settling', 'yFinal', 'ess', 'iae', 'ise', 'itae', 'satTime'];
const AW = ['none', 'clamp', 'backcalc'];
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o: object, k: unknown) => Object.prototype.hasOwnProperty.call(o, k as PropertyKey);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isExpr = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const extra = (o: object, allowed: readonly string[]) =>
  Object.keys(o)
    .filter(k => !allowed.includes(k))
    .sort();
function fail(code: string, extra_?: Rec): PidError {
  const e = new Error('pid: ' + code) as PidError;
  e.code = code;
  if (extra_) Object.assign(e, extra_);
  return e;
}
function okNum(kind: string, v: unknown) {
  if (!isNum(v)) return false;
  return kind === 'pos' ? v > 0 : kind === 'nonneg' ? v >= 0 : true;
}

// ---- the plants: fields (kind, '!' = required) and defaults ----
const PLANTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  fopdt: { K: 'fin!', tau: 'pos!', theta: 'nonneg', y0: 'fin' },
  second: { K: 'fin!', wn: 'pos!', zeta: 'nonneg!', theta: 'nonneg', y0: 'fin' },
  integrator: { K: 'fin!', theta: 'nonneg', y0: 'fin' },
  motor: { J: 'pos', b: 'nonneg', Kt: 'pos', R: 'pos', L: 'nonneg', output: 'enum', theta: 'nonneg' },
  thermal: { C: 'pos!', R: 'pos!', Tamb: 'fin', theta: 'nonneg', y0: 'fin' },
  tank: { A: 'pos!', k: 'pos!', h0: 'nonneg', hMax: 'pos', theta: 'nonneg' },
};
const MOTOR = { J: 0.01, b: 0.1, Kt: 0.01, R: 1, L: 0.5 }; // the classic DC motor of the control tutorials
const CTRL = {
  Kp: 'fin',
  Ki: 'fin',
  Kd: 'fin',
  N: 'pos',
  Tf: 'nonneg',
  b: 'fin',
  c: 'fin',
  uMin: 'fin',
  uMax: 'fin',
  antiWindup: 'enum',
  Tt: 'pos',
  Ts: 'nonneg',
  u0: 'fin',
};
const SIG: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  step: { from: 'fin', to: 'fin!', at: 'nonneg' },
  ramp: { from: 'fin', slope: 'fin!', at: 'nonneg', until: 'pos' },
  sine: { offset: 'fin', amp: 'fin!', freq: 'pos!', phase: 'fin' },
};
const MODEL_KEYS = ['plant', 'controller', 'mode', 'setpoint', 'load', 'disturbance', 'noise', 'metrics', 'transient', 'bindings'];
const BIND_EL = ['plant', 'controller', 'setpoint', 'load', 'disturbance', 'noise'];

/** Ziegler–Nichols tuning tables (constants; docs/INTERACTIVE_ENGINES.md §3). Parallel gains: Ki = Kp/Ti, Kd = Kp·Td. */
const ZN = Object.freeze({
  ultimate: Object.freeze({
    P: Object.freeze({ Kp: 0.5 }),
    PI: Object.freeze({ Kp: 0.45, Ti: 1 / 1.2 }),
    PID: Object.freeze({ Kp: 0.6, Ti: 0.5, Td: 0.125 }),
  }), // × Ku, × Tu
  reaction: Object.freeze({
    P: Object.freeze({ Kp: 1 }),
    PI: Object.freeze({ Kp: 0.9, Ti: 1 / 0.3 }),
    PID: Object.freeze({ Kp: 1.2, Ti: 2, Td: 0.5 }),
  }), // Kp × T/(K·L), Ti and Td × L
});

// ---- check(model) → [{code, path, msg, level}] (twin: tools/pid.py check) ----
function checkFields(
  q: Rec,
  F: Readonly<Record<string, string>>,
  path: string,
  E: Emit,
  code: string,
  enums: Readonly<Record<string, readonly unknown[]>>,
) {
  for (const k of extra(q, Object.keys(F))) E(code, `${path}.${k}`, 'unknown field');
  for (const [k, spec] of Object.entries(F)) {
    const must = spec.endsWith('!'),
      kd = must ? spec.slice(0, -1) : spec;
    if (!has(q, k)) {
      if (must) E(code, `${path}.${k}`, 'missing');
      continue;
    }
    if (kd === 'enum') {
      if (!enums[k]!.includes(q[k])) E(code, `${path}.${k}`, 'one of ' + enums[k]!.join(', '));
    } else if (!okNum(kd, q[k])) E(code, `${path}.${k}`, 'out of range');
  }
}
function checkSignal(v: unknown, path: string, E: Emit) {
  if (!isObj(v)) {
    if (!isNum(v)) E('signal', path, 'a number or one of step, ramp, sine, steps');
    return;
  }
  const keys = Object.keys(v);
  if (keys.length !== 1 || !['step', 'ramp', 'sine', 'steps'].includes(keys[0]!)) {
    E('signal', path, 'a number or one of step, ramp, sine, steps');
    return;
  }
  const kind = keys[0]!,
    q = v[kind];
  if (kind === 'steps') {
    const ok =
      Array.isArray(q) &&
      q.length >= 1 &&
      q.length <= MAX_STEPS_SIGNAL &&
      (q as unknown[]).every(
        (p, i) =>
          Array.isArray(p) &&
          p.length === 2 &&
          okNum('nonneg', p[0]) &&
          isNum(p[1]) &&
          (i === 0 || (p[0] as number) >= (q as (readonly number[])[])[i - 1]![0]!),
      );
    if (!ok) E('signal', path + '.steps', `a list of 1 to ${MAX_STEPS_SIGNAL} [t, value] pairs, t ≥ 0 ascending`);
    return;
  }
  if (!isObj(q)) {
    E('signal', `${path}.${kind}`, 'needs an object');
    return;
  }
  checkFields(q, SIG[kind]!, `${path}.${kind}`, E, 'signal', {});
  if (kind === 'ramp' && isNum(q.until) && q.until <= (isNum(q.at) ? q.at : 0)) E('signal', path + '.ramp.until', 'must be after at');
}
/** the fastest time constant of a plant (for the step warning), or Infinity */
function fastest(p: Plant) {
  if (p.type === 'fopdt') return p.tau;
  if (p.type === 'second') return p.zeta < 1 ? 1 / p.wn : 1 / (p.wn * (p.zeta + Math.sqrt(p.zeta * p.zeta - 1)));
  if (p.type === 'thermal') return p.R * p.C;
  if (p.type === 'motor') {
    const m = { ...MOTOR, ...p };
    const te = m.L > 0 ? m.L / m.R : Infinity,
      tm = (m.J * m.R) / (m.Kt * m.Kt + m.b * m.R);
    return Math.min(te, tm);
  }
  return Infinity;
}
function check(model: unknown): Problem[] {
  const P: Problem[] = [];
  const E: Emit = (code, path, msg) => {
    P.push({ code, path, msg, level: 'error' });
  };
  const W: Emit = (code, path, msg) => {
    P.push({ code, path, msg, level: 'warning' });
  };
  if (!isObj(model)) {
    E('model', '', 'model is not an object');
    return P;
  }
  for (const k of extra(model, MODEL_KEYS)) E('unknown-field', k, 'unknown field');
  const pl = model.plant;
  let plantOk = false;
  if (!isObj(pl)) E('plant', 'plant', 'needs an object {type, …}');
  else if (!has(PLANTS, pl.type) || typeof pl.type !== 'string') E('plant', 'plant.type', 'one of ' + Object.keys(PLANTS).join(', '));
  else {
    const n0 = P.length,
      F = { type: 'enum', ...PLANTS[pl.type] };
    checkFields(pl, F, 'plant', E, 'plant', { type: Object.keys(PLANTS), output: ['speed', 'position'] });
    if (pl.type === 'tank' && isNum(pl.h0) && isNum(pl.hMax) && pl.h0 > pl.hMax) E('plant', 'plant.h0', 'above hMax');
    plantOk = P.length === n0;
  }
  if (has(model, 'mode') && model.mode !== 'closed' && model.mode !== 'open') E('mode', 'mode', 'closed or open');
  const open = model.mode === 'open',
    c = model.controller;
  if (!has(model, 'controller')) {
    if (!open) E('controller', 'controller', 'a closed loop needs a controller {Kp, Ki?, Kd?, …}');
  } else if (!isObj(c)) E('controller', 'controller', 'needs an object {Kp, Ki?, Kd?, …}');
  else {
    checkFields(c, CTRL, 'controller', E, 'controller', { antiWindup: AW });
    if (isNum(c.uMin) && isNum(c.uMax) && !(c.uMin < c.uMax)) E('controller', 'controller', 'uMin must be below uMax');
    if (open) W('unused', 'controller', 'ignored in an open loop');
    else if (!['Kp', 'Ki', 'Kd'].some(k => isNum(c[k]) && c[k] !== 0)) W('no-gain', 'controller', 'Kp, Ki and Kd are all 0');
    if (has(c, 'antiWindup') && c.antiWindup !== 'none' && !has(c, 'uMin') && !has(c, 'uMax'))
      W('no-limits', 'controller.antiWindup', 'anti-windup needs uMin or uMax');
  }
  for (const k of ['setpoint', 'load', 'disturbance']) if (has(model, k)) checkSignal(model[k], k, E);
  if (has(model, 'noise')) {
    const nz = model.noise;
    if (!isObj(nz)) E('noise', 'noise', 'needs an object {std, seed?}');
    else {
      for (const k of extra(nz, ['std', 'seed'])) E('noise', 'noise.' + k, 'unknown field');
      if (!okNum('nonneg', nz.std)) E('noise', 'noise.std', 'needs a number ≥ 0');
      if (has(nz, 'seed') && !(Number.isInteger(nz.seed) && (nz.seed as number) >= 0)) E('noise', 'noise.seed', 'needs a whole number ≥ 0');
    }
  }
  if (has(model, 'metrics')) {
    const mt = model.metrics;
    if (!isObj(mt)) E('metrics', 'metrics', 'needs an object {band?}');
    else {
      for (const k of extra(mt, ['band'])) E('metrics', 'metrics.' + k, 'unknown field');
      if (has(mt, 'band') && !(isNum(mt.band) && mt.band > 0 && mt.band <= 0.5)) E('metrics', 'metrics.band', 'needs a number in (0, 0.5]');
    }
  }
  let te: number | null = null,
    dt: number | null = null;
  if (has(model, 'transient')) {
    const tr = model.transient;
    if (!isObj(tr)) E('transient', 'transient', 'needs an object {tEnd, dt?}');
    else {
      for (const k of extra(tr, ['tEnd', 'dt'])) E('unknown-field', 'transient.' + k, 'unknown field');
      if (!has(tr, 'tEnd')) E('transient', 'transient.tEnd', 'missing');
      else if (isNum(tr.tEnd) && tr.tEnd > 0) te = tr.tEnd;
      else if (!isExpr(tr.tEnd)) E('transient', 'transient.tEnd', 'needs a number > 0 or an expression');
      if (has(tr, 'dt')) {
        if (isNum(tr.dt) && tr.dt > 0) dt = tr.dt;
        else if (!isExpr(tr.dt)) E('transient', 'transient.dt', 'needs a number > 0 or an expression');
      } else if (te !== null) dt = te / 1000;
      if (te !== null && dt !== null && Math.ceil(te / dt - 1e-9) > MAX_STEPS)
        E('budget', 'transient', `tEnd / dt is more than ${MAX_STEPS} steps`);
      if (dt !== null && isObj(c) && isNum(c.Ts) && c.Ts > 0 && c.Ts < dt * (1 - 1e-9))
        E('controller', 'controller.Ts', 'shorter than the step (transient.dt)');
      if (dt !== null && plantOk && dt > fastest(pl as Plant) / 2)
        W('stiff', 'transient.dt', "longer than half the plant's fastest time constant (inaccurate or unstable)");
    }
  }
  const bs = model.bindings;
  if (has(model, 'bindings') && !(Array.isArray(bs) && bs.length <= MAX_BINDINGS))
    E('binding', 'bindings', `a list of at most ${MAX_BINDINGS} {element, prop?, expr}`);
  (Array.isArray(bs) ? (bs as unknown[]).slice(0, MAX_BINDINGS) : []).forEach((b, i) => {
    const w = `bindings[${i}]`;
    if (!isObj(b)) {
      E('binding', w, 'an object {element, prop?, expr}');
      return;
    }
    for (const k of extra(b, ['element', 'prop', 'expr'])) E('unknown-field', `${w}.${k}`, 'unknown field');
    if (!BIND_EL.includes(b.element as string)) E('binding', w + '.element', 'one of ' + BIND_EL.join(', '));
    else if (!has(model, b.element)) E('binding', w + '.element', 'not in the model');
    else {
      const props = bindable(model, b.element as string),
        prop = has(b, 'prop') ? b.prop : 'value';
      if (props && !props.includes(prop as string))
        E('binding', w + '.prop', props.length ? 'one of ' + props.join(', ') : 'nothing to set here');
    }
    if (!(isExpr(b.expr) || isNum(b.expr) || typeof b.expr === 'boolean')) E('binding', w + '.expr', 'needs an expression');
  });
  return P;
}
/** the props a binding can set on an element of the model (null when the element itself is invalid: reported elsewhere) */
function bindable(model: Rec, el: string): string[] | null {
  const v = model[el];
  if (el === 'plant') return isObj(v) && has(PLANTS, v.type) ? Object.keys(PLANTS[v.type as string]!).filter(k => k !== 'output') : null;
  if (el === 'controller') return isObj(v) ? Object.keys(CTRL) : null;
  if (el === 'noise') return isObj(v) ? ['std'] : null;
  if (isNum(v)) return ['value'];
  if (isObj(v)) {
    const k = Object.keys(v)[0]!;
    return has(SIG, k) ? Object.keys(SIG[k]!).map(f => k + '.' + f) : k === 'steps' ? [] : null;
  }
  return null;
}

// ---- checkSpec(spec) → the problems of a sim-spec's model and outputs (paths from the spec: model.…, outputs[i]…) ----
const OUT_KEYS = ['id', 'kind', 'signal', 'metric', 'time', 'at', 'stat'];
function checkSpec(spec: unknown): Problem[] {
  const P: Problem[] = [],
    E: Emit = (code, path, msg) => {
      P.push({ code, path, msg, level: 'error' });
    };
  const m = isObj(spec) ? spec.model : undefined;
  if (!isObj(m)) {
    E('model', 'model', ID + ' needs a model {plant, controller?, setpoint?, transient, …}');
    return P;
  }
  for (const p of check(m)) P.push({ ...p, path: 'model' + (p.path ? '.' + p.path : '') });
  if (!has(m, 'transient')) E('transient', 'model.transient', 'missing: every output of ' + ID + ' comes from a run {tEnd, dt?}');
  (isObj(spec) && Array.isArray(spec.outputs) ? (spec.outputs as unknown[]) : []).forEach((o, i) => {
    const w = `outputs[${i}]`;
    if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) return; // (the common checks report it)
    for (const k of extra(o, OUT_KEYS)) E('unknown-field', `${w}.${k}`, 'unknown field');
    const src = ['signal', 'metric', 'time'].filter(k => has(o, k));
    if (src.length !== 1) {
      E('output', w, 'must name what it reads: one of signal, metric, time');
      return;
    }
    const s = src[0],
      at = has(o, 'at'),
      st = has(o, 'stat');
    if (s === 'time' && !(o.time === true && o.kind === 'series')) E('output', w + '.time', 'true on a series output (the time axis)');
    if (s === 'signal' && !SIGNALS.includes(o.signal as string)) E('output', w + '.signal', 'one of ' + SIGNALS.join(', '));
    if (s === 'metric') {
      if (o.kind !== 'scalar') E('output', w, 'a metric is a scalar output');
      else if (!METRICS.includes(o.metric as string)) E('output', w + '.metric', 'one of ' + METRICS.join(', '));
    }
    if ((at || st) && !(o.kind === 'scalar' && s === 'signal')) E('output', w, 'at and stat belong to a scalar output of a signal');
    else if (s === 'signal' && o.kind === 'scalar' && !at && !st) E('output', w, 'a scalar signal needs at or stat');
    if (at && st) E('output', w, 'at or stat, not both');
    if (at && !((isNum(o.at) && o.at >= 0) || isExpr(o.at))) E('output', w + '.at', 'needs a number ≥ 0 or an expression');
    if (st && !STATS.includes(o.stat as string)) E('output', w + '.stat', 'one of ' + STATS.join(', '));
  });
  return P;
}

// ---- signals ----
function signal(v: Signal | undefined): { at: (t: number) => number; t0: number } {
  if (v === undefined) return { at: () => 0, t0: 0 };
  if (!isObj(v)) return { at: () => v, t0: 0 };
  const kind = Object.keys(v)[0]!,
    q = v[kind] as SigFields;
  if (kind === 'step') {
    const a = has(q, 'from') ? q.from! : 0,
      b = q.to,
      t0 = has(q, 'at') ? q.at! : 0;
    return { at: t => (t < t0 ? a : b), t0 };
  }
  if (kind === 'ramp') {
    const a = has(q, 'from') ? q.from! : 0,
      s = q.slope,
      t0 = has(q, 'at') ? q.at! : 0,
      t1 = has(q, 'until') ? q.until! : Infinity;
    return { at: t => a + s * Math.max(0, Math.min(t, t1) - t0), t0 };
  }
  if (kind === 'sine') {
    const o = has(q, 'offset') ? q.offset! : 0,
      w = 2 * Math.PI * q.freq,
      ph = ((has(q, 'phase') ? q.phase! : 0) * Math.PI) / 180;
    return { at: t => o + q.amp * Math.sin(w * t + ph), t0: 0 };
  }
  const pts = q as unknown as readonly (readonly [number, number])[]; // steps: [[t, v], …]; 0 before the first
  const at = (t: number) => {
    let r = 0;
    for (const [ti, vi] of pts) {
      if (t >= ti) r = vi;
      else break;
    }
    return r;
  };
  const ch = pts.find(([, vi], i) => vi !== (i ? pts[i - 1]![1] : 0)); // the first change
  return { at, t0: ch ? ch[0] : 0 };
}

// ---- the plants as state equations: {x0, f(x, u, dx), y(x), post?(x)} ----
interface PlantEq {
  readonly x0: number[];
  readonly f: (x: ArrayLike<number>, u: number, dx: Float64Array) => void;
  readonly y: (x: ArrayLike<number>) => number;
  readonly post?: (x: Float64Array) => void;
}
function plantOf(p: Plant): PlantEq {
  const d = (k: PlantNum, v: number): number => (has(p, k) ? p[k]! : v);
  switch (p.type) {
    case 'fopdt':
      return {
        x0: [d('y0', 0)],
        f: (x, u, dx) => {
          dx[0] = (p.K * u - x[0]!) / p.tau;
        },
        y: x => x[0]!,
      };
    case 'second': {
      const w2 = p.wn * p.wn,
        zw = 2 * p.zeta * p.wn;
      return {
        x0: [d('y0', 0), 0],
        f: (x, u, dx) => {
          dx[0] = x[1]!;
          dx[1] = w2 * (p.K * u - x[0]!) - zw * x[1]!;
        },
        y: x => x[0]!,
      };
    }
    case 'integrator':
      return {
        x0: [d('y0', 0)],
        f: (x, u, dx) => {
          dx[0] = p.K * u;
        },
        y: x => x[0]!,
      };
    case 'thermal': {
      const Ta = d('Tamb', 25);
      return {
        x0: [d('y0', Ta)],
        f: (x, u, dx) => {
          dx[0] = (u - (x[0]! - Ta) / p.R) / p.C;
        },
        y: x => x[0]!,
      };
    }
    case 'tank': {
      const hMax = d('hMax', Infinity);
      return {
        x0: [d('h0', 0)],
        f: (x, u, dx) => {
          dx[0] = (Math.max(0, u) - p.k * Math.sqrt(Math.max(0, x[0]!))) / p.A;
        },
        y: x => x[0]!,
        post: x => {
          x[0] = Math.min(hMax, Math.max(0, x[0]!));
        },
      };
    }
    default: {
      // motor: x = [ω, θ, i] (i only when L > 0); u = voltage
      const J = d('J', MOTOR.J),
        b = d('b', MOTOR.b),
        Kt = d('Kt', MOTOR.Kt),
        R = d('R', MOTOR.R),
        L = d('L', MOTOR.L),
        pos = p.output === 'position';
      const y = pos ? (x: ArrayLike<number>) => x[1]! : (x: ArrayLike<number>) => x[0]!;
      if (L > 0)
        return {
          x0: [0, 0, 0],
          f: (x, u, dx) => {
            dx[0] = (Kt * x[2]! - b * x[0]!) / J;
            dx[1] = x[0]!;
            dx[2] = (u - R * x[2]! - Kt * x[0]!) / L;
          },
          y,
        };
      return {
        x0: [0, 0],
        f: (x, u, dx) => {
          const i = (u - Kt * x[0]!) / R;
          dx[0] = (Kt * i - b * x[0]!) / J;
          dx[1] = x[0]!;
        },
        y,
      };
    }
  }
}

/** the step-response metrics of a curve: {t0, y0?, yf?, band (0.02)} → {rise, overshoot %, peak, peakTime, settling, yFinal}
    (rise 10–90 % and settling inside ±band of the change, both from t0; yFinal = the mean of the last 2 % of the samples) */
function metrics(t: ArrayLike<number>, y: ArrayLike<number>, o?: MetricOpts): Metrics {
  o = o || {};
  const N = y.length,
    band = o.band || 0.02,
    t0 = o.t0 || 0;
  let i0 = 0;
  while (i0 < N - 1 && t[i0]! < t0) i0++;
  const tail = Math.max(1, Math.floor(N * 0.02));
  let s = 0;
  for (let i = N - tail; i < N; i++) s += y[i]!;
  const yf = o.yf !== undefined ? o.yf : s / tail,
    y0 = o.y0 !== undefined ? o.y0 : y[i0]!,
    D = yf - y0;
  const r: Metrics = { rise: NaN, overshoot: NaN, peak: NaN, peakTime: NaN, settling: NaN, yFinal: yf };
  if (!(Math.abs(D) > 1e-12 * (1 + Math.abs(yf))) || !Number.isFinite(D)) return r;
  const g = (i: number) => (y[i]! - y0) / D,
    cross = (lev: number) => {
      for (let i = i0; i < N; i++)
        if (g(i) >= lev) {
          if (i === i0) return t[i]!;
          const a = g(i - 1),
            b = g(i);
          return t[i - 1]! + ((t[i]! - t[i - 1]!) * (lev - a)) / (b - a);
        }
      return NaN;
    };
  r.rise = cross(0.9) - cross(0.1);
  let ip = i0;
  for (let i = i0; i < N; i++) if (g(i) > g(ip)) ip = i;
  r.peak = y[ip]!;
  r.peakTime = t[ip]! - t0;
  r.overshoot = g(ip) - 1 > 1e-9 ? (g(ip) - 1) * 100 : 0;
  const out = (i: number) => Math.abs(y[i]! - yf) > band * Math.abs(D);
  if (out(N - 1)) return r;
  let last = -1;
  for (let i = N - 2; i >= i0; i--)
    if (out(i)) {
      last = i;
      break;
    }
  if (last < 0) r.settling = 0;
  else {
    // the time the curve enters the band for good (interpolated)
    const a = y[last]! - yf,
      b = y[last + 1]! - yf,
      lim = band * Math.abs(D) * Math.sign(a),
      f = (a - lim) / (a - b || 1);
    r.settling = t[last]! + (t[last + 1]! - t[last]!) * Math.min(1, Math.max(0, f)) - t0;
  }
  return r;
}

// ---- the simulator ----
/* The loop is a sampled-data system: at every grid time t_k = k·h (a break of NoemaSimKit.integrate, where the step lands exactly)
   the setpoint, the measurement (+ the seeded noise of a kernel stream) and, every Ts, the controller are evaluated and recorded;
   between two grid times the plant is integrated by the kernel's classical RK4 (one step of h) with its input held (the dead time
   interpolates the input history at t − θ). The same core serves run() and the stepper (docs/INTERACTIVE_LIBRARY.md §1.6). */
function makeSim(model: Model, opts: { readonly seed?: number | undefined }) {
  const pl = plantOf(model.plant),
    open = model.mode === 'open',
    c = model.controller || {};
  const d = <K extends keyof Controller>(k: K, v: NonNullable<Controller[K]>): NonNullable<Controller[K]> => (has(c, k) ? c[k]! : v);
  const Kp = d('Kp', 0),
    Ki = d('Ki', 0),
    Kd = d('Kd', 0),
    bw = d('b', 1),
    cw = d('c', 0),
    u0 = d('u0', 0);
  const uMin = d('uMin', -Infinity),
    uMax = d('uMax', Infinity),
    aw = d('antiWindup', 'none');
  const Tf = has(c, 'Tf') ? c.Tf! : Kp !== 0 ? Math.abs(Kd / Kp) / d('N', 10) : 0;
  const Ti = Kp !== 0 && Ki !== 0 ? Math.abs(Kp / Ki) : Ki !== 0 ? 1 / Math.abs(Ki) : Infinity,
    Td = Kp !== 0 ? Math.abs(Kd / Kp) : 0;
  const Tt = has(c, 'Tt') ? c.Tt! : Td > 0 ? Math.sqrt(Ti * Td) : Ti;
  const sp = signal(has(model, 'setpoint') ? model.setpoint : 1),
    ld = signal(model.load),
    od = signal(model.disturbance);
  const theta = has(model.plant, 'theta') ? model.plant.theta! : 0;
  const nz = model.noise,
    std = nz ? nz.std : 0;
  const seed = (nz && has(nz, 'seed') ? nz.seed! : opts.seed !== undefined ? opts.seed : 1) >>> 0;
  const band = model.metrics && model.metrics.band ? model.metrics.band : 0.02;
  const nx = pl.x0.length;
  /** the loop's state (plain data: a snapshot is a copy): grid step h, controller period hc */
  function start(h: number): LoopState {
    const every = Math.max(1, Math.round((has(c, 'Ts') && c.Ts! > 0 ? c.Ts! : h) / h));
    return {
      h,
      hc: every * h,
      every,
      k: 0,
      t: 0,
      x: Array.from(pl.x0),
      I: 0,
      D: 0,
      sPrev: null,
      uHeld: 0,
      sat: false,
      satTime: 0,
      dead: false,
      ud: 0,
      rng: std > 0 ? NoemaSimKit.stream(seed, 'pid:noise').state() : null,
      ut: [],
      uv: [],
      H: { t: [], r: [], y: [], ym: [], u: [], e: [] },
    };
  }
  /** a standard normal of the noise stream (the kernel's: inversion by AS241), its state carried in the loop's state */
  function noiseDraw(st: LoopState) {
    const r = NoemaSimKit.stream(0, '', { state: st.rng! }),
      z = r.normal(0, 1);
    st.rng = r.state();
    return z;
  }
  /** the grid time t = st.t: measure, control (every Ts), record; then the plant input for the next interval */
  function sample(st: LoopState, last: boolean | undefined) {
    const t = st.t,
      H = st.H;
    if (st.dead) {
      for (const k of ['r', 'y', 'ym', 'u', 'e'] as const) H[k].push(NaN);
      H.t.push(t);
      return;
    }
    const r = sp.at(t),
      y = pl.y(st.x) + od.at(t),
      ym = y + (std > 0 ? std * noiseDraw(st) : 0);
    if (open) st.uHeld = r;
    else if (st.k % st.every === 0) {
      const sv = cw * r - ym;
      st.D = st.sPrev === null ? 0 : (Tf * st.D + Kd * (sv - st.sPrev)) / (Tf + st.hc);
      st.sPrev = sv;
      const v = u0 + Kp * (bw * r - ym) + st.I + st.D,
        u = Math.min(uMax, Math.max(uMin, v)),
        e = r - ym;
      st.sat = v > uMax || v < uMin;
      if (aw === 'backcalc') st.I += st.hc * (Ki * e + (u - v) / Tt);
      else if (aw === 'clamp' && ((v > uMax && Ki * e > 0) || (v < uMin && Ki * e < 0))) {
        /* hold the integral */
      } else st.I += st.hc * Ki * e;
      st.uHeld = u;
    }
    H.t.push(t);
    H.r.push(r);
    H.y.push(y);
    H.ym.push(ym);
    H.u.push(st.uHeld);
    H.e.push(r - ym);
    if (last) return;
    const uin = st.uHeld + ld.at(t);
    st.ut.push(t);
    st.uv.push(uin);
    let ud = uin;
    if (theta > 0) {
      // the input θ ago: 0 before the start, linear between the grid times
      const tq = t - theta;
      if (tq < 0) ud = 0;
      else {
        let lo = 0,
          hi = st.ut.length - 1;
        while (lo < hi) {
          const m = (lo + hi + 1) >> 1;
          if (st.ut[m]! <= tq) lo = m;
          else hi = m - 1;
        }
        const f = lo + 1 < st.ut.length ? (tq - st.ut[lo]!) / (st.ut[lo + 1]! - st.ut[lo]!) : 0;
        ud = f > 0 ? st.uv[lo]! * (1 - f) + st.uv[lo + 1]! * f : st.uv[lo]!;
      }
    }
    st.ud = ud;
  }
  /** advance from st.t over n grid steps of st.h (the last one ending exactly at tTo): the kernel's RK4 between breaks at the grid
      times; at each break the plant's clamp (a tank), the blow-up guard, then the sample and the next input. budget: steps left */
  function advance(st: LoopState, n: number, tTo: number) {
    if (!(n >= 1)) return;
    const t0 = st.t,
      h = st.h,
      grid = (i: number) => (i === n ? tTo : t0 + i * h);
    const f = (_t: number, x: Float64Array, dx: Float64Array) => {
      if (st.dead) {
        for (let i = 0; i < nx; i++) dx[i] = 0;
        return;
      }
      pl.f(x, st.ud, dx);
    };
    const onGrid = (i: number, x: Float64Array) => {
      if (st.sat && !open) st.satTime += grid(i) - grid(i - 1);
      if (pl.post) pl.post(x);
      for (let q = 0; q < nx; q++) if (!(Math.abs(x[q]!) < BLOWUP)) st.dead = true; // unstable: the rest of the run is NaN
      st.k++;
      st.t = grid(i);
      st.x = Array.from(x);
      sample(st, i === n && st.final);
    };
    const breaks = [];
    for (let i = 1; i <= n; i++)
      breaks.push({
        t: grid(i),
        apply: (_t: number, x: Float64Array) => {
          onGrid(i, x);
        },
      });
    const k0 = st.k;
    NoemaSimKit.integrate({ f, y0: st.x, t0, tEnd: tTo, method: 'rk4', dt: h * (1 + 1e-9), breaks, maxSteps: n + 2 }); // dt a hair above h: a step always lands on the next break
    if (st.k - k0 < n) {
      st.dead = true;
      for (let i = st.k - k0 + 1; i <= n; i++) {
        st.k++;
        st.t = grid(i);
        sample(st, i === n && st.final);
      }
    } // the kernel stopped (NaN, blow-up): the rest is NaN
  }
  /** the result of the history so far: series, metrics */
  function result(st: LoopState): SimResult {
    const H = st.H,
      N = H.t.length,
      T = Float64Array.from(H.t),
      R = Float64Array.from(H.r),
      Y = Float64Array.from(H.y);
    const mt = metrics(T, Y, { t0: sp.t0, band });
    let iae = 0,
      ise = 0,
      itae = 0;
    for (let k = 1; k < N; k++) {
      const hk = T[k]! - T[k - 1]!,
        e0 = R[k - 1]! - Y[k - 1]!,
        e1 = R[k]! - Y[k]!;
      iae += 0.5 * hk * (Math.abs(e0) + Math.abs(e1));
      ise += 0.5 * hk * (e0 * e0 + e1 * e1);
      itae += 0.5 * hk * (T[k - 1]! * Math.abs(e0) + T[k]! * Math.abs(e1));
    }
    const tail = Math.max(1, Math.floor(N * 0.02));
    let es = 0;
    for (let k = N - tail; k < N; k++) es += R[k]! - Y[k]!; // (the mean of the last 2 %: a ramp's lag too)
    const m = { ...mt, ess: open ? NaN : es / tail, iae, ise, itae, satTime: st.satTime, unstable: st.dead };
    return {
      t: T,
      r: R,
      y: Y,
      ym: Float64Array.from(H.ym),
      u: Float64Array.from(H.u),
      e: Float64Array.from(H.e),
      metrics: m,
      steps: N - 1,
      dt: st.h,
    };
  }
  function run(o?: RunArgs | null) {
    o = o || {};
    const tEnd = o.tEnd,
      dt0 = o.dt === undefined || o.dt === 0 ? tEnd! / 1000 : o.dt;
    if (!(isNum(tEnd) && tEnd > 0 && isNum(dt0) && dt0 > 0)) throw fail('bad-args');
    const steps = Math.max(1, Math.ceil(tEnd / dt0 - 1e-9)),
      h = tEnd / steps;
    if (steps > MAX_STEPS) throw fail('budget', { steps, limit: MAX_STEPS });
    const st = start(h);
    st.final = true;
    sample(st, false);
    advance(st, steps, tEnd);
    return result(st);
  }
  return { run, start, sample, advance, result };
}
type Sim = ReturnType<typeof makeSim>;

function create(model: unknown, opts?: CreateOptions | null) {
  const problems = check(model);
  if (problems.some(p => p.level === 'error')) throw fail('invalid', { problems });
  const inner = makeSim(JSON.parse(JSON.stringify(model)) as Model, opts || {});
  return Object.freeze({ id: ID, run: (o?: RunArgs | null) => inner.run(o) });
}

// ---- the sim-spec@1 adapter: create(spec, {seed}) → { run(inputs) → outputs } (in the worker and inline) ----
const MAXP = 2000;
const thin = (a: ArrayLike<number>, k: number) => {
  if (a.length <= k) return Array.from(a);
  const f = (a.length - 1) / (k - 1),
    r = [];
  for (let i = 0; i < k; i++) r.push(a[Math.round(i * f)]!);
  return r;
};
function interp(t: ArrayLike<number>, v: ArrayLike<number>, x: number) {
  if (!(x >= t[0]!)) return v[0]!;
  if (x >= t[t.length - 1]!) return v[v.length - 1]!;
  const h = t[1]! - t[0]!,
    i = Math.min(t.length - 2, Math.floor(x / h)),
    f = (x - t[i]!) / h;
  return v[i]! + f * (v[i + 1]! - v[i]!);
}
function stat(v: ArrayLike<number> & Iterable<number>, s: string) {
  if (s === 'final') return v[v.length - 1]!;
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
  return s === 'min' ? mn : s === 'max' ? mx : s === 'mean' ? sum / v.length : s === 'pp' ? mx - mn : Math.sqrt(sq / v.length);
}
/** the signals of a result by name */
type SigMap = Readonly<Record<string, Float64Array | undefined>>;
/** a model as data (a JSON copy) whose bindings are being applied */
type Draft = Record<string, unknown>;
function setProp(m: Draft, el: string, prop: unknown, v: number | boolean) {
  if (prop === undefined) prop = 'value';
  if (el === 'plant' || el === 'noise') {
    if (isObj(m[el])) (m[el] as Draft)[prop as string] = v;
    return;
  }
  if (el === 'controller') {
    if (!isObj(m.controller)) return;
    (m.controller as Draft)[prop as string] =
      prop === 'antiWindup' ? (typeof v === 'boolean' ? (v ? 'clamp' : 'none') : AW[Math.round(v)] || 'none') : v;
    return;
  }
  if (prop === 'value') {
    m[el] = v;
    return;
  }
  const [k, f] = String(prop).split('.') as [string, string];
  if (isObj(m[el]) && isObj(m[el][k])) (m[el][k] as Draft)[f] = v;
}
/** the outputs of a result: series thinned (run), or — stepping — each series its value now (one sample a step) */
function outputsOf(outs: readonly PidOutput[], res: SimResult | null, inp: PidInputs, stepping: boolean) {
  const r: Record<string, unknown> = {};
  for (const o of outs) {
    try {
      if (!res) throw fail('run');
      if (o.kind === 'series') {
        const v = o.time ? res.t : (res as unknown as SigMap)[o.signal!] || [];
        r[o.id] = stepping ? (v.length ? v[v.length - 1] : NaN) : thin(v, MAXP);
        continue;
      }
      if (o.metric !== undefined) {
        const v = res.metrics[o.metric];
        r[o.id] = typeof v === 'number' ? v : NaN;
        continue;
      }
      const v = (res as unknown as SigMap)[o.signal!];
      if (!v) {
        r[o.id] = NaN;
        continue;
      }
      if (o.stat !== undefined) {
        r[o.id] = STATS.includes(o.stat) ? stat(v, o.stat) : NaN;
        continue;
      }
      const at = inp.$at ? inp.$at[o.id] : NaN;
      r[o.id] =
        stepping && !(at! <= res.t[res.t.length - 1]!)
          ? at === undefined || Number.isNaN(at)
            ? v[v.length - 1]
            : NaN
          : interp(res.t, v, at!);
    } catch {
      r[o.id] = o.kind === 'series' ? [] : NaN;
    }
  }
  return r;
}
const modelWith = (model: Rec, inp: PidInputs) => {
  const m = JSON.parse(JSON.stringify(model)) as Draft;
  delete m.bindings;
  for (const [el, prop, v] of inp.$bind || []) setProp(m, el, prop, v);
  return m;
};
const adapter = {
  create(spec: Spec, opts?: CreateOptions) {
    const model = (spec.model || {}) as Rec,
      outs = (spec.outputs || []) as readonly PidOutput[],
      seed = (opts && opts.seed)! >>> 0;
    let key: string | null = null,
      res: SimResult | null = null;
    // the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the loop's state is plain data; the inputs (bindings) are read at every step
    let S: LoopState | null = null,
      sim: Sim | null = null,
      simKey: string | null = null,
      slot: string | null = null;
    const simFor = (inp: PidInputs) => {
      const k = JSON.stringify(inp.$bind || []);
      if (k !== simKey) {
        simKey = k;
        const m = modelWith(model, inp);
        if (check(m).some(p => p.level === 'error')) throw fail('invalid');
        sim = makeSim(m as unknown as Model, { seed });
      }
      return sim!;
    };
    return {
      run(inp: PidInputs) {
        const k = JSON.stringify([inp.$bind || [], inp.$tran]);
        if (k !== key) {
          key = k;
          res = null;
          try {
            const T = inp.$tran || ({} as Partial<NonNullable<PidInputs['$tran']>>);
            res = create(modelWith(model, inp), { seed }).run({ tEnd: T.tEnd, dt: T.dt! > 0 ? T.dt : undefined });
          } catch {
            res = null;
          }
        }
        return outputsOf(outs, res, inp, false);
      },
      stepInit(inp: PidInputs, t0: number): StepResult {
        try {
          const T = inp.$tran || ({} as Partial<NonNullable<PidInputs['$tran']>>),
            h = T.dt! > 0 ? T.dt! : T.tEnd! > 0 ? T.tEnd! / 1000 : 0;
          S = simFor(inp).start(h || 1e-3);
          S.hAuto = !(h > 0);
          S.t = Number.isFinite(t0) ? t0 : 0;
          S.final = false;
          sim!.sample(S, false);
          return { out: outputsOf(outs, sim!.result(S), inp, true) };
        } catch {
          S = null;
          return { fail: 'part-failed', out: {} };
        }
      },
      stepTo(inp: PidInputs, t: number, dt: number): StepResult {
        if (!S) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
        try {
          const sm = simFor(inp);
          if (S.hAuto && S.k === 0) S.h = Math.min(S.h, dt / 10); // no transient dt: ten grid steps in the first macro step at least
          const n = Math.max(1, Math.ceil(dt / S.h - 1e-9));
          if (S.k + n > MAX_STEPS) return { fail: 'budget', out: {}, dt: 0, events: [] };
          sm.advance(S, n, t + dt);
          return { out: outputsOf(outs, sm.result(S), inp, true), dt, events: [] };
        } catch {
          return { fail: 'part-failed', out: {}, dt: 0, events: [] };
        }
      },
      snapshot() {
        if (!S) return -1;
        slot = JSON.stringify(S);
        return 0;
      },
      restore(i: number) {
        if (i !== 0 || slot === null) return false;
        S = JSON.parse(slot) as LoopState;
        return true;
      },
    };
  },
};
/** on the main thread: the spec's expressions (bindings, transient times, `at`) become numbers or booleans */
function prepare(spec: Spec, compileExpr: (src: string) => Compiled) {
  const m = (spec.model || {}) as { readonly bindings?: readonly Rec[]; readonly transient?: Rec },
    f = (v: unknown) => (typeof v === 'string' ? compileExpr(v) : () => v);
  const binds = (m.bindings || []).map(b => [b.element as string, b.prop, f(b.expr)] as const);
  const tEnd = m.transient ? f(m.transient.tEnd) : null,
    dt = m.transient && m.transient.dt !== undefined ? f(m.transient.dt) : null;
  const ats = ((spec.outputs || []) as readonly PidOutput[]).filter(o => o.at !== undefined).map(o => [o.id, f(o.at)] as const);
  const ev = (g: (env: Inputs) => unknown, env: Inputs) => {
    try {
      const v = g(env);
      return typeof v === 'boolean' ? v : Number(v);
    } catch {
      return NaN;
    }
  };
  return (env: Inputs) => ({
    ...env,
    $bind: binds.map(([el, prop, g]) => [el, prop, ev(g, env)]),
    $tran: tEnd ? { tEnd: ev(tEnd, env), dt: dt ? ev(dt, env) : 0 } : null,
    $at: Object.fromEntries(ats.map(([id, g]) => [id, ev(g, env)])),
  });
}

const engine = Object.freeze({
  id: ID,
  check: (spec: Spec) =>
    checkSpec(spec)
      .filter(p => p.level === 'error')
      .map(p => `spec.${p.path}: ${p.msg}`),
  prepare,
  create: (spec: Spec, opts?: CreateOptions) => adapter.create(spec, opts),
  stepper: true, // a part of a co-simulation (stepInit / stepTo / snapshot / restore on the instance)
});
const API = Object.freeze({
  id: ID,
  STATS: Object.freeze(STATS.slice()),
  SIGNALS: Object.freeze(SIGNALS.slice()),
  METRICS: Object.freeze(METRICS.slice()),
  ZN,
  MOTOR: Object.freeze({ ...MOTOR }),
  limits: Object.freeze({ steps: MAX_STEPS, bindings: MAX_BINDINGS, signalSteps: MAX_STEPS_SIGNAL }),
  check,
  checkSpec,
  create,
  metrics,
  adapter: Object.freeze(adapter),
  engine,
});
export default API;
/* i18n-ignore-end */
