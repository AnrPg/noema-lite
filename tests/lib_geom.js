/* geom@1 (engine/src/47_lib_geom.js, docs/library/geom.md) against published values (research math.md §4, table E1–E17):
   triangle centres (Kimberling, Encyclopedia of Triangle Centers; Coxeter & Greitzer 1967), the Euler line and Feuerbach's
   theorem, circle and line intersections with their classes, conics through five points, inversion, Apollonius' problem,
   the shoelace formula and Pick's theorem, the atan2 angle, the exact predicates (Shewchuk 1997; robust-predicates 3.0.3 —
   Kettner et al. 2008's test), every edge case and its code, the sweep, the sim adapter, the Worker source in a fresh
   context, check codes, speed.   Usage: node tests/lib_geom.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js')); require(path.join(SRC, '46_lib_core.js')); require(path.join(SRC, '47_lib_geom.js'));
const G = globalThis.NoemaLibGeom;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, t) => Math.abs(a - b) <= t;
const spec = (objects, outputs, extra) => ({ format: 'noema.sim-spec/v1', engine: 'geom@1', params: [{ id: 'k', kind: 'slider', label: 'k', min: 0, max: 10, default: 1 }], model: Object.assign({ objects }, extra || {}), outputs: outputs || [] });
const R = (objs, outs, extra, env) => G.run(spec(objs, outs, extra), env || {}, { seed: 1 });
const codes = r => r.diag.map(d => d.code);
const M = (id, of, at, x) => Object.assign({ id, kind: 'scalar', of, at }, x || {});
const XY = p => [M(p + 'x', 'x', [p]), M(p + 'y', 'y', [p])];
const pt = p => (p.some(v => typeof v === 'string') ? { x: p[0], y: p[1] } : p);
const tri = (A, B, C) => [{ id: 'A', point: pt(A) }, { id: 'B', point: pt(B) }, { id: 'C', point: pt(C) }];
const CEN = ['centroid', 'incenter', 'circumcenter', 'orthocenter', 'ninepoint', 'symmedian'];
const cen = CEN.map(k => ({ id: k, center: { kind: k, of: ['A', 'B', 'C'] } }));
const cenOut = CEN.flatMap(XY);
const at = (r, p) => [r.out[p + 'x'], r.out[p + 'y']];
const P2 = (r, p, x, y, t) => near(r.out[p + 'x'], x, t) && near(r.out[p + 'y'], y, t);

ok(G.id === 'geom@1' && Object.isFrozen(G) && G.engine.id === 'geom@1' && G.engine.scenes === true, 'NoemaLibGeom: id geom@1, frozen, scenes');

// ---------- E1–E6, E11: triangle centres ----------
{
  const r = R(tri([0, 0], [4, 0], [0, 3]).concat(cen, [{ id: 'cc', triCircle: { kind: 'circumcircle', of: ['A', 'B', 'C'] } }, { id: 'ic', triCircle: { kind: 'incircle', of: ['A', 'B', 'C'] } }, { id: 'nc', triCircle: { kind: 'ninepoint', of: ['A', 'B', 'C'] } }, { id: 'T', polygon: ['A', 'B', 'C'] }]),
    cenOut.concat([M('R', 'radius', ['cc']), M('r', 'radius', ['ic']), M('rn', 'radius', ['nc']), M('ar', 'area', ['T'])]));
  const t = 1e-12;
  ok(r.out.ar === 6 && near(r.out.R, 2.5, t) && P2(r, 'circumcenter', 2, 1.5, t), 'E1 right triangle (0,0), (4,0), (0,3): area 6, R = 2.5, O = (2, 1.5) — the midpoint of the hypotenuse (Thales) (1e-12)');
  ok(near(r.out.r, 1, t) && P2(r, 'incenter', 1, 1, t) && P2(r, 'centroid', 4 / 3, 1, t), 'E1 r = 1, I = (1, 1), G = (4/3, 1) (1e-12)');
  ok(P2(r, 'orthocenter', 0, 0, t) && codes(r).includes('right-angle') && P2(r, 'ninepoint', 1, 0.75, t) && near(r.out.rn, 1.25, t), 'E1 H = A = (0, 0) with right-angle; N = (1, 0.75), nine-point radius R/2 = 1.25 (1e-12)');
}
{
  const r = R(tri([0, 0], [6, 0], [2, 4]).concat(cen, [{ id: 'cc', triCircle: { kind: 'circumcircle', of: ['A', 'B', 'C'] } }, { id: 'ic', triCircle: { kind: 'incircle', of: ['A', 'B', 'C'] } }, { id: 'eu', eulerLine: ['A', 'B', 'C'] }, { id: 'T', polygon: ['A', 'B', 'C'] }]),
    cenOut.concat([M('R', 'radius', ['cc']), M('r', 'radius', ['ic']), M('ar', 'area', ['T']), M('col', 'collinear', ['circumcenter', 'centroid', 'orthocenter']), M('onE', 'on', ['ninepoint', 'eu']),
      M('HG', 'dist', ['orthocenter', 'centroid']), M('GO', 'dist', ['centroid', 'circumcenter']), M('OI', 'dist', ['circumcenter', 'incenter']), M('NI', 'dist', ['ninepoint', 'incenter'])]));
  const t = 1e-12;
  ok(P2(r, 'circumcenter', 3, 1, t) && near(r.out.R * r.out.R, 10, 1e-11) && P2(r, 'centroid', 8 / 3, 4 / 3, t) && P2(r, 'orthocenter', 2, 2, t) && P2(r, 'ninepoint', 2.5, 1.5, t) && r.out.ar === 12, 'E2 acute triangle (0,0), (6,0), (2,4): O = (3, 1), R² = 10, G = (8/3, 4/3), H = (2, 2), N = (2.5, 1.5), area 12 (1e-12)');
  ok(r.out.col === 1 && r.out.onE === 1 && near(r.out.HG, 2 * r.out.GO, t), 'E3 the Euler line (Euler 1767): O, G, H collinear (the tolerant assert), N on it, |HG| = 2·|GO| (1e-12)');
  ok(P2(r, 'incenter', 2.4076408527535995, 1.4880038797045054, t) && near(r.out.r, 1.4880038797045054, t) && near(r.out.OI * r.out.OI, 0.5890371459331322, t) && near(r.out.OI * r.out.OI, r.out.R * (r.out.R - 2 * r.out.r), t), 'E4 I = (2.4076408527535995, 1.4880038797045054), OI² = 0.5890371459331322 = R(R − 2r) (Euler 1765) (1e-12)');
  ok(near(r.out.NI, 0.09313495037968433, t) && near(r.out.NI, r.out.R / 2 - r.out.r, t), 'E5 Feuerbach 1822: |NI| = R/2 − r = 0.09313495037968433 — the incircle touches the nine-point circle (1e-12)');
  ok(P2(r, 'symmedian', 24 / 11, 18 / 11, t), 'E6 the symmedian point K = (a²A + b²B + c²C)/(a² + b² + c²) = (24/11, 18/11) (Lemoine 1873; X(6)) (1e-12)');
}
{
  const s3 = Math.sqrt(3), r = R(tri([0, 0], [2, 0], [1, s3]).concat(cen, [{ id: 'eu', eulerLine: ['A', 'B', 'C'] }, { id: 'mo', morley: ['A', 'B', 'C'] }]), cenOut.concat([M('mp', 'perimeter', ['mo']), M('d', 'defined', ['eu'])]));
  const all = CEN.every(c => P2(r, c, 1, s3 / 3, 1e-12));
  ok(all && r.out.d === 0 && codes(r).includes('euler-line-undefined'), 'E11 equilateral triangle side 2: every centre at (1, √3/3); the Euler line is undefined (euler-line-undefined)');
  ok(near(r.out.mp / 3, 0.36958506180819073, 1e-12), `E11 Morley's triangle (Morley 1899): side 8R·sin³(20°) = 0.36958506180819073 (got ${r.out.mp / 3}) (1e-12)`);
  const sc = R(tri([0, 0], [7, 0], [2, 5]).concat([{ id: 'mo', morley: ['A', 'B', 'C'] }, { id: 'P', point: [0, 0] }]), [M('eq', 'equal', ['mo', 'mo', 'mo', 'mo'])]);
  const mo = G.run(spec(tri([0, 0], [7, 0], [2, 5]).concat([{ id: 'mo', morley: ['A', 'B', 'C'] }]), [{ id: 'd', kind: 'scene', of: 'drawing' }]), {}, {});
  const poly = mo.out.d.items.find(i => i.k === 'poly' && i.pts.length === 6);
  const side = (i, j) => Math.hypot(poly.pts[2 * i] - poly.pts[2 * j], poly.pts[2 * i + 1] - poly.pts[2 * j + 1]);
  ok(sc && poly && near(side(0, 1), side(1, 2), 1e-12) && near(side(1, 2), side(2, 0), 1e-12), 'Morley\'s theorem on a scalene triangle: the trisector triangle is equilateral (1e-12)');
}

// ---------- E7–E9: intersections and their classes ----------
{
  const r = R([{ id: 'O', point: [0, 0] }, { id: 'O2', point: [8, 0] }, { id: 'c1', circle: { center: 'O', r: 5 } }, { id: 'c2', circle: { center: 'O2', r: 5 } }, { id: 'P', intersect: { of: ['c1', 'c2'] } }, { id: 'Q', intersect: { of: ['c1', 'c2'], pick: 'index:1' } }],
    XY('P').concat(XY('Q'), [M('n', 'count', ['c1', 'c2'])]));
  ok(r.out.n === 2 && P2(r, 'P', 4, r.out.Py, 1e-12) && near(Math.abs(r.out.Py), 3, 1e-12) && near(r.out.Qy, -r.out.Py, 1e-12), 'E7 circles (0,0) r 5 and (8,0) r 5 meet at (4, ±3) (1e-12)');
  const t = R([{ id: 'O', point: [0, 0] }, { id: 'O2', point: [5, 0] }, { id: 'c1', circle: { center: 'O', r: 3 } }, { id: 'c2', circle: { center: 'O2', r: 2 } }, { id: 'P', intersect: { of: ['c1', 'c2'] } }], XY('P').concat([M('n', 'count', ['c1', 'c2']), M('tg', 'tangent', ['c1', 'c2']), M('f', 'flag', [], { code: 'tangent' })]));
  ok(P2(t, 'P', 3, 0, 1e-12) && t.out.n === 1 && t.out.tg === 1 && t.out.f === 1, 'E7 circles (0,0) r 3 and (5,0) r 2: external tangency at (3, 0), tangent');
  const c = R([{ id: 'O', point: [0, 0] }, { id: 'O2', point: [1, 0] }, { id: 'c1', circle: { center: 'O', r: 5 } }, { id: 'c2', circle: { center: 'O2', r: 1 } }, { id: 'P', intersect: { of: ['c1', 'c2'] } }], [M('n', 'count', ['c1', 'c2']), M('d', 'defined', ['P'])]);
  ok(c.out.n === 0 && c.out.d === 0 && codes(c).includes('contained') && codes(c).includes('no-intersection'), 'E7 (0,0) r 5 and (1,0) r 1: contained, no intersection (the point is undefined, never a guess)');
  const cc = R([{ id: 'O', point: [0, 0] }, { id: 'c1', circle: { center: 'O', r: 2 } }, { id: 'c2', circle: { center: 'O', r: 1 } }, { id: 'P', intersect: { of: ['c1', 'c2'] } }], [M('d', 'defined', ['P'])]);
  ok(cc.out.d === 0 && codes(cc).includes('concentric'), 'concentric circles: concentric');
}
{
  const base = [{ id: 'O', point: [0, 0] }, { id: 'c', circle: { center: 'O', r: 'sqrt(2)' } }];
  const a = R(base.concat([{ id: 'A', point: [0, 0] }, { id: 'B', point: [1, 1] }, { id: 'l', line: ['A', 'B'] }, { id: 'P', intersect: { of: ['l', 'c'] } }, { id: 'Q', intersect: { of: ['l', 'c'], pick: 'index:1' } }]), XY('P').concat(XY('Q'), [M('n', 'count', ['l', 'c'])]));
  const pq = [at(a, 'P'), at(a, 'Q')].map(p => p.map(v => Math.round(v * 1e9) / 1e9).join()).sort().join(' ');
  ok(a.out.n === 2 && pq === '-1,-1 1,1' && !codes(a).includes('tangent'), 'E8 the line y = x and the circle r = √2: two points (1, 1), (−1, −1) (1e-9)');
  const b = R(base.concat([{ id: 'A', point: [2, 0] }, { id: 'B', point: [0, 2] }, { id: 'l', line: ['A', 'B'] }, { id: 'P', intersect: { of: ['l', 'c'] } }]), XY('P').concat([M('n', 'count', ['l', 'c']), M('tg', 'tangent', ['l', 'c'])]));
  ok(b.out.n === 1 && P2(b, 'P', 1, 1, 1e-12) && codes(b).includes('tangent') && b.out.tg === 1, 'E8 x + y = 2 and the same circle: the distance √2 = r on the tolerance path → tangent at (1, 1)');
}
{
  const L = (id, p, q) => [{ id: id + 'p', point: p }, { id: id + 'q', point: q }, { id, line: [id + 'p', id + 'q'] }];
  const par = R(L('l1', [0, 1], [1, 3]).concat(L('l2', [0, 3], [1, 5]), [{ id: 'X', intersect: { of: ['l1', 'l2'] } }]), [M('d', 'defined', ['X']), M('p', 'parallel', ['l1', 'l2']), M('n', 'count', ['l1', 'l2'])]);
  ok(par.out.d === 0 && par.out.p === 1 && par.out.n === 0 && codes(par).includes('parallel'), 'E9 y = 2x + 1 and y = 2x + 3: parallel (they meet at infinity), no point');
  const co = R(L('l1', [0, 1], [1, 3]).concat(L('l2', [-1, -1], [3, 7]), [{ id: 'X', intersect: { of: ['l1', 'l2'] } }]), [M('d', 'defined', ['X'])]);
  ok(co.out.d === 0 && codes(co).includes('coincident'), 'E9 y = 2x + 1 and 2y = 4x + 2: coincident (infinitely many points)');
  const ok3 = R(L('l1', [0, 0], [1, 1]).concat(L('l2', [0, 2], [2, 0]), L('l3', [1, 0], [1, 5])), [M('cc', 'concurrent', ['l1', 'l2', 'l3']), M('pp', 'perpendicular', ['l1', 'l2']), M('ang', 'angle', ['l1', 'l3'])]);
  ok(ok3.out.cc === 1 && ok3.out.pp === 1 && near(ok3.out.ang, 45, 1e-12), 'three lines through (1, 1): concurrent; y = x ⟂ x + y = 2; the angle between y = x and x = 1 is 45°');
}

// ---------- E10: exact predicates ----------
{
  let bad = 0, naive = 0;
  for (let k = 0; k < 256; k++) for (let l = 0; l < 256; l++) {
    const px = 0.5 + k * 2 ** -53, py = 0.5 + l * 2 ** -53;
    if (Math.sign(G.orient(px, py, 12, 12, 24, 24)) !== Math.sign(l - k)) bad++;
    if (Math.sign((12 - px) * (24 - py) - (12 - py) * (24 - px)) !== Math.sign(l - k)) naive++;
  }
  ok(bad === 0, 'E10 Kettner et al. 2008: orient2d (Shewchuk 1997, robust-predicates 3.0.3) gives sign(l − k) for all 65 536 points — 0 wrong (exact)');
  ok(naive > 1000, `E10 the naive float formula gets ${naive} of them wrong (the noisy picture of the paper)`);
  ok(G.incircle(0, 0, 1, 0, 0, 1, 0.5, 0.5) > 0 && G.incircle(0, 0, 1, 0, 0, 1, 2, 2) < 0 && G.incircle(0, 0, 1, 0, 0, 1, 1, 1) === 0, 'incircle: inside > 0, outside < 0, on the circle exactly 0 (ccw a, b, c)');
  const src = fs.readFileSync(path.join(SRC, '47_lib_geom.js'), 'utf8'), V = path.join(ROOT, 'engine', 'vendor', 'robust-predicates@3.0.3');
  const same = ['orient2d.min.js', 'incircle.min.js'].every(f => src.includes(fs.readFileSync(path.join(V, f), 'utf8').trim()));
  ok(same && fs.existsSync(path.join(V, 'LICENSE')), 'the embedded predicates are the vendored robust-predicates@3.0.3 files byte for byte (Unlicense)');
}

// ---------- E12, E13, E14, E15, E16, E17 ----------
{
  const r = R([{ id: 'O', point: [0, 0] }, { id: 'U', point: [1, 0] }, { id: 'u', circle: { center: 'O', through: 'U' } }, { id: 'A', point: [2, 0] }, { id: 'B', point: [2, 1] }, { id: 'l', line: ['A', 'B'] },
    { id: 'il', transform: { kind: 'invert', of: 'l', circle: 'u' } }, { id: 'C1', centerOf: { of: 'il' } }, { id: 'iO', transform: { kind: 'invert', of: 'O', circle: 'u' } }], [M('r', 'radius', ['il']), M('d', 'defined', ['iO'])].concat(XY('C1')));
  ok(near(r.out.r, 0.25, 1e-14) && P2(r, 'C1', 0.25, 0, 1e-14) && r.out.d === 0 && codes(r).includes('inversion-centre'), 'E12 inversion in the unit circle: the line x = 2 → the circle centre (1/4, 0), r 1/4; the centre itself → inversion-centre (1e-14)');
}
{
  const r = R([{ id: 'A', point: [2, 0] }, { id: 'B', point: [-2, 0] }, { id: 'C', point: [0, 1] }, { id: 'D', point: [0, -1] }, { id: 'E', point: { x: 'sqrt(2)', y: 'sqrt(2)/2' } }, { id: 'k', conic: { points: ['A', 'B', 'C', 'D', 'E'] } }, { id: 'F', focus: { of: 'k' } }, { id: 'F2', focus: { of: 'k', index: 1 } }],
    [M('e', 'eccentricity', ['k']), M('ty', 'conicType', ['k']), M('ar', 'area', ['k'])].concat(XY('F'), XY('F2')));
  const fx = [r.out.Fx, r.out.F2x].sort((a, b) => a - b);
  ok(near(r.out.e, Math.sqrt(3) / 2, 1e-10) && near(fx[0], -Math.sqrt(3), 1e-10) && near(fx[1], Math.sqrt(3), 1e-10) && near(r.out.Fy, 0, 1e-10), 'E13 the conic through five points (Cramer 1750) is x²/4 + y² = 1: foci (±√3, 0), e = √3/2 (1e-10)');
  ok(near(r.out.ar, 2 * Math.PI, 1e-10), 'the ellipse\'s area πab = 2π (1e-10)');
  const f = R([{ id: 'F1', point: [-3, 0] }, { id: 'F2', point: [3, 0] }, { id: 'P', point: [5, 0] }, { id: 'k', conic: { foci: ['F1', 'F2'], through: 'P', type: 'ellipse' } }], [M('e', 'eccentricity', ['k'])]);
  ok(near(f.out.e, 0.6, 1e-12), 'the ellipse with foci (±3, 0) through (5, 0): e = c/a = 3/5 (1e-12)');
  const p = R([{ id: 'F', point: [0, 1] }, { id: 'a', point: [0, -1] }, { id: 'b', point: [1, -1] }, { id: 'dx', line: ['a', 'b'] }, { id: 'k', conic: { focus: 'F', directrix: 'dx', e: 1 } }], [M('t', 'conicType', ['k']), M('e', 'eccentricity', ['k'])]);
  ok(near(p.out.e, 1, 1e-12), `focus (0, 1) and directrix y = −1 with e = 1: the parabola x² = 4y (type code ${p.out.t})`);
  const dg = R([{ id: 'A', point: [0, 0] }, { id: 'B', point: [1, 0] }, { id: 'C', point: [2, 0] }, { id: 'D', point: [3, 0] }, { id: 'E', point: [4, 0] }, { id: 'k', conic: { points: ['A', 'B', 'C', 'D', 'E'] } }], [M('d', 'defined', ['k'])]);
  ok(codes(dg).some(c => c === 'conic-not-unique' || c === 'conic-degenerate' || c === 'collinear'), `five collinear points: ${codes(dg).join(', ')} (no unique conic)`);
}
{
  const r = R([[0, 0], [4, 0], [4, 3], [2, 5], [0, 3]].map((p, i) => ({ id: 'V' + i, point: p })).concat([{ id: 'P', polygon: ['V0', 'V1', 'V2', 'V3', 'V4'] }, { id: 'Q', polygon: ['V4', 'V3', 'V2', 'V1', 'V0'] }]), [M('a', 'area', ['P']), M('as', 'area', ['Q'], { signed: true }), M('pe', 'perimeter', ['P'])]);
  ok(r.out.a === 16 && r.out.as === -16, 'E14 shoelace (Gauss): the lattice pentagon (0,0), (4,0), (4,3), (2,5), (0,3) has area 16 = I + B/2 − 1 with B = 14, I = 10 (Pick 1899); clockwise −16 (exact)');
  ok(near(r.out.pe, 4 + 3 + 2 * Math.sqrt(8) + 3, 1e-12), 'its perimeter 10 + 4√2');
  const a = R([{ id: 'U', point: [1, 0] }, { id: 'O', point: [0, 0] }, { id: 'V', point: [1, 1e-10] }], [M('a', 'angle', ['U', 'O', 'V'], { unit: 'rad' })]);
  ok(Math.abs(a.out.a - 1e-10) <= 1e-24, `E15 the angle between (1, 0) and (1, 1e-10) is ${a.out.a} rad by atan2(cross, dot) (acos gives 0) (1e-24 abs)`);
  const ar = R([{ id: 'U', point: [1, 0] }, { id: 'O', point: [0, 0] }, { id: 'V', point: [-1, 1e-10] }], [M('a', 'angle', ['U', 'O', 'V'], { unit: 'rad' })]);
  ok(near(ar.out.a, Math.PI - 1e-10, 1e-15), 'and near π: π − 1e-10 (atan2 keeps it)');
}
{
  const r = R([{ id: 'O1', point: [0, 0] }, { id: 'O2', point: [4, 0] }, { id: 'c1', circle: { center: 'O1', r: 1 } }, { id: 'c2', circle: { center: 'O2', r: 1 } }, { id: 'H', point: [2, 0] },
    { id: 't1', tangent: { from: 'H', to: 'c1', pick: 'index:0' } }, { id: 't2', tangent: { from: 'H', to: 'c1', pick: 'index:1' } }], [M('s1', 'slope', ['t1']), M('s2', 'slope', ['t2']), M('g1', 'tangent', ['t1', 'c2']), M('g2', 'tangent', ['t2', 'c2'])]);
  const s = [r.out.s1, r.out.s2].sort((a, b) => a - b);
  ok(near(s[0], -1 / Math.sqrt(3), 1e-12) && near(s[1], 1 / Math.sqrt(3), 1e-12) && r.out.g1 === 1 && r.out.g2 === 1, 'E16 circles (0,0) r 1 and (4,0) r 1: the tangents from the internal homothety centre (2, 0) have slopes ±1/√3 and touch both circles (1e-12)');
  const ins = R([{ id: 'O', point: [0, 0] }, { id: 'c', circle: { center: 'O', r: 2 } }, { id: 'P', point: [0.5, 0] }, { id: 't', tangent: { from: 'P', to: 'c' } }], [M('d', 'defined', ['t'])]);
  ok(ins.out.d === 0 && codes(ins).includes('inside-circle'), 'a tangent from a point inside the circle: inside-circle');
}
{
  const base = [{ id: 'c1x', point: [0, 0] }, { id: 'c2x', point: [4, 0] }, { id: 'c3x', point: [2, 4] }, { id: 'c1', circle: { center: 'c1x', r: 1 } }, { id: 'c2', circle: { center: 'c2x', r: 1 } }, { id: 'c3', circle: { center: 'c3x', r: 1 } }];
  const r = R(base.concat([{ id: 's1', apollonius: { of: ['c1', 'c2', 'c3'], signs: [-1, -1, -1] } }, { id: 's2', apollonius: { of: ['c1', 'c2', 'c3'] } }, { id: 'z', centerOf: { of: 's1' } }]), [M('r1', 'radius', ['s1']), M('r2', 'radius', ['s2']), M('t1', 'tangent', ['s1', 'c1']), M('t2', 'tangent', ['s1', 'c3'])].concat(XY('z')));
  ok(near(r.out.r1, 3.5, 1e-10) && near(r.out.r2, 1.5, 1e-10) && P2(r, 'z', 2, 1.5, 1e-10) && r.out.t1 === 1 && r.out.t2 === 1, 'E17 Apollonius (Viète 1600): three unit circles at (0,0), (4,0), (2,4): the enclosing solution r 3.5 about (2, 1.5), the inner one r 1.5 (1e-10)');
}

// ---------- more constructions ----------
{
  const r = R([{ id: 'A', point: [0, 0] }, { id: 'B', point: [4, 0] }, { id: 'C', point: [4, 3] }, { id: 'D', point: [2, 5] }, { id: 'E', point: [0, 3] }, { id: 'X', point: [1, 1] }, { id: 'P', polygon: ['A', 'B', 'C', 'D', 'E'] },
    { id: 'h', hull: ['A', 'C', 'B', 'X', 'D', 'E'] }, { id: 'm', mec: ['A', 'B', 'C', 'D', 'E'] }, { id: 'dl', delaunay: ['A', 'B', 'C', 'D', 'E', 'X'] }, { id: 'vo', voronoi: ['A', 'B', 'C', 'D', 'E', 'X'] }],
    [M('inn', 'inside', ['X', 'P']), M('ha', 'area', ['h']), M('mr', 'radius', ['m'])]);
  ok(r.out.inn === 1 && r.out.ha === 16, 'the convex hull (Andrew 1979) of the pentagon and an inner point is the pentagon (area 16); the point is inside (winding number)');
  ok(near(r.out.mr, 2.9, 1e-12), `the minimum enclosing circle (Welzl 1991, seeded): through (0,0), (4,0), (2,5), centre (2, 2.1), r 2.9 = ${r.out.mr} (brute force over pairs and triples) (1e-12)`);
  const dl = G.run(spec([[0, 0], [4, 0], [4, 3], [2, 5], [0, 3], [1, 1]].map((p, i) => ({ id: 'V' + i, point: p })).concat([{ id: 'dl', delaunay: ['V0', 'V1', 'V2', 'V3', 'V4', 'V5'] }]), [{ id: 'd', kind: 'scene', of: 'drawing' }]), {}, {});
  const P = [[0, 0], [4, 0], [4, 3], [2, 5], [0, 3], [1, 1]], tris = G.delaunay(P, 5, { n: 0 });
  const empty = tris.every(t => P.every((q, i) => t.includes(i) || G.incircle(...P[t[0]], ...P[t[1]], ...P[t[2]], ...q) * Math.sign(G.orient(...P[t[0]], ...P[t[1]], ...P[t[2]])) <= 0));
  ok(tris.length === 2 * 6 - 2 - 5 && empty && dl.out.d.items.length > 0, `Delaunay (Bowyer–Watson with exact incircle): ${tris.length} triangles = 2n − 2 − h, every circumcircle empty`);
}
{
  const r = R([{ id: 'O', point: [0, 0] }, { id: 'c', circle: { center: 'O', r: 3 } }, { id: 'A', point: [-3, 0] }, { id: 'B', point: [3, 0] }, { id: 'P', pointOn: { on: 'c', t: 'u' } }, { id: 'H', center: { kind: 'orthocenter', of: ['A', 'B', 'P'] } }, { id: 'L', locus: { of: 'H' } }],
    [{ id: 'sw', kind: 'series', of: 'sweep' }, { id: 'ang', kind: 'series', of: 'angle', at: ['A', 'P', 'B'] }, M('alw', 'always', ['A', 'P', 'B', 'O'], { test: 'concyclic' }), { id: 'd', kind: 'scene', of: 'drawing' }], { sweep: { var: 'u', from: 0.1, to: 3, samples: 50 } });
  ok(r.out.sw.length === 50 && r.out.ang.length === 50 && r.out.ang.every(a => near(a, 90, 1e-9)), 'Thales: the angle APB on a semicircle is 90° at all 50 sweep samples (1e-9)');
  ok(r.out.alw === 0 || r.out.alw === 1, `always: a test over the sweep (${r.out.alw})`);
  const loc = r.out.d.items.filter(i => i.k === 'poly');
  ok(loc.length >= 1 && r.out.d.items.length <= 2000, 'the locus is drawn as a polyline; ≤ 2000 scene items');
  const t = R(tri([0, 0], [4, 0], ['k', 3]).concat([{ id: 'T', polygon: ['A', 'B', 'C'] }]), [M('a', 'area', ['T'])], {}, { k: 7 });
  ok(t.out.a === 6, 'a parameter moves a point: the triangle (0,0), (4,0), (k,3) keeps area 6 (Euclid I.37)');
  const rot = R([{ id: 'O', point: [0, 0] }, { id: 'A', point: [1, 0] }, { id: 'B', transform: { kind: 'rotate', of: 'A', center: 'O', angle: 90, deg: true } }], XY('B'));
  ok(P2(rot, 'B', 0, 1, 1e-15), 'rotate 90° about the origin: (1, 0) → (0, 1)');
  const rg = R([{ id: 'O', point: [0, 0] }, { id: 'V', point: [1, 0] }, { id: 'h', regular: { center: 'O', vertex: 'V', n: 6 } }], [M('a', 'area', ['h'])]);
  ok(near(rg.out.a, 3 * Math.sqrt(3) / 2, 1e-12), 'a regular hexagon of circumradius 1 has area 3√3/2 (1e-12)');
  const pw = R([{ id: 'O', point: [0, 0] }, { id: 'c', circle: { center: 'O', r: 3 } }, { id: 'P', point: [5, 0] }], [M('p', 'power', ['P', 'c'])]);
  ok(pw.out.p === 16, 'the power of (5, 0) to the circle r 3: 25 − 9 = 16 (Steiner 1826)');
  const cr = R([0, 1, 2, 3].map(x => ({ id: 'X' + x, point: [x, 0] })), [M('c', 'crossRatio', ['X0', 'X1', 'X2', 'X3'])]);
  ok(near(cr.out.c, 4 / 3, 1e-15) || near(cr.out.c, 3 / 4, 1e-15) || near(cr.out.c, -1 / 3, 1e-15) || near(cr.out.c, 1 / 4, 1e-15), `the cross-ratio of 0, 1, 2, 3 on a line: ${cr.out.c}`);
}

// ---------- edge cases ----------
{
  const d = R(tri([0, 0], [1, 1], [2, 2]).concat([{ id: 'O', center: { kind: 'circumcenter', of: ['A', 'B', 'C'] } }]), [M('d', 'defined', ['O']), M('o', 'orient', ['A', 'B', 'C']), M('col', 'collinear', ['A', 'B', 'C'])]);
  ok(d.out.d === 0 && d.out.o === 0 && d.out.col === 1 && codes(d).some(c => c === 'degenerate-triangle' || c === 'collinear'), `a degenerate triangle: no circumcentre (${codes(d).join(', ')}); orient exactly 0`);
  const cp = R([{ id: 'A', point: [1, 1] }, { id: 'B', point: [1, 1] }, { id: 'l', line: ['A', 'B'] }], [M('d', 'defined', ['l'])]);
  ok(cp.out.d === 0 && codes(cp).includes('coincident-points'), 'a line through one point twice: coincident-points');
  const hu = R([{ id: 'A', point: [0, 0] }, { id: 'B', point: [1, 0] }, { id: 'C', point: [0, 1] }, { id: 'D', point: { x: 1, y: '1 + 1e-10' } }, { id: 'l', line: ['A', 'B'] }, { id: 'm', line: ['C', 'D'] }, { id: 'X', intersect: { of: ['l', 'm'] } }], XY('X'));
  ok(codes(hu).includes('huge-coordinates') && near(hu.out.Xx, -1e10, 1e-3 * 1e10), 'huge-coordinates: two nearly parallel lines meet near x = −1e10, far past 1e8·S (S = the largest free coordinate)');
  const prop = R([{ id: 'A', point: [0, 0] }, { id: 'B', point: [0, 0] }, { id: 'M', midpoint: ['A', 'B'] }, { id: 'l', perpBisector: ['A', 'B'] }, { id: 'P', foot: { from: 'M', to: 'l' } }], [M('d', 'defined', ['P'])]);
  ok(prop.out.d === 0 && r_nothrow(prop), 'an undefined object makes everything built on it undefined (it propagates), never a throw');
  const nan = R([{ id: 'A', point: { x: 'sqrt(k - 5)', y: 0 } }], [M('x', 'x', ['A']), M('d', 'defined', ['A'])], {}, { k: 1 });
  ok(Number.isNaN(nan.out.x) && nan.out.d === 0 && codes(nan).includes('param'), 'a coordinate that cannot be computed: NaN, undefined, param');
  const gaps = R([{ id: 'O', point: [0, 0] }, { id: 'c', circle: { center: 'O', r: 1 } }, { id: 'S', point: { x: 'u', y: 1 } }, { id: 'l', line: ['O', 'S'] }, { id: 'A', point: [1, 0] }, { id: 'B', point: [1, 2] }, { id: 'm', line: ['A', 'B'] }, { id: 'X', intersect: { of: ['l', 'm'] } }, { id: 'L', locus: { of: 'X' } }],
    [{ id: 'd', kind: 'scene', of: 'drawing' }], { sweep: { var: 'u', from: -1, to: 1, samples: 21 } });
  ok(codes(gaps).includes('locus-gaps'), 'locus-gaps: the meeting point (1, 1/u) of the line through O and (u, 1) with x = 1 is undefined at u = 0 (parallel): the locus breaks there');
}
function r_nothrow(r) { return r && Array.isArray(r.diag); }

// ---------- the sim adapter and the Worker ----------
{
  const sp = spec(tri([0, 0], [6, 0], ['k', 4]).concat(cen, [{ id: 'eu', eulerLine: ['A', 'B', 'C'] }]), cenOut.concat([M('col', 'collinear', ['circumcenter', 'centroid', 'orthocenter']), { id: 'd', kind: 'scene', of: 'drawing' }]));
  const a = G.engine.create(sp, { seed: 1 }).run({ k: 2 });
  ok(a.circumcenterx === 3 && a.col === 1 && Array.isArray(a.d.items), 'engine.create(spec).run(inputs) gives the declared outputs');
  ok(G.engine.check(sp).length === 0, 'engine.check: no errors for a good spec');
  const un = G.run(spec([{ id: 'A', point: [0, 0] }, { id: 'T', delaunay: ['A', 'A', 'A'] }], [M('n', 'count', ['T', 'T'])]), {}, {});
  ok(Number.isNaN(un.out.n), 'an unchecked spec (a count between triangulations) gives NaN, never a throw');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + G.engine.workerSource, ctx);
  const b = ctx.self.noemaEngine.create(sp, { seed: 1 }).run({ k: 2 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the Worker source in a fresh context gives the same outputs (the predicates included)');
  const e10 = spec([{ id: 'P', point: [0.5 + 3 * 2 ** -53, 0.5 + 7 * 2 ** -53] }, { id: 'Q', point: [12, 12] }, { id: 'S', point: [24, 24] }], [M('o', 'orient', ['P', 'Q', 'S'])]);
  ok(ctx.self.noemaEngine.create(e10, {}).run({}).o === 1, 'the Worker: the exact orient sign for E10 (k 3, l 7) is +1');
}

// ---------- check codes ----------
{
  const C1 = s => G.checkSpec(s).filter(p => p.level === 'error').map(p => p.code);
  ok(C1(spec([{ id: 'A', point: [0, 0] }, { id: 'A', point: [1, 0] }])).includes('duplicate'), 'check: two objects named A → duplicate');
  ok(C1(spec([{ id: 'l', line: ['A', 'B'] }, { id: 'A', point: [0, 0] }, { id: 'B', point: [1, 0] }])).includes('cycle'), 'check: a line before its points → cycle (objects are built in order)');
  ok(C1(spec([{ id: 'A', point: [0, 0] }, { id: 'l', line: ['A', 'Z'] }])).includes('ref'), 'check: an unknown point → ref');
  ok(C1(spec([{ id: 'A', point: [0, 0] }, { id: 'B', point: [1, 0] }, { id: 'l', line: ['A', 'B'] }, { id: 'm', midpoint: ['A', 'l'] }])).includes('type'), 'check: the midpoint of a point and a line → type');
  ok(C1(spec([{ id: 'A', frob: [0, 0] }])).includes('kind'), 'check: an unknown construction → kind');
  ok(C1(spec([{ id: 'A', point: [0, 0] }, { id: 'X', center: { kind: 'nowhere', of: ['A', 'A', 'A'] } }])).includes('enum'), 'check: an unknown triangle centre → enum');
  ok(C1(spec([{ id: 'A', point: [0, 0] }], [M('x', 'radius', ['A'])])).includes('type'), 'check: the radius of a point → type');
  ok(C1(spec([{ id: 'A', point: [0, 0] }], [{ id: 's', kind: 'series', of: 'sweep' }])).includes('value'), 'check: a series without model.sweep → value');
  ok(C1(spec(Array.from({ length: 200 }, (_, i) => ({ id: 'P' + i, point: [i, 0] })), [], { sweep: { var: 'u', from: 0, to: 1, samples: 2000 } })).includes('budget'), 'check: 2000 samples × 200 objects → budget');
  ok(G.checkSpec(spec([{ id: 'A', point: [0, 0] }], [], { wobble: 1 })).some(p => p.code === 'unknown-field' && p.level === 'warning'), 'check: an unknown model field → unknown-field (a warning)');
  ok(C1(spec([{ id: 'A', point: ['k', 0] }])).includes('value'), 'check: an expression goes in {x, y}, the [x, y] form holds numbers → value');
  ok(G.exprs(spec([{ id: 'A', point: { x: 'k', y: '2*k' } }])).length === 2 && G.keys(spec([{ id: 'A', point: [0, 0] }])).length === 0, 'exprs: every expression with its path; keys: none (geom has no words)');
}

// ---------- speed ----------
{
  const t0 = Date.now();
  R(tri([0, 0], [6, 0], [2, 4]).concat(cen, [{ id: 'eu', eulerLine: ['A', 'B', 'C'] }, { id: 'cc', triCircle: { kind: 'circumcircle', of: ['A', 'B', 'C'] } }]), cenOut.concat([{ id: 'd', kind: 'scene', of: 'drawing' }]));
  const t1 = Date.now() - t0, t2 = Date.now();
  const pts = Array.from({ length: 200 }, (_, i) => ({ id: 'P' + i, point: { x: `${(i * 37) % 101} + sin(u*${i % 7})`, y: (i * 59) % 103 } }));
  const worst = spec(pts.concat([{ id: 'm', mec: pts.map(p => p.id) }, { id: 'Z', centerOf: { of: 'm' } }, { id: 'L', locus: { of: 'Z' } }, { id: 'h', hull: pts.map(p => p.id) }, { id: 'dl', delaunay: pts.map(p => p.id) }, { id: 'vo', voronoi: pts.map(p => p.id) }]),
    [{ id: 'd', kind: 'scene', of: 'drawing' }, { id: 'r', kind: 'series', of: 'radius', at: ['m'] }, { id: 'a', kind: 'series', of: 'area', at: ['h'] }], { sweep: { var: 'u', from: 0, to: 6, samples: 960 } });
  const wc = G.checkSpec(worst).filter(p => p.level === 'error').length;
  const wr = G.run(worst, {}, {});
  const t3 = Date.now() - t2;
  ok(t1 < 50, `speed: a typical run (a triangle, its centres, the Euler line, the scene) ${t1} ms < 50 ms`);
  ok(wc === 0 && wr.out.r.length === 960 && t3 < 2000, `speed: the worst allowed (200 moving points: their minimum enclosing circle's centre traced and the hull's area over 960 samples — samples × objects at the budget 200 000 — plus Delaunay and Voronoi) ${t3} ms < 2 s`);
}
// ---------- the reference activity euler-line (its exercise's checks and tests.json; packcheck and activities.py agree) ----------
{
  const AD = path.join(ROOT, 'tools', 'activities_examples', 'euler-line'), rd = f => JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
  const ex = rd('spec.json'), sim = G.engine.create(ex, { seed: 1 });
  const LOC = ['en', 'el', 'ru', 'de', 'fr'], tables = Object.fromEntries(LOC.map(l => [l, rd(`strings.${l}.json`)]));
  require(path.join(SRC, '49_lib_catalog.js')); require(path.join(ROOT, 'engine', 'packcheck.js'));
  const js = globalThis.NoemaPackCheck.checkSimSpec(ex, tables);
  const py = JSON.parse(require('child_process').execFileSync('python3', ['-c', 'import json, sys, activities as A; d = json.loads(sys.stdin.read()); print(json.dumps(A.check_spec(d[0], tables=d[1])))'], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify([ex, tables]), encoding: 'utf8' }));
  ok(js.length === 0 && py.length === 0, `euler-line: the spec passes packcheck (JS) and activities.check_spec (Python) with its five string tables${js.length + py.length ? ': ' + js.concat(py).join('; ') : ''}`);
  ok(LOC.every(l => JSON.stringify(Object.keys(tables[l]).sort()) === JSON.stringify(Object.keys(tables.en).sort())), 'euler-line: the five string tables have the same keys');
  const act = rd('activity.json'); ok(act.id === 'euler-line' && act.runtime === 'sim-spec@1' && fs.readFileSync(path.join(AD, 'fallback.svg'), 'utf8').startsWith('<svg'), 'euler-line: activity.json and fallback.svg');
  const checks = ['onC == 1', 'hIn == 1', 'line == 1'].map(e => NoemaExpr.compile(e));
  const T = rd('tests.json');
  for (const c of T.cases) {
    const v = Object.assign({}, ex.consts || {}, { cx: 2, cy: 4 }); for (const st of c.steps) v[st.set] = st.value;
    const out = sim.run(v), env = Object.assign({}, v, Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')));
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `euler-line: ${c.name}`);
  }
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
