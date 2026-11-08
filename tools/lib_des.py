"""des@1 — the Python twin of the checks of src/engines/des/des.js (docs/library/des.md): check_spec(spec), exprs(spec) and keys(spec)
give the same problems (code, path, message, level) and the same lists as the JS checkSpec / exprs / keys (tests/lib_des.js and
tests/enginelib.js compare them on tests/fixtures/enginelib/des.json). It does not simulate."""
import math
import enginelib as L

ID = "des@1"
TIME_UNITS = ["ms", "s", "min", "h", "d", "wk", "yr"]
DIST_KINDS = ["const", "exp", "uniform", "tri", "normal", "lognormal", "gamma", "erlang", "weibull", "beta", "empirical", "discrete"]
DIST_NEEDS = {"const": ["value"], "uniform": ["min", "max"], "tri": ["min", "mode", "max"], "normal": ["mean", "sd"], "lognormal": ["mean", "sd"], "erlang": ["k", "mean"],
              "weibull": ["shape", "scale"], "beta": ["a", "b"], "empirical": ["values"], "discrete": ["values"]}
DIST_NUM = ["value", "mean", "rate", "sd", "cv", "min", "max", "mode", "k", "shape", "scale", "a", "b"]
LOCALS = ["prio", "cls", "visits", "waited", "now"]
LOG_KINDS = ["arrive", "start", "depart", "exit", "balk", "renege", "lost", "preempt", "jockey", "fail", "repair", "shift", "route"]
CODES = ["budget", "zeno", "overflow", "bad-dist", "clipped", "no-arrivals", "route-sum", "route-none", "few-reps", "warmup-short",
         "batch-correlated", "unstable", "theory-na", "theory-approx", "little", "model"]
MEASURES = ["wq", "w", "lq", "l", "util", "busy", "down", "throughput", "served", "arrived", "balked", "reneged", "lost", "preempted", "jockeyed", "pwait", "maxq", "littleErr", "pAbandon"]
STATION_ONLY = ["util", "busy", "down", "maxq", "preempted", "jockeyed"]
CLASSABLE = ["wq", "w", "lq", "l", "served", "throughput", "pwait", "arrived"]
THEORY = ["wq", "w", "lq", "l", "util", "pwait", "rho"]
ESTS = ["mean", "half", "lo", "hi", "sd", "n"]
SCALARS = MEASURES + ["theory", "covers", "warmupT", "events", "reps", "flag", "ok"]
SERIES = ["t", "qlen", "inSystem", "busySeries", "repValues", "waits", "logT", "logKind", "logEntity", "logStation"]
SCENES = ["network", "gantt", "log"]

DIST = {"dist": "enum:" + "|".join(DIST_KINDS) + "!", "value": "numx", "mean": "numx", "rate": "numx", "sd": "numx", "cv": "numx", "min": "numx", "max": "numx", "mode": "numx",
        "k": "numx", "shape": "numx", "scale": "numx", "a": "numx", "b": "numx", "values": {"$list": "numx", "min": 1, "max": 100}, "probs": {"$list": "numx", "max": 100}}
D = {"$obj": DIST}
CLASS = {"id": "name!", "prio": "int:0:9", "key": "key"}
SOURCE = {"id": "id!", "to": "ref", "shortest": {"$list": "ref", "min": 2, "max": 8}, "class": "name", "mix": {"$map": "numx", "max": 8}, "arrival": D, "schedule": {"$list": "numx", "max": 500},
          "rates": {"$list": {"$list": "numx", "min": 2, "max": 2}, "max": 48}, "period": "numx", "batch": D, "start": "numx", "stop": "numx", "limit": "int:1:100000", "key": "key"}
ROUTE = {"to": "ref", "shortest": {"$list": "ref", "min": 2, "max": 8}, "p": "numx", "when": "expr"}
STATION = {"id": "id!", "kind": "enum:server|delay", "servers": "numx", "service": D, "serviceBy": {"$map": D, "max": 8}, "discipline": "enum:fifo|lifo|priority|spt",
           "capacity": "int:0:100000", "preempt": "enum:none|resume|restart|resample", "balk": {"$obj": {"length": "int:0:100000!", "p": "numx"}}, "renege": D, "jockey": "bool",
           "shifts": {"$obj": {"period": "numx!", "plan": {"$req": True, "$list": {"$obj": {"from": "numx!", "to": "numx!", "servers": "int:0:64!"}}, "min": 1, "max": 24}}},
           "breakdowns": {"$obj": {"ttf": {"$req": True, "$obj": DIST}, "ttr": {"$req": True, "$obj": DIST}, "policy": "enum:resume|restart|resample"}},
           "route": {"$list": {"$obj": ROUTE}, "max": 16}, "key": "key"}
