/* ===================== NoemaSimKit — the simulation kernel of the engine library (docs/library/simkit.md) =====================
   The shared tools every time-stepping engine of the library builds on (des@1, field@1, agents@1, the "parts" orchestrator):
     • randomness: L'Ecuyer's MRG32k3a with real streams and substreams (jump-ahead matrices), one stream per purpose, common random
       numbers and antithetic variates; standard variates by inversion where it is cheap (synchronisation for CRN);
     • the event calendar (a binary heap; ties: time, then priority, then insertion order) and an executive with scheduled,
       conditional (three-phase C) and timed events, cancellation, interruptible activities (resume / restart / resample), a Zeno
       guard, a capped event log and an event budget;
     • continuous time: Dormand–Prince 5(4) with dense output and PI control, fixed RK4 / Heun / Euler, state events located by
       bracketing + the Illinois method (+ Brent polish), direction and hysteresis;
     • output analysis: Welford, time-weighted averages, Student-t intervals, replications, batch means, MSER-5 warm-up, Little's law;
     • sweeps and sensitivity: one-at-a-time, grids, Morris elementary effects, Sobol' indices (Saltelli 2010 / Jansen 1999);
     • verification: Richardson order estimation, conservation, determinism, unit dimensions and time units;
     • a rollback-free co-simulation master (macro steps, zero-order-hold exchange, cross-part events, early stops at state events).
   Sources (each also beside its code): Law, Simulation Modeling and Analysis, 5th ed. 2015 (L); Banks, Carson, Nelson & Nicol,
   Discrete-Event System Simulation, 5th ed. 2010 (BCNN); Zeigler, Muzy & Kofman, Theory of Modeling and Simulation, 3rd ed. 2018
   (DEVS); Hairer, Nørsett & Wanner, Solving ODEs I, 2nd ed. 1993 (HNW); Shampine, Gladwell & Thompson, Solving ODEs with MATLAB, 2003
   (event location); L'Ecuyer 1999 (Oper. Res. 47:1) and L'Ecuyer, Simard, Chen & Kelton 2002 (Oper. Res. 50:6) for MRG32k3a streams;
   Sargent 2013 (J. Simulation 7:1) V&V; Saltelli et al. 2008 Global Sensitivity Analysis: The Primer and Saltelli et al. 2010 (CPC
   181); Morris 1991 (Technometrics 33:2), Campolongo, Cariboni & Saltelli 2007; White 1997, White, Cobb & Spratt 2000 (MSER-5),
   Franklin & White 2008; Schmeiser 1982 and Kelton/Law ch. 9 (batch means); Little 1961.
   Pure JS: no DOM, no network, no clock; every loop bounded; never throws out of a run (NaN + codes). Runs in a Worker: source(). */
import { textOf } from '../../kernel/text.ts';
import NoemaExpr from './simexpr.ts';

/* i18n-ignore-start */ // code, not text: only codes and numbers leave this module
const FX = NoemaExpr.FUNCS;
// the transcendental functions: NoemaExpr's fdlibm ports (bit-identical on every device)
const exp = FX.exp.fn,
  log = FX.log.fn,
  sin = FX.sin.fn,
  pow = FX.pow.fn;
/** a plain object of a model or a config (data from a spec: every field is checked where it is read) */
export type Rec = Readonly<Record<string, unknown>>;
/** a vector of numbers: an array or a typed array */
export type Nums = ArrayLike<number>;
/** a matrix of numbers, row by row */
export type Mat = readonly (readonly number[])[];

/** the right-hand side of y' = f(t, y): fills dy */
export type Rhs = (t: number, y: Float64Array, dy: Float64Array) => void;
/** a code of a run: the first occurrence of each, with its time */
export interface CodeRec {
  code: string;
  level: 'error' | 'warning';
  t?: number | undefined;
  info?: unknown;
}
export interface Codes {
  readonly list: CodeRec[];
  code(c: string, t?: number | null, info?: unknown, fatal?: boolean): void;
  has(c: string): boolean;
  fatal(): boolean;
}
/** a seeded stream of uniforms in (0, 1) with its variates (stream()) */
export interface Stream {
  (): number;
  state(): number[];
  draws(): number;
  sub(i: number): Stream;
  anti(): Stream;
  u53(): number;
  int(n: number): number;
  uniform(a: number, b: number): number;
  exp(rate: number): number;
  expMean(mean: number): number;
  normal(mu?: number, sd?: number | null): number;
  lognormal(mu: number, sigma: number): number;
  tri(a: number, c: number, b: number): number;
  weibull(k: number, lam: number): number;
  erlang(k: number, mean: number): number;
  gamma(k: number, theta: number): number;
  beta(a: number, b: number): number;
  poisson(lam: number): number;
  binomial(n: number, p: number): number;
  discrete(probs: Nums): number;
  empirical(values: readonly number[], probs?: Nums | null): number;
  shuffle<T>(a: T[]): T[];
  pick<T>(a: readonly T[]): T | undefined;
}
/** a distribution of the engines, ready to draw (dist()) */
export interface Dist {
  readonly ok: boolean;
  readonly mean: number;
  readonly var: number;
  readonly scv: number;
  readonly draw: (r: Stream) => number;
}
/** one accepted step of a method: its dense output on [t0, t1] */
export interface Step {
  readonly t0: number;
  readonly t1: number;
  readonly y1: Float64Array;
  readonly seg: Seg;
  readonly fail?: undefined;
}
export type Seg = (tq: number, out: Float64Array) => void;
type StepOut = Step | { readonly fail: 'nan' | 'time' | 'step-underflow' };
interface Method {
  readonly stiff: boolean;
  reset(t0: number, y0: Nums): void;
  step(tT: number): StepOut;
}
interface MethodOpts {
  readonly rtol: number;
  readonly atol: Float64Array;
  readonly hmax: number;
  readonly dt: number | undefined;
  readonly radauLinear?: unknown;
}
interface Stats {
  steps: number;
  rejected: number;
  nfev: number;
}
/** a state event of integrate(): g(t, y) crosses 0 */
export interface StateEvent {
  readonly g: (t: number, y: Float64Array) => number;
  readonly dir?: number | undefined;
  readonly hyst?: number | undefined;
  readonly kind?: unknown;
  readonly terminal?: boolean | undefined;
  readonly observe?: boolean | undefined;
  readonly onEvent?:
    ((t: number, y: Float64Array, info: { j: number; dir: number; observe?: boolean | undefined }) => string | undefined) | undefined;
}
/** a time the step lands on exactly; apply(t, y) may change y */
export interface Break {
  readonly t: number;
  readonly apply?: ((t: number, y: Float64Array) => void) | undefined;
}
export interface IntegrateConfig {
  readonly f?: Rhs | undefined;
  readonly y0?: Nums | undefined;
  readonly t0?: number | undefined;
  readonly tEnd?: number | undefined;
  readonly method?: string | undefined;
  readonly rtol?: number | undefined;
  readonly atol?: number | Nums | undefined;
  readonly dt?: number | undefined;
  readonly hmax?: number | undefined;
  readonly maxSteps?: number | undefined;
  readonly maxEvents?: number | undefined;
  readonly maxInstant?: number | undefined;
  readonly gtol?: number | undefined;
  readonly samples?: readonly number[] | undefined;
  readonly onSample?: ((t: number, y: Float64Array) => void) | undefined;
  readonly events?: readonly (StateEvent | null)[] | undefined;
  readonly breaks?: readonly Break[] | undefined;
  readonly onSegment?: ((seg: Seg, a: number, b: number) => void) | undefined;
  readonly pairs?: readonly (readonly number[])[] | undefined;
  readonly radauLinear?: unknown;
}
export interface Hit {
  t: number;
  j: number;
  kind: unknown;
  dir: number;
  observe?: boolean | undefined;
}
export interface IntegrateResult {
  t: number;
  y: number[];
  steps: number;
  rejected: number;
  nfev: number;
  events: Hit[];
  stop: string;
  method: string | undefined;
  codes: CodeRec[];
}
/** a delay equation: f(t, y, lag, dy) with lag(i, k) = y_i(t − τ_k) */
export interface DdeConfig extends Omit<IntegrateConfig, 'f'> {
  readonly f?: ((t: number, y: Float64Array, lag: (i: number, k?: number) => number, dy: Float64Array) => void) | undefined;
  readonly lags?: readonly number[] | undefined;
  readonly history?: ((t: number) => Nums) | undefined;
}
/** a semi-explicit index-1 DAE: y' = f(t, y, z), 0 = g(t, y, z) */
export interface DaeConfig extends Omit<IntegrateConfig, 'f'> {
  readonly f?: ((t: number, y: Float64Array, z: Float64Array, dy: Float64Array) => void) | undefined;
  readonly g?: ((t: number, y: Float64Array, z: Float64Array, res: Float64Array) => void) | undefined;
  readonly z0?: Nums | undefined;
}
/** M y' = f(t, y) by the θ-method (daeTheta) */
export interface DaeThetaConfig {
  readonly f?: ((t: number, y: Float64Array, out: Float64Array) => void) | undefined;
  readonly jac?: ((t: number, y: Float64Array, J: Float64Array) => void) | undefined;
  readonly y0?: Nums | undefined;
  readonly t0?: number | undefined;
  readonly tEnd?: number | undefined;
  readonly dt?: number | undefined;
  readonly M?: Nums | readonly Nums[] | null | undefined;
  readonly theta?: number | undefined;
  readonly method?: string | undefined;
  readonly newtonTol?: number | undefined;
  readonly maxNewton?: number | undefined;
  readonly maxSteps?: number | undefined;
  readonly linear?: boolean | undefined;
  readonly consistent?: boolean | undefined;
  readonly limit?: ((yOld: Float64Array | null, yNew: Float64Array) => unknown) | undefined;
  readonly beforeStep?:
    ((t0: number, t1: number, y: Float64Array) => { readonly theta?: number | undefined } | null | undefined) | undefined;
  readonly breaks?: readonly Break[] | undefined;
  readonly samples?: readonly number[] | undefined;
  readonly onSample?: ((t: number, y: Float64Array) => void) | undefined;
  readonly onStep?: ((t: number, y: Float64Array) => void) | undefined;
}
export interface DaeThetaResult {
  t: number;
  y: number[];
  steps: number;
  newton: number;
  nfev: number;
  stop: string;
  codes: CodeRec[];
}
/** a chemical reaction network for ssa / tauLeap */
export interface SsaConfig {
  readonly x0?: number[] | undefined;
  readonly nu?: readonly (readonly number[])[] | undefined;
  readonly propensity?: ((x: number[], a: Float64Array) => void) | undefined;
  readonly tEnd?: number | undefined;
  readonly t0?: number | undefined;
  readonly r?: Stream | undefined;
  readonly maxEvents?: number | undefined;
  readonly onEvent?: ((t: number, x: number[], j: number) => void) | undefined;
  readonly tau?: number | undefined;
}
/** an Itô SDE with diagonal noise */
export interface SdeConfig {
  readonly drift?: ((t: number, x: Float64Array, out: Float64Array) => void) | undefined;
  readonly diffusion?: ((t: number, x: Float64Array, out: Float64Array) => void) | undefined;
  readonly dsig?: ((t: number, x: Float64Array, out: Float64Array) => void) | undefined;
  readonly x0?: readonly number[] | undefined;
  readonly t0?: number | undefined;
  readonly tEnd?: number | undefined;
  readonly dt?: number | undefined;
  readonly method?: string | undefined;
  readonly r?: Stream | undefined;
  readonly samples?: readonly number[] | undefined;
  readonly onSample?: ((t: number, x: Float64Array) => void) | undefined;
}
/** the parameters of a distribution object that dist() accepted (ok) */
export interface DistParams {
  readonly dist?: unknown;
  readonly mean: number;
  readonly sd: number;
  readonly min: number;
  readonly max: number;
  readonly mode: number;
  readonly shape: number;
  readonly scale: number;
  readonly k: number;
}
/** an axis of a sweep */
export interface Axis {
  readonly lo: number;
  readonly hi: number;
  readonly points?: number | undefined;
}
export interface MinimizeOpts {
  readonly step?: number | readonly number[] | undefined;
  readonly lo?: readonly number[] | undefined;
  readonly hi?: readonly number[] | undefined;
  readonly maxEval?: number | undefined;
  readonly tol?: number | undefined;
}
/** an entry of the event calendar */
interface CalEntry {
  t: number;
  prio: number;
  seq: number;
  kind: unknown;
  data: unknown;
  id?: number | undefined;
}
export interface SimOpts {
  readonly tEnd?: number | undefined;
  readonly maxEvents?: number | undefined;
  readonly zeno?: number | undefined;
  readonly logCap?: number | undefined;
  readonly eps?: number | undefined;
  readonly t0?: number | undefined;
}
export interface SimOp {
  readonly prio?: number | undefined;
  readonly kind?: unknown;
  readonly data?: unknown;
}
export interface SimEntry {
  t: number;
  prio: number;
  seq: number;
  fn: (e: SimEntry) => void;
  kind: unknown;
  data: unknown;
}
/** an interruptible activity of the executive */
export interface Activity {
  dur: number;
  start: number;
  end: number;
  id: number;
  done: boolean;
  paused: boolean;
  left: number;
  interrupts: number;
  remaining(): number;
  interrupt(): number;
  resume(policy: string, newDur?: number): void;
  cancel(): void;
}
/** the event record every engine and the orchestrator exchange */
export interface SimEvent {
  t: number;
  source: string;
  kind: string;
  data: unknown;
  prio: number;
  seq: number;
  to?: readonly string[] | undefined;
  late?: boolean | undefined;
}
/** the inputs of a part: numbers (and series) by name */
export type Inputs = Readonly<Record<string, unknown>>;
/** a step of a part */
export type PartStep = {
  readonly state?: unknown;
  readonly out?: unknown;
  readonly dt?: number | undefined;
  readonly events?: unknown;
  readonly fail?: string | undefined;
};
export interface StepperDef<S = unknown> {
  readonly id?: unknown;
  readonly init?: ((model: unknown, inputs: Inputs, ctx: unknown) => S) | undefined;
  readonly step?: ((state: S, inputs: Inputs, t: number, dt: number, ctx: unknown) => PartStep | null | undefined) | undefined;
  readonly snapshot?: ((state: S) => unknown) | null | undefined;
  readonly restore?: ((snap: unknown) => S) | null | undefined;
  readonly output?: ((state: S) => Rec | null | undefined) | undefined;
  readonly onEvent?: ((state: S, ev: SimEvent, t: number) => unknown) | undefined;
}
/** a checked part (stepper()) */
export interface Part {
  readonly id: string;
  readonly kind: 'stepper';
  init?(model: unknown, inputs: Inputs, ctx: unknown): unknown;
  step(
    state: unknown,
    inputs: Inputs | null,
    t: number,
    dt: number,
    ctx: unknown,
  ): { state: unknown; out: Rec; dt: number; events: SimEvent[]; fail?: string | undefined };
  readonly snapshot: ((state: unknown) => unknown) | null;
  readonly restore: ((snap: unknown) => unknown) | null;
  readonly output: ((state: unknown) => Rec | null | undefined) | null;
  readonly onEvent: ((state: unknown, ev: SimEvent, t: number) => unknown) | null;
  readonly inputs?: ((outs: Readonly<Record<string, Rec>>, t: number) => Inputs | null | undefined) | undefined;
}
export interface OdeStepperDef {
  readonly id?: unknown;
  readonly n?: number | undefined;
  readonly t0?: number | undefined;
  readonly y0?: ((model: unknown, inputs: Inputs) => Nums | null | undefined) | undefined;
  readonly f?: ((t: number, y: Float64Array, dy: Float64Array, inputs: Inputs) => void) | undefined;
  readonly method?: string | undefined;
  readonly rtol?: number | undefined;
  readonly atol?: number | Nums | undefined;
  readonly dt?: number | undefined;
  readonly hmax?: number | undefined;
  readonly pairs?: readonly (readonly number[])[] | undefined;
  readonly maxSteps?: number | undefined;
  readonly events?:
    | readonly {
        readonly kind?: unknown;
        readonly g: (t: number, y: Float64Array, inputs: Inputs) => number;
        readonly dir?: number | undefined;
        readonly hyst?: number | undefined;
        readonly terminal?: boolean | undefined;
        readonly apply?: ((t: number, y: Float64Array, inputs: Inputs) => void) | undefined;
      }[]
    | undefined;
  readonly out?: ((t: number, y: readonly number[], inputs: Inputs) => Rec) | undefined;
}
interface OdeState {
  t: number;
  y: number[];
  steps: number;
}
/** a part of a co-simulation as the master holds it */
interface CosimPart {
  p: Part;
  id: string;
  t: number;
  state: unknown;
  inbox: SimEvent[];
}
export interface CosimResult {
  t: number;
  outs: Record<string, Rec>;
  trace: { t: number; part: string; out: Rec | undefined }[];
  events: SimEvent[];
  codes: CodeRec[];
  macro: number;
  iterations: number;
}

export interface CosimConfig {
  readonly tEnd?: number | undefined;
  readonly dt?: number | undefined;
  readonly t0?: number | undefined;
  readonly parts?: readonly (Part | null)[] | undefined;
  readonly link?: Readonly<Record<string, (outs: Readonly<Record<string, Rec>>, t: number) => Inputs | null | undefined>> | undefined;
  readonly order?: readonly string[] | undefined;
  readonly maxMacro?: number | undefined;
  readonly iterate?: unknown;
  readonly model?: unknown;
  readonly inputs0?: Inputs | undefined;
}

const sqrt = Math.sqrt,
  abs = Math.abs,
  floor = Math.floor,
  min = Math.min,
  max = Math.max;
const EPS = 2.220446049250313e-16,
  PI = 3.141592653589793,
  fin = Number.isFinite as (v: unknown) => v is number;
