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
| P4 | Script modules (Arabic, Hebrew, Chinese) + keyboards + RTL | ✅ 2026-10-09 (script modules as data + `tools/lang_script.py`; 🔤 script lane with stage; glyph_form · transliterate · vowelize · tone_mark · char_compose · trace · spell; keyboards and pinyin input for every typed answer; vowel-mark fading; tokenizer fixes) |
| P5 | Grammar lane: functions, paradigms, decision procedures, generators, feasibility, bank refills | ✅ 2026-10-09 — the ten missing exercise types of §6.3 / §6.4 (paradigm, analyze, morph_build, root_pattern, agree, contrast, parse, gloss, proofread, combine) as generators + widgets, offered automatically where the data allows; feasibility lights by the D19 rule; the 📐 grammar lane on the home; one function with the words just learned in the daily session; the validator checks the generators — refill tasks (§7.4) wait for the P8 queue |
| P5v | **Vocabulary depth** — the remaining §6.2 types (roots, compounds, semantic splits, collocations, confusables, intensity, register, nuance, connotation, idioms, cloze, senses, origins), all from the stored words and profiles; 🏋️ on the word card and the node page, 1–3 deepening items in the daily session | ✅ 2026-10-09 (`langcore` deepening section, `engine/lang/75_vocab2.*`, `tests/lang_vocab2.js`; intensity data exists for 6 words only) |
| P6 | Polyglot layer: comparisons, bridges, confusables, parallel exercises, interleaved sessions | ✅ 2026-10-09 (`parallel_translate`, `parallel_align`, `which_language`, `cognate_bridge`, `compare_rule`; the ⇄ compare lane per concept / function / frame; bridges and false friends on the word card; one polyglot item in every daily session of ≥ 2 languages, confusables side by side; a colour per language; today's languages chosen on the home) |
| P7 | Production and reading: translation, guided writing, graded readers, tutor language mode | ✅ 2026-10-09 (✍️ Writing and 📖 Reading lanes per language: translate tiles → typed with deterministic acceptance and an AI-judged fallback, rewrite / expand, guided writing with a rubric, numbers / clock / date, register and dialogue turns, graded readers with questions and AI-written texts checked by the tokenizer; 🎓 the tutor in a language) |
| P8 | Course creation and generation through Claude (app queue + connector + skill + refcheck) | ✅ 2026-10-09 — ✨ new language course (account course: skeleton, three ways), task kinds `lang.core` · `lang.node` · `lang.function` · `lang.compare` · `lang.refill` with checks in JS and merges, 🌙 night queue, connector tools `noema_lang_*`, skill `LANGUAGES.md` + `lang_course.py` in the toolkit |
| P9 | Listening and speaking | ✅ 2026-10-09 (the browser's own speech services, no server, no key: 🔊 on word cards, examples, bank sentences, the intro, feedback, the reader and the compare views; `listen_pick`, `listen_tone` (zh), `dictation`, `listen_meaning`, `shadowing` (MediaRecorder, self-graded), `speak` (SpeechRecognition, compared with the stored forms; shadowing without it); the 🎧 lane per language; voice per language, rate, auto-play, “I can't listen / speak now”; up to two items in the daily session) |
| QA | The whole language part end to end: every lane, view and exercise walked through as three learners on 1280 and 390 px; fixes | ✅ 2026-10-09 — the home organized (session · next lesson · lanes per language · grammar · the map near you), the first lesson from the big button, the next lesson offered at the end, answers no longer given away (deepening, principal parts), every foreign script run with its lang, readable reading titles and language names; `tests/lang_walkthrough.js` |
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
  `index.html`, the subject picker, the boot and the frame's `registerWorld('lang', …)` in `engine/loader.js`, two small
  hooks in `engine/shell.js` — §8 *Inside the frame*), and only for courses with `kind: "language"`; ordinary subjects and
  curricula take exactly the same code paths as before.
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
With the browser's own speech services only — no server of the app, no key. What is heard is always a **stored** word or a
stored bank sentence; what is said is compared with **stored** forms (D3) — never judged by an AI.
- **Synthesis** (`speechSynthesis`): every course language has a BCP-47 tag — `speechLang` in `language.json` (optional),
  else ar-SA, he-IL, zh-CN, de-DE (`langcore.speechTag`). The voice is the one the learner chose for the language in
  ⚙️ Settings, else the device's best match (`pickVoice`: the same tag, then the same language, local voices first — never a
  Cantonese zh-HK / zh-MO / yue voice for Mandarin; he = iw). The stored text is sent **as written** (with its vowel marks,
  not the faded display, §8). Rate: normal (1) or slow (0.7). A language without a voice on this device: its 🔊 says so
  once (no error) and its audio exercises are not offered.
- **Recording** (`getUserMedia` + `MediaRecorder`): only for shadowing; the recording lives in memory for the item and is
  never stored or sent.
