/* wasm-module@1 and the sim-spec engine wasm@1 (docs/activities-dev/wasm.md, docs/INTERACTIVE_WASM.md).
   A pack may carry a precompiled WebAssembly module (a C / Rust / AssemblyScript simulation core) as an activities item:
     { id, runtime: 'wasm-module@1', wasm: <base64, at most 2 MiB>, sha256, bytes?, abi?: { version: 1, step?, init?, maxPages?,
       budgetMs?, scratch?, initEachStep? }, spec?: <a sim-spec@1 spec whose model is this module>, fallback, strings }
   The pack ships ONLY the .wasm, never JS. The module may import nothing but the host ABI (check.ts inspect, then
   WebAssembly.Module.imports again in the worker). It runs in a dedicated blob: Worker whose network globals are removed before
   anything else (worker.ts); the page reads and sha256-checks the bytes and hands them over. Every call has a time budget: over it,
   the worker is terminated (code 'runaway', restartable). Two ways in:
     · the engine wasm@1 of sim-spec@1 (the runtime's `engines`, which the activity core registers): spec.engine 'wasm@1',
       spec.model { module: <item id>, inputs: [expr…], outputs: [{id, n?}…], step?, init? }, so the sim-spec renderer, its plots
       and the checks grader work unchanged (the sim runtime's 5 s per run is the budget there);
     · the runtime wasm-module@1: an item with its own `spec` is shown by the sim-spec renderer with this engine; and the module's
       `api.load(item)` (NoemaCore.runtimes.load('wasm-module@1')) → a handle { call(fn, inputs, nOut), raw(fn, …ints), restart(),
       close() } for host code.
   No user-visible text here: failures are codes (spec, unsupported, runaway, abi, import, memory, step, worker). */
import type { ActivityItem, ActivityRuntime, RuntimeHost, RuntimeModule, RuntimePort, SimEngineDef } from '../types.ts';
import { abiOf, checkItem, checkModel, ENGINE, isInt, isObj, layoutOf, LIM, RUNTIME, WASM_CHECKS, type WasmReport } from './check.ts';
import { directTail, neutralise, wasmWorker, workerSource, type WorkerAbi } from './worker.ts';

type Obj = Readonly<Record<string, unknown>>;
const coded = (msg: string, code: string, extra?: Obj): Error => Object.assign(new Error(msg), { code }, extra);

interface Pending {
  resolve(m: Obj): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
/** a module running in its own worker (load) */
export interface WasmHandle {
  readonly budgetMs: number;
  exports: unknown;
  readonly report: WasmReport | null;
  state(): 'stopped' | 'loading' | 'ready';
  /** fn(ptr_in, n_in, ptr_out, n_out) over f64: → { out: Float64Array, log, ms, pages } */
  call(
    fn: string | null | undefined,
    inputs: ArrayLike<unknown> | null | undefined,
    nOut: number,
    opt?: { readonly reinit?: boolean },
  ): Promise<Obj>;
  /** an exported function with i32 arguments → { value, log, pages } */
  raw(fn: string, ...args: unknown[]): Promise<Obj>;
  restart(): Promise<WasmHandle>;
  close(): void;
  onRunaway: (() => void) | null;
}

/** the host side: load(item) → a handle in its own worker, each call within the budget */
export function load(item: unknown, o: { readonly budgetMs?: unknown; readonly seed?: unknown } = {}): Promise<WasmHandle> {
  const { problems, report, bytes } = checkItem(item);
  const first = problems[0];
  if (first != null)
    return Promise.reject(coded(first, /^import/.test(first) ? 'import' : /^memory/.test(first) ? 'memory' : 'spec', { problems }));
  if (typeof Worker !== 'function' || typeof Blob !== 'function' || !bytes) return Promise.reject(coded('no worker here', 'worker'));
  const A = abiOf(item),
    budget = isInt(o.budgetMs) ? Math.max(LIM.budgetMin, Math.min(o.budgetMs, LIM.budgetMax)) : A.budgetMs;
  const abi: WorkerAbi = {
    step: A.step,
    init: A.init,
    maxPages: A.maxPages,
    scratch: A.scratch,
    memMin: report?.memory ? report.memory.min : 1,
    memMax: report?.memory ? report.memory.max : null,
  };
  const seed = (isInt(o.seed) ? o.seed : 1) >>> 0;
  const url = URL.createObjectURL(new Blob([workerSource() + '(' + directTail.toString() + ')(self);'], { type: 'text/javascript' }));
  let w: Worker | null = null,
    seq = 0,
    state: 'stopped' | 'loading' | 'ready' = 'stopped';
  const pending = new Map<number, Pending>();
  const killAll = (code: string): void => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(coded(code, code));
    }
    pending.clear();
  };
  function stop(code: string): void {
    try {
      w?.terminate();
    } catch {
      w = null; // already gone
    }
    w = null;
    state = 'stopped';
    killAll(code);
  }
  function send(msg: Obj & { readonly t: string }, transfer?: Transferable[]): Promise<Obj> {
    const worker = w;
    if (!worker) return Promise.reject(coded('stopped', 'stopped'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          stop('runaway');
          reject(coded('runaway', 'runaway'));
          h.onRunaway?.();
        },
        msg.t === 'w:load' ? Math.max(1000, budget) : budget,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
  }
  function start(): Promise<WasmHandle> {
    stop('restart');
    const worker = new Worker(url);
    w = worker;
    state = 'loading';
    worker.onmessage = (e: MessageEvent) => {
      const m = (e.data || {}) as Obj,
        key = m.id as number,
        p = pending.get(key);
      if (!p) return;
      pending.delete(key);
      clearTimeout(p.timer);
      if (m.t === 'w:err') p.reject(coded(String(m.msg), String(m.code)));
      else p.resolve(m);
    };
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      stop('error');
    };
    return send({ t: 'w:load', bytes: (bytes as Uint8Array).slice(), abi, seed }).then(m => {
      state = 'ready';
      h.exports = m.exports;
      return h;
    });
  }
  const h: WasmHandle = {
    budgetMs: budget,
    exports: [],
    report,
    state: () => state,
    call(fn, inputs, nOut, opt = {}) {
      const input = Float64Array.from(inputs || [], v => Number(v));
      return send({
        t: 'w:call',
        fn: fn || A.step,
        input,
        nOut: Math.max(0, Math.min(nOut | 0, LIM.outputs * LIM.points)),
        reinit: opt.reinit ?? A.initEachStep,
      });
    },
    raw: (fn, ...args) => send({ t: 'w:raw', fn, args }),
    restart: () => start(),
    close() {
      stop('closed');
      URL.revokeObjectURL(url);
    },
    onRunaway: null,
  };
  return start();
}

