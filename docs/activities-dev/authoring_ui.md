# The activity author — a form generated from the schemas (P6)

ADR 001 D12: *an authoring UI generated from the same JSON Schemas as the validators.* An author picks a kind of activity, fills
a form, sees the activity run beside it and downloads the folder that `make_pack.py` takes.

## Files

| file | what |
|---|---|
| `tools/schemas/noema.sim-spec.v1.schema.json` | the shape of a `sim-spec@1` spec (formula@1, circuit-mna@1, the bench); `$ref`s `noema.circuit.v1` for the netlist |
| `tools/schemas/noema.activities.v1.schema.json` | the registry `activities/activities.json` and its entry (`$defs/item`) |
| `engine/schemaform.js` | `NoemaSchemaForm`: registry + `$ref`, `validate`, `skeleton`, branches, `walk` (no DOM, runs in Node) and `form()` |
| `engine/activity_author.js` | `NoemaActivityAuthor`: the page (`mount`, `view`), types, `check`, files, zip / unzip, import, the preview adapter |
| `engine/activity_author.css` | its styles (the app's tokens; light, dark; 320 px up) |
| `engine/activity_author_schemas.js` | GENERATED copy of the three schemas (a `file://` page cannot fetch): `tools/build.py` writes it |
| `i18n/engine/en.arb` (+ `drafts/<locale>.arb`) | its words, `engine.author.*`, with descriptions for translators, drafted in every UI locale |
| `tests/activity_author.js` | Node checks; `--browser <prepared repo>` the route in the built site (Chromium, Firefox, WebKit; run by `tests/run_e2e.sh`) |

## The schemas and the validators

The schema states the **shape** that `tools/activities.py check_spec` and `engine/packcheck.js checkSimSpec` enforce: fields
(`additionalProperties: false` exactly where the validators say "unknown field"), types, enums, limits, `kind` → its fields
(`oneOf` with a discriminator), `engine` → `model` / `outputs` / `bench` (`if` / `then` / `else`). What a schema cannot say stays
with the validators (names unique and not reserved, every formula over the declared names, min < max ≤ …, the netlist, the
tables). `tests/activity_author.js` runs the parity cases of `tests/activities.js` on both: the schema accepts every good spec,
never refuses what the validators accept, and refuses every structural case.

`x-noema` annotates a field for the UI: `expr` (a formula), `key` (a key of the string tables), `name`, `element` (a netlist part),
`series` (an engine series), `longtext`. A schema `title` is a **key** of the app's catalog: `engine.author.f.<title>`; a field
without a title (the netlist) is labelled `engine.author.p.<property>`; an option of a select `engine.author.f.<title>.<value>`
(`f.opt.<value>` without a title); help lines `engine.author.h.<title>`; schema messages `engine.author.v.<keyword>`.

## The form generator (`NoemaSchemaForm.form`)

JSON Schema 2020-12 subset: `$ref` (local and other schemas by `$id`), `allOf`, `oneOf` / `anyOf` (alternatives → a small select;
objects told apart by a const or a short enum → that property becomes the select, and switching keeps the common fields),
`not`, `if/then/else`, `type`, `const`, `enum` → select, `properties` / `required` (optional fields come from "Add a field…" and
have a remove button), `additionalProperties` as a schema → a map editor (`consts`), arrays → cards with add / move up /
move down / remove (`minItems` / `maxItems` respected), numbers with min / max (text box: `1e-9`, `4,7` accepted), patterns,
`default`. The document is plain JSON and only the edited paths change, so a spec read back is the spec given — fields the
schema does not know stay as they are (edited as JSON). Every input has its label, focus survives a re-render (by path),
validator messages land at their field (`setErrors([{path, msg}])`, with `aria-invalid` and `aria-describedby`).

## The page (`NoemaActivityAuthor`)

- **Kinds**: `sim-formula` (sim-spec@1 + formula@1), `sim-circuit` (+ circuit-mna@1); `registerType({id, label, runtime, schema,
  match, blank, convert})` for html-app@1, py-module@1, h5p@1 later (each with its schema and preview).
- **Tabs**: Activity (the registry entry: id → entry and fallback picture follow), Simulation, Words (every key × every
  language; add a language; unused keys). Under each key field: its text in each language.
- **Formulas**: `NoemaExpr.check` on every keystroke with the names that place may use (derived values above, a plot line's x).
- **Problems**: `check(doc)` = the validators' own messages (`checkSimSpec`, `checkActivities` — the words of `activity_lint.py`)
  + the schema's where they say nothing; at the field, as a count on each tab, and a list with "Show".
- **Preview**: the app's own `sim-spec@1` runtime through `ACT.mount` (always from the spec's defaults, debounced 400 ms; a
  version with problems leaves the last good preview, dimmed). Choose its language.
- **Files**: `activities/activities.json`, `activities/<id>/spec.json`, `activities/<id>/strings.<loc>.json` as a .zip (stored)
  or one by one; Import takes the same (.zip — stored or deflated — or JSON files). Nothing leaves the device.
- **Undo / redo**: buttons, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y (200 steps; typing is grouped per 400 ms).

## Where it lives: a route of the app, not a standalone page

The preview must be the *real* runtime, and `sim-spec@1` is part of `engine.js`, which only starts inside the app (the loader
sets the subject first). A separate `author.html` would need a second copy of the runtime or a stubbed loader. So the page is
a route, `#/author`; it works with any subject open (the activity is not added to it).

## Integration (done, P6 — docs/adr/001 §14)

1. **Loading**: `authorView` (`engine/src/40_views.js`) loads `schemaform.js`, `activity_author_schemas.js`, `activity_author.js` and
   `activity_author.css` from `NOEMA_ENGINE_BASE` on the first visit; `tools/build.py` copies them into the site and inlines them in
   the bundle (scripts after `packcheck.js`, the CSS in the bundle's style).
2. **Router**: `#/author` in the classic `route()` and in the shell (`ENGINE_ROUTES`), drawn with
   `shellChrome({ sub: true, crumbs: [[tE('engine.author.title')]] })`; leaving the route destroys the page (`NoemaActivityAuthor.current`).
   The way in: subject ⋮ › Create an activity (`engine.author.create`, line icon `wrench`, `engine.author.createSub` under it).
3. **Schemas**: `tools/build.py` writes `engine/activity_author_schemas.js` (`--author-schemas` prints it; the test compares).
4. **Words**: `engine.author.*` in `i18n/engine/en.arb` (descriptions) and `i18n/engine/drafts/<locale>.arb` for all 14 other UI
   locales; `engine.author.*` in `i18n/engine/dynamic_keys.txt`. A new schema field needs `engine.author.f.<title>` there, in
   every locale; `node tools/i18n/check.js` and `tests/activity_author.js` say what is missing.
5. **Tests**: `node tests/activity_author.js` (Node), `--browser "$T"` in `tests/run_e2e.sh`.
