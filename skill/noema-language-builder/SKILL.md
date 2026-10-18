---
name: noema-language-builder
description: Add a whole new language to a noema-lite language course from ONE request ("add Persian to my polyglot course"), taught through each learner's native language (D19 + R1–R3: neutral texts, structured contrast notes for every supported native and type, the word's parameters mapped first) — typology and catalogue of phenomena, the exhaustive map of the word's parameters per part of speech, the language's facade, every lesson's words with full paradigms and profiles, grammar pages, sentences, links and an audit, run as sub-agents following the noema-lite playbook — then pack it as a language package and upload it straight into the learner's noema-lite account, where the app adds the language to the course. Use whenever the user wants a new language in a noema-lite language course.
---

# noema-language-builder

You add ONE language to ONE noema-lite language course and deliver it as ONE file — a **language package**
(`noema.langpack/v1`, `references/LANGUAGES.md` §10.2) — uploaded into the learner's account. The noema-lite app then
shows the language in the course by itself, on every device: a lane in ⫴ parallel lanes, a chip, a row on the course home.

> **First rule — D19 (`$T/references/language-packs.md`): the language is taught through each learner's native language.**
> Supported natives = the languages of the app's UI locales: **en el ru fr ar de hi zh ja it es sq pt tr**. A learner with a supported native reads the
> explanations in it; others read the UI language and get the note for the type / branch / family of their language.
> So everything you (and every sub-agent) write is **neutral**: a general text — summary, blocks, procedure,
> traps, quiz, seeAlso, facts, word profiles, `features.*.none`, phenomena — names **no language outside the course** and
> never explains through English grammar ("no ‘do’", "-ing", "is not ‘the’"); every comparison is a **contrast note**
> `{for, rel, text}`: on **every grammar page** one for each supported native except the new language itself, plus
> `type:fusional`, `type:agglutinating`, `type:isolating`, `type:polysynthetic`, `branch:Semitic` (a type note names no
> language: "If your language …"); `profile.notes` on a word that invites a comparison; `notes` on phenomena. Notes are
> written in English with examples in the note's own language. The translations into the locales (locale facades) are
> NOT part of the package — they are later tasks. Check after every step: `python3 $T/scripts/lang_facade.py lint
> work/lang/<course>` (nothing for the new language).
>
> **R1–R3 (2026-10-11, with D19; `$T/references/language-packs.md` §2.2–§2.4).**
> **R1** — the learner sees comparisons in three sections: “From your languages” (their native's note first, then one per
> language they speak at C1 / C2), “Among the languages you are learning” (the other course languages), “From other
> languages” (folded: every other note). So write a note for **every** supported native (tr included) and every type.
> **R2** — every note (and pitfall, subtlety, fun fact, feeling) is **structured**, in this Markdown subset only:
> paragraphs separated by a blank line; `- ` / `1. ` lists for two or more points; `**bold**` for the one key sentence
> or word; `*italic*` for a cited word; an example on its own line starting with `→ `
> (`"Like Greek, German builds the perfect with **have + participle**.\n\n→ ich habe gegessen — έχω φάει"`); no
> headings, links, HTML, tables, code. One short sentence stays one sentence.
> **R3** — the **first step**, before any word: the exhaustive map of the parameters distinctive for words of the
> language, **per part of speech** (from the catalogue of phenomena and the grammars) — `lang/<code>/WORD_PARAMETERS.md`
> (a `## <POS>` section per part of speech naming every parameter: values, why it is learned with the word, its
> phenomenon) and the same map in `language.json` `wordFeatures`, with `prominent` (right under the word on the card)
> and `order` (the most important first). E.g. Arabic nouns: every plural with its meanings, dual, gender, human, root,
> pattern; German verbs: Präteritum, Partizip II, haben / sein, the present-tense vowel change, separable prefix, case
> government; Chinese nouns: measure words, traditional forms, readings per sense. Every word then states every
> parameter of its part of speech (a value or `{"none": "<why>"}`). `validate_lang.py` checks the map file, every word
> and the checklist of the language's type (`wordFeaturesChecklist` says why an item is not a word parameter).

`$T` below is the folder of this skill (the one with `scripts/`, `references/`, `library/`). In the noema-pack-builder
toolkit the same files sit next to `LANGUAGE_BUILDER.md` (this text). Everything works without the noema-lite repository.

## 0. Be honest first
* **Scale.** This is the whole of `references/NEW_LANGUAGE_PLAYBOOK.md`: ≈ 25 batches (typology and phenomena, the
  facade, the foundations F1–F6, the fields V1–V3, the core K1…, links, audit), each one a careful session with its audit
  turn — hundreds of words with complete paradigms and profiles, ≥ 15 sentences per lesson. It takes **hours**.