const MAX_STEPS = 200000,
  MAX_EVENTS = 200000,
  MAX_LOG = 2000,
  MAX_POINTS = 2000;
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ======================================================================================================================
     Codes and budgets (the same shape as ode@1's ctx: the first occurrence of each code is kept, with its time)
     ====================================================================================================================== */
function codes(fatalList?: readonly string[] | null): Codes {
  const list: CodeRec[] = [],
    seen = new Set<string>(),
    F = new Set(fatalList || []);
  return {
    list,
    code(c: string, t?: number | null, info?: unknown, fatal?: boolean) {
      if (seen.has(c)) return;
      seen.add(c);
      const o: CodeRec = { code: c, level: fatal || F.has(c) ? 'error' : 'warning' };
      if (t != null && fin(t)) o.t = t;
      if (info != null) o.info = info;
      list.push(o);
    },
    has: (c: string) => seen.has(c),
    fatal: () => list.some(o => o.level === 'error'),
  };
}
/** budget(max) → {spend(n) → false once exhausted, used, left, over} (≤ 200 000 by default: the library's bound) */
function budget(mx: number) {
  const cap = fin(mx) && mx > 0 ? min(mx, 1e7) : MAX_STEPS;
  let used = 0;
  return {
    spend(n?: number | null) {
      used += n == null ? 1 : n;
      return used <= cap;
    },
    get used() {
      return used;
    },
    get left() {
      return max(0, cap - used);
    },
    get over() {
      return used > cap;
    },
    cap,
  };
}

/* ======================================================================================================================
     Special functions (for the variates, the t quantile and the queueing formulas of the engines)
     ====================================================================================================================== */
// log Γ(x), x > 0: Lanczos (g = 7, n = 9; Numerical Recipes 3rd ed. §6.1), reflection for x < 0.5
const LZ = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lgamma(x: number): number {
  if (!(x > 0)) return x === 0 ? Infinity : NaN;
  if (x < 0.5) return log(PI / abs(sin(PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LZ[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LZ[i]! / (x + i);
  return 0.9189385332046728 + (x + 0.5) * log(t) - t + log(a);
}
// the regularized lower incomplete gamma P(a, x): series / Lentz continued fraction (NR 3rd ed. §6.2)
function gammaP(a: number, x: number) {
  if (!(a > 0) || !(x >= 0)) return NaN;
  if (x === 0) return 0;
  if (x === Infinity) return 1;
  if (temmeOK(a, x)) {
    const { eta, R: r } = temmeR(a, x);
    return 0.5 * erfc(-eta * sqrt(a / 2)) - r;
  }
  if (a >= 10)
    return x < a + 1
      ? (() => {
          let ap = a,
            sum = 1 / a,
            del = sum;
          for (let n = 0; n < 20000; n++) {
            ap++;
            del *= x / ap;
            sum += del;
            if (abs(del) < abs(sum) * 1e-17) break;
          }
          return min(1, sum * exp(lnPre(a, x)));
        })()
      : 1 - gammaQ(a, x);
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a,
      sum = 1 / a,
      del = sum;
    for (let n = 0; n < 1000; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (abs(del) < abs(sum) * 1e-16) break;
    }
    return min(1, sum * exp(-x + a * log(x) - gln));
  }
  let b = x + 1 - a,
    c = 1e300,
    d = 1 / b,
    h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (abs(del - 1) < 1e-16) break;
  }
  return max(0, 1 - exp(-x + a * log(x) - gln) * h);
}
// the regularized incomplete beta I_x(a, b) (NR 3rd ed. §6.4, modified Lentz)
function betacf(a: number, b: number, x: number) {
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (abs(d) < 1e-300) d = 1e-300;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (abs(del - 1) < 1e-16) break;
  }
  return h;
}
function betaI(a: number, b: number, x: number) {
  if (!(a > 0 && b > 0) || !(x >= 0 && x <= 1)) return NaN;
  if (x === 0 || x === 1) return x;
  const bt = exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
// the standard normal: Φ by erfc (W. J. Cody 1969 rational approximations via the complementary gamma), Φ⁻¹ by Wichura 1988 AS241
function normCdf(z: number) {
  if (!fin(z)) return z > 0 ? 1 : z < 0 ? 0 : NaN;
  const p = 0.5 * gammaQ(0.5, (z * z) / 2);
  return z >= 0 ? 1 - p : p;
} // the tail from Q: no cancellation
/* ---- the incomplete gamma at large a: Temme's uniform asymptotic expansion (Temme 1979, SIAM J. Math. Anal. 10:4; DLMF 8.12.3–
     8.12.4; DiDonato & Morris 1986 §4, their region a ≥ 20, |x/a − 1| ≤ 0.4; Gil, Segura & Temme 2012, ACM TOMS 38:2):
       Q(a, x) = ½erfc(η√(a/2)) + R, P(a, x) = ½erfc(−η√(a/2)) − R, R = e^(−aη²/2)/√(2πa) · Σ_k c_k(η) a^(−k),
     λ = x/a, η = sign(λ − 1)·√(2(λ − 1 − ln λ)). The c_k are their Taylor series in η (k = 0..13): c₀ = 1/(λ − 1) − 1/η and
     c_k = c′_{k−1}/η + (−1)^k g_k/(λ − 1) with g_k the Stirling coefficients of Γ*(a) — generated exactly in rational arithmetic
     (series reversion of η(λ)) and checked against DiDonato & Morris's table (d₀ = −1/3, 1/12, −2/135, …; d₁ = −1/540, −1/288, …) */
const TEMME = [
  [
    -0.3333333333333333, 0.08333333333333333, -0.014814814814814815, 0.0011574074074074073, 0.0003527336860670194, -0.0001787551440329218,
    3.919263178522438e-5, -2.185448510679992e-6, -1.85406221071516e-6, 8.296711340953087e-7, -1.7665952736826078e-7, 6.707853543401498e-9,
    1.0261809784240309e-8, -4.382036018453353e-9, 9.14769958223679e-10, -2.5514193994946248e-11, -5.830772132550426e-11,
    2.4361948020667415e-11, -5.0276692801141755e-12, 1.1004392031956135e-13, 3.371763262400985e-13, -1.392388722418162e-13,
    2.8534893807047445e-14, -5.139111834242572e-16, -1.9752288294349442e-15, 8.099521156704561e-16,
  ],
  [
    -0.001851851851851852, -0.003472222222222222, 0.0026455026455026454, -0.0009902263374485596, 0.00020576131687242798,
    -4.018775720164609e-7, -1.8098550334489977e-5, 7.64916091608111e-6, -1.6120900894563446e-6, 4.647127802807434e-9, 1.378633446915721e-7,
    -5.752545603517705e-8, 1.1951628599778148e-8, -1.7543241719747647e-11, -1.0091543710600413e-9, 4.162792991842583e-10,
    -8.56390702649298e-11, 6.067215101604758e-14, 7.1624989648114856e-12, -2.933186643771437e-12, 5.996696365683689e-13,
    -2.1671786527323313e-16, -4.978339972369262e-14, 2.0291628823713425e-14,
  ],
  [
    0.004133597883597883, -0.0026813271604938273, 0.0007716049382716049, 2.0093878600823047e-6, -0.0001073665322636516,
    5.2923448829120125e-5, -1.2760635188618728e-5, 3.423578734096138e-8, 1.3721957309062934e-6, -6.298992138380055e-7,
    1.4280614206064242e-7, -2.0477098421990866e-10, -1.409252991086752e-8, 6.228974084922022e-9, -1.3670488396617114e-9,
    9.428356159014678e-13, 1.2872252400089318e-10, -5.5645956134363323e-11, 1.197593554636698e-11, -4.1689782251838634e-15,
    -1.0940640427884595e-12, 4.662239946390136e-13,
  ],
  [
    0.0006494341563786008, 0.00022947209362139917, -0.0004691894943952557, 0.00026772063206283885, -7.561801671883977e-5,
    -2.396505113867297e-7, 1.1082654115347302e-5, -5.6749528269915965e-6, 1.4230900732435883e-6, -2.7861080291528143e-11,
    -1.6958404091930278e-7, 8.099464905388083e-8, -1.9111168485973655e-8, 2.3928620439808118e-12, 2.0620131815488797e-9,
    -9.460496661855133e-10, 2.1541049775774907e-10, -1.388823336813903e-14, -2.1894761681963938e-11, 9.790998951171684e-12,
  ],
  [
    -0.0008618882909167117, 0.0007840392217200666, -0.0002990724803031902, -1.4638452578843418e-6, 6.641498215465122e-5,
    -3.968365047179435e-5, 1.1375726970678419e-5, 2.507497226237533e-10, -1.6954149536558305e-6, 8.907507532205309e-7,
    -2.292934834000805e-7, 2.956794137544049e-11, 2.8865829742708783e-8, -1.4189739437803219e-8, 3.4463580499464896e-9,
    -2.3024517174528067e-13, -3.9409233028046403e-10, 1.86023389685045e-10,
  ],
  [
    -0.00033679855336635813, -6.972813758365857e-5, 0.0002772753244959392, -0.00019932570516188847, 6.797780477937208e-5,
    1.419062920643967e-7, -1.3594048189768693e-5, 8.018470256334202e-6, -2.291481176508095e-6, -3.252473551298454e-10,
    3.4652846491085265e-7, -1.8447187191171344e-7, 4.8240967037894184e-8, -1.7989466721743514e-14, -6.306194500013523e-9,
    3.162417628774568e-9,
  ],
  [
    0.0005313079364639922, -0.0005921664373536939, 0.0002708782096718045, 7.902353232660328e-7, -8.153969367561969e-5, 5.61168275310625e-5,
    -1.8329116582843375e-5, -3.0796134506033047e-9, 3.465155368803609e-6, -2.0291327396058603e-6, 5.788792863149004e-7,
    2.338630673826657e-13, -8.828600746330484e-8, 4.7435958880408125e-8,
  ],
  [
    0.00034436760689237765, 5.171790908260592e-5, -0.00033493161081142234, 0.0002812695154763237, -0.00010976582244684731,
    -1.2741009095484485e-7, 2.7744451511563645e-5, -1.8263488805711332e-5, 5.7876949497350525e-6, 4.93875893393627e-10,
    -1.0595367014026043e-6, 6.166714376110408e-7,
  ],
  [
    -0.0006526239185953094, 0.0008394987206720873, -0.000438297098541721, -6.969091458420552e-7, 0.00016644846642067547,
    -0.00012783517679769218, 4.629953263691304e-5, 4.557909867922708e-9, -1.0595271125805195e-5, 6.783342904865167e-6,
  ],
  [
    -0.0005967612901927463, -7.204895416020011e-5, 0.0006782308837667328, -0.0006401475260262758, 0.00027750107634328704,
    1.819700838046515e-7, -8.479507117068503e-5, 6.105192082501531e-5,
  ],
  [
    0.0013324454494800656, -0.0019144384985654776, 0.0011089369134596636, 9.9324041226423e-7, -0.0005087450129309319,
    0.00042735056665392886, -0.00016858853767910798, -8.1301893922785e-9,
  ],
  [
    0.001579727660730835, 0.00016251626278391583, -0.0020633421035543276, 0.00213896861856891, -0.0010108559391263003, -3.99127055299192e-7,
    0.0003623502508476469, -0.00028143901463712157,
  ],
  [
    -0.004072512119514016, 0.00640336283380807, -0.004041016108167662, -2.1837328028662328e-6, 0.002174044180125464, -0.001970044051841889,
    0.0008359546974796246, 1.9445447567109655e-8,
  ],
  [
    -0.0059475779383993, -0.0005401647678926045, 0.00879104135507679, -0.009857631558785612, 0.005013469503102154, 1.2807521786221875e-6,
    -0.0020626019342754685, 0.0017109128573523059,
  ],
];
const lpm = (t: number) => {
  if (abs(t) < 0.4) {
    let s2 = 0,
      p2 = t * t;
    for (let n = 2; n < 60; n++) {
      const d = (n % 2 ? -p2 : p2) / n;
      s2 += d;
      if (abs(d) < 1e-18 * abs(s2)) break;
      p2 *= t;
    }
    return s2;
  }
  return t - log(1 + t);
}; // t − ln(1 + t)
/** ln Γ*(a) = ln Γ(a) − (a − ½)ln a + a − ½ln 2π (the Stirling series; a ≥ 10) */
const lgStar = (a: number) => {
  const z = 1 / a,
    z2 = z * z;
  return z * (1 / 12 + z2 * (-1 / 360 + z2 * (1 / 1260 + z2 * (-1 / 1680 + z2 * (1 / 1188 + z2 * (-691 / 360360 + z2 / 156))))));
};
/** ln(x^a e^(−x)/Γ(a)) with the large terms cancelled analytically for a ≥ 10: −a·(t − ln(1 + t)) + ½ln(a/2π) − ln Γ*(a), t = x/a − 1 */
const lnPre = (a: number, x: number) => (a >= 10 ? -a * lpm(x / a - 1) + 0.5 * log(a / (2 * PI)) - lgStar(a) : -x + a * log(x) - lgamma(a));
function temmeR(a: number, x: number) {
  const t = x / a - 1,
    eta = (t >= 0 ? 1 : -1) * sqrt(2 * lpm(t));
  let sum = 0,
    ak = 1;
  for (let k = 0; k < TEMME.length; k++) {
    const c = TEMME[k]!;
    let v = 0;
    for (let i = c.length - 1; i >= 0; i--) v = v * eta + c[i]!;
    sum += v * ak;
    ak /= a;
  }
  return { eta, R: (exp(-0.5 * a * eta * eta) / sqrt(2 * PI * a)) * sum };
}
const temmeOK = (a: number, x: number) => a >= 20 && abs(x / a - 1) <= 0.4;
/* ---- upper tails without cancellation ----
     gammaQ(a, x) = Γ(a, x)/Γ(a): the continued fraction (modified Lentz) for x ≥ a + 1, else 1 − the series of P (then P ≤ ~½, so
     1 − P loses nothing); the prefactor x^a e^−x / Γ(a) in logarithms (NR 3rd ed. §6.2; DiDonato & Morris 1986, ACM TOMS 12:4 — their
     split, without the Temme expansion, whose accuracy the series and fraction reach here with enough terms: ≤ 20 000 for a ≤ 10⁸) */
function gammaQ(a: number, x: number): number {
  if (!(a > 0) || !(x >= 0)) return NaN;
  if (x === 0) return 1;
  if (x === Infinity) return 0;
  if (temmeOK(a, x)) {
    const { eta, R: r } = temmeR(a, x);
    return 0.5 * erfc(eta * sqrt(a / 2)) + r;
  }
  const lpre = lnPre(a, x),
    cap = 20000;
  if (x < a + 1) {
    let ap = a,
      sum = 1 / a,
      del = sum;
    for (let n = 0; n < cap; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (abs(del) < abs(sum) * 1e-17) break;
    }
    return max(0, 1 - min(1, sum * exp(lpre)));
  }
  let b = x + 1 - a,
    c = 1e300,
    d = 1 / b,
    h = d;
  for (let i = 1; i < cap; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (abs(del - 1) < 1e-16) break;
  }
  return min(1, exp(lpre) * h);
}
/** erfc(x) = Q(½, x²) for x ≥ 0 (accurate to the underflow at x ≈ 26.5), 2 − erfc(−x) below; erf = 1 − erfc near 0 by the series of P */
function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  return x >= 0 ? gammaQ(0.5, x * x) : 2 - gammaQ(0.5, x * x);
}
function erf(x: number) {
  if (Number.isNaN(x)) return NaN;
  const p = abs(x) < 1 ? gammaP(0.5, x * x) : 1 - gammaQ(0.5, x * x);
  return x < 0 ? -p : p;
}
/** erfcInv(p), 0 < p < 2: x = −Φ⁻¹(p/2)/√2 by AS241 (relative accuracy in the tail), then two Newton steps on erfc */
function erfcInv(p: number) {
  if (!(p > 0 && p < 2)) return p === 0 ? Infinity : p === 2 ? -Infinity : NaN;
  let x = -normInv(p / 2) / Math.SQRT2;
  for (let i = 0; i < 2; i++) {
    const e = erfc(x) - p,
      dd = (-2 / sqrt(PI)) * exp(-x * x);
    if (!(dd !== 0) || !fin(e)) break;
    const nx = x - e / dd;
    if (!fin(nx)) break;
    x = nx;
  }
  return x;
}
function erfInv(p: number) {
  return p > -1 && p < 1 ? erfcInv(1 - p) : p === 1 ? Infinity : p === -1 ? -Infinity : NaN;
} // accurate for |p| not near 1; there use erfcInv
/** the complement 1 − I_x(a, b) = I_{1−x}(b, a) from the same continued fraction (no subtraction where the tail is small) */
function betaQ(a: number, b: number, x: number) {
  if (!(a > 0 && b > 0) || !(x >= 0 && x <= 1)) return NaN;
  if (x === 0) return 1;
  if (x === 1) return 0;
  const bt = exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1 - x));
  return x < (a + 1) / (a + b + 2) ? 1 - (bt * betacf(a, b, x)) / a : (bt * betacf(b, a, 1 - x)) / b;
}
/** survival functions: normSf(z) = 1 − Φ(z), tSf(x, df), chi2Sf(x, k), fSf(x, d1, d2) — each from the tail itself */
function normSf(z: number) {
  return normCdf(-z);
}
function tSf(x: number, df: number) {
  if (!(df > 0) || Number.isNaN(x)) return NaN;
  if (!fin(x)) return x > 0 ? 0 : 1;
  const p = 0.5 * betaI(df / 2, 0.5, df / (df + x * x));
  return x >= 0 ? p : 1 - p;
}
function chi2Sf(x: number, k: number) {
  if (!(k > 0)) return NaN;
  return x <= 0 ? 1 : gammaQ(k / 2, x / 2);
}
function fSf(x: number, d1: number, d2: number) {
  if (!(d1 > 0 && d2 > 0) || Number.isNaN(x)) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  return betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * x));
}
function fCdf(x: number, d1: number, d2: number) {
  if (!(d1 > 0 && d2 > 0) || Number.isNaN(x)) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  return betaQ(d2 / 2, d1 / 2, d2 / (d2 + d1 * x));
}
function normInv(p: number) {
  // Wichura 1988, Applied Statistics 37, algorithm AS 241 (PPND16, about 16 digits)
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const q = p - 0.5;
  if (abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r +
          13731.693765509461125) *
          r +
          1971.5909503065514427) *
          r +
          133.14166789178437745) *
          r +
          3.387132872796366608)) /
      (((((((5226.495278852854561 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r +
        5394.1960214247511077) *
        r +
        687.1870074920579083) *
        r +
        42.313330701600911252) *
        r +
        1)
    );
  }
  let r = q < 0 ? p : 1 - p;
  r = sqrt(-log(r));
  let x;
  if (r <= 5) {
    r -= 1.6;
    x =
      (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r +
        3.64784832476320460504) *
        r +
        5.7694972214606914055) *
        r +
        4.6303378461565452959) *
        r +
        1.42343711074968357734) /
      (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r +
        0.68976733498510000455) *
        r +
        1.6763848301838038494) *
        r +
        2.05319162663775882187) *
        r +
        1);
  } else {
    r -= 5;
    x =
      (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r +
        0.29656057182850489123) *
        r +
        1.7848265399172913358) *
        r +
        5.4637849111641143699) *
        r +
        6.6579046435011037772) /
      (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r +
        0.0148753612908506148525) *
        r +
        0.13692988092273580531) *
        r +
        0.59983220655588793769) *
        r +
        1);
  }
  return q < 0 ? -x : x;
}
/** Student t: the cdf by the incomplete beta, the quantile by bisection + Newton on it (|error| < 1e-12) */
function tCdf(x: number, df: number) {
  if (!(df > 0) || Number.isNaN(x)) return NaN;
  if (!fin(x)) return x > 0 ? 1 : 0;
  const p = 0.5 * betaI(df / 2, 0.5, df / (df + x * x));
  return x >= 0 ? 1 - p : p;
}
function tq(p: number, df: number): number {
  // the p-quantile of Student's t with df degrees of freedom
  if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tq(1 - p, df);
  if (df > 1e7) return normInv(p);
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 200 && tCdf(hi, df) < p; i++) {
    lo = hi;
    hi *= 2;
  }
  let x = (lo + hi) / 2;
  for (let i = 0; i < 200; i++) {
    const c = tCdf(x, df) - p;
    if (c > 0) hi = x;
    else lo = x;
    if (hi - lo < 1e-13 * max(1, x)) break;
    const dens = exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * log(df * PI) - ((df + 1) / 2) * log(1 + (x * x) / df));
    let xn = x - c / dens;
    if (!(xn > lo && xn < hi)) xn = (lo + hi) / 2;
    x = xn;
  }
  return x;
}
/** Brent 1973 ch. 4: a root of g on [a, b] with g(a)·g(b) ≤ 0 (the same code as ode@1's brent) */
function brent(g: (x: number) => number, a: number, b: number, tol: number, fa0?: number | null, fb0?: number | null) {
  let fa = fa0 != null ? fa0 : g(a),
    fb = fb0 != null ? fb0 : g(b);
  if (!(fa * fb <= 0)) return NaN;
  let c = a,
    fc = fa,
    d = b - a,
    e = d;
  for (let it = 0; it < 200; it++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (abs(fc) < abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tl = 2 * EPS * abs(b) + (tol || 1e-15),
      m = (c - b) / 2;
    if (abs(m) <= tl || fb === 0) return b;
    if (abs(e) >= tl && abs(fa) > abs(fb)) {
      let p, q, r;
      const s = fb / fa;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        q = fa / fc;
        r = fb / fc;
        p = s * (2 * m * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < min(3 * m * q - abs(tl * q), abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    a = b;
    fa = fb;
    b += abs(d) > tl ? d : m > 0 ? tl : -tl;
    fb = g(b);
  }
  return b;
}
/** locate(g, ta, tb, ga, gb, {tol, polish}) → the root of g in [ta, tb] (ga, gb of opposite signs): the Illinois variant of
      regula falsi (Dowell & Jarratt 1971; Shampine, Gladwell & Thompson 2003 §2.3.2 for event location), then Brent when asked */
function locate(
  g: (x: number) => number,
  ta: number,
  tb: number,
  ga: number,
  gb: number,
  o?: { readonly tol?: number | undefined; readonly polish?: boolean | undefined } | null,
) {
  const tol = (o && o.tol) || 1e-13;
  if (ga === 0) return ta;
  if (gb === 0) return tb;
  if (!(ga * gb < 0)) return NaN;
  let side = 0,
    tr = tb;
  for (let it = 0; it < 100; it++) {
    tr = (ta * gb - tb * ga) / (gb - ga);
    if (!(tr > ta && tr < tb)) tr = (ta + tb) / 2;
    const gr = g(tr);
    if (gr === 0 || tb - ta <= tol * max(1, abs(tr))) break;
    if (gr < 0 === ga < 0) {
      ta = tr;
      ga = gr;
      if (side === -1) gb /= 2;
      side = -1;
    } else {
      tb = tr;
      gb = gr;
      if (side === 1) ga /= 2;
      side = 1;
    }
  }
  if (o && o.polish && tb > ta) {
    const b = brent(g, ta, tb, tol * max(1, abs(tr)));
    if (fin(b)) return b;
  }
  return tr;
}

/* ======================================================================================================================
     Randomness: MRG32k3a (L'Ecuyer 1999) with streams of length 2^127 and substreams of 2^76 (L'Ecuyer, Simard, Chen & Kelton 2002)
     ====================================================================================================================== */
const M1 = 4294967087,
  M2 = 4294944443,
  A12 = 1403580,
  A13N = 810728,
  A21 = 527612,
  A23N = 1370589,
  NORM = 2.328306549295727688e-10;
// a·b mod m for a, b < 2^32 without overflow: b split in 16-bit halves (every product < 2^49 is exact in a double)
const mulmod = (a: number, b: number, m: number) => {
  const bh = floor(b / 65536),
    bl = b - bh * 65536;
  return (((a * bh) % m) * 65536 + a * bl) % m;
};
function matMul(A: number[][], B: number[][], m: number) {
  const C = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s = (s + mulmod(A[i]![k]!, B[k]![j]!, m)) % m;
      C[i]![j] = s;
    }
  return C;
}
function matVec(A: number[][], v: number[], m: number) {
  const r = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s = (s + mulmod(A[i]![k]!, v[k]!, m)) % m;
    r[i] = s;
  }
  return r;
}
function matPow2(A: number[][], e: number, m: number) {
  let R = A;
  for (let i = 0; i < e; i++) R = matMul(R, R, m);
  return R;
} // A^(2^e)
function matPowN(A: number[][], n: number, m: number) {
  let R = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    B = A;
  while (n > 0) {
    const b = n % 2;
    if (b) R = matMul(R, B, m);
    n = (n - b) / 2;
    if (n > 0) B = matMul(B, B, m);
  }
  return R;
}
// the one-step matrices of the two components (L'Ecuyer 1999, Table II) and their 2^76 / 2^127 powers (computed once, lazily;
// tests/lib_simkit.js checks them against the published A1p76, A2p76, A1p127, A2p127 of RngStreams.c)
const MA1 = [
    [0, 1, 0],
    [0, 0, 1],
    [M1 - A13N, A12, 0],
  ],
  MA2 = [
    [0, 1, 0],
    [0, 0, 1],
    [M2 - A23N, 0, A21],
  ];
let JUMP: { a1p76: number[][]; a2p76: number[][]; a1p127: number[][]; a2p127: number[][] } | null = null;
function jumps() {
  if (!JUMP)
    JUMP = { a1p76: matPow2(MA1, 76, M1), a2p76: matPow2(MA2, 76, M2), a1p127: matPow2(MA1, 127, M1), a2p127: matPow2(MA2, 127, M2) };
  return JUMP;
}
function fnv(s: string, h: number) {
  h = (h ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** subseed(seed, i) → a 32-bit seed derived from (seed, i) (splitmix32-like finaliser) */
function subseed(seed: number, i: number) {
  let h = ((seed >>> 0) ^ Math.imul((i >>> 0) + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
const PKG = [12345, 12345, 12345, 12345, 12345, 12345]; // the package seed of RngStreams
const streamCache = new Map<string, number[]>(),
  subCache = new Map<string, number[]>();
/** the start state of stream k = (seed, name): the package seed jumped by (seed·2^32 + fnv(name))·2^127 — distinct streams for
      every (seed, name) pair, each 2^127 long, split in 2^51 substreams of 2^76 */
function streamState(seed: number, name: string) {
  const key = `${seed >>> 0}|${name}`;
  const c = streamCache.get(key);
  if (c) return c;
  const J = jumps(),
    k1 = seed >>> 0,
    k0 = fnv(name, 0);
  // jump by k1·2^32·2^127 then k0·2^127: (A^(2^127))^(k1·2^32 + k0)
  const B1 = matPowN(J.a1p127, k0, M1),
    B2 = matPowN(J.a2p127, k0, M2);
  const C1 = matMul(matPowN(matPow2(J.a1p127, 32, M1), k1, M1), B1, M1),
    C2 = matMul(matPowN(matPow2(J.a2p127, 32, M2), k1, M2), B2, M2);
  const s = matVec(C1, PKG.slice(0, 3), M1).concat(matVec(C2, PKG.slice(3), M2));
  if (streamCache.size > 4096) streamCache.clear();
  streamCache.set(key, s);
  return s;
}
const P2_32 = 4294967296;
/* ---- a counter-based generator: Philox4x32-10 (Salmon, Moraes, Dror & Shaw 2011, "Parallel random numbers: as easy as 1, 2, 3",
     SC'11; the Random123 library). The output is a pure function of (counter, key): sample i of a stream at any time costs O(1),
     with no state to carry — for noise sources sampled at arbitrary instants and for reproducible parallel draws. The known-answer
     vectors of Random123's kat_vectors are checked by the test ---- */
const mulhi32 = (a: number, b: number) => {
  const a0 = a & 0xffff,
    a1 = a >>> 16,
    b0 = b & 0xffff,
    b1 = b >>> 16,
    lo = a0 * b0,
    m1 = a1 * b0 + (lo >>> 16),
    m2 = a0 * b1 + (m1 & 0xffff);
  return (a1 * b1 + (m1 >>> 16) + (m2 >>> 16)) >>> 0;
};
/** philox(counter [c0..c3], key [k0, k1]) → [4 uint32] */
function philox(ctr: readonly number[], key: readonly number[]) {
  let c0 = ctr[0]! >>> 0,
    c1 = ctr[1]! >>> 0,
    c2 = ctr[2]! >>> 0,
    c3 = ctr[3]! >>> 0,
    k0 = key[0]! >>> 0,
    k1 = key[1]! >>> 0;
  for (let r = 0; r < 10; r++) {
    if (r) {
      k0 = (k0 + 0x9e3779b9) >>> 0;
      k1 = (k1 + 0xbb67ae85) >>> 0;
    }
    const hi0 = mulhi32(0xd2511f53, c0),
      lo0 = Math.imul(0xd2511f53, c0) >>> 0,
      hi1 = mulhi32(0xcd9e8d57, c2),
      lo1 = Math.imul(0xcd9e8d57, c2) >>> 0;
    c0 = (hi1 ^ c1 ^ k0) >>> 0;
    c1 = lo1;
    c2 = (hi0 ^ c3 ^ k1) >>> 0;
    c3 = lo0;
  }
  return [c0, c1, c2, c3];
}
/** counterStream(seed, name, {antithetic}) → {u(i, j = 0) uniform in (0, 1) (53 bits from words 2j, 2j+1 of block i; j ∈ {0, 1}),
      normal(i, j, μ, σ) by inversion, exp(i, j, rate), block(i) → 4 uint32}: key = (seed, fnv(name)), counter = (i mod 2³², ⌊i/2³²⌋, 0, 0) */
function counterStream(seed: number, name: unknown, opts: { readonly antithetic?: boolean | undefined } | null) {
  const key = [seed >>> 0, fnv(textOf(name == null ? '' : name), 0)],
    anti = !!(opts && opts.antithetic);
  const block = (i: number) => philox([i >>> 0, floor(i / 4294967296) >>> 0, 0, 0], key);
  const u = (i: number, j: number) => {
    const b = block(i),
      o = (j | 0) === 1 ? 2 : 0,
      v = ((b[o]! >>> 5) * 67108864 + (b[o + 1]! >>> 6) + 0.5) / 9007199254740992;
    return anti ? 1 - v : v;
  };
  return {
    block,
    u,
    normal: (i: number, j: number, m: number, sd: number | null) => (m || 0) + (sd == null ? 1 : sd) * normInv(u(i, j)),
    exp: (i: number, j: number, rate: number) => -log(u(i, j)) / (rate > 0 ? rate : 1),
    key: key.slice(),
  };
}
/** stream(seed, name, {antithetic, sub}) → r: r() a uniform in (0, 1) (never 0 or 1), and the variates below. r.sub(i) → the i-th
      substream of the same stream (replication i); the same seed and name give the same numbers everywhere */
function stream(
  seed: number,
  name: unknown,
  opts?: {
    readonly antithetic?: boolean | undefined;
    readonly sub?: number | undefined;
    readonly state?: readonly number[] | undefined;
  } | null,
): Stream {
  const anti = !!(opts && opts.antithetic),
    subI = opts && opts.sub! > 0 ? floor(opts.sub!) : 0;
  let s: number[] =
    opts && Array.isArray(opts.state) && opts.state.length === 6
      ? (opts.state as readonly number[]).slice()
      : streamState(seed, name == null ? '' : textOf(name)).slice();
  if (subI) {
    const key = `${seed >>> 0}|${textOf(name)}|${subI}`,
      c = subCache.get(key);
    if (c) s = c.slice();
    else {
      const J = jumps();
      s = matVec(matPowN(J.a1p76, subI, M1), s.slice(0, 3), M1).concat(matVec(matPowN(J.a2p76, subI, M2), s.slice(3), M2));
      if (subCache.size > 4096) subCache.clear();
      subCache.set(key, s.slice());
    }
  }
  let s0 = s[0]!,
    s1 = s[1]!,
    s2 = s[2]!,
    s3 = s[3]!,
    s4 = s[4]!,
    s5 = s[5]!;
  let draws = 0;
  function u01() {
    // L'Ecuyer 1999, Fig. 1 (the floating-point implementation; every product < 2^53)
    let p1 = A12 * s1 - A13N * s0;
    p1 -= floor(p1 / M1) * M1;
    s0 = s1;
    s1 = s2;
    s2 = p1;
    let p2 = A21 * s5 - A23N * s3;
    p2 -= floor(p2 / M2) * M2;
    s3 = s4;
    s4 = s5;
    s5 = p2;
    draws++;
    const u = p1 > p2 ? (p1 - p2) * NORM : (p1 - p2 + M1) * NORM;
    return anti ? 1 - u : u;
  }
  const r = () => u01();
  r.state = () => [s0, s1, s2, s3, s4, s5];
  r.draws = () => draws;
  r.sub = (i: number) => stream(seed, name, { antithetic: anti, sub: i });
  r.anti = () => stream(seed, name, { antithetic: !anti, sub: subI });
  r.u53 = () => {
    const a = u01();
    return (floor(a * P2_32) + u01()) / P2_32;
  }; // two draws when 32 bits are too few
  // ---- variates (Law 2015 ch. 8; Devroye 1986). Inversion: one uniform each, monotone in u (good for CRN and antithetics) ----
  r.int = (n: number) => min(n - 1, floor(u01() * n));
  r.uniform = (a: number, b: number) => a + (b - a) * u01();
  r.exp = (rate: number) => -log(u01()) / rate; // inversion (L §8.3.2)
  r.expMean = (mean: number) => -mean * log(u01());
  r.normal = (mu?: number, sd?: number | null) => (mu || 0) + (sd == null ? 1 : sd) * normInv(u01()); // inversion by AS241
  r.lognormal = (mu: number, sigma: number) => exp(mu + sigma * normInv(u01())); // of the underlying normal (L §6.2.2)
  r.tri = (a: number, c: number, b: number) => {
    const u = u01(),
      F = (c - a) / (b - a);
    return u < F ? a + sqrt(u * (b - a) * (c - a)) : b - sqrt((1 - u) * (b - a) * (b - c));
  }; // L §8.3.15
  r.weibull = (k: number, lam: number) => lam * pow(-log(u01()), 1 / k);
  r.erlang = (k: number, mean: number) => {
    let p = 1;
    for (let i = 0; i < k; i++) p *= u01();
    return (-mean / k) * log(p);
  }; // L §8.3.3 (product of k uniforms)
  // gamma: Marsaglia & Tsang 2000 (ACM TOMS 26:3), α < 1 by Stuart's power trick u^(1/α); rejection (not synchronised)
  r.gamma = (k: number, theta: number): number => {
    if (!(k > 0 && theta > 0)) return NaN;
    if (k < 1) return r.gamma(k + 1, theta) * pow(u01(), 1 / k);
    const d = k - 1 / 3,
      c = 1 / sqrt(9 * d);
    for (let i = 0; i < 1000; i++) {
      const x = normInv(u01()),
        v0 = 1 + c * x;
      if (v0 <= 0) continue;
      const v = v0 * v0 * v0,
        u = u01();
      if (u < 1 - 0.0331 * x * x * x * x || log(u) < 0.5 * x * x + d * (1 - v + log(v))) return d * v * theta;
    }
    return k * theta;
  };
  r.beta = (a: number, b: number) => {
    const x = r.gamma(a, 1),
      y = r.gamma(b, 1);
    return x / (x + y);
  }; // L §8.3.8
  // Poisson and binomial by inversion: a sequential search from 0 (small means), else from the mode with the cdf there exactly
  // (Kemp 1981 / Devroye 1986 §X.3 "inversion from the mode"); at most 4000 steps
  r.poisson = (lam: number) => {
    if (!(lam >= 0)) return NaN;
    if (lam === 0) return 0;
    const u = u01();
    if (lam < 30) {
      let k = 0,
        p = exp(-lam),
        F = p;
      while (u > F && k < 4000) {
        k++;
        p *= lam / k;
        F += p;
      }
      return k;
    }
    const m = floor(lam),
      pm = exp(-lam + m * log(lam) - lgamma(m + 1));
    let F = 1 - gammaP(m + 1, lam); // F(m) = Q(m + 1, λ)
    let k = m,
      p = pm;
    if (u <= F) {
      for (let i = 0; i < 4000 && k > 0; i++) {
        if (u > F - p) return k;
        F -= p;
        p *= k / lam;
        k--;
      }
      return k;
    }
    for (let i = 0; i < 4000; i++) {
      k++;
      p *= lam / k;
      F += p;
      if (u <= F) return k;
    }
    return k;
  };
  r.binomial = (n: number, p: number) => {
    if (!(n >= 0 && p >= 0 && p <= 1)) return NaN;
    if (p === 0 || n === 0) return 0;
    if (p === 1) return n;
    const u = u01(),
      q = 1 - p;
    if (n * p < 30 && n * min(p, q) < 30) {
      let k = 0,
        pk = exp(n * log(q)),
        F = pk;
      const rr = p / q;
      while (u > F && k < n) {
        pk *= (rr * (n - k)) / (k + 1);
        k++;
        F += pk;
      }
      return k;
    }
    const m = floor((n + 1) * p) > n ? n : floor((n + 1) * p);
    const pm = exp(lgamma(n + 1) - lgamma(m + 1) - lgamma(n - m + 1) + m * log(p) + (n - m) * log(q));
    let F = m >= n ? 1 : betaI(n - m, m + 1, q),
      k = m,
      pk = pm; // F(m) = I_q(n − m, m + 1)
    if (u <= F) {
      for (let i = 0; i < 4000 && k > 0; i++) {
        if (u > F - pk) return k;
        F -= pk;
        pk *= ((k / (n - k + 1)) * q) / p;
        k--;
      }
      return k;
    }
    for (let i = 0; i < 4000 && k < n; i++) {
      pk *= (((n - k) / (k + 1)) * p) / q;
      k++;
      F += pk;
      if (u <= F) return k;
    }
    return k;
  };
  /** discrete(probs) → an index by inversion of the cumulative weights (they need not sum to 1) */
  r.discrete = (probs: Nums) => {
    let s = 0;
    for (const p of probs as readonly number[]) s += p > 0 ? p : 0;
    if (!(s > 0)) return -1;
    const u = u01() * s;
    let c = 0;
    for (let i = 0; i < probs.length; i++) {
      c += probs[i]! > 0 ? probs[i]! : 0;
      if (u < c) return i;
    }
    return probs.length - 1;
  };
  /** empirical(values, probs?) → a value: without probs a continuous piecewise-linear cdf through the sorted values (L §6.2.4),
        with probs a discrete draw */
  r.empirical = (values: readonly number[], probs: Nums | null) => {
    if (!values.length) return NaN;
    if (probs) {
      const i = r.discrete(probs);
      return i >= 0 ? values[i]! : NaN;
    }
    const v = values.slice().sort((a, b) => a - b);
    if (v.length === 1) return v[0]!;
    const x = u01() * (v.length - 1),
      i = floor(x);
    return v[i]! + (x - i) * (v[min(i + 1, v.length - 1)]! - v[i]!);
  };
  r.shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      const t = a[i]!;
      a[i] = a[j]!;
      a[j] = t;
    }
    return a;
  }; // Fisher–Yates
  r.pick = <T>(a: readonly T[]) => (a.length ? a[r.int(a.length)]! : undefined);
  return r;
}
/** a distribution object {dist, …} of the engines → {draw(r), mean, var, ok} (moments for the queueing formulas) */
const DISTS = ['const', 'exp', 'uniform', 'tri', 'normal', 'lognormal', 'gamma', 'erlang', 'weibull', 'beta', 'empirical', 'discrete'];
function dist(d: unknown) {
  const bad = { ok: false, mean: NaN, var: NaN, draw: () => NaN, scv: NaN };
  if (!isObj(d)) return bad;
  const g = (k: string) => (typeof d[k] === 'number' ? d[k] : NaN),
    has = (k: string) => fin(d[k]);
  const mk = (draw: (r: Stream) => number, mean: number, vr: number, ok: boolean) => {
    const good = ok && fin(mean) && fin(vr) && vr >= 0;
    return {
      ok: good,
      draw: good ? draw : () => NaN,
      mean: good ? mean : NaN,
      var: good ? vr : NaN,
      scv: good && mean ? vr / (mean * mean) : NaN,
    };
  };
  switch (d.dist) {
    case 'const': {
      const v = has('value') ? g('value') : g('mean');
      return mk(() => v, v, 0, v >= 0);
    }
    case 'exp': {
      const m = has('mean') ? g('mean') : 1 / g('rate');
      return mk(r => r.expMean(m), m, m * m, m > 0);
    }
    case 'uniform': {
      const a = g('min'),
        b = g('max');
      return mk(r => r.uniform(a, b), (a + b) / 2, ((b - a) * (b - a)) / 12, a >= 0 && b >= a);
    }
    case 'tri': {
      const a = g('min'),
        c = g('mode'),
        b = g('max');
      return mk(
        r => r.tri(a, c, b),
        (a + b + c) / 3,
        (a * a + b * b + c * c - a * b - a * c - b * c) / 18,
        a >= 0 && a <= c && c <= b && b > a,
      );
    }
    case 'normal': {
      // unclipped; a duration takes truncated(d, 0) (exact, by inversion) or clips itself and says so
      const m = g('mean'),
        sd = g('sd');
      return mk(r => r.normal(m, sd), m, sd * sd, fin(m) && sd >= 0);
    }
    case 'lognormal': {
      // by its own mean and sd (L §6.2.2: σ² = ln(1 + sd²/m²), μ = ln m − σ²/2)
      const m = g('mean'),
        sd = g('sd'),
        s2 = log(1 + (sd * sd) / (m * m)),
        mu = log(m) - s2 / 2,
        s = sqrt(s2);
      return mk(r => r.lognormal(mu, s), m, sd * sd, m > 0 && sd >= 0);
    }
    case 'gamma': {
      // shape k and scale θ, or mean and cv
      const k = has('shape') ? g('shape') : 1 / (g('cv') * g('cv')),
        th = has('scale') ? g('scale') : g('mean') / k;
      return mk(r => r.gamma(k, th), k * th, k * th * th, k > 0 && th > 0);
    }
    case 'erlang': {
      const k = g('k'),
        m = g('mean');
      return mk(r => r.erlang(k, m), m, (m * m) / k, Number.isInteger(k) && k >= 1 && k <= 64 && m > 0);
    }
    case 'weibull': {
      const k = g('shape'),
        l = g('scale'),
        g1 = exp(lgamma(1 + 1 / k)),
        g2 = exp(lgamma(1 + 2 / k));
      return mk(r => r.weibull(k, l), l * g1, l * l * (g2 - g1 * g1), k > 0 && l > 0);
    }
    case 'beta': {
      const a = g('a'),
        b = g('b'),
        lo = has('min') ? g('min') : 0,
        hi = has('max') ? g('max') : 1,
        w = hi - lo;
      return mk(
        r => lo + w * r.beta(a, b),
        lo + (w * a) / (a + b),
        (w * w * a * b) / ((a + b) * (a + b) * (a + b + 1)),
        a > 0 && b > 0 && lo >= 0 && hi > lo,
      );
    }
    case 'empirical':
    case 'discrete': {
      const vs = Array.isArray(d.values) ? (d.values as unknown[]).filter((v): v is number => typeof v === 'number') : [];
      const ps = Array.isArray(d.probs) ? (d.probs as number[]) : null;
      if (!vs.length || vs.some(v => !(v >= 0)) || (ps && (ps.length !== vs.length || ps.some(p => !(p >= 0))))) return bad;
      if (d.dist === 'discrete' || ps) {
        const w = ps || vs.map(() => 1),
          s = w.reduce((a, b) => a + b, 0);
        if (!(s > 0)) return bad;
        const m = vs.reduce((a, v, i) => a + (v * w[i]!) / s, 0),
          m2 = vs.reduce((a, v, i) => a + (v * v * w[i]!) / s, 0);
        return mk(r => vs[r.discrete(w)]!, m, max(0, m2 - m * m), true);
      }
      const v = vs.slice().sort((a, b) => a - b),
        n = v.length;
      if (n === 1) return mk(() => v[0]!, v[0]!, 0, true);
      let m = 0,
        m2 = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = v[i]!,
          b = v[i + 1]!;
        m += (a + b) / 2;
        m2 += (a * a + a * b + b * b) / 3;
      }
      m /= n - 1;
      m2 /= n - 1;
      return mk(r => r.empirical(v), m, max(0, m2 - m * m), true);
    }
    default:
      return bad;
  }
}

/* ======================================================================================================================
     The event calendar: a binary heap ordered by (time, priority, insertion order). A smaller priority number comes first at
     the same time; equal priorities come in the order they were scheduled (FIFO) — the deterministic tie rule of L §1.3 / BCNN §3.1.
     Cancellation is lazy (the entry stays in the heap, marked) so it costs O(1).
     ====================================================================================================================== */
function calendar() {
  const h: CalEntry[] = [];
  let seq = 0,
    live = 0;
  const dead = new Set<number>(),
    pending = new Set<number>();
  const less = (a: CalEntry, b: CalEntry) => a.t < b.t || (a.t === b.t && (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)));
  function up(i: number) {
    const x = h[i]!;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(x, h[p]!)) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = x;
  }
  function down(i: number) {
    const n = h.length,
      x = h[i]!;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && less(h[c + 1]!, h[c]!)) c++;
      if (!less(h[c]!, x)) break;
      h[i] = h[c]!;
      i = c;
    }
    h[i] = x;
  }
  function popRaw() {
    const top = h[0]!,
      last = h.pop()!;
    if (h.length) {
      h[0] = last;
      down(0);
    }
    return top;
  }
  function clean() {
    while (h.length && dead.has(h[0]!.seq)) {
      dead.delete(h[0]!.seq);
      popRaw();
    }
  }
  return {
    schedule(t: number, kind: unknown, data: unknown, prio: number) {
      if (!(typeof t === 'number') || Number.isNaN(t)) return -1;
      const e: CalEntry = { t, prio: prio || 0, seq: seq++, kind, data };
      e.id = e.seq;
      h.push(e);
      up(h.length - 1);
      live++;
      pending.add(e.id);
      return e.id;
    },
    cancel(id: number) {
      if (!pending.has(id)) return false;
      pending.delete(id);
      dead.add(id);
      live--;
      return true;
    },
    peek() {
      clean();
      return h.length ? h[0]!.t : Infinity;
    },
    peekEntry() {
      clean();
      return h.length ? h[0]! : null;
    },
    pop() {
      clean();
      if (!h.length) return null;
      live--;
      const e = popRaw();
      pending.delete(e.seq);
      return e;
    },
    get size() {
      return live;
    },
    clear() {
      h.length = 0;
      dead.clear();
      pending.clear();
      live = 0;
    },
  };
}
/* ======================================================================================================================
     The executive: next-event time advance (L §1.3.1, BCNN §3.1) with the three-phase rule of Tocher 1963 / Pidd 2004: at each
     instant the B (bound, scheduled) events run in calendar order, then the C (conditional) events are tried until none fires.
     sim({tEnd, maxEvents, zeno, logCap, eps}) → S:
       S.now · S.at(t, fn, {prio, kind, data}) / S.after(dt, fn, opts) → id · S.cancel(id) · S.when(cond, fn, {prio, once}) → id ·
       S.run(until?) → {t, events, stop: horizon | empty | stopped | budget | zeno} · S.stop(code?) · S.log(kind, data) ·
       S.activity(dur, onDone, opts) → an interruptible activity · S.codes · S.events (count)
     A scheduled time before now is an error (code 'past', the event runs now); a NaN time is refused (code 'nan-time').
     ====================================================================================================================== */
