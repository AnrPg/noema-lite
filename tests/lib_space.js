/* NoemaSpaceKit (engine/src/46_lib_space.js, docs/library/space.md) against exact and published values:
   1. grids and boundary conditions (ghost cells: Dirichlet, Neumann, Robin, periodic), the 5- and 9-point Laplacians (exact on
      quadratics), gradients, bilinear sampling, the Thomas algorithm and its cyclic form (Sherman–Morrison);
   2. stability: the FTCS limit, Courant numbers, the von Neumann amplification factors (Morton & Mayers 2005; Strikwerda 2004),
      the flux limiters inside Sweby's TVD region;
   3. neighbourhoods: Moore / von Neumann / hexagonal counts, torus wrapping, the bucket index against brute force, minimal-image
      distances, graphs (ring, Erdős–Rényi mean degree, Watts–Strogatz, Barabási–Albert edge count, lattices);
   4. random walks (MSD = n·ℓ² on a lattice, 2·d·σ²·n Gaussian; reflecting, periodic and absorbing boxes; Lévy and correlated walks);
   5. spatial statistics: Moran's I and Geary's C (checkerboard −1 and 63/32; E[I] = −1/(n−1)), Ripley's K/L (L ≈ r under CSR),
      Clark–Evans (2 on a square lattice, ≈ 1 random);
   6. scenes (heat map and contour budgets, roles only), purity (no throw on junk), the Worker source.
   Usage: node tests/lib_space.js */
'use strict';
const path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibCore = ENGINES.kernel('core'), NoemaSimKit = ENGINES.kernel('simkit'), NoemaSpaceKit = ENGINES.kernel('space');
const S = NoemaSpaceKit, SK = NoemaSimKit, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const rng = name => SK.stream(7, name);

ok(Object.isFrozen(S) && S.MAX_N === 200 && S.MAX_N1 === 2000, 'NoemaSpaceKit: frozen, grids ≤ 200 × 200 (2-D) and ≤ 2000 (1-D)');

