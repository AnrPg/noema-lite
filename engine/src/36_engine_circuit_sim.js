/* ===================== interactive activities — circuit-mna@1 as an engine of sim-spec@1 (docs/INTERACTIVE_CIRCUIT.md, docs/INTERACTIVE.md §12.6–12.7) =====================
   Registers NoemaCircuit (36_engine_circuit.js) with ACT.registerEngine. A spec names it ("engine": "circuit-mna@1") and gives
     model: { netlist (noema.circuit/v1), bindings: [{element, prop?, expr}], transient?: {tEnd, dt?}, noise?: {rel, abs} }
     outputs: [{id, kind: 'scalar', node | branch, at? | stat?} | {id, kind: 'scalar', probe: {kind: V | I | R, …}}
               | {id, kind: 'series', time: true | node | branch}]
   and, for a fault-finding bench, `bench` (35_activity_sim.js renders it; this engine answers its measurements).
   The engine runs in a Worker (workerSource: the engine's own source + the adapter below); the expressions (bindings, transient
   times, `at`) are the app's NoemaExpr on the main thread (prepare), so the worker gets numbers only. The hidden fault of a bench
   reaches the engine as opts.faults (the change to the circuit), never the page. */
(() => {
  /* i18n-ignore-start */   // code: numbers in, numbers out
  if (typeof ACT === 'undefined' || !window.NoemaCircuit) return;
  /** the adapter: create(spec, {seed, faults}) → { run(inputs) → outputs, measure(inputs, probe) → reading } — runs in the worker
      (as text, with the engine's source before it) and inline when a browser refuses the worker */
  function circuitSimEngine(root) {
    const C = root.NoemaCircuit, STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'], MAXP = 2000;
    const clone = o => JSON.parse(JSON.stringify(o));
    const thin = (a, n) => { if (a.length <= n) return Array.from(a); const k = (a.length - 1) / (n - 1), r = []; for (let i = 0; i < n; i++) r.push(a[Math.round(i * k)]); return r; };
    function at(t, v, x) {   // linear interpolation of a sampled series at time x
      if (!(x >= t[0])) return v[0]; if (x >= t[t.length - 1]) return v[v.length - 1];
      let lo = 0, hi = t.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
      return v[lo] + (v[hi] - v[lo]) * (x - t[lo]) / (t[hi] - t[lo] || 1);
    }
    function stat(v, s) {
      if (s === 'final') return v[v.length - 1];
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0; for (const y of v) { if (y < mn) mn = y; if (y > mx) mx = y; sum += y; sq += y * y; }
      return s === 'min' ? mn : s === 'max' ? mx : s === 'mean' ? sum / v.length : s === 'pp' ? mx - mn : Math.sqrt(sq / v.length);
    }
    function setProp(el, prop, v) {
      if (prop === 'on') el.on = typeof v === 'boolean' ? v : v !== 0 && v === v;
      else if (prop === 'value') el.value = v;
      else { const [w, f] = prop.split('.'); if (el.value && typeof el.value === 'object' && el.value[w]) el.value[w][f] = v; }
    }
    root.noemaEngine = { create(spec, opts) {
      const model = spec.model || {}, outs = spec.outputs || [], seed = (opts && opts.seed) >>> 0, faults = (opts && opts.faults) || [];
      let key = null, sim = null;
      function simFor(inp) {
        const k = JSON.stringify(inp.$bind || []);
        if (k !== key) {
          const nl = clone(model.netlist), byId = new Map(nl.elements.map(e => [e.id, e]));
          for (const [id, prop, v] of inp.$bind || []) { const el = byId.get(id); if (el) setProp(el, prop, v); }
          sim = C.create(nl, { faults, seed, noise: model.noise ? { rel: model.noise.rel || 0, abs: model.noise.abs || 0, seed } : undefined }); key = k;
        }
        return sim;
      }
      return {
        run(inp) {
          const s = simFor(inp), r = {}, tr = inp.$tran;
          let dc = null, tran = null;
          const DC = () => dc || (dc = s.dc());
          const TR = () => tran || (tran = s.transient({ tEnd: tr.tEnd, dt: tr.dt > 0 ? tr.dt : tr.tEnd / 1000 }));
          for (const o of outs) {
            try {
              if (o.kind === 'series') { const T = TR(); r[o.id] = thin(o.time ? T.t : o.node !== undefined ? T.nodes[o.node] || [] : T.branches[o.branch] || [], MAXP); continue; }
              if (o.probe) { const m = s.measure(o.probe); r[o.id] = typeof m.value === 'number' ? m.value : Infinity; continue; }   // (an ohmmeter over its range: ∞)
              const tw = o.at !== undefined || o.stat !== undefined;
              if (!tw) { const d = DC(); r[o.id] = o.node !== undefined ? d.nodes[o.node] : d.branches[o.branch]; continue; }
              const T = TR(), v = o.node !== undefined ? T.nodes[o.node] : T.branches[o.branch];
              r[o.id] = !v ? NaN : o.stat !== undefined ? (STATS.includes(o.stat) ? stat(v, o.stat) : NaN) : at(T.t, v, inp.$at ? inp.$at[o.id] : NaN);
            } catch (e) { r[o.id] = o.kind === 'series' ? [] : NaN; }
          }
          return r;
        },
        /** one reading of an instrument (docs/INTERACTIVE_CIRCUIT.md: V, I, R, scope, logic); traces thinned to 2000 points */
        measure(inp, probe) {
          try {
            const m = simFor(inp).measure(probe);
            if (m.kind === 'scope') return { kind: 'scope', t: thin(m.t, MAXP), v: thin(m.v, MAXP), stats: m.stats };
            if (m.kind === 'logic') {   // over MAXP edges: the window ends just before the first edge left out (cut), so the steps drawn stay true; the stats are the whole capture's
              let t1 = m.t[m.t.length - 1], cut = false;
              for (const nm of Object.keys(m.edges)) if (m.edges[nm].length > MAXP && m.edges[nm][MAXP].t < t1) { t1 = m.edges[nm][MAXP].t; cut = true; }
              const out = {}; for (const nm of Object.keys(m.traces)) out[nm] = { level0: m.traces[nm][0], edges: m.edges[nm].filter(z => z.t < t1).slice(0, MAXP), stats: m.stats[nm] };
              return { kind: 'logic', t0: m.t[0], t1, ...(cut ? { cut: true, tEnd: m.t[m.t.length - 1] } : {}), traces: out };
            }
            return { kind: m.kind, value: m.value };
          } catch (e) { return { kind: probe && probe.kind, error: String(e && e.code || 'error') }; }
        },
      };
    } };
  }
  const local = { NoemaCircuit: window.NoemaCircuit }; circuitSimEngine(local);
  ACT.registerEngine({
    id: 'circuit-mna@1', bench: true,
    /** after the common checks (NoemaPackCheck.checkSimSpec checks the model, the outputs and the bench): the engine's own netlist check */
    check: spec => NoemaCircuit.check(spec?.model?.netlist).filter(p => p.level === 'error').map(p => `netlist ${p.path}: ${p.msg}`),
    /** on the main thread: the expressions become numbers (bindings, transient times, `at`), so the worker needs no evaluator */
    prepare(spec, compile) {
      const m = spec.model || {}, f = v => typeof v === 'string' ? compile(v) : () => v;
      const binds = (m.bindings || []).map(b => [b.element, b.prop || 'value', compile(b.expr)]);
      const tEnd = m.transient ? f(m.transient.tEnd) : null, dt = m.transient && m.transient.dt !== undefined ? f(m.transient.dt) : null;
      const ats = (spec.outputs || []).filter(o => o.at !== undefined).map(o => [o.id, f(o.at)]);
      const ev = (g, env) => { try { const v = g(env); return typeof v === 'boolean' ? v : +v; } catch (e) { return NaN; } };
      return env => ({ ...env, $bind: binds.map(([id, prop, g]) => [id, prop, ev(g, env)]), $tran: tEnd ? { tEnd: ev(tEnd, env), dt: dt ? ev(dt, env) : 0 } : null, $at: Object.fromEntries(ats.map(([id, g]) => [id, ev(g, env)])) });
    },
    create: (spec, opts) => local.noemaEngine.create(spec, opts),
    workerSource: NoemaCircuit.source() + '\n;(' + circuitSimEngine.toString() + ')(self);',
  });
  /* i18n-ignore-end */
})();
