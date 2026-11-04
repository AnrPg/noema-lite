# twin@1 — the digital twin of an IoT node (`engine/src/42_engine_twin.js`)

`window.NoemaTwin` (also `globalThis` in node). A sim-spec@1 engine (docs/INTERACTIVE.md §12.6–12.7, ADR 001 D12, P6): a small
discrete-event simulator of a battery-powered microcontroller node, for "design the duty cycle" exercises and fault-finding benches
(a device with one hidden fault: the learner reads the battery, the current, the server's readings and the event log, then
diagnoses). Pure JS, deterministic for a seed, bounded, no learner text. Schema `tools/schemas/noema.twin.v1.schema.json`; Python
twin of `check` / `checkFaults` / `checkSpec`: `tools/twin.py`; tests `node tests/twin.js`. One line registers it, with
`bench: true`: `ACT.registerEngine(NoemaTwin.engine)` (not done yet; the validators' `ENGINES` do not list it yet).

```js
NoemaTwin = { id: 'twin@1', format: 'noema.twin/v1', limits, FAULT_KINDS, SCALARS, SERIES, NUM_FIELDS, EVENT_CODES, CHEMS,
              check, checkFaults, checkSpec, create, num, source, engine, simEngine, radio: {fspl, logDistance, noiseFloor, loraAirtime, …} }
create(device, {seed, faults}) → { run() → {scalars, perSensor, series, readings, truth, log, logCount}, measure(probe), analytic() }
```

## The model

* **Firmware** — wake every `period`; sense for `sense` s (active + sensor currents); every `txEvery`-th wake transmit the latest
  readings (TX for the airtime); with `ack`, listen `rxWindow` s for the ack and retry up to `retries` times; sleep the rest. A wake
  that cannot finish before the next one is an `overrun`.
* **Battery** — charge drawn `∫(I + I_sd)dt` (mAh); SoC = soc0 − drawn/capacity; open-circuit voltage from a per-cell curve
  (li-ion 4.2→3.0 V, lifepo4 3.6→2.5, alkaline 1.55→0.9, nimh 1.4→1.0, or `custom`) × cells; loaded voltage = V_oc − I·rInt;
  self-discharge a fraction of the capacity per month. Empty (`dead`) when SoC ≤ 0 or V_oc < cutoff (the curve's 0 % point).
* **Brown-out** — before every sense / TX / RX segment: loaded voltage < `brownout.v` → the segment is aborted, `reset` is logged,
  the node boots (`boot` + `brownout.reset` s at the active current) and waits a full period. Asleep below it → `dead`.
* **Radio** — rf@1's formulas, duplicated (tests check they agree): log-distance path loss + seeded shadowing per message + `extra`;
  SNR against kTB + NF; PER from the LoRa (Elshabrawy & Robert 2018) or non-coherent FSK BER; LoRa airtime (Semtech), BLE (1 Mb/s
  packet), FSK `8·(payload + 8)/bitrate`, or `txTime`. A message is delivered when a seeded draw ≥ PER.
* **Sensors** — `base + amp·sin(2πt/cycle)` is the truth; a reading adds `drift`/day and seeded `noise`·N(0,1).
* **Analytic** — `I_avg = (sense·I_sense + (air·I_tx + ack·rxWindow·I_rx)/txEvery + sleep_time·I_sleep)/period + I_sd`, life =
  capacity·soc0 / I_avg (no losses, no resets): the "capacity / average current" every datasheet uses.

## Faults (`opts.faults`, a bench fault's `apply`; hidden: they reach only the engine)

| kind | fields (default) | symptom |
|---|---|---|
| `sensor-stuck` | `sensor`, `at` (0 s), `value` (the truth at `at`) | identical readings, the error against the truth grows |
| `sensor-drift` | `sensor`, `rate` (1 unit/day), `at` | an error that grows linearly |
| `battery-ageing` | `factor` (0.5 × capacity, ≤ 1), `rInt` (3 × resistance) | shorter life, deeper sag, brown-outs under TX |
| `antenna-detached` | `loss` (20 dB) | RSSI −20 dB, deliveries fall on a marginal link |
| `wake-period` | `period` (s) or `factor` (0.1 ×) | 10× wakes, current and life |
| `brownout` | `v` (3.6 V): the BOR level set too high | resets long before the battery is empty |

## The device `noema.twin/v1` and outputs

```json
{ "format": "noema.twin/v1",
  "battery": {"capacity": 2000, "chem": "li-ion", "cells": 1, "selfDischarge": 0.02},
  "power": {"sleep": 0.005, "active": 5, "tx": 40, "rx": 12},
  "schedule": {"period": 600, "sense": 0.05, "txEvery": 1, "ack": true, "rxWindow": 1, "retries": 2},
  "sensors": [{"id": "temp", "base": 21, "amp": 3, "noise": 0.2}],
  "radio": {"tech": "lora", "sf": 9, "f": 868e6, "power": 14, "gain": 2, "d": 3000, "n": 2.7, "sigma": 4, "payload": 12},
  "brownout": {"v": 2.9}, "sim": {"duration": 2592000, "samples": 300, "trace": 1300} }
```

Units: mAh, mA, s, V, Ω (the pack), dBm, Hz, m. **Scalars**: `lifeAnalytic lifeSim iAvg iAvgAnalytic chargeUsed socEnd vEnd vMin
wakes sent attempts delivered lost deliveryRatio resets dead tDead rssiMean snrMean per airtime activeFraction`, per sensor
`readingMean readingLast readingErr`. **Series** (`samples` bins): `t soc v vload current delivered resets rssi`; per message
`rxT reading truth`; the current trace of [0, trace] `traceT traceI` (steps); the log `eventT eventCode` (1 reset, 2 lost,
3 dead, 4 overrun; ≤ 1000 entries). `lifeSim` is the time of death, else extrapolated from the charge used.
**measure** (a bench, SI like the circuit meter): `{kind: 'V', a: 'vbat' | 'vload', at?}`, `{kind: 'I'}` (average A),
`{kind: 'scope', node: 'i', tStart, tEnd}` (the current, A), `{kind: 'log'}`, `{kind: 'rssi'}`; errors come back as codes.

## Codes

`check`: `format`, `value` (missing, a number out of its kind, a custom curve that is not 0→1 rising, sense ≥ period, a LoRa
bandwidth), `enum`, `size` (> 8 sensors, > 32 curve points), `dup-id`, `budget` (the estimated events exceed `sim.maxEvents`,
default 10⁶, at most 5·10⁶), `unknown-field` (warning). `checkFaults`: `fault`. `checkSpec`: also `binding`, `output`. `create`
throws `invalid` / `fault`; `run` throws `budget` when the events pass `maxEvents` (resets add events).

## In a sim-spec

```json
{ "engine": "twin@1", "params": [{"id": "period", "kind": "slider", "min": 10, "max": 3600, "scale": "log", "default": 600}],
  "model": {"device": {"…": "as above"}, "bindings": [{"field": "schedule.period", "expr": "period"}]},
  "outputs": [{"id": "days", "kind": "scalar", "of": "lifeSim"}, {"id": "soc", "kind": "series"}, {"id": "tt", "kind": "series", "of": "t"},
              {"id": "temp", "kind": "series", "of": "reading", "sensor": "temp"}] }
```

## Accuracy, limits

`tests/twin.js`: the simulated life of a 60 s duty cycle equals capacity / average current to < 0.001 % (the simulation integrates
exactly); a year at a 10-minute period (52 560 wakes) runs in ~100 ms, 30 days at 10 s (259 200 wakes) in ~150 ms. Not modelled:
temperature, rate-dependent capacity (Peukert), voltage regulators, ack loss, collisions, clock drift.
