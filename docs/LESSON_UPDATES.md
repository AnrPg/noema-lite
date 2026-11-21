# 💬→📖 Lesson updates from a chat with the tutor

Status: **built 2026-11-21**. A learner who worked something out with the tutor (the mascot) can send that conversation to
Claude, which extracts what is worth adding to the lesson and proposes an **additive** update to the lessons (chapters) of one of
the learner's own subjects: each piece in the lesson whose topic it is. Nothing changes in the lesson until the learner has seen the changes and approved them, and the
app runs every check of a pack again just before it saves.

| Part | Where |
|---|---|
| The format, the apply, the gate (checks, auto-placement, choices), a proposal of several lessons, the diff, the brief for Claude | `src/features/lesson-updates/domain/` (pure; `proposal.ts` for the parts) |
| The use cases (send, message, open, paste, preview, approve, decline, undo) over ports | `src/features/lesson-updates/application/service.ts` |
| The two windows (send, review) | `src/features/lesson-updates/ui/` |
| The page wiring, `NoemaShell.lessonUpdates` | `src/composition/lesson-updates.ts` (build/ui.js) |
| Claude's side | connector tools `noema_lesson_update_task`, `noema_lesson_update_submit` (`src/connector/tools/lesson_update_*.ts`, `src/connector/services/lessons.ts`) |
| Words | `i18n/lessonup/` (en + drafts el, ru, de, fr) |

## 1. The flow

1. **Send.** The tutor's ⋮ menu (*Use this chat in a lesson*) or the button under an open conversation in Me ›
   Conversations opens the send window: the lesson (the chapter the chat is about, by default; any chapter of any subject
   the learner owns), an optional note for Claude, and how many attached files go with it. *Send* records a **request**.
2. **Ask Claude.** With a cloud account the message to copy is one line: Claude calls `noema_lesson_update_task` with the
   request id (the connector reads the request, the chat, the lesson, its translations and bridges) and answers with
   `noema_lesson_update_submit`. With a local profile the message is the whole brief (the chat, the chapter, the format)
   and the learner pastes Claude's JSON back into the review window.
3. **Review.** A proposal arrives as a 🔔 row (*Claude's changes to “…” are ready for you*, also said once as news) and
   opens the review window: Claude's summary, what the checks moved, the choices, each changed chapter before and after
   (under its title when there are several) in the language the learner reads (added blocks green, replaced ones struck through, unchanged runs folded), then
   **Approve** / **Decline**.
4. **Apply.** Approve checks the lesson **as it is now** (the gate below), keeps a copy of the lesson as it was (this
   device and the account), then saves the new version: the pack with its translations (`Noema.importPack`: their own
   files, the cloud, the Roadmap steps that teach the subject follow it) and each 文A bridge that grew
   (`NoemaCore.bridges.attach`). **Undo** puts the copy back, unless the lesson changed again since.

## 2. The request and its files

| What | Where | Writer |
|---|---|---|
| The request `a:lessonreq:<id>` (subject, chapter, conversation, note, locale, files, state `open → applied / declined / undone`, picks, version) | synced key/value row | the app only |
| The proposal's card `a:lessonup:<id>` (summary, counts, rev) | synced key/value row | the connector only |
| The chat as Markdown (the active path: the turns the learner saw, newest kept past 120 000 characters) | `updates/<id>/chat.json` in the account's folder (a local profile: this device) | the app |
| The chat's attachments (at most 12, each ≤ 20 MB) | `updates/<id>/files/<file id>` | the app |
| The proposal (`noema-lesson-update` v1) | `updates/<id>/proposal.json` | the connector |
| The lesson before the update | `updates/<id>/before.json` + IndexedDB `noema-lessonupdates` | the app |

One writer per key (docs/SYNC.md): the connector never rewrites a request, the app never writes a card. Ids are
`lu<time base 36>-<random>` (they sort by time and are safe path segments).

## 3. The update (`noema-lesson-update` v1)

The chapter the learner picked when sending is a hint, not a limit: what the chat says about a topic another chapter of
the subject teaches goes into **that** chapter, so an answer carries one **part** per chapter that gets something:

```json
{ "format": "noema-lesson-update", "v": 1, "request": "lu…", "pack": "<subject id>", "summary": "…",
  "parts": [ <a part, as below, without format/pack/request/summary>, … ] }
```

The parts are prepared, checked and applied **in the order of the chapters**, each on the lesson as the parts before it
left it (`domain/proposal.ts`: `prepareProposal`, `verifyProposal`, `applyProposal`). One part per chapter; choice ids
unique across the parts; a part's problems come back tagged `[part chNN]`. Q0 holds across the subject: a part may use
what an earlier chapter teaches, never what a later one does. An answer of one chapter (the shape below with `chapter` and
`ops` at the top) is a proposal of one part. The brief gives Claude the picked chapter in full and the other chapters in
full too while the whole stays under 240 000 characters, else as an outline (sections, focus, concepts, next free ids;
with the connector, `noema_get_pack_url` gives the full pack). One part:

```json
{ "chapter": "ch03", "base": "<hash of the chapter Claude read>",
  "ops": [ { "op": "section", "after": "ch03-s02", "section": { … }, "i18n": { "el": { … } }, "why": "…" },
           { "op": "blocks", "section": "ch03-s04", "at": 2, "blocks": [ … ], "i18n": { … } },
           { "op": "exercises", "items": [ … ], "i18n": { … } },
           { "op": "flashcards" | "pitfalls", … },
           { "op": "map", "concepts": [ … ], "learnables": [ … ], "points": [ … ], "known": [ … ] } ],
  "choices": [ { "id": "c1", "kind": "full" | "duplicate" | "other", "question": "…", "why": "…",
                 "options": [ { "id": "new", "label": "…", "ops": [ … ] }, … ], "recommended": "new" } ],
  "bridges": { "<pair>": [ { "k": "…", … } ] } }
```

Every op only **adds**. The one change that is not an addition, `replace` (block `at` of a section), exists only as an
option of a choice. Every text comes in the pack's language and in each language the pack is translated into (the same
structure, only the words differ), so the translations stay whole. New exercises carry `lr`, `think` and
`cite: {src: "chat:<request id>"}` like any other (CONTENT_SPEC Q1–Q9).

