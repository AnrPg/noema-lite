# 🌍 Languages — learning foreign languages from scratch to mastery (several in parallel)

> **Status: design accepted 2026-10-07 — this file is the contract; its binding short form for every agent is `docs/LANGUAGE_RULES.md`.** Claude follows it when building the
> language part of noema-lite. A change to the plan is first made **here** (and noted in §14 Changelog),
> then in the code. Every phase ends with the full test suite green, the files in the Mac repo and a commit.
>
> **Hard constraint (D13, §4.4.3) — the parallel order.** All the language paths of the app (every language of every
> course, and the path of each language type) keep one common order of the subjects: a path may add steps of its own
> or skip some, but no subject comes after a common subject in one path and before it in another. Every new language,
> node or move is designed with **all** the paths in view; a subject moves in all languages at once or not at all.
>
> **Hard requirements (D14–D19).** A new language starts with its **typological profile** and its **catalogue of phenomena** (§4.11), written for a learner of ANY background (every feature it has or lacks, no built-in point of view). Every word states
> its language's whole **facade** (`features` per `wordFeatures`, a value or `none` with a reason); several words for one
> concept say what separates them (`contrasts`); **every distinct meaning of a word is a concept** (pending until taught),
> and each meaning's view of the word shows the others.

| Phase | What | Status |
|---|---|---|
| P0 | Spec, schemas, validator, mini fixture course | ✅ 2026-10-07 |
| P1 | `langcore` runtime (pure JS): model, states, scheduler, gating, known sets, form index, script utilities | ✅ 2026-10-07 |
| P2 | Pilot content v1 (ar, he, zh, de; explanations in English): core spine 1 + vegetables I–III | ✅ 2026-10-08 (the next core nodes continue as content batches alongside P3+) |
| P3 | UI shell + vocabulary lane + flag cards + field maps + daily session | ✅ v1 2026-10-08 · P3b ✅ 2026-10-09 (pictures shown, picture → word, field sorting, principal-parts drill, progress across devices) — tech debt: the pictures themselves (§13.1) |
| P3c | **Foundations** (D9–D12): S00 = overview of the language types and of the language; 19 parallel steps of mixed lessons (complete thematic word groups + grammar + first sentences), the grammar of each step per language type; grammar pages with links across the languages; sentence exercises | ✅ 2026-10-08 (ar, he, zh, de: S00–S18 written, validated `--strict`, ref-checked) |
| P3d | **Rules across all languages** (D13–D15): the parallel order as a validated constraint; the catalogue of phenomena of every language (ar, he, zh, de); the facade of every word (`wordFeatures` / `features`); contrasts; every meaning a concept | ✅ 2026-10-08 |
| P4 | Script modules (Arabic, Hebrew, Chinese) + keyboards + RTL | ⬜ |
| P5 | Grammar lane: functions, paradigms, decision procedures, generators, feasibility, bank refills | ⬜ |
| P6 | Polyglot layer: comparisons, bridges, confusables, parallel exercises, interleaved sessions | ⬜ |
| P7 | Production and reading: translation, guided writing, graded readers, tutor language mode | ⬜ |
| P8 | Course creation and generation through Claude (app queue + connector + skill + refcheck) | ⬜ |
| P9 | Listening and speaking (later) | ⬜ later |

## 0. Development isolation (until the feature is finished)

The app in use must never be affected or left half-done by this work.

* **Separate branch and folder.** All language work happens on the git branch **`languages`**, checked out as a
  git worktree in **`~/Documents/MyApps/noema-lite-lang`**. The folder `~/Documents/MyApps/noema-lite` stays on
  **`main`**: it is the app you use, and it is what Netlify publishes (production branch = `main`).
* **Pushed only as a backup, when you ask** (first asked 2026-10-08). Netlify branch deploys stay off, so the website
  never shows it; only `main` is published.
* **Additive code.** New files for everything (`engine/langcore.js`, `engine/lang/*`, `tools/*lang*`,
  `library/languages/`, `tests/lang*`). Existing files are touched only at registration points (the build lists,
  `index.html`, the subject picker), and only for courses with `kind: "language"`; ordinary subjects and curricula take
  exactly the same code paths as before.
* **Own storage namespace.** Learner state lives only in `…:s:<course>:lang:*` keys (§5.6); no existing key changes format.
  While developing, the branch copy is opened with a local test profile, not the cloud account; automated tests use the
  Supabase emulator.
* **Main keeps moving.** Fixes made on `main` are merged into `languages` regularly (`git merge main`), so the merge back is small.
* **Merging back** only when a usable milestone is complete (P3 at the earliest), the whole test suite (old + new) is
  green, and you say so. Until then `main` gets no language code.

---

## 1. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Language of the explanations | Chosen by the user **when the course is created in Claude**; default **English**. Stored as `course.explainLang`; every gloss, rule text, trap, feedback text of the course is written in it and the app shows it in that language. The tutor writes in `chatLang` (⚙️ Settings) if set, otherwise in `explainLang`. |
| D2 | Vocabulary gating | **Per language.** The concept DAG is shared, but every language has its own node and item states; a node can be mastered in German and still be locked in Hebrew. |
| D3 | How dynamic exercises are made | **Correctness and robustness first** (§7): (A) a sentence bank written by Claude offline, annotated token by token and validated against the paradigms; (B) deterministic drills generated from stored paradigms; (C) Gemini only for **open production grading** and the tutor — never as the answer key of an automatically graded exercise. When the bank is too thin for what the learner knows, the app queues a **refill task** for Claude (validated, merged additively). |
| D4 | Pilot languages | **Arabic (MSA), Hebrew (Modern), Chinese (Mandarin, simplified + traditional variant), German**; explanations in English. |
| D5 | Morphology source of truth | **Explicit paradigm tables per lexeme** (generated by Claude, cross-checked against reference data), not a rule engine. Rules exist as explanations and decision procedures only. |
| D6 | Feature vocabulary | **UniMorph** feature tags (`N;DAT;PL`, `V;PST;3;SG;MASC`) and Universal Dependencies POS; one vocabulary for all languages. |
| D7 | Scheduler | SM-2-style spaced repetition with day granularity, **two tracks per item**: recognition (R) and production (P). |
| D8 | Listening/speaking | Later (P9). Browser speech synthesis (free, has ar/he/zh/de voices on macOS) is the first step. |
| D9 | Where a course starts (2026-10-08, asked by the user) | **Foundations first.** A course opens with an ordered chain of **mixed lessons** (node kind `lesson`) that teach vocabulary, grammar and syntax *together*, so the learner builds simple sentences from the first day (§4.4.1). **Every lesson carries a complete thematic group of words** (when *brother* comes, the whole family comes, the extended family included; when time comes, all the days of the week, the months and the seasons), and the words of the foundations are chosen **to work together**: the verbs take the nouns already taught (eat bread, drink tea, go to school, read a book), the adjectives fit those nouns and the people (a big house, hot coffee, a young teacher). The grammar includes the core prepositions *in/at/to, from, with* (Greek σε, από, με) and the linking words. After the foundations the thematic fields (nouns, adjectives, verbs in exhaustive groups) and the rest of the course follow. Where a language lacks a category, the lesson says so explicitly and teaches what the language does instead (`status: absent / periphrastic`, §4.7). |
| D10 | Paths by language type — as parallel as possible (2026-10-08, asked by the user; revised the same day) | Every language declares its morphological type in `language.json` (`typology`: `isolating` (analytic) · `agglutinating` · `fusional` · `polysynthetic`), and **each type has its own path through the foundations — but all paths walk the same steps** (S00–S18, §4.4.1): the same theme, the same words and the same communicative goal at the same time in every language, so a polyglot learns *brother*, *Monday* or *I don't* in all their languages together. What differs per type is the **grammar of each step**: a lesson lists the functions for every language (`"*"`) and the extra ones of a type or of a language (`"isolating"`: tones, measure words, word order, aspect; `"agglutinating"`: personal suffixes, vowel harmony, possessive and case suffixes; `"fusional"`: gender, agreement, cases, conjugation tables; `"ar"`, `"he"`: roots and patterns; `"polysynthetic"`: person markers on the verb, noun incorporation). Where parallel teaching would not help, the lesson still **points to the same teaching point in the learner's other languages** (the function page shows how each course language does it, with links; a realization may add `seeAlso` notes, §6.7). A whole extra lesson for one type or language is possible (`path`, `langs` on the node) but is the exception; it sits between the common steps without changing their order (D13). |
| D11 | The first lesson (2026-10-08, asked by the user) | **Lesson S00 of every language is an overview**: the four morphological types explained with examples (shared text, `core/typology.json`), then the language itself — family, script and direction, sounds/tones, where it stands among the types and why, **its peculiarities that matter from the very beginning** (e.g. no *to be* in the present, roots of three consonants, unwritten vowels, three genders and four cases, tones, measure words, vowel harmony), what will be easy or hard given the languages the learner already knows (`course.knownLanguages`), how its path through the steps differs from the other types — and a short quiz. Greetings come right after the personal pronouns (S02). |
| D12 | Verbs, cases, clauses, aspect and mood — how much in the foundations (2026-10-08, asked by the user) | The foundations teach the **basics** of each, in the form of the language's type (fusional: conjugation and declension tables; agglutinating: the suffixes; isolating: particles and word order; polysynthetic: the markers inside the verb): **the present tense in all three persons, singular and plural** (S07); **cases** — what a case is and the subject form, the nominative (S04), the direct object, the accusative, with transitive verbs (S07), the cases after prepositions with *where / where to / where from* (S11–S13); **mood** — statements, questions (S09, S10) and the imperative (S13); **clauses** — joined and subordinate clauses with the linking words (S18); **aspect** only where the language needs it from the start (Chinese 了 / 过, S14). Right after the foundations comes the **core grammar** (§4.4.2: past and aspect, future, two objects and the dative, modal verbs, wishes and the subjunctive / conditional, relative clauses, reflexive verbs), taught in the same parallel way, alongside the thematic fields. |
| D13 | **The parallel order — a hard constraint** (2026-10-08, asked by the user) | All the language paths of the app — every language of every course, and the path of every language type (the path a language still to come would walk) — keep **one common order of the subjects**. Lay the paths side by side: a subject they share (the same node, grammar function or concept) sits at the same place in all of them; a path may have extra steps of its own between two common subjects, or lack some, and then its line simply stretches to the next common subject. **No subject x comes after a common subject y in any path if x comes before y in at least one path.** When a subject should move (because it helps the learning), it moves in **all** languages at once, after analysing every path (§4.4.3). Enforced by `validate_lang.py` against all the courses of `library/languages`. |
| D14 | **Every language first gets its catalogue of phenomena, and every word its language's "facade"** (2026-10-08, asked by the user) | The course stores **concepts**; each language gives a concept its own **facade**: the word(s) and the **parameters this language needs for such a word** (Arabic nouns: root, pattern, the plurals — several, each tied to its meanings —, dual, human or not, diptote …; Hebrew: binyan, construct forms, root class …; Chinese: measure words, readings and traditional forms per meaning, splitting verbs …; German: plural class, auxiliary, case frame, separable prefix …). The parameters are declared per part of speech in `language.json` (`wordFeatures`, §4.5.1) and **every word states each of them** — a value, or `{"none": "<why>"}` — in its `features`. Before a language is added, its **catalogue of phenomena** is written first (`library/languages/_phenomena/<code>.json`, §4.11): everything special or uncommon about it (and notable things shared with others), how the app records and teaches each one, and what is still missing; the declarations and the course are built from it, and the catalogue keeps track of the coverage. **Concepts may be augmented or reduced per language**: a language adds its own concepts and words (roots, measure words, particles), lacks others (`absent`), or **splits** one concept into several words by an axis other languages do not mark (zh 还是 / 或者 "or", 如果 / 是否, 拿 / 带; ar paternal / maternal uncle; de gehen / fahren) — every such word then says what separates it (`contrasts`, §4.5.2). |
| D15 | **A word with several meanings belongs to several concepts** (2026-10-08, asked by the user) | Every distinct meaning of a word is its own concept (天 = day **and** sky; بَيْت = house **and** verse of a poem, with its own plural أَبْيَات; Bank = bank **and** bench, with the plurals Banken / Bänke). A meaning that the course does not teach yet is a **pending concept** (in its field, without a node, §4.3), so the word already belongs to it and the course can place it later. A nuance or use of the same meaning is not a new concept: the sense says `of` the sense it belongs to. Wherever the word is shown for one of its meanings, the **other meanings are shown with it** (with their forms when they differ: another plural, reading, traditional character, auxiliary), linked to their concepts. |
| D16 | **No built-in point of view: what is special depends on the learner** (2026-10-08, asked by the user) | Whether something in a language is "strange" depends on who learns it: suffix chains are nothing new to a Turkish speaker but new to a Chinese one; a Turkish speaker finds Russian's fused endings and stem changes odd; a Vietnamese speaker learning German must learn that pitch does **not** change a word. Learners may speak any language — Indo-European, Semitic, Sino-Tibetan, Turkic, Uralic, Japonic, Bantu, Eskimo-Aleut, Austronesian … So a language is described **neutrally and completely** as values of one shared typological vocabulary (`library/languages/_typology/features.json`, 130 features after WALS), every language of the world the learners may speak has a profile (`_typology/languages.json`, 74 languages of 20 families), and the catalogue of phenomena covers **every** feature of the vocabulary for its language — what it has, and what it lacks (`kind: "lacks"`: no tones, no articles, no gender …), common or rare. What is new, familiar or missing **for a given learner** is computed from the learner's own languages, never written from one viewpoint. |
| D17 | **The course never ends — a large core, then open-ended advanced modules** (2026-10-08, asked by the user) | After the foundations (S00–S18, A1) comes the **core**: 48 parallel lessons C01–C48 from A2 to B2 (§4.4.2), each a complete thematic word group with its grammar per type. After the core the **advanced stage** grows indefinitely (§4.4.4): exhaustive fields, advanced grammar, lexicon depth, varieties and registers, texts, culture — every module on the common order (D13) and written to D9–D16. **Every agent, tool and skill that touches the language courses follows `docs/LANGUAGE_RULES.md`** (the binding short form of D1–D17), enforced by `CLAUDE.md` / `AGENTS.md`, the skill, the content-agent brief and `tests/lang_rules.py`. |
| D18 | **The learner's own languages decide what is explained** (2026-10-09, asked by the user) | In ⚙️ Settings the learner lists the languages they know, with a level (native, C2, C1, B2 …). Native and C2 languages decide what is **familiar**: a part of a lesson (a grammar page, a block of it, a phenomenon) whose typological values all occur in one of them is **hidden in one line** ("✓ familiar from Turkish — show"); everything else is shown in full. A language without a profile in `_typology/languages.json` is placed by the learner in its type (and family, if known), and the engine infers its values from the **prototype** of that family or type (the majority value of the profiled languages). **Comparison notes** (§4.7.1) tell a learner how a point looks from a given language: a fixed **reference set** is written for every page — fusional: Greek, Russian, Spanish, English, French, German, Hindi, Persian, Marathi; Semitic: Arabic, Hebrew; agglutinating: Turkish, Japanese, Korean, Finnish, Hungarian, Swahili, Luganda; isolating: Mandarin, Vietnamese; polysynthetic: Inuktitut — and the learner may let Claude (or Gemini) write notes for their other languages, only when they turn that on and have an API key. A **library of the language's peculiarities** (`#/peculiar/<lang>`, built from the catalogue) can be read at any time, in no fixed order, with what is new for this learner marked. Uralic languages (Finnish, Hungarian) are a family, not a type: they are agglutinating with some fusional traits, and their family is used for inference. |
| D19 | **Vocabulary has its own track; every other aspect trains with any vocabulary** (2026-10-09, asked by the user) | After the foundations the thematic fields are learned on their own, in any order the learner chooses, each one exhaustive (nouns, verbs, adjectives … of the field). Every other aspect — grammar, morphology, syntax, semantics, pragmatics, script, reading, writing / speaking skills (function `category`) — is taught and trained with sentences that **prefer the learner's known words** (foundations + learned fields, marked "fits your fields") but may contain unknown words: **at most ⌈30 %⌉ of the words of a sentence**, in recognition and production alike. Unknown words carry 🆕, show their card (translation first, then all its parameters) on hover / tap, and are listed at the end of the lesson to study or inspect. Every word used anywhere is in the lexicon with its **full facade** (D14). **Every field brings sentences for every non-vocabulary node** taught before it on the common order (≥ 2 per node, with the field's words: "I played the guitar", "I peeled a carrot"), or says why a node cannot show it (`fieldExemptions`). Template engines and LLM-written exercises are a later option, and only with "the LLM proposes, the validator decides". |

