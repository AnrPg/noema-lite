/* noema-lite — what the content checks need from outside the domain, injected (the domain imports no engine): the expression
   language of sim-spec@1 and the engines of the library, each with its own model checks (src/engines, NoemaCore.engines).
   composition/ hands the real ones in (the app: the engines it has loaded; the Node tools and the connector: all of them). A
   check whose engine is not given says so ("… is not loaded here"), never passes it silently. */

export interface ExprIssue {
  readonly msg: string;
}
/** the expression language (src/engines/kernel/simexpr.ts): its problems, and its tree for the names an expression uses */
export interface ExprChecker {
  check(src: string, opts?: { readonly vars?: readonly string[] }): readonly ExprIssue[];
  parse(src: string): unknown;
}
/** a problem an engine finds in its model (src/engines/types.ts Problem) */
export interface EngineIssue {
  readonly level: string;
  readonly path?: string;
  readonly msg: string;
}
/** the checks of one engine: its spec (checkSpec), the expressions and string keys of its model, its circuit or device (check)
    and the faults of a bench (checkFaults) — each optional, as the engine has them */
export interface EngineChecks {
  readonly checkSpec?: (spec: Readonly<Record<string, unknown>>) => readonly EngineIssue[];
  readonly exprs?: (spec: Readonly<Record<string, unknown>>) => readonly (readonly [string, string, (readonly string[])?])[];
  readonly keys?: (spec: Readonly<Record<string, unknown>>) => readonly (readonly [unknown, string])[];
  readonly check?: (model: unknown) => readonly EngineIssue[];
  readonly checkFaults?: (model: unknown, apply: readonly unknown[]) => readonly EngineIssue[];
}
/** the checks of the activity runtimes that read binary packages (src/runtimes/wasm-module, src/runtimes/external-embed,
    src/runtimes/h5p: the runtimes themselves use them before they run an item) */
export interface WasmChecks {
  checkItem(item: unknown): { readonly problems: readonly string[] };
  /** expr: the expression language that checks the model's inputs (null: they are not checked here) */
  checkModel(spec: unknown, items: Readonly<Record<string, unknown>>, expr: ExprChecker | null): readonly string[];
}
export interface EmbedChecks {
  check(item: unknown): { readonly errors: readonly string[]; readonly warnings: readonly string[] };
  readonly PROVIDERS: readonly unknown[];
}
export interface H5PChecks {
  /** the files of a .h5p (zip) package by path, or a rejection when it is not one */
  unzip(bytes: Uint8Array): Promise<Readonly<Record<string, Uint8Array>>>;
  check(files: Readonly<Record<string, Uint8Array>>): { readonly errors: readonly string[]; readonly warnings: readonly string[] };
}
export interface CheckEnv {
  /** the expression language, or null where it is not loaded */
  readonly expr: ExprChecker | null;
  /** the checks of an engine of the library (e.g. "ode@1", "circuit-mna@1"), or null where it is not loaded */
  engine(id: string): EngineChecks | null;
  /** the runtimes' own checks, or null where they are not loaded */
  readonly wasm: WasmChecks | null;
  readonly embed: EmbedChecks | null;
  readonly h5p: H5PChecks | null;
}
/** the engine library as a root has it (src/engines/library.ts EngineLibrary, NoemaCore.engines): its expression language and
    its loaded engines */
export interface EngineSource {
  readonly expr: ExprChecker | null;
  loaded(id: string): unknown;
}
/** the runtimes' checkers as a root has them when a check runs (src/runtimes RUNTIME_CHECKS, and the runtimes still loaded as
    scripts: the page, or the scope that ran them); null where one is not loaded */
export interface RuntimeCheckers {
  readonly wasm: WasmChecks | null;
  readonly embed: EmbedChecks | null;
  readonly h5p: H5PChecks | null;
}
export type RuntimeHost = () => RuntimeCheckers;

/** the CheckEnv of a root: the library's expression language and loaded engines, the runtimes' checkers as they are when a check
    runs (the app's runtimes load after the core; the connector's and the Node tools' scope is filled after the checks are made) */
export function envOf(engines: EngineSource, host: RuntimeHost): CheckEnv {
  return {
    expr: engines.expr,
    engine: (id: string) => engines.loaded(id) as EngineChecks | null,
    get wasm() {
      return host().wasm;
    },
    get embed() {
      return host().embed;
    },
    get h5p() {
      return host().h5p;
    },
  };
}
/** no expression language and no engine: the checks that need them say they are not loaded here */
export const NO_ENGINES: CheckEnv = { expr: null, engine: () => null, wasm: null, embed: null, h5p: null };
