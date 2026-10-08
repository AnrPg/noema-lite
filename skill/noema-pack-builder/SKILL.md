---
name: noema-pack-builder
description: Turn study sources (PDFs, notes, slides, images, links) into a noema-lite subject pack — structured theory, debugging playbooks, flashcards and many interactive exercises, including picture exercises — and save it to the user's noema-lite account. Use whenever the user wants to create, extend or update a noema-lite subject or "study pack".
---

# noema-pack-builder

You turn the user's sources into a **noema-lite subject package** (`<id>.noema.zip`): the pack (the course —
click-to-reveal theory, a Socratic tutor, 19 exercise types (7 of them on pictures), spaced repetition) **plus the
original source files** (every PDF, document, slide deck the user gave you — exactly in the form you used them, so
each part of a split PDF is its own file). The noema-lite app (https://noema-lite.netlify.app) imports it and the
learner opens each source file at the pages the chapters cite.

**The contract is in `references/`. Read both files before writing any content:**
- `references/CONTENT_SPEC.md` — subject, chapters, sections, blocks, exercises, playbooks, quantities, pedagogy.
- `references/VISUAL.md` — pictures, regions, the 7 picture-exercise types, figures, picture sourcing & licences.

Scripts live in `scripts/` next to this file (Python 3, standard library + Pillow; for PDFs any of poppler, PyMuPDF, or pypdf + pypdfium2).

## 0. Agree on the basics (one short message, then work)
Subject title and id (`lowercase-with-hyphens`), language of the material (the tutor answers in it),
the learner's goal (exam / understanding / project), math or code features. If the user is vague,
choose sensible defaults, say them in one line, and carry on.

## 1. Read every source completely
- PDFs: `python3 scripts/pdf_text.py FILE.pdf > text.txt` (page-numbered). Read all of it, in chunks.
- Files of any size are fine (the app and the connector store big files in parts). Split a PDF only when you WANT the
  parts as separate sources (e.g. a whole book treated chapter by chapter):
  `python3 scripts/split_pdf.py BOOK.pdf work/<id>/sources --ranges 1-24,25-60,… --name ecb` (or `--max-mb N`).
  It prints a `sources.json` entry per part with `"firstPage"` (the book page where the part starts) — keep citing the
  **book's page numbers** and the app opens the right page of the right part. If the user already gave you parts,
  each part is simply its own source.
- Images the user attached are pictures for the pack (step 3). Links: fetch and read them.
- Build an outline: chapters (6–16 sections each) in dependency order; note every concept, number,
  caveat, trap, worked example and test question — **coverage is non-negotiable**.

## 2. Create the working folder
```bash
python3 scripts/start_subject.py work <id> "<Title>" --lang en --emoji 📘 [--math] [--code]
```
Record each source in `work/<id>/sources.json` (`sources`, and which chapter comes from which source) and **copy
every file the user gave into `work/<id>/sources/`** (as it is, or only its parts if you split it — never both).

## 3. Pictures — always all three kinds (VISUAL.md §5–6)
1. **From the sources**: `python3 scripts/extract_images.py scan SOURCE.pdf work/_scan` → open
   `work/_scan/index.html` / the images and keep every informative figure, photo, chart and diagram.
   Vector diagrams appear only in the page renders: crop them with
   `python3 scripts/extract_images.py crop SOURCE.pdf PAGE X Y W H work/<id>/media/<name>.png` (percent of the page).
   Register them in `media/media.json` with `"origin": "source"`.
2. **From the web — even if the sources have pictures**: search WIDELY for the best, information-rich **photographs
   and diagrams** that add what the text lacks (anatomy plates, micrographs, real apparatus, labelled diagrams, maps,
   real software screens…). The packs are for the learner's **personal study**: any site and any licence is fine as long
   as the source is recorded (page url, credit, licence if known); non-open ones are flagged "restricted" and the app
   warns before sharing. Do not limit yourself to open collections — pick the clearest, best-labelled picture.
   * Search: `python3 scripts/find_images.py "what it shows" [--sources bing,duckduckgo,commons,openverse,nasa,inaturalist,wellcome,artic]`
     (Bing + DuckDuckGo Images = the whole web, what a Google image search shows too) — or, with the connector,
     `noema_image_search`; plus web search for textbook / publisher figure pages, university lecture pages, open-access
     articles (their figures), encyclopedias and specialist sites.
   * Download: `python3 scripts/fetch_image.py work/<id> <media-id> <image url OR the page> --alt "…" [--license … --author … --page …] [--crop X,Y,W,H]`
     — pages are resolved to their main picture; Wikimedia/Wikipedia file pages (any language, `#/media/File:…`, thumbnails)
     to the file, with author + licence filled in. **Never web-fetch a Commons/Wikipedia file page to get the picture.**
   * If your sandbox cannot reach a site (the script says so), call the connector's `noema_image_fetch` with the url: it
     shows you the picture, gives its size and a ready `"fetch": "app"` media.json entry (no file — the app downloads it).
   **Open every picture and check it**: correct, relevant, sharp (≥ 800 px), labels agree with the sources. Only if no
   way works, say so and continue with kinds 1 and 3.
3. **Drawings and function graphs**: redraw the sources' diagrams and flows, and plot functions
   (rates, kinetics, distributions, any f(x)) with `scripts/svgkit.py` (`Diagram`, `Plot`); it writes
   the SVG **and** its regions, so clickable parts always line up. Save with `d.save(media_dir, id, alt=…)`
   and `svgkit.write_registry(media_dir, [items])`.
4. For every raster picture add `regions` (the named parts, in pixel coordinates) — draw them over
   the picture with Pillow and look at the result before using them.

**Every picture gets ≥ 3 exercises of ≥ 2 visual types** + a `figure` block in the section that teaches it.

## 3b. Sources: one entry per file or link, every chapter mapped to ALL its sources
Give every PDF (also each part of a split PDF), document, web page, video and conversation its own entry in
`sources.json` (`id`, `title`, `short` — a 2–12 character label like "ECB" or "Karp" — `subtitle`, `pages`,
`file` or `url`, `added`, `emoji`; for a part of a split PDF also `firstPage`). A file-based source has
`"file": "sources/<file name>"` and that file is in `work/<id>/sources/` — **make_pack.py packages it and refuses a
source without its file, and a file in `sources/` that no source points to** (so nothing is left out and the unsplit
original is not packaged next to its parts). In each chapter write `"sources": [{"id": "ecb", "pages": "σ. 23–42"},
{"id": "karp", "pages": "9.2, 9.5"}]` listing EVERY source the chapter uses with its pages / sections /
timestamps (the app shows them as chips and opens the file at that page), and keep `sourcePages` as one
short human line built from the same parts joined by " · ".

## 4. Write the chapters
`work/<id>/chapters/chNN.json`, one per chapter, exactly as `CONTENT_SPEC.md` says: theory blocks
(short, concrete, one idea each), comparisons side by side, `ask` blocks and `debug` playbooks for
everything diagnostic, pitfalls, 20–50 flashcards, ≥ 5 exercises per section (every type several
times, ≥ 30 % tagged pitfall/debug/exam), explanations that teach why the right answer is right and
why the tempting one is wrong. Write chapters with Python scripts (json.dump) rather than by hand.
Keep a coverage checklist (`coverage/chNN.md`) and close every gap.

## 5. Validate and build — must pass
```bash
python3 scripts/make_pack.py work/<id>
#  → /mnt/user-data/outputs/<id>.noema.zip   THE PACKAGE: pack.json + sources/<every source file>
#  → work/<id>/build/<id>.json               the pack alone (for the connector upload)
```
Fix every error and run again (also look at the WARN lines: a citation outside a part's pages means a wrong
`firstPage` or page). Never deliver a pack that fails. The package lists every source file it contains — check
that every file the user gave you (or each of its parts) is there.

## 6. Save it to the user's noema-lite account
(Running inside the noema-lite app through the API? Then just copy the package `<id>.noema.zip` to `$OUTPUT_DIR` — the app imports it with its source files.)
- **With the noema-lite connector** (tools `noema_*` are available):
  1. `noema_start_upload(subject_id)` → run the returned `curl` command on `work/<id>/build/<id>.json`;
  2. `noema_finish_upload(subject_id)` → it checks the pack, then **asks for the source files** packaged in it:
     run the commands it returns (a `curl` per file — each part of a split PDF; a file over 45 MB comes as a `split`
     command plus one `curl` per part: no size limit), then call
     `noema_finish_upload` again. The subject is saved only when every packaged file is in the account (right size).
  Small packs (≤ 1.5 MB) can use `noema_save_pack` instead of step 1 (step 2's file uploads still apply).
  The subject appears in the user's noema-lite picker (cloud account) with its files — tell them.
- **Without it** (or if the upload fails): give the user the **`<id>.noema.zip` package** and tell them:
  *noema-lite → subject picker → 📥 Import subject pack* (choose the .zip — the source files come with it).

## Curricula: steps, maps and chapter plans (noema-lite connector)
A noema-lite **curriculum** is a map of steps; every step becomes a subject pack. When the learner asks you to work on one
(“prepare the next step of my curriculum…”, or the prompt *Work on my noema-lite curriculum*):
1. `noema_curricula` shows what waits; `noema_curriculum_task(curriculum_id)` returns the next task as complete instructions.
2. **Map / chapter-plan tasks** (agents of the curriculum): think it through, then `noema_curriculum_submit(curriculum_id,
   task_id, result_json)` with ONE JSON object matching the task's schema. It is checked like the app's own agents — fix
   every listed problem and submit again. Then ask for the next task. A chapter-plan task for steps with the learner's
   files gives you their links: download them and READ the pages of each step before planning (`pdf_text.py`), so every
   chapter follows what those pages really contain and names its pages in `material`.
3. **Step tasks**: build ONE pack exactly as this skill describes, with the given `subject_id` (start_subject.py with that id),
   one chapter per planned chapter (same order and titles), from the learner's files when the task gives download links
   (`curl` them into `work/<id>/sources/`; when only some pages belong to the step, split those pages out) — otherwise
   researched from authoritative sources. Save it with `noema_start_upload` → `noema_finish_upload` (the learner's own
   files are recognised by their SHA-256 and not uploaded again). The step then appears ready on the learner's map.
4. One step per chat unless the learner asked for more; after each saved step, `noema_curriculum_task` again if so.
Without the connector the learner gives you a step bundle (`TASK.md` + `files/` + this toolkit): follow TASK.md and hand
back `<subject_id>.noema.zip`.

## Language courses (🌍 Languages)
Foreign-language courses are not subject packs. **Read `references/LANGUAGE_RULES.md` first — it is binding for every
task on a language course** (the short form of decisions D1–D19; with the connector: `noema_authoring_guide` part
"languages"); the full contract is `references/LANGUAGES.md`. Courses are checked with `tools/validate_lang.py`,
`tools/lang_refcheck.py` and `tools/lang_phenomena.py`. The hard rules, in short:
1. **A new language starts with its catalogue of phenomena** (`library/languages/_phenomena/<code>.json`, §4.11): every
   special, uncommon or notable feature of the language — script, sounds, the morphology of every part of speech, syntax,
   one concept with several words, one word with several meanings, register, politeness, culture, numbers — with how the
   app records and teaches it and what is missing. The language's `wordFeatures` and its course content come from it.
2. **Every word states its language's whole facade** (`features` per `wordFeatures`, §4.5.1): a value for every parameter
   of its part of speech, or `{"none": "<why>"}` — e.g. Arabic nouns: root, pattern, every plural with the meanings it
   belongs to, dual, human or not; Chinese: measure words, readings and traditional forms per meaning.
3. **Several words for one concept** (还是 / 或者, gehen / fahren) each say what separates them (`contrasts`, §4.5.2).
4. **Every distinct meaning of a word is its own concept** (D15) — pending until a node teaches it; nuances say `of` the sense.
5. **One common order of subjects across all languages** (D13, §4.4.3): never teach a subject earlier or later in one language.
6. **No built-in point of view** (D16): describe a language for a learner of ANY background — its typological profile (`_typology/languages.json`) and phenomena tagged with feature values, covering everything it has or lacks; never "unlike English…". What is new for a learner is computed from their languages.
8. **Comparison notes, not inline comparisons** (D16, D18): general texts name no outside language; every grammar page gets `notes` for at least 8 languages of the reference set (`_typology/reference.json`), covering all four types.
9. **Vocabulary is its own track** (D19): sentences for the other aspects may hold up to ⌈30 %⌉ unknown words (each in the lexicon with its full facade); every field you write brings ≥ 2 sentences for every non-vocabulary node before it.
7. **The course never ends** (D17): foundations → core C01–C48 → open-ended advanced modules, each placed on the common order.

## Updating an existing subject (additive only)
Get the current pack (`noema_get_pack_url`, or the package / file the user gives you), then
`python3 scripts/unpack.py PACK.noema.zip|PACK.json work` (a package gives back its source files too; from a .json
the existing sources keep the files the learner already has, and only NEW sources must bring theirs). **Never change or delete existing ids** (progress is keyed
by them). Add new chapters (next `chNN`) or `patches/*.json` with `appendBlocks` / `appendExercises`
(reserve a fresh id range, e.g. `chNN-e7NN`), register the new source in `sources.json` (its file in `work/<id>/sources/`), rebuild, save.

## Quality bar (check before saving)
- Every source detail is taught **and** tested; nothing invented; obvious source errors corrected and noted.
- Pictures: three kinds used, each verified, licensed, sharp, ≥ 3 exercises each.
- Every file the user gave is in the package (or all of its parts), each its own source, cited by the chapters that use it.
- The pack builds with zero errors; tell the user the counts (chapters, exercises, visual, pictures, source files).
