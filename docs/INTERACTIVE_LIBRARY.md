# The engine library of `sim-spec@1` — general engines for every field

Decision of 2026-11-05 (ANR, thread "Build a reusable library of activity engines"): **the library is the canonical way** an
interactive activity computes. A pack's author first looks for a **general engine** of the library that fits the subject; when none
fits, the **free way** (a formula spec `formula@1`, a mini-app `html-app@1`, Python `py-module@1`) is always there; when a subject needs
an exact model the library does not have, anyone can **request a new engine** from a description (§3). The domain plugins of P3–P6
(`circuit-mna@1`, `thermal@1`, `pid@1`, `rf@1`, `twin@1`, `wasm@1`) stay as they are (`docs/INTERACTIVE_CIRCUIT.md`,
`docs/INTERACTIVE_ENGINES.md`, `docs/INTERACTIVE_WASM.md`). Every change is **additive**: no existing spec, message or engine changes.

| layer | engines | what for |
|---|---|---|
| library — mathematics | `formula@1`, `ode@1`, `prob@1`, `graph@1`, `geom@1` | any relation, dynamical system, distribution, network, construction |
| library — life sciences and medicine | `genetics@1`, `seq@1`, `med@1`, `anatomy@1` | heredity and populations, sequences, physiology, pharmacology and clinical reasoning, anatomy as data |
| library — humanities, arts and crafts | `timeline@1`, `music@1`, `map@1`, `text@1`, `craft@1` | chronology in every calendar, music theory and acoustics, maps and journeys, texts and verse, handcrafts |
| free | `html-app@1`, `py-module@1` | anything else, written by the pack's author |
| plugins | `circuit-mna@1`, `thermal@1`, `pid@1`, `rf@1`, `twin@1`, `wasm@1` | exact models of one field (benches with hidden faults) |

Each engine of the library has its own chapter in `docs/library/<name>.md` (the model, the outputs, the methods and their sources,
the limits and edge cases, the reference values its tests assert).

## 1. The contract of a library engine (for whoever builds or extends one)

### 1.1 Files

