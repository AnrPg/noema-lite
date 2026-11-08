"""clinic@1 — the Python twin of src/engines/clinic/clinic.ts (docs/library/clinic.md): check_spec(spec), exprs(spec), keys(spec) give
the same problems (code, path, msg, level) and lists as the JS checkSpec / exprs / keys. It does not compute."""
import enginelib as L

ID = "clinic@1"
CODES = ["normalised", "certain", "approx", "impossible", "incomplete", "range", "unsafe", "no-test-zone"]
SECTIONS = ["ddx", "threshold", "tests", "tree", "markov", "cea", "triage", "vp", "sct", "calib"]
VARS = ["hr", "sbp", "dbp", "map", "spo2", "rr", "lactate", "temp", "volume", "burden", "pao2", "hb", "news2"]
GRADE = ["total", "essential", "timely", "safety", "efficiency", "order", "calib", "critical", "process", "outcome", "lowYield", "closure", "infoEff"]

def _o(t): return {"$obj": t}
def _l(t, mx, mn=None, req=False):
    d = {"$list": t, "max": mx}
    if mn: d["min"] = mn
    if req: d = {"$req": True, **d}
    return d
HYP = {"id": "id!", "prior": "numx!", "mustNotMiss": "bool", "act": "numx", "treatedBy": _l("ref", 10), "key": "key"}
FIND = {"id": "id!", "lik": {"$map": "numx", "max": 31}, "lr": _o({"pos": "numx!", "neg": "numx!"}), "target": "ref", "present": "numx", "group": "ref", "key": "key"}
DDX = {"hypotheses": _l(_o(HYP), 30, 2, True), "findings": _l(_o(FIND), 60), "groups": _l(_o({"id": "id!", "rho": "numx!"}), 20),
       "estimates": _l(_o({"hyp": "ref!", "after": "ref", "p": "numx!"}), 30), "other": "bool", "allowCertain": "bool", "truth": "ref"}
THR = {"benefit": "numx!", "harm": "numx!", "se": "numx", "sp": "numx", "testRisk": "numx", "p": "numx"}
TESTS = {"se1": "numx!", "sp1": "numx!", "se2": "numx!", "sp2": "numx!", "covSe": "numx", "covSp": "numx", "prev": "numx", "cost1": "numx", "cost2": "numx"}
NODE = {"id": "id!", "type": "enum:decision|chance|terminal!", "children": _l(_o({"to": "ref!", "p": "numx", "key": "key"}), 8), "u": "numx", "key": "key"}
TREE = {"root": "ref!", "nodes": _l(_o(NODE), 60, 2, True), "sweep": _o({"name": "name!", "min": "fin!", "max": "fin!", "points": "int:2:200"})}
MARKOV = {"states": _l(_o({"id": "id!", "u": "numx!", "cost": "numx", "alive": "bool", "key": "key"}), 30, 2, True), "P": _l(_l("numx", 30), 30, None, True),
          "start": _l("numx", 30, None, True), "cycles": "int:1:1200!", "discount": "numx", "halfCycle": "bool", "cycleYears": "numx"}
CEA = {"strategies": _l(_o({"id": "id!", "cost": "numx!", "qaly": "numx!", "key": "key"}), 12, 2, True), "wtp": "numx!"}
TRIAGE = {"esi": _o({"lifesaving": "numx", "highRisk": "numx", "confused": "numx", "pain": "numx", "resources": "numx", "hr": "numx", "rr": "numx", "spo2": "numx", "age": "numx"}),
          "news2": _o({"rr": "numx!", "spo2": "numx!", "o2": "numx", "sbp": "numx!", "hr": "numx!", "cvpu": "numx", "temp": "numx!", "scale2": "numx"}),
          "qsofa": _o({"rr": "numx!", "sbp": "numx!", "gcs": "numx!"}), "sirs": _o({"temp": "numx", "hr": "numx", "rr": "numx", "paco2": "numx", "wbc": "numx", "bands": "numx"}),
          "shock": _o({"hr": "numx!", "sbp": "numx!"})}
EFFECT = {"fluid": "numx", "over": "numx", "vaso": "numx", "abx": "numx", "o2": "numx", "stopBleed": "numx", "blood": "numx"}
ACTION = {"id": "id!", "kind": "enum:ask|exam|test|treat|dispose!", "at": "numx!", "cost": "numx", "dur": "numx", "turnaround": "numx", "reveals": _l("ref", 10), "effect": _o(EFFECT),
          "harm": "numx", "essential": "numx", "deadline": "numx", "after": _l("ref", 10), "lowYield": "bool", "key": "key"}
