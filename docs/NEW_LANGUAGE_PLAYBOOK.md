# ➕ Adding a language to a course: the playbook (prompts for Claude Code)

A language package is too big for one prompt: a single session runs out of attention long before the last word, and quality
drops where nobody looks. This playbook breaks it into **25 prompts**, each one a fresh Claude Code session in the repo,
in this order. Every prompt is self-contained, names the files it may touch, and ends with the same checks, so a session can
be repeated or resumed without the others.

**The shape of the work**

| # | Prompt | What it produces | Turns |
|---|---|---|---|
| 1 | Typology and phenomena | the language's profile in `_typology/` and its catalogue of phenomena | 2 (write, then audit) |
| 2 | The facade and the engine | `language.json` (every word parameter, paradigms), reference checks, script/keyboard/speech support, the language in `course.json` | 2 |
| 3–8 | Foundations F1–F6 | S00–S18: words, grammar pages, sentences | 2 each |
| 9–11 | Vegetables V1–V3 | the field, tiers 1–3 | 1–2 each |
| 12 | Core K1 | C01–C04 (and later K2–K12, one prompt per 4 lessons, as the core is written) | 2 each |
| 13 | Links across the course | seeAlso both ways, bridges, notes that name the new language | 1–2 |
| 14 | Audit | every check, a sample checked by hand, the app walked through | 1–2 |

Later, when the core grows: **K2–K12** (prompts 15–25), the same prompt as 12 with the next four lessons.

**Turns.** Every content prompt is two turns: the first writes; the second is the audit prompt at the end of this file
("Audit what you just wrote"), in the same session, so the model checks its own work with the brief still in view.

**Branch.** Do the whole language on a branch `lang-<code>` and merge it into `main` when prompts 1–12 are done and the
suite is green. While a lesson is written in some languages only, the course keeps it out of the learner's way per language
(⏳); do not re-run `tools/lang_sources/core/mkcore.py` on `main` before the new language has the lessons the others have
(its draft list is course-wide).

**Placeholders.** Replace `<LANG>` (the name, e.g. Persian), `<code>` (ISO 639-1, e.g. `fa`), `<type>` (fusional /
agglutinating / isolating / polysynthetic) and `<course>` (e.g. `polyglot-semitic-zh-de`).

---

## Prompt 1 — Typology and phenomena

```
Read docs/LANGUAGE_RULES.md (binding), then docs/LANGUAGES.md D13–D19, §4.11 and §4.7.1, and tools/lang_sources/AGENT_BRIEF.md.
We are adding <LANG> (<code>) to the course library/languages/<course>. This session writes ONLY:
1. library/languages/_typology/languages.json — the profile of <code> if it is missing: a value for EVERY feature of
   _typology/features.json (WALS-based; "unknown" only when sources disagree), its family and type; check the reference set
   in _typology/reference.json (add <code> only if I ask).
2. library/languages/_phenomena/<code>.json — the complete catalogue of the language's phenomena for a learner of ANY
   background (D16): every feature it has AND lacks, tagged with typology {feature, value}, kind has|lacks, specific + alsoIn
   for things the tags only approximate, notes for ≥ 8 reference languages of all four types, status "missing" and "when"
   left empty (nothing is taught yet), distinctions and polysemy for the words the course will need (look at
   core/fields/*.json glosses). Use the catalogues of the other course languages as models of depth and format.
Ground every claim (WALS, a reference grammar, Wiktionary via tools/lang_refcheck.fetch); leave out what you cannot ground.
Checks: python3 tools/lang_phenomena.py --lang <code> (no ❌) and python3 tests/lang_rules.py. Commit on branch lang-<code>.
Report: number of phenomena by area, what you were unsure of.
```

## Prompt 2 — The facade and the engine

```
Read docs/LANGUAGE_RULES.md, docs/LANGUAGES.md §4.1, §4.5–§4.5.2, §4.9, §5.5, §7.2, §8 (Input, Text rendering) and §11,
and library/languages/_phenomena/<code>.json (written in the last session).
Add <LANG> (<code>) to library/languages/<course>:
1. lang/<code>/language.json: name, nativeName, script, dir, tokenJoin, vowelMarks / romanization, typology "<type>",
   citationCells and paradigmCells per POS and class (UniMorph tags as the other languages use), extraTags, and wordFeatures
   — EVERY parameter a word of this language must state, per POS (D14), each tied to its phenomenon. Model it on the other
   languages' language.json; every phenomenon of level "word" in the catalogue must be recorded by a parameter.
2. The reference checker: tools/lang_refcheck.py must fetch and compare <code> (Wiktionary language name, tag mapping,
   vowel marks / plene spelling if the script has them). Test it on 20 common words.
3. The engine: LANG_INFO (name, flag, font) in engine/lang/00_base.js; tokenizer needs in engine/langcore.js (clitics,
   prefixes, segmentation for scripts without spaces); the script module and keyboard if the script is new (tools/lang_script.py,
   engine/lang/90_script.js); the speech tag (SPEECH_TAGS) — each with a test in the matching tests/lang_*.js file.
4. course.json: add "<code>" to languages (and to typology paths if its type is new: core/typology.json).
Do NOT write words, grammar pages or sentences yet. Checks: python3 tools/build.py site bundle; python3 tools/validate_lang.py
library/languages/<course> (0 errors; missing content is a warning); python3 tests/lang_validate.py; node tests/langcore.js;
python3 tools/lang_phenomena.py --lang <code>. Commit. Report: the parameters per POS, what the engine needed.
```

