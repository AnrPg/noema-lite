# The page others see (Me ▾ › Me)

Since 2026-10-11 "Me" (top right on phones, the rail's foot on wide screens) opens a menu: **Me** · Settings · Help ·
My subjects — Switch account · Log out. **Me** is the learner's own page, as other people see it (`#/profile`).

## What is on it
* A picture (optional; cut square to 256 px and saved as a small JPEG — nothing of the original file travels), the
  account's name and emoji, and a few words ("About me", at most 600 characters).
* Five parts, each **off** until the owner switches it on (✏️ Edit my page):
  | Part | What it shows |
  |---|---|
  | Progress | level, XP, streak, chapters completed |
  | Achievements | the treasures found (the medals of the Progress tab) |
  | Languages I study | the language courses started (from the languages world's `studying()`, docs/NEW_FRAME_AND_LANGUAGES.md), their languages and words met |
  | Topics I study | the Roadmaps (with their mastery) and the subjects on no Roadmap with some progress |
  | What I share | the owner's public Roadmaps and public subjects, read live from Explore; tapping one opens / joins it there |

## Private until published
* Local profiles keep the page on the device only (`noema1:<profile>:a:mypage`); publishing needs a cloud account.
* Cloud accounts keep it in `noema_public_profiles` (cloud/supabase.sql §11): one row per person, `published = false`
  until **Publish my page**. Row-level security: the owner reads and writes their row; everybody else (signed-out
  visitors too) reads it only while it is published. `card` holds only the parts switched on, as of `updated_at`; a
  published page is refreshed whenever its owner opens it. The picture lives in the row as `data:image/(jpeg|png|webp)`
  (the database refuses anything else), never as a file.
* **Make it private** hides it again at once. Deleting the account deletes the row (`on delete cascade`).

## How others reach it
* **Copy the link** (published pages): `…/#/u/<user id>`.
* Discover › What others share / Roadmaps others share: a quiet person button next to each row opens its owner's page.
* `#/u/<id>` of an unpublished or unknown page says it is private or does not exist; your own id opens `#/profile`.

## Words
Every label is in engine/i18n_shell.js (`pf*`, `subj*`, `menuMeSub`, `settings*`, `logOut*`, `b*` keys) in en, el, ru, fr.
Tests: tests/shell.js (J: the menu, My subjects, the page on a local profile, Log out), tests/sharing.js (publishing
between two cloud accounts against the emulator), tests/sql_policies.py (the row-level security of §11).