PATIENT = {"weight": "numx", "hb": "numx", "shunt": "numx", "lung": "numx", "bleed": "numx", "sepsis": "numx", "growth": "numx", "volume": "numx"}
VP = {"tEnd": "numx", "patient": _o(PATIENT), "actions": _l(_o(ACTION), 60, 1, True), "noise": "bool", "budget": "numx",
      "weights": _o({"essential": "nonneg", "timely": "nonneg", "safety": "nonneg", "efficiency": "nonneg", "order": "nonneg", "calib": "nonneg"})}
MODEL = {"ddx": _o(DDX), "threshold": _o(THR), "tests": _o(TESTS), "tree": _o(TREE), "markov": _o(MARKOV), "cea": _o(CEA), "triage": _o(TRIAGE),
         "vp": _o(VP), "sct": _o({"panel": _l("nonneg", 7, 2, True), "answer": "numx!"}), "calib": _o({"forecasts": _l(_o({"p": "numx!", "o": "numx!"}), 200, 1, True)})}

def _arr(v): return v if isinstance(v, list) else []
def _ids(l): return [x["id"] for x in _arr(l) if L.is_obj(x) and isinstance(x.get("id"), str)]
def _dups(lst, path, E):
    seen = set()
    for i, x in enumerate(_arr(lst)):
        if L.is_obj(x) and isinstance(x.get("id"), str):
            if x["id"] in seen: E("id", f"{path}[{i}].id", "used twice")
            seen.add(x["id"])
def _spec_names(spec):
    n = list(spec["consts"].keys()) if L.is_obj(spec.get("consts")) else []
    for p in _arr(spec.get("params")):
        if L.is_obj(p) and isinstance(p.get("id"), str): n.append(p["id"])
    return n
def _isstr(v): return isinstance(v, str)

def offered(m):
    S, R, N = [], [], []
    if not L.is_obj(m): return {"scalar": S, "series": R, "scene": N}
    for s in SECTIONS:
        if L.is_obj(m.get(s)):
            S.append(s + ".flags"); S.extend(f"{s}.flag.{c}" for c in CODES)
    d = m.get("ddx")
    if L.is_obj(d):
        hs = _ids(d.get("hypotheses")) + (["other"] if d.get("other") is True else [])
        for h in hs:
            for k in ("post", "prior", "lo", "hi", "over"): S.append(f"ddx.{k}.{h}")
            R.append("ddx.traj." + h)
        S.extend(["ddx.top", "ddx.topP", "ddx.entropy", "ddx.known", "ddx.best"])
        for f in _ids(d.get("findings")): S.append("ddx.gain." + f)
        if len(_arr(d.get("estimates"))): S.extend(["ddx.estErr", "ddx.updateRatio", "ddx.brier"])
        R.append("ddx.step"); N.append("ddx")
    if L.is_obj(m.get("threshold")):
        for k in ("treat", "test", "testTreat", "zone", "evNone", "evTest", "evTreat"): S.append("threshold." + k)
        N.append("threshold")
    if L.is_obj(m.get("tests")):
        for k in ("serialSe", "serialSp", "parallelSe", "parallelSp", "serialCost", "parallelCost", "serialPpv", "serialNpv", "parallelPpv", "parallelNpv"): S.append("tests." + k)
    t = m.get("tree")
    if L.is_obj(t):
        nodes = [nd for nd in _arr(t.get("nodes")) if L.is_obj(nd)]
        S.append("tree.ev")
        for nd in nodes:
            if isinstance(nd.get("id"), str):
                S.append("tree.ev." + nd["id"])
                if nd.get("type") == "decision": S.extend(["tree.choice." + nd["id"], "tree.regret." + nd["id"]])
        if L.is_obj(t.get("sweep")):
            S.append("tree.threshold"); R.append("tree.sweep")
            r = next((nd for nd in nodes if nd.get("id") == t.get("root")), None)
            if r:
                for c in _arr(r.get("children")):
                    if L.is_obj(c) and isinstance(c.get("to"), str): R.append("tree.line." + c["to"])
        N.append("tree")
    mk = m.get("markov")
    if L.is_obj(mk):
        S.extend(["markov.le", "markov.qaly", "markov.cost"]); R.append("markov.cycle")
        for s in _ids(mk.get("states")): S.append("markov.occ." + s); R.append("markov.trace." + s)
    if L.is_obj(m.get("cea")):
        S.append("cea.best")
        for s in _ids(m["cea"].get("strategies")): S.extend(["cea.icer." + s, "cea.nmb." + s, "cea.dominated." + s])
        N.append("cea")
    tg = m.get("triage")
    if L.is_obj(tg):
        if L.is_obj(tg.get("esi")): S.extend(["triage.esi", "triage.dangerZone"])
        if L.is_obj(tg.get("news2")): S.extend(["triage.news2", "triage.news2band"])
        if L.is_obj(tg.get("qsofa")): S.append("triage.qsofa")
        if L.is_obj(tg.get("sirs")): S.append("triage.sirs")
        if L.is_obj(tg.get("shock")): S.append("triage.shock")
    v = m.get("vp")
    if L.is_obj(v):
        R.append("vp.t")
        for x in VARS: R.append("vp." + x); S.append("vp.final." + x)
        S.extend(["vp.min.map", "vp.max.lactate", "vp.timeHypo", "vp.outcome", "vp.diedAt", "vp.cost", "vp.busy"])
        for a in _ids(v.get("actions")): S.extend(["vp.done." + a, "vp.resultAt." + a])
        for g in GRADE: S.append("grade." + g)
        N.append("vp")
    if L.is_obj(m.get("sct")): S.append("sct.credit")
    if L.is_obj(m.get("calib")): S.extend(["calib.brier", "calib.log", "calib.n"])
    return {"scalar": S, "series": R, "scene": N}

