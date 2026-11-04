# wasm-module@1 and the engine wasm@1 — precompiled WebAssembly in a pack

A pack may carry a precompiled WebAssembly module: the simulation core of an activity written in C, Rust or AssemblyScript (a
microcontroller emulator, a DSP kernel, a physics step function). The page around it is always the app's own `sim-spec@1`
renderer (sliders, readouts, plots, the checks grader: `docs/INTERACTIVE.md` §12); the module only computes numbers.
The contract of every activity is `docs/INTERACTIVE.md`; the decision is the ADR's D12 (P6), as built in its §10.

Code: `engine/src/44_activity_wasm.js` (`window.NoemaWasm`) · check tool: `wasm_check.py` (in the toolkit; `tools/wasm_check.py`)
· the reference activity: `wasm-oscillator` · tests: `tests/activities_wasm.js`, `tests/activities.js`, `tests/activities_pack.py`
· fixtures: `tests/fixtures/wasm/`.

**When to use it:** only when the model cannot be written as formulas (`formula@1`) or a circuit (`circuit-mna@1`) and needs a
real program — an emulator, an iterative solver with thousands of steps, a DSP chain. A module is opaque to the reviewer: its
correctness has to be shown by `tests.json` cases (below), and its source (`.wat`, `.c`, `.rs`) belongs in your own repository.

## 1. Files and the item

```
activities/<id>/
├── module.wasm            the compiled module: at most 2 MiB
├── spec.json              optional: a sim-spec@1 spec for this module (then the item is a whole activity)
├── strings.<lang>.json    the spec's words, as for sim-spec@1
└── tests.json             the activity_test.py cases
```

`activities/activities.json` entry:

```json
{ "id": "wasm-oscillator", "runtime": "wasm-module@1", "entry": "activities/wasm-oscillator/module.wasm", "stateVersion": 1,
  "capabilities": ["state", "events"], "abi": { "version": 1, "scratch": 1024, "maxPages": 16 },
  "fallback": { "media": "wasm-oscillator-still", "text": "…(>= 40 characters, what the activity shows)…" },
  "origin": "own", "credit": "…", "license": "own" }
```

`make_pack.py` puts the module **inline** (`wasm`: base64, `sha256`, `bytes`) and the spec as `spec`; `unpack.py` writes
`module.wasm` back byte for byte. `pack.requires` gets `runtime:wasm-module@1` and, for an item with a spec (or a sim-spec@1
spec that names a module), `engine:wasm@1`.

* **`abi`** — `{ version: 1, step = "step", init = "init", maxPages = 256, budgetMs = 1000, scratch?, initEachStep = true }`.
  `scratch` is the byte offset of the input/output area (a multiple of 8); required unless the module exports `alloc(bytes) → ptr`.
* **With a `spec`** the item is a whole activity: it mounts as that spec with `engine: "wasm@1"` and `model.module` = the item
  itself. The spec may leave out `engine` and `model.module`; if it gives them they must be `wasm@1` and the item's own id.
* **Without a `spec`** the item is a module only: another activity's `sim-spec@1` spec uses it through `model.module` (§2). A
  module-only item cannot be put in a block or a sim exercise (the validators refuse it: it shows nothing).

## 2. The engine `wasm@1`

```json
{ "engine": "wasm@1",
  "model": { "module": "wasm-oscillator", "step": "step", "inputs": ["k", "c", "x0", "0", "dt"],
             "outputs": [{ "id": "t", "n": 50 }, { "id": "x", "n": 50 }, { "id": "E" }] },
  "outputs": [{ "id": "t", "kind": "series" }, { "id": "x", "kind": "series" }, { "id": "E", "kind": "scalar" }] }
```

* `inputs` are expressions of the spec's consts, params and derived values (`docs/INTERACTIVE_SIMEXPR.md`), evaluated on the
  page by `prepare`; the worker gets numbers only (`Float64Array` at `ptr_in`).
* `model.outputs` is the layout of the output array, in order: a scalar takes one value, a series `n` (≤ 2000). Every
  `spec.outputs` entry has a place. Scalars join the names of readouts, marks and checks; series feed `series` plots.
