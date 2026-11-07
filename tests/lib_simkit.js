/* NoemaSimKit (engine/src/46_lib_simkit.js, docs/library/simkit.md) against published values and exact solutions:
   1. randomness: MRG32k3a's jump-ahead matrices (RngStreams.c A1p76 … A2p127), its recurrence checked in exact BigInt arithmetic,
      streams / substreams / antithetics, every variate's moments, KS tests; special functions (AS241, t quantiles, Γ, incomplete Γ, β);
   2. the calendar's tie rule, the executive (three-phase, activities with pre-emption, Zeno, budget);
   3. integrators: orders by Richardson, events (bouncing ball, simultaneous, terminal, hysteresis), Robertson (HNW II §IV.10),
      symplectic energy, delay equations, DAEs; SSA, τ-leaping, SDEs;
   4. output analysis (CIs, batch means, MSER-5, Little), sensitivity (Ishigami's Sobol' indices, Morris), LHS, input modelling,
      variance reduction, calibration, units;
   5. the stepper interface, co-simulation, the Worker source, determinism.
   Usage: node tests/lib_simkit.js */
'use strict';
const path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaSimKit = ENGINES.kernel('simkit');
const S = NoemaSimKit;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const max2 = (a, b) => (a > b ? a : b);
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const mv = a => { let m = 0; for (const x of a) m += x; m /= a.length; let v = 0; for (const x of a) v += (x - m) ** 2; return [m, v / (a.length - 1)]; };

ok(Object.isFrozen(S) && S.version === 1, 'NoemaSimKit: a frozen module');

// ---------- 1. randomness ----------
{
  const J = S.jumps();
  const pub = { a1p76: [[82758667, 1871391091, 4127413238], [3672831523, 69195019, 1871391091], [3672091415, 3528743235, 69195019]],
    a2p76: [[1511326704, 3759209742, 1610795712], [4292754251, 1511326704, 3889917532], [3859662829, 4292754251, 3708466080]],
    a1p127: [[2427906178, 3580155704, 949770784], [226153695, 1230515664, 3580155704], [1988835001, 986791581, 1230515664]],
    a2p127: [[1464411153, 277697599, 1610723613], [32183930, 1464411153, 1022607788], [2824425944, 32183930, 2093834863]] };
  ok(Object.keys(pub).every(k => JSON.stringify(J[k]) === JSON.stringify(pub[k])), 'MRG32k3a jump-ahead matrices A^(2^76), A^(2^127) of both components = the published A1p76, A2p76, A1p127, A2p127 (L\'Ecuyer et al. 2002, RngStreams.c)');
  // the recurrence in exact integers (BigInt) from the package seed: the same outputs
  const m1 = 4294967087n, m2 = 4294944443n; let s = [12345n, 12345n, 12345n, 12345n, 12345n, 12345n]; const ref = [];
  for (let i = 0; i < 1000; i++) { const p1 = ((1403580n * s[1] - 810728n * s[0]) % m1 + m1) % m1, p2 = ((527612n * s[5] - 1370589n * s[3]) % m2 + m2) % m2; s = [s[1], s[2], p1, s[4], s[5], p2]; ref.push(Number(p1 > p2 ? p1 - p2 : p1 - p2 + m1) * 2.328306549295727688e-10); }
  const r = S.stream(0, '', { state: [12345, 12345, 12345, 12345, 12345, 12345] }), got = ref.map(() => r());
  ok(got.every((v, i) => v === ref[i]) && near(got[0], 0.127011122046577, 1e-15), `MRG32k3a from the package seed: 1000 outputs = the exact-integer recurrence of L'Ecuyer 1999 (first ${got[0].toFixed(15)})`);
  const a = S.stream(7, 'arr'), b = S.stream(7, 'arr'), c = S.stream(7, 'svc'), d = S.stream(8, 'arr');
  const A = Array.from({ length: 5 }, () => a()), B = Array.from({ length: 5 }, () => b()), Cc = Array.from({ length: 5 }, () => c()), D = Array.from({ length: 5 }, () => d());
  ok(JSON.stringify(A) === JSON.stringify(B) && A[0] !== Cc[0] && A[0] !== D[0], 'streams: the same (seed, name) gives the same numbers; another name or seed another stream');
  const s1 = S.stream(7, 'arr').sub(1), s2 = S.stream(7, 'arr').sub(2), an = S.stream(7, 'arr', { antithetic: true }), base = S.stream(7, 'arr');
  ok(s1() !== s2() && [1, 2, 3].every(() => { const u = base(), v = an(); return Math.abs(u + v - 1) < 1e-15; }), 'substreams differ; the antithetic stream gives 1 − u');
  // independence between streams: correlation of 20 000 pairs ≈ 0
  { const x = S.stream(3, 'x'), y = S.stream(3, 'y'); let sxy = 0, sx = 0, sy = 0, sxx = 0, syy = 0; const N = 20000; for (let i = 0; i < N; i++) { const u = x(), v = y(); sx += u; sy += v; sxy += u * v; sxx += u * u; syy += v * v; }
    const rho = (sxy / N - sx * sy / N / N) / Math.sqrt((sxx / N - (sx / N) ** 2) * (syy / N - (sy / N) ** 2)); ok(Math.abs(rho) < 0.03, `two streams are uncorrelated (ρ = ${rho.toFixed(4)} over 20 000 pairs, |ρ| < 3/√N)`); }
  // moments of the variates (100 000 draws; tolerances ≈ 5 standard errors)
  const N = 100000, R = S.stream(11, 'moments');
  const chk = (name, f, m, v) => { const x = Array.from({ length: N }, f), [mm, vv] = mv(x); ok(near(mm, m, 5 * Math.sqrt(v / N) + 1e-12) && rel(vv, v, 0.04), `${name}: mean ${mm.toFixed(4)} (${m}), var ${vv.toFixed(4)} (${+v.toFixed(4)})`); };
  chk('exp(rate 2)', () => R.exp(2), 0.5, 0.25);
  chk('normal(3, 2)', () => R.normal(3, 2), 3, 4);
  chk('gamma(2.5, 2)', () => R.gamma(2.5, 2), 5, 10);
  chk('gamma(0.4, 1) (k < 1)', () => R.gamma(0.4, 1), 0.4, 0.4);
  chk('beta(2, 3)', () => R.beta(2, 3), 0.4, 0.04);
  chk('triangular(0, 1, 4)', () => R.tri(0, 1, 4), 5 / 3, (0 + 16 + 1 - 0 - 0 - 4) / 18);
  chk('lognormal(μ 0, σ 0.5)', () => R.lognormal(0, 0.5), Math.exp(0.125), (Math.exp(0.25) - 1) * Math.exp(0.25));
  chk('weibull(k 2, λ 1)', () => R.weibull(2, 1), Math.sqrt(Math.PI) / 2, 1 - Math.PI / 4);
  chk('erlang(3, mean 6)', () => R.erlang(3, 6), 6, 12);
  chk('poisson(4)', () => R.poisson(4), 4, 4);
  chk('poisson(250) (inversion from the mode)', () => R.poisson(250), 250, 250);
  chk('binomial(20, 0.3)', () => R.binomial(20, 0.3), 6, 4.2);
  chk('binomial(1000, 0.4) (from the mode)', () => R.binomial(1000, 0.4), 400, 240);
  chk('empirical [1, 2, 4] (piecewise linear)', () => R.empirical([1, 2, 4]), 2.25, ((1 + 2 + 4) / 3 + (4 + 8 + 16) / 3) / 2 - 2.25 ** 2);
  chk('discrete [0, 1, 5] w [1, 2, 1]', () => [0, 1, 5][R.discrete([1, 2, 1])], 1.75, (0 + 2 + 25) / 4 - 1.75 ** 2);
  const sh = R.shuffle([1, 2, 3, 4, 5]); ok(sh.slice().sort().join() === '1,2,3,4,5' && R.int(3) < 3 && [1].includes(R.pick([1])), 'shuffle keeps the elements; int and pick stay in range');
  const ks = S.ksTest(Array.from({ length: 2000 }, () => R.exp(1)), { dist: 'exp', mean: 1 }), ks2 = S.ksTest(Array.from({ length: 2000 }, () => R.normal(0, 1)), { dist: 'normal', mean: 0, sd: 1 }), ks3 = S.ksTest(Array.from({ length: 2000 }, () => R.uniform(0, 1)), { dist: 'exp', mean: 1 });
  ok(ks.p > 0.01 && ks2.p > 0.01 && ks3.p < 1e-6, `Kolmogorov–Smirnov: exp and normal draws pass (p ${ks.p.toFixed(3)}, ${ks2.p.toFixed(3)}), uniforms tested as exp fail (p ${ks3.p.toExponential(1)})`);
  const D0 = S.dist({ dist: 'gamma', mean: 4, cv: 0.5 }), D1 = S.dist({ dist: 'exp', mean: -1 }), D2 = S.dist({ dist: 'lognormal', mean: 2, sd: 1 });
  ok(D0.ok && near(D0.mean, 4, 1e-12) && near(D0.var, 4, 1e-12) && !D1.ok && Number.isNaN(D1.draw(R)) && near(D2.var, 1, 1e-12), 'dist(): gamma by mean and cv, lognormal by its own moments, a bad parameter → ok false and NaN draws');
  ok(S.DISTS.every(k => S.dist(k === 'empirical' || k === 'discrete' ? { dist: k, values: [1, 2] } : { dist: k, value: 1, mean: 1, sd: 0.5, min: 0, max: 2, mode: 1, k: 2, shape: 2, scale: 1, a: 2, b: 2, cv: 0.5 }).ok), 'every distribution kind has a working {dist, …} object');
  // special functions
  ok(near(S.normInv(0.975), 1.959963984540054, 1e-14) && near(S.normInv(1e-10), -6.361340902404056, 1e-12) && near(S.normCdf(1.96), 0.9750021048517795, 1e-13), 'Φ⁻¹(0.975) = 1.959963984540054 (AS241), Φ⁻¹(1e-10) = −6.36134090240, Φ(1.96) = 0.97500210485');
  ok(near(S.tq(0.975, 9), 2.262157162740992, 1e-10) && near(S.tq(0.95, 1), 6.313751514675043, 1e-9) && near(S.tq(0.995, 30), 2.749995653567, 1e-9) && near(S.tq(0.975, 1e8), 1.959963984540054, 1e-7), 't quantiles: t(0.975, 9) = 2.262157, t(0.95, 1) = 6.313752, t(0.995, 30) = 2.749996 (Abramowitz & Stegun Table 26.10), t → z for large df');
  ok(near(S.lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-14) && near(S.lgamma(101), 363.73937555556347, 1e-10) && near(S.gammaP(1, 1), 1 - Math.exp(-1), 1e-15) && near(S.gammaP(5, 3), 0.18473675547622792, 1e-14) && near(S.betaI(2, 3, 0.4), 0.5248, 1e-14), 'ln Γ(½) = ln √π, ln Γ(101) = ln 100!, P(1, 1) = 1 − e⁻¹, P(5, 3) = 0.184737, I₀.₄(2, 3) = 0.5248');
  ok(near(S.digamma(1), -0.5772156649015329, 1e-13) && near(S.trigamma(1), Math.PI ** 2 / 6, 1e-12), 'ψ(1) = −γ (Euler–Mascheroni), ψ′(1) = π²/6');
}

