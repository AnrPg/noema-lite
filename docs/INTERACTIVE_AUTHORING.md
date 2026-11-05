# Writing an interactive activity — the playbook

The contract is `docs/INTERACTIVE.md`; this page is how to make one that teaches. The reference activities are
`tools/activities_examples/alias-lab/` (html-app@1, sampling and aliasing) and `tools/activities_examples/rc-lowpass/`
(sim-spec@1, an RC low-pass filter): each an explorer in the theory and a graded sim exercise. For circuits (`circuit-mna@1`,
`docs/INTERACTIVE_CIRCUIT.md`): `rc-transient` (a capacitor charging from a square wave, R and C on sliders, a scope trace) and
`led-bench` (a fault-finding bench: an LED that stays dark). For Python (`py-module@1`, `docs/INTERACTIVE_PYTHON.md`): `py-filter`
(two digital low-pass filters computed with numpy). For an H5P package (`h5p@1`, `docs/INTERACTIVE_H5P.md`):
`planets-quiz` (an H5P multiple choice, in English, Greek and Russian).

## When an activity earns its place

Make one only when **trying** teaches something that reading and pictures cannot: a relation between quantities
(move one, watch another), a process over time, a system with feedback, a search for a setting that works, a fault to find
by probing. Not for: a fact, a definition, a static diagram (use a figure), a quiz (use the exercise types). One or two
well-made activities per chapter at most; most chapters need none.

## sim-spec@1 or html-app@1?

**Start with sim-spec@1** whenever the idea is "these quantities depend on each other": sliders, number boxes, switches and
choices; values computed by formulas; readouts; curves `y = f(x)` and (with an engine) time series. It is data, not code: the
app draws it in its own style, in light and dark, on a phone, with keyboard and screen reader, and grades a sim exercise itself
(`checks`); nothing can freeze or misbehave, and the validators check every formula. Take **html-app@1** only for what a spec
cannot express: something to drag or draw on, a custom picture that changes (a wave on a string, a ray diagram), a game with its
own rules, a step-by-step animation. A graded html-app reports its own result (`noema.result`), so its grading is your code.

| | sim-spec@1 | html-app@1 |
|---|---|---|
| what you write | `spec.json`: controls, formulas, readouts, plots | one HTML file with scripts |
| look, dark mode, phones, accessibility | the app's own, automatically | yours to get right (tokens, 360 px, labels) |
| grading of a sim exercise | `checks`: rules the app evaluates on the values | `reported`: the activity calls `noema.result` |
| the checks before delivery | every expression and key checked by `activity_lint.py` | lint for banned code + the browser test |
| limits | 24 controls, 6 plots, 2000 points; formulas only | 512 KB; anything the sandbox allows |

## When Python (py-module@1)?

Only when the numbers need **real numerical work** that the expression language cannot do in a few lines: a frequency response from
filter coefficients, an FFT of a signal, a linear system or eigenvalues, an ODE that needs a proper solver, an optimiser, a statistical
test, a random experiment repeated thousands of times. The learner still sees the app's own controls, readouts and plots (a sim-spec
`spec.json`); `main.py` only computes them in `step(inputs, state)`, and a sim exercise is graded by `checks` on Python's outputs
exactly like a sim-spec.

It has a price, so weigh it:

* **17 MB the first time** (Python + numpy), **37 MB with scipy**; a few seconds to start every time (8–10 s with scipy). A
  learner on a phone with mobile data is asked first. After that it works offline.
* **Only on the website**: never in the one-file app or a copy opened from disk — the fallback picture and text show there, so they
  must teach the same idea.
* Extra packages beyond numpy and scipy come only from the reviewed allow-list (`tools/pywheels_allow.json`) and need
  `"requiresNetwork": true`.

Keep **every step fast** (aim for < 50 ms; the budget is 3 s, then the learner sees Restart): compute what does not change at the top
of `main.py`, vectorise with numpy, a few hundred points per curve. Use scipy only when numpy really cannot do the job (it costs
20 MB and 3–5 s per start). If a formula can say it, use sim-spec@1.

## When to use H5P (`h5p@1`)

Use an **H5P package** when the activity already exists as one, or is best made in an H5P editor (h5p.org, Lumi, Moodle,
WordPress…): a drag and drop onto a picture, fill in the blanks, mark the words, drag the words into a text, dialog cards, a set of
single-choice questions, a summary to build. The `.h5p` file goes into the pack unchanged; the app plays it with its own H5P player
in the activity sandbox, offline, and records the score H5P reports. It needs no code and no string tables of yours. Do not use it
for what the exercise types already do (a plain multiple choice or a cloze is better as an exercise: it joins the Mistakes gym,
drills and reviews); use it when the package's own interaction is the point, or when a teacher's existing H5P item should come
along with the course.

