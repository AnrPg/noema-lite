# wasm-module@1 — precompiled WebAssembly in a pack · developer notes

A pack may carry a precompiled WebAssembly module: the simulation core of an activity written in C, Rust or AssemblyScript (a
microcontroller emulator, a DSP kernel, a physics step function). The ADR's D12 (P6) names it; this page is its design as built.
Code: `engine/src/44_activity_wasm.js` · checked by the content checks (`src/features/content`; the toolkit's `activity_lint.py` through `noema-tools.cjs`) · tests: `tests/activities_wasm.js` · fixtures: `tests/fixtures/wasm/`.

## Design

**The pack ships only the `.wasm`, never JS.** The module can do nothing but compute: it gets no imports except a tiny host ABI
of our own, so it has no way to reach the network, the DOM or storage (capability-based: a function that is not imported cannot be called).
Like the Python runner (`docs/activities-dev/pyodide.md`), **the worker has no network and asks for nothing**: the trusted page
decodes the bytes from the pack, checks their sha256 and the module's imports and memory, and hands the bytes over.

```
pack item (base64 + sha256 + abi) → page: decode, sha256, inspect() (our binary reader) → refuse | blob: Worker
   worker: network globals removed → WebAssembly.Module.imports() checked again → Instance with the host ABI only → init(seed)
   each call: inputs (f64) written at ptr_in → step(ptr_in, n_in, ptr_out, n_out) → outputs (f64) read at ptr_out
```

* **The item** (`pack.activities.items[]`): `{ id, runtime: "wasm-module@1", wasm: <base64, ≤ 2 MiB of bytes>, sha256: <hex>,
  bytes?, abi?: { version: 1, step = "step", init = "init", maxPages = 256, budgetMs = 1000, scratch?, initEachStep = true },
  spec?: <a sim-spec@1 spec>, fallback, strings }`. `scratch` is the byte offset of the input/output area (a multiple of 8);
  required unless the module exports `alloc(bytes) → ptr`.
* **The host ABI** (import module `"noema"`, or `"env"` — the default of clang/wasm-ld): `memory` (one memory; the host creates it,
  maximum = min(declared maximum, `abi.maxPages`)), `noema_log(ptr, len)` (UTF-8 from the module's memory, ≤ 200 bytes a line,
  ≤ 100 lines per instance, then counted), `noema_now() → f64` (ms since the instance started, 0.1 ms steps),
  `noema_random() → f64` in [0, 1) (mulberry32 seeded by the activity's seed). No WASI, no tables, globals or tags.
* **Exports:** `step(ptr_in, n_in, ptr_out, n_out)` → `()` or `(i32)` (non-zero = an error, code `step`); `init(seed: i32)` optional;
  `alloc(bytes: i32) → i32` optional; a defined memory must be exported as `"memory"`.
* **Determinism:** with `initEachStep` (default) every run reseeds `noema_random` and calls `init(seed)` again, so the outputs are a
  function of the inputs and the seed (what the checks grader and the replay tests need). A module that keeps state across runs (an
  emulator stepping on) sets it to `false`. `noema_now` is for logs and pacing only, never for results.

## The rules (`inspect()`: the app, the connector and the toolkit run the same code)

| code | refused when |
|---|---|
| `size` | more than 2 MiB (2 097 152 bytes) |
| `format` | not a WebAssembly 1 binary (magic, version), or a section is malformed |
| `import` | anything outside the host ABI, or a host function with the wrong signature (`noema_log (i32,i32)->()`, `noema_now ()->(f64)`, `noema_random ()->(f64)`) |
| `memory` | no memory, two memories, a shared or 64-bit memory, a defined memory without a maximum, a maximum or initial size over `maxPages` (default 256 pages = 16 MiB, never above 1024 = 64 MiB) |
| `export` | no `step` with the step signature; `init` / `alloc` with the wrong signature; a defined memory not exported as `memory` |

The item check adds: base64, `sha256` (must match), `bytes`, `abi` keys and ranges, `scratch` when there is no `alloc`. The worker
checks the imports a second time with `WebAssembly.Module.imports()` before `new WebAssembly.Instance` (code `import`), so a page bug
cannot hand it a module that imports something else; a signature mismatch the reader missed would fail as a `LinkError` (refused too).

## Two ways in

1. **The engine `wasm@1` of `sim-spec@1`** (`ACT.registerEngine`). The spec names the item and maps the arrays to named values:
   ```json
   { "engine": "wasm@1",
     "model": { "module": "osc-core", "step": "step", "inputs": ["k", "c", "x0", "0", "dt"],
                "outputs": [{ "id": "t", "n": 50 }, { "id": "x", "n": 50 }, { "id": "E" }] },
     "outputs": [{ "id": "t", "kind": "series" }, { "id": "x", "kind": "series" }, { "id": "E", "kind": "scalar" }] }
   ```
   `inputs` are expressions of the spec's consts, params and derived (NoemaExpr, evaluated on the page by `prepare`); the worker
   gets numbers only. `model.outputs` is the layout of the output array, in order: a scalar takes one value, a series `n` (≤ 2000);
   every `spec.outputs` entry has a place. The renderer, its plots, readouts and the checks grader are the sim runtime's, unchanged.
   The engine has `workerSource` (the neutraliser + the worker code), so the sim runtime runs it in its blob worker; the checked
   bytes travel with each run (`prepare`), the worker keeps one instance per module. `create` on the page refuses (code `worker`):
   a module never runs on the page's own thread. **Budget here = the sim runtime's 5 s per run** (`RUN_TIMEOUT` of
   src/runtimes/sim-spec/runner.ts): over it the worker is terminated, `runaway`, the core offers Restart.
2. **The runtime `wasm-module@1`** (`ACT.registerRuntime`): an item with its own `spec` mounts as that spec with `engine: "wasm@1"`
   and `model.module` = the item itself (one item instead of two). Without a spec: `spec` (the fallback).
   **`window.NoemaWasm.load(item, {budgetMs, seed})`** → a handle for host code (a future emulator UI, the tests):
   `call(fn, inputs, nOut) → {out: Float64Array, log, ms, pages}`, `raw(fn, …i32) → {value}`, `restart()`, `close()`, `state()`.
   Each call has `budgetMs` (50–5000, default 1000; loading max(1 s, budget)): over it the worker is terminated, the call rejects
   with code `runaway`, later calls reject with `stopped`, `restart()` starts a fresh worker from the same checked bytes.

## No network in the worker

A `blob:` worker inherits the creating page's CSP — and the app has none (ADR §1), so a policy cannot be relied on. The worker
source therefore starts with `neutralise(self)`: `fetch`, `XMLHttpRequest`, `WebSocket(Stream)`, `EventSource`, `WebTransport`,
`importScripts`, `Worker`, `SharedWorker`, `BroadcastChannel`, `indexedDB`, `caches`, `Request`, `navigator` (and so `sendBeacon`),
`RTCPeerConnection` are redefined as non-configurable `undefined` on the global and on its prototypes, before any other code runs.
The test probes each of them (and `Object.getPrototypeOf(self).fetch`, `self.constructor.prototype.fetch`) inside the worker against a
beacon server and expects 0 requests. **Known limit:** dynamic `import()` is syntax and cannot be removed — irrelevant here, since no
JS of the pack ever runs in the worker; if the app ever adds a CSP, it must keep `'wasm-unsafe-eval'` and `worker-src blob:`.

## Tools and tests

* `python3 activity_lint.py <subject-dir>` (the toolkit) — the item and the module's report (imports, exports, memory, sha256) and
  the errors, through `noema-tools.cjs` (the content checks call `NoemaWasm.checkItem` / `checkModel`).
* `tests/fixtures/wasm/*.wat` + the committed `.wasm`: `osc` (a damped oscillator `step`, an endless `spin`, `grow`, `rnd`, a log in
  `init`), `imem` (imported memory without a maximum), `forbidden` (`env.fetch_url`), `badsig`, `bigmem` (max 65536 pages), `nomax`.
  No toolchain needed: `watasm.py` assembles the flat-syntax subset (`python3 tests/fixtures/wasm/watasm.py --all`); `wat2wasm`
  accepts the same files.
* `node tests/activities_wasm.js --node` — the golden reports of the former Python twin, sha256, the ABI mapping (the worker code run in node). Without `--node`: the
  browser part (Chromium, Firefox, WebKit); `--app <dir>`: also in the built app.

## Wired in (what the integration added)

* The content checks (`src/features/content/domain/activities/`): `wasm-module@1` in `RUNTIMES` (and to `CHECKS_RUNTIMES`, it exposes values
  through its spec), `wasm@1` to `ENGINES`; call `check_item` / `NoemaWasm.checkItem` for the item and `check_model` /
  `checkModel` for a wasm@1 spec; `requiredCaps` must add `engine:wasm@1` for a wasm-module@1 item with a spec, and accept the
  `wasm`, `sha256`, `bytes`, `abi`, `spec` keys of the item. `make_pack.py` / `unpack.py`: `activities/<id>/module.wasm` ↔ base64.
* `tools/build.py skill`: ships `44_activity_wasm.js` in `activity_host/` (and in `noema-tools.cjs` for the checks); the harness loads
  `44_activity_wasm.js` and give its stub `ACT` an `ITEMS` map (or call `NoemaWasm.register(item)`).
* `docs/INTERACTIVE.md` §1 / §12.6: the runtime row and the engine; the ADR's "as built".
* **UI strings: none new.** Failures reuse the core's codes (`spec` → "could not start", `unsupported`, `runaway` → "stopped
  responding · Restart"); `NoemaWasm.load` rejects with codes only (`import`, `memory`, `spec`, `worker`, `runaway`, `stopped`, `abi`,
  `step`, `trap`) — host code that shows them adds its own `engine.act.wasm.*` keys in every UI language.
