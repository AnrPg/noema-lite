# Search, stable addresses and collections

One search over everything the learner has: Roadmaps and their stations, subjects (chapters, sections, every theory
block, exercises, flashcards, traps, debug drills, sources), language courses (words, meanings, grammar, lessons,
fields, sentences, peculiarities) and the conversations with the character. Content others share in Discover is not
searched here; Discover has its own search.

Files: `engine/catalog.js` (the catalogue: records, folding, scoring, the stored index), `engine/search.js` (the sheet,
the page, collections, the practice round, its words), engine hooks in `engine/src/40_views.js` (deep links, the
`#/srun` round), `engine/shell.js` (🔎 in the top bar, `/` and Ctrl K, the `#/search` page). Tests:
`tests/search_catalog.js` (Node) and `tests/search.js` (Playwright).

## 1. Where it is

| Place | What |
|---|---|
| 🔎 in the top bar, `/`, Ctrl K / ⌘K | The quick sheet: type, see the best 3 of each kind; Enter or "Open in a page" opens the page |
| `#/search?q=…` | The page. Everything it shows lives in the address, so it can be bookmarked, shared and saved |
| Knowledge tab | A quiet "Saved searches (N)" link next to the Shelf link |
| ⋮ on the search page | Saved searches (N); on a saved search also practise, rename, copy link, delete |

Address keys: `q` the words · `w` `know`/`lang` · `t` kinds (comma list) · `h` + `it` the place the search was opened
from (`subj:<id>`, `cur:<id>`, `course:<id>`) and its title · `in=1` only there · `lg` a language code · `st`
`unread`/`unsolved`/`wrong` · `c` the collection shown.

Default scope is everywhere; when opened from a subject, a Roadmap or a course the sheet and the filters offer
"Here: <title>". The page stays quiet: everything that narrows the results is folded under "Filters ▾": what to show
(kind chips with counts, several at once, grouped Knowledge · Languages · Conversations), side (only when the learner
learns both), scope, language, status.

While the app is read for the first time on a device (or after an update of the index format), a friendly line says so
and shows how far it is; results found so far appear at once. Later only changed sources are read again.

## 2. Results

Grouped by kind, always in this order: Roadmap · Station · Subject · Chapter · Section · Theory · Exercise · Flashcard ·
Trap · Debug drill · Source · Word · Meaning · Grammar · Lesson · Field · Sentence · Peculiarity · Conversation.
Exact matches (a title or a word equal to the query) go on top and are not repeated in their group. On the page every
group starts folded with its count; opened, it shows 3 results and "+N more" below.