- **Recognition** (`SpeechRecognition` / `webkitSpeechRecognition`; the browser may use its vendor's service — the settings
  say so): the transcript and its alternatives are compared with the stored forms (`checkSpoken`): word by word through the
  form index (without vowel marks, the full Hebrew spelling, the Arabic hamza seats / ى / ة folded, any capitals — case is not
  heard —, digits read as the course's number words), Chinese as the same characters or the same syllables with the same
  tones (a homophone such as 他 / 她 is right: the ear cannot tell them apart). Where recognition is missing, a speaking item
  is offered as shadowing.
- **Chinese tones by ear**: one syllable of a known word, heard through the **whole word's** audio (one syllable alone is
  unreliable in synthesis) → its **spoken** tone: the dictionary tone, changed only by the sure rules (3 + 3 → 2 + 3 in a
  word of two or three syllables, the word's stored `toneSandhi` for 一 / 不); a syllable whose spoken tone is not sure
  (longer runs of third tones, 一 / 不 without a stored spoken form) and a word with several readings (`readings`) are not asked.
- **Settings** (the course's `prefs`, synced like the other view preferences; a voice is per device — where the chosen voice
  does not exist the automatic choice is used): a voice per language, the rate, auto-play of new words in the session,
  “I can't listen now” and “I can't speak now” (for today: no audio items / no speaking items).

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
    script.json               (ar, he) letters with positional/final forms, sounds, order of teaching (§4.9)
    chars.json                (zh) characters: pinyin, components, radical, stroke data, simplified/traditional (§4.9)
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
Reference data, not course content: built and checked by `tools/lang_script.py` (`build <course>` / `check <course>`), checked again
by `validate_lang.py` for every course language that has one (a missing module is a warning), shipped in the course pack
(`data.langs.<L>.script` / `.chars`) and read by `langcore.scriptModule`.
* ar, he `lang/<L>/script.json` (`noema.langscript/v1`): `letters` — `ch`, `name`, `translit` (the course's own scheme: DIN 31635 with
  j for ج; the simple Hebrew scheme ch / ts / sh), `sound` (IPA), `forms` (ar: `isolated` / `initial` / `medial` / `final`, written with
  ZWJ so any font shapes them; he: `regular` / `final`), ar `joins` (`dual` · `right` · `none`, **derived from the Unicode presentation
  forms** — the six non-connecting letters and the hamza fall out of it; alif maqṣūra is final-only in Arabic), ar `sun`, the hamza seats,
  tāʾ marbūṭa, alif maqṣūra, alif waṣla, the lām-alif ligature; he the dagesh letters that change the sound (בּ כּ פּ), shin / sin and the
  five final letters (`finalOf`); `marks` — the ḥarakāt / niqqud with `kind` (`vowel`: one per letter · `shadda`: šadda / dagesh, with a
  vowel); `baseMarks` (he: the shin / sin dot belongs to the letter); `groups` — the teaching order, groups of similar shapes, marks
  included; `lookalikes`; `keyboard` (rows of the standard layouts, the marks, punctuation). **Complete for the alphabet**: the check
  fails when the course writes a letter or a mark the module lacks.
* zh `lang/zh/chars.json` (`noema.langchars/v1`): one entry per character of the course's words — `readings` (Make Me a Hanzi + Unihan
  `kMandarin`), `wordReadings` (readings the words use that the dictionaries lack, e.g. a neutral tone), `meaning`, `ids`
  (decomposition), `radical`, `etymology` (type, hint, semantic / phonetic part), `trad` (the traditional forms the course's words use),
  `strokes`, `medians` (Make Me a Hanzi stroke medians, 1024 box, y up: drawn at (x, 900 − y)), `inWords`. Sources: Make Me a Hanzi
  (`dictionary.txt` LGPL, `graphics.txt` Arphic Public License) and Unihan, cached in `data/refcache/`; the build checks the words'
  traditional forms against Unihan's variants. The check: every character of every word is there, every word's syllable is one of the
  character's readings, every traditional form of a word is listed, readings are valid pinyin, medians well formed.

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
* **State** (`langcore.scriptState`): every letter / mark (ar, he) or character (zh) has two tracks like a word (R: reading it,
  P: writing it), the same SM-2 and the same derived states (`glyphTrackState`); a Chinese character is as known as its best word, or
  its own drills. Stored in `lang:<L>:script` (`{ items: { <letter or character>: { seen, r, p } } }`, §5.6).
* **Stage**: the module's groups in order (ar 8, he 7; zh: the characters grouped by the lesson that first uses them). A group is
  *practised* when every item is at least *learning*, *known* when every item is known for reading; the stage = the number of groups
  known from the start; the open groups = every group up to the first one not yet practised. **Complete** = every item known.
* **Daily session** (`scriptSession`): from the second day on, in the first weeks (ar, he: until the stage is complete; zh: six weeks
  from the first word), up to 3 items per language after the words: letters due again, then the next new letters (a card, then a
  question), then a drill. The 🔤 lane (`#/script/<L>`, §8) has the same drills at any time.

### 5.6 Storage (synced like every key — combined, never overwritten: docs/SYNC.md)
```
noema1:<acc>:s:lang:<course>:settings            active languages, depth, batch, the learner's languages (D18), daily minutes
noema1:<acc>:s:lang:<course>:prefs               view preferences (current language, vowel marks, compare, peek)
noema1:<acc>:s:lang:<course>:lang:<L>:node:<N>   { items: { lexId: { seen, r:{sm2}, p:{sm2} } }, check: { day, score, best, tries } }   one key per node
noema1:<acc>:s:lang:<course>:lang:<L>:fn:<F>     { log: [ { day, c, n } ] }
noema1:<acc>:s:lang:<course>:lang:<L>:script   { items: { <letter / character>: { seen, r:{sm2}, p:{sm2} } } }   the script stage (§5.5)
noema1:<acc>:s:<course>:log:<day>           session log (for statistics)
```
**Two devices** (docs/SYNC.md; `mergeLang` in `engine/cloud.js`, tested by `tests/lang_sync.js`): saves are version-checked; when both
copies of a key changed they are combined — per word and track the later review wins (same day: the one with more answers),
the earliest *seen* day is kept (the same for every letter / character of the script stage), a lesson check keeps the best score and the most tries, a function's log keeps every day
(the fuller entry of a day), settings take every field of both. An open course folds in what another device changed
(`noema:remote`), so its next save keeps both. Progress only grows.

---

## 6. Exercise types (new, on top of the existing ones)

Legend — source: **D** deterministic from stored data, **B** sentence bank, **AI** graded by Gemini (labelled "AI-judged").
Every new type gets a widget in `engine/lang/40_ex.js` with `check`, `reveal`, `given` (the learner's answer, for the tutor buttons) and keyboard support.

### 6.1 Script
| id | trains | how | src | languages |
|---|---|---|---|---|
| `glyph_form` | positional / final letter forms | pick the form of a letter in a given position (kind `position`); build a word from its letters in order — Arabic joins them as they come, Hebrew needs the final forms (kind `join`; distractors: look-alikes and the other form) | D | ar, he |
| `transliterate` | reading the script | letter → its transliteration and back (`letter`, `letter_rev`), word → transliteration / pinyin and back (`word`, `word_rev`; zh: the same syllables with other tones as distractors), character → its reading in a word (`char`) | D | ar, he, zh (pinyin) |
| `vowelize` | vowel marks | add ḥarakāt / niqqud letter by letter from a palette (one vowel + šadda / dagesh per letter; the shin / sin dot is given), live preview of the joined word | D | ar, he |
| `tone_mark` | tones, sandhi | mark the tone of each syllable (`mode: written`); for words where a sure rule changes it (3 + 3 → 2 + 3, 不 before a 4th tone → bú) also the spoken tone (`mode: spoken`) | D | zh |
| `char_compose` | characters | build a character from its components (IDS, not ⿻) among wrong parts (kind `compose`) / find the radical (kind `radical`) | D | zh |
| `trace` | stroke order and shape | draw on a canvas; zh: every stroke checked in order against its median (shape, place, direction; the stroke order can be played), ar/he: the letter as a template, then self-checked | D | zh, ar, he |
| `spell` | spelling | type the word from picture/gloss, letter-level diff (umlauts, ß, capitals, hamza, tāʾ marbūṭa, alif maqṣūra, final forms; ar/he without marks = the letters, with marks = all of them; zh: pinyin → choose characters); another word for the same concept counts | D | all |
Items: `{type, kind, lang, glyph? | lex?, track, …}` from `langcore.GEN_SCRIPT` (also registered as `GEN.<type>` for grammar generators);
a widget per type in `engine/lang/90_script.js` records the answer on the letter / character (`reviewGlyph`) or on a word the learner has met.

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
| `root_family` | roots | find the root of a word (distractors: roots sharing radicals); sort met words into their root families (ar, he: `root`) | D |
| `compound_split` | compounds | choose where a German compound splits (from `features.compound`, the head found at the end, the linker kept with its part), then its article (the gender of the head = the word's `gender`) | D |
| `sense_split` | semantic splits | a profile example of one of the words of a concept that several words share, the word gapped, with its translation, register and context → which of them (kennen / wissen, 还是 / 或者 …); several contexts sorted into the words; the explanation is their `contrasts` | D (profile) |
| `collocation` | collocations | a profile collocation with the partner of the word gapped (its translation shown) → the partner; distractors = partners of other words' collocations that occur nowhere in this word's profile | D (profile) |
| `confusables` | look-alikes | the words of one concept with its contrast as the clue (“you — social distance: formal”) → which word; look-alikes (one letter apart, the same unvocalized skeleton, the same toneless pinyin, one character apart) → which one means X; only words the learner has met | D |
| `intensity_scale` | nuance | words of one scale (sharing a concept or naming each other as synonym / antonym) with `profile.intensity` → which is stronger / order them weakest → strongest (only where the data has two or more values) | D (profile) |
| `register_pick` | register | the word and its synonyms → which fits this situation (formal letter, friends, literature, slang, a region …)? only when exactly one of them carries that register | D (profile) |
| `nuance_pick` | subtleties | the nuance of one synonym (the words themselves masked) → which synonym; the explanation lists every nuance | D (profile) |
| `connotation` | feeling and strength | positive / neutral / negative (/ mixed); the explanation is the word's `feeling` | D (profile) |
| `idiom_meaning` | phrases | what does the idiom / proverb / fixed expression mean? and the reverse: which expression says this? | D (profile) |
| `example_cloze` | the word in context | a profile example with the word gapped (any of its forms; the translation shown) → the form; distractors are the same paradigm cell of other words of the same part of speech | D (profile) |
| `sense_pick` | polysemy | a profile example → which of the word's meanings (main senses; a nuance counts as its sense) is used? | D (profile) |
| `etymology_link` | origins and bridges | the origin (`etymology`, the word and its forms masked) → which word comes from it | D (profile) |

**Deepening (P5v).** The thirteen types from `root_family` to `etymology_link` are made by `langcore.deepItems(C, L, code, lexIds, {types, max, rng, k})` from the stored lexemes and their profiles only (nothing written at runtime), each item reviewing its word: the types where the learner picks or completes the word itself (`sense_split`, `collocation`, `confusables`, `register_pick`, `nuance_pick`, `example_cloze`) are reviews of the **P** track, the others of the **R** track (`deepTrack`, `deepRecord`; a sorting item reviews every met word on it). Other words of the course appear only when the learner has met them (state ≥ seen). The sentences are profile examples: they are vocabulary items, so §7.1 applies — at most ⌈30 %⌉ of the words unknown apart from the word trained (`maxUnknown: 'auto'`, `strictKnown` = none), course words not known yet carry 🆕 with their card on tap and are listed at the end, words outside the course are marked and the translation is shown. Collocations and idioms are units of vocabulary themselves and are shown whole (🆕 marked). Where they appear: **🏋️ practise this word** on the word card (the types its data allows, `#/deep/<lang>/<lexeme>`), **🏋️ deepen** on the node and lesson page (a mixed set over the node's met words, `#/deepen/<node>/<lang>`), and the daily session (§7.5). Every type is also a grammar generator (`GEN.<type>`), so a realization may list it in `generators`.

### 6.3 Morphology
| id | trains | how | src |
|---|---|---|---|
| `paradigm` | inflection tables | fill a table; cells hidden progressively (a third of the cells while the function is new, half while practising, all but one when solid, all when mastered) | D |
| `inflect` | one form | lemma + feature chips → the form | D |
| `analyze` | parsing a form | form → features (case, number, tense, person, binyan/verb form…): one choice per dimension that varies in the word's table; a form shared by several cells accepts each of them | D |
| `morph_build` | morpheme order | assemble stem + affixes (pronominal suffixes, prefixes): the bank's prefixed words (`parts`: וְ + אָחוֹת) and Arabic possessed forms (stem + the owner suffix of the pronoun's `suffix`); distractors: another prefix / suffix, another form of the stem | D |
| `root_pattern` | non-concatenative morphology | root × pattern → word; word → root; word → pattern (nouns: `pattern`, verbs: the Arabic verb form / the Hebrew binyan); words of the same root or pattern are the distractors | D |
| `agree` | agreement | change one element (gender, number, definiteness, case) and update the dependents: a bank variant pair whose words align one to one and differ in ≥ 2 words; the first changed noun / pronoun is given, every other inflected word is a choice (its forms from the paradigm) | B |

### 6.4 Syntax
| id | trains | how | src |
|---|---|---|---|
| `build_sentence` | word order + morphology | **inflecting tiles**: each tile is a lemma; order them and choose each form; distractor tiles | B |
| `word_order` | V2, verb-final, zh time/place | place the verb (or the time phrase) in the right slot | B |
| `transform` | structure changes | tense, number, question, negation, passive, 把/被, direct → reported | B (variants) |
| `contrast` | choosing between structures | 了 vs 过, Akk vs Dat with two-way prepositions, lā/lam/lan/laysa, VSO agreement — with the reason: a meaning → which of the sentences of one variant group (the original and its variants, minimal pairs) says it; the reason names the feature that separates them | B |
| `parse` | sentence roles | tag subject/object/verb/case on the tokens: the case of every case-marked word (languages with case), otherwise the part of speech of every word — from the tokens' cells and the lexemes | B |
| `gloss` | interlinear glossing | fill the morpheme gloss under each word (or the reverse, `reverse: true`): meaning + the cell's tags (`carrot.ACC.SG`); prefixes are glossed on their own; distractors: another cell of the same word, another word's gloss | B |
| `proofread` | error detection | find and fix the error (the language twin of `spotbug`): one word replaced by another cell of its own paradigm that differs in case, number, gender or person **and breaks agreement with a partner** (a modifier next to its noun, a verb and its subject) whose own form would have to change — so the result is never another correct sentence; Chinese: a measure word the noun does not take | B (errors made from a known paradigm cell) |
| `combine` | complex sentences | join two sentences with a connector or a relative clause: a bank sentence with one connector whose two clauses are, word for word, two other bank sentences (Ich habe Hunger. + Ich esse nichts. → Ich habe Hunger, aber ich esse nichts.); none when the bank has no such pair | B |

### 6.5 Production and reading
| id | trains | how | src |
|---|---|---|---|
| `translate` | meaning → form | the gloss → the sentence. **Tiles** while a word of the sentence is not yet known for production (§5.3 P), **typed** once all are (a learner may switch to typing). Accepted without any AI: the bank sentence, its `alts`, and every spelling the form index reads as the **same words in the same forms and order** (`typedAnswer`: without vowel marks — but vowel marks that are written must be right —, the full Hebrew spelling, a small first letter; German nouns keep their capital; a `formsAlt` form). Anything else goes to the AI with the course's answer as the reference, shown **“🤖 AI-judged”** (correct · acceptable · wrong, the mistakes, a minimal correction); the course's answer stays on screen, the AI correction is marked “not the answer key”, and its words are tokenized (🆕 course words not learned yet, glossed; “not in the course” for the rest). A deterministic right answer counts as a production review of the sentence's known words | B (+AI) |
| `rewrite` / `expand` | flexibility | a bank sentence + a constraint. A constraint the bank holds a **variant** for (negative, question, plural, past, to a woman …: `variantOf` / `variant`) is decided like `translate` against the variant; a paraphrase (“say it in other words”) or an added detail (when, where, a describing word, a reason, a second clause — offered only when the learner knows such words) is AI-judged after the **known-vocabulary check** of the learner's text | B (+AI) |
| `guided_compose` | paragraphs | a topic (a node with ≥ 3 known content words; its picture when it has one) + 3 required words (noun, verb, adjective) + a text type (message, description, story — by level) → the course checks **which required words are used, in any form** (tokenizer), which words are new or not in the course; the AI rubric per aspect (grammar, vocabulary, spelling, cohesion: 0–5 + a comment) with the corrections inline (~~from~~ to) and its corrected text checked against the form index | AI (+D check) |
| `graded_reader` | reading | texts of 4–6 bank sentences of **related frames** (same frame family, `fr.eat.*`, like / not like), no variants, at most **one unknown word per sentence** (§3.8), the fewest unknown first; every word opens its card, 👁 shows a sentence's meaning, the 🆕 words are listed; **questions** “which of these does the text say?” — the gloss of a text sentence among glosses of sentences of the same frames not in the text (never one meaning the same). **✨ AI-written texts** from the learner's words: every sentence is tokenized, a sentence with a word outside the course or more than one unknown word is dropped (a repair is asked only when fewer than three would remain), labelled “AI-written · checked”, its meanings marked as the AI's; no questions (they would need an answer key) | B (+AI, validated) |
| `number_words`, `clock`, `date` | numbers | **numbers**: digits ↔ words from the number words of the lexicon (concepts `num.N`, known words only); 21–99 built as each language builds them — de unit + und + ten (*einundzwanzig*: eins loses its s), zh ten + digit (二十一, 二 inside numbers), ar unit + وَ + ten in the nominative (وَاحِدٌ وَعِشْرُونَ; 21 with a feminine noun, إِحْدَى وَعِشْرُونَ, is left out), he ten + וְ + unit (וּ before a shva, וַ / וֶ before a hataf; a unit with a begadkefat dagesh is left out); ar digits shown as ٠–٩; numbers easily confused as wrong options (13 / 30, 16 / 60, swapped digits). **Counting**: ar / he 3–10 + a known noun (the form of the other gender: ثَلَاثَةُ كُتُبٍ, שְׁלוֹשָׁה סְפָרִים, from the stored cells and the noun's gender), zh 两 + measure word + noun (two of something), never 二. **clock**: the time of bank sentences read from their words — the hour next to the clock word (`time.oclock`: de / zh before it, ar the ordinal after it, he after it), + half / quarter after it (zh 一刻), one time per sentence; minutes in numbers and German *halb vier* are not read; a time is taken only when the gloss confirms it — the sentence → the time (analogue clock options) or the clock → the sentence. **date**: month ↔ its number, the next weekday, ordinals (`num.ord.N`), and dates in sentences (a day number or ordinal next to the month word, at most one preposition between, confirmed by the gloss). 万 and numbers above 100 / 1000 wait for C11 | D |
| `register`, `dialogue_turn` | pragmatics | **register**: bank variants that differ in `Formality` / `Address` / `Addressee` → “which one is polite (formal)?”, “which one do you say to a woman?” (only the value the variant states is asked); **dialogue_turn**: exchanges stored as one sentence (`Wie geht's? Gut, danke.`), split after the first end mark → the fitting answer among answers of exchanges with no word in common (greetings first, then other questions) | B |

### 6.6 Polyglot
| id | trains | how | src |
|---|---|---|---|
| `parallel_translate` | L2 → L3 | a sentence of one course language → build it with tiles in another, without the explanation language (its meaning only on request); answers = every realization of the same meaning in the target language + their `alts` | B (shared frame) |
| `parallel_align` | structure across languages | 2–4 realizations of one meaning side by side; for a word of the first, tap the word(s) that carry the same concept in each other one (a word with attached prefixes carries the concepts of all its parts) | B |
| `which_language` | separation | a known word in romanization (transliteration, pinyin) — or a sentence, when two course languages share a script — → which course language is it? cognates and false friends are asked first; never when the same romanization exists in another option language | D |
| `cognate_bridge` | cognates and loans | a word → its related word in another course language; a word of one of the learner's languages (from the etymology) → the course word linked to it; the false friend among pairs of related words | D (bridges) |
| `compare_rule` | contrastive grammar | statements about one function × the course languages: each statement goes to every language it holds for (bucket by language; several may be right) — or, for the first sentence of each language's page (language names masked), the one language whose page says it | D (compare) |

**Where a polyglot item's answer comes from (D3).** *Parallel sentences*: two bank sentences of two languages realize the
same meaning when they have the same `frame` and the same gloss (lower case, punctuation and contractions folded, the notes
in brackets set aside); the bracket notes that matter — the gender of the person (“to a woman”, “f.”), the number of
*you* (“pl.”, “two”), formality — must not disagree, and when the target language has the noted variant only that one is
accepted. *Bridges* (`langcore.bridges`, computed when the course opens and again when the word profiles arrive; the files
of §4.10 add to them once content writes them): **roots** — an Arabic and a Hebrew word whose radicals correspond by the
regular sound correspondences (ث ش س → ש/ס, ح خ → ח, ذ ز → ז, ص ض ظ → צ, ع غ → ע, و ي ↔ ו י …) **and** that share a
concept; **etymologies** — a profile etymology that names a word of another course language (its script, or “German X”)
that resolves through the form index (cognate, or loan when it says borrowed / loan); **shared sources** — two course words
with a shared concept borrowed from the same word of a third language; **false friends** — a pitfall, subtlety or
etymology that says “false friend” and names a word of another course language with no shared concept. **Links to the
learner's languages**: “<language> <word>” in an etymology, for a language of `_typology/languages.json` without an
older-stage qualifier (Old, Middle, Ottoman …), with the kind its sentence states (loan, cognate, false friend, compare);
`compare` links are shown on the card but never asked. *Comparison statements*: the typological values a function's
realizations are tagged with (`typology`), filled for the other languages from their profile (`_typology/languages.json`),
and the realizations' `status`; a statement is asked only when its value is known for every language of the item.
Every polyglot item uses words the learner has met (R) — sentences with at most ⌈30 %⌉ unknown words (D19), marked 🆕.
The items are made by `langcore.polyItems(C, L, type, {langs, fn?, max})` and registered as generators (`GEN.<type>`), so a
realization may list them too (`{type: "parallel_translate", to: ["he"]}`); widgets in `engine/lang/80_poly.js`.

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
| `paradigm` `{pos, class?, lemmas?, exclude?, concepts?, cells?}` (cells: else `paradigmCells`, else the word's table) | a known word's table with cells hidden by the function's state | the lexeme's `forms` (+ `formsAlt`) |
| `analyze` `{pos, …, cells?}` | a form → one choice per varying dimension | every cell whose form it is |
| `morph_build` `{bank?, suffixes?}` (`suffixes: true`: the owner suffixes also outside the possession functions) | pieces (prefix + word, stem + suffix) and distractors → the word | the token's `parts`; the possessed cell and the pronoun's `suffix` |
| `root_pattern` `{pos?, mode?: build \| root \| pattern}` | root × pattern → word, word → root, word → pattern | the lexeme's `root`, `pattern`, `verbForm`, `binyan` |
| `agree` `{bank?: {functions?, variant?}}` | the original with one element changed → choose the forms of the others | the variant sentence |
| `contrast` `{bank?}` | a meaning → the sentence of the variant group that says it, with the reason | the group's `gloss` / `variant` |
| `parse` `{bank?, tags?: case \| pos}` | the role of every word | the tokens' cells, the lexemes' `pos` |
| `gloss` `{bank?, reverse?}` | the gloss under every word (or the word under every gloss) | the concepts' glosses + the tokens' cells |
| `proofread` `{bank?}` | find the wrong word, then fix it | the stored token (the error is made from its own paradigm) |
| `combine` `{bank?}` | two sentences + the connector → the joined sentence (tiles) | the bank sentence and its `alts` |
A generator's sentences are those listing the function, or `bank: {functions: [...]}` / `bank: {frames: [...]}` (for a point no word shows, e.g. the verbless *to be* of Arabic and Hebrew). Without `generators` a function gets `sentence_meaning`, `build_sentence` and every `transform` its sentences allow. Generator names are the exercise ids of §6 (`inflect`, `gender_article`, `measure_word`, `sentence_meaning`, `build_sentence`, `transform`, `quiz`, and since P5 `paradigm`, `analyze`, `morph_build`, `root_pattern`, `agree`, `contrast`, `parse`, `gloss`, `proofread`, `combine`; other ids are kept for later phases and ignored by the runtime until implemented).
**Offered automatically (P5).** In the grammar lane, on the function page and in the daily session (`exercises(…, {auto: true})`) a function also gets the P5 types it does not list, wherever its data allows: `paradigm` and `analyze` for the parts of speech of its `paradigmCells`; `parse`, `gloss`, `proofread`, `agree`, `contrast`, `combine` and `morph_build` over its bank sentences; `root_pattern` for the functions about roots, patterns and word formation. A type the data cannot feed yields nothing. Lessons keep the listed generators (the author's choice for the lesson). The validator checks every generator's type, parameters, parts of speech, cells (a cell no word of the language has is an error), lemmas, bank filters, and — with `--strict` — warns when a generator's pool is empty even for a learner who knows every word.
A generator's sentences are those listing the function, or `bank: {functions: [...]}` / `bank: {frames: [...]}` (for a point no word shows, e.g. the verbless *to be* of Arabic and Hebrew). Without `generators` a function gets `sentence_meaning`, `build_sentence` and every `transform` its sentences allow. Generator names are the exercise ids of §6 (`inflect`, `gender_article`, `measure_word`, `sentence_meaning`, `build_sentence`, `transform`, `quiz`; P7 adds `translate` `{bank?, mode?}`, `rewrite`, `expand`, `number_words`, `clock`, `date`, `register`, `dialogue_turn` — registered in `langcore` `GEN`, rendered by the widgets of `engine/lang/85_prod.js`; other ids are kept for later phases and ignored by the runtime until implemented).

| id | trains | how | src |
|---|---|---|---|
| `sentence_meaning` | reading a sentence | the sentence → its meaning; distractors = meanings of other bank sentences with similar words | B |

### 6.8 Listening and speaking (P9, §3.9)
| id | trains | how | src |
|---|---|---|---|
| `listen_pick` | hearing words | a met word (≥ learning) is spoken → choose it among written words (kind `hear_word`; met words, the same part of speech / sound first) or its meaning among other words' meanings (`hear_meaning`); a homophone of the answer (`soundKey`: zh the pinyin with tones, ar / he the transliteration, German a sound key that folds length marks, final devoicing and the like) is never a wrong option | D |
| `listen_tone` | Chinese tones by ear | a known word is spoken whole; one of its syllables (its character marked) → its spoken tone (1–4, neutral) | D (zh) |
| `dictation` | hearing → spelling | a word (its meaning shown: homophones) or a bank sentence of ≤ 8 words (D19 ⌈30 %⌉ unknown, 🆕 listed; zh with its meaning) is spoken → typed with the keyboards of §8; a word is checked by `checkTyped` (P4), a sentence by `typedAnswer` (P7) against that sentence only — not its `alts`: the voice said this one | D / B |
| `listen_meaning` | listening comprehension | a bank sentence is spoken, not shown → its meaning among other sentences' meanings (the distractors of `sentence_meaning`); then it is shown with 🆕 | B |
| `shadowing` | pronunciation | the word or sentence shown and spoken → record yourself, play both (the voice, then you) → self-graded (“✓ close” / “✗ not yet”); not a review of the word | D / B |
| `speak` | speaking | the word or sentence shown (`read`) — or only a word's meaning (`produce`, words known for production) → say it; the transcript is compared with the stored forms (`checkSpoken`), up to three tries; without recognition the item becomes `shadowing` | D / B |

What an answer records: `listen_pick`, `listen_tone` → the word's R track; `dictation` of a word → its P track; `speak` of a
word decided right → its P track; a sentence typed or said right → a production review of its known words (as `translate`);
`listen_meaning` → its function, when it has one. The items are made by `langcore.speechItems(C, L, code, type, opts)` and
registered as generators (`GEN.<type>`), so a realization may list them (the validator and the task checks of §10.1 accept
the ids); the device decides what can be offered (`setSpeechCaps`: a voice per language, recognition, recording, the two
“can't now” switches). Widgets in `engine/lang/98_speech.js`.

---

## 7. Making exercises from what the learner knows

### 7.1 Three sources, in order
1. **Bank (B)** — sentences whose words are known, or — for every aspect but vocabulary (D19) — with **at most ⌈30 %⌉ of the sentence's words unknown** (`selectSentences(…, {maxUnknown: 'auto'})`, fewest unknown first; recognition and production alike). Unknown words are marked 🆕 (meaning on hover, the word card on tap) and listed at the end of the lesson; `strictKnown` restricts an exercise to known words.
2. **Paradigms (D)** — drills over known lexemes and the function's `paradigmCells`.
3. **AI** — only grading of open answers and the tutor; outputs are tokenized and checked against the form index (`checkText`); course words not learned yet are marked 🆕 with their gloss and card, words outside the course are underlined “not in the course”. AI never produces an answer key: the course's stored answer stays the reference on screen, the prompts (`aiTask`, `readerTask`, `tutorTask` in `langcore`, the same for the app and the connector) say so, and every AI verdict is labelled “🤖 AI-judged”. The AI is called with the learner's own Gemini or Claude key on the device (`NoemaLLM`); without one the buttons say how to add a Gemini key (stored on this device only, `Noema.geminiKey`).

### 7.2 Form index and tokenizer (`langcore`)
* From all paradigms of the course language: `form → [(lexeme, features)]` (also unvocalized ar/he forms, ar/he prefix clitics wa-/fa-/bi-/li-/ka-/al- and he ha-/ve-/be-/le-/mi-/she-, ar/he pronominal suffixes, de contractions im/am/zum/zur…).
* zh segmentation = maximum matching over the course lexicon (only known words need to be found; unknown spans are reported).
  A sentence of the bank keeps its own annotated words (`ownSegmentation`), and a span that the bank always splits the same way and
  never writes as one word stays split in any text (`knownSplit`): a newer, longer word (回家) never breaks older sentences that split it.
* Prefix clitics: every written spelling of a prefix (וּ, וַ …) is tried before its plain letter; the plain letter takes the vowel marks
  that follow it (וָ before a number, וֶ, וִ — the validator accepts any vowel on an attached prefix); ar لِلْـ = لِ + الْـ (the alif of the
  article is not written; the validator accepts the definite form without its alif after لِ).
* Used for: validating bank sentences and AI text, tap-to-gloss, crediting words in `exhaustive_recall`, detecting unknown words.

### 7.3 Feasibility of a function
For (function F, language L): trainable when, with the current known sets, the bank yields ≥ 12 usable sentences for F and the paradigms give ≥ `needs` items. The grammar lane shows **🟢 ready · 🟡 thin (n sentences) · 🔒 needs node X**.
* **Usable** follows D19: a sentence counts when at most ⌈30 %⌉ of its words are unknown (`maxUnknown: 'auto'`) — the same sentences the exercises use.
* A function whose generators need no sentence (only paradigm drills, a quiz) is 🟢 once `needs` is met; one that needs sentences is 🔒 without any.
* The light stands on the function page, on every grammar card of a lesson and in the grammar lane; 🔒 names the node that would unlock it (the node of most missing words).

### 7.4 Refill tasks (robust "dynamic" content)
When F is 🟡 or 🔒 only because of the bank, the app offers **"✨ Ask Claude for more sentences with what I know"**: a task with F, L, the learner's known lemma ids (R and P) and the schema. Claude writes annotated sentences, `tools/validate_lang.py` checks them (forms, requirements ⊆ known, functions present), and the result is merged as a learner patch (`patches/`, private). Same mechanism and queue as the curriculum steps (§10).
* **How it works (P8):** the button sits on the function page under the feasibility light (🟡 / 🔒, and always as "✨ more
  sentences" when the learner wants more). It queues the task `refill:<fn>:<L>:<n>` with the request `{fn, lang, R, P}`
  (the lexeme ids of the learner's R and P sets at that moment) — the answer is `{bank: [sentences]}`; every sentence lists F
  in `functions`, uses **only** lexemes of R (`requirements ⊆ known`, D3 — the refill is for exercises with known words), and
  passes the bank checks of `langcore.checkLangAnswer` (forms equal the paradigm cells, text = joined tokens, the function
  shown by its evidence, new unique ids). Merged additively: into the account course itself, or — for a library course —
  into the learner's private **patch** (`langs/<course>.patch.json`, IndexedDB on the device), which is laid over the
  course when it opens.

### 7.5 Daily session
Input: due reviews (per language), next batches of open nodes, one trainable function, minutes. Default plan:
1. Reviews (R then P), interleaved across languages but grouped by concept; a word with a bridge or false friend in another active language that is due too comes right after it (confusables drilled together, §9.5).
2. **New batch learned in parallel**: the same 10–15 concepts in each active language one after another (co-located), each language only if the node is open in it.
3. One grammar function **using the words just learned** (bank + drills): among the trainable, not mastered functions of the open lessons (in the common order), the one with the most items that use the new words; its items count for the function (`practiceFunction`).
4. Two minutes of reading or a polyglot exercise: with ≥ 2 languages in the session, one polyglot item (`which_language` or `parallel_align`, alternating by day; the other when one cannot be made from what is known) — `{kind: "poly", items}` in `planSession`; otherwise the 📖 Reading lane of each language (P7).
5. **Deepening** (P5v): 1–3 items of the §6.2 depth types for words already known (≥ known_r), the words least recently reviewed first (`langcore.deepenPlan`), each recorded as a review of the word (§6.2 “Deepening”).
6. **Listening and speaking** (P9): after the new words, up to two items in today's languages that have a voice on the device
   (taking turns by day): one listening item (`listen_pick`, `listen_meaning` or a word `dictation`, rotating by day) and one
   speaking item (`speak`, or `shadowing` without recognition); none on a day marked “I can't listen / speak now” (`langcore.speechPlan`).

---

## 8. User interface

* **Inside the frame** (2026-10-09, docs/NEW_FRAME_AND_LANGUAGES.md; `engine/loader.js` registers `NoemaShell.registerWorld('lang', { page, route, create, menu, today })`):
  * **The Languages tab** (`#/lang`, icon 文A, shown for "Languages" or "Both"): one row per course — the library's (`REG.languages`)
    and the learner's own account courses (P8, `a:langcourse:<id>`) — with its flags, languages, words met, the reviews due today
    and the next lesson; a bar for the words met; each row's ⋮: Start / Continue · Course settings · ✨ Through Claude. **+ New language**
    (and Discover › New language) opens the ✨ new-course dialog; the new course opens at once. Nothing of the course is loaded for
    this list: progress and due reviews are counted from the stored learner keys (§5.6), the next lesson is what the course last
    showed (device-local `meta:langsum`).
  * **A course** opens at `#/lang/<course>` **inside the frame**: `NoemaLangUI.start({ …, host, onRoute })` draws it into the frame's
    `<main>` (its top bar, tabs and the character stay); the course's own bar keeps the language chips and the explanation language;
    the frame's top bar shows the crumbs **Languages › course › page** (the lesson, concept, word, function, lane…), ← and the ⋮
    (Course settings `#/lang/<course>/settings` · ✨ Through Claude `#/lang/<course>/claude` (the P8 task queue) · Choose another
    course · New language course · Choose a subject). The character opens the course's own tutor (§8 *Tutor*).
  * **Addresses, both ways.** Every view keeps writing the course's own addresses (`#/c/…`, `#/fn/…`, `#/lesson/…`, `#/`); inside the
    frame `go()` writes them as `#/lang/<course>/c/…` (`toHash`), `route()` reads them back (`innerHash`), links (`<a href="#/…">`
    made by `h()`) are mapped the same way and a run's "back" is the inner address. So deep links, reloads, ← and back / forward work
    at every place of the course; with `shell: false` nothing is mapped and the addresses stay as they were.
  * **Today**: a "continue" card for the course you were in (the reviews due, else the next lesson; the first course to start when
    you have none); with no subject to continue it leads the page.
  * **Boot**: in the frame, `?subject=lang:<id>` — or, on a start without an address, the course you were in — opens at
    `#/lang/<id>`; `#/` stays Today. A link to a course turns on the Languages tab for a "Knowledge" learner. A subject's page
    opened afterwards becomes the one a reload reopens again. With `shell: false` the older `startLanguage` (the course takes the
    whole page with its own top bar) is unchanged.
  * **Look**: the course uses the frame's variables (`--bg`, `--paper`, `--ink`, `--line`, `--acc`, `--acc-soft`, `--font`, `--display`;
    `engine/lang/97_frame.css`, everything under `body.ns-on`) and the older tokens the themes bridge to them, so it wears the
    learner's character like every other page. Tested by `tests/lang_frame.js` (phone 390 px and desktop 1280 px).
* **Style inside the frame** (2026-10-10, asked by the user: the course looks and behaves like main's redesign, docs/UI_MAP.md;
  `engine/lang/99z_frame.js` tidies every view after it is drawn, `engine/lang/97_frame.css` styles it — only inside the frame,
  `shell: false` keeps the older screens):
  * **One primary action per screen.** The home's one big card (`.ns-go`: today's session, else the next lesson); on a lesson
    *Practise*; on the letters *Learn the next …*. Any later `.btn.primary` becomes a plain button.
  * **Secondary actions in ⋮, ▾ or a sheet — never rows of buttons.** A view's other actions (the lesson check, the tutor's
    questions of the page, "✨ Ask Claude for more sentences", today's languages, what the signs mean) are items of the frame's ⋮
    (above the course's own items); a row of three drills or more becomes its primary button + **Practice ▾**; the home's lanes
    become **Your languages**, one `.ns-item` per language whose sheet lists its lanes (Grammar · Writing · Reading · Letters /
    Characters / Spelling · Peculiarities · Listening & speaking · Tutor), plus *Across your languages* and *Drills* (sheets too).
    The older buttons stay in the page, hidden (`.lx-moved`), and the menus press them: every feature keeps its code path.
  * **No information noise; details on demand.** No second languages switch (each one-language page has its flag rail), no
    progress rings, no counts after section titles, no state chips beside a title, no sign legend (⋮ › What the signs mean), the
    explanation under a title becomes an (i) beside it, a lesson's grammar points are folded after the first, the map's steps
    show their title and a sign per language (the words in the tooltip). The views' own "← …" buttons give way to the frame's ←
    and crumbs.
  * **The frame's components and values**: `.ns-label` section labels, `.ns-list` / `.ns-item` rows (lanes, map steps, compare
    rows, texts and sets), `.ns-pill` labels, the segmented flag rail, panels on `--paper` with a `--line` border and the
    character's radius (`--r`, `--br`, `--ir`), type in `--display` / `--font` at the frame's scale (h1 1.75rem, h2 1.2rem), spacing
    of 12–22 px between blocks; colours only from `--bg --paper --ink --ink2 --ink3 --line --acc --acc-ink --acc-soft --t1…--t4`
    (+ the colour of each language, §9.5).
  * **The character's own look** reaches the course like every page of main: the `[data-m]` rules of `95_shell.css` for icons, pills,
    buttons and panels apply to the course's rows (they are the same components), and the course's own cards, lists and labels follow
    the same rules (the bear's dashed lines, the robot's and knight's square labels, round switches for the axolotl, alien, berry and
    candy, each character's display font).
  * **Plain chrome**: titles, summaries and buttons drop their pictographs, as main's frame does (`Noema.plain`); kept: flags,
    foreign words, lesson text, the pictures of words and exercises, 🆕 marks, arrows and ✓. `lang` / `dir` on every foreign span,
    the keyboard of every exercise and the 390 px layout are unchanged (`tests/lang_frame.js` H checks them with four characters).
* **Course home**: flags of the active languages, each with progress ring and "due" badge; lanes **Vocabulary · Grammar · Script · Reading · Writing · Compare**; the daily session button. The explanation language is shown in the header ("explained in English"). P7: a **✍️ Writing · 📖 Reading** row per active language (and its 🎓 tutor): `#/write/<lang>` (the sets translate, rewrite and expand, guided writing, register and dialogue, numbers, the clock, dates — each a short run, `#/write/<lang>/<set>`), `#/read/<lang>` (the graded texts, `#/read/<lang>/<text>`, ✨ a new AI-written text). QA: one order — the session button (it starts the next lesson when nothing is due), today's languages, the next lesson, **🧭 Your lanes** (one row per language: 📐 grammar · ✍️ writing · 📖 reading · 🔤 script · 📚 peculiarities · 🎓 tutor; then the polyglot drills and the drills, the field sorts folded), the 📐 grammar lane, the map — the steps near the learner with compact state chips (a sign per language, the words in the tooltip and a legend), the rest one tap away.
* **Flag card** (one component for concepts, functions, sentences, fields): content in one language at a time; a vertical rail of small flags, each with a state dot (✅ mastered, 🟢 known, 🟡 learning, 🔓 open, 🔒 locked); click → that language's realization loads in place; **⇄ Compare** opens the aligned table of all course languages. The last chosen language is remembered per card type.
* **Word card** (the flag card of a word, `langcore.wordCard`): principal parts (article/plural, unit noun, root, pinyin + measure word), then the profile in sections — Meanings · In sentences (register and context chips, translation, unknown words marked) · Goes with · Verbs built on it · Idioms, sayings and quotes · Synonyms by register · Opposites · ⚠️ Watch out · Subtleties · Where it comes from · Fun facts — and the feeling / connotation / status / frequency badges. The flags switch the same concept to another language.
* **🏋️ Practise this word / 🏋️ deepen** (P5v): the word card offers the depth exercises its data allows; a node or lesson page offers a mixed set over its met words (§6.2 “Deepening”).
* **⇄ Compare lane** (`#/cmp`, P6; `engine/lang/80_poly.js`): the course languages chosen for comparing side by side — every grammar function with its status in each (→ `#/cmp/fn/<fn>`: status and first sentence of each realization with a link to its page, an example sentence of the same meaning in every language when the bank has one, the **comparison strip** = the function's typological values × the languages, the `seeAlso` pointers between the course languages, 🏋️ `compare_rule`), every frame with its parallel sentences (→ `#/cmp/frame/<frame>`: the same meaning in every language, 🏋️ `parallel_align` / `parallel_translate`), a concept (→ `#/cmp/c/<concept>`: the compare table of the flag card + its bridges) and the bridges of the course (cognates, loans, false friends); 🏋️ drills of every polyglot type (`#/poly/<type>`). The flag card's ⇄ table and the function page's strip show the same parts in place and link here.
* **Word card — across your languages** (P6): the word's bridges to the other course languages (root, etymology, shared source; ⚠️ false friends first, with the sentence that says so) and the links to the learner's own languages from its etymology.
* **A colour per language** (§9.5): every language has one fixed colour (by code, the same in every course) on its chips, flags, rail buttons and the underline of its words (`[lang|=xx]`); exercises that ask *which* language hide it until answered.
* **Field map**: the whole field (e.g. 200 vegetables) as a picture grid grouped by subgroup, coloured by state in the chosen language; tier dividers; tap an item for its card.
* **Vocabulary DAG view**: reuses the curriculum map component (`curmap`), with node states for the chosen language.
* **Grammar function page**: realization in the chosen language (summary, blocks, paradigm, "ask yourself", traps, examples), the flag rail for the other languages, comparison strip at the bottom, the feasibility light and its exercises.
* **📐 Grammar lane** (home and `#/grammar/<lang>`): per language, the functions of the learner's open lessons with their state (new · practising · solid · mastered) and feasibility light; ▶ practise runs a block of mixed items of one function (or of all the open functions not mastered) and records the answers (`practiceFunction`).
* **Text rendering**: `lang` and `dir` on every foreign span; fonts Noto Naskh Arabic, Noto Sans Hebrew, Noto Sans SC/TC; vowel-mark level per language; transliteration toggle; zh pinyin ruby above characters (toggle).
  Vowel-mark level per language in ⚙️ Settings: *full*, *fading* (a new word shows every mark; known for reading → only šadda / dagesh
  and the shin / sin dot; known for writing → none; `markLevel`, `fadeMarks`, `textMarkLevel` for text without its word), *none*; the old
  on/off switch still turns them all off. Drills about the marks always show them. Until the letter stage is complete the transliteration
  is shown whatever the toggle says (§5.5). Every view is checked at 390 px with ar and he (`tests/lang_script.js`).
* **Input**: on-screen keyboards for ar and he (with vowel marks), pinyin with tone numbers → marks, character choice for zh, umlaut/ß buttons for de; physical keyboard always works.
  One component (`scriptInput`) for every typed answer — `spell`, the typing in `exProduce` (ar/he once the letter stage is complete,
  tiles until then), ⏱️ name them all: ar/he keyboards from the script module (standard layouts, marks on a dotted circle, ⌫ removes a
  letter with its marks, shown or hidden per language); zh a pinyin box (`ni3hao3`, `nihao`, `nǐhǎo`, `lv4`) whose preview shows the
  marks and whose candidates are the course's words and characters with that reading (known words first; Space / Enter takes the
  first); de ä ö ü ß Ä Ö Ü.
* **🔤 Script lane** (`#/script/<L>`, from the home): the stage meter, the letters / characters by group with their state (tap → its card:
  forms, sound, readings, parts, words of the course, ✍️ trace), 🆕 the next letters, and a drill per exercise type of §6.1 (or mixed).
* **✨ Through Claude** (`#/claude`, P8): the course's task queue — what Claude still has to write (the core, each node
  in each language, grammar realizations, comparisons, refills), each with its state (queued · taken by a run · done ·
  refused), the three ways to get it done (▶ with the Claude key on this device · 💬 the message for the Claude app with
  the connector · 📋 copy the task and paste the answer), 🌙 queue every unwritten node for the night, and 🔄 fetch the
  answers the connector left. An account course without its core opens on this page.
* **🔊 Listening everywhere** (P9): a 🔊 after the head of every word card, every example and bank sentence shown (word card,
  grammar page and lesson screens, the reader — with ▶ the whole text —, the compare lane and the polyglot views) and, inside
  exercises, after the intro of a new word and in the feedback only (never on a prompt it would give away); `r` replays the
  audio of a listening exercise. Auto-play of new words in the session is a setting.
* **🎧 Listening & speaking lane** (`#/listen/<lang>`, a row per active language on the home): 🔊 hear and choose, 👂 sentences,
  ✍️ dictation, 🗣️ shadowing, 🎤 say it, 🎵 tones (zh) — each a short run (`#/listen/<lang>/<set>`); the lane says what the
  device offers (voice, recognition, recording). ⚙️ Settings → 🎧 Listening & speaking (§3.9).
* **Tutor**: language context (function or node + language), known vocabulary of the language (capped list), rule "use known words; at most one new word per sentence, glossed"; intents per button (explain this rule, compare the languages, quiz this node, a conversation with only known words). The 💡 on any part works as elsewhere. P7: a drawer of its own in the language UI (the subject engine's tutor is not loaded there) — buttons on the grammar page (📘 explain this rule · ⇄ compare the languages · ❓ quiz), on lesson and node pages (❓ quiz this node · 💬 a conversation at my level), in the home row and the lanes; context = the function's realization in the language (summary, blocks, ask-yourself, traps; for “compare” the other languages' summaries) or the node (its words, its grammar) + the learner's known words (150 at most, production-known first) + the rule + the intent of the button + “never give the answers of the app's exercises”; it writes in `chatLang` (a choice in the drawer, stored in the course's prefs) or `explainLang`. Its answer is `{reply, target}`: every sentence in the language it used is tokenized and checked against the course (🆕 glossed, “not in the course” marked) and set in the language's font and direction. Conversations are kept with the others (`NoemaConvos`, mode `lang-<intent>`). With the learner's own Gemini or Claude key; without one the drawer and its buttons say how to add one.

---

## 9. Parallel learning (polyglots)

1. **Shared concepts, independent progress**: one DAG; states per language (D2).
2. **One common order (D13, hard constraint)**: every subject shared by several languages has the same place in all their paths (§4.4.3); a language may have extra steps or skip some, never a different order.
3. **Same thing at the same time**: the daily session teaches a batch in all open languages back to back and interleaves the languages while grouping by concept (reviews of one idea in every language one after the other); with ≥ 2 languages it adds one polyglot item (§7.5); grammar pages always carry the other languages (flags + comparison strip); a function absent in a language says how that language expresses the meaning.
4. **Bridges**: cognates and loans across course languages and the learner's known languages (Semitic roots shared by ar and he; Arabic loans known from Turkish; …), computed from the stored data (§6.6). Shown on the card (“across your languages”), listed in the ⇄ compare lane and trained with `cognate_bridge`.
5. **Interference control**: a fixed colour per language (chips, flags, the underline of its words; §8); cross-language confusables (bridged words, false friends) drilled together — side by side in the reviews, first in `which_language`, as pairs in `cognate_bridge`; comparison notes flag the classic transfers (e.g. ar vs he negation, gender of cognate nouns that differs).
6. **Load control**: `depth[lang]` (⚙️ Settings; a field node above the depth is `skipped` and its words stay locked — in the session, the field map, the drills and the polyglot items) and **today's languages**, chosen on the home among the active ones (for today only; the next day starts with all of them again); the field map shows tiers so the exhaustive tail is a choice, not a wall.

---

## 10. Creating courses and content through Claude

* **✨ New language course** (subject picker → 🌍 Languages): title, languages, explanation language (default English), depth per language, known languages. Like curricula, three ways: the app with a Claude key, the Claude app with the connector (recommended), or Claude here in Cowork for the shared library.
* **Task kinds** (same queue machinery as `NoemaCurJobs`): `lang.core` (spine + field lists + DAG), `lang.node` (one node × one language: lexemes + paradigms + bank sentences), `lang.function` (realization + paradigm cells + bank), `lang.compare` (one function across the course languages), `lang.script`, `lang.refill` (§7.4). Each task text contains the relevant part of this spec, the schema and the validator command — and the parallel order (D13, §4.4.3): a task that adds a language or a node, or moves one, places it on the common order of all the languages of the app. **Adding a language starts with its typological profile** (`_typology/languages.json`, every feature) **and its catalogue of phenomena** (§4.11: tagged, every feature it has or lacks, no point of view, D16) and its `wordFeatures`; every word task fills the word's whole facade (D14) and gives every meaning its concept (D15).
* **Skill**: `skill/noema-pack-builder/LANGUAGES.md` (authoring rules from §4 and §11), tools in the toolkit.
* Night generation works as for curricula: queue many `lang.node` tasks.

### 10.1 How it is built (P8)
* **An account course** (private, in the learner's account — the ✨ dialog makes one; the way "Claude here in Cowork"
  instead gives the brief for a shared course in `library/languages/`, written and validated in the repository):
  * the record `a:langcourse:<id>` (format `noema.langjobs/v1`, a synced account key like a curriculum): title, languages,
    explanation language, depth, known languages, the way chosen (`provider`: `claudeapp` · `claude` · `cowork`), `origin`
    (`account`, or `library` for the refill queue of a shared course), the content revision `rev`, the task queue and a log;
  * the content (format `noema.langdata/v1`, the same shape as a built `course.pack.js`: course, typology, fields, nodes,
    functions, frames, langs{code: {language, lexicon, grammar, bank}}, compare) in IndexedDB on the device and, for a cloud
    account, in the private storage `langs/<id>.json` — written by the app only (like private packs: the device copy, the
    cloud copy and the record's `rev` say which is newer);
  * course ids `u-<slug>-<4 letters>`; the skeleton copies `language.json` and the shared `typology.json` from a library
    course when the language is there, so a known language needs no new declaration; other languages get theirs from
    `lang.core` (with their catalogue of phenomena written first, D14 — in the repository, through "Claude here").
  * The picker's 🌍 Languages overlay lists the account courses with the library courses; `lang:<id>` opens either (the
    loader takes the content from the device or the cloud instead of `course.pack.js`).
* **Tasks** (`engine/langcore.js`, P8 section — the same code in the app and in the connector): ids `core`,
  `node:<node>:<L>`, `function:<fn>:<L>`, `compare:<fn>`, `refill:<fn>:<L>:<n>`; queued in the record with `queuedAt`;
  `langTaskSpec` gives the text (role, the binding rules D1–D19 in short, what to write, the course's concepts, nodes,
  frames, the words already written with their forms, the language's paradigm cells and facade, the common order of the
  library courses for `lang.core`, the answer's JSON Schema, the validator commands); `checkLangAnswer` checks an answer
  with the validator's rules that matter at run time (structure, ids, references, the DAG and the parallel order within the
  course and against the library courses, every concept of a node realized or `absent`, paradigm cells complete, vowel
  marks, citation forms, the facade per `wordFeatures`, contrasts, zh characters / pinyin / traditional form / measure
  words, bank tokens equal to their cells, text = joined tokens, functions shown by their evidence, notes for ≥ 8 reference
  languages of all four types); `applyLangAnswer` merges it **additively** (lexemes, absent entries, sentences by id;
  realizations and comparisons by function) and marks the task done. The full check is `tools/validate_lang.py` +
  `tools/lang_refcheck.py`, which the task tells Claude to run in its sandbox before answering
  (`tools/lang_course.py unpack` writes the course as a folder, `… answer <folder> <task id>` turns the folder back into the
  answer of the task).
* **Answers** (one JSON object): `lang.core` `{fields, nodes, functions, frames, typology?, languages?: {code: language.json}}`
  · `lang.node` `{lexicon: {lexemes, absent?}, bank?, grammar?: {fn: realization}}` · `lang.function` `{grammar, bank?}` ·
  `lang.compare` `{compare: {function, rows: [{aspect, cells: {code: text}}], notes?}}` (shown under the function page) ·
  `lang.refill` `{bank}`.
* **Three ways**, as for curricula: ▶ **the Claude key on this device** runs the queued tasks one after another
  (`NoemaLLM.json`, the check as its validator: a wrong answer goes back to Claude with its problems); 💬 **the Claude app
  with the connector** (recommended): `noema_lang_courses` → `noema_lang_task` (claims the task for 4 hours, so scheduled
  runs never write the same node twice; gives a signed link to the course file) → `noema_lang_submit` (the same check;
  accepted answers go to the inbox `a:langin:<course>:<seq>`, which the app checks again, merges, saves and empties —
  the connector never writes the course); 📋 **without the connector**: copy a task into any Claude chat, paste the
  answer back.
* **🌙 Night generation:** "Queue every unwritten node" queues `lang.node` for every applicable node without words, in
  the course order, for every language (and `lang.function` for the realizations its lessons need); a scheduled Claude run
  (or the key on a device left open) works through them; each run takes the next unclaimed task.
* **Not here:** `lang.script` (the script modules come with P4) and catalogues of phenomena for new languages (written in
  the repository, where `tools/lang_phenomena.py` checks them against the implementation).

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
| `engine/lang/97_frame.css`, `engine/lang/99z_frame.js`, `engine/loader.js` (*language courses inside the frame*) | the course inside the new frame (§8): the Languages tab, `#/lang/<course>/…`, Today's card, the ⋮ |
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

**P4 — Scripts and input** — ✅ 2026-10-09
- `glyph_form`, `transliterate`, `vowelize`, `tone_mark`, `char_compose`, `trace`; script stages; keyboards and pinyin input; RTL and fonts; vowel-mark fading.
- ✔ Widget tests per type, including RTL layout on a phone viewport.
- Done: the script modules as data (§4.9) — `lang/ar/script.json` (37 letters + lām-alif, 9 marks, 8 groups), `lang/he/script.json`
  (26 letters with בּ כּ פּ and shin / sin + 5 finals, 13 marks, 7 groups), `lang/zh/chars.json` (the 567 characters of the words; 565 with strokes — 荙 莙 are not
  in Make Me a Hanzi) — built and checked by `tools/lang_script.py`, checked by `validate_lang.py`; `langcore` P4 section (script module,
  letter clusters and positional forms, script stage and its storage `lang:<L>:script` merged like words in `engine/cloud.js`, the seven
  generators, `scriptItems` / `scriptSession`, vowel-mark fading, tone sandhi, pinyin parsing and candidates, typed-answer check with a
  letter-level diff, stroke matching); `engine/lang/90_script.js` + `.css` (the 🔤 lane, a widget per type, the letter / character
  card, keyboards and pinyin input used by every typed answer, fading in `word()` and sentences, the session step); tokenizer fixes
  of §13.1 (Hebrew prefix spellings and וָ, Arabic لِلْـ, Chinese segmentation that keeps the bank's splits); `tests/lang_script.js`.

**P5 — Grammar lane** — ✅ 2026-10-09
- Function pages with procedures and traps; `paradigm`, `inflect`, `analyze`, `morph_build`, `root_pattern`, `agree`, `build_sentence`, `word_order`, `transform`, `contrast`, `parse`, `gloss`, `proofread`, `combine`; feasibility lights; refill tasks (queue + validation + merge).
- ✔ Every generated item uses only known words (property test over random learner states); refill round-trip test with a mocked Claude answer.
- Done: `engine/langcore.js` (section *P5 — Grammar lane*): the generators `GEN.paradigm`, `analyze`, `morph_build`, `root_pattern`, `agree`, `contrast`, `parse`, `gloss`, `proofread`, `combine` (§6.3, §6.4, §6.7), `autoGenerators` (the types a function's data allows, added by `exercises(…, {auto: true})`), `checkSlots` / `checkTable` / `checkProofread`, `grammarLane`, `practiceBlock`, `sessionGrammar` (§7.5 step 3), `sentenceUnits`; `feasibility` counts sentences by D19 and needs none for paradigm-only functions (§7.3). `engine/lang/70_grammar2.js` + `.css`: the widgets (`table`, `slots`, `proofread`, `contrast`, `morph`, `combine`; check, reveal, Enter / digit keys, `lang` + `dir`, 🆕), the feasibility light on every grammar card (function page, lesson page), the 📐 lane on the home and `#/grammar/<lang>`, practice blocks that record `practiceFunction`, the grammar step of the daily session; hook lines in `10_shell.js`, `45_grammar.js`, `50_session.js`. `tools/validate_lang.py`: the generators' types, parameters, parts of speech, cells, lemmas, bank filters, empty pools (warning with `--strict`); `tools/lang_phenomena.py` sees the `GEN.<type>` generators. Tests: `tests/lang_grammar.js` (langcore over the mini and the pilot course with every answer checked against the data, a property test over random learners, the validator's negative cases, the widgets / lane / session in a browser at 390 px).
- Left for later: refill tasks (§7.4) need the task queue of P8; `combine` finds few pairs in the pilot bank (a joined sentence whose two clauses are themselves bank sentences: 9 in de and ar) — more come with content that writes such pairs; `parse` tags case or part of speech, not subject / object (the bank does not annotate roles).

**P5v — Vocabulary depth (the remaining §6.2 types)** — ✅ 2026-10-09
- Done: `root_family`, `compound_split`, `sense_split`, `collocation`, `confusables`, `intensity_scale`, `register_pick`, `nuance_pick`, `connotation`, `idiom_meaning`, `example_cloze`, `sense_pick`, `etymology_link` — the runtime in its own section of `engine/langcore.js` (`deepItems`, `deepTypes`, `deepSentence`, `deepTrack`, `deepRecord`, `deepenPlan`, `confusablesOf`, `compoundSplit`, every type registered as `GEN.<type>`); the widgets `vpick`, `vsort`, `vorder`, `vsteps` and the views `#/deep/<lang>/<lexeme>` (🏋️ practise this word, from the word card) and `#/deepen/<node>/<lang>` (🏋️ deepen, from the node and lesson pages) in `engine/lang/75_vocab2.js` / `.css`; 1–3 deepening items at the end of the daily session; `tools/lang_phenomena.py` also counts `GEN.<type>` registrations as implemented. Tests: `tests/lang_vocab2.js` (Node over the mini course and the pilot course: every answer comes from the stored data, D19 caps, tracks; Playwright: the word card, the node page, the session, keyboard, phone width).
- Left out: deriving a word from root + pattern (that is `root_pattern`, §6.3, the grammar lane); cognates across languages (`cognate_bridge`, P6, needs `bridges.json`). `intensity_scale` has data for 6 words only (ar كَثِير / قَلِيل, zh 很好 / 还好): it works where the data exists and is silent elsewhere.

**P6 — Polyglot layer** — ✅ 2026-10-09
- Comparison tables and strips, bridges, confusables, `parallel_translate`, `parallel_align`, `which_language`, `cognate_bridge`, `compare_rule`; interleaved sessions; depth per language.
- ✔ Tests for comparison rendering and parallel exercises over shared frames.
- Done: `engine/langcore.js` section “P6 — Polyglot layer” — `parallelGroups` / `parallelOf` (the same meaning across the languages, §6.6), `bridges` / `bridgesOf` / `knownLinks` (roots, etymologies, shared sources, false friends, links to the learner's languages), `compareFn` (the comparison strip of a function), `polyItems` and the generators `GEN.parallel_translate | parallel_align | which_language | cognate_bridge | compare_rule`, the polyglot step and the confusable pairs of `planSession` (§7.5); a depth-skipped node keeps its words locked (`itemState`). UI `engine/lang/80_poly.js` + `80_poly.css`: the five widgets, the ⇄ compare lane (`#/cmp`, `#/cmp/fn|frame|c/<id>`), the drills (`#/poly/<type>`), “across your languages” on the word card, the strips on the flag card's compare table and on the function page, today's languages on the home, a fixed colour per language; the daily session runs the polyglot item. `tools/lang_phenomena.py` also counts the generators registered with `GEN.<type>`. Tests: `tests/lang_poly.js` (72 checks: Node over the mini course and the pilot course — every item's answer checked against the data, D19 caps, sessions, generators, depth — and Playwright over the built pilot course: colours, today's languages, the session's polyglot item, the compare lane, the word card, every widget answered by mouse and keyboard, phone width).
- Left for later: the files of §4.10 (`compare/<fn>.json`, `confusables.json`, `bridges.json`) are not read yet — no content has them; bridges and statements are computed from what is stored (§6.6). Look-alike words without a shared origin (`lookAlike`) need such a file.

**P7 — Production and reading** — ✅ 2026-10-09
- `translate` (tiles → typed → AI fallback labelled), `rewrite`, `expand`, `guided_compose`, `graded_reader`, numbers/time/date, `register`, `dialogue_turn`; tutor language mode and intents.
- ✔ Mocked-Gemini tests: AI output checked against the form index; unknown words glossed; AI never used as an answer key.
- Done: `engine/langcore.js` section P7 — `typedAnswer` / `sameWords` (stored sentence, alts, every spelling the form index reads as the same words), `checkText` (any text against the form index), `translateItems`, `rewriteItems`, `composeTask` / `composeCheck`, `readerTexts` / `readerQuestions`, `numberWord` / `numberItems` / `countingItems` / `heAnd`, `clockOf` / `dateOf` / `clockItems` / `dateItems`, `registerItems`, `dialogueItems` / `turnsOf`, the AI prompts `aiTask` / `readerTask` (+ `readerProblems`) / `tutorTask` / `tutorContext`, generators `GEN.translate` … `GEN.dialogue_turn` (§6.7); `engine/lang/85_prod.js` + `85_prod.css` — the widgets (`translate`, `rewrite`, `compose`, `number`, `clock`, `date`, `register`, `dialogue`, `readq`), the ✍️ Writing lane (`#/write/<lang>[/<set>]`), the 📖 Reading lane (`#/read/<lang>[/<text>]`, ✨ AI texts), the 🎓 tutor drawer, the home row and the tutor buttons (by wrapping `VIEWS.home`, `VIEWS.fn`, `VIEWS.lesson`, `VIEWS.node` — no edit of the other UI files); `tests/lang_prod.js` (Node over the pilot course + Playwright with Gemini mocked, ~120 checks).
- Left out, for lack of data: Chinese 万 and numbers above 100 / 1000 (the core's big numbers come with C11), German *halb vier* / *Viertel vor* clock times (none in the bank is read; the rule names the next hour), Arabic 21 / 31 … with a feminine noun (إِحْدَى), Hebrew compound numbers with 9 (dagesh after וְ), times with minutes in numbers; `register` has no Arabic formality variants (Arabic is drilled by the person addressed). The P7 generators are not listed in any grammar file yet (a content task): the lanes use them directly.

**P8 — Through Claude** — ✅ 2026-10-09
- New-course flow, task kinds in the app queue and the connector, skill guide, refcheck in the toolkit, night queueing of nodes.
- ✔ Connector and app-queue tests like the curriculum ones.
- Done (§10.1): `engine/langcore.js` (P8 section: account course skeleton, task queue, task texts, `checkLangAnswer`,
  `applyLangAnswer`, inbox merge, the parallel order in JS, refill requests, night queue), `engine/lang/95_claude.js` +
  `95_claude.css` (✨ new course dialog, `#/claude` queue page, ▶ key runner, 📋 copy / paste, 💬 connector message, inbox
  poll, refill card on the function page, comparison tables, account course storage), hooks in `engine/loader.js` (the
  🌍 overlay lists account courses and offers ✨; account courses open from the device or the cloud), `engine/cloud.js`
  (`a:langin:` / `a:langclaim:` stay in the cloud), connector tools `noema_lang_courses` · `noema_lang_task` ·
  `noema_lang_submit` (`cloud/mcp/server.mjs`, langcore bundled by `tools/build.py`), `tools/lang_course.py` (course ↔
  folder, answer from a folder), the skill's `LANGUAGES.md` and its toolkit (validate_lang, lang_refcheck, langlib,
  lang_course, the schema, `_typology`, `_phenomena`); `tests/lang_claude.js`.

**P9 — Listening and speaking** — ✅ 2026-10-09
- Speech synthesis for words and sentences, dictation, shadowing; then speech recognition (§3.9, §6.8).
- ✔ Mocked speech services in Playwright (synthesis, recording, recognition driven by the test); never real audio.
- Done: `engine/langcore.js` section “P9 — Listening and speaking” — `speechTag`, `pickVoice` / `voicesFor`, `soundKey` /
  `homophones`, `spokenTones`, `speechItems` and the generators `GEN.listen_pick | listen_tone | dictation | listen_meaning |
  shadowing | speak`, `checkDictation`, `checkSpoken`, `speechRecord`, `speechPlan` (§7.5 step 6), `setSpeechCaps`;
  `engine/lang/98_speech.js` + `98_speech.css` (the speech services with a no-voice notice, the 🔊 buttons, the widgets, the
  🎧 lane `#/listen/<lang>`, the settings, auto-play in the intro, the session step: one line in `50_session.js`); the ids in
  the validator and the task checks; `tests/lang_speech.js`.
- Left out: pronunciation scoring beyond the transcript (no phonetic data: an `ipa` parameter is not declared yet), minimal
  pairs (no data), audio files of real speakers.
**QA — the whole language part, end to end** — ✅ 2026-10-09
- Every lane, view and exercise type of §6–§10 walked through in the built app (Playwright) as a brand-new learner, a learner with the foundations in two languages and some vegetables, and a learner with all four languages and the core open, on 1280 and 390 px: answers right and wrong, progress recorded and shown, the next step offered, no page / console error, nothing sideways, lang / dir, texts a learner understands, keyboard.
- Fixed: the home organized (`engine/lang/99_qa.js` / `99_qa.css`: the order above, §8); a new learner's big button starts lesson S00 instead of “nothing due”; the end of a lesson and of a session offers ▶ the next lesson; a lesson check below 80 % in a lesson passed before says so (“passed before (best …)”) instead of “✔ passed”; 🏋️ deepening no longer shows the word above the question (it was the answer of the gap, confusable, nuance, register, idiom and origin items); 🔁 principal parts take their wrong options from the same word (der / die / das + the noun, plural / genitive / du / er patterns, the word's other forms) and hide the pinyin when it is asked; graded texts are titled by their first sentence (not “THING or PERSON is ADJECTIVE”); every Arabic / Hebrew / Chinese run in a text the app writes gets lang + dir (one observer); every language code has its name (✨ dialog: Portuguese, Korean …); the 🎓 drawer takes the focus, so Esc closes it without a key too; long chips wrap on phones; “1 point”.
- Tests: `tests/lang_walkthrough.js` (regressions of the above + every route for the three learners on both widths); `tests/lang_ui.js` / `tests/lang_poly.js` read the map's states from the chips' tooltips; `tests/lang_grammar.js` gives its session plan a day (the session extras come only with the daily plan).

**P9 — Listening and speaking** (later): speech synthesis for words and sentences, dictation, shadowing; then speech recognition.

Working rules for every phase: read this file first; keep existing subjects untouched; full test suite green; files written into the Mac repo; commit with a clear message; update the status table above and §14.

## 14. Changelog
- 2026-10-10 — The course inside the frame in main's calm style (asked by the user, §8 *Style inside the frame*): one primary action per screen, the other actions in ⋮ / Practice ▾ / sheets, the home as the frame's components (one big card, Your languages with a sheet of lanes each, the map as a list), no counts, rings or legends unless asked for, plain chrome, the chosen character's colours, fonts and shapes; `engine/lang/99z_frame.js`, `97_frame.css`; `tests/lang_frame.js` H. With `shell: false` nothing changes.
- 2026-10-09 — The new frame (`main`: PR #14 the frame, PR #11 the Shelf) merged into the language work, and the courses live inside it (§8 *Inside the frame*): the Languages tab lists every course (library and account) with its languages, progress and what is due; `#/lang/<course>/…` draws a course in the frame with crumbs and ⋮ (settings, ✨ Through Claude, another course), the course's addresses mapped both ways; a "continue" card on Today; + New language; the boot opens `?subject=lang:<id>` or the course you were in at `#/lang/<id>`; the frame's colours; `shell: false` unchanged. Conflicts resolved as docs/NEW_FRAME_AND_LANGUAGES.md and docs/SHELF_AND_LANGUAGES.md say (README, `loader.js`, `tests/curriculum.js`, `tools/build.py`). Tested by `tests/lang_frame.js`.
- 2026-10-09 — P9 listening and speaking: browser speech synthesis (voice per language, slow rate, text sent as written), 🔊 on cards, examples, sentences, intro, feedback, reader and compare views; `listen_pick`, `listen_tone`, `dictation`, `listen_meaning`, `shadowing`, `speak` (transcript compared with the stored forms, shadowing without recognition); the 🎧 lane, the settings, two items in the daily session (§3.9, §6.8, §7.5, §8, §13).
- 2026-10-09 — QA of the whole language part (three learners × two widths, every lane / view / exercise): the home organized (session · next lesson · lanes per language · grammar · the map near you), the next step offered after a lesson and a session, answers no longer given away in deepening and principal parts, foreign script always with lang + dir, readable reading titles and language names, Esc for the tutor without a key; `tests/lang_walkthrough.js` (§8, §13 QA).
- 2026-10-09 — P4 scripts and input: script modules as reference data (`tools/lang_script.py`, §4.9: ar / he alphabets with forms derived from Unicode, zh characters from Make Me a Hanzi + Unihan), the script stage stored in `lang:<L>:script` (§5.5, merged like words), the 🔤 lane and the exercise types of §6.1, keyboards / pinyin input for every typed answer and vowel-mark fading (§8), tokenizer fixes (§7.2: prefix spellings and וָ, لِلْـ, the bank's own Chinese splits).
- 2026-10-09 — P5 grammar lane: the ten exercise types of §6.3 / §6.4 still missing (paradigm, analyze, morph_build, root_pattern, agree, contrast, parse, gloss, proofread, combine) as generators with widgets, offered automatically where a function's data allows (grammar lane, function page, session; lessons keep their listed generators); proofreading errors only where they break agreement with a partner; feasibility counts sentences by D19 (§7.3); the 📐 grammar lane (§8); the session's grammar step uses the words just learned (§7.5); the validator checks generators and their pools.
- 2026-10-09 — P5v: vocabulary depth — the remaining §6.2 types made from the stored words and profiles (roots, compounds, semantic splits, collocations, confusables, intensity, register, nuance, connotation, idioms, cloze, senses, origins), as reviews of the word (R or P track), D19 caps on their sentences; 🏋️ practise this word (word card), 🏋️ deepen (node and lesson pages), 1–3 deepening items in the daily session (§6.2, §7.5, §8, §13).
- 2026-10-09 — P6 polyglot layer: `parallel_translate`, `parallel_align`, `which_language`, `cognate_bridge`, `compare_rule` (answers from parallel bank sentences, bridges computed from roots / etymologies / pitfalls, typological values and status); the ⇄ compare lane; bridges on the word card; one polyglot item per daily session of ≥ 2 languages and confusables side by side; a colour per language; today's languages on the home; depth-skipped words stay locked.
- 2026-10-09 — P7 production and reading: ✍️ Writing and 📖 Reading lanes per language (translate tiles → typed, accepted = the bank sentence, its alts and every spelling the form index reads as the same words, anything else AI-judged and labelled; rewrite / expand; guided writing with the AI rubric and the required words checked by the tokenizer; numbers built from the lexicon, counting with gender polarity and 两, clock and dates read from the bank; register and dialogue turns; graded readers of related frames with questions from the glosses; AI-written texts kept only when the tokenizer accepts them) and the 🎓 tutor in a language (context, known words, the rule, intents; AI text checked against the course) — `engine/langcore.js` (P7 section), `engine/lang/85_prod.*`, `tests/lang_prod.js`.
- 2026-10-09 — P8 done: courses and content through Claude — ✨ new language course (an account course, private and synced), the task kinds `lang.core` / `lang.node` / `lang.function` / `lang.compare` / `lang.refill` in one queue with checks in JS and additive merges, 🌙 night queue, the connector tools `noema_lang_courses` / `noema_lang_task` / `noema_lang_submit`, the skill's `LANGUAGES.md` and `tools/lang_course.py` in the toolkit (§7.4, §8, §10.1, §13).
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
