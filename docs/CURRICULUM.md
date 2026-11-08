# 🧭 Curricula — from a goal to a map of steps

The way to study in noema-lite is a **curriculum**: a goal → a directed acyclic graph (DAG) of steps (prerequisites → the
goal → applications; a step opens when its prerequisites are mastered). Each step is taught by a **subject pack** —
generated on demand for that step and then kept for good, or **📦 a subject you already have**, attached to the step (§9).
Subjects that teach no step wait on the **📚 Shelf** (§9): they stay studyable, but the subject picker leads with 🧭 Curricula.

Every step of a curriculum **is a normal subject pack**: the same home page, theory, exercises (all
types, picture exercises), flashcards, debug drills, mistakes gym, Socratic tutor, sources, sync and
backups. The only additions are the 🧭 **Map** button and a banner with the step's mastery.

> **Starting from a pile of material?** 📚 *From your sources* (docs/FROM_SOURCES.md) proposes a Roadmap or one subject and
> then uses §6b (a Roadmap) or ✨ Create with Claude (a subject).

**Where the code is.** The Roadmap itself — the graph, the queue for the learner's Claude (tasks, claims, the inbox),
mastery and unlocking, the chapter plans of two copies, translations, levels and restructuring — is the domain
`src/features/roadmaps/domain` (pure TypeScript, every time a `now` argument), with its services in
`src/features/roadmaps/application` (the way up the ladder, an approved restructuring) and the 文A bridges' lookup in
`src/features/bridges/domain`. The older screens and the connector reach it as `NoemaCore.roadmaps` / `NoemaCore.bridges`
(the phase bridge; the connector imports it directly); `engine/curriculum.js`, `curjobs.js`, `curshare.js`, `curimport.js`
and `sourceplan.js` keep the agents' prompts and checks and the app's side, and call the domain for the rest.

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
left → right. Each step shows its state: **✅ mastered · open (green open padlock) · 🔒 locked**, and **⚡ prepared ·
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
  `docs/VISUAL.md`, shipped as `engine/authoring.js`), with 0–2 diagrams per chapter (only where they teach) drawn by the JS
  diagram kit (flow, cycle, hub, layers, tree, compare — SVG + clickable regions) and picture exercises
  on them. Each chapter is checked by `checkPack` (strict; `src/features/content`, `NoemaCore.content`) plus quantity rules (≥ 4 exercises per section; `checkPack` strict; ≥ 3 picture exercises when the chapter has a diagram; ≥ 25 % pitfall/debug/exam; flashcards, pitfalls…) and
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
  syncs the file index the connector wrote. Inbox rows are never mirrored into the device's KV. A **new part** of the
  Roadmap (`noema_extend_roadmap`, `{ kind: 'extend' }`) arrives the same way: its steps, links and `c.parts` entry
  (docs/FROM_SOURCES.md §6). So do **links between steps already on the map** (`noema_link_roadmap_steps`,
  `{ kind: 'link', links, remove }`, 🔗 a toast): edges added (with their `why`) or removed and the study order recomputed —
  a prepared step may get a new prerequisite, because only the map changes (no re-plan, no pack, no progress). A **new
  arrangement by level** (`noema_restructure_levels`, `{ kind: 'restructure', id, plan }`, 🪜 a notice) is kept on the
  Roadmap as a pending proposal (`c.proposals`) — it changes nothing until the learner approves it (§11.3).
* **Each queued step is prepared once.** `noema_curriculum_task` hands a step out only after *claiming* it for that run —
  an atomic KV row `a:curclaim:<cid>:<nid>` (insert-if-absent; an expired one is taken over by a conditional update), so
  overlapping scheduled runs and two runs asking at the same moment always get different steps. The claim ends when the
  step is saved (`noema_finish_upload`) or after 4 h (a run that died). A step whose upload the network blocked keeps
  its claim while the run goes on to the next step: `noema_start_upload` marks the claim `waiting`, which lasts 72 h
  (renewed by every `noema_start_upload` for it; 👥 the shared reservation too), so a long run never builds it twice; its upload is retried with the others at the end of the run
  (docs/PIPELINES.md §1b). A queued step whose subject (`a:packmeta:<packId>`)
  was saved *after* it was queued counts as prepared — even when an older copy of the curriculum from another device put
  it back in the queue; the app then heals it back to ⚡ itself. `peek = true` says what is next without claiming it;
  `step` + `force = true` takes over a claimed step. Queueing an already-queued step changes nothing (it keeps its place).
  Claim rows are never mirrored into the device's KV.
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

