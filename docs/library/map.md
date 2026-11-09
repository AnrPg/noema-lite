# `map@1` — maps, projections, geodesy and journeys (`src/engines/map/map.ts`, `NoemaLibMap`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for history, geography, archaeology and the classics: map
projections and their distortion, distances and bearings on the sphere and on the ellipsoid, territories through time (area,
containment, overlap), journeys on a network of roads, rivers and sea lanes (ORBIS-like), historical units of length with their
uncertainty, and ancient measurement (Eratosthenes, the gnomon, the obliquity of the ecliptic, longitude by time). The tests are `node tests/lib_map.js` (129 assertions) and `node tests/enginelib.js` (the golden outputs of the former Python twin on `tests/fixtures/enginelib/map.json`, 23 specs). The reference activity is `tools/activities_examples/roman-itinerary`
(Rome → Alexandria: the month opens or closes the sea lanes, the fastest route, its days, kilometres, Roman miles and relative cost).
The research behind this chapter is the project's `engine-library/research/maptext.md` (§ map).

Two vendored dependencies (§14): GeographicLib's geodesic routines 2.2.0 (MIT, 32 kB) for exact ellipsoidal distances, azimuths,
geodesic lines and polygon areas, and the Natural Earth 1:110m land outline from world-atlas 2.0.2 (ISC; data public domain, 55 kB) as
the basemap. Both are plain scripts without DOM or network; their sources are prepended to the engine's Worker source. Without them
the engine still runs: geodesic outputs give NaN with the code `no_geodesic`, the map has no land (`no_basemap`).

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "map@1",
  "params": [ { "id": "month", "kind": "slider", "label": "monthLabel", "min": 1, "max": 12, "step": 1, "default": 7 } ],
  "derived": [ { "id": "seaOpen", "expr": "month >= 4 && month <= 10" } ],
  "model": {
    "ellipsoid": "WGS84",
    "projection": { "type": "lcc", "lat1": 33, "lat2": 45, "lon0": 20, "lat0": 38 },
    "view": { "bbox": [-10, 25, 40, 50], "basemap": "land110", "graticule": 10, "labels": true },
    "places": [ { "id": "roma", "lat": 41.8933, "lon": 12.4828, "label": "romaLabel", "c": "hi" },
                { "id": "ostia", "lat": 41.7558, "lon": 12.2916, "label": "ostiaLabel" },
                { "id": "alex", "lat": 31.1975, "lon": 29.8925, "label": "alexLabel" },
                { "id": "brund", "lat": 40.6327, "lon": 17.9418, "label": "brundLabel" } ],
    "network": { "factor": 1.2, "edges": [
      { "a": "roma", "b": "ostia", "mode": "road" }, { "a": "roma", "b": "brund", "mode": "road" },
      { "a": "ostia", "b": "alex", "mode": "sea", "open": "seaOpen" }, { "a": "brund", "b": "alex", "mode": "coast" } ] },
    "territories": [ { "id": "aeg", "from": -30, "to": 641, "rings": [[25, 22, 35, 22, 35, 32, 25, 32]], "label": "aegLabel" } ] },
  "outputs": [
    { "id": "d", "kind": "scalar", "of": "distance", "from": "roma", "to": "alex", "unit": "romanMile" },
    { "id": "days", "kind": "scalar", "of": "route", "from": "roma", "to": "alex", "by": "days" },
    { "id": "legs", "kind": "scalar", "of": "route", "from": "roma", "to": "alex", "what": "legs" },
    { "id": "cum", "kind": "series", "of": "routeDays", "from": "roma", "to": "alex" },
    { "id": "in", "kind": "scalar", "of": "contains", "territory": "aeg", "place": "alex", "year": 100 },
    { "id": "m", "kind": "scene", "of": "map", "year": 100, "path": { "from": "roma", "to": "alex" } } ],
  "plots": [ { "kind": "scene", "of": "m", "title": "mapTitle", "height": 360 } ] }