// ---------- 2. the calendar and the executive ----------
{
  const cal = S.calendar();
  cal.schedule(2, 'b', null, 0); cal.schedule(1, 'a2', null, 1); cal.schedule(1, 'a1', null, 0); cal.schedule(1, 'a3', null, 1); const x = cal.schedule(1.5, 'gone'); cal.schedule(3, 'c');
  ok(cal.cancel(x) && !cal.cancel(x) && cal.size === 5, 'calendar: cancel once, the size counts live entries');
  const order = []; let e; while ((e = cal.pop())) order.push(e.kind);
  ok(order.join() === 'a1,a2,a3,b,c' && cal.peek() === Infinity, 'tie rule: time, then the smaller priority, then insertion order (FIFO)');
  // three-phase: C events after all B events of the instant
  const sim = S.sim({ tEnd: 10 }); const seen = []; let q = 0;
  sim.at(1, () => { q++; seen.push('B1'); }); sim.at(1, () => { q++; seen.push('B2'); });
  sim.when(() => q >= 2, t => { seen.push('C@' + t); q = 0; });
  const rr = sim.run();
  ok(seen.join() === 'B1,B2,C@1' && rr.stop === 'empty' && sim.now === 10, 'executive: the conditional (C) event runs once the instant\'s B events are done (three-phase); the clock ends at the horizon');
  // an interruptible activity: pre-emption with resume, restart, resample
  const res = {};
  for (const pol of ['resume', 'restart', 'resample']) { const s2 = S.sim({ tEnd: 100 }); let end = NaN; const A = s2.activity(10, () => { end = s2.now; }); s2.at(4, () => A.interrupt()); s2.at(6, () => A.resume(pol, 3)); s2.run(); res[pol] = end; }
  ok(res.resume === 12 && res.restart === 16 && res.resample === 9, `activity: 10 long, interrupted at 4, resumed at 6: resume ends at 12, restart at 16, resample (3) at 9 (${JSON.stringify(res)})`);
  const z = S.sim({ zeno: 50 }); const loop = () => z.at(z.now, loop); z.at(0, loop); const zr = z.run(5);
  ok(zr.stop === 'zeno' && z.codes.has('zeno'), 'Zeno guard: an event that reschedules itself at the same instant is stopped (code zeno)');
  const bud = S.sim({ maxEvents: 100 }); const tick = () => bud.after(1, tick); bud.at(0, tick); const br = bud.run(1e9);
  ok(br.stop === 'budget' && bud.events === 100 && bud.codes.fatal(), 'event budget: code budget at maxEvents');
  const pst = S.sim(); pst.at(5, () => pst.at(2, () => pst.log('late'))); pst.run(10);
  ok(pst.codes.has('past') && pst.eventLog.length === 1 && pst.eventLog[0].t === 5, 'an event scheduled in the past raises past and runs now; the log keeps it');
  const part = S.sim({ tEnd: 10 }); let cnt = 0; const tk = () => { cnt++; part.after(1, tk); }; part.at(0, tk); part.run(3.5); const c1 = cnt; part.run(7); ok(c1 === 4 && cnt === 8 && part.now === 7, 'run(until) is resumable: 4 ticks to 3.5, 8 by 7');
}