function sim(o: SimOpts | null) {
  o = o || {};
  const tEnd = fin(o.tEnd) ? o.tEnd : Infinity,
    maxEv = fin(o.maxEvents) ? min(o.maxEvents, MAX_EVENTS * 5) : MAX_EVENTS;
  const zenoMax = fin(o.zeno) ? o.zeno : 10000,
    logCap = fin(o.logCap) ? min(o.logCap, MAX_LOG) : 500,
    eps = o.eps || 1e-12;
  const heap: SimEntry[] = [],
    cancelled = new Set<number>();
  let seq = 0,
    live = 0;

  const less = (a: SimEntry, b: SimEntry) => a.t < b.t || (a.t === b.t && (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)));
  function up(i: number) {
    const x = heap[i]!;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(x, heap[p]!)) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = x;
  }
  function down(i: number) {
    const n = heap.length,
      x = heap[i]!;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && less(heap[c + 1]!, heap[c]!)) c++;
      if (!less(heap[c]!, x)) break;
      heap[i] = heap[c]!;
      i = c;
    }
    heap[i] = x;
  }
  function pop() {
    for (;;) {
      if (!heap.length) return null;
      const top = heap[0]!,
        last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        down(0);
      }
      if (cancelled.has(top.seq)) {
        cancelled.delete(top.seq);
        continue;
      }
      live--;
      return top;
    }
  }
  function peekT() {
    while (heap.length && cancelled.has(heap[0]!.seq)) {
      cancelled.delete(heap[0]!.seq);
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        down(0);
      }
    }
    return heap.length ? heap[0]!.t : Infinity;
  }
  const conds: { cond: (now: number) => boolean; fn: (now: number) => void; prio: number; once: boolean; seq: number; on: boolean }[] = [];
  const C = codes(['budget', 'zeno']);
  const log: Rec[] = [];
  let logged = 0;
  let now = fin(o.t0) ? o.t0 : 0,
    events = 0,
    stopped = null as string | null,
    instT = NaN,
    instN = 0;
  const S = {
    get now() {
      return now;
    },
    get events() {
      return events;
    },
    get pending() {
      return live;
    },
    codes: C,
    eventLog: log,
    tEnd,
    at(t: number, fn: (e: SimEntry) => void, op?: SimOp | null) {
      if (typeof t !== 'number' || Number.isNaN(t)) {
        C.code('nan-time', now);
        return -1;
      }
      if (t < now - eps * max(1, abs(now))) {
        C.code('past', now);
        t = now;
      }
      const e: SimEntry = { t, prio: (op && op.prio) || 0, seq: seq++, fn, kind: op && op.kind, data: op && op.data };
      heap.push(e);
      up(heap.length - 1);
      live++;
      return e.seq;
    },
    after(dt: number, fn: (e: SimEntry) => void, op?: SimOp | null) {
      return S.at(now + dt, fn, op);
    },
    cancel(id: number) {
      if (!(id >= 0) || id >= seq || cancelled.has(id)) return false;
      cancelled.add(id);
      live--;
      return true;
    },
    when(
      cond: (now: number) => boolean,
      fn: (now: number) => void,
      op?: { readonly prio?: number | undefined; readonly once?: boolean | undefined } | null,
    ) {
      const c = { cond, fn, prio: (op && op.prio) || 0, once: !!(op && op.once), seq: seq++, on: true };
      conds.push(c);
      conds.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      return c.seq;
    },
    unwhen(id: number) {
      const c = conds.find(x => x.seq === id);
      if (c) c.on = false;
      return !!c;
    },
    stop(code: string) {
      stopped = code || 'stopped';
    },
    log(kind: unknown, data: Rec | null) {
      logged++;
      if (log.length < logCap) log.push({ t: now, kind, ...(data || {}) });
    },
    get logged() {
      return logged;
    },
    peek: () => peekT(),
    /** an interruptible activity (a service, a repair, a treatment): {end, remaining(), interrupt(), resume(policy, newDur?), cancel(), done}
          policies (L §2.7 / BCNN ch. 6, pre-emption): resume (the remaining time), restart (the whole first duration again, "repeat
          identical"), resample (a new duration given by the caller, "repeat different") */
    activity(dur: number, onDone: (a: Activity) => void, op?: SimOp | null) {
      const A = { dur, start: now, end: now + dur, id: -1, done: false, paused: false, left: dur, interrupts: 0 } as Activity;
      const fire = () => {
        A.done = true;
        A.id = -1;
        onDone(A);
      };
      A.id = S.at(A.end, fire, op);
      A.remaining = () => (A.paused ? A.left : max(0, A.end - now));
      A.interrupt = () => {
        if (A.done || A.paused) return A.remaining();
        S.cancel(A.id);
        A.left = max(0, A.end - now);
        A.paused = true;
        A.interrupts++;
        A.id = -1;
        return A.left;
      };
      A.resume = (policy: string, newDur?: number) => {
        if (A.done || !A.paused) return;
        A.paused = false;
        const d = policy === 'restart' ? A.dur : policy === 'resample' ? (fin(newDur) ? newDur : A.dur) : A.left;
        A.start = now;
        A.end = now + d;
        A.id = S.at(A.end, fire, op);
      };
      A.cancel = () => {
        if (A.id >= 0) S.cancel(A.id);
        A.done = true;
        A.id = -1;
      };
      return A;
    },
    /** run(until): next-event time advance to min(until, tEnd); the clock stops at the horizon (events after it stay) */
    run(until: number) {
      const T = min(fin(until) ? until : Infinity, tEnd);
      stopped = null as string | null;
      for (;;) {
        const tn = peekT();
        if (tn === Infinity) {
          if (fin(T)) now = max(now, T);
          return { t: now, events, stop: 'empty' };
        }
        if (tn > T) {
          now = T;
          return { t: now, events, stop: 'horizon' };
        }
        if (events >= maxEv) {
          C.code('budget', now);
          return { t: now, events, stop: 'budget' };
        }
        const e = pop()!;
        now = e.t;
        events++;
        if (now === instT || abs(now - instT) <= eps * max(1, abs(now))) {
          if (++instN > zenoMax) {
            C.code('zeno', now);
            return { t: now, events, stop: 'zeno' };
          }
        } else {
          instT = now;
          instN = 1;
        }
        e.fn(e);
        if (stopped) return { t: now, events, stop: stopped };
        // the C phase once the instant is over (no more B events at this time)
        if (conds.length && !(peekT() <= now + eps * max(1, abs(now)))) {
          for (let pass = 0; pass < 1000; pass++) {
            let fired = false;
            for (const c of conds)
              if (c.on && c.cond(now)) {
                c.fn(now);
                events++;
                fired = true;
                if (c.once) c.on = false;
                if (stopped) return { t: now, events, stop: stopped };
              }
            if (!fired) break;
            if (pass === 999 || ++instN > zenoMax) {
              C.code('zeno', now);
              return { t: now, events, stop: 'zeno' };
            }
          }
        }
      }
    },
  };
  return S;
}

/* ======================================================================================================================
     Continuous time: integrate(cfg) — DOPRI5 (HNW §II.4–II.5, Dormand & Prince 1980 with Hairer's dense output contd5 and the PI
     controller of §IV.2), or fixed steps (RK4, Heun, Euler) with cubic Hermite dense output. State events g(t, y) are watched on each
     step: a sign change in the event's direction is bracketed and located by the Illinois method on the dense output (Shampine et
     al. 2003); with `hyst` > 0 an event re-arms only after |g| has exceeded hyst on the other side (no chattering).
     cfg = {f(t, y, dy), y0, t0, tEnd, method, rtol, atol, dt, hmax, maxSteps, samples: [t…], onSample(t, y),
            events: [{g(t, y), dir (−1, 0, +1), hyst, onEvent(t, y) → 'stop' | 'continue' | undefined (y may be changed in place)}],
            maxEvents (Zeno guard, 1000)}
     → {t, y, steps, rejected, nfev, events: [{t, j}], stop: 'end' | 'event' | codes…, codes}
     ====================================================================================================================== */
const DP = {
  a21: 1 / 5,
  a31: 3 / 40,
  a32: 9 / 40,
  a41: 44 / 45,
  a42: -56 / 15,
  a43: 32 / 9,
  a51: 19372 / 6561,
  a52: -25360 / 2187,
  a53: 64448 / 6561,
  a54: -212 / 729,
  a61: 9017 / 3168,
  a62: -355 / 33,
  a63: 46732 / 5247,
  a64: 49 / 176,
  a65: -5103 / 18656,
  a71: 35 / 384,
  a73: 500 / 1113,
  a74: 125 / 192,
  a75: -2187 / 6784,
  a76: 11 / 84,
  e1: 71 / 57600,
  e3: -71 / 16695,
  e4: 71 / 1920,
  e5: -17253 / 339200,
  e6: 22 / 525,
  e7: -1 / 40,
  d1: -12715105075 / 11282082432,
  d3: 87487479700 / 32700410799,
  d4: -10690763975 / 1880347072,
  d5: 701980252875 / 199316789632,
  d6: -1453857185 / 822651844,
  d7: 69997945 / 29380423,
};
function dopri(n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const k1 = new Float64Array(n),
    k2 = new Float64Array(n),
    k3 = new Float64Array(n),
    k4 = new Float64Array(n),
    k5 = new Float64Array(n),
    k6 = new Float64Array(n),
    k7 = new Float64Array(n);
  const y = new Float64Array(n),
    y1 = new Float64Array(n),
    yt = new Float64Array(n),
    ys = new Float64Array(n);
  const { rtol, atol, hmax } = o;
  let t = 0,
    h = 0,
    facold = 1e-4,
    iasti = 0,
    nonsti = 0,
    stiff = false; // atol: one per component
  const sk = (i: number, a: number, b: number) => atol[i]! + rtol * max(abs(a), abs(b));
  function hinit() {
    let dnf = 0,
      dny = 0;
    for (let i = 0; i < n; i++) {
      const s = sk(i, y[i]!, 0);
      dnf += (k1[i]! / s) ** 2;
      dny += (y[i]! / s) ** 2;
    }
    let hh = dnf <= 1e-10 || dny <= 1e-10 ? 1e-6 : sqrt(dny / dnf) * 0.01;
    hh = min(hh, hmax);
    for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * k1[i]!;
    f(t + hh, yt, k2);
    st.nfev++;
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += ((k2[i]! - k1[i]!) / sk(i, y[i]!, 0)) ** 2;
    d2 = sqrt(d2) / hh;
    const d12 = max(abs(d2), sqrt(dnf)),
      h1 = d12 <= 1e-15 ? max(1e-6, abs(hh) * 1e-3) : pow(0.01 / d12, 0.2);
    const r = min(100 * abs(hh), h1, hmax);
    return r > 0 ? r : hmax * 1e-3;
  }
  return {
    get stiff() {
      return stiff;
    },
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, k1);
      st.nfev++;
      if (!(h > 0)) h = hinit();
      facold = 1e-4;
    },
    step(tT: number) {
      if (!k1.every(fin)) return { fail: 'nan' }; // f is NaN at the start of the step: no step size can help
      for (let tries = 0; ; tries++) {
        const span = tT - t;
        if (!(span > 0)) return { fail: 'time' };
        let hh = min(h, hmax),
          last = false;
        if (hh >= span * (1 - 1e-12)) {
          hh = span;
          last = true;
        }
        if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * DP.a21 * k1[i]!;
        f(t + 0.2 * hh, yt, k2);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * (DP.a31 * k1[i]! + DP.a32 * k2[i]!);
        f(t + 0.3 * hh, yt, k3);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * (DP.a41 * k1[i]! + DP.a42 * k2[i]! + DP.a43 * k3[i]!);
        f(t + 0.8 * hh, yt, k4);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * (DP.a51 * k1[i]! + DP.a52 * k2[i]! + DP.a53 * k3[i]! + DP.a54 * k4[i]!);
        f(t + (8 / 9) * hh, yt, k5);
        for (let i = 0; i < n; i++)
          ys[i] = y[i]! + hh * (DP.a61 * k1[i]! + DP.a62 * k2[i]! + DP.a63 * k3[i]! + DP.a64 * k4[i]! + DP.a65 * k5[i]!);
        const tph = last ? tT : t + hh;
        f(tph, ys, k6);
        for (let i = 0; i < n; i++)
          y1[i] = y[i]! + hh * (DP.a71 * k1[i]! + DP.a73 * k3[i]! + DP.a74 * k4[i]! + DP.a75 * k5[i]! + DP.a76 * k6[i]!);
        f(tph, y1, k7);
        st.nfev += 6;
        let err = 0;
        for (let i = 0; i < n; i++) {
          const e = hh * (DP.e1 * k1[i]! + DP.e3 * k3[i]! + DP.e4 * k4[i]! + DP.e5 * k5[i]! + DP.e6 * k6[i]! + DP.e7 * k7[i]!);
          err += (e / sk(i, y[i]!, y1[i]!)) ** 2;
        }
        err = sqrt(err / n);
        if (!fin(err)) {
          st.rejected++;
          h = hh / 10;
          if (!(h > 1e-300)) return { fail: 'nan' };
          continue;
        }
        const fac11 = pow(err, 0.2 - 0.04 * 0.75);
        if (err <= 1) {
          let fac = fac11 / pow(facold, 0.04);
          fac = max(0.1, min(5, fac / 0.9));
          const hnew = hh / fac;
          facold = max(err, 1e-4);
          // the stiffness test of DOPRI5 (HNW §IV.2): h·ρ ≈ h·‖k7 − k6‖/‖y1 − ys‖ > 3.25 on 15 accepted steps
          let sn = 0,
            sd = 0;
          for (let i = 0; i < n; i++) {
            sn += (k7[i]! - k6[i]!) ** 2;
            sd += (y1[i]! - ys[i]!) ** 2;
          }
          if (sd > 0) {
            if (hh * sqrt(sn / sd) > 3.25) {
              nonsti = 0;
              iasti++;
              if (iasti >= 15) stiff = true;
            } else {
              nonsti++;
              if (nonsti === 6) iasti = 0;
            }
          }
          const r1 = Float64Array.from(y),
            r2 = new Float64Array(n),
            r3 = new Float64Array(n),
            r4 = new Float64Array(n),
            r5 = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            const dy = y1[i]! - y[i]!,
              bs = hh * k1[i]! - dy;
            r2[i] = dy;
            r3[i] = bs;
            r4[i] = dy - hh * k7[i]! - bs;
            r5[i] = hh * (DP.d1 * k1[i]! + DP.d3 * k3[i]! + DP.d4 * k4[i]! + DP.d5 * k5[i]! + DP.d6 * k6[i]! + DP.d7 * k7[i]!);
          }
          const ta = t,
            hs = hh;
          const seg = (tq: number, out: Float64Array) => {
            const th = (tq - ta) / hs,
              th1 = 1 - th;
            for (let i = 0; i < n; i++) out[i] = r1[i]! + th * (r2[i]! + th1 * (r3[i]! + th * (r4[i]! + th1 * r5[i]!)));
          };
          t = tph;
          y.set(y1);
          k1.set(k7);
          h = last ? max(h, hnew) : hnew;
          return { t0: ta, t1: tph, y1: y, seg };
        }
        st.rejected++;
        h = hh / min(10, fac11 / 0.9);
      }
    },
  };
}
function fixed(method: string, n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const y = new Float64Array(n),
    y1 = new Float64Array(n),
    f0 = new Float64Array(n),
    f1 = new Float64Array(n),
    a = new Float64Array(n),
    b = new Float64Array(n),
    c = new Float64Array(n),
    yt = new Float64Array(n);
  let t = 0;
  const dt = o.dt!;
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, f0);
      st.nfev++;
    },
    step(tT: number) {
      const span = tT - t;
      if (!(span > 0)) return { fail: 'time' };
      const hh = min(dt, span),
        tph = hh === span ? tT : t + hh;
      if (method === 'euler') for (let i = 0; i < n; i++) y1[i] = y[i]! + hh * f0[i]!;
      else if (method === 'midpoint') {
        for (let i = 0; i < n; i++) yt[i] = y[i]! + 0.5 * hh * f0[i]!;
        f(t + 0.5 * hh, yt, a);
        st.nfev++;
        for (let i = 0; i < n; i++) y1[i] = y[i]! + hh * a[i]!;
      } // the explicit midpoint rule (HNW §II.1, order 2)
      else if (method === 'heun') {
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * f0[i]!;
        f(tph, yt, a);
        st.nfev++;
        for (let i = 0; i < n; i++) y1[i] = y[i]! + 0.5 * hh * (f0[i]! + a[i]!);
      } else {
        // the classical RK4 (HNW §II.1)
        for (let i = 0; i < n; i++) yt[i] = y[i]! + 0.5 * hh * f0[i]!;
        f(t + 0.5 * hh, yt, a);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + 0.5 * hh * a[i]!;
        f(t + 0.5 * hh, yt, b);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * b[i]!;
        f(tph, yt, c);
        st.nfev += 3;
        for (let i = 0; i < n; i++) y1[i] = y[i]! + (hh / 6) * (f0[i]! + 2 * a[i]! + 2 * b[i]! + c[i]!);
      }
      f(tph, y1, f1);
      st.nfev++;
      const r0 = Float64Array.from(y),
        r1 = Float64Array.from(y1),
        d0 = Float64Array.from(f0),
        d1 = Float64Array.from(f1),
        ta = t,
        hs = hh;
      const seg = (tq: number, out: Float64Array) => {
        const s = (tq - ta) / hs,
          s2 = s * s,
          s3 = s2 * s,
          h00 = 2 * s3 - 3 * s2 + 1,
          h10 = s3 - 2 * s2 + s,
          h01 = -2 * s3 + 3 * s2,
          h11 = s3 - s2;
        for (let i = 0; i < n; i++) out[i] = h00 * r0[i]! + h10 * hs * d0[i]! + h01 * r1[i]! + h11 * hs * d1[i]!;
      };
      t = tph;
      y.set(y1);
      f0.set(f1);
      return { t0: ta, t1: tph, y1: y, seg };
    },
  };
}

// Rosenbrock 2(3) of Shampine & Reichelt 1997 (SIAM J. Sci. Comput. 18:1; MATLAB ode23s): L-stable, W = I − h·d·J, d = 1/(2 + √2),
// a forward-difference Jacobian and the ntrp23s dense output (the same method as ode@1's stepperRos)
function luFactor(A: Float64Array, n: number, piv: Int32Array) {
  for (let k = 0; k < n; k++) {
    let p = k,
      mx = abs(A[k * n + k]!);
    for (let i = k + 1; i < n; i++)
      if (abs(A[i * n + k]!) > mx) {
        mx = abs(A[i * n + k]!);
        p = i;
      }
    if (!(mx > 1e-300)) return false;
    piv[k] = p;
    if (p !== k)
      for (let j = 0; j < n; j++) {
        const tt = A[k * n + j]!;
        A[k * n + j] = A[p * n + j]!;
        A[p * n + j] = tt;
      }
    for (let i = k + 1; i < n; i++) {
      const l = (A[i * n + k]! /= A[k * n + k]!);
      for (let j = k + 1; j < n; j++) A[i * n + j]! -= l * A[k * n + j]!;
    }
  }
  return true;
}
function luSolve(A: Float64Array, n: number, piv: Int32Array, b: Float64Array) {
  for (let k = 0; k < n; k++) {
    const p = piv[k]!;
    if (p !== k) {
      const tt = b[k]!;
      b[k] = b[p]!;
      b[p] = tt;
    }
  }
  for (let i = 1; i < n; i++) {
    let s = b[i]!;
    for (let j = 0; j < i; j++) s -= A[i * n + j]! * b[j]!;
    b[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < n; j++) s -= A[i * n + j]! * b[j]!;
    b[i] = s / A[i * n + i]!;
  }
}
function rosenbrock(n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const d = 1 / (2 + Math.SQRT2),
    e32 = 6 + Math.SQRT2;
  const F0 = new Float64Array(n),
    F1 = new Float64Array(n),
    F2 = new Float64Array(n),
    k1 = new Float64Array(n),
    k2 = new Float64Array(n),
    k3 = new Float64Array(n);
  const y = new Float64Array(n),
    y1 = new Float64Array(n),
    yt = new Float64Array(n),
    J = new Float64Array(n * n),
    W = new Float64Array(n * n),
    Tt = new Float64Array(n),
    fx = new Float64Array(n);
  const piv = new Int32Array(n);
  const { rtol, atol, hmax } = o;
  let t = 0,
    h = 0;
  function jac() {
    for (let j = 0; j < n; j++) {
      const yj = y[j]!,
        del = 1.4901161193847656e-8 * max(abs(yj), (atol[j]! / rtol) * 1e-3, 1e-12);
      y[j] = yj + del;
      f(t, y, fx);
      y[j] = yj;
      for (let i = 0; i < n; i++) J[i * n + j] = (fx[i]! - F0[i]!) / del;
    }
    const dt = 1.4901161193847656e-8 * max(abs(t), 1);
    f(t + dt, y, fx);
    for (let i = 0; i < n; i++) Tt[i] = (fx[i]! - F0[i]!) / dt;
    st.nfev += n + 1;
  }
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, F0);
      st.nfev++;
      if (!(h > 0)) {
        let s = 0;
        for (let i = 0; i < n; i++) s += (F0[i]! / (atol[i]! + rtol * abs(y[i]!))) ** 2;
        s = sqrt(s / n);
        h = min(hmax, s > 0 ? (0.8 * pow(rtol, 1 / 3)) / s : hmax / 100);
        if (!(h > 0)) h = hmax * 1e-3;
      }
      jac();
    },
    step(tT: number) {
      if (!F0.every(fin)) return { fail: 'nan' };
      for (let tries = 0; ; tries++) {
        const span = tT - t;
        if (!(span > 0)) return { fail: 'time' };
        let hh = min(h, hmax),
          last = false;
        if (hh >= span * (1 - 1e-12)) {
          hh = span;
          last = true;
        }
        if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
        for (let i = 0; i < n * n; i++) W[i] = -hh * d * J[i]!;
        for (let i = 0; i < n; i++) W[i * n + i]! += 1;
        if (!luFactor(W, n, piv)) {
          st.rejected++;
          h = hh / 4;
          continue;
        }
        for (let i = 0; i < n; i++) k1[i] = F0[i]! + hh * d * Tt[i]!;
        luSolve(W, n, piv, k1);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + 0.5 * hh * k1[i]!;
        f(t + 0.5 * hh, yt, F1);
        for (let i = 0; i < n; i++) k2[i] = F1[i]! - k1[i]!;
        luSolve(W, n, piv, k2);
        for (let i = 0; i < n; i++) k2[i]! += k1[i]!;
        const tph = last ? tT : t + hh;
        for (let i = 0; i < n; i++) y1[i] = y[i]! + hh * k2[i]!;
        f(tph, y1, F2);
        st.nfev += 2;
        for (let i = 0; i < n; i++) k3[i] = F2[i]! - e32 * (k2[i]! - F1[i]!) - 2 * (k1[i]! - F0[i]!) + hh * d * Tt[i]!;
        luSolve(W, n, piv, k3);
        let err = 0;
        for (let i = 0; i < n; i++) {
          const e = (hh / 6) * (k1[i]! - 2 * k2[i]! + k3[i]!);
          err += (e / (atol[i]! + rtol * max(abs(y[i]!), abs(y1[i]!)))) ** 2;
        }
        err = sqrt(err / n);
        if (!fin(err)) {
          st.rejected++;
          h = hh / 10;
          continue;
        }
        if (err <= 1) {
          const hnew = hh * min(5, max(0.2, 0.8 * pow(max(err, 1e-10), -1 / 3)));
          const r0 = Float64Array.from(y),
            c1 = Float64Array.from(k1),
            c2 = Float64Array.from(k2),
            ta = t,
            hs = hh,
            q = 1 - 2 * d;
          const seg = (tq: number, out: Float64Array) => {
            const s2 = (tq - ta) / hs;
            for (let i = 0; i < n; i++) out[i] = r0[i]! + hs * (((s2 * (1 - s2)) / q) * c1[i]! + ((s2 * (s2 - 2 * d)) / q) * c2[i]!);
          };
          t = tph;
          y.set(y1);
          F0.set(F2);
          h = last ? max(h, hnew) : hnew;
          jac();
          return { t0: ta, t1: tph, y1: y, seg };
        }
        st.rejected++;
        h = hh * max(0.2, 0.8 * pow(err, -1 / 3));
      }
    },
  };
}
/* ---- shared by the implicit methods: a forward-difference Jacobian J = ∂f/∂y and ∂f/∂t at (t, y), given F0 = f(t, y) ---- */
function fdJac(
  n: number,
  f: Rhs,
  t: number,
  y: Float64Array,
  F0: Float64Array,
  J: Float64Array,
  Tt: Float64Array | null,
  atol: Float64Array,
  rtol: number,
  st: Stats,
  fx: Float64Array,
) {
  for (let j = 0; j < n; j++) {
    const yj = y[j]!,
      del = 1.4901161193847656e-8 * max(abs(yj), (atol[j]! / rtol) * 1e-3, 1e-12);
    y[j] = yj + del;
    f(t, y, fx);
    y[j] = yj;
    for (let i = 0; i < n; i++) J[i * n + j] = (fx[i]! - F0[i]!) / del;
  }
  st.nfev += n;
  if (Tt) {
    const dt = 1.4901161193847656e-8 * max(abs(t), 1);
    f(t + dt, y, fx);
    for (let i = 0; i < n; i++) Tt[i] = (fx[i]! - F0[i]!) / dt;
    st.nfev++;
  }
}
const hermite =
  (n: number, ta: number, hs: number, r0: Float64Array, d0: Float64Array, r1: Float64Array, d1: Float64Array) =>
  (tq: number, out: Float64Array) => {
    const s = (tq - ta) / hs,
      s2 = s * s,
      s3 = s2 * s,
      h00 = 2 * s3 - 3 * s2 + 1,
      h10 = s3 - 2 * s2 + s,
      h01 = -2 * s3 + 3 * s2,
      h11 = s3 - s2;
    for (let i = 0; i < n; i++) out[i] = h00 * r0[i]! + h10 * hs * d0[i]! + h01 * r1[i]! + h11 * hs * d1[i]!;
  };
