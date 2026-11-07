/* The thermal engine thermal@1 (engine/src/39_engine_thermal.js, docs/INTERACTIVE_ENGINES.md §2) against analytic results:
   1. steady state: ΔT = P·Rth exactly (a MOSFET on a heatsink), convection h·A, radiation, parallel paths, energy balance (a PCB trace);
   2. transients: the RC step (τ = RC within 0.5 %), trapezoidal vs backward Euler, a sine source's amplitude, PWM mean and ripple;
   3. the time constants (one node, a massless node in the path, two nodes); a room with a thermostat (hysteresis, duty);
   4. check() / checkSpec() codes, the step budget, determinism, the speed of 20000 steps, the sim-spec adapter;
   5. JS ↔ Python (tools/thermal.py) parity of check / check_spec on more than 30 networks and specs.
   Usage: node tests/thermal.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaThermal = ENGINES.mod('thermal@1');
const T = NoemaThermal;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const pct = x => (100 * x).toPrecision(2) + ' %';
const codes = (x, level) => T.check(x).filter(p => !level || p.level === level).map(p => p.code);
const scodes = s => T.checkSpec(s).filter(p => p.level === 'error').map(p => p.code);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e.code === code; } };
const SIG = T.SIGMA, K0 = 273.15;

ok(T.id === 'thermal@1' && Object.isFrozen(T) && typeof T.engine.workerSource === 'string' && T.engine.id === 'thermal@1', 'NoemaThermal.id is thermal@1, the API is frozen, NoemaThermal.engine is ready for ACT.registerEngine');

// ---------- 1. steady state ----------
const mosfet = (P = 20, amb = 40) => ({ format: 'noema.thermal/v1', ambient: amb,
  nodes: [{ id: 'J', C: 0.02 }, { id: 'Cs', C: 1 }, { id: 'HS', C: 40 }],
  links: [{ id: 'Rjc', a: 'J', b: 'Cs', R: 0.5 }, { id: 'Rcs', a: 'Cs', b: 'HS', R: 0.2 }, { id: 'Rsa', a: 'HS', R: 1.5 }],
  sources: [{ id: 'Pd', node: 'J', P }] });
{
  ok(T.check(mosfet()).length === 0, 'a MOSFET on a heatsink has no problems');
  const r = T.create(mosfet()).steady();
  ok(Math.abs(r.nodes.J - 84) < 1e-9 && Math.abs(r.nodes.HS - 70) < 1e-9, `MOSFET: Tj = 40 + 20 W · (0.5 + 0.2 + 1.5) K/W = 84 °C (got ${r.nodes.J.toFixed(12)}), Ths = 70 °C`);
  ok(Math.abs(r.links.Rjc - 20) < 1e-9 && Math.abs(r.links.Rsa - 20) < 1e-9, 'every link of the chain carries the 20 W');
  const conv = T.create({ ambient: 20, nodes: [{ id: 'p', C: 5 }], links: [{ id: 'h', a: 'p', conv: { h: 10, A: 0.05 } }], sources: [{ id: 'q', node: 'p', P: 3 }] }).steady();
  ok(Math.abs(conv.nodes.p - (20 + 3 / 0.5)) < 1e-9, `convection: ΔT = P/(h·A) = 6 K (got ${(conv.nodes.p - 20).toFixed(12)})`);
  const P = 2, eps = 0.9, A = 0.01, Ta = 25, ex = Math.pow(P / (eps * SIG * A) + Math.pow(Ta + K0, 4), 0.25) - K0;
  const rd = T.create({ ambient: Ta, nodes: [{ id: 'p', C: 1 }], links: [{ id: 'r', a: 'p', rad: { eps, A } }], sources: [{ id: 'q', node: 'p', P }] }).steady();
  ok(Math.abs(rd.nodes.p - ex) < 1e-6, `radiation only: εσA(T⁴ − T∞⁴) = P → T = ${ex.toFixed(4)} °C (got ${rd.nodes.p.toFixed(6)})`);
  const both = T.create({ ambient: Ta, nodes: [{ id: 'p', C: 1 }], links: [{ id: 'r', a: 'p', rad: { eps, A } }, { id: 'h', a: 'p', conv: { h: 5, A } }], sources: [{ id: 'q', node: 'p', P }] }).steady();
  ok(Math.abs(both.links.r + both.links.h - P) < 1e-8 && both.nodes.p < rd.nodes.p, `radiation + convection: the two flows add up to P (${(both.links.r + both.links.h).toFixed(10)} W), cooler than radiation alone`);
}
{
  const r = T.create({ ambient: 0, nodes: [{ id: 'a' }, { id: 'w', fixed: 10 }], links: [{ id: 'r1', a: 'a', R: 2 }, { id: 'r2', a: 'a', G: 0.5 }, { id: 'r3', a: 'a', b: 'w', R: 4 }], sources: [{ id: 'q', node: 'a', P: 10 }] }).steady();
  const ex = (10 + 10 / 4) / (0.5 + 0.5 + 0.25);
  ok(Math.abs(r.nodes.a - ex) < 1e-12 && r.nodes.w === 10, `parallel R, G and a fixed-temperature wall: T = ${ex} °C (massless node, got ${r.nodes.a})`);
  // a PCB trace: 9 copper segments in a row, heat in the middle, convection from each
  const seg = 9, nodes = [], links = [];
  for (let i = 0; i < seg; i++) { nodes.push({ id: 's' + i, C: 0.01 }); links.push({ id: 'h' + i, a: 's' + i, conv: { h: 15, A: 1e-4 } }); if (i) links.push({ id: 'k' + i, a: 's' + (i - 1), b: 's' + i, R: 30 }); }
  const tr = T.create({ ambient: 25, nodes, links, sources: [{ id: 'I2R', node: 's4', P: 0.05 }] }).steady();
  const sumQ = Array.from({ length: seg }, (_, i) => tr.links['h' + i]).reduce((a, b) => a + b, 0);
  ok(Math.abs(sumQ - 0.05) < 1e-12 && Math.abs(tr.nodes.s0 - tr.nodes.s8) < 1e-10 && tr.nodes.s4 > tr.nodes.s3 && tr.nodes.s3 > tr.nodes.s2, `PCB trace: the convection flows add up to the 50 mW, the profile is symmetric and peaks at the middle (${tr.nodes.s4.toFixed(2)} °C)`);
}

// ---------- 2. transients ----------
const rc = (extra = {}) => ({ ambient: 25, nodes: [{ id: 'J', C: 10 }], links: [{ id: 'R1', a: 'J', R: 2 }], sources: [{ id: 'P', node: 'J', P: 5 }], ...extra });
let tauErr, trapErr, beErr;
{
  const tau = 20, s = T.create(rc());
  const r = s.transient({ tEnd: 100, dt: 0.2, points: 20001, at: [20, 60] });
  const v = r.nodes.J, tg = 25 + 10 * (1 - Math.exp(-1));
  let i = 0; while (v[i] < tg) i++;
  const tCross = r.t[i - 1] + (r.t[i] - r.t[i - 1]) * (tg - v[i - 1]) / (v[i] - v[i - 1]);
  tauErr = rel(tCross, tau);
  ok(tauErr < 0.005, `RC step: 63.2 % of ΔT = P·R reached at t = ${tCross.toFixed(4)} s = τ = RC = 20 s (error ${pct(tauErr)})`);
  trapErr = Math.abs(r.at['nodes:J'][0] - tg);
  ok(trapErr < 1e-3 && Math.abs(r.at['nodes:J'][1] - (25 + 10 * (1 - Math.exp(-3)))) < 1e-3, `T(τ) and T(3τ) via at: ${r.at['nodes:J'][0].toFixed(6)} °C vs ${tg.toFixed(6)} (error ${trapErr.toExponential(2)} K)`);
  const b = s.transient({ tEnd: 100, dt: 0.2, method: 'be', at: [20] });
  beErr = Math.abs(b.at['nodes:J'][0] - tg);
  ok(beErr < 0.05 && beErr > 10 * trapErr, `backward Euler is first order: error ${beErr.toExponential(2)} K at τ (trapezoidal ${trapErr.toExponential(2)} K)`);
  const st = s.transient({ tEnd: 10, dt: 0.1, start: 'steady' });
  ok(Math.abs(st.stats.nodes.J.max - 35) < 1e-9 && Math.abs(st.stats.nodes.J.min - 35) < 1e-9, 'start: steady begins at the steady state and stays there');
  ok(Math.abs(r.stats.nodes.J.final - (25 + 10 * (1 - Math.exp(-5)))) < 1e-3 && Math.abs(r.stats.sources.P.mean - 5) < 1e-12, 'stats: final, the source mean');
}
{
  // a step source from 2 W to 7 W at t0 = 30 s, from the steady state at 2 W
  const s = T.create(rc({ sources: [{ id: 'P', node: 'J', P: { step: { P: 7, t0: 30, P0: 2 } } }] }));
  const r = s.transient({ tEnd: 90, dt: 0.1, start: 'steady', at: [29.9, 50] });
  const ex = 29 + 10 * (1 - Math.exp(-1));
  ok(Math.abs(r.at['nodes:J'][0] - 29) < 1e-9 && Math.abs(r.at['nodes:J'][1] - ex) < 2e-3, `step source 2 → 7 W at 30 s: 29 °C before, ${ex.toFixed(4)} °C one τ later (got ${r.at['nodes:J'][1].toFixed(4)})`);
}
{
  // sine: amplitude of a first-order response |H| = P·R/√(1 + (ωτ)²)
  const f = 0.05, w = 2 * Math.PI * f, s = T.create(rc({ sources: [{ id: 'P', node: 'J', P: { sine: { offset: 5, amp: 4, freq: f } } }] }));
  const r = s.transient({ tEnd: 400, dt: 0.05, points: 8001 });
  const late = r.nodes.J.filter((_, i) => r.t[i] > 300), amp = (Math.max(...late) - Math.min(...late)) / 2, ex = 4 * 2 / Math.sqrt(1 + (w * 20) ** 2);
  ok(rel(amp, ex) < 0.005, `sine source: amplitude ${amp.toFixed(5)} K vs P·R/√(1+(ωτ)²) = ${ex.toFixed(5)} K (error ${pct(rel(amp, ex))})`);
  // PWM: the mean follows duty·P; the ripple of a fast PWM is small
  const pw = T.create(rc({ sources: [{ id: 'P', node: 'J', P: { pwm: { P: 10, freq: 1, duty: 0.3 } } }] }));
  const rp = pw.transient({ tEnd: 200, dt: 0.01, points: 20001 });
  const tail = rp.nodes.J.filter((_, i) => rp.t[i] > 150), mean = tail.reduce((a, b) => a + b, 0) / tail.length, rip = Math.max(...tail) - Math.min(...tail);
  const exRip = 10 * 0.3 * 0.7 / 10;   // ≈ P·d(1−d)·T/C for T ≪ τ
  ok(Math.abs(mean - 31) < 0.01 && rel(rip, exRip) < 0.02, `PWM 10 W at 30 %: mean ${mean.toFixed(4)} °C (25 + 0.3·10·2 = 31), ripple ${rip.toFixed(4)} K ≈ P·d(1−d)/(f·C) = ${exRip}`);
  ok(Math.abs(rp.stats.sources.P.mean - 3) < 0.01, `the PWM source's mean power is duty·P = 3 W (${rp.stats.sources.P.mean.toFixed(4)})`);
}
{
  // radiation transient reaches its steady state
  const net = { ambient: 25, nodes: [{ id: 'p', C: 2 }], links: [{ id: 'r', a: 'p', rad: { eps: 0.9, A: 0.01 } }, { id: 'h', a: 'p', conv: { h: 5, A: 0.01 } }], sources: [{ id: 'q', node: 'p', P: 2 }] };
  const s = T.create(net), st = s.steady().nodes.p, tr = s.transient({ tEnd: 2000, dt: 1 });
  ok(Math.abs(tr.stats.nodes.p.final - st) < 1e-3, `radiation + convection transient settles at the steady state ${st.toFixed(4)} °C (got ${tr.stats.nodes.p.final.toFixed(4)})`);
}

// ---------- 3. time constants, thermostat ----------
{
  ok(Math.abs(T.create(rc()).taus()[0] - 20) < 1e-9, 'one node: τ = R·C = 20 s');
  const m = T.create({ ambient: 25, nodes: [{ id: 'a', C: 10 }, { id: 'z' }], links: [{ id: 'r1', a: 'a', b: 'z', R: 1.5 }, { id: 'r2', a: 'z', R: 0.5 }] }).taus();
  ok(m.length === 1 && Math.abs(m[0] - 20) < 1e-9, `a massless node in the path: τ = C·(R1 + R2) = 20 s (got ${m[0]})`);
  // two nodes: C1 = 1, C2 = 4, R12 = 1, R2a = 1 → the eigenvalues of [[1, -1], [-1/4, 2/4]]
  const two = T.create({ ambient: 0, nodes: [{ id: 'a', C: 1 }, { id: 'b', C: 4 }], links: [{ id: 'r', a: 'a', b: 'b', R: 1 }, { id: 's', a: 'b', R: 1 }] }).taus();
  const tr = 1 + 0.5, det = 0.5 - 0.25, l1 = (tr - Math.sqrt(tr * tr - 4 * det)) / 2, l2 = (tr + Math.sqrt(tr * tr - 4 * det)) / 2;
  ok(Math.abs(two[0] - 1 / l1) < 1e-9 && Math.abs(two[1] - 1 / l2) < 1e-9, `two nodes: τ = ${two.map(x => x.toFixed(6)).join(', ')} s (analytic ${(1 / l1).toFixed(6)}, ${(1 / l2).toFixed(6)})`);
  const mos = T.create(mosfet()).taus();
  ok(mos.length === 3 && mos[0] > 50 && mos[2] < 0.05, `MOSFET + heatsink: the heatsink is slow (τ1 = ${mos[0].toFixed(1)} s), the junction fast (τ3 = ${(mos[2] * 1e3).toFixed(1)} ms)`);
}
let dutyErr;
{
  // a room: C = 2 MJ/K, R = 0.01 K/W to 5 °C outside, a 2 kW heater, thermostat 19.5 … 20.5 °C
  const room = { ambient: 5, nodes: [{ id: 'room', C: 2e6, T0: 15 }], links: [{ id: 'walls', a: 'room', R: 0.01 }],
    sources: [{ id: 'heater', node: 'room', P: 2000 }], thermostats: [{ id: 'ts', sensor: 'room', source: 'heater', low: 19.5, high: 20.5 }] };
  ok(T.check(room).length === 0, 'a room with a heater and a thermostat has no problems');
  const s = T.create(room), r = s.transient({ tEnd: 4 * 86400, dt: 10, points: 20001 });
  const late = r.t.map((t, i) => [t, r.nodes.room[i], r.thermostats.ts[i]]).filter(([t]) => t > 86400);
  const lo = Math.min(...late.map(x => x[1])), hi = Math.max(...late.map(x => x[1])), duty = late.reduce((a, x) => a + x[2], 0) / late.length;
  const tau = 2e4, Ton = 5 + 2000 * 0.01, ton = tau * Math.log((Ton - 19.5) / (Ton - 20.5)), toff = tau * Math.log((20.5 - 5) / (19.5 - 5)), exD = ton / (ton + toff);
  dutyErr = Math.abs(duty - exD);
  ok(lo > 19.45 && hi < 20.55, `thermostat: the room stays in 19.5 … 20.5 °C (got ${lo.toFixed(3)} … ${hi.toFixed(3)})`);
  ok(dutyErr < 0.01, `thermostat duty ${duty.toFixed(4)} vs t_on/(t_on + t_off) = ${exD.toFixed(4)} from the exponentials`);
  let sw = 0; for (let i = 1; i < r.thermostats.ts.length; i++) if (r.thermostats.ts[i] !== r.thermostats.ts[i - 1]) sw++;
  ok(sw > 10, `the heater switches on and off (${sw} switches in 4 days)`);
  const cool = { ...room, nodes: [{ id: 'room', C: 2e6, T0: 30 }], ambient: 35, sources: [{ id: 'ac', node: 'room', P: -3000 }], thermostats: [{ id: 'ts', sensor: 'room', source: 'ac', low: 23, high: 25, mode: 'cool' }] };
  const rc2 = T.create(cool).transient({ tEnd: 2 * 86400, dt: 20 });
  const lt = rc2.nodes.room.filter((_, i) => rc2.t[i] > 86400);
  ok(Math.min(...lt) > 22.9 && Math.max(...lt) < 25.1, `a cooling thermostat (mode cool) keeps 23 … 25 °C (${Math.min(...lt).toFixed(2)} … ${Math.max(...lt).toFixed(2)})`);
}

// ---------- 4. checks, budget, determinism, speed, adapter ----------
{
  const bad = [
    [null, 'format'], [{ nodes: [], links: 'x' }, 'format'], [{ format: 'x', nodes: [], links: [] }, 'format'],
    [{ nodes: [{ id: 'a', C: -1 }], links: [{ id: 'r', a: 'a', R: 1 }] }, 'value'],
    [{ nodes: [{ id: 'a', C: 1 }, { id: 'a', C: 1 }], links: [] }, 'dup-id'],
    [{ nodes: [{ id: 'ambient' }], links: [] }, 'id'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', b: 'q', R: 1 }] }, 'unknown-node'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', R: 1, G: 2 }] }, 'link'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', b: 'a', R: 1 }] }, 'self-loop'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', rad: { eps: 2, A: 1 } }] }, 'value'],
    [{ nodes: [{ id: 'a' }, { id: 'f', fixed: 3 }], links: [{ id: 'r', a: 'a', R: 1 }], sources: [{ id: 'p', node: 'f', P: 1 }] }, 'fixed-node'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', R: 1 }], sources: [{ id: 'p', node: 'a', P: { pwm: { P: 1, freq: 1 } } }] }, 'value'],
    [{ nodes: [{ id: 'a' }], links: [{ id: 'r', a: 'a', R: 1 }], sources: [{ id: 'p', node: 'a', P: 1 }], thermostats: [{ id: 't', sensor: 'a', source: 'x', low: 1, high: 2 }] }, 'unknown-source'],
    [{ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ id: 'r', a: 'a', b: 'b', R: 1 }] }, 'singular'],
    [{ nodes: Array.from({ length: 51 }, (_, i) => ({ id: 'n' + i })), links: [] }, 'size'],
  ];
  const miss = bad.filter(([x, c]) => !codes(x, 'error').includes(c));
  ok(!miss.length, `check() finds the error code of ${bad.length} bad networks ${miss.length ? JSON.stringify(miss[0]) : ''}`);
  const fl = codes({ nodes: [{ id: 'a', C: 1 }, { id: 'b', C: 1 }], links: [{ id: 'r', a: 'a', b: 'b', R: 1 }], zz: 1 }, 'warning');
  ok(fl.includes('floating') && fl.includes('unknown-field'), 'warnings: an insulated group (floating, no steady state), an unknown field');
  ok(throwsCode(() => T.create({ nodes: [{ id: 'a', C: 1 }, { id: 'b', C: 1 }], links: [{ id: 'r', a: 'a', b: 'b', R: 1 }] }).steady(), 'singular'), 'steady() of an insulated group throws singular');
  ok(throwsCode(() => T.create(rc()).transient({ tEnd: 1, dt: 1e-6 }), 'budget') && throwsCode(() => T.create({ nodes: 5 }), 'invalid'), 'the step budget (200000) and an invalid network throw their codes');
  const a1 = T.create(mosfet()).transient({ tEnd: 300, dt: 0.05 }), a2 = T.create(mosfet()).transient({ tEnd: 300, dt: 0.05 });
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'deterministic: two runs give identical results');
  const ring = { ambient: 25, nodes: [], links: [], sources: [{ id: 'p', node: 'n0', P: { pwm: { P: 5, freq: 0.2, duty: 0.5 } } }] };
  for (let i = 0; i < 10; i++) { ring.nodes.push({ id: 'n' + i, C: 1 + i }); ring.links.push({ id: 'k' + i, a: 'n' + i, b: 'n' + ((i + 1) % 10), R: 0.5 }, { id: 'h' + i, a: 'n' + i, conv: { h: 10, A: 0.01 } }); }
  const s = T.create(ring); s.transient({ tEnd: 10, dt: 0.01 });
  const t0 = process.hrtime.bigint(); s.transient({ tEnd: 200, dt: 0.01 }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(ms < 200, `speed: 20000 steps of a 10-node network with 20 links and PWM in ${ms.toFixed(1)} ms (< 200 ms)`);
  const ringR = JSON.parse(JSON.stringify(ring)); ringR.links.push({ id: 'rr', a: 'n5', rad: { eps: 0.8, A: 0.01 } });
  const t1 = process.hrtime.bigint(); T.create(ringR).transient({ tEnd: 200, dt: 0.01 }); const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
  ok(ms2 < 1000, `with radiation (Newton every step): 20000 steps in ${ms2.toFixed(1)} ms`);
}
const spec = () => ({ format: 'noema.sim-spec/v1', engine: 'thermal@1',
  params: [{ id: 'Rsa', kind: 'slider', label: 'rsa', min: 0.2, max: 5, default: 1.5 }, { id: 'P', kind: 'slider', label: 'p', min: 1, max: 50, default: 20 }],
  model: { network: mosfet(), bindings: [{ element: 'Rsa', expr: 'Rsa' }, { element: 'Pd', prop: 'P', expr: 'P' }], transient: { tEnd: 600, dt: 0.1 } },
  outputs: [{ id: 't', kind: 'series', time: true }, { id: 'tj', kind: 'series', node: 'J' }, { id: 'tjSS', kind: 'scalar', node: 'J' },
    { id: 'tj60', kind: 'scalar', node: 'J', at: 60 }, { id: 'tjMax', kind: 'scalar', node: 'J', stat: 'max' }, { id: 'q', kind: 'scalar', link: 'Rsa' }, { id: 'tau1', kind: 'scalar', tau: 1 }] });
{
  ok(T.checkSpec(spec()).length === 0 && T.engine.check(spec()).length === 0, 'a MOSFET spec passes checkSpec');
  const E = T.engine, sp = spec(), prep = E.prepare(sp, ex => env => env[ex]), inst = E.create(sp, { seed: 1 });
  const out = inst.run(prep({ Rsa: 1, P: 10 }));
  ok(Math.abs(out.tjSS - (40 + 10 * 1.7)) < 1e-9 && Math.abs(out.q - 10) < 1e-9 && out.t.length <= 2000 && out.tj.length === out.t.length, `adapter: bindings reach the network (Tj = 40 + 10·1.7 = ${out.tjSS}), series thinned to ${out.t.length} points`);
  ok(out.tj60 < out.tjMax && out.tjMax <= out.tjSS + 1e-9 && out.tau1 > 30, `adapter: at, stat and tau (Tj(60 s) = ${out.tj60.toFixed(2)}, max ${out.tjMax.toFixed(2)}, τ1 = ${out.tau1.toFixed(1)} s)`);
  const bad = inst.run(prep({ Rsa: -1, P: 10 }));
  ok(Number.isNaN(bad.tjSS) && Array.isArray(bad.tj) && bad.tj.length === 0, 'adapter: a binding that breaks the network gives NaN and empty series (nothing throws)');
  const w = {}; (new Function('self', E.workerSource))(w);
  const wout = w.noemaEngine.create(sp, { seed: 1 }).run(prep({ Rsa: 1, P: 10 }));
  ok(JSON.stringify(wout) === JSON.stringify(out), 'workerSource: the engine and adapter from their own source give the same outputs');
  const sc = [
    [s => { delete s.model; }, 'model'], [s => { s.model.spice = 1; }, 'unknown-field'], [s => { s.model.network.links[0].R = 0; }, 'value'],
    [s => { s.model.bindings[0].element = 'R9'; }, 'binding'], [s => { s.model.bindings[0].prop = 'G'; }, 'binding'],
    [s => { s.model.transient.dt = 1e-5; }, 'budget'], [s => { s.model.transient.method = 'rk4'; }, 'transient'],
    [s => { s.outputs[2].node = 'Q'; }, 'output'], [s => { s.outputs[3].stat = 'max'; }, 'output'], [s => { s.outputs[6].tau = 4; }, 'output'],
    [s => { delete s.model.transient; }, 'output'], [s => { s.outputs.push({ id: 'x', kind: 'scalar', node: 'J', link: 'Rsa' }); }, 'output'],
  ];
  const miss = sc.filter(([f, c]) => { const s = spec(); f(s); return !scodes(s).includes(c); });
  ok(!miss.length, `checkSpec() finds the code of ${sc.length} bad specs ${miss.length ? String(miss[0][0]) : ''}`);
}

// ---------- 5. JS ↔ Python parity ----------
{
  const nets = [null, 5, [], { nodes: 'a', links: [] }, { nodes: [], links: [], sources: {}, thermostats: 3 }, { format: 'x', nodes: [], links: [] },
    mosfet(), rc(), { ambient: -300, nodes: [{ id: 'a', C: 1, zz: 1 }], links: [{ id: 'r', a: 'a', R: 1, q: 2 }], meta: {}, x: 1 },
    { nodes: [{ id: 'a', fixed: 'x', C: 1 }, { id: '1b' }, 5, { id: 'c', T0: -400 }, { id: 'c' }], links: [{ id: 'r', a: 'c', conv: { h: 0, A: 'x', z: 1 } }, { id: 'r2', a: 'c', rad: 5 }, { id: 'r3', a: 'c' }, 'x', { id: 'r4', a: 7, b: [] , G: -1 }] },
    { nodes: [{ id: 'a' }, { id: 'f', fixed: 1 }, { id: 'g', fixed: 2 }], links: [{ id: 'r', a: 'f', b: 'g', R: 1 }, { id: 'r2', a: 'a', b: 'a', R: 1 }], sources: [{ id: 'p', node: 'f', P: { step: { t0: -1 } } }, { id: 'q', node: 'zz' }, { id: 'p2', node: 'a', P: { pwm: { P: 1, freq: 0, duty: 2, zz: 1 } } }, { id: 'p3', node: 'a', P: { sine: 3 } }, { id: 'p4', node: 'a', P: { dc: 1, step: {} } }, { id: 'p5', node: 'a', P: 'x' }] },
    { nodes: [{ id: 'a', C: 1 }], links: [{ id: 'r', a: 'a', R: 1 }], sources: [{ id: 'p', node: 'a', P: 1 }], thermostats: [{ id: 't', sensor: 'a', source: 'p', low: 2, high: 1, mode: 'warm' }, { id: 't2', sensor: 'q', source: 'p', low: 'x' }, 7, { id: 't3', sensor: 'a', source: 'zz', low: 1, high: 2 }] },
    { nodes: [{ id: 'a', C: 1 }, { id: 'b', C: 1 }, { id: 'c' }, { id: 'd' }, { id: 'e', C: 2 }, { id: 'w', fixed: 0 }], links: [{ id: 'r', a: 'a', b: 'b', R: 1 }, { id: 'r2', a: 'c', b: 'd', R: 1 }, { id: 'r3', a: 'e', b: 'w', R: 1 }] },
    { nodes: Array.from({ length: 51 }, (_, i) => ({ id: 'n' + i })), links: Array.from({ length: 201 }, (_, i) => ({ id: 'l' + i, a: 'n0', R: 1 })) },
  ];
  const specs = [null, {}, { model: 3 }, { model: {} }, { model: { network: 5 } }, { model: { network: { nodes: [] } } }, spec(),
    ...[
      s => { s.model.extra = 1; s.model.bindings = 'x'; }, s => { s.model.bindings = [5, { element: 'J', prop: 'G', expr: '' }, { element: 'ambient', expr: 3, z: 1 }, { element: 'Rsa', prop: 'R', expr: 'x' }, { element: 'nope', expr: 'a' }, { element: 'Pd', prop: 'step.P', expr: 'a' }] },
      s => { s.model.transient = 5; }, s => { s.model.transient = { dt: -1, method: 'x', start: 'y', points: 1.5, q: 1 }; }, s => { s.model.transient = { tEnd: 'T', dt: 'h', points: 20002 }; },
      s => { s.model.transient = { tEnd: 100, dt: 1e-4 }; }, s => { s.model.network.links[0].R = -1; },
      s => { s.outputs = [5, { kind: 'x' }, { id: 'a', kind: 'scalar' }, { id: 'b', kind: 'series', time: 1 }, { id: 'c', kind: 'scalar', time: true }, { id: 'd', kind: 'scalar', tau: 0 }, { id: 'e', kind: 'scalar', tau: 1, at: 3 }, { id: 'f', kind: 'scalar', node: 'Rsa' }, { id: 'g', kind: 'series', link: 'Rsa', stat: 'max' }, { id: 'h', kind: 'scalar', node: 'J', at: -1, stat: 'median' }, { id: 'i', kind: 'scalar', source: 'Pd', at: 'tA', zz: 1 }, { id: 'j', kind: 'scalar', link: ['x'] }]; },
      s => { delete s.model.transient; },
      s => { s.model.network.thermostats = [{ id: 'ts', sensor: 'J', source: 'Pd', low: 80, high: 90 }]; s.outputs = [{ id: 'a', kind: 'scalar', thermostat: 'ts' }, { id: 'b', kind: 'scalar', thermostat: 'ts', stat: 'mean' }, { id: 'c', kind: 'series', thermostat: 'ts' }, { id: 'd', kind: 'scalar', thermostat: 'J' }]; },
      s => { s.model.network.sources[0].P = { pwm: { P: 10, freq: 1, duty: 0.5 } }; s.model.bindings = [{ element: 'Pd', prop: 'pwm.duty', expr: 'd' }, { element: 'Pd', expr: 'P' }, { element: 'J', prop: 'T0', expr: 'x' }, { element: 'HS', prop: 'fixed', expr: 'x' }]; },
      s => { s.model.network.links[2] = { id: 'Rsa', a: 'HS', conv: { h: 10, A: 0.1 } }; s.model.bindings = [{ element: 'Rsa', prop: 'conv.A', expr: 'A' }, { element: 'Rsa', expr: 'A' }]; },
    ].map(f => { const s = spec(); f(s); return s; })];
  const tmp = path.join(os.tmpdir(), 'noema-thermal-parity.json'); fs.writeFileSync(tmp, JSON.stringify({ nets, specs }));
  const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import thermal as T; d = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({'n': [T.check(x) for x in d['nets']], 's': [T.check_spec(x) for x in d['specs']]}, ensure_ascii=False))`, tmp], { encoding: 'utf8' }));
  const js = { n: nets.map(x => T.check(x)), s: specs.map(x => T.checkSpec(x)) };
  const diff = ['n', 's'].flatMap(k => js[k].map((r, i) => JSON.stringify(r) === JSON.stringify(py[k][i]) ? null : [k, i, r, py[k][i]]).filter(Boolean));
  const total = nets.length + specs.length, findings = js.n.flat().length + js.s.flat().length;
  ok(!diff.length && total >= 30, `parity: JS and Python agree on ${nets.length} networks and ${specs.length} specs (${total} cases, ${findings} findings) ${diff.length ? JSON.stringify(diff[0]).slice(0, 700) : ''}`);
}

console.log(`\nthermal: τ error ${pct(tauErr)}, T(τ) error trapezoidal ${trapErr.toExponential(2)} K / backward Euler ${beErr.toExponential(2)} K, thermostat duty error ${dutyErr.toFixed(4)}`);
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
