"""map@1 in Python (docs/library/map.md): the twin of the checks of engine/src/48_lib_map.js — check_spec(spec), exprs(spec), keys(spec)
give the same problems (code, path, msg, level) and the same lists as the JS module; tests/enginelib.js compares both on
tests/fixtures/enginelib/map.json. It does not compute maps."""
import enginelib as L

ID = "map@1"
ROLES = L.ROLES
UNITS = ["m", "km", "mi", "nmi", "pes", "passus", "romanMile", "leuga", "stade", "stadeAttic", "stadeOlympic", "stadeEratosthenes",
         "schoenus", "parasang", "arabMil", "farsakh", "league", "lieue", "legua"]
MODES = ["road", "track", "river", "riverUp", "sea", "coast"]
PROJS = ["equirect", "mercator", "tmerc", "utm", "lcc", "albers", "stereo", "ortho", "aeqd", "laea", "gnomonic", "robinson", "eqearth",
         "wintri", "mollweide", "sinusoidal", "cea"]
LIM = {"places": 500, "edges": 2000, "territories": 64, "rings": 16, "ringNums": 4000, "vertices": 20000, "routes": 32, "via": 64}
ROLE_E = "enum:" + "|".join(ROLES)

PROJ_T = {"type": "enum:" + "|".join(PROJS) + "!", "lon0": "numx", "lat0": "numx", "lat1": "numx", "lat2": "numx", "k0": "numx",
          "zone": "int:1:60", "south": "bool", "maxLat": "numx", "clip": "numx", "x0": "numx", "y0": "numx"}