const firstH = (n: number, F0: Float64Array, y: Float64Array, atol: Float64Array, rtol: number, hmax: number, p: number) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += (F0[i]! / (atol[i]! + rtol * abs(y[i]!))) ** 2;
  s = sqrt(s / n);
  const h = min(hmax, s > 0 ? (0.5 * pow(rtol, 1 / p)) / s : hmax / 100);
  return h > 0 ? h : hmax * 1e-3;
};

/* Tsitouras 5(4) (Ch. Tsitouras 2011, Comput. Math. Appl. 62:2, "Runge–Kutta pairs of order 5(4) satisfying only the first
     column simplifying assumption"): FSAL, 7 stages, error constants smaller than DOPRI5's; the PI controller of dopri; Tsitouras's
     own continuous extension of order 4, y(t + θh) = y + h Σ b_i(θ) k_i with b_i(θ) quartic in θ (the coefficients of the paper's
     §3 as in OrdinaryDiffEq.jl's Tsit5; all eight order-4 conditions hold for every θ — the test checks them, and the dense
     output's local error O(h⁵)) */
const TS = {
  c: [0, 0.161, 0.327, 0.9, 0.9800255409045097, 1, 1],
  a: [
    [],
    [0.161],
    [-0.008480655492356989, 0.335480655492357],
    [2.897153057105493, -6.359448489975075, 4.3622954328695815],
    [5.325864828439257, -11.748883564062828, 7.4955393428898365, -0.09249506636175525],
    [5.86145544294642, -12.92096931784711, 8.159367898576159, -0.071584973281401, -0.028269050394068383],
    [0.09646076681806523, 0.01, 0.4798896504144996, 1.379008574103742, -3.290069515436081, 2.324710524099774],
  ],
  r: [
    [1, -2.763706197274826, 2.9132554618219126, -1.0530884977290216],
    [0, 0.13169999999999998, -0.2234, 0.1017],
    [0, 3.9302962368947516, -5.941033872131505, 2.490627285651253],
    [0, -12.411077166933676, 30.33818863028232, -16.548102889244902],
    [0, 37.50931341651104, -88.1789048947664, 47.37952196281928],
    [0, -27.896526289197286, 65.09189467479366, -34.87065786149661],
    [0, 1.5, -4, 2.5],
  ],
  e: [
    -0.00178001105222577714, -0.0008164344596567469, 0.007880878010261995, -0.1447110071732629, 0.5823571654525552, -0.45808210592918697,
    0.015151515151515152,
  ],
};
function tsit5(n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const K = Array.from({ length: 7 }, () => new Float64Array(n)),
    y = new Float64Array(n),
    y1 = new Float64Array(n),
    yt = new Float64Array(n);
  const { rtol, atol, hmax } = o;
  let t = 0,
    h = 0,
    facold = 1e-4;
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, K[0]!);
      st.nfev++;
      if (!(h > 0)) h = firstH(n, K[0]!, y, atol, rtol, hmax, 5);
      facold = 1e-4;
    },
    step(tT: number) {
      if (!K[0]!.every(fin)) return { fail: 'nan' };
      for (let tries = 0; ; tries++) {
        const span = tT - t;
        if (!(span > 0)) return { fail: 'time' };
        let hh = min(h, hmax),
          last = false;
        if (hh >= span * (1 - 1e-12)) {
          hh = span;
          last = true;
        }
        if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
        const tph = last ? tT : t + hh;
        for (let s2 = 1; s2 < 7; s2++) {
          const a = TS.a[s2]!;
          for (let i = 0; i < n; i++) {
            let v = 0;
            for (let j = 0; j < s2; j++) v += a[j]! * K[j]![i]!;
            yt[i] = y[i]! + hh * v;
          }
          if (s2 === 6) y1.set(yt);
          f(s2 >= 5 ? tph : t + TS.c[s2]! * hh, yt, K[s2]!);
        }
        st.nfev += 6;
        let err = 0;
        for (let i = 0; i < n; i++) {
          let e = 0;
          for (let j = 0; j < 7; j++) e += TS.e[j]! * K[j]![i]!;
          err += ((hh * e) / (atol[i]! + rtol * max(abs(y[i]!), abs(y1[i]!)))) ** 2;
        }
        err = sqrt(err / n);
        if (!fin(err)) {
          st.rejected++;
          h = hh / 10;
          if (!(h > 1e-300)) return { fail: 'nan' };
          continue;
        }
        const fac11 = pow(err, 0.2 - 0.04 * 0.75);
        if (err <= 1) {
          let fac = fac11 / pow(facold, 0.04);
          fac = max(0.1, min(5, fac / 0.9));
          const hnew = hh / fac;
          facold = max(err, 1e-4);
          const ta = t,
            hs = hh,
            r0 = Float64Array.from(y),
            KK = K.map(k => Float64Array.from(k)),
            bt = new Float64Array(7);
          const seg = (tq: number, out: Float64Array) => {
            const th = (tq - ta) / hs;
            for (let j = 0; j < 7; j++) {
              const q = TS.r[j]!;
              bt[j] = th * (q[0]! + th * (q[1]! + th * (q[2]! + th * q[3]!)));
            }
            for (let i = 0; i < n; i++) {
              let v = 0;
              for (let j = 0; j < 7; j++) v += bt[j]! * KK[j]![i]!;
              out[i] = r0[i]! + hs * v;
            }
          };
          t = tph;
          y.set(y1);
          K[0]!.set(K[6]!);
          h = last ? max(h, hnew) : hnew;
          return { t0: ta, t1: tph, y1: y, seg };
        }
        st.rejected++;
        h = hh / min(10, fac11 / 0.9);
      }
    },
  };
}

/* ROS3P (Lang & Verwer 2001, BIT 41:4): a 3-stage, order-3 A-stable Rosenbrock method with an embedded order-2 solution, written
     in the form of Sandu et al. 1997 (Atmos. Environ. 31:20; the KPP library): (I/(hγ) − J) U_i = f(t + α_i h, y + Σ a_ij U_j)
     + Σ c_ij/h U_j + hγ_i ∂f/∂t, y₁ = y + Σ m_i U_i. The coefficients follow from Lang & Verwer's (γ = 1/2 + √3/6, b = (2/3, 0, 1/3),
     b̂ = (1/3, 1/3, 1/3)); stage 3 reuses stage 2's f. Dense output: the cubic Hermite interpolant of y₀, f(y₀), y₁, f(y₁), a
     continuous extension of order min(p, 3) = 3 for a method of order p ≥ 3 (Hairer, Nørsett & Wanner I, 2nd ed. 1993, §II.6,
     (6.7)–(6.8)); a 3-stage Rosenbrock method has no continuous extension of order 3 from its own stages (four order-3 conditions
     on three weights b_i(θ)), so this is the standard choice (it is also ode23s's for its order-2 method). The test measures the
     dense output's local error O(h⁴) */
const R3 = (() => {
  const g = 0.5 + Math.sqrt(3) / 6,
    a21 = 1 / g,
    c21 = -1.607695154586736,
    c31 = -3.464101615137755,
    c32 = -1.732050807568877;
  const m = [2, 0.5773502691896258, 0.4226497308103742],
    Gi = [
      [1 / g, 0, 0],
      [-c21, 1 / g, 0],
      [-c31, -c32, 1 / g],
    ];
  const mh = [0, 1, 2].map(j => (Gi[0]![j]! + Gi[1]![j]! + Gi[2]![j]!) / 3); // b̂ Γ⁻¹ with b̂ = (1/3, 1/3, 1/3)
  return { g, a21, c21, c31, c32, m, e: m.map((v, i) => v - mh[i]!), gam: [g, g - 1, g - 1 - Math.sqrt(3) / 2] };
})();
function ros3p(n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const F0 = new Float64Array(n),
    F1 = new Float64Array(n),
    U1 = new Float64Array(n),
    U2 = new Float64Array(n),
    U3 = new Float64Array(n),
    y = new Float64Array(n),
    y1 = new Float64Array(n),
    yt = new Float64Array(n);
  const J = new Float64Array(n * n),
    W = new Float64Array(n * n),
    Tt = new Float64Array(n),
    fx = new Float64Array(n),
    piv = new Int32Array(n);
  const { rtol, atol, hmax } = o;
  let t = 0,
    h = 0;
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, F0);
      st.nfev++;
      if (!(h > 0)) h = firstH(n, F0, y, atol, rtol, hmax, 3);
      fdJac(n, f, t, y, F0, J, Tt, atol, rtol, st, fx);
    },
    step(tT: number) {
      if (!F0.every(fin)) return { fail: 'nan' };
      for (let tries = 0; ; tries++) {
        const span = tT - t;
        if (!(span > 0)) return { fail: 'time' };
        let hh = min(h, hmax),
          last = false;
        if (hh >= span * (1 - 1e-12)) {
          hh = span;
          last = true;
        }
        if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
        const gi = 1 / (hh * R3.g);
        for (let i = 0; i < n * n; i++) W[i] = -J[i]!;
        for (let i = 0; i < n; i++) W[i * n + i]! += gi;
        if (!luFactor(W, n, piv)) {
          st.rejected++;
          h = hh / 4;
          continue;
        }
        for (let i = 0; i < n; i++) U1[i] = F0[i]! + hh * R3.gam[0]! * Tt[i]!;
        luSolve(W, n, piv, U1);
        for (let i = 0; i < n; i++) yt[i] = y[i]! + R3.a21 * U1[i]!;
        f(t + hh, yt, F1);
        st.nfev++;
        for (let i = 0; i < n; i++) U2[i] = F1[i]! + (R3.c21 / hh) * U1[i]! + hh * R3.gam[1]! * Tt[i]!;
        luSolve(W, n, piv, U2);
        for (let i = 0; i < n; i++) U3[i] = F1[i]! + (R3.c31 * U1[i]! + R3.c32 * U2[i]!) / hh + hh * R3.gam[2]! * Tt[i]!;
        luSolve(W, n, piv, U3);
        let err = 0;
        for (let i = 0; i < n; i++) {
          y1[i] = y[i]! + R3.m[0]! * U1[i]! + R3.m[1]! * U2[i]! + R3.m[2]! * U3[i]!;
          const e = R3.e[0]! * U1[i]! + R3.e[1]! * U2[i]! + R3.e[2]! * U3[i]!;
          err += (e / (atol[i]! + rtol * max(abs(y[i]!), abs(y1[i]!)))) ** 2;
        }
        err = sqrt(err / n);
        if (!fin(err)) {
          st.rejected++;
          h = hh / 10;
          continue;
        }
        if (err <= 1) {
          const tph = last ? tT : t + hh,
            hnew = hh * min(5, max(0.2, 0.9 * pow(max(err, 1e-10), -1 / 3)));
          const r0 = Float64Array.from(y),
            d0 = Float64Array.from(F0),
            ta = t;
          t = tph;
          y.set(y1);
          f(t, y, F0);
          st.nfev++;
          const seg = hermite(n, ta, hh, r0, d0, Float64Array.from(y1), Float64Array.from(F0));
          h = last ? max(h, hnew) : hnew;
          fdJac(n, f, t, y, F0, J, Tt, atol, rtol, st, fx);
          return { t0: ta, t1: tph, y1: y, seg };
        }
        st.rejected++;
        h = hh * max(0.2, 0.9 * pow(err, -1 / 3));
      }
    },
  };
}

/* Radau IIA of order 5 (3 stages; Hairer & Wanner, Solving ODEs II, 2nd ed. 1996, §IV.8 — the method of RADAU5): L-stable and
     stiffly accurate. The stage equations Z = h(A⊗I)F(y + Z) are solved by simplified Newton with the Jacobian of the step's start;
     with A⁻¹ = T Λ T⁻¹, Λ = diag(γ, [[α, β], [−β, α]]), the 3n × 3n system I − h(A⊗J) splits into one real n × n system
     (γ/h − J) and one complex n × n system ((α − iβ)/h − J) (Hairer & Wanner §IV.8, (8.15)–(8.16); T and Λ are computed here from
     A; cfg.radauLinear: 'full' solves the 3n × 3n real system instead — the same iterates, for the test). Newton stops when θ/(1 − θ)·‖ΔZ‖ ≤ κ = max(10u/rtol, min(0.03, √rtol)); it diverges
     when θ ≥ 0.99 (the step is halved). The error estimate is RADAU5's (§IV.8, (8.19)–(8.20)): err = (γ₀⁻¹/h I − J)⁻¹ (f(y₀) +
     Σ e_i Z_i/h), refined once by a second solve after a rejection. Dense output: the collocation polynomial through y, y + Z₁..Z₃ */
const RD = (() => {
  const s6 = Math.sqrt(6);
  return {
    c: [(4 - s6) / 10, (4 + s6) / 10, 1],
    A: [
      [(88 - 7 * s6) / 360, (296 - 169 * s6) / 1800, (-2 + 3 * s6) / 225],
      [(296 + 169 * s6) / 1800, (88 + 7 * s6) / 360, (-2 - 3 * s6) / 225],
      [(16 - s6) / 36, (16 + s6) / 36, 1 / 9],
    ],
    u1: 30 / (6 + Math.cbrt(81) - Math.cbrt(9)),
    dd: [-(13 + 7 * s6) / 3, (-13 + 7 * s6) / 3, -1 / 3],
  };
})();
/* the transformation of RADAU5: A⁻¹ = T Λ T⁻¹ with T = [v (the real eigenvector), Re w, Im w] (w the eigenvector of α + iβ) */
type V3 = readonly [number, number, number];
const RDT = (() => {
  const inv3 = (M: readonly (readonly number[])[]) => {
    const [a, b, c] = M[0]! as V3,
      [d, e, f2] = M[1]! as V3,
      [g, h, k] = M[2]! as V3,
      A2 = e * k - f2 * h,
      B = -(d * k - f2 * g),
      C2 = d * h - e * g,
      det = a * A2 + b * B + c * C2;
    return [
      [A2 / det, -(b * k - c * h) / det, (b * f2 - c * e) / det],
      [B / det, (a * k - c * g) / det, -(a * f2 - c * d) / det],
      [C2 / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
  };
  const mul = (X: number[][], Y: number[][]) => X.map((r, i) => Y[0]!.map((_, j) => r.reduce((s2, _, k) => s2 + X[i]![k]! * Y[k]![j]!, 0)));
  const Ai = inv3(RD.A),
    tr = Ai[0]![0]! + Ai[1]![1]! + Ai[2]![2]!;
  const g = RD.u1,
    al = (tr - g) / 2,
    det =
      Ai[0]![0]! * (Ai[1]![1]! * Ai[2]![2]! - Ai[1]![2]! * Ai[2]![1]!) -
      Ai[0]![1]! * (Ai[1]![0]! * Ai[2]![2]! - Ai[1]![2]! * Ai[2]![0]!) +
      Ai[0]![2]! * (Ai[1]![0]! * Ai[2]![1]! - Ai[1]![1]! * Ai[2]![0]!);
  const be = sqrt(det / g - al * al);
  // eigenvectors as the cross product of two rows of (A⁻¹ − λI) (complex for λ = α + iβ)
  const crossC = (ar: number[], ai: number[], br: number[], bi: number[]): [number[], number[]] => {
    const re: number[] = [],
      im: number[] = [];
    for (const [p, q] of [
      [1, 2],
      [2, 0],
      [0, 1],
    ] as const) {
      re.push(ar[p]! * br[q]! - ai[p]! * bi[q]! - (ar[q]! * br[p]! - ai[q]! * bi[p]!));
      im.push(ar[p]! * bi[q]! + ai[p]! * br[q]! - (ar[q]! * bi[p]! + ai[q]! * br[p]!));
    }
    return [re, im];
  };
  const rowR = (i: number, lr: number) => Ai[i]!.map((v, j) => v - (i === j ? lr : 0)),
    rowI = (i: number, li: number) => Ai[i]!.map((_, j) => (i === j ? -li : 0));
  const [v] = crossC(rowR(0, g), [0, 0, 0], rowR(1, g), [0, 0, 0]);
  const [u, w] = crossC(rowR(0, al), rowI(0, be), rowR(1, al), rowI(1, be));
  const T = [0, 1, 2].map(i => [v[i]!, u[i]!, w[i]!]),
    Ti = inv3(T),
    L = mul(mul(Ti, Ai), T);
  return { T, Ti, TiAi: mul(Ti, Ai), g: L[0]![0]!, al: L[1]![1]!, be: L[1]![2]!, L };
})();
// complex LU with partial pivoting (separate real and imaginary arrays)
function luFactorC(Ar: Float64Array, Ai: Float64Array, n: number, piv: Int32Array) {
  for (let k = 0; k < n; k++) {
    let p = k,
      mx = -1;
    for (let i = k; i < n; i++) {
      const m2 = Ar[i * n + k]! ** 2 + Ai[i * n + k]! ** 2;
      if (m2 > mx) {
        mx = m2;
        p = i;
      }
    }
    if (!(mx > 1e-300)) return false;
    piv[k] = p;
    if (p !== k)
      for (let j = 0; j < n; j++) {
        let tt = Ar[k * n + j]!;
        Ar[k * n + j] = Ar[p * n + j]!;
        Ar[p * n + j] = tt;
        tt = Ai[k * n + j]!;
        Ai[k * n + j] = Ai[p * n + j]!;
        Ai[p * n + j] = tt;
      }
    const dr = Ar[k * n + k]!,
      di = Ai[k * n + k]!,
      dd = dr * dr + di * di;
    for (let i = k + 1; i < n; i++) {
      const xr = Ar[i * n + k]!,
        xi = Ai[i * n + k]!,
        lr = (xr * dr + xi * di) / dd,
        li = (xi * dr - xr * di) / dd;
      Ar[i * n + k] = lr;
      Ai[i * n + k] = li;
      for (let j = k + 1; j < n; j++) {
        const yr = Ar[k * n + j]!,
          yi = Ai[k * n + j]!;
        Ar[i * n + j]! -= lr * yr - li * yi;
        Ai[i * n + j]! -= lr * yi + li * yr;
      }
    }
  }
  return true;
}
function luSolveC(Ar: Float64Array, Ai: Float64Array, n: number, piv: Int32Array, br: Float64Array, bi: Float64Array) {
  for (let k = 0; k < n; k++) {
    const p = piv[k]!;
    if (p !== k) {
      let tt = br[k]!;
      br[k] = br[p]!;
      br[p] = tt;
      tt = bi[k]!;
      bi[k] = bi[p]!;
      bi[p] = tt;
    }
  }
  for (let i = 1; i < n; i++) {
    let sr = br[i]!,
      si = bi[i]!;
    for (let j = 0; j < i; j++) {
      const lr = Ar[i * n + j]!,
        li = Ai[i * n + j]!;
      sr -= lr * br[j]! - li * bi[j]!;
      si -= lr * bi[j]! + li * br[j]!;
    }
    br[i] = sr;
    bi[i] = si;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = br[i]!,
      si = bi[i]!;
    for (let j = i + 1; j < n; j++) {
      const ur = Ar[i * n + j]!,
        ui = Ai[i * n + j]!;
      sr -= ur * br[j]! - ui * bi[j]!;
      si -= ur * bi[j]! + ui * br[j]!;
    }
    const dr = Ar[i * n + i]!,
      di = Ai[i * n + i]!,
      dd = dr * dr + di * di;
    br[i] = (sr * dr + si * di) / dd;
    bi[i] = (si * dr - sr * di) / dd;
  }
}
function radau5(n: number, f: Rhs, o: MethodOpts, st: Stats): Method {
  const full = o.radauLinear === 'full',
    N3 = 3 * n,
    M = full ? new Float64Array(N3 * N3) : null,
    pv = new Int32Array(N3),
    Er = new Float64Array(n * n),
    Ei = new Float64Array(n * n),
    pc = new Int32Array(n),
    sr = new Float64Array(n),
    sI = new Float64Array(n),
    s1 = new Float64Array(n),
    Z = new Float64Array(N3),
    dZ = new Float64Array(N3),
    F = new Float64Array(N3);
  const y = new Float64Array(n),
    yt = new Float64Array(n),
    F0 = new Float64Array(n),
    J = new Float64Array(n * n),
    E1 = new Float64Array(n * n),
    p1 = new Int32Array(n),
    fx = new Float64Array(n);
  const cont = new Float64Array(n),
    F2 = new Float64Array(n),
    fz = new Float64Array(n),
    y1 = new Float64Array(n);
  const { rtol, atol, hmax } = o,
    fnewt = max((10 * EPS) / rtol, min(0.03, sqrt(rtol)));
  let t = 0,
    h = 0,
    faccon = 1,
    rejLast = false,
    firstStep = true;
  const scal = (i: number) => atol[i]! + rtol * abs(y[i]!);
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, F0);
      st.nfev++;
      if (!(h > 0)) h = firstH(n, F0, y, atol, rtol, hmax, 5);
      fdJac(n, f, t, y, F0, J, null, atol, rtol, st, fx);
      firstStep = true;
    },
    step(tT: number) {
      if (!F0.every(fin)) return { fail: 'nan' };
      for (let tries = 0; ; tries++) {
        const span = tT - t;
        if (!(span > 0)) return { fail: 'time' };
        let hh = min(h, hmax),
          last = false;
        if (hh >= span * (1 - 1e-12)) {
          hh = span;
          last = true;
        }
        if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
        const tph = last ? tT : t + hh;
        let okLU;
        if (full) {
          for (let bi = 0; bi < 3; bi++)
            for (let i = 0; i < n; i++) {
              const row = (bi * n + i) * N3;
              for (let bj = 0; bj < 3; bj++) {
                const a = hh * RD.A[bi]![bj]!;
                for (let j = 0; j < n; j++) M![row + bj * n + j] = (bi === bj && i === j ? 1 : 0) - a * J[i * n + j]!;
              }
            }
          okLU = luFactor(M!, N3, pv);
        } else {
          // one real (γ/h − J) and one complex ((α − iβ)/h − J) factorisation; the real one also serves the error estimate
          for (let i = 0; i < n * n; i++) {
            E1[i] = -J[i]!;
            Er[i] = -J[i]!;
            Ei[i] = 0;
          }
          for (let i = 0; i < n; i++) {
            E1[i * n + i]! += RDT.g / hh;
            Er[i * n + i]! += RDT.al / hh;
            Ei[i * n + i] = -RDT.be / hh;
          }
          okLU = luFactor(E1, n, p1) && luFactorC(Er, Ei, n, pc);
        }
        if (!okLU) {
          st.rejected++;
          h = hh / 4;
          rejLast = true;
          continue;
        }
        Z.fill(0);
        let conv = false,
          dold = 0;
        faccon = pow(max(faccon, EPS), 0.8);
        for (let it = 0; it < 7; it++) {
          for (let k = 0; k < 3; k++) {
            for (let i = 0; i < n; i++) yt[i] = y[i]! + Z[k * n + i]!;
            f(k === 2 ? tph : t + RD.c[k]! * hh, yt, fz);
            F.set(fz, k * n);
          }
          st.nfev += 3;
          if (!F.every(fin)) break;
          for (let k = 0; k < 3; k++)
            for (let i = 0; i < n; i++)
              dZ[k * n + i] = -Z[k * n + i]! + hh * (RD.A[k]![0]! * F[i]! + RD.A[k]![1]! * F[n + i]! + RD.A[k]![2]! * F[2 * n + i]!);
          if (full) luSolve(M!, N3, pv, dZ);
          else {
            // ΔZ = (T⊗I) ΔW, with the blocks of (Λ/h ⊗ I − I ⊗ J) ΔW = (T⁻¹A⁻¹ ⊗ I) r / h
            const P = RDT.TiAi;
            for (let i = 0; i < n; i++) {
              const r0 = dZ[i]!,
                r1 = dZ[n + i]!,
                r2 = dZ[2 * n + i]!;
              s1[i] = (P[0]![0]! * r0 + P[0]![1]! * r1 + P[0]![2]! * r2) / hh;
              sr[i] = (P[1]![0]! * r0 + P[1]![1]! * r1 + P[1]![2]! * r2) / hh;
              sI[i] = (P[2]![0]! * r0 + P[2]![1]! * r1 + P[2]![2]! * r2) / hh;
            }
            luSolve(E1, n, p1, s1);
            luSolveC(Er, Ei, n, pc, sr, sI);
            const T = RDT.T;
            for (let i = 0; i < n; i++)
              for (let k = 0; k < 3; k++) dZ[k * n + i] = T[k]![0]! * s1[i]! + T[k]![1]! * sr[i]! + T[k]![2]! * sI[i]!;
          }
          let dn = 0;
          for (let k = 0; k < 3; k++)
            for (let i = 0; i < n; i++) {
              Z[k * n + i]! += dZ[k * n + i]!;
              dn += (dZ[k * n + i]! / scal(i)) ** 2;
            }
          dn = sqrt(dn / N3);
          if (it > 0) {
            const th = dn / dold;
            if (!(th < 0.99)) break;
            faccon = th / (1 - th);
          }
          if (faccon * dn <= fnewt || dn <= 1e-14) {
            conv = true;
            break;
          }
          dold = dn;
        }
        if (!conv) {
          st.rejected++;
          h = hh / 2;
          rejLast = true;
          faccon = 1;
          continue;
        }
        // the error estimate
        if (full) {
          for (let i = 0; i < n * n; i++) E1[i] = -J[i]!;
          for (let i = 0; i < n; i++) E1[i * n + i]! += RD.u1 / hh;
          if (!luFactor(E1, n, p1)) {
            st.rejected++;
            h = hh / 2;
            rejLast = true;
            continue;
          }
        }
        for (let i = 0; i < n; i++) {
          F2[i] = (RD.dd[0]! * Z[i]! + RD.dd[1]! * Z[n + i]! + RD.dd[2]! * Z[2 * n + i]!) / hh;
          cont[i] = F2[i]! + F0[i]!;
          y1[i] = y[i]! + Z[2 * n + i]!;
        }
        luSolve(E1, n, p1, cont);
        const enorm = () => {
          let e = 0;
          for (let i = 0; i < n; i++) e += (cont[i]! / (atol[i]! + rtol * max(abs(y[i]!), abs(y1[i]!)))) ** 2;
          return max(sqrt(e / n), 1e-10);
        };
        let err = enorm();
        if (err >= 1 && (firstStep || rejLast)) {
          for (let i = 0; i < n; i++) yt[i] = y[i]! + cont[i]!;
          f(t, yt, fz);
          st.nfev++;
          for (let i = 0; i < n; i++) cont[i] = F2[i]! + fz[i]!;
          luSolve(E1, n, p1, cont);
          err = enorm();
        }
        if (!fin(err)) {
          st.rejected++;
          h = hh / 10;
          rejLast = true;
          continue;
        }
        const fac = 0.9; // the safety factor
        if (err < 1) {
          const hnew = hh * min(4, max(0.2, fac * pow(err, -0.25)));
          const Y = [
              Float64Array.from(y),
              Float64Array.from(Z.subarray(0, n)),
              Float64Array.from(Z.subarray(n, 2 * n)),
              Float64Array.from(Z.subarray(2 * n)),
            ],
            ta = t,
            hs = hh;
          for (let k = 1; k < 4; k++) for (let i = 0; i < n; i++) Y[k]![i]! += Y[0]![i]!;
          const S0 = [0, RD.c[0]!, RD.c[1]!, 1];
          const seg = (tq: number, out: Float64Array) => {
            const s3 = (tq - ta) / hs;
            const L = S0.map((sk, k) => S0.reduce((p, sm, m) => (m === k ? p : (p * (s3 - sm)) / (sk - sm)), 1));
            for (let i = 0; i < n; i++) out[i] = L[0]! * Y[0]![i]! + L[1]! * Y[1]![i]! + L[2]! * Y[2]![i]! + L[3]! * Y[3]![i]!;
          };
          t = tph;
          y.set(y1);
          f(t, y, F0);
          st.nfev++;
          fdJac(n, f, t, y, F0, J, null, atol, rtol, st, fx);
          h = last ? max(h, hnew) : hnew;
          rejLast = false;
          firstStep = false;
          return { t0: ta, t1: tph, y1: y, seg };
        }
        st.rejected++;
        rejLast = true;
        h = hh * max(0.2, fac * pow(err, -0.25));
      }
    },
  };
}
// symplectic steps for a separable Hamiltonian system given as pairs [q index, p index] with q' = ∂H/∂p (a function of p) and
// p' = −∂H/∂q (a function of q): Störmer–Verlet kick–drift–kick (Hairer, Lubich & Wanner, Geometric Numerical Integration, 2nd ed.
// 2006, §I.1.4) and Yoshida 1990's 4th-order triple jump (Phys. Lett. A 150); cubic Hermite dense output
function symplectic(method: string, n: number, f: Rhs, o: MethodOpts, st: Stats, pairs: readonly (readonly number[])[]): Method {
  const y = new Float64Array(n),
    y1 = new Float64Array(n),
    f0 = new Float64Array(n),
    f1 = new Float64Array(n),
    a = new Float64Array(n);
  let t = 0;
  const dt = o.dt!,
    qi = pairs.map(p => p[0]!),
    pi = pairs.map(p => p[1]!);
  const kdk = (tt: number, hh: number, v: Float64Array) => {
    f(tt, v, a);
    for (const j of pi) v[j]! += 0.5 * hh * a[j]!;
    f(tt + 0.5 * hh, v, a);
    for (const j of qi) v[j]! += hh * a[j]!;
    f(tt + hh, v, a);
    for (const j of pi) v[j]! += 0.5 * hh * a[j]!;
    st.nfev += 3;
  };
  const Y1 = 1 / (2 - Math.cbrt(2)),
    Y0 = 1 - 2 * Y1;
  return {
    stiff: false,
    reset(t0: number, y0: Nums) {
      t = t0;
      y.set(y0);
      f(t, y, f0);
      st.nfev++;
    },
    step(tT: number) {
      const span = tT - t;
      if (!(span > 0)) return { fail: 'time' };
      const hh = min(dt, span),
        tph = hh === span ? tT : t + hh;
      y1.set(y);
      if (method === 'verlet') kdk(t, hh, y1);
      else {
        kdk(t, Y1 * hh, y1);
        kdk(t + Y1 * hh, Y0 * hh, y1);
        kdk(t + (Y1 + Y0) * hh, Y1 * hh, y1);
      }
      f(tph, y1, f1);
      st.nfev++;
      const r0 = Float64Array.from(y),
        r1 = Float64Array.from(y1),
        d0 = Float64Array.from(f0),
        d1 = Float64Array.from(f1),
        ta = t,
        hs = hh;
      const seg = (tq: number, out: Float64Array) => {
        const s = (tq - ta) / hs,
          s2 = s * s,
          s3 = s2 * s,
          h00 = 2 * s3 - 3 * s2 + 1,
          h10 = s3 - 2 * s2 + s,
          h01 = -2 * s3 + 3 * s2,
          h11 = s3 - s2;
        for (let i = 0; i < n; i++) out[i] = h00 * r0[i]! + h10 * hs * d0[i]! + h01 * r1[i]! + h11 * hs * d1[i]!;
      };
      t = tph;
      y.set(y1);
      f0.set(f1);
      return { t0: ta, t1: tph, y1: y, seg };
    },
  };
}
/* ---- small dense linear algebra (arrays of rows): LU with partial pivoting, solve, det, inverse; eigenvalues of a general matrix
     by balancing, Hessenberg reduction and the Francis double-shift QR (Parlett & Reinsch 1969; EISPACK balanc/elmhes/hqr as in
     Numerical Recipes 3rd ed. §11.6–11.7); symmetric eigenvalues and vectors by cyclic Jacobi (Golub & Van Loan 4th ed. §8.5) ---- */