def check_spec(spec):
    P, E, W = L.problems()
    m = spec.get("model") if L.is_obj(spec) else None
    L.walk(m, MODEL, "model", E, W)
    if L.is_obj(m):
        if not any(s in m for s in SECTIONS): E("model", "model", "needs at least one of " + ", ".join(SECTIONS))
        d = m.get("ddx")
        if L.is_obj(d):
            _dups(d.get("hypotheses"), "model.ddx.hypotheses", E); _dups(d.get("findings"), "model.ddx.findings", E); _dups(d.get("groups"), "model.ddx.groups", E)
            hs = _ids(d.get("hypotheses")); hsx = hs + (["other"] if d.get("other") is True else []); fs = _ids(d.get("findings")); gs = _ids(d.get("groups"))
            lr_used = False
            for i, f in enumerate(_arr(d.get("findings"))):
                p = f"model.ddx.findings[{i}]"
                if not L.is_obj(f): continue
                if ("lik" not in f) == ("lr" not in f): E("model", p, "needs lik or lr (one of them)")
                if L.is_obj(f.get("lik")):
                    for k in f["lik"]:
                        if k not in hsx: E("ref", f"{p}.lik.{k}", "names no hypothesis")
                if "lr" in f:
                    lr_used = True
                    if not _isstr(f.get("target")): E("value", p + ".target", "missing (the hypothesis lr is about)")
                if _isstr(f.get("target")) and f["target"] not in hs: E("ref", p + ".target", "names no hypothesis")
                if _isstr(f.get("group")) and f["group"] not in gs: E("ref", p + ".group", "names no group")
            if lr_used and len(hsx) > 2: W("approx", "model.ddx.findings", "lr with more than two hypotheses: one-versus-rest approximation (give lik for every hypothesis)")
            for i, e in enumerate(_arr(d.get("estimates"))):
                if not L.is_obj(e): continue
                if _isstr(e.get("hyp")) and e["hyp"] not in hsx: E("ref", f"model.ddx.estimates[{i}].hyp", "names no hypothesis")
                if _isstr(e.get("after")) and e["after"] not in fs: E("ref", f"model.ddx.estimates[{i}].after", "names no finding")
            if _isstr(d.get("truth")) and d["truth"] not in hsx: E("ref", "model.ddx.truth", "names no hypothesis")
        t = m.get("tree")
        if L.is_obj(t) and isinstance(t.get("nodes"), list):
            _dups(t["nodes"], "model.tree.nodes", E)
            ns = _ids(t["nodes"]); by_id = {}
            for nd in _arr(t["nodes"]):
                if L.is_obj(nd) and _isstr(nd.get("id")) and nd["id"] not in by_id: by_id[nd["id"]] = nd
            root = t.get("root")
            if _isstr(root) and root not in ns: E("ref", "model.tree.root", "names no node")
            parents = {}
            for i, nd in enumerate(_arr(t["nodes"])):
                p = f"model.tree.nodes[{i}]"
                if not L.is_obj(nd): continue
                ch = _arr(nd.get("children"))
                if nd.get("type") == "terminal":
                    if "u" not in nd: E("value", p + ".u", "missing (a terminal node needs u)")
                    if len(ch): E("model", p + ".children", "a terminal node has no children")
                elif nd.get("type") in ("decision", "chance") and not len(ch): E("model", p + ".children", "needs at least one branch")
                for j, c in enumerate(ch):
                    if not L.is_obj(c): continue
                    if _isstr(c.get("to")):
                        if c["to"] not in ns: E("ref", f"{p}.children[{j}].to", "names no node")
                        else: parents.setdefault(c["to"], []).append(nd.get("id"))
                    if nd.get("type") == "chance" and "p" not in c: E("value", f"{p}.children[{j}].p", "missing (a chance branch needs p)")
            multi = any(len(v) > 1 for v in parents.values()) or (_isstr(root) and root in parents)
            loop = False
            if not multi and _isstr(root) and root in by_id:
                seen, stack = set(), [root]
                while stack:
                    i_ = stack.pop()
                    if i_ in seen: loop = True; break
                    seen.add(i_); nd = by_id.get(i_)
                    if nd:
                        for c in _arr(nd.get("children")):
                            if L.is_obj(c) and c.get("to") in by_id: stack.append(c["to"])
                if not loop:
                    for i, id_ in enumerate(ns):
                        if id_ not in seen: W("unused", f"model.tree.nodes[{i}]", "not reachable from the root")
            if multi or loop: E("model", "model.tree.nodes", "is not a tree (a node has two parents, or the branches loop back)")
            sw = t.get("sweep")
            if L.is_obj(sw) and _isstr(sw.get("name")) and sw["name"] not in _spec_names(spec): E("ref", "model.tree.sweep.name", "names no const or param of the spec")
            if L.is_obj(sw) and L.is_num(sw.get("min")) and L.is_num(sw.get("max")) and not (sw["min"] < sw["max"]): E("value", "model.tree.sweep", "min must be below max")
        mk = m.get("markov")
        if L.is_obj(mk) and isinstance(mk.get("states"), list):
            _dups(mk["states"], "model.markov.states", E)
            n = len(mk["states"])
            if isinstance(mk.get("P"), list):
                if len(mk["P"]) != n: E("size", "model.markov.P", f"needs {n} rows (one per state)")
                for i, r in enumerate(mk["P"]):
                    if isinstance(r, list) and len(r) != n: E("size", f"model.markov.P[{i}]", f"needs {n} values")
            if isinstance(mk.get("start"), list) and len(mk["start"]) != n: E("size", "model.markov.start", f"needs {n} values")
        if L.is_obj(m.get("cea")): _dups(m["cea"].get("strategies"), "model.cea.strategies", E)
        v = m.get("vp")
        if L.is_obj(v):
            _dups(v.get("actions"), "model.vp.actions", E)
            as_ = _ids(v.get("actions")); fs = _ids(d.get("findings")) if L.is_obj(d) else []
            for i, a in enumerate(_arr(v.get("actions"))):
                if not L.is_obj(a): continue
                for j, r in enumerate(_arr(a.get("reveals"))):
                    if _isstr(r) and r not in fs: E("ref", f"model.vp.actions[{i}].reveals[{j}]", "names no finding of model.ddx")
                for j, r in enumerate(_arr(a.get("after"))):
                    if _isstr(r) and r not in as_: E("ref", f"model.vp.actions[{i}].after[{j}]", "names no action")
        if L.is_obj(d):
            for i, h in enumerate(_arr(d.get("hypotheses"))):
                if L.is_obj(h):
                    for j, r in enumerate(_arr(h.get("treatedBy"))):
                        if _isstr(r) and not (L.is_obj(v) and r in _ids(v.get("actions"))): E("ref", f"model.ddx.hypotheses[{i}].treatedBy[{j}]", "names no action of model.vp")
    off = offered(m)
    def out(o, at, E2, W2):
        for k in o:
            if k not in ("id", "kind", "of"): W2("unknown-field", f"{at}.{k}", "ignored")
        if o["of"] not in off[o["kind"]]: E2("output", at + ".of", f"{o['of']} is not a {o['kind']} of this model (docs/library/clinic.md)")
    L.check_outputs(spec, ID, ["scalar", "series", "scene"], out, E, W)
    return P

REFKEYS = ["id", "type", "root", "to", "target", "group", "key", "kind", "after", "reveals", "hyp", "name", "truth", "treatedBy"]
def _walk_strings(v, path, key_name, out, want_keys):
    if isinstance(v, str):
        if want_keys:
            if key_name == "key": out.append([v, path])
        elif key_name not in REFKEYS: out.append([v, path, []])
    elif isinstance(v, list):
        for i, x in enumerate(v): _walk_strings(x, f"{path}[{i}]", key_name, out, want_keys)
    elif isinstance(v, dict):
        for k in v: _walk_strings(v[k], f"{path}.{k}", k, out, want_keys)

def _collect(spec, want_keys):
    out = []
    if L.is_obj(spec) and L.is_obj(spec.get("model")):
        for s in SECTIONS:
            if s in spec["model"]: _walk_strings(spec["model"][s], "model." + s, s, out, want_keys)
    return out
def exprs(spec): return _collect(spec, False)
def keys(spec): return _collect(spec, True)
