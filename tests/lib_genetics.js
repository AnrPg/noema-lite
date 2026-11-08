/* genetics@1 (src/engines/genetics/genetics.js, docs/library/genetics.md) against published and exactly derived values:
   1. crosses: Mendel's ratios and χ² (Mendel 1866), epistasis presets, ABO, lethal yellow (Castle & Little 1910), X-linkage,
      linkage and three-point coincidence; 2. pedigrees (Bayes carrier risks); 3. Hardy–Weinberg, the exact test (Wigginton 2005)
      against brute-force enumeration; 4. selection, mutation, migration; 5. drift: Kimura 1962, Moran 1958, H decay (statistical,
      ±3 SE), the binomial sampler; 6. map functions (Haldane 1919, Kosambi 1944), three-point cross; 7. coalescent (Kingman 1982,
      Watterson 1975, Tajima 1989); 8. LD; 9. quantitative genetics; 10. codes, adapter, Worker source, speed.
   Usage: node tests/lib_genetics.js */
'use strict';
const path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibCore = ENGINES.kernel('core'), NoemaLibGenetics = ENGINES.mod('genetics@1');
const G = NoemaLibGenetics, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const spec = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'genetics@1', params: [{ id: 'k', kind: 'slider', label: 'k', min: 0, max: 1, default: 0.5 }], model, outputs: outs.map(([id, kind, of, arg]) => ({ id, kind, of, ...(arg !== undefined ? { arg } : {}) })) });
const run = (s, env, seed) => G.run(s, env || {}, { seed: seed || 1 });
const cleanCheck = s => G.checkSpec(s).filter(p => p.level === 'error');
const L2 = (id, a, b, x) => ({ id, alleles: [a, b], ...(x || {}) });
const het = (...ids) => Object.fromEntries(ids.map(([id, a, b]) => [id, [a, b]]));

ok(G.id === 'genetics@1' && Object.isFrozen(G) && G.engine.id === 'genetics@1' && typeof G.engine.workerSource === 'string', 'NoemaLibGenetics: id, frozen API, engine with workerSource');

