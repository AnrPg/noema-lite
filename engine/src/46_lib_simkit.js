/* ===================== NoemaSimKit — the simulation kernel of the engine library (docs/library/simkit.md) =====================
   The shared tools every time-stepping engine of the library builds on (des@1, field@1, agents@1, the "parts" orchestrator):
     • randomness: L'Ecuyer's MRG32k3a with real streams and substreams (jump-ahead matrices), one stream per purpose, common random
       numbers and antithetic variates; standard variates by inversion where it is cheap (synchronisation for CRN);
     • the event calendar (a binary heap; ties: time, then priority, then insertion order) and an executive with scheduled,
       conditional (three-phase C) and timed events, cancellation, interruptible activities (resume / restart / resample), a Zeno
       guard, a capped event log and an event budget;
     • continuous time: Dormand–Prince 5(4) with dense output and PI control, fixed RK4 / Heun / Euler, state events located by
       bracketing + the Illinois method (+ Brent polish), direction and hysteresis;
     • output analysis: Welford, time-weighted averages, Student-t intervals, replications, batch means, MSER-5 warm-up, Little's law;
     • sweeps and sensitivity: one-at-a-time, grids, Morris elementary effects, Sobol' indices (Saltelli 2010 / Jansen 1999);
     • verification: Richardson order estimation, conservation, determinism, unit dimensions and time units;
     • a rollback-free co-simulation master (macro steps, zero-order-hold exchange, cross-part events, early stops at state events).
   Sources (each also beside its code): Law, Simulation Modeling and Analysis, 5th ed. 2015 (L); Banks, Carson, Nelson & Nicol,
   Discrete-Event System Simulation, 5th ed. 2010 (BCNN); Zeigler, Muzy & Kofman, Theory of Modeling and Simulation, 3rd ed. 2018
   (DEVS); Hairer, Nørsett & Wanner, Solving ODEs I, 2nd ed. 1993 (HNW); Shampine, Gladwell & Thompson, Solving ODEs with MATLAB, 2003
   (event location); L'Ecuyer 1999 (Oper. Res. 47:1) and L'Ecuyer, Simard, Chen & Kelton 2002 (Oper. Res. 50:6) for MRG32k3a streams;
   Sargent 2013 (J. Simulation 7:1) V&V; Saltelli et al. 2008 Global Sensitivity Analysis: The Primer and Saltelli et al. 2010 (CPC
   181); Morris 1991 (Technometrics 33:2), Campolongo, Cariboni & Saltelli 2007; White 1997, White, Cobb & Spratt 2000 (MSER-5),
   Franklin & White 2008; Schmeiser 1982 and Kelton/Law ch. 9 (batch means); Little 1961.
   Pure JS: no DOM, no network, no clock; every loop bounded; never throws out of a run (NaN + codes). Runs in a Worker: source(). */
