# The thermal engine `thermal@1`

Lumped thermal networks for tier B (`sim-spec@1`, `docs/INTERACTIVE.md` §12): a MOSFET on a heatsink, a PCB trace, a thermal
time constant, a room with a heater and a thermostat. Trusted app code (`engine/src/39_engine_thermal.js` → `NoemaThermal`), pure
JS, deterministic, no DOM, no learner text (codes and numbers only). Registered with one line:
`ACT.registerEngine(NoemaThermal.engine)` (`{id, check, prepare, create, workerSource}`, like `circuit-mna@1`). Schema
`tools/schemas/noema.thermal.v1.schema.json`; Python twin of the checks `tools/thermal.py`; tests `node tests/thermal.js`.

## Model — the network `noema.thermal/v1` (°C, K/W, W/K, J/K, W, m²)

| part | fields | meaning |
|---|---|---|
| `ambient` | °C (default 25) | the far side of every link without `b`; every node's default `T0` |
| node | `id`, `C` (≥ 0, J/K; none = massless), `T0` | a lump; or `{id, fixed: °C}`, a boundary held at a temperature |
| link | `id`, `a`, `b` (a node or `ambient`, the default), one of `R` K/W · `G` W/K · `conv {h, A}` · `rad {eps, A}` | q(a→b) = (Ta − Tb)/R, G·ΔT, h·A·ΔT, ε·σ·A·(Ta⁴ − Tb⁴) in kelvin |
| source | `id`, `node`, `P`: W \| `{step: {P, t0, P0}}` \| `{pwm: {P, freq, duty, low, delay}}` \| `{sine: {offset, amp, freq, phase°}}` | heat into a node (negative: a cooler) |
| thermostat | `id`, `sensor` (node), `source`, `low`, `high`, `mode` `heat` \| `cool` | heat: on at T ≤ low, off at T ≥ high (cool: the reverse); one per source |

Limits: 50 nodes, 200 links, 24 sources, 8 thermostats, 200 000 steps, 20 001 recorded points, 24 bindings. Ids
(`[A-Za-z][A-Za-z0-9_-]{0,31}`) are unique across nodes, links, sources and thermostats; `ambient` is reserved.

## The spec — `model: {network, bindings?, transient?}`

- `bindings` (≤ 24): `{element, prop?, expr}` set a value from the controls on every run (the expressions are the app's NoemaExpr,
  evaluated on the main thread by `prepare`). `element` is an id or `ambient`; `prop` defaults to the main value: `C` of a node
  (`T0` too), `fixed` of a fixed node, `R` / `G` of a link (`conv.h`, `conv.A`, `rad.eps`, `rad.A`), `P` of a constant source
  (`step.P`, `pwm.duty`, `sine.amp`, … of a waveform: then `prop` is required), `low` / `high` of a thermostat, `value` of `ambient`.
- `transient`: `{tEnd, dt? (tEnd/1000), method? 'trap' | 'be', start? 'T0' | 'steady', points? (2001)}`; tEnd and dt are numbers
  or expressions. `start: 'steady'` begins at the steady state of the sources' values at t = 0 (then a `step` shows the response).
- outputs: `scalar` — `node` / `link` / `source` at the **steady state** (no `at`, no `stat`), or of the transient `at` a time or
  as a `stat` (`final`, `min`, `max`, `mean`, `pp`, `rms`; all steps); `thermostat` with `at` or `stat` (`mean` = its duty);
  `tau: k` (the k-th time constant, slowest first). `series` — `time: true`, `node`, `link`, `source`, `thermostat` (0/1), thinned
  to 2000 points. A run that fails (invalid values from a binding, no convergence) gives NaN and empty series; nothing throws.

