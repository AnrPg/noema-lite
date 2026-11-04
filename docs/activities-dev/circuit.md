# The circuit engine `circuit-mna@1` (draft for docs/INTERACTIVE.md)

`engine/src/36_engine_circuit.js` → `window.NoemaCircuit` (also `globalThis` in node). Pure JS, deterministic, no DOM, no learner
text: results are numbers and codes; the activity words them. Schema: `tools/schemas/noema.circuit.v1.schema.json`. Tests: `node tests/circuit.js`.

```js
NoemaCircuit = { id: 'circuit-mna@1', format: 'noema.circuit/v1', limits: {nodes: 60, elements: 200, steps: 200000}, check, create }
check(netlist)                    → [] | [{code, path, msg, level: 'error'|'warning'}]     (msg is for authors, never shown to learners)
create(netlist, {faults, noise: {rel, abs, seed}, seed}) → sim                             (throws code 'invalid' with .problems)
sim.dc({mode: 'avg'|'t0'})        → {nodes: {name: V}, branches: {id: I}, pins: {id: [I into each pin]}}
sim.transient({dt, tEnd, maxSteps, uic}) → {t: [...], nodes: {name: [...]}, branches: {id: [...]}}
sim.measure(probe)                → an instrument reading (below)
sim.set(id, {on} | {value})       → the learner flips a switch / turns a knob (faults stay)
```

## Netlist `noema.circuit/v1`

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

## Faults (hidden from the learner: `create(netlist, {faults: [...]})`)

| fault | effect |
|---|---|
| `{element, kind: 'open', pin?}` | the part stops conducting (all pins, or only `pin`); its legs stay on the board |
| `{element, kind: 'short', pins?}` | a 1 mΩ path between two pins: a two-terminal part becomes a wire; default pins c–e, d–s, in+–in− |
| `{element, kind: 'drift', factor = 2, param?}` | multiplies `value` (R, C, L, V/I waveform voltages), `Is` (D), `Ron` (SW), `betaF`, `k`, `gain` — or the named `param` |
| `{node, kind: 'open-trace', side?}` | the node is split in two; `side` lists the elements (or pins `"R2.1"`) that move to the far side, default the last element touching the node; works on `gnd` too |

An unknown element, node, pin or kind throws code `fault`. Results never name a fault.

## Instruments — `sim.measure(probe)`

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

## Analysis

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

## Error codes

`check()`: errors `format`, `node-name`, `dup-node`, `size`, `id`, `dup-id`, `type`, `pins`, `unknown-node`, `probe-only`, `value`
(missing / out of range, waveform fields), `param`, `preset`, `no-ground`, `vloop` (a loop of V sources and inductors, or an op-amp
output on such a node); warnings `floating` (no DC path to ground: through C or I only, an op-amp input, a MOSFET gate), `unused`,
`self-loop`, `unknown-field`. Thrown (`err.code`): `invalid`, `fault`, `budget` (more than `maxSteps` or 200 000 steps, with
`.steps`), `bad-args`, `singular`, `no-convergence`, `unknown-node`, `unknown-element`, `probe`.

## Accuracy (tests/circuit.js) and limits

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
