/* The public boundary of every engine plugin of sim-spec@1 (docs/INTERACTIVE.md §12.6, docs/INTERACTIVE_LIBRARY.md §1). The engines'
   own code (./<name>/<name>.js) is plain ES modules, typed here at the edge only: what the activity core, the pack checker, the
   activity author and the tests call. Codes and numbers cross this boundary, never learner text. */
import type { Plugin, PluginManifest } from '../plugins/index.ts';

/** a problem of a model: the same codes and messages as the engine's Python twin (tools/lib_<name>.py, tools/<name>.py) */
export interface Problem {
  readonly code: string;
  readonly path: string;
  readonly msg: string;
  readonly level: 'error' | 'warning';
}
/** a spec of sim-spec@1, or the part of one an engine computes (its model and outputs): checked by the engine before any use */
export type Spec = Readonly<Record<string, unknown>>;
/** what a run takes: the spec's consts, params and derived values by name (numbers, booleans), and series inputs of a part */
export type Inputs = Readonly<Record<string, unknown>>;
/** what a run gives: the spec's outputs by id (a number, an array of numbers ≤ 2000, a scene, a sound) */
export type Outputs = Record<string, unknown>;
/** a compiled formula of the expression language (kernel/simexpr.js compile) */
export type Compiled = (env: Readonly<Record<string, unknown>>) => unknown;

export interface CreateOptions {
  readonly seed?: number;
  readonly task?: Readonly<Record<string, unknown>>;
  /** a fault-finding bench: the hidden fault (the change to the circuit or the device), never shown to the page */
  readonly faults?: readonly unknown[];
}
/** a step of the parts orchestrator (docs/INTERACTIVE_LIBRARY.md §1.6) */
export interface StepResult {
  readonly out: Outputs;
  readonly dt?: number;
  readonly events?: readonly unknown[];
  readonly fail?: string;
}
/** one instance of an engine on one spec: run (or step) it with inputs */
export interface EngineInstance {
  run?(inputs: Inputs): Outputs;
  measure?(inputs: Inputs, probe: unknown): unknown;
  stepInit?(inputs: Inputs, t0: number): StepResult;
  stepTo?(inputs: Inputs, t: number, dt: number, inbox?: readonly unknown[]): StepResult;
  snapshot?(): number;
  restore?(slot: number): boolean;
}
/** what runs an engine's instances: inline on the page, or in its Worker as self.noemaEngine */
export interface SimEngine {
  create(spec: Spec, opts?: CreateOptions): EngineInstance;
}

/** an engine as the module gives it: the shape ACT.registerEngine takes, without its Worker source */
export interface EngineCore extends SimEngine {
  readonly id: string;
  /** errors of a spec after the common checks (NoemaPackCheck.checkSimSpec), as text */
  check(spec: Spec): string[];
  /** on the main thread: the spec's expressions become numbers, so the worker needs no evaluator */
  prepare?(spec: Spec, compile: (src: string) => Compiled): (env: Inputs) => Inputs;
  readonly bench?: boolean;
  readonly scenes?: boolean;
  readonly stepper?: boolean;
}
/** an engine registered in the app: its Worker bundle as text (defines self.noemaEngine: a SimEngine) */
export interface RegisteredEngine extends EngineCore {
  readonly workerSource: string;
}

/** an engine module: its engine, and the functions the validators and the author call (each engine adds its own, for its tests) */
export interface EngineModule {
  readonly id: string;
  readonly engine: EngineCore;
  /** library engines: the model checker with the Python twin's codes, the model's expressions and string keys, the author's form */
  readonly checkSpec?: (spec: Spec) => Problem[];
  readonly exprs?: (spec: Spec) => Array<[string, string, string[]?]>;
  readonly keys?: (spec: Spec) => Array<[string, string]>;
  readonly table?: Readonly<Record<string, unknown>>;
  readonly [name: string]: unknown;
}
/** a loaded engine as the library hands it out: the module with its registered engine (Worker source included) */
export interface LoadedEngine extends EngineModule {
  readonly engine: RegisteredEngine;
}

/** an engine plugin: its manifest, its code (lazy), and its Worker bundle as text (lazy) */
export interface EnginePlugin extends Plugin<EngineModule> {
  readonly manifest: PluginManifest;
  readonly worker: () => Promise<string>;
}

/** the expression language of sim-spec@1 (kernel/simexpr.js, docs/INTERACTIVE_SIMEXPR.md) */
export interface ExprProblem {
  readonly code: string;
  readonly msg: string;
  readonly at?: number;
}
export interface ExprApi {
  parse(src: string): unknown;
  check(src: string, opts?: { readonly vars?: readonly string[] }): ExprProblem[];
  compile(src: string): Compiled;
  evaluate(src: string, env?: Readonly<Record<string, unknown>>): unknown;
  print(tree: unknown): string;
  readonly FUNCS: Readonly<Record<string, { readonly fn: (...a: number[]) => number; readonly arity?: unknown }>>;
  readonly CONSTS: Readonly<Record<string, number>>;
  readonly LIMITS: Readonly<Record<string, number>>;
}

/** the catalogue of every way an activity can compute (catalog.js, docs/INTERACTIVE_LIBRARY.md §2) */
export interface CatalogEntry {
  readonly id: string;
  readonly layer: 'library' | 'free' | 'plugin';
  /** an engine plugin of src/engines (loaded on demand); false: built into a runtime (formula@1, html-app@1, py-module@1, wasm@1) */
  readonly plugin: boolean;
  readonly file: string;
  readonly slug: string;
  readonly words: readonly string[];
  readonly runtime?: boolean | string;
}
export interface Suggestion {
  readonly id: string;
  readonly layer: string;
  readonly slug: string;
  readonly score: number;
  readonly hits: readonly string[];
}
export interface CatalogApi {
  readonly CATALOG: readonly CatalogEntry[];
  /** the library's engines by field: [field, engine ids] (the #/engines page, the activity author) */
  readonly GROUPS: readonly (readonly [string, readonly string[]])[];
  readonly LIBRARY: readonly string[];
  byId(id: string): CatalogEntry | null;
  suggest(text: string, opts?: { readonly limit?: number }): Suggestion[];
  fold(s: string): string;
}

/** the engine library's model tables as JSON Schemas, for the activity author (kernel/schema.js, docs/INTERACTIVE_LIBRARY.md §1.5) */
export interface SchemaApi {
  readonly PARTS_ID: string;
  readonly STYLES: readonly string[];
  schemaId(engineId: string): string;
  specSchema(engineId: string, table: unknown, simSchema: unknown): unknown;
  partsSchema(engines: ReadonlyArray<{ readonly id: string; readonly table: unknown }>, simSchema: unknown): unknown;
  toSchema(table: unknown, opts?: unknown): unknown;
  ofs(table: unknown, model: unknown, kind: string): string[];
  outKinds(table: unknown): string[];
  titles(table: unknown): unknown;
  symbolic(table: unknown): unknown;
  kindSchema(kind: string): unknown;
}

/** the kernels of the library as modules (their own tests use them; the app reaches them only through the engines) */
export type KernelApi = Readonly<Record<string, unknown>>;
