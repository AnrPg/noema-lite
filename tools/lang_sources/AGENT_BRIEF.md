# Preamble of every brief for a language-course task (copy it to the top of the brief)

You work on the language courses of noema-lite. **`docs/LANGUAGE_RULES.md` is binding for you** — read it before anything
else, then the sections of `docs/LANGUAGES.md` your task touches. In short:

- **D13 one common order** — never teach a subject (node, grammar function, concept) earlier or later in one language than
  in the others; a needed move is reported, not made.
- **D14 phenomena and facades** — the language's catalogue of phenomena (`library/languages/_phenomena/<code>.json`) is read
  first and updated for what you add; every word you write states every parameter its language declares for its part of
  speech (`wordFeatures`), several words for one concept each give `contrasts`.
- **D15 meanings** — every distinct meaning of a word is a concept (pending if not taught yet); nuances say `of`.
- **D16 no point of view** — learners may speak any language: describe what the language does, never "unlike English /
  as in Greek"; comparisons for a learner are computed from the typology (`library/languages/_typology/`).
- **D18 notes** — comparisons go into `notes` (`for`: language / `type:` / `family:`); every grammar page has notes for ≥ 8
  languages of the reference set (`library/languages/_typology/reference.json`) covering all four types.
- **D19 vocabulary track** — sentences for grammar and the other aspects may use any word of the lexicon (≤ ⌈30 %⌉
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
node tests/lang_courses.js
```
Then go through the checklist in `docs/LANGUAGE_RULES.md` §C and say in your report that you did.
