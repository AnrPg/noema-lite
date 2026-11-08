# Interactive activities — the contract (noema.activities/v1)

An **activity** is a small interactive program inside a pack: an explorer in the theory (move a slider, watch what changes)
or a graded **sim** exercise (reach a goal in the activity; the activity reports whether it was reached, or the app checks it).
The decisions and the spikes behind this page are in `docs/adr/001-interactive-activities.md`. How to write one well:
`docs/INTERACTIVE_AUTHORING.md`. The formulas of `sim-spec@1`: `docs/INTERACTIVE_SIMEXPR.md`. The circuit engine and the
fault-finding bench: `docs/INTERACTIVE_CIRCUIT.md`. The heat, control-loop, radio and IoT-twin engines:
`docs/INTERACTIVE_ENGINES.md`. The engine library (the canonical way: general engines for every field, and requests for new
engines): `docs/INTERACTIVE_LIBRARY.md`. Python (`py-module@1`): `docs/INTERACTIVE_PYTHON.md`. H5P packages (`h5p@1`):
`docs/INTERACTIVE_H5P.md`. WebAssembly modules: `docs/INTERACTIVE_WASM.md`. Outside pages (PhET, GeoGebra, Desmos):
`docs/INTERACTIVE_EMBED.md`. The learning record export: `docs/INTERACTIVE_XAPI.md`.

Activities are optional. A chapter without them is complete; a chapter with them still needs every rule of
`tools/CONTENT_SPEC.md` (Q1–Q8). An activity never replaces the theory: the text explains the idea, the activity lets the
learner try it.

## 1. Runtimes (tiers)

| runtime | what it is | status |
|---|---|---|
| `html-app@1` (tier A) | one self-contained HTML file (inline scripts and styles, pictures as `data:` URIs) in a sandboxed frame | **available** |
| `sim-spec@1` (tier B) | a JSON spec (controls, formulas, readouts, plots) run by the app's own trusted engines — no code in the pack (§12) | **available** — engines `formula@1` (formulas), `circuit-mna@1` (circuits, transients and fault-finding benches: §12.6–12.7), `thermal@1` (lumped thermal networks), `pid@1` (control loops), `rf@1` (radio links) and `twin@1` (the digital twin of a battery-powered IoT node, with benches) — `docs/INTERACTIVE_ENGINES.md` |
| `py-module@1` (tier C) | Python (`main.py`, Pyodide + numpy, scipy; allow-listed extras through micropip) in a sandboxed worker; the app draws a sim-spec@1 spec with Python's outputs (`docs/INTERACTIVE_PYTHON.md`) | **available** on the website, on by default (`NOEMA_CONFIG.activities['py-module@1'] = false` turns it off); 17 MB (numpy) / 37 MB (scipy) once, offline after the first use, never in the one-file bundle or on `file://` |
| `h5p@1` (tier B) | an ordinary `.h5p` package (quiz, drag and drop, fill in the blanks, mark the words, dialog cards…) played by the app's own H5P player in the same sandbox, no network (docs/INTERACTIVE_H5P.md) | **available** — on by default; the file travels beside the pack |
| `wasm-module@1` | a precompiled WebAssembly module (C, Rust, AssemblyScript) run in a worker with no network and no imports but a tiny host ABI; shown through a `sim-spec@1` spec with the engine `wasm@1` (`docs/INTERACTIVE_WASM.md`) | **available** (P6) — engine `wasm@1` |
| `external-embed@1` | an allow-listed page of an outside provider (PhET, GeoGebra, Desmos) in a double sandboxed frame, after a consent card; **explore only**, needs the network (`docs/INTERACTIVE_EMBED.md`) | **opt-in** (P6): off unless `NOEMA_CONFIG.activities['external-embed@1']` is `true`; Falstad, CircuitJS and Wokwi stay refused (pending) |

`make_pack.py` refuses a runtime that this version of the app does not run yet.

**Licence limits of the outside providers** (`external-embed@1`; details and sources in `docs/INTERACTIVE_EMBED.md` §1):
PhET simulations are CC BY 4.0 — the newer ones CC BY-NC, so check each sim; GeoGebra is free for **non-commercial** use only;
the Desmos Terms of Service **limit commercial use**. Every embed carries its credit and licence at the point of use, and the
validators warn (`license-nc`) on every non-commercial licence: a pack used commercially needs the provider's permission.
H5P content imported with `h5p_import.py` keeps each package's own licence in `cite` (`docs/INTERACTIVE_AUTHORING.md`).

## 2. Files in the subject folder

```
activities/
├── activities.json                 the registry (below)
└── <activity-id>/
    ├── app.html                    the bundle (html-app@1): everything inline, at most 512 KB (aim for <= 256 KB)
    ├── spec.json                   or the spec (sim-spec@1): data only, at most 64 KB (§12)
    ├── main.py                     or the Python (py-module@1, at most 256 KB) + its spec.json (docs/INTERACTIVE_PYTHON.md)
    ├── module.wasm                 or a WebAssembly module (wasm-module@1, at most 2 MiB; + spec.json): docs/INTERACTIVE_WASM.md
    ├── strings.en.json             the activity's words, one table per language: {"key": "text with {vars}"}
    ├── strings.el.json
    ├── strings.ru.json            (every language the pack is read in: its own + each translation)
    ├── item.h5p                    or the .h5p package (h5p@1), unchanged, at most 100 MB; its words are in its content.json:
    ├── content.el.json             one per translation of the pack (the same content.json in that language), no strings.*.json
    └── activity.json               (h5p@1) id, title, height, fallback, licence
media/<still>.svg|png               the fallback picture (a normal pack picture in media/media.json)
```

