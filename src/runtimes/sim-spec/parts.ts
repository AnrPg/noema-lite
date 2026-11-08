/* Parts: several engines in one spec (docs/INTERACTIVE.md §12.8).
   partsRunner(cx, spec, opts, onFail, deps?) → the same interface as engineRunner { run(env, done), measure, close }, over the plan
   of the content checks' partsPlan: each part is an engine instance of its own (its Worker, its prepare, its ≤ 5 s per job) on the
   part's spec (its model and outputs, the spec's consts and params, its inputs as names). One run of the graph, in the plan's order:
     derived   — a formula over everything computed before it;
     part      — a chain step: its inputs (numbers, formulas, or {series, points? | stat?} of an earlier part) → run() once;
     loop      — a fixed point (Gauss–Seidel over the loop's parts in their order, relax, the first guesses `init`, default 0) until no
                 scalar output of the loop changes by more than tol (relative: |Δ| / max(1, |x|)); else its scalars become NaN and
                 the code 'no-converge' (the plan stays visible: the view says so);
     cosim     — in time: each part a stepper (stepInit, then stepTo by macro steps dt ≤ tEnd); in a round every part behind steps in
                 the declared order (Gauss–Seidel), an early stop (a state event) ends the round there for the parts after it;
                 events go to the other parts' inbox (or to `to`); iterate {tol, maxIter}: a macro step repeated from the parts'
                 snapshots until the exchanged scalars settle (else 'no-converge'; a part that cannot snapshot: 'no-snapshot').
                 Each numeric output a part gives at a step becomes one sample of its series (the time series: cosim.time).
   The latest inputs win (a run waiting replaces an older one; a run under way stops at its next step); the whole run ≤ 5 s
   (else onFail('runaway')). done({outputs, env, codes}): every part's outputs by id, the derived values and the scalars, and the codes
   [{code, part? | loop?, …}]. deps (tests): {engine(id), runner(E, spec, opts, onFail), lib, plan, partSpec, compile, now}. */
import type { Compile, Compiled, ComputeHost, EngineOpts, Env, PartsPlan, PlanUnit, SimEngine } from '../compute.ts';
import { engineRunner, RUN_TIMEOUT, type EngineRunner, type MakeRunner, type StepKind } from './runner.ts';

export const MAX_POINTS = 2000;

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const isN = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? (v as readonly unknown[]) : []);

/** what the orchestrator needs from the app */
export interface PartsContext {
  readonly compute: ComputeHost;
  warn(...what: readonly unknown[]): void;
}
export interface PartsDeps {
  engine?: (id: string) => SimEngine | null;
  runner?: MakeRunner | null;
  lib?: unknown;
  plan?: (spec: unknown, lib: unknown) => PartsPlan;
  partSpec?: (spec: unknown, part: unknown) => unknown;
  compile?: Compile;
  now?: () => number;
}
export interface PartsResult {
  readonly outputs: Record<string, unknown>;
  readonly env: Env;
  readonly codes: Record<string, unknown>[];
}
export interface PartsRunner {
  run(env: Env, done: (r: PartsResult | null) => void): void;
  measure(env: Env, probe: unknown, done: (out: unknown) => void): void;
  close(): void;
  readonly plan?: PartsPlan;
  inWorker(): boolean;
}

interface OutDecl {
  readonly id: string;
  readonly kind?: string;
}
interface Part {
  readonly id: string;
  readonly runner: EngineRunner;
  readonly prep: (env: Env) => unknown;
  readonly ins: readonly { name: string; v: unknown; f: Compiled | null }[];
  readonly outs: readonly OutDecl[];
  last: Env | null;
}
interface StepOut {
  readonly out?: unknown;
  readonly dt?: unknown;
  readonly events?: unknown;
  readonly fail?: unknown;
}