// ---------- 1. crosses ----------
{
  const tri = { mode: 'cross', loci: [L2('A', 'A', 'a'), L2('B', 'B', 'b'), L2('C', 'C', 'c')], p1: het(['A', 'A', 'a'], ['B', 'B', 'b'], ['C', 'C', 'c']), p2: het(['A', 'A', 'a'], ['B', 'B', 'b'], ['C', 'C', 'c']) };
  const s = spec(tri, [['n', 'scalar', 'nClasses'], ['g', 'scalar', 'nGenotypes'], ['r', 'series', 'ratios'], ['ga', 'scalar', 'nGametes1'], ['pq', 'scene', 'punnett']]);
  const o = run(s).out;
  ok(cleanCheck(s).length === 0 && o.n === 8 && o.g === 27 && o.ga === 8 && JSON.stringify(o.r) === '[27,9,9,9,3,3,3,1]', `G1 trihybrid AaBbCc × AaBbCc: 27:9:9:9:3:3:3:1, 27 genotypes, 8 gametes (Mendelian product rule): ${o.r}`);
  ok(o.pq.items.filter(i => i.k === 'poly').length === 64, 'the Punnett square of a trihybrid has 8 × 8 = 64 cells');
}
{
  const dih = { mode: 'cross', loci: [L2('A', 'A', 'a'), L2('B', 'B', 'b')], p1: het(['A', 'A', 'a'], ['B', 'B', 'b']), p2: het(['A', 'A', 'a'], ['B', 'B', 'b']) };
  const tc = { ...dih, p2: het(['A', 'a', 'a'], ['B', 'b', 'b']) };
  const want = { none: ['9:3:3:1', '1:1:1:1'], recessive: ['9:3:4', '1:1:2'], dominant: ['12:3:1', '2:1:1'], duplicateRecessive: ['9:7', '1:3'], duplicateDominant: ['15:1', '3:1'], dominantSuppression: ['13:3', '3:1'], cumulative: ['9:6:1', '1:2:1'] };
  const got = {};
  for (const t of Object.keys(want)) {
    const r1 = run(spec({ ...dih, epistasis: { a: 'A', b: 'B', type: t } }, [['r', 'series', 'ratios']])).out.r.join(':');
    const r2 = run(spec({ ...tc, epistasis: { a: 'A', b: 'B', type: t } }, [['r', 'series', 'ratios']])).out.r.join(':');
    got[t] = [r1, r2];
  }
  ok(Object.keys(want).every(t => got[t][0] === want[t][0] && got[t][1] === want[t][1]), `G2 epistasis presets F2 / test cross (Griffiths et al. ch. 6): ${Object.keys(want).map(t => t + ' ' + got[t].join(' & ')).join('; ')}`);
  const cu = run(spec({ ...dih, epistasis: { a: 'A', b: 'B', type: 'custom', classes: [0, 1, 1, 0] } }, [['r', 'series', 'ratios']])).out.r.join(':');
  ok(cu === '5:3', `custom epistasis (A_B_ and aabb alike, the single dominants alike): ${cu} (10:6 in lowest terms)`);
  const chi = run(spec({ ...dih, observed: [315, 108, 101, 32] }, [['c', 'scalar', 'chi2'], ['p', 'scalar', 'pValue'], ['d', 'scalar', 'df']])).out;
  ok(near(chi.c, 0.4700, 5e-4) && near(chi.p, 0.9254, 5e-4) && chi.d === 3, `G3 Mendel 1866 dihybrid 315:108:101:32 vs 9:3:3:1: χ² = ${chi.c.toFixed(4)} (0.4700), p = ${chi.p.toFixed(4)} (0.925), df 3`);
  const f = run(spec({ ...dih }, [['x', 'scalar', 'frac', 'A_ b/b'], ['y', 'scalar', 'frac', 'a/a _'], ['z', 'scalar', 'frac', 'A/a B/b']])).out;
  ok(near(f.x, 3 / 16, 1e-12) && near(f.y, 1 / 4, 1e-12) && near(f.z, 1 / 4, 1e-12), 'genotype patterns: P(A_ bb) = 3/16, P(aa) = 1/4, P(AaBb) = 1/4');
}
{
  const mono = { mode: 'cross', loci: [L2('R', 'R', 'r')], p1: het(['R', 'R', 'r']), p2: het(['R', 'R', 'r']), observed: [5474, 1850] };
  const o = run(spec(mono, [['c', 'scalar', 'chi2'], ['p', 'scalar', 'pValue'], ['r', 'series', 'ratios']])).out;
  ok(near(o.c, 0.2629, 5e-4) && near(o.p, 0.6081, 5e-4) && o.r.join(':') === '3:1', `G4 Mendel 5474 round : 1850 wrinkled vs 3:1: χ² = ${o.c.toFixed(4)} (0.2629), p = ${o.p.toFixed(4)} (0.608)`);
  const inc = run(spec({ ...mono, observed: undefined, loci: [L2('R', 'R', 'r', { dominance: 'incomplete' })] }, [['r', 'series', 'ratios']])).out.r.join(':');
  ok(inc === '2:1:1', `incomplete dominance (snapdragon): 1 RR : 2 Rr : 1 rr, listed by size as 2:1:1 (${inc})`);
}
{
  const s = spec({ mode: 'cross', loci: [{ id: 'Y', alleles: ['Ay', 'a'], lethal: [{ genotype: ['Ay', 'Ay'] }] }], p1: { Y: ['Ay', 'a'] }, p2: { Y: ['Ay', 'a'] } }, [['r', 'series', 'ratios'], ['s', 'scalar', 'survival']]);
  const o = run(s).out;
  ok(o.r.join(':') === '2:1' && near(o.s, 0.75, 1e-12), `G5 yellow mouse Ay a × Ay a (Ay Ay lethal; Castle & Little 1910): 2:1, survival 3/4 (${o.r.join(':')})`);
  const semi = run({ ...s, model: { ...s.model, loci: [{ id: 'Y', alleles: ['Ay', 'a'], lethal: [{ genotype: ['Ay', 'Ay'], viability: 'k' }] }] } }, { k: 0.5 }).out;
  ok(near(semi.s, 0.875, 1e-12), 'a semi-lethal genotype with viability k = ½: survival 7/8');
  const all = run(spec({ mode: 'cross', loci: [{ id: 'Y', alleles: ['Ay'], lethal: [{ genotype: ['Ay', 'Ay'] }] }], p1: { Y: ['Ay', 'Ay'] }, p2: { Y: ['Ay', 'Ay'] } }, [['s', 'scalar', 'survival'], ['n', 'scalar', 'nClasses']]));
  ok(all.out.s === 0 && all.codes.includes('all-lethal'), 'every offspring lethal → survival 0 and the code all-lethal (no division by 0)');
}
{
  const s = spec({ mode: 'cross', loci: [{ id: 'ABO', alleles: ['IA', 'IB', 'i'], codominant: [['IA', 'IB']] }], p1: { ABO: ['IA', 'i'] }, p2: { ABO: ['IB', 'i'] } }, [['n', 'scalar', 'nClasses'], ['r', 'series', 'ratios'], ['o', 'scalar', 'frac', 'i/i'], ['ab', 'scalar', 'frac', 'IA/IB']]);
  const o = run(s).out;
  ok(o.n === 4 && o.r.join(':') === '1:1:1:1' && near(o.o, 0.25, 1e-12) && near(o.ab, 0.25, 1e-12), 'ABO: IA i × IB i gives A, B, AB, O 1:1:1:1 (codominant IA–IB, both dominant over i)');
}
{
  const x = { mode: 'cross', loci: [{ id: 'W', alleles: ['Wp', 'w'], chrom: 'X' }], p1: { W: ['Wp', 'w'] }, p2: { W: ['w'] } };
  const o = run(spec(x, [['m', 'scalar', 'frac', 'm: w/'], ['f', 'scalar', 'frac', 'f: w/w'], ['all', 'scalar', 'frac', 'w/'], ['g', 'scalar', 'nGenotypes']])).out;
  ok(near(o.m, 0.5, 1e-12) && near(o.f, 0.5, 1e-12) && near(o.all, 0.25, 1e-12) && o.g === 4, 'X-linked (Drosophila white, Morgan 1910): X+Xw × XwY → ½ of sons and ½ of daughters white; 4 genotypes');
  const cc = run(spec({ ...x, p1: { W: ['w', 'w'] }, p2: { W: ['Wp'] } }, [['m', 'scalar', 'frac', 'm: w/'], ['f', 'scalar', 'frac', 'f: Wp_']])).out;
  ok(cc.m === 1 && cc.f === 1, 'criss-cross: XwXw × X+Y → every son white, every daughter wild type');
  const z = run(spec({ mode: 'cross', loci: [{ id: 'S', alleles: ['S', 's'], chrom: 'Z' }], p1: { S: ['s'] }, p2: { S: ['S', 'S'] } }, [['m', 'scalar', 'frac', 'm: S_'], ['f', 'scalar', 'frac', 'f: S/']])).out;
  ok(z.m === 1 && z.f === 1, 'Z-linked (birds, ZW females): ZsW × ZSZS → every son and daughter carries S');
}
{
  const lk = { mode: 'cross', loci: [L2('A', 'A', 'a'), L2('B', 'B', 'b')], p1: het(['A', 'A', 'a'], ['B', 'B', 'b']), p2: het(['A', 'a', 'a'], ['B', 'b', 'b']), linkage: [{ a: 'A', b: 'B', r: 'k' }] };
  const o = run(spec(lk, [['x', 'scalar', 'frac', 'A/a b/b'], ['y', 'scalar', 'frac', 'A/a B/b']]), { k: 0.2 }).out;
  ok(near(o.x, 0.1, 1e-12) && near(o.y, 0.4, 1e-12), 'linkage in coupling AB/ab × ab/ab, r = 0.2: recombinant Aabb 0.1, parental AaBb 0.4');
  const rp = run(spec({ ...lk, p1: { A: ['A', 'a'], B: ['b', 'B'] } }, [['x', 'scalar', 'frac', 'A/a b/b']]), { k: 0.2 }).out;
  ok(near(rp.x, 0.4, 1e-12), 'repulsion Ab/aB: Aabb is now parental (0.4) — the phase comes from the order of the alleles');
  const bad = run(spec(lk, [['x', 'scalar', 'frac', 'A/a b/b'], ['v', 'scalar', 'valid']]), { k: 0.7 });
  ok(Number.isNaN(bad.out.x) && bad.out.v === 0 && bad.codes.includes('r-range'), 'r = 0.7 → NaN, valid 0, code r-range (a recombination fraction is at most ½)');
  // three-point: a–b–c with r1 0.1, r2 0.2, c 0.5 → DCO 0.01; test cross of abc/ABC
  const tp = { mode: 'cross', loci: [L2('A', 'A', 'a'), L2('B', 'B', 'b'), L2('C', 'C', 'c')], p1: het(['A', 'A', 'a'], ['B', 'B', 'b'], ['C', 'C', 'c']), p2: het(['A', 'a', 'a'], ['B', 'b', 'b'], ['C', 'c', 'c']), linkage: [{ a: 'A', b: 'B', r: 0.1 }, { a: 'B', b: 'C', r: 0.2 }], coincidence: 0.5 };
  const t = run(spec(tp, [['d', 'scalar', 'frac', 'A/a b/b C/c'], ['p', 'scalar', 'frac', 'A/a B/b C/c']])).out;
  ok(near(t.d, 0.005, 1e-12) && near(t.p, (1 - 0.1 - 0.2 + 0.01) / 2, 1e-12), 'three linked loci with coincidence 0.5: each double-crossover class 0.005, each parental 0.355');
  const tooC = run(spec({ ...tp, coincidence: 30 }, [['d', 'scalar', 'frac', 'A/a b/b C/c']]));
  ok(Number.isNaN(tooC.out.d) && tooC.codes.includes('coincidence-range'), 'a coincidence that makes a class negative → NaN and the code coincidence-range');
}
{
  const ob = run(spec({ mode: 'cross', loci: [L2('A', 'A', 'a')], p1: het(['A', 'A', 'a']), p2: het(['A', 'A', 'a']), observed: [3, 1, 1] }, [['c', 'scalar', 'chi2'], ['v', 'scalar', 'valid']]));
  ok(Number.isNaN(ob.out.c) && ob.out.v === 0 && ob.codes.includes('observed-classes'), 'observed counts for 3 classes of a 2-class cross → χ² NaN, code observed-classes');
  const small = run(spec({ mode: 'cross', loci: [L2('A', 'A', 'a')], p1: het(['A', 'A', 'a']), p2: het(['A', 'A', 'a']), observed: [6, 2] }, [['m', 'scalar', 'minExpected']]));
  ok(small.out.m === 2 && small.codes.includes('expected-below-5'), 'an expected count below 5 is reported (Cochran): code expected-below-5');
  const big = run(spec({ mode: 'cross', loci: ['A', 'B', 'C', 'D'].map(x => L2(x, x, x.toLowerCase())), p1: Object.fromEntries(['A', 'B', 'C', 'D'].map(x => [x, [x, x.toLowerCase()]])), p2: Object.fromEntries(['A', 'B', 'C', 'D'].map(x => [x, [x, x.toLowerCase()]])) }, [['pq', 'scene', 'punnett'], ['n', 'scalar', 'nClasses']]));
  ok(big.out.pq.items.length === 0 && big.codes.includes('punnett-large') && big.out.n === 16, 'four loci (16 × 16 gametes): no Punnett drawing (code punnett-large), the 16 classes still computed');
}

