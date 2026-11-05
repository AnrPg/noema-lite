/* The circuit engine's second-generation physics (engine/src/36_engine_circuit.js, docs/INTERACTIVE_CIRCUIT.md §9), against the physics.
   1. the same DC point as the first model; 2. AC analysis (RC, RLC, an op-amp's closed-loop bandwidth, a quarter-wave line);
   3. op-amp slew rate, output resistance with a capacitive load; 4. transmission lines (delay, reflections); 5. floating nodes (pickup);
   6. meter modes (true RMS, AC, average-responding, true averages of PWM), the meter's input resistance; 7. MOSFET gate charge,
   Zener, the voltage-controlled switch in a buck converter, switching power; 8. the scope's ground lead; 9. checks and faults.
   Usage: node tests/circuit2.js */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'engine', 'src', '36_engine_circuit.js'));
const C = globalThis.NoemaCircuit;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const V2 = {};   // (the engine's full model; { version: 1 } is the first one, kept for comparisons)
const mk = (elements, nodes, extra) => Object.assign({ format: 'noema.circuit/v1', nodes, elements }, extra || {});
const sim2 = (nl, o) => C.create(nl, o || {});
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const at = (t, v, x) => { let i = 0; while (i < t.length - 1 && t[i + 1] <= x) i++; return v[i]; };
const codes = (nl, lvl) => C.check(nl, V2).filter(p => !lvl || p.level === lvl).map(p => p.code);

// ---------- 1. version 1 stays as it was ----------
{
  const nl = mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['in', 'out'], value: 1000 }, { id: 'D1', type: 'D', n: ['out', 'gnd'], preset: '1n4148' },
    { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6 }], ['in', 'out']);
  const a = C.create(nl, { version: 1 }).dc(), b = sim2(nl).dc();
  ok(Math.abs(a.nodes.out - b.nodes.out) < 1e-6, `the same DC point in v1 and v2 (v1 ${a.nodes.out.toFixed(6)} V, v2 ${b.nodes.out.toFixed(6)} V: v2 adds only the 1N4148's 4 pF)`);
}