| file | what |
|---|---|
| `engine/src/46_lib_core.js` | `NoemaLibCore`: the model checker (a table walked with fixed codes and messages), `numx` numbers, seeded randomness, statistics, thinning, scenes, the adapter `makeEngine`, the Worker source |
| `engine/src/47_lib_<name>.js`, `48_lib_<name>.js` | one engine each: `window.NoemaLib<Name>` |
| `engine/src/49_lib_catalog.js` | `NoemaEngineCatalog`: every engine with its layer and search words; `suggest(text)`; registers the loaded library engines (`ACT.registerEngine`) |
| `tools/enginelib.py` | the Python twin of the core's checker (`walk`, `problems`, `check_outputs`) |
| `tools/lib_<name>.py` | the Python twin of one engine's checks: `ID`, `check_spec(spec)`, `exprs(spec)`, `keys(spec)` — the same codes, paths and messages |
| `docs/library/<name>.md` | the engine's chapter |
| `tests/lib_<name>.js` | its tests: reference values from the literature (with the source in the test's message), the edge cases, the codes, speed, the Worker source; and `tests/fixtures/enginelib/<name>.json` (good and bad specs) for the JS ↔ Python parity run by `tests/enginelib.js` |
| `tools/activities_examples/<example>/` | at least one reference activity per engine (spec.json, strings.en/el/ru/de/fr.json, the registry entry), started with `activity_new.py --from <example>` |

Nothing else needs to change to add an engine: `tools/build.py` finds `47–48_lib_*.js` and `tools/lib_*.py` by name (the shell, the
site, the one-file bundle, the connector and the skill load them beside `packcheck.js`); `index.html` lists them; `packcheck.js`
(`ACT.LIB`) and `tools/activities.py` (`LIB`) list the ids; the catalogue lists its search words (en, el, ru, de, fr) and the UI
catalogue its one-line description (`engine.engines.<slug>.what`, every UI locale).

### 1.2 The module (JS)

```js
(function noemaLibOdeModule(root) {            // a NAMED function: the Worker source is its toString()
  'use strict';
  const C = root.NoemaLibCore;
  function checkSpec(spec) { const { P, E, W } = C.problems(); C.walk(spec.model, TABLE, 'model', E, W); …; C.checkOutputs(spec, ID, ['scalar', 'series'], out, E, W); return P; }
  function exprs(spec) { return [['x0 * exp(-k*t)', 'model.eq.x', ['x', 't']], …]; }   // every expression of the model: [source, path, local names]
  function keys(spec) { return [['labelA', 'model.nodes[0].label'], …]; }               // every string key the model names
  function run(spec, env, { seed, prepared }) { return { out: { t: [...], x: [...], xEnd: 0.1, drawing: { view, items } } }; }
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  engine.workerSource = C.workerSource(noemaLibOdeModule, 'NoemaLibODE');
  root.NoemaLibODE = Object.freeze({ id: ID, checkSpec, exprs, keys, run, engine: Object.freeze(engine), simEngine, /* the engine's own functions, for tests */ });
})(typeof window !== 'undefined' ? window : globalThis);
```

- **Pure, bounded, deterministic.** No DOM, no network, no clock; seeded randomness only (`C.mulberry32(C.hash32(name, seed))`);
  every loop bounded (≤ 200 000 steps or the engine's own limit, said in its chapter); ≤ 2000 points per series (`C.thin`), ≤ 2000
  items per scene. A run that cannot be computed returns NaN scalars, empty series and codes; it never throws into the page.
- **No words for learners.** An engine returns numbers, codes, keys of the activity's string tables (`key`) and, only for the content
  the model itself carries (a verse, a sequence, a name of the pack's own language), short raw texts (`s`, ≤ 64 characters).
- **Expressions.** Any number of the model may be `numx`: a number or a formula over the spec's names (consts, params, derived) and
  the engine's local names. The engine compiles them once (`C.cx`, the app's `NoemaExpr`, which the Worker gets too); `exprs(spec)`
  lists them so the validators check each one against exactly those names.
- **Outputs.** `outputs: [{id, kind, of, …}]` with `kind` `scalar` (a number: readouts, marks, checks), `series` (an array: a
  `series` plot), `scene` (a drawing: a `scene` plot) or `sound` (notes: a `sound` plot). `of` names what the engine computes; the
  engine's `checkSpec` refuses an `of` it does not compute. `run` returns `{out: {<output id>: value}}`.
- **External code.** A robust, free (MIT, BSD, Apache-2.0, ISC, public domain) library may be vendored when it is clearly better than
  hand-written code: pinned version, licence file beside it in `engine/vendor/<name>/`, no network, it must run in the Worker (the
  engine adds its source to `workerSource`), and its size is said in the engine's chapter.
- **Science.** Every model, method and constant names its source (paper, standard, guideline, with the year) in the engine's chapter
  and in a comment beside the code; validity ranges are checked and reported as codes (never a silent wrong number); the tests assert
  published reference values.

### 1.3 The Python twin

`tools/lib_<name>.py` does not simulate: `check_spec(spec)` returns the same problems as the JS `checkSpec` (code, path, message,
level) on every spec of `tests/fixtures/enginelib/<name>.json`, `exprs(spec)` and `keys(spec)` the same lists. It uses
`tools/enginelib.py` (`walk`, `problems`, `check_outputs`). `tools/activities.py check_lib` and `engine/packcheck.js checkLib` then
check every expression and key with the spec's names: the messages a pack's author sees are the same in the skill
(`activity_lint.py`, `make_pack.py`), the connector and the app.

### 1.4 What the app draws: `scene` and `sound` plots, line styles

```json
"plots": [ { "kind": "scene", "of": "drawing", "title": "graphTitle", "height": 320 },
           { "kind": "sound", "of": "chord", "title": "listen" },
           { "kind": "series", "x": { "series": "x" }, "y": {}, "series": [ { "y": "pmf", "style": "bars", "label": "pmfLine" } ] } ]
```

- **scene** `{view: [x0, x1, y0, y1], items: [...]}`, drawn to the same scale on both axes with y upwards: `pt {x, y, r?, c?, key?, v?, s?}`,
  `seg {x1, y1, x2, y2, c?, arrow?, w?, dash?, key?, v?, s?}`, `circ {x, y, r, c?, fill?, dash?}`, `poly {pts: [x, y, …], c?, fill?,
  closed?, dash?}`, `txt {x, y, key? | v? | s?, c?, anchor?}`. `c` is a **role** (`base`, `muted`, `hi`, `ok`, `bad`, `warn`, `info`),
  never a colour: the theme colours it (light, dark, every character). The label of an item is the key's text in the learner's
  language (`key`), a number in the learner's format (`v`) or the model's own short text (`s`).
- **sound** `{notes: [{f Hz, t s, d s, g 0–1}], wave?: sine | triangle | square | sawtooth, partials?: [amplitudes]}` is played with
  WebAudio after the learner presses ▶ (never by itself); ≤ 512 notes, ≤ 60 s.
- **line styles** on any line of a `function` or `series` plot: `style` `line` (default), `bars`, `steps`, `points`.
- Only library engines may declare `scene` and `sound` outputs and plots; for every other engine the validators keep their old
  messages word for word.

## 2. The catalogue (`NoemaEngineCatalog`)

`CATALOG` lists every engine and runtime with its `layer` (`library`, `free`, `plugin`), its window global and file, the slug of its
UI words (`engine.engines.<slug>.name` / `.what`) and search words in the five pack languages. `suggest(text)` ranks the catalogue
for a description (accents folded, rough stems): the request dialog and the connector show what may already do it before a new
engine is asked for.

## 3. Requesting a new engine

Being built (this thread): the page `#/engines` (the catalogue, "Request a new engine", the learner's requests and their status),
the table `noema_engine_requests` (`cloud/supabase.sql` §16), and the connector tools `noema_request_engine`,
`noema_engine_requests`, `noema_engine_request_update`.
