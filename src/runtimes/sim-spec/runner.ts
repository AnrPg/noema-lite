/* An engine instance behind one async interface (docs/INTERACTIVE.md §12.6): inline, or in a Worker when the engine has
   workerSource. run(inputs, done): the outputs (a newer run waiting replaces an older one: the latest inputs win);
   measure(inputs, probe, done): one reading of a bench's instrument (queued, never dropped). One job at a time, each ≤ 5 s
   (else the Worker is ended and onFail('runaway')). respec(spec, opts): the same Worker takes another model (queued: the runs
   after it use it) — the mini-apps' engines (html-app@1). step(kind, …): a part's stepper (docs/INTERACTIVE_LIBRARY.md §1.6). */
import type { EngineInstance, EngineOpts, SimEngine } from '../compute.ts';

export const RUN_TIMEOUT = 5000;

export type Done = (out: unknown) => void;
export type StepKind = 'sinit' | 'step' | 'snap' | 'restore';
export interface EngineRunner {
  run(inputs: unknown, done: Done): void;
  measure(inputs: unknown, probe: unknown, done: Done): void;
  respec(spec: unknown, opts?: EngineOpts): void;
  step(kind: StepKind, inputs: unknown, a: unknown, b: unknown, c: unknown, done: Done): void;
  close(): void;
  inWorker(): boolean;
}
/** what makes a runner (the parts orchestrator takes another in tests) */
export type MakeRunner = (E: SimEngine, spec: unknown, opts: EngineOpts, onFail: (why: string) => void) => EngineRunner;

type Job =
  | { t: 'create'; spec: unknown; opts: EngineOpts }
  | { t: 'run'; inputs: unknown; done: Done }
  | { t: 'measure'; inputs: unknown; probe: unknown; done: Done }
  | { t: StepKind; inputs: unknown; a: unknown; b: unknown; c: unknown; done: Done };

const BRIDGE =
  "self.onmessage=function(e){var m=e.data;try{if(m.t==='create'){self.__i=null;self.__i=self.noemaEngine.create(m.spec,m.opts);return;}var i=self.__i,r=m.t==='measure'?i.measure(m.inputs,m.probe):m.t==='sinit'?i.stepInit(m.inputs,m.a):m.t==='step'?i.stepTo(m.inputs,m.a,m.b,m.c):m.t==='snap'?i.snapshot():m.t==='restore'?i.restore(m.a):(i.run||i.step).call(i,m.inputs);postMessage({t:'out',id:m.id,out:r});}catch(x){postMessage({t:'err',id:m.id,msg:String(x&&x.message||x)});}};";

let seq = 0;

/** the call of one job on an inline instance */
function callInline(inst: EngineInstance, job: Exclude<Job, { t: 'create' }>): unknown {
  switch (job.t) {
    case 'measure':
      return inst.measure?.(job.inputs, job.probe);
    case 'sinit':
      return inst.stepInit?.(job.inputs, job.a);
    case 'step':
      return inst.stepTo?.(job.inputs, job.a, job.b, job.c);
    case 'snap':
      return inst.snapshot?.();
    case 'restore':
      return inst.restore?.(job.a);
    case 'run':
      return inst.run ? inst.run(job.inputs) : inst.step?.(job.inputs);
  }
}

export function engineRunner(
  E: SimEngine,
  spec: unknown,
  opts: EngineOpts,
  onFail: (why: string) => void,
  warn: (...what: readonly unknown[]) => void = () => undefined,
): EngineRunner {
  let worker: Worker | null = null,
    url: string | null = null,
    inst: EngineInstance | null = null,
    busy: { id: number; done: Done } | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    dead = false;
  const queue: Job[] = [];
  if (E.workerSource && typeof Worker === 'function') {
    try {
      url = URL.createObjectURL(new Blob([E.workerSource + '\n;' + BRIDGE], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e: MessageEvent<unknown>) => {
        const m = e.data as { t?: string; id?: number; out?: unknown; msg?: string } | null;
        if (!busy || !m || m.id !== busy.id) return;
        const d = busy.done;
        finish();
        if (m.t === 'err') warn('[noema] sim-spec engine', E.id, m.msg);
        d(m.t === 'out' ? m.out : null);
      };
      w.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        warn('[noema] sim-spec engine worker', E.id, e.message);
        const d = busy?.done;
        finish();
        d?.(null);
      };
      w.postMessage({ t: 'create', spec, opts });
      worker = w;
    } catch (e) {
      warn('[noema] sim-spec: no worker here, the engine runs inline', e);
      worker = null;
    }
  }
  if (!worker) inst = E.create(spec, opts);
  function finish(): void {
    clearTimeout(timer);
    busy = null;
    pump();
  }
  function pump(): void {
    if (dead || busy) return;
    const job = queue.shift();
    if (!job) return;
    if (job.t === 'create') {
      // another model for the same instance (respec): no answer; the runs queued after it use it
      if (worker) worker.postMessage({ t: 'create', spec: job.spec, opts: job.opts });
      else {
        inst = null;
        try {
          inst = E.create(job.spec, job.opts);
        } catch (e) {
          warn('[noema] sim-spec engine', E.id, e);
        }
      }
      pump();
      return;
    }
    if (!worker) {
      const t0 = performance.now();
      let out: unknown = null;
      try {
        out = inst ? callInline(inst, job) : null;
      } catch (e) {
        warn('[noema] sim-spec engine', E.id, e);
      }
      const ms = performance.now() - t0;
      if (ms > 50) warn(`[noema] sim-spec: engine ${E.id} took ${String(Math.round(ms))} ms inline; give it a workerSource`);
      job.done(out);
      pump();
      return;
    }
    busy = { id: ++seq, done: job.done };
    timer = setTimeout(() => {
      if (!busy) return;
      dead = true;
      close();
      onFail('runaway');
    }, RUN_TIMEOUT);
    const ex = job.t === 'sinit' || job.t === 'step' || job.t === 'restore' ? { a: job.a, b: job.b, c: job.c } : {};
    worker.postMessage({ t: job.t, id: busy.id, inputs: job.inputs, probe: job.t === 'measure' ? job.probe : undefined, ...ex });
  }
  function run(inputs: unknown, done: Done): void {
    if (dead) return;
    // the latest inputs win (never ahead of a new model)
    const c = queue.map(j => j.t).lastIndexOf('create'),
      i = queue.findIndex((j, k) => k > c && j.t === 'run');
    if (i >= 0) queue[i] = { t: 'run', inputs, done };
    else queue.push({ t: 'run', inputs, done });
    pump();
  }
  function respec(s2: unknown, o2?: EngineOpts): void {
    if (dead) return;
    queue.push({ t: 'create', spec: s2, opts: o2 ?? opts });
    pump();
  }
  function measure(inputs: unknown, probe: unknown, done: Done): void {
    if (dead) return;
    queue.push({ t: 'measure', inputs, probe, done });
    pump();
  }
  /** kind 'sinit' (inputs, t0) → {out} | 'step' (inputs, t, dt, inbox) → {out, dt, events} | 'snap' → slot (−1: cannot) |
      'restore' (slot) → true/false; queued like a measurement (never dropped) */
  function step(kind: StepKind, inputs: unknown, a: unknown, b: unknown, c: unknown, done: Done): void {
    if (dead) return;
    queue.push({ t: kind, inputs, a, b, c, done });
    pump();
  }
  function close(): void {
    dead = true;
    clearTimeout(timer);
    queue.length = 0;
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    worker = null;
  }
  return { run, measure, respec, step, close, inWorker: () => !!worker };
}
