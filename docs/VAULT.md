# 🗄️ The vault — study files students share

Decided with the user on 2026-10-20 (thread "Sources workflow, vault, social, study buddies"). Students share lecture notes,
slides, past exams (with or without solutions), exercise sets, lab work, summaries, books, recordings and any other study
material. Code: `engine/vault.js` (page `#/vault`, the Vault tab of the side bar), `cloud/supabase.sql` §13, words `i18n/vault/`.
Test: `tests/vault.js`.

## 1. Strictly organised, searchable across every branch
Every file has a place, **university › department › course › year › type**: the Folders view browses it. Only the type, the
field (`subject`) and at least one language are required; university, department, course (exactly as the school calls it),
year and semester are optional, since they differ from place to place. A file without one sits in a *Not specified* folder at
that level, and a file without a semester shows under every semester. A file may have several languages (`language` =
`el,ru`). The field comes from the shared list `SUBJECTS`, a key whose name is translated (a growing graph of fields is planned). Every field is a column, so every filter works across all the folders at once. For example, *biology* + *lecture
notes* + *semester 3* finds the notes of any university and any year.

Names typed in another way (case, accents, spaces) snap to the one already in the vault, and the database tidies the spaces.
That way one place stays one folder.

| filter group | filters |
|---|---|
| Where | university, department, course, professor (each list holds only what exists under the choice above it) |
| When | academic year, semester |
| Type | notes, slides, past exam, exam with solutions, exercise set, lab work, summary, book, recording, other |
| Subject | the shared list |
| Contents | has exercises, has solutions, handwritten / typed |
| Format | language, file type (documents, slides, spreadsheets, e-books, pictures, audio, video, plain text) |
| Quality | rating (3★+, 4★+); sort by newest, best rated, most downloaded, academic year |
| Use | already used in a noema course ("Make a course from it") |

The filters live in the address (`#/vault?sub=biology&k=notes&sem=3`). The search matches title, description, place,
professor, file name and every field in the menus' words: type, field, year, semester, languages, exercises/solutions,
handwritten — in the menus' language, English and any other catalog the page has loaded. It works in any script, with or without accents, and finds Greek and Cyrillic in
plain and scholarly Latin letters (`viologia` and `biologia` both find `Βιολογία`). The list is read once (≤ 5000 rows,
enough for the Free plan) and filtered on the device. Past that, move the filters into the query.

## 2. Anonymous
`noema_vault_files.uploader` is kept for deleting one's own files and for take-downs, and nobody else can read it. RLS on the
table shows each person only their own rows. Everybody reads the view `noema_vault`, which has no uploader column, only `mine`
and the name of those who ticked **Show my name**. That name is taken from their profile by the database, never from the
client. The storage path is `noema-vault/files/<id>.<ext>`, with no person in it.

## 3. Restrictive
* **Formats**: only documents, slides, spreadsheets, e-books, pictures, audio and video (`FORMATS`: pdf doc(x) odt rtf txt md tex
  csv ppt(x) odp xls(x) ods epub png jpg gif webp heic mp3 m4a wav ogg flac mp4 mov webm). There are no programs, scripts,
  archives or SVG. Three checks enforce this: the extension, the **first bytes** of the file (a program renamed `.pdf` is
  refused), and the database itself (a mime and path check, plus the bucket's `allowed_mime_types`).
* **Sizes** (Supabase Free plan, 1 GB in all): ≤ 20 MB a file (the bucket limit too) and ≤ 50 MB a person (a trigger).
* **Upload**: every required field, and a box the uploader must tick: *the files are mine to share or free to share, and none
  holds answers to an exam that has not been held yet*.
* **Finish**: a file is `pending`, seen by nobody else, until `noema_vault_finish()` has found it in storage with the size
  announced.
* **Counters are the server's**: a trigger keeps the status, size, path and counts whatever the client sends.
  `noema_vault_count()` counts one download and one "used" per person, and ratings and reports are tallied by triggers.
* **Reports**: copyright, answers to an exam not held yet, wrong labels, abuse, spam, other. One per person per file.
  **Three hide the file** from everyone but its owner, until it is checked (by hand, in the database, for now).

## 4. A file
Its sheet shows the place, contents, file, who shared it (or *someone who stays anonymous*), rating, downloads and uses. It
has Download, Preview (PDF, pictures, audio, video, text), **Make a course from it** (📚 From your sources opens with the file,
docs/FROM_SOURCES.md), five stars, Report, and Edit / Delete for one's own files. ⋮ › My uploads lists one's own files with
their status (*not finished*, *hidden*).

## 5. Setting it up
Run `cloud/supabase.sql` again in the Supabase SQL editor: §13 adds the tables, the view, the functions and the bucket. It
is idempotent. The SQL is tested on Postgres 16 with stub `auth` and `storage` schemas: owner-only rows, the view without
the uploader, the size check on finish, frozen counters, the quota, ratings, one download per person, three reports hide,
storage reads and writes, refused formats.

## 6. Study groups and conversations (docs/SOCIAL.md)
A file may belong to a study group (`room`): only its members see, count and download it, and the Vault shows it
under the filter *Study group* (`#/vault?g=<group>`), the group's own folder. Uploading from there sets *Who sees it* to the
group. A file's sheet has **Send to…**: a conversation, a group or a buddy, with a line. The 50 MB per person count the vault
and the files sent in conversations together (`noema_used_bytes`).

## Later
Moderation gets a page for the owner.