```

- Every number of the model and the outputs marked **numx** is a number or an expression over the spec's names (consts, params,
  derived), compiled once with NoemaExpr (`exprs(spec)` lists them as `[source, path, []]`). `keys(spec)` lists `places[].label` and
  `territories[].label` (i18n keys drawn on the map). Nothing else in the engine is text: ids, codes and numbers.
- **Outputs** `{id, kind, of, …}`: `of` names one of §3–§10 and `kind` must be its kind (`scalar`, `series`, `scene`); otherwise the
  error is `output`.
- **Runtime** (`run(spec, env, {prepared})` → `{out, codes: [{id, code}]}`): what cannot be computed is NaN, an empty series or an
  empty scene, and the code says why (§11). A run never throws; an internal failure gives the code `error`.
- **Conventions**: latitude and longitude in degrees (WGS84 unless `ellipsoid` says otherwise), longitudes normalised to (−180, 180];
  rings are flat lists `[lon, lat, lon, lat, …]` (GeoJSON order) of ≥ 3 vertices, the first ring the outline, the others holes;
  azimuths in degrees clockwise from north, 0–360; years as numbers (−27 = 28 BCE in astronomical numbering is the author's choice:
  the engine compares numbers and never converts eras). A territory is in force for `from ≤ year < to`.

### 1.1 The model (`model`)

| field | kind | meaning |
|---|---|---|
| `ellipsoid` | `WGS84` (default) · `GRS80` · `clarke1866` · `intl1924` · `bessel1841` · `sphere` | the figure of the Earth (§2) |
| `radius` | numx km, default 6371.0088 | the sphere's radius (used by `sphere`, `haversine` and the spherical projections) |
| `projection` | `{type!, lon0, lat0, lat1, lat2, k0, zone, south, maxLat, clip, x0, y0}` | §4 |
| `view` | `{bbox [w,s,e,n], basemap land110\|none, graticule (deg, default 30, 0 = none), tissot {step, r}, year, labels}` | the drawing (§9) |
| `places` | ≤ 500 `{id!, lat!, lon!, label (key), c (role)}` | points; lat/lon may be expressions (a moving place) |
| `routes` | ≤ 32 `{id!, via! [≥ 2 place ids], method geodesic\|sphere\|rhumb, c}` | lines drawn on the map |
| `network` | `{edges! [{a!, b!, mode!, km, open, oneway}], speeds {mode: km/day}, costs {mode: per km}, factor}` | §8 |
| `territories` | ≤ 64 `{id!, from, to, rings! [[lon, lat, …]], label, c, big}` | §6; ≤ 16 rings, ≤ 20 000 vertices in all |
| `units` | ≤ 12 `{name: {m!, min, max}}` | extra units of length in metres with their plausible range (§10) |

### 1.2 Checker codes (`checkSpec`)

| code | when |
|---|---|
| `format` / `value` / `size` / `enum` / `unknown-field` (warning) | the shared walker (`NoemaLibCore.walk`): wrong shape, missing required field, list too long, unknown name |
| `dup` | two places or two territories with the same id |
| `value` | a latitude outside ±90; `to ≤ from`; a bbox that is not `[w, s, e, n]` with −90 ≤ s < n ≤ 90; `units` with min > m or max < m; `utm` without `zone` or `lon0` |
| `ring` | a ring with an odd count of numbers, or a latitude outside ±90 |
| `projection` | a cone with `lat2 = −lat1` (n = 0); a standard parallel at ±90° |
| `ref` | a route, edge or output naming a place or territory that does not exist; an edge from a place to itself; a unit that is neither built in nor in `model.units`; `route*` or a map `path` without `model.network`; `scale`/`xy` without `model.projection` |
| `enum` | a key of `network.speeds`/`costs` that is not a mode |
| `projection` (warning) | a map scene without `model.projection` (drawn in plate carrée) |
| `output` | an `of` that does not exist for that `kind` |

## 2. The figure of the Earth

| name | a (m) | 1/f | source |
|---|---|---|---|
| WGS84 | 6 378 137 | 298.257223563 | NGA.STND.0036 (2014) |
| GRS80 | 6 378 137 | 298.257222101 | Moritz 1980, Bull. Géod. 54:395 |
| clarke1866 | 6 378 206.4 | b = 6 356 583.8 | Snyder 1987 p. 12 |
| intl1924 (Hayford) | 6 378 388 | 297 | Snyder 1987 p. 12 |
| bessel1841 | 6 377 397.155 | 299.1528128 | Snyder 1987 p. 12 |
| sphere | `radius`, default R₁ = 6 371.0088 km | — | IUGG mean radius (2a + b)/3 of WGS84 (Moritz 1980) |

The meridian arc M(φ) uses Helmert's series in n = f/(2 − f) (quarter meridian of WGS84: 10 001 965.7293 m, checked against a
Simpson integral of the radius of curvature). The isometric latitude ψ = atanh(sin φ) − e·atanh(e sin φ) serves the rhumb line
and Mercator.

## 3. Distances and bearings

| output | fields | result |
|---|---|---|
| `distance` (scalar) | `from!`, `to!` (places), `method` geodesic (default) · haversine · sphere · rhumb, `unit` (default km), `bound` best·min·max | length in `unit` |
| `bearing` (scalar) | `from!`, `to!`, `method` geodesic · sphere · rhumb, `end` initial (default) · final | azimuth 0–360° |

- **geodesic**: the shortest path on the ellipsoid by Karney's algorithm (Karney 2013, *Algorithms for geodesics*, J. Geodesy 87:43,
  through GeographicLib 2.2.0): accurate to 15 nm everywhere, the near-antipodal cases included, where Vincenty's iteration (1975) does
  not converge. Antipodal points get the code `antipodal` (the length is right, the azimuth is one of infinitely many).
- **haversine** (Sinnott 1984, Sky & Telescope 68:159) on the sphere of `radius`: the classic formula, ill-conditioned only near the
  antipode. **sphere** uses the atan2 form (accurate for every pair, exactly π at the antipode). On WGS84 the sphere with R₁ errs by up
  to ≈ 0.5 % against the ellipsoid (Rome → Alexandria: 1 951.41 vs 1 952.78 km).
- **rhumb** (loxodrome, constant course): s = (φ₂ − φ₁)/cos α along the meridian arc, with tan α = Δλ/Δψ; due east–west (0/0) it is the
  parallel's arc. A rhumb line from or to a pole has no course: NaN with `rhumb_pole`.
- `bearing` between the same point is NaN with `same_point`.

## 4. Projections (`model.projection`)

Formulas and test values from Snyder 1987 (*Map Projections — A Working Manual*, USGS PP 1395) unless named; forward only (lat, lon →
x, y in metres; `x0`, `y0` false easting/northing). Five projections use the ellipsoid; the rest use the sphere of `radius` (as PROJ and
d3 do for world maps; the difference is far below a drawing's resolution).

| `type` | class · property | ellipsoid | parameters (defaults) | source |
|---|---|---|---|---|
| `equirect` | cylindrical · equidistant meridians | sphere | `lat1` standard parallel (0), `lat0` | Snyder ch. 12 |
| `mercator` | cylindrical · conformal | yes | `k0` (1), `maxLat` (85.0511°, the web square; ≤ 89.9) | Snyder 7-7 |
| `tmerc` | transverse cylindrical · conformal | yes | `lon0`, `lat0`, `k0` (1) | Krüger 1912 n-series to n⁴ (Karney 2011, J. Geodesy 85:475): < 0.1 mm in a zone |
| `utm` | as tmerc | yes | `zone` 1–60 or `lon0`, `south`; k0 0.9996, x0 500 km, y0 10 000 km south | NGA.SIG.0012 |
| `lcc` | conic · conformal | yes | `lat1` (33), `lat2` (= lat1: one parallel), `lat0`, `lon0` | Snyder 15-1…15-9 |
| `albers` | conic · equal-area | yes | `lat1` (29.5), `lat2` (45.5), `lat0`, `lon0` | Snyder 14-1…14-15 |
| `stereo` | azimuthal · conformal | sphere | `lat0`, `lon0`, `k0`, `clip` (160°) | Snyder 21-2 |
| `ortho` | azimuthal · perspective (the globe) | sphere | `lat0`, `lon0`, `clip` (90°) | Snyder 20-3 |
| `aeqd` | azimuthal · equidistant from the centre | sphere | `lat0`, `lon0`, `clip` (179.5°) | Snyder 25-2 |
| `laea` | azimuthal · equal-area | sphere | `lat0`, `lon0`, `clip` (179.5°) | Snyder 24-2 |
| `gnomonic` | azimuthal · great circles are straight | sphere | `lat0`, `lon0`, `clip` (65°, ≤ 85°) | Snyder 22-3 |
| `robinson` | pseudocylindrical · compromise | sphere | — | Robinson 1974, table every 5° (Catmull–Rom between nodes, ≤ 1e-4 from PROJ) |
| `eqearth` | pseudocylindrical · equal-area | sphere | — | Šavrič, Patterson & Jenny 2018, IJGIS 33:454 |
| `wintri` | compromise (National Geographic 1998–) | sphere | `lat1` (acos 2/π = 50.4598°, Winkel 1921) | Snyder 1993 *Flattening the Earth*; PROJ's default lat_1 = 0 differs |
| `mollweide` | pseudocylindrical · equal-area | sphere | — | Snyder 31-4 (Newton on 2θ + sin 2θ = π sin φ) |
| `sinusoidal` | pseudocylindrical · equal-area | sphere | — | Snyder 30-1 |
| `cea` | cylindrical · equal-area (Lambert; Gall–Peters with lat1 45) | sphere | `lat1` (0) | Snyder 10-1 |

- `xy` (scalar: `lat!`, `lon!`, `axis!` x·y, `unit` m·km) gives the projected coordinate.
- Limits instead of infinities: Mercator is clamped at `maxLat` (code `clamped`); transverse Mercator is undefined where
  B = cos φ sin Δλ → ±1 and is cut at |B| ≥ sin 80° (`not_visible`); azimuthal projections show only the cap within `clip` of the
  centre (`not_visible` beyond, the far side of `ortho`); a cone with n = 0 gives `cone_n0` (and is refused by the checker when it is
  static: `lat2 = −lat1`).

## 5. Distortion (Tissot 1881)

`scale` (scalar: `lat!`, `lon!`, `what!`; series: `what!`, `lon`, `from!`, `to!`, `n` along a meridian) gives Tissot's indicatrix at a
point of the projection: `h` (scale along the meridian), `k` (along the parallel), `s` (areal scale h·k·sin θ′), `a`, `b` (the
semi-axes), `omega` (maximum angular distortion, degrees, ω = 2 asin((a − b)/(a + b))). Computed by central differences of the forward
projection (step 1e-6 rad) over the radii of curvature M and N cos φ of the figure (Snyder 1987 eqs 4-2…4-12), so it is the same code
for every projection and matches the closed forms (Mercator h = k = sec φ, s = sec²φ, ω = 0; plate carrée at 60°: k = 2,
ω = 38.9424°; equal-area projections s = 1). At a pole the indicatrix is undefined: NaN with `pole`; outside the projection's domain
`outside`. On the map, `view.tissot {step (deg, ≥ 5), r (deg, default 2.5)}` draws small circles of the globe as projected ellipses
(role `warn`).

## 6. Territories through time

| output | fields | result |
|---|---|---|
| `area` (scalar) | `territory!`, `method` geodesic (default) · sphere, `unit` km2 · m2 · ha · mi2 | outline minus holes |
| `area` (series) | `territory!`, `from!`, `to!`, `n` (≤ 2000) | the area each year (0 when not in force) |
| `perimeter` (scalar) | `territory!`, `method`, `unit`, `bound` | all rings |
| `contains` (scalar) | `territory!`, `place!`, `year` | 1 / 0 (0 when not in force) |
| `overlap` (scalar) | `a!`, `b!`, `year`, `cell` (deg, default 0.25), `unit` | the area of a ∩ b |
| `inForce` (scalar) | `territory!`, `year!` | 1 / 0 |
| `count` (scalar) | `year!` | territories in force |
| `years` (series) | `from!`, `to!`, `n` | the year axis |

- **Edges are geodesics.** The geodesic area is GeographicLib's PolygonArea (Karney 2013 §6: exact for geodesic edges on the
  ellipsoid); the spherical area is the exact spherical excess of a polygon with great-circle edges (per-edge signed excess,
  Bevis & Cambareri 1987, Math. Geology 19:335: tan(E/2) per edge). The often-quoted trapezoid formula ½ΣΔλ(sin φ₁ + sin φ₂) is not used: it treats edges
  as rhumb lines and gives π/4 instead of π/2 for the octant with a vertex at the pole. Winding does not matter: the smaller side is
  taken unless `big: true` (a territory larger than a hemisphere).
- **Containment**: crossing number (W. R. Franklin's PNPOLY) on longitudes unwrapped along the ring, so a ring across the antimeridian
  works. A ring that winds around a pole has no inside in that sense: NaN with `pip_pole`.
- **Overlap**: an equal-area raster on the intersection of the two bounding boxes; each cell's area is exact,
  R_A²·Δλ·(sin φ₂ − sin φ₁), R_A the authalic radius of WGS84, 6 371 007.1809 m (Moritz 1980). The error is about a cell's width along
  the boundaries; a 10° × 2° box at 30°N (211 950 km²) is found within 1 %. The work is bounded (cells ≤ 400 000 and cells × vertices
  ≤ 3·10⁷); when the bound is hit the cell doubles and the code `coarse` says so.

## 7. Ancient measurement and time

| output | fields | result | source |
|---|---|---|---|
| `arcToCircle` | `angle!` (deg), `base!`, `unit` (of base, default km), `to`, `bound` | the circumference base·360/angle | Cleomedes, *Caelestia* 1.7 (Eratosthenes: 7.2° = 1/50 and 5 000 stadia → 250 000) |
| `gnomonLat` | `shadow!`, `gnomon!`, `decl` (deg), `limb` | latitude φ = atan(shadow/gnomon) + δ (+ 0.2667° when the shadow's edge is the sun's upper limb) | Strabo 2.5.41 (Pytheas at Massalia, 120 : 41.8) |
| `obliquity` | `year!` | ε in degrees | Laskar 1986, A&A 157:59 (10th-degree polynomial; IAU J2000 23°26′21.448″) |
| `timeToLon` | `minutes!` | degrees of longitude (4 min = 1°) | — |

`obliquity` outside ±10 000 years of 2000 gives a number with `laskar_range` (the polynomial diverges). A zero gnomon or angle gives NaN
with `gnomon` or `angle`. In 240 BCE (year −239) ε = 23.7242°: the Tropic of Cancer that Eratosthenes put at Syene (24.09°N) was then
≈ 0.37° south of it, which an activity can show.

## 8. Journeys on a network (`model.network`)

ORBIS (Scheidel & Meeks 2012, *ORBIS: The Stanford Geospatial Network Model of the Roman World*) in miniature: places joined by edges of
a mode; Dijkstra's algorithm finds the cheapest path by `days`, `km` or `cost` (ties broken by place order, so deterministic).

| mode | km/day (default) | cost per km (relative) | source of the default |
|---|---|---|---|
| `road` | 30 | 28 | Vegetius 1.9: 20 Roman miles in 5 summer hours ≈ 29.6 km (ORBIS foot); Diocletian's Price Edict (301 CE): road 28 |
| `track` | 20 | 28 | half a day's march slower (a teaching value) |
| `river` (downstream) | 40 | 4.9 | Price Edict: river 4.9 (Duncan-Jones 1974, *The Economy of the Roman Empire*) |
| `riverUp` (the same edge b → a) | 15 | 9.8 | upstream towing (teaching value: ×2 cost) |
| `sea` | 130 | 1 | ≈ 3 knots × 24 h (Casson 1951, TAPA 82:136: 2–6 kn); Price Edict sea 1 |
| `coast` | 90 | 1 | coasting by day |

- An edge's length is `km` when given, otherwise the geodesic between its places × `factor` (default 1; 1.2 is a usual detour factor
  for roads). `open` (numx, default 1) closes the edge when it is 0: the sailing season, a war, a flood — usually an expression over a
  param. Edges go both ways (a river edge is `river` a → b and `riverUp` b → a) unless `oneway`.
- `speeds`/`costs` override the defaults per mode (numx: a slider can change the sea's speed).
- Outputs: `route` (scalar: `from!`, `to!`, `by` days·km·cost (default days), `what` days·km·cost·legs·found) and the cumulative series
  `routeKm`, `routeDays`, `routeCost` (one value per stop, from 0). No path: NaN, empty series, `found` = 0, code `no_route`.
- These are models, not history: real voyages depended on wind, season and direction (ORBIS distinguishes them per month). The defaults
  are stated so that an author changes them knowingly.

## 9. The map scene (`of: "map"`)

Fields: `year` (numx: which territories are drawn; default `view.year`), `path {from!, to!, by}` (the network route, drawn as segments
in role `hi`), `labels` (bool). The scene, in kilometres of the projection plane, holds in order: the land outline (`muted` polygons;
Natural Earth 1:110m, densified on conics and azimuthals), the graticule, the territories in force (filled when whole; role `c`,
default `info`), the `routes` (geodesics as 64-point lines, rhumb lines or great circles), the network path, the Tissot ellipses and the
places with their `label` keys. Lines are cut where they cross the projection's antimeridian or leave the visible cap — never a line
across the whole map. The view is the projected outline of `view.bbox` (default the world; an east < west bbox crosses the
antimeridian). Bounded: ≤ 2000 items (the land is clipped to the view).

## 10. Units of length

`unit`, `from`, `to` name a built-in unit or one of `model.units`; `bound` picks the value: `best` (default), `min` or `max` of its
plausible range (metres). `convert` (scalar: `value!`, `from!`, `to!`, `bound`) converts.

| unit | best | range | source |
|---|---|---|---|
| m, km, mi, nmi | 1, 1000, 1609.344, 1852 | exact | international definitions (1959, 1929) |
| `pes` (Roman foot) | 0.2957 | 0.294–0.297 | Hultsch 1882, *Griechische und römische Metrologie* |
| `passus` | 1.479 | 1.47–1.485 | 5 pedes |
| `romanMile` (mille passus) | 1479 | 1470–1485 | 1000 passus |
| `leuga` (Gallic league) | 2220 | 2200–2450 | 1½ Roman miles (Ammianus 16.12.8) |
| `stade` (unspecified) | 185 | 157.5–210 | 8 stadia = 1 Roman mile (Polybius, Strabo); range: Engels 1985, AJPh 106:298 |
| `stadeAttic` · `stadeOlympic` | 177.6 · 192.27 | — | 600 feet of 0.296 / 0.32045 m |
| `stadeEratosthenes` | 157.5 | 157.5–185 | Pliny NH 12.53 (40 stadia per schoenus) against 8 stadia per Roman mile (Engels 1985); the debate is the point |
| `schoenus` | 6300 | 4725–11100 | Herodotus 2.6 (60 stadia), Pliny (30–40): it varied (30 × 157.5 … 60 × 185 m) |
| `parasang` | 5550 | 5000–6700 | Herodotus 5.53 (30 stadia; an hour's march) |
| `arabMil` · `farsakh` | 1973 · 5919 | 1900–2000 · 5700–6000 | al-Maʾmūn's survey (4 000 black cubits of 49.3 cm); farsakh = 3 mil |
| `league` (English) · `lieue` · `legua` | 4828.032 · 3898 · 5572 | exact · 3248–4828 · 4180–6687 | 3 miles; lieue de Paris (1674); legua legal of Castile (1568) |

Eratosthenes' 250 000 stadia are 39 375 km with the 157.5 m stade and 46 250 km with the 185 m stade (Earth: 40 007.9 km polar).

## 11. Runtime codes

| code | meaning |
|---|---|
| `antipodal` | geodesic between antipodal points: the azimuth is not unique |
| `same_point` | a bearing between a point and itself |
| `rhumb_pole` | a rhumb line from or to a pole |
| `pole` · `outside` | Tissot's indicatrix at a pole · outside the projection |
| `clamped` | Mercator latitude beyond `maxLat`, drawn at the limit |
| `not_visible` | a point outside the projection's domain (far side, TM singularity, beyond `clip`) |
| `cone_n0` | a conic projection whose cone constant is 0 |
| `no_route` | no path in the network |
| `pip_pole` | containment in a ring around a pole |
| `coarse` | the overlap raster was coarsened to stay within the work bound |
| `gnomon` · `angle` | a gnomon or an angle ≤ 0 |
| `laskar_range` | obliquity beyond ±10 000 years |
| `no_geodesic` · `no_basemap` | the vendored GeographicLib / land outline is not loaded |
| `error` | an internal failure (the output is NaN, empty or an empty scene) |

## 12. Limits

≤ 500 places; ≤ 2000 edges; ≤ 32 routes of ≤ 64 stops; ≤ 64 territories, ≤ 16 rings each, ≤ 4000 numbers per ring, ≤ 20 000 vertices
in all; overlap ≤ 400 000 cells and ≤ 3·10⁷ cell × vertex tests; series ≤ 2000 values; scenes ≤ 2000 items. Measured in node on the
test machine: a typical run 30–40 ms, the worst overlap ≈ 0.8 s.

## 13. Reference values asserted by `tests/lib_map.js`

| what | value | source |
|---|---|---|
| Mercator (sphere R = 1; Clarke 1866), 35°N 75°W, λ₀ = 180°W | x 1.8325957, y 0.6528366; 11 688 673.7, 4 139 145.6 m | Snyder pp. 266–267 |
| LCC 33/45, φ₀ 23, λ₀ −96 (sphere; Clarke) | 0.2966785, 0.2462112; 1 894 410.9, 1 564 649.5 m; k = 0.9970040 | Snyder pp. 295–296 |
| Albers 29.5/45.5 (sphere; Clarke) | 0.2952720, 0.2416774; 1 885 472.7, 1 535 925.0 m | Snyder pp. 291–292 |
| UTM 33N, Rome 41.9028 N 12.4964 E | E 292 335.313, N 4 642 015.500 m (1 mm) | PROJ 9 |
| LAEA, Equal Earth, Robinson, Mollweide, CEA (φs 45) | as PROJ 9 to 1e-7 (Robinson between nodes 5e-4) | PROJ 9 / d3-geo |
| Karney 2013 Table 2 (direct 40°, 30°, 10 000 km) | φ₂ 41.79331020506, λ₁₂ 137.84490004377, α₂ 149.09016931807 | Karney 2013 |
| near-antipodal (−30, 0) → (29.9, 179.8) | s 19 989 832.8276 m | Karney 2013 (Vincenty fails) |
| Rome → Alexandria, WGS84 | 1 952 776.867 m, α₁ 121.800848°, α₂ 132.264973°; haversine R₁ 1 951 411.9 m; rhumb 1 955 473.55 m at 127.370747° | GeographicLib / PROJ Geod |
| antipodal on the equator | 20 003 931.4586 m (half the meridian ellipse) | GeographicLib |
| WGS84 quarter meridian | 10 001 965.7293 m | GeographicLib |
| WGS84 area (8 × octant) · 1° cell at the equator | 510 065 621 724 088.5 m² · 12 308 778 361.47 m² | Karney 2013 §6 / PolygonArea |
| haversine BNA → LAX (R = 6372.8 km) | 2 887.2599506 km | Rosetta Code |
| obliquity J2000 · 240 BCE | 23.4392911° · 23.7242° | IAU / Laskar 1986 |
| Pytheas' gnomon at the solstice | φ ≈ 42.93° | Strabo 2.5.41 |
| Tissot: Mercator 60°, plate carrée 60°, polar aeqd at the equator, Equal Earth | h 2, s 4, ω 0; k 2, ω 38.9424°; k π/2, ω 25.6567°; s 1, ω 10.3447° | closed forms |

Also asserted: every edge case of §11, the itinerary spec through the sim adapter, the antimeridian cut, the checker's codes, the
Worker source (vendor + core + engine) giving identical outputs in a fresh `vm` context, and the time bounds.

## 14. Vendored dependencies

| directory | library | version | licence | size | why |
|---|---|---|---|---|---|
| `src/engines/map/vendor/` | GeographicLib geodesic (C. Karney) | 2.2.0 | MIT | 32 kB (min.js; wrapper `noema-geodesic.js` 33 kB) | exact geodesics and polygon areas on the ellipsoid; the reference implementation |
| `src/engines/map/vendor/` | world-atlas `land-110m.json` (M. Bostock), Natural Earth 4.1.0 1:110m | 2.0.2 | ISC; data public domain | 55 kB (wrapper `noema-land-110m.js` 56 kB) | the basemap; decoded by the engine (no topojson-client) |

Each directory's README gives the source URL and sha256. The page must load `noema-geodesic.js` and `noema-land-110m.js` before
`src/engines/map/map.ts` (the Worker source is assembled when the module loads).

## 15. Not covered (and why)

Inverse projections (the engine draws and measures; it does not pick points from the screen); datum shifts between historical
ellipsoids (Helmert transformations: out of scope for teaching); a full ORBIS with seasonal winds per direction (the `open`/`speeds`
expressions let an author model a season); higher-resolution coastlines (1:50m is 750 kB, too big to vendor for a teaching map);
ancient coastlines (the 110m outline is modern: the Nile delta, Ostia, Ephesus are where they are today).

## Uses the kernel

No duplicated facility (geodesy and projections; no randomness, no time loop): nothing to move (checked 2026-11-07).
