# Language courses — how to answer a task (noema-lite, docs/LANGUAGES.md §10)

A noema-lite **language course** is not a subject pack. It is a set of language-neutral concepts (fields), a DAG of
nodes (lessons, core lessons, field tiers), grammar functions and sentence frames — and for every language its
`language.json`, lexicons (one file per node), grammar realizations and a sentence bank. The learner's app makes every
exercise **from what you store** (paradigms, sentences): you never write an answer key, so every form must be right.

**First read `references/LANGUAGE_RULES.md` (binding, D1–D19).** The full contract is `references/LANGUAGES.md`
(§4 the content model, §6.7 generators, §7.4 refills, §10 these tasks, §11 the checks). The JSON Schema of every file:
`schemas/noema.lang.v1.schema.json`. The mini course in the repository (`tests/fixtures/lang-mini`) is a small,
hand-checked example of every file.

## Where the tasks come from
The learner creates a course in the app (🌍 Languages → ✨ New language course) or asks for more sentences on a
grammar page (✨ Ask Claude for more sentences with what I know). The app queues **tasks**:

| task id | kind | what you write (ONE JSON object) |
|---|---|---|
| `core` | `lang.core` | `{fields, nodes, functions, frames, typology?, languages?}` — the language-neutral core (§4.3, §4.4, §4.7, §4.8) and `language.json` for every course language that has none yet |
| `node:<node>:<code>` | `lang.node` | `{lexicon: {lexemes, absent?}, bank?, grammar?}` — the words of one node in one language with their paradigms, facade and profiles, sentences that use them, and (for a lesson) the realizations of its functions not written yet |
| `function:<fn>:<code>` | `lang.function` | `{grammar, bank?}` — one realization (§4.7) + ≥ 12 sentences that show it |
| `compare:<fn>` | `lang.compare` | `{compare: {function, rows: [{aspect, cells: {<code>: text}}], notes?}}` — the point across the course languages |
| `refill:<fn>:<code>:<n>` | `lang.refill` | `{bank}` — new sentences for one function made ONLY of the learner's known words listed in the task |

With the **connector**: `noema_lang_courses` → `noema_lang_task` (complete instructions + a link to the course file;
the task is claimed for you for 4 hours) → `noema_lang_submit`. Without it the learner copies the task into the chat
(📋) and pastes your JSON answer back (📥), or gives you the course file (`course-<id>.json`, ⬇️ on the ✨ page).

## The workflow (every task)
```bash
curl -sSL -o course.json "<the link in the task>"            # or the file the learner attached
python3 scripts/lang_course.py unpack course.json work/lang   # → work/lang/<course id>/ (the folder layout of §4.1)
# write answer.json (the structure of the task), then put it into the folder:
python3 scripts/lang_course.py apply work/lang/<id> answer.json <task id>
python3 scripts/validate_lang.py work/lang/<id> --lang <code> --alone     # fix every ❌ (nodes not written yet are warnings)
python3 scripts/lang_refcheck.py work/lang/<id> --lang <code>             # every form against Wiktionary (kaikki.org)
python3 scripts/lang_course.py answer work/lang/<id> <task id> > answer.json   # the answer read back from the folder
```
A library course comes as `course.pack.js` + `course.profiles.js` (+ the learner's `patch.json`: `unpack … --patch
patch.json`). Then submit `answer.json` (connector: `result_json`, the whole object as a string; chat: the JSON only).
The app and the connector check it again with the same rules (`langcore.checkLangAnswer`): a refused answer comes back
with its problems — fix **all** of them and send the whole object again.

## Rules per kind
**lang.core** — build on the library course: the same node ids (`fd.00`–`fd.18`, `cr.01`…), function ids and concept
ids for the same subjects, in the same order (D13 — the check compares every path of every language and type with the
library courses and refuses opposite orders). Every concept is in exactly one node or `"pending": true`; fields have
`sources` (how the list was made complete) and ranks per tier; lessons have `step`, `stage`, `functions` by `"*"` /
type / language code; the course has `typology` when it has lessons. A language without a `language.json` gets one in
`languages` — and a language new to the app needs its typological profile and catalogue of phenomena first (D14:
those are written in the repository, "Claude here in Cowork").

**lang.node** — a lexeme for every concept of the node, or `absent: [{concept, reason, use}]`. Each lexeme: `id`
`"<code>:<lemma>"`, `lemma` (= its citation cell), `pos` (UD), `senses` (concept ids; the first one owned by this node
in this language — a grammar word met early may carry a later concept with a `role`), every cell of `paradigmCells`
for its part of speech (+ `class` when the language splits the part of speech), forms fully vocalized for Arabic and
Hebrew, `gender` for nouns of gendered languages, `features` for **every** parameter of `wordFeatures` (a value or
`{"none": "<why>"}`), `contrasts` when a concept has several words (one axis, distinct values), `ref` (how you checked
it: `{"src": "kaikki", "checked": "<date>"}`), and the `profile` of every content word (§4.6). Chinese: characters only,
`trad`, `pinyin` (one syllable per character, spaces between), `features.measure` for nouns.
Sentences: ids `<code>.<node>.001`…, a frame of the course, `gloss` in the explanation language, tokens
`{t, l, f}` whose `t` equals the form of cell `f` of lexeme `l` (`p: true` for punctuation, `name: true` for names,
`parts` for words with attached prefixes), `text` = the tokens joined; `functions` lists only grammar a word of the
sentence shows by the realization's `evidence`; at least 3 sentences per new content word, with variants
(`variantOf`, `variant`) for negation / questions / plural where the functions allow.

**lang.function** — `function`, `status` (realized · periphrastic · absent — then say how the language does it instead),
`summary`, `blocks`, `procedure.askYourself`, `traps`, `evidence` (tags / lemmas / punct that show the point in a
sentence), `paradigmCells`, `needs`, `generators` (the exercise ids of §6), comparison `notes` for ≥ 8 reference
languages of all four types (D18) — general texts name no outside language (D16).

**lang.refill** — only the known words listed in the task (requirements ⊆ known, §7.4); every sentence lists the
function and shows it; new ids `<code>.refill.<fn>.<n>.001`…; vary the frames and the persons; at least 12.

**lang.compare** — one row per aspect of the point, every course language side by side, neutral, examples in the
languages themselves.

## Quality bar
Correctness over speed: ground every form, gender, plural, vowel mark, tone and fact (Wiktionary via `lang_refcheck.py`,
CC-CEDICT, reference grammars); leave out what you are not sure of; `ref.override` only with a reason. Then validate,
refcheck, and only then submit.
