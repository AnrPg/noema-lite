# `NoemaSimKit` — the simulation kernel of the engine library (`engine/src/46_lib_simkit.js`)

The kernel holds what every engine that advances a model in time needs: random streams, an event calendar and its executive,
integrators with state events, output analysis, sweeps and sensitivity, verification helpers, the shared event record and the
stepper interface, and a co-simulation master for the "parts" orchestrator. Engines that build on it: `des@1` (discrete events,
`docs/library/des.md`), `field@1` and `agents@1` (with the spatial kit `46_lib_space.js`). The finished engines (ode, genetics, med,
clinic, …) can join through the stepper adapters of §8 without rewriting their tested code.

It is a plain module, `window.NoemaSimKit` (frozen). It loads after `46_lib_core.js` (the name sorts after it) and uses NoemaExpr's
fdlibm ports for `exp`, `log`, `sin`, `cos` and `pow`, so the numbers are the same on every device. It has no DOM, no network and no
clock. Every loop is bounded, and a run never throws: it gives NaN or an empty result and **codes**. In a Worker:
`NoemaExpr.source() + NoemaLibCore.source() + NoemaSimKit.source() + <engine module>` (`source()` returns `'(…)(self);'`, like the
core's). Tests: `node tests/lib_simkit.js` (137 assertions against published values and exact solutions).

| § | what | functions |
|---|---|---|
| 1 | codes and budgets | `codes(fatal)`, `budget(max)` |
| 2 | randomness | `stream(seed, name, opts)`, `subseed(seed, i)`, `philox`, `counterStream`, `dist(d)`, `DISTS` |
| 3 | the event calendar and the executive | `calendar()`, `sim(opts)` (`at`, `after`, `cancel`, `when`, `activity`, `run`, `stop`, `log`, `eventLog`) |
| 4 | continuous time and roots | `integrate(cfg)`, `locate`, `brent`, `METHODS` |
| 4.1 | delay equations and DAEs | `dde(cfg)`, `dae(cfg)`, `daeTheta(cfg)` |
| 4.2 | stochastic dynamics | `ssa(cfg)`, `tauLeap(cfg)`, `sde(cfg)` |
| 4.3 | schedules and time-varying arrivals | `nhpp`, `piecewise` |
| 5 | output analysis | `welford`, `ksum`, `timeAvg`, `ci`, `tq`, `batchMeans`, `mser5`, `acf`, `replicate`, `littleCheck`, `untilPrecision` |
| 5.1 | variance reduction | `controlVariate` (CRN and antithetics: §2) |
| 6 | sweeps, sensitivity, calibration and optimisation | `linspace`, `oat`, `grid`, `morris`, `sobol`, `lhs`, `minimize`, `calibrate` |
| 6.1 | input modelling | `cdfOf`, `quantileOf`, `truncated`, `mixture`, `fit`, `ksTest`, `chiSquare`, `andersonDarling` |
| 7 | verification | `richardson`, `conservation`, `deterministic`, `dim`, `sameDim`, `convert` |
| 8 | for engine authors | `event`, `clone`, `stepper`, `odeStepper`, `wrapRun` |
| 9 | co-simulation | `cosim(cfg)` |
| 4.4 | dense linear algebra | `lu`, `solve`, `inv`, `eig`, `eigSym` |
| — | special functions and tails | `lgamma`, `gammaP`, `gammaQ`, `betaI`, `betaQ`, `normCdf`, `normSf`, `normInv`, `erf`, `erfc`, `erfInv`, `erfcInv`, `tCdf`, `tSf`, `chi2Sf`, `fCdf`, `fSf`, `tq`, `digamma`, `trigamma` |

## 1. Codes and budgets

`codes(fatalList)` returns `{list, code(c, t?, info?, fatal?), has(c), fatal()}`. It keeps the first occurrence of each code
(`{code, level: 'error' | 'warning', t?, info?}`), the same shape as `ode@1`'s run context. `budget(max)` returns
`{spend(n = 1) → false once exhausted, used, left, over, cap}`. The default cap is the library's bound of 200 000.

## 2. Randomness

**Generator.** The kernel uses MRG32k3a (L'Ecuyer 1999, *Oper. Res.* 47:1), the combined multiple recursive generator of the
RngStreams package (L'Ecuyer, Simard, Chen & Kelton 2002, *Oper. Res.* 50:6). That package is the standard for simulation streams
(Arena, Simio, SSJ, MATLAB's `mrg32k3a`, R's `parallel`). Its period is about 2¹⁹¹. It has **real streams**: disjoint segments of
2¹²⁷ numbers, each cut into 2⁵¹ **substreams** of 2⁷⁶, reached by jump-ahead matrices. The kernel computes the matrices itself
(A^(2^76), A^(2^127) by squaring, mod m₁ and m₂, with exact 16-bit-split products), and the tests check them against the published
`A1p76`, `A2p76`, `A1p127` and `A2p127` of `RngStreams.c`. The test also checks the first output from the package seed (12345 × 6),
which is 0.127011122046577.

- `stream(seed, name, {antithetic?, sub?, state?})` returns `r`. Calling `r()` gives a uniform in (0, 1), never 0 or 1. The stream
  index is `seed·2³² + fnv(name)`, so every (seed, name) pair has its own stream. Use **one stream per purpose**, for example
  `arr:<source>`, `svc:<station>` and `route:<station>`. Then a change to one part of a model leaves the other draws as they were:
  that is **common random numbers** by synchronisation (Law 2015 §11.2; Banks et al. 2010 §12.4). `r.sub(i)` is substream i of the
  same stream, which is how replication i gets independent numbers. `{antithetic: true}` (or `r.anti()`) gives 1 − u: pair
  replication 2k with 2k + 1 to get **antithetic variates** (Law §11.3).
- Variates. These use **inversion**, one uniform each and monotone in u, so CRN and antithetics work: `int(n)`, `uniform(a, b)`,
  `exp(rate)`, `expMean(m)`, `normal(μ, σ)` (by Wichura's AS241 quantile), `lognormal(μ, σ)` (μ and σ of the underlying normal),
  `tri(a, c, b)`, `weibull(k, λ)`, `discrete(weights) → index`, `empirical(values, probs?)` (a continuous piecewise-linear cdf, Law
  §6.2.4, or discrete with probs), and `poisson(λ)` and `binomial(n, p)` (a sequential search, or for large means a search from the
  mode with the exact cdf there, Devroye 1986 §X.3). Two use **rejection**, so a variable number of uniforms: `gamma(k, θ)`
  (Marsaglia & Tsang 2000; k < 1 by the u^(1/k) trick) and `beta(a, b)` (two gammas). `erlang(k, mean)` takes a product of k
  uniforms. Also `shuffle(a)` (Fisher–Yates), `pick(a)` and `u53()` (53 bits from two draws).
- `subseed(seed, i)` returns a 32-bit seed (a splitmix32 finaliser).
- **Counter-based generator.** `philox(counter[4], key[2]) → [4 uint32]` is Philox4x32-10 (Salmon, Moraes, Dror & Shaw 2011, SC'11;
  the Random123 library). The test checks Random123's known-answer vectors. Its output is a pure function of (counter, key), so
  sample i costs O(1) at any time, with no state. `counterStream(seed, name, {antithetic})` gives `u(i, j = 0)` (a 53-bit uniform
  from block i, half j ∈ {0, 1}), `normal(i, j, μ, σ)` (by inversion), `exp(i, j, rate)` and `block(i)`. The key is
  (seed, fnv(name)) and the counter is (i mod 2³², ⌊i/2³²⌋, 0, 0). Use it for noise sources sampled at arbitrary instants: the
  circuit transient's resistor noise at step k is `counterStream(seed, 'noise:R1').normal(k)`.
- `dist({dist, …})` returns `{ok, draw(r), mean, var, scv}`, the distribution objects of the engines, with the moments the queueing
  formulas need. The kinds are `const {value}`, `exp {mean | rate}`, `uniform {min, max}`, `tri {min, mode, max}`,
  `normal {mean, sd}` (unclipped: a duration takes `truncated(d, 0)`, or the engine clips it and raises its own code), `lognormal {mean, sd}` (its own moments: σ² = ln(1 + sd²/m²)), `gamma {shape, scale | mean, cv}`,
  `erlang {k, mean}`, `weibull {shape, scale}`, `beta {a, b, min?, max?}`, `empirical {values, probs?}` and `discrete {values, probs?}`.
  `ok` is false (and the draws NaN) when a parameter is out of range.

## 3. The event calendar and the executive

**`calendar()`** returns `{schedule(t, kind, data, prio = 0) → id, cancel(id) → bool, peek() → t (∞ when empty), peekEntry(), pop() →
{t, kind, data, prio, seq, id} | null, size, clear()}`. It is a binary heap. **The tie rule** is: time first; at the same time the
smaller `prio` first; at the same priority the order of scheduling (FIFO by insertion `seq`). The order is fully deterministic
(Law §1.3; Banks et al. §3.1). Cancellation is lazy and costs O(1).

**`sim({tEnd, t0, maxEvents, zeno, logCap, eps})`** is the executive. It uses next-event time advance with the **three-phase rule**
(Tocher 1963; Pidd 2004): at each instant the scheduled (B) events run in calendar order, and when the instant is over the
conditional (C) events are tried until none fires.

| member | what |
|---|---|
| `now`, `events`, `pending`, `logged` | the clock, the events run, the events pending, the log entries written |
| `at(t, fn, {prio, kind, data}) → id`, `after(dt, fn, opts)` | schedule `fn(entry)` (a time before now raises `past` and runs now; NaN raises `nan-time` and is refused) |
| `cancel(id) → bool` | cancel a scheduled event |
| `when(cond(t), fn(t), {prio, once}) → id`, `unwhen(id)` | a conditional event (C phase), tried in priority order |
| `activity(dur, onDone, opts) → A` | an interruptible activity: `A.interrupt() → remaining`, `A.resume(policy, newDur?)` with policy `resume` (the remaining time), `restart` (the first duration again: "repeat identical") or `resample` (`newDur`: "repeat different"), `A.cancel()`, `A.remaining()`, `A.interrupts` (pre-emption: Law §2.7, Banks ch. 6) |
| `run(until?) → {t, events, stop}` | advance to min(until, tEnd); `stop` is `horizon`, `empty`, `stopped` (by `stop()`), `budget` or `zeno`. It can be called again to go on, which makes it a resumable stepper. |
| `stop(code)`, `log(kind, data)`, `eventLog` | stop after the current event; `log` writes an entry of the event log the learner sees, and `eventLog` is that array (≤ `logCap`, at most 2000) |
| `codes` | `budget` (more than `maxEvents`, at most 200 000 by default), `zeno` (more than `zeno` events at one instant, 10 000 by default), `past`, `nan-time` |

## 4. Continuous time: `integrate(cfg)`

`cfg = {f(t, y, dy), y0, t0, tEnd, method, rtol, atol (a number or one per component), dt, hmax, pairs, maxSteps, samples,
onSample(t, y), events, maxEvents, gtol, breaks, onSegment(seg, t0, t1), radauLinear}`
→ `{t, y, steps, rejected, nfev, events: [{t, j, kind, dir}], stop: 'end' | 'event' | <code>, method, codes}`.

| method | what (source) |
|---|---|
| `auto` (default) | DOPRI5, switching to Rosenbrock when the stiffness test fires 15 times (HNW I §IV.2; like LSODA's switch, Petzold 1983): code `stiff-switched` |
| `dopri5` | Dormand & Prince 1980 5(4), Hairer's dense output (contd5), PI step control β = 0.04 (Hairer, Nørsett & Wanner 1993 §II.4–II.6, §IV.2); code `stiff` when the test fires |
| `tsit5` | Tsitouras 2011 5(4) (*Comput. Math. Appl.* 62:2), FSAL, smaller error constants than DOPRI5, the same PI control. Dense output: Tsitouras's own quartic continuous extension of order 4 (all eight order-4 conditions hold for every θ). The test measures order 5 and the dense output's local error O(h⁵). |
| `rosenbrock` | the L-stable Rosenbrock 2(3) of Shampine & Reichelt 1997 (MATLAB ode23s), a finite-difference Jacobian, the ntrp23s dense output |
| `ros3p` | ROS3P (Lang & Verwer 2001, *BIT* 41:4): Rosenbrock of order 3, A-stable, embedded order 2, in the form of Sandu et al. 1997 (KPP). Dense output: the cubic Hermite interpolant of y₀, f(y₀), y₁, f(y₁), a continuous extension of order 3 for any method of order ≥ 3 (HNW I §II.6, (6.7)–(6.8)). Three Rosenbrock stages cannot give an order-3 continuous extension of their own (four conditions on three weights). The test measures order 3 and the dense output's local error O(h⁴). |
| `radau5` | Radau IIA of order 5 (Hairer & Wanner 1996 §IV.8, the method of RADAU5): L-stable, stiffly accurate, simplified Newton with RADAU5's transformation A⁻¹ = TΛT⁻¹: one real n × n system (γ/h − J) and one complex n × n system ((α − iβ)/h − J) per step, with the real one reused for the error estimate (HNW II §IV.8). `radauLinear: 'full'` solves the 3n × 3n real system instead. The test shows the same steps, f evaluations and results to 1e-14, and a 5× speed-up on 40 cells of a heat equation. RADAU5's error estimate; the collocation polynomial (degree 3) as dense output |
| `rk4`, `midpoint`, `heun`, `euler` | fixed steps `dt`, with cubic Hermite dense output |
| `verlet`, `yoshida4` | symplectic, for a separable Hamiltonian given by `pairs: [[q, p], …]` (every state in one pair): Störmer–Verlet kick–drift–kick (Hairer, Lubich & Wanner 2006 §I.1.4) and Yoshida 1990's 4th-order triple jump |

Stiff checks: Robertson at t = 40 (HNW II §IV.10) for `auto`, `radau5` and `ros3p`, and the stiff Van der Pol oscillator μ = 1000,
y(0) = (2, 0) at t = 2000 against the reference of the IVP test set (Mazzia & Magherini, problem VDPOL: y₁ = 1.706167732170469,
y₂ = −8.928097010248125e-4). Radau IIA meets it to 2e-9 at tolerance 1e-8 in about 1700 steps. All methods fail with `nan` at once
when f is NaN at the start of a step.

**Breaks** `breaks: [{t, apply?(t, y)}]` are times the steps land on exactly: doses, switches, a delay equation's
discontinuities. Each step aims at min(tEnd, the next break). At a break, `apply` may change y in place. The method then restarts
from the new y and keeps its step size. Breaks at t0 run before the first sample, and a sample at a break's time sees the state
after it. NaN after `apply` stops the run with `nan`. A jump made by `apply` is not reported as an event crossing.

**`onSegment(seg, t0, t1)`** is called after every accepted step, cut at an event's time when one fires. `seg(t, out)` is the
step's dense output and stays valid after the step, so a caller can keep the history (this is how `dde` reads its lagged values).

**State events** have the form `events: [{g(t, y), dir (−1 | 0 | +1), hyst, terminal, kind, onEvent(t, y, {j, dir}) → 'stop' | undefined}]`.
After each step the sign of every g is compared with its sign at the start. A change in the event's direction is bracketed and
located on the dense output by the Illinois method (`locate`; Dowell & Jarratt 1971; Shampine, Gladwell & Thompson 2003 §2.3.2).
The step is cut at the **earliest** root. Events whose roots fall within 1e-12·t of it are **simultaneous** and fire together in
their declared order, each handler seeing the state the one before it left. A handler may change `y` in place (a jump). A
`terminal` event, or a handler that returns `'stop'`, ends the run (`stop: 'event'`).

- **Re-arming.** After a hit, a g left at about 0 (|g| ≤ `gtol`, 1e-10) takes the side its direction must leave towards, so the next
  crossing is seen even when it fits in one step: a bouncing ball. A crossing located again within 1e-9·t of the last one is the
  same crossing and is ignored.
- **Observed events.** With `observe: true` an event is located and reported but changes nothing: `onEvent(t, yAt, {j, dir,
  observe: true})` gets a copy of the dense-output state, and the hit carries `observe: true`. The step is not cut and the method
  not reset. Observations are not counted towards `maxEvents` or zeno; past 200 000 they are dropped, with the warning
  `observe-cap`. Returning `'stop'` (or `terminal`) ends the run at that time. Use this for Poincaré sections, threshold
  crossings and counters.
- **Hysteresis.** With `hyst > 0`, an event stays disarmed after a hit until |g| > hyst (a thermostat with a dead band: no chattering).
- **Zeno.** More than `maxEvents` hits in all (1000 by default) or more than `maxInstant` (100) at one instant raises the error `zeno`. A crossing found again within 1e-9·t of a hit whose handler changed y is a new crossing at the same instant (a Zeno cascade such as a bouncing ball with restitution < 1). It is counted, so the run stops with `zeno` at the accumulation time. A crossing whose handler left y alone is that crossing seen again, and is ignored.
- **Codes** (errors stop the run): `nan`, `blow-up` (|y| > 10¹² times its start), `step-underflow`, `budget` (`maxSteps`, at most
  200 000), `zeno`, `bad-config` (a missing f or y0, no `dt` for a fixed method, pairs that do not cover the states).
  The warnings are `stiff` and `stiff-switched`.

`locate(g, ta, tb, ga, gb, {tol, polish})` is the Illinois root finder; with `polish` it finishes with `brent`. `brent(g, a, b, tol)`
is Brent 1973 ch. 4.

### 4.1 Delay equations and DAEs

- `dde({f(t, y, lag, dy), y0, history(t), lags, …integrate's cfg})`: constant-lag delay equations by the method of steps
  (Bellen & Zennaro 2003 ch. 3; Shampine & Thompson 2001). It is `integrate` with h ≤ the smallest lag, the finished steps kept
  through `onSegment`, and breaks at t0 + m·τ (m ≤ 5) where the start's derivative jump propagates (discontinuity tracking). Any
  method works (a fixed one needs dt ≤ the smallest lag, else `bad-config`), and so do events, breaks and samples. `lag(i, k)`
  is y_i(t − τ_k). The test checks x′ = −x(t − 1), x = 1 before 0: x(3) = −1/6 exactly (the polynomial pieces), with DOPRI5
  and RK4.
- `dae({f(t, y, z, dy), g(t, y, z, res), y0, z0, …integrate's cfg})`: a semi-explicit index-1 DAE y′ = f, 0 = g, in its state-space
  form (Hairer & Wanner 1996 §VI.1). z is solved from g = 0 by Newton at every evaluation (≤ 30 iterations, code `dae-newton`), and
  y is integrated by `integrate` (`auto` switches to Rosenbrock when the reduced system is stiff). The result adds `z`.

- `daeTheta({M, f(t, y, r), y0, t0, tEnd, dt, method: 'trapezoidal' | 'backward-euler', theta?, jac?(t, y, J), consistent?,
  newtonTol, maxNewton, breaks, samples, onSample, onStep, maxSteps})` solves M·y′ = f(t, y) with a **diagonal M whose zeros are
  algebraic rows**: nodes without capacity in a thermal network or a circuit. The result is `{t, y, steps, newton, nfev, stop, codes}`.
  - Each row with M_i ≠ 0 takes the θ-method M_i(y₁ − y₀)/h = θf_i(t₁, y₁) + (1 − θ)f_i(t₀, y₀). θ = ½ is `trapezoidal`
    (A-stable, order 2); θ = 1 is `backward-euler` (L-stable, order 1). These are SPICE's two transient methods (Nagel 1975), and the
    names match `transient.method`.
  - An algebraic row holds at the new time, f_i(t₁, y₁) = 0, so the trapezoidal rule cannot ring on it (Brenan, Campbell & Petzold
    1996 §3.1).
  - Each step is solved by Newton with LU and partial pivoting. The Jacobian is `jac`, or forward differences when it is not given.
  - A step whose Newton iteration fails is halved, up to 20 times; after that the run stops with the error `newton`.
  - Steps are fixed at `dt` and land exactly on `breaks` (switch times) and on tEnd. After a break the algebraic rows are made
    consistent again.
  - `consistent: true` first solves the algebraic rows at t0 with the differential rows held.
  - Samples are interpolated linearly.
  - Tests: on an RC circuit with a divider node, both methods reproduce their exact amplification factor (1 − hλ/2)/(1 + hλ/2) and
    1/(1 + hλ) to 1e-12, and the measured orders are 2 and 1. Robertson written as an index-1 DAE gives HNW II's values at t = 40 to
    1e-9 (trapezoidal, dt 1e-3).

### 4.2 Stochastic dynamics

- `ssa({x0, nu, propensity(x, a), tEnd, r, maxEvents, onEvent})`: Gillespie's direct method (Gillespie 1977), exact trajectories of
  the chemical master equation; `nu[j]` is reaction j's change of every species.
- `tauLeap({…ssa, tau})`: explicit τ-leaping (Gillespie 2001). Each reaction fires Poisson(a_j τ) times; a leap that would make a
  count negative is halved and retried, and when a₀τ < 10 the exact SSA step is taken (Cao, Gillespie & Petzold 2006).
- `sde({drift, diffusion, dsig?, x0, t0, tEnd, dt, method: 'em' | 'milstein', r, samples, onSample})`: Itô SDEs with diagonal
  noise by Euler–Maruyama (strong order ½) and Milstein (strong order 1; `dsig` = ∂σ_i/∂x_i) (Kloeden & Platen 1992 §10.2–10.3;
  Higham 2001). The test measures both orders on geometric Brownian motion against its exact solution on the same Wiener path.

### 4.3 Schedules and time-varying arrivals

- `nhpp(rate(t), rateMax, t0, tEnd, r, cap)` → arrival times of a nonhomogeneous Poisson process, by thinning (Lewis & Shedler
  1979; Law §8.6.2).
- `piecewise([[t, v]…], {period, step})` → v(t): a schedule (a day's arrival rates, a staffing plan), steps by default or linear,
  repeated every `period`.

### 4.4 Dense linear algebra

Matrices are arrays of rows.
- `lu(A)` → `{ok, n, det, solve(b)}`: Gaussian elimination with partial pivoting. `solve(A, b)` and `inv(A)` (null when A is
  singular) build on it.
- `eig(A)` → `{re, im, ok}`: every eigenvalue of a general real matrix, sorted by real part. The method is balancing, then
  stabilised elimination to Hessenberg form, then the Francis double-shift QR (Parlett & Reinsch 1969; EISPACK balanc/elmhes/hqr;
  Numerical Recipes 3rd ed. §11.6–11.7).
- `eigSym(A)` → `{values (ascending), vectors (columns, unit), sweeps, ok}`: cyclic Jacobi (Golub & Van Loan 4th ed. §8.5).
- Tests: the Hilbert matrix H₄ (published eigenvalues and det = 1/6 048 000), the second-difference matrix (2 − 2cos(kπ/11)), and
  companion matrices with known real and complex roots.
- An equilibrium's stability (the eigenvalues of a Jacobian, as in ode@1) is `eig(J)`. Parameter sweeps use `grid`, `oat`,
  `morris`, `sobol` and `lhs` (§6).

## 5. Output analysis (Law ch. 9; Banks ch. 11)

| function | what |
|---|---|
| `welford()` | `{add(x), n, mean, var, sd, min, max, sum}` (Welford 1962; the sum compensated) |
| `ksum()` | `{add(x), value, reset()}`: Kahan–Babuška summation in Neumaier's form (Neumaier 1974; Higham 2002 §4.3). The error is O(u)·Σ\|x\| whatever the number of terms. `welford`'s sum and `timeAvg`'s area use it. |
| `timeAvg(t0, v0)` | a time-weighted average of a piecewise-constant quantity: `update(t, v)`, `add(t, dv)`, `mean(t)`, `area(t)`, `reset(t)` (the end of a warm-up), `max` (Law §1.4.1, "the area under Q(t)") |
| `ci(values, level = 0.95)` | `{n, mean, sd, half, lo, hi, level}`, the Student-t interval (half NaN when n < 2) |
| `tq(p, df)`, `tCdf(x, df)` | Student t by the incomplete beta, with the quantile by bisection + Newton (`tq(0.975, 9)` = 2.262157) |
| `batchMeans(x, nb = 20, level)` | `ci` over nb batch means, plus `batches`, `size` and `lag1` (an \|lag1\| above 0.2 means the batches are too short: Schmeiser 1982, Law §9.5.3) |
| `mser5(x)` | `{d, dBatches, short, z}`: MSER-5 warm-up (White 1997; White, Cobb & Spratt 2000; Franklin & White 2008). The series is cut in batches of 5, and d* minimises the standard error of the mean of what is left. `short` is true when d* falls in the second half (the run is too short). |
| `acf(x, k)` | the lag-k autocorrelation |
| `replicate(n, seed, fn(seedI, i) → {name: number}, level)` | independent replications (Law §9.4.1), `{name: ci}` |
| `littleCheck(L, λ, W)` | \|L − λW\| / max(L, λW), Little's law (Little 1961); a finite run has end effects of order 1/T |
| `untilPrecision(fn(i), {gamma = 0.05, n0 = 10, nMax = 1000, level})` | the sequential procedure of Law §9.4.1: replications are added until half/\|mean\| ≤ γ/(1 + γ) → `ci` + `{reached, values}` |

### 5.1 Variance reduction (Law ch. 11)

Common random numbers and antithetic variates come from the streams (§2). `controlVariate(y, x, μX, level)` adjusts Y by a control
X with a known mean: Y − b(X − μX), b = cov(X, Y)/var(X), and returns the `ci` with `b` and the variance ratio `vr` (< 1 is a gain;
Lavenberg & Welch 1981; Law §11.4). The half-width uses n − 2 degrees of freedom, since b is estimated.

**Terminating or steady state** (Law §9.3–9.5). A terminating simulation (a clinic's day) uses replications of the whole horizon.
A steady-state measure deletes a warm-up (fixed, or MSER-5) and then uses replications or batch means of one long run. `des@1`
offers both (`docs/library/des.md` §3).

## 6. Sweeps, sensitivity, calibration and optimisation (Saltelli et al. 2008)

`axes = [{lo, hi, points}]`; `fn(x)` gets x in the model's units and returns a number (NaN when it fails). Every method has a
budget (`maxEval`), and over budget it returns `over: true` without evaluating.

- `oat(base, axes, fn, maxEval)`: one factor at a time around `base` → `[{axis, x, y}]`.
- `grid(axes, fn, maxEval)`: the full factorial grid, with the last axis fastest → `{points, y, over, total}`.
- `morris(axes, fn, {r = 10, levels = 4, seed, maxEval})`: Morris 1991 elementary effects with Δ = p/(2(p − 1)) on r random
  trajectories, giving μ, **μ\*** (Campolongo, Cariboni & Saltelli 2007) and σ. It costs r(k + 1) evaluations.
- `sobol(axes, fn, {N = 256, seed, maxEval})`: Sobol' indices by the Saltelli 2010 scheme with matrices A, B and A_B^(i). The first
  order is S_i = mean(f(B)(f(A_B^i) − f(A)))/V (Saltelli et al. 2010, *CPC* 181, Table 2 (b)), and the total is
  S_Ti = mean((f(A) − f(A_B^i))²)/(2V) (Jansen 1999). It costs N(k + 2) evaluations. The tests check the Ishigami function
  (a = 7, b = 0.1: S₁ = 0.3139, S₂ = 0.4424, S₃ = 0, S_T3 = 0.2437).
- `lhs(n, k, r)`: n points of a Latin hypercube in [0, 1)^k, one point in each of n strata per axis (McKay, Beckman & Conover 1979).
- `minimize(fn, x0, {step, lo, hi, maxEval ≤ 20 000, tol})` → `{x, f, evals, converged}`: Nelder & Mead 1965 with the standard
  coefficients (Lagarias et al. 1998); bounds by clamping; NaN counts as +∞. The test finds Rosenbrock's minimum (1, 1).
- `calibrate(model(params) → predictions, data, p0, opts)` → `{x, sse, rmse, evals, converged}`: weighted least squares
  Σ(w(pred − obs))² by `minimize`.

### 6.1 Input modelling (Law ch. 6)

- `cdfOf(d)`, `quantileOf(d)`: closed forms for exp, uniform, tri, normal, lognormal, weibull (and the gamma/Erlang cdf by `gammaP`).
- `truncated(d, lo, hi)` → `{ok, draw, exact}`: by inversion on [F(lo), F(hi)] where the quantile is known (one uniform,
  CRN-friendly; Law §8.2.1), else by rejection (≤ 1000 tries, then the nearer bound and the code `truncation`). The test checks
  the half-normal mean √(2/π).
- `mixture([{d, w}…])` → `{ok, draw, mean, var}`: a finite mixture by composition (Law §8.2.3).
- `fit(data, kind)` → a distribution `{dist, …}`: maximum likelihood for exp, normal, lognormal, gamma (Newton on
  ψ(k) − ln k = mean(ln x) − ln x̄, Choi & Wette 1969) and weibull (Newton on the profile equation, Law §6.5); moments for uniform,
  tri, erlang and beta. null when it cannot be fitted.
- Goodness of fit: `ksTest(data, d)` → `{D, p}` (Kolmogorov–Smirnov with Stephens' 1970 correction; conservative with fitted
  parameters, Law §6.6.2), `chiSquare(O, E, fitted)` → `{X2, df, p}` (Pearson, df = k − 1 − fitted), `andersonDarling(data, d)`
  → `{A2}` (Anderson & Darling 1954, tail-sensitive).

## 7. Verification (Sargent 2013, *J. Simulation* 7:1)

- `richardson(hs, values, exact?)` → `{p, extrapolated}`: the observed order of convergence, from the last two errors when the exact
  value is known, else from three solutions at a constant ratio r: p = log((f₁ − f₂)/(f₂ − f₃))/log r (Richardson 1911; Roache 1998).
- `conservation(series, tol)` → `{drift, ok}`: the largest |x − x₀| / max(1, |x₀|).
- `deterministic(fn, seed)` → true when two runs with the same seed give the same JSON. Every engine's test asserts it.
- Units: `dim('kg*m/s^2')` → `{ok, f (the factor to SI), d (the exponents of m, kg, s, A, K, mol, cd)}`. It knows the SI prefixes
  and the common derived units (N, J, W, Pa, Hz, C, V, ohm, L, min, h, d, wk, yr, bar, t, ha, cal, eV, mmHg, %), following BIPM,
  *The International System of Units*, 9th ed. 2019. `sameDim(a, b)` compares two units; `convert(v, from, to)` gives NaN when the
  dimensions differ, so an engine can report that as a `units` code. `TIME_UNITS = ['ms', 's', 'min', 'h', 'd', 'wk', 'yr']`.

## 8. For engine authors: the event record, the stepper and its adapters

**The event record**, which every engine and the orchestrator exchange, is
`event(t, source, kind, data, prio) → {t, source, kind, data, prio, seq}`. `t` is model time. `source` is the part or engine that
raised the event. `kind` is a short code such as `arrive`, `threshold` or `dose`. `data` is plain data. `prio` orders ties at the
same t (smaller first), and `seq` (the creation order) is the last tie-break. A record may carry `to: [part ids]`.

**The stepper interface** has the same argument order as the optional `stepper` of `NoemaLibCore.makeEngine`, which the parts
orchestrator (build-parts) adds:

```js
stepper = {
  id,
  init(model, inputs, ctx) → state,                       // plain data when it can be iterated (snapshot = clone)
  step(state, inputs, t, dt, ctx) → { state, out: {outputId: value}, dt?: taken ≤ dt (an early stop at a state event), events?: [records] },
  snapshot?(state) → copy, restore?(copy) → state,         // for fixed-point loops and strong coupling; null = cannot be iterated
  output?(state) → out, onEvent?(state, ev, t) → state,    // the outputs before the first step; an event from another part
}
```

`stepper(def)` wraps a definition so that it never throws. A failing step returns `{fail: 'part-failed', dt: 0}`, events are
normalised to records with `source = id`, and `snapshot` and `restore` default to `clone` (a deep copy of plain data). There are
two adapters:

- `odeStepper({id, y0(model, inputs), f(t, y, dy, inputs), method, rtol, atol, dt, pairs, events: [{kind, g(t, y, inputs), dir,
  hyst, terminal, apply(t, y, inputs)}], out(t, y, inputs)})` is for an engine whose model is x′ = f(t, x, inputs). Each step
  integrates with `integrate` over [t, t + dt], stops early at a terminal event and reports every event as a record. Its state is
  `{t, y, steps}`, which is plain data. `ode@1`, `med@1` (PK) and `clinic@1` (virtual patient) can be wrapped this way: their
  right-hand side is already a function of (t, y).
- `wrapRun(id, run(inputs, t) → out)` is for an engine with no time of its own (a formula, a chain part).

A **discrete-event engine** keeps its executive in the state: `sim().run(t + dt)` advances it and can be called again. `des@1`
exports such a stepper (`NoemaLibDES.stepper`, and passes it to `C.makeEngine({…, stepper})`, so `simEngine.create(spec).stepInit`
/ `stepTo` work in the Worker; `docs/library/des.md` §6). Its state holds closures, so `snapshot` is null: a DES part can be chained
and co-simulated but not iterated.

### 8.1 Migrating a finished engine (guide for the migration agent)

The owner's rule: the kernel's methods are the best-practice ones, so numbers may change. A migration is accepted when every science
test of the engine (its published reference values) still passes, and its regression snapshot either matches within a documented
tolerance or the change is a justified improvement.

| family | engines | what moves to the kernel |
|---|---|---|
| integrators | `ode@1`, `med@1` (pk), `clinic@1` (virtual patient), plugins `thermal@1`, `pid@1`, `twin@1`, circuit transient | `ode@1`'s `stepperDopri`, `stepperRos`, `stepperFixed`, `flow` (crossings by Illinois, jumps, the stiff switch) → `integrate` (per-component `atol`, `midpoint`, `breaks` for doses, `observe` events for sections, `onSegment`); its DDEs → `SK.dde`; `brent` → `SK.brent`. Wrap as a part with `odeStepper`. |
| stochastic | `genetics@1` (drift), `ode@1` templates with noise, any chemical kinetics | `SK.ssa`, `SK.tauLeap`, `SK.sde` |
| input and calibration | any engine that fits data or tunes parameters | `SK.fit`, `ksTest`, `chiSquare`, `andersonDarling`, `SK.minimize`, `SK.calibrate`, `SK.lhs` |
| randomness | `genetics@1` (drift, Wright–Fisher), `prob@1`, any engine that calls `C.mulberry32(C.hash32(name, seed))` | `SK.stream(seed, name)`: one stream per purpose; replications via `r.sub(i)`; `binomial` and `poisson` by inversion (CRN-friendly) |
| statistics | `prob@1`, `genetics@1`, `med@1` (trials) | `SK.ci`, `tq`, `welford`, `replicate`, `batchMeans` |
| events and time | `timeline@1`, `clinic@1` (timed decisions), `music@1` (sequenced notes) | `SK.calendar()` (its tie rule), `SK.event` records for anything another part may consume |
| sweeps | `ode@1` sweep (orbit diagrams), any parameter study | `SK.grid`, `SK.oat`, `SK.morris`, `SK.sobol` |

### 8.2 The migration, done (2026-11-07)

Every engine now takes these facilities from the kernel (each chapter's "Uses the kernel" says what): the core gives `C.kit()`
(the kernel, loaded in node when missing), `C.rng(seed, name)` (a kernel stream; a marked mulberry32 FALLBACK only without it),
`C.normal(r)` and `C.workerSource(fn, global, {kit: true})`. `ode@1`'s flows run on `integrate` (breaks, observed events, `onSegment`,
per-component atol, `maxInstant`; its snapshot bit for bit); `med@1` (Φ, Φ⁻¹, Brent, the PK stepper's RK4), `clinic@1` (stream, Brent),
`genetics@1`, `prob@1`, `graph@1`, `geom@1`, `seq@1` (+ Brent), `timeline@1` (streams); the plugins `pid@1` (RK4 with breaks, stream),
`rf@1` (streams, Brent), `twin@1` (streams), `circuit-mna@1` (the meters' streams). Kept on purpose: the θ-methods of `thermal@1` and
the circuit transient (DAEs with format-named methods), clinic@1's projected Euler, the special functions of genetics@1 and prob@1
(more accurate tails), the circuit's counter-based noise. Load order: `46_lib_simkit.js` right after `35_simexpr.js` in index.html,
first among the P6/library scripts of the bundle (tools/build.py `KERNEL`) and the harness.

## 9. Co-simulation: `cosim(cfg)`

`cosim({tEnd, dt, t0, parts: [steppers], link: {partId: (outs, t) → inputs}, order, maxMacro, iterate: {maxIter, tol}, model, inputs0})`
→ `{t, outs: {partId: out}, trace: [{t, part, out}], events: [records], codes, macro, iterations}`.

- **Macro steps and exchange.** Each part has its own local time. The master steps the parts that are furthest behind, in `order`.
  This is Gauss–Seidel: a later part sees the outputs the earlier ones produced in the same macro step, and inputs are a zero-order
  hold of the latest outputs. A macro step ends at min(t + dt, tEnd, the next event addressed to the part). The coupling error is
  first order in dt, and the test checks that halving dt halves it.
- **Rollback-free state events.** A part that meets a state event inside its step stops there and returns `dt` taken < dt asked. The
  macro step then ends at that time for every part still to step in the round, so they meet the event at its time; parts already
  ahead wait for the others. No part is ever asked to go back in time.
- **Cross-part events.** Records a part emits (with an optional `to`) are delivered to the other parts through `onEvent` at the
  start of their next step that reaches the event's time. A target already past that time gets the event at once, and the master
  records the lateness (code `late-event`, info: the largest lag). List the parts that produce events first.
- **Strong coupling (optional).** `iterate: {maxIter ≤ 50, tol}`: while every part is at the same time, each macro step is repeated
  from the parts' snapshots until the exchanged scalar outputs change by ≤ tol (relative). Otherwise the code is `no-converge`, and
  the last iterate is kept. Parts without snapshot and restore fall back to one pass (code `no-snapshot`).
- **Codes**: `bad-config`, `part-failed`, `no-progress` (a step took dt ≤ 0), `budget` (more than `maxMacro` macro steps, at most
  200 000), `late-event`, `no-converge`, `no-snapshot`.

(DEVS view: each part is an atomic model whose time advance is the macro step; Zeigler, Muzy & Kofman 2018 ch. 6 and ch. 18. For
master algorithms see Gomes et al. 2018, *ACM Comput. Surv.* 51:3, the FMI 2.0 co-simulation survey.)

## 10. Special functions and upper tails

These hold their accuracy in the tails, so `prob@1` and `genetics@1` can drop their own versions.
- `gammaQ(a, x)` is Γ(a, x)/Γ(a). For x ≥ a + 1 it uses the continued fraction (modified Lentz); below that it is 1 − the series of P,
  where P ≤ about ½, so nothing cancels. This is the split of DiDonato & Morris 1986 (*ACM TOMS* 12:4), with up to 20 000 terms
  for large a. `gammaP(a, x)` is the lower function.
- `erfc(x)` is Q(½, x²), accurate down to its underflow near x ≈ 26.5. `erf` is computed from P near 0.
- `erfcInv(p)` and `erfInv(p)` start from AS241 and take two Newton steps on erfc.
- `betaQ(a, b, x) = 1 − I_x(a, b)` comes from the same continued fraction as `betaI`, without subtracting.
- Survival functions: `normSf(z)`, `tSf(x, df)`, `chi2Sf(x, k)`, `fSf(x, d1, d2)`, plus `fCdf`. `normCdf` now takes its tail from
  `gammaQ`, so Φ(−10) = 7.619853024160527e-24 holds to 1e-13.
- Tests: erfc 5, 10 and 20 (DLMF 7.2), the exact Q(n, x) = e⁻ˣΣxᵏ/k!, and the closed-form tails of t₁, t₂, F(2, 4) and Beta(2, 3)
  far out.

