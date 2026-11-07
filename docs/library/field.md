# `field@1` — fields on grids and cellular automata (`engine/src/47_lib_field.js`, `NoemaLibField`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`): how a quantity **spreads** (heat, diffusion), **travels**
(advection), **waves**, **reacts** (reaction–diffusion, Turing patterns, travelling fronts) or **settles** (Poisson, Laplace) on a
uniform 1-D or 2-D grid, and the classic **cellular automata**. It is built on `NoemaSpaceKit` (`docs/library/space.md`: grids,
ghost-node boundary conditions, stencils, von Neumann analysis, scenes) and `NoemaSimKit` (`docs/library/simkit.md`: the event
calendar of interrupts, seeded streams, codes, the stepper).

Python twin: `tools/lib_field.py` (`ID`, `check_spec`, `exprs`, `keys`, the lists `CODES`, `SERIES`, `SCALARS`, `SCENES`,
`EQUATIONS`, `METHODS`, `CA_RULES`, `KINETICS`): the same problems (code, path, message, level) as the JS `checkSpec`; it does not
compute. Tests: `node tests/lib_field.js` (77 assertions, §7), JS ↔ Python parity on `tests/fixtures/enginelib/field.json`
(30 specs: 16 good, 14 bad). Reference activity: `tools/activities_examples/heat-stability` (the FTCS stability limit r ≤ ½).

Pure, deterministic per seed, bounded (≤ 200 × 200 nodes in 2-D, ≤ 2000 in 1-D, ≤ 10⁸ node-steps, ≤ 3·10⁶ formula evaluations
per node and step, ≤ 200 000 steps), never throws: what cannot be computed is NaN with a code.

## 1. The model

```json
"model": { "equation": "heat", "method": "cn", "dim": 1, "grid": { "nx": 101, "x0": 0, "x1": 1 },
           "D": "k", "init": "sin(pi*x)", "bc": { "all": { "type": "dirichlet", "value": 0 } }, "tEnd": 0.1, "dt": 0.001 }
```

| field | kind | meaning |
|---|---|---|
| `dim` | 1 or 2 | the grid's dimension (1 by default) |
| `grid` | `{nx!, ny, x0, x1, y0, y1}` | nodes (nx ≤ 2000 in 1-D, ≤ 200 in 2-D; ny defaults to nx) and the box (default [0, 1]²) |
| `equation` | `heat` `advection` `advdiff` `wave` `rd` `poisson` `ca` | what is solved |
| `method` | see §2 | the scheme (a default per equation) |
| `D`, `Dv` | number or formula over the vars and t | diffusion of u (and of v in two-field rd) |
| `vx`, `vy` | formula over x, y, the vars, t | velocity (advection, advdiff) |
| `c`, `damping` | number / formula | wave speed and damping γ in u_tt + γu_t = c²∇²u |
| `kinetics`, `kp`, `reaction` | preset, its parameters, custom `{u, v?}` | reaction–diffusion (§3) |
| `init`, `initV` | formula over x (, y) | u at t = 0; v (two-field rd) or u_t(0) (wave) |
| `noise` | `{amp!, field}` | uniform noise added to the initial field (seeded) |
| `source` | formula over x, y, the vars, t | a distributed source s |
| `sources` | ≤ 8 `{shape point\|rect\|circle\|all, x, y, r, x0…y1, rate!}` | localised sources (rate: formula over the vars, t) |
| `obstacles` | ≤ 8 shapes with `value` | solid cells: held at `value`, or insulated (no value) |
| `bc`, `bcV` | `{all, left, right, bottom, top}` each `{type, value, a, b}` | boundary conditions of u and v (§1.1) |
| `vars` | ≤ 12 named numbers | model variables, changed by interrupts |
| `tEnd`, `dt`, `safety`, `maxSteps` | | the run; without dt the step is safety (0.9) × the stability limit (code dt-auto); dt is adjusted to tEnd/N |
| `allowUnstable` | bool | show an unstable run instead of NaN |
| `nine` | bool | the isotropic 9-point Laplacian (2-D heat FTCS, rd) |
| `points`, `frames` | | records of series (≤ 2000) and of the space–time diagram (≤ 200) |
| `probes` | ≤ 8 `{id!, at point\|line\|area!, x, y, x0…y1, stat mean\|max\|min\|total, field}` | measured every record |
| `front` | `{level!, y, field}` | the position of the rightmost crossing of level (a front), on row y in 2-D |
| `events` | ≤ 8 `{id!, of max\|min\|mean\|total\|probe\|front!, probe, field, level!, dir −1\|0\|1, stop}` | threshold crossings, time interpolated |
| `interrupts` | ≤ 8 `{at \| on, set: {var: formula}}` | change vars at a time (the NoemaSimKit calendar) or at an event |
| `solver` | `{tol, maxIter, omega}` | Poisson iterations (default tol 10⁻⁶ relative, ω optimal 2/(1 + sin(π/(n − 1)))) |
| `ca` | §4 | a cellular automaton |

