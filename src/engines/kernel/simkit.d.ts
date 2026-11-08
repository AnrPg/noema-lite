/* The typed boundary of the simulation kernel (the code: ./simkit.js): what the typed engines call, with the types of the TypeScript
   kernel (simkit.ts replaces this file and ./simkit.js together; these are its signatures). The rest of the API stays unknown here. */
import type { KernelApi } from '../types.ts';

/** a vector of numbers: an array or a typed array */
export type Nums = ArrayLike<number>;
/** the right-hand side of y' = f(t, y): fills dy */
export type Rhs = (t: number, y: Float64Array, dy: Float64Array) => void;
/** a code of a run: the first occurrence of each, with its time */
export interface CodeRec {
  code: string;
  level: 'error' | 'warning';
  t?: number | undefined;
  info?: unknown;
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
export type Seg = (tq: number, out: Float64Array) => void;
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
declare const api: KernelApi & {
  readonly stream: (
    seed: number,
    name: unknown,
    opts?: {
      readonly antithetic?: boolean | undefined;
      readonly sub?: number | undefined;
      readonly state?: readonly number[] | undefined;
    } | null,
  ) => Stream;
  readonly integrate: (cfg: IntegrateConfig | null) => IntegrateResult;
  readonly brent: (g: (x: number) => number, a: number, b: number, tol: number, fa0?: number | null, fb0?: number | null) => number;
  readonly lu: (A: unknown) => { ok: boolean; n: number; det: number; solve: (b: Nums | null) => number[] };
  readonly eig: (A: unknown) => { re: number[]; im: number[]; ok: boolean };
  readonly linspace: (a: number, b: number, n: number) => number[];
};
export default api;
