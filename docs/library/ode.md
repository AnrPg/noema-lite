# `ode@1` — dynamical systems: ODEs, delay equations and maps (`engine/src/47_lib_ode.js`, `NoemaLibODE`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`). It takes any system x′ = f(t, x) of up to 12 states written in
NoemaExpr, a delay equation with constant lags, or a map x₍ₙ₊₁₎ = g(n, xₙ). It also has 32 ready **templates**: epidemics,
pharmacokinetics, enzymes, populations, gene circuits, neurons, mechanics and chaos. It computes time series, events (crossings,
doses, Poincaré sections), equilibria with the eigenvalues of their Jacobian, Lyapunov exponents, parameter sweeps (orbit diagrams),
the drift of conserved quantities, closed-form template quantities and phase portraits (a scene).

The Python twin is `tools/lib_ode.py` (`ID`, `check_spec`, `exprs`, `keys`, and the template table `TMETA`). It checks and does not
compute, and it gives the same problems (code, path, message, level) as the JS `checkSpec`. The tests are `node tests/lib_ode.js`
(97 assertions against published values) and `node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/ode.json`,
36 specs: 12 good, 24 bad). The reference activity is `tools/activities_examples/predator-prey` (the Rosenzweig–MacArthur model,
with the carrying capacity K as a slider and the paradox of enrichment at K_c = 7/3). The research behind this chapter is in the
project's `engine-library/research/math.md` (§ ode@1) and `research/life.md` (§ ODE templates).

The engine is pure JS with no dependency. It is deterministic because the transcendental functions (exp, log, sin, cos) are
NoemaExpr's fdlibm ports, never `Math.*`, and the right-hand sides are NoemaExpr programs. It is bounded: there are at most
200 000 steps or iterations in all, every series has at most 2000 values and every scene at most 2000 items. It never throws.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "ode@1",
  "consts": { "Kmin": 2 },
  "params": [ { "id": "K", "kind": "slider", "label": "kLabel", "min": 0.5, "max": 5, "step": 0.05, "default": 4 } ],
  "model": { "template": "rm", "set": { "K": "K" },
    "solve": { "tEnd": 600, "transient": 300, "points": 600 },
    "equilibria": { "box": { "x": [0.05, 5], "y": [0.05, 3] }, "grid": 4 },
    "phase": { "x": "x", "y": "y", "field": 12 } },
  "outputs": [ { "id": "t", "kind": "series", "of": "t" },
               { "id": "prey", "kind": "series", "of": "state", "var": "x" },
               { "id": "pred", "kind": "series", "of": "state", "var": "y" },
               { "id": "swing", "kind": "scalar", "of": "stat", "var": "x", "stat": "pp" },
               { "id": "predEnd", "kind": "scalar", "of": "final", "var": "y" },
               { "id": "xStar", "kind": "scalar", "of": "quantity", "name": "xStar" },
               { "id": "Kc", "kind": "scalar", "of": "quantity", "name": "Kc" },
               { "id": "stable", "kind": "scalar", "of": "eqStable", "index": 1 },
               { "id": "portrait", "kind": "scene", "of": "phase" } ],
  "plots": [ { "kind": "series", "title": "plotTitle", "x": { "series": "t", "label": "time" }, "y": { "min": 0, "label": "density" },
               "series": [ { "y": "prey", "label": "preyLine" }, { "y": "pred", "label": "predLine" } ] },
             { "kind": "scene", "of": "portrait", "title": "phaseTitle", "height": 320 } ] }