// ---------- 2. AC analysis ----------
{
  const R = 1000, Cv = 1e-6, fc = 1 / (2 * Math.PI * R * Cv);
  const nl = mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 0 }, { id: 'R1', type: 'R', n: ['in', 'out'], value: R }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: Cv }], ['in', 'out']);
  const r = sim2(nl).ac({ source: 'V1', fStart: fc, fStop: fc * 10, points: 2 }), st = C.acStats(r.f, r.nodes.out.re, r.nodes.out.im);
  ok(Math.abs(st.db[0] + 10 * Math.log10(2)) < 1e-6 && Math.abs(st.phase[0] + 45) < 1e-6, `RC low-pass at fc: ${st.db[0].toFixed(6)} dB, ${st.phase[0].toFixed(4)}° (exact −3.0103 dB, −45°)`);
  const r2 = sim2(nl).ac({ source: 'V1', fStart: 1, fStop: 1e5, points: 301 }), s2 = C.acStats(r2.f, r2.nodes.out.re, r2.nodes.out.im);
  ok(rel(s2.f3db, fc) < 5e-3 && Math.abs(s2.db[300] - 20 * Math.log10(1 / Math.hypot(1, 1e5 / fc))) < 1e-9, `the sweep finds f(−3 dB) = ${s2.f3db.toFixed(2)} Hz (fc ${fc.toFixed(2)}); −20 dB/decade beyond`);
  // series RLC: the resonance and Q
  const L = 10e-3, Cr = 1e-6, Rr = 10, f0 = 1 / (2 * Math.PI * Math.sqrt(L * Cr)), Q = Math.sqrt(L / Cr) / Rr;
  const rlc = mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 0 }, { id: 'R1', type: 'R', n: ['in', 'a'], value: Rr }, { id: 'L1', type: 'L', n: ['a', 'out'], value: L }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: Cr }], ['in', 'a', 'out']);
  const r3 = sim2(rlc).ac({ source: 'V1', fStart: f0 / 10, fStop: f0 * 10, points: 801 }), s3 = C.acStats(r3.f, r3.nodes.out.re, r3.nodes.out.im);
  ok(rel(s3.fPeak, f0 * Math.sqrt(1 - 1 / (2 * Q * Q))) < 0.01 && Math.abs(s3.peakDb - 20 * Math.log10(Q / Math.sqrt(1 - 1 / (4 * Q * Q)))) < 0.05, `series RLC: peak ${s3.peakDb.toFixed(2)} dB at ${s3.fPeak.toFixed(1)} Hz (Q = ${Q.toFixed(2)}, f0 = ${f0.toFixed(1)} Hz)`);
  // a non-inverting amplifier of gain 11 with a 1 MHz op-amp: closed-loop bandwidth ≈ GBW / 11
  const amp = gbw => mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 0 }, { id: 'U1', type: 'OPAMP', n: ['in', 'fb', 'out'], params: { gain: 1e5, gbw, rails: [-15, 15] } },
    { id: 'Rf', type: 'R', n: ['out', 'fb'], value: 10000 }, { id: 'Rg', type: 'R', n: ['fb', 'gnd'], value: 1000 }], ['in', 'fb', 'out']);
  const r4 = sim2(amp(1e6)).ac({ source: 'V1', fStart: 100, fStop: 1e7, points: 401 }), s4 = C.acStats(r4.f, r4.nodes.out.re, r4.nodes.out.im);
  ok(Math.abs(s4.dcDb - 20 * Math.log10(11)) < 0.01 && rel(s4.f3db, 1e6 / 11) < 0.02, `gain 11 with GBW 1 MHz: ${s4.dcDb.toFixed(2)} dB, −3 dB at ${(s4.f3db / 1e3).toFixed(1)} kHz (≈ GBW/11 = 90.9 kHz)`);
  const r5 = sim2(amp(1e6)).dc(); ok(Math.abs(r5.nodes.out) < 1e-9, 'the same amplifier at DC: 0 V in, 0 V out');
  // a quarter-wave open stub looks like a short at its input
  const stub = mk([{ id: 'V1', type: 'V', n: ['s', 'gnd'], value: 0 }, { id: 'R1', type: 'R', n: ['s', 'in'], value: 50 }, { id: 'T1', type: 'TLINE', n: ['in', 'end'], params: { z0: 50, td: 1e-9 } },
    { id: 'R2', type: 'R', n: ['end', 'gnd'], value: 1e9 }], ['s', 'in', 'end']);
  const r6 = sim2(stub).ac({ source: 'V1', fStart: 100e6, fStop: 500e6, points: 401 }), s6 = C.acStats(r6.f, r6.nodes.in.re, r6.nodes.in.im);
  let imin = 0; s6.db.forEach((d, i) => { if (d < s6.db[imin]) imin = i; });
  ok(rel(r6.f[imin], 250e6) < 0.005 && s6.db[imin] < -40, `a 1 ns open line is a short at its input at 250 MHz (${(r6.f[imin] / 1e6).toFixed(1)} MHz, ${s6.db[imin].toFixed(1)} dB)`);
}