export function partsRunner(
  cx: PartsContext,
  spec: Obj,
  opts: Partial<EngineOpts> | null,
  onFail: (why: string) => void,
  deps: PartsDeps = {},
): PartsRunner {
  const PC = cx.compute.content();
  const C: Compile = deps.compile ?? (s => cx.compute.compile(s)),
    now = deps.now ?? (() => performance.now());
  const lib = deps.lib !== undefined ? deps.lib : cx.compute.parts();
  const planOf = deps.plan ?? PC?.partsPlan.bind(PC);
  const mkSpec = deps.partSpec ?? PC?.partSpec.bind(PC);
  if (!planOf || !mkSpec) {
    void Promise.resolve().then(() => {
      onFail('unsupported');
    });
    return { run: () => undefined, measure: () => undefined, close: () => undefined, inWorker: () => false };
  }
  const plan = planOf(spec, lib),
    engineOf = deps.engine ?? ((id: string) => cx.compute.engine(id));
  const mkRunner: MakeRunner =
    deps.runner ??
    ((E, s, o, f) =>
      engineRunner(E, s, o, f, (...w) => {
        cx.warn(...w);
      }));
  const seed = Number(opts?.seed) >>> 0 || 1,
    cons: Env = { ...(isObj(opts?.task) ? opts.task : isObj(spec.consts) ? spec.consts : {}) };
  const ev = (f: Compiled, env: Env): unknown => {
    try {
      const v = f(env);
      return typeof v === 'boolean' ? +v : v;
    } catch {
      return NaN;
    }
  };
  const L = PC?.ACTIVITY_RULES?.PARTS_LIM ?? { iter: 50, macro: 5000, points: 2000 };
  let dead = false,
    job = 0,
    busy = false,
    pending: { env: Env; done: (r: PartsResult | null) => void } | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    started = 0;
  const fail = (why: string): void => {
    if (dead) return;
    close();
    onFail(why);
  };
  const P = plan.parts.map((p, k): Part | null => {
    const E = typeof p.engine === 'string' ? engineOf(p.engine) : null,
      sub = mkSpec(spec, p);
    if (!E) return null;
    const prep = typeof E.prepare === 'function' ? E.prepare(sub, C) : (x: Env): unknown => x;
    const pseed = k === 0 ? seed : (seed + Math.imul(k, 0x9e3779b1)) >>> 0 || 1; // the first part keeps the activity's seed
    const bench = isObj(spec.bench) && spec.bench.part === p.id;
    const o: EngineOpts = { seed: pseed, task: { ...cons }, ...(bench && opts?.faults ? { faults: opts.faults } : {}) };
    const runner = mkRunner(E, sub, o, why => {
      fail(why);
    });
    const ins = Object.entries(isObj(p.inputs) ? p.inputs : {}).map(([name, v]) => ({ name, v, f: typeof v === 'string' ? C(v) : null }));
    const outs = list(p.outputs).filter((x): x is OutDecl => isObj(x) && typeof x.id === 'string');
    return { id: String(p.id), runner, prep, ins, outs, last: null };
  });
  if (P.some(q => !q)) {
    void Promise.resolve().then(() => {
      fail('unsupported');
    });
    return { run: () => undefined, measure: () => undefined, close: () => undefined, inWorker: () => false };
  }
  const parts = P as Part[];
  const byId = new Map(parts.map(q => [q.id, q]));
  const derived = new Map(
    list(spec.derived)
      .filter(isObj)
      .map(d => [String(d.id), C(String(d.expr))] as const),
  );
  const couple = isObj(spec.couple) ? spec.couple : null;
  const cosim = couple && isObj(couple.cosim) ? couple.cosim : null;
  const loops = couple ? list(couple.loops) : [];
  const lim = (v: unknown): Compiled => (typeof v === 'string' ? C(v) : () => v);
  const CS = cosim ? { tEnd: lim(cosim.tEnd), dt: lim(cosim.dt), t0: lim(cosim.t0 === undefined ? 0 : cosim.t0) } : null;
  const call = (q: Part, kind: StepKind, inputs: unknown, a: unknown, b?: unknown, c?: unknown): Promise<unknown> =>
    new Promise(res => {
      q.runner.step(kind, inputs, a, b, c, res);
    });
  const runOnce = (q: Part, inputs: unknown): Promise<unknown> =>
    new Promise(res => {
      q.runner.run(inputs, res);
    });
  const statOf = (a: readonly unknown[], st: unknown): number => {
    const xs = a.filter(isN);
    if (!xs.length) return NaN;
    if (st === 'final') return xs[xs.length - 1] ?? NaN;
    let lo = Infinity,
      hi = -Infinity,
      s = 0,
      s2 = 0;
    for (const x of xs) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      s += x;
      s2 += x * x;
    }
    return st === 'min'
      ? lo
      : st === 'max'
        ? hi
        : st === 'mean'
          ? s / xs.length
          : st === 'pp'
            ? hi - lo
            : st === 'rms'
              ? Math.sqrt(s2 / xs.length)
              : NaN;
  };
  const resample = (a: readonly number[], n: number): number[] => {
    if (a.length < 2 || a.length === n) return a.slice();
    const r: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i * (a.length - 1)) / (n - 1),
        j = Math.min(a.length - 2, Math.floor(x)),
        f = x - j;
      const aj = a[j] ?? NaN,
        aj1 = a[j + 1] ?? NaN;
      r.push(aj + f * (aj1 - aj));
    }
    return r;
  };

  /** the numbers (and series) a part's engine gets: the consts and the params, then its own inputs */
  function inputsOf(q: Part, env: Env, outs: Record<string, unknown>): Env {
    const r: Env = {};
    for (const k of Object.keys(cons)) r[k] = env[k];
    for (const p of list(spec.params)) if (isObj(p)) r[String(p.id)] = env[String(p.id)];
    for (const x of q.ins) {
      if (typeof x.v === 'number') r[x.name] = x.v;
      else if (x.f) r[x.name] = ev(x.f, env);
      else if (isObj(x.v)) {
        const s = outs[String(x.v.series)];
        const a = Array.isArray(s) ? (s as number[]) : [];
        r[x.name] = x.v.stat ? statOf(a, x.v.stat) : x.v.points ? resample(a, Number(x.v.points)) : a.slice(0, MAX_POINTS);
      } else r[x.name] = NaN;
    }
    return r;
  }
  /** a part's answer into the outputs and (scalars) the names */
  function take(q: Part, o: unknown, env: Env, outs: Record<string, unknown>): void {
    for (const d of q.outs) {
      const v = isObj(o) ? o[d.id] : undefined;
      if (d.kind === 'scalar') {
        const x = isN(v) || typeof v === 'boolean' ? +v : NaN;
        outs[d.id] = typeof v === 'boolean' ? v : x;
        env[d.id] = x;
      } else outs[d.id] = v === undefined ? (d.kind === 'series' ? [] : undefined) : v;
    }
  }
  const scalarsOf = (qs: readonly Part[]): string[] => qs.flatMap(q => q.outs.filter(d => d.kind === 'scalar').map(d => d.id));
  const change = (ids: readonly string[], a: Env, b: Env): number => {
    let m = 0;
    for (const k of ids) {
      const x = a[k],
        y = b[k];
      if (!isN(x) || !isN(y)) {
        if (x !== y && !(x !== x && y !== y)) return Infinity;
        continue;
      }
      m = Math.max(m, Math.abs(x - y) / Math.max(1, Math.abs(x)));
    }
    return m;
  };

  async function graph(env: Env, my: number): Promise<PartsResult | null> {
    const outs: Record<string, unknown> = {},
      codes: Record<string, unknown>[] = [];
    const alive = (): boolean => {
      if (dead || my !== job) return false;
      if (now() - started > RUN_TIMEOUT) {
        fail('runaway');
        return false;
      }
      return true;
    };
    const chainPart = async (q: Part): Promise<boolean> => {
      const inp = inputsOf(q, env, outs);
      q.last = inp;
      const o = await runOnce(q, q.prep(inp));
      if (!alive()) return false;
      if (o == null) codes.push({ code: 'part-failed', part: q.id });
      take(q, o, env, outs);
      return true;
    };
    const evalD = (ids: readonly string[] | undefined): void => {
      for (const id of ids ?? []) {
        let v: unknown;
        try {
          const f = derived.get(id);
          v = f ? f(env) : NaN;
        } catch {
          v = NaN;
        }
        env[id] = v; // (a true/false stays one: the readouts show ✓ / ✗)
      }
    };
    for (const u of plan.order) {
      if (u.k === 'derived') {
        evalD([String(u.id)]);
        continue;
      }
      if (u.k === 'part') {
        const q = byId.get(String(u.id));
        if (!q || !(await chainPart(q))) return null;
        continue;
      }
      const qs = (u.parts ?? []).map(id => byId.get(id)).filter((q): q is Part => !!q);
      const def0 = u.k === 'loop' ? loops[u.i ?? -1] : cosim;
      const def: Obj = isObj(def0) ? def0 : {},
        ids = scalarsOf(qs);
      const init = isObj(def.init) ? def.init : null;
      for (const k of ids) env[k] = init && isN(init[k]) ? init[k] : 0;
      if (u.k === 'loop') {
        const tol = Number(def.tol),
          relax = isN(def.relax) ? def.relax : 1,
          maxIter = Math.min(L.iter, Number(def.maxIter) || 20);
        let ok = false,
          it = 0;
        while (it < maxIter && !ok) {
          it++;
          const before: Env = {};
          for (const k of ids) before[k] = env[k];
          for (const q of qs) {
            evalD(u.derived);
            const old: Env = {};
            for (const k of scalarsOf([q])) old[k] = env[k];
            if (!(await chainPart(q))) return null;
            if (relax !== 1)
              for (const k of Object.keys(old)) {
                const ok0 = old[k],
                  nk = env[k];
                if (isN(ok0) && isN(nk)) {
                  env[k] = relax * nk + (1 - relax) * ok0;
                  outs[k] = env[k];
                }
              }
          }
          evalD(u.derived);
          ok = change(ids, env, before) <= tol;
        }
        if (!ok) {
          for (const k of ids) {
            env[k] = NaN;
            outs[k] = NaN;
          }
          codes.push({ code: 'no-converge', loop: u.i, iterations: it });
        }
        continue;
      }
      if (!(await cosimUnit(u, qs, def, ids, env, outs, codes, alive))) return null;
    }
    return { outputs: outs, env, codes };
  }

  /** a co-simulation in time; false: the run stopped (a newer one, or over its time) */
  async function cosimUnit(
    u: PlanUnit,
    qs: readonly Part[],
    def: Obj,
    ids: readonly string[],
    env: Env,
    outs: Record<string, unknown>,
    codes: Record<string, unknown>[],
    alive: () => boolean,
  ): Promise<boolean> {
    const num = (f: Compiled | undefined): number => {
      const v = f ? ev(f, env) : NaN;
      return typeof v === 'number' ? v : NaN;
    };
    const t0 = num(CS?.t0),
      tEnd = num(CS?.tEnd),
      dt = num(CS?.dt);
    if (!(isN(t0) && isN(tEnd) && isN(dt) && dt > 0 && tEnd > t0)) {
      codes.push({ code: 'bad-config' });
      for (const q of qs) take(q, null, env, outs);
      return true;
    }
    const eps = 1e-9 * Math.max(1, Math.abs(tEnd)),
      tp = new Map(qs.map(q => [q.id, t0])),
      inbox = new Map<string, Obj[]>(qs.map(q => [q.id, []]));
    const rec = new Map<string, { whole?: unknown; s?: number[]; pend?: number | undefined }>(),
      times = [t0];
    const series = (q: Part): OutDecl[] => q.outs.filter(d => d.kind === 'series');
    const evalD = (ids2: readonly string[] | undefined): void => {
      for (const id of ids2 ?? []) {
        let v: unknown;
        try {
          const f = derived.get(id);
          v = f ? f(env) : NaN;
        } catch {
          v = NaN;
        }
        env[id] = v;
      }
    };
    const sample = (q: Part, o: unknown, first: boolean): void => {
      for (const d of q.outs) {
        const v = isObj(o) ? o[d.id] : undefined;
        if (d.kind === 'series') {
          if (Array.isArray(v)) rec.set(d.id, { whole: v });
          else {
            const r = rec.get(d.id) ?? { s: [] };
            if (r.s) {
              if (first) r.s = [isN(v) ? v : NaN];
              else r.pend = isN(v) ? v : NaN;
            }
            rec.set(d.id, r);
            if (isN(v)) env[d.id] = v; // the step's value: what the other parts' formulas read
          }
        } else if (d.kind === 'scalar') {
          if (isN(v) || typeof v === 'boolean') {
            env[d.id] = +v;
            outs[d.id] = v;
          }
        } else if (v !== undefined) outs[d.id] = v;
      }
    };
    let failed = false;
    for (const q of qs) {
      evalD(u.derived);
      const inp = inputsOf(q, env, outs);
      q.last = inp;
      const r = (await call(q, 'sinit', q.prep(inp), t0)) as StepOut | null;
      if (!alive()) return false;
      if (!r || r.fail) {
        codes.push({ code: 'part-failed', part: q.id });
        failed = true;
        break;
      }
      for (const d of series(q)) rec.set(d.id, { s: [] });
      sample(q, r.out, true);
    }
    if (failed) {
      for (const q of qs) take(q, null, env, outs);
      return true;
    }
    const itd = isObj(def.iterate) ? def.iterate : null;
    const it = itd ? { tol: Number(itd.tol), max: Math.min(L.iter, Number(itd.maxIter) || 10) } : null;
    let canIter = !!it,
      rounds = 0,
      noConv = 0,
      stuck = 0;
    const roundsMax = 4 * L.macro;
    const tg = (): number => Math.min(...tp.values());
    while (tg() < tEnd - eps) {
      if (++rounds > roundsMax) {
        codes.push({ code: 'budget' });
        break;
      }
      const t = tg(),
        aligned = [...tp.values()].every(x => Math.abs(x - t) <= eps);
      let snapped = false;
      if (canIter && aligned) {
        const slots: unknown[] = [];
        for (const q of qs) slots.push(await call(q, 'snap', null, undefined));
        if (!alive()) return false;
        if (slots.some(s => !(typeof s === 'number' && s >= 0))) {
          canIter = false;
          codes.push({ code: 'no-snapshot' });
        } else snapped = true;
      }
      let k = 0,
        prevX: Env | null = null,
        settled = !snapped;
      const saveEnv = snapped ? { ...env } : null,
        saveIn = snapped ? new Map([...inbox].map(([a, b]) => [a, b.slice()])) : null;
      do {
        if (k > 0) {
          // back to the start of the macro step
          for (const q of qs) await call(q, 'restore', null, 0);
          if (!alive()) return false;
          Object.assign(env, saveEnv);
          for (const q of qs) tp.set(q.id, t);
          for (const [a, b] of saveIn ?? []) inbox.set(a, b.slice());
        }
        let target = Math.min(t + dt, tEnd);
        const xs: Env = {};
        for (const q of qs) {
          const tq = tp.get(q.id) ?? t;
          if (tq > t + eps) continue; // ahead after an early stop of another part: it waits
          evalD(u.derived);
          const hh = target - tq;
          if (!(hh > 0)) continue;
          const inp = inputsOf(q, env, outs);
          q.last = inp;
          const box = inbox.get(q.id) ?? [];
          inbox.set(q.id, []);
          const r = (await call(q, 'step', q.prep(inp), tq, hh, box)) as StepOut | null;
          if (!alive()) return false;
          if (!r || r.fail) {
            codes.push({ code: 'part-failed', part: q.id, t: tq });
            failed = true;
            break;
          }
          const taken = isN(r.dt) ? Math.max(0, Math.min(hh, r.dt)) : hh;
          tp.set(q.id, tq + taken);
          if (taken < hh - eps) target = tq + taken; // a state event: the parts after it meet it at its time
          sample(q, r.out, false);
          for (const e of list(r.events))
            if (isObj(e))
              for (const o of qs)
                if (
                  o !== q &&
                  (!e.to ||
                    ((Array.isArray(e.to) || typeof e.to === 'string') && (e.to as { includes(x: string): boolean }).includes(o.id)))
                )
                  inbox.get(o.id)?.push({ ...e, source: q.id });
        }
        if (failed) break;
        for (const id of ids) xs[id] = env[id];
        settled = !snapped || (!!prevX && !!it && change(ids, xs, prevX) <= it.tol);
        prevX = xs;
        k++;
      } while (!settled && k < (it ? it.max : 0));
      if (failed) break;
      if (!settled) noConv++;
      const tn = tg();
      if (tn <= t + eps) {
        if (++stuck > 3) {
          codes.push({ code: 'no-progress', t });
          break;
        }
      } else stuck = 0;
      if (tn > t + eps) {
        times.push(tn);
        for (const r of rec.values())
          if (r.s) {
            r.s.push(r.pend === undefined ? (r.s.length ? (r.s[r.s.length - 1] ?? NaN) : NaN) : r.pend);
            r.pend = undefined;
          }
      }
      if (times.length > L.macro * 4) {
        codes.push({ code: 'budget', t: tn }); // never a silent cut: the run says it stopped early
        break;
      }
    }
    if (failed) {
      for (const q of qs) take(q, null, env, outs);
      return true;
    }
    if (noConv) codes.push({ code: 'no-converge', cosim: true, steps: noConv });
    const thin = (a: readonly unknown[]): unknown[] => {
      if (a.length <= MAX_POINTS) return a.slice();
      const f = (a.length - 1) / (MAX_POINTS - 1),
        r: unknown[] = [];
      for (let i = 0; i < MAX_POINTS; i++) r.push(a[Math.round(i * f)]);
      return r;
    };
    for (const [id, r] of rec) outs[id] = thin(r.whole !== undefined ? Array.from(r.whole as ArrayLike<unknown>) : (r.s ?? []));
    if (typeof def.time === 'string') outs[def.time] = thin(times);
    return true;
  }
  function pump(): void {
    if (dead || busy || !pending) return;
    const { env, done } = pending;
    pending = null;
    busy = true;
    const my = ++job;
    started = now();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (busy && my === job) fail('runaway');
    }, RUN_TIMEOUT + 50);
    graph({ ...env }, my).then(
      r => {
        busy = false;
        clearTimeout(timer);
        if (r && !dead && !pending) done(r);
        pump();
      },
      (e: unknown) => {
        busy = false;
        clearTimeout(timer);
        cx.warn('[noema] sim-spec parts', e);
        if (!dead && !pending) done(null);
        pump();
      },
    );
  }
  /** run(env, done): env = the consts and params (and the derived values that need no part; they are computed again in order) */
  function run(env: Env, done: (r: PartsResult | null) => void): void {
    if (dead) return;
    pending = { env, done };
    if (busy) job++; // a run under way stops at its next step
    pump();
  }
  /** a measurement of the bench: on the bench part, with the inputs of its last run */
  function measure(env: Env, probe: unknown, done: (out: unknown) => void): void {
    const q = isObj(spec.bench) ? byId.get(String(spec.bench.part)) : undefined;
    if (dead || !q) {
      done(null);
      return;
    }
    q.runner.measure(q.prep(q.last ?? inputsOf(q, env, {})), probe, done);
  }
  function close(): void {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    pending = null;
    for (const q of parts) {
      try {
        q.runner.close();
      } catch (e) {
        cx.warn('[noema] sim-spec parts: a runner did not close', e);
      }
    }
  }
  return { run, measure, close, plan, inWorker: () => parts.some(q => q.runner.inWorker()) };
}

