"""geom@1 — the Python twin of engine/src/47_lib_geom.js (docs/library/geom.md): check_spec(spec), exprs(spec), keys(spec) give the
same problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys (tests/enginelib.js compares them on
tests/fixtures/enginelib/geom.json). It does not build the construction."""
import re
import enginelib as L

ID = "geom@1"
MAX_OBJ, MAX_SET, BUDGET = 300, 200, 200000
TYPE_NAMES = {"P": "a point", "L": "a line", "S": "a segment", "R": "a ray", "C": "a circle", "K": "a conic", "G": "a polygon", "U": "a curve", "T": "a set"}
LIN = "LSR"
CENTRES = ["centroid", "incenter", "circumcenter", "orthocenter", "ninepoint", "symmedian", "gergonne", "nagel", "mittenpunkt", "spieker",
           "feuerbach", "fermat", "delongchamps", "excenter-a", "excenter-b", "excenter-c"]
TRICIRCLES = ["circumcircle", "incircle", "ninepoint", "excircle-a", "excircle-b", "excircle-c"]
TRANSFORMS = ["translate", "rotate", "reflect", "dilate", "invert", "shear", "affine", "projective"]
ROLES = ["base", "muted", "hi", "ok", "bad", "warn", "info"]
PICK_RE = re.compile(r"^(index:[0-3]|near:[A-Za-z][A-Za-z0-9_-]{0,31}|far:[A-Za-z][A-Za-z0-9_-]{0,31}|other:[A-Za-z][A-Za-z0-9_-]{0,31}|continuous)$")


def _ref3(): return {"$req": True, "$list": "ref", "min": 3, "max": 3}


