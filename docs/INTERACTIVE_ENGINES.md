# The P6 engines of sim-spec@1 — `thermal@1`, `pid@1`, `rf@1`, `twin@1`

Four more engines for tier B (`sim-spec@1`, `docs/INTERACTIVE.md` §12), next to the formulas (`formula@1`) and the circuit engine
(`circuit-mna@1`, `docs/INTERACTIVE_CIRCUIT.md`): **heat** (lumped thermal networks), **control loops** (PID on a plant), **radio
links** (path loss, link budgets, airtime) and the **digital twin of a battery-powered IoT node** (duty cycle, battery life, radio
delivery, and fault-finding benches). §1 is what the four have in common, §2–§5 one engine each, §6 the reference activities.
Which engine for which learning goal: `docs/INTERACTIVE_AUTHORING.md`.

## 1. Common to the four

- **Trusted app code, data in the pack.** Each engine is a pure ES module in `src/engines/<name>/`, deterministic (seeded noise), bounded,
  with no DOM and no learner text: it gives codes and numbers only. The pack carries only data: the model, the bindings of the
  controls, the outputs (and, for `twin@1`, a bench).
- **Plugins of the engine library, like `circuit-mna@1`.** Each is one line of `src/engines/plugins.ts`; the page loads it when an
  activity needs it (`NoemaCore.engines.load`), and `ACT.engine(id)` gives the engine object `{id, check, prepare, create,
  workerSource}` (`twin@1` also `bench: true`). Every run goes to a **Worker** whose source is its Worker bundle (the text a Worker runs), built by esbuild from the module and the kernel pieces it imports (`noemaWorkers` in `tools/esbuild.mjs`): the same code as on
  the page; `prepare` evaluates the
  spec's expressions (bindings, transient times, `at`) with the app's NoemaExpr on the main thread, so the worker gets numbers.
- **Validated with one set of messages.** The content checks (`src/features/content`) know the four in `ENGINES`
  and call each engine's own `checkSpec(spec)` (the engine library is in the app's bundle, the connector and
  `build/noema-tools.cjs`, which the Python tools and the skill's scripts call). A spec with an error is refused with `spec.<path>: <message>`. The engines
  accept any non-empty text as an expression; the validators then check **every expression of the model** with NoemaExpr /
  simexpr against the spec's names (consts, params, derived): each binding's `expr`, and for `thermal@1` and `pid@1` also
  `model.transient.tEnd` / `dt` and every output's `at`. `tests/activities.js` holds them to the golden messages of the former Python twins on 50+ P6 specs.
- **`pack.requires`** gets `engine:thermal@1`, `engine:pid@1`, `engine:rf@1` or `engine:twin@1` (`make_pack.py` writes it).
- Engines' codes and messages are for authors (the validators, `activity_lint.py`); a learner never sees them. A run that fails
  at runtime (a slider reaches an invalid value) gives NaN scalars and empty series; nothing throws into the page.
- Schemas: `src/contracts/schemas/noema.{thermal,pid,rf,twin}.v1.schema.json`. Tests: `node tests/{thermal,pid,rf,twin}.js`.

## 2. `thermal@1` — lumped thermal networks (`src/engines/thermal/thermal.js`)

A MOSFET on a heatsink, a PCB trace, a thermal time constant, a room with a heater and a thermostat.

### 2.1 The network `noema.thermal/v1` (°C, K/W, W/K, J/K, W, m²)

| part | fields | meaning |
|---|---|---|
| `ambient` | °C (default 25) | the far side of every link without `b`; every node's default `T0` |
| node | `id`, `C` (≥ 0, J/K; none = massless), `T0` | a lump; or `{id, fixed: °C}`, a boundary held at a temperature |
| link | `id`, `a`, `b` (a node or `ambient`, the default), one of `R` K/W · `G` W/K · `conv {h, A}` · `rad {eps, A}` | q(a→b) = (Ta − Tb)/R, G·ΔT, h·A·ΔT, ε·σ·A·(Ta⁴ − Tb⁴) in kelvin |
| source | `id`, `node`, `P`: W \| `{step: {P, t0, P0}}` \| `{pwm: {P, freq, duty, low, delay}}` \| `{sine: {offset, amp, freq, phase°}}` | heat into a node (negative: a cooler) |
| thermostat | `id`, `sensor` (node), `source`, `low`, `high`, `mode` `heat` \| `cool` | heat: on at T ≤ low, off at T ≥ high (cool: the reverse); one per source |

Limits: 50 nodes, 200 links, 24 sources, 8 thermostats, 200 000 steps, 20 001 recorded points, 24 bindings. Ids
(`[A-Za-z][A-Za-z0-9_-]{0,31}`) are unique across nodes, links, sources and thermostats; `ambient` is reserved.

### 2.2 In a spec — `model: {network, bindings?, transient?}`