## 2. Principles

1. **Teach concepts, not words.** The unit of the course is language-neutral (a concept, a grammar function, a sentence frame); every language is one *realization* of it. This is what makes parallel teaching and the flag buttons natural.
2. **Vocabulary in exhaustive thematic fields**: all vegetables together, from the most common to the rarest, even 200+ items. The whole field is always visible as a map; it is *learned* in tiers and small batches (10–15), grouped by subgroup (root / leafy / legumes / gourds / herbs …), so related things stay together.
3. **Everything else uses only known vocabulary**, computed live from the learner's state in that language.
4. **Parallel for polyglots**: a word, a rule or a construction taught in one language is shown at the same time for every language of the course (comparison or independent element). The UI stays clean: one language at a time, flags on the side.
5. **Correctness over coverage**: no answer key is ever invented at runtime; every stored form is validated; disagreements with reference data block the build until resolved or justified.
6. **Additive**: content and learner-specific bank patches are merged, never overwrite progress.
7. **Pedagogy of the app**: challenge and test, structured and co-located information, stress pitfalls and "ask yourself" checklists (decision procedures), close every explanation with an authoritative answer.

---

## 3. Catalogue of the aspects of a language

For each aspect: what is trained, and what is special in the pilot languages (ar = Arabic, he = Hebrew, zh = Chinese, de = German).

### 3.1 Writing system and orthography
- **Script type**: alphabet (de), abjad (ar, he), logographic (zh).
- **Direction**: RTL (ar, he) with LTR numbers and embedded Latin.
- **Letter shapes by position**: ar — isolated/initial/medial/final forms, 6 non-connecting letters (ا د ذ ر ز و), lam-alif ligature; he — 5 final forms (ך ם ן ף ץ).
- **Vowel marks**: ar ḥarakāt (fatḥa, kasra, ḍamma, sukūn, šadda, tanwīn), hamza seats, tāʾ marbūṭa, alif maqṣūra; he niqqud, dagesh, ktiv male (full spelling) vs ktiv ḥaser. Policy: fully vocalized → partially → unvocalized as the learner progresses.
- **Characters**: zh — strokes, stroke order, radicals and components, simplified vs traditional, homophones (characters disambiguate).
- **Romanization**: pinyin (zh, tone marks / tone numbers); a learner transliteration for ar (DIN 31635-like) and he.
- **Spelling rules**: de — capitalized nouns, ß/ss, umlauts, compounds written together; ar — sun/moon letters with al-, hamza rules; he — begadkefat letters (b/v, k/kh, p/f).
- **Punctuation**: ar ، ؟ ؛; he geresh/gershayim (abbreviations); zh full-width 。，、！？; de comma rules tied to syntax.

### 3.2 Sounds (visual first, audio later)
- zh: 4 tones + neutral; tone sandhi (3-3 → 2-3, 不 bù → bú, 一 yī changes).
- ar: emphatic consonants, long vs short vowels, assimilation of al- before sun letters, pausal forms.
- he: stress mostly final, begadkefat spirantization, shva.
- de: vowel length, final devoicing, stress on separable prefixes and in compounds.

### 3.3 Morphology
- **Nouns**: gender (de 3 + article as part of the word; ar, he 2 with exceptions); number with **dual** (ar, he); **plural classes** (de -e/-er/-(e)n/-s/umlaut; ar sound masc -ūn/-īn, sound fem -āt, **broken plurals** by pattern; he -im/-ot + irregulars); **cases** (de 4; ar 3 with iʿrāb endings, diptotes); **definiteness** (ar al-, he ha-); **construct state** (ar iḍāfa, he smichut); zh none, but **measure words** (classifiers).
- **Verbs**: tense, aspect, mood, voice, person/number/gender (ar, he gender in 2nd and 3rd person); ar verb forms I–X, he binyanim (7); de strong/weak/mixed verbs, principal parts, separable/inseparable prefixes, Perfekt with haben/sein, modals, reflexives, Konjunktiv II; zh no inflection — aspect particles 了 / 过 / 着, resultative and directional complements.
- **Root-and-pattern** (ar, he): triliteral roots + patterns (awzān / binyanim and mishkalim) — word families from one root.
- **Derivation and compounding**: de compounds (gender from the last part), de prefixes; ar maṣdar, participles, nisba; he patterns; zh compounds of characters.
- **Pronominal suffixes / clitics**: ar and he prepositions and nouns with suffixes (li, lo, la …; kitābuhu); de weak pronoun order.

### 3.4 Syntax
- **Word order**: de V2 in main clauses, verb-final in subordinate clauses, TeKaMoLo; ar VSO and SVO with agreement asymmetry (verb before a plural subject stays singular); he SVO, flexible; zh SVO with time and place before the verb, topic–comment.
- **Agreement**: de adjective declension (strong/weak/mixed); ar adjective agrees in gender, number, case, **definiteness**; **non-human plurals take feminine singular agreement**; he adjective + definiteness; verb–subject gender agreement (ar, he).
- **Government**: de verbs and prepositions governing cases, two-way prepositions (Akk for motion, Dat for place); he et before definite direct objects.
- **Nominal sentences** (no present "to be"): ar, he.
- **Possession**: de haben; he yesh/ein + le-; ar ʿinda / li-; zh 有.
- **Questions and negation**: zh 吗 / 呢, A-not-A; ar hal / ʾa-, negators lā / lam / lan / laysa / mā (by tense!); he ha'im, lo / ein; de kein vs nicht.
- **Relative clauses**: de with relative pronouns + verb-final; ar alladhī (only after definite heads); he she-; zh prenominal with 的.
- **Special constructions**: zh 把 and 被, 的 / 得 / 地, serial verbs, complements; de passive with werden, infinitive with zu; ar numbers with **gender polarity** (3–10) and case of the counted noun.

### 3.5 Vocabulary
- Exhaustive thematic fields with subgroups and tiers by frequency.
- Word families and roots (ar, he), components (zh), compounds (de).
- Collocations, idioms (zh chengyu), register (formal, everyday, slang).
- Semantic splits (one English word → several: kennen/wissen) and false friends.
- Measure words per noun (zh), gender + plural as part of the word (de, ar, he).
- Variants: MSA vs dialects (ar, dialects later), simplified vs traditional (zh), Swiss/Austrian (de, notes).
- Numbers and counting, dates, time, money.

### 3.6 Pragmatics and culture
Forms of address and politeness, greetings and fixed formulas (ar is rich here), discourse markers, cultural notes.

### 3.7 Text production
Sentence building → expansion → paraphrase → translation (incl. between two foreign languages) → paragraphs → text types (message, description, narration, opinion), cohesion and connectors.

### 3.8 Reading
Graded texts built from known vocabulary (0 unknown words in drills, at most 1 glossed unknown word per sentence in reading), with tap-to-gloss.

### 3.9 Listening and speaking — P9

---

## 4. Content model (`noema.lang/v1`)

### 4.1 Files

```
library/languages/<course-id>/            shared course   (or accounts/<profile>/packs/<course-id>/ when private)
  course.json                 noema.langcourse/v1 — id, title, explainLang, languages, defaults
library/languages/_phenomena/<code>.json   the catalogue of phenomena of a language (§4.11), shared by all its courses — written FIRST
  core/
    fields/<field>.json       concepts of one thematic field (subgroups, tiers, images, Wikidata ids)
    nodes.json                the vocabulary DAG
    functions/<function>.json grammar functions (language-neutral)
    frames.json               sentence frames (language-neutral meaning)
    media/media.json          images (noema.media/v1, as in docs/VISUAL.md)
  course.pack.js · course.profiles.js   GENERATED by tools/build.py: the course without and with only the word profiles (loaded after the start)
  lang/<code>/
    language.json             script, direction, fonts, romanization, vowel-mark policy, keyboard
    script/letters.json       (ar, he) letters with positional/final forms, sounds, order of teaching
    script/chars.json         (zh) characters: pinyin, components, radical, stroke data, simplified/traditional
    lexicon/<node>.json       lexemes for the concepts of that node, with paradigms
    grammar/<function>.json   how this language realizes the function
    bank/<id>.json            annotated sentences
    confusables.json          pairs that are easily mixed up (within the language)
  compare/<function>.json     comparison tables across the course languages
  bridges.json                cognates and loanwords across course languages and the learner's known languages
  patches/                    additive updates (incl. learner-specific bank refills)
```
`tools/build.py` builds one `core.pack.js` and one `<code>.pack.js` per language (loaded lazily) and lists the course in the registry with `kind: "language"`.

### 4.2 `course.json`
```json
{ "format": "noema.langcourse/v1", "id": "polyglot-semitic-zh-de", "title": "Arabic · Hebrew · Chinese · German",
  "explainLang": "en", "languages": ["ar", "he", "zh", "de"],
  "defaults": { "depth": { "ar": 3, "he": 3, "zh": 3, "de": 3 }, "batch": 12, "dailyMinutes": 30 },
  "knownLanguages": ["el", "en", "de", "ru", "tr"] }
```
`knownLanguages` (languages the learner already speaks) are used only for bridges (§9.3); a language can be both known and in the course.

* `draft`: node ids whose words are still being written (a content batch in progress). They are validated like the rest but may be incomplete, and the app treats them as not prepared yet — the course stays usable up to them.

### 4.3 Concepts and fields
```json
{ "field": "food.vegetables", "title": "Vegetables", "subgroups": [
    { "id": "root", "title": "Root and tuber vegetables" }, { "id": "leafy", "title": "Leafy greens" }, … ],
  "sources": ["Wikidata: subclasses of Q11004 'vegetable'", "Oxford Picture Dictionary", "…"],
  "concepts": [
    { "id": "veg.carrot", "gloss": "carrot", "subgroup": "root", "tier": 1, "rank": 12,
      "wikidata": "Q81", "media": "carrot", "note": "" } ] }
```
* `tier` 1 = common, 2 = intermediate, 3 = rare (the exhaustive tail). `rank` orders items inside a tier (frequency).
* `sources` is required: how the list was made exhaustive.
* `gloss` and `note` are in `explainLang`.
* `"pending": true` — a **meaning known from a word of the course but not taught yet** (D15): it belongs to no node (yet), every other concept belongs to exactly one. When a node takes it, `pending` goes. A concept may serve one language only (a Chinese particle, an Arabic oath formula): concepts are the meanings the course's words have, not a fixed list.

### 4.4 The vocabulary DAG — `nodes.json`
```json
{ "nodes": [
  { "id": "core.1", "kind": "core", "title": "Me, you and the basic verbs", "concepts": ["pron.1sg", "…"], "prereqs": [] },
  { "id": "veg.1",  "kind": "field", "field": "food.vegetables", "tier": 1, "concepts": ["veg.carrot", "…"], "prereqs": ["core.2"] },
  { "id": "veg.2",  "kind": "field", "field": "food.vegetables", "tier": 2, "concepts": ["…"], "prereqs": ["veg.1"] },
  { "id": "veg.3",  "kind": "field", "field": "food.vegetables", "tier": 3, "concepts": ["…"], "prereqs": ["veg.2"] } ] }
```
Shape (D9, D10): first the **foundations** — one chain of `lesson` nodes per path (§4.4.1) —, then a **core spine** of further functional vocabulary (numbers to 100 and beyond, more verbs, connectors, time words) and the **field branches** with tiers in sequence; a field's first node requires the last foundation lesson (`"prereqs": ["fd.18"]`); a prerequisite that does not apply to a language is passed through. The DAG is acyclic.

* **Applicability** — a node applies to a language when its `path` (if any) is the language's `typology` and its `langs` (if any) include the language. Nodes that do not apply have the state `na` in that language (hidden; done for the prerequisites).
* **Ownership** — in every language a concept belongs to **at most one** applicable node (with extra lessons for one type, a concept may be taught by different nodes in different languages — always at the same place of the common order, D13). A concept that no applicable node owns is not taught in that language yet.
* **Parallel order (D13) — a hard constraint**: every path of every language keeps the one common order of the subjects (§4.4.3).
* Lexicon files exist only for nodes that apply to the language; an applicable node without its file is *unprepared*.

