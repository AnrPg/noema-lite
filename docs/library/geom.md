# `geom@1` — Euclidean constructions in the plane (`engine/src/47_lib_geom.js`, `NoemaLibGeom`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`). A construction is a list of objects, each built from earlier
ones, as in GeoGebra or Cinderella: free points bound to the spec's params, points on objects, classified intersections, 16
triangle centres, lines, circles and conics, eight kinds of transformation (inversion and projective maps included), loci traced
over a sweep, and computational geometry (convex hull, Delaunay, Voronoi, the minimum enclosing circle, clipping, the Poincaré
disk). It gives measures and tolerant asserts ("are these collinear?") as scalars, any measure against the sweep as a series,
"is it always true?" by random placements, and the construction as a scene.

The Python twin is `tools/lib_geom.py` (`ID`, `check_spec`, `exprs`, `keys` and the same lists). It checks and does not compute,
and it gives the same problems (code, path, message, level) as the JS `checkSpec`. The tests are `node tests/lib_geom.js` (84
assertions: the reference table, every edge case, the predicates, the sweep, the adapter, the Worker, speed, the reference
activity) and `node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/geom.json`, 23 specs: 9 good, 14 bad).
The reference activity is `tools/activities_examples/euler-line`. The research behind this chapter is in the project's
`engine-library/research/math.md` (§4, table E1–E17).

The engine is pure JS. Its one dependency is vendored: **robust-predicates@3.0.3** (Vladimir Agafonkin's port of Shewchuk's
adaptive exact predicates; Unlicense, public domain), the files `umd/orient2d.min.js` (2696 B) and `umd/incircle.min.js`
(10 600 B), kept in `engine/vendor/robust-predicates@3.0.3/` with their licence and embedded in the module verbatim (about
13.3 kB; `tests/lib_geom.js` checks the bytes). Every object is rebuilt from the free points along the construction on every run,
so nothing drifts. The transcendental functions are NoemaExpr's fdlibm ports, and the seeded randomness is the core's, so the
same spec gives the same bits everywhere. It is bounded: at most 300 objects, 200 points in a set, samples × objects ≤ 200 000,
2000 values per series and 2000 scene items. It never throws.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "geom@1",
  "params": [ { "id": "cx", "kind": "slider", "label": "cxLabel", "min": -2, "max": 8, "step": 0.1, "default": 2 },
              { "id": "cy", "kind": "slider", "label": "cyLabel", "min": 0.5, "max": 8, "step": 0.1, "default": 4 } ],
  "model": {
    "objects": [
      { "id": "A", "point": [0, 0] }, { "id": "B", "point": [6, 0] }, { "id": "C", "point": { "x": "cx", "y": "cy" } },
      { "id": "T", "polygon": ["A", "B", "C"] },
      { "id": "O", "center": { "kind": "circumcenter", "of": ["A", "B", "C"] } },
      { "id": "G", "center": { "kind": "centroid", "of": ["A", "B", "C"] } },
      { "id": "H", "center": { "kind": "orthocenter", "of": ["A", "B", "C"] } },
      { "id": "N", "center": { "kind": "ninepoint", "of": ["A", "B", "C"] } },
      { "id": "cc", "triCircle": { "kind": "circumcircle", "of": ["A", "B", "C"] } },
      { "id": "nc", "triCircle": { "kind": "ninepoint", "of": ["A", "B", "C"] } },
      { "id": "eu", "eulerLine": ["A", "B", "C"] } ],
    "tol": 1e-6 },
  "outputs": [ { "id": "onC", "kind": "scalar", "of": "on", "at": ["C", "eu"] },
               { "id": "hIn", "kind": "scalar", "of": "inside", "at": ["H", "T"] },
               { "id": "line", "kind": "scalar", "of": "defined", "at": ["eu"] },
               { "id": "col", "kind": "scalar", "of": "collinear", "at": ["O", "G", "H"] },
               { "id": "hg", "kind": "scalar", "of": "dist", "at": ["H", "G"] },
               { "id": "go", "kind": "scalar", "of": "dist", "at": ["G", "O"] },
               { "id": "angC", "kind": "scalar", "of": "angle", "at": ["A", "C", "B"] },
               { "id": "fig", "kind": "scene", "of": "drawing" } ],
  "plots": [ { "kind": "scene", "title": "sceneTitle", "of": "fig", "height": 360 } ] }
