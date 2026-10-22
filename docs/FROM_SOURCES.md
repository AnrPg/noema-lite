# 📚 From your sources — one way from a pile of material to a Roadmap or to one subject

Decided with the user on 2026-10-20: one canonical workflow for "here is a bunch of sources, make me something to study".
The app reads the material, **proposes** the shape it calls for with its reasons, and the learner confirms or flips it.
Both shapes are first-class: **one subject** (a concise treatise, on the 📚 Shelf) is a full course exactly like a step
of a Roadmap; the Shelf itself stays as it is (docs/CURRICULUM.md §9).

**Where:** Discover › From your sources · Shelf ⋮ › From your sources · 🧭 Roadmaps (classic screens) › 📚 From your sources.
Code: `engine/sourceplan.js` (`NoemaSourcePlan`: the logic, runs without a browser) and `fromSources()` in `engine/curmap.js`
(the wizard). Words: `roadmap.map.src.*` (i18n/roadmaps-map), `roadmap.src.*` (i18n/roadmaps), `sh.fromSources*` (i18n/shell).

## 1. Your material
Files, a folder (sub-folders kept) or a `.zip` (unpacked with its folders). Optional: name, language, goal (exam /
understanding / project), notes. Every file is read **on this device** (`inventory`): a PDF's page count and outline
(bookmarks), the first lines of its first pages; other texts in parts of ~3000 characters; pictures and recordings by
name and size. Files are taken in the order of their paths, numbers counted as numbers (`2 …` before `10 …`).

## 2. Who reads it
| reader | how | what leaves the device |
|---|---|---|
| **AI with my key** (Claude or Gemini, default when a key exists) | `propose()`: one call with the schema `S_PLAN`, checked, sent back with its problems up to twice (`NoemaLLM.json`) | the outlines and first lines only |
| **My Claude app** (copy and paste; default without a key) | `task()` → paste into a Claude chat → paste the JSON answer back (`fromAnswer()`, the same checks; problems are copied back to Claude) | the same text, by the learner |
| **Without AI** | `estimate()`: sizes and outlines | nothing |

**The rule** (prompt and estimate alike): *one subject* when the material is one coherent topic that fits in up to
**18 chapters** (≈ 25 dense pages a chapter, so up to ≈ 300 pages); *a Roadmap* when it spans several topics that build
on each other or is more than one subject can hold. The estimate makes one chapter / step per file, or per top-level
outline entry of a big PDF (with its pages), or splits a long PDF without an outline by pages; it groups consecutive
units when there are too many.

**The checks of an answer** (`check()`): every file reference must be one of the learner's files (`NoemaCurImport.refMatches`),
pages inside the file, every file used somewhere in **both** shapes, unique step refs, known prerequisites, no cycle.

## 3. The proposal
Its reasons (2–4 lines), two cards — **One subject · N chapters** and **A Roadmap · N steps**, the recommended one marked
and chosen — the name (from the proposal unless the learner typed one), and the chapters or steps with their files and pages
(folded). Picking the other card flips at once: the AI always drafts both.

## 4. Build it — always through the route that already exists
* **A Roadmap** → `roadmapImport()` turns the steps into a 📥 Import map (JSON nodes with `files`), `NoemaCurImport.matchFiles`
  puts every file on its steps with their pages, and `NoemaCurImport.create` makes the Roadmap (docs/CURRICULUM.md §6b): each
  file stored once, the chapter planner plans every step **from its pages**, the learner reviews each step before it is
  prepared, with any AI (Claude app, Claude, Gemini). The curriculum remembers `fromSources: { at, via }`.
* **One subject** → ✨ Create with Claude opens **filled in** (the files, name, language, goal, notes) and the confirmed chapter
  plan is Claude's brief (`courseBrief()`: one chapter per planned chapter, each from the pages it names; `job.brief` in
  `engine/claude.js`); the subject lands on the Shelf. Without a Claude key: *Copy the message for Claude* (`courseMessage()`)
  and attach the files in a Claude chat with the noema-lite connector, which saves the subject (docs/CLAUDE_CONNECTOR.md).
  The skill knows the same rule and follows a confirmed plan as it is (skill/noema-pack-builder/SKILL.md §0b).

