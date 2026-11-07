# `anatomy@1` — computable anatomy: lesions, relations, paths, ranges of motion, biomechanics, regions, the visual pathway, the cord (`engine/src/48_lib_anatomy.js`, `NoemaLibAnatomy`)

An engine of the library (`docs/INTERACTIVE_LIBRARY.md`) that turns anatomy from lists into a **model the learner can question**.
Cut a nerve at a level, and it says which muscles are paralysed or weak, which movements, reflexes, skin areas and functions are
lost, and which signs appear. Ask a relation and it answers 1, 0, or "not curated". Trace blood, lymph or a nerve fibre from one
structure to another, around a block if need be. It also scores a range of motion or a Beighton test, solves a lever, the hip in
single-leg stance or a NIOSH lift, grades a click on a picture, and maps a lesion of the visual pathway or of the spinal cord. It is
pure, bounded and deterministic, uses no network and runs in the Worker.

- **Python twin:** `tools/lib_anatomy.py` (`ID`, `INDEX`, `check_spec`, `exprs`, `keys`). It checks specs but does not compute.
  It gives the same problems (code, path, message, level) as the JS `checkSpec`.
- **Tests:** `node tests/lib_anatomy.js` (90 assertions) and `node tests/enginelib.js` (JS ↔ Python parity on
  `tests/fixtures/enginelib/anatomy.json`, 36 good and bad specs).
- **Reference activity:** `tools/activities_examples/brachial-lesion`.
- **Research:** the project's `engine-library/research/med.md`, part C, has the research behind this chapter.

**Educational only.** This is a teaching model of textbook anatomy. It is not a diagnostic tool: real lesions are partial and
mixed, and real bodies vary (§6).

An output never carries a structure name as a sentence. Outputs are numbers, ids and codes. A scene labels its items with an i18n key
from `model.labels` when the spec gives one. Otherwise it uses the short `s` text of the structure's English name, or its Latin name
with `lang: "la"`. Roots are always labelled with their code, such as `C5`.

## 1. The data: what is in it, and how much

The data is curated by hand from Moore's *Clinically Oriented Anatomy* 9e (2023), Gray's *Anatomy* 42e (2020) and the ISNCSCI 2019
standard. It is embedded in the module, so it travels into the Worker with the code. `counts()` gives the totals and
`dataProblems()` checks consistency: no dangling reference, unknown level, movement, root or attachment. It returns `[]`, and the
tests assert this.

**1041 structures and 319 vessel and lymph edges:**

| type | n | | type | n | | type | n |
|---|---|---|---|---|---|---|---|
| root (C1–Co1) | 31 | | muscle | 171 | | heart (chambers, valves) | 9 |
| region | 9 | | area (skin areas of the nerves) | 45 | | artery | 146 |
| compartment | 32 | | function (taste, tears, hearing…) | 12 | | capillary bed | 12 |
| trunk / division / cord | 4 / 6 / 3 | | reflex | 17 | | vein | 56 |
| nerve (peripheral and cranial I–XII) | 107 | | site (foramina, tunnels, canals) | 30 | | foetal remnant | 5 |
| bone | 40 | | ISNCSCI key point | 29 | | lymph (vessels, nodes, trunks, ducts) | 31 |
| landmark | 158 | | dermatome (C2–S5) | 29 | | tract / visual pathway | 15 |
| joint (with its movements) | 44 | | | | | | |

**What the data covers:**

- **The brachial plexus:** roots C5–T1, 3 trunks, 6 divisions and 3 cords. All 16 named branches, with the roots each element
  carries.
