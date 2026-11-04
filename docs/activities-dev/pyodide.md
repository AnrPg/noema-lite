# py-module@1 — Python activities (Tier C) · developer notes

Pyodide 0.27.7 (Python 3.12.7) with numpy 2.0.2, scipy 1.14.1 (lazy) and micropip 0.9.0 (only for allow-listed extras), as decided
in `docs/adr/001-interactive-activities.md` D7/D9. The activity is Python source; its UI is drawn by the app from a declarative spec
(not part of this module) and calls the Python `step()`.

## Design

Page (trusted: reads + checks the files) → `py:boot` with the bytes over a MessagePort → sandboxed runner frame (our script only)
→ blob: Worker with Pyodide, whose `fetch`/`importScripts` only look up those bytes.

* **The runner has no network at all** (`connect-src 'none'`). The spike's design (the worker fetches `/vendor/pyodide/` itself)
  cannot be cached offline: a service worker never controls an opaque-origin (sandboxed) client. So the trusted page reads the pinned
  files and hands their bytes over the port; in the worker `fetch()` and `importScripts()` are replaced by a lookup in those bytes,
  which is emptied once Python has started. ACAO/CORP headers are therefore not required (kept in the headers file for a direct load).
* **Service worker** `engine/pyodide-sw.js`, scope `/vendor/pyodide/` (needs `Service-Worker-Allowed: /vendor/`). It controls only a
  script-less loader page it serves itself; the page calls that frame's `fetch()`, so the requests go through the worker: cache-first
  for files the manifest pins (`/vendor/pyodide/0.27.7/…`, `/vendor/pywheels/…`), a network copy is cached only if its sha256 matches
  (else 502 `x-noema-error: integrity`, never cached), unpinned paths are refused (404), the manifest is network-first.
  Without a service worker (refused, unsupported, `NOEMA_CONFIG.py.sw = false`) the page uses the same Cache Storage itself, same checks.
  The page checks every file's sha256 again before use; Pyodide checks wheels against `pyodide-lock.json` (`checkIntegrity`).
* **Lazy:** only the declared packages are read. numpy-only activities fetch 0 scipy/openblas files (tested). Extras need micropip.
* **Budget:** each `py:step` has 3 s (`act.stepMs`, 100–10 000 ms); the top-level code + `init()` have 20 s (`import scipy.signal`
  alone takes 3.5–4.8 s). Over budget → the runner terminates the worker, sends `error {code:'runaway'}` (the core shows *Restart*)
  and `py:status {phase:'stopped'}`; `py:restart` (or a new mount) starts a fresh worker with the last saved state.
* **Not in the one-file bundle / `file://`:** `available()` is false there (no secure http(s) origin, no Cache Storage), the runtime
  does not register, the core shows the activity's fallback. The code is inert in `engine.js`.

## Files

| file | what |
|---|---|
| `engine/src/37_activity_py.js` | the runtime (`ACT.registerRuntime('py-module@1')`), `window.NoemaPy`, runner + worker + the Python `noema` module |
| `engine/pyodide-sw.js` | the service worker (copied to `<site>/engine/` by `fetch_pyodide.py`; add it to `build_site`) |
| `tools/fetch_pyodide.py` | downloads + verifies into `<site>/vendor/pyodide/0.27.7/`, `<site>/vendor/pywheels/`, writes `<site>/vendor/pyodide/manifest.json`; `--pin` rewrites the pin |
| `tools/pyodide_manifest.json` | the pin: 10 files with sha256 + bytes, packages with their dependency closure (from `pyodide-lock.json`) |
| `tools/pywheels_allow.json` | the allow-list index of extras: `quantiphy` 2.23 (MIT, 43.6 KB, no deps: SI quantities "4.7 kΩ"); headers: `pyodide_headers.txt` |
| `tests/activities_py.js` | the browser suite (Chromium, Firefox, WebKit) |

## Sizes (bytes on first use)

core 13.8 MB (`pyodide.asm.wasm` 10.1, `python_stdlib.zip` 2.4, `pyodide.asm.js` 1.3, lock 0.1) · numpy 3.1 MB · scipy +19.6 MB
(scipy 13.5 + openblas 6.1) · micropip + packaging 0.19 MB · numpy-only activity ≈ 16.9 MB, with scipy ≈ 36.5 MB.

## Measured (this sandbox, 2026-11-04, local server; Chromium 153 / Firefox 155 / WebKit 26.6)

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| mount → Python ready, numpy (first use; Pyodide start / numpy / user code) | 3.9 s (2.3 / 0.55 / 0.5) | 4.3 s (2.1 / 0.74 / 0.55) | 3.4 s (1.8 / 0.6 / 0.5) |
| mount → ready, numpy + scipy (packages / `from scipy import signal`) | 8.3 s (1.7 / 3.6) | 10.4 s (2.7 / 4.5) | 8.1 s (2.1 / 3.4) |
| extras (quantiphy + a test wheel through micropip) | 3.5 s | 3.6 s | 4.0 s |
| one `step()` (numpy Bode, 5 points), round trip | 6–7 ms | 4 ms | 5 ms |
| `while True: pass` → `runaway` | 3002 ms | 3003 ms | 3002 ms |
| `prepareOffline(numpy, scipy)` 8 files 36.5 MB (local) | 1.0 s | 3.9 s (3 s of it: `persist()` prompt timeout) | 0.8 s |

