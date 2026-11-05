/* ===================== ode@1 — dynamical systems: ODEs, delay equations and discrete maps (docs/library/ode.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md §1): any system x' = f(t, x) of ≤ 12 states written in NoemaExpr, a
   delay equation with constant lags, or a map x_{n+1} = g(n, x_n); or one of ~30 ready TEMPLATES (epidemics, pharmacokinetics,
   enzymes, populations, gene circuits, neurons, mechanics, chaos). It computes time series, events (crossings, doses, Poincaré
   sections), equilibria with their Jacobian eigenvalues, Lyapunov exponents, parameter sweeps (orbit diagrams), conserved
   quantities and phase portraits (a scene).
   Methods (sources in docs/library/ode.md):
     • Dormand & Prince 1980 5(4) with Hairer's dense output and PI step control (Hairer, Nørsett & Wanner, Solving ODEs I, 1993,
       §II.4–II.6, IV.2: the DOPRI5 code), its stiffness test (h·ρ > 3.25 fifteen times);
     • the L-stable Rosenbrock 2(3) method of Shampine & Reichelt 1997 (SIAM J. Sci. Comput. 18:1, MATLAB ode23s) for stiff systems,
       with a finite-difference Jacobian; `auto` switches to it when DOPRI5 finds the problem stiff;
     • fixed steps: Euler, Heun, midpoint, classical RK4; Störmer–Verlet and Yoshida 1990 4th order for separable Hamiltonian pairs;
     • delay equations by the method of steps on DOPRI5's dense output (Bellen & Zennaro 2003; Shampine & Thompson 2001), h ≤ τ;
     • events: sign changes located on the dense output by the Illinois method; timed events (doses) hit exactly;
     • equilibria: damped Newton from a grid; eigenvalues by balancing + Hessenberg + shifted QR (Numerical Recipes 2nd ed. §11.5–11.6);
     • Lyapunov exponents: Benettin, Galgani, Giorgilli & Strelcyn 1980 (variational equation, Gram–Schmidt every Δt).
   Pure, deterministic (the transcendental functions are NoemaExpr's fdlibm ports, never Math.*), bounded (≤ 200 000 steps in all).
   No learner text: numbers, codes and the model's own names only. Tests: node tests/lib_ode.js. */