- **The lumbosacral plexus:** all its named branches. The cervical plexus is covered as far as the phrenic, accessory and ansa.
- **The cranial nerves I–XII:** each with its number, its modality, where it leaves the brainstem and the foramen it passes. Each
  also has its levels and its branches (V1–V3, the facial nerve's chorda tympani, stapedius nerve and greater petrosal).
- **The muscles** of the upper and lower limbs, the trunk, the perineum, the eye, the face, mastication, the palate, the pharynx, the
  larynx and the tongue. Each muscle has its innervation, with the nerve level where the branch leaves and its roots. A main root is
  marked `*` and a minor root `~`. Each muscle also has its actions (prime mover or accessory), its origin and insertion (landmarks
  on bones), the arteries that supply it, and its compartment.
- **The dermatomes:** C2–S5, with the 29 ISNCSCI key sensory points and the 10 key muscles.
- **The major arteries,** from the heart to the palmar and plantar arches and the coronary, cerebral and visceral branches. The
  axillary artery is in its 3 parts. The data also has the veins with their drainage, the foetal circulation and its remnants, the
  named anastomoses (scapular, cruciate, genicular, circle of Willis, portosystemic), lymph drainage, the visual pathway and the
  spinal tracts.
- **The normal ranges of motion** of 35 movements.

**Not curated, which gives `uncurated` and NaN, never 0:**

- the attachments and arteries of the head and neck muscles (eye, face, palate, pharynx, larynx, tongue; the four muscles of
  mastication and sternocleidomastoid do have attachments)
- the brainstem nuclei
- the xref ids (TA2, FMA, Uberon), which are not filled in (§10)

A pack cannot supply its own subset of the data yet.

## 2. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "anatomy@1",
  "params": [ { "id": "les", "kind": "choice", "label": "lesion",
                "options": [ { "value": 0, "label": "opt0" }, { "value": 1, "label": "opt1" }, { "value": 2, "label": "opt2" } ], "default": 0 },
              { "id": "k", "kind": "slider", "label": "kLabel", "min": 0, "max": 1, "step": 0.05, "default": 1 } ],
  "model": { "mode": "lesion", "lang": "la",
             "lesions": [ { "at": ["upper-trunk"], "completeness": "k" },
                          { "at": ["radial@spiral-groove"], "completeness": "k" },
                          { "at": ["C8", "T1"], "avulsion": true, "completeness": "k" } ],
             "pick": "les", "variants": ["martin-gruber"],
             "findings": ["muscle.deltoid", "sign.wrist-drop", "sign.horner"],
             "labels": [ { "id": "deltoid", "key": "mDeltoid" } ] },
  "outputs": [ { "id": "par", "kind": "scalar", "of": "paralysed" },
               { "id": "wd",  "kind": "scalar", "of": "sign.wrist-drop" },
               { "id": "del", "kind": "scalar", "of": "muscle.deltoid" },
               { "id": "vs",  "kind": "scalar", "of": "issue.variant-sensitive" },
               { "id": "mus", "kind": "scene",  "of": "muscles" },
               { "id": "lad", "kind": "scene",  "of": "ladder" } ],
  "plots": [ { "kind": "scene", "of": "mus", "title": "musTitle", "height": 320 } ] }