- `bindings` (≤ 24): `{element, prop?, expr}` set a value from the controls on every run. `element` is an id or `ambient`; `prop`
  defaults to the main value: `C` of a node (`T0` too), `fixed` of a fixed node, `R` / `G` of a link (`conv.h`, `conv.A`,
  `rad.eps`, `rad.A`), `P` of a constant source (`step.P`, `pwm.duty`, `sine.amp`, … of a waveform: then `prop` is required),
  `low` / `high` of a thermostat, `value` of `ambient`.
- `transient`: `{tEnd, dt? (tEnd/1000), method? 'trap' | 'be', start? 'T0' | 'steady', points? (2001)}`; tEnd and dt are numbers
  or expressions. `start: 'steady'` begins at the steady state of the sources' values at t = 0 (then a `step` shows the response).
- outputs: `scalar` — `node` / `link` / `source` at the **steady state** (no `at`, no `stat`), or of the transient `at` a time or
  as a `stat` (`final`, `min`, `max`, `mean`, `pp`, `rms`); `thermostat` with `at` or `stat` (`mean` = its duty); `tau: k` (the
  k-th time constant, slowest first). `series` — `time: true`, `node`, `link`, `source`, `thermostat` (0/1), thinned to 2000 points.

```json
{ "format": "noema.sim-spec/v1", "engine": "thermal@1",
  "params": [ { "id": "Rsa", "kind": "slider", "label": "rsa", "min": 0.5, "max": 8, "step": 0.1, "default": 6, "unit": "K/W" } ],
  "model": {
    "network": { "format": "noema.thermal/v1", "ambient": 40,
      "nodes": [ { "id": "J", "C": 0.5 }, { "id": "Cs", "C": 2 }, { "id": "HS", "C": 60 } ],
      "links": [ { "id": "Rjc", "a": "J", "b": "Cs", "R": 0.5 }, { "id": "Rcs", "a": "Cs", "b": "HS", "R": 0.2 }, { "id": "Rsa", "a": "HS", "R": 6 } ],
      "sources": [ { "id": "Pd", "node": "J", "P": 20 } ] },
    "bindings": [ { "element": "Rsa", "expr": "Rsa" } ],
    "transient": { "tEnd": "max(600, 300 * Rsa)", "dt": 1 } },
  "outputs": [ { "id": "t", "kind": "series", "time": true }, { "id": "tj", "kind": "series", "node": "J" },
               { "id": "tjSS", "kind": "scalar", "node": "J" }, { "id": "tau1", "kind": "scalar", "tau": 1 } ] }
```

Grading: `{"expr": "tjSS <= 125", "label": "checkTj"}` (keep the junction under 125 °C) and `{"expr": "Rsa >= 3", "label":
"checkCheap"}` (with a heatsink no bigger than needed).

### 2.3 The engine

```js
thermal = { id: 'thermal@1', format, SIGMA, STATS, limits, check, checkSpec, create, adapter, engine }
check(network) / checkSpec(spec) → [{code, path, msg, level: 'error'|'warning'}]
create(network) → sim;  sim.steady({mode}) → {nodes, links, sources};  sim.transient({tEnd, dt, method, start, points, at}) → {t, nodes, …, stats, at};  sim.taus()
```

**Method and accuracy.** The conductance matrix is assembled once; the steady state solves G·T = b + P (radiation by damped
Newton). Transients use the θ-method (trapezoidal on nodes with a capacity, backward Euler on massless ones; backward Euler on the
first step, on source edges and thermostat switches, so nothing rings). Sources enter as their exact mean over the step (a PWM
faster than the step still delivers duty·P); thermostats are sampled at the start of each step. Measured (`tests/thermal.js`): RC
step τ = RC to 0.004 %, steady ΔT = P·Rth to 10⁻¹², radiation steady state to 10⁻⁶ K, sine amplitude to 0.0001 %, two-node time
constants to 10⁻⁹, thermostat duty to 0.002; 20 000 steps of a 10-node network ≈ 90 ms.

**Codes.** `check`: `format`, `unknown-field` (warning), `value`, `size`, `id`, `dup-id`, `unknown-node`, `unknown-source`,
`self-loop`, `link` (not exactly one of R, G, conv, rad), `fixed-node`, `thermostat`, `boundary-link` (warning), `singular`,
`floating` (warning). `checkSpec` adds `model`, `binding`, `transient`, `budget`, `output`.