const flat = (A: readonly ArrayLike<number | string>[]) => {
  const n = A.length,
    a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i * n + j] = +A[i]![j]!;
  return a;
};
const square = (A: unknown): A is readonly ArrayLike<number | string>[] =>
  Array.isArray(A) && A.length > 0 && A.every(r => (Array.isArray(r) || ArrayBuffer.isView(r)) && (r as Nums).length === A.length);
/** lu(A) → {ok, n, det, solve(b) → x} */
function lu(A: unknown) {
  if (!square(A)) return { ok: false, n: 0, det: NaN, solve: () => [] };
  const n = A.length,
    a = flat(A),
    piv = new Int32Array(n),
    ok = luFactor(a, n, piv);
  let det = ok ? 1 : 0;
  if (ok)
    for (let k = 0; k < n; k++) {
      det *= a[k * n + k]!;
      if (piv[k] !== k) det = -det;
    }
  return {
    ok,
    n,
    det,
    solve: (b: Nums | null) => {
      if (!ok || !b || b.length !== n) return new Array<number>(n).fill(NaN);
      const x = Float64Array.from(b);
      luSolve(a, n, piv, x);
      return Array.from(x);
    },
  };
}
const solve = (A: unknown, b: Nums | null) => lu(A).solve(b);
function inv(A: unknown) {
  const L = lu(A);
  if (!L.ok) return null;
  const n = L.n,
    cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    cols.push(L.solve(e));
  }
  return cols[0]!.map((_, i) => cols.map(c => c[i]!));
}
/** eig(A) → {re, im, ok}: all eigenvalues of a general real matrix (sorted by real part, then imaginary) */
function eig(A: unknown) {
  if (!square(A)) return { re: [], im: [], ok: false };
  const n = A.length,
    a = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) a[i]![j] = +A[i - 1]![j - 1]!;
  if (!a.every(r => r.every(fin))) return { re: [], im: [], ok: false };
  // balance
  for (let last = 0; !last;) {
    last = 1;
    for (let i = 1; i <= n; i++) {
      let r = 0,
        c = 0;
      for (let j = 1; j <= n; j++)
        if (j !== i) {
          c += abs(a[j]![i]!);
          r += abs(a[i]![j]!);
        }
      if (c && r) {
        let g = r / 2,
          f2 = 1;
        const s0 = c + r;
        while (c < g) {
          f2 *= 2;
          c *= 4;
        }
        g = r * 2;
        while (c > g) {
          f2 /= 2;
          c /= 4;
        }
        if ((c + r) / f2 < 0.95 * s0) {
          last = 0;
          g = 1 / f2;
          for (let j = 1; j <= n; j++) a[i]![j]! *= g;
          for (let j = 1; j <= n; j++) a[j]![i]! *= f2;
        }
      }
    }
  }
  // Hessenberg by stabilised elimination
  for (let m = 2; m < n; m++) {
    let x = 0,
      i = m;
    for (let j = m; j <= n; j++)
      if (abs(a[j]![m - 1]!) > abs(x)) {
        x = a[j]![m - 1]!;
        i = j;
      }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) {
        const tt = a[i]![j]!;
        a[i]![j] = a[m]![j]!;
        a[m]![j] = tt;
      }
      for (let j = 1; j <= n; j++) {
        const tt = a[j]![i]!;
        a[j]![i] = a[j]![m]!;
        a[j]![m] = tt;
      }
    }
    if (x)
      for (let i2 = m + 1; i2 <= n; i2++) {
        let y = a[i2]![m - 1]!;
        if (y !== 0) {
          y /= x;
          a[i2]![m - 1] = y;
          for (let j = m; j <= n; j++) a[i2]![j]! -= y * a[m]![j]!;
          for (let j = 1; j <= n; j++) a[j]![m]! += y * a[j]![i2]!;
        }
      }
  }
  for (let i = 3; i <= n; i++) for (let j = 1; j < i - 1; j++) a[i]![j] = 0;
  // the shifted QR (hqr)
  const wr = new Float64Array(n + 1),
    wi = new Float64Array(n + 1);
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = max(i - 1, 1); j <= n; j++) anorm += abs(a[i]![j]!);
  let nn = n,
    t = 0,
    okAll = true;
  const SIGN = (x: number, y: number) => (y >= 0 ? abs(x) : -abs(x));
  outer: while (nn >= 1) {
    let its = 0,
      l;
    do {
      for (l = nn; l >= 2; l--) {
        let s2 = abs(a[l - 1]![l - 1]!) + abs(a[l]![l]!);
        if (s2 === 0) s2 = anorm;
        if (abs(a[l]![l - 1]!) + s2 === s2) {
          a[l]![l - 1] = 0;
          break;
        }
      }
      let x = a[nn]![nn]!;
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        let y = a[nn - 1]![nn - 1]!,
          w = a[nn]![nn - 1]! * a[nn - 1]![nn]!;
        if (l === nn - 1) {
          const p = 0.5 * (y - x),
            q = p * p + w;
          let z = sqrt(abs(q));
          x += t;
          if (q >= 0) {
            z = p + SIGN(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) {
            okAll = false;
            break outer;
          }
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 1; i <= nn; i++) a[i]![i]! -= x;
            const s2 = abs(a[nn]![nn - 1]!) + abs(a[nn - 1]![nn - 2]!);
            y = x = 0.75 * s2;
            w = -0.4375 * s2 * s2;
          }
          ++its;
          let m,
            p = 0,
            q = 0,
            r = 0,
            z = 0;
          for (m = nn - 2; m >= l; m--) {
            z = a[m]![m]!;
            r = x - z;
            let s2 = y - z;
            p = (r * s2 - w) / a[m + 1]![m]! + a[m]![m + 1]!;
            q = a[m + 1]![m + 1]! - z - r - s2;
            r = a[m + 2]![m + 1]!;
            s2 = abs(p) + abs(q) + abs(r);
            p /= s2;
            q /= s2;
            r /= s2;
            if (m === l) break;
            const u = abs(a[m]![m - 1]!) * (abs(q) + abs(r)),
              v = abs(p) * (abs(a[m - 1]![m - 1]!) + abs(z) + abs(a[m + 1]![m + 1]!));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i]![i - 2] = 0;
            if (i !== m + 2) a[i]![i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k]![k - 1]!;
              q = a[k + 1]![k - 1]!;
              r = 0;
              if (k !== nn - 1) r = a[k + 2]![k - 1]!;
              if ((x = abs(p) + abs(q) + abs(r)) !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            const s2 = SIGN(sqrt(p * p + q * q + r * r), p);
            if (s2 !== 0) {
              if (k === m) {
                if (l !== m) a[k]![k - 1] = -a[k]![k - 1]!;
              } else a[k]![k - 1] = -s2 * x;
              p += s2;
              x = p / s2;
              y = q / s2;
              z = r / s2;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k]![j]! + q * a[k + 1]![j]!;
                if (k !== nn - 1) {
                  p += r * a[k + 2]![j]!;
                  a[k + 2]![j]! -= p * z;
                }
                a[k + 1]![j]! -= p * y;
                a[k]![j]! -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i]![k]! + y * a[i]![k + 1]!;
                if (k !== nn - 1) {
                  p += z * a[i]![k + 2]!;
                  a[i]![k + 2]! -= p * r;
                }
                a[i]![k + 1]! -= p * q;
                a[i]![k]! -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const idx = Array.from({ length: n }, (_, i) => i + 1).sort((i, j) => wr[i]! - wr[j]! || wi[i]! - wi[j]!);
  return { re: idx.map(i => wr[i]!), im: idx.map(i => wi[i]!), ok: okAll };
}
/** eigSym(A) → {values (ascending), vectors (columns, unit length), sweeps, ok}: cyclic Jacobi on a symmetric matrix */
function eigSym(A: unknown) {
  if (!square(A)) return { values: [], vectors: [], sweeps: 0, ok: false };
  const n = A.length,
    a = A.map(r => Array.from(r, Number)),
    V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  let sweeps = 0,
    nrm = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nrm += a[i]![j]! * a[i]![j]!;
  for (; sweeps < 60; sweeps++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! * a[i]![j]!;
    if (off <= 1e-32 * nrm || off === 0) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (a[p]![q] === 0) continue;
        const th2 = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!),
          tt = (th2 >= 0 ? 1 : -1) / (abs(th2) + sqrt(th2 * th2 + 1)),
          c = 1 / sqrt(tt * tt + 1),
          s2 = tt * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!,
            akq = a[k]![q]!;
          a[k]![p] = c * akp - s2 * akq;
          a[k]![q] = s2 * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!,
            aqk = a[q]![k]!;
          a[p]![k] = c * apk - s2 * aqk;
          a[q]![k] = s2 * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k]![p]!,
            vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s2 * vkq;
          V[k]![q] = s2 * vkp + c * vkq;
        }
      }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i]![i]! - a[j]![j]!);
  return { values: idx.map(i => a[i]![i]!), vectors: V.map(r => idx.map(i => r[i]!)), sweeps, ok: sweeps < 60 };
}
const METHODS = ['auto', 'dopri5', 'tsit5', 'rosenbrock', 'ros3p', 'radau5', 'rk4', 'midpoint', 'heun', 'euler', 'verlet', 'yoshida4'];
const FIXED = ['rk4', 'midpoint', 'heun', 'euler', 'verlet', 'yoshida4'];
function integrate(cfg: IntegrateConfig | null) {
  const C = codes(['nan', 'blow-up', 'step-underflow', 'budget', 'zeno', 'bad-config']);
  const st = { steps: 0, rejected: 0, nfev: 0 };
  const y0 = cfg && cfg.y0 ? Float64Array.from(cfg.y0) : null,
    n = y0 ? y0.length : 0;
  const t0 = cfg && fin(cfg.t0) ? cfg.t0 : 0,
    tEnd = cfg && cfg.tEnd;
  let method = cfg && METHODS.includes(cfg.method!) ? cfg.method! : 'auto';
  const done = (t: number, y: Nums | null, stop: string, evs?: Hit[]) => ({
    t,
    y: y ? Array.from(y) : [],
    steps: st.steps,
    rejected: st.rejected,
    nfev: st.nfev,
    events: evs || [],
    stop,
    method,
    codes: C.list,
  });
  if (!cfg || typeof cfg.f !== 'function' || !n || !fin(tEnd) || !(tEnd >= t0)) {
    C.code('bad-config');
    return done(t0, y0, 'bad-config');
  }
  const pairs = Array.isArray(cfg.pairs) ? cfg.pairs.filter(p => Array.isArray(p) && p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n) : [];
  const sym = method === 'verlet' || method === 'yoshida4';
  if (FIXED.includes(method) && !(cfg.dt! > 0)) {
    C.code('bad-config');
    return done(t0, y0, 'bad-config');
  }
  if (sym && pairs.length * 2 !== n) {
    C.code('bad-config');
    return done(t0, y0, 'bad-config');
  }
  // atol: a number, or one per component (all > 0)
  const AT = new Float64Array(n);
  if (Array.isArray(cfg.atol) || ArrayBuffer.isView(cfg.atol)) {
    if ((cfg.atol as Nums).length !== n || !Array.from(cfg.atol as Nums).every(v => v > 0 && fin(v))) {
      C.code('bad-config');
      return done(t0, y0, 'bad-config');
    }
    AT.set(cfg.atol as Nums);
  } else AT.fill((cfg.atol as number) > 0 ? (cfg.atol as number) : 1e-9);
  const o = {
    rtol: cfg.rtol! > 0 ? cfg.rtol! : 1e-6,
    atol: AT,
    hmax: cfg.hmax! > 0 ? cfg.hmax! : max(abs(tEnd - t0), 1e-12),
    dt: cfg.dt,
    radauLinear: cfg.radauLinear,
  };
  const maxSteps = fin(cfg.maxSteps) ? min(cfg.maxSteps, MAX_STEPS) : MAX_STEPS,
    maxEvents = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : 1000;
  const maxInst = fin(cfg.maxInstant) && cfg.maxInstant >= 1 ? min(cfg.maxInstant, MAX_EVENTS) : 100; // hits at one instant before zeno
  const f = (t: number, y: Float64Array, dy: Float64Array) => {
    cfg.f!(t, y, dy);
  };
  const make = (m: string) =>
    m === 'dopri5' || m === 'auto'
      ? dopri(n, f, o, st)
      : m === 'tsit5'
        ? tsit5(n, f, o, st)
        : m === 'rosenbrock'
          ? rosenbrock(n, f, o, st)
          : m === 'ros3p'
            ? ros3p(n, f, o, st)
            : m === 'radau5'
              ? radau5(n, f, o, st)
              : m === 'verlet' || m === 'yoshida4'
                ? symplectic(m, n, f, o, st, pairs)
                : fixed(m, n, f, o, st);
  let S = make(method),
    auto = method === 'auto';
  const evs = (cfg.events || []).filter((e): e is StateEvent => !!e && typeof e.g === 'function');
  const armed = evs.map(() => true),
    gv = new Float64Array(evs.length),
    ztol = cfg.gtol! > 0 ? cfg.gtol! : 1e-10,
    lastHit = evs.map(() => -Infinity),
    jumped = evs.map(() => false);
  const samples = cfg.samples || [];
  let si = 0;
  // breaks: times the step must land on exactly (doses, switches, the discontinuities of a delay equation); apply(t, y) may change y
  const brk = (Array.isArray(cfg.breaks) ? (cfg.breaks as readonly (Break | null)[]) : [])
    .filter((b): b is Break => !!b && fin(b.t) && b.t >= t0 && b.t <= tEnd)
    .slice()
    .sort((a, b) => a.t - b.t);
  let bi = 0;
  const onSeg = typeof cfg.onSegment === 'function' ? cfg.onSegment : null;
  let t = t0;
  const y = Float64Array.from(y0!),
    tmp = new Float64Array(n),
    ya = new Float64Array(n),
    yo = new Float64Array(n);
  if (!y.every(fin)) {
    C.code('nan', t);
    return done(t, y, 'nan');
  }
  const evalG = (tt: number, yy: Float64Array) => {
    for (let j = 0; j < evs.length; j++) gv[j] = evs[j]!.g(tt, yy);
  };
  // a g that is exactly 0 takes the side it must leave towards for its direction (a ball put on the floor)
  const zeroSide = () => {
    for (let j = 0; j < evs.length; j++) if (gv[j] === 0 && evs[j]!.dir) gv[j] = evs[j]!.dir! < 0 ? 1e-300 : -1e-300;
  };
  const sample = (tt: number, yy: Float64Array) => {
    if (cfg.onSample) cfg.onSample(tt, yy);
  };
  // the samples up to tt on a step's dense output; a sample at the time of a pending break waits for the break (it sees the state after it)
  const sampleTo = (tt: number, seg: Seg) => {
    const bt = bi < brk.length ? brk[bi]!.t : Infinity;
    while (si < samples.length && (samples[si]! < tt || (samples[si] === tt && tt < bt))) {
      seg(samples[si]!, tmp);
      sample(samples[si]!, tmp);
      si++;
    }
  };
  const applyBreaks = () => {
    // every break at t (or just before: rounding) is applied in order; the method restarts from the new y, keeping h
    let any = false;
    while (bi < brk.length && brk[bi]!.t <= t + 1e-14 * max(1, abs(t))) {
      const b = brk[bi++]!;
      any = true;
      if (typeof b.apply === 'function') b.apply(t, y);
    }
    return any;
  };
  applyBreaks(); // breaks at t0 run before the first sample
  if (!y.every(fin)) {
    C.code('nan', t);
    return done(t, y, 'nan');
  }
  S.reset(t, y);
  evalG(t, y);
  zeroSide();
  while (si < samples.length && samples[si]! <= t) {
    sample(samples[si]!, y);
    si++;
  }
  const hits: Hit[] = [];
  let ymax0 = 1;
  for (let i = 0; i < n; i++) ymax0 = max(ymax0, abs(y[i]!));
  let instT = NaN,
    instN = 0,
    nObs = 0;
  for (;;) {
    if (bi < brk.length && brk[bi]!.t <= t + 1e-14 * max(1, abs(t))) {
      applyBreaks();
      if (!y.every(fin)) {
        C.code('nan', t);
        return done(t, y, 'nan', hits);
      }
      S.reset(t, y);
      evalG(t, y);
      zeroSide();
      while (si < samples.length && samples[si]! <= t) {
        sample(samples[si]!, y);
        si++;
      }
    }
    if (t >= tEnd) return done(t, y, 'end', hits);
    if (st.steps >= maxSteps) {
      C.code('budget', t);
      return done(t, y, 'budget', hits);
    }
    const r = S.step(bi < brk.length ? min(tEnd, brk[bi]!.t) : tEnd);
    if (r.fail) {
      C.code(r.fail === 'time' ? 'step-underflow' : r.fail, t);
      return done(t, y, r.fail, hits);
    }
    st.steps++;
    const g0 = Float64Array.from(gv);
    evalG(r.t1, r.y1);
    const loc = new Float64Array(evs.length).fill(Infinity),
      side = new Float64Array(evs.length);
    let first = Infinity,
      refound = false;
    const obs: [number, number, number][] = [];
    for (let j = 0; j < evs.length; j++) {
      const a0 = g0[j]!,
        b0 = gv[j]!;
      if (!armed[j]) {
        if (abs(b0) > (evs[j]!.hyst || 0)) armed[j] = true;
        continue;
      } // hysteresis: re-armed once |g| > hyst
      const dir = evs[j]!.dir || 0,
        up = a0 < 0 && b0 >= 0,
        down = a0 > 0 && b0 <= 0;
      if (!((dir >= 0 && up) || (dir <= 0 && down))) continue;
      const tr = locate(
        tt => {
          r.seg(tt, tmp);
          return evs[j]!.g(tt, tmp);
        },
        r.t0,
        r.t1,
        a0,
        b0,
        { tol: 1e-13 },
      );
      // a crossing within 1e-9·t of the last hit is that crossing seen again from its other side — unless the hit's handler changed
      // y: then it is a new crossing at (numerically) the same instant, a Zeno cascade, and it counts towards the zeno guard
      let again = false;
      if (tr <= lastHit[j]! + 1e-9 * max(1, abs(tr))) {
        if (!jumped[j] || evs[j]!.observe) continue;
        again = true;
      }
      if (evs[j]!.observe) {
        obs.push([tr, j, up ? 1 : -1]);
        continue;
      } // observed: reported, the step goes on
      loc[j] = tr;
      side[j] = up ? 1 : -1;
      if (tr < first) first = tr;
      if (again) refound = true;
    }
    const tSeg = first < Infinity ? first : r.t1;
    if (onSeg) onSeg(r.seg, r.t0, tSeg);
    // observed events inside the (possibly cut) step, in time order: onEvent sees the dense-output state; they do not count for zeno
    if (obs.length) {
      obs.sort((a, b) => a[0] - b[0]);
      for (const [tr, j, sd] of obs) {
        if (tr > tSeg) continue; // after the cut: seen again on the next step
        lastHit[j] = tr;
        if (evs[j]!.hyst! > 0) armed[j] = false;
        if (++nObs > MAX_EVENTS) {
          if (!C.has('observe-cap')) C.code('observe-cap', tr);
          continue;
        }
        sampleTo(tr, r.seg);
        r.seg(tr, yo);
        hits.push({ t: tr, j, kind: evs[j]!.kind, dir: sd, observe: true });
        const act = evs[j]!.onEvent ? evs[j]!.onEvent(tr, Float64Array.from(yo), { j, dir: sd, observe: true }) : undefined;
        if (act === 'stop' || evs[j]!.terminal) {
          sampleTo(tr, r.seg);
          t = tr;
          y.set(yo);
          return done(t, y, 'event', hits);
        }
      }
    }
    if (first < Infinity) {
      // the step is cut at the earliest event; simultaneous events (within 1e-12·t) fire together, in order
      const tolS = 1e-12 * max(1, abs(first));
      r.seg(first, ya);
      sampleTo(first, r.seg);
      let stop = false;
      const fired = [];
      for (let j = 0; j < evs.length; j++)
        if (loc[j]! <= first + tolS) {
          fired.push(j);
          lastHit[j] = first;
          hits.push({ t: first, j, kind: evs[j]!.kind, dir: side[j]! });
          tmp.set(ya);
          const act = evs[j]!.onEvent ? evs[j]!.onEvent!(first, ya, { j, dir: side[j]! }) : undefined;
          jumped[j] = false;
          for (let i = 0; i < n; i++)
            if (ya[i] !== tmp[i]) {
              jumped[j] = true;
              break;
            }
          if (act === 'stop' || evs[j]!.terminal) stop = true;
        }
      if (refound || first === instT || abs(first - instT) <= tolS) instN += fired.length;
      else {
        instT = first;
        instN = fired.length;
      }
      if (hits.length - min(nObs, MAX_EVENTS) > maxEvents || instN > maxInst) {
        C.code('zeno', first);
        return done(first, ya, 'zeno', hits);
      }
      t = first;
      y.set(ya);
      if (stop) return done(t, y, 'event', hits);
      if (!y.every(fin)) {
        C.code('nan', t);
        return done(t, y, 'nan', hits);
      }
      S.reset(t, y);
      evalG(t, y);
      // after a hit, a g left at (about) 0 takes the side it must leave towards for its direction (as at the start; ode@1's rule),
      // so the next crossing is seen even when it fits in one step; a direction-free event takes the side the crossing went to.
      // With hyst > 0 the event stays disarmed until |g| > hyst
      for (const j of fired) {
        if (abs(gv[j]!) <= ztol) {
          const d0 = evs[j]!.dir || 0;
          gv[j] = d0 ? (d0 < 0 ? 1e-300 : -1e-300) : side[j]! * 1e-300;
        }
        if (evs[j]!.hyst! > 0) armed[j] = false;
      }
      continue;
    }
    sampleTo(r.t1, r.seg);
    t = r.t1!;
    y.set(r.y1);
    if (!y.every(fin)) {
      C.code('nan', t);
      return done(t, y, 'nan', hits);
    }
    let ym = 0;
    for (let i = 0; i < n; i++) ym = max(ym, abs(y[i]!));
    if (ym > 1e12 * ymax0) {
      C.code('blow-up', t);
      return done(t, y, 'blow-up', hits);
    }
    if (auto && S.stiff) {
      C.code('stiff-switched', t);
      auto = false;
      method = 'rosenbrock';
      S = make('rosenbrock');
      S.reset(t, y);
    } // like LSODA's switch (Petzold 1983)
    else if (!auto && S.stiff && !C.has('stiff')) C.code('stiff', t);
  }
}

/* ======================================================================================================================
     Output analysis (L ch. 9; BCNN ch. 11)
     ====================================================================================================================== */
/** Kahan–Babuška summation in Neumaier's form (Neumaier 1974, ZAMM 54): sum(), add(x); the error of a sum of n terms stays
      O(u)·Σ|x| instead of O(nu)·Σ|x| (Higham, Accuracy and Stability of Numerical Algorithms, 2nd ed. 2002, §4.3) */
function ksum() {
  let s = 0,
    c = 0;
  return {
    add(x: number) {
      const t = s + x;
      if (abs(s) >= abs(x)) c += s - t + x;
      else c += x - t + s;
      s = t;
    },
    get value() {
      return s + c;
    },
    reset() {
      s = 0;
      c = 0;
    },
  };
}
/** Welford 1962: running mean and variance, numerically stable; the sum is compensated (Neumaier) */
function welford() {
  let n = 0,
    m = 0,
    s = 0,
    lo = Infinity,
    hi = -Infinity;
  const sum = ksum();
  return {
    add(x: number) {
      if (!fin(x)) return;
      n++;
      const d = x - m;
      m += d / n;
      s += d * (x - m);
      sum.add(x);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    },
    get n() {
      return n;
    },
    get mean() {
      return n ? m : NaN;
    },
    get var() {
      return n > 1 ? s / (n - 1) : NaN;
    },
    get sd() {
      return n > 1 ? sqrt(s / (n - 1)) : NaN;
    },
    get min() {
      return n ? lo : NaN;
    },
    get max() {
      return n ? hi : NaN;
    },
    get sum() {
      return sum.value;
    },
  };
}
/** a time-weighted average of a piecewise-constant quantity (a queue length): update(t, v) at each change (L §1.4.1 "area under
      Q(t)"); reset(t) starts again (end of warm-up) keeping the current value */
