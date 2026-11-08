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
| library — life sciences and medicine | `genetics@1`, `seq@1`, `med@1`, `clinic@1`, `anatomy@1` | heredity and populations, sequences, physiology and pharmacology, clinical reasoning (virtual patients, differential diagnosis, decisions), anatomy as data |
| library — humanities, arts and crafts | `timeline@1`, `music@1`, `map@1`, `text@1`, `craft@1` | chronology in every calendar, music theory and acoustics, maps and journeys, texts and verse, handcrafts |
| free | `html-app@1`, `py-module@1` | anything else, written by the pack's author |
| plugins | `circuit-mna@1`, `thermal@1`, `pid@1`, `rf@1`, `twin@1`, `wasm@1` | exact models of one field (benches with hidden faults) |

Each engine of the library has its own chapter in `docs/library/<name>.md` (the model, the outputs, the methods and their sources,
the limits and edge cases, the reference values its tests assert).

## 1. The contract of a library engine (for whoever builds or extends one)

### 1.1 Files

| file | what |
|---|---|
| `src/engines/kernel/core.js` | `NoemaLibCore`: the model checker (a table walked with fixed codes and messages), `numx` numbers, seeded randomness, statistics, thinning, scenes, the adapter `makeEngine` |
| `src/engines/<name>/<name>.js` | one engine each: an ES module whose default export is the engine's API |
| `src/engines/plugins.ts` | one line per engine: its manifest (`engine:<id>`), how to load its module and its Worker bundle |
| `src/engines/library.ts` | the engine library on `NoemaCore.engines`: `ids()`, `load(ids)`, `loaded(id)`, `engine(id)`, `catalog`, `expr`, `schema()` |
| `src/engines/kernel/schema.js` | `NoemaLibSchema`: turns an engine's `table` into the JSON Schema of its activities, from which the activity author (`#/author`) builds the form (§1.5) |
| `src/engines/catalog.js` | `NoemaCore.engines.catalog`: every engine with its layer and search words; `suggest(text)` |
| `docs/library/<name>.md` | the engine's chapter |
| `tests/lib_<name>.js` | its tests: reference values from the literature (with the source in the test's message), the edge cases, the codes, speed, the Worker source; and `tests/fixtures/enginelib/<name>.json` (good and bad specs), whose checks `tests/enginelib.js` holds to the golden outputs of the former Python twins (`tests/fixtures/parity/enginelib.json`; a new engine's checks are recorded there with `NOEMA_GOLDEN_UPDATE=1`, tests/golden.cjs) |
| `tools/activities_examples/<example>/` | at least one reference activity per engine (spec.json, strings.en/el/ru/de/fr.json, the registry entry), started with `activity_new.py --from <example>` |