**Limits.** No conduction PDE (a trace or a fin is a chain of lumps), no temperature-dependent R or C, radiation only through a
`rad` link (view factors are the author's ε·A), thermostats switch at step boundaries (choose dt ≪ the cycle).

**Uses the kernel / parts (2026-11-07).** The transient's θ-method (trapezoidal, backward Euler on the first step, on source edges
and on thermostat switches; the massless nodes are algebraic rows) is the format's own (`model.transient.method: 'trap' | 'be'`). The
transient and the stepper run on the kernel's θ-method DAE solver (`NoemaSimKit.daeThetaInit`): C·x′ = −G·x + b + P̄ + rad(x), the
massless nodes algebraic rows, the analytic Jacobian; a linear network (no radiation) factors C + hθG once per (h, θ) and takes one
solve a step (`linear: true`), a radiating one Newton with LU. Before each step (`beforeStep`) the engine tests the gates at its
start, sets P̄ (each source's exact mean over the step, on the engine's own grid k·h) and picks θ as above. Against the own θ-step:
≤ 3e-13 relative (heatsink, a PWM chain with a massless node, radiation, a thermostat; both methods). FALLBACK without the kernel
(marked): the own θ-step (`stepCore`). Its step is one function (`stepCore`) that `transient()` and the new
**stepper** share: `thermal@1` is a part of a co-simulation (`engine.stepper = true`; the instance's `stepInit` / `stepTo` /
`snapshot` / `restore`, `docs/INTERACTIVE_LIBRARY.md` §1.6). Each macro step is cut in equal steps ≤ `transient.dt`; the bindings are
read at every step; a series output gives its value now, `stat` runs over every internal step, `at` once passed, the steady and τ
outputs as in `run()`. Stepped to tEnd it equals `transient()` (tests/parts.js).

## 3. `pid@1` — control loops (`src/engines/pid/pid.js`)

Tune a PID on a plant, watch windup, compare P and PI, see dead time and noise.

### 3.1 The model — `model: {plant, controller?, mode?, setpoint?, load?, disturbance?, noise?, metrics?, transient, bindings?}`