TABLE = {
    "tEnd": "numx!", "unit": "enum:" + "|".join(TIME_UNITS), "warmup": "numx", "reps": "int:1:200", "seed": "int:0:1000000", "maxEvents": "int:1000:200000",
    "analysis": {"$obj": {"method": "enum:reps|batch", "batches": "int:5:100", "level": "unit", "warmup": "enum:fixed|mser5", "antithetic": "bool"}},
    "classes": {"$list": {"$obj": CLASS}, "max": 8},
    "sources": {"$req": True, "$list": {"$obj": SOURCE}, "min": 1, "max": 8},
    "stations": {"$req": True, "$list": {"$obj": STATION}, "min": 1, "max": 16},
    "points": "int:2:2000", "logCap": "int:0:2000",
}

def _obj(v): return isinstance(v, dict)
def _list(v): return v if isinstance(v, list) else []
def _objs(v): return [x for x in _list(v) if _obj(x)]
def _ok_name(v): return L.check_kind("name", v)
def _ok_id(v): return L.check_kind("id", v)
def _num(v): return L.is_num(v)
def _str(v): return isinstance(v, str)
def _nn(o, k): return _obj(o) and o.get(k) is not None   # JS: o[k] != null

def spec_names(spec):
    s = []
    if _obj(spec.get("consts")): s += list(spec["consts"])
    for p in _objs(spec.get("params")):
        if _str(p.get("id")): s.append(p["id"])
    for d in _objs(spec.get("derived")):
        if _str(d.get("id")): s.append(d["id"])
    return s

def names(m):
    return {"stations": [s.get("id") for s in _objs(m.get("stations")) if _ok_id(s.get("id"))],
            "sources": [s.get("id") for s in _objs(m.get("sources")) if _ok_id(s.get("id"))],
            "classes": [c.get("id") for c in _objs(m.get("classes")) if _ok_name(c.get("id"))]}

def check_dist(d, p, E):
    if not _obj(d) or not _str(d.get("dist")) or d["dist"] not in DIST_KINDS: return
    k = d["dist"]
    if k == "exp":
        if ("mean" in d) == ("rate" in d): E("dist", p, "exp needs mean or rate (one of them)")
    elif k == "gamma":
        if not (("shape" in d and "scale" in d) or ("mean" in d and "cv" in d)): E("dist", p, "gamma needs shape and scale, or mean and cv")
    else:
        for f in DIST_NEEDS[k]:
            if f not in d: E("dist", p + "." + f, f"{k} needs {', '.join(DIST_NEEDS[k])}")
    if k in ("empirical", "discrete") and isinstance(d.get("probs"), list) and isinstance(d.get("values"), list) and len(d["probs"]) != len(d["values"]): E("dist", p + ".probs", "one weight per value")
    if k == "exp" and ((_num(d.get("mean")) and not d["mean"] > 0) or (_num(d.get("rate")) and not d["rate"] > 0)): E("dist", p, "needs a mean > 0")
    if k == "uniform" and _num(d.get("min")) and _num(d.get("max")) and not (d["min"] >= 0 and d["max"] >= d["min"]): E("dist", p, "needs 0 ≤ min ≤ max")
    if k == "tri" and _num(d.get("min")) and _num(d.get("mode")) and _num(d.get("max")) and not (d["min"] >= 0 and d["min"] <= d["mode"] <= d["max"] and d["min"] < d["max"]): E("dist", p, "needs 0 ≤ min ≤ mode ≤ max, min < max")

def reachable(m, st):
    seen, stack = set(), []
    def push(i):
        if i in st and i not in seen: seen.add(i); stack.append(i)
    for s in _objs(m.get("sources")):
        if _str(s.get("to")): push(s["to"])
        for x in _list(s.get("shortest")): push(x)
    by_id = {}
    for s in _objs(m.get("stations")):
        if _ok_id(s.get("id")): by_id[s["id"]] = s
    while stack:
        s = by_id.get(stack.pop())
        if not s: continue
        for r in _objs(s.get("route")):
            if _str(r.get("to")): push(r["to"])
            for x in _list(r.get("shortest")): push(x)
    return seen