KINDS = {
    "point": {"point": True, "out": "P"},
    "pointOn": {"T": {"on": "ref!", "t": "numx!"}, "R": {"on": LIN + "CKGU"}, "out": "P"},
    "midpoint": {"list": ["P", "P"], "min": 2, "max": 2, "out": "P"},
    "intersect": {"T": {"of": {"$req": True, "$list": "ref", "min": 2, "max": 2}, "pick": "pick"}, "R": {"of": [LIN + "CK", LIN + "CK"]}, "out": "P"},
    "center": {"T": {"kind": "enum:" + "|".join(CENTRES) + "!", "of": _ref3()}, "R": {"of": ["P", "P", "P"]}, "out": "P"},
    "centerOf": {"T": {"of": "ref!"}, "R": {"of": "CK"}, "out": "P"},
    "foot": {"T": {"from": "ref!", "to": "ref!"}, "R": {"from": "P", "to": LIN}, "out": "P"},
    "focus": {"T": {"of": "ref!", "index": "int:0:1"}, "R": {"of": "K"}, "out": "P"},
    "line": {"list": ["P", "P"], "min": 2, "max": 2, "out": "L"},
    "segment": {"list": ["P", "P"], "min": 2, "max": 2, "out": "S"},
    "ray": {"list": ["P", "P"], "min": 2, "max": 2, "out": "R"},
    "parallel": {"T": {"to": "ref!", "through": "ref!"}, "R": {"to": LIN, "through": "P"}, "out": "L"},
    "perpendicular": {"T": {"to": "ref!", "through": "ref!"}, "R": {"to": LIN, "through": "P"}, "out": "L"},
    "perpBisector": {"list": ["P", "P"], "min": 2, "max": 2, "out": "L"},
    "angleBisector": {"T": {"of": _ref3(), "external": "bool"}, "R": {"of": ["P", "P", "P"]}, "out": "L"},
    "tangent": {"T": {"from": "ref!", "to": "ref!", "pick": "pick"}, "R": {"from": "P", "to": "CK"}, "out": "L"},
    "polar": {"T": {"of": "ref!", "to": "ref!"}, "R": {"of": "P", "to": "CK"}, "out": "L"},
    "radicalAxis": {"list": ["C", "C"], "min": 2, "max": 2, "out": "L"},
    "eulerLine": {"list": ["P", "P", "P"], "min": 3, "max": 3, "out": "L"},
    "simson": {"T": {"point": "ref!", "of": _ref3()}, "R": {"point": "P", "of": ["P", "P", "P"]}, "out": "L"},
    "circle": {"T": {"center": "ref", "through": "ref", "r": "numx", "points": {"$list": "ref", "min": 3, "max": 3}}, "R": {"center": "P", "through": "P", "points": ["P", "P", "P"]}, "out": "C"},
    "triCircle": {"T": {"kind": "enum:" + "|".join(TRICIRCLES) + "!", "of": _ref3()}, "R": {"of": ["P", "P", "P"]}, "out": "C"},
    "apollonius": {"T": {"of": _ref3(), "signs": {"$list": "int:-1:1", "min": 3, "max": 3}, "pick": "pick"}, "R": {"of": ["C", "C", "C"]}, "out": "C"},
    "mec": {"list": ["P"], "min": 1, "max": MAX_SET, "out": "C"},
    "conic": {"T": {"points": {"$list": "ref", "min": 5, "max": 5}, "foci": {"$list": "ref", "min": 2, "max": 2}, "through": "ref", "type": "enum:ellipse|hyperbola", "focus": "ref", "directrix": "ref", "e": "numx"},
              "R": {"points": ["P", "P", "P", "P", "P"], "foci": ["P", "P"], "through": "P", "focus": "P", "directrix": LIN}, "out": "K"},
    "polygon": {"list": ["P"], "min": 3, "max": MAX_SET, "out": "G"},
    "regular": {"T": {"center": "ref!", "vertex": "ref!", "n": "int:3:60!"}, "R": {"center": "P", "vertex": "P"}, "out": "G"},
    "hull": {"list": ["P"], "min": 1, "max": MAX_SET, "out": "G"},
    "morley": {"list": ["P", "P", "P"], "min": 3, "max": 3, "out": "G"},
    "napoleon": {"list": ["P", "P", "P"], "min": 3, "max": 3, "out": "G"},
    "clip": {"list": ["G", "G"], "min": 2, "max": 2, "out": "G"},
    "transform": {"T": {"kind": "enum:" + "|".join(TRANSFORMS) + "!", "of": "ref!", "by": {"$list": "ref", "min": 2, "max": 2}, "dx": "numx", "dy": "numx", "center": "ref", "angle": "numx", "deg": "bool",
                        "line": "ref", "factor": "numx", "circle": "ref", "k": "numx", "m": {"$list": "numx", "min": 6, "max": 6}, "from": {"$list": "ref", "min": 4, "max": 4}, "to": {"$list": "ref", "min": 4, "max": 4}},
                  "R": {"of": "PLSRCKGUT", "by": ["P", "P"], "center": "P", "line": LIN, "circle": "C", "from": ["P", "P", "P", "P"], "to": ["P", "P", "P", "P"]}, "out": None},
    "locus": {"T": {"of": "ref!"}, "R": {"of": "P"}, "out": "U"},
    "bezier": {"list": ["P"], "min": 2, "max": 20, "out": "U"},
    "geodesic": {"list": ["P", "P"], "min": 2, "max": 2, "out": "U"},
    "delaunay": {"list": ["P"], "min": 3, "max": MAX_SET, "out": "T"},
    "voronoi": {"list": ["P"], "min": 2, "max": MAX_SET, "out": "T"},
}
KIND_NAMES = list(KINDS)
TRANSFORM_NEEDS = {"translate": [["by"], ["dx", "dy"]], "rotate": [["center", "angle"]], "reflect": [["line"], ["center"]], "dilate": [["center", "factor"]],
                   "invert": [["circle"]], "shear": [["k"]], "affine": [["m"]], "projective": [["from", "to"]]}


def transform_out(kind, t):
    if kind == "invert":
        if t == "P": return "P"
        if t in ("L", "C"): return "C"
        return "U" if t in "PLSRCKGUT" and t != "T" else None
    if kind in ("shear", "affine", "projective") and t == "C": return "K"
    return t


