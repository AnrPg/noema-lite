/* The activity runtimes as plugins of the microkernel (kind 'runtime'; docs/ARCHITECTURE.md §6.4). A runtime shows one item of
   pack.activities (html-app@1, sim-spec@1, py-module@1, h5p@1, wasm-module@1, external-embed@1) in a box the activity core gives it,
   and speaks the activity protocol (docs/INTERACTIVE.md §8) with the core through a port. It never reaches the app's globals: what
   it needs from the app (words, the protocol's envelope, the learner's settings, the deployment's switches) comes in a RuntimeHost
   the core hands it when the runtime is created. */
import type { PluginManifest } from '../plugins/index.ts';

/** a message of the activity protocol (ACTP.out in engine/src/32_activities.js): what the core reads from a runtime */
export interface ProtocolMessage {
  readonly p: string;
  readonly v: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly [extra: string]: unknown;
}

/** what a runtime gets from the app (the activity core builds it) */
export interface RuntimeHost {
  /** the app's words (engine.act.* keys of i18n/engine) */
  t(key: string, vars?: Readonly<Record<string, string | number>>): string;
  /** a message of the activity protocol in its envelope */
  message(type: string, payload?: Readonly<Record<string, unknown>>, extra?: Readonly<Record<string, unknown>>): ProtocolMessage;
  /** one of the learner's account settings (S.settings) */
  setting(key: string): unknown;
  /** changes one account setting and saves it */
  setSetting(key: string, value: unknown): void;
  /** the deployment's switches of the runtimes (NOEMA_CONFIG.activities) */
  flags(): Readonly<Record<string, unknown>>;
  /** a problem the learner need not see (the console) */
  warn(...what: readonly unknown[]): void;
  /** the time now (ms) */
  now(): number;
  /** the open pack's activities items by id (ACT.ITEMS) */
  items(): Readonly<Record<string, unknown>>;
  /** the expression language (NoemaCore.engines.expr), or null where it is not loaded */
  expr(): ExprCheck | null;
  /** another runtime as it is registered now (wasm-module@1 shows its own spec with sim-spec@1), or null */
  loadedRuntime(id: string): ActivityRuntime | null;
  /** one of the deployment's settings (NOEMA_CONFIG[key]: py-module@1 reads 'py') */
  config(key: string): unknown;
  /** a number in the learner's format */
  num(n: number, opts?: Intl.NumberFormatOptions): string;
  /** the sim-spec@1 view for a runtime that computes the outputs itself (py-module@1), or null where sim-spec@1 is not here */
  simView(box: HTMLElement, ctx: SimViewContext, opts: SimViewOptions): SimView | null;
}

/** what the sim-spec@1 view gets from the runtime that hosts it */
export interface SimViewContext {
  readonly act: ActivityItem;
  readonly init: ActivityInit | null;
  onMessage(message: ProtocolMessage): void;
  onFail(code: string): void;
}
/** the engine of a hosted sim-spec@1 view: it computes the outputs of the latest inputs */
export interface SimViewRunner {
  run(inputs: unknown, done: (outputs: unknown) => void): void;
  measure(): void;
  close(): void;
}
export interface SimViewOptions {
  readonly engine: { readonly id: string };
  /** the options of the spec's check (py-module@1: { python: true }) */
  readonly check: Readonly<Record<string, unknown>>;
  readonly runner: () => SimViewRunner;
  /** more state saved beside the controls' values */
  readonly stateExtra: () => Readonly<Record<string, unknown>>;
  /** once the spec has passed its check: the runtime adds its own parts to the view's root */
  readonly decorate: (root: HTMLElement) => void;
}
export interface SimView {
  send(type: string, payload?: unknown, extra?: unknown): void;
  close(): void;
  values(): unknown;
  reveal?(): void;
  saveSoon?(): void;
}

/** the expression language as a runtime's checks use it */
export interface ExprCheck {
  check(src: string, opts?: { readonly vars?: readonly string[] }): readonly { readonly msg: string }[];
}

