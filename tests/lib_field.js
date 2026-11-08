/* field@1 (src/engines/field/field.js, docs/library/field.md) against exact and published values:
   1. heat: the Gaussian kernel (Crank–Nicolson, FTCS at the auto step, BTCS, ADI in 2-D), the decaying sine mode, conservation
      under Neumann walls, the FTCS instability beyond r = ½ (von Neumann), Robin cooling to its steady profile, sources, obstacles,
      the 9-point Laplacian;
   2. advection: a square wave once round a periodic domain — upwind, Lax–Wendroff (overshoot), the TVD limiters (monotone, Sweby
      1984), centred FTCS (unstable); advection–diffusion; the wave equation against d'Alembert, its energy conserved by leapfrog;
   3. reaction–diffusion: the Fisher–KPP front speed 2√(rD) (Fisher 1937; Kolmogorov et al. 1937), the Turing analysis of
      Schnakenberg against the dispersion relation, Gray–Scott patterns (Pearson 1993);
   4. Laplace in a square (the centre is ¼ by superposition), SOR / Gauss–Seidel / Jacobi iteration counts;
   5. cellular automata: rule 90 (Sierpiński: population 2^popcount(t)), rule 30 (Wolfram 1983, OEIS A070952), the Life glider,
      the abelian sandpile (Bak, Tang & Wiesenfeld 1987; Dhar 1990: sync = async), forest fire, Greenberg–Hastings;
   6. events, interrupts, probes, codes, the checker (and the golden outputs of its former Python twin), the sim adapter, the stepper, the Worker source, speed,
      and the reference activity heat-stability (its tests.json).
   Usage: node tests/lib_field.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const want = require('./golden.cjs')('lib_field');   // the golden outputs of the former Python twin (tests/golden.cjs)
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaLibField = ENGINES.mod('field@1');
const F = NoemaLibField, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const spec = (model, outputs, params) => ({ format: 'noema.sim-spec/v1', engine: 'field@1', params: params || [], model, outputs });
const S = (id, of, extra) => Object.assign({ id, kind: 'scalar', of }, extra || {});
const Se = (id, of, extra) => Object.assign({ id, kind: 'series', of }, extra || {});
const Sc = (id, of, extra) => Object.assign({ id, kind: 'scene', of }, extra || {});
const run = (model, outputs, env) => { const s = spec(model, outputs); const P = F.checkSpec(s).filter(p => p.level === 'error'); if (P.length) { console.log('  check:', JSON.stringify(P)); return { out: {}, codes: [] }; } return F.run(s, env || {}, { seed: 1 }); };
const codes = r => (r.codes || []).map(c => c.code);
const ms = f => { const t = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };

ok(F.id === 'field@1' && Object.isFrozen(F) && Object.isFrozen(F.engine) && typeof F.engine.workerSource === 'string' && F.engine.stepper === true, 'NoemaLibField: id field@1, frozen API, an engine with workerSource and a stepper');

// ---------- 1. heat ----------
const KERN = 'sqrt(0.0025/(0.0025+2*0.1*t))*exp(-x^2/(2*(0.0025+2*0.1*t)))';
{
  const base = { equation: 'heat', grid: { nx: 201, x0: -1, x1: 1 }, D: 0.1, init: 'exp(-x^2/(2*0.0025))', bc: { all: { type: 'neumann', value: 0 } }, tEnd: 0.05 };
  const cn = run({ ...base, method: 'cn', dt: 0.0005 }, [S('e', 'error', { expr: KERN, norm: 'max' }), S('m', 'drift'), S('r', 'r')]);
  ok(cn.out.e < 5e-4 && cn.out.m < 1e-12, `Crank–Nicolson (r = ${cn.out.r.toFixed(2)}): the Gaussian kernel σ²(t) = σ₀² + 2Dt to ${cn.out.e.toExponential(2)} (max norm), mass conserved to ${cn.out.m.toExponential(1)}`);
  const ft = run(base, [S('e', 'error', { expr: KERN, norm: 'max' }), S('r', 'r'), S('dt', 'dt'), S('dm', 'dtMax')]);
  ok(ft.out.e < 1e-3 && near(ft.out.r, 0.45, 0.01) && codes(ft).includes('dt-auto') && ft.out.dt <= ft.out.dm, `FTCS at the auto step (0.9 × h²/2D, r = ${ft.out.r.toFixed(3)}): error ${ft.out.e.toExponential(2)}, code dt-auto`);
  const bt = run({ ...base, method: 'btcs', dt: 0.0005 }, [S('e', 'error', { expr: KERN, norm: 'max' })]);
  ok(bt.out.e < 3e-3 && bt.out.e > cn.out.e, `BTCS (first order in time): error ${bt.out.e.toExponential(2)} > Crank–Nicolson`);
  // the sine mode: u = e^{−π²Dt} sin πx; the error falls 4× when h halves (second order) at CN
  const mode = nx => run({ equation: 'heat', grid: { nx }, D: 1, init: 'sin(pi*x)', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 0.1, method: 'cn', dt: 0.1 / (nx - 1) }, [S('e', 'error', { expr: 'exp(-pi^2*t)*sin(pi*x)', norm: 'max' })]).out.e;
  const e1 = mode(21), e2 = mode(41);
  ok(near(Math.log2(e1 / e2), 2, 0.2), `the decaying sine mode e^(−π²Dt) sin πx: Crank–Nicolson converges at order ${Math.log2(e1 / e2).toFixed(2)} (2) with Δt ∝ h`);
  const un = run({ equation: 'heat', grid: { nx: 51 }, D: 1, init: '0', bc: { left: { type: 'dirichlet', value: 1 }, right: { type: 'dirichlet', value: 0 } }, tEnd: 0.01, dt: 0.0005 }, [S('g', 'gain'), S('ok', 'ok'), S('f', 'final', { stat: 'max' })]);
  ok(near(un.out.g, Math.abs(1 - 4 * 0.0005 * 2500), 1e-9) && un.out.ok === 0 && Number.isNaN(un.out.f) && codes(un).includes('unstable'), `FTCS at r = 1.25: von Neumann gain |1 − 4r| = ${un.out.g} > 1 → code unstable, NaN outputs (not a wrong answer)`);
  const un2 = run({ equation: 'heat', grid: { nx: 51 }, D: 1, init: 'x<0.5?1:0', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 0.01, dt: 0.0005, allowUnstable: true }, [S('f', 'final', { stat: 'max' })]);
  ok(!(un2.out.f < 1e3) || codes(un2).includes('blow-up'), `allowUnstable shows the blow-up of the high modes of a step (max ${un2.out.f}, codes ${codes(un2).join(', ')})`);
  const adi = run({ dim: 2, equation: 'heat', method: 'adi', grid: { nx: 41, ny: 41, x0: -1, x1: 1, y0: -1, y1: 1 }, D: 0.1, init: 'exp(-(x^2+y^2)/(2*0.01))', bc: { all: { type: 'neumann', value: 0 } }, tEnd: 0.1, dt: 0.002 }, [S('e', 'error', { expr: '0.01/(0.01+0.2*t)*exp(-(x^2+y^2)/(2*(0.01+0.2*t)))', norm: 'max' }), S('m', 'drift'), Sc('h', 'heatmap', { contours: 3 })]);
  ok(adi.out.e < 8e-3 && adi.out.m < 1e-12 && adi.out.h.items.length > 20 && adi.out.h.items.length <= 2000, `ADI (Peaceman & Rachford 1955) in 2-D: the 2-D kernel to ${adi.out.e.toExponential(2)}, mass to ${adi.out.m.toExponential(1)}, a heat map with contours (${adi.out.h.items.length} items)`);
  // Robin: u_t = u_xx, u(0) = 1, −u_x + h u = 0 at x = 1 (outward derivative u_x): steady u = 1 − h x/(1 + h)
  const rb = run({ equation: 'heat', grid: { nx: 101 }, D: 1, init: '0', bc: { left: { type: 'dirichlet', value: 1 }, right: { type: 'robin', a: 2, b: 1, value: 0 } }, tEnd: 3, method: 'btcs', dt: 0.01 }, [S('e', 'error', { expr: '1 - 2*x/3', norm: 'max' })]);
  ok(rb.out.e < 1e-4, `Robin cooling a·u + b·∂u/∂n = 0 (a = 2, b = 1): the steady profile 1 − 2x/3, error ${rb.out.e.toExponential(1)}`);
  // a uniform source s into an insulated rod: total = s·L·t exactly
  const so = run({ equation: 'heat', grid: { nx: 51 }, D: 1, init: '0', bc: { all: { type: 'neumann', value: 0 } }, sources: [{ shape: 'all', rate: 2 }], tEnd: 0.5, method: 'cn', dt: 0.01 }, [S('m', 'final', { stat: 'mean' })]);
  ok(near(so.out.m, 1, 1e-9), `a uniform source of rate 2 into an insulated rod: mean ${so.out.m} = 2t at t = ½`);
  // steady heat with a point source in the middle and cold ends: a tent u = (1 − |2x − 1|)/4·(q/D)·½ … checked by symmetry and max
  const ps = run({ equation: 'heat', grid: { nx: 101 }, D: 1, init: '0', bc: { all: { type: 'dirichlet', value: 0 } }, sources: [{ shape: 'rect', x0: 0.4, x1: 0.6, rate: 1 }], tEnd: 2, method: 'btcs', dt: 0.02 }, [S('c', 'at', { x: 0.5 }), S('l', 'at', { x: 0.3 }), S('r', 'at', { x: 0.7 })]);
  ok(near(ps.out.l, ps.out.r, 1e-12) && near(ps.out.c, 0.045, 3e-3), `a source on [0.4, 0.6] between cold ends: symmetric, the centre ${ps.out.c.toFixed(4)} (steady 0.045 = ∫ Green)`);
  const ob = run({ dim: 2, equation: 'heat', grid: { nx: 41, ny: 41 }, D: 1, init: '1', bc: { all: { type: 'neumann', value: 0 } }, obstacles: [{ shape: 'circle', x: 0.5, y: 0.5, r: 0.1, value: 0 }], tEnd: 0.05 }, [S('c', 'at', { x: 0.5, y: 0.5 }), S('far', 'at', { x: 0.05, y: 0.05 }), S('d', 'drift')]);
  ok(ob.out.c === 0 && ob.out.far > 0.3 && ob.out.far < 1 && Number.isNaN(ob.out.d), `an obstacle held at 0 is a sink: its centre stays 0, the corner cools to ${ob.out.far.toFixed(3)}; drift is NaN (not a closed system)`);
  const g9 = run({ dim: 2, equation: 'heat', grid: { nx: 41, ny: 41, x0: -1, x1: 1, y0: -1, y1: 1 }, D: 0.1, nine: true, init: 'exp(-(x^2+y^2)/(2*0.01))', bc: { all: { type: 'neumann', value: 0 } }, tEnd: 0.1 }, [S('e', 'error', { expr: '0.01/(0.01+0.2*t)*exp(-(x^2+y^2)/(2*(0.01+0.2*t)))', norm: 'max' }), S('dt', 'dt')]);
  ok(g9.out.e < 8e-3, `the 9-point (isotropic) Laplacian with FTCS: error ${g9.out.e.toExponential(2)} at a larger stable step (${g9.out.dt.toExponential(2)})`);
}

// ---------- 2. advection, wave ----------
{
  const SQ = '(x>0.2 && x<0.4)?1:0', res = {};
  for (const m of ['upwind', 'laxwendroff', 'minmod', 'vanleer', 'superbee', 'mc', 'laxfriedrichs', 'centred']) {
    res[m] = run({ equation: 'advection', method: m, grid: { nx: 200 }, bc: { all: { type: 'periodic' } }, vx: 1, init: SQ, tEnd: 1, dt: 0.004 }, [S('m', 'drift'), S('mx', 'final', { stat: 'max' }), S('mn', 'final', { stat: 'min' }), S('e', 'error', { expr: SQ, norm: 'l2' }), S('g', 'gain'), S('c', 'cfl')]);
  }
  const mono = k => res[k].out.mx <= 1 + 1e-12 && res[k].out.mn >= -1e-12;
  ok(['upwind', 'minmod', 'vanleer', 'superbee', 'mc', 'laxfriedrichs'].every(mono) && ['upwind', 'minmod', 'vanleer', 'superbee'].every(k => res[k].out.m < 1e-12), 'a square wave once round (C = 0.8): upwind, Lax–Friedrichs and the TVD limiters stay within [0, 1] and conserve mass');
  ok(res.laxwendroff.out.mx > 1.05 && codes(res.laxwendroff).includes('overshoot'), `Lax–Wendroff (second order, not TVD): overshoot to ${res.laxwendroff.out.mx.toFixed(3)} (Godunov 1959), code overshoot`);
  ok(Number.isNaN(res.centred.out.mx) && res.centred.out.g > 1.2 && codes(res.centred).includes('unstable'), `centred FTCS advection: gain ${res.centred.out.g.toFixed(3)} > 1, code unstable`);
  const e = k => res[k].out.e;
  ok(e('upwind') > e('minmod') && e('minmod') > e('vanleer') && e('vanleer') > e('superbee') && e('laxfriedrichs') > e('upwind'), `L2 errors: Lax–Friedrichs ${e('laxfriedrichs').toFixed(3)} > upwind ${e('upwind').toFixed(3)} > minmod ${e('minmod').toFixed(3)} > van Leer ${e('vanleer').toFixed(3)} > superbee ${e('superbee').toFixed(3)} (compressive, LeVeque 2002 fig. 6.2)`);
  ok(near(res.upwind.out.c, 0.8, 1e-12), 'the Courant number |v|Δt/h = 0.8');
  // a Gaussian advected and diffused: exact on a periodic domain (far from the ends)
  const ad = run({ equation: 'advdiff', method: 'vanleer', grid: { nx: 400, x0: 0, x1: 4 }, bc: { all: { type: 'periodic' } }, D: 0.01, vx: 1, init: 'exp(-(x-1)^2/(4*0.01*0.5))/sqrt(4*pi*0.01*0.5)', tEnd: 1, dt: 0.004 }, [S('e', 'error', { expr: 'exp(-(x-1-t)^2/(4*0.01*(0.5+t)))/sqrt(4*pi*0.01*(0.5+t))', norm: 'max' }), S('m', 'drift')]);
  ok(ad.out.e < 0.05 && ad.out.m < 1e-12, `advection–diffusion of a Gaussian (D 0.01, v 1): the moving, spreading kernel to ${ad.out.e.toFixed(4)} of a peak of 2.3, mass conserved`);
  const wv = run({ equation: 'wave', grid: { nx: 400, x0: 0, x1: 4 }, bc: { all: { type: 'periodic' } }, c: 1, init: 'exp(-(x-2)^2/0.02)', tEnd: 1, dt: 0.005 }, [S('e', 'error', { expr: '0.5*(exp(-(x-2-t)^2/0.02)+exp(-(x-2+t)^2/0.02))', norm: 'max' }), S('d', 'drift'), S('cfl', 'cfl')]);
  ok(wv.out.e < 5e-3 && wv.out.d < 1e-10 && near(wv.out.cfl, 0.5, 1e-12), `the wave equation (leapfrog, C = 0.5) against d'Alembert ½[f(x − ct) + f(x + ct)]: error ${wv.out.e.toExponential(2)}, energy drift ${wv.out.d.toExponential(1)}`);
  const st = run({ equation: 'wave', grid: { nx: 101 }, c: 1, init: 'sin(pi*x)', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 2, dt: 0.01 }, [S('e', 'error', { expr: 'cos(pi*t)*sin(pi*x)', norm: 'max' }), S('a', 'at', { x: 0.5, t: 1 })]);
  ok(st.out.e < 1e-3 && near(st.out.a, -1, 2e-3), `a standing wave sin πx cos πct: error ${st.out.e.toExponential(1)}, u(½, 1) = ${st.out.a.toFixed(4)} (−1)`);
  const dm = run({ equation: 'wave', grid: { nx: 101 }, c: 1, damping: 0.5, init: 'sin(pi*x)', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 4, dt: 0.01 }, [Se('E', 'stat', { stat: 'energy' })]);
  const E = dm.out.E; ok(E.length > 10 && E[E.length - 1] < 0.2 * E[1] && E[E.length - 1] > 0.05 * E[1], `a damped string (u_tt + 2γ… with γ = 0.5) loses energy as e^(−2γt)·… (${(E[E.length - 1] / E[1]).toFixed(3)} of it after t = 4)`);
  const wc = run({ equation: 'wave', grid: { nx: 101 }, c: 1, init: 'sin(pi*x)', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 1, dt: 0.02 }, [S('f', 'final', { stat: 'max' }), S('c', 'cfl')]);
  ok(Number.isNaN(wc.out.f) && near(wc.out.c, 2, 1e-12) && codes(wc).includes('unstable'), 'the wave Courant number 2 > 1: unstable, NaN');
}

// ---------- 3. reaction–diffusion ----------
{
  const fk = run({ equation: 'rd', kinetics: 'fisher', grid: { nx: 1000, x0: 0, x1: 200 }, D: 1, init: 'x<5?1:0', tEnd: 60, front: { level: 0.5 }, bc: { all: { type: 'neumann', value: 0 } } }, [S('c', 'frontSpeed'), Se('f', 'front')]);
  ok(near(fk.out.c, 2, 0.1) && fk.out.c < 2, `Fisher–KPP: the front of a step moves at ${fk.out.c.toFixed(3)} → 2√(rD) = 2 from below (Bramson's logarithmic delay)`);
  const fk4 = run({ equation: 'rd', kinetics: 'fisher', kp: { r: 4 }, grid: { nx: 1000, x0: 0, x1: 200 }, D: 1, init: 'x<5?1:0', tEnd: 30, front: { level: 0.5 } }, [S('c', 'frontSpeed')]);
  ok(near(fk4.out.c / fk.out.c, 2, 0.1), `r × 4 → speed × 2 (${(fk4.out.c / fk.out.c).toFixed(3)})`);
  // Schnakenberg a 0.1, b 0.9, d = 40: the steady state (1, 0.9), J = [[0.8, 1], [−1.8, −1]]; the fastest mode by the dispersion relation
  const J = [0.8, 1, -1.8, -1], lam = k2 => { const A = J[0] - k2, D2 = J[3] - 40 * k2, T = A + D2, De = A * D2 - J[1] * J[2], d = T * T - 4 * De; return d >= 0 ? (T + Math.sqrt(d)) / 2 : T / 2; };
  let kb = 0, lb = -Infinity; for (let k = 0.001; k < 2; k += 1e-5) { const l = lam(k * k); if (l > lb) { lb = l; kb = k; } }
  const tu = run({ equation: 'rd', kinetics: 'schnakenberg', grid: { nx: 300, x0: 0, x1: 150 }, D: 1, Dv: 40, init: '1', initV: '0.9', noise: { amp: 0.01 }, bc: { all: { type: 'periodic' } }, tEnd: 100 }, [S('tu', 'turing'), S('tk', 'turingK'), S('tw', 'turingWavelength'), S('w', 'wavelength')]);
  ok(tu.out.tu === 1 && near(tu.out.tk, kb, 1e-3) && rel(tu.out.tw, 2 * Math.PI / kb, 1e-3), `Schnakenberg (a 0.1, b 0.9, d 40) is Turing unstable: the fastest wavenumber ${tu.out.tk.toFixed(4)} = the dispersion maximum ${kb.toFixed(4)}, wavelength ${tu.out.tw.toFixed(2)}`);
  ok(rel(tu.out.w, tu.out.tw, 0.15), `the pattern grown from noise on a line has wavelength ${tu.out.w.toFixed(2)} (the linear prediction ${tu.out.tw.toFixed(2)}, within 15 %)`);
  const nt = run({ equation: 'rd', kinetics: 'schnakenberg', grid: { nx: 100, x0: 0, x1: 50 }, D: 1, Dv: 1, init: '1', initV: '0.9', tEnd: 1 }, [S('tu', 'turing'), S('tw', 'turingWavelength')]);
  ok(nt.out.tu === 0 && Number.isNaN(nt.out.tw) && codes(nt).includes('not-turing'), 'equal diffusion (d = 1): no Turing instability (code not-turing, wavelength NaN)');
  const gs = run({ dim: 2, equation: 'rd', kinetics: 'grayscott', kp: { F: 0.04, k: 0.06 }, grid: { nx: 101, ny: 101, x0: 0, x1: 100, y0: 0, y1: 100 }, D: 0.16, Dv: 0.08, init: '(abs(x-50)<5 && abs(y-50)<5)?0.5:1', initV: '(abs(x-50)<5 && abs(y-50)<5)?0.25:0', noise: { amp: 0.01, field: 'v' }, bc: { all: { type: 'periodic' } }, tEnd: 2000, dt: 1 }, [S('m', 'final', { stat: 'mean', field: 'v' }), Sc('h', 'heatmap', { field: 'v' })]);
  ok(gs.out.m > 0.05 && gs.out.h.items.length > 100, `Gray–Scott (F 0.04, k 0.06; Pearson 1993): a seeded square splits and fills the domain (mean v ${gs.out.m.toFixed(3)}, ${gs.out.h.items.length} polygons)`);
  const gs0 = run({ dim: 2, equation: 'rd', kinetics: 'grayscott', kp: { F: 0.04, k: 0.06 }, grid: { nx: 41, ny: 41, x0: 0, x1: 40, y0: 0, y1: 40 }, D: 0.16, Dv: 0.08, init: '1', initV: '0', tEnd: 200, dt: 1 }, [S('m', 'final', { stat: 'max', field: 'v' }), S('u', 'final', { stat: 'min' })]);
  ok(gs0.out.m === 0 && gs0.out.u === 1, 'Gray–Scott from the trivial state (u, v) = (1, 0) stays there exactly');
  const br = run({ equation: 'rd', kinetics: 'brusselator', grid: { nx: 50 }, D: 1, Dv: 1, init: '1', initV: '3', tEnd: 0.1 }, [S('u', 'final', { stat: 'mean' }), S('v', 'final', { stat: 'mean', field: 'v' })]);
  ok(near(br.out.u, 1, 1e-12) && near(br.out.v, 3, 1e-12), 'the Brusselator steady state (A, B/A) = (1, 3) is a fixed point');
  const cu = run({ equation: 'rd', kinetics: 'custom', kp: { k: 2 }, reaction: { u: '-k*u' }, grid: { nx: 20 }, D: 1, init: '1', bc: { all: { type: 'neumann', value: 0 } }, tEnd: 1, dt: 0.0001 }, [S('u', 'final', { stat: 'mean' })]);
  ok(rel(cu.out.u, Math.exp(-2), 1e-3), `custom kinetics u' = −k u (an expression): e^(−2) (${cu.out.u.toFixed(5)})`);
}

// ---------- 4. Laplace / Poisson ----------
{
  const L = method => run({ dim: 2, equation: 'poisson', method, grid: { nx: 41, ny: 41 }, bc: { all: { type: 'dirichlet', value: 0 }, top: { type: 'dirichlet', value: 1 } }, solver: { tol: 1e-10 } }, [S('c', 'at', { x: 0.5, y: 0.5 }), S('it', 'iterations'), Se('res', 'residual')]);
  const s = L('sor'), g = L('gs'), j = L('jacobi');
  ok([s, g, j].every(r => near(r.out.c, 0.25, 1e-6)), `Laplace in a square with one side at 1: the centre is ¼ (four rotated problems add to 1) — SOR ${s.out.c.toFixed(8)}, GS ${g.out.c.toFixed(8)}, Jacobi ${j.out.c.toFixed(8)}`);
  ok(rel(j.out.it / g.out.it, 2, 0.05) && s.out.it < g.out.it / 10, `iterations: Jacobi ${j.out.it} ≈ 2 × Gauss–Seidel ${g.out.it} (spectral radius ρ_GS = ρ_J²); SOR at the optimal ω ${s.out.it}`);
  ok(s.out.res.length > 5 && s.out.res[s.out.res.length - 1] < 1e-9, 'the residual series falls below the tolerance');
  const p = run({ equation: 'poisson', grid: { nx: 101 }, bc: { all: { type: 'dirichlet', value: 0 } }, source: '1', solver: { tol: 1e-12 } }, [S('e', 'error', { expr: 'x*(1-x)/2', norm: 'max' })]);
  ok(p.out.e < 1e-8, `Poisson −u'' = 1 with u(0) = u(1) = 0: x(1 − x)/2 exactly on the grid (${p.out.e.toExponential(1)})`);
  const nc = run({ dim: 2, equation: 'poisson', method: 'jacobi', grid: { nx: 101, ny: 101 }, bc: { all: { type: 'dirichlet', value: 0 }, top: { type: 'dirichlet', value: 1 } }, solver: { tol: 1e-12, maxIter: 50 } }, [S('c', 'at', { x: 0.5, y: 0.5 }), S('it', 'iterations')]);
  ok(codes(nc).includes('no-converge') && nc.out.it === 50, 'maxIter reached: code no-converge (the values so far are given)');
}

// ---------- 5. cellular automata ----------
{
  const pc = t => { let c = 0; while (t) { c += t & 1; t >>= 1; } return c; };
  const r90 = run({ equation: 'ca', grid: { nx: 201 }, ca: { rule: 'elementary', code: 90, steps: 64, init: 'single' } }, [Se('p', 'population'), Sc('s', 'spacetime')]);
  ok(r90.out.p.length === 65 && r90.out.p.every((v, t) => v === 2 ** pc(t)) && r90.out.s.items.length <= 2000, 'rule 90 from one cell (Sierpiński): population 2^popcount(t) for t = 0 … 64 (Glaisher / Gould)');
  const r30 = run({ equation: 'ca', grid: { nx: 201 }, ca: { rule: 'elementary', code: 30, steps: 20, init: 'single' } }, [Se('p', 'population')]);
  ok(JSON.stringify(r30.out.p) === JSON.stringify([1, 3, 3, 6, 4, 9, 5, 12, 7, 12, 11, 14, 12, 19, 13, 22, 15, 19, 20, 24, 21]), 'rule 30 from one cell: 1, 3, 3, 6, 4, 9, 5, 12, 7, 12, 11, … (OEIS A070952)');
  const gl = run({ dim: 2, equation: 'ca', grid: { nx: 20, ny: 20 }, ca: { rule: 'life', bs: 'B3/S23', init: 'cells', cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], wrap: true, steps: 80 } }, [Se('p', 'population'), S('c', 'cell', { x: 21 % 20, y: 1 })]);
  ok(gl.out.p.every(v => v === 5), 'the Life glider (B3/S23) keeps 5 cells for 80 generations on a torus (it travels round)');
  const bl = run({ dim: 2, equation: 'ca', grid: { nx: 10, ny: 10 }, ca: { rule: 'life', bs: 'B3/S23', init: 'cells', cells: [[4, 5], [5, 5], [6, 5]], steps: 3 } }, [Se('p', 'population'), S('a', 'cell', { x: 5, y: 4 }), S('b', 'cell', { x: 4, y: 5 })]);
  ok(bl.out.p.every(v => v === 3) && bl.out.a === 1 && bl.out.b === 0, 'the blinker oscillates with period 2 (at an odd step: vertical)');
  const hl = run({ dim: 2, equation: 'ca', grid: { nx: 30, ny: 30 }, ca: { rule: 'life', bs: 'B36/S23', init: 'random', density: 0.3, steps: 50 } }, [S('d', 'density')]);
  ok(hl.out.d > 0 && hl.out.d < 1, 'HighLife B36/S23 by B/S notation');
  const sync = run({ dim: 2, equation: 'ca', grid: { nx: 41, ny: 41 }, ca: { rule: 'sandpile', pile: 2000, steps: 1, update: 'sync' } }, [S('p', 'population'), Sc('h', 'heatmap')]);
  const asyn = run({ dim: 2, equation: 'ca', grid: { nx: 41, ny: 41 }, ca: { rule: 'sandpile', pile: 2000, steps: 1, update: 'async' } }, [S('p', 'population'), Sc('h', 'heatmap')]);
  ok(sync.out.p === asyn.out.p && JSON.stringify(sync.out.h) === JSON.stringify(asyn.out.h), `the abelian sandpile (Dhar 1990): 2000 grains toppled synchronously or one site at a time end in the same configuration (${sync.out.p} occupied sites)`);
  const soc = run({ dim: 2, equation: 'ca', grid: { nx: 50, ny: 50 }, ca: { rule: 'sandpile', init: 'random', drop: 'random', steps: 5000 } }, [S('am', 'avalancheMean'), S('tau', 'avalancheTau'), Se('a', 'avalanche')]);
  ok(soc.out.tau > 1 && soc.out.tau < 1.6 && soc.out.am > 1 && soc.out.a.length === 2000, `self-organised criticality: avalanche sizes follow a power law, τ = ${soc.out.tau.toFixed(2)} (≈ 1.2 – 1.3 on finite lattices; Manna 1991)`);
  const ff = run({ dim: 2, equation: 'ca', grid: { nx: 100, ny: 100 }, ca: { rule: 'forestfire', p: 0.05, f: 0.0001, steps: 500 } }, [S('d', 'density'), Se('p', 'population')]);
  ok(ff.out.d > 0.2 && ff.out.d < 0.6, `the Drossel–Schwabl forest fire (p 0.05, f 10⁻⁴): tree density ${ff.out.d.toFixed(3)} fluctuates below the percolation threshold`);
  const gh = run({ dim: 2, equation: 'ca', grid: { nx: 100, ny: 100 }, ca: { rule: 'gh', states: 5, threshold: 1, density: 0.1, steps: 200 } }, [S('d', 'density')]);
  ok(gh.out.d > 0, `Greenberg–Hastings excitable medium (5 states): self-sustained waves (density ${gh.out.d.toFixed(3)})`);
  const r0 = run({ equation: 'ca', grid: { nx: 50 }, ca: { rule: 'elementary', code: 0, steps: 5, init: 'random' } }, [Se('p', 'population')]);
  ok(r0.out.p.slice(1).every(v => v === 0), 'rule 0 kills everything in one step');
}

// ---------- 6. events, interrupts, codes ----------
{
  const ev = run({ equation: 'heat', grid: { nx: 51 }, D: 1, vars: { TL: 0 }, bc: { left: { type: 'dirichlet', value: 'TL' }, right: { type: 'dirichlet', value: 0 } }, probes: [{ id: 'mid', at: 'point', x: 0.5 }], events: [{ id: 'hot', of: 'probe', probe: 'mid', level: 0.25, dir: 1 }], interrupts: [{ at: 0.05, set: { TL: 1 } }, { on: 'hot', set: { TL: 0 } }], init: '0', tEnd: 0.5 }, [S('th', 'eventTime', { event: 'hot', nth: 1 }), Se('p', 'probe', { probe: 'mid' }), S('n', 'eventCount', { event: 'hot' })]);
  ok(ev.out.th > 0.05 && ev.out.th < 0.3 && ev.out.n === 1 && Math.max(...ev.out.p) < 0.3, `a thermostat: the left end switched on at t = 0.05 by a timed interrupt and off when the middle reaches ¼ (t = ${ev.out.th.toFixed(4)}); the middle never passes 0.3`);
  // the event time against the exact series: u(½, t) for u(0) = 1, u(1) = 0 from 0: ½ − Σ (2/(kπ)) sin(kπ/2) e^{−k²π²t}
  const exact = t => { let s = 0.5; for (let k = 1; k < 200; k++) s -= 2 / (k * Math.PI) * Math.sin(k * Math.PI / 2) * Math.exp(-k * k * Math.PI * Math.PI * t); return s; };
  let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (exact(m) < 0.25) lo = m; else hi = m; }
  const e2 = run({ equation: 'heat', grid: { nx: 101 }, D: 1, bc: { left: { type: 'dirichlet', value: 1 }, right: { type: 'dirichlet', value: 0 } }, probes: [{ id: 'mid', at: 'point', x: 0.5 }], events: [{ id: 'q', of: 'probe', probe: 'mid', level: 0.25, stop: true }], init: '0', tEnd: 1, method: 'cn', dt: 0.0005 }, [S('th', 'eventTime', { event: 'q', nth: 1 }), S('fl', 'flag', { code: 'stopped' })]);
  ok(near(e2.out.th, lo, 2e-3) && e2.out.fl === 1, `the time the middle of a rod heated at one end reaches ¼: ${e2.out.th.toFixed(4)} (the Fourier series ${lo.toFixed(4)}), the run stops there (code stopped)`);
  const pr = run({ dim: 2, equation: 'heat', grid: { nx: 21, ny: 21 }, D: 1, init: 'x', bc: { all: { type: 'neumann', value: 0 } }, probes: [{ id: 'a', at: 'area', x0: 0, x1: 0.5, y0: 0, y1: 1, stat: 'mean' }, { id: 'l', at: 'line', x0: 0, x1: 1, y0: 0.5, y1: 0.5, stat: 'max' }], tEnd: 0.001 }, [S('a', 'probe', { probe: 'a', t: 0 }), S('l', 'probe', { probe: 'l', t: 0 })]);
  ok(near(pr.out.a, 0.25, 0.02) && near(pr.out.l, 1, 1e-9), `probes: an area mean of u = x over the left half ≈ ¼ (${pr.out.a.toFixed(4)}), a line max 1`);
  const bud = run({ dim: 2, equation: 'heat', grid: { nx: 200, ny: 200 }, D: 1, init: '0', tEnd: 10 }, [S('f', 'final', { stat: 'max' }), S('fl', 'flag', { code: 'budget' })]);
  ok(codes(bud).includes('budget') && Number.isNaN(bud.out.f), 'a run beyond the work budget (10⁸ node-steps): code budget, NaN — never a hang');
  const nan = run({ equation: 'heat', grid: { nx: 20 }, D: 1, init: 'sqrt(-1)', tEnd: 0.01 }, [S('f', 'final', { stat: 'max' })]);
  ok(codes(nan).includes('nan') && Number.isNaN(nan.out.f), 'a NaN initial field: code nan');
  const cfl = run({ equation: 'advection', grid: { nx: 100 }, vx: 1, init: 'x', tEnd: 0.1, dt: 0.02, bc: { all: { type: 'periodic' } } }, [S('c', 'cfl'), S('f', 'final', { stat: 'max' })]);
  ok(cfl.out.c > 1 && codes(cfl).some(c => c === 'cfl' || c === 'unstable') && Number.isNaN(cfl.out.f), `C = ${cfl.out.c.toFixed(2)} > 1: the CFL condition is broken (code cfl/unstable)`);
}

// ---------- 7. the checker and the golden outputs of its former Python twin ----------
{
  const P = s => F.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + ' ' + p.path);
  ok(P(spec({ equation: 'heat', grid: { nx: 20 } }, [S('x', 'r')])).includes('value model.D') && P(spec({ equation: 'heat', grid: { nx: 20 }, D: 1 }, [S('x', 'r')])).includes('value model.tEnd'), 'heat needs D and tEnd');
  ok(P(spec({ equation: 'heat', method: 'upwind', grid: { nx: 20 }, D: 1, tEnd: 1 }, [])).includes('method model.method'), 'a method of another equation is refused');
  ok(P(spec({ dim: 2, equation: 'heat', method: 'cn', grid: { nx: 20 }, D: 1, tEnd: 1 }, [])).includes('method model.method'), 'on a 2-D grid the implicit heat step is ADI');
  ok(P(spec({ equation: 'heat', grid: { nx: 20 }, D: 1, tEnd: 1, bc: { left: { type: 'periodic' } } }, [])).includes('bc model.bc.right'), 'periodic goes on both sides');
  ok(P(spec({ equation: 'ca', grid: { nx: 20 }, ca: { rule: 'life', bs: 'B3/S23' } }, [])).includes('value model.dim'), 'Life is 2-D');
  ok(P(spec({ equation: 'wave', grid: { nx: 20 }, c: 1, tEnd: 1 }, [S('a', 'turing'), Sc('h', 'heatmap')])).length === 2, 'outputs of another equation: Turing on a wave, a heat map on a line');
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'field.json'), 'utf8')).specs;
  const js = fx.map(s => { const p = F.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : F.exprs(s), k: bad ? null : F.keys(s) }; });
  const py = want('check', fx, js);
  const same = js.filter((r, i) => JSON.stringify(r) === JSON.stringify(py[i])).length;
  ok(fx.length >= 20 && same === fx.length && js.some(r => r.x) && js.some(r => !r.x), `the JS checker gives the golden outputs of the former twin tools/lib_field.py on ${same}/${fx.length} fixture specs (problems, expressions, keys; good and bad)`);
  const pyc = want('tables', undefined, [F.CODES, F.SERIES, F.SCALARS, F.SCENES, F.EQUATIONS, F.METHODS, F.CA_RULES, F.KINETICS]);
  ok(JSON.stringify(pyc) === JSON.stringify([F.CODES, F.SERIES, F.SCALARS, F.SCENES, F.EQUATIONS, F.METHODS, F.CA_RULES, F.KINETICS]), 'the same, as the golden tables of the former Python twin: codes, outputs, equations, methods, rules and kinetics');
  // every good fixture runs, fast enough, with outputs of the declared kinds
  let allOk = true, worst = 0;
  fx.forEach(s => { if (F.checkSpec(s).some(p => p.level === 'error')) return; const env = {}; for (const p of s.params || []) env[p.id] = p.default; const [r, t] = ms(() => F.run(s, env, { seed: 1 })); worst = Math.max(worst, t); for (const o of s.outputs) { const v = r.out[o.id]; if (o.kind === 'series' ? !Array.isArray(v) || v.length > 2000 : o.kind === 'scene' ? !v || !Array.isArray(v.items) || v.items.length > 2000 || !v.items.every(it => C.ROLES.includes(it.c || 'base')) : typeof v !== 'number') allOk = false; } });
  ok(allOk && worst < 2000, `every good fixture runs: series ≤ 2000 points, scenes ≤ 2000 items in roles only, scalars numbers; the slowest ${worst.toFixed(0)} ms (< 2 s)`);
  let threw = false; try { for (const s of fx) F.run(s, {}, { seed: 1 }); F.run(null, null, null); F.run({ model: 5 }, {}, {}); F.checkSpec(null); F.exprs({}); } catch (e) { threw = true; console.log(e); }
  ok(!threw, 'bad specs, nulls and junk never throw');
}

// ---------- 8. adapter, stepper, Worker, speed, the reference activity ----------
{
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'heat-stability', 'spec.json'), 'utf8'));
  const inp = { ...(ex.consts || {}) }; for (const p of ex.params) inp[p.id] = p.default;
  const sim = F.engine.create(ex, { seed: 1 });
  const [o, t1] = ms(() => sim.run(inp));
  ok(Array.isArray(o.x) && Array.isArray(o.u) && typeof o.r === 'number' && o.st && o.st.items.length > 10 && o.st.items.length <= 2000, `engine.create(spec).run(inputs): profile, scalars and a space–time scene (${o.st.items.length} items)`);
  ok(t1 < 50, `a typical run (the heat-stability activity) takes ${t1.toFixed(1)} ms (< 50)`);
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + F.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(ex, { seed: 1 }).run(inp);
  ok(JSON.stringify(w) === JSON.stringify(o), 'the Worker source in a fresh global gives the same outputs, bit for bit');
  const bad = F.engine.create({ ...ex, model: { equation: 'nope' } }, {}).run(inp);
  ok(Number.isNaN(bad.r) && Array.isArray(bad.u) && bad.u.length === 0, 'a spec that does not stand: NaN scalars, empty series, no throw');
  // the stepper: 10 macro steps reach the same end state as one run
  const sp = spec({ equation: 'heat', grid: { nx: 51 }, D: 1, init: 'sin(pi*x)', bc: { all: { type: 'dirichlet', value: 0 } }, tEnd: 0.1, method: 'cn', dt: 0.001 }, [S('m', 'final', { stat: 'max' }), S('c', 'at', { x: 0.5 })]);
  const whole = F.run(sp, {}, { seed: 1 }).out;
  const st = F.stepper, s0 = st.init(sp, {}, { seed: 1 }); let state = s0, last = null, t = 0;
  for (let k = 0; k < 10; k++) { const r = st.step(state, {}, t, 0.01, {}); state = r.state; t += r.dt; last = r.out; }
  ok(near(t, 0.1, 1e-12) && near(last.m, whole.m, 1e-12) && near(last.m, Math.exp(-(Math.PI ** 2) * 0.1), 2e-4), `the stepper (init/step, NoemaSimKit.stepper): 10 macro steps of 0.01 give the one-run answer ${last.m.toFixed(6)} (e^(−π²/10) = ${Math.exp(-(Math.PI ** 2) * 0.1).toFixed(6)})`);
  const inst = F.engine.create(sp, { seed: 1 }); inst.stepInit({}, 0); let lastO = null; for (let k = 0; k < 4; k++) lastO = inst.stepTo({}, k * 0.025, 0.025, []).out;
  ok(near(lastO.m, whole.m, 1e-12) && inst.snapshot() === -1, 'through makeEngine: stepInit / stepTo give the same; snapshot is refused (−1: the state holds closures)');
  const ev = spec({ equation: 'heat', grid: { nx: 51 }, D: 1, bc: { left: { type: 'dirichlet', value: 'TL' }, right: { type: 'dirichlet', value: 0 } }, vars: { TL: 1 }, probes: [{ id: 'mid', at: 'point', x: 0.5 }], events: [{ id: 'q', of: 'probe', probe: 'mid', level: 0.2 }], init: '0', tEnd: 1 }, [S('p', 'probe', { probe: 'mid' })]);
  let s1 = st.init(ev, {}, { seed: 1 }), evs = [], tt = 0; const ps = [];
  for (let k = 0; k < 10; k++) { const r = st.step(s1, { TL: k < 5 ? 1 : 0 }, tt, 0.1, {}); s1 = r.state; tt += r.dt; evs = evs.concat(r.events); ps.push(r.out.p); }
  ok(evs.length >= 1 && evs[0].kind === 'event' && ps[9] < ps[4], `an input of the master (the left temperature, switched off at t = ½) drives the stepper; its events reach the master (${evs.length})`);
  // the activity's own cases (tests.json)
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'heat-stability', 'tests.json'), 'utf8'));
  const checks = ['ok == 1', 'rr >= rMin'].map(e => NoemaExpr.compile(e));   // the exercise's checks (in the pack, not the spec)
  for (const c of T.cases) {
    const v = { ...inp }; for (const s2 of c.steps) v[s2.set] = s2.value;
    const out = sim.run(v), env = { ...v, ...Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')) };
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => (Number.isNaN(env[k]) ? a === null : env[k] >= a && env[k] <= b));
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `heat-stability: ${c.name}`);
  }
  const strings = ['en', 'el', 'ru', 'de', 'fr'].map(l => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'heat-stability', `strings.${l}.json`), 'utf8')));
  ok(strings.every(s => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(Object.keys(strings[0]).sort())), 'heat-stability: the five string tables have the same keys');
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