// ---------- 2. pedigrees ----------
{
  const fam = { mode: 'pedigree', inheritance: 'AR', q: 1e-6, people: [{ id: 'F', sex: 'm', affected: false }, { id: 'M', sex: 'f', affected: false }, { id: 'A', sex: 'm', mother: 'M', father: 'F', affected: true }, { id: 'U', sex: 'f', mother: 'M', father: 'F', affected: false }, { id: 'X', sex: 'u', mother: 'M', father: 'F' }] };
  const o = run(spec(fam, [['c', 'scalar', 'carrier', 'U'], ['f', 'scalar', 'carrier', 'F'], ['x', 'scalar', 'affectedProb', 'X'], ['pd', 'scene', 'pedigree']])).out;
  ok(near(o.c, 2 / 3, 1e-5) && near(o.f, 1, 1e-5) && near(o.x, 0.25, 1e-5), `AR: unaffected sib of an affected child is a carrier with 2/3 (${o.c.toFixed(5)}); parents obligate carriers; next child's risk 1/4`);
  ok(o.pd.items.some(i => i.k === 'circ' && i.fill) === false && o.pd.items.some(i => i.k === 'poly' && i.fill), 'the drawing: the affected son is a filled square, the unaffected women open circles');
  const xr = run(spec({ mode: 'pedigree', inheritance: 'XR', q: 1e-6, people: [{ id: 'F', sex: 'm', affected: false }, { id: 'M', sex: 'f', affected: false }, { id: 'S', sex: 'm', mother: 'M', father: 'F', affected: true }, { id: 'D', sex: 'f', mother: 'M', father: 'F', affected: false }, { id: 'S2', sex: 'm', mother: 'M', father: 'F' }] }, [['m', 'scalar', 'carrier', 'M'], ['d', 'scalar', 'carrier', 'D'], ['s2', 'scalar', 'affectedProb', 'S2']])).out;
  ok(near(xr.m, 1, 1e-5) && near(xr.d, 0.5, 1e-5) && near(xr.s2, 0.5, 1e-5), 'XR: the mother of an affected son is a carrier (no new mutations); his sister ½; a next son affected with ½');
  const pen = run(spec({ mode: 'pedigree', inheritance: 'AD', q: 1e-6, penetrance: 0.8, people: [{ id: 'G', sex: 'm', affected: true }, { id: 'W', sex: 'f', affected: false }, { id: 'P', sex: 'f', mother: 'W', father: 'G', affected: false }] }, [['p', 'scalar', 'carrier', 'P']])).out;
  ok(near(pen.p, 0.1 / 0.6, 1e-5), `AD with penetrance 0.8: an unaffected child of an affected parent carries with 0.5·0.2/(0.5·0.2 + 0.5) = 1/6 (${pen.p.toFixed(5)})`);
  const inc = run(spec({ mode: 'pedigree', inheritance: 'AD', q: 0, people: [{ id: 'F', sex: 'm', affected: false }, { id: 'M', sex: 'f', affected: false }, { id: 'C', sex: 'm', mother: 'M', father: 'F', affected: true }] }, [['c', 'scalar', 'consistent'], ['p', 'scalar', 'carrier', 'C']]));
  ok(inc.out.c === 0 && Number.isNaN(inc.out.p) && inc.codes.includes('inconsistent'), 'AD, full penetrance, no new alleles: an affected child of unaffected parents is inconsistent → L = 0, NaN, code inconsistent');
  const mt = run(spec({ mode: 'pedigree', inheritance: 'mt', q: 1e-6, people: [{ id: 'F', sex: 'm', affected: true }, { id: 'M', sex: 'f', affected: false }, { id: 'C', sex: 'f', mother: 'M', father: 'F' }] }, [['c', 'scalar', 'affectedProb', 'C']])).out;
  ok(mt.c < 1e-5, 'mitochondrial: an affected father does not transmit (risk ≈ 0)');
}

