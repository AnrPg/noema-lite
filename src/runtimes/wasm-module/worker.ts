/* wasm-module@1: the code that runs in the module's own Worker. Each function here is self-contained (it reads nothing of this
   file's scope), because the Worker's source is their text (workerSource): neutralise() first, then wasmWorker(), then a tail —
   directTail() for NoemaWasm.load, or the sim runtime's own bridge for the engine wasm@1. tests/activities_wasm.js runs them in
   node too. */

/** the ABI the worker hands instantiate (abiOf + the memory's limits from the report) */
export interface WorkerAbi {
  readonly step: string;
  readonly init: string;
  readonly maxPages: number;
  readonly scratch: number | null;
  readonly initEachStep?: boolean;
  readonly memMin?: number;
  readonly memMax?: number | null;
}
/** an instantiated module */
export interface WasmInstance {
  call(fn: string, input: ArrayLike<number>, nOut: number): Float64Array;
  readonly log: string[];
  readonly exports: string[];
  init(): void;
  reseed(): void;
  raw(fn: string, args?: readonly unknown[]): number | null;
  pages(): number;
  takeLog(): string[];
}
/** what one run of the engine wasm@1 gets from prepare (on the page) */
export type WasmModuleRun = NonNullable<WasmRunInput['$mod']>;
export interface WasmRunInput {
  readonly $in: readonly number[];
  readonly $mod?: {
    readonly key: string;
    readonly bytes: Uint8Array;
    readonly nOut: number;
    readonly layout: readonly { readonly id: string; readonly off: number; readonly n: number; readonly series: boolean }[];
    readonly abi: WorkerAbi;
  };
}
/** the global scope of the worker as these functions use it */
export interface WorkerScope {
  performance?: { now(): number };
  console?: { log(...a: unknown[]): void };
  noemaWasmCore?: { instantiate(src: BufferSource | WebAssembly.Module, abi: WorkerAbi, seed: number): WasmInstance };
  noemaEngine?: {
    create(spec: unknown, opts?: { seed?: number }): { run(inp: WasmRunInput): Record<string, number | number[] | undefined> };
  };
  onmessage?: ((e: { data: unknown }) => void) | null;
  postMessage?: (m: unknown, transfer?: Transferable[]) => void;
}

/** removes every way to the network from a worker's global scope (and its prototypes) before any other code runs there */
export function neutralise(g: object): void {
  const K = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'WebSocketStream',
    'EventSource',
    'WebTransport',
    'importScripts',
    'Worker',
    'SharedWorker',
    'BroadcastChannel',
    'indexedDB',
    'caches',
    'Request',
    'navigator',
    'RTCPeerConnection',
  ];
  for (const k of K)
    for (let o: object | null = g; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      try {
        Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false, enumerable: false });
      } catch {
        try {
          Reflect.deleteProperty(o, k);
        } catch {
          continue; // neither: the next prototype
        }
      }
    }
}

