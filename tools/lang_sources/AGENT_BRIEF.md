# Preamble of every brief for a language-course task (copy it to the top of the brief)

You work on the language courses of noema-lite. **`docs/LANGUAGE_RULES.md` is binding for you** — read it before anything
else, then the sections of `docs/LANGUAGES.md` your task touches. In short:

- **D19 FIRST — taught through the learner's native language** (`docs/language-packs.md`). Every learner reads the
  explanations in their native language (supported: **en el ru fr ar de hi zh ja it es sq pt**, the UI locales' languages)
  and gets comparisons with THAT language only — or with its type / branch / family. So every general text you write
  (summary, blocks, procedure, traps, quiz, seeAlso, facts, word profiles, `features.*.none`, phenomena, titles) names
  **no language outside the course** and explains nothing through English grammar ("no ‘do’", "-ing", "is not ‘the’");
  it says what the language does. Every comparison is a **contrast note** `{for, rel, text}`: on **every grammar page**
  one for each supported native except the page's own language + `type:fusional`, `type:agglutinating`,
  `type:isolating`, `type:polysynthetic`, `branch:Semitic` (a type note names no language); `profile.notes` on a word
  that invites a comparison; `notes` on phenomena. A note names only its own language (examples in it, in its script),
  the course languages and the point. Notes are written in English (the master); the locale facades
  (`facades/<locale>/`) are separate tasks. Etymologies may name a source language ("borrowed from Persian").

- **D13 one common order** — never teach a subject (node, grammar function, concept) earlier or later in one language than
  in the others; a needed move is reported, not made.
- **D14 phenomena and facades** — the language's catalogue of phenomena (`library/languages/_phenomena/<code>.json`) is read
  first and updated for what you add; every word you write states every parameter its language declares for its part of
  speech (`wordFeatures`), several words for one concept each give `contrasts`.
- **D15 meanings** — every distinct meaning of a word is a concept (pending if not taught yet); nuances say `of`.
- **D16 no point of view** — learners may speak any language: describe what the language does, never "unlike English /
  as in Greek"; what is familiar for a learner is computed from the typology (`library/languages/_typology/`).
- **D18 / D19 notes** — comparisons go into `notes` (`for`: a supported native / `type:` / `branch:` / `family:`); the
  supported natives and the five type notes are listed in `library/languages/_typology/reference.json` (`supported`,
  `types`); notes for other languages (fa, tr, ko …) are kept as source material and never shown.
- **D20 vocabulary track** — sentences for grammar and the other aspects may use any word of the lexicon (≤ ⌈30 %⌉
  unknown to the learner at run time); every word you use exists with its full facade; a field brings ≥ 2 sentences for
  every non-vocabulary node before it.
- **D9–D12, D17** — complete thematic groups, words that combine, the grammar per type, the open-ended course.
- **Correctness first** — ground every form and fact (Wiktionary via `tools/lang_refcheck.py` `fetch`, WALS, grammars);
  leave out what you are not sure of; edit only the files your task allows; report doubtful cases.

Before you finish (all must pass for your language):
```
python3 tools/validate_lang.py library/languages/<course> --strict --lang <code>
python3 tools/lang_refcheck.py library/languages/<course> --lang <code>
python3 tools/lang_phenomena.py --lang <code>
python3 tools/lang_facade.py lint library/languages/<course>      # D19: nothing in your files
node tests/lang_courses.js
```
Then go through the checklist in `docs/LANGUAGE_RULES.md` §C and say in your report that you did.
