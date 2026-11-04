# py-module@1 — Python activities (tier C)

A py-module@1 activity is **Python** (`main.py`, a function `step(inputs, state)`) plus a **spec** in the sim-spec@1 format
(`spec.json`: controls, readouts, plots). The app draws the spec exactly like a sim-spec@1 activity (`docs/INTERACTIVE.md` §12) and
asks Python for the numbers: Python is the engine. Use it when the numbers need real numerical work that formulas cannot do — a
filter's frequency response from its coefficients, an FFT, a matrix, an ODE solver, an optimiser, statistics (numpy; scipy when you
really need it). Everything else stays sim-spec@1 (no download, nothing to load) or html-app@1 (a picture of your own).

Pyodide 0.27.7 (Python 3.12.7) with numpy 2.0.2, scipy 1.14.1 (loaded only when declared) and micropip 0.9.0 (only for the
allow-listed extras), as decided in `docs/adr/001-interactive-activities.md` D7/D9. The reference activity is
`tools/activities_examples/py-filter/` (a moving-average and a first-order digital low-pass filter, numpy).

## 1. What the learner sees and pays

* The **first** Python activity downloads the runtime once: **about 17 MB** with numpy, **about 37 MB** with scipy (the sizes come
  from the manifest, `tools/pyodide_manifest.json`). One quiet line above the controls says so ("This activity runs Python: it
  downloads about 17 MB once, then works offline."), then shows the progress ("Getting Python ready… 4.2 MB of 16.9 MB"). On a metered
  connection (`navigator.connection.saveData` or cellular) it waits for a button ("Download 17 MB and start") instead of starting.
* An activity that needs an **extra** package (`requiresNetwork: true`) adds "The first time it also downloads quantiphy, so it needs
  the internet."
* Later starts take 2–4 s with numpy, 8–10 s with scipy (Python itself starts, then `import scipy.signal` alone takes 3–5 s).
* **Offline after the first use**: the files stay in the browser (a service worker's cache, `navigator.storage.persist()` is asked).
  **Settings › Data and sync** (shell) / **Account › Backup** (classic) has one line "Python for activities" (with the line icon of a download, as the frame's other Settings rows: no emoji) with its state
  (Ready offline / Partly here / Not on this device), the size on the device, a **Prepare Python for offline (…)** button with a
  progress bar, and in its ⓘ the parts (Python, numpy, scipy, each extra) and whether the browser promised to keep them.
* **Offline without the files**: the activity's fallback (picture + text) with "Python is not on this device yet, and there is no
  connection. Connect once, or prepare Python ahead in Settings." and a Restart button.
* **Never in the one-file bundle and never on `file://`**: the fallback with "This activity runs Python, which works only on the
  website, not in a downloaded copy of the app." (no request is made). Write the fallback text as carefully as for any activity.
* The runtime is **on by default** (ADR §10; it passed its tests in Chromium, Firefox and WebKit). `NOEMA_CONFIG.activities['py-module@1'] = false`
  in `config.js` switches it off: a py-module@1 activity then shows its fallback ("cannot run in this version") and the Settings line
  is not shown. On a deploy without the Python files (a failed fetch) the activity shows its fallback with Restart.

## 2. Files in the subject folder

```
activities/<id>/main.py           the Python (≤ 256 KB): a top-level def step(inputs, state)
activities/<id>/spec.json         the controls, readouts and plots (the sim-spec@1 format, without engine/model/bench)
activities/<id>/strings.<loc>.json   the words (every language the pack is read in)
activities/<id>/tests.json        the activity_test.py cases
```

The registry entry (`activities/activities.json`):

```json
{ "id": "py-filter", "runtime": "py-module@1", "entry": "activities/py-filter/main.py",
  "packages": ["numpy"],            // ⊆ numpy, scipy + the allow-listed extras (tools/pywheels_allow.json); at most 12
  "requiresNetwork": false,         // REQUIRED true when an extra is listed (it is downloaded on first use)
  "stepMs": 3000,                   // optional: the time budget of one step() (100–10 000 ms, default 3000)
  "stateVersion": 1, "capabilities": ["state", "events"],
  "fallback": { "media": "py-filter-still", "text": "…" }, "origin": "own", "credit": "…", "license": "own" }
```

`make_pack.py` puts the Python **inline** in the pack as `python` with its `sha256` and `bytes`, the spec as `spec`, the strings under
`strings`, and adds `runtime:py-module@1` to `pack.requires`; `unpack.py` gives `main.py` and `spec.json` back byte for byte.
`python3 activity_new.py <subject-dir> <id> --from py-filter` starts one from the reference.

## 3. The spec and the Python

The spec is a sim-spec@1 spec (§12.1 of `docs/INTERACTIVE.md`) with three differences:

* **no `engine`, no `model`, no `bench`**: the numbers come from `step()`;
* **`outputs` is required**: what `step()` returns, at least one `{id, kind: "scalar" | "series"}`;
* `derived` may use the params and Python's scalar outputs; readouts, plots and `checks` use the same names.

The app calls `step(inputs, state)` with the current values of the params (`{"kind": 0, "N": 8, "fc": 500}`) whenever the learner
changes a control — one call at a time, the latest values win (a step still running is not interrupted; the values that came in
meanwhile go next). The result is drawn when it arrives; the checks grader never grades older results (the same rev gate as
sim-spec@1).

```python
import numpy as np                    # declare every package you import in "packages"
import noema                          # provided by the app

def init(task, seed):                 # optional; task = the exercise's task.params, seed = the attempt's seed
    pass

def step(inputs, state):              # inputs: the params; state: a dict kept between steps
    n = int(inputs.get("N", 4))
    f = np.logspace(1, 3.6, 200)
    g = 20 * np.log10(np.abs(np.sinc(n * f / 8000) / np.sinc(f / 8000)) + 1e-6)
    return {"f": f, "gain": g, "att1k": float(g[np.argmin(abs(f - 1000))])}   # series → lists, scalars → numbers
```

The `noema` module: `noema.task`, `seed`, `locale`, `exercise`, `state`, `state_from`, `random` (a `random.Random(seed)`),
`t(key, vars)` (the activity's strings), `save_state(data=None)` (saved beside the controls' values and given back as `state` next
time), `event(name, data=None)`, `result(score, passed, detail=None)` (for a `reported` exercise), `announce(text)`,
`error(code, message)`.

Return values: a dict of JSON values; numpy arrays and scalars become lists and numbers, complex numbers `{re, im}`, NaN/±inf `null`.
At most 60 000 bytes of JSON per step.

**What Python cannot do** (the validators refuse it, the sandbox prevents it anyway): the network (`pyodide.http`, `pyfetch`,
`open_url`, `urllib`, `requests`, `http.client`, `socket`, `ssl`), JavaScript (`import js`, `pyodide_js`), `micropip` (the app installs
the declared extras itself), `input()`. Warnings: `while True` and `time.sleep` (a step must return quickly). `print` goes to the
console only.

## 4. Grading

A sim exercise on a py-module@1 activity is graded like a sim-spec@1 one:

* **`checks`** (recommended): rules the app evaluates on Python's scalar outputs and the params, e.g.
  `{"mode": "checks", "checks": [{"expr": "att1k <= -20", "label": "checkTone", "weight": 2}, {"expr": "pass300 >= -3", "label": "checkPass"}]}`;
  `task.params` may set values Python reads from `noema.task` (keys that are not params are allowed);
* **`reported`**: Python calls `noema.result(score, passed, detail)` and the exercise takes that result.

## 5. Keep steps fast

* A step has 3 s (`stepMs`); over budget the runner stops the worker and the learner sees Restart. Aim for < 50 ms: the app calls
  `step()` as the slider moves.
* Compute what does not change at the top level of `main.py` (it runs once, with a 20 s budget), not in every step.
* Vectorise with numpy; a few hundred points per curve are plenty (the plots draw at most 2000).
* scipy costs 20 MB more on first use and 3–5 s per start: use it only when numpy really cannot do the job.

## 6. Design — how it runs

Page (trusted: reads and checks the files) → `py:boot` with the bytes over a MessagePort → a hidden sandboxed runner frame (our script
only) → a blob: Worker with Pyodide, whose `fetch`/`importScripts` only look up those bytes. The app side is
`engine/src/37_activity_py_ui.js`: it mounts the sim-spec view of `35_activity_sim.js` (`ACT.simView`) with a host whose runner is
Python's `step()`; the runner itself is `engine/src/37_activity_py.js` (`NoemaPy.mountRunner`).

* **The runner has no network at all** (`connect-src 'none'`). A service worker never controls an opaque-origin (sandboxed) client, so
  the trusted page reads the pinned files and hands their bytes over the port; in the worker `fetch()` and `importScripts()` are
  replaced by a lookup in those bytes, which is emptied once Python has started.
* **Service worker** `engine/pyodide-sw.js`, scope `/vendor/pyodide/` (needs `Service-Worker-Allowed: /vendor/`). It controls only a
  script-less loader page it serves itself; the page calls that frame's `fetch()`, so the requests go through the worker: cache-first
  for files the manifest pins (`/vendor/pyodide/0.27.7/…`, `/vendor/pywheels/…`), a network copy is cached only if its sha256 matches
  (else 502 `x-noema-error: integrity`, never cached), unpinned paths are refused (404), the manifest is network-first. Without a
  service worker (refused, unsupported, `NOEMA_CONFIG.py.sw = false`) the page uses the same Cache Storage (`noema-py-v1`) itself, with
  the same checks. The page checks every file's sha256 again before use; Pyodide checks wheels against `pyodide-lock.json`.
* **Lazy:** only the declared packages are read. A numpy-only activity fetches no scipy/openblas file (tested). Extras need micropip.
* **Budget:** each `py:step` has `stepMs` (3 s); the top-level code + `init()` 20 s. Over budget → the runner terminates the worker,
  sends `error {code: 'runaway'}` (the core shows Restart) and `py:status {phase: 'stopped'}`; Restart starts a fresh worker with the
  last saved state.
* **Not in the one-file bundle / `file://`:** `NoemaPy.available()` is false there (`window.NOEMA_BUNDLE`, no secure http(s) origin, no
  Cache Storage); the core shows the fallback with the reason. The code is inert in `engine.js`.

### Security model

1. Frame `sandbox="allow-scripts"` (origin `"null"`: no app storage, cookies or DOM), CSP first: `default-src 'none'; script-src
   'sha256-<runner>' blob: 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'; frame-src 'none'; …` — the blob worker inherits
   it.
2. Tested escapes from Python, all refused with **0 requests** at the test server and a second "outside" server in Chromium, Firefox
   and WebKit: `js.fetch`, the real `WorkerGlobalScope.prototype.fetch`, XHR, `pyodide.http.open_url` / `pyfetch`, `urllib`,
   `importScripts`, WebSocket, EventSource, `new Worker(url)`, `eval`/`Function`, `pyodide_js.loadPackage(url)`, a blob script calling
   the real fetch, IndexedDB.
3. Packages: `packages` ⊆ numpy, scipy and the manifest's `wheels` (from `tools/pywheels_allow.json`); extras need
   `requiresNetwork: true`. A wheel whose bytes do not match its pin → `integrity`. micropip installs the extras from our virtual index
   with `deps=False`, then its index is set to an address that does not exist: `micropip.install('six')` at run time fails without a
   request. **Never open PyPI.** An extra is added to the allow-list by review only (a pure-Python wheel, its sha256, its licence).
4. `python` ≤ 256 KB and must match its `sha256`. Every message the runner relays goes through `ACTP.check` in the core (`py:out` and
   `py:status` are known there and read by the view); `py:*` from the runner through `NoemaPy.protocol.check`.

### Messages and API (for the integrator)

* `NoemaPy.mountRunner(box, {act, init, title, onMessage, onFail})` → `{send(type, payload, extra), close(), step(inputs) →
  Promise<{outputs} | {error: {code, message}}>, restart(), on(type, f) → off, ready}`. `act`: `{id, python, packages?,
  requiresNetwork?, stepMs?, sha256?}`.
* Messages (envelope `noema.activity/v1`): app → runner `py:boot`, `py:step {inputs}`, `py:restart`; runner → app
  `py:out {outputs | error, ms, init?}`, `py:status {phase: loading | starting | ready | stopped | failed, code?, bytes?, totalBytes?}`.
  `onFail` codes: `packages`, `integrity`, `offline`, `fetch`, `timeout`, `py-start`, `python`, `navigated`, `unavailable`, `empty`,
  `size`.
* `NoemaPy.need(packages)` → `{files, bytes, missing, missingBytes, extras, extrasMissing}` (what the first use would download).
* `NoemaPy.prepareOffline({include, onProgress, force})` → `{ok, files, bytes, persisted, failed}`; refuses on Save-Data unless `force`.
  `NoemaPy.status()` → `{supported, sw, via, persisted, version, cachedBytes, groups: {core, numpy, scipy, micropip, <extra>: {files,
  cached, bytes, ready}}}`.
* Config `NOEMA_CONFIG.py`: `base`, `manifest`, `sw` (URL or `false`), `swScope`, `loader`, `stepMs`, `initMs`, `startMs`.

## 7. Deployment

The Python files are **not in the repository** and not built by `tools/build.py`: after `python3 tools/build.py site`,

```
python3 tools/fetch_pyodide.py --site dist/site [--cache DIR]
```

downloads the pinned files from cdn.jsdelivr.net (Pyodide) and files.pythonhosted.org (the extras), checks each against its sha256,
and writes `dist/site/vendor/pyodide/0.27.7/…`, `dist/site/vendor/pywheels/…` and `dist/site/vendor/pyodide/manifest.json`.
`build_site` copies the service worker to `dist/site/engine/pyodide-sw.js` and writes its headers into `dist/site/_headers`:

| path | headers |
|---|---|
| `/engine/pyodide-sw.js` | `Service-Worker-Allowed: /vendor/`, `Cache-Control: no-cache` |
| `/vendor/pyodide/manifest.json` | `Cache-Control: no-cache` |
| `/vendor/pyodide/*`, `/vendor/pywheels/*` | `Cache-Control: public, max-age=31536000, immutable` (+ ACAO, CORP for a direct load) |
| `/vendor/pyodide/*.wasm` | `Content-Type: application/wasm` |

On Netlify (`netlify.toml`) the build runs `fetch_pyodide.py` after `build.py site` with the downloads kept in the build cache. If
the fetch fails the deploy still goes out (a warning in the log): Python activities then show their fallback (with "Python is not on this
device yet…") on that deploy, and the Settings line says Python cannot be reached. Updating Pyodide: `python3 tools/fetch_pyodide.py --pin` (maintainers; it rewrites
`tools/pyodide_manifest.json`), a new version folder, a new cache name in `pyodide-sw.js`.

## 8. Sizes and measurements

core 13.8 MB (`pyodide.asm.wasm` 10.1, `python_stdlib.zip` 2.4, `pyodide.asm.js` 1.3, lock 0.1) · numpy 3.1 MB · scipy +19.6 MB
(scipy 13.5 + openblas 6.1) · micropip + packaging 0.19 MB · a numpy-only activity ≈ 16.9 MB, with scipy ≈ 36.5 MB.

Measured 2026-11-04 on a local server (Chromium 153 / Firefox 155 / WebKit 26.6):

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| mount → Python ready, numpy (first use) | 3.9 s | 4.3 s | 3.4 s |
| mount → ready, numpy + scipy | 8.3 s | 10.4 s | 8.1 s |
| extras (quantiphy + a test wheel through micropip) | 3.5 s | 3.6 s | 4.0 s |
| one `step()` (numpy, 5 points), round trip | 6–7 ms | 4 ms | 5 ms |
| `while True: pass` → `runaway` | 3002 ms | 3003 ms | 3002 ms |
| `prepareOffline(numpy, scipy)`, 8 files, 36.5 MB | 1.0 s | 3.9 s | 0.8 s |

Offline after first use (server refuses `/vendor`, and with Playwright's route abort): runs in all three (Chromium and Firefox via the
service worker; WebKit via the page's cache when the loader navigation is aborted). Without any service worker: Chromium runs from the
page's cache. `navigator.storage.persist()` answers `false` in headless browsers: an evicted cache means a new download (the fallback
shows meanwhile).

## 9. Files and tests

| file | what |
|---|---|
| `engine/src/37_activity_py.js` | the runner: `window.NoemaPy`, the sandboxed frame, the worker, the Python `noema` module |
| `engine/src/37_activity_py_ui.js` | the runtime the app mounts: the sim-spec view with Python's `step()`, the quiet line, the Settings section |
| `engine/pyodide-sw.js` | the service worker |
| `tools/fetch_pyodide.py` | fetches and checks the files into the site (`--pin` rewrites the pin) |
| `tools/pyodide_manifest.json` | the pin: the files with sha256 and bytes, the packages with their dependencies |
| `tools/pywheels_allow.json` | the allow-list of extras (`quantiphy` 2.23, MIT, 43.6 KB) |
| `tests/activities_py.js` | the runner in Chromium, Firefox and WebKit (numpy, scipy, the budget, no way out, extras, offline) |
| `tests/activities.js`, `tests/activities_pack.py` | the validators (JS = Python), the pack round trip with main.py |
| `tests/activities_app.js` | the app over http: the first-use note, the view, the checks grader, Settings, offline, Greek, the fallbacks |

The harness (`activity_test.py`, `activity_preview.py`) runs Python activities over a local http server when the files are there:
`NOEMA_PYODIDE_SITE=<a folder with vendor/pyodide/>` (e.g. `dist/site` after `fetch_pyodide.py`); otherwise it skips them (exit code 2
when nothing else was checked).