// ---------- 1. grids, ghosts, operators ----------
{
  const G = S.grid({ dim: 1, nx: 11, x0: 0, x1: 1 }), P = S.grid({ dim: 1, nx: 10, x0: 0, x1: 1, periodicX: true });
  ok(near(G.dx, 0.1, 1e-15) && near(P.dx, 0.1, 1e-15) && G.xs[10] === 1 && near(P.xs[9], 0.9, 1e-15), 'a bounded grid has nodes on both ends (dx = L/(n−1)); a periodic grid does not repeat x1 (dx = L/n)');
  const G2 = S.grid({ dim: 2, nx: 500, ny: 3 });
  ok(G2.nx === 200 && G2.ny === 3 && S.grid({ dim: 1, nx: 5000 }).nx === 2000 && S.grid({}).nx === 2, 'sizes are clamped (200 in 2-D, 2000 in 1-D, at least 2)');
  // Dirichlet: the ghost is the odd reflection (u_{−k} = 2g − u_k), so the boundary node holds g
  const u = S.field(G); for (let i = 0; i < 11; i++) u[G.at(i, 0)] = G.xs[i] ** 2;
  S.fillGhosts(G, u, { left: { type: 'dirichlet', g: 0 }, right: { type: 'neumann', g: 2 } });
  ok(near(u[G.at(-1, 0)], -u[G.at(1, 0)], 1e-15), 'Dirichlet ghost: u₋₁ = 2g − u₁ (odd reflection about the boundary value)');
  ok(near((u[G.at(11, 0)] - u[G.at(9, 0)]) / (2 * G.dx), 2, 1e-12), 'Neumann ghost: the centred outward derivative at the boundary is g (u = x², u\'(1) = 2)');
  const lap = S.field(G); S.laplacian(G, u, lap);
  ok([...Array(10).keys()].every(i => near(lap[G.at(i + 1, 0)], 2, 1e-9)), 'the 3-point Laplacian of x² is exactly 2 at every free node, the Neumann end included');
  const w = S.field(G); for (let i = 0; i < 11; i++) w[G.at(i, 0)] = 1 + G.xs[i];
  S.fillGhosts(G, w, { left: { type: 'robin', a: 1, b: -1, g: 2 }, right: { type: 'dirichlet', g: 2 } });
  ok(near(w[G.at(-1, 0)], 0.9, 1e-12), 'Robin ghost a·u + b·∂u/∂n = g: u = 1 + x with a = 1, b = −1, g = 2 at x = 0 (∂u/∂n = −1) is consistent, ghost u₋₁ = 0.9');
  const pu = S.field(P); for (let i = 0; i < 10; i++) pu[P.at(i, 0)] = Math.sin(2 * Math.PI * P.xs[i]);
  S.fillGhosts(P, pu, {}); const pl = S.field(P); S.laplacian(P, pu, pl);
  const exact = -(2 / P.dx ** 2) * (1 - Math.cos(2 * Math.PI * P.dx));
  ok(near(pu[P.at(-1, 0)], pu[P.at(9, 0)], 1e-15) && near(pu[P.at(10, 0)], pu[P.at(0, 0)], 1e-15) && near(pl[P.at(3, 0)], exact * pu[P.at(3, 0)], 1e-9), 'periodic ghosts wrap; the discrete Laplacian of sin(2πx) is the symbol −(2/h²)(1 − cos kh) times it');
  const Q = S.grid({ dim: 2, nx: 9, ny: 7, x0: 0, x1: 1, y0: 0, y1: 1 }), q = S.field(Q);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) q[Q.at(i, j)] = Q.xs[i] ** 2 + 3 * Q.ys[j] ** 2;
  const B = { left: { type: 'neumann', g: 0 }, right: { type: 'neumann', g: 2 }, bottom: { type: 'neumann', g: 0 }, top: { type: 'neumann', g: 6 } };
  S.fillGhosts(Q, q, B); const ql = S.field(Q), q9 = S.field(Q); S.laplacian(Q, q, ql); S.laplacian(Q, q, q9, null, true);
  let e5 = 0, e9 = 0; for (let j = 1; j < 6; j++) for (let i = 1; i < 8; i++) { e5 = Math.max(e5, Math.abs(ql[Q.at(i, j)] - 8)); }
  const Qs = S.grid({ dim: 2, nx: 9, ny: 9 }), qs = S.field(Qs); for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) qs[Qs.at(i, j)] = Qs.xs[i] ** 2 + 3 * Qs.ys[j] ** 2;
  S.fillGhosts(Qs, qs, B); const qs9 = S.field(Qs); S.laplacian(Qs, qs, qs9, null, true); for (let j = 1; j < 8; j++) for (let i = 1; i < 8; i++) e9 = Math.max(e9, Math.abs(qs9[Qs.at(i, j)] - 8));
  ok(e5 < 1e-9 && e9 < 1e-9, `the 5-point and the 9-point (Patra & Karttunen 2006, square cells) Laplacians of x² + 3y² are 8 (errors ${e5.toExponential(1)}, ${e9.toExponential(1)})`);
  const gr = S.gradient(Q, q, 4, 3);
  ok(near(gr[0], 2 * Q.xs[4], 1e-12) && near(gr[1], 6 * Q.ys[3], 1e-12), 'the centred gradient of x² + 3y² is (2x, 6y) exactly');
  ok(near(S.sample(Q, q, 0.3, 0.4), 0.09 + 0.48, 0.02) && Array.isArray(S.nearest(Q, 0.49, 0.51)) || typeof S.nearest(Q, 0.49, 0.51) === 'object', 'bilinear sampling between nodes; the nearest node');
  // Thomas on a known system; the cyclic system against a dense solve
  const N = 8, a = new Float64Array(N).fill(-1), b = new Float64Array(N).fill(4), c = new Float64Array(N).fill(-1), x = Float64Array.from({ length: N }, (_, i) => Math.sin(i + 1));
  const d = x.map((_, i) => b[i] * x[i] + (i > 0 ? a[i] * x[i - 1] : 0) + (i < N - 1 ? c[i] * x[i + 1] : 0));
  const sol = S.thomas(a, b, c, Float64Array.from(d), N, new Float64Array(N));
  ok(sol.every((v, i) => near(v, x[i], 1e-13)), 'the Thomas algorithm solves a diagonally dominant tridiagonal system to round-off');
  const dp = x.map((_, i) => b[i] * x[i] + a[i] * x[(i - 1 + N) % N] + c[i] * x[(i + 1) % N]);
  const sp = S.thomasPeriodic(a, b, c, Float64Array.from(dp), N);
  ok(sp.every((v, i) => near(v, x[i], 1e-12)), 'the cyclic tridiagonal system (periodic implicit steps) by Sherman–Morrison, to round-off');
  const z = S.thomas(new Float64Array(3), new Float64Array(3), new Float64Array(3), Float64Array.from([1, 2, 3]), 3, new Float64Array(3));
  ok(z.every(Number.isNaN), 'a singular system gives NaN, never a throw');
}