## 8. 👥 Shared curricula — together, each with their own progress (`engine/curshare.js`)

The owner shares a curriculum (🧭 Curricula → **👥** on its card, or 👥 in the map's top bar; needs a ☁️ cloud account):
**🌍 public** (anyone finds it in 🧭 Curricula → **🌍 Explore curricula** and joins) or **👥 with people** (by the e-mail they
sign in with — they get it in 🔔 / the banner and in 🧭 Curricula, **✓ Join** or **No thanks**). The owner can add the steps
prepared so far and the curriculum's material files go with the map.

| | who | what |
|---|---|---|
| **the map** (steps, links, chapter plans, the files) | the owner | members cannot edit it. When the owner changes it, each member gets a **🔔** (and *🔔 N changes · Review* on the map) and **takes what they want**: a list of the changes, each with a tick box. Nothing changes in their copy until they take it; what they leave is not offered again unless it changes again |
| **progress** (read, solved, mastered, placement tests) | everybody | in their **own** account, as for any curriculum — nobody sees anybody's progress |
| **prepared steps** | **any participant** (owner or a member who joined) | prepares a step **nobody has prepared yet**, with their own AI (API key, Gemini or their Claude app). Everybody sees it (⚡👤 *prepared by …*) and gets it into their own account when they study it (the next prepared ones are fetched ahead). A **new version** by its author waits for each person who has the step: 🔔 *⬇️ Get it* or *Keep mine* (asked again only for a later version) |
| **overwriting** | nobody | a prepared step is **never overwritten by someone else** — not by the owner, not by a member. Only its author may publish a new version of it; the owner may *remove* it (moderation: 🗑 *X's version*) and then it can be prepared again |

**First come, first served — and nobody prepares a step twice.** Before a step is prepared it is **reserved** for its preparer
(a row with `status = preparing` and a 4-hour lease, renewed while an in-app build runs): in the app when the build starts, in
the Claude app when `noema_curriculum_task` hands the step out. The others see *⏳ X is preparing this step* (no ⚡ Prepare
button; their Claude app is told so and skips it). When the step is saved it is published (`ready`) and everybody's map shows
⚡. A reservation that ran out (a run that died) may be taken over by anyone. If someone ends up with a version of a step
somebody else published first (made by hand / imported), it stays **their own copy** and the shared one stays the first.

**The database enforces it** (`cloud/supabase.sql` §10, tested on PostgreSQL by `tests/sql_policies.py`), not only the app:
the step's primary key `(curriculum, node_id)` makes it first come, first served; only the author may update a row (or take
over an expired reservation); the step files live in `noema-curricula/<cid>/steps/<author>/…`, writable only by that author.

| data | where | who can read · write |
|---|---|---|
| the shared map (`record` = the curriculum without anybody's settings, progress or preparation state) | `noema_curricula_shared` | public: everybody · else owner, members, invited people · **owner** writes |
| invitations and members | `noema_curriculum_members` | owner + each person their own row · owner invites / removes; a person joins, says no, leaves |
| prepared / reserved steps | `noema_curriculum_steps` | everybody who sees the curriculum · participants insert an **empty** one; only its **author** changes it |
| step subjects + their source files | bucket `noema-curricula/<cid>/steps/<author>/<step>.json` (+ `<step>/src-…`) | participants · its author |
| the curriculum's material | `noema-curricula/<cid>/files/…` | participants · the owner |

**Locally** a shared curriculum is an ordinary curriculum record with the **same id** for everybody (so a step's subject has
the same id everywhere: `cur-<id>-<step>-<hash>`), plus `c.shared` (role `owner` / `member`, owner's name, public, version,
the files) and `c.remote` (who prepared / is preparing which step). Members start with *prepare ahead* = 0 (nothing is
prepared on their account by itself) and no review step (the plans are the owner's); they choose their own AI in ⚙️. A member
who **leaves** loses the map from their curricula; the steps they studied stay their subjects, with their progress. When the
owner **stops sharing**, the shared steps and files are removed; everybody keeps their copy (*no longer shared with you*).

**🔔 Taking the owner's changes** (`Core.changes` / `Core.take`, `Share.incoming` / `Share.takeChanges`): when the shared map has a
new version, the member's copy stays as it is and `c.shared.incoming` says how many changes wait. The review lists them one by
one — the curriculum's name or description, a step added / removed / renamed / re-described, a step's new chapter plan, its
material, the links between steps — and takes the ticked ones into the copy (*Keep my copy* takes none). What was left is
remembered with its signature (`c.shared.declined`) and is offered again only when it changes again. A step the member
studies from **their own subject** (§9) is listed too when the group's plan of it changes, **unticked**: taking it brings the
group's version of the step back (their subject goes to the Shelf, the shared prepared step can be studied again); leaving
it keeps their step, and the group's new plan is kept aside for the day they take their subject off.

**The Claude app** (§7) follows the same rules through the connector: `noema_curricula` shows *👥 shared by …*, the queue skips
steps others have (prepared or reserved), a step handed out is reserved in the shared curriculum too, `noema_finish_upload`
publishes it at once (*👥 Shared: every member … sees this step*) and its source files follow from the learner's app; a member
gets signed links to the owner's material files. Members are never given map tasks, nor plan tasks except for the steps
their own subjects teach (§9).

## 9. 📦 Subjects you already have, on steps · 📚 the Shelf
A subject you already have — your own, imported, made with Claude, shared with you, from 🌍 Explore or the library — can
**teach a step** of one of your curricula. That step is then studied from that subject: it is **never generated** and no agent
touches it (not the background preparer, not the Claude app's queue). Only **that step is re-planned**: its chapters and
learning goals are redesigned to describe the subject (the planner gets the subject's outline — its chapters, their sections,
how many exercises — and follows its chapters in order; what the step's role needs and the subject lacks is listed as
*Not in the pack: …*). Until its new plan is here the step is **closed** (🔄 on the map, no 📖 Study). The **subject never
changes**: the plan adapts to it. The steps after it keep their plans; their panel says *⚑ … is now taught by your own
subject — check that this step still fits*.
* **Where:** on any step — **📦 Use a subject I have** (the warning says exactly what happens) · while creating a map —
  *Use subjects you already have* (➕ New curriculum and 📥 Import a map): the map is built, then it waits (📦 *Attach subjects*,
  with ✨ *Suggest matches* by title) before its steps are planned (▶ *Plan the steps now*) · from the Shelf —
  **🧭 Put on a map…** (choose the curriculum; the matching step is suggested) · by Claude — `noema_save_pack` /
  `noema_finish_upload` with `curriculum_id` + `step` (the connector writes `{kind: 'assign'}` to the inbox; the app applies it).
* **By reference:** the subject keeps its id, so its progress, notes and conversations stay — progress in it **is** the step's
  progress (mastery: every section read + 80 % solved). One subject may teach several steps (the same progress everywhere).
* **Replacing:** a subject that was prepared for the step goes to the Shelf (nothing is deleted). **↩ Take it off this step**:
  the subject stays (on the Shelf when no step uses it); the step is planned and prepared the usual way again.
* **Re-planning:** with an API key / Gemini right away (or **↻ Re-plan now**); with the Claude app, the step's plan task waits
  in the 💬 bar like any other (it carries the subject's outline). Its plan stays editable (✏️ Edit step) because the
  subject is never rebuilt.
* **Sync:** the attachment travels with the curriculum (`n.pack = { id, status: 'ready', assigned: { from, at }, title,
  description, sections, exercises, outline }`, `n.assignedAt`); `mergePlans` keeps the newer attachment, so an older copy
  on another device never drops it.
* **In a shared curriculum (§8)** it is **the learner's own**, owner or member: only their copy of the step changes. The
  step's new plan is theirs; the group's plan of it is kept aside (`n.groupPlan`) and is what the owner's shared map keeps
  (`Core.strip` publishes it, never the owner's own plan or subject); the subject is never shared with the group (the step
  is not contributed). Owner updates never overwrite it: a change to the group's plan of that step is offered in the 🔔
  review, unticked. **↩ Take it off this step** gives the step the group's (newest) plan and prepared step back, with
  nothing to re-plan. A member's Claude app plans such a step like the owner's would.
* **A new version of the subject** (an update from 🌍 Explore, a share accepted again, a new import): every step it teaches
  takes the new outline and is re-planned — only those steps (`Edit.refreshAssigned`).
* Language courses are studied on their own and are never attached to steps or shown on the Shelf
  (docs/SHELF_AND_LANGUAGES.md).

**📚 The Shelf** is every subject that teaches no step of any of your curricula. It is the folded section at the bottom of
the subject picker (open while you have no curriculum yet; it remembers per device whether you left it open), **📚 Shelf (N)**
in 🧭 Curricula, and **📚 Open the Shelf** in ⚙️ → Subjects (where every subject says *🧭 on N curriculum steps* or *📚 on the
Shelf*). Nothing was moved or deleted to make it: subjects that were not on a map simply appear there. A subject that just
arrived (imported, from Explore, shared with you, made by Claude without a step) lands on the Shelf, with a hint to put it
on a map.

## 10. 🌐 A Roadmap in several languages (`c.i18n`)
A Roadmap is written in one language (`c.language`), like a pack. Its own words are translated **together with its packs,
into the same languages** (English, Greek, Russian, German and French minus its own — docs/PIPELINES.md §4b):
```json
"i18n": { "el": { "title": "…", "goal": "…", "at": "<stamp>",
                  "nodes": { "<step id>": { "title": "…", "summary": "…", "learningGoals": ["…"], "domains": ["…"],
                                            "chapters": { "<chapter ref>": { "title": "…", "goals": ["…"], "coverage": ["…"] } } } } } }
```
A chapter may also be its title alone (`"<ref>": "…"`, as before); `goals` and `coverage` are one string per teaching goal /
coverage item of the planned chapter, in order. **Everything the step's panel shows is translated** — its title, summary,
"after this step you can" goals, domains, chapter titles, and what a tapped chapter shows (its teaching goals and coverage):
`i18nTodo` counts a chapter as done only with all three.
* **When.** Right after `noema_create_roadmap`: its title, goal and every step's title and summary (the reply lists them).
  When a step's pack is translated: that step's learning goals, domains and chapters (`noema_finish_upload` and
  `noema_save_translation` list what is still untranslated, as the JSON to send). The step's task (`stepText`) says so.
* **How it arrives.** `noema_save_roadmap_translation` checks the object (`checkI18n`: known step ids and chapter refs, one
  string per learning goal, domain, teaching goal and coverage item) and writes it **straight into the Roadmap** (`kvUpdate`:
  a PATCH conditioned on the row's `updated_at`, retried on a clash — so every device shows it at its next sync, whatever
  tab is open), and also an inbox entry `{ kind: 'i18n', locale, data }` (§7) that the app merges again harmlessly
  (`setI18n`, only the fields given). Between two copies the later translation of a locale wins
  (`mergePlans`, by `i18n.<locale>.at`).
* **What the learner sees.** `trLocale(c)` picks the locale along the UI locale's chain (never English for someone else),
  like a pack's translations (docs/i18n.md §10). The map, the list, the treasure map, the step panel, *Next up*, the
  frame's Roadmap cards and crumbs draw `shownTitle(c)` / `shownNode(c, id)` — copies for drawing; the stored record keeps
  its own words. A field that no longer fits (another number of learning goals, an unknown chapter ref) shows the own words.
* **🛡 Nothing in the inbox is lost.** The app deletes an inbox entry only once it applied it: a kind it does not know (a
  newer connector) stays (30 days), a translation it refuses (e.g. a step this copy does not have yet) stays a week; and a
  tab older than the website (`build.json`, written by `tools/build.py site`; `App.stale`) leaves the inbox alone and
  reloads the next time it comes to the front.
* **Edits.** Renaming a step or changing its summary, goals or chapters (✏️ `Edit.update`) and a new chapter plan
  (`applyPlans`) drop that step's translations of those fields (`dropI18n`); they are made again with the next translation.

## 11. 🪜 Levels (grade, semester, year, difficulty)
A Roadmap may say for whom each step is — only when its material says so (a school syllabus by grade, a university
course by semester); levels are never invented.
* **The ladder**: `c.levels = [{ id, kind, order, names, description? }]` — `kind` is `grade`, `semester`, `year`,
  `difficulty` or `custom` (one kind per ladder), `order` places a level on it (unique, like the ids), `names` per
  locale (`{"en": "Semester 3", "el": "3ο εξάμηνο"}`; the app shows the one of the UI locale, like a step's title).
* **A step's level**: `nodes[id].level` — one level id (`"s3"`) or a range `{ "from": "s3", "to": "s4" }`. Not to be
  confused with `nodes[id].levels`, the processing levels (Marzano & Kendall, §1) its goals ask for.
* **A step's pack** names its level(s) in `subject.levels` (the Roadmap's ids), and its chapters, sections, exercises
  and cards may name their own (tools/CONTENT_SPEC.md "Levels").
* **The rules** (`src/contracts/rules/levels.ts`, `roadmapLevels`): the ladder is well formed, every step's level is on
  it, and **a prerequisite never sits above the step that needs it** — for every link `from → to`, the first level of
  `from` is at most the first level of `to` (a step of semester 2 never needs one of semester 3). Steps without a level
  are not compared.
* **The format stays `noema.curriculum/v1`** (`src/contracts/schemas/noema.curriculum.v1.schema.json`): `levels` and
  `level` are optional fields that a Roadmap without levels never has, and every reader (the app, the connector, the
  shared copies of the other participants, §8) finds Roadmaps by that format string — a new version would hide every
  Roadmap from the readers that do not know it yet. The inbox entries of every kind (§7) and a step's claim are
  `noema.curriculum.v1#inboxEntry` and `#claim`; the agents' answers (§1) `noema.curriculum-agents.v1`.
* **Where the levels come from**: Claude proposes them with the map (`noema_create_roadmap`: `"levels"` and each step's
  `"level"`), a new part adds levels at the top of the ladder (`noema_extend_roadmap`: the next semester; a ladder of
  another kind is refused), and `noema_restructure_levels` re-arranges a Roadmap that has them — or gives it its first
  ladder (§11.3). Every one is checked by the rules above before anything is written.

### 11.1 Ready ladders (presets) and custom ones
`src/features/roadmaps/domain/levels.ts` `ladderFrom` takes a preset or a list:

| `"levels"` | the ladder | ids |
|---|---|---|
| `"grade"`, `"grade:5-9"` | school grades (1–12 by default; 1–13) | `g5` … `g9` |
| `"semester"`, `"semester:6"` | semesters (8 by default; up to 20) | `s1` … `s6` |
| `"year"`, `"year:4"` | years of study (4 by default; up to 20) | `y1` … `y4` |
| `"difficulty"` | three tiers | `introductory` · `intermediate` · `advanced` |
| `[{ "id", "kind"?, "names" \| "name", "order"? }, …]` | the course's own (kind `custom` unless named), lowest first | its ids |

A preset level is named in English in `names.en`; in another UI locale the app names it from its catalog
(`roadmap.levels.kind.*` with its number, `roadmap.levels.difficulty.*`) unless the level has its own name there. A custom
level shows its own names along the UI locale's fallback chain (the I18n port's `chain`), else any name it has.

### 11.2 Moving up a level
* **Where the learner is**: a level is **done** when every step whose range ends at it or below is mastered (§3); steps
  without a level never hold a level back. The learner starts at the lowest level; the **current level** is the one after
  the highest level reached; the top of the ladder reached shows *Every level reached*.
* **Moving up is automatic**: whenever the map is drawn, every level that is done is reached, one after the other, in order
  (several at once when steps were mastered by “I already know this”) — 🎉 *Level reached* in the 🔔 news.
* **The level test (optional)**: a Roadmap with `levelTest: true` (`noema_create_roadmap` `level_test`) asks for a final test
  of a level before moving up: the level bar shows *… is done: take the level test*. The questions come from the level's
  own prepared subjects — single-answer multiple choice and true/false exercises, taken in turn from each subject so every
  step is tested (12 questions; fewer than 8 available → *not enough questions yet*), no AI asked. 80 % passes (the step
  test's bar); a failed test can be taken again.
* **In the learning log**: each level reached is the event `roadmap.level.reached` (`{ roadmap, level, from, how: auto |
  test }`, id `lvl:<roadmap>:<level>`: recorded once, on every device); each test taken is `roadmap.level.tested`
  (`{ level, score, passed, attempt }`). The current level of a Roadmap is the fold of these events
  (`src/features/roadmaps/domain/events.ts` `foldLevels`), so it is the same on every device and never stored on the
  Roadmap record (a shared Roadmap's members each have their own).

### 11.3 A new arrangement by level (`noema_restructure_levels`)
Claude may propose to re-arrange a Roadmap by level: a new ladder, steps or single chapters moved to another level, a step
that spans levels **split** into one step per level, steps of one level **merged**, links between steps changed. The way:

1. **Plan** — `plan_json` `{ why, levels?, steps?, chapters?, split?, merge?, links?, unlink? }` (steps as `"@<step id>"`,
   chapters by their refs, from `noema_roadmap_map`), checked all at once (`planFrom` + `checkRestructure`): the result
   must keep every rule of §11 and stay acyclic, every chapter of a split step in exactly one part, merged steps all
   prepared or all not.
2. **Inbox** — the plan is an inbox entry `{ kind: 'restructure' }`; the app keeps it as the Roadmap's pending proposal
   (`c.proposals`, at most one pending: a newer plan replaces it; never shared with members) and shows 🪜 *Claude proposes
   a new arrangement of the levels* above the map.
3. **Approval** — *Review* lists every change in the learner's language (`changes`); **Apply it** or **Keep it as it is**.
   In a shared Roadmap only its owner decides (a member gets *only the owner…*); the owner's map then reaches the members
   as any change of the map does (§8).
4. **Applied** — `src/features/roadmaps/application/restructure.ts` `applyProposal`: everything is read and checked first,
   then written — new subjects first, then the changed ones, then the subjects joined into another are removed.

Nothing is lost:
* **Ids are kept**, so progress follows the material: a split's first part keeps the step's id and its subject's id, the
  other parts are new steps (and new subjects) with the chapters they take; a merge keeps the first step's id and subject.
  Chapters, sections, exercises and cards keep their ids (a chapter ref that clashes in a merge is renamed in the plan; pack
  chapter or exercise ids that clash refuse the merge). Links: into a split step → its first part, out of it → from its
  last part, the parts in a chain; links of merged steps move to the step they joined.
* **Translations and 文A bridges move with their chapters** (`splitBundle` / `mergeBundles`, `splitBridge` /
  `mergeBridges`), the Roadmap's own translations of a step with its chapters (`moveI18n`), the learner's progress state
  of a subject with its items (`splitState` / `mergeStates`; with the learning log's per-item events this follows by
  itself). Chapters, sections, exercises, cards, translated chapters and bridge parts are **counted before and after**: if
  the counts differ, nothing is written.
* **The learner's own subjects** (§9) never change: a step taught by one may change level, nothing else; in a shared
  Roadmap a prepared step is not split or merged (other members study it).
* The learning log gets `roadmap.restructured` (`{ proposal, moves: [{ item, from, to }] }`: every chapter that changed
  subject); a pack whose levels changed gets its new `subject.levels` and chapter levels.

### 11.3a On the screen (`src/features/roadmaps/ui/`)
* **The level bar** (`noema-roadmap-levels`, above the map): the ladder as badges, the current level and how many of its
  steps are mastered, *… is done: take the level test* when a test is due, 🪜 *Claude proposes …* with **Review** for a
  pending proposal (not for a member). Moving up happens when it is drawn; a level reached opens the short *A new level*
  moment (its badge rises; no motion with reduced motion).
* **The level test** (`noema-roadmap-level-test`) and **the review of a proposal** (`noema-roadmap-restructure`: every change
  in the learner's words, Apply it / Keep it as it is) are dialogs; `noema-roadmap-step-test` is a step's placement test.
* **Level bands on the map** (`layout.ts` `mapColumns`): a Roadmap with a ladder is drawn in bands, one per level, lowest
  first — each level's steps in columns of their own (on the treasure map: layers), a step without a level beside its latest
  prerequisite. Since a prerequisite never sits above the step that needs it (§11), every link still runs forwards. A
  Roadmap without a ladder keeps the three parts (prerequisites · the goal · applications).
* Every screen reads the Roadmap through one data port (`data.ts` `RoadmapsData`; today `src/composition/roadmaps-ui.ts`
  over the engine's globals). Unit tests: `src/features/roadmaps/ui/test/` (happy-dom); in a browser
  `tests/roadmap_levels.js` (the bar, the moment, both tests, approve and decline, 320 px, axe, the keyboard).

### 11.4 Work for one level (the learner's Claude)
`noema_curriculum_task` `level` (an id or a name) hands out only that level's chapter plans and steps; the task then says
what the level means (`levelBrief`): the difficulty of the exercises is **relative to the level** (difficulty 3 is the
hardest that is still that level's material, never a higher level's), the mix of 20 / 25 / 55 % holds within the level,
what the levels below already taught is built on, and the pack carries `"levels": ["<id>"]`. A step's task carries its
own level without asking. `noema_pipeline` `level` (+ `curriculum_id`) adds the same to the flow's steps;
`noema_roadmap_map` shows each step's level, chapters at another level in `[ ]`, the ladder and a pending proposal.

## 6. Tests
Unit tests (`npm run test:unit`): `src/features/roadmaps/domain/domain.test.ts` (graph, claims, the queue and a level filter,
the inbox — a part with levels, links, a proposal, the merged view —, translations, two copies, presets and ladders, the
rules and the way up, the level test's questions, a split and a merge with nothing lost, an attached subject),
`src/features/roadmaps/application/application.test.ts` (moving up once per level, the level test, an approved split
writing the new subject first and moving progress and translations, a failed check writing nothing),
`src/features/bridges/domain/lookup.test.ts`. `tests/connector.js` § Roadmaps by level: levels with the map, refused
levels, `noema_roadmap_map`, `noema_curriculum_task` / `noema_pipeline` `level`, `noema_restructure_levels` (refused plan,
proposal in the inbox, nothing changed, sent again, status), a part bringing a level.
`tests/curriculum.js` (scripted Claude + Gemini APIs, Supabase emulator): the four agents incl. a
repaired graph, 25-node map in three parts, locked/open, chapter details, background preparation of the
next 2 steps by Claude skill jobs (web search + fetch), cloud storage and sync, studying a step in the
engine, automatic mastery, placement test unlocking the next step and undo, phone layout, the Gemini path
(stop + resume without redoing agents, Google Search research, repaired chapter, 4-chapter subject with
drawn diagrams and listed sources). The same content checks (`src/features/content`) are also the connector's pack gate.
`tests/curriculum_app.js`: §7 end to end — the connector (run in-process as the learner's Claude) builds a curriculum's map
(a wrong answer sent back), plans it in batches, prepares a reviewed step; an imported map with a PDF (signed link, the same
file not uploaded twice); copy / paste, a step bundle and its package; re-plan with a wish; Set up Claude → C; phone.
`tests/curriculum_share.js`: §8 with three people and the connector — share with a person (her prepared step + her file
go with it), the invitation in the banner, join, a step fetched ahead and studied (own progress), a step reserved by a member's
Claude app (the owner cannot take it, ⏳ on her map) and published on saving, nobody overwrites anybody (app, connector, API,
files), public → 🌍 Explore curricula → join → prepare, the owner's renamed step offered in 🔔 and taken in the review,
removing a version, a member's own subject on a shared step (his plan, the group's aside, never shared, the group's new plan
offered unticked, what he left not offered again, taking it off), the owner's own subject on a step (the shared map keeps the
group's plan), a new version of a prepared step (keep mine / get it), leaving, stopping, phone. `tests/sql_policies.py` checks every rule of §8 on PostgreSQL.
`tests/shelf.js`: §9 — the picker (🧭 first, the Shelf folded once there is a map), attaching a subject to a step (the warning,
only that step re-planned from the subject's outline, closed meanwhile, the next step flagged not re-planned, progress shared,
studying it), taking it off, a prepared subject going to the Shelf, a new version of the subject re-planning its step, sync
of an attachment, the creation hold (Claude app and
API key, ✨ suggest matches), the connector (`curriculum_id` + `step` → the step; without → the Shelf; where each subject is),
🧭 Put on a map… from the Shelf, phone.
`tests/curriculum_import.js`: the parser (tree art, nesting + independent, Mermaid, ⇄, JSON, Greek outline, loops, file
matching), then in the browser: a pasted tree with two files → only the planner runs (with the files' pages, outline and
first lines) → a step with a PDF built by Claude from the uploaded file (no web_fetch, packaged back as its source) → a
step with notes built by Gemini from their text (no Google Search) → 📎 add / remove in the editor, fixed once prepared
→ ✨ AI reading with an invented topic sent back → a .zip with a folder per step → phone layout; branches and joins in
every format, the files section, paths / globs / folders, duplicate titles told apart by folders, a textbook for two steps
(stored once, pages per step, Gemini reads only those pages, the step's subject links to it), drag & drop onto a step.