To add an engine: its module, its line in `src/engines/plugins.ts` and in `src/engines/node.ts` (`tools/esbuild.mjs` bundles
them into `build/app.js`, the app's `NoemaCore.engines` in the site and the one-file bundle, into `build/harness.js`, the skill's
activity host, and into the connector, `src/composition/connector.ts`); the content checks
(`LIB` in `src/features/content/domain/activities/rules.ts`; the app's activity core reads it as `ACT.LIB`) list the ids; the catalogue lists its search words (en, el, ru, de, fr) and the UI
catalogue its one-line description (`engine.engines.<slug>.what`, every UI locale).

### 1.2 The module (JS)

```js
import NoemaLibCore from '../kernel/core.js';     // the kernel pieces it needs, imported (the Worker bundle carries them too)
  const C = NoemaLibCore;
  function checkSpec(spec) { const { P, E, W } = C.problems(); C.walk(spec.model, TABLE, 'model', E, W); …; C.checkOutputs(spec, ID, ['scalar', 'series'], out, E, W); return P; }
  function exprs(spec) { return [['x0 * exp(-k*t)', 'model.eq.x', ['x', 't']], …]; }   // every expression of the model: [source, path, local names]
  function keys(spec) { return [['labelA', 'model.nodes[0].label'], …]; }               // every string key the model names
  function run(spec, env, { seed, prepared }) { return { out: { t: [...], x: [...], xEnd: 0.1, drawing: { view, items } } }; }
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  const API = Object.freeze({ id: ID, checkSpec, exprs, keys, run, engine: Object.freeze(engine), simEngine,
    table: { model: TABLE, outputs: { scalar: SCALARS, series: SERIES, scene: SCENES } },   // the form of the activity author (§1.5)
    /* the engine's own functions, for tests */ });
  export default API;            // the library adds the Worker bundle (engine.workerSource) when it loads the module
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

### 1.3 The checks

The module's `checkSpec(spec)` gives the problems (code, path, message, level), `exprs(spec)` and `keys(spec)` the lists of
the model's expressions and string keys; `checkLib` of the content checks (`src/features/content/domain/activities/simspec.ts`)
then checks every expression and key with the spec's names: the messages a pack's author sees are the same in the skill
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

### 1.5 The form of the activity author: `table`

The activity author (`#/author`, a subject's ⋮ › *Create an activity*) offers every library engine the app has, grouped like the
catalogue. It builds the engine's form from one more export of the module, `table`, turned into a JSON Schema by
`src/engines/kernel/schema.js` (`NoemaCore.engines.schema().specSchema(id, table, simSchema)`); an engine without `table` is simply not offered.

```js
table: {
  model:   TABLE,                                      // the very table checkSpec walks (C.walk), or {$by: 'mode', $cases: {<mode>: TABLE}}
  outputs: { scalar: [...], series: [...], scene: [...], sound: [...] },   // what `of` may name, by output kind (or {$by: 'mode', $cases: {<mode>: {...}}})
  fields:  { node: 'id', stat: 'enum:mean|sd', … },    // optional: the other fields of an output, with walk kinds
  offered: model => ({ scalar: [...], … }),            // optional: when what `of` may name depends on the model
}
```

- **One line, no new rule.** `table` only exposes what the engine already checks; `checkSpec` stays the judge (the form shows its
  codes and messages at the field), and the schema is looser than `checkSpec`, never stricter: every spec `checkSpec` accepts must
  pass the schema (`tests/activity_author.js` checks the reference activity and every good fixture of each engine).
- **Kinds.** The walk kinds map to schema types (`pos` → number > 0, `int:a:b` → integer, `enum:a|b` → enum, `numx` → number or
  formula, `expr` → formula, `id`/`ref`/`name`/`key` → the spec's ids, names and string keys, `$list`/`$map`/`$obj`/`$req` as in
  the walk); an unknown kind becomes a non-empty text and `any` anything, so a new kind never breaks the form.
- **Labels.** A field's label is `engine.author.f.lib.<field>` (`i18n/engine/en.arb`, a description for translators, drafts in every
  UI locale); a symbol (one or two letters, a name with a digit or a capital, a Greek letter) is its own label. A new word field
  needs its key, or `tests/activity_author.js` says which one is missing.
- **Parts.** The same tables give the forms of the parts of a spec with several engines (`schema().partsSchema`, the
  author's kind *Several engines*): nothing more to export.
- **The reference activity.** The author offers *Start from the reference activity* (the engine's `tools/activities_examples/<example>/`,
  shipped in `engine/activity_author_schemas.js` as `NoemaActivityRefs`) or *Blank*.

### 1.6 The stepper: an engine in time (parts, `docs/INTERACTIVE.md` §12.8)

An engine whose model evolves in time can be **co-simulated** with others: it gives `makeEngine` an optional `stepper`
(src/engines/kernel/core.js), the same signature as `NoemaSimKit.stepper` / `cosim` (src/engines/kernel/simkit.js):

```js
const stepper = {
  init(model, inputs, ctx) { return state; },                    // null: this model cannot be stepped
  step(state, inputs, t, dt, ctx) { return { state, out: { outputId: value }, dt /* taken ≤ dt: an early stop */, events: [{ t, kind, data, to? }], fail: 'code'? }; },
  snapshot(state) { return copy; }, restore(copy) { return state; },   // optional: default a deep copy of plain data; null = cannot be iterated
  output(state, ctx) { return out; },                            // optional: the outputs at the start
  onEvent(state, ev, t) { return state; },                       // optional: an event of another part
};
const { engine, simEngine } = C.makeEngine({ id, checkSpec, run, prepare, stepper });   // engine.stepper = true; simEngine.stepper = the def
```

- `ctx = {spec, seed, prepared, id, t0, rand}` (`rand`: a seeded stream of this part). `inputs` are the part's numbers (consts,
  params, its inputs), held over the step. `out` maps the spec's output ids to a number (a scalar now; a **series** output collects
  one sample per step), an array (kept whole), a scene or a sound; only declared outputs pass (`pickStep`).
