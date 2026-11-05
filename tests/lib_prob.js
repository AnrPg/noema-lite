/* prob@1 — probability and statistics (docs/library/prob.md): published reference values (the source in each message: the AS
   algorithms' test values, R, scipy 1.x / statsmodels, mpmath at 50 digits where scipy itself is off, the classic data sets), the
   edge cases and their codes, the checker's codes, the sim adapter, the Worker source in a fresh context, speed, the seeded
   coverage of the Monte Carlo interval, and the twin data of tools/lib_prob.py.
   Run: node tests/lib_prob.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const rel = (a, b, tol) => Number.isFinite(a) && (a === b || Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-300));
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const allRel = (a, b, tol) => a.length === b.length && a.every((v, i) => rel(v, b[i], tol));
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js'));
require(path.join(SRC, '46_lib_core.js'));
require(path.join(SRC, '47_lib_prob.js'));
const M = globalThis.NoemaLibProb;
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

// ===== the adapter, the Worker, speed, the Python twin's data =====
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
  const pyData = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_prob as M; print(json.dumps(M.DATA))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8' }));
  ok(JSON.stringify(pyData) === JSON.stringify(M.DATA), 'tools/lib_prob.py carries the same DATA (schema, outputs, names) as the JS module');
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
