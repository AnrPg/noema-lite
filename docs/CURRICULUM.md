# 🧭 Curricula — from a goal to a map of steps

noema-lite has two ways to study:

| | 📚 **Subjects** | 🧭 **Curricula** |
|---|---|---|
| What | ready-made subject packs (your sources → a course) | a goal → a directed acyclic graph (DAG) of steps |
| Material | fixed, made once | **generated on demand**, one subject per step, then kept for good |
| Order | free | prerequisites → the goal → applications; a step opens when its prerequisites are mastered |

Every step of a curriculum **is a normal subject pack**: the same home page, theory, exercises (all
types, picture exercises), flashcards, debug drills, mistakes gym, Socratic tutor, sources, sync and
backups. The only additions are the 🧭 **Map** button and a banner with the step's mastery.

## 1. Building a curriculum (four agents)

Subject picker → **🧭 Curricula** → **➕ New curriculum**. You give the goal, the language, your
starting point (optional), the depth (standard 12–20 / **deep 20–40** / exhaustive 40+ steps for
the goal) and the number of applications. Then four agents run, one after the other (prompts in
`engine/curriculum.js`, adapted from the curriculum design brief):

| # | agent | does | output contract |
|---|---|---|---|
| 1 | **DAG creator** (v2 prompt) | all prerequisites from the true foundations, traced back for a complete beginner and across sciences (STEM ↔ humanities ↔ social sciences ↔ economics), the goal, 3–6 applications in different contexts; bottlenecks; minimal + deep learning paths; per node the knowledge domain and processing levels (Marzano & Kendall) | `dag_creator` v1 |
| 1b | **Prerequisite auditor** | an independent coverage pass on the prerequisite part: hidden prerequisites, missing foundations, cross-domain bridges | `prerequisite_auditor` |
| 2 | **Goal expander** | replaces the goal by an introduction → major aspects → sub-topics (two tiers) → related topics → a synthesis node; prerequisites and applications untouched | `goal_expander` v1 |
| 3 | **Chapter planner** | for every node (batches of 5, 3 in parallel): learning goals + 4–18 ordered chapters with teaching goals and required coverage (Bloom, Fink, SOLO, Webb, Marzano used internally) | `chapter_planner` v1 |

**Robustness**
* Every answer is checked against a JSON Schema **and** semantic rules (unique refs, one goal,
  every foundation leads to the goal, applications after it, acyclic, one mastery record per node,
  depth within range, no duplicates of existing nodes, one plan per requested node…). Problems are
  sent back to the agent with the exact list ("foundation X does not lead to the goal…"), up to 2
  repair rounds (`engine/llm.js`).
* The app — not the model — rebuilds the graph after the expansion (rewiring goal → applications into
  synthesis → applications, leaves → synthesis), so the trusted parts never change.
* Every stage is saved; **Stop** and **Continue** later resumes at the unfinished stage.
* Claude answers through a forced tool call (streamed, so long graphs never time out); Gemini in JSON mode.
  Models that refuse a forced tool call (`tool_choice: type "tool" … not supported for this model`) are retried at once with
  `tool_choice: auto` + “always answer by calling the tool”, and models without tools with a JSON-only answer; the working
  mode is remembered per model (`noema-device:claude-json-mode:<model>`), and a JSON written as text is read too.

## 2. The map

Full screen, three coloured parts (**1 · Prerequisites · 2 · the goal · 3 · Applications**), layered
left → right. Each step shows its state: **✅ mastered · 🔓 open · 🔒 locked**, and **⚡ prepared ·
⏳ being prepared · ⚠️ failed**.

* Click a step → panel (bottom sheet on phones): summary, role and disciplines, what it builds on and
  what it opens, **learning goals**, **chapters** (tap one for its teaching goals and coverage).
* **Locked** steps: information and chapters only, plus the prerequisites still to master (links).
* **Open** steps: 📖 **Study** (prepared) or ⚡ **Prepare now**, and 🎓 **I already know this**.
* ▶ **Next up**: the open steps in a good order. ± / ⤢ Fit / Ctrl + wheel: zoom.
* ⚙️: prepare-ahead count, Claude limit per step, which AI, pause background preparation, export, delete.

## 2b. Changing the map, and reviewing a step before it is prepared
* **📝 Review first.** The first time you open a step, noema-lite shows its plan — name, what it teaches,
  learning goals and chapters (with their teaching goals and coverage) — and you can change anything: rename,
  reorder (▲▼), remove (✕), add chapters, or **✨ re-plan with AI** with your own wish. Only when you press
  **✅ Looks good — prepare it** is the material generated. Steps waiting for you show **📝** on the map and
  "needs your review" in ▶ Next up. (⚙️ → untick *Let me review each step* to prepare automatically.)
* **After preparation** the chapters are fixed (they are what the subject was built from), but the step can still
  be renamed (its subject is renamed too), moved and linked differently.
