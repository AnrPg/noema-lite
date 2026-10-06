---
name: noema-pack-builder
description: Turn study sources (PDFs, notes, slides, images, links) into a noema-lite subject pack — structured theory, debugging playbooks, flashcards and many interactive exercises, including picture exercises — and save it to the user's noema-lite account. Use whenever the user wants to create, extend or update a noema-lite subject or "study pack".
---

# noema-pack-builder

You turn the user's sources into a **noema-lite subject pack**: one JSON file the noema-lite app
(https://noema-lite.netlify.app) opens as an interactive course — click-to-reveal theory, a Socratic
tutor, 19 exercise types (7 of them on pictures), spaced repetition.

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
- Images the user attached are pictures for the pack (step 3). Links: fetch and read them.
- Build an outline: chapters (6–16 sections each) in dependency order; note every concept, number,
  caveat, trap, worked example and test question — **coverage is non-negotiable**.

## 2. Create the working folder
```bash
python3 scripts/start_subject.py work <id> "<Title>" --lang en --emoji 📘 [--math] [--code]
```
Record each source in `work/<id>/sources.json` (`sources`, and which chapter comes from which source).

## 3. Pictures — always all three kinds (VISUAL.md §5–6)
1. **From the sources**: `python3 scripts/extract_images.py scan SOURCE.pdf work/_scan` → open
   `work/_scan/index.html` / the images and keep every informative figure, photo, chart and diagram.
   Vector diagrams appear only in the page renders: crop them with
   `python3 scripts/extract_images.py crop SOURCE.pdf PAGE X Y W H work/<id>/media/<name>.png` (percent of the page).
   Register them in `media/media.json` with `"origin": "source"`.
2. **From the web — even if the sources have pictures**: search for high-quality, information-rich
   **photographs and diagrams** that add what the text lacks (anatomy plates, micrographs, real
   apparatus, maps, real software screens…). Any licence is fine for a personal pack **as long as the
   source is recorded** (page url, author, licence text); non-open ones are flagged "restricted" and the app
   warns before sharing. Prefer open sources when equally good (Wikimedia Commons, OpenStax, NASA, NIH,
   Smithsonian Open Access, open-source docs). Download with
   `python3 scripts/fetch_image.py work/<id> <media-id> <URL> --alt "…" [--license … --author … --page …] [--crop X,Y,W,H]`
   (Commons file pages fill author + licence automatically). **Open every picture and check it**:
   correct, relevant, sharp (≥ 800 px), labels agree with the sources. If the sandbox has no internet
   but you can see pictures some other way (web search, a `noema_web_image` tool), register them as
   `"fetch": "app"` web pictures (direct image url + `w`/`h`, no file — VISUAL.md §6); the app downloads
   them. Only if that is impossible too, say so and continue with kinds 1 and 3.
3. **Drawings and function graphs**: redraw the sources' diagrams and flows, and plot functions
   (rates, kinetics, distributions, any f(x)) with `scripts/svgkit.py` (`Diagram`, `Plot`); it writes
   the SVG **and** its regions, so clickable parts always line up. Save with `d.save(media_dir, id, alt=…)`
   and `svgkit.write_registry(media_dir, [items])`.
4. For every raster picture add `regions` (the named parts, in pixel coordinates) — draw them over
   the picture with Pillow and look at the result before using them.

**Every picture gets ≥ 3 exercises of ≥ 2 visual types** + a `figure` block in the section that teaches it.

## 4. Write the chapters
`work/<id>/chapters/chNN.json`, one per chapter, exactly as `CONTENT_SPEC.md` says: theory blocks
(short, concrete, one idea each), comparisons side by side, `ask` blocks and `debug` playbooks for
everything diagnostic, pitfalls, 20–50 flashcards, ≥ 5 exercises per section (every type several
times, ≥ 30 % tagged pitfall/debug/exam), explanations that teach why the right answer is right and
why the tempting one is wrong. Write chapters with Python scripts (json.dump) rather than by hand.
Keep a coverage checklist (`coverage/chNN.md`) and close every gap.

## 5. Validate and build — must pass
```bash
python3 scripts/make_pack.py work/<id>          # → /mnt/user-data/outputs/<id>.json
```
Fix every error and run again. Never deliver a pack that fails.

## 6. Save it to the user's noema-lite account
(Running inside the noema-lite app through the API? Then just copy the built pack to `$OUTPUT_DIR` — the app imports it.)
- **With the noema-lite connector** (tools `noema_*` are available):
  `noema_start_upload(subject_id)` → run the returned `curl` command on the built file →
  `noema_finish_upload(subject_id)`. Small packs (≤ 1.5 MB) can use `noema_save_pack`.
  The subject appears in the user's noema-lite picker (cloud account) — tell them.
- **Without it** (or if the upload fails): give the user the `.json` file and tell them:
  *noema-lite → subject picker → 📥 Import subject pack*.

## Updating an existing subject (additive only)
Get the current pack (`noema_get_pack_url`, or the file the user gives you), then
`python3 scripts/unpack.py PACK.json work`. **Never change or delete existing ids** (progress is keyed
by them). Add new chapters (next `chNN`) or `patches/*.json` with `appendBlocks` / `appendExercises`
(reserve a fresh id range, e.g. `chNN-e7NN`), register the new source in `sources.json`, rebuild, save.

## Quality bar (check before saving)
- Every source detail is taught **and** tested; nothing invented; obvious source errors corrected and noted.
- Pictures: three kinds used, each verified, licensed, sharp, ≥ 3 exercises each.
- The pack builds with zero errors; tell the user the counts (chapters, exercises, visual, pictures).