SWEEP_T = {"var": "name!", "from": "numx!", "to": "numx!", "samples": "int:2:2000"}
MODEL_T = {"sweep": {"$obj": SWEEP_T}, "view": {"$list": "fin", "min": 4, "max": 4}, "tol": "pos", "seed": "int:0:4294967295"}
SIGS = {
    "x": [["P"]], "y": [["P"]],
    "dist": [["P", "P"], ["P", LIN], ["P", "C"]],
    "length": [["S"], ["P", "P"]],
    "angle": [["P", "P", "P"], [LIN, LIN]],
    "area": [["G"], ["C"], ["K"], ["P", "P", "P", "+"]],
    "perimeter": [["G"], ["C"], ["P", "P", "P", "+"]],
    "radius": [["C"]], "slope": [[LIN]], "eccentricity": [["K"], ["C"]], "conicType": [["K"], ["C"]],
    "count": [[LIN + "CK", LIN + "CK"]], "power": [["P", "C"]], "orient": [["P", "P", "P"]], "inside": [["P", "GC"]],
    "crossRatio": [["P", "P", "P", "P"]],
    "collinear": [["P", "P", "P", "+"]], "concyclic": [["P", "P", "P", "P"]], "concurrent": [[LIN, LIN, LIN]], "parallel": [[LIN, LIN]], "perpendicular": [[LIN, LIN]],
    "equal": [["P", "P", "P", "P"]], "on": [["P", LIN + "CKGU"]], "tangent": [[LIN + "C", "C"], ["C", LIN + "C"]], "defined": [["PLSRCKGUT"]],
}
ASSERTS = ["collinear", "concyclic", "concurrent", "parallel", "perpendicular", "equal", "on", "tangent"]
MEASURES = list(SIGS)
SCALAR_OF = MEASURES + ["flag", "always", "residual"]
SERIES_OF = ["sweep"] + MEASURES + ["residual"]
CODES = ["coincident-points", "collinear", "degenerate-triangle", "parallel", "coincident", "tangent", "no-intersection", "concentric", "contained",
         "separate", "point-at-infinity", "ill-conditioned", "undefined", "branch-switch", "fermat-vertex", "obtuse", "right-angle", "equilateral", "isosceles",
         "euler-line-undefined", "inversion-centre", "conic-degenerate", "conic-not-unique", "huge-coordinates", "locus-gaps", "budget-exhausted",
         "self-intersecting", "not-convex", "inside-circle", "no-solution", "not-collinear", "outside-disk", "param"]
OUT_FIELDS = ["id", "kind", "of", "at", "unit", "oriented", "signed", "code", "test", "samples", "labels"]


def _names(t): return " or ".join(TYPE_NAMES[c] for c in t)


def sig_text(alts):
    return "; or ".join(", ".join("…" if t == "+" else _names(t) for t in a) for a in alts)


def sig_ok(alts, types):
    for a in alts:
        more = a[-1] == "+"; slots = a[:-1] if more else a
        if len(types) < len(slots) or (not more and len(types) > len(slots)): continue
        if all(t is None or t in slots[min(i, len(slots) - 1)] for i, t in enumerate(types)): return True
    return False


def _errs(P): return sum(1 for x in P if x["level"] == "error")