```

- **`model.mode`** (required) is one of `lesion`, `query`, `trace`, `rom`, `biomech`, `regions`, `visual` or `cord` (§3).
- **Common fields:**
  - `variants`: at most 16 variant ids (§6).
  - `labels`: at most 200 `{id, key}` pairs, which give the i18n key a scene uses for a structure.
  - `lang`: `en` or `la`, the language of the `s` fallback labels.
- **Numbers:** every number marked *numx* below is a number or an expression over the spec's consts and params, compiled with
  NoemaExpr. `exprs(spec)` lists the expressions as `[source, path, []]`, and `keys(spec)` lists the label keys.
- **Outputs:** each output is `{id, kind, of}`, where `of` is a name of its mode (§3). Every mode also offers `issue.<code>` (0/1)
  for each code it can raise (§5).
- **Runtime:**
  - `engine.create(spec).run(inputs)` gives the declared outputs.
  - `compute(model, env)` gives `{scalars, series, scenes, issues}`.
  - `evaluate(lesion, variants, completeness)` gives the full findings table, for tests and tools.
  - `relation(rel, a, b, variants)` gives 1, 0 or NaN.
  - `trace(model, variants)` gives `{path, count, collateral}`.
  - A run never throws.
  - `engine.workerSource` holds NoemaExpr, the core and this module, including the data.
- **Limits:**
  - at most 24 candidate lesions of at most 8 sites each, and at most 40 findings
  - at most 40 facts and a quiz of 2–12 choices
  - at most 8 stops (`via`) and 16 blocks (`avoid`) in a trace
  - at most 100 regions of at most 200 points each
  - at most 16 visual lesions and at most 2000 steps of a moment-arm sweep
  - at most 60 rows in a scene list
- **Speed:** a typical run takes about 20 ms (lesion mode builds the route table once, then caches it). The worst allowed run takes
  well under 2 s: 24 candidates × 4 variants with variant risk and the best finding takes ≈ 40 ms, and so does a collateral trace with
  3 variants.

## 3. The modes and their outputs

### 3.1 `lesion` — what a cut takes away

**Fields:**

- **`lesions`** lists 1–24 candidate lesions. Each one is `{at: [site…], completeness?, avulsion?}`.
  - A site in `at` can be a root (`C5`), a trunk, division or cord (`upper-trunk`, `lateral-cord`), a nerve (`radial`), a nerve at
    a level (`radial@spiral-groove`) or a named site (`carpal-tunnel`, `jugular-foramen`, `cavernous-sinus`). A site cuts every
    nerve that passes it.
  - A nerve without a level is cut at its first level.
  - `completeness` (numx, 0–1, default 1) scales the loss.
  - `avulsion: true` makes a root lesion preganglionic, so it also cuts the oculosympathetic fibres of T1, which gives Horner
    syndrome.
- **`pick`** (numx) is the index of the lesion that is shown. Default 0.
- **`compare`** (numx) is the index of a second lesion. It turns on `discriminators` and `differs.*`.
- **`findings`** lists finding names (`muscle.…`, `sign.…`). It turns on `bestFinding`.

**Scalars:**

- `pick` and `completeness`.
- Counts: `paralysed` and `weak` (leaf muscles), `areasLost`, `areasPartial`, `reflexesAbnormal` and `signs`.
- `ulnarClaw` (0–1, §4).
- `discriminators`: how many findings differ between `pick` and `compare`.
- `bestFinding`: the index in `findings` of the examination whose result splits the candidates into the most groups, or −1.
- `variantRisk`: how many of the variants that are *not* declared would change the findings.

**Findings (scalars):**

| name | values |
|---|---|
| `muscle.<id>` | 0 spared, 1 weak, 2 paralysed |
| `loss.<id>` | the share of the muscle's innervation that is cut (0–1) |
| `move.<joint.dof>` | 0, 1, 2 |
| `reflex.<id>-reflex` | 0 normal, 1 reduced, 2 absent |
| `area.<id>` | 0 normal, 1 partial, 2 lost |
| `fn.<id>` | 0, 1, 2 |
| `dermatome.<C2…S5>` | 0, 1, 2 |
| `sign.<id>` | 0/1 |
| `nerve.<id>` | the share of the nerve's fibres that is cut |
| `differs.<finding>` | 0/1: whether the finding differs between `pick` and `compare` |

The 25 signs are: `wrist-drop`, `finger-drop`, `claw-hand`, `ulnar-claw`, `benediction`, `ape-hand`, `froment`,
`winged-scapula-medial`, `winged-scapula-lateral`, `waiters-tip`, `foot-drop`, `trendelenburg`, `horner`, `ptosis`, `down-and-out`,
`fixed-dilated-pupil`, `diplopia`, `facial-palsy-lmn`, `hyperacusis`, `jaw-deviation`, `uvula-deviation`, `hoarseness`,
`shoulder-drop`, `tongue-deviation` and `hemidiaphragm`.

**Series and scenes:**

- `segLoss` (series): 1 for each segment C1…Co1 that is cut as a root.
- `muscles` (scene): the affected muscles, with bars of their loss.
- `tree` (scene): the branches below the lesion.
- `ladder` (scene): the segments, with the cut roots and the dermatomes.

**Issues:** `variant-sensitive`, `level-ambiguous`, `range` and `uncurated`.

### 3.2 `query` — relations, facts and quizzes

**Fields:**

- **`facts`** lists `{id, rel, from, to}`. Each fact gives the scalar `fact.<id>`: 1, 0, or NaN when the data is not curated.
- **`quiz`** is `{rel, from | to, choices[2–12], pick}`. It gives `correct` (0/1), `answers` (how many choices are right) and
  `answerIndex` (the first right choice).
- **`of`** is a structure id. It gives `rootLo` and `rootHi` (segment numbers: C1 = 1 … C8 = 8, T1 = 9, L1 = 21, S1 = 26),
  `rootCount`, `root.<seg>` (0/1) and the scene `ladder`.

The 21 relations:

| rel | from → to |
|---|---|
| `innervates` | nerve, plexus element or root → muscle, area or function (along the fibre routes, so the median nerve innervates FDP) |
| `root` | root → muscle, nerve, area, function or reflex |
| `acts`, `prime` | muscle → movement `joint.dof` (any action, or as a prime mover) |
| `supplies` | artery → muscle |
| `origin`, `insertion`, `attaches` | muscle → landmark or bone (a bone matches its landmarks) |
| `branch` | nerve or vessel → its ancestors |
| `part` | anything → its region or compartment, upward |
| `passes` | nerve or vessel → site |
| `drains` | vein, lymph or bed → its downstream vessels or the heart |
| `reflex-nerve` | reflex → nerve or root |
| `key-muscle`, `key-point` | root → its ISNCSCI movement or key point |
| `class` | joint → `fibrous`, `cartilaginous`, `plane`, `hinge`, `pivot`, `condyloid`, `saddle`, `ball-and-socket` or `functional` |
| `modality` | nerve → `sensory`, `motor`, `mixed` or `parasympathetic` |
| `number` | nerve → `I`…`XII` |
| `exits` | nerve → `forebrain`, `midbrain`, `pons`, `pontomedullary` or `medulla` |
| `remnant` | foetal remnant → the vessel it came from |
| `continues` | artery, vein, heart or bed → the next one downstream |

**Issues:** `uncurated` and `range` (a quiz pick out of range).

### 3.3 `trace` — paths through blood, lymph and nerves

**Fields:**

- `system`: `blood` (default), `fetal`, `lymph` or `nerve`.
- `from` and `to`: structure ids.
- `via`: ordered stops, at most 8.
- `avoid`: blocked structures, at most 16.
- `side`: `L` or `R`. It picks the side for vessels that differ by side (the right subclavian comes from the brachiocephalic trunk).

**How a path is found:** each leg is the shortest path, found by a breadth-first search along the direction of flow.

- Anastomoses are used only when the direct route is blocked. Then `collateral` = 1. This does not apply to lymph or nerves.
- The foetal shunts exist only in `fetal`. After birth the system has no shunts, so the placenta does not reach the left atrium.
  That gives `no-path`, never a made-up route.

**Scalars:**

- `found`, `length` (nodes), `steps` (edges) and `paths` (how many shortest paths, capped at 3)
- `collateral` and `variantRisk`
- `via.<id>` (0/1: on the path) and `pos.<id>` (the index on the path, or NaN)

**Scene:** `route`.

**Issues:** `variant-sensitive`, `no-path` and `collateral`.

### 3.4 `rom` — range of motion and the Beighton score

**Fields:**

- `joint` and `dof` (e.g. `elbow`, `flexion`).
- `source`: `aaos` (default) or `ama`.
- `measured` (numx, degrees).
- `beighton`: the nine items `pinkyL/R`, `thumbL/R`, `elbowL/R`, `kneeL/R` and `palms`, each 0 or 1.
- `age` and `prepubertal`.

**Scalars:**

- `normMin` and `normMax`, `measured` and `pctNorm`.
- `limited`: 1 when the measurement is below 80 % of the norm.
- `hypermobile`: 1 when it is above the norm.
- `beighton` (0–9).
- `beightonCut`: 6 before puberty, 5 from puberty to 50 years, 4 over 50.
- `beightonPositive`.

**Scene:** `goniometer`.

**Issues:** `limited`, `hypermobile` and `range` (a Beighton item that is not 0 or 1 gives NaN).

### 3.5 `biomech` — levers, the hip, lifting, body segments and moment arms

One spec can hold any of five blocks.

**`lever`** has `muscleArm`, `muscleAngle` (degrees, default 90) and 1–8 `loads` `{f, arm}`. It solves a segment in static
equilibrium about the joint (Nordin & Frankel 5e, ch. 2).

- `muscleForce = Σ f·arm / (muscleArm · sin angle)`.
- `jrf`, `jrfX`, `jrfY` give the force of the proximal segment on the distal one, with y up. `jrfAngle` is its angle from the
  vertical.
- `ma` is the mechanical advantage, the effective muscle arm over the first load's arm.
- `leverClass` is 1, 2 or 3.
- The scene is `lever`.

**`hip`** has `bw` (N), `limbFrac` (0.161), `abArm` (0.05 m), `wArm` (0.10 m), `abAngle` (70°) and an optional cane `caneForce` and
`caneArm`. It models single-leg stance after Pauwels (1935).

- `hipW` is the body weight minus the stance limb.
- `hipAbductor = (W·wArm − cane·caneArm) / abArm`.
- `hipJrf`, `hipJrfBw` and `hipJrfAngle` give the joint reaction, as a multiple of body weight and as an angle from the vertical.

**`niosh`** has `H`, `V`, `D` (cm), `A` (°), `F` (lifts/min, default 0.2), `duration` (`short`, `moderate` or `long`), `coupling`
(`good`, `fair` or `poor`) and `load` (kg). It applies the revised NIOSH lifting equation (Waters 1993; Applications Manual 1994).

- `RWL = 23 · HM · VM · DM · AM · FM · CM`.
- The multipliers come out too: `hm`, `vm`, `dm`, `am`, `fm` and `cm`. `li` is load / RWL.
- If H < 25 or D < 25, the multiplier uses 25. That is the manual's rule, and it is flagged `clamped`.
- Outside the equation's limits (H > 63, V outside 0–175, D > 175, A > 135, F > 15), the multiplier is 0 and the run gives `range`.
- FM comes from the manual's table, linear between its rows.

**`segment`** has `name`, `bodyMass` and `length`. It gives Winter's anthropometric fractions (2009, table 4.1): `massFrac`,
`comFrac` (from the proximal end), `mass` and `comDist`. The 12 segments are `hand`, `forearm`, `upper-arm`, `forearm-hand`,
`total-arm`, `foot`, `leg`, `thigh`, `foot-leg`, `total-leg`, `head-neck` and `trunk`.

**`arm`** has `a`, `b` (m), `angle`, `from`, `to` and `steps`. It models a straight-line muscle from a point a on one segment to a
point b on the other.

- At an angle θ the muscle length is `√(a²+b²−2ab cos θ)` and the moment arm is `ab sin θ / length`.
- The scalars are `momentArmAt`, `lengthAt`, `excursion` and `peakAngle`.
- The series are `angle`, `momentArm` and `muscleLength`, and the scene is `arm`.

**Issues:** `impossible` (a muscle line through the joint, or zero arms, gives NaN and never a division by zero), `model` (the muscle
would have to push), `range` and `clamped`.

### 3.6 `regions` — a click on a picture

**Fields:**

- `image`: `[w, h]`.
- `regions`: 1–100 regions, each `{structure, polygon | polyline + width | circle [x, y, r], z}`.
- `x` and `y`: the click.
- `target`: the structure that was asked for.
- `accept`:
  - `exact`
  - `part-of-up`: a click on the long head counts for triceps
  - `part-of-down`: a click on triceps counts for its heads
- `tol` (px, default 6): the tolerance for a polyline.

**Scalars:** `hit` (the index of the top region, by `z`, or −1), `hits`, `correct`, `distance` (px to the target region) and
`nearMiss` (wrong, but within 3 × `tol`).

**Scene:** `regions`.

### 3.7 `visual` — lesions of the visual pathway

**Fields:**

- `lesions`: sites from `optic-nerve-L/R`, `chiasm-central`, `chiasm-lateral-L/R`, `optic-tract-L/R`, `meyer-loop-L/R`,
  `parietal-radiation-L/R` and `occipital-L/R`.
- `pick`: the one shown.
- `combine`: all of them together.

**Scalars:**

- `field.<eye>-<T|N><S|I>`: 8 quadrants, 1 when lost.
- `defect.<name>`: the named defect is present. The names are `monocular-L/R`, `bitemporal-hemianopia`, `nasal-hemianopia-L/R`,
  `homonymous-hemianopia-left/right`, `superior-` and `inferior-quadrantanopia-left/right`, and `macular-sparing` (occipital).
- `rapd.L/R` and `lost`.

**Scene:** `fields`.

### 3.8 `cord` — spinal cord syndromes

**Fields:**

- `level`: C1…S5.
- `side`: `L` or `R`, required for a hemisection.
- `kind`: `hemisection`, `complete`, `central`, `anterior` or `posterior`.
- `extent`: the number of segments, for a central lesion.

**Scalars, per side `.L` / `.R`:**

- `umn`, `lmn`, `dcml`, `stt`, `babinski` and `band`.
- `dcmlFrom`, `sttFrom` and `sttFromHi`: the first segment numbers lost. Pain and temperature start 1–2 segments below the lesion on
  the other side, because the fibres ascend before they cross.

**Other scalars:** `level`, `armsWorse` (central), `sttBandTo` and `bladder`.

**Scene:** `section`.

## 4. The method of lesion mode

**Fibre routes:**

- Every target (a muscle, a skin area, a function, the far end of a nerve) has a list of *routes*. A route is `{root, weight,
  segments}`, and each segment `[node, lo, hi]` is a run of levels of one nerve or plexus element.
- The routes through the plexus follow the roots each trunk, division and cord carries. So a C7 fibre to the triceps runs
  C7 → middle trunk → posterior division → posterior cord → radial nerve.
- A lesion at nerve level *k* cuts a route when lo ≤ *k* ≤ hi. The branch to a muscle leaves at a level, so the radial nerve at the
  spiral groove spares the triceps, whose branches leave in the axilla and the arm.
- A root lesion cuts the routes of that root.
- Preganglionic routes (`T1!`, oculosympathetic) are cut only with `avulsion: true`. A lesion of a site cuts every nerve passing
  through it at that level.

**Weights and loss:**

- A main root (`*`) weighs 2, an ordinary one 1 and a minor one (`~`) 0.5. A muscle with two nerves (FDP, brachialis with a variant
  radial twig, pectineus) has routes in both.
- The loss of a target is the cut share of its route weight, times `completeness`.
- **Thresholds** (one convention for the whole engine): a loss ≥ 0.9 is **paralysed / lost** (2), a loss ≥ 0.25 is **weak /
  partial** (1), and anything less is spared (0).
- A muscle made of parts (triceps = its three heads) takes the mean loss of its parts.

**Movements:** a movement is lost (2) when all its prime movers are paralysed and no accessory mover is left. It is weak (1) when
any prime mover is affected, or when accessory movers remain. For example, the obliques still abduct the eye after a CN VI lesion,
and pronator teres still flexes the elbow after musculocutaneous and radial lesions.

**Reflexes:**

- A spinal reflex is graded by the cut share of its own roots' fibres to its muscles, weighted the same way. The afferent nerve also
  counts: a cut afferent takes the reflex away. A cranial reflex (gag, corneal, jaw jerk, pupillary) takes the worse of its efferent
  muscles and its afferent nerve.
- The reflex roots are: biceps C5–C6, brachioradialis C5–C6, triceps C6–C8 (C7 main), patellar L2–L4 (L4), Achilles S1–S2 (S1).

**Dermatomes, the overlap rule:** neighbouring dermatomes overlap (Lee MWL et al., *Clin Anat* 2008). So one cut root alone gives
only a **partial** loss (1). A root whose neighbour is also cut gives a **lost** dermatome (2) when the lesion is complete.

**Signs:** the 25 signs are rules over the muscle states (§3.1). For example, wrist drop = ECRL, ECRB and ECU paralysed, and claw
hand = interossei paralysed with the long extensors working.

**The ulnar paradox:** `ulnarClaw = loss(lumbricals 3–4) × (0.5 + 0.5 × (1 − loss(FDP 4–5)))`, and it needs the long extensors
working. So a distal ulnar lesion claws more (1) than a proximal one (0.5), where FDP is lost as well.

**Comparing lesions:**

- Two candidates with identical findings give `level-ambiguous`.
- `discriminators` and `differs.*` show what tells two lesions apart.
- `bestFinding` picks the examination whose result splits the candidates into the most groups.

## 5. Issue codes (run time) and checker codes (`checkSpec`, the same in `tools/lib_anatomy.py`)

**Run time** (each gives `issue.<code>` = 1):

| code | modes | when |
|---|---|---|
| `variant-sensitive` | lesion, trace | a declared variant changes the answer |
| `level-ambiguous` | lesion | another candidate gives exactly the same findings |
| `uncurated` | lesion, query | a fact needs data that is not curated (the result is NaN) |
| `range` | all | a pick out of range, a completeness outside 0–1, a NIOSH input outside the equation, a Beighton item not 0/1, a hemisection without a side |
| `no-path` | trace | no path exists, with or without the anastomoses |
| `collateral` | trace | the path uses an anastomosis because the direct route is blocked |
| `limited`, `hypermobile` | rom | below 80 % of the norm, or above the norm |
| `impossible`, `model`, `clamped` | biomech | no solution; the muscle would have to push; a NIOSH input was raised to 25 cm |

**Checker** (every code is exercised by the fixtures):

| code | level | when |
|---|---|---|
| `format` | error | `model` is not an object |
| `value`, `enum`, `size`, `unknown-field` | error | the core walker: a wrong value, an unknown word, a list too long or too short, an unknown field; also a duplicate fact id, an index out of `lesions` or `choices`, a missing `dof`, a mode without its block |
| `unknown-structure` | error | "not a structure of anatomy@1" |
| `wrong-type` | error | a structure of the wrong type, such as a muscle as a lesion site or a vein as an arterial stop |
| `unknown-level` | error | `nerve@level` with a level that the nerve does not have, or a level on something that is not a nerve |
| `unknown-variant` | error | not a known variant |
| `variant-unused` | warning | a variant of another mode, such as a trace variant in a lesion spec |
| `inconsistent` | error | left dominance with codominance; a prefixed with a postfixed plexus; a quiz with both or neither of `from`/`to`; a trace from X to X; blocking the start or the end |
| `unknown-finding` | error | a `findings` entry that is not a finding of lesion mode |
| `unknown-dof` | error | not a `joint.dof` of the data |
| `no-rom` | error | the ROM table has no value for that movement |
| `region` | error | a region without exactly one shape; too few points; a polyline without a width; outside the image; a radius ≤ 0; a self-crossing polygon |
| `output` | error | `<mode> computes no <kind> "<of>"` |

## 6. Variants

A variant is a patch of the model. Lesion variants change routes and trace variants change edges. Each has a published frequency
range, never a single figure. Most come from Tubbs, Shoja & Loukas, *Bergman's Comprehensive Encyclopedia of Human Anatomic
Variation* (2016). A run with variants reports `variant-sensitive` when they change the answer. A run without them still reports
`variantRisk`, the number of known variants that would change it.

| variant | kind | frequency | effect |
|---|---|---|---|
| `martin-gruber` | lesion | 15–25 % | median → ulnar crossing in the forearm: FDI, adductor pollicis and ADM keep a median supply after a proximal ulnar lesion |
| `riche-cannieu` | lesion | 20–70 % | ulnar–median link in the palm: the thenar muscles stay weak, not paralysed, after a median lesion |
| `marinacci` | lesion | 0–2 % | ulnar → median crossing in the forearm (the reverse of Martin–Gruber): the thenar muscles keep an ulnar supply after a proximal median lesion |
| `prefixed-plexus` | lesion | 10–60 % | the brachial routes shift up one root (C4–C8). Depends on the definition |
| `postfixed-plexus` | lesion | 0–10 % | the brachial routes shift down one root (C6–T2) |
| `accessory-obturator` | lesion | 10–30 % | pectineus keeps a supply after a femoral lesion |
| `brachialis-radial` | lesion | 30–80 % | a radial twig to the lateral brachialis |
| `bovine-arch` | trace | 10–25 % | the left common carotid arises from the brachiocephalic trunk |
| `lusoria` | trace | 0.5–1 % | a retro-oesophageal right subclavian, arising last from the arch |
| `left-dominance` | trace | 5–10 % | the posterior interventricular artery comes from the circumflex (Moore9) |
| `codominance` | trace | 10–20 % | both coronaries reach the posterior interventricular territory |
| `imv-into-smv` | trace | 20–40 % | the IMV ends in the SMV, not the splenic vein (Moore9) |
| `high-radial` | trace | 5–15 % | the radial artery arises from the axillary or high brachial |
| `persistent-median-artery` | trace | 1–20 % | a median artery reaches the palm (Lucas et al., *J Anat* 2020; the frequency is rising) |

## 7. Sources of the numbers

| what | source |
|---|---|
| plexus, nerves, muscles (innervation, roots, actions, attachments), arteries, veins, lymph, sites | Moore KL, Dalley AF, Agur AMR, *Clinically Oriented Anatomy* 9e, 2023; Standring S (ed.), *Gray's Anatomy* 42e, 2020 |
| key muscles, key sensory points, dermatomes C2–S5 | ISNCSCI, International Standards for Neurological Classification of SCI, revised 2019 (ASIA/ISCoS) |
| dermatome overlap | Lee MWL, McPhee RW, Stringer MD, *Clin Anat* 2008;21:363 |
| reflex roots | Moore9; Bickerstaff's *Neurological Examination in Clinical Practice* |
| foetal circulation and remnants | Moore KL, Persaud TVN, Torchia MG, *The Developing Human* 11e, 2020 |
| visual pathway, cord syndromes | Gray's 42e |
| ranges of motion | AAOS, *Joint Motion: Method of Measuring and Recording*, 1965; AMA *Guides* (edition: see §10) |
| Beighton score | Beighton P, Solomon L, Soskolne CL, *Ann Rheum Dis* 1973;32:413; cut-offs from Malfait F et al., *Am J Med Genet C* 2017;175:8 |
| levers | Nordin M, Frankel VH, *Basic Biomechanics of the Musculoskeletal System* 5e, 2021 |
| hip in single-leg stance | Pauwels F, 1935; Nordin & Frankel 5e |
| lifting | Waters TR, Putz-Anderson V, Garg A, Fine LJ, *Ergonomics* 1993;36:749; NIOSH Applications Manual 1994 |
| segment parameters | Winter DA, *Biomechanics and Motor Control of Human Movement* 4e, 2009, table 4.1 (after Dempster) |
| variants | Tubbs RS, Shoja MM, Loukas M, *Bergman's Comprehensive Encyclopedia of Human Anatomic Variation*, 2016 |

## 8. The reference values asserted by the tests (`tests/lib_anatomy.js`)

| # | case | value |
|---|---|---|
| A1 | upper trunk (Erb) | deltoid, supraspinatus, infraspinatus, teres minor and supinator paralysed; biceps, brachialis and brachioradialis weak; serratus and rhomboids spared; biceps reflex 2; waiter's tip |
| A2 | C8 + T1 avulsion (Klumpke) | all intrinsic hand muscles and FDP paralysed; claw hand; Horner. A lower trunk lesion gives no Horner |
| A3 | radial at the spiral groove | wrist and finger extensors, brachioradialis and supinator paralysed; triceps spared; wrist drop |
| A4 | ulnar at the elbow / wrist | FCU and FDP 4–5 lost only at the elbow; `ulnarClaw` 0.5 at the elbow vs 1 at the wrist |
| A5 | carpal tunnel | APB, opponens, superficial head of FPB, lumbricals 1–2; thenar skin spared |
| A6 | fibular neck vs L5 | tibialis posterior and gluteus medius spared vs weak; Achilles reflex normal in both |
| A7 | reflex roots | biceps C5–C6, triceps C6–C8, patellar L2–L4, Achilles S1–S2 |
| A8 | ISNCSCI key muscles | C5 elbow flexion … T1 little-finger abduction; L2 hip flexion … S1 plantarflexion |
| A9 | key points | C6 thumb, C7 middle finger, C8 little finger, T4 nipple, T10 umbilicus, L4 medial malleolus, L5 3rd MTP, S1 lateral heel |
| A10 | LV → right radial | aortic valve, ascending aorta, arch, brachiocephalic trunk, subclavian, axillary 1–3, brachial, radial |
| A11 | IMV → RA | splenic v., portal v., sinusoids, hepatic vv., IVC; with `imv-into-smv` the route goes through the SMV (variant-sensitive) |
| A12 | foetal | placenta → umbilical v. → ductus venosus → IVC → RA → foramen ovale → LA; after birth: `no-path` |
| A13 | visual | chiasm → bitemporal; left tract → right homonymous; left Meyer's loop → right superior quadrantanopia |
| A14 | right T10 hemisection | right UMN and dorsal columns; left pain and temperature from T11–T12 (`sttFrom.L` 19–20) |
| A15 | jugular foramen | CN IX, X and XI; XII spared; gag reflex lost |
| A16 | elbow lever (arm 0.04 m; 50 N at 0.35 m, 15 N at 0.15 m) | muscle force 493.75 N; joint reaction 428.75 N; MA 0.114 |
| A17 | hip, BW 700 N | abductors 1174.6 N; joint reaction 1738 N = 2.48 BW at 13.4° |
| A18 | NIOSH | RWL 23.0 kg at the origin, 11.5 kg at H = 50 cm |
| A19 | Beighton | all items positive: 9; palms only: 1 |
| A20 | Winter | forearm COM 0.430 of its length; thigh 0.100 of body mass |
| A21 | Martin–Gruber + ulnar at the elbow | FDI only weak (loss 0.5), variant-sensitive |
| A22 | deltoid | C5–C6, axillary nerve |

The tests also cover:

- the routes of a collateral trace, coronary dominance, lymph drainage and a nerve fibre trace
- the cavernous sinus, the facial nerve by level, CN III and the accessory nerve in the posterior triangle
- every variant, uncurated facts, quizzes and regions
- every checker code, and the adapter
- the Worker source in a fresh `vm` context, which gives the same outputs
- speed, and the twin index (the Python `INDEX` equals the JS `index()`)
- the 10 cases of the reference activity's `tests.json`

## 9. Simplifications and limits

- **Lesion mode is unilateral:** it models one side.
- **The dermatomes do not shift** with a prefixed or postfixed plexus. The variant moves only the muscles' brachial routes.
- **The recurrent laryngeal nerve** follows the left course, around the arch.
- **The sciatic nerve** is one nerve with levels. Its tibial and fibular divisions are not separate in the thigh, but its branches
  to the hamstrings carry the right roots.
- **Geniohyoid and thyrohyoid** (C1 through the hypoglossal) are left out.
- **Partial lesions are uniform:** `completeness` scales every route of the lesion equally, without fascicular topography.
- **The visual and cord modes are qualitative.** They give which quadrants and tracts are lost, not their extent.
- **The ROM norms are population means,** with no age or sex adjustment.

## 10. Check before release

Every item here is also marked in the source with *CHECK BEFORE RELEASE* or *verify*.

1. **The AMA range-of-motion edition.** The `ama` column is the research brief's transcription. The AMA *Guides* 5th (2000) and 6th
   (2008) editions differ, so check it against the edition the pack uses. The AAOS 1965 values are the default.
2. **The FMA licence.** The FMA has been offered under CC BY 3.0 and earlier under a more restrictive licence. Confirm the current
   terms before any FMA data or ids are bundled. None are bundled now.
3. **The ISNCSCI worksheet revision.** The key points and key muscles follow the 2019 revision. Check whether a 2026 worksheet
   revision changed anything.
4. **The NIOSH frequency-multiplier table.** Check the FM table, and its linear interpolation between rows, against table 5 of the
   Applications Manual (1994).
5. **The xref ids (TA2, Uberon, FMA) are not filled in.** The structures carry anatomy@1's own ids only. The extractor that would
   map them is not written.
6. **The TA2Viewer repository licence.** Confirm it before its term lists are used to fill the xrefs.

**Licences of the vocabularies that could fill the xrefs:**

- TA2 terms: the terms themselves are in the public domain, and the document is CC BY-ND.
- Uberon: CC BY 3.0.
- Wikidata: CC0.

The curated data in this module is a set of facts, rewritten by hand from the textbooks cited in §7.

## Uses the kernel

No duplicated facility: nothing to move (checked 2026-11-07).