// ---------- 3. op-amp dynamics ----------
{
  const fol = (extra, rload) => mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: { pulse: { v1: 0, v2: 5, delay: 1e-6 } } },
    Object.assign({ id: 'U1', type: 'OPAMP', n: ['in', 'out', 'out'], params: Object.assign({ gain: 1e5, gbw: 1e6, rails: [-15, 15] }, extra) })].concat(rload || []), ['in', 'out']);
  const t1 = sim2(fol({ slew: 0.5e6 })).transient({ tEnd: 20e-6, dt: 10e-9 }), o = t1.nodes.out;
  const slope = (at(t1.t, o, 5e-6) - at(t1.t, o, 3e-6)) / 2e-6;
  ok(rel(slope, 0.5e6) < 0.02 && Math.abs(o[o.length - 1] - 5) < 1e-3, `a follower with 0.5 V/µs: a 5 V step ramps at ${(slope / 1e6).toFixed(3)} V/µs, settles at ${o[o.length - 1].toFixed(4)} V`);
  const t2 = sim2(fol({})).transient({ tEnd: 5e-6, dt: 2e-9 }), o2 = t2.nodes.out, tau = 1 / (2 * Math.PI * 1e6);
  ok(Math.abs(at(t2.t, o2, 1e-6 + tau) / 5 - (1 - Math.exp(-1))) < 0.01, `without a slew limit the follower is a 1 MHz single pole: 63 % after τ = ${(tau * 1e9).toFixed(0)} ns`);
  const ring = cl => { const t = sim2(fol({ rout: 100 }, cl ? [{ id: 'CL', type: 'C', n: ['out', 'gnd'], value: cl }] : [])).transient({ tEnd: 40e-6, dt: 5e-9 }); return Math.max(...t.nodes.out) / 5 - 1; };
  const os0 = ring(0), os1 = ring(100e-9);
  ok(os0 < 0.01 && os1 > 0.15, `output resistance 100 Ω with 100 nF on the output: overshoot ${(100 * os1).toFixed(0)} % (none without it: ${(100 * os0).toFixed(1)} %)`);
  const off = sim2(mk([{ id: 'U1', type: 'OPAMP', n: ['gnd', 'fb', 'out'], params: { vos: 2e-3 } }, { id: 'Rf', type: 'R', n: ['out', 'fb'], value: 100000 }, { id: 'Rg', type: 'R', n: ['fb', 'gnd'], value: 1000 }], ['fb', 'out'])).dc();
  ok(Math.abs(off.nodes.out - 2e-3 * 101) < 1e-3, `a 2 mV input offset in a gain-101 stage: ${off.nodes.out.toFixed(4)} V at the output (0.202 V)`);
  const pre = sim2(mk([{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 0 }, { id: 'U1', type: 'OPAMP', n: ['in', 'out', 'out'], preset: 'lm358' }], ['in', 'out'])).ac({ source: 'V1', fStart: 1e3, fStop: 1e7, points: 201 });
  const sp = C.acStats(pre.f, pre.nodes.out.re, pre.nodes.out.im);
  ok(rel(sp.f3db, 1e6) < 0.05, `the lm358 preset as a follower: −3 dB at ${(sp.f3db / 1e6).toFixed(3)} MHz`);
}

// ---------- 4. transmission lines ----------
{
  const line = (rs, rl) => mk([{ id: 'V1', type: 'V', n: ['s', 'gnd'], value: { pulse: { v1: 0, v2: 1, delay: 0.5e-9, rise: 0.1e-9 } } }, { id: 'Rs', type: 'R', n: ['s', 'in'], value: rs },
    { id: 'T1', type: 'TLINE', n: ['in', 'end'], params: { z0: 50, td: 2e-9 } }, { id: 'RL', type: 'R', n: ['end', 'gnd'], value: rl }], ['s', 'in', 'end']);
  const t = sim2(line(50, 1e9)).transient({ tEnd: 10e-9, dt: 0.02e-9 });
  ok(Math.abs(at(t.t, t.nodes.in, 2e-9) - 0.5) < 0.01 && Math.abs(at(t.t, t.nodes.end, 2e-9)) < 1e-3 && Math.abs(at(t.t, t.nodes.end, 3.5e-9) - 1) < 0.01 && Math.abs(at(t.t, t.nodes.in, 6e-9) - 1) < 0.01,
    'matched source, open end: 0.5 V launched, nothing at the far end before 2 ns, 1 V (doubled) after, the reflection back at the source at 4 ns');
  const t2 = sim2(line(10, 1e9)).transient({ tEnd: 30e-9, dt: 0.02e-9 }), e = t2.nodes.end, mx = Math.max(...e);
  ok(mx > 1.5 && Math.abs(e[e.length - 1] - 1) < 0.15, `a 10 Ω driver into an open 50 Ω line rings: peak ${mx.toFixed(2)} V at the far end, settling toward 1 V`);
  const len = sim2(mk([{ id: 'V1', type: 'V', n: ['s', 'gnd'], value: 0 }, { id: 'T1', type: 'TLINE', n: ['s', 'e'], params: { len: 1, vf: 0.66 } }, { id: 'R', type: 'R', n: ['e', 'gnd'], value: 50 }], ['s', 'e']));
  let thr = null; try { len.transient({ tEnd: 1e-8, dt: 1e-8 }); } catch (x) { thr = x.code; }
  ok(thr === 'step', `a step longer than the line's delay (${(1 / (0.66 * 299792458) * 1e9).toFixed(2)} ns for 1 m at vf 0.66) is refused: code 'step'`);
  const t3 = sim2(line(50, 50)).transient({ tEnd: 8e-9, dt: 0.02e-9 });
  ok(Math.abs(Math.max(...t3.nodes.in) - 0.5) < 0.01, 'a matched line does not reflect: the source end stays at 0.5 V');
}

