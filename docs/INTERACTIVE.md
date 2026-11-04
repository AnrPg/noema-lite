# Interactive activities — the contract (noema.activities/v1)

An **activity** is a small interactive program inside a pack: an explorer in the theory (move a slider, watch what changes)
or a graded **sim** exercise (reach a goal in the activity; the activity reports whether it was reached). The decisions and the
spikes behind this page are in `docs/adr/001-interactive-activities.md`. How to write one well: `docs/INTERACTIVE_AUTHORING.md`.

Activities are optional. A chapter without them is complete; a chapter with them still needs every rule of
`tools/CONTENT_SPEC.md` (Q1–Q8). An activity never replaces the theory: the text explains the idea, the activity lets the
learner try it.

## 1. Runtimes (tiers)

| runtime | what it is | status |
|---|---|---|
| `html-app@1` (tier A) | one self-contained HTML file (inline scripts and styles, pictures as `data:` URIs) in a sandboxed frame | **available** |
| `sim-spec@1` (tier B) | a JSON spec run by the app's own trusted engines (circuits, signals…) in a worker | later (P2) |
| `py-module@1` (tier C) | Python (Pyodide + numpy, scipy; allow-listed extras through micropip) in a worker | later (P4); offline after the first use, never in the one-file bundle |
| `h5p@1` | an ordinary `.h5p` package (quiz, drag and drop, interactive video, branching…) played by the app's own H5P player in the same sandbox | later (P4b) |

`make_pack.py` refuses a runtime that this version of the app does not run yet.

## 2. Files in the subject folder

```
activities/
├── activities.json                 the registry (below)
└── <activity-id>/
    ├── app.html                    the bundle (html-app@1): everything inline, at most 512 KB (aim for <= 256 KB)
    ├── strings.en.json             the activity's words, one table per language: {"key": "text with {vars}"}
    ├── strings.el.json
    └── strings.ru.json             (every language the pack is read in: its own + each translation)
media/<still>.svg|png               the fallback picture (a normal pack picture in media/media.json)
```

`make_pack.py` puts each bundle **inline** in the pack (like the pictures), with its `sha256` and `bytes`, and the string tables
under `strings`; it writes `pack.requires` and `counts.activities`. `unpack.py` gives the folder back byte for byte.
`python3 activity_new.py <subject-dir> <id>` starts one from the reference activity.

## 3. The registry — `activities/activities.json`

```json
{ "format": "noema.activities/v1",
  "items": [{
    "id": "alias-lab",                       // a-z, 0-9 and -, 2–61 characters, unique in the pack
    "runtime": "html-app@1",
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
- `grade.mode`: `"reported"` — the activity calls `noema.result({score, passed})`; **Check** grades with the last result
  (nothing reported yet → Check does nothing). `"checks"` (rules the app evaluates itself) arrives with `sim-spec@1`.
- `hints` (at most 6): shown one by one under the activity; each one costs: the score × 0.85 per hint, never below × 0.5. A hint leads to the next good question, never to the answer.
- `reveal`: shown after a right answer, `explain` as for every exercise.
- Quality rules: `sim` is **opt-in** — it counts for a chapter only when `fits.types` of its map names it, and then at least
  one is needed (`tools/pack_rules.json` `optIn`, `fit.types.minPerKind`).

## 5. Words and languages

An activity shows **no words of its own**: every label, message and goal comes from its string tables through
`noema.t(key, {vars})` (`{name}` placeholders). The app picks the table of the language the pack is shown in, then the pack's
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

`html-app@1` works offline (everything is inline). `py-module@1` (later) needs the Pyodide files (and numpy, scipy) from the network the first
time; after that they are kept on the device (Settings can prepare them ahead), as are packages installed through micropip. It is
never available in the one-file bundle: its fallback shows there.

## 11. Before you deliver — checklist

1. `python3 activity_lint.py <subject-dir>` — no errors (and no warnings you cannot explain).
2. `python3 activity_test.py <subject-dir>` — it loads, says hello, shows its words in every language, reports right and wrong
   results for the solutions and wrong attempts you listed, and no console errors.
3. `python3 activity_preview.py <subject-dir> <id>` — look at the screenshots (light, dark, 360 px, fallback).
4. The block is explained after it; the sim exercise's `q` is complete; hints lead to the idea, not the answer.
5. `make_pack.py` — the pack builds.