**Which content types.** Tested (played and scored in Chromium, Firefox and WebKit): `H5P.MultiChoice`, `H5P.TrueFalse`,
`H5P.DragQuestion` (drag and drop), `H5P.Blanks` (fill in the blanks), `H5P.DragText`, `H5P.MarkTheWords`, `H5P.SingleChoiceSet`,
`H5P.Summary`, `H5P.Dialogcards`. Allowed with a warning (not yet tested): `H5P.QuestionSet`, `H5P.InteractiveVideo` (the video
must be inside the package: a YouTube or other outside link is refused), `H5P.BranchingScenario`, `H5P.CoursePresentation`.
Refused: anything that loads from the network (`H5P.MathDisplay`, `H5P.IFrameEmbed`, `H5P.Twitter`, `H5P.GoogleMap`, …), any outside
link in the content, files H5P itself would refuse (`.php`, `.html`, `.exe`). `python3 h5p_check.py item.h5p` says exactly what is
wrong with a package. Content-type libraries come inside the package with their own licences (normally MIT); give the content's own
licence in `activity.json`.

**Steps.** `python3 activity_new.py <subject-dir> <id> --runtime h5p@1 --from item.h5p` copies your package to
`activities/<id>/item.h5p`, checks it, and writes `activity.json`, a fallback picture to replace, and `tests.json`. (Without
`--from` it copies planets-quiz.) Then:

1. **Translations through `h5pByLocale`.** H5P keeps every word of an item in its `content.json` — the question, the answers, the
   feedback and the button labels (`UI` / `l10n` fields). Unzip `content/content.json` from the package, translate every text
   value (keep the keys, the structure, the HTML tags and the media paths unchanged), and save it as
   `activities/<id>/content.<locale>.json`: one for each language the pack is read in other than the package's own. The
   validators refuse a missing one and one for a language the pack does not have. `l10n.<locale>.json` (optional) translates
   H5P's own core strings ("Close", confirm dialogs). Only when a language needs other pictures or a recording, give a whole other
   package instead (`h5pByLocale.<locale> = {h5p, sha256}` in `activity.json`).
2. **The theory block** `{"t": "interactive", "activity": "<id>"}` or **the sim exercise** with `"grade": "reported"`: the score H5P reports
   when the learner presses its Check button is the answer (passed when H5P says so, or at a score of at least half). The `q`
   still states the task fully (Q1), and is explained after the block as for every activity.
3. **The fallback**, as for every activity: a still picture and a text that teaches the same idea.
4. **Check**: `activity_lint.py` runs the package rules on the file and each translation; `activity_test.py` plays the item in
   every language (`tests.json`: `{"click": ".h5p-answer:nth-child(1)"}`, then `{"click": ".h5p-question-check-answer"}`,
   `expect.passed`; `"locale": "el"` with `expect.text` to see a translation); `activity_preview.py` shows it.
5. **Delivery**: `make_pack.py` keeps `item.h5p` **beside** the pack (in the `.noema.zip`); through the connector,
   `noema_finish_upload` asks for it with one curl command per file and checks it before it accepts the pack.

## Steps

1. **Pick the learnable** (map/chNN.json): what the learner should see happen, and the misconception the activity breaks.
2. **Start from the reference**: `python3 activity_new.py <subject-dir> <id> --runtime sim-spec@1` copies rc-lowpass (spec.json,
   strings, tests.json, the registry entry, a fallback picture); change the params, the formulas (`derived`), the readouts and the
   plots, and give every label a key in every string table. A good spec: few controls (2–4), the quantity the learner should
   watch as a readout, one plot that shows the relation, marks on the values that matter (the cutoff, the target).
   `--from rc-transient` starts from a circuit (a netlist, sliders bound to its parts, a scope plot); `--from led-bench` from a
   fault-finding bench (below). Without `--runtime`, `activity_new.py` copies alias-lab (app.html, strings in en/el/ru, the registry entry, a fallback
   picture) under the new id. Change it; keep its structure:
   - every word in `strings.<locale>.json`, shown with `noema.t(key)`;
   - wait for `noema.ready`, then read `noema.task`, `noema.state`, `noema.exercise`;
   - colours from `--noema-*` tokens; redraw on `noema.on('theme', …)`;
   - `noema.saveState(…)` on every change worth keeping; `noema.event(…)` for what the learner did;
   - graded: `noema.result({score, passed, detail})` **only after the learner did something** (else Check would grade
     the untouched start), and again on each change.