// ---------- 5. floating nodes ----------
{
  const nl = pullup => mk([{ id: 'V1', type: 'V', n: ['vcc', 'gnd'], value: 3.3 }, { id: 'Rp', type: 'R', n: ['vcc', 'pin'], value: 10000 }, { id: 'SW1', type: 'SW', n: ['pin', 'gnd'], on: false },
    { id: 'Cin', type: 'C', n: ['pin', 'gnd'], value: 5e-12 }], ['vcc', 'pin', { name: 'TP', probe: 'pin' }]);
  const healthy = sim2(nl()), faulty = sim2(nl(), { faults: [{ element: 'Rp', kind: 'open' }], seed: 7 });
  const v = s => s.measure({ kind: 'V', a: 'TP', zin: 0 }).value;
  ok(Math.abs(v(healthy) - 3.3) < 1e-3 && Math.abs(v(healthy) - v(healthy)) < 1e-12, `with its pull-up the input reads ${v(healthy).toFixed(4)} V, every time`);
  const rs = [1, 2, 3, 4, 5].map(() => v(faulty));
  ok(new Set(rs.map(x => x.toFixed(3))).size >= 4 && rs.every(x => x > -1 && x < 4.5), `pull-up open: the floating input reads ${rs.map(x => x.toFixed(2)).join(', ')} V (a different value each time)`);
  const dmm = faulty.measure({ kind: 'V', a: 'TP' }).value;
  ok(Math.abs(dmm) < 0.5, `a 10 MΩ multimeter loads the floating input down to ${dmm.toFixed(3)} V`);
  const la = faulty.measure({ kind: 'logic', nodes: ['pin'], tEnd: 0.1, dt: 1e-5, threshold: 1.5 }), lh = healthy.measure({ kind: 'logic', nodes: ['pin'], tEnd: 0.1, dt: 1e-5, threshold: 1.5 });
  ok(la.stats.pin.edges >= 6 && lh.stats.pin.edges === 0, `the logic analyser sees ${la.stats.pin.edges} random edges in 100 ms on the floating input, none with the pull-up`);
  const again = sim2(nl(), { faults: [{ element: 'Rp', kind: 'open' }], seed: 7 }), rs2 = [1, 2, 3, 4, 5].map(() => v(again));
  ok(rs2.every((x, i) => x === rs[i]), 'the same seed and the same measurements read the same numbers');
  const off = sim2(Object.assign(nl(), { pickup: false }), { faults: [{ element: 'Rp', kind: 'open' }] });
  ok(Math.abs(v(off)) < 1e-6, 'pickup: false gives v1\'s behaviour (a floating node settles at 0 V)');
  const ohm = faulty.measure({ kind: 'R', a: 'TP', b: 'gnd' }).value;
  ok(ohm === 'OL', 'the ohmmeter is not fooled by the pickup: OL');
  const out = faulty.dc().nodes.pin; ok(Math.abs(out - 1.5) < 1e-3, `the DC operating point: the open button's 1 GΩ against the 100 MΩ pickup of half the supply (${out.toFixed(3)} V)`);
}

