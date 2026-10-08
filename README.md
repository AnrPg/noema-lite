# ◆ noema-lite

A subject-agnostic study app: **structured theory**, a **Socratic AI tutor** (Gemini), **12 types of interactive exercises**,
debug/diagnosis drills, spaced-repetition flashcards, lightning rounds and boss battles — for *any* subject.
The engine knows nothing about the content; each subject is a **pack** generated from your sources.

## Open it
* **On this Mac:** double-click `index.html` (Chrome recommended). Works offline except for the AI tutor and fonts.
* **Anywhere:** the website built from this repo (see `cloud/README.md`), with a cloud account that syncs your progress.
* **One file:** `python3 tools/build.py bundle` → `dist/noema-lite.html` (all subjects inlined; e.g. for a phone).

## Repository map
```
index.html                 entry point (loads config → registry → loader → one subject pack → engine)
config.js                  public settings (Supabase URL + publishable key go here); config.local.js = private, git-ignored
engine/
  loader.js                profiles, subject picker, pack loading, namespaced storage, backups, restore points
  cloud.js                 Supabase adapter (auth, sync, snapshots, private storage) — dependency-free
  src/*.js, src/*.css      the study engine source  →  engine.js / engine.css (GENERATED)
  vendor/                  marked, DOMPurify, KaTeX
library/
  groups.json              groups of the subject picker
  subjects/<id>/           shared subjects (subject.json, sources.json, sources/*.pdf, chapters/, patches/, media/, coverage/)
  registry.js              GENERATED catalogue
accounts/<profile>/
  account.json             local profile seed (name, emoji, "about me" for the tutor)
  backups/                 suggested target for the app's automatic folder backups
  packs/<id>/              PRIVATE subjects of this profile (never published to the website)
tools/                     build, validate, new_subject, source_text, db_sync, db_restore, svgkit (diagrams), CONTENT_SPEC.md, schemas/
docs/                      LANGUAGES.md (foreign languages, polyglot — design + plan), VISUAL.md (picture exercises — canonical schema), CLAUDE_CONNECTOR.md, TUTORING.md, CONVERSATIONS.md, TECH_DEBT.md
cloud/                     supabase.sql (schema + row-level security), the setup guide, mcp/server.mjs (the Claude connector)
skill/noema-pack-builder/  the Claude skill users add to their own Claude (zip built into the website)
data/noema-lite.db     SQLite backup database (GENERATED, git-ignored; upload it to the cloud from the app)
tests/                     end-to-end tests (Playwright) incl. a Supabase emulator
```

## Everyday commands
```bash
python3 tools/build.py                  # validate + rebuild engine, packs, registry
python3 tools/build.py site bundle      # + website folder (dist/site) + single-file app
python3 tools/db_sync.py                # refresh the SQLite backup database (versioned copy of every file + all content + profile backups)
python3 tools/db_restore.py list        # what the database holds; restore files/subjects/packs/backups into a NEW folder
```

## Two ways to study
* **📚 Subjects** — ready-made courses made from sources (below).
* **🧭 Curricula** — type a goal; four AI agents map every prerequisite, the whole goal and its applications as a graph of steps; each step becomes a full subject, prepared on demand from official sources and kept for good. Steps open when their prerequisites are mastered; you review (and may change) each step before it is generated, and can edit, add or remove steps. Or import your own map (with your files per step). **💬 With the Claude app** your own Claude builds, plans and prepares it with your Claude plan instead of API credit — usually the cheapest way for a curriculum. See docs/CURRICULUM.md.
* **🌍 Languages** — foreign-language courses, several languages learned in parallel (foundations first, then the core grammar and the thematic fields); one course per folder in `library/languages/`. See docs/LANGUAGES.md.
  **Hard rule — the parallel order (D13, docs/LANGUAGES.md §4.4.3):** all the language paths of the app (every language of every course, and the path of each language type) keep one common order of the subjects. A path may add steps of its own or skip some, but no subject x comes after a common subject y in any path if x comes before y in another. Adding a language or moving a subject means placing it on that common order for *all* languages — a move is analysed across every path and made in all of them at once. `tools/validate_lang.py` (and so the build and the tests) fails on any violation, across all the courses.