def check_spec(spec):
    P, E, W = L.problems()
    if not _obj(spec): E("format", "", "not an object"); return P
    m = spec.get("model")
    L.walk(m, TABLE, "model", E, W)
    if not _obj(m):
        L.check_outputs(spec, ID, ["scalar", "series", "scene"], lambda o, at, E, W: None, E, W); return P
    N, sn = names(m), spec_names(spec)
    seen = set()
    for w, arr in (("stations", _objs(m.get("stations"))), ("sources", _objs(m.get("sources")))):
        for i, x in enumerate(arr):
            if not _ok_id(x.get("id")): continue
            if x["id"] == "exit": E("value", f"model.{w}[{i}].id", "exit is the name of the way out")
            elif x["id"] in seen: E("dup-name", f"model.{w}[{i}].id", f"the id {x['id']} is used twice")
            seen.add(x["id"])
    cseen = set()
    for i, c in enumerate(_objs(m.get("classes"))):
        if not _ok_name(c.get("id")): continue
        cid = c["id"]
        if cid in cseen: E("dup-name", f"model.classes[{i}].id", f"the class {cid} is listed twice")
        elif cid in LOCALS: E("dup-name", f"model.classes[{i}].id", f"the class {cid} is a name des@1 gives ({', '.join(LOCALS)})")
        elif cid in sn: E("dup-name", f"model.classes[{i}].id", f"the class {cid} is also a name of the spec (consts, params, derived)")
        cseen.add(cid)
    is_st = lambda v: _str(v) and v in N["stations"]
    is_cl = lambda v: _str(v) and v in N["classes"]
    groups = []
    for i, s in enumerate(_objs(m.get("sources"))):
        w = f"model.sources[{i}]"
        if len([k for k in ("arrival", "schedule", "rates") if _nn(s, k)]) != 1: E("value", w, "needs one of arrival, schedule or rates")
        if _nn(s, "period") and not _nn(s, "rates"): E("value", w + ".period", "goes with rates")
        if (not _nn(s, "to")) == (not _nn(s, "shortest")): E("value", w, "needs to (a station) or shortest (stations)")
        if _str(s.get("to")) and _ok_id(s["to"]) and not is_st(s["to"]): E("value", w + ".to", "not a station")
        for j, x in enumerate(_list(s.get("shortest"))):
            if _str(x) and _ok_id(x) and not is_st(x): E("value", f"{w}.shortest[{j}]", "not a station")
        if isinstance(s.get("shortest"), list): groups.append(s["shortest"])
        if _nn(s, "class") and _ok_name(s["class"]) and not is_cl(s["class"]): E("value", w + ".class", "not a class")
        if _obj(s.get("mix")):
            for k in s["mix"]:
                if _ok_name(k) and not is_cl(k): E("value", f"{w}.mix.{k}", "not a class")
        if _nn(s, "class") and _nn(s, "mix"): E("value", w + ".mix", "class or mix, not both")
        check_dist(s.get("arrival"), w + ".arrival", E); check_dist(s.get("batch"), w + ".batch", E)
    for i, s in enumerate(_objs(m.get("stations"))):
        w = f"model.stations[{i}]"
        kind = "delay" if s.get("kind") == "delay" else "server"
        if kind == "delay":
            for f in ["servers", "discipline", "capacity", "preempt", "balk", "renege", "jockey", "shifts", "breakdowns"]:
                if _nn(s, f): E("value", f"{w}.{f}", "a delay station has no queue or servers")
        if _obj(s.get("serviceBy")):
            if not N["classes"]: E("value", w + ".serviceBy", "needs model.classes")
            for k, v in s["serviceBy"].items():
                if _ok_name(k) and not is_cl(k): E("value", f"{w}.serviceBy.{k}", "not a class")
                check_dist(v, f"{w}.serviceBy.{k}", E)
        if not _nn(s, "service"):
            if not _obj(s.get("serviceBy")): E("value", w + ".service", "missing")
            else:
                for c in N["classes"]:
                    if c not in s["serviceBy"]: E("value", w + ".serviceBy", f"the class {c} has no service time (add it or a service)")
        check_dist(s.get("service"), w + ".service", E); check_dist(s.get("renege"), w + ".renege", E)
        if _obj(s.get("breakdowns")):
            check_dist(s["breakdowns"].get("ttf"), w + ".breakdowns.ttf", E); check_dist(s["breakdowns"].get("ttr"), w + ".breakdowns.ttr", E)
        if _str(s.get("preempt")) and s["preempt"] != "none" and s.get("discipline") != "priority": E("value", w + ".preempt", "pre-emption needs discipline priority")
        if s.get("discipline") == "priority" and not N["classes"]: W("value", w + ".discipline", "priority needs model.classes (one class: FIFO)")
        if _obj(s.get("balk")) and _num(s["balk"].get("p")) and not (0 <= s["balk"]["p"] <= 1): E("value", w + ".balk.p", "needs a number from 0 to 1")
        if _obj(s.get("shifts")):
            per, iv = s["shifts"].get("period"), []
            for j, x in enumerate(_objs(s["shifts"].get("plan"))):
                if not _num(x.get("from")) or not _num(x.get("to")): continue
                if not (x["from"] >= 0 and x["from"] < x["to"]): E("value", f"{w}.shifts.plan[{j}]", "needs 0 ≤ from < to"); continue
                if _num(per) and x["to"] > per: E("value", f"{w}.shifts.plan[{j}].to", "after the period"); continue
                if any(x["from"] < b and a < x["to"] for a, b in iv): E("value", f"{w}.shifts.plan[{j}]", "overlaps another shift"); continue
                iv.append((x["from"], x["to"]))
            if _num(per) and not per > 0: E("value", w + ".shifts.period", "needs a number > 0")
        rs = _objs(s.get("route"))
        for j, r in enumerate(rs):
            rw = f"{w}.route[{j}]"
            if (not _nn(r, "to")) == (not _nn(r, "shortest")): E("route", rw, "needs to (a station or exit) or shortest (stations)")
            if _str(r.get("to")) and _ok_id(r["to"]) and r["to"] != "exit" and not is_st(r["to"]): E("route", rw + ".to", "not a station (or exit)")
            for k, x in enumerate(_list(r.get("shortest"))):
                if _str(x) and _ok_id(x) and not is_st(x): E("route", f"{rw}.shortest[{k}]", "not a station")
            if isinstance(r.get("shortest"), list): groups.append(r["shortest"])
            if _nn(r, "p") and _nn(r, "when"): E("route", rw, "p or when, not both")
            if _num(r.get("p")) and r["p"] < 0: E("route", rw + ".p", "needs a number >= 0")
        with_p = len([r for r in rs if _nn(r, "p")])
        if with_p and with_p != len(rs): E("route", w + ".route", "either every way has p (probabilistic) or none (by condition)")
        if with_p and all(_num(r.get("p")) for r in rs) and sum(r["p"] for r in rs) > 1 + 1e-9: E("route", w + ".route", "the probabilities add up to more than 1")
    for i, s in enumerate(_objs(m.get("stations"))):
        if s.get("jockey") is True and _ok_id(s.get("id")) and not any(s["id"] in g for g in groups):
            E("value", f"model.stations[{i}].jockey", "jockeying needs the station in a shortest group (a source or route with shortest)")
    an = m["analysis"] if _obj(m.get("analysis")) else {}
    if an.get("method") == "batch" and _num(m.get("reps")) and m["reps"] > 1: E("value", "model.reps", "batch means use one long run (reps 1)")
    if _num(m.get("tEnd")) and not m["tEnd"] > 0: E("value", "model.tEnd", "needs a number > 0")
    if _num(m.get("warmup")) and _num(m.get("tEnd")) and not (m["warmup"] >= 0 and m["warmup"] < m["tEnd"]): E("value", "model.warmup", "must be from 0 to before tEnd")
    if _nn(m, "warmup") and an.get("warmup") == "mser5": W("unknown-field", "model.warmup", "mser5 finds the warm-up: model.warmup is ignored")
    reach = reachable(m, N["stations"])
    for i, s in enumerate(_objs(m.get("stations"))):
        if _ok_id(s.get("id")) and s["id"] in N["stations"] and s["id"] not in reach: W("unreachable", f"model.stations[{i}]", "no entity can reach this station")

    def out(o, at, E2, W2):
        def need(cond, f, msg):
            if not cond: E2("output", at + "." + f, msg)
            return cond
        of, kd = o["of"], o["kind"]
        known = SERIES if kd == "series" else SCALARS if kd == "scalar" else SCENES
        if of not in known: E2("output", at + ".of", f"{ID} computes as a {kd}: {', '.join(known)}"); return
        if _nn(o, "station"): need(is_st(o["station"]), "station", "a station of the model")
        if _nn(o, "class"): need(is_cl(o["class"]), "class", "a class of the model")
        meas = o.get("measure") if of in ("theory", "covers", "repValues") else of
        if of in ("theory", "covers"): need(o.get("measure") in THEORY, "measure", "one of " + ", ".join(THEORY))
        if of == "repValues": need(o.get("measure") in MEASURES, "measure", "one of " + ", ".join(MEASURES))
        if (meas in STATION_ONLY or of in ("qlen", "busySeries") or meas == "util") and not _nn(o, "station"): need(False, "station", "needs a station")
        if _nn(o, "class") and meas in MEASURES + THEORY and meas not in CLASSABLE: E2("output", at + ".class", f"{meas} is not computed per class")
        if _nn(o, "est"): need(o["est"] in ESTS, "est", "one of " + ", ".join(ESTS))
        if of == "flag": need(o.get("code") in CODES, "code", "one of " + ", ".join(CODES))
        if of == "gantt" and _nn(o, "window"): need(L.check_kind("numx", o["window"]), "window", "needs a number or an expression")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P

