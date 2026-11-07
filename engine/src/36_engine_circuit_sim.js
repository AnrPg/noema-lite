/* ===================== interactive activities — circuit-mna@1 as an engine of sim-spec@1 (docs/INTERACTIVE_CIRCUIT.md, docs/INTERACTIVE.md §12.6–12.7) =====================
   Registers NoemaCircuit (36_engine_circuit.js) with ACT.registerEngine. A spec names it ("engine": "circuit-mna@1") and gives
     model: { netlist (noema.circuit/v1), bindings: [{element, prop?, expr}], transient?: {tEnd, dt?}, noise?: {rel, abs},
              ac?: {source, fStart, fStop, points?} }
     outputs: [{id, kind: 'scalar', node | branch | power, at? | stat?} | {id, kind: 'scalar', probe: {kind: V | I | R, mode?, zin?, …}}
               | {id, kind: 'series', time: true | node | branch | power} | {id, kind: 'series', ac: 'f' | 'db' | 'phase' | 'mag', node?, ref?}
               | {id, kind: 'scalar', ac: 'db' | 'phase' | 'mag', node, ref?, at: frequency} | {id, kind: 'scalar', ac: 'dcDb' | 'peakDb' | 'fPeak' | 'f3db' | 'fLow3db' | 'fUnity' | 'pm', node, ref?}]
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
      let key = null, sim = null, ST = null;
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
          let dc = null, tran = null, acr = null;
          const pw = outs.filter(o => o.power !== undefined).map(o => o.power);
          const DC = () => dc || (dc = s.dc());
          const TR = () => tran || (tran = s.transient({ tEnd: tr.tEnd, dt: tr.dt > 0 ? tr.dt : tr.tEnd / 1000, ...(pw.length ? { power: pw } : {}) }));
          const AC = () => acr || (acr = s.ac(inp.$ac));
          for (const o of outs) {
            try {
              if (o.ac !== undefined) {   // the AC analysis: a Bode plot's axes, or one number of it
                const A = AC();
                if (o.ac === 'f') { r[o.id] = A.f.slice(); continue; }
                const gz = nm => nm === 'gnd' || nm === '0', a = gz(o.node) ? { re: A.f.map(() => 0), im: A.f.map(() => 0) } : A.nodes[o.node], b = o.ref !== undefined && !gz(o.ref) ? A.nodes[o.ref] : null;   // either ground name reads 0
                const st = C.acStats(A.f, a.re.map((v, i) => v - (b ? b.re[i] : 0)), a.im.map((v, i) => v - (b ? b.im[i] : 0)));
                const curve = o.ac === 'db' ? st.db : o.ac === 'phase' ? st.phase : o.ac === 'mag' ? st.db.map(d => Math.pow(10, d / 20)) : null;
                if (o.kind === 'series') { r[o.id] = curve ? curve.slice() : []; continue; }
                if (curve) { const fx = inp.$at ? inp.$at[o.id] : NaN; r[o.id] = fx > 0 ? at(A.f.map(Math.log), curve, Math.log(fx)) : NaN; continue; }
                r[o.id] = st[o.ac] !== undefined ? st[o.ac] : NaN; continue;
              }
              if (o.kind === 'series') { const T = TR(); r[o.id] = thin(o.time ? T.t : o.power !== undefined ? T.power[o.power] || [] : o.node !== undefined ? T.nodes[o.node] || [] : T.branches[o.branch] || [], MAXP); continue; }
              if (o.probe) { const m = s.measure(o.probe); r[o.id] = typeof m.value === 'number' ? m.value : Infinity; continue; }   // (an ohmmeter over its range: ∞)
              const tw = o.at !== undefined || o.stat !== undefined;
              if (!tw) { const d = DC(); r[o.id] = o.node !== undefined ? d.nodes[o.node] : d.branches[o.branch]; continue; }
              const T = TR(), v = o.power !== undefined ? T.power[o.power] : o.node !== undefined ? T.nodes[o.node] : T.branches[o.branch];
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
            if (m.kind === 'bode') return m;
            if (m.kind === 'logic') {   // over MAXP edges: the window ends just before the first edge left out (cut), so the steps drawn stay true; the stats are the whole capture's
              let t1 = m.t[m.t.length - 1], cut = false;
              for (const nm of Object.keys(m.edges)) if (m.edges[nm].length > MAXP && m.edges[nm][MAXP].t < t1) { t1 = m.edges[nm][MAXP].t; cut = true; }
              const out = {}; for (const nm of Object.keys(m.traces)) out[nm] = { level0: m.traces[nm][0], edges: m.edges[nm].filter(z => z.t < t1).slice(0, MAXP), stats: m.stats[nm] };
              return { kind: 'logic', t0: m.t[0], t1, ...(cut ? { cut: true, tEnd: m.t[m.t.length - 1] } : {}), traces: out };
            }
            return { kind: m.kind, value: m.value, ...(m.mode ? { mode: m.mode } : {}) };
          } catch (e) { return { kind: probe && probe.kind, error: String(e && e.code || 'error') }; }
        },
        // the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the transient held open, its grid model.transient.dt (else tEnd/1000, else a
        // tenth of the first macro step); outputs at each step: node / branch / power their value now (a series: one sample a step),
        // time the time, stat over every internal step so far, at once passed; DC outputs as in run(). Cannot snapshot (the companion state).
        stepInit(inp) {
          try {
            const tr = inp.$tran || {}; ST = { dt: tr.dt > 0 ? tr.dt : tr.tEnd > 0 ? tr.tEnd / 1000 : 0, s: simFor(inp), cur: null };
            if (ST.dt > 0) ST.cur = ST.s.tranStep({ dt: ST.dt, power: outs.filter(o => o.power !== undefined).map(o => o.power) }, 0);
            return { out: ST.cur ? stepOuts(inp) : {} };
          } catch (e) { ST = null; return { fail: 'part-failed', out: {} }; }
        },
        stepTo(inp, t, dt) {
          if (!ST) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
          try {
            if (!ST.cur) { ST.dt = dt / 10; ST.cur = ST.s.tranStep({ dt: ST.dt, power: outs.filter(o => o.power !== undefined).map(o => o.power) }, 0); }
            ST.cur = ST.s.tranStep(null, t + dt);
            return { out: stepOuts(inp), dt, events: [] };
          } catch (e) { ST = null; return { fail: String(e && e.code === 'budget' ? 'budget' : 'part-failed'), out: {}, dt: 0, events: [] }; }
        },
        snapshot() { return -1; },
        restore() { return false; },
      };
      function stepOuts(inp) {
        const c = ST.cur, r = {};
        const val = (q, o) => (o.power !== undefined ? q.power[o.power] : o.node !== undefined ? q.nodes[o.node] : q.branches[o.branch]);
        for (const o of outs) {
          try {
            if (o.ac !== undefined || o.probe) { r[o.id] = NaN; continue; }
            if (o.kind === 'series') { r[o.id] = o.time ? c.t : val(c, o); continue; }
            if (o.at === undefined && o.stat === undefined) { const d = ST.dc || (ST.dc = ST.s.dc()); r[o.id] = o.node !== undefined ? d.nodes[o.node] : d.branches[o.branch]; continue; }
            const H = c.hist(o.power !== undefined ? 'power' : o.node !== undefined ? 'node' : 'branch', o.power !== undefined ? o.power : o.node !== undefined ? o.node : o.branch);
            if (!H) { r[o.id] = NaN; continue; }
            if (o.stat !== undefined) { r[o.id] = STATS.includes(o.stat) ? stat(H, o.stat) : NaN; continue; }
            const ta = inp.$at ? inp.$at[o.id] : NaN;
            r[o.id] = ta >= 0 && ta <= c.t ? at(H.map((_, k) => k * c.dt), H, ta) : NaN;
          } catch (e) { r[o.id] = NaN; }
        }
        return r;
      }
    } };
  }
  const local = { NoemaCircuit: window.NoemaCircuit }; circuitSimEngine(local);
  ACT.registerEngine({
    id: 'circuit-mna@1', bench: true, stepper: true,   // stepper: the transient as a part of a co-simulation (stepInit / stepTo)
    /** after the common checks (NoemaPackCheck.checkSimSpec checks the model, the outputs and the bench): the engine's own netlist check */
    check: spec => NoemaCircuit.check(spec?.model?.netlist).filter(p => p.level === 'error').map(p => `netlist ${p.path}: ${p.msg}`),
    /** on the main thread: the expressions become numbers (bindings, transient times, `at`), so the worker needs no evaluator */
    prepare(spec, compile) {
      const m = spec.model || {}, f = v => typeof v === 'string' ? compile(v) : () => v;
      const binds = (m.bindings || []).map(b => [b.element, b.prop || 'value', compile(b.expr)]);
      const tEnd = m.transient ? f(m.transient.tEnd) : null, dt = m.transient && m.transient.dt !== undefined ? f(m.transient.dt) : null;
      const ats = (spec.outputs || []).filter(o => o.at !== undefined).map(o => [o.id, f(o.at)]);
      const acm = m.ac || null, acf = acm ? { fStart: f(acm.fStart), fStop: f(acm.fStop) } : null;
      const ev = (g, env) => { try { const v = g(env); return typeof v === 'boolean' ? v : +v; } catch (e) { return NaN; } };
      return env => ({ ...env, $bind: binds.map(([id, prop, g]) => [id, prop, ev(g, env)]), $tran: tEnd ? { tEnd: ev(tEnd, env), dt: dt ? ev(dt, env) : 0 } : null, $at: Object.fromEntries(ats.map(([id, g]) => [id, ev(g, env)])),
        $ac: acm ? { source: acm.source, fStart: ev(acf.fStart, env), fStop: ev(acf.fStop, env), ...(acm.points !== undefined ? { points: acm.points } : {}) } : null });
    },
    create: (spec, opts) => local.noemaEngine.create(spec, opts),
    /** the Worker: NoemaExpr and the simulation kernel (the meters' streams) when loaded, the engine, then this adapter */
    get workerSource() { const K = NoemaCircuit.kit(), NX = window.NoemaExpr; return (K && NX && typeof NX.source === 'function' ? NX.source() + '\n;' : '') + (K ? K.source() + '\n;' : '') + NoemaCircuit.source() + '\n;(' + circuitSimEngine.toString() + ')(self);'; },
  });
  /* i18n-ignore-end */
})();
