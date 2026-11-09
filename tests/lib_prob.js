/* prob@1 — probability and statistics (docs/library/prob.md): published reference values (the source in each message: the AS
   algorithms' test values, R, scipy 1.x / statsmodels, mpmath at 50 digits where scipy itself is off, the classic data sets), the
   edge cases and their codes, the checker's codes, the sim adapter, the Worker source in a fresh context, speed, the seeded
   coverage of the Monte Carlo interval, and the golden data of the former twin tools/lib_prob.py.
   Run: node tests/lib_prob.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const want = require('./golden.cjs')('lib_prob');   // the golden outputs of the former Python twin (tests/golden.cjs)
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const rel = (a, b, tol) => Number.isFinite(a) && (a === b || Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-300));
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const allRel = (a, b, tol) => a.length === b.length && a.every((v, i) => rel(v, b[i], tol));
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibProb = ENGINES.mod('prob@1');
const M = NoemaLibProb;
const X = (model, seed) => M.compute(model, {}, null, { seed: seed === undefined ? 1 : seed });
const S = (model, keys, seed) => { const r = X(model, seed); return keys.map(k => r.scalar(k)); };
const s1 = (model, key) => X(model).scalar(key);
const iss = (model, code, key) => { const r = X(model); if (key) r.scalar(key); return r.issues[code] || 0; };   // a code is counted for the outputs asked (key)
const L = o => M.lawOf(o);
const dist = (d, extra, key) => s1(Object.assign({ mode: 'dist', dist: d }, extra), key);

// ===== special functions (P1–P10, P28) =====
{
  ok(near(M.ncdf(1.96), 0.9750021048517795, 1e-15), 'P1 Φ(1.96) = 0.9750021048517795');
  ok(rel(M.qnorm(0.975), 1.959963984540054, 1e-14) && rel(M.qnorm(1e-10), -6.361340902404056, 1e-14), 'P2 Φ⁻¹(0.975), Φ⁻¹(1e-10) (AS241, Wichura 1988)');
  ok(rel(dist({ family: 'normal' }, { x: 10 }, 'sf'), 7.61985302416047e-24, 1e-12), 'P3 Q(10) = 7.62e-24 from the upper tail itself (1 − Φ would give 0)');
  ok(rel(M.lncdf(-40), -804.6084420137538, 1e-14) && rel(M.ncdf(-38), 2.885428360068784e-316, 1e-9), 'ln Φ(−40) = −804.608442 (mpmath); Φ(−38) = 2.885e-316 in the subnormals');
  ok(rel(M.qt(0.975, 10), 2.228138851986274, 1e-12) && rel(M.qt(0.975, 1), 12.706204736174694, 1e-12), 'P4 t quantile 0.975: ν = 10 → 2.2281; ν = 1 → tan(0.475π)');
  ok(near(M.tcdf(2, 3), 0.9303370157205785, 1e-14), 'P5 t cdf(2; ν = 3) = ½ + (θ + sin θ cos θ)/π');
  ok(rel(dist({ family: 'chi2', df: 1 }, { p: 0.95 }, 'quantile'), 3.841458820694124, 1e-12) && rel(dist({ family: 'chi2', df: 10 }, { pu: 0.05 }, 'isf'), 18.307038053275146, 1e-12) && near(dist({ family: 'chi2', df: 1 }, { x: 1 }, 'cdf'), 0.6826894921370859, 1e-14), 'P6 χ² 0.95 quantiles (ν = 1, 10); χ²₁ cdf(1) = erf(1/√2)');
  ok(rel(dist({ family: 'f', d1: 5, d2: 10 }, { pu: 0.05 }, 'isf'), 3.3258345304130104, 1e-11) && near(dist({ family: 'f', d1: 3, d2: 7 }, { x: 2 }, 'cdf'), 0.7973063575133491, 1e-11), 'P7 F(5, 10) 0.95 quantile; F(3, 7) cdf(2)');
  ok(rel(M.lgamma(0.5), 0.5723649429247001, 1e-14) && rel(M.lgamma(100), 359.1342053695754, 1e-14) && rel(M.lgamma(1e-8), 18.420680738180209, 1e-14) && rel(M.lgamma(171.5), 709.1431630309283, 1e-14), 'P8 lgamma(½) = ln √π, lgamma(100), lgamma(1e-8), lgamma(171.5)');
  ok(rel(M.lgamma(2.5), 0.2846828704729192, 1e-14) && rel(M.lgamma(1e-300), 690.7755278982137, 1e-14) && rel(M.lgamma(1e10), 220258509288.81058, 1e-14) && rel(M.lgamma(-0.5), 1.2655121234846454, 1e-14) && rel(M.lgamma(0.9), 0.06637623973474327, 1e-13), 'lgamma at 2.5, 1e-300, 1e10, −0.5 (reflection), 0.9 (scipy gammaln)');
  ok(rel(M.lgamma(1.0000001), -5.772155826548335e-8, 1e-9), 'lgamma near 1 (the lgamma1p series; mpmath at the binary value of 1.0000001)');
  ok(near(M.gammaPQ(3, 2)[0], 0.32332358381693654, 1e-15) && near(M.gammaPQ(100, 100)[0], 0.5132987982791487, 1e-12) && near(M.gammaPQ(0.5, 1e-3)[1], 0.9643294082703201, 1e-13), 'P9 P(3, 2) = 1 − 5e⁻², P(100, 100), Q(½, 1e-3)');
  ok(rel(M.gammaPQ(1e5, 1e5 + 300)[0], 0.8286363112512075, 1e-11) && rel(M.gammaPQ(1e7, 1e7 - 3000)[1], 0.8286064665990278, 1e-10), 'the incomplete gamma at a = 1e5 and 1e7 (Loader prefactor; scipy gammainc/gammaincc)');
  ok(near(M.ibeta(0.4, 2, 3)[0], 0.5248, 1e-14) && near(M.ibeta(0.5, 0.5, 0.5)[0], 0.5, 1e-15) && near(M.ibeta(0.4, 200, 300)[0], 0.5024286163199315, 1e-11), 'P10 I₀.₄(2, 3) = 0.5248, I₀.₅(½, ½) = ½, I₀.₄(200, 300)');
  ok(rel(M.ibeta(0.501, 1e5, 1e5)[0], 0.8144532554424423, 1e-10) && rel(M.ibeta(1e-6, 0.5, 1e6)[0], 0.8427008448381964, 1e-11), 'the incomplete beta at a = b = 1e5 and at a = ½, b = 1e6 (scipy betainc)');
  ok(rel(M.erfc(5), 1.5374597944280347e-12, 1e-14) && rel(M.erfcinv(1e-20), 6.601580622355143, 1e-14), 'P28 erfc(5), erfcinv(1e-20)');
  ok(M.log1p(1e-17) === 1e-17 && rel(M.expm1(1e-10), 1.00000000005e-10, 1e-15) && rel(M.log1p(-0.5), Math.log(0.5), 1e-15), 'log1p and expm1 keep the small arguments (Goldberg 1991, Kahan)');
  ok(allRel([M.pnt(2, 10, 1.5), M.pnt(-1, 5, 0.7), M.pnt(3, 30, 2.5)], [0.6591540724421909, 0.056958047365786885, 0.6709221372818337], 5e-12), 'the noncentral t cdf (AS243, Lenth 1989; scipy nct)');
  ok(rel(M.qt(1e-10, 3), -2225.769284683093, 1e-11) && rel(M.qt(0.975, 1e6), 1.959966356814107, 1e-13) && rel(M.tcdf(-40, 2.5), 7.09781714524669e-5, 1e-12) && rel(M.tsf(1.5, 0.5), 0.2539508953240542, 1e-12), 't quantiles and tails: far quantile ν = 3, ν = 1e6, a heavy tail at ν = 2.5, ν = ½ (scipy)');
  ok(rel(M.tsf(1.96, 1e6), 0.024998033792634893, 1e-14) && rel(dist({ family: 't', df: 1e8 }, { x: 40 }, 'logsf'), -804.6020340845713, 1e-12), 'huge ν: P(T > 1.96) at ν = 1e6 (mpmath betainc), and ln P(T > 40) at ν = 1e8 is kept where P underflows');
}

// ===== the distributions (P11–P14, P25–P27) =====
{
  ok(near(dist({ family: 'binomial', n: 10, p: 0.5 }, { x: 3 }, 'cdf'), 0.171875, 1e-15) && rel(dist({ family: 'binomial', n: 100, p: 0.5 }, { x: 50 }, 'pdf'), 0.07958923738717875, 1e-14), 'P11 Binomial(10, ½) P(X ≤ 3) = 176/1024; Binomial(100, ½) pmf(50)');
  const P12 = X({ mode: 'dist', dist: { family: 'poisson', lambda: 1000 }, x: 0 });
  ok(near(dist({ family: 'poisson', lambda: 10 }, { x: 10 }, 'cdf'), 0.5830397501929852, 1e-14) && P12.scalar('logpdf') === -1000 && P12.scalar('pdf') === 0 && P12.issues.underflow === 1, 'P12 Poisson(10) cdf(10); Poisson(1000) pmf(0) underflows: log pmf = −1000 and the code underflow');
  ok(near(dist({ family: 'hypergeometric', N: 52, K: 4, n: 5 }, { x: 2 }, 'pdf'), 103776 / 2598960, 1e-15), 'P13 exactly 2 aces in a 5-card hand = 103776/2598960');
  ok(rel(dist({ family: 'negbinomial', r: 3, p: 0.5 }, { x: 2 }, 'pdf'), 0.1875, 1e-15) && rel(dist({ family: 'geometric', p: 0.2, trials: true }, { x: 3 }, 'pdf'), 0.128, 1e-15), 'P14 NB(3, ½) pmf(2 failures) = 6/32; geometric (trials) P(X = 3) = 0.8²·0.2');
  const Bb = L({ family: 'binomial', n: 1e6, p: 0.5 });
  ok(rel(Bb.pdf(500000), 7.978843613317499e-4, 1e-13) && rel(Bb.cdf(499000), 0.0228041499326948, 1e-11), 'Binomial(1e6, ½): pmf at the mode and cdf(499000) (Loader 2000 saddle point; scipy)');
  ok(rel(L({ family: 'binomial', n: 1e9, p: 1e-8 }).lpdf(10), -2.0785616381350584, 1e-14), 'Binomial(1e9, 1e-8) log pmf(10) = −2.07856163813506 (mpmath; scipy binom.logpmf is off by 3e-7 there)');
  ok(rel(L({ family: 'poisson', lambda: 1e6 }).cdf(1e6), 0.5002659614862837, 1e-11) && rel(L({ family: 'poisson', lambda: 1000 }).sf(1100), 8.676409634435647e-4, 1e-10), 'Poisson(1e6) cdf at the mean; Poisson(1000) P(X > 1100) (scipy)');
  const H = L({ family: 'hypergeometric', N: 1e6, K: 5e5, n: 1000 });
  ok(rel(H.pdf(500), 0.025237640148908558, 1e-10) && rel(H.cdf(480), 0.10860910653089893, 1e-9), 'Hypergeometric(1e6, 5e5, 1000): pmf(500) and cdf(480)');
  const NB = L({ family: 'negbinomial', r: 2.5, p: 0.3 });
  ok(rel(NB.cdf(10), 0.8621611156029032, 1e-12) && NB.q(0.9) === 12, 'NB(r = 2.5, p = 0.3): cdf(10), the 0.9 quantile is 12 (scipy nbinom)');
  ok(allRel([L({ family: 'gamma', shape: 0.1 }).q(1e-5), L({ family: 'gamma', shape: 50 }).q(0.999), L({ family: 'gamma', shape: 3 }).isf(1e-12)], [6.073048362407862e-51, 74.72462638951943, 34.052374190075696], 1e-10), 'gamma quantiles: shape 0.1 at 1e-5, shape 50 at 0.999, the upper 1e-12 point of shape 3');
  ok(allRel([L({ family: 'beta', a: 2, b: 3 }).q(1e-8), L({ family: 'beta', a: 0.5, b: 4 }).isf(1e-10), L({ family: 'beta', a: 1000, b: 2000 }).q(0.5)], [4.082594021609242e-5, 0.9956288542137534, 0.3332962917247511], 1e-10), 'beta quantiles in the tails and at a, b = 1000, 2000');
  ok(rel(L({ family: 'f', d1: 2, d2: 3 }).q(0.01), 0.01008408092817631, 1e-11) && rel(L({ family: 'f', d1: 4, d2: 200 }).sf(50), 4.02319061662716e-29, 1e-10), 'F(2, 3) 0.01 quantile; F(4, 200) P(F > 50) = 4e-29 from the upper tail');
  const W = L({ family: 'weibull', shape: 1.5, scale: 2 });
  ok(allRel([W.mean, W.var, W.skew, W.kurt], [1.805490585901867, 1.5027611392557279, 1.0719865728909583, 1.3904035615957744], 1e-12), 'Weibull(1.5, 2) mean, variance, skewness, excess kurtosis (scipy)');
  ok(rel(L({ family: 'gumbel' }).skew, 1.1395470994046486, 1e-12) && near(L({ family: 'gumbel' }).mean, 0.5772156649015329, 1e-15), 'Gumbel: mean γ, skewness 12√6 ζ(3)/π³');
  ok(near(dist({ family: 'weibull', shape: 1.5, scale: 2 }, { x: 1 }, 'cdf'), 0.29781149867344037, 1e-14) && near(dist({ family: 'lognormal' }, { x: 2 }, 'cdf'), 0.7558914042144173, 1e-14) && near(dist({ family: 'cauchy' }, { x: 1 }, 'cdf'), 0.75, 1e-15), 'P27 Weibull(1.5, 2) cdf(1), Lognormal(0, 1) cdf(2) = Φ(ln 2), Cauchy cdf(1) = ¾');
  const cat = S({ mode: 'dist', dist: { family: 'categorical', probs: [0.2, 0.3, 0.5] }, x: 1, lo: 1, hi: 2 }, ['pdf', 'prob', 'mean']);
  ok(near(cat[0], 0.3, 1e-15) && near(cat[1], 0.8, 1e-15) && near(cat[2], 1.3, 1e-15), 'categorical on 0, 1, 2: pmf(1) = 0.3, P(1 ≤ X ≤ 2) = 0.8, mean 1.3');
  const b20 = S({ mode: 'dist', dist: { family: 'binomial', n: 20, p: 0.3 }, lo: 4, hi: 8 }, ['prob', 'normApprox', 'poissonApprox']);
  ok(near(b20[0], 0.7795817326192909, 1e-14) && near(b20[1], 0.7774877702740892, 1e-12) && b20[2] > 0.6, 'Binomial(20, 0.3) P(4 ≤ X ≤ 8) exact, with the continuity-corrected normal approximation beside it');
  ok(rel(dist({ family: 'binomial', n: 7, p: 0.3 }, { p: 0.5 }, 'quantile'), 2, 0) && dist({ family: 'poisson', lambda: 3.5 }, { p: 0.5 }, 'median') === 3, 'discrete quantiles are the smallest x with F(x) ≥ p');
  for (const fam of [{ family: 'normal', mu: 1, sigma: 2 }, { family: 'gamma', shape: 2.5, rate: 3 }, { family: 'beta', a: 2, b: 5 }, { family: 't', df: 4 }, { family: 'f', d1: 3, d2: 9 }, { family: 'triangular', a: 0, b: 2, c: 0.5 }, { family: 'pareto', alpha: 3 }, { family: 'logistic' }, { family: 'laplace' }, { family: 'rayleigh' }]) {
    const D = L(fam), x = D.q(0.3);
    ok(near(D.cdf(x), 0.3, 1e-12) && near(D.cdf(x) + D.sf(x), 1, 1e-14) && near(D.q(D.cdf(x)), x, 1e-9 * Math.max(1, Math.abs(x))), `${fam.family}: q(cdf(x)) = x and cdf + sf = 1`);
  }
  const g5 = X({ mode: 'dist', dist: { family: 'gamma', shape: 0.5 }, points: 5, x: 0 });
  ok(g5.series('x').length === 5 && g5.scalar('pdf') === Infinity && g5.issues['pdf-infinite'] === 1, 'gamma shape ½: the density curve, and at 0 an infinite density with the code pdf-infinite');
  ok(near(L({ family: 'exponential', rate: 2 }).mean, 0.5, 1e-15) && near(L({ family: 'exponential', rate: 2 }).cdf(Math.LN2 / 2), 0.5, 1e-15), 'the exponential of rate 2: mean ½, median ln 2 / 2');
}

// ===== Monte Carlo, sampling distributions, the CLT (P29) =====
{
  const mc = S({ mode: 'mc', draws: { X: { family: 'dunif', a: 1, b: 6 }, Y: { family: 'dunif', a: 1, b: 6 } }, expr: 'X + Y > 7', n: 100000, conf: 0.999 }, ['estimate', 'ciLo', 'ciHi', 'indicator']);
  ok(mc[1] <= 15 / 36 && 15 / 36 <= mc[2] && mc[3] === 1, `P29 two dice, P(X + Y > 7) = 15/36 inside the seeded 99.9 % interval (${mc[0].toFixed(4)}, (${mc[1].toFixed(4)}, ${mc[2].toFixed(4)}))`);
  let cov = 0; const t0 = Date.now();
  for (let s = 1; s <= 1000; s++) { const r = S({ mode: 'mc', draws: { X: { family: 'dunif', a: 1, b: 6 }, Y: { family: 'dunif', a: 1, b: 6 } }, expr: 'X + Y > 7', n: 1000 }, ['ciLo', 'ciHi'], s); if (r[0] <= 15 / 36 && 15 / 36 <= r[1]) cov++; }
  const exact = s1({ mode: 'ci', kind: 'prop', k: 0, n: 1000, p: 15 / 36, method: 'wilson' }, 'coverAt');   // the exact coverage of that interval
  ok(exact >= 0.94 && Math.abs(cov / 1000 - exact) <= 3 * Math.sqrt(exact * (1 - exact) / 1000), `P29 the reported 95 % (Wilson) interval holds the truth in ${cov}/1000 seeds; its exact coverage is ${(100 * exact).toFixed(2)} % (within 3 binomial SE; ${Date.now() - t0} ms)`);
  const a = S({ mode: 'mc', draws: { X: { family: 'normal' } }, expr: 'X*X', n: 20000 }, ['estimate', 'ciLo', 'ciHi'], 7), b = S({ mode: 'mc', draws: { X: { family: 'normal' } }, expr: 'X*X', n: 20000 }, ['estimate'], 7);
  ok(a[1] <= 1 && 1 <= a[2] && a[0] === b[0], 'E[Z²] = 1 inside the interval; the same seed gives the same estimate');
  ok(iss({ mode: 'mc', draws: { X: { family: 'cauchy' } }, expr: 'X', n: 5000 }, 'infinite-variance') === 1, 'the mean of Cauchy draws: infinite-variance');
  ok(iss({ mode: 'mc', draws: { X: { family: 'uniform', a: 0, b: 1 } }, expr: 'X > 0.99999', n: 1000 }, 'rare-event', 'estimate') === 1, 'an event never seen in 1000 draws: rare-event');
  const sm = S({ mode: 'sampling', parent: { family: 'exponential' }, size: 30, reps: 2000 }, ['statMean', 'statSd', 'theoSe', 'ks']);
  ok(near(sm[0], 1, 0.02) && near(sm[1], 1 / Math.sqrt(30), 0.01) && near(sm[2], 1 / Math.sqrt(30), 1e-15) && sm[3] < 0.1, 'the CLT: means of 30 Exp(1) draws centre on 1 with SE 1/√30');
  ok(iss({ mode: 'sampling', parent: { family: 'cauchy' }, size: 30, reps: 200 }, 'no-mean') === 1 && iss({ mode: 'sampling', parent: { family: 'pareto', alpha: 1.5 }, size: 30, reps: 200 }, 'infinite-variance') === 1, 'no CLT for Cauchy (no-mean) or Pareto α = 1.5 (infinite-variance)');
}

// ===== tests (P16–P19, scipy / statsmodels) =====
{
  const T = (model, keys) => S(Object.assign({ mode: 'test' }, model), keys);
  const sleep = [1.2, 2.4, 1.3, 1.3, 0, 1.0, 1.8, 0.8, 4.6, 1.4];
  const t1 = T({ kind: 't-one', x: sleep }, ['stat', 'df', 'p', 'ciLo', 'ciHi']);
  ok(rel(t1[0], 4.062127683382037, 1e-12) && t1[1] === 9 && rel(t1[2], 0.002832890197384273, 1e-9) && near(t1[3], 0.7001142, 1e-7) && near(t1[4], 2.4598858, 1e-7), 'P17 Student\'s sleep data (Cushny & Peebles 1905): t = 4.0621, df 9, p = 0.002833, CI (0.700, 2.460)');
  const g1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0], g2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4];
  ok(allRel(T({ kind: 't-welch', x: g1, y: g2 }, ['stat', 'df', 'p', 'ciLo', 'ciHi']), [-1.8608134674868526, 17.776473516178488, 0.0793941401873583, -3.3654832307117104, 0.20548323071171137], 1e-11), 'Welch t on the sleep groups (R t.test; scipy ttest_ind equal_var=False)');
  ok(allRel(T({ kind: 't-pooled', x: g1, y: g2 }, ['stat', 'df', 'p', 'ciLo', 'ciHi']), [-1.8608134674868524, 18, 0.07918671421593822, -3.3638740322875984, 0.20387403228759915], 1e-11), 'pooled t on the same groups');
  ok(allRel(T({ kind: 't-paired', x: g2, y: g1 }, ['stat', 'p']), [4.062127683382037, 0.002832890197384273], 1e-9), 'paired t = the one-sample t of the differences');
  ok(allRel(T({ kind: 'f-var', x: g1, y: g2 }, ['stat', 'p']), [0.7983426179983923, 0.7427199317260453], 1e-11), 'the F test of two variances (R var.test)');
  const ctrl = [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14], trt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69], trt2 = [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26];
  ok(allRel(T({ kind: 'anova', groups: [ctrl, trt1, trt2] }, ['stat', 'p']), [4.846087862380135, 0.015909958325622912], 1e-11), 'one-way ANOVA on R PlantGrowth (Dobson 1983): F = 4.846, p = 0.0159');
  const x = [1, 2, 3, 4, 5, 6, 7, 8], y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1];
  ok(allRel(T({ kind: 'pearson', x, y }, ['estimate', 'p', 'ciLo', 'ciHi']), [0.999419474795813, 4.888933612558555e-10, 0.9966537550674996, 0.9998994024260276], 1e-6), 'Pearson r with its Fisher-z interval (R cor.test)');
  ok(allRel(T({ kind: 'regression', x, y }, ['estimate', 'se', 'r2']), [1.9976190476190478, 0.02780044426688155, 0.9988392866011391], 1e-11) && near(s1({ mode: 'test', kind: 'regression', x, y }, 'intercept'), 0.0357142857142847, 1e-12), 'least-squares slope, its SE, R² and the intercept (scipy linregress)');
  const tb = [[12, 5], [7, 9]];
  ok(allRel(T({ kind: 'chi2-indep', table: tb }, ['stat', 'p']), [2.4305755196815575, 0.118989205532145], 1e-12) && allRel(T({ kind: 'chi2-indep', table: tb, correct: true }, ['stat', 'p']), [1.455996378814684, 0.22756821457580642], 1e-12), 'χ² of a 2 × 2 table, without and with Yates\' correction (scipy chi2_contingency)');
  ok(allRel(T({ kind: 'g-test', table: tb }, ['stat', 'p']), [2.460043007730719, 0.1167755846784958], 1e-12), 'the G test (likelihood ratio) of the same table');
  ok(allRel(T({ kind: 'chi2-indep', table: [[10, 20, 30], [20, 25, 15]] }, ['stat', 'p', 'df']), [8.88888888888889, 0.011743628457021359, 2], 1e-12), 'χ² of a 2 × 3 table, df 2');
  ok(allRel(T({ kind: 'chi2-gof', observed: [315, 108, 101, 32], probs: [9, 3, 3, 1] }, ['stat', 'p', 'df']), [0.4700239808153477, 0.925425895103616, 3], 1e-12), 'P18 Mendel\'s peas 315/108/101/32 against 9:3:3:1: χ² = 0.470, p = 0.925');
  ok(near(T({ kind: 'fisher', table: [[3, 1], [1, 3]], alt: 'greater' }, ['p'])[0], 17 / 70, 1e-15) && near(T({ kind: 'fisher', table: [[3, 1], [1, 3]] }, ['p'])[0], 0.48571428571428565, 1e-15), 'P19 Fisher\'s lady tasting tea: one-sided p = 17/70; two-sided 34/70');
  ok(allRel(T({ kind: 'mcnemar', table: [[20, 12], [3, 10]] }, ['p']), [0.03515625], 1e-14) && allRel(T({ kind: 'mcnemar', table: [[20, 12], [3, 10]], exact: false }, ['stat', 'p']), [4.266666666666667, 0.03886710381241731], 1e-12), 'McNemar: exact binomial p, and the corrected χ² (statsmodels mcnemar)');
  const b = T({ kind: 'binom-exact', k: 7, n: 20 }, ['p', 'ciLo', 'ciHi']);
  ok(rel(b[0], 0.26317596435546875, 1e-14) && near(b[1], 0.15390920478454118, 1e-10) && near(b[2], 0.5921885345328282, 1e-10) && rel(T({ kind: 'binom-exact', k: 3, n: 20, alt: 'less' }, ['p'])[0], 1351 / 1048576, 1e-14), 'P16 exact binomial: 7 of 20 vs ½ two-sided p = 0.26318; 3 of 20 one-sided = 1351/2²⁰');
  ok(allRel(T({ kind: 'mann-whitney', x: [1.1, 2.3, 3.5, 4.2, 6.0], y: [5.1, 6.2, 7.4, 8.8, 9.1, 2.3] }, ['stat', 'p']), [4.5, 0.0672640751937606], 1e-12), 'Mann–Whitney with a tie: the normal approximation with continuity and tie correction (R wilcox.test)');
  ok(allRel(T({ kind: 'mann-whitney', x: [1.1, 2.4, 3.5, 4.2, 6.0], y: [5.1, 6.2, 7.4, 8.8, 9.1, 2.3] }, ['stat', 'p']), [5, 0.08225108225108226], 1e-13), 'Mann–Whitney without ties: the exact null distribution (U = 5, p = 38/462)');
  const wx = [1.83, 0.50, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.30], wy = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];
  ok(allRel(T({ kind: 'wilcoxon', x: wx, y: wy }, ['stat', 'p']), [40, 0.0390625], 1e-13), 'Wilcoxon signed rank, the depression data of Hollander & Wolfe (R: V = 40, p = 0.039)');
  ok(T({ kind: 'z-one', x: sleep, sigma: 1 }, ['stat'])[0] > 4.9 && near(T({ kind: 'prop-one', k: 60, n: 100, p0: 0.5 }, ['stat'])[0], 2, 1e-12), 'z tests: one mean with known σ; one proportion 60/100 vs ½ → z = 2');
  ok(iss({ mode: 'test', kind: 't-one', x: [2, 2, 2, 2] }, 'zero-variance') === 1, 'a t test on constant data: zero-variance');
  ok(iss({ mode: 'test', kind: 'chi2-indep', table: [[3, 1], [1, 3]] }, 'low-expected', 'p') === 4, 'expected counts below 5: low-expected, counted per cell (4 of 4)');
}

// ===== intervals, power, Bayes (P15, P20–P22) =====
{
  const c = S({ mode: 'ci', kind: 'prop', k: 7, n: 20, method: 'clopper-pearson' }, ['lo', 'hi', 'lo.wilson', 'hi.wilson', 'lo.agresti-coull', 'hi.agresti-coull', 'lo.jeffreys', 'hi.jeffreys', 'lo.wald', 'hi.wald']);
  ok(allRel(c.slice(0, 4), [0.15390920478454118, 0.5921885345328282, 0.18119182410108203, 0.5671457233147638], 1e-10), 'P15 7/20: Clopper–Pearson (0.1539, 0.5922), Wilson (0.1812, 0.5671)');
  ok(allRel(c.slice(4), [0.179926361438228, 0.5684111859776177, 0.172276213631912, 0.5677660938414961, 0.1409626969046058, 0.5590373030953941], 1e-10), '7/20: Agresti–Coull, Jeffreys, Wald (statsmodels proportion_confint)');
  ok(near(s1({ mode: 'ci', kind: 'prop', k: 0, n: 20, method: 'clopper-pearson' }, 'hi'), 1 - Math.pow(0.025, 1 / 20), 1e-12) && s1({ mode: 'ci', kind: 'prop', k: 0, n: 20, method: 'wilson' }, 'lo') === 0, '0/20: the exact upper bound 1 − 0.025^{1/20}; Wilson starts at 0 exactly');
  ok(allRel(S({ mode: 'ci', kind: 'poisson', k: 5 }, ['lo', 'hi']), [1.6234863901184207, 11.66833207932267], 1e-11), 'Garwood exact Poisson interval for 5 events');
  const cv = S({ mode: 'ci', kind: 'prop', k: 3, n: 30, p: 0.1 }, ['coverAt.wald', 'coverAt.wilson']);
  ok(near(cv[0], 0.8085213615694747, 1e-12) && near(cv[1], 0.9741732113380898, 1e-12), 'the exact coverage at n = 30, p = 0.1: Wald 80.9 %, Wilson 97.4 % (Brown, Cai & DasGupta 2001)');
  ok(s1({ mode: 'ci', kind: 'prop', k: 3, n: 30 }, 'minCover.wald') < 0.2 && s1({ mode: 'ci', kind: 'prop', k: 3, n: 30 }, 'minCover.clopper-pearson') >= 0.95 - 1e-12, 'Wald\'s worst coverage collapses near the edges; Clopper–Pearson never falls below 95 %');
  ok(allRel(S({ mode: 'ci', kind: 'mean', x: [1.2, 2.4, 1.3, 1.3, 0, 1.0, 1.8, 0.8, 4.6, 1.4] }, ['lo', 'hi']), [0.7001142, 2.4598858], 1e-7), 'the t interval of a mean (sleep data)');
  ok(near(s1({ mode: 'power', kind: 'z-one', effect: 0.5, n: 25, alt: 'greater' }, 'power'), 0.803764940015494, 1e-12), 'P20 one-sided z, α = 0.05, d = 0.5, n = 25: power 0.8038');
  const pw = S({ mode: 'power', kind: 't-two', effect: 0.5 }, ['nExact', 'nNeeded']);
  ok(near(pw[0], 63.76561058891169, 1e-6) && pw[1] === 64, 'P20 two-sample t, d = 0.5, power 0.8: n = 63.77 → 64 per group (Cohen 1988; statsmodels)');
  ok(near(s1({ mode: 'power', kind: 't-one', effect: 0.5, n: 20 }, 'power'), 0.5645044184390203, 1e-9), 'one-sample t, n = 20, d = 0.5: power 0.5645 (noncentral t)');
  const bb = S({ mode: 'bayes', kind: 'beta-binomial', prior: { a: 1, b: 1 }, k: 7, n: 20 }, ['postA', 'postB', 'postMean', 'ciLo', 'ciHi', 'hpdLo', 'hpdHi']);
  ok(bb[0] === 8 && bb[1] === 14 && near(bb[2], 8 / 22, 1e-15) && near(bb[3], 0.18107163, 1e-8) && near(bb[4], 0.56967548, 1e-8) && bb[6] - bb[5] < bb[4] - bb[3], 'P21 Beta(1, 1) + 7/20 → Beta(8, 14): mean 0.3636, 95 % (0.1811, 0.5697); the HPD interval is shorter');
  const gp = S({ mode: 'bayes', kind: 'gamma-poisson', prior: { a: 2, b: 1 }, sum: 10, t: 4 }, ['postMean', 'ciLo', 'ciHi']);
  ok(near(gp[0], 2.4, 1e-15) && near(gp[1], 1.24011502, 1e-8) && near(gp[2], 3.9364077, 1e-7), 'P22 Gamma(2, 1) + 10 events in 4 → Gamma(12, 5): mean 2.4, 95 % (1.2401, 3.9364)');
  ok(iss({ mode: 'bayes', kind: 'beta-binomial', prior: { a: 0, b: 0 }, k: 0, n: 10 }, 'improper-posterior') === 1, 'Haldane\'s prior with 0 successes: improper-posterior');
}

// ===== screening, Simpson, multiple tests =====
{
  const sc = X({ mode: 'screen', prev: 0.01, sens: 0.9, spec: 0.91 });
  ok(near(sc.scalar('ppv'), 0.009 / (0.009 + 0.0891), 1e-15) && near(sc.scalar('lrPos'), 10, 1e-12) && sc.scene('icons') && sc.scene('icons').items.length > 0, 'a screening test at 1 % prevalence (Gigerenzer 2002): PPV = 9.2 %, LR+ = 10, the icon array');
  const sp = S({ mode: 'simpson', strata: [{ k1: 81, n1: 87, k2: 234, n2: 270 }, { k1: 192, n1: 263, k2: 55, n2: 80 }] }, ['pooled1', 'pooled2', 'paradox', 'mhOR']);
  ok(near(sp[0], 273 / 350, 1e-15) && near(sp[1], 289 / 350, 1e-15) && sp[2] === 1 && near(sp[3], 1.4468, 1e-4), 'kidney stones (Charig et al. 1986): A wins in each stratum, B pooled (78 % vs 83 %): paradox; Mantel–Haenszel OR 1.45');
  const P = [0.01, 0.04, 0.03, 0.005], adj = meth => S({ mode: 'multi', p: P, method: meth }, ['adj.0', 'adj.1', 'adj.2', 'adj.3']);
  ok(allRel(adj('holm'), [0.03, 0.06, 0.06, 0.02], 1e-14) && allRel(adj('hochberg'), [0.03, 0.04, 0.04, 0.02], 1e-14) && allRel(adj('by'), [0.04166666666666666, 0.08333333333333331, 0.08333333333333331, 0.04166666666666666], 1e-14) && allRel(adj('bh'), [0.02, 0.04, 0.04, 0.02], 1e-14) && allRel(adj('bonferroni'), [0.04, 0.16, 0.12, 0.02], 1e-14), 'adjusted p values: Holm, Hochberg, BH, BY, Bonferroni (R p.adjust)');
  const sim = S({ mode: 'multi', method: 'bonferroni', sim: { m: 20, m0: 20, effect: 0, reps: 2000 } }, ['simFwerRaw', 'simFwer']);
  ok(near(sim[0], 1 - Math.pow(0.95, 20), 0.03) && sim[1] < 0.07, '20 true nulls: 64 % chance of a false positive unadjusted, ≤ 5 % after Bonferroni');
}

// ===== Markov chains, walks, branching, queues, bootstrap (P23–P25) =====
{
  const mk = S({ mode: 'markov', states: ['A', 'B'], P: [[0.9, 0.1], [0.5, 0.5]] }, ['pi.A', 'pi.B', 'period', 'ret.A', 'hit.B']);
  ok(near(mk[0], 5 / 6, 1e-15) && near(mk[1], 1 / 6, 1e-15) && mk[2] === 1 && near(mk[3], 1.2, 1e-14), 'P24 [[0.9, 0.1], [0.5, 0.5]]: π = (5/6, 1/6) (GTH), aperiodic, mean return time to A = 1/π_A');
  const ab = S({ mode: 'markov', states: ['a', 'b', 'c'], P: [[1, 0, 0], [0.5, 0, 0.5], [0, 0, 1]], start: 'b' }, ['absorb.a', 'tAbsorb', 'absorbing']);
  ok(near(ab[0], 0.5, 1e-15) && near(ab[1], 1, 1e-15) && ab[2] === 2, 'an absorbing chain: two absorbing states; from b, absorbed in a with probability ½ after 1 step');
  ok(iss({ mode: 'markov', states: ['A', 'B'], P: [[0.9, 0.2], [0.5, 0.5]] }, 'not-stochastic') === 1 && iss({ mode: 'markov', states: ['A', 'B'], P: [[1, 0], [0, 1]] }, 'reducible') === 1 && iss({ mode: 'markov', states: ['A', 'B'], P: [[0, 1], [1, 0]] }, 'periodic') === 1, 'codes: a row summing to 1.1 (not-stochastic), two closed classes (reducible), a flip-flop (periodic)');
  ok(X({ mode: 'markov', states: ['A', 'B'], P: [[0.9, 0.1], [0.5, 0.5]] }).scene('diagram').items.length > 0, 'the chain\'s diagram scene');
  const ru = S({ mode: 'walk', kind: 'ruin', p: 0.4, N: 10, i: 5, reps: 2000 }, ['pWin', 'duration', 'simWin']);
  ok(near(ru[0], 32 / 275, 1e-14) && near(ru[1], 19.181818181818, 1e-11) && near(ru[2], 32 / 275, 0.03), 'P23 gambler\'s ruin p = 0.4, N = 10, i = 5: P(win) = 32/275, E[duration] = 19.18; the simulation agrees');
  ok(near(s1({ mode: 'walk', kind: 'srw', steps: 20 }, 'pZero'), 0.17619705200195312, 1e-15), 'P25 the simple random walk: P(S₂₀ = 0) = C(20, 10)/2²⁰');
  const gw = S({ mode: 'walk', kind: 'galton-watson', offspring: [0.25, 0.25, 0.5], reps: 1000, gens: 30 }, ['m', 'extinct', 'simExtinct']);
  ok(near(gw[0], 1.25, 1e-15) && near(gw[1], 0.5, 1e-12) && near(gw[2], 0.5, 0.05), 'Galton–Watson with offspring ¼, ¼, ½: m = 1.25, extinction probability ½ (the root of G(s) = s)');
  const qu = S({ mode: 'queue', lambda: 2, mu: 3, c: 1 }, ['rho', 'l', 'w', 'p0']);
  ok(near(qu[0], 2 / 3, 1e-15) && near(qu[1], 2, 1e-14) && near(qu[2], 1, 1e-14) && near(qu[3], 1 / 3, 1e-15), 'M/M/1, λ = 2, μ = 3: ρ = ⅔, L = 2, W = 1 (Little\'s law L = λW)');
  ok(near(s1({ mode: 'queue', lambda: 2, mu: 1, c: 3 }, 'erlangC'), 4 / 9, 1e-14) && iss({ mode: 'queue', lambda: 3, mu: 1, c: 2 }, 'unstable') === 1, 'M/M/3 with a = 2: Erlang C = 4/9; λ ≥ cμ: unstable');
  const bt = S({ mode: 'bootstrap', x: [1.2, 2.4, 1.3, 1.3, 0, 1.0, 1.8, 0.8, 4.6, 1.4], B: 2000 }, ['estimate', 'se', 'pctLo', 'pctHi', 'bcaLo', 'bcaHi']);
  ok(near(bt[0], 1.58, 1e-14) && near(bt[1], 0.3888 * Math.sqrt(0.9), 0.05) && bt[2] < 1.58 && bt[3] > 1.58 && bt[4] < bt[5], 'the bootstrap of a mean (Efron 1979): its SE ≈ s/√n·√((n−1)/n), percentile and BCa intervals around it');
}

// ===== edge cases reported as codes =====
{
  ok(iss({ mode: 'dist', dist: { family: 'geometric', p: 0 } }, 'param', 'mean') === 1 && iss({ mode: 'dist', dist: { family: 'normal', sigma: -1 } }, 'param', 'mean') === 1, 'impossible parameters (geometric p = 0, σ < 0): param');
  ok(iss({ mode: 'dist', dist: { family: 'binomial', n: 5, p: 1 } }, 'degenerate', 'mean') === 1 && iss({ mode: 'dist', dist: { family: 'poisson', lambda: 0 } }, 'degenerate', 'mean') === 1 && iss({ mode: 'dist', dist: { family: 'normal', sigma: 0 } }, 'param', 'mean') === 1, 'a point mass (binomial p = 1, Poisson λ = 0): degenerate; a normal needs σ > 0 (param)');
  const ca = X({ mode: 'dist', dist: { family: 'cauchy' } });
  ok(Number.isNaN(ca.scalar('mean')) && ca.issues['moment-undefined'] >= 1, 'the Cauchy mean is undefined: NaN with moment-undefined, never a number');
  ok(iss({ mode: 'dist', dist: { family: 'pareto', alpha: 1 } }, 'moment-infinite', 'mean') === 1 && s1({ mode: 'dist', dist: { family: 'pareto', alpha: 1 } }, 'mean') === Infinity && s1({ mode: 'dist', dist: { family: 't', df: 1.5 } }, 'var') === Infinity, 'Pareto α = 1 mean and t ν = 1.5 variance are infinite: moment-infinite');
  ok(iss({ mode: 'dist', dist: { family: 'beta', a: 0.5, b: 0.5 }, x: 0 }, 'pdf-infinite', 'pdf') === 1, 'beta(½, ½) density at 0: pdf-infinite');
  ok(iss({ mode: 'dist', dist: { family: 'categorical', probs: [1, 1, 2] } }, 'normalized', 'mean') === 1, 'categorical weights that do not sum to 1 are normalised and say so');
  ok(iss({ mode: 'walk', kind: 'galton-watson', offspring: [0.1, 0.2, 0.7], reps: 20000, gens: 200 }, 'budget', 'simExtinct') === 1, 'a branching simulation that would exceed its work budget stops with budget');
}

// ===== the checker =====
{
  const base = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'prob@1', model, outputs: outs || [{ id: 'a', kind: 'scalar', of: 'mean' }] });
  const codes = s => M.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
  const has = (s, c) => codes(s).includes(c);
  ok(codes(base({ mode: 'dist', dist: { family: 'normal', mu: 'm', sigma: 2 } })).length === 0, 'a good spec has no errors');
  ok(has(base({ mode: 'dice' }), 'enum@model.mode'), 'an unknown mode');
  ok(has(base({ mode: 'dist', dist: { family: 'zipf' } }), 'enum@model.dist.family'), 'an unknown family');
  ok(has(base({ mode: 'dist', dist: { family: 'uniform', a: 2, b: 1 } }), 'value@model.dist.b'), 'uniform with b < a');
  ok(has(base({ mode: 'dist', dist: { family: 'gamma', shape: 2, rate: 1, scale: 1 } }), 'value@model.dist.scale'), 'gamma with both rate and scale');
  ok(has(base({ mode: 'dist', dist: { family: 'hypergeometric', N: 10, K: 12, n: 3 } }), 'value@model.dist.K'), 'hypergeometric with K > N');
  ok(has(base({ mode: 'dist', dist: { family: 'normal' }, p: 1.5 }), 'value@model.p'), 'a probability outside [0, 1]');
  ok(has(base({ mode: 'test', kind: 't-paired', x: [1, 2] }, [{ id: 'a', kind: 'scalar', of: 'p' }]), 'value@model'), 'a paired test without y');
  ok(has(base({ mode: 'test', kind: 'fisher', table: [[1, 2, 3], [4, 5, 6]] }, [{ id: 'a', kind: 'scalar', of: 'p' }]), 'value@model.table'), 'Fisher on a 2 × 3 table');
  ok(has(base({ mode: 'ci', kind: 'prop', k: 1, n: 5, method: 'chi2' }, [{ id: 'a', kind: 'scalar', of: 'lo' }]), 'value@model.method'), 'a method that is not one for proportions');
  ok(has(base({ mode: 'markov', states: ['A', 'B'], P: [[1, 0]] }, [{ id: 'a', kind: 'scalar', of: 'pi.A' }]), 'value@model.P'), 'a transition matrix with too few rows');
  ok(has(base({ mode: 'markov', states: ['A', 'A'], P: [[1, 0], [0, 1]] }, [{ id: 'a', kind: 'scalar', of: 'period' }]), 'value@model.states[1]'), 'a state listed twice');
  ok(has(base({ mode: 'markov', states: ['A', 'B'], P: [[1, 0], [0, 1]] }, [{ id: 'a', kind: 'scalar', of: 'pi.C' }]), 'output@outputs[0].of'), 'the stationary probability of a state that is not there');
  ok(codes(base({ mode: 'simpson', strata: [{ k1: 1, n1: 2, k2: 1, n2: 2 }, { k1: 1, n1: 2, k2: 1, n2: 2 }] }, [{ id: 'a', kind: 'scalar', of: 'rate1.1' }])).length === 0 && has(base({ mode: 'simpson', strata: [{ k1: 1, n1: 2, k2: 1, n2: 2 }] }, [{ id: 'a', kind: 'scalar', of: 'rate1.1' }]), 'output@outputs[0].of'), 'per-stratum outputs are numbered within the strata');
  ok(has(base({ mode: 'mc', draws: { n: { family: 'normal' } }, expr: 'n' }, [{ id: 'a', kind: 'scalar', of: 'estimate' }]), 'value@model.draws.n'), 'a draw named like a spec name');
  ok(has(base({ mode: 'dist', dist: { family: 'normal' } }, [{ id: 'a', kind: 'series', of: 'mean' }]), 'output@outputs[0].of'), 'a scalar asked as a series');
  ok(codes(base({ mode: 'dist', dist: { family: 'normal' } }, [{ id: 'a', kind: 'scalar', of: 'issue.underflow' }])).length === 0, 'issue counts are scalars (issue.<code>)');
  ok(M.checkSpec(base({ mode: 'dist', dist: { family: 'normal' }, zz: 1 })).some(p => p.level === 'warning' && p.code === 'unknown-field'), 'an unknown field is a warning');
  const ex = M.exprs({ model: { mode: 'mc', draws: { X: { family: 'normal', mu: 'm' } }, expr: 'X > c', n: 'nn' } });
  ok(JSON.stringify(ex) === JSON.stringify([['m', 'model.draws.X.mu', []], ['X > c', 'model.expr', ['X']], ['nn', 'model.n', []]]), 'exprs lists the model\'s expressions; a Monte Carlo expression knows its draws as names');
  ok(JSON.stringify(M.keys({ model: { mode: 'markov', states: ['a', 'b'], labels: ['sun', 'rain'], P: [[1, 0], [0, 1]] } })) === JSON.stringify([['sun', 'model.labels[0]'], ['rain', 'model.labels[1]']]), 'keys: the state labels are string keys');
}

// ===== the adapter, the Worker, speed, the golden data of the former Python twin =====
{
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'ci-coverage', 'spec.json'), 'utf8'));
  ok(M.checkSpec(spec).filter(p => p.level === 'error').length === 0, 'the reference activity ci-coverage has a valid spec');
  const sim = M.engine.create(spec), r = sim.run({ n: 30, p: 0.1 });
  ok(near(r.waldAt, 0.8085213615694747, 1e-12) && near(r.wilsonAt, 0.9741732113380898, 1e-12) && r.ps.length === 197 && r.waldCover.length === 197, 'the adapter: create(spec).run(inputs) gives the declared outputs');
  ok(M.engine.check({ format: 'noema.sim-spec/v1', engine: 'prob@1', model: { mode: 'x' }, outputs: [] }).length >= 1, 'engine.check gives the errors as messages');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const wr = ctx.self.noemaEngine.create(spec).run({ n: 30, p: 0.1 });
  ok(wr.waldAt === r.waldAt && JSON.stringify(wr.wilsonCover) === JSON.stringify(r.wilsonCover), 'the Worker source in a fresh context gives the same outputs');
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) sim.run({ n: 20 + i * 9, p: 0.05 + i * 0.04 });
  const typ = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  ok(typ < 50, `a typical run < 50 ms (${typ.toFixed(2)} ms)`);
  const sp = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'prob@1', model, outputs: outs });
  const worst = [
    sp({ mode: 'ci', kind: 'prop', k: 700, n: 2000, points: 2000 }, ['wald', 'wilson', 'agresti-coull', 'clopper-pearson', 'jeffreys'].map((m, i) => ({ id: 'c' + i, kind: 'series', of: 'cover.' + m }))),
    sp({ mode: 'mc', draws: { X: { family: 'gamma', shape: 0.3 }, Y: { family: 'beta', a: 0.5, b: 2 } }, expr: 'X * Y > 0.1', n: 200000 }, [{ id: 'e', kind: 'scalar', of: 'estimate' }]),
    sp({ mode: 'sampling', parent: { family: 'lognormal', sigma: 1.5 }, size: 100, reps: 10000 }, [{ id: 'e', kind: 'scalar', of: 'statSd' }]),
    sp({ mode: 'bootstrap', x: Array.from({ length: 2000 }, (_, i) => Math.sin(i) * 3 + i / 500), B: 2000, stat: 'median' }, [{ id: 'e', kind: 'scalar', of: 'bcaLo' }]),
    sp({ mode: 'walk', kind: 'galton-watson', offspring: [0.1, 0.2, 0.7], reps: 20000, gens: 200 }, [{ id: 'e', kind: 'scalar', of: 'simExtinct' }]),
    sp({ mode: 'markov', states: Array.from({ length: 100 }, (_, i) => 's' + i), P: Array.from({ length: 100 }, (_, i) => Array.from({ length: 100 }, (_, j) => (j === (i + 1) % 100 ? 0.5 : 0.5 / 99))), steps: 1000 }, [{ id: 'e', kind: 'scalar', of: 'mixTime' }])
  ];
  const outs = [], times = worst.map(s => { const t = process.hrtime.bigint(); outs.push(M.engine.create(s).run({})); return Number(process.hrtime.bigint() - t) / 1e6; });
  ok(times.every(t => t < 2000) && outs.every(o => Object.values(o).every(v => Array.isArray(v) ? v.length > 0 : Number.isFinite(v))), `the worst allowed runs (coverage at n = 2000, 2e5 draws, 1e4 samples of 100, 2000 bootstrap medians of 2000 with BCa, a 200-generation branching process, a 100-state chain) each < 2 s (${times.map(t => t.toFixed(0)).join(', ')} ms)`);
  ok(Number.isNaN(M.engine.create(sp({ mode: 'sampling', parent: { family: 'normal' }, size: 1000, reps: 10000 }, [{ id: 'e', kind: 'scalar', of: 'statSd' }])).run({}).e) && iss({ mode: 'sampling', parent: { family: 'normal' }, size: 1000, reps: 10000 }, 'budget', 'statSd') === 1 && iss({ mode: 'bootstrap', x: Array.from({ length: 2000 }, (_, i) => i), B: 20000 }, 'budget', 'se') === 1, 'work over the budget (1e7 draws, 4e7 resampled values) is refused up front with budget, never run for seconds');
  ok(Number.isNaN(M.engine.create(sp({ mode: 'dist', dist: { family: 'normal', sigma: 'q' } }, [{ id: 'm', kind: 'scalar', of: 'mean' }])).run({}).m), 'a number that does not compute gives NaN, never throws');
  const pyData = want('data', undefined, M.DATA);
  ok(JSON.stringify(pyData) === JSON.stringify(M.DATA), 'the golden tables of the former twin tools/lib_prob.py hold the same DATA (schema, outputs, names) as the JS module');
}

// ===================================================================================================================
// the later modes: far t/F tails, combin, gof, mcmc, multivar, rand (docs/library/prob.md §19–§24)
// ===================================================================================================================
// ===== the t and F tails at huge degrees of freedom (mpmath at 40 digits: betainc, or quad of the density) =====
{
  ok(rel(M.tsf(10, 1e6), 7.6393053840891248e-24, 3e-15) && rel(M.tsf(5, 1e6), 2.8669989354453708e-7, 1e-15) && rel(M.tsf(20, 1e7), 2.7647156034788507e-89, 1e-14) && rel(M.tsf(10, 1e5), 7.816507650103639e-24, 2e-15), 'the t tail at ν = 1e5 … 1e7 to full precision (was 2.5e-12 at ν = 1e6): the density\'s integral by exp-sinh (Takahasi & Mori 1974; mpmath betainc)');
  ok(rel(M.tsf(3, 1e8), 0.0013498983640187472, 2e-15) && rel(M.tsf(8, 1e12), 6.2209605808397365e-16, 2e-15) && rel(M.tsf(-3, 1e6), 0.9986500687292891, 1e-15) && rel(M.tsf(1.96, 1e10), 0.024997895162084872, 1e-15), 't tails at ν = 1e8, 1e12, the lower side, ν = 1e10 (mpmath)');
  const F = (x, a, b) => L({ family: 'f', d1: a, d2: b }).sf(x);
  ok(rel(F(5, 3, 1e7), 0.0018166579395586773, 1e-14) && rel(F(2, 5, 1e6), 0.0752362378553057, 1e-14) && rel(F(1.5, 10, 1e6), 0.13206377033516373, 1e-15) && rel(F(1.01, 1e6, 1e6), 3.2597907372698106e-7, 5e-14), 'the F upper tail with d2 ≥ 1e6 (was 4.6e-12 at d2 = 1e7; mpmath betainc and quad — scipy itself is off by 1.8e-11 at F(10, 1e6))');
}
// ===== combin: the multinomial, the coupon collector, the birthday problem (exact rationals in Python fractions) =====
{
  const mn = S({ mode: 'combin', kind: 'multinomial', n: 6, probs: [0.2, 0.3, 0.5], x: [1, 2, 3] }, ['pmf', 'cov', 'corr', 'outcomes']);
  ok(rel(mn[0], 0.135, 1e-14) && rel(mn[1], -0.36, 1e-14) && rel(mn[2], -Math.sqrt(0.06 / 0.56), 1e-14) && rel(mn[3], 28, 1e-12), 'P26 Multinomial(6; .2, .3, .5) pmf(1, 2, 3) = 0.135; cov = −np₁p₂; C(8, 2) = 28 outcomes');
  ok(rel(s1({ mode: 'combin', kind: 'multinomial', n: 6, probs: [0.2, 0.3, 0.5], x: [0, 1, 5] }, 'pExact'), 0.348625, 1e-13) && rel(s1({ mode: 'combin', kind: 'multinomial', n: 6, probs: [0.2, 0.3, 0.5], x: [0, 1, 5] }, 'pmf'), 0.05625, 1e-14), 'the exact multinomial test of (0, 1, 5): p = 0.348625 (enumeration in exact rationals)');
  const cu = S({ mode: 'combin', kind: 'coupon', types: 6, m: 20 }, ['eT', 'varT', 'pDone']);
  ok(rel(cu[0], 14.7, 1e-15) && rel(cu[1], 38.99, 1e-14), 'P25 the coupon collector, n = 6: E T = 6·H₆ = 14.7, Var T = 36·H⁽²⁾₆ − 14.7 = 38.99');
  ok(near(cu[2], 0.847987540885421, 1e-14), 'P(T ≤ 20) for 6 equal coupons (the chain of the number collected; = Σ (−1)^j C(6, j)(1 − j/6)^20)');
  const cuu = S({ mode: 'combin', kind: 'coupon', probs: [0.5, 0.3, 0.2], m: 10 }, ['eT', 'varT', 'pDone']);
  ok(rel(cuu[0], 6.654761904761905, 1e-14) && rel(cuu[1], 16.074971655328795, 1e-13) && rel(cuu[2], 0.8643843, 1e-14), 'unequal probabilities (½, 0.3, 0.2): E T = 559/84 (inclusion–exclusion), Var T, P(T ≤ 10) = 0.8643843 (the subset chain in exact rationals)');
  const dx = S({ mode: 'combin', kind: 'coupon', types: 6, copies: 2, m: 30 }, ['eT', 'varT', 'pDone']);
  ok(rel(dx[0], 24.133869197530863, 1e-13) && rel(dx[1], 56.88941486511293, 1e-12) && rel(dx[2], 0.8285481546157191, 1e-13), 'the double dixie cup (Newman & Shepp 1960), 6 types, 2 copies each: E T = 24.1338691975, Var, P(T ≤ 30) (an exact chain in Python fractions)');
  ok(rel(s1({ mode: 'combin', kind: 'coupon', types: 10, want: 5 }, 'eT'), 10 * (1 / 10 + 1 / 9 + 1 / 8 + 1 / 7 + 1 / 6), 1e-15), 'a partial collection: 5 of 10 types, E T = Σ 10/(10 − i)');
  const bd = S({ mode: 'combin', kind: 'birthday', people: 23 }, ['pMatch', 'nFor', 'expPairs']);
  ok(rel(bd[0], 0.5072972343239854, 1e-15) && bd[1] === 23 && rel(bd[2], 253 / 365, 1e-15), 'P25 the birthday problem: P(a shared day among 23) = 0.50729723432398 (exact rational), 23 people reach ½');
  const b3 = S({ mode: 'combin', kind: 'birthday', people: 88, k: 3 }, ['pMatch', 'nFor']), b4 = S({ mode: 'combin', kind: 'birthday', people: 187, k: 4 }, ['pMatch', 'nFor']);
  ok(rel(b3[0], 0.5110651106247305, 1e-13) && b3[1] === 88 && rel(b4[0], 0.5026853731889762, 1e-13) && b4[1] === 187, 'three and four people on one day: 88 and 187 people reach ½ (Diaconis & Mosteller 1989), P = 0.51106511 and 0.50268537 (exact rationals)');
  ok(rel(s1({ mode: 'combin', kind: 'birthday', probs: [1, 2, 3, 4, 5], people: 4 }, 'pMatch'), 0.8701037037037037, 1e-14), 'unequal day weights (1 … 5 over 5 days), 4 people: P(a shared day) by enumeration');
  ok(s1({ mode: 'combin', kind: 'birthday', people: 366 }, 'pMatch') === 1 && s1({ mode: 'combin', kind: 'birthday', days: 10, people: 25, k: 3 }, 'pMatch') === 1, 'the pigeonhole: 366 people, or 25 people in 10 days with k = 3, always share');
  ok(iss({ mode: 'combin', kind: 'coupon', probs: [1, 1, 2] }, 'normalized', 'eT') === 1 && iss({ mode: 'combin', kind: 'multinomial', n: 6, probs: [0.2, 0.8], x: [1, 2] }, 'param', 'pmf') === 1, 'weights normalised with the code; counts that do not sum to n: param');
}
// ===== gof: Kolmogorov–Smirnov, Shapiro–Wilk, Anderson–Darling, χ² (scipy 1.18 exact methods; mpmath for n > 140) =====
{
  const xs = [0.61, 0.29, 0.06, 0.59, -1.73, -0.74, 0.51, -0.56, 0.39, 1.64, 0.05, -0.06, 0.64, -0.82, 0.37, 1.77, 1.09, -1.28, 2.36, 1.31, 1.05, -0.32, -0.4, 1.06, -2.47];
  const k1 = S({ mode: 'gof', kind: 'ks-one', x: xs, dist: { family: 'normal' } }, ['stat', 'p', 'pAsym']);
  ok(rel(k1[0], 0.17409188119887736, 1e-14) && rel(k1[1], 0.38974117186791835, 1e-13) && rel(k1[2], 0.4347819632404429, 1e-12), 'one-sample KS against N(0, 1), n = 25: D = 0.174092, exact p = 0.389741 (Durbin matrix, Marsaglia, Tsang & Wang 2003; scipy kstest exact), asymptotic 0.434782');
  ok(rel(s1({ mode: 'gof', kind: 'ks-one', x: xs, dist: { family: 'normal' }, alt: 'greater' }, 'p'), 0.9061392883307542, 1e-13) && rel(s1({ mode: 'gof', kind: 'ks-one', x: xs, dist: { family: 'normal' }, alt: 'less' }, 'p'), 0.19617997511647292, 1e-13), 'one-sided KS: the exact Smirnov law (Birnbaum & Tingey 1951; scipy)');
  ok(rel(M.kolmSf(20, 0.3), 0.04306706665851623, 1e-12) && rel(M.kolmSf(100, 0.2), 5.551927327988775e-4, 1e-11) && rel(M.kolmSf(500, 0.05), 0.15866263922061995, 1e-12) && rel(M.kolmSf(1000, 0.03), 0.32269024641329994, 1e-12) && rel(M.kolmSf(10, 0.6), 5.681672e-4, 1e-12), 'the Kolmogorov law P(D_n ≥ d) exactly to n = 1000 (mpmath at 50 digits on the same matrix; scipy kstwo agrees to 1e-12 for n ≤ 140 and to 2e-7 beyond, where it switches to Pelz–Good)');
  const k2 = S({ mode: 'gof', kind: 'ks-two', x: xs.slice(0, 10), y: xs.slice(10, 22) }, ['stat', 'p']);
  ok(rel(k2[0], 0.4, 1e-15) && rel(k2[1], 0.2829492488935213, 1e-13) && rel(s1({ mode: 'gof', kind: 'ks-two', x: xs.slice(0, 10), y: xs.slice(10, 22), alt: 'greater' }, 'p'), 0.14180092353466967, 1e-13), 'two-sample KS, 10 vs 12: D = 0.4, exact p = 0.282949 (Hodges 1957 lattice paths; scipy ks_2samp exact), one-sided 0.141801');
  // ties: the exact conditional law, checked against the brute-force permutation distribution (all C(7, 3) splits)
  { const a = [1, 2, 2], b = [2, 3, 3, 4], all = a.concat(b); let hit = 0, tot = 0; const D = (u, v) => { let d = 0; for (const t of new Set(all)) d = Math.max(d, Math.abs(u.filter(z => z <= t).length / u.length - v.filter(z => z <= t).length / v.length)); return d; }; const d0 = D(a, b);
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) for (let k = j + 1; k < 7; k++) { const u = [all[i], all[j], all[k]], v = all.filter((_, q) => q !== i && q !== j && q !== k); tot++; if (D(u, v) >= d0 - 1e-12) hit++; }
    const r = X({ mode: 'gof', kind: 'ks-two', x: a, y: b }); ok(near(r.scalar('p'), hit / tot, 1e-14) && r.issues.ties === 1, `two-sample KS with ties: the exact law given the tie pattern (Schröer & Trenkler 1995) = the permutation count ${hit}/${tot}`); }
  const sw = S({ mode: 'gof', kind: 'shapiro-wilk', x: [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236] }, ['w', 'p']);
  ok(rel(sw[0], 0.7888146948353875, 1e-14) && rel(sw[1], 0.006703814056502984, 1e-11), 'Shapiro–Wilk (Royston 1995, AS R94), the 11 weights of R\'s shapiro.test example: W = 0.78881, p = 0.006704 (scipy shapiro, the same Fortran)');
  const sw3 = S({ mode: 'gof', kind: 'shapiro-wilk', x: [1, 2, 4] }, ['w', 'p']);
  ok(rel(sw3[0], 0.9642857142857143, 1e-13) && rel(sw3[1], 0.6368868450289701, 1e-8), 'Shapiro–Wilk at n = 3: the exact p = (6/π)(asin √W − π/3) (scipy)');
  const ad = S({ mode: 'gof', kind: 'anderson-darling', x: [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236], estimate: true }, ['stat', 'statAdj', 'p']);
  ok(rel(ad[0], 0.9467718795988862, 1e-13) && rel(ad[1], 0.9467718795988862 * (1 + 0.75 / 11 + 2.25 / 121), 1e-14) && rel(ad[2], Math.exp(1.2937 - 5.709 * ad[1] + 0.0186 * ad[1] * ad[1]), 1e-14), 'Anderson–Darling for normality, μ and σ estimated: A² = 0.94677 (scipy anderson), A*² and the p of D\'Agostino & Stephens 1986 Table 4.9 (nortest ad.test)');
  ok(near(M.adInf(1.933), 0.90, 2e-5) && near(M.adInf(2.492), 0.95, 2e-5), 'the limiting AD law (Marsaglia & Marsaglia 2004) at the classic critical values 1.933 (10 %) and 2.492 (5 %) of Anderson & Darling 1954');
  ok(iss({ mode: 'gof', kind: 'shapiro-wilk', x: [1, 1, 1, 1] }, 'zero-range', 'w') === 1 && iss({ mode: 'gof', kind: 'ks-one', x: [1, 2, 2, 3], dist: { family: 'poisson', lambda: 2 } }, 'discrete', 'p') === 1 && iss({ mode: 'gof', kind: 'chi2-fit', x: [0.1, 0.2, 0.5, 0.7], dist: { family: 'uniform', a: 0, b: 1 }, bins: 4 }, 'low-expected', 'p') === 4, 'edge codes: zero-range (Shapiro–Wilk of constant data), discrete (KS against a discrete law is conservative), low-expected per χ² cell');
  ok(rel(s1({ mode: 'gof', kind: 'chi2-fit', x: [0.1, 0.25, 0.33, 0.4, 0.52, 0.6, 0.71, 0.8, 0.93, 0.97, 0.11, 0.2, 0.3, 0.44, 0.55], dist: { family: 'uniform', a: 0, b: 1 }, bins: 5 }, 'p'), 0.8556951983876533, 1e-12), 'χ² of 15 values in 5 equiprobable cells of U(0, 1): X² = 4/3, df 4, p = Q(2, 2/3) (scipy chi2.sf)');
}
// ===== mcmc: samplers and the diagnostics of Vehtari et al. 2021 (a Python port of posterior's ess_basic / rhat on the same chains) =====
{
  const ch = []; for (let c = 0; c < 4; c++) { const a = []; let x = c * 0.3; for (let t = 0; t < 501; t++) { x = 0.7 * x + Math.sin(t * 1.37 + c * 2.1) + 0.5 * Math.cos(t * t * 0.011 + c); a.push(x); } ch.push(Float64Array.from(a)); }
  const d = M.diagnose(ch);
  ok(rel(d.ess, 1179.0020932016535, 1e-12) && rel(d.rhat, 1.0007783568740913, 1e-13) && rel(d.essTail, 976.8790894493137, 1e-11), 'rank-normalised split R̂, bulk and tail ESS of 4 fixed chains of 501 = posterior\'s algorithm (Geyer\'s initial monotone sequence; numpy FFT autocovariances)');
  const bv = S({ mode: 'mcmc', kind: 'gibbs-bivnormal', rho: 0.9, iters: 4000 }, ['mean.x', 'sd.x', 'rhat.x', 'ess.x', 'mcse.x']);
  ok(Math.abs(bv[0]) < 4 * bv[4] && near(bv[1], 1, 0.06) && bv[2] < 1.01 && bv[3] > 400 && bv[3] < 2000, 'Gibbs on a bivariate normal ρ = 0.9: mean 0 within 4 MCSE, sd 1, R̂ < 1.01, ESS far below the 8000 draws (the lag-1 correlation ρ² of x)');
  const mh = S({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2/2', params: ['a'], init: [0], scale: [2.4], iters: 4000 }, ['accept', 'mean.a', 'sd.a', 'mcse.a']);
  ok(near(mh[0], 0.44, 0.03) && Math.abs(mh[1]) < 4 * mh[3] && near(mh[2], 1, 0.06), 'random-walk Metropolis on N(0, 1) with step 2.4: acceptance ≈ 0.44 (Gelman, Roberts & Gilks 1996), mean and sd right');
  const gn = S({ mode: 'mcmc', kind: 'gibbs-normal', x: [1.2, 2.4, 1.3, 1.3, 0, 1.0, 1.8, 0.8, 4.6, 1.4], iters: 4000 }, ['mean.mu', 'mcse.mu', 'q50.sigma']);
  ok(Math.abs(gn[0] - 1.58) < 4 * gn[1] + 0.01 && near(gn[2], 1.3, 0.25), 'Gibbs for the normal model with vague priors on the sleep data: μ ≈ x̄ = 1.58, σ ≈ s = 1.23 (BDA3 §3.2: the marginal of μ is t₉)');
  const stuck = X({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2/2', params: ['a'], init: [0], scale: [100], iters: 2000, chains: 4 });
  ok(stuck.scalar('accept') < 0.1 && stuck.issues['accept-extreme'] === 1 && stuck.issues['low-ess'] === 1, 'a proposal 100× too wide: acceptance < 10 %, accept-extreme and low-ess');
  const far = X({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2/2', params: ['a'], init: [0], scale: [0.05], iters: 400, chains: 4, spread: 50 });
  ok(far.scalar('rhat.a') > 1.1 && far.issues['not-converged'] === 1, 'chains started far apart with tiny steps: R̂ > 1.1, not-converged');
  ok(iss({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2/2', params: ['a'], init: [0], iters: 200000, chains: 8 }, 'budget', 'accept') === 1, '8 chains of 2e5 density evaluations exceed the budget');
}
// ===== multivar (NIST StRD Longley certified values; statsmodels 0.15 Logit on Spector & Mazzeo 1980; scipy; mpmath) =====
{
  const mv = S({ mode: 'multivar', kind: 'mvnormal', mu: [0, 0], cov: [[1, 0.5], [0.5, 1]], x: [0.5, -0.3] }, ['logpdf', 'cdf', 'maha', 'pEllipse']);
  ok(rel(mv[0], -2.0207026968501216, 1e-14) && rel(mv[1], 0.330358506178733099, 1e-14) && rel(mv[2], 0.6533333333333334, 1e-14) && rel(mv[3], 1 - Math.exp(-0.6533333333333334 / 2), 1e-14), 'the bivariate normal ρ = ½ at (½, −0.3): log density (scipy), P(X ≤ x) = 0.3303585061787331 (mpmath quad), Mahalanobis d² and its χ²₂ probability');
  ok(rel(s1({ mode: 'multivar', kind: 'mvnormal', mu: [1, 2], cov: [[4, -1.6], [-1.6, 1]], x: [-1, 3.5] }, 'cdf'), 0.105702794546736952, 1e-13) && iss({ mode: 'multivar', kind: 'mvnormal', mu: [0, 0], cov: [[1, 2], [2, 1]] }, 'not-pd', 'logdet') === 1 && iss({ mode: 'multivar', kind: 'mvnormal', mu: [0, 0, 0], cov: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], x: [0, 0, 0] }, 'dim', 'cdf') === 1, 'a correlated rectangle probability ρ = −0.8 (mpmath); a matrix that is not positive definite: not-pd; the cdf in 3 dimensions: dim');
  const dr = S({ mode: 'multivar', kind: 'dirichlet', conc: [2, 3, 5], x: [0.2, 0.3, 0.5] }, ['logpdf', 'entropy', 'var.1', 'cov.0_1']);
  ok(rel(dr[0], 2.1406542258478254, 1e-14) && rel(dr[1], -1.4611820247291334, 1e-13) && rel(dr[2], 0.019090909090909092, 1e-14) && rel(dr[3], -6 / 1100, 1e-14), 'Dirichlet(2, 3, 5): log density, entropy, variance (scipy.stats.dirichlet), covariance −αᵢαⱼ/(α₀²(α₀+1))');
  const co = S({ mode: 'multivar', kind: 'corr', data: [[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 6]] }, ['r', 'pR', 'rho', 'pRho', 'tau', 'pTau']);
  ok(allRel(co, [0.8798335881615015, 0.020792350318471715, 0.8696565534786727, 0.02437689168569078, 0.6900655593423543, 0.05578260870684413], 1e-11), 'Pearson r, Spearman ρ, Kendall τ_b with ties and their p values (scipy pearsonr, spearmanr, kendalltau asymptotic)');
  const LX = [[83, 234289, 2356, 1590, 107608, 1947], [88.5, 259426, 2325, 1456, 108632, 1948], [88.2, 258054, 3682, 1616, 109773, 1949], [89.5, 284599, 3351, 1650, 110929, 1950], [96.2, 328975, 2099, 3099, 112075, 1951], [98.1, 346999, 1932, 3594, 113270, 1952], [99, 365385, 1870, 3547, 115094, 1953], [100, 363112, 3578, 3350, 116219, 1954], [101.2, 397469, 2904, 3048, 117388, 1955], [104.6, 419180, 2822, 2857, 118734, 1956], [108.4, 442769, 2936, 2798, 120445, 1957], [110.8, 444546, 4681, 2637, 121950, 1958], [112.6, 482704, 3813, 2552, 123366, 1959], [114.2, 502601, 3931, 2514, 125368, 1960], [115.7, 518173, 4806, 2572, 127852, 1961], [116.9, 554894, 4007, 2827, 130081, 1962]];
  const LY = [60323, 61122, 60171, 61187, 63221, 63639, 64989, 63761, 66019, 67857, 68169, 66513, 68655, 69564, 69331, 70551];
  const lo = S({ mode: 'multivar', kind: 'ols', data: LX, y: LY }, ['coef.0', 'coef.1', 'coef.2', 'coef.3', 'coef.4', 'coef.5', 'coef.6', 'se.0', 'se.6', 'r2', 'sigma']);
  ok(allRel(lo.slice(0, 7), [-3482258.63459582, 15.0618722713733, -0.358191792925910e-1, -2.02022980381683, -1.03322686717359, -0.511041056535807e-1, 1829.15146461355], 1e-10) && allRel(lo.slice(7), [890420.383607373, 455.478499142212, 0.995479004577296, 304.854073561965], 1e-10), 'the Longley regression (NIST StRD certified values, Longley 1967: an ill-conditioned design, κ ≈ 1e9): 7 coefficients, their SEs, R², σ to 1e-10 by Householder QR');
  const SPX = [[2.66, 20, 0], [2.89, 22, 0], [3.28, 24, 0], [2.92, 12, 0], [4, 21, 0], [2.86, 17, 0], [2.76, 17, 0], [2.87, 21, 0], [3.03, 25, 0], [3.92, 29, 0], [2.63, 20, 0], [3.32, 23, 0], [3.57, 23, 0], [3.26, 25, 0], [3.53, 26, 0], [2.74, 19, 0], [2.75, 25, 0], [2.83, 19, 0], [3.12, 23, 1], [3.16, 25, 1], [2.06, 22, 1], [3.62, 28, 1], [2.89, 14, 1], [3.51, 26, 1], [3.54, 24, 1], [2.83, 27, 1], [3.39, 17, 1], [2.67, 24, 1], [3.65, 21, 1], [4, 23, 1], [3.1, 21, 1], [2.39, 19, 1]];
  const SPY = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1];
  const lg = S({ mode: 'multivar', kind: 'logistic', data: SPX, y: SPY }, ['coef.0', 'coef.1', 'coef.2', 'coef.3', 'se.0', 'se.1', 'se.2', 'se.3', 'logLik', 'deviance', 'nullDeviance', 'aic']);
  const k = 11, nn = 32, nullDev = -2 * (k * Math.log(k / nn) + (nn - k) * Math.log((nn - k) / nn));
  ok(allRel(lg.slice(0, 9), [-13.021346858115697, 2.826112594889321, 0.0951576613179096, 2.3786876550933544, 4.9313242136027595, 1.2629410756290886, 0.14155420567369542, 1.0645642544971325, -12.889634222131415], 1e-11) && rel(lg[10], nullDev, 1e-13) && rel(lg[11], 33.779268444262826, 1e-12), 'logistic regression by IRLS on Spector & Mazzeo (1980): the coefficients and SEs of statsmodels Logit (Greene, Econometric Analysis, Table 21.1), log L, null deviance, AIC');
  ok(iss({ mode: 'multivar', kind: 'logistic', data: [[1], [2], [3], [4]], y: [0, 0, 1, 1] }, 'separation', 'coef.1') === 1 && iss({ mode: 'multivar', kind: 'ols', data: [[1, 2], [2, 4], [3, 6], [4, 8]], y: [1, 2, 3, 5] }, 'singular', 'coef.1') === 1, 'perfect separation (the MLE does not exist): separation; collinear columns: singular');
  const pc = S({ mode: 'multivar', kind: 'pca', data: LX, scale: true }, ['eig.0', 'eig.1', 'eig.2', 'eig.5', 'totalVar']);
  ok(allRel(pc, [4.603377095768389, 1.1753404992571461, 0.20342537240143488, 0.00037670813267769886, 6], 1e-11), 'principal components of the Longley correlation matrix: the eigenvalues of numpy eigh (LAPACK), by cyclic Jacobi');
}
// ===== rand: randomized algorithms (exact rationals or mpmath in Python; the published values named) =====
{
  const R1 = (kind, extra, keys, seed) => S(Object.assign({ mode: 'rand', kind }, extra), keys, seed);
  const am = R1('amplify', { err: 0.25, sided: 'two', k: 11, delta: 1e-6 }, ['errK', 'kNeeded', 'kHoeffding']);
  ok(rel(am[0], 0.03432750701904297, 1e-13) && am[1] === 79 && am[2] === 111 && R1('amplify', { err: 0.5, k: 10, delta: 1e-6 }, ['errK', 'kNeeded'])[1] === 20, 'amplification: majority of 11 runs at ε = ¼ errs with P(B(11, ¼) ≥ 6) = 0.0343275; 79 runs reach 1e-6 (Hoeffding asks 111); one-sided ε = ½ needs 20 runs');
  ok(rel(R1('amplify', { p: 0.2, k: 10 }, ['lvTail'])[0], Math.pow(0.8, 10), 1e-14), 'Las Vegas: P(no success in 10 runs) = 0.8¹⁰, E runs = 1/p');
  const qs = R1('quicksort', { n: 100, reps: 2000 }, ['eComp', 'varComp', 'simMean', 'simSd']);
  ok(rel(qs[0], 647.8502585632033, 1e-14) && rel(qs[1], 3538.2666782924284, 1e-13) && Math.abs(qs[2] - qs[0]) < 4 * qs[3] / Math.sqrt(2000), 'randomized quicksort, n = 100: E C = 2(n+1)H_n − 4n = 647.85, Var = 3538.27 (Knuth; the recursion in exact rationals); the simulation agrees');
  ok(rel(R1('quickselect', { n: 100, r: 50 }, ['eComp'])[0], 306.938706141475, 1e-13) && rel(R1('quickselect', { n: 37, r: 10 }, ['eComp'])[0], 93.39505257722645, 1e-13), 'quickselect: Knuth\'s closed form = the exact recursion (n = 100, r = 50: 306.94; n = 37, r = 10)');
  const kg = R1('karger', { n: 8, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [4, 5], [5, 6], [6, 7], [7, 4], [4, 6], [3, 4]], reps: 2000, delta: 0.01 }, ['pSuccess', 'kRuns', 'minCut', 'simSuccess']);
  ok(rel(kg[0], 1 / 28, 1e-15) && kg[1] === 127 && kg[2] === 1 && kg[3] >= kg[0], 'Karger: success ≥ 1/C(8, 2) = 1/28, 127 runs for δ = 1 %, the exact min cut 1 (the bridge), the simulated success above the bound');
  const fr = R1('freivalds', { A: [[1, 2], [3, 4]], B: [[5, 6], [7, 8]], Cm: [[19, 22], [43, 51]], k: 5 }, ['equal', 'pDetect', 'errExact']);
  ok(fr[0] === 0 && fr[1] === 0.5 && fr[2] === 1 / 32, 'Freivalds: one wrong entry is caught by half of the vectors r ∈ {0,1}²; error 2⁻⁵ after 5 rounds');
  const pr = R1('primality', { N: 561, k: 3 }, ['isPrime', 'fermatLiars', 'mrLiars', 'carmichael']);
  ok(pr[0] === 0 && pr[1] === 320 && pr[2] === 10 && pr[3] === 1 && R1('primality', { N: 1000000007 }, ['isPrime'])[0] === 1 && R1('primality', { N: 3215031751 }, ['isPrime'])[0] === 0, '561 = 3·11·17 is Carmichael: 320 = φ(561) Fermat liars but 10 strong liars (Monier 1980); 1e9 + 7 prime; 3215031751 (strong pseudoprime to 2, 3, 5, 7) composite');
  const rr = R1('rounding', { x: [0.5, 0.5, 0.5, 0.5, 0.2, 0.8, 0.3, 0.7, 0.9, 0.1], delta: 0.5 }, ['pAbove', 'chernoffUpper']);
  ok(rel(rr[0], 0.03217525000000001, 1e-13) && rr[1] > rr[0], 'randomized rounding: the exact P(S ≥ 1.5μ) = 0.03217525 (enumeration of 2¹⁰), the Chernoff bound above it');
  ok(rel(R1('balls', { n: 100 }, ['eMax'])[0], 4.2325952387958002, 1e-12), 'balls in bins, n = m = 100: E[max load] = 4.2325952388 (the generating function in mpmath)');
  const bl = R1('bloom', { m: 1000, n: 100 }, ['kOpt', 'kOptInt', 'fpClassic', 'fpExact', 'mFor']);
  ok(rel(bl[0], 10 * Math.LN2, 1e-15) && bl[1] === 7 && rel(bl[2], 0.008213554634050255, 1e-12) && rel(bl[3], 0.0082662475148435663, 1e-12) && bl[4] === 959, 'Bloom filter m = 1000, n = 100: k* = 10 ln 2, k = 7, (1 − (1 − 1/m)^{kn})^k = 0.0082136, the exact rate 0.0082662 (Christensen et al. 2010; the occupancy law in mpmath), 959 bits for 1 %');
  ok(R1('cover', { graph: 'cycle', n: 8 }, ['coverExact'])[0] === 28 && near(R1('cover', { graph: 'complete', n: 8 }, ['coverExact'])[0], 7 * (1 + 1 / 2 + 1 / 3 + 1 / 4 + 1 / 5 + 1 / 6 + 1 / 7), 1e-12) && near(R1('cover', { graph: 'path', n: 8 }, ['coverExact'])[0], 49, 1e-11), 'cover times: cycle n(n−1)/2 = 28, complete (n−1)H_{n−1}, path from an end (n−1)² = 49 (MU ch. 7)');
  const ts = R1('twosat', { n: 20, T: 800 }, ['eSteps', 'pFailT', 'markovT']);
  ok(ts[0] === 400 && rel(ts[1], 0.10748148986699944, 1e-13) && ts[2] === 0.5, '2-SAT random walk, n = 20 from the far end: E = n² = 400; P(not done in 2n²) = 0.1075 exactly vs Markov\'s ½');
  const bo = R1('bounds', { dist: { family: 'binomial', n: 100, p: 0.5 }, a: 75 }, ['exact', 'markov', 'chebyshev', 'chernoff', 'hoeffding', 'tightest']);
  ok(rel(bo[0], 2.8181410171027013e-7, 1e-11) && rel(bo[1], 2 / 3, 1e-15) && rel(bo[2], 0.04, 1e-15) && rel(bo[4], Math.exp(-12.5), 1e-14) && bo[5] === 4 && bo[3] > bo[0], 'tail bounds for B(100, ½) ≥ 75: exact 2.82e-7; Markov ⅔, Chebyshev 0.04, Hoeffding e^{−12.5}, Chernoff the tightest (index 4)');
  ok(rel(R1('skiplist', { n: 1000 }, ['eHeight'])[0], 11.299252697279202, 1e-13) && near(R1('treap', { n: 1000, r: 1 }, ['eDepth'])[0], 1 + 0 + R1('treap', { n: 1000, r: 1000 }, ['eDepth'])[0] - 1, 1e-12), 'skip list height E H = Σ 1 − (1 − 2^{−h})^n = 11.2993 (mpmath); treap depths symmetric in the rank');
  const mp = R1('mcpi', { n: 100000 }, ['estimate', 'se', 'seExact']);
  ok(Math.abs(mp[0] - Math.PI) < 4 * mp[2] && rel(mp[1], mp[2], 0.02), 'Monte Carlo π from 1e5 points: within 4 SE of π, the SE ≈ 4√(p(1−p)/n)');
  ok(iss({ mode: 'rand', kind: 'bounds', dist: { family: 'cauchy' }, a: 3 }, 'not-applicable', 'markov') === 1 && iss({ mode: 'rand', kind: 'primality', N: 1e13 }, 'big-number', 'isPrime') >= 1 && iss({ mode: 'rand', kind: 'karger', edges: [[0, 1], [2, 3]] }, 'disconnected', 'minCut') === 1 && iss({ mode: 'rand', kind: 'bloom', m: 1e6, n: 1e5, reps: 1000 }, 'budget', 'simFp') >= 1, 'edge codes: not-applicable (Markov needs X ≥ 0 and a mean), big-number, disconnected, budget');
}
// ===== the checker of the later modes, their Worker, their speed =====
{
  const base = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'prob@1', model, outputs: outs });
  const codes = s => M.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
  ok(codes(base({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2', params: ['a', 'b'], init: [0, 0] }, [{ id: 'r', kind: 'scalar', of: 'rhat.b' }, { id: 't', kind: 'series', of: 'trace.a' }])).length === 0 && codes(base({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2', params: ['a'], init: [0] }, [{ id: 'r', kind: 'scalar', of: 'rhat.b' }])).includes('output@outputs[0].of'), 'mcmc outputs are named by the model\'s parameters');
  ok(codes(base({ mode: 'multivar', kind: 'ols', data: [[1, 2], [3, 4], [5, 7], [1, 1]], y: [1, 2, 3, 4] }, [{ id: 'c', kind: 'scalar', of: 'coef.2' }, { id: 'l', kind: 'scalar', of: 'cov.1_1' }])).length === 0 && codes(base({ mode: 'multivar', kind: 'ols', data: [[1, 2]], y: [1], intercept: false }, [{ id: 'c', kind: 'scalar', of: 'coef.2' }])).includes('output@outputs[0].of'), 'multivar outputs: coef.<i> up to the columns (+ the intercept), cov.<i>_<j> inside the dimension');
  ok(JSON.stringify(M.exprs({ model: { mode: 'mcmc', kind: 'metropolis', logdens: '-a^2*s', params: ['a'], init: ['i0'] } })) === JSON.stringify([['-a^2*s', 'model.logdens', ['a']], ['i0', 'model.init[0]', []]]) && JSON.stringify(M.exprs({ model: { mode: 'rand', kind: 'bounds', dist: { family: 'poisson', lambda: 'l' }, a: 'a' } })) === JSON.stringify([['l', 'model.dist.lambda', []], ['a', 'model.a', []]]), 'exprs: a log density knows its parameters; the law of the bounds is visited');
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'bloom-filter', 'spec.json'), 'utf8'));
  ok(M.checkSpec(spec).filter(p => p.level === 'error').length === 0, 'the reference activity bloom-filter has a valid spec');
  const tests = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'bloom-filter', 'tests.json'), 'utf8')).cases, sim = M.engine.create(spec);
  const dflt = Object.fromEntries(spec.params.map(p => [p.id, p.default]));
  const bad = tests.filter(c => { const inp = Object.assign({}, dflt); for (const st of c.steps) inp[st.set] = st.value; const r = sim.run(inp); return !Object.entries(c.expect.values).every(([k, [a, b]]) => r[k] >= a && r[k] <= b); });
  ok(!bad.length, `bloom-filter: its ${tests.length} test cases hold (${bad.map(c => c.name).join('; ')})`);
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const ms = base({ mode: 'mcmc', kind: 'gibbs-bivnormal', rho: 0.5, iters: 500 }, [{ id: 'e', kind: 'scalar', of: 'ess.x' }, { id: 't', kind: 'series', of: 'trace.x' }]);
  const a1 = M.engine.create(ms).run({}), a2 = ctx.self.noemaEngine.create(ms).run({});
  ok(Number.isFinite(a1.e) && a1.e === a2.e && JSON.stringify(a1.t) === JSON.stringify(a2.t), 'the Worker source carries NoemaSimKit: the same MCMC chain and ESS in a fresh context');
  const sp = (model, of) => base(model, [{ id: 'e', kind: 'scalar', of }]);
  const worst = [
    sp({ mode: 'combin', kind: 'birthday', people: 1000, k: 5, days: 365 }, 'pMatch'),
    sp({ mode: 'combin', kind: 'coupon', probs: Array.from({ length: 20 }, (_, i) => i + 1), m: 300 }, 'pDone'),
    sp({ mode: 'gof', kind: 'ks-two', x: Array.from({ length: 2000 }, (_, i) => Math.sin(i)), y: Array.from({ length: 2000 }, (_, i) => Math.cos(i * 1.3)) }, 'p'),
    sp({ mode: 'gof', kind: 'ks-one', x: Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.7)), dist: { family: 'uniform', a: -1.01, b: 1.01 } }, 'p'),
    sp({ mode: 'mcmc', kind: 'metropolis', logdens: '-a^2/2 - b^2/2', params: ['a', 'b'], init: [0, 0], iters: 50000, chains: 4 }, 'ess.a'),
    sp({ mode: 'multivar', kind: 'logistic', data: Array.from({ length: 2000 }, (_, i) => Array.from({ length: 9 }, (_, j) => Math.sin(i * (j + 1)))), y: Array.from({ length: 2000 }, (_, i) => (Math.sin(i * 7.7) > 0 ? 1 : 0)) }, 'coef.1'),
    sp({ mode: 'rand', kind: 'bloom', m: 2000, n: 300, k: 4, reps: 15000 }, 'simFp'),
    sp({ mode: 'rand', kind: 'cover', graph: 'lollipop', n: 12 }, 'coverExact'),
  ];
  const outs = [], times = worst.map(s => { const t = process.hrtime.bigint(); outs.push(M.engine.create(s).run({})); return Number(process.hrtime.bigint() - t) / 1e6; });
  ok(times.every(t => t < 2000) && outs.every(o => Number.isFinite(o.e)), `the worst allowed runs of the later modes each < 2 s (${times.map(t => t.toFixed(0)).join(', ')} ms)`);
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < 10; i++) sim.run(Object.assign({}, dflt, { m: 500 + 100 * i }));
  const typ = Number(process.hrtime.bigint() - t0) / 1e6 / 10;
  ok(typ < 50, `a typical run of bloom-filter < 50 ms (${typ.toFixed(2)} ms)`);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