```json
{ "format": "noema.sim-spec/v1", "engine": "thermal@1",
  "params": [ { "id": "Rsa", "kind": "slider", "label": "rsa", "min": 0.2, "max": 5, "default": 1.5, "unit": "K/W" },
              { "id": "P", "kind": "slider", "label": "power", "min": 1, "max": 50, "default": 20, "unit": "W" } ],
  "model": {
    "network": { "format": "noema.thermal/v1", "ambient": 40,
      "nodes": [ { "id": "J", "C": 0.02 }, { "id": "Cs", "C": 1 }, { "id": "HS", "C": 40 } ],
      "links": [ { "id": "Rjc", "a": "J", "b": "Cs", "R": 0.5 }, { "id": "Rcs", "a": "Cs", "b": "HS", "R": 0.2 }, { "id": "Rsa", "a": "HS", "R": 1.5 } ],
      "sources": [ { "id": "Pd", "node": "J", "P": 20 } ] },
    "bindings": [ { "element": "Rsa", "expr": "Rsa" }, { "element": "Pd", "expr": "P" } ],
    "transient": { "tEnd": 600, "dt": 0.1 } },
  "outputs": [ { "id": "t", "kind": "series", "time": true }, { "id": "tj", "kind": "series", "node": "J" },
               { "id": "tjSS", "kind": "scalar", "node": "J" }, { "id": "tj60", "kind": "scalar", "node": "J", "at": 60 },
               { "id": "tau1", "kind": "scalar", "tau": 1 } ],
  "readouts": [ { "label": "tj", "expr": "tjSS", "unit": "°C" }, { "label": "tau", "expr": "tau1", "unit": "s" } ],
  "plots": [ { "kind": "series", "x": { "series": "t", "label": "time", "unit": "s" }, "y": { "label": "temp", "unit": "°C" }, "series": [ { "y": "tj", "label": "tj" } ] } ] }
```

A sim exercise then grades with checks, e.g. `{"expr": "tjSS <= 125", "label": "checkTj"}` (keep the junction under 125 °C) and
`{"expr": "Rsa >= 1", "label": "checkCheap"}` (with the cheapest heatsink that does it).

## Engine API

```js
NoemaThermal = { id: 'thermal@1', format, SIGMA, STATS, limits, check, checkSpec, create, source, adapter, engine }
check(network)    → [{code, path, msg, level: 'error'|'warning'}]          (msg for authors, never shown to learners)
checkSpec(spec)   → the same for spec.model and spec.outputs (paths model.…, outputs[i]…; expression syntax is the validators')
create(network)   → sim                                                     (throws code 'invalid' with .problems)
sim.steady({mode: 'mean'|'t0'}) → {nodes: {id: °C}, links: {id: W a→b}, sources: {id: W}}   (thermostats ignored: sources on)
sim.transient({tEnd, dt, method, start, points, at: [t…], maxSteps}) → {t, nodes, links, sources, thermostats, stats, at, steps, dt}
sim.taus()        → time constants s, slowest first (linearised at the steady state; massless nodes eliminated)
```

## Method and accuracy

Unknowns are the non-fixed nodes; the conductance matrix G (R, G, h·A) is assembled once, boundaries go to the right-hand side.
Steady state: G·T = b + P (+ radiation by Newton, damped, from the linearised start). Transient: the θ-method with θ = ½
(trapezoidal) on nodes with a capacity and θ = 1 on massless ones; backward Euler on the first step, on a step that holds a
source edge (step, PWM) and on a thermostat switch, so nothing rings. The sources enter as their **exact mean over the step**
(the integral of the waveform), so a PWM faster than the step still delivers duty·P. Thermostats are sampled at the start of each
step. The dense LU is factored once per run (linear networks): about 4 ms per 1000 steps for 10 nodes. Measured (tests/thermal.js):
RC step τ = RC to 0.004 % (dt = τ/100), T(τ) to 1.5·10⁻⁴ K of a 10 K rise (backward Euler: 1.8·10⁻² K), steady ΔT = P·Rth to
10⁻¹², radiation steady state to 10⁻⁶ K, sine amplitude R/√(1+(ωτ)²) to 0.0001 %, two-node and Schur time constants to 10⁻⁹,
thermostat duty to 0.002 of the analytic t_on/(t_on + t_off); 20 000 steps of a 10-node network in ≈ 90 ms (radiation: ≈ 0.5 s).

## Codes

`check`: `format`, `unknown-field` (warning), `value`, `size`, `id`, `dup-id`, `unknown-node`, `unknown-source`, `self-loop`, `link`
(not exactly one of R, G, conv, rad), `fixed-node` (a source on a boundary), `thermostat` (two on one source), `boundary-link`
(warning), `singular` (massless nodes without a path to a boundary), `floating` (warning: an insulated group has no steady state).
`checkSpec` adds `model`, `binding`, `transient`, `budget`, `output`. Thrown by the sim: `invalid`, `bad-args`, `budget`,
`singular`, `no-convergence`.

## Limits

No conduction PDE (a trace or a fin is a chain of lumps), no temperature-dependent R or C, radiation between two surfaces only
through one `rad` link (view factors are the author's ε·A), thermostats switch at step boundaries (choose dt ≪ the cycle).