| plant `type` | fields (defaults) | equation (u: the plant's input) |
|---|---|---|
| `fopdt` | `K`, `tau`, `theta`, `y0` | τ·y′ = K·u(t−θ) − y |
| `second` | `K`, `wn`, `zeta`, `theta`, `y0` | y″ + 2ζωn·y′ + ωn²·y = K·ωn²·u |
| `integrator` | `K`, `theta`, `y0` | y′ = K·u |
| `motor` | `J` 0.01, `b` 0.1, `Kt` 0.01 (= Ke), `R` 1, `L` 0.5 (0: no inductance), `output` `speed` \| `position` | L·i′ = u − R·i − Kt·ω; J·ω′ = Kt·i − b·ω; θ′ = ω |
| `thermal` | `C`, `R`, `Tamb` 25, `y0` = Tamb | C·T′ = u − (T − Tamb)/R (u in W) |
| `tank` | `A`, `k`, `h0` 0, `hMax` | A·h′ = max(u, 0) − k·√h, 0 ≤ h ≤ hMax |

Every plant takes `theta` (dead time). **controller** (parallel form): `u = u0 + Kp·(b·r − ym) + I + D`, `D = Kd·s/(1 + s·Tf) · (c·r
− ym)` with `Tf = |Kd/Kp|/N` (`N` 10) unless `Tf` is given; `b` 1, `c` 0 (derivative on the measurement: no kick); `uMin`, `uMax`
clamp u; `antiWindup` `none` | `clamp` | `backcalc` (`Tt`); `Ts` the sample time (0: every step). **mode** `closed` (default) or
`open` (the setpoint signal *is* u: a step test). **Signals** (`setpoint` default 1, `load` added to u, `disturbance` added to y): a
number, `{step: {from, to, at}}`, `{ramp: {from, slope, at, until}}`, `{sine: {offset, amp, freq, phase°}}`, `{steps: [[t, v], …]}`
(≤ 32). **noise** `{std, seed?}` on the measurement ym. **metrics** `{band}` (0.02). **transient** `{tEnd, dt? (tEnd/1000)}`
(required; numbers or expressions; ≤ 200 000 steps). **bindings** (≤ 24): `{element: plant | controller | setpoint | load |
disturbance | noise, prop, expr}`; `prop` a field (`Kp`, `tau`, `step.to`, `std`; `value` of a numeric signal, the default);
`antiWindup` takes a toggle (true = clamp) or a choice index (0 none, 1 clamp, 2 backcalc).

### 3.2 Outputs

`series`: `time: true` or `signal` `r` | `y` | `ym` | `u` | `e` (= r − ym), thinned to 2000 points. `scalar`: a `signal` `at` a time
or as a `stat` (`final`, `min`, `max`, `mean`, `pp`, `rms`), or a `metric`: `rise` (10–90 %), `overshoot` (%), `peak`, `peakTime`,
`settling` (inside ±band, for good), `yFinal`, `ess` (mean of r − y over the last 2 %; NaN in an open loop), `iae`, `ise`, `itae`,
`satTime`. Rise, overshoot and settling are measured from the setpoint's step to the final value, on the noise-free y; NaN when y
does not move. An unstable loop stops once a state passes 10¹² (the rest NaN).

```json
{ "engine": "pid@1",
  "params": [ { "id": "Kp", "kind": "slider", "label": "kp", "min": 0, "max": 10, "step": 0.05, "default": 1 },
              { "id": "Ki", "kind": "slider", "label": "ki", "min": 0, "max": 20, "step": 0.1, "default": 0 } ],
  "model": { "plant": { "type": "second", "K": 1, "wn": 4, "zeta": 0.4, "theta": 0.05 },
    "controller": { "Kp": 1, "Ki": 0, "uMin": -20, "uMax": 20 }, "setpoint": { "step": { "from": 0, "to": 1, "at": 0.5 } },
    "bindings": [ { "element": "controller", "prop": "Kp", "expr": "Kp" }, { "element": "controller", "prop": "Ki", "expr": "Ki" } ],
    "transient": { "tEnd": 6, "dt": 0.001 } },
  "outputs": [ { "id": "t", "kind": "series", "time": true }, { "id": "y", "kind": "series", "signal": "y" },
               { "id": "os", "kind": "scalar", "metric": "overshoot" }, { "id": "ts", "kind": "scalar", "metric": "settling" },
               { "id": "ess", "kind": "scalar", "metric": "ess" } ] }
```

Grading: `[{"expr": "os < 10", "label": "checkOs"}, {"expr": "ts < 2", "label": "checkTs"}, {"expr": "abs(ess) < 0.02", "label": "checkEss"}]`.

### 3.3 The engine

```js
pid = { id: 'pid@1', STATS, SIGNALS, METRICS, ZN, MOTOR, limits, check, checkSpec, create, metrics, adapter, engine }
create(model, {seed}).run({tEnd, dt}) → {t, r, y, ym, u, e, metrics, steps, dt};  metrics(t, y, {t0, y0?, yf?, band})
```

**Ziegler–Nichols** (`pid.ZN`; parallel gains Ki = Kp/Ti, Kd = Kp·Td): ultimate gain Ku, period Tu — P: Kp = 0.5 Ku; PI: 0.45
Ku, Ti = Tu/1.2; PID: 0.6 Ku, Ti = Tu/2, Td = Tu/8. Reaction curve K, L, T — P: Kp = T/(K·L); PI: 0.9 T/(K·L), Ti = L/0.3; PID:
1.2 T/(K·L), Ti = 2 L, Td = L/2.

**Method and accuracy.** Fixed-step RK4 with the input held over each step (dead time by interpolation of the stored input); the
controller is discrete (backward-Euler derivative filter, forward-Euler integral). Measured (`tests/pid.js`): first order y(τ) to
2·10⁻¹⁵; rise τ·ln 9 and settling τ·ln 50 to 0.2 %; second-order overshoot within 0.0002 points for ζ = 0.1…0.7; P-control ess =
1/(1 + K·Kp) to 10⁻¹⁴; anti-windup overshoot 23.6 % → 1.7 % (clamp); 20 000 steps with noise, load and dead time ≈ 25 ms.

**Codes.** `check`: `model`, `unknown-field`, `plant`, `mode`, `controller`, `signal`, `noise`, `metrics`, `transient`, `budget`,
`binding`; warnings `unused`, `no-gain`, `no-limits`, `stiff` (dt > half the fastest time constant). `checkSpec` adds `output`.

**Limits.** Single loop, SISO; no cascade, feed-forward block or rate limit; the tank and the motor are the only nonlinear plants.

**Uses the kernel / parts (2026-11-07).** The plant is integrated by the kernel's classical RK4 (`NoemaSimKit.integrate`, one call
per run) with a **break** at every grid time t_k = k·h: there the measurement (+ the noise of a kernel stream `pid:noise`, normals by
inversion instead of mulberry32 + Box–Muller), every Ts the controller, the record and the held input for the next interval; the
dead time reads the input history at t − θ. The same core serves `run()` and the new **stepper** (`engine.stepper = true`, §1.6 of
`docs/INTERACTIVE_LIBRARY.md`): its state is plain data (a snapshot is a copy), the bindings are read at every step, a series gives
its value now, the metrics and stats run over the history so far. Without the kernel: a marked FALLBACK (the same RK4 here).
The Worker source carries NoemaExpr and the kernel.

## 4. `rf@1` — radio links and propagation (`src/engines/rf/rf.js`)

IoT radio benches: link budgets, path loss, range, error rates, airtime.

### 4.1 Models and sources (SI units: m, Hz, dB, dBm, s)

