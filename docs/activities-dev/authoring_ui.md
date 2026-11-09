# The activity author — a form generated from the schemas (P6)

ADR 001 D12: *an authoring UI generated from the same JSON Schemas as the validators.* An author picks a kind of activity, fills
a form, sees the activity run beside it and downloads the folder that `make_pack.py` takes.

## Files

| file | what |
|---|---|
| `src/contracts/schemas/noema.sim-spec.v1.schema.json` | the shape of a `sim-spec@1` spec (formula@1, circuit-mna@1, the bench); `$ref`s `noema.circuit.v1` for the netlist |
| `src/contracts/schemas/noema.activities.v1.schema.json` | the registry `activities/activities.json` and its entry (`$defs/item`) |
| `src/engines/kernel/schema.ts` | `NoemaCore.engines.schema()` (loaded with `loadSchema()`): a library engine's `table` → the schema of its activities (`specSchema`), what an output may compute (`ofs`), the line styles (docs/INTERACTIVE_LIBRARY.md §1.5) |
| `src/features/author/domain/` | pure TS: the JSON Schema core (`schema.ts`: registry + `$ref`, `validate`, `skeleton`, branches, `walk`, paths), the form's view of a document and its edits (`form.ts`: `formTree`, `applyIntent`), the activity document (`activity.ts`: names, files) and the .zip (`zip.ts`); unit tests beside them |
| `src/features/author/application/` | `createAuthoring(deps)`: the kinds (`registerType`), the registry with every library engine's schema, `check`, the formula feedback, the `AuthorService` the screens use (`src/ports/authoring.ts`); its deps (`ports.ts`) are the engine library, the content checks, the words |
| `src/ui/screens/author/` | Lit on the kit: `noema-schema-form` (a form from a JSON Schema: `form`, `value`, `decorate`; `setErrors`; emits `noema-change`) and `noema-author` (the page: bar, tabs, words, preview, files); `styles.ts` (the app's tokens; light, dark; 320 px up; RTL) |
| `src/composition/author.ts` | the lazy piece `build/author.js` (`tools/esbuild.mjs`): wires the application to the page (`NoemaCore`, the I18n port, `ACT` for the preview) and hands over `__noemaAuthorPiece` |
| `src/composition/shell/author-page.ts` | `#/author` as a page of the frame (`NoemaShell.registerPage`) and `Noema.app.author` for the classic router; loads the piece and what it needs on the first visit |
| `engine/activity_author_schemas.js` | GENERATED copy of the three schemas (a `file://` page cannot fetch): `tools/build.py` writes it |
| `i18n/engine/en.arb` (+ `drafts/<locale>.arb`) | its words, `engine.author.*`, with descriptions for translators, drafted in every UI locale |
| `tests/activity_author.js` | Node checks (through `build/noema-tools.cjs`: `schemaForm`, `authoring`); `--browser <prepared repo>` the route in the built site (Chromium, Firefox, WebKit; run by `tests/run_e2e.sh`) |

## The schemas and the validators

The schema states the **shape** that `checkSimSpec` of the content checks (`src/features/content/domain/activities/simspec.ts`) enforces: fields
(`additionalProperties: false` exactly where the validators say "unknown field"), types, enums, limits, `kind` → its fields
(`oneOf` with a discriminator), `engine` → `model` / `outputs` / `bench` (`if` / `then` / `else`). What a schema cannot say stays
with the validators (names unique and not reserved, every formula over the declared names, min < max ≤ …, the netlist, the
tables). `tests/activity_author.js` runs the parity cases of `tests/activities.js` on both: the schema accepts every good spec,
never refuses what the validators accept, and refuses every structural case.

`x-noema` annotates a field for the UI: `expr` (a formula), `key` (a key of the string tables), `name`, `element` (a netlist part),
`series` (an engine series), `longtext`. A schema `title` is a **key** of the app's catalog: `engine.author.f.<title>`; a field
without a title (the netlist) is labelled `engine.author.p.<property>`; an option of a select `engine.author.f.<title>.<value>`
(`f.opt.<value>` without a title); help lines `engine.author.h.<title>`; schema messages `engine.author.v.<keyword>`.

## The form generator (`formTree` / `applyIntent`, drawn by `noema-schema-form`)

JSON Schema 2020-12 subset: `$ref` (local and other schemas by `$id`), `allOf`, `oneOf` / `anyOf` (alternatives → a small select;
objects told apart by a const or a short enum → that property becomes the select, and switching keeps the common fields),
`not`, `if/then/else`, `type`, `const`, `enum` → select, `properties` / `required` (optional fields come from "Add a field…" and
have a remove button), `additionalProperties` as a schema → a map editor (`consts`), arrays → cards with add / move up /
move down / remove (`minItems` / `maxItems` respected), numbers with min / max (text box: `1e-9`, `4,7` accepted), patterns,
`default`. The document is plain JSON and only the edited paths change, so a spec read back is the spec given — fields the
schema does not know stay as they are (edited as JSON). Every input has its label, focus survives a re-render (by path),
validator messages land at their field (`setErrors([{path, msg}])`, with `aria-invalid` and `aria-describedby`).

## The page (`noema-author`)

- **Library engines**: `lib:<engine id>` for every library engine the app has (registered through `ACT.engine`) whose module
  exports `checkSpec` and `table`; the kind select groups them like the catalogue (`ENGINE_GROUPS`), with the engine's
  `engine.engines.<slug>.name` and its `.what` in an ⓘ. Choosing one asks *Start from the reference activity* (`NoemaActivityRefs`
  in `activity_author_schemas.js`, when the build ships it) or *Blank*. The form comes from `schema().specSchema`:
  outputs of kind `scalar`, `series`, `scene`, `sound`, their `of` with suggestions from the table (`ofs`), plots `function`,
  `series` (lines with `style`), `scene` and `sound`; the engine's `checkSpec` messages land at their fields, formulas are
  checked live only where `exprs(spec)` lists them, with the engine's local names.
- **Several engines (parts)**: the kind `sim-parts` builds a spec with `parts` and `couple` (docs/INTERACTIVE.md §12.8). Its schema
  is `schema().partsSchema(engines, sim)`: each part is one of the library engines the app has (an engine select, then that
  engine's model and outputs form from its table), a `circuit-mna@1` part, or a part file (`use` / `with`); its `inputs` are numbers,
  formulas or `{series, points | stat}`; `couple` is `chain` or loops / a co-simulation. The static `sim-spec` schema takes `parts`
  and `couple` too (a looser shape); a part's formulas are checked live with the names its model sees (the consts, the params, its
  inputs) where its engine's `exprs` lists them; the validators' messages (`checkParts`) land at the part's fields.
- **Layout**: details in tooltips (ⓘ); the bar's buttons in one row when they fit, icons only under 560 px, stacked under 420 px;
  no horizontal scroll at 320 px.
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

1. **Loading**: `src/composition/shell/author-page.ts` on the first visit: `activity_author_schemas.js` from `NOEMA_ENGINE_BASE`
   (the bundle has it inline), every library engine with the schema kernel and the content checks, then the lazy piece
   `build/author.js` (the bundle inlines it as `noema-lazy:author`). `tools/build.py` copies the schemas file into the site.
2. **Router**: `#/author` is a page of the frame (`NoemaShell.registerPage('author')`, with `subjectChrome({ sub: true, crumbs:
   [[tE('engine.author.title')]] })`; not an `ENGINE_ROUTES` entry) and, in the classic screens (`shell: false`), `route()` in
   `engine/src/40_views.js` calls `Noema.app.author(main, back)`. Leaving the route removes `noema-author`, which ends its keys
   and its preview session (`disconnectedCallback`).
   The way in: subject ⋮ › Create an activity (`engine.author.create`, line icon `wrench`, `engine.author.createSub` under it).
3. **Schemas**: `tools/build.py` writes `engine/activity_author_schemas.js` (`--author-schemas` prints it; the test compares).
4. **Words**: `engine.author.*` in `i18n/engine/en.arb` (descriptions) and `i18n/engine/drafts/<locale>.arb` for all 14 other UI
   locales; `engine.author.*` in `i18n/engine/dynamic_keys.txt`. A new schema field needs `engine.author.f.<title>` there, in
   every locale; `node tools/i18n/check.js` and `tests/activity_author.js` say what is missing.
5. **Tests**: `node tests/activity_author.js` (Node), `--browser "$T"` in `tests/run_e2e.sh`.