def _dist_exprs(d, p, out):
    if not _obj(d): return
    for f in DIST_NUM:
        if _str(d.get(f)): out.append([d[f], f"{p}.{f}", []])
    for i, v in enumerate(_list(d.get("values"))):
        if _str(v): out.append([v, f"{p}.values[{i}]", []])
    for i, v in enumerate(_list(d.get("probs"))):
        if _str(v): out.append([v, f"{p}.probs[{i}]", []])

def exprs(spec):
    out = []
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): return out
    def add(v, p, l=None):
        if _str(v): out.append([v, p, l or []])
    add(m.get("tEnd"), "model.tEnd"); add(m.get("warmup"), "model.warmup")
    loc = LOCALS + names(m)["classes"]
    for i, s in enumerate(_objs(m.get("sources"))):
        w = f"model.sources[{i}]"
        if _obj(s.get("mix")):
            for k, v in s["mix"].items(): add(v, f"{w}.mix.{k}")
        _dist_exprs(s.get("arrival"), w + ".arrival", out)
        for j, v in enumerate(_list(s.get("schedule"))): add(v, f"{w}.schedule[{j}]")
        for j, r in enumerate(_list(s.get("rates"))):
            for k, v in enumerate(_list(r)): add(v, f"{w}.rates[{j}][{k}]")
        add(s.get("period"), w + ".period"); _dist_exprs(s.get("batch"), w + ".batch", out); add(s.get("start"), w + ".start"); add(s.get("stop"), w + ".stop")
    for i, s in enumerate(_objs(m.get("stations"))):
        w = f"model.stations[{i}]"
        add(s.get("servers"), w + ".servers")
        _dist_exprs(s.get("service"), w + ".service", out)
        if _obj(s.get("serviceBy")):
            for k, d in s["serviceBy"].items(): _dist_exprs(d, f"{w}.serviceBy.{k}", out)
        if _obj(s.get("balk")): add(s["balk"].get("p"), w + ".balk.p")
        _dist_exprs(s.get("renege"), w + ".renege", out)
        if _obj(s.get("shifts")):
            add(s["shifts"].get("period"), w + ".shifts.period")
            for j, x in enumerate(_objs(s["shifts"].get("plan"))): add(x.get("from"), f"{w}.shifts.plan[{j}].from"); add(x.get("to"), f"{w}.shifts.plan[{j}].to")
        if _obj(s.get("breakdowns")):
            _dist_exprs(s["breakdowns"].get("ttf"), w + ".breakdowns.ttf", out); _dist_exprs(s["breakdowns"].get("ttr"), w + ".breakdowns.ttr", out)
        for j, r in enumerate(_objs(s.get("route"))): add(r.get("p"), f"{w}.route[{j}].p"); add(r.get("when"), f"{w}.route[{j}].when", loc)
    for i, o in enumerate(_list(spec.get("outputs"))):
        if _obj(o) and o.get("of") == "gantt": add(o.get("window"), f"outputs[{i}].window")
    return out

def keys(spec):
    out = []
    m = spec.get("model") if _obj(spec) else None
    if not _obj(m): return out
    for i, c in enumerate(_objs(m.get("classes"))):
        if _str(c.get("key")): out.append([c["key"], f"model.classes[{i}].key"])
    for i, s in enumerate(_objs(m.get("sources"))):
        if _str(s.get("key")): out.append([s["key"], f"model.sources[{i}].key"])
    for i, s in enumerate(_objs(m.get("stations"))):
        if _str(s.get("key")): out.append([s["key"], f"model.stations[{i}].key"])
    return out
