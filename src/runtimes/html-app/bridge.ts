/* The engines of a mini-app (html-app@1; docs/INTERACTIVE.md §8.1, docs/INTERACTIVE_LIBRARY.md §4). A mini-app whose registry entry
   lists engines of the library ("engines": ["graph@1"]) asks for them with noema.engine(id).check(spec) / .run(spec, inputs, {seed}).
   The frame never gets a Worker (its policy stays as it is): the HOST checks every request, runs the model in the library engine's
   own Worker (the sim-spec@1 runner, ../sim-spec/runner.ts, with its 5 s limit and termination) and sends back only the outputs the
   spec names, as data. Only the engines of the library (pure, bounded, no hidden state; never formula@1, which computes nothing, nor
   a plugin with a fault bench), only those the registry entry lists, only in their Worker. Per mini-app and engine: one Worker, made
   on the first run and reused (another model goes to the same Worker), ended when the mini-app is unmounted; one run at a time and
   one waiting (a newer run replaces the waiting one: "superseded"); each run ≤ 5 s (else "timeout"; after 3 the engine is off for
   this mount); ≤ 30 requests a second. noema.sim(spec).run(inputs) runs several of them as the parts of one spec (docs/INTERACTIVE.md
   §12.8) through the parts orchestrator (../sim-spec/parts.ts). Every field is checked; a failure is an answer with a code, never a
   crash. */
import type { ComputeHost, EngineOpts } from '../compute.ts';
import { str } from '../dom.ts';
import { partsRunner, type PartsContext, type PartsRunner } from '../sim-spec/parts.ts';
import { engineRunner, type EngineRunner, type MakeRunner } from '../sim-spec/runner.ts';

/* i18n-ignore-start */ // code

export const ENG = { max: 8, inputs: 64, errors: 20, outBytes: 512 * 1024, perSec: 30, timeouts: 3 } as const;
const IN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

type Obj = Readonly<Record<string, unknown>>;
type Inputs = Record<string, number | boolean>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
/** the size of a message as the protocol counts it (ACTP.size) */
const size = (v: unknown): number => {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
};

/** a request of the mini-app, already checked by the protocol's rules (engine:check | engine:run | sim:run, with an id) */
export interface EngineRequest {
  readonly type: string;
  readonly id: string;
  readonly payload: Obj;
}
export type Reply = (type: string, payload: Obj, extra: Obj) => void;
/** what the bridge needs from the app */
export interface BridgeHost {
  readonly compute: ComputeHost;
  warn(...what: readonly unknown[]): void;
}
/** what the bridge runs with (a test gives its own): the engine runner, the parts orchestrator, whether Workers exist here */
export interface BridgeDeps {
  readonly runner?: MakeRunner;
  readonly parts?: (cx: PartsContext, spec: Obj, opts: Partial<EngineOpts>, onFail: (why: string) => void) => PartsRunner;
  readonly workers?: boolean;
}
export interface EngineBridge {
  handle(m: EngineRequest): void;
  close(): void;
  readonly engines: readonly string[];
}

/** the engines the registry entry lists */
export const declaredOf = (act: Obj): string[] =>
  Array.isArray(act.engines) ? [...new Set(act.engines.filter((x): x is string => typeof x === 'string'))].slice(0, ENG.max) : [];

/** the declared engines this app can run for a mini-app: of the library, loaded (the core loads them before the mount), with a Worker source, Workers here */
export function enginesFor(cmp: ComputeHost, act: Obj, workers: boolean = typeof Worker === 'function'): string[] {
  const lib = new Set(cmp.library());
  return declaredOf(act).filter(id => lib.has(id) && !!cmp.engine(id)?.workerSource && workers);
}

interface Job {
  readonly rid: string;
  readonly spec: Obj;
  readonly key: string;
  readonly inputs: Inputs;
  readonly seed: number;
}
interface Slot {
  runner: EngineRunner | null;
  key: string | null;
  seed: number | null;
  checked: string | null;
  errs: string[];
  busy: Job | null;
  next: Job | null;
  timeouts: number;
}
interface SimJob {
  readonly rid: string;
  readonly full: Obj;
  readonly key: string;
  readonly consts: Obj;
  readonly seed: number;
}

class Refusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function engineBridge(host: BridgeHost, act: Obj, seed0: unknown, reply: Reply, deps: BridgeDeps = {}): EngineBridge {
  const cmp = host.compute,
    warn = (...w: readonly unknown[]): void => {
      host.warn(...w);
    };
  const makeRunner: MakeRunner = deps.runner ?? ((E, spec, opts, onFail) => engineRunner(E, spec, opts, onFail, warn));
  const makeParts = deps.parts ?? partsRunner;
  const declared = new Set(declaredOf(act)),
    allowed = new Set(enginesFor(cmp, act, deps.workers)),
    slots = new Map<string, Slot>();
  let closed = false,
    win: number[] = [];
  const seedOf = (p: unknown): number => (p == null ? Number(seed0) >>> 0 || 1 : Number(p) >>> 0);
  const no = (rid: string, code: string, message?: string | null, errors?: readonly string[]): void => {
    reply(
      'engine:result',
      { ok: false, code, ...(message ? { message: message.slice(0, 300) } : {}), ...(errors ? { errors } : {}) },
      { re: rid },
    );
  };
  const slot = (id: string): Slot => {
    let s = slots.get(id);
    if (!s) {
      s = { runner: null, key: null, seed: null, checked: null, errs: [], busy: null, next: null, timeouts: 0 };
      slots.set(id, s);
    }
    return s;
  };
  /** the model part of a sim-spec@1 spec: {model, outputs} (anything else is ignored) → [clean spec, its key] | null */
  function cleanSpec(id: string, spec: unknown): [Obj, string] | null {
    if (!isObj(spec) || !isObj(spec.model) || !Array.isArray(spec.outputs)) return null;
    const c = { engine: id, model: spec.model, outputs: spec.outputs };
    try {
      return [c, JSON.stringify(c)];
    } catch {
      return null;
    }
  }
  /** the engine's own checks (cached per model) → [message] */
  function errorsOf(id: string, c: Obj, key: string): string[] {
    const s = slot(id);
    if (s.checked === key) return s.errs;
    let es: string[];
    try {
      const r = cmp.engine(id)?.check?.(c);
      es = (Array.isArray(r) ? r : []).map(x => str(x).slice(0, 300));
    } catch (e) {
      es = ['the model cannot be checked: ' + str(e instanceof Error ? e.message : e).slice(0, 200)];
    }
    s.checked = key;
    s.errs = es.slice(0, ENG.errors);
    return s.errs;
  }
  function inputsOf(v: unknown): Inputs | null {
    if (v == null) return {};
    if (!isObj(v)) return null;
    const ks = Object.keys(v);
    if (ks.length > ENG.inputs) return null;
    const r: Inputs = {};
    for (const k of ks) {
      const x = v[k];
      if (!IN_NAME.test(k) || !((typeof x === 'number' && isFinite(x)) || typeof x === 'boolean')) return null;
      r[k] = x;
    }
    return r;
  }
  function startNext(id: string, s: Slot): void {
    const n = s.next;
    s.next = null;
    if (n) {
      if (allowed.has(id)) start(id, n);
      else no(n.rid, 'unavailable');
    }
  }
  function start(id: string, job: Job): void {
    const s = slot(id),
      E = cmp.engine(id);
    s.busy = job;
    const opts: EngineOpts = { seed: job.seed, task: {} };
    try {
      if (!E) throw new Refusal('unavailable');
      if (!s.runner) {
        s.runner = makeRunner(E, job.spec, opts, why => {
          // the run took longer than the limit: the Worker is ended
          const b = s.busy;
          s.runner = null;
          s.key = null;
          s.busy = null;
          s.timeouts++;
          if (s.timeouts >= ENG.timeouts) allowed.delete(id);
          if (b) no(b.rid, why === 'runaway' ? 'timeout' : 'failed', why === 'runaway' ? 'the engine took longer than 5 s' : null);
          startNext(id, s);
        });
        if (!s.runner.inWorker()) {
          s.runner.close();
          s.runner = null;
          allowed.delete(id);
          throw new Refusal('unavailable');
        }
        s.key = job.key;
        s.seed = job.seed;
      } else if (s.key !== job.key || s.seed !== job.seed) {
        s.runner.respec(job.spec, opts);
        s.key = job.key;
        s.seed = job.seed;
      }
      s.runner.run(job.inputs, out => {
        if (closed || s.busy !== job) return;
        s.busy = null;
        if (out == null || typeof out !== 'object') no(job.rid, 'failed', 'the engine could not compute this model');
        else if (size(out) > ENG.outBytes) no(job.rid, 'too-big', 'the outputs are larger than 512 KB');
        else reply('engine:result', { ok: true, outputs: out }, { re: job.rid });
        const n = s.next;
        s.next = null;
        if (n) start(id, n);
      });
    } catch (e) {
      s.busy = null;
      if (e instanceof Refusal) no(job.rid, e.code, e.code === 'unavailable' ? 'no Worker here' : null);
      else no(job.rid, 'failed', null);
      startNext(id, s);
    }
  }
  /** a request of the mini-app, already checked by the protocol's rules (engine:check | engine:run | sim:run, with an id) */
  function handle(m: EngineRequest): void {
    if (closed) return;
    const p = m.payload,
      rid = m.id,
      id = str(p.engine),
      now = Date.now();
    win = win.filter(t => now - t < 1000);
    win.push(now);
    if (win.length > ENG.perSec) {
      no(rid, 'rate', 'more than ' + String(ENG.perSec) + ' engine requests a second');
      return;
    }
    if (m.type === 'sim:run') {
      simJob(m);
      return;
    }
    if (!declared.has(id)) {
      no(rid, 'undeclared', "the activity's registry entry does not list " + id + ' in "engines"');
      return;
    }
    if (!allowed.has(id)) {
      no(rid, 'unavailable', id + ' does not run here');
      return;
    }
    const cs = cleanSpec(id, p.spec);
    if (!cs) {
      no(rid, 'spec', 'the spec is {model, outputs}, as in a sim-spec@1 spec', ['spec: needs model (an object) and outputs (a list)']);
      return;
    }
    const errs = errorsOf(id, cs[0], cs[1]);
    if (m.type === 'engine:check') {
      reply('engine:result', { ok: true, errors: errs }, { re: rid });
      return;
    }
    if (errs.length) {
      no(rid, 'spec', errs[0], errs);
      return;
    }
    const inputs = inputsOf(p.inputs);
    if (!inputs) {
      no(rid, 'inputs', 'inputs are at most ' + String(ENG.inputs) + ' names (letters, digits, _) with numbers or true/false');
      return;
    }
    const s = slot(id),
      job: Job = { rid, spec: cs[0], key: cs[1], inputs, seed: seedOf(p.seed) };
    if (!s.busy) {
      start(id, job);
      return;
    }
    if (s.next) no(s.next.rid, 'superseded', 'a newer run replaced this one');
    s.next = job;
  }
  /* noema.sim(spec).run(inputs): a spec with parts {consts?, derived?, parts, couple?} whose engines are all declared and allowed;
     the inputs override its consts; the same checks as a sim-spec@1 spec (the content checks), run by the parts orchestrator (each
     part in its engine's Worker, ≤ 5 s in all). One run at a time per mini-app and one waiting ("superseded"). */
  const sims: { runner: PartsRunner | null; key: string | null; busy: SimJob | null; next: SimJob | null } = {
    runner: null,
    key: null,
    busy: null,
    next: null,
  };
  function simJob(m: EngineRequest): void {
    const p = m.payload,
      rid = m.id,
      sp = isObj(p.spec) ? p.spec : {},
      PC = cmp.content();
    const parts = sp.parts;
    if (!Array.isArray(parts) || !PC) {
      if (Array.isArray(parts)) no(rid, 'unavailable', 'the spec is {consts?, derived?, parts, couple?}');
      else no(rid, 'spec', 'the spec is {consts?, derived?, parts, couple?}', ['spec.parts: a list of parts is required']);
      return;
    }
    const engs = [...new Set(parts.map((q: unknown) => (isObj(q) ? q.engine : null)))];
    const bad = engs.find(e => typeof e !== 'string' || !declared.has(e));
    if (bad !== undefined) {
      no(rid, 'undeclared', "the activity's registry entry does not list " + str(bad).slice(0, 40) + ' in "engines"');
      return;
    }
    const off = engs.find(e => !allowed.has(str(e)));
    if (off) {
      no(rid, 'unavailable', str(off) + ' does not run here');
      return;
    }
    const inputs = inputsOf(p.inputs);
    if (!inputs) {
      no(rid, 'inputs', 'inputs are at most ' + String(ENG.inputs) + ' names (letters, digits, _) with numbers or true/false');
      return;
    }
    const consts = { ...(isObj(sp.consts) ? sp.consts : {}), ...inputs },
      full = {
        format: 'noema.sim-spec/v1',
        consts,
        params: [],
        parts,
        ...(sp.derived !== undefined ? { derived: sp.derived } : {}),
        ...(sp.couple !== undefined ? { couple: sp.couple } : {}),
      };
    let key: string;
    try {
      key = JSON.stringify([full.parts, full.derived, full.couple, Object.keys(consts).sort()]);
    } catch {
      no(rid, 'spec', 'the spec must be plain data');
      return;
    }
    let errs: string[];
    try {
      errs = PC.checkSimSpec(full, null, cmp.engines())
        .filter(x => !x.startsWith('spec.params ')) // a mini-app has no controls: its inputs are the consts
        .map(x => str(x).slice(0, 300))
        .slice(0, ENG.errors);
    } catch {
      errs = ['the spec cannot be checked'];
    }
    if (errs.length) {
      no(rid, 'spec', errs[0], errs);
      return;
    }
    const job: SimJob = { rid, full, key, consts, seed: seedOf(p.seed) };
    if (!sims.busy) {
      simStart(job);
      return;
    }
    if (sims.next) no(sims.next.rid, 'superseded', 'a newer run replaced this one');
    sims.next = job;
  }
  function simStart(job: SimJob): void {
    let runner = sims.runner;
    if (!runner || sims.key !== job.key + ':' + String(job.seed)) {
      try {
        runner?.close();
      } catch (e) {
        host.warn('[noema] html-app parts', e);
      }
      sims.key = job.key + ':' + String(job.seed);
      runner = sims.runner = makeParts({ compute: cmp, warn }, job.full, { seed: job.seed, task: { ...job.consts } }, why => {
        const b = sims.busy;
        sims.runner = null;
        sims.key = null;
        sims.busy = null;
        if (b) no(b.rid, why === 'runaway' ? 'timeout' : 'failed', why === 'runaway' ? 'the parts took longer than 5 s' : null);
        const n = sims.next;
        sims.next = null;
        if (n) simStart(n);
      });
    }
    sims.busy = job;
    runner.run({ ...job.consts }, r => {
      if (closed || sims.busy !== job) return;
      sims.busy = null;
      if (!r?.outputs) no(job.rid, 'failed', 'the parts could not compute this model');
      else {
        const vals: Record<string, number | boolean> = {};
        for (const [k, v] of Object.entries(r.env))
          if (!(k in job.consts) && (typeof v === 'number' || typeof v === 'boolean')) vals[k] = v;
        const pl = { ok: true, outputs: r.outputs, values: vals, codes: r.codes.slice(0, 20) };
        if (size(pl) > ENG.outBytes) no(job.rid, 'too-big', 'the outputs are larger than 512 KB');
        else reply('engine:result', pl, { re: job.rid });
      }
      const n = sims.next;
      sims.next = null;
      if (n) simStart(n);
    });
  }
  function close(): void {
    closed = true;
    for (const s of slots.values()) {
      try {
        s.runner?.close();
      } catch (e) {
        host.warn('[noema] html-app engine', e);
      }
      s.runner = null;
      s.busy = s.next = null;
    }
    try {
      sims.runner?.close();
    } catch (e) {
      host.warn('[noema] html-app parts', e);
    }
    sims.runner = null;
    sims.busy = sims.next = null;
  }
  return { handle, close, engines: [...allowed] };
}

/* i18n-ignore-end */
