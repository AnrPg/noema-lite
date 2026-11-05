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
core's). Tests: `node tests/lib_simkit.js`.

| § | what | functions |
|---|---|---|
| 1 | codes and budgets | `codes(fatal)`, `budget(max)` |
| 2 | randomness | `stream(seed, name, opts)`, `subseed(seed, i)`, `dist(d)`, `DISTS` |
| 3 | the event calendar and the executive | `calendar()`, `sim(opts)` (`at`, `after`, `cancel`, `when`, `activity`, `run`, `stop`, `log`) |
| 4 | continuous time and roots | `integrate(cfg)`, `locate`, `brent`, `METHODS` |
| 5 | output analysis | `welford`, `timeAvg`, `ci`, `tq`, `batchMeans`, `mser5`, `acf`, `replicate`, `littleCheck` |
| 6 | sweeps and sensitivity | `linspace`, `oat`, `grid`, `morris`, `sobol` |
| 7 | verification | `richardson`, `conservation`, `deterministic`, `dim`, `sameDim`, `convert` |
| 8 | for engine authors | `event`, `clone`, `stepper`, `odeStepper`, `wrapRun` |
| 9 | co-simulation | `cosim(cfg)` |
| — | special functions | `lgamma`, `gammaP`, `betaI`, `normCdf`, `normInv`, `tCdf`, `tq` |

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
- `dist({dist, …})` returns `{ok, draw(r), mean, var, scv}`, the distribution objects of the engines, with the moments the queueing
  formulas need. The kinds are `const {value}`, `exp {mean | rate}`, `uniform {min, max}`, `tri {min, mode, max}`,
  `normal {mean, sd}` (clipped at 0), `lognormal {mean, sd}` (its own moments: σ² = ln(1 + sd²/m²)), `gamma {shape, scale | mean, cv}`,
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
| `stop(code)`, `log(kind, data)`, `log` | stop after the current event; the event log the learner sees (≤ `logCap`, at most 2000) |
| `codes` | `budget` (more than `maxEvents`, at most 200 000 by default), `zeno` (more than `zeno` events at one instant, 10 000 by default), `past`, `nan-time` |

## 4. Continuous time: `integrate(cfg)`

`cfg = {f(t, y, dy), y0, t0, tEnd, method, rtol, atol, dt, hmax, pairs, maxSteps, samples, onSample(t, y), events, maxEvents, gtol}`
→ `{t, y, steps, rejected, nfev, events: [{t, j, kind, dir}], stop: 'end' | 'event' | <code>, method, codes}`.

