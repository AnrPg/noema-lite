# ➕ Adding a language to a course: the playbook (prompts for Claude Code)

> **First rule — D19 (`docs/language-packs.md`): the new language is taught through each learner's native language.**
> Everything the prompts below write is **neutral**: a general text (summary, blocks, traps, procedure, quiz, seeAlso,
> facts, word profiles, `features.*.none`, phenomena) names **no language outside the course** and never explains through
> English grammar ("no ‘do’", "-ing", "is not ‘the’") — English is only the language the master is written in. Every
> comparison is a **contrast note** `{for, rel, text}`: on every grammar page one for **each supported native** (en el ru
> fr ar de hi zh ja it es sq pt tr — the UI locales' languages — without the page's own language) and the five type notes
> (`type:fusional`, `type:agglutinating`, `type:isolating`, `type:polysynthetic`, `branch:Semitic`; a type note names no
> language: "If your language …"); `profile.notes` on a word that invites a comparison (cognates, false friends); `notes`
> on phenomena. A note names only its own language (examples in it, in its script), the course languages and the point.
> The **locale facades** (the texts translated into el, ru, fr …) are separate, later tasks: `python3 tools/lang_facade.py
> task library/languages/<course> --locale <loc> --tier 1`. Every content prompt runs `python3 tools/lang_facade.py lint
> library/languages/<course>` and leaves nothing of its own there.
>
> **R1–R3 (2026-10-11, with D19; `docs/language-packs.md` §2.2–§2.4).** **R1** — a learner sees the comparisons in three
> sections: “From your languages” (the native's note first, then one per C1 / C2 language), “Among the languages you are
> learning” (the other course languages), “From other languages” (folded: every other note); so every supported native
> (tr included) and every type has its note. **R2** — every note (and pitfall, subtlety, fun fact, feeling) is
> **structured**, in this Markdown subset only: paragraphs separated by a blank line; `- ` / `1. ` lists for two or more
> points; `**bold**` for the one key sentence or word; `*italic*` for a cited word; an example on its own line starting
> with `→ ` (`→ ich habe gegessen — έχω φάει`); no headings, links, HTML, tables, code. **R3** — **prompt 1 maps the word's
> parameters before any word is written**: `lang/<code>/WORD_PARAMETERS.md` (every part of speech, every parameter
> distinctive for its words, exhaustively), which prompt 2 turns into `wordFeatures` with `prominent` / `order`; every
> word then states every parameter (a value or `{"none": "<why>"}`), and `tools/validate_lang.py` checks the map, every
> word and the checklist of the language's type.

A language package is too big for one prompt: a single session runs out of attention long before the last word, and quality
drops where nobody looks. This playbook breaks it into **25 prompts**, each one a fresh Claude Code session in the repo,
in this order. Every prompt is self-contained, names the files it may touch, and ends with the same checks, so a session can
be repeated or resumed without the others.

**The shape of the work**

| # | Prompt | What it produces | Turns |
|---|---|---|---|
| 1 | Typology, phenomena, the word's parameters | the language's profile in `_typology/`, its catalogue of phenomena and **the map of its word parameters** (`WORD_PARAMETERS.md`, R3) | 2 (write, then audit) |
| 2 | The facade and the engine | `language.json` (every word parameter of the map, with prominent / order; paradigms), reference checks, script/keyboard/speech support, the language in `course.json` | 2 |
| 3–8 | Foundations F1–F6 | S00–S18: words, grammar pages, sentences | 2 each |
| 9–11 | Vegetables V1–V3 | the field, tiers 1–3 | 1–2 each |
| 12 | Core K1 | C01–C04 (and later K2–K12, one prompt per 4 lessons, as the core is written) | 2 each |
| 13 | Links across the course | seeAlso both ways, bridges, the note for `<code>` on the other languages' pages if `<code>` is a supported native | 1–2 |
| 14 | Audit | every check, a sample checked by hand, the app walked through | 1–2 |

Later, when the core grows: **K2–K12** (prompts 15–25), the same prompt as 12 with the next four lessons.
Later still, when the learners need them: **locale facades** (D19) — one task per locale, language and tier
(`lang.facade:<locale>:<code>:<tier>`, made by `tools/lang_facade.py task`), never before the master is neutral and complete.

**Turns.** Every content prompt is two turns: the first writes; the second is the audit prompt at the end of this file
("Audit what you just wrote"), in the same session, so the model checks its own work with the brief still in view.

**Branch.** Do the whole language on a branch `lang-<code>` and merge it into `main` when prompts 1–12 are done and the
suite is green. While a lesson is written in some languages only, the course keeps it out of the learner's way per language
(⏳); do not re-run `tools/lang_sources/core/mkcore.py` on `main` before the new language has the lessons the others have
(its draft list is course-wide).

**Placeholders.** Replace `<LANG>` (the name, e.g. Persian), `<code>` (ISO 639-1, e.g. `fa`), `<type>` (fusional /
agglutinating / isolating / polysynthetic) and `<course>` (e.g. `polyglot-semitic-zh-de`).

## One prompt: the skill and the connector

The same prompts, run by Claude itself from ONE sentence of the learner — *"add Persian to my polyglot course"* — in an
environment with a sandbox and sub-agents (Claude Code, or the Claude app / Cowork with code execution and the noema-lite
connector). docs/LANGUAGES.md §10.2 is the contract.

* **The skill** `skill/noema-language-builder/SKILL.md` (`noema-language-builder.zip`; also `LANGUAGE_BUILDER.md` in the
  noema-pack-builder toolkit) carries this playbook, the brief templates, `AGENT_BRIEF.md` and `mkbrief.py`, so it works
  without the repository. It unpacks the course into the sandbox (`lang_course.py unpack … --world`), runs prompts 1–14
  **in order, each as a fresh sub-agent** with its brief (`mkbrief.py … --course-dir work/lang/<course> --sandbox`: the
  repository paths become the sandbox's), gives every content step its audit turn, runs the checks after each step, keeps
  `work/<code>-progress.json` (a run that stops resumes at the first step not marked done), and at the end makes ONE file:
  `python3 scripts/lang_course.py package work/lang/<course> <code> -o work/<code>.langpack.json` (refused while
  `validate_lang.py --strict --lang <code>` has errors).
* **The upload**: `noema_lang_package_start` (course, code) → `curl` → `noema_lang_package_finish`, which checks the package
  exactly as the app does (`checkLangPackage`) and records it in the learner's account; the app adds the language to the
  course on every device (a lane, a chip, a row on the course home) and ⋮ › the language › *Remove this language* takes it
  away again.
* **Without the skill**: the connector's `noema_language_package_guide` (course, language) returns the same instructions
  specialised for that course and language — the batches with their node ids, the toolkit and course links, the upload —
  and the prompt **"Add a language to my course"** starts it in the Claude app.
* **In the sandbox, prompt 2 shrinks**: the engine (LANG_INFO, tokenizer, script module and keyboard, speech tag) is code
  of this repository; the skill reports what the language would need there and the app falls back to its defaults
  (Intl name, 🏳️ or the package's flag, space tokenization over the stored forms).
* **Scale and honesty**: ≈ 25 batches of hours of careful work. A plain chat without a sandbox cannot do it; the skill
  says so instead of trying. The audit turn is never skipped and no form is invented; the final report lists what was
  written, what is absent and what a native speaker should check.

---

## Prompt 1 — Typology, phenomena and the map of the word's parameters (R3: the first step)

```
Read docs/LANGUAGE_RULES.md (binding), then docs/LANGUAGES.md D13–D20, §4.11 and §4.7.1, and tools/lang_sources/AGENT_BRIEF.md.
We are adding <LANG> (<code>) to the course library/languages/<course>. This session writes ONLY:
1. library/languages/_typology/languages.json — the profile of <code> if it is missing: a value for EVERY feature of
   _typology/features.json (WALS-based; "unknown" only when sources disagree), its family, branch and type; check
   _typology/reference.json (add <code> to "languages" only if I ask; "supported" is the list of UI-locale languages).
2. library/languages/_phenomena/<code>.json — the complete catalogue of the language's phenomena for a learner of ANY
   background (D16): every feature it has AND lacks, tagged with typology {feature, value}, kind has|lacks, specific + alsoIn
   for things the tags only approximate, texts that name no language outside the course (D19: comparisons go into the
   phenomenon's notes — for supported natives and types — where they help), status "missing" and "when"
   left empty (nothing is taught yet), distinctions and polysemy for the words the course will need (look at
   core/fields/*.json glosses). Use the catalogues of the other course languages as models of depth and format.
   Notes are structured (R2: "- " lists, "→ " example lines, a blank line between paragraphs).
3. library/languages/<course>/lang/<code>/WORD_PARAMETERS.md — R3, before ANY word: the exhaustive map of the parameters
   distinctive for words of <LANG>, one "## <POS>" section per part of speech (NOUN, VERB, ADJ, ADV, PRON, DET, ADP, NUM,
   CCONJ, SCONJ, PART, INTJ, CLF … whatever the language has): for every parameter its id, what it records, its values,
   why it is learned with the word, its phenomenon, whether it can be "none" (and when), and its prominence on the word
   card (the most important first). From the catalogue (every phenomenon of level "word" is a parameter) and reference
   grammars. Examples of depth: Arabic nouns — every plural with the meanings it belongs to, dual, gender, human, root,
   pattern; German verbs — Präteritum, Partizip II, haben / sein, the present-tense vowel change, separable prefix, case
   government; Hebrew — binyan, root, construct form, plurals; Chinese — measure words, traditional forms, readings per
   sense, separable verbs. Cover the checklist of the language's type and profile (R3_CHECKLIST / R3_TYPE in
   tools/validate_lang.py).
Ground every claim (WALS, a reference grammar, Wiktionary via tools/lang_refcheck.fetch); leave out what you cannot ground.
Checks: python3 tools/lang_phenomena.py --lang <code> (no ❌), python3 tools/lang_facade.py lint library/languages/<course>
(nothing in _phenomena/<code>.json) and python3 tests/lang_rules.py. Commit on branch lang-<code>.
Report: number of phenomena by area, the parameters per part of speech, what you were unsure of.
```

## Prompt 2 — The facade and the engine

```
Read docs/LANGUAGE_RULES.md, docs/LANGUAGES.md §4.1, §4.5–§4.5.2, §4.9, §5.5, §7.2, §8 (Input, Text rendering) and §11,
and library/languages/_phenomena/<code>.json (written in the last session).
Add <LANG> (<code>) to library/languages/<course>:
1. lang/<code>/language.json: name, nativeName, script, dir, tokenJoin, vowelMarks / romanization, typology "<type>",
   citationCells and paradigmCells per POS and class (UniMorph tags as the other languages use), extraTags, and wordFeatures
   — EVERY parameter of lang/<code>/WORD_PARAMETERS.md (written in prompt 1), per POS (D14, R3), each tied to its
   phenomenon, with "prominent" (shown right under the word on the card) and "order" (the most important first); a
   checklist item that is not a word parameter in <LANG> goes into "wordFeaturesChecklist": {"<feature>": "<why>"}.
   Model it on the other languages' language.json; every phenomenon of level "word" in the catalogue must be recorded by
   a parameter.
2. The reference checker: tools/lang_refcheck.py must fetch and compare <code> (Wiktionary language name, tag mapping,
   vowel marks / plene spelling if the script has them). Test it on 20 common words.
3. The engine: LANG_INFO (name, flag, font) in engine/lang/00_base.js; tokenizer needs in engine/langcore.js (clitics,
   prefixes, segmentation for scripts without spaces); the script module and keyboard if the script is new (tools/lang_script.py,
   engine/lang/90_script.js); the speech tag (SPEECH_TAGS) — each with a test in the matching tests/lang_*.js file.
4. course.json: add "<code>" to languages (and to typology paths if its type is new: core/typology.json).
Do NOT write words, grammar pages or sentences yet. Checks: python3 tools/build.py site bundle; python3 tools/validate_lang.py
library/languages/<course> (0 errors; missing content is a warning; no R3 warning for <code>); python3 tests/lang_validate.py; node tests/langcore.js;
python3 tools/lang_phenomena.py --lang <code>. Commit. Report: the parameters per POS, what the engine needed.
```

## Prompts 3–8 — Foundations F1–F6

Batches: **F1** `fd.00,fd.01,fd.02,fd.03,fd.04` · **F2** `fd.05,fd.06` · **F3** `fd.07,fd.08,fd.09` · **F4** `fd.10,fd.11,fd.12` ·
**F5** `fd.13,fd.14,fd.15` · **F6** `fd.16,fd.17,fd.18`.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py foundations --course <course> --lang <code> --batch F<n> --nodes <nodes> > /tmp/brief.txt
Read /tmp/brief.txt completely before you start, then docs/LANGUAGE_RULES.md and every section it names. Work in this order,
one lesson at a time — D19 first (neutral texts, contrast notes): (A) the words of the lesson with their full facade and
profile, grounded in Wiktionary; (B) the grammar
page of each function of the lesson (status, blocks, ask yourself, traps, evidence, generators, seeAlso, typology tags —
neutral texts, and every grammar page with a contrast note for EACH supported native but <code> (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes type:fusional, type:agglutinating, type:isolating, type:polysynthetic, branch:Semitic (D19)); words that invite a comparison get profile.notes; every note structured (R2); every word states every parameter of WORD_PARAMETERS.md (R3); (C) the sentences (≥ 15 per lesson, every new word, every function in ≥ 8,
variant pairs); (D) the catalogue's status for what the lesson teaches. Run the checks after EACH lesson, not only at the end
(+ python3 tools/lang_facade.py lint library/languages/<course>: nothing of yours, no missing note on your pages).
Commit when all checks pass, and give the report the brief asks for.
```

## Prompts 9–11 — The vegetables field

Batches: **V1** `veg.1` · **V2** `veg.2a,veg.2b` · **V3** `veg.3a,veg.3b`.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py field --course <course> --lang <code> --batch V<n> --nodes <nodes> > /tmp/brief.txt
Read it completely, then the same field in the other course languages as models. A rare item without a real word is an
"absent" entry with what people say instead — never an invented word. D19: profiles name no language outside the course
(cognates and false friends → profile.notes for the supported natives). Commit when the checks pass (+ lang_facade.py lint);
report as the brief asks.
```

## Prompt 12 (and 15–25) — Core K1 (… K12)

K1 `cr.01,cr.02,cr.03,cr.04`, then K2 `cr.05…cr.08` … K12 `cr.45…cr.48` — only the lessons the other languages already have.

```
Make your brief and follow it exactly:
  python3 tools/lang_sources/mkbrief.py core --course <course> --lang <code> --batch K<n> --nodes <nodes> > /tmp/brief.txt
Read it completely. Before adding any word, search the <code> lexicon for the concept id (D15: a word you have may already
carry it as another meaning). D19 first: neutral texts; every grammar page with a contrast note for EACH supported native but <code> (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes type:fusional, type:agglutinating, type:isolating, type:polysynthetic, branch:Semitic (D19).
Work lesson by lesson (words → grammar pages → sentences → catalogue), checks after each lesson (+ lang_facade.py lint).
Commit when all checks pass; report as the brief asks.
```

## Prompt 13 — Links across the course

```
Read docs/LANGUAGE_RULES.md and docs/LANGUAGES.md §4.7 (seeAlso), §4.7.1, §4.10 and §9.
<LANG> (<code>) is now written in library/languages/<course>. Link it with the other languages — touching only the fields
named here:
1. seeAlso both ways: every grammar page of <code> points to the same point in the other course languages, and every other
   language's page of a function <code> also has gets a seeAlso to <code> (one line: what is parallel or different).
2. If <code> is a supported native (in "supported" of _typology/reference.json: en el ru fr ar de hi zh ja it es sq pt tr):
   a contrast note for <code> on EVERY grammar page of the other course languages (D19 requires it; concrete, correct, one
   to three sentences or a short structured list (R2), examples in <code>). seeAlso notes compare course languages only (they are general texts).
3. Bridges: cognates and loans between <code> and the other course languages that the etymologies support
   (tests/lang_poly.js shows how they are found); report false friends.
Checks: python3 tools/validate_lang.py library/languages/<course> --strict --lang <code>; python3 tools/lang_refcheck.py
library/languages/<course>; node tests/lang_poly.js .; commit; report the counts.
(The D19 rules are errors by default; --d19-lenient, which makes them warnings, is only for test fixtures — never for a course.)
```

## Prompt 14 — Audit

```
Audit <LANG> (<code>) in library/languages/<course> as a demanding reviewer, then fix what you find:
1. Run everything: python3 tools/build.py; bash tests/run_e2e.sh (long: run it in the background and poll the log).
2. Draw 40 random words and 40 random sentences of <code>; check each against Wiktionary (tools/lang_refcheck.fetch) and the
   grammar pages: forms, gender, plural, vowel marks / tones, the meaning of the sentence vs its gloss, the token annotation.
3. Open the course in the app (tests/lang_walkthrough.js shows how) with <code> active, phone 390 px and desktop: lessons,
   word cards, grammar pages, the session, ⫴ parallel lanes — the new lane must keep the same levels as the others.
4. D19: python3 tools/lang_facade.py lint library/languages/<course> (nothing for <code>), python3 tools/validate_lang.py
   library/languages/<course> --strict --lang <code>, python3 tools/lang_facade.py roundtrip library/languages/<course>;
   read 10 contrast notes and 10 type notes of <code> as a learner of that language / type would.
5. List what a native speaker should still check (idioms, register, regional words) in a short file
   docs/review/<code>-native-check.md.
Fix errors in place (smallest change), re-run the checks, commit. Report: what was wrong, what you fixed, what remains.
```

---

## The audit turn (the second turn of every content prompt)

```
Audit what you just wrote before we finish: (1) go through docs/LANGUAGE_RULES.md §C point by point for each file;
(2) pick 10 words and 10 sentences at random and check them again against Wiktionary and the grammar pages;
(3) look for words you used in sentences that have no lexeme, paradigm cells you left empty, glosses that do not match
the sentence, notes that compare with a language you are not sure about, a general text that names a language outside the
course or explains through English, a grammar page without a note for every supported native and type (D19; run
python3 tools/lang_facade.py lint), a long note squashed into one paragraph (R2), a word missing one of its parameters
(R3); (4) fix, re-run the checks, amend the commit,
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
