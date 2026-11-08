/* What the runtimes that compute (sim-spec@1, html-app@1's engines) get from the app through the RuntimeHost: the engines the
   activity core has (its own, formula@1 and wasm@1, then the engine library's once loaded), the expression language, the
   content checks of sim-spec@1 and the pack's parts. Shapes only: the runtimes never import the engine library or the content
   checks (they are other layers); the core hands them over (engine/src/32_activities.js HOST). */

/** the names an expression reads */
export type Env = Record<string, unknown>;
/** a compiled expression of the expression language (NoemaCore.engines.expr.compile) */
export type Compiled = (env: Readonly<Env>) => unknown;
export type Compile = (src: string) => Compiled;

/** an engine instance (src/engines makeEngine, or a registered one): run, a bench's measure, a part's stepper */
export interface EngineInstance {
  run?(inputs: unknown): unknown;
  step?(inputs: unknown): unknown;
  measure?(inputs: unknown, probe: unknown): unknown;
  stepInit?(inputs: unknown, t0: unknown): unknown;
  stepTo?(inputs: unknown, t: unknown, dt: unknown, inbox: unknown): unknown;
  snapshot?(): unknown;
  restore?(slot: unknown): unknown;
}

/** the options an engine instance is made with */
export interface EngineOpts {
  readonly seed: number;
  readonly task: Readonly<Record<string, unknown>>;
  readonly faults?: unknown;
}

/** an engine of sim-spec@1 as the core has it (ACT.engine(id)) */
export interface SimEngine {
  readonly id: string;
  check?(spec: unknown): unknown;
  create(spec: unknown, opts: EngineOpts): EngineInstance;
  /** the engine's expressions → numbers on the page's thread (wasm@1, the plugins) */
  prepare?(spec: unknown, compile: Compile): (env: Env) => unknown;
  /** the engine's code as text: it runs in a Worker */
  readonly workerSource?: string;
  /** it takes measurements (a fault bench) */
  readonly bench?: boolean;
  readonly stepper?: boolean;
}

/** a unit of the parts plan (src/features/content partsPlan) */
export interface PlanUnit {
  readonly k: 'derived' | 'part' | 'loop' | 'cosim';
  readonly id?: string;
  readonly i?: number;
  readonly parts?: readonly string[];
  readonly derived?: readonly string[];
}
export interface PartsPlan {
  readonly parts: readonly Readonly<Record<string, unknown>>[];
  readonly order: readonly PlanUnit[];
  readonly errors: readonly string[];
  readonly cycles: readonly (readonly string[])[];
}

/** the content checks of sim-spec@1 (NoemaCore.content) that the runtimes use */
export interface SimContent {
  checkSimSpec(spec: unknown, tables: unknown, engines: readonly string[] | null, opts?: unknown): string[];
  partsPlan(spec: unknown, lib: unknown): PartsPlan;
  partSpec(spec: unknown, part: unknown): Record<string, unknown>;
  partMsg(msg: string, where: string): string;
  resolveParts(spec: unknown, lib: unknown, errors: string[]): readonly { readonly p: Readonly<Record<string, unknown>> }[] | null;
  readonly ACTIVITY_RULES?: { readonly PARTS_LIM?: { readonly iter: number; readonly macro: number; readonly points: number } };
}

/** the compute side of the app, as the activity core has it */
export interface ComputeHost {
  /** an engine ready to run, or null (not one, or not loaded yet) */
  engine(id: string): SimEngine | null;
  /** every engine id this app has, loaded or not */
  engines(): readonly string[];
  /** the general engines of the library (NoemaCore.engines.catalog.LIBRARY): the ones a mini-app may ask for */
  library(): readonly string[];
  /** the expression language's compiler, or null where it is not loaded */
  compile(src: string): Compiled;
  /** the content checks, or null where they are not loaded */
  content(): SimContent | null;
  /** the open pack's parts (activities/_parts), or null */
  parts(): Readonly<Record<string, unknown>> | null;
}