// ---------- 3. Hardy–Weinberg ----------
{
  const o = run(spec({ mode: 'hw', freqs: [0.3, 0.1, 0.6] }, [['A', 'scalar', 'geno', '0/0'], ['AO', 'scalar', 'geno', '0/2'], ['B', 'scalar', 'geno', '1/1'], ['BO', 'scalar', 'geno', '1/2'], ['AB', 'scalar', 'geno', '0/1'], ['O', 'scalar', 'geno', '2/2']])).out;
  ok(near(o.A + o.AO, 0.45, 1e-12) && near(o.B + o.BO, 0.13, 1e-12) && near(o.AB, 0.06, 1e-12) && near(o.O, 0.36, 1e-12), 'G8 ABO p = 0.3, q = 0.1, r = 0.6: A 0.45, B 0.13, AB 0.06, O 0.36');
  const f = run(spec({ mode: 'hw', freqs: [0.5, 0.5], F: 0.25 }, [['h', 'scalar', 'het'], ['aa', 'scalar', 'geno', '0/0']])).out;
  ok(near(f.h, 0.375, 1e-12) && near(f.aa, 0.3125, 1e-12), 'inbreeding F = ¼ (full sibs): het 2pq(1 − F) = 0.375, AA p² + Fpq = 0.3125 (Wright 1922)');
  const x = run(spec({ mode: 'hw', freqs: [0.08, 0.92], chrom: 'X' }, [['m', 'scalar', 'male', 0], ['r', 'scalar', 'xRatio', 0]])).out;
  ok(near(x.m, 0.08, 1e-12) && near(x.r, 12.5, 1e-9), 'X-linked recessive at q = 0.08: males 8 %, females 0.64 % → 12.5 times more males affected (1/q)');
  const t = run(spec({ mode: 'hw', freqs: [0.5, 0.5], counts: [30, 40, 30] }, [['c', 'scalar', 'chi2'], ['p', 'scalar', 'pChi2'], ['e', 'scalar', 'pExact'], ['fh', 'scalar', 'Fhat']])).out;
  ok(near(t.c, 4, 1e-12) && near(t.p, 0.0455, 1e-4) && near(t.fh, 0.2, 1e-12), `30 : 40 : 30 → χ² = 4 (1 df, p = ${t.p.toFixed(4)}), F̂ = 0.2`);
  // the exact test against brute-force enumeration of P(nAB | n, nA) = n! 2^nAB nA! nB! / (nAA! nAB! nBB! (2n)!) (Levene 1949)
  const lf = G.logFact, brute = (a, b, d) => { const N = a + b + d, nA = 2 * a + b, nB = 2 * d + b, pr = h => { const x = (nA - h) / 2, y = (nB - h) / 2; return Math.exp(lf(N) + h * Math.LN2 + lf(nA) + lf(nB) - lf(x) - lf(h) - lf(y) - lf(2 * N)); }; const po = pr(b); let s = 0; for (let h = nA % 2; h <= Math.min(nA, nB); h += 2) { const v = pr(h); if (v <= po * (1 + 1e-9)) s += v; } return s; };
  const cases = [[30, 40, 30], [10, 0, 10], [0, 50, 0], [57, 14, 3], [1, 2, 97], [50, 50, 0]];
  let worst = 0; for (const c of cases) worst = Math.max(worst, Math.abs(G.hweExact(...c) - brute(...c)));
  ok(worst < 1e-12, `the exact HWE test (Wigginton et al. 2005) = brute-force enumeration on ${cases.length} samples (max |Δ| = ${worst.toExponential(1)}); 30:40:30 p = ${G.hweExact(30, 40, 30).toFixed(5)}`);
  const mono = run(spec({ mode: 'hw', freqs: [0.5, 0.5], counts: [20, 0, 0] }, [['c', 'scalar', 'chi2'], ['e', 'scalar', 'pExact']]));
  ok(Number.isNaN(mono.out.c) && mono.out.e === 1 && mono.codes.includes('monomorphic'), 'a monomorphic sample: χ² not applicable (NaN, code monomorphic), exact p = 1');
  const bad = run(spec({ mode: 'hw', freqs: [0.5, 0.6] }, [['h', 'scalar', 'het'], ['v', 'scalar', 'valid']]));
  ok(Number.isNaN(bad.out.h) && bad.out.v === 0 && bad.codes.includes('freq-sum'), 'allele frequencies that do not sum to 1 → NaN and the code freq-sum');
}

// ---------- 4. selection ----------
{
  const o = run(spec({ mode: 'selection', p0: 0.5, w11: 1, w12: 1, w22: 0, gens: 10 }, [['q', 'scalar', 'qFinal']])).out;
  ok(near(o.q, 1 / 12, 1e-12), `G10 recessive lethal q0 = ½: q10 = q0/(1 + 10 q0) = 1/12 (${o.q.toFixed(6)})`);
  const g98 = run(spec({ mode: 'selection', p0: 0.5, w11: 1, w12: 1, w22: 0, gens: 98 }, [['q', 'scalar', 'qFinal']])).out;
  ok(near(g98.q, 0.01, 1e-12), 'from q = 0.5 to 0.01 takes t = 1/q_t − 1/q_0 = 98 generations');
  const h = run(spec({ mode: 'selection', p0: 0.05, w11: 0.9, w12: 1, w22: 0.2, gens: 2000 }, [['p', 'scalar', 'pFinal'], ['e', 'scalar', 'pEq'], ['s', 'scalar', 'eqStable']])).out;
  ok(near(h.e, 8 / 9, 1e-12) && h.s === 1 && near(h.p, 8 / 9, 1e-9), 'G11 heterozygote advantage (0.9, 1, 0.2): p̂ = t/(s + t) = 8/9, stable; reached from p = 0.05');
  const u = run(spec({ mode: 'selection', p0: 0.5, w11: 1.1, w12: 1, w22: 1.2, gens: 200 }, [['e', 'scalar', 'pEq'], ['s', 'scalar', 'eqStable'], ['p', 'scalar', 'pFinal']])).out;
  ok(near(u.e, 2 / 3, 1e-12) && u.s === 0 && u.p < 1e-6, 'underdominance (1.1, 1, 1.2): p̂ = 2/3 unstable; from p = 0.5 the population loses A');
  const ms = run(spec({ mode: 'selection', p0: 1, w11: 1, w12: 1, w22: 0.9, mu: 1e-5, gens: 100000 }, [['q', 'scalar', 'qFinal']])).out;
  ok(near(ms.q, Math.sqrt(1e-5 / 0.1), 2e-4), `mutation–selection balance, recessive (Haldane 1927): q̂ ≈ √(μ/s) = 0.0100 (${ms.q.toFixed(5)})`);
  const mig = run(spec({ mode: 'selection', p0: 0, m: 0.1, pm: 1, gens: 10 }, [['p', 'scalar', 'pFinal']])).out;
  ok(near(mig.p, 1 - Math.pow(0.9, 10), 1e-12), 'one-way migration: p_t − p_m = (1 − m)^t (p_0 − p_m)');
  const mut = run(spec({ mode: 'selection', p0: 1, mu: 1e-3, nu: 4e-3, gens: 20000 }, [['p', 'scalar', 'pFinal']])).out;
  ok(near(mut.p, 0.8, 1e-9), 'reversible mutation: p̂ = ν/(μ + ν) = 0.8');
  const bad = run(spec({ mode: 'selection', p0: 1.2 }, [['p', 'scalar', 'pFinal']]));
  ok(Number.isNaN(bad.out.p) && bad.codes.includes('prob-range'), 'p0 = 1.2 → NaN and the code prob-range');
}