// ---------- 2. stability ----------
{
  const G = S.grid({ dim: 1, nx: 101 }), G2 = S.grid({ dim: 2, nx: 101, ny: 101 });
  ok(near(S.ftcsLimit(G, 1), 0.5 * G.dx ** 2, 1e-15) && near(S.ftcsLimit(G2, 1), 0.25 * G.dx ** 2, 1e-15), 'FTCS: dt ≤ h²/(2D) on a line, h²/(4D) on a square grid');
  ok(near(S.diffusionNumber(G, 2, 1e-4), 2e-4 / G.dx ** 2, 1e-12) && near(S.courant(G2, 1, -2, 0.001).max, 0.2, 1e-12) && near(S.waveCourant(G, 1, 0.005), 0.5, 1e-12), 'the diffusion number r = DΔt/h², the Courant numbers |v|Δt/h, the wave Courant number cΔt√Σh⁻²');
  const vn = (s, p) => S.vonNeumann(s, p);
  ok(near(vn('ftcs', { r: 0.5 }), 1, 1e-12) && near(vn('ftcs', { r: 0.6 }), 1.4, 1e-12), 'FTCS: |G| = |1 − 4r sin²(θ/2)| ≤ 1 exactly up to r = ½ (max 1.4 at r = 0.6)');
  ok(near(vn('btcs', { r: 50 }), 1, 1e-12) && near(vn('cn', { r: 50 }), 1, 1e-12) && near(S.amplification('cn', { r: 50 }, Math.PI), 99 / 101, 1e-12), 'BTCS and Crank–Nicolson are unconditionally stable; CN at r = 50, θ = π: |G| = 99/101 (slow, oscillating decay)');
  ok(near(vn('upwind', { C: 1 }), 1, 1e-12) && vn('upwind', { C: 0.5 }) <= 1 + 1e-12 && vn('upwind', { C: 1.2 }) > 1.1, 'upwind: stable for C ≤ 1 (|G(π)| = |1 − 2C|), unstable beyond');
  ok(vn('laxwendroff', { C: 0.9 }) <= 1 + 1e-12 && vn('laxwendroff', { C: 1.1 }) > 1 && vn('laxfriedrichs', { C: 0.8 }) <= 1 + 1e-12, 'Lax–Wendroff and Lax–Friedrichs: stable for C ≤ 1');
  ok(near(vn('centred', { C: 0.5 }), Math.sqrt(1.25), 1e-9), 'FTCS centred advection is unconditionally unstable: max |G| = √(1 + C²) at θ = π/2');
  ok(near(vn('leapfrog', { C: 1 }), 1, 1e-12) && vn('leapfrog', { C: 1.05 }) > 1.2, 'leapfrog for the wave equation: |g| = 1 (no damping) for C ≤ 1, growth beyond');
  ok(vn('advdiff', { r: 0.2, C: 0.5 }) <= 1 + 1e-12 && vn('advdiff', { r: 0.4, C: 0.5 }) > 1, 'FTCS diffusion + upwind advection: stable when 2r + C ≤ 1');
  ok(Number.isNaN(S.amplification('nope', {}, 1)), 'an unknown scheme: NaN');
  const L = S.LIMITERS, ths = [-1, 0, 0.3, 0.5, 1, 1.5, 2, 3, 10];
  const tvd = f => ths.every(t => { const p = f(t); return t <= 0 ? p === 0 : p >= 0 && p <= Math.min(2 * t, 2) + 1e-12; });
  ok(['minmod', 'vanleer', 'superbee', 'mc'].every(k => tvd(L[k]) && near(L[k](1), 1, 1e-12)), 'minmod, van Leer, superbee, MC: inside Sweby\'s TVD region (0 ≤ φ ≤ min(2θ, 2)) and φ(1) = 1 (second order)');
  ok(L.superbee(0.5) === 1 && L.minmod(0.5) === 0.5 && near(L.vanleer(3), 1.5, 1e-12) && L.mc(3) === 2, 'superbee is the upper edge (φ(½) = 1), minmod the lower (φ(½) = ½); van Leer φ(3) = 1.5, MC φ(3) = 2');
}

