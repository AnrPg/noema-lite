"""field@1 — the Python twin of the checks of src/engines/field/field.js (docs/library/field.md): check_spec(spec), exprs(spec) and
keys(spec) give the same problems (code, path, message, level) and the same lists as the JS checkSpec / exprs / keys
(tests/lib_field.js and tests/enginelib.js compare them on tests/fixtures/enginelib/field.json). It does not simulate."""
import re
import enginelib as L

ID = "field@1"
EQUATIONS = ["heat", "advection", "advdiff", "wave", "rd", "poisson", "ca"]
ADV = ["upwind", "laxwendroff", "laxfriedrichs", "centred", "minmod", "vanleer", "superbee", "mc"]
METHODS = {"heat": ["ftcs", "btcs", "cn", "adi"], "advection": ADV, "advdiff": ADV, "wave": ["leapfrog"], "rd": ["ftcs"], "poisson": ["sor", "gs", "jacobi"], "ca": []}
ALL_METHODS = ["ftcs", "btcs", "cn", "adi"] + ADV + ["leapfrog", "sor", "gs", "jacobi"]
PRESETS = {"grayscott": {"F": 0.04, "k": 0.06}, "fhn": {"a": 0.7, "b": 0.8, "eps": 0.08, "I": 0}, "fisher": {"r": 1}, "schnakenberg": {"a": 0.1, "b": 0.9, "gamma": 1}, "brusselator": {"A": 1, "B": 3}, "custom": {}}
KINETICS = list(PRESETS)
CA_RULES = ["elementary", "life", "gh", "sandpile", "forestfire"]
STATS = ["max", "min", "mean", "total", "energy", "l2"]
CODES = ["unstable", "cfl", "blow-up", "budget", "nan", "grid", "no-converge", "incompatible", "dt-auto", "overshoot", "mass-drift", "cn-oscillation",
         "event-limit", "stopped", "front-not-found", "unknown-steady", "not-turing", "period-not-found", "nine-point-dx", "topple-limit", "kernel"]
SERIES = ["x", "y", "t", "profile", "probe", "stat", "front", "residual", "population", "avalanche", "eventTime"]
SCALARS = ["final", "at", "probe", "eventTime", "eventCount", "frontSpeed", "drift", "cfl", "r", "dtMax", "dt", "gain", "iterations", "residual", "error",
           "wavelength", "turing", "turingK", "turingWavelength", "steps", "population", "density", "cell", "avalancheMean", "avalancheTau", "flag", "ok"]
SCENES = ["heatmap", "spacetime"]
BC_TYPES = ["dirichlet", "neumann", "robin", "periodic"]
SIDES = ["left", "right", "bottom", "top"]

SIDE = {"type": "enum:" + "|".join(BC_TYPES), "value": "numx", "a": "numx", "b": "numx"}
BC = {"$obj": {"all": {"$obj": SIDE}, "left": {"$obj": SIDE}, "right": {"$obj": SIDE}, "bottom": {"$obj": SIDE}, "top": {"$obj": SIDE}}}
SHAPE = {"shape": "enum:point|rect|circle|all!", "x": "numx", "y": "numx", "r": "numx", "x0": "numx", "x1": "numx", "y0": "numx", "y1": "numx"}
CA_T = {"rule": "enum:" + "|".join(CA_RULES) + "!", "code": "int:0:255", "bs": "expr", "states": "int:3:16", "threshold": "int:1:8", "p": "numx", "f": "numx", "density": "numx",
        "init": "enum:random|single|cells", "cells": {"$list": {"$list": "fin", "min": 1, "max": 2}, "max": 2000}, "neighbourhood": "enum:moore|vonneumann", "wrap": "bool",
        "update": "enum:sync|async", "steps": "int:1:5000", "drop": "enum:centre|random", "pile": "int:0:1000000"}
