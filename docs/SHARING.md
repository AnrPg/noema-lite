# Sharing subjects, 🌍 Explore and 🔔 notifications

> **Curricula** are shared differently — together, each with their own progress, the prepared steps in common: see
> `docs/CURRICULUM.md` §8 (🧭 Curricula → 👥 on a curriculum · 🌍 Explore curricula). Their invitations also arrive in 🔔.

Your own subjects (made with Claude, imported, or shared with you) can be **made public** or **sent to one
person**. Library subjects (Databricks…) are already available to everyone and have no share button.

Sharing needs a **cloud account** (⚙️ → Cloud). On a local profile the 🔗 dialog offers the pack file to
download instead — a package `<id>.noema.zip` with the subject **and its attached source files** — so you can send it
any other way (the other person uses *📥 Import subject pack*).

**Source files travel with every share** (📎 *Include its N source files*, ticked by default): public subjects put them in
the public bucket (`noema-public/<you>/<subject>/sources/<source>/file.<ext>`), a share with one person in the private
share bucket (`noema-shared/<share-id>.src-<source>.<ext>` — the existing storage rules give them to exactly the two of
you). The pack names them in `sharedFiles`; when the subject is accepted or chosen in 🌍 Explore, the app copies each
file into the receiver's own account (device + private cloud) and drops the addresses. Files over 45 MB are stored in
parts and joined again. Withdrawing a share or a public subject deletes its copies of the files.

## 1. Where the buttons are

| What | Where |
|---|---|
| 🔗 Share | a small button on each of **your own** subjects in the subject picker (appears on hover; always visible on phones), in ⚙️ → Subjects and in the subject’s ⋮ |
| 🌍 Explore | top bar of every subject, and at the bottom of the subject picker |
| 🔔 Bell | top bar; the red number is how many subjects are waiting for your answer |
| Banner | under the top bar when a new share arrives: **Accept** · **Reject** · **Later** |

Icons on the subject chips: 🔒 only yours · 🤝 shared with you · 🌍 taken from Explore · 📥 imported file.

## 2. Make a subject public
1. Subject picker → hover your subject → **🔗**.
2. If some pictures are not openly licensed (⚠️ box), tick *I understand* — they are fine for your own study,
   but the owners may not allow sharing them.
3. **🌍 Make it public**. Everyone signed in or not sees it in 🌍 Explore with its statistics, chapter list
   and sources.
4. Later: **🔄 Publish the newest version** after you changed the subject, or **Withdraw** to stop sharing
   (people who already chose it keep their copy).

## 3. Send a subject to one person
1. **🔗** → *Share with a person* → their e-mail (the one **they sign in with**) → optional message → **📨 Send**.
2. They get the banner and 🔔 the next time they open noema-lite (or within 2 minutes if it is open).
3. The dialog lists what you sent: ⏳ waiting · ✅ accepted · ✖ rejected. **Withdraw** cancels a waiting share.

## 4. Receiving
- **Accept** → the subject is copied into *your* account (it syncs to all your devices) and appears in your
  subject picker with 🤝. Your progress in it is yours alone.
- **Reject** → it disappears; the sender sees ✖.
- **Later** hides the banner for now; the request stays under 🔔.

## 4b. 🔔 New versions wait for you
- **A subject you took from 🌍 Explore:** when its author publishes a newer version (🔄 *Publish the newest version*), the
  🔔 and the banner say so: **⬆️ Update** (the same subject, so your progress, notes and conversations stay; the curriculum
  steps it teaches are re-planned to follow it) or **Keep mine** (you are asked again only about a later version). Nothing
  is downloaded until you choose. (`noema_public_packs` is checked with the other notifications; your copy remembers which
  public version it is: `publicId`, `publicAt`, `version`.)
- **A subject sent to you by a person:** when they send it again, it arrives as a new request — **Accept** takes the new
  version into the same subject.
- **Shared curricula** (docs/CURRICULUM.md §8): the owner's changes to the map and new versions of prepared steps wait in
  🔔 too; you take the changes you want.

## 5. 🌍 Explore
- A page (`#/explore/subjects`; the Roadmaps others share: `#/explore`), in folded sections by domain; typing in the field
  shows only the matches (title, description, who shares it). Each row shows the emoji and the title. **Click / tap a row =
  choose it**: it is added to your subjects and opens. Where no frame draws pages (the classic screens), the same page
  opens in a dialog.
- The details are behind **ⓘ** beside the row (on a phone it opens from the bottom), with *Study this subject*: owner
  (the library or the person's name), language, description, statistics (chapters, sections, exercises, picture exercises,
  pictures, flashcards, debug playbooks), the **chapters as a numbered list** in a fixed-size box that scrolls, sources
  with links, the source files, licence note. 👤 beside a row opens the page of the person who shares it.
- 🌐 **Translate**: a title or description in another language than yours can be machine-translated with your own
  Claude or Gemini key (off until you turn it on — Me › Language & appearance, or the first time you tap it); *Show original*
  brings the author's words back. Only public and shared texts are ever sent (docs/i18n.md §11).

## 6. The code
| Part | Where |
|---|---|
| The share dialog | `src/features/sharing/ui/share.ts` (Lit on the kit; `NoemaCore.community.share(subject)`, `Noema.share`); its data and the cloud's calls: `src/composition/sharing-host.ts` over `engine/cloud.js` and `engine/srcfiles.js` |
| 🌍 Explore | `src/features/sharing/ui/explore.ts` (`#/explore`, `#/explore/subjects`; `NoemaCore.community.explore(kind)` in a dialog) |
| 🔔 the bell's sharing rows (a share, an invitation, an update, news, *Clear all*) | `src/features/sharing/ui/notes.ts` (`Noema.shareRow`, `Noema.noticesClear`); what they do: the Notes of `engine/app/community.js` |
| 🔔 the banner under the top bar (the newest share, invitation or update; *+n more in the bell*, *Later*) | `src/features/sharing/ui/bar.ts`, the same row as the bell's; drawn into the frame's `.sharebar` (classic and new: `NoemaCore.community.notes.bar(el)`) once something waits |
| The screens' routes | `src/composition/community-ui.ts` (loaded as `build/community.js` the first time one opens) |

## 7. How it is stored (for the curious)
| Data | Where | Who can read |
|---|---|---|
| Public subject info | table `noema_public_packs` | everyone |
| Public subject file | bucket `noema-public/<owner>/<subject>.json` | everyone (only the owner can write) |
| A share | table `noema_shares` | sender and recipient only (recipient matched by sign-in e-mail) |
| Shared file | bucket `noema-shared/<share id>.json` | sender and recipient only |

All rules are in `cloud/supabase.sql` §8–9 and are tested on a real PostgreSQL by `tests/sql_policies.py`.
The whole flow (two people, accept, reject, Explore, a third person choosing a public subject, then 🔔 its new versions:
keep mine, update) is tested by `tests/sharing.js`.

**Setup once:** run the newest `cloud/supabase.sql` in the Supabase SQL editor, then ⚙️ → Cloud →
🩺 *Check the cloud connection* — the last three checks are *Public subjects*, *Sharing with a person* and *Shared curricula*.
