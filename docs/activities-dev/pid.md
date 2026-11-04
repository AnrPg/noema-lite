# The control-loop engine `pid@1`

Control loops for tier B (`sim-spec@1`, `docs/INTERACTIVE.md` §12): tune a PID on a plant, watch windup, compare P and PI, see
dead time and noise. Trusted app code (`engine/src/40_engine_pid.js` → `NoemaPID`), pure JS, deterministic (seeded noise), no
DOM, no learner text (codes and numbers only). Registered with one line: `ACT.registerEngine(NoemaPID.engine)` (`{id, check,
prepare, create, workerSource}`, like `circuit-mna@1`). Schema `tools/schemas/noema.pid.v1.schema.json`; Python twin of the
checks `tools/pid.py`; tests `node tests/pid.js`.

## Model — `model: {plant, controller?, mode?, setpoint?, load?, disturbance?, noise?, metrics?, transient, bindings?}`

| plant `type` | fields (defaults) | equation (u: the plant's input) |
|---|---|---|
| `fopdt` | `K`, `tau`, `theta`, `y0` | τ·y′ = K·u(t−θ) − y |
| `second` | `K`, `wn`, `zeta`, `theta`, `y0` | y″ + 2ζωn·y′ + ωn²·y = K·ωn²·u |
| `integrator` | `K`, `theta`, `y0` | y′ = K·u |
| `motor` | `J` 0.01, `b` 0.1, `Kt` 0.01 (= Ke), `R` 1, `L` 0.5 (0: no inductance), `output` `speed` \| `position` | L·i′ = u − R·i − Kt·ω; J·ω′ = Kt·i − b·ω; θ′ = ω |
| `thermal` | `C`, `R`, `Tamb` 25, `y0` = Tamb | C·T′ = u − (T − Tamb)/R (u in W) |
| `tank` | `A`, `k`, `h0` 0, `hMax` | A·h′ = max(u, 0) − k·√h, 0 ≤ h ≤ hMax |

Every plant takes `theta` (dead time; before t = 0 the input is 0). **controller** (parallel form): `u = u0 + Kp·(b·r − ym) + I +
D`, `D = Kd·s/(1 + s·Tf) · (c·r − ym)` with `Tf = |Kd/Kp|/N` (`N` 10) unless `Tf` is given; `b` 1, `c` 0 (derivative on the
measurement: no kick); `uMin`, `uMax` clamp u; `antiWindup` `none` | `clamp` (conditional integration) | `backcalc` (tracking,
`Tt` default √(Ti·Td), or Ti); `Ts` the sample time (0: every step; rounded to whole steps; zero-order hold). **mode** `closed`
(default) or `open` (the setpoint signal *is* u: a step test). **Signals** (`setpoint` default 1, `load` added to u at the plant,
`disturbance` added to y): a number, `{step: {from, to, at}}`, `{ramp: {from, slope, at, until}}`, `{sine: {offset, amp, freq,
phase°}}`, `{steps: [[t, v], …]}` (≤ 32). **noise** `{std, seed?}`: Gaussian on the measurement ym (mulberry32 + Box–Muller;
the seed is `noise.seed`, else the task's seed). **metrics** `{band}` (0.02). **transient** `{tEnd, dt? (tEnd/1000)}` (required;
numbers or expressions; ≤ 200 000 steps). **bindings** (≤ 24): `{element: plant | controller | setpoint | load | disturbance |
noise, prop, expr}`; `prop` a field (`Kp`, `tau`, `step.to`, `std`; `value` of a numeric signal, the default); `antiWindup` takes a
toggle (true = clamp) or a choice index (0 none, 1 clamp, 2 backcalc).

## Outputs

`series`: `time: true` or `signal` `r` | `y` | `ym` (measured) | `u` | `e` (= r − ym), thinned to 2000 points. `scalar`: a `signal`
`at` a time or as a `stat` (`final`, `min`, `max`, `mean`, `pp`, `rms`), or a `metric`: `rise` (10–90 %), `overshoot` (%),
`peak`, `peakTime`, `settling` (inside ±band of the change, for good), `yFinal` (the mean of the last 2 % of the samples), `ess`
(the mean of r − y over the last 2 %; NaN in an open loop), `iae`, `ise`, `itae`, `satTime` (time with u at a limit). Rise,
overshoot and settling are measured from the setpoint's step (`at`, or the first change of `steps`) to the final value, on the
true y (noise-free); NaN when y does not move. An unstable loop stops once a state passes 10¹² (the rest NaN, `unstable`).

```json
{ "format": "noema.sim-spec/v1", "engine": "pid@1",
  "params": [ { "id": "Kp", "kind": "slider", "label": "kp", "min": 0, "max": 10, "default": 1 },
              { "id": "Ki", "kind": "slider", "label": "ki", "min": 0, "max": 10, "default": 0 },
              { "id": "aw", "kind": "toggle", "label": "antiWindup", "default": false } ],
  "model": { "plant": { "type": "fopdt", "K": 1, "tau": 2, "theta": 0.2 },
    "controller": { "Kp": 1, "Ki": 0, "uMin": -2, "uMax": 2 }, "setpoint": { "step": { "to": 1, "at": 1 } },
    "bindings": [ { "element": "controller", "prop": "Kp", "expr": "Kp" }, { "element": "controller", "prop": "Ki", "expr": "Ki" },
                  { "element": "controller", "prop": "antiWindup", "expr": "aw" } ],
    "transient": { "tEnd": 20, "dt": 0.001 } },
  "outputs": [ { "id": "t", "kind": "series", "time": true }, { "id": "y", "kind": "series", "signal": "y" },
               { "id": "u", "kind": "series", "signal": "u" }, { "id": "os", "kind": "scalar", "metric": "overshoot" },
               { "id": "ts", "kind": "scalar", "metric": "settling" }, { "id": "ess", "kind": "scalar", "metric": "ess" } ],
  "readouts": [ { "label": "overshoot", "expr": "os", "unit": "%" }, { "label": "settling", "expr": "ts", "unit": "s" } ],
  "plots": [ { "kind": "series", "x": { "series": "t", "label": "time", "unit": "s" }, "y": { "label": "output" }, "series": [ { "y": "y", "label": "y" }, { "y": "u", "label": "u" } ] } ] }
```

Grading example: `[{"expr": "os <= 10", "label": "checkOs"}, {"expr": "ts <= 6", "label": "checkTs"}, {"expr": "abs(ess) < 0.01", "label": "checkEss"}]`.

## Engine API

```js
NoemaPID = { id: 'pid@1', STATS, SIGNALS, METRICS, ZN, MOTOR, limits, check, checkSpec, create, metrics, source, adapter, engine }
check(model) / checkSpec(spec) → [{code, path, msg, level}]   (checkSpec: paths model.…, outputs[i]…; transient required)
create(model, {seed}) → sim; sim.run({tEnd, dt}) → {t, r, y, ym, u, e (Float64Arrays), metrics, steps, dt}
metrics(t, y, {t0, y0?, yf?, band}) → {rise, overshoot, peak, peakTime, settling, yFinal}   (on any curve)
```

**Ziegler–Nichols** (`NoemaPID.ZN`, constants only; parallel gains Ki = Kp/Ti, Kd = Kp·Td):

| rule | P | PI | PID |
|---|---|---|---|
| ultimate gain Ku, period Tu (`ZN.ultimate`) | Kp = 0.5 Ku | Kp = 0.45 Ku, Ti = Tu/1.2 | Kp = 0.6 Ku, Ti = 0.5 Tu, Td = 0.125 Tu |
| reaction curve: gain K, dead time L, time constant T (`ZN.reaction`) | Kp = T/(K·L) | Kp = 0.9 T/(K·L), Ti = L/0.3 | Kp = 1.2 T/(K·L), Ti = 2 L, Td = 0.5 L |

## Method and accuracy

Fixed-step RK4, the plant input held over each step (dead time by linear interpolation of the stored input; exact when θ is a
whole number of steps); the controller is discrete (backward-Euler derivative filter, forward-Euler integral) at Ts or every
step. Measured (tests/pid.js): first order y(τ) to 2·10⁻¹⁵; rise τ·ln 9 and settling τ·ln 50 to 0.2 %; second-order overshoot vs
100·e^(−πζ/√(1−ζ²)) within 0.0002 points for ζ = 0.1…0.7, peak time within 1 ms; P-control ess = 1/(1 + K·Kp) to 10⁻¹⁴; PI ess
< 10⁻⁶; IAE / ISE to 0.01 %; a ramp's ess = slope/(K·Kp); anti-windup overshoot 23.6 % → 1.7 % (clamp), 2.9 % (back-calculation);
20 000 steps of a PID loop with noise, load and dead time ≈ 25 ms.

## Codes

`check`: `model`, `unknown-field`, `plant`, `mode`, `controller`, `signal`, `noise`, `metrics`, `transient`, `budget`, `binding`;
warnings `unused` (a controller in an open loop), `no-gain`, `no-limits` (anti-windup without limits), `stiff` (dt > half the
fastest time constant). `checkSpec` adds `output`. Thrown: `invalid`, `bad-args`, `budget`.

## Limits

Single loop, SISO; no cascade, feed-forward block, rate limit or actuator dynamics beyond the plant; the tank and the motor are the
only nonlinear plants; RK4 needs dt well under the fastest time constant (the `stiff` warning).
