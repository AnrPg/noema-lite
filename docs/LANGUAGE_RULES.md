# 🌍 Binding rules for everything that touches the language courses

**Who must follow this file:** every agent and every person that writes code, content, briefs, tools or designs for the
language courses — Claude Code sessions, Cowork sessions, subagents that write words, grammar or sentences, the Claude
skill (`noema-pack-builder`), the connector's tasks, and anyone changing the language part. It is the short, binding
form of the decisions D1–D25 in `docs/LANGUAGES.md` (the full contract). If the two ever disagree, `docs/LANGUAGES.md`
wins and this file is fixed in the same commit. `tests/lang_rules.py` fails when a decision of `docs/LANGUAGES.md` is
missing here or when one of the places below does not point to this file.

> **First rule — D19: every language is taught through the learner's native language** (contract: `docs/language-packs.md`).
> Supported natives = the languages of the UI locales: **en el ru fr ar de hi zh ja it es sq pt tr**. A learner with a
> supported native reads every explanation in it; any other learner reads the UI language and gets the note for the
> type / branch / family of their language. So everything you write is
> **neutral** — a general text (summary, blocks, traps, procedure, quiz, seeAlso, facts, word profiles, `features.*.none`,
> phenomena, typology, titles) names **no language outside the course** and never explains through English grammar
> (no "no ‘do’", "-ing", "is not ‘the’") — and every comparison is a **contrast note** `{for, rel, text}`: on **every
> grammar page** one for each supported native except the page's language, plus `type:fusional`, `type:agglutinating`,
> `type:isolating`, `type:polysynthetic`, `branch:Semitic` (a type note names no language); `profile.notes` on words;
> `notes` on phenomena. Notes are written in English (the master) with examples in the note's own language; provenance
> ("borrowed from English") is allowed in etymologies. Locale facades (`facades/<locale>/`) are separate, later tasks.
> Check: `python3 tools/lang_facade.py lint <course>`; `tools/validate_lang.py` (errors by default since 2026-10-11; `--d19-lenient` makes them warnings).
>
> **R1–R3 (2026-10-11, with D19; `docs/language-packs.md` §2.2–§2.4).**
> **R1** — comparisons are shown in **three sections**: “From your languages” (the native's note **first**, then one per
> language the learner speaks at **C1 / C2**; an unsupported native: its `branch:` ▸ `family:` ▸ `type:` note), “Among the
> languages you are learning” (the other course languages), “From other languages” (**folded**, every other note). So:
> a note for **every** supported native (tr included) and every type; a locale facade translates **all** notes.
> **R2** — a note (and pitfalls, subtleties, fun facts, feeling) is **structured**, in this Markdown subset only:
> paragraphs separated by a blank line · `- ` / `1. ` lists for two or more points · `**bold**` for the one key sentence
> or word · `*italic*` for a cited word · an example on its own line starting with `→ ` — no headings, links, HTML,
> tables or code. Example: `"Like Greek, German builds the perfect with **have + participle**.\n\n→ ich habe gegessen — έχω φάει"`.
> **R3** — **first step of a language package, before any word**: the exhaustive per-part-of-speech map of the word's
> distinctive parameters — `lang/<L>/WORD_PARAMETERS.md` (a section per POS naming every parameter: values, why it is
> learned with the word, its phenomenon) + `language.json` `wordFeatures` (with `prominent` / `order`, the most important
> first). Every word states every parameter of its POS (a value or `{"none": "<why>"}`). The validator checks the map,
> every word, and the checklist of the language's type (`wordFeaturesChecklist` says why an item is not a word parameter).

Where it is enforced: `CLAUDE.md` and `AGENTS.md` (read by code agents), `README.md` (🌍 Languages), the skill
(`references/LANGUAGE_RULES.md` in the skill zip, step "Language courses" in `SKILL.md`; the skill
`noema-language-builder`, which adds a whole language as a package — docs/LANGUAGES.md §10.2: D13–D20 apply to a package
exactly as to the library), the content-agent brief
(`tools/lang_sources/AGENT_BRIEF.md`, which every brief for a language task starts with), and the validators
(`tools/validate_lang.py`, `tools/lang_phenomena.py`, part of `tests/run_e2e.sh` and of `tools/build.py`; for a language
package `tools/lang_course.py package` and `langcore.checkLangPackage`, which the connector and the app run).

## A. Process
1. **Contract first.** A change to the plan is written in `docs/LANGUAGES.md` (decision table §1, the section it concerns,
   a changelog entry in §14) and in this file **before** the code or content changes.
2. **Branch.** The language part lives on `main` (merged with its history on 2026-10-10; the `languages` branch is gone).
   Netlify publishes `main`, so a change lands there only with the whole suite green; larger work goes on a short-lived
   branch merged back. Push only when the user asks. Never switch the checkout of a worktree someone else is using.
3. **Green before commit.** `python3 tools/build.py` and `bash tests/run_e2e.sh` pass; for content: the validator with
   `--strict`, `tools/lang_refcheck.py` (no unresolved disagreement), `tools/lang_phenomena.py` (no ❌).
4. **No secrets** in files, briefs or commits; never the user's e-mail in requests to other services.
5. **Correctness over speed.** Every form, gender, plural, vowel mark, tone, example and fact is grounded (Wiktionary via
   `lang_refcheck.fetch`, WALS, reference grammars). Leave out what you are not sure of; `ref.override` only with a reason.

## B. Model and content — the decisions
- **D1** Explanations are written once in the **master facade** (English, `explainLang: "en"`); each learner reads them
  in their explanation locale (native if supported, else the UI language — D19) through the locale facades; the tutor
  in `chatLang`, else the explanation locale.
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

