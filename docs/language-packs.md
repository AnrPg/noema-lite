# 🧩 Language packs: a neutral core, an explanation facade per native language

Status: **contract accepted 2026-10-11** (D19 in `docs/LANGUAGES.md`). Applies to every language course, every language
package (`noema.langpack/v1`) and every tool or prompt that writes course content (the skill `noema-language-builder`,
the connector, the playbook, the briefs).

## 1. The rule (D19, asked by the product owner)

**Each language is taught adapted to the learner's native language.**

* The **native language** of the learner decides the language of every explanation and every comparison.
* **Supported natives** = the UI locales (`docs/i18n.md` §2): en · el · ru · fr · ar (ar-EG) · de · hi · zh (zh-Hans /
  zh-Hant) · ja · it · es (es-ES) · sq · pt (pt-PT).
* A learner whose native language is supported gets: explanations **in** that language, and insights and comparisons
  **with** that language only.
* A learner whose native language is not supported gets: explanations in their UI language, and comparisons only with
  the **typological type, branch or family** of their native language, where that makes sense for the point taught.
* **No references to English** (or any language outside the course) unless it is the learner's native language. The
  course languages themselves may always be compared with each other (the polyglot links, D10).
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
* `for`: a language code (a supported native — `en el ru fr ar de hi zh ja it es sq pt`; other codes of
  `_typology/languages.json` are kept as **source material** and never shown), `type:<fusional|agglutinating|isolating|polysynthetic>`,
  `branch:<branch>` (e.g. `branch:Semitic`), `family:<family>`.
* `rel`: `same | similar | different | new | trap`.
* **Required on every grammar page** (realization; blocks optional): one note for each supported native other than the
  page's own language, and one for each type `type:fusional`, `type:agglutinating`, `type:isolating`, `type:polysynthetic`
  plus `branch:Semitic` (a type note may be short; where a type has nothing to say, `rel: "same"` with one sentence).
* **Word profiles** gain `profile.notes` (same shape) for comparisons that used to sit in `pitfalls`, `funFacts`,
  `subtleties`, `feeling`, `synonyms[].nuance`, `etymology.text` (cognates, false friends, "like X").
* Phenomena (`_phenomena/<L>.json`) and the overview take `notes` the same way (`alsoNote` / `alsoIn` stay as data).
* A note's text names only its own language (or type), the course languages and the point taught.

### 2.2 What the learner sees

```
native        = a:settings.native  ({code} or {name, type, family, branch}); fallback: the course's settings.knows entry with level "native"
explainLocale = settings.speaker (override)  ▸ matchLocale(native.code) if its facade is on  ▸ the UI locale if its facade is on  ▸ en
notes shown   = for == native.code (supported natives only)
                ▸ else for == branch:<native.branch> ▸ family:<native.family> ▸ type:<native.type>
                (never a note for another language; no "from other languages" fold)
familiar (D18) = computed from the native language only (it names no other language)
```
* The tutor and every AI prompt get: the explanation locale (they write in it), the native language or its type
  (they compare only with it), and the rule "never refer to languages the learner does not speak natively".
* A native language that is not set yet: the course asks once ("Your native language?"); until then only type-free
  general texts are shown, no notes.

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
* A locale facade carries the master texts and **only the notes it can show**: `for` = its own language, every `type:`,
  `branch:`, `family:` note.
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
| 1 | concept glosses, titles, frames, bank glosses, word senses and contrasts, grammar pages (summary, blocks, procedure, traps, quiz, seeAlso), overview, typology, script / chars notes, the locale's notes | 1.1 M |
| 2 | word profiles: examples' translations, collocations, phrases, pitfalls, etymology, fun facts, subtleties, synonyms, feeling, absent | 1.85 M |
| 3 | parameter reasons (`features.*.none`), `language.json` word features, phenomena, typology features | 0.6 M |

## 4. Tools

| Command | Does |
|---|---|
| `python3 tools/lang_facade.py extract <course> --locale en` | the master as a facade (the reference for translators) |
| `python3 tools/lang_facade.py parity <course> --locale <loc>` | every master address present, nothing stale, target-language runs preserved, counts per tier / field / language; writes `facades/<loc>/PARITY.md` |
| `python3 tools/lang_facade.py lint <course> [--locale <loc>]` | **no language outside the course** in the master's general texts or a facade (language names of the locale from CLDR + `tools/i18n/langnames/`), English-anchored explanations ("no ‘do’", "-ing form") flagged; notes: allowed `for` per locale, every required note present |
| `python3 tools/lang_facade.py task <course> --locale <loc> --tier 1` | the translation tasks (chunks per language and file) for Claude, with the glossary of the locale |
| `python3 tools/validate_lang.py <course>` | runs the lint and the required-notes rule (replaces "≥ 8 reference languages") |

## 5. Packages and authoring

* A new language (`noema.langpack/v1`) carries: its core, its **neutral** master facade (English), notes for **every
  supported native** and **every type** on every grammar page, `profile.notes` where a word invites a comparison. The
  other locale facades are separate tasks (`lang.facade:<locale>:<L>:<tier>`) and may come later.
* The skill, the playbook, the briefs, the connector's guide and the app's task specs say this in their first lines.
* The parity of the English master is checked with `extract` + a round trip (master stripped + `facades/en` = the same files).
