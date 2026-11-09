# `des@1` — discrete-event simulation of queues and service networks (`src/engines/des/des.ts`, `NoemaLibDES`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`), built on the simulation kernel `NoemaSimKit`
(`docs/library/simkit.md`). Entities of up to 8 classes arrive from up to 8 sources. A source can be Poisson, use any interarrival
distribution, follow a schedule of times or a rate schedule (a nonhomogeneous Poisson process), and send batches. The entities wait
in queues (FIFO, LIFO, priority, SPT) at up to 16 stations, are served, and are routed through a network to the exit. A station is
either a server station or a delay (infinite servers). A server station can have a waiting room of finite capacity, shifts,
breakdowns and repairs, and pre-emption with resume, restart or resample. Entities can balk, renege and jockey. The engine reports
waits, time-weighted queue lengths, utilisation, throughput and counts with Student-t intervals. These come from independent
replications, or from batch means of one long run, after a fixed warm-up or one found by MSER-5. Where queueing theory has an exact
value it gives that too, and says whether the interval covers it.

Tests: `node tests/lib_des.js` (60 assertions against queueing theory,
birth–death chains and exact counts; the golden outputs of the former Python twin on `tests/fixtures/enginelib/des.json`, 29 specs: 7 good, 22 bad). The
reference activity is `tools/activities_examples/ed-triage`: an emergency department with triage, two patient classes,
pre-emptive priority and patients who leave unseen.

The engine is pure JS, deterministic and bounded. It uses MRG32k3a streams, one per purpose and place (`arr:<source>`,
`svc:<station>`, `route:<station>`, `balk:`, `renege:`, `ttf:`, `ttr:`, `mix:`, `batch:`), and replication i uses substream i. So
two scenarios run with the same seed share their random numbers: these are **common random numbers** (Law 2015 §11.2). All the
replications together run at most 200 000 events (`maxEvents`). Every series has at most 2000 values and every scene at most 2000
items. The engine never throws.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "des@1",
  "consts": { "maxLwbs": 0.03, "maxRoutineWait": 15, "busyHour": 8, "maxDoctors": 4 },
  "params": [ { "id": "doctors", "kind": "slider", "label": "doctorsLabel", "min": 1, "max": 6, "step": 1, "default": 2 },
              { "id": "perHour", "kind": "slider", "label": "perHourLabel", "min": 4, "max": 12, "step": 1, "default": 8 } ],
  "model": {
    "tEnd": 720, "unit": "min", "reps": 20,
    "classes": [ { "id": "urgent", "prio": 0, "key": "clsUrgent" }, { "id": "routine", "prio": 1, "key": "clsRoutine" } ],
    "sources": [ { "id": "door", "to": "triage", "mix": { "urgent": 0.2, "routine": 0.8 },
                   "arrival": { "dist": "exp", "mean": "60 / perHour" } } ],
    "stations": [
      { "id": "triage", "service": { "dist": "tri", "min": 2, "mode": 4, "max": 7 }, "route": [ { "to": "doctor" } ] },
      { "id": "doctor", "servers": "doctors", "discipline": "priority", "preempt": "resume",
        "serviceBy": { "urgent": { "dist": "lognormal", "mean": 30, "sd": 15 }, "routine": { "dist": "exp", "mean": 15 } },
        "renege": { "dist": "exp", "mean": 120 } } ] },
  "outputs": [
    { "id": "wqRoutine", "kind": "scalar", "of": "wq", "station": "doctor", "class": "routine" },
    { "id": "wqRoutineHalf", "kind": "scalar", "of": "wq", "station": "doctor", "class": "routine", "est": "half" },
    { "id": "lwbs", "kind": "scalar", "of": "pAbandon" },
    { "id": "utilDoc", "kind": "scalar", "of": "util", "station": "doctor" },
    { "id": "t", "kind": "series", "of": "t" },
    { "id": "qDoc", "kind": "series", "of": "qlen", "station": "doctor" },
    { "id": "net", "kind": "scene", "of": "network" },
    { "id": "gantt", "kind": "scene", "of": "gantt", "window": 240 } ] }
