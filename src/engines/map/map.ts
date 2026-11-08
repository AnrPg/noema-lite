/* ===================== map@1 — maps, projections, geodesy and journeys (the engine library of sim-spec@1, docs/library/map.md) =====================
   A general engine for history, geography, archaeology and the classics: map projections (Snyder 1987) with their distortion (Tissot
   1881), distances and bearings on the sphere and on the ellipsoid (haversine; Karney 2013 geodesics through the vendored GeographicLib
   2.2.0; rhumb lines), territories as polygons through time (area, containment, overlap), journeys on a network (ORBIS-like: Scheidel &
   Meeks 2012), historical units with their uncertainty, and ancient measurement (Eratosthenes, the gnomon, the obliquity, longitude by
   time). Drawings: the Natural Earth 1:110m land outline (vendored), graticule, places, routes, territories, Tissot ellipses.
   Pure, bounded, deterministic; numbers, codes and keys only. Vendored (engine/vendor/): geographiclib-geodesic@2.2.0 (MIT) and
   world-atlas@2.0.2 land-110m (ISC / Natural Earth public domain) — both travel to the Worker in front of this module. */
import NoemaLibCore from '../kernel/core.js';
import geodesic from './vendor/geodesic.cjs';
import LAND110 from './vendor/land-110m.json' with { type: 'json' };
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this module
  const C = NoemaLibCore;
  const ID = 'map@1';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);

  /* ---------- constants ---------- */
  // Ellipsoids: WGS84 (NGA.STND.0036, 2014), GRS80 (Moritz 1980), Clarke 1866 / International 1924 / Bessel 1841 (Snyder 1987 p. 12).
  const ELLIPSOIDS = {
    WGS84: [6378137, 1 / 298.257223563], GRS80: [6378137, 1 / 298.257222101],
    clarke1866: [6378206.4, (6378206.4 - 6356583.8) / 6378206.4], intl1924: [6378388, 1 / 297], bessel1841: [6377397.155, 1 / 299.1528128],
  };
  const R_MEAN_KM = 6371.0088;   // IUGG mean radius R1 = (2a + b)/3 of WGS84 (Moritz 1980)
  // Units of length (metres): best value and plausible range, docs/library/map.md §units (Hultsch 1882; Engels 1985 AJPh 106; Duncan-Jones 1974).
  const UNITS = {
    m: [1, 1, 1], km: [1000, 1000, 1000], mi: [1609.344, 1609.344, 1609.344], nmi: [1852, 1852, 1852],
    pes: [0.2957, 0.294, 0.297], passus: [1.479, 1.47, 1.485], romanMile: [1479, 1470, 1485], leuga: [2220, 2200, 2450],
    stade: [185, 157.5, 210], stadeAttic: [177.6, 177.6, 177.6], stadeOlympic: [192.27, 192.27, 192.27], stadeEratosthenes: [157.5, 157.5, 185],
    schoenus: [6300, 4725, 11100], parasang: [5550, 5000, 6700], arabMil: [1973, 1900, 2000], farsakh: [5919, 5700, 6000],
    league: [4828.032, 4828.032, 4828.032], lieue: [3898, 3248, 4828], legua: [5572, 4180, 6687],
  };
  const MODES = ['road', 'track', 'river', 'riverUp', 'sea', 'coast'];
  // Teaching defaults (km/day; relative cost per km): road 30 = ORBIS foot / Vegetius 1.9 (20 Roman miles in 5 summer hours ≈ 29.6 km);
  // sea ≈ 3 kn × 24 h (Casson 1951, TAPA 82: 2–6 kn); costs sea : river : road = 1 : 4.9 : 28 (Diocletian's Price Edict, Duncan-Jones 1974).
  const SPEEDS = { road: 30, track: 20, river: 40, riverUp: 15, sea: 130, coast: 90 };
  const COSTS = { road: 28, track: 28, river: 4.9, riverUp: 9.8, sea: 1, coast: 1 };
  const PROJS = ['equirect', 'mercator', 'tmerc', 'utm', 'lcc', 'albers', 'stereo', 'ortho', 'aeqd', 'laea', 'gnomonic', 'robinson', 'eqearth', 'wintri', 'mollweide', 'sinusoidal', 'cea'];
  const AREA_UNITS = { km2: 1e6, m2: 1, ha: 1e4, mi2: 2589988.110336 };
  const LIM = { places: 500, edges: 2000, territories: 64, rings: 16, ringNums: 4000, vertices: 20000, routes: 32, via: 64, cells: 400000 };

  /* ---------- the model table (the same codes and messages as tools/lib_map.py) ---------- */
  const PROJ_T = { type: `enum:${PROJS.join('|')}!`, lon0: 'numx', lat0: 'numx', lat1: 'numx', lat2: 'numx', k0: 'numx', zone: 'int:1:60', south: 'bool', maxLat: 'numx', clip: 'numx', x0: 'numx', y0: 'numx' };
  const TABLE = {
    ellipsoid: 'enum:WGS84|GRS80|clarke1866|intl1924|bessel1841|sphere',
    radius: 'numx',
    projection: { $obj: PROJ_T },
    view: { $obj: { bbox: { $list: 'numx', min: 4, max: 4 }, basemap: 'enum:land110|none', graticule: 'numx', tissot: { $obj: { step: 'numx', r: 'numx' } }, year: 'numx', labels: 'bool' } },
    places: { $list: { $obj: { id: 'id!', lat: 'numx!', lon: 'numx!', label: 'key', c: `enum:${C.ROLES.join('|')}` } }, max: LIM.places },
    routes: { $list: { $obj: { id: 'id!', via: { $req: true, $list: 'ref', min: 2, max: LIM.via }, method: 'enum:geodesic|sphere|rhumb', c: `enum:${C.ROLES.join('|')}` } }, max: LIM.routes },
    network: { $obj: { edges: { $req: true, $list: { $obj: { a: 'ref!', b: 'ref!', mode: `enum:${MODES.filter(m => m !== 'riverUp').join('|')}!`, km: 'numx', open: 'numx', oneway: 'bool' } }, min: 1, max: LIM.edges }, speeds: { $map: 'numx', max: 6 }, costs: { $map: 'numx', max: 6 }, factor: 'numx' } },
    territories: { $list: { $obj: { id: 'id!', from: 'numx', to: 'numx', rings: { $req: true, $list: { $list: 'fin', min: 6, max: LIM.ringNums }, min: 1, max: LIM.rings }, label: 'key', c: `enum:${C.ROLES.join('|')}`, big: 'bool' } }, max: LIM.territories },
    units: { $map: { $obj: { m: 'pos!', min: 'pos', max: 'pos' } }, max: 12 },
  };
  const BOUND = 'enum:best|min|max', AREA_U = 'enum:km2|m2|ha|mi2', N = 'int:2:2000';
  const OUT = {
    scalar: {
      distance: { from: 'ref!', to: 'ref!', method: 'enum:geodesic|haversine|sphere|rhumb', unit: 'name', bound: BOUND },
      bearing: { from: 'ref!', to: 'ref!', method: 'enum:geodesic|sphere|rhumb', end: 'enum:initial|final' },
      area: { territory: 'ref!', method: 'enum:geodesic|sphere', unit: AREA_U },
      perimeter: { territory: 'ref!', method: 'enum:geodesic|sphere', unit: 'name', bound: BOUND },
      overlap: { a: 'ref!', b: 'ref!', year: 'numx', cell: 'numx', unit: AREA_U },
      contains: { territory: 'ref!', place: 'ref!', year: 'numx' },
      inForce: { territory: 'ref!', year: 'numx!' },
      count: { year: 'numx!' },
      scale: { lat: 'numx!', lon: 'numx!', what: 'enum:h|k|a|b|omega|s!' },
      xy: { lat: 'numx!', lon: 'numx!', axis: 'enum:x|y!', unit: 'enum:m|km' },
      route: { from: 'ref!', to: 'ref!', by: 'enum:days|km|cost', what: 'enum:days|km|cost|legs|found' },
      convert: { value: 'numx!', from: 'name!', to: 'name!', bound: BOUND },
      arcToCircle: { angle: 'numx!', base: 'numx!', unit: 'name', to: 'name', bound: BOUND },
      gnomonLat: { shadow: 'numx!', gnomon: 'numx!', decl: 'numx', limb: 'bool' },
      obliquity: { year: 'numx!' },
      timeToLon: { minutes: 'numx!' },
    },
    series: {
      years: { from: 'numx!', to: 'numx!', n: N },
      area: { territory: 'ref!', from: 'numx!', to: 'numx!', n: N, method: 'enum:geodesic|sphere', unit: AREA_U },
      lat: { from: 'numx!', to: 'numx!', n: N },
      scale: { what: 'enum:h|k|a|b|omega|s!', lon: 'numx', from: 'numx!', to: 'numx!', n: N },
      routeKm: { from: 'ref!', to: 'ref!', by: 'enum:days|km|cost' },
      routeDays: { from: 'ref!', to: 'ref!', by: 'enum:days|km|cost' },
      routeCost: { from: 'ref!', to: 'ref!', by: 'enum:days|km|cost' },
    },
    scene: { map: { year: 'numx', path: { $obj: { from: 'ref!', to: 'ref!', by: 'enum:days|km|cost' } }, labels: 'bool' } },
  };
  const PLACE_F = ['from', 'to', 'place'], TERR_F = ['territory', 'a', 'b'], UNIT_F = ['unit', 'to', 'from'];
  const NUMX_ORDER = ['lat', 'lon', 'year', 'cell', 'value', 'angle', 'base', 'shadow', 'gnomon', 'decl', 'minutes', 'from', 'to'];

  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    C.walk(m, TABLE, 'model', E, W);
    const M = isObj(m) ? m : {};
    const places = new Set(), terrs = new Set();
    const arr = v => (Array.isArray(v) ? v : []);
    arr(M.places).forEach((p, i) => {
      if (!isObj(p)) return;
      if (typeof p.id === 'string') { if (places.has(p.id)) E('dup', `model.places[${i}].id`, `the id ${p.id} is used twice`); places.add(p.id); }
      if (isNum(p.lat) && Math.abs(p.lat) > 90) E('value', `model.places[${i}].lat`, 'needs a latitude from -90 to 90');
    });
    let verts = 0;
    arr(M.territories).forEach((t, i) => {
      if (!isObj(t)) return;
      if (typeof t.id === 'string') { if (terrs.has(t.id)) E('dup', `model.territories[${i}].id`, `the id ${t.id} is used twice`); terrs.add(t.id); }
      arr(t.rings).forEach((r, j) => {
        if (!Array.isArray(r)) return;
        verts += r.length / 2;
        if (r.length % 2) E('ring', `model.territories[${i}].rings[${j}]`, 'needs pairs lon, lat (an even count of numbers)');
        else if (r.some((v, k) => k % 2 === 1 && isNum(v) && Math.abs(v) > 90)) E('ring', `model.territories[${i}].rings[${j}]`, 'a latitude is outside -90 to 90');
      });
      if (isNum(t.from) && isNum(t.to) && !(t.from < t.to)) E('value', `model.territories[${i}].to`, 'needs from < to');
    });
    if (verts > LIM.vertices) E('size', 'model.territories', `more than ${LIM.vertices} vertices in all`);
    const pr = isObj(M.projection) ? M.projection : null;
    if (pr) {
      if ((pr.type === 'lcc' || pr.type === 'albers') && isNum(pr.lat1) && isNum(pr.lat2) && Math.abs(pr.lat1 + pr.lat2) < 1e-9) E('projection', 'model.projection.lat2', 'lat2 = -lat1 gives a cone constant n = 0 (use a cylindrical projection)');
      if ((pr.type === 'lcc' || pr.type === 'albers') && ((isNum(pr.lat1) && Math.abs(pr.lat1) >= 90) || (isNum(pr.lat2) && Math.abs(pr.lat2) >= 90))) E('projection', 'model.projection.lat1', 'a standard parallel must be between -90 and 90');
      if (pr.type === 'utm' && pr.zone === undefined && pr.lon0 === undefined) E('value', 'model.projection.zone', 'missing (utm needs its zone 1-60 or lon0)');
      if (isNum(pr.lat0) && Math.abs(pr.lat0) > 90) E('value', 'model.projection.lat0', 'needs a latitude from -90 to 90');
    }
    const vw = isObj(M.view) ? M.view : null;
    if (vw && Array.isArray(vw.bbox) && vw.bbox.length === 4 && isNum(vw.bbox[1]) && isNum(vw.bbox[3]) && !(vw.bbox[1] < vw.bbox[3] && vw.bbox[1] >= -90 && vw.bbox[3] <= 90)) E('value', 'model.view.bbox', 'needs [west, south, east, north] with -90 <= south < north <= 90');
    const units = isObj(M.units) ? M.units : {};
    for (const [k, u] of Object.entries(units)) if (isObj(u) && isNum(u.m) && ((isNum(u.min) && u.min > u.m) || (isNum(u.max) && u.max < u.m))) E('value', `model.units.${k}`, 'needs min <= m <= max');
    arr(M.routes).forEach((r, i) => { if (isObj(r)) arr(r.via).forEach((v, j) => { if (typeof v === 'string' && C.ID_RE.test(v) && !places.has(v)) E('ref', `model.routes[${i}].via[${j}]`, 'not a place of the model'); }); });
    const nw = isObj(M.network) ? M.network : null;
    if (nw) {
      arr(nw.edges).forEach((e, i) => {
        if (!isObj(e)) return;
        for (const f of ['a', 'b']) if (typeof e[f] === 'string' && C.ID_RE.test(e[f]) && !places.has(e[f])) E('ref', `model.network.edges[${i}].${f}`, 'not a place of the model');
        if (typeof e.a === 'string' && e.a === e.b) E('ref', `model.network.edges[${i}].b`, 'an edge from a place to itself');
      });
      for (const f of ['speeds', 'costs']) if (isObj(nw[f])) for (const k of Object.keys(nw[f])) if (C.checkKind('name', k) && !MODES.includes(k)) E('enum', `model.network.${f}.${k}`, 'one of ' + MODES.join(', '));
    }
    const unitOk = u => Object.prototype.hasOwnProperty.call(UNITS, u) || Object.prototype.hasOwnProperty.call(units, u);
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at, E2, W2) => {
      const T = OUT[o.kind][o.of];
      if (!T) { E2('output', at + '.of', `${o.kind} outputs of ${ID} are: ${Object.keys(OUT[o.kind]).join(', ')}`); return; }
      C.walk(o, Object.assign({ id: 'expr', kind: 'expr', of: 'expr' }, T), at, E2, W2);
      for (const f of PLACE_F) if (T[f] && T[f].startsWith('ref') && typeof o[f] === 'string' && C.ID_RE.test(o[f]) && !places.has(o[f])) E2('ref', `${at}.${f}`, 'not a place of the model');
      for (const f of TERR_F) if (T[f] && typeof o[f] === 'string' && C.ID_RE.test(o[f]) && !terrs.has(o[f])) E2('ref', `${at}.${f}`, 'not a territory of the model');
      for (const f of UNIT_F) if (T[f] === 'name' || T[f] === 'name!') if (typeof o[f] === 'string' && C.checkKind('name', o[f]) && !unitOk(o[f])) E2('ref', `${at}.${f}`, 'not a unit (' + Object.keys(UNITS).join(', ') + ' or one of model.units)');
      if ((o.of === 'route' || o.of.startsWith('route') || (o.of === 'map' && isObj(o.path))) && !nw) E2('ref', at + '.of', 'needs model.network');
      if (o.of === 'map' && isObj(o.path)) for (const f of ['from', 'to']) if (typeof o.path[f] === 'string' && C.ID_RE.test(o.path[f]) && !places.has(o.path[f])) E2('ref', `${at}.path.${f}`, 'not a place of the model');
      if (['scale', 'xy'].includes(o.of) && !pr) E2('ref', at + '.of', 'needs model.projection');
      if (o.kind === 'scene' && !pr) W2('projection', at, 'no model.projection: drawn in plate carree');
    }, E, W);
    return P;
  }

  /** every expression of the model: [source, path, local names] (the same order as tools/lib_map.py) */
  function exprs(spec) {
    const out = [], m = isObj(spec) && isObj(spec.model) ? spec.model : {};
    const add = (v, p) => { if (typeof v === 'string') out.push([v, p, []]); };
    add(m.radius, 'model.radius');
    if (isObj(m.projection)) for (const k of ['lon0', 'lat0', 'lat1', 'lat2', 'k0', 'maxLat', 'clip', 'x0', 'y0']) add(m.projection[k], 'model.projection.' + k);
    if (isObj(m.view)) {
      if (Array.isArray(m.view.bbox)) m.view.bbox.forEach((v, i) => add(v, `model.view.bbox[${i}]`));
      add(m.view.graticule, 'model.view.graticule');
      if (isObj(m.view.tissot)) { add(m.view.tissot.step, 'model.view.tissot.step'); add(m.view.tissot.r, 'model.view.tissot.r'); }
      add(m.view.year, 'model.view.year');
    }
    (Array.isArray(m.places) ? m.places : []).forEach((p, i) => { if (isObj(p)) { add(p.lat, `model.places[${i}].lat`); add(p.lon, `model.places[${i}].lon`); } });
    if (isObj(m.network)) {
      add(m.network.factor, 'model.network.factor');
      (Array.isArray(m.network.edges) ? m.network.edges : []).forEach((e, i) => { if (isObj(e)) { add(e.km, `model.network.edges[${i}].km`); add(e.open, `model.network.edges[${i}].open`); } });
      for (const f of ['speeds', 'costs']) if (isObj(m.network[f])) for (const [k, v] of Object.entries(m.network[f])) add(v, `model.network.${f}.${k}`);
    }
    (Array.isArray(m.territories) ? m.territories : []).forEach((t, i) => { if (isObj(t)) { add(t.from, `model.territories[${i}].from`); add(t.to, `model.territories[${i}].to`); } });
    (isObj(spec) && Array.isArray(spec.outputs) ? spec.outputs : []).forEach((o, i) => {
      if (!isObj(o) || !OUT[o.kind] || !OUT[o.kind][o.of]) return;
      const T = OUT[o.kind][o.of];
      for (const k of NUMX_ORDER) if (T[k] && T[k].startsWith('numx')) add(o[k], `outputs[${i}].${k}`);
    });
    return out;
  }
  function keys(spec) {
    const out = [], m = isObj(spec) && isObj(spec.model) ? spec.model : {};
    (Array.isArray(m.places) ? m.places : []).forEach((p, i) => { if (isObj(p) && typeof p.label === 'string') out.push([p.label, `model.places[${i}].label`]); });
    (Array.isArray(m.territories) ? m.territories : []).forEach((t, i) => { if (isObj(t) && typeof t.label === 'string') out.push([t.label, `model.territories[${i}].label`]); });
    return out;
  }

  /* ---------- geometry on the sphere ---------- */
  const wrap180 = x => { const y = ((x + 180) % 360 + 360) % 360 - 180; return y === -180 ? 180 : y; };   // (-180, 180]
  /** haversine distance, radians of arc (Sinnott 1984, Sky & Telescope 68:159) */
  function havArc(la1, lo1, la2, lo2) {
    const p1 = la1 * D2R, p2 = la2 * D2R, dp = p2 - p1, dl = wrap180(lo2 - lo1) * D2R;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  /** the atan2 ("Vincenty sphere") form: accurate for every pair, antipodes included */
  function sphArc(la1, lo1, la2, lo2) {
    const p1 = la1 * D2R, p2 = la2 * D2R, dl = wrap180(lo2 - lo1) * D2R;
    const y = Math.hypot(Math.cos(p2) * Math.sin(dl), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
    return Math.atan2(y, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl));
  }
  /** initial bearing on the sphere, degrees 0–360 */
  function sphBearing(la1, lo1, la2, lo2) {
    const p1 = la1 * D2R, p2 = la2 * D2R, dl = wrap180(lo2 - lo1) * D2R;
    const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * R2D;
    return (b + 360) % 360;
  }
  /** destination on the sphere from (lat, lon), bearing (deg) and arc (rad) */
  function sphDest(la, lo, brg, arc) {
    const p1 = la * D2R, a = brg * D2R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(arc) + Math.cos(p1) * Math.sin(arc) * Math.cos(a));
    const l2 = lo * D2R + Math.atan2(Math.sin(a) * Math.sin(arc) * Math.cos(p1), Math.cos(arc) - Math.sin(p1) * Math.sin(p2));
    return [p2 * R2D, wrap180(l2 * R2D)];
  }
  /** points along the great circle (slerp of unit vectors, Gade 2010 n-vectors: no singularity at 0 or pi) */
  function sphPath(la1, lo1, la2, lo2, n) {
    const v = (la, lo) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)];
    const a = v(la1, lo1), b = v(la2, lo2), d = sphArc(la1, lo1, la2, lo2), s = Math.sin(d), out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n; let w1 = 1 - f, w2 = f;
      if (s > 1e-12) { w1 = Math.sin((1 - f) * d) / s; w2 = Math.sin(f * d) / s; }
      const x = w1 * a[0] + w2 * b[0], y = w1 * a[1] + w2 * b[1], z = w1 * a[2] + w2 * b[2];
      out.push([Math.atan2(z, Math.hypot(x, y)) * R2D, Math.atan2(y, x) * R2D]);
    }
    return out;
  }

  /* ---------- the ellipsoid ---------- */
  function ellipsoid(name, Rm) {
    if (name === 'sphere') return { a: Rm, f: 0, e2: 0, e: 0, n: 0, b: Rm, sphere: true };
    const [a, f] = ELLIPSOIDS[name] || ELLIPSOIDS.WGS84, e2 = f * (2 - f);
    return { a, f, e2, e: Math.sqrt(e2), n: f / (2 - f), b: a * (1 - f), sphere: false };
  }
  /** meridian arc M(phi) (Helmert's series in n; WGS84 quarter meridian 10 001 965.7293 m) */
  function meridian(el, phi) {
    const n = el.n, n2 = n * n, n3 = n2 * n, n4 = n2 * n2;
    return el.a / (1 + n) * ((1 + n2 / 4 + n4 / 64) * phi - 1.5 * (n - n3 / 8) * Math.sin(2 * phi) + 15 / 16 * (n2 - n4 / 4) * Math.sin(4 * phi)
      - 35 / 48 * n3 * Math.sin(6 * phi) + 315 / 512 * n4 * Math.sin(8 * phi));
  }
  const radN = (el, phi) => el.a / Math.sqrt(1 - el.e2 * Math.sin(phi) ** 2);
  const radM = (el, phi) => el.a * (1 - el.e2) / Math.pow(1 - el.e2 * Math.sin(phi) ** 2, 1.5);
  const isoLat = (el, phi) => Math.atanh(Math.sin(phi)) - el.e * Math.atanh(el.e * Math.sin(phi));   // psi, isometric latitude
  /** rhumb line: {s (m), azi (deg), code?}; the E–W case uses the parallel's arc (0/0 otherwise) */
  function rhumb(el, la1, lo1, la2, lo2) {
    let code = null;
    const lim = 90 - 1e-9; if (Math.abs(la1) > lim || Math.abs(la2) > lim) code = 'rhumb_pole';
    const p1 = Math.max(-lim, Math.min(lim, la1)) * D2R, p2 = Math.max(-lim, Math.min(lim, la2)) * D2R, dl = wrap180(lo2 - lo1) * D2R;
    const dpsi = isoLat(el, p2) - isoLat(el, p1), azi = Math.atan2(dl, dpsi);
    const s = Math.abs(p2 - p1) < 1e-12 ? radN(el, p1) * Math.cos(p1) * Math.abs(dl) : Math.abs((meridian(el, p2) - meridian(el, p1)) / Math.cos(azi));
    return { s, azi: (azi * R2D + 360) % 360, code };
  }
  function rhumbPath(la1, lo1, la2, lo2, n) {
    const el = { e: 0 }, p1 = la1 * D2R, p2 = la2 * D2R, dl = wrap180(lo2 - lo1), s1 = isoLat(el, p1), s2 = isoLat(el, p2), out = [];
    for (let i = 0; i <= n; i++) { const f = i / n, psi = s1 + f * (s2 - s1); out.push([Math.abs(s2 - s1) < 1e-12 ? la1 : Math.atan(Math.sinh(psi)) * R2D, wrap180(lo1 + f * dl)]); }
    return out;
  }
  const GL = () => geodesic;   // geographiclib-geodesic 2.2.0 (./vendor/, MIT)
  function geod(el) { const L = GL(); return L ? new L.Geodesic.Geodesic(el.a, el.f) : null; }
  /** the exact area of a spherical polygon with great-circle edges, R = 1: the signed spherical excess per edge
      (tan(E/2) = tan(dl/2)(tan(p1/2) + tan(p2/2))/(1 + tan(p1/2) tan(p2/2)): Bevis & Cambareri 1987, Math. Geology 19:335) */
  function sphExcess(ring) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lo1, la1] = ring[i], [lo2, la2] = ring[(i + 1) % ring.length];
      const t1 = Math.tan(la1 * D2R / 2), t2 = Math.tan(la2 * D2R / 2), dl = wrap180(lo2 - lo1) * D2R;
      s += 2 * Math.atan2(Math.tan(dl / 2) * (t1 + t2), 1 + t1 * t2);
    }
    return s;
  }
  /** the area of one ring (m²): geodesic (GeographicLib PolygonArea, Karney 2013 §6) or sphere; the smaller side unless big */
  function ringArea(ring, el, Rm, method, big) {
    if (method === 'sphere') {
      const A = Math.abs(sphExcess(ring)) * Rm * Rm, tot = 4 * Math.PI * Rm * Rm;
      return big ? Math.max(A, tot - A) : Math.min(A, tot - A);
    }
    const g = geod(el); if (!g) return NaN;
    const L = GL(), pa = new L.PolygonArea.PolygonArea(g, false);
    for (const [lo, la] of ring) pa.AddPoint(la, lo);
    const r = pa.Compute(false, true), A = Math.abs(r.area), tot = g.EllipsoidArea ? g.EllipsoidArea() : 4 * Math.PI * g._c2;
    return big ? Math.max(A, tot - A) : Math.min(A, tot - A);
  }
  function ringPerimeter(ring, el, Rm, method) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lo1, la1] = ring[i], [lo2, la2] = ring[(i + 1) % ring.length];
      if (method === 'sphere') s += sphArc(la1, lo1, la2, lo2) * Rm;
      else { const g = geod(el); if (!g) return NaN; s += g.Inverse(la1, lo1, la2, lo2).s12; }
    }
    return s;
  }
  /** point in ring: crossing number (W. R. Franklin, PNPOLY) on longitudes unwrapped around the ring; null when the ring circles a pole */
  function inRing(ring, la, lo) {
    const xs = [ring[0][0]];
    for (let i = 1; i < ring.length; i++) xs.push(xs[i - 1] + wrap180(ring[i][0] - ring[i - 1][0]));
    const close = xs[xs.length - 1] + wrap180(ring[0][0] - ring[ring.length - 1][0]);
    if (Math.abs(close - xs[0]) > 180) return null;        // the ring winds around a pole
    let mn = Infinity, mx = -Infinity; for (const x of xs) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
    let x = lo; const mid = (mn + mx) / 2; x = mid + wrap180(x - mid);
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][1], yj = ring[j][1], xi = xs[i], xj = xs[j];
      if ((yi > la) !== (yj > la) && x < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const ringsOf = t => t.rings.map(r => { const o = []; for (let i = 0; i + 1 < r.length; i += 2) o.push([r[i], r[i + 1]]); return o; });
  /** inside a territory (outer ring minus holes): true / false / null (undefined: a ring around a pole) */
  function inTerr(rings, la, lo) {
    const o = inRing(rings[0], la, lo); if (o === null) return null; if (!o) return false;
    for (let i = 1; i < rings.length; i++) { const h = inRing(rings[i], la, lo); if (h === null) return null; if (h) return false; }
    return true;
  }

  /* ---------- projections (Snyder 1987, USGS PP 1395; equation numbers in docs/library/map.md) ---------- */
  // Robinson's table (Robinson 1974; as tabulated in Snyder 1990 / PROJ), every 5° of latitude.
  const ROB_X = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
  const ROB_Y = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1];
  function robInterp(T, a) {   // Catmull–Rom between the nodes: exact at every 5° node (between nodes ≈ 1e-4 from PROJ's coefficients)
    const u = Math.min(18, Math.abs(a) / 5), i = Math.min(17, Math.floor(u)), t = u - i;
    const p0 = T[Math.max(0, i - 1)], p1 = T[i], p2 = T[i + 1], p3 = T[Math.min(18, i + 2)];
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  const EE = [1.340264, -0.081106, 0.000893, 0.003796];   // Equal Earth (Šavrič, Patterson & Jenny 2018, IJGIS 33:454)
  /** make(P, el, Rm, ev) → {fwd(lat, lon) → [x, y] m (NaN outside), vis(lat, lon), cut: 'meridian' | 'cap' | 'tm', R, el, ellForm, code} */
  function makeProjection(P, el0, Rm) {
    const type = P.type, lon0 = isNum(P.lon0) ? P.lon0 : (type === 'utm' ? -183 + 6 * (P.zone || 31) : 0);
    const utm = type === 'utm', k0 = isNum(P.k0) ? P.k0 : (utm ? 0.9996 : 1);
    const x0 = isNum(P.x0) ? P.x0 : (utm ? 500000 : 0), y0 = isNum(P.y0) ? P.y0 : (utm && P.south ? 10000000 : 0);
    const lat0 = (isNum(P.lat0) ? P.lat0 : 0) * D2R;
    const ellForm = !el0.sphere && ['mercator', 'tmerc', 'utm', 'lcc', 'albers'].includes(type);
    const el = ellForm ? el0 : { a: Rm, f: 0, e2: 0, e: 0, n: 0, b: Rm, sphere: true };
    const a = el.a, e = el.e, e2 = el.e2, R = Rm;
    const pj = { type, el, ellForm, R: el.a, lon0, cut: 'meridian', code: null };
    const dl = lon => wrap180(lon - lon0) * D2R;
    let f, vis = () => true;
    const tfun = p => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);   // Snyder 15-9
    const mfun = p => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);                                               // 14-15
    const qfun = p => { const s = Math.sin(p); return e < 1e-12 ? 2 * s : (1 - e2) * (s / (1 - e2 * s * s) - 1 / (2 * e) * Math.log((1 - e * s) / (1 + e * s))); };   // 3-12
    if (type === 'equirect') { const c1 = Math.cos((isNum(P.lat1) ? P.lat1 : 0) * D2R); f = (p, l) => [R * l * c1, R * (p - lat0)]; }
    else if (type === 'mercator') {
      const ml = (isNum(P.maxLat) ? Math.min(Math.abs(P.maxLat), 89.9) : 85.0511287798) * D2R;
      f = (p, l) => { const q = Math.max(-ml, Math.min(ml, p)); return [k0 * a * l, k0 * a * (Math.asinh(Math.tan(q)) - e * Math.atanh(e * Math.sin(q)))]; };   // 7-1, 7-7
      pj.maxLat = ml * R2D;
    } else if (type === 'tmerc' || utm) {
      // Krüger's n-series to 4th order (Krüger 1912; Karney 2011, J. Geodesy 85:475, eq. 35): < 0.1 mm within a UTM zone
      const n = el.n, n2 = n * n, n3 = n2 * n, n4 = n2 * n2, A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
      const al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440, 61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
      const fw = (p, l) => {
        const t = Math.sinh(Math.atanh(Math.sin(p)) - e * Math.atanh(e * Math.sin(p))), cl = Math.cos(l);
        const xi1 = Math.atan2(t, cl), eta1 = Math.asinh(Math.sin(l) / Math.hypot(t, cl));
        let xi = xi1, eta = eta1;
        for (let j = 1; j <= 4; j++) { xi += al[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += al[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1); }
        return [k0 * A * eta, k0 * A * xi];
      };
      const M0 = fw(lat0, 0)[1];
      f = (p, l) => { const r = fw(p, l); return [r[0], r[1] - M0]; };
      vis = (p, l) => Math.abs(Math.cos(p) * Math.sin(l)) < Math.sin(80 * D2R);   // B = cos φ sin Δλ → ±1 is singular (Snyder 8-1)
      pj.cut = 'tm';
    } else if (type === 'lcc') {
      const p1 = (isNum(P.lat1) ? P.lat1 : 33) * D2R, p2 = (isNum(P.lat2) ? P.lat2 : (isNum(P.lat1) ? P.lat1 : 45)) * D2R;
      const n = Math.abs(p1 - p2) < 1e-10 ? Math.sin(p1) : (Math.log(mfun(p1)) - Math.log(mfun(p2))) / (Math.log(tfun(p1)) - Math.log(tfun(p2)));   // 15-8
      const F = mfun(p1) / (n * Math.pow(tfun(p1), n)), rho = p => a * F * Math.pow(tfun(p), n), r0 = rho(lat0);
      if (!isNum(n) || Math.abs(n) < 1e-12) pj.code = 'cone_n0';
      f = (p, l) => { const r = rho(p), th = n * l; return [k0 * r * Math.sin(th), k0 * (r0 - r * Math.cos(th))]; };
      vis = p => (n > 0 ? p > -60 * D2R : p < 60 * D2R);
    } else if (type === 'albers') {
      const p1 = (isNum(P.lat1) ? P.lat1 : 29.5) * D2R, p2 = (isNum(P.lat2) ? P.lat2 : 45.5) * D2R;
      const m1 = mfun(p1), q1 = qfun(p1);
      const pp2 = Math.abs(p1 - p2) < 1e-10 ? p1 + 1e-7 : p2, m2b = mfun(pp2), q2b = qfun(pp2);   // one standard parallel: the limit φ2 → φ1
      const n = (m1 * m1 - m2b * m2b) / (q2b - q1);            // 14-14
      const Cc = m1 * m1 + n * q1, rho = p => a * Math.sqrt(Math.max(0, Cc - n * qfun(p))) / n, r0 = rho(lat0);               // 14-12, 14-13
      if (!isNum(n) || Math.abs(n) < 1e-12) pj.code = 'cone_n0';
      f = (p, l) => { const r = rho(p), th = n * l; return [r * Math.sin(th), r0 - r * Math.cos(th)]; };
    } else if (['stereo', 'ortho', 'aeqd', 'laea', 'gnomonic'].includes(type)) {
      const clipDef = { stereo: 160, ortho: 90, aeqd: 179.5, laea: 179.5, gnomonic: 65 }[type];
      const clip = Math.min(isNum(P.clip) ? P.clip : clipDef, type === 'ortho' ? 90 : type === 'gnomonic' ? 85 : 179.9) * D2R, cc = Math.cos(clip);
      const sp1 = Math.sin(lat0), cp1 = Math.cos(lat0);
      const cosc = (p, l) => sp1 * Math.sin(p) + cp1 * Math.cos(p) * Math.cos(l);                                             // 5-3
      f = (p, l) => {
        const c = cosc(p, l); if (c < cc - 1e-12) return [NaN, NaN];
        const ca = Math.acos(Math.max(-1, Math.min(1, c)));
        const kk = type === 'stereo' ? 2 * k0 / (1 + c) : type === 'ortho' ? 1 : type === 'gnomonic' ? 1 / c : type === 'laea' ? Math.sqrt(2 / (1 + c)) : (ca < 1e-12 ? 1 : ca / Math.sin(ca));
        return [R * kk * Math.cos(p) * Math.sin(l), R * kk * (cp1 * Math.sin(p) - sp1 * Math.cos(p) * Math.cos(l))];
      };
      vis = (p, l) => cosc(p, l) >= cc;
      pj.cut = 'cap'; pj.clip = clip * R2D; pj.lat0 = lat0 * R2D;
    } else if (type === 'robinson') f = (p, l) => [0.8487 * R * robInterp(ROB_X, p * R2D) * l, 1.3523 * R * robInterp(ROB_Y, p * R2D) * Math.sign(p)];
    else if (type === 'eqearth') f = (p, l) => {
      const th = Math.asin(Math.sqrt(3) / 2 * Math.sin(p)), t2 = th * th, t6 = t2 * t2 * t2;
      return [R * 2 * Math.sqrt(3) * l * Math.cos(th) / (3 * (9 * EE[3] * t6 * t2 + 7 * EE[2] * t6 + 3 * EE[1] * t2 + EE[0])), R * th * (EE[3] * t6 * t2 + EE[2] * t6 + EE[1] * t2 + EE[0])];
    };
    else if (type === 'wintri') {
      const c1 = Math.cos(isNum(P.lat1) ? P.lat1 * D2R : Math.acos(2 / Math.PI));   // Winkel 1921: φ1 = acos(2/π) = 50.4598° (PROJ's default 0 differs)
      f = (p, l) => { const al = Math.acos(Math.cos(p) * Math.cos(l / 2)), si = al < 1e-12 ? 1 : Math.sin(al) / al; return [R / 2 * (l * c1 + 2 * Math.cos(p) * Math.sin(l / 2) / si), R / 2 * (p + Math.sin(p) / si)]; };
    }
    else if (type === 'sinusoidal') f = (p, l) => [R * l * Math.cos(p), R * p];
    else if (type === 'cea') { const cs = Math.cos((isNum(P.lat1) ? P.lat1 : 0) * D2R); f = (p, l) => [R * l * cs, R * Math.sin(p) / cs]; }
    if (type === 'mollweide') {   // Snyder 31-4: 2θ + sin 2θ = π sin φ (Newton on θ), x = (2√2/π) R λ cos θ, y = √2 R sin θ
      f = (p, l) => {
        let th;
        if (Math.abs(p) > Math.PI / 2 - 1e-10) th = Math.sign(p) * Math.PI / 2;
        else { th = p; for (let i = 0; i < 60; i++) { const d = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(p)) / (2 + 2 * Math.cos(2 * th)); th -= d; if (Math.abs(d) < 1e-14) break; } }
        return [R * 2 * Math.SQRT2 / Math.PI * l * Math.cos(th), R * Math.SQRT2 * Math.sin(th)];
      };
    }
    pj.fwd = (lat, lon) => { const r = f(lat * D2R, dl(lon)); return [r[0] + x0, r[1] + y0]; };
    pj.vis = (lat, lon) => vis(lat * D2R, dl(lon));
    pj.dlam = lon => dl(lon) * R2D;
    return pj;
  }
  /** Tissot's indicatrix at (lat, lon) by central differences (Snyder 1987 eqs 4-2…4-12): {h, k, s, a, b, omega} */
  function tissot(pj, lat, lon) {
    if (Math.abs(lat) > 90 - 1e-6) return { h: NaN, k: NaN, s: NaN, a: NaN, b: NaN, omega: NaN, code: 'pole' };
    const d = 1e-6 * R2D, p = lat * D2R;
    const xp = pj.fwd(lat + d, lon), xm = pj.fwd(lat - d, lon), lp = pj.fwd(lat, lon + d), lm = pj.fwd(lat, lon - d);
    const dd = 2e-6, xphi = (xp[0] - xm[0]) / dd, yphi = (xp[1] - xm[1]) / dd, xlam = (lp[0] - lm[0]) / dd, ylam = (lp[1] - lm[1]) / dd;
    const el = pj.el, Mr = el.sphere ? el.a : radM(el, p), Nc = (el.sphere ? el.a : radN(el, p)) * Math.cos(p);
    const h = Math.hypot(xphi, yphi) / Mr, k = Math.hypot(xlam, ylam) / Nc, s = (yphi * xlam - xphi * ylam) / (Mr * Nc);
    const ap = Math.sqrt(h * h + k * k + 2 * s), bp = Math.sqrt(Math.max(0, h * h + k * k - 2 * s));
    const A = (ap + bp) / 2, B = (ap - bp) / 2;
    const r = { h, k, s, a: A, b: B, omega: 2 * Math.asin(Math.min(1, Math.abs(A - B) / (A + B))) * R2D };
    if (![h, k, s].every(isNum)) return { h: NaN, k: NaN, s: NaN, a: NaN, b: NaN, omega: NaN, code: 'outside' };
    return r;
  }

  /* ---------- ancient measurement ---------- */
  /** obliquity of the ecliptic, degrees (Laskar 1986, A&A 157:59; valid ±10 000 years from J2000) */
  function obliquity(year) {
    const t = (year - 2000) / 10000, c = [84381.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45];
    let s = 0, tp = 1; for (const k of c) { s += k * tp; tp *= t; }
    return { v: s / 3600, code: Math.abs(t) > 1 ? 'laskar_range' : null };
  }
  /** latitude from a noon gnomon shadow: φ = z + δ, z = atan(shadow/gnomon) (+ the sun's semi-diameter 0.2667° if the shadow's edge is the upper limb) */
  const gnomonLat = (shadow, gnomon, decl, limb) => Math.atan2(shadow, gnomon) * R2D + (limb ? 0.2667 : 0) + (decl || 0);

  /* ---------- TopoJSON (the vendored land) ---------- */
  let LAND = null;
  function land() {
    if (LAND) return LAND;
    const T = LAND110, [sx, sy] = T.transform.scale, [tx, ty] = T.transform.translate;
    const arcs = T.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
    const ringOf = ids => { const out = []; for (const i of ids) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); for (let j = out.length ? 1 : 0; j < a.length; j++) out.push(a[j]); } return out; };
    const rings = [];
    for (const g of T.objects.land.geometries) {
      if (g.type === 'Polygon') for (const r of g.arcs) rings.push(ringOf(r));
      else if (g.type === 'MultiPolygon') for (const pg of g.arcs) for (const r of pg) rings.push(ringOf(r));
    }
    return (LAND = rings);
  }

  /* ---------- the network (Dijkstra; deterministic ties by place order) ---------- */
  function route(net, from, to, by) {
    const n = net.n, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), pe = new Array(n).fill(null), done = new Array(n).fill(false);
    dist[from] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === to) break;
      done[u] = true;
      for (const e of net.adj[u]) { const w = e[by]; if (!(w >= 0)) continue; if (dist[u] + w < dist[e.v] - 1e-12) { dist[e.v] = dist[u] + w; prev[e.v] = u; pe[e.v] = e; } }
    }
    if (!(dist[to] < Infinity)) return null;
    const legs = []; for (let v = to; v !== from; v = prev[v]) legs.unshift(pe[v]);
    return { legs, nodes: [from, ...legs.map(l => l.v)] };
  }

  /* ---------- run ---------- */
  function prepare(spec) { return { cache: new Map() }; }
  function run(spec, env, opts) {
    const prep = (opts && opts.prepared) || prepare(spec), cache = prep.cache;
    const ev = (v, dflt) => { if (v === undefined || v === null) return dflt; if (typeof v === 'number') return v; if (typeof v === 'boolean') return +v; let f = cache.get(v); if (!f) { f = C.cx(v); cache.set(v, f); } return f(env); };
    const m = spec.model || {}, codes = [], code = (id, c) => codes.push({ id, code: c });
    const Rkm = ev(m.radius, R_MEAN_KM), Rm = Rkm * 1000;
    const el = ellipsoid(m.ellipsoid || 'WGS84', Rm);
    const units = Object.assign({}, UNITS); for (const [k, u] of Object.entries(m.units || {})) units[k] = [u.m, isNum(u.min) ? u.min : u.m, isNum(u.max) ? u.max : u.m];
    const unitM = (u, b) => { const x = units[u || 'km']; return x ? x[b === 'min' ? 1 : b === 'max' ? 2 : 0] : NaN; };
    const places = (m.places || []).map(p => ({ id: p.id, lat: ev(p.lat, NaN), lon: ev(p.lon, NaN), label: p.label, c: p.c }));
    const pIdx = new Map(places.map((p, i) => [p.id, i]));
    const P = id => places[pIdx.get(id)];
    const terrs = (m.territories || []).map(t => ({ id: t.id, from: ev(t.from, -Infinity), to: ev(t.to, Infinity), rings: ringsOf(t), label: t.label, c: t.c, big: !!t.big }));
    const T = id => terrs.find(t => t.id === id);
    const active = (t, y) => !isNum(y) || (t.from <= y && y < t.to);
    let pj = null;
    if (isObj(m.projection)) {
      const PP = {}; for (const k of Object.keys(m.projection)) PP[k] = ['type', 'zone', 'south'].includes(k) ? m.projection[k] : ev(m.projection[k], undefined);
      pj = makeProjection(PP, el, Rm);
    }
    // the network: edges both ways (river a→b downstream, b→a upstream; oneway: a→b only)
    let net = null;
    if (isObj(m.network)) {
      const sp = Object.assign({}, SPEEDS), co = Object.assign({}, COSTS);
      for (const [k, v] of Object.entries(m.network.speeds || {})) sp[k] = ev(v, NaN);
      for (const [k, v] of Object.entries(m.network.costs || {})) co[k] = ev(v, NaN);
      const fac = ev(m.network.factor, 1), adj = places.map(() => []), g = geod(el);
      for (const e of m.network.edges || []) {
        const a = pIdx.get(e.a), b = pIdx.get(e.b); if (a === undefined || b === undefined) continue;
        if (!(ev(e.open, 1))) continue;
        const pa = places[a], pb = places[b];
        let km = ev(e.km, undefined);
        if (km === undefined) km = (g ? g.Inverse(pa.lat, pa.lon, pb.lat, pb.lon).s12 : sphArc(pa.lat, pa.lon, pb.lat, pb.lon) * Rm) / 1000 * fac;
        const leg = (u, v, mode) => ({ u, v, mode, km, days: km / sp[mode], cost: km * co[mode] });
        adj[a].push(leg(a, b, e.mode));
        if (!e.oneway) adj[b].push(leg(b, a, e.mode === 'river' ? 'riverUp' : e.mode));
      }
      net = { n: places.length, adj };
    }
    const routeOf = (from, to, by) => (net ? route(net, pIdx.get(from), pIdx.get(to), by || 'days') : null);
    const g = geod(el);
    const distance = (o, a, b) => {
      const method = o.method || 'geodesic';
      if (![a.lat, a.lon, b.lat, b.lon].every(isNum)) return NaN;
      let s;
      if (method === 'haversine') s = havArc(a.lat, a.lon, b.lat, b.lon) * Rm;
      else if (method === 'sphere') s = sphArc(a.lat, a.lon, b.lat, b.lon) * Rm;
      else if (method === 'rhumb') { const r = rhumb(el, a.lat, a.lon, b.lat, b.lon); if (r.code) code(o.id, r.code); s = r.s; }
      else { if (!g) { code(o.id, 'no_geodesic'); return NaN; } const r = g.Inverse(a.lat, a.lon, b.lat, b.lon); s = r.s12; if (Math.abs(r.a12 - 180) < 1e-6) code(o.id, 'antipodal'); }
      return s;
    };
    const areaOf = (t, method) => { let A = 0; t.rings.forEach((r, i) => { const x = ringArea(r, el, Rm, method || 'geodesic', t.big && i === 0); A += i === 0 ? x : -x; }); return A; };
    const out = {};
    for (const o of spec.outputs || []) {
      try { out[o.id] = one(o); } catch (e) { out[o.id] = o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN; code(o.id, 'error'); }
    }
    function one(o) {
      const S = o.kind === 'scalar', of = o.of;
      if (S && of === 'distance') return distance(o, P(o.from), P(o.to)) / unitM(o.unit, o.bound);
      if (S && of === 'bearing') {
        const a = P(o.from), b = P(o.to), mth = o.method || 'geodesic', fin = o.end === 'final';
        if (a.lat === b.lat && a.lon === b.lon) { code(o.id, 'same_point'); return NaN; }
        if (mth === 'rhumb') return rhumb(el, a.lat, a.lon, b.lat, b.lon).azi;
        if (mth === 'sphere') return fin ? (sphBearing(b.lat, b.lon, a.lat, a.lon) + 180) % 360 : sphBearing(a.lat, a.lon, b.lat, b.lon);
        if (!g) { code(o.id, 'no_geodesic'); return NaN; }
        const r = g.Inverse(a.lat, a.lon, b.lat, b.lon); return ((fin ? r.azi2 : r.azi1) + 360) % 360;
      }
      if (S && of === 'area') return areaOf(T(o.territory), o.method) / AREA_UNITS[o.unit || 'km2'];
      if (S && of === 'perimeter') { const t = T(o.territory); let s = 0; for (const r of t.rings) s += ringPerimeter(r, el, Rm, o.method || 'geodesic'); return s / unitM(o.unit, o.bound); }
      if (S && of === 'contains') { const t = T(o.territory), p = P(o.place), y = ev(o.year, undefined); if (!active(t, y)) return 0; const r = inTerr(t.rings, p.lat, p.lon); if (r === null) { code(o.id, 'pip_pole'); return NaN; } return +r; }
      if (S && of === 'inForce') return +active(T(o.territory), ev(o.year, NaN));
      if (S && of === 'count') { const y = ev(o.year, NaN); return terrs.filter(t => active(t, y)).length; }
      if (S && of === 'overlap') return overlap(o) / AREA_UNITS[o.unit || 'km2'];
      if (S && of === 'scale') { const r = tissot(pj, ev(o.lat, NaN), ev(o.lon, NaN)); if (r.code) code(o.id, r.code); if (pj.code) code(o.id, pj.code); return r[o.what]; }
      if (S && of === 'xy') {
        const la = ev(o.lat, NaN), lo = ev(o.lon, NaN);
        if (!pj.vis(la, lo)) { code(o.id, 'not_visible'); return NaN; }
        if (pj.maxLat && Math.abs(la) > pj.maxLat) code(o.id, 'clamped');
        if (pj.code) code(o.id, pj.code);
        return pj.fwd(la, lo)[o.axis === 'y' ? 1 : 0] / (o.unit === 'km' ? 1000 : 1);
      }
      if (S && of === 'route') {
        const r = routeOf(o.from, o.to, o.by), what = o.what || o.by || 'days';
        if (what === 'found') return r ? 1 : 0;
        if (!r) { code(o.id, 'no_route'); return NaN; }
        if (what === 'legs') return r.legs.length;
        return r.legs.reduce((s, l) => s + l[what], 0);
      }
      if (S && of === 'convert') return ev(o.value, NaN) * unitM(o.from, o.bound) / unitM(o.to, o.bound);
      if (S && of === 'arcToCircle') { const ang = ev(o.angle, NaN); if (!(ang > 0)) { code(o.id, 'angle'); return NaN; } return ev(o.base, NaN) * 360 / ang * unitM(o.unit || 'km', o.bound) / unitM(o.to || o.unit || 'km', o.bound); }
      if (S && of === 'gnomonLat') { const gn = ev(o.gnomon, NaN); if (!(gn > 0)) { code(o.id, 'gnomon'); return NaN; } return gnomonLat(ev(o.shadow, NaN), gn, ev(o.decl, 0), !!o.limb); }
      if (S && of === 'obliquity') { const r = obliquity(ev(o.year, NaN)); if (r.code) code(o.id, r.code); return r.v; }
      if (S && of === 'timeToLon') return ev(o.minutes, NaN) / 4;
      if (o.kind === 'series') {
        const grid = () => { const a = ev(o.from, NaN), b = ev(o.to, NaN), n = o.n || 200, out2 = []; if (!isNum(a) || !isNum(b)) return out2; for (let i = 0; i < n; i++) out2.push(a + (b - a) * i / (n - 1)); return out2; };
        if (of === 'years' || of === 'lat') return grid();
        if (of === 'area') { const t = T(o.territory), A = areaOf(t, o.method) / AREA_UNITS[o.unit || 'km2']; return grid().map(y => (active(t, y) ? A : 0)); }
        if (of === 'scale') { const lo = ev(o.lon, pj.lon0); return grid().map(la => { const r = tissot(pj, la, lo); return r[o.what]; }); }
        if (of === 'routeKm' || of === 'routeDays' || of === 'routeCost') {
          const r = routeOf(o.from, o.to, o.by); if (!r) { code(o.id, 'no_route'); return []; }
          const f = { routeKm: 'km', routeDays: 'days', routeCost: 'cost' }[of], a = [0]; let s = 0; for (const l of r.legs) { s += l[f]; a.push(s); } return a;
        }
      }
      if (o.kind === 'scene') return drawMap(o);
      return NaN;
    }
    // overlap of two territories: raster on an equal-area grid, cell area R²·Δλ·(sin φ2 − sin φ1) (exact for the cell)
    function overlap(o) {
      const a = T(o.a), b = T(o.b), y = ev(o.year, undefined);
      if (!active(a, y) || !active(b, y)) return 0;
      let cell = ev(o.cell, 0.25); if (!(cell >= 0.01)) cell = 0.25;
      const box = t => { let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity; const r = t.rings[0]; let x = r[0][0]; for (let i = 0; i < r.length; i++) { if (i) x += wrap180(r[i][0] - r[i - 1][0]); w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, r[i][1]); n = Math.max(n, r[i][1]); } return [w, e, s, n]; };
      const A = box(a), B = box(b), mid = (A[0] + A[1]) / 2, sh = wrap180((B[0] + B[1]) / 2 - mid) - ((B[0] + B[1]) / 2 - mid);
      const w = Math.max(A[0], B[0] + sh), e = Math.min(A[1], B[1] + sh), s = Math.max(A[2], B[2]), n = Math.min(A[3], B[3]);
      if (!(w < e && s < n)) return 0;
      const nv = [a, b].reduce((t, x) => t + x.rings.reduce((u, r) => u + r.length, 0), 0);   // the work bound: cells × vertices ≤ 3·10⁷
      while (((e - w) / cell) * ((n - s) / cell) > Math.min(LIM.cells, 3e7 / nv)) { cell *= 2; code(o.id, 'coarse'); }
      let sum = 0; const Ra = el.sphere ? Rm : 6371007.1809;   // authalic radius of WGS84 (Moritz 1980)
      for (let la = s + cell / 2; la < n; la += cell) {
        const ca = Ra * Ra * cell * D2R * (Math.sin((la + cell / 2) * D2R) - Math.sin((la - cell / 2) * D2R));
        for (let lo = w + cell / 2; lo < e; lo += cell) if (inTerr(a.rings, la, lo) && inTerr(b.rings, la, lo)) sum += ca;
      }
      return sum;
    }
    function drawMap(o) {
      const vw = m.view || {}, P2 = pj || makeProjection({ type: 'equirect' }, el, Rm), K = 1000;
      const bb = Array.isArray(vw.bbox) ? vw.bbox.map(v => ev(v, NaN)) : [-180, -90, 180, 90];
      const sc = C.scene([-1, 1, -1, 1]);
      // the view: the projected outline of the bbox (or the visible cap of an azimuthal projection)
      const xs = [], ys = [];
      const W = bb[0], E2 = bb[2] < bb[0] ? bb[2] + 360 : bb[2];
      for (let i = 0; i <= 24; i++) for (const la of [bb[1], bb[3], bb[1] + (bb[3] - bb[1]) * i / 24]) for (const lo of [W, E2, W + (E2 - W) * i / 24]) {
        if (!(la === bb[1] || la === bb[3] || lo === W || lo === E2)) continue;
        if (P2.vis(la, lo)) { const q = P2.fwd(la, lo); xs.push(q[0] / K); ys.push(q[1] / K); }
      }
      if (P2.cut === 'cap') { for (let i = 0; i < 72; i++) { const d = sphDest(P2.lat0, P2.lon0, i * 5, Math.min(P2.clip, 179) * D2R * 0.999); const q = P2.fwd(d[0], d[1]); if (isNum(q[0])) { xs.push(q[0] / K); ys.push(q[1] / K); } } }
      const view = C.fitView(xs, ys, 0.04);
      const inView = pts => { for (let i = 0; i < pts.length; i += 2) if (pts[i] >= view[0] && pts[i] <= view[1] && pts[i + 1] >= view[2] && pts[i + 1] <= view[3]) return true; return false; };
      // a line of [lon, lat] points → projected pieces, cut at the antimeridian of the projection or where it leaves the visible cap
      const pieces = (ll, closed) => {
        const out2 = []; let cur = [], prevDl = null, whole = true;
        const seq = closed ? ll.concat([ll[0]]) : ll;
        for (const [lo, la] of seq) {
          const v = P2.vis(la, lo), d = P2.dlam(lo);
          if (!v || (prevDl !== null && P2.cut !== 'cap' && Math.abs(d - prevDl) > 180)) { if (cur.length >= 4) out2.push(cur); cur = []; whole = false; }
          if (v) { const q = P2.fwd(la, lo); if (isNum(q[0]) && isNum(q[1])) cur.push(q[0] / K, q[1] / K); }
          prevDl = v ? d : null;
        }
        if (cur.length >= 4) out2.push(cur);
        return { out: out2, whole: whole && out2.length === 1 };
      };
      const densify = (ring, step) => { const o2 = []; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; o2.push(a); const d = Math.max(Math.abs(wrap180(b[0] - a[0])), Math.abs(b[1] - a[1])); const k = Math.min(32, Math.floor(d / step)); for (let j = 1; j < k; j++) o2.push([a[0] + wrap180(b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); } return o2; };
      if ((vw.basemap || 'land110') === 'land110') {
        const L = land(); if (!L.length) code(o.id, 'no_basemap');
        for (const r of L) { const pc = pieces(P2.cut === 'cap' || P2.type === 'lcc' || P2.type === 'albers' ? densify(r, 2) : r, true); for (const p of pc.out) if (inView(p)) sc.poly(p, { c: 'muted', fill: pc.whole, closed: pc.whole }); }
      }
      const gstep = ev(vw.graticule, 30);
      if (gstep > 0 && gstep <= 90) {
        for (let lo = -180; lo < 180; lo += gstep) { const ln = []; for (let la = -90; la <= 90; la += 2) ln.push([lo, Math.max(-89.999, Math.min(89.999, la))]); for (const p of pieces(ln, false).out) if (inView(p)) sc.poly(p, { c: 'muted', closed: false, dash: true }); }
        for (let la = -90 + gstep; la < 90; la += gstep) { const ln = []; for (let lo = -180; lo <= 180; lo += 2) ln.push([lo, la]); for (const p of pieces(ln, false).out) if (inView(p)) sc.poly(p, { c: 'muted', closed: false, dash: true }); }
      }
      const year = ev(o.year !== undefined ? o.year : vw.year, undefined);
      for (const t of terrs) if (active(t, year)) for (const r of t.rings) { const pc = pieces(densify(r, 1), true); for (const p of pc.out) sc.poly(p, { c: t.c || 'info', fill: pc.whole, closed: pc.whole }); }
      for (const rt of m.routes || []) {
        const via = rt.via.map(P);
        for (let i = 0; i + 1 < via.length; i++) {
          const a = via[i], b = via[i + 1]; let pts;
          if ((rt.method || 'geodesic') === 'rhumb') pts = rhumbPath(a.lat, a.lon, b.lat, b.lon, 64);
          else if (rt.method !== 'sphere' && g) { const L = GL(), ln = g.InverseLine(a.lat, a.lon, b.lat, b.lon), n = 64; pts = []; for (let j = 0; j <= n; j++) { const q = ln.Position(ln.s13 * j / n, L.Geodesic.LATITUDE | L.Geodesic.LONGITUDE | L.Geodesic.LONG_UNROLL); pts.push([q.lat2, wrap180(q.lon2)]); } }
          else pts = sphPath(a.lat, a.lon, b.lat, b.lon, 64);
          for (const p of pieces(pts.map(([la, lo]) => [lo, la]), false).out) sc.poly(p, { c: rt.c || 'hi', closed: false });
        }
      }
      if (isObj(o.path)) {
        const r = routeOf(o.path.from, o.path.to, o.path.by);
        if (!r) code(o.id, 'no_route');
        else for (const l of r.legs) { const a = places[l.u], b = places[l.v], q1 = P2.fwd(a.lat, a.lon), q2 = P2.fwd(b.lat, b.lon); if (P2.vis(a.lat, a.lon) && P2.vis(b.lat, b.lon)) sc.seg(q1[0] / K, q1[1] / K, q2[0] / K, q2[1] / K, { c: l.mode === 'sea' || l.mode === 'coast' ? 'info' : l.mode.startsWith('river') ? 'ok' : 'warn', w: 3, dash: l.mode === 'sea' }); }
      }
      if (isObj(vw.tissot)) {
        const st = ev(vw.tissot.step, 30), rr = ev(vw.tissot.r, 2.5) * D2R;
        if (st >= 5 && rr > 0) for (let la = -90 + st; la < 90; la += st) for (let lo = -180 + st / 2; lo < 180; lo += st) {
          if (!P2.vis(la, lo)) continue;
          const ring = []; for (let i = 0; i < 36; i++) { const d = sphDest(la, lo, i * 10, rr); ring.push([d[1], d[0]]); }
          for (const p of pieces(ring, true).out) if (inView(p)) sc.poly(p, { c: 'warn', fill: true });
        }
      }
      const labels = o.labels !== false && (vw.labels !== false);
      for (const p of places) {
        if (!isNum(p.lat) || !isNum(p.lon) || !P2.vis(p.lat, p.lon)) continue;
        const q = P2.fwd(p.lat, p.lon); sc.pt(q[0] / K, q[1] / K, { c: p.c || 'base', r: 3 });
        if (labels && p.label) sc.txt(q[0] / K, q[1] / K + (view[3] - view[2]) * 0.025, { key: p.label, c: p.c || 'base' });
      }
      const res = sc.done(); res.view = view; return res;
    }
    return { out, codes };
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  const API = Object.freeze({
    table: { model: TABLE, outputs: OUT },   // the form of the activity author (src/engines/kernel/schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine,
    UNITS, SPEEDS, COSTS, PROJS, ELLIPSOIDS, R_MEAN_KM,
    wrap180, havArc, sphArc, sphBearing, sphDest, rhumb, meridian, ellipsoid, makeProjection, tissot, sphExcess, ringArea, inRing, obliquity, gnomonLat, land,
  });
  export default API;
  /* i18n-ignore-end */