```

This is the reference activity, shortened. Its exercise (ch01-e910) checks `K >= Kmin`, `stable == 1` and `predEnd > 0.1`: find
an enrichment that is high enough without destabilising the equilibrium.

- **Numbers.** Every number of the model is a **numx**: a number, or an expression over the spec's names (consts, params,
  derived). Equations (`rhs`, `next`, `aux`, `delays[].of`, `events[].when`, `invariants[].expr`) also see the model's **local
  names**: the states, the aux variables, the lagged states, the template's parameters, the sweep variable, and `t` (`n` for a map).
  `exprs(spec)` lists every expression as `[source, path, local names]`. Expressions outside the equations (`set`, `init`, `tau`,
  `history`, `at`, `every`, the solve fields, the box, the lyapunov and sweep ranges, the phase bounds and an output's `t`) see only
  the spec's names. `keys(spec)` is empty: the engine has no text of its own, and its scenes use numbers and roles only.
- **Outputs**: `{id, kind, of, …arguments}`. `of` must be something the model computes (§4) and `kind` must be its kind (series,
  scalar or scene). Otherwise the error is `output`, with the message "ode@1 computes as a scalar: …".
- **Runtime.** `run(spec, env, {seed})` returns `{out, codes, steps, nfev}`. The adapter `engine.create(spec).run(inputs)` gives
  the declared outputs by id. When a spec does not stand, the scalars are NaN and the series and scenes are empty. A run never
  throws.

### 1.1 The model

| field | type | meaning |
|---|---|---|
| `kind` | `ode` (default) \| `map` \| `dde` | a flow, a map, a delay equation; a template fixes it |
| `template` | name | one of the 32 templates (§3); it gives the states, equations and events |
| `set` | map → numx | values for the template's parameters (the rest keep their defaults) |
| `states` | list 1–12, `{id, init}` | the state variables and their initial values (numx) |
| `rhs` | map state → expr | x′ for a flow or a delay equation; every state needs one |
| `next` | map state → expr | x₍ₙ₊₁₎ for a map |
| `aux` | list ≤ 24, `{id, expr}` | named intermediate expressions, evaluated in order before the equations; with a template they are added to its own |
| `delays` | list ≤ 4, `{id, of, tau, history?}` | `id` = the state `of` at t − τ (τ > 0 numx); `history` is the value before t0 (default: the initial value) |
| `events` | list ≤ 8 | `{id, when, dir?, set?, stop?}`: a sign change of `when` (`dir` −1, 0, 1); or `{id, at, every?, count?, set?, stop?}`: a time; `set` maps a state to its new value (expressions of the states before the jump) |
| `pairs` | list `{q, p}` | position–momentum pairs; `verlet` and `yoshida4` need them, and q′ must not depend on q |
| `invariants` | list ≤ 4, `{id, expr}` | quantities that should be conserved; their drift is an output |
| `solve` | object, required | §1.2 |
| `equilibria` | object | `{box?: {state: [lo, hi]}, grid? 1–16 (3)}`: Newton from the initial state and from a grid of grid^(states in the box) ≤ 512 points |
| `lyapunov` | object | `{k? 1–4 (1), every? (0.1), transient? (0)}` |
| `sweep` | object | `{var, value, min, max, points? 2–400 (200), of, keep? 1–200 (50), transient?}` (§4.5) |
| `phase` | object | `{x, y, xmin?, xmax?, ymin?, ymax?, field? 0–25 (15), nullclines? (true)}` (§4.6) |

A map has no events and no delays. A name is used once in the model and must not be a spec name; otherwise the error is
`dup-name`. For example, `pk` has the aux `k`, so a spec param `k` clashes with it.

### 1.2 `solve`

| field | type | default | meaning |
|---|---|---|---|
| `t0`, `tEnd` | numx | 0, required | the interval; for a map, the number of iterations is tEnd − t0 |
| `method` | enum | `auto` | `auto dopri5 rosenbrock rk4 heun midpoint euler verlet yoshida4` |
| `dt` | numx | — | the step of a fixed-step method (required for them) |
| `hmax` | numx | tEnd − t0 | the largest adaptive step |
| `rtol`, `atol` | pos | 1e-6, 1e-9 | the tolerances of the adaptive methods |
| `points` | int 2–2000 | 400 | the samples of every series, evenly spread over [t0 + transient, tEnd] |
| `maxSteps` | int 1–200 000 | 50 000 | the budget: steps, iterations, the Lyapunov and sweep runs together |
| `transient` | numx | 0 | the time that is not sampled (for stats, periods and the portrait) |

The static checks also verify the budget. A fixed step must satisfy (tEnd − t0)/dt ≤ maxSteps; a constant tEnd for a map must be
within maxSteps; a map sweep must satisfy points × (transient + keep) ≤ maxSteps. Each of these is reported as `budget`.

### 1.3 Checker codes (`checkSpec`, the same in `tools/lib_ode.py`)

| code | when |
|---|---|
| `format` | `model` or a shape is not an object or a list |
| `value` | a missing required field; a value of the wrong kind; a template parameter that does not exist; a state without an equation; a reference to something that is not a state, event or invariant; `rhs` on a map, `next` on a flow |
| `enum` | `kind`, `template`, `method`, `stat` |
| `size` | a list too long or too short |
| `dup-name` | a name used twice in the model, or also a spec name |
| `event` | `when` and `at` together (or neither); `every`/`count` without `at`; `dir` without `when`; events on a map |
| `method` | a fixed-step method without `dt`; `verlet` or `yoshida4` without `pairs` |
| `budget` | the static budgets above, and grid^(box dims) > 512 |
| `unknown-field` (warning) | a field the model does not know |
| `output` | an `of` the model does not compute, a kind it does not give, a missing or wrong argument (`var`, `event`, `index`, `k`, `name`, `code`, `stat`) |

## 2. Methods

| method | order | source | use |
|---|---|---|---|
| `dopri5` | 5(4), dense output of order 4 | Dormand & Prince 1980 (J. Comput. Appl. Math. 6:19); Hairer, Nørsett & Wanner, *Solving ODEs I*, 2nd ed. 1993, §II.4–II.6 (the DOPRI5 code, PI step control with β = 0.04, the `contd5` interpolant) | the default for non-stiff flows |
| stiffness test | — | HNW I §IV.2: h·ρ > 3.25 fifteen times, ρ estimated from the last stages | `auto` switches to Rosenbrock (`stiff-switched`); `dopri5` reports `stiff` |
| `rosenbrock` | 2(3), L-stable, dense output | Shampine & Reichelt 1997 (SIAM J. Sci. Comput. 18:1; MATLAB `ode23s`): d = 1/(2 + √2), e32 = 6 + √2; the Jacobian by finite differences; `ntrp23s` interpolation | stiff kinetics (Robertson), relaxation oscillators |
| `euler`, `heun`, `midpoint`, `rk4` | 1, 2, 2, 4 | Euler 1768; Heun 1900; Runge 1895; Kutta 1901 | teaching the error and the order; samples by cubic Hermite |
| `verlet` | 2, symplectic | Störmer–Verlet, kick-drift-kick (Hairer, Lubich & Wanner, *Geometric Numerical Integration*, 2nd ed. 2006, §I.1) | Hamiltonian pairs; the energy error stays bounded |
| `yoshida4` | 4, symplectic | Yoshida 1990 (Phys. Lett. A 150:262), the triple jump of Verlet | the same, more accurately |
| delay equations | — | the method of steps on DOPRI5's dense output, h ≤ τ_min, breakpoints t0 + kτ (k ≤ 5) hit exactly (Bellen & Zennaro, *Numerical Methods for Delay Differential Equations*, 2003; Shampine & Thompson 2001) | `dde` |
| events | — | sign changes of `when` located on the dense output by the Illinois method (Dowell & Jarratt 1971); timed events stepped to exactly | crossings, doses, sections |
| equilibria | — | damped Newton (Armijo halving) with a forward-difference Jacobian; the Jacobian at the root by central differences; eigenvalues by balancing, Hessenberg reduction and the shifted QR of *Numerical Recipes* 2nd ed. 1992, §11.5–11.6 (`balanc`, `elmhes`, `hqr`) | `eq`, `eigRe`, `eigIm`, `eqStable`, `eqType` |
| Lyapunov exponents | — | Benettin, Galgani, Giorgilli & Strelcyn 1980 (Meccanica 15:9): k tangent vectors by directional differences, Gram–Schmidt every Δt (0.1, every iteration for a map), tangent atol min(atol, 1e-12) | `lyap`, `lyapSum`, `kaplanYorke` (Kaplan & Yorke 1979) |
| closed forms | — | Lambert W from its logarithm by Newton (Corless et al. 1996); K(k) by the AGM (DLMF §19.8); Brent 1973 root finding; the SIR final-size equation (Kermack & McKendrick 1927) | template quantities |

With `auto`, the run starts with DOPRI5. When the stiffness test fires, it carries on from the same point with Rosenbrock.
Accuracy is a matter of the tolerances: the error of an adaptive run is roughly rtol × the size of the state, accumulated over the
run. For a chaotic system, individual trajectories are not accurate beyond a few Lyapunov times, but their statistics are.

## 3. Templates

Each template is a model with defaults. `set` changes its parameters, and `aux`, `events`, `invariants`, `equilibria`, `lyapunov`,
`sweep` and `phase` may be added. **Quantities** (`of: quantity, name`) are closed forms evaluated at the current parameters, so a
test or an exercise can compare the integration with the theory. A closed form that does not apply is NaN with the code
`template-quantity`, for example the SIR final size with births (μ > 0).

| template | kind | states | parameters (defaults in the code) | events · invariants | quantities | source |
|---|---|---|---|---|---|---|
| `sir` | ode | S I R | beta gamma mu N I0 Rinit | peak (I′ = 0) · total | R0 herd finalSize peakI Sstar Istar period | Kermack & McKendrick 1927; Keeling & Rohani 2008 ch. 2 |
| `seir` | ode | S E I R | beta sigma gamma mu N E0 I0 | · total | R0 herd growth | Anderson & May 1991; Wallinga & Lipsitch 2007 |
| `sirs` | ode | S I R | beta gamma omega N I0 | · total | R0 Istar | Keeling & Rohani 2008 §2.1.2 |
| `pk` | ode | Ag Ac (aux C k) | dose V CL ka F tau doses rate Tinf | dose, infusionEnd | k thalf AUC tmax Cmax Racc CssMax CssMin Cavg Css loading | Bateman 1910; Rowland & Tozer 2019 |
| `pk2` | ode | A1 A2 (aux C) | dose V1 k10 k12 k21 | | alpha beta A B Vss thalfBeta | Gibaldi & Perrier 1982 ch. 2 |
| `mm` | ode | S P (aux v) | Vmax Km S0 I Ki Kiu (0 = absent) | · mass | KmApp VmaxApp v0 Sexact IC50 | Michaelis & Menten 1913; Schnell & Mendoza 1997; Cornish-Bowden 2012 |
| `mmfull` | ode | E S Cx P | k1 km1 k2 E0 S0 | · enzyme, substrate | Km Vmax qssaRatio | Briggs & Haldane 1925; Segel & Slemrod 1989 |
| `logistic` | ode | N | r K N0 | | Nexact tInflect maxRate doubling | Verhulst 1838 |
| `gompertz` | ode | N | r K N0 | | Nexact Ninflect tInflect | Gompertz 1825; Laird 1964 |
| `allee` | ode | N | r K A N0 | | threshold | Allee 1931; Courchamp et al. 2008 |
| `lv` | ode | x y | alpha beta gamma delta x0 y0 | cycle · H | xStar yStar smallPeriod | Lotka 1925; Volterra 1926 |
| `rm` | ode | x y (aux fr) | r K a h eff m x0 y0 | cycle | xStar yStar Kc | Rosenzweig & MacArthur 1963; Rosenzweig 1971 |
| `competition` | ode | N1 N2 | r1 r2 K1 K2 a12 a21 N10 N20 | | outcome (1 N1 wins, 2 N2 wins, 3 coexistence, 4 bistable) N1star N2star | Lotka 1925; Gause 1934 |
| `chemostat` | ode | S X (aux mu) | mumax Ks Y Sin D S0 X0 | | Sstar Xstar Dc Dopt | Monod 1950; Novick & Szilard 1950 |
| `toggle` | ode | u v | a1 a2 beta gamma iptg Kd eta u0 v0 | | | Gardner, Cantor & Collins 2000 |
| `repressilator` | ode | m1 m2 m3 p1 p2 p3 | alpha alpha0 beta nH m10 m20 m30 | cycle | | Elowitz & Leibler 2000, Box 1 |
| `hh` | ode | V m h nK | I Ipulse tOn tDur temp gNa gK gL ENa EK EL Cm | spike, pulseOn, pulseOff | phi | Hodgkin & Huxley 1952 (rest −65 mV) |
| `fhn` | ode | v w | a b eps I v0 w0 | spike | IH1 IH2 | FitzHugh 1961; Nagumo et al. 1962 |
| `pendulum` | ode | theta omega (pairs) | g L q F w theta0 omega0 | turn · E | T0 T ratio | DLMF §19.2; Baker & Gollub 1996 |
| `lorenz` | ode | x y z | sigma rho beta x0 y0 z0 | zmax | rhoH Cx divergence | Lorenz 1963 |
| `rossler` | ode | x y z | a b c x0 y0 z0 | section | | Rössler 1976 |
| `vdp` | ode | x y | mu x0 y0 | up | relaxPeriod | van der Pol 1926; Strogatz 2015 §7.5 |
| `brusselator` | ode | x y | A B x0 y0 | up | Bhopf xStar yStar | Prigogine & Lefever 1968 |
| `duffing` | ode | x v | delta alpha beta gamma omega x0 v0 | strobe (every forcing period) | forcingPeriod | Duffing 1918; Guckenheimer & Holmes 1983 |
| `robertson` | ode | y1 y2 y3 | k1 k2 k3 | · mass | | Robertson 1966; Hairer & Wanner 1996 §IV.1 |
| `arenstorf` | ode | x y vx vy | mu x0 vy0 | | period | Arenstorf 1963; HNW I §II.0 |
| `kepler` | ode | x y vx vy (pairs) | GM x0 y0 vx0 vy0 | · energy, angmom | period | Hairer, Lubich & Wanner 2006 §I.2 |
| `logisticmap` | map | x | r x0 | | fixedPoint r2 feigenbaum | May 1976; Feigenbaum 1978 |
| `ricker` | map | x | r x0 | | fixedPoint flip | Ricker 1954 |
| `henon` | map | x y | a b x0 y0 | | fpX | Hénon 1976 |
| `delaylogistic` | dde | x (lag xd) | r K tau x0 | up | tauHopf | Hutchinson 1948 |
| `mackeyglass` | dde | x (lag xd) | beta gamma nH tau x0 | | | Mackey & Glass 1977 |

Notes on the templates:

- `pk` runs in amounts: Ag is the gut, Ac the central compartment, and C = Ac/V. It covers an IV bolus (ka = 0), oral dosing
  (Bateman), repeated doses (`tau`, `doses`: a timed event adds F·dose to the depot, or dose to Ac when ka = 0) and a zero-order
  infusion (`rate` for `Tinf`). The steady-state formulas assume many doses. When ka = k, the Bateman formula divides by zero, so the
  limit is used and the code `degenerate-closed-form` is raised.
- `mm` covers the inhibitions by Ki (competitive) and Kiu (uncompetitive); both together give mixed or noncompetitive inhibition,
  and 0 means absent. Sexact is Km·W((S0/Km)·e^((S0 − V·t)/Km)) at tEnd, without inhibition.
- `hh` uses the modern sign convention with rest at −64.996 mV. The rate functions have removable singularities (at V = −40 and
  −55 mV), which are evaluated by their limits. `temp` scales the rates by φ = 3^((T − 6.3)/10). A pulse `Ipulse` is applied
  between tOn and tOn + tDur.
- `pendulum` with q = F = 0 is the free pendulum. T is 4K(sin(θ0/2))·√(L/g) and ratio is T/T0. The event `turn` (ω crosses
  downward) measures the period.

## 4. Outputs

### 4.1 Series (`kind: series`, at most 2000 values)

| of | arguments | meaning |
|---|---|---|
| `t` | | the sample times (or iteration numbers) after the transient |
| `state` | `var` (a state or aux) | its values at the sample times |
| `invariant` | `var` (an invariant) | its values at the sample times |
| `eventTime` | `event` | the times of every occurrence (≤ 2000) |
| `eventState` | `event`, `var` | the state at every occurrence: a Poincaré section, a stroboscopic map |
| `lyapT`, `lyapRun` | `k` | the running estimate of λ_k against time (convergence) |
| `sweepParam`, `sweepValue` | | the orbit diagram as pairs (parameter, value), at most 2000 pairs |

### 4.2 Scalars

| of | arguments | meaning |
|---|---|---|
| `final` | `var` | the value at tEnd (at the stop, when an event stopped the run) |
| `stat` | `var`, `stat` | `final min max mean pp rms` over the samples after the transient (pp = max − min) |
| `at` | `var`, `t` (numx) | the value at the time t (dense output) |
| `period` | `var` | from the upward mean crossings of the samples: the mean of the last ≤ 5 periods; NaN with fewer than 3 crossings (`period-not-found`) |
| `eventCount` | `event` | the number of occurrences |
| `eventTime` | `event`, `nth` (±1–2000) | the nth occurrence (−1 is the last) |
| `eventPeriod` | `event` | the mean spacing of the last ≤ 5 occurrences after the transient: a period found to the tolerance of the integration |
| `drift` | `var` (an invariant) | max \|I(t) − I(t0)\| / max(\|I(t0)\|, 1) |
| `eqCount` | | the number of distinct equilibria (fixed points for a map) |
| `eq` | `index`, `var` | the equilibria, sorted by their first state, then the next |
| `eigRe`, `eigIm` | `index`, `k` | the eigenvalues of the Jacobian at equilibrium i, sorted by decreasing real part, then imaginary part |
| `eqStable` | `index` | 1 stable, 0 unstable, 0.5 not hyperbolic (\|Re λ\| ≤ 1e-7·max\|λ\|; \|λ\| = 1 ± 1e-9 for a map) |
| `eqType` | `index` | 1 saddle, 2 stable node, 3 unstable node, 4 stable focus, 5 unstable focus, 6 centre (purely imaginary), 7 other non-hyperbolic |
| `lyap` | `k` | the kth Lyapunov exponent (per time unit; per iteration for a map) |
| `lyapSum`, `kaplanYorke` | | Σλ (the mean divergence of the flow) and the Kaplan–Yorke dimension |
| `quantity` | `name` | a template quantity (§3) |
| `steps`, `rejected` | | the accepted and rejected steps of the main run |
| `flag` | `code` | 1 when the run raised that code (§5), otherwise 0 |
| `ok` | | 1 when no error code was raised |

Equilibria of a delay equation are those of the system with every lag equal to the state. Their eigenvalues are not computed,
because the characteristic equation of a DDE is transcendental, so `eqStable` is NaN for them.

### 4.3 Scenes (`kind: scene`)

The states have their own units, but a scene keeps one scale on both axes. The engine therefore draws a scene in a unit frame
[0, 1]², with the ranges of the axes written as numbers at the corners (role `muted`).

| of | arguments | needs | items |
|---|---|---|---|
| `phase` | | `model.phase` | the frame; the direction field (`seg` with arrows, role `muted`, field × field); the nullclines x′ = 0 (`info`) and y′ = 0 (`warn`), traced by marching squares on a 40 × 40 grid; the equilibria in the frame (`ok` stable, `bad` unstable, `warn` non-hyperbolic); the trajectory after the transient (`hi`, an open polyline) |
| `cobweb` | `var` | a one-state map | the frame, the diagonal, the graph of the map, the cobweb steps |
| `orbit` | | `model.sweep` | the orbit diagram as points |
| `section` | `event`, `x`, `y` | an event | the event states as points: a Poincaré section |

In a system with more than two states, the phase field and the nullclines are drawn with the other states fixed at their initial
values.

### 4.4 Equilibria

Newton starts from the initial state and from the points of the box grid. A root is accepted when ‖F‖ ≤ 1e-13·max(1, ‖x‖), or when
the Newton step is negligible and ‖F‖ ≤ 1e-8·max(1, ‖x‖). Duplicates within 1e-7 (relative) are merged. With no box, only the
initial state is tried, so give a box to find all the equilibria.

### 4.5 Sweeps

`sweep.var` is a local name that the equations use. In the ordinary run it takes the value `value`, and the sweep sets it in turn
to `points` values from `min` to `max`. For a map, the sweep keeps the last `keep` iterates after `transient` (default 500). For a
flow, it keeps the local maxima of `of` after the transient (default half the interval). The total is capped at 2000 pairs and is
part of the budget.

### 4.6 Lyapunov exponents

The exponents are computed after `lyapunov.transient`, over the rest of [t0, tEnd]. An estimate over less than 10 renormalisations,
or less than 50/|λ| time units (50 iterations for a map), raises `lyap-short`. Check the convergence with the series `lyapRun`.

## 5. Runtime codes

The errors stop the run. The outputs computed so far are cut at that point, and the rest are NaN. Notes do not stop the run. Every
code is also a `flag`.

| code | level | when |
|---|---|---|
| `nan` | error | the right-hand side, the initial state or a jump gives NaN or ±∞ |
| `blow-up` | error | the state grows beyond 1e12 × its initial size (finite-time blow-up, e.g. y′ = y², at t ≈ 1) |
| `step-underflow` | error | the adaptive step falls below 10·ε·\|t\| (a singularity) |
| `budget` | error | more than maxSteps steps or iterations |
| `time` | error | tEnd ≤ t0 at run time, or a range that is not finite |
| `map-escape` | error | a map leaves every bound (\|x\| > 1e100 or NaN) |
| `zeno` | error | more than 2000 state jumps (a bouncing ball whose bounces accumulate) |
| `stiff` | note | DOPRI5 (chosen explicitly) found the problem stiff; expect a budget error or a slow run |
| `stiff-switched` | note | `auto` switched to Rosenbrock |
| `event-limit` | note | more than 2000 occurrences of an event; only the first 2000 are kept |
| `stopped` | note | a terminal event stopped the run |
| `newton` | note | no equilibrium was found |
| `non-hyperbolic` | note | an equilibrium has an eigenvalue on the stability boundary: linearisation does not decide |
| `eigen` | note | the QR iteration did not converge |
| `lyap-short` | note | the Lyapunov estimate is too short to trust |
| `invariant-drift` | note | an invariant drifted by more than 100·rtol (no jumping events): the method or the step does not keep it |
| `period-not-found` | note | `period` found fewer than 3 crossings |
| `template-quantity` | note | a closed form that does not apply to these parameters |
| `degenerate-closed-form` | note | a closed form at its removable singularity (pk with ka = k): the limit is used |

## 6. Validity and limits

- There are at most 12 states, 24 aux, 4 delays, 8 events and 4 invariants, and 200 000 steps in all.
- Delays are constant (τ may depend on parameters but not on the state). Neutral equations (lags in the derivative) are not
  covered.
- `verlet` and `yoshida4` assume a separable Hamiltonian: q′ depends on p only and p′ on q only. The checker cannot verify this, so
  a non-separable system gives a non-symplectic, first-order-like result.
- The stiff solver is of order 2. For tight tolerances on a stiff problem it needs many steps; Robertson to t = 1e11 takes about
  1000.
- Events are found by the sign of `when` between steps. Two sign changes inside one step are missed, so lower `hmax` when an
  event can be grazing.
- A Jacobian by finite differences is accurate to about √ε of the scale of the state, so eigenvalues near zero (|Re λ| ≲ 1e-7 of
  the largest) count as non-hyperbolic.

## 7. Reference values asserted by `tests/lib_ode.js`

| check | value | tolerance | source |
|---|---|---|---|
| y′ = −y, y(1) | e⁻¹ = 0.36787944117144233 | rel 1e-9 | exact |
| orders Euler, Heun, midpoint, RK4 | 1, 2, 2, 4 | ±0.1 (RK4 ±0.15) | theory |
| pendulum T/T0, θ0 = π/2 and 3 | 1.1803405990160962, 2.5712339494321420 | 1e-8, 1e-7 | DLMF 19.2 (2K(sin θ0/2)/π) |
| Arenstorf orbit, T = 17.0652165601579625… | returns to (0.994, 0) | 1e-7 at rtol 1e-12 | HNW I §II.0 |
| Robertson t = 40 | 0.7158270687, 9.185534764e-6, 0.2841637457 | rel 1e-6, 1e-5 | HNW II §IV.10 |
| Robertson t = 1e11, y1 | 2.08334e-8 | rel 2 % | HNW II |
| van der Pol μ = 1, period | 6.6632868593 | 1e-7 | Strogatz §7.5 |
| van der Pol μ = 1000, period | ≈ (3 − 2 ln 2)μ = 1613.7 | 1 % | relaxation limit |
| Brusselator A = 1, B = 3, period | 7.15691992 | 1e-6 | integration at rtol 1e-12 |
| Lorenz C± | (±√72, ±√72, 27) | 1e-9 | Lorenz 1963 |
| Lorenz ρ_H | 470/19, Re λ = 0 | 1e-8 | Sparrow 1982 |
| Lorenz spectrum | 0.9056, 0, −14.5723; Σ = −41/3; D_KY 2.06 | 0.03; 1e-5 | Sprott 2003; Liouville |
| logistic map r = 4, λ | ln 2 | 0.005 | conjugacy to the tent map |
| Hénon (1.4, 0.3) | λ1 0.4192, λ1 + λ2 = ln 0.3, x* 0.6313544770895047 | 0.003, 1e-6, 1e-12 | Sprott 2003; Hénon 1976 |
| delayed logistic | stable at τ = 1, oscillating at τ = 1.7 (Hopf at rτ = π/2) | | Hutchinson 1948 |
| SIR R0 = 2 final size; R0 = 3 peak | 0.79681213; 0.30046257 | 5e-6; 2e-6 | Kermack & McKendrick 1927 |
| SEIR β = 1, σ = 0.2, γ = 0.1 | R0 = 10; (1 + r/σ)(1 + r/γ) = R0 | 1e-12; 1e-9 | Wallinga & Lipsitch 2007 |
| IV bolus D 100, V 10, CL 2 | C(5) = 3.67879441, t½ 3.4657359, AUC 50 | 1e-7 | Rowland & Tozer 2019 |
| oral ka = 1, k = 0.2 | t_max 2.01180, C_max 6.68740 | 1e-5 | Bateman 1910 |
| two-compartment | α 0.544949, β 0.055051, A 9.08248, B 0.91752, C(5) 1.29222 | 1e-5 | Gibaldi & Perrier 1982 |
| Michaelis–Menten Km 2, V 1, S0 10 | S(5) = 6.016243922935495 | 1e-9 | Schnell & Mendoza 1997 (Lambert W) |
| inhibitions at V = Km = S = I = Ki | competitive and uncompetitive v = 1/3, noncompetitive 1/4 | 1e-15 | Cornish-Bowden 2012 |
| logistic / Gompertz r 0.5, K 1000, N0 10, t 10 | 599.860 / 969.447 | 1e-3 | closed forms |
| chemostat | S* 0.5, X* 4.75, D_c 0.952381 | 1e-6 | Monod 1950 |
| toggle α = 10, n = 2 | 0.10102, 2 (saddle), 9.89898 | 1e-8 | Gardner et al. 2000 |
| repressilator | period 43.45, peak p 59.2 | 1 % | Elowitz & Leibler 2000 |
| Hodgkin–Huxley | rest −64.996 mV; 68 Hz at 10 µA/cm²; all-or-none between 5 and 10 µA/cm² for 1 ms | 0.01 mV; 1 Hz | Hodgkin & Huxley 1952 |
| FitzHugh–Nagumo | rest (−1.19941, −0.62426); I_H 0.33128, 1.41872; period 39.47 | 1e-5; 0.5 % | FitzHugh 1961 |
| Rosenzweig–MacArthur | x* = 2/3, K_c = 7/3 | 1e-9 | Rosenzweig 1971 |
| Lotka–Volterra from (2, 1) | period 6.6085, H kept to 1e-8 | 1e-3 | Volterra 1926 |
| bouncing ball, e = 0.8 | Zeno time √(2/g)(1 + 2e/(1 − e)) | 1e-3 | elementary |

The tests also check every runtime code, the checker codes, the Python twin's tables (TMETA, codes, methods and output names),
the sim adapter, the Worker source in a fresh global (the same outputs, bit for bit), the speed (the reference activity runs in
under 50 ms; a Lorenz spectrum and a 200 000-iteration orbit diagram each run in under 2 s), and the cases of the reference
activity's `tests.json`.

## Uses the kernel

Since 2026-11-07 every flow runs on the simulation kernel `NoemaSimKit.integrate` (`docs/library/simkit.md` §4): its DOPRI5 with the stiffness switch to Rosenbrock (`auto`), Rosenbrock 2(3), the fixed steps (`rk4`, `heun`, `midpoint`, `euler`) and the symplectic ones (`verlet`, `yoshida4`); the events — a crossing with `set` or `stop` is a kernel event (located by Illinois on the dense output, the step cut there, simultaneous events in order, re-armed after a jump, `zeno` past 2000 jumps: `maxEvents`/`maxInstant`), one without is an *observed* event (recorded, the step goes on); timed events (doses, `every`), the propagated discontinuities of a delay equation and the renormalisations of the Lyapunov exponents are the kernel's `breaks`; a delay equation's history is the kernel's dense output of each step (`onSegment`, the mechanism of `SK.dde`); per-component tolerances (`atol` as an array) for the tangent vectors. Roots (the SIR final size) by `SK.brent`. ode@1's own steppers and driver are gone (about 230 lines). The regression snapshot (`tests/fixtures/enginelib/snapshots/ode.json`) holds bit for bit: the kernel's methods are the same code. The Worker source carries the kernel (`C.workerSource(…, {kit: true})`). Still ode@1's own: the map iteration, Newton for equilibria with its LU, the eigenvalues and the sweep loop.
