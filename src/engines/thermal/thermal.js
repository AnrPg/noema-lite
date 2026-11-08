/* ===================== interactive activities — the thermal engine thermal@1 (docs/INTERACTIVE_ENGINES.md §2, docs/adr/001 D12) =====================
   Lumped thermal networks for tier B (sim-spec@1): nodes with a heat capacity, thermal resistances / conductances, convection h·A,
   radiation ε·σ·A·(T⁴ − T∞⁴), heat sources (constant, step, PWM, sine), fixed-temperature boundaries, the ambient, and on/off
   thermostats with hysteresis. Steady state (Newton when radiation is present), transients (trapezoidal, backward Euler on the
   first step, on source edges and on thermostat switching; or backward Euler throughout), linearised time constants.
   Pure JS, deterministic, no DOM, no text for the learner: codes and numbers only, the activity host words them.
   Format noema.thermal/v1: src/contracts/schemas/noema.thermal.v1.schema.json. Python twin of check / checkSpec: tools/thermal.py.
   A plugin of the engine library (one line of src/engines/plugins.ts). Also used by tests/thermal.js (node). */
import NoemaSimKit from '../kernel/simkit.ts';
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this engine
  const ID = 'thermal@1', FORMAT = 'noema.thermal/v1';
  const MAX_NODES = 50, MAX_LINKS = 200, MAX_SOURCES = 24, MAX_THERMOSTATS = 8, MAX_STEPS = 200000, MAX_POINTS = 20001, MAX_BINDINGS = 24;
  const SIGMA = 5.670374419e-8, K0 = 273.15, AMBIENT = 25;
  const STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'];
  const ID_RE = /^[A-Za-z][A-Za-z0-9_\-]{0,31}$/;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  /** the simulation kernel (NoemaSimKit, src/engines/kernel/simkit.js): a transient and the stepper run on its θ-method DAE solver
      (daeThetaInit: Newton with LU, or one factored solve for a linear network; the massless nodes algebraic rows; θ and the sources'
      mean power chosen per step); FALLBACK without the kernel (marked): the same θ-step here (stepCore) */
  function kit() {
    return NoemaSimKit;
  }
  function fail(code, extra) { const e = new Error('thermal: ' + code); e.code = code; if (extra) Object.assign(e, extra); return e; }
  function okNum(kind, v) {
    if (!isNum(v)) return false;
    switch (kind) {
      case 'pos': return v > 0;
      case 'nonneg': return v >= 0;
      case 'unit': return v >= 0 && v <= 1;
      case 'eps': return v > 0 && v <= 1;
      case 'temp': return v > -K0;
      default: return true;
    }
  }
  const MSG = { pos: 'needs a number > 0', nonneg: 'needs a number ≥ 0', fin: 'needs a number', temp: 'needs a temperature (°C) above -273.15', eps: 'needs a number in (0, 1]', unit: 'needs a number from 0 to 1' };

  // ---- the waveforms of the heat sources ----
  const WAVE_FIELDS = {
    step: { P: 'fin!', t0: 'nonneg', P0: 'fin' },
    pwm: { P: 'fin!', freq: 'pos!', duty: 'unit!', low: 'fin', delay: 'nonneg' },
    sine: { offset: 'fin', amp: 'fin!', freq: 'pos!', phase: 'fin' },
  };
  /** a source's power: value(t), F(t) = ∫₀ᵗ P, mean, edges(t) = the number of jumps in [0, t] */
  function wave(P) {
    if (!isObj(P)) { const p = P; return { value: () => p, F: t => p * t, mean: p, edges: () => 0 }; }
    const kind = Object.keys(P)[0], q = P[kind];
    if (kind === 'step') {
      const p1 = q.P, t0 = has(q, 't0') ? q.t0 : 0, p0 = has(q, 'P0') ? q.P0 : 0;
      return { value: t => (t < t0 ? p0 : p1), F: t => p0 * Math.min(t, t0) + p1 * Math.max(0, t - t0), mean: p1, edges: t => (t0 > 0 && p0 !== p1 && t >= t0 ? 1 : 0) };
    }
    if (kind === 'pwm') {
      const p = q.P, per = 1 / q.freq, d = q.duty, low = has(q, 'low') ? q.low : 0, dl = has(q, 'delay') ? q.delay : 0, on = d * per;
      const flat = d === 0 || d === 1 || p === low;
      const value = t => { if (t < dl) return low; const r = (t - dl) - Math.floor((t - dl) / per) * per; return r < on ? p : low; };
      const F = t => {
        if (t <= dl) return low * t;
        const tau = t - dl, k = Math.floor(tau / per), r = tau - k * per;
        return low * dl + k * per * (d * p + (1 - d) * low) + Math.min(r, on) * p + Math.max(0, r - on) * low;
      };
      const edges = t => { if (flat || t < dl) return 0; const tau = t - dl, k = Math.floor(tau / per), r = tau - k * per; return 1 + 2 * k + (r >= on ? 1 : 0); };
      return { value, F, mean: d * p + (1 - d) * low, edges };
    }
    const off = has(q, 'offset') ? q.offset : 0, amp = q.amp, w = 2 * Math.PI * q.freq, ph = (has(q, 'phase') ? q.phase : 0) * Math.PI / 180;
    return { value: t => off + amp * Math.sin(w * t + ph), F: t => off * t - amp / w * (Math.cos(w * t + ph) - Math.cos(ph)), mean: off, edges: () => 0 };
  }

  // ---- check(network) → [{code, path, msg, level}] (twin: tools/thermal.py check) ----
  const TOP_KEYS = ['format', 'ambient', 'nodes', 'links', 'sources', 'thermostats', 'meta'];
  const NODE_KEYS = ['id', 'C', 'T0', 'fixed', 'label', 'note'];
  const LINK_KEYS = ['id', 'a', 'b', 'R', 'G', 'conv', 'rad', 'label', 'note'];
  const SRC_KEYS = ['id', 'node', 'P', 'label', 'note'];
  const TS_KEYS = ['id', 'sensor', 'source', 'low', 'high', 'mode', 'label', 'note'];
  const LINK_KINDS = ['R', 'G', 'conv', 'rad'];
  const SUB = { conv: { h: 'pos', A: 'pos' }, rad: { eps: 'eps', A: 'pos' } };
  const extra = (o, allowed) => Object.keys(o).filter(k => !allowed.includes(k)).sort();
  function checkFields(q, F, path, E, code) {   // an object of numeric fields {name: 'kind' | 'kind!'}
    for (const k of extra(q, Object.keys(F))) E(code, `${path}.${k}`, 'unknown field');
    for (const [k, spec] of Object.entries(F)) {
      const must = spec.endsWith('!'), kd = must ? spec.slice(0, -1) : spec;
      if (!has(q, k)) { if (must) E(code, `${path}.${k}`, 'missing'); continue; }
      if (!okNum(kd, q[k])) E(code, `${path}.${k}`, 'out of range');
    }
  }
  function checkWave(v, path, E) {
    if (!isObj(v)) { if (!isNum(v)) E('value', path, 'needs a number or a waveform'); return; }
    const keys = Object.keys(v);
    if (keys.length !== 1 || !has(WAVE_FIELDS, keys[0])) { E('value', path, 'one of a number, step, pwm, sine'); return; }
    const kind = keys[0], q = v[kind];
    if (!isObj(q)) { E('value', `${path}.${kind}`, 'needs an object'); return; }
    checkFields(q, WAVE_FIELDS[kind], `${path}.${kind}`, E, 'value');
  }
  function check(net) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    if (!isObj(net)) { E('format', '', 'network is not an object'); return P; }
    if (has(net, 'format') && net.format !== FORMAT) E('format', 'format', 'not ' + FORMAT);
    if (!Array.isArray(net.nodes)) E('format', 'nodes', 'not an array');
    if (!Array.isArray(net.links)) E('format', 'links', 'not an array');
    if (has(net, 'sources') && !Array.isArray(net.sources)) E('format', 'sources', 'not an array');
    if (has(net, 'thermostats') && !Array.isArray(net.thermostats)) E('format', 'thermostats', 'not an array');
    if (P.length) return P;
    for (const k of extra(net, TOP_KEYS)) W('unknown-field', k, 'ignored');
    if (has(net, 'ambient') && !okNum('temp', net.ambient)) E('value', 'ambient', MSG.temp);
    const sources = net.sources || [], tss = net.thermostats || [];
    if (net.nodes.length > MAX_NODES) E('size', 'nodes', 'more than ' + MAX_NODES + ' nodes');
    if (net.links.length > MAX_LINKS) E('size', 'links', 'more than ' + MAX_LINKS + ' links');
    if (sources.length > MAX_SOURCES) E('size', 'sources', 'more than ' + MAX_SOURCES + ' sources');
    if (tss.length > MAX_THERMOSTATS) E('size', 'thermostats', 'more than ' + MAX_THERMOSTATS + ' thermostats');
    const ids = new Set(), node = new Map(), srcIds = new Set();
    const idOk = (o, at) => {
      if (typeof o.id !== 'string' || !ID_RE.test(o.id)) { E('id', at + '.id', 'bad id'); return false; }
      if (o.id === 'ambient') { E('id', at + '.id', 'ambient is reserved'); return false; }
      if (ids.has(o.id)) { E('dup-id', at + '.id', 'duplicate id ' + o.id); return false; }
      ids.add(o.id); return true;
    };
    net.nodes.forEach((nd, i) => {
      const at = `nodes[${i}]`;
      if (!isObj(nd)) { E('format', at, 'node is not an object'); return; }
      for (const k of extra(nd, NODE_KEYS)) W('unknown-field', `${at}.${k}`, 'ignored');
      const good = idOk(nd, at);
      if (has(nd, 'fixed')) {
        if (!okNum('temp', nd.fixed)) E('value', at + '.fixed', MSG.temp);
        if (has(nd, 'C') || has(nd, 'T0')) E('value', at, 'a fixed node takes no C or T0');
      }
      if (has(nd, 'C') && !okNum('nonneg', nd.C)) E('value', at + '.C', MSG.nonneg);
      if (has(nd, 'T0') && !okNum('temp', nd.T0)) E('value', at + '.T0', MSG.temp);
      if (good) node.set(nd.id, { i, fixed: has(nd, 'fixed'), massive: !has(nd, 'fixed') && isNum(nd.C) && nd.C > 0 });
    });
    const isBound = id => id === 'ambient' || (node.has(id) && node.get(id).fixed);
    const linkEnds = [];
    net.links.forEach((l, i) => {
      const at = `links[${i}]`;
      if (!isObj(l)) { E('format', at, 'link is not an object'); return; }
      for (const k of extra(l, LINK_KEYS)) W('unknown-field', `${at}.${k}`, 'ignored');
      idOk(l, at);
      const aOk = typeof l.a === 'string' && node.has(l.a);
      if (!aOk) E('unknown-node', at + '.a', 'not a node of the network');
      const b = has(l, 'b') ? l.b : 'ambient', bOk = typeof b === 'string' && (b === 'ambient' || node.has(b));
      if (!bOk) E('unknown-node', at + '.b', 'not a node of the network');
      if (aOk && bOk) {
        if (l.a === b) E('self-loop', at, 'both ends on one node');
        else if (isBound(l.a) && isBound(b)) W('boundary-link', at, 'both ends are boundaries');
        linkEnds.push([l.a, b]);
      }
      const kinds = LINK_KINDS.filter(k => has(l, k));
      if (kinds.length !== 1) { E('link', at, 'needs exactly one of R, G, conv, rad'); return; }
      const k = kinds[0];
      if (k === 'R' || k === 'G') { if (!okNum('pos', l[k])) E('value', `${at}.${k}`, MSG.pos); return; }
      if (!isObj(l[k])) { E('value', `${at}.${k}`, k === 'conv' ? 'needs an object {h, A}' : 'needs an object {eps, A}'); return; }
      const q = l[k], F = SUB[k];
      for (const x of extra(q, Object.keys(F))) E('value', `${at}.${k}.${x}`, 'unknown field');
      for (const [f, kd] of Object.entries(F)) {
        if (!has(q, f)) E('value', `${at}.${k}.${f}`, 'missing');
        else if (!okNum(kd, q[f])) E('value', `${at}.${k}.${f}`, MSG[kd]);
      }
    });
    sources.forEach((s, i) => {
      const at = `sources[${i}]`;
      if (!isObj(s)) { E('format', at, 'source is not an object'); return; }
      for (const k of extra(s, SRC_KEYS)) W('unknown-field', `${at}.${k}`, 'ignored');
      if (idOk(s, at)) srcIds.add(s.id);
      if (!(typeof s.node === 'string' && node.has(s.node))) E('unknown-node', at + '.node', 'not a node of the network');
      else if (node.get(s.node).fixed) E('fixed-node', at + '.node', 'a source on a fixed node does nothing');
      if (!has(s, 'P')) E('value', at + '.P', 'missing'); else checkWave(s.P, at + '.P', E);
    });
    const gated = new Set();
    tss.forEach((th, i) => {
      const at = `thermostats[${i}]`;
      if (!isObj(th)) { E('format', at, 'thermostat is not an object'); return; }
      for (const k of extra(th, TS_KEYS)) W('unknown-field', `${at}.${k}`, 'ignored');
      idOk(th, at);
      if (!(typeof th.sensor === 'string' && node.has(th.sensor))) E('unknown-node', at + '.sensor', 'not a node of the network');
      if (!(typeof th.source === 'string' && srcIds.has(th.source))) E('unknown-source', at + '.source', 'not a source of the network');
      else if (gated.has(th.source)) E('thermostat', at + '.source', 'this source already has a thermostat');
      else gated.add(th.source);
      const lo = isNum(th.low), hi = isNum(th.high);
      if (!lo) E('value', at + '.low', MSG.fin);
      if (!hi) E('value', at + '.high', MSG.fin);
      if (lo && hi && !(th.low < th.high)) E('value', at, 'low must be below high');
      if (has(th, 'mode') && th.mode !== 'heat' && th.mode !== 'cool') E('value', at + '.mode', 'heat or cool');
    });
    if (P.some(p => p.level === 'error')) return P;
    // the graph: every group of nodes needs a path to a boundary (fixed node or ambient) for a steady state
    const par = new Map(), find = s => { while (par.get(s) !== s) s = par.get(s); return s; };
    for (const [id, v] of node) if (!v.fixed) par.set(id, id);
    const anchored = new Set();
    for (const [a, b] of linkEnds) {
      const ba = isBound(a), bb = isBound(b);
      if (ba && bb) continue;
      if (ba) anchored.add(find(b)); else if (bb) anchored.add(find(a));
      else { const x = find(a), y = find(b); if (x !== y) { par.set(x, y); if (anchored.has(x)) anchored.add(y); } }
    }
    const groups = new Map();
    for (const [id, v] of node) { if (v.fixed) continue; const r = find(id); if (!groups.has(r)) groups.set(r, { first: id, massive: false, anchored: false }); const g = groups.get(r); if (v.massive) g.massive = true; }
    for (const r of anchored) { const g = groups.get(find(r)); if (g) g.anchored = true; }
    for (const g of groups.values()) {
      if (g.anchored) continue;
      const i = node.get(g.first).i;
      if (!g.massive) E('singular', `nodes[${i}]`, 'no heat capacity and no path to a boundary: ' + g.first);
      else W('floating', `nodes[${i}]`, 'no path to a boundary from ' + g.first + ' (no steady state)');
    }
    return P;
  }

  // ---- checkSpec(spec) → the problems of a sim-spec's model and outputs (paths from the spec: model.…, outputs[i]…) ----
  const MODEL_KEYS = ['network', 'bindings', 'transient'];
  const TRAN_KEYS = ['tEnd', 'dt', 'method', 'start', 'points'];
  const OUT_KEYS = ['id', 'kind', 'node', 'link', 'source', 'thermostat', 'tau', 'time', 'at', 'stat'];
  const OUT_SRC = ['node', 'link', 'source', 'thermostat', 'tau', 'time'];
  const isExpr = v => typeof v === 'string' && v.trim() !== '';
  /** what a binding can set on each id of a valid network: id → [props] (the first one is the default) */
  function bindable(net) {
    const m = new Map([['ambient', ['value']]]);
    for (const nd of net.nodes) m.set(nd.id, has(nd, 'fixed') ? ['fixed'] : ['C', 'T0']);
    for (const l of net.links) {
      const k = LINK_KINDS.find(x => has(l, x));
      m.set(l.id, k === 'R' || k === 'G' ? [k] : Object.keys(SUB[k]).map(f => k + '.' + f));
    }
    for (const s of net.sources || []) m.set(s.id, isObj(s.P) ? Object.keys(WAVE_FIELDS[Object.keys(s.P)[0]]).map(f => Object.keys(s.P)[0] + '.' + f) : ['P']);
    for (const th of net.thermostats || []) m.set(th.id, ['low', 'high']);
    return m;
  }
  function checkSpec(spec) {
    const P = [], E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('model', 'model', ID + ' needs a model {network, bindings?, transient?}'); return P; }
    for (const k of extra(m, MODEL_KEYS)) E('unknown-field', 'model.' + k, 'unknown field');
    if (!isObj(m.network)) { E('model', 'model.network', 'needs a network {format: "' + FORMAT + '", nodes, links, sources?, thermostats?}'); return P; }
    for (const p of check(m.network)) P.push({ ...p, path: 'model.network' + (p.path ? '.' + p.path : '') });
    if (P.some(p => p.level === 'error')) return P;
    const net = m.network, can = bindable(net), kindOf = new Map();
    for (const nd of net.nodes) kindOf.set(nd.id, 'node');
    for (const l of net.links) kindOf.set(l.id, 'link');
    for (const s of net.sources || []) kindOf.set(s.id, 'source');
    for (const th of net.thermostats || []) kindOf.set(th.id, 'thermostat');
    const bs = m.bindings;
    if (has(m, 'bindings') && !(Array.isArray(bs) && bs.length <= MAX_BINDINGS)) E('binding', 'model.bindings', `a list of at most ${MAX_BINDINGS} {element, prop?, expr}`);
    (Array.isArray(bs) ? bs.slice(0, MAX_BINDINGS) : []).forEach((b, i) => {
      const w = `model.bindings[${i}]`;
      if (!isObj(b)) { E('binding', w, 'an object {element, prop?, expr}'); return; }
      for (const k of extra(b, ['element', 'prop', 'expr'])) E('unknown-field', `${w}.${k}`, 'unknown field');
      const props = typeof b.element === 'string' ? can.get(b.element) : undefined;
      if (!props) E('binding', w + '.element', 'not an id of the network (or ambient)');
      else if (has(b, 'prop') && !props.includes(b.prop)) E('binding', w + '.prop', 'one of ' + props.join(', '));
      if (!(isExpr(b.expr) || isNum(b.expr))) E('binding', w + '.expr', 'needs an expression');
    });
    const tr = m.transient;
    let te = null, dt = null;
    if (has(m, 'transient')) {
      if (!isObj(tr)) E('transient', 'model.transient', 'needs an object {tEnd, dt?, method?, start?, points?}');
      else {
        for (const k of extra(tr, TRAN_KEYS)) E('unknown-field', 'model.transient.' + k, 'unknown field');
        if (!has(tr, 'tEnd')) E('transient', 'model.transient.tEnd', 'missing');
        else if (isNum(tr.tEnd) && tr.tEnd > 0) te = tr.tEnd; else if (!isExpr(tr.tEnd)) E('transient', 'model.transient.tEnd', 'needs a number > 0 or an expression');
        if (has(tr, 'dt')) { if (isNum(tr.dt) && tr.dt > 0) dt = tr.dt; else if (!isExpr(tr.dt)) E('transient', 'model.transient.dt', 'needs a number > 0 or an expression'); }
        if (has(tr, 'method') && tr.method !== 'trap' && tr.method !== 'be') E('transient', 'model.transient.method', 'trap or be');
        if (has(tr, 'start') && tr.start !== 'T0' && tr.start !== 'steady') E('transient', 'model.transient.start', 'T0 or steady');
        if (has(tr, 'points') && !(Number.isInteger(tr.points) && tr.points >= 2 && tr.points <= MAX_POINTS)) E('transient', 'model.transient.points', 'needs a whole number from 2 to ' + MAX_POINTS);
        if (te !== null && dt !== null && Math.ceil(te / dt - 1e-9) > MAX_STEPS) E('budget', 'model.transient', `tEnd / dt is more than ${MAX_STEPS} steps`);
      }
    }
    const massive = net.nodes.filter(nd => !has(nd, 'fixed') && nd.C > 0).length;
    (isObj(spec) && Array.isArray(spec.outputs) ? spec.outputs : []).forEach((o, i) => {
      const w = `outputs[${i}]`;
      if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) return;   // (the common checks report it)
      for (const k of extra(o, OUT_KEYS)) E('unknown-field', `${w}.${k}`, 'unknown field');
      const src = OUT_SRC.filter(k => has(o, k));
      if (src.length !== 1) { E('output', w, 'must name what it reads: one of ' + OUT_SRC.join(', ')); return; }
      const s = src[0], at = has(o, 'at'), st = has(o, 'stat');
      if (s === 'time') { if (!(o.time === true && o.kind === 'series')) E('output', w + '.time', 'true on a series output (the time axis)'); }
      else if (s === 'tau') { if (!(o.kind === 'scalar' && Number.isInteger(o.tau) && o.tau >= 1 && o.tau <= massive)) E('output', w + '.tau', 'a whole number from 1 to the number of nodes with a heat capacity, on a scalar output'); }
      else if (kindOf.get(o[s]) !== s || typeof o[s] !== 'string') E('output', `${w}.${s}`, 'not a ' + s + ' of the network');
      if ((at || st) && !(o.kind === 'scalar' && ['node', 'link', 'source', 'thermostat'].includes(s))) E('output', w, 'at and stat belong to a scalar output of a node, link, source or thermostat');
      if (at && st) E('output', w, 'at or stat, not both');
      if (at && !((isNum(o.at) && o.at >= 0) || isExpr(o.at))) E('output', w + '.at', 'needs a number ≥ 0 or an expression');
      if (st && !STATS.includes(o.stat)) E('output', w + '.stat', 'one of ' + STATS.join(', '));
      if (s === 'thermostat' && o.kind === 'scalar' && !at && !st) E('output', w, 'a thermostat has no steady state: give at or stat');
      if ((o.kind === 'series' || at || st) && !isObj(tr)) E('output', w, 'needs model.transient {tEnd, dt?}');
    });
    return P;
  }

  // ---- linear algebra: dense LU with partial pivoting ----
  function factor(M, n, perm) {
    let big = 0; for (let i = 0; i < n * n; i++) big = Math.max(big, Math.abs(M[i]));
    const tiny = (big || 1) * 1e-13;
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(M[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(M[i * n + k]); if (v > mx) { mx = v; p = i; } }
      if (!(mx > tiny)) return false;
      perm[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t; }
      const d = M[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (M[i * n + k] /= d); if (f === 0) continue;
        for (let j = k + 1; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      }
    }
    return true;
  }
  function subst(M, n, perm, b) {   // in place: b → x
    for (let k = 0; k < n; k++) { const p = perm[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
    for (let i = 1; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= M[i * n + j] * b[j]; b[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= M[i * n + j] * b[j]; b[i] = s / M[i * n + i]; }
    return b;
  }
  function solveDense(M0, n, b) { const M = Float64Array.from(M0), perm = new Int32Array(n); if (!factor(M, n, perm)) throw fail('singular'); return subst(M, n, perm, Float64Array.from(b)); }
  /** eigenvalues of a symmetric matrix (cyclic Jacobi) */
  function eigSym(A0, n) {
    const A = Float64Array.from(A0);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j] * A[i * n + j];
      if (off < 1e-30) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
        const th = (A[q * n + q] - A[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k * n + p], akq = A[k * n + q]; A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p * n + k], aqk = A[q * n + k]; A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk; }
      }
    }
    return Array.from({ length: n }, (_, i) => A[i * n + i]);
  }

  // ---- compile: unknowns (the non-fixed nodes), the conductance matrix, boundary terms, radiation, sources, thermostats ----
  function compile(net) {
    const amb = has(net, 'ambient') ? net.ambient : AMBIENT, idx = new Map(), bT = new Map([['ambient', amb]]), U = [];
    for (const nd of net.nodes) { if (has(nd, 'fixed')) bT.set(nd.id, nd.fixed); else { idx.set(nd.id, U.length); U.push(nd); } }
    const n = U.length, C = new Float64Array(n), T0 = new Float64Array(n), G = new Float64Array(n * n), b = new Float64Array(n);
    U.forEach((nd, i) => { C[i] = has(nd, 'C') ? nd.C : 0; T0[i] = has(nd, 'T0') ? nd.T0 : amb; });
    const end = id => (idx.has(id) ? { u: idx.get(id), T: 0 } : { u: -1, T: bT.get(id) });
    const links = net.links.map(l => {
      const A = end(l.a), B = end(has(l, 'b') ? l.b : 'ambient');
      let g = 0, k = 0;
      if (has(l, 'R')) g = 1 / l.R; else if (has(l, 'G')) g = l.G; else if (has(l, 'conv')) g = l.conv.h * l.conv.A; else k = l.rad.eps * SIGMA * l.rad.A;
      if (g) {
        if (A.u >= 0) { G[A.u * n + A.u] += g; if (B.u >= 0) G[A.u * n + B.u] -= g; else b[A.u] += g * B.T; }
        if (B.u >= 0) { G[B.u * n + B.u] += g; if (A.u >= 0) G[B.u * n + A.u] -= g; else b[B.u] += g * A.T; }
      }
      return { id: l.id, A, B, g, k };
    });
    const rads = links.filter(l => l.k > 0);
    const sources = (net.sources || []).map(s => ({ id: s.id, u: idx.get(s.node), w: wave(s.P), gate: -1 }));
    const srcAt = new Map(sources.map((s, i) => [s.id, i]));
    const thermostats = (net.thermostats || []).map((th, i) => { const si = srcAt.get(th.source); sources[si].gate = i; return { id: th.id, s: end(th.sensor), low: th.low, high: th.high, heat: th.mode !== 'cool', src: si }; });
    const nodeOut = net.nodes.map(nd => ({ id: nd.id, ...end(nd.id) }));
    return { n, C, T0, G, b, links, rads, sources, thermostats, nodeOut, amb };
  }

  function makeSim(ck) {
    const { n, C, G, b, links, rads, sources, thermostats, nodeOut } = ck;
    const Tof = (e, x) => (e.u >= 0 ? x[e.u] : e.T);
    const flow = (l, x) => { const ta = Tof(l.A, x), tb = Tof(l.B, x); return l.g ? l.g * (ta - tb) : l.k * (Math.pow(ta + K0, 4) - Math.pow(tb + K0, 4)); };
    /** out += rad(x) (heat into each unknown); J −= scale·∂rad/∂x (row-scaled by th) when J is given */
    function rad(x, out, J, th) {
      for (const l of rads) {
        const ta = Tof(l.A, x), tb = Tof(l.B, x), q = l.k * (Math.pow(ta + K0, 4) - Math.pow(tb + K0, 4));
        const da = 4 * l.k * Math.pow(ta + K0, 3), db = 4 * l.k * Math.pow(tb + K0, 3), a = l.A.u, c = l.B.u;
        if (a >= 0) { out[a] -= q; if (J) { J[a * n + a] += th[a] * da; if (c >= 0) J[a * n + c] -= th[a] * db; } }
        if (c >= 0) { out[c] += q; if (J) { J[c * n + c] += th[c] * db; if (a >= 0) J[c * n + a] -= th[c] * da; } }
      }
    }
    const ones = new Float64Array(n).fill(1);
    /** solve G·x = b + p + rad(x) (Newton with a damped step when radiation is present) */
    function steadyX(p) {
      const rhs = new Float64Array(n); for (let i = 0; i < n; i++) rhs[i] = b[i] + p[i];
      if (!rads.length) return solveDense(G, n, rhs);
      const G1 = Float64Array.from(G), r1 = Float64Array.from(rhs);   // a start: radiation linearised at the ambient
      for (const l of rads) {
        const h = 4 * l.k * Math.pow(ck.amb + K0, 3), a = l.A.u, c = l.B.u;
        const add = (i, j, v) => { G1[i * n + j] += v; };
        if (a >= 0) { add(a, a, h); if (c >= 0) add(a, c, -h); else r1[a] += h * l.B.T; }
        if (c >= 0) { add(c, c, h); if (a >= 0) add(c, a, -h); else r1[c] += h * l.A.T; }
      }
      let x = solveDense(G1, n, r1);
      for (let it = 0; it < 100; it++) {
        const R = new Float64Array(n), J = Float64Array.from(G);
        for (let i = 0; i < n; i++) { let s = -rhs[i]; for (let j = 0; j < n; j++) s += G[i * n + j] * x[j]; R[i] = s; }
        const rv = new Float64Array(n); rad(x, rv, J, ones); for (let i = 0; i < n; i++) R[i] -= rv[i];
        const dx = solveDense(J, n, R.map(v => -v));
        let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(dx[i]));
        const sc = mx > 50 ? 50 / mx : 1;
        for (let i = 0; i < n; i++) x[i] = Math.max(-K0 + 1e-6, x[i] + sc * dx[i]);
        if (mx < 1e-10 * (1 + Math.abs(x[0] || 0))) return x;
      }
      throw fail('no-convergence');
    }
    function powers(mode) { const p = new Float64Array(n); for (const s of sources) p[s.u] += mode === 't0' ? s.w.value(0) : s.w.mean; return p; }
    /** the steady state (thermostats ignored: their sources on; mode 'mean': each source's mean, 't0': its value at t = 0) */
    function steady(o) {
      const mode = o && o.mode === 't0' ? 't0' : 'mean', x = steadyX(powers(mode)), r = { nodes: {}, links: {}, sources: {} };
      for (const nd of nodeOut) r.nodes[nd.id] = Tof(nd, x);
      for (const l of links) r.links[l.id] = flow(l, x);
      for (const s of sources) r.sources[s.id] = mode === 't0' ? s.w.value(0) : s.w.mean;
      return r;
    }
    /** the time constants (s, slowest first) of the network linearised at its steady state (or at T0 without one) */
    function taus() {
      let x; try { x = steadyX(powers('mean')); } catch (e) { x = Float64Array.from(ck.T0); }
      const K = Float64Array.from(G); rad(x, new Float64Array(n), K, ones);
      const m = [], z = []; for (let i = 0; i < n; i++) (C[i] > 0 ? m : z).push(i);
      const nm = m.length, nz = z.length, Gr = new Float64Array(nm * nm);
      for (let i = 0; i < nm; i++) for (let j = 0; j < nm; j++) Gr[i * nm + j] = K[m[i] * n + m[j]];
      if (nz) {   // the Schur complement of the massless nodes
        const Kzz = new Float64Array(nz * nz); for (let i = 0; i < nz; i++) for (let j = 0; j < nz; j++) Kzz[i * nz + j] = K[z[i] * n + z[j]];
        const perm = new Int32Array(nz); if (!factor(Kzz, nz, perm)) throw fail('singular');
        for (let j = 0; j < nm; j++) {
          const col = new Float64Array(nz); for (let i = 0; i < nz; i++) col[i] = K[z[i] * n + m[j]];
          subst(Kzz, nz, perm, col);
          for (let i = 0; i < nm; i++) { let s = 0; for (let k = 0; k < nz; k++) s += K[m[i] * n + z[k]] * col[k]; Gr[i * nm + j] -= s; }
        }
      }
      const S = new Float64Array(nm * nm);
      for (let i = 0; i < nm; i++) for (let j = 0; j < nm; j++) S[i * nm + j] = 0.5 * (Gr[i * nm + j] + Gr[j * nm + i]) / Math.sqrt(C[m[i]] * C[m[j]]);
      const lam = eigSym(S, nm), big = Math.max(1e-300, ...lam.map(Math.abs));
      return lam.map(l => (l > big * 1e-12 ? 1 / l : Infinity)).sort((a, c) => c - a);
    }
    /** the thermostats' gates at a state (on below high when heating, above low when cooling) */
    const gateAt = x => thermostats.map(th => { const T = Tof(th.s, x); return th.heat ? T < th.high : T > th.low; });
    /** m steps of h from tA on the kernel's θ-method DAE solver (NoemaSimKit.daeThetaInit): C·x' = f(t, x) = −G·x + b + P̄ + rad(x),
        the massless nodes algebraic rows, the analytic Jacobian; a linear network (no radiation) factors C − hθ(−G) once per (h, θ)
        and takes one solve a step. Before each step (beforeStep) the gates are tested at its start (with their hysteresis), P̄ is
        each source's exact mean over the step (sp, out) and θ is 1 (backward Euler) on the first step, on a source edge and on a
        thermostat switch, ½ (trapezoidal) otherwise — what stepCore does. onStep(i, x) after each. */
    function kernelRun(KS, x0, gate, sp, tA, h, m, be, first0, onStep, times) {   // times(k) → [t1, t2]: the engine's own grid (sources, edges)
      const P1 = new Float64Array(n), rk = new Float64Array(n), nS = sources.length;
      const f = (t, y, out) => { for (let i = 0; i < n; i++) { let q = b[i] + P1[i]; for (let j = 0; j < n; j++) q -= G[i * n + j] * y[j]; out[i] = q; } if (rads.length) rad(y, out, null, null); };
      const jac = (t, y, J) => { for (let i = 0; i < n * n; i++) J[i] = G[i]; if (rads.length) rad(y, rk, J, ones); for (let i = 0; i < n * n; i++) J[i] = -J[i]; };   // ∂f/∂x = −(G + ∂(−rad)/∂x)
      let k = 0, lastT0 = NaN, lastSw = false;
      const beforeStep = (ta, tb, y) => {
        const [t1, t2] = times(k);   // the grid's own times (k·h), not the kernel's sums: an edge on a grid time stays in its step
        let switched = false;
        if (t1 === lastT0) switched = lastSw;   // a halved retry of the same step: the gates were tested already
        else thermostats.forEach((th, i) => {
          const T = Tof(th.s, y), on = gate[i];
          const nx = th.heat ? (on ? !(T >= th.high) : T <= th.low) : (on ? !(T <= th.low) : T >= th.high);
          if (nx !== on) { gate[i] = nx; switched = true; }
        });
        lastT0 = t1; lastSw = switched;
        let edge = false; P1.fill(0); const hh = t2 - t1;
        for (let q = 0; q < nS; q++) {
          const src = sources[q], on = src.gate < 0 || gate[src.gate], w = src.w;
          if (w.edges(t2) !== w.edges(t1)) edge = true;
          sp[q] = on ? (w.F(t2) - w.F(t1)) / hh : 0; P1[src.u] += sp[q];
        }
        return { theta: be || (first0 && k === 0) || switched || edge ? 1 : 0.5 };
      };
      const D = KS.daeThetaInit({ M: C, f, jac, linear: !rads.length, beforeStep, y0: x0, t0: tA, tEnd: tA + m * h, dt: h, newtonTol: 1e-13, maxSteps: m + 1,
        onStep: (t, y) => { onStep(k, y); k++; } });
      const R = D.ok ? D.advance(tA + m * h) : D.result;
      if (R.stop !== 'end' || k !== m) throw fail(R.stop === 'budget' ? 'budget' : 'no-convergence', { t: R.t });
    }
    /** one step [t1, t2] of the θ-method on C·x' = −G·x + b + P(t) + rad(x) (massless nodes: algebraic rows): θ = ½ (trapezoidal) on
        nodes with a heat capacity, 1 on massless ones, and backward Euler on the first step, on a source edge and on a thermostat
        switch (the gates are tested at t1, with their hysteresis); the sources' exact mean over the step; Newton with radiation.
        sp (out): each source's power over the step. The same step serves transient() and the stepper. */
    function stepCore(h, be) {
      const thT = new Float64Array(n), thB = new Float64Array(n).fill(1);
      for (let i = 0; i < n; i++) thT[i] = be || !(C[i] > 0) ? 1 : 0.5;
      const mk = th => { const A = new Float64Array(n * n); for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i * n + j] = th[i] * G[i * n + j]; A[i * n + i] += C[i] / h; } return A; };
      const AT = mk(thT), AB = mk(thB), LU = {};
      if (!rads.length) for (const [key, A] of [['t', AT], ['b', AB]]) { const M = Float64Array.from(A), perm = new Int32Array(n); if (!factor(M, n, perm)) throw fail('singular'); LU[key] = { M, perm }; }
      const P = new Float64Array(n), rhs = new Float64Array(n), Gx = new Float64Array(n), rv = new Float64Array(n), nS = sources.length;
      return { step(x, gate, sp, t1, t2, first) {
        let switched = false;
        thermostats.forEach((th, i) => {
          const T = Tof(th.s, x), on = gate[i];
          const nx = th.heat ? (on ? !(T >= th.high) : T <= th.low) : (on ? !(T <= th.low) : T >= th.high);
          if (nx !== on) { gate[i] = nx; switched = true; }
        });
        let edge = false; P.fill(0); const hh = t2 - t1;
        for (let s = 0; s < nS; s++) {
          const src = sources[s], on = src.gate < 0 || gate[src.gate], w = src.w;
          if (w.edges(t2) !== w.edges(t1)) edge = true;
          sp[s] = on ? (w.F(t2) - w.F(t1)) / hh : 0; P[src.u] += sp[s];
        }
        const useB = be || first || switched || edge, th = useB ? thB : thT;
        for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += G[i * n + j] * x[j]; Gx[i] = s; }
        rv.fill(0); if (rads.length) rad(x, rv, null, null);
        for (let i = 0; i < n; i++) rhs[i] = C[i] / h * x[i] - (1 - th[i]) * (Gx[i] - rv[i]) + b[i] + P[i];
        if (!rads.length) { const L = LU[useB ? 'b' : 't']; return subst(L.M, n, L.perm, Float64Array.from(rhs)); }
        const A = useB ? AB : AT, y = Float64Array.from(x);
        let conv = false;
        for (let it = 0; it < 30 && !conv; it++) {
          const R = new Float64Array(n), J = Float64Array.from(A), rr = new Float64Array(n);
          rad(y, rr, J, th);
          for (let i = 0; i < n; i++) { let s = -rhs[i] - th[i] * rr[i]; for (let j = 0; j < n; j++) s += A[i * n + j] * y[j]; R[i] = -s; }
          const dx = solveDense(J, n, R);
          let m = 0; for (let i = 0; i < n; i++) { y[i] = Math.max(-K0 + 1e-6, y[i] + dx[i]); m = Math.max(m, Math.abs(dx[i])); }
          conv = m < 1e-9;
        }
        if (!conv) throw fail('no-convergence', { t: t2 });
        return y;
      } };
    }
    /** a transient: {tEnd, dt?, method: 'trap' | 'be', start: 'T0' | 'steady', points ≤ 20001, at: [t…], maxSteps} */
    function transient(o) {
      o = o || {};
      const tEnd = o.tEnd, dt0 = o.dt === undefined || o.dt === 0 ? tEnd / 1000 : o.dt, maxSteps = o.maxSteps === undefined ? MAX_STEPS : o.maxSteps;
      if (!(isNum(tEnd) && tEnd > 0 && isNum(dt0) && dt0 > 0)) throw fail('bad-args');
      const steps = Math.max(1, Math.ceil(tEnd / dt0 - 1e-9)), h = tEnd / steps;
      if (!(maxSteps > 0) || steps > Math.min(maxSteps, MAX_STEPS)) throw fail('budget', { steps, limit: Math.min(maxSteps, MAX_STEPS) || MAX_STEPS });
      const be = o.method === 'be', points = Math.max(2, Math.min(MAX_POINTS, o.points === undefined ? 2001 : Math.floor(o.points)));
      const stride = Math.ceil(steps / (points - 1));
      let x = o.start === 'steady' ? steadyX(powers('t0')) : Float64Array.from(ck.T0);
      const gate = gateAt(x), core = kit() ? null : stepCore(h, be);
      // channels: nodes, links, sources (power after the thermostat, mean over the step), thermostats (0 / 1)
      const nN = nodeOut.length, nL = links.length, nS = sources.length, nT = thermostats.length, nCh = nN + nL + nS + nT;
      const vals = new Float64Array(nCh), sp = new Float64Array(nS);
      for (let s = 0; s < nS; s++) sp[s] = (sources[s].gate >= 0 && !gate[sources[s].gate] ? 0 : 1) * sources[s].w.value(0);
      const fill = () => {
        let c = 0;
        for (const nd of nodeOut) vals[c++] = Tof(nd, x);
        for (const l of links) vals[c++] = flow(l, x);
        for (let s = 0; s < nS; s++) vals[c++] = sp[s];
        for (let k = 0; k < nT; k++) vals[c++] = gate[k] ? 1 : 0;
      };
      const nRec = Math.floor(steps / stride) + 1 + (steps % stride ? 1 : 0), rec = Array.from({ length: nCh }, () => new Float64Array(nRec)), tRec = new Float64Array(nRec);
      const mn = new Float64Array(nCh).fill(Infinity), mx = new Float64Array(nCh).fill(-Infinity), sum = new Float64Array(nCh), sq = new Float64Array(nCh);
      const atT = Array.isArray(o.at) ? o.at.map((t, i) => [t, i]).filter(([t]) => isNum(t)).sort((p, q) => p[0] - q[0]) : [];
      const atV = Array.isArray(o.at) ? o.at.map(() => new Float64Array(nCh).fill(NaN)) : [];
      let ai = 0, r = 0;
      const prev = new Float64Array(nCh);
      const take = (k, t) => {
        for (let c = 0; c < nCh; c++) { const v = vals[c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; sum[c] += v; sq[c] += v * v; }
        if (k % stride === 0 || k === steps) { tRec[r] = t; for (let c = 0; c < nCh; c++) rec[c][r] = vals[c]; r++; }
        while (ai < atT.length && (atT[ai][0] <= t + 1e-12 * tEnd || k === steps)) {
          const ta = atT[ai][0], out = atV[atT[ai][1]], f = k === 0 ? 1 : Math.min(1, Math.max(0, (ta - (t - h)) / h));
          for (let c = 0; c < nCh; c++) out[c] = prev[c] + f * (vals[c] - prev[c]);
          ai++;
        }
        prev.set(vals);
      };
      fill(); prev.set(vals); take(0, 0);
      const KS = kit();
      if (KS) kernelRun(KS, x, gate, sp, 0, h, steps, be, true, (k, y) => { x = y; fill(); take(k + 1, (k + 1) * h); }, k => [k * h, (k + 1) * h]);
      else for (let k = 0; k < steps; k++) {   // FALLBACK without the kernel: the own θ-step
        const t1 = k * h, t2 = (k + 1) * h;
        x = core.step(x, gate, sp, t1, t2, k === 0);
        fill(); take(k + 1, t2);
      }
      const N = steps + 1, out = { t: Array.from(tRec), nodes: {}, links: {}, sources: {}, thermostats: {}, stats: { nodes: {}, links: {}, sources: {}, thermostats: {} }, at: {}, steps, dt: h, stride };
      const groups = [['nodes', nodeOut], ['links', links], ['sources', sources], ['thermostats', thermostats]];
      let c = 0;
      for (const [g, list] of groups) for (const it of list) {
        out[g][it.id] = Array.from(rec[c]);
        out.stats[g][it.id] = { final: vals[c], min: mn[c], max: mx[c], mean: sum[c] / N, pp: mx[c] - mn[c], rms: Math.sqrt(sq[c] / N) };
        if (atV.length) out.at[g + ':' + it.id] = atV.map(v => v[c]);
        c++;
      }
      return out;
    }
    /* the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the same θ-step as transient(), its state plain data (a snapshot is a copy):
       {t, k, x, gate, ch (the channels now: nodes, links, sources, thermostats), stats: [min, max, sum, sumsq] per channel, n} */
    const chanIds = () => [['nodes', nodeOut], ['links', links], ['sources', sources], ['thermostats', thermostats]].flatMap(([g, l]) => l.map(it => g + ':' + it.id));
    function channels(x, gate, sp) {
      const v = []; for (const nd of nodeOut) v.push(Tof(nd, x)); for (const l of links) v.push(flow(l, x)); for (let s = 0; s < sources.length; s++) v.push(sp[s]); for (let k = 0; k < thermostats.length; k++) v.push(gate[k] ? 1 : 0);
      return v;
    }
    function stepStart(o) {
      const x = o && o.start === 'steady' ? steadyX(powers('t0')) : Float64Array.from(ck.T0), gate = gateAt(x);
      const sp = sources.map(src => (src.gate >= 0 && !gate[src.gate] ? 0 : 1) * src.w.value(0)), ch = channels(x, gate, sp);
      return { t: o && Number.isFinite(o.t0) ? o.t0 : 0, k: 0, x: Array.from(x), gate, sp, ch, prev: ch.slice(), tPrev: NaN, stats: ch.map(v => [v, v, v, v * v]), n: 1, be: !!(o && o.method === 'be') };
    }
    const cores = new Map();
    /** advance the state to tTo in steps ≤ hMax (whole steps of equal length) */
    function stepTo(st, tTo, hMax) {
      const span = tTo - st.t; if (!(span > 0)) return st;
      const m = Math.max(1, Math.ceil(span / hMax - 1e-9)), h = span / m, key = h + '|' + st.be;
      let x = Float64Array.from(st.x); const sp = st.sp.slice(), KS = kit();
      const after = (i, y) => {
        const t1 = st.t, t2 = i === m - 1 ? tTo : st.t + h; x = y;
        st.k++; st.t = t2;
        st.prev = st.ch; st.tPrev = t1; st.ch = channels(x, st.gate, sp);
        st.ch.forEach((v, c) => { const q = st.stats[c]; if (v < q[0]) q[0] = v; if (v > q[1]) q[1] = v; q[2] += v; q[3] += v * v; }); st.n++;
      };
      if (KS) { kernelRun(KS, x, st.gate, sp, st.t, h, m, st.be, st.k === 0, after, i => [st.t, i === m - 1 ? tTo : st.t + h]); st.x = Array.from(x); st.sp = sp; return st; }
      let core = cores.get(key); if (!core) { if (cores.size > 16) cores.clear(); core = stepCore(h, st.be); cores.set(key, core); }   // FALLBACK: the own θ-step
      for (let i = 0; i < m; i++) {
        const t1 = st.t, t2 = i === m - 1 ? tTo : st.t + h;
        x = core.step(x, st.gate, sp, t1, t2, st.k === 0);
        st.k++; st.t = t2;
        st.prev = st.ch; st.tPrev = t1; st.ch = channels(x, st.gate, sp);
        st.ch.forEach((v, c) => { const q = st.stats[c]; if (v < q[0]) q[0] = v; if (v > q[1]) q[1] = v; q[2] += v; q[3] += v * v; }); st.n++;
      }
      st.x = Array.from(x); st.sp = sp;
      return st;
    }
    return { steady, transient, taus, stepStart, stepTo, chanIds };
  }

  function create(network, opts) {
    const problems = check(network);
    if (problems.some(p => p.level === 'error')) throw fail('invalid', { problems });
    const net = JSON.parse(JSON.stringify(network)), inner = makeSim(compile(net));
    return Object.freeze({ id: ID, steady: o => inner.steady(o), transient: o => inner.transient(o), taus: () => inner.taus(), stepStart: o => inner.stepStart(o), stepTo: (st, t, h) => inner.stepTo(st, t, h), chanIds: () => inner.chanIds() });
  }

  // ---- the sim-spec@1 adapter: create(spec, {seed}) → { run(inputs) → outputs } (in the worker and inline) ----
  const MAXP = 2000;
  const thin = (a, k) => { if (a.length <= k) return Array.from(a); const f = (a.length - 1) / (k - 1), r = []; for (let i = 0; i < k; i++) r.push(a[Math.round(i * f)]); return r; };
  function setProp(net, id, prop, v) {
    if (id === 'ambient') { net.ambient = v; return; }
    const all = [].concat(net.nodes, net.links, net.sources || [], net.thermostats || []), el = all.find(e => e.id === id);
    if (!el) return;
    if (prop === undefined) prop = bindable(net).get(id)[0];
    const [a, f] = String(prop).split('.');
    if (f === undefined) el[a] = v;
    else if (isObj(el.P) && isObj(el.P[a])) el.P[a][f] = v;   // a source's waveform: step.P, pwm.duty, …
    else if (isObj(el[a])) el[a][f] = v;                      // a link's conv.h, rad.eps, …
  }
  const adapter = { create(spec, opts) {
    const model = spec.model || {}, outs = spec.outputs || [], tr = model.transient || {};
    let key = null, sim = null, cache = null, S = null, slot = null;
    function simFor(inp) {
      const k = JSON.stringify(inp.$bind || []);
      if (k !== key) {
        const net = JSON.parse(JSON.stringify(model.network));
        for (const [id, prop, v] of inp.$bind || []) setProp(net, id, prop, v);
        key = k; cache = {};
        try { sim = create(net); } catch (e) { sim = null; }
      }
      return sim;
    }
    return {
      run(inp) {
        const s = simFor(inp), r = {}, T = inp.$tran;
        const ats = (inp.$at && Object.keys(inp.$at).length) ? outs.filter(o => has(o, 'at')) : [];
        const tk = s && T ? JSON.stringify([T, ats.map(o => inp.$at[o.id])]) : null;
        const ST = () => cache.st || (cache.st = s.steady());
        const TR = () => { if (cache.tk !== tk) { cache.tk = tk; cache.tr = s.transient({ tEnd: T.tEnd, dt: T.dt > 0 ? T.dt : undefined, method: tr.method, start: tr.start, points: tr.points, at: ats.map(o => inp.$at[o.id]) }); } return cache.tr; };
        const TA = () => cache.ta || (cache.ta = s.taus());
        for (const o of outs) {
          try {
            if (!s) throw fail('invalid');
            const g = o.node !== undefined ? 'nodes' : o.link !== undefined ? 'links' : o.source !== undefined ? 'sources' : o.thermostat !== undefined ? 'thermostats' : null;
            const id = g && o[g.slice(0, -1)];
            if (o.kind === 'series') { const R = TR(); r[o.id] = thin(o.time ? R.t : R[g][id] || [], MAXP); continue; }
            if (o.tau !== undefined) { const v = TA()[o.tau - 1]; r[o.id] = v === undefined ? NaN : v; continue; }
            if (o.stat !== undefined) { const v = TR().stats[g][id]; r[o.id] = v && STATS.includes(o.stat) ? v[o.stat] : NaN; continue; }
            if (o.at !== undefined) { const R = TR(), v = R.at[g + ':' + id]; r[o.id] = v ? v[ats.indexOf(o)] : NaN; continue; }
            r[o.id] = ST()[g][id];
          } catch (e) { r[o.id] = o.kind === 'series' ? [] : NaN; }
        }
        return r;
      },
      // the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the network's bindings are read at every step; series give their value now
      stepInit(inp, t0) {
        try { const sm = simFor(inp); if (!sm) throw fail('invalid'); S = sm.stepStart({ start: tr.start, method: tr.method, t0 }); slot = null; return { out: stepOuts(sm, inp) }; }
        catch (e) { S = null; return { fail: 'part-failed', out: {} }; }
      },
      stepTo(inp, t, dt) {
        if (!S) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
        try {
          const sm = simFor(inp); if (!sm) throw fail('invalid');
          const T = inp.$tran || {}, hMax = T.dt > 0 ? T.dt : T.tEnd > 0 ? T.tEnd / 1000 : dt / 10;
          if (S.k + Math.ceil(dt / hMax - 1e-9) > MAX_STEPS) return { fail: 'budget', out: {}, dt: 0, events: [] };
          sm.stepTo(S, t + dt, hMax);
          return { out: stepOuts(sm, inp), dt, events: [] };
        } catch (e) { return { fail: 'part-failed', out: {}, dt: 0, events: [] }; }
      },
      snapshot() { if (!S) return -1; slot = JSON.stringify(S); return 0; },
      restore(i) { if (i !== 0 || slot === null) return false; S = JSON.parse(slot); return true; },
    };
    function stepOuts(sm, inp) {
      const ids = sm.chanIds(), r = {};
      for (const o of outs) {
        try {
          const g = o.node !== undefined ? 'nodes' : o.link !== undefined ? 'links' : o.source !== undefined ? 'sources' : o.thermostat !== undefined ? 'thermostats' : null;
          const c = g ? ids.indexOf(g + ':' + o[g.slice(0, -1)]) : -1;
          if (o.kind === 'series') { r[o.id] = o.time ? S.t : c >= 0 ? S.ch[c] : NaN; continue; }
          if (o.tau !== undefined) { const v = (cache.ta || (cache.ta = sm.taus()))[o.tau - 1]; r[o.id] = v === undefined ? NaN : v; continue; }
          if (o.stat !== undefined) { const q = S.stats[c]; r[o.id] = !q ? NaN : { final: S.ch[c], min: q[0], max: q[1], mean: q[2] / S.n, pp: q[1] - q[0], rms: Math.sqrt(q[3] / S.n) }[o.stat]; continue; }
          if (o.at !== undefined) { const ta = inp.$at ? inp.$at[o.id] : NaN; r[o.id] = c >= 0 && ta <= S.t && ta >= S.tPrev ? S.prev[c] + (S.ch[c] - S.prev[c]) * (ta - S.tPrev) / (S.t - S.tPrev) : c >= 0 && ta === S.t ? S.ch[c] : NaN; continue; }
          r[o.id] = (cache.st || (cache.st = sm.steady()))[g][o[g.slice(0, -1)]];
        } catch (e) { r[o.id] = NaN; }
      }
      return r;
    }
  } };
  /** on the main thread: the spec's expressions (bindings, transient times, `at`) become numbers, so the worker needs no evaluator */
  function prepare(spec, compileExpr) {
    const m = spec.model || {}, f = v => (typeof v === 'string' ? compileExpr(v) : () => v);
    const binds = (m.bindings || []).map(b => [b.element, b.prop, f(b.expr)]);
    const tEnd = m.transient ? f(m.transient.tEnd) : null, dt = m.transient && m.transient.dt !== undefined ? f(m.transient.dt) : null;
    const ats = (spec.outputs || []).filter(o => o.at !== undefined).map(o => [o.id, f(o.at)]);
    const ev = (g, env) => { try { const v = g(env); return typeof v === 'boolean' ? +v : +v; } catch (e) { return NaN; } };
    return env => ({ ...env, $bind: binds.map(([id, prop, g]) => [id, prop, ev(g, env)]), $tran: tEnd ? { tEnd: ev(tEnd, env), dt: dt ? ev(dt, env) : 0 } : null, $at: Object.fromEntries(ats.map(([id, g]) => [id, ev(g, env)])) });
  }

  const engine = Object.freeze({
    id: ID,
    check: spec => checkSpec(spec).filter(p => p.level === 'error').map(p => `spec.${p.path}: ${p.msg}`),
    prepare,
    create: (spec, opts) => adapter.create(spec, opts),
    stepper: true,   // a part of a co-simulation (stepInit / stepTo / snapshot / restore on the instance)
  });
  const API = Object.freeze({
    id: ID, format: FORMAT, SIGMA, STATS: Object.freeze(STATS.slice()),
    limits: Object.freeze({ nodes: MAX_NODES, links: MAX_LINKS, sources: MAX_SOURCES, thermostats: MAX_THERMOSTATS, steps: MAX_STEPS, points: MAX_POINTS, bindings: MAX_BINDINGS }),
    check, checkSpec, create, adapter: Object.freeze(adapter), engine,
  });
  export default API;
  /* i18n-ignore-end */