// ---------- 6. meter modes ----------
{
  const src = value => mk([{ id: 'V1', type: 'V', n: ['a', 'gnd'], value }, { id: 'R1', type: 'R', n: ['a', 'gnd'], value: 1000 }], ['a']);
  const s = sim2(src({ sine: { amp: 1, freq: 50 } })), m = mode => s.measure({ kind: 'V', a: 'a', mode, zin: 0 }).value;
  ok(Math.abs(m('rms') - Math.SQRT1_2) < 1e-3 && Math.abs(m('ac') - Math.SQRT1_2) < 1e-3 && Math.abs(m('avg') - Math.SQRT1_2) < 2e-3 && Math.abs(m('dc')) < 1e-3, `a 1 V sine: true RMS ${m('rms').toFixed(4)}, AC ${m('ac').toFixed(4)}, average-responding ${m('avg').toFixed(4)}, DC ${m('dc').toFixed(4)} V`);
  const q = sim2(src({ pwm: { v: 2, freq: 1000, duty: 0.5 } })), mq = mode => q.measure({ kind: 'V', a: 'a', mode, zin: 0 }).value;
  ok(Math.abs(mq('dc') - 1) < 0.01 && Math.abs(mq('ac') - 1) < 0.01 && Math.abs(mq('rms') - Math.SQRT2) < 0.01 && Math.abs(mq('avg') - 1.1107) < 0.01, `a 0–2 V square wave: DC ${mq('dc').toFixed(3)}, true RMS AC ${mq('ac').toFixed(3)}, but an average-responding meter reads ${mq('avg').toFixed(3)} V (+11 %)`);
  const rect = mk([{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: { pwm: { v: 5, freq: 1000, duty: 0.5 } } }, { id: 'D1', type: 'D', n: ['a', 'k'], preset: '1n4001' }, { id: 'R1', type: 'R', n: ['k', 'gnd'], value: 1000 }], ['a', 'k']);
  const v1 = C.create(rect, { version: 1 }).measure({ kind: 'V', a: 'k' }).value, v2 = sim2(rect).measure({ kind: 'V', a: 'k', zin: 0 }).value, tr = C.create(rect).transient({ tEnd: 0.01, dt: 1e-6 });
  const truth = tr.nodes.k.reduce((p, x) => p + x, 0) / tr.nodes.k.length;
  ok(Math.abs(v2 - truth) < 0.01 && Math.abs(v1 - truth) > 0.1, `PWM through a diode: v2's DC meter reads the true average ${v2.toFixed(3)} V (${truth.toFixed(3)}); v1 read ${v1.toFixed(3)} V from averaged sources`);
  const div = mk([{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 10 }, { id: 'R1', type: 'R', n: ['a', 'm'], value: 10e6 }, { id: 'R2', type: 'R', n: ['m', 'gnd'], value: 10e6 }], ['a', 'm']);
  const ideal = sim2(div).measure({ kind: 'V', a: 'm', zin: 0 }).value, real = sim2(div).measure({ kind: 'V', a: 'm' }).value;
  ok(Math.abs(ideal - 5) < 1e-3 && Math.abs(real - 10 / 3) < 1e-3, `the meter's 10 MΩ loads a 10 MΩ divider: ${real.toFixed(3)} V instead of ${ideal.toFixed(3)} V`);
  const iq = sim2(rect).measure({ kind: 'I', element: 'R1', mode: 'dc' }).value;
  ok(Math.abs(iq - truth / 1000) < 1e-5, `the ammeter's true average too: ${(iq * 1000).toFixed(3)} mA`);
}

