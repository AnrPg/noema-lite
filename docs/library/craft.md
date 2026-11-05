# `craft@1` — handcrafts (`engine/src/48_lib_craft.js`, `NoemaLibCraft`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for the arithmetic, geometry and tables of handcrafts. It covers
knitting and crochet, stitch and colourwork charts, weaving drafts, cross-stitch, patchwork, repeating patterns (frieze and
wallpaper groups, tilings), sewing, woodworking, ceramics (cones, glazes), jewellery metalwork, bookbinding, leathercraft and dyeing.
There is one engine with 13 **modes** (`model.mode`). They share a checker, the expression evaluation, a run finder for floats
(knit colourwork, weaving, cross-stitch), the scene drawing and the table lookups. The Python twin is `tools/lib_craft.py`. It
checks and does not compute, and it embeds **the same JSON** (`DATA`: every mode's schema, its outputs and the name lists; the test
checks that the two copies are identical). The tests are `node tests/lib_craft.js` (187 assertions) and `node tests/enginelib.js`
(JS ↔ Python parity on `tests/fixtures/enginelib/craft.json`, 36 specs). The reference activity is
`tools/activities_examples/satin-move`. The research behind this chapter (scope decisions, the larger glaze, nesting and drafting
engines left for later) is in the project's `engine-library/research/craft.md`.

**Values marked (verify)** were transcribed from the primary source through secondary sources. They are flagged here and in the
code comments, and must be checked against the named primary source before they are used as exam answers. Everything else is
either a definition, a published table fetched for this work (CYC yarn weights, the Orton chart) or a formula whose values the tests
recompute.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "craft@1",
  "params": [ { "id": "s", "kind": "slider", "label": "move", "min": 1, "max": 11, "step": 1, "default": 1 } ],
  "model": { "mode": "weave", "structure": { "type": "satin", "shafts": 8, "move": "s" }, "wpi": 30 },
  "outputs": [ { "id": "regular", "kind": "scalar", "of": "regular" }, { "id": "wf", "kind": "scalar", "of": "warpFloat" },
               { "id": "dd", "kind": "scene", "of": "drawdown" }, { "id": "long", "kind": "scalar", "of": "issue.float-too-long" } ],
  "plots": [ { "kind": "scene", "of": "dd", "title": "drawdownTitle", "height": 360 } ] }
