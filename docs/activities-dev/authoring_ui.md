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
| `engine/activity_author_i18n.js` | its words in en, el, ru, fr (`engine.author.*`) with descriptions for translators |
| `engine/activity_author_schemas.js` | GENERATED copy of the three schemas (a `file://` page cannot fetch): `node tests/activity_author.js --write-schemas` |
| `tests/activity_author.js` | Node checks; `--browser` the page in the real app (Chromium, Firefox, WebKit) |

## The schemas and the validators

The schema states the **shape** that `tools/activities.py check_spec` and `engine/packcheck.js checkSimSpec` enforce: fields
(`additionalProperties: false` exactly where the validators say "unknown field"), types, enums, limits, `kind` → its fields
(`oneOf` with a discriminator), `engine` → `model` / `outputs` / `bench` (`if` / `then` / `else`). What a schema cannot say stays
with the validators (names unique and not reserved, every formula over the declared names, min < max ≤ …, the netlist, the
tables). `tests/activity_author.js` runs the parity cases of `tests/activities.js` on both: the schema accepts every good spec,
never refuses what the validators accept, and refuses every structural case.

`x-noema` annotates a field for the UI: `expr` (a formula), `key` (a key of the string tables), `name`, `element` (a netlist part),
`series` (an engine series), `longtext`. A schema `title` is a **key** of the label table: `engine.author.f.<title>`; a field
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
a route, `#/author`, mounted by the integrator; it works with any subject open (the activity is not added to it).

## Integration (for the integrator)

1. `index.html` (and the site / bundle builders in `tools/build.py`): after `engine/packcheck.js` load
   `engine/schemaform.js`, `engine/activity_author_i18n.js`, `engine/activity_author_schemas.js`, `engine/activity_author.js`
   (or lazily on first use of the route), and `engine/activity_author.css`.
2. The router (`engine/src/40_views.js` `route()`, and the shell's): `#/author` →
   `shellChrome({ sub: true, crumbs: [[tE('engine.author.title')]] }); NoemaActivityAuthor.view($('main'));`
   A way in: an item in Me → (authoring) or the subject menu, label `engine.author.title`, a line icon.
3. `tools/build.py`: write `engine/activity_author_schemas.js` from `tools/schemas/` (or keep the test's `--write-schemas`).
4. Words: move every key of `engine/activity_author_i18n.js` into `i18n/engine/en.arb` as `engine.author.<key>` (descriptions:
   `desc`, and "Label of a form field of the activity author" for `f.*` / `p.*`, "Help line under a field" for `h.*`,
   "Problem shown under a field" for `v.*`); el, ru, fr into `i18n/engine/drafts/<loc>.arb`; drafts for the other UI locales.
   The table stays as the fallback. `tools/i18n/audit.js` finds no hard-coded text in the new files.
5. Run `node tests/activity_author.js --browser` with the other browser tests.
