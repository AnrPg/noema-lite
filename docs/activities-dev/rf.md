# rf@1 — radio links and propagation (`engine/src/41_engine_rf.js`)

`window.NoemaRF` (also `globalThis` in node). A sim-spec@1 engine (docs/INTERACTIVE.md §12.6, ADR 001 D12, P6) for IoT radio
benches: link budgets, path loss, range, error rates, airtime. Pure JS, deterministic, no DOM, no learner text (codes and numbers
only). Schema `tools/schemas/noema.rf.v1.schema.json`; Python twin of `check` / `checkSpec`: `tools/rf.py`; tests `node tests/rf.js`.
Registering it is one line, like circuit-mna@1: `ACT.registerEngine(NoemaRF.engine)` (`{id, check, prepare, create, workerSource}`).
Not registered yet, and the validators' `ENGINES` lists (`tools/activities.py`, `engine/packcheck.js`) do not have it yet.

```js
NoemaRF = { id: 'rf@1', format: 'noema.rf/v1', limits, MODELS, MODS, SCALARS, SERIES, NUM_FIELDS, check, checkSpec, create, num, source, engine, simEngine,
            fspl, twoRay, crossover, logDistance, hata, indoor, fresnelRadius, knifeEdge, noiseFloor, Q, erfc, ber, per, loraAirtime, bleAirtime, wifiAirtime }
check(link) → [{code, path, msg, level}]          create(link, {seed}) → {run() → {scalars, series, codes}, at(d), range()}
```

## Models and sources (SI units: m, Hz, dB, dBm, s)

| part | formula | source |
|---|---|---|
| free space | `20·log10(4π·d·f/c)` | Friis 1946 |
| two-ray ground | free space below `d_c = 4π·ht·hr/λ`, then `40·log d − 20·log(ht·hr)` | Rappaport, *Wireless Communications*, §4.6 |
| log-distance | `FSPL(d0) + 10·n·log(d/d0)` + shadowing `σ·N(0,1)` (seeded) | Rappaport §4.9 |
| Okumura–Hata | urban (small/medium city), `urban-large`, `suburban`, `open`; f 150–1500 MHz, hb 30–200 m, hm 1–10 m, d 1–20 km | Hata 1980; COST 231 final report §4.4 |
| indoor | `20·log f(MHz) + N·log d + Lf(floors) − 28`, N and Lf by band (0.9 / 1.9 / 2.4 / 5.2 GHz) and environment | ITU-R P.1238 Tables 2–3 (gaps filled from the nearest band) |
| walls | drywall 3, wood 4, glass 2, brick 8, concrete 12, metal 26 dB per wall (rough, 2.4 GHz), or `loss` | typical published values |
| Fresnel, knife edge | `r_n = √(n·λ·d1·d2/d)`; `J(v) = 6.9 + 20·log(√((v−0.1)²+1) + v − 0.1)` for v > −0.78 | ITU-R P.526 eq. 31 |
| receiver | noise floor `−174 + 10·log B + NF` (kT at 290 K); sensitivity = floor + required SNR; margin = Prx − sensitivity | — |
| required SNR | LoRa SF7…12: −7.5, −10, −12.5, −15, −17.5, −20 dB; others: the SNR for BER 10⁻³ | Semtech SX1276 datasheet, table 13 |
| BER | BPSK/QPSK `Q(√(2Eb/N0))`; FSK/BLE (non-coherent) `½·e^(−Eb/2N0)`; Wi-Fi uncoded M-QAM of its rate; LoRa `½·Q(√(2^(SF+1)·SNR) − √(1.386·SF + 1.154))` | Proakis; Elshabrawy & Robert, IEEE Comm. Lett. 22(9) 2018 |
| PER | `1 − (1 − BER)^(8·payload)` | independent bit errors |
| LoRa airtime | `(npre + 4.25)·Ts + (8 + max(⌈(8PL − 4SF + 28 + 16CRC − 20IH)/(4(SF − 2DE))⌉·(CR+4), 0))·Ts`, DE on when Ts > 16 ms | Semtech SX1276 §4.1.1.6, AN1200.13 |
| BLE / Wi-Fi airtime | BLE: (preamble + 4 + 2 + payload + 3 CRC)·8 bit at 1 or 2 Mb/s; Wi-Fi OFDM: 20 µs + 4 µs·⌈(22 + 8·(payload + 36))/(4·rate)⌉ | rough: one packet, no ACK or IFS |
| range | the largest d where the median margin ≥ `fadeMargin` (bisection on log d, ≤ 200 steps) | — |

## The link `noema.rf/v1`