// ---------- 5. drift ----------
{
  ok(near(G.kimuraU(100, 0.02, 0.5, 0.005), 0.020171, 1e-6), `G12 Kimura 1962: N = 100, genic s (het advantage 0.01), new mutant: u = ${G.kimuraU(100, 0.02, 0.5, 0.005).toFixed(6)} (0.020171; Haldane's 2s = 0.02)`);
  ok(near(G.kimuraU(100, 0.02, 0.5, 0.005), G.kimuraU(100, 0.02, 0.5000001, 0.005), 1e-6), 'the general-dominance integral (Simpson) agrees with the closed form at h = ½');
  ok(G.kimuraU(100, 0, 0.5, 0.3) === 0.3 && G.kimuraU(1e5, 0.1, 0.5, 0.5) === 1 - Math.exp(-1e4) && G.kimuraU(1e5, -0.1, 0.5, 0.5) === 0 && G.kimuraU(50, 0.1, 0.5, 0) === 0 && G.kimuraU(50, 0.1, 0.5, 1) === 1, 'Kimura edge cases: s = 0 → p; huge |4Ns| without overflow; p = 0 → 0, p = 1 → 1');
  const rec = G.kimuraU(100, 0.02, 0, 0.005), dom = G.kimuraU(100, 0.02, 1, 0.005);
  ok(rec < 0.6 * 0.02 && dom > 1.5 * 0.02, `dominance matters: a new recessive beneficial allele fixes with ${rec.toFixed(4)}, a dominant one with ${dom.toFixed(4)}`);
  const mo = run(spec({ mode: 'drift', process: 'moran', N: 10, p0: 0.1, s: 0.1, reps: 2000, gens: 10 }, [['u', 'scalar', 'uTheory']])).out;
  ok(near(mo.u, 0.147950, 1e-6), `G13 Moran 1958, N = 10, r = 1.1, one mutant: ρ = ${mo.u.toFixed(6)} (0.147950)`);
  const N = 50, reps = 2000, Gn = 100;
  const d = run(spec({ mode: 'drift', N, p0: 0.5, reps, gens: Gn }, [['h', 'scalar', 'meanH'], ['ht', 'scalar', 'hTheory'], ['hs', 'series', 'meanHs'], ['f', 'scalar', 'fixed'], ['l', 'scalar', 'lost'], ['mp', 'scalar', 'meanP']]), {}, 7).out;
  ok(near(d.ht, 0.5 * 0.366032, 1e-6), `G14 E[H_t] = H_0 (1 − 1/2N)^t: N = 50, t = 100 → ${d.ht.toFixed(6)} (= ½ · 0.99^100)`);
  // the SE of mean 2pq over replicates: a conservative bound sd ≤ 0.5
  ok(Math.abs(d.h - d.ht) < 3 * 0.25 / Math.sqrt(reps) && Math.abs(d.mp - 0.5) < 3 * 0.5 / Math.sqrt(reps) && Math.abs(d.f - d.l) < 0.06, `seeded WF, ${reps} replicates: mean H ${d.h.toFixed(4)} vs ${d.ht.toFixed(4)}, mean p ${d.mp.toFixed(4)} vs 0.5 (±3 SE), fixed ${d.f} ≈ lost ${d.l}`);
  const nf = run(spec({ mode: 'drift', N: 20, p0: 0.025, reps: 400, gens: 500 }, [['f', 'scalar', 'fixed'], ['u', 'scalar', 'uNeutral']]), {}, 3).out;
  ok(Math.abs(nf.f - 0.025) < 3 * Math.sqrt(0.025 * 0.975 / 400), `neutral fixation probability = p0: ${nf.f} vs 0.025 (±3 SE, 400 replicates, N = 20)`);
  const sel = run(spec({ mode: 'drift', N: 100, p0: 0.005, s: 0.02, reps: 2000, gens: 100 }, [['f', 'scalar', 'fixed'], ['u', 'scalar', 'uTheory'], ['seg', 'scalar', 'segregating']]), {}, 11).out;
  ok(sel.f + sel.seg >= sel.u - 3 * Math.sqrt(sel.u / 2000) && sel.f <= sel.u + 3 * Math.sqrt(sel.u / 2000) + 0.02, `WF with selection: fixed ${sel.f}, still segregating ${sel.seg}, Kimura u ${sel.u.toFixed(4)} — consistent within 3 SE`);
  const a = run(spec({ mode: 'drift', N: 30, p0: 0.5, reps: 50, gens: 60 }, [['r', 'series', 'rep', 3]]), {}, 5).out.r, b = run(spec({ mode: 'drift', N: 30, p0: 0.5, reps: 50, gens: 60 }, [['r', 'series', 'rep', 3]]), {}, 5).out.r, c2 = run(spec({ mode: 'drift', N: 30, p0: 0.5, reps: 50, gens: 60 }, [['r', 'series', 'rep', 3]]), {}, 6).out.r;
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c2) && a.length === 61, 'seeded: the same seed gives the same replicate, another seed another one');
  const tk = run(spec({ mode: 'drift', N: 100, p0: 0.005 }, [['t', 'scalar', 'tFix']])).out;
  ok(near(tk.t, -400 * 0.995 * Math.log(0.995) / 0.005, 1e-9) && tk.t > 395 && tk.t < 400, `Kimura & Ohta 1969: a new neutral mutant fixes after ≈ 4N generations (${tk.t.toFixed(1)})`);
  const bud = run(spec({ mode: 'drift', N: 100, p0: 0.5, reps: 2001, gens: 100 }, [['f', 'scalar', 'fixed'], ['v', 'scalar', 'valid']]));
  ok(Number.isNaN(bud.out.f) && bud.out.v === 0 && bud.codes.includes('budget'), 'replicates × generations > 200 000 → NaN and the code budget');
  const rnd = run(spec({ mode: 'drift', N: 10, p0: 0.33, reps: 5, gens: 5 }, [['u', 'scalar', 'uNeutral']]));
  ok(rnd.codes.includes('p0-rounded') && rnd.out.u === 0.35, 'p0 = 0.33 of 2N = 20 copies is rounded to 7/20 (code p0-rounded)');
  // the binomial sampler: mean, variance and a χ² goodness of fit against the exact pmf (BTRS region n·p ≥ 10)
  const r = C.mulberry32(99), nB = 1000, pB = 0.3, K = 20000, cnt = new Map(); let s1 = 0, s2 = 0;
  for (let i = 0; i < K; i++) { const k = G.binomial(r, nB, pB); s1 += k; s2 += k * k; cnt.set(k, (cnt.get(k) || 0) + 1); }
  const mean = s1 / K, vr = s2 / K - mean * mean;
  let chi = 0, df = -1; const pmf = k => Math.exp(G.logFact(nB) - G.logFact(k) - G.logFact(nB - k) + k * Math.log(pB) + (nB - k) * Math.log(1 - pB));
  let lo = 0, acc = 0; const bins = []; let cur = { e: 0, o: 0 };
  for (let k = 0; k <= nB; k++) { cur.e += K * pmf(k); cur.o += cnt.get(k) || 0; if (cur.e >= 20) { bins.push(cur); cur = { e: 0, o: 0 }; } }
  bins[bins.length - 1].e += cur.e; bins[bins.length - 1].o += cur.o; void lo; void acc;
  for (const bn of bins) { chi += (bn.o - bn.e) ** 2 / bn.e; df++; }
  const pv = G.chi2Sf(chi, df);
  ok(Math.abs(mean - 300) < 3 * Math.sqrt(210 / K) && Math.abs(vr - 210) < 12 && pv > 0.001, `Binomial(1000, 0.3) by BTRS (Hörmann 1993): mean ${mean.toFixed(2)} (300), var ${vr.toFixed(1)} (210), χ² fit p = ${pv.toFixed(3)} over ${df + 1} bins`);
  let sm = 0; for (let i = 0; i < K; i++) sm += G.binomial(r, 20, 0.1); ok(Math.abs(sm / K - 2) < 3 * Math.sqrt(1.8 / K) && G.binomial(r, 10, 0) === 0 && G.binomial(r, 10, 1) === 10, 'Binomial(20, 0.1) by inversion: mean 2; p = 0 → 0, p = 1 → n');
}