```

This is the reference activity, shortened. Its exercise (ch01-e922) checks `onC == 1`, `hIn == 1` and `line == 1`: move C so that
the Euler line passes through it while the orthocentre stays inside the triangle. This happens when the triangle is isosceles
and acute (C at x = 3, above y = 3, not at the equilateral height 3√3); a right angle at C also puts the line through C, but then
H is the vertex C itself, not inside.

- **Objects**: `{id, <kind>: …, hide?, c?, label?}`, one kind each, built in order. A reference must name an object defined
  **before** it (`cycle` otherwise), so the construction is a DAG. `hide` keeps an object out of the scene, `c` sets its colour
  role, `label` is a string key drawn instead of the id.
- **Numbers.** Coordinates go in `{x, y}` as numx (a number or an expression over the spec's names); the short form `[x, y]` holds
  plain numbers. `pointOn.t`, `circle.r`, `conic.e` and the transform numbers are numx too, and so are `sweep.from` and `to`.
  Expressions may use the sweep variable. `exprs(spec)` lists them as `[source, path, local names]` (the sweep variable is
  local); `keys(spec)` lists the objects' `label` keys.
- **Runtime.** `run(spec, env, {seed})` returns `{out, diag, values, S}`. The adapter `engine.create(spec).run(inputs)` gives the
  declared outputs by id. An object that cannot be built is **undefined**, and so is everything built on it: its measures are
  NaN, its asserts NaN, `defined` 0, and the reason is a code (§5). Nothing is ever guessed.

### 1.1 The model

| field | type | meaning |
|---|---|---|
| `objects` | list 1–300, required | the construction (§2) |
| `sweep` | `{var, from, to, samples? 2–2000 (200)}` | a variable driven from `from` to `to`: loci and series (§4.2); outside the sweep it stands at `from` |
| `view` | `[x0, x1, y0, y1]` | the scene's window (default: fitted to the points and circles) |
| `tol` | > 0 (1e-9) | the relative tolerance of tolerant decisions and asserts |
| `seed` | 0–2³²−1 | the placements of `always` and the Welzl order |

### 1.2 Tolerance and exact decisions

Two kinds of decision. **Structural** ones (which side of a line, inside a circle, the orientation of a triangle, convexity,
Delaunay's flips, the hull) use the **exact** predicates: `orient` and `incircle` return the sign of the true determinant of the
floating-point inputs, never a rounding artefact (Shewchuk 1997, Discrete Comput. Geom. 18:305). **Metric** ones (is this circle
tangent, are these points coincident, are three points collinear for display) are **tolerant**: the scale S is the largest
absolute free coordinate (≥ 1) and a quantity counts as zero when it is at most `tol`·S (or `tol`·S² for an area). An exact
predicate is not the right test of a theorem in floating point: the centroid (8/3, 4/3) is not representable, so O, G, H are
almost never exactly collinear, and the `collinear` assert is tolerant for that reason (research §4.3).

### 1.3 Checker codes (`checkSpec`, the same in `tools/lib_geom.py`)

| code | when |
|---|---|
| `format` | `model` or an object is not an object; no kind or two kinds in one object |
| `value` | a missing required field; a value of the wrong kind; `[x, y]` with an expression; a series without `model.sweep`; a transform without the fields it needs |
| `kind` | an unknown construction |
| `enum` | a centre, a circle kind, a transform, a conic type, a `pick`, `unit`, `labels`, a flag's `code` |
| `size` | a list too long or too short (more than 300 objects, more than 200 points in a set, a polygon of fewer than 3) |
| `duplicate` | two objects with the same id |
| `ref` | a reference to no object |
| `cycle` | a reference to an object defined later (or to itself) |
| `type` | a reference of the wrong type (the midpoint of a line), an output's `at` of the wrong types, a transform that cannot map that type |
| `budget` | `sweep.samples` × objects, or an `always`'s `samples` × objects, above 200 000 |
| `output` | an `of` the engine does not compute, or a kind it does not give |
| `unknown-field` (warning) | a field the engine does not know |

## 2. Constructions

Types: P point · L line (S segment, R ray) · C circle · K conic · G polygon · U curve · T set of segments.

| kind | value | gives | method and source |
|---|---|---|---|
| `point` | `[x, y]` \| `{x, y}` | P | a free point |
| `pointOn` | `{on, t}` | P | on a line p → q: the fraction t (a segment clamps to [0, 1], a ray to ≥ 0); a circle: the angle t (rad); an ellipse or hyperbola: its parameter; a polygon or a curve: the fraction of its length |
| `midpoint` | `[P, P]` | P | |
| `intersect` | `{of: [a, b], pick?}` | P | lines, segments, rays, circles and conics, classified (§3); `pick` chooses among the points: `index:0`–`3`, `near:X`, `far:X`, `other:X`, `continuous` (the nearest to the last sample's choice: no branch jumps in a sweep, else `branch-switch`) |
| `center` | `{kind, of: [A, B, C]}` | P | `centroid` X(2), `incenter` X(1), `circumcenter` X(3), `orthocenter` X(4), `ninepoint` X(5), `symmedian` X(6), `gergonne` X(7), `nagel` X(8), `mittenpunkt` X(9), `spieker` X(10), `feuerbach` X(11), `fermat` X(13), `delongchamps` X(20), `excenter-a/b/c`: from barycentric coordinates (Kimberling, *Encyclopedia of Triangle Centers*) |
| `centerOf`, `focus`, `foot` | `{of}`; `{of, index?}`; `{from, to}` | P | the centre of a circle or a central conic; a conic's focus; the foot of the perpendicular |
| `line`, `segment`, `ray` | `[P, P]` | L, S, R | |
| `parallel`, `perpendicular` | `{to, through}` | L | |
| `perpBisector`, `angleBisector` | `[P, P]`; `{of: [A, B, C], external?}` | L | the bisector of the angle at B |
| `tangent` | `{from, to, pick?}` | L | from a point to a circle or a conic: through the touching points of its polar; on the curve: the tangent there |
| `polar`, `radicalAxis` | `{of, to}`; `[C, C]` | L | pole–polar for a conic (La Hire 1685); the radical axis (Gaultier 1813) |
| `eulerLine`, `simson` | `[A, B, C]`; `{point, of}` | L | Euler 1767; Simson's line (Wallace 1799) for a point on the circumcircle |
| `circle` | `{center, through}` \| `{center, r}` \| `{points: [3]}` | C | |
| `triCircle` | `{kind, of}` | C | `circumcircle`, `incircle`, `ninepoint`, `excircle-a/b/c` |
| `apollonius` | `{of: [C, C, C], signs?, pick?}` | C | the circle tangent to three circles, internally (−1) or externally (+1) to each: the 2 × 2 linear system and a quadratic in r (Viète 1600; Coxeter 1968) |
| `mec` | `[P…]` | C | the minimum enclosing circle, Welzl 1991, seeded order |
| `conic` | `{points: [5]}` \| `{foci, through, type}` \| `{focus, directrix, e}` | K | the conic through five points (the 5 × 6 null space; Cramer 1750), by foci, by focus and directrix; its type, centre, axes and foci by the principal axes of the quadratic form |
| `polygon`, `regular` | `[P…]`; `{center, vertex, n}` | G | |
| `hull` | `[P…]` | G | Andrew's monotone chain 1979, with the exact `orient` |
| `morley`, `napoleon` | `[A, B, C]` | G | Morley 1899 from its trilinears (Coxeter & Greitzer 1967 §2.9); Napoleon's outer triangle |
| `clip` | `[G, G]` | G | Sutherland & Hodgman 1974 against a convex polygon |
| `transform` | `{kind, of, …}` | the type of `of` | `translate` {by: [P, P]} \| {dx, dy}; `rotate` {center, angle, deg?}; `reflect` {line} \| {center}; `dilate` {center, factor}; `invert` {circle} (a line → a circle through the centre, a circle → a circle or a line); `shear` {k}; `affine` {m: 6 numbers}; `projective` {from: 4 points, to: 4 points} (the homography by the DLT; Hartley & Zisserman 2004). Affine and projective maps turn circles into conics |
| `locus` | `{of: P}` | U | the path of a point over the sweep, broken where it is undefined or jumps |
| `bezier`, `geodesic` | `[P…]` (2–20); `[P, P]` | U | de Casteljau 1959; the Poincaré-disk geodesic (the arc orthogonal to the unit circle; Poincaré 1882) |
| `delaunay`, `voronoi` | `[P…]` | T | Bowyer 1981 / Watson 1981 with the exact `incircle`; the Voronoi edges are the dual (circumcentres of adjacent triangles joined; a hull edge gives a ray outwards) |

## 3. Intersections and their classes

| pair | method | classes |
|---|---|---|
| line–line | homogeneous coordinates, the cross product | `parallel` (a point at infinity, `defined` 0), `coincident` |
| line–circle | the foot of the perpendicular and h = √(r² − d²) | two points; `tangent` (one, when \|d − r\| ≤ tol·S); `no-intersection` |
| circle–circle | the radical axis, then line–circle | two; `tangent` (external or internal); `contained`, `separate`, `concentric`, `coincident` |
| with a conic | the pencil A + λB of the two conics: det = 0 is a cubic in λ (Cardano, with the trigonometric branch), its degenerate member split into two lines, then line–conic (Richter-Gebert, *Perspectives on Projective Geometry*, 2011, §11.4) | up to four points |

Segments and rays keep only the points on them. A `pick` that names a point (`near:X`) uses the distance to it; `other:X` takes a
point that is not X (the second point of a circle through X).

## 4. Outputs

### 4.1 Scalars (`kind: scalar`, `at` the objects)

| `of` | `at` | value |
|---|---|---|
| `x`, `y` | P | the coordinates |
| `dist` | P P \| P L \| P C | the distance (to a circle: to its curve) |
| `length` | S \| P P | |
| `angle` | A B C \| L L | the angle ABC by atan2(cross, dot) (never acos: no loss near 0 and π), in degrees (`unit: rad`), unsigned unless `oriented`; between lines 0–90° |
| `area`, `perimeter` | G \| C \| K \| P P P … | the shoelace formula (Gauss), unsigned unless `signed` (counter-clockwise > 0); πr², πab |
| `radius`, `slope`, `eccentricity` | C; L; K \| C | |
| `conicType` | K \| C | 1 ellipse (a circle too), 2 parabola, 3 hyperbola, 0 degenerate |
| `count` | two of L S R C K | the number of intersection points (NaN when they coincide) |
| `power` | P C | d² − r² (Steiner 1826) |
| `orient` | P P P | the exact sign: 1 counter-clockwise, −1 clockwise, 0 collinear |
| `inside` | P G \| P C | 1 strictly inside (the winding number, Hormann & Agathos 2001; a point on the boundary is not inside), 0 otherwise |
| `crossRatio` | P P P P | (A, B; C, D) on a line |
| asserts | | 1 true, 0 false (tolerant, §1.2): `collinear` (P P P …), `concyclic` (P×4), `concurrent` (L×3), `parallel`, `perpendicular` (L L), `equal` (P P P P: \|AB\| = \|CD\|), `on` (P and any curve), `tangent` (line or circle, circle) |
| `defined` | any | 1 when the object exists |
| `flag` | `code`, `at?` | 1 when the run reported the code (for that object) |
| `always` | `test`, `samples?` (20) | 1 when the assert `test` holds at `samples` random placements of all the free points (seeded; tolerance × 1000): probabilistic proving (Schwartz 1980, Zippel 1979) |
| `residual` | `test` | the assert's residual before the tolerance |

### 4.2 Series (`kind: series`)

With a `sweep`: `sweep` (the variable's values), and any measure of §4.1 as a series of its values at the samples. Only the
objects the loci and series depend on are rebuilt at each sample.

### 4.3 The scene (`kind: scene`, `of: drawing`)

The construction in order: free points `hi`, constructed points `base`, segments `base` and lines `muted` (clipped to the view),
circles and conics `info`, polygons `ok` filled, curves and loci `warn`, Delaunay and Voronoi edges `muted`; points at infinity and
undefined objects are not drawn. Each point carries its id (`s`) or its `label` key, unless `labels: none`.

## 5. Runtime codes

Every code is also a `flag` (with `at` for the object it is about).

| code | when |
|---|---|
| `coincident-points` | a line, a circle or a centre from points that coincide (within tol·S) |
| `collinear`, `degenerate-triangle` | three points on a line: no circumcircle, no centres |
| `parallel`, `coincident`, `point-at-infinity` | lines that do not meet, or are the same; a centre or a pole at infinity |
| `tangent`, `no-intersection`, `contained`, `separate`, `concentric` | the class of an intersection (§3) |
| `inside-circle` | a tangent from a point inside the circle |
| `ill-conditioned` | an intersection or a conic whose system is nearly singular: the result may be far off |
| `branch-switch` | the picked point jumped between samples (use `pick: continuous`) |
| `right-angle`, `obtuse`, `isosceles`, `equilateral` | facts about a triangle (H on a vertex, H outside, centres that coincide) |
| `euler-line-undefined` | O = G: the triangle is equilateral |
| `fermat-vertex` | an angle ≥ 120°: the Fermat point is that vertex |
| `inversion-centre` | inverting the centre of inversion (it goes to infinity) |
| `conic-degenerate`, `conic-not-unique` | five points on a pair of lines; four of them collinear (a pencil of conics) |
| `no-solution` | Apollonius with no circle of those signs |
| `self-intersecting`, `not-convex`, `not-collinear` | a polygon that crosses itself; a clip polygon that is not convex; a Simson point off the circumcircle, or a cross-ratio of points off one line |
| `outside-disk` | a geodesic point outside the Poincaré disk |
| `huge-coordinates` | a constructed point beyond 1e8·S (nearly parallel lines) |
| `locus-gaps` | the locus has several pieces |
| `param` | a number that cannot be computed (a coordinate, t, r, a sweep end) |
| `undefined` | any other failure, and an unchecked output that cannot be evaluated |

## 6. Validity and limits

- Coordinates are doubles; the exact predicates make the structural decisions right for those inputs, not for the real numbers
  the user meant. Constructions with irrational coordinates (√2, the centroid's 8/3) are tested with tolerant asserts.
- Intersections with conics go through a cubic and are accurate to about 1e-10 relative; tangencies at that level are classified
  by the tolerance.
- `always` is evidence, not a proof: a false statement that holds on a set of measure zero passes. 20 random placements make an
  accidental pass of a false polynomial identity vanishingly unlikely.
- Delaunay uses a large bounding triangle (1000·S): points nearly cocircular with its corners near the hull may lose a hull
  triangle. The unbounded Voronoi edges are rays outwards, clipped at 10·S.
- A sweep rebuilds what its loci and series need, so its cost is samples × those objects; the static budget is samples × all
  objects ≤ 200 000.

## 7. Reference values asserted by `tests/lib_geom.js`

| | check | value | tolerance | source |
|---|---|---|---|---|
| E1 | right triangle (0,0), (4,0), (0,3) | area 6, R 2.5, O (2, 1.5), r 1, I (1, 1), G (4/3, 1), H = A with `right-angle`, N (1, 0.75), nine-point r 1.25 | 1e-12 | Thales; Euler |
| E2 | acute triangle (0,0), (6,0), (2,4) | O (3, 1), R² 10, G (8/3, 4/3), H (2, 2), N (2.5, 1.5), area 12 | 1e-12 | computed by hand |
| E3 | its Euler line | O, G, H collinear (tolerant), N on it, \|HG\| = 2\|GO\| | 1e-12 | Euler 1767 |
| E4 | its incentre, Euler's OI² = R(R − 2r) | I (2.4076408527535995, 1.4880038797045054), OI² 0.5890371459331322 | 1e-12 | Euler 1765 |
| E5 | Feuerbach \|NI\| = R/2 − r | 0.09313495037968433 | 1e-12 | Feuerbach 1822 |
| E6 | the symmedian point | (24/11, 18/11) | 1e-12 | Lemoine 1873 |
| E7 | circles r 5 at (0,0), (8,0); r 3, r 2 at distance 5; r 5 and r 1 at distance 1 | (4, ±3); `tangent` at (3, 0); `contained` | 1e-12 | |
| E8 | y = x and x + y = 2 with the circle r √2 | (±1, ±1); `tangent` at (1, 1) | 1e-9, 1e-12 | |
| E9 | y = 2x + 1 with y = 2x + 3, and with 2y = 4x + 2 | `parallel`; `coincident` | exact | |
| E10 | orient2d at p = (0.5 + k·2⁻⁵³, 0.5 + l·2⁻⁵³), q (12, 12), r (24, 24), k, l < 256 | sign(l − k) at all 65 536 points (the naive formula: thousands wrong) | exact | Kettner et al. 2008 |
| E11 | the equilateral triangle of side 2 | all centres at (1, √3/3), `euler-line-undefined`; Morley side 0.36958506180819073 | 1e-12 | Morley 1899 |
| E12 | inversion in the unit circle | x = 2 → the circle centre (1/4, 0), r 1/4; the centre → `inversion-centre` | 1e-14 | |
| E13 | the conic through (±2, 0), (0, ±1), (√2, √2/2) | x²/4 + y² = 1: foci (±√3, 0), e = √3/2, area 2π | 1e-10 | Cramer 1750 |
| E14 | the lattice pentagon (0,0), (4,0), (4,3), (2,5), (0,3) | area 16 (−16 clockwise) = I + B/2 − 1, B 14, I 10 | exact | Pick 1899 |
| E15 | the angle between (1, 0) and (1, 1e-10) | 1e-10 rad (acos would give 0); near π too | 1e-24 abs | |
| E16 | circles r 1 at (0,0), (4,0) | the tangents from the internal centre (2, 0): slopes ±1/√3, touching both | 1e-12 | |
| E17 | three unit circles at (0,0), (4,0), (2,4) | Apollonius: r 3.5 about (2, 1.5) enclosing, r 1.5 inside | 1e-10 | Viète 1600 |

Also: Morley's theorem on a scalene triangle, three concurrent lines, the ellipse by its foci (e = 0.6), the parabola by focus
and directrix, five collinear points, the hull, the minimum enclosing circle (2.9 through (0,0), (4,0), (2,5), against brute
force), empty Delaunay circumcircles, Thales over a 50-sample sweep, Euclid I.37, a rotation, the regular hexagon, the power of a
point, the cross-ratio; the Worker source in a fresh context, bit for bit; a typical run under 50 ms (about 1) and the heaviest
allowed (200 moving points, their minimum enclosing circle traced over 960 samples, with Delaunay and Voronoi) under 2 s (about
650 ms).

## Uses the kernel

Since 2026-11-07 Welzl's smallest enclosing circle and the "always" checks draw their random order from kernel streams (`C.rng` = `SK.stream`); the Worker source carries the kernel. Snapshot unchanged.