* **✏️ Edit step** (any step, also locked ones): name, summary, place (prerequisite / introduction / aspect /
  sub-topic / related / synthesis / application), prerequisites and dependent steps. Only links that keep the
  graph acyclic are offered.
* **➕ Step**: add your own step where it belongs; the AI plans its chapters (or write them yourself).
* **🗑 Remove the step**: its prerequisites become prerequisites of the steps after it (the order is kept); its
  prepared material can be deleted or kept as a normal subject.

## 3. Mastery and unlocking

A step is **mastered** when **every section is read and ≥ 80 % of its exercises are solved**
(computed from the subject's own progress), or when **🎓 I already know this** is passed with 8/10
(questions from the step's own exercises when it is prepared, otherwise written by the AI). A
mastered-by-test step can be undone. A step **opens** when all its prerequisites are mastered.

## 4. Preparing the steps (each step = a subject)

* **Ahead of time**: while the app is open, noema-lite keeps the next *N* open **reviewed** steps (default 3) of
  every curriculum prepared, one at a time per device. Opening a step that is not ready moves it to the
  front of the queue. Browsers cannot work while closed, so preparation pauses when no noema-lite tab is
  open and continues next time.
* **With Claude (API key)**: the step is built by the **noema-pack-builder skill** in Claude's
  code-execution sandbox (`engine/claude.js`, job kind `node`): the brief carries the chapter plan and
  what the learner already masters; Claude researches **official sources** with web search + web fetch,
  records them, adds web pictures (downloaded by the app) and drawn diagrams / function graphs, and
  validates with `make_pack.py`. A spending limit per step pauses and asks.
* **With Gemini (free key)**: `engine/packgen.js` builds the subject in the browser: a research brief with
  **Google Search** grounding (its sources are listed in the subject), the subject identity, then one
  call per planned chapter in noema-lite's own format (contract from `tools/CONTENT_SPEC.md` +
  `docs/VISUAL.md`, shipped as `engine/authoring.js`), with 1–2 diagrams per chapter drawn by the JS
  diagram kit (flow, cycle, hub, layers, tree, compare — SVG + clickable regions) and picture exercises
  on them. Each chapter is checked by `engine/packcheck.js` (strict) plus quantity rules (≥ 4 exercises
  per section, ≥ 7 types, ≥ 3 picture exercises, ≥ 25 % pitfall/debug/exam, flashcards, pitfalls…) and
  repaired by Gemini when needed. Progress is saved per chapter (resumes after a reload).
* Two devices never build the same step (a lock in the synced key `a:curgen:<id>`, renewed every minute).

## 5. Storage (everywhere, like subjects)

| what | where |
|---|---|
| the curriculum (graph, plans, statuses) | key `a:curriculum:<id>` → this device + cloud (synced) |
| “I already know this” results | key `a:curprog:<id>` |
| each prepared step | an imported subject pack `cur-<id>-<node>-<hash>`: IndexedDB + cloud storage + `a:packmeta` (with `curriculum`, `node`) |
| progress inside a step | the subject's usual state key |
| Claude jobs / Gemini runs in progress | this device's IndexedDB (`noema-claude`, `noema-packgen`) |

Prepared steps are hidden from the 📚 Subjects list (they live in their curriculum). Backups include
everything.

## 6b. 📥 Importing a map you already have (`engine/curimport.js`)
Subject picker → 🧭 Curricula → **📥 Import a map**. The map becomes the curriculum **as it is**: no DAG creator, auditor or
goal expander runs. Only the chapter planner (agent 3) plans the steps that have no chapters yet.

**In-app guides.** The ⓘ of step 1 (“Your map”) explains every form (tree / outline, arrows, Mermaid, JSON, anything else) as
a table *syntax → what it means*, each with an example, its “Read as” (the links the app makes) and **▶ Try it** (loads it into
the box). The ⓘ of step 3 (“Material”) explains how files reach steps: named in the map (📎 on a step, a `📎 Files` section,
JSON `files`/`folder`), path syntax (folders, `*` `?` `**`, page ranges), the automatic matching (folder → number → name, with
✓ ≈ ? ⚠️ —) and how to fix a match. `tests/curriculum_import.js` parses every example and checks its “Read as”.

**Any shape.** A map is a DAG: a step may open several steps (a *branch*) and need several (a *join*, e.g. A→B, A→C, B→D,
C→D — a “diamond”). Both are normal everywhere (map, mastery: a join opens when all its prerequisites are mastered). Only a
real circle of “needs” is refused, with the steps on it named. Links implied by others (A→B→C makes A→C redundant) are
dropped. The preview draws the map (branches and joins visible) and counts steps, links, branches, joins, starting points.

**Formats (no AI needed)**
| format | example | how |
|---|---|---|
| tree / outline | `├── └── │`, bullets, `1.` / `1.2`, indentation, `#` headings | a single top line (or a title line above a list) is the **title**; a parent topic comes before its sub-topics; siblings follow each other when **numbered** or by default (“in the order written”), or are independent with **`(any order)`** on the parent (per level; `(in order)` the other way; the default is in “How to read it”); the step after a level waits for all of it (a join); extra links `Topic (after: A, 2.1)` / `Topic ← A` (by title, number or id) |
| arrows | `Algebra → Calculus → Probability` · `A, B → C` (join) · `A → B, C` (branch) | one chain per line (`→ -> => ⇒`); lines without an arrow are single steps; `# heading` = title |
| Mermaid | `flowchart LR` · `A[Algebra] --> B(Calculus) & C` · `-- text -->` · `==>` · `subgraph` | `A --> B` = A first (⇄ reverses); a link to a subgraph goes to its first / from its last steps; 📎 also inside labels |
| JSON | noema-lite's export (keeps chapters), `dag_creator`, `{nodes:[{id,title,prerequisites\|after,chapters,files,folder}], edges}`, nested `children` (+ `order: "any"`) | prerequisites by id or title |

`Topic — what it covers` gives a summary. Prerequisite / application words (*Prerequisites, Βασικές…, Applications,
Εφαρμογές*) set the part (and everything under them). ALL-CAPS titles get normal capitals unless *keep capitals* is ticked.

**Naming the files — in every format**
* on the step: `Topic 📎 book.pdf pp. 40–62, notes/topic/*.md` (Mermaid labels too; JSON `files` / `folder`);
* a **📎 Files** section at the end (Mermaid: `%% 📎 Files` + `%% key: …`), one line per step — the key is the step's
  title, its outline number (`2.1`) or its Mermaid / JSON id:
  ```
  📎 Files
  DNA replication: dna/*.pdf, notes/dna.md
  2.1: lab/
  Transcription: book.pdf pp. 40–62
  ```
Paths match the files you add *with their folders* (a dropped folder or a .zip keeps them): a name, a path suffix, a folder
(`lab/` = everything in it), globs (`*`, `**`, `?`); accents, case and separators do not matter; `pp. 40–62` / `#40-62`
gives only those pages to that step. **One file may serve several steps** (a textbook, with pages per step).

**Automatic matching** of the files the map does not name, each with a confidence you can review:
1. *by its folder* (✓) — any folder level named like a step (`03 Transcription`, `2.3 Promoters`, the step's number alone);
   the deepest wins; two steps with the same title (“Introduction” under two topics) are told apart by the parent folders;
   a folder all files share (the dropped folder itself) is ignored unless it is itself a step;
2. *by its number* (≈) — `03 …` / `2.3 …` = the step's outline number (or its position in the map);
3. *by its name* (≈ exact, ? similar) — ⚠️ when two steps fit equally (“or: …” offers them).
The table has tabs **All / ⚠️ To check / Not used**; each file shows its steps as chips (with pages), **＋ also for…** adds
another step, and you can **drag a file onto a step** in the preview or tap a step to see and give it files.

**Storage.** Every file is stored **once per curriculum** (`curfiles-<id>`, this device + cloud, big files in parts), described
in `c.files` (name, size, pages, outline, SHA-256); a step's `material.files` entries point at it with their page range
(`fileId`, `range`) plus the part of the outline in those pages and their first lines. When a step is prepared, its subject's
sources **link** to that copy (no second copy; Claude's packaged file is recognised by its SHA-256). A file no step uses any
more is deleted. ✏️ Edit step → 📎: add files, **use a file of this curriculum** (with pages), change the pages, remove.

A step **with files** is not researched:
* the planner plans its chapters **from the files** (only its pages), each chapter with `material` = file + pages;
* **Claude** gets the files in its sandbox (`NODE_FILES`, told which pages belong to the step), no web_fetch;
* **Gemini** gets the text of exactly those pages instead of a Google Search brief.
Steps **without** files are researched as before.

**✨ Let the AI read it** — for anything else (prose, an unusual JSON): the same structure (`S_IMPORT`), checked like every
agent answer: titles only from the map, none missing, refs valid, acyclic; file names / pages it finds are kept.

## 7. 💬 With the Claude app — the learner's Claude plan (`engine/curjobs.js`)

Choose **💬 Claude app — with your Claude plan** when creating or importing a curriculum (preselected for cloud accounts,
marked *recommended, usually cheaper*), or switch a curriculum in ⚙️, or send single steps with **💬 In my Claude app
instead**. Nothing then runs in noema-lite: the learner's own Claude (Claude app / claude.ai, Free · Pro · Max) does the
work through the connector, and the results arrive by themselves. Why: a curriculum has many steps and each is a full
subject — a few dollars each with an API key, nothing extra with the plan; the saving grows with the curriculum (the plan's
usage limits may spread a big one over days).

| work | when | how Claude gets it | the answer |
|---|---|---|---|
| **map** — agents 1 · 1b · 2 | a new curriculum (stage `dag` → `audit` → `expand`), status `waiting` | `noema_curriculum_task`: the agent's own prompt + JSON Schema | `noema_curriculum_submit` |
| **plan** — agent 3, batches of up to 5 steps, at most 2 of them with files | steps without chapters (imported maps; ✨ re-plan / ➕ step without a key → `replan` + the wish) | the planner's prompt + a summary of the steps' files (pages, outline, first lines) **and signed links to the files**: Claude reads each step's pages before planning it (by hand: the task names the files to attach, ⬇️ Download them) | same |
| **step** | a step in the queue: `pack.status = 'app'` (sent from the map, or *prepare ahead* for a Claude-app curriculum) | the brief, the subject id (`packId`), signed links to the learner's files (big files in parts) | the pack, saved with `noema_start_upload` → `noema_finish_upload` |

* **One code path.** Tasks, the checks of an answer (JSON Schema + the agents' semantic rules) and how an answer changes the
  curriculum are `engine/curjobs.js` + `engine/curriculum.js`; the connector bundles the same files, so a Claude-app answer
  is held to exactly the rules of an in-app agent, and wrong answers go back to Claude with the list of problems.
* **The inbox.** The connector never writes the curriculum record (the app may be changing it). Each accepted answer is a KV
  row `a:curin:<cid>:<seq>`; the connector works on the curriculum *as it will be* (the record + its inbox, in order).
  The app (`NoemaCurJobs.App`) reads the inbox when it comes back to the front and every 20 s while something waits,
  checks each answer again, applies it, pushes the curriculum to the cloud and only then deletes the rows (so the connector
  always sees one or the other). A finished step: the app downloads the pack (pictures embedded), marks the step ⚡ and
  syncs the file index the connector wrote. Inbox rows are never mirrored into the device's KV.
* **The map** shows a 💬 bar (*N to plan · M to prepare* → 📋 Copy the message · How? · by hand); 💬 on steps waiting for the
  Claude app; the step panel offers the message, “by hand”, 📥 Import its package and ↩ Not now. A Claude-app curriculum
  is usable as soon as its graph exists; steps get their plans as they arrive.
* **The learner's files.** Step tasks carry signed links to the curriculum's stored files; when Claude packages the same
  file (same SHA-256), `noema_finish_upload` does not ask for it again and the step's source links to the curriculum's copy.
* **Without the connector** (or without a cloud account): *How? · by hand* — 📋 Copy the task (the same text, “answer with the
  JSON only”), paste Claude's answer (problems listed, 📋 copy them back to Claude); for steps ⬇️ a bundle
  (`TASK.md` + `files/` + the toolkit zip) and 📥 Import its package (`.noema.zip` / `.json`, stored under the step's id).
* **Set up:** ❓ Help → Set up Claude → **C** (also ✨ Create with Claude → C): the connector steps of way B, then “choose
  💬 Claude app → paste the message → come back”, with a comparison of the ways.

## 6. Tests
`tests/curriculum.js` (scripted Claude + Gemini APIs, Supabase emulator): the four agents incl. a
repaired graph, 25-node map in three parts, locked/open, chapter details, background preparation of the
next 2 steps by Claude skill jobs (web search + fetch), cloud storage and sync, studying a step in the
engine, automatic mastery, placement test unlocking the next step and undo, phone layout, the Gemini path
(stop + resume without redoing agents, Google Search research, repaired chapter, 4-chapter subject with
drawn diagrams and listed sources). `engine/packcheck.js` is also the connector's pack gate.
`tests/curriculum_app.js`: §7 end to end — the connector (run in-process as the learner's Claude) builds a curriculum's map
(a wrong answer sent back), plans it in batches, prepares a reviewed step; an imported map with a PDF (signed link, the same
file not uploaded twice); copy / paste, a step bundle and its package; re-plan with a wish; Set up Claude → C; phone.
`tests/curriculum_import.js`: the parser (tree art, nesting + independent, Mermaid, ⇄, JSON, Greek outline, loops, file
matching), then in the browser: a pasted tree with two files → only the planner runs (with the files' pages, outline and
first lines) → a step with a PDF built by Claude from the uploaded file (no web_fetch, packaged back as its source) → a
step with notes built by Gemini from their text (no Google Search) → 📎 add / remove in the editor, fixed once prepared
→ ✨ AI reading with an invented topic sent back → a .zip with a folder per step → phone layout; branches and joins in
every format, the files section, paths / globs / folders, duplicate titles told apart by folders, a textbook for two steps
(stored once, pages per step, Gemini reads only those pages, the step's subject links to it), drag & drop onto a step.