// ---------- 7. devices ----------
{
  const gate = preset => mk([{ id: 'V1', type: 'V', n: ['g0', 'gnd'], value: { pulse: { v1: 0, v2: 5, delay: 10e-9, rise: 1e-9 } } }, { id: 'Rg', type: 'R', n: ['g0', 'g'], value: 100 },
    { id: 'M1', type: 'NMOS', n: ['d', 'g', 'gnd'], preset }, { id: 'RL', type: 'R', n: ['vdd', 'd'], value: 10 }, { id: 'V2', type: 'V', n: ['vdd', 'gnd'], value: 12 }], ['g0', 'g', 'd', 'vdd']);
  const t1 = C.create(gate('irlz44n'), { version: 1 }).transient({ tEnd: 2e-6, dt: 1e-9 }), t2 = sim2(gate('irlz44n')).transient({ tEnd: 2e-6, dt: 1e-9, power: ['M1'] });
  const cross = (t, v, lvl) => { for (let i = 0; i < v.length; i++) if (v[i] < lvl) return t[i]; return NaN; };
  const ton1 = cross(t1.t, t1.nodes.d, 6) - 10e-9, ton2 = cross(t2.t, t2.nodes.d, 6) - 10e-9;
  let plateau = 0; for (let i = 1; i < t2.t.length; i++) if (Math.abs(t2.nodes.g[i] - t2.nodes.g[i - 1]) < 2e-3 && t2.nodes.g[i] > 1.5 && t2.nodes.g[i] < 3.5) plateau++;
  ok(ton1 < 3e-9 && ton2 > 50e-9 && plateau > 20, `IRLZ44N driven through 100 Ω: the drain falls in ${(ton2 * 1e9).toFixed(0)} ns with the gate charge (Miller plateau ${plateau} ns), ${(ton1 * 1e9).toFixed(1)} ns in v1`);
  const E = t2.power.M1.reduce((p, x, i) => p + (i ? x * (t2.t[i] - t2.t[i - 1]) : 0), 0);
  ok(E > 1e-7 && E < 1e-4, `the switching energy of that turn-on: ${(E * 1e6).toFixed(2)} µJ (the power output of v2)`);
  const z = sim2(mk([{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 12 }, { id: 'R1', type: 'R', n: ['a', 'k'], value: 1000 }, { id: 'Z1', type: 'D', n: ['gnd', 'k'], preset: 'bzx55c5v1' }], ['a', 'k'])).dc();
  ok(Math.abs(z.nodes.k - 5.1) < 0.15, `a 5.1 V Zener from 12 V through 1 kΩ: ${z.nodes.k.toFixed(3)} V`);
  const tvs = sim2(mk([{ id: 'V1', type: 'V', n: ['a', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['a', 'k'], value: 1 }, { id: 'Z1', type: 'D', n: ['gnd', 'k'], preset: 'smbj5.0a' }], ['a', 'k'])).dc();
  ok(Math.abs(tvs.branches.Z1) < 1e-4, `a healthy 5 V TVS on a 5 V rail leaks ${(tvs.branches.Z1 * 1e6).toFixed(2)} µA`);
  const buck = mk([{ id: 'Vin', type: 'V', n: ['vin', 'gnd'], value: 12 }, { id: 'Vg', type: 'V', n: ['g', 'gnd'], value: { pwm: { v: 5, freq: 100e3, duty: 0.4 } } },
    { id: 'S1', type: 'VSW', n: ['vin', 'sw', 'g', 'gnd'], params: { Ron: 0.05, Von: 3, Voff: 1 } }, { id: 'D1', type: 'D', n: ['gnd', 'sw'], preset: '1n5819' },
    { id: 'L1', type: 'L', n: ['sw', 'out'], value: 100e-6 }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 100e-6 }, { id: 'RL', type: 'R', n: ['out', 'gnd'], value: 10 }], ['vin', 'g', 'sw', 'out']);
  const bs = sim2(buck), vo = bs.measure({ kind: 'V', a: 'out', zin: 0, tEnd: 4e-3, tStart: 3e-3, dt: 50e-9 }).value, rip = bs.measure({ kind: 'scope', node: 'out', zin: 0, tEnd: 4e-3, tStart: 3.9e-3, dt: 50e-9 }).stats.pp;
  ok(vo > 4.2 && vo < 4.8 && rip < 0.02, `a buck (VSW + Schottky + 100 µH + 100 µF) at 40 %: ${vo.toFixed(3)} V out (≈ 0.4·12 − drops), ripple ${(rip * 1000).toFixed(1)} mV`);
  const dried = sim2(buck, { faults: [{ element: 'C1', kind: 'drift', factor: 0.01 }] }).measure({ kind: 'scope', node: 'out', zin: 0, tEnd: 4e-3, tStart: 3.9e-3, dt: 50e-9 }).stats.pp;
  ok(dried > 10 * rip, `the same buck with a dried-out capacitor (1 %): ripple ${(dried * 1000).toFixed(0)} mV`);
}

