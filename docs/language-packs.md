# 🧩 Language packs: a neutral core, an explanation facade per native language

Status: **contract accepted 2026-10-11** (D19 in `docs/LANGUAGES.md`), **amended the same day by R1–R3** (the owner's
second round: three sections of comparisons, Turkish supported, structured notes, the word's parameters first). Applies to every language course, every language
package (`noema.langpack/v1`) and every tool or prompt that writes course content (the skill `noema-language-builder`,
the connector, the playbook, the briefs).

## 1. The rule (D19, asked by the product owner)

**Each language is taught adapted to the learner's native language.**

* The **native language** of the learner decides the language of every explanation and every comparison.
* **Supported natives** = the UI locales (`docs/i18n.md` §2): en · el · ru · fr · ar (ar-EG) · de · hi · zh (zh-Hans /
  zh-Hant) · ja · it · es (es-ES) · sq · pt (pt-PT) · **tr** (added 2026-10-11, R1). The owner's priority for locale
  facades: el, ru, fr, ar, de, tr, zh.
* A learner whose native language is supported gets: explanations **in** that language, and the comparisons with it
  **first** (R1, §2.2): then those with the languages they speak at C1 / C2, then those with the other languages they
  are learning; every other comparison waits in a third section, folded.
* A learner whose native language is not supported gets: explanations in their UI language, and comparisons only with
  the **typological type, branch or family** of their native language, where that makes sense for the point taught.
* **No references to English** (or any language outside the course) in a general text: a comparison is always a
  **note** for one language (or type), shown in its section. The course languages themselves may always be compared with
  each other (the polyglot links, D10).
* **Notes are structured** (R2, §2.3): a small, safe Markdown subset — never one squashed paragraph.
* **The word card shows the word's distinctive parameters, prominently** (R3, §2.4), and the **first step** of every
  language package is the exhaustive map of those parameters, per part of speech, before any word.
* Provenance is not a comparison: "borrowed from English" in an etymology stays (it says where a word comes from).

## 2. Three layers

| Layer | What | Where | Who writes it |
|---|---|---|---|
| **Core** | everything language-neutral: ids, forms, paradigms, tokens, tags, typology values, structure of pages and exercises | `core/`, `lang/<L>/` (the non-text fields) | authors (Claude), once |
| **Master facade** (English) | every explanation text, written **neutrally** (it names no language outside the course) | inline in the same files (today's English fields) — unchanged format, backward compatible | authors, once |
| **Contrast layer** | how a point looks **from one native language** (or type / branch / family) | `notes: [{for, rel, text}]` inline in the master, on grammar pages, blocks, phenomena, overview and (new) word profiles | authors, for every supported native + every type |
| **Locale facade** | the master facade and the relevant contrast notes, **translated and adapted** to one locale | `facades/<locale>/*.json` | Claude drafts → review (Weblate / the owner) |

### 2.1 The contrast layer

```json
"notes": [ { "for": "el", "rel": "similar", "text": "…" }, { "for": "type:agglutinating", "rel": "new", "text": "…" },
           { "for": "branch:Semitic", "rel": "same", "text": "…" }, { "for": "family:Turkic", "rel": "different", "text": "…" } ]
```
* `for`: a language code (a supported native — `en el ru fr ar de hi zh ja it es sq pt tr`; other codes of
  `_typology/languages.json` are shown only in the folded third section “From other languages”, R1), `type:<fusional|agglutinating|isolating|polysynthetic>`,
  `branch:<branch>` (e.g. `branch:Semitic`), `family:<family>`.
* `rel`: `same | similar | different | new | trap`.
* `text`: the structured Markdown subset of §2.3.
* **Required on every grammar page** (realization; blocks optional): one note for each supported native other than the
  page's own language (tr included), and one for each type `type:fusional`, `type:agglutinating`, `type:isolating`, `type:polysynthetic`
  plus `branch:Semitic` (a type note may be short; where a type has nothing to say, `rel: "same"` with one sentence).
* **Word profiles** gain `profile.notes` (same shape) for comparisons that used to sit in `pitfalls`, `funFacts`,
  `subtleties`, `feeling`, `synonyms[].nuance`, `etymology.text` (cognates, false friends, "like X").
* Phenomena (`_phenomena/<L>.json`) and the overview take `notes` the same way (`alsoNote` / `alsoIn` stay as data).
* A note's text names only its own language (or type), the course languages and the point taught.

### 2.2 What the learner sees (R1, amends D19)

```
native        = a:settings.native  ({code} or {name, type, family, branch}); fallback: the course's settings.knows entry with level "native"
mine          = [native] + the settings.knows languages at C1 or C2 (C1 = C2), in the order the learner listed them
learning      = the course languages the learner studies (the active languages of the course), minus the page's own
explainLocale = settings.speaker (override)  ▸ matchLocale(native.code) if its facade is on  ▸ the UI locale if its facade is on  ▸ en
```

Comparison notes are shown in **three separate sections**, each note under its own heading (the endonym of the language,
or the type / branch / family, + a `rel` chip: same / similar / different / new / trap):

1. **“From your languages”** — the note for the native language **first**, then one per C1 / C2 language. A native
   language that is not supported (no notes for it): the note for its `branch:`, else `family:`, else `type:` (once, at
   the native's place). A C1 / C2 language without a note: nothing.
2. **“Among the languages you are learning”** — the comparisons with the other course languages the learner studies
   (D10: notes whose `for` is a course language, `seeAlso` links, compare rows).
3. **“From other languages”** — **folded by default**, after the two above, clearly separated from the learner's own
   languages: the notes for every other language (the whole reference set, unsupported languages included) and the other
   type / branch / family notes.

Notes exist in the explanation locale's facade (or the master): show what exists. Because of the third section, **a locale
facade translates ALL notes** (§3), not only its own language's and the type notes.

* `familiar` (D18) is computed from the learner's own languages (native + C1 / C2); it names no other language.
* The tutor and every AI prompt get: the explanation locale (they write in it), the native language (or its type) and
  the C1 / C2 languages, and the rule "compare first with the learner's own languages; never explain through a language
  the learner does not speak".
* A native language that is not set yet: the course asks once ("Your native language?"); until then only type-free
  general texts are shown, no notes.

### 2.3 Notes are structured: the Markdown subset (R2)

A note's `text` — and every comparison-like text: `pitfalls`, `subtleties`, `funFacts`, `feeling` — is written in this
subset, which the app renders as real structure (it builds DOM nodes, never `innerHTML` of the text):

| Markup | Use |
|---|---|
| blank line (`\n\n`) | separates paragraphs |
| `- ` / `1. ` at line start | a list of several points (bullets / numbered) |
| `**bold**` | the ONE key sentence or key word (at most one or two per note) |
| `*italic*` | a word cited (`*Haus*`) — a `*` glued to a single form (`*gegesst`) stays a wrong / reconstructed form |
| `→ ` at line start (or a list item) | an example on its own line |

No headings, links, HTML, tables or code inside a note (the app adds the language heading and the chip). One short
sentence stays one sentence; two or more points → a list; a rule + its example → the example on its own line.
Target-language words keep their script and vocalization exactly; the facade translator keeps the markup.

```json
{ "for": "el", "rel": "similar", "text": "Like Greek, German builds the perfect with **have + participle**.\n\n→ ich habe gegessen — έχω φάει\n\n- the participle goes to the **end** of the clause\n- verbs of motion take *sein*, not *haben*" }
```

The lint warns (never an error) on a note over ~220 characters in one paragraph, and on markup outside the subset.

### 2.4 The word's distinctive parameters, first (R3, strengthens D14)

* **First step of every language package** — before any word: map, **per part of speech, exhaustively**, the parameters
  that are distinctive for words of the language (from its catalogue of phenomena and grammars), in
  `lang/<L>/WORD_PARAMETERS.md` (one section per part of speech, every parameter with what it records, its values, why
  it is learned with the word, and its phenomenon) and in `language.json` → `wordFeatures` (id, title, type, values,
  phenomenon, why, `none` allowed?, **`prominent`**: shown right under the word / folded, **`order`**: the most
  important first). Examples: Arabic nouns — every plural with the meanings it belongs to, dual, gender, human, root,
  pattern; German nouns — gender (article), plural, genitive singular / declension class; German verbs — Präteritum,
  Partizip II, haben / sein, the present-tense change of the 2nd / 3rd person singular, separable prefix, case
  government; Hebrew — binyan, root, construct form, plural(s); Chinese — measure word(s), traditional forms, readings
  per sense, separable verbs.
* Every word states **every** parameter of its part of speech: a value, or `{"none": "<why>"}` (validator: an error).
* The word card shows them **prominently**: right under the word, before the senses, as a compact block (label: value,
  forms in the language's script and font), in the declared order, never behind a click.
* The validator checks the map file (a section per part of speech naming every parameter), the types of `prominent` /
  `order`, and that the map covers the checklist of the language's type and typological profile (`R3_CHECKLIST`,
  `R3_TYPE` in `tools/validate_lang.py`; an item that is not a word parameter in this language is explained in
  `language.json` → `wordFeaturesChecklist: {"<feature>": "<why>"}`).

## 3. Locale facades

```
library/languages/<course>/facades/<locale>/facade.json   { "format": "noema.langfacade/v1", "course", "locale", "master": "en",
                                                               "status": "draft | preview | on", "coverage": {…}, "built" }
library/languages/<course>/facades/<locale>/core.json      { "<address>": { "t": "<text>", "src": "<hash of the master text>" } }
library/languages/<course>/facades/<locale>/<L>.json       the same for lang/<L>/*
library/languages/_phenomena/facades/<locale>/<L>.json · _typology/facades/<locale>.json   (texts shared by all courses)
```
* **Addresses** are ids + a JSON-pointer tail: `c:<concept>/gloss`, `n:<node>/title`, `f:<fn>/title`, `fr:<frame>/meaning`,
  `s:<sentence>/gloss`, `x:<lexId>/profile/pitfalls/0`, `g:<L>:<fn>/blocks/3/text`, `g:<L>:<fn>/notes/<i>/text`,
  `p:<phenomenon>/what`, `t:<feature>/learnerNote`, `a:<L>:<concept>/use` … (the full registry:
  `tools/schemas/noema.langfacade.fields.json`).
* A locale facade carries the master texts and **every note** (R1: the folded third section “From other languages” is
  in the explanation language too). Its own notes (`for` = its language, every `type:` / `branch:` / `family:` note)
  are Tier 1; the notes for other languages are Tier 3. Notes keep their R2 markup exactly.
* `src` is the hash of the master text it was made from: a changed master text makes the entry **stale** (shown in the
  parity report, still used until refreshed).
* Mixed cells (table cells with target-language forms + labels) translate only the label parts; target-language runs,
  `*`-marked wrong forms, numbers, pinyin stay byte-identical (the parity check compares them).
* Built by `tools/build.py` into `course.expl.<locale>.js` (loaded lazily, like `course.profiles.js`); the runtime
  (`langcore.applyFacade`) overlays the texts at their addresses; a missing address falls back to the master.
* The runtime never **reads** explanation text to work (matching sentences, clocks, dates, bridges): those keys are
  computed at build from the master (`s.mk`, `s.time`, `s.date`, bridges).
* Status per locale: `draft` (only with `config.i18nDrafts`), `preview` (deploy previews), `on`. A locale is offered as an
  explanation language only when its facade is `on` (or `preview` on a preview host) **and** Tier 1 is complete.

### 3.1 Tiers (what must be translated before a locale can be switched on)

| Tier | Fields | ≈ chars per locale (current course) |
|---|---|---|
| 1 | concept glosses, titles, frames, bank glosses, word senses and contrasts, grammar pages (summary, blocks, procedure, traps, quiz, seeAlso), overview, typology, script / chars notes, the locale's own notes + the type / branch / family notes | 1.1 M |
| 2 | word profiles: examples' translations, collocations, phrases, pitfalls, etymology, fun facts, subtleties, synonyms, feeling, absent | 1.85 M |
| 3 | parameter reasons (`features.*.none`), `language.json` word features, phenomena, typology features, **the notes for every other language** (the folded “From other languages” section, R1) | 0.6 M + ≈ 0.3 M of notes |

## 4. Tools

| Command | Does |
|---|---|
| `python3 tools/lang_facade.py extract <course> --locale en` | the master as a facade (the reference for translators) |
| `python3 tools/lang_facade.py parity <course> --locale <loc>` | every master address present, nothing stale, target-language runs preserved, counts per tier / field / language; writes `facades/<loc>/PARITY.md` |
| `python3 tools/lang_facade.py lint <course> [--locale <loc>]` | **no language outside the course** in the master's general texts or a facade (language names of the locale from CLDR + `tools/i18n/langnames/`), English-anchored explanations ("no ‘do’", "-ing form") flagged; notes: a valid `for`, a note names only its own language, every required note present; provenance, older stages, varieties of the course languages, cuisine / plant / people adjectives and quoted glosses are not comparisons; R2 structure warnings |
| `python3 tools/lang_facade.py task <course> --locale <loc> --tier 1` | the translation tasks (chunks per language and file) for Claude, with the glossary of the locale |
| `python3 tools/validate_lang.py <course>` | runs the lint and the required-notes rule (replaces "≥ 8 reference languages"), R2 structure warnings, R3 (the map file, every parameter on every word, the checklist) — the D19 rules and the R3 map file are errors since 2026-10-11 (`--d19-lenient`: warnings) |

## 5. Packages and authoring

* A new language (`noema.langpack/v1`) starts with its catalogue of phenomena and the **map of its word parameters**
  (R3, §2.4: `lang/<L>/WORD_PARAMETERS.md` + `wordFeatures` with `prominent` / `order`) — before any word — and carries:
  its core, its **neutral** master facade (English), notes for **every supported native** (tr included) and **every
  type** on every grammar page, `profile.notes` where a word invites a comparison, all notes in the R2 Markdown subset. The
  other locale facades are separate tasks (`lang.facade:<locale>:<L>:<tier>`) and may come later.
* The skill, the playbook, the briefs, the connector's guide and the app's task specs say this in their first lines.
* The parity of the English master is checked with `extract` + a round trip (master stripped + `facades/en` = the same files).
