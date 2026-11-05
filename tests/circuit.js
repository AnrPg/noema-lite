/* The circuit engine circuit-mna@1 (engine/src/36_engine_circuit.js, docs/INTERACTIVE_CIRCUIT.md) against analytic results:
   1. DC: divider, diode and LED with a resistor, BJT switch (Ebers–Moll saturation voltage), MOSFET switch, op-amp inverting gain;
   2. transients: RC charge, RL, series RLC (frequency and decay), RC low-pass at fc (sine steady state), PWM average through RC;
   3. instruments: ohmmeter, scope stats, logic analyser edges on a PWM node;
   4. every fault kind changes the readings the expected way; seeded noise is reproducible;
   5. check() catches bad netlists; the step budget; the speed of a 20000-step RC transient.
   Usage: node tests/circuit.js */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'engine', 'src', '36_engine_circuit.js'));
const C = globalThis.NoemaCircuit;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const pct = x => (100 * x).toPrecision(2) + ' %';
const codes = (nl, level) => C.check(nl).filter(p => !level || p.level === level).map(p => p.code);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e.code === code; } };
const VT = 0.025852;

ok(C.id === 'circuit-mna@1' && Object.isFrozen(C), 'NoemaCircuit.id is circuit-mna@1 and the API is frozen');

// ---------- 1. DC ----------
const divider = (r1 = 1000, r2 = 3000) => ({ nodes: ['vin', 'out'], elements: [
  { id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 10 }, { id: 'R1', type: 'R', n: ['vin', 'out'], value: r1 }, { id: 'R2', type: 'R', n: ['out', 'gnd'], value: r2 }] });
{
  ok(C.check(divider()).length === 0, 'a correct divider has no problems');
  const s = C.create(divider()), r = s.dc();
  ok(Math.abs(r.nodes.out - 7.5) < 1e-6, `divider: 10 V · 3k/(1k+3k) = 7.5 V (got ${r.nodes.out.toFixed(9)})`);
  ok(Math.abs(r.branches.R1 - 2.5e-3) < 1e-9 && Math.abs(r.branches.V1 + 2.5e-3) < 1e-9, 'divider: 2.5 mA through R1; the source delivering power has a negative current (passive sign)');
  ok(Math.abs(s.measure({ kind: 'V', a: 'out' }).value - 7.5) < 1e-6 && Math.abs(s.measure({ kind: 'V', a: 'vin', b: 'out' }).value - 2.5) < 1e-6, 'multimeter V between nodes');
  ok(Math.abs(s.measure({ kind: 'I', element: 'R2' }).value - 2.5e-3) < 1e-9, 'multimeter I through an element');
  const R = s.measure({ kind: 'R', a: 'out', b: 'gnd' }).value;
  ok(Math.abs(R - 750) < 1e-3, `ohmmeter in circuit, unpowered: R1 ∥ R2 through the zeroed source = 750 Ω (got ${R.toFixed(6)})`);
  ok(Math.abs(C.create({ nodes: ['a', 'b'], elements: [{ id: 'V', type: 'V', n: ['a', 'gnd'], value: '2.5' }, { id: 'R', type: 'R', n: ['a', 'b'], value: '4.7k' }, { id: 'R2', type: 'R', n: ['b', 'gnd'], value: '4.7k' }] }).dc().nodes.b - 1.25) < 1e-6, 'SI prefixes in values ("4.7k")');
}
const diodeAnalytic = (V, R, Is, nn) => { let vd = 0.6; for (let i = 0; i < 200; i++) vd = nn * VT * Math.log((V - vd) / R / Is + 1); return vd; };
{
  const s = C.create({ nodes: ['vin', 'a'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 1000 }, { id: 'D1', type: 'D', n: ['a', 'gnd'] }] });
  const vd = s.dc().nodes.a, ex = diodeAnalytic(5, 1000, 1e-14, 1);
  ok(Math.abs(vd - ex) < 1e-5, `diode + 1 kΩ from 5 V: Vd = ${vd.toFixed(5)} V (Shockley fixed point ${ex.toFixed(5)} V, error ${(Math.abs(vd - ex) * 1e6).toFixed(2)} µV)`);
  const s2 = C.create({ nodes: ['vin', 'a'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 1000 }, { id: 'D1', type: 'D', n: ['a', 'gnd'], preset: '1n4148' }] });
  const v2 = s2.dc().nodes.a; ok(v2 > 0.6 && v2 < 0.75, `1N4148 at ~4.3 mA drops ${v2.toFixed(3)} V`);
  const rev = C.create({ nodes: ['vin', 'a'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 1000 }, { id: 'D1', type: 'D', n: ['gnd', 'a'] }] }).dc();
  ok(Math.abs(rev.branches.R1) < 1e-9, 'a reversed diode blocks');
}
{
  const nl = { nodes: ['vin', 'a'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 150 }, { id: 'D1', type: 'D', n: ['a', 'gnd'], preset: 'led-red' }] };
  const r = C.create(nl).dc(), I = r.branches.D1, Is = 0.02 / Math.expm1(1.8 / (2 * VT)), vf = diodeAnalytic(5, 150, Is, 2);
  ok(r.nodes.a > 1.75 && r.nodes.a < 1.85 && rel(I, (5 - vf) / 150) < 1e-5, `red LED + 150 Ω from 5 V: Vf = ${r.nodes.a.toFixed(3)} V, I = ${(I * 1e3).toFixed(3)} mA (analytic ${((5 - vf) / 150 * 1e3).toFixed(3)} mA)`);
  const blue = C.create({ ...nl, elements: nl.elements.map(e => (e.id === 'D1' ? { ...e, preset: 'led-blue' } : e)) }).dc();
  ok(blue.nodes.a > 2.9 && blue.nodes.a < 3.1, `blue LED drops ${blue.nodes.a.toFixed(3)} V`);
}
const bjtSwitch = vin => ({ nodes: ['vcc', 'in', 'b', 'c'], elements: [
  { id: 'V1', type: 'V', n: ['vcc', 'gnd'], value: 5 }, { id: 'V2', type: 'V', n: ['in', 'gnd'], value: vin },
  { id: 'RB', type: 'R', n: ['in', 'b'], value: 10000 }, { id: 'RC', type: 'R', n: ['vcc', 'c'], value: 1000 },
  { id: 'Q1', type: 'NPN', n: ['c', 'b', 'gnd'], params: { betaF: 100, betaR: 1 } }] });
{
  const r = C.create(bjtSwitch(5)).dc(), [ic, ib] = r.pins.Q1, vce = r.nodes.c;
  const aR = 1 / 2, exSat = VT * Math.log((1 / aR + ic / (1 * ib)) / (1 - ic / (100 * ib)));
  ok(vce < 0.2 && ic > 4.7e-3, `BJT switch on: saturated, Vce = ${(vce * 1e3).toFixed(1)} mV, Ic = ${(ic * 1e3).toFixed(3)} mA, Ib = ${(ib * 1e3).toFixed(3)} mA`);
  ok(Math.abs(vce - exSat) < 1e-4, `Ebers–Moll Vce(sat) = Vt·ln((1/αR + Ic/(βR·Ib)) / (1 − Ic/(βF·Ib))) = ${(exSat * 1e3).toFixed(2)} mV (error ${(Math.abs(vce - exSat) * 1e6).toFixed(1)} µV)`);
  const off = C.create(bjtSwitch(0)).dc();
  ok(Math.abs(off.nodes.c - 5) < 1e-4 && Math.abs(off.pins.Q1[0]) < 1e-8, 'BJT switch off: the collector sits at 5 V, no current');
  const act = C.create({ nodes: ['vcc', 'in', 'b', 'c'], elements: [
    { id: 'V1', type: 'V', n: ['vcc', 'gnd'], value: 10 }, { id: 'V2', type: 'V', n: ['in', 'gnd'], value: 1.7 },
    { id: 'RB', type: 'R', n: ['in', 'b'], value: 100000 }, { id: 'RC', type: 'R', n: ['vcc', 'c'], value: 1000 },
    { id: 'Q1', type: 'NPN', n: ['c', 'b', 'gnd'], params: { betaF: 100, betaR: 1 } }] }).dc().pins.Q1;
  ok(rel(act[0] / act[1], 100) < 1e-3, `BJT forward active: Ic/Ib = ${(act[0] / act[1]).toFixed(3)} = βF`);
  const pnp = C.create({ nodes: ['vcc', 'b', 'c'], elements: [
    { id: 'V1', type: 'V', n: ['vcc', 'gnd'], value: 5 }, { id: 'RB', type: 'R', n: ['b', 'gnd'], value: 10000 }, { id: 'RC', type: 'R', n: ['c', 'gnd'], value: 1000 },
    { id: 'Q1', type: 'PNP', n: ['c', 'b', 'vcc'], params: { betaF: 100 } }] }).dc();
  ok(pnp.nodes.c > 4.8 && pnp.pins.Q1[0] < -4.7e-3, `PNP high-side switch: load at ${pnp.nodes.c.toFixed(3)} V, collector current ${(pnp.pins.Q1[0] * 1e3).toFixed(3)} mA (out of the collector)`);
}
const mosSwitch = vg => ({ nodes: ['vdd', 'g', 'd'], elements: [
  { id: 'V1', type: 'V', n: ['vdd', 'gnd'], value: 12 }, { id: 'VG', type: 'V', n: ['g', 'gnd'], value: vg },
  { id: 'RL', type: 'R', n: ['vdd', 'd'], value: 100 }, { id: 'M1', type: 'NMOS', n: ['d', 'g', 'gnd'], params: { Vth: 2, k: 1 } }] });
{
  const r = C.create(mosSwitch(10)).dc(), vov = 8, k = 1, R = 100;
  // triode: k(vov·v − v²/2) = (12 − v)/R  →  (k/2)v² − (k·vov + 1/R)v + 12/R = 0
  const a = k / 2, b = -(k * vov + 1 / R), c = 12 / R, vds = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  ok(Math.abs(r.nodes.d - vds) < 1e-6, `MOSFET switch on (triode): Vds = ${(r.nodes.d * 1e3).toFixed(3)} mV (square law ${(vds * 1e3).toFixed(3)} mV)`);
  const off = C.create(mosSwitch(0)).dc();
  ok(Math.abs(off.nodes.d - 12) < 1e-6, 'MOSFET switch off: the drain sits at 12 V');
  const sat = C.create({ nodes: ['vdd', 'g', 'd'], elements: [
    { id: 'V1', type: 'V', n: ['vdd', 'gnd'], value: 12 }, { id: 'VG', type: 'V', n: ['g', 'gnd'], value: 3 },
    { id: 'RL', type: 'R', n: ['vdd', 'd'], value: 100 }, { id: 'M1', type: 'NMOS', n: ['d', 'g', 'gnd'], params: { Vth: 2, k: 0.1 } }] }).dc();
  ok(rel(sat.branches.M1, 0.05) < 1e-6, `MOSFET in saturation: Id = k/2·(Vgs − Vth)² = 50 mA (got ${(sat.branches.M1 * 1e3).toFixed(4)} mA)`);
  const pm = C.create({ nodes: ['vdd', 'd'], elements: [
    { id: 'V1', type: 'V', n: ['vdd', 'gnd'], value: 5 }, { id: 'RL', type: 'R', n: ['d', 'gnd'], value: 100 },
    { id: 'M1', type: 'PMOS', n: ['d', 'gnd', 'vdd'], preset: 'irf9540' }] }).dc();
  ok(pm.nodes.d > 4.9, `PMOS high-side switch (gate low) drives the load to ${pm.nodes.d.toFixed(3)} V`);
}
const inverting = (vin, extra) => ({ nodes: ['in', 'm', 'out'], elements: [
  { id: 'V1', type: 'V', n: ['in', 'gnd'], value: vin }, { id: 'R1', type: 'R', n: ['in', 'm'], value: 1000 },
  { id: 'R2', type: 'R', n: ['m', 'out'], value: 10000 }, Object.assign({ id: 'U1', type: 'OPAMP', n: ['gnd', 'm', 'out'] }, extra || {})] });
{
  const out = C.create(inverting(0.5)).dc().nodes.out, ex = -5 / (1 + 11 / 1e5);
  ok(Math.abs(out - ex) < 1e-6, `op-amp inverting ×(−10): 0.5 V → ${out.toFixed(6)} V (finite gain 1e5: ${ex.toFixed(6)} V; ideal −5 V, ${pct(rel(out, -5))})`);
  const satv = C.create(inverting(2)).dc().nodes.out;
  ok(Math.abs(satv + 15) < 1e-3, `op-amp saturates at the rail: 2 V in → ${satv.toFixed(4)} V`);
  const single = C.create(inverting(-2, { params: { rails: [0, 5] } })).dc().nodes.out;
  ok(Math.abs(single - 5) < 1e-3, 'op-amp rails as numbers [0, 5]');
  const nodesRails = { nodes: ['in', 'm', 'out', 'vp', 'vn'], elements: [
    { id: 'V1', type: 'V', n: ['in', 'gnd'], value: 0.3 }, { id: 'VP', type: 'V', n: ['vp', 'gnd'], value: 9 }, { id: 'VN', type: 'V', n: ['vn', 'gnd'], value: -9 },
    { id: 'R1', type: 'R', n: ['in', 'm'], value: 1000 }, { id: 'R2', type: 'R', n: ['m', 'out'], value: 10000 },
    { id: 'U1', type: 'OPAMP', n: ['gnd', 'm', 'out', 'vp', 'vn'] }] };
  ok(Math.abs(C.create(nodesRails).dc().nodes.out + 3) < 1e-3, 'op-amp with supply pins (5 terminals): linear in range');
  const dead = C.create(nodesRails, { faults: [{ element: 'VP', kind: 'short' }, { element: 'VN', kind: 'short' }] }).dc().nodes.out;
  ok(Math.abs(dead) < 0.01, `op-amp without supply gives ~0 V (got ${dead.toFixed(4)} V)`);
}

