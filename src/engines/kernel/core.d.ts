/* The typed boundary of the core of the engine library (the code: ./core.js): the model checker, numbers, seeded streams, scenes and the
   adapter port, as the engines written in TypeScript call them. */
import type { EngineCore, EngineInstance, Problem, SimEngine, Spec } from '../types.ts';

/** a plain object of a model (after isObj) */
export type Obj = Record<string, unknown>;
/** a writer of problems: E (an error) or W (a warning) of problems() */
export type Report = (code: string, path: string, msg: string) => void;
/** a field of a model table: a kind (pos, nonneg, fin, unit, bool, int:a:b, enum:a|b, id, name, key, expr, numx, ref, any; "!" = required) or a shape */
export type Shape =
  | { readonly $obj: Table; readonly $req?: boolean }
  | { readonly $list: string | Shape; readonly min?: number; readonly max: number; readonly $req?: boolean }
  | { readonly $map: string | Shape; readonly max: number; readonly $req?: boolean };
/** a model table: field → kind or shape */
export interface Table {
  readonly [field: string]: string | Shape;
}
/** an output of the spec after the common checks of checkOutputs: an object whose kind is one the engine computes and whose `of` is a text */
export interface CheckedOutput {
  readonly kind: string;
  readonly of: string;
  readonly [field: string]: unknown;
}
export interface Stats {
  readonly final: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly pp: number;
  readonly rms: number;
}
/** a seeded stream of uniforms in [0, 1) with its variates (the kernel's MRG32k3a, or the core's mulberry32 FALLBACK) */
export interface Stream {
  (): number;
  normal(mu?: number, sd?: number | null): number;
  int(n: number): number;
}
/** the bounding view of a scene: [x0, x1, y0, y1] */
export type View = readonly number[];
/** the options of a scene item (a role c, never a colour; r, key, v, arrow, w, dash, fill, closed …) */
export type ItemOptions = Readonly<Record<string, unknown>>;
export interface SceneItem {
  readonly k: 'pt' | 'seg' | 'circ' | 'poly' | 'txt';
  readonly [field: string]: unknown;
}
export interface Scene {
  view: number[];
  items: SceneItem[];
}
export interface SceneBuilder {
  readonly items: SceneItem[];
  readonly view: View;
  pt(x: number, y: number, o?: ItemOptions | null): void;
  seg(x1: number, y1: number, x2: number, y2: number, o?: ItemOptions | null): void;
  circ(x: number, y: number, r: number, o?: ItemOptions | null): void;
  poly(pts: number[], o?: ItemOptions | null): void;
  txt(x: number, y: number, o?: ItemOptions | null): void;
  done(): Scene;
}
/** the numbers of a run: the spec's consts, params and derived values */
export type Env = Readonly<Record<string, number | boolean>>;
export interface RunOptions {
  readonly seed: number;
  /** what def.prepare(spec) gave (null without prepare) */
  readonly prepared: unknown;
  /** the series inputs of a part (docs/INTERACTIVE.md §12.8) */
  readonly series?: Readonly<Record<string, readonly unknown[]>>;
}
/** what an engine's run gives: its outputs by output id (and whatever else its own tests read) */
export interface RunResult {
  readonly out: Readonly<Record<string, unknown>>;
}
export interface StepContext {
  readonly spec: Spec;
  readonly seed: number;
  readonly prepared: unknown;
  readonly id: string;
  t0: number;
  readonly rand: () => number;
}
export interface StepReturn {
  readonly state?: unknown;
  readonly out?: unknown;
  readonly dt?: number;
  readonly events?: readonly unknown[];
  readonly fail?: string;
}
/** an engine that evolves in time, stepped by the parts orchestrator (docs/INTERACTIVE_LIBRARY.md §1.6) */
export interface Stepper {
  init(model: unknown, inputs: Env, ctx: StepContext): unknown;
  step(state: unknown, inputs: Env, t: number, dt: number, ctx: StepContext): StepReturn | null;
  readonly snapshot?: ((state: unknown) => unknown) | null;
  readonly restore?: ((copy: unknown) => unknown) | null;
  output?(state: unknown, ctx: StepContext): Readonly<Record<string, unknown>> | null;
  onEvent?(state: unknown, ev: unknown, t: number): unknown;
}
/** an engine of the library as makeEngine takes it */
export interface EngineDef {
  readonly id: string;
  checkSpec(spec: unknown): Problem[];
  run(spec: Spec, env: Env, opts: RunOptions): RunResult | null;
  prepare?(spec: Spec): unknown;
  readonly scenes?: boolean;
  readonly stepper?: Stepper;
}
export interface IntegrateConfig {
  f(t: number, y: Float64Array, dy: Float64Array): void;
  readonly y0: readonly number[];
  readonly t0?: number;
  readonly tEnd: number;
  readonly method?: string;
  readonly dt?: number;
  readonly maxSteps?: number;
  readonly samples?: readonly number[];
  onSample?(t: number, y: Float64Array): void;
}
export interface IntegrateResult {
  readonly t: number;
  readonly y: number[];
  readonly stop: string;
  readonly codes: readonly string[];
}
/** the part of the simulation kernel (./simkit.js, docs/library/simkit.md) the library engines call through kit() */
export interface SimKit {
  normCdf(z: number): number;
  normInv(p: number): number;
  brent(g: (x: number) => number, a: number, b: number, tol: number, fa?: number, fb?: number): number;
  integrate(cfg: IntegrateConfig): IntegrateResult;
  stream(seed: number, name: string): Stream;
}
export interface CoreApi {
  readonly MAX_POINTS: number;
  readonly MAX_SCENE: number;
  readonly ID_RE: RegExp;
  readonly NAME_RE: RegExp;
  readonly KEY_RE: RegExp;
  readonly RESERVED: readonly string[];
  readonly STATS: readonly string[];
  readonly ROLES: readonly string[];
  isObj(v: unknown): v is Obj;
  has(o: object, k: PropertyKey): boolean;
  isNum(v: unknown): v is number;
  fail(code: string, extra?: object | null): Error & { code: string };
  checkKind(kind: string, v: unknown): boolean;
  kindMsg(kind: string): string | undefined;
  walk(o: unknown, T: Table, path: string, E: Report, W: Report): void;
  problems(): { P: Problem[]; E: Report; W: Report };
  hasErrors(P: readonly Problem[]): boolean;
  checkOutputs(
    spec: unknown,
    id: string,
    kinds: readonly string[],
    out: (o: CheckedOutput, at: string, E: Report, W: Report) => unknown,
    E: Report,
    W: Report,
  ): void;
  stats(a: Iterable<number>): Stats;
  thin<T>(a: readonly T[], n?: number): T[];
  hash32(s: string, seed: number): number;
  mulberry32(a: number): () => number;
  gauss(r: () => number): number;
  cx(v: unknown): (env: Readonly<Record<string, unknown>>) => number;
  scene(view: View): SceneBuilder;
  fitView(xs: ArrayLike<number>, ys: ArrayLike<number>, margin?: number | null): [number, number, number, number];
  makeEngine(def: EngineDef): { engine: EngineCore; simEngine: SimEngine & { readonly stepper?: Stepper } };
  stepInstance(def: EngineDef, spec: Spec, seed: number, prepared: unknown): EngineInstance;
  pickStep(spec: Spec, out: unknown): Record<string, unknown>;
  copyData<T>(v: T): T;
  kit(): SimKit | null;
  rng(seed: number, name: string): Stream;
  normal(r: Stream | (() => number)): number;
}
declare const api: CoreApi;
export default api;
