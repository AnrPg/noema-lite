# Writing an interactive activity — the playbook

The contract is `docs/INTERACTIVE.md`; this page is how to make one that teaches. The reference activities are
`tools/activities_examples/alias-lab/` (html-app@1, sampling and aliasing) and `tools/activities_examples/rc-lowpass/`
(sim-spec@1, an RC low-pass filter): each an explorer in the theory and a graded sim exercise. For circuits (`circuit-mna@1`,
`docs/INTERACTIVE_CIRCUIT.md`): `rc-transient` (a capacitor charging from a square wave, R and C on sliders, a scope trace) and
`led-bench` (a fault-finding bench: an LED that stays dark). For heat, control loops, radio links and IoT nodes
(`docs/INTERACTIVE_ENGINES.md`): `heatsink` (`thermal@1`), `pid-tune` (`pid@1`), `lora-link` (`rf@1`) and `sensor-node`
(`twin@1`).

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

Two more, rarely: **wasm-module@1** when the model needs a real program (an emulator, a long iterative solver) — the page is
still a sim-spec, only the computing is a WebAssembly module (`docs/INTERACTIVE_WASM.md`, start with `activity_new.py --from
wasm-oscillator`); **external-embed@1** for a well-known outside simulation (PhET, GeoGebra, Desmos) in a theory block — explore
only, needs the network, off unless the site switches it on, mind the licences (`docs/INTERACTIVE_EMBED.md`). Write the theory
so that it stands without either.

## Steps