## 5. In Claude — the connector makes the Roadmap itself
When the learner gives the material to their own Claude (skill §0b), Claude decides the shape by the same rule. One subject:
it builds the pack as usual. A Roadmap: `noema_create_roadmap(plan_json, language, learner)` with `{ title, summary, steps:
[{ ref, title, summary, role, prerequisites, files }], files: [{ path, pages }] }`. `fromClaude()` checks it like the app's own
proposal (only the Roadmap shape: every listed file used, pages inside their file, unique refs, known prerequisites, no
cycle), `NoemaCurImport.record()` builds the curriculum (provider `claudeapp`, `fromSources.via = 'connector'`) and the
connector stores it as `a:curriculum:<id>`; the app takes it on its next sync. Unless `prepare: false`, every step is
queued for the Claude app in study order (reviewed), so `noema_curriculum_task` hands out the chapter plans, then each step. The files stay in that Claude chat: each step
keeps `chatFiles` (`"file pp. a–b"`), and the chapter-plan and step tasks of `noema_curriculum_task` list them as THE sources
("in the Claude chat where this Roadmap was made"). `sourceplan.js` and `curimport.js` are bundled into the connector
(`tools/build.py` → `MCP_ENGINE`).

## 6. Grow a Roadmap in parts — new material for a Roadmap that exists
A course is rarely known ahead: the learner brings the next lectures week by week, and the Roadmap grows with them. New
material for a Roadmap that exists is a **new part** of it, never a second Roadmap (pipeline flow 9, skill §0c):

1. **`noema_roadmap_map(curriculum_id)`** — the map as it will be (record + inbox): every step in study order with its
   **`@id`**, state (prepared, queued, planned, needs a plan), prerequisites, chapters, and the parts so far.
2. **`noema_extend_roadmap(curriculum_id, plan_json, independent?, prepare?)`** with only the new steps:
   `{ part, summary, steps: [{ ref, title, summary, role, prerequisites, before, files }], files: [{ path, pages }] }`.
   **The one canonical connection point is a step's id, written `"@<id>"`.** Step ids are made once from the title and
   never change (renaming a step keeps its id), so a part added months later still finds the step it builds on.
   * `prerequisites`: refs of the part's own steps (`n1`) or `"@id"` of steps on the map — what a new step builds on.
   * `before: ["@id"]` — a step on the map that must come after the new one; only a step that is not prepared yet
     (the learner may be studying a prepared one, and a new prerequisite would lock it).
   * A new step whose title is already on the map is refused (link to it instead); every part is joined to the map unless
     `independent: true`; the whole graph must stay acyclic; the part's files are checked as in §5.
3. `NoemaSourcePlan.extendFromClaude` turns it into an inbox entry `{ kind: 'extend', part, nodes, edges, prepare }`
   (`a:curin:<cid>:<seq>` — the connector never writes the record). New ids avoid every id on the map; each new step keeps
   `addedIn` (its part) and `chatFiles` (its files in that chat: the plan and step tasks say “in the Claude chat where the
   part … was added”). `NoemaCurJobs.extend` applies it — in the app (`App.poll`, then 🌱 a toast) and in the connector's
   view (`merged`): the steps, the links, `c.parts` (the first part is the map as it was), the study order, and, unless
   `prepare: false`, the new steps queued in study order. A finished Roadmap goes back to `stage: 'plan'`; nothing already
   planned or prepared changes. An entry is applied once (`c.parts` holds its id); one this copy cannot apply yet (a step it
   links to has not synced) waits up to a week.
4. In the app, the map's ⋮ → **Add a part with Claude** copies the message for a Claude chat (`NoemaCurJobs.growMessage`);
   the learner pastes it with the new files. Nothing else on the map changes: the new steps simply appear on it.

## Tests
`tests/from_sources.js`: the estimate, the checks, a pasted answer, the import and the brief without a browser; then in the
browser (Supabase emulator, scripted Claude) the wizard from 🧭 Roadmaps, a wrong AI answer sent back, both shapes, a Roadmap
made from it (only the chapter planner runs; files and pages on their steps), one subject through Create with Claude (on the
Shelf; the plan is the brief), the Claude app by copy and paste, and the connector's `noema_create_roadmap` (a wrong Roadmap
sent back, a good one stored, its chapter-plan task naming the chat's files, the app picking it up on sync), then a new part
(`noema_roadmap_map`, a part with an unknown `@id` / a duplicate step / no join sent back, a good one in the inbox and in the
connector's view, its plan task naming the part's chat, the app adding it on sync).
