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

## 6. Tests
`tests/curriculum.js` (scripted Claude + Gemini APIs, Supabase emulator): the four agents incl. a
repaired graph, 25-node map in three parts, locked/open, chapter details, background preparation of the
next 2 steps by Claude skill jobs (web search + fetch), cloud storage and sync, studying a step in the
engine, automatic mastery, placement test unlocking the next step and undo, phone layout, the Gemini path
(stop + resume without redoing agents, Google Search research, repaired chapter, 4-chapter subject with
drawn diagrams and listed sources). `engine/packcheck.js` is also the connector's pack gate.
