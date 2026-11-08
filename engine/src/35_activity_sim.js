/* ===================== interactive activities — runtime sim-spec@1 (Tier B: a declarative simulation, docs/INTERACTIVE.md §12) =====================
   The pack carries only DATA (item.spec): controls, formulas in the expression language (NoemaCore.engines.expr, src/engines/kernel/simexpr.ts), readouts and
   plots. No code of the pack runs, so there is no frame: the app's own trusted code renders the controls and the plots with its own
   DOM and styles (theme tokens, dark mode, keyboard, labels, 320 px) — docs/adr/001 "as built". The spec is checked with the same
   rules as the validators (NoemaPackCheck.checkSimSpec) before anything is shown; a spec that fails shows the activity's fallback.
   Engines (ACT.registerEngine, or the engine library NoemaCore.engines, loaded by ACT when an activity needs one): formula@1 is built in (the derived values are the model). Another engine computes outputs from the
   inputs (scalars and time series): { id, check?(spec) → problems, create(spec, {seed, task}) → { run(inputs) → outputs },
   workerSource? }. An engine with workerSource runs in a Worker (runs that can take longer than ~50 ms: P3's circuit engine);
   one without runs inline. Every evaluation is the expression language's: no loops, ≤ 2000 nodes per expression, ≤ 2000 points per plot.
   The protocol with the core is the one of every runtime (ACTP messages): ready, pong, state, event; pause/resume/destroy. */