Every chapter shows the sources it comes from; the original files (PDFs, slides, documents, e-books, spreadsheets, videos…) open inside the app at the cited page — see docs/SOURCES.md. Any subject can be renamed, described, hidden or deleted (✏️ on its chip).

## Adding a subject (through Claude)
In the app: **✨ Create with Claude** — any user can do it, three ways (docs/CLAUDE_CONNECTOR.md): **A.** here in the app with their own Claude API key (the app uploads the skill, runs Claude and imports the result), **B.** in the Claude app/website with their Claude plan + the noema-lite connector, or **C.** a whole curriculum with their Claude plan (the connector hands Claude the curriculum's tasks; recommended for curricula). Finished subjects can be shared: 🔗 on a subject → public (🌍 Explore) or to one person (🔔), see docs/SHARING.md. Or, for the shared library:
1. Give Claude the sources (PDFs, links, notes) + subject name, group, goal (exam / understanding / project) and language.
2. Claude scaffolds it (`tools/new_subject.py`), reads every page, writes chapters per `tools/CONTENT_SPEC.md`, draws pictures and builds **several visual exercises per chapter** per `docs/VISUAL.md`, validates, builds and tests.
3. The new subject appears as a chip in the picker. New sources for an existing subject are merged **additively** (patches) — your progress is never lost.

## Profiles, privacy & data
* Each **profile** (local) or **cloud account** has its own subjects, progress, flashcard schedules, tutor conversations, settings and backups.
  Local storage keys are namespaced `noema1:<profile>:a:*` (account) and `noema1:<profile>:s:<subject>:*` (per subject).
* Cloud data is protected by Postgres **row-level security**: a user can only ever read/write their own rows and files.
* A local PIN is a privacy curtain on a shared computer, not encryption.

## Backups — four layers
| Layer | What | Where |
|---|---|---|
| Restore points | automatic before every restore/reset (last 12) | browser (IndexedDB) |
| Backup files | “Download backup” or automatic every 5 min to a folder (Chrome/Edge) | `accounts/<profile>/backups/` |
| Git | full history of engine + all subject sources | GitHub (private repo) |
| Database | `data/noema-lite.db`: every file version + content + profile backups | this Mac + uploaded to the cloud |
| Cloud | live sync + daily snapshots (30 kept) + private files | Supabase |

## Naming
Everything is **noema-lite**: repository, folder, website, docs, browser storage (`noema1:…` keys, IndexedDB `noema-lite`),
the `Noema` JavaScript namespace, Supabase tables `noema_*` and bucket `noema-private`, pack format `noema-pack`,
backup format `noema-lite-backup`, conversation schema `noema.conversation/v1`.
Data written by the app before it was renamed is copied over automatically on first start (see `LEGACY` in `engine/loader.js`).

## Γρήγορος οδηγός (Ελληνικά)
* Άνοιγμα: διπλό κλικ στο `index.html` (Chrome). Διαλέγεις προφίλ και μάθημα από τα chips.
* Νέο μάθημα: **✨ Create with Claude** — (A) μέσα στην εφαρμογή με δικό σου Claude API key, ή (B) στην εφαρμογή/ιστοσελίδα του Claude με τον connector `https://noema-lite.netlify.app/mcp` (ίδια διεύθυνση για όλους, σε Windows, Mac, Linux, κινητά).
* Curricula: 🧭 → γράφεις τον στόχο → χάρτης βημάτων (προαπαιτούμενα → στόχος → εφαρμογές)· κάθε βήμα γίνεται μάθημα όταν φτάσεις εκεί.
* Κοινή χρήση: 🔗 πάνω σε δικό σου μάθημα → δημόσιο (🌍 Explore) ή σε ένα άτομο (🔔 ειδοποίηση, Accept / Reject).
* Αντίγραφα ασφαλείας: μενού λογαριασμού (το emoji πάνω δεξιά) → 💾 Backup & restore.
* Cloud & πρόσβαση από παντού: δες `cloud/README.md`.