`make_pack.py` puts each bundle **inline** in the pack (like the pictures), with its `sha256` and `bytes` (a spec as `spec`), and
the string tables under `strings`; it writes `pack.requires` (+ `engine:<id>` for an engine other than the built-in `formula@1`)
and `counts.activities`. An `h5p@1` package is **not** inline: `item.h5p` travels **beside** the pack (the `.noema.zip` entry
`activities/<id>/item.h5p`; the account asks for it in `noema_finish_upload`), with its `sha256` and `bytes` in the registry and
each `content.<locale>.json` inline under `h5pByLocale` (docs/INTERACTIVE_H5P.md §1–§2). `unpack.py` gives the folder back. `python3 activity_new.py <subject-dir> <id>` starts one from the
reference activity alias-lab; `--runtime sim-spec@1` from rc-lowpass (an RC low-pass filter); `--from py-filter` from the Python
reference (py-module@1: `main.py` inline as `python` with its `sha256` and `bytes`, its spec as `spec`, `runtime:py-module@1` in
`pack.requires`); `--runtime h5p@1` from planets-quiz, or `--runtime h5p@1 --from FILE.h5p` from your own package; `--from wasm-oscillator`
(`--runtime wasm-module@1`) from a damped oscillator computed by a WebAssembly module; `--from` rc-transient, led-bench, heatsink,
pid-tune, lora-link or sensor-node from the other references of `tools/activities_examples/`.

## 3. The registry — `activities/activities.json`

```json
{ "format": "noema.activities/v1",
  "items": [{
    "id": "alias-lab",                       // a-z, 0-9 and -, 2–61 characters, unique in the pack
    "runtime": "html-app@1",                 // or "sim-spec@1" with "entry": "activities/<id>/spec.json", or "h5p@1" with
                                             //   "entry": "activities/<id>/item.h5p" (+ "h5pByLocale"; no "strings" needed)
    "entry": "activities/alias-lab/app.html",
    "stateVersion": 1,                       // raise it when the shape of the saved state changes (§6)
    "capabilities": ["state", "events", "resize", "result", "announce"],   // + "hints"
    "height": 360,                           // optional default height in px (a block can set its own)
    "engines": ["graph@1"],                  // html-app@1 only, optional: the engines of the library the mini-app uses (§8.1)
    "fallback": {                            // REQUIRED: what the learner sees when the activity cannot run
      "media": "alias-lab-still",            //   a still picture of the pack (needs no exercises of its own)
      "text": "A 7 Hz sine sampled 10 times a second: …"   // >= 40 characters: what it shows and teaches
    },
    "origin": "own", "credit": "…", "license": "own"
  }] }
```

## 4. In a chapter

**Theory block** (an explorer, not graded) — in a section's `blocks`:
```json
{ "t": "interactive", "activity": "alias-lab", "caption": "Move the sliders.", "height": "auto" }
```
`height`: `"auto"` (the activity tells its height) or 120–2000 px; or `"aspect": "16:9"`. Like every figure it is
**explained in detail right after it** (Q7b): what it shows, how to read it, what to try, what it teaches.

**Exercise** — type `sim`:
```json
{ "id": "ch01-e900", "type": "sim", "section": "ch01-s01", "difficulty": 2, "tags": ["concept"], "think": "apply", "lr": "ch01-l04",
  "activity": "alias-lab",
  "q": "A 7 Hz signal is sampled. Find a sampling rate at which the samples look like a 3 Hz wave.",
  "task": { "seed": "auto", "params": { "f": 7, "target": 3 } },
  "grade": { "mode": "reported" },
  "hints": ["The samples cannot tell f apart from f − n·fs.", "Try a rate between 7 and 14 Hz."],
  "reveal": "At 10 Hz, 7 − 10 = −3: …",
  "explain": "…", "cite": { "src": "…", "loc": "…" } }
```
- `q` states the goal completely (Q1: self-contained); the activity shows the same goal in its own words.
- `task.params` reach the activity as `noema.task`; `seed` is `"auto"` (a new one each attempt) or a whole number.
- `grade.mode`: `"reported"` (html-app@1) — the activity calls `noema.result({score, passed})`; **Check** grades with the last
  result (nothing reported yet → Check does nothing). `"checks"` (sim-spec@1) — the app evaluates the rules itself (§12.5);
  it is refused for an html-app, whose values the app cannot see, and `"reported"` is refused for a sim-spec, which reports nothing.
  A py-module@1 activity takes either: `checks` on Python's outputs, or `reported` with `noema.result(score, passed)` from Python.