// ---------- 8. the scope's ground lead ----------
{
  const nl = mk([{ id: 'V1', type: 'V', n: ['s', 'gnd'], value: { pulse: { v1: 0, v2: 3.3, delay: 5e-9, rise: 1e-9 } } }, { id: 'R1', type: 'R', n: ['s', 'a'], value: 22 }], ['s', 'a']);
  const s = sim2(nl), w = { kind: 'scope', node: 'a', tEnd: 60e-9, dt: 0.05e-9 };
  const ideal = s.measure(w), long = s.measure(Object.assign({ lead: 150e-9 }, w)), spring = s.measure(Object.assign({ lead: 5e-9 }, w));
  ok(ideal.stats.max < 3.31 && long.stats.max > 4 && spring.stats.max < long.stats.max - 0.5, `a 1 ns edge: the 15 cm ground clip rings to ${long.stats.max.toFixed(2)} V (spring tip ${spring.stats.max.toFixed(2)} V, a 10 MΩ probe without lead ${ideal.stats.max.toFixed(2)} V)`);
}

// ---------- 9. checks and faults ----------
{
  ok(codes(mk([{ id: 'T1', type: 'TLINE', n: ['a', 'b'] }, { id: 'R', type: 'R', n: ['a', 'gnd'], value: 1 }, { id: 'R2', type: 'R', n: ['b', 'gnd'], value: 1 }], ['a', 'b'])).includes('param'), 'a line without td or len is refused');
  ok(codes(Object.assign(mk([{ id: 'R', type: 'R', n: ['a', 'gnd'], value: 1 }], ['a']), { pickup: { hum: -1 } })).includes('value') && codes(Object.assign(mk([{ id: 'R', type: 'R', n: ['a', 'gnd'], value: 1 }], ['a']), { pickup: 'x' })).includes('value'), 'pickup: bad values are refused');
  ok(!codes(Object.assign(mk([{ id: 'R', type: 'R', n: ['a', 'gnd'], value: 1 }], [{ name: 'a', pickup: false }]), { pickup: { hum: 60, amp: 0.5 } }), 'error').length, 'pickup settings and a node without pickup are accepted');
  const nl = mk([{ id: 'U1', type: 'OPAMP', n: ['gnd', 'fb', 'out'] }, { id: 'Rf', type: 'R', n: ['out', 'fb'], value: 100000 }, { id: 'Rg', type: 'R', n: ['fb', 'gnd'], value: 1000 }], ['fb', 'out']);
  ok(C.checkFaults(nl, [{ element: 'U1', kind: 'drift', param: 'vos', add: 0.005 }]).length === 0 && C.checkFaults(nl, [{ element: 'U1', kind: 'drift', param: 'vos', add: 'x' }]).length === 1, 'drift {add}: a number added after the factor');
  const d = sim2(nl, { faults: [{ element: 'U1', kind: 'drift', param: 'vos', add: 0.005 }] }).dc();
  ok(Math.abs(d.nodes.out - 0.505) < 2e-3, `a drifted offset (5 mV) shows ×101 at the output: ${d.nodes.out.toFixed(3)} V`);
  const tl = mk([{ id: 'T1', type: 'TLINE', n: ['a', 'b'], params: { td: 1e-9 } }, { id: 'R', type: 'R', n: ['a', 'gnd'], value: 1 }, { id: 'R2', type: 'R', n: ['b', 'gnd'], value: 1 }], ['a', 'b']);
  ok(C.checkFaults(tl, [{ element: 'T1', kind: 'drift', param: 'z0', factor: 2 }], V2).length === 0 && C.checkFaults(tl, [{ element: 'T1', kind: 'drift', param: 'body' }], V2).length === 1, 'faults on the new parts');
}
console.log(fails ? `\n${fails} of ${n} failed` : `\ncircuit physics: ${n} checks passed`);
process.exit(fails ? 1 : 0);