// ---------- 2. transients ----------
const rc = (value, extra) => ({ nodes: ['in', 'out'], elements: [
  { id: 'V1', type: 'V', n: ['in', 'gnd'], value }, { id: 'R1', type: 'R', n: ['in', 'out'], value: 1000 },
  Object.assign({ id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6 }, extra || {})] });
const acc = {};
{
  const tr = C.create(rc({ pulse: { v1: 0, v2: 5 } })).transient({ dt: 1e-6, tEnd: 5e-3 });
  const i = tr.t.findIndex(t => Math.abs(t - 1e-3) < 1e-12), ex = 5 * (1 - Math.exp(-1));
  acc.rc = rel(tr.nodes.out[i], ex);
  ok(tr.nodes.out[0] === 0 && acc.rc < 0.005, `RC charge (step at t = 0): v(RC) = ${tr.nodes.out[i].toFixed(6)} V vs ${ex.toFixed(6)} V (${pct(acc.rc)})`);
  const tr2 = C.create(rc(5, { ic: 0 })).transient({ dt: 1e-5, tEnd: 5e-3 });
  const e2 = rel(tr2.nodes.out[100], ex);
  ok(e2 < 0.005, `RC charge from ic = 0 with a DC source: ${pct(e2)} at t = RC`);
  const ic = rel(tr2.branches.C1[1], 5e-3);
  ok(ic < 0.02 && tr2.branches.C1[0] === 0, `capacitor current just after the start ≈ V/R (${pct(ic)})`);
}
{
  const nl = { nodes: ['in', 'a'], elements: [{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: { pulse: { v1: 0, v2: 10 } } },
    { id: 'R1', type: 'R', n: ['in', 'a'], value: 100 }, { id: 'L1', type: 'L', n: ['a', 'gnd'], value: 10e-3 }] };
  const tr = C.create(nl).transient({ dt: 1e-7, tEnd: 5e-4 }), ex = 0.1 * (1 - Math.exp(-1));
  acc.rl = rel(tr.branches.L1[1000], ex);
  ok(acc.rl < 0.005, `RL (τ = L/R = 100 µs): i(τ) = ${(tr.branches.L1[1000] * 1e3).toFixed(4)} mA vs ${(ex * 1e3).toFixed(4)} mA (${pct(acc.rl)})`);
  ok(Math.abs(C.create(nl).dc().nodes.a) < 1e-9, 'DC: an inductor is a short');
}
{
  const R = 10, L = 1e-3, Cc = 1e-6;
  const nl = { nodes: ['in', 'a', 'c'], elements: [{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: { pulse: { v1: 0, v2: 1 } } },
    { id: 'R1', type: 'R', n: ['in', 'a'], value: R }, { id: 'L1', type: 'L', n: ['a', 'c'], value: L }, { id: 'C1', type: 'C', n: ['c', 'gnd'], value: Cc }] };
  const tr = C.create(nl).transient({ dt: 5e-8, tEnd: 1e-3 }), v = tr.nodes.c.map(y => y - 1), t = tr.t;
  const ups = [], peaks = [];
  for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) ups.push(t[i - 1] + (-v[i - 1]) / (v[i] - v[i - 1]) * (t[i] - t[i - 1]));
  for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] > 0) peaks.push(v[i]);
  const alpha = R / (2 * L), wd = Math.sqrt(1 / (L * Cc) - alpha * alpha), Td = 2 * Math.PI / wd;
  const Tm = (ups[ups.length - 1] - ups[0]) / (ups.length - 1), am = Math.log(peaks[0] / peaks[1]) / Tm;
  acc.rlcF = rel(1 / Tm, 1 / Td); acc.rlcA = rel(am, alpha);
  ok(acc.rlcF < 1e-3, `series RLC underdamped: f_d = ${(1 / Tm).toFixed(2)} Hz vs ${(1 / Td).toFixed(2)} Hz (${pct(acc.rlcF)})`);
  ok(acc.rlcA < 0.01, `series RLC decay: α = ${am.toFixed(1)} 1/s vs R/2L = ${alpha} 1/s (${pct(acc.rlcA)})`);
  ok(Math.abs(peaks[0] - Math.exp(-alpha * Td / 2)) < 0.005, `first overshoot ${pct(peaks[0])} vs e^(−αT/2) = ${pct(Math.exp(-alpha * Td / 2))}`);
}
{
  const fc = 1000, R = 1000, Cc = 1 / (2 * Math.PI * fc * R), T = 1 / fc;
  const nl = { nodes: ['in', 'out'], elements: [{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: { sine: { amp: 1, freq: fc } } },
    { id: 'R1', type: 'R', n: ['in', 'out'], value: R }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: Cc }] };
  const dt = T / 400, tr = C.create(nl).transient({ dt, tEnd: 20 * T });
  let re = 0, im = 0; const s0 = tr.t.length - 1 - 10 * 400;
  for (let s = s0; s < tr.t.length - 1; s++) { const w = 2 * Math.PI * fc * tr.t[s]; re += tr.nodes.out[s] * Math.cos(w); im += tr.nodes.out[s] * Math.sin(w); }
  const amp = 2 * Math.hypot(re, im) / (10 * 400), dB = 20 * Math.log10(amp);
  acc.lp = Math.abs(dB + 20 * Math.log10(Math.SQRT2));
  ok(acc.lp < 0.1, `RC low-pass at fc: ${dB.toFixed(4)} dB vs −3.0103 dB (error ${acc.lp.toFixed(4)} dB)`);
  const sc = C.create(nl).measure({ kind: 'scope', node: 'out', tEnd: 20 * T, dt, tStart: 10 * T });
  ok(rel(sc.stats.freq, fc) < 1e-3 && Math.abs(sc.stats.pp / 2 - amp) < 2e-3 && Math.abs(sc.stats.mean) < 1e-3, `scope stats: f = ${sc.stats.freq.toFixed(2)} Hz, Vpp = ${sc.stats.pp.toFixed(4)} V, mean ≈ 0`);
}
const pwmRc = { nodes: ['p', 'out'], elements: [{ id: 'V1', type: 'V', n: ['p', 'gnd'], value: { pwm: { v: 5, freq: 1000, duty: 0.3 } } },
  { id: 'R1', type: 'R', n: ['p', 'out'], value: 10000 }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6 }] };
{
  const s = C.create(pwmRc), tr = s.transient({ dt: 1e-5, tEnd: 0.1 });
  const last = tr.nodes.out.slice(-1000), mean = last.reduce((a, b) => a + b, 0) / last.length;
  acc.pwm = rel(mean, 1.5);
  ok(acc.pwm < 0.01, `PWM 5 V · 30 % through RC (τ = 10 ms): mean ${mean.toFixed(5)} V vs 1.5 V (${pct(acc.pwm)}); ripple ${(Math.max(...last) - Math.min(...last)).toFixed(4)} V`);
  ok(Math.abs(s.measure({ kind: 'V', a: 'out' }).value - 1.5) < 1e-6, 'multimeter (DC) on a PWM-driven RC reads the average: 1.5 V');
  const la = s.measure({ kind: 'logic', nodes: ['p', 'out'], threshold: 2.5, tEnd: 5e-3, dt: 1e-6 });
  const ed = la.edges.p, rises = ed.filter(e => e.to === 1).map(e => e.t), falls = ed.filter(e => e.to === 0).map(e => e.t);
  ok(rises.length === 6 && falls.length === 5, `logic analyser: 5 ms of 1 kHz PWM (low at t = 0⁻) give ${rises.length} rising edges (0…5 ms) and ${falls.length} falling edges`);
  ok(falls.every((t, k) => Math.abs(t - (k + 0.3) * 1e-3) <= 1e-6) && rises.every((t, k) => Math.abs(t - k * 1e-3) <= 1e-6), 'logic analyser: edges at k ms (rise) and k + 0.3 ms (fall), within one sample');
  ok(rel(la.stats.p.freq, 1000) < 1e-3 && Math.abs(la.stats.p.duty - 0.3) < 2e-3, `logic analyser stats: ${la.stats.p.freq.toFixed(2)} Hz, duty ${(la.stats.p.duty * 100).toFixed(2)} %`);
  ok(la.traces.out.every(b => b === 0) && la.edges.out.length === 0, 'the filtered node stays below the threshold: all 0, no edges');
  ok(la.traces.p.length === la.t.length && la.traces.p[0] === 0 && la.traces.p[1] === 1, '0/1 traces, one per sample');
}

