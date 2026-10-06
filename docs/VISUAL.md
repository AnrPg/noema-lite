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

## 5. Authoring rules (every ingestion)

1. Every chapter gets **≥ 1 `figure`** and **≥ 3 visual exercises using ≥ 2 different visual
   types** (enforced when `subject.json` has `"authoring": {"minVisualPerChapter": 3}`, which
   `tools/new_subject.py` sets by default). Prefer more: one well-made picture can serve 3–4
   exercises of different types.
2. Draw what the source shows or describes: structures, architectures, flows, timelines,
   maps, apparatus, graphs. Faithful to the source; simplify, never invent.
3. Pick the type by the skill: **where is it** → hotspot · **what is it** → drag / select /
   label (easy → hard) · **in what order** → sequence · **can you infer from partial evidence**
   → reveal · **long-term recall of many parts** → occlusion.
4. Hotspot questions should require reasoning ("where is the data actually read from?"), not
   just reading a label; use `maskLabels` when the labels would give the answer away.
5. Accessibility: meaningful `alt`, readable label sizes (≥ 14 image units at 800 wide),
   colour is never the only cue.
6. Only use images you are allowed to: own drawings (svgkit), CC0 / CC BY with `credit`.