// ---------- 6. map ----------
{
  const o = run(spec({ mode: 'map', r: 0.2, d: 25.541281 }, [['h', 'scalar', 'haldane'], ['k', 'scalar', 'kosambi'], ['rh', 'scalar', 'rHaldane']])).out;
  ok(near(o.h, 25.541, 1e-3) && near(o.k, 21.182, 1e-3) && near(o.rh, 0.2, 1e-7), `G6 r = 0.2: Haldane 1919 ${o.h.toFixed(3)} cM (25.541), Kosambi 1944 ${o.k.toFixed(3)} cM (21.182); inverse back to 0.2`);
  ok(near(G.rKosambi(G.kosambi(0.37)), 0.37, 1e-12) && G.haldane(0.5) === Infinity && Number.isNaN(G.haldane(0.6)), 'Kosambi round trip; r = ½ → unlinked (∞); r > ½ → NaN');
  const ra = 0.1, rb = 0.15, dk = G.kosambi(ra) + G.kosambi(rb);
  ok(near(G.rKosambi(dk), (ra + rb) / (1 + 4 * ra * rb), 1e-12) && near(G.rHaldane(G.haldane(ra) + G.haldane(rb)), ra + rb - 2 * ra * rb, 1e-12), 'map additivity: Kosambi r_AC = (r1 + r2)/(1 + 4r1r2), Haldane r1 + r2 − 2r1r2');
  const tp = { mode: 'map', threePoint: { loci: ['a', 'b', 'c'], classes: [{ alleles: [0, 0, 0], n: 355 }, { alleles: [1, 1, 1], n: 355 }, { alleles: [1, 0, 0], n: 45 }, { alleles: [0, 1, 1], n: 45 }, { alleles: [0, 0, 1], n: 95 }, { alleles: [1, 1, 0], n: 95 }, { alleles: [0, 1, 0], n: 5 }, { alleles: [1, 0, 1], n: 5 }] } };
  const t = run(spec(tp, [['m', 'scalar', 'middle'], ['a', 'scalar', 'd12'], ['b', 'scalar', 'd23'], ['c', 'scalar', 'coincidence'], ['i', 'scalar', 'interference'], ['o', 'scalar', 'dOuter'], ['g', 'scene', 'geneMap']])).out;
  ok(t.m === 1 && near(t.a, 10, 1e-12) && near(t.b, 20, 1e-12) && near(t.c, 0.5, 1e-12) && near(t.i, 0.5, 1e-12) && near(t.o, 28, 1e-12), 'G7 three-point test cross (710 parental, 90 + 190 single, 10 double, n = 1000): order a–b–c, 10 and 20 cM, c = I = 0.5; the outer pair alone 28 cM');
  const sh = JSON.parse(JSON.stringify(tp)); sh.threePoint.loci = ['b', 'a', 'c']; sh.threePoint.classes.forEach(c => { c.alleles = [c.alleles[1], c.alleles[0], c.alleles[2]]; });
  ok(run(spec(sh, [['m', 'scalar', 'middle']])).out.m === 0, 'the same data listed as b, a, c: the middle locus is found (index 0 = a)');
  const zero = JSON.parse(JSON.stringify(tp)); zero.threePoint.classes = zero.threePoint.classes.slice(0, 6);
  const z = run(spec(zero, [['c', 'scalar', 'coincidence'], ['i', 'scalar', 'interference']])).out;
  ok(z.c === 0 && z.i === 1, 'no double crossovers observed: c = 0, complete interference I = 1');
  const tie = run(spec({ mode: 'map', threePoint: { loci: ['a', 'b', 'c'], classes: [{ alleles: [0, 0, 0], n: 10 }, { alleles: [1, 0, 0], n: 10 }] } }, [['m', 'scalar', 'middle']]));
  ok(Number.isNaN(tie.out.m) && tie.codes.includes('ambiguous-parentals'), 'two pairs of classes equally large → no order (NaN, code ambiguous-parentals)');
}

