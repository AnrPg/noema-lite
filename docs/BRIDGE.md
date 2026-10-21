# 文A Language help — a bridge from the pack's language to the learner's own

Decided with the user on 2026-10-21 (thread "Λεξικό μεταφράσεων για πακέτα"). The learner is, for example, a Russian
medicine student in Greece: the lectures, the exams and the pack are in Greek, and Greek is not yet easy. A **bridge**
gives that learner the words of *this* pack, in the meaning they have *in it*, in their own language, without changing
the pack and without a dictionary of the whole language.

Code: `engine/wordlink.js` (finding words in a page), `engine/bridge.js` (everything the learner sees),
`engine/src/36_bridge.css`, `NoemaPackCheck.checkBridge` in `engine/packcheck.js` (shared with the connector), the tool
`tools/bridge.py`, words `i18n/bridge/`. Tests: `tests/bridge_core.js`, `tests/bridge.js`. Pilot: Databricks (English) →
Greek, Russian, Arabic, chapter 1 complete.

## 1. What the learner gets
* **The 文A badge** on the subject (picker, Shelf, subject home): `文A RU +2`, the learner's native language first; the
  tooltip names every language by its own name (*Русский, العربية, Ελληνικά*). A bridge in draft, or one covering under
  90 % of the content words, is shown with a dashed border and says so ("draft", "55 % of the words").