TABLE = {
    "dim": "int:1:2", "grid": {"$req": True, "$obj": {"nx": "int:2:2000!", "ny": "int:2:200", "x0": "numx", "x1": "numx", "y0": "numx", "y1": "numx"}},
    "equation": "enum:" + "|".join(EQUATIONS) + "!", "method": "enum:" + "|".join(ALL_METHODS),
    "D": "numx", "Dv": "numx", "vx": "numx", "vy": "numx", "c": "numx", "damping": "numx",
    "kinetics": "enum:" + "|".join(KINETICS), "kp": {"$map": "numx", "max": 12}, "reaction": {"$map": "expr", "max": 2},
    "init": "numx", "initV": "numx", "noise": {"$obj": {"amp": "numx!", "field": "enum:u|v"}}, "source": "numx",
    "sources": {"$list": {"$obj": dict(SHAPE, rate="numx!")}, "max": 8},
    "obstacles": {"$list": {"$obj": dict(SHAPE, value="numx")}, "max": 8},
    "bc": BC, "bcV": BC, "vars": {"$map": "numx", "max": 12},
    "tEnd": "numx", "dt": "numx", "safety": "unit", "maxSteps": "int:1:200000", "points": "int:2:2000", "frames": "int:2:200", "allowUnstable": "bool", "nine": "bool",
    "probes": {"$list": {"$obj": {"id": "id!", "at": "enum:point|line|area!", "x": "numx", "y": "numx", "x0": "numx", "x1": "numx", "y0": "numx", "y1": "numx", "stat": "enum:mean|max|min|total", "field": "enum:u|v"}}, "max": 8},
    "front": {"$obj": {"level": "numx!", "y": "numx", "field": "enum:u|v"}},
    "events": {"$list": {"$obj": {"id": "id!", "of": "enum:max|min|mean|total|probe|front!", "probe": "id", "field": "enum:u|v", "level": "numx!", "dir": "int:-1:1", "stop": "bool"}}, "max": 8},
    "interrupts": {"$list": {"$obj": {"at": "numx", "on": "id", "set": {"$req": True, "$map": "numx", "max": 12}}}, "max": 8},
    "solver": {"$obj": {"tol": "pos", "maxIter": "int:1:100000", "omega": "numx"}},
    "ca": {"$obj": CA_T},
}
OUT_FIELDS = {"field": "enum:u|v", "t": "numx", "x": "numx", "y": "numx", "probe": "id", "stat": "enum:" + "|".join(STATS), "event": "id", "nth": "int:-2000:2000", "expr": "expr", "norm": "enum:l2|max", "code": "enum:" + "|".join(CODES), "levels": "int:2:5", "contours": "int:0:8"}
LOCAL = ["x", "y", "u", "v"]

def _obj(v): return isinstance(v, dict)
def _list(v): return v if isinstance(v, list) else []
def _objs(v): return [x for x in _list(v) if _obj(x)]
def _ok_name(v): return L.check_kind("name", v)
def _str(v): return isinstance(v, str)
def _int(v): return L._js_int(v)
def _has(o, k): return _obj(o) and k in o
def _nn(o, k): return _obj(o) and o.get(k) is not None   # JS: o[k] != null

def spec_names(spec):
    s = []
    if _obj(spec.get("consts")): s += list(spec["consts"])
    for p in _objs(spec.get("params")):
        if _str(p.get("id")): s.append(p["id"])
    for d in _objs(spec.get("derived")):
        if _str(d.get("id")): s.append(d["id"])
    return s

def var_names(m): return [k for k in m["vars"] if _ok_name(k)] if _obj(m.get("vars")) else []
def kp_names(m):
    k = m.get("kinetics") if _str(m.get("kinetics")) and m.get("kinetics") in PRESETS else None
    a = list(PRESETS[k]) if k else []
    if _obj(m.get("kp")):
        for n in m["kp"]:
            if _ok_name(n) and n not in a: a.append(n)
    return a
def two_fields(m):
    if m.get("equation") != "rd": return False
    if m.get("kinetics") == "custom": return _has(m.get("reaction"), "v")
    return m.get("kinetics") != "fisher" and _str(m.get("kinetics"))