## Prompts 3–8 — Foundations F1–F6

Batches: **F1** `fd.00,fd.01,fd.02,fd.03,fd.04` · **F2** `fd.05,fd.06` · **F3** `fd.07,fd.08,fd.09` · **F4** `fd.10,fd.11,fd.12` ·
**F5** `fd.13,fd.14,fd.15` · **F6** `fd.16,fd.17,fd.18`.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py foundations --course <course> --lang <code> --batch F<n> --nodes <nodes> > /tmp/brief.txt
Read /tmp/brief.txt completely before you start, then docs/LANGUAGE_RULES.md and every section it names. Work in this order,
one lesson at a time: (A) the words of the lesson with their full facade and profile, grounded in Wiktionary; (B) the grammar
page of each function of the lesson (status, blocks, ask yourself, traps, evidence, generators, seeAlso, typology tags, notes
for ≥ 8 reference languages of all four types); (C) the sentences (≥ 15 per lesson, every new word, every function in ≥ 8,
variant pairs); (D) the catalogue's status for what the lesson teaches. Run the checks after EACH lesson, not only at the end.
Commit when all checks pass, and give the report the brief asks for.
```

## Prompts 9–11 — The vegetables field

Batches: **V1** `veg.1` · **V2** `veg.2a,veg.2b` · **V3** `veg.3a,veg.3b`.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py field --course <course> --lang <code> --batch V<n> --nodes <nodes> > /tmp/brief.txt
Read it completely, then the same field in the other course languages as models. A rare item without a real word is an
"absent" entry with what people say instead — never an invented word. Commit when the checks pass; report as the brief asks.
```

## Prompt 12 (and 15–25) — Core K1 (… K12)

K1 `cr.01,cr.02,cr.03,cr.04`, then K2 `cr.05…cr.08` … K12 `cr.45…cr.48` — only the lessons the other languages already have.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py core --course <course> --lang <code> --batch K<n> --nodes <nodes> > /tmp/brief.txt
Read it completely. Before adding any word, search the <code> lexicon for the concept id (D15: a word you have may already
carry it as another meaning). Work lesson by lesson (words → grammar pages → sentences → catalogue), checks after each lesson.
Commit when all checks pass; report as the brief asks.
```

## Prompt 13 — Links across the course

```
Read docs/LANGUAGE_RULES.md and docs/LANGUAGES.md §4.7 (seeAlso), §4.7.1, §4.10 and §9.
<LANG> (<code>) is now written in library/languages/<course>. Link it with the other languages — touching only the fields
named here:
1. seeAlso both ways: every grammar page of <code> points to the same point in the other course languages, and every other
   language's page of a function <code> also has gets a seeAlso to <code> (one line: what is parallel or different).
2. If <code> is in _typology/reference.json: comparison notes for <code> in the other languages' pages where it adds
   something (concrete, correct, one or two sentences).
3. Bridges: cognates and loans between <code> and the other course languages that the etymologies support
   (tests/lang_poly.js shows how they are found); report false friends.
Checks: python3 tools/validate_lang.py library/languages/<course> --strict; python3 tools/lang_refcheck.py
library/languages/<course>; node tests/lang_poly.js .; commit; report the counts.
```

## Prompt 14 — Audit

```
Audit <LANG> (<code>) in library/languages/<course> as a demanding reviewer, then fix what you find:
1. Run everything: python3 tools/build.py; bash tests/run_e2e.sh (long: run it in the background and poll the log).
2. Draw 40 random words and 40 random sentences of <code>; check each against Wiktionary (tools/lang_refcheck.fetch) and the
   grammar pages: forms, gender, plural, vowel marks / tones, the meaning of the sentence vs its gloss, the token annotation.
3. Open the course in the app (tests/lang_walkthrough.js shows how) with <code> active, phone 390 px and desktop: lessons,
   word cards, grammar pages, the session, ⫴ parallel lanes — the new lane must keep the same levels as the others.
4. List what a native speaker should still check (idioms, register, regional words) in a short file
   docs/review/<code>-native-check.md.
Fix errors in place (smallest change), re-run the checks, commit. Report: what was wrong, what you fixed, what remains.
```

---

## The audit turn (the second turn of every content prompt)

```
Audit what you just wrote before we finish: (1) go through docs/LANGUAGE_RULES.md §C point by point for each file;
(2) pick 10 words and 10 sentences at random and check them again against Wiktionary and the grammar pages;
(3) look for words you used in sentences that have no lexeme, paradigm cells you left empty, glosses that do not match
the sentence, notes that compare with a language you are not sure about; (4) fix, re-run the checks, amend the commit,
and tell me what you changed.
```

## Why this split

* **One kind of work per session.** Research (typology, phenomena), infrastructure (facade, engine) and writing (words,
  grammar, sentences) need different attention; mixing them is where errors slip in.
* **3–5 lessons per session** is what fits with full profiles, grounded forms and ≥ 15 sentences per lesson.
* **Checks after each lesson** catch a wrong paradigm before twenty sentences are built on it.
* **The audit turn** makes the model re-read its own output against the rules; it reliably finds what the first pass missed.
* **The brief generator** keeps every session on the same, current instructions (`tools/lang_sources/briefs/*.txt`);
  change the template once when a rule changes.
* The same tasks can also run through the app's queue (✨ Through Claude, docs/LANGUAGES.md §10) — one `lang.node` task per
  node and language — when you prefer the Claude app with the connector to Claude Code.