// ---------- 3/4. faults ----------
{
  const base = C.create(divider());
  const openR2 = C.create(divider(), { faults: [{ element: 'R2', kind: 'open' }] });
  ok(Math.abs(openR2.measure({ kind: 'V', a: 'out' }).value - 10) < 1e-6, 'open R2: the output floats up to the supply through R1');
  ok(Math.abs(openR2.measure({ kind: 'R', a: 'out' }).value - 1000) < 1e-3, 'open R2: the ohmmeter across it reads only the other path (R1 through the source) = 1 kΩ');
  ok(Math.abs(openR2.measure({ kind: 'R', a: '@R2.0', b: '@R2.1' }).value - 1000) < 1e-3, 'pin references "@R2.0" measure where the legs are soldered');
  const openR1 = C.create(divider(), { faults: [{ element: 'R1', kind: 'open' }] });
  ok(Math.abs(openR1.measure({ kind: 'V', a: 'out' }).value) < 1e-6 && Math.abs(openR1.measure({ kind: 'I', element: 'R2' }).value) < 1e-12, 'open R1: no current, the output falls to 0 V');
  const ledNl = { nodes: ['vin', 'a'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 220 }, { id: 'D1', type: 'D', n: ['a', 'gnd'], preset: 'led-red' }] };
  const ledOpen = C.create(ledNl, { faults: [{ element: 'R1', kind: 'open' }] });
  ok(ledOpen.measure({ kind: 'R', a: 'vin', b: 'a' }).value === 'OL', 'open series resistor: OL on the ohmmeter (the only other path is the LED, reverse-biased by the meter)');
  const fwd = ledOpen.measure({ kind: 'R', a: 'a', b: 'vin' }).value;
  ok(typeof fwd === 'number' && fwd > 1000 && fwd < 2500, `…with the probes swapped the meter forward-biases the LED: ${fwd.toFixed(0)} Ω (a diode reads its drop / 1 mA)`);
  ok(Math.abs(ledOpen.dc().branches.D1) < 1e-9 && C.create(ledNl).measure({ kind: 'R', a: 'vin', b: 'a' }).value > 219.9, 'open: the LED is dark; healthy: the meter reads 220 Ω');
  const short = C.create(divider(), { faults: [{ element: 'R2', kind: 'short' }] });
  ok(Math.abs(short.measure({ kind: 'V', a: 'out' }).value) < 0.02 && short.measure({ kind: 'R', a: 'out' }).value < 0.01, 'short R2: the output sits at ~0 V and the ohmmeter reads ~0 Ω');
  ok(rel(short.measure({ kind: 'I', element: 'R1' }).value, 0.01) < 1e-4, 'short R2: R1 carries 10 V / 1 kΩ');
  const drift = C.create(divider(), { faults: [{ element: 'R2', kind: 'drift', factor: 2 }] });
  ok(Math.abs(drift.measure({ kind: 'V', a: 'out' }).value - 60 / 7) < 1e-5 && Math.abs(drift.measure({ kind: 'R', a: 'out' }).value - 6000 / 7) < 1e-3, 'drift R2 ×2: the output becomes 10·6/7 V, R1 ∥ 2·R2 on the ohmmeter');
  const dc = C.create(rc({ pulse: { v1: 0, v2: 5 } }), { faults: [{ element: 'C1', kind: 'drift', factor: 2 }] }).transient({ dt: 1e-6, tEnd: 3e-3 });
  ok(rel(dc.nodes.out[2000], 5 * (1 - Math.exp(-1))) < 0.005, 'drift C1 ×2: the time constant doubles');
  ok(Math.abs(C.create(divider(), { faults: [{ element: 'V1', kind: 'drift', factor: 0.5 }] }).dc().nodes.out - 3.75) < 1e-6, 'drift of a source scales its voltage');
  const trace = C.create(divider(), { faults: [{ node: 'out', kind: 'open-trace' }] });
  ok(Math.abs(trace.measure({ kind: 'V', a: 'out' }).value - 10) < 1e-6 && Math.abs(trace.measure({ kind: 'V', a: '@R2.0' }).value) < 1e-6, 'open trace on "out": R1\'s side reads 10 V, R2\'s pad reads 0 V');
  ok(Math.abs(trace.measure({ kind: 'R', a: 'out', b: '@R2.0' }).value - 4000) < 1e-2 && base.measure({ kind: 'R', a: 'out', b: '@R2.0' }).value === 0, 'open trace: 0 Ω along the trace when healthy; broken, the meter reads round the loop (R1 + R2 = 4 kΩ)');
  const iso = { nodes: ['vin', 'a', 'b'], elements: [{ id: 'V1', type: 'V', n: ['vin', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['vin', 'a'], value: 1000 }, { id: 'R2', type: 'R', n: ['a', 'b'], value: 1000 }, { id: 'C1', type: 'C', n: ['b', 'gnd'], value: 1e-6 }] };
  ok(C.create(iso, { faults: [{ node: 'a', kind: 'open-trace', side: ['R2'] }] }).measure({ kind: 'R', a: 'a', b: '@R2.0' }).value === 'OL', 'open trace with no other DC path (R2 leads only to a capacitor): OL');
  const gnd = C.create(divider(), { faults: [{ node: 'gnd', kind: 'open-trace', side: ['R2'] }] });
  ok(Math.abs(gnd.dc().nodes.out - 10) < 1e-6, 'a broken ground trace under R2 lifts the output to the supply');
  const q = C.create(bjtSwitch(5), { faults: [{ element: 'Q1', kind: 'open', pin: 1 }] }).dc();
  ok(Math.abs(q.nodes.c - 5) < 1e-4, 'open base of the BJT switch: the transistor never turns on');
  const qs = C.create(bjtSwitch(0), { faults: [{ element: 'Q1', kind: 'short' }] }).dc();
  ok(qs.nodes.c < 0.01, 'collector–emitter short: the load is always on');
  ok(throwsCode(() => C.create(divider(), { faults: [{ element: 'R9', kind: 'open' }] }), 'fault') && throwsCode(() => C.create(divider(), { faults: [{ element: 'R1', kind: 'melt' }] }), 'fault'), 'an unknown element or fault kind → code "fault"');
  // reverse: a part soldered the wrong way round (P3, the fault-finding benches)
  const rev = C.create(ledNl, { faults: [{ element: 'D1', kind: 'reverse' }] }), rd = rev.dc();
  ok(Math.abs(rd.branches.D1) < 1e-9 && Math.abs(rd.nodes.a - 5) < 1e-3, `reverse: the LED reversed is dark and its anode pad sits at the supply (${rd.nodes.a.toFixed(4)} V)`);
  ok(Math.abs(rev.measure({ kind: 'V', a: '@D1.0', b: '@D1.1' }).value + 5) < 1e-3, 'reverse: pin references follow the legs (anode leg on the cathode pad: −5 V anode to cathode)');
  ok(throwsCode(() => C.create(bjtSwitch(5), { faults: [{ element: 'Q1', kind: 'reverse' }] }), 'fault') && Math.abs(C.create(bjtSwitch(5), { faults: [{ element: 'Q1', kind: 'reverse', pins: [0, 2] }] }).dc().branches.Q1) > 0, 'reverse: a 3-terminal part needs its two pins (c and e swapped: a BJT in reverse active mode)');
  // checkFaults: the validators' static check of a bench's faults
  const cf = f => C.checkFaults(ledNl, f).map(p => p.path + ' ' + p.msg);
  ok(cf([{ element: 'D1', kind: 'reverse' }, { element: 'R1', kind: 'open' }, { element: 'R1', kind: 'drift', factor: 10 }, { node: 'a', kind: 'open-trace' }, { element: 'R1', kind: 'short' }]).length === 0, 'checkFaults: good faults pass');
  const bad = cf([{ element: 'R9', kind: 'open' }, { element: 'R1', kind: 'melt' }, { node: 'zz', kind: 'open-trace' }, { element: 'R1', kind: 'drift', factor: 0 }, { element: 'D1', kind: 'drift', param: 'gain' }, { element: 'R1', kind: 'open', pin: 2 }, { node: 'a', kind: 'open-trace', side: ['V1'] }, { element: 'R1', kind: 'open', colour: 'red' }]);
  ok(bad.length === 8 && /faults\[0\]\.element/.test(bad[0]) && /faults\[6\]\.side\[0\] does not touch/.test(bad[6]), 'checkFaults: unknown part, kind, node, factor, param, pin, side and field are each reported ' + JSON.stringify(bad));
  ok(typeof C.source() === 'string' && /^\(function noemaCircuitModule\(root\)/.test(C.source()) && C.FAULT_KINDS.includes('reverse'), 'source(): the engine as text, to run it in a worker');
  { const g = {}; (new Function('self', C.source()))(g); ok(Math.abs(g.NoemaCircuit.create(divider()).dc().nodes.out - 7.5) < 1e-6, 'the engine built from its own source computes the same'); }
  const s = JSON.stringify(base.dc()); ok(!/fault|open|short/.test(JSON.stringify(trace.dc())) && s.length > 0, 'the results never name the fault');
}
{
  const mk = seed => C.create(divider(), { noise: { rel: 0.01, seed } });
  const a = mk(42), b = mk(42), c = mk(7);
  const pr = [{ kind: 'V', a: 'out' }, { kind: 'R', a: 'out' }, { kind: 'I', element: 'R1' }];
  const ra = pr.map(p => a.measure(p).value), rb = pr.map(p => b.measure(p).value), rc2 = pr.map(p => c.measure(p).value);
  ok(JSON.stringify(ra) === JSON.stringify(rb), `same seed → identical readings (${ra.map(v => v.toPrecision(6)).join(', ')})`);
  ok(JSON.stringify(ra) !== JSON.stringify(rc2), 'another seed → other readings');
  ok(Math.abs(ra[0] - 7.5) <= 0.075 && ra[0] !== 7.5, 'noise stays within ±rel');
  ok(a.measure(pr[0]).value === ra[0], 'the same probe reads the same again (per-probe stream)');
  const s1 = a.measure({ kind: 'scope', node: 'out', tEnd: 1e-3 }).v, s2 = b.measure({ kind: 'scope', node: 'out', tEnd: 1e-3 }).v;
  ok(JSON.stringify(s1) === JSON.stringify(s2), 'scope traces with noise are reproducible');
  const t1 = C.create(pwmRc).transient({ dt: 1e-5, tEnd: 0.01 }), t2 = C.create(pwmRc).transient({ dt: 1e-5, tEnd: 0.01 });
  ok(JSON.stringify(t1) === JSON.stringify(t2), 'two simulators of one netlist give identical transients');
}
{
  const sw = { nodes: ['v', 'a'], elements: [{ id: 'V1', type: 'V', n: ['v', 'gnd'], value: 5 }, { id: 'S1', type: 'SW', n: ['v', 'a'], on: false }, { id: 'R1', type: 'R', n: ['a', 'gnd'], value: 1000 }] };
  const s = C.create(sw), off = s.dc().nodes.a; s.set('S1', { on: true }); const on = s.dc().nodes.a;
  ok(off < 1e-5 && Math.abs(on - 5 * 1000 / 1000.01) < 1e-6, 'switch: off → 0 V, set(id, {on: true}) → 5 V through Ron');
  s.set('R1', { value: 2000 }); ok(Math.abs(s.measure({ kind: 'I', element: 'R1' }).value - 2.5e-3) < 1e-6, 'set(id, {value}) changes a part');
}

// ---------- 5. check(), budget, speed ----------
{
  ok(codes({ nodes: ['a'], elements: [{ id: 'R1', type: 'R', n: ['a', 'b'], value: 1 }] }).includes('unknown-node'), 'check: unknown node');
  ok(codes({ nodes: ['a'], elements: [{ id: 'R1', type: 'R', n: ['a', 'gnd'], value: 1 }, { id: 'R1', type: 'R', n: ['a', 'gnd'], value: 2 }] }).includes('dup-id'), 'check: duplicate id');
  ok(codes({ nodes: ['a', 'a'], elements: [] }).includes('dup-node'), 'check: duplicate node');
  const fl = C.check({ nodes: ['a', 'b'], elements: [{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 1 }, { id: 'C1', type: 'C', n: ['a', 'b'], value: 1e-6 }, { id: 'C2', type: 'C', n: ['b', 'gnd'], value: 1e-6 }] });
  ok(fl.some(p => p.code === 'floating' && p.level === 'warning' && p.path === 'nodes[1]'), 'check: a node between two capacitors has no DC path to ground → warning "floating"');
  ok(codes({ nodes: ['a'], elements: [{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 1 }, { id: 'V2', type: 'V', n: ['a', 'gnd'], value: 2 }] }).includes('vloop'), 'check: two sources in parallel → "vloop"');
  ok(codes({ nodes: ['a'], elements: [{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 1 }, { id: 'L1', type: 'L', n: ['a', 'gnd'], value: 1e-3 }] }).includes('vloop'), 'check: an inductor across a source → "vloop"');
  ok(codes({ nodes: ['a'], elements: [{ id: 'R1', type: 'R', n: ['a', 'gnd'] }] }).includes('value'), 'check: missing value');
  ok(codes({ nodes: ['a'], elements: [{ id: 'R1', type: 'R', n: ['a', 'gnd'], value: -5 }, { id: 'V1', type: 'V', n: ['a', 'gnd'], value: { pwm: { v: 5, freq: 1000, duty: 1.5 } } }] }).filter(c => c === 'value').length === 2, 'check: negative R and duty > 1');
  ok(codes({ nodes: ['a'], elements: [{ id: 'D1', type: 'D', n: ['a', 'gnd'], preset: 'led-ultraviolet' }] }).includes('preset'), 'check: unknown preset');
  ok(codes({ nodes: ['a'], elements: [{ id: 'Q1', type: 'NPN', n: ['a', 'gnd'] }] }).includes('pins'), 'check: wrong number of terminals');
  ok(codes({ nodes: ['a'], elements: [{ id: 'X1', type: 'TRIODE', n: ['a', 'gnd'] }] }).includes('type'), 'check: unknown type');
  ok(codes({ nodes: ['a', 'b'], elements: [{ id: 'R1', type: 'R', n: ['a', 'b'], value: 1 }] }).includes('no-ground'), 'check: no element touches ground');
  ok(codes({ nodes: ['a', { name: 'TP1', probe: 'a' }], elements: [{ id: 'R1', type: 'R', n: ['TP1', 'gnd'], value: 1 }] }).includes('probe-only'), 'check: a probe-only label cannot be a terminal');
  ok(codes({ nodes: ['a'], elements: [{ id: 'M1', type: 'NMOS', n: ['a', 'gnd', 'gnd'], params: { k: -1 } }] }).includes('param'), 'check: a parameter out of range');
  ok(codes(null).includes('format') && codes({ nodes: 'a' }).includes('format'), 'check: not a netlist');
  ok(throwsCode(() => C.create({ nodes: ['a'], elements: [{ id: 'R1', type: 'R', n: ['a', 'x'], value: 1 }] }), 'invalid'), 'create() refuses a netlist with errors: code "invalid" (with .problems)');
  const lab = C.create({ nodes: ['vin', 'out', { name: 'TP1', probe: 'out' }], elements: divider().elements });
  ok(Math.abs(lab.measure({ kind: 'V', a: 'TP1' }).value - 7.5) < 1e-6 && Math.abs(lab.dc().nodes.TP1 - 7.5) < 1e-6, 'a probe-only label reads its node');
  ok(throwsCode(() => lab.measure({ kind: 'V', a: 'nowhere' }), 'unknown-node') && throwsCode(() => lab.measure({ kind: 'Z' }), 'probe'), 'measure: unknown node / kind → codes');
  const s = C.create(rc(5));
  ok(throwsCode(() => s.transient({ dt: 1e-9, tEnd: 1 }), 'budget'), 'transient: more than 200000 steps → code "budget"');
  ok(throwsCode(() => s.transient({ dt: 1e-6, tEnd: 1e-3, maxSteps: 500 }), 'budget') && throwsCode(() => s.transient({ dt: 1e-6, tEnd: 1e-3, maxSteps: 300000 }), 'budget'), 'transient: beyond maxSteps, or maxSteps above 200000 → "budget"');
  ok(throwsCode(() => s.transient({ dt: 0, tEnd: 1 }), 'bad-args'), 'transient: dt ≤ 0 → "bad-args"');
  const t0 = process.hrtime.bigint();
  const tr = C.create(rc({ pulse: { v1: 0, v2: 5 } })).transient({ dt: 1e-6, tEnd: 0.02 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; acc.ms = ms;
  ok(tr.t.length === 20001 && ms < 300, `RC transient of 20000 steps in ${ms.toFixed(1)} ms (< 300 ms)`);
  const t1 = process.hrtime.bigint();
  C.create({ nodes: ['p', 'b', 'c', 'vcc'], elements: [
    { id: 'V1', type: 'V', n: ['p', 'gnd'], value: { pwm: { v: 5, freq: 1000, duty: 0.5 } } }, { id: 'VC', type: 'V', n: ['vcc', 'gnd'], value: 5 },
    { id: 'RB', type: 'R', n: ['p', 'b'], value: 4700 }, { id: 'RC', type: 'R', n: ['vcc', 'c'], value: 470 },
    { id: 'Q1', type: 'NPN', n: ['c', 'b', 'gnd'], preset: '2n3904' }, { id: 'C1', type: 'C', n: ['c', 'gnd'], value: 1e-8 }] }).transient({ dt: 1e-6, tEnd: 0.02 });
  const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
  ok(ms2 < 3000, `nonlinear (BJT driven by PWM) transient of 20000 steps in ${ms2.toFixed(1)} ms`);
}

{ // the sim-spec adapter (36_engine_circuit_sim.js): a logic capture of more than 2000 edges is cut where the edges kept end, never drawn flat to tEnd
  let def = null; globalThis.window = globalThis; globalThis.ACT = { registerEngine: d => { def = d; } };
  require(path.join(ROOT, 'engine', 'src', '36_engine_circuit_sim.js')); delete globalThis.ACT;
  const nl = { nodes: ['p'], elements: [{ id: 'V1', type: 'V', n: ['p', 'gnd'], value: { pwm: { v: 5, freq: 100000, duty: 0.5 } } }, { id: 'R1', type: 'R', n: ['p', 'gnd'], value: 1000 }] };
  const m = def.create({ model: { netlist: nl } }, { seed: 1, faults: [] }).measure({}, { kind: 'logic', nodes: ['p'], threshold: 2.5, tEnd: 0.03, dt: 1e-6 });
  const tr = m.traces && m.traces.p, last = tr && tr.edges[tr.edges.length - 1];
  ok(tr && tr.stats.edges > 2000 && tr.edges.length <= 2000 && m.cut === true && Math.abs(m.tEnd - 0.03) < 1e-9, `logic adapter: ${tr && tr.stats.edges} edges → at most 2000 kept, the reading says cut (window ${m.t1}, capture ${m.tEnd})`);
  ok(last && m.t1 > last.t && m.t1 - last.t <= 1 / 100000 / 2 + 2e-6, 'logic adapter: the cut window ends within one half-period of the last edge kept (no flat line past it)');
  const s2 = def.create({ model: { netlist: { ...nl, elements: [{ ...nl.elements[0], value: { pwm: { v: 5, freq: 1000, duty: 0.5 } } }, nl.elements[1]] } } }, { seed: 1, faults: [] }).measure({}, { kind: 'logic', nodes: ['p'], threshold: 2.5, tEnd: 5e-3, dt: 1e-6 });
  ok(!s2.cut && Math.abs(s2.t1 - 5e-3) < 1e-9 && s2.traces.p.edges.length === s2.traces.p.stats.edges, 'logic adapter: a short capture keeps every edge and its whole window');
}

console.log(`\naccuracy: RC ${pct(acc.rc)} · RL ${pct(acc.rl)} · RLC f ${pct(acc.rlcF)}, α ${pct(acc.rlcA)} · low-pass ${acc.lp.toFixed(4)} dB · PWM avg ${pct(acc.pwm)} · 20000-step RC ${acc.ms.toFixed(1)} ms`);
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