(() => {
  /* i18n-ignore-start */   // code; the words come from the pack's string tables and from tE() below
  const SVGNS = 'http://www.w3.org/2000/svg';
  const MAX_POINTS = 2000, RUN_TIMEOUT = 5000;
  const COLORS = ['var(--c)', 'var(--bad)', 'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--ink2)'];
  const DASH = ['', '7 4', '2 3', '9 3 2 3', '4 4', '1 2'];   // a second cue besides the colour
  const isNum = v => typeof v === 'number' && isFinite(v);
  const truthy = v => typeof v === 'boolean' ? v : (v !== 0 && v === v);
  const svg = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v); return e; };
  let seq = 0;

  /* ---------- numbers for people: SI prefixes, the learner's decimal mark ---------- */
  const SI = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function fmtNum(v, o, locale) {
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (!isNum(v)) return '—';
    const f = (n, opt) => { try { return new Intl.NumberFormat(locale, opt).format(n); } catch (e) { return String(n); } };
    const unit = o && o.unit ? o.unit : '', fm = (o && o.format) || 'auto', dg = o && o.digits;
    if (fm === 'fixed') return f(v, { minimumFractionDigits: dg ?? 2, maximumFractionDigits: dg ?? 2 }) + (unit ? ' ' + unit : '');
    if (fm === 'si') {
      const a = Math.abs(v); const [m, p] = a === 0 ? [1, ''] : (SI.find(([m]) => a >= m * 0.9995) || SI[SI.length - 1]);
      return (f(v / m, { maximumSignificantDigits: dg ?? 3 }) + ' ' + p + unit).trim();
    }
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < 1e-4)) return f(v, { notation: 'scientific', maximumSignificantDigits: dg ?? 3 }) + (unit ? ' ' + unit : '');
    return f(v, { maximumSignificantDigits: dg ?? 4 }) + (unit ? ' ' + unit : '');
  }

  /* ---------- engines ---------- */
  ACT.registerEngine({ id: 'formula@1', check: () => [], create: () => ({ run: () => ({}) }) });   // the derived values are the model

  /** An engine instance behind one async interface: inline, or in a Worker when the engine has workerSource.
      run(inputs, done): the outputs (a newer run waiting replaces an older one: the latest inputs win);
      measure(inputs, probe, done): one reading of a bench's instrument (queued, never dropped). One job at a time, each ≤ 5 s.
      respec(spec, opts): the same Worker takes another model (queued: the runs after it use it) — the mini-apps' engines (34_activity_html.js). */
  function engineRunner(E, spec, opts, onFail) {
    let worker = null, url = null, inst = null, busy = null, timer = null, dead = false;
    const queue = [];
    if (E.workerSource && typeof Worker === 'function') {
      try {
        const bridge = "self.onmessage=function(e){var m=e.data;try{if(m.t==='create'){self.__i=null;self.__i=self.noemaEngine.create(m.spec,m.opts);return;}var i=self.__i,r=m.t==='measure'?i.measure(m.inputs,m.probe):m.t==='sinit'?i.stepInit(m.inputs,m.a):m.t==='step'?i.stepTo(m.inputs,m.a,m.b,m.c):m.t==='snap'?i.snapshot():m.t==='restore'?i.restore(m.a):(i.run||i.step).call(i,m.inputs);postMessage({t:'out',id:m.id,out:r});}catch(x){postMessage({t:'err',id:m.id,msg:String(x&&x.message||x)});}};";
        url = URL.createObjectURL(new Blob([E.workerSource + '\n;' + bridge], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = e => { const m = e.data; if (!busy || !m || m.id !== busy.id) return; const d = busy.done; finish(); if (m.t === 'err') console.warn('[noema] sim-spec engine', E.id, m.msg); d(m.t === 'out' ? m.out : null); };
        worker.onerror = e => { e.preventDefault?.(); console.warn('[noema] sim-spec engine worker', E.id, e.message); const d = busy?.done; finish(); d?.(null); };
        worker.postMessage({ t: 'create', spec, opts });
      } catch (e) { console.warn('[noema] sim-spec: no worker here, the engine runs inline', e); worker = null; }
    }
    if (!worker) inst = E.create(spec, opts);
    function finish() { clearTimeout(timer); busy = null; pump(); }
    function pump() {
      if (dead || busy || !queue.length) return;
      const job = queue.shift();
      if (job.t === 'create') {   // another model for the same instance (respec): no answer; the runs queued after it use it
        if (worker) worker.postMessage({ t: 'create', spec: job.spec, opts: job.opts });
        else { inst = null; try { inst = E.create(job.spec, job.opts); } catch (e) { console.warn('[noema] sim-spec engine', E.id, e); } }
        return pump();
      }
      if (!worker) {
        const t0 = performance.now(); let out = null;
        try { out = job.t === 'measure' ? inst.measure(job.inputs, job.probe) : job.t === 'sinit' ? inst.stepInit(job.inputs, job.a) : job.t === 'step' ? inst.stepTo(job.inputs, job.a, job.b, job.c) : job.t === 'snap' ? inst.snapshot() : job.t === 'restore' ? inst.restore(job.a) : (inst.run || inst.step).call(inst, job.inputs); } catch (e) { console.warn('[noema] sim-spec engine', E.id, e); }
        const ms = performance.now() - t0; if (ms > 50) console.warn(`[noema] sim-spec: engine ${E.id} took ${Math.round(ms)} ms inline; give it a workerSource`);
        job.done(out); return pump();
      }
      busy = { id: ++seq, done: job.done };
      timer = setTimeout(() => { if (!busy) return; dead = true; close(); onFail('runaway'); }, RUN_TIMEOUT);
      worker.postMessage({ t: job.t, id: busy.id, inputs: job.inputs, probe: job.probe, ...(job.t === 'sinit' || job.t === 'step' || job.t === 'restore' ? { a: job.a, b: job.b, c: job.c } : {}) });
    }
    function run(inputs, done) {
      if (dead) return;
      const c = queue.map(j => j.t).lastIndexOf('create'), i = queue.findIndex((j, k) => k > c && j.t === 'run');   // the latest inputs win (never ahead of a new model)
      if (i >= 0) queue[i] = { t: 'run', inputs, done }; else queue.push({ t: 'run', inputs, done });
      pump();
    }
    function respec(s2, o2) { if (dead) return; queue.push({ t: 'create', spec: s2, opts: o2 || opts }); pump(); }
    function measure(inputs, probe, done) { if (dead) return; queue.push({ t: 'measure', inputs, probe, done }); pump(); }
    /** the stepper of a part (docs/INTERACTIVE_LIBRARY.md §1.6), queued like a measurement (never dropped): kind 'sinit' (inputs, t0) →
        {out} | 'step' (inputs, t, dt, inbox) → {out, dt, events} | 'snap' → slot (−1: cannot) | 'restore' (slot) → true/false */
    function step(kind, inputs, a, b, c, done) { if (dead) return; queue.push({ t: kind, inputs, a, b, c, done }); pump(); }
    function close() { dead = true; clearTimeout(timer); queue.length = 0; try { worker?.terminate(); } catch (e) { } if (url) URL.revokeObjectURL(url); worker = null; }
    return { run, measure, respec, step, close, inWorker: () => !!worker };
  }
  /* ---------- parts: several engines in one spec (docs/INTERACTIVE.md §12.8) ----------
     partsRunner(spec, opts, onFail, deps?) → the same interface as engineRunner { run(env, done), measure, close }, over the plan of
     NoemaPackCheck.partsPlan: each part is an engine instance of its own (its Worker, its prepare, its ≤ 5 s per job) on the part's spec
     (its model and outputs, the spec's consts and params, its inputs as names). One run of the graph, in the plan's order:
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
  function partsRunner(spec, opts, onFail, deps) {
    deps = deps || {};
    const PC = window.NoemaPackCheck || {}, C = deps.compile || NoemaCore.engines.expr.compile, now = deps.now || (() => performance.now());
    const lib = deps.lib !== undefined ? deps.lib : (ACT.PARTS || window.Noema?.pack?.activities?.parts || null);
    const plan = (deps.plan || PC.partsPlan)(spec, lib), mkSpec = deps.partSpec || PC.partSpec, engineOf = deps.engine || (id => ACT.engine(id));
    const mkRunner = deps.runner || engineRunner, seed = ((opts && opts.seed) >>> 0) || 1, cons = Object.assign({}, (opts && opts.task) || spec.consts || {});
    const ev = (f, env) => { try { const v = f(env); return typeof v === 'boolean' ? +v : v; } catch (e) { return NaN; } };
    const L = (PC.ACTIVITY_RULES && PC.ACTIVITY_RULES.PARTS_LIM) || { iter: 50, macro: 5000, points: 2000 };
    let dead = false, job = 0, busy = false, pending = null, timer = null, started = 0;
    const fail = why => { if (dead) return; close(); onFail(why); };
    const P = plan.parts.map((p, k) => {
      const E = engineOf(p.engine), sub = mkSpec(spec, p);
      if (!E) return null;
      const prep = typeof E.prepare === 'function' ? E.prepare(sub, C) : (x => x);
      const pseed = k === 0 ? seed : ((seed + Math.imul(k, 0x9E3779B1)) >>> 0) || 1;   // the first part keeps the activity's seed
      const bench = !!(spec.bench && spec.bench.part === p.id);
      const runner = mkRunner(E, sub, { seed: pseed, task: { ...cons }, ...(bench && opts && opts.faults ? { faults: opts.faults } : {}) }, why => fail(why));
      const ins = Object.entries(p.inputs && typeof p.inputs === 'object' ? p.inputs : {}).map(([name, v]) => ({ name, v, f: typeof v === 'string' ? C(v) : null }));
      return { id: p.id, p, E, sub, prep, runner, ins, outs: (p.outputs || []).filter(o => o && typeof o.id === 'string'), last: null };
    });
    if (P.some(q => !q)) { Promise.resolve().then(() => fail('unsupported')); return { run() { }, measure() { }, close() { }, inWorker: () => false }; }
    const byId = new Map(P.map(q => [q.id, q]));
    const derived = new Map((spec.derived || []).map(d => [d.id, C(d.expr)]));
    const cosim = spec.couple && typeof spec.couple === 'object' ? spec.couple.cosim : null;
    const loops = spec.couple && typeof spec.couple === 'object' && Array.isArray(spec.couple.loops) ? spec.couple.loops : [];
    const lim = v => (typeof v === 'string' ? C(v) : (() => v));
    const CS = cosim ? { tEnd: lim(cosim.tEnd), dt: lim(cosim.dt), t0: lim(cosim.t0 === undefined ? 0 : cosim.t0) } : null;
    const call = (q, kind, inputs, a, b, c) => new Promise(res => q.runner.step(kind, inputs, a, b, c, res));
    const runOnce = (q, inputs) => new Promise(res => q.runner.run(inputs, res));
    const isN = v => typeof v === 'number' && isFinite(v);
    const statOf = (a, st) => {
      const xs = a.filter(isN); if (!xs.length) return NaN;
      if (st === 'final') return xs[xs.length - 1];
      let lo = Infinity, hi = -Infinity, s = 0, s2 = 0; for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; s += x; s2 += x * x; }
      return st === 'min' ? lo : st === 'max' ? hi : st === 'mean' ? s / xs.length : st === 'pp' ? hi - lo : st === 'rms' ? Math.sqrt(s2 / xs.length) : NaN;
    };
    const resample = (a, n) => { if (a.length < 2 || a.length === n) return a.slice(); const r = []; for (let i = 0; i < n; i++) { const x = i * (a.length - 1) / (n - 1), j = Math.min(a.length - 2, Math.floor(x)), f = x - j; r.push(a[j] + f * (a[j + 1] - a[j])); } return r; };

    /** the numbers (and series) a part's engine gets: the consts and the params, then its own inputs */
    function inputsOf(q, env, outs) {
      const r = {};
      for (const k of Object.keys(cons)) r[k] = env[k];
      for (const p of spec.params || []) r[p.id] = env[p.id];
      for (const x of q.ins) {
        if (typeof x.v === 'number') r[x.name] = x.v;
        else if (x.f) r[x.name] = ev(x.f, env);
        else if (x.v && typeof x.v === 'object') {
          const a = Array.isArray(outs[x.v.series]) ? outs[x.v.series] : [];
          r[x.name] = x.v.stat ? statOf(a, x.v.stat) : x.v.points ? resample(a, x.v.points) : a.slice(0, MAX_POINTS);
        } else r[x.name] = NaN;
      }
      return r;
    }
    /** a part's answer into the outputs and (scalars) the names */
    function take(q, o, env, outs) {
      for (const d of q.outs) {
        const v = o && typeof o === 'object' ? o[d.id] : undefined;
        if (d.kind === 'scalar') { const x = isN(v) || typeof v === 'boolean' ? +v : NaN; outs[d.id] = typeof v === 'boolean' ? v : x; env[d.id] = x; }
        else outs[d.id] = v === undefined ? (d.kind === 'series' ? [] : undefined) : v;
      }
    }
    const scalarsOf = qs => qs.flatMap(q => q.outs.filter(d => d.kind === 'scalar').map(d => d.id));
    const change = (ids, a, b) => { let m = 0; for (const k of ids) { const x = a[k], y = b[k]; if (!isN(x) || !isN(y)) { if (x !== y && !(x !== x && y !== y)) return Infinity; continue; } m = Math.max(m, Math.abs(x - y) / Math.max(1, Math.abs(x))); } return m; };

    async function graph(env, my) {
      const outs = {}, codes = [];
      const alive = () => { if (dead || my !== job) return false; if (now() - started > RUN_TIMEOUT) { fail('runaway'); return false; } return true; };
      const chainPart = async q => {
        const inp = inputsOf(q, env, outs); q.last = inp;
        const o = await runOnce(q, q.prep(inp));
        if (!alive()) return false;
        if (o == null) codes.push({ code: 'part-failed', part: q.id });
        take(q, o, env, outs); return true;
      };
      const evalD = ids => { for (const id of ids) { let v; try { v = derived.get(id)(env); } catch (e) { v = NaN; } env[id] = v; } };   // (a true/false stays one: the readouts show ✓ / ✗)
      for (const u of plan.order) {
        if (u.k === 'derived') { evalD([u.id]); continue; }
        if (u.k === 'part') { if (!(await chainPart(byId.get(u.id)))) return null; continue; }
        const qs = u.parts.map(id => byId.get(id)), def = u.k === 'loop' ? loops[u.i] || {} : cosim || {}, ids = scalarsOf(qs);
        for (const k of ids) env[k] = def.init && isN(def.init[k]) ? def.init[k] : 0;
        if (u.k === 'loop') {
          const tol = def.tol, relax = isN(def.relax) ? def.relax : 1, maxIter = Math.min(L.iter, def.maxIter || 20);
          let ok = false, it = 0;
          while (it < maxIter && !ok) {
            it++;
            const before = {}; for (const k of ids) before[k] = env[k];
            for (const q of qs) {
              evalD(u.derived);
              const old = {}; for (const k of scalarsOf([q])) old[k] = env[k];
              if (!(await chainPart(q))) return null;
              if (relax !== 1) for (const k of Object.keys(old)) if (isN(old[k]) && isN(env[k])) { env[k] = relax * env[k] + (1 - relax) * old[k]; outs[k] = env[k]; }
            }
            evalD(u.derived);
            ok = change(ids, env, before) <= tol;
          }
          if (!ok) { for (const k of ids) { env[k] = NaN; outs[k] = NaN; } codes.push({ code: 'no-converge', loop: u.i, iterations: it }); }
          continue;
        }
        // a co-simulation in time
        const t0 = ev(CS.t0, env), tEnd = ev(CS.tEnd, env), dt = ev(CS.dt, env);
        if (!(isN(t0) && isN(tEnd) && isN(dt) && dt > 0 && tEnd > t0)) { codes.push({ code: 'bad-config' }); for (const q of qs) take(q, null, env, outs); continue; }
        const eps = 1e-9 * Math.max(1, Math.abs(tEnd)), tp = new Map(qs.map(q => [q.id, t0])), inbox = new Map(qs.map(q => [q.id, []]));
        const rec = new Map(), times = [t0];
        const series = q => q.outs.filter(d => d.kind === 'series');
        const sample = (q, o, first) => {
          for (const d of q.outs) {
            const v = o && typeof o === 'object' ? o[d.id] : undefined;
            if (d.kind === 'series') { if (Array.isArray(v)) rec.set(d.id, { whole: v }); else { const r = rec.get(d.id) || { s: [] }; if (r.s) { if (first) r.s = [isN(v) ? v : NaN]; else r.pend = isN(v) ? v : NaN; } rec.set(d.id, r); if (isN(v)) env[d.id] = v; } }   // the step's value: what the other parts' formulas read
            else if (d.kind === 'scalar') { if (isN(v) || typeof v === 'boolean') { env[d.id] = +v; outs[d.id] = v; } }
            else if (v !== undefined) outs[d.id] = v;
          }
        };
        let failed = false;
        for (const q of qs) {
          evalD(u.derived);
          const inp = inputsOf(q, env, outs); q.last = inp;
          const r = await call(q, 'sinit', q.prep(inp), t0);
          if (!alive()) return null;
          if (!r || r.fail) { codes.push({ code: 'part-failed', part: q.id }); failed = true; break; }
          for (const d of series(q)) rec.set(d.id, { s: [] });
          sample(q, r.out, true);
        }
        if (failed) { for (const q of qs) take(q, null, env, outs); continue; }
        const it = def.iterate && typeof def.iterate === 'object' ? { tol: def.iterate.tol, max: Math.min(L.iter, def.iterate.maxIter || 10) } : null;
        let canIter = !!it, rounds = 0, noConv = 0, stuck = 0;
        const roundsMax = 4 * L.macro;
        const tg = () => Math.min(...tp.values());
        while (tg() < tEnd - eps) {
          if (++rounds > roundsMax) { codes.push({ code: 'budget' }); break; }
          const t = tg(), aligned = [...tp.values()].every(x => Math.abs(x - t) <= eps);
          let snapped = false;
          if (canIter && aligned) {
            const slots = []; for (const q of qs) slots.push(await call(q, 'snap', null));
            if (!alive()) return null;
            if (slots.some(s => !(s >= 0))) { canIter = false; codes.push({ code: 'no-snapshot' }); } else snapped = true;
          }
          let k = 0, prevX = null, settled = !snapped;
          const saveEnv = snapped ? Object.assign({}, env) : null, saveIn = snapped ? new Map([...inbox].map(([a, b]) => [a, b.slice()])) : null;
          do {
            if (k > 0) {   // back to the start of the macro step
              for (const q of qs) await call(q, 'restore', null, 0);
              if (!alive()) return null;
              Object.assign(env, saveEnv); for (const q of qs) tp.set(q.id, t); for (const [a, b] of saveIn) inbox.set(a, b.slice());
            }
            let target = Math.min(t + dt, tEnd);
            const xs = {};
            for (const q of qs) {
              const tq = tp.get(q.id);
              if (tq > t + eps) continue;   // ahead after an early stop of another part: it waits
              evalD(u.derived);
              const h = target - tq; if (!(h > 0)) continue;
              const inp = inputsOf(q, env, outs); q.last = inp;
              const box = inbox.get(q.id); inbox.set(q.id, []);
              const r = await call(q, 'step', q.prep(inp), tq, h, box);
              if (!alive()) return null;
              if (!r || r.fail) { codes.push({ code: 'part-failed', part: q.id, t: tq }); failed = true; break; }
              const taken = isN(r.dt) ? Math.max(0, Math.min(h, r.dt)) : h;
              tp.set(q.id, tq + taken);
              if (taken < h - eps) target = tq + taken;   // a state event: the parts after it meet it at its time
              sample(q, r.out, false);
              for (const e of Array.isArray(r.events) ? r.events : []) for (const o of qs) if (o !== q && (!e.to || e.to.includes(o.id))) inbox.get(o.id).push({ ...e, source: q.id });
            }
            if (failed) break;
            for (const id of ids) xs[id] = env[id];
            settled = !snapped || (prevX && change(ids, xs, prevX) <= it.tol);
            prevX = xs; k++;
          } while (!settled && k < it.max);
          if (failed) break;
          if (!settled) noConv++;
          const tn = tg();
          if (tn <= t + eps) { if (++stuck > 3) { codes.push({ code: 'no-progress', t }); break; } } else stuck = 0;
          if (tn > t + eps) { times.push(tn); for (const r of rec.values()) if (r.s) { r.s.push(r.pend === undefined ? (r.s.length ? r.s[r.s.length - 1] : NaN) : r.pend); r.pend = undefined; } }
          if (times.length > L.macro * 4) { codes.push({ code: 'budget', t: tn }); break; }   // never a silent cut: the run says it stopped early
        }
        if (failed) { for (const q of qs) take(q, null, env, outs); continue; }
        if (noConv) codes.push({ code: 'no-converge', cosim: true, steps: noConv });
        const thin = a => { if (a.length <= MAX_POINTS) return a; const f = (a.length - 1) / (MAX_POINTS - 1), r = []; for (let i = 0; i < MAX_POINTS; i++) r.push(a[Math.round(i * f)]); return r; };
        for (const [id, r] of rec) outs[id] = thin(r.whole ? Array.from(r.whole) : r.s);
        if (typeof def.time === 'string') outs[def.time] = thin(times);
      }
      return { outputs: outs, env, codes };
    }
    function pump() {
      if (dead || busy || !pending) return;
      const { env, done } = pending; pending = null; busy = true;
      const my = ++job; started = now();
      clearTimeout(timer); timer = setTimeout(() => { if (busy && my === job) fail('runaway'); }, RUN_TIMEOUT + 50);
      graph(Object.assign({}, env), my).then(r => { busy = false; clearTimeout(timer); if (r && !dead && !pending) done(r); pump(); },
        e => { busy = false; clearTimeout(timer); console.warn('[noema] sim-spec parts', e); if (!dead && !pending) done(null); pump(); });
    }
    /** run(env, done): env = the consts and params (and the derived values that need no part; they are computed again in order) */
    function run(env, done) { if (dead) return; pending = { env, done }; if (busy) job++; pump(); }   // a run under way stops at its next step
    /** a measurement of the bench: on the bench part, with the inputs of its last run */
    function measure(env, probe, done) {
      const q = spec.bench && byId.get(spec.bench.part);
      if (dead || !q || !q.runner.measure) return done(null);
      q.runner.measure(q.prep(q.last || inputsOf(q, env, {})), probe, done);
    }
    function close() { if (dead) return; dead = true; clearTimeout(timer); pending = null; for (const q of P) try { q.runner.close(); } catch (e) { } }
    return { run, measure, close, plan, inWorker: () => P.some(q => q.runner.inWorker && q.runner.inWorker()) };
  }
  /** a spec whose parts reuse activities/_parts ({use, with}): the same spec with each part written out (the checks then see whole parts);
      any other spec is returned as it is */
  function withParts(spec) {
    const PC = window.NoemaPackCheck;
    if (!PC || !PC.resolveParts || !spec || typeof spec !== 'object' || !Array.isArray(spec.parts) || !spec.parts.some(p => p && typeof p === 'object' && p.use !== undefined)) return spec;
    const E = [], R = PC.resolveParts(spec, ACT.PARTS || window.Noema?.pack?.activities?.parts || null, E);
    return E.length || !R ? spec : { ...spec, parts: R.map(r => r.p) };
  }
  /** the engine a spec with parts shows simView: the checks of every part's engine on its part's spec, the bench of the bench part */
  function partsEngine(spec) {
    const PC = window.NoemaPackCheck, lib = ACT.PARTS || window.Noema?.pack?.activities?.parts || null;
    if (!PC || !PC.partsPlan) return null;
    const plan = PC.partsPlan(spec, lib), Es = plan.parts.map(p => (typeof p.engine === 'string' ? ACT.engine(p.engine) : null));
    if (!plan.parts.length || Es.some(e => !e)) return null;
    const bi = spec.bench ? plan.parts.findIndex(p => p.id === spec.bench.part) : -1;
    return {
      id: 'parts', plan, lib, ...(bi >= 0 && Es[bi].bench ? { bench: true } : {}),
      check: sp => plan.parts.flatMap((p, i) => { if (!Es[i].check) return []; try { return (Es[i].check(PC.partSpec(sp, p)) || []).map(m => PC.partMsg(String(m), `spec.parts[${i}]`)); } catch (e) { return [`spec.parts[${i}]: ` + String(e.message || e)]; } }),
    };
  }
  /** a seeded pick: the same seed draws the same item (mulberry32) */
  function seededIndex(seed, n) { let a = (seed ^ 0x9E3779B9) >>> 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * n); }

  /* ---------- plots: SVG drawn by the app, coloured by the theme's tokens ---------- */
  function niceTicks(lo, hi, n) {
    const span = hi - lo; if (!(span > 0)) return [lo];
    const raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function logTicks(lo, hi, maxN) {
    const a = Math.floor(Math.log10(lo) + 1e-9), b = Math.ceil(Math.log10(hi) - 1e-9), out = [];
    const every = Math.max(1, Math.ceil((b - a + 1) / Math.max(2, maxN)));
    for (let k = a; k <= b; k += every) { const v = Math.pow(10, k); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
    return out.length ? out : [lo, hi];
  }
  /** draw one plot into fig: data = { xs:[…], lines:[{ys, label}], marks:[{axis, v, label}] } */
  function drawPlot(fig, p, data, ctx) {
    const W = Math.max(220, Math.floor(fig.clientWidth || 320)), H = Math.round(Math.max(170, Math.min(300, W * 0.55)));
    const xa = p.x || {}, ya = p.y || {}, xlog = xa.scale === 'log', ylog = ya.scale === 'log';
    const ml = W < 360 ? 44 : 54, mr = 12, mt = 10, mb = 40;
    let [x0, x1] = data.xr;
    let ys = []; for (const l of data.lines) for (const v of l.ys) if (isNum(v) && (!ylog || v > 0)) ys.push(v);
    let y0 = isNum(data.yr[0]) ? data.yr[0] : null, y1 = isNum(data.yr[1]) ? data.yr[1] : null;
    if (y0 == null || y1 == null) {
      let lo = Infinity, hi = -Infinity; for (const v of ys) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!isFinite(lo)) { lo = ylog ? 1 : 0; hi = ylog ? 10 : 1; }
      if (lo === hi) { if (ylog) { lo /= 2; hi *= 2; } else { lo -= 1; hi += 1; } }
      const pad = ylog ? 1 : (hi - lo) * 0.06;
      if (y0 == null) y0 = ylog ? lo / 1.2 : lo - pad;
      if (y1 == null) y1 = ylog ? hi * 1.2 : hi + pad;
    }
    if (!(x1 > x0)) x1 = x0 + 1; if (!(y1 > y0)) y1 = y0 + 1;
    const tx = xlog ? v => Math.log10(v) : v => v, ty = ylog ? v => Math.log10(v) : v => v;
    const X = v => ml + (tx(v) - tx(x0)) / (tx(x1) - tx(x0)) * (W - ml - mr), Y = v => mt + (1 - (ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * (H - mt - mb);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ctx.aria, focusable: 'false' });
    const cid = 'simclip' + (++seq);
    const defs = svg('defs'); const cp = svg('clipPath', { id: cid }); cp.append(svg('rect', { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb })); defs.append(cp); s.append(defs);
    s.append(svg('rect', { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb, fill: 'none', style: 'stroke:var(--line)' }));
    // tick labels: SI prefixes carry the unit (1 kHz, 200 µs); a plain number does not (the axis label has it)
    const tick = (a, lg) => { const fm = a.format || (lg ? 'si' : 'auto'); return v => fmtNum(v, { format: fm, digits: a.digits || 3, unit: fm === 'si' ? a.unit : '' }, ctx.locale); };
    const nt = Math.max(2, Math.floor((W - ml - mr) / 70)), fx = tick(xa, xlog), fy = tick(ya, ylog);
    const txt = (x, y, t, anchor, cls) => { const e = svg('text', { x, y, 'text-anchor': anchor, class: cls || 'sim-tick' }); e.textContent = t; return e; };
    for (const v of xlog ? logTicks(x0, x1, nt) : niceTicks(x0, x1, nt)) { const px = X(v); s.append(svg('line', { x1: px, x2: px, y1: mt, y2: H - mb, class: 'sim-grid' }), txt(px, H - mb + 14, fx(v), 'middle')); }
    for (const v of ylog ? logTicks(y0, y1, 5) : niceTicks(y0, y1, 5)) { const py = Y(v); s.append(svg('line', { x1: ml, x2: W - mr, y1: py, y2: py, class: 'sim-grid' }), txt(ml - 5, py + 4, fy(v), 'end')); }
    if (ctx.xLabel) s.append(txt(ml + (W - ml - mr) / 2, H - 6, ctx.xLabel, 'middle', 'sim-axl'));
    if (ctx.yLabel) { const e = txt(0, 0, ctx.yLabel, 'middle', 'sim-axl'); e.setAttribute('transform', `translate(11 ${mt + (H - mt - mb) / 2}) rotate(-90)`); s.append(e); }
    const g = svg('g', { 'clip-path': `url(#${cid})` });
    const clampY = v => Math.max(-1e4, Math.min(1e4, v));
    data.lines.forEach((l, j) => {
      const st = l.style || 'line', col = `stroke:${COLORS[j % COLORS.length]}`;
      if (st === 'bars' || st === 'points') {   // the engine library's styles (docs/INTERACTIVE_LIBRARY.md §1.4): bars for a distribution or counts, points for samples
        const xsN = data.xs.filter((x, i) => isNum(x) && isNum(l.ys[i])), gap = xsN.length > 1 ? Math.abs(X(xsN[1]) - X(xsN[0])) : 12, bw = Math.max(1, Math.min(40, gap * 0.8 / (data.lines.length || 1)));
        const base = Y(ylog ? y0 : Math.max(y0, Math.min(y1, 0)));
        for (let i = 0; i < data.xs.length; i++) {
          const x = data.xs[i], y = l.ys[i];
          if (!isNum(x) || !isNum(y) || (xlog && x <= 0) || (ylog && y <= 0)) continue;
          if (st === 'points') { g.append(svg('circle', { cx: X(x).toFixed(1), cy: clampY(Y(y)).toFixed(1), r: 2.5, style: `fill:${COLORS[j % COLORS.length]}`, class: 'sim-dot' })); continue; }
          const top = clampY(Y(y)), x0b = X(x) - bw * data.lines.length / 2 + j * bw;
          g.append(svg('rect', { x: x0b.toFixed(1), y: Math.min(top, base).toFixed(1), width: bw.toFixed(1), height: Math.abs(base - top).toFixed(1), style: `fill:${COLORS[j % COLORS.length]}`, class: 'sim-bar' }));
        }
        return;
      }
      let d = '', pen = false;
      for (let i = 0; i < data.xs.length; i++) {
        const x = data.xs[i], y = l.ys[i];
        if (!isNum(x) || !isNum(y) || (xlog && x <= 0) || (ylog && y <= 0)) { pen = false; continue; }
        if (st === 'steps' && pen) d += 'H' + X(x).toFixed(1);
        d += (pen ? (st === 'steps' ? 'V' + clampY(Y(y)).toFixed(1) : 'L' + X(x).toFixed(1) + ' ' + clampY(Y(y)).toFixed(1)) : 'M' + X(x).toFixed(1) + ' ' + clampY(Y(y)).toFixed(1)); pen = true;
      }
      g.append(svg('path', { d: d || 'M0 0', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': DASH[j % DASH.length] || null, style: col, class: 'sim-line' }));
    });
    for (const m of data.marks) {
      if (!isNum(m.v)) continue;
      if (m.axis === 'x') { if ((xlog && m.v <= 0) || m.v < x0 || m.v > x1) continue; const px = X(m.v); g.append(svg('line', { x1: px, x2: px, y1: mt, y2: H - mb, class: 'sim-mark' })); if (m.label) g.append(txt(px + 4, mt + 12, m.label, 'start', 'sim-markl')); }
      else { if ((ylog && m.v <= 0) || m.v < y0 || m.v > y1) continue; const py = Y(m.v); g.append(svg('line', { x1: ml, x2: W - mr, y1: py, y2: py, class: 'sim-mark' })); if (m.label) g.append(txt(W - mr - 4, py - 4, m.label, 'end', 'sim-markl')); }
    }
    s.append(g);
    return s;
  }

  /* ---------- the engine library's drawings and sounds (docs/INTERACTIVE_LIBRARY.md §1.4): a plot of kind scene / sound ---------- */
  const ROLE = r => ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'].includes(r) ? r : 'base';
  /** draw a scene {view: [x0, x1, y0, y1], items} into fig: the same scale on both axes, y upwards; words from the string tables */
  function drawScene(fig, p, sc, ctx) {
    const W = Math.max(220, Math.floor(fig.clientWidth || 320));
    const v = Array.isArray(sc && sc.view) && sc.view.length === 4 && sc.view.every(isNum) && sc.view[1] > sc.view[0] && sc.view[3] > sc.view[2] ? sc.view : [-1, 1, -1, 1];
    const aspect = (v[3] - v[2]) / (v[1] - v[0]);
    const H = p.height || Math.round(Math.max(180, Math.min(520, W * aspect)));
    const k = Math.min(W / (v[1] - v[0]), H / (v[3] - v[2])), ox = (W - k * (v[1] - v[0])) / 2, oy = (H - k * (v[3] - v[2])) / 2;
    const X = x => (ox + (x - v[0]) * k), Y = y => (H - oy - (y - v[2]) * k);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ctx.aria, focusable: 'false', class: 'sim-scene' });
    const mid = 'simarr' + (++seq), defs = svg('defs'), mk = svg('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    mk.append(svg('path', { d: 'M0 0L10 5L0 10z', class: 'sim-arrowhead' })); defs.append(mk); s.append(defs);
    const word = it => it.key != null ? ctx.tt(it.key) : isNum(it.v) ? fmtNum(it.v, { digits: it.digits || 3 }, ctx.locale) : typeof it.s === 'string' ? it.s.slice(0, 64) : '';
    const label = (x, y, it, anchor) => { const t = word(it); if (!t) return; const e = svg('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor || 'middle', class: 'sim-sl sim-r-' + ROLE(it.c) }); e.textContent = t; s.append(e); };
    const items = Array.isArray(sc && sc.items) ? sc.items.slice(0, 2000) : [];
    const order = { poly: 0, circ: 1, seg: 2, pt: 3, txt: 4 };
    for (const it of items.slice().sort((a, b) => (order[a && a.k] ?? 9) - (order[b && b.k] ?? 9))) {
      if (!it || typeof it !== 'object') continue;
      const cls = 'sim-r-' + ROLE(it.c), dash = it.dash ? '5 4' : null;
      if (it.k === 'pt' && isNum(it.x) && isNum(it.y)) { s.append(svg('circle', { cx: X(it.x).toFixed(1), cy: Y(it.y).toFixed(1), r: isNum(it.r) ? Math.max(1, Math.min(30, it.r)) : 4, class: 'sim-pt ' + cls })); label(X(it.x), Y(it.y) - 9, it); }
      else if (it.k === 'seg' && [it.x1, it.y1, it.x2, it.y2].every(isNum)) { s.append(svg('line', { x1: X(it.x1).toFixed(1), y1: Y(it.y1).toFixed(1), x2: X(it.x2).toFixed(1), y2: Y(it.y2).toFixed(1), class: 'sim-seg ' + cls, 'stroke-width': isNum(it.w) ? Math.max(0.5, Math.min(12, it.w)) : 2, 'stroke-dasharray': dash, 'marker-end': it.arrow ? `url(#${mid})` : null })); label((X(it.x1) + X(it.x2)) / 2, (Y(it.y1) + Y(it.y2)) / 2 - 5, it); }
      else if (it.k === 'circ' && [it.x, it.y, it.r].every(isNum)) s.append(svg('circle', { cx: X(it.x).toFixed(1), cy: Y(it.y).toFixed(1), r: Math.max(0, it.r * k).toFixed(1), class: 'sim-circ ' + cls + (it.fill ? ' sim-fill' : ''), 'stroke-dasharray': dash }));
      else if (it.k === 'poly' && Array.isArray(it.pts) && it.pts.length >= 4 && it.pts.every(isNum)) {
        const pts = []; for (let i = 0; i + 1 < it.pts.length; i += 2) pts.push(X(it.pts[i]).toFixed(1) + ',' + Y(it.pts[i + 1]).toFixed(1));
        s.append(svg(it.closed === false ? 'polyline' : 'polygon', { points: pts.join(' '), class: 'sim-poly ' + cls + (it.fill ? ' sim-fill' : ''), 'stroke-dasharray': dash }));
      } else if (it.k === 'txt' && isNum(it.x) && isNum(it.y)) label(X(it.x), Y(it.y), it, it.anchor === 'start' || it.anchor === 'end' ? it.anchor : 'middle');
    }
    return s;
  }
  /** play a sound {notes: [{f Hz, t s, d s, g 0–1}], wave?, partials?: [amplitudes]} with WebAudio (≤ 512 notes, ≤ 60 s); → stop() */
  let AC = null;
  function playSound(snd) {
    const A = window.AudioContext || window.webkitAudioContext; if (!A || !snd || !Array.isArray(snd.notes)) return () => { };
    AC = AC || new A(); if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + 0.05, out = AC.createGain(); out.gain.value = 0.25; out.connect(AC.destination);
    let wave = ['sine', 'triangle', 'square', 'sawtooth'].includes(snd.wave) ? snd.wave : 'sine', custom = null;
    if (Array.isArray(snd.partials) && snd.partials.length > 1 && snd.partials.every(isNum)) {
      const n = Math.min(64, snd.partials.length), re = new Float32Array(n + 1), im = new Float32Array(n + 1);
      for (let i = 0; i < n; i++) im[i + 1] = snd.partials[i];
      custom = AC.createPeriodicWave(re, im);
    }
    const oscs = [];
    for (const nt of snd.notes.slice(0, 512)) {
      if (!nt || ![nt.f, nt.t, nt.d].every(isNum) || nt.f < 16 || nt.f > 20000 || nt.d <= 0 || nt.t < 0 || nt.t + nt.d > 60) continue;
      const o = AC.createOscillator(), g = AC.createGain(), a = t0 + nt.t, e = a + nt.d, gv = isNum(nt.g) ? Math.max(0, Math.min(1, nt.g)) : 0.8;
      if (custom) o.setPeriodicWave(custom); else o.type = wave;
      o.frequency.value = nt.f;
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(gv, a + 0.01); g.gain.setValueAtTime(gv, Math.max(a + 0.01, e - 0.03)); g.gain.linearRampToValueAtTime(0, e);
      o.connect(g); g.connect(out); o.start(a); o.stop(e + 0.02); oscs.push(o);
    }
    return () => { for (const o of oscs) try { o.stop(); } catch (x) { } try { out.disconnect(); } catch (x) { } };
  }

  /** The spec view: controls, readouts, plots (and a bench) drawn by the app from a spec. → port { send(type, payload), close(), values(), reveal(), saveSoon() }
      host (optional, py-module@1 in 37_activity_py_ui.js): another runtime that computes the outputs itself —
        { engine: { id }, check: { python: true } (the options of checkSimSpec), runner(spec, opts, onFail) → { run(inputs, done), measure?, close },
          stateExtra() → fields saved beside the values, decorate(root) → adds its own lines to the view }
      Without host the outputs come from the spec's engine (ACT.registerEngine). */
  function simView(box, { act, init, onMessage, onFail }, host) {
      const later = f => Promise.resolve().then(f);   // never call back before the core holds the port
      const out = (type, payload) => { if (!closed) onMessage(ACTP.out(type, payload)); };
      let closed = false;
      const port = { send() { }, close() { closed = true; }, values: () => null };
      const spec = host ? act.spec : withParts(act.spec), tables = act.strings && typeof act.strings === 'object' ? act.strings : null;
      const PT = !host && !!spec && typeof spec === 'object' && 'parts' in spec;   // several engines in one spec (§12.8)
      const engId = host ? host.engine.id : PT ? 'parts' : spec && typeof spec === 'object' && 'engine' in spec ? spec.engine : 'formula@1';
      const E = host ? host.engine : PT ? partsEngine(spec) : typeof engId === 'string' ? ACT.engine(engId) : null;
      if (!E) { console.warn('[noema] sim-spec', act.id, 'unknown engine', engId); later(() => onFail('unsupported')); return port; }
      if (spec && spec.bench && !E.bench) { console.warn('[noema] sim-spec', act.id, 'engine', engId, 'takes no measurements'); later(() => onFail('unsupported')); return port; }
      const probs = window.NoemaPackCheck?.checkSimSpec ? NoemaPackCheck.checkSimSpec(spec, tables, host ? null : ACT.engines(), host ? host.check : undefined) : ['the spec checker is not loaded'];
      if (!probs.length && E.check) try { probs.push(...(E.check(spec) || [])); } catch (e) { probs.push(String(e.message || e)); }
      if (probs.length) { console.warn('[noema] sim-spec', act.id, probs.slice(0, 5).join(' | ')); later(() => onFail('spec')); return port; }

      const T = init.strings || {}, locale = init.locale || 'en';
      const tt = k => (k && Object.prototype.hasOwnProperty.call(T, k)) ? T[k] : '';
      const C = NoemaCore.engines.expr.compile;
      const consts = Object.assign({}, spec.consts || {});
      for (const [k, v] of Object.entries(init.task || {})) if (Object.prototype.hasOwnProperty.call(consts, k) && isNum(v)) consts[k] = v;
      const params = spec.params, derived = (spec.derived || []).map(d => ({ id: d.id, f: C(d.expr) }));
      const readouts = (spec.readouts || []).map(r => ({ ...r, f: C(r.expr) }));
      const lim = v => typeof v === 'string' ? C(v) : (() => v);
      const plots = (spec.plots || []).map(p => p.kind === 'scene' || p.kind === 'sound' ? { p, lines: [], marks: [] } : ({ p, xmin: p.x.min != null ? lim(p.x.min) : null, xmax: p.x.max != null ? lim(p.x.max) : null, ymin: p.y?.min != null ? lim(p.y.min) : null, ymax: p.y?.max != null ? lim(p.y.max) : null,
        lines: (p.series || []).map(s => ({ ...s, f: p.kind === 'function' ? C(s.expr) : null })), marks: (p.marks || []).map(m => ({ ...m, f: C(m.expr) })) }));
      const ev = (f, env) => { try { return f(env); } catch (e) { return NaN; } };

      /* the values: saved state, else the defaults */
      const def = p => p.kind === 'toggle' ? !!p.default : p.kind === 'choice' ? (p.default ?? p.options[0].value) : p.default;
      const fits = (p, v) => p.kind === 'toggle' ? typeof v === 'boolean' : p.kind === 'choice' ? p.options.some(o => o.value === v) : (isNum(v) && v >= p.min && v <= p.max);
      const vals = {}; const saved = init.state?.data?.values;
      for (const p of params) vals[p.id] = saved && fits(p, saved[p.id]) ? saved[p.id] : def(p);

      /* ---------- the view ---------- */
      const uid = 'sim' + (++seq) + '-';
      const root = h('div', { class: 'sim', lang: locale });
      if (spec.title) root.append(h('h4', { class: 'sim-title' }, tt(spec.title)));
      if (spec.intro) root.append(h('p', { class: 'sim-intro' }, tt(spec.intro)));
      const ctl = h('div', { class: 'sim-ctl' }), ctlEls = {};
      const snap = (p, v) => {
        if (p.kind === 'number' || p.kind === 'slider') {
          if (p.step) v = p.min + Math.round((v - p.min) / p.step) * p.step;
          else if (p.scale === 'log') { const k = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2); v = Math.round(v / k) * k; }
          v = Math.min(p.max, Math.max(p.min, +v.toPrecision(12)));
        }
        return v;
      };
      const pos = p => p.scale === 'log' ? Math.round(1000 * Math.log(vals[p.id] / p.min) / Math.log(p.max / p.min)) : vals[p.id];
      const fromPos = (p, x) => p.scale === 'log' ? p.min * Math.pow(p.max / p.min, x / 1000) : x;
      const showVal = p => fmtNum(vals[p.id], { unit: p.unit, format: p.format || (p.scale === 'log' ? 'si' : 'auto'), digits: p.digits }, locale);
      for (const p of params) {
        const id = uid + p.id, lab = tt(p.label);
        if (p.kind === 'slider' || p.kind === 'number') {
          const o = h('output', { for: id }), num = h('input', { class: 'sim-num', type: 'number', 'data-param': p.id, inputmode: 'decimal', min: p.min, max: p.max, step: p.step || 'any', 'aria-label': lab + (p.unit ? ' (' + p.unit + ')' : ''), value: vals[p.id] });
          const rng = p.kind === 'slider' ? h('input', { id, type: 'range', min: p.scale === 'log' ? 0 : p.min, max: p.scale === 'log' ? 1000 : p.max, step: p.scale === 'log' ? 1 : (p.step || 'any'), value: pos(p) }) : null;
          if (!rng) num.id = id;
          const set = (v, commit) => { if (!isNum(v)) return; vals[p.id] = snap(p, v); paint(p); changed(p, commit); };
          rng?.addEventListener('input', () => set(fromPos(p, +rng.value), false));
          rng?.addEventListener('change', () => set(fromPos(p, +rng.value), true));
          num.addEventListener('input', () => { const v = parseFloat(num.value); if (isNum(v) && v >= p.min && v <= p.max) set(v, false); });
          num.addEventListener('change', () => { const v = parseFloat(num.value); if (isNum(v)) set(Math.min(p.max, Math.max(p.min, v)), true); else paint(p); });
          ctlEls[p.id] = { o, num, rng };
          ctl.append(h('div', { class: 'sim-p' }, h('label', { for: id, class: 'sim-lab' }, h('span', {}, lab), o), h('div', { class: 'sim-row' }, rng, num)));
        } else if (p.kind === 'toggle') {
          const cb = h('input', { id, type: 'checkbox', role: 'switch', 'data-param': p.id });
          cb.addEventListener('change', () => { vals[p.id] = cb.checked; changed(p, true); });
          ctlEls[p.id] = { cb };
          ctl.append(h('div', { class: 'sim-p sim-tog' }, cb, h('label', { for: id }, lab)));
        } else {
          const sel = h('select', { id, class: 'sim-sel', 'data-param': p.id }, p.options.map(o => h('option', { value: String(o.value) }, tt(o.label))));
          sel.addEventListener('change', () => { vals[p.id] = p.options[sel.selectedIndex].value; changed(p, true); });
          ctlEls[p.id] = { sel };
          ctl.append(h('div', { class: 'sim-p' }, h('label', { for: id, class: 'sim-lab' }, lab), sel));
        }
      }
      function paint(p) {
        const c = ctlEls[p.id];
        if (c.o) { c.o.textContent = showVal(p); if (document.activeElement !== c.num) c.num.value = String(vals[p.id]); if (c.rng) { c.rng.value = String(pos(p)); c.rng.setAttribute('aria-valuetext', showVal(p)); } }
        if (c.cb) c.cb.checked = !!vals[p.id];
        if (c.sel) c.sel.selectedIndex = Math.max(0, p.options.findIndex(o => o.value === vals[p.id]));
      }
      root.append(ctl);
      const ro = readouts.length ? h('dl', { class: 'sim-ro', 'aria-label': tE('engine.act.sim.results'), 'aria-live': 'polite' }) : null;
      const roEls = readouts.map(r => { const dd = h('dd', {}); ro.append(h('div', {}, h('dt', {}, tt(r.label)), dd)); return dd; });
      if (ro) root.append(ro);
      const figs = plots.map(P => {
        const p = P.p, fig = h('figure', { class: 'sim-plot' + (p.kind === 'scene' ? ' sim-plot-scene' : p.kind === 'sound' ? ' sim-plot-sound' : '') });
        if (p.kind === 'scene' || p.kind === 'sound') {   // a drawing / a sound of the engine library
          P.aria = (p.title ? tt(p.title) + '. ' : '') + tE(p.kind === 'scene' ? 'engine.act.sim.scene' : 'engine.act.sim.sound');
          if (p.title) fig.append(h('figcaption', {}, tt(p.title)));
          P.holder = h('div', { class: 'sim-svg' }); fig.append(P.holder);
          if (p.kind === 'sound') {
            let stop = null;
            const b = h('button', { class: 'btn small', type: 'button', 'data-sound': p.of, 'aria-label': P.aria, onclick: () => { if (stop) { stop(); stop = null; b.textContent = '▶ ' + tE('engine.act.sim.play'); return; } stop = playSound(outputs[p.of]); b.textContent = '■ ' + tE('engine.act.sim.stop'); const dur = Math.max(0, ...((outputs[p.of]?.notes) || []).map(n => (n.t || 0) + (n.d || 0))); setTimeout(() => { if (stop) { stop = null; b.textContent = '▶ ' + tE('engine.act.sim.play'); } }, Math.min(60, dur) * 1000 + 200); } }, '▶ ' + tE('engine.act.sim.play'));
            P.holder.append(b);
          }
          root.append(fig);
          return fig;
        }
        const axisLab = a => a && a.label ? tt(a.label) + (a.unit ? ' (' + a.unit + ')' : '') : (a && a.unit ? a.unit : '');
        P.xLabel = axisLab(p.x); P.yLabel = axisLab(p.y);
        P.aria = (p.title ? tt(p.title) + '. ' : '') + tE('engine.act.sim.plot', { y: P.yLabel || '—', x: P.xLabel || '—' });
        if (p.title) fig.append(h('figcaption', {}, tt(p.title)));
        P.holder = h('div', { class: 'sim-svg' }); fig.append(P.holder);
        const named = P.lines.filter(l => l.label);
        if (named.length) fig.append(h('div', { class: 'sim-leg', 'aria-hidden': 'true' }, P.lines.map((l, j) => l.label ? h('span', {}, h('i', { class: 'sim-sw', style: { borderTopColor: COLORS[j % COLORS.length], borderTopStyle: DASH[j % DASH.length] ? 'dashed' : 'solid' } }), tt(l.label)) : null)));
        root.append(fig);
        return fig;
      });
      const busyNote = h('div', { class: 'sim-busy', 'aria-hidden': 'true' });
      const reset = h('button', { class: 'btn ghost small', type: 'button', onclick: () => { for (const p of params) { vals[p.id] = def(p); paint(p); } out('event', { name: 'reset' }); recompute(); saveSoon(); } }, '↺ ' + tE('engine.act.sim.reset'));
      const B = spec.bench ? makeBench() : null;   // a fault-finding bench (§12.7): instruments, the measurement log, the diagnosis
      if (B) root.append(B.el);
      const partsNote = PT ? h('p', { class: 'sim-note', 'aria-live': 'polite', hidden: true }) : null;   // a loop that did not settle, a part that failed
      if (partsNote) root.append(partsNote);
      root.append(h('div', { class: 'sim-foot' }, busyNote, reset));
      host?.decorate?.(root);
      box.append(root);

      /* ---------- computing ---------- */
      let env = {}, outputs = {}, paused = false, dirty = false, saveT = null, raf = 0, rev = 0, doneRev = 0;
      const prep = typeof E.prepare === 'function' ? E.prepare(spec, C) : (x => x);   // the engine's expressions → numbers, on this thread
      const newRunner = () => E.id === 'formula@1' ? null : (host ? host.runner : PT ? ((_, s, o, f) => partsRunner(s, o, f)) : engineRunner)(E, spec, { seed: init.seed >>> 0, task: { ...consts }, faults: B ? B.applied() : undefined }, why => onFail(why));
      let runner = newRunner();
      const cosimTime = PT && spec.couple && typeof spec.couple === 'object' && spec.couple.cosim && typeof spec.couple.cosim.time === 'string' ? [{ id: spec.couple.cosim.time, kind: 'series' }] : [];   // the co-simulation's time series
      const declared = PT ? E.plan.parts.flatMap(p => (p.outputs || []).filter(o => o && typeof o.id === 'string')).concat(cosimTime) : spec.outputs || [];

      /* ---------- the bench: the hidden fault lives only in this closure and in the engine (never in the page, the state or a label) ---------- */
      function makeBench() {
        const bn = spec.bench, exMode = !!init.exerciseId, opts = bn.diagnosis.options, budget = bn.budget || 0;
        const savedB = !exMode && init.state?.data?.bench && typeof init.state.data.bench === 'object' ? init.state.data.bench : null;
        let seed = isNum(savedB?.seed) ? savedB.seed >>> 0 : init.seed >>> 0, fault = 0, dx = null, done = false, count = 0, face = null;
        const log = [];
        function pick() {
          const ids = bn.faults.map(f => f.id), tf = init.task?.fault;
          const pool = typeof tf === 'string' && ids.includes(tf) ? [tf] : Array.isArray(tf) && tf.some(x => ids.includes(x)) ? tf.filter(x => ids.includes(x)) : ids;
          fault = ids.indexOf(pool[seededIndex(seed, pool.length)]);
        }
        pick();
        const pt = id => bn.points.find(p => p.id === id);
        const instName = k => tE('engine.act.bench.inst.' + k);
        const sel = (cls, label, items) => {   // a labelled select: items [{value, text}]
          const id = uid + 'b-' + cls, s = h('select', { id, class: 'sim-sel', 'data-bench': cls }, items.map(o => h('option', { value: o.value }, o.text)));
          return { s, row: h('div', { class: 'sim-p sim-bsel' }, h('label', { for: id, class: 'sim-lab' }, label), s) };
        };
        const inst = sel('instrument', tE('engine.act.bench.instrument'), bn.instruments.map(x => ({ value: x.kind, text: instName(x.kind) })));
        const lab = new Map();   // the label element of each lead select (its words change with the instrument)
        const ptItems = ids => ids.map(id => ({ value: id, text: tt(pt(id).label) }));
        const A = sel('a', tE('engine.act.bench.red'), []), Bk = sel('b', tE('engine.act.bench.black'), []);
        lab.set(A.s, A.row.querySelector('label'));
        const part = sel('part', tE('engine.act.bench.part'), []);
        const modeS = sel('mode', tE('engine.act.bench.mode'), []), gndS = sel('ground', tE('engine.act.bench.ground'), []);   // a multimeter's modes, a scope probe's ground leads (§9.5)
        const modeName = q => tE('engine.act.bench.mode.' + q);
        const btn = h('button', { class: 'btn primary small', type: 'button', 'data-bench': 'measure', onclick: () => measure() }, tE('engine.act.bench.measure'));
        const left = h('span', { class: 'sim-left', 'aria-live': 'polite' });
        const faceEl = h('div', { class: 'sim-face', 'aria-live': 'polite' });
        const logEl = h('ol', { class: 'sim-log' }), logEmpty = h('p', { class: 'sim-log-empty' }, tE('engine.act.bench.logEmpty'));
        const dxSel = sel('diagnosis', bn.diagnosis.label ? tt(bn.diagnosis.label) : tE('engine.act.bench.diagnosis'), [{ value: '', text: tE('engine.act.bench.choose') }, ...opts.map((o, i) => ({ value: String(i), text: tt(o.label) }))]);
        const dxBtn = exMode ? null : h('button', { class: 'btn small', type: 'button', 'data-bench': 'commit', onclick: () => { if (dx != null && !done) { reveal(); saveSoon(); } } }, tE('engine.act.bench.commit'));
        const dxOut = h('p', { class: 'sim-dx-out', 'aria-live': 'polite' });
        const another = exMode ? null : h('button', { class: 'btn ghost small', type: 'button', 'data-bench': 'another', onclick: () => newDevice() }, '↻ ' + tE('engine.act.bench.another'));
        const cur = () => bn.instruments.find(x => x.kind === inst.s.value) || bn.instruments[0];
        const whole = k => k === 'log' || k === 'rssi' || k === 'T' || k === 'clock';   // twin@1: the event log, the RSSI, the thermometer and the clock check read the device, not a point
        function setInstrument() {
          const x = cur(), two = x.kind === 'V' || x.kind === 'R', ids = x.points || bn.points.map(p => p.id);
          const keep = (s, items, fallback) => { const v = s.value; s.replaceChildren(...items.map(o => h('option', { value: o.value }, o.text))); s.value = items.some(o => o.value === v) ? v : fallback; };
          if (x.kind === 'I') keep(part.s, (x.parts || []).map((q, i) => ({ value: String(i), text: tt(q.label) })), '0');
          else if (!whole(x.kind)) {
            const g = ids.find(id => /^(gnd|0)$/.test(String(pt(id).at))) || ids[ids.length - 1];
            keep(A.s, ptItems(ids), ids.find(id => id !== g) || ids[0]);
            if (two) keep(Bk.s, ptItems(ids), g);
          }
          const ms = Array.isArray(x.modes) ? x.modes : [], ls = Array.isArray(x.leads) ? x.leads : [];
          keep(modeS.s, ms.map(q => ({ value: q, text: modeName(q) })), ms[0] || '');
          keep(gndS.s, ls.map((q, i) => ({ value: String(i), text: tt(q.label) })), '0');
          lab.get(A.s).textContent = two ? tE('engine.act.bench.red') : tE('engine.act.bench.probe');
          A.row.hidden = x.kind === 'I' || whole(x.kind); Bk.row.hidden = !two; part.row.hidden = x.kind !== 'I';
          modeS.row.hidden = ms.length < 2; gndS.row.hidden = ls.length < 2;
        }
        inst.s.addEventListener('change', setInstrument);
        dxSel.s.addEventListener('change', () => {
          if (done) return;
          dx = dxSel.s.value === '' ? null : +dxSel.s.value;
          if (dx != null) out('event', { name: 'diagnose', data: { option: dx } });
          saveSoon();
        });
        const tval = (v, d) => { const g = typeof v === 'string' ? C(v) : null; return g ? ev(g, base()) : (v === undefined ? d : v); };
        function probeOf(x) {
          const tw = x.tEnd === undefined ? {} : { tEnd: tval(x.tEnd), ...(x.dt !== undefined ? { dt: tval(x.dt) } : {}), ...(x.tStart !== undefined ? { tStart: tval(x.tStart) } : {}) };
          const mode = Array.isArray(x.modes) && x.modes.length ? (x.modes.includes(modeS.s.value) ? modeS.s.value : x.modes[0]) : null;
          const md = mode ? { mode } : {}, zin = x.zin !== undefined ? { zin: x.zin } : {};
          if (x.kind === 'I') { const q = x.parts[+part.s.value] || x.parts[0]; return { probe: { kind: 'I', element: q.element, ...(q.pin !== undefined ? { pin: q.pin } : {}), ...md, ...tw }, ev: { i: 'I', part: +part.s.value, ...(mode ? { m: mode } : {}) } }; }
          if (whole(x.kind)) return { probe: { kind: x.kind }, ev: { i: x.kind } };
          const a = pt(A.s.value), b = Bk.s.value ? pt(Bk.s.value) : null;
          if (x.kind === 'R') return { probe: { kind: 'R', a: a.at, b: b ? b.at : 'gnd' }, ev: { i: 'R', a: a.id, b: b?.id } };
          if (x.kind === 'V') return { probe: { kind: 'V', a: a.at, b: b ? b.at : 'gnd', ...zin, ...md, ...tw }, ev: { i: 'V', a: a.id, b: b?.id, ...(mode ? { m: mode } : {}) } };
          if (x.kind === 'bode') return { probe: { kind: 'bode', node: a.at, ref: 'gnd', source: x.source, fStart: tval(x.fStart), fStop: tval(x.fStop), ...(x.fPoints ? { points: x.fPoints } : {}) }, ev: { i: 'bode', a: a.id } };
          if (x.kind === 'scope') {
            const ls = Array.isArray(x.leads) ? x.leads : [], gi = ls.length ? Math.min(ls.length - 1, +gndS.s.value || 0) : -1, l = gi >= 0 ? ls[gi] : null;
            return { probe: { kind: 'scope', node: a.at, ref: 'gnd', ...zin, ...(l ? { lead: l.lead, ...(l.cin !== undefined ? { cin: l.cin } : {}) } : {}), ...tw }, ev: { i: 'scope', a: a.id, ...(l ? { g: gi } : {}) } };
          }
          return { probe: { kind: 'logic', nodes: [a.at], ...zin, ...(x.threshold !== undefined ? { threshold: tval(x.threshold) } : {}), ...tw }, ev: { i: 'logic', a: a.id }, node: a.at };
        }
        function paintLeft() {
          left.textContent = budget ? tE('engine.act.bench.left', { left: Math.max(0, budget - count) }) : '';
          btn.disabled = done || (budget && count >= budget);
          for (const s of [inst.s, A.s, Bk.s, part.s, modeS.s, gndS.s, dxSel.s]) s.disabled = done;
          if (dxBtn) dxBtn.disabled = done;
        }
        const fm = (v, unit) => fmtNum(v, { format: 'si', unit, digits: 3 }, locale);
        const withMode = (txt, r) => (r.mode && r.mode !== 'dc' ? txt + ' ' + modeName(r.mode) : txt);
        function reading(r) {   // the reading in words and numbers (never the fault)
          if (!r || r.error) return tE('engine.act.bench.failed');
          if (r.kind === 'V') return withMode(fm(r.value, 'V'), r);
          if (r.kind === 'I') return withMode(fm(r.value, 'A'), r);
          if (r.kind === 'T') { const c = v => fmtNum(v, { format: 'fixed', digits: 1, unit: '°C' }, locale); return tE('engine.act.bench.tempStats', { now: c(r.value), min: c(r.min), max: c(r.max) }); }
          if (r.kind === 'clock') return tE('engine.act.bench.clockStats', { ppm: fmtNum(r.value, { format: 'fixed', digits: 1, unit: 'ppm' }, locale), err: fm(r.err, 's') });
          if (r.kind === 'bode') { const st = r.stats || {}, db = v => (isNum(v) ? fmtNum(v, { format: 'fixed', digits: 1, unit: 'dB' }, locale) : '—'), hz = v => (isNum(v) && v > 0 ? fm(v, 'Hz') : '—');
            return tE('engine.act.bench.bodeStats', { dc: db(st.dcDb), peak: db(st.peakDb), f3db: hz(st.f3db), unity: hz(st.fUnity) }); }
          if (r.kind === 'R') return r.value === 'OL' ? 'OL' : fm(r.value, 'Ω');   // i18n-ignore (the meter's own display)
          if (r.kind === 'rssi') return fmtNum(r.value, { format: 'fixed', digits: 1, unit: 'dBm' }, locale);
          if (r.kind === 'log') { const n = logCounts(r), c = n.collision || 0, sm = n['slot-miss'] || 0;
            return c || sm ? tE('engine.act.bench.logStats2', { resets: n.reset || 0, lost: n.lost || 0, overruns: n.overrun || 0, collisions: c, missed: sm }) : tE('engine.act.bench.logStats', { resets: n.reset, lost: n.lost, overruns: n.overrun }); }
          const u = r.unit === 'A' ? 'A' : 'V';   // a scope shows a voltage, or (twin@1) the supply current
          if (r.kind === 'scope') return tE('engine.act.bench.scopeStats', { pp: fm(r.stats.pp, u), mean: fm(r.stats.mean, u), freq: r.stats.freq > 0 ? fm(r.stats.freq, 'Hz') : '—' });
          const st = Object.values(r.traces || {})[0]?.stats || {};
          return tE('engine.act.bench.logicStats', { freq: st.freq > 0 ? fm(st.freq, 'Hz') : '—', duty: fmtNum(100 * (st.duty || 0), { format: 'fixed', digits: 0, unit: '%' }, locale) });
        }
        /** the event log of twin@1: how many resets, lost messages and overrun wakes */
        function logCounts(r) {
          if (r.counts && typeof r.counts === 'object') return r.counts;
          const n = { reset: 0, lost: 0, overrun: 0, dead: 0 };
          for (const e of Array.isArray(r.events) ? r.events : []) if (e && Object.prototype.hasOwnProperty.call(n, e.code)) n[e.code]++;
          return n;
        }
        /** a reading as it is kept in the saved state: the numbers the log shows, not the traces */
        function slim(r) {
          if (!r || typeof r !== 'object') return r;
          if (r.kind === 'scope') return { kind: 'scope', stats: r.stats, ...(r.unit ? { unit: r.unit } : {}) };
          if (r.kind === 'log') return { kind: 'log', counts: logCounts(r) };
          if (r.kind === 'logic') return { kind: 'logic', traces: Object.fromEntries(Object.entries(r.traces || {}).map(([k, v]) => [k, { stats: v.stats }])) };
          if (r.kind === 'bode') return { kind: 'bode', stats: r.stats };
          return r;
        }
        function where(e) {
          if (e.i === 'I') return tt(bn.instruments.find(x => x.kind === 'I')?.parts?.[e.part]?.label);
          const a = pt(e.a), b = e.b ? pt(e.b) : null, l = e.i === 'scope' && Number.isInteger(e.g) ? bn.instruments.find(x => x.kind === 'scope')?.leads?.[e.g] : null;
          return a ? tt(a.label) + (b ? ' → ' + tt(b.label) : '') + (l ? ' (' + tt(l.label) + ')' : '') : '';
        }
        function paintLog() {
          logEl.replaceChildren(...log.map(e => h('li', {}, h('span', { class: 'sim-log-i' }, instName(e.i)), ' ' + where(e) + ': ', h('b', {}, e.r === undefined ? '…' : reading(e.r)))));
          logEmpty.hidden = log.length > 0;
        }
        function showFace(e) {
          const r = e.r; faceEl.replaceChildren();
          if (!r || r.error || !(r.kind === 'scope' || r.kind === 'logic' || (r.kind === 'bode' && Array.isArray(r.f)))) { faceEl.append(h('div', { class: 'sim-meter' }, h('span', { class: 'sim-meter-i' }, instName(e.i)), h('output', { class: 'sim-meter-v' }, reading(r)))); return; }
          const fig = h('figure', { class: 'sim-plot sim-scope' }); faceEl.append(fig);
          let xl = tE('engine.act.bench.time') + ' (s)', p, data, yl;
          if (r.kind === 'bode') {   // the gain over frequency (log axis)
            xl = tE('engine.act.bench.frequency') + ' (Hz)'; yl = tE('engine.act.bench.gain') + ' (dB)';
            p = { x: { label: 'x', unit: 'Hz', format: 'si', scale: 'log' }, y: { label: 'y', unit: 'dB', digits: 1 } };
            data = { xs: r.f, lines: [{ ys: r.db }], marks: [], xr: [r.f[0], r.f[r.f.length - 1]], yr: [null, null] };
          } else if (r.kind === 'scope') {
            const cur = r.unit === 'A';
            yl = cur ? tE('engine.act.bench.current') + ' (A)' : tE('engine.act.bench.voltage') + ' (V)';
            p = { x: { label: 'x', unit: 's', format: 'si' }, y: { label: 'y', unit: cur ? 'A' : 'V', ...(cur ? { format: 'si' } : {}) } };
            data = { xs: r.t, lines: [{ ys: r.v }], marks: [], xr: [r.t[0], r.t[r.t.length - 1]], yr: [null, null] };
          } else {   // a logic trace: steps from the level at the start and the edges
            const tr = Object.values(r.traces)[0] || { level0: 0, edges: [] }, xs = [r.t0], ys = [tr.level0];
            for (const ed of tr.edges) { xs.push(ed.t, ed.t); ys.push(ys[ys.length - 1], ed.to); }
            xs.push(r.t1); ys.push(ys[ys.length - 1]);
            yl = tE('engine.act.bench.level');
            p = { x: { label: 'x', unit: 's', format: 'si' }, y: { label: 'y', digits: 1 } };
            data = { xs, lines: [{ ys }], marks: [], xr: [r.t0, r.t1], yr: [-0.15, 1.15] };
          }
          const aria = instName(e.i) + ', ' + where(e) + ': ' + reading(r);
          const holder = h('div', { class: 'sim-svg' }); fig.append(h('figcaption', {}, aria), holder);
          const draw = () => { if (holder.isConnected) holder.replaceChildren(drawPlot(holder, p, data, { locale, aria, xLabel: xl, yLabel: yl })); };
          requestAnimationFrame(draw); face = draw;
        }
        function measure() {
          if (done || (budget && count >= budget) || !runner) return;
          const x = cur(), m = probeOf(x), e = { ...m.ev };
          count++; log.push(e); paintLog(); paintLeft();
          out('event', { name: 'measure', data: { ...m.ev } });
          runner.measure(prep(base()), m.probe, r => {
            if (closed) return;
            e.r = r && typeof r === 'object' ? (r.kind === 'scope' || r.kind === 'logic' || r.kind === 'bode' ? r : r.kind === 'log' && !r.error ? { kind: 'log', counts: logCounts(r) }
              : r.error ? { kind: r.kind, error: r.error }
              : r.kind === 'T' ? { kind: 'T', value: r.value, min: r.min, max: r.max } : r.kind === 'clock' ? { kind: 'clock', value: r.value, err: r.err }
              : { kind: r.kind, value: r.value, error: r.error, ...(r.mode ? { mode: r.mode } : {}) }) : { error: 'none' };
            paintLog(); showFace(e); saveSoon();
          });
        }
        /** after the diagnosis: lock the bench and say what the fault was (the only time the page learns it) */
        function reveal() {
          if (done) return; done = true;
          const right = dx != null && opts[dx]?.fault === bn.faults[fault].id, truth = opts.find(o => o.fault === bn.faults[fault].id);
          dxOut.className = 'sim-dx-out ' + (right ? 'ok' : 'bad');
          dxOut.textContent = right ? tE('engine.act.bench.right', { fault: tt(opts[dx].label) }) : tE('engine.act.bench.wrong', { fault: truth ? tt(truth.label) : '—' });
          paintLeft();
        }
        function newDevice() {
          seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; pick();
          log.length = 0; count = 0; dx = null; done = false; dxSel.s.value = ''; dxOut.textContent = ''; dxOut.className = 'sim-dx-out'; faceEl.replaceChildren();
          runner?.close(); runner = newRunner(); out('event', { name: 'reset' });
          paintLog(); paintLeft(); recompute(); saveSoon();
        }
        if (savedB) {   // an explorer's bench comes back: the same device (seed), its log, the diagnosis
          for (const e of Array.isArray(savedB.log) ? savedB.log.slice(0, 200) : []) if (e && typeof e === 'object' && typeof e.i === 'string') log.push(e);
          count = log.length;
          if (Number.isInteger(savedB.dx) && savedB.dx >= 0 && savedB.dx < opts.length) { dx = savedB.dx; dxSel.s.value = String(dx); }
        }
        setInstrument(); paintLog(); paintLeft();
        if (savedB && savedB.done && dx != null) reveal();
        const ctl = h('div', { class: 'sim-bctl' }, inst.row, A.row, Bk.row, part.row, modeS.row, gndS.row, h('div', { class: 'sim-brow' }, btn, left));
        const el = h('section', { class: 'sim-bench' },
          h('div', { class: 'sim-binst' }, ctl, faceEl),
          h('h5', { class: 'sim-bh' }, tE('engine.act.bench.log')), logEmpty, logEl,
          h('div', { class: 'sim-dx' }, dxSel.row, h('div', { class: 'sim-brow' }, dxBtn, another), dxOut));
        return {
          el, reveal, redraw: () => face?.(),
          applied: () => JSON.parse(JSON.stringify(bn.faults[fault].apply || [])),
          /** the bench's values for the checks grader: never shown (the validators keep them out of readouts and marks) */
          values: () => ({ diagnosis: dx == null ? -1 : dx, measurements: count, correct: dx != null && opts[dx]?.fault === bn.faults[fault].id }),
          ready: () => dx != null,
          state: () => exMode ? undefined : { seed, log: log.map(e => ({ ...e, r: slim(e.r) })), dx, done },
        };
      }
      function cleanOutputs(o) {
        const r = {};
        for (const d of declared) {
          const v = o && typeof o === 'object' ? o[d.id] : undefined;
          if (d.kind === 'scalar') r[d.id] = isNum(v) || typeof v === 'boolean' ? v : NaN;
          else if (d.kind === 'scene') r[d.id] = v && typeof v === 'object' && Array.isArray(v.items) ? v : { view: [-1, 1, -1, 1], items: [] };
          else if (d.kind === 'sound') r[d.id] = v && typeof v === 'object' && Array.isArray(v.notes) ? v : { notes: [] };
          else { let a = Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v, x => +x) : []; if (a.length > MAX_POINTS) { const k = a.length / MAX_POINTS; a = Array.from({ length: MAX_POINTS }, (_, i) => a[Math.floor(i * k)]); } r[d.id] = a; }
        }
        return r;
      }
      function base() {
        const e = Object.assign({}, consts);
        for (const p of params) e[p.id] = vals[p.id];
        for (const d of derived) e[d.id] = ev(d.f, e);
        return e;
      }
      function recompute() {
        if (closed) return;
        if (paused) { dirty = true; return; }
        const e = base(), my = ++rev;   // values() is null until the latest inputs are computed (Check never grades older results)
        if (!runner) { env = e; doneRev = my; render(); return; }
        busyNote.textContent = tE('engine.act.sim.computing');
        runner.run(prep(e), o => {
          if (closed) return;
          if (PT) {   // {outputs, env, codes}: the derived values computed in the plan's order
            const r = o && typeof o === 'object' ? o : {}, codes = Array.isArray(r.codes) ? r.codes : [];
            for (const d of derived) if (r.env && d.id in r.env) e[d.id] = r.env[d.id];
            o = r.outputs;
            const msg = [codes.some(c => c.code === 'no-converge') ? tE('engine.act.sim.noConverge') : '', codes.some(c => c.code === 'part-failed') || !r.outputs ? tE('engine.act.sim.partFailed') : ''].filter(Boolean).join(' ');
            partsNote.textContent = msg; partsNote.hidden = !msg;
          }
          outputs = cleanOutputs(o); for (const d of declared) if (d.kind === 'scalar') e[d.id] = outputs[d.id]; env = e; if (my === rev) { doneRev = my; busyNote.textContent = ''; } render();
        });
      }
      function render() {
        readouts.forEach((r, i) => { roEls[i].textContent = fmtNum(ev(r.f, env), r, locale); });
        plots.forEach((P, i) => {
          if (P.p.kind === 'sound') return;
          if (P.p.kind === 'scene') { P.last = outputs[P.p.of]; P.holder.replaceChildren(drawScene(figs[i], P.p, P.last, { locale, aria: P.aria, tt })); return; }
          const p = P.p, data = { lines: [], marks: P.marks.map(m => ({ axis: m.axis, v: ev(m.f, env), label: m.label ? tt(m.label) : '' })), yr: [P.ymin ? ev(P.ymin, env) : null, P.ymax ? ev(P.ymax, env) : null] };
          if (p.kind === 'function') {
            const a = ev(P.xmin, env), b = ev(P.xmax, env), n = Math.min(MAX_POINTS, p.points || 200), lg = p.x.scale === 'log' && a > 0 && b > 0;
            data.xr = [a, b]; data.xs = Array.from({ length: n }, (_, k) => lg ? a * Math.pow(b / a, k / (n - 1)) : a + (b - a) * k / (n - 1));
            const e2 = Object.assign({}, env);
            data.lines = P.lines.map(l => ({ style: l.style, ys: data.xs.map(x => { e2[p.x.var] = x; const v = ev(l.f, e2); return typeof v === 'boolean' ? +v : v; }) }));
          } else {
            data.xs = outputs[p.x.series] || [];
            let lo = Infinity, hi = -Infinity; for (const v of data.xs) if (isNum(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
            data.xr = [P.xmin ? ev(P.xmin, env) : (isFinite(lo) ? lo : 0), P.xmax ? ev(P.xmax, env) : (isFinite(hi) ? hi : 1)];
            data.lines = P.lines.map(l => ({ style: l.style, ys: outputs[l.y] || [] }));
          }
          P.last = data;
          P.holder.replaceChildren(drawPlot(figs[i], p, data, { locale, aria: P.aria, xLabel: P.xLabel, yLabel: P.yLabel }));
        });
      }
      function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { const bs = B?.state(); out('state', { version: init.stateVersion || 1, data: { values: { ...vals }, ...(bs ? { bench: bs } : {}), ...(host?.stateExtra?.() || {}) } }); }, 250); }
      function changed(p, commit) {
        recompute(); saveSoon();
        if (commit) out('event', { name: 'param', data: { id: p.id, v: vals[p.id] } });
      }
      const ro2 = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!closed && !paused) { plots.forEach((P, i) => P.last && P.p.kind !== 'sound' && P.holder.replaceChildren(P.p.kind === 'scene' ? drawScene(figs[i], P.p, P.last, { locale, aria: P.aria, tt }) : drawPlot(figs[i], P.p, P.last, { locale, aria: P.aria, xLabel: P.xLabel, yLabel: P.yLabel }))); B?.redraw(); } }); }) : null;
      ro2?.observe(root);
      for (const p of params) paint(p);
      recompute();

      port.send = (type, payload, extra) => {
        if (closed) return;
        if (type === 'ping') return later(() => out('pong'));
        if (type === 'pause') { paused = true; return; }
        if (type === 'resume') { paused = false; if (dirty) { dirty = false; recompute(); } return; }
        if (type === 'destroy') return port.close();
      };
      port.close = () => { if (closed) return; closed = true; clearTimeout(saveT); cancelAnimationFrame(raf); ro2?.disconnect(); runner?.close(); root.remove(); };
      // what the checks grader reads: the values once the latest inputs are computed (and a bench's own, once a diagnosis is chosen: before that Check waits)
      port.values = () => closed || doneRev !== rev ? null : B ? (B.ready() ? { ...env, ...B.values() } : null) : { ...env };
      port.reveal = () => { if (!closed) B?.reveal(); };   // after Check: the bench says what the fault was
      port.saveSoon = saveSoon;
      later(() => out('ready', { protocols: [1] }));
      return port;
  }
  ACT.registerRuntime({ id: 'sim-spec@1', version: 1, autoHeight: true, mount: (box, ctx) => simView(box, ctx) });
  ACT.simView = simView;   // the same view for runtimes that compute the outputs themselves (py-module@1)
  ACT.partsRunner = partsRunner;   // several engines in one spec (§12.8): the sim view, and the mini-apps' noema.sim (34_activity_html.js)
  ACT.engineRunner = engineRunner;   // the same Worker runner for the engines a mini-app uses (html-app@1, 34_activity_html.js)
  /* i18n-ignore-end */
})();
