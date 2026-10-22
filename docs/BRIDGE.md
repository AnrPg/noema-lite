# 文A Language help — a bridge from the pack's language to the learner's own

Decided with the user on 2026-10-21 (thread "Λεξικό μεταφράσεων για πακέτα"). The learner is, for example, a Russian
medicine student in Greece: the lectures, the exams and the pack are in Greek, and Greek is not yet easy. A **bridge**
gives that learner the words of *this* pack, in the meaning they have *in it*, in their own language, without changing
the pack and without a dictionary of the whole language.

Code: `engine/wordlink.js` (finding words in a page), `engine/bridge.js` (everything the learner sees),
`engine/src/36_bridge.css`, `NoemaPackCheck.checkBridge` in `engine/packcheck.js` (shared with the connector), the tool
`tools/bridge.py`, words `i18n/bridge/` (en; drafts el, ru, fr, ar-EG). Test: `tests/bridge.js`. Pilot: Databricks (English) →
Greek, Russian, Arabic, chapter 1 complete; test packs in Greek, Russian and Arabic (`tests/fixtures/bridges/`), each with
bridges into the other three, so **all 12 directions among English, Greek, Russian and Arabic** are tested end to end.

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

* `cues` (core only, optional) on a sense: words of the source language whose presence in the same sentence means this
  sense (*order* sequence: `"arrival order"`, `"in order"`; purchase: `"e-shop"`, `"customer"`). `tools/bridge.py anchor`
  turns them into anchors (`"auto": true`) wherever they pick another sense than the first; anchors a person wrote (no
  `auto`) are kept and win. `tools/bridge.py senses` lists every place of a word with several senses and the sense it gets.
* `sections[sid].terms` (core): the key words shown in "Before you read". `tools/bridge.py terms` picks them from the
  text for every section a person has not chosen: the field words (band 2–3, key terms) a section uses most, weighed by
  how rare they are across the pack, so *table* or *file* give way to what the section is about; written with
  `"auto": true`, and a person's list (no `auto`) is kept.

### 2.2 Every language pair (the first four: English, Greek, Russian, Arabic — 12 directions)
Any pack language can be bridged into any other language; the app, the tool and the checks know nothing of particular
pairs. What differs is how the words of the *source* language are written down:

| source | entries | matching |
|---|---|---|
| English | the lemma (`snapshot`), `forms` with the plurals and verb forms the pack uses (`snapshots`, `fails`, `failed`) | case and accents ignored |
| Greek | the lemma (nominative singular, 1st person present: `αλυσίδα`, `συνθέτω`), `forms` with the cases and persons the pack uses (`αλυσίδας`, `συνθέτει`, `συντίθεται`) | accents, capitals and final ς ignored (`ΑΛΥΣΙΔΑ` = `αλυσίδα`) |
| Russian | the lemma (`цепь`, `синтезировать`), `forms` with the cases and persons used (`цепи`, `синтезирует`, `синтезируется`) | case ignored, ё = е (`ещё` = `еще`) |
| Arabic | the word **without** clitics or article (`سلسلة`, not `السلسلة`), `forms` with broken plurals and other stems (`سلاسل`); phrases as written (`لولب مزدوج`, form `اللولب المزدوج`) | vowel marks, tatweel, ى/ي ignored; the clitics و ف · ب ل ك · ال (لل) in front of a word are recognised by themselves (`والسلسلة`, `بسلسلة`) |

Function words are never entries in any of them (`tools/bridge.py` knows them for en, el, ru, ar, fr, de, es, it, pt,
tr). Translations into Arabic are shown right to left inside any page (`dir=auto`); a page in Arabic is right to left and
its glosses sit under the words in the same way. A learner whose native language is the pack's own gets no help.

### 2.3 The built file (what the app reads)
`tools/bridge.py build` merges the core and one native into `{ "format": "noema-bridge", "v": 1, pack, source, native,
status, coverage, everyday, chapters, of, entries[{k, pos, forms, band, key, senses[{id, t, gloss, note, st}]}],
sections{sid: {terms, preview}}, anchors }`. `coverage` = share of the pack's content words an entry or `keep` covers;
`everyday` = the same for the everyday words (entries of band 1 or without a band, and every word no entry covers yet);
`chapters` = the chapters covered ≥ 95 %. The library build (`tools/build.py`) writes it as
`library/subjects/<id>/bridge.<native>.js` and records `bridgeLocales` in the registry (path, status, coverage,
chapters, previews, entries) — that is where the badge comes from, without loading any bridge.

### 2.4 Pairs: the language the learner READS → their native language (translations too)
A bridge is one **pair**: from the language the learner reads to their native language. The language read is the pack's
own **or one of its translations** (docs/i18n.md §10): a learner who opened the Greek translation of an English pack reads
Greek, so the help they need is **el → ru**, not en → ru. Every new pack gets every pair (`tools/pack_rules.json`
"languages" `"bridgesFrom": ["own", "translations"]`) — for an English pack translated into Greek and Russian:

| reads | bridges |
|---|---|
| en (the pack) | en→el · en→ru · en→ar |
| el (its translation) | el→en · el→ru · el→ar |
| ru (its translation) | ru→en · ru→el · ru→ar |

A translation's bridge is made from **the translation's words** (its own entries, forms, senses and anchors), so it is made
**after** the translation is saved — the check refuses a `source` the pack has no translation into.

