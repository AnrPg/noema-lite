# The circuit engine `circuit-mna@1`

A small, deterministic circuit simulator for tier B (`sim-spec@1`, `docs/INTERACTIVE.md` §12): RC/RLC transients, filters, PWM,
transistor and op-amp stages, and **fault-finding benches** (a virtual board with a hidden fault: the learner measures, then
diagnoses). It is trusted app code; the pack carries only data — a netlist, the bindings of the controls, the outputs, the bench.
§1 is how a spec uses it, §2 the bench, §3 onwards the engine itself. How to write a good bench: `docs/INTERACTIVE_AUTHORING.md`.
The reference activities: `rc-transient` and `led-bench` (`tools/activities_examples/`; `activity_new.py --from led-bench`).

## 1. In a sim-spec — `"engine": "circuit-mna@1"`

```json
{ "format": "noema.sim-spec/v1", "engine": "circuit-mna@1",
  "consts": { "target": 0.001 },
  "params": [ { "id": "R", "kind": "slider", "label": "resistance", "min": 100, "max": 10000, "scale": "log", "default": 4700, "unit": "Ω", "format": "si" },
              { "id": "C", "kind": "slider", "label": "capacitance", "min": 1e-8, "max": 1e-5, "scale": "log", "default": 1e-6, "unit": "F", "format": "si" } ],
  "model": {
    "netlist": { "format": "noema.circuit/v1", "nodes": ["in", "out"], "elements": [
      { "id": "V1", "type": "V", "n": ["in", "gnd"], "value": { "pulse": { "v1": 0, "v2": 5, "width": 0.005, "period": 0.01 } } },
      { "id": "R1", "type": "R", "n": ["in", "out"], "value": 4700 },
      { "id": "C1", "type": "C", "n": ["out", "gnd"], "value": 1e-6 } ] },
    "bindings": [ { "element": "R1", "expr": "R" }, { "element": "C1", "expr": "C" } ],
    "transient": { "tEnd": 0.01, "dt": 0.00001 } },
  "outputs": [ { "id": "t", "kind": "series", "time": true }, { "id": "vc", "kind": "series", "node": "out" },
               { "id": "vAt", "kind": "scalar", "node": "out", "at": "target" }, { "id": "vMax", "kind": "scalar", "node": "out", "stat": "max" } ] }
```

- **model** (`{netlist, bindings?, transient?, noise?}`, nothing else): `netlist` is §3.1 (checked with `check()`: its errors refuse
  the spec, its warnings are warnings). `bindings` (≤ 24) set a part from the controls on every run: `{element, prop?, expr}` —
  `prop` defaults to `value` (R, C, L, a DC source); `on` for a switch (a toggle param); `pulse.v2`, `sine.freq`, `pwm.duty` … for
  a source with that waveform. `expr` is an expression (`docs/INTERACTIVE_SIMEXPR.md`) of the consts, params and derived values —
  computed by the app on the main thread, so the engine (in its Worker) gets numbers only. `transient` (`tEnd`, `dt?`: numbers or
  expressions; ≤ 200 000 steps) is needed by series outputs and by `at` / `stat`. `noise` (`{rel, abs?}`) adds the seeded meter
  noise of §5.