TABLE = {
    "ellipsoid": "enum:WGS84|GRS80|clarke1866|intl1924|bessel1841|sphere",
    "radius": "numx",
    "projection": {"$obj": PROJ_T},
    "view": {"$obj": {"bbox": {"$list": "numx", "min": 4, "max": 4}, "basemap": "enum:land110|none", "graticule": "numx",
                      "tissot": {"$obj": {"step": "numx", "r": "numx"}}, "year": "numx", "labels": "bool"}},
    "places": {"$list": {"$obj": {"id": "id!", "lat": "numx!", "lon": "numx!", "label": "key", "c": ROLE_E}}, "max": LIM["places"]},
    "routes": {"$list": {"$obj": {"id": "id!", "via": {"$req": True, "$list": "ref", "min": 2, "max": LIM["via"]},
                                  "method": "enum:geodesic|sphere|rhumb", "c": ROLE_E}}, "max": LIM["routes"]},
    "network": {"$obj": {"edges": {"$req": True, "$list": {"$obj": {"a": "ref!", "b": "ref!",
                                                                  "mode": "enum:" + "|".join(m for m in MODES if m != "riverUp") + "!",
                                                                  "km": "numx", "open": "numx", "oneway": "bool"}}, "min": 1, "max": LIM["edges"]},
                         "speeds": {"$map": "numx", "max": 6}, "costs": {"$map": "numx", "max": 6}, "factor": "numx"}},
    "territories": {"$list": {"$obj": {"id": "id!", "from": "numx", "to": "numx",
                                       "rings": {"$req": True, "$list": {"$list": "fin", "min": 6, "max": LIM["ringNums"]}, "min": 1, "max": LIM["rings"]},
                                       "label": "key", "c": ROLE_E, "big": "bool"}}, "max": LIM["territories"]},
    "units": {"$map": {"$obj": {"m": "pos!", "min": "pos", "max": "pos"}}, "max": 12},
}
BOUND, AREA_U, N = "enum:best|min|max", "enum:km2|m2|ha|mi2", "int:2:2000"
OUT = {
    "scalar": {
        "distance": {"from": "ref!", "to": "ref!", "method": "enum:geodesic|haversine|sphere|rhumb", "unit": "name", "bound": BOUND},
        "bearing": {"from": "ref!", "to": "ref!", "method": "enum:geodesic|sphere|rhumb", "end": "enum:initial|final"},
        "area": {"territory": "ref!", "method": "enum:geodesic|sphere", "unit": AREA_U},
        "perimeter": {"territory": "ref!", "method": "enum:geodesic|sphere", "unit": "name", "bound": BOUND},
        "overlap": {"a": "ref!", "b": "ref!", "year": "numx", "cell": "numx", "unit": AREA_U},
        "contains": {"territory": "ref!", "place": "ref!", "year": "numx"},
        "inForce": {"territory": "ref!", "year": "numx!"},
        "count": {"year": "numx!"},
        "scale": {"lat": "numx!", "lon": "numx!", "what": "enum:h|k|a|b|omega|s!"},
        "xy": {"lat": "numx!", "lon": "numx!", "axis": "enum:x|y!", "unit": "enum:m|km"},
        "route": {"from": "ref!", "to": "ref!", "by": "enum:days|km|cost", "what": "enum:days|km|cost|legs|found"},
        "convert": {"value": "numx!", "from": "name!", "to": "name!", "bound": BOUND},
        "arcToCircle": {"angle": "numx!", "base": "numx!", "unit": "name", "to": "name", "bound": BOUND},
        "gnomonLat": {"shadow": "numx!", "gnomon": "numx!", "decl": "numx", "limb": "bool"},
        "obliquity": {"year": "numx!"},
        "timeToLon": {"minutes": "numx!"},
    },
    "series": {
        "years": {"from": "numx!", "to": "numx!", "n": N},
        "area": {"territory": "ref!", "from": "numx!", "to": "numx!", "n": N, "method": "enum:geodesic|sphere", "unit": AREA_U},
        "lat": {"from": "numx!", "to": "numx!", "n": N},
        "scale": {"what": "enum:h|k|a|b|omega|s!", "lon": "numx", "from": "numx!", "to": "numx!", "n": N},
        "routeKm": {"from": "ref!", "to": "ref!", "by": "enum:days|km|cost"},
        "routeDays": {"from": "ref!", "to": "ref!", "by": "enum:days|km|cost"},
        "routeCost": {"from": "ref!", "to": "ref!", "by": "enum:days|km|cost"},
    },
    "scene": {"map": {"year": "numx", "path": {"$obj": {"from": "ref!", "to": "ref!", "by": "enum:days|km|cost"}}, "labels": "bool"}},
}
PLACE_F, TERR_F, UNIT_F = ["from", "to", "place"], ["territory", "a", "b"], ["unit", "to", "from"]
NUMX_ORDER = ["lat", "lon", "year", "cell", "value", "angle", "base", "shadow", "gnomon", "decl", "minutes", "from", "to"]