- `hints` (at most 6): shown one by one under the activity; each one costs: the score × 0.85 per hint, never below × 0.5. A hint leads to the next good question, never to the answer.
- `reveal`: shown after a right answer, `explain` as for every exercise.
- Quality rules: `sim` is **opt-in** — it counts for a chapter only when `fits.types` of its map names it, and then at least
  one is needed (the pack rules' `optIn`, `fit.types.minPerKind`: `src/features/content/domain/rules.ts`).

## 5. Words and languages

An activity shows **no words of its own**: every label, message and goal comes from its string tables through
`noema.t(key, {vars})` (`{name}` placeholders; a sim-spec names its keys in the spec: `"label": "resistance"`). The app picks the table of the language the pack is shown in, then the pack's
own language, then English. Every table has the same keys; there is one for each language the pack is read in (its own and
each translation). Numbers through `noema.fmt.number(n)`. Visible text in the HTML body is a warning.

## 6. State, events, attempts

- `noema.saveState(data)` (debounced): an explorer's state is kept per activity and place (`S.act`), at most 256 KB, and comes
  back as `noema.state` next time. After a `stateVersion` change, `noema.stateFrom` names the old version (migrate or start
  clean); state from a *newer* version is left untouched and the activity starts clean.
- `noema.event(name, data?)`: what the learner did (`name` like `fs` or `probe:placed`, data <= 4 KB); at most 50 a second.
  A sim attempt keeps its last 200 events, the result and the hints used (`S.att`).

## 7. Limits and safety (what the app enforces)

- The frame: `sandbox="allow-scripts"` only (opaque origin: no cookies, storage, app DOM or same-origin requests), a
  Content-Security-Policy as the first element: no network of any kind, no forms, frames, workers or plugins, and **scripts
  only by hash** — exactly the inline scripts of the bundle, after the loop guard was added. So inline handlers
  (`onclick=`), `javascript:` URLs, `eval`/`new Function` and scripts made at run time do not run. Devices (camera,
  microphone, location…) are off.
- Two frames: the app's frame holds a wrapper without scripts whose policy blocks every navigation (`frame-src 'none'`), and the
  mini-app runs inside it, so a mini-app cannot leave for the network by navigating itself (`location = …`, a link, a refresh).
- The loop guard: every `while`, `do`, `for` and `for … of` gets a time check; one turn of the event loop that runs longer
  than 1.5 s stops the activity (the app offers Restart). Animate with `requestAnimationFrame`, never a busy loop.
- A watchdog pings every 2 s; three missed answers stop the activity. A frame that never says hello stops after 15 s.
- Engines of the library (§8.1) run in the HOST's Worker, never in the frame: only those the registry entry lists, ≤ 5 s a run,
  one run at a time per engine, ≤ 30 requests a second, outputs ≤ 512 KB.
- Messages: at most 64 KB, each one checked; five bad messages stop the activity. A frame that navigates away is stopped.
- At most 2 activities run at once (1 on a phone); one that leaves the screen pauses, and the oldest is parked (Start). One whose
  runtime is still loading holds its slot too, so blocks that come into view together start only as many as there are slots.
- An activity that cannot run (unknown activity, runtime off or missing, bundle changed, error) shows its fallback picture
  and text. An exercise type the app does not know is hidden (it stays in the pack) instead of breaking the chapter.
- A pack whose `requires` names something this app lacks: the open tab reloads to a newer build when it comes back to the
  front; meanwhile the fallbacks show.

`make_pack.py`, `tools/build.py`, the connector (`noema_save_pack`, `noema_finish_upload`) and the app check the same rules
(`checkActivities` of the content checks, `src/features/content/domain/activities/`; `tests/activities.js` holds it to its golden messages).

## 8. The window.noema API (html-app@1)

The app adds `window.noema` (frozen) before the bundle's scripts run. Wait for `noema.ready` before using the rest.

| member | what it does |
|---|---|
| `noema.ready` | a promise; resolves once the app has sent the start data |
| `noema.locale`, `noema.theme`, `noema.seed`, `noema.task`, `noema.exercise` | the language; the design tokens; the seed; `task.params`; the exercise id (null in the theory) |
| `noema.state`, `noema.stateFrom` | the saved state (or null); the older `stateVersion` it was saved with (or null) |
| `noema.t(key, vars)` | a string of the current table, `{var}` filled in |
| `noema.fmt.number(n, options)` | a number in the learner's format |
| `noema.random()` | a random number in [0, 1) from the seed (the same task gives the same numbers) |
| `noema.saveState(data)` · `noema.event(name, data)` · `noema.result({score, passed, detail})` | §6, §4 |
| `noema.hint()` | a promise of the next hint's text (or null), when the activity has its own hint button |
| `noema.announce(text)` | read out by screen readers (polite) |
| `noema.error(code, message)` | report a problem (shown as a quiet note; the code is logged) |
| `noema.resize()` | measure again (height changes are noticed on their own) |
| `noema.on(type, f)` | `theme` (new tokens), `locale`, `pause`, `resume`, `destroy` |

Design tokens arrive as CSS custom properties on `<html>`: `--noema-bg`, `--noema-bg2`, `--noema-card`, `--noema-ink`,
`--noema-ink2`, `--noema-ink3`, `--noema-line`, `--noema-ok`, `--noema-bad`, `--noema-warn`, `--noema-info`, `--noema-c`
(the accent), `--noema-font`, `--noema-mono`, `--noema-r`; `data-noema-scheme` is `light` or `dark`,
`data-noema-motion` is `reduce` when the learner prefers less motion.

**The protocol under it** (for runtimes and tests): the frame posts `{t: 'hello', nonce}` to the parent; the app accepts it only
from that frame's window with that nonce and hands over a `MessagePort`; every later message is
`{p: 'noema.activity', v: 1, type, payload, id?, re?}` over the port. App → activity: `init`, `theme`, `locale`, `ping`,
`pause`, `resume`, `destroy`, `hint` (answer to `hint:request`). Activity → app: `ready`, `pong`, `resize {h}`,
`state {version, data}`, `event {name, data}`, `result {score, passed, detail}`, `hint:request`, `a11y:announce {text}`,
`error {code, message}`, and `engine:check` / `engine:run` (§8.1). A message of a newer version stops the activity with "needs a newer version of the app".

### 8.1 Engines of the library in a mini-app

A mini-app (a game, a puzzle, a custom picture) can compute with the **engines of the library** instead of re-implementing the
science: Dijkstra on any graph (`graph@1`), a virtual patient (`clinic@1`), a date in every calendar (`timeline@1`), a tuning
(`music@1`)… It lists them in its registry entry, `"engines": ["graph@1"]` (1–8 ids of the library: `anatomy@1`, `clinic@1`,
`craft@1`, `genetics@1`, `geom@1`, `graph@1`, `map@1`, `med@1`, `music@1`, `ode@1`, `prob@1`, `seq@1`, `text@1`, `timeline@1`), and
then, after `noema.ready`:

| member | what it does |
|---|---|
| `noema.engines()` | the ids the mini-app may use here (those it lists that this app runs) |
| `noema.engine(id)` | a handle `{ id, check(spec), run(spec, inputs, {seed}) }` (always returned; its calls reject when the engine is not usable) |
| `.check(spec)` | a promise of the engine's own problems with the model, `["model.graph.nodes: the graph has no nodes", …]` (empty: fine) |
| `.run(spec, inputs, {seed})` | a promise of `{ outputs }`: the values the spec's `outputs` name — numbers, arrays (≤ 2000), scenes, sounds |

`spec` is the engine's part of a sim-spec@1 spec: `{ "model": {…}, "outputs": [{"id", "kind", "of", …}] }`, exactly as in the
engine's chapter (`docs/library/<name>.md`); anything else in it is ignored. Expressions in the model may use the names of
`inputs` (`{name: number | true/false}`, ≤ 64). `seed` (a whole number) defaults to the activity's seed (`noema.seed`), so the same
task draws the same randomness.

```js
const graph = noema.engine('graph@1');
const r = await graph.run({ model: { graph: { nodes: [{id: 'a'}, {id: 'b'}, {id: 'c'}], edges: [{u: 'a', v: 'b', w: 4}, {u: 'b', v: 'c', w: 1}, {u: 'a', v: 'c', w: 7}] },
                                     run: { alg: 'dijkstra', source: 'a', target: 'c' } },
                            outputs: [{ id: 'best', kind: 'scalar', of: 'result' }, { id: 'path', kind: 'series', of: 'path' }] }, {});
// r.outputs = { best: 5, path: [0, 1, 2] }
```

A refused or failed call rejects with an `Error` whose `code` says why (and `errors`, a list, for `spec`): `undeclared` (the entry
does not list the engine), `unavailable` (this app cannot run it here), `spec` (not `{model, outputs}`, not plain data, or the model
fails the engine's checks), `inputs`, `superseded` (a newer run replaced this one while it waited), `timeout` (over 5 s), `failed`,
`too-big` (outputs over 512 KB), `rate` (over 30 requests a second). Never a crash: show your own message (from your strings).

**How it runs.** The frame gets no Worker and no network (its policy is unchanged, §7): the app — the HOST — checks every request,
runs the model in the engine's own Worker (the same runner as sim-spec@1: the same code as on a sim-spec page, the 5 s limit, the
Worker ended on a runaway) and sends back only the outputs the spec names. One Worker per mini-app and engine, made on the first
run and reused (a different model goes to the same Worker); one run at a time and one waiting (the latest wins); after three
timeouts the engine is off until the mini-app restarts; every Worker ends when the mini-app is unmounted. Only the engines of the
library: they are pure, bounded and deterministic, hold no hidden state of the learner and never see the app's data — never
`formula@1` (it computes nothing a mini-app cannot) nor a plugin (`circuit-mna@1`, the P6 engines and their benches with hidden faults).

**Declared, checked, required.** The validators (the content checks, `src/features/content`: the app, the connector and the Python tools alike) check that
`engines` is a list of library ids and that every `noema.engine('<id>')` in the bundle is listed; `make_pack.py` adds
`engine:<id>` to `pack.requires`, so an app without that engine reloads to a newer build, and a mini-app that lists an engine this
app cannot run shows its fallback. `activity_test.py` runs it with the real engines (a step `{"waitFor": "<selector>"}` waits for
the engine's answer). The reference is `tools/activities_examples/cheapest-route/` (a route game on `graph@1`).

**Protocol.** Activity → app: `engine:check {engine, spec}` and `engine:run {engine, spec, inputs?, seed?}`, each with an `id`;
app → activity: `engine:result {ok: true, errors} | {ok: true, outputs} | {ok: false, code, message?, errors?}` with `re`.

## 9. Accessibility and phones

Every control reachable by keyboard and labelled (`aria-label` from the string table); a live text that says what changed
(and `noema.announce` for big changes); colours from the tokens (light and dark); `prefers-reduced-motion` respected; works
from 320 px wide with no horizontal scroll (docs/UI_MAP.md "Small screens"), touch targets >= 36 px. The app adds a
"skip the activity" link before each one and offers full screen.

## 10. Offline

`html-app@1`, `sim-spec@1` and `wasm-module@1` work offline (everything is inline; the engines are part of the app). `h5p@1` works offline too:
the H5P player is part of the app, and the `.h5p` file is kept on the device with the pack (checked by its sha256); in the one-file
bundle an item up to 2 MB is inline and a bigger one shows its fallback. `external-embed@1` needs the network every time: offline,
or when the page does not load in 20 s, the block shows its fallback with Restart (= try again). `py-module@1` needs the
Pyodide files (about 17 MB with numpy, 37 MB with scipy) from the website the first time; the app's one service worker
(`src/composition/sw.ts`, the site's `/sw.js`) then keeps them on the device (`navigator.storage.persist()` is asked), as are the allow-listed extras.
Settings › Data and sync (classic: Account › Backup) has "Prepare Python for offline" with progress, the size and what is cached.
Offline without the files, and always in the one-file bundle and on `file://`, the activity shows its fallback with the reason.
Deployment: `python3 tools/fetch_pyodide.py --site dist/site` after `python3 tools/build.py site` (Netlify does it, and a failed
download never breaks the deploy); `build_site` writes the headers (a no-cache `/sw.js`, immutable caching, `application/wasm`)
into `_headers` — `docs/INTERACTIVE_PYTHON.md` §7.

## 11. Before you deliver — checklist

1. `python3 activity_lint.py <subject-dir>` — no errors (and no warnings you cannot explain); for a sim-spec it checks every
   expression against the names the spec declares, every label key in every table, the limits; for a circuit the netlist,
   the bindings, the faults, points and instruments of a bench; for an h5p@1 item the package rules of `NoemaH5P.check` (allowed
   content types and libraries, no outside link, no file type H5P refuses) on the package and on each translation.
2. `python3 activity_test.py <subject-dir>` — it loads, says hello, shows its words in every language, reports right and wrong
   results for the solutions and wrong attempts you listed, and no console errors (a bench: `measure` / `diagnose` steps, the
   readings in the log, the right and the tempting wrong diagnosis; docs/INTERACTIVE_AUTHORING.md).
3. `python3 activity_preview.py <subject-dir> <id>` — look at the screenshots (light, dark, 360 px, fallback).
4. The block is explained after it; the sim exercise's `q` is complete; hints lead to the idea, not the answer.
5. `make_pack.py` — the pack builds.

## 12. sim-spec@1 — a declarative simulation (tier B)

The pack carries **data only**: the controls, the formulas, the readouts and the plots. The app's own code renders them with its own
DOM and styles (theme tokens, dark mode, keyboard, labels, 320 px) and computes them with its own engines; nothing of the pack runs,
so there is **no frame** (and no loop guard, no CSP to pass). Use it for "move a quantity, watch the others" and for graded "find a
setting" tasks; use `html-app@1` only for what a spec cannot say (a drawing to drag, a game, a custom picture).

### 12.1 The spec — `activities/<id>/spec.json`

```json
{ "format": "noema.sim-spec/v1",
  "engine": "formula@1",                       // the default: the derived values are the model (§12.6 for others)
  "title": "title", "intro": "intro",          // optional: keys of the string tables
  "consts": { "target": 1000, "tol": 0.05 },   // named numbers; a sim exercise's task.params may set them (only these)
  "params": [                                  // 1–24 controls, in this order on the screen
    { "id": "R", "kind": "slider", "label": "resistance", "min": 100, "max": 10000, "step": 10, "default": 4700, "unit": "Ω", "format": "si" },
    { "id": "C", "kind": "slider", "label": "capacitance", "min": 1e-9, "max": 1e-5, "scale": "log", "default": 1e-7, "unit": "F", "format": "si" },
    { "id": "n", "kind": "number", "label": "order", "min": 1, "max": 8, "step": 1, "default": 1 },
    { "id": "ideal", "kind": "toggle", "label": "idealParts", "default": false },
    { "id": "shape", "kind": "choice", "label": "input", "options": [{ "value": 0, "label": "sine" }, { "value": 1, "label": "square" }], "default": 0 } ],
  "derived": [                                 // ≤ 48, in order: each may use consts, params and the derived values above it
    { "id": "tau", "expr": "R * C" }, { "id": "fc", "expr": "1 / (2 * pi * tau)" }, { "id": "err", "expr": "abs(fc - target) / target" } ],
  "readouts": [                                // ≤ 24 values shown under the controls
    { "label": "fcLabel", "expr": "fc", "unit": "Hz", "format": "si", "digits": 3 } ],
  "plots": [                                   // ≤ 6
    { "kind": "function", "title": "bodeTitle",
      "x": { "var": "f", "min": 10, "max": 1e6, "scale": "log", "label": "frequency", "unit": "Hz" },
      "y": { "min": -60, "max": 5, "label": "gain", "unit": "dB" },
      "points": 240,                           // 2–2000 (default 200)
      "series": [{ "expr": "-10 * log10(1 + (f / fc)^2)", "label": "gainLine" }],      // 1–6 lines
      "marks": [{ "axis": "x", "expr": "fc", "label": "fcMark" }, { "axis": "y", "expr": "-3" }] } ] }   // ≤ 8 guide lines
```

- **Names** (`id`, `x.var`): a letter or `_`, then letters, digits, `_` (≤ 32); unique in the spec; not `pi`, `e` or a reserved word.
- **Controls**: `slider` (a range with a number box beside it; `scale: "log"` for quantities over decades, then `min > 0`),
  `number` (a number box), `toggle` (true/false; counts as 1/0 in arithmetic), `choice` (2–12 options with number values).
  `min < max`, `min <= default <= max`, `step > 0` (optional). `unit` (≤ 16 characters) stays as written in every language.
- **Numbers on screen**: `format` `"si"` (prefixes p n µ m k M G T: 1.59 kHz, 470 µs), `"fixed"` (`digits` decimals), `"auto"`
  (default: `digits` significant digits, default 4); always in the learner's decimal mark. A boolean shows ✓ / ✗.
- **Expressions**: the language of `docs/INTERACTIVE_SIMEXPR.md` (numbers, `+ - * / % ^`, comparisons, `&& || !`, `c ? a : b`, the
  math functions; no loops, no strings, ≤ 2000 characters / 2000 nodes). A value that cannot be computed (a division by 0, `log` of
  a negative number) shows as — and leaves a gap in a plot; nothing breaks.
- **Plots**: `function` — `y = f(x)` for each line, over `x.min … x.max` (numbers or expressions such as `"5 * tau"`), linear or log;
  `y.min` / `y.max` optional (else from the data). `series` — the time series an engine computes: `x: {series: "<output>"}` and
  lines `{y: "<output>"}`. Axis labels are keys (`label`) plus a `unit`; lines get the theme's colours and dash patterns, a legend
  when they are labelled, and the plot an accessible description.
- Every key named in the spec (`title`, `intro`, `label` of controls, options, readouts, axes, lines, marks) must be in **every**
  string table. The whole spec is at most 64 KB.

### 12.2 In a chapter

The same `interactive` block and `sim` exercise as §4. A sim exercise on a sim-spec activity is graded by **checks**:

```json
{ "id": "ch01-e901", "type": "sim", "activity": "rc-lowpass", "difficulty": 2, "think": "apply", "…": "…",
  "q": "An RC low-pass filter has C = 100 nF. Choose R so that its cutoff frequency is within 5 % of 1 kHz.",
  "task": { "seed": "auto", "params": { "target": 1000, "tol": 0.05 } },
  "grade": { "mode": "checks", "checks": [
      { "expr": "err <= tol", "label": "checkFc", "weight": 3 },
      { "expr": "abs(C / 1e-7 - 1) < 0.001", "label": "checkC" } ], "pass": 1 },
  "hints": ["fc = 1/(2πRC): with C fixed, a larger R gives a lower fc.", "Solve the formula for R: R = 1/(2π · fc · C)."],
  "reveal": "R ≈ 1.6 kΩ: 1/(2π · 1.6 kΩ · 100 nF) ≈ 995 Hz, within 5 % of 1 kHz." }
```

### 12.3 State, events, attempts

The values of the controls are the state: an explorer's come back next time (`S.act`, `{values: {R: 1600, …}}`); Reset puts the
defaults back. Each committed change is an event `param {id, v}` (and `reset`) in the attempt's log (`S.att`). A sim exercise
always starts from the defaults (with its `task.params` in the consts).

### 12.4 Protocol and limits

The runtime speaks the same protocol with the core as every runtime (§8: `ready`, `pong`, `state`, `event`; `pause` / `resume`
/ `destroy`), so the live limit, the watchdog, pausing offscreen, the "Skip the activity" link and the fallbacks are the same.
The app checks the spec with the validators' rules before it shows anything: a spec that fails, or an engine this app does not
have, shows the activity's fallback (picture and text). Limits: params ≤ 24, consts ≤ 24, derived ≤ 48, outputs ≤ 24,
readouts ≤ 24, plots ≤ 6, lines per plot ≤ 6, marks ≤ 8, points ≤ 2000 (an engine's longer series are thinned to 2000),
checks ≤ 16, options 2–12, spec ≤ 64 KB.

### 12.5 The checks grader

`grade: {"mode": "checks", "checks": [{"expr", "label"?, "weight"?}], "pass"?}`. On **Check** the app evaluates each expression
on the current values (consts, params, derived, the engine's scalar outputs); a check is met when its value is true (or a number
other than 0). score = the weighted share of checks met (`weight` default 1) × 0.85 for each hint used (never below × 0.5);
passed = the share ≥ `pass` (default 1: every check). Before the learner changed anything Check does nothing (the defaults never
pass by accident). After Check the learner sees how many conditions are met and each labelled condition with ✓ / ✗ — so give each
check a `label` that names the condition, never the answer. Only runtimes that expose their values can use it (sim-spec@1).

### 12.6 Engines — `ACT.registerEngine`

`formula@1` (built in) has no model: the derived values are the model. Other engines (the circuit engine `circuit-mna@1`,
`docs/INTERACTIVE_CIRCUIT.md`; `thermal@1`, `pid@1`, `rf@1` and `twin@1`, `docs/INTERACTIVE_ENGINES.md`; `wasm@1`, which runs a pack's `wasm-module@1` item in a worker, `docs/INTERACTIVE_WASM.md` §2) are trusted app code,
registered with

```js
ACT.registerEngine({ id: 'name@1',
  check(spec) { return [/* problems with spec.model */]; },             // optional, after the common checks
  prepare(spec, compile) { return inputs => ({ ...inputs, $k: 1 }); },   // optional: turns the inputs into what the engine needs (main thread)
  create(spec, { seed, task, faults }) { return { run(inputs) { return { t: [...], v: [...], vEnd: 0.03 }; },
                                                   measure(inputs, probe) { return { kind: 'V', value: 1.5 }; } }; },   // measure: a bench only
  bench: true,                                                          // optional: the engine runs fault-finding benches (§12.7)
  workerSource: 'self.noemaEngine = { create(spec, opts) { … } };' });  // optional: then every run is in a Worker
```

A spec for such an engine names it (`"engine": "name@1"`), configures it in `model` (an object the engine checks) and declares what
it computes: `"outputs": [{"id": "t", "kind": "series"}, {"id": "vEnd", "kind": "scalar"}]`. `run(inputs)` gets the consts, params
and derived values; scalar outputs join the names of readouts, marks and checks, series feed `series` plots. Formulas run inline
(each evaluation is bounded); an engine whose runs can take longer than ~50 ms gives `workerSource`, and a run that takes more
than 5 s stops the activity (Restart). Runs are queued: only the latest inputs are computed (a slider dragged fast skips the
ones in between), measurements are answered in order, and the checks grader never reads the results of older inputs. `prepare`
lets an engine evaluate the spec's own expressions (with the app's NoemaExpr, `compile`) before the inputs go to the worker. The
validators know the same list of engines as the app (`ENGINES` of the content checks, `src/features/content/domain/activities/rules.ts`); `make_pack.py`
adds `engine:<id>` to `pack.requires`. `circuit-mna@1` validates `model` (the netlist with the engine's own `check()`, bindings to
real parts and properties, the transient's step budget), the outputs (nodes and parts of the netlist) and the bench.
`thermal@1`, `pid@1`, `rf@1` and `twin@1` validate `model` and the outputs with their own `checkSpec` (the engine library, which the
content checks call: one source for the app, the connector and the Python tools); the validators then check
every expression of the model (each binding's `expr`; for `thermal@1` and `pid@1` also the transient's `tEnd` / `dt` and every
output's `at`) as formulas over the spec's names (`docs/INTERACTIVE_ENGINES.md` §1).

### 12.7 Fault-finding benches — `spec.bench`

An engine with `bench: true` (`circuit-mna@1`, `twin@1`) can run a **bench**: a virtual device with one hidden fault. The app renders the
instruments (multimeter V / I / R, oscilloscope, logic analyser) with their leads on the declared probe points, a Measure button
(an optional budget), the **measurement log** (each reading also an event `measure`), the instrument's face (the meter's number,
the scope trace, the logic trace) and the diagnosis — a list of options in the string tables (event `diagnose`). The full format
is `docs/INTERACTIVE_CIRCUIT.md` §2 (the twin's points, its `log` and `rssi` instruments and its faults:
`docs/INTERACTIVE_ENGINES.md` §5.3); in short:

```json
"bench": { "faults": [{"id": "rOpen", "apply": [{"element": "R1", "kind": "open"}]}, …],
           "points": [{"id": "TP3", "at": "TP3", "label": "tp3"}, {"id": "LA", "at": "@D1.0", "label": "ledA"}, …],
           "instruments": [{"kind": "V"}, {"kind": "I", "parts": [{"element": "R1", "label": "iR1"}]}, {"kind": "scope", "tEnd": 0.02}],
           "budget": 8,
           "diagnosis": {"options": [{"label": "dxSupply"}, {"label": "dxROpen", "fault": "rOpen"}, …]} }
```

- The fault is picked by `task.params.fault` (an id, or a list the seed draws from) or drawn from all faults by the seed. It is
  **never in the page** before the diagnosis is checked: not in a label, the log, the saved state or the values; the verdict comes
  only after Check (an exercise) or "Check my diagnosis" (an explorer, which can also take "another device").
- A sim exercise grades a bench with the checks grader on three extra names, `diagnosis` (the option's index, −1 before one),
  `measurements` and `correct`; they cannot be used in readouts or marks, or declared by the spec. Check does nothing before a
  diagnosis is chosen. Example: `[{"expr": "correct", "label": "checkDx", "weight": 3}, {"expr": "measurements <= 6", "label": "checkEff"}]`, `pass` 0.75.
- Hints work as for every sim exercise (§4). An explorer's bench is its state (device, log, diagnosis); an exercise starts fresh.
- The validators check that every fault applies to the netlist (`checkFaults`), every point and part is in it, every instrument
  is known and complete, every fault is named by exactly one option, every label is in every string table, and `task.params.fault`
  names faults of the bench.

### 12.8 Parts — several engines in one spec (`spec.parts`, `spec.couple`)

A spec may combine engines: instead of `engine`, `model` and `outputs` it lists **parts**, each an engine with its own model and
outputs, and says how they are coupled. A spec without `parts` behaves exactly as before.

```json
"parts": [
  { "id": "pk",   "engine": "med@1", "model": { "items": [{ "id": "o", "fn": "pk.oral", "in": { "dose": "dose", "v": "v", "clear": "cl", "ka": "ka" } }] },
    "outputs": [{ "id": "cp", "kind": "series", "of": "o.c" }, { "id": "cmax", "kind": "scalar", "of": "o.cmax" }] },
  { "id": "site", "engine": "ode@1", "inputs": { "c": "cp" },
    "model": { "rhs": { "ce": "ke0 * (c - ce)" }, "states": [{ "id": "ce", "init": 0 }], "solve": { "tEnd": 24 } },
    "outputs": [{ "id": "ceS", "kind": "series", "of": "state", "var": "ce" }, { "id": "ceMax", "kind": "scalar", "of": "stat", "var": "ce", "stat": "max" }] }
],
"couple": { "cosim": { "tEnd": 24, "dt": 0.1, "parts": ["pk", "site"], "time": "tt" } }
```

- **A part** is `{id, engine, model, outputs, inputs?}` (at most 8 parts, 24 inputs a part, 48 outputs in all) or `{id, use, with?}`
  (below). Its model sees the spec's consts and params and **its own inputs**, nothing else: a derived value or another part's
  output reaches it only through `inputs`. An input is a number, a formula over the spec's names (consts, params, derived values,
  the scalar outputs of the parts before it), or `{"series": "<output id of another part>", "points"?: 2–2000 (resampled) | "stat"?:
  "final|min|max|mean|pp|rms" (a number)}`. The engine's own checks see the part as a spec of its own (its consts include the input
  names), and their messages name `spec.parts[i]`.
- **Output ids are names of the whole spec**: scalars join readouts, marks, checks, derived values (a derived value may use a
  part's scalar) and other parts' inputs; series feed plots; scenes and sounds feed `scene` / `sound` plots, whichever part drew them.
  Top-level `outputs` and `engine` are refused in a spec with parts.
- **The order** comes from the dependencies (a part after every name its inputs use; Kahn's order, ties in the spec's order), so
  `parts` may be listed in any order. A **cycle** that is not declared is an error naming it (`pk → eff → pk depend on each other
  in a cycle: declare it in spec.couple.loops (a fixed point) or spec.couple.cosim (in time)`).
- **`couple`** is `"chain"` (the default: each part runs once, in order) or `{loops?, cosim?}`:
  - `loops: [{parts, tol, maxIter? ≤ 50 (20), relax? (0, 1], init?: {output id: first guess}}]` (≤ 4): a **fixed point**. The parts
    run in their order, again and again (Gauss–Seidel; `relax` < 1 under-relaxes), until no scalar output of the loop changes by
    more than `tol` (relative: |Δ| / max(1, |x|)). Derived values inside the cycle are computed with it. If it does not settle in
    `maxIter` passes, its scalars become NaN (readouts show "—") and the view says so (`engine.act.sim.noConverge`).
  - `cosim: {tEnd, dt, parts, order?, t0?, time?, init?, iterate?: {tol, maxIter?}}` (≤ 5000 macro steps): the parts **evolve
    together in time**. Each must be an engine that can be stepped (`ode@1`, `med@1`, `clinic@1`, `genetics@1`, `des@1`, `field@1`,
    `agents@1`: the stepper of `docs/INTERACTIVE_LIBRARY.md` §1.6). Every macro step each part advances by `dt` with its inputs held,
    in `order` (a later part sees the values the earlier ones reached in the same step). An input of a co-simulated part may name
    any output of its partners: a series output gives its value at the step (one sample a step: that is how `cp` above becomes the
    ODE's input `c`). A part may stop early at a state event (the others meet it there); the events it reports go to the other
    parts. `iterate` repeats each macro step from the parts' snapshots until the exchanged scalars settle (strong coupling).
    `time` names a series of the macro step times (its x axis).
- **`use` / `with`**: a part may reuse a file of the pack, `activities/_parts/<name>.json` (`{engine, model, outputs, inputs?}`):
  `{"id": "pk", "use": "oral-pk", "with": {"model": {…}}}` (`with` is merged into it, objects deeply, lists replaced; any of
  `engine`, `model`, `outputs`, `inputs` given beside `use` replaces the file's). `make_pack.py` carries the files as
  `pack.activities.parts` (hashed with the pack), `unpack.py` writes them back, the validators resolve them, and every part's
  engine goes into `pack.requires`.
- **The bench** of a spec with parts is `spec.bench.part`: the id of a `circuit-mna@1` or `twin@1` part; its measurements use that
  part's latest inputs.
- **Runtime** (`partsRunner`, src/runtimes/sim-spec/parts.ts): every part has its own engine instance and Worker; the latest inputs win (a
  run under way stops at its next step); the whole graph has 5 s (else the activity stops: Restart). The checks grader reads the
  values once the latest inputs are computed, as for one engine.
- **Mini-apps**: `noema.sim(spec).run(inputs, {seed}?)` → `{outputs, values, codes}` runs `{consts?, derived?, parts, couple?}` with
  engines its registry entry lists (§8.1); `inputs` override the consts. Message `sim:run {spec, inputs?, seed?}`, answered by
  `engine:result`.

The validators (`checkSimSpec` of the content checks, `src/features/content/domain/activities/simspec.ts`) give one set of messages;
`tests/parts.js` checks them on `tests/fixtures/parts_cases.json`, the steppers, the orchestrator and the three references:
`pk-ode` (`med@1` + `ode@1` in time), `genetics-prob` (`genetics@1` → `prob@1`, a chain) and `ancient-voyage` (`map@1` →
`timeline@1`), each available as `activity_new.py --from <name>`.