// ---------- 3. integrators, events, delays, DAEs, stochastic ----------
{
  const exact = Math.exp(-1);
  const r = S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1, rtol: 1e-10, atol: 1e-12 });
  ok(rel(r.y[0], exact, 1e-9) && r.stop === 'end', `DOPRI5: y′ = −y, y(1) = ${r.y[0]} (rel 1e-9)`);
  const ord = m => { const hs = [0.1, 0.05, 0.025], f = hs.map(dt => S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1, method: m, dt }).y[0]); return S.richardson(hs, f, exact).p; };
  const ord3 = m => { const hs = [0.1, 0.05, 0.025], f = hs.map(dt => S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1, method: m, dt }).y[0]); return S.richardson(hs, f).p; };
  const p = { euler: ord('euler'), heun: ord('heun'), rk4: ord('rk4'), rk4b: ord3('rk4') };
  ok(near(p.euler, 1, 0.05) && near(p.heun, 2, 0.05) && near(p.rk4, 4, 0.1) && near(p.rk4b, 4, 0.15), `observed orders (Richardson): Euler ${p.euler.toFixed(2)}, Heun ${p.heun.toFixed(2)}, RK4 ${p.rk4.toFixed(2)} (exact), RK4 ${p.rk4b.toFixed(2)} (three grids, no exact value)`);
  const g = 9.81, t1 = Math.sqrt(2 / g);
  const b = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -g; }, y0: [1, 0], tEnd: 3, rtol: 1e-10, atol: 1e-12, events: [{ g: (t, y) => y[0], dir: -1, onEvent: (t, y) => { y[1] = -0.9 * y[1]; } }] });
  const want = [t1, t1 * (1 + 1.8), t1 * (1 + 1.8 + 1.62), t1 * (1 + 1.8 + 1.62 + 1.458)];
  ok(b.events.length >= 4 && want.every((w, i) => near(b.events[i].t, w, 1e-9)), `bouncing ball (e = 0.9): impacts at ${b.events.slice(0, 4).map(e => e.t.toFixed(6)).join(', ')} = √(2/g)(1 + 2e + 2e² …)`);
  const sim2 = S.integrate({ f: (t, y, d) => { d[0] = 1; }, y0: [0], tEnd: 5, events: [{ g: (t, y) => y[0] - 2, kind: 'a' }, { g: (t, y) => 2 - y[0], kind: 'b' }, { g: (t, y) => y[0] - 3, terminal: true, kind: 'stop' }] });
  ok(sim2.events.length === 3 && sim2.events[0].kind === 'a' && sim2.events[1].kind === 'b' && sim2.events[0].t === sim2.events[1].t && near(sim2.t, 3, 1e-12) && sim2.stop === 'event', 'simultaneous events fire together in order (a, b at t = 2); a terminal event ends the run at t = 3');
  // a thermostat with a dead band: heat on below 19, off above 21 (hysteresis via two directed events)
  let on = 1; const th = S.integrate({ f: (t, y, d) => { d[0] = on ? 2 : -1; }, y0: [20], tEnd: 30, method: 'rk4', dt: 0.01, events: [{ g: (t, y) => y[0] - 21, dir: 1, onEvent: () => { on = 0; } }, { g: (t, y) => y[0] - 19, dir: -1, onEvent: () => { on = 1; } }] });
  ok(th.events.length === 20 && near(th.events[0].t, 0.5, 1e-9) && near(th.events[1].t, 2.5, 1e-9), `thermostat 19–21 °C (heat +2, loss −1 per unit): ${th.events.length} switches in 30, the first at 0.5 and 2.5 (exact)`);
  // a slow drift through 0 with a small wiggle (y = 0.01t − 0.005 + 0.0005 sin 400t): many crossings near t = 0.5 without hysteresis
  let chat = 0; S.integrate({ f: (t, y, d) => { d[0] = 0.01 + 0.2 * Math.cos(400 * t); }, y0: [-0.005], tEnd: 1, method: 'rk4', dt: 0.0005, events: [{ g: (t, y) => y[0], hyst: 0.002, onEvent: () => { chat++; } }] });
  let chat0 = 0; S.integrate({ f: (t, y, d) => { d[0] = 0.01 + 0.2 * Math.cos(400 * t); }, y0: [-0.005], tEnd: 1, method: 'rk4', dt: 0.0005, events: [{ g: (t, y) => y[0], onEvent: () => { chat0++; } }] });
  ok(chat === 1 && chat0 > 5, `hysteresis suppresses chattering: ${chat} hits with hyst = 5e-4 against ${chat0} without`);
  const rob = S.integrate({ f: (t, y, d) => { d[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; d[2] = 3e7 * y[1] * y[1]; d[1] = -d[0] - d[2]; }, y0: [1, 0, 0], tEnd: 40, rtol: 1e-7, atol: 1e-11 });
  ok(rel(rob.y[0], 0.7158270687, 2e-6) && rel(rob.y[1], 0.9185534764e-5, 2e-4) && rel(rob.y[2], 0.2841637457, 5e-6) && rob.codes.some(c => c.code === 'stiff-switched') && rob.steps < 2000, `Robertson at t = 40 (HNW II §IV.10: 0.7158270687, 9.185534764e-6, 0.2841637457): auto switched to Rosenbrock, ${rob.steps} steps`);
  const ros = S.integrate({ f: (t, y, d) => { d[0] = -1000 * (y[0] - Math.cos(t)); }, y0: [0], tEnd: 1, method: 'rosenbrock', rtol: 1e-6 });
  ok(near(ros.y[0], (1000 * 1000 * Math.cos(1) + 1000 * Math.sin(1)) / (1000 * 1000 + 1), 1e-5) && ros.steps < 1000, `Rosenbrock 2(3) on a stiff linear problem (λ = −1000): ${ros.steps} steps`);
  const energy = m => { const r2 = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; }, y0: [1, 0], tEnd: 1000, method: m, dt: 0.1, pairs: [[0, 1]] }); return Math.abs(0.5 * (r2.y[0] ** 2 + r2.y[1] ** 2) - 0.5); };
  const eV = energy('verlet'), eY = energy('yoshida4'), eR = energy('rk4');
  ok(eV < 2e-3 && eY < 1e-5 && eR > eY, `harmonic oscillator to t = 1000 (dt 0.1): energy error Verlet ${eV.toExponential(1)}, Yoshida-4 ${eY.toExponential(1)} (bounded), RK4 ${eR.toExponential(1)} (drifts)`);
  const vo = [0.1, 0.05].map(dt => { const r2 = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; }, y0: [1, 0], tEnd: 1, method: 'yoshida4', dt, pairs: [[0, 1]] }); return Math.abs(r2.y[0] - Math.cos(1)); });
  ok(near(Math.log2(vo[0] / vo[1]), 4, 0.2), `Yoshida 1990 is 4th order (${Math.log2(vo[0] / vo[1]).toFixed(2)})`);
  const bad = S.integrate({ f: (t, y, d) => { d[0] = y[0] * y[0]; }, y0: [1], tEnd: 2 }), bad2 = S.integrate({ y0: [1], tEnd: 1 }), bad3 = S.integrate({ f: () => {}, y0: [1], tEnd: 1, method: 'rk4' });
  ok(bad.codes.some(c => ['blow-up', 'step-underflow', 'nan'].includes(c.code) && c.level === 'error') && bad.t < 1.01 && bad2.stop === 'bad-config' && bad3.stop === 'bad-config', 'y′ = y² blows up near t = 1 (an error code, no throw); a missing f or dt → bad-config');
  const dd = S.dde({ f: (t, y, lag, dy) => { dy[0] = -lag(0, 0); }, y0: [1], lags: [1], tEnd: 3, rtol: 1e-10, atol: 1e-12 });
  ok(near(dd.y[0], 1 - 3 + 2 ** 2 / 2 - 1 / 6, 1e-8), `delay equation x′ = −x(t − 1), x = 1 for t ≤ 0: x(3) = ${dd.y[0].toFixed(10)} (method of steps, piece by piece: −1/6)`);
  { // a Zeno cascade: a ball bouncing with restitution 0.8 stops at √(2h/g)(1 + 2e/(1 − e)); the refound crossings after each jump count as one instant
    const tz = Math.sqrt(2 / 9.81) * (1 + 2 * 0.8 / 0.2);
    const zs = ['dopri5', 'rk4', 'radau5'].map(m => S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -9.81; }, y0: [1, 0], tEnd: 20, method: m, dt: 0.01, rtol: 1e-10, atol: 1e-12, events: [{ g: (t, y) => y[0], dir: -1, onEvent: (t, y) => { y[1] = -0.8 * y[1]; y[0] = 0; } }] }));
    ok(zs.every(r => r.stop === 'zeno' && near(r.t, tz, 1e-6) && r.codes.some(c => c.code === 'zeno')), `Zeno cascade (restitution 0.8): the code zeno at t = ${zs.map(r => r.t.toFixed(9)).join(', ')} (dopri5, rk4, radau5; exact ${tz.toFixed(9)})`); }
  // ---- the options the ode@1 migration needs (A) ----
  { const f = (t, y, d) => { d[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; d[2] = 3e7 * y[1] * y[1]; d[1] = -d[0] - d[2]; };
    const r1 = S.integrate({ f, y0: [1, 0, 0], tEnd: 40, rtol: 1e-7, atol: [1e-8, 1e-14, 1e-8] }), bad = S.integrate({ f, y0: [1, 0, 0], tEnd: 1, atol: [1e-8, 1e-8] });
    ok(rel(r1.y[1], 0.9185534764e-5, 2e-4) && bad.stop === 'bad-config', `atol per component ([1e-8, 1e-14, 1e-8], Robertson y₂ ${r1.y[1].toExponential(9)}); an atol of the wrong length: bad-config`); }
  { const hs = [0.1, 0.05, 0.025], v = hs.map(dt => S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1, method: 'midpoint', dt }).y[0]), p = S.richardson(hs, v, Math.exp(-1)).p;
    ok(near(p, 2, 0.1), `the explicit midpoint rule: order ${p.toFixed(3)} (2)`); }
  { // breaks: doses of 1 at t = 0 (before the first sample), 1 and 2.5 into x′ = −x; the steps land on them exactly; a sample at a break sees the dose
    const segEnds = [], smp = {}, exact = t => [0, 1, 2.5].filter(b => b <= t).reduce((a, b) => a + Math.exp(-(t - b)), 0);
    for (const m of ['dopri5', 'rk4', 'radau5']) {
      const r = S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [0], tEnd: 4, method: m, dt: 0.05, rtol: 1e-10, atol: 1e-12, samples: [0, 1, 2.5, 3],
        breaks: [{ t: 2.5, apply: (t, y) => { y[0] += 1; } }, { t: 0, apply: (t, y) => { y[0] += 1; } }, { t: 1, apply: (t, y) => { y[0] += 1; } }],
        onSample: (t, y) => { (smp[m] || (smp[m] = [])).push([t, y[0]]); }, onSegment: (seg, a, b) => { if (m === 'dopri5') segEnds.push(b); } });
      ok(near(r.y[0], exact(4), m === 'rk4' ? 1e-5 : 1e-8) && smp[m].every(([t, v]) => near(v, exact(t), m === 'rk4' ? 1e-5 : 1e-8)) && smp[m].length === 4,
        `breaks (${m}): doses at 0, 1, 2.5 into x′ = −x: x(4) = ${r.y[0].toFixed(9)} (${exact(4).toFixed(9)}); samples at the dose times see the dose (x(1) ${smp[m][1][1].toFixed(6)})`);
    }
    ok(segEnds.includes(1) && segEnds.includes(2.5), 'the steps land exactly on the break times (onSegment ends at 1 and 2.5)');
    const nb = S.integrate({ f: (t, y, d) => { d[0] = 1; }, y0: [0], tEnd: 2, breaks: [{ t: 1, apply: (t, y) => { y[0] = NaN; } }] });
    ok(nb.stop === 'nan' && nb.t === 1 && nb.codes.some(c => c.code === 'nan'), 'a break that leaves NaN stops the run with the code nan at its time');
  }
  { // observed events: the zeros of x on x″ = −x are reported (at π/2 + kπ, with the dense-output state), the steps are not cut
    const f = (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; }, seen = [];
    const plain = S.integrate({ f, y0: [1, 0], tEnd: 10, rtol: 1e-10, atol: 1e-12 });
    const ob = S.integrate({ f, y0: [1, 0], tEnd: 10, rtol: 1e-10, atol: 1e-12, maxEvents: 1, events: [{ g: (t, y) => y[0], observe: true, kind: 'zero', onEvent: (t, y, info) => { seen.push([t, y[1], info.dir]); y[1] = 99; } }] });
    const want = [0.5, 1.5, 2.5].map(k => k * Math.PI);
    ok(seen.length === 3 && seen.every(([t, v], i) => near(t, want[i], 1e-8) && near(Math.abs(v), 1, 1e-8)) && seen.map(x => x[2]).join() === '-1,1,-1',
      `observed events: x = 0 at ${seen.map(x => x[0].toFixed(9)).join(', ')} (π/2 + kπ), |v| = 1 there, directions −, +, −`);
    ok(ob.steps === plain.steps && ob.y[0] === plain.y[0] && ob.stop === 'end' && ob.events.length === 3 && ob.events.every(e => e.observe),
      `observing cuts no step (${ob.steps} steps, the same end state as without events), y changes in onEvent are ignored, and 3 observations under maxEvents 1 are no zeno`);
    const st2 = S.integrate({ f, y0: [1, 0], tEnd: 10, events: [{ g: (t, y) => y[0], observe: true, onEvent: () => 'stop' }] });
    ok(st2.stop === 'event' && near(st2.t, Math.PI / 2, 1e-6), 'an observer that returns stop ends the run at its time');
  }
  { // onSegment: the accepted steps tile [t0, tEnd]; their dense output reproduces the solution
    const segs = []; S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 3, rtol: 1e-9, atol: 1e-12, onSegment: (seg, a, b) => segs.push([seg, a, b]) });
    const out = [0]; const tile = segs.every((s2, i) => i === 0 ? s2[1] === 0 : s2[1] === segs[i - 1][2]) && segs[segs.length - 1][2] === 3;
    const mid = segs.every(([seg, a, b]) => { seg((a + b) / 2, out); return near(out[0], Math.exp(-(a + b) / 2), 1e-8); });
    ok(tile && mid, `onSegment(seg, t0, t1): ${segs.length} segments tile [0, 3], each one's dense output exact to 1e-8 at its midpoint`); }
  { // dde through integrate: a fixed method, an event and a break on a delay equation
    const ex = -1 / 6, r4 = S.dde({ f: (t, y, lag, dy) => { dy[0] = -lag(0, 0); }, y0: [1], lags: [1], tEnd: 3, method: 'rk4', dt: 0.05 });
    const bd = S.dde({ f: (t, y, lag, dy) => { dy[0] = -lag(0, 0); }, y0: [1], lags: [1], tEnd: 3, method: 'rk4', dt: 2 });
    let hit = NaN; const ev = S.dde({ f: (t, y, lag, dy) => { dy[0] = -lag(0, 0); }, y0: [1], lags: [1], tEnd: 3, rtol: 1e-10, atol: 1e-12, events: [{ g: (t, y) => y[0], dir: -1, onEvent: t => { hit = t; } }] });
    ok(near(r4.y[0], ex, 1e-6) && bd.stop === 'bad-config' && near(hit, 1, 1e-8) && near(ev.y[0], ex, 1e-8),
      `dde = integrate: RK4 dt 0.05 gives x(3) = ${r4.y[0].toFixed(8)} (−1/6); a dt above the lag is bad-config; the zero of x at t = ${hit.toFixed(10)} (1)`); }
  { const r = S.integrate({ f: (t, y, d) => { d[0] = t < 0.5 ? -y[0] : NaN; }, y0: [1], t0: 0.5, tEnd: 2, method: 'dopri5' });
    ok(r.stop === 'nan' && r.steps === 0 && r.codes.some(c => c.code === 'nan'), 'DOPRI5: f NaN at the start of a step stops at once with nan (no step-size search)'); }
  // ---- stiff and high-order methods (B): Radau IIA 5, ROS3P, Tsitouras 5(4) ----
  { const fR = (t, y, d) => { d[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; d[2] = 3e7 * y[1] * y[1]; d[1] = -d[0] - d[2]; };
    for (const [m, n0] of [['radau5', 400], ['ros3p', 3000]]) {
      const r = S.integrate({ f: fR, y0: [1, 0, 0], tEnd: 40, rtol: 1e-7, atol: 1e-11, method: m });
      ok(rel(r.y[0], 0.7158270687, 2e-6) && rel(r.y[1], 0.9185534764e-5, 2e-5) && rel(r.y[2], 0.2841637457, 5e-6) && r.steps < n0, `${m}: Robertson at t = 40 = HNW II §IV.10 (${r.y.map(v => v.toPrecision(10)).join(', ')}) in ${r.steps} steps`);
    }
    // Van der Pol, μ = 1000, y(0) = (2, 0), t = 2000 (the IVP test set of Mazzia & Magherini, problem VDPOL: y₁ = 1.706167732170469, y₂ = −8.928097010248125e-4)
    const fV = (t, y, d) => { d[0] = y[1]; d[1] = 1000 * (1 - y[0] * y[0]) * y[1] - y[0]; };
    for (const [m, tol, e1] of [['radau5', 1e-8, 1e-8], ['ros3p', 1e-8, 5e-8], ['rosenbrock', 1e-8, 5e-6]]) {
      const t1 = Date.now(), r = S.integrate({ f: fV, y0: [2, 0], tEnd: 2000, rtol: tol, atol: tol, method: m }), ms = Date.now() - t1;
      ok(rel(r.y[0], 1.706167732170469, e1) && rel(r.y[1], -8.928097010248125e-4, 1e3 * e1), `${m}: stiff Van der Pol μ = 1000 at t = 2000: y = (${r.y[0].toPrecision(12)}, ${r.y[1].toExponential(9)}) against the test set's reference, ${r.steps} steps, ${ms} ms`);
    }
    // orders on y′ = −y + sin t with the step held at h (tolerances out of the way): Tsitouras 5, ROS3P 3, Radau IIA ≥ 5
    const ordH = (m, hs = [0.1, 0.05, 0.025]) => { const ex = 1.5 * Math.exp(-1) + 0.5 * (Math.sin(1) - Math.cos(1)); return S.richardson(hs, hs.map(h => S.integrate({ f: (t, y, d) => { d[0] = -y[0] + Math.sin(t); }, y0: [1], tEnd: 1, method: m, hmax: h, rtol: 1, atol: 1 }).y[0]), ex).p; };
    const pT = ordH('tsit5'), p3 = ordH('ros3p'), pR = ordH('radau5', [0.2, 0.1, 0.05]);   // Radau's errors reach the Newton tolerance below h = 0.05
    ok(near(pT, 5, 0.3) && near(p3, 3, 0.15) && pR > 4.7, `observed orders: Tsitouras 5(4) ${pT.toFixed(2)}, ROS3P ${p3.toFixed(2)}, Radau IIA ${pR.toFixed(2)}`);
    const ar = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; }, y0: [1, 0], tEnd: 20, rtol: 1e-10, atol: 1e-12, method: 'tsit5' }), ad = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; }, y0: [1, 0], tEnd: 20, rtol: 1e-10, atol: 1e-12, method: 'dopri5' });
    ok(near(ar.y[0], Math.cos(20), 1e-8) && near(ar.y[1], -Math.sin(20), 1e-8), `Tsitouras 5(4) on the oscillator to t = 20: error ${Math.abs(ar.y[0] - Math.cos(20)).toExponential(2)} in ${ar.steps} steps (DOPRI5 ${ad.steps})`);
    const bb = S.integrate({ f: (t, y, d) => { d[0] = y[1]; d[1] = -9.81; }, y0: [1, 0], tEnd: 3, rtol: 1e-10, atol: 1e-12, method: 'radau5', events: [{ g: (t, y) => y[0], dir: -1, onEvent: (t, y) => { y[1] = -0.9 * y[1]; } }] });
    const t1 = Math.sqrt(2 / 9.81); ok(bb.events.length >= 3 && near(bb.events[0].t, t1, 1e-8) && near(bb.events[1].t, t1 + 2 * 0.9 * t1, 1e-7), `events on Radau's collocation dense output: the bouncing ball's impacts at ${bb.events.slice(0, 2).map(e => e.t.toFixed(9)).join(', ')}`);
  }
  // ---- dense output: the local error of the interpolant at θ = 0.37 of one step of h (y′ = −y + sin t): O(h^(q+1)) for order q ----
  { const ex = t => 1.5 * Math.exp(-t) + 0.5 * (Math.sin(t) - Math.cos(t));
    const dens = (m, h) => { let e = NaN; S.integrate({ f: (t, y, d) => { d[0] = -y[0] + Math.sin(t); }, y0: [1], tEnd: h, method: m, hmax: h, rtol: 1, atol: 1, onSegment: (seg, a) => { if (a === 0) { const o2 = [0]; seg(0.37 * h, o2); e = Math.abs(o2[0] - ex(0.37 * h)); } } }); return e; };
    const q = m => Math.log2(dens(m, 0.1) / dens(m, 0.05)), qT = q('tsit5'), q3 = q('ros3p'), qD = q('dopri5'), qR = q('radau5');
    ok(near(qT, 5, 0.3) && near(q3, 4, 0.3) && qD > 4.7 && near(qR, 4, 0.3), `dense output: local error orders Tsitouras ${qT.toFixed(2)} (its own quartic interpolant: 5), ROS3P ${q3.toFixed(2)} (Hermite: 4), DOPRI5 ${qD.toFixed(2)}, Radau collocation ${qR.toFixed(2)} (degree 3: 4)`); }
  // ---- Radau IIA: RADAU5's transformation (one real + one complex n × n system) gives the same iterates as the full 3n × 3n system ----
  { const fR = (t, y, d) => { d[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; d[2] = 3e7 * y[1] * y[1]; d[1] = -d[0] - d[2]; }, fV = (t, y, d) => { d[0] = y[1]; d[1] = 1000 * (1 - y[0] * y[0]) * y[1] - y[0]; };
    const N = 40, fH = (t, y, d) => { const k = (N + 1) ** 2; for (let i = 0; i < N; i++) d[i] = k * ((i ? y[i - 1] : 0) - 2 * y[i] + (i < N - 1 ? y[i + 1] : 0)) + Math.sin(Math.PI * (i + 1) / (N + 1)) * Math.cos(t); };
    const cases = [['Robertson', fR, [1, 0, 0], 40, 1e-11], ['Van der Pol', fV, [2, 0], 2000, 1e-8], [`heat equation, ${N} cells`, fH, new Array(N).fill(0), 2, 1e-8]];
    for (const [name, f, y0, T, at] of cases) {
      const tm = [], r = ['complex', 'full'].map(L => { const t1 = Date.now(), x = S.integrate({ f, y0, tEnd: T, rtol: 1e-8, atol: at, method: 'radau5', radauLinear: L }); tm.push(Date.now() - t1); return x; });
      const d = Math.max(...r[0].y.map((v, i) => Math.abs(v - r[1].y[i]) / Math.max(Math.abs(r[1].y[i]), 1e-300)));
      ok(r[0].steps === r[1].steps && r[0].rejected === r[1].rejected && r[0].nfev === r[1].nfev && d < 1e-11, `Radau IIA, ${name}: the transformed Newton system (real + complex n × n) = the full 3n × 3n one: ${r[0].steps} steps both, largest relative difference ${d.toExponential(1)} (${tm[0]} ms against ${tm[1]} ms)`);
    }
  }
  // ---- θ-method DAE M·y′ = f with a singular diagonal M (trapezoidal / backward Euler, as SPICE and the thermal networks) ----
  { const Rr = 1e3, Cc = 1e-6, R1 = 1e3, R2 = 2e3, a = 1 / (Rr * Cc), b = (1 / Rr + 1 / (R1 + R2)) / Cc, vinf = a / b;
    const f = (t, y, r) => { r[0] = (1 - y[0]) / Rr - (y[0] - y[1]) / R1; r[1] = (y[0] - y[1]) / R1 - y[1] / R2; };   // a charging RC with a divider node w of no capacity
    for (const m of ['trapezoidal', 'backward-euler']) {
      const h = 1e-4, N = 50, r = S.daeTheta({ M: [Cc, 0], f, y0: [0, 0.3], tEnd: N * h, dt: h, method: m, consistent: true });
      const amp = m === 'trapezoidal' ? (1 - b * h / 2) / (1 + b * h / 2) : 1 / (1 + b * h), ex = vinf * (1 - amp ** N);
      ok(rel(r.y[0], ex, 1e-12) && Math.abs(r.y[1] - r.y[0] * R2 / (R1 + R2)) < 1e-12 && r.steps === N, `daeTheta ${m}: RC + divider node, v after 50 steps = v∞(1 − R(hλ)⁵⁰) with R = ${m === 'trapezoidal' ? '(1 − hλ/2)/(1 + hλ/2)' : '1/(1 + hλ)'} exactly (${r.y[0].toFixed(12)}); the node without capacity stays on its constraint (inconsistent w₀ = 0.3 corrected)`);
    }
    const ordr = (m, hs) => { const T = 5e-3, ex = vinf * (1 - Math.exp(-b * T)); return S.richardson(hs, hs.map(h => S.daeTheta({ M: [Cc, 0], f, y0: [0, 0], tEnd: T, dt: h, method: m }).y[0]), ex).p; };
    const pT = ordr('trapezoidal', [2e-4, 1e-4, 5e-5]), pB = ordr('backward-euler', [2e-5, 1e-5, 5e-6]);
    ok(near(pT, 2, 0.05) && near(pB, 1, 0.05), `daeTheta orders: trapezoidal ${pT.toFixed(3)} (2), backward Euler ${pB.toFixed(3)} (1)`);
    const fR = (t, y, r) => { r[0] = -0.04 * y[0] + 1e4 * y[1] * y[2]; r[1] = 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] * y[1]; r[2] = y[0] + y[1] + y[2] - 1; };
    const rd = S.daeTheta({ M: [1, 1, 0], f: fR, y0: [1, 0, 0], tEnd: 40, dt: 1e-3, method: 'trapezoidal' });
    ok(rel(rd.y[0], 0.7158270687, 1e-9) && rel(rd.y[1], 0.9185534764e-5, 1e-7) && rel(rd.y[2], 0.2841637457, 1e-8), `daeTheta: Robertson as an index-1 DAE (y₃ = 1 − y₁ − y₂), trapezoidal dt 1e-3, t = 40: ${rd.y.map(v => v.toPrecision(10)).join(', ')} (HNW II §IV.10)`);
    let on = 0, hitStep = false; const sw = S.daeTheta({ M: [Cc, 0], f: (t, y, r) => { r[0] = (on - y[0]) / Rr - (y[0] - y[1]) / R1; r[1] = (y[0] - y[1]) / R1 - y[1] / R2; }, y0: [0, 0], tEnd: 3e-3, dt: 7e-4, method: 'backward-euler',
      breaks: [{ t: 1e-3, apply: () => { on = 1; } }], onStep: t => { if (t === 1e-3) hitStep = true; } });
    const bad = S.daeTheta({ M: [1], f: (t, y, r) => { r[0] = NaN; }, y0: [1], tEnd: 1, dt: 0.1 });
    ok(hitStep && sw.y[0] > 0 && bad.stop === 'newton' && S.daeTheta({ M: [1, 0], f, y0: [0], tEnd: 1, dt: 0.1 }).stop === 'bad-config', 'daeTheta: steps land on a switch (break) exactly; a step Newton cannot solve gives the code newton; a wrong-sized y0 is bad-config');
  }
  // ---- daeTheta for thermal@1 and the circuit transient: linear mode, beforeStep, a full M, Newton limiting, speed ----
  { const Rr = 1e3, Cc = 1e-6, R1 = 1e3, R2 = 2e3, b = (1 / Rr + 1 / (R1 + R2)) / Cc, vinf = (1 / (Rr * Cc)) / b;
    const f = (t, y, r) => { r[0] = (1 - y[0]) / Rr - (y[0] - y[1]) / R1; r[1] = (y[0] - y[1]) / R1 - y[1] / R2; };
    const h = 1e-4, N = 50, aT = (1 - b * h / 2) / (1 + b * h / 2), aB = 1 / (1 + b * h);
    const lin = S.daeTheta({ M: [Cc, 0], f, y0: [0, 0], tEnd: N * h, dt: h, linear: true }), nl = S.daeTheta({ M: [Cc, 0], f, y0: [0, 0], tEnd: N * h, dt: h });
    ok(rel(lin.y[0], vinf * (1 - aT ** N), 1e-12) && rel(lin.y[0], nl.y[0], 1e-12) && lin.nfev === N + 1 + 2 && lin.newton === N, `daeTheta linear: one factorisation, one solve and one f per step (${lin.nfev} f calls for ${N} steps against ${nl.nfev} with Newton), the same v (${lin.y[0].toFixed(12)})`);
    const thetas = []; const bs = S.daeTheta({ M: [Cc, 0], f, y0: [0, 0], tEnd: N * h, dt: h, linear: true, beforeStep: (ta, tb) => { const th = ta === 0 ? 1 : 0.5; thetas.push(th); return { theta: th }; } });
    ok(rel(bs.y[0], vinf * (1 - aB * aT ** (N - 1)), 1e-12) && thetas.length === N && thetas[0] === 1 && thetas[1] === 0.5, `beforeStep picks θ per step: backward Euler first, then trapezoidal — v = v∞(1 − R_BE·R_TR⁴⁹) exactly (${bs.y[0].toFixed(12)})`);
    let src = 0; const ins = S.daeTheta({ M: [Cc, 0], f: (t, y, r) => { r[0] = (src - y[0]) / Rr - (y[0] - y[1]) / R1; r[1] = (y[0] - y[1]) / R1 - y[1] / R2; }, y0: [0, 0], tEnd: 2 * N * h, dt: h, linear: true, method: 'backward-euler',
      beforeStep: ta => { src = ta >= N * h - 1e-15 ? 1 : 0; } });
    ok(rel(ins.y[0], vinf * (1 - aB ** N), 1e-12), `beforeStep sets the step's inputs: a source switched on at step ${N} gives v = v∞(1 − R_BE^${N}) after ${N} more steps`);
    // a floating capacitor (full M: C at (a, a), (c, c), −C at (a, c)): source 1 V –R1– a –C– c –R2– ground; u = va − vc = 1 − e^(−t/((R1 + R2)C))
    const fl = m => S.daeTheta({ M: [[Cc, -Cc], [-Cc, Cc]], f: (t, y, r) => { r[0] = (1 - y[0]) / R1; r[1] = -y[1] / R2; }, y0: [R2 / (R1 + R2), R2 / (R1 + R2)], tEnd: 3e-3, dt: 1e-5, method: m });
    const uEx = 1 - Math.exp(-3e-3 / ((R1 + R2) * Cc)), fT = fl('trapezoidal'), fB = fl('backward-euler');
    ok(near(fT.y[0] - fT.y[1], uEx, 1e-6) && near(fB.y[0] - fB.y[1], uEx, 2e-3) && near((1 - fT.y[0]) / R1, fT.y[1] / R2, 1e-12), `a full M (a floating capacitor): u(3 ms) = ${(fT.y[0] - fT.y[1]).toFixed(8)} trapezoidal, ${(fB.y[0] - fB.y[1]).toFixed(6)} backward Euler (exact ${uEx.toFixed(8)}); the hidden constraint (1 − va)/R1 = vc/R2 holds`);
    // Newton limiting (SPICE's pnjlim role): exp(y) = 1000 from y = 0 overflows plain Newton; a step limit of 1 per iteration converges
    const e1 = S.daeTheta({ M: [0], f: (t, y, r) => { r[0] = Math.exp(y[0]) - 1000; }, y0: [0], tEnd: 0.1, dt: 0.1, consistent: true, maxNewton: 50, limit: (yo, yv) => { const d = yv[0] - yo[0]; if (Math.abs(d) > 1) { yv[0] = yo[0] + Math.sign(d); return true; } return false; } });
    const e0 = S.daeTheta({ M: [0], f: (t, y, r) => { r[0] = Math.exp(y[0]) - 1000; }, y0: [0], tEnd: 0.1, dt: 0.1, consistent: true, maxNewton: 50 });
    ok(near(e1.y[0], Math.log(1000), 1e-12) && e1.stop === 'end' && e0.stop === 'newton', `limit(yOld, yNew): the limited Newton finds ln 1000 = ${e1.y[0].toFixed(12)}; without it the first update overflows (newton)`);
    // speed: 10 thermal nodes (a chain of capacities with one node of none), 20 000 steps, linear
    const nN = 10, Mth = Array.from({ length: nN }, (_, i) => (i === 5 ? 0 : 1 + i)), fth = (t, y, r) => { for (let i = 0; i < nN; i++) r[i] = ((i ? y[i - 1] : 25) - y[i]) / 0.5 + ((i < nN - 1 ? y[i + 1] : y[i]) - y[i]) / 0.7 + (i === 0 ? 10 : 0); };
    S.daeTheta({ M: Mth, f: fth, y0: new Array(nN).fill(25), tEnd: 1, dt: 1e-2, linear: true });
    let t1 = Date.now(); const big = S.daeTheta({ M: Mth, f: fth, y0: new Array(nN).fill(25), tEnd: 200, dt: 0.01, linear: true, consistent: true }); const ms = Date.now() - t1;
    t1 = Date.now(); const rs = S.daeThetaInit({ M: Mth, f: fth, y0: new Array(nN).fill(25), dt: 0.01, linear: true, consistent: true }); let last = null; for (let k = 1; k <= 20000; k++) last = rs.advance(k * 0.01); const ms1 = Date.now() - t1;
    const dmax = Math.max(...last.y.map((v, i) => Math.abs(v - big.y[i])));
    ok(big.steps === 20000 && ms < 200 && ms1 < 200 && big.y.every(Number.isFinite) && dmax < 1e-9 && last.steps === 20000, `speed: 10 nodes × 20 000 linear steps in ${ms} ms as one call, ${ms1} ms as 20 000 advance() calls of daeThetaInit (a stepper's macro steps; the same end state to ${dmax.toExponential(1)})`);
  }
  // ---- upper tails without cancellation, erfc and its inverse ----
  { ok(rel(S.erfc(5), 1.5374597944280349e-12, 1e-13) && rel(S.erfc(10), 2.088487583762545e-45, 1e-13) && rel(S.erfc(20), 5.395865611607901e-176, 1e-12) && S.erfc(-3) === 2 - S.erfc(3),
      `erfc in the tail (Abramowitz & Stegun / DLMF 7.2): erfc 5 = ${S.erfc(5).toExponential(14)}, erfc 10 = ${S.erfc(10).toExponential(14)}, erfc 20 = ${S.erfc(20).toExponential(13)}`);
    ok(rel(S.normSf(10), 7.619853024160527e-24, 1e-13) && rel(S.normSf(37.5), 4.605353009584e-308, 1e-11) && S.normCdf(-10) === S.normSf(10), `normal upper tail 1 − Φ(10) = ${S.normSf(10).toExponential(14)} (7.619853024160527e-24), 1 − Φ(37.5) = ${S.normSf(37.5).toExponential(10)}`);
    const q5 = Math.exp(-50) * (1 + 50 + 1250 + 125000 / 6 + 6250000 / 24);
    ok(rel(S.gammaQ(5, 50), q5, 1e-13) && rel(S.chi2Sf(100, 10), q5, 1e-13) && rel(S.gammaQ(1, 700), Math.exp(-700), 1e-12) && near(S.gammaQ(3, 2) + S.gammaP(3, 2), 1, 1e-15),
      `Q(a, x) by the continued fraction: Q(5, 50) = P(χ²₁₀ > 100) = ${S.gammaQ(5, 50).toExponential(14)} = e⁻⁵⁰Σ50ᵏ/k! (exact); Q(1, 700) = e⁻⁷⁰⁰; P + Q = 1`);
    ok(rel(S.tSf(1e6, 1), Math.atan(1e-6) / Math.PI, 1e-13) && rel(S.tSf(1e8, 2), 1 / (Math.sqrt(2 + 1e16) * (Math.sqrt(2 + 1e16) + 1e8)), 1e-13) && rel(S.fSf(1e5, 2, 4), Math.pow(1 + 2e5 / 4, -2), 1e-12) && near(S.fCdf(3, 5, 7) + S.fSf(3, 5, 7), 1, 1e-15)
      && rel(S.betaQ(2, 3, 0.999), 0.001 ** 3 * (4 - 3 * 0.001), 1e-10),
      `upper tails in closed form: t₁ (Cauchy) at 10⁶, t₂ at 10⁸ (${S.tSf(1e8, 2).toExponential(6)}), F(2, 4) at 10⁵, the beta complement 1 − I₀.₉₉₉(2, 3) = ${S.betaQ(2, 3, 0.999).toExponential(6)}`);
    ok(rel(S.erfcInv(1e-100), 15.065574702592645, 1e-13) && rel(S.erfc(S.erfcInv(1e-300)), 1e-300, 1e-12) && near(S.erfInv(S.erf(0.5)), 0.5, 1e-15) && near(S.erf(0.5), 0.5204998778130465, 3e-16),
      `erfcInv(10⁻¹⁰⁰) = ${S.erfcInv(1e-100)} and erfc(erfcInv(10⁻³⁰⁰)) = 10⁻³⁰⁰ to 1e-12; erf ½ = 0.5204998778130465 and back`); }
  // ---- P(a, x), Q(a, x) at large a near x ≈ a (Temme's uniform expansion for a ≥ 20, |x/a − 1| ≤ 0.4; the series / fraction elsewhere).
  //      Reference values: mpmath 1.4.1 at 60 digits — P = x^a e^(−x)/Γ(a + 1)·₁F₁(1; a + 1; x) (mp.hyp1f1), and for x > a Q by
  //      mp.gammainc(a, x, inf, regularized=True), an independent route (P + Q − 1 < 1e-54 there); x = 0.5a, 0.6a, a ± √a, a ± 3√a,
  //      a, a + ½, 1.4a, 1.5a for a = 20, 100, 1000, 10⁵ (values below 1e-300 left out). The test generator is not part of the repo:
  //      every value is listed here with 17 digits ----
  { const REF = [
      [20.0, 12.0, 0.021279769383026619, 0.97872023061697338],
      [20.0, 6.583592135001262, 1.9209781883082835e-5, 0.99998079021811692],
      [20.0, 15.52786404500042, 0.15625427525673738, 0.84374572474326262],
      [20.0, 20.0, 0.52974273316076001, 0.47025726683923999],
      [20.0, 20.5, 0.57352470142056442, 0.42647529857943558],
      [20.0, 24.47213595499958, 0.84308592586881369, 0.15691407413118631],
      [20.0, 33.41640786499874, 0.99507670257115094, 0.0049232974288490623],
      [20.0, 28.0, 0.9521928908285658, 0.047807109171434202],
      [20.0, 30.0, 0.97812653155860915, 0.021873468441390853],
      [20.0, 10.0, 0.0034543419758568077, 0.99654565802414319],
      [100.0, 60.0, 1.4815276326460445e-6, 0.99999851847236735],
      [100.0, 70.0, 0.00043037259497989086, 0.99956962740502011],
      [100.0, 90.0, 0.15822098918643017, 0.84177901081356983],
      [100.0, 100.0, 0.51329879827914866, 0.48670120172085134],
      [100.0, 100.5, 0.53317138624744661, 0.46682861375255339],
      [100.0, 110.0, 0.84172132993991291, 0.15827867006008709],
      [100.0, 130.0, 0.99724959163269347, 0.0027504083673065263],
      [100.0, 140.0, 0.99983894282528744, 0.00016105717471255586],
      [100.0, 150.0, 0.99999407545966452, 5.9245403354839158e-6],
      [100.0, 50.0, 3.2000653245851253e-10, 0.99999999967999347],
      [1000.0, 600.0, 2.3240600579608826e-50, 1.0],
      [1000.0, 905.1316701949486, 0.0010012389950642878, 0.99899876100493571],
      [1000.0, 968.3772233983162, 0.15861399679200106, 0.84138600320799894],
      [1000.0, 1000.0, 0.50420524418021551, 0.49579475581978449],
      [1000.0, 1000.5, 0.51051071092317903, 0.48948928907682097],
      [1000.0, 1031.6227766016839, 0.8413841884287202, 0.1586158115712798],
      [1000.0, 1094.8683298050514, 0.99825275449853486, 0.0017472455014651416],
      [1000.0, 1400.0, 1.0, 8.0413254081848296e-30],
      [1000.0, 1500.0, 1.0, 2.2046986113889961e-43],
      [1000.0, 500.0, 3.2982727970670996e-86, 1.0],
      [100000.0, 99051.31670194949, 0.0013127698795992382, 0.99868723012040076],
      [100000.0, 99683.77223398317, 0.15865484973790426, 0.84134515026209574],
      [100000.0, 100000.0, 0.50042052211036518, 0.49957947788963482],
      [100000.0, 100000.5, 0.50105130287544223, 0.49894869712455777],
      [100000.0, 100316.22776601683, 0.8413451484483288, 0.1586548515516712],
      [100000.0, 100948.68329805051, 0.99861248631916699, 0.0013875136808330103]];
    let worst = 0, wa = 0; for (const [a, x, P, Q] of REF) { const eP = Math.abs(S.gammaP(a, x) - P) / P, eQ = Math.abs(S.gammaQ(a, x) - Q) / Q; if (max2(eP, eQ) > worst) { worst = max2(eP, eQ); wa = a; } }
    ok(worst < 1e-13, `P(a, x) and Q(a, x) at a = 20, 100, 1000, 10⁵ (${REF.length} points around x = a) = mpmath's 60-digit values to ${worst.toExponential(1)} relative (worst at a = ${wa})`);
    const P5 = S.gammaP(1e5, 1e5), Pm = S.gammaP(1e5, 1e5 - Math.sqrt(1e5));
    ok(rel(P5, 0.50042052211036518, 1e-14) && rel(Pm, 0.15865484973790426, 1e-13) && near(S.gammaP(1e5, 1e5 + 0.5) + S.gammaQ(1e5, 1e5 + 0.5), 1, 2e-16), `Temme at a = 10⁵: P(a, a) = ${P5.toPrecision(16)} (mpmath 0.50042052211036518), P(a, a − √a) = ${Pm.toPrecision(16)}, P + Q = 1`); }
  // ---- Philox4x32-10: Random123's known-answer vectors; O(1) access to sample i ----
  { const hx = a => a.map(x => x.toString(16).padStart(8, '0')).join(' ');
    const kat = [[[0, 0, 0, 0], [0, 0], '6627e8d5 e169c58d bc57ac4c 9b00dbd8'], [[0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], [0xffffffff, 0xffffffff], '408f276d 41c83b0e a20bc7c6 6d5451fd'],
      [[0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344], [0xa4093822, 0x299f31d0], 'd16cfe09 94fdcceb 5001e420 24126ea1']];
    ok(kat.every(([c, k, w]) => hx(S.philox(c, k)) === w), 'Philox4x32-10 = the known-answer vectors of Random123 (Salmon et al. 2011): zeros, all ones, the digits of π');
    const cs = S.counterStream(7, 'noise:R1'), N = 100000; let m = 0, v = 0; for (let i = 0; i < N; i++) { const z = cs.normal(i); m += z; v += z * z; } m /= N; v = v / N - m * m;
    const big = cs.u(123456789012), again = S.counterStream(7, 'noise:R1').u(123456789012), other = S.counterStream(7, 'noise:R2').u(123456789012), an = S.counterStream(7, 'noise:R1', { antithetic: true }).u(5);
    ok(Math.abs(m) < 0.02 && Math.abs(v - 1) < 0.02 && big === again && big !== other && big > 0 && big < 1 && near(an + cs.u(5), 1, 1e-15), `counterStream: sample 123 456 789 012 directly (${big.toFixed(12)}), the same from a new stream, another for another name; 10⁵ normals mean ${m.toFixed(4)}, var ${v.toFixed(4)}; antithetic 1 − u`); }
  // ---- dense linear algebra ----
  { const H = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => 1 / (i + j + 1)));
    const hil = [9.670230402258689e-05, 0.006738273605760748, 0.1691412202214500, 1.500214280059243];
    const es = S.eigSym(H(4)), eg = S.eig(H(4));
    ok(es.values.every((v, i) => rel(v, hil[i], 1e-11)) && eg.re.every((v, i) => rel(v, hil[i], 1e-11)) && eg.im.every(x => x === 0) && rel(1 / S.lu(H(4)).det, 6048000, 1e-11),
      `the Hilbert matrix H₄: eigenvalues ${hil.map(x => x.toPrecision(6)).join(', ')} by Jacobi and by Hessenberg-QR; det = 1/6 048 000`);
    const v0 = es.vectors.map(r => r[0]), res = H(4).map((r, i) => r.reduce((s2, a, j) => s2 + a * v0[j], 0) - es.values[0] * v0[i]);
    ok(Math.max(...res.map(Math.abs)) < 1e-15 && near(v0.reduce((s2, x) => s2 + x * x, 0), 1, 1e-14), 'eigSym: the vectors are unit eigenvectors (residual < 1e-15)');
    const T = Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, (_, j) => (i === j ? 2 : Math.abs(i - j) === 1 ? -1 : 0))), et = S.eigSym(T);
    ok(et.values.every((v, k) => near(v, 2 - 2 * Math.cos((k + 1) * Math.PI / 11), 1e-14)), 'the 10 × 10 second-difference matrix: eigenvalues 2 − 2cos(kπ/11)');
    let c = [1]; for (const r of [[1, -1], [1, -2], [1, -3], [1, 0, 1]]) { const o2 = new Array(c.length + r.length - 1).fill(0); c.forEach((a, i) => r.forEach((b, j) => { o2[i + j] += a * b; })); c = o2; }
    const n2 = c.length - 1, Cm = Array.from({ length: n2 }, (_, i) => Array.from({ length: n2 }, (_, j) => (i === 0 ? -c[j + 1] : i === j + 1 ? 1 : 0))), ec = S.eig(Cm);
    const want = [[0, -1], [0, 1], [1, 0], [2, 0], [3, 0]];
    ok(ec.ok && want.every(([re, im], i) => near(ec.re[i], re, 1e-12) && near(ec.im[i], im, 1e-12)) && JSON.stringify(S.eig([[1, 2], [-2, 1]]).im) === '[-2,2]', 'eig: the companion matrix of (x − 1)(x − 2)(x − 3)(x² + 1) gives 1, 2, 3, ±i; [[1, 2], [−2, 1]] gives 1 ± 2i');
    const x6 = S.solve(H(6), H(6).map(r => r.reduce((a, b) => a + b))), Ai = S.inv([[4, 7], [2, 6]]);
    ok(x6.every(v => near(v, 1, 1e-8)) && near(Ai[0][0], 0.6, 1e-15) && near(Ai[0][1], -0.7, 1e-15) && near(Ai[1][0], -0.2, 1e-15) && near(Ai[1][1], 0.4, 1e-15) && !S.lu([[1, 2], [2, 4]]).ok,
      'lu / solve / inv: H₆x = H₆·1 gives 1 to 1e-8 (cond ≈ 1.5e7); the inverse of [[4, 7], [2, 6]]; a singular matrix is not ok'); }
  // ---- compensated summation (Neumaier) ----
  { const w = S.welford(); for (const x of [1, 1e100, 1, -1e100]) w.add(x); const k = S.ksum(); for (let i = 0; i < 1e6; i++) k.add(0.1); let plain = 0; for (let i = 0; i < 1e6; i++) plain += 0.1;
    const ta = S.timeAvg(0, 0.1); for (let i = 1; i <= 1e6; i++) ta.update(i * 1e-3, 0.1);
    ok(w.sum === 2 && Math.abs(k.value - 1e5) < 1e-9 && Math.abs(plain - 1e5) > 1e-7 && Math.abs(ta.area(1000) - 100) < 1e-11, `compensated sums: welford [1, 1e100, 1, −1e100] → ${w.sum}; 10⁶ × 0.1 → error ${Math.abs(k.value - 1e5).toExponential(1)} (plain ${Math.abs(plain - 1e5).toExponential(1)}); timeAvg area error ${Math.abs(ta.area(1000) - 100).toExponential(1)}`); }
  const da = S.dae({ f: (t, y, z, d) => { d[0] = -z[0]; }, g: (t, y, z, r2) => { r2[0] = z[0] ** 3 + z[0] - y[0] ** 3 - y[0]; }, y0: [1], z0: [0.3], tEnd: 1, rtol: 1e-10, atol: 1e-12 });
  ok(rel(da.y[0], exact, 1e-8) && rel(da.z[0], exact, 1e-8), 'index-1 DAE y′ = −z, 0 = z³ + z − y³ − y (so z = y): y(1) = z(1) = e⁻¹');
  // stochastic kinetics: A → ∅ at rate k: E[A(t)] = A0 e^(−kt), Var = A0 e^(−kt)(1 − e^(−kt))
  const reps = 400, A0 = 200, k = 0.5, T = 2, ev = [], tl = [];
  for (let i = 0; i < reps; i++) { ev.push(S.ssa({ x0: [A0], nu: [[-1]], propensity: (x, a) => { a[0] = k * x[0]; }, tEnd: T, r: S.stream(5, 'ssa').sub(i) }).x[0]); tl.push(S.tauLeap({ x0: [A0], nu: [[-1]], propensity: (x, a) => { a[0] = k * x[0]; }, tEnd: T, tau: 0.02, r: S.stream(5, 'tl').sub(i) }).x[0]); }
  const em = A0 * Math.exp(-k * T), ev2 = em * (1 - Math.exp(-k * T)), [ms, vs] = mv(ev), [mt] = mv(tl);
  ok(near(ms, em, 4 * Math.sqrt(ev2 / reps)) && rel(vs, ev2, 0.2) && near(mt, em, 5 * Math.sqrt(ev2 / reps)), `Gillespie SSA: decay A0 = 200, k = 0.5, t = 2: mean ${ms.toFixed(2)} (${em.toFixed(2)}), var ${vs.toFixed(1)} (${ev2.toFixed(1)}); τ-leaping mean ${mt.toFixed(2)}`);
  const imm = S.ssa({ x0: [0], nu: [[1], [-1]], propensity: (x, a) => { a[0] = 10; a[1] = 0.1 * x[0]; }, tEnd: 1e9, maxEvents: 5000, r: S.stream(1, 'imm') });
  ok(imm.stop === 'budget' && imm.codes.some(c => c.code === 'budget'), 'SSA stops at its event budget (code budget)');
  // Ornstein–Uhlenbeck dX = −θX dt + σ dW: E = x0 e^(−θT), Var = σ²(1 − e^(−2θT))/(2θ)
  const th0 = 1, sg = 0.5, x0 = 2, T2 = 1, ou = [];
  for (let i = 0; i < 2000; i++) ou.push(S.sde({ drift: (t, x, o) => { o[0] = -th0 * x[0]; }, diffusion: (t, x, o) => { o[0] = sg; }, x0: [x0], tEnd: T2, dt: 0.01, r: S.stream(9, 'ou').sub(i) }).x[0]);
  const [mo, vo2] = mv(ou), eo = x0 * Math.exp(-th0 * T2), vou = sg * sg * (1 - Math.exp(-2 * th0 * T2)) / (2 * th0);
  ok(near(mo, eo, 0.02) && rel(vo2, vou, 0.08), `Euler–Maruyama, Ornstein–Uhlenbeck: mean ${mo.toFixed(4)} (${eo.toFixed(4)}), var ${vo2.toFixed(4)} (${vou.toFixed(4)})`);
  // geometric Brownian motion, Milstein vs EM against the exact solution on the same path (strong error)
  const strong = (method, dt) => { let e = 0; for (let i = 0; i < 300; i++) { let W = 0; const rS = S.stream(4, 'gbm').sub(i), rW = S.stream(4, 'gbm').sub(i);
    const res2 = S.sde({ drift: (t, x, o) => { o[0] = 0.05 * x[0]; }, diffusion: (t, x, o) => { o[0] = 0.8 * x[0]; }, dsig: (t, x, o) => { o[0] = 0.8; }, x0: [1], tEnd: 1, dt, method, r: rS });
    for (let j = 0; j < Math.round(1 / dt); j++) W += Math.sqrt(dt) * S.normInv(rW()); e += Math.abs(res2.x[0] - Math.exp((0.05 - 0.32) + 0.8 * W)); } return e / 300; };
  const em1 = strong('em', 0.01), em2 = strong('em', 0.0025), mi1 = strong('milstein', 0.01), mi2 = strong('milstein', 0.0025);
  const pe = Math.log(em1 / em2) / Math.log(4), pm = Math.log(mi1 / mi2) / Math.log(4);
  ok(near(pe, 0.5, 0.15) && near(pm, 1, 0.15) && mi1 < em1, `strong orders on GBM (Kloeden & Platen 1992): Euler–Maruyama ${pe.toFixed(2)} (½), Milstein ${pm.toFixed(2)} (1)`);
  const ar = S.nhpp(t => 2 + Math.sin(t), 3, 0, 100, S.stream(2, 'nh'));
  ok(near(ar.length, 200 + (1 - Math.cos(100)), 4 * Math.sqrt(200)) && ar.every((t, i) => i === 0 || t > ar[i - 1]), `non-homogeneous Poisson by thinning (Lewis & Shedler 1979): ${ar.length} arrivals (∫ rate = ${(200 + 1 - Math.cos(100)).toFixed(1)})`);
  const pw = S.piecewise([[0, 1], [8, 3], [17, 1]], { period: 24 }), pl = S.piecewise([[0, 0], [10, 10]], { step: false });
  ok(pw(5) === 1 && pw(9) === 3 && pw(20) === 1 && pw(24 + 9) === 3 && pl(2.5) === 2.5, 'schedules: piecewise constant with a period, piecewise linear');
}