function timeAvg(t0: number, v0: number) {
  // the area is a compensated sum (Neumaier): a long run of many small pieces keeps its digits
  let tl = fin(t0) ? t0 : 0,
    ts = tl,
    v = fin(v0) ? v0 : 0,
    mx = v;
  const area = ksum();
  return {
    update(t: number, nv: number) {
      if (t > tl) {
        area.add(v * (t - tl));
        tl = t;
      }
      v = nv;
      if (nv > mx) mx = nv;
    },
    add(t: number, dv: number) {
      this.update(t, v + dv);
    },
    get value() {
      return v;
    },
    mean(t: number) {
      const tt = fin(t) ? max(t, tl) : tl,
        a = area.value + v * (tt - tl);
      return tt > ts ? a / (tt - ts) : NaN;
    },
    area(t: number) {
      const tt = fin(t) ? max(t, tl) : tl;
      return area.value + v * (tt - tl);
    },
    reset(t: number) {
      if (t > tl) {
        tl = t;
      }
      ts = tl;
      area.reset();
      mx = v;
    },
    get max() {
      return mx;
    },
    get start() {
      return ts;
    },
  };
}
/** ci(values, level) → {n, mean, sd, half, lo, hi}: the Student-t interval of a mean of independent values (L §4.5) */
function ci(values: readonly number[] | null | undefined, level?: number | null) {
  const lv = level! > 0 && level! < 1 ? level! : 0.95,
    w = welford();
  for (const v of values || []) w.add(v);
  const n = w.n,
    mean = w.mean,
    sd = w.sd;
  const half = n >= 2 ? (tq(1 - (1 - lv) / 2, n - 1) * sd) / sqrt(n) : NaN;
  return { n, mean, sd, half, lo: mean - half, hi: mean + half, level: lv };
}
/** lag-k autocorrelation of a series */
function acf(x: readonly number[], k: number) {
  const n = x.length;
  if (n <= k + 1) return NaN;
  let m = 0;
  for (const v of x) m += v;
  m /= n;
  let c0 = 0,
    ck = 0;
  for (let i = 0; i < n; i++) c0 += (x[i]! - m) ** 2;
  for (let i = 0; i + k < n; i++) ck += (x[i]! - m) * (x[i + k]! - m);
  return c0 > 0 ? ck / c0 : NaN;
}
/** batchMeans(series, nb, level) → ci over nb non-overlapping batch means + lag1 (their lag-1 autocorrelation: |lag1| > 0.2 →
      code 'batch-correlated', batches too short; Schmeiser 1982; L §9.5.3) */
function batchMeans(x: readonly number[] | null | undefined, nb: number, level: number) {
  const k = Number.isInteger(nb) && nb >= 2 ? nb : 20,
    m = floor((x || []).length / k);
  if (m < 1) return { ...ci([], level), batches: [], lag1: NaN, size: 0 };
  const bm = [];
  for (let b = 0; b < k; b++) {
    let s = 0;
    for (let i = b * m; i < (b + 1) * m; i++) s += x![i]!;
    bm.push(s / m);
  }
  return { ...ci(bm, level), batches: bm, lag1: acf(bm, 1), size: m };
}
/** MSER-5 (White 1997; White, Cobb & Spratt 2000; Franklin & White 2008): the series is cut in batches of 5; d* minimises the
      standard error of the remaining mean, searched over the first half only (a d* in the second half means the run is too short:
      {short: true}) → {d (observations to delete), dBatches, short} */
function mser5(x: readonly number[] | null | undefined) {
  const n = floor((x || []).length / 5);
  if (n < 4) return { d: 0, dBatches: 0, short: true, z: [] };
  const z = [];
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 5 * j; i < 5 * j + 5; i++) s += x![i]!;
    z.push(s / 5);
  }
  // suffix sums: the mean and the sum of squares of z[d..n)
  const S1 = new Float64Array(n + 1),
    S2 = new Float64Array(n + 1);
  for (let j = n - 1; j >= 0; j--) {
    S1[j] = S1[j + 1]! + z[j]!;
    S2[j] = S2[j + 1]! + z[j]! * z[j]!;
  }
  let best = Infinity,
    dB = 0;
  for (let d = 0; d <= n - 2; d++) {
    const k = n - d,
      mean = S1[d]! / k,
      ss = S2[d]! - k * mean * mean,
      v = max(0, ss) / (k * k);
    if (v < best) {
      best = v;
      dB = d;
    }
  }
  return { d: 5 * dB, dBatches: dB, short: dB > n / 2, z };
}
/** replicate(n, seed, fn(seedI, i) → {name: number}) → {name: ci}: independent replications (L §9.4.1); seedI = subseed(seed, i) */
function replicate(
  n: number,
  seed: number,
  fn: (seed: number, i: number) => Readonly<Record<string, number>> | null | undefined,
  level: number,
) {
  const runs: Readonly<Record<string, number>>[] = [];
  const N = min(max(1, floor(n) || 1), 1000);
  for (let i = 0; i < N; i++) {
    let r;
    try {
      r = fn(subseed(seed >>> 0, i), i);
    } catch {
      r = null;
    }
    runs.push(isObj(r) ? r : {});
  }
  const names = new Set<string>();
  for (const r of runs) for (const k of Object.keys(r)) names.add(k);
  const out: Record<string, ReturnType<typeof ci>> = {};
  for (const k of names)
    out[k] = ci(
      runs.map(r => r[k]!),
      level,
    );
  return out;
}
/** Little 1961: L = λW. littleCheck(L, lambda, W) → the relative gap |L − λW| / max(L, λW) (finite runs: end effects of order 1/T) */
function littleCheck(L: number, lambda: number, W: number) {
  const a = lambda * W,
    d = max(abs(L), abs(a));
  return d > 0 ? abs(L - a) / d : 0;
}

/* ======================================================================================================================
     Sweeps and sensitivity (Saltelli et al. 2008). fn(x) gets x as an array in the model's units; budgets bound the evaluations.
     ====================================================================================================================== */
const linspace = (a: number, b: number, n: number) => (n <= 1 ? [a] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));
/** oat(base, axes [{lo, hi, points}], fn) → [{axis, x: [...], y: [...]}]: one factor at a time around the base point */
function oat(base: readonly number[], axes: readonly Axis[], fn: (x: number[]) => unknown, maxEval: number) {
  const cap = fin(maxEval) ? maxEval : 2000,
    res: { axis: number; x: number[]; y: number[] }[] = [];
  let used = 0;
  axes.forEach((a, i) => {
    const xs = linspace(a.lo, a.hi, a.points || 11),
      ys: number[] = [];
    for (const v of xs) {
      if (used++ >= cap) {
        ys.push(NaN);
        continue;
      }
      const x = base.slice();
      x[i] = v;
      ys.push(safe(fn, x));
    }
    res.push({ axis: i, x: xs, y: ys });
  });
  return res;
}
const safe = (fn: (x: number[]) => unknown, x: number[]) => {
  try {
    const v = fn(x);
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
};
/** grid(axes, fn, maxEval) → {points: [[x…]], y: [...], over: bool}: the full factorial grid (row-major, the last axis fastest) */
function grid(axes: readonly Axis[], fn: (x: number[]) => unknown, maxEval: number) {
  const cap = fin(maxEval) ? maxEval : 2000,
    ns = axes.map(a => a.points || 5),
    total = ns.reduce((p, k) => p * k, 1);
  const pts: number[][] = [],
    y: number[] = [];
  if (total > cap) return { points: [], y: [], over: true, total };
  for (let idx = 0; idx < total; idx++) {
    let r = idx;
    const x = new Array<number>(axes.length);
    for (let i = axes.length - 1; i >= 0; i--) {
      const k = r % ns[i]!;
      r = (r - k) / ns[i]!;
      x[i] = linspace(axes[i]!.lo, axes[i]!.hi, ns[i]!)[k]!;
    }
    pts.push(x);
    y.push(safe(fn, x));
  }
  return { points: pts, y, over: false, total };
}
const scale = (u: readonly number[], axes: readonly Axis[]) => u.map((v, i) => axes[i]!.lo + v * (axes[i]!.hi - axes[i]!.lo));
/** Morris 1991 elementary effects with r trajectories on a p-level grid, Δ = p/(2(p − 1)); μ* (Campolongo et al. 2007) and σ.
      Cost r·(k + 1) evaluations. → {mu, muStar, sigma, evals} */
function morris(
  axes: readonly Axis[],
  fn: (x: number[]) => unknown,
  o: {
    readonly r?: number | undefined;
    readonly levels?: number | undefined;
    readonly seed?: number | undefined;
    readonly maxEval?: number | undefined;
  } | null,
) {
  const k = axes.length,
    r = (o && o.r) || 10,
    p = (o && o.levels) || 4,
    D = p / (2 * (p - 1)),
    rs = stream((o && o.seed) || 1, 'morris');
  const cap = (o && o.maxEval) || 2000;
  if (r * (k + 1) > cap) return { mu: [], muStar: [], sigma: [], evals: 0, over: true };
  const EE = axes.map((): number[] => []);
  let evals = 0;
  for (let t = 0; t < r; t++) {
    // a random base point on the grid where x + Δ stays inside, a random order and random directions (Morris 1991 §3)
    const x = axes.map(() => rs.int(floor(p / 2)) / (p - 1)),
      order = rs.shuffle(axes.map((_, i) => i));
    let y0 = safe(fn, scale(x, axes));
    evals++;
    for (const i of order) {
      const up = x[i]! + D <= 1 + 1e-12 && (x[i]! - D < -1e-12 || rs() < 0.5),
        dx = up ? D : -D;
      x[i]! += dx;
      const y1 = safe(fn, scale(x, axes));
      evals++;
      EE[i]!.push((y1 - y0) / dx);
      y0 = y1;
    }
  }
  const mu = EE.map(e => e.reduce((a, b) => a + b, 0) / e.length),
    muStar = EE.map(e => e.reduce((a, b) => a + abs(b), 0) / e.length);
  const sigma = EE.map((e, i) => (e.length > 1 ? sqrt(e.reduce((a, b) => a + (b - mu[i]!) ** 2, 0) / (e.length - 1)) : NaN));
  return { mu, muStar, sigma, evals, over: false };
}
/** Sobol' indices by the Saltelli 2010 scheme: matrices A, B (N × k) and A_B^(i); first order S_i = mean(f(B)(f(A_B^i) − f(A)))/V
      (Saltelli et al. 2010 eq. (b) of Table 2), total S_Ti = mean((f(A) − f(A_B^i))²)/(2V) (Jansen 1999). Cost N(k + 2). The base
      samples are MRG32k3a uniforms (a quasi-random sequence would converge faster; the estimator is unbiased either way).
      → {S1, ST, V, evals, over} */
function sobol(
  axes: readonly Axis[],
  fn: (x: number[]) => unknown,
  o: { readonly N?: number | undefined; readonly seed?: number | undefined; readonly maxEval?: number | undefined } | null,
) {
  const k = axes.length,
    N = (o && o.N) || 256,
    cap = (o && o.maxEval) || 20000,
    rs = stream((o && o.seed) || 1, 'sobol');
  if (N * (k + 2) > cap) return { S1: [], ST: [], V: NaN, evals: 0, over: true };
  const A = [],
    B = [];
  for (let j = 0; j < N; j++) {
    A.push(axes.map(() => rs()));
    B.push(axes.map(() => rs()));
  }
  const fA = A.map(u => safe(fn, scale(u, axes))),
    fB = B.map(u => safe(fn, scale(u, axes)));
  let m = 0;
  for (let j = 0; j < N; j++) m += fA[j]! + fB[j]!;
  m /= 2 * N;
  let V = 0;
  for (let j = 0; j < N; j++) V += (fA[j]! - m) ** 2 + (fB[j]! - m) ** 2;
  V /= 2 * N - 1;
  const S1 = [],
    ST = [];
  for (let i = 0; i < k; i++) {
    let s1 = 0,
      st = 0;
    for (let j = 0; j < N; j++) {
      const u = A[j]!.slice();
      u[i] = B[j]![i]!;
      const f = safe(fn, scale(u, axes));
      s1 += fB[j]! * (f - fA[j]!);
      st += (fA[j]! - f) ** 2;
    }
    S1.push(V > 0 ? s1 / N / V : NaN);
    ST.push(V > 0 ? st / (2 * N) / V : NaN);
  }
  return { S1, ST, V, evals: N * (k + 2), over: false };
}

/* ======================================================================================================================
     Verification helpers (Sargent 2013: verification = the code computes the model right)
     ====================================================================================================================== */
/** richardson(hs, values, exact?) → {p (observed order), extrapolated}: with the exact value p = log(e1/e2)/log(h1/h2) on the last
      two; without it three solutions with a constant ratio r give p = log((f1 − f2)/(f2 − f3))/log r (Richardson 1911; Roache 1998) */
function richardson(hs: readonly number[], f: readonly number[], exact?: number | null) {
  const n = hs.length;
  if (n < 2 || f.length !== n) return { p: NaN, extrapolated: NaN };
  if (exact != null && fin(exact)) {
    const e1 = abs(f[n - 2]! - exact),
      e2 = abs(f[n - 1]! - exact),
      p = log(e1 / e2) / log(hs[n - 2]! / hs[n - 1]!);
    return { p, extrapolated: f[n - 1]! + (f[n - 1]! - f[n - 2]!) / (pow(hs[n - 2]! / hs[n - 1]!, p) - 1) };
  }
  if (n < 3) return { p: NaN, extrapolated: NaN };
  const r = hs[n - 3]! / hs[n - 2]!,
    p = log(abs((f[n - 3]! - f[n - 2]!) / (f[n - 2]! - f[n - 1]!))) / log(r);
  return { p, extrapolated: f[n - 1]! + (f[n - 1]! - f[n - 2]!) / (pow(r, p) - 1) };
}
/** conservation(series, tol) → {drift (max |x − x0| / max(1, |x0|)), ok} */
function conservation(x: readonly number[] | null, tol: number) {
  if (!x || !x.length) return { drift: NaN, ok: false };
  const a = x[0]!,
    sc = max(1, abs(a));
  let d = 0;
  for (const v of x) d = max(d, abs(v - a));
  return { drift: d / sc, ok: d / sc <= (tol || 1e-9) };
}
/** deterministic(fn, seed) → true when two runs with the same seed give the same JSON (determinism asserted) */
function deterministic(fn: (seed: number) => unknown, seed: number) {
  try {
    return JSON.stringify(fn(seed)) === JSON.stringify(fn(seed));
  } catch {
    return false;
  }
}
/* units: dimensions over the SI base (m, kg, s, A, K, mol, cd) with the prefixes and the common derived units; a hook the engines
     call to check that a model's quantities agree (BIPM, The International System of Units, 9th ed. 2019) */
const BASE: Readonly<Record<string, readonly number[]>> = {
  m: [1, 0, 0, 0, 0, 0, 0],
  g: [0, 1, 0, 0, 0, 0, 0],
  s: [0, 0, 1, 0, 0, 0, 0],
  A: [0, 0, 0, 1, 0, 0, 0],
  K: [0, 0, 0, 0, 1, 0, 0],
  mol: [0, 0, 0, 0, 0, 1, 0],
  cd: [0, 0, 0, 0, 0, 0, 1],
};
const DERIVED: Readonly<Record<string, readonly [number, string]>> = {
  N: [1, 'kg*m/s^2'],
  J: [1, 'N*m'],
  W: [1, 'J/s'],
  Pa: [1, 'N/m^2'],
  Hz: [1, '1/s'],
  C: [1, 'A*s'],
  V: [1, 'W/A'],
  ohm: [1, 'V/A'],
  L: [1e-3, 'm^3'],
  min: [60, 's'],
  h: [3600, 's'],
  d: [86400, 's'],
  wk: [604800, 's'],
  yr: [31557600, 's'],
  bar: [1e5, 'Pa'],
  t: [1000, 'kg'],
  ha: [1e4, 'm^2'],
  cal: [4.184, 'J'],
  eV: [1.602176634e-19, 'J'],
  mmHg: [133.322387415, 'Pa'],
  percent: [0.01, '1'],
};
const PREFIX: Readonly<Record<string, number>> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};
function unitAtom(a: string, depth: number): { f: number; d: number[] } | null {
  if (a === '1' || a === '') return { f: 1, d: [0, 0, 0, 0, 0, 0, 0] };
  if (BASE[a]) return { f: a === 'g' ? 1e-3 : 1, d: BASE[a].slice() };
  if (DERIVED[a]) {
    const u = dim(DERIVED[a][1], depth + 1);
    return u.ok ? { f: u.f * DERIVED[a][0], d: u.d } : null;
  }
  for (const p of Object.keys(PREFIX).sort((x, y) => y.length - x.length))
    if (a.startsWith(p) && a.length > p.length) {
      const rest = a.slice(p.length);
      const u = unitAtom(rest, depth);
      if (u && (BASE[rest] || DERIVED[rest])) return { f: u.f * PREFIX[p]!, d: u.d };
    }
  return null;
}
/** dim(unit) → {ok, f (factor to SI), d (exponents of m, kg, s, A, K, mol, cd)}: "kg*m/s^2", "mmol/L", "1/min", "km/h" */
function dim(u: unknown, depth?: number): { ok: boolean; f: number; d: number[] } {
  if (typeof u !== 'string' || (depth || 0) > 6) return { ok: false, f: NaN, d: [] };
  const s = u.replace(/\s+/g, '');
  if (s === '' || s === '1') return { ok: true, f: 1, d: [0, 0, 0, 0, 0, 0, 0] };
  let f = 1;
  const d = [0, 0, 0, 0, 0, 0, 0];
  const parts = s.split('/');
  if (parts.length > 2) return { ok: false, f: NaN, d: [] };
  for (let pi = 0; pi < parts.length; pi++)
    for (const tok of parts[pi]!.split('*')) {
      const m = /^([A-Za-zµ%]+|1)(\^(-?\d+))?$/.exec(tok === '%' ? 'percent' : tok);
      if (!m) return { ok: false, f: NaN, d: [] };
      const a = unitAtom(m[1]!, depth || 0);
      if (!a) return { ok: false, f: NaN, d: [] };
      const e = (m[3] ? +m[3] : 1) * (pi ? -1 : 1);
      f *= pow(a.f, e);
      for (let i = 0; i < 7; i++) d[i]! += a.d[i]! * e;
    }
  return { ok: true, f, d };
}
const sameDim = (a: unknown, b: unknown) => {
  const x = dim(a),
    y = dim(b);
  return x.ok && y.ok && x.d.every((v, i) => v === y.d[i]);
};
/** convert(v, from, to) → v in `to`; NaN when the dimensions differ (code it as 'units') */
function convert(v: number, from: unknown, to: unknown) {
  const x = dim(from),
    y = dim(to);
  return x.ok && y.ok && x.d.every((q, i) => q === y.d[i]) ? (v * x.f) / y.f : NaN;
}
const TIME_UNITS = ['ms', 's', 'min', 'h', 'd', 'wk', 'yr'];

/* ======================================================================================================================
     Delay equations, stochastic kinetics and SDEs
     ====================================================================================================================== */
/** dde({f(t, y, lag, dy) (lag(i, k) → y_i(t − τ_k)), y0, history(t) → array, lags: [τ…], …integrate's cfg (t0, tEnd, method —
      fixed ones with dt ≤ the smallest lag —, rtol, atol, events, breaks, samples, onSample, onSegment, maxSteps)}) — constant-lag
      delay equations by the method of steps (Bellen & Zennaro 2003 ch. 3; Shampine & Thompson 2001): integrate() with
      h ≤ the smallest lag, so every lagged value lies on a finished step (kept through onSegment) or in the history; the
      derivative jumps that the start propagates, at t0 + m·τ (m ≤ 5, the order of DOPRI5), are breaks the steps land on
      (discontinuity tracking, Bellen & Zennaro §4.1) → integrate's result */
function dde(cfg: DdeConfig | null) {
  const lags = Array.isArray(cfg && cfg.lags) ? cfg!.lags!.filter(v => v > 0 && fin(v)) : [];
  const y0 = cfg && cfg.y0 ? Array.from(cfg.y0) : [],
    n = y0.length,
    t0 = fin(cfg && cfg.t0) ? cfg!.t0! : 0;
  const badCfg = () => {
    const C = codes(['bad-config']);
    C.code('bad-config');
    return { t: t0, y: y0, steps: 0, rejected: 0, nfev: 0, events: [], stop: 'bad-config', method: cfg && cfg.method, codes: C.list };
  };
  if (!cfg || typeof cfg.f !== 'function' || !n || !lags.length || !fin(cfg.tEnd) || !(cfg.tEnd > t0)) return badCfg();
  const tauMin = min(...lags);
  if (FIXED.includes(cfg.method!) && !(cfg.dt! > 0 && cfg.dt! <= tauMin)) return badCfg();
  const hist = typeof cfg.history === 'function' ? cfg.history : () => y0;
  const segs: { t0: number; t1: number; seg: Seg }[] = [],
    tmp = new Float64Array(n);
  // finished steps: {t0, t1, seg}
  const lagVal = (tq: number, i: number) => {
    if (tq <= t0) {
      const h = hist(tq);
      return h[i]!;
    }
    let lo = 0,
      hi = segs.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (segs[m]!.t1 < tq) lo = m + 1;
      else hi = m;
    }
    const sg = segs[lo];
    if (!sg) return NaN;
    sg.seg(min(tq, sg.t1), tmp);
    return tmp[i]!;
  };
  const f = (t: number, y: Float64Array, dy: Float64Array) => {
    cfg.f!(t, y, (i, k) => lagVal(t - lags[k || 0]!, i), dy);
  };
  const breaks: Break[] = Array.isArray(cfg.breaks) ? (cfg.breaks as readonly Break[]).slice() : [];
  const seen = new Set();
  for (const tau of lags)
    for (let m = 1; m <= 5; m++) {
      const tb = t0 + m * tau;
      if (tb < cfg.tEnd && !seen.has(tb)) {
        seen.add(tb);
        breaks.push({ t: tb });
      }
    }
  const onSegment = (seg: Seg, a: number, b: number) => {
    if (segs.length < MAX_STEPS) segs.push({ t0: a, t1: b, seg });
    if (typeof cfg.onSegment === 'function') cfg.onSegment(seg, a, b);
  };
  return integrate({
    ...cfg,
    f,
    t0,
    hmax: min(cfg.hmax! > 0 ? cfg.hmax! : Infinity, tauMin),
    method: cfg.method || 'dopri5',
    breaks,
    onSegment,
  });
}
/** dae({f(t, y, z, dy), g(t, y, z, res), y0, z0, …integrate's cfg}) — a semi-explicit index-1 DAE y' = f(t, y, z), 0 = g(t, y, z)
      in its state-space form (Hairer & Wanner, Solving ODEs II, 2nd ed. 1996, §VI.1): at every evaluation the algebraic z is
      solved from g = 0 by Newton (a finite-difference Jacobian, from the last z; ≤ 30 iterations, code 'dae-newton'), then y is
      integrated by integrate() — 'auto' switches to Rosenbrock when the reduced system is stiff. → integrate's result + {z} */
function dae(cfg: DaeConfig | null) {
  const ny = cfg && cfg.y0 ? cfg.y0.length : 0,
    nz = cfg && cfg.z0 ? cfg.z0.length : 0;
  if (!cfg || typeof cfg.f !== 'function' || typeof cfg.g !== 'function' || !ny || !nz) return { ...integrate(null), z: [] };
  const z = Float64Array.from(cfg.z0!),
    res = new Float64Array(nz),
    res2 = new Float64Array(nz),
    Jz = new Float64Array(nz * nz),
    piv = new Int32Array(nz),
    dz = new Float64Array(nz);
  let newtonFail = false as boolean;
  const solveZ = (t: number, y: Float64Array) => {
    for (let it = 0; it < 30; it++) {
      cfg.g!(t, y, z, res);
      let nr = 0;
      for (let i = 0; i < nz; i++) nr = max(nr, abs(res[i]!));
      if (nr <= 1e-12 * (1 + max(...Array.from(z, abs)))) return true;
      for (let j = 0; j < nz; j++) {
        const zj = z[j]!,
          d = 1.4901161193847656e-8 * max(1, abs(zj));
        z[j] = zj + d;
        cfg.g!(t, y, z, res2);
        z[j] = zj;
        for (let i = 0; i < nz; i++) Jz[i * nz + j] = (res2[i]! - res[i]!) / d;
      }
      if (!luFactor(Jz, nz, piv)) return false;
      for (let i = 0; i < nz; i++) dz[i] = -res[i]!;
      luSolve(Jz, nz, piv, dz);
      for (let i = 0; i < nz; i++) z[i]! += dz[i]!;
    }
    cfg.g!(t, y, z, res);
    let nr = 0;
    for (let i = 0; i < nz; i++) nr = max(nr, abs(res[i]!));
    return nr <= 1e-8 * (1 + max(...Array.from(z, abs)));
  };
  const f = (t: number, y: Float64Array, dy: Float64Array) => {
    if (!solveZ(t, y)) {
      newtonFail = true;
      for (let i = 0; i < ny; i++) dy[i] = NaN;
      return;
    }
    cfg.f!(t, y, z, dy);
  };
  const r = integrate({ ...cfg, f });
  if (newtonFail) r.codes.push({ code: 'dae-newton', level: 'error' });
  solveZ(r.t, Float64Array.from(r.y));
  return { ...r, z: Array.from(z) };
}
/** daeTheta({M, f(t, y, r), y0, t0, tEnd, dt, method: 'trapezoidal' | 'backward-euler', theta?, jac?(t, y, J), linear?, beforeStep?,
      limit?, consistent?, newtonTol, maxNewton, breaks, samples, onSample, onStep, maxSteps}) — M·y′ = f(t, y), a semi-explicit
      index-1 DAE whose algebraic rows are the zero rows of M (nodes without capacity: thermal networks, circuit nodes). M is a
      diagonal (an array of numbers) or a full matrix (an array of rows: a floating capacitor puts C at (a, a), (c, c) and −C at (a, c)).
      A row with M_i ≠ 0 takes the θ-method (M(y₁ − y₀))_i = h(θ f_i(t₁, y₁) + (1 − θ) f_i(t₀, y₀)) (θ = ½ trapezoidal, A-stable, order 2;
      θ = 1 backward Euler, L-stable, order 1: the two transient methods of SPICE, Nagel 1975 §4); an algebraic row holds at the new
      time, f_i(t₁, y₁) = 0 (so the trapezoidal rule does not ring on it: Brenan, Campbell & Petzold 1996 §3.1).
      Each step is solved by Newton with the Jacobian of f (cfg.jac fills J row-major, or forward differences) and LU with pivoting;
      cfg.limit(yOld, yNew) → true may limit a Newton update in place (SPICE's pnjlim) and forces one more iteration. A step whose
      Newton fails is halved (≤ 20 times, then the error 'newton'). linear: true — f affine in y with a constant J (from jac or
      differences at the start): M − hθJ is factored once per (h, θ) and each step is one solve and one f, no iteration.
      beforeStep(t0, t1, y) → {theta?} runs before each step (and each halved retry): it may set the step's inputs (a closure) and
      pick θ for that step only; f(t0, y) is then evaluated again. Fixed steps dt, landing exactly on breaks [{t, apply?(t, y)}] and on
      tEnd; consistent: true first solves the algebraic rows at t0 with the others held (and again after each break). Samples are
      interpolated linearly. → {t, y, steps, newton (iterations), nfev, stop, codes} */
function daeTheta(cfg: DaeThetaConfig) {
  const S2 = daeThetaInit(cfg);
  return S2.ok ? S2.advance(cfg.tEnd!) : S2.result;
}
/** daeThetaInit(cfg) → {ok, advance(T) → the result at T (call again to go on: the factorisation, F₀ and the work arrays are kept),
      t, y, result}: the resumable form for a stepper (cfg.tEnd only bounds the breaks; advance takes the horizon) */