/** defines g.noemaWasmCore (instantiate + call) and g.noemaEngine (the wasm@1 adapter of sim-spec@1) */
export function wasmWorker(g: WorkerScope): void {
  const ABI: Readonly<Record<string, number>> = { noema_log: 1, noema_now: 1, noema_random: 1 },
    LOG_LINE = 200,
    LOG_LINES = 100;
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fail = (code: string, msg?: string): Error => Object.assign(new Error(msg || code), { code });
  const clock = (): number => (g.performance || Date).now();
  type Fn = (...a: number[]) => unknown;
  /** bytes (or a WebAssembly.Module) + abi → an instance { call(fn, Float64Array, nOut) → Float64Array, raw(fn, args), reseed(), log } */
  function instantiate(src: BufferSource | WebAssembly.Module, abi: WorkerAbi, seed: number): WasmInstance {
    const mod = src instanceof WebAssembly.Module ? src : new WebAssembly.Module(src);
    for (const im of WebAssembly.Module.imports(mod)) {
      // the second line of the import check (the first: inspect on the page)
      const okm = im.module === 'noema' || im.module === 'env';
      if (!okm || !((im.kind === 'function' && ABI[im.name]) || (im.kind === 'memory' && im.name === 'memory')))
        throw fail('import', im.module + '.' + im.name);
    }
    const log: string[] = [],
      t0 = clock();
    let rand = rng(seed),
      mem: WebAssembly.Memory | null = null,
      dropped = 0;
    const env: Record<string, unknown> = {
      noema_log(p: number, n: number) {
        if (log.length >= LOG_LINES) {
          dropped++;
          return;
        }
        try {
          const len = Math.max(0, Math.min(n >>> 0, LOG_LINE)),
            u = new Uint8Array((mem as WebAssembly.Memory).buffer, p >>> 0, len);
          log.push(new TextDecoder().decode(u.slice()));
        } catch {
          log.push('?');
        }
      },
      noema_now: () => Math.round((clock() - t0) * 10) / 10,
      noema_random: () => rand(),
    };
    const imp: Record<string, Record<string, unknown>> = { noema: env, env };
    const memImp = WebAssembly.Module.imports(mod).find(i => i.kind === 'memory');
    if (memImp) {
      const m0 = Math.max(1, abi.memMin || 1);
      mem = new WebAssembly.Memory({
        initial: m0,
        maximum: Math.max(m0, Math.min(abi.memMax == null ? abi.maxPages : abi.memMax, abi.maxPages)),
      });
      imp[memImp.module] = Object.assign({}, env, { memory: mem });
    }
    const inst = new WebAssembly.Instance(mod, imp as WebAssembly.Imports),
      X = inst.exports as Record<string, unknown>;
    if (!mem) {
      const xm = X.memory;
      if (!(xm instanceof WebAssembly.Memory)) throw fail('memory', 'no exported memory');
      mem = xm;
    }
    const memory = mem;
    const fnOf = (name: string): Fn | null => {
      const f = X[name];
      return typeof f === 'function' ? (f as Fn) : null;
    };
    if (!fnOf(abi.step)) throw fail('abi', 'no step ' + abi.step);
    let area: { need: number; pin: number; pout: number } | null = null;
    function io(nIn: number, nOut: number): { need: number; pin: number; pout: number } {
      const need = 8 * (nIn + nOut);
      if (!area || area.need < need) {
        let base = abi.scratch;
        const alloc = fnOf('alloc');
        if (alloc) base = (alloc(need) as number) >>> 0;
        if (!(base != null && base >= 0)) throw fail('abi', 'no input/output area');
        area = { need, pin: base, pout: base + 8 * nIn };
      }
      if (area.pout - area.pin !== 8 * nIn) area = Object.assign({}, area, { pout: area.pin + 8 * nIn });
      if (area.pin + need > memory.buffer.byteLength) throw fail('abi', 'the input/output area is outside the memory');
      return area;
    }
    function call(fn: string, input: ArrayLike<number>, nOut: number): Float64Array {
      const f = fnOf(fn);
      if (!f) throw fail('abi', 'no function ' + fn);
      const a = io(input.length, nOut);
      let dv = new DataView(memory.buffer);
      for (let i = 0; i < input.length; i++) dv.setFloat64(a.pin + 8 * i, input[i] ?? NaN, true);
      const r = f(a.pin, input.length, a.pout, nOut);
      if (typeof r === 'number' && r !== 0) throw fail('step', 'status ' + String(r));
      dv = new DataView(memory.buffer); // (the memory may have grown)
      if (a.pout + 8 * nOut > memory.buffer.byteLength) throw fail('abi', 'outputs outside the memory');
      const out = new Float64Array(nOut);
      for (let i = 0; i < nOut; i++) out[i] = dv.getFloat64(a.pout + 8 * i, true);
      return out;
    }
    const self_: WasmInstance = {
      call,
      log,
      exports: Object.keys(X),
      init() {
        const f = fnOf(abi.init);
        if (f) f(seed | 0);
      },
      reseed() {
        rand = rng(seed);
      },
      raw(fn, args) {
        const f = fnOf(fn);
        if (!f) throw fail('abi', 'no function ' + fn);
        const r = f(...(args || []).map(v => (v as number) | 0));
        return typeof r === 'number' ? r : null;
      },
      pages: () => memory.buffer.byteLength / 65536,
      takeLog() {
        const l = log.splice(0);
        if (dropped) {
          l.push('… ' + String(dropped) + ' more');
          dropped = 0;
        }
        return l;
      },
    };
    self_.init();
    return self_;
  }
  g.noemaWasmCore = { instantiate };
  /** wasm@1 in sim-spec@1: create(spec, {seed}) → { run(inputs) } — inputs come from prepare: { $in: [numbers], $mod: {key, bytes, abi, layout} } */
  g.noemaEngine = {
    create(_spec, opts) {
      const seed = (opts?.seed ?? 0) >>> 0;
      let inst: WasmInstance | null = null,
        key: string | null = null;
      return {
        run(inp) {
          const M = inp.$mod;
          if (!M) throw fail('abi', 'no module');
          if (!inst || key !== M.key) {
            inst = instantiate(M.bytes, M.abi, seed);
            key = M.key;
          } else if (M.abi.initEachStep) {
            inst.reseed();
            inst.init();
          }
          const out = inst.call(M.abi.step, inp.$in, M.nOut),
            r: Record<string, number | number[] | undefined> = {};
          for (const L of M.layout) r[L.id] = L.series ? Array.from(out.subarray(L.off, L.off + L.n)) : out[L.off];
          const lg = inst.takeLog();
          if (lg.length && g.console) g.console.log('[noema] wasm', lg.slice(0, 10).join(' | '));
          return r;
        },
      };
    },
  };
}

