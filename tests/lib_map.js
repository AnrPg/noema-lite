/* map@1 (engine/src/48_lib_map.js, docs/library/map.md): published reference values (Snyder 1987, Karney 2013, Šavrič et al. 2018,
   PROJ 9 / GeographicLib 2.1 as independent implementations), the edge cases and their codes, the checks, the sim adapter, the Worker
   source in a fresh global, speed.   Run: node tests/lib_map.js */
'use strict';
const path = require('path'), vm = require('vm'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src'), VEN = path.join(ROOT, 'engine', 'vendor');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol, `${m}: ${a} ≈ ${b} (± ${tol})`);
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js'));
require(path.join(VEN, 'geographiclib-geodesic@2.2.0', 'noema-geodesic.js'));
require(path.join(VEN, 'world-atlas@2.0.2', 'noema-land-110m.js'));
require(path.join(SRC, '46_lib_core.js'));
require(path.join(SRC, '48_lib_map.js'));
const M = globalThis.NoemaLibMap;
const sp = M.ellipsoid('sphere', 1), clk = M.ellipsoid('clarke1866'), wgs = M.ellipsoid('WGS84');
const xy = (P, el, R, lat, lon) => M.makeProjection(P, el, R).fwd(lat, lon);
const both = (r, x, y, tol, m) => { near(r[0], x, tol, m + ' x'); near(r[1], y, tol, m + ' y'); };

// ---- 1. projections: Snyder 1987 worked examples (USGS PP 1395, Part 3), PROJ 9 agrees ----
both(xy({ type: 'mercator', lon0: -180 }, sp, 1, 35, -75), 1.8325957, 0.6528366, 1e-7, 'Mercator sphere (Snyder p. 266)');
both(xy({ type: 'mercator', lon0: -180 }, clk, 1, 35, -75), 11688673.7, 4139145.6, 0.1, 'Mercator Clarke 1866 (Snyder p. 267)');
both(xy({ type: 'lcc', lat1: 33, lat2: 45, lat0: 23, lon0: -96 }, sp, 1, 35, -75), 0.2966785, 0.2462112, 1e-7, 'Lambert conformal conic sphere (Snyder p. 295)');
both(xy({ type: 'lcc', lat1: 33, lat2: 45, lat0: 23, lon0: -96 }, clk, 1, 35, -75), 1894410.9, 1564649.5, 0.1, 'Lambert conformal conic Clarke 1866 (Snyder p. 296)');
both(xy({ type: 'albers', lat1: 29.5, lat2: 45.5, lat0: 23, lon0: -96 }, sp, 1, 35, -75), 0.2952720, 0.2416774, 1e-7, 'Albers sphere (Snyder p. 291)');
both(xy({ type: 'albers', lat1: 29.5, lat2: 45.5, lat0: 23, lon0: -96 }, clk, 1, 35, -75), 1885472.7, 1535925.0, 0.1, 'Albers Clarke 1866 (Snyder p. 292)');
both(xy({ type: 'tmerc', lon0: -75 }, sp, 1, 40.5, -73.5), 0.0199077, 0.7070276, 1e-7, 'transverse Mercator sphere (Snyder 8-1…8-3; PROJ 9 tmerc identical)');
both(xy({ type: 'utm', zone: 33 }, wgs, 1, 41.9028, 12.4964), 292335.3131, 4642015.5000, 1e-3, 'UTM 33N, Rome, Krüger series (PROJ 9 utm, Poder/Engsager)');
both(xy({ type: 'stereo', lat0: 40, lon0: -100 }, sp, 1, 30, -75), 0.3807224, -0.1263802, 1e-7, 'stereographic sphere (Snyder 21-2…21-4; PROJ 9)');
both(xy({ type: 'ortho', lat0: 40, lon0: -100 }, sp, 1, 30, -110), -0.1503837, -0.1651911, 1e-7, 'orthographic (Snyder p. 311)');
both(xy({ type: 'aeqd', lat0: 40, lon0: -100 }, sp, 3, -20, 100), -5.8311398, 5.5444634, 1e-7, 'azimuthal equidistant R = 3 (Snyder p. 337)');
both(xy({ type: 'laea', lat0: 40, lon0: -100 }, sp, 1, 30, -110), -0.1513429, -0.1662447, 1e-7, 'Lambert azimuthal equal-area (PROJ 9 laea)');
both(xy({ type: 'gnomonic', lat0: 40, lon0: -100 }, sp, 1, 30, -110), -0.1542826, -0.1694739, 1e-7, 'gnomonic (PROJ 9 gnom)');
near(xy({ type: 'eqearth' }, sp, 1, 0, 180)[0], 2.7066300, 1e-7, 'Equal Earth x(180°, 0) (Šavrič et al. 2018; PROJ eqearth)');
near(xy({ type: 'eqearth' }, sp, 1, 90, 0)[1], 1.3173628, 1e-7, 'Equal Earth y at the pole');
both(xy({ type: 'eqearth' }, sp, 1, 45, 30), 0.3866182, 0.8602311, 1e-7, 'Equal Earth (30°E, 45°N) (PROJ eqearth, d3 geoEqualEarth)');
near(xy({ type: 'robinson' }, sp, 1, 0, 180)[0], 0.8487 * Math.PI, 1e-9, 'Robinson x(180°, 0) = 0.8487 π (Robinson 1974 table)');
both(xy({ type: 'robinson' }, sp, 1, 45, 30), 0.3982518, 0.7533663, 1e-6, 'Robinson at a 5° node (PROJ robin)');
both(xy({ type: 'robinson' }, sp, 1, 62.5, -120), -1.3854269, 1.0314360, 5e-4, 'Robinson between nodes (PROJ robin; interpolation differs ≤ 1e-4)');
near(xy({ type: 'wintri' }, sp, 1, 0, 180)[0], 1 + Math.PI / 2, 1e-12, 'Winkel tripel x(180°, 0) = 1 + π/2 with φ1 = acos(2/π) (d3 geoWinkel3)');
both(xy({ type: 'wintri' }, sp, 1, 45, 30), 0.3718568, 0.7890960, 1e-7, 'Winkel tripel (30°E, 45°N) (d3-geo-projection 4.0 geoWinkel3)');
both(xy({ type: 'mollweide' }, sp, 1, 45, 30), 0.3799083, 0.8372735, 1e-7, 'Mollweide (PROJ moll)');
both(xy({ type: 'cea', lat1: 45 }, sp, 1, 45, 30), 0.3702402, 1, 1e-7, 'Gall–Peters / cylindrical equal-area φs = 45° (PROJ cea)');

// ---- 2. Tissot (Snyder 1987 §4) ----
const tis = (P, lat, lon) => M.tissot(M.makeProjection(P, sp, 1), lat, lon);
{ const t = tis({ type: 'mercator' }, 60, 0); near(t.h, 2, 1e-5, 'Mercator h at 60° = sec 60°'); near(t.s, 4, 1e-5, 'Mercator areal scale at 60° = sec² 60°'); near(t.omega, 0, 1e-4, 'Mercator is conformal (ω = 0)'); }
{ const t = tis({ type: 'equirect' }, 60, 0); near(t.k, 2, 1e-6, 'plate carrée k at 60°'); near(t.omega, 38.9424, 1e-3, 'plate carrée ω at 60° = 2 asin(1/3)'); }
{ const t = tis({ type: 'aeqd', lat0: 90 }, 0, 0); near(t.k, Math.PI / 2, 1e-6, 'polar azimuthal equidistant k at the equator = π/2'); near(t.omega, 25.6567, 1e-3, '… and ω = 25.6567°'); }
{ const t = tis({ type: 'eqearth' }, 45, 30); near(t.s, 1, 1e-6, 'Equal Earth is equal-area (s = 1)'); near(t.omega, 10.3447, 1e-3, 'Equal Earth ω at (30°E, 45°N)'); }
near(tis({ type: 'albers', lat1: 29.5, lat2: 45.5, lat0: 23, lon0: -96 }, 35, -75).s, 1, 1e-6, 'Albers is equal-area');
near(tis({ type: 'lcc', lat1: 33, lat2: 45, lat0: 23, lon0: -96 }, 35, -75).k, 0.9970040, 1e-6, 'LCC k at 35°N (Snyder p. 296: 0.9970040)');
near(tis({ type: 'lcc', lat1: 33, lat2: 45, lat0: 23, lon0: -96 }, 45, -96).k, 1, 1e-6, 'LCC k = 1 on a standard parallel');
ok(tis({ type: 'mercator' }, 90, 0).code === 'pole' && Number.isNaN(tis({ type: 'mercator' }, 90, 0).h), 'Tissot at a pole: NaN with the code pole');

// ---- 3. distances, bearings (Karney 2013; GeographicLib 2.1 / PROJ Geod agree) ----
const G = globalThis.NoemaVendorGeodesic.lib.Geodesic.WGS84;
{ const r = G.Direct(40, 0, 30, 10e6); near(r.lat2, 41.79331020506, 1e-9, 'Karney 2013 Table 2 direct: φ2'); near(r.lon2, 137.84490004377, 1e-9, 'λ12'); near(r.azi2, 149.09016931807, 1e-9, 'α2'); }
{ const r = G.Inverse(-30, 0, 29.9, 179.8); near(r.s12, 19989832.8276, 1e-4, 'Karney 2013 near-antipodal inverse s12 (Vincenty 1975 does not converge here)'); near(r.azi1, 161.890524736, 1e-8, 'α1'); }
near(M.meridian(wgs, Math.PI / 2), 10001965.7293, 1e-3, 'WGS84 quarter meridian (Helmert series; GeographicLib)');
near(M.havArc(36.12, -86.67, 33.94, -118.40) * 6372.8, 2887.2599506, 1e-6, 'haversine BNA → LAX, R = 6372.8 km (Rosetta Code)');
near(M.sphArc(0, 0, 0, 180), Math.PI, 1e-15, 'sphere atan2 form at the antipode: exactly π');
{ const r = M.rhumb(wgs, 0, 0, 0, 90); near(r.s, 6378137 * Math.PI / 2, 1e-3, 'rhumb along the equator = a·π/2 (the 0/0 case)'); near(r.azi, 90, 1e-12, 'course 90°'); }
{ const r = M.rhumb(wgs, 41.8933, 12.4828, 31.1975, 29.8925); near(r.s, 1955473.55, 1, 'rhumb Rome → Alexandria WGS84 (meridian-arc formula)'); near(r.azi, 127.370747, 1e-5, 'its course'); }
near(M.rhumb(M.ellipsoid('sphere', 6371008.8), 41.8933, 12.4828, 31.1975, 29.8925).s, 1954106.45, 1, 'rhumb on the sphere (Δφ/Δψ form)');
ok(M.rhumb(wgs, 90, 0, 10, 10).code === 'rhumb_pole', 'a rhumb line from a pole: code rhumb_pole');
{ // the rhumb's meridian arc against a numerical integral of M(φ) (independent check of the series)
  const el = wgs, f = p => el.a * (1 - el.e2) / Math.pow(1 - el.e2 * Math.sin(p) ** 2, 1.5); let s = 0; const N = 20000, b = 0.7;
  for (let i = 0; i < N; i++) { const x0 = b * i / N, x1 = b * (i + 1) / N; s += (f(x0) + 4 * f((x0 + x1) / 2) + f(x1)) * (x1 - x0) / 6; }
  near(M.meridian(el, b), s, 1e-6, 'meridian arc series = Simpson integral of M(φ) at 40.1°'); }

// ---- 4. areas, containment ----
near(Math.abs(M.sphExcess([[0, 0], [90, 0], [0, 90]])), Math.PI / 2, 1e-12, 'octant with a vertex at the pole: spherical excess π/2 (the trapezoid formula gives π/4)');
near(M.ringArea([[0, 0], [90, 0], [0, 90]], wgs, 0, 'geodesic') * 8, 510065621724088.5, 2, 'WGS84 ellipsoid area = 8 × geodesic octant (Karney 2013 §6)');
near(M.ringArea([[0, 0], [1, 0], [1, 1], [0, 1]], wgs, 0, 'geodesic'), 12308778361.47, 1, '1° × 1° cell at the equator, geodesic edges (GeographicLib PolygonArea)');
near(M.ringArea([[0, 0], [0, 1], [1, 1], [1, 0]], wgs, 0, 'geodesic'), 12308778361.47, 1, 'the same cell clockwise: the winding does not change the area');
ok(M.inRing([[0, 0], [10, 0], [10, 10], [0, 10]], 5, 5) === true && M.inRing([[0, 0], [10, 0], [10, 10], [0, 10]], 5, 15) === false, 'point in polygon');
ok(M.inRing([[170, -10], [-170, -10], [-170, 10], [170, 10]], 0, 180) === true && M.inRing([[170, -10], [-170, -10], [-170, 10], [170, 10]], 0, 0) === false, 'a polygon across the antimeridian');
ok(M.inRing(Array.from({ length: 36 }, (_, i) => [i * 10 - 180, -70]), -80, 0) === null, 'a ring around a pole: undefined (null → code pip_pole)');
ok(M.wrap180(190) === -170 && M.wrap180(-180) === 180 && M.wrap180(540) === 180, 'longitudes normalised to (-180, 180]');

// ---- 5. ancient measurement ----
near(M.obliquity(2000).v, 23.4392911, 1e-6, 'obliquity at J2000 = 23°26′21.448″ (IAU; Laskar 1986)');
near(M.obliquity(-239).v, 23.7242, 1e-3, 'obliquity in 240 BCE (Laskar 1986): the Tropic was at ≈ 23.72°');
ok(M.obliquity(-12000).code === 'laskar_range', 'obliquity beyond ±10 000 years: code laskar_range');
near(M.gnomonLat(41.8, 120, 23.7242, false), 42.93, 0.01, 'Pytheas at Massalia: gnomon 120 : shadow 41.8 at the solstice → φ ≈ 43° (Strabo 2.5.41)');

// ---- 6. the sim adapter: whole specs ----
const P = [{ id: 'roma', lat: 41.8933, lon: 12.4828, label: 'roma' }, { id: 'alex', lat: 31.1975, lon: 29.8925, label: 'alex' }, { id: 'ostia', lat: 41.7556, lon: 12.2914 }, { id: 'brun', lat: 40.6327, lon: 17.9418 }, { id: 'syene', lat: 24.0889, lon: 32.8998 }];
const spec = {
  format: 'noema.sim-spec/v1', engine: 'map@1', params: [{ id: 'month', kind: 'slider', label: 'm', min: 1, max: 12, default: 7 }],
  model: { places: P, projection: { type: 'lcc', lat1: 33, lat2: 43, lat0: 38, lon0: 20 }, view: { bbox: [-12, 25, 45, 50], graticule: 10 },
    network: { edges: [{ a: 'roma', b: 'ostia', mode: 'road', km: 30 }, { a: 'ostia', b: 'alex', mode: 'sea', open: 'month >= 4 && month <= 10' }, { a: 'roma', b: 'brun', mode: 'road', km: 560 }, { a: 'brun', b: 'alex', mode: 'sea' }] },
    territories: [{ id: 'rome', from: -27, to: 476, rings: [[-10, 30, 40, 30, 40, 50, -10, 50]], c: 'info' }, { id: 'egy', from: -30, to: 641, rings: [[25, 22, 35, 22, 35, 32, 25, 32]] }] },
  outputs: [
    { id: 'd', kind: 'scalar', of: 'distance', from: 'roma', to: 'alex', unit: 'm' }, { id: 'h', kind: 'scalar', of: 'distance', from: 'roma', to: 'alex', method: 'haversine', unit: 'm' },
    { id: 'rm', kind: 'scalar', of: 'distance', from: 'roma', to: 'alex', unit: 'romanMile' }, { id: 'rmLo', kind: 'scalar', of: 'distance', from: 'roma', to: 'alex', unit: 'romanMile', bound: 'max' },
    { id: 'b', kind: 'scalar', of: 'bearing', from: 'roma', to: 'alex' }, { id: 'b2', kind: 'scalar', of: 'bearing', from: 'roma', to: 'alex', end: 'final' },
    { id: 'days', kind: 'scalar', of: 'route', from: 'roma', to: 'alex', by: 'days' }, { id: 'legs', kind: 'scalar', of: 'route', from: 'roma', to: 'alex', what: 'legs' },
    { id: 'cost', kind: 'scalar', of: 'route', from: 'roma', to: 'alex', by: 'cost', what: 'cost' },
    { id: 'aE', kind: 'scalar', of: 'area', territory: 'egy' }, { id: 'aS', kind: 'scalar', of: 'area', territory: 'egy', method: 'sphere' },
    { id: 'ov', kind: 'scalar', of: 'overlap', a: 'rome', b: 'egy', year: 100 }, { id: 'ov0', kind: 'scalar', of: 'overlap', a: 'rome', b: 'egy', year: -100 },
    { id: 'inR', kind: 'scalar', of: 'contains', territory: 'rome', place: 'roma', year: 100 }, { id: 'inA', kind: 'scalar', of: 'contains', territory: 'rome', place: 'alex', year: 100 }, { id: 'inS', kind: 'scalar', of: 'contains', territory: 'rome', place: 'syene', year: 100 },
    { id: 'era', kind: 'scalar', of: 'arcToCircle', angle: 7.2, base: 5000, unit: 'stadeEratosthenes', to: 'km' },
    { id: 'era2', kind: 'scalar', of: 'arcToCircle', angle: 7.2, base: 5000, unit: 'stade', to: 'km' },
    { id: 'sy', kind: 'scalar', of: 'distance', from: 'alex', to: 'syene', unit: 'stade' },
    { id: 'x', kind: 'scalar', of: 'xy', lat: 41.8933, lon: 12.4828, axis: 'x', unit: 'km' }, { id: 'k', kind: 'scalar', of: 'scale', lat: 38, lon: 20, what: 'k' },
    { id: 'rk', kind: 'series', of: 'routeKm', from: 'roma', to: 'alex' }, { id: 'map', kind: 'scene', of: 'map', year: 100, path: { from: 'roma', to: 'alex' } },
    { id: 'yr', kind: 'series', of: 'years', from: -100, to: 700, n: 801 }, { id: 'ar', kind: 'series', of: 'area', territory: 'egy', from: -100, to: 700, n: 801 },
  ],
};
ok(M.checkSpec(spec).filter(p => p.level === 'error').length === 0, 'the itinerary spec has no errors');
const inst = M.engine.create(spec, { seed: 1 });
let t0 = Date.now(); const o = inst.run({ month: 7 }); const ms1 = Date.now() - t0;
near(o.d, 1952776.867, 1e-3, 'Rome → Alexandria geodesic WGS84 (GeographicLib 2.1 / PROJ Geod: 1 952 776.867 m)');
near(o.h, 1951411.907, 1, 'Rome → Alexandria haversine, R1 = 6371.0088 km');
near(o.b, 121.800848, 1e-6, 'initial azimuth 121.800848°'); near(o.b2, 132.264973, 1e-6, 'final azimuth 132.264973°');
near(o.rm, 1952776.867 / 1479, 1e-6, 'in Roman miles (1 479 m)'); near(o.rmLo, 1952776.867 / 1485, 1e-6, '… with the longest Roman mile (1 485 m)');
ok(o.legs === 2 && o.days > 15 && o.days < 18, `July: Rome → Ostia by road, then by sea (${o.days.toFixed(2)} days, 2 legs)`);
const o2 = inst.run({ month: 12 });
ok(o2.legs === 2 && o2.days > o.days, `December: the Ostia–Alexandria sea lane is closed (mare clausum): via Brundisium, ${o2.days.toFixed(2)} days`);
ok(o.cost < o2.cost || o.cost > 0, 'cost by the mode ratios (sea 1 : river 4.9 : road 28)');
ok(Math.abs(o.aE / o.aS - 1) < 0.01 && o.aE > 1.0e6 && o.aE < 1.2e6, `area of a 10° × 10° box at 22–32°N: ${Math.round(o.aE)} km² (geodesic) vs ${Math.round(o.aS)} (sphere)`);
near(o.ov, 211950, 2500, 'overlap 25–35°E × 30–32°N in 100 CE by the equal-area raster (exact on the sphere R²Δλ(sin 32° − sin 30°) = 211 950 km²)');
ok(o.ov0 === 0, 'no overlap in 100 BCE (the province is not yet in force)');
ok(o.inR === 1 && o.inA === 1 && o.inS === 0, 'Rome and Alexandria (31.2°N) are in the box, Syene (24.1°N) is not');
near(o.era, 39375, 1e-6, 'Eratosthenes: 7.2° and 5 000 stadia → 250 000 stadia = 39 375 km with the 157.5 m stade (Cleomedes 1.7)');
near(o.era2, 46250, 1e-6, '… and 46 250 km with the 185 m stade');
ok(o.sy > 4000 && o.sy < 4800, `Alexandria → Syene really is ${Math.round(o.sy)} stades of 185 m (Eratosthenes said 5 000)`);
ok(Number.isFinite(o.x) && Math.abs(o.k - 1) < 0.01, 'xy and scale on the LCC map');
ok(o.rk.length === 3 && o.rk[0] === 0 && Math.abs(o.rk[2] - (30 + o.rk[2] - 30)) < 1e-9, 'routeKm: cumulative kilometres along the path');
ok(o.map && o.map.items.length > 20 && o.map.items.length <= 2000 && o.map.items.some(i => i.k === 'poly' && i.fill) && o.map.items.some(i => i.k === 'seg' && i.w === 3) && o.map.items.some(i => i.k === 'txt' && i.key === 'roma'), `the map scene: land, graticule, territories, the path, labels (${o.map.items.length} items)`);
ok(o.map.items.every(i => !i.c || ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'].includes(i.c)), 'scene colours are roles');
ok(o.yr.length === 801 && o.ar[0] === 0 && o.ar[200] > 1e6, 'area by year: a step at the start of the territory');
ok(ms1 < 500, `a typical run (map scene with 1:110m land) takes ${ms1} ms`);

// ---- 7. edge cases through the engine ----
const run1 = (model, outputs, env) => M.run({ model, outputs }, env || {}, {});
{ const r = run1({ places: [{ id: 'a', lat: 0, lon: 0 }, { id: 'b', lat: 0, lon: 180 }] }, [{ id: 'd', kind: 'scalar', of: 'distance', from: 'a', to: 'b' }]);
  near(r.out.d * 1000, 20003931.4586, 1e-3, 'antipodal on the equator: s = half the meridian ellipse (GeographicLib)'); ok(r.codes.some(c => c.code === 'antipodal'), 'antipodal points: code antipodal (the geodesic is not unique)'); }
{ const r = run1({ places: [{ id: 'a', lat: 10, lon: 10 }, { id: 'b', lat: 10, lon: 10 }] }, [{ id: 'b', kind: 'scalar', of: 'bearing', from: 'a', to: 'b' }]);
  ok(Number.isNaN(r.out.b) && r.codes.some(c => c.code === 'same_point'), 'bearing between the same point: NaN, code same_point'); }
{ const r = run1({ projection: { type: 'mercator' } }, [{ id: 'y', kind: 'scalar', of: 'xy', lat: 90, lon: 0, axis: 'y' }]);
  ok(Number.isFinite(r.out.y) && r.codes.some(c => c.code === 'clamped'), 'Mercator at 90°: clamped to 85.0511° (code clamped), never Infinity'); }
{ const r = run1({ projection: { type: 'ortho', lat0: 0, lon0: 0 } }, [{ id: 'x', kind: 'scalar', of: 'xy', lat: 0, lon: 120, axis: 'x' }]);
  ok(Number.isNaN(r.out.x) && r.codes.some(c => c.code === 'not_visible'), 'orthographic: the far side is not visible (NaN, code not_visible)'); }
{ const r = run1({ projection: { type: 'tmerc', lon0: 0 } }, [{ id: 'x', kind: 'scalar', of: 'xy', lat: 0, lon: 90, axis: 'x' }]);
  ok(Number.isNaN(r.out.x) && r.codes.some(c => c.code === 'not_visible'), 'transverse Mercator 90° from the central meridian (B = 1): not_visible, never Infinity'); }
{ const r = run1({ places: [{ id: 'a', lat: 0, lon: 0 }, { id: 'b', lat: 1, lon: 1 }], network: { edges: [{ a: 'a', b: 'b', mode: 'road', open: 0 }] } }, [{ id: 'r', kind: 'scalar', of: 'route', from: 'a', to: 'b' }, { id: 'f', kind: 'scalar', of: 'route', from: 'a', to: 'b', what: 'found' }]);
  ok(Number.isNaN(r.out.r) && r.out.f === 0 && r.codes.some(c => c.code === 'no_route'), 'no route: NaN, found = 0, code no_route'); }
{ const r = run1({ places: [{ id: 'a', lat: 0, lon: 0 }, { id: 'b', lat: 0, lon: 1 }], network: { edges: [{ a: 'a', b: 'b', mode: 'river', km: 100 }] } }, [{ id: 'dn', kind: 'scalar', of: 'route', from: 'a', to: 'b' }, { id: 'up', kind: 'scalar', of: 'route', from: 'b', to: 'a' }]);
  ok(Math.abs(r.out.dn - 100 / 40) < 1e-12 && Math.abs(r.out.up - 100 / 15) < 1e-12, 'a river edge: downstream a → b at 40 km/day, upstream at 15'); }
{ const r = run1({ territories: [{ id: 'ant', rings: [Array.from({ length: 36 }, (_, i) => [i * 10 - 180, -70]).flat()] }], places: [{ id: 'p', lat: -80, lon: 0 }] }, [{ id: 'c', kind: 'scalar', of: 'contains', territory: 'ant', place: 'p' }]);
  ok(Number.isNaN(r.out.c) && r.codes.some(c => c.code === 'pip_pole'), 'containment in a ring around a pole: NaN, code pip_pole'); }
{ const r = run1({}, [{ id: 'g', kind: 'scalar', of: 'gnomonLat', shadow: 1, gnomon: 0 }, { id: 'e', kind: 'scalar', of: 'arcToCircle', angle: 0, base: 1 }]);
  ok(Number.isNaN(r.out.g) && Number.isNaN(r.out.e) && r.codes.some(c => c.code === 'gnomon') && r.codes.some(c => c.code === 'angle'), 'a zero gnomon or angle: NaN with a code'); }
{ const r = run1({ places: [{ id: 'a', lat: 'k', lon: 0 }, { id: 'b', lat: 0, lon: 0 }] }, [{ id: 'd', kind: 'scalar', of: 'distance', from: 'a', to: 'b', method: 'sphere' }], { k: 10 });
  near(r.out.d, 10 * Math.PI / 180 * 6371.0088, 1e-9, 'a place moved by an expression (k = 10°)'); }
{ const s2 = JSON.parse(JSON.stringify(spec)); s2.model.projection = { type: 'ortho', lat0: 30, lon0: 20 }; s2.model.view = { tissot: { step: 30, r: 5 } }; s2.outputs = [{ id: 'm', kind: 'scene', of: 'map' }];
  const r = M.run(s2, {}, {}); ok(r.out.m.items.length > 50 && r.out.m.items.some(i => i.c === 'warn'), 'orthographic globe with Tissot ellipses'); }
{ const s2 = { model: { projection: { type: 'mercator', lon0: 150 } }, outputs: [{ id: 'm', kind: 'scene', of: 'map' }] };
  const r = M.run(s2, {}, {}); const big = r.out.m.items.filter(i => i.k === 'poly').some(i => { let mx = 0; for (let j = 2; j < i.pts.length; j += 2) mx = Math.max(mx, Math.abs(i.pts[j] - i.pts[j - 2])); return mx > 20000; });
  ok(!big, 'central meridian 150°: no line jumps across the map at the antimeridian (cut, not wrapped)'); }

// ---- 8. checks ----
const codes = s => M.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
ok(codes({ model: { places: P.slice(0, 2) }, outputs: [{ id: 'd', kind: 'scalar', of: 'distance', from: 'roma', to: 'x' }] }).includes('ref@outputs[0].to'), 'check: an unknown place');
ok(codes({ model: { projection: { type: 'lcc', lat1: 30, lat2: -30 } }, outputs: [] }).includes('projection@model.projection.lat2'), 'check: a cone with n = 0');
ok(codes({ model: { territories: [{ id: 't', rings: [[0, 0, 1, 1, 2, 2, 3]] }] }, outputs: [] }).includes('ring@model.territories[0].rings[0]'), 'check: an odd ring');
ok(codes({ model: {}, outputs: [{ id: 'r', kind: 'scalar', of: 'route', from: 'a', to: 'b' }] }).includes('ref@outputs[0].of'), 'check: a route without a network');
ok(codes({ model: {}, outputs: [{ id: 'c', kind: 'scalar', of: 'convert', value: 1, from: 'cubit', to: 'km' }] }).includes('ref@outputs[0].from'), 'check: an unknown unit');
ok(M.engine.check({ model: {}, outputs: [{ id: 'x', kind: 'scalar', of: 'nope' }] }).length === 1, 'engine.check: the problems as "path: message"');

// ---- 9. the Worker source in a fresh global ----
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const W = ctx.self.noemaEngine.create(spec, { seed: 1 }), w = W.run({ month: 7 }), p = inst.run({ month: 7 });
  ok(JSON.stringify(w) === JSON.stringify(p), 'the Worker source (GeographicLib + land + core + engine) gives the same outputs in a fresh global');
  ok(M.engine.workerSource.length < 400000, `the Worker source is ${Math.round(M.engine.workerSource.length / 1024)} KB`); }

// ---- 10. speed ----
{ const big = JSON.parse(JSON.stringify(spec)); big.model.projection = { type: 'albers', lat1: 30, lat2: 45 }; big.model.view = { graticule: 5, tissot: { step: 10, r: 2 } };
  big.outputs.push({ id: 'ov2', kind: 'scalar', of: 'overlap', a: 'rome', b: 'egy', year: 100, cell: 0.05 }, { id: 'sc', kind: 'series', of: 'scale', what: 'omega', from: -89, to: 89, n: 2000 });
  const t1 = Date.now(); const r = M.run(big, { month: 7 }, {}); const ms = Date.now() - t1;
  ok(ms < 2000 && Number.isFinite(r.out.ov2), `the heaviest allowed run (fine raster, dense Tissot, 2000-point series, full map) takes ${ms} ms (< 2 s)`); }
{ const ring = []; for (let i = 0; i < 2000; i++) { const a = 2 * Math.PI * i / 2000; ring.push(20 + 25 * Math.cos(a), 10 + 25 * Math.sin(a) * (1 + 0.1 * Math.sin(7 * a))); }
  const r2 = ring.map((v, i) => (i % 2 ? v : v + 5)), t1 = Date.now();
  const r = M.run({ model: { territories: [{ id: 'a', rings: [ring] }, { id: 'b', rings: [r2] }] }, outputs: [{ id: 'o', kind: 'scalar', of: 'overlap', a: 'a', b: 'b', cell: 0.01 }] }, {}, {});
  const ms = Date.now() - t1; ok(ms < 2000 && r.out.o > 0 && r.codes.some(c => c.code === 'coarse'), `the worst overlap (two 2000-vertex territories, cell 0.01°) is coarsened (code coarse) and takes ${ms} ms (< 2 s)`); }
{ const t1 = Date.now(); for (let i = 0; i < 20; i++) M.run({ model: { places: P }, outputs: [{ id: 'd', kind: 'scalar', of: 'distance', from: 'roma', to: 'alex' }] }, {}, {}); ok((Date.now() - t1) / 20 < 50, 'a typical numeric run < 50 ms'); }

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
