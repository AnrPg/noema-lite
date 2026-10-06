# Conversations with the AI — canonical schema `lq.conversation/v1`

Every interaction with the language model is stored as **one conversation record**:
tutor chats in all modes *and* one-shot AI tasks (grading an explanation, reviewing code,
generating a question, grading a debug checklist). Records are saved **automatically, in the
background**, the moment a message arrives — the ⬇️ buttons only make extra Markdown copies.

## Record
```jsonc
{
  "schema": "lq.conversation/v1",
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
    "chapterId": "ch05", "sectionId": "ch05-s04"          // when derivable
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
Assistant messages of Socratic chats carry `meta.lqState` — the parsed control line the model emitted
(`opened`, `resolved`, `focus`, `verdict`, `summary`); `tutorState` can always be rebuilt from these.
User messages may carry `meta.directive` (`tellme` | `wrapup`).
Roles are `user` / `assistant`. Content is Markdown (math as `$…$`). Older shapes are converted by `normalize()` in `engine/convos.js`.

## Where records live (same record everywhere)
| Place | Location | When |
|---|---|---|
| Browser (primary) | IndexedDB `learning-quest` → store `convos`, key `<account>|<id>` | immediately |
| Backup folder (optional, Chrome/Edge) | `<chosen folder>/conversations/<subject>/<YYYY-MM>/<id>.json` + `<id>.md`, plus `conversations/index.json` | ~20 s after a change |
| Cloud (cloud accounts) | Supabase table `lq_conversations` (one row per record, `record` = full JSON, row-level security) | ~3 s after a change |
| Backup files & cloud snapshots | `conversations: [ …records… ]` in `learning-quest-backup` v2 | on backup |
| SQLite database | tables `conversations` + `messages` (`tools/db_sync.py`) | on sync |

Recovery: any one of these places is enough to restore every conversation with its title, context,
timestamps and order. Restoring a backup re-inserts the records unchanged (ids are stable, so
restoring twice never duplicates).