def _arr(v): return v if isinstance(v, list) else []
def _id(v): return isinstance(v, str) and L._full(L.ID_RE, v)


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    L.walk(m, TABLE, "model", E, W)
    M = m if L.is_obj(m) else {}
    places, terrs = [], []
    for i, p in enumerate(_arr(M.get("places"))):
        if not L.is_obj(p): continue
        if isinstance(p.get("id"), str):
            if p["id"] in places: E("dup", f"model.places[{i}].id", f"the id {p['id']} is used twice")
            places.append(p["id"])
        if L.is_num(p.get("lat")) and abs(p["lat"]) > 90: E("value", f"model.places[{i}].lat", "needs a latitude from -90 to 90")
    verts = 0
    for i, t in enumerate(_arr(M.get("territories"))):
        if not L.is_obj(t): continue
        if isinstance(t.get("id"), str):
            if t["id"] in terrs: E("dup", f"model.territories[{i}].id", f"the id {t['id']} is used twice")
            terrs.append(t["id"])
        for j, r in enumerate(_arr(t.get("rings"))):
            if not isinstance(r, list): continue
            verts += len(r) / 2
            if len(r) % 2: E("ring", f"model.territories[{i}].rings[{j}]", "needs pairs lon, lat (an even count of numbers)")
            elif any(k % 2 == 1 and L.is_num(v) and abs(v) > 90 for k, v in enumerate(r)): E("ring", f"model.territories[{i}].rings[{j}]", "a latitude is outside -90 to 90")
        if L.is_num(t.get("from")) and L.is_num(t.get("to")) and not (t["from"] < t["to"]): E("value", f"model.territories[{i}].to", "needs from < to")
    if verts > LIM["vertices"]: E("size", "model.territories", f"more than {LIM['vertices']} vertices in all")
    pr = M.get("projection") if L.is_obj(M.get("projection")) else None
    if pr is not None:
        ty = pr.get("type")
        if ty in ("lcc", "albers") and L.is_num(pr.get("lat1")) and L.is_num(pr.get("lat2")) and abs(pr["lat1"] + pr["lat2"]) < 1e-9:
            E("projection", "model.projection.lat2", "lat2 = -lat1 gives a cone constant n = 0 (use a cylindrical projection)")
        if ty in ("lcc", "albers") and ((L.is_num(pr.get("lat1")) and abs(pr["lat1"]) >= 90) or (L.is_num(pr.get("lat2")) and abs(pr["lat2"]) >= 90)):
            E("projection", "model.projection.lat1", "a standard parallel must be between -90 and 90")
        if ty == "utm" and "zone" not in pr and "lon0" not in pr: E("value", "model.projection.zone", "missing (utm needs its zone 1-60 or lon0)")
        if L.is_num(pr.get("lat0")) and abs(pr["lat0"]) > 90: E("value", "model.projection.lat0", "needs a latitude from -90 to 90")
    vw = M.get("view") if L.is_obj(M.get("view")) else None
    if vw is not None and isinstance(vw.get("bbox"), list) and len(vw["bbox"]) == 4 and L.is_num(vw["bbox"][1]) and L.is_num(vw["bbox"][3]) \
            and not (vw["bbox"][1] < vw["bbox"][3] and vw["bbox"][1] >= -90 and vw["bbox"][3] <= 90):
        E("value", "model.view.bbox", "needs [west, south, east, north] with -90 <= south < north <= 90")
    units = M.get("units") if L.is_obj(M.get("units")) else {}
    for k, u in units.items():
        if L.is_obj(u) and L.is_num(u.get("m")) and ((L.is_num(u.get("min")) and u["min"] > u["m"]) or (L.is_num(u.get("max")) and u["max"] < u["m"])):
            E("value", f"model.units.{k}", "needs min <= m <= max")
    for i, r in enumerate(_arr(M.get("routes"))):
        if L.is_obj(r):
            for j, v in enumerate(_arr(r.get("via"))):
                if _id(v) and v not in places: E("ref", f"model.routes[{i}].via[{j}]", "not a place of the model")
    nw = M.get("network") if L.is_obj(M.get("network")) else None
    if nw is not None:
        for i, e in enumerate(_arr(nw.get("edges"))):
            if not L.is_obj(e): continue
            for f in ("a", "b"):
                if _id(e.get(f)) and e[f] not in places: E("ref", f"model.network.edges[{i}].{f}", "not a place of the model")
            if isinstance(e.get("a"), str) and e.get("a") == e.get("b"): E("ref", f"model.network.edges[{i}].b", "an edge from a place to itself")
        for f in ("speeds", "costs"):
            if L.is_obj(nw.get(f)):
                for k in nw[f]:
                    if L.check_kind("name", k) and k not in MODES: E("enum", f"model.network.{f}.{k}", "one of " + ", ".join(MODES))

    def unit_ok(u): return u in UNITS or u in units

    def out(o, at, E2, W2):
        T = OUT[o["kind"]].get(o["of"])
        if not T: E2("output", at + ".of", f"{o['kind']} outputs of {ID} are: {', '.join(OUT[o['kind']])}"); return
        L.walk(o, {"id": "expr", "kind": "expr", "of": "expr", **T}, at, E2, W2)
        for f in PLACE_F:
            if T.get(f, "").startswith("ref") and _id(o.get(f)) and o[f] not in places: E2("ref", f"{at}.{f}", "not a place of the model")
        for f in TERR_F:
            if T.get(f) and _id(o.get(f)) and o[f] not in terrs: E2("ref", f"{at}.{f}", "not a territory of the model")
        for f in UNIT_F:
            if T.get(f) in ("name", "name!") and isinstance(o.get(f), str) and L.check_kind("name", o[f]) and not unit_ok(o[f]):
                E2("ref", f"{at}.{f}", "not a unit (" + ", ".join(UNITS) + " or one of model.units)")
        if (o["of"] == "route" or o["of"].startswith("route") or (o["of"] == "map" and L.is_obj(o.get("path")))) and nw is None:
            E2("ref", at + ".of", "needs model.network")
        if o["of"] == "map" and L.is_obj(o.get("path")):
            for f in ("from", "to"):
                if _id(o["path"].get(f)) and o["path"][f] not in places: E2("ref", f"{at}.path.{f}", "not a place of the model")
        if o["of"] in ("scale", "xy") and pr is None: E2("ref", at + ".of", "needs model.projection")
        if o["kind"] == "scene" and pr is None: W2("projection", at, "no model.projection: drawn in plate carree")

    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P