## Offline, per browser

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| after first use, server refuses `/vendor` (503) | runs, via service worker | runs, via service worker | runs, via service worker |
| after first use, 503 + Playwright `route.abort` | runs, via service worker | runs, via service worker (its manifest refetch reaches the server: Firefox does not route SW requests) | runs, via the page's cache (Playwright aborts the loader navigation before the SW sees it; +5 s loader timeout) |
| fresh profile, `prepareOffline` then 503 + abort, scipy activity | runs (sw) | runs (sw) | runs (page cache) |
| no service worker at all (`sw:false`), 503 | runs (page cache) | not run | not run |
| `navigator.storage.persist()` (evicted cache → network again, fallback meanwhile) | `false` (headless) | no answer in 3 s (`null`) | `false` |

## Security model

1. Frame `sandbox="allow-scripts"` (origin `"null"`: no app storage/cookies/DOM), CSP first: `default-src 'none'; script-src
   'sha256-<runner>' blob: 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'; frame-src 'none'; …` — the blob worker inherits
   it. `blob:` scripts are allowed (Pyodide's own files load that way); any JS Python makes that way still has no network.
2. Tested escapes from Python, all refused with **0 requests** at the test server and a second "outside" server in all three engines:
   `js.fetch`, the real `WorkerGlobalScope.prototype.fetch`, sync/async XHR, `pyodide.http.open_url` / `pyfetch`, `urllib`,
   `importScripts` (ours and the real one), WebSocket, EventSource, `new Worker(url)`, `eval`/`Function` (no `unsafe-eval`),
   `pyodide_js.loadPackage(url)` (installs nothing), a blob script calling the real fetch, IndexedDB. WebKit gives the worker a
   CacheStorage of its own (empty, not the app's); Chromium/Firefox refuse it.
3. Packages: `act.packages` ⊆ `numpy`, `scipy` and the manifest's `wheels` (from `tools/pywheels_allow.json`); anything else → the
   mount fails with `packages`. Extras require `act.requiresNetwork: true` (else `packages`). A wheel whose bytes do not match its pin →
   `integrity`. micropip installs the extras from our virtual index with `deps=False`, then its index is set to an address that does
   not exist; `micropip.install('six')` at run time fails without a request (tested).
4. `act.python` ≤ 256 KB; if `act.sha256` is given, the source must match it. Messages: everything the runner relays goes through
   `ACTP.check` in the core; `py:*` through `NoemaPy.protocol.check`. Outputs ≤ 60 000 bytes of JSON per step.

## The Python API (for authors)

```python
import numpy as np, noema            # noema is provided by the app
def init(task, seed):                # optional; task = the exercise's task.params, seed = the attempt's seed
    return {"f0": task.get("f0")}    # optional: a dict is sent as py:out {outputs, init: true}
def step(inputs, state):             # inputs: what the UI sent; state: a dict kept between steps (saved only by save_state)
    state["n"] = state.get("n", 0) + 1
    if inputs.get("done"): noema.result(0.8, True, "detail")   # score 0..1, passed, detail ≤ 500 chars
    return {"db": 20 * np.log10(np.abs(1 / (1 + 1j * np.logspace(0, 6, 50) / 1000)))}
```
`noema.task`, `seed`, `locale`, `exercise`, `state`, `state_from`, `random` (a `random.Random(seed)`), `t(key, vars)`,
`save_state(data=None)`, `event(name, data=None)`, `result(score, passed, detail=None)`, `announce(text)`, `error(code, message)`.
Return values: dict of JSON values; numpy arrays/scalars become lists/numbers, complex `{re, im}`, NaN/±inf `null`.
No network, no files from outside, no `input()`; `print` goes to the console only. Declare `packages` in the registry entry.

## Page and runtime API (for the integrator / the host UI)

* `ACT.registerRuntime({id:'py-module@1', version:1, startTimeoutMs:120000, mount})`; `mount(box, {act, init, title, onMessage,
  onFail, onPy?})` → `{send(type, payload, extra), close(), step(inputs) → Promise<{outputs}|{error:{code,message}}>, restart(),
  on(type, f) → off, ready}`. `act`: `{id, python, packages?, requiresNetwork?, stepMs?, sha256?}`.
* Messages (envelope `noema.activity/v1`): app → runner `py:boot`, `py:step {inputs}` (+`id`), `py:restart`; runner → app
  `py:out {outputs | error, ms, init?}` (+`re`), `py:status {phase: loading|starting|ready|stopped|failed, code?, timing?}`. The runner
  sends `ready` when it has `init`; Python is ready at `py:status ready`. Steps sent before that wait; a newer step replaces a waiting
  one (`error superseded`). `onFail` codes: `packages`, `integrity`, `offline`, `fetch`, `timeout`, `py-start`, `python`, `navigated`,
  `unavailable`, `empty`, `size`.
* `NoemaPy.prepareOffline({include:['numpy','scipy'], onProgress, force})` → `{ok, files, bytes, persisted, failed}`; progress also as
  `window` event `noema-py-progress` (`{file, done, total, bytes, totalBytes}`); refuses on `navigator.connection.saveData` unless `force`.
  `NoemaPy.status()` → `{supported, sw, via, persisted, version, cachedBytes, groups:{core, numpy, scipy, micropip, <extra>: {files, cached, bytes, ready}}}`.
* Config `NOEMA_CONFIG.py`: `base`, `manifest`, `sw` (URL or `false`), `swScope`, `loader`, `stepMs`, `initMs`, `startMs`.

## Limits / to do for the integrator

* The core's 15 s "no ready" timer is fine (`ready` comes at once); the core should keep its own start timeout for Python at least
  `startTimeoutMs` before giving up on `py:status ready` (the runtime fails itself with `timeout` after 120 s).
* `ACTP.IN` does not know `py:*` (they are ignored, never a strike); `checkActivities`/`activities.py` need `python`, `packages`,
  `requiresNetwork`; `build_site` must copy `engine/pyodide-sw.js` and add the headers; run `fetch_pyodide.py` after it.
* One worker (one Python) per mounted activity; memory was not measured here. The D8 live limit (1–2 at once) applies.