- **D18** **The learner's languages decide what is explained.** Settings list the learner's languages with levels;
  the native one makes parts familiar (hidden in one line, naming no other language — D19); a language without a profile
  is inferred from its family or type. Every grammar page carries **contrast notes** for every supported native and the
  five type notes (D19); the older reference set (fa, mr, tr, ko, fi, hu, sw, lg, vi, iu) is kept as source material,
  never shown; Claude / Gemini may add a note for an unsupported native only on the learner's request with their key. The
  peculiarities of each language form a free library.
- **D19** **Taught through the learner's native language.** Explanations in the native language if supported (else the UI
  language), comparisons with it only (else with its type / branch / family); no English or other outside language as a
  reference point. Neutral core + neutral English master + contrast notes for every supported native and type (required
  on every grammar page; `profile.notes`; phenomenon `notes`) + locale facades (`facades/<locale>/`, addresses in
  `tools/schemas/noema.langfacade.fields.json`, made with `tools/lang_facade.py task`, checked with `parity` / `lint`).
- **D20** **Vocabulary is its own track; every other aspect uses any vocabulary.** Sentences prefer the learner's known
  words but may contain unknown ones — at most ⌈30 %⌉ of the words, in production too — shown with 🆕, the word card on
  hover / tap and a list at the end of the lesson. Every word used anywhere has its full facade. Every field brings
  ≥ 2 sentences for every non-vocabulary node before it on the common order (or a reason in `fieldExemptions`).
- **D21** **The learner chooses the languages to study** (one, several or all; `a:settings.studyLangs`, for the whole app).
  A course teaches only the chosen languages it has — every view, generator, comparison, polyglot item, tutor context and
  Claude task works among them only; the progress of the others is kept. Content is still written for every language of a
  course (a learner may choose any of them); code never assumes all course languages are studied (`activeLangs()`, `C.languages`).
- **D22** **Vocabulary and theory are two tracks, each read-then-practise.** Vocabulary = the lesson's words with all that belongs
  to a word (forms, etymology, phonology, collocations, register, uses in context). Theory = everything else (grammar,
  syntax, culture, script, pragmatics). A lesson is a ladder of four steps, each opening when the one before is done:
  words: lesson → words: practice → theory: reading → theory: practice (+ the check). Words first. One “Continue” button
  names the next step; never one button for both (“Μάθε”). Write every lesson so that it splits this way (words in `lexicon`,
  points in `functions`; nothing of a word's facade only in a grammar page, nothing of grammar only in a word card).
- **D23** **In the foundations (S00–S18) only words taught so far appear** in examples, sentences, drills and checks: the
  words of this lesson or an earlier one on the common order — no unknown share (D20's ⌈30 %⌉ starts at C01). Write
  bank sentences for a foundation function with only such words; the validator lists, per language and lesson, how many
  sentences are usable (fewer than 6 is a gap to fill). A word that appears before its lesson is shown with the **new-word
  marker** (dotted amber underline, “new word” on hover; computed per learner by the app — nothing to write in the data).
- **D24** **Transliteration is always shown in the foundations** for every non-Latin-script language: every word the learner
  sees in S00–S18, and the word card of every word that appears there, carries `translit` (pinyin with tone marks for
  zh) — a small line under the word; the learner can hide it with a toggle. A foundation word without `translit` /
  `pinyin` is an error.
- **D25** **The languages loaded decide what the app shows**: titles, addresses (`#/lang`, never a list of languages),
  chips, comparison, map flags, lanes, today's languages, tutor context come from the languages studied now. A lesson
  title names its subject, never a language; code never assumes all course languages are loaded (`activeLangs()`).

## C. Checklist for every task (copy it into every brief)
- [ ] I read `docs/LANGUAGE_RULES.md` and the sections of `docs/LANGUAGES.md` my task touches.
- [ ] Nothing I add or move breaks the common order of any language of any course (D13) — the validator checks it.
- [ ] Every word I write states its whole facade, every meaning is a concept or `of`, every shared concept has contrasts (D14, D15).
- [ ] **D19 first:** my general texts name no language outside the course and explain nothing through English (D16,
      D19); every comparison is a note (`for`: a supported native, `type:…`, `branch:…`, `family:…`); every grammar page
      I write has a note for **each supported native** (en el ru fr ar de hi zh ja it es sq pt tr, without the page's own
      language) and `type:fusional`, `type:agglutinating`, `type:isolating`, `type:polysynthetic`, `branch:Semitic`;
      words that invite a comparison get `profile.notes`; `python3 tools/lang_facade.py lint <course>` shows nothing of mine.
- [ ] **R2:** every note (and pitfall, subtlety, fun fact, feeling) of more than one point is structured — `- ` lists,
      `→ ` example lines, a blank line between paragraphs, at most two `**bold**`; no headings, links, HTML, tables, code.
- [ ] **R3:** a new language starts with `lang/<L>/WORD_PARAMETERS.md` + `wordFeatures` (`prominent`, `order`) — before
      any word; every word I write states every parameter of its part of speech (a value or `{"none": "<why>"}`).
- [ ] Every word in my sentences is in the lexicon with its full facade; a field I write brings sentences for every
      non-vocabulary node before it (D20).
- [ ] **D22–D24:** a lesson's words and its theory are separate (words in the lexicon with their whole facade, points in
      functions); every sentence, example and exercise of S00–S18 uses only words of this lesson or earlier; every foundation
      word of a non-Latin-script language has `translit` / `pinyin`; titles name subjects, not languages (D25).
- [ ] I grounded every fact; the validator (`--strict`), refcheck and `lang_phenomena.py` pass; the catalogue of
      phenomena is updated for what I added (status, gap).
- [ ] I touched only the files my task allows, and reported doubtful cases.