// ---------- 7. coalescent ----------
{
  const o = run(spec({ mode: 'coalescent', n: 10, Ne: 1000, mu: 0.0005, reps: 4000 }, [['e', 'scalar', 'eTmrca'], ['a', 'scalar', 'aN'], ['m', 'scalar', 'meanTmrca'], ['s', 'scalar', 'meanS'], ['es', 'scalar', 'eS'], ['tr', 'scene', 'tree'], ['sf', 'series', 'sfs'], ['st', 'series', 'sfsTheory'], ['d', 'scalar', 'meanD']]), {}, 2).out;
  // Var(T_MRCA) = Σ_k (4N/(k(k−1)))² ⇒ SE over 4000 trees
  let v = 0; for (let k = 2; k <= 10; k++) v += Math.pow(4000 / (k * (k - 1)), 2);
  ok(o.e === 3600 && near(o.a, 2.828968, 1e-6), 'G17 Kingman: E[T_MRCA] = 4N(1 − 1/n) = 3600 generations; a_10 = 2.828968');
  ok(Math.abs(o.m - 3600) < 3 * Math.sqrt(v / 4000) && Math.abs(o.s - o.es) < 3 * Math.sqrt((o.es + 4 * 4 * 1e6 * 0.0005 * 0.0005 * 1.54) / 4000), `seeded coalescent, 4000 trees: mean T_MRCA ${o.m.toFixed(0)} (3600 ± 3 SE), mean S ${o.s.toFixed(2)} vs E[S] = θ a_n = ${o.es.toFixed(2)} (Watterson 1975)`);
  ok(Math.abs(o.d) < 0.1 && o.sf.length === 9 && Math.abs(o.sf[0] - o.st[0]) < 0.15 * o.st[0], `neutral: mean Tajima's D ≈ 0 (${o.d.toFixed(3)}); singletons ${o.sf[0].toFixed(2)} vs θ/1 = ${o.st[0].toFixed(2)}`);
  ok(o.tr.items.filter(i => i.k === 'pt').length === 10 && o.tr.items.filter(i => i.k === 'seg').length === 36, 'the genealogy: 10 leaves, 18 branches (2 segments each)');
  ok(Number.isNaN(G.tajimaD(0, 0, 10)) && near(G.tajimaD(3, 3 * 2.828968, 10) , 0, 1e-6), "Tajima's D: S = 0 → NaN; π = S/a_n → 0");
  const bad = run(spec({ mode: 'coalescent', n: 60, Ne: 100 }, [['t', 'scalar', 'tmrca']]));
  ok(Number.isNaN(bad.out.t) && bad.codes.includes('n-range'), 'n = 60 > 50 → NaN and the code n-range');
}

// ---------- 8. LD ----------
{
  const o = run(spec({ mode: 'ld', pA: 0.5, pB: 0.5, D: 0.25, c: 0.5, gens: 5, Ne: 1000 }, [['d', 'scalar', 'Dfinal'], ['r', 'scalar', 'r2'], ['dp', 'scalar', 'Dprime'], ['sv', 'scalar', 'r2Sved'], ['s2', 'scalar', 'sigma2'], ['hl', 'scalar', 'halfLife']])).out;
  ok(near(o.d, 0.25 / 32, 1e-15) && o.r === 1 && o.dp === 1 && near(o.hl, 1, 1e-12), 'G18 D_t = D_0 (1 − c)^t: c = ½, t = 5 → D_0/32; complete LD: r² = D′ = 1; half-life 1 generation');
  ok(near(o.sv, 1 / 2001, 1e-15) && near(o.s2, (10 + 2000) / (2002 * 2011), 1e-15), 'drift–recombination: E[r²] ≈ 1/(1 + 4Nc) (Sved 1971), σ²_d = (10 + ρ)/((2 + ρ)(11 + ρ)) (Ohta & Kimura 1969)');
  const h = run(spec({ mode: 'ld', pAB: 0.4, pAb: 0.1, paB: 0.1, pab: 0.4, c: 0.1 }, [['d', 'scalar', 'D'], ['dp', 'scalar', 'Dprime'], ['r', 'scalar', 'r2']])).out;
  ok(near(h.d, 0.15, 1e-12) && near(h.dp, 0.6, 1e-12) && near(h.r, 0.36, 1e-12), 'haplotypes 0.4/0.1/0.1/0.4: D = 0.15, D′ = 0.6 (Lewontin 1964), r² = 0.36');
  const bad = run(spec({ mode: 'ld', pA: 0.5, pB: 0.5, D: 0.3, c: 0.1 }, [['d', 'scalar', 'D']]));
  ok(Number.isNaN(bad.out.d) && bad.codes.includes('D-range'), '|D| > D_max → NaN and the code D-range');
}

// ---------- 9. quantitative ----------
{
  const o = run(spec({ mode: 'quant', h2: 0.4, S: 10 }, [['R', 'scalar', 'R']])).out;
  const t = run(spec({ mode: 'quant', h2: 0.4, sigmaP: 5, sel: 0.1 }, [['R', 'scalar', 'R'], ['i', 'scalar', 'i']])).out;
  ok(near(o.R, 4, 1e-12) && near(t.i, 1.7550, 1e-4) && near(t.R, 3.510, 1e-3), `G19 breeder's equation: h² 0.4, S 10 → R 4; top 10 %: i = ${t.i.toFixed(4)} (1.755), R = ${t.R.toFixed(3)} (3.510)`);
  const is = [0.5, 0.2, 0.05, 0.01].map(G.intensity), want = [0.7979, 1.3998, 2.0627, 2.6652];
  ok(is.every((x, i) => near(x, want[i], 1e-4)), `selection intensities for 50, 20, 5, 1 %: ${is.map(x => x.toFixed(4))} (Falconer & Mackay table A)`);
  const one = run(spec({ mode: 'quant', a: 1, d: 0.5, p: 0.3 }, [['M', 'scalar', 'M'], ['al', 'scalar', 'alpha'], ['va', 'scalar', 'VA'], ['vd', 'scalar', 'VD'], ['b', 'scalar', 'bvAA']])).out;
  ok(near(one.M, -0.19, 1e-12) && near(one.al, 1.2, 1e-12) && near(one.va, 0.6048, 1e-12) && near(one.vd, 0.0441, 1e-12) && near(one.b, 1.68, 1e-12), 'one locus a = 1, d = ½, p = 0.3 (Falconer & Mackay ch. 7–8): M = −0.19, α = 1.2, V_A = 0.6048, V_D = 0.0441, BV(AA) = 1.68');
  const li = run(spec({ mode: 'quant', K: 0.01, Kr: 0.05 }, [['h', 'scalar', 'h2Liab'], ['x', 'scalar', 'xg']])).out;
  const xg = 2.326348, xr = 1.644854, ag = Math.exp(-xg * xg / 2) / Math.sqrt(2 * Math.PI) / 0.01;
  ok(near(li.x, xg, 1e-6) && near(li.h, (xg - xr) / ag / 0.5, 1e-6), `liability (Falconer 1965): K = 1 %, first-degree relatives 5 % → h² = ${li.h.toFixed(4)}`);
  const sm = spec({ mode: 'quant', sim: { N: 200, L: 20, gens: 10, sel: 0.2, h2: 0.5 } }, [['m', 'series', 'simMeans'], ['v', 'series', 'simVAs'], ['p', 'scalar', 'simP']]);
  const s1 = run(sm, {}, 4).out, s2 = run(sm, {}, 4).out;
  const R1 = 0.5 * G.intensity(0.2) * Math.sqrt(20 / 8 / 0.5);
  ok(JSON.stringify(s1) === JSON.stringify(s2) && near(s1.m[1] - s1.m[0], R1, 0.35) && s1.m[10] > s1.m[0] + 5 && s1.v[10] < s1.v[0], `polygenic truncation selection (seeded): first response ${(s1.m[1] - s1.m[0]).toFixed(2)} ≈ i·h²·σ_P = ${R1.toFixed(2)}, mean rises, V_A falls (Bulmer effect, fixation)`);
  const bud = run(spec({ mode: 'quant', sim: { N: 2000, L: 200, gens: 10, sel: 0.2, h2: 0.5 } }, [['m', 'scalar', 'simMean']]));
  ok(Number.isNaN(bud.out.m) && bud.codes.includes('budget'), 'a simulation over the budget (N·L·generations > 200 000) → NaN and the code budget');
}

