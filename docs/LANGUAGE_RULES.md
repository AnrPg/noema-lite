# 🌍 Binding rules for everything that touches the language courses

**Who must follow this file:** every agent and every person that writes code, content, briefs, tools or designs for the
language courses — Claude Code sessions, Cowork sessions, subagents that write words, grammar or sentences, the Claude
skill (`noema-pack-builder`), the connector's tasks, and anyone merging the `languages` branch. It is the short, binding
form of the decisions D1–D17 in `docs/LANGUAGES.md` (the full contract). If the two ever disagree, `docs/LANGUAGES.md`
wins and this file is fixed in the same commit. `tests/lang_rules.py` fails when a decision of `docs/LANGUAGES.md` is
missing here or when one of the places below does not point to this file.

Where it is enforced: `CLAUDE.md` and `AGENTS.md` (read by code agents), `README.md` (🌍 Languages), the skill
(`references/LANGUAGE_RULES.md` in the skill zip, step "Language courses" in `SKILL.md`), the content-agent brief
(`tools/lang_sources/AGENT_BRIEF.md`, which every brief for a language task starts with), and the validators
(`tools/validate_lang.py`, `tools/lang_phenomena.py`, part of `tests/run_e2e.sh` and of `tools/build.py`).

## A. Process
1. **Contract first.** A change to the plan is written in `docs/LANGUAGES.md` (decision table §1, the section it concerns,
   a changelog entry in §14) and in this file **before** the code or content changes.
2. **Branch.** Language work happens on `languages` (worktree `~/Documents/MyApps/noema-lite-lang`). Push only when the
   user asks; Netlify publishes `main` only. Merge into `main` only at a usable milestone, with the whole suite green and
   the user's approval. Never switch the checkout of a worktree someone else is using; commit with plumbing if needed.
3. **Green before commit.** `python3 tools/build.py` and `bash tests/run_e2e.sh` pass; for content: the validator with
   `--strict`, `tools/lang_refcheck.py` (no unresolved disagreement), `tools/lang_phenomena.py` (no ❌).
4. **No secrets** in files, briefs or commits; never the user's e-mail in requests to other services.
5. **Correctness over speed.** Every form, gender, plural, vowel mark, tone, example and fact is grounded (Wiktionary via
   `lang_refcheck.fetch`, WALS, reference grammars). Leave out what you are not sure of; `ref.override` only with a reason.

## B. Model and content — the decisions
- **D1** Explanations in the course's `explainLang` (default English); the tutor in `chatLang`.
- **D2** Progress is per language; the concept DAG is shared.
- **D3** Automatic exercises use only stored, validated data (bank, paradigms); an LLM never writes an answer key.
- **D4** Pilot languages ar, he, zh, de — the rules hold for every language added later.
- **D5** Explicit paradigm tables per word, checked against reference data.
- **D6** UniMorph tags and UD parts of speech everywhere.
- **D7** Spaced repetition with two tracks (recognition, production).
- **D8** Listening and speaking later (P9).
- **D9** Foundations first: mixed lessons (words + grammar + sentences), complete thematic groups, words that combine.
- **D10** Paths by language type (isolating, agglutinating, fusional, polysynthetic) walking the **same steps**; per-type
  grammar inside the step; links to the same point in the other languages.
- **D11** Lesson S00 is the overview: the four types, the language, its peculiarities, a quiz.
- **D12** The foundations teach the basics of verbs, cases, clauses, aspect, mood; the core grammar follows.
- **D13** **One common order.** Every subject (node, grammar function, concept) common to several language paths — of
  every course and of every language type — keeps the same place in all of them. Extra or missing steps are fine;
  opposite orders are not. A subject moves in all languages at once, after analysing every path, or not at all.
- **D14** **Phenomena first, facades complete.** A new language starts with its catalogue of phenomena
  (`library/languages/_phenomena/<code>.json`) and its `wordFeatures`; every word states every parameter of its part of
  speech (a value or `{"none": "<why>"}`); several words for one concept each give `contrasts` (one axis per concept).
- **D15** **Every distinct meaning is a concept** (pending until a node teaches it); nuances say `of`; each meaning's view
  of a word shows the others, with their own forms.
- **D16** **No built-in point of view.** Learners may speak any language. Describe each language neutrally as values of the
  shared typology (`library/languages/_typology/`), cover every feature it has **or lacks**, never write "unlike English /
  as in Greek" in general texts; what is new or familiar is computed from the learner's languages.
- **D17** **The course never ends.** Foundations (S00–S18) → the core (C01–C48, parallel lessons that reach B1–B2) →
  the advanced stage: open-ended modules (exhaustive fields, advanced grammar, registers and varieties, idioms, reading
  and writing, culture) added indefinitely, each placed on the common order (D13) and written to all the rules above.

## C. Checklist for every task (copy it into every brief)
- [ ] I read `docs/LANGUAGE_RULES.md` and the sections of `docs/LANGUAGES.md` my task touches.
- [ ] Nothing I add or move breaks the common order of any language of any course (D13) — the validator checks it.
- [ ] Every word I write states its whole facade, every meaning is a concept or `of`, every shared concept has contrasts (D14, D15).
- [ ] My texts describe the language, not a comparison with one other language (D16); comparisons with the learner's
      languages go only where the model asks for them (`forYou`) or are computed.
- [ ] I grounded every fact; the validator (`--strict`), refcheck and `lang_phenomena.py` pass; the catalogue of
      phenomena is updated for what I added (status, gap).
- [ ] I touched only the files my task allows, and reported doubtful cases.
