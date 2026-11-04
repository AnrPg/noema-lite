# H5P import into the existing exercise types (P6, docs/adr/001 D12)

`tools/h5p_import.py` (stdlib: zipfile, json, html.parser) turns simple H5P items into noema-lite's **own** exercises — the
app does not play them as H5P (that is the `h5p@1` runtime, docs/activities-dev/h5p.md). Tests: `python3 tests/h5p_import.py`.

## Run
```
python3 tools/h5p_import.py a.h5p b.h5p … --out <subject dir> [--chapter ch07] [--title "…"] [--src <source id>]
                            [--summary-order] [--report report.json]
```
Writes `<out>/chapters/<chapter>.json` (one section per package), the pictures to `<out>/media/` and their entries to
`<out>/media/media.json` (merged: an id already there is kept). Prints `✓`/`✗` per package and the notes; exit 0 when anything
was imported, 2 when nothing (then nothing is written). Then `python3 tools/validate.py <out>/chapters/chNN.json` (or
`build.py`). As a library: `convert(paths, chapter, title, src, summary_order) → (chapter, {id: (media item, bytes)}, report)`.

## Mapping
| H5P | noema | how |
|---|---|---|
| `H5P.MultiChoice` | `mcq` (`multi` when ≥ 2 right) | answers → options; chosen / not-chosen feedback → `why` (missing ones filled); tips → `explain` |
| … with an `H5P.Image` | `img_reveal` (grid 2×2) | the picture travels with the question (an mcq cannot show one); a video / audio is left out with a note |
| `H5P.TrueFalse` | `tf` (`img_reveal` with its picture, options = its True/False words) | feedbackOnCorrect / OnWrong → `explain` |
| `H5P.Blanks` | `cloze` (typed) | `*a/b:tip*` → `[[a\|b]]`, tips → `explain`; all lines in one cloze; case-sensitive items are noted (noema ignores case) |
| `H5P.DragText` | `cloze` with `bank` | `*word*` → `[[word]]`; distractors → `bank` (minus any equal to an answer) |
| … one word per line, 2–4 groups | `bucket` | when ≥ 3 lines each sort ONE word into 2–4 repeated answers and there are no distractors: the line = item, the answer = bucket |
| `H5P.MarkTheWords` | `spotbug` (`lang: "text"`) | one word per line, the marked words are the `bugs` (tap every one; exact set, like H5P); `fix` = the text with them in bold |
| `H5P.DragQuestion` (text draggables) | `img_drag` | with a background picture and ≤ 1 word per zone: zones → rect regions (percent × picture size), label = the word, note = the zone label, words right nowhere → `distractors` |
| | `match` | no picture, one word per zone, 3–7 zones |
| | `bucket` | 2–4 labelled zones, ≥ 3 words (words right nowhere are noted and left out) |
| | `mcq` per word | anything smaller (e.g. 2 zones, 2 words): "Where does **X** go?" over the zone labels |
| `H5P.SingleChoiceSet` | `mcq` per choice | the first answer is the right one (H5P's rule) |
| `H5P.QuestionSet`, `H5P.Column` | their questions | recursively (depth ≤ 3); the intro / text parts → theory `p`; a part that cannot be imported → a note |
| `H5P.Summary` | `mcq` per statement set | first statement right, tip → `explain`; `--summary-order` adds an `order` of the right statements (3–9) |
| `H5P.Dialogcards` | flashcards `chNN-fNNN` | front / back; front tip → `*Hint: …*`; a card picture → a `figure` + an explaining `p` in the section (cards are text only) |
| anything else | — | reported in `unsupported` with the reason, never a crash |

**Why spotbug for MarkTheWords:** it is the only type where the learner taps several items *in their order in the text*
and must hit exactly the marked set; an mcq would shuffle the words and lose the sentence. The words show one per line.

## Every exercise
- ids `chNN-eNNN` in order, `section` = the package's section, `difficulty` 2 (tf 1), `tags: ["concept"]` (`compare` for
  sorting), `think` (recall / discriminate / analyze), `quick` for single-answer mcq and tf.
- `explain` is always there: the H5P feedback when it has some, else the right answer(s) written out.
- `cite`: `{title, author, license, h5p: <file>, src?}` from `h5p.json` (licence + version; `U` → "unknown (undisclosed…)").
- The section opens with a `p`: the title, the author and the licence.

## Text
H5P HTML → the inline format: `strong/b` → `**…**`, `em/i` → `*…*`, `code` → `` `…` ``, block tags and `<br>` → line
breaks, entities decoded; `script`, `style`, `iframe`, `svg`, `video`, `audio` … dropped with their content; everything else
loses its tags. A literal `*` becomes `∗`, a backtick `ʹ`, `[[`/`]]` are split, so text never turns into marks or blanks.
Marks around a blank are dropped. Single-line fields (options, labels, items) are flattened to one line.

## Pictures
Only `png`, `jpg`, `webp` inside the package (`content/…`, no `..`, no URLs; ≤ 5 MB each); SVG is refused (it may carry
script). id = `<title slug>-<sha1 8>`; entry: `origin: "source"`, `alt` (the H5P alt text or a description), `credit` (the
authors), `license`, `w`/`h` (read from the file), `h5p: {package, path}`, `lowResOk` below 800 px.

## Safety
Nothing of the package is run. Only `h5p.json`, `content/content.json` (≤ 8 MB) and the pictures the content names are
read; the libraries are ignored.

## Limits
- Self-containment: an H5P question that leans on a video / audio / outside picture loses it (noted) — check the text stands alone.
- Image draggables in DragQuestion, words right in several zones, per-zone feedback: not imported (reported / noted).
- Blanks' and DragText's per-blank right/wrong feedback (`\+`, `\-`) is dropped; tips are kept.
- No `lr`/`map`: an imported chapter is checked as an import (`subject.authoring.by: "import"` → quality warnings only).
- No JS mirror (the app does not import H5P itself).