* **It needs** a sandbox that runs long tasks (python3, curl, network to kaikki.org for Wiktionary data and to the
  noema-lite website) and, best, **sub-agents** (an Agent / Task tool): Claude Code, or the Claude app / Cowork with code
  execution and the noema-lite connector. In a plain chat without code execution it **cannot be done** — say so, explain
  what is needed, and stop. Never fake a package.
* **Quality.** Correctness over speed (D3/D5): never invent a form, gender, plural, vowel mark, tone or example; ground
  everything in Wiktionary (`lang_refcheck.fetch`), WALS and reference grammars; leave out what you cannot ground. Never
  skip an audit turn. At the end say what a native speaker should still check.

## 1. Binding rules
Read `$T/references/LANGUAGE_RULES.md` (D1–D28, binding) and `$T/references/language-packs.md` (D19, the contract of the
explanation layers) before anything else, then `$T/references/LANGUAGES.md` §4 (the content model) and §10.2 (the
package). D13–D28 apply to the package exactly as to the library: the new language
**fills the course's existing nodes and grammar functions** in the course's order — it never adds a node, concept,
function or frame (report what you would add instead); every word states its whole facade (D14); every meaning is a
concept (D15); no built-in point of view (D16); **taught through the native language (D19)**: neutral texts, and every
grammar page has a contrast note for every supported native (en el ru fr ar de hi zh ja it es sq pt tr, without the new language) and the five type
notes, every note structured (R2); the word's parameters mapped first (R3); every word used is in the lexicon (D20).

## 2. Setup
With the noema-lite connector, call **`noema_language_package_guide`** (course, language): it returns these
instructions specialised for that course and language — the batches with their node ids, the links to the course file
and the toolkit. Follow it; the rest of this file is the same procedure in general form.
```bash
mkdir -p work
# the course file: a library course → course.pack.js + course.profiles.js from the website (library/languages/<id>/);
# the learner's own course → the signed link the connector gives (course.json); or the file the learner attached
python3 $T/scripts/lang_course.py unpack work/course.pack.js work/lang --world   # → work/lang/<course>/, work/lang/_typology, work/lang/_phenomena
python3 $T/scripts/lang_course.py plan work/lang/<course> <code>                # the batches of THIS course (F1…, V1…, K1…)
```
**Path mapping** (the playbook and the briefs are written for the repository): `library/languages/<course>` →
`work/lang/<course>`; `library/languages/_phenomena`, `_typology` → `work/lang/_phenomena`, `work/lang/_typology`;
`tools/<x>.py` → `$T/scripts/<x>.py`; `docs/<x>.md` → `$T/references/<x>.md`; `node tests/lang_courses.js` →
`node $T/scripts/lang_readback.js work/lang/<course> --lang <code>`. `mkbrief.py … --sandbox` writes the briefs with
these paths already.

## 3. The progress file — `work/<code>-progress.json`
```json
{"course": "<course id>", "code": "<code>", "steps": {"<step id>": {"status": "written | audited | done", "at": "<ISO time>", "report": "<short>"}}}
```
Read it first: skip every step that is `done`; a step that is only `written` resumes with its audit. Update it after
every step; a step is `done` only when its checks pass. If you must stop, the next run continues from here.

