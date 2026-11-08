/* ode@1 (src/engines/ode/ode.ts, docs/library/ode.md) against published values:
   1. the integrators: exact solutions, orders of convergence, dense output; the pendulum period by K (DLMF 19.2), the Arenstorf orbit
      (HNW I §II.0), Robertson's kinetics (HNW II §IV.10), van der Pol, the Brusselator;
   2. equilibria and eigenvalues (Lorenz ρ_H, the Brusselator and Rosenzweig–MacArthur Hopf points), Lyapunov exponents (Lorenz,
      Hénon, the logistic map at r = 4), delay equations (Hutchinson), maps;
   3. the templates against their closed forms (SIR final size and peak, SEIR R0, PK one- and two-compartment, Michaelis–Menten by
      Lambert W, logistic and Gompertz, chemostat, toggle switch, repressilator, Hodgkin–Huxley, FitzHugh–Nagumo);
   4. every runtime code (blow-up, nan, budget, zeno, stiff, …), the check codes, the golden template table of the former Python twin;
   5. the sim adapter, the Worker source in a fresh global, speed, and the reference activity predator-prey (its tests.json).
   Usage: node tests/lib_ode.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const want = require('./golden.cjs')('lib_ode');   // the golden outputs of the former Python twin (tests/golden.cjs)
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaLibODE = ENGINES.mod('ode@1');
const O = NoemaLibODE, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const spec = (model, outputs, params) => ({ format: 'noema.sim-spec/v1', engine: 'ode@1', params: params || [], model, outputs });
const S = (id, of, extra) => Object.assign({ id, kind: 'scalar', of }, extra || {});
const run = (model, outputs, env) => { const s = spec(model, outputs); const P = O.checkSpec(s).filter(p => p.level === 'error'); if (P.length) { console.log('  check:', JSON.stringify(P)); return { out: {}, codes: [] }; } return O.run(s, env || {}, { seed: 1 }); };
const codes = r => r.codes.map(c => c.code);
const ms = f => { const t = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };

ok(O.id === 'ode@1' && Object.isFrozen(O) && Object.isFrozen(O.engine) && typeof O.engine.workerSource === 'string', 'NoemaLibODE: id ode@1, frozen API, an engine with workerSource');
ok(O.TEMPLATES.length >= 30, `${O.TEMPLATES.length} templates`);

// ---------- 1. integrators ----------
{
  const r = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 1, rtol: 1e-10, atol: 1e-12, points: 11 } }, [S('y1', 'final', { var: 'y' }), { id: 'ys', kind: 'series', of: 'state', var: 'y' }, { id: 't', kind: 'series', of: 't' }]);
  ok(rel(r.out.y1, Math.exp(-1), 1e-9), `y' = −y: DOPRI5 at rtol 1e-10 gives y(1) = ${r.out.y1} (e⁻¹, rel 1e-9)`);
  ok(r.out.ys.length === 11 && r.out.ys.every((v, i) => rel(v, Math.exp(-r.out.t[i]), 1e-9)), 'the dense output (Hairer contd5) at 11 sample times is e^(−t) to 1e-9');
  const order = m => { const e = [0.1, 0.05].map(dt => Math.abs(run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 1, method: m, dt } }, [S('y1', 'final', { var: 'y' })]).out.y1 - Math.exp(-1))); return Math.log2(e[0] / e[1]); };
  const p = { euler: order('euler'), heun: order('heun'), midpoint: order('midpoint'), rk4: order('rk4') };
  ok(near(p.euler, 1, 0.1) && near(p.heun, 2, 0.1) && near(p.midpoint, 2, 0.1) && near(p.rk4, 4, 0.15), `orders of convergence: Euler ${p.euler.toFixed(2)}, Heun ${p.heun.toFixed(2)}, midpoint ${p.midpoint.toFixed(2)}, RK4 ${p.rk4.toFixed(2)} (1, 2, 2, 4)`);
  const ro = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 1, method: 'rosenbrock', rtol: 1e-8, atol: 1e-12 } }, [S('y1', 'final', { var: 'y' })]);
  ok(rel(ro.out.y1, Math.exp(-1), 1e-5), `Rosenbrock 2(3) (Shampine & Reichelt 1997): y(1) = ${ro.out.y1} (rel 1e-5 at rtol 1e-8)`);
}
for (const [th, want, tol] of [[Math.PI / 2, 1.1803405990160962, 1e-8], [3.0, 2.5712339494321420, 1e-7]]) {
  const r = run({ template: 'pendulum', set: { theta0: th }, solve: { tEnd: 30, rtol: 1e-11, atol: 1e-13 } }, [S('T', 'eventPeriod', { event: 'turn' }), S('T0', 'quantity', { name: 'T0' }), S('q', 'quantity', { name: 'ratio' }), S('dE', 'drift', { var: 'E' })]);
  ok(near(r.out.T / r.out.T0, want, tol) && near(r.out.q, want, 1e-13) && r.out.dE < 1e-8, `pendulum θ0 = ${th.toFixed(4)}: T/T0 = ${(r.out.T / r.out.T0).toFixed(10)} measured by events, 2K(sin θ0/2)/π = ${want} (DLMF 19.2, AGM); energy drift ${r.out.dE.toExponential(1)}`);
}
{
  const T = 17.0652165601579625588917206249;
  const r = run({ template: 'arenstorf', solve: { tEnd: T, method: 'dopri5', rtol: 1e-12, atol: 1e-12, maxSteps: 200000 } }, [S('x', 'final', { var: 'x' }), S('y', 'final', { var: 'y' })]);
  ok(Math.hypot(r.out.x - 0.994, r.out.y) < 1e-7, `Arenstorf orbit returns after T = 17.0652…: |Δ| = ${Math.hypot(r.out.x - 0.994, r.out.y).toExponential(2)} (HNW I §II.0; < 1e-7 at rtol 1e-12)`);
  const loose = run({ template: 'arenstorf', solve: { tEnd: T, method: 'dopri5', rtol: 1e-4, atol: 1e-6 } }, [S('x', 'final', { var: 'x' }), S('y', 'final', { var: 'y' })]);
  ok(!(Math.hypot(loose.out.x - 0.994, loose.out.y) < 1e-3), 'the same orbit at rtol 1e-4 misses the start: the tolerance matters');
}
{
  const r = run({ template: 'robertson', solve: { tEnd: 40, rtol: 1e-9, atol: 1e-14, maxSteps: 100000 } }, [S('y1', 'final', { var: 'y1' }), S('y2', 'final', { var: 'y2' }), S('y3', 'final', { var: 'y3' }), S('sw', 'flag', { code: 'stiff-switched' }), S('m', 'drift', { var: 'mass' })]);
  ok(rel(r.out.y1, 0.7158270687, 1e-6) && rel(r.out.y2, 9.185534764e-6, 1e-5) && rel(r.out.y3, 0.2841637457, 1e-6) && r.out.m < 1e-12, `Robertson t = 40: (${r.out.y1.toFixed(10)}, ${r.out.y2.toExponential(9)}, ${r.out.y3.toFixed(10)}) = (0.7158270687, 9.185534764e-6, 0.2841637457) (HNW II §IV.10), mass kept to 1e-12`);
  ok(r.out.sw === 1, 'auto starts with DOPRI5, finds the problem stiff (HNW I §IV.2 test) and switches to Rosenbrock (code stiff-switched)');
  const big = run({ template: 'robertson', solve: { tEnd: 1e11, method: 'rosenbrock', rtol: 1e-6, atol: 1e-12, maxSteps: 200000 } }, [S('y1', 'final', { var: 'y1' }), S('st', 'steps')]);
  ok(rel(big.out.y1, 2.08334015e-8, 2e-2) && big.out.st < 5000, `Robertson t = 1e11 in ${big.out.st} Rosenbrock steps: y1 = ${big.out.y1.toExponential(5)} (2.08334e-8)`);
  const ex = run({ template: 'robertson', solve: { tEnd: 1e3, method: 'dopri5', maxSteps: 5000 } }, [S('b', 'flag', { code: 'budget' }), S('s', 'flag', { code: 'stiff' }), S('ok', 'ok')]);
  ok(ex.out.b === 1 && ex.out.s === 1 && ex.out.ok === 0, 'the explicit method on the same problem: codes stiff and budget, ok = 0');
}
{
  const v = run({ template: 'vdp', solve: { tEnd: 100, rtol: 1e-11, atol: 1e-12 } }, [S('T', 'eventPeriod', { event: 'up' })]);
  ok(near(v.out.T, 6.6632868593, 1e-7), `van der Pol μ = 1: limit cycle period ${v.out.T} (6.6632868593)`);
  const b = run({ template: 'brusselator', solve: { tEnd: 300, rtol: 1e-11, atol: 1e-12 } }, [S('T', 'eventPeriod', { event: 'up' })]);
  ok(near(b.out.T, 7.15691992, 1e-6), `Brusselator A = 1, B = 3: period ${b.out.T} (7.15691992)`);
  const st = run({ template: 'vdp', set: { mu: 1000 }, solve: { tEnd: 3500, maxSteps: 100000 } }, [S('T', 'eventPeriod', { event: 'up' }), S('q', 'quantity', { name: 'relaxPeriod' }), S('sw', 'flag', { code: 'stiff-switched' })]);
  ok(st.out.sw === 1 && rel(st.out.T, 1613.7, 0.01) && rel(st.out.q, 1613.7056, 1e-6), `van der Pol μ = 1000 (stiff): period ${st.out.T.toFixed(1)} ≈ (3 − 2 ln 2)μ = ${st.out.q.toFixed(1)} (relaxation limit, Strogatz §7.5)`);
}
{
  const h = run({ states: [{ id: 'x', init: 1 }, { id: 'v', init: 0 }], rhs: { x: 'v', v: '-x' }, invariants: [{ id: 'E', expr: '0.5*(x^2 + v^2)' }], pairs: [{ q: 'x', p: 'v' }], solve: { tEnd: 1000, method: 'verlet', dt: 0.05, maxSteps: 30000 } }, [S('d', 'drift', { var: 'E' })]);
  const e = run({ states: [{ id: 'x', init: 1 }, { id: 'v', init: 0 }], rhs: { x: 'v', v: '-x' }, invariants: [{ id: 'E', expr: '0.5*(x^2 + v^2)' }], solve: { tEnd: 1000, method: 'heun', dt: 0.05, maxSteps: 30000 } }, [S('d', 'drift', { var: 'E' })]);
  ok(h.out.d < 2e-3 && e.out.d > 10 * h.out.d, `harmonic oscillator over 1000: Störmer–Verlet keeps the energy (drift ${h.out.d.toExponential(1)}, bounded), Heun at the same step loses it (${e.out.d.toFixed(2)}) (HLW 2006 §I.1)`);
  const k = run({ template: 'kepler', set: { vy0: 1.2 }, solve: { tEnd: 150, method: 'yoshida4', dt: 0.005, maxSteps: 40000 } }, [S('d', 'drift', { var: 'energy' }), S('L', 'drift', { var: 'angmom' })]);
  ok(k.out.d < 1e-7 && k.out.L < 1e-10, `Kepler (e = 0.44) with Yoshida 4: energy drift ${k.out.d.toExponential(1)}, angular momentum ${k.out.L.toExponential(1)} (conserved up to round-off by the splitting)`);
}

// ---------- 2. equilibria, eigenvalues, Lyapunov exponents, delays, maps ----------
{
  const ev = O.eigenvalues([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  ok(ev.every((e, i) => near(e.re, [2 + Math.SQRT2, 2, 2 - Math.SQRT2][i], 1e-14) && e.im === 0), 'eigenvalues of the tridiagonal (2, −1): 2 ± √2, 2 (balance + Hessenberg + QR, NR §11.5–11.6)');
  const c = O.eigenvalues([[0, 0, 0, -24], [1, 0, 0, 50], [0, 1, 0, -35], [0, 0, 1, 10]]);
  ok(c.every((e, i) => near(e.re, 4 - i, 1e-12) && near(e.im, 0, 1e-12)), 'companion matrix of (x−1)(x−2)(x−3)(x−4): 4, 3, 2, 1');
  const rot = O.eigenvalues([[0, -2], [2, 0]]);
  ok(near(rot[0].re, 0, 1e-15) && near(Math.abs(rot[0].im), 2, 1e-15) && rot[0].im === -rot[1].im, 'a rotation: ±2i');
  const L = run({ template: 'lorenz', solve: { tEnd: 1 }, equilibria: { box: { x: [-10, 10], y: [-10, 10], z: [0, 30] }, grid: 3 } }, [S('n', 'eqCount'), S('x', 'eq', { index: 2, var: 'x' }), S('z', 'eq', { index: 2, var: 'z' }), S('t0', 'eqType', { index: 1 }), S('cx', 'quantity', { name: 'Cx' })]);
  ok(L.out.n === 3 && near(L.out.x, Math.sqrt(8 / 3 * 27), 1e-9) && near(L.out.z, 27, 1e-9) && L.out.t0 === 1 && near(L.out.cx, L.out.x, 1e-9), `Lorenz: 3 equilibria, C+ = (${L.out.x.toFixed(6)}, …, ${L.out.z}) = (√(β(ρ−1)), …, ρ−1); the origin a saddle`);
  const H = run({ template: 'lorenz', set: { rho: 470 / 19 }, solve: { tEnd: 1 }, equilibria: { box: { x: [-10, 10], y: [-10, 10], z: [0, 30] }, grid: 3 } }, [S('re', 'eigRe', { index: 2, k: 0 }), S('im', 'eigIm', { index: 2, k: 0 }), S('q', 'quantity', { name: 'rhoH' }), S('nh', 'flag', { code: 'non-hyperbolic' })]);
  ok(near(H.out.re, 0, 1e-8) && H.out.im > 9 && near(H.out.q, 470 / 19, 1e-12) && H.out.nh === 1, `Lorenz at ρ_H = σ(σ+β+3)/(σ−β−1) = 470/19: a complex pair on the imaginary axis (Re ${H.out.re.toExponential(1)}), code non-hyperbolic`);
  const B = run({ template: 'brusselator', set: { B: 2 }, solve: { tEnd: 1 }, equilibria: {} }, [S('re', 'eigRe', { index: 0, k: 0 }), S('im', 'eigIm', { index: 0, k: 0 }), S('ty', 'eqType', { index: 0 })]);
  ok(near(B.out.re, 0, 1e-9) && near(B.out.im, 1, 1e-9) && B.out.ty === 6, 'Brusselator Hopf at B = 1 + A² = 2: eigenvalues ±i, type 6 (a linear centre)');
  const R = [2.2, 2.5].map(K => run({ template: 'rm', set: { K, eff: 0.5, m: 0.2 }, solve: { tEnd: 1 }, equilibria: { box: { x: [0.05, 3], y: [0.05, 3] }, grid: 4 } }, [S('x', 'eq', { index: 1, var: 'x' }), S('st', 'eqStable', { index: 1 }), S('kc', 'quantity', { name: 'Kc' })]).out);
  ok(near(R[0].x, 2 / 3, 1e-9) && R[0].st === 1 && R[1].st === 0 && near(R[0].kc, 7 / 3, 1e-12), 'Rosenzweig–MacArthur: x* = 2/3, stable at K = 2.2, unstable at K = 2.5 (paradox of enrichment, K_c = 7/3; Rosenzweig 1971)');
  const T = run({ template: 'toggle', solve: { tEnd: 1 }, equilibria: { box: { u: [0, 10], v: [0, 10] }, grid: 6 } }, [S('n', 'eqCount'), S('u0', 'eq', { index: 0, var: 'u' }), S('u1', 'eq', { index: 1, var: 'u' }), S('u2', 'eq', { index: 2, var: 'u' }), S('t1', 'eqType', { index: 1 }), S('s0', 'eqStable', { index: 0 })]);
  ok(T.out.n === 3 && near(T.out.u0, 0.10102051443, 1e-8) && near(T.out.u1, 2, 1e-9) && near(T.out.u2, 9.89897948557, 1e-8) && T.out.t1 === 1 && T.out.s0 === 1, 'toggle switch α = 10, n = 2: two stable states (0.10102, 9.89898) and the saddle (2, 2) (Gardner et al. 2000; u³ + u − 10 = 0)');
}
{
  const [L, t] = ms(() => run({ template: 'lorenz', solve: { tEnd: 300, rtol: 1e-7, atol: 1e-9, maxSteps: 200000 }, lyapunov: { k: 3, transient: 20 } }, [S('l1', 'lyap', { k: 1 }), S('l2', 'lyap', { k: 2 }), S('l3', 'lyap', { k: 3 }), S('s', 'lyapSum'), S('ky', 'kaplanYorke')]));
  ok(near(L.out.l1, 0.9056, 0.03) && near(L.out.l2, 0, 0.012) && near(L.out.l3, -14.5723, 0.03), `Lorenz Lyapunov spectrum (T = 280): ${L.out.l1.toFixed(4)}, ${L.out.l2.toFixed(4)}, ${L.out.l3.toFixed(4)} (0.9056, 0, −14.5723: Sprott 2003; Benettin et al. 1980)`);
  ok(near(L.out.s, -(10 + 1 + 8 / 3), 1e-5) && near(L.out.ky, 2.062, 0.003), `Σλ = ${L.out.s.toFixed(7)} = −(σ + 1 + β) (Liouville), Kaplan–Yorke dimension ${L.out.ky.toFixed(4)} (2.06); ${t.toFixed(0)} ms`);
  const lm = run({ template: 'logisticmap', set: { r: 4, x0: 0.3 }, solve: { tEnd: 100000, maxSteps: 200000 }, lyapunov: { k: 1, transient: 100 } }, [S('l', 'lyap', { k: 1 })]);
  ok(near(lm.out.l, Math.log(2), 0.005), `logistic map r = 4: λ = ${lm.out.l.toFixed(5)} (ln 2, conjugate to the tent map)`);
  const lc = [2.9, 3.1, 3.5].map(r => run({ template: 'logisticmap', set: { r }, solve: { tEnd: 4000 }, lyapunov: { k: 1, transient: 1000 }, equilibria: { box: { x: [0, 1] }, grid: 4 } }, [S('l', 'lyap', { k: 1 }), S('x', 'eq', { index: 1, var: 'x' }), S('st', 'eqStable', { index: 1 })]).out);
  ok(lc[0].l < 0 && lc[0].st === 1 && lc[1].st === 0 && lc[1].l < 0 && near(lc[0].x, 1 - 1 / 2.9, 1e-12), 'logistic map: the fixed point 1 − 1/r is stable at r = 2.9, unstable at r = 3.1 (period 2, λ < 0); period doubling at r = 3 (May 1976)');
  const he = run({ template: 'henon', solve: { tEnd: 100000, maxSteps: 200000 }, lyapunov: { k: 2, transient: 100 }, equilibria: { box: { x: [-2, 2], y: [-1, 1] }, grid: 3 } }, [S('l1', 'lyap', { k: 1 }), S('l2', 'lyap', { k: 2 }), S('x', 'eq', { index: 1, var: 'x' }), S('y', 'eq', { index: 1, var: 'y' })]);
  ok(near(he.out.l1, 0.4192, 0.003) && near(he.out.l1 + he.out.l2, Math.log(0.3), 1e-6) && near(he.out.x, 0.6313544770895047, 1e-12) && near(he.out.y, 0.1894063431268514, 1e-12), `Hénon (1.4, 0.3): λ1 = ${he.out.l1.toFixed(4)} (0.4192, Sprott 2003), λ1 + λ2 = ln b, fixed point (0.631354477, 0.189406343)`);
  const dd = [1.0, 1.7].map(tau => run({ template: 'delaylogistic', set: { tau }, solve: { tEnd: 400, transient: 300 } }, [S('pp', 'stat', { var: 'x', stat: 'pp' }), S('q', 'quantity', { name: 'tauHopf' })]).out);
  ok(dd[0].pp < 1e-4 && dd[1].pp > 0.5 && near(dd[0].q, Math.PI / 2, 1e-15), `delayed logistic (Hutchinson): τ = 1 settles (swing ${dd[0].pp.toExponential(1)}), τ = 1.7 > π/2 oscillates (swing ${dd[1].pp.toFixed(2)}) (Hopf at rτ = π/2)`);
  const mg = run({ template: 'mackeyglass', solve: { tEnd: 600, transient: 300 } }, [S('mx', 'stat', { var: 'x', stat: 'max' }), S('mn', 'stat', { var: 'x', stat: 'min' })]);
  ok(mg.out.mx > 1.1 && mg.out.mx < 1.5 && mg.out.mn > 0.2 && mg.out.mn < 0.6, `Mackey–Glass τ = 17: an irregular oscillation between ${mg.out.mn.toFixed(2)} and ${mg.out.mx.toFixed(2)} (≈ 0.4–1.3, Mackey & Glass 1977)`);
}

// ---------- 3. templates against their closed forms ----------
{
  const s = run({ template: 'sir', set: { beta: 0.2, gamma: 0.1, I0: 1e-6 }, solve: { tEnd: 600, rtol: 1e-10, atol: 1e-14 } }, [S('R', 'final', { var: 'R' }), S('z', 'quantity', { name: 'finalSize' }), S('R0', 'quantity', { name: 'R0' }), S('dt', 'drift', { var: 'total' })]);
  ok(near(s.out.R, 0.79681213, 5e-6) && near(s.out.z, s.out.R, 1e-9) && s.out.R0 === 2 && s.out.dt < 1e-12, `SIR R0 = 2: final size ${s.out.R.toFixed(8)} = the root of z = 1 − e^(−R0 z) (0.79681213; Kermack & McKendrick 1927), S + I + R kept`);
  const p = run({ template: 'sir', set: { beta: 0.3, gamma: 0.1, I0: 1e-6 }, solve: { tEnd: 300, rtol: 1e-10, atol: 1e-14, points: 2000 } }, [S('Im', 'stat', { var: 'I', stat: 'max' }), S('q', 'quantity', { name: 'peakI' }), S('tp', 'eventTime', { event: 'peak', nth: 1 }), { id: 'tt', kind: 'series', of: 't' }]);
  ok(near(p.out.Im, 0.30046257, 2e-6) && near(p.out.q, 0.30046257, 2e-6) && p.out.tp > 0, `SIR R0 = 3: peak prevalence ${p.out.Im.toFixed(7)} = 1 − (1 + ln R0)/R0 (0.3004626), at the event peak (S = N/R0), t = ${p.out.tp.toFixed(2)}`);
  for (const [R0, z] of [[1.5, 0.5828116438658119], [2.5, 0.8926447536092056], [3, 0.9404797907073597]]) ok(near(1 - O.sirFinal(R0, 1, 0), z, 1e-12), `final-size equation R0 = ${R0}: ${z}`);
  const e = run({ template: 'seir', set: { beta: 1, sigma: 0.2, gamma: 0.1 }, solve: { tEnd: 1 } }, [S('R0', 'quantity', { name: 'R0' }), S('r', 'quantity', { name: 'growth' })]);
  ok(near(e.out.R0, 10, 1e-12) && near((1 + e.out.r / 0.2) * (1 + e.out.r / 0.1), 10, 1e-9), `SEIR β = 1, σ = 0.2, γ = 0.1: R0 = βσ/((σ+μ)(γ+μ)) = 10; growth rate r = ${e.out.r.toFixed(6)} with (1 + r/σ)(1 + r/γ) = R0 (Wallinga & Lipsitch 2007)`);
  const sv = run({ template: 'sir', set: { beta: 0.5, gamma: 0.1, mu: 0.02, I0: 0.01 }, solve: { tEnd: 3000, transient: 2500, rtol: 1e-10, atol: 1e-12 } }, [S('S', 'final', { var: 'S' }), S('I', 'final', { var: 'I' }), S('Ss', 'quantity', { name: 'Sstar' }), S('Is', 'quantity', { name: 'Istar' })]);
  ok(near(sv.out.S, sv.out.Ss, 1e-6) && near(sv.out.I, sv.out.Is, 1e-6), `SIR with births and deaths: the endemic state S* = N/R0 = ${sv.out.Ss.toFixed(4)}, I* = μN(R0 − 1)/β = ${sv.out.Is.toFixed(5)} (Anderson & May 1991)`);
}
{
  const iv = run({ template: 'pk', set: { ka: 0, dose: 100, V: 10, CL: 2 }, solve: { tEnd: 10, rtol: 1e-10, atol: 1e-12 } }, [S('c5', 'at', { var: 'C', t: 5 }), S('th', 'quantity', { name: 'thalf' }), S('auc', 'quantity', { name: 'AUC' })]);
  ok(near(iv.out.c5, 3.67879441, 1e-7) && near(iv.out.th, 3.4657359, 1e-7) && iv.out.auc === 50, `IV bolus D = 100, V = 10, CL = 2: C(5) = ${iv.out.c5.toFixed(8)} (10·e⁻¹), t½ = ln 2·V/CL = 3.46574 (Rowland & Tozer 2019)`);
  const po = run({ template: 'pk', set: { ka: 1, CL: 2, V: 10 }, solve: { tEnd: 60, rtol: 1e-10, atol: 1e-12, points: 2000 } }, [S('cm', 'stat', { var: 'C', stat: 'max' }), S('tm', 'quantity', { name: 'tmax' }), S('Cm', 'quantity', { name: 'Cmax' })]);
  ok(near(po.out.tm, 2.01180, 1e-5) && near(po.out.Cm, 6.68740, 1e-5) && near(po.out.cm, po.out.Cm, 2e-4), `oral ka = 1, k = 0.2 (Bateman 1910): t_max = ${po.out.tm.toFixed(5)} (2.01180), C_max = ${po.out.Cm.toFixed(5)} (6.68740), the ODE's peak ${po.out.cm.toFixed(5)}`);
  const rep = run({ template: 'pk', set: { ka: 0, CL: 2, V: 10, tau: 12, doses: 30 }, solve: { tEnd: 360, rtol: 1e-10, atol: 1e-12 } }, [S('mx', 'at', { var: 'C', t: 348.0000001 }), S('R', 'quantity', { name: 'Racc' }), S('Cx', 'quantity', { name: 'CssMax' }), S('Cn', 'quantity', { name: 'CssMin' }), S('nd', 'eventCount', { event: 'dose' })]);
  ok(near(rep.out.R, 1.09977, 1e-5) && near(rep.out.Cx, 10.9977, 1e-4) && near(rep.out.Cn, 0.99769, 1e-5) && near(rep.out.mx, rep.out.Cx, 1e-5) && rep.out.nd === 30, `repeated IV bolus every 12 h: R = 1/(1 − e^(−kτ)) = ${rep.out.R.toFixed(5)}, C_ss,max ${rep.out.Cx.toFixed(4)} = the ODE just after the 30th dose, C_ss,min ${rep.out.Cn.toFixed(5)}`);
  const orr = run({ template: 'pk', set: { ka: 1, CL: 1, V: 5, tau: 12, doses: 20 }, solve: { tEnd: 240, rtol: 1e-10, atol: 1e-12, points: 2000, transient: 200 } }, [S('mx', 'stat', { var: 'C', stat: 'max' }), S('mn', 'stat', { var: 'C', stat: 'min' }), S('Cx', 'quantity', { name: 'CssMax' }), S('Cn', 'quantity', { name: 'CssMin' })]);
  ok(near(orr.out.mx, orr.out.Cx, 2e-3) && near(orr.out.mn, orr.out.Cn, 2e-3), `repeated oral doses: the steady-state peak ${orr.out.Cx.toFixed(4)} and trough ${orr.out.Cn.toFixed(4)} (superposition) = the ODE's (${orr.out.mx.toFixed(4)}, ${orr.out.mn.toFixed(4)})`);
  const deg = run({ template: 'pk', set: { ka: 0.2, CL: 2, V: 10 }, solve: { tEnd: 10 } }, [S('tm', 'quantity', { name: 'tmax' }), S('f', 'flag', { code: 'degenerate-closed-form' })]);
  ok(near(deg.out.tm, 5, 1e-12) && deg.out.f === 1, 'ka = k: the Bateman formula divides by zero; the limit t_max = 1/k is used and the code degenerate-closed-form raised');
  const inf = run({ template: 'pk', set: { ka: 0, dose: 0, rate: 10, Tinf: 100, CL: 2, V: 10 }, solve: { tEnd: 20, rtol: 1e-10, atol: 1e-12 } }, [S('c10', 'at', { var: 'C', t: 10 }), S('css', 'quantity', { name: 'Css' })]);
  ok(near(inf.out.c10, 4.32332358, 1e-7) && inf.out.css === 5, `infusion 10/h, CL = 2, V = 10: C(10) = ${inf.out.c10.toFixed(8)} = 5(1 − e⁻²), C_ss = 5`);
  const two = run({ template: 'pk2', solve: { tEnd: 10, rtol: 1e-11, atol: 1e-13 } }, [S('c5', 'at', { var: 'C', t: 5 }), S('a', 'quantity', { name: 'alpha' }), S('b', 'quantity', { name: 'beta' }), S('A', 'quantity', { name: 'A' }), S('B', 'quantity', { name: 'B' })]);
  const cf = two.out.A * Math.exp(-two.out.a * 5) + two.out.B * Math.exp(-two.out.b * 5);
  ok(near(two.out.a, 0.544949, 1e-6) && near(two.out.b, 0.055051, 1e-6) && near(two.out.A, 9.08248, 1e-5) && near(two.out.B, 0.91752, 1e-5) && near(two.out.c5, 1.29222, 1e-5) && near(two.out.c5, cf, 1e-9), `two-compartment: α = ${two.out.a.toFixed(6)}, β = ${two.out.b.toFixed(6)}, C(5) = ${two.out.c5.toFixed(5)} = A e^(−αt) + B e^(−βt) (1.29222)`);
}
{
  for (const [t, want] of [[5, 6.016243922935495], [10, 2.65345]]) {
    const m = run({ template: 'mm', solve: { tEnd: t, rtol: 1e-11, atol: 1e-12 } }, [S('S', 'final', { var: 'S' }), S('W', 'quantity', { name: 'Sexact' })]);
    ok(near(m.out.S, want, t === 5 ? 1e-9 : 1e-5) && near(m.out.W, m.out.S, 1e-8), `integrated Michaelis–Menten Km = 2, V = 1, S0 = 10: S(${t}) = ${m.out.S.toFixed(9)} = Km·W((S0/Km)e^((S0 − Vt)/Km)) (Schnell & Mendoza 1997)`);
  }
  const q = (I, Ki, Kiu) => run({ template: 'mm', set: { Vmax: 1, Km: 1, S0: 1, I, Ki, Kiu }, solve: { tEnd: 1 } }, [S('v', 'quantity', { name: 'v0' }), S('k', 'quantity', { name: 'KmApp' })]).out;
  const [c, u, nc] = [q(1, 1, 0), q(1, 0, 1), q(1, 1, 1)];
  ok(near(c.v, 1 / 3, 1e-15) && near(u.v, 1 / 3, 1e-15) && near(nc.v, 1 / 4, 1e-15) && c.k === 2 && u.k === 0.5 && nc.k === 1, 'inhibition at V = Km = S = I = Ki: competitive 1/3 (Km,app 2), uncompetitive 1/3 (Km,app ½), pure noncompetitive 1/4 (Km,app = Km) (Cornish-Bowden 2012)');
  const full = run({ template: 'mmfull', solve: { tEnd: 50, rtol: 1e-10, atol: 1e-12 } }, [S('e', 'drift', { var: 'enzyme' }), S('s', 'drift', { var: 'substrate' }), S('km', 'quantity', { name: 'Km' })]);
  ok(full.out.e < 1e-10 && full.out.s < 1e-10 && full.out.km === 2, 'full mass action E + S ⇌ C → E + P: E + C and S + C + P conserved, Km = (k−1 + k2)/k1 (Briggs & Haldane 1925)');
  const lg = run({ template: 'logistic', solve: { tEnd: 10, rtol: 1e-11, atol: 1e-12 } }, [S('N', 'final', { var: 'N' }), S('q', 'quantity', { name: 'Nexact' })]);
  const gz = run({ template: 'gompertz', solve: { tEnd: 10, rtol: 1e-11, atol: 1e-12 } }, [S('N', 'final', { var: 'N' }), S('q', 'quantity', { name: 'Nexact' })]);
  ok(near(lg.out.N, 599.860, 1e-3) && near(lg.out.q, lg.out.N, 1e-6) && near(gz.out.N, 969.447, 1e-3) && near(gz.out.q, gz.out.N, 1e-6), `r = 0.5, K = 1000, N0 = 10, t = 10: logistic ${lg.out.N.toFixed(3)} (599.860), Gompertz ${gz.out.N.toFixed(3)} (969.447)`);
  const ch = run({ template: 'chemostat', solve: { tEnd: 400, rtol: 1e-10, atol: 1e-12 } }, [S('S', 'final', { var: 'S' }), S('X', 'final', { var: 'X' }), S('Dc', 'quantity', { name: 'Dc' })]);
  const wash = run({ template: 'chemostat', set: { D: 0.97 }, solve: { tEnd: 2000 } }, [S('X', 'final', { var: 'X' })]);
  ok(near(ch.out.S, 0.5, 1e-6) && near(ch.out.X, 4.75, 1e-6) && near(ch.out.Dc, 0.952381, 1e-6) && wash.out.X < 1e-3, `chemostat (Monod 1950): S* = ${ch.out.S.toFixed(6)}, X* = ${ch.out.X.toFixed(6)}; washout above D_c = 0.952381 (D = 0.97: X → ${wash.out.X.toExponential(1)})`);
  const lv = run({ template: 'lv', set: { alpha: 1, beta: 1, gamma: 1, delta: 1, x0: 2, y0: 1 }, solve: { tEnd: 66, rtol: 1e-11, atol: 1e-12 } }, [S('T', 'eventPeriod', { event: 'cycle' }), S('d', 'drift', { var: 'H' }), S('p0', 'quantity', { name: 'smallPeriod' })]);
  ok(near(lv.out.T, 6.6085, 1e-3) && lv.out.d < 1e-8 && near(lv.out.p0, 2 * Math.PI, 1e-14), `Lotka–Volterra α = β = γ = δ = 1 from (2, 1): period ${lv.out.T.toFixed(4)} (6.6085 > 2π), H = δx − γ ln x + βy − α ln y kept to ${lv.out.d.toExponential(1)}`);
  const rp = run({ template: 'repressilator', solve: { tEnd: 500, rtol: 1e-9, atol: 1e-10, transient: 200 } }, [S('T', 'eventPeriod', { event: 'cycle' }), S('mx', 'stat', { var: 'p1', stat: 'max' })]);
  ok(rel(rp.out.T, 43.45, 0.01) && rel(rp.out.mx, 59.2, 0.01), `repressilator (Elowitz & Leibler 2000 Box 1): period ${rp.out.T.toFixed(2)} mRNA lifetimes (43.45 ≈ 125 min), protein peak ${rp.out.mx.toFixed(1)} (59.2)`);
}
{
  const rest = run({ template: 'hh', solve: { tEnd: 10 }, equilibria: {} }, [S('V', 'eq', { index: 0, var: 'V' }), S('m', 'eq', { index: 0, var: 'm' }), S('st', 'eqStable', { index: 0 })]);
  ok(near(rest.out.V, -64.996, 0.01) && near(rest.out.m, 0.0530, 5e-4) && rest.out.st === 1, `Hodgkin–Huxley rest: V = ${rest.out.V.toFixed(3)} mV (−64.996), m = ${rest.out.m.toFixed(4)}, stable (Hodgkin & Huxley 1952, modern convention)`);
  const tr = run({ template: 'hh', set: { I: 10 }, solve: { tEnd: 300, rtol: 1e-8, atol: 1e-10, transient: 100, points: 2000 } }, [S('T', 'eventPeriod', { event: 'spike' }), S('vm', 'stat', { var: 'V', stat: 'max' })]);
  ok(near(1000 / tr.out.T, 68.3, 1) && tr.out.vm > 20 && tr.out.vm < 50, `HH at 10 µA/cm²: ${(1000 / tr.out.T).toFixed(1)} Hz (≈ 68 Hz), spike peak ${tr.out.vm.toFixed(1)} mV sampled (+20 … +50)`);
  const p5 = run({ template: 'hh', set: { Ipulse: 5 }, solve: { tEnd: 20, rtol: 1e-8, points: 2000 } }, [S('vm', 'stat', { var: 'V', stat: 'max' }), S('ns', 'eventCount', { event: 'spike' })]);
  const p10 = run({ template: 'hh', set: { Ipulse: 10 }, solve: { tEnd: 20, rtol: 1e-8, points: 2000 } }, [S('vm', 'stat', { var: 'V', stat: 'max' }), S('ns', 'eventCount', { event: 'spike' })]);
  ok(p5.out.ns === 0 && p5.out.vm < -55 && p10.out.ns === 1 && p10.out.vm > 30, `HH 1-ms pulse: 5 µA/cm² stays below threshold (V_max ${p5.out.vm.toFixed(1)} mV), 10 µA/cm² fires one spike (V_max ${p10.out.vm.toFixed(1)} mV): all or none`);
  const fh = run({ template: 'fhn', solve: { tEnd: 400, rtol: 1e-10, atol: 1e-12 } }, [S('T', 'eventPeriod', { event: 'spike' }), S('i1', 'quantity', { name: 'IH1' }), S('i2', 'quantity', { name: 'IH2' })]);
  const f0 = run({ template: 'fhn', set: { I: 0 }, solve: { tEnd: 1 }, equilibria: {} }, [S('v', 'eq', { index: 0, var: 'v' }), S('w', 'eq', { index: 0, var: 'w' })]);
  ok(near(fh.out.i1, 0.33128, 1e-5) && near(fh.out.i2, 1.41872, 1e-5) && rel(fh.out.T, 39.47, 0.005) && near(f0.out.v, -1.19941, 1e-5) && near(f0.out.w, -0.62426, 1e-5), `FitzHugh–Nagumo: rest (${f0.out.v.toFixed(5)}, ${f0.out.w.toFixed(5)}), Hopf currents ${fh.out.i1.toFixed(5)} and ${fh.out.i2.toFixed(5)}, period at I = 0.5 ${fh.out.T.toFixed(2)} (39.47) (FitzHugh 1961)`);
  ok(near(O.lambertWlog(Math.log(Math.E)), 1, 1e-15) && near(O.lambertWlog(1000), 1000 - Math.log(1000) + Math.log(1000) / 1000, 1e-4) && near(O.ellipK(Math.SQRT1_2), 1.8540746773013719, 1e-15), 'Lambert W from its log (W(e) = 1, no overflow at x = e¹⁰⁰⁰), K(1/√2) = 1.854074677301372 (DLMF 19.20)');
}

// ---------- 4. runtime codes ----------
{
  const b = run({ states: [{ id: 'y', init: 1 }], rhs: { y: 'y^2' }, solve: { tEnd: 2 } }, [S('y', 'final', { var: 'y' }), S('ok', 'ok')]);
  ok(codes(b).includes('blow-up') && b.out.ok === 0 && Number.isNaN(b.out.y) && rel(b.codes[0].t, 1, 1e-5), `y' = y², y(0) = 1: blow-up at t ≈ ${b.codes[0].t.toFixed(6)} (exact 1), final NaN, ok 0`);
  const nn = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-sqrt(y - 2)' }, solve: { tEnd: 2 } }, [S('ok', 'ok')]);
  ok(codes(nn).includes('nan') && nn.out.ok === 0, 'a NaN right-hand side: code nan, never a hang');
  const ni = run({ states: [{ id: 'y', init: 'log(-1)' }], rhs: { y: '-y' }, solve: { tEnd: 1 } }, [S('y', 'final', { var: 'y' })]);
  ok(codes(ni).includes('nan') && Number.isNaN(ni.out.y), 'a NaN initial value: code nan');
  const tm = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 'kk' } }, [S('y', 'final', { var: 'y' })], { kk: -1 });
  ok(codes(tm).includes('time') && Number.isNaN(tm.out.y), 'tEnd before t0 at runtime (a slider): code time, NaN outputs');
  const bu = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 100, rtol: 1e-12, atol: 1e-14, maxSteps: 50 } }, [S('b', 'flag', { code: 'budget' })]);
  ok(bu.out.b === 1 && bu.codes.find(c => c.code === 'budget').level === 'error', 'more steps than maxSteps: code budget (an error), the run stops');
  const ze = run({ states: [{ id: 'h', init: 1 }, { id: 'v', init: 0 }], rhs: { h: 'v', v: '-9.81' }, events: [{ id: 'b', when: 'h', dir: -1, set: { v: '-0.8*v', h: '0' } }], solve: { tEnd: 20 } }, [S('n', 'eventCount', { event: 'b' }), S('z', 'flag', { code: 'zeno' }), S('t1', 'eventTime', { event: 'b', nth: 1 })]);
  const tz = Math.sqrt(2 / 9.81) * (1 + 2 * 0.8 / (1 - 0.8));
  ok(ze.out.z === 1 && near(ze.codes.find(c => c.code === 'zeno').t, tz, 1e-3) && near(ze.out.t1, Math.sqrt(2 / 9.81), 1e-9), `a bouncing ball with restitution 0.8: first bounce at √(2h/g), Zeno point at ${tz.toFixed(4)} s found (code zeno)`);
  const sp = run({ states: [{ id: 'x', init: 0 }], rhs: { x: '1' }, events: [{ id: 'end', when: 'x - 0.5', stop: true }], solve: { tEnd: 2, points: 5 } }, [S('x', 'final', { var: 'x' }), { id: 't', kind: 'series', of: 't' }, S('st', 'flag', { code: 'stopped' })]);
  ok(near(sp.out.x, 0.5, 1e-12) && sp.out.st === 1 && sp.out.t.length === 2, 'a terminal event stops the run at x = 0.5 (code stopped); the series end there');
  const ns = run({ states: [{ id: 'x', init: 1 }], rhs: { x: '1' }, solve: { tEnd: 1 }, equilibria: {} }, [S('n', 'eqCount'), S('f', 'flag', { code: 'newton' })]);
  ok(ns.out.n === 0 && ns.out.f === 1, "x' = 1 has no equilibrium: eqCount 0, code newton");
  const me = run({ kind: 'map', states: [{ id: 'x', init: 0.5 }], next: { x: '5*x*(1 - x)' }, solve: { tEnd: 100 } }, [S('e', 'flag', { code: 'map-escape' })]);
  ok(me.out.e === 1, 'the logistic map at r = 5 leaves every bound: code map-escape');
  const pn = run({ states: [{ id: 'y', init: 1 }], rhs: { y: '-y' }, solve: { tEnd: 5 } }, [S('p', 'period', { var: 'y' })]);
  ok(Number.isNaN(pn.out.p) && codes(pn).includes('period-not-found'), 'a decay has no period: NaN, code period-not-found');
  const tq = run({ template: 'sir', set: { mu: 0.01 }, solve: { tEnd: 1 } }, [S('z', 'quantity', { name: 'finalSize' })]);
  ok(Number.isNaN(tq.out.z) && codes(tq).includes('template-quantity'), 'a closed form that does not apply (SIR final size with births): NaN, code template-quantity');
  const ls = run({ template: 'lorenz', solve: { tEnd: 2 }, lyapunov: { k: 1 } }, [S('l', 'lyap', { k: 1 })]);
  ok(codes(ls).includes('lyap-short'), 'a Lyapunov exponent over 2 time units: code lyap-short');
  const dr = run({ states: [{ id: 'x', init: 1 }, { id: 'v', init: 0 }], rhs: { x: 'v', v: '-x' }, invariants: [{ id: 'E', expr: 'x^2 + v^2' }], solve: { tEnd: 50, method: 'euler', dt: 0.05 } }, [S('d', 'drift', { var: 'E' })]);
  ok(codes(dr).includes('invariant-drift') && dr.out.d > 1, `Euler on the oscillator: the energy grows (drift ${dr.out.d.toFixed(1)}), code invariant-drift`);
  ok(O.CODES.every(c => typeof c === 'string') && ['blow-up', 'nan', 'budget', 'zeno', 'stiff', 'stiff-switched', 'newton', 'map-escape', 'lyap-short', 'invariant-drift', 'period-not-found', 'template-quantity', 'degenerate-closed-form', 'stopped', 'non-hyperbolic', 'time'].every(c => O.CODES.includes(c)), 'every runtime code above is in NoemaLibODE.CODES (the flag output names them)');
}

// ---------- 5. checks, the golden outputs of the former Python twin ----------
{
  const ck = s => O.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + ' ' + p.path);
  ok(!ck(spec({ template: 'sir', solve: { tEnd: 10 } }, [S('R0', 'quantity', { name: 'R0' })])).length, 'a template spec with a quantity has no problems');
  ok(ck(spec({ template: 'sir', set: { zeta: 1 }, solve: { tEnd: 10 } }, [])).includes('value model.set.zeta'), 'a parameter the template has not: value model.set.zeta');
  ok(ck(spec({ states: [{ id: 'x', init: 1 }], rhs: { x: '-x' }, solve: { tEnd: 10, method: 'euler', dt: 1e-6 } }, [])).includes('budget model.solve.dt'), 'a fixed step that needs more than maxSteps: budget');
  ok(ck(spec({ states: [{ id: 'x', init: 1 }], rhs: { x: '-x' }, solve: { tEnd: 1 } }, [S('q', 'wobble')])).includes('output outputs[0].of'), 'an output it does not compute: output outputs[0].of');
  ok(ck(spec({ states: [{ id: 'x', init: 1 }], rhs: { x: '-x' }, solve: { tEnd: 1 } }, [], [{ id: 'x', kind: 'slider', label: 'l', min: 0, max: 1, default: 0 }])).includes('dup-name model.states'), 'a state named like a spec parameter: dup-name');
  ok(ck(spec({ states: [{ id: 'x', init: 1 }], rhs: { x: '-x' }, events: [{ id: 'e', when: 'x', at: 1 }], solve: { tEnd: 1 } }, [])).includes('event model.events[0]'), 'an event with when and at: event');
  const ex = O.exprs(spec({ states: [{ id: 'x', init: 'x0' }], rhs: { x: '-k*x' }, solve: { tEnd: 'T' } }, [S('a', 'at', { var: 'x', t: 'T/2' })]));
  ok(JSON.stringify(ex) === JSON.stringify([['x0', 'model.states[0].init', []], ['-k*x', 'model.rhs.x', ['x', 't']], ['T', 'model.solve.tEnd', []], ['T/2', 'outputs[0].t', []]]), 'exprs: every expression with its local names (the states and t inside the equations, none outside)');
  const pyMeta = want('tmeta', undefined, O.templateMeta());
  ok(JSON.stringify(pyMeta) === JSON.stringify(O.templateMeta()), `the golden TMETA of the former twin tools/lib_ode.py = templateMeta() of the JS (${Object.keys(pyMeta).length} templates)`);
  const pyLists = want('tables', undefined, [O.CODES, O.METHODS, O.SERIES, O.SCALARS, O.SCENES]);
  ok(JSON.stringify(pyLists) === JSON.stringify([O.CODES, O.METHODS, O.SERIES, O.SCALARS, O.SCENES]), 'the same, as the golden tables of the former Python twin: codes, methods and output names');
}

// ---------- 6. the adapter, the Worker, speed, the reference activity ----------
{
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'predator-prey', 'spec.json'), 'utf8'));
  const sim = O.engine.create(ex, { seed: 1 });
  const [o, t1] = ms(() => sim.run({ K: 4, Kmin: 2 }));
  ok(Array.isArray(o.t) && o.t.length === 600 && o.prey.length === 600 && typeof o.swing === 'number' && o.portrait && o.portrait.items.length > 50 && o.portrait.items.length <= 2000, `engine.create(spec).run(inputs): series (600 points), scalars and a phase scene (${o.portrait.items.length} items)`);
  ok(o.portrait.items.every(it => C.ROLES.includes(it.c || 'base')) && o.portrait.items.some(it => it.k === 'seg' && it.arrow) && o.portrait.items.some(it => it.c === 'info'), 'the phase scene: roles only, a direction field (arrows) and nullclines');
  ok(t1 < 50, `a typical run (the predator-prey activity) takes ${t1.toFixed(1)} ms (< 50)`);
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + O.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(ex, { seed: 1 }).run({ K: 4, Kmin: 2 });
  ok(JSON.stringify(w) === JSON.stringify(o), 'the Worker source in a fresh global gives the same outputs, bit for bit');
  const bad = O.engine.create({ ...ex, model: { template: 'nope' } }, {}).run({ K: 1 });
  ok(Number.isNaN(bad.swing) && Array.isArray(bad.t) && bad.t.length === 0, 'a spec that does not stand: NaN scalars, empty series, no throw');
  const [, tw] = ms(() => run({ template: 'lorenz', solve: { tEnd: 100, maxSteps: 200000 }, lyapunov: { k: 3 } }, [S('l', 'lyap', { k: 1 })]));
  const [, tb] = ms(() => run({ template: 'logisticmap', solve: { tEnd: 10, maxSteps: 200000 }, sweep: { var: 'rr', value: 3, min: 2.5, max: 4, points: 400, of: 'x', keep: 5, transient: 495 } }, [{ id: 'o', kind: 'scene', of: 'orbit' }]));
  ok(tw < 2000 && tb < 2000, `heavy runs: a Lorenz spectrum over 100 (${tw.toFixed(0)} ms), an orbit diagram of 200 000 iterations (${tb.toFixed(0)} ms) — each < 2 s`);
  // the activity's own cases (tests.json): the values and the pass/fail of the exercise's checks
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'predator-prey', 'tests.json'), 'utf8'));
  const checks = ['K >= Kmin', 'stable == 1', 'predEnd > 0.1'].map(e => NoemaExpr.compile(e));
  for (const c of T.cases) {
    const v = { K: ex.params[0].default, Kmin: ex.consts.Kmin }; for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = { ...v, ...Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')) };
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `predator-prey: ${c.name}`);
  }
  // the readout "the coexistence state is stable": below K = x* = 2/3 equilibrium 1 is the predator-free (K, 0), stable while the predators die out
  const stableRo = NoemaExpr.compile(ex.readouts.find(r => r.label === 'stableLabel').expr);
  const ro = K => { const v = { K, Kmin: ex.consts.Kmin }, out = sim.run(v); return { env: { ...v, ...Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')) } }; };
  const lo = ro(0.5), hi = ro(2.2);
  ok(lo.env.stable === 1 && lo.env.predEnd < 1e-6 && !stableRo(lo.env) && !!stableRo(hi.env), `predator-prey: at K = 0.5 the predators die out (predEnd ${lo.env.predEnd.toExponential(1)}) and the readout does not call it stable coexistence; at K = 2.2 it does`);
  const strings = ['en', 'el', 'ru', 'de', 'fr'].map(l => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'predator-prey', `strings.${l}.json`), 'utf8')));
  ok(strings.every(s => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(Object.keys(strings[0]).sort())), 'predator-prey: the five string tables have the same keys');
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
