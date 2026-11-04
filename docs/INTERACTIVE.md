# Interactive activities — the contract (noema.activities/v1)

An **activity** is a small interactive program inside a pack: an explorer in the theory (move a slider, watch what changes)
or a graded **sim** exercise (reach a goal in the activity; the activity reports whether it was reached, or the app checks it).
The decisions and the spikes behind this page are in `docs/adr/001-interactive-activities.md`. How to write one well:
`docs/INTERACTIVE_AUTHORING.md`. The formulas of `sim-spec@1`: `docs/INTERACTIVE_SIMEXPR.md`.

Activities are optional. A chapter without them is complete; a chapter with them still needs every rule of
`tools/CONTENT_SPEC.md` (Q1–Q8). An activity never replaces the theory: the text explains the idea, the activity lets the
learner try it.

## 1. Runtimes (tiers)

| runtime | what it is | status |
|---|---|---|
| `html-app@1` (tier A) | one self-contained HTML file (inline scripts and styles, pictures as `data:` URIs) in a sandboxed frame | **available** |
| `sim-spec@1` (tier B) | a JSON spec (controls, formulas, readouts, plots) run by the app's own trusted engines — no code in the pack (§12) | **available** (formula@1; the circuit engine arrives with P3) |
| `py-module@1` (tier C) | Python (Pyodide + numpy, scipy; allow-listed extras through micropip) in a worker | later (P4); offline after the first use, never in the one-file bundle |
| `h5p@1` | an ordinary `.h5p` package (quiz, drag and drop, interactive video, branching…) played by the app's own H5P player in the same sandbox | later (P4b) |

`make_pack.py` refuses a runtime that this version of the app does not run yet.

## 2. Files in the subject folder

```
activities/
├── activities.json                 the registry (below)
└── <activity-id>/
    ├── app.html                    the bundle (html-app@1): everything inline, at most 512 KB (aim for <= 256 KB)
    ├── spec.json                   or the spec (sim-spec@1): data only, at most 64 KB (§12)
    ├── strings.en.json             the activity's words, one table per language: {"key": "text with {vars}"}
    ├── strings.el.json
    └── strings.ru.json             (every language the pack is read in: its own + each translation)
media/<still>.svg|png               the fallback picture (a normal pack picture in media/media.json)
```

`make_pack.py` puts each bundle **inline** in the pack (like the pictures), with its `sha256` and `bytes` (a spec as `spec`), and
the string tables under `strings`; it writes `pack.requires` (+ `engine:<id>` for an engine other than the built-in `formula@1`)
and `counts.activities`. `unpack.py` gives the folder back. `python3 activity_new.py <subject-dir> <id>` starts one from the
reference activity alias-lab; `--runtime sim-spec@1` from rc-lowpass (an RC low-pass filter).

## 3. The registry — `activities/activities.json`

```json
{ "format": "noema.activities/v1",
  "items": [{
    "id": "alias-lab",                       // a-z, 0-9 and -, 2–61 characters, unique in the pack
    "runtime": "html-app@1",                 // or "sim-spec@1" with "entry": "activities/<id>/spec.json"
    "entry": "activities/alias-lab/app.html",
    "stateVersion": 1,                       // raise it when the shape of the saved state changes (§6)
    "capabilities": ["state", "events", "resize", "result", "announce"],   // + "hints"
    "height": 360,                           // optional default height in px (a block can set its own)
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
- `hints` (at most 6): shown one by one under the activity; each one costs: the score × 0.85 per hint, never below × 0.5. A hint leads to the next good question, never to the answer.
- `reveal`: shown after a right answer, `explain` as for every exercise.
- Quality rules: `sim` is **opt-in** — it counts for a chapter only when `fits.types` of its map names it, and then at least
  one is needed (`tools/pack_rules.json` `optIn`, `fit.types.minPerKind`).

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
- Messages: at most 64 KB, each one checked; five bad messages stop the activity. A frame that navigates away is stopped.
- At most 2 activities run at once (1 on a phone); one that leaves the screen pauses, and the oldest is parked (Start).
- An activity that cannot run (unknown activity, runtime off or missing, bundle changed, error) shows its fallback picture
  and text. An exercise type the app does not know is hidden (it stays in the pack) instead of breaking the chapter.
- A pack whose `requires` names something this app lacks: the open tab reloads to a newer build when it comes back to the
  front; meanwhile the fallbacks show.

`make_pack.py`, `tools/build.py`, the connector (`noema_save_pack`, `noema_finish_upload`) and the app check the same rules
(`tools/activities.py`, `engine/packcheck.js` `checkActivities`; `tests/activities.js` keeps them equal).

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
`error {code, message}`. A message of a newer version stops the activity with "needs a newer version of the app".

## 9. Accessibility and phones

Every control reachable by keyboard and labelled (`aria-label` from the string table); a live text that says what changed
(and `noema.announce` for big changes); colours from the tokens (light and dark); `prefers-reduced-motion` respected; works
from 320 px wide with no horizontal scroll (docs/UI_MAP.md "Small screens"), touch targets >= 36 px. The app adds a
"skip the activity" link before each one and offers full screen.

## 10. Offline

`html-app@1` and `sim-spec@1` work offline (everything is inline; the engines are part of the app). `py-module@1` (later) needs the Pyodide files (and numpy, scipy) from the network the first
time; after that they are kept on the device (Settings can prepare them ahead), as are packages installed through micropip. It is
never available in the one-file bundle: its fallback shows there.

## 11. Before you deliver — checklist

1. `python3 activity_lint.py <subject-dir>` — no errors (and no warnings you cannot explain); for a sim-spec it checks every
   expression against the names the spec declares, every label key in every table, the limits.
2. `python3 activity_test.py <subject-dir>` — it loads, says hello, shows its words in every language, reports right and wrong
   results for the solutions and wrong attempts you listed, and no console errors.
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

`formula@1` (built in) has no model: the derived values are the model. Other engines (the circuit engine `circuit-mna@1` in P3)
are trusted app code, registered with

```js
ACT.registerEngine({ id: 'name@1',
  check(spec) { return [/* problems with spec.model */]; },             // optional, after the common checks
  create(spec, { seed, task }) { return { run(inputs) { return { t: [...], v: [...], vEnd: 0.03 }; } }; },
  workerSource: 'self.noemaEngine = { create(spec, opts) { … } };' });  // optional: then every run is in a Worker
```

A spec for such an engine names it (`"engine": "name@1"`), configures it in `model` (an object the engine checks) and declares what
it computes: `"outputs": [{"id": "t", "kind": "series"}, {"id": "vEnd", "kind": "scalar"}]`. `run(inputs)` gets the consts, params
and derived values; scalar outputs join the names of readouts, marks and checks, series feed `series` plots. Formulas run inline
(each evaluation is bounded); an engine whose runs can take longer than ~50 ms gives `workerSource`, and a run that takes more
than 5 s stops the activity (Restart). The validators know the same list of engines as the app (`ENGINES` in
`tools/activities.py` and `engine/packcheck.js`); `make_pack.py` adds `engine:<id>` to `pack.requires`.