| part | formula | source |
|---|---|---|
| free space | `20·log10(4π·d·f/c)` | Friis 1946 |
| two-ray ground | free space below `d_c = 4π·ht·hr/λ`, then `40·log d − 20·log(ht·hr)` | Rappaport, *Wireless Communications*, §4.6 |
| log-distance | `FSPL(d0) + 10·n·log(d/d0)` + shadowing `σ·N(0,1)` (seeded) | Rappaport §4.9 |
| Okumura–Hata | urban, `urban-large`, `suburban`, `open`; f 150–1500 MHz, hb 30–200 m, hm 1–10 m, d 1–20 km | Hata 1980; COST 231 §4.4 |
| indoor | `20·log f(MHz) + N·log d + Lf(floors) − 28` | ITU-R P.1238 Tables 2–3 |
| walls | drywall 3, wood 4, glass 2, brick 8, concrete 12, metal 26 dB per wall (rough, 2.4 GHz), or `loss` | typical published values |
| Fresnel, knife edge | `r_n = √(n·λ·d1·d2/d)`; `J(v) = 6.9 + 20·log(√((v−0.1)²+1) + v − 0.1)` for v > −0.78 | ITU-R P.526 eq. 31 |
| receiver | noise floor `−174 + 10·log B + NF`; sensitivity = floor + required SNR; margin = Prx − sensitivity | — |
| required SNR | LoRa SF7…12: −7.5, −10, −12.5, −15, −17.5, −20 dB; others: the SNR for BER 10⁻³ | Semtech SX1276, table 13 |
| BER / PER | BPSK/QPSK, non-coherent FSK/BLE, uncoded M-QAM (Wi-Fi), LoRa (Elshabrawy & Robert 2018); PER = `1 − (1 − BER)^(8·payload)` | Proakis; IEEE Comm. Lett. 22(9) |
| airtime | LoRa (Semtech SX1276 §4.1.1.6); BLE packet at 1 or 2 Mb/s; Wi-Fi OFDM (rough: one packet, no ACK) | AN1200.13 |
| range | the largest d where the median margin ≥ `fadeMargin` (bisection on log d) | — |

### 4.2 The link `noema.rf/v1` and the spec

```json
{ "format": "noema.rf/v1", "f": "868M", "d": 2000, "fadeMargin": 10,
  "tx": {"power": 14, "gain": 2.15, "cable": 0.5}, "rx": {"gain": 2.15, "cable": 0.5, "nf": 6},
  "path": {"model": "log-distance", "n": 2.8, "sigma": 6, "walls": [{"type": "brick", "count": 2}], "obstacle": {"d1": 800, "h": -2}},
  "radio": {"mod": "lora", "sf": 9, "cr": 1, "payload": 12, "interval": 600, "dutyLimit": 0.01},
  "sweep": {"from": 10, "to": 20000, "points": 300, "scale": "log"}, "snrSweep": {"from": -25, "to": 5, "points": 61} }
```

`f` and `d` are required (numbers or SI strings). Defaults: tx 14 dBm, gains/cables 0, NF 6 dB; path `fspl`, ht 10 m (30 for
Hata), hr 1.5 m, n 3, d0 1 m; radio `lora` SF7 125 kHz CR 4/5, payload 20 B, duty limit 1 %. `rx.bw`, `rx.snr`, `rx.sensitivity`
override what the radio implies. In a spec: `model: {link, bindings: [{field, expr}]}` — `field` is a numeric field of the link by
its path (`d`, `radio.sf`, `tx.gain`, `path.n`, …); outputs are `{id, kind, of?}` (`of` defaults to the id).

**Scalars** (at `d`): `lambda eirp pl plMedian shadow prx rssi noiseFloor snrReq sensitivity snr ebn0 margin range fresnel clearance
diffraction crossover wallLoss floorLoss ber per bitrate airtime symbolTime dutyCycle minInterval valid`. **Series**: `d pl plMedian
prx prxMedian margin` over the sweep; `snrAxis per ber` over the SNR sweep (≤ 2000 points).

```json
{ "engine": "rf@1", "params": [{"id": "sf", "kind": "slider", "min": 7, "max": 12, "step": 1, "default": 7}, {"id": "ant", "kind": "choice", "options": [{"value": -2, "label": "antChip"}, {"value": 5, "label": "antCollinear"}]}],
  "model": { "link": { "f": "868M", "d": 2000, "path": {"model": "log-distance", "n": 3.3}, "radio": {"mod": "lora", "sf": 7, "payload": 20} },
             "bindings": [{"field": "radio.sf", "expr": "sf"}, {"field": "tx.gain", "expr": "ant"}] },
  "outputs": [{"id": "margin", "kind": "scalar"}, {"id": "air", "kind": "scalar", "of": "airtime"},
              {"id": "dd", "kind": "series", "of": "d"}, {"id": "mm", "kind": "series", "of": "margin"}] }
```

### 4.3 The engine

```js
rf = { id: 'rf@1', format: 'noema.rf/v1', limits, MODELS, MODS, SCALARS, SERIES, NUM_FIELDS, check, checkSpec, create, num, engine, simEngine,
            fspl, twoRay, crossover, logDistance, hata, indoor, fresnelRadius, knifeEdge, noiseFloor, Q, erfc, ber, per, loraAirtime, bleAirtime, wifiAirtime }
create(link, {seed}) → {run() → {scalars, series, codes}, at(d), range()}
```

