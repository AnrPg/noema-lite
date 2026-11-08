/* The typed boundary of the core of the engine library (the code: ./core.js). The types are those of kernel/core.ts as its strict
   TypeScript port names them (the engines typed before that port lands import them from here; the port replaces this file). */
import type { EngineCore, Problem, SimEngine, Spec, StepResult } from '../types.ts';
import type NoemaSimKit from './simkit.js';
import type { Stream } from './simkit.js';

/** a plain object of a spec (data from outside: every field is checked where it is read) */
export type Rec = Readonly<Record<string, unknown>>;
/** a node of a model table: a kind (with a trailing "!" when required) or a shape */
export type TableNode = string | Shape;
export interface Shape {
  readonly $obj?: Table;
  readonly $list?: TableNode;
  readonly $map?: TableNode;
  readonly min?: number;
  readonly max?: number;
  readonly $req?: boolean;
}
/** a model table: its fields by name */
export type Table = Readonly<Record<string, TableNode>>;
/** a writer of problems: E (an error) or W (a warning) */
export type Emit = (code: string, path: string, msg: string) => void;
/** an error of the core with its code */
export type CoreError = Error & { code: string } & Record<string, unknown>;
/** the statistics of a series */
export interface Stats {
  final: number;
  min: number;
  max: number;
  mean: number;
  pp: number;
  rms: number;
}
/** a number of a model as a function of the run's names */
export type NumFn = (env?: Rec | null) => number;
/** the view of a scene: [x0, x1, y0, y1] */
export type View = number[];
/** the options of a scene item (a role, a label key, a number shown, a width, a dash…) */
export type ItemOpts = Readonly<Record<string, unknown>> | null | undefined;
/** an item of a scene */
export type SceneItem = Readonly<Record<string, unknown>> & { readonly k: 'pt' | 'seg' | 'circ' | 'poly' | 'txt' };
/** a finished scene: what a plot of kind `scene` draws */
export interface SceneData {
  view: View;
  items: SceneItem[];
}
/** a scene being drawn */
export interface Scene {
  readonly items: SceneItem[];
  readonly view: View;
  pt(x: number, y: number, o?: ItemOpts): void;
  seg(x1: number, y1: number, x2: number, y2: number, o?: ItemOpts): void;
  circ(x: number, y: number, r: number, o?: ItemOpts): void;
  poly(pts: number[], o?: ItemOpts): void;
  txt(x: number, y: number, o?: ItemOpts): void;
  done(): SceneData;
}
/** what an engine's run gives: its outputs by id */
export interface RunResult {
  readonly out?: Readonly<Record<string, unknown>>;
}
/** the options of a run: the seed, the prepared model and the series inputs of a part */
export interface RunOpts<P = unknown> {
  readonly seed: number;
  readonly prepared: P | null;
  readonly series?: Readonly<Record<string, unknown[]>>;
}
/** the context of a stepped part */
export interface StepCtx<P = unknown> {
  readonly spec: Spec;
  readonly seed: number;
  readonly prepared: P | null;
  readonly id: string;
  t0: number;
  readonly rand: () => number;
}
/** a step of a part as the engine gives it */
export interface CoreStep<S> {
  readonly state?: S | undefined;
  readonly out?: unknown;
  readonly dt?: number | undefined;
  readonly events?: unknown;
  readonly fail?: unknown;
}
/** the stepper of an engine (docs/INTERACTIVE_LIBRARY.md §1.6) */
export interface CoreStepper<S = unknown, P = unknown> {
  init(model: unknown, inputs: Readonly<Record<string, number | boolean>>, ctx: StepCtx<P>): S | null | undefined;
  step(
    state: S,
    inputs: Readonly<Record<string, number | boolean>>,
    t: number,
    dt: number,
    ctx: StepCtx<P>,
  ): CoreStep<S> | null | undefined;
  readonly snapshot?: ((state: S) => unknown) | null | undefined;
  readonly restore?: ((snap: unknown) => S) | null | undefined;
  readonly output?: ((state: S, ctx: StepCtx<P>) => unknown) | undefined;
  readonly onEvent?: ((state: S, ev: unknown, t: number) => S | undefined) | undefined;
}
/** an engine of the library as its module defines it (makeEngine's def) */
export interface EngineDef<P = unknown, S = unknown> {
  readonly id: string;
  checkSpec(spec: Spec): Problem[];
  run(spec: Spec, env: Readonly<Record<string, number | boolean>>, opts: RunOpts<P>): RunResult | null | undefined;
  readonly prepare?: ((spec: Spec) => P) | undefined;
  readonly scenes?: boolean | undefined;
  readonly stepper?: CoreStepper<S, P> | undefined;
}
/** the stepping side of an instance (what the Worker's step messages call) */
export interface StepInstance {
  stepInit(inp: Rec | null | undefined, t0: number): StepResult;
  stepTo(inp: Rec | null | undefined, t: number, dt: number, inbox?: readonly unknown[]): StepResult;
  snapshot(): number;
  restore(i: number): boolean;
}

declare const api: {
  readonly MAX_POINTS: number;
  readonly MAX_SCENE: number;
  readonly ID_RE: RegExp;
  readonly NAME_RE: RegExp;
  readonly KEY_RE: RegExp;
  readonly RESERVED: readonly string[];
  readonly STATS: readonly string[];
  readonly ROLES: readonly string[];
  readonly isObj: (v: unknown) => v is Rec;
  readonly has: (o: object, k: string) => boolean;
  readonly isNum: (v: unknown) => v is number;
  readonly fail: (code: string, extra?: Rec | null) => CoreError;
  readonly checkKind: (kind: string, v: unknown) => boolean;
  readonly kindMsg: (kind: string) => string | undefined;
  readonly walk: (o: unknown, T: Table, path: string, E: Emit, W: Emit) => void;
  readonly problems: () => { P: Problem[]; E: Emit; W: Emit };
  readonly hasErrors: (P: readonly Problem[]) => boolean;
  readonly checkOutputs: (
    spec: unknown,
    id: string,
    kinds: readonly unknown[],
    out: (o: Rec, at: string, E: Emit, W: Emit) => unknown,
    E: Emit,
    W: Emit,
  ) => void;
  readonly stats: (a: Iterable<number>) => Stats;
  readonly thin: <T>(a: readonly T[], n?: number) => T[];
  readonly hash32: (s: string, seed: number) => number;
  readonly mulberry32: (a: number) => () => number;
  readonly gauss: (r: () => number) => number;
  readonly cx: (v: unknown) => NumFn;
  readonly scene: (view: View) => Scene;
  readonly fitView: (xs: ArrayLike<number>, ys: ArrayLike<number>, margin?: number | null) => View;
  readonly makeEngine: <P = unknown, S = unknown>(
    def: EngineDef<P, S>,
  ) => { engine: EngineCore; simEngine: SimEngine & { stepper?: CoreStepper<S, P> } };
  readonly stepInstance: <P, S>(def: EngineDef<P, S>, spec: Spec, seed: number, prepared: P | null) => StepInstance;
  readonly pickStep: (spec: Spec | null | undefined, out: unknown) => Record<string, unknown>;
  readonly copyData: (v: unknown) => unknown;
  readonly kit: () => typeof NoemaSimKit;
  readonly rng: (seed: number, name: unknown) => Stream;
  readonly normal: (r: (() => number) & { readonly normal?: Stream['normal'] }) => number;
};
export default api;