3. **The theory block** goes right after the text that explains the idea, and is itself explained right after it (Q7b):
   what is on screen, how to read it, what to try first, what to notice.
4. **The sim exercise**: `q` states the goal fully (self-contained, Q1), `task.params` set the case, `hints` go from the idea
   to the method (never the answer), `reveal` says why the right setting works, `explain` covers the tempting wrong one.
   On a sim-spec: `grade: {"mode": "checks", "checks": [...]}` — one check per condition of the goal (the target reached, and
   whatever must stay as given: "C is still 100 nF"), each with a `label` the learner sees after Check (✓ / ✗); start the
   defaults away from the goal; the tolerance in a const (`tol`) so the task can set it.
   Add `"sim"` to the chapter map's `fits.types` (it is opt-in).
5. **The fallback**: a still picture of the most telling state plus a text (>= 40 characters) that teaches the same idea in
   words; a learner who never sees the activity still learns it.
6. **Translate** the string tables into every language the pack is read in (its own + en, el, ru), naturally, as for the
   chapters; units and symbols stay.
7. **Check** (docs/INTERACTIVE.md §11): `activity_lint.py`, `activity_test.py` (with solutions and wrong attempts),
   `activity_preview.py`, then `make_pack.py`.

## activity_test.py cases — `activities/<id>/tests.json`

```json
{ "cases": [
  { "name": "right rate",  "exercise": "ch01-e900", "steps": [{ "set": "#fs", "value": "10" }], "expect": { "passed": true } },
  { "name": "too slow",    "exercise": "ch01-e900", "steps": [{ "set": "#fs", "value": "5" }],  "expect": { "passed": false } },
  { "name": "explorer",    "steps": [{ "set": "#fs", "value": "10" }], "expect": { "text": { "#out": "3 Hz" } } }
] }
```
`steps`: `{"set": selector, "value": …}` (an input gets the value and an `input` event), `{"click": selector}`,
`{"wait": ms}`. `expect`: `passed` (the last reported result), `text` (selector → a part of its text), `state` (keys of the
saved state).

For a sim-spec activity `set` names a **param** (`{"set": "R", "value": 1600}`), `passed` is the exercise's checks grader on the
values after the steps, `values` checks computed values (`{"fc": [950, 1050]}`: a range, or an exact number), `state` the keys of
the saved values:

```json
{ "cases": [
  { "name": "the right R", "exercise": "ch01-e901", "steps": [{ "set": "R", "value": 1600 }], "expect": { "passed": true, "values": { "fc": [950, 1050] } } },
  { "name": "the right fc with another C", "exercise": "ch01-e901", "steps": [{ "set": "C", "value": 1e-6 }, { "set": "R", "value": 160 }], "expect": { "passed": false } }
] }
```

For a **py-module@1** activity the cases are the same as for a sim-spec (`set` names a param, `values` are Python's scalar
outputs): `{"name": "N = 8 removes the tone", "exercise": "ch01-e904", "steps": [{"set": "N", "value": 8}], "expect": {"passed": true,
"values": {"att1k": [-130, -60]}}}`. They run when the Python files are there (`NOEMA_PYODIDE_SITE=<site with vendor/pyodide/>`);
otherwise `activity_test.py` skips them.

For a **bench**, `task` picks the hidden fault (`{"fault": "rOpen"}`, over the exercise's own `task.params`), `{"measure":
{"instrument": "V", "a": "TP3", "b": "GND"}}` (or `{"instrument": "I", "part": 0}`) takes a measurement, `{"diagnose": 2}` picks
an option (from 0); `readings` checks the numbers in the log (`[[i, lo, hi]]`, the i-th measurement from 0), `log` how many there
are, `values` the bench's `diagnosis`, `measurements`, `correct`:

```json
{ "name": "open resistor: 0 V at TP3", "exercise": "ch01-e903", "task": { "fault": "rOpen" },
  "steps": [{ "measure": { "instrument": "V", "a": "TP3", "b": "GND" } }, { "diagnose": 2 }],
  "expect": { "passed": true, "log": 1, "readings": [[0, -0.05, 0.05]] } }