```json
{ "format": "noema.rf/v1", "f": "868M", "d": 2000, "fadeMargin": 10,
  "tx": {"power": 14, "gain": 2.15, "cable": 0.5}, "rx": {"gain": 2.15, "cable": 0.5, "nf": 6},
  "path": {"model": "log-distance", "n": 2.8, "sigma": 6, "walls": [{"type": "brick", "count": 2}], "obstacle": {"d1": 800, "h": -2}},
  "radio": {"mod": "lora", "sf": 9, "cr": 1, "payload": 12, "interval": 600, "dutyLimit": 0.01},
  "sweep": {"from": 10, "to": 20000, "points": 300, "scale": "log"}, "snrSweep": {"from": -25, "to": 5, "points": 61} }
```

`f` and `d` are required; numbers or SI strings. Defaults: tx power 14 dBm, gains/cables 0, NF 6 dB; path `fspl`, ht 10 m (30 for
Hata), hr 1.5 m, n 3, d0 1 m, env `urban` / `office`; radio `lora` SF7 125 kHz CR 4/5, 8 preamble symbols, header and CRC on,
LDRO automatic, payload 20 B, duty limit 1 %. `rx.bw`, `rx.snr`, `rx.sensitivity` override what the radio implies.

## Outputs

**Scalars** (at `d`): `lambda eirp pl plMedian shadow prx rssi noiseFloor snrReq sensitivity snr ebn0 margin range fresnel clearance
diffraction crossover wallLoss floorLoss ber per bitrate airtime symbolTime dutyCycle minInterval valid`. `clearance` = −h / r1 at the
obstacle (0.6 is the usual rule). **Series**: `d pl plMedian prx prxMedian margin` over the sweep (default: d/100…10·d, 200 log
points; Hata 1–20 km) with one seeded shadowing draw per point; `snrAxis per ber` over the SNR sweep (default snrReq ± 10 dB, 81).
`run().codes`: `range` (the model is outside its validity at `d`: the losses are NaN, `valid` 0), `range-open` (the range reaches the
search bound), `range-none` (no margin even at the nearest distance).

## Codes of `check(link)` / `checkSpec(spec)`

`format` (not an object / array / the format), `value` (missing, a number out of its kind, an obstacle beyond d, a wall without type
or loss, a LoRa bandwidth outside 7.8–500 kHz, a sweep whose from ≥ to), `enum` (model, modulation, environment, Wi-Fi rate), `range`
(Hata or P.1238 outside validity, f outside 1 MHz–100 GHz), `size` (> 32 walls, > 2000 points, > 24 bindings), `unknown-field`
(warning); in a spec also `binding` (a field that is not a numeric field of the link, an empty expression) and `output`. `create`
throws `invalid` (with `.problems`) on errors except `range`, which a slider may reach at runtime.

## In a sim-spec

```json
{ "engine": "rf@1", "params": [{"id": "dist", "kind": "slider", "min": 100, "max": 15000, "scale": "log", "default": 2000},
                               {"id": "sf", "kind": "slider", "min": 7, "max": 12, "step": 1, "default": 9}],
  "model": { "link": { "f": 868e6, "d": 2000, "path": {"model": "log-distance", "n": 2.8},
                       "radio": {"mod": "lora", "sf": 9, "payload": 12} },
             "bindings": [{"field": "d", "expr": "dist"}, {"field": "radio.sf", "expr": "sf"}] },
  "outputs": [{"id": "margin", "kind": "scalar"}, {"id": "air", "kind": "scalar", "of": "airtime"},
              {"id": "dd", "kind": "series", "of": "d"}, {"id": "rssi", "kind": "series", "of": "prx"}] }
```

`prepare` evaluates the bindings with the app's NoemaExpr on the main thread; the worker gets numbers. An output's `of` defaults to
its `id`. Series are at most 2000 points.

## Accuracy, limits

Measured by `tests/rf.js`: FSPL 2.4 GHz/100 m 80.052 dB (80.05); Hata 900 MHz/150 m/1.5 m/10 km 147.390 dB (hand: 147.39); Fresnel
radius exact; range against the closed form 4e-13; LoRa airtime equal to the Semtech/TTN calculator (SF7 10 B 41.216 ms, SF12 10 B
991.232 ms, SF7 51 B 102.656 ms, SF12 51 B 2465.792 ms); BPSK BER at 9.6 dB within 3 % of the table's 1.0e-5 (erfc to 1.2e-7);
shadowing σ within 2 % over 2000 draws. A run with 2000-point sweeps takes ~4 ms. The models are textbook medians: no multipath
fading, no interference, no antenna patterns; BLE/Wi-Fi airtime and Wi-Fi/LoRa error rates are approximations (uncoded).