**Codes.** `format`, `value`, `enum`, `range` (Hata or P.1238 outside validity, f outside 1 MHz–100 GHz), `size`, `unknown-field`
(warning); in a spec also `binding` and `output`. `run().codes`: `range` (outside the model's validity at `d`: NaN), `range-open`,
`range-none`.

**Accuracy and limits** (`tests/rf.js`): FSPL 2.4 GHz/100 m 80.052 dB; Hata 900 MHz/10 km 147.390 dB; LoRa airtime equal to the
Semtech calculator (SF7 10 B 41.216 ms … SF12 51 B 2465.792 ms); BPSK BER within 3 % of the tables. Textbook medians: no multipath
fading, no interference, no antenna patterns; BLE/Wi-Fi airtime and Wi-Fi/LoRa error rates are approximations (uncoded).

**Uses the kernel (2026-11-07).** The shadowing draw and the sweep's draws come from kernel streams (`rf:shadow`, `rf:sweep`;
normals by inversion), the maximum range and the required Eb/N0 are Brent's roots (`SK.brent`, on log d and log Eb/N0) instead of
bisection; erfc (the BER curves' Q) is the kernel's `SK.erfc` (Q(½, x²), accurate in the far tail) instead of NR erfcc (1.2e-7).
FALLBACK without the kernel (marked): mulberry32, bisection, erfcc. No stepper (a link budget has no time).

## 5. `twin@1` — the digital twin of an IoT node (`src/engines/twin/twin.js`)

A small discrete-event simulator of a battery-powered microcontroller node: "design the duty cycle" exercises and fault-finding
benches (a device with one hidden fault: the learner reads the battery, the current, the radio and the event log, then diagnoses).

### 5.1 The model

- **Firmware** — wake every `period`; sense for `sense` s; every `txEvery`-th wake transmit (TX for the airtime); with `ack`,
  listen `rxWindow` s and retry up to `retries` times; sleep the rest. A wake that cannot finish before the next is an `overrun`.
- **Battery** — charge drawn `∫(I + I_sd)dt` (mAh); SoC = soc0 − drawn/capacity; open-circuit voltage from a per-cell curve (li-ion
  4.2→3.0 V, lifepo4 3.6→2.5, alkaline 1.55→0.9, nimh 1.4→1.0, or `custom`) × cells; loaded voltage = V_oc − I·rInt;
  self-discharge a fraction of the capacity per month. Empty when SoC ≤ 0 or V_oc < cutoff.
- **Brown-out** — before every sense / TX / RX segment: loaded voltage < `brownout.v` → the segment is aborted, `reset` is logged,
  the node boots and waits a full period.
- **Radio** — rf@1's formulas (log-distance + seeded shadowing per message + `extra`; SNR against kTB + NF; PER from the LoRa or FSK
  BER; LoRa / BLE / FSK airtime or `txTime`). A message is delivered when a seeded draw ≥ PER.
- **Sensors** — `base + amp·sin(2πt/cycle)` is the truth; a reading adds `drift`/day and seeded `noise`.
- **Analytic** — `I_avg = (sense·I_sense + (air·I_tx + ack·rxWindow·I_rx)/txEvery + sleep·I_sleep)/period + I_sd`, life =
  capacity·soc0 / I_avg: the "capacity / average current" of every datasheet.

```json
{ "format": "noema.twin/v1",
  "battery": {"capacity": 600, "chem": "li-ion", "cells": 1, "selfDischarge": 0.02},
  "power": {"sleep": 0.005, "active": 5, "tx": 40, "rx": 12},
  "schedule": {"period": 60, "sense": 0.05, "txEvery": 1, "ack": true, "rxWindow": 1, "retries": 2},
  "sensors": [{"id": "temp", "base": 21, "amp": 3, "noise": 0.2}],
  "radio": {"tech": "lora", "sf": 9, "f": 868e6, "power": 14, "gain": 2, "d": 2000, "n": 2.7, "sigma": 4, "payload": 12},
  "brownout": {"v": 2.9}, "sim": {"duration": 2592000, "samples": 300, "trace": 1300} }
```

Units: mAh, mA, s, V, Ω, dBm, Hz, m. In a spec: `model: {device, bindings: [{field, expr}]}` (`field` a numeric field such as
`schedule.period`); outputs `{id, kind, of?, sensor?}`. **Scalars**: `lifeAnalytic lifeSim iAvg iAvgAnalytic chargeUsed socEnd vEnd
vMin wakes sent attempts delivered lost deliveryRatio resets dead tDead rssiMean snrMean per airtime activeFraction`, per sensor
`readingMean readingLast readingErr` (times in s, currents in mA), and (§5.5) `tempMin tempMax tempMean collisions slotMisses
clockErrMax ppmMean`. **Series** (`samples` bins): `t soc v vload current delivered resets rssi temp clockErr`; per message `rxT
reading truth`; the current trace `traceT traceI`; the log `eventT eventCode` (1 reset, 2 lost, 3 dead, 4 overrun, 5 collision, 6
slot-miss). `lifeSim` is the time of death, else extrapolated from the charge used — simulate a month and read the life.

### 5.2 Faults (a bench fault's `apply`; hidden: they reach only the engine)

