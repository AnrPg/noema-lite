# Visual exercises — canonical schema `noema.visual/v1`

Images, diagrams and interactive "do it on the picture" exercises, for **any** subject:
anatomy and medicine (label the heart, find the lesion), biology (cell parts), chemistry
(lab set-ups), geography (maps), languages (label the picture), engineering (architecture
diagrams), and so on.

This file is the **contract**. Content authors (Claude, when ingesting sources) follow it,
`tools/validate.py` enforces it, `tools/build.py` packs it and the engine renders it.
The machine-readable version is `tools/schemas/noema.visual.v1.schema.json`.

---

## 1. Media registry — `media/media.json` (one per subject)

```
library/subjects/<subject-id>/media/
├── media.json            the registry (below)
├── heart-frontal.svg     the files: .svg (preferred for diagrams), .png, .jpg/.jpeg, .webp
└── …
```

```json
{
  "format": "noema.media/v1",
  "items": [
    {
      "id": "heart-frontal",                   // [a-z0-9-]+, unique in the subject
      "file": "heart-frontal.svg",
      "origin": "drawn",                       // drawn | plot | source | web  (§5)
      "url": "https://…", "retrieved": "2026-10-06",   // REQUIRED for origin "web": the page it came from
      "lowResOk": "reason",                    // optional: allow a raster < 800 px (small flat diagram)
      "alt": "Frontal section of the heart with the four chambers and the great vessels",   // REQUIRED, describes the picture
      "caption": "Blood enters the right atrium…",  // optional, shown under figures
      "credit": "Drawn by noema-lite",            // REQUIRED: who made it
      "license": "own",                          // REQUIRED: own | CC0 | CC BY 4.0 | … (only reuse what the license allows)
      "src": "part1",                            // optional: the source (sources.json id) the content comes from
      "w": 800, "h": 520,                        // optional: auto-detected for svg/png/jpeg/webp
      "regions": [ Region, … ]                   // optional: the named parts of the picture, defined ONCE here
    }
  ]
}
```

* **Coordinates are image units**: the SVG `viewBox` (or the pixel size of a raster image),
  origin top-left. The engine scales them with the picture, so they stay correct on any screen.
* The build embeds every file into the pack (data URI), so packs stay one self-contained file
  (website, bundle, export/import, cloud). Keep rasters ≤ 400 KB (the validator warns).
* Diagrams that Claude draws: generate them with `tools/svgkit.py`, which writes the SVG **and**
  the matching regions, so the clickable areas always line up with the drawing.

## 2. Region

A named, clickable / coverable part of a picture.

```json
{ "id": "lv",                         // [a-z0-9_-]+, unique within the picture/exercise
  "shape": "rect", "x": 410, "y": 250, "w": 120, "h": 90, "rx": 8,   // rect (rx optional)
  // or  "shape": "circle", "cx": 300, "cy": 200, "r": 40
  // or  "shape": "poly",   "points": [[10,10],[60,15],[40,70]]       // ≥ 3 points
  "label": "Left ventricle",          // canonical name: the answer of drag / label / select
  "accept": ["LV", "left ventricle of the heart"],    // more accepted typed answers (img_label)
  "options": ["Left ventricle", "Right ventricle", "Left atrium"],   // img_select: this dropdown only
  "anchor": [470, 295],               // where the pin / input / drop zone sits (default: centre)
  "q": "Which chamber pumps into the aorta?",          // img_occlusion: question for this mask
  "note": "Thickest wall: it pumps into the systemic circulation."   // teaching note after answering
}
```

## 3. Exercise types

All the common exercise fields apply (`id`, `type`, `section`, `difficulty`, `tags`, `quick`,
`q`, `explain`, `src`). Visual exercises add:

| field | meaning |
|---|---|
| `media` | **required** — id in `media.json` |
| `regions` | the regions to use; **omit** to use the picture's own `regions` from `media.json` |
| `targets` | ids of the regions that are asked (default: all regions) |

