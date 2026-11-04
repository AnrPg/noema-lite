/* ===================== interactive activities — runtime sim-spec@1 (Tier B: a declarative simulation, docs/INTERACTIVE.md §12) =====================
   The pack carries only DATA (item.spec): controls, formulas in the expression language (NoemaExpr, 35_simexpr.js), readouts and
   plots. No code of the pack runs, so there is no frame: the app's own trusted code renders the controls and the plots with its own
   DOM and styles (theme tokens, dark mode, keyboard, labels, 320 px) — docs/adr/001 "as built". The spec is checked with the same
   rules as the validators (NoemaPackCheck.checkSimSpec) before anything is shown; a spec that fails shows the activity's fallback.
   Engines (ACT.registerEngine): formula@1 is built in (the derived values are the model). Another engine computes outputs from the
   inputs (scalars and time series): { id, check?(spec) → problems, create(spec, {seed, task}) → { run(inputs) → outputs },
   workerSource? }. An engine with workerSource runs in a Worker (runs that can take longer than ~50 ms: P3's circuit engine);
   one without runs inline. Every evaluation is NoemaExpr's: no loops, ≤ 2000 nodes per expression, ≤ 2000 points per plot.
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
      measure(inputs, probe, done): one reading of a bench's instrument (queued, never dropped). One job at a time, each ≤ 5 s. */
  function engineRunner(E, spec, opts, onFail) {
    let worker = null, url = null, inst = null, busy = null, timer = null, dead = false;
    const queue = [];
    if (E.workerSource && typeof Worker === 'function') {
      try {
        const bridge = "self.onmessage=function(e){var m=e.data;try{if(m.t==='create'){self.__i=self.noemaEngine.create(m.spec,m.opts);return;}var i=self.__i,r=m.t==='measure'?i.measure(m.inputs,m.probe):(i.run||i.step).call(i,m.inputs);postMessage({t:'out',id:m.id,out:r});}catch(x){postMessage({t:'err',id:m.id,msg:String(x&&x.message||x)});}};";
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
      if (!worker) {
        const t0 = performance.now(); let out = null;
        try { out = job.t === 'measure' ? inst.measure(job.inputs, job.probe) : (inst.run || inst.step).call(inst, job.inputs); } catch (e) { console.warn('[noema] sim-spec engine', E.id, e); }
        const ms = performance.now() - t0; if (ms > 50) console.warn(`[noema] sim-spec: engine ${E.id} took ${Math.round(ms)} ms inline; give it a workerSource`);
        job.done(out); return pump();
      }
      busy = { id: ++seq, done: job.done };
      timer = setTimeout(() => { if (!busy) return; dead = true; close(); onFail('runaway'); }, RUN_TIMEOUT);
      worker.postMessage({ t: job.t, id: busy.id, inputs: job.inputs, probe: job.probe });
    }
    function run(inputs, done) {
      if (dead) return;
      const i = queue.findIndex(j => j.t === 'run');   // the latest inputs win
      if (i >= 0) queue[i] = { t: 'run', inputs, done }; else queue.push({ t: 'run', inputs, done });
      pump();
    }
    function measure(inputs, probe, done) { if (dead) return; queue.push({ t: 'measure', inputs, probe, done }); pump(); }
    function close() { dead = true; clearTimeout(timer); queue.length = 0; try { worker?.terminate(); } catch (e) { } if (url) URL.revokeObjectURL(url); worker = null; }
    return { run, measure, close, inWorker: () => !!worker };
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
      let d = '', pen = false;
      for (let i = 0; i < data.xs.length; i++) {
        const x = data.xs[i], y = l.ys[i];
        if (!isNum(x) || !isNum(y) || (xlog && x <= 0) || (ylog && y <= 0)) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + clampY(Y(y)).toFixed(1); pen = true;
      }
      g.append(svg('path', { d: d || 'M0 0', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': DASH[j % DASH.length] || null, style: `stroke:${COLORS[j % COLORS.length]}`, class: 'sim-line' }));
    });
    for (const m of data.marks) {
      if (!isNum(m.v)) continue;
      if (m.axis === 'x') { if ((xlog && m.v <= 0) || m.v < x0 || m.v > x1) continue; const px = X(m.v); g.append(svg('line', { x1: px, x2: px, y1: mt, y2: H - mb, class: 'sim-mark' })); if (m.label) g.append(txt(px + 4, mt + 12, m.label, 'start', 'sim-markl')); }
      else { if ((ylog && m.v <= 0) || m.v < y0 || m.v > y1) continue; const py = Y(m.v); g.append(svg('line', { x1: ml, x2: W - mr, y1: py, y2: py, class: 'sim-mark' })); if (m.label) g.append(txt(W - mr - 4, py - 4, m.label, 'end', 'sim-markl')); }
    }
    s.append(g);
    return s;
  }

  ACT.registerRuntime({
    id: 'sim-spec@1', version: 1, autoHeight: true,
    /** → port { send(type, payload), close(), values() } */
    mount(box, { act, init, onMessage, onFail }) {
      const later = f => Promise.resolve().then(f);   // never call back before the core holds the port
      const out = (type, payload) => { if (!closed) onMessage(ACTP.out(type, payload)); };
      let closed = false;
      const port = { send() { }, close() { closed = true; }, values: () => null };
      const spec = act.spec, tables = act.strings && typeof act.strings === 'object' ? act.strings : null;
      const engId = spec && typeof spec === 'object' && 'engine' in spec ? spec.engine : 'formula@1';
      const E = typeof engId === 'string' ? ACT.engine(engId) : null;
      if (!E) { console.warn('[noema] sim-spec', act.id, 'unknown engine', engId); later(() => onFail('unsupported')); return port; }
      if (spec.bench && !E.bench) { console.warn('[noema] sim-spec', act.id, 'engine', engId, 'takes no measurements'); later(() => onFail('unsupported')); return port; }
      const probs = window.NoemaPackCheck?.checkSimSpec ? NoemaPackCheck.checkSimSpec(spec, tables, ACT.engines()) : ['the spec checker is not loaded'];
      if (!probs.length && E.check) try { probs.push(...(E.check(spec) || [])); } catch (e) { probs.push(String(e.message || e)); }
      if (probs.length) { console.warn('[noema] sim-spec', act.id, probs.slice(0, 5).join(' | ')); later(() => onFail('spec')); return port; }

      const T = init.strings || {}, locale = init.locale || 'en';
      const tt = k => (k && Object.prototype.hasOwnProperty.call(T, k)) ? T[k] : '';
      const C = NoemaExpr.compile;
      const consts = Object.assign({}, spec.consts || {});
      for (const [k, v] of Object.entries(init.task || {})) if (Object.prototype.hasOwnProperty.call(consts, k) && isNum(v)) consts[k] = v;
      const params = spec.params, derived = (spec.derived || []).map(d => ({ id: d.id, f: C(d.expr) }));
      const readouts = (spec.readouts || []).map(r => ({ ...r, f: C(r.expr) }));
      const lim = v => typeof v === 'string' ? C(v) : (() => v);
      const plots = (spec.plots || []).map(p => ({ p, xmin: p.x.min != null ? lim(p.x.min) : null, xmax: p.x.max != null ? lim(p.x.max) : null, ymin: p.y?.min != null ? lim(p.y.min) : null, ymax: p.y?.max != null ? lim(p.y.max) : null,
        lines: p.series.map(s => ({ ...s, f: p.kind === 'function' ? C(s.expr) : null })), marks: (p.marks || []).map(m => ({ ...m, f: C(m.expr) })) }));
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
        const p = P.p, fig = h('figure', { class: 'sim-plot' });
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
      root.append(h('div', { class: 'sim-foot' }, busyNote, reset));
      box.append(root);

      /* ---------- computing ---------- */
      let env = {}, outputs = {}, paused = false, dirty = false, saveT = null, raf = 0, rev = 0, doneRev = 0;
      const prep = typeof E.prepare === 'function' ? E.prepare(spec, C) : (x => x);   // the engine's expressions → numbers, on this thread
      const newRunner = () => E.id === 'formula@1' ? null : engineRunner(E, spec, { seed: init.seed >>> 0, task: { ...consts }, faults: B ? B.applied() : undefined }, why => onFail(why));
      let runner = newRunner();
      const declared = spec.outputs || [];

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
        const btn = h('button', { class: 'btn primary small', type: 'button', 'data-bench': 'measure', onclick: () => measure() }, tE('engine.act.bench.measure'));
        const left = h('span', { class: 'sim-left', 'aria-live': 'polite' });
        const faceEl = h('div', { class: 'sim-face', 'aria-live': 'polite' });
        const logEl = h('ol', { class: 'sim-log' }), logEmpty = h('p', { class: 'sim-log-empty' }, tE('engine.act.bench.logEmpty'));
        const dxSel = sel('diagnosis', bn.diagnosis.label ? tt(bn.diagnosis.label) : tE('engine.act.bench.diagnosis'), [{ value: '', text: tE('engine.act.bench.choose') }, ...opts.map((o, i) => ({ value: String(i), text: tt(o.label) }))]);
        const dxBtn = exMode ? null : h('button', { class: 'btn small', type: 'button', 'data-bench': 'commit', onclick: () => { if (dx != null && !done) { reveal(); saveSoon(); } } }, tE('engine.act.bench.commit'));
        const dxOut = h('p', { class: 'sim-dx-out', 'aria-live': 'polite' });
        const another = exMode ? null : h('button', { class: 'btn ghost small', type: 'button', 'data-bench': 'another', onclick: () => newDevice() }, '↻ ' + tE('engine.act.bench.another'));
        const cur = () => bn.instruments.find(x => x.kind === inst.s.value) || bn.instruments[0];
        const whole = k => k === 'log' || k === 'rssi';   // twin@1: the event log and the radio's RSSI read the device, not a point
        function setInstrument() {
          const x = cur(), two = x.kind === 'V' || x.kind === 'R', ids = x.points || bn.points.map(p => p.id);
          const keep = (s, items, fallback) => { const v = s.value; s.replaceChildren(...items.map(o => h('option', { value: o.value }, o.text))); s.value = items.some(o => o.value === v) ? v : fallback; };
          if (x.kind === 'I') keep(part.s, (x.parts || []).map((q, i) => ({ value: String(i), text: tt(q.label) })), '0');
          else if (!whole(x.kind)) {
            const g = ids.find(id => /^(gnd|0)$/.test(String(pt(id).at))) || ids[ids.length - 1];
            keep(A.s, ptItems(ids), ids.find(id => id !== g) || ids[0]);
            if (two) keep(Bk.s, ptItems(ids), g);
          }
          lab.get(A.s).textContent = two ? tE('engine.act.bench.red') : tE('engine.act.bench.probe');
          A.row.hidden = x.kind === 'I' || whole(x.kind); Bk.row.hidden = !two; part.row.hidden = x.kind !== 'I';
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
          if (x.kind === 'I') { const q = x.parts[+part.s.value] || x.parts[0]; return { probe: { kind: 'I', element: q.element, ...(q.pin !== undefined ? { pin: q.pin } : {}) }, ev: { i: 'I', part: +part.s.value } }; }
          if (whole(x.kind)) return { probe: { kind: x.kind }, ev: { i: x.kind } };
          const a = pt(A.s.value), b = Bk.s.value ? pt(Bk.s.value) : null;
          if (x.kind === 'V' || x.kind === 'R') return { probe: { kind: x.kind, a: a.at, b: b ? b.at : 'gnd' }, ev: { i: x.kind, a: a.id, b: b?.id } };
          const tw = { tEnd: tval(x.tEnd), ...(x.dt !== undefined ? { dt: tval(x.dt) } : {}), ...(x.tStart !== undefined ? { tStart: tval(x.tStart) } : {}) };
          if (x.kind === 'scope') return { probe: { kind: 'scope', node: a.at, ref: 'gnd', ...tw }, ev: { i: 'scope', a: a.id } };
          return { probe: { kind: 'logic', nodes: [a.at], ...(x.threshold !== undefined ? { threshold: tval(x.threshold) } : {}), ...tw }, ev: { i: 'logic', a: a.id }, node: a.at };
        }
        function paintLeft() {
          left.textContent = budget ? tE('engine.act.bench.left', { left: Math.max(0, budget - count) }) : '';
          btn.disabled = done || (budget && count >= budget);
          for (const s of [inst.s, A.s, Bk.s, part.s, dxSel.s]) s.disabled = done;
          if (dxBtn) dxBtn.disabled = done;
        }
        const fm = (v, unit) => fmtNum(v, { format: 'si', unit, digits: 3 }, locale);
        function reading(r) {   // the reading in words and numbers (never the fault)
          if (!r || r.error) return tE('engine.act.bench.failed');
          if (r.kind === 'V') return fm(r.value, 'V');
          if (r.kind === 'I') return fm(r.value, 'A');
          if (r.kind === 'R') return r.value === 'OL' ? 'OL' : fm(r.value, 'Ω');   // i18n-ignore (the meter's own display)
          if (r.kind === 'rssi') return fmtNum(r.value, { format: 'fixed', digits: 1, unit: 'dBm' }, locale);
          if (r.kind === 'log') { const n = logCounts(r); return tE('engine.act.bench.logStats', { resets: n.reset, lost: n.lost, overruns: n.overrun }); }
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
          return r;
        }
        function where(e) {
          if (e.i === 'I') return tt(bn.instruments.find(x => x.kind === 'I')?.parts?.[e.part]?.label);
          const a = pt(e.a), b = e.b ? pt(e.b) : null;
          return a ? tt(a.label) + (b ? ' → ' + tt(b.label) : '') : '';
        }
        function paintLog() {
          logEl.replaceChildren(...log.map(e => h('li', {}, h('span', { class: 'sim-log-i' }, instName(e.i)), ' ' + where(e) + ': ', h('b', {}, e.r === undefined ? '…' : reading(e.r)))));
          logEmpty.hidden = log.length > 0;
        }
        function showFace(e) {
          const r = e.r; faceEl.replaceChildren();
          if (!r || r.error || r.kind === 'V' || r.kind === 'I' || r.kind === 'R' || r.kind === 'rssi' || r.kind === 'log') { faceEl.append(h('div', { class: 'sim-meter' }, h('span', { class: 'sim-meter-i' }, instName(e.i)), h('output', { class: 'sim-meter-v' }, reading(r)))); return; }
          const fig = h('figure', { class: 'sim-plot sim-scope' }); faceEl.append(fig);
          const xl = tE('engine.act.bench.time') + ' (s)';
          let p, data, yl;
          if (r.kind === 'scope') {
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
            e.r = r && typeof r === 'object' ? (r.kind === 'scope' || r.kind === 'logic' ? r : r.kind === 'log' && !r.error ? { kind: 'log', counts: logCounts(r) } : { kind: r.kind, value: r.value, error: r.error }) : { error: 'none' };
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
        const ctl = h('div', { class: 'sim-bctl' }, inst.row, A.row, Bk.row, part.row, h('div', { class: 'sim-brow' }, btn, left));
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
        runner.run(prep(e), o => { if (closed) return; outputs = cleanOutputs(o); for (const d of declared) if (d.kind === 'scalar') e[d.id] = outputs[d.id]; env = e; if (my === rev) { doneRev = my; busyNote.textContent = ''; } render(); });
      }
      function render() {
        readouts.forEach((r, i) => { roEls[i].textContent = fmtNum(ev(r.f, env), r, locale); });
        plots.forEach((P, i) => {
          const p = P.p, data = { lines: [], marks: P.marks.map(m => ({ axis: m.axis, v: ev(m.f, env), label: m.label ? tt(m.label) : '' })), yr: [P.ymin ? ev(P.ymin, env) : null, P.ymax ? ev(P.ymax, env) : null] };
          if (p.kind === 'function') {
            const a = ev(P.xmin, env), b = ev(P.xmax, env), n = Math.min(MAX_POINTS, p.points || 200), lg = p.x.scale === 'log' && a > 0 && b > 0;
            data.xr = [a, b]; data.xs = Array.from({ length: n }, (_, k) => lg ? a * Math.pow(b / a, k / (n - 1)) : a + (b - a) * k / (n - 1));
            const e2 = Object.assign({}, env);
            data.lines = P.lines.map(l => ({ ys: data.xs.map(x => { e2[p.x.var] = x; const v = ev(l.f, e2); return typeof v === 'boolean' ? +v : v; }) }));
          } else {
            data.xs = outputs[p.x.series] || [];
            let lo = Infinity, hi = -Infinity; for (const v of data.xs) if (isNum(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
            data.xr = [P.xmin ? ev(P.xmin, env) : (isFinite(lo) ? lo : 0), P.xmax ? ev(P.xmax, env) : (isFinite(hi) ? hi : 1)];
            data.lines = P.lines.map(l => ({ ys: outputs[l.y] || [] }));
          }
          P.last = data;
          P.holder.replaceChildren(drawPlot(figs[i], p, data, { locale, aria: P.aria, xLabel: P.xLabel, yLabel: P.yLabel }));
        });
      }
      function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { const bs = B?.state(); out('state', { version: init.stateVersion || 1, data: { values: { ...vals }, ...(bs ? { bench: bs } : {}) } }); }, 250); }
      function changed(p, commit) {
        recompute(); saveSoon();
        if (commit) out('event', { name: 'param', data: { id: p.id, v: vals[p.id] } });
      }
      const ro2 = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!closed && !paused) { plots.forEach((P, i) => P.last && P.holder.replaceChildren(drawPlot(figs[i], P.p, P.last, { locale, aria: P.aria, xLabel: P.xLabel, yLabel: P.yLabel }))); B?.redraw(); } }); }) : null;
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
      later(() => out('ready', { protocols: [1] }));
      return port;
    },
  });
  /* i18n-ignore-end */
})();