// ---------- 3. neighbourhoods, distances, graphs ----------
{
  ok(S.offsets('moore', 1).length === 8 && S.offsets('vonneumann', 1).length === 4 && S.offsets('moore', 2).length === 24 && S.offsets('vonneumann', 2).length === 12, 'Moore r = 1, 2: 8, 24 cells; von Neumann r = 1, 2: 4, 12 cells ((2r+1)² − 1; 2r(r+1))');
  ok(S.hexOffsets(5, 4, 1).length === 6 && S.hexOffsets(5, 5, 1).length === 6 && S.hexOffsets(5, 4, 2).length === 18 && S.hexOffsets(5, 5, 3).length === 36, 'hexagonal neighbourhoods (odd-r offset rows): 6, 18, 36 cells at r = 1, 2, 3 (3r(r+1))');
  ok(S.hexOffsets(5, 5, 1).every(([i, j]) => S.hexDist(5, 5, i, j) === 1) && S.hexDist(0, 0, 3, 0) === 3 && S.hexDist(0, 0, 0, 2) === 2, 'hex distance (cube coordinates, Hex grids by Amit Patel): every neighbour at 1');
  const hc = S.hexCentre(5, 5), nb = S.hexOffsets(5, 5, 1).map(([i, j]) => S.hexCentre(i, j)).map(([x, y]) => Math.hypot(x - hc[0], y - hc[1]));
  ok(nb.every(d => near(d, Math.sqrt(3), 1e-12)), 'hexagon centres: the six neighbours at the same distance √3 (pointy-top, side 1)');
  const T = S.latticeNeighbours(10, 10, 'moore', 1, true), F = S.latticeNeighbours(10, 10, 'moore', 1, false);
  ok(T.off[100] === 800 && F.off[1] - F.off[0] === 3 && F.off[100] === 8 * 64 + 5 * 32 + 3 * 4, 'a 10 × 10 Moore lattice: 8 neighbours each on a torus; corners 3, edges 5 within walls');
  const H = S.latticeNeighbours(8, 8, 'hex', 1, true), Ho = S.latticeNeighbours(8, 7, 'hex', 1, true);
  ok(H.off[64] === 6 * 64 && Ho.off[56] < 6 * 56, 'a hex torus of 8 × 8 gives 6 neighbours each; an odd number of rows cannot close and falls back to walls');
  ok(S.wrapCell(-1, 0, 10, 10, true) === 9 && S.wrapCell(-1, 0, 10, 10, false) === -1 && S.wrapCell(3, 12, 10, 10, true) === 23, 'cells wrap on a torus, −1 outside walls');
  ok(near(S.wrapDelta(0.9, 1), -0.1, 1e-12) && near(S.distance(0.05, 0.5, 0.95, 0.5, { torus: true, w: 1, h: 1 }), 0.1, 1e-12) && near(S.distance(0, 0, 3, 4), 5, 1e-12) && S.distance(0, 0, 3, 4, { metric: 'manhattan' }) === 7 && S.distance(0, 0, 3, 4, { metric: 'chebyshev' }) === 4, 'minimal-image (toroidal) distances; Euclidean, Manhattan, Chebyshev metrics');
  // buckets against brute force, on a torus and within walls
  for (const torus of [true, false]) {
    const r = rng('pts' + torus), N = 600, xs = new Float64Array(N), ys = new Float64Array(N);
    for (let i = 0; i < N; i++) { xs[i] = r() * 50; ys[i] = r() * 30; }
    const bk = S.buckets(50, 30, 4, torus); bk.build(xs, ys, N);
    let same = true, visits = 0;
    for (let q = 0; q < 60 && same; q++) {
      const got = new Set(); visits += bk.query(xs[q], ys[q], 4, k => { got.add(k); });
      for (let k = 0; k < N; k++) { const d = S.distance(xs[q], ys[q], xs[k], ys[k], { torus, w: 50, h: 30 }); if ((d <= 4) !== got.has(k)) { same = false; break; } }
    }
    ok(same && visits < 60 * N / 3, `the bucket index finds exactly the points within r (brute force), ${torus ? 'on a torus' : 'within walls'}, visiting ${(visits / 60).toFixed(0)} of ${N} points per query`);
  }
  const A = S.adjacency(4, [[0, 1], [1, 2], [2, 3], [0, 0], [5, 1], [1.5, 2]], false);
  ok(A.m === 3 && A.off[4] === 6 && A.off[2] - A.off[1] === 2, 'adjacency (CSR): self-loops, out-of-range and non-integer ends are dropped');
  const D = S.adjacency(3, [[0, 1], [1, 2]], true);
  ok(D.off[1] - D.off[0] === 1 && D.off[3] - D.off[2] === 0, 'a directed adjacency keeps only out-edges');
  ok(S.ring(10, 2).length === 20 && S.latticeEdges(4, 3, false).length === 3 * 3 + 4 * 2 && S.latticeEdges(4, 4, true).length === 32, 'ring lattice n·k edges; a 4 × 3 grid 17 edges, a 4 × 4 torus 32');
  const er = S.erdosRenyi(400, 0.02, rng('er'));
  ok(near(2 * er.length / 400, 0.02 * 399, 0.8), `Erdős–Rényi G(400, 0.02): mean degree ${(2 * er.length / 400).toFixed(2)} (p(n−1) = 7.98)`);
  const ws = S.wattsStrogatz(200, 3, 0.1, rng('ws')), ba = S.barabasiAlbert(300, 2, rng('ba'));
  ok(ws.length === 600 && new Set(ws.map(e => Math.min(e[0], e[1]) + ',' + Math.max(e[0], e[1]))).size === 600, 'Watts–Strogatz (200, k 3, p 0.1): n·k edges kept by rewiring, no duplicates');
  const bdeg = new Int32Array(300); for (const [a2, b2] of ba) { bdeg[a2]++; bdeg[b2]++; }
  ok(Math.abs(ba.length - 2 * 300) <= 4 && Math.max(...bdeg) > 25, `Barabási–Albert (300, m 2): ${ba.length} edges (≈ m·n) and hubs (max degree ${Math.max(...bdeg)})`);
  const cl = S.circleLayout(12); ok(cl[0].length === 12 && cl[0].every((x, i) => near(Math.hypot(x - 0.5, cl[1][i] - 0.5), 0.45, 1e-12)), 'a circle layout of 12 nodes');
}