| type | label in the app | what the learner does | extra fields |
|---|---|---|---|
| `img_hotspot` | 📍 Find it on the image | taps the place(s) on the picture | `answer: [regionId,…]` (≥1; more = tap all of them), `any: true` (one tap in any answer region is enough, e.g. “tap a vertebra”), `maskLabels: bool` (cover all regions so their labels can't be read), `why: {regionId: "why this tempting place is wrong"}` |
| `img_sequence` | 🧭 Trace the path | taps parts in the right order (flow of blood, data, a reaction pathway…) | `answer: [regionId,…]` in order (2–9) |
| `img_reveal` | 🧩 Reveal & answer | uncovers tiles one by one and answers as early as possible (fewer tiles = more XP) | `options: [str]`, `answer: int` or `[int]` + `"multi": true`, either `grid: [cols, rows]` (auto tiles) or tile `regions`, `start: [regionId]` (tiles open at the start) |
| `img_drag` | 🏷️ Drag the labels | drags label chips onto the covered parts (or taps chip → taps place) | `distractors: [str]` (extra wrong labels), `mask: bool` (default true: cover the targets) |
| `img_label` | ✏️ Label the image | types the name of each covered part | `fuzzy: bool` (default true: tolerate a small typo, the correct spelling is shown), `mask` |
| `img_select` | 🔽 Pick the labels | chooses from a dropdown at each part | `distractors: [str]` (added to the shared list), per-region `options` override, `mask` |
| `img_occlusion` | 🙈 Cover & recall | sees one covered part at a time (optionally its `q`), recalls, reveals, marks ✓ / ✗ | `pass: 0–1` (share of ✓ needed, default 0.8), `order: "listed" \| "random"` |

Rules:
* `answer`, `targets`, `start` refer to existing region ids.
* drag / label / select / occlusion targets need a `label`; labels within one exercise should be distinct.
* Every region lies inside the picture (`0 ≤ x ≤ w`, `0 ≤ y ≤ h`).
* `explain` teaches the whole picture (why each part is where it is, and the tempting mix-ups).

### Example
```json
{ "id": "ch02-e801", "type": "img_drag", "section": "ch02-s04", "difficulty": 2, "tags": ["concept"],
  "media": "heart-frontal", "targets": ["ra", "rv", "la", "lv"], "distractors": ["Pericardium"],
  "q": "Drag the four chambers onto the heart.",
  "explain": "Right side = deoxygenated blood (to the lungs), left side = oxygenated blood (to the body)…" }
```

## 4. Theory block `figure`

```json
{ "t": "figure", "media": "heart-frontal", "caption": "optional (default: the media caption)",
  "regions": "optional — default: the picture's regions", "explore": true }
```
Renders the picture inside a section. With regions it is **explorable**: hover / tap a part to
see its label and note; **🙈 Hide labels** covers every part for an instant self-test.

## 5. Authoring rules (every ingestion) — mandatory

Every time sources are turned into a subject pack (or added to one), the visual layer is built from
**three kinds of pictures — all of them, not one**:

| kind | what | how | `origin` |
|---|---|---|---|
| **Pictures from the sources** | every figure, photo, scan, chart, table-as-image and vector diagram inside the PDFs / files | `tools/extract_images.py scan SOURCE.pdf OUT/` (embedded images + page renders, contact sheet) → `crop` the useful ones at 200 dpi | `source` |
| **Pictures from the web** | photographs **and** diagrams that add information the sources lack (anatomy plates, micrographs, real apparatus, maps, real software screenshots…) — even when the sources have no pictures at all; any licence, source always recorded (§6) | `tools/find_images.py` / connector `noema_image_search` (Bing + DuckDuckGo Images = the whole web, Wikimedia Commons, Openverse, NASA, iNaturalist, Wellcome, museums) → `tools/fetch_image.py` / `noema_image_fetch` (pages and Wikimedia file pages resolved to the picture) | `web` |
| **Drawings & graphs we make** | clean redraws of the sources’ diagrams, process flows, timelines; **function graphs** (γραφικές παραστάσεις) whenever the subject has functions, rates, distributions, kinetics… | `tools/svgkit.py` — `Diagram` and `Plot` (curves, points, intervals → regions) | `drawn` / `plot` |

Rules:
1. **Every picture carries several exercises** — ≥ 3, of ≥ 2 different visual types (e.g. drag the
   names + hotspot a reasoning question + occlusion), plus a `figure` in the section that teaches it.
   Enforced by `"authoring": {"minVisualPerChapter": 3, "minExercisesPerPicture": 3}`.
2. Every chapter: ≥ 1 `figure` and ≥ 3 visual exercises of ≥ 2 visual types.
3. **Information value first.** A picture earns its place only if it teaches something the text
   alone does not (where things are, what they look like, how they connect, how a quantity behaves).
   No decorative stock photos.
4. **High quality.** Rasters ≥ 800 px on the long side (prefer ≥ 1200), sharp, readable labels, no
   watermarks, no heavy JPEG artefacts; crop to the informative part. (`lowResOk: "reason"` only for
   small flat diagrams that stay crisp.) Keep each file ≤ 600 KB (crop; PNG-256 for screenshots, JPEG q85 for photos).
5. **Correct and relevant — verify before use.** Look at every picture yourself (open it), check
   that it shows what the alt text says, that labels/numbers agree with the sources and with
   authoritative references, and that it is about *this* topic at *this* level. Reject anything
   doubtful. Region coordinates are checked by drawing them over the picture before publishing.
6. Pick the exercise type by the skill: **where is it** → hotspot · **what is it** → drag / select /
   label (easy → hard) · **in what order** → sequence · **infer from partial evidence** → reveal ·
   **long-term recall of many parts** → occlusion. Hotspots should need reasoning (“where is the data
   read from?”), not label-reading; use `maskLabels` when labels would give the answer away.
7. Accessibility: meaningful `alt`, readable label sizes (≥ 14 image units at 800 wide), colour is
   never the only cue.

## 6. Where web pictures may come from (licences)

noema-lite is a **personal study app**: you may use **any** picture you find — openly licensed or not —
**as long as its source is recorded**: `url` (the page it came from), `credit` (author / owner) and
`license` (what the page says, e.g. "CC BY-SA 4.0", "CC BY-NC 4.0", "All rights reserved"). The app shows
this under every picture with a link back.

* **Open** licences (`tools/noema_lib.OPEN_LICENSES`: own, CC0, public domain, CC BY, CC BY-SA, Apache-2.0,
  MIT, BSD, OGL, U.S. Government works) can be shared and published freely.
* Everything else (NC, ND, all rights reserved, unknown) is marked **`restricted`** by the build: fine for
  your own study; the app **warns** before you make such a pack public or share it with someone, because
  redistributing it may need the owner’s permission (not legal advice).
* Quality and information value still come first (§5): sharp, correct, relevant, ≥ 800 px.

How to search (engine/imglib.js — one library for the app, the picture service and the connector):
* **The whole web first**: Bing Images and DuckDuckGo Images (what a Google image search shows too) via `find_images.py`,
  the connector's `noema_image_search`, the picture service `/api/imgsearch`, or Claude's own web search for pages with
  figures. Then the open collections below when they fit.
* A **page** is enough: `/api/img`, `noema_image_fetch` and `fetch_image.py` take its main picture (og:image…);
  Wikimedia / Wikipedia file pages (any language, `#/media/File:…`, small thumbnails) become the file itself
  (Special:FilePath / a 1600–2400 px rendering) — fetching the file page as HTML is what used to fail.
* Personal study: any licence; the source is always recorded and non-open pictures are flagged before sharing.

Good places to look:

| subject area | sources |
|---|---|
| anatomy, medicine, biology | Wikimedia Commons (Gray’s Anatomy plates, many CC BY-SA diagrams), OpenStax (CC BY 4.0), Servier Medical Art (CC BY 4.0), NIH / NCI / CDC libraries, Open-i, textbook publishers’ figure pages (restricted) |
| physics, chemistry, earth & space | Wikimedia Commons, NASA, NOAA, USGS, OpenStax, university lecture pages (often restricted) |
| geography, history, art | Wikimedia Commons, Library of Congress, Smithsonian Open Access, museum collections |
| software & data engineering | official docs and blogs (screenshots: usually restricted), open-source project docs (Apache-2.0 / MIT) |

`media.json` for a web picture:
```json
{ "id": "heart-gray", "file": "heart-gray.jpg", "origin": "web", "alt": "…", "credit": "Henry Gray (Gray’s Anatomy, 1918)",
  "license": "Public domain", "url": "https://commons.wikimedia.org/wiki/File:Gray490.png", "retrieved": "2026-10-06", "regions": [ … ] }
```

**Web pictures the app downloads (`"fetch": "app"`).** When the builder's sandbox has no internet (✨ Create
with Claude → *Here in noema-lite*, or a claude.ai plan without network access), the picture is not stored
as a file: the entry has no `file` but the **direct image url** and its **pixel size**; noema-lite downloads
and embeds it when the pack is imported (through `/api/img` if the host blocks browsers), and shows it from
the web until then. Regions use the `w × h` coordinates.
```json
{ "id": "heart-front", "origin": "web", "fetch": "app", "url": "https://upload.wikimedia.org/…/Heart_anterior.jpg",
  "page": "https://commons.wikimedia.org/wiki/File:Heart_anterior.jpg", "retrieved": "2026-10-07", "w": 1600, "h": 1200,
  "alt": "…", "credit": "…", "license": "CC BY-SA 4.0", "regions": [ … ] }
```