// ---------- 4. output analysis, sensitivity, input modelling, variance reduction, calibration, units ----------
{
  const c = S.ci([2, 4, 4, 4, 5, 5, 7, 9]);
  ok(near(c.mean, 5, 1e-12) && near(c.sd, Math.sqrt(32 / 7), 1e-12) && near(c.half, 2.364624251592785 * Math.sqrt(32 / 7) / Math.sqrt(8), 1e-9) && Number.isNaN(S.ci([1]).half), 'ci: mean 5, sd √(32/7), half = t(0.975, 7)·s/√8; one value → half NaN');
  const w = S.welford(); for (let i = 0; i < 1000; i++) w.add(1e9 + (i % 2)); ok(near(w.var, 0.25025025025, 1e-9), 'Welford is stable around 1e9 (var 0.2503)');
  const ta = S.timeAvg(0, 0); ta.update(2, 3); ta.update(5, 1); ok(near(ta.mean(10), (0 * 2 + 3 * 3 + 1 * 5) / 10, 1e-15) && ta.max === 3, 'timeAvg: the area under a step function / time');
  ta.reset(10); ta.update(12, 0); ok(near(ta.mean(14), 0.5, 1e-15), 'timeAvg.reset (end of a warm-up) keeps the current value');
  // AR(1) with φ = 0.9: batch means cover the mean; tiny batches are correlated
  const r = S.stream(1, 'ar'); const x = []; let v = 0; for (let i = 0; i < 40000; i++) { v = 0.9 * v + r.normal(0, 1); x.push(10 + v); }
  const bm = S.batchMeans(x, 20), bmTiny = S.batchMeans(x.slice(0, 400), 100);
  ok(bm.lo < 10 && bm.hi > 10 && Math.abs(bm.lag1) < 0.3 && bmTiny.lag1 > 0.3, `batch means on AR(1) φ = 0.9: [${bm.lo.toFixed(3)}, ${bm.hi.toFixed(3)}] ∋ 10, lag-1 of the batch means ${bm.lag1.toFixed(2)}; batches of 4 are correlated (${bmTiny.lag1.toFixed(2)})`);
  const y = []; for (let i = 0; i < 2000; i++) y.push(5 + 20 * Math.exp(-i / 60) + r.normal(0, 1));
  const ms = S.mser5(y);
  ok(ms.d >= 150 && ms.d <= 600 && !ms.short, `MSER-5 deletes ${ms.d} observations of a series biased by 20·e^(−i/60) (the bias falls under the noise by i ≈ 180–300)`);
  const ms2 = S.mser5(Array.from({ length: 1000 }, () => r.normal(0, 1)));
  ok(ms2.d <= 250, `MSER-5 deletes little of a stationary series (${ms2.d})`);
  ok(S.littleCheck(2, 0.5, 4) === 0 && near(S.littleCheck(2, 0.5, 5), 0.2, 1e-12), 'Little\'s law check: L = λW → 0');
  const rp = S.replicate(30, 99, (sd) => { const s = S.stream(sd, 'u'); let m = 0; for (let i = 0; i < 100; i++) m += s(); return { m: m / 100 }; });
  ok(rp.m.n === 30 && rp.m.lo < 0.5 && rp.m.hi > 0.5, `replicate: 30 replications, the CI [${rp.m.lo.toFixed(4)}, ${rp.m.hi.toFixed(4)}] covers ½`);
  // Ishigami (Ishigami & Homma 1990; Saltelli et al. 2008 §4.5): S1 = 0.3139, 0.4424, 0; ST3 = 0.2437
  const ish = u => Math.sin(u[0]) + 7 * Math.sin(u[1]) ** 2 + 0.1 * u[2] ** 4 * Math.sin(u[0]);
  const ax = [0, 1, 2].map(() => ({ lo: -Math.PI, hi: Math.PI }));
  const so = S.sobol(ax, ish, { N: 4096, maxEval: 30000, seed: 3 });
  ok(near(so.S1[0], 0.3139, 0.04) && near(so.S1[1], 0.4424, 0.04) && near(so.S1[2], 0, 0.04) && near(so.ST[2], 0.2437, 0.03) && near(so.ST[0], 0.5576, 0.04) && so.evals === 4096 * 5, `Sobol' indices of Ishigami (Saltelli 2010 / Jansen): S1 ${so.S1.map(v => v.toFixed(3)).join(', ')} (0.314, 0.442, 0), ST ${so.ST.map(v => v.toFixed(3)).join(', ')} (0.558, 0.442, 0.244)`);
  ok(S.sobol(ax, ish, { N: 10000, maxEval: 1000 }).over === true, 'Sobol\' over budget → over, nothing evaluated');
  const mo = S.morris([{ lo: 0, hi: 1 }, { lo: 0, hi: 1 }, { lo: 0, hi: 1 }], u => 3 * u[0] - 2 * u[1] + 0 * u[2], { r: 10 });
  ok(near(mo.mu[0], 3, 1e-9) && near(mo.mu[1], -2, 1e-9) && near(mo.muStar[1], 2, 1e-9) && mo.muStar[2] === 0 && near(mo.sigma[0], 0, 1e-9) && mo.evals === 40, 'Morris on 3x − 2y: μ = 3, −2, 0; μ* = |μ|, σ = 0 (linear); r(k + 1) = 40 evaluations');
  const mo2 = S.morris([{ lo: 0, hi: 1 }, { lo: 0, hi: 1 }], u => u[0] * u[1], { r: 20 });
  ok(mo2.sigma[0] > 0.1, `Morris σ > 0 flags an interaction (x·y: σ = ${mo2.sigma[0].toFixed(3)})`);
  const L = S.lhs(10, 3, S.stream(1, 'lhs'));
  ok([0, 1, 2].every(j => L.map(p => Math.floor(p[j] * 10)).sort((a, b) => a - b).join() === '0,1,2,3,4,5,6,7,8,9'), 'Latin hypercube (McKay et al. 1979): one point per stratum on every axis');
  const oa = S.oat([1, 1], [{ lo: 0, hi: 2, points: 3 }, { lo: 0, hi: 2, points: 3 }], x2 => x2[0] * 10 + x2[1]), gr = S.grid([{ lo: 0, hi: 1, points: 2 }, { lo: 0, hi: 1, points: 3 }], x2 => x2[0] + x2[1]);
  ok(oa[0].y.join() === '1,11,21' && oa[1].y.join() === '10,11,12' && gr.points.length === 6 && gr.y[5] === 2 && S.grid([{ lo: 0, hi: 1, points: 100 }, { lo: 0, hi: 1, points: 100 }], () => 1, 2000).over, 'one-at-a-time and grid sweeps; a grid over its budget is refused');
  // input modelling: MLE fits recover the parameters
  const R = S.stream(21, 'fit'), gd = Array.from({ length: 5000 }, () => R.gamma(3, 2)), wd = Array.from({ length: 5000 }, () => R.weibull(1.5, 4)), ld = Array.from({ length: 5000 }, () => R.lognormal(1, 0.4));
  const fg = S.fit(gd, 'gamma'), fw = S.fit(wd, 'weibull'), fl = S.fit(ld, 'lognormal'), fe = S.fit(gd, 'exp');
  ok(near(fg.shape, 3, 0.15) && near(fg.scale, 2, 0.12) && near(fw.shape, 1.5, 0.05) && near(fw.scale, 4, 0.1) && rel(fl.mean, Math.exp(1.08), 0.02) && near(fe.mean, 6, 0.15), `MLE fits (Law §6.5): gamma k ${fg.shape.toFixed(3)} θ ${fg.scale.toFixed(3)} (3, 2), Weibull k ${fw.shape.toFixed(3)} λ ${fw.scale.toFixed(3)} (1.5, 4), lognormal mean ${fl.mean.toFixed(3)} (${Math.exp(1.08).toFixed(3)})`);
  ok(S.ksTest(gd, fg).p > 0.01 && S.ksTest(gd, fe).p < 1e-6 && S.andersonDarling(gd, fg).A2 < 2.5 && S.andersonDarling(gd, fe).A2 > 10, 'goodness of fit: the fitted gamma passes KS and Anderson–Darling, the exponential fails both');
  const chi = S.chiSquare([18, 22, 20, 25, 15], [20, 20, 20, 20, 20]);
  ok(near(chi.X2, 2.9, 1e-12) && chi.df === 4 && near(chi.p, 0.5747, 1e-3), `χ² test: X² = 2.9, df 4, p = ${chi.p.toFixed(4)} (0.5747)`);
  const tr = S.truncated({ dist: 'normal', mean: 0, sd: 1 }, 0, Infinity), td = Array.from({ length: 50000 }, () => tr.draw(R));
  ok(tr.exact && near(mv(td)[0], Math.sqrt(2 / Math.PI), 0.01) && td.every(v => v >= 0), `a normal truncated to [0, ∞) by inversion: mean ${mv(td)[0].toFixed(4)} (√(2/π) = 0.7979)`);
  const mx = S.mixture([{ d: { dist: 'exp', mean: 1 }, w: 0.7 }, { d: { dist: 'const', value: 10 }, w: 0.3 }]), md = Array.from({ length: 50000 }, () => mx.draw(R));
  ok(near(mx.mean, 3.7, 1e-12) && near(mv(md)[0], 3.7, 0.06), 'a mixture: mean 0.7·1 + 0.3·10 = 3.7');
  // control variates: E[e^U] = e − 1 with the control U (E = ½): the variance falls by ρ² ≈ 0.984
  const uu = [], yy = []; const rc = S.stream(1, 'cv'); for (let i = 0; i < 1000; i++) { const u = rc(); uu.push(u); yy.push(Math.exp(u)); }
  const cv = S.controlVariate(yy, uu, 0.5);
  ok(cv.lo < Math.E - 1 && cv.hi > Math.E - 1 && cv.vr < 0.03, `control variate (Law §11.4): E[e^U] CI [${cv.lo.toFixed(5)}, ${cv.hi.toFixed(5)}] ∋ e − 1, variance ratio ${cv.vr.toFixed(4)} (1 − ρ² ≈ 0.016)`);
  const up = S.untilPrecision(i => { const s = S.stream(1, 'p').sub(i); let m = 0; for (let j = 0; j < 10; j++) m += s.exp(1); return m / 10; }, { gamma: 0.05 });
  ok(up.reached && up.half / up.mean <= 0.05 / 1.05 && up.n > 50, `sequential relative precision (Law §9.4.1): ${up.n} replications reach γ = 5 %`);
  const rb = S.minimize(x2 => 100 * (x2[1] - x2[0] ** 2) ** 2 + (1 - x2[0]) ** 2, [-1.2, 1], { maxEval: 5000 });
  ok(near(rb.x[0], 1, 1e-4) && near(rb.x[1], 1, 1e-4) && rb.converged, `Nelder–Mead on Rosenbrock's valley from (−1.2, 1): (${rb.x.map(v => v.toFixed(5)).join(', ')}) in ${rb.evals} evaluations`);
  const ts = [0, 1, 2, 3, 4, 5], obs = ts.map(t => 3 * Math.exp(-0.4 * t));
  const cal = S.calibrate(p2 => ts.map(t => p2[0] * Math.exp(-p2[1] * t)), obs, [1, 1], { lo: [0, 0] });
  ok(near(cal.x[0], 3, 1e-4) && near(cal.x[1], 0.4, 1e-4) && cal.rmse < 1e-5, `calibration by least squares: A = ${cal.x[0].toFixed(5)}, k = ${cal.x[1].toFixed(5)} (3, 0.4)`);
  ok(S.sameDim('kg*m/s^2', 'N') && S.sameDim('J', 'N*m') && near(S.convert(36, 'km/h', 'm/s'), 10, 1e-12) && near(S.convert(1, 'mmHg', 'Pa'), 133.322387415, 1e-9) && near(S.convert(90, 'min', 'h'), 1.5, 1e-15) && Number.isNaN(S.convert(1, 'm', 's')) && near(S.convert(2, 'mmol/L', 'mol/m^3'), 2, 1e-12) && !S.dim('furlong').ok, 'units (SI 9th ed.): N = kg·m/s², J = N·m, 36 km/h = 10 m/s, 1 mmHg = 133.322387415 Pa, 90 min = 1.5 h, mmol/L = mol/m³; m → s is NaN; an unknown unit is refused');
  ok(S.conservation([1, 1 + 1e-12, 1 - 1e-12]).ok && !S.conservation([1, 1.1]).ok, 'conservation check');
}