```

- Every number of the model may be a **numx**: a number, or an expression over the spec's names (consts, params, derived), compiled
  once with NoemaExpr. `exprs(spec)` lists them with their paths, so the validators check each name. The engine has no local
  names. `keys(spec)` is always empty: craft@1 labels its scenes with numbers (`v`) or the model's own symbols (`s`: stitch codes).
- **Outputs**: `{id, kind: scalar | series | scene, of}`. `of` must be something the mode computes (§3–§15). Otherwise the error is
  `output`, `outputs[i].of: <mode> computes no <kind> "<of>"`. Every mode also counts its **runtime issues** as scalars
  `issue.<code>`, which a check can grade (`issue.float-too-long == 0`).
- **Runtime issues** (the validity limits) are never a silent wrong number: a value out of the method's range is computed if it
  can be and the issue is counted. A value that cannot be computed is NaN. A run never throws.
- **Limits**: chart ≤ 60 rows × 120 cells; weave ≤ 32 shafts, 64 treadles, 2000 ends/picks in the model, ≤ 400 × 400 computed,
  ≤ 64 × 64 drawn; symmetry ≤ 6 × 6 cells, motif ≤ 64 points; cut list ≤ 60 pieces (exact search ≤ 16 pieces and 200 000 nodes);
  glaze ≤ 16 recipe lines, ≤ 16 own materials of ≤ 20 oxides, batch ≤ 8 materials; sew ≤ 64 points per piece, ≤ 60 rectangles;
  every scene ≤ 2000 items, every series ≤ 2000 values.

### 1.1 Checker codes (`checkSpec`, the same in `tools/lib_craft.py`)

| code | when |
|---|---|
| `format` | `model` is not an object; a shape is not an object or an array |
| `value` | a missing required field, a value of the wrong kind; the cross-checks below |
| `enum` | `mode`, and every field with a fixed set of values (cone names, species, metals, groups…) |
| `size` | a list too long or too short; a chart row of more than 120 cells |
| `unknown-field` (warning) | a field the mode does not know |
| `unknown-symbol` | a chart token that is not a stitch (§4) |
| `unknown-material`, `unknown-oxide` | a glaze material that is neither built in nor in `model.materials`; an oxide name that is not one of the 15 known |
| `output` | an `of` the mode does not compute, or a kind it does not give |

Cross-checks: weave needs a `structure` or a `threading` with a `tieup` and a `treadling`, or with a `liftplan`. No threading or
tie-up entry may exceed `shafts`, and no treadling entry may exceed `treadles` (or the tie-up's length). Chart rows must be texts,
and colour rows only `A–H` and `.`. A glaze `target` needs `batch`. Sew `piece.pts` must be x, y pairs, and `grade.rule` needs a
piece and one dx, dy pair per point. A symmetry `orbifold` must match `[ox*1-9∞]{1,16}`, and `motif` needs ≥ 3 points.

## 2. Modes at a glance

| mode | what | main outputs |
|---|---|---|
| `fiber` | gauge → counts, repeats, even distribution of increases/decreases, shaping schedules, crochet circles, yarn | `castOn`, `gaps`, `shapeEveryA…`, `skeins`, scenes `distribution`, `shaping` |
| `chart` | stitch charts (in/out per row, cables, no-stitch) and stranded colourwork floats | `unbalancedRows`, `maxFloat`, `longFloats`, scene `chart` |
| `weave` | drafts → drawdown, plain/twill/satin, floats, interlacement, sett, warp plan, basket stake parity | `warpFloat`, `regular`, `sett`, `warpEnds`, scene `drawdown` |
| `stitch` | cross-stitch / canvas size, fabric to cut, floss per skein | `widthIn`, `cutW`, `stitchesPerSkein`, scene `layout` |
| `quilt` | HST, QST, setting triangles, geese, quilt size, binding, cut yardage, backing, bias | `hst2`, `qst`, `bindingYards`, scenes `hst`, `layout` |
| `symmetry` | 17 wallpaper + 7 frieze groups drawn from a motif; orbifold cost; classification; vertex types | `copies`, `cost`, `classified`, `tiles`, scene `pattern` |
| `sew` | circle skirts, gathers, pleats, ease, seam allowance, grading, shelf packing | `skirtRadius`, `saArea`, `packLength`, scenes `piece`, `pack` |
| `wood` | board feet, movement, EMC, shelf sag, cut lists, dovetails | `movement`, `emc`, `sag`, `boards`, scenes `cutlist`, `movement` |
| `ceramic` | shrinkage, Orton cones, glaze UMF and batches, calculated expansion | `wet`, `coneTemp`, `umf.<oxide>`, `batch.<i>`, scene `stull` |
| `metal` | ring sizes in 6 scales, AWG / SWG, fineness and alloying, masses | `diameter`, `us`, `awgMm`, `alloyAdd`, scene `ring` |
| `book` | signatures, blanks, imposition, grain, spine, creep | `signatures`, `grainOk`, scene `imposition` |
| `leather` | oz ↔ mm, saddle-stitch thread, holes, SPI | `thread`, `holes` |
| `dye` | depth of shade, stock solution, mordant, bath | `dyeGrams`, `stockMl` |

## 3. `fiber` — knitting and crochet arithmetic

**Model**: `craft` knit | crochet; `unit` cm | in (default cm); `sts`! and `rows` per `over` (default 10); `width`, `length`;
`mult`, `plus` (a repeat `mult·n + plus`); `round` nearest | up | down | even; `patternSts` (the gauge a pattern was written for);
`category` 0–7 (CYC); `distribute {from!, change!, kind: inc | dec | dec2, work: flat | round}`;
`shape {fromSts!, toSts!, overRows!, perEvent (2), rsOnly}`; `yarn {swatchGrams!, swatchArea!, projectArea!, metersPerGram,
skeinMeters, safety %}`; `circle {start (6), rounds!}`.

**Methods**
- Cast on: `N* = width·sts/over`, then the repeat: `k = round((N* − plus)/mult)` by the mode, `castOn = mult·k + plus`, the
  achieved width and its error. `even` takes the nearest even count of the repeat (a tie goes up). A non-integer N* gives `rounded`.
- **Even distribution** (the main algorithm). In the round: Bresenham gaps `⌊(i+1)N/k⌋ − ⌊iN/k⌋`, every gap ⌊N/k⌋ or ⌈N/k⌉.
  Flat: centred positions `round((i + ½)N/k)`, so the selvedges get half gaps and there are k + 1 gaps. Decreases consume 2 (k2tog)
  or 3 (sk2p) stitches ending at each position. If a gap is smaller than that, or k·per > N, the code is `consumes-too-many`. More
  single increases than stitches gives `impossible`.
- **Shaping** (d events over R rows): `a = ⌊R/d⌋`, `b = R mod d`. Work d − b events every a rows, then b events every a + 1 rows
  (`b(a+1) + (d−b)a = R`). `rsOnly` halves R, so the intervals are even (an odd R gives `rounded`). `(from − to)/perEvent`
  non-integer gives `non-integer`, and d > R gives `impossible`. The series `shapeRows`/`shapeSts` and the scene `shaping` draw
  the staircase against the straight target line.
- Crochet circle: round n has n·s₀ stitches (sc 6, hdc 8, dc 12). The circumference grows 2π·h per round of height h.
- Yarn: grams = swatch grams × project area / swatch area; metres; skeins = ⌈m·(1 + safety)/skein⌉.
- **CYC Standard Yarn Weight System** (craftyarncouncil.com/standards/yarn-weight-system, fetched 2026-11-05; "guidelines only").
  Knit sts per 4 in / 10 cm: 0 Lace 33–40, 1 Super Fine 27–32, 2 Fine 23–26, 3 Light 21–24, 4 Medium 16–20, 5 Bulky 12–15,
  6 Super Bulky 7–11, 7 Jumbo ≤ 6. Crochet sc: 32–42 (lace: double crochets), 21–32, 16–20, 12–17, 11–14, 8–11, 7–9, ≤ 6. A gauge
  outside the category is `range` (a count, not an error). The CYC announces a size 8 and new symbols, so the table may grow.

**Outputs**: scalars `castOnRaw castOn achievedWidth widthError rowCount gauge10 cycMin cycMax gaugeInRange sizeFactor distResult
distGapMin distGapMax shapeEvents shapeEveryA shapeTimesA shapeEveryB shapeTimesB grams meters skeins circleSts circleTotal`;
series `gaps positions shapeRows shapeSts circleRounds`; scenes `distribution shaping`; issues `consumes-too-many impossible
non-integer range rounded`.

## 4. `chart` — stitch charts and colourwork

**Model**: `rows`! (1–60 texts, row 1 first); `kind` stitch | color; `work` flat | round; `castOn`; `maxFloat` (5 sts),
`gauge` (sts per 10 cm) and `maxFloatCm`: the limit is the smaller of the two; `repeat` (the colour row repeated, ≤ 8 for the check).

- **Stitch rows** are tokens separated by spaces, with an optional repeat `k*3`. Symbols (CYC *Knit and Crochet Chart Symbols*;
  B. G. Walker, *Charted Knitting Designs*, 1972) are listed as consumed→produced: k, p, sl, bobble 1→1; yo, m1, m1l, m1r 0→1;
  k2tog, ssk, skp, p2tog 2→1; k3tog, sssk, sk2p, s2kp, cdd 3→1; kfb 1→2; ns (no stitch, grey) 0→0; cables `cA/B l|r`, so c2/2l
  = C4F = 2/2 LC (A + B cells, A + B → A + B); crochet ch 0→1, slst, sc, hdc, dc, tr 1→1, sc2tog, dc2tog 2→1, inc 1→2.
- **Balance**: row r consumes `inᵣ`, which must equal the previous row's `out` (row 1: `castOn` when given). Otherwise the code is
  `unbalanced-row`, with `firstUnbalanced`.
- **Reading**: flat RS rows (odd) are worked right→left, WS rows left→right; in the round every row is right→left. The scene puts
  each row's first worked stitch on its starting side and the row number beside it.
- **Colour rows**: letters A–H (. = none). For every colour of a row, the float is the run of stitches in other colours (the
  shared run finder, cyclic in the round, so a float wraps the seam). A float longer than the limit is `float-too-long`.
  `colorsMax` counts the colours per row (stranded knitting normally uses 2).

**Outputs**: scalars `rowsCount width stitchesStart stitchesEnd unbalancedRows firstUnbalanced maxFloat longFloats colorsMax
floatLimit`; series `rowNo rowIn rowOut rowFloat`; scene `chart`; issues `unbalanced-row float-too-long consumes-too-many`.

## 5. `weave` — drafts, drawdowns, floats, sett, warp plans, baskets

**Model**: either `structure {type!: plain | twill | satin, up, down (twill a/b), shafts, move (satin), face warp | weft, ends,
picks}`, or a draft: `shafts`, `treadles`, `threading` (end → shaft), `tieup` (treadle → shafts raised), `treadling` (pick →
treadles) or `liftplan` (pick → shafts); `shed` rising | sinking; `repeat` (cyclic floats, default true); `maxFloat`; `wpi`;
`colors {warp, weft}` (role indices 0–7); `warp {unit in | cm, width!, length!, epi!, drawIn %, shrink %, takeUp %, waste, pieces,
ppi}`; `basket {stakes | diameter + spacing}`.

- **Drawdown** (warp up = 1): `lift[p] = ⋃ tieup[t]` for the treadles of pick p; `D[p][e] = threading[e] ∈ lift[p]` (rising shed).
  A sinking-shed tie-up marks the shafts that sink, so D is the complement. The conventions follow W. Oelsner, *A Handbook of
  Weaves* (1915); D. Strickler, *A Weaver's Book of 8-Shaft Patterns* (1991); the WIF 1.1 exchange format (1997). The scene draws
  the North American layout: threading above, lift plan on the right, first pick at the top.
- **Structures**: plain `(e + p) mod 2`; twill a/b `((e − p) mod n) < a`; satin: one interlacing per row at `e ≡ s·p (mod n)`
  (warp face: everything else up; weft face, a sateen: only that point up). A satin is **regular** iff `gcd(s, n) = 1` and
  `s ∉ {1, n − 1}`, n ≥ 5. Counting s and n − s as the same satin, there are `(φ(n) − 2)/2` distinct ones, and none on 4 or 6
  shafts (`impossible`: the 4-shaft "satin" is the crowfoot, the 6-shaft one is irregular). The floats of a structure are measured
  on one n × n repeat (cyclic), whatever `ends` and `picks` are drawn.
- **Floats** (the shared run finder): the warp float is the longest run of 1s down an end, the weft float the longest run of 0s
  along a pick. A run longer than `maxFloat` is `float-too-long`. An end or pick that never changes is `no-interlace`.
  `warpFaced` is the mean of D. `interlace` is the mean number of interlacements per pick.
- **Sett** (T. R. Ashenhurst, 1885: the E/(E+I) rule): `EPI = WPI·E/(E + I)`, with E ends in the repeat and I the interlacements of
  one pick, measured from the drawdown. Plain WPI/2, 2/2 twill 2/3·WPI, 2/1 twill 3/5, 5-satin 5/7.
- **Warp plan**: width in reed = `width/((1 − drawIn)(1 − shrink))`, ends = ⌈width in reed·EPI⌉; woven length =
  `length·pieces/((1 − takeUp)(1 − shrink))`; warp length = woven + loom waste; warp total = ends × warp length (and in yd or m:
  `warpTotalLong`); weft = PPI·woven·width·(1 + takeUp). Take-up, shrinkage and draw-in are loom and yarn data (typically ~10 %), so
  they are inputs and nothing is assumed.
- **Basket** (randing with one weaver): the stakes must be odd (`parity`). From a base diameter: `⌈πD/spacing⌉`, made odd.

**Outputs**: scalars `ends picks warpFloat weftFloat warpFaced noInterlace longFloats regular satins interlace sett widthInReed
warpEnds wovenLength warpLength warpTotal warpTotalLong weftTotal stakesNeeded parityOk`; scene `drawdown`; issues
`float-too-long no-interlace impossible parity`.

## 6. `stitch` — cross-stitch and canvas

**Model**: `w`!, `h`! (stitches), `count`! (per inch, or per 10 cm with `unit: cm`), `over` (2 for evenweave over two), `margin` (3 in
/ 7.5 cm), `fabricW`, `fabricH`, `strands` (2), `skein` (8 m: DMC / Anchor stranded cotton, 6 strands), `waste` % (50), `stitches`.

Size = stitches/(count/over). Cut = size + 2·margin. A fabric too small is `impossible`. Floss per full cross, per strand:
`(2√2 + 2)·s` (front: two diagonals; back: two verticals when worked in rows), with s = 25.4/count mm. Crosses per skein =
`6·skein/(strands·ℓ·(1 + waste))`. With 50 % waste this reproduces the common "≈ 1800 crosses per skein, 14-count, 2 strands" rule.
A count outside 3–40 is `range`.

**Outputs**: scalars `effCount widthIn heightIn widthCm heightCm cutW cutH fits perStitchMm stitchesPerSkein skeins`; scene
`layout`; issues `impossible range`.

## 7. `quilt` — patchwork cutting

**Model**: `finished` (3), `sa` (¼ in), `cols`, `rows`, `block`, `sashing`, `border`, `binding {extra 12, strip 2½, wof 40}`,
`cut {count!, w!, h!, wof 40}`, `backing {margin 4, wof 40}`, `bias {square!, strip!}`, `geese` (goose height).

The exact additions come from offsetting each finished shape by sa (scaling about its incentre). The cuts are those exact values
rounded **up to the next ⅛ in** (a rotary-ruler line). Standard practice and H. & C. Hargrave, *Quilter's Academy* (2009–) give
the same rounded rules:

| unit | exact | rule (sa = ¼) |
|---|---|---|
| square | f + 2sa | f + ½ |
| HST 2-at-a-time | f + sa(2 + √2) = f + 0.8536 | f + ⅞ |
| HST 4-at-a-time | √2·(f + sa(2 + √2)) | (f + ⅞)·1.414, up to ⅛ |
| HST 8-at-a-time | 2·(HST 2) | 2f + 1¾ |
| QST | f + sa(2 + 2√2) = f + 1.2071 | f + 1¼ |
| side setting triangle (square cut twice) | f√2 + sa(2 + 2√2) | f√2 + 1¼ |
| corner triangle (square cut once) | f/√2 + sa(2 + √2) | f/√2 + ⅞ |
| flying geese 4-at-a-time | large 2h + 1¼, small h + ⅞ | |

Quilt size `cols·block + (cols − 1)·sashing + 2·border`. Binding = perimeter + extra, strips = ⌈length/WOF⌉, yards up to ⅛.
Cut yardage: pieces per strip ⌊WOF/w⌋ (both orientations tried; a piece wider than the WOF is `impossible`). Backing: the
cheaper of vertical and horizontal panels. Continuous bias ≈ s²/w.

**Outputs**: scalars `square hst2 hst2Exact hst4 hst4Exact hst8 qst qstExact diagonal sideSetting sideSettingExact corner
cornerExact geeseLarge geeseSmall quiltW quiltH bindingLength bindingStrips bindingYards perStrip strips cutYards backingYards
backingPanels biasLength`; scenes `hst layout`; issues `impossible range`.

## 8. `symmetry` — friezes, wallpaper groups, tilings

**Model**: `group` (p1 … p6m, or a frieze by Conway's name: hop, step, sidle, spinning-hop, spinning-sidle, jump, spinning-jump) or
`groupIndex` (0–16 wallpaper, 17–23 friezes: a slider); `motif` (fractional x, y pairs; a built-in asymmetric motif by default);
`cells` (1–6); `b`, `angle` (oblique and rectangular lattices); `orbifold` (a signature to cost); `classify {rot!, mirrors,
twoDirs, onMirrors, glide}`; `classifyFrieze {vmirror, hmirror, turn, glide}`; `vertex` (polygon sizes around a vertex).

- **Groups**: the general positions of the 17 plane groups from *International Tables for Crystallography* Vol. A (plane groups
  1–17; hexagonal axes at 120°; c-groups add (½, ½)); copies per cell p1 1 … p6m 12. The 7 frieze groups use
  J. H. Conway, H. Burgiel, C. Goodman-Strauss, *The Symmetries of Things* (2008). The test proves every one of the 24 op tables a
  closed group modulo the lattice. It also checks the classic p3m1 / p31m mix-up: in p3m1 the 3-fold centre (⅓, ⅔) lies on a
  mirror, in p31m it does not. The scene draws each image of the motif, with mirror images in another role.
- **Orbifold cost** (Conway's "magic theorem"): o = 2, * = 1, x = 1, a digit n before any * = (n − 1)/n, after * = (n − 1)/2n,
  ∞ = 1 before and ½ after. A plane group costs exactly 2; anything else is `not-a-group` (> 2 hyperbolic, < 2 spherical).
- **Classification**: the flowchart of D. Washburn & D. Crowe, *Symmetries of Culture* (1988; also D. Schattschneider, Amer. Math.
  Monthly 85, 1978). `classified` is an index into the 24 names. A rotation order other than 1, 2, 3, 4, 6 is `not-a-group` (the
  crystallographic restriction).
- **Vertex types**: the angle sum Σ(n − 2)·180/n; `tiles` = 1 only for the 11 uniform tilings (3⁶, 4⁴, 6³, 3⁴.6, 3³.4², 3².4.3.4,
  3.4.6.4, 3.6.3.6, 3.12², 4.6.12, 4.8²), in any rotation or reflection. 5.5.10, 3.7.42 and the others of the 21 angle-valid types
  fit one vertex but do not tile (B. Grünbaum & G. C. Shephard, *Tilings and Patterns*, 1987, §2.1). 3⁴.6 is `chiral`.
- Out of scope: detecting the group of a picture (use `classify`), colour-swapping (two-colour) groups, aperiodic tilings.

**Outputs**: scalars `groupIdx copies cost isPlane classified frieze vertexSum angleOk tiles chiral`; scene `pattern`; issue
`not-a-group`.

## 9. `sew` — skirts, ease, seam allowance, grading, layout (bounded)

**Model**: `skirt {waist!, length!, fraction 1}`, `gather {finished!, ratio!}`, `pleats {finished!, depth!, count!}`, `ease {body!,
ease!, stretch %}`, `piece {pts! (x, y pairs), sa!}`, `grade {rule! (dx, dy per point per size), steps}`, `pack {width!, rects!
[[w, h], …]}`.

Circle skirt `r = W/(2πf)`, hem `2π(r + L)f`, and the bounding box of the annular sector (`skirtW`, `skirtH`). Gathers `f·ratio`.
Knife pleats `f + 2·depth·count`. Ease: garment = body + ease. Negative ease needs a stretch fabric (`ease ≥ −stretch·body`), else
`range`. **Seam allowance**: a mitred outward offset, exact for a convex piece. A concave piece is reported (`concave`) and its
offset is only approximate, because no polygon-clipping library is bundled (Clipper's Boost licence was not approved). Grading moves
each point by k·(dx, dy) (industry grade rules: J. Price & B. Zamkoff, *Grading Techniques for Fashion Design*). The scene draws
the nest of sizes. Layout: first-fit-decreasing-height shelves of bounding rectangles. This is an estimate of a marker, not a nest:
`packEfficiency`, and the area lower bound `packLower`. Body-size standards (ISO 8559-1/-2:2017, ISO 8559-3:2018, ASTM D5585,
EN 13402) are paid documents, so no size tables are bundled and authors give the measurements.

**Outputs**: scalars `skirtRadius skirtW skirtH hem gather pleats garment easeOk area saArea perimeter concave packLength
packEfficiency packLower`; scenes `piece pack`; issues `concave impossible range`.

## 10. `wood` — board feet, movement, EMC, sag, cut lists, joinery

**Model**: `species` (20, below), `width`, `mcFrom`, `mcTo` (%), `cut` flat | quarter, `board {t! (in, quarters: 8/4 = 2), w! (in),
l! (ft)}`, `emc {tempF!, rh! %}`, `shelf {t!, w!, span! (in), load! (lb/ft), e (psi), creep (1)}`, `cutlist {stock!, kerf ⅛,
pieces!}`, `dovetail` (n of 1:n).

- Board feet `t·w·l/12` (NHLA quarters), m³ = BF × 0.002 359 74.
- **Movement** (USDA FPL *Wood Handbook*, FPL-GTR-282, 2021: ch. 13 dimensional change coefficients): `ΔD = D·C·(M_to − M_from)`,
  C = C_T flatsawn, C_R quartersawn, valid 6–14 % MC (outside: `extrapolated`). Over the full range, ch. 4: `S_M = S₀(30 − M)/30`
  below the fibre saturation point (≈ 30 %), and the width from `S_M` (`movementFull`, `shrinkAt`). Above the FSP nothing moves:
  the MC is clamped and the code is `beyond-fsp`.
- **EMC** (W. T. Simpson 1973, Hailwood–Horrobin; Handbook eq. 4-5; T in °F, h = RH/100): `W = 330 + 0.452T + 0.00415T²`,
  `K = 0.791 + 4.63e−4T − 8.44e−7T²`, `K₁ = 6.34 + 7.75e−4T − 9.35e−5T²`, `K₂ = 1.09 + 2.84e−2T − 9.04e−5T²`,
  `EMC = 1800/W·[Kh/(1 − Kh) + (K₁Kh + 2K₁K₂K²h²)/(1 + K₁Kh + K₁K₂K²h²)]`. It reproduces the Handbook's EMC table at 70 °F
  (6.2/9.2/12.0/16.0/20.5 % at 30/50/65/80/90 % RH). Outside 30–210 °F the code is `extrapolated`, and RH outside 0–100 is `range`.
  The series `emcRh`, `emcCurve` cover RH 0–98 %.
- **Shelf sag** (simply supported, uniform load): `δ = 5wL⁴/(384EI)·creep`, `I = bt³/12`, E from the species (12 % MC, Handbook
  ch. 5). The limit is 0.02 in per foot of span (the "Sagulator" convention, not a standard). Under a sustained load wood creeps
  about 1.5–2×, so use `creep`.
- **Cut list** (1-D cutting stock): first-fit decreasing, each cut after the first in a board costs a kerf. The lower bound is
  `⌈(Σℓ + kerf·n)/(stock + kerf)⌉`. `boardsOpt` is exact (branch and bound) for ≤ 16 pieces within 200 000 nodes, otherwise NaN. A
  piece longer than the stock is `impossible`. 2-D sheet nesting is out of scope.
- Dovetail angle `atan(1/n)`: 1:6 softwood 9.46°, 1:8 hardwood 7.13°.

**Species** (S_R, S_T, S_V green → oven-dry %; C_R, C_T per % MC; E Mpsi at 12 %). **All (verify) against GTR-282 Tables 4-3/4-4,
13-5 and 5-3a.** One secondary source gives C_R 0.00180 for northern red oak (the white-oak value). The values used:

| species | S_R | S_T | S_V | C_R | C_T | E |
|---|---|---|---|---|---|---|
| ash-white | 4.9 | 7.8 | 13.3 | 0.00169 | 0.00274 | 1.74 |
| basswood | 6.6 | 9.3 | 15.8 | 0.00230 | 0.00330 | 1.46 |
| beech | 5.5 | 11.9 | 17.2 | 0.00190 | 0.00431 | 1.72 |
| birch-yellow | 7.3 | 9.5 | 16.8 | 0.00256 | 0.00338 | 2.01 |
| cherry-black | 3.7 | 7.1 | 11.5 | 0.00126 | 0.00248 | 1.49 |
| hickory-shagbark | 7.0 | 10.5 | 16.7 | 0.00259 | 0.00411 | 2.16 |
| maple-sugar | 4.8 | 9.9 | 14.7 | 0.00165 | 0.00353 | 1.83 |
| maple-red | 4.0 | 8.2 | 12.6 | 0.00137 | 0.00289 | 1.64 |
| oak-red (northern) | 4.0 | 8.6 | 13.7 | 0.00158 | 0.00369 | 1.82 |
| oak-white | 5.6 | 10.5 | 16.3 | 0.00180 | 0.00365 | 1.78 |
| walnut-black | 5.5 | 7.8 | 12.8 | 0.00190 | 0.00274 | 1.68 |
| yellow-poplar | 4.6 | 8.2 | 12.7 | 0.00158 | 0.00289 | 1.58 |
| douglas-fir (coast) | 4.8 | 7.6 | 12.4 | 0.00165 | 0.00267 | 1.95 |
| pine-white (eastern) | 2.1 | 6.1 | 8.2 | 0.00071 | 0.00212 | 1.24 |
| pine-ponderosa | 3.9 | 6.2 | 9.7 | 0.00129 | 0.00216 | 1.29 |
| redwood (old-growth) | 2.6 | 4.4 | 6.8 | 0.00120 | 0.00205 | 1.34 |
| cedar-western-red | 2.4 | 5.0 | 6.8 | 0.00111 | 0.00234 | 1.11 |
| spruce-sitka | 4.3 | 7.5 | 11.5 | 0.00148 | 0.00263 | 1.57 |
| mahogany (imported) | 3.0 | 4.1 | 7.8 | — | — | 1.50 |
| teak (imported) | 2.5 | 4.0 | 7.0 | — | — | 1.55 |

Mahogany and teak have no coefficients: the C form gives `out-of-table`, while the S₀ form works.

**Outputs**: scalars `boardFeet cubicMeters cR cT movement movementFull shrinkAt emc sag sagLimit sagOk boards boardsOpt lowerBound
utilisation dovetailDeg`; series `emcRh emcCurve`; scenes `cutlist movement`; issues `beyond-fsp extrapolated impossible range
out-of-table`.

## 11. `ceramic` — shrinkage, cones, glazes

**Model**: `fired`, `shrink` % (or `dry` % and `fire` %), `cone` (022 … 01, 1 … 14, with 05.5 and 5.5) or `coneIndex` (0–37),
`rate` °C/h (60), `type` ss | ssfe | large | largefe | small, `tempC`, `recipe [{mat!, w!}]`, `materials {name: {oxide: wt %, LOI}}`,
`target {oxide: UMF}`, `batch [material, …]`, `expansion` et | appen, `bodyCoe`.

- **Shrinkage**: total `1 − (1 − dry)(1 − fire)`; wet size `fired/(1 − s)` (not `fired·(1 + s)`); volume `1 − (1 − s)³`.
  s ≥ 100 % is `impossible`.
- **Orton cones** (The Edward Orton Jr. Ceramic Foundation, *Temperature Equivalent Chart for Orton Pyrometric Cones 022–14*). The
  °F chart at 27/108/270 °F/h (= 15/60/150 °C/h, over the last 100 °C of the firing) is converted here to °C as `(F − 32)/1.8`,
  rounded (Orton's own °C chart may differ by ±1 °C). Self-supporting regular and iron-free cones (iron-free for reduction, cones
  010–3), large regular and iron-free (60 and 150 °C/h; large 13 and 14 have other compositions), small (300 °C/h). Between rates
  the temperature is linear in log(rate). Outside 15–150 °C/h the code is `extrapolated`, and a cone or temperature outside the
  chart is `out-of-table`. `coneAt` + `coneFrac` invert the chart at a temperature: 1230 °C at 60 °C/h is cone 6 + 8/17. Cone
  numbers are signed in the series (022 = −22, 05.5 = −5.5). Reference: cone 6 = 1222 °C and cone 10 = 1285 °C at 60 °C/h
  (self-supporting).
- **Unity molecular formula** (Seger): the moles of each oxide from the recipe, divided by the sum of the fluxes (Li₂O, Na₂O, K₂O,
  MgO, CaO, SrO, BaO, ZnO, PbO). No flux gives `unity-off`. Outputs are `umf.<oxide>`, the analysis `wt.<oxide>`, Si:Al and the
  fired yield. The built-in materials are **theoretical minerals only**: silica, whiting, wollastonite, kaolin, potash and soda
  feldspar, talc, dolomite, zinc oxide, magnesium, strontium, barium and lithium carbonate, spodumene. Real materials (Custer,
  EPK, frits) vary by lot and their databases carry licences (Digitalfire ©; Glazy CC BY-NC-SA), so authors give analyses in
  `materials`. Molar masses come from the IUPAC 2021 standard atomic weights.
- **Batch from a UMF**: least squares on the moles of oxide per gram of each batch material. An exact solution with negative
  amounts means the target is unreachable with those materials (`negative-batch`). The non-negative best fit (Lawson–Hanson NNLS,
  1974) is then given with its relative residual `batchResidual`.
- **Calculated expansion** (comparative, not a lab CTE): English & Turner (1927), ppm/K per unit weight fraction: SiO₂ 0.50,
  Al₂O₃ 1.40, B₂O₃ −6.53, Na₂O 41.6, K₂O 39.0, CaO 16.3, MgO 4.5, BaO 14.0, ZnO 7.0, PbO 10.6. Appen, per unit mole fraction: Na₂O
  39.5, K₂O 46.5 (42 if Na₂O ≤ 1 mol %), Li₂O 27, CaO 13, MgO 6, BaO 20, SrO 16, ZnO 5, Al₂O₃ −3, ZrO₂ −6, Fe₂O₃ 5.5, TiO₂ 3
  (simplified), SiO₂ 3.8 below 67 mol % else 10.5 − 0.1·[SiO₂], PbO 13 or 11.5 + 0.5·ΣR₂O, B₂O₃ −5 (simplified from Appen's
  F-dependent term). Both sets come via glassproperties.com "Old Thermal Expansion Models". `glazeMinusBody` > 0 means the glaze
  is in tension (a crazing risk); very negative means shivering. Limit formulas and Stull's regions are author data. The `stull`
  scene plots the glaze on Stull's axes (1912: SiO₂ against Al₂O₃).

**Outputs**: scalars `wet totalShrink volShrink coneTemp coneAt coneFrac fluxSum siAl firedYield expansion glazeMinusBody
batchResidual umf.<oxide> wt.<oxide> batch.<0–7>`; series `coneNo coneTemps`; scene `stull`; issues `unity-off negative-batch
out-of-table extrapolated impossible`.

## 12. `metal` — ring sizes, gauges, fineness, masses

**Model**: `size` + `scale` us | uk | iso | jp | ch | mm (diameter), `thickness`, `width`, `metal` (15) or `density`, `awg`, `swg`,
`wireLength` (mm), `karat`, `alloy {mass!, from!, to!, add}` (fineness ‰).

- Ring sizes: **ISO 8653:2016** gives the inner circumference in mm. US: `d = 11.63 + 0.8128·n` mm (the industry convention;
  sources differ by ±0.2 mm). **(verify)** UK/Ireland/Australia (BS 6820:1996, withdrawn): `C = 37.5 + 1.25·(i − 1)` mm with A = 1
  (N½ = 14.5 ≈ US 7). **(verify)** Japan: `d = 13 + (n − 1)/3` mm. Switzerland: C − 40. Every scale is converted to the others.
  Outside a scale's usual range the code is `out-of-table`.
- Blank length `π(d + t)` (the neutral axis), plus a joint allowance of your own. Band volume `π(d + t)·t·w` and mass.
- **AWG** (ASTM B258): `d = 0.127·92^((36 − n)/39)` mm, 0000 = −3. **SWG** (BS 3737:1964, withdrawn; table 7/0 = −6 … 50 **(verify)**).
  A non-integer SWG is `rounded`, outside the table `out-of-table`.
- Fineness `k/24·1000`. Alloying down `x = m(F₁ − F₂)/(F₂ − F_a)`, up `x = m(F₂ − F₁)/(F_f − F₂)` (impossible combinations give
  `impossible`). Densities (g/cm³): fine gold 19.32, fine silver 10.49, sterling 10.36, copper 8.96, titanium 4.51. Alloys are
  typical values, since they depend on the alloy **(verify)**: 22 k 17.8, 18 k 15.5, 14 k 13.1, 9 k 11.2, Britannia 10.43, Pt 950
  20.7, Pd 950 12.0, brass 8.5, bronze 8.8, steel 7.85.

**Outputs**: scalars `diameter circumference us uk iso jp ch blank bandVolume bandMass density awgMm swgMm wireMass fineness
alloyAdd`; scene `ring`; issues `out-of-table impossible rounded`.

## 13. `book`, 14. `leather`, 15. `dye`

- **book** `{pages!, folds (1–4), sheetsPerSig, caliper (0.1 mm), swell, grain long | short, sheet}`. Folded f times: 2^(f+1) pages
  per signature (or 4 per nested sheet); signatures, blanks, leaves, spine = leaves·caliper + swell·signatures, creep ≈
  (sheets − 1)·caliper. The grain must run parallel to the spine (the last fold): short grain for odd f, long for even
  (`grain-wrong`). The `imposition` scene shows sheet i of a signature of nested folios: front [P − 2i | 2i + 1], back
  [2i + 2 | P − 2i − 1] (A. Watson, *Hand Bookbinding*, 1963). Quarto and octavo sheet layouts (heads up and down) are not drawn.
- **leather** `{oz, seam, pitch, thickness, tail}`: 1 oz = 1/64 in. Holes = seam/pitch + 1 (a non-integer gives `non-integer` and
  the adjusted pitch). Saddle-stitch thread `2(L + N·T) + 2·tail` with the 4× rule of thumb beside it (Al Stohlman, *The Art of
  Hand Sewing Leather*, 1977). A thickness ≥ pitch is `range`.
- **dye** `{wof!, dos %, stock %, mordant %, liquor}`: dye g = DOS·WOF; stock ml = g/(c/100); mordant g; bath litres (J. Dean,
  *Wild Color*, 2010; C. Boutrup & C. Ellis, *The Art and Science of Natural Dyes*, 2018). DOS outside 0–100 % is `range`. Colour
  prediction (Kubelka–Munk) is not part of craft@1.

## 16. Reference values the tests assert (`tests/lib_craft.js`)

fiber: 20 sts/4 in × 38 in = 190; 22/10 cm × 54 cm → 118.8 → 119 (54.09 cm), 4n+2 → 118; 8 increases over 100: gaps 12,13,… /
flat positions 6,19,31,44,56,69,81,94; 8 k2tog over 100 → 92; 60 → consumes-too-many; 8 events over 50 rows = 6 × every 6 +
2 × every 7; 5 over 36 = 4 × 7 + 1 × 8; sc circle round 10 = 60; yarn 533.3 g, 1173.3 m, 6 (7 with 10 %) skeins; CYC category 4 =
16–20. chart: in/out of lace rows, unbalanced rows, a 6-st float > 5, a 2.5 cm limit = 7 sts at 28/10 cm, cyclic floats. weave:
2/2 twill floats 2; 3/1 floats 3/1, 0.75; regular satins (φ(n) − 2)/2 = 1, 2, 1, 1 for n = 5, 7, 8, 12, none for 4 and 6; 5-satin
floats 4/1; EPI at WPI 24 = 12/16/14.4/17.14; 20 in × 72 in warp = 24.69 in, 297 ends, 956.1 yd; 16 stakes parity. stitch:
140 × 100 on 14 = 10 × 7.14 in, 8.760 mm per cross, 2740/1826 per skein. quilt: HST 3⅞ (exact 3.8536), QST 5¼ (5.2071), 12 in
on point 16.97 / 18¼ / 9⅜, binding 276 in / 7 strips / ½ yd, 40 squares ⅝ yd, bias 518.4 in, backing 3⅞ yd. symmetry: the 17 +
7 signatures cost 2, 22222 = 5/2, 2*2 = 7/4; copies 1/4/8/8/12; all op tables closed; p3m1 vs p31m; flowchart; 4.8.8 tiles,
5.5.10 and 3.7.42 do not; 3⁴.6 chiral. sew: r = 4.456/8.913/17.825 in for a 28 in waist; offsets of a square and a triangle; FFDH
40. wood: 8 and 4.583 BF; red oak 0.2657 / 0.1138 in; EMC table at 70 °F; S_M 5.16 %; shelf 0.0570 in; cut list 3 boards; FFD 3 vs
exact 2; 9.46°/7.13°. ceramic: 11.364 cm; 31.85 %; 12.58 %; Orton 1222/1285/1063/1077/1185/1243 °C; Leach 4321 UMF K₂O 0.2645,
CaO 0.7355, Al₂O₃ 0.4071, SiO₂ 3.710, yield 89.81 %; feldspar 16.92/18.32/64.76 %; batch 47.31/19.85/7.31/25.53 %; negative-batch;
unity-off; E&T 5.49. metal: US 7 = 17.32 mm / 54.41 mm, UK N½ 54.375, blank 59.12; AWG 10…36; SWG 18/20/7-0; 750/583.3/375;
alloying 3.333/2.821/6.6 g; sterling band 3.675 g; AWG 18 Cu 7.375 g/m. book: 13 octavo signatures + 8 blanks, imposition
16|1 2|15 and 10|7 8|9, grain rules, spine 16 mm, creep 0.7 mm. leather: 1.5875 mm, 76 holes, 1508 mm. dye: 200 ml, 125 ml.
The adapter, the Worker source in a fresh context, a typical run < 50 ms, the worst allowed (400 × 400 drawdown, 16-piece exact cut
list, 6 × 6 p6m) < 2 s.

## 17. Left out, and why

Full glaze chemistry (real materials database, limit formulas per cone, optimisation), true 2-D nesting of fabric markers and
sheet goods, sewing block drafting with curves, colour mixing (Kubelka–Munk, ΔE2000), multi-layer and Jacquard weaving, two-colour
symmetry groups, chart-from-image and WIF import are each a separate engine or a v2 (see the research note). They need large
licensed data, optimisers without a time bound, or curve geometry. No external dependency is bundled: Clipper (polygon offsets)
was not approved (Boost licence), so concave seam allowances are reported as approximate.