```

## A good fault-finding bench

A bench teaches **reasoning from measurements**: each reading should rule something out. Write it like a good practical:

1. **One board, one symptom.** A small, real circuit the chapter explains (a supply, a switch, a resistor, an LED; a transistor
   stage; an RC timer), and a symptom in the intro ("the LED stays dark"). Six to twelve parts; more is noise, not difficulty.
2. **Faults that look alike from the outside but read differently inside.** Pick 3–6 faults with the same symptom, each with a
   measurement that tells it apart: an open resistor (0 V after it), a resistor far too high (the right voltages, a tenth of the
   current), a broken track (both legs of the next part at 0 V), a part in backwards (the voltage on the wrong leg). Check with
   the engine that the readings really differ (`activity_test.py` cases with `readings`) — and say in a case which faults a given
   reading cannot tell apart (an ohmmeter on an open and on a reversed LED both read OL one way).
3. **Probe points where a technician would put the leads**: labelled test points (`{"name": "TP3", "probe": "a"}` in the netlist)
   and the legs of the suspicious parts (`@D1.0`). Name them for what they are ("TP3 (resistor–LED junction)", "LED anode leg"),
   never for what is wrong there.
4. **Instruments that fit the question.** A voltmeter is the workhorse; an ammeter on one or two parts; an ohmmeter when "the
   part is open" must be confirmed (it reads unpowered and in circuit); a scope or logic analyser only when the signal changes in
   time (a PWM, a clock, an RC timer).
5. **Tempting wrong options.** Every fault has its option; add one or two that the symptom suggests but the readings exclude ("the
   supply is dead" when TP1 reads 5 V; "the switch does not make contact"). The option labels describe the fault, never the
   reading that proves it.
6. **A budget that rewards thinking**, not luck: about twice the measurements an expert needs (an expert needs 3–4 here, the
   budget is 8), and a check on efficiency that is generous (`measurements <= 6`) and weighs less than the diagnosis
   (`weight: 3` on `correct`, `pass: 0.75`): a right diagnosis found the long way still passes.
7. **Noise** (`model.noise: {"rel": 0.005}`) makes the readings look like a real meter's (1.76 V, not 1.7600000 V); it is
   seeded, so tests and a learner's device stay reproducible. Keep it small: it must never blur the difference between faults.
8. **The exercise**: `task.params.fault` fixes the fault (one id: everyone gets the same case, as in a worked example) or lists
   some (the seed draws one per attempt); the `q` gives the circuit and the symptom in words (Q1); `hints` give the method
   ("measure from the supply towards the LED: each voltage to GND clears or blames the part before it"), never the fault;
   `reveal` names the fault and the reading that proves it; `explain` says why the tempting option is wrong.
9. **The explorer**: the same bench as a theory block lets the learner practise; "Check my diagnosis" reveals the fault,
   "Another device" draws a new one. Explain it after the block: what to measure first, how to read a 0 V and a 5 V.
10. **The fallback text** is the diagnosis method in words (where to measure, what each reading means), with the still schematic.

## Pitfalls

- A busy loop (`while (!done) {}`) or a long synchronous computation: stopped after 1.5 s. Split the work with
  `requestAnimationFrame` / `setTimeout`, or keep it small.
- `onclick="…"` and other inline handlers do not run (scripts only by hash): use `addEventListener`.
- Anything from the network (scripts, fonts, pictures, `fetch`): blocked. Inline it (`data:` URIs), keep it under 256 KB.
- `localStorage`, cookies: not available. Use `noema.saveState`.
- Text in the HTML: the learner reading Greek sees English. Every word through the tables.
- A result that is right by accident (the start state already meets the goal): start the task away from the goal.
- Too small on a phone: test at 360 px; controls >= 36 px; no horizontal scroll.
- sim-spec: a formula that uses a value defined below it (`derived` are computed in order), a label key missing in one
  language, a check whose label gives the answer away ("R is 1.6 kΩ"): `activity_lint.py` catches the first two; the third is yours.
- H5P: a package that needs the network (a YouTube video, MathDisplay, an embedded page) is refused; a translation that changed
  a key or a media path breaks the item in that language (test it with a `"locale"` case); sounds that a library asks for by URL
  (SingleChoiceSet's sound effects) stay silent.
- A bench: a probe point or option label that gives the fault away ("TP4 (broken track)"); two faults no instrument can tell
  apart (then they are one option, or the bench needs another point); a fault without an option (the validators refuse it); a
  budget so tight that a careful learner runs out.