### 1.1 Boundary conditions

`dirichlet` u = value; `neumann` ∂u/∂n = value (outward); `robin` a·u + b·∂u/∂n = value; `periodic` (on both sides of an axis).
`value` may be a formula over x, y, the vars and t (a moving or switched boundary). Missing sides are insulated (Neumann 0).

## 2. Methods

| equation | methods (default first) | stability | source |
|---|---|---|---|
| heat | `ftcs`, `btcs`, `cn` (1-D), `adi` (2-D) | FTCS r = DΔtΣh⁻² ≤ ½; the others unconditional | Crank & Nicolson 1947; Peaceman & Rachford 1955; Morton & Mayers 2005 |
| advection | `upwind`, `laxwendroff`, `laxfriedrichs`, `centred`, `minmod`, `vanleer`, `superbee`, `mc` | C ≤ 1 (centred: never) | Courant et al. 1928; Lax & Wendroff 1960; Sweby 1984; LeVeque 2002 |
| advdiff | the same, diffusion by FTCS (Lie splitting) | 2r + C ≤ 1 | — |
| wave | `leapfrog` | c Δt √Σh⁻² ≤ 1 | Strikwerda 2004 §8.2 |
| rd | `ftcs` (explicit reaction) | r ≤ ½ for D and Dv | — |
| poisson | `sor`, `gs`, `jacobi` | — | Young 1954; LeVeque 2007 ch. 4 |

Advection is in conservation form (u_t + ∇·(vu) = s), so mass is conserved on a periodic domain; 2-D advection uses dimensional
splitting. Before the run the von Neumann gain of the chosen scheme (NoemaSpaceKit `vonNeumann`) and the Courant number are
computed; a gain above 1 is code `unstable` and every output is NaN unless `allowUnstable`. The leapfrog energy
½Σ[(uⁿ⁺¹ − uⁿ)²/Δt² + c² ∇uⁿ·∇uⁿ⁺¹] is conserved exactly (drift ~10⁻¹⁵).

## 3. Reaction–diffusion kinetics

| `kinetics` | f(u, v), g(u, v) | parameters (`kp`) |
|---|---|---|
| `grayscott` | −uv² + F(1 − u), uv² − (F + k)v | F 0.04, k 0.06 (Pearson 1993) |
| `fhn` | u − u³/3 − v + I, ε(u + a − bv) | a 0.7, b 0.8, eps 0.08, I 0 |
| `fisher` | r u(1 − u) (one field) | r 1 |
| `schnakenberg` | γ(a − u + u²v), γ(b − u²v) | a 0.1, b 0.9, gamma 1 |
| `brusselator` | A − (B + 1)u + u²v, Bu − u²v | A 1, B 3 |
| `custom` | `reaction.u`, `reaction.v` (formulas over u, v, x, y, the kp names, the vars, t) | any `kp` |

The Turing analysis (outputs `turing`, `turingK`, `turingWavelength`) linearises the preset at its homogeneous steady state and
tests tr J < 0, det J > 0, d f_u + g_v > 0, (d f_u + g_v)² > 4 d det J (Turing 1952; Murray 2003 vol. II §2.3), then maximises the
growth rate λ(k²) of the dispersion relation (a scan and golden-section refinement).

## 4. Cellular automata (`equation: ca`)

`ca: {rule!, code, bs, states, threshold, p, f, density, init random|single|cells, cells, neighbourhood moore|vonneumann, wrap,
update sync|async, steps, drop centre|random, pile}`:

| rule | dim | meaning |
|---|---|---|
| `elementary` | 1 | Wolfram's rule `code` 0–255 (Wolfram 1983), from one cell or random |
| `life` | 2 | Life-like `bs` rule in B/S notation (B3/S23 Conway, Gardner 1970; B36/S23 HighLife) |
| `gh` | 2 | Greenberg & Hastings 1978 excitable medium: `states`, `threshold` |
| `sandpile` | 2 | the abelian sandpile (Bak, Tang & Wiesenfeld 1987): grains dropped at the centre or at random, or a `pile` toppled once; avalanche sizes |
| `forestfire` | 2 | Drossel & Schwabl 1992: growth p, lightning f |

`update: async` is random-sequential (seeded). The sandpile is abelian (Dhar 1990): sync and async end in the same configuration.

## 5. Outputs

Series (≤ 2000 values): `x`, `y`, `t`, `profile` (u or v along x; on a 2-D grid a row y or a column x; at a time `t`), `probe`,
`stat` (max, min, mean, total, energy, l2 over time), `front`, `residual` (Poisson, relative to the first), `population` (CA),
`avalanche` (sandpile sizes), `eventTime`.

