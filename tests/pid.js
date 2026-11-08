/* The control-loop engine pid@1 (src/engines/pid/pid.js, docs/INTERACTIVE_ENGINES.md §3) against analytic results:
   1. metrics on known curves (first order, second order: rise, overshoot, peak time, settling 2 %);
   2. plants in open loop: first order (+ dead time), second order overshoot vs ζ, integrator, DC motor, thermal, tank;
   3. closed loop: P control ess = 1/(1 + K), PI removes it, IAE / ISE analytic, an integrator follows a ramp with ess = slope/(K·Kp),
      anti-windup reduces the overshoot after saturation, setpoint weighting and derivative on the measurement, the sample time;
   4. seeded noise (determinism), check() / checkSpec() codes, the step budget, the speed of 20000 steps, the sim-spec adapter;
   5. JS ↔ Python (tools/pid.py) parity of check / check_spec on more than 30 models and specs.
   Usage: node tests/pid.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaPID = ENGINES.mod('pid@1');
const P = NoemaPID;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const pct = x => (100 * x).toPrecision(2) + ' %';
const codes = (x, level) => P.check(x).filter(p => !level || p.level === level).map(p => p.code);
const scodes = s => P.checkSpec(s).filter(p => p.level === 'error').map(p => p.code);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e.code === code; } };
const run = (m, tEnd, dt, opts) => P.create(m, opts).run({ tEnd, dt });
const acc = {};

ok(P.id === 'pid@1' && Object.isFrozen(P) && typeof P.engine.workerSource === 'string' && P.engine.id === 'pid@1', 'NoemaPID.id is pid@1, the API is frozen, NoemaPID.engine is ready for ACT.registerEngine');
ok(P.ZN.ultimate.PID.Kp === 0.6 && P.ZN.ultimate.PID.Ti === 0.5 && P.ZN.ultimate.PID.Td === 0.125 && P.ZN.reaction.PI.Kp === 0.9 && Object.isFrozen(P.ZN.ultimate.PID), 'the Ziegler–Nichols tables are frozen constants');

// ---------- 1. metrics on known curves ----------
{
  const N = 100001, t = Float64Array.from({ length: N }, (_, i) => i * 1e-4), y = t.map(x => 1 - Math.exp(-x));
  const m = P.metrics(t, y, { yf: 1 });
  acc.rise1 = rel(m.rise, Math.log(9)); acc.settle1 = rel(m.settling, Math.log(50));
  ok(acc.rise1 < 1e-4 && acc.settle1 < 1e-4 && m.overshoot === 0, `metrics of 1 − e^(−t): rise ${m.rise.toFixed(5)} (ln 9 = ${Math.log(9).toFixed(5)}), settling ${m.settling.toFixed(5)} (ln 50 = ${Math.log(50).toFixed(5)}), no overshoot`);
  const z = 0.4, wn = 3, wd = wn * Math.sqrt(1 - z * z), ph = Math.acos(z);
  const y2 = t.map(x => 1 - Math.exp(-z * wn * x) * Math.sin(wd * x + ph) / Math.sqrt(1 - z * z));
  const m2 = P.metrics(t, y2, { yf: 1 }), os_ = 100 * Math.exp(-Math.PI * z / Math.sqrt(1 - z * z));
  ok(Math.abs(m2.overshoot - os_) < 1e-4 && Math.abs(m2.peakTime - Math.PI / wd) < 2e-4, `metrics of a second-order curve (ζ = 0.4): overshoot ${m2.overshoot.toFixed(4)} % (formula ${os_.toFixed(4)} %), peak at ${m2.peakTime.toFixed(4)} s (π/ωd = ${(Math.PI / wd).toFixed(4)})`);
  const y3 = t.map(x => (x < 2 ? 0 : 2 * (1 - Math.exp(-(x - 2))))), m3 = P.metrics(t, y3, { t0: 2, yf: 2 }), m3t = P.metrics(t, y3, { t0: 2 });
  ok(rel(m3.rise, Math.log(9)) < 1e-4 && rel(m3.settling, Math.log(50)) < 1e-4 && Math.abs(m3t.yFinal - 2) < 2e-3, `metrics from t0 = 2 (rise ${m3.rise.toFixed(4)}, settling ${m3.settling.toFixed(4)}); the final value from the last 2 % of the samples (${m3t.yFinal.toFixed(5)})`);
  const m4 = P.metrics(t, t.map(() => 3));
  ok(Number.isNaN(m4.rise) && Number.isNaN(m4.overshoot) && m4.yFinal === 3, 'a flat curve has no rise, overshoot or settling (NaN)');
}

// ---------- 2. open loop ----------
{
  const r = run({ plant: { type: 'fopdt', K: 2, tau: 1.5 }, mode: 'open', setpoint: { step: { to: 1 } } }, 15, 0.001);
  const m = r.metrics;
  ok(rel(m.rise, 1.5 * Math.log(9)) < 2e-3 && rel(m.settling, 1.5 * Math.log(50)) < 2e-3 && rel(m.yFinal, 2) < 1e-4, `first order K = 2, τ = 1.5: rise ${m.rise.toFixed(4)} (τ·ln 9 = ${(1.5 * Math.log(9)).toFixed(4)}), settling ${m.settling.toFixed(4)} (τ·ln 50 = ${(1.5 * Math.log(50)).toFixed(4)}), final ${m.yFinal.toFixed(5)}`);
  const iAt = r.t.findIndex(x => x >= 1.5);
  acc.fo = Math.abs(r.y[iAt] - 2 * (1 - Math.exp(-1)));
  ok(acc.fo < 1e-9, `RK4: y(τ) = K·(1 − e^−1) to ${acc.fo.toExponential(1)}`);
  const d = run({ plant: { type: 'fopdt', K: 1, tau: 1, theta: 0.5 }, mode: 'open', setpoint: 1 }, 5, 0.001);
  const at = x => d.y[Math.round(x / 0.001)];
  ok(at(0.5) === 0 && Math.abs(at(1.5) - (1 - Math.exp(-1))) < 1e-9, `dead time θ = 0.5: nothing before 0.5 s, then the same curve shifted (y(1.5) = ${at(1.5).toFixed(6)})`);
  const rows = [];
  for (const z of [0.1, 0.3, 0.5, 0.7]) {
    const s = run({ plant: { type: 'second', K: 1, wn: 2, zeta: z }, mode: 'open', setpoint: 1, metrics: { band: 0.02 } }, z < 0.2 ? 60 : 30, 0.0005).metrics;
    const ex = 100 * Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)), tp = Math.PI / (2 * Math.sqrt(1 - z * z));
    rows.push([z, s.overshoot, ex, s.peakTime, tp]);
  }
  acc.os = Math.max(...rows.map(r => Math.abs(r[1] - r[2])));
  ok(acc.os < 0.05 && rows.every(r => Math.abs(r[3] - r[4]) < 1e-3), `second order (ωn = 2): overshoot vs 100·e^(−πζ/√(1−ζ²)) — ${rows.map(r => `ζ ${r[0]}: ${r[1].toFixed(3)} / ${r[2].toFixed(3)} %`).join(', ')}; peak times within 1 ms`);
  const ig = run({ plant: { type: 'integrator', K: 0.5 }, mode: 'open', setpoint: 2 }, 4, 0.01);
  ok(Math.abs(ig.y[ig.y.length - 1] - 4) < 1e-9, 'integrator: y = K·u·t = 0.5·2·4 = 4');
  const mo = run({ plant: { type: 'motor' }, mode: 'open', setpoint: 1 }, 5, 0.001), w = 0.01 / (1 * 0.1 + 0.01 * 0.01);
  ok(rel(mo.y[mo.y.length - 1], w) < 1e-4, `DC motor (J 0.01, b 0.1, Kt 0.01, R 1, L 0.5) at 1 V: ω = Kt/(R·b + Kt²) = ${w.toFixed(5)} rad/s (got ${mo.y[mo.y.length - 1].toFixed(5)})`);
  const mp = run({ plant: { type: 'motor', L: 0, output: 'position' }, mode: 'open', setpoint: 1 }, 20, 0.001);
  ok(mp.y[mp.y.length - 1] > 1.8 && mp.y[mp.y.length - 1] < w * 20, `DC motor position (L = 0): the angle grows about ω·t (${mp.y[mp.y.length - 1].toFixed(3)} rad after 20 s)`);
  const th = run({ plant: { type: 'thermal', C: 500, R: 2, Tamb: 20 }, mode: 'open', setpoint: 10 }, 30000, 5);
  ok(Math.abs(th.y[th.y.length - 1] - 40) < 1e-6, 'thermal plant: T = Tamb + P·R = 20 + 10·2 = 40 °C');
  const tk = run({ plant: { type: 'tank', A: 1, k: 0.1 }, mode: 'open', setpoint: 0.05 }, 400, 0.05);
  ok(Math.abs(tk.y[tk.y.length - 1] - 0.25) < 1e-4, `tank: level h = (q/k)² = 0.25 m (got ${tk.y[tk.y.length - 1].toFixed(5)})`);
  const tm = run({ plant: { type: 'tank', A: 1, k: 0.1, hMax: 0.2 }, mode: 'open', setpoint: 0.05 }, 400, 0.05);
  ok(Math.max(...tm.y) <= 0.2, 'tank: the level stops at hMax (overflow)');
}

// ---------- 3. closed loop ----------
{
  const essRows = [];
  for (const [K, Kp] of [[1, 1], [2, 2], [1, 9]]) {
    const r = run({ plant: { type: 'fopdt', K, tau: 1 }, controller: { Kp }, setpoint: 1 }, 20, 0.001);
    essRows.push([K * Kp, r.metrics.ess, 1 / (1 + K * Kp)]);
  }
  acc.ess = Math.max(...essRows.map(r => Math.abs(r[1] - r[2])));
  ok(acc.ess < 1e-9, `P control of a first-order plant: ess = 1/(1 + K·Kp) — ${essRows.map(r => `K·Kp ${r[0]}: ${r[1].toFixed(6)} / ${r[2].toFixed(6)}`).join(', ')}`);
  const pi = run({ plant: { type: 'fopdt', K: 2, tau: 1 }, controller: { Kp: 2, Ki: 2 }, setpoint: 1 }, 30, 0.001);
  ok(Math.abs(pi.metrics.ess) < 1e-6, `PI removes it: ess = ${pi.metrics.ess.toExponential(2)}`);
  const Kc = 3, a = 1 + Kc, e = 1 / a, Tn = 5, rP = run({ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: Kc }, setpoint: 1 }, Tn, 0.0005);
  const iae = e * Tn + (1 - e) / a * (1 - Math.exp(-a * Tn)), ise = e * e * Tn + 2 * e * (1 - e) / a * (1 - Math.exp(-a * Tn)) + (1 - e) ** 2 / (2 * a) * (1 - Math.exp(-2 * a * Tn));
  acc.iae = rel(rP.metrics.iae, iae);
  ok(acc.iae < 2e-3 && rel(rP.metrics.ise, ise) < 2e-3, `IAE ${rP.metrics.iae.toFixed(5)} (analytic ${iae.toFixed(5)}), ISE ${rP.metrics.ise.toFixed(5)} (analytic ${ise.toFixed(5)})`);
  const rp = run({ plant: { type: 'integrator', K: 2 }, controller: { Kp: 4 }, setpoint: { ramp: { slope: 0.5 } } }, 10, 0.001);
  ok(Math.abs(rp.metrics.ess - 0.5 / 8) < 1e-6, `an integrator under P control follows a ramp with ess = slope/(K·Kp) = 0.0625 (got ${rp.metrics.ess.toFixed(6)})`);
  // anti-windup: PI on a slow plant, the actuator saturates at ±1
  const loop = aw => ({ plant: { type: 'fopdt', K: 1, tau: 5 }, controller: { Kp: 4, Ki: 4, uMin: -1, uMax: 1, antiWindup: aw }, setpoint: { step: { to: 0.8 } } });
  const [none, clamp, back] = ['none', 'clamp', 'backcalc'].map(aw => run(loop(aw), 60, 0.001).metrics);
  acc.aw = [none.overshoot, clamp.overshoot, back.overshoot];
  ok(none.overshoot > 2 * clamp.overshoot && none.overshoot > 2 * back.overshoot && none.satTime > 0 && clamp.settling < none.settling, `anti-windup after saturation: overshoot none ${none.overshoot.toFixed(2)} %, clamping ${clamp.overshoot.toFixed(2)} %, back-calculation ${back.overshoot.toFixed(2)} %; saturated ${none.satTime.toFixed(2)} s; settling ${none.settling.toFixed(2)} → ${clamp.settling.toFixed(2)} s`);
  const u = run(loop('clamp'), 60, 0.001).u;
  ok(Math.max(...u) <= 1 && Math.min(...u) >= -1, 'the controller output stays inside uMin … uMax');
  const kick = c => run({ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 2, Kd: 1, N: 10, c }, setpoint: { step: { to: 1, at: 1 } } }, 3, 0.001).u[1000];
  const k0 = kick(0), k1 = kick(1);
  ok(Math.abs(k0 - 2) < 1e-9 && k1 > 15, `derivative on the measurement (c = 0): no kick at the step (u = Kp = ${k0}); c = 1 kicks (u = ${k1.toFixed(1)})`);
  const b0 = run({ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 2, Ki: 1, b: 0 }, setpoint: { step: { to: 1, at: 1 } } }, 3, 0.001).u[1000];
  ok(Math.abs(b0) < 1e-9, 'setpoint weight b = 0: no proportional jump at the step');
  const ds = run({ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 2, Ki: 1, Ts: 0.1 }, setpoint: 1 }, 2, 0.001).u;
  let held = true; for (let k = 0; k < 2000; k++) if (k % 100 && ds[k] !== ds[k - 1]) held = false;
  ok(held && ds[100] !== ds[99], 'sample time Ts = 0.1 s: u changes every 100 steps of 1 ms only (zero-order hold)');
  const ld = run({ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1, Ki: 1 }, setpoint: 1, load: { step: { to: -0.5, at: 10 } } }, 40, 0.001);
  ok(Math.abs(ld.y[ld.y.length - 1] - 1) < 1e-4 && Math.min(...ld.y.slice(10500)) < 0.9, 'a load disturbance at 10 s: y dips, PI brings it back');
  const un = run({ plant: { type: 'second', K: 1, wn: 1, zeta: 0.1 }, controller: { Kp: 2, Ki: 20 }, setpoint: 1 }, 200, 0.01);
  ok(un.metrics.unstable && Number.isNaN(un.y[un.y.length - 1]), 'an unstable loop stops at 1e12 and reports unstable (the rest is NaN)');
}

// ---------- 4. noise, checks, speed, adapter ----------
{
  const m = { plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1, Ki: 1 }, setpoint: 1, noise: { std: 0.05 } };
  const a1 = run(m, 10, 0.001, { seed: 7 }), a2 = run(m, 10, 0.001, { seed: 7 }), a3 = run(m, 10, 0.001, { seed: 8 });
  ok(JSON.stringify(Array.from(a1.ym)) === JSON.stringify(Array.from(a2.ym)) && JSON.stringify(Array.from(a1.ym)) !== JSON.stringify(Array.from(a3.ym)), 'seeded noise: the same seed gives the same run, another seed another');
  let s = 0, s2 = 0; for (let i = 0; i < a1.ym.length; i++) { const d = a1.ym[i] - a1.y[i]; s += d; s2 += d * d; }
  const sd = Math.sqrt(s2 / a1.ym.length - (s / a1.ym.length) ** 2);
  ok(rel(sd, 0.05) < 0.03 && Math.abs(s / a1.ym.length) < 0.003, `the measurement noise has σ = ${sd.toFixed(4)} (0.05) and mean ≈ 0`);
  const fixed = run({ ...m, noise: { std: 0.05, seed: 3 } }, 10, 0.001, { seed: 7 }), fixed2 = run({ ...m, noise: { std: 0.05, seed: 3 } }, 10, 0.001, { seed: 99 });
  ok(JSON.stringify(Array.from(fixed.ym)) === JSON.stringify(Array.from(fixed2.ym)), 'noise.seed fixes the noise whatever the task seed');
  const bad = [
    [null, 'model'], [{ plant: 5, controller: {} }, 'plant'], [{ plant: { type: 'pump' }, controller: {} }, 'plant'], [{ plant: { type: 'fopdt', K: 1 }, controller: { Kp: 1 } }, 'plant'],
    [{ plant: { type: 'fopdt', K: 1, tau: 1 } }, 'controller'], [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1, uMin: 2, uMax: 1 } }, 'controller'],
    [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1, antiWindup: 'yes' } }, 'controller'], [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, setpoint: { pulse: {} } }, 'signal'],
    [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, noise: { std: -1 } }, 'noise'], [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, transient: { tEnd: 100, dt: 1e-4 } }, 'budget'],
    [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1, Ts: 0.001 }, transient: { tEnd: 10, dt: 0.01 } }, 'controller'], [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, mode: 'half' }, 'mode'],
    [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, bindings: [{ element: 'load', expr: 'x' }] }, 'binding'], [{ plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 1 }, pid: 1 }, 'unknown-field'],
  ];
  const miss = bad.filter(([x, c]) => !codes(x, 'error').includes(c));
  ok(!miss.length, `check() finds the error code of ${bad.length} bad models ${miss.length ? JSON.stringify(miss[0]) : ''}`);
  const w = codes({ plant: { type: 'fopdt', K: 1, tau: 0.01 }, controller: { Kp: 0, antiWindup: 'clamp' }, transient: { tEnd: 10, dt: 0.01 } }, 'warning');
  ok(['no-gain', 'no-limits', 'stiff'].every(c => w.includes(c)), 'warnings: no gain, anti-windup without limits, a step longer than half the fastest time constant');
  ok(throwsCode(() => P.create({ plant: {} }), 'invalid') && throwsCode(() => P.create({ plant: { type: 'integrator', K: 1 }, controller: { Kp: 1 } }).run({ tEnd: 100, dt: 1e-4 }), 'budget'), 'create() and run() throw their codes (invalid, budget)');
  const mm = { plant: { type: 'second', K: 1, wn: 2, zeta: 0.3, theta: 0.05 }, controller: { Kp: 2, Ki: 1, Kd: 0.2, N: 10, uMin: -5, uMax: 5, antiWindup: 'backcalc' }, setpoint: { step: { to: 1, at: 0.5 } }, load: { sine: { amp: 0.1, freq: 0.5 } }, noise: { std: 0.01 } };
  const sim = P.create(mm, { seed: 1 }); sim.run({ tEnd: 2, dt: 0.001 });
  const t0 = process.hrtime.bigint(); sim.run({ tEnd: 20, dt: 0.001 }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  acc.ms = ms;
  ok(ms < 200, `speed: 20000 steps (second order + dead time, PID with filter, back-calculation, noise, load) in ${ms.toFixed(1)} ms (< 200 ms)`);
}
const spec = () => ({ format: 'noema.sim-spec/v1', engine: 'pid@1',
  params: [{ id: 'Kp', kind: 'slider', label: 'kp', min: 0, max: 10, default: 1 }, { id: 'Ki', kind: 'slider', label: 'ki', min: 0, max: 10, default: 0 }, { id: 'aw', kind: 'toggle', label: 'aw', default: false }],
  model: { plant: { type: 'fopdt', K: 1, tau: 2 }, controller: { Kp: 1, Ki: 0, uMin: -2, uMax: 2 }, setpoint: { step: { to: 1 } },
    bindings: [{ element: 'controller', prop: 'Kp', expr: 'Kp' }, { element: 'controller', prop: 'Ki', expr: 'Ki' }, { element: 'controller', prop: 'antiWindup', expr: 'aw' }], transient: { tEnd: 20, dt: 0.001 } },
  outputs: [{ id: 't', kind: 'series', time: true }, { id: 'y', kind: 'series', signal: 'y' }, { id: 'u', kind: 'series', signal: 'u' },
    { id: 'ess', kind: 'scalar', metric: 'ess' }, { id: 'os', kind: 'scalar', metric: 'overshoot' }, { id: 'y5', kind: 'scalar', signal: 'y', at: 5 }, { id: 'uMax', kind: 'scalar', signal: 'u', stat: 'max' }] });
{
  ok(P.checkSpec(spec()).length === 0 && P.engine.check(spec()).length === 0, 'a PI explorer spec passes checkSpec');
  const E = P.engine, sp = spec(), prep = E.prepare(sp, ex => env => env[ex]), inst = E.create(sp, { seed: 1 });
  const o1 = inst.run(prep({ Kp: 3, Ki: 0, aw: false }));
  ok(Math.abs(o1.ess - 0.25) < 1e-6 && o1.t.length === 2000 && o1.y.length === 2000, `adapter: Kp = 3 gives ess = 1/(1+3) = ${o1.ess.toFixed(6)}; series thinned to ${o1.t.length} points`);
  ok(Math.abs(o1.y5 - 0.75 * (1 - Math.exp(-5 * 4 / 2))) < 1e-4 && o1.uMax === 2, `adapter: at (y(5) = ${o1.y5.toFixed(5)}) and stat (u max = ${o1.uMax}, the limit)`);
  const o2 = inst.run(prep({ Kp: 3, Ki: 3, aw: false })), o3 = inst.run(prep({ Kp: 3, Ki: 3, aw: true }));
  ok(Math.abs(o2.ess) < 1e-4 && o3.os < o2.os, `adapter: the integral removes ess; the anti-windup toggle cuts the overshoot ${o2.os.toFixed(2)} → ${o3.os.toFixed(2)} %`);
  const w = {}; (new Function('self', E.workerSource))(w);
  const wo = w.noemaEngine.create(sp, { seed: 1 }).run(prep({ Kp: 3, Ki: 3, aw: true }));
  ok(JSON.stringify(wo) === JSON.stringify(o3), 'workerSource: the engine and adapter from their own source give the same outputs');
  const br = inst.run(prep({ Kp: 3, Ki: 3, aw: true, })); ok(JSON.stringify(br) === JSON.stringify(o3), 'adapter: the same inputs give the same outputs (cached)');
  const sc = [
    [s => { delete s.model; }, 'model'], [s => { delete s.model.transient; }, 'transient'], [s => { s.model.bindings[0].prop = 'Kq'; }, 'binding'],
    [s => { s.outputs[1].signal = 'w'; }, 'output'], [s => { s.outputs[3].metric = 'gain'; }, 'output'], [s => { s.outputs.push({ id: 'z', kind: 'scalar', signal: 'y' }); }, 'output'],
    [s => { s.outputs.push({ id: 'z', kind: 'series', metric: 'ess' }); }, 'output'], [s => { s.outputs[5].stat = 'max'; }, 'output'], [s => { s.outputs[6].stat = 'median'; }, 'output'],
    [s => { s.outputs.push({ id: 'z', kind: 'scalar', signal: 'y', at: 1, time: true }); }, 'output'], [s => { s.model.plant.tau = -1; }, 'plant'],
  ];
  const miss = sc.filter(([f, c]) => { const s = spec(); f(s); return !scodes(s).includes(c); });
  ok(!miss.length, `checkSpec() finds the code of ${sc.length} bad specs ${miss.length ? String(miss[0][0]) : ''}`);
}

// ---------- 5. JS ↔ Python parity ----------
{
  const pl = { type: 'fopdt', K: 1, tau: 1 };
  const models = [null, 5, [], {}, { plant: [] }, { plant: { type: 3 } }, { plant: { type: 'motor', J: 0, output: 'angle', zz: 1 }, mode: 'open', controller: { Kp: 1 } },
    { plant: { type: 'tank', A: 1, k: 1, h0: 2, hMax: 1 }, controller: 'pid' }, { plant: { type: 'second', K: 'x', wn: 0 }, controller: { Kp: 0, Ki: null, N: 0, Tf: -1, antiWindup: 'clamp', zz: 2 } },
    { plant: pl, controller: { Kp: 1, uMin: 3, uMax: 3, antiWindup: 'backcalc', Tt: 0 } },
    { plant: pl, controller: { Kp: 1 }, setpoint: 'x', load: { step: { from: 1 } }, disturbance: { ramp: { slope: 1, at: 5, until: 2 } } },
    { plant: pl, controller: { Kp: 1 }, setpoint: { steps: [[0, 1], [2, 0], [1, 3]] }, load: { sine: { amp: 1 } }, disturbance: { step: 5 } },
    { plant: pl, controller: { Kp: 1 }, setpoint: { steps: [] }, load: { steps: [[0, 1]] }, disturbance: { a: 1, b: 2 } },
    { plant: pl, controller: { Kp: 1 }, noise: 3, metrics: { band: 0.9, x: 1 } }, { plant: pl, controller: { Kp: 1 }, noise: { std: 1, seed: 1.5, q: 1 }, metrics: 7 },
    { plant: pl, controller: { Kp: 1, Ts: 0.0001 }, transient: { tEnd: 10, dt: 0.001 } }, { plant: pl, controller: { Kp: 1 }, transient: { dt: 'h', x: 1 } }, { plant: pl, controller: { Kp: 1 }, transient: { tEnd: -1, dt: 0 } },
    { plant: pl, controller: { Kp: 1 }, transient: 5 }, { plant: { type: 'second', K: 1, wn: 100, zeta: 2 }, controller: { Kp: 1 }, transient: { tEnd: 1 } },
    { plant: { type: 'motor' }, controller: { Kp: 1 }, transient: { tEnd: 10, dt: 0.5 } },
    { plant: pl, controller: { Kp: 1 }, setpoint: { steps: [[0, 1]] }, bindings: [5, { element: 'pump', expr: 'x' }, { element: 'noise', expr: 'x' }, { element: 'plant', prop: 'output', expr: 'x' }, { element: 'plant', prop: 'tau', expr: '' }, { element: 'setpoint', prop: 'value', expr: 1 }, { element: 'controller', prop: 'antiWindup', expr: true, z: 1 }] },
    { plant: pl, controller: { Kp: 1 }, setpoint: 2, load: { ramp: { slope: 1 } }, bindings: [{ element: 'setpoint', expr: 'r' }, { element: 'load', prop: 'ramp.slope', expr: 'r' }, { element: 'load', expr: 'r' }] },
    { plant: pl, controller: { Kp: 1 }, bindings: 'x' }, { plant: pl, controller: { Kp: 1 }, bindings: Array.from({ length: 25 }, () => ({ element: 'plant', prop: 'K', expr: 'k' })) },
  ];
  const specs = [null, {}, { model: 2 }, { model: { plant: pl, controller: { Kp: 1 } } }, spec(),
    ...[
      s => { s.outputs = [5, { kind: 'x' }, { id: 'a', kind: 'scalar' }, { id: 'b', kind: 'series', time: 1 }, { id: 'c', kind: 'scalar', time: true }, { id: 'd', kind: 'scalar', signal: 'q' }, { id: 'e', kind: 'series', metric: 'ess' }, { id: 'f', kind: 'scalar', metric: 'x', at: 1 }, { id: 'g', kind: 'scalar', signal: 'y', at: -1, stat: 'median' }, { id: 'h', kind: 'scalar', signal: 'u', at: 'T', zz: 1 }, { id: 'i', kind: 'scalar', signal: ['y'] }]; },
      s => { s.model.controller = 5; s.model.transient = { tEnd: 'T' }; }, s => { s.model.bindings.push({ element: 'disturbance', expr: 'd' }); },
    ].map(f => { const s = spec(); f(s); return s; })];
  const tmp = path.join(os.tmpdir(), 'noema-pid-parity.json'); fs.writeFileSync(tmp, JSON.stringify({ models, specs }));
  const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import pid as P; d = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({'m': [P.check(x) for x in d['models']], 's': [P.check_spec(x) for x in d['specs']]}, ensure_ascii=False))`, tmp], { encoding: 'utf8' }));
  const js = { m: models.map(x => P.check(x)), s: specs.map(x => P.checkSpec(x)) };
  const diff = ['m', 's'].flatMap(k => js[k].map((r, i) => JSON.stringify(r) === JSON.stringify(py[k][i]) ? null : [k, i, r, py[k][i]]).filter(Boolean));
  const total = models.length + specs.length, findings = js.m.flat().length + js.s.flat().length;
  ok(!diff.length && total >= 30, `parity: JS and Python agree on ${models.length} models and ${specs.length} specs (${total} cases, ${findings} findings) ${diff.length ? JSON.stringify(diff[0]).slice(0, 700) : ''}`);
}

console.log(`\npid: metrics on 1 − e^−t rise ${pct(acc.rise1)} / settling ${pct(acc.settle1)}; RK4 first order ${acc.fo.toExponential(1)}; overshoot vs ζ ≤ ${acc.os.toFixed(4)} pp; ess vs 1/(1+K) ≤ ${acc.ess.toExponential(1)}; IAE ${pct(acc.iae)}; anti-windup overshoot ${acc.aw.map(x => x.toFixed(2)).join(' / ')} %; 20000 steps ${acc.ms.toFixed(1)} ms`);
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