## 4. The gate: what is fixed silently, what is moved, what the learner chooses

The same pure code runs in the connector (on submit) and in the app (on paste, on preview, on approve):
`prepare(checks, lesson, raw)` and `verify(checks, lesson, update, picks)` in `domain/evaluate.ts`, over the engine's
content checks (`checkPack` with the quality rules, `checkTranslation`, `checkBridge`).

* **Nothing new may fail.** The checks run on the lesson before and after; an update may not bring any error the lesson
  did not have (Q0 gradual introduction, one focus per section with at most 3 new concepts, Q1–Q9 including the variety
  of exercise types and engines, recall ≤ 25 %, translations into every language of the pack, bridges). A lesson that was
  already short of a rule is not made worse.
* **Fixed silently:** the shape (ids made free, one op per item so each can be placed alone), bridge entries merged
  (a word the bridge has is not added twice).
* **Moved, shown in the review:** an addition that uses a term too early is placed after the section that teaches it
  (the earliest later section that gives fewer errors and none new): "Moved from “…” to “…”".
* **The learner chooses** (cards with the recommended option marked; it applies when the learner does not choose):
  a section already full (a new section, or replace the weaker text) and an addition that repeats the lesson (≥ 50 % of
  its words: skip, merge, or keep as a second explanation). An option that would fail the checks is refused at submit.
* **The lesson changed** since Claude read it (the hash of any chapter a part changes): the proposal is refused, the
  learner asks Claude again. Undo puts back the whole subject as it was before the approve (every chapter the proposal
  changed), unless the subject has a newer version since.

Errors are English diagnostics for Claude; the learner sees one sentence and can copy the details to paste back.

## 5. The windows

Kit dialogs (`noema-dialog`) over the page, drawn in their light DOM with one adopted stylesheet (`ui/styles.ts`, every
rule under `.lu`, logical properties, nothing wider than 320 px). The 🔔 row is kind `lessonupdate` of the bell
(`engine/app/community.js` Notes, `src/features/sharing/ui/notes.ts`): *Review* opens the review window, ✕ declines.

## 6. Limits

* Only the learner's own subjects (imported, made with Claude) change; a library subject's chat can still go to one of
  the learner's own lessons.
* A file attached in the tutor travels only from the device that has it (and only for a cloud account); elsewhere Claude
  sees its name.
* Undo needs the copy of the lesson before (this device, or the account for a cloud account).