/** what host code and the tests reach through the module (NoemaCore.runtimes.load('wasm-module@1') → module.api) */
export const WASM_API = Object.freeze({
  ...WASM_CHECKS,
  load,
  workerSource,
  _neutralise: neutralise,
  _wasmWorker: wasmWorker,
  _directTail: directTail,
});

/** the engine wasm@1 and the runtime wasm-module@1 for one host */
export function createWasmRuntime(host: RuntimeHost): ActivityRuntime {
  const REG: Record<string, ActivityItem> = {}; // items this runtime mounted (an item with its own spec), besides the pack's
  const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
  const itemOf = (id: unknown): unknown => {
    if (typeof id !== 'string') return null;
    const I = host.items();
    return own(I, id) ? I[id] : own(REG, id) ? REG[id] : null;
  };
  const allItems = (): Obj => Object.assign({}, REG, host.items());
  const engine: SimEngineDef = {
    id: ENGINE,
    /** after the common checks: the model, the item, its sha256, its imports and memory — refused here means the fallback, never instantiation */
    check: spec => checkModel(spec, allItems(), host.expr()),
    /** on the main thread: the inputs' expressions become numbers; the checked bytes travel with each run (the worker keeps one instance per module) */
    prepare(spec, compile) {
      const m = spec.model as Obj,
        it = itemOf(m.module),
        A = abiOf(it),
        { problems, bytes, report } = checkItem(it);
      if (problems.length || !bytes || !report) throw coded('wasm module refused', 'spec');
      const ins = (m.inputs as readonly string[]).map(s => compile(s)),
        { layout, nOut } = layoutOf(spec);
      const M = {
        key: report.sha256,
        bytes,
        nOut,
        layout,
        abi: {
          step: typeof m.step === 'string' && m.step ? m.step : A.step,
          init: typeof m.init === 'string' && m.init ? m.init : A.init,
          maxPages: A.maxPages,
          scratch: A.scratch,
          initEachStep: A.initEachStep,
          memMin: report.memory ? report.memory.min : 1,
          memMax: report.memory ? report.memory.max : null,
        },
      };
      const ev = (f: (env: Obj) => unknown, env: Obj): number => {
        try {
          return Number(f(env));
        } catch {
          return NaN;
        }
      };
      return env => ({ $in: ins.map(f => ev(f, env)), $mod: M });
    },
    /** the sim runtime calls create here only when it cannot start a worker: a module never runs on the page's own thread */
    create() {
      throw coded('wasm@1 runs only in a worker', 'worker');
    },
    workerSource: workerSource(),
  };
  const nothing: RuntimePort = {
    send() {
      /* nothing runs */
    },
    close() {
      /* nothing runs */
    },
    values: () => null,
  };
  return {
    id: RUNTIME,
    version: 1,
    autoHeight: true,
    engines: [engine],
    /** an item with its own spec: the sim-spec renderer with this module as the engine; without one there is nothing to show */
    mount(box, ctx) {
      const a = ctx.act,
        sim = host.loadedRuntime('sim-spec@1');
      REG[a.id] = a;
      if (!sim || !isObj(a.spec)) {
        void Promise.resolve().then(() => {
          ctx.onFail(sim ? 'spec' : 'unsupported');
        });
        return nothing;
      }
      const sp = a.spec;
      const spec = Object.assign({}, sp, { engine: ENGINE, model: Object.assign({}, isObj(sp.model) ? sp.model : {}, { module: a.id }) });
      return sim.mount(box, Object.assign({}, ctx, { act: Object.assign({}, a, { spec }) }));
    },
  };
}

/** the module the registry loads (src/runtimes/plugins.ts) */
const wasmModule: RuntimeModule & { readonly api: typeof WASM_API } = {
  create: host => createWasmRuntime(host),
  api: WASM_API,
};
export default wasmModule;
