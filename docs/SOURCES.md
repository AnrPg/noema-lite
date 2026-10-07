# 📚 Sources: where every chapter comes from, and the original files

## 1. Which sources a chapter uses
A chapter often draws on several sources (a textbook chapter, a second book, a lecture, a web article).
The app finds **all** of them, strongest signal first (`engine/src/50_sources.js`, `chapterRefs`):

1. `chapter.sources: [{ "id": "ecb", "pages": "σ. 23–42" }, …]` — written by the skill (CONTENT_SPEC);
2. the chapter's main source (`sources.json → chapters`);
3. sections, blocks, exercises… that carry their own `src` (patched-in material);
4. the human line `sourcePages` ("ECB σ. 23–42 · Karp 9.2 · chat F · διάλεξη YouTube (37:00–63:00)"),
   split at " · " / ";" and each part matched to a source by its id, `short` name, title acronym (ECB),
   a "Κεφ./Ch. N" in its title, a word only that source's title has, or its web address.

From each part the app also reads a **page** ("σ.", "σελ.", "p.", "pp.", "pages", "S.") and a **video time**
("37:00").

## 2. In the app
* **Chapter header**: "Chapter N", the title, and a row of small chips **From  📘 ECB σ. 23–42 · 📗 Karp 9.2 …**
  (main source first, normal case — no long capitalised page list). Tap a chip → the source opens at that page
  (👁 when a file or web address exists), otherwise its card opens with 📎 Attach.
* `<html lang>` follows the subject's language, so capitals, hyphenation and fonts are right (Greek capitals
  without accents).
* **📚 Sources** menu: one card per source (each part of a split PDF is its own source). A card lists only the
  chapters that use it — main source first, then "(also)" with the part of the chapter text that cites it — plus
  the file: 👁 Preview · ↻ Replace · 🗑 Remove, or 📎 Attach, or its web address with 👁.
* **✨ new** only marks sources added in a later version of the subject (a later `added` date than the first
  source), never sources that arrived together.

## 3. The original files
| where | what |
|---|---|
| this device | IndexedDB `noema-files` (instant, offline) |
| your cloud account | private storage `<user>/sources/<subject>/<source>/file.<ext>` — any size: files over 45 MB are stored in parts `file.<ext>.p000, .p001…` (Supabase takes ≤ 50 MB per object) and joined again when opened |
| every device | the synced index `a:srcfiles:<subject>` (original name, type, size) — a device without the file downloads it on first preview |

How files get there:
* **In the package.** Claude's skill builds `<id>.noema.zip` = `pack.json` + `sources/<file>` for every file-based source —
  exactly the files it used: each part of a split PDF (`scripts/split_pdf.py`) is its own source and its own file, never the
  unsplit original next to it. `make_pack.py` refuses a source without its file, a file without its source and files over
  2 GB, and records `fileName`, `size`, `sha256`, `mime`, `pageCount`. The app attaches each file to its source after checking
  size and SHA-256:
  * **📥 Import subject pack** with the `.noema.zip` (a plain `.json` imports too, and says which files it lacks);
  * **Create with Claude → here in noema-lite (API key)**: Claude copies the package to `$OUTPUT_DIR`; the app imports it with
    its files (your own uploads are matched by name only for sources the package has no file for);
  * **Claude app + connector**: `noema_finish_upload` asks for every packaged file (signed upload commands) and saves the
    subject only when all are in your cloud storage, with the synced index.
* **📎 Attach** in the source's card (any device), or `noema_start_source_upload` for one extra file.
* **⬇️ Export / Download the package to send** writes a `.noema.zip` with every attached file (also the ones you attached by hand).
* Sources with a web address (a `url`, or a link in the subtitle) are previewed from the web (directly, or
  through `/api/file` when the site blocks browsers — http(s) only, no private addresses, ≤ 25 MB).
* Deleting a subject deletes its files too.
* Sharing a subject (public or with a person) shares its files too — docs/SHARING.md.

**Pages of split PDFs.** Chapters cite the book's page numbers; a part has `"firstPage"` (the book page it starts at), so
"σ. 410" in a part with `firstPage` 403 opens page 8 of that part. Citations below `firstPage` are taken as pages of the part.

## 4. 👁 The viewer (`engine/viewer.js`)
Full-screen overlay with ⬇️ download, ↗ open in a new tab, Esc to close. Libraries are vendored in
`engine/vendor/` and loaded only for the type that needs them (licences in `engine/vendor/viewer/README.md`).

| type | how |
|---|---|
| PDF | pdf.js (legacy build, CMaps, standard fonts, JPEG 2000 / JBIG2 decoders for scans): pages, zoom, page box, jumps to the cited page; falls back to the browser's PDF viewer |
| pictures | PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG natively; **HEIC/HEIF** (heic2any); **TIFF** incl. multi-page (UTIF + pako) |
| text | TXT, LOG, code (Python, JS, SQL, R, C…), YAML, INI, XML; Greek/Western legacy encodings detected |
| Markdown, JSON, CSV/TSV | rendered Markdown · pretty JSON · CSV as a table (delimiter detected) |
| HTML | sanitised (DOMPurify) and sandboxed — no scripts |
| Word **DOCX** | mammoth → HTML with pictures |
| **XLSX/XLSM/XLSB/XLS/ODS/Numbers** | SheetJS, one tab per sheet |
| **PPTX** | slides with their text and pictures |
| **ODT/ODP**, **RTF**, **EPUB** (with pictures), **Jupyter IPYNB** (cells + outputs), **EML** e-mails (headers, HTML/plain part, encoded words) | built in (JSZip where needed) |
| **ZIP** | list of files — each opens in the viewer |
| audio / video | MP3, WAV, OGG, M4A, FLAC, Opus · MP4, WebM, MOV |
| YouTube links | embedded player starting at the cited time |
| older DOC/PPT/MSG, Pages, Keynote, anything else | the readable text inside, else a hex view — always downloadable |

## 5. Tests
`tests/sources.js`: Greek pack with four sources → header chips (main first), `lang="el"`, cards with only their
chapters, ✨ new logic, attach → cloud + index, preview at the cited page, web source, the same file on a second
device from the cloud, **24 file types** in the viewer (incl. sanitised HTML, file inside a ZIP, e-mail HTML,
slide pictures, YouTube), remove; a **real package** built with the skill's scripts (a 30-page book split into two
parts + a note) → 📥 import → every file in the cloud byte-for-byte, "σ. 14" opens page 2 of the part that starts at 13,
a damaged file refused, a plain .json import explained, ⬇️ export as a package; plus subject rename / restore / delete.
`tests/package_sources.py`: split_pdf.py, make_pack.py's file rules (missing file, file without source, outside
`sources/`, > 50 MB, citations outside a part), the package contents and checksums, unpack.py round trips (from the
package and from a .json). `tests/connector.js`: `noema_finish_upload` refuses until every packaged file is uploaded
with the right size, then indexes them; `noema_save_pack` does the same. `tests/claude_api.js`: "Create with Claude"
imports the package (not an older .json), attaches the split parts byte for byte, and matches the learner's own
uploads only for sources without a packaged file.