(function noemaLibOdeModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this module
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'ode@1';
  const FX = root.NoemaExpr ? root.NoemaExpr.FUNCS : null;
  const exp = FX ? FX.exp.fn : Math.exp, log = FX ? FX.log.fn : Math.log, sin = FX ? FX.sin.fn : Math.sin, cos = FX ? FX.cos.fn : Math.cos;
  const sqrt = Math.sqrt, abs = Math.abs, EPS = 2.220446049250313e-16, PI = 3.141592653589793;
  const MAX_STEPS = 200000, DEF_STEPS = 50000, MAX_EVENTS = 2000;
  const METHODS = ['auto', 'dopri5', 'rosenbrock', 'rk4', 'heun', 'midpoint', 'euler', 'verlet', 'yoshida4'];
  const FIXED = ['rk4', 'heun', 'midpoint', 'euler', 'verlet', 'yoshida4'];
  /** runtime codes (docs/library/ode.md §5): the errors stop the run (its outputs NaN / cut), the others are notes */
  const CODES = ['nan', 'blow-up', 'step-underflow', 'budget', 'time', 'map-escape', 'zeno', 'stiff', 'stiff-switched', 'event-limit',
    'newton', 'non-hyperbolic', 'eigen', 'lyap-short', 'invariant-drift', 'period-not-found', 'template-quantity', 'degenerate-closed-form', 'stopped'];
  const FATAL = ['nan', 'blow-up', 'step-underflow', 'budget', 'time', 'map-escape', 'zeno'];

  /* ======================================================================================================================
     TEMPLATES — ready models. Each: kind, params {name: default}, states [[id, init]], aux [[id, expr]], rhs/next {state: expr},
     delays [[id, of, tau, history]], events [{id, when, dir} | {id, at, every?, count?, set?}], pairs [[q, p]], invariants
     [[id, expr]], quantities {name: (P, ctx) => number} (closed forms; NaN + template-quantity when they do not apply), src.
     Expressions are NoemaExpr over the template's params, states, aux and t (n for maps).
     ====================================================================================================================== */
  const nan = NaN;
  // Lambert W (principal branch) of x = exp(L), from its logarithm (no overflow): w + ln w = L, Newton (Corless et al. 1996)
  function lambertWlog(L) {
    if (!Number.isFinite(L)) return L > 0 ? Infinity : 0;
    let w = L > 1 ? L - log(L) : exp(L) / (1 + exp(L));
    if (L <= 1 && w <= 0) w = 1e-300;
    for (let i = 0; i < 60; i++) { const f = w + log(w) - L, d = 1 + 1 / w, s = f / d; let wn = w - s; if (wn <= 0) wn = w / 10; if (abs(wn - w) <= 1e-15 * abs(wn)) { w = wn; break; } w = wn; }
    return w;
  }
  // complete elliptic integral of the first kind K(k) by the arithmetic–geometric mean (DLMF 19.8.5)
  function ellipK(k) { if (!(abs(k) < 1)) return Infinity; let a = 1, b = sqrt(1 - k * k); for (let i = 0; i < 40 && abs(a - b) > 1e-16 * a; i++) { const an = (a + b) / 2; b = sqrt(a * b); a = an; } return PI / (2 * a); }
  // a root of g on [a, b] (g(a), g(b) of opposite signs) by Brent's method (Brent 1973, ch. 4)
  function brent(g, a, b, tol) {
    let fa = g(a), fb = g(b); if (!(fa * fb <= 0)) return NaN;
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
        if (2 * p < Math.min(3 * m * q - abs(tl * q), abs(e * q))) { e = d; d = p / q; } else { d = m; e = d; }
      } else { d = m; e = d; }
      a = b; fa = fb; b += abs(d) > tl ? d : (m > 0 ? tl : -tl); fb = g(b);
    }
    return b;
  }
  // SIR final size: s∞ = s0·exp(−R0·(1 − r0 − s∞)) (Kermack & McKendrick 1927; Keeling & Rohani 2008 §2.1.3), fractions of N
  function sirFinal(R0, s0, r0) {
    if (!(R0 > 0 && s0 >= 0)) return NaN;
    const g = s => s - s0 * exp(-R0 * (1 - r0 - s));
    let hi = s0;
    if (s0 * R0 > 1) { const sStar = (1 - r0) - log(s0 * R0) / R0; hi = Math.min(s0, Math.max(0, sStar)); if (g(hi) < 0) hi = s0; }
    const s = brent(g, 0, hi, 1e-16);
    return s;
  }
  const TEMPLATES = {
    // ---- epidemics (Kermack & McKendrick 1927; Anderson & May 1991; Keeling & Rohani 2008) ----
    sir: { kind: 'ode', src: 'Kermack & McKendrick 1927; Keeling & Rohani 2008 ch. 2',
      params: { beta: 0.3, gamma: 0.1, mu: 0, N: 1, I0: 1e-4, Rinit: 0 },
      states: [['S', 'N - I0 - Rinit'], ['I', 'I0'], ['R', 'Rinit']],
      rhs: { S: 'mu*N - beta*S*I/N - mu*S', I: 'beta*S*I/N - (gamma + mu)*I', R: 'gamma*I - mu*R' },
      invariants: [['total', 'S + I + R']], events: [{ id: 'peak', when: 'beta*S/N - gamma - mu', dir: -1 }],
      quantities: {
        R0: P => P.beta / (P.gamma + P.mu), herd: P => 1 - (P.gamma + P.mu) / P.beta,
        finalSize: P => { if (P.mu !== 0) return nan; const R0 = P.beta / P.gamma, s0 = (P.N - P.I0 - P.Rinit) / P.N, r0 = P.Rinit / P.N, s = sirFinal(R0, s0, r0); return 1 - r0 - s; },
        peakI: P => { if (P.mu !== 0) return nan; const R0 = P.beta / P.gamma, s0 = (P.N - P.I0 - P.Rinit) / P.N, i0 = P.I0 / P.N; return P.N * (R0 * s0 > 1 ? i0 + s0 - (1 + log(R0 * s0)) / R0 : i0); },
        Sstar: P => P.mu > 0 ? P.N * (P.gamma + P.mu) / P.beta : nan,
        Istar: P => { if (!(P.mu > 0)) return nan; const R0 = P.beta / (P.gamma + P.mu); return R0 > 1 ? P.mu * P.N * (R0 - 1) / P.beta : 0; },
        period: P => { if (!(P.mu > 0)) return nan; const R0 = P.beta / (P.gamma + P.mu); return R0 > 1 ? 2 * PI * sqrt(1 / (P.mu * (R0 - 1)) / (P.gamma + P.mu)) : nan; } } },
    seir: { kind: 'ode', src: 'Anderson & May 1991; Wallinga & Lipsitch 2007',
      params: { beta: 0.5, sigma: 0.2, gamma: 0.1, mu: 0, N: 1, E0: 0, I0: 1e-4 },
      states: [['S', 'N - E0 - I0'], ['E', 'E0'], ['I', 'I0'], ['R', '0']],
      rhs: { S: 'mu*N - beta*S*I/N - mu*S', E: 'beta*S*I/N - (sigma + mu)*E', I: 'sigma*E - (gamma + mu)*I', R: 'gamma*I - mu*R' },
      invariants: [['total', 'S + E + I + R']],
      quantities: {
        R0: P => P.beta * P.sigma / ((P.sigma + P.mu) * (P.gamma + P.mu)), herd: P => 1 - (P.sigma + P.mu) * (P.gamma + P.mu) / (P.beta * P.sigma),
        growth: P => { const a = P.sigma + P.mu, b = P.gamma + P.mu; return (-(a + b) + sqrt((a - b) * (a - b) + 4 * P.beta * P.sigma)) / 2; } } },
    sirs: { kind: 'ode', src: 'Keeling & Rohani 2008 §2.1.2',
      params: { beta: 0.3, gamma: 0.1, omega: 0.01, N: 1, I0: 1e-3 },
      states: [['S', 'N - I0'], ['I', 'I0'], ['R', '0']],
      rhs: { S: '-beta*S*I/N + omega*R', I: 'beta*S*I/N - gamma*I', R: 'gamma*I - omega*R' },
      invariants: [['total', 'S + I + R']],
      quantities: { R0: P => P.beta / P.gamma, Istar: P => { const R0 = P.beta / P.gamma; return R0 > 1 ? P.N * (1 - 1 / R0) / (1 + P.gamma / P.omega) : 0; } } },
    // ---- pharmacokinetics (Rowland & Tozer 2019; Gabrielsson & Weiner 2016) ----
    pk: { kind: 'ode', src: 'Bateman 1910; Rowland & Tozer, Clinical Pharmacokinetics and Pharmacodynamics, 5th ed. 2019',
      params: { dose: 100, V: 10, CL: 2, ka: 1, F: 1, tau: 12, doses: 1, rate: 0, Tinf: 0 },
      states: [['Ag', '0'], ['Ac', '0']], aux: [['C', 'Ac/V'], ['k', 'CL/V']],
      rhs: { Ag: '-ka*Ag', Ac: 'ka*Ag - k*Ac + (t < Tinf ? rate : 0)' },
      events: [{ id: 'dose', at: '0', every: 'tau', count: 'doses', set: { Ag: 'Ag + (ka > 0 ? F*dose : 0)', Ac: 'Ac + (ka > 0 ? 0 : F*dose)' } }, { id: 'infusionEnd', at: 'Tinf > 0 ? Tinf : -1' }],
      quantities: {
        k: P => P.CL / P.V, thalf: P => log(2) * P.V / P.CL, AUC: P => P.F * P.dose / P.CL,
        tmax: (P, x) => { const k = P.CL / P.V, ka = P.ka; if (!(ka > 0)) return 0; if (abs(ka - k) < 1e-9 * k) { x.code('degenerate-closed-form'); return 1 / k; } return log(ka / k) / (ka - k); },
        Cmax: (P, x) => { const k = P.CL / P.V, ka = P.ka, D = P.F * P.dose; if (!(ka > 0)) return D / P.V;
          if (abs(ka - k) < 1e-9 * k) { x.code('degenerate-closed-form'); return D / P.V * exp(-1); }
          const tm = log(ka / k) / (ka - k); return D * ka / (P.V * (ka - k)) * (exp(-k * tm) - exp(-ka * tm)); },
        Racc: P => 1 / (1 - exp(-P.CL / P.V * P.tau)),
        CssMax: (P, x) => { const k = P.CL / P.V, ka = P.ka, D = P.F * P.dose, Rk = 1 / (1 - exp(-k * P.tau)); if (!(ka > 0)) return D / P.V * Rk;
          if (abs(ka - k) < 1e-9 * k) { x.code('degenerate-closed-form'); return nan; }
          const Ra = 1 / (1 - exp(-ka * P.tau)), ts = log(ka * Ra / (k * Rk)) / (ka - k);   // the time of the peak in a steady-state interval
          return D * ka / (P.V * (ka - k)) * (Rk * exp(-k * ts) - Ra * exp(-ka * ts)); },
        CssMin: (P, x) => { const k = P.CL / P.V, ka = P.ka, D = P.F * P.dose, Rk = 1 / (1 - exp(-k * P.tau)); if (!(ka > 0)) return D / P.V * Rk * exp(-k * P.tau);
          if (abs(ka - k) < 1e-9 * k) { x.code('degenerate-closed-form'); return nan; }
          const Ra = 1 / (1 - exp(-ka * P.tau)); return D * ka / (P.V * (ka - k)) * (Rk * exp(-k * P.tau) - Ra * exp(-ka * P.tau)); },
        Cavg: P => P.F * P.dose / (P.CL * P.tau), Css: P => P.rate / P.CL, loading: P => P.dose / (1 - exp(-P.CL / P.V * P.tau)) } },
    pk2: { kind: 'ode', src: 'Gibaldi & Perrier, Pharmacokinetics, 2nd ed. 1982 ch. 2; Rowland & Tozer 2019',
      params: { dose: 100, V1: 10, k10: 0.3, k12: 0.2, k21: 0.1 },
      states: [['A1', 'dose'], ['A2', '0']], aux: [['C', 'A1/V1']],
      rhs: { A1: '-(k10 + k12)*A1 + k21*A2', A2: 'k12*A1 - k21*A2' },
      quantities: (() => { const ab = P => { const s = P.k10 + P.k12 + P.k21, d = sqrt(s * s - 4 * P.k10 * P.k21); return [(s + d) / 2, (s - d) / 2]; };
        return { alpha: P => ab(P)[0], beta: P => ab(P)[1], A: P => { const [a, b] = ab(P); return P.dose / P.V1 * (a - P.k21) / (a - b); },
          B: P => { const [a, b] = ab(P); return P.dose / P.V1 * (P.k21 - b) / (a - b); }, Vss: P => P.V1 * (1 + P.k12 / P.k21), thalfBeta: P => log(2) / ab(P)[1] }; })() },
    // ---- enzyme kinetics (Michaelis & Menten 1913; Briggs & Haldane 1925; Schnell & Mendoza 1997; Segel & Slemrod 1989) ----
    mm: { kind: 'ode', src: 'Michaelis & Menten 1913; Schnell & Mendoza 1997 (Lambert W); Cornish-Bowden, Fundamentals of Enzyme Kinetics, 4th ed. 2012 (inhibition)',
      params: { Vmax: 1, Km: 2, S0: 10, I: 0, Ki: 0, Kiu: 0 },
      states: [['S', 'S0'], ['P', '0']], aux: [['ac', 'Ki > 0 ? I/Ki : 0'], ['au', 'Kiu > 0 ? I/Kiu : 0'], ['v', 'Vmax*S/(Km*(1 + ac) + S*(1 + au))']],
      rhs: { S: '-v', P: 'v' }, invariants: [['mass', 'S + P']],
      quantities: (() => { const ac = P => P.Ki > 0 ? P.I / P.Ki : 0, au = P => P.Kiu > 0 ? P.I / P.Kiu : 0;
        const kmA = P => P.Km * (1 + ac(P)) / (1 + au(P)), vA = P => P.Vmax / (1 + au(P));
        return { KmApp: kmA, VmaxApp: vA, v0: P => vA(P) * P.S0 / (kmA(P) + P.S0),
          Sexact: (P, x) => { const K = kmA(P), V = vA(P); return K * lambertWlog(log(P.S0 / K) + (P.S0 - V * x.tEnd) / K); },
          IC50: P => P.Ki > 0 && !(P.Kiu > 0) ? P.Ki * (1 + P.S0 / P.Km) : nan }; })() },
    mmfull: { kind: 'ode', src: 'Briggs & Haldane 1925; Segel & Slemrod 1989 SIAM Rev. 31:446',
      params: { k1: 1, km1: 1, k2: 1, E0: 0.1, S0: 10 },
      states: [['E', 'E0'], ['S', 'S0'], ['Cx', '0'], ['P', '0']],
      rhs: { E: '-k1*E*S + (km1 + k2)*Cx', S: '-k1*E*S + km1*Cx', Cx: 'k1*E*S - (km1 + k2)*Cx', P: 'k2*Cx' },
      invariants: [['enzyme', 'E + Cx'], ['substrate', 'S + Cx + P']],
      quantities: { Km: P => (P.km1 + P.k2) / P.k1, Vmax: P => P.k2 * P.E0, qssaRatio: P => P.E0 / (P.S0 + (P.km1 + P.k2) / P.k1) } },
    // ---- populations (Verhulst 1838; Gompertz 1825; Allee 1931) ----
    logistic: { kind: 'ode', src: 'Verhulst 1838', params: { r: 0.5, K: 1000, N0: 10 }, states: [['N', 'N0']], rhs: { N: 'r*N*(1 - N/K)' },
      quantities: { Nexact: (P, x) => P.K / (1 + (P.K - P.N0) / P.N0 * exp(-P.r * x.tEnd)), tInflect: P => log((P.K - P.N0) / P.N0) / P.r, maxRate: P => P.r * P.K / 4, doubling: P => log(2) / P.r } },
    gompertz: { kind: 'ode', src: 'Gompertz 1825; Laird 1964; Tjørve & Tjørve 2017', params: { r: 0.5, K: 1000, N0: 10 }, states: [['N', 'N0']], rhs: { N: 'r*N*log(K/N)' },
      quantities: { Nexact: (P, x) => P.K * exp(log(P.N0 / P.K) * exp(-P.r * x.tEnd)), Ninflect: P => P.K / 2.718281828459045, tInflect: P => log(log(P.K / P.N0)) / P.r } },
    allee: { kind: 'ode', src: 'Allee 1931; Courchamp, Berec & Gascoigne 2008', params: { r: 1, K: 100, A: 20, N0: 30 }, states: [['N', 'N0']], rhs: { N: 'r*N*(N/A - 1)*(1 - N/K)' },
      quantities: { threshold: P => P.A } },
    // ---- predators, prey, competitors, chemostat ----
    lv: { kind: 'ode', src: 'Lotka 1925; Volterra 1926 Nature 118:558', params: { alpha: 1, beta: 0.5, gamma: 0.75, delta: 0.25, x0: 5, y0: 2 },
      states: [['x', 'x0'], ['y', 'y0']], rhs: { x: 'alpha*x - beta*x*y', y: 'delta*x*y - gamma*y' },
      invariants: [['H', 'delta*x - gamma*log(x) + beta*y - alpha*log(y)']], events: [{ id: 'cycle', when: 'x - gamma/delta', dir: 1 }],
      quantities: { xStar: P => P.gamma / P.delta, yStar: P => P.alpha / P.beta, smallPeriod: P => 2 * PI / sqrt(P.alpha * P.gamma) } },
    rm: { kind: 'ode', src: 'Rosenzweig & MacArthur 1963 Am. Nat. 97:209; Rosenzweig 1971 Science 171:385',
      params: { r: 1, K: 2, a: 1, h: 1, eff: 0.5, m: 0.2, x0: 1, y0: 0.5 },
      states: [['x', 'x0'], ['y', 'y0']], aux: [['fr', 'a*x/(1 + a*h*x)']], rhs: { x: 'r*x*(1 - x/K) - fr*y', y: 'eff*fr*y - m*y' },
      events: [{ id: 'cycle', when: 'x - m/(a*(eff - m*h))', dir: 1 }],
      quantities: (() => { const xs = P => P.eff > P.m * P.h ? P.m / (P.a * (P.eff - P.m * P.h)) : nan;
        return { xStar: xs, yStar: P => { const x = xs(P); return x < P.K ? P.r / P.a * (1 - x / P.K) * (1 + P.a * P.h * x) : nan; }, Kc: P => 2 * xs(P) + 1 / (P.a * P.h) }; })() },
    competition: { kind: 'ode', src: 'Lotka 1925; Volterra 1926; Gause 1934', params: { r1: 1, r2: 1, K1: 100, K2: 80, a12: 0.5, a21: 0.5, N10: 10, N20: 10 },
      states: [['N1', 'N10'], ['N2', 'N20']], rhs: { N1: 'r1*N1*(1 - (N1 + a12*N2)/K1)', N2: 'r2*N2*(1 - (N2 + a21*N1)/K2)' },
      quantities: { outcome: P => { const A = P.K1 < P.K2 / P.a21, B = P.K2 < P.K1 / P.a12; return A && B ? 3 : !A && !B ? 4 : !A && B ? 1 : 2; },
        N1star: P => (P.K1 - P.a12 * P.K2) / (1 - P.a12 * P.a21), N2star: P => (P.K2 - P.a21 * P.K1) / (1 - P.a12 * P.a21) } },
    chemostat: { kind: 'ode', src: 'Monod 1950; Novick & Szilard 1950 PNAS 36:708; Smith & Waltman 1995', params: { mumax: 1, Ks: 0.5, Y: 0.5, Sin: 10, D: 0.5, S0: 10, X0: 0.1 },
      states: [['S', 'S0'], ['X', 'X0']], aux: [['mu', 'mumax*S/(Ks + S)']], rhs: { S: 'D*(Sin - S) - mu*X/Y', X: '(mu - D)*X' },
      quantities: { Sstar: P => P.D < P.mumax ? P.Ks * P.D / (P.mumax - P.D) : nan, Xstar: P => { const s = P.Ks * P.D / (P.mumax - P.D); return P.D < P.mumax && s < P.Sin ? P.Y * (P.Sin - s) : 0; },
        Dc: P => P.mumax * P.Sin / (P.Ks + P.Sin), Dopt: P => P.mumax * (1 - sqrt(P.Ks / (P.Ks + P.Sin))) } },
    // ---- gene circuits (Gardner, Cantor & Collins 2000; Elowitz & Leibler 2000; Goodwin 1965) ----
    toggle: { kind: 'ode', src: 'Gardner, Cantor & Collins 2000 Nature 403:339', params: { a1: 10, a2: 10, beta: 2, gamma: 2, iptg: 0, Kd: 1, eta: 2, u0: 5, v0: 1 },
      states: [['u', 'u0'], ['v', 'v0']], aux: [['ue', 'u/(1 + (iptg/Kd)^eta)']], rhs: { u: 'a1/(1 + v^beta) - u', v: 'a2/(1 + ue^gamma) - v' }, quantities: {} },
    repressilator: { kind: 'ode', src: 'Elowitz & Leibler 2000 Nature 403:335, Box 1', params: { alpha: 216, alpha0: 0.216, beta: 0.2, nH: 2, m10: 0, m20: 20, m30: 0 },
      states: [['m1', 'm10'], ['m2', 'm20'], ['m3', 'm30'], ['p1', '0'], ['p2', '0'], ['p3', '0']],
      rhs: { m1: '-m1 + alpha/(1 + p3^nH) + alpha0', m2: '-m2 + alpha/(1 + p1^nH) + alpha0', m3: '-m3 + alpha/(1 + p2^nH) + alpha0', p1: '-beta*(p1 - m1)', p2: '-beta*(p2 - m2)', p3: '-beta*(p3 - m3)' },
      events: [{ id: 'cycle', when: 'p1 - 10', dir: 1 }], quantities: {} },
    // ---- excitable membranes (Hodgkin & Huxley 1952 J. Physiol. 117:500; FitzHugh 1961; Nagumo et al. 1962) ----
    hh: { kind: 'ode', src: 'Hodgkin & Huxley 1952, modern sign convention (rest −65 mV); Rinzel & Miller 1980',
      params: { I: 0, Ipulse: 0, tOn: 1, tDur: 1, temp: 6.3, gNa: 120, gK: 36, gL: 0.3, ENa: 50, EK: -77, EL: -54.387, Cm: 1 },
      states: [['V', '-65'], ['m', '0.05293'], ['h', '0.59612'], ['nK', '0.31768']],
      aux: [['phi', '3^((temp - 6.3)/10)'],
        ['am', 'abs(V + 40) < 1e-6 ? 1 + (V + 40)/20 : 0.1*(V + 40)/(1 - exp(-(V + 40)/10))'], ['bm', '4*exp(-(V + 65)/18)'],
        ['ah', '0.07*exp(-(V + 65)/20)'], ['bh', '1/(1 + exp(-(V + 35)/10))'],
        ['an', 'abs(V + 55) < 1e-6 ? 0.1 + (V + 55)/200 : 0.01*(V + 55)/(1 - exp(-(V + 55)/10))'], ['bn', '0.125*exp(-(V + 65)/80)'],
        ['Iapp', 'I + (t >= tOn && t < tOn + tDur ? Ipulse : 0)'], ['INa', 'gNa*m^3*h*(V - ENa)'], ['IK', 'gK*nK^4*(V - EK)'], ['IL', 'gL*(V - EL)']],
      rhs: { V: '(Iapp - INa - IK - IL)/Cm', m: 'phi*(am*(1 - m) - bm*m)', h: 'phi*(ah*(1 - h) - bh*h)', nK: 'phi*(an*(1 - nK) - bn*nK)' },
      events: [{ id: 'spike', when: 'V', dir: 1 }, { id: 'pulseOn', at: 'tOn' }, { id: 'pulseOff', at: 'tOn + tDur' }],
      quantities: { phi: P => Math.pow(3, (P.temp - 6.3) / 10) } },
    fhn: { kind: 'ode', src: 'FitzHugh 1961 Biophys. J. 1:445; Nagumo, Arimoto & Yoshizawa 1962', params: { a: 0.7, b: 0.8, eps: 0.08, I: 0.5, v0: -1, w0: -0.5 },
      states: [['v', 'v0'], ['w', 'w0']], rhs: { v: 'v - v^3/3 - w + I', w: 'eps*(v + a - b*w)' }, events: [{ id: 'spike', when: 'v', dir: 1 }],
      quantities: (() => { const ih = (P, s) => { const q = 1 - P.b * P.eps; if (!(q > 0)) return nan; const v = s * sqrt(q); return (v + P.a) / P.b - v + v * v * v / 3; };
        return { IH1: P => ih(P, -1), IH2: P => ih(P, 1) }; })() },
    // ---- mechanics and chaos ----
    pendulum: { kind: 'ode', src: 'DLMF §19.2 (period by K); Baker & Gollub, Chaotic Dynamics, 2nd ed. 1996 (driven)',
      params: { g: 9.81, L: 1, q: 0, F: 0, w: 0, theta0: 0.5, omega0: 0 },
      states: [['theta', 'theta0'], ['omega', 'omega0']], rhs: { theta: 'omega', omega: '-(g/L)*sin(theta) - q*omega + F*cos(w*t)' }, pairs: [['theta', 'omega']],
      invariants: [['E', '0.5*L*omega^2 - g*cos(theta)']], events: [{ id: 'turn', when: 'omega', dir: -1 }],
      quantities: { T0: P => 2 * PI * sqrt(P.L / P.g), T: P => P.omega0 === 0 ? 4 * sqrt(P.L / P.g) * ellipK(sin(abs(P.theta0) / 2)) : nan,
        ratio: P => P.omega0 === 0 ? 2 * ellipK(sin(abs(P.theta0) / 2)) / PI : nan } },
    lorenz: { kind: 'ode', src: 'Lorenz 1963 J. Atmos. Sci. 20:130; Sparrow 1982', params: { sigma: 10, rho: 28, beta: 8 / 3, x0: 1, y0: 1, z0: 1 },
      states: [['x', 'x0'], ['y', 'y0'], ['z', 'z0']], rhs: { x: 'sigma*(y - x)', y: 'x*(rho - z) - y', z: 'x*y - beta*z' },
      events: [{ id: 'zmax', when: 'x*y - beta*z', dir: -1 }],
      quantities: { rhoH: P => P.sigma * (P.sigma + P.beta + 3) / (P.sigma - P.beta - 1), Cx: P => P.rho > 1 ? sqrt(P.beta * (P.rho - 1)) : nan, divergence: P => -(P.sigma + 1 + P.beta) } },
    rossler: { kind: 'ode', src: 'Rössler 1976 Phys. Lett. A 57:397', params: { a: 0.2, b: 0.2, c: 5.7, x0: 1, y0: 1, z0: 0 },
      states: [['x', 'x0'], ['y', 'y0'], ['z', 'z0']], rhs: { x: '-y - z', y: 'x + a*y', z: 'b + z*(x - c)' }, events: [{ id: 'section', when: 'y', dir: -1 }], quantities: {} },
    vdp: { kind: 'ode', src: 'van der Pol 1926; Strogatz 2015 §7.5', params: { mu: 1, x0: 2, y0: 0 },
      states: [['x', 'x0'], ['y', 'y0']], rhs: { x: 'y', y: 'mu*(1 - x^2)*y - x' }, events: [{ id: 'up', when: 'x', dir: 1 }],
      quantities: { relaxPeriod: P => (3 - 2 * log(2)) * P.mu } },
    brusselator: { kind: 'ode', src: 'Prigogine & Lefever 1968; Strogatz 2015 ex. 7.3.2', params: { A: 1, B: 3, x0: 1.5, y0: 3 },
      states: [['x', 'x0'], ['y', 'y0']], rhs: { x: 'A + x^2*y - (B + 1)*x', y: 'B*x - x^2*y' }, events: [{ id: 'up', when: 'x - A', dir: 1 }],
      quantities: { Bhopf: P => 1 + P.A * P.A, xStar: P => P.A, yStar: P => P.B / P.A } },
    duffing: { kind: 'ode', src: 'Duffing 1918; Guckenheimer & Holmes 1983 §2.2', params: { delta: 0.3, alpha: -1, beta: 1, gamma: 0.5, omega: 1.2, x0: 1, v0: 0 },
      states: [['x', 'x0'], ['v', 'v0']], rhs: { x: 'v', v: '-delta*v - alpha*x - beta*x^3 + gamma*cos(omega*t)' },
      events: [{ id: 'strobe', at: '0', every: '2*pi/omega', count: '2000' }], quantities: { forcingPeriod: P => 2 * PI / P.omega } },
    robertson: { kind: 'ode', src: 'Robertson 1966; Hairer & Wanner, Solving ODEs II, 1996 §IV.1', params: { k1: 0.04, k2: 3e7, k3: 1e4 },
      states: [['y1', '1'], ['y2', '0'], ['y3', '0']], rhs: { y1: '-k1*y1 + k3*y2*y3', y2: 'k1*y1 - k3*y2*y3 - k2*y2^2', y3: 'k2*y2^2' },
      invariants: [['mass', 'y1 + y2 + y3']], quantities: {} },
    arenstorf: { kind: 'ode', src: 'Arenstorf 1963; Hairer, Nørsett & Wanner, Solving ODEs I, 1993 §II.0', params: { mu: 0.012277471, x0: 0.994, vy0: -2.00158510637908252240537862224 },
      states: [['x', 'x0'], ['y', '0'], ['vx', '0'], ['vy', 'vy0']],
      aux: [['D1', '((x + mu)^2 + y^2)^1.5'], ['D2', '((x - 1 + mu)^2 + y^2)^1.5']],
      rhs: { x: 'vx', y: 'vy', vx: 'x + 2*vy - (1 - mu)*(x + mu)/D1 - mu*(x - 1 + mu)/D2', vy: 'y - 2*vx - (1 - mu)*y/D1 - mu*y/D2' },
      quantities: { period: () => 17.0652165601579625588917206249 } },
    kepler: { kind: 'ode', src: 'Hairer, Lubich & Wanner, Geometric Numerical Integration, 2006 §I.2', params: { GM: 1, x0: 1, y0: 0, vx0: 0, vy0: 1 },
      states: [['x', 'x0'], ['y', 'y0'], ['vx', 'vx0'], ['vy', 'vy0']], aux: [['r3', '(x^2 + y^2)^1.5']],
      rhs: { x: 'vx', y: 'vy', vx: '-GM*x/r3', vy: '-GM*y/r3' }, pairs: [['x', 'vx'], ['y', 'vy']],
      invariants: [['energy', '0.5*(vx^2 + vy^2) - GM/sqrt(x^2 + y^2)'], ['angmom', 'x*vy - y*vx']],
      quantities: { period: P => { const r = sqrt(P.x0 * P.x0 + P.y0 * P.y0), E = 0.5 * (P.vx0 * P.vx0 + P.vy0 * P.vy0) - P.GM / r; if (!(E < 0)) return nan; const a = -P.GM / (2 * E); return 2 * PI * sqrt(a * a * a / P.GM); } } },
    // ---- maps (May 1976 Nature 261:459; Ricker 1954; Hénon 1976) ----
    logisticmap: { kind: 'map', src: 'May 1976 Nature 261:459; Feigenbaum 1978', params: { r: 3.7, x0: 0.2 }, states: [['x', 'x0']], next: { x: 'r*x*(1 - x)' },
      quantities: { fixedPoint: P => 1 - 1 / P.r, r2: () => 1 + sqrt(6), feigenbaum: () => 4.669201609102990 } },
    ricker: { kind: 'map', src: 'Ricker 1954 J. Fish. Res. Board Can. 11:559', params: { r: 2.5, x0: 0.5 }, states: [['x', 'x0']], next: { x: 'x*exp(r*(1 - x))' },
      quantities: { fixedPoint: () => 1, flip: () => 2 } },
    henon: { kind: 'map', src: 'Hénon 1976 Commun. Math. Phys. 50:69', params: { a: 1.4, b: 0.3, x0: 0, y0: 0 }, states: [['x', 'x0'], ['y', 'y0']], next: { x: '1 - a*x^2 + y', y: 'b*x' },
      quantities: { fpX: P => (-(1 - P.b) + sqrt((1 - P.b) * (1 - P.b) + 4 * P.a)) / (2 * P.a) } },
    // ---- delay equations (Hutchinson 1948; Mackey & Glass 1977 Science 197:287) ----
    delaylogistic: { kind: 'dde', src: 'Hutchinson 1948; Hale & Verduyn Lunel 1993', params: { r: 1, K: 1, tau: 1.7, x0: 0.5 },
      states: [['x', 'x0']], delays: [['xd', 'x', 'tau', 'x0']], rhs: { x: 'r*x*(1 - xd/K)' }, events: [{ id: 'up', when: 'x - K', dir: 1 }],
      quantities: { tauHopf: P => PI / (2 * P.r) } },
    mackeyglass: { kind: 'dde', src: 'Mackey & Glass 1977 Science 197:287', params: { beta: 0.2, gamma: 0.1, nH: 10, tau: 17, x0: 0.5 },
      states: [['x', 'x0']], delays: [['xd', 'x', 'tau', 'x0']], rhs: { x: 'beta*xd/(1 + xd^nH) - gamma*x' }, quantities: {} },
  };
  const TEMPLATE_NAMES = Object.keys(TEMPLATES);
  /** what the validators need to know of each template (the Python twin carries the same table) */
  function templateMeta() {
    const o = {};
    for (const k of TEMPLATE_NAMES) { const T = TEMPLATES[k]; o[k] = { kind: T.kind, params: Object.keys(T.params), states: T.states.map(s => s[0]), aux: (T.aux || []).map(a => a[0]),
      delays: (T.delays || []).map(d => d[0]), events: (T.events || []).map(e => e.id), invariants: (T.invariants || []).map(i => i[0]), quantities: Object.keys(T.quantities || {}), pairs: !!T.pairs }; }
    return o;
  }
  const TMETA = templateMeta();

  /* ======================================================================================================================
     The model checker (the same table and messages as tools/lib_ode.py)
     ====================================================================================================================== */
  const SOLVE = { t0: 'numx', tEnd: 'numx!', method: 'enum:' + METHODS.join('|'), dt: 'numx', hmax: 'numx', rtol: 'pos', atol: 'pos', points: 'int:2:2000', maxSteps: 'int:1:200000', transient: 'numx' };
  const EVENT = { id: 'id!', when: 'expr', dir: 'int:-1:1', at: 'numx', every: 'numx', count: 'int:1:2000', set: { $map: 'expr', max: 12 }, stop: 'bool' };
  const TABLE = {
    kind: 'enum:ode|map|dde', template: 'enum:' + TEMPLATE_NAMES.join('|'), set: { $map: 'numx', max: 24 },
    states: { $list: { $obj: { id: 'name!', init: 'numx!' } }, min: 1, max: 12 }, rhs: { $map: 'expr', max: 12 }, next: { $map: 'expr', max: 12 },
    aux: { $list: { $obj: { id: 'name!', expr: 'expr!' } }, max: 24 }, delays: { $list: { $obj: { id: 'name!', of: 'name!', tau: 'numx!', history: 'numx' } }, max: 4 },
    events: { $list: { $obj: EVENT }, max: 8 }, pairs: { $list: { $obj: { q: 'name!', p: 'name!' } }, max: 6 },
    invariants: { $list: { $obj: { id: 'name!', expr: 'expr!' } }, max: 4 },
    solve: { $req: true, $obj: SOLVE },
    equilibria: { $obj: { box: { $map: { $list: 'numx', min: 2, max: 2 }, max: 12 }, grid: 'int:1:16' } },
    lyapunov: { $obj: { k: 'int:1:4', every: 'numx', transient: 'numx' } },
    sweep: { $obj: { var: 'name!', value: 'numx!', min: 'numx!', max: 'numx!', points: 'int:2:400', of: 'name!', keep: 'int:1:200', transient: 'numx' } },
    phase: { $obj: { x: 'name!', y: 'name!', xmin: 'numx', xmax: 'numx', ymin: 'numx', ymax: 'numx', field: 'int:0:25', nullclines: 'bool' } },
  };
  const SERIES = ['t', 'state', 'eventTime', 'eventState', 'invariant', 'lyapT', 'lyapRun', 'sweepParam', 'sweepValue'];
  const SCALARS = ['final', 'stat', 'at', 'eventCount', 'eventTime', 'eventPeriod', 'period', 'drift', 'eqCount', 'eq', 'eigRe', 'eigIm', 'eqStable', 'eqType',
    'lyap', 'lyapSum', 'kaplanYorke', 'quantity', 'steps', 'rejected', 'flag', 'ok'];
  const SCENES = ['phase', 'cobweb', 'orbit', 'section'];
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const list = v => (Array.isArray(v) ? v : []);
  const objs = v => list(v).filter(isObj);
  const okName = v => C.checkKind('name', v);
  function specNames(spec) {
    const s = [];
    if (isObj(spec.consts)) for (const k of Object.keys(spec.consts)) s.push(k);
    for (const p of objs(spec.params)) if (typeof p.id === 'string') s.push(p.id);
    for (const d of objs(spec.derived)) if (typeof d.id === 'string') s.push(d.id);
    return s;
  }
  /** the model's own names: {states, aux, delays, invariants, params (template), events, kind, tpl} */
  function modelNames(m) {
    const tpl = typeof m.template === 'string' && TMETA[m.template] ? TMETA[m.template] : null;
    const kind = tpl ? tpl.kind : (typeof m.kind === 'string' ? m.kind : 'ode');
    const ids = a => objs(a).map(x => x.id).filter(okName);
    const states = tpl ? tpl.states.slice() : ids(m.states);
    const aux = (tpl ? tpl.aux.slice() : []).concat(ids(m.aux));
    const delays = tpl ? tpl.delays.slice() : ids(m.delays);
    const invariants = (tpl ? tpl.invariants.slice() : []).concat(ids(m.invariants));
    const events = (tpl ? tpl.events.slice() : []).concat(objs(m.events).map(e => e.id).filter(x => typeof x === 'string'));
    const sweepVar = isObj(m.sweep) && okName(m.sweep.var) ? [m.sweep.var] : [];
    return { tpl, kind, states, aux, delays, invariants, events, params: tpl ? tpl.params.slice() : [], sweepVar };
  }
  function localNames(N) { return N.states.concat(N.aux, N.delays, N.params, N.sweepVar, [N.kind === 'map' ? 'n' : 't']); }

  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    if (!isObj(spec)) { E('format', '', 'not an object'); return P; }
    const m = spec.model;
    C.walk(m, TABLE, 'model', E, W);
    if (!isObj(m)) { C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => {}, E, W); return P; }
    const N = modelNames(m), tpl = N.tpl;
    // the system itself: a template, or states with their equations
    if (tpl) {
      if (m.kind != null && m.kind !== tpl.kind) E('value', 'model.kind', `the template ${m.template} is of kind ${tpl.kind}`);
      for (const k of ['states', 'rhs', 'next', 'delays', 'pairs']) if (m[k] != null) E('value', 'model.' + k, `comes from the template ${m.template}`);
      if (isObj(m.set)) for (const k of Object.keys(m.set)) if (okName(k) && !tpl.params.includes(k)) E('value', 'model.set.' + k, `not a parameter of the template ${m.template} (its parameters: ${tpl.params.join(', ')})`);
    } else {
      if (m.set != null) E('value', 'model.set', 'needs a template');
      if (m.states == null) E('value', 'model.states', 'missing');
      const eq = N.kind === 'map' ? 'next' : 'rhs', other = N.kind === 'map' ? 'rhs' : 'next';
      if (m[other] != null) E('value', 'model.' + other, N.kind === 'map' ? 'a map is given by next' : 'an ODE or a delay equation is given by rhs');
      if (Array.isArray(m.states)) {
        if (!isObj(m[eq])) { if (m[eq] == null) E('value', 'model.' + eq, 'missing'); }
        else {
          for (const s of N.states) if (!Object.prototype.hasOwnProperty.call(m[eq], s)) E('value', `model.${eq}.${s}`, 'missing (every state needs its equation)');
          for (const k of Object.keys(m[eq])) if (okName(k) && !N.states.includes(k)) E('value', `model.${eq}.${k}`, 'not a state');
        }
      }
      if (N.kind === 'dde' && !(Array.isArray(m.delays) && m.delays.length)) E('value', 'model.delays', 'a delay equation needs at least one delay {id, of, tau}');
      if (N.kind !== 'dde' && m.delays != null) E('value', 'model.delays', 'only a delay equation (kind dde) has delays');
      objs(m.delays).forEach((d, i) => { if (okName(d.of) && !N.states.includes(d.of)) E('value', `model.delays[${i}].of`, 'not a state'); });
    }
    // names: each once, and none that is also a name of the spec
    const seen = new Set(), sn = specNames(spec), own = [['states', N.states], ['aux', N.aux], ['delays', N.delays], ['invariants', N.invariants], ['sweep', N.sweepVar]];
    for (const [w, a] of own) for (const x of a) {
      if (seen.has(x) || N.params.includes(x)) E('dup-name', 'model.' + w, `the name ${x} is used twice in the model`);
      else if (sn.includes(x)) E('dup-name', 'model.' + w, `the name ${x} is also a name of the spec (consts, params, derived)`);
      seen.add(x);
    }
    // events
    objs(m.events).forEach((e, i) => {
      const w = `model.events[${i}]`;
      if ((e.when == null) === (e.at == null)) E('event', w, 'needs when (a crossing) or at (a time), not both');
      if (e.at == null && (e.every != null || e.count != null)) E('event', w, 'every and count go with at');
      if (e.when == null && e.dir != null) E('event', w + '.dir', 'goes with when');
      if (isObj(e.set)) for (const k of Object.keys(e.set)) if (okName(k) && !N.states.includes(k)) E('value', `${w}.set.${k}`, 'not a state');
    });
    { const evIds = N.events; evIds.forEach((x, i) => { if (evIds.indexOf(x) !== i) E('dup-name', 'model.events', `the event ${x} is listed twice`); }); }
    if (N.kind === 'map' && m.events != null) E('value', 'model.events', 'a map has no events');
    // the solver
    const sv = isObj(m.solve) ? m.solve : {}, method = typeof sv.method === 'string' ? sv.method : 'auto';
    if (N.kind === 'map') { if (sv.method != null || sv.dt != null || sv.rtol != null || sv.atol != null || sv.hmax != null) W('unknown-field', 'model.solve', 'a map iterates: method, dt, rtol, atol and hmax are ignored'); }
    else {
      if (FIXED.includes(method) && sv.dt == null) E('value', 'model.solve.dt', `missing (${FIXED.join(', ')} take a fixed step dt)`);
      if (N.kind === 'dde' && method === 'rosenbrock') E('method', 'model.solve.method', 'a delay equation needs an explicit method: auto, dopri5, rk4, heun, midpoint or euler');
      if (N.kind === 'dde' && (method === 'verlet' || method === 'yoshida4')) E('method', 'model.solve.method', 'a delay equation needs an explicit method: auto, dopri5, rk4, heun, midpoint or euler');
      if (method === 'verlet' || method === 'yoshida4') {
        if (!tpl && !(Array.isArray(m.pairs) && m.pairs.length)) E('value', 'model.pairs', `${method} needs the pairs {q, p} of a separable system`);
        else if (tpl && !tpl.pairs) E('method', 'model.solve.method', `the template ${m.template} has no pairs {q, p} for ${method}`);
        else if (!tpl) { const used = []; objs(m.pairs).forEach((p, i) => { for (const k of ['q', 'p']) if (okName(p[k])) { if (!N.states.includes(p[k])) E('value', `model.pairs[${i}].${k}`, 'not a state'); else if (used.includes(p[k])) E('value', `model.pairs[${i}].${k}`, 'in two pairs'); used.push(p[k]); } });
          for (const s of N.states) if (!used.includes(s)) E('value', 'model.pairs', `the state ${s} is in no pair`); }
      } else if (m.pairs != null) W('unknown-field', 'model.pairs', 'only verlet and yoshida4 use pairs');
    }
    const t0 = typeof sv.t0 === 'number' ? sv.t0 : 0, maxSteps = Number.isInteger(sv.maxSteps) ? sv.maxSteps : DEF_STEPS;
    if (typeof sv.tEnd === 'number') {
      if (!(sv.tEnd > t0)) E('value', 'model.solve.tEnd', 'must be after t0');
      else if (N.kind === 'map' && (!Number.isInteger(sv.tEnd) || sv.tEnd > maxSteps)) E('budget', 'model.solve.tEnd', `a map runs a whole number of iterations, at most maxSteps (${maxSteps})`);
      else if (N.kind !== 'map' && FIXED.includes(method) && typeof sv.dt === 'number' && sv.dt > 0 && (sv.tEnd - t0) / sv.dt > maxSteps) E('budget', 'model.solve.dt', `(tEnd − t0)/dt is more than maxSteps (${maxSteps}) steps`);
    }
    if (typeof sv.dt === 'number' && !(sv.dt > 0)) E('value', 'model.solve.dt', 'needs a number > 0');
    // analyses
    if (isObj(m.equilibria)) {
      const box = isObj(m.equilibria.box) ? Object.keys(m.equilibria.box) : [];
      for (const k of box) if (okName(k) && !N.states.includes(k)) E('value', 'model.equilibria.box.' + k, 'not a state');
      const g = Number.isInteger(m.equilibria.grid) ? m.equilibria.grid : 3;
      if (Math.pow(g, box.length) > 512) E('budget', 'model.equilibria.grid', 'grid^(states in the box) is more than 512 starting points');
      if (N.kind === 'dde') W('unknown-field', 'model.equilibria', 'a delay equation: equilibria without eigenvalues');
    }
    if (isObj(m.lyapunov)) {
      const k = Number.isInteger(m.lyapunov.k) ? m.lyapunov.k : 1;
      if (N.kind === 'dde') E('value', 'model.lyapunov', 'not for a delay equation');
      else if (k > N.states.length) E('value', 'model.lyapunov.k', `at most the number of states (${N.states.length})`);
    }
    if (isObj(m.sweep)) {
      const s = m.sweep;
      if (okName(s.of) && !N.states.includes(s.of)) E('value', 'model.sweep.of', 'not a state');
      if (N.kind === 'map' && typeof s.transient === 'number') { const pts = Number.isInteger(s.points) ? s.points : 200, keep = Number.isInteger(s.keep) ? s.keep : 50;
        if (!(Number.isInteger(s.transient) && s.transient >= 0)) E('value', 'model.sweep.transient', 'needs a whole number of iterations >= 0');
        else if (pts * (s.transient + keep) > maxSteps) E('budget', 'model.sweep', `points × (transient + keep) is more than maxSteps (${maxSteps}) iterations`); }
    }
    if (isObj(m.phase)) {
      for (const k of ['x', 'y']) if (okName(m.phase[k]) && !N.states.includes(m.phase[k])) E('value', 'model.phase.' + k, 'not a state');
      if (m.phase.x === m.phase.y) E('value', 'model.phase.y', 'must differ from x');
    }
    // outputs
    const evIds = N.events, inv = N.invariants, vars = N.states.concat(N.aux, N.delays);
    const kLy = isObj(m.lyapunov) ? (Number.isInteger(m.lyapunov.k) ? m.lyapunov.k : 1) : 0;
    const need = (cond, at, f, msg) => { if (!cond) E('output', at + '.' + f, msg); return cond; };
    const varOk = (o, at) => need(typeof o.var === 'string' && vars.includes(o.var), at, 'var', 'a state or aux of the model');
    const evOk = (o, at) => need(typeof o.event === 'string' && evIds.includes(o.event), at, 'event', 'an event of the model');
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at) => {
      const of = o.of, kd = o.kind;
      const known = kd === 'series' ? SERIES : kd === 'scalar' ? SCALARS : SCENES;
      if (!known.includes(of)) { E('output', at + '.of', `${ID} computes as a ${kd}: ${known.join(', ')}`); return; }
      if (of === 'state' || of === 'final' || of === 'stat' || of === 'at' || of === 'period') varOk(o, at);
      if (of === 'stat') need(C.STATS.includes(o.stat), at, 'stat', 'one of ' + C.STATS.join(', '));
      if (of === 'at') need(o.t != null && C.checkKind('numx', o.t), at, 't', 'needs a number or an expression (the time)');
      if (of === 'eventTime' || of === 'eventState' || of === 'eventCount' || of === 'eventPeriod') evOk(o, at);
      if (of === 'eventState') varOk(o, at);
      if (of === 'eventTime' && kd === 'scalar') need(Number.isInteger(o.nth) && o.nth !== 0 && abs(o.nth) <= MAX_EVENTS, at, 'nth', 'a whole number ±1–2000 (1 the first, −1 the last)');
      if (of === 'invariant' || of === 'drift') need(typeof o.var === 'string' && inv.includes(o.var), at, 'var', 'an invariant of the model');
      if (['eqCount', 'eq', 'eigRe', 'eigIm', 'eqStable', 'eqType'].includes(of)) {
        if (need(isObj(m.equilibria), at, 'of', 'needs model.equilibria')) {
          if (of !== 'eqCount') need(Number.isInteger(o.index) && o.index >= 0 && o.index < 64, at, 'index', 'a whole number 0–63 (the equilibria sorted by their states)');
          if (of === 'eq') varOk(o, at);
          if (of === 'eigRe' || of === 'eigIm') need(Number.isInteger(o.k) && o.k >= 0 && o.k < N.states.length, at, 'k', `a whole number 0–${N.states.length - 1} (the eigenvalues by decreasing real part)`);
        }
      }
      if (['lyapT', 'lyapRun', 'lyap', 'lyapSum', 'kaplanYorke'].includes(of) && need(kLy > 0, at, 'of', 'needs model.lyapunov')) {
        if (of === 'lyap' || of === 'lyapRun') need(Number.isInteger(o.k) && o.k >= 1 && o.k <= kLy, at, 'k', `a whole number 1–${kLy} (model.lyapunov.k)`);
        if (of === 'kaplanYorke') need(kLy === N.states.length, at, 'of', 'needs the whole spectrum (model.lyapunov.k = the number of states)');
      }
      if (of === 'sweepParam' || of === 'sweepValue' || of === 'orbit') need(isObj(m.sweep), at, 'of', 'needs model.sweep');
      if (of === 'quantity') { if (need(!!N.tpl, at, 'of', 'a quantity comes from a template')) need(typeof o.name === 'string' && N.tpl.quantities.includes(o.name), at, 'name', `a quantity of the template ${m.template}: ${N.tpl.quantities.join(', ') || '(none)'}`); }
      if (of === 'flag') need(CODES.includes(o.code), at, 'code', 'one of ' + CODES.join(', '));
      if (of === 'phase') need(isObj(m.phase), at, 'of', 'needs model.phase');
      if (of === 'cobweb') { if (need(N.kind === 'map', at, 'of', 'a cobweb is for a map')) varOk(o, at); }
      if (of === 'section') { if (evOk(o, at)) for (const f of ['x', 'y']) need(typeof o[f] === 'string' && vars.includes(o[f]), at, f, 'a state or aux of the model'); }
    }, E, W);
    return P;
  }
  /** every expression of the model: [source, path, local names] */
  function exprs(spec) {
    const out = [], m = isObj(spec) && isObj(spec.model) ? spec.model : null;
    if (!m) return out;
    const N = modelNames(m), loc = localNames(N);
    const add = (v, p, l) => { if (typeof v === 'string') out.push([v, p, l]); };
    if (isObj(m.set)) for (const [k, v] of Object.entries(m.set)) add(v, 'model.set.' + k, []);
    objs(m.states).forEach((s, i) => add(s.init, `model.states[${i}].init`, []));
    for (const eq of ['rhs', 'next']) if (isObj(m[eq])) for (const [k, v] of Object.entries(m[eq])) add(v, `model.${eq}.${k}`, loc);
    objs(m.aux).forEach((a, i) => add(a.expr, `model.aux[${i}].expr`, loc));
    objs(m.delays).forEach((d, i) => { add(d.tau, `model.delays[${i}].tau`, []); add(d.history, `model.delays[${i}].history`, []); });
    objs(m.events).forEach((e, i) => {
      add(e.when, `model.events[${i}].when`, loc); add(e.at, `model.events[${i}].at`, []); add(e.every, `model.events[${i}].every`, []);
      if (isObj(e.set)) for (const [k, v] of Object.entries(e.set)) add(v, `model.events[${i}].set.${k}`, loc);
    });
    objs(m.invariants).forEach((v, i) => add(v.expr, `model.invariants[${i}].expr`, loc));
    if (isObj(m.solve)) for (const k of ['t0', 'tEnd', 'dt', 'hmax', 'transient']) add(m.solve[k], 'model.solve.' + k, []);
    if (isObj(m.equilibria) && isObj(m.equilibria.box)) for (const [k, v] of Object.entries(m.equilibria.box)) list(v).forEach((x, j) => add(x, `model.equilibria.box.${k}[${j}]`, []));
    if (isObj(m.lyapunov)) for (const k of ['every', 'transient']) add(m.lyapunov[k], 'model.lyapunov.' + k, []);
    if (isObj(m.sweep)) for (const k of ['value', 'min', 'max', 'transient']) add(m.sweep[k], 'model.sweep.' + k, []);
    if (isObj(m.phase)) for (const k of ['xmin', 'xmax', 'ymin', 'ymax']) add(m.phase[k], 'model.phase.' + k, []);
    list(spec.outputs).forEach((o, i) => { if (isObj(o) && o.of === 'at') add(o.t, `outputs[${i}].t`, []); });
    return out;
  }
  function keys() { return []; }

  /* ======================================================================================================================
     Linear algebra for n ≤ 12 (+ the tangent vectors of a Lyapunov run): LU with partial pivoting, eigenvalues
     ====================================================================================================================== */
  function luFactor(A, n, piv) {   // A: Float64Array n×n row-major, in place; false when singular
    for (let k = 0; k < n; k++) {
      let p = k, mx = abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
      if (!(mx > 0) || !Number.isFinite(mx)) return false;
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const d = A[k * n + k];
      for (let i = k + 1; i < n; i++) { const f = (A[i * n + k] /= d); if (f !== 0) for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j]; }
    }
    return true;
  }
  function luSolve(A, n, piv, b) {   // b in place
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } for (let i = k + 1; i < n; i++) b[i] -= A[i * n + k] * b[k]; }
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j]; b[i] = s / A[i * n + i]; }
  }
  /** eigenvalues of a real n×n matrix (rows): balance, reduce to Hessenberg form by elimination, shifted QR (Numerical Recipes in C,
      2nd ed. 1992, balanc / elmhes / hqr; Wilkinson & Reinsch 1971). → [{re, im}] sorted by decreasing real part, or null */
  function eigenvalues(M) {
    const n = M.length; if (n === 1) return [{ re: M[0][0], im: 0 }];
    const a = []; for (let i = 0; i <= n; i++) a.push(new Float64Array(n + 1));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i + 1][j + 1] = M[i][j];
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (!Number.isFinite(a[i][j])) return null;
    // balanc
    const RADIX = 2, sqrdx = 4; let last = 0;
    for (let guard = 0; !last && guard < 100; guard++) {
      last = 1;
      for (let i = 1; i <= n; i++) {
        let r = 0, c = 0; for (let j = 1; j <= n; j++) if (j !== i) { c += abs(a[j][i]); r += abs(a[i][j]); }
        if (c && r) { let g = r / RADIX, f = 1; const s = c + r; while (c < g) { f *= RADIX; c *= sqrdx; } g = r * RADIX; while (c > g) { f /= RADIX; c /= sqrdx; }
          if ((c + r) / f < 0.95 * s) { last = 0; g = 1 / f; for (let j = 1; j <= n; j++) a[i][j] *= g; for (let j = 1; j <= n; j++) a[j][i] *= f; } }
      }
    }
    // elmhes
    for (let m = 2; m < n; m++) {
      let x = 0, i = m;
      for (let j = m; j <= n; j++) if (abs(a[j][m - 1]) > abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) { for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; } for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; } }
      if (x) for (i = m + 1; i <= n; i++) { let y = a[i][m - 1]; if (y) { y /= x; a[i][m - 1] = y; for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j]; for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i]; } }
    }
    for (let i = 3; i <= n; i++) for (let j = 1; j <= i - 2; j++) a[i][j] = 0;
    // hqr
    const wr = new Float64Array(n + 1), wi = new Float64Array(n + 1);
    let anorm = 0; for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += abs(a[i][j]);
    let nn = n, t = 0, z = 0, y = 0, x = 0, w = 0, v = 0, u = 0, s = 0, r = 0, q = 0, p = 0, l = 0, m = 0;
    const SIGN = (aa, bb) => (bb >= 0 ? abs(aa) : -abs(aa));
    while (nn >= 1) {
      let its = 0;
      do {
        for (l = nn; l >= 2; l--) { s = abs(a[l - 1][l - 1]) + abs(a[l][l]); if (s === 0) s = anorm; if (abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; } }
        x = a[nn][nn];
        if (l === nn) { wr[nn] = x + t; wi[nn--] = 0; }
        else {
          y = a[nn - 1][nn - 1]; w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            p = 0.5 * (y - x); q = p * p + w; z = sqrt(abs(q)); x += t;
            if (q >= 0) { z = p + SIGN(z, p); wr[nn - 1] = wr[nn] = x + z; if (z) wr[nn] = x - w / z; wi[nn - 1] = wi[nn] = 0; }
            else { wr[nn - 1] = wr[nn] = x + p; wi[nn - 1] = -(wi[nn] = z); }
            nn -= 2;
          } else {
            if (its === 60) return null;
            if (its === 10 || its === 20) { t += x; for (let i = 1; i <= nn; i++) a[i][i] -= x; s = abs(a[nn][nn - 1]) + abs(a[nn - 1][nn - 2]); y = x = 0.75 * s; w = -0.4375 * s * s; }
            ++its;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m]; r = x - z; s = y - z;
              p = (r * s - w) / a[m + 1][m] + a[m][m + 1]; q = a[m + 1][m + 1] - z - r - s; r = a[m + 2][m + 1];
              s = abs(p) + abs(q) + abs(r); p /= s; q /= s; r /= s;
              if (m === l) break;
              u = abs(a[m][m - 1]) * (abs(q) + abs(r)); v = abs(p) * (abs(a[m - 1][m - 1]) + abs(z) + abs(a[m + 1][m + 1]));
              if (u + v === v) break;
            }
            for (let i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
            for (let k = m; k <= nn - 1; k++) {
              if (k !== m) { p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0; if (k !== nn - 1) r = a[k + 2][k - 1]; if ((x = abs(p) + abs(q) + abs(r)) !== 0) { p /= x; q /= x; r /= x; } }
              if ((s = SIGN(sqrt(p * p + q * q + r * r), p)) !== 0) {
                if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
                p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
                for (let j = k; j <= nn; j++) { p = a[k][j] + q * a[k + 1][j]; if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; } a[k + 1][j] -= p * y; a[k][j] -= p * x; }
                const mmin = nn < k + 3 ? nn : k + 3;
                for (let i = l; i <= mmin; i++) { p = x * a[i][k] + y * a[i][k + 1]; if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; } a[i][k + 1] -= p * q; a[i][k] -= p; }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
    const ev = []; for (let i = 1; i <= n; i++) ev.push({ re: wr[i], im: wi[i] });
    ev.sort((A, B) => (B.re - A.re) || (B.im - A.im));
    return ev;
  }

  /* ======================================================================================================================
     The compiled model
     ====================================================================================================================== */
  function build(spec) {
    const m = spec.model, N = modelNames(m), T = N.tpl ? TEMPLATES[m.template] : null;
    const M = { kind: N.kind, names: N.states, n: N.states.length, tpl: T, tplName: T ? m.template : null };
    M.params = T ? Object.entries(T.params).map(([k, d]) => ({ id: k, f: isObj(m.set) && m.set[k] != null ? C.cx(m.set[k]) : () => d })) : [];
    M.init = T ? T.states.map(s => C.cx(s[1])) : objs(m.states).map(s => C.cx(s.init));
    const eqs = T ? (T.rhs || T.next) : (N.kind === 'map' ? m.next : m.rhs);
    M.f = N.states.map(s => C.cx(eqs[s]));
    M.aux = (T && T.aux ? T.aux.map(([id, e]) => ({ id, f: C.cx(e) })) : []).concat(objs(m.aux).map(a => ({ id: a.id, f: C.cx(a.expr) })));
    M.delays = (T && T.delays ? T.delays.map(([id, of, tau, hist]) => ({ id, i: N.states.indexOf(of), tau: C.cx(tau), hist: C.cx(hist) }))
      : objs(m.delays).map(d => ({ id: d.id, i: N.states.indexOf(d.of), tau: C.cx(d.tau), hist: d.history != null ? C.cx(d.history) : null })));
    const ev = e => ({ id: e.id, when: e.when != null ? C.cx(e.when) : null, dir: e.dir || 0, at: e.at != null ? C.cx(e.at) : null, every: e.every != null ? C.cx(e.every) : null,
      count: e.count != null ? (typeof e.count === 'number' ? () => e.count : C.cx(e.count)) : null,
      set: isObj(e.set) ? Object.entries(e.set).map(([k, v]) => [N.states.indexOf(k), C.cx(v)]) : [], stop: !!e.stop });
    M.events = (T && T.events ? T.events.map(ev) : []).concat(objs(m.events).map(ev));
    M.invariants = (T && T.invariants ? T.invariants.map(([id, e]) => ({ id, f: C.cx(e) })) : []).concat(objs(m.invariants).map(v => ({ id: v.id, f: C.cx(v.expr) })));
    const pr = T && T.pairs ? T.pairs.map(([q, p]) => ({ q, p })) : objs(m.pairs);
    M.pairs = pr.map(p => [N.states.indexOf(p.q), N.states.indexOf(p.p)]);
    const sv = m.solve;
    M.solve = { t0: sv.t0 != null ? C.cx(sv.t0) : () => 0, tEnd: C.cx(sv.tEnd), dt: sv.dt != null ? C.cx(sv.dt) : null, hmax: sv.hmax != null ? C.cx(sv.hmax) : null,
      transient: sv.transient != null ? C.cx(sv.transient) : () => 0, method: sv.method || 'auto', rtol: sv.rtol || 1e-6, atol: sv.atol || 1e-9,
      points: sv.points || 400, maxSteps: Math.min(sv.maxSteps || DEF_STEPS, MAX_STEPS) };
    if (isObj(m.equilibria)) { const box = isObj(m.equilibria.box) ? m.equilibria.box : {};
      M.eq = { box: Object.entries(box).map(([k, v]) => [N.states.indexOf(k), C.cx(v[0]), C.cx(v[1])]), grid: m.equilibria.grid || 3 }; }
    if (isObj(m.lyapunov)) M.lyap = { k: m.lyapunov.k || 1, every: m.lyapunov.every != null ? C.cx(m.lyapunov.every) : () => 0.1, transient: m.lyapunov.transient != null ? C.cx(m.lyapunov.transient) : () => 0 };
    if (isObj(m.sweep)) { const s = m.sweep; M.sweep = { v: s.var, value: C.cx(s.value), min: C.cx(s.min), max: C.cx(s.max), points: s.points || 200, of: N.states.indexOf(s.of), keep: s.keep || 50, transient: s.transient != null ? C.cx(s.transient) : null }; }
    if (isObj(m.phase)) { const p = m.phase; M.phase = { x: N.states.indexOf(p.x), y: N.states.indexOf(p.y), box: ['xmin', 'xmax', 'ymin', 'ymax'].map(k => p[k] != null ? C.cx(p[k]) : null), field: p.field == null ? 15 : p.field, nullclines: p.nullclines !== false }; }
    return M;
  }
  function prepare(spec) { try { return C.hasErrors(checkSpec(spec)) ? null : build(spec); } catch (e) { return null; } }

  /* the run context: the env shared by every expression, the step budget and the codes */
  function makeCtx(M, env, maxSteps) {
    const codes = [], seen = new Set();
    const ctx = { env, steps: 0, rejected: 0, nfev: 0, maxSteps, codes,
      code(c, t, info) { if (seen.has(c)) return; seen.add(c); const o = { code: c, level: FATAL.includes(c) ? 'error' : 'warning' }; if (t != null && Number.isFinite(t)) o.t = t; if (info != null) o.info = info; codes.push(o); },
      has: c => seen.has(c), fatal: () => codes.some(o => o.level === 'error') };
    return ctx;
  }
  /** f(t, y, dy): sets the env (states, delays, aux) and evaluates the equations; lag(i, t) for delays */
  function makeRhs(M, ctx, lag) {
    const env = ctx.env, nm = M.names, n = M.n, tName = M.kind === 'map' ? 'n' : 't';
    const setEnv = (t, y) => {
      env[tName] = t; for (let i = 0; i < n; i++) env[nm[i]] = y[i];
      for (const d of M.delays) env[d.id] = lag ? lag(d, t) : y[d.i];
      for (const a of M.aux) env[a.id] = a.f(env);
    };
    const f = (t, y, dy) => { ctx.nfev++; setEnv(t, y); for (let i = 0; i < n; i++) dy[i] = M.f[i](env); };
    return { f, setEnv };
  }

  /* ======================================================================================================================
     Steppers. Each: reset(t, y) after a start or a jump; step(tTarget) → {t0, t1, y1, seg(t, out)} | {fail: code}
     ====================================================================================================================== */
  // Dormand & Prince 1980 (HNW I Table 5.2) with the dense output of Hairer's DOPRI5 (contd5)
  const A21 = 1 / 5, A31 = 3 / 40, A32 = 9 / 40, A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9,
    A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729,
    A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656,
    A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84,
    E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40,
    D1 = -12715105075 / 11282082432, D3 = 87487479700 / 32700410799, D4 = -10690763975 / 1880347072,
    D5 = 701980252875 / 199316789632, D6 = -1453857185 / 822651844, D7 = 69997945 / 29380423;
  function stepperDopri(n, f, o, ctx) {
    const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n), k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
    const y = new Float64Array(n), y1 = new Float64Array(n), yt = new Float64Array(n), ysti = new Float64Array(n);
    const { rtol, hmax } = o, AT = o.atolv; let t = 0, h = 0, facold = 1e-4, iasti = 0, nonsti = 0, stiff = false;
    const sk = i => AT[i] + rtol * Math.max(abs(y[i]), abs(y1[i]));
    function hinit() {   // HNW I §II.4
      let dnf = 0, dny = 0; for (let i = 0; i < n; i++) { const s = AT[i] + rtol * abs(y[i]); dnf += (k1[i] / s) ** 2; dny += (y[i] / s) ** 2; }
      let hh = dnf <= 1e-10 || dny <= 1e-10 ? 1e-6 : sqrt(dny / dnf) * 0.01; hh = Math.min(hh, hmax);
      for (let i = 0; i < n; i++) yt[i] = y[i] + hh * k1[i];
      f(t + hh, yt, k2); let der2 = 0; for (let i = 0; i < n; i++) { const s = AT[i] + rtol * abs(y[i]); der2 += ((k2[i] - k1[i]) / s) ** 2; }
      der2 = sqrt(der2) / hh; const der12 = Math.max(abs(der2), sqrt(dnf));
      const h1 = der12 <= 1e-15 ? Math.max(1e-6, abs(hh) * 1e-3) : Math.pow(0.01 / der12, 0.2);
      const r = Math.min(100 * abs(hh), h1, hmax); return r > 0 ? r : hmax * 1e-3;
    }
    return {
      name: 'dopri5', get stiff() { return stiff; }, get h() { return h; },
      reset(t0, y0, keepH) { t = t0; y.set(y0); f(t, y, k1); if (!keepH || !(h > 0)) h = hinit(); facold = 1e-4; },
      step(tT) {
        if (!k1.every(Number.isFinite)) return { fail: 'nan' };
        for (let tries = 0; ; tries++) {
          const span = tT - t; if (!(span > 0)) return { fail: 'time' };
          let hh = Math.min(h, hmax), last = false; if (hh >= span * (1 - 1e-12)) { hh = span; last = true; }
          if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * A21 * k1[i]; f(t + 0.2 * hh, yt, k2);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A31 * k1[i] + A32 * k2[i]); f(t + 0.3 * hh, yt, k3);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]); f(t + 0.8 * hh, yt, k4);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]); f(t + 8 / 9 * hh, yt, k5);
          for (let i = 0; i < n; i++) ysti[i] = y[i] + hh * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
          const tph = last ? tT : t + hh; f(tph, ysti, k6);
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh * (A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
          f(tph, y1, k7);
          let err = 0; for (let i = 0; i < n; i++) { const e = hh * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]); err += (e / sk(i)) ** 2; }
          err = sqrt(err / n);
          if (!Number.isFinite(err)) { ctx.rejected++; h = hh / 10; if (!(h > 10 * EPS * abs(t) && h > 1e-300)) return { fail: 'nan' }; continue; }
          const fac11 = Math.pow(err, 0.2 - 0.04 * 0.75);   // PI control (HNW I §IV.2: β = 0.04)
          if (err <= 1) {
            let fac = fac11 / Math.pow(facold, 0.04); fac = Math.max(0.1, Math.min(5, fac / 0.9)); const hnew = hh / fac; facold = Math.max(err, 1e-4);
            // stiffness (HNW I §IV.2, the test of DOPRI5): h·ρ ≈ h·‖k7 − k6‖/‖y1 − ysti‖
            let sn = 0, sd = 0; for (let i = 0; i < n; i++) { sn += (k7[i] - k6[i]) ** 2; sd += (y1[i] - ysti[i]) ** 2; }
            if (sd > 0) { if (hh * sqrt(sn / sd) > 3.25) { nonsti = 0; iasti++; if (iasti >= 15) stiff = true; } else { nonsti++; if (nonsti === 6) iasti = 0; } }
            // the dense output (contd5)
            const r1 = Float64Array.from(y), r2 = new Float64Array(n), r3 = new Float64Array(n), r4 = new Float64Array(n), r5 = new Float64Array(n);
            for (let i = 0; i < n; i++) { const dy = y1[i] - y[i], bspl = hh * k1[i] - dy; r2[i] = dy; r3[i] = bspl; r4[i] = dy - hh * k7[i] - bspl;
              r5[i] = hh * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]); }
            const ta = t, tb = tph, hs = hh;
            const seg = (tq, out) => { const th = (tq - ta) / hs, th1 = 1 - th; for (let i = 0; i < n; i++) out[i] = r1[i] + th * (r2[i] + th1 * (r3[i] + th * (r4[i] + th1 * r5[i]))); };
            t = tph; y.set(y1); k1.set(k7); h = last ? Math.max(h, hnew) : hnew;
            return { t0: ta, t1: tb, y1: y, seg };
          }
          ctx.rejected++; h = hh / Math.min(10, fac11 / 0.9);
        }
      },
    };
  }
  // Rosenbrock 2(3) of Shampine & Reichelt 1997 (MATLAB ode23s): L-stable, W = I − h·d·J, d = 1/(2 + √2)
  function stepperRos(n, f, o, ctx) {
    const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
    const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n), k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
    const y = new Float64Array(n), y1 = new Float64Array(n), yt = new Float64Array(n), J = new Float64Array(n * n), W = new Float64Array(n * n), Tt = new Float64Array(n), fx = new Float64Array(n);
    const piv = new Int32Array(n); const { rtol, hmax } = o, AT = o.atolv; let t = 0, h = 0, jacOk = false;
    function jac() {   // forward differences (the threshold: Shampine & Reichelt 1997 §3.2, simplified)
      for (let j = 0; j < n; j++) { const yj = y[j], del = 1.4901161193847656e-8 * Math.max(abs(yj), AT[j] / rtol * 1e-3, 1e-12); y[j] = yj + del; f(t, y, fx); y[j] = yj; for (let i = 0; i < n; i++) J[i * n + j] = (fx[i] - F0[i]) / del; }
      const dt = 1.4901161193847656e-8 * Math.max(abs(t), 1e-6); f(t + dt, y, fx); for (let i = 0; i < n; i++) Tt[i] = (fx[i] - F0[i]) / dt;
      jacOk = true;
    }
    return {
      name: 'rosenbrock', stiff: false,
      reset(t0, y0, keepH) { t = t0; y.set(y0); f(t, y, F0); jacOk = false;
        if (!keepH || !(h > 0)) { let s = 0; for (let i = 0; i < n; i++) s += (F0[i] / (AT[i] + rtol * abs(y[i]))) ** 2; s = sqrt(s / n); h = Math.min(hmax, s > 0 ? 0.8 * Math.pow(rtol, 1 / 3) / s : hmax / 100); if (!(h > 0)) h = hmax * 1e-3; } },
      step(tT) {
        if (!F0.every(Number.isFinite)) return { fail: 'nan' };
        if (!jacOk) jac();
        for (let tries = 0; ; tries++) {
          const span = tT - t; if (!(span > 0)) return { fail: 'time' };
          let hh = Math.min(h, hmax), last = false; if (hh >= span * (1 - 1e-12)) { hh = span; last = true; }
          if (!(hh > 10 * EPS * abs(t) && hh > 1e-300) || tries > 200) return { fail: 'step-underflow' };
          for (let i = 0; i < n * n; i++) W[i] = -hh * d * J[i]; for (let i = 0; i < n; i++) W[i * n + i] += 1;
          if (!luFactor(W, n, piv)) { ctx.rejected++; h = hh / 4; continue; }
          for (let i = 0; i < n; i++) k1[i] = F0[i] + hh * d * Tt[i]; luSolve(W, n, piv, k1);
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * k1[i]; f(t + 0.5 * hh, yt, F1);
          for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i]; luSolve(W, n, piv, k2); for (let i = 0; i < n; i++) k2[i] += k1[i];
          const tph = last ? tT : t + hh;
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh * k2[i]; f(tph, y1, F2);
          for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + hh * d * Tt[i]; luSolve(W, n, piv, k3);
          let err = 0; for (let i = 0; i < n; i++) { const e = hh / 6 * (k1[i] - 2 * k2[i] + k3[i]); err += (e / (AT[i] + rtol * Math.max(abs(y[i]), abs(y1[i])))) ** 2; }
          err = sqrt(err / n);
          if (!Number.isFinite(err)) { ctx.rejected++; h = hh / 10; continue; }
          if (err <= 1) {
            const hnew = hh * Math.min(5, Math.max(0.2, 0.8 * Math.pow(Math.max(err, 1e-10), -1 / 3)));
            const r0 = Float64Array.from(y), c1 = Float64Array.from(k1), c2 = Float64Array.from(k2), ta = t, hs = hh, q = 1 - 2 * d;
            const seg = (tq, out) => { const s = (tq - ta) / hs; for (let i = 0; i < n; i++) out[i] = r0[i] + hs * (s * (1 - s) / q * c1[i] + s * (s - 2 * d) / q * c2[i]); };   // ntrp23s
            t = tph; y.set(y1); F0.set(F2); jacOk = false; h = last ? Math.max(h, hnew) : hnew;
            jac();
            return { t0: ta, t1: tph, y1: y, seg };
          }
          ctx.rejected++; h = hh * Math.max(0.2, 0.8 * Math.pow(err, -1 / 3));
        }
      },
    };
  }
  // fixed steps: Euler, Heun, midpoint, RK4; cubic Hermite between the steps
  function stepperFixed(method, n, f, o, ctx, pairs) {
    const y = new Float64Array(n), y1 = new Float64Array(n), f0 = new Float64Array(n), f1 = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), yt = new Float64Array(n);
    let t = 0; const dt = o.dt;
    const qi = pairs.map(p => p[0]), pi = pairs.map(p => p[1]);
    function verlet(tt, hh, out) {   // kick–drift–kick (Störmer–Verlet; HLW 2006 §I.1.4): p' = F(q), q' = G(p)
      f(tt, out, a); for (const j of pi) out[j] += 0.5 * hh * a[j];
      f(tt + 0.5 * hh, out, a); for (const j of qi) out[j] += hh * a[j];
      f(tt + hh, out, a); for (const j of pi) out[j] += 0.5 * hh * a[j];
    }
    const Y1 = 1 / (2 - Math.cbrt(2)), Y0 = 1 - 2 * Y1;   // Yoshida 1990, the triple jump
    return {
      name: method, stiff: false,
      reset(t0, y0) { t = t0; y.set(y0); f(t, y, f0); },
      step(tT) {
        const span = tT - t; if (!(span > 0)) return { fail: 'time' };
        const hh = Math.min(dt, span), tph = hh === span ? tT : t + hh;
        if (method === 'euler') for (let i = 0; i < n; i++) y1[i] = y[i] + hh * f0[i];
        else if (method === 'heun') { for (let i = 0; i < n; i++) yt[i] = y[i] + hh * f0[i]; f(tph, yt, a); for (let i = 0; i < n; i++) y1[i] = y[i] + 0.5 * hh * (f0[i] + a[i]); }
        else if (method === 'midpoint') { for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * f0[i]; f(t + 0.5 * hh, yt, a); for (let i = 0; i < n; i++) y1[i] = y[i] + hh * a[i]; }
        else if (method === 'rk4') {
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * f0[i]; f(t + 0.5 * hh, yt, a);
          for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * hh * a[i]; f(t + 0.5 * hh, yt, b);
          for (let i = 0; i < n; i++) yt[i] = y[i] + hh * b[i]; f(tph, yt, c);
          for (let i = 0; i < n; i++) y1[i] = y[i] + hh / 6 * (f0[i] + 2 * a[i] + 2 * b[i] + c[i]);
        } else if (method === 'verlet') { y1.set(y); verlet(t, hh, y1); }
        else { y1.set(y); verlet(t, Y1 * hh, y1); verlet(t + Y1 * hh, Y0 * hh, y1); verlet(t + (Y1 + Y0) * hh, Y1 * hh, y1); }
        f(tph, y1, f1);
        const r0 = Float64Array.from(y), r1 = Float64Array.from(y1), d0 = Float64Array.from(f0), d1 = Float64Array.from(f1), ta = t, hs = hh;
        const seg = (tq, out) => { const s = (tq - ta) / hs, s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
          for (let i = 0; i < n; i++) out[i] = h00 * r0[i] + h10 * hs * d0[i] + h01 * r1[i] + h11 * hs * d1[i]; };
        t = tph; y.set(y1); f0.set(f1);
        return { t0: ta, t1: tph, y1: y, seg };
      },
    };
  }

  /* ======================================================================================================================
     The driver of a flow: steps to targets (timed events, breakpoints, tEnd), samples, locates crossings, applies jumps
     ====================================================================================================================== */
  function makeStepper(method, n, f, o, ctx, pairs) {
    if (method === 'rosenbrock') return stepperRos(n, f, o, ctx);
    if (FIXED.includes(method)) return stepperFixed(method, n, f, o, ctx, pairs);
    return stepperDopri(n, f, o, ctx);
  }
  /** flow(cfg): integrates from t0 to tEnd. cfg = {n, f, y0, t0, tEnd, method, rtol, atol, dt, hmax, pairs, samples (sorted times),
      onSample(t, y), crossings [{g(t, y), dir, apply?(t, y) → y | null, stop, onHit(t, y)}], timed [{t, apply(t, y) (in place)}],
      onSegment(seg, t0, t1)} → {t, y, stopped} */
  function flow(cfg, ctx) {
    const n = cfg.n, o = { rtol: cfg.rtol, atolv: cfg.atolv || new Float64Array(n).fill(cfg.atol), hmax: cfg.hmax, dt: cfg.dt };
    let method = cfg.method === 'auto' ? 'dopri5' : cfg.method, auto = cfg.method === 'auto';
    let st = makeStepper(method, n, cfg.f, o, ctx, cfg.pairs || []);
    let t = cfg.t0; const y = Float64Array.from(cfg.y0), tmp = new Float64Array(n), ya = new Float64Array(n);
    const timed = (cfg.timed || []).slice().sort((A, B) => A.t - B.t); let ti = 0;
    const samples = cfg.samples || []; let si = 0;
    const cross = cfg.crossings || [];
    const gv = new Float64Array(cross.length);
    // a g that is exactly 0 at a start or after a jump (a ball put on the floor) takes the side it leaves towards, so the next
    // crossing in the event's direction is seen even when the whole flight fits in one step
    const evalG = (tt, yy, start) => { for (let j = 0; j < cross.length; j++) { const g = cross[j].g(tt, yy); gv[j] = start && g === 0 && cross[j].dir ? (cross[j].dir < 0 ? 1e-300 : -1e-300) : g; } };
    let stopped = false, jumps = 0;
    // timed events at t0 come first (a dose at time 0), samples at t0 after them
    while (ti < timed.length && timed[ti].t <= t + 1e-12 * Math.max(1, abs(t))) { timed[ti].apply(t, y); ti++; }
    if (![...y].every(Number.isFinite)) { ctx.code('nan', t); return { t, y, stopped: true }; }
    st.reset(t, y);
    evalG(t, y, true);
    while (si < samples.length && samples[si] <= t) { cfg.onSample(samples[si], y); si++; }
    const ymax0 = Math.max(1, ...[...y].map(abs));
    while (t < cfg.tEnd && !stopped) {
      if (ctx.steps >= ctx.maxSteps) { ctx.code('budget', t); break; }
      const tT = Math.min(cfg.tEnd, ti < timed.length ? timed[ti].t : Infinity);
      const r = st.step(tT);
      if (r.fail) { ctx.code(r.fail === 'time' ? 'step-underflow' : r.fail, t); break; }
      ctx.steps++;
      let t1 = r.t1, seg = r.seg; y.set(r.y1);
      if (![...y].every(Number.isFinite)) { ctx.code('nan', t1); break; }
      if (Math.max(...[...y].map(abs)) > 1e12 * ymax0) { ctx.code('blow-up', t1); stopped = true; }
      // crossings: the earliest root of each g on the step (Illinois method on the dense output)
      let jump = null;
      if (cross.length) {
        const g0 = Float64Array.from(gv); evalG(t1, y);
        let first = Infinity, firstJ = -1;
        for (let j = 0; j < cross.length; j++) {
          const a0 = g0[j], b0 = gv[j], dir = cross[j].dir;
          const up = a0 < 0 && b0 >= 0, down = a0 > 0 && b0 <= 0;
          if (!((dir >= 0 && up) || (dir <= 0 && down))) continue;
          let ta = t, tb = t1, ga = a0, gb = b0, side = 0, tr = tb;
          for (let it = 0; it < 80; it++) {
            tr = (ta * gb - tb * ga) / (gb - ga); if (!(tr > ta && tr < tb)) tr = (ta + tb) / 2;
            seg(tr, tmp); const gr = cross[j].g(tr, tmp);
            if (gr === 0 || tb - ta <= 1e-13 * Math.max(1, abs(tr))) break;
            if ((gr < 0) === (ga < 0)) { ta = tr; ga = gr; if (side === -1) gb /= 2; side = -1; } else { tb = tr; gb = gr; if (side === 1) ga /= 2; side = 1; }
          }
          seg(tr, tmp); cross[j].onHit(tr, tmp);
          if ((cross[j].apply || cross[j].stop) && tr < first) { first = tr; firstJ = j; }
        }
        if (firstJ >= 0) { jump = { t: first, j: firstJ }; }
      }
      if (jump) {   // the step ends at the event; the state jumps (or the run stops)
        t1 = jump.t; seg(t1, ya);
        while (si < samples.length && samples[si] <= t1) { seg(samples[si], tmp); cfg.onSample(samples[si], tmp); si++; }
        if (cfg.onSegment) cfg.onSegment(seg, t, t1);
        const ev = cross[jump.j];
        if (ev.stop) { y.set(ya); t = t1; ctx.code('stopped', t1); stopped = true; break; }
        if (ev.apply) ev.apply(t1, ya);
        y.set(ya); t = t1; jumps++;
        if (jumps > MAX_EVENTS) { ctx.code('zeno', t); break; }
        st.reset(t, y, true); evalG(t, y, true);
        continue;
      }
      while (si < samples.length && samples[si] <= t1 + 1e-12 * Math.max(1, abs(t1))) { const ts = Math.min(samples[si], t1); seg(ts, tmp); cfg.onSample(samples[si], tmp); si++; }
      if (cfg.onSegment) cfg.onSegment(seg, t, t1);
      t = t1;
      if (stopped) break;
      // timed events at this time, then a restart
      let hit = false;
      while (ti < timed.length && timed[ti].t <= t + 1e-12 * Math.max(1, abs(t))) { timed[ti].apply(t, y); ti++; hit = true; }
      if (hit) { if (![...y].every(Number.isFinite)) { ctx.code('nan', t); break; } st.reset(t, y, true); evalG(t, y, true); }
      if (auto && st.stiff) {   // DOPRI5 found the problem stiff: go on with Rosenbrock (like LSODA's switch, Petzold 1983)
        ctx.code('stiff-switched', t); auto = false; method = 'rosenbrock'; st = makeStepper(method, n, cfg.f, o, ctx, []); st.reset(t, y); evalG(t, y);
      } else if (!auto && st.stiff && !ctx.has('stiff')) ctx.code('stiff', t);
    }
    return { t, y, stopped };
  }

  /* ======================================================================================================================
     A run of the model
     ====================================================================================================================== */
  const fin = Number.isFinite;
  function evalParams(M, env) { const P = {}; for (const p of M.params) { const v = p.f(env); P[p.id] = v; } for (const [k, v] of Object.entries(P)) env[k] = v; return P; }

  /** the trajectory of a flow (ode, dde) or a map, with its samples and events */
  function trajectory(M, env, ctx, opt) {
    const n = M.n, sv = M.solve, P = opt.P;
    const t0 = sv.t0(env), tEnd = sv.tEnd(env);
    const res = { t: [], Y: [], ev: M.events.map(() => ({ t: [], y: [] })), t0, tEnd, yEnd: null };
    if (!(fin(t0) && fin(tEnd) && tEnd > t0)) { ctx.code('time'); return res; }
    const y0 = new Float64Array(n);
    for (const k of M.names) env[k] = NaN;   // the initial values may not use the states
    for (let i = 0; i < n; i++) y0[i] = M.init[i](env);
    if (opt.y0) y0.set(opt.y0);
    if (!y0.every(fin)) { ctx.code('nan', t0); return res; }
    const keep = opt.keepSamples !== false;
    if (M.kind === 'map') return mapRun(M, env, ctx, res, y0, Math.round(tEnd - t0), opt);
    // DDE: the history of every step (dense output) for the lags
    let lag = null; const segs = [];
    if (M.kind === 'dde') {
      const hist = M.delays.map(d => (d.hist ? d.hist(env) : y0[d.i]));
      const taus = M.delays.map(d => d.tau(env));
      if (!taus.every(x => fin(x) && x > 0)) { ctx.code('time'); return res; }
      M.delays.forEach((d, j) => { d._tau = taus[j]; d._hist = hist[j]; });
      const tmp = new Float64Array(n); let lo = 0;
      lag = (d, t) => {
        const tq = t - d._tau; if (tq <= t0) return d._hist;
        let a = lo, b = segs.length - 1; if (b < 0) return d._hist;
        if (tq >= segs[b].t1) { segs[b].seg(segs[b].t1, tmp); return tmp[d.i]; }
        while (a < b) { const mid = (a + b) >> 1; if (segs[mid].t1 < tq) a = mid + 1; else b = mid; }
        segs[a].seg(tq, tmp); return tmp[d.i];
      };
      opt.hmaxCap = Math.min(...taus);
    }
    const { f, setEnv } = makeRhs(M, ctx, lag);
    // samples
    const tr = Math.max(0, sv.transient(env) || 0), tS = t0 + Math.min(tr, tEnd - t0), pts = opt.points || sv.points;
    const samples = []; for (let i = 0; i < pts; i++) samples.push(tS + (tEnd - tS) * i / (pts - 1));
    const probe = (opt.probes || []).filter(fin).sort((a, b) => a - b);
    res.probe = new Map();
    const pSet = new Set(probe), sSet = new Set(keep ? samples : []), all = [...new Set(keep ? samples.concat(probe) : probe)].sort((a, b) => a - b);
    const onSample = (t, y) => { if (pSet.has(t)) res.probe.set(t, Array.from(y)); if (sSet.has(t)) { res.t.push(t); res.Y.push(Array.from(y)); } };
    // events
    const timed = [], crossings = [];
    M.events.forEach((e, j) => {
      const rec = (t, y) => { if (res.ev[j].t.length < MAX_EVENTS) { res.ev[j].t.push(t); res.ev[j].y.push(Array.from(y)); } else ctx.code('event-limit', t); };
      const apply = e.set.length ? (t, y) => { setEnv(t, y); const v = e.set.map(([i, fn]) => [i, fn(env)]); for (const [i, x] of v) y[i] = x; } : null;
      if (e.when) crossings.push({ g: (t, y) => { setEnv(t, y); return e.when(env); }, dir: e.dir, apply, stop: e.stop, onHit: rec });
      else {
        const a0 = e.at(env), ev = e.every ? e.every(env) : 0, cnt = e.count ? Math.round(e.count(env)) : (e.every ? MAX_EVENTS : 1);
        if (!fin(a0) || a0 < t0 || a0 > tEnd) return;
        for (let k = 0; k < Math.min(cnt, MAX_EVENTS); k++) {
          const tk = a0 + k * (ev > 0 ? ev : 0); if (tk > tEnd || (k > 0 && !(ev > 0))) break;
          timed.push({ t: tk, apply: (t, y) => { rec(t, y); if (apply) apply(t, y); if (e.stop) { /* a timed stop ends at tEnd */ } } });
        }
      }
    });
    if (M.kind === 'dde') for (const d of M.delays) for (let k = 1; k <= 5; k++) { const tk = t0 + k * d._tau; if (tk < tEnd) timed.push({ t: tk, apply: () => {} }); }   // propagated discontinuities
    let hmax = M.solve.hmax ? M.solve.hmax(env) : (tEnd - t0) / 50; if (!(hmax > 0)) hmax = (tEnd - t0) / 50; if (opt.hmaxCap) hmax = Math.min(hmax, opt.hmaxCap);
    const dt = sv.dt ? sv.dt(env) : null;
    if (FIXED.includes(sv.method) && !(dt > 0)) { ctx.code('time'); return res; }
    const out = flow({ n, f, y0, t0, tEnd, method: opt.method || sv.method, rtol: sv.rtol, atol: sv.atol, dt, hmax, pairs: M.pairs, samples: all, onSample, crossings, timed,
      onSegment: M.kind === 'dde' ? (seg, a, b) => { segs.push({ t1: b, seg }); } : null }, ctx);
    res.yEnd = Array.from(out.y); res.tStop = out.t; res.f = f; res.setEnv = setEnv;
    return res;
  }
  function mapRun(M, env, ctx, res, y0, N, opt) {
    const n = M.n, sv = M.solve; const { f, setEnv } = makeRhs(M, ctx, null);
    const tr = Math.max(0, Math.round(sv.transient(env) || 0));
    let y = Float64Array.from(y0); const y1 = new Float64Array(n);
    const keep = opt.keepSamples !== false, probe = new Set((opt.probes || []).map(Math.round)); res.probe = new Map();
    const stride = Math.max(1, Math.ceil((N - Math.min(tr, N) + 1) / 2000));
    for (let k = 0; k <= N; k++) {
      if (probe.has(k)) res.probe.set(k, Array.from(y));
      if (keep && k >= tr && ((k - tr) % stride === 0 || k === N)) { res.t.push(k); res.Y.push(Array.from(y)); }
      if (k === N) break;
      if (ctx.steps >= ctx.maxSteps) { ctx.code('budget', k); break; }
      ctx.steps++; f(k, y, y1);
      if (!y1.every(fin) || y1.some(v => abs(v) > 1e100)) { ctx.code('map-escape', k + 1); break; }
      y.set(y1);
    }
    res.yEnd = Array.from(y); res.f = f; res.setEnv = setEnv; return res;
  }

  /* equilibria: damped Newton from a grid of starts (F = rhs for a flow, next − x for a map) */
  function equilibria(M, env, ctx, y0) {
    const n = M.n, t0 = M.solve.t0(env), map = M.kind === 'map';
    const { f } = makeRhs(M, ctx, null);   // a delay equation at rest: the lagged states equal the states
    const F = (y, out) => { f(t0, y, out); if (map) for (let i = 0; i < n; i++) out[i] -= y[i]; };
    const nrm = v => { let s = 0; for (const x of v) s += x * x; return sqrt(s); };
    const starts = [Float64Array.from(y0)];
    const box = M.eq.box.map(([i, a, b]) => [i, a(env), b(env)]).filter(([i, a, b]) => i >= 0 && fin(a) && fin(b));
    const g = M.eq.grid, dims = box.length, total = Math.pow(g, dims);
    for (let k = 0; k < total && dims; k++) { const s = Float64Array.from(y0); let r = k; for (const [i, a, b] of box) { const j = r % g; r = (r - j) / g; s[i] = g === 1 ? (a + b) / 2 : a + (b - a) * j / (g - 1); } starts.push(s); }
    const found = [], Fv = new Float64Array(n), Ft = new Float64Array(n), Jm = new Float64Array(n * n), piv = new Int32Array(n), yt = new Float64Array(n);
    for (const s of starts) {
      const y = Float64Array.from(s); let ok = false;
      for (let it = 0; it < 60; it++) {
        F(y, Fv); const fn = nrm(Fv); if (!fin(fn)) break;
        if (fn <= 1e-13 * Math.max(1, nrm(y))) { ok = true; break; }
        for (let j = 0; j < n; j++) { const yj = y[j], del = 1e-7 * Math.max(1, abs(yj)); y[j] = yj + del; F(y, Ft); y[j] = yj; for (let i = 0; i < n; i++) Jm[i * n + j] = (Ft[i] - Fv[i]) / del; }
        if (!luFactor(Jm, n, piv)) break;
        const dx = Float64Array.from(Fv, v => -v); luSolve(Jm, n, piv, dx);
        let lam = 1, moved = false;
        for (let b = 0; b < 30; b++) { for (let i = 0; i < n; i++) yt[i] = y[i] + lam * dx[i]; F(yt, Ft); if (nrm(Ft) < (1 - 1e-4 * lam) * fn || !(nrm(Ft) >= 0)) { if (fin(nrm(Ft))) { y.set(yt); moved = true; } break; } lam /= 2; }
        if (!moved) break;
        if (nrm(dx) * lam <= 1e-14 * Math.max(1, nrm(y))) { F(y, Fv); ok = nrm(Fv) <= 1e-8 * Math.max(1, nrm(y)); break; }
      }
      if (!ok || !y.every(fin)) continue;
      if (found.some(q => q.every((v, i) => abs(v - y[i]) <= 1e-7 * Math.max(1, abs(v))))) continue;
      found.push(Array.from(y));
    }
    found.sort((a, b) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
    if (!found.length) ctx.code('newton');
    // the Jacobian (central differences) and its eigenvalues at each
    return found.map(y => {
      const Jr = []; const yp = Float64Array.from(y), fp = new Float64Array(n), fm = new Float64Array(n);
      for (let i = 0; i < n; i++) Jr.push(new Array(n).fill(0));
      for (let j = 0; j < n; j++) { const del = 6.0554544523933395e-6 * Math.max(1, abs(y[j])); yp[j] = y[j] + del; f(t0, yp, fp); yp[j] = y[j] - del; f(t0, yp, fm); yp[j] = y[j]; for (let i = 0; i < n; i++) Jr[i][j] = (fp[i] - fm[i]) / (2 * del); }
      const ev = M.kind === 'dde' ? null : eigenvalues(Jr);
      if (M.kind !== 'dde' && !ev) ctx.code('eigen');
      let stable = NaN, type = NaN;
      if (ev) {
        const sc = Math.max(1e-300, ...ev.map(e => Math.hypot(e.re, e.im))), tol = 1e-7 * sc;
        if (map) { const mods = ev.map(e => Math.hypot(e.re, e.im)); stable = mods.every(m => m < 1 - 1e-9) ? 1 : mods.some(m => m > 1 + 1e-9) ? 0 : 0.5; type = stable === 0.5 ? 7 : (mods.some(m => m > 1 + 1e-9) && mods.some(m => m < 1 - 1e-9) ? 1 : (ev.some(e => e.im !== 0) ? (stable ? 4 : 5) : (stable ? 2 : 3))); }
        else {
          const pos = ev.some(e => e.re > tol), neg = ev.some(e => e.re < -tol), zero = ev.some(e => abs(e.re) <= tol), cplx = ev.some(e => e.im !== 0);
          stable = !pos && !zero ? 1 : pos ? 0 : 0.5;
          type = pos && neg ? 1 : zero ? (!pos && !neg && cplx && ev.every(e => abs(e.re) <= tol) ? 6 : 7) : neg ? (cplx ? 4 : 2) : (cplx ? 5 : 3);
        }
        if (stable === 0.5) ctx.code('non-hyperbolic');
      }
      return { y, ev, stable, type };
    });
  }

  /* Lyapunov exponents (Benettin et al. 1980): the variational equation by directional differences, Gram–Schmidt every Δt */
  function lyapunov(M, env, ctx, y0) {
    const n = M.n, k = M.lyap.k, sv = M.solve, t0 = sv.t0(env), tEnd = sv.tEnd(env);
    const every = M.lyap.every(env), trans = Math.max(0, M.lyap.transient(env) || 0);
    const out = { lam: new Array(k).fill(NaN), T: [], run: [] };
    if (!(fin(every) && every > 0 && tEnd > t0)) { ctx.code('time'); return out; }
    const { f } = makeRhs(M, ctx, null);
    const sums = new Float64Array(k); let tAcc = 0;
    const gs = V => { const r = new Float64Array(k); for (let j = 0; j < k; j++) { for (let i = 0; i < j; i++) { let d = 0; for (let q = 0; q < n; q++) d += V[i][q] * V[j][q]; for (let q = 0; q < n; q++) V[j][q] -= d * V[i][q]; } let s = 0; for (let q = 0; q < n; q++) s += V[j][q] * V[j][q]; s = sqrt(s); r[j] = s; for (let q = 0; q < n; q++) V[j][q] /= s; } return r; };
    const record = tt => { if (tAcc > 0) { out.T.push(tt); out.run.push(Array.from(sums, s => s / tAcc)); } };
    if (M.kind === 'map') {
      const N = Math.round(tEnd - t0), tr = Math.round(trans); let y = Float64Array.from(y0); const y1 = new Float64Array(n), yp = new Float64Array(n), fp = new Float64Array(n);
      const V = []; for (let j = 0; j < k; j++) { const v = new Float64Array(n); v[j] = 1; V.push(v); }
      const J = []; for (let i = 0; i < n; i++) J.push(new Float64Array(n));
      for (let it = 0; it < N; it++) {
        if (ctx.steps >= ctx.maxSteps) { ctx.code('budget', it); break; }
        ctx.steps++; f(it, y, y1);
        for (let j = 0; j < n; j++) { const del = 1e-7 * Math.max(1, abs(y[j])); yp.set(y); yp[j] += del; f(it, yp, fp); for (let i = 0; i < n; i++) J[i][j] = (fp[i] - y1[i]) / del; }
        for (const v of V) { const w = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let q = 0; q < n; q++) s += J[i][q] * v[q]; w[i] = s; } v.set(w); }
        const r = gs(V); if (!y1.every(fin) || !r.every(x => x > 0 && fin(x))) { ctx.code('map-escape', it + 1); break; }
        if (it >= tr) { for (let j = 0; j < k; j++) sums[j] += log(r[j]); tAcc++; if ((it - tr) % Math.max(1, Math.ceil((N - tr) / 2000)) === 0) record(it + 1); }
        y.set(y1);
      }
      if (N - tr < 50) ctx.code('lyap-short');
    } else {
      const m = n * (1 + k), Y0 = new Float64Array(m); Y0.set(y0); for (let j = 0; j < k; j++) Y0[n * (1 + j) + j] = 1;
      const fy = new Float64Array(n), yp = new Float64Array(n), fp = new Float64Array(n);
      const fa = (t, Y, dY) => {
        const y = Y.subarray(0, n); f(t, y, fy); for (let i = 0; i < n; i++) dY[i] = fy[i];
        let ny = 0; for (let i = 0; i < n; i++) ny += y[i] * y[i]; ny = sqrt(ny);
        for (let j = 0; j < k; j++) {
          const v = Y.subarray(n * (1 + j), n * (2 + j)); let nv = 0; for (let i = 0; i < n; i++) nv += v[i] * v[i]; nv = sqrt(nv);
          if (!(nv > 0)) { for (let i = 0; i < n; i++) dY[n * (1 + j) + i] = 0; continue; }
          const eps = 1.4901161193847656e-8 * (1 + ny) / nv; for (let i = 0; i < n; i++) yp[i] = y[i] + eps * v[i];
          f(t, yp, fp); for (let i = 0; i < n; i++) dY[n * (1 + j) + i] = (fp[i] - fy[i]) / eps;
        }
      };
      const timed = [];
      const nR = Math.min(Math.floor((tEnd - t0) / every), 100000);
      for (let q = 1; q <= nR; q++) { const tq = t0 + q * every; timed.push({ t: tq, apply: (t, Y) => {
        const V = []; for (let j = 0; j < k; j++) V.push(Y.subarray(n * (1 + j), n * (2 + j)));
        const r = gs(V);
        if (t > t0 + trans + 1e-12) { for (let j = 0; j < k; j++) sums[j] += log(r[j]); tAcc += every; record(t); }
      } }); }
      const dt = sv.dt ? sv.dt(env) : null;
      const atolv = new Float64Array(m).fill(Math.min(sv.atol, 1e-12)); atolv.fill(sv.atol, 0, n);   // the tangent vectors shrink: a pure relative control
      flow({ n: m, f: fa, y0: Y0, t0, tEnd: t0 + nR * every, method: sv.method === 'verlet' || sv.method === 'yoshida4' ? 'rk4' : sv.method, rtol: sv.rtol, atol: sv.atol, atolv, dt, hmax: Math.min(every, (tEnd - t0) / 50), pairs: [], samples: [], onSample: () => {}, crossings: [], timed }, ctx);
      if (tAcc * Math.max(...Array.from(sums, s => abs(s / Math.max(tAcc, 1e-300)))) < 50 || tAcc < 10 * every) ctx.code('lyap-short');
    }
    if (tAcc > 0) for (let j = 0; j < k; j++) out.lam[j] = sums[j] / tAcc;
    return out;
  }

  /* parameter sweeps: an orbit (bifurcation) diagram */
  function sweep(M, env, ctx) {
    const S = M.sweep, out = { p: [], v: [] };
    const a = S.min(env), b = S.max(env); if (!(fin(a) && fin(b))) { ctx.code('time'); return out; }
    const keep = Math.max(1, Math.min(S.keep, Math.floor(2000 / S.points)));
    for (let q = 0; q < S.points; q++) {
      const p = S.points === 1 ? a : a + (b - a) * q / (S.points - 1); env[S.v] = p;
      if (ctx.steps >= ctx.maxSteps) { ctx.code('budget'); break; }
      if (M.kind === 'map') {
        const n = M.n; const { f } = makeRhs(M, ctx, null); for (const k of M.names) env[k] = NaN;
        let y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = M.init[i](env); const y1 = new Float64Array(n);
        const tr = S.transient ? Math.max(0, Math.round(S.transient(env))) : 500;
        for (let it = 0; it < tr + S.keep && ctx.steps < ctx.maxSteps; it++) {
          ctx.steps++; f(it, y, y1); if (!y1.every(fin) || y1.some(v => abs(v) > 1e100)) { ctx.code('map-escape'); break; }
          y.set(y1); if (it >= tr + S.keep - keep) { out.p.push(p); out.v.push(y[S.of]); }
        }
      } else {   // a flow: the local maxima of the state after the transient
        const r = trajectory(M, env, ctx, { P: null, points: 400 });
        const tr = S.transient ? S.transient(env) : (r.tEnd - r.t0) / 2; const vals = [];
        for (let i = 1; i + 1 < r.t.length; i++) if (r.t[i] >= r.t0 + tr && r.Y[i][S.of] > r.Y[i - 1][S.of] && r.Y[i][S.of] >= r.Y[i + 1][S.of]) vals.push(r.Y[i][S.of]);
        if (!vals.length && r.Y.length) vals.push(r.Y[r.Y.length - 1][S.of]);
        for (const v of vals.slice(-keep)) { out.p.push(p); out.v.push(v); }
      }
    }
    return out;
  }

  /* scenes — drawn in a unit frame [0, 1]² (a scene keeps one scale on both axes, the states do not), with the ranges as ticks */
  function framed(view) {
    const [x0, x1, y0, y1] = view, sx = v => (v - x0) / (x1 - x0), sy = v => (v - y0) / (y1 - y0);
    const sc = C.scene([-0.16, 1.04, -0.12, 1.04]);
    sc.poly([0, 0, 1, 0, 1, 1, 0, 1], { c: 'muted' });
    sc.txt(0, -0.08, { v: x0, c: 'muted', anchor: 'start' }); sc.txt(1, -0.08, { v: x1, c: 'muted', anchor: 'end' });
    sc.txt(-0.02, 0, { v: y0, c: 'muted', anchor: 'end' }); sc.txt(-0.02, 0.97, { v: y1, c: 'muted', anchor: 'end' });
    const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    return { sc, sx, sy, inside };
  }
  function rangeOf(xs, ys, box) {
    let view = C.fitView(xs, ys, 0.06); const w = Math.max(view[1] - view[0], 1e-12), h = Math.max(view[3] - view[2], 1e-12);
    // fitView pads both axes by the larger extent: pad each axis by its own
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) if (fin(xs[i]) && fin(ys[i])) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]); }
    if (fin(x0)) { const px = (x1 - x0) * 0.06 || Math.max(abs(x0) * 0.1, 1e-9), py = (y1 - y0) * 0.06 || Math.max(abs(y0) * 0.1, 1e-9); view = [x0 - px, x1 + px, y0 - py, y1 + py]; }
    void w; void h;
    if (box) for (let i = 0; i < 4; i++) if (fin(box[i])) view[i] = box[i];
    if (!(view[1] > view[0])) view[1] = view[0] + 1; if (!(view[3] > view[2])) view[3] = view[2] + 1;
    return view;
  }
  function phaseScene(M, env, ctx, traj, eqs) {
    const P = M.phase, xi = P.x, yi = P.y, n = M.n;
    const xs = traj.Y.map(v => v[xi]), ys = traj.Y.map(v => v[yi]);
    const view = rangeOf(xs, ys, P.box.map(f => (f ? f(env) : NaN)));
    const { sc, sx, sy, inside } = framed(view);
    if (M.kind !== 'map') {
      const { f } = makeRhs(M, ctx, null), y = new Float64Array(n), dy = new Float64Array(n), base = traj.Y.length ? traj.Y[0] : null;
      const t0 = traj.t.length ? traj.t[0] : M.solve.t0(env);
      const at = (x, yy) => { if (base) for (let i = 0; i < n; i++) y[i] = base[i]; y[xi] = x; y[yi] = yy; f(t0, y, dy); return [dy[xi] / (view[1] - view[0]), dy[yi] / (view[3] - view[2])]; };
      const G = P.field;
      if (G > 0) for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {   // the direction field (the other states at their start values)
        const u = (i + 0.5) / G, w = (j + 0.5) / G, d = at(view[0] + u * (view[1] - view[0]), view[2] + w * (view[3] - view[2])), s = Math.hypot(d[0], d[1]);
        if (!(s > 0) || !fin(s)) continue; const L = 0.38 / G; sc.seg(u, w, u + L * d[0] / s, w + L * d[1] / s, { c: 'muted', arrow: true, w: 1 });
      }
      if (P.nullclines) {   // marching squares on a 40×40 grid: x' = 0 (info), y' = 0 (warn)
        const Gn = 40, gx = new Float64Array((Gn + 1) * (Gn + 1)), gy = new Float64Array((Gn + 1) * (Gn + 1));
        for (let i = 0; i <= Gn; i++) for (let j = 0; j <= Gn; j++) { const d = at(view[0] + (view[1] - view[0]) * i / Gn, view[2] + (view[3] - view[2]) * j / Gn); gx[i * (Gn + 1) + j] = d[0]; gy[i * (Gn + 1) + j] = d[1]; }
        for (const [g, c] of [[gx, 'info'], [gy, 'warn']]) for (let i = 0; i < Gn; i++) for (let j = 0; j < Gn; j++) {
          const v = [g[i * (Gn + 1) + j], g[(i + 1) * (Gn + 1) + j], g[(i + 1) * (Gn + 1) + j + 1], g[i * (Gn + 1) + j + 1]];
          const P4 = [[i / Gn, j / Gn], [(i + 1) / Gn, j / Gn], [(i + 1) / Gn, (j + 1) / Gn], [i / Gn, (j + 1) / Gn]], cut = [];
          for (let e = 0; e < 4; e++) { const a = v[e], b = v[(e + 1) % 4]; if (fin(a) && fin(b) && (a < 0) !== (b < 0)) { const s = a / (a - b); cut.push([P4[e][0] + s * (P4[(e + 1) % 4][0] - P4[e][0]), P4[e][1] + s * (P4[(e + 1) % 4][1] - P4[e][1])]); } }
          if (cut.length >= 2) sc.seg(cut[0][0], cut[0][1], cut[1][0], cut[1][1], { c, w: 1.5 });
          if (cut.length === 4) sc.seg(cut[2][0], cut[2][1], cut[3][0], cut[3][1], { c, w: 1.5 });
        }
      }
    }
    const pts = []; for (let i = 0; i < xs.length; i++) if (fin(xs[i]) && fin(ys[i])) pts.push(sx(xs[i]), sy(ys[i]));
    if (M.kind === 'map') { for (let i = 0; i + 1 < pts.length; i += 2) sc.pt(pts[i], pts[i + 1], { c: 'hi', r: 1.5 }); }
    else if (pts.length >= 4) sc.poly(pts, { c: 'hi', closed: false });
    if (pts.length >= 2) sc.pt(pts[0], pts[1], { c: 'hi', r: 4 });
    for (const q of eqs || []) if (inside(q.y[xi], q.y[yi])) sc.pt(sx(q.y[xi]), sy(q.y[yi]), { c: q.stable === 1 ? 'ok' : q.stable === 0 ? 'bad' : 'warn', r: 5 });
    return sc.done();
  }
  function cobwebScene(M, env, ctx, traj, vi) {   // a 1-D map: x_{n+1} against x_n, the diagonal and the staircase of the orbit
    const xs = traj.Y.map(v => v[vi]).filter(fin);
    if (!xs.length) return { view: [-1, 1, -1, 1], items: [] };
    const n = M.n; const { f } = makeRhs(M, ctx, null); const y = new Float64Array(n), y1 = new Float64Array(n); const base = traj.Y[0];
    const g = x => { for (let i = 0; i < n; i++) y[i] = base[i]; y[vi] = x; f(0, y, y1); return y1[vi]; };
    let lo = Math.min(...xs), hi = Math.max(...xs); if (!(hi > lo)) { lo -= 1; hi += 1; } const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;
    const { sc, sx, sy } = framed([lo, hi, lo, hi]);
    sc.seg(0, 0, 1, 1, { c: 'muted', dash: true, w: 1 });
    const curve = []; for (let i = 0; i <= 200; i++) { const x = lo + (hi - lo) * i / 200, v = g(x); if (fin(v) && v >= lo - (hi - lo) && v <= hi + (hi - lo)) curve.push(sx(x), sy(Math.max(lo, Math.min(hi, v)))); }
    if (curve.length >= 4) sc.poly(curve, { c: 'base', closed: false });
    const N = Math.min(xs.length - 1, 300), path = [sx(xs[0]), 0];
    for (let i = 0; i < N; i++) path.push(sx(xs[i]), sy(xs[i + 1]), sx(xs[i + 1]), sy(xs[i + 1]));
    if (path.length >= 4) sc.poly(path, { c: 'hi', closed: false });
    return sc.done();
  }
  function pointsScene(xs, ys, role) {
    const { sc, sx, sy } = framed(rangeOf(xs, ys, null));
    for (let i = 0; i < xs.length; i++) if (fin(xs[i]) && fin(ys[i])) sc.pt(sx(xs[i]), sy(ys[i]), { c: role || 'base', r: 1.5 });
    return sc.done();
  }

  /* period from samples: the mean spacing of upward crossings of the mean (after the transient) */
  function samplePeriod(ts, vs) {
    const ok = vs.map((v, i) => [ts[i], v]).filter(p => fin(p[1])); if (ok.length < 4) return NaN;
    const mean = ok.reduce((s, p) => s + p[1], 0) / ok.length, cr = [];
    for (let i = 1; i < ok.length; i++) { const a = ok[i - 1][1] - mean, b = ok[i][1] - mean; if (a < 0 && b >= 0) cr.push(ok[i - 1][0] + (ok[i][0] - ok[i - 1][0]) * a / (a - b)); }
    if (cr.length < 3) return NaN;
    const k = Math.min(cr.length - 1, 5); return (cr[cr.length - 1] - cr[cr.length - 1 - k]) / k;
  }

  function run(spec, env0, opts) {
    const M = (opts && opts.prepared) || prepare(spec);
    const out = {};
    if (!M) { for (const o of list(spec && spec.outputs)) if (isObj(o)) out[o.id] = o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN; return { out, codes: [{ code: 'model', level: 'error' }] }; }
    const env = Object.assign(Object.create(null), env0 || {});
    const ctx = makeCtx(M, env, M.solve.maxSteps);
    const P = evalParams(M, env);
    const outs = objs(spec.outputs);
    const probes = outs.filter(o => o.of === 'at').map(o => C.cx(o.t)(env));
    const sweepVal = M.sweep ? M.sweep.value(env) : null; if (M.sweep) env[M.sweep.v] = sweepVal;
    const traj = trajectory(M, env, ctx, { P, probes });
    const fatal = ctx.fatal();
    const needEq = outs.some(o => ['eqCount', 'eq', 'eigRe', 'eigIm', 'eqStable', 'eqType'].includes(o.of) || o.of === 'phase');
    let eqs = null, ly = null, sw = null;
    const init = () => { const y = new Float64Array(M.n); for (const k of M.names) env[k] = NaN; for (let i = 0; i < M.n; i++) y[i] = M.init[i](env); return y; };
    if (needEq && M.eq) { if (M.sweep) env[M.sweep.v] = sweepVal; const yi = init(); if (yi.every(fin)) eqs = equilibria(M, env, ctx, yi); }
    if (M.lyap && outs.some(o => ['lyapT', 'lyapRun', 'lyap', 'lyapSum', 'kaplanYorke'].includes(o.of))) { if (M.sweep) env[M.sweep.v] = sweepVal; const yi = init(); if (yi.every(fin)) ly = lyapunov(M, env, ctx, yi); }
    if (M.sweep && outs.some(o => ['sweepParam', 'sweepValue', 'orbit'].includes(o.of))) { sw = sweep(M, env, ctx); env[M.sweep.v] = sweepVal; }
    // the invariants along the samples
    const invSeries = M.invariants.map(v => traj.Y.map((y, i) => { traj.setEnv && traj.setEnv(traj.t[i], Float64Array.from(y)); return v.f(env); }));
    const drift = invSeries.map(s => { if (!s.length) return NaN; const a = s[0], sc = Math.max(abs(a), 1); let mx = 0; for (const v of s) mx = Math.max(mx, abs(v - a)); return mx / sc; });
    drift.forEach(d => { if (d > 100 * M.solve.rtol + 1e-12 && M.kind !== 'map' && !M.events.some(e => e.set.length)) ctx.code('invariant-drift'); });
    // the aux values along the samples (on demand)
    const auxCache = new Map();
    const series = name => {
      const si = M.names.indexOf(name); if (si >= 0) return traj.Y.map(y => y[si]);
      if (auxCache.has(name)) return auxCache.get(name);
      const s = traj.Y.map((y, i) => { traj.setEnv(traj.t[i], Float64Array.from(y)); return env[name]; }); auxCache.set(name, s); return s;
    };
    const valAt = (name, y, t) => { const si = M.names.indexOf(name); if (si >= 0) return y[si]; traj.setEnv(t, Float64Array.from(y)); return env[name]; };
    const evIndex = id => M.events.findIndex(e => e.id === id);
    const xctx = { tEnd: traj.tEnd, t0: traj.t0, code: c => ctx.code(c) };
    for (const o of outs) {
      const of = o.of; let v;
      try {
        if (o.kind === 'series') {
          if (of === 't') v = traj.t.slice();
          else if (of === 'state') v = traj.Y.length ? series(o.var) : [];
          else if (of === 'eventTime') v = traj.ev[evIndex(o.event)].t.slice();
          else if (of === 'eventState') { const e = traj.ev[evIndex(o.event)]; v = e.y.map((y, i) => valAt(o.var, y, e.t[i])); }
          else if (of === 'invariant') v = invSeries[M.invariants.findIndex(x => x.id === o.var)];
          else if (of === 'lyapT') v = ly ? C.thin(ly.T, 2000) : [];
          else if (of === 'lyapRun') v = ly ? C.thin(ly.run.map(r => r[o.k - 1]), 2000) : [];
          else if (of === 'sweepParam') v = sw ? sw.p : [];
          else if (of === 'sweepValue') v = sw ? sw.v : [];
        } else if (o.kind === 'scalar') {
          if (of === 'final') v = traj.yEnd && !fatal ? valAt(o.var, traj.yEnd, traj.tStop != null ? traj.tStop : traj.tEnd) : NaN;
          else if (of === 'stat') v = traj.Y.length && !fatal ? C.stats(series(o.var))[o.stat] : NaN;
          else if (of === 'at') { const tq = C.cx(o.t)(env), y = traj.probe && traj.probe.get(M.kind === 'map' ? Math.round(tq) : tq); v = y && !fatal ? valAt(o.var, y, tq) : NaN; }
          else if (of === 'eventCount') v = traj.ev[evIndex(o.event)].t.length;
          else if (of === 'eventTime') { const ts = traj.ev[evIndex(o.event)].t, k = o.nth > 0 ? o.nth - 1 : ts.length + o.nth; v = k >= 0 && k < ts.length ? ts[k] : NaN; }
          else if (of === 'eventPeriod') { const ts = traj.ev[evIndex(o.event)].t; v = ts.length >= 2 ? ts[ts.length - 1] - ts[ts.length - 2] : NaN; if (!(ts.length >= 2)) ctx.code('period-not-found'); }
          else if (of === 'period') { v = samplePeriod(traj.t, series(o.var)); if (!fin(v)) ctx.code('period-not-found'); }
          else if (of === 'drift') v = drift[M.invariants.findIndex(x => x.id === o.var)];
          else if (of === 'eqCount') v = eqs ? eqs.length : NaN;
          else if (of === 'eq') { const q = eqs && eqs[o.index]; v = q ? valAt(o.var, q.y, traj.t0) : NaN; }
          else if (of === 'eigRe' || of === 'eigIm') { const q = eqs && eqs[o.index]; v = q && q.ev && q.ev[o.k] ? (of === 'eigRe' ? q.ev[o.k].re : q.ev[o.k].im) : NaN; }
          else if (of === 'eqStable') { const q = eqs && eqs[o.index]; v = q ? q.stable : NaN; }
          else if (of === 'eqType') { const q = eqs && eqs[o.index]; v = q ? q.type : NaN; }
          else if (of === 'lyap') v = ly ? ly.lam[o.k - 1] : NaN;
          else if (of === 'lyapSum') v = ly ? ly.lam.reduce((s, x) => s + x, 0) : NaN;
          else if (of === 'kaplanYorke') { v = NaN; if (ly) { const l = ly.lam.slice().sort((a, b) => b - a); let s = 0, j = 0; while (j < l.length && s + l[j] >= 0) { s += l[j]; j++; } v = j === 0 ? 0 : j < l.length ? j + s / abs(l[j]) : NaN; } }
          else if (of === 'quantity') { const q = M.tpl.quantities[o.name]; v = q ? q(P, xctx) : NaN; if (!fin(v)) ctx.code('template-quantity'); }
          else if (of === 'steps') v = ctx.steps;
          else if (of === 'rejected') v = ctx.rejected;
          else if (of === 'flag') v = ctx.has(o.code) ? 1 : 0;
          else if (of === 'ok') v = ctx.fatal() ? 0 : 1;
        } else {
          if (of === 'phase') v = phaseScene(M, env, ctx, traj, eqs);
          else if (of === 'cobweb') v = cobwebScene(M, env, ctx, traj, M.names.indexOf(o.var) >= 0 ? M.names.indexOf(o.var) : 0);
          else if (of === 'orbit') v = sw ? pointsScene(sw.p, sw.v, 'base') : { view: [-1, 1, -1, 1], items: [] };
          else if (of === 'section') { const e = traj.ev[evIndex(o.event)]; v = pointsScene(e.y.map((y, i) => valAt(o.x, y, e.t[i])), e.y.map((y, i) => valAt(o.y, y, e.t[i])), 'hi'); }
        }
      } catch (err) { v = undefined; }
      if (v === undefined) v = o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN;
      if (o.kind === 'series') v = C.thin(v, 2000);
      out[o.id] = v;
    }
    // the codes raised while computing the outputs (flag / ok read them before: compute those last)
    for (const o of outs) if (o.of === 'flag') out[o.id] = ctx.has(o.code) ? 1 : 0; else if (o.of === 'ok') out[o.id] = ctx.fatal() ? 0 : 1;
    return { out, codes: ctx.codes, steps: ctx.steps, nfev: ctx.nfev };
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  engine.workerSource = C.workerSource(noemaLibOdeModule, 'NoemaLibODE');
  root.NoemaLibODE = Object.freeze({
    table: { model: TABLE, outputs: { scalar: SCALARS, series: SERIES, scene: SCENES }, fields: { var: 'name', stat: 'enum:' + C.STATS.join('|'), t: 'numx', event: 'id', nth: 'int:-2000:2000', index: 'int:0:63', k: 'int:0:12', name: 'expr', code: 'enum:' + CODES.join('|'), x: 'name', y: 'name' } },   // the form of the activity author (46_lib_schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine,
    TEMPLATES: Object.freeze(TEMPLATE_NAMES.slice()), templateMeta, METHODS: Object.freeze(METHODS.slice()), CODES: Object.freeze(CODES.slice()),
    SERIES: Object.freeze(SERIES.slice()), SCALARS: Object.freeze(SCALARS.slice()), SCENES: Object.freeze(SCENES.slice()),
    eigenvalues, lambertWlog, ellipK, brent, sirFinal,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