## 4. The steps — in this order, one fresh sub-agent each, then a second for the audit turn
For every step start a **fresh sub-agent** (no sub-agents: a separate, focused pass) with the step's text, the brief and
"work only in work/lang/<course>, work/lang/_phenomena, work/lang/_typology; report files written, counts, doubts".
When it is finished, start a **second sub-agent for the audit turn** (`references/NEW_LANGUAGE_PLAYBOOK.md`, "The audit
turn"): §C of LANGUAGE_RULES point by point, 10 words and 10 sentences checked again against Wiktionary and the grammar
pages, words without lexemes, empty cells, glosses that do not match, doubtful notes; fix, re-run the checks, report.
Then run the checks yourself and mark the step.

| step | what (the playbook's prompt) | checks |
|---|---|---|
| 1 | **Typology, phenomena and the map of the word's parameters** (prompt 1): the profile in `work/lang/_typology/languages.json` if missing (a value for EVERY feature, WALS-based), the complete catalogue `work/lang/_phenomena/<code>.json` (every feature it has AND lacks, tagged, neutral texts — comparisons as structured `notes` for supported natives and types, status `missing`), then **`work/lang/<course>/lang/<code>/WORD_PARAMETERS.md`** (R3): every part of speech, every parameter distinctive for its words, exhaustively — no word before it | `python3 $T/scripts/lang_phenomena.py --root work/lang --lang <code>`, `lang_facade.py lint work/lang/<course>` |
| 2 | **The facade** (prompt 2): `lang/<code>/language.json` (name, nativeName, script, dir, tokenJoin, vowel marks / romanization, typology, citationCells, paradigmCells, extraTags, **wordFeatures exactly as WORD_PARAMETERS.md maps them**, every POS, tied to the phenomena, with `prominent` / `order`; `wordFeaturesChecklist` for a checklist item that is not a word parameter), `"<code>"` in `course.json` languages and `defaults.depth`. The reference checker takes Wiktionary's language name from language.json `name` (or `wiktionaryName`): test it on 20 words. The engine part (LANG_INFO, tokenizer, script module, keyboard, speech tag) is NOT in the sandbox — note what the language would need there | `validate_lang.py work/lang/<course> --lang <code> --alone` (0 errors; missing words are warnings; no R3 warning: the map file, prominent / order, the checklist) |
| F1…F6 | **Foundations** (prompts 3–8): `python3 $T/scripts/mkbrief.py foundations --course-dir work/lang/<course> --lang <code> --batch F<n> --nodes <ids> --sandbox > work/brief-F<n>.txt` — the sub-agent follows the brief (its FIRST RULE is D19): words with full facade and profile, grammar pages with a note for every supported native and type, neutral texts, ≥ 15 sentences per lesson, the catalogue's status | `validate_lang.py … --lang <code> --batch <ids> --alone`, `lang_refcheck.py … --lang <code>`, `node $T/scripts/lang_readback.js … --lang <code>`, `lang_facade.py lint …` |
| V1…  | **Fields** (prompts 9–11): `mkbrief.py field …` — the same field in the other course languages as models; a rare item without a real word is an `absent` entry, never an invented word | the same |
| K1…  | **Core** (prompt 12, 15–25): `mkbrief.py core …` — only the lessons the other languages have (nodes in `course.draft` wait); search the lexicon for a concept before adding a word (D15) | the same |
| links | **Links** (prompt 13): seeAlso both ways — the new language's pages point to the other languages, and the other languages' pages of the same function get `{lang: "<code>", fn, note}` (only that field of their files); if the new language is a supported native: its contrast note on every grammar page of the other languages (D19); cognates, loans, false friends | `validate_lang.py … --strict --lang <code> --alone`, `lang_refcheck.py` |
| audit | **Audit** (prompt 14): 40 random words and 40 random sentences against Wiktionary and the grammar pages; `work/<code>-native-check.md` — what a native speaker should still check; fix in place | everything below |

## 5. Final checks, package, upload
```bash
python3 $T/scripts/validate_lang.py work/lang/<course> --strict --lang <code> --alone   # 0 errors (D19 included: errors by default; --d19-lenient is only for test fixtures)
python3 $T/scripts/lang_facade.py lint work/lang/<course>                                # D19: nothing for <code>
python3 $T/scripts/lang_refcheck.py work/lang/<course> --lang <code>                     # no disagreement (ref.override only with a reason)
python3 $T/scripts/lang_phenomena.py --root work/lang --lang <code>                      # no ❌
node $T/scripts/lang_readback.js work/lang/<course> --lang <code>                        # the app's runtime reads it back
python3 $T/scripts/lang_course.py package work/lang/<course> <code> -o work/<code>.langpack.json
node $T/scripts/lang_readback.js work/lang/<course> --lang <code> --package work/<code>.langpack.json --course work/course.pack.js   # the app's own check
```
`package` refuses while the validator has errors (and while the cached reference check disagrees). Then, with the
connector: **`noema_lang_package_start`** (course id, language code) → run the `curl` it returns (it PUTs the package into
the learner's private storage) → **`noema_lang_package_finish`** (same arguments): it checks the package exactly as the
app does and records it in the learner's account, or lists every problem — fix them in `work/lang/<course>`, package
again, upload again. Without the connector, give the learner `work/<code>.langpack.json` and say it needs the connector
(or the repository) to reach the app.

## 6. Report to the learner (short)
What was written (words, absent entries, grammar pages, sentences per batch), what is absent and why, words and facts you
were unsure of or left out, every `ref.override` with its reason, the D19 notes written (per supported native and type), the
word-parameter map (R3: parameters per part of speech), what the app's engine would still need for this
language (tokenizer, script, keyboard, voice), and the list from `work/<code>-native-check.md`.