def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    types, order, sweep = {}, {}, False
    if not L.is_obj(m):
        E("format", "model", "not an object")
    else:
        rest = {k: v for k, v in m.items() if k != "objects"}
        L.walk(rest, MODEL_T, "model", E, W)
        sweep = L.is_obj(m.get("sweep"))
        os_ = m.get("objects")
        if not isinstance(os_, list):
            E("value" if "objects" not in m else "format", "model.objects", "missing" if "objects" not in m else "not an array")
        elif len(os_) > MAX_OBJ: E("size", "model.objects", f"more than {MAX_OBJ} items")
        elif not os_: E("size", "model.objects", "fewer than 1 items")
        else:
            for i, o in enumerate(os_):
                if L.is_obj(o) and L.check_kind("id", o.get("id")) and o["id"] not in order: order[o["id"]] = i
            seen = set()
            for i, o in enumerate(os_):
                p = f"model.objects[{i}]"
                if not L.is_obj(o): E("format", p, "not an object"); continue
                if "id" not in o: E("value", p + ".id", "missing")
                elif not L.check_kind("id", o["id"]): E("value", p + ".id", L.kind_msg("id"))
                elif o["id"] in seen: E("duplicate", p + ".id", f"the object {o['id']} is listed twice")
                if L.check_kind("id", o.get("id")): seen.add(o["id"])
                ks = [k for k in o if k in KINDS]
                for k in o:
                    if k not in KINDS and k not in ("id", "hide", "label", "c", "meta"): W("unknown-field", p + "." + k, "ignored")
                if "hide" in o and not isinstance(o["hide"], bool): E("value", p + ".hide", L.kind_msg("bool"))
                if "label" in o and not L.check_kind("key", o["label"]): E("value", p + ".label", L.kind_msg("key"))
                if "c" in o and o["c"] not in ROLES: E("enum", p + ".c", "one of " + ", ".join(ROLES))
                if not ks: E("kind", p, "needs one construction: " + ", ".join(KIND_NAMES)); continue
                if len(ks) > 1: E("kind", p, "more than one construction: " + ", ".join(ks)); continue
                kind = ks[0]; K = KINDS[kind]; v = o[kind]; q = p + "." + kind; n0 = _errs(P)

                def refT(r, rp, want, i=i):
                    if not L.check_kind("ref", r): E("value", rp, L.kind_msg("ref")); return None
                    if r not in types:
                        if r in order and order[r] >= i: E("cycle", rp, f"refers to {r}, defined after it (objects are built in order)")
                        else: E("ref", rp, "not an object of the construction")
                        return None
                    t = types[r]
                    if t is not None and want and t not in want: E("type", rp, "needs " + _names(want)); return None
                    return t
                got = {}
                if K.get("point"):
                    if isinstance(v, list):
                        if len(v) != 2 or not all(L.is_num(x) for x in v): E("value", q, "needs [x, y] (two numbers) or {x, y}")
                    elif L.is_obj(v): L.walk(v, {"x": "numx!", "y": "numx!"}, q, E, W)
                    else: E("value", q, "needs [x, y] (two numbers) or {x, y}")
                elif "list" in K:
                    if not isinstance(v, list): E("format", q, "not an array")
                    elif len(v) > K["max"]: E("size", q, f"more than {K['max']} items")
                    elif len(v) < K["min"]: E("size", q, f"fewer than {K['min']} items")
                    else: got["list"] = [refT(r, f"{q}[{j}]", K["list"][min(j, len(K["list"]) - 1)]) for j, r in enumerate(v)]
                else:
                    if not L.is_obj(v): E("format", q, "not an object")
                    else:
                        T2 = {f: ("expr" if kd == "pick" else kd) for f, kd in K["T"].items()}
                        L.walk(v, T2, q, E, W)
                        pk = v.get("pick")
                        if "pick" in v and isinstance(pk, str) and pk.strip() != "" and not PICK_RE.fullmatch(pk): E("value", q + ".pick", "index:0–3, near:<id>, far:<id>, other:<id> or continuous")
                        if _errs(P) == n0:
                            for f, want in K.get("R", {}).items():
                                if f not in v: continue
                                if isinstance(want, list): got[f] = [refT(r, f"{q}.{f}[{j}]", want[j]) for j, r in enumerate(v[f])]
                                else: got[f] = refT(v[f], f"{q}.{f}", want)
                            if isinstance(pk, str) and re.match(r"^(near|far|other):", pk): refT(pk.split(":")[1], q + ".pick", "P")
                out = K["out"]
                if _errs(P) == n0 and L.is_obj(v):
                    if kind == "circle":
                        a = "center" in v and "through" in v and "r" not in v and "points" not in v
                        b = "center" in v and "r" in v and "through" not in v and "points" not in v
                        c = "points" in v and "center" not in v and "through" not in v and "r" not in v
                        if not (a or b or c): E("value", q, "needs {center, through}, {center, r} or {points: [A, B, C]}")
                        if L.is_num(v.get("r")) and v["r"] < 0: E("value", q + ".r", "needs a number >= 0")
                    if kind == "conic":
                        a = "points" in v and "foci" not in v and "focus" not in v
                        b = "foci" in v and "through" in v and "points" not in v and "focus" not in v
                        c = "focus" in v and "directrix" in v and "e" in v and "points" not in v and "foci" not in v
                        if not (a or b or c): E("value", q, "needs {points: [5 points]}, {foci: [F1, F2], through, type?} or {focus, directrix, e}")
                        if L.is_num(v.get("e")) and not (v["e"] > 0): E("value", q + ".e", "needs a number > 0")
                    if kind == "transform":
                        alts = TRANSFORM_NEEDS[v["kind"]]
                        if not any(all(f in v for f in fs) for fs in alts): E("value", q, f"{v['kind']} needs " + " or ".join(" and ".join(fs) for fs in alts))
                        else:
                            g = got.get("of")
                            out = None if g is None else transform_out(v["kind"], g)
                            if out is None and g: E("type", q + ".of", f"{v['kind']} cannot map {TYPE_NAMES[g]}")
                    if kind == "locus" and not sweep: E("value", q, "needs model.sweep (the driver of the locus)")
                if _errs(P) > n0: out = None
                if L.check_kind("id", o.get("id")) and o["id"] not in types: types[o["id"]] = out
            if sweep:
                s = m["sweep"].get("samples") or 200
                if L.is_num(s) and s * len(os_) > BUDGET: E("budget", "model.sweep.samples", f"samples × objects is more than {BUDGET}")

    def out_(o, at, E, W):
        for k in o:
            if k not in OUT_FIELDS: W("unknown-field", at + "." + k, "ignored")
        lst = SCALAR_OF if o["kind"] == "scalar" else SERIES_OF if o["kind"] == "series" else ["drawing"]
        if o["of"] not in lst: E("output", at + ".of", f"{o['kind']} outputs of {ID}: {', '.join(lst)}"); return
        if o["kind"] == "scene":
            if "labels" in o and o["labels"] not in ("id", "none"): E("enum", at + ".labels", "one of id, none")
            return
        if o["kind"] == "series" and not sweep: E("value", at + ".of", "a series needs model.sweep"); return
        if "unit" in o and o["unit"] not in ("deg", "rad"): E("enum", at + ".unit", "one of deg, rad")
        for f in ("oriented", "signed"):
            if f in o and not isinstance(o[f], bool): E("value", at + "." + f, L.kind_msg("bool"))
        if "samples" in o and not L.check_kind("int:1:200", o["samples"]): E("value", at + ".samples", L.kind_msg("int:1:200"))
        if o["of"] == "flag":
            if o.get("code") not in CODES: E("enum", at + ".code", "one of " + ", ".join(CODES))
        elif "code" in o: W("unknown-field", at + ".code", "ignored")
        sig, what = None, o["of"]
        if o["of"] in ("always", "residual"):
            if o.get("test") not in ASSERTS: E("enum", at + ".test", "one of " + ", ".join(ASSERTS)); return
            sig = SIGS[o["test"]]; what = o["test"]
        elif "test" in o: W("unknown-field", at + ".test", "ignored")
        if o["of"] == "sweep" or (o["of"] == "flag" and "at" not in o): return
        if o["of"] == "flag": sig = [["PLSRCKGUT"]]
        elif not sig: sig = SIGS[o["of"]]
        if not isinstance(o.get("at"), list): E("value", at + ".at", "missing (the objects it is about)" if "at" not in o else "not an array"); return
        ts, bad = [], False
        for j, r in enumerate(o["at"]):
            if not L.check_kind("ref", r): E("value", f"{at}.at[{j}]", L.kind_msg("ref")); bad = True
            elif r not in types: E("ref", f"{at}.at[{j}]", "not an object of the construction"); bad = True
            else: ts.append(types[r])
        if not bad and not sig_ok(sig, ts): E("type", at + ".at", f"{what} needs {sig_text(sig)}")
        n_obj = len(m["objects"]) if L.is_obj(m) and isinstance(m.get("objects"), list) else 0
        if o["of"] == "always" and (o.get("samples") or 20) * n_obj > BUDGET: E("budget", at + ".samples", f"samples × objects is more than {BUDGET}")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out_, E, W)
    return P