| | from the pack's own language | from a translation into `<loc>` |
|---|---|---|
| source files | `bridges/core.json`, `bridges/<native>.json` | `bridges/from-<loc>/core.json` (`"source": "<loc>"`), `bridges/from-<loc>/<native>.json` |
| tool | `bridge.py … SUBJ` | `bridge.py … SUBJ --from <loc>` (the translation's chapters: `translations/<loc>/` of a subject folder, or `<id>.tr.<loc>.json` beside a pack `.json`, or `--translation FILE`) |
| pair key | `<native>` (as before) | `<loc>.<native>` (`engine/bridge.js` `pairKey`, the connector's `brKey`) |
| account | `bridges/<pack>.<native>.json` | `bridges/<pack>.<loc>.<native>.json` |
| index `a:bridges[pack]` | `<native>: summary` | `<loc>.<native>: { …summary, source: "<loc>" }` |
| library | `bridge.<native>.js`, `NOEMA_BRIDGES["<pack>\|<native>"]` | `bridge.<loc>.<native>.js`, `NOEMA_BRIDGES["<pack>\|<loc>.<native>"]`, `bridgeLocales["<loc>.<native>"]` |
| connector | `noema_get_pack_url(subject_id)`, `noema_save_bridge(subject_id, native)` | `noema_get_pack_url(subject_id, locale: "<loc>")` (the translation file, beside the pack), `noema_save_bridge(subject_id, native, source: "<loc>")` |

In the app the section shown decides: `Noema.subject.language` is the translation's locale when one is shown
(`sourceLanguage` = the pack's own), and `available()` / `load()` pick the pair from that language — the 文A badge of a
card in a list uses the language the card will open in (`contentLang`). A learner reading a translation never gets the
pack-language bridge (its words are not on the page). `bridge.py require SUBJ` checks every pair; `--from <loc>` one
translation's.

## 3. Where bridges live
| bridge | stored | how it gets there |
|---|---|---|
| library pack | `library/subjects/<id>/bridges/` → `bridge.<native>.js` | a PR; `tools/build.py` |
| the learner's own | the device (IndexedDB `noema-bridges`) + the account (`noema-private/<uid>/bridges/<pack>.<pair>.json`, §2.4), index `a:bridges` (synced) | 📥 Import a `noema-bridge` file, or Claude with `noema_save_bridge` |

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
python3 tools/bridge.py coverage SUBJ --native ru      # per chapter, all and everyday words
python3 tools/bridge.py require SUBJ                   # check + a bridge into every language a new pack needs, enough coverage
python3 tools/bridge.py senses SUBJ --word order        # a word with two senses: every place and the sense it gets there
# add cues to its senses (core.json), then
python3 tools/bridge.py anchor SUBJ                     # anchors from the cues (a person's anchors are kept and win)
python3 tools/bridge.py terms SUBJ [--dry]              # key words of every section from the text (a person's are kept)
python3 tools/bridge.py build SUBJ --native ru -o ru.bridge.json
# then the same from each translation (after it is saved), in bridges/from-<locale>/ (§2.4):
python3 tools/bridge.py todo SUBJ --from el             # the Greek translation's words
python3 tools/bridge.py build SUBJ --from el --native ru -o ru.bridge.json
python3 tools/bridge.py require SUBJ                    # every pair: en→el/ru/ar, el→en/ru/ar, ru→en/el/ar
```
`SUBJ` is a library subject folder or a pack `.json` (the learner's pack, from `noema_get_pack_url`) with `bridges/`
beside it. Then **📥 Import** the built file in the app, or save it with the connector: `noema_bridge_guide` (this text,
the account's bridges and the learners' reports) and `noema_save_bridge` (checked exactly as the app checks it). Send the file with its upload command, not inline:
`noema_save_bridge(subject_id, native[, source])` → `curl` the file to the URL it returns → the same call again (`source`: the
translation's locale for a translation's bridge); the upload
goes live only once it passes the check. Publishing a draft is the same save with `"status": "reviewed"`.

Writing rules: translate the meaning the word has **in this pack** (the gloss), for a student of the field — the term
the student's own lectures would use, then a plain explanation in brackets when the term alone may not be known
(*снимок (состояние на момент версии)*). Names, product names and code stay as they are (`keep`). A preview tells what
the section is about in 2–4 sentences; it never replaces the section. Work chapter by chapter, most important first:
a chapter is useful when it is complete.

**Every new pack needs them** (docs/PIPELINES.md §4b, `tools/pack_rules.json` "languages"): every pair of §2.4 — from the
pack's language and from each of its translations into each of English, Greek, Russian and Arabic other than the language
read, each made after its translation — covering ≥ 90 % of the content words and ≥ 80 % of the
everyday ones — learners may be at A2/B1, so the everyday words of the explanations count, not only the field's terms.
`bridge.py require` is the flow's `bridges` step; `noema_save_bridge` says when a saved bridge is below the minimum.

## 5. Phases
1. **Done (PR #29)** — the core (matching, the card, glosses, levels, fading, the badge, "Before you read"), import, the tool,
   the connector, the skill, the Databricks pilot (chapter 1 → el, ru, ar).
2. **Done (PR #29)** — every pair of en, el, ru, ar (Arabic clitics, English possessives, the Greek, Russian and Arabic
   test packs), anchors made by the tool from cues (`senses`, `anchor`), section key words from the text (`terms`), the
   whole Databricks pilot → el, ru, ar (1,739 words, 97% of the content words, all 13 chapters, a preview for each of
   the 184 sections). Still to do: a Greek pack of the learner's (e.g. DNA replication) → en, ru, ar once the learner's
   pack can be read.
3. Explain this sentence (AI, in the learner's language) and *My words*: the words looked up, reviewed with spaced
   repetition, and drills on the pack's terms in both directions.
4. Sharing: bridges of shared and public packs (the author, or others with the author's 🔔 permission), reviews by
   speakers of the language (`draft` → `reviewed`).
5. Listening (the sections read aloud with the words highlighted) and an easy-language version of a section.