/** an engine of sim-spec@1 that a runtime brings (wasm@1), in the shape the activity core registers (ACT.registerEngine) */
export interface SimEngineDef {
  readonly id: string;
  check?(spec: Readonly<Record<string, unknown>>): readonly string[];
  /** on the page: the spec's expressions compiled once → the inputs of each run */
  prepare?(
    spec: Readonly<Record<string, unknown>>,
    compile: (src: string) => (env: Readonly<Record<string, unknown>>) => unknown,
  ): (env: Readonly<Record<string, unknown>>) => unknown;
  create(spec: Readonly<Record<string, unknown>>, opts?: unknown): { run(inputs: unknown): unknown };
  /** the engine's code as text for its Worker (self.noemaEngine = { create }) */
  readonly workerSource?: string;
}

/** an item of pack.activities as the runtime reads it: untrusted data, checked before use */
export type ActivityItem = Readonly<Record<string, unknown>> & { readonly id: string; readonly runtime: string };

/** what the core sends in init (docs/INTERACTIVE.md §8.2); a runtime reads only what it needs */
export interface ActivityInit {
  readonly activityId?: string;
  readonly exerciseId?: string | null;
  readonly strings?: Readonly<Record<string, unknown>>;
  readonly [field: string]: unknown;
}

/** what the core hands mount() */
export interface MountContext {
  readonly act: ActivityItem;
  readonly init: ActivityInit | null;
  readonly title: string;
  /** a message to the core (checked there by the protocol's anti-corruption layer, as if it came from a frame) */
  onMessage(message: ProtocolMessage): void;
  /** the activity cannot run: a failure code (the core shows the fallback, with failText's words when the runtime has them) */
  onFail(code: string): void;
  /** a runtime that waited (waits()) is now live */
  onLive?(): void;
}

/** what mount() returns: the core's handle on the running activity */
export interface RuntimePort {
  send(type: string, payload?: unknown, extra?: unknown): void;
  close(): void;
  /** the values the checks grader reads (sim-spec@1) */
  values?(): unknown;
  /** after Check (an exercise): what the activity shows then */
  reveal?(): void;
}

/** a runtime's own words for a failure code; restart: the core offers Restart */
export interface FailText {
  readonly text: string;
  readonly restart: boolean;
}

/** a runtime ready for the activity core (ACT.registerRuntime) */
export interface ActivityRuntime {
  readonly id: string;
  readonly version: number;
  mount(box: HTMLElement, ctx: MountContext): RuntimePort;
  /** true while the item shows only a card and holds no live slot (the core waits for onLive) */
  waits?(act: ActivityItem): boolean;
  /** its own words for a failure code (else the core's), for the item that failed */
  failText?(code: string, act?: ActivityItem): FailText | null;
  available?(): boolean;
  unavailable?(): string | null;
  /** the engines of sim-spec@1 it brings (the core registers them when the runtime is made) */
  readonly engines?: readonly SimEngineDef[];
  /** it renders in the app's DOM and takes the height it needs */
  readonly autoHeight?: boolean;
  readonly startTimeoutMs?: number;
}

/** the code of a runtime: made for one host; null when the deployment has it off */
export interface RuntimeModule {
  create(host: RuntimeHost): ActivityRuntime | null;
}

/** where a runtime can run, known before its code is loaded: 'website' = the site over http(s) with a service worker's cache,
    Workers and WebAssembly (never file:// or the one-file bundle); note: the key of the words the fallback shows elsewhere */
export interface RuntimeAvailability {
  readonly where: 'website';
  readonly note: string;
}

/** 'on': on unless config.js switches it off; 'opt-in': off unless config.js sets it to true */
export type RuntimeSwitch = 'on' | 'opt-in';

/** a runtime as the registry knows it before its code is loaded */
export interface RuntimePlugin {
  readonly manifest: PluginManifest;
  readonly switch: RuntimeSwitch;
  /** the engines of sim-spec@1 it brings (src/runtimes/manifests.ts) */
  readonly engines: readonly string[];
  /** where it can run at all, when not everywhere (manifests.ts availableHere) */
  readonly available?: RuntimeAvailability;
  readonly entry: () => Promise<RuntimeModule>;
}