- **outputs**: `series` — `time: true` (the time axis), a `node` or a `branch` (a part's current) of the transient, thinned to
  2000 points; `scalar` — a `node` or `branch` at the DC operating point, or of the transient `at` a time (a number or expression)
  or as a `stat` (`final`, `min`, `max`, `mean`, `pp`, `rms`); or a `probe` (`{kind: V | I | R, a, b? | element, pin?}`, an
  instrument reading; an ohmmeter's `OL` is ∞). Scalars join the names of readouts, marks and checks; series feed `series` plots.
- A run that fails (no convergence, the step budget) leaves the outputs as — (gaps in the plots); nothing breaks.

## 2. The fault-finding bench — `spec.bench`

A bench is a board with **one hidden fault**, drawn by the seed or fixed by the exercise. The learner picks an instrument and where
its leads go, measures (each measurement goes into a log), and names the fault from a list. Then — and only then — the bench says
what the fault was. In a sim exercise the app's checks grade the diagnosis and the measurements; in a theory block (an explorer)
the learner checks the diagnosis on the bench and can take **another device**.

```json
"bench": {
  "faults": [ { "id": "ledReversed", "apply": [ { "element": "D1", "kind": "reverse" } ] },
              { "id": "rOpen", "apply": [ { "element": "R1", "kind": "open" } ] },
              { "id": "openTrace", "apply": [ { "node": "a", "kind": "open-trace", "side": ["D1"] } ] } ],
  "points": [ { "id": "TP3", "at": "TP3", "label": "tp3" }, { "id": "LA", "at": "@D1.0", "label": "ledA" }, { "id": "GND", "at": "gnd", "label": "gnd" } ],
  "instruments": [ { "kind": "V" }, { "kind": "I", "parts": [ { "element": "R1", "label": "iR1" } ] }, { "kind": "R" },
                   { "kind": "scope", "tEnd": 0.02, "dt": 1e-5 }, { "kind": "logic", "tEnd": 0.02, "threshold": 2.5 } ],
  "budget": 8,
  "diagnosis": { "options": [ { "label": "dxSupply" }, { "label": "dxROpen", "fault": "rOpen" },
                              { "label": "dxTrace", "fault": "openTrace" }, { "label": "dxLedReversed", "fault": "ledReversed" } ] } }
```

- **faults** (1–16): `{id, apply}`; `id` a name (a letter, then letters, digits, `_`, `-`; ≤ 32), `apply` ≤ 4 faults of §4 (`[]`
  is a healthy board). A sim exercise picks one with `task.params.fault` — an id, or a list of ids the seed draws from; without it
  the seed draws from all of them.
- **points** (1–24): `{id, at, label}` — where a lead can go: a node, a test point (a probe-only label), `gnd`, or a pin such as
  `@D1.0` (the leg itself: after an open trace it is on the far side, which is how a broken track shows).
- **instruments** (1–5, each kind once): `V` and `R` (a meter with a red and a black lead on the `points`, or on the instrument's
  own `points` list), `I` (an ammeter in series with one of its `parts`: `{element, label, pin?}`), `scope` (one channel against
  GND: `tEnd` required, `dt?`, `tStart?`; its face is a trace plot, the log keeps peak to peak, mean and frequency) and `logic`
  (the same times plus `threshold`; its face is a logic trace, the log keeps frequency and duty cycle; over 2000 edges the trace
  is cut just before the first edge it leaves out, `cut: true`, while the stats stay those of the whole capture). The times may be expressions.
- **budget** (optional, 1–100): the measurements allowed; Measure is disabled after the last one.
- **diagnosis**: `label?` (the heading; default "Your diagnosis") and 2–12 `options` `{label, fault?}`. Every fault is named by
  exactly one option; options without a fault are tempting wrong answers ("the supply is dead"). Every label (points, parts,
  options) is a key of **every** string table.
- **Values for the checks** (in a sim exercise; never in a readout or a mark, never declared as names): `diagnosis` (the option's
  index from 0, −1 before one is chosen), `measurements` (how many were taken), `correct` (true when the option names the hidden
  fault). Check waits until a diagnosis is chosen. Typical grading:
  `{"mode": "checks", "checks": [{"expr": "correct", "label": "checkDx", "weight": 3}, {"expr": "measurements <= 6", "label": "checkEff"}], "pass": 0.75}`.
- **Events** (the attempt's log): `measure {i, a, b}` or `{i: "I", part}`, `diagnose {option}`, and `reset` for another device.
- **State** (an explorer only): the device (its seed), the log of readings, the diagnosis and whether it was checked — the same
  device comes back after a reload. A sim exercise always starts with a fresh bench.
- **The hidden fault stays hidden**: it lives in the runtime's closure and in the engine's options. The page, the labels, the log,
  the saved state and the checks' values before a diagnosis never name it; the verdict ("Right: …" / "Not this one. The fault
  was: …") appears only after the diagnosis is checked (Check in an exercise, "Check my diagnosis" in an explorer). The pack's
  spec lists the faults, of course: a learner with the developer tools can read them, as they can read any answer key.
- Each measurement runs in the engine's Worker, in order (the latest run of the outputs wins; measurements are first in, first
  out); the noise is seeded by the exercise's seed, so the same device always reads the same numbers.

## 3. The engine — `window.NoemaCircuit`

`engine/src/36_engine_circuit.js` → `window.NoemaCircuit` (also `globalThis` in node); `engine/src/36_engine_circuit_sim.js`
registers it with `ACT.registerEngine` (`bench: true`, a `prepare` that evaluates the expressions on the main thread, and a
`workerSource` made of the engine's own source and the adapter). Pure JS, deterministic, no DOM, no learner text: results are
numbers and codes; the activity words them. Schema: `tools/schemas/noema.circuit.v1.schema.json`. Tests: `node tests/circuit.js`;
JS and Python (`tools/circuit.py`, the validators' twin) give the same findings for `check` / `checkFaults` (`tests/activities.js`).

```js
NoemaCircuit = { id: 'circuit-mna@1', format: 'noema.circuit/v1', limits: {nodes: 60, elements: 200, steps: 200000}, FAULT_KINDS, check, checkFaults, create, num, source }
check(netlist)                    → [] | [{code, path, msg, level: 'error'|'warning'}]     (msg is for authors, never shown to learners)
checkFaults(netlist, faults)      → [] | [{code: 'fault', path: 'faults[i].x', msg, level: 'error'}]   (what create() would throw, as a list)
create(netlist, {faults, noise: {rel, abs, seed}, seed}) → sim                             (throws code 'invalid' with .problems)
sim.dc({mode: 'avg'|'t0'})        → {nodes: {name: V}, branches: {id: I}, pins: {id: [I into each pin]}}
sim.transient({dt, tEnd, maxSteps, uic}) → {t: [...], nodes: {name: [...]}, branches: {id: [...]}}
sim.measure(probe)                → an instrument reading (§5)
sim.set(id, {on} | {value})       → the learner flips a switch / turns a knob (faults stay)
source()                          → the engine's own source, to run it in a Worker
```

### 3.1 Netlist `noema.circuit/v1`

```json
{ "format": "noema.circuit/v1",
  "nodes": ["vin", "out", {"name": "TP1", "probe": "out"}],
  "elements": [
    {"id": "V1", "type": "V", "n": ["vin", "gnd"], "value": {"pwm": {"v": 5, "freq": 1000, "duty": 0.3}}},
    {"id": "R1", "type": "R", "n": ["vin", "out"], "value": "10k"},
    {"id": "C1", "type": "C", "n": ["out", "gnd"], "value": "1u", "ic": 0} ] }
```

* **nodes**: names `[A-Za-z0-9_][A-Za-z0-9_+-]{0,31}`; `gnd` and `0` are ground (need not be listed). `{name, probe: node}` is a
  **probe-only label** (a test point): instruments read it, elements cannot connect to it. At most 60 nodes.
* **elements** (≤ 200): `id` (`[A-Za-z][A-Za-z0-9_-]{0,31}`, unique), `type`, `n` (terminals in the order below), then `value`,
  `ic`, `params`, `preset`, `on` by type. Quantities are numbers or SI strings (`"4.7k"`, `"100n"`, `"2meg"`; `m` milli, `M` mega).
* **Sign convention**: every current is the current *into* a pin. `branches[id]` is the current into `n[0]` (through the part to
  `n[1]`); a source delivering power therefore shows a negative current. For transistors it is the collector / drain current, for
  the op-amp the output-pin current.

| type | n | value / params (defaults) | model |
|---|---|---|---|
| `R` | a b | `value` Ω > 0 | — |
| `C` | a b | `value` F, `ic` initial V (optional) | trapezoidal companion; open in DC |
| `L` | a b | `value` H, `ic` initial A | branch current; short in DC |
| `V` | + − | `value`: number \| `{dc}` \| `{pulse:{v1,v2,delay,rise,fall,width,period}}` \| `{sine:{offset,amp,freq,phase°,delay}}` \| `{pwm:{v,freq,duty,low,delay}}` | ideal; pulse as in SPICE (`width` defaults to a step, or half the period) |
| `I` | into n[0] | same waveforms, amperes | ideal |
| `D` | anode cathode | `params {Is 1e-14, n 1}` or `preset` `1n4148` `1n4001` `led-red` (1.8 V) `led-orange` (2.0) `led-yellow` (2.05) `led-green` (2.1) `led-blue` `led-white` (3.0 V, all at 20 mA, n = 2) | Shockley + gmin; no breakdown, no series R |
| `SW` | a b | `on` true/false, `params {Ron 0.01, Roff 1e9}` | a resistor |
| `NPN` `PNP` | c b e | `params {Is 1e-14, betaF 100, betaR 1}`; presets `2n3904` `2n2222` `bc547` / `2n3906` `bc557` | Ebers–Moll transport (no Early effect, no capacitances) |
| `NMOS` `PMOS` | d g s | `params {Vth 1.5, k 0.1 A/V², lambda 0}`; Id(sat) = k/2·(Vgs−Vth)²·(1+λVds); presets `2n7000` `bs170` `irlz44n` / `bs250` `irf9540` | level-1 square law, symmetric (d/s swap); `Vth` is a magnitude for PMOS; no gate capacitance |
| `OPAMP` | in+ in− out [v+ v−] | `params {gain 1e5, rails [−15, 15], headroom 0}`; with 5 terminals the rails are the supply-pin voltages | ideal inputs, VCVS output to ground with exact gain, clamped smoothly (50 mV knee) to the rails; no GBW or slew |

## 4. Faults (hidden from the learner: `create(netlist, {faults: [...]})`)

| fault | effect |
|---|---|
| `{element, kind: 'open', pin?}` | the part stops conducting (all pins, or only `pin`); its legs stay on the board |
| `{element, kind: 'short', pins?}` | a 1 mΩ path between two pins: a two-terminal part becomes a wire; default pins c–e, d–s, in+–in− |
| `{element, kind: 'drift', factor = 2, param?}` | multiplies `value` (R, C, L, V/I waveform voltages), `Is` (D), `Ron` (SW), `betaF`, `k`, `gain` — or the named `param` |
| `{node, kind: 'open-trace', side?}` | the node is split in two; `side` lists the elements (or pins `"R2.1"`) that move to the far side, default the last element touching the node; works on `gnd` too |
| `{element, kind: 'reverse', pins?}` | the part is soldered the other way round: two of its pins swap places (default the two pins of a two-terminal part; a three-terminal part names `pins`, e.g. `[0, 2]`). Applied before an open trace, so a pin reference follows the leg |

An unknown element, node, pin or kind throws code `fault`; `checkFaults` lists the same problems without throwing (the validators
use it, and its Python twin in `tools/circuit.py`). Results never name a fault.

## 5. Instruments — `sim.measure(probe)`

Endpoints (`a`, `b`, `node`, `ref`) are node names, labels, or **pin references** `"@R2.0"` (where that leg is soldered: after an
open trace it is on the far side). `b` / `ref` default to `gnd`.

| probe | reading |
|---|---|
| `{kind:'V', a, b}` | `{value V, unit:'V'}` — DC operating point, sources at their **average** (pulse/pwm duty-weighted, sine offset) |
| `{kind:'I', element, pin?}` | `{value A, unit:'A'}` — same operating point; `branches` convention, or the current into `pin` |
| `{kind:'R', a, b}` | `{value Ω \| 'OL', unit:'ohm'}` — unpowered: V sources shorted, I sources open, op-amps off; 1 mA injected into `a`, R = (va − vb)/1 mA; `'OL'` above 20 MΩ. In circuit, so parallel paths count; a diode reads its drop / 1 mA in one direction, OL in the other |
| `{kind:'scope', node, ref, tEnd, dt?, tStart?}` | `{t, v, unit:'V', stats:{min, max, mean, pp, rms, freq}}` — a transient (dt defaults to tEnd/1000) shown from `tStart` |
| `{kind:'logic', nodes, threshold = 1.5, tEnd, dt?, tStart?}` | `{t, traces:{node:[0/1]}, edges:{node:[{t, to}]}, stats:{node:{freq, duty, edges}}, threshold}` — edge times interpolated between samples; noise is not applied |

**Noise** `{noise: {rel, abs = 0, seed}}` (or `opts.seed`): reading · (1 + rel·u) + abs·u′, u uniform in [−1, 1] from mulberry32 seeded
by the seed and the probe itself. The same probe on the same sim always reads the same; same seed ⇒ identical numbers everywhere.

## 6. Analysis

* **MNA**: unknowns are the node voltages plus the currents of V, L, OPAMP outputs and capacitors with `ic`. Dense LU with partial
  pivoting; for a linear circuit the factorisation is reused while the step and method do not change.
* **Newton–Raphson** with SPICE junction limiting (`pnjlim`) on diodes and BJTs; convergence |Δv| ≤ 1 µV + 1e-6·|v|, |Δi| ≤ 1 nA + 1e-6·|i|,
  no limiting active. Failing that: gmin stepping (1e-2 → 1e-12 S to ground), then source stepping (10 % steps). In a transient step:
  gmin stepping from the previous point. Still failing → code `no-convergence` (`.t` for a transient).
* gmin = 1e-12 S from every node to ground and across every junction: floating nodes settle at 0 V instead of making the matrix singular.
* **Transient**: fixed step `dt`, `steps = ceil(tEnd/dt)`, samples at k·dt from t = 0. It starts from the operating point at
  t = 0⁻ (sources before any edge at 0, so a pulse from 0 is a step; `C.ic` / `L.ic` enforced); `uic: true` skips the operating
  point (all nodes 0, C at `ic` or 0). Trapezoidal rule; **backward Euler** on the first step and on every step that holds a source
  breakpoint (pulse corners, PWM edges). Sources are sampled at the step ends: choose `dt` dividing the PWM period and duty for
  exact averages.
* Results are cached per sim (one DC point per mode, the last transient); `set()` rebuilds the sim.

## 7. Error codes

`check()`: errors `format`, `node-name`, `dup-node`, `size`, `id`, `dup-id`, `type`, `pins`, `unknown-node`, `probe-only`, `value`
(missing / out of range, waveform fields), `param`, `preset`, `no-ground`, `vloop` (a loop of V sources and inductors, or an op-amp
output on such a node); warnings `floating` (no DC path to ground: through C or I only, an op-amp input, a MOSFET gate), `unused`,
`self-loop`, `unknown-field`. `checkFaults()`: code `fault` with the path of the field. Thrown (`err.code`): `invalid`, `fault`,
`budget` (more than `maxSteps` or 200 000 steps, with `.steps`), `bad-args`, `singular`, `no-convergence`, `unknown-node`,
`unknown-element`, `probe`. The sim-spec adapter turns a thrown error into `{error: code}` (a reading the log shows as "this
measurement could not be made", outputs as —).

## 8. Accuracy (tests/circuit.js) and limits

| check | result |
|---|---|
| divider, op-amp inverting gain (A = 1e5), MOSFET triode/saturation, diode and LED drops, BJT Vce(sat) (Ebers–Moll formula) | ≤ 1e-6 relative / ≤ 0.1 µV |
| RC charge v(RC), dt = RC/1000 | 2.4e-7 relative |
| RL i(τ), dt = τ/1000 | 2.4e-7 |
| series RLC: damped frequency / decay α (dt = T/4000) | 1.9e-7 / 5.5e-7 |
| RC low-pass at fc, sine steady state, 400 samples/period | 0.0001 dB off −3.0103 dB |
| PWM 30 % through RC, mean of the last 10 periods | 8e-5 |
| 20000-step RC transient in node | ~30–70 ms (limit 300 ms) |

Limits: ≤ 60 nodes, ≤ 200 elements, ≤ 200 000 steps per transient; fixed step only (no adaptive step control); no AC/small-signal
analysis (use a sine transient), no temperature, no noise analysis; device models are first-order (see the table). A DMM reading of
a nonlinear circuit driven by PWM uses averaged sources, not the true average of the waveform — use the scope's `stats.mean` there.