// ---------- 4. random walks ----------
{
  const paths = [], N = 2000, steps = 100; for (let k = 0; k < N; k++) paths.push(S.walk(rng('w' + k), steps, { kind: 'lattice' }));
  const m = S.msd(paths);
  ok(m.length === steps + 1 && m[0] === 0 && rel(m[steps], steps, 0.06) && rel(m[50], 50, 0.07), `lattice walk in 2-D: MSD(100) = ${m[steps].toFixed(1)}, MSD(50) = ${m[50].toFixed(1)} (= n ℓ², 2000 walks)`);
  const g = []; for (let k = 0; k < N; k++) g.push(S.walk(rng('g' + k), steps, { kind: 'gauss', step: 0.5 }));
  const mg = S.msd(g);
  ok(rel(mg[steps], 2 * 0.25 * steps, 0.06), `Gaussian steps σ = 0.5: MSD(100) = ${mg[steps].toFixed(2)} (2·d·D·t with 2D = σ²: 50)`);
  const g1 = []; for (let k = 0; k < N; k++) g1.push(S.walk(rng('h' + k), steps, { kind: 'lattice', dim: 1 }));
  ok(rel(S.msd(g1)[steps], steps, 0.07) && g1.every(p => p.y.every(v => v === 0)), '1-D lattice walk: MSD = n, y stays 0');
  const box = [0, 10, 0, 10];
  const rf = S.walk(rng('rf'), 5000, { kind: 'gauss', step: 2, box, boundary: 'reflect', x0: 5, y0: 5 }), pe = S.walk(rng('pe'), 5000, { kind: 'gauss', step: 2, box, boundary: 'periodic', x0: 5, y0: 5 });
  ok(rf.x.every(v => v >= 0 && v <= 10) && rf.y.every(v => v >= 0 && v <= 10) && pe.x.every(v => v >= 0 && v < 10), 'reflecting and periodic boxes keep the walker inside');
  const ab = []; for (let k = 0; k < 400; k++) ab.push(S.walk(rng('ab' + k), 100000, { kind: 'lattice', dim: 1, box: [0, 20, 0, 0], boundary: 'absorb', x0: 10 }).absorbed);
  const meanT = ab.reduce((s, v) => s + v, 0) / ab.length;
  ok(ab.every(v => v > 0) && rel(meanT, 11 * 11 - 1 + 1, 0.12), `gambler's ruin: a symmetric walk from 10 absorbed beyond 0 or 20 (exits at −1 or 21): mean time ${meanT.toFixed(0)} (a·b = 11·11 = 121)`);
  const cw = S.walk(rng('cw'), 1000, { kind: 'correlated', kappa: 50 }), uw = S.walk(rng('uw'), 1000, { kind: 'correlated', kappa: 0.01 });
  const net = p => Math.hypot(p.x[p.x.length - 1], p.y[p.y.length - 1]);
  ok(net(cw) > 3 * net(uw) && cw.x.length === 1001, `a correlated walk (κ = 50) travels farther (${net(cw).toFixed(0)}) than an uncorrelated one (${net(uw).toFixed(0)}) in 1000 unit steps`);
  const lv = S.walk(rng('lv'), 2000, { kind: 'levy', mu: 2 }), lens = []; for (let i = 1; i < lv.x.length; i++) lens.push(Math.hypot(lv.x[i] - lv.x[i - 1], lv.y[i] - lv.y[i - 1]));
  ok(lens.every(l => l >= 1 - 1e-9) && Math.max(...lens) > 100, `a Lévy walk (μ = 2, P(ℓ > L) = L^−(μ−1)): steps ≥ 1, the longest ${Math.max(...lens).toFixed(0)}`);
  ok(S.walk(Math.random, -5, {}).x.length === 1 && S.walk(rng('x'), 1e9, {}).x.length === 200001, 'walk lengths are bounded (0 … 200 000 steps)');
}