* The renderer, its plots, readouts and the checks grader are the sim runtime's, unchanged. Every run is in the sim runtime's
  blob worker (the engine gives `workerSource`); `create` on the page refuses (code `worker`): a module never runs on the
  page's own thread. **Budget: the sim runtime's 5 s per run** — over it the worker is terminated, `runaway`, Restart.

## 3. The host ABI

* Import module `"noema"` (or `"env"`, the default of clang / wasm-ld):
  * `memory` — one memory; the host creates it, maximum = min(declared maximum, `abi.maxPages`).
  * `noema_log(ptr, len)` — UTF-8 from the module's memory, ≤ 200 bytes a line, ≤ 100 lines per instance (then counted).
  * `noema_now() → f64` — ms since the instance started, in 0.1 ms steps (logs and pacing only, never results).
  * `noema_random() → f64` in [0, 1) — mulberry32 seeded by the activity's seed.
  * Nothing else: no WASI, no tables, globals or tags.
* Exports: `step(ptr_in, n_in, ptr_out, n_out)` → `()` or `(i32)` (non-zero = an error, code `step`); `init(seed: i32)`
  optional; `alloc(bytes: i32) → i32` optional; a defined memory must be exported as `"memory"`.
* **Determinism:** with `initEachStep` (default) every run reseeds `noema_random` and calls `init(seed)` again, so the outputs
  are a function of the inputs and the seed (what the checks grader and the replay tests need). A module that keeps state
  across runs (an emulator stepping on) sets it to `false`.

```
pack item (base64 + sha256 + abi) → page: decode, sha256, inspect() (our binary reader) → refuse | blob: Worker
   worker: network globals removed → WebAssembly.Module.imports() checked again → Instance with the host ABI only → init(seed)
   each call: inputs (f64) written at ptr_in → step(ptr_in, n_in, ptr_out, n_out) → outputs (f64) read at ptr_out
```

## 4. The rules (the same in `NoemaWasm.inspect()` and `wasm_check.py`, the same messages)

| code | refused when |
|---|---|
| `size` | more than 2 MiB (2 097 152 bytes) |
| `format` | not a WebAssembly 1 binary (magic, version), or a section is malformed |
| `import` | anything outside the host ABI, or a host function with the wrong signature (`noema_log (i32,i32)->()`, `noema_now ()->(f64)`, `noema_random ()->(f64)`) |
| `memory` | no memory, two memories, a shared or 64-bit memory, a defined memory without a maximum, a maximum or initial size over `maxPages` (default 256 pages = 16 MiB, never above 1024 = 64 MiB) |
| `export` | no `step` with the step signature; `init` / `alloc` with the wrong signature; a defined memory not exported as `memory` |

The item check adds: base64, `sha256` (must match), `bytes`, `abi` keys and ranges, `scratch` when there is no `alloc`. A
wasm@1 spec is checked against the module it names (`check_model`: the module exists and is a `wasm-module@1` item, the
function names, the input expressions use declared names, every model output is in `spec.outputs` and the other way round). The pack
validators (`tools/activities.py` = `engine/packcheck.js`, `tests/activities.js` compares their messages on every case) add:
a module without a spec in a block or a sim exercise, a spec whose `engine` / `model.module` is not the item's, and — since
the module reports nothing itself — a sim exercise on it needs `checks` (the "reported" rule of sim-spec@1).

The worker checks the imports a second time with `WebAssembly.Module.imports()` before `new WebAssembly.Instance` (code
`import`), so a page bug cannot hand it a module that imports something else; a signature mismatch the reader missed fails as
a `LinkError` (refused too).

## 5. No network in the worker

A `blob:` worker inherits the creating page's CSP — and the app has none (ADR §1), so a policy cannot be relied on. The worker
source therefore starts with `neutralise(self)`: `fetch`, `XMLHttpRequest`, `WebSocket(Stream)`, `EventSource`, `WebTransport`,
`importScripts`, `Worker`, `SharedWorker`, `BroadcastChannel`, `indexedDB`, `caches`, `Request`, `navigator` (and so `sendBeacon`),
`RTCPeerConnection` are redefined as non-configurable `undefined` on the global and on its prototypes, before any other code runs.
The test probes each of them inside the worker against a beacon server and expects 0 requests. **Known limit:** dynamic
`import()` is syntax and cannot be removed — irrelevant here, since no JS of the pack ever runs in the worker.
**A future CSP must keep `'wasm-unsafe-eval'` (script-src) and `worker-src blob:`**, or every wasm activity shows its fallback.