#### 4.4.1 Foundation lessons (node kind `lesson`) — one spine of steps, a path per type
```json
{ "id": "fd.07", "kind": "lesson", "step": 7, "title": "Eating and drinking: the present tense",
  "concepts": ["verb.eat", "verb.drink", "…", "food.bread", "drink.tea", "…"],
  "functions": { "*": ["fn.present", "fn.object"], "isolating": ["fn.word.order"], "polysynthetic": ["fn.incorporation"], "ar": ["fn.root.pattern"], "he": ["fn.root.pattern"] },
  "prereqs": ["fd.06"] }
```
* `functions` is a list (every language) or an object: `"*"` for every language, then a type (`isolating`, `agglutinating`, `fusional`, `polysynthetic`) or a language code for the extras. A language learns `"*"` + its type + its code, in that order; it needs a realization of each (`status` may be `absent`: then the page says so and how the language does it instead).
* Every lesson except S00 has its thematic group of words, complete within the step's theme; S00 has none.
* The bank of each language has, for every lesson, sentences that combine its new words with the earlier ones (at least 3 per new content word over the lesson's frames), for every one of its functions (variants for negation, questions, plural), so that every exercise of the lesson has material.
* Extra lessons for one type or language (`path`, `langs`) are possible; they are passed through by the others (`na`).
* In the table, the per-type columns say what the step's grammar covers for that type; a function of its own (in `functions`) is named in backticks — the rest is part of the realization of the shared functions.
* Lessons have `stage`: `foundations` (S00–S18) or `core` (§4.4.2). The fields require the last foundations lesson only.

| Step | Theme — words (complete groups) | Grammar for all (`*`) | + isolating | + agglutinating | + fusional | + polysynthetic |
|---|---|---|---|---|---|---|
| S00 `fd.00` | the language and the four types (no words) | overview (D11) | tones and syllables | — | — | — |
| S01 `fd.01` | I, you, he, she, it, we, you (pl), they; to be; and; the, a (the words; their grammar comes in S04); people: man, woman, boy, girl, child, person, people, friend, student, teacher | subject pronouns; *to be* (ar/he: none in the present; zh 是 only links nouns) | — | personal endings of *to be* (öğretmenim) | — | person markers on the verb |
| S02 `fd.02` | greetings and polite words: hello, good morning, good evening, good night, goodbye, see you, thank you, you're welcome, please, sorry, excuse me, how are you?, fine, my name is…, nice to meet you, yes, no | greetings and forms of address (formal / informal: Sie/du, 您/你; to a man / to a woman in ar, he) | — | — | — | — |
| S03 `fd.03` | this, that, these, those, here, there (pointing at the people of S01) | demonstratives | measure words (这本书) | — | agreement of the demonstrative | — |
| S04 `fd.04` | things at home: house, flat, room, door, window, wall, table, chair, bed, cupboard, lamp, book, pen, paper, phone, key, bag, cup, glass, plate | the noun: gender; definite / indefinite | — | no gender, no articles (bir); **what a case is, the nominative** (`fn.case.basic`) | gender and agreement (`fn.agreement`); **what a case is, the nominative** (`fn.case.basic`) | — |
| S05 `fd.05` | numbers 0–20, 30 … 90, 100, 1000; many, few, a little, all, some | numbers; singular and plural (ar: dual) | measure words with numbers, 两/二 | vowel harmony (-ler/-lar), no plural after numbers | number agreement (ar: polarity 3–10) | — |
| S06 `fd.06` | to have; the family, extended: family, parents, mother, father, son, daughter, brother, sister, grandfather, grandmother, grandson, granddaughter, grandparents, uncle, aunt, cousin, nephew, niece, husband, wife, baby, relative; my, your, his, her, our, your (pl), their | *to have*; possessives | 有; 的 | possessive suffixes (ablam, evimiz) | possessive suffixes (ar, he); mein / dein… | possession on the noun |
| S07 `fd.07` | eating and drinking: eat, drink, want, like, cook, buy; bread, cheese, egg, meat, fish, chicken, rice, soup, salad, fruit, apple, sugar, salt, water, tea, coffee, milk, juice, wine, beer, breakfast, lunch, dinner | **present tense: all three persons, singular and plural**; the direct object (**accusative** where the language has cases) | word order: subject – verb – object (`fn.word.order`) | the accusative suffix | conjugation tables; de accusative, ar accusative, he אֶת; ar/he roots and patterns (`fn.root.pattern`) | noun incorporation (`fn.incorporation`) |
| S08 `fd.08` | not, no (none), nothing, nobody, never, neither … nor | negation | 不 / 没 | negation inside the verb (-me/-ma) | — | — |
| S09 `fd.09` | or, maybe, really, of course, also, only | yes/no questions; answers (de doch) | 吗, A-not-A, 还是 | the question particle mi | — | — |
| S10 `fd.10` | what, who, where, when, how, why, how many / how much, which, whose; jobs: doctor, nurse, engineer, driver, cook, seller, worker, farmer, police officer, lawyer, artist | wh-questions | the question word stays in place | — | — | — |
| S11 `fd.11` | in / at / to, from, with, without, for, about; places in town: home, school, university, work, office, shop, supermarket, market, restaurant, café, hospital, pharmacy, bank, post office, station, airport, street, square, park, city, village, country | the core prepositions *in/at/to, from, with* (σε, από, με) and *without, for, about* | coverbs: 在, 从, 跟, 给 | case suffixes for *in, from, to, with* | prepositions with their cases (de); ar genitive after prepositions; he prefixed בְּ, לְ, מִ | locative / allative suffixes |
| S12 `fd.12` | where things are: on, under, next to, in front of, behind, between, near, far, inside, outside, left, right; the home: kitchen, bathroom, bedroom, living room, garden, floor, stairs, shelf, sofa, fridge | prepositions of place | place word after the noun (桌子上) | locative case + place nouns (masanın üstünde) | de dative for *where*, accusative for *where to* | — |
| S13 `fd.13` | going and coming: go, come, walk, run, drive, travel, return, enter, leave, arrive, stay, wait; transport: bus, train, plane, taxi, car, bicycle, boat, on foot, ticket | movement: *where to / where from*; by (transport); **commands: the imperative** (`fn.imperative`) | 去 / 来, 从 … 到 | dative and ablative suffixes | verbs of movement (de gehen / fahren; ar/he roots) | directional affixes |
| S14 `fd.14` | the days and the day: Monday … Sunday, weekend, day, night, morning, noon, afternoon, evening, today, tomorrow, yesterday, now, later, soon, early, late, always, often, sometimes | telling the day; adverbs of time and frequency | time before the verb; aspect 了 / 过 | — | — | — |
| S15 `fd.15` | the year: January … December, spring, summer, autumn, winter, week, month, year, hour, minute, o'clock, date, birthday, holiday; before, after, until, since, during, at / on / in (time) | prepositions of time; the clock and the date | — | time case suffixes (-de, -den, -e kadar) | case after the time prepositions | — |
| S16 `fd.16` | describing: big, small, long, short, tall, good, bad, new, old (things), young, old (people), hot, cold, warm, beautiful, ugly, easy, difficult, cheap, expensive, happy, sad, tired, hungry, thirsty, fast, slow | adjectives: attribute and predicate | adjectives as verbs, 很, 的 | no agreement | agreement (gender, number, case; ar/he after the noun) | — |
| S17 `fd.17` | colours: white, black, red, blue, green, yellow, brown, grey, orange, pink, purple; light, dark; more, most, than | comparison (bigger, the biggest) | 比, 最 | -den daha, en | de -er / am -sten; ar أَفْعَل; he יוֹתֵר | — |
| S18 `fd.18` | linking words: and, or, but, because, so, then, also, too, when, if, that (conjunction) | linking words: joining and subordinate clauses | 因为 … 所以, 虽然 … 但是 | converbs and -ki | de verb at the end after weil / dass; ar أَنَّ / لِأَنَّ + suffix | — |

The words already written for `core.1` (P2) move into these steps (the bank does not change: sentences refer to words, not nodes). The concept ids keep the scheme of the course (`pron.i`, `verb.eat`, `food.bread`, `family.brother`, `time.monday` …).

#### 4.4.2 The core after the foundations (stage `core`, D12, D17) — C01–C48, from A2 to B2
One chain of lessons after S18 (`cr.01` … `cr.48`), alongside the thematic fields, with every rule of the foundations: all
languages walk the same steps in the same order (D13), each lesson brings a **complete thematic group** of words that
combine with what came before (D9), the grammar of each step is realised per type (D10; the per-type notes say what the
step means for each type — a language adds its own points inside the step, or as an extra node placed between the common
ones), every new word with its whole facade and every meaning a concept (D14, D15), every text neutral (D16). The pending
concepts of D15 (sky, moon, hunger, bench …) find their nodes here and in the fields.

| Lesson | Grammar for all | Per type (isolating · agglutinating · fusional · polysynthetic) | Words (complete groups) |
|---|---|---|---|
| **A2** | | | |
| C01 `cr.01` | the past: completed actions | iso: 了, 过, time words · agg: past suffix · fus: past / perfect tables (de Perfekt with haben / sein, ar perfect, he past) · poly: past affix in the verb | the daily routine: wake up, get up, wash, shower, get dressed, have breakfast, leave home, start, finish, come home, go to bed, fall asleep |
| C02 `cr.02` | how it used to be: ongoing and habitual past | iso: 在 / 着 + time, 以前 · agg: past progressive / habitual suffixes · fus: imperfective past (ar kāna + imperfect, de Präteritum of common verbs, he past + היה) | childhood: child (time), toy, game, play, grow up, remember, forget, kindergarten, neighbour, holidays |
| C03 `cr.03` | the future: plans and intentions | iso: 要, 会, 打算 · agg: future suffix · fus: werden + infinitive, ar sa- / sawfa, he future | travel plans: plan, trip, holiday, hotel, room, book (a room), passport, suitcase, ticket, abroad, visit, tourist, guide |
| C04 `cr.04` | ordinal numbers, dates, the clock in full | iso: 第, dates big → small · agg: ordinal suffix · fus: ordinal agreement (ar, he, de) | first … twelfth, last, half, quarter, date, century, decade, birthday, anniversary, "at what time?" |
| C05 `cr.05` | can, must, may, want, need, should: modality | iso: 能 / 会 / 可以, 要 / 得 / 应该 · agg: ability / necessity suffixes · fus: modal verbs + infinitive, ar yastaṭīʿu / yajibu an + subjunctive, he יָכוֹל / צָרִיךְ + infinitive | rules: allowed, forbidden, rule, sign, permission, possible, impossible, necessary |
| C06 `cr.06` | the body; "it hurts": who feels (experiencer constructions) | iso: …疼 · agg: possessive + verb · fus: dative / oblique experiencer (mir tut … weh, he כּוֹאֵב לִי) | the body, complete: head, hair, face, eye, ear, nose, mouth, tooth, tongue, neck, shoulder, arm, hand, finger, chest, back, stomach, leg, knee, foot, toe, skin, heart, blood, bone |
| C07 `cr.07` | advice and obligation in use (should, must, had better) | as C05, in second-person advice | health: ill, healthy, fever, cold, cough, pain, medicine, pill, doctor's appointment, hospital, pharmacy, rest, get well |
| C08 `cr.08` | clothes and wearing: agreement of adjectives in the plural; verbs of wearing | iso: classifiers 件 / 条 / 双, 穿 / 戴 · agg: — · fus: adjective agreement (all cases, ar non-human plural = fem. sg.), anziehen / tragen | clothes, complete: shirt, T-shirt, trousers, skirt, dress, jacket, coat, sweater, shoe, boot, sock, hat, glove, scarf, belt, bag, pocket, size, wear, put on, take off |
| C09 `cr.09` | reflexive and reciprocal verbs | iso: 自己, 互相 · agg: reflexive / reciprocal suffixes · fus: sich (de), ar forms V / VI / VIII, he hitpael · poly: reflexive prefix | personal care: wash oneself, shave, comb, brush (teeth), dry oneself, towel, soap, toothbrush, mirror, shampoo; meet, each other |
| C10 `cr.10` | two objects: giving, sending, showing, telling (the indirect object) | iso: 给, 把 (intro) · agg: dative suffix · fus: dative (de), li- / ʾilā (ar), לְ (he) · poly: applicative / object markers | give, send, show, tell, bring, lend, borrow, explain; present, gift, letter, parcel, message, card, address |
| C11 `cr.11` | big numbers, prices, quantities and containers | iso: measure words for quantities · fus: counted-noun rules (ar), number + noun agreement | 100 … 1,000,000, price, cost, cheap / expensive (again), bottle, can, box, bag, packet, kilo, gram, litre, piece, pair, slice, change (money), receipt |
| C12 `cr.12` | polite requests: "I would like", "could you" | iso: 请, 可以…吗 · agg: polite / conditional suffix · fus: Konjunktiv II möchte / könnten, ar law samaḥt, he אֶפְשָׁר | the restaurant: menu, order, bill, waiter, tip, table, dish, starter, dessert, vegetarian, spicy, the taste words (sweet, sour, bitter, salty) |
| C13 `cr.13` | the weather: sentences without a doer (impersonal) | iso: 下雨, 刮风 · fus: es regnet, ar tamṭuru, he יוֹרֵד גֶּשֶׁם | sky, sun, moon, star, cloud, rain, snow, wind, storm, fog, ice, temperature, degree, sunny, cloudy, wet, dry |
| C14 `cr.14` | there is / there are; places and locatives again | iso: 有, 在 · agg: locative + existential · fus: es gibt, ar hunāka, he יֵשׁ | nature: sea, river, lake, mountain, hill, forest, field, desert, island, beach, valley, ground, stone, tree, flower, grass |
| C15 `cr.15` | animals: irregular and collective plurals, the dual, classifiers for animals | iso: 只 / 条 / 头 / 匹 · fus: broken plurals, collectives (ar), irregular plurals (de, he) | animals, complete: dog, cat, horse, cow, sheep, goat, pig, chicken (bird), duck, bird, fish (animal), mouse, rabbit, lion, tiger, bear, wolf, fox, elephant, monkey, snake, insect, bee, fly, butterfly |
| C16 `cr.16` | feelings: adjective or verb; degree (very, too, enough, quite) | iso: 很 / 太 / 非常 / 够 · agg: — · fus: experiencer verbs, adjective agreement | happy, sad, angry, afraid, surprised, bored, worried, proud, jealous, nervous, calm, love, hate, feel, laugh, cry, smile |
| C17 `cr.17` | describing people: relative clauses (the man who …) | iso: …的 + noun · agg: participle before the noun · fus: relative pronouns (de der / die / das), ar alladhī, he שֶׁ | appearance and character: tall, short (person), fat, thin, hair, beard, glasses, beautiful, kind, honest, lazy, clever, shy, funny, polite |
| C18 `cr.18` | possession in depth: genitive constructions | iso: 的 / zero · agg: possessive + genitive suffixes · fus: Genitiv / von, ar iḍāfa, he construct state and שֶׁל | the home and housework: furniture complete, clean, wash the dishes, iron, tidy up, sweep, rubbish, washing machine, key, lock |
| C19 `cr.19` | telling a story: sequence of events, the past before the past | iso: 先…然后, 以后, 以前 · agg: converbs · fus: Plusquamperfekt, ar kāna qad + perfect, he past + כְּבָר | first, then, after that, finally, suddenly, meanwhile, happen, meet, find, lose, decide, notice, event |
| C20 `cr.20` | the way: commands in a row; path and manner of movement | iso: directional complements 进 / 出 / 过 · agg: case of path · fus: prefixes (de hin- / her-, ein-, aus-), prepositions of path | turn, cross, go straight, along, past, around, corner, crossroads, traffic light, bridge, map, north, south, east, west |
| C21 `cr.21` | verb + verb: like to, want to, start, stop, try | iso: serial verbs · agg: infinitive / verbal noun suffixes · fus: zu + infinitive, ar an + subjunctive, he infinitive | free time and sport: sport, football, swim, run, dance, sing, music, instrument, game, team, match, win, lose, hobby |
| C22 `cr.22` | time clauses: when, while, before, after, until, since, as soon as | iso: …的时候, 一…就 · agg: converbs · fus: als / wenn / während / bevor, ar ʿindamā, lammā, he כְּשֶׁ | the week: busy, free time, appointment, schedule, early / late (again), on time, weekday, weekend |
| C23 `cr.23` | comparison in depth: superlative, as … as, the more … the more | iso: 比, 最, 跟…一样 · agg: -dan daha, en · fus: de -er / -sten, ar ʾafʿal, he הֲכִי | geography: country, continent, capital, population, border, coast, world, map, city / village (again) |
| C24 `cr.24` | someone, nobody, everything, anything; every, each, both, either, neither | iso: question words + 都 / 也 · agg: indefinite suffixes · fus: jemand / niemand / etwas, ar ʾaḥad / šayʾ, he מִישֶׁהוּ / שׁוּם | A2 review: the indefinite and negative words |
| **B1** | | | |
| C25 `cr.25` | real conditions: if + present / future | iso: 如果…就 · agg: conditional suffix · fus: wenn / falls, ar ʾiḏā / ʾin, he אִם | everyday problems: lost, broken, late, miss (the bus), mistake, repair, problem, solve, help (again), forget (again) |
| C26 `cr.26` | wishes and hopes: subjunctive / optative | iso: 希望, 想 · agg: optative · fus: Konjunktiv II, ar layta, an + subjunctive, he הַלְוַאי | dream, hope, wish, success, career, goal, future (again), luck |
| C27 `cr.27` | unreal conditions: if I were …, I would have … | iso: 要是…就好了 · agg: conditional + past · fus: Konjunktiv II past, ar law … la-, he אִילוּ / לוּ | regret, chance, decision, choose, happen (again) |
| C28 `cr.28` | the passive: who did it does not matter | iso: 被, notional passive · agg: passive suffix · fus: werden / sein + participle, ar passive vowels / form VII, he nifal / pual / hufal · poly: passive / antipassive | news: event, happen, build, invent, discover, found, destroy, elect, report, accident, news |
| C29 `cr.29` | reported speech: he said that … | iso: 说 + clause · agg: reported / evidential suffixes · fus: dass + subjunctive I (de), ar ʾanna, he שֶׁ + tense | say, tell, ask, answer, explain, think, believe, claim, mean, promise |
| C30 `cr.30` | indirect questions; knowing a fact and knowing someone | iso: 知道 / 认识, …不…, 是否 · agg: question suffix in the clause · fus: ob, wissen / kennen, ar ʿarafa / ʿalima, he יָדַע / הִכִּיר | education: subject, exam, mark, degree, course, lesson, homework, understand, learn (again), teach |
| C31 `cr.31` | participles: the letter written yesterday | iso: …的 · agg: participles · fus: participles as adjectives (de, ar fāʿil / mafʿūl, he benoni / passive participle) | work: company, boss, colleague, meeting, salary, contract, interview, apply, employ, retire, office (again) |
| C32 `cr.32` | verbal nouns: reading, learning, the arrival | iso: verbs used as nouns · agg: nominalising suffixes · fus: Infinitiv als Nomen, -ung (de), maṣdar (ar), shem peula (he) | activity nouns: reading, writing, travel, arrival, departure, development, help, change |
| C33 `cr.33` | building verbs from verbs and roots | iso: resultative and directional complements · agg: valency suffixes (causative, passive, reciprocal) · fus: ar forms II–X, he binyanim, de prefix verbs · poly: incorporation, applicatives | verbs of change: open / close, rise / raise, fall / drop, wake / awaken, break, fix, grow (again) |
| C34 `cr.34` | cause, purpose and concession: because of, so that, although, despite | iso: 因为 / 所以, 为了, 虽然 / 但是 · agg: converbs, postpositions · fus: weil / damit / obwohl / trotz, ar li-, ḥattā, raġma, he בִּגְלַל / כְּדֵי / לַמְרוֹת | opinions: opinion, reason, example, agree, disagree, argument, advantage, disadvantage, in my opinion |
| C35 `cr.35` | numbers in use: fractions, percentages, sums and measures | iso: 分之, 百分之 · fus: number agreement in fractions | cooking: cut, boil, fry, bake, mix, add, spoon, cup, oven, pan, pot, recipe, half / quarter (again) |
| C36 `cr.36` | politeness and register: formal address, letters and messages | iso: 您, 请, set phrases · agg: speech levels / polite suffixes · fus: Sie, ar ḥaḍratuk, formulas | social life: invite, party, guest, congratulate, wedding, celebrate, thank (again), apologise |
| C37 `cr.37` | attitude in the sentence: particles and discourse markers | iso: 吧 / 呢 / 啊 / 嘛 · fus: de doch / ja / mal / eben, ar / he discourse markers · all: evidentials where the language has them | conversation: really?, of course, exactly, no way, I see, well, anyway |
| C38 `cr.38` | new words: loanwords, phrasal and particle verbs | iso: calques and transliterations · fus: separable verbs (de), borrowed verbs in patterns (ar, he) | media and technology: computer, internet, website, email, app, screen, download, post, password, charge (a phone) |
| C39 `cr.39` | having something done: causatives (let, make, have) | iso: 让 / 叫 / 使 · agg: causative suffix · fus: lassen, ar form II / IV, he hifil | services: town hall, form, document, signature, queue, appointment (again), repair, deliver |
| C40 `cr.40` | aspect in depth: completed, ongoing, experienced, resulting | iso: 了 / 着 / 过 / 在 contrasted · agg: aspect suffixes · fus: aspect through tense choice and verb pairs | B1 review: travel stories |
| **B2** | | | |
| C41 `cr.41` | abstract nouns and the nominal style | iso: four-character expressions · fus: noun chains, iḍāfa chains | society and environment: environment, pollution, climate, energy, society, development, solution, problem (again) |
| C42 `cr.42` | complex relative clauses: whose, with a preposition, resumptive pronouns | iso: long …的 modifiers · fus: dessen / deren, ar resumptive pronoun, he שֶׁ + resumptive | institutions: government, law, court, rights, citizen, election, party, vote |
| C43 `cr.43` | emphasis and word order: topic, focus, clefts | iso: 是…的, topic-comment · agg: focus particles · fus: inversion, V2 / V-final (de), ʾinna (ar) | the arts: art, painting, film, theatre, novel, poem, actor, author, exhibition |
| C44 `cr.44` | probability and certainty: may, might, must have | iso: 可能, 一定, 大概 · agg: modal suffixes · fus: modal perfect (de muss … haben), ar qad + imperfect | science: research, experiment, result, theory, prove, measure, data |
| C45 `cr.45` | the tenses of narration and of written language | iso: literary connectives · fus: Präteritum, Konjunktiv I, ar literary forms, he literary past / future | history: century, empire, king, war, peace, revolution, independence, ancient |
| C46 `cr.46` | word formation: compounds, derivation, root families, diminutives | iso: compounding of morphemes · agg: suffix chains · fus: compounds (de), root families (ar, he) | word families of the course's most frequent roots and stems |
| C47 `cr.47` | idioms, proverbs and set phrases | all: fixed expressions, chengyu, proverbs | culture: holiday, tradition, custom, festival, religion (neutral words), food culture |
| C48 `cr.48` | registers and varieties: written / spoken, formal / informal, regional | iso: regional standards · fus: diglossia (ar), regional variants (de AT / CH, he slang) | core review: one text per register |
The words of these lessons, the list and the order are reviewed with the user before the content is written (approved
lessons lose their place in `course.draft`).

#### 4.4.4 The advanced stage — open-ended (stage `advanced`, D17)
After the core the course **never ends**: modules are added indefinitely, each one a node with `stage: "advanced"` and a
`family`, placed on the common order (D13: a module common to several languages keeps its place in all of them) and
written to every rule (D9–D16). The learner chooses branches on the map; prerequisites are the core lessons whose grammar
the module needs.
| Family | What it adds | Grows by |
|---|---|---|
| `field` | exhaustive thematic fields with tiers 1–3, like the vegetables: fruit, plants, animals in depth, the body and medicine, clothes and fashion, the kitchen and tools, building and the house, professions, transport, sport, music, the arts, science, computing, law, money and business, politics, religion, emotions in nuance, nature and geography, weather and climate … | a new field or a new tier |
| `grammar` | advanced grammar per type and language: rare moods and forms (ar energetic, jussive in all uses, dual verbs; he literary forms; de Konjunktiv I in full, Futur II; zh classical patterns), full case government lists, aspect pairs, number systems in full | one point per module |
| `lexicon` | depth of words: synonym sets with nuance, collocations, word families, idioms and proverbs, false friends, confusables, register pairs | a set per module |
| `variety` | registers and varieties: dialects (Arabic dialects, Swiss and Austrian German, Taiwan Mandarin …), slang, formal / legal / technical language | one variety or register per module |
| `text` | reading and writing: graded readers, then authentic texts (news, stories, public-domain literature), writing genres (letters, essays, reports) | one text set per module |
| `culture` | the language in its world: history of the language, literature, media, etiquette, humour | one topic per module |

#### 4.4.3 The parallel order (D13) — a hard constraint for every change and every new language
Lay the teaching paths of all the languages of the app side by side, each as a line of steps. A **common subject** — the same node id, the same grammar function id or the same concept id, in whatever course — sits at the same place on every line that has it. A line may have **extra steps of its own** between two common subjects (a subject only that language or type needs), or **lack** some subjects; its line then stretches until the next common subject:
```
lang1  A-------------B-----C-------------------D-----E
lang2  A--------------------C-------------------D------
lang3  ----K---L------------C---M---N---O---D----E
lang4  A-------L-----B----------------N--------------E
```
**The rule:** no subject x comes after a common subject y in any path if x comes before y in at least one path — equivalently, one common order of all the subjects exists, and every path is that order with some subjects left out. Two subjects taught in the **same step** of one path may come in either order in another.

* **What is compared**: every language of every course in `library/languages`, and the path of each of the four language types (`isolating`, `agglutinating`, `fusional`, `polysynthetic`) — so a language added later already has a valid place. A path is the course's node order (prerequisites first, stable by file order) with the nodes that apply to the language; a subject counts at the first step that teaches it (the node, its functions for that language — `"*"` + type + code —, its concepts).
* **How it is built in**: one shared node order per course (`C.order` in `langcore`, `topo_order` in the validator) that every language walks; type- or language-specific grammar inside the common step (`functions` by type / code), or as an extra node (`path`, `langs`) placed between the common ones; the daily session takes lessons, word batches and free grammar in that order.
* **Adding a language or a course**: place every subject of the new language on the existing common order. A subject the language needs earlier or later than the others is either (a) its own extra node, (b) taught in the common step that fits, or (c) a reason to move the subject for everybody (next point) — never a different order for one language.
* **Moving a subject** (because it helps the learning): analyse **all** the paths first — for every language and type, what the move costs (words or grammar the subject needs that would not be taught yet, sentences of the bank that would use later material) and what it gains; weigh the trade-off across all of them; then move it in every language at once, rewrite what depends on it, and record the reasons in the changelog. A move that helps one language and harms the others is not made; the subject gets an extra node or a pointer instead.
* **Every change to any language's curriculum is designed with all the paths in view** — the steps, the words and the grammar.
* **Enforced**: `tools/validate_lang.py` (also inside `build.py` and the tests) compares a course with itself (languages and types) and with every other course next to it, and fails on any pair of subjects in opposite orders (naming both paths and steps) or a circle through three or more paths. `--alone` skips the other courses (only for experiments; the build never uses it).

### 4.5 Lexemes — `lang/<code>/lexicon/<node>.json`
```json
{ "lexemes": [
  { "id": "de:Karotte", "lemma": "Karotte", "pos": "NOUN", "senses": ["veg.carrot"],
    "gender": "FEM", "forms": { "N;NOM;SG": "Karotte", "N;GEN;SG": "Karotte", "N;NOM;PL": "Karotten", "…": "…" },
    "variants": [{ "lemma": "Möhre", "region": "north" }, { "lemma": "Rüebli", "region": "CH" }],
    "ref": { "src": "kaikki", "checked": "2026-10-07" } },
  { "id": "ar:jazar", "lemma": "جَزَر", "pos": "NOUN", "senses": ["veg.carrot"], "root": "ج ز ر",
    "collective": true, "unit": "جَزَرَة", "gender": "MASC", "forms": { … }, "translit": "jazar", "ref": { … } },
  { "id": "zh:huluobo", "lemma": "胡萝卜", "trad": "胡蘿蔔", "pinyin": "húluóbo", "pos": "NOUN",
    "senses": ["veg.carrot"], "measure": ["根"], "ref": { "src": "cedict" } } ],
  "absent": [{ "concept": "veg.salsify", "reason": "no common word; borrowed …", "use": "…" }] }
```
* Every concept of the node has a lexeme in the language **or** an `absent` entry (no word in common use, with what is said instead).
* `forms` keys use UniMorph tags; the required cells per language and POS are defined in `language.json` (`paradigmCells`), and the validator checks completeness.
* ar and he forms are stored **fully vocalized**; the unvocalized spelling is derived by stripping the marks (he: unless the lexeme gives the full spelling, `plene`, for a form whose unvocalized spelling adds ו or י).
* Words that attach to the next word (ar وَ, he וְ …) have `"prefix": true`; in a sentence they are a token with `parts` (§4.8).
* Words without a shared concept (he אֶת, zh 个) have `"senses": []` and a `role` text; they belong to the node of their file.
* `ref` records how the item was checked (§11); unchecked items fail the build unless `ref.override` gives a reason.
* **Everything a language needs to say about a word beyond these shared fields is in `features`**, as declared by the language (§4.5.1). Shared top-level fields: `id`, `lemma`, `pos`, `class` (paradigm class), `senses`, `forms`, `formsAlt`, `alts`, `prefix`, `role`, `gender`, `translit`, `pinyin`, `trad`, `plene`, `variants`, `contrasts`, `ref`, `profile`.

#### 4.5.1 The facade of a word: `wordFeatures` (language.json) and `features` (lexeme) — D14
```json
"wordFeatures": { "NOUN": [
    { "id": "root", "title": "root", "phenomenon": "ar.morph.root", "type": "string", "none": true, "why": "…" },
    { "id": "plurals", "title": "plurals", "phenomenon": "ar.morph.plural.broken", "type": "list", "none": true,
      "item": { "form": "string", "kind": "enum:broken|soundMasc|soundFem", "pattern": "string?", "senses": "senses" } },
    { "id": "human", "title": "human (agreement)", "phenomenon": "ar.syntax.agreement.nonhuman", "type": "bool" },
    { "id": "unit", "title": "unit noun", "type": "string", "classes": ["NOUN.collective"] } ] }
```
```json
{ "id": "ar:bayt", "lemma": "بَيْت", "pos": "NOUN", "senses": ["home.house", "place.home", "lit.verse", "family.household"],
  "features": { "root": "ب ي ت", "pattern": "فَعْل", "human": false,
    "plurals": [ { "form": "بُيُوت", "kind": "broken", "pattern": "فُعُول", "senses": ["s1", "s4", "s3"] },
                 { "form": "أَبْيَات", "kind": "broken", "pattern": "أَفْعَال", "senses": ["s2"] } ],
    "dual": "بَيْتَانِ", "diptote": [], "construct": { "none": "regular" } } }
```
* Types: `enum` (`values`), `string`, `strings`, `bool`, `int`, `list` (objects; `item` gives each key's type: `string`, `strings`, `bool`, `int`, `enum:a|b`, `senses` = ids of the word's profile senses, `lexeme` = a lexeme id, `cell` = a paradigm cell; `?` = optional). `classes` limits a parameter to some classes (`NOUN.collective`); `"at": "top"` marks a shared top-level field (`gender`, `pinyin` …) that the declaration only makes required for that part of speech.
* **Every word of that part of speech states every parameter**: a value, or `{"none": "<why>"}` when the declaration allows it (`none: true`) — "not thought of" is never a valid state. A meaning that has its own forms says so with `senses` on the item (each sense's plural, reading, traditional character, auxiliary …).
* The parameters are this language's — their ids are shared across languages when the idea is the same (`root`, `pattern`, `plurals`, `dual`, `governs`, `separable`, `pair`, `construct`, `measure`).
* Every parameter names the phenomenon of the catalogue it records (§4.11). The word card shows the parameters with their titles; generators read them (principal parts, plural drills, measure words, agreement).

#### 4.5.2 One concept, several words: `contrasts` (D14)
When a language has two or more words for one concept, each of them says what separates it, on one axis per concept:
```json
"contrasts": [ { "concept": "conj.or", "axis": "question or statement", "value": "in questions: A or B?" } ]   (还是)
"contrasts": [ { "concept": "conj.or", "axis": "question or statement", "value": "in statements" } ]          (或者)
```
The validator requires it for every concept with several words in a language (same axis, different values); exercises use it (which word here?).

### 4.6 Word profile — every word in depth

Every **content word** (noun, verb, adjective, adverb) is taught in depth, not as a bare translation. Its lexeme carries a
`profile`; `course.json` `"profiles": "required"` (the default) makes the validator enforce it. Function words may have one too.

```json
"profile": {
  "frequency": "A2", "status": "current", "register": ["neutral"], "connotation": "neutral", "intensity": null,
  "feeling": "Fresh salads in summer; in slang, mocking.",
  "senses": [
    { "id": "s1", "def": "cucumber", "concept": "veg.cucumber", "register": ["neutral"] },
    { "id": "s3", "def": "old banger, piece of junk", "register": ["colloquial", "pejorative"] } ],
  "examples": [
    { "text": "Ich schneide eine Gurke für den Salat.", "tr": "I'm slicing a cucumber for the salad.", "register": "neutral", "context": "cooking", "sense": "s1" },
    { "text": "Mit der alten Gurke fährst du noch?", "tr": "You're still driving that old banger?", "register": "colloquial", "context": "cars", "sense": "s3" } ],
  "collocations": [ { "text": "saure Gurken", "tr": "pickled gherkins" } ],
  "particleVerbs": [ { "text": "aufessen", "tr": "to eat up" } ],
  "phrases": [ { "text": "die Sauregurkenzeit", "tr": "the sour-gherkin season", "kind": "colloquial", "meaning": "the silly season", "register": "colloquial" } ],
  "synonyms": [ { "word": "Salatgurke", "register": "neutral", "nuance": "the fresh cucumber, not a pickle" } ],
  "synonymsNone": "…why there is none (when the list is empty)",
  "antonyms": [ { "word": "fasten", "note": "to fast" } ],
  "etymology": { "text": "Borrowed from Old Polish ogórek, from Byzantine Greek ἀγγούριον …", "src": "Wiktionary (kaikki.org)" },
  "funFacts": ["…"], "pitfalls": ["…"], "subtleties": ["…"] }
```

| Part | What it shows | Minimum (content words) |
|---|---|---|
| `senses` | every meaning, each with its own register and domain; **each distinct meaning has its `concept`** (pending if the course does not teach it yet, D15), a nuance or use of a meaning says `of` that sense | ≥ 1; every concept of the word has a sense and every sense has `concept` or `of`; the word's `senses` list = the concepts of its profile senses |
| `examples` | the word in real sentences, each labelled with **register**, **context** and **sense**, with a translation (Chinese: also `py` pinyin) | ≥ 3, in ≥ 2 contexts; ≥ 2 for the concept's sense; each must contain a form of the word (vowel marks included); ar/he fully vocalized |
| `register`, `status`, `frequency` | neutral / formal / informal / colloquial / slang / vulgar / literary / poetic / technical / regional / dated / archaic / obsolete / humorous / pejorative / euphemistic / honorific …; current / dated / archaic / obsolete / rare / neologism; CEFR level | required |
| `connotation`, `intensity`, `feeling` | the emotional colour, the strength on a 1–5 scale for scalar words, what the word evokes | connotation + feeling required |
| `collocations`, `particleVerbs` | what it goes with; phrasal / separable / light-verb constructions built on it | ≥ 2 collocations (nouns, verbs, adjectives) |
| `phrases` | idioms, proverbs, sayings, slang and colloquial expressions, quotes | quotes: short (≤ 160 characters), with `source`, public domain or properly attributed only |
| `synonyms`, `antonyms` | synonyms **per register and context**, each with the nuance that separates it | each synonym has register + nuance; empty only with `synonymsNone` |
| `etymology` | origin, cognates (bridges to other languages) | required, with its source |
| `pitfalls`, `subtleties` | caveats, edge cases, false friends, homographs; fine points of use | ≥ 1 each |
| `funFacts` | memorable facts | recommended (warning when empty) |

Profiles are **exposure content**: their sentences may contain words the learner does not know yet; the app shows the
translation, glosses the course words on tap and marks the rest. They are never the answer key of an automatic exercise,
except for the word itself (e.g. `example_cloze`). Senses and etymologies follow the reference data (§11); when Claude adds
knowledge beyond it, the claim must be one it is sure of — otherwise it is left out.

### 4.7 Grammar functions — `core/functions/<id>.json`
Language-neutral, defined by what they *do*:
```json
{ "id": "fn.plural.noun", "title": "More than one: plural of nouns", "category": "morphology",
  "level": "A1", "after": ["fn.noun.gender"], "tags": ["Number"] }
```
Per language — `lang/<code>/grammar/<id>.json`:
```json
{ "function": "fn.plural.noun", "status": "realized",
  "summary": "…", "blocks": [ …content blocks as in tools/CONTENT_SPEC.md… ],
  "procedure": { "askYourself": ["Is the noun human?", "Does it end in -a (tāʾ marbūṭa)?", "…"], "steps": ["…"] },
  "traps": ["Non-human plurals take feminine singular agreement: …"],
  "paradigmCells": ["N;NOM;PL", "N;NOM;DU"],
  "needs": { "NOUN": 8, "ADJ": 3 },
  "generators": [ { "type": "inflect", "pos": "NOUN", "cells": ["N;NOM;PL"], "count": 12 },
                  { "type": "agree", "bank": { "functions": ["fn.plural.noun", "fn.adj.agreement"] } } ] }
```
* `status`: `realized` | `periphrastic` (expressed with other means) | `absent` (with how the meaning is conveyed, e.g. zh plural → 们 for persons, numerals + measure words).
* `procedure` is the "ask yourself" checklist (same idea as the debug playbooks).
* `needs` is the minimum known vocabulary for the function to be trainable (feasibility, §7.3).

#### 4.7.1 Comparison notes (D16, D18)
General texts describe the language; how it looks **from another language** goes into notes, shown only to learners who
know that language (or its type / family):
```json
"notes": [ { "for": "tr", "rel": "similar", "text": "Turkish also marks the object only when it is definite (-ı) …" },
           { "for": "type:isolating", "rel": "new", "text": "…" }, { "for": "family:Uralic", "rel": "different", "text": "…" } ]
```
* `for`: a language code of `_typology/languages.json`, `type:<typology>` or `family:<family>`; `rel`: `same | similar | different | new | trap`.
* On a grammar realization (top level and on any block), on a phenomenon, on the overview (which replaces its old `forYou`).
* **The reference set** (D18) is written for every realization: notes for at least 8 reference languages covering all four types. Notes the learner asks Claude / Gemini for are stored as their private patch, marked "AI".
* Blocks and realizations may carry `typology` tags (as phenomena do): a block whose tags are all familiar to the learner is hidden in one line.
* General texts (summary, blocks, traps, procedure) name no language outside the course; comparisons with the other course languages stay (they are the polyglot links, D10).

### 4.8 Frames and the sentence bank
`core/frames.json` — the meaning, once:
```json
{ "id": "fr.eat.food", "meaning": "PERSON eats FOOD", "slots": { "agent": "person", "patient": "food.*" } }
```
`lang/<code>/bank/<id>.json` — sentences, annotated token by token:
```json
{ "id": "de.s.000123", "frame": "fr.eat.food", "text": "Das Kind isst eine Karotte.",
  "tokens": [ { "t": "Das", "l": "de:der", "f": "DET;NOM;SG;NEUT" }, { "t": "Kind", "l": "de:Kind", "f": "N;NOM;SG" },
              { "t": "isst", "l": "de:essen", "f": "V;PRS;3;SG" }, { "t": "eine", "l": "de:ein", "f": "DET;ACC;SG;FEM" },
              { "t": "Karotte", "l": "de:Karotte", "f": "N;ACC;SG" }, { "t": ".", "p": true } ],
  "functions": ["fn.present", "fn.case.accusative"], "variantOf": null, "variant": { "Tense": "PRS" },
  "gloss": "The child eats a carrot.", "alts": [], "level": "A1" }
```
* **Variants** of one sentence share `variantOf` and differ in one feature (tense, number, definiteness, voice, statement/question…) — they feed `transform`.
* The validator checks that each token's form is exactly `forms[f]` of its lexeme (or an invariant word), that `text` is the tokens joined by the language's rules, and that the listed functions are really present. This double check catches mistakes in both the bank and the paradigms.
* `alts`: other correct translations/realizations (for typed answers).
* A proper name is a token `{ "t": "Anna", "name": true }` — no lexeme, never taught, never required (also as a part after a prefix: וְשָׂרָה); a name may span several words: `תֵּל אָבִיב`).
* A text may hold a short exchange (`Wie geht's? Gut, danke.`): after `. ? !` the next word may start with a capital.
* The **requirement set** of a sentence = its lemma ids (punctuation and proper names excluded).

### 4.9 Script modules
* ar, he `letters.json`: letter, name, sound, transliteration, positional/final forms, connecting behaviour, teaching order (groups of similar shapes: ب ت ث ن ي), confusable shapes.
* zh `chars.json`: character, pinyin readings, meaning, components and radical (IDS), stroke data (Make Me a Hanzi median paths), simplified/traditional pair, frequency.

### 4.10 Comparisons, confusables, bridges
* `compare/<function>.json`: rows (aspect of the function) × columns (course languages), each cell a short statement + example sentence id; plus `common`, `differs`, `interference` notes (where learning one will mislead in another).
* `confusables.json` (per language) and the cross-language list in `bridges.json` (`kind: cognate | loan | falseFriend | lookAlike`), e.g. ar kitāb ↔ he ktav (root k-t-b) ↔ tr kitap (known language) ↔ hi kitāb.

### 4.11 The catalogue of phenomena — `library/languages/_phenomena/<code>.json` (D14, D16)
**No point of view (D16).** The catalogue describes the language for a learner of ANY background. Every phenomenon is tagged
with the typological feature values it is about (`"typology": [{"feature": "tone.lexical", "value": "complex"}]`, from
`_typology/features.json`, and equal to the language's profile in `_typology/languages.json`); **every feature of the
vocabulary is covered by at least one phenomenon** of the language — including absences (`"kind": "lacks"`, e.g. German:
no lexical tone, no numeral classifiers, no evidentials) and things that are ordinary for many learners (German articles
are new to a Russian, Turkish or Chinese speaker). Texts say what the language does, not how it differs from English or
any other language; comparisons with particular languages belong to the overview's `forYou` and are computed: for a learner
who knows languages K, a phenomenon is **familiar** when every tagged value occurs in some language of K, **new** otherwise
(with the feature's `learnerNote`), **unknown** when K has no profile. `sharedWith` and `rarity` are derived from the
profiles (`tools/lang_phenomena.py` prints them).
**Specific phenomena:** when the tags only approximate a phenomenon that belongs to the language (Chinese erhua, Arabic broken
plurals, German weak nouns), it says `"specific": true` and lists in `alsoIn` the profiled languages that really have the same
thing (`alsoNote` for partial parallels); it is then familiar only to speakers of those languages.
**Written first when a language is added** (before any course content), shared by every course with that language, and kept up to date:
```json
{ "format": "noema.langphenomena/v1", "lang": "ar", "name": "Arabic (Modern Standard)", "typology": "fusional", "summary": "…", "sources": ["…"],
  "phenomena": [ { "id": "ar.morph.plural.broken", "title": "Broken plurals", "area": "morphology", "pos": ["NOUN", "ADJ"], "kind": "has",
      "typology": [ { "feature": "morph.rootPattern", "value": "present" }, { "feature": "nom.plural", "value": "obligatory" } ],
      "rarity": "rare", "sharedWith": ["he"], "what": "…", "examples": [{ "text": "كِتَاب → كُتُب", "translit": "kitāb → kutub", "note": "book → books" }],
      "level": "word", "record": "features.plurals (per sense)",
      "model": { "wordFields": ["plurals"], "paradigm": ["N;NOM;PL;INDF"], "grammar": ["fn.plural.noun"], "exercises": ["principal_parts"], "other": "" },
      "status": "covered | partial | missing", "gap": "…", "when": "fd.05" } ],
  "wordFeatures": { … the proposal the language.json declaration comes from … },
  "distinctions": [ { "concept": "conj.or", "axis": "…", "words": [{ "lemma": "…", "value": "…" }] } ],
  "polysemy": [ { "lexeme": "zh:tian", "meanings": [{ "gloss": "day", "concept": "time.day" }, { "gloss": "sky", "concept": "nature.sky" }] } ],
  "conceptGaps": [ { "concept": "det.indef", "kind": "lacks | adds | merges | splits", "note": "…" } ] }
```
* **Every area**: script and orthography, phonology and prosody, the morphology of every part of speech, syntax, lexicon and semantics (one concept / several words, one word / several concepts, false friends), register and diglossia, pragmatics and politeness, culture-bound concepts, numbers, time and calendars — everything special or uncommon, and notable things shared with other languages (`sharedWith`).
* `_typology/features.json` — `{id, title, area, question, wals, values: [{id, title}], learnerNote}`; `_typology/languages.json` — `{code, name, family, branch, typology, variety, values: {feature: value | "unknown"}, sources}`. Every course language must have a profile; a learner's language without one gets "unknown".
* `_typology/reference.json` — the reference set of D18 (the languages every page has comparison notes for).
* `tools/lang_phenomena.py` reports the coverage and checks the catalogue against the implementation: every word-level phenomenon is recorded by a declared parameter, the named functions exist, the named exercise types are implemented; `status` says honestly what is still missing (`gap`). The validator requires the catalogue for every course language.

---

## 5. Learner state

### 5.1 Items (per course, language, word) — two tracks
An item is one **word** (lexeme) of a language; a concept realized by two words is two items, and the concept's dot on a flag shows the best state of its words.
Each item has an R track (recognition: see the word → meaning) and a P track (production: meaning → write the word), each with SM-2 state `{ due, ivl, ease, reps, lapses }`.

```
locked ──(node opens in this language)──▶ ready ──(introduced)──▶ seen ──▶ learning
learning ──(R ivl ≥ 3 d and the last 2 R reviews correct)──▶ known_r
known_r ──(P ivl ≥ 3 d and the last 2 P reviews correct)──▶ known_p
known_p ──(P ivl ≥ 21 d)──▶ mastered
lapse in P: known_p/mastered ─▶ known_r      lapse in R: any ─▶ learning
```
Using a word correctly inside a grammar or production exercise counts as a review of that track (so lanes reinforce each other).

**States are never stored**: they are computed from the two tracks every time (`langcore.itemState`), so they cannot drift. SM-2: wrong → interval 1 day, streak 0; right → 1, 3, then interval × ease (2.5 at start, never below 1.3).

### 5.2 Nodes (per language)
`locked → open → learning → known → mastered`.
* **Opens** when every prerequisite node is `known` **in the same language** (D2) — or, for a prerequisite of kind `lesson`, **passed**: all its words introduced and its lesson check (§6.7) done with ≥ 80 % (stored as `check: { day, score }` in the node's key). Foundations therefore move on in days, not weeks; their words keep coming back in the reviews until they are known.
* A node that does not apply to the language (§4.4) is `na` and passed through: it counts as done when its own prerequisites are done.
* `known`: ≥ 90 % of its items ≥ known_r and ≥ 70 % ≥ known_p. `mastered`: ≥ 90 % mastered.
* `depth[lang]` limits which tiers are offered (e.g. tier 3 only for German).

### 5.3 Known sets (live)
* **R(L)** = items of L in state ≥ learning → may appear in recognition exercises and reading.
* **P(L)** = items of L in state ≥ known_r → may be asked in production exercises.
* Closed-class words (articles, pronouns, particles…) of the core spine follow the same rule.

### 5.4 Grammar functions (per language)
`new → practicing → solid → mastered` from accuracy over spaced sessions. No locking: grammar is free, ordered by `after` as a recommendation; trainability is computed (§7.3).

### 5.5 Script stage (ar, he, zh)
ar/he: letters introduced in groups; until the letter stage is complete, words always show the script **with** transliteration, and production in script is replaced by tiles. zh: characters become known through the words that contain them; `char_compose` and `trace` use known characters.

### 5.6 Storage (synced like every key — combined, never overwritten: docs/SYNC.md)
```
noema1:<acc>:s:lang:<course>:settings            active languages, depth, batch, the learner's languages (D18), daily minutes
noema1:<acc>:s:lang:<course>:prefs               view preferences (current language, vowel marks, compare, peek)
noema1:<acc>:s:lang:<course>:lang:<L>:node:<N>   { items: { lexId: { seen, r:{sm2}, p:{sm2} } }, check: { day, score, best, tries } }   one key per node
noema1:<acc>:s:lang:<course>:lang:<L>:fn:<F>     { log: [ { day, c, n } ] }
noema1:<acc>:s:<course>:lang:<L>:script     letter/character stage
noema1:<acc>:s:<course>:log:<day>           session log (for statistics)
```
**Two devices** (docs/SYNC.md; `mergeLang` in `engine/cloud.js`, tested by `tests/lang_sync.js`): saves are version-checked; when both
copies of a key changed they are combined — per word and track the later review wins (same day: the one with more answers),
the earliest *seen* day is kept, a lesson check keeps the best score and the most tries, a function's log keeps every day
(the fuller entry of a day), settings take every field of both. An open course folds in what another device changed
(`noema:remote`), so its next save keeps both. Progress only grows.

---

## 6. Exercise types (new, on top of the existing ones)

Legend — source: **D** deterministic from stored data, **B** sentence bank, **AI** graded by Gemini (labelled "AI-judged").
Every new type gets a widget in `engine/lang/40_ex.js` with `check`, `reveal`, `given` (the learner's answer, for the tutor buttons) and keyboard support.

### 6.1 Script
| id | trains | how | src | languages |
|---|---|---|---|---|
| `glyph_form` | positional / final letter forms | pick or type the form of a letter in a given position; joined word assembly | D | ar, he |
| `transliterate` | reading the script | script → romanization and back | D | ar, he, zh (pinyin) |
| `vowelize` | vowel marks | add ḥarakāt / niqqud letter by letter | D | ar, he |
| `tone_mark` | tones, sandhi | mark the tone of each syllable (written and spoken tone) | D | zh |
| `char_compose` | characters | build a character from components / find the radical | D | zh |
| `trace` | stroke order and shape | draw on a canvas; zh checked against stroke medians, ar/he self-checked against a template | D | zh, ar, he |
| `spell` | spelling | type the word from picture/gloss, letter-level diff (umlauts, ß, capitals, hamza, final forms; zh: pinyin → choose characters) | D | all |

### 6.2 Vocabulary
| id | trains | how | src |
|---|---|---|---|
| `learn_batch` | introduction | card (image, word, gender/plural/root/measure word) → 2 immediate checks → next | D |
| `recognize` | R track | word → picture/gloss; **distractors from the same subgroup** | D |
| `picture_name` | P track | picture → type or tile-build the word | D |
| `exhaustive_recall` | the whole field | "name all the vegetables you can" (timed); coverage of the field; words of the field not yet taught are credited too | D |
| `field_map` | structure of the field | the whole field as a picture grid; sort items into subgroups; locked items greyed | D |
| `gender_article` | gender | der/die/das; masc/fem incl. exceptions (fast bucket) | D |
| `principal_parts` | key forms | plural / broken plural / construct form / verb principal parts | D |
| `measure_word` | classifiers | pick the measure word for a noun | D |
| `root_family` | roots | sort words by root; find the root; derive from root + pattern | D |
| `compound_split` | compounds | split a German compound, find its gender | D |
| `sense_split` | semantic splits | sort contexts into kennen / wissen etc. | D/B |
| `collocation` | collocations | which verb/adjective goes with the noun | D |
| `confusables` | look-alikes | pairs drilled together on purpose | D |
| `intensity_scale` | nuance | order words by intensity (uses `order`) | D |
| `register_pick` | register | which word fits this situation (formal letter, friends, slang, literary)? from the synonyms by register | D (profile) |
| `nuance_pick` | subtleties | choose the synonym that fits the context; the explanation is its `nuance` | D (profile) |
| `connotation` | feeling and strength | positive / negative / neutral, or order by intensity | D (profile) |
| `idiom_meaning` | phrases | what does the idiom/proverb mean? (and the reverse: which idiom fits) | D (profile) |
| `example_cloze` | the word in context | the word removed from its example sentences (any of its forms) | D (profile) |
| `sense_pick` | polysemy | which meaning is used in this sentence? | D (profile) |
| `etymology_link` | origins and bridges | match the word to its origin / its cognates in other languages | D (profile) |

### 6.3 Morphology
| id | trains | how | src |
|---|---|---|---|
| `paradigm` | inflection tables | fill a table; cells hidden progressively | D |
| `inflect` | one form | lemma + feature chips → the form | D |
| `analyze` | parsing a form | form → features (case, number, tense, person, binyan/verb form…) | D |
| `morph_build` | morpheme order | assemble stem + affixes (pronominal suffixes, prefixes) | D |
| `root_pattern` | non-concatenative morphology | root × pattern → word; word → root + pattern | D |
| `agree` | agreement | change one element (gender, number, definiteness, case) and update the dependents | B |

### 6.4 Syntax
| id | trains | how | src |
|---|---|---|---|
| `build_sentence` | word order + morphology | **inflecting tiles**: each tile is a lemma; order them and choose each form; distractor tiles | B |
| `word_order` | V2, verb-final, zh time/place | place the verb (or the time phrase) in the right slot | B |
| `transform` | structure changes | tense, number, question, negation, passive, 把/被, direct → reported | B (variants) |
| `contrast` | choosing between structures | 了 vs 过, Akk vs Dat with two-way prepositions, lā/lam/lan/laysa, VSO agreement — with the reason | B |
| `parse` | sentence roles | tag subject/object/verb/case on the tokens | B |
| `gloss` | interlinear glossing | fill the morpheme gloss under each word (or the reverse) | B |
| `proofread` | error detection | find and fix the error (the language twin of `spotbug`) | B (errors made from a known paradigm cell) |
| `combine` | complex sentences | join two sentences with a connector or a relative clause | B |

### 6.5 Production and reading
| id | trains | how | src |
|---|---|---|---|
| `translate` | meaning → form | early: tiles; later typed; accepted answers = realization + `alts`; anything else goes to AI with a clear label | B (+AI) |
| `rewrite` / `expand` | flexibility | paraphrase under a constraint; add details | AI (known-vocab check) |
| `guided_compose` | paragraphs | picture or prompt + required items → AI rubric per aspect (grammar, vocabulary, spelling, cohesion) with inline corrections | AI |
| `graded_reader` | reading | text from known vocabulary (bank sentences or Claude-written, validated), tap-to-gloss, questions | B |
| `number_words`, `clock`, `date` | numbers | digits ↔ words (ar gender polarity, de einundzwanzig, zh 万) | D |
| `register`, `dialogue_turn` | pragmatics | choose the right formula; complete a dialogue turn | B |

### 6.6 Polyglot
| id | trains | how | src |
|---|---|---|---|
| `parallel_translate` | L2 → L3 | translate between two course languages | B (shared frame) |
| `parallel_align` | structure across languages | match the words of 2–4 realizations of one frame | B |
| `which_language` | separation | which course language is this word/sentence in (anti-interference) | D |
| `cognate_bridge` | cognates and loans | link the related words; spot the false friend | D (bridges) |
| `compare_rule` | contrastive grammar | which statement holds for which language (bucket by language) | D (compare) |

### 6.7 Lessons (D9–D11)
All active languages take the same step together (D10). A lesson runs (flags to switch language; ⇄ to see the step's point in every course language side by side, with links to each language's own page; a realization's `seeAlso: [{lang, fn, note}]` adds pointers to related points elsewhere, e.g. German compounds ↔ Turkish suffix chains): **① the grammar** (each function's page: summary, blocks, "ask yourself", traps, examples from the bank) → **② the words** (intro → recognize → produce, in every language of the group) → **③ drills** from the stored paradigms (the function's `generators`) → **④ sentences** from the bank with only known words → **⑤ the lesson check**: 10 mixed items; ≥ 80 % passes the lesson (§5.2), otherwise the missed parts come again.
Lesson S00 (overview) runs: the typology text → the language overview → its quiz as the check (+ the tones for an isolating tone language).

`generators` (in `lang/<code>/grammar/<fn>.json`; every item's answer comes from stored data, never from a model):
| type | exercise | answer from |
|---|---|---|
| `inflect` (also `principal_parts`, `paradigm`) `{pos, class?, lemmas?, exclude?, cells}` — a lexeme's `formsAlt: {cell: [other correct forms]}` (Onkel / Onkels) are never offered as wrong | the word + the wanted features → choose the form | the lexeme's `forms`; the other choices are its other forms (never equal to the answer) |
| `gender_article` `{pos}` | which gender / which article | the lexeme's `gender` |
| `measure_word` | which measure word (zh) | the lexeme's `measure` |
| `sentence_meaning` `{bank?}` | the sentence → its meaning among other sentences' meanings | the sentence's `gloss` |
| `build_sentence` (also `word_order`) `{bank?}` | tiles of the sentence's words + a wrong form of one of them | the sentence `text` and its `alts` (other correct orders) |
| `transform` `{bank: {functions?, variant?: "Polarity" \| "Mood" \| "Number" …}}` | a sentence + the change → build the changed sentence | the bank pair `variantOf` / `variant` |
| `quiz` | multiple choice written with the realization (`quiz: [{q, options, answer, why}]`) — for the overview and for facts that no paradigm holds | the author's answer, checked by the validator for form only |
A generator's sentences are those listing the function, or `bank: {functions: [...]}` / `bank: {frames: [...]}` (for a point no word shows, e.g. the verbless *to be* of Arabic and Hebrew). Without `generators` a function gets `sentence_meaning`, `build_sentence` and every `transform` its sentences allow. Generator names are the exercise ids of §6 (`inflect`, `gender_article`, `measure_word`, `sentence_meaning`, `build_sentence`, `transform`, `quiz`; other ids are kept for later phases and ignored by the runtime until implemented).

| id | trains | how | src |
|---|---|---|---|
| `sentence_meaning` | reading a sentence | the sentence → its meaning; distractors = meanings of other bank sentences with similar words | B |

---

## 7. Making exercises from what the learner knows

### 7.1 Three sources, in order
1. **Bank (B)** — sentences whose words are known, or — for every aspect but vocabulary (D19) — with **at most ⌈30 %⌉ of the sentence's words unknown** (`selectSentences(…, {maxUnknown: 'auto'})`, fewest unknown first; recognition and production alike). Unknown words are marked 🆕 (meaning on hover, the word card on tap) and listed at the end of the lesson; `strictKnown` restricts an exercise to known words.
2. **Paradigms (D)** — drills over known lexemes and the function's `paradigmCells`.
3. **AI** — only grading of open answers and the tutor; outputs are tokenized and checked against the form index; unknown words are underlined with a gloss when the lexicon has them. AI never produces an answer key.

### 7.2 Form index and tokenizer (`langcore`)
* From all paradigms of the course language: `form → [(lexeme, features)]` (also unvocalized ar/he forms, ar/he prefix clitics wa-/fa-/bi-/li-/ka-/al- and he ha-/ve-/be-/le-/mi-/she-, ar/he pronominal suffixes, de contractions im/am/zum/zur…).
* zh segmentation = maximum matching over the course lexicon (only known words need to be found; unknown spans are reported).
* Used for: validating bank sentences and AI text, tap-to-gloss, crediting words in `exhaustive_recall`, detecting unknown words.

### 7.3 Feasibility of a function
For (function F, language L): trainable when, with the current known sets, the bank yields ≥ 12 usable sentences for F and the paradigms give ≥ `needs` items. The grammar lane shows **🟢 ready · 🟡 thin (n sentences) · 🔒 needs node X**.

### 7.4 Refill tasks (robust "dynamic" content)
When F is 🟡 or 🔒 only because of the bank, the app offers **"✨ Ask Claude for more sentences with what I know"**: a task with F, L, the learner's known lemma ids (R and P) and the schema. Claude writes annotated sentences, `tools/validate_lang.py` checks them (forms, requirements ⊆ known, functions present), and the result is merged as a learner patch (`patches/`, private). Same mechanism and queue as the curriculum steps (§10).

### 7.5 Daily session
Input: due reviews (per language), next batches of open nodes, one trainable function, minutes. Default plan:
1. Reviews (R then P), interleaved across languages but grouped by concept.
2. **New batch learned in parallel**: the same 10–15 concepts in each active language one after another (co-located), each language only if the node is open in it.
3. One grammar function **using the words just learned** (bank + drills).
4. Two minutes of reading or a polyglot exercise.

---

## 8. User interface

* **Course home**: flags of the active languages, each with progress ring and "due" badge; lanes **Vocabulary · Grammar · Script · Reading · Writing · Compare**; the daily session button. The explanation language is shown in the header ("explained in English").
* **Flag card** (one component for concepts, functions, sentences, fields): content in one language at a time; a vertical rail of small flags, each with a state dot (✅ mastered, 🟢 known, 🟡 learning, 🔓 open, 🔒 locked); click → that language's realization loads in place; **⇄ Compare** opens the aligned table of all course languages. The last chosen language is remembered per card type.
* **Word card** (the flag card of a word, `langcore.wordCard`): principal parts (article/plural, unit noun, root, pinyin + measure word), then the profile in sections — Meanings · In sentences (register and context chips, translation, unknown words marked) · Goes with · Verbs built on it · Idioms, sayings and quotes · Synonyms by register · Opposites · ⚠️ Watch out · Subtleties · Where it comes from · Fun facts — and the feeling / connotation / status / frequency badges. The flags switch the same concept to another language.
* **Field map**: the whole field (e.g. 200 vegetables) as a picture grid grouped by subgroup, coloured by state in the chosen language; tier dividers; tap an item for its card.
* **Vocabulary DAG view**: reuses the curriculum map component (`curmap`), with node states for the chosen language.
* **Grammar function page**: realization in the chosen language (summary, blocks, paradigm, "ask yourself", traps, examples), the flag rail for the other languages, comparison strip at the bottom, the feasibility light and its exercises.
* **Text rendering**: `lang` and `dir` on every foreign span; fonts Noto Naskh Arabic, Noto Sans Hebrew, Noto Sans SC/TC; vowel-mark level per language; transliteration toggle; zh pinyin ruby above characters (toggle).
* **Input**: on-screen keyboards for ar and he (with vowel marks), pinyin with tone numbers → marks, character choice for zh, umlaut/ß buttons for de; physical keyboard always works.
* **Tutor**: language context (function or node + language), known vocabulary of the language (capped list), rule "use known words; at most one new word per sentence, glossed"; intents per button (explain this rule, compare the languages, quiz this node, a conversation with only known words). The 💡 on any part works as elsewhere.

---

## 9. Parallel learning (polyglots)

1. **Shared concepts, independent progress**: one DAG; states per language (D2).
2. **One common order (D13, hard constraint)**: every subject shared by several languages has the same place in all their paths (§4.4.3); a language may have extra steps or skip some, never a different order.
3. **Same thing at the same time**: the daily session teaches a batch in all open languages back to back; grammar pages always carry the other languages (flags + comparison strip); a function absent in a language says how that language expresses the meaning.
4. **Bridges**: cognates and loans across course languages and the learner's known languages (Semitic roots shared by ar and he; Arabic loans known from Turkish; …). Shown on the card and trained with `cognate_bridge`.
5. **Interference control**: a fixed colour per language; cross-language confusables drilled together; `which_language`; comparison notes flag the classic transfers (e.g. ar vs he negation, gender of cognate nouns that differs).
6. **Load control**: `depth[lang]` and the active languages of a session; the field map shows tiers so the exhaustive tail is a choice, not a wall.

---

## 10. Creating courses and content through Claude

* **✨ New language course** (subject picker): title, languages, explanation language (default English), depth per language, known languages. Like curricula, three ways: the app with a Claude key, the Claude app with the connector (recommended), or Claude here in Cowork for the shared library.
* **Task kinds** (same queue machinery as `NoemaCurJobs`): `lang.core` (spine + field lists + DAG), `lang.node` (one node × one language: lexemes + paradigms + bank sentences), `lang.function` (realization + paradigm cells + bank), `lang.compare` (one function across the course languages), `lang.script`, `lang.refill` (§7.4). Each task text contains the relevant part of this spec, the schema and the validator command — and the parallel order (D13, §4.4.3): a task that adds a language or a node, or moves one, places it on the common order of all the languages of the app. **Adding a language starts with its typological profile** (`_typology/languages.json`, every feature) **and its catalogue of phenomena** (§4.11: tagged, every feature it has or lacks, no point of view, D16) and its `wordFeatures`; every word task fills the word's whole facade (D14) and gives every meaning its concept (D15).
* **Skill**: `skill/noema-pack-builder/LANGUAGES.md` (authoring rules from §4 and §11), tools in the toolkit.
* Night generation works as for curricula: queue many `lang.node` tasks.

## 11. Correctness and validation

* `tools/schemas/noema.lang.v1.schema.json` + `tools/validate_lang.py` (offline, part of `build.py`):
  the parallel order across all the languages and types of all the courses (D13, §4.4.3), the catalogue of phenomena of every course language (§4.11), every word's facade complete and typed (`features` per `wordFeatures`, D14), `contrasts` for every concept with several words, every profile sense a concept or `of` another (D15), ids unique, references resolve, word profiles complete (§4.6), DAG acyclic, each concept in one node, every concept of a node realized or `absent` in every language, paradigm cells complete, unvocalized = stripped vocalized, pinyin syllables and tone marks valid, every bank token's form equals its paradigm cell, text = joined tokens, functions really present, frames realized in all languages (or `absent`), tiers ordered, field `sources` present, all texts present in `explainLang`.
* `tools/lang_refcheck.py` (network, run by Claude while authoring): compares lexemes and paradigms with **Wiktionary data (kaikki.org)**, **CC-CEDICT** and **Unihan** (zh), **UniMorph** where available, **Make Me a Hanzi** (strokes/components); writes `ref` and a discrepancy report. **Unresolved discrepancies fail the build**; an intentional difference needs `ref.override` with a reason.
* Images: Wikidata P18 / Commons via the existing picture library (`imglib`), recorded in `media.json`.
* Sentences: Tatoeba (parallel sentences) may seed the bank, always re-annotated and validated.
* Tests: unit tests for `langcore` (states, scheduler, gating, known sets, feasibility, selection, form index, segmentation, transliteration, vowel stripping, pinyin) + Playwright tests for every widget and view, with a hand-checked mini course (`tests/fixtures/lang-mini/`, 4 languages, 11 concepts, 2 functions).

## 12. Code layout

| File | Role |
|---|---|
| `tools/langlib.py`, `tests/fixtures/lang-vectors.json` | the shared helpers in Python (cells, vowel marks, pinyin, joining tokens) and the vectors both twins must pass |
| `engine/langcore.js` | pure module (no DOM; also runs in Node and in the connector): loading the course packs, state machine, SM-2 two-track scheduler, gating, known sets, form index, tokenizer/segmenter, feasibility, bank selection, session planner, script utilities (strip marks, positional forms, pinyin numbers ↔ marks, transliteration) |
| `engine/lang/*.js`, `engine/lang/lang.css` → `engine/langui.js`, `engine/langui.css` (built) | the language-course UI, a bundle of its own, loaded **instead of** `engine.js` when a language course is open (so the subject engine is untouched): `00_base` (helpers, word rendering, storage), `10_shell` (top bar, routes, home, vocabulary map), `20_cards` (node page, flag card, compare, word card), `30_vocab` (field map, name-them-all, settings), `40_ex` (exercises), `50_session` (the session runner); later `60_grammar`, `70_script`, `80_input` … |
| `library/languages/<id>/course.pack.js` (built) | the whole course as one script (`window.NOEMA_LANGPACKS[id]`); the registry lists it under `languages` |
| `tools/validate_lang.py`, `tools/lang_refcheck.py`, `tools/schemas/noema.lang.v1.schema.json` | validation |
| `tools/build.py` | builds `core.pack.js` / `<code>.pack.js`, registry entries `kind: "language"` |
| `library/languages/<course-id>/` | the pilot course |
| `tests/langcore.js`, `tests/lang_validate.py`, `tests/lang_ui.js`, `tests/fixtures/lang-mini/` | tests |

Existing subjects and curricula must keep working unchanged; the language part is additive.

## 13. Implementation plan (in this order)

**P0 — Spec and validation**
- JSON Schema; `validate_lang.py` with every check of §11; mini fixture course (ar, he, zh, de; 11 concepts in 3 nodes; 2 functions; 27 bank sentences — small enough to be checked by hand); negative fixtures (wrong form, missing cell, unknown lemma, cycle, missing language).
- ✔ Validator passes the fixture and rejects each broken variant with a clear message.
- Done: `tools/validate_lang.py`, `tools/langlib.py`, `tools/schemas/noema.lang.v1.schema.json`, `tests/fixtures/lang-mini` (11 concepts, 3 nodes, 2 functions, 27 sentences), `tests/lang_validate.py` (vectors, schema, 24 kinds of mistakes). Hooking the validator into `tools/build.py` comes with the first course in `library/languages/` (P2), so `build.py` stays untouched until then.

**P1 — `langcore` runtime**
- Loading, two-track SM-2, item/node/function states, gating per language, known sets, form index with clitics, zh segmentation, feasibility, bank selection, session planner, script utilities.
- ✔ `node tests/langcore.js`: deterministic tests for every rule of §5 and §7.
- Done: `engine/langcore.js` (not loaded by the app yet) with 61 checks, incl. property tests over 200 random learners (sentences only use known words; no node opens before its prerequisites) and a round trip of every bank sentence through the tokenizer.

**P2 — Pilot content v1** (written by Claude here, validated and ref-checked)
- Explanations in English; core spine node 1–2 (~120 concepts) + `food.vegetables` tiers 1–3 (exhaustive, with images) in ar, he, zh, de; script modules (ar, he letters; zh characters of the included words); 3–4 functions (gender, plural, present tense / basic sentence, definiteness).
- Every content word gets its full profile (§4.6); senses, etymologies and forms are drawn from the reference data.
- ✔ `validate_lang.py` and `lang_refcheck.py` clean.
- **How it is produced** (decided 2026-10-08): in batches of nodes; per batch one Claude worker per language writes `lang/<code>/…` from a brief that points to §4–§4.8 and the mini course, grounds every word in Wiktionary (`lang_refcheck.fetch`) and must leave `validate_lang.py --lang <code>` and `lang_refcheck.py --lang <code>` clean; then the bank is read back through `langcore` (`tests/lang_courses.js`) and a sample is reviewed by hand. The language-neutral core (fields, DAG, frames, functions) is written first, by the main session.
- **Course** `library/languages/polyglot-semitic-zh-de` — field `food.vegetables`: 163 vegetables in 10 subgroups (25 tier 1 · 58 tier 2 · 80 tier 3) from Wikipedia's list + Wikidata (ids; Wikipedia editions as the measure of how known a vegetable is) + additions for the course cuisines; herbs, mushrooms, pulses and fruits are separate future fields. DAG: core.1 → veg.1 → veg.2a / veg.2b → veg.3a / veg.3b. Frames: 10 (eat, buy, like, not like, want?, this is, where is, have, is here, drink what). Functions: definiteness, noun plural, negation, yes/no questions.

| Batch | Nodes | ar | he | zh | de |
|---|---|---|---|---|---|
| 1 | core.1 (23 concepts) + veg.1 (25) | ✅ 51 words · 59 sentences | ✅ 53 · 75 | ✅ 60 · 48 | ✅ 51 · 67 |
| 2 | veg.2a (37) + veg.2b (21) | ✅ 26 words + 31 absent · 95 sentences | ✅ 34 + 24 absent · 109 | ✅ 53 + 4 absent · 202 | ✅ 56 + 2 absent · 184 |
| 3 | veg.3a (40) + veg.3b (40) | ✅ 13 + 67 absent · 73 | ✅ 14 + 66 absent · 69 | ✅ 53 + 27 absent · 224 | ✅ 59 + 21 absent · 149 |
| 4 | core.2 … (numbers, adjectives, colours, more verbs) | ⬜ | ⬜ | ⬜ | ⬜ |

**P3 — UI shell and vocabulary lane** — ✅ v1 2026-10-08
- Done: `tools/build.py` builds the course pack and the UI bundle and lists the course in the registry (`languages`); the subject picker has a 🌍 Languages tab and `?subject=lang:<id>` opens a course; top bar with the explanation language and one chip per language (progress ring); home with today's session and the vocabulary map (node states per language); node page; flag card with the state dot of every language, ⇄ compare table, the full word card (§4.6); field map (all tiers, subgroups, “show words not learned yet”); ⏱️ name them all (any form, without vowel marks, transliteration or pinyin; learned words named count as production reviews); settings (active languages, depth per language, batch, minutes, vowel marks / transliteration / pinyin); the session runner — reviews, then each new idea introduced in every language one after the other, recognized (meaning among same-subgroup distractors) and produced (letter or character tiles in any script, typing for Latin script; then the German article or the Chinese measure word), wrong answers once more a little later; state stored per (language, node) through `Noema.kv` (synced like every key). `tests/lang_ui.js` (34 checks, incl. phone width, per-language unlocking and the picker).
- P3b ✅ 2026-10-09: concept pictures shown wherever a concept appears (tiles, card head, exercises; `conceptPic`, the emoji when there is none; files in `core/media/` copied next to the pack, provenance in `media.json`), the **picture → word** exercise in reviews, **🧩 sorting a field into its subgroups** (`#/sort/<field>`), the **🔁 principal-parts drill** (`#/parts/<lang>`), progress across devices (§5.6, `tests/lang_sync.js` over the Supabase emulator). Only 5 of the 162 vegetable pictures exist yet → §13.1.
- Course in the picker (`kind: "language"`), course home with flags, flag card + compare, the word card with the whole profile, field map, DAG view, `learn_batch`, `recognize`, `picture_name`, `spell`, `gender_article`, `principal_parts`, `measure_word`, `exhaustive_recall`, `field_map` sorting; daily session v1; sync of the state keys.
- ✔ Playwright: a new learner opens the course, learns a batch in two languages, reviews it, a node becomes known and the next opens only in that language; reload/sync keeps everything.

**P3c — Foundations, paths and the overview (D9–D11)**
- Model: `typology` per language; node kind `lesson` with `step` and `functions` (list, or by `"*"` / type / language), optional `path`, `langs`; applicability (`na`) and per-language ownership; lesson check stored per (language, node); gating by "passed" (§5.2); `core/typology.json` and the overview realization (`fn.overview`). Validator: per language the applicable lessons form a chain, every lesson function of the language has a realization there, ownership at most once per language, fields require the last lesson, overview and quiz shapes.
- Grammar lane, the part the foundations need (pulled forward from P5): function page per language (summary, blocks, ask yourself, traps, bank examples, flags and comparison), generators `inflect`, `gender`, `measure`, `meaning`, `build`, `transform`, `quiz`; the lesson runner with path groups; the lesson check.
- Content: the steps S00–S18 for the pilot languages (paths `fusional`: ar, he, de; `isolating`: zh; the `agglutinating` and `polysynthetic` columns are written as grammar plans now and realized with the first such language) — `core.1` reorganised into the steps and completed: words with full profiles, grammar realizations with `status`, generators and bank sentences with variants for every function, the overview of each language; validated `--strict` and ref-checked; produced in batches of steps, one worker per language, as in P2.
- ✔ Playwright: a new learner does S00 and S01 in a fusional and the isolating language together, the next lesson opens only in the languages that passed, the vegetables stay locked until the foundations are done; every sentence shown uses only known words (property test); `na` lessons never show.

**13.1 Tech debt** (to do after the implementation is finished and tested — asked by the user 2026-10-09)
- **Pictures.** Fetch the pictures of the remaining 157 vegetables with `tools/lang_images.py COURSE --field food.vegetables` (re-runnable; Wikidata P18 → Commons thumbnail + author / licence). The cloud workspace is rate-limited by Wikimedia; it runs from the Mac (the P18 file names were already resolved there on 2026-10-09). Then give the concrete concepts of the other fields (animals, food, clothes, body, home, town, transport …) their Wikidata ids and pictures; check every picture by eye (P18 is sometimes a botanical plate or a field).
- **Content after K1** (asked by the user 2026-10-09: no more content until the implementation is finished and tested): core batches K2–K12 (C05–C48) with `tools/lang_sources/core/mkcore.py` + the briefs; then the advanced stage.
- **Found while writing K1** (to fix with the next content batches): the foundation verbs store only some cells (he: past 3sg / future 2nd person; de: Präteritum 3sg; ar: no jussive / subjunctive) — complete their paradigms; zh tokenizer: a new multi-character word can break older sentences that split it (回家), separable verbs split by 了 / 个 (洗了个澡), 第十一+; he: וָ before numbers, cardinals with the article; ar: لِلْـ, construct forms, kinship nouns in the accusative with a suffix; missing concepts: the future / passive auxiliary (de werden), the durative 着, grammar particles (لَمْ، لَنْ، سَـ، سَوْفَ، قَدْ), 次 (zh), pending senses reported by the workers (anziehen *attract*, 洗 *develop photos*, حَجَزَ *detain* …); a few concept glosses carry Chinese-only senses (verb.start, verb.finish) or the wrong focus (verb.visit "a sick person"); he `language.json`: NOUN class `cal` used for names (חוּץ לָאָרֶץ); is 是…的 too late at C43? (a D13 question).

**P4 — Scripts and input**
- `glyph_form`, `transliterate`, `vowelize`, `tone_mark`, `char_compose`, `trace`; script stages; keyboards and pinyin input; RTL and fonts; vowel-mark fading.
- ✔ Widget tests per type, including RTL layout on a phone viewport.

**P5 — Grammar lane**
- Function pages with procedures and traps; `paradigm`, `inflect`, `analyze`, `morph_build`, `root_pattern`, `agree`, `build_sentence`, `word_order`, `transform`, `contrast`, `parse`, `gloss`, `proofread`, `combine`; feasibility lights; refill tasks (queue + validation + merge).
- ✔ Every generated item uses only known words (property test over random learner states); refill round-trip test with a mocked Claude answer.

**P6 — Polyglot layer**
- Comparison tables and strips, bridges, confusables, `parallel_translate`, `parallel_align`, `which_language`, `cognate_bridge`, `compare_rule`; interleaved sessions; depth per language.
- ✔ Tests for comparison rendering and parallel exercises over shared frames.

**P7 — Production and reading**
- `translate` (tiles → typed → AI fallback labelled), `rewrite`, `expand`, `guided_compose`, `graded_reader`, numbers/time/date, `register`, `dialogue_turn`; tutor language mode and intents.
- ✔ Mocked-Gemini tests: AI output checked against the form index; unknown words glossed; AI never used as an answer key.

**P8 — Through Claude**
- New-course flow, task kinds in the app queue and the connector, skill guide, refcheck in the toolkit, night queueing of nodes.
- ✔ Connector and app-queue tests like the curriculum ones.

**P9 — Listening and speaking** (later): speech synthesis for words and sentences, dictation, shadowing; then speech recognition.

Working rules for every phase: read this file first; keep existing subjects untouched; full test suite green; files written into the Mac repo; commit with a clear message; update the status table above and §14.

## 14. Changelog
- 2026-10-09 — Core batch K1 (C01–C04) in ar, he, zh, de; `main` merged into `languages` (sync rules, i18n; conflicts in `loader.js` and `build.py` resolved as docs/SHELF_AND_LANGUAGES.md says). P3b finished: pictures shown with an emoji fallback, picture → word, 🧩 field sorting, 🔁 principal parts, progress across devices (`mergeLang`, `noema:remote`, `tests/lang_sync.js`). German ordinals are ADJ class `attr`. §13.1 tech debt: the pictures themselves, content after K1 (the user: implementation first), the issues found while writing K1.
- 2026-10-09 — D18 and D19 (asked by the user): the learner's languages (with levels) decide what is explained — familiar parts hidden in one line, inference by type / family for languages without a profile, comparison notes for a reference set of 21 languages of every type (+ Claude / Gemini notes on request), the library of peculiarities; vocabulary as its own track after the foundations, every other aspect trained with any vocabulary (≤ ⌈30 %⌉ unknown words per sentence, 🆕 with the word card, the list at the end of a lesson), every field with sentences for every non-vocabulary node before it.
- 2026-10-08 — D17 (asked by the user): the core grows from C01–C07 to **C01–C48** (A2 → B2, §4.4.2; to be reviewed with the user before the content is written) and the **advanced stage** is open-ended (§4.4.4: fields, grammar, lexicon, varieties, texts, culture). `docs/LANGUAGE_RULES.md` — the binding short form of D1–D17 for every agent, tool and skill — with `CLAUDE.md`, `AGENTS.md`, the skill reference, `tools/lang_sources/AGENT_BRIEF.md` and `tests/lang_rules.py` that keeps them in step.
- 2026-10-08 — D16 (asked by the user): no built-in point of view — the shared typological vocabulary (130 features after WALS) and the profiles of 74 languages of 20 families (`_typology/`, checked against the WALS CLDF data: 2410 of 2459 comparable values agree, the rest deliberate); every phenomenon tagged with the feature values it is about, every feature covered for each language (absences as `kind: "lacks"`); what is new / familiar for a learner is computed from the learner's languages (the overview shows it).
- 2026-10-08 — D14 and D15 (asked by the user): the **catalogue of phenomena** of each language (`_phenomena/<code>.json`, §4.11) — written for ar (100 phenomena), he (88), zh (109), de (90) with distinctions, polysemy and concept gaps; the **facade of a word** — `wordFeatures` per part of speech in `language.json`, every word's `features` complete (§4.5.1); `contrasts` when a concept has several words (§4.5.2); **every distinct meaning a concept** (640 new pending concepts from the four lexicons, `pending` in §4.3; ~2,700 senses linked to concepts, ~380 marked `of` another sense), senses `of` another sense for nuances. The four lexicons now state their whole facade (ar 58, he 56, zh 73, de 32 parameters over the parts of speech) and 809 contrasts. A word's other meaning may be a concept taught earlier by another word (it becomes one more word for it); a grammar word may sit in a lesson with a meaning not taught yet (its `role` says why). Tools: `tools/lang_phenomena.py` (coverage report, claims checked against the implementation, part of the test suite); the word card shows the meanings (the one shown first, the others linked, forms per meaning, the contrast) and the facade.
- 2026-10-08 — D13 (asked by the user): **the parallel order is a hard constraint** — all the paths of all the languages (and of the four language types) keep one common order of the subjects; extra or missing steps in between are fine, opposite orders are not; a subject moves in all languages at once, after analysing all of them (§4.4.3). The foundations S00–S18 already satisfied it (one shared node order; type and language grammar inside the common steps). `validate_lang.py` now checks it within a course and against every other course in `library/languages` (with negative tests: two subjects in opposite orders, a circle through three paths, a second course in another order); the daily session offers free grammar in the course order too (it was ordered by the number of prerequisites).
- 2026-10-08 — Content batch B6 (S16 adjectives with their full paradigms — German strong / weak / mixed, Arabic gender × number × case × definiteness and the elative, Hebrew four forms ± article; S17 colours and comparison; S18 linking words and subordinate clauses): **the foundations S00–S18 are complete in Arabic, Hebrew, Chinese and German** (466 / 476 / 633 / 575 words with full profiles, ~1000–1400 bank sentences per language), the whole course validates `--strict`, no disagreement with Wiktionary. The overview of each language describes its path through the 19 steps. Build: the word profiles go into `course.profiles.js`, loaded after the course has opened (the course file halves to ~4 MB). Evidence tags may be alternatives (`[["CMPR"], ["SPRL"]]`); transform generators honour `bank.frames`; labels for German strong / weak / mixed endings.
- 2026-10-08 — Content batch B5 (S13 going and coming, transport, the imperative; S14 the days and the day, with Chinese aspect 了 / 过 / 在; S15 months — Arabic in both naming systems —, seasons, units of time, prepositions of time) in all four languages. Tools: German separable verbs (the particle as a `V;SEP` cell; such verbs are left out of plain inflection drills), erhua syllables (huìr) checked without their r, multi-word names.
- 2026-10-08 — Content batches B3 (S07 verbs in the present with the direct object, S08 negation, S09 yes/no questions) and B4 (S10 question words + jobs, S11 in / at / to, from, with + places, with the Greek σε / από / με table; S12 prepositions of place + rooms) in all four languages. Tools: the tokenizer reads a vocalized word exactly before trying prefixes, and accepts a prefix before a multi-word word; the tag PFX for forms after an attached preposition (never offered as wrong); a grammar word met early with a role may carry a concept taught later (Hebrew לְ = "to"); generators may filter by concept prefix; refcheck follows "alternative form of X." with its full stop.
- 2026-10-08 — Content batch B2 (S05 numbers and the plural, S06 to have, the family, possessives) in all four languages: complete family systems (Chinese and Arabic paternal / maternal words, cousins), numbers 0–1000 with their forms (Arabic gender polarity and dual, Hebrew masculine / feminine sets), possessive suffixes as cells. Tools: owners of possessed forms in the cell labels (“owner: my”), Arabic hamzat al-waṣl inside a sentence, erhua vs the syllable ér (女儿), `formsAlt` and `exclude` for drills, wrong tiles never differ only in capitals.
- 2026-10-08 — D12 (asked by the user): verbs, cases, clauses, aspect and mood in the foundations — the basics, in the form of each type: present tense in all persons (S07), nominative (S04) and accusative (S07), cases after prepositions (S11–S13), the imperative (S13), subordinate clauses (S18); the core grammar C01–C07 after S18 (§4.4.2, `stage: core`). The words of the articles move to S01 (natural first sentences); names in the bank as `name` tokens; variant labels for gender, tense, address, deixis; Arabic and Hebrew word cards show feminine and plural; sentence-meaning distractors never mean the same (same concepts). Content batch B1 (S00–S04) written in all four languages.
- 2026-10-07 — first version (decisions D1–D8, catalogue, model, exercise types, plan P0–P9).
- 2026-10-07 — §0 development isolation (branch `languages` in its own worktree); the mini fixture made smaller so every form can be checked by hand.
- 2026-10-07 — P0 and P1 done. Items are words, not concepts (§5.1); states are derived, never stored; `prefix`, `parts`, `senses: []` + `role`, `citationCells`, `plene` added to the model.
- 2026-10-08 — Word profiles (§4.6): every content word in depth (senses, examples by register and context, collocations, particle verbs, phrases and quotes, synonyms by register, etymology, pitfalls, subtleties, feeling, fun facts) — schema, validator, mini course (24 profiles), `langcore.wordCard`; exercise types `register_pick`, `nuance_pick`, `connotation`, `idiom_meaning`, `example_cloze`, `sense_pick`, `etymology_link`. `tools/lang_refcheck.py` (Wiktionary via kaikki.org) found two real mistakes in the mini course (דְּלַעַת plural, 黄瓜 measure word), now fixed.
- 2026-10-08 — P2 started: the vegetables field (163 concepts, tiers and subgroups, Wikidata ids), the core spine node core.1, 10 frames, 4 functions; batch 1 (core.1 + veg.1) written in all four languages, 215 words, 249 sentences, every word with its full profile, everything validated and ref-checked. Runtime and tools grown with it: nodes not yet written are “unprepared” (they block what follows, in that language only) and `validate_lang.py` treats them as warnings unless `--strict`; multi-word words (תַּפּוּחַ אֲדָמָה, Rote Bete) are one token; prefix spellings (`alts`: וּ for וְ); `evidence.punct` for questions; erhua pinyin (哪儿 nǎr); refcheck keys `pos | meaning | gender | <cell> | pinyin | trad | measure` for `ref.override`, all genders, determiners filed as pronouns, pronoun rows, German preterite, full spellings (plene) for Hebrew look-ups; `tests/lang_courses.js` reads every course back.
- 2026-10-08 — P2 batch 2 (veg.2a + veg.2b) in all four languages (169 words, 61 marked absent with what people say instead, 590 sentences). Refcheck: hyphenated glosses (water-cress), apostrophes in Wiktionary pinyin (lián'ǒu), Hebrew/Arabic pages that only say “defective spelling of X” are followed to X.
- 2026-10-08 — P2 batch 3 (veg.3a + veg.3b): the whole vegetables field now exists in all four languages; the course validates with `--strict`. Fixes from the workers' reports: wh-questions are no longer counted as yes/no questions (`evidence.exclude`: the wh-words), plural-only nouns (`NOUN.plt`, no gender: die Edamame), the German word card shows the article with the form used after it (der Gute Heinrich), refcheck matches whole words without accents (hen ≠ Chenopodium, jícama), reads the concept's `aka` (the Wikipedia title, often the scientific name) and the full-spelling page when the short spelling is another word (כרכום ≠ כורכום), and reports explanations that are no longer needed. Open: Arabic fixed phrases that exist only with the article (حَبُّ الْعَزِيزِ) need a definite-only noun class; words with no Wiktionary entry are only “unverified” (a second source — e.g. CC-CEDICT, Duden — would close that gap).
- 2026-10-08 — D9–D11 revised (asked by the user): **one spine of 19 parallel steps** (S00–S18) for every language, the paths of the four types as the per-step grammar of each type (agglutinating and polysynthetic included), links to the same point in the other languages; **complete thematic groups** in the foundations (extended family, days, months, seasons, places, food, jobs, colours…), words chosen to combine in sentences; greetings right after the pronouns; the core prepositions *in/at/to, from, with* and the linking words in the grammar; vocabulary in every lesson for every type.
- 2026-10-08 — D10 and D11 (asked by the user): **teaching paths by language type** (isolating, agglutinating, fusional, polysynthetic; the languages of a polyglot course grouped by path) and **lesson 0 = an overview** of the language types and of the language with its peculiarities; the foundations extended (demonstratives, numbers, yes/no and wh-questions, prepositions of place, of time and the others); §4.4 applicability and per-language ownership; §6.7 generators. Replaces the single foundations chain of the D9 entry below.
- 2026-10-08 — D9 (asked by the user): **foundations first** — mixed lessons F1–F10 (pronouns and *to be*, gender, number, *to have*, negation, questions, prepositions, verbs of movement and the present tense, first everyday verbs, adjectives) before the thematic fields; node kind `lesson`, gating by a passed lesson check (§5.2), the lesson flow (§6.7); new phase P3c, which pulls the grammar pages and sentence exercises the lessons need forward from P5.
- 2026-10-08 — P3 v1: the language-course UI as its own bundle (`engine/lang/*` → `langui.js/css`), loaded instead of the subject engine. Registration points touched in existing files, as §0 allows: `tools/build.py` (course packs, UI bundle, registry key `languages`, site copy), `engine/loader.js` (🌍 Languages tab in the picker, `lang:` subjects start the language UI), `engine/src/30_shell.css` (the picker's mode tabs fit three). Ordinary subjects and curricula take the same code paths as before.