// ---------- 5. spatial statistics ----------
{
  const nx = 8, cb = []; for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) cb.push((i + j) % 2);
  const W = S.latticeWeights(nx, nx, 'rook', false), mI = S.moranI(cb, W);
  ok(near(mI.I, -1, 1e-12) && near(mI.E, -1 / 63, 1e-15) && mI.z < -8, `Moran's I of an 8 × 8 checkerboard (rook): I = ${mI.I} (−1, perfect negative autocorrelation), E[I] = −1/63, z = ${mI.z.toFixed(1)}`);
  ok(near(S.gearyC(cb, W), 63 / 32, 1e-12), `Geary's C of the checkerboard = (n−1)·Σw(Δ)²/(2·S0·Σz²) = 63/32 (${S.gearyC(cb, W)})`);
  const half = []; for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) half.push(i < 4 ? 1 : 0);
  const hI = S.moranI(half, W);
  ok(near(hI.I, 6 / 7, 1e-12), `two halves (rook): I = ${hI.I.toFixed(4)} = (n/S0)·Σw z_i z_j/Σz² = (64/224)·2(104 − 8)·¼/16 = 6/7`);
  const r = rng('csr'), N = 400, rx = [], ry = [], vals = []; for (let i = 0; i < N; i++) { rx.push(r()); ry.push(r()); vals.push(r()); }
  const rI = S.moranI(vals, S.bandWeights(rx, ry, 0.08, {}));
  ok(Math.abs(rI.z) < 3, `random values on random points: Moran's z = ${rI.z.toFixed(2)} (|z| < 3)`);
  const K = S.ripleyK(rx, ry, 1, 1, [0.05, 0.1, 0.15], 'torus');
  ok(K.L.every((l, i) => near(l, [0.05, 0.1, 0.15][i], 0.012)) && near(K.K[1], Math.PI * 0.01, 0.006), `Ripley's L under CSR (400 points, torus correction): L(r) = ${K.L.map(x => x.toFixed(3)).join(', ')} ≈ r (Besag 1977)`);
  const Kb = S.ripleyK(rx, ry, 1, 1, [0.1], 'border'), Kn = S.ripleyK(rx, ry, 1, 1, [0.1], 'none');
  ok(near(Kb.L[0], 0.1, 0.012) && Kn.L[0] < Kb.L[0], `the border correction is unbiased too (${Kb.L[0].toFixed(3)}); no correction underestimates (${Kn.L[0].toFixed(3)})`);
  const cx = [], cy = []; for (let c = 0; c < 10; c++) { const ax = r(), ay = r(); for (let k = 0; k < 20; k++) { cx.push((ax + 0.02 * (r() - 0.5) + 1) % 1); cy.push((ay + 0.02 * (r() - 0.5) + 1) % 1); } }
  ok(S.ripleyK(cx, cy, 1, 1, [0.05], 'torus').L[0] > 0.15, 'clustered points: L(0.05) ≫ 0.05');
  const lx = [], ly = []; for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { lx.push((i + 0.5) / 10); ly.push((j + 0.5) / 10); }
  ok(near(S.clarkEvans(lx, ly, 1, 1, true), 2, 1e-12) && near(S.clarkEvans(rx, ry, 1, 1, true), 1, 0.08) && S.clarkEvans(cx, cy, 1, 1, true) < 0.3, `Clark & Evans 1954: R = 2 on a square lattice, ${S.clarkEvans(rx, ry, 1, 1, true).toFixed(3)} for random points (1), ${S.clarkEvans(cx, cy, 1, 1, true).toFixed(3)} clustered`);
  ok(Number.isNaN(S.moranI([1, 1, 1], S.latticeWeights(3, 1, 'rook', false)).I) && Number.isNaN(S.clarkEvans([1], [1], 1, 1)), 'constant values or one point: NaN, no throw');
  const hx = S.latticeWeights(6, 6, 'hex', true); ok(hx.off[36] === 6 * 36, 'hex spatial weights on a 6 × 6 torus: 6 each');
}