def _check_shape(o, w, dim, E, allow_all):
    sh = o.get("shape")
    if sh == "all":
        if not allow_all: E("shape", w + ".shape", "all is for sources")
        return
    if sh == "point":
        if o.get("x") is None: E("shape", w + ".x", "a point needs x")
        if dim == 2 and o.get("y") is None: E("shape", w + ".y", "a point on a 2-D grid needs y")
    if sh == "rect":
        for k in (["x0", "x1", "y0", "y1"] if dim == 2 else ["x0", "x1"]):
            if o.get(k) is None: E("shape", w + "." + k, "a rect needs x0, x1" + (", y0, y1" if dim == 2 else ""))
    if sh == "circle":
        if dim != 2: E("shape", w + ".shape", "a circle is for a 2-D grid (use rect on a line)")
        else:
            for k in ["x", "y", "r"]:
                if o.get(k) is None: E("shape", w + "." + k, "a circle needs x, y, r")

def check_spec(spec):
    P, E, W = L.problems()
    if not _obj(spec): E("format", "", "not an object"); return P
    m = spec.get("model")
    L.walk(m, TABLE, "model", E, W)
    kinds = ["scalar", "series", "scene"]
    if not _obj(m):
        L.check_outputs(spec, ID, kinds, lambda o, at, E, W: None, E, W); return P
    dim = 2 if m.get("dim") == 2 and not isinstance(m.get("dim"), bool) else 1
    eq = m["equation"] if _str(m.get("equation")) and m.get("equation") in EQUATIONS else None
    g = m.get("grid")
    if dim == 2 and _obj(g) and _int(g.get("nx")) and g["nx"] > 200: E("value", "model.grid.nx", "a 2-D grid has at most 200 × 200 nodes")
    if dim == 1:
        if _obj(g):
            for k in ["ny", "y0", "y1"]:
                if g.get(k) is not None: E("value", "model.grid." + k, "only a 2-D grid (dim 2) has ny, y0, y1")
        for b in ["bc", "bcV"]:
            if _obj(m.get(b)):
                for k in ["bottom", "top"]:
                    if m[b].get(k) is not None: E("bc", f"model.{b}.{k}", "a 1-D grid has only left and right")
        if m.get("vy") is not None: E("value", "model.vy", "only a 2-D grid has vy")
        if m.get("nine") is not None: E("value", "model.nine", "the 9-point Laplacian is for a 2-D grid")
    if eq:
        meth = m["method"] if _str(m.get("method")) else None
        if eq == "ca":
            if meth: E("method", "model.method", "a cellular automaton has no method (model.ca.update)")
        elif meth and meth not in METHODS[eq]: E("method", "model.method", f"{eq} is solved by: {', '.join(METHODS[eq])}")
        if eq == "heat" and dim == 2 and meth in ("btcs", "cn"): E("method", "model.method", "on a 2-D grid the implicit heat step is adi (Peaceman–Rachford)")
        if eq == "heat" and dim == 1 and meth == "adi": E("method", "model.method", "adi is for a 2-D grid (on a line use cn or btcs)")
        def need(k, msg):
            if m.get(k) is None: E("value", "model." + k, msg)
        if eq in ("heat", "advdiff", "rd"): need("D", f"missing ({eq} needs the diffusion coefficient D)")
        if eq in ("advection", "advdiff"): need("vx", "missing (the velocity: vx" + (", vy" if dim == 2 else "") + ")")
        if eq == "wave": need("c", "missing (the wave speed c)")
        if eq == "rd":
            need("kinetics", "missing (" + ", ".join(KINETICS) + ")")
            if m.get("kinetics") == "custom":
                if not _has(m.get("reaction"), "u"): E("value", "model.reaction.u", "missing (custom kinetics: reaction {u, v?})")
            elif m.get("reaction") is not None: E("value", "model.reaction", "only custom kinetics take reaction")
            if _obj(m.get("reaction")):
                for k in m["reaction"]:
                    if k not in ("u", "v"): E("value", "model.reaction." + k, "the fields are u and v")
            if two_fields(m): need("Dv", "missing (the diffusion coefficient of v)")
            if _obj(m.get("kp")) and _str(m.get("kinetics")) and m["kinetics"] != "custom" and m["kinetics"] in PRESETS:
                for k in m["kp"]:
                    if _ok_name(k) and k not in PRESETS[m["kinetics"]]: E("value", "model.kp." + k, f"not a parameter of {m['kinetics']} (its parameters: {', '.join(PRESETS[m['kinetics']])})")
        else:
            for k in ["kinetics", "kp", "reaction", "Dv", "bcV"]:
                if m.get(k) is not None: E("value", "model." + k, "only reaction–diffusion (rd) has " + k)
        if eq == "ca":
            if not _obj(m.get("ca")): E("value", "model.ca", "missing (the automaton: rule, …)")
            else:
                ca = m["ca"]; r = ca.get("rule")
                if r == "elementary":
                    if dim != 1: E("value", "model.dim", "an elementary automaton is 1-D")
                    if ca.get("code") is None: E("value", "model.ca.code", "missing (the Wolfram rule number 0–255)")
                elif _str(r) and r in CA_RULES and dim != 2: E("value", "model.dim", f"the {r} automaton is 2-D")
                if r == "life":
                    if ca.get("bs") is None: E("value", "model.ca.bs", "missing (B/S notation, e.g. B3/S23)")
                    elif _str(ca.get("bs")) and not re.fullmatch(r"B[0-8]*/S[0-8]*", ca["bs"]): E("value", "model.ca.bs", "B/S notation: B then the birth counts, / S then the survival counts (B3/S23)")
                if r == "forestfire":
                    for k in ["p", "f"]:
                        if ca.get(k) is None: E("value", "model.ca." + k, "missing (forest fire: growth p and lightning f)")
                if ca.get("init") == "cells" and ca.get("cells") is None: E("value", "model.ca.cells", "missing (the cells set to 1)")
                for i, c in enumerate(_list(ca.get("cells"))):
                    if isinstance(c, list) and len(c) != dim: E("value", f"model.ca.cells[{i}]", "needs [i, j]" if dim == 2 else "needs [i]")
                if r != "sandpile":
                    for k in ["drop", "pile"]:
                        if ca.get(k) is not None: E("value", "model.ca." + k, "only the sandpile has " + k)
                steps = ca["steps"] if _int(ca.get("steps")) else 100
                nx = g["nx"] if _obj(g) and _int(g.get("nx")) else 2
                ny = (g["ny"] if _obj(g) and _int(g.get("ny")) else nx) if dim == 2 else 1
                if nx * ny * steps > 2e7: E("budget", "model.ca.steps", "cells × steps is more than 20 000 000")
            for k in ["bc", "events", "interrupts", "probes", "front", "tEnd", "dt"]:
                if m.get(k) is not None: E("value", "model." + k, "not for a cellular automaton")
        else:
            if m.get("ca") is not None: E("value", "model.ca", "only a cellular automaton (equation ca) has ca")
            if eq == "poisson":
                for k in ["tEnd", "dt", "events", "interrupts"]:
                    if m.get(k) is not None: E("value", "model." + k, "poisson is solved by iteration, not in time")
            elif m.get("tEnd") is None: E("value", "model.tEnd", "missing")
            if eq != "poisson" and m.get("solver") is not None: E("value", "model.solver", "only poisson iterates")
        if m.get("nine") and not ((eq == "heat" and (not meth or meth == "ftcs")) or eq == "rd"): E("value", "model.nine", "the 9-point Laplacian goes with explicit heat (ftcs) or rd")
        if m.get("initV") is not None and not (eq == "wave" or two_fields(m)): E("value", "model.initV", "only wave (u_t at t = 0) and two-field rd (v) have initV")
        if m.get("damping") is not None and eq != "wave": E("value", "model.damping", "only the wave equation has damping")
    for b in ["bc", "bcV"]:
        if _obj(m.get(b)):
            B = m[b]
            def side(s, B=B): return B[s] if _obj(B.get(s)) else (B["all"] if _obj(B.get("all")) else None)
            def ty(s): sd = side(s); return (sd.get("type") or None) if sd else None
            for p, q in [("left", "right"), ("bottom", "top")]:
                if dim == 1 and p == "bottom": continue
                if (ty(p) == "periodic") != (ty(q) == "periodic"): E("bc", f"model.{b}.{q if ty(p) == 'periodic' else p}", f"periodic goes on both {p} and {q}")
            for s in ["all", "left", "right", "bottom", "top"]:
                if _obj(B.get(s)):
                    o = B[s]
                    if o.get("type") == "robin" and (o.get("a") is None or o.get("b") is None): E("bc", f"model.{b}.{s}", "robin needs a and b (a·u + b·∂u/∂n = value)")
                    if o.get("type") != "robin" and (o.get("a") is not None or o.get("b") is not None): E("bc", f"model.{b}.{s}", "only robin has a and b")
                    if o.get("type") == "periodic" and o.get("value") is not None: E("bc", f"model.{b}.{s}.value", "periodic has no value")
    for i, o in enumerate(_objs(m.get("sources"))): _check_shape(o, f"model.sources[{i}]", dim, E, True)
    for i, o in enumerate(_objs(m.get("obstacles"))): _check_shape(o, f"model.obstacles[{i}]", dim, E, False)
    vn, sn = var_names(m), spec_names(spec)
    for v in vn:
        if v in LOCAL: E("dup-name", "model.vars", f"the name {v} is a name of the field (x, y, u, v)")
        elif v in sn: E("dup-name", "model.vars", f"the name {v} is also a name of the spec (consts, params, derived)")
    two = two_fields(m)
    probes = [p.get("id") for p in _objs(m.get("probes")) if _str(p.get("id"))]
    for i, x in enumerate(probes):
        if probes.index(x) != i: E("dup-name", "model.probes", f"the probe {x} is listed twice")
    for i, p in enumerate(_objs(m.get("probes"))):
        w = f"model.probes[{i}]"
        if p.get("at") == "point":
            if p.get("x") is None: E("shape", w + ".x", "a point needs x")
            if dim == 2 and p.get("y") is None: E("shape", w + ".y", "a point on a 2-D grid needs y")
        elif p.get("at") in ("line", "area"):
            for k in (["x0", "x1", "y0", "y1"] if dim == 2 else ["x0", "x1"]):
                if p.get(k) is None: E("shape", f"{w}.{k}", f"a {p['at']} needs x0, x1" + (", y0, y1" if dim == 2 else ""))
        if p.get("field") == "v" and not two: E("value", w + ".field", "only two-field rd has v")
    if _obj(m.get("front")) and m["front"].get("field") == "v" and not two: E("value", "model.front.field", "only two-field rd has v")
    evs = [e.get("id") for e in _objs(m.get("events")) if _str(e.get("id"))]
    for i, x in enumerate(evs):
        if evs.index(x) != i: E("dup-name", "model.events", f"the event {x} is listed twice")
    for i, e in enumerate(_objs(m.get("events"))):
        w = f"model.events[{i}]"
        if e.get("of") == "probe" and e.get("probe") not in probes: E("event", w + ".probe", "a probe of model.probes")
        if e.get("of") != "probe" and e.get("probe") is not None: E("event", w + ".probe", "goes with of: probe")
        if e.get("of") == "front" and not _obj(m.get("front")): E("event", w + ".of", "needs model.front")
        if e.get("field") == "v" and not two: E("value", w + ".field", "only two-field rd has v")
    for i, it in enumerate(_objs(m.get("interrupts"))):
        w = f"model.interrupts[{i}]"
        if (it.get("at") is None) == (it.get("on") is None): E("event", w, "needs at (a time) or on (an event), not both")
        if it.get("on") is not None and it["on"] not in evs: E("event", w + ".on", "an event of model.events")
        if _obj(it.get("set")):
            for k in it["set"]:
                if _ok_name(k) and k not in vn: E("value", f"{w}.set.{k}", "not a variable of model.vars")

    def out(o, at, E, W):
        of, kd = o.get("of"), o.get("kind")
        known = SERIES if kd == "series" else SCALARS if kd == "scalar" else SCENES
        if of not in known: E("output", at + ".of", f"{ID} computes as a {kd}: {', '.join(known)}"); return
        for f, k in OUT_FIELDS.items():
            if o.get(f) is not None and not L.check_kind(k, o[f]): E("output", at + "." + f, L.kind_msg(k))
        if o.get("field") == "v" and not two: E("output", at + ".field", "only two-field rd has v")
        isCA, isP = eq == "ca", eq == "poisson"
        def need(cond, f, msg):
            if not cond: E("output", at + "." + f, msg)
            return cond
        if of == "y": need(dim == 2, "of", "y is for a 2-D grid")
        if of == "profile" and dim == 2: need((o.get("y") is None) != (o.get("x") is None), "y", "a 2-D profile needs y (a row) or x (a column), one of them")
        if of in ("profile", "heatmap", "at", "final", "error", "probe"):
            if o.get("t") is not None: need(not isP and not isCA, "t", "a time is for an equation in time")
        if of == "probe": need(o.get("probe") in probes, "probe", "a probe of model.probes")
        if (of == "stat" and kd == "series") or of == "final": need(o.get("stat") in STATS, "stat", "one of " + ", ".join(STATS))
        if of in ("stat", "final", "at", "profile", "probe", "front", "frontSpeed", "error", "wavelength"): need(not isCA, "of", "not for a cellular automaton (population, density, avalanche…)")
        if of == "at":
            need(o.get("x") is not None, "x", "needs x")
            if dim == 2: need(o.get("y") is not None, "y", "needs y on a 2-D grid")
        if of in ("eventTime", "eventCount"): need(o.get("event") in evs, "event", "an event of model.events")
        if of == "eventTime" and kd == "scalar": need(_int(o.get("nth")) and o.get("nth") != 0, "nth", "a whole number ±1–2000 (1 the first, −1 the last)")
        if of in ("front", "frontSpeed"): need(_obj(m.get("front")), "of", "needs model.front")
        if of in ("residual", "iterations"): need(isP, "of", "only poisson iterates")
        if of in ("population", "density"): need(isCA, "of", "a cellular automaton only")
        if of == "cell":
            if need(isCA, "of", "a cellular automaton only"):
                need(o.get("x") is not None, "x", "needs x (the column)")
                if dim == 2: need(o.get("y") is not None, "y", "needs y (the row) on a 2-D grid")
        if of in ("avalanche", "avalancheMean", "avalancheTau"): need(isCA and _obj(m.get("ca")) and m["ca"].get("rule") == "sandpile", "of", "the sandpile only")
        if of in ("turing", "turingK", "turingWavelength"): need(two, "of", "two-field reaction–diffusion only")
        if of == "error": need(_str(o.get("expr")) and o["expr"].strip() != "", "expr", "needs the exact solution (an expression over x, y, t)")
        if of == "cfl": need(eq in ("advection", "advdiff", "wave"), "of", "advection, advdiff or wave only")
        if of == "r": need(eq in ("heat", "advdiff", "rd"), "of", "heat, advdiff or rd only")
        if of in ("gain", "dtMax", "dt"): need(not isP and not isCA, "of", "an equation in time only")
        if of == "flag": need(o.get("code") in CODES, "code", "one of " + ", ".join(CODES))
        if of == "heatmap": need(dim == 2, "of", "a heat map is for a 2-D grid (a line: spacetime)")
        if of == "spacetime": need(dim == 1 and eq != "poisson", "of", "a space–time diagram is for a 1-D grid in time")
    L.check_outputs(spec, ID, kinds, out, E, W)
    return P