// ---------- 10. checks, adapter, Worker, speed ----------
{
  const codes = s => G.checkSpec(s).map(p => p.code + ' ' + p.path);
  ok(codes(spec({ mode: 'nope' }, [])).includes('enum model.mode'), 'an unknown mode → enum model.mode');
  ok(codes(spec({ mode: 'cross', loci: [L2('A', 'A', 'a')], p1: het(['A', 'A', 'a']), p2: het(['A', 'A', 'z']) }, [])).includes('ref model.p2.A'), 'a parent with an allele the locus lacks → ref model.p2.A');
  ok(codes(spec({ mode: 'hw', freqs: [0.5, 0.5] }, [['x', 'scalar', 'nClasses']])).includes('output outputs[0].of'), 'an output the mode does not compute → output outputs[0].of');
  ok(codes(spec({ mode: 'pedigree', inheritance: 'AD', people: [{ id: 'a', sex: 'm', mother: 'b', father: 'a' }, { id: 'b', sex: 'f' }] }, [])).includes('value model.people[0].father'), 'a person who is their own father → value');
  const ex = G.exprs(spec({ mode: 'cross', loci: [{ id: 'Y', alleles: ['Ay', 'a'], lethal: [{ genotype: ['Ay', 'Ay'], viability: '1 - k' }] }], p1: { Y: ['Ay', 'a'] }, p2: { Y: ['Ay', 'a'] }, linkage: [], observed: ['3*k', 4] }, []));
  ok(JSON.stringify(ex) === JSON.stringify([['1 - k', 'model.loci[0].lethal[0].viability', []], ['3*k', 'model.observed[0]', []]]), 'exprs lists every expression of the model with its path');
  ok(JSON.stringify(G.keys(spec({ mode: 'cross', classLabels: ['red', 'white'] }, []))) === '[["red","model.classLabels[0]"],["white","model.classLabels[1]"]]', 'keys lists the class labels');
  const s = spec({ mode: 'hw', freqs: ['k', '1 - k'] }, [['h', 'scalar', 'het'], ['g', 'series', 'fAa'], ['d', 'scene', 'deFinetti']]);
  const o = G.engine.create(s, { seed: 3 }).run({ k: 0.2 });
  ok(near(o.h, 0.32, 1e-12) && o.g.length === 101 && o.d.items.length > 0, 'the sim adapter: engine.create(spec).run({k: 0.2}) → het 0.32, a series of 101, a scene');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + G.engine.workerSource, ctx);
  const dsp = spec({ mode: 'drift', N: 40, p0: 0.5, reps: 30, gens: 50 }, [['f', 'scalar', 'fixed'], ['h', 'series', 'meanHs']]);
  const w = ctx.self.noemaEngine.create(dsp, { seed: 9 }).run({}), pg = G.engine.create(dsp, { seed: 9 }).run({});
  ok(JSON.stringify(w) === JSON.stringify(pg) && w.h.length === 51, 'the Worker source in a fresh vm context gives the same outputs (seeded drift)');
  const r0 = G.run(null), r1 = G.run({ model: { mode: 'x' }, outputs: [{ id: 'a', of: 'b' }] }), r2 = G.run({ model: { mode: 'hw', freqs: [0.5, 0.5] }, outputs: [{ id: 'a', of: 'constructor' }] });
  ok(r0.codes.includes('error') && Number.isNaN(r1.out.a) && r1.codes.includes('error') && Number.isNaN(r2.out.a), 'a run never throws: no spec, an unknown mode or an inherited name as output → NaN and the code error');
  const t0 = Date.now(); G.engine.create(spec({ mode: 'cross', loci: [L2('A', 'A', 'a'), L2('B', 'B', 'b')], p1: het(['A', 'A', 'a'], ['B', 'B', 'b']), p2: het(['A', 'A', 'a'], ['B', 'B', 'b']), epistasis: { a: 'A', b: 'B', type: 'recessive' } }, [['r', 'series', 'ratios'], ['p', 'scene', 'punnett']]), {}).run({}); const typ = Date.now() - t0;
  const t1 = Date.now();
  run(spec({ mode: 'drift', N: 1000, p0: 0.5, reps: 2000, gens: 100 }, [['f', 'scalar', 'fixed']]));
  run(spec({ mode: 'pedigree', inheritance: 'AD', people: Array.from({ length: 11 }, (_, i) => ({ id: 'p' + i, sex: 'f', affected: i % 2 === 0 })) }, [['l', 'scalar', 'likelihood']]));
  run(spec({ mode: 'cross', loci: ['A', 'B', 'C', 'D', 'E', 'F'].map(x => L2(x, x, x.toLowerCase())), p1: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map(x => [x, [x, x.toLowerCase()]])), p2: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map(x => [x, [x, x.toLowerCase()]])) }, [['n', 'scalar', 'nClasses']]));
  const worst = Date.now() - t1;
  ok(typ < 50 && worst < 2000, `speed: a dihybrid ${typ} ms (< 50); the worst allowed runs (WF 200 000 generations, a pedigree of 3^11 genotypes, a 6-locus cross) ${worst} ms (< 2 s)`);
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
