/* ===================== interactive activities — the circuit engine circuit-mna@1 (docs/activities-dev/circuit.md, docs/adr/001 P3) =====================
   A small, deterministic circuit simulator for the electronics benches of tier B (sim-spec@1): RC/RLC transients, filters, PWM and
   fault-finding benches (a virtual device with a hidden fault; the learner measures, then diagnoses). Pure JS, no DOM, no text for the
   learner: it gives codes and numbers only, the activity host words them.
   How: Modified Nodal Analysis (node voltages + the currents of voltage-defined branches), a dense LU with partial pivoting (circuits
   are small: at most 60 nodes), Newton–Raphson with junction limiting, gmin stepping and source stepping for the nonlinear parts,
   trapezoidal integration with a backward-Euler step at the start and on every step that holds a source discontinuity.
   The netlist (noema.circuit/v1) is described in docs/activities-dev/circuit.md and tools/schemas/noema.circuit.v1.schema.json.
   Also used by tests/circuit.js (node). */
(function (root) {
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this engine
  'use strict';
  const ID = 'circuit-mna@1', FORMAT = 'noema.circuit/v1';
  const MAX_NODES = 60, MAX_ELEMENTS = 200, MAX_STEPS = 200000;
  const VT = 0.025852;                 // kT/q at 300 K
  const GMIN = 1e-12;                  // from every node to ground and across every junction
  const RSHORT = 1e-3;                 // a short fault
  const OHM_I = 1e-3, OHM_OL = 20e6;   // the ohmmeter's test current and its over-range
  const EX80 = Math.exp(80);
  const isGnd = s => s === 'gnd' || s === '0';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const NODE_RE = /^[A-Za-z0-9_][A-Za-z0-9_+\-]{0,31}$/, ID_RE = /^[A-Za-z][A-Za-z0-9_\-]{0,31}$/;
  function fail(code, extra) { const e = new Error('circuit: ' + code); e.code = code; if (extra) Object.assign(e, extra); return e; }

  /** a number, or a string with an SI prefix ("4.7k", "100n", "2meg") → number; anything else → NaN */
  const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, G: 1e9 };
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$/.exec(v);
    return m ? parseFloat(m[1]) * (m[2] ? SI[m[2]] : 1) : NaN;
  }

  // ---- element types, parameters, presets ----
  const TYPES = { R: [2], C: [2], L: [2], V: [2], I: [2], D: [2], SW: [2], NPN: [3], PNP: [3], NMOS: [3], PMOS: [3], OPAMP: [3, 5] };
  const PARAMS = {
    R: {}, C: {}, L: {}, V: {}, I: {},
    D: { Is: 'pos', n: 'pos' }, SW: { Ron: 'pos', Roff: 'pos' },
    NPN: { Is: 'pos', betaF: 'pos', betaR: 'pos' }, PNP: { Is: 'pos', betaF: 'pos', betaR: 'pos' },
    NMOS: { Vth: 'fin', k: 'pos', lambda: 'nonneg' }, PMOS: { Vth: 'fin', k: 'pos', lambda: 'nonneg' },
    OPAMP: { gain: 'pos', rails: 'rails', headroom: 'nonneg' },
  };
  const DEFAULTS = {
    D: { Is: 1e-14, n: 1 }, SW: { Ron: 0.01, Roff: 1e9 },
    NPN: { Is: 1e-14, betaF: 100, betaR: 1 }, PNP: { Is: 1e-14, betaF: 100, betaR: 1 },
    NMOS: { Vth: 1.5, k: 0.1, lambda: 0 }, PMOS: { Vth: 1.5, k: 0.1, lambda: 0 },
    OPAMP: { gain: 1e5, rails: [-15, 15], headroom: 0 },
  };
  const led = vf => ({ Is: 0.02 / Math.expm1(vf / (2 * VT)), n: 2 });   // Vf at 20 mA
  const PRESETS = {
    D: { '1n4148': { Is: 2.52e-9, n: 1.752 }, '1n4001': { Is: 14.11e-9, n: 1.984 }, 'led-red': led(1.8), 'led-orange': led(2.0),
      'led-yellow': led(2.05), 'led-green': led(2.1), 'led-blue': led(3.0), 'led-white': led(3.0) },
    NPN: { '2n3904': { Is: 6.734e-15, betaF: 200, betaR: 0.74 }, '2n2222': { Is: 14.34e-15, betaF: 200, betaR: 6.1 }, bc547: { Is: 7e-15, betaF: 300, betaR: 1 } },
    PNP: { '2n3906': { Is: 1.41e-15, betaF: 180, betaR: 4 }, bc557: { Is: 7e-15, betaF: 250, betaR: 1 } },
    NMOS: { '2n7000': { Vth: 2.1, k: 0.2, lambda: 0.01 }, bs170: { Vth: 1.8, k: 0.25, lambda: 0.01 }, irlz44n: { Vth: 1.6, k: 30, lambda: 0.002 } },
    PMOS: { bs250: { Vth: 2.4, k: 0.12, lambda: 0.01 }, irf9540: { Vth: 3.0, k: 8, lambda: 0.003 } },
  };
  const SHORT_PINS = { NPN: [0, 2], PNP: [0, 2], NMOS: [0, 2], PMOS: [0, 2], OPAMP: [0, 1] };
  const DRIFT_PARAM = { R: 'value', C: 'value', L: 'value', V: 'value', I: 'value', D: 'Is', SW: 'Ron', NPN: 'betaF', PNP: 'betaF', NMOS: 'k', PMOS: 'k', OPAMP: 'gain' };
  const NONLINEAR = new Set(['D', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP']);

  // ---- waveforms of the V and I sources ----
  const WAVE_FIELDS = {
    pulse: { v1: 'fin!', v2: 'fin!', delay: 'nonneg', rise: 'nonneg', fall: 'nonneg', width: 'pos', period: 'pos' },
    sine: { offset: 'fin', amp: 'fin!', freq: 'pos!', phase: 'fin', delay: 'nonneg' },
    pwm: { v: 'fin!', freq: 'pos!', duty: 'unit!', low: 'fin', delay: 'nonneg' },
  };
  /** canonical form: {kind:'dc', dc} | {kind:'pulse', v1, v2, …} | … (numbers parsed, defaults filled) */
  function canonWave(spec) {
    if (!isObj(spec)) return { kind: 'dc', dc: num(spec) };
    if (spec.dc !== undefined) return { kind: 'dc', dc: num(spec.dc) };
    for (const kind of ['pulse', 'sine', 'pwm']) if (spec[kind] !== undefined) {
      const q = spec[kind] || {}, w = { kind };
      for (const f of Object.keys(WAVE_FIELDS[kind])) w[f] = q[f] === undefined ? undefined : num(q[f]);
      if (kind === 'pulse') {
        w.delay = w.delay || 0; w.rise = w.rise || 0; w.fall = w.fall || 0; w.period = w.period || 0;
        if (w.width === undefined) w.width = w.period > 0 ? (w.period - w.rise - w.fall) / 2 : Infinity;
      }
      if (kind === 'sine') { w.offset = w.offset || 0; w.phase = w.phase || 0; w.delay = w.delay || 0; }
      if (kind === 'pwm') { w.low = w.low || 0; w.delay = w.delay || 0; }
      return w;
    }
    return { kind: 'dc', dc: NaN };
  }
  function scaleWave(w, f) {
    const s = Object.assign({}, w);
    for (const k of ['dc', 'v1', 'v2', 'offset', 'amp', 'v', 'low']) if (typeof s[k] === 'number') s[k] *= f;
    return s;
  }
  /** → {at(t), avg, at0m (the value at t = 0⁻), next(t): the first breakpoint after t (Infinity if none)} */
  function wave(w) {
    if (w.kind === 'dc') return { at: () => w.dc, avg: w.dc, at0m: w.dc, next: () => Infinity };
    if (w.kind === 'sine') {
      const ph = w.phase * Math.PI / 180, om = 2 * Math.PI * w.freq;
      const at = t => w.offset + w.amp * Math.sin(t < w.delay ? ph : om * (t - w.delay) + ph);
      return { at, avg: w.offset, at0m: at(0), next: t => (t < w.delay ? w.delay : Infinity) };
    }
    if (w.kind === 'pwm') {
      const T = 1 / w.freq, tol = 1e-9;
      const at = t => {
        if (t < w.delay - tol * T) return w.low;
        const ph = (t - w.delay) * w.freq; let fr = ph - Math.floor(ph + tol); if (fr < 0) fr = 0;
        return fr < w.duty - tol ? w.v : w.low;
      };
      const next = t => {
        if (w.duty <= 0 || w.duty >= 1) return t < w.delay ? w.delay : Infinity;
        if (t < w.delay) return w.delay;
        const k = Math.floor((t - w.delay) * w.freq);
        for (let c = k; c <= k + 1; c++) for (const o of [0, w.duty]) { const bp = w.delay + (c + o) * T; if (bp > t) return bp; }
        return w.delay + (k + 2) * T;
      };
      return { at, avg: w.low + (w.v - w.low) * w.duty, at0m: w.duty >= 1 && w.delay <= 0 ? w.v : w.low, next };
    }
    // pulse (SPICE semantics)
    const { v1, v2, delay, rise, fall, width, period: per } = w;
    const scale = per > 0 ? per : (rise + fall + (Number.isFinite(width) ? width : 0) + delay) || 1e-6, tol = 1e-9 * scale;
    const at = t => {
      if (t < delay - tol) return v1;
      let tt = t - delay; if (tt < 0) tt = 0;
      if (per > 0) { tt -= per * Math.floor(tt / per + 1e-9); if (tt < 0) tt = 0; }
      if (tt < rise) return v1 + (v2 - v1) * tt / rise;
      tt -= rise; if (tt < width - tol) return v2;
      tt -= width; if (tt < fall) return v2 + (v1 - v2) * tt / fall;
      return v1;
    };
    const offs = [0, rise, rise + width, rise + width + fall].filter(Number.isFinite);
    const next = t => {
      if (t < delay) return delay;
      const k = per > 0 ? Math.floor((t - delay) / per) : 0;
      for (let c = k; c <= k + 1; c++) { const base = delay + c * per; for (const o of offs) { const bp = base + o; if (bp > t) return bp; } if (!(per > 0)) break; }
      return Infinity;
    };
    const avg = per > 0 ? (v1 * (per - rise - width - fall) + v2 * width + 0.5 * (v1 + v2) * (rise + fall)) / per : (Number.isFinite(width) ? v1 : v2);
    return { at, avg, at0m: v1, next };
  }

  // ---- check(netlist) ----
  function checkNumber(kind, v) {
    const x = num(v);
    switch (kind) {
      case 'pos': return x > 0;
      case 'nonneg': return x >= 0;
      case 'unit': return x >= 0 && x <= 1;
      case 'bool': return typeof v === 'boolean';
      case 'rails': return Array.isArray(v) && v.length === 2 && num(v[0]) < num(v[1]);
      default: return Number.isFinite(x);
    }
  }
  function checkWave(v, path, E) {
    if (!isObj(v)) { if (!Number.isFinite(num(v))) E('value', path, 'needs a number or a waveform'); return; }
    const keys = Object.keys(v);
    if (keys.length !== 1 || !['dc', 'pulse', 'sine', 'pwm'].includes(keys[0])) { E('value', path, 'one of dc, pulse, sine, pwm'); return; }
    const kind = keys[0];
    if (kind === 'dc') { if (!Number.isFinite(num(v.dc))) E('value', path + '.dc', 'needs a number'); return; }
    const q = v[kind], F = WAVE_FIELDS[kind];
    if (!isObj(q)) { E('value', path + '.' + kind, 'needs an object'); return; }
    for (const k of Object.keys(q)) if (!Object.prototype.hasOwnProperty.call(F, k)) E('value', `${path}.${kind}.${k}`, 'unknown field');
    for (const [k, spec] of Object.entries(F)) {
      const must = spec.endsWith('!'), kd = must ? spec.slice(0, -1) : spec;
      if (q[k] === undefined) { if (must) E('value', `${path}.${kind}.${k}`, 'missing'); continue; }
      if (!checkNumber(kd, q[k])) E('value', `${path}.${kind}.${k}`, 'out of range');
    }
    if (kind === 'pulse' && q.period !== undefined) {
      const w = canonWave(v);
      if (w.rise + w.width + w.fall > w.period * (1 + 1e-12)) E('value', path + '.pulse', 'rise + width + fall > period');
    }
  }
  const EL_KEYS = new Set(['id', 'type', 'n', 'value', 'ic', 'params', 'preset', 'on', 'label', 'note']);
  function check(nl) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    if (!isObj(nl)) { E('format', '', 'netlist is not an object'); return P; }
    if (nl.format !== undefined && nl.format !== FORMAT) E('format', 'format', 'not ' + FORMAT);
    if (!Array.isArray(nl.nodes)) E('format', 'nodes', 'not an array');
    if (!Array.isArray(nl.elements)) E('format', 'elements', 'not an array');
    if (P.length) return P;
    for (const k of Object.keys(nl)) if (!['format', 'nodes', 'elements', 'meta'].includes(k)) W('unknown-field', k, 'ignored');
    const names = new Set(), labels = new Map(), nodeAt = new Map();
    nl.nodes.forEach((x, i) => {
      const nm = typeof x === 'string' ? x : isObj(x) ? x.name : undefined;
      if (typeof nm !== 'string' || !NODE_RE.test(nm)) { E('node-name', `nodes[${i}]`, 'bad node name'); return; }
      if (names.has(nm) || labels.has(nm)) { E('dup-node', `nodes[${i}]`, 'duplicate node ' + nm); return; }
      if (isObj(x) && x.probe !== undefined) {
        if (isGnd(nm)) { E('node-name', `nodes[${i}]`, 'ground cannot be a label'); return; }
        labels.set(nm, { to: x.probe, i });
      } else { names.add(nm); nodeAt.set(nm, i); }
    });
    for (const [, { to, i }] of labels) if (typeof to !== 'string' || !(names.has(to) || isGnd(to))) E('unknown-node', `nodes[${i}].probe`, 'label of an unknown node');
    if ([...names].filter(s => !isGnd(s)).length > MAX_NODES) E('size', 'nodes', 'more than ' + MAX_NODES + ' nodes');
    if (nl.elements.length > MAX_ELEMENTS) E('size', 'elements', 'more than ' + MAX_ELEMENTS + ' elements');
    const ids = new Set();
    nl.elements.forEach((el, i) => {
      const at = `elements[${i}]`;
      if (!isObj(el)) { E('format', at, 'element is not an object'); return; }
      for (const k of Object.keys(el)) if (!EL_KEYS.has(k)) W('unknown-field', `${at}.${k}`, 'ignored');
      if (typeof el.id !== 'string' || !ID_RE.test(el.id)) E('id', at + '.id', 'bad id');
      else if (ids.has(el.id)) E('dup-id', at + '.id', 'duplicate id ' + el.id); else ids.add(el.id);
      const t = el.type;
      if (!Object.prototype.hasOwnProperty.call(TYPES, t)) { E('type', at + '.type', 'unknown type'); return; }
      if (!Array.isArray(el.n) || !TYPES[t].includes(el.n.length)) { E('pins', at + '.n', 'wrong number of terminals'); return; }
      el.n.forEach((m, k) => {
        if (labels.has(m)) E('probe-only', `${at}.n[${k}]`, 'a probe-only label cannot be a terminal');
        else if (typeof m !== 'string' || !(names.has(m) || isGnd(m))) E('unknown-node', `${at}.n[${k}]`, 'unknown node ' + m);
      });
      if (t === 'R' || t === 'C' || t === 'L') {
        if (el.value === undefined) E('value', at + '.value', 'missing value');
        else if (!(num(el.value) > 0)) E('value', at + '.value', 'needs a positive number');
        if (el.ic !== undefined && (t === 'R' || !Number.isFinite(num(el.ic)))) E('value', at + '.ic', 'needs a number');
      } else if (t === 'V' || t === 'I') {
        if (el.value === undefined) E('value', at + '.value', 'missing value'); else checkWave(el.value, at + '.value', E);
      } else if (el.value !== undefined) E('value', at + '.value', 'this type takes params, not a value');
      if (el.ic !== undefined && t !== 'C' && t !== 'L') E('value', at + '.ic', 'only C and L have ic');
      if (el.on !== undefined && (t !== 'SW' || typeof el.on !== 'boolean')) E('value', at + '.on', 'only SW has on (true/false)');
      if (el.preset !== undefined && !(PRESETS[t] && Object.prototype.hasOwnProperty.call(PRESETS[t], el.preset))) E('preset', at + '.preset', 'unknown preset');
      if (el.params !== undefined) {
        if (!isObj(el.params)) E('param', at + '.params', 'not an object');
        else for (const [k, v] of Object.entries(el.params)) {
          const kd = Object.prototype.hasOwnProperty.call(PARAMS[t], k) ? PARAMS[t][k] : null;
          if (!kd) E('param', `${at}.params.${k}`, 'unknown parameter');
          else if (!checkNumber(kd, v)) E('param', `${at}.params.${k}`, 'out of range');
        }
      }
    });
    if (P.some(p => p.level === 'error')) return P;
    // the graph: ground, loops of voltage-defined branches, nodes without a DC path to ground
    const els = nl.elements, G0 = 'gnd', key = s => (isGnd(s) ? G0 : s);
    if (els.length && !els.some(el => el.n.some(isGnd))) E('no-ground', 'elements', 'no element touches ground');
    const uf = () => { const p = new Map(); const f = s => { s = key(s); while (p.has(s) && p.get(s) !== s) s = p.get(s); return s; }; return { f, u: (a, b) => { const x = f(a), y = f(b); if (x === y) return false; p.set(x, y); return true; } }; };
    const VL = uf(), DCP = uf();
    els.forEach((el, i) => {
      const n = el.n;
      if ((el.type === 'V' || el.type === 'L') && !VL.u(n[0], n[1])) E('vloop', `elements[${i}]`, 'loop of voltage sources / inductors');
      if (el.type === 'OPAMP' && !VL.u(n[2], G0)) E('vloop', `elements[${i}]`, 'op-amp output on a voltage-defined node');
      if (n.length === 2 && el.type !== 'V' && el.type !== 'L' && key(n[0]) === key(n[1])) W('self-loop', `elements[${i}]`, 'both terminals on one node');
      if (['R', 'L', 'V', 'D', 'SW'].includes(el.type)) DCP.u(n[0], n[1]);
      else if (el.type === 'NPN' || el.type === 'PNP') { DCP.u(n[0], n[1]); DCP.u(n[1], n[2]); }
      else if (el.type === 'NMOS' || el.type === 'PMOS') DCP.u(n[0], n[2]);
      else if (el.type === 'OPAMP') DCP.u(n[2], G0);
    });
    const used = new Set(); els.forEach(el => el.n.forEach(m => used.add(key(m))));
    for (const nm of names) {
      if (isGnd(nm)) continue;
      if (!used.has(nm)) W('unused', `nodes[${nodeAt.get(nm)}]`, 'no element uses ' + nm);
      else if (DCP.f(nm) !== DCP.f(G0)) W('floating', `nodes[${nodeAt.get(nm)}]`, 'no DC path to ground from ' + nm);
    }
    return P;
  }

  // ---- compile: faults applied, nodes indexed, element models built ----
  const parsePinRef = s => { const m = /^(.*)\.(\d+)$/.exec(String(s)); return m ? [m[1], +m[2]] : [String(s), undefined]; };
  function normalize(el) {
    const t = el.type, d = { id: el.id, type: t, n: el.n.slice(), p: {} };
    if (t === 'R' || t === 'C' || t === 'L') { d.p.value = num(el.value); if (el.ic !== undefined) d.p.ic = num(el.ic); }
    else if (t === 'V' || t === 'I') d.p.value = canonWave(el.value);
    else {
      Object.assign(d.p, DEFAULTS[t], el.preset ? PRESETS[t][el.preset] : null);
      for (const [k, v] of Object.entries(el.params || {})) d.p[k] = k === 'rails' ? [num(v[0]), num(v[1])] : num(v);
    }
    if (t === 'SW') d.on = el.on !== false;
    return d;
  }
  function compile(nl, faults) {
    const declared = [], labelOf = new Map();
    for (const x of nl.nodes) {
      const nm = typeof x === 'string' ? x : x.name;
      if (isObj(x) && x.probe !== undefined) labelOf.set(nm, x.probe); else declared.push(nm);
    }
    const els = nl.elements.map(normalize), byId = new Map(els.map(e => [e.id, e])), extra = [];
    const same = (m, node) => m === node || (isGnd(m) && isGnd(node));
    const known = s => typeof s === 'string' && (isGnd(s) || declared.includes(s));
    (faults || []).forEach((f, fi) => {
      if (!isObj(f) || f.kind !== 'open-trace') return;
      if (!known(f.node)) throw fail('fault', { index: fi });
      const far = '#trace:' + fi;
      let side = f.side;
      if (side === undefined) {
        const touching = els.filter(e => e.n.some(m => same(m, f.node)));
        if (touching.length < 2) throw fail('fault', { index: fi });
        side = [touching[touching.length - 1].id];
      }
      if (!Array.isArray(side) || !side.length) throw fail('fault', { index: fi });
      for (const s of side) {
        const [eid, pin] = parsePinRef(s), e = byId.get(eid);
        if (!e) throw fail('fault', { index: fi });
        if (pin === undefined) { if (!e.n.some(m => same(m, f.node))) throw fail('fault', { index: fi }); e.n = e.n.map(m => (same(m, f.node) ? far : m)); }
        else { if (!(pin < e.n.length) || !same(e.n[pin], f.node)) throw fail('fault', { index: fi }); e.n[pin] = far; }
      }
    });
    for (const e of els) e.board = e.n.slice();   // where the legs are soldered: pin references "@R1.0" measure here
    (faults || []).forEach((f, fi) => {
      if (!isObj(f)) throw fail('fault', { index: fi });
      if (f.kind === 'open-trace') return;
      const e = byId.get(f.element);
      if (!e) throw fail('fault', { index: fi });
      if (f.kind === 'open') {
        const pins = f.pin !== undefined ? [f.pin] : e.n.map((_, k) => k);
        for (const k of pins) { if (!(Number.isInteger(k) && k >= 0 && k < e.n.length)) throw fail('fault', { index: fi }); e.n[k] = '#open:' + fi + '.' + k; }
      } else if (f.kind === 'short') {
        const pins = f.pins || SHORT_PINS[e.type] || [0, 1];
        if (!Array.isArray(pins) || pins.length !== 2 || !pins.every(k => Number.isInteger(k) && k >= 0 && k < e.n.length) || pins[0] === pins[1]) throw fail('fault', { index: fi });
        if (e.n.length === 2) { e.type = 'R'; e.p = { value: RSHORT }; }
        else extra.push({ id: '#short:' + fi, type: 'R', n: [e.n[pins[0]], e.n[pins[1]]], board: [], p: { value: RSHORT } });
      } else if (f.kind === 'drift') {
        const factor = f.factor === undefined ? 2 : num(f.factor), param = f.param || DRIFT_PARAM[e.type];
        if (!(factor > 0)) throw fail('fault', { index: fi });
        if (param === 'value' && (e.type === 'V' || e.type === 'I')) e.p.value = scaleWave(e.p.value, factor);
        else if (typeof e.p[param] === 'number') e.p[param] *= factor;
        else if (param === 'rails' && Array.isArray(e.p.rails)) e.p.rails = e.p.rails.map(v => v * factor);
        else throw fail('fault', { index: fi });
      } else throw fail('fault', { index: fi });
    });
    const all = els.concat(extra);
    // node indices: declared names first (ground = −1), then the private nodes the faults made
    const index = new Map(); let N = 0;
    const idx = nm => { if (isGnd(nm)) return -1; if (!index.has(nm)) index.set(nm, N++); return index.get(nm); };
    declared.forEach(idx);
    for (const e of all) e.n.forEach(idx);
    let nb = 0;
    for (const e of all) {
      e.pins = e.n.map(idx); e.boardPins = e.board.map(idx); e.k = -1;
      const p = e.p, t = e.type;
      e.a = e.pins[0]; e.c = e.pins[1]; e.d = e.pins.length > 2 ? e.pins[2] : -1;
      if (t === 'R') e.g = 1 / p.value;
      else if (t === 'SW') e.g = 1 / (e.on ? p.Ron : p.Roff);
      else if (t === 'C') { e.C = p.value; e.ic = p.ic === undefined ? null : p.ic; if (e.ic !== null) e.k = nb++; }
      else if (t === 'L') { e.L = p.value; e.ic = p.ic === undefined ? null : p.ic; e.k = nb++; }
      else if (t === 'V') { e.w = wave(p.value); e.k = nb++; }
      else if (t === 'I') e.w = wave(p.value);
      else if (t === 'D') { e.Is = p.Is; e.nvt = p.n * VT; e.vcrit = e.nvt * Math.log(e.nvt / (Math.SQRT2 * e.Is)); e.s = { v: 0 }; }
      else if (t === 'NPN' || t === 'PNP') { e.pol = t === 'NPN' ? 1 : -1; e.Is = p.Is; e.bf = p.betaF; e.br = p.betaR; e.vcrit = VT * Math.log(VT / (Math.SQRT2 * e.Is)); e.s = { vbe: 0, vbc: 0 }; }
      else if (t === 'NMOS' || t === 'PMOS') { e.pol = t === 'NMOS' ? 1 : -1; e.vth = Math.abs(p.Vth); e.kp = p.k; e.lam = p.lambda; }
      else if (t === 'OPAMP') { e.A = p.gain; e.lo = p.rails[0]; e.hi = p.rails[1]; e.head = p.headroom; e.rp = e.pins.length === 5 ? e.pins[3] : null; e.rn = e.pins.length === 5 ? e.pins[4] : null; e.k = nb++; }
    }
    for (const e of all) if (e.k >= 0) e.k += N;
    const outNames = declared.slice(); if (!outNames.some(isGnd)) outNames.push('gnd');
    for (const l of labelOf.keys()) outNames.push(l);
    const resolveName = nm => (isGnd(nm) ? -1 : labelOf.has(nm) ? idx(labelOf.get(nm)) : index.get(nm));
    return { N, S: N + nb, els: all, real: all.filter(e => e.id[0] !== '#'), byId, index, outNames, resolveName,
      linear: !all.some(e => NONLINEAR.has(e.type)), sources: all.filter(e => e.w) };
  }

  // ---- dense LU with partial pivoting ----
  function factor(M, n, perm) {
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(M[k * n + k]);
      for (let i = k + 1; i < n; i++) { const a = Math.abs(M[i * n + k]); if (a > mx) { mx = a; p = i; } }
      if (!(mx > 1e-20)) return false;
      perm[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t; }
      const piv = M[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = M[i * n + k] / piv; M[i * n + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      }
    }
    return true;
  }
  function subst(M, n, perm, b, x) {
    x.set(b);
    for (let k = 0; k < n; k++) { const p = perm[k]; if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; } }
    for (let i = 1; i < n; i++) { let s = x[i]; for (let j = 0; j < i; j++) s -= M[i * n + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j]; x[i] = s / M[i * n + i]; }
  }

  // ---- device equations ----
  const ex = a => (a < 80 ? Math.exp(a) : EX80 * (1 + a - 80));
  const dex = a => (a < 80 ? Math.exp(a) : EX80);
  function pnjlim(vnew, vold, vt, vcrit) {   // SPICE junction limiting
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) { const arg = 1 + (vnew - vold) / vt; return arg > 0 ? vold + vt * Math.log(arg) : vcrit; }
      return vt * Math.log(vnew / vt);
    }
    return vnew;
  }
  function bjt(e, vbe, vbc, q) {
    const ef = ex(vbe / VT), er = ex(vbc / VT), df = dex(vbe / VT) / VT, dr = dex(vbc / VT) / VT;
    q.ibe = e.Is / e.bf * (ef - 1); q.gbe = e.Is / e.bf * df;
    q.ibc = e.Is / e.br * (er - 1); q.gbc = e.Is / e.br * dr;
    q.ict = e.Is * (ef - er); q.gmf = e.Is * df; q.gmr = e.Is * dr;
    return q;
  }
  function mos(e, vgs, vds, q) {
    const vov = vgs - e.vth, k = e.kp, lam = e.lam;
    if (vov <= 0) { q.id = 0; q.gm = 0; q.gds = 0; }
    else if (vds < vov) { const l = 1 + lam * vds, base = vov * vds - vds * vds / 2; q.id = k * base * l; q.gm = k * vds * l; q.gds = k * (vov - vds) * l + k * base * lam; }
    else { const l = 1 + lam * vds; q.id = k / 2 * vov * vov * l; q.gm = k * vov * l; q.gds = k / 2 * vov * vov * lam; }
    return q;
  }

  // ---- seeded noise ----
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function hash32(s, seed) { let h = (2166136261 ^ (seed >>> 0)) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- the simulator ----
  function makeSim(ck, noise) {
    const { N, S } = ck;
    const A = new Float64Array(S * S), B = new Float64Array(S), X = new Float64Array(S), Xn = new Float64Array(S), LU = new Float64Array(S * S), perm = new Int32Array(S);
    let luKey = null, limited = false;
    const q = {};
    const vx = (x, i) => (i < 0 ? 0 : x[i]);
    function G(a, c, g) { if (a >= 0) { A[a * S + a] += g; if (c >= 0) { A[a * S + c] -= g; A[c * S + a] -= g; } } if (c >= 0) A[c * S + c] += g; }
    function J(a, c, i) { if (a >= 0) B[a] -= i; if (c >= 0) B[c] += i; }   // a constant current a → c through the element
    function VC(a, c, p, r, g) {   // a current g·(v_p − v_r) from a to c
      if (a >= 0) { if (p >= 0) A[a * S + p] += g; if (r >= 0) A[a * S + r] -= g; }
      if (c >= 0) { if (p >= 0) A[c * S + p] -= g; if (r >= 0) A[c * S + r] += g; }
    }
    function BR(a, c, k) { if (a >= 0) A[a * S + k] += 1; if (c >= 0) A[c * S + k] -= 1; }   // the branch current k leaves a, enters c
    function ROWV(k, a, c) { if (a >= 0) A[k * S + a] += 1; if (c >= 0) A[k * S + c] -= 1; }
    const srcVal = (e, ctx) => (ctx.mode === 'ohm' ? 0 : ctx.src * (ctx.avg ? e.w.avg : ctx.t0m ? e.w.at0m : e.w.at(ctx.t)));

    function stamp(ctx, x) {
      A.fill(0); B.fill(0); limited = false;
      const gs = GMIN + ctx.gsh, tran = ctx.mode === 'tran', ohm = ctx.mode === 'ohm', op0 = ctx.mode === 'op0';
      for (let i = 0; i < N; i++) A[i * S + i] += gs;
      for (const e of ck.els) {
        const a = e.a, c = e.c, k = e.k;
        switch (e.type) {
          case 'R': case 'SW': G(a, c, e.g); break;
          case 'C':
            if (k >= 0) { if (op0) { BR(a, c, k); ROWV(k, a, c); B[k] = e.ic; } else A[k * S + k] = 1; }
            if (tran) { const geq = (ctx.be ? 1 : 2) * e.C / ctx.h, ieq = geq * e.vp + (ctx.be ? 0 : e.ip); G(a, c, geq); J(a, c, -ieq); }
            break;
          case 'L':
            BR(a, c, k);
            if (op0 && e.ic !== null) { A[k * S + k] = 1; B[k] = e.ic; break; }
            ROWV(k, a, c);
            if (tran) { const req = (ctx.be ? 1 : 2) * e.L / ctx.h; A[k * S + k] -= req; B[k] = -req * e.ip - (ctx.be ? 0 : e.vp); }
            break;
          case 'V': BR(a, c, k); ROWV(k, a, c); B[k] = srcVal(e, ctx); break;
          case 'I': J(a, c, -srcVal(e, ctx)); break;   // drives the current into n[0]
          case 'D': {
            const v = vx(x, a) - vx(x, c), vl = pnjlim(v, e.s.v, e.nvt, e.vcrit);
            if (vl !== v) limited = true; e.s.v = vl;
            const g0 = e.Is * dex(vl / e.nvt) / e.nvt;
            G(a, c, g0 + GMIN); J(a, c, e.Is * (ex(vl / e.nvt) - 1) - g0 * vl);
            break;
          }
          case 'NPN': case 'PNP': {
            const p = e.pol, C_ = a, B_ = c, E_ = e.d, vb = vx(x, B_);
            const r1 = p * (vb - vx(x, E_)), r2 = p * (vb - vx(x, C_));
            const vbe = pnjlim(r1, e.s.vbe, VT, e.vcrit), vbc = pnjlim(r2, e.s.vbc, VT, e.vcrit);
            if (vbe !== r1 || vbc !== r2) limited = true; e.s.vbe = vbe; e.s.vbc = vbc;
            bjt(e, vbe, vbc, q);
            G(B_, E_, q.gbe + GMIN); J(B_, E_, p * (q.ibe - q.gbe * vbe));
            G(B_, C_, q.gbc + GMIN); J(B_, C_, p * (q.ibc - q.gbc * vbc));
            VC(C_, E_, B_, E_, q.gmf); VC(C_, E_, B_, C_, -q.gmr); J(C_, E_, p * (q.ict - q.gmf * vbe + q.gmr * vbc));
            break;
          }
          case 'NMOS': case 'PMOS': {
            const p = e.pol, D_ = a, G_ = c, S_ = e.d, vd = vx(x, D_), vs = vx(x, S_);
            const sw = p * (vd - vs) < 0, dd = sw ? S_ : D_, ss = sw ? D_ : S_, vss = sw ? vd : vs;
            const vgs = p * (vx(x, G_) - vss), vds = p * ((sw ? vs : vd) - vss);
            mos(e, vgs, vds, q);
            VC(dd, ss, G_, ss, q.gm); G(dd, ss, q.gds + GMIN); J(dd, ss, p * (q.id - q.gm * vgs - q.gds * vds));
            break;
          }
          case 'OPAMP': {
            const out = e.d; BR(out, -1, k);
            if (ohm) { A[k * S + k] = 1; break; }
            const vp = vx(x, a), vn = vx(x, c), rails = e.rp !== null;
            const hi = rails ? vx(x, e.rp) : e.hi, lo = rails ? vx(x, e.rn) : e.lo;
            let hh = (hi - lo) / 2 - e.head, dh = 1; if (hh < 1e-3) { hh = 1e-3; dh = 0; }
            // linear (exact gain A) up to a knee m below the rail, then an exponential approach: smooth, C¹, bounded
            const vd = vp - vn, y = e.A * vd, m = Math.min(0.05, hh / 2), knee = hh - m, ay = Math.abs(y);
            let f = (hi + lo) / 2, fd = e.A, fh = 0;
            if (ay <= knee) f += y;
            else { const sg = y < 0 ? -1 : 1, ez = Math.exp(-(ay - knee) / m); f += sg * (hh - m * ez); fd = e.A * ez; fh = dh * sg * (1 - ez); }
            if (out >= 0) A[k * S + out] += 1;
            if (a >= 0) A[k * S + a] -= fd; if (c >= 0) A[k * S + c] += fd;
            let rhs = f - fd * vd;
            if (rails) {
              const dhi = 0.5 + 0.5 * fh, dlo = 0.5 - 0.5 * fh;
              if (e.rp >= 0) A[k * S + e.rp] -= dhi; if (e.rn >= 0) A[k * S + e.rn] -= dlo;
              rhs -= dhi * hi + dlo * lo;
            }
            B[k] = rhs;
            break;
          }
        }
      }
      if (ohm) { const { a, b } = ctx.test; if (a >= 0) B[a] += OHM_I; if (b >= 0) B[b] -= OHM_I; }
    }

    function newton(ctx, x0, maxIt) {
      X.set(x0);
      const key = ck.linear ? `${ctx.mode}|${ctx.be}|${ctx.h}|${ctx.gsh}` : null;
      for (let it = 0; it < maxIt; it++) {
        stamp(ctx, X);
        if (!(key && key === luKey)) {
          LU.set(A); luKey = null;
          if (!factor(LU, S, perm)) { if (ck.linear) throw fail('singular'); return false; }
          luKey = key;
        }
        subst(LU, S, perm, B, Xn);
        let conv = true;
        for (let i = 0; i < S; i++) {
          const v = Xn[i];
          if (!Number.isFinite(v)) return false;
          if (conv && Math.abs(v - X[i]) > (i < N ? 1e-6 : 1e-9) + 1e-6 * Math.abs(v)) conv = false;
        }
        X.set(Xn);
        if (ck.linear || (conv && !limited)) return true;
      }
      return false;
    }
    /** an operating point; Newton, then gmin stepping, then source stepping */
    function op(ctx) {
      const zero = new Float64Array(S);
      ctx.gsh = 0; ctx.src = 1;
      if (newton(ctx, zero, 150)) return Float64Array.from(X);
      let xg = zero, ok = true;
      for (let i = 2; i <= 12 && ok; i++) { ctx.gsh = Math.pow(10, -i); if (newton(ctx, xg, 150)) xg = Float64Array.from(X); else ok = false; }
      ctx.gsh = 0;
      if (ok && newton(ctx, xg, 150)) return Float64Array.from(X);
      xg = zero; ok = true;
      for (let s = 1; s <= 10 && ok; s++) { ctx.src = s / 10; if (newton(ctx, xg, 150)) xg = Float64Array.from(X); else ok = false; }
      ctx.src = 1;
      if (ok) return xg;
      throw fail('no-convergence', { mode: ctx.mode });
    }

    /** the pin currents of an element at the solution x (current into each pin) */
    function pinCurrents(e, x, ctx) {
      const a = e.a, c = e.c, va = vx(x, a), vc = vx(x, c);
      switch (e.type) {
        case 'R': case 'SW': { const i = (va - vc) * e.g; return [i, -i]; }
        case 'C': { const i = ctx.mode === 'tran' ? e.ip : 0; return [i, -i]; }
        case 'L': case 'V': return [x[e.k], -x[e.k]];
        case 'I': { const j = srcVal(e, ctx); return [-j, j]; }
        case 'D': { const v = va - vc, i = e.Is * (ex(v / e.nvt) - 1) + GMIN * v; return [i, -i]; }
        case 'NPN': case 'PNP': {
          const p = e.pol, vb = vc, vcol = va, ve = vx(x, e.d);
          bjt(e, p * (vb - ve), p * (vb - vcol), q);
          const ic = p * (q.ict - q.ibc), ib = p * (q.ibe + q.ibc);
          return [ic, ib, -(ic + ib)];
        }
        case 'NMOS': case 'PMOS': {
          const p = e.pol, vd = va, vs = vx(x, e.d), sw = p * (vd - vs) < 0, vss = sw ? vd : vs;
          mos(e, p * (vc - vss), p * ((sw ? vs : vd) - vss), q);
          const id = (sw ? -1 : 1) * p * q.id + GMIN * (vd - vs);
          return [id, 0, -id];
        }
        case 'OPAMP': return e.pins.map((_, i) => (i === 2 ? x[e.k] : 0));
      }
      return e.pins.map(() => 0);
    }
    const mainCurrent = (e, pins) => (e.type === 'OPAMP' ? pins[2] : pins[0]);

    // ---- results ----
    const dcCache = {};
    function dcX(mode) {
      if (!dcCache[mode]) {
        const ctx = { mode: 'op', avg: mode !== 't0', t0m: mode === 't0', t: 0, gsh: 0, src: 1 };
        dcCache[mode] = { x: op(ctx), ctx };
      }
      return dcCache[mode];
    }
    function dc(opts) {
      const mode = opts && opts.mode === 't0' ? 't0' : 'avg';
      const { x, ctx } = dcX(mode), nodes = {}, branches = {}, pins = {};
      for (const nm of ck.outNames) nodes[nm] = vx(x, ck.resolveName(nm));
      for (const e of ck.real) { const pc = pinCurrents(e, x, ctx); pins[e.id] = pc; branches[e.id] = mainCurrent(e, pc); }
      return { nodes, branches, pins };
    }

    let tranCache = null;
    function runTransient(o) {
      o = o || {};
      const dt = num(o.dt), tEnd = num(o.tEnd), maxSteps = o.maxSteps === undefined ? MAX_STEPS : num(o.maxSteps);
      if (!(dt > 0) || !(tEnd > 0)) throw fail('bad-args');
      const steps = Math.ceil(tEnd / dt - 1e-9);
      if (!(maxSteps > 0) || maxSteps > MAX_STEPS || steps > maxSteps) throw fail('budget', { steps, limit: Math.min(maxSteps, MAX_STEPS) || MAX_STEPS });
      const key = `${dt}|${tEnd}|${!!o.uic}`;
      if (tranCache && tranCache.key === key) return tranCache;
      const caps = ck.els.filter(e => e.type === 'C'), inds = ck.els.filter(e => e.type === 'L');
      let x;
      if (o.uic) {
        x = new Float64Array(S);
        for (const e of caps) { e.vp = e.ic === null ? 0 : e.ic; e.ip = 0; }
        for (const e of inds) { e.ip = e.ic === null ? 0 : e.ic; e.vp = 0; }
      } else {
        x = op({ mode: 'op0', t0m: true, t: 0, gsh: 0, src: 1 });
        for (const e of caps) { e.vp = vx(x, e.a) - vx(x, e.c); e.ip = 0; }
        for (const e of inds) { e.ip = x[e.k]; e.vp = vx(x, e.a) - vx(x, e.c); }
      }
      const V = []; for (let i = 0; i < N; i++) { V.push(new Float64Array(steps + 1)); V[i][0] = x[i]; }
      const I = ck.real.map(e => { const arr = new Float64Array(steps + 1); arr[0] = mainCurrent(e, pinCurrents(e, x, { mode: 'op', t0m: true, t: 0, src: 1 })); return arr; });
      const tol = 1e-6 * dt;
      const nextBp = t => { let m = Infinity; for (const e of ck.sources) { const b = e.w.next(t); if (b < m) m = b; } return m; };
      let bp = nextBp(-tol);   // a breakpoint at t = 0 makes the first step backward Euler anyway
      const ctx = { mode: 'tran', t: 0, h: dt, be: true, gsh: 0, src: 1, avg: false, t0m: false };
      let xs = x;
      for (let s = 0; s < steps; s++) {
        const t1 = (s + 1) * dt;
        ctx.t = t1; ctx.be = s === 0 || bp <= t1 + tol;
        if (bp <= t1 + tol) bp = nextBp(t1 + tol);
        ctx.gsh = 0;
        if (!newton(ctx, xs, 60)) {
          let ok = true, xg = xs;
          for (let i = 3; i <= 12 && ok; i++) { ctx.gsh = Math.pow(10, -i); if (newton(ctx, xg, 100)) xg = Float64Array.from(X); else ok = false; }
          ctx.gsh = 0;
          if (!ok || !newton(ctx, xg, 100)) throw fail('no-convergence', { t: t1 });
        }
        xs = Float64Array.from(X);
        for (const e of caps) {
          const v = vx(xs, e.a) - vx(xs, e.c), geq = (ctx.be ? 1 : 2) * e.C / dt;
          e.ip = geq * (v - e.vp) - (ctx.be ? 0 : e.ip); e.vp = v;
        }
        for (const e of inds) { e.ip = xs[e.k]; e.vp = vx(xs, e.a) - vx(xs, e.c); }
        for (let i = 0; i < N; i++) V[i][s + 1] = xs[i];
        ck.real.forEach((e, j) => { I[j][s + 1] = mainCurrent(e, pinCurrents(e, xs, ctx)); });
      }
      const T = new Float64Array(steps + 1); for (let s = 0; s <= steps; s++) T[s] = s * dt;
      tranCache = { key, T, V, I, steps };
      return tranCache;
    }
    function transient(o) {
      const r = runTransient(o), zero = Array.from(new Float64Array(r.steps + 1)), nodes = {}, branches = {};
      for (const nm of ck.outNames) { const i = ck.resolveName(nm); nodes[nm] = i < 0 ? zero.slice() : Array.from(r.V[i]); }
      ck.real.forEach((e, j) => { branches[e.id] = Array.from(r.I[j]); });
      return { t: Array.from(r.T), nodes, branches };
    }

    // ---- instruments ----
    function where(ref) {
      if (typeof ref !== 'string') throw fail('unknown-node', { ref });
      if (ref[0] === '@') {
        const [eid, pin] = parsePinRef(ref.slice(1)), e = ck.byId.get(eid);
        if (!e || pin === undefined || !(pin < e.boardPins.length)) throw fail('unknown-node', { ref });
        return e.boardPins[pin];
      }
      const i = ck.resolveName(ref);
      if (i === undefined) throw fail('unknown-node', { ref });
      return i;
    }
    const rngFor = probe => (noise ? mulberry32(hash32(JSON.stringify(probe), noise.seed)) : null);
    const jit = (v, r) => (r ? v * (1 + noise.rel * (2 * r() - 1)) + noise.abs * (2 * r() - 1) : v);
    function window_(probe) {
      const tEnd = num(probe.tEnd), dt = probe.dt === undefined ? tEnd / 1000 : num(probe.dt), tStart = probe.tStart === undefined ? 0 : num(probe.tStart);
      const r = runTransient({ dt, tEnd, maxSteps: probe.maxSteps, uic: probe.uic });
      let s0 = 0; while (s0 < r.steps && r.T[s0] < tStart - 1e-9 * dt) s0++;
      return { r, s0 };
    }
    const trace = (r, i) => (i < 0 ? new Float64Array(r.steps + 1) : r.V[i]);
    function stats(t, v) {
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0;
      for (const y of v) { if (y < mn) mn = y; if (y > mx) mx = y; sum += y; sq += y * y; }
      const n = v.length, mean = sum / n, pp = mx - mn, mid = (mx + mn) / 2, hyst = 0.1 * pp;
      const ups = []; let high = v[0] > mid;
      for (let i = 1; i < n; i++) {
        if (!high && v[i] > mid + hyst / 2) { high = true; let j = i; while (j > 0 && v[j - 1] > mid) j--; const y0 = v[j - 1 < 0 ? 0 : j - 1], y1 = v[j]; ups.push(j > 0 && y1 !== y0 ? t[j - 1] + (mid - y0) / (y1 - y0) * (t[j] - t[j - 1]) : t[j]); }
        else if (high && v[i] < mid - hyst / 2) high = false;
      }
      const freq = pp > 0 && ups.length >= 2 ? (ups.length - 1) / (ups[ups.length - 1] - ups[0]) : 0;
      return { min: mn, max: mx, mean, pp, rms: Math.sqrt(sq / n), freq };
    }
    function measure(probe) {
      if (!isObj(probe)) throw fail('probe');
      const r = rngFor(probe);
      switch (probe.kind) {
        case 'V': {
          const ia = where(probe.a), ib = where(probe.b === undefined ? 'gnd' : probe.b), { x } = dcX('avg');
          return { kind: 'V', value: jit(vx(x, ia) - vx(x, ib), r), unit: 'V' };
        }
        case 'I': {
          const e = ck.byId.get(probe.element); if (!e) throw fail('unknown-element', { ref: probe.element });
          const { x, ctx } = dcX('avg'), pc = pinCurrents(e, x, ctx);
          if (probe.pin !== undefined && !(probe.pin >= 0 && probe.pin < pc.length)) throw fail('probe');
          return { kind: 'I', value: jit(probe.pin === undefined ? mainCurrent(e, pc) : pc[probe.pin], r), unit: 'A' };
        }
        case 'R': {
          const ia = where(probe.a), ib = where(probe.b === undefined ? 'gnd' : probe.b);
          let R = 0;
          if (ia !== ib) { const x = op({ mode: 'ohm', test: { a: ia, b: ib }, avg: true, t: 0, gsh: 0, src: 1 }); R = (vx(x, ia) - vx(x, ib)) / OHM_I; }
          return { kind: 'R', value: Math.abs(R) > OHM_OL ? 'OL' : jit(R, r), unit: 'ohm' };
        }
        case 'scope': {
          const { r: tr, s0 } = window_(probe), ia = where(probe.node), ib = where(probe.ref === undefined ? 'gnd' : probe.ref);
          const va = trace(tr, ia), vb = trace(tr, ib), t = [], v = [];
          for (let s = s0; s <= tr.steps; s++) { t.push(tr.T[s]); v.push(jit(va[s] - vb[s], r)); }
          return { kind: 'scope', t, v, unit: 'V', stats: stats(t, v) };
        }
        case 'logic': {
          if (!Array.isArray(probe.nodes) || !probe.nodes.length) throw fail('probe');
          const th = probe.threshold === undefined ? 1.5 : num(probe.threshold), { r: tr, s0 } = window_(probe);
          const t = Array.from(tr.T.subarray(s0)), traces = {}, edges = {}, st = {};
          for (const nm of probe.nodes) {
            const v = trace(tr, where(nm)), bits = [], ed = [];
            for (let s = s0; s <= tr.steps; s++) {
              const b = v[s] > th ? 1 : 0; bits.push(b);
              if (s > s0 && b !== bits[bits.length - 2]) {
                const y0 = v[s - 1], y1 = v[s], tt = y1 !== y0 ? tr.T[s - 1] + (th - y0) / (y1 - y0) * (tr.T[s] - tr.T[s - 1]) : tr.T[s];
                ed.push({ t: tt, to: b });
              }
            }
            traces[nm] = bits; edges[nm] = ed;
            const ups = ed.filter(z => z.to === 1);
            let freq = 0, duty = bits.reduce((p, b) => p + b, 0) / bits.length;
            if (ups.length >= 2) {
              const t0 = ups[0].t, t1 = ups[ups.length - 1].t; freq = (ups.length - 1) / (t1 - t0);
              let hi = 0, lvl = 1, tp = t0;
              for (const z of ed) { if (z.t <= t0) continue; if (z.t > t1) break; if (lvl) hi += z.t - tp; lvl = z.to; tp = z.t; }
              duty = hi / (t1 - t0);
            }
            st[nm] = { freq, duty, edges: ed.length };
          }
          return { kind: 'logic', t, traces, edges, stats: st, threshold: th };
        }
      }
      throw fail('probe');
    }
    return { dc, transient, measure };
  }

  function create(netlist, opts) {
    opts = opts || {};
    const problems = check(netlist);
    if (problems.some(p => p.level === 'error')) throw fail('invalid', { problems });
    if (opts.faults !== undefined && !Array.isArray(opts.faults)) throw fail('fault', { index: -1 });
    const faults = JSON.parse(JSON.stringify(opts.faults || []));
    let noise = null;
    if (opts.noise) {
      const rel = num(opts.noise.rel === undefined ? 0 : opts.noise.rel), abs = num(opts.noise.abs === undefined ? 0 : opts.noise.abs);
      if (!(rel >= 0) || !(abs >= 0)) throw fail('bad-args');
      noise = { rel, abs, seed: (opts.noise.seed !== undefined ? num(opts.noise.seed) : opts.seed !== undefined ? num(opts.seed) : 1) >>> 0 };
    }
    let nl = JSON.parse(JSON.stringify(netlist)), inner = makeSim(compile(nl, faults), noise);
    return Object.freeze({
      id: ID,
      dc: o => inner.dc(o),
      transient: o => inner.transient(o),
      measure: p => inner.measure(p),
      /** the learner flips a switch or turns a knob: {on} for SW, {value} for R, C, L, V, I */
      set(id, patch) {
        const el = nl.elements.find(e => e.id === id);
        if (!el || !isObj(patch)) throw fail('unknown-element', { ref: id });
        const next = JSON.parse(JSON.stringify(nl)), ne = next.elements.find(e => e.id === id);
        if (patch.on !== undefined) ne.on = patch.on;
        if (patch.value !== undefined) ne.value = patch.value;
        const pr = check(next);
        if (pr.some(p => p.level === 'error')) throw fail('invalid', { problems: pr });
        nl = next; inner = makeSim(compile(nl, faults), noise);
      },
    });
  }

  root.NoemaCircuit = Object.freeze({ id: ID, format: FORMAT, limits: Object.freeze({ nodes: MAX_NODES, elements: MAX_ELEMENTS, steps: MAX_STEPS }), check, create });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
