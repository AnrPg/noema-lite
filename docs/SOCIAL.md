# 👥 People — study buddies, conversations and study groups

Decided with the user on 2026-10-20 (thread "Sources workflow, vault, social, study buddies"): find people, become study
buddies, talk one to one with files, subjects and Roadmaps, and keep study groups. Code: `engine/social.js` (pages `#/people`,
`#/chat/<room>`, `#/group/<room>`, `#/join/<code>`; the top bar's 💬 and Discover › People), `cloud/supabase.sql` §12, words
`i18n/social/`. Tests: `tests/social.js` (three people in the browser, against `tests/mock_social.js`) and `tests/sql_policies.py`.

## 1. The choices
* **Readable by the server, not end-to-end.** Row-level security keeps every message to the people of its conversation, and
  reports can be checked. End-to-end would need keys on every device and rule out moderation and search.
* **Who may message or invite me** is each person's setting: *Buddies* (the default), *Everyone* or *Nobody*. Anyone may
  always answer a conversation they did not start (the other person wrote first). A block, either way, stops everything.
* **Findable by name** (on by default, off in Privacy). People who are not findable are still seen by their buddies and the
  people of their groups.
* **Study groups** are the only groups: a chat, their own folder of the vault (docs/VAULT.md §6) and the Roadmaps shared in
  them. Roles: owner, admins, members. At most 200 people.
* **Supabase Free plan**: files sent in conversations use the vault's formats (and a subject's pack, `.json`), ≤ 20 MB a file,
  and count towards the person's 50 MB **together with the vault**.

## 2. Finding people
Each signed-in person has a row in `noema_people`: the name of their account, their emoji, `search` (the name folded, also
in plain and scholarly Latin letters, written by the app with `NoemaVault.forms`) and the two settings. The search on
`#/people` matches any word of it, so `nikos` and `papadakis` find *Νίκος Παπαδάκης* (the app-wide transliteration rule).
The first time, a note says others can now find you and links Privacy.

## 3. Study buddies
`noema_buddies` holds one row per pair (`a < b`): a request (`pending`, `asked_by`) or `buddies`. `noema_buddy_ask()` asks,
or accepts when the other person asked first; `noema_buddy_answer()` accepts or declines. Either may end it (a delete). At
most 50 open requests a person. The People button counts requests, invitations and unread messages (muted conversations
aside).

## 4. Conversations
`noema_dm_open()` returns the one room of a pair, made the first time when the other person's setting allows it. Messages
(`noema_messages`, ≤ 4000 characters, ≤ 30 a minute) carry at most one attachment:

| kind | what | the receiver can |
|---|---|---|
| `file` | a document, picture, recording… (`noema_chat_files`, bucket `noema-chat/rooms/<room>/<id>.<ext>`) | Show, Download, Make a course of it |
| `subject` | one of my subjects, its pack as a `.json` file of the room | Add to my subjects (a copy; an id already there gets a suffix) |
| `roadmap` | one of my Roadmaps, published privately and listed in `noema_room_roadmaps` | Join it with their own progress |
| `vault` | a file of the vault (a group's own only in that group) | Open its page in the vault |

A file is `pending` until `noema_chat_finish()` has found it in storage with the size announced, and only then can a
message carry it. The guard trigger keeps the author, times and counters the server's; editing changes only the text;
deleting clears the text and the attachment ("Message deleted"). An open conversation reads new messages every 4 s; the
lists refresh every 45 s while the app is visible. ⋮ on a message: Edit, Delete (mine) or Copy, the person, Report (others').
**Three reports hide a message** from everyone but its author.

## 5. Study groups
`noema_group_create()` makes a group with its creator as owner (≤ 10 new groups a day). `noema_room_invite()` invites
someone whose setting allows it; they see the invitation in their chats and join or decline. An owner or admin can make an
**invitation link** (`#/join/<code>`, a random 18-letter code, turned off by clearing it); `noema_room_peek()` shows the group
before joining, `noema_room_join()` joins. The member guard lets a person join, leave, mute and mark read; admins remove
plain members, the owner names admins; when the owner leaves, the oldest admin (else member) becomes owner.

The group's page has its members and roles, Invite, the invitation link, **Roadmaps of the group** (any member shares one
of theirs; the members may join it: `noema_cur_access` answers `public` for a Roadmap shared in one of my rooms, and
`NoemaCurShare.join(…, { viaRoom: true })` lets them in), **Group files** (`#/vault?g=<group>`), Edit and Leave.

## 6. Setting it up
Run `cloud/supabase.sql` again in the Supabase SQL editor: §12 adds the tables, functions, triggers, the bucket and its
rules, and §13 gives the vault its `room` column. It is idempotent. `tests/sql_policies.py` tests the SQL on Postgres with stub `auth` and
`storage` schemas (search, requests, the message setting, answering someone who wrote first, blocks, invitations,
the link, roles and the owner's hand-over, files readable by members only, three reports, edits and deletes, Roadmaps
through a room, the group's vault folder, the shared 50 MB, nothing for anonymous visitors).

## Later
Study buddies with the mascot (feature 4): accountability goals and check-ins. Moderation gets a page for the owner.