function daeThetaInit(cfg: DaeThetaConfig | null) {
  const C = codes(['nan', 'newton', 'budget', 'bad-config']);
  const y0 = cfg && cfg.y0 ? Float64Array.from(cfg.y0) : null,
    n = y0 ? y0.length : 0,
    t0 = cfg && fin(cfg.t0) ? cfg.t0 : 0,
    tEnd = cfg && cfg.tEnd;
  const st = { steps: 0, newton: 0, nfev: 0 };
  const done0 = (t: number, y: Nums | null, stop: string) => ({
    t,
    y: y ? Array.from(y) : [],
    steps: st.steps,
    newton: st.newton,
    nfev: st.nfev,
    stop,
    codes: C.list,
  });
  const fail0 = (r: DaeThetaResult) => ({ ok: false, result: r, advance: () => r, t: r.t, y: r.y });
  const done = (t: number, y: Nums | null, stop: string) => fail0(done0(t, y, stop));
  if (!cfg || typeof cfg.f !== 'function' || !n || !(cfg.dt! > 0) || (cfg.tEnd != null && !(cfg.tEnd >= t0))) {
    C.code('bad-config');
    return done(t0, y0, 'bad-config');
  }
  // M: a diagonal or a full n × n matrix (row-major internally); a row of zeros is algebraic
  const Mf = new Float64Array(n * n),
    alg = new Uint8Array(n);
  if (cfg.M == null) for (let i = 0; i < n; i++) Mf[i * n + i] = 1;
  else if (
    (Array.isArray(cfg.M) || ArrayBuffer.isView(cfg.M)) &&
    cfg.M.length === n &&
    Array.from(cfg.M).every(v => typeof v === 'number' && fin(v))
  )
    for (let i = 0; i < n; i++) Mf[i * n + i] = (cfg.M as Nums)[i]!;
  else if (
    Array.isArray(cfg.M) &&
    cfg.M.length === n &&
    cfg.M.every(r => (Array.isArray(r) || ArrayBuffer.isView(r)) && (r as Nums).length === n && Array.from(r as Nums).every(fin))
  ) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Mf[i * n + j] = (cfg.M as readonly Nums[])[i]![j]!;
  } else {
    C.code('bad-config');
    return done(t0, y0, 'bad-config');
  }
  let nAlg = 0;
  for (let i = 0; i < n; i++) {
    let z = true;
    for (let j = 0; j < n; j++)
      if (Mf[i * n + j] !== 0) {
        z = false;
        break;
      }
    alg[i] = z ? 1 : 0;
    nAlg += alg[i]!;
  }
  const th0 = fin(cfg.theta) && cfg.theta >= 0.5 && cfg.theta <= 1 ? cfg.theta : cfg.method === 'backward-euler' ? 1 : 0.5;
  const tolN = cfg.newtonTol! > 0 ? cfg.newtonTol! : 1e-10,
    maxN = fin(cfg.maxNewton) ? max(2, min(cfg.maxNewton, 100)) : 25;
  const maxSteps = fin(cfg.maxSteps) ? min(cfg.maxSteps, MAX_STEPS) : MAX_STEPS,
    linear = !!cfg.linear,
    limit = typeof cfg.limit === 'function' ? cfg.limit : null,
    before = typeof cfg.beforeStep === 'function' ? cfg.beforeStep : null;
  const J = new Float64Array(n * n),
    G = new Float64Array(n * n),
    piv = new Int32Array(n),
    F0 = new Float64Array(n),
    F1 = new Float64Array(n),
    R = new Float64Array(n),
    fx = new Float64Array(n),
    dy = new Float64Array(n),
    yOld = limit ? new Float64Array(n) : null;
  const f = (t: number, y: Float64Array, out: Float64Array) => {
    cfg.f!(t, y, out);
    st.nfev++;
  };
  const jac = (t: number, y: Float64Array, Fy: Float64Array) => {
    if (typeof cfg.jac === 'function') {
      J.fill(0);
      cfg.jac(t, y, J);
      return;
    }
    // forward differences; for an affine f any step is exact, and a large one keeps the rounding out
    for (let j = 0; j < n; j++) {
      const yj = y[j]!,
        del = (linear ? 9.765625e-4 : 1.4901161193847656e-8) * max(abs(yj), 1);
      y[j] = yj + del;
      f(t, y, fx);
      y[j] = yj;
      for (let i = 0; i < n; i++) J[i * n + j] = (fx[i]! - Fy[i]!) / del;
    }
  };
  // the step's residual and matrix: rows of M(y₁ − y₀) − h(θF₁ + (1 − θ)F₀), algebraic rows F₁
  let hS = 0,
    thS = 0.5;
  const yb = new Float64Array(n);
  const residStep = (F: Float64Array, yy: Float64Array) => {
    for (let i = 0; i < n; i++) {
      if (alg[i]) {
        R[i] = F[i]!;
        continue;
      }
      let m = 0;
      for (let j = 0; j < n; j++) m += Mf[i * n + j]! * (yy[j]! - yb[j]!);
      R[i] = m - hS * (thS * F[i]! + (1 - thS) * F0[i]!);
    }
  };
  const matStep = () => {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) G[i * n + j] = alg[i] ? J[i * n + j]! : Mf[i * n + j]! - hS * thS * J[i * n + j]!;
  };
  const residCons = (F: Float64Array) => {
    for (let i = 0; i < n; i++) R[i] = alg[i] ? F[i]! : 0;
  };
  const matCons = () => {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i * n + j] = alg[i] ? J[i * n + j]! : i === j ? 1 : 0;
  };
  // Newton on R(y) = 0 (y changed in place) → true when converged; F1 = f(t, y) at the end
  const newton = (t: number, y: Float64Array, resid: (F: Float64Array, y: Float64Array) => void, gm: () => void) => {
    for (let it = 0; it < maxN; it++) {
      f(t, y, F1);
      if (!F1.every(fin)) return false;
      resid(F1, y);
      jac(t, y, F1);
      gm();
      if (!luFactor(G, n, piv)) return false;
      for (let i = 0; i < n; i++) dy[i] = -R[i]!;
      luSolve(G, n, piv, dy);
      st.newton++;
      if (yOld) yOld.set(y);
      let e = 0;
      for (let i = 0; i < n; i++) {
        y[i]! += dy[i]!;
        e = max(e, abs(dy[i]!) / (1 + abs(y[i]!)));
      }
      const limited = limit ? !!limit(yOld, y) : false;
      if (!y.every(fin)) return false;
      if (e <= tolN && !limited) {
        f(t, y, F1);
        return F1.every(fin);
      }
    }
    return false;
  };
  // linear mode: J once; M − hθJ factored once per (h, θ)
  let linKey = '',
    linOK = false;
  const GL = linear ? new Float64Array(n * n) : null,
    pivL = linear ? new Int32Array(n) : null;
  let t = t0;
  const y = Float64Array.from(y0!),
    yn = new Float64Array(n),
    yprev = new Float64Array(n),
    tmp = new Float64Array(n);
  const brk =
    Array.isArray(cfg.breaks) && cfg.breaks.length
      ? (cfg.breaks as readonly (Break | null)[])
          .filter((b): b is Break => !!b && fin(b.t) && b.t >= t0 && !(b.t > tEnd!))
          .slice()
          .sort((a2, b2) => a2.t - b2.t)
      : [];
  let bi = 0;
  const applyBreaks = () => {
    while (bi < brk.length && brk[bi]!.t <= t + 1e-14 * max(1, abs(t))) {
      const b2 = brk[bi++]!;
      if (typeof b2.apply === 'function') b2.apply(t, y);
    }
  };
  const consistent = () => (nAlg ? newton(t, y, residCons, matCons) : true);
  if (brk.length) applyBreaks();
  if (cfg.consistent && !consistent()) {
    C.code('newton', t);
    return done(t, y, 'newton');
  }
  if (!y.every(fin)) {
    C.code('nan', t);
    return done(t, y, 'nan');
  }
  f(t, y, F0);
  if (linear) {
    jac(t, y, F0);
    if (!J.every(fin)) {
      C.code('nan', t);
      return done(t, y, 'nan');
    }
  }
  const samples = cfg.samples || [];
  let si = 0;
  while (si < samples.length && samples[si]! <= t) {
    if (cfg.onSample) cfg.onSample(samples[si]!, y);
    si++;
  }
  let dead: ReturnType<typeof run> | null = null;
  const advance = (T: number) => {
    if (dead) return dead;
    const r = run(T);
    if (r.stop !== 'end') dead = r;
    return r;
  };
  const run = (tEnd: number) => {
    const done = (t2: number, y2: Nums | null, stop: string) => done0(t2, y2, stop);
    if (!fin(tEnd)) {
      C.code('bad-config');
      return done(t, y, 'bad-config');
    }
    for (;;) {
      if (t >= tEnd - 1e-14 * max(1, abs(tEnd))) return done(t, y, 'end');
      if (st.steps >= maxSteps) {
        C.code('budget', t);
        return done(t, y, 'budget');
      }
      const target = bi < brk.length ? min(tEnd, brk[bi]!.t) : tEnd;
      let h = min(cfg.dt!, target - t),
        ok2 = false;
      if (target - t - h <= 1e-12 * max(1, abs(target))) h = target - t;
      for (let halv = 0; halv <= 20; halv++) {
        const t1 = h === target - t ? target : t + h;
        hS = h;
        thS = th0;
        if (before) {
          const o2 = before(t, t1, y);
          if (o2 && fin(o2.theta) && o2.theta >= 0.5 && o2.theta <= 1) thS = o2.theta;
          f(t, y, F0);
        }
        yb.set(y);
        yn.set(y);
        if (linear) {
          // one solve: G·Δ = −R(y₀) with G = M − hθJ (algebraic rows J); F₁ = F(y₀ at t₁) + JΔ (exact for affine f)
          const key = `${hS}|${thS}`;
          if (key !== linKey) {
            for (let i = 0; i < n; i++)
              for (let j = 0; j < n; j++) GL![i * n + j] = alg[i] ? J[i * n + j]! : Mf[i * n + j]! - hS * thS * J[i * n + j]!;
            linOK = luFactor(GL!, n, pivL!);
            linKey = key;
          }
          if (linOK) {
            f(t1, yn, F1);
            if (F1.every(fin)) {
              residStep(F1, yn);
              for (let i = 0; i < n; i++) dy[i] = -R[i]!;
              luSolve(GL!, n, pivL!, dy);
              for (let i = 0; i < n; i++) yn[i]! += dy[i]!;
              for (let i = 0; i < n; i++) {
                let v = F1[i]!;
                for (let j = 0; j < n; j++) v += J[i * n + j]! * dy[j]!;
                F1[i] = v;
              }
              ok2 = yn.every(fin) && F1.every(fin);
              st.newton++;
            }
          }
        } else ok2 = newton(t1, yn, residStep, matStep);
        if (ok2) {
          yprev.set(y);
          const ta = t;
          t = t1;
          y.set(yn);
          F0.set(F1);
          st.steps++;
          while (si < samples.length && samples[si]! <= t) {
            const s2 = (samples[si]! - ta) / (t - ta);
            for (let i = 0; i < n; i++) tmp[i] = yprev[i]! + s2 * (y[i]! - yprev[i]!);
            if (cfg.onSample) cfg.onSample(samples[si]!, tmp);
            si++;
          }
          if (cfg.onStep) cfg.onStep(t, y);
          break;
        }
        if (linear && linOK) break; // an affine step cannot be helped by a smaller h (NaN from f)
        h /= 2;
      }
      if (!ok2) {
        C.code(linear ? 'nan' : 'newton', t);
        return done(t, y, linear ? 'nan' : 'newton');
      }
      if (bi < brk.length && brk[bi]!.t <= t + 1e-14 * max(1, abs(t))) {
        applyBreaks();
        if (cfg.consistent !== false && nAlg && !consistent()) {
          C.code('newton', t);
          return done(t, y, 'newton');
        }
        if (!y.every(fin)) {
          C.code('nan', t);
          return done(t, y, 'nan');
        }
        f(t, y, F0);
      }
    }
  };
  return {
    ok: true,
    advance,
    get t() {
      return t;
    },
    get y() {
      return Array.from(y);
    },
    result: null,
  };
}
/** ssa({x0, nu: [[Δ per species] per reaction], propensity(x, a) (fills a), tEnd, r (a stream), maxEvents, onEvent(t, x, j)})
      — Gillespie's direct method (Gillespie 1977, J. Phys. Chem. 81:25): exact trajectories of the chemical master equation
      → {t, x, events, stop, codes} */
function ssa(cfg: SsaConfig | null) {
  const C = codes(['budget', 'bad-config', 'nan']);
  if (!cfg || !Array.isArray(cfg.x0) || !Array.isArray(cfg.nu) || typeof cfg.propensity !== 'function' || !fin(cfg.tEnd)) {
    C.code('bad-config');
    return { t: 0, x: [], events: 0, stop: 'bad-config', codes: C.list };
  }
  const x = cfg.x0.slice(),
    m = cfg.nu.length,
    a = new Float64Array(m),
    r = cfg.r || stream(1, 'ssa');
  let t = fin(cfg.t0) ? cfg.t0 : 0,
    ev = 0;
  const cap = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : MAX_EVENTS;
  for (;;) {
    cfg.propensity(x, a);
    let a0 = 0;
    for (let j = 0; j < m; j++) {
      if (!(a[j]! >= 0)) {
        C.code('nan', t);
        return { t, x, events: ev, stop: 'nan', codes: C.list };
      }
      a0 += a[j]!;
    }
    if (a0 <= 0) return { t: cfg.tEnd, x, events: ev, stop: 'extinct', codes: C.list };
    const tau = -log(r()) / a0;
    if (t + tau > cfg.tEnd) return { t: cfg.tEnd, x, events: ev, stop: 'end', codes: C.list };
    if (ev >= cap) {
      C.code('budget', t);
      return { t, x, events: ev, stop: 'budget', codes: C.list };
    }
    t += tau;
    const u = r() * a0;
    let c = 0,
      j = 0;
    for (; j < m - 1; j++) {
      c += a[j]!;
      if (u < c) break;
    }
    const nu = (cfg.nu as Mat)[j]!;
    for (let i = 0; i < x.length; i++) x[i]! += nu[i] || 0;
    ev++;
    if (cfg.onEvent) cfg.onEvent(t, x, j);
  }
}
/** tauLeap({…ssa, tau}) — explicit τ-leaping (Gillespie 2001, J. Chem. Phys. 115:4): each reaction fires Poisson(a_j τ) times in
      a leap; a leap that would make a count negative is halved and retried (≤ 30 times), and when a0·τ < 10 the exact SSA step
      is taken instead (Cao, Gillespie & Petzold 2006, J. Chem. Phys. 124: the switch to SSA). → {t, x, leaps, stop, codes} */
function tauLeap(cfg: SsaConfig | null) {
  const C = codes(['budget', 'bad-config', 'nan']);
  if (
    !cfg ||
    !Array.isArray(cfg.x0) ||
    !Array.isArray(cfg.nu) ||
    typeof cfg.propensity !== 'function' ||
    !fin(cfg.tEnd) ||
    !(cfg.tau! > 0)
  ) {
    C.code('bad-config');
    return { t: 0, x: [], leaps: 0, stop: 'bad-config', codes: C.list };
  }
  const x = cfg.x0.slice(),
    m = cfg.nu.length,
    a = new Float64Array(m),
    r = cfg.r || stream(1, 'tauleap'),
    k = new Array<number>(m);
  let t = fin(cfg.t0) ? cfg.t0 : 0,
    leaps = 0;
  const cap = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : MAX_EVENTS;
  while (t < cfg.tEnd) {
    if (leaps >= cap) {
      C.code('budget', t);
      return { t, x, leaps, stop: 'budget', codes: C.list };
    }
    cfg.propensity(x, a);
    let a0 = 0;
    for (let j = 0; j < m; j++) a0 += a[j]! > 0 ? a[j]! : 0;
    if (!fin(a0)) {
      C.code('nan', t);
      return { t, x, leaps, stop: 'nan', codes: C.list };
    }
    if (a0 <= 0) return { t: cfg.tEnd, x, leaps, stop: 'extinct', codes: C.list };
    let tau = min(cfg.tau!, cfg.tEnd - t);
    if (a0 * tau < 10) {
      // too few firings for a leap: one exact SSA step
      const dt = -log(r()) / a0;
      if (t + dt > cfg.tEnd) {
        t = cfg.tEnd;
        break;
      }
      t += dt;
      const u = r() * a0;
      let c = 0,
        j = 0;
      for (; j < m - 1; j++) {
        c += a[j]!;
        if (u < c) break;
      }
      for (let i = 0; i < x.length; i++) x[i]! += (cfg.nu as Mat)[j]![i] || 0;
      leaps++;
      continue;
    }
    let okLeap = false;
    for (let tries = 0; tries < 30 && !okLeap; tries++) {
      for (let j = 0; j < m; j++) k[j] = a[j]! > 0 ? r.poisson(a[j]! * tau) : 0;
      okLeap = true;
      for (let i = 0; i < x.length; i++) {
        let v = x[i]!;
        for (let j = 0; j < m; j++) v += k[j]! * ((cfg.nu as Mat)[j]![i] || 0);
        if (v < 0) {
          okLeap = false;
          break;
        }
      }
      if (!okLeap) tau /= 2;
    }
    if (!okLeap) {
      C.code('negative', t);
      for (let j = 0; j < m; j++) k[j] = 0;
    }
    for (let i = 0; i < x.length; i++) for (let j = 0; j < m; j++) x[i]! += k[j]! * ((cfg.nu as Mat)[j]![i] || 0);
    t += tau;
    leaps++;
  }
  return { t, x, leaps, stop: 'end', codes: C.list };
}
/** sde({drift(t, x, out), diffusion(t, x, out) (diagonal noise: one Wiener process per state), dsig?(t, x, out) (∂σ_i/∂x_i, for
      Milstein), x0, t0, tEnd, dt, method: 'em' | 'milstein', r, samples, onSample}) — Euler–Maruyama (strong order 0.5) and Milstein
      (strong order 1) for Itô SDEs with diagonal noise (Kloeden & Platen 1992 §10.2, §10.3; Higham 2001, SIAM Review 43:3)
      → {t, x, steps, codes} */
function sde(cfg: SdeConfig | null) {
  const C = codes(['nan', 'budget', 'bad-config']);
  if (
    !cfg ||
    typeof cfg.drift !== 'function' ||
    typeof cfg.diffusion !== 'function' ||
    !Array.isArray(cfg.x0) ||
    !(cfg.dt! > 0) ||
    !fin(cfg.tEnd)
  ) {
    C.code('bad-config');
    return { t: 0, x: [], steps: 0, codes: C.list };
  }
  const n = cfg.x0.length,
    x = Float64Array.from(cfg.x0),
    mu = new Float64Array(n),
    sg = new Float64Array(n),
    ds = new Float64Array(n),
    r = cfg.r || stream(1, 'sde');
  const mil = cfg.method === 'milstein' && typeof cfg.dsig === 'function';
  let t = fin(cfg.t0) ? cfg.t0 : 0,
    steps = 0;
  const N = Math.ceil((cfg.tEnd - t) / cfg.dt! - 1e-9);
  if (N > MAX_STEPS) {
    C.code('budget');
    return { t, x: Array.from(x), steps, codes: C.list };
  }
  const samples = cfg.samples || [];
  let si = 0;
  for (let k = 0; k < N; k++) {
    const h = min(cfg.dt!, cfg.tEnd - t),
      sq = sqrt(h);
    while (si < samples.length && samples[si]! <= t + 1e-12) {
      if (cfg.onSample) cfg.onSample(samples[si]!, x);
      si++;
    }
    cfg.drift(t, x, mu);
    cfg.diffusion(t, x, sg);
    if (mil) cfg.dsig(t, x, ds);
    for (let i = 0; i < n; i++) {
      const dW = sq * normInv(r());
      x[i]! += mu[i]! * h + sg[i]! * dW + (mil ? 0.5 * sg[i]! * ds[i]! * (dW * dW - h) : 0);
    }
    t += h;
    steps++;
    if (!x.every(fin)) {
      C.code('nan', t);
      break;
    }
  }
  while (si < samples.length && samples[si]! <= t + 1e-12) {
    if (cfg.onSample) cfg.onSample(samples[si]!, x);
    si++;
  }
  return { t, x: Array.from(x), steps, codes: C.list };
}

/* ======================================================================================================================
     Arrival schedules: non-homogeneous Poisson processes by thinning (Lewis & Shedler 1979; Law §8.6.2)
     ====================================================================================================================== */
/** nhpp(rate(t), rateMax, t0, tEnd, r, cap) → arrival times of a Poisson process with intensity rate(t) ≤ rateMax */
function nhpp(rate: (t: number) => number, rmax: number, t0: number, tEnd: number, r: Stream, cap: number) {
  const out: number[] = [];
  if (!(rmax > 0)) return out;
  let t = t0;
  const mx = fin(cap) ? cap : MAX_EVENTS;
  for (let i = 0; i < 10 * mx && out.length < mx; i++) {
    t += -log(r()) / rmax;
    if (t > tEnd) break;
    if (r() * rmax <= rate(t)) out.push(t);
  }
  return out;
}
/** piecewise(points [[t, value]…], {period, step}) → v(t): a schedule (rates of a day, staffing) — steps (piecewise constant, the
      default) or linear between the points, repeated every `period` when given */
function piecewise(
  pts: readonly (readonly number[])[] | null,
  o: { readonly step?: boolean | undefined; readonly period?: number | undefined } | null,
) {
  const P = (pts || []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).sort((a, b) => a[0]! - b[0]!),
    lin = o && o.step === false,
    per = o && o.period! > 0 ? o.period! : 0;
  return (t: number) => {
    if (!P.length) return NaN;
    const tt = per ? t - floor(t / per) * per : t;
    if (tt < P[0]![0]!) return per ? P[P.length - 1]![1]! : P[0]![1]!;
    let i = 0;
    while (i + 1 < P.length && P[i + 1]![0]! <= tt) i++;
    if (!lin || i + 1 >= P.length) return P[i]![1]!;
    const [a, va] = P[i]! as readonly [number, number],
      [b, vb] = P[i + 1]! as readonly [number, number];
    return va + ((vb - va) * (tt - a)) / (b - a);
  };
}

/* ======================================================================================================================
     Distributions with cdf and quantile: truncation and mixtures (Law §8.2, §8.3); input modelling: fitting and goodness of fit (Law ch. 6)
     ====================================================================================================================== */
/** cdfOf(d) and quantileOf(d) for the kinds that have them in closed form (exp, uniform, tri, normal, lognormal, weibull; gamma's cdf) */
function cdfOf(d: DistParams) {
  const D = dist(d);
  if (!D.ok) return null;
  switch (d.dist) {
    case 'exp':
      return (x: number) => (x <= 0 ? 0 : 1 - exp(-x / D.mean));
    case 'uniform':
      return (x: number) => (x <= d.min ? 0 : x >= d.max ? 1 : (x - d.min) / (d.max - d.min));
    case 'tri':
      return (x: number) => {
        const a = d.min,
          c = d.mode,
          b = d.max;
        return x <= a ? 0 : x >= b ? 1 : x <= c ? ((x - a) * (x - a)) / ((b - a) * (c - a)) : 1 - ((b - x) * (b - x)) / ((b - a) * (b - c));
      };
    case 'normal':
      return (x: number) => normCdf((x - d.mean) / d.sd);
    case 'lognormal': {
      const s2 = log(1 + (d.sd * d.sd) / (d.mean * d.mean)),
        mu = log(d.mean) - s2 / 2,
        s = sqrt(s2);
      return (x: number) => (x <= 0 ? 0 : normCdf((log(x) - mu) / s));
    }
    case 'weibull':
      return (x: number) => (x <= 0 ? 0 : 1 - exp(-pow(x / d.scale, d.shape)));
    case 'gamma':
    case 'erlang': {
      const k = d.dist === 'erlang' ? d.k : (D.mean * D.mean) / D.var,
        th = D.var / D.mean;
      return (x: number) => (x <= 0 ? 0 : gammaP(k, x / th));
    }
    default:
      return null;
  }
}
function quantileOf(d: DistParams) {
  const D = dist(d);
  if (!D.ok) return null;
  switch (d.dist) {
    case 'exp':
      return (u: number) => -D.mean * log(1 - u);
    case 'uniform':
      return (u: number) => d.min + u * (d.max - d.min);
    case 'tri':
      return (u: number) => {
        const a = d.min,
          c = d.mode,
          b = d.max,
          F = (c - a) / (b - a);
        return u < F ? a + sqrt(u * (b - a) * (c - a)) : b - sqrt((1 - u) * (b - a) * (b - c));
      };
    case 'normal':
      return (u: number) => d.mean + d.sd * normInv(u);
    case 'lognormal': {
      const s2 = log(1 + (d.sd * d.sd) / (d.mean * d.mean)),
        mu = log(d.mean) - s2 / 2,
        s = sqrt(s2);
      return (u: number) => exp(mu + s * normInv(u));
    }
    case 'weibull':
      return (u: number) => d.scale * pow(-log(1 - u), 1 / d.shape);
    default:
      return null;
  }
}
/** truncated(d, lo, hi) → {ok, draw(r), mean (estimated), exact}: by inversion on [F(lo), F(hi)] where the quantile is known
      (one uniform, CRN-friendly: Law §8.2.1), else by rejection (≤ 1000 tries, then the nearer bound and the code 'truncation') */
function truncated(d: unknown, lo: number, hi: number) {
  const D = dist(d),
    a = fin(lo) ? lo : -Infinity,
    b = fin(hi) ? hi : Infinity;
  if (!D.ok || !(b > a)) return { ok: false, draw: () => NaN, exact: false };
  const F = cdfOf(d as DistParams),
    Q = quantileOf(d as DistParams);
  if (F && Q) {
    const Fa = a === -Infinity ? 0 : F(a),
      Fb = b === Infinity ? 1 : F(b);
    if (!(Fb > Fa)) return { ok: false, draw: () => NaN, exact: true };
    return { ok: true, exact: true, draw: (r: Stream) => min(b, max(a, Q(Fa + (Fb - Fa) * r()))) };
  }
  return {
    ok: true,
    exact: false,
    draw: (r: Stream) => {
      for (let i = 0; i < 1000; i++) {
        const x = D.draw(r);
        if (x >= a && x <= b) return x;
      }
      return fin(b) ? b : a;
    },
  };
}
/** mixture([{d, w}…]) → {ok, draw(r), mean, var}: a finite mixture (Law §8.2.3, composition) */
function mixture(parts: readonly { readonly d: unknown; readonly w: number }[] | null) {
  const P = (parts || []).map(p => ({ D: dist(p.d), w: p.w > 0 ? p.w : 0 })).filter(p => p.D.ok && p.w > 0),
    W = P.reduce((s, p) => s + p.w, 0);
  if (!P.length || !(W > 0)) return { ok: false, draw: () => NaN, mean: NaN, var: NaN };
  const mean = P.reduce((s, p) => s + (p.w / W) * p.D.mean, 0),
    m2 = P.reduce((s, p) => s + (p.w / W) * (p.D.var + p.D.mean * p.D.mean), 0);
  const ws = P.map(p => p.w);
  return { ok: true, mean, var: m2 - mean * mean, draw: (r: Stream) => P[r.discrete(ws)]!.D.draw(r) };
}
function digamma(x: number) {
  let r = 0;
  while (x < 12) {
    r -= 1 / x;
    x += 1;
  }
  const f = 1 / (x * x);
  return r + log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}
function trigamma(x: number) {
  let r = 0;
  while (x < 12) {
    r += 1 / (x * x);
    x += 1;
  }
  const f = 1 / (x * x);
  return r + 1 / x + f / 2 + (f / x) * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30)));
}
/** fit(data, kind) → a distribution object {dist, …} fitted by maximum likelihood (exp, normal, lognormal, gamma by Newton on
      ψ(k) − ln k = mean(ln x) − ln x̄ (Choi & Wette 1969), weibull by Newton on the profile equation (Law §6.5)), or by moments
      (uniform, tri by min/max/mode-from-mean, erlang, beta on [0, 1]); null when it cannot be fitted */
function fit(data: readonly number[] | null, kind: string) {
  const x = (data || []).filter(fin);
  const n = x.length;
  if (n < 2) return null;
  let m = 0;
  for (const v of x) m += v;
  m /= n;
  let v2 = 0;
  for (const v of x) v2 += (v - m) * (v - m);
  const vmle = v2 / n,
    sd = sqrt(v2 / (n - 1));
  const pos = x.every(v => v > 0);
  switch (kind) {
    case 'exp':
      return pos ? { dist: 'exp', mean: m } : null;
    case 'normal':
      return { dist: 'normal', mean: m, sd: sqrt(vmle) };
    case 'lognormal': {
      if (!pos) return null;
      let ml = 0;
      for (const v of x) ml += log(v);
      ml /= n;
      let s2 = 0;
      for (const v of x) s2 += (log(v) - ml) ** 2;
      s2 /= n;
      const mean = exp(ml + s2 / 2);
      return { dist: 'lognormal', mean, sd: mean * sqrt(exp(s2) - 1) };
    }
    case 'gamma': {
      if (!pos) return null;
      let ml = 0;
      for (const v of x) ml += log(v);
      ml /= n;
      const s = log(m) - ml;
      if (!(s > 0)) return null;
      let k = (3 - s + sqrt((s - 3) * (s - 3) + 24 * s)) / (12 * s); // Minka 2002's start
      for (let i = 0; i < 50; i++) {
        const g = log(k) - digamma(k) - s,
          dg = 1 / k - trigamma(k),
          kn = k - g / dg;
        if (!(kn > 0)) break;
        if (abs(kn - k) < 1e-12 * k) {
          k = kn;
          break;
        }
        k = kn;
      }
      return { dist: 'gamma', shape: k, scale: m / k };
    }
    case 'weibull': {
      if (!pos) return null;
      const lx = x.map(v => log(v));
      let ml = 0;
      for (const v of lx) ml += v;
      ml /= n;
      let k = 1.2 / (sd / m || 1);
      for (let i = 0; i < 100; i++) {
        let A = 0,
          B = 0,
          Cc = 0;
        for (let j = 0; j < n; j++) {
          const p = pow(x[j]!, k);
          A += p;
          B += p * lx[j]!;
          Cc += p * lx[j]! * lx[j]!;
        }
        const g = B / A - 1 / k - ml,
          dg = Cc / A - (B / A) * (B / A) + 1 / (k * k),
          kn = k - g / dg;
        if (!(kn > 0)) {
          k = k / 2;
          continue;
        }
        if (abs(kn - k) < 1e-12 * k) {
          k = kn;
          break;
        }
        k = kn;
      }
      let A = 0;
      for (const v of x) A += pow(v, k);
      return { dist: 'weibull', shape: k, scale: pow(A / n, 1 / k) };
    }
    case 'uniform': {
      let lo = Infinity,
        hi = -Infinity;
      for (const v of x) {
        lo = min(lo, v);
        hi = max(hi, v);
      }
      const w = (hi - lo) / (n - 1);
      return { dist: 'uniform', min: max(0, lo - w), max: hi + w };
    } // the unbiased ends
    case 'tri': {
      let lo = Infinity,
        hi = -Infinity;
      for (const v of x) {
        lo = min(lo, v);
        hi = max(hi, v);
      }
      const c = min(hi, max(lo, 3 * m - lo - hi));
      return { dist: 'tri', min: lo, mode: c, max: hi };
    }
    case 'erlang': {
      const k = max(1, min(64, Math.round((m * m) / (v2 / (n - 1)))));
      return { dist: 'erlang', k, mean: m };
    }
    case 'beta': {
      if (!x.every(v => v > 0 && v < 1)) return null;
      const vv = v2 / (n - 1),
        c = (m * (1 - m)) / vv - 1;
      return c > 0 ? { dist: 'beta', a: m * c, b: (1 - m) * c } : null;
    }
    default:
      return null;
  }
}
/** ksTest(data, d) → {D, p}: Kolmogorov–Smirnov with the asymptotic Kolmogorov distribution and Stephens' (1970) small-sample
      correction √n + 0.12 + 0.11/√n (all parameters known; with fitted ones p is conservative: Law §6.6.2) */