| kind | fields (default) | symptom |
|---|---|---|
| `sensor-stuck` | `sensor`, `at` (0 s), `value` | identical readings, the error against the truth grows |
| `sensor-drift` | `sensor`, `rate` (1 unit/day), `at` | an error that grows linearly |
| `battery-ageing` | `factor` (0.5 × capacity, ≤ 1), `rInt` (3 × resistance) | shorter life, deeper sag, brown-outs under TX |
| `antenna-detached` | `loss` (20 dB) | RSSI −20 dB, deliveries fall on a marginal link |
| `wake-period` | `period` (s) or `factor` (0.1 ×) | 10× wakes, current and life |
| `brownout` | `v` (3.6 V): the BOR level set too high | resets long before the battery is empty |
| `clock-drift` | `ppm` (+200 ppm) | missed receive slots (`slot-miss` in the log) when `clock.guard` is set |
| `sync-wake` | `nodes` (5 if the channel had none) | every node wakes in step (after a power cut): collisions on every message |
| `busy-channel` | `nodes` (+50) | more collisions, lost messages, retries and current |
| `sensor-tempco` | `sensor`, `coef` (0.5 per °C) | a reading that follows the temperature (with `env.swing`, a daily wave) |

### 5.3 The bench — `spec.bench` on `twin@1`

`twin@1` declares `bench: true`, so the app's bench (`docs/INTERACTIVE.md` §12.7, `docs/INTERACTIVE_CIRCUIT.md` §2: faults, points,
instruments, budget, diagnosis, the hidden fault, the values `diagnosis` / `measurements` / `correct`) runs on a device instead of
a board. What differs:

- **points** `at` is one of `vbat` (the battery, open circuit at the end of the run), `vload` (the battery under load: its lowest
  voltage), `i` (the supply current) and `gnd`.
- **instruments**: `V` (red lead on `vbat` or `vload`, black on `gnd`: list its points, never one at `i`), `I` (the average supply
  current: one part `{"element": "battery", "label": …}`), `scope` (the supply current over time: its points only at `i`, `tEnd`
  and `tStart` in s within `sim.trace`; the log keeps peak to peak, mean and the wake frequency, in A and Hz), and two of the
  twin's own: `log` (the event log: resets, lost messages, overrun wake-ups, and collisions and missed slots when there are any),
  `rssi` (the mean received signal strength, dBm), `T` (the thermometer: the last, lowest and highest temperature, °C) and `clock`
  (the clock against a reference: the mean drift in ppm and the worst error in s); these four take only `kind`. `R` and `logic` are the circuit's.
- **faults** `apply` is a list of §5.2 faults (`[]` = a healthy device); `twin.checkFaults` checks them.

```json
"bench": { "faults": [ {"id": "antenna", "apply": [{"kind": "antenna-detached"}]}, {"id": "ageing", "apply": [{"kind": "battery-ageing"}]},
                       {"id": "wake", "apply": [{"kind": "wake-period", "factor": 0.1}]} ],
           "points": [ {"id": "VBAT", "at": "vbat", "label": "ptVbat"}, {"id": "VLOAD", "at": "vload", "label": "ptVload"},
                       {"id": "GND", "at": "gnd", "label": "ptGnd"}, {"id": "ISENSE", "at": "i", "label": "ptI"} ],
           "instruments": [ {"kind": "V", "points": ["VBAT", "VLOAD", "GND"]}, {"kind": "I", "parts": [{"element": "battery", "label": "ptI"}]},
                            {"kind": "scope", "points": ["ISENSE"], "tEnd": 1300}, {"kind": "log"}, {"kind": "rssi"} ],
           "budget": 6,
           "diagnosis": { "options": [ {"label": "dxAntenna", "fault": "antenna"}, {"label": "dxAgeing", "fault": "ageing"},
                                       {"label": "dxWake", "fault": "wake"}, {"label": "dxNone"} ] } }
```