* **The first time** a section of a pack with a bridge opens, a small card asks the native language (the language
  courses' `a:settings.native`, D19, so it is asked once for the whole app) and the level: *A2 · B1 · B2 · later*. Both
  can be changed in the section's ⋮ menu or the 文A button in its head; *later* hides the card until the learner opens
  the help themselves.
* **Before you read** (folded at the top of the section): the section's key words with their translation and a short
  preview of the section in the learner's language — read it first, then read the original.
* **In the text** the pack's words carry a quiet dotted line. A tap or click opens a small card (a bottom sheet on a
  phone): the word, 🔊 (the device's voice), its part of speech, "form of …", the translation in the meaning it has here,
  a note when it helps, the word's other meanings in this pack (folded), "draft translation" while nobody reviewed it,
  *I know it* and *Report a mistake*.
* **Glosses** — at the levels that want them, the translation sits in small grey letters under the *first* use of a word
  in a section, never widening the line:

| level (asked as) | glosses under the words | underlined words |
|---|---|---|
| **open** (A2) | key words of the section, and every word that is not everyday (band ≥ 2) | all |
| **balanced** (B1) | key words of the section, and the field's own terms (band 3) | all |
| **tap** (B2) | none | none until hovered; every word still opens its card |

* **Help that fades**: a word glossed in 8 sections without being looked up loses its gloss (looking it up brings it back
  for 14 days); *I know it* removes it at once (and *Show help again* undoes it).
* Never inside code, maths, ASCII diagrams, buttons, links, inputs, or an exercise (no answer may leak).

## 2. What a bridge is
A **sidecar per pack × native language**. The pack is never changed, a pack update never breaks a bridge (it only makes
some translations "stale"), and a learner downloads only the bridge of their own language.

**Entries are the pack's content words** — nouns, verbs, adjectives, adverbs, numbers, names and multi-word terms
(*data skew*, *time travel*). Function words (articles, prepositions, conjunctions, pronouns, auxiliaries, particles) are
never entries: `checkBridge` rejects them. Every entry lists the forms it appears in and its senses **as used in this
pack**; a word with two meanings here (*order*: a purchase in the e-shop example; the sequence of commits) has two senses,
and an **anchor** picks the sense at a given place.

Matching (runtime, `engine/wordlink.js`): the text is cut into words (letters, marks, digits; `'` and `-` inside a word),
compared folded (accents, case, final sigma do not matter), and **the longest entry that starts at a word wins**; the words
of a multi-word entry may be separated by spaces only. Where an anchor of the block matches (its quote with its
prefix/suffix), its sense is used; else a sense whose own forms hold the matched form; else the first sense.

### 2.1 Source files (written by Claude or a person, reviewed by people)
Next to the subject (`library/subjects/<id>/bridges/`), or next to a pack's `.json` in the skill's sandbox:

```jsonc
// bridges/core.json — the words of the pack, once for every native language
{ "format": "noema-bridge-core", "v": 1, "pack": "databricks", "source": "en",
  "entries": [ { "k": "snapshot", "pos": "NOUN", "forms": ["snapshots"], "band": 3, "key": true,
                 "senses": [ { "id": "1", "gloss": "the table's state at one version" } ] },
               { "k": "order", "pos": "NOUN", "forms": ["orders"], "band": 1,
                 "senses": [ { "id": "1", "gloss": "a customer's purchase in the e-shop example" },
                             { "id": "2", "gloss": "the sequence in which things are done" } ] } ],
  "keep": ["Databricks", "Spark", "Parquet"],          // names left as they are (count as covered)
  "sections": { "ch01-s05": { "terms": ["ACID", "transaction", "snapshot"] } },
  "anchors": [ { "at": "ch01-s06/b53dvd85x03", "quote": "order", "prefix": "Replay them in ", "k": "order", "sense": "2" } ] }

// bridges/ru.json — one native language
{ "format": "noema-bridge-locale", "v": 1, "native": "ru", "status": "draft",
  "t": { "snapshot#1": { "t": "снимок (состояние на момент версии)", "src": "…" },
         "order#2": { "t": "порядок", "note": "…" } },
  "sections": { "ch01-s05": "Если кто-то читает папку, пока другой пишет, …" } }
```

* `band`: 1 everyday · 2 academic / general technical · 3 the field's own term. `key`: a key word of the whole pack.
* `gloss` (source language) says which meaning a sense is; it is what translators translate *from*.
* `src` in a translation = the hash of `k|gloss` it was written for: when the gloss changes the translation is marked
  **stale** (shown as "the text changed since this translation was written") until someone checks it and runs `stamp`.
* `status`: `draft` until a person who speaks the language reviewed it, then `reviewed`.
* Plain text only (no markup), translation ≤ 200 characters, note ≤ 400, preview ≤ 1500, ≤ 30 key words a section.
* Block ids (`at: "<section>/<block id>"`) are the app's own (`NoemaCatalog.blockIds`, the same in `tools/bridge.py`).

### 2.2 The built file (what the app reads)
`tools/bridge.py build` merges the core and one native into `{ "format": "noema-bridge", "v": 1, pack, source, native,
status, coverage, chapters, of, entries[{k, pos, forms, band, key, senses[{id, t, gloss, note, st}]}],
sections{sid: {terms, preview}}, anchors }`. `coverage` = share of the pack's content words an entry or `keep` covers;
`chapters` = the chapters covered ≥ 95 %. The library build (`tools/build.py`) writes it as
`library/subjects/<id>/bridge.<native>.js` and records `bridgeLocales` in the registry (path, status, coverage,
chapters, previews, entries) — that is where the badge comes from, without loading any bridge.

## 3. Where bridges live
| bridge | stored | how it gets there |
|---|---|---|
| library pack | `library/subjects/<id>/bridges/` → `bridge.<native>.js` | a PR; `tools/build.py` |
| the learner's own | the device (IndexedDB `noema-bridges`) + the account (`noema-private/<uid>/bridges/<pack>.<native>.json`), index `a:bridges` (synced) | 📥 Import a `noema-bridge` file, or Claude with `noema_save_bridge` |

The account's own bridge wins over the library's for the same language. Per learner (synced like the rest of `a:`):
`a:settings.bridge` {on, level, cefr, asked}, `a:settings.native`, `a:bridgeWords:<source language>` {word: {known,
seen, look, lookAt}} (shared by every pack in that language), `a:bridgeReports` (the last 200 *Report a mistake* notes;
the connector hands them to Claude).

**Who may attach a bridge to a shared or public pack** (decided): its author, and others with the author's permission
(🔔, as other changes to shared material). Phase 1 attaches bridges to the learner's own account only; sharing them is
phase 4.

## 4. Making a bridge (Claude, the skill or a person)
```
python3 tools/bridge.py todo SUBJ --chapters ch01      # content words no entry covers yet, most frequent first
# write bridges/core.json (entries, senses as used here, keep, key words per section, anchors where a word has 2 senses)
# write bridges/<native>.json (a translation per sense, natural for a student; a preview per section)
python3 tools/bridge.py check SUBJ                     # 0 errors: function words, unknown sections, orphan anchors, missing / stale translations
python3 tools/bridge.py coverage SUBJ --native ru      # per chapter
python3 tools/bridge.py build SUBJ --native ru -o ru.bridge.json
```
`SUBJ` is a library subject folder or a pack `.json` (the learner's pack, from `noema_get_pack_url`) with `bridges/`
beside it. Then **📥 Import** the built file in the app, or save it with the connector: `noema_bridge_guide` (this text,
the account's bridges and the learners' reports) and `noema_save_bridge` (checked exactly as the app checks it).

Writing rules: translate the meaning the word has **in this pack** (the gloss), for a student of the field — the term
the student's own lectures would use, then a plain explanation in brackets when the term alone may not be known
(*снимок (состояние на момент версии)*). Names, product names and code stay as they are (`keep`). A preview tells what
the section is about in 2–4 sentences; it never replaces the section. Work chapter by chapter, most important first:
a chapter is useful when it is complete.

## 5. Phases
1. **This PR** — the core (matching, the card, glosses, levels, fading, the badge, "Before you read"), import, the tool,
   the connector, the skill, the Databricks pilot (chapter 1 → el, ru, ar).
2. Anchors made by the tool from the text (a word whose senses differ by context), the rest of the Databricks pilot, a
   Greek pack (e.g. DNA replication) → ru, ar once the learner's pack can be read.
3. Explain this sentence (AI, in the learner's language) and *My words*: the words looked up, reviewed with spaced
   repetition, and drills on the pack's terms in both directions.
4. Sharing: bridges of shared and public packs (the author, or others with the author's 🔔 permission), reviews by
   speakers of the language (`draft` → `reviewed`).
5. Listening (the sections read aloud with the words highlighted) and an easy-language version of a section.