(function noemaSimKitModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this module
  'use strict';
  const FX = root.NoemaExpr ? root.NoemaExpr.FUNCS : null;
  // the transcendental functions: NoemaExpr's fdlibm ports (bit-identical on every device), Math.* only when NoemaExpr is absent
  const exp = FX ? FX.exp.fn : Math.exp, log = FX ? FX.log.fn : Math.log, cos = FX ? FX.cos.fn : Math.cos, sin = FX ? FX.sin.fn : Math.sin,
    pow = FX ? FX.pow.fn : Math.pow;
  const sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, min = Math.min, max = Math.max;
  const EPS = 2.220446049250313e-16, PI = 3.141592653589793, fin = Number.isFinite;
  const MAX_STEPS = 200000, MAX_EVENTS = 200000, MAX_LOG = 2000, MAX_POINTS = 2000;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  /* ======================================================================================================================
     Codes and budgets (the same shape as ode@1's ctx: the first occurrence of each code is kept, with its time)
     ====================================================================================================================== */
  function codes(fatalList) {
    const list = [], seen = new Set(), F = new Set(fatalList || []);
    return { list,
      code(c, t, info, fatal) { if (seen.has(c)) return; seen.add(c); const o = { code: c, level: fatal || F.has(c) ? 'error' : 'warning' }; if (t != null && fin(t)) o.t = t; if (info != null) o.info = info; list.push(o); },
      has: c => seen.has(c), fatal: () => list.some(o => o.level === 'error') };
  }
  /** budget(max) → {spend(n) → false once exhausted, used, left, over} (≤ 200 000 by default: the library's bound) */
  function budget(mx) {
    const cap = fin(mx) && mx > 0 ? min(mx, 1e7) : MAX_STEPS; let used = 0;
    return { spend(n) { used += n == null ? 1 : n; return used <= cap; }, get used() { return used; }, get left() { return max(0, cap - used); }, get over() { return used > cap; }, cap };
  }

  /* ======================================================================================================================
     Special functions (for the variates, the t quantile and the queueing formulas of the engines)
     ====================================================================================================================== */
  // log Γ(x), x > 0: Lanczos (g = 7, n = 9; Numerical Recipes 3rd ed. §6.1), reflection for x < 0.5
  const LZ = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (!(x > 0)) return x === 0 ? Infinity : NaN;
    if (x < 0.5) return log(PI / abs(sin(PI * x))) - lgamma(1 - x);
    x -= 1; let a = LZ[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += LZ[i] / (x + i);
    return 0.9189385332046728 + (x + 0.5) * log(t) - t + log(a);
  }
  // the regularized lower incomplete gamma P(a, x): series / Lentz continued fraction (NR 3rd ed. §6.2)
  function gammaP(a, x) {
    if (!(a > 0) || !(x >= 0)) return NaN; if (x === 0) return 0;
    const gln = lgamma(a);
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (abs(del) < abs(sum) * 1e-16) break; } return min(1, sum * exp(-x + a * log(x) - gln)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (abs(del - 1) < 1e-16) break; }
    return max(0, 1 - exp(-x + a * log(x) - gln) * h);
  }
  // the regularized incomplete beta I_x(a, b) (NR 3rd ed. §6.4, modified Lentz)
  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m < 1000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del;
      if (abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function betaI(a, b, x) {
    if (!(a > 0 && b > 0) || !(x >= 0 && x <= 1)) return NaN; if (x === 0 || x === 1) return x;
    const bt = exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  // the standard normal: Φ by erfc (W. J. Cody 1969 rational approximations via the complementary gamma), Φ⁻¹ by Wichura 1988 AS241
  function normCdf(z) { if (!fin(z)) return z > 0 ? 1 : z < 0 ? 0 : NaN; const p = 0.5 * (1 - gammaP(0.5, z * z / 2)); return z >= 0 ? 1 - p : p; }
  function normInv(p) {   // Wichura 1988, Applied Statistics 37, algorithm AS 241 (PPND16, about 16 digits)
    if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
    const q = p - 0.5;
    if (abs(q) <= 0.425) { const r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
        / (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1); }
    let r = q < 0 ? p : 1 - p; r = sqrt(-log(r)); let x;
    if (r <= 5) { r -= 1.6;
      x = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
        / (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else { r -= 5;
      x = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
        / (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1); }
    return q < 0 ? -x : x;
  }
  /** Student t: the cdf by the incomplete beta, the quantile by bisection + Newton on it (|error| < 1e-12) */
  function tCdf(x, df) { if (!(df > 0) || Number.isNaN(x)) return NaN; if (!fin(x)) return x > 0 ? 1 : 0; const p = 0.5 * betaI(df / 2, 0.5, df / (df + x * x)); return x >= 0 ? 1 - p : p; }
  function tq(p, df) {   // the p-quantile of Student's t with df degrees of freedom
    if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
    if (p === 0.5) return 0; if (p < 0.5) return -tq(1 - p, df);
    if (df > 1e7) return normInv(p);
    let lo = 0, hi = 1; for (let i = 0; i < 200 && tCdf(hi, df) < p; i++) { lo = hi; hi *= 2; }
    let x = (lo + hi) / 2;
    for (let i = 0; i < 200; i++) { const c = tCdf(x, df) - p; if (c > 0) hi = x; else lo = x; if (hi - lo < 1e-13 * max(1, x)) break;
      const dens = exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * log(df * PI) - (df + 1) / 2 * log(1 + x * x / df));
      let xn = x - c / dens; if (!(xn > lo && xn < hi)) xn = (lo + hi) / 2; x = xn; }
    return x;
  }
  /** Brent 1973 ch. 4: a root of g on [a, b] with g(a)·g(b) ≤ 0 (the same code as ode@1's brent) */
  function brent(g, a, b, tol, fa0, fb0) {
    let fa = fa0 != null ? fa0 : g(a), fb = fb0 != null ? fb0 : g(b); if (!(fa * fb <= 0)) return NaN;
    let c = a, fc = fa, d = b - a, e = d;
    for (let it = 0; it < 200; it++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (abs(fc) < abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tl = 2 * EPS * abs(b) + (tol || 1e-15), m = (c - b) / 2;
      if (abs(m) <= tl || fb === 0) return b;
      if (abs(e) >= tl && abs(fa) > abs(fb)) {
        let p, q, r; const s = fb / fa;
        if (a === c) { p = 2 * m * s; q = 1 - s; } else { q = fa / fc; r = fb / fc; p = s * (2 * m * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
        if (p > 0) q = -q; else p = -p;
        if (2 * p < min(3 * m * q - abs(tl * q), abs(e * q))) { e = d; d = p / q; } else { d = m; e = d; }
      } else { d = m; e = d; }
      a = b; fa = fb; b += abs(d) > tl ? d : (m > 0 ? tl : -tl); fb = g(b);
    }
    return b;
  }
  /** locate(g, ta, tb, ga, gb, {tol, polish}) → the root of g in [ta, tb] (ga, gb of opposite signs): the Illinois variant of
      regula falsi (Dowell & Jarratt 1971; Shampine, Gladwell & Thompson 2003 §2.3.2 for event location), then Brent when asked */
  function locate(g, ta, tb, ga, gb, o) {
    const tol = (o && o.tol) || 1e-13;
    if (ga === 0) return ta; if (gb === 0) return tb; if (!(ga * gb < 0)) return NaN;
    let side = 0, tr = tb;
    for (let it = 0; it < 100; it++) {
      tr = (ta * gb - tb * ga) / (gb - ga); if (!(tr > ta && tr < tb)) tr = (ta + tb) / 2;
      const gr = g(tr);
      if (gr === 0 || tb - ta <= tol * max(1, abs(tr))) break;
      if ((gr < 0) === (ga < 0)) { ta = tr; ga = gr; if (side === -1) gb /= 2; side = -1; } else { tb = tr; gb = gr; if (side === 1) ga /= 2; side = 1; }
    }
    if (o && o.polish && tb > ta) { const b = brent(g, ta, tb, tol * max(1, abs(tr))); if (fin(b)) return b; }
    return tr;
  }

  /* ======================================================================================================================
     Randomness: MRG32k3a (L'Ecuyer 1999) with streams of length 2^127 and substreams of 2^76 (L'Ecuyer, Simard, Chen & Kelton 2002)
     ====================================================================================================================== */
  const M1 = 4294967087, M2 = 4294944443, A12 = 1403580, A13N = 810728, A21 = 527612, A23N = 1370589, NORM = 2.328306549295727688e-10;
  // a·b mod m for a, b < 2^32 without overflow: b split in 16-bit halves (every product < 2^49 is exact in a double)
  const mulmod = (a, b, m) => { const bh = floor(b / 65536), bl = b - bh * 65536; return ((a * bh % m) * 65536 + a * bl) % m; };
  function matMul(A, B, m) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s = (s + mulmod(A[i][k], B[k][j], m)) % m; C[i][j] = s; } return C; }
  function matVec(A, v, m) { const r = [0, 0, 0]; for (let i = 0; i < 3; i++) { let s = 0; for (let k = 0; k < 3; k++) s = (s + mulmod(A[i][k], v[k], m)) % m; r[i] = s; } return r; }
  function matPow2(A, e, m) { let R = A; for (let i = 0; i < e; i++) R = matMul(R, R, m); return R; }   // A^(2^e)
  function matPowN(A, n, m) { let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], B = A; while (n > 0) { const b = n % 2; if (b) R = matMul(R, B, m); n = (n - b) / 2; if (n > 0) B = matMul(B, B, m); } return R; }
  // the one-step matrices of the two components (L'Ecuyer 1999, Table II) and their 2^76 / 2^127 powers (computed once, lazily;
  // tests/lib_simkit.js checks them against the published A1p76, A2p76, A1p127, A2p127 of RngStreams.c)
  const MA1 = [[0, 1, 0], [0, 0, 1], [M1 - A13N, A12, 0]], MA2 = [[0, 1, 0], [0, 0, 1], [M2 - A23N, 0, A21]];
  let JUMP = null;
  function jumps() { if (!JUMP) JUMP = { a1p76: matPow2(MA1, 76, M1), a2p76: matPow2(MA2, 76, M2), a1p127: matPow2(MA1, 127, M1), a2p127: matPow2(MA2, 127, M2) }; return JUMP; }
  function fnv(s, h) { h = (h ^ 0x811c9dc5) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  /** subseed(seed, i) → a 32-bit seed derived from (seed, i) (splitmix32-like finaliser) */
  function subseed(seed, i) { let h = ((seed >>> 0) ^ Math.imul((i >>> 0) + 0x9E3779B9, 0x85EBCA6B)) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846CA68B) >>> 0; h ^= h >>> 16; return h >>> 0; }
  const PKG = [12345, 12345, 12345, 12345, 12345, 12345];   // the package seed of RngStreams
  const streamCache = new Map(), subCache = new Map();
  /** the start state of stream k = (seed, name): the package seed jumped by (seed·2^32 + fnv(name))·2^127 — distinct streams for
      every (seed, name) pair, each 2^127 long, split in 2^51 substreams of 2^76 */
  function streamState(seed, name) {
    const key = (seed >>> 0) + '|' + name; const c = streamCache.get(key); if (c) return c;
    const J = jumps(), k1 = seed >>> 0, k0 = fnv(String(name), 0);
    // jump by k1·2^32·2^127 then k0·2^127: (A^(2^127))^(k1·2^32 + k0)
    const B1 = matPowN(J.a1p127, k0, M1), B2 = matPowN(J.a2p127, k0, M2);
    const C1 = matMul(matPowN(matPow2(J.a1p127, 32, M1), k1, M1), B1, M1), C2 = matMul(matPowN(matPow2(J.a2p127, 32, M2), k1, M2), B2, M2);
    const s = matVec(C1, PKG.slice(0, 3), M1).concat(matVec(C2, PKG.slice(3), M2));
    if (streamCache.size > 4096) streamCache.clear();
    streamCache.set(key, s); return s;
  }
  const P2_32 = 4294967296;
  /** stream(seed, name, {antithetic, sub}) → r: r() a uniform in (0, 1) (never 0 or 1), and the variates below. r.sub(i) → the i-th
      substream of the same stream (replication i); the same seed and name give the same numbers everywhere */
  function stream(seed, name, opts) {
    const anti = !!(opts && opts.antithetic), subI = opts && opts.sub > 0 ? floor(opts.sub) : 0;
    let s = opts && Array.isArray(opts.state) && opts.state.length === 6 ? opts.state.slice() : streamState(seed, name == null ? '' : String(name)).slice();
    if (subI) { const key = (seed >>> 0) + '|' + name + '|' + subI, c = subCache.get(key);
      if (c) s = c.slice(); else { const J = jumps(); s = matVec(matPowN(J.a1p76, subI, M1), s.slice(0, 3), M1).concat(matVec(matPowN(J.a2p76, subI, M2), s.slice(3), M2)); if (subCache.size > 4096) subCache.clear(); subCache.set(key, s.slice()); } }
    let s0 = s[0], s1 = s[1], s2 = s[2], s3 = s[3], s4 = s[4], s5 = s[5];
    let draws = 0;
    function u01() {   // L'Ecuyer 1999, Fig. 1 (the floating-point implementation; every product < 2^53)
      let p1 = A12 * s1 - A13N * s0; p1 -= floor(p1 / M1) * M1; s0 = s1; s1 = s2; s2 = p1;
      let p2 = A21 * s5 - A23N * s3; p2 -= floor(p2 / M2) * M2; s3 = s4; s4 = s5; s5 = p2;
      draws++;
      const u = p1 > p2 ? (p1 - p2) * NORM : (p1 - p2 + M1) * NORM;
      return anti ? 1 - u : u;
    }
    const r = () => u01();
    r.state = () => [s0, s1, s2, s3, s4, s5];
    r.draws = () => draws;
    r.sub = i => stream(seed, name, { antithetic: anti, sub: i });
    r.anti = () => stream(seed, name, { antithetic: !anti, sub: subI });
    r.u53 = () => { const a = u01(); return (floor(a * P2_32) + u01()) / P2_32; };   // two draws when 32 bits are too few
    // ---- variates (Law 2015 ch. 8; Devroye 1986). Inversion: one uniform each, monotone in u (good for CRN and antithetics) ----
    r.int = n => min(n - 1, floor(u01() * n));
    r.uniform = (a, b) => a + (b - a) * u01();
    r.exp = rate => -log(u01()) / rate;                               // inversion (L §8.3.2)
    r.expMean = mean => -mean * log(u01());
    r.normal = (mu, sd) => (mu || 0) + (sd == null ? 1 : sd) * normInv(u01());   // inversion by AS241
    r.lognormal = (mu, sigma) => exp(mu + sigma * normInv(u01()));   // of the underlying normal (L §6.2.2)
    r.tri = (a, c, b) => { const u = u01(), F = (c - a) / (b - a); return u < F ? a + sqrt(u * (b - a) * (c - a)) : b - sqrt((1 - u) * (b - a) * (b - c)); };   // L §8.3.15
    r.weibull = (k, lam) => lam * pow(-log(u01()), 1 / k);
    r.erlang = (k, mean) => { let p = 1; for (let i = 0; i < k; i++) p *= u01(); return -mean / k * log(p); };   // L §8.3.3 (product of k uniforms)
    // gamma: Marsaglia & Tsang 2000 (ACM TOMS 26:3), α < 1 by Stuart's power trick u^(1/α); rejection (not synchronised)
    r.gamma = (k, theta) => {
      if (!(k > 0 && theta > 0)) return NaN;
      if (k < 1) return r.gamma(k + 1, theta) * pow(u01(), 1 / k);
      const d = k - 1 / 3, c = 1 / sqrt(9 * d);
      for (let i = 0; i < 1000; i++) { const x = normInv(u01()), v0 = 1 + c * x; if (v0 <= 0) continue; const v = v0 * v0 * v0, u = u01();
        if (u < 1 - 0.0331 * x * x * x * x || log(u) < 0.5 * x * x + d * (1 - v + log(v))) return d * v * theta; }
      return k * theta;
    };
    r.beta = (a, b) => { const x = r.gamma(a, 1), y = r.gamma(b, 1); return x / (x + y); };   // L §8.3.8
    // Poisson and binomial by inversion: a sequential search from 0 (small means), else from the mode with the cdf there exactly
    // (Kemp 1981 / Devroye 1986 §X.3 "inversion from the mode"); at most 4000 steps
    r.poisson = lam => {
      if (!(lam >= 0)) return NaN; if (lam === 0) return 0; const u = u01();
      if (lam < 30) { let k = 0, p = exp(-lam), F = p; while (u > F && k < 4000) { k++; p *= lam / k; F += p; } return k; }
      const m = floor(lam), pm = exp(-lam + m * log(lam) - lgamma(m + 1)); let F = 1 - gammaP(m + 1, lam);   // F(m) = Q(m + 1, λ)
      let k = m, p = pm;
      if (u <= F) { for (let i = 0; i < 4000 && k > 0; i++) { if (u > F - p) return k; F -= p; p *= k / lam; k--; } return k; }
      for (let i = 0; i < 4000; i++) { k++; p *= lam / k; F += p; if (u <= F) return k; } return k;
    };
    r.binomial = (n, p) => {
      if (!(n >= 0 && p >= 0 && p <= 1)) return NaN; if (p === 0 || n === 0) return 0; if (p === 1) return n;
      const u = u01(), q = 1 - p;
      if (n * p < 30 && n * min(p, q) < 30) { let k = 0, pk = exp(n * log(q)), F = pk; const rr = p / q; while (u > F && k < n) { pk *= rr * (n - k) / (k + 1); k++; F += pk; } return k; }
      const m = floor((n + 1) * p) > n ? n : floor((n + 1) * p);
      const pm = exp(lgamma(n + 1) - lgamma(m + 1) - lgamma(n - m + 1) + m * log(p) + (n - m) * log(q));
      let F = m >= n ? 1 : betaI(n - m, m + 1, q), k = m, pk = pm;   // F(m) = I_q(n − m, m + 1)
      if (u <= F) { for (let i = 0; i < 4000 && k > 0; i++) { if (u > F - pk) return k; F -= pk; pk *= k / (n - k + 1) * q / p; k--; } return k; }
      for (let i = 0; i < 4000 && k < n; i++) { pk *= (n - k) / (k + 1) * p / q; k++; F += pk; if (u <= F) return k; } return k;
    };
    /** discrete(probs) → an index by inversion of the cumulative weights (they need not sum to 1) */
    r.discrete = probs => { let s = 0; for (const p of probs) s += p > 0 ? p : 0; if (!(s > 0)) return -1; const u = u01() * s; let c = 0; for (let i = 0; i < probs.length; i++) { c += probs[i] > 0 ? probs[i] : 0; if (u < c) return i; } return probs.length - 1; };
    /** empirical(values, probs?) → a value: without probs a continuous piecewise-linear cdf through the sorted values (L §6.2.4),
        with probs a discrete draw */
    r.empirical = (values, probs) => {
      if (!values.length) return NaN;
      if (probs) { const i = r.discrete(probs); return i >= 0 ? values[i] : NaN; }
      const v = values.slice().sort((a, b) => a - b); if (v.length === 1) return v[0];
      const x = u01() * (v.length - 1), i = floor(x); return v[i] + (x - i) * (v[min(i + 1, v.length - 1)] - v[i]);
    };
    r.shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = r.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };   // Fisher–Yates
    r.pick = a => a.length ? a[r.int(a.length)] : undefined;
    return r;
  }
  /** a distribution object {dist, …} of the engines → {draw(r), mean, var, ok} (moments for the queueing formulas) */
  const DISTS = ['const', 'exp', 'uniform', 'tri', 'normal', 'lognormal', 'gamma', 'erlang', 'weibull', 'beta', 'empirical', 'discrete'];
  function dist(d) {
    const bad = { ok: false, mean: NaN, var: NaN, draw: () => NaN, scv: NaN };
    if (!isObj(d)) return bad;
    const g = k => (typeof d[k] === 'number' ? d[k] : NaN), has = k => typeof d[k] === 'number' && fin(d[k]);
    const mk = (draw, mean, vr, ok) => { const good = !!ok && fin(mean) && fin(vr) && vr >= 0; return { ok: good, draw: good ? draw : () => NaN, mean: good ? mean : NaN, var: good ? vr : NaN, scv: good && mean ? vr / (mean * mean) : NaN }; };
    switch (d.dist) {
      case 'const': { const v = has('value') ? g('value') : g('mean'); return mk(() => v, v, 0, v >= 0); }
      case 'exp': { const m = has('mean') ? g('mean') : 1 / g('rate'); return mk(r => r.expMean(m), m, m * m, m > 0); }
      case 'uniform': { const a = g('min'), b = g('max'); return mk(r => r.uniform(a, b), (a + b) / 2, (b - a) * (b - a) / 12, a >= 0 && b >= a); }
      case 'tri': { const a = g('min'), c = g('mode'), b = g('max'); return mk(r => r.tri(a, c, b), (a + b + c) / 3, (a * a + b * b + c * c - a * b - a * c - b * c) / 18, a >= 0 && a <= c && c <= b && b > a); }
      case 'normal': {   // unclipped; a duration takes truncated(d, 0) (exact, by inversion) or clips itself and says so
        const m = g('mean'), sd = g('sd'); return mk(r => r.normal(m, sd), m, sd * sd, fin(m) && sd >= 0); }
      case 'lognormal': {   // by its own mean and sd (L §6.2.2: σ² = ln(1 + sd²/m²), μ = ln m − σ²/2)
        const m = g('mean'), sd = g('sd'), s2 = log(1 + sd * sd / (m * m)), mu = log(m) - s2 / 2, s = sqrt(s2);
        return mk(r => r.lognormal(mu, s), m, sd * sd, m > 0 && sd >= 0); }
      case 'gamma': {   // shape k and scale θ, or mean and cv
        const k = has('shape') ? g('shape') : 1 / (g('cv') * g('cv')), th = has('scale') ? g('scale') : g('mean') / k;
        return mk(r => r.gamma(k, th), k * th, k * th * th, k > 0 && th > 0); }
      case 'erlang': { const k = g('k'), m = g('mean'); return mk(r => r.erlang(k, m), m, m * m / k, Number.isInteger(k) && k >= 1 && k <= 64 && m > 0); }
      case 'weibull': { const k = g('shape'), l = g('scale'), g1 = exp(lgamma(1 + 1 / k)), g2 = exp(lgamma(1 + 2 / k)); return mk(r => r.weibull(k, l), l * g1, l * l * (g2 - g1 * g1), k > 0 && l > 0); }
      case 'beta': { const a = g('a'), b = g('b'), lo = has('min') ? g('min') : 0, hi = has('max') ? g('max') : 1, w = hi - lo;
        return mk(r => lo + w * r.beta(a, b), lo + w * a / (a + b), w * w * a * b / ((a + b) * (a + b) * (a + b + 1)), a > 0 && b > 0 && lo >= 0 && hi > lo); }
      case 'empirical': case 'discrete': {
        const vs = Array.isArray(d.values) ? d.values.filter(v => typeof v === 'number') : [];
        const ps = Array.isArray(d.probs) ? d.probs : null;
        if (!vs.length || vs.some(v => !(v >= 0)) || (ps && (ps.length !== vs.length || ps.some(p => !(p >= 0))))) return bad;
        if (d.dist === 'discrete' || ps) { const w = ps || vs.map(() => 1), s = w.reduce((a, b) => a + b, 0); if (!(s > 0)) return bad;
          const m = vs.reduce((a, v, i) => a + v * w[i] / s, 0), m2 = vs.reduce((a, v, i) => a + v * v * w[i] / s, 0);
          return mk(r => vs[r.discrete(w)], m, max(0, m2 - m * m), true); }
        const v = vs.slice().sort((a, b) => a - b), n = v.length;
        if (n === 1) return mk(() => v[0], v[0], 0, true);
        let m = 0, m2 = 0; for (let i = 0; i < n - 1; i++) { const a = v[i], b = v[i + 1]; m += (a + b) / 2; m2 += (a * a + a * b + b * b) / 3; } m /= n - 1; m2 /= n - 1;
        return mk(r => r.empirical(v), m, max(0, m2 - m * m), true); }
      default: return bad;
    }
  }

  /* ======================================================================================================================
     The event calendar: a binary heap ordered by (time, priority, insertion order). A smaller priority number comes first at
     the same time; equal priorities come in the order they were scheduled (FIFO) — the deterministic tie rule of L §1.3 / BCNN §3.1.
     Cancellation is lazy (the entry stays in the heap, marked) so it costs O(1).
     ====================================================================================================================== */
  function calendar() {
    const h = []; let seq = 0, live = 0; const dead = new Set(), pending = new Set();
    const less = (a, b) => a.t < b.t || (a.t === b.t && (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)));
    function up(i) { const x = h[i]; while (i > 0) { const p = (i - 1) >> 1; if (!less(x, h[p])) break; h[i] = h[p]; i = p; } h[i] = x; }
    function down(i) { const n = h.length, x = h[i]; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && less(h[c + 1], h[c])) c++; if (!less(h[c], x)) break; h[i] = h[c]; i = c; } h[i] = x; }
    function popRaw() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; down(0); } return top; }
    function clean() { while (h.length && dead.has(h[0].seq)) { dead.delete(h[0].seq); popRaw(); } }
    return {
      schedule(t, kind, data, prio) { if (!(typeof t === 'number') || Number.isNaN(t)) return -1; const e = { t, prio: prio || 0, seq: seq++, kind, data }; e.id = e.seq; h.push(e); up(h.length - 1); live++; pending.add(e.id); return e.id; },
      cancel(id) { if (!pending.has(id)) return false; pending.delete(id); dead.add(id); live--; return true; },
      peek() { clean(); return h.length ? h[0].t : Infinity; },
      peekEntry() { clean(); return h.length ? h[0] : null; },
      pop() { clean(); if (!h.length) return null; live--; const e = popRaw(); pending.delete(e.seq); return e; },
      get size() { return live; },
      clear() { h.length = 0; dead.clear(); pending.clear(); live = 0; },
    };
  }
  /* ======================================================================================================================
     The executive: next-event time advance (L §1.3.1, BCNN §3.1) with the three-phase rule of Tocher 1963 / Pidd 2004: at each
     instant the B (bound, scheduled) events run in calendar order, then the C (conditional) events are tried until none fires.
     sim({tEnd, maxEvents, zeno, logCap, eps}) → S:
       S.now · S.at(t, fn, {prio, kind, data}) / S.after(dt, fn, opts) → id · S.cancel(id) · S.when(cond, fn, {prio, once}) → id ·
       S.run(until?) → {t, events, stop: horizon | empty | stopped | budget | zeno} · S.stop(code?) · S.log(kind, data) ·
       S.activity(dur, onDone, opts) → an interruptible activity · S.codes · S.events (count)
     A scheduled time before now is an error (code 'past', the event runs now); a NaN time is refused (code 'nan-time').
     ====================================================================================================================== */
  function sim(o) {
    o = o || {};
    const tEnd = fin(o.tEnd) ? o.tEnd : Infinity, maxEv = fin(o.maxEvents) ? min(o.maxEvents, MAX_EVENTS * 5) : MAX_EVENTS;
    const zenoMax = fin(o.zeno) ? o.zeno : 10000, logCap = fin(o.logCap) ? min(o.logCap, MAX_LOG) : 500, eps = o.eps || 1e-12;
    const heap = [], cancelled = new Set(); let seq = 0, live = 0;
    const less = (a, b) => a.t < b.t || (a.t === b.t && (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)));
    function up(i) { const x = heap[i]; while (i > 0) { const p = (i - 1) >> 1; if (!less(x, heap[p])) break; heap[i] = heap[p]; i = p; } heap[i] = x; }
    function down(i) { const n = heap.length, x = heap[i]; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && less(heap[c + 1], heap[c])) c++; if (!less(heap[c], x)) break; heap[i] = heap[c]; i = c; } heap[i] = x; }
    function pop() { for (;;) { if (!heap.length) return null; const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; down(0); } if (cancelled.has(top.seq)) { cancelled.delete(top.seq); continue; } live--; return top; } }
    function peekT() { while (heap.length && cancelled.has(heap[0].seq)) { cancelled.delete(heap[0].seq); const last = heap.pop(); if (heap.length) { heap[0] = last; down(0); } } return heap.length ? heap[0].t : Infinity; }
    const conds = []; const C = codes(['budget', 'zeno']);
    const log = []; let logged = 0;
    let now = fin(o.t0) ? o.t0 : 0, events = 0, stopped = null, instT = NaN, instN = 0;
    const S = {
      get now() { return now; }, get events() { return events; }, get pending() { return live; }, codes: C, eventLog: log, tEnd,
      at(t, fn, op) {
        if (typeof t !== 'number' || Number.isNaN(t)) { C.code('nan-time', now); return -1; }
        if (t < now - eps * max(1, abs(now))) { C.code('past', now); t = now; }
        const e = { t, prio: (op && op.prio) || 0, seq: seq++, fn, kind: op && op.kind, data: op && op.data };
        heap.push(e); up(heap.length - 1); live++; return e.seq;
      },
      after(dt, fn, op) { return S.at(now + dt, fn, op); },
      cancel(id) { if (!(id >= 0) || id >= seq || cancelled.has(id)) return false; cancelled.add(id); live--; return true; },
      when(cond, fn, op) { const c = { cond, fn, prio: (op && op.prio) || 0, once: !!(op && op.once), seq: seq++, on: true }; conds.push(c); conds.sort((a, b) => a.prio - b.prio || a.seq - b.seq); return c.seq; },
      unwhen(id) { const c = conds.find(x => x.seq === id); if (c) c.on = false; return !!c; },
      stop(code) { stopped = code || 'stopped'; },
      log(kind, data) { logged++; if (log.length < logCap) log.push({ t: now, kind, ...(data || {}) }); },
      get logged() { return logged; },
      peek: () => peekT(),
      /** an interruptible activity (a service, a repair, a treatment): {end, remaining(), interrupt(), resume(policy, newDur?), cancel(), done}
          policies (L §2.7 / BCNN ch. 6, pre-emption): resume (the remaining time), restart (the whole first duration again, "repeat
          identical"), resample (a new duration given by the caller, "repeat different") */
      activity(dur, onDone, op) {
        const A = { dur, start: now, end: now + dur, id: -1, done: false, paused: false, left: dur, interrupts: 0 };
        const fire = () => { A.done = true; A.id = -1; onDone(A); };
        A.id = S.at(A.end, fire, op);
        A.remaining = () => (A.paused ? A.left : max(0, A.end - now));
        A.interrupt = () => { if (A.done || A.paused) return A.remaining(); S.cancel(A.id); A.left = max(0, A.end - now); A.paused = true; A.interrupts++; A.id = -1; return A.left; };
        A.resume = (policy, newDur) => { if (A.done || !A.paused) return; A.paused = false; const d = policy === 'restart' ? A.dur : policy === 'resample' ? (fin(newDur) ? newDur : A.dur) : A.left; A.start = now; A.end = now + d; A.id = S.at(A.end, fire, op); };
        A.cancel = () => { if (A.id >= 0) S.cancel(A.id); A.done = true; A.id = -1; };
        return A;
      },
      /** run(until): next-event time advance to min(until, tEnd); the clock stops at the horizon (events after it stay) */
      run(until) {
        const T = min(fin(until) ? until : Infinity, tEnd);
        stopped = null;
        for (;;) {
          const tn = peekT();
          if (tn === Infinity) { if (fin(T)) now = max(now, T); return { t: now, events, stop: 'empty' }; }
          if (tn > T) { now = T; return { t: now, events, stop: 'horizon' }; }
          if (events >= maxEv) { C.code('budget', now); return { t: now, events, stop: 'budget' }; }
          const e = pop(); now = e.t; events++;
          if (now === instT || abs(now - instT) <= eps * max(1, abs(now))) { if (++instN > zenoMax) { C.code('zeno', now); return { t: now, events, stop: 'zeno' }; } } else { instT = now; instN = 1; }
          e.fn(e);
          if (stopped) return { t: now, events, stop: stopped };
          // the C phase once the instant is over (no more B events at this time)
          if (conds.length && !(peekT() <= now + eps * max(1, abs(now)))) {
            for (let pass = 0; pass < 1000; pass++) {
              let fired = false;
              for (const c of conds) if (c.on && c.cond(now)) { c.fn(now); events++; fired = true; if (c.once) c.on = false; if (stopped) return { t: now, events, stop: stopped }; }
              if (!fired) break;
              if (pass === 999 || ++instN > zenoMax) { C.code('zeno', now); return { t: now, events, stop: 'zeno' }; }
            }
          }
        }
      },
    };
    return S;
  }

  /* ======================================================================================================================
     Continuous time: integrate(cfg) — DOPRI5 (HNW §II.4–II.5, Dormand & Prince 1980 with Hairer's dense output contd5 and the PI
     controller of §IV.2), or fixed steps (RK4, Heun, Euler) with cubic Hermite dense output. State events g(t, y) are watched on each
     step: a sign change in the event's direction is bracketed and located by the Illinois method on the dense output (Shampine et
     al. 2003); with `hyst` > 0 an event re-arms only after |g| has exceeded hyst on the other side (no chattering).
     cfg = {f(t, y, dy), y0, t0, tEnd, method, rtol, atol, dt, hmax, maxSteps, samples: [t…], onSample(t, y),
            events: [{g(t, y), dir (−1, 0, +1), hyst, onEvent(t, y) → 'stop' | 'continue' | undefined (y may be changed in place)}],
            maxEvents (Zeno guard, 1000)}
     → {t, y, steps, rejected, nfev, events: [{t, j}], stop: 'end' | 'event' | codes…, codes}
     ====================================================================================================================== */
  const DP = { a21: 1 / 5, a31: 3 / 40, a32: 9 / 40, a41: 44 / 45, a42: -56 / 15, a43: 32 / 9, a51: 19372 / 6561, a52: -25360 / 2187, a53: 64448 / 6561, a54: -212 / 729,
    a61: 9017 / 3168, a62: -355 / 33, a63: 46732 / 5247, a64: 49 / 176, a65: -5103 / 18656, a71: 35 / 384, a73: 500 / 1113, a74: 125 / 192, a75: -2187 / 6784, a76: 11 / 84,
    e1: 71 / 57600, e3: -71 / 16695, e4: 71 / 1920, e5: -17253 / 339200, e6: 22 / 525, e7: -1 / 40,
    d1: -12715105075 / 11282082432, d3: 87487479700 / 32700410799, d4: -10690763975 / 1880347072, d5: 701980252875 / 199316789632, d6: -1453857185 / 822651844, d7: 69997945 / 29380423 };
  function dopri(n, f, o, st) {
    const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n), k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
    const y = new Float64Array(n), y1 = new Float64Array(n), yt = new Float64Array(n), ys = new Float64Array(n);
    const { rtol, atol, hmax } = o; let t = 0, h = 0, facold = 1e-4, iasti = 0, nonsti = 0, stiff = false;
    const sk = (i, a, b) => atol + rtol * max(abs(a), abs(b));
    function hinit() {
      let dnf = 0, dny = 0; for (let i = 0; i < n; i++) { const s = sk(i, y[i], 0); dnf += (k1[i] / s) ** 2; dny += (y[i] / s) ** 2; }
      let hh = dnf <= 1e-10 || dny <= 1e-10 ? 1e-6 : sqrt(dny / dnf) * 0.01; hh = min(hh, hmax);
      for (let i = 0; i < n; i++) yt[i] = y[i] + hh * k1[i]; f(t + hh, yt, k2); st.nfev++;
      let d2 = 0; for (let i = 0; i < n; i++) d2 += ((k2[i] - k1[i]) / sk(i, y[i], 0)) ** 2; d2 = sqrt(d2) / hh;
      const d12 = max(abs(d2), sqrt(dnf)), h1 = d12 <= 1e-15 ? max(1e-6, abs(hh) * 1e-3) : pow(0.01 / d12, 0.2);
      const r = min(100 * abs(hh), h1, hmax); return r > 0 ? r : hmax * 1e-3;
    }
    return {
      get stiff() { return stiff; },
      reset(t0, y0) { t = t0; y.set(y0); f(t, y, k1); st.nfev++; if (!(h > 0)) h = hinit(); facold = 1e-4; },
      step(tT) {
        for (let tries = 0; ; tries++) {
          const span = tT - t; if (!(span > 0)) return { fail: 'time' };
          let hh = min(h, hmax), last = false; if (hh >= span * (1 - 1e-12)) { hh = span; last = true; }
          if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * DP.a21 * k1[i]; f(t + 0.2 * hh, yt, k2);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (DP.a31 * k1[i] + DP.a32 * k2[i]); f(t + 0.3 * hh, yt, k3);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (DP.a41 * k1[i] + DP.a42 * k2[i] + DP.a43 * k3[i]); f(t + 0.8 * hh, yt, k4);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (DP.a51 * k1[i] + DP.a52 * k2[i] + DP.a53 * k3[i] + DP.a54 * k4[i]); f(t + 8 / 9 * hh, yt, k5);
          for (let i = 0; i < n; i++) ys[i] = y[i] + hh * (DP.a61 * k1[i] + DP.a62 * k2[i] + DP.a63 * k3[i] + DP.a64 * k4[i] + DP.a65 * k5[i]);
          const tph = last ? tT : t + hh; f(tph, ys, k6);
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh * (DP.a71 * k1[i] + DP.a73 * k3[i] + DP.a74 * k4[i] + DP.a75 * k5[i] + DP.a76 * k6[i]);
          f(tph, y1, k7); st.nfev += 6;
          let err = 0; for (let i = 0; i < n; i++) { const e = hh * (DP.e1 * k1[i] + DP.e3 * k3[i] + DP.e4 * k4[i] + DP.e5 * k5[i] + DP.e6 * k6[i] + DP.e7 * k7[i]); err += (e / sk(i, y[i], y1[i])) ** 2; }
          err = sqrt(err / n);
          if (!fin(err)) { st.rejected++; h = hh / 10; if (!(h > 1e-300)) return { fail: 'nan' }; continue; }
          const fac11 = pow(err, 0.2 - 0.04 * 0.75);
          if (err <= 1) {
            let fac = fac11 / pow(facold, 0.04); fac = max(0.1, min(5, fac / 0.9)); const hnew = hh / fac; facold = max(err, 1e-4);
            // the stiffness test of DOPRI5 (HNW §IV.2): h·ρ ≈ h·‖k7 − k6‖/‖y1 − ys‖ > 3.25 on 15 accepted steps
            let sn = 0, sd = 0; for (let i = 0; i < n; i++) { sn += (k7[i] - k6[i]) ** 2; sd += (y1[i] - ys[i]) ** 2; }
            if (sd > 0) { if (hh * sqrt(sn / sd) > 3.25) { nonsti = 0; iasti++; if (iasti >= 15) stiff = true; } else { nonsti++; if (nonsti === 6) iasti = 0; } }
            const r1 = Float64Array.from(y), r2 = new Float64Array(n), r3 = new Float64Array(n), r4 = new Float64Array(n), r5 = new Float64Array(n);
            for (let i = 0; i < n; i++) { const dy = y1[i] - y[i], bs = hh * k1[i] - dy; r2[i] = dy; r3[i] = bs; r4[i] = dy - hh * k7[i] - bs; r5[i] = hh * (DP.d1 * k1[i] + DP.d3 * k3[i] + DP.d4 * k4[i] + DP.d5 * k5[i] + DP.d6 * k6[i] + DP.d7 * k7[i]); }
            const ta = t, hs = hh;
            const seg = (tq, out) => { const th = (tq - ta) / hs, th1 = 1 - th; for (let i = 0; i < n; i++) out[i] = r1[i] + th * (r2[i] + th1 * (r3[i] + th * (r4[i] + th1 * r5[i]))); };
            t = tph; y.set(y1); k1.set(k7); h = last ? max(h, hnew) : hnew;
            return { t0: ta, t1: tph, y1: y, seg };
          }
          st.rejected++; h = hh / min(10, fac11 / 0.9);
        }
      },
    };
  }
  function fixed(method, n, f, o, st) {
    const y = new Float64Array(n), y1 = new Float64Array(n), f0 = new Float64Array(n), f1 = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), yt = new Float64Array(n);
    let t = 0; const dt = o.dt;
    return {
      stiff: false,
      reset(t0, y0) { t = t0; y.set(y0); f(t, y, f0); st.nfev++; },
      step(tT) {
        const span = tT - t; if (!(span > 0)) return { fail: 'time' };
        const hh = min(dt, span), tph = hh === span ? tT : t + hh;
        if (method === 'euler') for (let i = 0; i < n; i++) y1[i] = y[i] + hh * f0[i];
        else if (method === 'heun') { for (let i = 0; i < n; i++) yt[i] = y[i] + hh * f0[i]; f(tph, yt, a); st.nfev++; for (let i = 0; i < n; i++) y1[i] = y[i] + 0.5 * hh * (f0[i] + a[i]); }
        else {   // the classical RK4 (HNW §II.1)
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * f0[i]; f(t + 0.5 * hh, yt, a);
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * a[i]; f(t + 0.5 * hh, yt, b);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * b[i]; f(tph, yt, c); st.nfev += 3;
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh / 6 * (f0[i] + 2 * a[i] + 2 * b[i] + c[i]);
        }
        f(tph, y1, f1); st.nfev++;
        const r0 = Float64Array.from(y), r1 = Float64Array.from(y1), d0 = Float64Array.from(f0), d1 = Float64Array.from(f1), ta = t, hs = hh;
        const seg = (tq, out) => { const s = (tq - ta) / hs, s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
          for (let i = 0; i < n; i++) out[i] = h00 * r0[i] + h10 * hs * d0[i] + h01 * r1[i] + h11 * hs * d1[i]; };
        t = tph; y.set(y1); f0.set(f1);
        return { t0: ta, t1: tph, y1: y, seg };
      },
    };
  }

  // Rosenbrock 2(3) of Shampine & Reichelt 1997 (SIAM J. Sci. Comput. 18:1; MATLAB ode23s): L-stable, W = I − h·d·J, d = 1/(2 + √2),
  // a forward-difference Jacobian and the ntrp23s dense output (the same method as ode@1's stepperRos)
  function luFactor(A, n, piv) {
    for (let k = 0; k < n; k++) { let p = k, mx = abs(A[k * n + k]); for (let i = k + 1; i < n; i++) if (abs(A[i * n + k]) > mx) { mx = abs(A[i * n + k]); p = i; }
      if (!(mx > 1e-300)) return false; piv[k] = p; if (p !== k) for (let j = 0; j < n; j++) { const tt = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = tt; }
      for (let i = k + 1; i < n; i++) { const l = A[i * n + k] /= A[k * n + k]; for (let j = k + 1; j < n; j++) A[i * n + j] -= l * A[k * n + j]; } }
    return true;
  }
  function luSolve(A, n, piv, b) {
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const tt = b[k]; b[k] = b[p]; b[p] = tt; } }
    for (let i = 1; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= A[i * n + j] * b[j]; b[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j]; b[i] = s / A[i * n + i]; }
  }
  function rosenbrock(n, f, o, st) {
    const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
    const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n), k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
    const y = new Float64Array(n), y1 = new Float64Array(n), yt = new Float64Array(n), J = new Float64Array(n * n), W = new Float64Array(n * n), Tt = new Float64Array(n), fx = new Float64Array(n);
    const piv = new Int32Array(n); const { rtol, atol, hmax } = o; let t = 0, h = 0;
    function jac() {
      for (let j = 0; j < n; j++) { const yj = y[j], del = 1.4901161193847656e-8 * max(abs(yj), atol / rtol * 1e-3, 1e-12); y[j] = yj + del; f(t, y, fx); y[j] = yj; for (let i = 0; i < n; i++) J[i * n + j] = (fx[i] - F0[i]) / del; }
      const dt = 1.4901161193847656e-8 * max(abs(t), 1e-6); f(t + dt, y, fx); for (let i = 0; i < n; i++) Tt[i] = (fx[i] - F0[i]) / dt; st.nfev += n + 1;
    }
    return {
      stiff: false,
      reset(t0, y0) { t = t0; y.set(y0); f(t, y, F0); st.nfev++;
        if (!(h > 0)) { let s = 0; for (let i = 0; i < n; i++) s += (F0[i] / (atol + rtol * abs(y[i]))) ** 2; s = sqrt(s / n); h = min(hmax, s > 0 ? 0.8 * pow(rtol, 1 / 3) / s : hmax / 100); if (!(h > 0)) h = hmax * 1e-3; }
        jac(); },
      step(tT) {
        if (!F0.every(fin)) return { fail: 'nan' };
        for (let tries = 0; ; tries++) {
          const span = tT - t; if (!(span > 0)) return { fail: 'time' };
          let hh = min(h, hmax), last = false; if (hh >= span * (1 - 1e-12)) { hh = span; last = true; }
          if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
          for (let i = 0; i < n * n; i++) W[i] = -hh * d * J[i]; for (let i = 0; i < n; i++) W[i * n + i] += 1;
          if (!luFactor(W, n, piv)) { st.rejected++; h = hh / 4; continue; }
          for (let i = 0; i < n; i++) k1[i] = F0[i] + hh * d * Tt[i]; luSolve(W, n, piv, k1);
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * k1[i]; f(t + 0.5 * hh, yt, F1);
          for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i]; luSolve(W, n, piv, k2); for (let i = 0; i < n; i++) k2[i] += k1[i];
          const tph = last ? tT : t + hh;
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh * k2[i]; f(tph, y1, F2); st.nfev += 2;
          for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + hh * d * Tt[i]; luSolve(W, n, piv, k3);
          let err = 0; for (let i = 0; i < n; i++) { const e = hh / 6 * (k1[i] - 2 * k2[i] + k3[i]); err += (e / (atol + rtol * max(abs(y[i]), abs(y1[i])))) ** 2; }
          err = sqrt(err / n);
          if (!fin(err)) { st.rejected++; h = hh / 10; continue; }
          if (err <= 1) {
            const hnew = hh * min(5, max(0.2, 0.8 * pow(max(err, 1e-10), -1 / 3)));
            const r0 = Float64Array.from(y), c1 = Float64Array.from(k1), c2 = Float64Array.from(k2), ta = t, hs = hh, q = 1 - 2 * d;
            const seg = (tq, out) => { const s2 = (tq - ta) / hs; for (let i = 0; i < n; i++) out[i] = r0[i] + hs * (s2 * (1 - s2) / q * c1[i] + s2 * (s2 - 2 * d) / q * c2[i]); };
            t = tph; y.set(y1); F0.set(F2); h = last ? max(h, hnew) : hnew; jac();
            return { t0: ta, t1: tph, y1: y, seg };
          }
          st.rejected++; h = hh * max(0.2, 0.8 * pow(err, -1 / 3));
        }
      },
    };
  }
  // symplectic steps for a separable Hamiltonian system given as pairs [q index, p index] with q' = ∂H/∂p (a function of p) and
  // p' = −∂H/∂q (a function of q): Störmer–Verlet kick–drift–kick (Hairer, Lubich & Wanner, Geometric Numerical Integration, 2nd ed.
  // 2006, §I.1.4) and Yoshida 1990's 4th-order triple jump (Phys. Lett. A 150); cubic Hermite dense output
  function symplectic(method, n, f, o, st, pairs) {
    const y = new Float64Array(n), y1 = new Float64Array(n), f0 = new Float64Array(n), f1 = new Float64Array(n), a = new Float64Array(n);
    let t = 0; const dt = o.dt, qi = pairs.map(p => p[0]), pi = pairs.map(p => p[1]);
    const kdk = (tt, hh, v) => { f(tt, v, a); for (const j of pi) v[j] += 0.5 * hh * a[j]; f(tt + 0.5 * hh, v, a); for (const j of qi) v[j] += hh * a[j]; f(tt + hh, v, a); for (const j of pi) v[j] += 0.5 * hh * a[j]; st.nfev += 3; };
    const Y1 = 1 / (2 - Math.cbrt(2)), Y0 = 1 - 2 * Y1;
    return {
      stiff: false,
      reset(t0, y0) { t = t0; y.set(y0); f(t, y, f0); st.nfev++; },
      step(tT) {
        const span = tT - t; if (!(span > 0)) return { fail: 'time' };
        const hh = min(dt, span), tph = hh === span ? tT : t + hh;
        y1.set(y); if (method === 'verlet') kdk(t, hh, y1); else { kdk(t, Y1 * hh, y1); kdk(t + Y1 * hh, Y0 * hh, y1); kdk(t + (Y1 + Y0) * hh, Y1 * hh, y1); }
        f(tph, y1, f1); st.nfev++;
        const r0 = Float64Array.from(y), r1 = Float64Array.from(y1), d0 = Float64Array.from(f0), d1 = Float64Array.from(f1), ta = t, hs = hh;
        const seg = (tq, out) => { const s = (tq - ta) / hs, s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
          for (let i = 0; i < n; i++) out[i] = h00 * r0[i] + h10 * hs * d0[i] + h01 * r1[i] + h11 * hs * d1[i]; };
        t = tph; y.set(y1); f0.set(f1);
        return { t0: ta, t1: tph, y1: y, seg };
      },
    };
  }
  const METHODS = ['auto', 'dopri5', 'rosenbrock', 'rk4', 'heun', 'euler', 'verlet', 'yoshida4'];
  function integrate(cfg) {
    const C = codes(['nan', 'blow-up', 'step-underflow', 'budget', 'zeno', 'bad-config']);
    const st = { steps: 0, rejected: 0, nfev: 0 };
    const y0 = cfg && cfg.y0 ? Float64Array.from(cfg.y0) : null, n = y0 ? y0.length : 0;
    const t0 = cfg && fin(cfg.t0) ? cfg.t0 : 0, tEnd = cfg && cfg.tEnd;
    let method = cfg && METHODS.includes(cfg.method) ? cfg.method : 'auto';
    const done = (t, y, stop, evs) => ({ t, y: y ? Array.from(y) : [], steps: st.steps, rejected: st.rejected, nfev: st.nfev, events: evs || [], stop, method, codes: C.list });
    if (!cfg || typeof cfg.f !== 'function' || !n || !fin(tEnd) || !(tEnd >= t0)) { C.code('bad-config'); return done(t0, y0, 'bad-config'); }
    const pairs = Array.isArray(cfg.pairs) ? cfg.pairs.filter(p => Array.isArray(p) && p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n) : [];
    const sym = method === 'verlet' || method === 'yoshida4';
    if (['rk4', 'heun', 'euler', 'verlet', 'yoshida4'].includes(method) && !(cfg.dt > 0)) { C.code('bad-config'); return done(t0, y0, 'bad-config'); }
    if (sym && pairs.length * 2 !== n) { C.code('bad-config'); return done(t0, y0, 'bad-config'); }
    const o = { rtol: cfg.rtol > 0 ? cfg.rtol : 1e-6, atol: cfg.atol > 0 ? cfg.atol : 1e-9, hmax: cfg.hmax > 0 ? cfg.hmax : max(abs(tEnd - t0), 1e-12), dt: cfg.dt };
    const maxSteps = fin(cfg.maxSteps) ? min(cfg.maxSteps, MAX_STEPS) : MAX_STEPS, maxEvents = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : 1000;
    const f = (t, y, dy) => { cfg.f(t, y, dy); };
    const make = m => (m === 'dopri5' || m === 'auto' ? dopri(n, f, o, st) : m === 'rosenbrock' ? rosenbrock(n, f, o, st) : m === 'verlet' || m === 'yoshida4' ? symplectic(m, n, f, o, st, pairs) : fixed(m, n, f, o, st));
    let S = make(method), auto = method === 'auto';
    const evs = (cfg.events || []).filter(e => e && typeof e.g === 'function');
    const armed = evs.map(() => true), gv = new Float64Array(evs.length), ztol = cfg.gtol > 0 ? cfg.gtol : 1e-10, lastHit = evs.map(() => -Infinity);
    const samples = cfg.samples || []; let si = 0;
    let t = t0; const y = Float64Array.from(y0), tmp = new Float64Array(n), ya = new Float64Array(n);
    if (!y.every(fin)) { C.code('nan', t); return done(t, y, 'nan'); }
    const evalG = (tt, yy) => { for (let j = 0; j < evs.length; j++) gv[j] = evs[j].g(tt, yy); };
    S.reset(t, y); evalG(t, y);
    // a g that is exactly 0 at the start takes the side it must leave towards for its direction (a ball put on the floor)
    for (let j = 0; j < evs.length; j++) if (gv[j] === 0 && evs[j].dir) gv[j] = evs[j].dir < 0 ? 1e-300 : -1e-300;
    while (si < samples.length && samples[si] <= t) { cfg.onSample && cfg.onSample(samples[si], y); si++; }
    const hits = []; let ymax0 = 1; for (let i = 0; i < n; i++) ymax0 = max(ymax0, abs(y[i]));
    let instT = NaN, instN = 0;
    for (;;) {
      if (t >= tEnd) return done(t, y, 'end', hits);
      if (st.steps >= maxSteps) { C.code('budget', t); return done(t, y, 'budget', hits); }
      const r = S.step(tEnd);
      if (r.fail) { C.code(r.fail === 'time' ? 'step-underflow' : r.fail, t); return done(t, y, r.fail, hits); }
      st.steps++;
      const g0 = Float64Array.from(gv); evalG(r.t1, r.y1);
      const loc = new Float64Array(evs.length).fill(Infinity), side = new Float64Array(evs.length);
      let first = Infinity;
      for (let j = 0; j < evs.length; j++) {
        const a0 = g0[j], b0 = gv[j];
        if (!armed[j]) { if (abs(b0) > (evs[j].hyst || 0)) armed[j] = true; continue; }   // hysteresis: re-armed once |g| > hyst
        const dir = evs[j].dir || 0, up = a0 < 0 && b0 >= 0, down = a0 > 0 && b0 <= 0;
        if (!((dir >= 0 && up) || (dir <= 0 && down))) continue;
        const tr = locate(tt => { r.seg(tt, tmp); return evs[j].g(tt, tmp); }, r.t0, r.t1, a0, b0, { tol: 1e-13 });
        if (tr <= lastHit[j] + 1e-9 * max(1, abs(tr))) continue;   // the crossing just handled, seen again from its other side
        loc[j] = tr; side[j] = up ? 1 : -1; if (tr < first) first = tr;
      }
      if (first < Infinity) {   // the step is cut at the earliest event; simultaneous events (within 1e-12·t) fire together, in order
        const tolS = 1e-12 * max(1, abs(first));
        r.seg(first, ya);
        while (si < samples.length && samples[si] <= first) { r.seg(samples[si], tmp); cfg.onSample && cfg.onSample(samples[si], tmp); si++; }
        let stop = false; const fired = [];
        for (let j = 0; j < evs.length; j++) if (loc[j] <= first + tolS) {
          fired.push(j); lastHit[j] = first; hits.push({ t: first, j, kind: evs[j].kind, dir: side[j] });
          const act = evs[j].onEvent ? evs[j].onEvent(first, ya, { j, dir: side[j] }) : undefined;
          if (act === 'stop' || evs[j].terminal) stop = true;
        }
        if (first === instT || abs(first - instT) <= tolS) instN += fired.length; else { instT = first; instN = fired.length; }
        if (hits.length > maxEvents || instN > 100) { C.code('zeno', first); return done(first, ya, 'zeno', hits); }
        t = first; y.set(ya);
        if (stop) return done(t, y, 'event', hits);
        if (!y.every(fin)) { C.code('nan', t); return done(t, y, 'nan', hits); }
        S.reset(t, y); evalG(t, y);
        // after a hit, a g left at (about) 0 takes the side it must leave towards for its direction (as at the start; ode@1's rule),
        // so the next crossing is seen even when it fits in one step; a direction-free event takes the side the crossing went to.
        // With hyst > 0 the event stays disarmed until |g| > hyst
        for (const j of fired) { if (abs(gv[j]) <= ztol) { const d0 = evs[j].dir || 0; gv[j] = d0 ? (d0 < 0 ? 1e-300 : -1e-300) : side[j] * 1e-300; } if (evs[j].hyst > 0) armed[j] = false; }
        continue;
      }
      while (si < samples.length && samples[si] <= r.t1) { r.seg(samples[si], tmp); cfg.onSample && cfg.onSample(samples[si], tmp); si++; }
      t = r.t1; y.set(r.y1);
      if (!y.every(fin)) { C.code('nan', t); return done(t, y, 'nan', hits); }
      let ym = 0; for (let i = 0; i < n; i++) ym = max(ym, abs(y[i]));
      if (ym > 1e12 * ymax0) { C.code('blow-up', t); return done(t, y, 'blow-up', hits); }
      if (auto && S.stiff) { C.code('stiff-switched', t); auto = false; method = 'rosenbrock'; S = make('rosenbrock'); S.reset(t, y); }   // like LSODA's switch (Petzold 1983)
      else if (!auto && S.stiff && !C.has('stiff')) C.code('stiff', t);
    }
  }

  /* ======================================================================================================================
     Output analysis (L ch. 9; BCNN ch. 11)
     ====================================================================================================================== */
  /** Welford 1962: running mean and variance, numerically stable */
  function welford() {
    let n = 0, m = 0, s = 0, lo = Infinity, hi = -Infinity, sum = 0;
    return { add(x) { if (!fin(x)) return; n++; const d = x - m; m += d / n; s += d * (x - m); sum += x; if (x < lo) lo = x; if (x > hi) hi = x; },
      get n() { return n; }, get mean() { return n ? m : NaN; }, get var() { return n > 1 ? s / (n - 1) : NaN; }, get sd() { return n > 1 ? sqrt(s / (n - 1)) : NaN; },
      get min() { return n ? lo : NaN; }, get max() { return n ? hi : NaN; }, get sum() { return sum; } };
  }
  /** a time-weighted average of a piecewise-constant quantity (a queue length): update(t, v) at each change (L §1.4.1 "area under
      Q(t)"); reset(t) starts again (end of warm-up) keeping the current value */
  function timeAvg(t0, v0) {
    let tl = fin(t0) ? t0 : 0, ts = tl, v = fin(v0) ? v0 : 0, area = 0, mx = v, area2 = 0;
    return { update(t, nv) { if (t > tl) { area += v * (t - tl); area2 += v * v * (t - tl); tl = t; } v = nv; if (nv > mx) mx = nv; },
      add(t, dv) { this.update(t, v + dv); }, get value() { return v; },
      mean(t) { const tt = fin(t) ? max(t, tl) : tl, a = area + v * (tt - tl); return tt > ts ? a / (tt - ts) : NaN; },
      area(t) { const tt = fin(t) ? max(t, tl) : tl; return area + v * (tt - tl); },
      reset(t) { if (t > tl) { tl = t; } ts = tl; area = 0; area2 = 0; mx = v; }, get max() { return mx; }, get start() { return ts; } };
  }
  /** ci(values, level) → {n, mean, sd, half, lo, hi}: the Student-t interval of a mean of independent values (L §4.5) */
  function ci(values, level) {
    const lv = level > 0 && level < 1 ? level : 0.95, w = welford(); for (const v of values || []) w.add(v);
    const n = w.n, mean = w.mean, sd = w.sd;
    const half = n >= 2 ? tq(1 - (1 - lv) / 2, n - 1) * sd / sqrt(n) : NaN;
    return { n, mean, sd, half, lo: mean - half, hi: mean + half, level: lv };
  }
  /** lag-k autocorrelation of a series */
  function acf(x, k) { const n = x.length; if (n <= k + 1) return NaN; let m = 0; for (const v of x) m += v; m /= n; let c0 = 0, ck = 0; for (let i = 0; i < n; i++) c0 += (x[i] - m) ** 2; for (let i = 0; i + k < n; i++) ck += (x[i] - m) * (x[i + k] - m); return c0 > 0 ? ck / c0 : NaN; }
  /** batchMeans(series, nb, level) → ci over nb non-overlapping batch means + lag1 (their lag-1 autocorrelation: |lag1| > 0.2 →
      code 'batch-correlated', batches too short; Schmeiser 1982; L §9.5.3) */
  function batchMeans(x, nb, level) {
    const k = Number.isInteger(nb) && nb >= 2 ? nb : 20, m = floor((x || []).length / k);
    if (m < 1) return { ...ci([], level), batches: [], lag1: NaN, size: 0 };
    const bm = []; for (let b = 0; b < k; b++) { let s = 0; for (let i = b * m; i < (b + 1) * m; i++) s += x[i]; bm.push(s / m); }
    return { ...ci(bm, level), batches: bm, lag1: acf(bm, 1), size: m };
  }
  /** MSER-5 (White 1997; White, Cobb & Spratt 2000; Franklin & White 2008): the series is cut in batches of 5; d* minimises the
      standard error of the remaining mean, searched over the first half only (a d* in the second half means the run is too short:
      {short: true}) → {d (observations to delete), dBatches, short} */
  function mser5(x) {
    const n = floor((x || []).length / 5); if (n < 4) return { d: 0, dBatches: 0, short: true, z: [] };
    const z = []; for (let j = 0; j < n; j++) { let s = 0; for (let i = 5 * j; i < 5 * j + 5; i++) s += x[i]; z.push(s / 5); }
    // suffix sums: the mean and the sum of squares of z[d..n)
    const S1 = new Float64Array(n + 1), S2 = new Float64Array(n + 1); for (let j = n - 1; j >= 0; j--) { S1[j] = S1[j + 1] + z[j]; S2[j] = S2[j + 1] + z[j] * z[j]; }
    let best = Infinity, dB = 0;
    for (let d = 0; d <= n - 2; d++) { const k = n - d, mean = S1[d] / k, ss = S2[d] - k * mean * mean, v = max(0, ss) / (k * k); if (v < best) { best = v; dB = d; } }
    return { d: 5 * dB, dBatches: dB, short: dB > n / 2, z };
  }
  /** replicate(n, seed, fn(seedI, i) → {name: number}) → {name: ci}: independent replications (L §9.4.1); seedI = subseed(seed, i) */
  function replicate(n, seed, fn, level) {
    const runs = []; const N = min(max(1, floor(n) || 1), 1000);
    for (let i = 0; i < N; i++) { let r; try { r = fn(subseed(seed >>> 0, i), i); } catch (e) { r = null; } runs.push(isObj(r) ? r : {}); }
    const names = new Set(); for (const r of runs) for (const k of Object.keys(r)) names.add(k);
    const out = {}; for (const k of names) out[k] = ci(runs.map(r => r[k]), level);
    return out;
  }
  /** Little 1961: L = λW. littleCheck(L, lambda, W) → the relative gap |L − λW| / max(L, λW) (finite runs: end effects of order 1/T) */
  function littleCheck(L, lambda, W) { const a = lambda * W, d = max(abs(L), abs(a)); return d > 0 ? abs(L - a) / d : 0; }

  /* ======================================================================================================================
     Sweeps and sensitivity (Saltelli et al. 2008). fn(x) gets x as an array in the model's units; budgets bound the evaluations.
     ====================================================================================================================== */
  const linspace = (a, b, n) => (n <= 1 ? [a] : Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)));
  /** oat(base, axes [{lo, hi, points}], fn) → [{axis, x: [...], y: [...]}]: one factor at a time around the base point */
  function oat(base, axes, fn, maxEval) {
    const cap = fin(maxEval) ? maxEval : 2000, res = []; let used = 0;
    axes.forEach((a, i) => { const xs = linspace(a.lo, a.hi, a.points || 11), ys = [];
      for (const v of xs) { if (used++ >= cap) { ys.push(NaN); continue; } const x = base.slice(); x[i] = v; ys.push(safe(fn, x)); }
      res.push({ axis: i, x: xs, y: ys }); });
    return res;
  }
  const safe = (fn, x) => { try { const v = fn(x); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } };
  /** grid(axes, fn, maxEval) → {points: [[x…]], y: [...], over: bool}: the full factorial grid (row-major, the last axis fastest) */
  function grid(axes, fn, maxEval) {
    const cap = fin(maxEval) ? maxEval : 2000, ns = axes.map(a => a.points || 5), total = ns.reduce((p, k) => p * k, 1);
    const pts = [], y = []; if (total > cap) return { points: [], y: [], over: true, total };
    for (let idx = 0; idx < total; idx++) { let r = idx; const x = new Array(axes.length);
      for (let i = axes.length - 1; i >= 0; i--) { const k = r % ns[i]; r = (r - k) / ns[i]; x[i] = linspace(axes[i].lo, axes[i].hi, ns[i])[k]; }
      pts.push(x); y.push(safe(fn, x)); }
    return { points: pts, y, over: false, total };
  }
  const scale = (u, axes) => u.map((v, i) => axes[i].lo + v * (axes[i].hi - axes[i].lo));
  /** Morris 1991 elementary effects with r trajectories on a p-level grid, Δ = p/(2(p − 1)); μ* (Campolongo et al. 2007) and σ.
      Cost r·(k + 1) evaluations. → {mu, muStar, sigma, evals} */
  function morris(axes, fn, o) {
    const k = axes.length, r = (o && o.r) || 10, p = (o && o.levels) || 4, D = p / (2 * (p - 1)), rs = stream((o && o.seed) || 1, 'morris');
    const cap = (o && o.maxEval) || 2000; if (r * (k + 1) > cap) return { mu: [], muStar: [], sigma: [], evals: 0, over: true };
    const EE = axes.map(() => []); let evals = 0;
    for (let t = 0; t < r; t++) {
      // a random base point on the grid where x + Δ stays inside, a random order and random directions (Morris 1991 §3)
      const x = axes.map(() => rs.int(floor(p / 2)) / (p - 1)), order = rs.shuffle(axes.map((_, i) => i));
      let y0 = safe(fn, scale(x, axes)); evals++;
      for (const i of order) {
        const up = x[i] + D <= 1 + 1e-12 && (x[i] - D < -1e-12 || rs() < 0.5), dx = up ? D : -D;
        x[i] += dx; const y1 = safe(fn, scale(x, axes)); evals++;
        EE[i].push((y1 - y0) / dx); y0 = y1;
      }
    }
    const mu = EE.map(e => e.reduce((a, b) => a + b, 0) / e.length), muStar = EE.map(e => e.reduce((a, b) => a + abs(b), 0) / e.length);
    const sigma = EE.map((e, i) => (e.length > 1 ? sqrt(e.reduce((a, b) => a + (b - mu[i]) ** 2, 0) / (e.length - 1)) : NaN));
    return { mu, muStar, sigma, evals, over: false };
  }
  /** Sobol' indices by the Saltelli 2010 scheme: matrices A, B (N × k) and A_B^(i); first order S_i = mean(f(B)(f(A_B^i) − f(A)))/V
      (Saltelli et al. 2010 eq. (b) of Table 2), total S_Ti = mean((f(A) − f(A_B^i))²)/(2V) (Jansen 1999). Cost N(k + 2). The base
      samples are MRG32k3a uniforms (a quasi-random sequence would converge faster; the estimator is unbiased either way).
      → {S1, ST, V, evals, over} */
  function sobol(axes, fn, o) {
    const k = axes.length, N = (o && o.N) || 256, cap = (o && o.maxEval) || 20000, rs = stream((o && o.seed) || 1, 'sobol');
    if (N * (k + 2) > cap) return { S1: [], ST: [], V: NaN, evals: 0, over: true };
    const A = [], B = []; for (let j = 0; j < N; j++) { A.push(axes.map(() => rs())); B.push(axes.map(() => rs())); }
    const fA = A.map(u => safe(fn, scale(u, axes))), fB = B.map(u => safe(fn, scale(u, axes)));
    let m = 0; for (let j = 0; j < N; j++) m += fA[j] + fB[j]; m /= 2 * N;
    let V = 0; for (let j = 0; j < N; j++) V += (fA[j] - m) ** 2 + (fB[j] - m) ** 2; V /= 2 * N - 1;
    const S1 = [], ST = [];
    for (let i = 0; i < k; i++) {
      let s1 = 0, st = 0;
      for (let j = 0; j < N; j++) { const u = A[j].slice(); u[i] = B[j][i]; const f = safe(fn, scale(u, axes)); s1 += fB[j] * (f - fA[j]); st += (fA[j] - f) ** 2; }
      S1.push(V > 0 ? s1 / N / V : NaN); ST.push(V > 0 ? st / (2 * N) / V : NaN);
    }
    return { S1, ST, V, evals: N * (k + 2), over: false };
  }

  /* ======================================================================================================================
     Verification helpers (Sargent 2013: verification = the code computes the model right)
     ====================================================================================================================== */
  /** richardson(hs, values, exact?) → {p (observed order), extrapolated}: with the exact value p = log(e1/e2)/log(h1/h2) on the last
      two; without it three solutions with a constant ratio r give p = log((f1 − f2)/(f2 − f3))/log r (Richardson 1911; Roache 1998) */
  function richardson(hs, f, exact) {
    const n = hs.length; if (n < 2 || f.length !== n) return { p: NaN, extrapolated: NaN };
    if (exact != null && fin(exact)) { const e1 = abs(f[n - 2] - exact), e2 = abs(f[n - 1] - exact), p = log(e1 / e2) / log(hs[n - 2] / hs[n - 1]); return { p, extrapolated: f[n - 1] + (f[n - 1] - f[n - 2]) / (pow(hs[n - 2] / hs[n - 1], p) - 1) }; }
    if (n < 3) return { p: NaN, extrapolated: NaN };
    const r = hs[n - 3] / hs[n - 2], p = log(abs((f[n - 3] - f[n - 2]) / (f[n - 2] - f[n - 1]))) / log(r);
    return { p, extrapolated: f[n - 1] + (f[n - 1] - f[n - 2]) / (pow(r, p) - 1) };
  }
  /** conservation(series, tol) → {drift (max |x − x0| / max(1, |x0|)), ok} */
  function conservation(x, tol) { if (!x || !x.length) return { drift: NaN, ok: false }; const a = x[0], sc = max(1, abs(a)); let d = 0; for (const v of x) d = max(d, abs(v - a)); return { drift: d / sc, ok: d / sc <= (tol || 1e-9) }; }
  /** deterministic(fn, seed) → true when two runs with the same seed give the same JSON (determinism asserted) */
  function deterministic(fn, seed) { try { return JSON.stringify(fn(seed)) === JSON.stringify(fn(seed)); } catch (e) { return false; } }
  /* units: dimensions over the SI base (m, kg, s, A, K, mol, cd) with the prefixes and the common derived units; a hook the engines
     call to check that a model's quantities agree (BIPM, The International System of Units, 9th ed. 2019) */
  const BASE = { m: [1, 0, 0, 0, 0, 0, 0], g: [0, 1, 0, 0, 0, 0, 0], s: [0, 0, 1, 0, 0, 0, 0], A: [0, 0, 0, 1, 0, 0, 0], K: [0, 0, 0, 0, 1, 0, 0], mol: [0, 0, 0, 0, 0, 1, 0], cd: [0, 0, 0, 0, 0, 0, 1] };
  const DERIVED = { N: [1, 'kg*m/s^2'], J: [1, 'N*m'], W: [1, 'J/s'], Pa: [1, 'N/m^2'], Hz: [1, '1/s'], C: [1, 'A*s'], V: [1, 'W/A'], ohm: [1, 'V/A'], L: [1e-3, 'm^3'],
    min: [60, 's'], h: [3600, 's'], d: [86400, 's'], wk: [604800, 's'], yr: [31557600, 's'], bar: [1e5, 'Pa'], t: [1000, 'kg'], ha: [1e4, 'm^2'], cal: [4.184, 'J'], eV: [1.602176634e-19, 'J'], mmHg: [133.322387415, 'Pa'], percent: [0.01, '1'] };
  const PREFIX = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
  function unitAtom(a, depth) {
    if (a === '1' || a === '') return { f: 1, d: [0, 0, 0, 0, 0, 0, 0] };
    if (BASE[a]) return { f: a === 'g' ? 1e-3 : 1, d: BASE[a].slice() };
    if (DERIVED[a]) { const u = dim(DERIVED[a][1], depth + 1); return u.ok ? { f: u.f * DERIVED[a][0], d: u.d } : null; }
    for (const p of Object.keys(PREFIX).sort((x, y) => y.length - x.length)) if (a.startsWith(p) && a.length > p.length) { const rest = a.slice(p.length); const u = unitAtom(rest, depth); if (u && (BASE[rest] || DERIVED[rest])) return { f: u.f * PREFIX[p], d: u.d }; }
    return null;
  }
  /** dim(unit) → {ok, f (factor to SI), d (exponents of m, kg, s, A, K, mol, cd)}: "kg*m/s^2", "mmol/L", "1/min", "km/h" */
  function dim(u, depth) {
    if (typeof u !== 'string' || (depth || 0) > 6) return { ok: false, f: NaN, d: [] };
    const s = u.replace(/\s+/g, ''); if (s === '' || s === '1') return { ok: true, f: 1, d: [0, 0, 0, 0, 0, 0, 0] };
    let f = 1; const d = [0, 0, 0, 0, 0, 0, 0];
    const parts = s.split('/'); if (parts.length > 2) return { ok: false, f: NaN, d: [] };
    for (let pi = 0; pi < parts.length; pi++) for (const tok of parts[pi].split('*')) {
      const m = /^([A-Za-zµ%]+|1)(\^(-?\d+))?$/.exec(tok === '%' ? 'percent' : tok); if (!m) return { ok: false, f: NaN, d: [] };
      const a = unitAtom(m[1], depth || 0); if (!a) return { ok: false, f: NaN, d: [] };
      const e = (m[3] ? +m[3] : 1) * (pi ? -1 : 1); f *= pow(a.f, e); for (let i = 0; i < 7; i++) d[i] += a.d[i] * e;
    }
    return { ok: true, f, d };
  }
  const sameDim = (a, b) => { const x = dim(a), y = dim(b); return x.ok && y.ok && x.d.every((v, i) => v === y.d[i]); };
  /** convert(v, from, to) → v in `to`; NaN when the dimensions differ (code it as 'units') */
  function convert(v, from, to) { const x = dim(from), y = dim(to); return x.ok && y.ok && x.d.every((q, i) => q === y.d[i]) ? v * x.f / y.f : NaN; }
  const TIME_UNITS = ['ms', 's', 'min', 'h', 'd', 'wk', 'yr'];

  /* ======================================================================================================================
     Delay equations, stochastic kinetics and SDEs
     ====================================================================================================================== */
  /** dde({f(t, y, lag, dy) (lag(i, τ index) → y_i(t − τ)), y0, history(t) → array, lags: [τ…], t0, tEnd, rtol, atol, samples,
      onSample, maxSteps}) — constant-lag delay equations by the method of steps on DOPRI5's dense output (Bellen & Zennaro 2003
      ch. 3; Shampine & Thompson 2001): h ≤ the smallest lag so every lagged value lies on a finished step (or the history); the
      steps are kept (≤ maxSteps) → {t, y, steps, stop, codes} */
  function dde(cfg) {
    const C = codes(['nan', 'budget', 'bad-config', 'step-underflow']);
    const lags = Array.isArray(cfg && cfg.lags) ? cfg.lags.filter(v => v > 0) : [];
    const y0 = cfg && cfg.y0 ? Array.from(cfg.y0) : [], n = y0.length, t0 = fin(cfg && cfg.t0) ? cfg.t0 : 0;
    if (!cfg || typeof cfg.f !== 'function' || !n || !lags.length || !fin(cfg.tEnd) || !(cfg.tEnd > t0)) { C.code('bad-config'); return { t: t0, y: y0, steps: 0, stop: 'bad-config', codes: C.list }; }
    const hist = typeof cfg.history === 'function' ? cfg.history : () => y0;
    const segs = [], tmp = new Float64Array(n);   // finished steps: {t0, t1, seg}
    const lagVal = (tq, i) => {
      if (tq <= t0) { const h = hist(tq); return h[i]; }
      let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].t1 < tq) lo = m + 1; else hi = m; }
      const sg = segs[lo]; if (!sg) return NaN; sg.seg(min(tq, sg.t1), tmp); return tmp[i];
    };
    let tCur = t0;
    const f = (t, y, dy) => cfg.f(t, y, (i, k) => lagVal(t - lags[k || 0], i), dy);
    const st = { steps: 0, rejected: 0, nfev: 0 };
    const o = { rtol: cfg.rtol > 0 ? cfg.rtol : 1e-6, atol: cfg.atol > 0 ? cfg.atol : 1e-9, hmax: min(...lags) };
    const S = dopri(n, f, o, st); const y = Float64Array.from(y0);
    S.reset(t0, y); const samples = cfg.samples || []; let si = 0;
    while (si < samples.length && samples[si] <= t0) { cfg.onSample && cfg.onSample(samples[si], y); si++; }
    const maxSteps = fin(cfg.maxSteps) ? min(cfg.maxSteps, MAX_STEPS) : MAX_STEPS;
    for (;;) {
      if (tCur >= cfg.tEnd) return { t: tCur, y: Array.from(y), steps: st.steps, stop: 'end', codes: C.list };
      if (st.steps >= maxSteps) { C.code('budget', tCur); return { t: tCur, y: Array.from(y), steps: st.steps, stop: 'budget', codes: C.list }; }
      const r = S.step(cfg.tEnd); if (r.fail) { C.code(r.fail === 'time' ? 'step-underflow' : r.fail, tCur); return { t: tCur, y: Array.from(y), steps: st.steps, stop: r.fail, codes: C.list }; }
      st.steps++; segs.push({ t0: r.t0, t1: r.t1, seg: r.seg });
      while (si < samples.length && samples[si] <= r.t1) { r.seg(samples[si], tmp); cfg.onSample && cfg.onSample(samples[si], Float64Array.from(tmp)); si++; }
      tCur = r.t1; y.set(r.y1);
      if (!y.every(fin)) { C.code('nan', tCur); return { t: tCur, y: Array.from(y), steps: st.steps, stop: 'nan', codes: C.list }; }
    }
  }
  /** dae({f(t, y, z, dy), g(t, y, z, res), y0, z0, …integrate's cfg}) — a semi-explicit index-1 DAE y' = f(t, y, z), 0 = g(t, y, z)
      in its state-space form (Hairer & Wanner, Solving ODEs II, 2nd ed. 1996, §VI.1): at every evaluation the algebraic z is
      solved from g = 0 by Newton (a finite-difference Jacobian, from the last z; ≤ 30 iterations, code 'dae-newton'), then y is
      integrated by integrate() — 'auto' switches to Rosenbrock when the reduced system is stiff. → integrate's result + {z} */
  function dae(cfg) {
    const ny = cfg && cfg.y0 ? cfg.y0.length : 0, nz = cfg && cfg.z0 ? cfg.z0.length : 0;
    if (!cfg || typeof cfg.f !== 'function' || typeof cfg.g !== 'function' || !ny || !nz) return { ...integrate(null), z: [] };
    const z = Float64Array.from(cfg.z0), res = new Float64Array(nz), res2 = new Float64Array(nz), Jz = new Float64Array(nz * nz), piv = new Int32Array(nz), dz = new Float64Array(nz);
    let newtonFail = false;
    const solveZ = (t, y) => {
      for (let it = 0; it < 30; it++) {
        cfg.g(t, y, z, res); let nr = 0; for (let i = 0; i < nz; i++) nr = max(nr, abs(res[i]));
        if (nr <= 1e-12 * (1 + max(...Array.from(z, abs)))) return true;
        for (let j = 0; j < nz; j++) { const zj = z[j], d = 1.4901161193847656e-8 * max(1, abs(zj)); z[j] = zj + d; cfg.g(t, y, z, res2); z[j] = zj; for (let i = 0; i < nz; i++) Jz[i * nz + j] = (res2[i] - res[i]) / d; }
        if (!luFactor(Jz, nz, piv)) return false;
        for (let i = 0; i < nz; i++) dz[i] = -res[i]; luSolve(Jz, nz, piv, dz); for (let i = 0; i < nz; i++) z[i] += dz[i];
      }
      cfg.g(t, y, z, res); let nr = 0; for (let i = 0; i < nz; i++) nr = max(nr, abs(res[i])); return nr <= 1e-8 * (1 + max(...Array.from(z, abs)));
    };
    const f = (t, y, dy) => { if (!solveZ(t, y)) { newtonFail = true; for (let i = 0; i < ny; i++) dy[i] = NaN; return; } cfg.f(t, y, z, dy); };
    const r = integrate({ ...cfg, f });
    if (newtonFail) r.codes.push({ code: 'dae-newton', level: 'error' });
    solveZ(r.t, Float64Array.from(r.y));
    return { ...r, z: Array.from(z) };
  }
  /** ssa({x0, nu: [[Δ per species] per reaction], propensity(x, a) (fills a), tEnd, r (a stream), maxEvents, onEvent(t, x, j)})
      — Gillespie's direct method (Gillespie 1977, J. Phys. Chem. 81:25): exact trajectories of the chemical master equation
      → {t, x, events, stop, codes} */
  function ssa(cfg) {
    const C = codes(['budget', 'bad-config', 'nan']);
    if (!cfg || !Array.isArray(cfg.x0) || !Array.isArray(cfg.nu) || typeof cfg.propensity !== 'function' || !fin(cfg.tEnd)) { C.code('bad-config'); return { t: 0, x: [], events: 0, stop: 'bad-config', codes: C.list }; }
    const x = cfg.x0.slice(), m = cfg.nu.length, a = new Float64Array(m), r = cfg.r || stream(1, 'ssa');
    let t = fin(cfg.t0) ? cfg.t0 : 0, ev = 0; const cap = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : MAX_EVENTS;
    for (;;) {
      cfg.propensity(x, a); let a0 = 0; for (let j = 0; j < m; j++) { if (!(a[j] >= 0)) { C.code('nan', t); return { t, x, events: ev, stop: 'nan', codes: C.list }; } a0 += a[j]; }
      if (a0 <= 0) return { t: cfg.tEnd, x, events: ev, stop: 'extinct', codes: C.list };
      const tau = -log(r()) / a0; if (t + tau > cfg.tEnd) return { t: cfg.tEnd, x, events: ev, stop: 'end', codes: C.list };
      if (ev >= cap) { C.code('budget', t); return { t, x, events: ev, stop: 'budget', codes: C.list }; }
      t += tau; const u = r() * a0; let c = 0, j = 0; for (; j < m - 1; j++) { c += a[j]; if (u < c) break; }
      const nu = cfg.nu[j]; for (let i = 0; i < x.length; i++) x[i] += nu[i] || 0; ev++;
      if (cfg.onEvent) cfg.onEvent(t, x, j);
    }
  }
  /** tauLeap({…ssa, tau}) — explicit τ-leaping (Gillespie 2001, J. Chem. Phys. 115:4): each reaction fires Poisson(a_j τ) times in
      a leap; a leap that would make a count negative is halved and retried (≤ 30 times), and when a0·τ < 10 the exact SSA step
      is taken instead (Cao, Gillespie & Petzold 2006, J. Chem. Phys. 124: the switch to SSA). → {t, x, leaps, stop, codes} */
  function tauLeap(cfg) {
    const C = codes(['budget', 'bad-config', 'nan']);
    if (!cfg || !Array.isArray(cfg.x0) || !Array.isArray(cfg.nu) || typeof cfg.propensity !== 'function' || !fin(cfg.tEnd) || !(cfg.tau > 0)) { C.code('bad-config'); return { t: 0, x: [], leaps: 0, stop: 'bad-config', codes: C.list }; }
    const x = cfg.x0.slice(), m = cfg.nu.length, a = new Float64Array(m), r = cfg.r || stream(1, 'tauleap'), k = new Array(m);
    let t = fin(cfg.t0) ? cfg.t0 : 0, leaps = 0; const cap = fin(cfg.maxEvents) ? min(cfg.maxEvents, MAX_EVENTS) : MAX_EVENTS;
    while (t < cfg.tEnd) {
      if (leaps >= cap) { C.code('budget', t); return { t, x, leaps, stop: 'budget', codes: C.list }; }
      cfg.propensity(x, a); let a0 = 0; for (let j = 0; j < m; j++) a0 += a[j] > 0 ? a[j] : 0;
      if (!fin(a0)) { C.code('nan', t); return { t, x, leaps, stop: 'nan', codes: C.list }; }
      if (a0 <= 0) return { t: cfg.tEnd, x, leaps, stop: 'extinct', codes: C.list };
      let tau = min(cfg.tau, cfg.tEnd - t);
      if (a0 * tau < 10) {   // too few firings for a leap: one exact SSA step
        const dt = -log(r()) / a0; if (t + dt > cfg.tEnd) { t = cfg.tEnd; break; }
        t += dt; const u = r() * a0; let c = 0, j = 0; for (; j < m - 1; j++) { c += a[j]; if (u < c) break; } for (let i = 0; i < x.length; i++) x[i] += cfg.nu[j][i] || 0; leaps++; continue;
      }
      let okLeap = false;
      for (let tries = 0; tries < 30 && !okLeap; tries++) {
        for (let j = 0; j < m; j++) k[j] = a[j] > 0 ? r.poisson(a[j] * tau) : 0;
        okLeap = true; for (let i = 0; i < x.length; i++) { let v = x[i]; for (let j = 0; j < m; j++) v += k[j] * (cfg.nu[j][i] || 0); if (v < 0) { okLeap = false; break; } }
        if (!okLeap) tau /= 2;
      }
      if (!okLeap) { C.code('negative', t); for (let j = 0; j < m; j++) k[j] = 0; }
      for (let i = 0; i < x.length; i++) for (let j = 0; j < m; j++) x[i] += k[j] * (cfg.nu[j][i] || 0);
      t += tau; leaps++;
    }
    return { t, x, leaps, stop: 'end', codes: C.list };
  }
  /** sde({drift(t, x, out), diffusion(t, x, out) (diagonal noise: one Wiener process per state), dsig?(t, x, out) (∂σ_i/∂x_i, for
      Milstein), x0, t0, tEnd, dt, method: 'em' | 'milstein', r, samples, onSample}) — Euler–Maruyama (strong order 0.5) and Milstein
      (strong order 1) for Itô SDEs with diagonal noise (Kloeden & Platen 1992 §10.2, §10.3; Higham 2001, SIAM Review 43:3)
      → {t, x, steps, codes} */
  function sde(cfg) {
    const C = codes(['nan', 'budget', 'bad-config']);
    if (!cfg || typeof cfg.drift !== 'function' || typeof cfg.diffusion !== 'function' || !Array.isArray(cfg.x0) || !(cfg.dt > 0) || !fin(cfg.tEnd)) { C.code('bad-config'); return { t: 0, x: [], steps: 0, codes: C.list }; }
    const n = cfg.x0.length, x = Float64Array.from(cfg.x0), mu = new Float64Array(n), sg = new Float64Array(n), ds = new Float64Array(n), r = cfg.r || stream(1, 'sde');
    const mil = cfg.method === 'milstein' && typeof cfg.dsig === 'function';
    let t = fin(cfg.t0) ? cfg.t0 : 0, steps = 0; const N = Math.ceil((cfg.tEnd - t) / cfg.dt - 1e-9);
    if (N > MAX_STEPS) { C.code('budget'); return { t, x: Array.from(x), steps, codes: C.list }; }
    const samples = cfg.samples || []; let si = 0;
    for (let k = 0; k < N; k++) {
      const h = min(cfg.dt, cfg.tEnd - t), sq = sqrt(h);
      while (si < samples.length && samples[si] <= t + 1e-12) { cfg.onSample && cfg.onSample(samples[si], x); si++; }
      cfg.drift(t, x, mu); cfg.diffusion(t, x, sg); if (mil) cfg.dsig(t, x, ds);
      for (let i = 0; i < n; i++) { const dW = sq * normInv(r()); x[i] += mu[i] * h + sg[i] * dW + (mil ? 0.5 * sg[i] * ds[i] * (dW * dW - h) : 0); }
      t += h; steps++;
      if (!x.every(fin)) { C.code('nan', t); break; }
    }
    while (si < samples.length && samples[si] <= t + 1e-12) { cfg.onSample && cfg.onSample(samples[si], x); si++; }
    return { t, x: Array.from(x), steps, codes: C.list };
  }

  /* ======================================================================================================================
     Arrival schedules: non-homogeneous Poisson processes by thinning (Lewis & Shedler 1979; Law §8.6.2)
     ====================================================================================================================== */
  /** nhpp(rate(t), rateMax, t0, tEnd, r, cap) → arrival times of a Poisson process with intensity rate(t) ≤ rateMax */
  function nhpp(rate, rmax, t0, tEnd, r, cap) {
    const out = []; if (!(rmax > 0)) return out; let t = t0; const mx = fin(cap) ? cap : MAX_EVENTS;
    for (let i = 0; i < 10 * mx && out.length < mx; i++) { t += -log(r()) / rmax; if (t > tEnd) break; if (r() * rmax <= rate(t)) out.push(t); }
    return out;
  }
  /** piecewise(points [[t, value]…], {period, step}) → v(t): a schedule (rates of a day, staffing) — steps (piecewise constant, the
      default) or linear between the points, repeated every `period` when given */
  function piecewise(pts, o) {
    const P = (pts || []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).sort((a, b) => a[0] - b[0]), lin = o && o.step === false, per = o && o.period > 0 ? o.period : 0;
    return t => { if (!P.length) return NaN; let tt = per ? t - floor(t / per) * per : t; if (tt < P[0][0]) return per ? P[P.length - 1][1] : P[0][1];
      let i = 0; while (i + 1 < P.length && P[i + 1][0] <= tt) i++; if (!lin || i + 1 >= P.length) return P[i][1];
      const [a, va] = P[i], [b, vb] = P[i + 1]; return va + (vb - va) * (tt - a) / (b - a); };
  }

  /* ======================================================================================================================
     Distributions with cdf and quantile: truncation and mixtures (Law §8.2, §8.3); input modelling: fitting and goodness of fit (Law ch. 6)
     ====================================================================================================================== */
  /** cdfOf(d) and quantileOf(d) for the kinds that have them in closed form (exp, uniform, tri, normal, lognormal, weibull; gamma's cdf) */
  function cdfOf(d) {
    const D = dist(d); if (!D.ok) return null;
    switch (d.dist) {
      case 'exp': return x => (x <= 0 ? 0 : 1 - exp(-x / D.mean));
      case 'uniform': return x => (x <= d.min ? 0 : x >= d.max ? 1 : (x - d.min) / (d.max - d.min));
      case 'tri': return x => { const a = d.min, c = d.mode, b = d.max; return x <= a ? 0 : x >= b ? 1 : x <= c ? (x - a) * (x - a) / ((b - a) * (c - a)) : 1 - (b - x) * (b - x) / ((b - a) * (b - c)); };
      case 'normal': return x => normCdf((x - d.mean) / d.sd);
      case 'lognormal': { const s2 = log(1 + d.sd * d.sd / (d.mean * d.mean)), mu = log(d.mean) - s2 / 2, s = sqrt(s2); return x => (x <= 0 ? 0 : normCdf((log(x) - mu) / s)); }
      case 'weibull': return x => (x <= 0 ? 0 : 1 - exp(-pow(x / d.scale, d.shape)));
      case 'gamma': case 'erlang': { const k = d.dist === 'erlang' ? d.k : D.mean * D.mean / D.var, th = D.var / D.mean; return x => (x <= 0 ? 0 : gammaP(k, x / th)); }
      default: return null;
    }
  }
  function quantileOf(d) {
    const D = dist(d); if (!D.ok) return null;
    switch (d.dist) {
      case 'exp': return u => -D.mean * log(1 - u);
      case 'uniform': return u => d.min + u * (d.max - d.min);
      case 'tri': return u => { const a = d.min, c = d.mode, b = d.max, F = (c - a) / (b - a); return u < F ? a + sqrt(u * (b - a) * (c - a)) : b - sqrt((1 - u) * (b - a) * (b - c)); };
      case 'normal': return u => d.mean + d.sd * normInv(u);
      case 'lognormal': { const s2 = log(1 + d.sd * d.sd / (d.mean * d.mean)), mu = log(d.mean) - s2 / 2, s = sqrt(s2); return u => exp(mu + s * normInv(u)); }
      case 'weibull': return u => d.scale * pow(-log(1 - u), 1 / d.shape);
      default: return null;
    }
  }
  /** truncated(d, lo, hi) → {ok, draw(r), mean (estimated), exact}: by inversion on [F(lo), F(hi)] where the quantile is known
      (one uniform, CRN-friendly: Law §8.2.1), else by rejection (≤ 1000 tries, then the nearer bound and the code 'truncation') */
  function truncated(d, lo, hi) {
    const D = dist(d), a = fin(lo) ? lo : -Infinity, b = fin(hi) ? hi : Infinity; if (!D.ok || !(b > a)) return { ok: false, draw: () => NaN, exact: false };
    const F = cdfOf(d), Q = quantileOf(d);
    if (F && Q) { const Fa = a === -Infinity ? 0 : F(a), Fb = b === Infinity ? 1 : F(b); if (!(Fb > Fa)) return { ok: false, draw: () => NaN, exact: true };
      return { ok: true, exact: true, draw: r => min(b, max(a, Q(Fa + (Fb - Fa) * r()))) }; }
    return { ok: true, exact: false, draw: r => { for (let i = 0; i < 1000; i++) { const x = D.draw(r); if (x >= a && x <= b) return x; } return fin(b) ? b : a; } };
  }
  /** mixture([{d, w}…]) → {ok, draw(r), mean, var}: a finite mixture (Law §8.2.3, composition) */
  function mixture(parts) {
    const P = (parts || []).map(p => ({ D: dist(p.d), w: p.w > 0 ? p.w : 0 })).filter(p => p.D.ok && p.w > 0), W = P.reduce((s, p) => s + p.w, 0);
    if (!P.length || !(W > 0)) return { ok: false, draw: () => NaN, mean: NaN, var: NaN };
    const mean = P.reduce((s, p) => s + p.w / W * p.D.mean, 0), m2 = P.reduce((s, p) => s + p.w / W * (p.D.var + p.D.mean * p.D.mean), 0);
    const ws = P.map(p => p.w); return { ok: true, mean, var: m2 - mean * mean, draw: r => P[r.discrete(ws)].D.draw(r) };
  }
  function digamma(x) { let r = 0; while (x < 12) { r -= 1 / x; x += 1; } const f = 1 / (x * x); return r + log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132)))); }
  function trigamma(x) { let r = 0; while (x < 12) { r += 1 / (x * x); x += 1; } const f = 1 / (x * x); return r + 1 / x + f / 2 + f / x * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30))); }
  /** fit(data, kind) → a distribution object {dist, …} fitted by maximum likelihood (exp, normal, lognormal, gamma by Newton on
      ψ(k) − ln k = mean(ln x) − ln x̄ (Choi & Wette 1969), weibull by Newton on the profile equation (Law §6.5)), or by moments
      (uniform, tri by min/max/mode-from-mean, erlang, beta on [0, 1]); null when it cannot be fitted */
  function fit(data, kind) {
    const x = (data || []).filter(fin); const n = x.length; if (n < 2) return null;
    let m = 0; for (const v of x) m += v; m /= n; let v2 = 0; for (const v of x) v2 += (v - m) * (v - m); const vmle = v2 / n, sd = sqrt(v2 / (n - 1));
    const pos = x.every(v => v > 0);
    switch (kind) {
      case 'exp': return pos ? { dist: 'exp', mean: m } : null;
      case 'normal': return { dist: 'normal', mean: m, sd: sqrt(vmle) };
      case 'lognormal': { if (!pos) return null; let ml = 0; for (const v of x) ml += log(v); ml /= n; let s2 = 0; for (const v of x) s2 += (log(v) - ml) ** 2; s2 /= n;
        const mean = exp(ml + s2 / 2); return { dist: 'lognormal', mean, sd: mean * sqrt(exp(s2) - 1) }; }
      case 'gamma': { if (!pos) return null; let ml = 0; for (const v of x) ml += log(v); ml /= n; const s = log(m) - ml; if (!(s > 0)) return null;
        let k = (3 - s + sqrt((s - 3) * (s - 3) + 24 * s)) / (12 * s);   // Minka 2002's start
        for (let i = 0; i < 50; i++) { const g = log(k) - digamma(k) - s, dg = 1 / k - trigamma(k), kn = k - g / dg; if (!(kn > 0)) break; if (abs(kn - k) < 1e-12 * k) { k = kn; break; } k = kn; }
        return { dist: 'gamma', shape: k, scale: m / k }; }
      case 'weibull': { if (!pos) return null; const lx = x.map(v => log(v)); let ml = 0; for (const v of lx) ml += v; ml /= n;
        let k = 1.2 / (sd / m || 1);
        for (let i = 0; i < 100; i++) { let A = 0, B = 0, Cc = 0; for (let j = 0; j < n; j++) { const p = pow(x[j], k); A += p; B += p * lx[j]; Cc += p * lx[j] * lx[j]; }
          const g = B / A - 1 / k - ml, dg = (Cc / A - (B / A) * (B / A)) + 1 / (k * k), kn = k - g / dg; if (!(kn > 0)) { k = k / 2; continue; } if (abs(kn - k) < 1e-12 * k) { k = kn; break; } k = kn; }
        let A = 0; for (const v of x) A += pow(v, k); return { dist: 'weibull', shape: k, scale: pow(A / n, 1 / k) }; }
      case 'uniform': { let lo = Infinity, hi = -Infinity; for (const v of x) { lo = min(lo, v); hi = max(hi, v); } const w = (hi - lo) / (n - 1); return { dist: 'uniform', min: max(0, lo - w), max: hi + w }; }   // the unbiased ends
      case 'tri': { let lo = Infinity, hi = -Infinity; for (const v of x) { lo = min(lo, v); hi = max(hi, v); } const c = min(hi, max(lo, 3 * m - lo - hi)); return { dist: 'tri', min: lo, mode: c, max: hi }; }
      case 'erlang': { const k = max(1, min(64, Math.round(m * m / (v2 / (n - 1))))); return { dist: 'erlang', k, mean: m }; }
      case 'beta': { if (!x.every(v => v > 0 && v < 1)) return null; const vv = v2 / (n - 1), c = m * (1 - m) / vv - 1; return c > 0 ? { dist: 'beta', a: m * c, b: (1 - m) * c } : null; }
      default: return null;
    }
  }
  /** ksTest(data, d) → {D, p}: Kolmogorov–Smirnov with the asymptotic Kolmogorov distribution and Stephens' (1970) small-sample
      correction √n + 0.12 + 0.11/√n (all parameters known; with fitted ones p is conservative: Law §6.6.2) */
  function ksTest(data, d) {
    const F = cdfOf(d), x = (data || []).filter(fin).sort((a, b) => a - b), n = x.length; if (!F || !n) return { D: NaN, p: NaN };
    let D = 0; for (let i = 0; i < n; i++) { const f = F(x[i]); D = max(D, (i + 1) / n - f, f - i / n); }
    const lam = (sqrt(n) + 0.12 + 0.11 / sqrt(n)) * D; let p = 0; for (let j = 1; j <= 100; j++) p += 2 * ((j % 2) ? 1 : -1) * exp(-2 * j * j * lam * lam);
    return { D, p: min(1, max(0, lam < 0.2 ? 1 : p)) };
  }
  /** chiSquare(observed, expected, fitted = 0) → {X2, df, p}: Pearson's test, df = k − 1 − fitted (Law §6.6.2) */
  function chiSquare(O, Ex, fitted) {
    let X2 = 0, k = 0; for (let i = 0; i < O.length; i++) if (Ex[i] > 0) { X2 += (O[i] - Ex[i]) ** 2 / Ex[i]; k++; }
    const df = k - 1 - (fitted || 0); return { X2, df, p: df > 0 ? 1 - gammaP(df / 2, X2 / 2) : NaN };
  }
  /** andersonDarling(data, d) → {A2}: the Anderson–Darling statistic (Anderson & Darling 1954), tail-sensitive */
  function andersonDarling(data, d) {
    const F = cdfOf(d), x = (data || []).filter(fin).sort((a, b) => a - b), n = x.length; if (!F || !n) return { A2: NaN };
    let s = 0; for (let i = 0; i < n; i++) { const a = min(1 - 1e-15, max(1e-15, F(x[i]))), b = min(1 - 1e-15, max(1e-15, F(x[n - 1 - i]))); s += (2 * i + 1) * (log(a) + log(1 - b)); }
    return { A2: -n - s / n };
  }

  /* ======================================================================================================================
     Variance reduction and sequential precision (Law ch. 9, 11)
     ====================================================================================================================== */
  /** controlVariate(y, x, muX, level) → ci of Y adjusted by a control X with a known mean: Y − b(X − μX), b = cov(X, Y)/var(X)
      (Law §11.4; Lavenberg & Welch 1981); also b and the variance ratio vr (< 1 = a gain) */
  function controlVariate(y, x, muX, level) {
    const n = min(y.length, x.length); if (n < 3) return { ...ci([], level), b: NaN, vr: NaN };
    let my = 0, mx = 0; for (let i = 0; i < n; i++) { my += y[i]; mx += x[i]; } my /= n; mx /= n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const b = sxx > 0 ? sxy / sxx : 0, adj = []; for (let i = 0; i < n; i++) adj.push(y[i] - b * (x[i] - muX));
    const c = ci(adj, level), c0 = ci(y.slice(0, n), level); const r = ci(adj, level);
    // one more degree of freedom is used by b: t with n − 2 (Law §11.4)
    const half = n > 2 ? tq(1 - (1 - (level || 0.95)) / 2, n - 2) * r.sd * sqrt((n - 1) / (n - 2)) / sqrt(n) : NaN;
    return { ...c, half, lo: c.mean - half, hi: c.mean + half, b, vr: c0.sd > 0 ? (r.sd * r.sd) / (c0.sd * c0.sd) : NaN };
  }
  /** untilPrecision(fn(i) → number, {gamma (relative error, 0.05), n0 (10), nMax (1000), level}) — the sequential procedure of Law
      §9.4.1: replications are added until half/|mean| ≤ γ/(1 + γ) → ci + {reached, values} */
  function untilPrecision(fn, o) {
    const g = o && o.gamma > 0 ? o.gamma : 0.05, n0 = max(2, (o && o.n0) || 10), nMax = min(10000, (o && o.nMax) || 1000), lv = o && o.level, vals = [];
    for (let i = 0; i < nMax; i++) { let v; try { v = fn(i); } catch (e) { v = NaN; } vals.push(v);
      if (vals.length >= n0) { const c = ci(vals, lv); if (abs(c.mean) > 0 && c.half / abs(c.mean) <= g / (1 + g)) return { ...c, reached: true, values: vals }; } }
    return { ...ci(vals, lv), reached: false, values: vals };
  }
  /** lhs(n, k, r) → n points of a Latin hypercube in [0, 1)^k (McKay, Beckman & Conover 1979): one point in each of n strata per axis */
  function lhs(n, k, r) {
    const rs = r || stream(1, 'lhs'), pts = Array.from({ length: n }, () => new Array(k));
    for (let j = 0; j < k; j++) { const perm = rs.shuffle(Array.from({ length: n }, (_, i) => i)); for (let i = 0; i < n; i++) pts[i][j] = (perm[i] + rs()) / n; }
    return pts;
  }

  /* ======================================================================================================================
     Calibration and optimisation hooks
     ====================================================================================================================== */
  /** minimize(fn(x) → number, x0, {step, lo, hi, maxEval (≤ 20 000), tol}) — Nelder & Mead 1965 with the standard coefficients
      (Lagarias et al. 1998), bounds by clamping; NaN values count as +∞ → {x, f, evals, converged} */
  function minimize(fn, x0, o) {
    const k = x0.length, lo = (o && o.lo) || [], hi = (o && o.hi) || [], cap = min(20000, (o && o.maxEval) || 2000), tol = (o && o.tol) || 1e-10;
    const clampV = x => x.map((v, i) => min(fin(hi[i]) ? hi[i] : Infinity, max(fin(lo[i]) ? lo[i] : -Infinity, v)));
    let evals = 0; const F = x => { evals++; const v = safe(fn, x); return Number.isNaN(v) ? Infinity : v; };
    const stp = (o && o.step) || x0.map(v => (v !== 0 ? 0.1 * abs(v) : 0.1));
    let S = [clampV(x0.slice())]; for (let i = 0; i < k; i++) { const x = x0.slice(); x[i] += Array.isArray(stp) ? stp[i] : stp; S.push(clampV(x)); }
    let fv = S.map(F);
    while (evals < cap) {
      const idx = S.map((_, i) => i).sort((a, b) => fv[a] - fv[b]); S = idx.map(i => S[i]); fv = idx.map(i => fv[i]);
      if (abs(fv[k] - fv[0]) <= tol * (abs(fv[0]) + tol) && S.every(x => x.every((v, i) => abs(v - S[0][i]) <= 1e-9 * max(1, abs(S[0][i]))))) return { x: S[0], f: fv[0], evals, converged: true };
      const c = new Array(k).fill(0); for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) c[i] += S[j][i] / k;
      const at = s => clampV(c.map((v, i) => v + s * (S[k][i] - v)));
      const xr = at(-1), fr = F(xr);
      if (fr < fv[0]) { const xe = at(-2), fe = F(xe); if (fe < fr) { S[k] = xe; fv[k] = fe; } else { S[k] = xr; fv[k] = fr; } }
      else if (fr < fv[k - 1]) { S[k] = xr; fv[k] = fr; }
      else { const xc = fr < fv[k] ? at(-0.5) : at(0.5), fc = F(xc);
        if (fc < min(fr, fv[k])) { S[k] = xc; fv[k] = fc; }
        else for (let j = 1; j <= k; j++) { S[j] = clampV(S[j].map((v, i) => S[0][i] + 0.5 * (v - S[0][i]))); fv[j] = F(S[j]); } }
    }
    let b = 0; for (let j = 1; j <= k; j++) if (fv[j] < fv[b]) b = j; return { x: S[b], f: fv[b], evals, converged: false };
  }
  /** calibrate(model(params) → predictions, data, p0, opts) — least squares Σ(w(pred − obs))² by minimize → {x, sse, rmse, evals, converged} */
  function calibrate(model, data, p0, o) {
    const w = (o && o.weights) || null;
    const sse = p => { const pr = model(p); if (!Array.isArray(pr) || pr.length !== data.length) return NaN; let s = 0; for (let i = 0; i < data.length; i++) { const e = (pr[i] - data[i]) * (w ? w[i] : 1); s += e * e; } return s; };
    const r = minimize(sse, p0, o); return { x: r.x, sse: r.f, rmse: sqrt(r.f / max(1, data.length)), evals: r.evals, converged: r.converged };
  }

  /* ======================================================================================================================
     For engine authors: the shared event record, the stepper interface and its adapters (docs/library/simkit.md §8)
     ====================================================================================================================== */
  let evSeq = 0;
  /** event(t, source, kind, data, prio) → the event record every engine and the orchestrator exchange:
      {t (model time), source (the part / engine id that raised it), kind (a short code: 'arrive', 'threshold', 'dose' …), data (plain
      numbers / strings / arrays), prio (ties at the same t: smaller first), seq (creation order: the last tie-break)} */
  function event(t, source, kind, data, prio) {
    return { t: typeof t === 'number' ? t : NaN, source: source == null ? '' : String(source), kind: kind == null ? '' : String(kind), data: data === undefined ? null : data, prio: fin(prio) ? prio : 0, seq: evSeq++ };
  }
  const evLess = (a, b) => a.t - b.t || a.prio - b.prio || a.seq - b.seq;
  /** clone(v): a deep copy of plain data (objects, arrays, typed arrays, Maps, Sets); functions are kept by reference */
  function clone(v, depth) {
    if ((depth || 0) > 64 || v === null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map(x => clone(x, (depth || 0) + 1));
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, clone(x, (depth || 0) + 1)]));
    if (v instanceof Set) return new Set([...v].map(x => clone(x, (depth || 0) + 1)));
    const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k], (depth || 0) + 1); return o;
  }
  /** stepper(def) → the checked stepper interface of a part (what cosim and the parts orchestrator drive):
        id · init(model, inputs, ctx) → state · step(state, inputs, t, dt, ctx) → {state, out, dt (taken ≤ asked: an early stop at
        a state event), events: [event records]} (the same argument order as makeEngine's optional `stepper` of the parts orchestrator) · snapshot(state) → a copy · restore(snap) → state · output(state) → out (optional) ·
        onEvent(state, ev, t) → state (optional: an event from another part)
      The wrapper never throws: a failing step returns {state, out: {}, dt: 0, events: [], fail: 'part-failed'}; events are normalised
      to event records with source = id; snapshot/restore default to clone (so a state must be plain data: no closures, or give your
      own snapshot/restore, or set snapshot: null to say the part cannot be iterated). */
  function stepper(def) {
    if (!def || typeof def.step !== 'function') return null;
    const id = def.id == null ? 'part' : String(def.id);
    const norm = (evs, t) => (Array.isArray(evs) ? evs : []).filter(isObj).map(e => (e.seq != null && e.source != null && 'kind' in e ? e : event(fin(e.t) ? e.t : t, id, e.kind != null ? e.kind : e.name, e.data, e.prio))).map(e => (e.to ? e : Array.isArray(e.to) ? e : e));
    const S = {
      id, kind: 'stepper',
      init(model, inputs, ctx) { try { return def.init ? def.init(model, inputs, ctx) : {}; } catch (e) { return null; } },
      step(state, inputs, t, dt, ctx) {
        let r; try { r = def.step(state, inputs || {}, t, dt, ctx); } catch (e) { r = null; }
        if (!isObj(r)) return { state, out: {}, dt: 0, events: [], fail: 'part-failed' };
        const taken = fin(r.dt) ? min(max(r.dt, 0), dt) : dt;
        return { state: r.state === undefined ? state : r.state, out: isObj(r.out) ? r.out : {}, dt: taken, events: norm(r.events, (fin(t) ? t : 0) + taken), ...(r.fail ? { fail: r.fail } : {}) };
      },
      snapshot: def.snapshot === null ? null : (state => { try { return def.snapshot ? def.snapshot(state) : clone(state); } catch (e) { return null; } }),
      restore: def.restore === null ? null : (snap => { try { return def.restore ? def.restore(snap) : clone(snap); } catch (e) { return null; } }),
      output: def.output ? (state => { try { return def.output(state) || {}; } catch (e) { return {}; } }) : null,
      onEvent: def.onEvent ? ((state, ev, t) => { try { const r = def.onEvent(state, ev, t); return r === undefined ? state : r; } catch (e) { return state; } }) : null,
    };
    return S;
  }
  /** odeStepper(def) — an adapter for an engine whose model is x' = f(t, x, inputs): it integrates with integrate() over each macro
      step, stops early at a terminal state event and reports every event as a record.
      def = {id, n, y0(model, inputs) → array, f(t, y, dy, inputs), method, rtol, atol, dt, hmax, pairs,
             events: [{kind, g(t, y, inputs), dir, hyst, terminal, apply(t, y, inputs) (a jump, in place)}], out(t, y, inputs) → {}}
      state = {t, y: [...], steps} (plain data: snapshot/restore work) */
  function odeStepper(def) {
    if (!def || typeof def.f !== 'function') return null;
    return stepper({ id: def.id,
      init(model, inputs) { const y = def.y0 ? Array.from(def.y0(model, inputs) || []) : []; return { t: fin(def.t0) ? def.t0 : 0, y, steps: 0 }; },
      output: st => (def.out ? def.out(st.t, st.y, {}) : {}),
      step(st, inputs, t, dt) {
        const t0 = fin(t) ? t : st.t;
        const evs = (def.events || []).map(e => ({ g: (t, y) => e.g(t, y, inputs), dir: e.dir, hyst: e.hyst, terminal: !!e.terminal, kind: e.kind,
          onEvent: (t, y) => { if (e.apply) e.apply(t, y, inputs); } }));
        const r = integrate({ f: (t, y, dy) => def.f(t, y, dy, inputs), y0: st.y, t0, tEnd: t0 + dt, method: def.method, rtol: def.rtol, atol: def.atol, dt: def.dt, hmax: def.hmax, pairs: def.pairs, events: evs, maxSteps: def.maxSteps });
        const ns = { t: r.t, y: r.y, steps: st.steps + r.steps };
        const out = def.out ? def.out(r.t, r.y, inputs) : {};
        const fatal = r.codes.find(c => c.level === 'error');
        return { state: ns, out, dt: r.t - t0, events: r.events.map(h => event(h.t, def.id, h.kind || ('event' + h.j), { dir: h.dir })), ...(fatal ? { fail: fatal.code } : {}) };
      } });
  }
  /** wrapRun(id, run(inputs, t) → out) — an adapter for an engine with no time of its own (a formula, a chain part): each step
      recomputes its outputs from the latest inputs at the step's end time */
  function wrapRun(id, run) {
    return stepper({ id, init: () => ({ t: 0 }), step(st, inputs, t, dt) { const t1 = (fin(t) ? t : st.t) + dt; return { state: { t: t1 }, out: run(inputs, t1) || {}, dt }; } });
  }

  /* ======================================================================================================================
     Co-simulation master (the parts orchestrator's cosim mode). Rollback-free by default (no part is ever asked to go back in time):
       • each part has its own local time; the master always steps the parts that are furthest behind (the global time), in the
         declared order (Gauss–Seidel: a later part sees the outputs the earlier ones produced in the same macro step);
       • a macro step ends at min(t + dt, tEnd, the next event addressed to the part);
       • a part may stop early (it returns dt taken < dt asked: a state event inside the step) — the macro step then ends at that
         time for every part still to step in this round, so they meet the event at its time; parts already ahead wait;
       • events a part emits (event records, with an optional `to: [part ids]`) go to the other parts: delivered by onEvent(state, ev)
         at the start of the target's next step that reaches ev.t; a target already past ev.t gets it at once and the master records
         the lateness (code 'late-event', info: the largest lag) — list the event-producing parts first to avoid it;
       • iterate: {maxIter ≤ 50, tol} (optional, strong coupling): while every part is at the same time, a macro step is repeated
         from the parts' snapshots until the exchanged scalar outputs change by ≤ tol (relative), else code 'no-converge' (the last
         iterate is kept). Parts without snapshot/restore make it fall back to one pass (code 'no-snapshot').
     cosim({tEnd, dt, t0, parts: [stepper or {id, init, step, inputs?(outs, t), onEvent?}], link?: {partId: (outs, t) → inputs},
            order?, maxMacro, iterate, model, inputs0})
       → {t, outs, trace: [{t, part, out}], events: [records], codes, macro, iterations}
     (DEVS view: each part is an atomic model whose time advance is the macro step; Zeigler et al. 2018 ch. 6 and ch. 18; FMI 2.0
     co-simulation master algorithms: Gomes et al. 2018, ACM Comput. Surv. 51:3) */
  function cosim(cfg) {
    const C = codes(['budget', 'no-progress', 'bad-config', 'part-failed']);
    const res = { t: 0, outs: {}, trace: [], events: [], codes: C.list, macro: 0, iterations: 0 };
    if (!cfg || !Array.isArray(cfg.parts) || !cfg.parts.length || !(cfg.dt > 0) || !fin(cfg.tEnd)) { C.code('bad-config'); return res; }
    const t0 = fin(cfg.t0) ? cfg.t0 : 0, tEnd = cfg.tEnd, dt = cfg.dt, eps = 1e-12 * max(1, abs(tEnd));
    const parts = cfg.parts.filter(p => p && typeof p.step === 'function');
    const byId = new Map(parts.map(p => [p.id, p]));
    const ord0 = Array.isArray(cfg.order) ? cfg.order.filter(id => byId.has(id)) : [];
    const order = ord0.concat(parts.map(p => p.id).filter(id => !ord0.includes(id)));
    const P = order.map(id => { const p = byId.get(id); let st = null; try { st = p.init ? p.init(cfg.model, cfg.inputs0 || {}, { id }) : null; } catch (e) { C.code('part-failed', t0, id); } return { p, id, t: t0, state: st, inbox: [] }; });
    const outs = res.outs; for (const q of P) { let o0 = {}; try { o0 = q.p.output ? q.p.output(q.state) || {} : {}; } catch (e) { o0 = {}; } outs[q.id] = o0; }
    const maxMacro = min(fin(cfg.maxMacro) ? cfg.maxMacro : MAX_STEPS, MAX_STEPS);
    const inputsOf = q => { try { const fn = q.p.inputs || (cfg.link && cfg.link[q.id]); return fn ? fn(outs, q.t) || {} : {}; } catch (e) { return {}; } };
    const it0 = isObj(cfg.iterate) ? { maxIter: min(50, max(1, floor(cfg.iterate.maxIter) || 10)), tol: cfg.iterate.tol > 0 ? cfg.iterate.tol : 1e-6 } : null;
    const canIter = it0 && P.every(q => q.p.snapshot && q.p.restore);
    if (it0 && !canIter) C.code('no-snapshot');
    let lag = 0;
    const deliver = (q, e) => { if (q.t > e.t + eps) { lag = max(lag, q.t - e.t); q.inbox.push({ ...e, t: q.t, late: true }); } else q.inbox.push(e); };
    const outDiff = (a, b) => { let d = 0; for (const id of Object.keys(a)) for (const k of Object.keys(a[id] || {})) { const x = a[id][k], y = b[id] && b[id][k]; if (typeof x === 'number' && typeof y === 'number') { const s = max(1e-12, abs(x), abs(y)); d = max(d, x === y ? 0 : abs(x - y) / s); } } return d; };
    // one round: every part behind steps once; → false on a failure
    function round(tg, target) {
      const emitted = [];
      for (const q of P) {
        if (q.t > tg + eps) continue;   // ahead: waits for the others
        q.inbox.sort(evLess);
        while (q.inbox.length && q.inbox[0].t <= q.t + eps) { const ev = q.inbox.shift(); if (q.p.onEvent) { try { const s2 = q.p.onEvent(q.state, ev, q.t); if (s2 !== undefined) q.state = s2; } catch (e) { C.code('part-failed', q.t, q.id); } } }
        let T = target; if (q.inbox.length) T = min(T, q.inbox[0].t);
        const ask = T - q.t; if (!(ask > eps)) continue;
        let r = null; try { r = q.p.step(q.state, inputsOf(q), q.t, ask, { id: q.id }); } catch (e) { r = null; }
        if (!isObj(r) || r.fail === 'part-failed') { C.code('part-failed', q.t, q.id); res.t = q.t; return false; }
        if (r.fail) C.code(r.fail, q.t, q.id);
        let taken = fin(r.dt) ? r.dt : ask; if (taken > ask) taken = ask;
        if (!(taken > 0)) { C.code('no-progress', q.t, q.id); res.t = q.t; return false; }
        if (r.state !== undefined) q.state = r.state;
        q.t = taken >= ask - eps ? T : q.t + taken; outs[q.id] = isObj(r.out) ? r.out : {};
        for (const ev of Array.isArray(r.events) ? r.events : []) {
          if (!isObj(ev) || !fin(ev.t)) continue;
          const e = ev.seq != null && ev.source ? ev : event(ev.t, q.id, ev.kind != null ? ev.kind : ev.name, ev.data, ev.prio);
          if (ev.to) e.to = ev.to;
          emitted.push([q, e]);
          for (const o2 of P) if (o2 !== q && (!Array.isArray(ev.to) || ev.to.includes(o2.id))) deliver(o2, e);
        }
        if (taken < ask - eps) target = min(target, q.t);   // a state event stopped this part: the others stop there too
      }
      return emitted;
    }
    for (let it = 0; it < maxMacro; it++) {
      let tg = Infinity; for (const q of P) tg = min(tg, q.t);
      if (tg >= tEnd - eps) { res.t = tEnd; if (lag > 0) C.code('late-event', undefined, lag); return res; }
      const target = min(tEnd, tg + dt);
      res.macro++;
      const sync = P.every(q => abs(q.t - tg) <= eps);
      let emitted;
      if (canIter && sync) {   // strong coupling: repeat the round from the snapshots until the exchanged outputs settle
        const snaps = P.map(q => ({ s: q.p.snapshot(q.state), t: q.t, inbox: q.inbox.slice() })); let prev = clone(outs), conv = false;
        for (let k = 0; k < it0.maxIter; k++) {
          res.iterations++;
          if (k > 0) P.forEach((q, i) => { q.state = q.p.restore(snaps[i].s); q.t = snaps[i].t; q.inbox = snaps[i].inbox.slice(); });
          emitted = round(tg, target); if (emitted === false) return res;
          const d = outDiff(outs, prev); prev = clone(outs);
          if (k > 0 && d <= it0.tol) { conv = true; break; }
        }
        if (!conv && it0.maxIter > 1) C.code('no-converge', tg);
      } else { emitted = round(tg, target); if (emitted === false) return res; }
      for (const [q, e] of emitted) { if (res.events.length < MAX_LOG) res.events.push(e); }
      for (const q of P) if (res.trace.length < MAX_POINTS * 4) res.trace.push({ t: q.t, part: q.id, out: outs[q.id] });
    }
    C.code('budget', tEnd); res.t = min(...P.map(q => q.t)); return res;
  }

  /* ---------- the Worker source: '(…)(self);' like NoemaLibCore.source() ---------- */
  const source = () => '(' + noemaSimKitModule.toString() + ')(self);';

  root.NoemaSimKit = Object.freeze({
    version: 1, MAX_STEPS, MAX_EVENTS, MAX_LOG, DISTS: Object.freeze(DISTS.slice()), METHODS: Object.freeze(METHODS.slice()), TIME_UNITS: Object.freeze(TIME_UNITS.slice()),
    // randomness
    stream, subseed, dist, jumps, M1, M2,
    // events
    calendar, sim, codes, budget,
    // continuous time and roots
    integrate, locate, brent,
    // special functions
    lgamma, gammaP, betaI, normCdf, normInv, tCdf, tq,
    // output analysis
    welford, timeAvg, ci, acf, batchMeans, mser5, replicate, littleCheck,
    // sweeps and sensitivity
    linspace, oat, grid, morris, sobol, lhs,
    // delay equations, stochastic kinetics, SDEs, schedules
    dde, dae, ssa, tauLeap, sde, nhpp, piecewise,
    // distributions and input modelling
    cdfOf, quantileOf, truncated, mixture, fit, ksTest, chiSquare, andersonDarling, digamma, trigamma,
    // variance reduction, precision, calibration
    controlVariate, untilPrecision, minimize, calibrate,
    // verification
    richardson, conservation, deterministic, dim, sameDim, convert,
    // co-simulation
    event, clone, stepper, odeStepper, wrapRun, cosim, source,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
