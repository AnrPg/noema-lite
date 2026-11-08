/* The typed boundary of the simulation kernel (the code: ./simkit.js). The types are those of kernel/simkit.ts as its strict
   TypeScript port names them, for the parts the engines typed before that port lands use (the port replaces this file). */
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

declare const api: {
  readonly [name: string]: unknown;
  readonly stream: (seed: number, name: string, opts?: unknown) => Stream;
};
export default api;