function ksTest(data: readonly number[] | null, d: DistParams) {
  const F = cdfOf(d),
    x = (data || []).filter(fin).sort((a, b) => a - b),
    n = x.length;
  if (!F || !n) return { D: NaN, p: NaN };
  let D = 0;
  for (let i = 0; i < n; i++) {
    const f = F(x[i]!);
    D = max(D, (i + 1) / n - f, f - i / n);
  }
  const lam = (sqrt(n) + 0.12 + 0.11 / sqrt(n)) * D;
  let p = 0;
  for (let j = 1; j <= 100; j++) p += 2 * (j % 2 ? 1 : -1) * exp(-2 * j * j * lam * lam);
  return { D, p: min(1, max(0, lam < 0.2 ? 1 : p)) };
}
/** chiSquare(observed, expected, fitted = 0) → {X2, df, p}: Pearson's test, df = k − 1 − fitted (Law §6.6.2) */
function chiSquare(O: readonly number[], Ex: readonly number[], fitted: number) {
  let X2 = 0,
    k = 0;
  for (let i = 0; i < O.length; i++)
    if (Ex[i]! > 0) {
      X2 += (O[i]! - Ex[i]!) ** 2 / Ex[i]!;
      k++;
    }
  const df = k - 1 - (fitted || 0);
  return { X2, df, p: df > 0 ? 1 - gammaP(df / 2, X2 / 2) : NaN };
}
/** andersonDarling(data, d) → {A2}: the Anderson–Darling statistic (Anderson & Darling 1954), tail-sensitive */
function andersonDarling(data: readonly number[] | null, d: DistParams) {
  const F = cdfOf(d),
    x = (data || []).filter(fin).sort((a, b) => a - b),
    n = x.length;
  if (!F || !n) return { A2: NaN };
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = min(1 - 1e-15, max(1e-15, F(x[i]!))),
      b = min(1 - 1e-15, max(1e-15, F(x[n - 1 - i]!)));
    s += (2 * i + 1) * (log(a) + log(1 - b));
  }
  return { A2: -n - s / n };
}

/* ======================================================================================================================
     Variance reduction and sequential precision (Law ch. 9, 11)
     ====================================================================================================================== */
/** controlVariate(y, x, muX, level) → ci of Y adjusted by a control X with a known mean: Y − b(X − μX), b = cov(X, Y)/var(X)
      (Law §11.4; Lavenberg & Welch 1981); also b and the variance ratio vr (< 1 = a gain) */
function controlVariate(y: readonly number[], x: readonly number[], muX: number, level: number) {
  const n = min(y.length, x.length);
  if (n < 3) return { ...ci([], level), b: NaN, vr: NaN };
  let my = 0,
    mx = 0;
  for (let i = 0; i < n; i++) {
    my += y[i]!;
    mx += x[i]!;
  }
  my /= n;
  mx /= n;
  let sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0,
    adj = [];
  for (let i = 0; i < n; i++) adj.push(y[i]! - b * (x[i]! - muX));
  const c = ci(adj, level),
    c0 = ci(y.slice(0, n), level);
  const r = ci(adj, level);
  // one more degree of freedom is used by b: t with n − 2 (Law §11.4)
  const half = n > 2 ? (tq(1 - (1 - (level || 0.95)) / 2, n - 2) * r.sd * sqrt((n - 1) / (n - 2))) / sqrt(n) : NaN;
  return { ...c, half, lo: c.mean - half, hi: c.mean + half, b, vr: c0.sd > 0 ? (r.sd * r.sd) / (c0.sd * c0.sd) : NaN };
}
/** untilPrecision(fn(i) → number, {gamma (relative error, 0.05), n0 (10), nMax (1000), level}) — the sequential procedure of Law
      §9.4.1: replications are added until half/|mean| ≤ γ/(1 + γ) → ci + {reached, values} */
function untilPrecision(
  fn: (i: number) => number,
  o: {
    readonly gamma?: number | undefined;
    readonly n0?: number | undefined;
    readonly nMax?: number | undefined;
    readonly level?: number | undefined;
  } | null,
) {
  const g = o && o.gamma! > 0 ? o.gamma! : 0.05,
    n0 = max(2, (o && o.n0) || 10),
    nMax = min(10000, (o && o.nMax) || 1000),
    lv = o && o.level,
    vals: number[] = [];
  for (let i = 0; i < nMax; i++) {
    let v: number;
    try {
      v = fn(i);
    } catch {
      v = NaN;
    }
    vals.push(v);
    if (vals.length >= n0) {
      const c = ci(vals, lv);
      if (abs(c.mean) > 0 && c.half / abs(c.mean) <= g / (1 + g)) return { ...c, reached: true, values: vals };
    }
  }
  return { ...ci(vals, lv), reached: false, values: vals };
}
/** lhs(n, k, r) → n points of a Latin hypercube in [0, 1)^k (McKay, Beckman & Conover 1979): one point in each of n strata per axis */
function lhs(n: number, k: number, r: Stream | null) {
  const rs = r || stream(1, 'lhs'),
    pts = Array.from({ length: n }, () => new Array<number>(k));
  for (let j = 0; j < k; j++) {
    const perm = rs.shuffle(Array.from({ length: n }, (_, i) => i));
    for (let i = 0; i < n; i++) pts[i]![j] = (perm[i]! + rs()) / n;
  }
  return pts;
}

/* ======================================================================================================================
     Calibration and optimisation hooks
     ====================================================================================================================== */
/** minimize(fn(x) → number, x0, {step, lo, hi, maxEval (≤ 20 000), tol}) — Nelder & Mead 1965 with the standard coefficients
      (Lagarias et al. 1998), bounds by clamping; NaN values count as +∞ → {x, f, evals, converged} */
function minimize(fn: (x: number[]) => unknown, x0: readonly number[], o: MinimizeOpts | null) {
  const k = x0.length,
    lo = (o && o.lo) || [],
    hi = (o && o.hi) || [],
    cap = min(20000, (o && o.maxEval) || 2000),
    tol = (o && o.tol) || 1e-10;
  const clampV = (x: readonly number[]) => x.map((v, i) => min(fin(hi[i]!) ? hi[i] : Infinity, max(fin(lo[i]!) ? lo[i] : -Infinity, v)));
  let evals = 0;
  const F = (x: number[]) => {
    evals++;
    const v = safe(fn, x);
    return Number.isNaN(v) ? Infinity : v;
  };
  const stp = (o && o.step) || x0.map(v => (v !== 0 ? 0.1 * abs(v) : 0.1));
  let S = [clampV(x0.slice())];
  for (let i = 0; i < k; i++) {
    const x = x0.slice();
    x[i]! += Array.isArray(stp) ? (stp as readonly number[])[i]! : (stp as number);
    S.push(clampV(x));
  }
  let fv = S.map(F);
  while (evals < cap) {
    const idx = S.map((_, i) => i).sort((a, b) => fv[a]! - fv[b]!);
    S = idx.map(i => S[i]!);
    fv = idx.map(i => fv[i]!);
    if (
      abs(fv[k]! - fv[0]!) <= tol * (abs(fv[0]!) + tol) &&
      S.every(x => x.every((v, i) => abs(v - S[0]![i]!) <= 1e-9 * max(1, abs(S[0]![i]!))))
    )
      return { x: S[0]!, f: fv[0]!, evals, converged: true };
    const c = new Array<number>(k).fill(0);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) c[i]! += S[j]![i]! / k;
    const at = (s: number) => clampV(c.map((v, i) => v + s * (S[k]![i]! - v)));
    const xr = at(-1),
      fr = F(xr);
    if (fr < fv[0]!) {
      const xe = at(-2),
        fe = F(xe);
      if (fe < fr) {
        S[k] = xe;
        fv[k] = fe;
      } else {
        S[k] = xr;
        fv[k] = fr;
      }
    } else if (fr < fv[k - 1]!) {
      S[k] = xr;
      fv[k] = fr;
    } else {
      const xc = fr < fv[k]! ? at(-0.5) : at(0.5),
        fc = F(xc);
      if (fc < min(fr, fv[k]!)) {
        S[k] = xc;
        fv[k] = fc;
      } else
        for (let j = 1; j <= k; j++) {
          S[j] = clampV(S[j]!.map((v, i) => S[0]![i]! + 0.5 * (v - S[0]![i]!)));
          fv[j] = F(S[j]!);
        }
    }
  }
  let b = 0;
  for (let j = 1; j <= k; j++) if (fv[j]! < fv[b]!) b = j;
  return { x: S[b]!, f: fv[b]!, evals, converged: false };
}
/** calibrate(model(params) → predictions, data, p0, opts) — least squares Σ(w(pred − obs))² by minimize → {x, sse, rmse, evals, converged} */
function calibrate(
  model: (p: number[]) => unknown,
  data: readonly number[],
  p0: readonly number[],
  o: (MinimizeOpts & { readonly weights?: readonly number[] | undefined }) | null,
) {
  const w = (o && o.weights) || null;
  const sse = (p: number[]) => {
    const pr = model(p);
    if (!Array.isArray(pr) || pr.length !== data.length) return NaN;
    let s = 0;
    for (let i = 0; i < data.length; i++) {
      const e = (pr[i] - data[i]!) * (w ? w[i]! : 1);
      s += e * e;
    }
    return s;
  };
  const r = minimize(sse, p0, o);
  return { x: r.x, sse: r.f, rmse: sqrt(r.f / max(1, data.length)), evals: r.evals, converged: r.converged };
}

/* ======================================================================================================================
     For engine authors: the shared event record, the stepper interface and its adapters (docs/library/simkit.md §8)
     ====================================================================================================================== */
let evSeq = 0;
/** event(t, source, kind, data, prio) → the event record every engine and the orchestrator exchange:
      {t (model time), source (the part / engine id that raised it), kind (a short code: 'arrive', 'threshold', 'dose' …), data (plain
      numbers / strings / arrays), prio (ties at the same t: smaller first), seq (creation order: the last tie-break)} */
function event(t: number, source: unknown, kind: unknown, data: unknown, prio?: unknown): SimEvent {
  return {
    t: typeof t === 'number' ? t : NaN,
    source: source == null ? '' : textOf(source),
    kind: kind == null ? '' : textOf(kind),
    data: data === undefined ? null : data,
    prio: fin(prio) ? prio : 0,
    seq: evSeq++,
  };
}
const evLess = (a: SimEvent, b: SimEvent) => a.t - b.t || a.prio - b.prio || a.seq - b.seq;
/** clone(v): a deep copy of plain data (objects, arrays, typed arrays, Maps, Sets); functions are kept by reference */
function clone(v: unknown, depth?: number): unknown {
  if ((depth || 0) > 64 || v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return (v as Float64Array).slice();
  if (Array.isArray(v)) return v.map(x => clone(x, (depth || 0) + 1));
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, clone(x, (depth || 0) + 1)]));
  if (v instanceof Set) return new Set([...v].map(x => clone(x, (depth || 0) + 1)));
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v)) o[k] = clone((v as Rec)[k], (depth || 0) + 1);
  return o;
}
/** stepper(def) → the checked stepper interface of a part (what cosim and the parts orchestrator drive):
        id · init(model, inputs, ctx) → state · step(state, inputs, t, dt, ctx) → {state, out, dt (taken ≤ asked: an early stop at
        a state event), events: [event records]} (the same argument order as makeEngine's optional `stepper` of the parts orchestrator) · snapshot(state) → a copy · restore(snap) → state · output(state) → out (optional) ·
        onEvent(state, ev, t) → state (optional: an event from another part)
      The wrapper never throws: a failing step returns {state, out: {}, dt: 0, events: [], fail: 'part-failed'}; events are normalised
      to event records with source = id; snapshot/restore default to clone (so a state must be plain data: no closures, or give your
      own snapshot/restore, or set snapshot: null to say the part cannot be iterated). */
function stepper<S>(def: StepperDef<S> | null): Part | null {
  if (!def || typeof def.step !== 'function') return null;
  const id = def.id == null ? 'part' : textOf(def.id);
  const norm = (evs: unknown, t: number) =>
    (Array.isArray(evs) ? evs : [])
      .filter(isObj)
      .map(e =>
        e.seq != null && e.source != null && 'kind' in e
          ? (e as unknown as SimEvent)
          : event(fin(e.t) ? e.t : t, id, e.kind != null ? e.kind : e.name, e.data, e.prio),
      )
      .map(e => (e.to ? e : Array.isArray(e.to) ? e : e));
  const S: Part = {
    id,
    kind: 'stepper',
    init(model: unknown, inputs: Inputs, ctx: unknown) {
      try {
        return def.init ? def.init(model, inputs, ctx) : {};
      } catch {
        return null;
      }
    },
    step(state: unknown, inputs: Inputs | null, t: number, dt: number, ctx: unknown) {
      let r;
      try {
        r = def.step!(state as S, inputs || {}, t, dt, ctx);
      } catch {
        r = null;
      }
      if (!isObj(r)) return { state, out: {}, dt: 0, events: [], fail: 'part-failed' };
      const taken = fin(r.dt) ? min(max(r.dt, 0), dt) : dt;
      return {
        state: r.state === undefined ? state : r.state,
        out: isObj(r.out) ? r.out : {},
        dt: taken,
        events: norm(r.events, (fin(t) ? t : 0) + taken),
        ...(r.fail ? { fail: r.fail } : {}),
      };
    },
    snapshot:
      def.snapshot === null
        ? null
        : (state: unknown) => {
            try {
              return def.snapshot ? def.snapshot(state as S) : clone(state);
            } catch {
              return null;
            }
          },
    restore:
      def.restore === null
        ? null
        : (snap: unknown) => {
            try {
              return def.restore ? def.restore(snap) : clone(snap);
            } catch {
              return null;
            }
          },
    output: def.output
      ? (state: unknown) => {
          try {
            return def.output!(state as S) || {};
          } catch {
            return {};
          }
        }
      : null,
    onEvent: def.onEvent
      ? (state: unknown, ev: SimEvent, t: number) => {
          try {
            const r = def.onEvent!(state as S, ev, t);
            return r === undefined ? state : r;
          } catch {
            return state;
          }
        }
      : null,
  };
  return S;
}
/** odeStepper(def) — an adapter for an engine whose model is x' = f(t, x, inputs): it integrates with integrate() over each macro
      step, stops early at a terminal state event and reports every event as a record.
      def = {id, n, y0(model, inputs) → array, f(t, y, dy, inputs), method, rtol, atol, dt, hmax, pairs,
             events: [{kind, g(t, y, inputs), dir, hyst, terminal, apply(t, y, inputs) (a jump, in place)}], out(t, y, inputs) → {}}
      state = {t, y: [...], steps} (plain data: snapshot/restore work) */
function odeStepper(def: OdeStepperDef | null) {
  if (!def || typeof def.f !== 'function') return null;
  return stepper({
    id: def.id,
    init(model: unknown, inputs: Inputs) {
      const y = def.y0 ? Array.from(def.y0(model, inputs) || []) : [];
      return { t: fin(def.t0) ? def.t0 : 0, y, steps: 0 };
    },
    output: (st: OdeState) => (def.out ? def.out(st.t, st.y, {}) : {}),
    step(st: OdeState, inputs: Inputs, t: number, dt: number) {
      const t0 = fin(t) ? t : st.t;
      const evs = (def.events || []).map((e): StateEvent => ({
        g: (t: number, y: Float64Array) => e.g(t, y, inputs),
        dir: e.dir,
        hyst: e.hyst,
        terminal: !!e.terminal,
        kind: e.kind,
        onEvent: (t: number, y: Float64Array) => {
          if (e.apply) e.apply(t, y, inputs);
        },
      }));
      const r = integrate({
        f: (t: number, y: Float64Array, dy: Float64Array) => {
          def.f!(t, y, dy, inputs);
        },
        y0: st.y,
        t0,
        tEnd: t0 + dt,
        method: def.method,
        rtol: def.rtol,
        atol: def.atol,
        dt: def.dt,
        hmax: def.hmax,
        pairs: def.pairs,
        events: evs,
        maxSteps: def.maxSteps,
      });
      const ns = { t: r.t, y: r.y, steps: st.steps + r.steps };
      const out = def.out ? def.out(r.t, r.y, inputs) : {};
      const fatal = r.codes.find(c => c.level === 'error');
      return {
        state: ns,
        out,
        dt: r.t - t0,
        events: r.events.map(h => event(h.t, def.id, h.kind || `event${h.j}`, { dir: h.dir })),
        ...(fatal ? { fail: fatal.code } : {}),
      };
    },
  });
}
/** wrapRun(id, run(inputs, t) → out) — an adapter for an engine with no time of its own (a formula, a chain part): each step
      recomputes its outputs from the latest inputs at the step's end time */
function wrapRun(id: unknown, run: (inputs: Inputs, t: number) => Rec | null | undefined) {
  return stepper({
    id,
    init: () => ({ t: 0 }),
    step(st: { t: number }, inputs: Inputs, t: number, dt: number) {
      const t1 = (fin(t) ? t : st.t) + dt;
      return { state: { t: t1 }, out: run(inputs, t1) || {}, dt };
    },
  });
}

/* ======================================================================================================================
     Co-simulation master (the parts orchestrator's cosim mode). Rollback-free by default (no part is ever asked to go back in time):
       • each part has its own local time; the master always steps the parts that are furthest behind (the global time), in the
         declared order (Gauss–Seidel: a later part sees the outputs the earlier ones produced in the same macro step);
       • a macro step ends at min(t + dt, tEnd, the next event addressed to the part);
       • a part may stop early (it returns dt taken < dt asked: a state event inside the step) — the macro step then ends at that
         time for every part still to step in this round, so they meet the event at its time; parts already ahead wait;
       • events a part emits (event records, with an optional `to: [part ids]`) go to the other parts: delivered by onEvent(state, ev)
         at the start of the target's next step that reaches ev.t; a target already past ev.t gets it at once and the master records
         the lateness (code 'late-event', info: the largest lag) — list the event-producing parts first to avoid it;
       • iterate: {maxIter ≤ 50, tol} (optional, strong coupling): while every part is at the same time, a macro step is repeated
         from the parts' snapshots until the exchanged scalar outputs change by ≤ tol (relative), else code 'no-converge' (the last
         iterate is kept). Parts without snapshot/restore make it fall back to one pass (code 'no-snapshot').
     cosim({tEnd, dt, t0, parts: [stepper or {id, init, step, inputs?(outs, t), onEvent?}], link?: {partId: (outs, t) → inputs},
            order?, maxMacro, iterate, model, inputs0})
       → {t, outs, trace: [{t, part, out}], events: [records], codes, macro, iterations}
     (DEVS view: each part is an atomic model whose time advance is the macro step; Zeigler et al. 2018 ch. 6 and ch. 18; FMI 2.0
     co-simulation master algorithms: Gomes et al. 2018, ACM Comput. Surv. 51:3) */
function cosim(cfg: CosimConfig | null) {
  const C = codes(['budget', 'no-progress', 'bad-config', 'part-failed']);
  const res: CosimResult = { t: 0, outs: {}, trace: [], events: [], codes: C.list, macro: 0, iterations: 0 };
  if (!cfg || !Array.isArray(cfg.parts) || !cfg.parts.length || !(cfg.dt! > 0) || !fin(cfg.tEnd)) {
    C.code('bad-config');
    return res;
  }
  const t0 = fin(cfg.t0) ? cfg.t0 : 0,
    tEnd = cfg.tEnd,
    dt = cfg.dt!,
    eps = 1e-12 * max(1, abs(tEnd));
  const parts = cfg.parts.filter(p => p && typeof (p as Partial<Part>).step === 'function') as Part[];
  const byId = new Map(parts.map(p => [p.id, p]));
  const ord0 = Array.isArray(cfg.order) ? (cfg.order as readonly string[]).filter(id => byId.has(id)) : [];
  const order = ord0.concat(parts.map(p => p.id).filter(id => !ord0.includes(id)));
  const P: CosimPart[] = order.map(id => {
    const p = byId.get(id)!;
    let st: unknown = null;
    try {
      st = p.init ? p.init(cfg.model, cfg.inputs0 || {}, { id }) : null;
    } catch {
      C.code('part-failed', t0, id);
    }
    return { p, id, t: t0, state: st, inbox: [] };
  });
  const outs = res.outs;
  for (const q of P) {
    let o0: Rec = {};
    try {
      o0 = q.p.output ? q.p.output(q.state) || {} : {};
    } catch {
      o0 = {};
    }
    outs[q.id] = o0;
  }
  const maxMacro = min(fin(cfg.maxMacro) ? cfg.maxMacro : MAX_STEPS, MAX_STEPS);
  const inputsOf = (q: CosimPart) => {
    try {
      const fn = q.p.inputs || (cfg.link && cfg.link[q.id]!);
      return fn ? fn(outs, q.t) || {} : {};
    } catch {
      return {};
    }
  };
  const it0 = isObj(cfg.iterate)
    ? {
        maxIter: min(50, max(1, floor(cfg.iterate.maxIter as number) || 10)),
        tol: (cfg.iterate.tol as number) > 0 ? (cfg.iterate.tol as number) : 1e-6,
      }
    : null;
  const canIter = it0 && P.every(q => q.p.snapshot && q.p.restore);
  if (it0 && !canIter) C.code('no-snapshot');
  let lag = 0;
  const deliver = (q: CosimPart, e: SimEvent) => {
    if (q.t > e.t + eps) {
      lag = max(lag, q.t - e.t);
      q.inbox.push({ ...e, t: q.t, late: true });
    } else q.inbox.push(e);
  };
  const outDiff = (a: Readonly<Record<string, Rec>>, b: Readonly<Record<string, Rec>>) => {
    let d = 0;
    for (const id of Object.keys(a))
      for (const k of Object.keys(a[id] || {})) {
        const x = a[id]![k],
          y = b[id] && b[id][k];
        if (typeof x === 'number' && typeof y === 'number') {
          const s = max(1e-12, abs(x), abs(y));
          d = max(d, x === y ? 0 : abs(x - y) / s);
        }
      }
    return d;
  };
  // one round: every part behind steps once; → false on a failure
  function round(tg: number, target: number): [CosimPart, SimEvent][] | false {
    const emitted: [CosimPart, SimEvent][] = [];
    for (const q of P) {
      if (q.t > tg + eps) continue; // ahead: waits for the others
      q.inbox.sort(evLess);
      while (q.inbox.length && q.inbox[0]!.t <= q.t + eps) {
        const ev = q.inbox.shift()!;
        if (q.p.onEvent) {
          try {
            const s2 = q.p.onEvent(q.state, ev, q.t);
            if (s2 !== undefined) q.state = s2;
          } catch {
            C.code('part-failed', q.t, q.id);
          }
        }
      }
      let T = target;
      if (q.inbox.length) T = min(T, q.inbox[0]!.t);
      const ask = T - q.t;
      if (!(ask > eps)) continue;
      let r: ReturnType<Part['step']> | null = null;
      try {
        r = q.p.step(q.state, inputsOf(q), q.t, ask, { id: q.id });
      } catch {
        r = null;
      }
      if (!isObj(r) || r.fail === 'part-failed') {
        C.code('part-failed', q.t, q.id);
        res.t = q.t;
        return false;
      }
      if (r.fail) C.code(r.fail, q.t, q.id);
      let taken = fin(r.dt) ? r.dt : ask;
      if (taken > ask) taken = ask;
      if (!(taken > 0)) {
        C.code('no-progress', q.t, q.id);
        res.t = q.t;
        return false;
      }
      if (r.state !== undefined) q.state = r.state;
      q.t = taken >= ask - eps ? T : q.t + taken;
      outs[q.id] = isObj(r.out) ? r.out : {};
      for (const ev of (Array.isArray(r.events) ? r.events : []) as unknown[]) {
        if (!isObj(ev) || !fin(ev.t)) continue;
        const e =
          ev.seq != null && ev.source
            ? (ev as unknown as SimEvent)
            : event(ev.t, q.id, ev.kind != null ? ev.kind : ev.name, ev.data, ev.prio);
        if (ev.to) e.to = ev.to as readonly string[];
        emitted.push([q, e]);
        for (const o2 of P) if (o2 !== q && (!Array.isArray(ev.to) || ev.to.includes(o2.id))) deliver(o2, e);
      }
      if (taken < ask - eps) target = min(target, q.t); // a state event stopped this part: the others stop there too
    }
    return emitted;
  }
  for (let it = 0; it < maxMacro; it++) {
    let tg = Infinity;
    for (const q of P) tg = min(tg, q.t);
    if (tg >= tEnd - eps) {
      res.t = tEnd;
      if (lag > 0) C.code('late-event', undefined, lag);
      return res;
    }
    const target = min(tEnd, tg + dt);
    res.macro++;
    const sync = P.every(q => abs(q.t - tg) <= eps);
    let emitted: [CosimPart, SimEvent][] | false | undefined;
    if (canIter && sync) {
      // strong coupling: repeat the round from the snapshots until the exchanged outputs settle
      const snaps = P.map(q => ({ s: q.p.snapshot!(q.state), t: q.t, inbox: q.inbox.slice() }));
      let prev = clone(outs) as Record<string, Rec>,
        conv = false;
      for (let k = 0; k < it0.maxIter; k++) {
        res.iterations++;
        if (k > 0)
          P.forEach((q, i) => {
            q.state = q.p.restore!(snaps[i]!.s);
            q.t = snaps[i]!.t;
            q.inbox = snaps[i]!.inbox.slice();
          });
        emitted = round(tg, target);
        if (emitted === false) return res;
        const d = outDiff(outs, prev);
        prev = clone(outs) as Record<string, Rec>;
        if (k > 0 && d <= it0.tol) {
          conv = true;
          break;
        }
      }
      if (!conv && it0.maxIter > 1) C.code('no-converge', tg);
    } else {
      emitted = round(tg, target);
      if (emitted === false) return res;
    }
    for (const [, e] of emitted as [CosimPart, SimEvent][]) {
      if (res.events.length < MAX_LOG) res.events.push(e);
    }
    for (const q of P) if (res.trace.length < MAX_POINTS * 4) res.trace.push({ t: q.t, part: q.id, out: outs[q.id]! });
  }
  C.code('budget', tEnd);
  res.t = min(...P.map(q => q.t));
  return res;
}

const API = Object.freeze({
  version: 1,
  MAX_STEPS,
  MAX_EVENTS,
  MAX_LOG,
  DISTS: Object.freeze(DISTS.slice()),
  METHODS: Object.freeze(METHODS.slice()),
  TIME_UNITS: Object.freeze(TIME_UNITS.slice()),
  // randomness
  stream,
  subseed,
  philox,
  counterStream,
  dist,
  jumps,
  M1,
  M2,
  // events
  calendar,
  sim,
  codes,
  budget,
  // continuous time and roots
  integrate,
  locate,
  brent,
  lu,
  solve,
  inv,
  eig,
  eigSym,
  // special functions
  lgamma,
  gammaP,
  gammaQ,
  betaI,
  betaQ,
  normCdf,
  normSf,
  normInv,
  erf,
  erfc,
  erfInv,
  erfcInv,
  tCdf,
  tSf,
  chi2Sf,
  fCdf,
  fSf,
  tq,
  // output analysis
  welford,
  ksum,
  timeAvg,
  ci,
  acf,
  batchMeans,
  mser5,
  replicate,
  littleCheck,
  // sweeps and sensitivity
  linspace,
  oat,
  grid,
  morris,
  sobol,
  lhs,
  // delay equations, stochastic kinetics, SDEs, schedules
  dde,
  dae,
  daeTheta,
  daeThetaInit,
  ssa,
  tauLeap,
  sde,
  nhpp,
  piecewise,
  // distributions and input modelling
  cdfOf,
  quantileOf,
  truncated,
  mixture,
  fit,
  ksTest,
  chiSquare,
  andersonDarling,
  digamma,
  trigamma,
  // variance reduction, precision, calibration
  controlVariate,
  untilPrecision,
  minimize,
  calibrate,
  // verification
  richardson,
  conservation,
  deterministic,
  dim,
  sameDim,
  convert,
  // co-simulation
  event,
  clone,
  stepper,
  odeStepper,
  wrapRun,
  cosim,
});
export default API;
/* i18n-ignore-end */
