# Conversations with the AI — canonical schema `noema.conversation/v1`

Every interaction with the language model is stored as **one conversation record**:
tutor chats in all modes *and* one-shot AI tasks (grading an explanation, reviewing code,
generating a question, grading a debug checklist). Records are saved **automatically, in the
background**, the moment a message arrives — the ⬇️ buttons only make extra Markdown copies.

## Record
```jsonc
{
  "schema": "noema.conversation/v1",
  "id": "cv_0mfx3k2a1b9q2kq",            // "cv_" + 10-char base36 epoch-ms + 6 random → globally unique AND sorts chronologically
  "account": { "id": "anr", "kind": "local" },          // or { "id": "u_<uuid>", "kind": "cloud" }
  "subject": { "id": "databricks", "title": "Databricks", "packVersion": "f419aea82e952106" },
  "kind": "tutor",                       // tutor | grading | code-review | question | drill-grading
  "mode": "socratic",                    // tutor only: socratic | explain | quiz | interview | debug  (null for other kinds)
  "title": "Delta Deletion Vectors: Merge-on-Read",
  "titleSource": "ai",                   // ai | user | system | none
  "context": {                           // what the conversation is about
    "type": "section",                   // course | chapter | section | playbook | exercise
    "id": "ch05-s04", "label": "Ch5 · Deletion Vectors",
    "chapterId": "ch05", "sectionId": "ch05-s04",         // when derivable
    "origin": { "via": "explainThis", "bid": "b1x9…", "sec": "ch05-s04" }  // where it began (docs/SEARCH.md §5)
  },
  "model": { "provider": "google", "name": "gemini-3-flash-preview" },
  "createdAt": "2026-10-06T14:42:10.120Z",              // ISO-8601 UTC
  "updatedAt": "2026-10-06T14:49:55.004Z",
  "deleted": false,                      // tombstone: true + messages [] (so deletions propagate everywhere)
  "stats": { "messages": 6, "userMessages": 3, "chars": 2210 },
  "messages": [
    { "seq": 0, "id": "m_0mfx3k2a1bx7k2", "role": "user",      "content": "markdown", "createdAt": "…" },
    { "seq": 1, "id": "m_0mfx3k2c9cq1zz", "role": "assistant", "content": "markdown", "createdAt": "…" }
  ],
  "tutorState": {                        // Socratic mode only — the elicitation-thread tracker (see docs/TUTORING.md)
    "v": 1, "focus": "t2", "learnerTurns": 5, "missingControl": 0, "wrapped": false,
    "threads": [ { "id": "t1", "question": "Why is a DV cheaper than a rewrite?", "parent": null, "status": "resolved",
                   "attempts": 2, "budget": 3, "openedAt": 1, "resolvedAt": 5, "how": "answered",
                   "answer": "…authoritative answer…", "lesson": "…one-sentence lesson…" } ],
    "lessons": [ { "text": "…", "thread": "t1", "question": "…", "at": 5 } ]
  },
  "meta": { "titledAtMessage": 4 }       // optional, implementation details
}
```
Assistant messages of Socratic chats carry `meta.noemaState` — the parsed control line the model emitted
(`opened`, `resolved`, `focus`, `verdict`, `summary`); `tutorState` can always be rebuilt from these.
User messages may carry `meta.directive` (`tellme` | `wrapup`).
Roles are `user` / `assistant`. Content is Markdown (math as `$…$`). Older shapes are converted by `normalize()` in `engine/convos.js`.

## Branches (edited messages, other answers)
A tutor chat is a tree, like the big chat apps. ✎ under one of the learner's messages edits it in place: the old message and
everything after it become a **branch**, the new message is answered. ↻ under an answer asks for another answer (the old one
becomes a branch). ‹ 2/3 › under a message switches between its versions, with the conversation that followed each one.
Nothing is ever deleted.

* `messages` is always the **active path**: what the learner sees, first to last. Every reader that does not know about branches
  (the export, the search, the SQLite copy, an older version of the app, Meletee) reads the conversation the learner sees.
  Other features read a conversation only through `activePath(record)` / `pathAttachments(record)`
  (`src/features/tutor/domain/branches.ts`).
* `branches` (optional) holds every other turn, each with `parent`: the id of the turn before it (`null` at the start). The
  parent of a path message is the message before it.
* The AI is sent the active path only. The Socratic tracker (`tutorState`) is worked out again from the path's own turns
  (`replayThreadState`) when the learner edits or switches, so it never shows another branch's lessons.
* Merging (`engine/convos.js mergeNodes`, run by every `put`): turns only grow, so two copies of one conversation merge by
  the union of their turns. The newer copy's path wins; a turn only the other copy has is kept as a branch (a turn written by
  an older version without an id is matched by speaker, time and words). When a pulled copy gains turns this way, the
  union is saved with a new `updatedAt`, so it goes back to the cloud and the other devices.
* Editing or asking again while an answer is being written stops it (its request is aborted and its answer, if it still
  comes, is dropped). ■ Stop keeps what came so far as the answer (`meta.stopped: true`); ↻ asks again.

```jsonc
"messages": [ { "id": "m_…a", "role": "user", "content": "q1" }, { "id": "m_…b", "role": "assistant", "content": "r1" },
              { "id": "m_…e", "role": "user", "content": "q2, edited" }, { "id": "m_…f", "role": "assistant", "content": "r2'" } ],
"branches": [ { "id": "m_…c", "parent": "m_…b", "role": "user", "content": "q2" },
              { "id": "m_…d", "parent": "m_…c", "role": "assistant", "content": "r2" } ]
```

## Attachments
📎 next to the box (or a paste, or a drop) adds files to a message: pictures (PNG, JPEG, WebP, GIF; a big one is made ≤ 1568 px
first), PDFs, text files (notes, code, CSV) and — with Gemini — sound and video. At most 6 files of 12 MB each per message.
A message keeps only references:

```jsonc
"attachments": [ { "id": "<sha-256 hex, 40>", "name": "circuit.png", "mediaType": "image/png", "size": 48211, "kind": "image" } ]
```

`kind` is `image | pdf | audio | video | text`. The bytes stay on the device, per account (IndexedDB `noema-attachments`, store
`files`, key `<account>|<id>`: the AttachmentStore port, `src/ports/attachments.ts`), so a record stays small enough to sync;
the same file is kept once. Every file goes to the AI with its message on every later turn of the branch (typed parts of the
AI port: `image`, `document`, `media`; a text file as text), the newest first within a budget per request (Gemini 14 MB,
Claude 22 MB); a file left out, one this device does not have (added on another one) or one the AI cannot read (Claude: sound,
video) is sent as a short note instead. Without an AI key only text files can be added.

## Where records live (same record everywhere)
| Place | Location | When |
|---|---|---|
| Browser (primary) | IndexedDB `noema-lite` → store `convos`, key `<account>|<id>` | immediately |
| Backup folder (optional, Chrome/Edge) | `<chosen folder>/conversations/<subject>/<YYYY-MM>/<id>.json` + `<id>.md`, plus `conversations/index.json` | ~20 s after a change |
| Cloud (cloud accounts) | Supabase table `noema_conversations` (one row per record, `record` = full JSON, row-level security) | ~3 s after a change |
| Backup files & cloud snapshots | `conversations: [ …records… ]` in `noema-lite-backup` v2 | on backup |
| SQLite database | tables `conversations` + `messages` (`tools/db_sync.py`) | on sync |

Recovery: any one of these places is enough to restore every conversation with its title, context,
timestamps and order. Restoring a backup re-inserts the records unchanged (ids are stable, so
restoring twice never duplicates).