## 6. In the app

* Failures reuse the core's codes, so the runtime adds **no UI words**: a refused module (`import`, `memory`, `spec`, `size`,
  `format`) → the fallback, no Restart; `runaway` (a run over budget, an endless loop) → "stopped responding" with Restart;
  `unsupported` (no WebAssembly, the one-file bundle without workers) → the fallback.
* **`window.NoemaWasm.load(item, {budgetMs, seed})`** → a handle for host code (a future emulator UI, the tests):
  `call(fn, inputs, nOut) → {out: Float64Array, log, ms, pages}`, `raw(fn, …i32) → {value}`, `restart()`, `close()`,
  `state()`. Each call has `budgetMs` (50–5000, default 1000; loading max(1 s, budget)): over it the worker is terminated, the
  call rejects with code `runaway`, later calls with `stopped`, `restart()` starts a fresh worker from the same checked bytes.
  It rejects with codes only (`import`, `memory`, `spec`, `worker`, `runaway`, `stopped`, `abi`, `step`, `trap`); host code that
  shows them to a learner adds its own `engine.act.wasm.*` keys in every UI language.
* Offline: everything is inline in the pack, the engine is part of the app — it works offline once the pack is on the device.

## 7. Making one

1. `python3 activity_new.py <subject-dir> <id> --from wasm-oscillator` (or `--runtime wasm-module@1`) copies the reference
   activity: `module.wasm`, a spec, strings in en/el/ru/fr, a fallback picture and `tests.json`.
2. Build your module (`clang --target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export=step -Wl,--max-memory=…`, `wasm-pack`,
   AssemblyScript `--runtime stub`, or `wat2wasm`) and replace `module.wasm`. Import only the host ABI; give the memory a maximum.
3. `python3 wasm_check.py activities/<id>/module.wasm [--max-pages N] [--step NAME] [--json]` — the imports, exports with their
   types, memory, sha256 and the errors; `--item item.json` checks a whole item.
4. Write the spec as for any `sim-spec@1` activity (controls, readouts, plots, marks) with `model.inputs` / `model.outputs`.
5. `tests.json`: cases that pin the module's numbers (`values` ranges), the right and the tempting wrong attempts of each sim
   exercise — `python3 activity_test.py <subject-dir>` runs them in the harness with the real module in a worker.
6. `activity_lint.py`, `activity_preview.py`, `make_pack.py` as for every activity (`docs/INTERACTIVE.md` §11).

The reference `wasm-oscillator` is a damped mass on a spring (`tests/fixtures/wasm/osc.wat`, assembled): `step` takes
`[k, c, x0, v0, dt]` and returns 50 times, 50 displacements and the energy left; the exercise asks for the damping that leaves
at most 5 % of the energy after 2.5 s (`checks`: `E <= share * E0`, the spring unchanged).

## 8. Tests and tools

* `tests/fixtures/wasm/*.wat` + the committed `.wasm`: `osc` (a damped oscillator `step`, an endless `spin`, `grow`, `rnd`, a
  log in `init`), `imem` (imported memory without a maximum), `forbidden` (`env.fetch_url`), `badsig`, `bigmem` (max 65536
  pages), `nomax`. No toolchain needed: `watasm.py` assembles the flat-syntax subset (`python3 tests/fixtures/wasm/watasm.py
  --all`); `wat2wasm` accepts the same files.
* `node tests/activities_wasm.js --node` — parity with `wasm_check.py`, sha256, the ABI mapping (the worker code run in node).
  Without `--node`: the browser part (Chromium, Firefox, WebKit, no network in the worker); `--app <dir>`: also in the built app.
* `tests/activities.js` — the pack rules in JS = Python with the same messages; `tests/activities_pack.py` — the module round
  trips through `make_pack.py` / `unpack.py`, the refusals; `tests/activities_app.js` — the reference activity in the app
  (readouts, state, the exercise, a forbidden import → fallback, an endless loop → Restart).