1. **Pick the learnable** (map/chNN.json): what the learner should see happen, and the misconception the activity breaks.
2. **Start from the reference**: `python3 activity_new.py <subject-dir> <id> --runtime sim-spec@1` copies rc-lowpass (spec.json,
   strings, tests.json, the registry entry, a fallback picture); change the params, the formulas (`derived`), the readouts and the
   plots, and give every label a key in every string table. A good spec: few controls (2–4), the quantity the learner should
   watch as a readout, one plot that shows the relation, marks on the values that matter (the cutoff, the target).
   `--from rc-transient` starts from a circuit (a netlist, sliders bound to its parts, a scope plot); `--from led-bench` from a
   fault-finding bench (below); `--from heatsink`, `pid-tune`, `lora-link` or `sensor-node` from the heat, control-loop, radio and
   IoT-twin engines (`docs/INTERACTIVE_ENGINES.md`; tests.json then starts from two of the reference's own cases). Without `--runtime`, `activity_new.py` copies alias-lab (app.html, strings in en/el/ru, the registry entry, a fallback
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

## The authoring page (`#/author`): a sim-spec@1 activity with a form

For a sim-spec@1 activity there is also a page in the app: open any subject, then **⋮ › Create an activity** (a line icon, next
to Edit; the route is `#/author`, the crumbs end with “Activity author”). It is a form generated from the same JSON Schemas the
validators enforce (`tools/schemas/noema.sim-spec.v1.schema.json`, `noema.activities.v1.schema.json`; ADR 001 D12), with the
activity running beside it in the app's own `sim-spec@1` runtime — the preview is exactly what a learner will see.

* **Kind**: a simulation with formulas (`formula@1`) or a circuit simulation (`circuit-mna@1`, with its netlist, bindings and an
  optional fault-finding bench). Switching keeps the fields both have.
* **Tabs**: *Activity* (the registry entry: id, fallback picture and text, licence), *Simulation* (controls, constants, computed
  values, readouts, plots; the model and bench of a circuit), *Words* (every key × every language; add a language). Under every key
  field its text in each language; every formula is checked as you type, with the names that place may use.
* **Problems** are the validators' own messages (`checkSimSpec`, `checkActivities`, the words of `activity_lint.py`), at their
  field, as a count on each tab and in a list with *Show*. While there are problems the preview keeps the last good version.
* **Files**: *Download .zip* gives `activities/activities.json`, `activities/<id>/spec.json` and `activities/<id>/strings.<loc>.json`
  — the folder `make_pack.py` takes (add the fallback picture to `media/`); *Import* reads the same back (.zip or JSON files).
  Nothing leaves the device, and the activity is not added to the subject that is open. Undo / redo: buttons, Ctrl/Cmd+Z,
  Ctrl/Cmd+Shift+Z.
* Then go on with step 3 above (the theory block, the sim exercise and its `checks`) and run the checks of step 7 on the folder.

The page's words are ordinary engine strings (`engine.author.*` in `i18n/engine/en.arb`, drafted in every UI locale); a field's
label is `engine.author.f.<schema title>` (`p.<property>` for the netlist), so a new schema field needs its label key there.
How it is built: `docs/activities-dev/authoring_ui.md`.

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

For a **bench**, `task` picks the hidden fault (`{"fault": "rOpen"}`, over the exercise's own `task.params`), `{"measure":
{"instrument": "V", "a": "TP3", "b": "GND"}}` (or `{"instrument": "I", "part": 0}`) takes a measurement, `{"diagnose": 2}` picks
an option (from 0); `readings` checks the numbers in the log (`[[i, lo, hi]]`, the i-th measurement from 0), `log` how many there
are, `values` the bench's `diagnosis`, `measurements`, `correct`:

```json
{ "name": "open resistor: 0 V at TP3", "exercise": "ch01-e903", "task": { "fault": "rOpen" },
  "steps": [{ "measure": { "instrument": "V", "a": "TP3", "b": "GND" } }, { "diagnose": 2 }],
  "expect": { "passed": true, "log": 1, "readings": [[0, -0.05, 0.05]] } }
```

## Which engine for which learning goal

Pick the engine by what the learner should come to understand, not by the topic's name. The engine only has to compute the
quantities the idea is about; everything else (a picture of the device, the story) belongs in the text.

| the learner should… | engine | a typical activity |
|---|---|---|
| see how quantities depend on each other through formulas you can write down (a law, a closed-form answer, a trade-off curve) | `formula@1` (no `model`) | a lens equation, a sampling rate against aliasing, the cost of a design against one parameter |
| read and design circuits: voltages, currents, an RC or RL transient, a filter's response, a switching stage | `circuit-mna@1` | an RC charging from a square wave; a divider loaded by a sensor |
| reason from measurements to a fault on a board | `circuit-mna@1` with a `bench` | an LED that stays dark: open resistor, reversed LED or a broken track? |
| understand heat flow: thermal resistance chains, the steady temperature, time constants, a duty-cycled load, a thermostat's hysteresis | `thermal@1` | size a heatsink so the junction stays under its limit; a heater with a thermostat |
| tune or compare controllers: what P, I and D each do, overshoot against speed, steady-state error, windup, dead time, noise | `pid@1` | tune a PID to a step-response spec; switch anti-windup on and off on a saturated actuator |
| plan a radio link: the link budget, path loss against distance, spreading factor against airtime and range, the Fresnel zone | `rf@1` | pick SF and antenna for a margin at a distance within an airtime limit |
| design a battery-powered node's duty cycle: average current, battery life, what each wake costs, delivery over a marginal link | `twin@1` | choose the wake period for a year of battery and enough readings a day |
| find a fault in a deployed device from its battery, current, radio and event log | `twin@1` with a `bench` | a node whose battery dies in weeks: an antenna off, an aged cell, a wrong wake period? |

Rules of thumb. If the answer is one formula, use `formula@1`: an engine adds nothing but a run. If the idea is a process over
time (a transient, a loop settling, a battery draining), use the engine that integrates it and show the series. When two engines
could do it (a heater as a `thermal@1` network or a `pid@1` `thermal` plant), choose the one whose controls are what the learner
should change: the network's resistances and capacities, or the controller's gains. Keep one engine per activity; a system that
spans two (a node whose radio link is the question) uses the engine of the question (`rf@1`) and states the rest as constants.

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

A `twin@1` bench follows the same rules with a device instead of a board (`docs/INTERACTIVE_ENGINES.md` §5.3): its points are the
battery (`vbat`, `vload`), the supply current (`i`) and `gnd`; its instruments the voltmeter, the average current, a scope on
the current, the event log and the RSSI. Give each fault one instrument that shows it (the RSSI for a detached antenna, the
average current for a wrong wake period, the voltage under load for an aged cell, the log for a brown-out level set too high).
A faulty sensor (`sensor-stuck`, `sensor-drift`) has no instrument on the bench: keep it out of a bench's faults.

## Importing H5P quizzes — `h5p_import.py`

When the sources include ready-made **H5P packages** (`.h5p` files from H5P.org, Moodle, Lumi, a teacher's course), import them
into the pack's **own exercise types** instead of retyping them. This is not the `h5p@1` runtime (which plays a package as H5P):
the importer writes ordinary `mcq`, `tf`, `cloze`, `bucket`, `match`, `order`, `spotbug`, `img_drag`, `img_reveal` exercises and
flashcards that the app grades, drills and schedules like any other.

```
python3 h5p_import.py a.h5p b.h5p … --out <subject-dir> --chapter ch07 [--title "…"] [--src <source id>] [--summary-order] [--report report.json]
python3 validate.py <subject-dir>/chapters/ch07.json
```

* It writes `chapters/<chapter>.json` (one section per package), the pictures to `media/` and their entries to
  `media/media.json` (an id already there is kept). It prints ✓ / ✗ per package and notes; exit 2 when nothing was imported.
* What maps to what: MultiChoice → `mcq` (`img_reveal` with its picture), TrueFalse → `tf`, Blanks → `cloze`, DragText → `cloze`
  with a bank (or `bucket`), MarkTheWords → `spotbug`, DragQuestion → `img_drag` / `match` / `bucket` / `mcq`, SingleChoiceSet
  and Summary → `mcq`, QuestionSet and Column → their questions, Dialogcards → flashcards. Anything else is reported as
  unsupported, never guessed. The package's title, author and licence go to each exercise's `cite` and the section's first line.
* **Nothing of the package runs:** only `h5p.json`, `content/content.json` and the PNG / JPG / WebP pictures it names are read
  (no SVG, no URLs, no libraries).

**Every quality rule still applies after the import** (`CONTENT_SPEC.md`, Q1–Q8). The importer gives you a draft, not a chapter:

1. Put the imported exercises into the chapter they belong to (or keep the imported chapter and give it a knowledge map
   `map/chNN.json`, Q1): they count toward the chapter's quotas like any exercise of the sources (every one kept, Q3).
2. **Self-contained** (Q2): an H5P question that leaned on a video, audio or an outside picture lost it (see the notes) —
   rewrite it so that it stands alone; no "the video", "above", "slide 3".
3. **Explanations:** the importer fills `explain` from the H5P feedback or with the right answer; write the *why* (and each
   wrong option's `why` for an mcq), as for every exercise.
4. **Test the idea** (Q5): H5P quizzes are often recall of one lesson's example; rewrite those into questions about the idea,
   adjust `think`, `difficulty`, `tags`.
5. Write the theory around them (an import has no `lr` and no theory beyond the section's first line), then the blind solve and
   review (`review/chNN.json`) as for every chapter. A chapter left as a raw import is checked as `authoring.by: "import"`,
   which gives quality *warnings* only — never deliver it that way.

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
- A bench: a probe point or option label that gives the fault away ("TP4 (broken track)"); two faults no instrument can tell
  apart (then they are one option, or the bench needs another point); a fault without an option (the validators refuse it); a
  budget so tight that a careful learner runs out.