Each result shows: kind · the field that matched (Chapter · Subtitle, Theory · Table, Station · Learning goals…), a
**Knowledge** or **Languages** pill, the title, a snippet with the words marked and a little before and after, and
where it is (Subject › 3. Chapter › Section; a word's languages). A conversation adds its style and where it began
(§5).

Matching: accents, case, ß/ss, final sigma, Hebrew points, Arabic vowel marks and hamza signs do not matter; pinyin
matches with tone marks, without them, or with tone numbers (`xing3`). A word is found by any of its forms. Exercise
answers and explanations are never indexed.

## 3. Records (engine/catalog.js)

```
{ ty, w: 'know'|'lang', k: unique key, ti: title, f: [[field, text]…], h: address, pa: [path…],
  sj?: subject id, cu?: Roadmap id, co?: course id, lg?: [language codes], x: {kind-specific}, ex?: [exact strings] }
```

Builders: `fromPack(pack, meta)`, `fromCurriculum(cur)`, `fromLangCourse(data, meta)`, `fromConvos(list)`. A change in
what a pack, a course or a conversation holds that should be searchable is a change in its builder (and in
`tests/search_catalog.js`). Bump `SCHEMA` in catalog.js when records change shape: every stored index is rebuilt.

The index is kept per account and source in IndexedDB `noema-lite-search` (store `src`, key `<account>|<source>`,
value `{schema, sig, recs}`). Sources: `pack:<id>`, `cur:<id>`, `lang:<course>`, `convos`. Each has a signature
(version, update time, counts); only sources whose signature changed are rebuilt, one at a time in the background,
with a progress line. The Databricks pack (≈4 900 records) builds in ≈90 ms; a language course (≈10 000) in ≈180 ms;
a search then takes a few ms.

## 4. Stable addresses

| Kind | Address | What happens |
|---|---|---|
| Theory block (paragraph, table, code, figure, terms…) | `#/s/<section>/<block>` | The section opens at that block (its part is unfolded), scrolled to it and highlighted |
| Trap | `#/ch/<chapter>/traps/<trap>` | The chapter's Traps tab, that trap highlighted |
| Flashcard | `#/cards/<chapter>%23<n>` | That card alone |
| Exercise | `#/ex/<id>` | The exercise |
| Debug drill | `#/drill/<id>` | The drill |
| Sources | `#/subject/sources` | The subject with its sources open |
| Station | `#/map/<roadmap>/<station>` | The Roadmap with the station's panel |
| Language items | `#/lang/<course>/w/<code>/<word>`, `/c/<concept>`, `/fn/<fn>/<code>`, `/lesson/<id>`, `/node/<id>`, `/field/<f>`, `/peculiar/<code>` | The language pages (as they are) |

Block ids: `'b' + hash36(type + '|' + the block's JSON without run-time `_keys`)`, a second identical block in the same
section gets `-2`. They do not move when a block is added elsewhere. Trap ids: `'p' + hash36(title + '|' + text)`.
Subject addresses open in their subject (the app reloads into it, `NoemaShell.open(subject, hash)`).

## 5. Conversations: style and origin

Every tutor conversation keeps `context.origin` (engine/convos.js keeps it; docs/CONVERSATIONS.md):

```
origin: { via, ex?, sec?, ch?, bid?, card?, drill?, what?, world?, course?, lang? }   // short keys, strings or numbers
```

`via`: `tutor` (the character button), `explainThis` (Explain this on a block: `bid`, `sec`), `explainDifferently`,
`helpSocratic`, `askHint` (an exercise: `ex`), `cardHint`, `cardExplain` (`card`), `section_socratic`,
`section_debug`, `section_interview` (`sec`), `chapterSocratic` (`ch`), `drillRoleplay` (`drill`), `lang` (a language
course). The result shows e.g. *Explain · from "Explain differently" · exercise 3 of chapter 2 «…»* or *Socratic ·
from "Explain this" · table in "Metastore"*. Older conversations without `origin` show what their context says.

## 6. Saved searches and the practice round

"Keep this search" saves the search (its address keys and a name) with the account (`a:searches`, synced; called
collections in the code). Opened again, a saved search shows its results as they are now. The empty search page lists
the saved searches (⋮: open, practise, rename, copy link, delete) and the last 8 searches of this device.

"Practise these results" shows only when Filters ▾ keeps nothing but kinds that can be practised (exercises,
flashcards, words, meanings, vocabulary fields, lessons). It builds a round from what is shown: per subject its exercises found (≤60) then its flashcards
found (≤60), and per language course the recall drill of the vocabulary fields of the words and meanings found, and
the lessons found (≤8 language steps). Steps run one after another (`#/srun` in the engine, the language routes for
the language steps); the end of each step offers "Next: …" and the end of the round returns to the results. The round
lives in `sessionStorage` (`noema-device:searchRound`).

## 7. For the language side (requests to the language courses' owner)

The search reads the language courses without changing them: `fromLangCourse()` in `engine/catalog.js` builds the
records from the course data (`Noema.langCourses()` / `Noema.langData()`), and the language tutor's conversations
(`engine/langui.js` `persistTutor`, subject `lang:<course>`) already land on the Languages side, in their course and
language, with their label as the place. Nothing in `library/languages/`, `engine/lang*` or the language tests was
changed. To fit the same model fully, when convenient:

1. **Origin of language conversations.** In `persistTutor`, add
   `context.origin = { via: 'lang', world: 'lang', course: UI.id, lang: ctx.lang, intent: ctx.intent, fn?: ctx.fn, node?: ctx.node }`
   (keys ≤20 letters, string values; `engine/convos.js` keeps them). Name new `via` values in `engine/search.js`
   (`via_*` words, four languages) if the tutor is opened from distinct buttons (a word card, a sentence, a lesson).
2. **Deep links that highlight.** The word, meaning, grammar and lesson addresses already open the right page. If a
   sentence or a peculiarity should open scrolled to and highlighted like a theory block, accept an optional last
   address part (`#/lang/<course>/peculiar/<code>/<id>`, a sentence id on its lesson) and add the `ns-hit` class to
   that element for ~2.6 s; then point the builder's `h` there.
3. **Course data changes.** When a course gains a kind of content that should be found (new fields on lexemes,
   sentences or phenomena), extend `fromLangCourse()` and its test in `tests/search_catalog.js`, and bump `SCHEMA`.
   The source signature uses the course `version` and path, the registry `builtAt` and a hash of an account-made
   course, so a rebuilt course is re-indexed by itself.
4. **Practice from search.** Language steps of a round use `#/lang/<course>/recall/<field>` and lesson addresses. A
   route that practises a given list of words (`…/recall/ids/<id,id…>`) would let the round practise exactly the
   words found instead of their whole fields.