Scalars: `final` (a stat at the end, or at `t`), `at` (the value at x, y, at the end or at `t`), `probe`, `eventTime` (`nth`),
`eventCount`, `frontSpeed` (a least-squares slope over the second half), `drift` (relative change of the total, or of the wave
energy; NaN for an open system), `cfl`, `r`, `dtMax`, `dt`, `gain` (the von Neumann maximum), `iterations`, `residual`, `error`
(against `expr`, an exact solution over x, y, t; `norm` l2 or max; at the end or at `t`), `wavelength` (of the final pattern:
mean crossing distance in 1-D, the spectral peak in 2-D), `turing`, `turingK`, `turingWavelength`, `steps`, `population`,
`density`, `cell` (a CA cell's state), `avalancheMean`, `avalancheTau` (the discrete power-law MLE, Clauset, Shalizi & Newman
2009), `flag` (1 if `code` occurred), `ok` (0 if a fatal code occurred).

Scenes: `heatmap` (2-D: the field in five role classes, `levels`, plus up to 8 `contours`; at a time `t`), `spacetime` (1-D: the
recorded frames, time upwards). Roles only; ≤ 2000 items.

## 6. Codes

Fatal (outputs NaN): `unstable`, `blow-up`, `budget`, `nan`, `grid`, `kernel` (NoemaSimKit missing). Notes: `cfl`, `dt-auto`,
`overshoot` (a value beyond the initial range: Lax–Wendroff, Gibbs), `mass-drift` (> 10⁻⁹ on a closed system), `cn-oscillation`
(Crank–Nicolson with r > 1 and sharp data), `no-converge`, `incompatible` (a pure-Neumann Poisson problem whose source and fluxes
do not balance: solved up to a constant after removing the mean), `event-limit`, `stopped`, `front-not-found`,
`unknown-steady`, `not-turing`, `period-not-found`, `nine-point-dx` (the 9-point stencil needs dx = dy), `topple-limit`.

The stepper (`NoemaLibField.stepper`, wrapped by `NoemaSimKit.stepper`, passed to `makeEngine`): `init(model, inputs, ctx)` builds
the run; each `step(state, inputs, t, dt)` applies the inputs (vars, consts) and advances whole steps of the run's own Δt to t + dt,
returning the outputs now and the events crossed. Poisson and CA are computed at the first step. `snapshot: null` (the state holds
compiled formulas).

## 7. Reference values asserted by `tests/lib_field.js`

| case | value | tolerance | source |
|---|---|---|---|
| heat kernel, CN, nx 201, r 2 | max error 3.6·10⁻⁴, mass 10⁻¹⁵ | < 5·10⁻⁴ | σ² = σ₀² + 2Dt |
| FTCS at the auto step | r 0.45, error 6·10⁻⁴ | < 10⁻³ | — |
| CN order (sine mode) | 2.0 | ± 0.2 | — |
| FTCS r = 1.25 | gain 4 = |1 − 4r|, NaN | exact | von Neumann |
| Robin a 2, b 1 steady | 1 − 2x/3 | 10⁻⁴ | — |
| ADI 2-D kernel 41² | 4.8·10⁻³ | < 8·10⁻³ | — |
| square wave, C 0.8 | TVD limiters in [0, 1]; LW overshoot 1.19; centred gain 1.28 | — | Godunov 1959 |
| L2 errors | LF > upwind 0.121 > minmod 0.079 > van Leer 0.068 > superbee 0.049 | order | LeVeque 2002 |
| d'Alembert, C 0.5 | error 2.2·10⁻³, energy drift < 10⁻¹⁰ | — | — |
| standing wave u(½, 1) | −1 | 2·10⁻³ | cos πt sin πx |
| Fisher–KPP speed | 1.935 → 2√(rD) | ± 0.1, from below | Fisher 1937; Bramson 1983 |
| Schnakenberg d 40 | k* = dispersion maximum, λ 14.94 | 10⁻³ | Murray 2003 |
| Laplace centre | ¼ (SOR, GS, Jacobi) | 10⁻⁶ | superposition |
| Jacobi / GS iterations | 2 | ± 5 % | ρ_GS = ρ_J² |
| −u'' = 1 | x(1 − x)/2 | 10⁻⁸ | exact on the grid |
| rule 90 | 2^popcount(t), t ≤ 64 | exact | Glaisher |
| rule 30 | 1, 3, 3, 6, 4, 9, 5, 12, … | exact | OEIS A070952 |
| glider, blinker | 5 cells; period 2 | exact | Gardner 1970 |
| sandpile 2000 grains | sync = async | exact | Dhar 1990 |
| rod heated at one end, u(½) = ¼ | the Fourier-series time | 2·10⁻³ | — |