// ---------- 5. steppers, co-simulation, the Worker source, determinism ----------
{
  const mk = (dt, extra) => { const A = S.odeStepper({ id: 'A', y0: () => [1], f: (t, y, d, i) => { d[0] = -(i.y || 0); }, out: (t, y) => ({ x: y[0] }), rtol: 1e-10, atol: 1e-12 });
    const B = S.odeStepper({ id: 'B', y0: () => [0], f: (t, y, d, i) => { d[0] = i.x != null ? i.x : 1; }, out: (t, y) => ({ y: y[0] }), rtol: 1e-10, atol: 1e-12 });
    return S.cosim({ tEnd: 1, dt, parts: [A, B], link: { A: o => ({ y: o.B.y }), B: o => ({ x: o.A.x }) }, ...(extra || {}) }); };
  const e1 = mk(0.1).outs.A.x - Math.cos(1), e2 = mk(0.05).outs.A.x - Math.cos(1), it = mk(0.1, { iterate: { maxIter: 30, tol: 1e-12 } });
  ok(near(e1 / e2, 2, 0.1) && mk(0.1).macro === 10, `co-simulation of x′ = −y, y′ = x split in two parts (Gauss–Seidel, zero-order hold): first order in the macro step (error ratio ${(e1 / e2).toFixed(3)} when dt halves)`);
  ok(it.iterations > 10 && !it.codes.some(c => c.code === 'no-converge') && Math.abs(it.outs.A.x - Math.cos(1)) < 0.05, `strong coupling by snapshot iteration converges (${it.iterations} iterations for 10 macro steps)`);
  // a state event inside a part stops the round at its time; the event is delivered to the other part
  const ball = S.odeStepper({ id: 'ball', y0: () => [1, 0], f: (t, y, d) => { d[0] = y[1]; d[1] = -9.81; }, out: (t, y) => ({ h: y[0] }), events: [{ kind: 'impact', g: (t, y) => y[0], dir: -1, terminal: true, apply: (t, y) => { y[1] = -0.5 * y[1]; } }], rtol: 1e-10, atol: 1e-12 });
  let got = null; const counter = S.stepper({ id: 'counter', init: () => ({ n: 0, t: 0 }), step: (st, inp, t, dt) => ({ state: { ...st, t: t + dt }, out: { n: st.n } }), onEvent: (st, ev) => { got = ev; return { ...st, n: st.n + 1 }; } });
  const cs = S.cosim({ tEnd: 0.6, dt: 0.25, parts: [ball, counter] });
  ok(got && got.kind === 'impact' && got.source === 'ball' && near(got.t, Math.sqrt(2 / 9.81), 1e-9) && cs.outs.counter.n === 1 && !cs.codes.some(c => c.code === 'late-event'), `a terminal state event stops the ball's macro step at ${got && got.t.toFixed(6)} (√(2/g)); the counter is stopped there too and gets the event record in time`);
  const late = S.cosim({ tEnd: 0.6, dt: 0.25, parts: [counter, ball], order: ['counter', 'ball'] });
  ok(late.codes.some(c => c.code === 'late-event' && c.info > 0), 'a consumer stepped before the producer gets the event late (code late-event with the lag)');
  const thrower = S.stepper({ id: 'x', step: () => { throw new Error('boom'); } });
  ok(thrower.step({}, {}, 0, 1).fail === 'part-failed' && S.cosim({ tEnd: 1, dt: 0.5, parts: [thrower] }).codes.some(c => c.code === 'part-failed') && S.cosim({}).codes[0].code === 'bad-config', 'a failing part never throws: part-failed; a bad config → bad-config');
  const rec = S.event(1.5, 'des', 'arrive', { id: 3 }, 2);
  ok(rec.t === 1.5 && rec.source === 'des' && rec.kind === 'arrive' && rec.prio === 2 && Number.isInteger(rec.seq), 'the shared event record {t, source, kind, data, prio, seq}');
  const st = S.odeStepper({ id: 'o', y0: () => [1], f: (t, y, d) => { d[0] = -y[0]; } }), s0 = st.init(), snap = st.snapshot(s0), s1 = st.step(s0, {}, 0, 1).state;
  ok(st.restore(snap).y[0] === 1 && near(s1.y[0], Math.exp(-1), 1e-5) && s0.y[0] === 1, 'stepper snapshot / restore (deep copies of plain state)');
  const wr = S.wrapRun('f', (inp, t) => ({ v: 2 * t })); ok(wr.step(wr.init(), {}, 1, 0.5).out.v === 3, 'wrapRun: a part without time recomputes at the step\'s end');
  // the Worker: a fresh global runs NoemaExpr + core + kit and draws the same numbers
  const W = ENGINES.worker('ode@1').__noemaShared['kernel/simkit.js'], a = S.stream(5, 'w'), b = W.stream(5, 'w');
  ok(!!W && [1, 2, 3, 4].every(() => a.gamma(2, 1) === b.gamma(2, 1)) && W.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1 }).y[0] === S.integrate({ f: (t, y, d) => { d[0] = -y[0]; }, y0: [1], tEnd: 1 }).y[0], 'the Worker bundle (an engine\'s, with the kit inside) in a fresh global gives the same numbers, bit for bit');
  ok(S.deterministic(sd => { const r = S.stream(sd, 'd'); return [r(), r.normal(0, 1), r.poisson(40)]; }, 42), 'determinism: the same seed gives the same results');
  const t0 = process.hrtime.bigint(); const rr = S.stream(1, 'speed'); let acc = 0; for (let i = 0; i < 1e6; i++) acc += rr(); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(ms < 500 && acc > 0, `speed: 1 000 000 uniforms in ${ms.toFixed(0)} ms`);
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