| method | what (source) |
|---|---|
| `auto` (default) | DOPRI5, switching to Rosenbrock when the stiffness test fires 15 times (HNW I §IV.2; like LSODA's switch, Petzold 1983): code `stiff-switched` |
| `dopri5` | Dormand & Prince 1980 5(4), Hairer's dense output (contd5), PI step control β = 0.04 (Hairer, Nørsett & Wanner 1993 §II.4–II.6, §IV.2); code `stiff` when the test fires |
| `rosenbrock` | the L-stable Rosenbrock 2(3) of Shampine & Reichelt 1997 (MATLAB ode23s), a finite-difference Jacobian, the ntrp23s dense output |
| `rk4`, `heun`, `euler` | fixed steps `dt`, with cubic Hermite dense output |
| `verlet`, `yoshida4` | symplectic, for a separable Hamiltonian given by `pairs: [[q, p], …]` (every state in one pair): Störmer–Verlet kick–drift–kick (Hairer, Lubich & Wanner 2006 §I.1.4) and Yoshida 1990's 4th-order triple jump |

**State events** have the form `events: [{g(t, y), dir (−1 | 0 | +1), hyst, terminal, kind, onEvent(t, y, {j, dir}) → 'stop' | undefined}]`.
After each step the sign of every g is compared with its sign at the start. A change in the event's direction is bracketed and
located on the dense output by the Illinois method (`locate`; Dowell & Jarratt 1971; Shampine, Gladwell & Thompson 2003 §2.3.2).
The step is cut at the **earliest** root. Events whose roots fall within 1e-12·t of it are **simultaneous** and fire together in
their declared order, each handler seeing the state the one before it left. A handler may change `y` in place (a jump). A
`terminal` event, or a handler that returns `'stop'`, ends the run (`stop: 'event'`).

- **Re-arming.** After a hit, a g left at about 0 (|g| ≤ `gtol`, 1e-10) takes the side its direction must leave towards, so the next
  crossing is seen even when it fits in one step: a bouncing ball. A crossing located again within 1e-9·t of the last one is the
  same crossing and is ignored.
- **Hysteresis.** With `hyst > 0`, an event stays disarmed after a hit until |g| > hyst (a thermostat with a dead band: no chattering).
- **Zeno.** More than `maxEvents` hits in all (1000 by default) or more than 100 at one instant raises the error `zeno`.
- **Codes** (errors stop the run): `nan`, `blow-up` (|y| > 10¹² times its start), `step-underflow`, `budget` (`maxSteps`, at most
  200 000), `zeno`, `bad-config` (a missing f or y0, no `dt` for a fixed method, pairs that do not cover the states).
  The warnings are `stiff` and `stiff-switched`.

`locate(g, ta, tb, ga, gb, {tol, polish})` is the Illinois root finder; with `polish` it finishes with `brent`. `brent(g, a, b, tol)`
is Brent 1973 ch. 4.

## 5. Output analysis (Law ch. 9; Banks ch. 11)

| function | what |
|---|---|
| `welford()` | `{add(x), n, mean, var, sd, min, max, sum}` (Welford 1962) |
| `timeAvg(t0, v0)` | a time-weighted average of a piecewise-constant quantity: `update(t, v)`, `add(t, dv)`, `mean(t)`, `area(t)`, `reset(t)` (the end of a warm-up), `max` (Law §1.4.1, "the area under Q(t)") |
| `ci(values, level = 0.95)` | `{n, mean, sd, half, lo, hi, level}`, the Student-t interval (half NaN when n < 2) |
| `tq(p, df)`, `tCdf(x, df)` | Student t by the incomplete beta, with the quantile by bisection + Newton (`tq(0.975, 9)` = 2.262157) |
| `batchMeans(x, nb = 20, level)` | `ci` over nb batch means, plus `batches`, `size` and `lag1` (an \|lag1\| above 0.2 means the batches are too short: Schmeiser 1982, Law §9.5.3) |
| `mser5(x)` | `{d, dBatches, short, z}`: MSER-5 warm-up (White 1997; White, Cobb & Spratt 2000; Franklin & White 2008). The series is cut in batches of 5, and d* minimises the standard error of the mean of what is left. `short` is true when d* falls in the second half (the run is too short). |
| `acf(x, k)` | the lag-k autocorrelation |
| `replicate(n, seed, fn(seedI, i) → {name: number}, level)` | independent replications (Law §9.4.1), `{name: ci}` |
| `littleCheck(L, λ, W)` | \|L − λW\| / max(L, λW), Little's law (Little 1961); a finite run has end effects of order 1/T |

**Terminating or steady state** (Law §9.3–9.5). A terminating simulation (a clinic's day) uses replications of the whole horizon.
A steady-state measure deletes a warm-up (fixed, or MSER-5) and then uses replications or batch means of one long run. `des@1`
offers both (`docs/library/des.md` §3).

## 6. Sweeps and sensitivity (Saltelli et al. 2008)

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
exports such a stepper (`NoemaLibDES.stepper`; `docs/library/des.md` §6). Its state holds closures, so `snapshot` is null: a DES
part can be chained and co-simulated but not iterated.

### 8.1 Migrating a finished engine (guide for the migration agent)

The owner's rule: the kernel's methods are the best-practice ones, so numbers may change. A migration is accepted when every science
test of the engine (its published reference values) still passes, and its regression snapshot either matches within a documented
tolerance or the change is a justified improvement.

| family | engines | what moves to the kernel |
|---|---|---|
| integrators | `ode@1`, `med@1` (pk), `clinic@1` (virtual patient), plugins `thermal@1`, `pid@1`, `twin@1`, circuit transient | `ode@1`'s `stepperDopri`, `stepperRos`, `stepperFixed`, `flow` (crossings by Illinois, jumps, the stiff switch) → `integrate`, the same algorithms, which the kernel took from `ode@1`; `brent` → `SK.brent`. Wrap as a part with `odeStepper`. Keep DDEs (the method of steps) in ode@1 on `integrate`'s dense output, or add them to the kernel later. |
| randomness | `genetics@1` (drift, Wright–Fisher), `prob@1`, any engine that calls `C.mulberry32(C.hash32(name, seed))` | `SK.stream(seed, name)`: one stream per purpose; replications via `r.sub(i)`; `binomial` and `poisson` by inversion (CRN-friendly) |
| statistics | `prob@1`, `genetics@1`, `med@1` (trials) | `SK.ci`, `tq`, `welford`, `replicate`, `batchMeans` |
| events and time | `timeline@1`, `clinic@1` (timed decisions), `music@1` (sequenced notes) | `SK.calendar()` (its tie rule), `SK.event` records for anything another part may consume |
| sweeps | `ode@1` sweep (orbit diagrams), any parameter study | `SK.grid`, `SK.oat`, `SK.morris`, `SK.sobol` |

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