```

Every number marked *numx* below may be a NoemaExpr formula over the consts and params, and is evaluated once per run. A value that
comes out impossible (a negative mean, a probability above 1, a server count outside 1–64) gives the code `bad-dist` and no run.

### 1.1 The model

| field | what |
|---|---|
| `tEnd` (required, numx > 0) | the horizon of each replication (or of the one long run) |
| `unit` | the time unit (`ms`, `s`, `min`, `h`, `d`, `wk`, `yr`), for labels |
| `warmup` (numx) | statistics start here (fixed warm-up; `0 ≤ warmup < tEnd`) |
| `reps` (1–200, default 10) | independent replications |
| `seed` (0–1 000 000), `maxEvents` (1000–200 000) | an offset to the run's seed; the event budget over all replications |
| `analysis` | `{method: reps \| batch, batches (5–100, default 20), level (0–1, default 0.95), warmup: fixed \| mser5, antithetic}`. `batch` needs `reps: 1`. |
| `classes` (≤ 8) | `{id, prio (0–9, 0 first), key}`. Without classes there is one implicit class. In a `when` formula each class id is 1 for an entity of that class, else 0. |
| `sources` (1–8) | see below |
| `stations` (1–16) | see below |
| `points` (2–2000, default 200), `logCap` (0–2000, default 200) | the samples of the series of replication 1; the event-log entries kept |

**Sources.** `{id, to | shortest, class | mix, arrival | schedule | rates, period, batch, start, stop, limit, key}`

- `to`: a station; `shortest: [stations]`: join the one with the fewest present (a tie goes to the first listed).
- `class`: every arrival has this class; `mix: {class: weight}`: a random class per arrival (weights are normalised).
- `arrival`: an interarrival distribution (§1.2). The first arrival comes one interarrival after `start` (Law §1.4).
- `schedule: [t…]` (≤ 500): arrivals at exactly these times.
- `rates: [[t, rate]…]` with an optional `period`: a piecewise-constant rate, repeated every period. Arrivals are a nonhomogeneous
  Poisson process generated by thinning (Lewis & Shedler 1979; `SK.nhpp`).
- `batch`: a distribution of the batch size (rounded, at least 1).
- `start`, `stop`: the window of arrivals; `limit` (1–100 000): the most arrivals.

**Stations.** `{id, kind, servers, service, serviceBy, discipline, capacity, preempt, balk, renege, jockey, shifts, breakdowns, route, key}`

| field | what |
|---|---|
| `kind` | `server` (default) or `delay`: infinite servers, no queue (a waiting room, travel, a recovery ward). A delay takes none of the queue fields. |
| `servers` (numx, 1–64, default 1) | the number of servers; it may be a param (`"servers": "doctors"`) |
| `service` / `serviceBy: {class: dist}` | the service time, or one per class (the others fall back to `service`) |
| `discipline` | `fifo` (default), `lifo`, `priority` (by class `prio`, FIFO within), `spt` (shortest service time first, the time known on arrival) |
| `capacity` (0–100 000) | the waiting room. An arrival that finds it full is **lost** (M/M/c/K with K = servers + capacity). |
| `preempt` (with `priority`) | `none` (default), `resume` (the interrupted job goes on with what was left), `restart` (the same time again), `resample` (a new time). The interrupted job goes back to the front of its class. |
| `balk: {length, p}` | an arrival that finds `length` or more waiting leaves with probability p (default 1) |
| `renege` | a patience distribution. A waiting entity whose patience runs out leaves (abandons). |
| `jockey` | with a `shortest` group: when a server of this station frees and another line of the group is at least 2 longer, the last in that line moves here (Banks et al. 2010 ch. 2, the bank with jockeying) |
| `shifts: {period, plan: [{from, to, servers}]}` | the server count during the windows of each period (a server busy when its shift ends finishes its job first) |
| `breakdowns: {ttf, ttr, policy}` | the station fails after a time-to-failure and is repaired after a time-to-repair. The jobs in service are held, then continue by `policy`: `resume` (default), `restart` or `resample`. The failure clock runs whether the station is busy or not. |
| `route: [{to \| shortest, p \| when}]` | where entities go after service: by probabilities (all ways have `p`; the rest goes to the exit), or by conditions (the first `when` that holds; a way without `when` always holds). `to: "exit"` leaves the system. With no route, the entity leaves. In a `when` formula the locals are `prio`, `cls`, `visits` (stations visited), `waited` (the total wait so far), `now` and the class ids. |

### 1.2 Distributions

`{dist, …}` with numx parameters, drawn by the kernel (`SK.dist`; inversion wherever it exists, so CRN and antithetics work):
`const {value}`, `exp {mean | rate}`, `uniform {min, max}`, `tri {min, mode, max}`, `normal {mean, sd}`,
`lognormal {mean, sd}` (the moments of the lognormal itself), `gamma {shape, scale | mean, cv}`, `erlang {k, mean}`,
`weibull {shape, scale}`, `beta {a, b, min?, max?}`, `empirical {values, probs?}` (piecewise linear between the values, Law §6.2.4)
and `discrete {values, probs?}`. A duration that comes out negative (a normal's tail) is set to 0, and the run notes `clipped`.

## 2. The outputs

| kind | `of` | fields |
|---|---|---|
| scalar | a measure (below) | `station?`, `class?`, `est`: `mean` (default), `half`, `lo`, `hi`, `sd`, `n` |
| scalar | `theory` | `measure` (`wq`, `w`, `lq`, `l`, `util`, `pwait`, `rho`), `station?`, `class?`: the analytic value (§4), NaN where there is none |
| scalar | `covers` | `measure`, `station?`, `class?`: 1 when the interval holds the theory, 0 when not, NaN without theory |
| scalar | `warmupT`, `events`, `reps`, `flag` (with `code`), `ok` | the warm-up used, the events run, the replications (or batches) used, 1 when a code was raised, 0 after an error |
| series | `t`, `qlen`, `inSystem`, `busySeries` | replication 1 sampled at `points` instants: the time, the queue (`station`), those present (`station`, or the system), the busy servers |
| series | `repValues` | `measure`, `station?`, `class?`: the value of every replication or batch |
| series | `waits` | the time in system of each entity of replication 1, in exit order (≤ 2000) |
| series | `logT`, `logKind`, `logEntity`, `logStation` | the event log of replication 1: the time, the kind (an index into `LOG_KINDS`), the entity number, the station index |
| scene | `network` | the stations as boxes with queue bars and utilisation, the routes as arrows with their probabilities |
| scene | `gantt` | `window` (numx): each server's busy intervals over [0, window], coloured by class, with the down times |
| scene | `log` | the first entries of the event log as a table |

**Measures** (per station with `station`, per class with `class` where marked; else for the whole system):

| measure | what | class |
|---|---|---|
| `wq`, `w` | the mean wait in queue and time in station (system: from arrival to exit) per entity served | ✓ |
| `lq`, `l` | the time-average number waiting, present | ✓ |
| `pwait` | the fraction served who had to wait | ✓ |
| `served`, `throughput`, `arrived` | the count served (or exited), served per unit time, the count arrived | ✓ |
| `util`, `busy` | `busy` is the time-average number of servers holding a job (during a breakdown too); `util` is busy over the time-average capacity (shifts count) | station |
| `down` | the fraction of time the station is down | station |
| `maxq` | the longest queue | station |
| `preempted`, `jockeyed` | the pre-emptions, the moves into this line | station |
| `balked`, `reneged`, `lost`, `pAbandon` | the counts that balked, reneged, were lost; `pAbandon` = (balked + reneged + lost) / arrived | |
| `littleErr` | \|L − λW\| / max(L, λW) over the measured span (Little 1961) | |

## 3. The method

**World view.** The engine uses event scheduling (Law §1.3) on the kernel's executive (`SK.sim`). The calendar orders by
(t, priority, insertion order). At one instant the schedule changes and repairs run first, then the departures, then the
arrivals, and reneging last. This rule is fixed, so a run is the same everywhere. Service ends are scheduled as events; a pre-emption or breakdown
cancels the end event and keeps what was left.

**Statistics.** The time-weighted areas (the queue, those present, busy servers, capacity, down time) and the counts are cumulative
accumulators in one `Float64Array`. The array is copied at the grid instants (the warm-up, the batch boundaries). A measure over any
span is then the difference of two copies divided by the span, so the warm-up and the batches cost nothing extra. Per-entity
quantities (waits) are counted at departure.

**Replications** (`method: reps`, for terminating and steady-state runs, Law §9.4). Each replication runs [0, tEnd] on its own
substream, and the measure is taken over [warmup, tEnd]. The estimate is the Student-t interval over the replications
(`SK.ci`). With `antithetic: true`, replication 2k + 1 uses 1 − u of replication 2k's numbers, and the interval is taken over the
pair means, so n is the number of pairs (Law §11.3).

**Batch means** (`method: batch`, steady state, Law §9.5.3; Schmeiser 1982). One long run is cut into `batches` equal spans after
the warm-up. When the lag-1 correlation of the batch means is above 0.2, the code is `batch-correlated` (the batches are too short).

**Warm-up.** `warmup` is a fixed time. With `analysis.warmup: mser5`, MSER-5 (White 1997; Franklin & White 2008) is applied to the
across-replication average of the times in system in exit order. The cut is then rounded up to the next grid instant (40 grid
spans for replications, 200 for batch means). `warmup-short` means the cut fell in the second half: the run is too short.

## 4. The theory

`theory` needs Poisson arrivals (`exp`, no schedule, rates or batch, starting at 0 without stop or limit) and probabilistic routes.
The external rates are solved through the **traffic equations** λ = γ + Pᵀλ per class, by Gaussian elimination (Jackson 1957).
Each station is then:

| station | formula (Gross et al. 2008) |
|---|---|
| delay | M/G/∞: L = λE[S], W = E[S], no wait |
| exponential, equal means, c servers | M/M/c: Erlang C(c, a) = P(wait), Lq = C·ρ/(1 − ρ), Wq = Lq/λ (§2.3) |
| exponential with `capacity` | M/M/c/K, the truncated birth–death chain; the losses are taken out of the throughput (§2.5) |
| 1 server, general service | M/G/1 by Pollaczek–Khinchine: Wq = λE[S²]/(2(1 − ρ)) (M/D/1, M/E_k/1 …) (§5.1) |
| priority, 1 server, several classes | non-preemptive (Cobham 1954): Wq_k = W₀/((1 − σ_{k−1})(1 − σ_k)), W₀ = Σλ_iE[S_i²]/2; preemptive resume: W_k = E[S_k]/(1 − σ_{k−1}) + R_k/((1 − σ_{k−1})(1 − σ_k)), R_k = Σ_{i≤k}λ_iE[S_i²]/2 (Conway, Maxwell & Miller 1967; Kleinrock 1976 §3.7) |
| c servers, general service | Allen–Cunneen: Wq ≈ Wq(M/M/c)·(1 + c_s²)/2, code `theory-approx` |

A station with reneging, balking, breakdowns, shifts or SPT, or with priority on several servers, has no closed form: its value is
NaN and the code is `theory-na`. A non-exponential station fed by the network is not a product form: `theory-approx`. With ρ ≥ 1
the code is `unstable` and the steady-state values are NaN. The system values add the stations' L and Lq and divide by the external
throughput (Little). `erlangC`, `mmc`, `mmck`, `mg1`, `mg1prio` and `theory(M, P)` are exported.

## 5. Codes

| code | level | when |
|---|---|---|
| `budget` | error | more than `maxEvents` events in all; the replications done so far are kept |
| `zeno` | error | more than 10 000 events at one instant |
| `overflow` | error | more than 100 000 entities present at once (an unstable model) |
| `bad-dist` | error | a distribution, a balk probability, a server count or a shift plan is impossible once its formulas are evaluated |
| `model` | error | the spec fails `checkSpec` |
| `clipped` | note | a negative duration was set to 0 |
| `no-arrivals` | note | no entity arrived inside the horizon |
| `route-sum`, `route-none` | note | route probabilities over 1 after evaluation (no run); no `when` held (the entity left) |
| `few-reps` | note | fewer than 2 replications, or too few grid spans for the batches: no interval |
| `warmup-short`, `batch-correlated` | note | MSER-5 cut in the second half or too little data; batch means correlated at lag 1 |
| `unstable`, `theory-na`, `theory-approx` | note | §4 |
| `little` | note | Little's law off by more than 5 % on a span of at least 50 W (end effects are of order W/T) |

## 6. The engine and its stepper

`NoemaLibDES.engine` is the library adapter (`C.makeEngine`): `check(spec)`, `create(spec, {seed}).run(inputs) → outputs`,
`scenes: true`, `stepper: true`, and `workerSource` (the Worker bundle: NoemaExpr, the core, the kit and this module). The Worker gives
the same outputs as the page; the test checks this in a fresh `vm` global.

The **stepper** (`NoemaLibDES.stepper`, and through `simEngine.create(spec).stepInit / stepTo`, `docs/library/simkit.md` §8) runs
one replication by macro steps for the parts orchestrator:

- `init(model, inputs, ctx)` builds the model (`ctx.spec` for its outputs) and returns the live state, or null when the model is
  bad (the orchestrator reports `part-failed`).
- `step(state, inputs, t, dt)` advances the executive to t + dt and returns `{state, out, dt}`. `out` holds the spec's scalar
  outputs over [0, now]: the measures (means only), `events`, `ok` and `flag`. A budget or zeno stop returns `fail`.
- `snapshot` and `restore` are null: the state holds the executive's closures, so a DES part can be chained and co-simulated but not
  iterated. Its numbers are those of a single replication run whole with `reps: 1`, `warmup: 0` (the test checks this to 1e-9).

## 7. Reference values (`node tests/lib_des.js`, seed 1)

Each interval is the 95 % Student-t over 10 replications. The check is |mean − theory| ≤ 1.5 half-widths.

| model | simulated | theory |
|---|---|---|
| M/M/1, ρ 0.8 | Wq 3.59 ± 0.43, util 0.791 ± 0.014 | 4, 0.8 |
| M/M/3, λ 2.4, μ 1 | Wq 1.15 ± 0.11, P(wait) 0.649 ± 0.014 | 1.0787, Erlang C 0.647191 |
| M/D/1, ρ 0.7 | Wq 1.18 ± 0.10 | 7/6 |
| M/G/1 uniform(0.2, 1.8), ρ 0.8 | Wq 2.64 ± 0.54 | 2.4267 |
| M/E₄/1, ρ 0.8 | Wq 2.46 ± 0.29 | 2.5 |
| M/M/1/5, ρ 0.9 | Wq 1.587 ± 0.057, P(lost) 0.122 ± 0.009 | 1.611, 0.126 |
| Jackson network (3 stations, a loop) | W 3.84 ± 0.15 | 3.934 |
| priority, non-preemptive | Wq hi 1.17 ± 0.12, lo 5.32 ± 0.73 | 1.143, 5.714 |
| priority, preemptive resume | W hi 1.46 ± 0.09, lo 6.74 ± 0.76 | 1.429, 7.143 |
| M/G/∞ lognormal | L 5.95 ± 0.10 | 6 |
| M/M/1+M (reneging) | P(abandon) 0.235 ± 0.005 | 0.239 (birth–death) |
| balking at 3, p ½ | P(balk) 0.125 ± 0.007 | 0.129 (birth–death) |
| breakdowns ttf 30, ttr 3 | down 0.091 ± 0.007 | 3/33 |
| batch means + MSER-5, M/M/1 ρ 0.7 | Wq 2.16 ± 0.29 | 7/3 |

The tests also check that LIFO has the FIFO mean with a wider spread, that SPT beats FIFO, and Kleinrock's conservation law. They
check that CRN cuts the variance of a paired difference by a factor of 9, that antithetic pairs are negatively correlated, the
codes, determinism, the speed (M/M/1, 10 × 2000, about 32 000 events, in about 50 ms warm) and the ed-triage cases.