The app's words for the new instruments are `engine.act.bench.inst.log`, `engine.act.bench.inst.rssi`, `engine.act.bench.current`
(the scope's axis) and `engine.act.bench.logStats`, in every UI language. A good twin bench gives each fault a symptom one
instrument shows (the RSSI for the antenna, the average current for the wake period, the voltage under load for an aged cell, the
log for a brown-out level set too high) and a tempting wrong option ("nothing is wrong", "the sensor is broken").

### 5.4 The engine

```js
twin = { id: 'twin@1', format: 'noema.twin/v1', limits, FAULT_KINDS, SCALARS, SERIES, NUM_FIELDS, EVENT_CODES, CHEMS,
              check, checkFaults, checkSpec, create, num, source, engine, simEngine, radio: {…} }
create(device, {seed, faults}) → { run() → {scalars, perSensor, series, readings, truth, log, logCount, counts}, measure(probe), analytic() }
measure: {kind: 'V', a: 'vbat' | 'vload', at?} · {kind: 'I'} (A) · {kind: 'scope', node: 'i', tStart, tEnd} (A, unit: 'A') · {kind: 'log'} (→ `events`: the first 1000 entries, `count`, `counts`: per code over the whole run) · {kind: 'rssi'} · {kind: 'T'} (→ value, min, max, °C) · {kind: 'clock'} (→ value ppm, err s)
```

**Codes.** `check`: `format`, `value` (a number out of its kind, a custom curve that is not 0→1 rising, sense ≥ period, …),
`enum`, `size`, `dup-id`, `budget` (the estimated events exceed `sim.maxEvents`, default 10⁶), `unknown-field` (warning).
`checkFaults`: `fault`. `checkSpec`: also `binding`, `output`. A very short period over a long `sim.duration` hits the event
budget: keep the slider's minimum where the budget holds (sensor-node: 30 s over 30 days).

**Accuracy and limits** (`tests/twin.js`): the simulated life of a 60 s duty cycle equals capacity / average current to < 0.001 %;
a year at a 10-minute period runs in ~100 ms. Not modelled: Peukert, regulators, ack loss (§5.5 adds temperature, clock drift and
collisions).

### 5.5 Temperature, the clock and the channel (optional blocks; without them the twin is as before)

- **`env: {temp = 25, swing = 0, cycle = 86400}`** — the ambient temperature `temp − swing·cos(2πt/cycle)` (°C). Below 25 °C the
  capacity shrinks by `battery.tempCap` per °C (default per chemistry: li-ion 0.008, lifepo4 0.01, alkaline 0.015, nimh 0.01; at
  most to 20 %) and rInt grows ×e^(0.035·(25 − T)) (a cold cell sags and browns out under TX); self-discharge doubles every 10 °C
  and the sleep current every 15 °C above 25 °C. A sensor's `tempco` (per °C away from 25 °C) makes its reading follow the
  temperature. The thermometer (`T`), the series `temp` and `tempMin tempMax tempMean` show it.
- **`clock: {ppm = 0, tempco = 0, t0 = 25, guard = 0, resync = 0}`** — the crystal runs `ppm + tempco·(T − t0)²` fast (a 32 kHz
  tuning-fork crystal: `tempco` −0.034). Its error grows between synchronisations: every `resync` s (a beacon; 0 = none) and every
  acknowledged delivery. With `guard` > 0 the gateway listens ±guard s around the expected time: beyond it the message is a
  `slot-miss` (logged, lost). The `clock` instrument, `clockErr`, `clockErrMax`, `ppmMean` show it.
- **`network: {nodes = 0, period?, airtime?, jitter = 1, capture = 6, spread = 6, offset = 0}`** — `nodes` other devices on the
  same channel (pure ALOHA), each sending for `airtime` every `period` (default: this device's). `jitter` 1 = random access
  (Poisson arrivals in the vulnerable window), < 1 = fixed phases (0: all in step, the `sync-wake` fault). A collision destroys our
  message unless it arrives `capture` dB stronger than the other (their level: our median + `offset` ± `spread` dB, seeded).
  Collisions are logged (`collision`) and counted (`collisions`); with `ack` they cost retries and current.

**Uses the kernel / parts (2026-11-07).** The radio, each sensor and the network draw from kernel streams (`twin:radio`,
`twin:sensor:<id>`, `twin:network`; normals by inversion, the other nodes' packets by the kernel's Poisson). The firmware's loop is a
generator (`simGen`): `run()` drives it to the end; the new **stepper** (`engine.stepper = true`) pauses it at each macro step's end
(a sleep is split there) and gives the scalars so far and each series' value now. Its state is a running program, so `snapshot()` is
−1 (a twin part can be chained and co-simulated, not iterated); the device is the one at `stepInit`. FALLBACK without the kernel
(marked): mulberry32 + Box–Muller. erfc (LoRa's BER) is the kernel's `SK.erfc` (FALLBACK: NR erfcc).

## 6. Reference activities (`tools/activities_examples/`)

| id | engine | the task | checks |
|---|---|---|---|
| `heatsink` | `thermal@1` | a 20 W MOSFET at 40 °C: choose the heatsink's Rsa so that Tj ≤ 125 °C, no bigger than needed | `tjSS <= TjMax`, `Rsa >= RsaMin` |
| `pid-tune` | `pid@1` | tune Kp, Ki, Kd on a lightly damped plant with dead time | `os < 10`, `ts < 2`, `abs(ess) < 0.02` |
| `lora-link` | `rf@1` | pick SF and the sensor antenna for 10 dB of margin at 2 km within 0.5 s on air | `margin >= 10`, `air <= 0.5` |
| `sensor-node` | `twin@1` | choose the wake period for ≥ 1 year of battery and ≥ 24 readings a day | `life / 86400 >= 365`, `perDay >= 24` |

Each has its strings in en, el, ru and fr, a fallback picture and text, and `tests.json` (the right answers and tempting wrong
ones). `tests/activities_pack.py` builds them into a pack and back; `tests/activities_app.js` runs them in the app (and the twin
bench on a modified `sensor-node`).
Start your own from one of them: `python3 activity_new.py <subject-dir> <id> --from heatsink` (or `pid-tune`, `lora-link`,
`sensor-node`): the spec, the strings, a fallback picture and two of the reference's cases as a TODO `tests.json`.
