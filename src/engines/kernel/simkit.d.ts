/* The typed boundary of the simulation kernel (the code: ./simkit.js). The types are those of kernel/simkit.ts as its strict
   TypeScript port names them, for the parts the engines typed before that port lands use (the port replaces this file). */
import type { CoreStepper } from './core.js';
/** a vector of numbers: an array or a typed array */
export type Nums = ArrayLike<number>;
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
/** a code as codes() records it: the first occurrence of each, with its time */
export interface CodeRec {
  readonly code: string;
  readonly level: 'error' | 'warning';
  readonly t?: number;
  readonly info?: unknown;
}
/** codes(fatalList): the codes of a run (a code in fatalList, or given as fatal, is an error) */
export interface Codes {
  readonly list: CodeRec[];
  code(c: string, t?: number | null, info?: unknown, fatal?: boolean): void;
  has(c: string): boolean;
  fatal(): boolean;
}
/** an entry of the event calendar */
export interface CalEntry {
  readonly t: number;
  readonly prio: number;
  readonly seq: number;
  readonly id: number;
  readonly kind: unknown;
  readonly data: unknown;
}
/** the event calendar: a heap ordered by (time, priority, insertion order), lazy cancellation */
export interface Calendar {
  schedule(t: number, kind: unknown, data?: unknown, prio?: number): number;
  cancel(id: number): boolean;
  peek(): number;
  peekEntry(): CalEntry | null;
  pop(): CalEntry | null;
  readonly size: number;
  clear(): void;
}

/** a distribution of durations or counts, ready to draw (dist()): not ok → NaN moments and NaN draws */
export interface Dist {
  readonly ok: boolean;
  readonly mean: number;
  readonly var: number;
  readonly scv: number;
  readonly draw: (r: Stream) => number;
}
/** a Student-t interval over values (ci()) */
export interface Ci {
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
  readonly half: number;
  readonly lo: number;
  readonly hi: number;
  readonly level: number;
}
/** the options of an event scheduled on the discrete-event executive */
export interface SimOpts {
  readonly prio?: number;
  readonly kind?: unknown;
  readonly data?: unknown;
}
/** an event of the executive, as its handler gets it */
export interface SimEvent {
  readonly t: number;
  readonly prio: number;
  readonly seq: number;
  readonly fn: (e: SimEvent) => void;
  readonly kind: unknown;
  readonly data: unknown;
}
/** how run(until) stopped */
export interface SimRun {
  readonly t: number;
  readonly events: number;
  readonly stop: string;
}
/** the discrete-event executive (sim()): next-event time advance over a calendar of closures */
export interface Sim {
  readonly now: number;
  readonly events: number;
  readonly pending: number;
  readonly codes: Codes;
  readonly tEnd: number;
  at(t: number, fn: (e: SimEvent) => void, op?: SimOpts | null): number;
  after(dt: number, fn: (e: SimEvent) => void, op?: SimOpts | null): number;
  cancel(id: number): boolean;
  stop(code?: string): void;
  run(until?: number): SimRun;
}

declare const api: {
  readonly [name: string]: unknown;
  readonly stream: (
    seed: number,
    name: unknown,
    opts?: {
      readonly antithetic?: boolean | undefined;
      readonly sub?: number | undefined;
      readonly state?: readonly number[] | undefined;
    } | null,
  ) => Stream;
  readonly chi2Sf: (x: number, k: number) => number;
  readonly normInv: (p: number) => number;
  readonly codes: (fatalList?: readonly string[] | null) => Codes;
  readonly calendar: () => Calendar;
  readonly TIME_UNITS: readonly string[];
  readonly dist: (d: unknown) => Dist;
  readonly sim: (
    o?: {
      readonly tEnd?: number;
      readonly maxEvents?: number;
      readonly zeno?: number;
      readonly logCap?: number;
      readonly t0?: number;
      readonly eps?: number;
    } | null,
  ) => Sim;
  readonly ci: (values: Iterable<number> | null | undefined, level?: number) => Ci;
  readonly acf: (x: ArrayLike<number> & Iterable<number>, k: number) => number;
  readonly mser5: (x: ArrayLike<number> | null | undefined) => { d: number; dBatches: number; short: boolean; z: number[] };
  readonly littleCheck: (L: number, lambda: number, W: number) => number;
  readonly linspace: (a: number, b: number, n: number) => number[];
  readonly piecewise: (
    pts: readonly (readonly number[])[] | null | undefined,
    o?: { readonly step?: boolean; readonly period?: number } | null,
  ) => (t: number) => number;
  readonly stepper: <S, P = unknown>(def: CoreStepper<S, P> & { readonly id?: unknown }) => CoreStepper<S, P>;
};
export default api;
