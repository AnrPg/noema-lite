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
| 🔗 Share | a small button on each of **your own** subjects in the subject picker (appears on hover; always visible on phones) and in ⚙️ → Subjects |
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

## 5. 🌍 Explore
- Cards show only the emoji and the title. **Click / tap a card = choose it**: it is added to your subjects
  and opens.
- The details appear in an info popup — **point at a card** with the mouse (or focus it with Tab); on a
  phone or tablet **press and hold** the card (it opens from the bottom, with *📚 Study this subject*;
  tap outside to close).
- The popup: owner (📚 library or 👤 name), language, size, description, statistics (chapters, sections,
  exercises, picture exercises, pictures, flashcards, debug playbooks), the **chapters as a numbered list**
  in a fixed-size box that scrolls (its height follows the screen), sources with links, licence note.

## 6. How it is stored (for the curious)
| Data | Where | Who can read |
|---|---|---|
| Public subject info | table `noema_public_packs` | everyone |
| Public subject file | bucket `noema-public/<owner>/<subject>.json` | everyone (only the owner can write) |
| A share | table `noema_shares` | sender and recipient only (recipient matched by sign-in e-mail) |
| Shared file | bucket `noema-shared/<share id>.json` | sender and recipient only |

All rules are in `cloud/supabase.sql` §8–9 and are tested on a real PostgreSQL by `tests/sql_policies.py`.
The whole flow (two people, accept, reject, Explore, a third person choosing a public subject) is tested by
`tests/sharing.js`.

**Setup once:** run the newest `cloud/supabase.sql` in the Supabase SQL editor, then ⚙️ → Cloud →
🩺 *Check the cloud connection* — the last three checks are *Public subjects*, *Sharing with a person* and *Shared curricula*.