// ---------- 6. scenes, budgets, Worker ----------
{
  const nx = 200, ny = 200, vals = new Float64Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[j * nx + i] = Math.sin(i / 15) * Math.cos(j / 20);
  const sc = C.scene([0, 1, 0, 1]); const k = S.heatmap(sc, vals, nx, ny, [0, 1, 0, 1], { levels: 5, maxItems: 1200 });
  const items = sc.done ? sc.done().items : sc.items;
  ok(k > 0 && items.length <= 1200 && items.every(it => C.ROLES.includes(it.c || 'base')), `a heat map of 200 × 200 nodes: ${items.length} polygons (≤ 1200, block means, row runs merged), roles only`);
  const sc2 = C.scene([0, 1, 0, 1]); const xs = Float64Array.from({ length: nx }, (_, i) => i / (nx - 1)), ys = Float64Array.from({ length: ny }, (_, j) => j / (ny - 1));
  const m = S.contour(sc2, vals, nx, ny, xs, ys, 0.3, { maxItems: 600 }); const it2 = sc2.done ? sc2.done().items : sc2.items;
  ok(m > 0 && m <= 600 && it2.length <= 600, `marching squares at level 0.3: ${m} segments (≤ 600)`);
  const tiny = C.scene([0, 1, 0, 1]); ok(S.contour(tiny, Float64Array.from([0, 1, 1, 0]), 2, 2, [0, 1], [0, 1], 0.5, {}) === 2, 'the saddle cell is resolved by its centre value (two segments)');
  ok(S.classOf(NaN, 0, 1, 5) === -1 && S.classOf(1, 0, 1, 5) === 4 && S.classOf(0.5, 1, 1, 5) === 0 && S.RAMP.length === 5, 'classes of the ramp (5 roles), NaN → no class');
  ok(S.heatmap(C.scene([0, 1, 0, 1]), new Float64Array(4).fill(NaN), 2, 2, [0, 1, 0, 1], {}) === 0, 'an all-NaN field draws nothing');
  let threw = false; try { S.moranI([], { off: new Int32Array(1), nbr: new Int32Array(0) }); S.ripleyK([], [], 1, 1, [0.1]); S.walk(rng('j'), 'x', null); S.grid(null); S.latticeNeighbours(1, 1, 'nope', 0, true); S.buckets(0, 0, 0, true).query(0, 0, 1, () => {}); } catch (e) { threw = true; console.log(e); }
  ok(!threw, 'junk input never throws');
  const W = ENGINES.worker('field@1').__noemaShared['kernel/space.js'], a = W.moranI([0, 1, 0, 1, 0, 1, 0, 1, 0], W.latticeWeights(3, 3, 'rook', false)), b = S.moranI([0, 1, 0, 1, 0, 1, 0, 1, 0], S.latticeWeights(3, 3, 'rook', false));
  ok(W && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(Array.from(W.thomasPeriodic([-1, -1, -1, -1], [4, 4, 4, 4], [-1, -1, -1, -1], [1, 2, 3, 4], 4))) === JSON.stringify(Array.from(S.thomasPeriodic([-1, -1, -1, -1], [4, 4, 4, 4], [-1, -1, -1, -1], [1, 2, 3, 4], 4))), 'the source in a fresh Worker global gives the same numbers');
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