/** a spec whose parts reuse activities/_parts ({use, with}): the same spec with each part written out (the checks then see whole
    parts); any other spec is returned as it is */
export function withParts(compute: ComputeHost, spec: unknown): unknown {
  const PC = compute.content();
  if (!PC || !isObj(spec) || !Array.isArray(spec.parts) || !(spec.parts as unknown[]).some(p => isObj(p) && p.use !== undefined))
    return spec;
  const E: string[] = [],
    R = PC.resolveParts(spec, compute.parts(), E);
  return E.length || !R ? spec : { ...spec, parts: R.map(r => r.p) };
}

/** the engine a spec with parts shows the view: the checks of every part's engine on its part's spec, the bench of the bench part */
export interface PartsEngine extends SimEngine {
  readonly plan: PartsPlan;
}
export function partsEngine(compute: ComputeHost, spec: Obj): PartsEngine | null {
  const PC = compute.content(),
    lib = compute.parts();
  if (!PC) return null;
  const plan = PC.partsPlan(spec, lib),
    Es = plan.parts.map(p => (typeof p.engine === 'string' ? compute.engine(p.engine) : null));
  if (!plan.parts.length || Es.some(e => !e)) return null;
  const bi = isObj(spec.bench) ? plan.parts.findIndex(p => isObj(spec.bench) && p.id === spec.bench.part) : -1;
  const benchE = bi >= 0 ? Es[bi] : null;
  return {
    id: 'parts',
    plan,
    ...(benchE?.bench ? { bench: true } : {}),
    create: () => ({}),
    check: (sp: unknown): string[] =>
      plan.parts.flatMap((p, i) => {
        const E = Es[i];
        if (!E?.check) return [];
        try {
          return list(E.check(PC.partSpec(sp, p))).map(m => PC.partMsg(String(m), `spec.parts[${String(i)}]`));
        } catch (e) {
          return [`spec.parts[${String(i)}]: ` + String(e instanceof Error ? e.message : e)];
        }
      }),
  };
}