/** the direct protocol of NoemaWasm.load (appended after the core in its own worker; the sim runtime appends its own bridge instead) */
export function directTail(g: WorkerScope): void {
  let inst: WasmInstance | null = null;
  const clock = (): number => (g.performance || Date).now();
  const post = (m: unknown, transfer?: Transferable[]): void => {
    if (g.postMessage) g.postMessage(m, transfer);
  };
  g.onmessage = e => {
    const m = (e.data || {}) as {
      t?: string;
      id?: number;
      bytes?: Uint8Array;
      abi?: WorkerAbi;
      seed?: number;
      fn?: string;
      input?: Float64Array;
      nOut?: number;
      reinit?: boolean;
      args?: unknown[];
    };
    try {
      const core = g.noemaWasmCore;
      if (!core) throw Object.assign(new Error('no core'), { code: 'abi' });
      if (m.t === 'w:load') {
        inst = core.instantiate(m.bytes as Uint8Array, m.abi as WorkerAbi, (m.seed ?? 0) >>> 0);
        post({ t: 'w:ready', id: m.id, exports: inst.exports, log: inst.takeLog(), pages: inst.pages() });
        return;
      }
      if (!inst) throw Object.assign(new Error('not loaded'), { code: 'abi' });
      const t0 = clock();
      if (m.t === 'w:call') {
        if (m.reinit) {
          inst.reseed();
          inst.init();
        }
        const out = inst.call(m.fn ?? '', m.input ?? [], m.nOut ?? 0);
        post({ t: 'w:out', id: m.id, out, log: inst.takeLog(), ms: clock() - t0, pages: inst.pages() }, [out.buffer]);
        return;
      }
      if (m.t === 'w:raw') {
        const v = inst.raw(m.fn ?? '', m.args);
        post({ t: 'w:out', id: m.id, value: v, log: inst.takeLog(), pages: inst.pages() });
        return;
      }
    } catch (x) {
      const c = x != null && typeof x === 'object' && 'code' in x ? x.code : undefined;
      post({
        t: 'w:err',
        id: m.id,
        code: c || (x instanceof WebAssembly.RuntimeError ? 'trap' : x instanceof WebAssembly.LinkError ? 'import' : 'error'),
        msg: String((x instanceof Error && x.message) || x).slice(0, 300),
      });
    }
  };
}

/** the worker's source: the network gone first, then the core (the sim runtime or NoemaWasm.load adds its tail) */
export const workerSource = (): string => '"use strict";(' + neutralise.toString() + ')(self);\n(' + wasmWorker.toString() + ')(self);\n';