def exprs(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if not L.is_obj(m): return out
    loc = [m["sweep"]["var"]] if L.is_obj(m.get("sweep")) and isinstance(m["sweep"].get("var"), str) else []
    def sx(v, p, l):
        if isinstance(v, str): out.append([v, p, l])
    for i, o in enumerate(m["objects"] if isinstance(m.get("objects"), list) else []):
        if not L.is_obj(o): continue
        p = f"model.objects[{i}]"
        if L.is_obj(o.get("point")): sx(o["point"].get("x"), p + ".point.x", loc); sx(o["point"].get("y"), p + ".point.y", loc)
        if L.is_obj(o.get("pointOn")): sx(o["pointOn"].get("t"), p + ".pointOn.t", loc)
        if L.is_obj(o.get("circle")): sx(o["circle"].get("r"), p + ".circle.r", loc)
        if L.is_obj(o.get("conic")): sx(o["conic"].get("e"), p + ".conic.e", loc)
        if L.is_obj(o.get("transform")):
            t = o["transform"]
            for f in ["dx", "dy", "angle", "factor", "k"]: sx(t.get(f), f"{p}.transform.{f}", loc)
            if isinstance(t.get("m"), list):
                for j, x in enumerate(t["m"]): sx(x, f"{p}.transform.m[{j}]", loc)
    if L.is_obj(m.get("sweep")):
        sx(m["sweep"].get("from"), "model.sweep.from", []); sx(m["sweep"].get("to"), "model.sweep.to", [])
    return out


def keys(spec):
    out, m = [], spec.get("model") if isinstance(spec, dict) else None
    if L.is_obj(m) and isinstance(m.get("objects"), list):
        for i, o in enumerate(m["objects"]):
            if L.is_obj(o) and isinstance(o.get("label"), str): out.append([o["label"], f"model.objects[{i}].label"])
    return out