- The instance gets `stepInit(inputs, t0) → {out}`, `stepTo(inputs, t, dt, inbox) → {out, dt, events, fail?}` (the inbox's events
  go to `onEvent` first), `snapshot() → slot` (−1: cannot; one slot, a new snapshot replaces it) and `restore(slot) → true/false`.
  The Worker answers the messages `sinit`, `step`, `snap` and `restore` (35_activity_sim.js `engineRunner(...).step(kind, …)`).
  Without `stepper` nothing changes: `run` is as before (a part's series inputs arrive as `opts.series`).
- Steppers now: `ode@1` (a flow or a map: events and crossings inside the step, `final` / `stat` running), `med@1` (the
  pharmacokinetic compartments, RK4 split at the doses; other items run as before), `clinic@1` (the virtual patient, the same
  physiology as `run()`: stepped to the end it gives `run()`'s scalars bit for bit; the other sections from `run()` on the current
  inputs), `genetics@1` (Wright–Fisher drift with its own seeded stream; other modes recompute), and `des@1`, `field@1`,
  `agents@1` (their own, through `NoemaSimKit.stepper`); and the plugins `thermal@1`, `pid@1`, `twin@1` (no snapshot) and the
  `circuit-mna@1` transient (no snapshot; its own grid a divisor of the first macro step, a step off the grid reported at the
  asked time by interpolation, a changed binding taken into the running transient with its capacitor and inductor state, its
  time counted from the part's t0): their instances answer `stepInit` / `stepTo` / `snapshot` / `restore` themselves
  (docs/INTERACTIVE_ENGINES.md, docs/INTERACTIVE_CIRCUIT.md). The validators list them (`STEPPERS` in
  `src/features/content/domain/activities/rules.ts`): add an engine there when it gains a stepper. Pure, bounded, never throws.

## 2. The catalogue (`NoemaCore.engines.catalog`)

`CATALOG` lists every engine and runtime with its `layer` (`library`, `free`, `plugin`), its window global and file, the slug of its
UI words (`engine.engines.<slug>.name` / `.what`) and search words in the five pack languages. `suggest(text)` ranks the catalogue
for a description (accents folded, rough stems): the request dialog and the connector show what may already do it before a new
engine is asked for.

## 3. Requesting a new engine

When neither the library nor the free way fits, anyone asks for a new engine from a description. The feature is a small hexagon:

| layer | where | what |
|---|---|---|
| domain | `engine/enginereq.js` (`NoemaEngineRequests`; no DOM, no network; the connector runs the same file) | `FIELDS` and their limits, `normalize(input) → {row, problems}`, `ACCURACY` (`teaching`, `quantitative`, `research`), `STATUSES` (`new`, `seen`, `planned`, `building`, `available`, `declined`, `duplicate`; `OPEN` = the first four), `cleanPatch(patch)` (what an admin may change), `brief(row)` (the English markdown to build the engine from) |
| port | `store = {kind, submit(row), mine(), all(status), update(id, patch), isAdmin()}` | |
| adapters | `cloudStore` (Supabase REST, table `noema_engine_requests`, `cloud/supabase.sql` §16) · `localStore` (a profile without a cloud account: `localStorage noema1:<profile>:enginereq`, at most 100, downloadable as JSON) | `store(ACCOUNT)` picks one |
| UI | `engine/src/49_lib_view.js` + `49_lib_view.css`, the route `#/engines` (`#/engines/new` opens the form), the subject's ⋮ › *Engines of activities* | the catalogue (only the engines this app has), *Request a new engine*, *Your requests*; admins see every request and answer it in place |
| connector | `src/connector/tools/request_engine.ts`, `engine_requests.ts`, `engine_request_update.ts` | `noema_request_engine` (with `check_only` it only ranks the catalogue), `noema_engine_requests` (own; admins all, with a status filter; `id` → the brief), `noema_engine_request_update` (admins) |

The form asks for one thing first, **what should be simulated** (40–4000 characters) and a name (4–120); the field, what the learner
changes and sees, what is measured, the accuracy, sources and example exercises are folded under *More details*. While the person
writes, `NoemaCore.engines.catalog.suggest` shows up to three engines of this app that may already do it; the ids it found are stored with the
request (`suggested`) so whoever answers checks them first.

The table's trigger owns everything that is not the person's words: on insert the requester, their shown name, `status = new` and the
time; at most **20 requests a person a day**; on update only `status`, `engine_id`, `answer` and `fixed_in` change, and only for the
app's admins (`noema_admins`). RLS: everyone inserts their own; reads their own (admins all); admins update and delete.

**Answering a request** (an admin, or Claude with an admin account): `noema_engine_requests` → read the brief → first decide whether an
engine of the library can be **extended** (additively, same id); build per §1; then `noema_engine_request_update` with `status
available`, `engine_id` and `fixed_in` (the PR). `declined` and `duplicate` always carry an `answer` saying why or which engine.
The requester sees the status, the engine and the note on `#/engines`.

## 4. Using engines from a mini-app

A mini-app (`html-app@1`: a game, a puzzle, a custom picture) uses the engines of the library as a toolset instead of re-implementing
the science (decision 2026-11-05, ANR): it lists them in its registry entry, `"engines": ["graph@1"]`, and calls
`await noema.engine('graph@1').run({model, outputs}, inputs, {seed})` → `{outputs}` (`docs/INTERACTIVE.md` §8.1 has the API, the
error codes and the protocol). The model and the outputs are written exactly as in a sim-spec@1 spec (the engine's chapter), so
everything in `docs/library/<name>.md` holds; the outputs come back as data (numbers, arrays, scenes, sounds) for the mini-app to show
in its own way.

| | where | what |
|---|---|---|
| the API | `engine/src/34_activity_html.js` (the bootstrap) | `noema.engines()`, `noema.engine(id).check(spec)`, `.run(spec, inputs, {seed})` |
| the host | `34_activity_html.js` `engineBridge` | declared ∩ `NoemaCore.engines.catalog.LIBRARY` ∩ registered; every field checked; the engine's `check`; one run at a time + one waiting; ≤ 30 requests/s; outputs ≤ 512 KB; codes, never a crash |
| the Worker | `35_activity_sim.js` `ACT.engineRunner` (the sim runner; `respec` gives the same Worker another model) | one per mini-app and engine, lazy, reused, 5 s per run, ended on unmount |
| the rules | `checkAppEngines` of the content checks (`src/features/content/domain/activities/registry.ts`); `needRequires` adds `engine:<id>` | |
| the tests | `tests/activities.js` (the rules and their golden messages, the protocol, the bridge with a fake runner), `tests/activities_app.js` (in the app), `activity_test.py` | |
| the reference | `tools/activities_examples/cheapest-route/` | a route game on `graph@1`: the learner picks roads, Dijkstra finds the cheapest route; keyboard, 320 px, five languages |

Only library engines: pure, bounded, deterministic, with no hidden state (no fault bench, no learner data); the frame keeps its
policy (no Worker, no network) — the Worker lives in the app. A new library engine needs nothing more to be usable from mini-apps.