def exprs(spec):
    out, m = [], (spec.get("model") if L.is_obj(spec) and L.is_obj(spec.get("model")) else {})
    def add(v, p):
        if isinstance(v, str): out.append([v, p, []])
    add(m.get("radius"), "model.radius")
    if L.is_obj(m.get("projection")):
        for k in ["lon0", "lat0", "lat1", "lat2", "k0", "maxLat", "clip", "x0", "y0"]: add(m["projection"].get(k), "model.projection." + k)
    if L.is_obj(m.get("view")):
        v = m["view"]
        if isinstance(v.get("bbox"), list):
            for i, x in enumerate(v["bbox"]): add(x, f"model.view.bbox[{i}]")
        add(v.get("graticule"), "model.view.graticule")
        if L.is_obj(v.get("tissot")): add(v["tissot"].get("step"), "model.view.tissot.step"); add(v["tissot"].get("r"), "model.view.tissot.r")
        add(v.get("year"), "model.view.year")
    for i, p in enumerate(_arr(m.get("places"))):
        if L.is_obj(p): add(p.get("lat"), f"model.places[{i}].lat"); add(p.get("lon"), f"model.places[{i}].lon")
    if L.is_obj(m.get("network")):
        nw = m["network"]
        add(nw.get("factor"), "model.network.factor")
        for i, e in enumerate(_arr(nw.get("edges"))):
            if L.is_obj(e): add(e.get("km"), f"model.network.edges[{i}].km"); add(e.get("open"), f"model.network.edges[{i}].open")
        for f in ("speeds", "costs"):
            if L.is_obj(nw.get(f)):
                for k, v in nw[f].items(): add(v, f"model.network.{f}.{k}")
    for i, t in enumerate(_arr(m.get("territories"))):
        if L.is_obj(t): add(t.get("from"), f"model.territories[{i}].from"); add(t.get("to"), f"model.territories[{i}].to")
    for i, o in enumerate(_arr(spec.get("outputs") if L.is_obj(spec) else None)):
        if not L.is_obj(o) or o.get("kind") not in OUT or o.get("of") not in OUT[o["kind"]]: continue
        T = OUT[o["kind"]][o["of"]]
        for k in NUMX_ORDER:
            if T.get(k, "").startswith("numx"): add(o.get(k), f"outputs[{i}].{k}")
    return out


def keys(spec):
    out, m = [], (spec.get("model") if L.is_obj(spec) and L.is_obj(spec.get("model")) else {})
    for i, p in enumerate(_arr(m.get("places"))):
        if L.is_obj(p) and isinstance(p.get("label"), str): out.append([p["label"], f"model.places[{i}].label"])
    for i, t in enumerate(_arr(m.get("territories"))):
        if L.is_obj(t) and isinstance(t.get("label"), str): out.append([t["label"], f"model.territories[{i}].label"])
    return out