def exprs(spec):
    out = []
    m = spec.get("model") if _obj(spec) and _obj(spec.get("model")) else None
    if not m: return out
    vn, kp = var_names(m), kp_names(m)
    dim = 2 if m.get("dim") == 2 and not isinstance(m.get("dim"), bool) else 1
    xy = ["x", "y"] if dim == 2 else ["x"]
    tv = vn + ["t"]; field = xy + tv; reac = ["u", "v"] + xy + kp + tv
    def add(v, p, l):
        if _str(v): out.append([v, p, l])
    g = m.get("grid")
    if _obj(g):
        for k in ["x0", "x1", "y0", "y1"]: add(g.get(k), "model.grid." + k, [])
    for k in ["D", "Dv", "c", "damping"]: add(m.get(k), "model." + k, tv)
    for k in ["vx", "vy"]: add(m.get(k), "model." + k, field)
    if _obj(m.get("kp")):
        for k, v in m["kp"].items(): add(v, "model.kp." + k, tv)
    if _obj(m.get("reaction")):
        for k, v in m["reaction"].items(): add(v, "model.reaction." + k, reac)
    add(m.get("init"), "model.init", xy); add(m.get("initV"), "model.initV", xy)
    if _obj(m.get("noise")): add(m["noise"].get("amp"), "model.noise.amp", [])
    add(m.get("source"), "model.source", field)
    for i, o in enumerate(_objs(m.get("sources"))):
        for k in ["x", "y", "r", "x0", "x1", "y0", "y1"]: add(o.get(k), f"model.sources[{i}].{k}", [])
        add(o.get("rate"), f"model.sources[{i}].rate", tv)
    for i, o in enumerate(_objs(m.get("obstacles"))):
        for k in ["x", "y", "r", "x0", "x1", "y0", "y1", "value"]: add(o.get(k), f"model.obstacles[{i}].{k}", [])
    for b in ["bc", "bcV"]:
        if _obj(m.get(b)):
            for s in ["all", "left", "right", "bottom", "top"]:
                if _obj(m[b].get(s)):
                    add(m[b][s].get("value"), f"model.{b}.{s}.value", field); add(m[b][s].get("a"), f"model.{b}.{s}.a", tv); add(m[b][s].get("b"), f"model.{b}.{s}.b", tv)
    if _obj(m.get("vars")):
        for k, v in m["vars"].items(): add(v, "model.vars." + k, [])
    for k in ["tEnd", "dt"]: add(m.get(k), "model." + k, [])
    for i, p in enumerate(_objs(m.get("probes"))):
        for k in ["x", "y", "x0", "x1", "y0", "y1"]: add(p.get(k), f"model.probes[{i}].{k}", [])
    if _obj(m.get("front")): add(m["front"].get("level"), "model.front.level", []); add(m["front"].get("y"), "model.front.y", [])
    for i, e in enumerate(_objs(m.get("events"))): add(e.get("level"), f"model.events[{i}].level", vn)
    for i, it in enumerate(_objs(m.get("interrupts"))):
        add(it.get("at"), f"model.interrupts[{i}].at", [])
        if _obj(it.get("set")):
            for k, v in it["set"].items(): add(v, f"model.interrupts[{i}].set.{k}", tv)
    if _obj(m.get("solver")): add(m["solver"].get("omega"), "model.solver.omega", [])
    if _obj(m.get("ca")):
        for k in ["p", "f", "density"]: add(m["ca"].get(k), "model.ca." + k, [])
    for i, o in enumerate(_list(spec.get("outputs"))):
        if not _obj(o): continue
        for k in ["t", "x", "y"]: add(o.get(k), f"outputs[{i}].{k}", [])
        if o.get("of") == "error": add(o.get("expr"), f"outputs[{i}].expr", xy + ["t"])
    return out

def keys(spec): return []
